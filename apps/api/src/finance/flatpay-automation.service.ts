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
import { resolve } from 'node:path';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import type { InstallFlatpayAutomationDto } from './dto/finance.dto';
import { resolveFlatpayBrowserExecutable } from './flatpay-browser';
import { FinancePolicy } from './finance.policy';

const DEFAULT_SCHEDULE = ['07:00', '15:00', '19:00', '23:00'];
const RETRY_DELAY_MS = 30 * 60_000;

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
  const persistentRoot = configuredRoot?.trim();
  if (persistentRoot) return resolve(persistentRoot, connectionId);
  if (currentInbox?.trim()) return resolve(currentInbox);
  return resolve(homedir(), 'Documents/ToqueHub/Finance/FlatPay', connectionId);
}

@Injectable()
export class FlatpayAutomationService implements OnModuleInit, OnModuleDestroy {
  private readonly reconnecting = new Map<string, ChildProcess>();
  private readonly syncing = new Map<string, ChildProcess>();
  private readonly lastAttempts = new Map<string, number>();
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
      : connection.historyStart;
    if (!historyStart) {
      throw new BadRequestException('Indiquez le premier jour à récupérer depuis FlatPay.');
    }
    await mkdir(inbox, { recursive: true });
    try {
      await this.prisma.financeFlatpayConnection.update({
        where: { id: connection.id },
        data: {
          automationInstalledAt: new Date(),
          automationInbox: inbox,
          automationSchedule: effectiveSchedule,
          historyStart,
          lastError: null,
        },
      });
      void this.startSync(organizationId, dto.siteId).catch(() => undefined);
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
          'Automatisation locale activée. Orders et Sales Overview seront récupérés sans ouvrir de fenêtre tant que FlatPay n’exige pas une validation supplémentaire.',
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
      env: process.env,
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
        'Une fenêtre Chrome FlatPay va s’ouvrir. Terminez la connexion : la session sera enregistrée et les rapports récents seront synchronisés automatiquement.',
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
            lastSyncedAt: true,
          },
        })
        .catch(() => []);
      const now = new Date();
      for (const connection of connections) {
        const dueAt = this.latestScheduledOccurrence(connection.automationSchedule, now);
        if (!dueAt || (connection.lastSyncedAt && connection.lastSyncedAt >= dueAt)) continue;
        const lastAttempt = this.lastAttempts.get(connection.id) || 0;
        if (Date.now() - lastAttempt < RETRY_DELAY_MS) continue;
        void this.startSync(connection.organizationId, connection.defaultSiteId).catch(
          () => undefined,
        );
      }
    } finally {
      this.checkingSchedules = false;
    }
  }

  private latestScheduledOccurrence(schedule: string[], now: Date) {
    const candidates: Date[] = [];
    for (const value of schedule) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) continue;
      const [hour, minute] = value.split(':').map(Number);
      const today = new Date(now);
      today.setHours(hour, minute, 0, 0);
      candidates.push(today <= now ? today : new Date(today.getTime() - 86_400_000));
    }
    return candidates.sort((left, right) => right.getTime() - left.getTime())[0] || null;
  }

  private async startSync(organizationId: string, siteId: string) {
    const connection = await this.prisma.financeFlatpayConnection.findUnique({
      where: { organizationId_defaultSiteId: { organizationId, defaultSiteId: siteId } },
    });
    if (!connection?.automationInstalledAt) return false;
    if (this.syncing.get(connection.id)?.exitCode === null) return false;
    this.lastAttempts.set(connection.id, Date.now());
    const projectDirectory = resolve(__dirname, '../../../..');
    let command: ReturnType<typeof resolveFlatpayAutomationCommand>;
    try {
      command = resolveFlatpayAutomationCommand(projectDirectory);
    } catch (error) {
      await this.prisma.financeFlatpayConnection.update({
        where: { id: connection.id },
        data: { lastError: error instanceof Error ? error.message : String(error) },
      });
      return false;
    }
    const browserExecutable = await resolveFlatpayBrowserExecutable().catch(async (error) => {
      await this.prisma.financeFlatpayConnection.update({
        where: { id: connection.id },
        data: { lastError: error instanceof Error ? error.message : String(error) },
      });
      return null;
    });
    if (!browserExecutable) return false;
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
    let stderr = '';
    const child = spawn(process.execPath, args, {
      cwd: projectDirectory,
      env: process.env,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    this.syncing.set(connection.id, child);
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString('utf8')}`.slice(-4_000);
    });
    child.once('error', (error) => {
      this.syncing.delete(connection.id);
      void this.prisma.financeFlatpayConnection
        .update({
          where: { id: connection.id },
          data: { lastError: `Synchronisation FlatPay impossible : ${error.message}` },
        })
        .catch(() => undefined);
    });
    child.once('exit', (code) => {
      this.syncing.delete(connection.id);
      if (code && code !== 0) {
        void this.prisma.financeFlatpayConnection
          .update({
            where: { id: connection.id },
            data: {
              lastError:
                stderr.trim() || `La synchronisation FlatPay s’est arrêtée avec le code ${code}.`,
            },
          })
          .catch(() => undefined);
      }
    });
    return true;
  }
}
