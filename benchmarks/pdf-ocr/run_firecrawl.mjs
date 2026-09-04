import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { processPdf } from '@firecrawl/pdf-inspector';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const manifestPath = resolve(
  process.argv[2] ?? resolve(repoRoot, 'tmp/pdfs/ocr-benchmark/manifest.json'),
);
const corpusDir = resolve(process.argv[3] ?? resolve(repoRoot, 'tmp/pdfs/ocr-benchmark/corpus'));
const outputDir = resolve(
  process.argv[4] ?? resolve(repoRoot, 'outputs/pdf-ocr-benchmark-2026-08-02/firecrawl'),
);
const runCount = Number(process.env.FIRECRAWL_BENCHMARK_RUNS ?? 5);

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const documents = manifest.documents.map((document) => ({
  ...document,
  buffer: readFileSync(resolve(corpusDir, document.filename)),
}));
if (documents.length !== 100) throw new Error(`Expected 100 documents, got ${documents.length}`);

await mkdir(resolve(outputDir, 'markdown'), { recursive: true });
// Exclude native module loading and one-time initialization.
processPdf(documents[0].buffer, null);

const byId = new Map(
  documents.map((document) => [document.id, { id: document.id, wallMsRuns: [], success: false }]),
);
const completeRunMs = [];

for (let run = 0; run < runCount; run += 1) {
  const rotated = documents.slice(run * 20).concat(documents.slice(0, run * 20));
  const runStarted = performance.now();
  for (const document of rotated) {
    const record = byId.get(document.id);
    const started = performance.now();
    try {
      const result = processPdf(document.buffer, null);
      record.wallMsRuns.push(performance.now() - started);
      record.success = true;
      record.pdfType = result.pdfType;
      record.pageCount = result.pageCount;
      record.pagesNeedingOcr = result.pagesNeedingOcr;
      record.ocrReasonsByPage = result.ocrReasonsByPage;
      record.confidence = result.confidence;
      record.isComplexLayout = result.isComplexLayout;
      record.pagesWithTables = result.pagesWithTables;
      record.pagesWithColumns = result.pagesWithColumns;
      record.hasEncodingIssues = result.hasEncodingIssues;
      record.processingTimeMs = result.processingTimeMs;
      record.markdownCharacters = result.markdown?.length ?? 0;
      record.error = undefined;
      if (run === 0) {
        await writeFile(resolve(outputDir, 'markdown', `${document.id}.md`), result.markdown ?? '');
      }
    } catch (error) {
      record.wallMsRuns.push(performance.now() - started);
      record.success = false;
      record.error = error instanceof Error ? error.message : String(error);
      if (run === 0) await writeFile(resolve(outputDir, 'markdown', `${document.id}.md`), '');
    }
  }
  completeRunMs.push(performance.now() - runStarted);
  console.log(`Firecrawl run ${run + 1}/${runCount}: ${completeRunMs.at(-1).toFixed(2)} ms`);
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

const results = documents.map((document) => {
  const record = byId.get(document.id);
  const expectedRoute = document.expectedRouting;
  const predictedRoute =
    record.success &&
    record.pdfType === 'TextBased' &&
    !record.hasEncodingIssues &&
    (record.pagesNeedingOcr?.length ?? 0) === 0
      ? 'local'
      : 'ocr';
  return {
    ...record,
    wallMsMedian: percentile(record.wallMsRuns, 0.5),
    wallMsP95: percentile(record.wallMsRuns, 0.95),
    category: document.category,
    layout: document.layout,
    origin: document.origin,
    expectedRoute,
    predictedRoute,
    routingCorrect: predictedRoute === expectedRoute,
  };
});

const medianCompleteRunMs = percentile(completeRunMs, 0.5);
const output = {
  generatedAt: new Date().toISOString(),
  engine: {
    name: '@firecrawl/pdf-inspector',
    version: '1.11.2',
    repositoryCommit: 'a15ec2d68d51dbe6a39d1da688ec7a3f642d846c',
    benchmarkRuns: runCount,
    timingScope: 'in-memory processPdf call; package initialization and file reads excluded',
  },
  documentCount: results.length,
  completeRunMs,
  medianCompleteRunMs,
  sequentialDocumentsPerSecond: (results.length * 1000) / medianCompleteRunMs,
  successfulDocuments: results.filter((result) => result.success).length,
  routingCorrectDocuments: results.filter((result) => result.routingCorrect).length,
  results,
};
await writeFile(resolve(outputDir, 'results.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${resolve(outputDir, 'results.json')}`);
