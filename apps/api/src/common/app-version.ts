import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

export type AppPackageInfo = {
  name: string;
  version: string;
  license: string | null;
};

function env(name: string) {
  return process.env[name]?.trim() || '';
}

function isConcreteVersion(value: string) {
  return Boolean(value && !['latest', 'local'].includes(value.toLowerCase()));
}

function readPackageInfo(): AppPackageInfo {
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

  return { name: '@toquehub/api', version: '0.1.0', license: null };
}

export function resolveAppPackageInfo(): AppPackageInfo {
  const packageInfo = readPackageInfo();
  const configuredVersion = env('TOQUEHUB_VERSION');
  const imageTag = env('TOQUEHUB_IMAGE_TAG');
  const npmPackageVersion = env('npm_package_version');
  const version =
    (isConcreteVersion(configuredVersion) && configuredVersion) ||
    (isConcreteVersion(imageTag) && imageTag) ||
    (isConcreteVersion(npmPackageVersion) && npmPackageVersion) ||
    packageInfo.version;

  return {
    ...packageInfo,
    version: version.replace(/^v/i, ''),
  };
}
