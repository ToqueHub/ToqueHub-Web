import {
  BadRequestException,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { extname, resolve } from 'node:path';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import type { InstallFlatpayAutomationDto } from './dto/finance.dto';
import { flatpayRuntimeDirectory, resolveFlatpayBrowserExecutable } from './flatpay-browser';
import { FinancePolicy } from './finance.policy';

const DEFAULT_SCHEDULE = ['07:00', '15:00', '19:00', '23:00'];
const FAILED_SYNC_RETRY_MS = 15 * 60_000;

export function resolveFlatpayAutomationCommand(
  projectDirectory: string,
  fileExists: (path: string) => boolean = existsSync,
) {
  const compiledScript = resolve(
    projectDirectory,
    'apps/api/dist-automation/scripts/sync-flatpay-portal.js',
  );
  if (fileExists(compiledScript)) {
    return { script: compiledScript, nodeArgs: [] as string[] };
  }

  const sourceScript = resolve(projectDirectory, 'apps/api/scripts/sync-flatpay-portal.ts');
  const loader = resolve(projectDirectory, 'node_modules/tsx/dist/loader.mjs');
  if (fileExists(sourceScript) && fileExists(loader)) {
    return { script: sourceScript, nodeArgs: ['--import', loader] };
  }

  throw new Error(
    'Le moteur de synchronisation FlatPay est absent de cette installation ToqueHub.',
  );
}

export function resolveFlatpayAutomationInbox(
  connectionId: string,
  currentInbox?: string | null,
  configuredRoot: string | undefined = process.env.FLATPAY_REPORTS_INBOX,
) {
  const persistentRoot = usableFlatpayPath(configuredRoot);
  if (persistentRoot) return resolve(persistentRoot, connectionId);
  const existingInbox = usableFlatpayPath(currentInbox);
  if (existingInbox) return resolve(existingInbox);
  return resolve(homedir(), 'Documents/ToqueHub/Finance/FlatPay', connectionId);
}

function usableFlatpayPath(value?: string | null) {
  const candidate = value?.trim();
  if (!candidate) return null;
  const normalized = candidate.replace(/\\/g, '/').toLowerCase();
  if (normalized === '/absolute' || normalized.startsWith('/absolute/path/to/')) return null;
  return candidate;
}

export function resolveFlatpayAutomationEnvironment(
  connectionId: string,
  inbox: string,
  environment: NodeJS.ProcessEnv = process.env,
  runtimeDirectory = flatpayRuntimeDirectory(),
  timeZone = environment.FLATPAY_TIME_ZONE || environment.TZ || 'Europe/Helsinki',
) {
  const configuredProfile = usableFlatpayPath(environment.FLATPAY_BROWSER_PROFILE_DIR);
  const configuredState = usableFlatpayPath(environment.FLATPAY_AUTOMATION_STATE_PATH);
  const statePath = configuredState
    ? extname(configuredState).toLowerCase() === '.json'
      ? resolve(configuredState)
      : resolve(configuredState, `${connectionId}.json`)
    : resolve(runtimeDirectory, 'state', `${connectionId}.json`);
  return {
    ...environment,
    FLATPAY_REPORTS_INBOX: inbox,
    FLATPAY_BROWSER_PROFILE_DIR: resolve(
      configuredProfile ?? resolve(runtimeDirectory, 'browser-profile'),
    ),
    FLATPAY_AUTOMATION_STATE_PATH: statePath,
    FLATPAY_TIME_ZONE: timeZone,
    TZ: timeZone,
  };
}

function zonedDateTimeParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value ?? 0);
  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    hour: part('hour'),
    minute: part('minute'),
    second: part('second'),
  };
}

function zonedInstant(parts: ReturnType<typeof zonedDateTimeParts>, timeZone: string) {
  const target = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  let timestamp = target;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const observed = zonedDateTimeParts(new Date(timestamp), timeZone);
    const observedTimestamp = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
    );
    timestamp += target - observedTimestamp;
  }
  return new Date(timestamp);
}

export function latestFlatpayScheduledOccurrence(
  schedule: string[],
  now: Date,
  timeZone = 'Europe/Helsinki',
) {
  let localNow: ReturnType<typeof zonedDateTimeParts>;
  try {
    localNow = zonedDateTimeParts(now, timeZone);
  } catch {
    timeZone = 'Europe/Helsinki';
    localNow = zonedDateTimeParts(now, timeZone);
  }
  const localDay = Date.UTC(localNow.year, localNow.month - 1, localNow.day);
  const candidates: Date[] = [];
  for (const value of schedule) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) continue;
    const [hour, minute] = value.split(':').map(Number);
    let day = new Date(localDay);
    let candidate = zonedInstant(
      {
        year: day.getUTCFullYear(),
        month: day.getUTCMonth() + 1,
        day: day.getUTCDate(),
        hour,
        minute,
        second: 0,
      },
      timeZone,
    );
    if (candidate > now) {
      day = new Date(localDay - 86_400_000);
      candidate = zonedInstant(
        {
          year: day.getUTCFullYear(),
          month: day.getUTCMonth() + 1,
          day: day.getUTCDate(),
          hour,
          minute,
          second: 0,
        },
        timeZone,
      );
    }
    candidates.push(candidate);
  }
  return candidates.sort((left, right) => right.getTime() - left.getTime())[0] || null;
}

