const http = require('node:http');
const { spawn } = require('node:child_process');
const { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const os = require('node:os');

const PORT = Number(process.env.UPDATER_PORT || 3099);
const SECRET = process.env.UPDATER_SECRET || '';
const WORKDIR = process.env.UPDATER_WORKDIR || '/workspace';
const COMPOSE_FILE = process.env.UPDATER_COMPOSE_FILE || '/workspace/docker-compose.yml';
const ENV_FILE = process.env.UPDATER_ENV_FILE || '/workspace/.env.docker';
const BACKUP_DIR = process.env.UPDATER_BACKUP_DIR || '/workspace/.toquehub-updates/backups';
const HEALTH_URL = process.env.UPDATER_HEALTH_URL || 'http://web/api/system/status';

const operations = new Map();
let lastOperationId = null;

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function authorize(req, res) {
  if (!SECRET) {
    json(res, 503, { error: 'UPDATER_SECRET is not configured.' });
    return false;
  }
  if (req.headers['x-toquehub-updater-secret'] !== SECRET) {
    json(res, 403, { error: 'Invalid updater secret.' });
    return false;
  }
  return true;
}

function operationLog(operation, message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  operation.logs.push(line);
  if (operation.logs.length > 500) operation.logs.shift();
}

function run(operation, command, args, options = {}) {
  operationLog(operation, `$ ${command} ${args.join(' ')}`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || WORKDIR,
      env: { ...process.env, ...(options.env || {}) },
      shell: false,
    });
    child.stdout.on('data', (chunk) => operationLog(operation, chunk.toString('utf8').trimEnd()));
    child.stderr.on('data', (chunk) => operationLog(operation, chunk.toString('utf8').trimEnd()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code}`));
    });
  });
}

function composeArgs(...args) {
  return ['compose', '--env-file', ENV_FILE, '-f', COMPOSE_FILE, ...args];
}

function dockerCompose(operation, args, options = {}) {
  return run(operation, 'docker', composeArgs(...args), options);
}

async function githubLoginFromToken(operation, token) {
  const githubToken = String(token || process.env.TOQUEHUB_GITHUB_TOKEN || '').trim();
  if (!githubToken) {
    operationLog(operation, 'GHCR: aucun token GitHub fourni, pull Docker anonyme.');
    return;
  }

  let username = '';
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${githubToken}`,
        'User-Agent': 'toquehub-updater',
      },
    });
    if (response.ok) {
      const user = await response.json();
      username = String(user.login || '').trim();
    } else {
      operationLog(operation, `GHCR: impossible de valider l'utilisateur GitHub (${response.status}), tentative avec le propriétaire du registre.`);
    }
  } catch (error) {
    operationLog(operation, `GHCR: validation utilisateur GitHub indisponible (${error.message}), tentative avec le propriétaire du registre.`);
  }

  if (!username) {
    const env = readEnvFile();
    username = String(env.TOQUEHUB_IMAGE_REGISTRY || process.env.TOQUEHUB_IMAGE_REGISTRY || 'ghcr.io/toquehub').split('/')[1] || 'toquehub';
  }

  operationLog(operation, `GHCR: authentification Docker pour ${username}.`);
  await new Promise((resolve, reject) => {
    const child = spawn('docker', ['login', 'ghcr.io', '-u', username, '--password-stdin'], {
      cwd: WORKDIR,
      env: process.env,
      shell: false,
    });
    child.stdout.on('data', (chunk) => operationLog(operation, chunk.toString('utf8').trimEnd()));
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8').trimEnd();
      if (text) operationLog(operation, text.replace(githubToken, '***'));
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`docker login ghcr.io exited with ${code}`));
    });
    child.stdin.end(githubToken);
  });
}

