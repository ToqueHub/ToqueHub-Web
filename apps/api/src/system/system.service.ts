import { Injectable } from '@nestjs/common';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { arch, cpus, freemem, hostname, platform, release, totalmem, uptime as osUptime } from 'node:os';
import { resolve } from 'node:path';
import process from 'node:process';
import { resolveAppPackageInfo } from '../common/app-version';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/authenticated-user';

const ADMIN_ROLES = ['SUPER_ADMIN', 'Administrateur'];
const STARTED_AT = new Date();

type SafeUrlInfo = {
  configured: boolean;
  protocol: string | null;
  host: string | null;
  hostname: string | null;
  port: string | null;
  database?: string | null;
  redacted: string | null;
};

type RemoteAccessStatus = {
  status: 'inactive' | 'needs_login' | 'active' | 'unavailable';
  url: string | null;
  loginUrl: string | null;
  hostname: string | null;
  dnsName?: string | null;
  dnsUrl?: string | null;
  magicDnsReady?: boolean;
  ip: string | null;
  message: string;
};

function env(name: string, fallback = '') {
  return process.env[name] || fallback;
}

function boolEnv(name: string, fallback = false) {
  const value = env(name);
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function parseSafeUrl(value?: string): SafeUrlInfo {
  if (!value) {
    return { configured: false, protocol: null, host: null, hostname: null, port: null, redacted: null };
  }

  try {
    const parsed = new URL(value);
    const redacted = new URL(value);
    if (redacted.username) redacted.username = '***';
    if (redacted.password) redacted.password = '***';

    return {
      configured: true,
      protocol: parsed.protocol.replace(':', ''),
      host: parsed.host,
      hostname: parsed.hostname,
      port: parsed.port || null,
      database: parsed.pathname ? parsed.pathname.replace(/^\//, '') || null : null,
      redacted: redacted.toString(),
    };
  } catch {
    return {
      configured: true,
      protocol: null,
      host: null,
      hostname: null,
      port: null,
      redacted: value.replace(/\/\/([^:@/]+):([^@/]+)@/, '//***:***@'),
    };
  }
}

function isContainerized() {
  if (existsSync('/.dockerenv')) return true;

  try {
    return readFileSync('/proc/1/cgroup', 'utf8').includes('docker');
  } catch {
    return false;
  }
}

function detectSerialPorts() {
  const ports = new Set<string>();
  const byIdDir = '/dev/serial/by-id';

  if (existsSync(byIdDir)) {
    try {
      for (const entry of readdirSync(byIdDir)) {
        ports.add(`${byIdDir}/${entry}`);
      }
    } catch {
      // Ignore devices that disappear while scanning.
    }
  }

  for (const prefix of ['/dev/ttyUSB', '/dev/ttyACM']) {
    for (let index = 0; index < 32; index += 1) {
      const candidate = `${prefix}${index}`;
      if (existsSync(candidate)) ports.add(candidate);
    }
  }

  return [...ports].sort();
}

function sameDevice(left: string | null, right: string | null) {
  if (!left || !right) return false;
  if (left === right) return true;

  try {
    return realpathSync(left) === realpathSync(right);
  } catch {
    return false;
  }
}

@Injectable()
export class SystemService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus() {
    const [organizationCount, adminCount] = await Promise.all([
      this.prisma.organization.count(),
      this.prisma.user.count({
        where: {
          role: {
            name: { in: ADMIN_ROLES },
          },
        },
      }),
    ]);

    const hasOrganization = organizationCount > 0;
    const hasAdmin = adminCount > 0;

    return {
      initialized: hasOrganization && hasAdmin,
      hasOrganization,
      hasAdmin,
    };
  }

  async getInstanceInfo() {
    const database = parseSafeUrl(env('DATABASE_URL'));
    const mqtt = parseSafeUrl(env('MQTT_URL'));
    const appPackage = resolveAppPackageInfo();
    let databaseConnected = false;
    let databaseError: string | null = null;

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      databaseConnected = true;
    } catch (error) {
      databaseError = error instanceof Error ? error.message : 'Connexion PostgreSQL impossible';
    }

    const port = env('PORT', '3000');
    const webPort = env('TOQUEHUB_HTTP_PORT', '8080');
    const zigbeeAdapterPath = env('ZIGBEE_ADAPTER_PATH') || env('ZIGBEE2MQTT_SERIAL_PORT') || null;
    const detectedSerialPorts = detectSerialPorts();
    const configuredAdapterPresent = zigbeeAdapterPath
      ? detectedSerialPorts.some((portPath) => sameDevice(zigbeeAdapterPath, portPath))
      : detectedSerialPorts.length > 0;
    const corsOrigins = env('CORS_ORIGIN')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    const preferredWebOrigin = env('TOQUEHUB_WEB_URL') || corsOrigins[0] || `http://localhost:${webPort}`;
    const remoteAccess = await this.getRemoteAccessStatus().catch(() => this.remoteAccessFromEnv());

    return {
      generatedAt: new Date().toISOString(),
      app: {
        name: 'ToqueHub',
        apiPackage: appPackage.name,
        version: appPackage.version,
        license: appPackage.license,
        nodeEnv: env('NODE_ENV', 'development'),
      },
      frontend: {
        url: preferredWebOrigin,
        configuredOrigins: corsOrigins,
        dockerPort: webPort,
      },
      api: {
        url: env('TOQUEHUB_API_URL') || `http://localhost:${port}/api`,
        port,
        basePath: '/api',
        docsPath: '/api/docs',
        uptimeSeconds: Math.round(process.uptime()),
        startedAt: STARTED_AT.toISOString(),
      },
      docker: {
        containerized: isContainerized(),
        composeProject: env('COMPOSE_PROJECT_NAME', 'toquehub'),
        imageRegistry: env('TOQUEHUB_IMAGE_REGISTRY') || null,
        imageTag: env('TOQUEHUB_IMAGE_TAG') || null,
        architecture: process.arch,
      },
      remoteAccess: {
        provider: 'tailscale',
        enabled: remoteAccess.status !== 'inactive' && remoteAccess.status !== 'unavailable',
        installed: remoteAccess.status !== 'unavailable',
        active: remoteAccess.status === 'active',
        status: remoteAccess.status,
        hostname: remoteAccess.hostname,
        url: remoteAccess.url,
        ip: remoteAccess.ip,
        loginUrl: remoteAccess.loginUrl,
        message: remoteAccess.message,
        activationCommand: `sudo tailscale up --hostname ${remoteAccess.hostname || 'toquehub'}`,
      },
      database: {
        provider: 'postgresql',
        connected: databaseConnected,
        error: databaseError,
        host: database.hostname,
        port: database.port || '5432',
        database: database.database,
        url: database.redacted,
      },
      mqtt: {
        configured: mqtt.configured,
        broker: mqtt.redacted,
        host: mqtt.hostname,
        port: mqtt.port || (mqtt.configured ? '1883' : null),
        usernameConfigured: Boolean(env('MQTT_USERNAME')),
        baseTopic: env('ZIGBEE2MQTT_BASE_TOPIC', 'zigbee2mqtt'),
        zigbee2mqttFrontendUrl: env('ZIGBEE2MQTT_FRONTEND_URL') || null,
        zigbeeAdapterPath,
        zigbeeAdapterPresent: configuredAdapterPresent,
        detectedSerialPorts,
        suggestedZigbeeAdapterPath: detectedSerialPorts[0] ?? null,
      },
      storage: {
        backupDir: resolve(env('BACKUP_DIR', 'backups')),
        uploadDir: resolve(env('UPLOAD_DIR', 'uploads')),
        hrUploadDir: resolve(env('HR_UPLOAD_DIR') || resolve(env('UPLOAD_DIR', 'uploads'), 'hr')),
        stocksOcrUploadDir: resolve(env('STOCKS_OCR_UPLOAD_DIR') || resolve(env('UPLOAD_DIR', 'uploads'), 'stocks-ocr')),
        haccpUploadDir: resolve(env('HACCP_UPLOAD_DIR') || resolve(env('UPLOAD_DIR', 'uploads'), 'haccp')),
      },
      host: {
        hostname: hostname(),
        platform: platform(),
        release: release(),
        arch: arch(),
        node: process.version,
        cpuCount: cpus().length,
        totalMemoryBytes: totalmem(),
        freeMemoryBytes: freemem(),
        uptimeSeconds: Math.round(osUptime()),
      },
    };
  }

  async getRemoteAccessStatus(user?: AuthenticatedUser): Promise<RemoteAccessStatus> {
    const status = await this.callRemoteAgent('GET', '/status').catch(() => this.remoteAccessFromEnv('Agent d’accès distant indisponible.'));
    await this.syncOrganizationRemoteAccess(user, status);
    return status;
  }

  async activateRemoteAccess(user: AuthenticatedUser): Promise<RemoteAccessStatus> {
    const status = await this.callRemoteAgent('POST', '/activate').catch(() => this.remoteAccessFromEnv('Agent d’accès distant indisponible.'));
    await this.syncOrganizationRemoteAccess(user, status);
    return status;
  }

  async refreshRemoteAccess(user: AuthenticatedUser): Promise<RemoteAccessStatus> {
    const status = await this.callRemoteAgent('POST', '/refresh').catch(() => this.remoteAccessFromEnv('Agent d’accès distant indisponible.'));
    await this.syncOrganizationRemoteAccess(user, status);
    return status;
  }

  private remoteAccessFromEnv(message?: string): RemoteAccessStatus {
    const hostname = env('TOQUEHUB_TAILSCALE_HOSTNAME', 'toquehub');
    const ip = env('TOQUEHUB_TAILSCALE_IP') || null;
    const dnsName = env('TOQUEHUB_TAILSCALE_DNS_NAME') || null;
    const port = env('TOQUEHUB_HTTP_PORT', '8080');
    const host = dnsName || ip;
    const url = env('TOQUEHUB_REMOTE_ACCESS_URL') || (host ? `http://${host}${port === '80' ? '' : `:${port}`}` : null);
    const installed = boolEnv('TOQUEHUB_TAILSCALE_INSTALLED', boolEnv('TOQUEHUB_TAILSCALE_ENABLED') || Boolean(ip || url));
    return {
      status: url || ip ? 'active' : installed ? 'inactive' : 'unavailable',
      url,
      loginUrl: null,
      hostname,
      dnsName,
      dnsUrl: dnsName ? `http://${dnsName}${port === '80' ? '' : `:${port}`}` : null,
      magicDnsReady: Boolean(dnsName && url && url.includes(dnsName)),
      ip,
      message: message || (url || ip ? 'Accès distant actif.' : installed ? 'Accès distant prêt à être activé.' : 'Agent d’accès distant indisponible.'),
    };
  }

  private async callRemoteAgent(method: 'GET' | 'POST', path: string): Promise<RemoteAccessStatus> {
    const baseUrl = env('TOQUEHUB_REMOTE_AGENT_URL');
    const secret = env('TOQUEHUB_REMOTE_AGENT_SECRET');
    if (!baseUrl || !secret) return this.remoteAccessFromEnv('Agent d’accès distant non configuré.');
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
      method,
      headers: { 'X-ToqueHub-Remote-Agent-Secret': secret },
    });
    if (!response.ok) {
      return this.remoteAccessFromEnv(`Agent d’accès distant a répondu ${response.status}.`);
    }
    const body = await response.json() as Partial<RemoteAccessStatus>;
    const normalizedStatus = body.status === 'active' || body.status === 'needs_login' || body.status === 'inactive' || body.status === 'unavailable' ? body.status : 'unavailable';
    return {
      status: normalizedStatus,
      url: body.url ?? null,
      loginUrl: body.loginUrl ?? null,
      hostname: body.hostname ?? env('TOQUEHUB_TAILSCALE_HOSTNAME', 'toquehub'),
      dnsName: body.dnsName ?? null,
      dnsUrl: body.dnsUrl ?? null,
      magicDnsReady: body.magicDnsReady === true,
      ip: body.ip ?? null,
      message: body.message ?? 'Statut accès distant récupéré.',
    };
  }

  private async syncOrganizationRemoteAccess(user: AuthenticatedUser | undefined, status: RemoteAccessStatus) {
    if (!user?.organizationId) return;
    await this.prisma.organization.update({
      where: { id: user.organizationId },
      data: {
        tailscaleEnabled: status.status === 'active' || status.status === 'needs_login',
        tailscaleHostname: status.hostname || null,
        tailscaleUrl: status.url || null,
        tailscaleIp: status.ip || null,
        tailscaleUpdatedAt: new Date(),
      },
    }).catch(() => undefined);
  }
}
