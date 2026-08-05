#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const scanAll = process.argv.includes('--all');
const gitArgs = scanAll
  ? ['ls-files', '--cached', '--others', '--exclude-standard', '-z']
  : ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'];

const paths = execFileSync('git', gitArgs, { encoding: 'utf8' }).split('\0').filter(Boolean);

const allowedDocumentRoots = ['apps/api/test-fixtures/', 'docs/'];

const forbiddenPaths = [
  /^uploads(?:[./-]|$)/i,
  /^backups?(?:\/|$)/i,
  /^apps\/api\/(?:backups?|uploads)(?:[./-]|$)/i,
  /^apps\/api\/src\/uploads(?:[./-]|$)/i,
  /^(?:tmp|output|outputs|data|logs)\//i,
  /(^|\/)playwright\/\.auth\//i,
  /(^|\/)(?:storageState|cookies?|session)[^/]*\.json$/i,
  /\.(?:sqlite3?|db|dump|backup|bak)$/i,
  /\.(?:pem|p12|pfx|key|jks|keystore)$/i,
];

const documentExtension = /\.(?:pdf|xlsx?|csv|zip|tar|tgz|gz|heic)$/i;
const secretPatterns = [
  /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\bre_[A-Za-z0-9]{20,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/,
  /https?:\/\/[^/@\s]+:[^/@\s]+@/,
  /(?:^|["'`\s])\/Users\/[^/\s]+\//,
  /(?:^|["'`\s])[A-Za-z]:\\Users\\[^\\\s]+\\/,
];

const hardcodedSecret =
  /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password|passwd|secret)\b\s*[:=]\s*["'`][^\n"'`]{8,}["'`]/i;

const violations = [];

for (const path of paths) {
  const isEnvFile = /(^|\/)\.env(?:\.|$)/.test(path);
  const isEnvExample = /\.env(?:\.[^/]*)?\.example$|(^|\/)\.env\.example$/.test(path);

  if (isEnvFile && !isEnvExample) {
    violations.push(`${path} — fichier d'environnement réel`);
    continue;
  }

  if (forbiddenPaths.some((pattern) => pattern.test(path))) {
    violations.push(`${path} — emplacement ou format local interdit`);
    continue;
  }

  if (documentExtension.test(path) && !allowedDocumentRoots.some((root) => path.startsWith(root))) {
    violations.push(`${path} — document non autorisé hors jeu de test/documentation`);
    continue;
  }

  let stat;
  try {
    stat = statSync(path);
  } catch {
    continue;
  }
  if (!stat.isFile() || stat.size > 2_000_000 || /(?:package-lock|\.map)$/.test(path)) {
    continue;
  }

  let content;
  try {
    content = readFileSync(path, 'utf8');
  } catch {
    continue;
  }

  const isTestCode = /(?:\.spec\.|\.test\.|test-fixtures\/)/.test(path);
  const patternsToApply = isTestCode ? secretPatterns.slice(0, 1) : secretPatterns;
  if (patternsToApply.some((pattern) => pattern.test(content))) {
    violations.push(`${path} — signature de secret ou chemin personnel détecté`);
    continue;
  }

  if (!isTestCode && !isEnvExample && hardcodedSecret.test(content)) {
    violations.push(`${path} — secret potentiellement codé en dur`);
  }
}

if (violations.length > 0) {
  console.error('Commit bloqué : contenu potentiellement privé détecté.');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(
  `Contrôle confidentialité Git réussi (${paths.length} fichier(s) ${scanAll ? 'versionné(s) ou candidat(s)' : 'staged'}).`,
);
