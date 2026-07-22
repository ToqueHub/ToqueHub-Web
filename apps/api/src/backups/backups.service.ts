import { BadRequestException, ConflictException, ForbiddenException, Injectable, InternalServerErrorException, NotFoundException, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { access, cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { PrismaService } from '../prisma/prisma.service';
import type { SystemService } from '../system/system.service';
import type { BackupScheduleDto, RestoreBackupDto } from './dto/backups.dto';
import { BackupCloudService } from './cloud/backup-cloud.service';

const execFileAsync = promisify(execFile);
const CONFIRMATION_PHRASE = 'RESTAURER TOQUEHUB';
const BACKUP_PREFIX = 'toquehub-backup-';
const BACKUP_EXT = '.tar.gz';
const AUTH_SESSION_EPOCH_KEY = 'auth.session-epoch';
const POSTGRES_TOOL_VERSIONS = ['18', '17', '16', '15', '14', '13'];
const DEFAULT_SCHEDULE: BackupSchedule = {
  enabled: false,
  frequency: 'daily',
  time: '02:00',
  weekday: 1,
  retentionDays: Number(process.env.BACKUP_RETENTION_DAYS || 14),
  lastRunAt: null,
};

function normalizeRestorePhrase(value?: string) {
  return value?.trim().replace(/\s+/g, ' ').toUpperCase();
}

type BackupMode = 'manual' | 'scheduled';
type BackupOperation = 'backup' | 'restore' | null;

interface BackupSchedule {
  enabled: boolean;
  frequency: 'daily' | 'weekly';
  time: string;
  weekday: number;
  retentionDays: number;
  lastRunAt: string | null;
}

interface BackupManifest {
  format: 'toquehub-backup';
  version: 1;
  createdAt: string;
  createdBy: string | null;
  mode: BackupMode;
  app: {
    name: 'toquehub';
    packageVersion: string;
  };
  database: {
    provider: 'postgresql';
    dump: string;
    checksumSha256: string;
    sizeBytes: number;
  };
  files: {
    roots: Array<{
      key: string;
      envVar: string;
      archivePath: string;
      targetPath: string;
      sizeBytes: number;
      fileCount: number;
    }>;
    totalSizeBytes: number;
    totalFileCount: number;
  };
  excluded: string[];
}

interface BackupSummary {
  id: string;
  filename: string;
  createdAt: string | null;
  sizeBytes: number;
  mode?: BackupMode;
  manifest?: BackupManifest;
}

interface UploadInspection {
  uploadId: string;
  filename: string;
  sizeBytes: number;
  manifest: BackupManifest;
}

@Injectable()
export class BackupsService implements OnModuleInit, OnModuleDestroy {
  private currentOperation: BackupOperation = null;
  private scheduleTimer?: NodeJS.Timeout;
  private readonly backupDir = resolve(process.env.BACKUP_DIR || 'backups');
  private readonly importsDir = join(this.backupDir, 'imports');
  private readonly tmpDir = join(this.backupDir, '.tmp');
  private readonly scheduleFile = join(this.backupDir, 'backup-schedule.json');
  private readonly pgDumpPath = this.resolveToolPath('PG_DUMP_PATH', 'pg_dump');
  private readonly pgRestorePath = this.resolveToolPath('PG_RESTORE_PATH', 'pg_restore');
  private readonly tarPath = this.resolveToolPath('TAR_PATH', 'tar');

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly backupCloudService?: BackupCloudService,
  ) {}

  async onModuleInit() {
    await this.ensureBackupDirs();
    this.scheduleTimer = setInterval(() => void this.runScheduledBackupIfDue(), 60_000);
    this.scheduleTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.scheduleTimer) clearInterval(this.scheduleTimer);
  }

  assertBootstrapRestoreAllowed(status: Awaited<ReturnType<SystemService['getStatus']>>) {
    if (status.initialized || status.hasAdmin || status.hasOrganization) {
      throw new ForbiddenException('La restauration premier démarrage est disponible uniquement avant initialisation.');
    }
  }

  async listBackups() {
    await this.ensureBackupDirs();
    const files = await readdir(this.backupDir).catch(() => []);
    const backups = await Promise.all(
      files
        .filter((file) => file.startsWith(BACKUP_PREFIX) && file.endsWith(BACKUP_EXT))
        .map((file) => this.backupSummaryFromFile(file)),
    );
    const tools = await this.getToolsStatus();
    return {
      backups: backups.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
      operation: this.currentOperation,
      tools,
    };
  }

  async createBackup({ userId, organizationId, mode }: { userId?: string | null; organizationId?: string | null; mode: BackupMode }) {
    return this.withLock('backup', async () => {
      await this.ensureBackupDirs();
      await this.assertRequiredTools(['pg_dump', 'tar']);

      const createdAt = new Date();
      const id = `${BACKUP_PREFIX}${this.timestamp(createdAt)}`;
      const workDir = join(this.tmpDir, id);
      const archivePath = join(this.backupDir, `${id}${BACKUP_EXT}`);
      const dumpPath = join(workDir, 'database.dump');

      await rm(workDir, { recursive: true, force: true });
      await mkdir(workDir, { recursive: true });

      try {
        await this.runCommand(this.pgDumpPath, ['--format=custom', '--no-owner', '--no-privileges', '--file', dumpPath, this.postgresToolDatabaseUrl()]);
        const uploadRoots = await this.copyUploadRoots(workDir);
        const dumpStat = await stat(dumpPath);
        const manifest: BackupManifest = {
          format: 'toquehub-backup',
          version: 1,
          createdAt: createdAt.toISOString(),
          createdBy: userId ?? null,
          mode,
          app: {
            name: 'toquehub',
            packageVersion: await this.readPackageVersion(),
          },
          database: {
            provider: 'postgresql',
            dump: 'database.dump',
            checksumSha256: await this.sha256File(dumpPath),
            sizeBytes: dumpStat.size,
          },
          files: {
            roots: uploadRoots,
            totalSizeBytes: uploadRoots.reduce((sum, root) => sum + root.sizeBytes, 0),
            totalFileCount: uploadRoots.reduce((sum, root) => sum + root.fileCount, 0),
          },
          excluded: ['.env', 'node_modules', 'dist', 'logs', 'code applicatif', 'secrets'],
        };
        await writeFile(join(workDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
        await this.runCommand(this.tarPath, ['-czf', archivePath, '-C', workDir, '.']);
        const schedule = await this.getSchedule();
        const archiveStat = await stat(archivePath);
        const backupOrganizationId = organizationId ?? await this.defaultBackupOrganizationId();
        if (backupOrganizationId && this.backupCloudService) {
          await this.backupCloudService.replicateBackup({
            organizationId: backupOrganizationId,
            backupId: id,
            filename: `${id}${BACKUP_EXT}`,
            absolutePath: archivePath,
            sizeBytes: archiveStat.size,
            checksumSha256: await this.sha256File(archivePath),
          }, schedule.retentionDays).catch((err) => {
            console.error('Backup cloud replication hook failed', err);
          });
        }
        await this.applyRetention(schedule);
        return this.backupSummaryFromFile(`${id}${BACKUP_EXT}`);
      } finally {
        await rm(workDir, { recursive: true, force: true });
      }
    });
  }

  async getBackupForDownload(id: string) {
    const backup = await this.resolveLocalBackup(id);
    return { absolutePath: backup.absolutePath, filename: backup.filename };
  }

  async sendLocalBackupToGoogleDrive(id: string, organizationId?: string | null) {
    if (!this.backupCloudService) throw new BadRequestException('Sauvegarde cloud indisponible.');
    const backup = await this.resolveLocalBackup(id);
    const backupStat = await stat(backup.absolutePath);
    const schedule = await this.getSchedule();
    const backupOrganizationId = organizationId ?? await this.defaultBackupOrganizationId();
    if (!backupOrganizationId) throw new BadRequestException('Organisation introuvable pour cette sauvegarde.');
    const connection = await this.backupCloudService.replicateBackupToGoogleDrive({
      organizationId: backupOrganizationId,
      backupId: backup.id,
      filename: backup.filename,
      absolutePath: backup.absolutePath,
      sizeBytes: backupStat.size,
      checksumSha256: await this.sha256File(backup.absolutePath),
    }, schedule.retentionDays);
    return {
      ok: true,
      message: 'Sauvegarde envoyée vers Google Drive.',
      connection,
      backup: await this.backupSummaryFromFile(backup.filename),
    };
  }

  async inspectUploadedArchive(file: any): Promise<UploadInspection> {
    await this.ensureBackupDirs();
    if (!file?.path) throw new BadRequestException('Archive de sauvegarde manquante.');
    const uploadId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const safeName = `${uploadId}${BACKUP_EXT}`;
    const storedPath = join(this.importsDir, safeName);
    await rename(file.path, storedPath);
    const inspected = await this.inspectArchive(storedPath);
    await rm(inspected.extractDir, { recursive: true, force: true });
    return {
      uploadId,
      filename: file.originalname || safeName,
      sizeBytes: inspected.sizeBytes,
      manifest: inspected.manifest,
    };
  }

  async restoreLocalBackup(id: string, dto: RestoreBackupDto) {
    this.assertConfirmation(dto.confirmationPhrase);
    const backup = await this.resolveLocalBackup(id);
    return this.restoreArchive(backup.absolutePath);
  }

  async restoreUploadedArchive(dto: RestoreBackupDto, file?: any) {
    this.assertConfirmation(dto.confirmationPhrase);
    let archivePath: string | undefined;
    if (file?.path) {
      const inspected = await this.inspectUploadedArchive(file);
      archivePath = join(this.importsDir, `${inspected.uploadId}${BACKUP_EXT}`);
    } else if (dto.uploadId) {
      archivePath = join(this.importsDir, `${this.safeUploadId(dto.uploadId)}${BACKUP_EXT}`);
    }
    if (!archivePath || !(await this.exists(archivePath))) throw new NotFoundException('Archive importée introuvable.');
    return this.restoreArchive(archivePath);
  }

  async getSchedule(): Promise<BackupSchedule> {
    await this.ensureBackupDirs();
    const raw = await readFile(this.scheduleFile, 'utf8').catch(() => undefined);
    if (!raw) return DEFAULT_SCHEDULE;
    try {
      return this.normalizeSchedule(JSON.parse(raw) as Partial<BackupSchedule>);
    } catch {
      return DEFAULT_SCHEDULE;
    }
  }

  async updateSchedule(dto: BackupScheduleDto) {
    const schedule = this.normalizeSchedule(dto);
    await this.ensureBackupDirs();
    await writeFile(this.scheduleFile, JSON.stringify(schedule, null, 2));
    return schedule;
  }

  private async restoreArchive(archivePath: string) {
    return this.withLock('restore', async () => {
      await this.assertRequiredTools(['pg_restore', 'tar']);
      const inspected = await this.inspectArchive(archivePath);
      const extractDir = inspected.extractDir;
      const manifest = inspected.manifest;

      try {
        const dumpPath = join(extractDir, manifest.database.dump);
        if ((await this.sha256File(dumpPath)) !== manifest.database.checksumSha256) {
          throw new BadRequestException('Le dump PostgreSQL ne correspond pas au checksum du manifeste.');
        }
        await this.resetPublicSchemaForRestore();
        await this.prisma.$disconnect();
        await this.runCommand(this.pgRestorePath, ['--exit-on-error', '--no-owner', '--no-privileges', '--dbname', this.postgresToolDatabaseUrl(), dumpPath]);
        await this.restoreUploadRoots(extractDir, manifest);
        await this.prisma.systemSetting.upsert({
          where: { key: AUTH_SESSION_EPOCH_KEY },
          create: { key: AUTH_SESSION_EPOCH_KEY, value: randomUUID() },
          update: { value: randomUUID() },
        });
        return {
          restored: true,
          restoredAt: new Date().toISOString(),
          manifest,
          message: 'Restauration terminée. Reconnectez-vous avec les comptes de la sauvegarde restaurée.',
        };
      } finally {
        await rm(extractDir, { recursive: true, force: true });
      }
    });
  }

  private async resetPublicSchemaForRestore() {
    await this.prisma.$executeRawUnsafe(`
      DROP SCHEMA IF EXISTS public CASCADE;
    `);
  }

  private async inspectArchive(archivePath: string): Promise<{ manifest: BackupManifest; sizeBytes: number; extractDir: string }> {
    if (!(await this.exists(archivePath))) throw new NotFoundException('Archive introuvable.');
    await this.assertSafeArchiveEntries(archivePath);
    const archiveStat = await stat(archivePath);
    const extractDir = join(this.tmpDir, `inspect-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await rm(extractDir, { recursive: true, force: true });
    await mkdir(extractDir, { recursive: true });
    try {
      await this.runCommand(this.tarPath, ['-xzf', archivePath, '-C', extractDir]);
      const manifest = JSON.parse(await readFile(join(extractDir, 'manifest.json'), 'utf8')) as BackupManifest;
      this.validateManifest(manifest);
      if (!(await this.exists(join(extractDir, manifest.database.dump)))) throw new BadRequestException('Dump PostgreSQL absent de l’archive.');
      return { manifest, sizeBytes: archiveStat.size, extractDir };
    } catch (err) {
      await rm(extractDir, { recursive: true, force: true });
      throw err;
    }
  }

  private validateManifest(manifest: BackupManifest) {
    if (manifest.format !== 'toquehub-backup' || manifest.version !== 1) {
      throw new BadRequestException('Format de sauvegarde ToqueHub non reconnu.');
    }
    if (manifest.database.provider !== 'postgresql') {
      throw new BadRequestException('Cette sauvegarde ne cible pas PostgreSQL.');
    }
    if (!manifest.database.dump || manifest.database.dump.includes('..') || isAbsolute(manifest.database.dump)) {
      throw new BadRequestException('Chemin de dump invalide dans le manifeste.');
    }
  }

  private async copyUploadRoots(workDir: string) {
    const roots = this.uploadRootDefinitions();
    const copied: BackupManifest['files']['roots'] = [];
    for (const root of roots) {
      const archivePath = `files/${root.key}`;
      const destination = join(workDir, archivePath);
      if (await this.exists(root.path)) {
        await mkdir(dirname(destination), { recursive: true });
        await cp(root.path, destination, { recursive: true, force: true, errorOnExist: false });
      } else {
        await mkdir(destination, { recursive: true });
      }
      const stats = await this.directoryStats(destination);
      copied.push({
        key: root.key,
        envVar: root.envVar,
        archivePath,
        targetPath: root.path,
        sizeBytes: stats.sizeBytes,
        fileCount: stats.fileCount,
      });
    }
    return copied;
  }

  private async restoreUploadRoots(extractDir: string, manifest: BackupManifest) {
    const currentRoots = new Map(this.uploadRootDefinitions().map((root) => [root.key, root.path]));
    for (const root of manifest.files.roots) {
      const source = join(extractDir, root.archivePath);
      const target = currentRoots.get(root.key);
      if (!target) continue;
      if (!(await this.exists(source))) continue;
      const rollback = `${target}.rollback-${this.timestamp(new Date())}`;
      await mkdir(dirname(target), { recursive: true });
      if (await this.exists(target)) await rename(target, rollback);
      await cp(source, target, { recursive: true, force: true, errorOnExist: false });
    }
  }

  private uploadRootDefinitions() {
    const rawRoots = [
      { key: 'upload-dir', envVar: 'UPLOAD_DIR', path: resolve(process.env.UPLOAD_DIR || 'uploads') },
      { key: 'hr-upload-dir', envVar: 'HR_UPLOAD_DIR', path: resolve(process.env.HR_UPLOAD_DIR || process.env.UPLOAD_DIR || 'uploads', 'hr') },
      { key: 'stocks-ocr-upload-dir', envVar: 'STOCKS_OCR_UPLOAD_DIR', path: resolve(process.env.STOCKS_OCR_UPLOAD_DIR || process.env.UPLOAD_DIR || 'uploads', 'stocks-ocr') },
    ].map((root) => ({ ...root, path: resolve(root.path) }));

    const selected: typeof rawRoots = [];
    for (const root of rawRoots) {
      if (selected.some((existing) => this.isInside(existing.path, root.path))) continue;
      selected.push(root);
    }
    return selected;
  }

  private async backupSummaryFromFile(filename: string): Promise<BackupSummary> {
    const absolutePath = join(this.backupDir, filename);
    const stats = await stat(absolutePath);
    const manifest = await this.readManifestFromArchive(absolutePath).catch(() => undefined);
    return {
      id: filename.slice(0, -BACKUP_EXT.length),
      filename,
      createdAt: manifest?.createdAt ?? stats.mtime.toISOString(),
      sizeBytes: stats.size,
      mode: manifest?.mode,
      manifest,
    };
  }

  private async readManifestFromArchive(archivePath: string): Promise<BackupManifest> {
    const { stdout } = await execFileAsync(this.tarPath, ['-xOzf', archivePath, './manifest.json'], { maxBuffer: 10 * 1024 * 1024 });
    const manifest = JSON.parse(stdout.toString()) as BackupManifest;
    this.validateManifest(manifest);
    return manifest;
  }

  private async resolveLocalBackup(id: string) {
    const safeId = this.safeBackupId(id);
    const filename = `${safeId}${BACKUP_EXT}`;
    const absolutePath = join(this.backupDir, filename);
    if (!(await this.exists(absolutePath))) throw new NotFoundException('Sauvegarde introuvable.');
    return { id: safeId, filename, absolutePath };
  }

  private safeBackupId(id: string) {
    if (!/^toquehub-backup-[0-9]{8}-[0-9]{6}$/.test(id)) throw new BadRequestException('Identifiant de sauvegarde invalide.');
    return id;
  }

  private safeUploadId(id: string) {
    if (!/^upload-[0-9]+-[a-z0-9]+$/.test(id)) throw new BadRequestException('Identifiant d’import invalide.');
    return id;
  }

  private assertConfirmation(value?: string) {
    if (normalizeRestorePhrase(value) !== CONFIRMATION_PHRASE) {
      throw new BadRequestException(`Saisissez exactement "${CONFIRMATION_PHRASE}" pour confirmer la restauration.`);
    }
  }

  private async withLock<T>(operation: Exclude<BackupOperation, null>, handler: () => Promise<T>): Promise<T> {
    if (this.currentOperation) throw new ConflictException(`Une opération de ${this.currentOperation} est déjà en cours.`);
    this.currentOperation = operation;
    try {
      return await handler();
    } finally {
      this.currentOperation = null;
    }
  }

  private async getToolsStatus() {
    const tools = [
      { key: 'pg_dump', path: this.pgDumpPath },
      { key: 'pg_restore', path: this.pgRestorePath },
      { key: 'tar', path: this.tarPath },
    ];
    return Promise.all(tools.map(async (tool) => ({ ...tool, available: await this.commandAvailable(tool.path) })));
  }

  private async assertRequiredTools(keys: Array<'pg_dump' | 'pg_restore' | 'tar'>) {
    const tools = await this.getToolsStatus();
    const missing = tools.filter((tool) => keys.includes(tool.key as any) && !tool.available);
    if (missing.length) {
      throw new InternalServerErrorException(
        `Outil système manquant: ${missing.map((tool) => tool.key).join(', ')}. Installez le client PostgreSQL ou configurez PG_DUMP_PATH/PG_RESTORE_PATH.`,
      );
    }
  }

  private resolveToolPath(envVar: 'PG_DUMP_PATH' | 'PG_RESTORE_PATH' | 'TAR_PATH', command: 'pg_dump' | 'pg_restore' | 'tar') {
    const configured = process.env[envVar];
    if (configured) return configured;
    if (command === 'tar') return command;
    return this.findPostgresTool(command) ?? command;
  }

  private findPostgresTool(command: 'pg_dump' | 'pg_restore') {
    const candidates = [
      `/Applications/Postgres.app/Contents/Versions/latest/bin/${command}`,
      `/opt/homebrew/bin/${command}`,
      `/usr/local/bin/${command}`,
      ...POSTGRES_TOOL_VERSIONS.flatMap((version) => [
        `/opt/homebrew/opt/postgresql@${version}/bin/${command}`,
        `/usr/local/opt/postgresql@${version}/bin/${command}`,
        `/opt/homebrew/Cellar/postgresql@${version}/bin/${command}`,
        `/usr/local/Cellar/postgresql@${version}/bin/${command}`,
      ]),
    ];
    return candidates.find((candidate) => existsSync(candidate));
  }

  private async commandAvailable(command: string) {
    try {
      if (command.includes(sep) || isAbsolute(command)) {
        await access(command);
        return true;
      }
      await execFileAsync(command, ['--version'], { maxBuffer: 1024 * 1024 });
      return true;
    } catch {
      return false;
    }
  }

  private async runCommand(command: string, args: string[]) {
    try {
      await execFileAsync(command, args, {
        env: process.env,
        maxBuffer: 50 * 1024 * 1024,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new InternalServerErrorException(`Commande système échouée: ${basename(command)} (${message})`);
    }
  }

  private databaseUrl() {
    const url = process.env.DATABASE_URL;
    if (!url) throw new InternalServerErrorException('DATABASE_URL est requis pour les sauvegardes.');
    return url;
  }

  private postgresToolDatabaseUrl() {
    const raw = this.databaseUrl();
    try {
      const url = new URL(raw);
      url.searchParams.delete('schema');
      return url.toString();
    } catch {
      return raw.replace(/([?&])schema=[^&]*&?/, (_match, separator: string) => separator === '?' ? '?' : '').replace(/[?&]$/, '');
    }
  }

  private async ensureBackupDirs() {
    await mkdir(this.backupDir, { recursive: true });
    await mkdir(this.importsDir, { recursive: true });
    await mkdir(this.tmpDir, { recursive: true });
  }

  private async readPackageVersion() {
    const candidates = [resolve('package.json'), resolve(__dirname, '../../../package.json')];
    for (const candidate of candidates) {
      const raw = await readFile(candidate, 'utf8').catch(() => undefined);
      if (raw) return (JSON.parse(raw) as { version?: string }).version ?? '0.1.0';
    }
    return '0.1.0';
  }

  private async sha256File(filePath: string) {
    return new Promise<string>((resolveHash, reject) => {
      const hash = createHash('sha256');
      const stream = createReadStream(filePath);
      stream.on('error', reject);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolveHash(hash.digest('hex')));
    });
  }

  private async directoryStats(directory: string): Promise<{ sizeBytes: number; fileCount: number }> {
    if (!(await this.exists(directory))) return { sizeBytes: 0, fileCount: 0 };
    const entries = await readdir(directory, { withFileTypes: true });
    let sizeBytes = 0;
    let fileCount = 0;
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        const child = await this.directoryStats(path);
        sizeBytes += child.sizeBytes;
        fileCount += child.fileCount;
      } else if (entry.isFile()) {
        const fileStat = await stat(path);
        sizeBytes += fileStat.size;
        fileCount += 1;
      }
    }
    return { sizeBytes, fileCount };
  }

  private async assertSafeArchiveEntries(archivePath: string) {
    const { stdout } = await execFileAsync(this.tarPath, ['-tzf', archivePath], { maxBuffer: 50 * 1024 * 1024 });
    const entries = stdout.toString().split('\n').map((entry) => entry.trim()).filter(Boolean);
    if (!entries.length) throw new BadRequestException('Archive vide.');
    for (const entry of entries) {
      const cleaned = normalize(entry.replace(/^\.\//, ''));
      if (!cleaned || cleaned.startsWith('..') || isAbsolute(cleaned)) {
        throw new BadRequestException('Archive invalide: chemin dangereux détecté.');
      }
    }
  }

  private normalizeSchedule(input: Partial<BackupSchedule>): BackupSchedule {
    const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(input.time || '') ? input.time! : DEFAULT_SCHEDULE.time;
    const retentionDays = Math.max(1, Math.round(Number(input.retentionDays || DEFAULT_SCHEDULE.retentionDays)));
    const weekday = Math.min(6, Math.max(0, Math.round(Number(input.weekday ?? DEFAULT_SCHEDULE.weekday))));
    return {
      enabled: Boolean(input.enabled),
      frequency: input.frequency === 'weekly' ? 'weekly' : 'daily',
      time,
      weekday,
      retentionDays,
      lastRunAt: typeof input.lastRunAt === 'string' ? input.lastRunAt : null,
    };
  }

  private async runScheduledBackupIfDue() {
    if (this.currentOperation) return;
    const schedule = await this.getSchedule();
    if (!schedule.enabled || !this.scheduleDue(schedule)) return;
    try {
      await this.createBackup({ userId: null, organizationId: await this.defaultBackupOrganizationId(), mode: 'scheduled' });
      const next = { ...schedule, lastRunAt: new Date().toISOString() };
      await writeFile(this.scheduleFile, JSON.stringify(next, null, 2));
    } catch (err) {
      console.error('Scheduled backup failed', err);
    }
  }

  private scheduleDue(schedule: BackupSchedule) {
    const now = new Date();
    const [hour, minute] = schedule.time.split(':').map(Number);
    const scheduled = new Date(now);
    scheduled.setHours(hour, minute, 0, 0);
    if (now < scheduled) return false;
    if (schedule.frequency === 'weekly' && now.getDay() !== schedule.weekday) return false;
    if (!schedule.lastRunAt) return true;
    const last = new Date(schedule.lastRunAt);
    return last < scheduled;
  }

  private async applyRetention(schedule: BackupSchedule) {
    const cutoff = Date.now() - schedule.retentionDays * 24 * 60 * 60 * 1000;
    const files = await readdir(this.backupDir).catch(() => []);
    await Promise.all(files.filter((file) => file.startsWith(BACKUP_PREFIX) && file.endsWith(BACKUP_EXT)).map(async (file) => {
      const path = join(this.backupDir, file);
      const fileStat = await stat(path).catch(() => undefined);
      if (fileStat && fileStat.mtime.getTime() < cutoff) await rm(path, { force: true });
    }));
  }

  private async defaultBackupOrganizationId() {
    const organization = await this.prisma.organization.findFirst({ select: { id: true }, orderBy: { createdAt: 'asc' } });
    return organization?.id ?? null;
  }

  private timestamp(date: Date) {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  }

  private async exists(path: string) {
    return access(path).then(() => true).catch(() => false);
  }

  private isInside(parent: string, child: string) {
    const rel = relative(parent, child);
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
  }
}
