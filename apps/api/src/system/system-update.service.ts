import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { PrismaService } from '../prisma/prisma.service';

type GithubRelease = {
  tag_name?: string;
  name?: string;
  html_url?: string;
  published_at?: string;
  created_at?: string;
  body?: string;
  draft?: boolean;
  prerelease?: boolean;
  source?: 'release' | 'tag';
};

type GithubTag = {
  name?: string;
  zipball_url?: string;
  tarball_url?: string;
  commit?: { sha?: string; url?: string };
};

type UpdaterOperation = {
  id: string;
  status: 'queued' | 'running' | 'success' | 'error' | 'rollback';
  targetTag?: string;
  startedAt: string;
  finishedAt?: string | null;
  logs: string[];
  error?: string | null;
};

function env(name: string, fallback = '') {
  return process.env[name] || fallback;
}

function normalizeVersion(value?: string | null) {
  return (value || '').trim().replace(/^v/i, '');
}

function compareVersions(left?: string | null, right?: string | null) {
  const leftParts = normalizeVersion(left).split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = normalizeVersion(right).split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length, 3);

  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (diff !== 0) return diff;
  }

  return 0;
}

function readPackageVersion() {
  const candidates = [
    resolve(process.cwd(), 'package.json'),
    resolve(process.cwd(), 'apps/api/package.json'),
    resolve(__dirname, '../../../package.json'),
    resolve(__dirname, '../../package.json'),
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      const payload = JSON.parse(readFileSync(candidate, 'utf8')) as { version?: string };
      if (payload.version) return payload.version;
    } catch {
      // Continue.
    }
  }

  return '1.0.0';
}