export function flatpayAutomationExitUpdate(
  code: number | null,
  output: string,
  completedAt = new Date(),
) {
  if (code === 0) return { lastSyncedAt: completedAt, lastError: null };
  const usefulOutput = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !/^\[pid=\d+\]\[err\]/.test(line) &&
        !/ERROR:(?:dbus|third_party\/crashpad|net\/socket)/.test(line),
    )
    .slice(-8)
    .join('\n')
    .slice(-2_000);
  return {
    lastError:
      usefulOutput ||
      `La synchronisation FlatPay s’est arrêtée${code === null ? '' : ` avec le code ${code}`}.`,
  };
}

export function shouldStartFlatpayScheduledSync({
  dueAt,
  lastSyncedAt,
  lastAttemptAt,
  now = new Date(),
  retryAfterMs = FAILED_SYNC_RETRY_MS,
}: {
  dueAt: Date | null;
  lastSyncedAt?: Date | null;
  lastAttemptAt?: Date | null;
  now?: Date;
  retryAfterMs?: number;
}) {
  if (!dueAt) return false;
  if (lastSyncedAt && lastSyncedAt >= dueAt) return false;
  if (
    lastAttemptAt &&
    lastAttemptAt >= dueAt &&
    now.getTime() - lastAttemptAt.getTime() < retryAfterMs
  )
    return false;
  return true;
}

@Injectable()
export class FlatpayAutomationService implements OnModuleInit, OnModuleDestroy {
  private readonly reconnecting = new Map<string, ChildProcess>();
  private readonly syncing = new Map<string, ChildProcess>();
  private timer?: NodeJS.Timeout;
  private startupTimer?: NodeJS.Timeout;
  private checkingSchedules = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: FinancePolicy,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.startupTimer = setTimeout(() => void this.checkSchedules(), 10_000);
    this.startupTimer.unref();
    this.timer = setInterval(() => void this.checkSchedules(), 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    if (this.timer) clearInterval(this.timer);
    for (const child of [...this.syncing.values(), ...this.reconnecting.values()]) {
      if (child.exitCode === null) child.kill();
    }
  }

