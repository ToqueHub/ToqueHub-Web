import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { FinanceProvider, FinanceSourceType } from '@prisma/client';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import type { ConfigureFlatpayDto } from './dto/finance.dto';
import { FennoaSecretService } from './fennoa-secret.service';
import { FinancePolicy } from './finance.policy';

const run = promisify(execFile);
const KEYCHAIN_SERVICE = 'com.toquehub.finance.flatpay';
const DEFAULT_PORTAL = 'https://portal.flatpay.com';

@Injectable()
export class FlatpayCredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: FinancePolicy,
    private readonly secrets: FennoaSecretService,
  ) {}

  async configure(organizationId: string, actor: AuthenticatedUser, dto: ConfigureFlatpayDto) {
    this.policy.assertPermission(actor, 'finance.manage');
    const site = await this.prisma.site.findFirst({
      where: { id: dto.siteId, organizationId, isArchived: false },
      select: { id: true, name: true },
    });
    if (!site) throw new BadRequestException('Établissement ToqueHub introuvable.');
    const username = dto.username.trim();
    if (!username) throw new BadRequestException('L’identifiant FlatPay est requis.');
    const current = await this.prisma.financeFlatpayConnection.findUnique({
      where: {
        organizationId_defaultSiteId: { organizationId, defaultSiteId: site.id },
      },
    });
    const connectionId = current?.id ?? randomUUID();
    const accountFingerprint = `flatpay:${username.toLocaleLowerCase('en-US')}`;
    const conflictingConnection = await this.prisma.financeFlatpayConnection.findFirst({
      where: {
        organizationId,
        accountFingerprint,
        defaultSiteId: { not: site.id },
      },
      include: { defaultSite: { select: { name: true } } },
    });
    if (conflictingConnection) {
      throw new BadRequestException(
        `Ce compte FlatPay est déjà rattaché à ${conflictingConnection.defaultSite.name}. Utilisez le compte FlatPay propre à ${site.name}.`,
      );
    }
    const password = dto.password?.trim();
    const portalUrl = (dto.portalUrl || current?.portalUrl || DEFAULT_PORTAL).replace(/\/$/, '');
    let storage = current?.credentialStorage ?? null;
    let encrypted = current?.passwordEncrypted ?? null;
    let passwordMask = current?.passwordMask ?? null;
    if (password) {
      if (process.platform === 'darwin') {
        try {
          await run(
            '/usr/bin/security',
            [
              'add-generic-password',
              '-U',
              '-s',
              KEYCHAIN_SERVICE,
              '-a',
              connectionId,
              '-l',
              `ToqueHub FlatPay · ${site.name} · ${username}`,
              '-w',
              password,
            ],
            { timeout: 15_000 },
          );
          storage = 'SYSTEM_KEYCHAIN';
          encrypted = null;
        } catch {
          storage = 'ENCRYPTED_LOCAL_DATABASE';
          encrypted = this.secrets.encrypt(password);
        }
      } else {
        storage = 'ENCRYPTED_LOCAL_DATABASE';
        encrypted = this.secrets.encrypt(password);
      }
      passwordMask = '••••••••';
    } else if (!storage || !passwordMask) {
      throw new BadRequestException(
        'Le mot de passe FlatPay est requis lors de la première connexion de cet établissement.',
      );
    }
    const connection = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.financeFlatpayConnection.upsert({
        where: {
          organizationId_defaultSiteId: { organizationId, defaultSiteId: site.id },
        },
        update: {
          username,
          accountFingerprint,
          portalUrl,
          credentialStorage: storage!,
          passwordEncrypted: encrypted,
          passwordMask: passwordMask!,
          configuredAt: new Date(),
          lastError: null,
        },
        create: {
          id: connectionId,
          organizationId,
          defaultSiteId: site.id,
          username,
          accountFingerprint,
          portalUrl,
          credentialStorage: storage!,
          passwordEncrypted: encrypted,
          passwordMask: passwordMask!,
        },
      });
      const existingSource = await tx.financeDataSource.findFirst({
        where: {
          organizationId,
          provider: FinanceProvider.FLATPAY,
          siteId: site.id,
        },
        orderBy: { createdAt: 'asc' },
      });
      if (!existingSource) {
        const baseName = `FlatPay POS · ${site.name}`;
        const collision = await tx.financeDataSource.findUnique({
          where: {
            organizationId_provider_name: {
              organizationId,
              provider: FinanceProvider.FLATPAY,
              name: baseName,
            },
          },
          select: { id: true },
        });
        await tx.financeDataSource.create({
          data: {
            organizationId,
            siteId: site.id,
            provider: FinanceProvider.FLATPAY,
            name: collision ? `${baseName} · ${site.id.slice(0, 8)}` : baseName,
            sourceType: FinanceSourceType.FILE_IMPORT,
            isPrimarySales: true,
          },
        });
      }
      return saved;
    });
    return this.publicValue(connection, site);
  }

  async publicSettings(organizationId: string) {
    const connections = await this.prisma.financeFlatpayConnection.findMany({
      where: { organizationId },
      include: { defaultSite: { select: { id: true, name: true } } },
      orderBy: { configuredAt: 'asc' },
    });
    const values = connections.map((connection) =>
      this.publicValue(connection, connection.defaultSite),
    );
    return { ...(values[0] ?? this.emptyValue()), connections: values };
  }

  async credentials(organizationId: string, siteId?: string) {
    const connections = await this.prisma.financeFlatpayConnection.findMany({
      where: { organizationId, ...(siteId ? { defaultSiteId: siteId } : {}) },
      orderBy: { configuredAt: 'asc' },
      take: 2,
    });
    if (!siteId && connections.length > 1) {
      throw new BadRequestException('Choisissez l’établissement de cette connexion FlatPay.');
    }
    const connection = connections[0];
    if (!connection) {
      throw new ServiceUnavailableException('La connexion FlatPay n’est pas configurée.');
    }
    let password: string | null = null;
    if (connection.credentialStorage === 'SYSTEM_KEYCHAIN' && process.platform === 'darwin') {
      for (const account of [connection.id, organizationId]) {
        try {
          const result = await run(
            '/usr/bin/security',
            ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', account, '-w'],
            { timeout: 15_000 },
          );
          password = result.stdout.trim();
          if (password) break;
        } catch {
          password = null;
        }
      }
    } else if (connection.passwordEncrypted) {
      password = this.secrets.decrypt(connection.passwordEncrypted);
    }
    if (!password) {
      throw new ServiceUnavailableException(
        'Le secret FlatPay est introuvable. Enregistrez à nouveau cette connexion.',
      );
    }
    return {
      ...connection,
      password,
    };
  }

  async recordSync(organizationId: string, siteId: string, error?: string) {
    await this.prisma.financeFlatpayConnection.update({
      where: { organizationId_defaultSiteId: { organizationId, defaultSiteId: siteId } },
      data: error ? { lastError: error } : { lastSyncedAt: new Date(), lastError: null },
    });
  }

  private emptyValue() {
    return {
      id: null,
      portalUrl: DEFAULT_PORTAL,
      username: null,
      configured: false,
      credentialStorage: null,
      passwordMask: null,
      configuredAt: null,
      lastSyncedAt: null,
      lastError: null,
      automationInstalledAt: null,
      automationInbox: null,
      automationSchedule: ['07:00', '15:00', '19:00', '23:00'],
      automationLastAttemptAt: null,
      historyStart: null,
      defaultSite: null,
      automationRuntime: 'TOQUEHUB_LOCAL_AGENT',
      platform: process.platform,
      requiredReports: ['orders', 'sales-overview'],
    };
  }

  private publicValue(
    connection: {
      id: string;
      portalUrl: string;
      username: string;
      credentialStorage: string;
      passwordMask: string;
      configuredAt: Date;
      lastSyncedAt: Date | null;
      lastError: string | null;
      automationInstalledAt: Date | null;
      automationInbox: string | null;
      automationSchedule: string[];
      automationLastAttemptAt: Date | null;
      historyStart: Date | null;
    },
    site: { id: string; name: string },
  ) {
    return {
      id: connection.id,
      portalUrl: connection.portalUrl,
      username: connection.username,
      configured: true,
      credentialStorage: connection.credentialStorage,
      passwordMask: connection.passwordMask,
      configuredAt: connection.configuredAt,
      lastSyncedAt: connection.lastSyncedAt,
      lastError: connection.lastError,
      automationInstalledAt: connection.automationInstalledAt,
      automationInbox: connection.automationInbox,
      automationSchedule: connection.automationSchedule,
      automationLastAttemptAt: connection.automationLastAttemptAt,
      historyStart: connection.historyStart,
      defaultSite: site,
      automationRuntime: 'TOQUEHUB_LOCAL_AGENT',
      platform: process.platform,
      requiredReports: ['orders', 'sales-overview'],
    };
  }
}
