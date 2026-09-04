import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { PrismaService } from '../../apps/api/src/prisma/prisma.service';
import { MistralClientService } from '../../apps/api/src/mistral/mistral-client.service';

type ManifestDocument = {
  id: string;
  filename: string;
  category: string;
  layout: string;
  origin: string;
  expectedRouting: 'local' | 'ocr';
};

type BenchmarkResult = {
  id: string;
  success: boolean;
  wallMs: number;
  providerDurationMs?: number;
  pageCount?: number | null;
  markdownCharacters?: number;
  usageInfo?: unknown;
  category: string;
  layout: string;
  origin: string;
  error?: string;
};

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const manifestPath = resolve(
  process.argv[2] ?? resolve(repoRoot, 'tmp/pdfs/ocr-benchmark/manifest.json'),
);
const corpusDir = resolve(process.argv[3] ?? resolve(repoRoot, 'tmp/pdfs/ocr-benchmark/corpus'));
const outputDir = resolve(
  process.argv[4] ?? resolve(repoRoot, 'outputs/pdf-ocr-benchmark-2026-08-02/toquehub-ocr'),
);
const partialPath = resolve(outputDir, 'results.partial.json');
const model = process.env.OCR_MISTRAL_MODEL || 'mistral-ocr-latest';

function percentile(values: number[], fraction: number) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

async function persistPartial(results: BenchmarkResult[]) {
  await writeFile(
    partialPath,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), model, results }, null, 2)}\n`,
  );
}

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    documents: ManifestDocument[];
  };
  if (manifest.documents.length !== 100)
    throw new Error(`Expected 100 documents, got ${manifest.documents.length}`);
  await mkdir(resolve(outputDir, 'markdown'), { recursive: true });

  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const configuredOrganizations = await prisma.organization.findMany({
      where: { mistralApiKey: { not: null } },
      select: { id: true, mistralApiKey: true },
    });
    const requestedOrganizationId = process.env.OCR_BENCHMARK_ORGANIZATION_ID;
    const organization = requestedOrganizationId
      ? configuredOrganizations.find((candidate) => candidate.id === requestedOrganizationId)
      : configuredOrganizations.length === 1
        ? configuredOrganizations[0]
        : undefined;
    if (!organization?.mistralApiKey) {
      throw new Error(
        configuredOrganizations.length > 1
          ? 'Several organizations have a Mistral key; set OCR_BENCHMARK_ORGANIZATION_ID.'
          : 'No organization with a Mistral key is available for the benchmark.',
      );
    }

    const client = new MistralClientService(prisma);
    let results: BenchmarkResult[] = [];
    try {
      const partial = JSON.parse(await readFile(partialPath, 'utf8')) as {
        results?: BenchmarkResult[];
      };
      results = partial.results ?? [];
      if (results.length) console.log(`Resuming after ${results.length} completed requests.`);
    } catch {
      // No partial run exists.
    }
    const completedIds = new Set(results.map((result) => result.id));

    for (const [index, document] of manifest.documents.entries()) {
      if (completedIds.has(document.id)) continue;
      const buffer = await readFile(resolve(corpusDir, document.filename));
      const started = performance.now();
      try {
        // This is the reusable OCR core already used by ToqueHub. The enriched
        // table/confidence mode is enabled; supplier-specific business extraction
        // is intentionally excluded so both engines are compared on PDF reading.
        const response = await client.ocrMarkdown(organization.id, {
          buffer,
          mimeType: 'application/pdf',
          model,
          withAnnotation: true,
        });
        const wallMs = performance.now() - started;
        await writeFile(
          resolve(outputDir, 'markdown', `${document.id}.md`),
          response.markdown ?? '',
        );
        results.push({
          id: document.id,
          success: true,
          wallMs,
          providerDurationMs: response.durationMs,
          pageCount: response.pageCount,
          markdownCharacters: response.markdown?.length ?? 0,
          usageInfo: response.rawJson?.usage_info ?? null,
          category: document.category,
          layout: document.layout,
          origin: document.origin,
        });
        console.log(
          `[${index + 1}/100] ${document.id} ${document.category}: ${wallMs.toFixed(0)} ms, ${response.pageCount ?? '?'} page(s)`,
        );
      } catch (error) {
        const wallMs = performance.now() - started;
        await writeFile(resolve(outputDir, 'markdown', `${document.id}.md`), '');
        results.push({
          id: document.id,
          success: false,
          wallMs,
          category: document.category,
          layout: document.layout,
          origin: document.origin,
          error: error instanceof Error ? error.message : String(error),
        });
        console.log(`[${index + 1}/100] ${document.id} FAILED after ${wallMs.toFixed(0)} ms`);
      }
      await persistPartial(results);
    }

    results.sort((left, right) => left.id.localeCompare(right.id));
    const latencies = results.map((result) => result.wallMs);
    const successful = results.filter((result) => result.success);
    const output = {
      generatedAt: new Date().toISOString(),
      engine: {
        name: 'ToqueHub MistralClientService.ocrMarkdown',
        provider: 'Mistral OCR',
        model,
        enrichedTableAndConfidenceMode: true,
        businessDocumentAnnotation: false,
        timeoutMs: Number(process.env.OCR_TIMEOUT_MS ?? 60_000),
        timingScope:
          'in-memory ToqueHub OCR service call including base64 encoding and network request',
      },
      documentCount: results.length,
      successfulDocuments: successful.length,
      failedDocuments: results.length - successful.length,
      totalWallMs: latencies.reduce((sum, value) => sum + value, 0),
      latencyMs: {
        mean: latencies.reduce((sum, value) => sum + value, 0) / latencies.length,
        median: percentile(latencies, 0.5),
        p95: percentile(latencies, 0.95),
        max: Math.max(...latencies),
      },
      results,
    };
    await writeFile(resolve(outputDir, 'results.json'), `${JSON.stringify(output, null, 2)}\n`);
    console.log(`Wrote ${resolve(outputDir, 'results.json')}`);
  } finally {
    await prisma.$disconnect();
  }
}

await main();
