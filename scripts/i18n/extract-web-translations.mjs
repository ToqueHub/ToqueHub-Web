import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import ts from 'typescript';

const rootDir = resolve(import.meta.dirname, '../..');
const sourceDirs = [resolve(rootDir, 'apps/web/src'), resolve(rootDir, 'apps/api/src')];
const outputPath = resolve(rootDir, 'apps/web/src/i18n/fr-source.generated.json');

const sourceFiles = sourceDirs.flatMap((sourceDir) =>
  ts.sys
    .readDirectory(sourceDir, ['.ts', '.tsx'], undefined, undefined)
    .filter(
      (file) =>
        !file.includes('.generated.') &&
        !file.includes('/i18n/') &&
        !file.endsWith('.spec.ts') &&
        !file.endsWith('.spec.tsx'),
    ),
);

const ignoredExact = new Set([
  'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'Bearer', 'Content-Type', 'Authorization',
  'React', 'ToqueHub', 'HACCP', 'OCR', 'RNM', 'Mistral', 'FlatPay', 'Fennoa',
  'Google', 'Microsoft', 'MQTT', 'CSV', 'PDF', 'SKU', 'API', 'URL', 'JWT',
]);

const catalog = new Map();

function normalize(value) {
  return value.replace(/\s+/gu, ' ').trim();
}

function looksLikeUiCopy(value) {
  const text = normalize(value);
  if (text.length < 2 || text.length > 1_500 || ignoredExact.has(text)) return false;
  if (!/[A-Za-zÀ-ÖØ-öø-ÿŒœ]/u.test(text)) return false;
  if (/^(?:https?:|wss?:|mailto:|tel:|data:|blob:|\/|\.\/|\.\.\/)/i.test(text)) return false;
  if (/^(?:application|image|audio|video|text)\/[a-z0-9.+-]+$/i.test(text)) return false;
  if (/^#[0-9a-f]{3,8}$/i.test(text) || /^(?:rgb|hsl)a?\(/i.test(text)) return false;
  if (/^[A-Z][A-Z0-9_]+$/.test(text)) return false;
  if (/^[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+$/.test(text)) return false;
  if (/^[a-z0-9_-]+$/.test(text) && (text.includes('-') || text.includes('_'))) return false;
  if (/^(?:linear-gradient|translate|rotate|scale|calc|var)\(/.test(text)) return false;
  if (/^[{}[\](),.:;0-9%+*/=<>!?&|_'"`\\\s-]+$/.test(text)) return false;
  return true;
}

function add(value, file, kind) {
  const text = normalize(value);
  if (!looksLikeUiCopy(text)) return;
  const current = catalog.get(text) ?? { text, files: new Set(), kinds: new Set() };
  current.files.add(relative(rootDir, file).replaceAll('\\', '/'));
  current.kinds.add(kind);
  catalog.set(text, current);
}

function visit(file, node) {
  if (ts.isJsxText(node)) add(node.text, file.fileName, 'jsx');

  if (ts.isStringLiteralLike(node)) {
    const parent = node.parent;
    if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) return;
    if (ts.isLiteralTypeNode(parent)) return;
    if (ts.isPropertyAccessExpression(parent) && parent.name === node) return;
    add(node.text, file.fileName, ts.isJsxAttribute(parent) ? 'attribute' : 'literal');
  }

  if (ts.isTemplateExpression(node)) {
    add(node.head.text, file.fileName, 'template');
    for (const span of node.templateSpans) add(span.literal.text, file.fileName, 'template');
  }

  ts.forEachChild(node, (child) => visit(file, child));
}

for (const fileName of sourceFiles) {
  const source = await readFile(fileName, 'utf8');
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  visit(file, file);
}

const entries = [...catalog.values()]
  .map((entry) => ({
    text: entry.text,
    files: [...entry.files].sort(),
    kinds: [...entry.kinds].sort(),
  }))
  .sort((left, right) => left.text.localeCompare(right.text, 'fr'));

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
console.log(
  `Extracted ${entries.length} candidate UI/API strings to ${relative(rootDir, outputPath)}.`,
);
