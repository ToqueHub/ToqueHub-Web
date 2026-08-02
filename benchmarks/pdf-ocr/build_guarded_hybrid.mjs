import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const outputRoot = resolve(
  process.argv[2] ?? resolve(repoRoot, 'outputs/pdf-ocr-benchmark-2026-08-02'),
);
const manifest = JSON.parse(
  await readFile(resolve(repoRoot, 'tmp/pdfs/ocr-benchmark/manifest.json'), 'utf8'),
);
const firecrawl = JSON.parse(await readFile(resolve(outputRoot, 'firecrawl/results.json'), 'utf8'));
const toquehub = JSON.parse(
  await readFile(resolve(outputRoot, 'toquehub-ocr/results.json'), 'utf8'),
);
const targetDir = resolve(outputRoot, 'hybrid-guarded');
await mkdir(resolve(targetDir, 'markdown'), { recursive: true });

const firecrawlById = new Map(firecrawl.results.map((result) => [result.id, result]));
const toquehubById = new Map(toquehub.results.map((result) => [result.id, result]));
const results = [];
for (const document of manifest.documents) {
  const local = firecrawlById.get(document.id);
  const ocr = toquehubById.get(document.id);
  const useLocal =
    local.predictedRoute === 'local' && local.success && (local.pagesWithTables?.length ?? 0) === 0;
  const selectedEngine = useLocal ? 'firecrawl' : 'toquehub-ocr';
  const selected = useLocal ? local : ocr;
  const markdown = selected?.success
    ? await readFile(resolve(outputRoot, selectedEngine, 'markdown', `${document.id}.md`), 'utf8')
    : '';
  await writeFile(resolve(targetDir, 'markdown', `${document.id}.md`), markdown);
  results.push({
    id: document.id,
    category: document.category,
    layout: document.layout,
    selectedEngine,
    success: Boolean(selected?.success),
    simulatedLatencyMs: (local?.wallMsMedian ?? 0) + (useLocal ? 0 : (ocr?.wallMs ?? 0)),
    markdownCharacters: markdown.length,
  });
}

const latencies = results.map((result) => result.simulatedLatencyMs).sort((a, b) => a - b);
const percentile = (fraction) =>
  latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * fraction) - 1)];
const totalSimulatedLatencyMs = latencies.reduce((sum, value) => sum + value, 0);
const output = {
  generatedAt: new Date().toISOString(),
  engine: {
    name: 'Guarded hybrid: local only for reliable native PDFs without detected tables',
    routingRule:
      'Use pdf-inspector only for TextBased PDFs without encoding issues, OCR pages, or detected tables; use ToqueHub OCR otherwise.',
  },
  documentCount: results.length,
  successfulDocuments: results.filter((result) => result.success).length,
  localDocuments: results.filter((result) => result.selectedEngine === 'firecrawl').length,
  ocrDocuments: results.filter((result) => result.selectedEngine === 'toquehub-ocr').length,
  totalSimulatedLatencyMs,
  latencyMs: { median: percentile(0.5), p95: percentile(0.95), max: percentile(1) },
  estimatedSequentialDocumentsPerSecond: (results.length * 1000) / totalSimulatedLatencyMs,
  results,
};
await writeFile(resolve(targetDir, 'results.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${resolve(targetDir, 'results.json')}`);