async function ensureServiceRunning(operation, service) {
  operationLog(operation, `Précontrôle service: ${service}`);
  const isRunning = () => new Promise((resolve, reject) => {
    const child = spawn('docker', composeArgs('ps', '--status', 'running', '--services', service), {
      cwd: WORKDIR,
      env: process.env,
      shell: false,
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => operationLog(operation, chunk.toString('utf8').trimEnd()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`docker compose ps ${service} exited with ${code}`));
      else resolve(output.split(/\r?\n/).map((line) => line.trim()).includes(service));
    });
  });

  for (let attempt = 1; attempt <= 30; attempt += 1) {
    if (await isRunning()) return;
    if (attempt === 1) operationLog(operation, `Attente du démarrage du service ${service}.`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error(`Le service "${service}" ne démarre pas. Consultez les logs Docker de ToqueHub.`);
}

async function ensurePostgresReady(operation) {
  operationLog(operation, 'Attente de PostgreSQL prêt.');
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const ready = await new Promise((resolve, reject) => {
      const child = spawn('docker', composeArgs('exec', '-T', 'postgres', 'pg_isready', '-U', process.env.POSTGRES_USER || 'toquehub', '-d', process.env.POSTGRES_DB || 'toquehub'), {
        cwd: WORKDIR,
        env: process.env,
        shell: false,
      });
      child.on('error', reject);
      child.on('close', (code) => resolve(code === 0));
    });
    if (ready) {
      operationLog(operation, 'PostgreSQL prêt.');
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error('PostgreSQL ne devient pas disponible. Consultez les logs Docker de ToqueHub.');
}

async function preflight(operation, targetImageTag, githubToken) {
  operationLog(operation, 'Précontrôle avant mise à jour.');
  if (!existsSync(COMPOSE_FILE)) throw new Error(`Compose introuvable: ${COMPOSE_FILE}`);
  if (!existsSync(ENV_FILE)) throw new Error(`Fichier env introuvable: ${ENV_FILE}`);
  operationLog(operation, 'Démarrage des services ToqueHub requis si nécessaire.');
  await dockerCompose(operation, ['up', '-d']);
  await ensureServiceRunning(operation, 'postgres');
  await ensurePostgresReady(operation);
  await ensureServiceRunning(operation, 'api');
  await githubLoginFromToken(operation, githubToken);
  operationLog(operation, `Vérification accès images Docker: ${targetImageTag}`);
  await dockerCompose(operation, ['pull', 'api', 'web'], { env: { TOQUEHUB_IMAGE_TAG: targetImageTag } });
  operationLog(operation, 'Précontrôle OK.');
}

function readEnvFile() {
  if (!existsSync(ENV_FILE)) return {};
  return Object.fromEntries(
    readFileSync(ENV_FILE, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

function setEnvValue(key, value) {
  const lines = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8').split(/\r?\n/) : [];
  let found = false;
  const next = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) next.push(`${key}=${value}`);
  writeFileSync(ENV_FILE, `${next.filter((line, index) => line !== '' || index < next.length - 1).join('\n')}\n`);
}

async function backup(operation) {
  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const databaseFile = join(BACKUP_DIR, `pre-update-${stamp}.sql`);
  const filesArchive = join(BACKUP_DIR, `pre-update-files-${stamp}.tar.gz`);
  operationLog(operation, `Backup PostgreSQL: ${databaseFile}`);
  await new Promise((resolve, reject) => {
    const child = spawn('docker', composeArgs('exec', '-T', 'postgres', 'pg_dump', '-U', process.env.POSTGRES_USER || 'toquehub', process.env.POSTGRES_DB || 'toquehub'), {
      cwd: WORKDIR,
      env: process.env,
      shell: false,
    });
    const output = createWriteStream(databaseFile);
    child.stdout.pipe(output);
    child.stderr.on('data', (chunk) => operationLog(operation, chunk.toString('utf8').trimEnd()));
    child.on('error', reject);
    child.on('close', (code) => {
      output.end();
      if (code === 0) resolve();
      else reject(new Error(`pg_dump exited with ${code}`));
    });
  });
  operationLog(operation, `Backup logique PostgreSQL validé: ${databaseFile}`);

  operationLog(operation, `Backup fichiers applicatifs: ${filesArchive}`);
  await new Promise((resolve, reject) => {
    const child = spawn('docker', composeArgs('exec', '-T', 'api', 'tar', '-C', '/app/data', '-czf', '-', '.'), {
      cwd: WORKDIR,
      env: process.env,
      shell: false,
    });
    const output = createWriteStream(filesArchive);
    child.stdout.pipe(output);
    child.stderr.on('data', (chunk) => operationLog(operation, chunk.toString('utf8').trimEnd()));
    child.on('error', reject);
    child.on('close', (code) => {
      output.end();
      if (code === 0) resolve();
      else reject(new Error(`api files backup exited with ${code}`));
    });
  });
  operationLog(operation, `Backup fichiers validé: ${filesArchive}`);
}

async function healthCheck(operation) {
  operationLog(operation, `Healthcheck: ${HEALTH_URL}`);
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      const response = await fetch(HEALTH_URL);
      if (response.ok) {
        operationLog(operation, 'Healthcheck OK.');
        return;
      }
      operationLog(operation, `Healthcheck tentative ${attempt}: HTTP ${response.status}`);
    } catch (error) {
      operationLog(operation, `Healthcheck tentative ${attempt}: ${error.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error('Healthcheck failed after update.');
}

async function runUpdate(operation, targetTag, githubToken) {
  const previousEnv = readEnvFile();
  const previousTag = previousEnv.TOQUEHUB_IMAGE_TAG || 'latest';
  const targetImageTag = targetTag.replace(/^v/i, '');
  let envTagChanged = false;

  try {
    operation.status = 'running';
    operationLog(operation, `Update ${previousTag} -> ${targetTag}`);
    await preflight(operation, targetImageTag, githubToken);
    await backup(operation);
    setEnvValue('TOQUEHUB_IMAGE_TAG', targetImageTag);
    envTagChanged = true;
    operationLog(operation, `TOQUEHUB_IMAGE_TAG=${targetImageTag}`);
    await dockerCompose(operation, ['up', '-d', 'api', 'web']);
    await healthCheck(operation);
    operation.status = 'success';
    operation.finishedAt = new Date().toISOString();
    operationLog(operation, 'Mise à jour terminée.');
  } catch (error) {
    operation.error = error instanceof Error ? error.message : 'Update failed.';
    operationLog(operation, `Erreur: ${operation.error}`);
    if (!envTagChanged) {
      operation.status = 'error';
      operation.finishedAt = new Date().toISOString();
      operationLog(operation, 'Aucun changement appliqué, rollback inutile.');
      return;
    }
    operation.status = 'rollback';
    operationLog(operation, `Rollback vers ${previousTag}`);
    try {
      setEnvValue('TOQUEHUB_IMAGE_TAG', previousTag);
      await githubLoginFromToken(operation, githubToken);
      await dockerCompose(operation, ['pull', 'api', 'web']).catch((pullError) => {
        operationLog(operation, `Pull rollback ignoré: ${pullError.message}`);
      });
      await dockerCompose(operation, ['up', '-d', 'api', 'web']);
      operationLog(operation, 'Rollback terminé.');
    } catch (rollbackError) {
      operationLog(operation, `Rollback échoué: ${rollbackError.message}`);
      operation.status = 'error';
    }
    operation.finishedAt = new Date().toISOString();
  }
}

function createOperation(targetTag, githubToken) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const operation = {
    id,
    status: 'queued',
    targetTag,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    logs: [],
    error: null,
  };
  operations.set(id, operation);
  lastOperationId = id;
  setImmediate(() => void runUpdate(operation, targetTag, githubToken));
  return operation;
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/health') return json(res, 200, { ok: true });
  if (!authorize(req, res)) return;

  try {
    if (req.method === 'GET' && req.url === '/status') {
      const env = readEnvFile();
      return json(res, 200, {
        capable: existsSync(COMPOSE_FILE) && existsSync(ENV_FILE),
        platform: os.arch(),
        currentTag: env.TOQUEHUB_IMAGE_TAG || 'latest',
        composeFile: COMPOSE_FILE,
        envFile: ENV_FILE,
        lastOperation: lastOperationId ? operations.get(lastOperationId) : null,
      });
    }

    if (req.method === 'POST' && req.url === '/apply') {
      const running = [...operations.values()].find((operation) => ['queued', 'running'].includes(operation.status));
      if (running) return json(res, 409, { error: 'Une mise à jour est déjà en cours.', operation: running });
      const body = await readBody(req);
      const targetTag = String(body.targetTag || body.targetVersion || '').trim();
      if (!targetTag) return json(res, 400, { error: 'targetTag is required.' });
      return json(res, 202, createOperation(targetTag, body.githubToken));
    }

    const operationMatch = req.url.match(/^\/operations\/([^/?#]+)$/);
    if (req.method === 'GET' && operationMatch) {
      const operation = operations.get(decodeURIComponent(operationMatch[1]));
      if (!operation) return json(res, 404, { error: 'Operation not found.' });
      return json(res, 200, operation);
    }

    return json(res, 404, { error: 'Not found.' });
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : 'Updater error.' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`ToqueHub updater listening on ${PORT}`);
});
