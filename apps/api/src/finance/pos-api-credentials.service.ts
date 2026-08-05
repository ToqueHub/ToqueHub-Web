import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { FinancePosAuthMode, FinanceProvider, FinanceSourceType } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import type { ConfigurePosApiDto } from './dto/finance.dto';
import { FennoaSecretService } from './fennoa-secret.service';
import { FinancePolicy } from './finance.policy';

export const POS_API_PROVIDERS = [FinanceProvider.LOYVERSE, FinanceProvider.PAYPAL_POS] as const;
export type PosApiProvider = (typeof POS_API_PROVIDERS)[number];

const PROVIDER_DEFAULTS: Record<
  PosApiProvider,
  { name: string; baseUrl: string; authMode: FinancePosAuthMode }
> = {
  LOYVERSE: {
    name: 'Loyverse',
    baseUrl: 'https://api.loyverse.com/v1.0',
    authMode: FinancePosAuthMode.PERSONAL_TOKEN,
  },
  PAYPAL_POS: {
    name: 'PayPal POS',
    baseUrl: 'https://purchase.izettle.com',
    authMode: FinancePosAuthMode.ASSERTION_GRANT,
  },
};

export function posApiProvider(value: string): PosApiProvider {
  const normalized = value.trim().toUpperCase().replace(/-/g, '_');
  if (normalized === FinanceProvider.LOYVERSE) return FinanceProvider.LOYVERSE;
  if (normalized === FinanceProvider.PAYPAL_POS || normalized === 'ZETTLE') {
    return FinanceProvider.PAYPAL_POS;
  }
  throw new BadRequestException('Connecteur POS non pris en charge.');
}

