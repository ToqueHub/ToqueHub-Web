#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..');
const ENV_PATH = resolve(ROOT_DIR, '.env');
const TOOL_NAMES = ['pg_dump', 'pg_restore'];
const SUPPORTED_MAJORS = [18, 17, 16, 15, 14, 13];
const PLACEHOLDER_PATTERN = /(?:absolute[\\/]path|replace-with|change-me|^\s*$)/i;

function run(command, args = [], options = {}) {
  return execFileSync(command, args, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();
}

function tryRun(command, args = [], options = {}) {
  try {
    return run(command, args, options);
  } catch {
    return null;
  }
}

function parseEnv(source) {
  const values = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function quoteEnv(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function upsertEnv(source, key, value) {
  const line = `${key}=${quoteEnv(value)}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(source)) return source.replace(pattern, line);
  return `${source.replace(/\s*$/, '')}\n${line}\n`;
}

function executableName(name) {
  return platform() === 'win32' ? `${name}.exe` : name;
}

function commandPath(name) {
  const locator = platform() === 'win32' ? 'where.exe' : 'sh';
  const args = platform() === 'win32' ? [name] : ['-lc', `command -v ${name}`];
  const output = tryRun(locator, args);
  return output?.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? null;
}

function listDirectories(path) {
  try {
    return readdirSync(path, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map((entry) => join(path, entry.name));
  } catch {
    return [];
  }
}

function candidateBinDirectories(env) {
  const home = homedir();
  const directories = [
    dirname(env.PG_DUMP_PATH || ''),
    dirname(env.PG_RESTORE_PATH || ''),
    join(home, '.local', 'bin'),
    join(home, 'Applications', 'Postgres.app', 'Contents', 'Versions', 'latest', 'bin'),
    '/Applications/Postgres.app/Contents/Versions/latest/bin',
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ];

  for (const major of SUPPORTED_MAJORS) {
    directories.push(
      `/opt/homebrew/opt/postgresql@${major}/bin`,
      `/usr/local/opt/postgresql@${major}/bin`,
      `/usr/lib/postgresql/${major}/bin`,
    );
    for (const cellar of [`/opt/homebrew/Cellar/postgresql@${major}`, `/usr/local/Cellar/postgresql@${major}`]) {
      directories.push(...listDirectories(cellar).map((versionDir) => join(versionDir, 'bin')));
    }
  }

  if (platform() === 'win32') {
    for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean)) {
      const postgresRoot = join(base, 'PostgreSQL');
      directories.push(...listDirectories(postgresRoot).map((versionDir) => join(versionDir, 'bin')));
    }
  }

  const pathDump = commandPath('pg_dump');
  const pathRestore = commandPath('pg_restore');
  if (pathDump) directories.unshift(dirname(pathDump));
  if (pathRestore) directories.unshift(dirname(pathRestore));

  return [...new Set(directories.filter((directory) => directory && directory !== '.' && existsSync(directory)))];
}

function postgresToolMajor(toolPath) {
  const output = tryRun(toolPath, ['--version']);
  const match = output?.match(/(?:PostgreSQL\)?\s+)(\d+)(?:\.|\s|$)/i);
  return match ? Number(match[1]) : null;
}

function discoverNativePairs(env) {
  const executableDump = executableName('pg_dump');
  const executableRestore = executableName('pg_restore');
  const pairs = [];

  for (const binDir of candidateBinDirectories(env)) {
    const dumpPath = join(binDir, executableDump);
    const restorePath = join(binDir, executableRestore);
    if (!existsSync(dumpPath) || !existsSync(restorePath)) continue;
    try {
      if (!statSync(dumpPath).isFile() || !statSync(restorePath).isFile()) continue;
    } catch {
      continue;
    }
    const dumpMajor = postgresToolMajor(dumpPath);
    const restoreMajor = postgresToolMajor(restorePath);
    if (!dumpMajor || dumpMajor !== restoreMajor) continue;
    pairs.push({ dumpPath, restorePath, major: dumpMajor });
  }

  return pairs.filter((pair, index) => pairs.findIndex((candidate) => candidate.dumpPath === pair.dumpPath) === index);
}

function cleanDatabaseUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.searchParams.delete('schema');
    return url.toString();
  } catch {
    return value.replace(/([?&])schema=[^&]*&?/, (_match, separator) => separator === '?' ? '?' : '').replace(/[?&]$/, '');
  }
}

function databasePort(databaseUrl) {
  try {
    const url = new URL(databaseUrl);
    return Number(url.port || 5432);
  } catch {
    return 5432;
  }
}

function detectServerWithPsql(env) {
  const psql = commandPath('psql');
  const databaseUrl = cleanDatabaseUrl(process.env.DATABASE_URL || env.DATABASE_URL);
  if (!psql || !databaseUrl) return null;
  const versionNumber = tryRun(psql, [databaseUrl, '-tAc', "SELECT current_setting('server_version_num')"]);
  const numeric = Number(versionNumber);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return { major: Math.floor(numeric / 10_000), image: null, source: 'serveur PostgreSQL' };
}

function dockerAvailable() {
  return Boolean(commandPath('docker') && tryRun('docker', ['info']));
}

function parsePostgresImageMajor(image) {
  const match = String(image || '').match(/(?:^|\/)postgres:(\d+)(?:[.-]|$)/i);
  return match ? Number(match[1]) : null;
}

function detectServerWithDocker(env) {
  if (!dockerAvailable()) return null;
  const databaseUrl = process.env.DATABASE_URL || env.DATABASE_URL;
  const port = databasePort(databaseUrl);
  const preferredName = process.env.TOQUEHUB_POSTGRES_CONTAINER || env.TOQUEHUB_POSTGRES_CONTAINER;
  const output = tryRun('docker', ['ps', '--format', '{{.Names}}\t{{.Image}}\t{{.Ports}}']);
  if (!output) return null;

  const containers = output.split(/\r?\n/).map((line) => {
    const [name, image, ports = ''] = line.split('\t');
    return { name, image, ports, major: parsePostgresImageMajor(image) };
  }).filter((container) => container.major);

  const selected = containers.find((container) => preferredName && container.name === preferredName)
    || containers.find((container) => new RegExp(`(?:0\\.0\\.0\\.0|127\\.0\\.0\\.1|\\[::\\]):${port}->5432`).test(container.ports))
    || containers.find((container) => container.name.includes('toquehub'));
  return selected ? { major: selected.major, image: selected.image, source: `conteneur ${selected.name}` } : null;
}

function configuredServerMajor(env) {
  const value = Number(process.env.TOQUEHUB_POSTGRES_MAJOR || env.TOQUEHUB_POSTGRES_MAJOR);
  return Number.isInteger(value) && value >= 10 ? value : null;
}

function chooseNativePair(pairs, serverMajor) {
  return [...pairs]
    .filter((pair) => !serverMajor || pair.major >= serverMajor)
    .sort((left, right) => {
      if (serverMajor && left.major === serverMajor && right.major !== serverMajor) return -1;
      if (serverMajor && right.major === serverMajor && left.major !== serverMajor) return 1;
      return left.major - right.major;
    })[0] ?? null;
}

function dockerImageAvailable(image) {
  return Boolean(tryRun('docker', ['image', 'inspect', image, '--format', '{{.Id}}']));
}

function configure() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run') || args.has('--check');
  if (!existsSync(ENV_PATH)) {
    throw new Error(`Fichier .env introuvable (${ENV_PATH}). Lancez d'abord npm run bienvenue ou npm run welcome.`);
  }

  let envSource = readFileSync(ENV_PATH, 'utf8');
  const env = { ...parseEnv(envSource), ...process.env };
  const explicitMajor = configuredServerMajor(env);
  const detectedServer = detectServerWithPsql(env) || detectServerWithDocker(env);
  const pairs = discoverNativePairs(env);
  const fallbackMajor = parsePostgresImageMajor(env.POSTGRES_DOCKER_IMAGE) || pairs[0]?.major || 15;
  const serverMajor = explicitMajor || detectedServer?.major || fallbackMajor;
  const nativePair = chooseNativePair(pairs, serverMajor);

  let configuration;
  if (nativePair) {
    configuration = {
      mode: 'native',
      major: nativePair.major,
      dumpPath: nativePair.dumpPath,
      restorePath: nativePair.restorePath,
    };
  } else if (dockerAvailable()) {
    const detectedImage = detectedServer?.major === serverMajor ? detectedServer.image : null;
    const configuredImage = parsePostgresImageMajor(env.POSTGRES_DOCKER_IMAGE) === serverMajor ? env.POSTGRES_DOCKER_IMAGE : null;
    const image = detectedImage || configuredImage || `postgres:${serverMajor}-alpine`;
    if (!dryRun && !dockerImageAvailable(image)) {
      process.stdout.write(`Installation des outils PostgreSQL ${serverMajor} via Docker (${image})...\n`);
      execFileSync('docker', ['pull', image], { cwd: ROOT_DIR, stdio: 'inherit' });
    }
    configuration = {
      mode: 'docker',
      major: serverMajor,
      image,
      dumpPath: `docker://${image}`,
      restorePath: `docker://${image}`,
    };
  } else {
    throw new Error(
      `Aucune paire pg_dump/pg_restore compatible avec PostgreSQL ${serverMajor} n'a été trouvée, et Docker n'est pas disponible. `
      + 'Installez les outils client PostgreSQL ou Docker Desktop, puis relancez la commande.',
    );
  }

  envSource = upsertEnv(envSource, 'PG_DUMP_PATH', configuration.dumpPath);
  envSource = upsertEnv(envSource, 'PG_RESTORE_PATH', configuration.restorePath);
  envSource = upsertEnv(envSource, 'TOQUEHUB_POSTGRES_MAJOR', String(serverMajor));
  if (configuration.mode === 'docker') {
    envSource = upsertEnv(envSource, 'POSTGRES_DOCKER_IMAGE', configuration.image);
  }

  if (!dryRun) writeFileSync(ENV_PATH, envSource, 'utf8');

  const sourceLabel = detectedServer ? `, détectée via ${detectedServer.source}` : '';
  process.stdout.write(
    `Outils de sauvegarde PostgreSQL configurés en mode ${configuration.mode} `
    + `(client ${configuration.major}, serveur ${serverMajor}${sourceLabel}).${dryRun ? ' Aucun fichier modifié.' : ''}\n`,
  );
  process.stdout.write(`pg_dump: ${configuration.dumpPath}\npg_restore: ${configuration.restorePath}\n`);
}

try {
  configure();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Configuration PostgreSQL impossible : ${message}\n`);
  process.exitCode = 1;
}

