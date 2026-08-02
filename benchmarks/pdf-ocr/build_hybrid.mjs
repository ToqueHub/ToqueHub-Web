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
const hybridDir = resolve(outputRoot, 'hybrid');
await mkdir(resolve(hybridDir, 'markdown'), { recursive: true });

const firecrawlById = new Map(firecrawl.results.map((result) => [result.id, result]));
const toquehubById = new Map(toquehub.results.map((result) => [result.id, result]));
const results = [];

for (const document of manifest.documents) {
  const local = firecrawlById.get(document.id);
  const ocr = toquehubById.get(document.id);
  const useLocal = local.predictedRoute === 'local' && local.success;
  const sourceDir = useLocal ? 'firecrawl' : 'toquehub-ocr';
  const selected = useLocal ? local : ocr;
  const sourceMarkdown = resolve(outputRoot, sourceDir, 'markdown', `${document.id}.md`);
  const markdown = selected?.success ? await readFile(sourceMarkdown, 'utf8') : '';
  await writeFile(resolve(hybridDir, 'markdown', `${document.id}.md`), markdown);
  results.push({
    id: document.id,
    category: document.category,
    layout: document.layout,
    expectedRoute: document.expectedRouting,
    selectedEngine: useLocal ? 'firecrawl' : 'toquehub-ocr',
    success: Boolean(selected?.success),
    simulatedLatencyMs: (local?.wallMsMedian ?? 0) + (useLocal ? 0 : (ocr?.wallMs ?? 0)),
    markdownCharacters: markdown.length,
  });
}

const totalSimulatedLatencyMs = results.reduce((sum, result) => sum + result.simulatedLatencyMs, 0);
const output = {
  generatedAt: new Date().toISOString(),
  engine: {
    name: 'Hybrid: pdf-inspector local extraction with ToqueHub OCR fallback',
    routingRule:
      'Use local output only for TextBased PDFs without encoding issues or pagesNeedingOcr; otherwise use ToqueHub OCR for the complete document.',
    timingScope:
      'Simulated sequential latency from measured pdf-inspector median plus measured ToqueHub OCR fallback latency.',
  },
  documentCount: results.length,
  successfulDocuments: results.filter((result) => result.success).length,
  localDocuments: results.filter((result) => result.selectedEngine === 'firecrawl').length,
  ocrDocuments: results.filter((result) => result.selectedEngine === 'toquehub-ocr').length,
  totalSimulatedLatencyMs,
  estimatedSequentialDocumentsPerSecond: (results.length * 1000) / totalSimulatedLatencyMs,
  results,
};
await writeFile(resolve(hybridDir, 'results.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${resolve(hybridDir, 'results.json')}`);