@Injectable()
export class PosApiCredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: FinancePolicy,
    private readonly secrets: FennoaSecretService,
  ) {}

  async configure(
    organizationId: string,
    actor: AuthenticatedUser,
    provider: PosApiProvider,
    dto: ConfigurePosApiDto,
  ) {
    this.policy.assertPermission(actor, 'finance.manage');
    const site = await this.prisma.site.findFirst({
      where: { id: dto.siteId, organizationId, isArchived: false },
      select: { id: true, name: true },
    });
    if (!site) throw new BadRequestException('Établissement ToqueHub introuvable.');
    await this.normalizeLegacyFingerprints(organizationId, provider);
    const current = await this.prisma.financePosConnection.findUnique({
      where: {
        organizationId_provider_defaultSiteId: {
          organizationId,
          provider,
          defaultSiteId: site.id,
        },
      },
    });
    const secret = dto.secret?.trim();
    if (!secret && !current?.secretEncrypted) {
      throw new BadRequestException(
        provider === FinanceProvider.LOYVERSE
          ? 'Le jeton personnel Loyverse est requis.'
          : 'La clé API PayPal POS/Zettle est requise.',
      );
    }
    const clientId = dto.clientId?.trim() || current?.clientId || null;
    if (provider === FinanceProvider.PAYPAL_POS && !clientId) {
      throw new BadRequestException('Le Client ID PayPal POS/Zettle est requis.');
    }
    const defaults = PROVIDER_DEFAULTS[provider];
    const effectiveSecret = secret || this.secrets.decrypt(current!.secretEncrypted);
    const accountFingerprint = this.accountFingerprint(provider, clientId, effectiveSecret);
    const conflictingConnection = await this.prisma.financePosConnection.findFirst({
      where: {
        organizationId,
        provider,
        accountFingerprint,
        defaultSiteId: { not: site.id },
      },
      include: { defaultSite: { select: { name: true } } },
    });
    if (conflictingConnection) {
      throw new BadRequestException(
        `Ce compte ${defaults.name} est déjà rattaché à ${conflictingConnection.defaultSite.name}. Utilisez un compte distinct pour ${site.name}.`,
      );
    }
    const connection = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.financePosConnection.upsert({
        where: {
          organizationId_provider_defaultSiteId: {
            organizationId,
            provider,
            defaultSiteId: site.id,
          },
        },
        update: {
          defaultSiteId: site.id,
          accountFingerprint,
          clientId,
          ...(secret
            ? {
                secretEncrypted: this.secrets.encrypt(secret),
                secretMask: this.secrets.mask(secret),
              }
            : {}),
          apiBaseUrl: (dto.baseUrl || current?.apiBaseUrl || defaults.baseUrl).replace(/\/$/, ''),
          historyStart: dto.historyStart ? new Date(dto.historyStart) : current?.historyStart,
          schedule: dto.schedule?.length ? [...new Set(dto.schedule)].sort() : current?.schedule,
          configuredAt: new Date(),
          lastError: null,
        },
        create: {
          organizationId,
          defaultSiteId: site.id,
          provider,
          accountFingerprint,
          authMode: defaults.authMode,
          clientId,
          secretEncrypted: this.secrets.encrypt(secret!),
          secretMask: this.secrets.mask(secret!),
          apiBaseUrl: (dto.baseUrl || defaults.baseUrl).replace(/\/$/, ''),
          historyStart: dto.historyStart ? new Date(dto.historyStart) : null,
          schedule: dto.schedule?.length ? [...new Set(dto.schedule)].sort() : undefined,
        },
      });
      const existingSource = await tx.financeDataSource.findFirst({
        where: { organizationId, provider, siteId: site.id, externalLocationId: null },
      });
      if (existingSource) {
        await tx.financeDataSource.update({
          where: { id: existingSource.id },
          data: {
            sourceType: FinanceSourceType.POS_API,
            isPrimarySales: true,
            // Une caisse déjà détectée peut avoir été rattachée manuellement à un autre site.
            ...(existingSource.externalLocationId ? {} : { siteId: site.id }),
          },
        });
      } else {
        const baseName = `${defaults.name} · ${site.name}`;
        const collision = await tx.financeDataSource.findUnique({
          where: { organizationId_provider_name: { organizationId, provider, name: baseName } },
          select: { id: true },
        });
        await tx.financeDataSource.create({
          data: {
            organizationId,
            siteId: site.id,
            provider,
            name: collision ? `${baseName} · ${site.id.slice(0, 8)}` : baseName,
            sourceType: FinanceSourceType.POS_API,
            isPrimarySales: true,
          },
        });
      }
      return saved;
    });
    return this.publicValue(connection, site);
  }

  async publicSettings(organizationId: string) {
    const connections = await this.prisma.financePosConnection.findMany({
      where: { organizationId },
      include: { defaultSite: { select: { id: true, name: true } } },
    });
    const valuesFor = (provider: PosApiProvider) =>
      connections
        .filter((connection) => connection.provider === provider)
        .map((connection) => this.publicValue(connection, connection.defaultSite));
    const loyverse = valuesFor(FinanceProvider.LOYVERSE);
    const paypalPos = valuesFor(FinanceProvider.PAYPAL_POS);
    return {
      loyverse: {
        ...(loyverse[0] ?? this.emptyValue(FinanceProvider.LOYVERSE)),
        connections: loyverse,
      },
      paypalPos: {
        ...(paypalPos[0] ?? this.emptyValue(FinanceProvider.PAYPAL_POS)),
        connections: paypalPos,
      },
    };
  }

  async credentials(organizationId: string, provider: PosApiProvider, siteId?: string) {
    await this.normalizeLegacyFingerprints(organizationId, provider);
    const connections = await this.prisma.financePosConnection.findMany({
      where: { organizationId, provider, ...(siteId ? { defaultSiteId: siteId } : {}) },
      orderBy: { configuredAt: 'asc' },
      take: 2,
    });
    if (!siteId && connections.length > 1) {
      throw new BadRequestException('Choisissez l’établissement de cette connexion POS.');
    }
    const connection = connections[0];
    if (!connection)
      throw new ServiceUnavailableException('La connexion POS n’est pas configurée.');
    return {
      ...connection,
      secret: this.secrets.decrypt(connection.secretEncrypted),
    };
  }

  async recordSync(
    organizationId: string,
    provider: PosApiProvider,
    siteId: string,
    error?: string,
  ) {
    await this.prisma.financePosConnection.update({
      where: {
        organizationId_provider_defaultSiteId: {
          organizationId,
          provider,
          defaultSiteId: siteId,
        },
      },
      data: error ? { lastError: error } : { lastSyncedAt: new Date(), lastError: null },
    });
  }

  private async normalizeLegacyFingerprints(organizationId: string, provider: PosApiProvider) {
    const legacyConnections = await this.prisma.financePosConnection.findMany({
      where: {
        organizationId,
        provider,
        accountFingerprint: { startsWith: 'legacy:' },
      },
    });
    for (const connection of legacyConnections) {
      const secret = this.secrets.decrypt(connection.secretEncrypted);
      await this.prisma.financePosConnection.update({
        where: { id: connection.id },
        data: {
          accountFingerprint: this.accountFingerprint(provider, connection.clientId, secret),
        },
      });
    }
  }

  private accountFingerprint(provider: PosApiProvider, clientId: string | null, secret: string) {
    return createHash('sha256')
      .update(`${provider}:${clientId ?? ''}:${secret}`, 'utf8')
      .digest('hex');
  }

  private emptyValue(provider: PosApiProvider) {
    const defaults = PROVIDER_DEFAULTS[provider];
    return {
      id: null,
      provider,
      configured: false,
      authMode: defaults.authMode,
      clientId: null,
      secretMask: null,
      apiBaseUrl: defaults.baseUrl,
      historyStart: null,
      schedule: ['07:00', '15:00', '19:00', '23:00'],
      configuredAt: null,
      lastSyncedAt: null,
      lastError: null,
      defaultSite: null,
      runtime: 'TOQUEHUB_LOCAL_API',
    };
  }

  private publicValue(
    connection: {
      id: string;
      provider: FinanceProvider;
      authMode: FinancePosAuthMode;
      clientId: string | null;
      secretMask: string;
      apiBaseUrl: string;
      historyStart: Date | null;
      schedule: string[];
      configuredAt: Date;
      lastSyncedAt: Date | null;
      lastError: string | null;
    },
    site: { id: string; name: string },
  ) {
    return {
      id: connection.id,
      provider: connection.provider,
      configured: true,
      authMode: connection.authMode,
      clientId: connection.clientId,
      secretMask: connection.secretMask,
      apiBaseUrl: connection.apiBaseUrl,
      historyStart: connection.historyStart,
      schedule: connection.schedule,
      configuredAt: connection.configuredAt,
      lastSyncedAt: connection.lastSyncedAt,
      lastError: connection.lastError,
      defaultSite: site,
      runtime: 'TOQUEHUB_LOCAL_API',
    };
  }
}