function githubHeaders(token?: string | null) {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'toquehub-update-checker',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function githubApiError(endpoint: string, status: number, token?: string | null) {
  if (status === 404 && !token) {
    return `${endpoint} a répondu 404. Si le dépôt est privé, configurez un token GitHub en lecture seule dans Organisation > Général.`;
  }
  return `${endpoint} a répondu ${status}`;
}

@Injectable()
export class SystemUpdateService {
  private latestReleaseCache: { checkedAt: string; release: GithubRelease | null; error: string | null } | null = null;
  private changelogCache: {
    checkedAt: string;
    repo: string;
    entries: Array<{
      version: string;
      tag: string;
      name: string | null;
      url: string | null;
      publishedAt: string | null;
      notes: string | null;
      isInstalled: boolean;
      isLatest: boolean;
    }>;
    currentVersion: string;
    latestTag: string | null;
    error: string | null;
  } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async getStatus(force = false) {
    const imageTag = env('TOQUEHUB_IMAGE_TAG') || 'local';
    const installedVersion = normalizeVersion(env('TOQUEHUB_VERSION') || (imageTag !== 'latest' && imageTag !== 'local' ? imageTag : readPackageVersion()));
    const githubToken = await this.getGithubToken();
    const release = await this.getLatestRelease(force, githubToken);
    const latestVersion = normalizeVersion(release.release?.tag_name);
    const updater = await this.callUpdater<{ capable: boolean; platform?: string; currentTag?: string; lastOperation?: UpdaterOperation | null }>('GET', '/status').catch((error) => ({
      capable: false,
      error: error instanceof Error ? error.message : 'Updater indisponible',
    } as any));

    return {
      channel: 'stable',
      checkedAt: release.checkedAt,
      current: {
        version: installedVersion,
        imageTag,
        registry: env('TOQUEHUB_IMAGE_REGISTRY') || null,
        apiImage: `${env('TOQUEHUB_IMAGE_REGISTRY', 'ghcr.io/toquehub')}/toquehub-api:${imageTag}`,
        webImage: `${env('TOQUEHUB_IMAGE_REGISTRY', 'ghcr.io/toquehub')}/toquehub-web:${imageTag}`,
      },
      latest: release.release ? {
        version: latestVersion,
        tag: release.release.tag_name ?? null,
        name: release.release.name ?? release.release.tag_name ?? null,
        url: release.release.html_url ?? null,
        publishedAt: release.release.published_at ?? null,
        notes: release.release.body ?? null,
        source: release.release.source ?? 'release',
      } : null,
      updateAvailable: Boolean(latestVersion && compareVersions(latestVersion, installedVersion) > 0),
      github: {
        repo: env('TOQUEHUB_RELEASE_REPO', 'ToqueHub/ToqueHub-Web'),
        error: release.error,
      },
      runtime: {
        platform: this.platformLabel(updater.platform),
        updaterAvailable: Boolean(updater.capable),
        updaterError: (updater as any).error ?? null,
        lastOperation: updater.lastOperation ?? null,
      },
    };
  }

  async checkNow() {
    return this.getStatus(true);
  }

  async getChangelog() {
    const githubToken = await this.getGithubToken();
    if (this.changelogCache && !this.changelogCache.error && Date.now() - Date.parse(this.changelogCache.checkedAt) < 5 * 60 * 1000) return this.changelogCache;

    const checkedAt = new Date().toISOString();
    const repo = env('TOQUEHUB_RELEASE_REPO', 'ToqueHub/ToqueHub-Web');
    const imageTag = env('TOQUEHUB_IMAGE_TAG') || 'local';
    const currentVersion = normalizeVersion(env('TOQUEHUB_VERSION') || (imageTag !== 'latest' && imageTag !== 'local' ? imageTag : readPackageVersion()));

    try {
      const response = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=10`, {
        headers: githubHeaders(githubToken),
      });

      if (!response.ok) {
        throw new Error(githubApiError('GitHub releases', response.status, githubToken));
      }

      const releases = (await response.json() as GithubRelease[])
        .filter((release) => !release.draft && !release.prerelease && /^v?\d+\.\d+\.\d+/.test(release.tag_name ?? ''))
        .sort((left, right) => compareVersions(right.tag_name, left.tag_name));
      const latestTag = releases[0]?.tag_name ?? null;

      this.changelogCache = {
        checkedAt,
        repo,
        currentVersion,
        latestTag,
        error: null,
        entries: releases.map((release) => {
          const version = normalizeVersion(release.tag_name);
          return {
            version,
            tag: release.tag_name ?? version,
            name: release.name ?? release.tag_name ?? null,
            url: release.html_url ?? null,
            publishedAt: release.published_at ?? release.created_at ?? null,
            notes: release.body ?? null,
            isInstalled: Boolean(version && compareVersions(version, currentVersion) === 0),
            isLatest: Boolean(latestTag && release.tag_name === latestTag),
          };
        }),
      };
    } catch (error) {
      this.changelogCache = {
        checkedAt,
        repo,
        currentVersion,
        latestTag: null,
        entries: [],
        error: error instanceof Error ? error.message : 'Impossible de contacter GitHub Releases.',
      };
    }

    return this.changelogCache;
  }

  async applyUpdate() {
    const status = await this.getStatus(true);
    if (!status.latest?.tag) {
      throw new ServiceUnavailableException('Aucune release stable disponible.');
    }
    if (!status.updateAvailable) {
      return { skipped: true, message: 'ToqueHub est déjà à jour.', status };
    }

    const operation = await this.callUpdater<UpdaterOperation>('POST', '/apply', {
      targetTag: status.latest.tag,
      targetVersion: status.latest.version,
      githubToken: await this.getGithubToken(),
    });

    return { skipped: false, operation };
  }

  async getOperation(id: string) {
    return this.callUpdater<UpdaterOperation>('GET', `/operations/${encodeURIComponent(id)}`);
  }

  private async getLatestRelease(force: boolean, githubToken?: string | null) {
    if (!force && this.latestReleaseCache) return this.latestReleaseCache;

    const checkedAt = new Date().toISOString();
    const repo = env('TOQUEHUB_RELEASE_REPO', 'ToqueHub/ToqueHub-Web');

    try {
      const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
        headers: githubHeaders(githubToken),
      });

      if (response.ok) {
        this.latestReleaseCache = {
          checkedAt,
          release: { ...(await response.json() as GithubRelease), source: 'release' },
          error: null,
        };
        return this.latestReleaseCache;
      }

      if (response.status !== 404) {
        throw new Error(githubApiError('GitHub releases/latest', response.status, githubToken));
      }

      const tagRelease = await this.getLatestStableTag(repo, githubToken);
      this.latestReleaseCache = {
        checkedAt,
        release: tagRelease,
        error: tagRelease ? null : 'Aucune release GitHub ni tag stable v* disponible.',
      };
    } catch (error) {
      this.latestReleaseCache = {
        checkedAt,
        release: null,
        error: error instanceof Error ? error.message : 'Impossible de contacter GitHub Releases.',
      };
    }

    return this.latestReleaseCache;
  }

  private async getLatestStableTag(repo: string, githubToken?: string | null): Promise<GithubRelease | null> {
    const response = await fetch(`https://api.github.com/repos/${repo}/tags?per_page=100`, {
      headers: githubHeaders(githubToken),
    });

    if (!response.ok) {
      throw new Error(githubApiError('GitHub tags', response.status, githubToken));
    }

    const tags = (await response.json() as GithubTag[])
      .filter((tag) => /^v?\d+\.\d+\.\d+/.test(tag.name ?? ''))
      .sort((left, right) => compareVersions(right.name, left.name));
    const tag = tags[0];
    if (!tag?.name) return null;

    return {
      tag_name: tag.name,
      name: tag.name,
      html_url: `https://github.com/${repo}/releases/tag/${tag.name}`,
      body: 'Version stable détectée depuis les tags GitHub. Créez une GitHub Release pour afficher les notes de version.',
      source: 'tag',
    };
  }

  private async callUpdater<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const url = env('TOQUEHUB_UPDATER_URL');
    const secret = env('TOQUEHUB_UPDATER_SECRET');
    if (!url || !secret) {
      throw new ServiceUnavailableException('Updater non configuré.');
    }

    const response = await fetch(`${url.replace(/\/$/, '')}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-ToqueHub-Updater-Secret': secret,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      let message = `Updater a répondu ${response.status}`;
      try {
        const payload = await response.json() as { error?: string };
        if (payload.error) message = payload.error;
      } catch {
        // Keep default message.
      }
      throw new BadGatewayException(message);
    }

    return response.json() as Promise<T>;
  }

  private platformLabel(value?: string) {
    const arch = value || process.arch;
    if (arch.includes('arm64') || arch.includes('aarch64')) return 'Docker arm64 / Raspberry compatible';
    if (arch.includes('x64') || arch.includes('amd64')) return 'Docker x86_64';
    return `Docker ${arch}`;
  }

  private async getGithubToken() {
    const token = env('TOQUEHUB_GITHUB_TOKEN');
    if (token) return token;
    const organization = await this.prisma.organization.findFirst({
      where: { githubToken: { not: null } },
      orderBy: { githubTokenUpdatedAt: 'desc' },
      select: { githubToken: true },
    });
    return organization?.githubToken ?? null;
  }
}
