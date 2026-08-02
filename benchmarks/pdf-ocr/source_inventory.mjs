import { readdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { processPdf } from '@firecrawl/pdf-inspector';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sourceDir = resolve(process.argv[2] ?? resolve(repoRoot, 'tmp/opendataloader-bench/pdfs'));
const outputPath = resolve(
  process.argv[3] ?? resolve(repoRoot, 'tmp/pdfs/ocr-benchmark/source-inventory.json'),
);
const files = (await readdir(sourceDir)).filter((name) => name.endsWith('.pdf')).sort();

if (!files.length) throw new Error(`No PDF files found in ${sourceDir}`);

// Exclude native module loading and first-use initialization from timed corpus runs.
processPdf(readFileSync(resolve(sourceDir, files[0])), null);

const documents = [];
for (const [index, name] of files.entries()) {
  const buffer = readFileSync(resolve(sourceDir, name));
  const started = performance.now();
  try {
    const result = processPdf(buffer, null);
    documents.push({
      id: basename(name, '.pdf'),
      filename: name,
      byteSize: buffer.byteLength,
      success: true,
      wallMs: performance.now() - started,
      ...result,
      markdown: undefined,
      markdownCharacters: result.markdown?.length ?? 0,
    });
  } catch (error) {
    documents.push({
      id: basename(name, '.pdf'),
      filename: name,
      byteSize: buffer.byteLength,
      success: false,
      wallMs: performance.now() - started,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  if ((index + 1) % 25 === 0 || index + 1 === files.length) {
    process.stdout.write(`Inventoried ${index + 1}/${files.length}\n`);
  }
}

await writeFile(
  outputPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      sourceDir,
      package: '@firecrawl/pdf-inspector@1.11.2',
      documentCount: documents.length,
      documents,
    },
    null,
    2,
  )}\n`,
);

console.log(`Wrote ${outputPath}`);
