import { Injectable } from '@nestjs/common';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { arch, cpus, freemem, hostname, platform, release, totalmem, uptime as osUptime } from 'node:os';
import { resolve } from 'node:path';
import process from 'node:process';
import { PrismaService } from '../prisma/prisma.service';

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

function env(name: string, fallback = '') {
  return process.env[name] || fallback;
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

function readPackageVersion() {
  const candidates = [
    resolve(process.cwd(), 'apps/api/package.json'),
    resolve(process.cwd(), 'package.json'),
    resolve(__dirname, '../../package.json'),
    resolve(__dirname, '../../../package.json'),
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      const content = JSON.parse(readFileSync(candidate, 'utf8')) as { name?: string; version?: string; license?: string };
      if (content.version) {
        return {
          name: content.name ?? '@toquehub/api',
          version: content.version,
          license: content.license ?? null,
        };
      }
    } catch {
      // Continue with the next candidate.
    }
  }

  return { name: '@toquehub/api', version: env('npm_package_version', '0.1.0'), license: null };
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
    const appPackage = readPackageVersion();
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
}