  async install(
    organizationId: string,
    actor: AuthenticatedUser,
    dto: InstallFlatpayAutomationDto,
  ) {
    this.policy.assertPermission(actor, 'finance.manage');
    const connection = await this.prisma.financeFlatpayConnection.findUnique({
      where: {
        organizationId_defaultSiteId: { organizationId, defaultSiteId: dto.siteId },
      },
    });
    if (!connection) {
      throw new BadRequestException('Enregistrez d’abord la connexion Flatpay.');
    }
    const browserExecutable = await resolveFlatpayBrowserExecutable().catch((error) => {
      throw new ServiceUnavailableException(
        error instanceof Error ? error.message : 'Navigateur compatible introuvable.',
      );
    });
    const inbox = resolveFlatpayAutomationInbox(connection.id, connection.automationInbox);
    const schedule = [
      ...new Set(dto.schedule?.length ? dto.schedule : connection.automationSchedule),
    ]
      .filter((time) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time))
      .sort();
    const effectiveSchedule = schedule.length ? schedule : DEFAULT_SCHEDULE;
    const historyStart = dto.historyStart
      ? new Date(`${dto.historyStart.slice(0, 10)}T00:00:00.000Z`)
      : (connection.historyStart ?? new Date());
    await mkdir(inbox, { recursive: true });
    try {
      await this.prisma.financeFlatpayConnection.update({
        where: { id: connection.id },
        data: {
          automationInstalledAt: new Date(),
          automationInbox: inbox,
          automationSchedule: effectiveSchedule,
          historyStart,
        },
      });
      return {
        installed: true,
        schedule: effectiveSchedule,
        inbox,
        historyStart: historyStart.toISOString().slice(0, 10),
        runtime: 'TOQUEHUB_LOCAL_AGENT',
        platform: process.platform,
        browserExecutable,
        requiredReports: ['orders', 'sales-overview'],
        message:
          'Planification FlatPay enregistrée. Orders et Sales Overview seront récupérés aux horaires choisis ; utilisez « Synchroniser maintenant » pour un passage immédiat.',
      };
    } catch (error) {
      throw new ServiceUnavailableException(
        error instanceof Error
          ? `Impossible d’installer l’automatisation Flatpay : ${error.message}`
          : 'Impossible d’installer l’automatisation Flatpay.',
      );
    }
  }

  async reconnect(organizationId: string, actor: AuthenticatedUser, siteId: string) {
    this.policy.assertPermission(actor, 'finance.manage');
    const connection = await this.prisma.financeFlatpayConnection.findUnique({
      where: { organizationId_defaultSiteId: { organizationId, defaultSiteId: siteId } },
      include: {
        organization: { select: { financeSettings: { select: { timezone: true } } } },
      },
    });
    if (!connection) throw new BadRequestException('Enregistrez d’abord la connexion FlatPay.');
    const running = this.reconnecting.get(connection.id);
    if (running && running.exitCode === null) {
      return {
        started: true,
        alreadyRunning: true,
        message: 'La fenêtre de reconnexion FlatPay est déjà ouverte.',
      };
    }
    const projectDirectory = resolve(__dirname, '../../../..');
    const command = resolveFlatpayAutomationCommand(projectDirectory);
    const browserExecutable = await resolveFlatpayBrowserExecutable().catch((error) => {
      throw new ServiceUnavailableException(
        error instanceof Error ? error.message : 'Navigateur compatible introuvable.',
      );
    });
    const inbox = resolveFlatpayAutomationInbox(connection.id, connection.automationInbox);
    await mkdir(inbox, { recursive: true });
    if (connection.automationInbox !== inbox) {
      await this.prisma.financeFlatpayConnection.update({
        where: { id: connection.id },
        data: { automationInbox: inbox },
      });
    }
    const scheduled = this.syncing.get(connection.id);
    if (scheduled?.exitCode === null) scheduled.kill();

    const args = [
      ...command.nodeArgs,
      command.script,
      '--setup',
      '--setup-auto',
      '--run-after-setup',
      '--organization-id',
      organizationId,
      '--site-id',
      siteId,
      '--inbox',
      inbox,
      '--chrome-path',
      browserExecutable,
      ...(connection.historyStart
        ? ['--from', connection.historyStart.toISOString().slice(0, 10)]
        : []),
    ];
    const child = spawn(process.execPath, args, {
      cwd: projectDirectory,
      env: resolveFlatpayAutomationEnvironment(
        connection.id,
        inbox,
        process.env,
        flatpayRuntimeDirectory(),
        connection.organization.financeSettings?.timezone || 'Europe/Helsinki',
      ),
      stdio: 'ignore',
    });
    this.reconnecting.set(connection.id, child);
    let completed = false;
    const complete = (error?: Error) => {
      if (completed) return;
      completed = true;
      this.reconnecting.delete(connection.id);
      if (error) {
        void this.prisma.financeFlatpayConnection
          .update({
            where: { id: connection.id },
            data: {
              lastError: `Impossible d’ouvrir la reconnexion FlatPay : ${error.message}`,
            },
          })
          .catch(() => undefined);
      }
    };
    child.once('error', (error) => complete(error));
    child.once('exit', () => complete());
    child.unref();
    return {
      started: true,
      alreadyRunning: false,
      message:
        'Reconnexion FlatPay lancée. La session sera renouvelée et les rapports récents seront synchronisés automatiquement.',
    };
  }

  async syncNow(organizationId: string, actor: AuthenticatedUser, siteId: string) {
    this.policy.assertPermission(actor, 'finance.manage');
    const result = await this.startSync(organizationId, siteId);
    if (result === 'already-running') {
      return {
        started: true,
        alreadyRunning: true,
        message: 'Une synchronisation FlatPay est déjà en cours pour cet établissement.',
      };
    }
    if (result === 'not-installed') {
      throw new BadRequestException(
        'Configurez et activez d’abord la planification FlatPay pour cet établissement.',
      );
    }
    if (result === 'unavailable') {
      const connection = await this.prisma.financeFlatpayConnection.findUnique({
        where: { organizationId_defaultSiteId: { organizationId, defaultSiteId: siteId } },
        select: { lastError: true },
      });
      throw new ServiceUnavailableException(
        connection?.lastError || 'La synchronisation FlatPay ne peut pas démarrer.',
      );
    }
    return {
      started: true,
      alreadyRunning: false,
      message:
        'Synchronisation FlatPay lancée. Le chiffre d’affaires sera actualisé dès que les rapports auront été récupérés et contrôlés.',
    };
  }

  private async checkSchedules() {
    if (this.checkingSchedules) return;
    this.checkingSchedules = true;
    try {
      const connections = await this.prisma.financeFlatpayConnection
        .findMany({
          where: {
            automationInstalledAt: { not: null },
          },
          select: {
            id: true,
            organizationId: true,
            defaultSiteId: true,
            automationSchedule: true,
            automationLastAttemptAt: true,
            lastSyncedAt: true,
            organization: {
              select: { financeSettings: { select: { timezone: true } } },
            },
          },
        })
        .catch(() => []);
      const now = new Date();
      for (const connection of connections) {
        const dueAt = latestFlatpayScheduledOccurrence(
          connection.automationSchedule,
          now,
          connection.organization.financeSettings?.timezone || 'Europe/Helsinki',
        );
        if (
          !shouldStartFlatpayScheduledSync({
            dueAt,
            lastSyncedAt: connection.lastSyncedAt,
            lastAttemptAt: connection.automationLastAttemptAt,
          })
        )
          continue;
        void this.startSync(connection.organizationId, connection.defaultSiteId).catch(
          () => undefined,
        );
      }
    } finally {
      this.checkingSchedules = false;
    }
  }

  private async startSync(organizationId: string, siteId: string) {
    const connection = await this.prisma.financeFlatpayConnection.findUnique({
      where: { organizationId_defaultSiteId: { organizationId, defaultSiteId: siteId } },
      include: {
        organization: { select: { financeSettings: { select: { timezone: true } } } },
      },
    });
    if (!connection?.automationInstalledAt) return 'not-installed' as const;
    if (this.syncing.get(connection.id)?.exitCode === null) return 'already-running' as const;
    await this.prisma.financeFlatpayConnection.update({
      where: { id: connection.id },
      data: { automationLastAttemptAt: new Date() },
    });
    const projectDirectory = resolve(__dirname, '../../../..');
    let command: ReturnType<typeof resolveFlatpayAutomationCommand>;
    try {
      command = resolveFlatpayAutomationCommand(projectDirectory);
    } catch (error) {
      await this.prisma.financeFlatpayConnection.update({
        where: { id: connection.id },
        data: { lastError: error instanceof Error ? error.message : String(error) },
      });
      return 'unavailable' as const;
    }
    const browserExecutable = await resolveFlatpayBrowserExecutable().catch(async (error) => {
      await this.prisma.financeFlatpayConnection.update({
        where: { id: connection.id },
        data: { lastError: error instanceof Error ? error.message : String(error) },
      });
      return null;
    });
    if (!browserExecutable) return 'unavailable' as const;
    const inbox = resolveFlatpayAutomationInbox(connection.id, connection.automationInbox);
    await mkdir(inbox, { recursive: true });
    if (connection.automationInbox !== inbox) {
      await this.prisma.financeFlatpayConnection.update({
        where: { id: connection.id },
        data: { automationInbox: inbox },
      });
    }
    const args = [
      ...command.nodeArgs,
      command.script,
      '--organization-id',
      organizationId,
      '--site-id',
      siteId,
      '--inbox',
      inbox,
      '--chrome-path',
      browserExecutable,
      '--reports',
      'orders,sales-overview',
      ...(connection.historyStart
        ? ['--from', connection.historyStart.toISOString().slice(0, 10)]
        : []),
    ];
    let processOutput = '';
    const child = spawn(process.execPath, args, {
      cwd: projectDirectory,
      env: resolveFlatpayAutomationEnvironment(
        connection.id,
        inbox,
        process.env,
        flatpayRuntimeDirectory(),
        connection.organization.financeSettings?.timezone || 'Europe/Helsinki',
      ),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.syncing.set(connection.id, child);
    child.stdout?.on('data', (chunk: Buffer) => {
      processOutput = `${processOutput}${chunk.toString('utf8')}`.slice(-12_000);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      processOutput = `${processOutput}${chunk.toString('utf8')}`.slice(-12_000);
    });
    child.once('error', (error) => {
      this.syncing.delete(connection.id);
      processOutput = `${processOutput}\nSynchronisation FlatPay impossible : ${error.message}`;
      void this.prisma.financeFlatpayConnection
        .update({
          where: { id: connection.id },
          data: { lastError: `Synchronisation FlatPay impossible : ${error.message}` },
        })
        .catch(() => undefined);
    });
    child.once('exit', (code) => {
      this.syncing.delete(connection.id);
      void this.recordSyncExit(connection.id, connection.lastError, code, processOutput).catch(
        () => undefined,
      );
    });
    return 'started' as const;
  }

  private async recordSyncExit(
    connectionId: string,
    previousError: string | null,
    code: number | null,
    processOutput: string,
  ) {
    if (code !== 0) {
      const current = await this.prisma.financeFlatpayConnection.findUnique({
        where: { id: connectionId },
        select: { lastError: true },
      });
      // The worker records the precise business error itself. Keep it when it
      // changed during this run instead of replacing it with Chromium logs.
      if (current?.lastError && current.lastError !== previousError) return;
    }
    await this.prisma.financeFlatpayConnection.update({
      where: { id: connectionId },
      data: flatpayAutomationExitUpdate(code, processOutput),
    });
  }
}
