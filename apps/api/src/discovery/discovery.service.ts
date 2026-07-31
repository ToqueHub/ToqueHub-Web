import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import { hostname } from 'os';
import { resolveAppPackageInfo } from '../common/app-version';
import { PrismaService } from '../prisma/prisma.service';
import { MdnsPublisher } from './mdns-publisher';
import type { DiscoveryInfo, DiscoveryTxtRecords } from './discovery.types';

const INSTANCE_ID_SETTING_KEY = 'discovery.instanceId';
const API_VERSION = 1;
const FALLBACK_INSTANCE_NAME = 'ToqueHub';

@Injectable()
export class DiscoveryService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DiscoveryService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly publisher: MdnsPublisher,
  ) {}

  async onApplicationBootstrap() {
    if (!this.discoveryEnabled()) {
      this.logger.log('Publication mDNS desactivee par TOQUEHUB_DISCOVERY_ENABLED.');
      return;
    }

    try {
      await this.publish();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Publication mDNS non demarree: ${message}`);
    }
  }

  onApplicationShutdown() {
    this.publisher.stop();
  }

  async getDiscoveryInfo(): Promise<DiscoveryInfo> {
    const [instanceId, organizationName, initialization] = await Promise.all([
      this.getInstanceId(),
      this.resolveOrganizationName(),
      this.resolveInitializationState(),
    ]);
    const instanceName = this.config.get<string>('TOQUEHUB_DISCOVERY_NAME')?.trim() || organizationName || FALLBACK_INSTANCE_NAME;
    const webUrl = this.resolveWebUrl();

    return {
      instanceId,
      instanceName,
      organization: organizationName || instanceName,
      version: this.resolveVersion(),
      apiVersion: API_VERSION,
      serverTime: new Date().toISOString(),
      supportsMobile: true,
      setupRequired: !initialization.hasAdmin || !initialization.hasOrganization,
      hasAdmin: initialization.hasAdmin,
      hasOrganization: initialization.hasOrganization,
      webUrl,
      recommendedUrl: webUrl,
    };
  }

  async publish() {
    const info = await this.getDiscoveryInfo();
    const host = this.resolveHost();
    const port = this.resolvePort();
    const txt = this.toTxtRecords(info, host, port);

    this.publisher.publish({
      name: this.resolveServiceName(info.instanceName, info.instanceId),
      port,
      host,
      txt,
    });
  }

  private resolveServiceName(instanceName: string, instanceId: string) {
    const suffix = instanceId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
    return suffix ? `${instanceName} (${suffix})` : instanceName;
  }

  private discoveryEnabled() {
    const value = this.config.get<string>('TOQUEHUB_DISCOVERY_ENABLED');
    if (value == null || value.trim() === '') return true;
    return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase());
  }

  private async getInstanceId() {
    const configured = this.config.get<string>('TOQUEHUB_INSTANCE_ID')?.trim();
    if (configured) return configured;

    try {
      const existing = await this.prisma.systemSetting.findUnique({
        where: { key: INSTANCE_ID_SETTING_KEY },
      });
      if (existing?.value) return existing.value;

      const value = randomUUID();
      const created = await this.prisma.systemSetting.create({
        data: { key: INSTANCE_ID_SETTING_KEY, value },
      });
      return created.value;
    } catch (error) {
      const raced = await this.prisma.systemSetting.findUnique({
        where: { key: INSTANCE_ID_SETTING_KEY },
      }).catch(() => null);
      if (raced?.value) return raced.value;

      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`InstanceId non persiste, fallback local utilise: ${message}`);
      return this.fallbackInstanceId();
    }
  }

  private fallbackInstanceId() {
    const basis = [
      hostname(),
      this.config.get<string>('DATABASE_URL') ?? '',
      this.config.get<string>('PORT') ?? '3000',
    ].join('|');
    const hash = createHash('sha256').update(basis).digest('hex');
    return `local-${hash.slice(0, 32)}`;
  }

  private async resolveOrganizationName() {
    const configured = this.config.get<string>('TOQUEHUB_DISCOVERY_ORGANIZATION')?.trim();
    if (configured) return configured;

    const mobileUser = await this.prisma.user.findFirst({
      where: {
        isActive: true,
        status: { not: 'DISABLED' as any },
        organization: { isNot: null },
      },
      include: { organization: true },
      orderBy: [
        { isPrimaryAdmin: 'desc' },
        { lastLoginAt: 'desc' },
        { createdAt: 'asc' },
      ],
    });
    const mobileOrganizationName = mobileUser?.organization?.name?.trim();
    if (mobileOrganizationName) return mobileOrganizationName;

    const organization = await this.prisma.organization.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { name: true },
    });
    return organization?.name?.trim() || '';
  }

  private async resolveInitializationState() {
    const [organizationCount, adminCount] = await Promise.all([
      this.prisma.organization.count(),
      this.prisma.user.count({
        where: {
          role: {
            name: { in: ['SUPER_ADMIN', 'Administrateur'] },
          },
        },
      }),
    ]);

    return {
      hasOrganization: organizationCount > 0,
      hasAdmin: adminCount > 0,
    };
  }

  private resolveWebUrl() {
    const configured = this.config.get<string>('TOQUEHUB_WEB_URL')?.trim();
    if (configured) return configured;

    const localHostname = this.config.get<string>('TOQUEHUB_LOCAL_HOSTNAME')?.trim() || 'toquehub-pi';
    const port = this.resolvePort();
    return `http://${localHostname}.local${port === 80 ? '' : `:${port}`}`;
  }

  private resolveVersion() {
    const configuredVersion = this.config.get<string>('TOQUEHUB_VERSION')?.trim();
    const imageTag = this.config.get<string>('TOQUEHUB_IMAGE_TAG')?.trim();
    const npmPackageVersion = this.config.get<string>('npm_package_version')?.trim();
    const version =
      (configuredVersion && !['latest', 'local'].includes(configuredVersion.toLowerCase()) && configuredVersion) ||
      (imageTag && !['latest', 'local'].includes(imageTag.toLowerCase()) && imageTag) ||
      npmPackageVersion ||
      resolveAppPackageInfo().version;

    return version.replace(/^v/i, '');
  }

  private resolveHost() {
    return this.config.get<string>('TOQUEHUB_DISCOVERY_HOST')?.trim() || undefined;
  }

  private resolvePort() {
    const configured =
      this.config.get<string>('TOQUEHUB_DISCOVERY_PORT') ||
      this.config.get<string>('TOQUEHUB_HTTP_PORT') ||
      this.config.get<string>('PORT') ||
      '3000';
    const port = Number(configured);
    return Number.isFinite(port) && port > 0 ? port : 3000;
  }

  private toTxtRecords(info: DiscoveryInfo, host: string | undefined, port: number): DiscoveryTxtRecords {
    const https = ['true', '1', 'yes', 'on'].includes(
      String(this.config.get<string>('TOQUEHUB_DISCOVERY_HTTPS') || '').trim().toLowerCase(),
    );

    return {
      instanceId: info.instanceId,
      instanceName: info.instanceName,
      version: info.version,
      apiVersion: String(info.apiVersion),
      organization: info.organization,
      https: String(https),
      ...(host ? { host } : {}),
      port: String(port),
    };
  }
}
