import 'reflect-metadata';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { processPdf } from '@firecrawl/pdf-inspector';
import { PrismaService } from '../../apps/api/src/prisma/prisma.service';
import { MistralClientService } from '../../apps/api/src/mistral/mistral-client.service';
import { StocksOcrService } from '../../apps/api/src/stocks/stocks-ocr.service';

type ManifestDocument = {
  id: string;
  filename: string;
  category: string;
  template: string;
  language: string;
  documentType: string;
  expectedRouting: 'local' | 'ocr';
  pageCount: number;
};

type ChatStats = {
  calls: number;
  wallMs: number;
  suppressedAttempts: number;
};

type OcrAttempt = {
  completed: true;
  success: boolean;
  timeoutMs: number;
  wallMs: number;
  ocrWallMs: number;
  extractionWallMs: number;
  ocrRequestCount: number;
  chatCallCount: number;
  chatWallMs: number;
  remoteCallCount: number;
  pageCount?: number | null;
  markdownCharacters?: number;
  usageInfo?: unknown;
  annotationPresent?: boolean;
  annotationUsable?: boolean;
  aiStatus?: string | null;
  aiProvider?: string | null;
  extraction?: any;
  error?: string;
};

type LocalAttempt = {
  completed: true;
  success: boolean;
  wallMs: number;
  pdfInspectorWallMs: number;
  extractionWallMs: number;
  chatCallCount: number;
  chatWallMs: number;
  remoteCallCount: number;
  aiStatus?: string | null;
  aiProvider?: string | null;
  extraction?: any;
  error?: string;
};

type DocumentResult = {
  id: string;
  filename: string;
  category: string;
  template: string;
  language: string;
  documentType: string;
  expectedRouting: 'local' | 'ocr';
  firecrawl?: {
    completed: true;
    success: boolean;
    wallMsRuns: number[];
    wallMsMedian: number;
    wallMsP95: number;
    predictedRouting: 'local' | 'ocr';
    pdfType?: string;
    pageCount?: number;
    pagesNeedingOcr?: number[];
    ocrReasonsByPage?: unknown;
    confidence?: number;
    isComplexLayout?: boolean;
    pagesWithTables?: number[];
    pagesWithColumns?: number[];
    hasEncodingIssues?: boolean;
    markdownCharacters?: number;
    markdown?: string;
    error?: string;
  };
  current?: {
    primary: OcrAttempt;
    diagnosticRetry?: OcrAttempt;
  };
  firecrawlLocal?: {
    ai: LocalAttempt;
    heuristicsOnly: LocalAttempt;
  };
};

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const manifestPath = resolve(
  process.argv[2] ?? resolve(repoRoot, 'tmp/pdfs/ocr-business-benchmark/manifest.json'),
);
const corpusDir = resolve(
  process.argv[3] ?? resolve(repoRoot, 'tmp/pdfs/ocr-business-benchmark/corpus'),
);
const outputDir = resolve(
  process.argv[4] ?? resolve(repoRoot, 'outputs/pdf-ocr-business-benchmark-2026-08-02'),
);
const partialPath = resolve(outputDir, 'results.partial.json');
const finalPath = resolve(outputDir, 'raw-results.json');
const firecrawlRuns = Number(process.env.FIRECRAWL_BUSINESS_RUNS ?? 5);
const primaryTimeoutMs = Number(process.env.OCR_TIMEOUT_MS ?? 60_000);
const retryTimeoutMs = Number(process.env.OCR_BENCHMARK_RETRY_TIMEOUT_MS ?? 120_000);
const selectedIds = new Set(
  String(process.env.OCR_BENCHMARK_ONLY_IDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);

function percentile(values: number[], fraction: number) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index] ?? 0;
}

function cleanError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, 600);
}

function pageMarkdown(page: any) {
  let markdown = String(page?.markdown || page?.text || '');
  const tables = Array.isArray(page?.tables) ? page.tables : [];
  for (const table of tables) {
    const id = String(table?.id || '').trim();
    const content = String(table?.content || '').trim();
    if (!id || !content) continue;
    const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const reference = new RegExp(`\\[${escapedId}\\]\\(${escapedId}\\)`, 'g');
    if (reference.test(markdown)) markdown = markdown.replace(reference, content);
    else markdown += `\n\n${content}`;
  }
  return markdown;
}

async function persist(results: DocumentResult[]) {
  const payload = {
    generatedAt: new Date().toISOString(),
    benchmark: {
      documentCount: results.length,
      firecrawlVersion: '1.11.2',
      firecrawlRuns,
      primaryTimeoutMs,
      retryTimeoutMs,
      currentPath:
        'PDF -> Mistral OCR with ToqueHub document annotation -> ToqueHub extractBusinessData',
      proposedPath:
        'PDF -> pdf-inspector; text PDFs -> ToqueHub extractBusinessData/Mistral chat; scans -> current path',
    },
    results,
  };
  await writeFile(partialPath, `${JSON.stringify(payload, null, 2)}\n`);
}

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    documents: ManifestDocument[];
  };
  if (manifest.documents.length !== 100) {
    throw new Error(`Expected 100 documents, got ${manifest.documents.length}`);
  }
  await mkdir(outputDir, { recursive: true });
  await mkdir(resolve(outputDir, 'firecrawl-markdown'), { recursive: true });

  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const organizations = await prisma.organization.findMany({
      where: { mistralApiKey: { not: null } },
      select: { id: true },
    });
    const requestedOrganizationId = process.env.OCR_BENCHMARK_ORGANIZATION_ID;
    const organization = requestedOrganizationId
      ? organizations.find((candidate) => candidate.id === requestedOrganizationId)
      : organizations.length === 1
        ? organizations[0]
        : undefined;
    if (!organization) {
      throw new Error(
        organizations.length > 1
          ? 'Several organizations have a Mistral key; set OCR_BENCHMARK_ORGANIZATION_ID.'
          : 'No organization with a Mistral key is available.',
      );
    }

    const mistral = new MistralClientService(prisma);
    const stocks = new StocksOcrService(prisma, null as any, mistral, null as any);
    const apiKey = await (stocks as any).resolveMistralApiKey(organization.id);
    if (!apiKey) throw new Error('Mistral API key could not be resolved.');

    let activeChatStats: ChatStats | null = null;
    let suppressChat = false;
    const originalChatJson = mistral.chatJson.bind(mistral);
    (mistral as any).chatJson = async (...args: any[]) => {
      if (suppressChat) {
        if (activeChatStats) activeChatStats.suppressedAttempts += 1;
        throw new Error('Benchmark mode: Mistral chat disabled');
      }
      const started = performance.now();
      if (activeChatStats) activeChatStats.calls += 1;
      try {
        return await (originalChatJson as any)(...args);
      } finally {
        if (activeChatStats) activeChatStats.wallMs += performance.now() - started;
      }
    };

    let results: DocumentResult[] = [];
    try {
      results =
        (JSON.parse(await readFile(partialPath, 'utf8')) as { results?: DocumentResult[] })
          .results ?? [];
      if (results.length) console.log(`Resuming ${results.length} document records.`);
    } catch {
      // First execution.
    }
    const byId = new Map(results.map((result) => [result.id, result]));
    for (const document of manifest.documents) {
      if (!byId.has(document.id)) {
        const created: DocumentResult = {
          id: document.id,
          filename: document.filename,
          category: document.category,
          template: document.template,
          language: document.language,
          documentType: document.documentType,
          expectedRouting: document.expectedRouting,
        };
        results.push(created);
        byId.set(document.id, created);
      }
    }
    results.sort((left, right) => left.id.localeCompare(right.id));

    async function runCurrentAttempt(buffer: Buffer, timeoutMs: number): Promise<OcrAttempt> {
      const totalStarted = performance.now();
      const chatStats: ChatStats = { calls: 0, wallMs: 0, suppressedAttempts: 0 };
      let ocrRequestCount = 0;
      let ocrWallMs = 0;
      let extractionWallMs = 0;
      try {
        const ocrStarted = performance.now();
        const dataUrl = `data:application/pdf;base64,${buffer.toString('base64')}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        let response: Response;
        let json: any;
        try {
          ocrRequestCount += 1;
          response = await fetch('https://api.mistral.ai/v1/ocr', {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify((stocks as any).mistralOcrRequestBody(true, dataUrl, true)),
            signal: controller.signal,
          });
          json = await response.json().catch(() => ({}));
          if (!response.ok && (stocks as any).canRetryBaseOcr(response.status)) {
            ocrRequestCount += 1;
            response = await fetch('https://api.mistral.ai/v1/ocr', {
              method: 'POST',
              headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify((stocks as any).mistralOcrRequestBody(true, dataUrl, false)),
              signal: controller.signal,
            });
            json = await response.json().catch(() => ({}));
          }
          if (!response.ok) throw new Error(`Mistral OCR HTTP ${response.status}`);
        } finally {
          clearTimeout(timeout);
          ocrWallMs = performance.now() - ocrStarted;
        }

        const pages = Array.isArray(json?.pages) ? json.pages : [];
        const markdown = pages.map(pageMarkdown).filter(Boolean).join('\n\n');
        const extractionStarted = performance.now();
        activeChatStats = chatStats;
        suppressChat = false;
        let extraction: any;
        try {
          extraction = await (stocks as any).extractBusinessData(organization.id, markdown, json);
        } finally {
          activeChatStats = null;
          extractionWallMs = performance.now() - extractionStarted;
        }
        return {
          completed: true,
          success: true,
          timeoutMs,
          wallMs: performance.now() - totalStarted,
          ocrWallMs,
          extractionWallMs,
          ocrRequestCount,
          chatCallCount: chatStats.calls,
          chatWallMs: chatStats.wallMs,
          remoteCallCount: ocrRequestCount + chatStats.calls,
          pageCount: pages.length || json?.usage_info?.pages_processed || null,
          markdownCharacters: markdown.length,
          usageInfo: json?.usage_info ?? null,
          annotationPresent: json?.document_annotation != null,
          annotationUsable: Boolean(json?.document_annotation && extraction?.lines?.length),
          aiStatus: extraction?.aiAnalysis?.status ?? null,
          aiProvider: extraction?.aiAnalysis?.provider ?? null,
          extraction,
        };
      } catch (error) {
        activeChatStats = null;
        suppressChat = false;
        return {
          completed: true,
          success: false,
          timeoutMs,
          wallMs: performance.now() - totalStarted,
          ocrWallMs,
          extractionWallMs,
          ocrRequestCount,
          chatCallCount: chatStats.calls,
          chatWallMs: chatStats.wallMs,
          remoteCallCount: ocrRequestCount + chatStats.calls,
          error: cleanError(error),
        };
      }
    }

    async function runLocalAttempt(
      markdown: string,
      inspectorWallMs: number,
      withAi: boolean,
    ): Promise<LocalAttempt> {
      const totalStarted = performance.now();
      const chatStats: ChatStats = { calls: 0, wallMs: 0, suppressedAttempts: 0 };
      const extractionStarted = performance.now();
      try {
        activeChatStats = chatStats;
        suppressChat = !withAi;
        const extraction = await (stocks as any).extractBusinessData(
          organization.id,
          markdown,
          undefined,
        );
        const extractionWallMs = performance.now() - extractionStarted;
        return {
          completed: true,
          success: true,
          wallMs: inspectorWallMs + (performance.now() - totalStarted),
          pdfInspectorWallMs: inspectorWallMs,
          extractionWallMs,
          chatCallCount: chatStats.calls,
          chatWallMs: chatStats.wallMs,
          remoteCallCount: chatStats.calls,
          aiStatus: extraction?.aiAnalysis?.status ?? null,
          aiProvider: extraction?.aiAnalysis?.provider ?? null,
          extraction,
        };
      } catch (error) {
        return {
          completed: true,
          success: false,
          wallMs: inspectorWallMs + (performance.now() - totalStarted),
          pdfInspectorWallMs: inspectorWallMs,
          extractionWallMs: performance.now() - extractionStarted,
          chatCallCount: chatStats.calls,
          chatWallMs: chatStats.wallMs,
          remoteCallCount: chatStats.calls,
          error: cleanError(error),
        };
      } finally {
        activeChatStats = null;
        suppressChat = false;
      }
    }

    // Warm up native bindings outside the measured PDF Inspector timings.
    const warmupDocument = manifest.documents[0];
    processPdf(await readFile(resolve(corpusDir, warmupDocument.filename)), null);

    for (const [index, document] of manifest.documents.entries()) {
      if (selectedIds.size && !selectedIds.has(document.id)) continue;
      const record = byId.get(document.id)!;
      const buffer = await readFile(resolve(corpusDir, document.filename));

      if (!record.firecrawl?.completed || record.firecrawl.wallMsRuns.length < firecrawlRuns) {
        const wallMsRuns: number[] = [];
        let parsed: any;
        try {
          for (let run = 0; run < firecrawlRuns; run += 1) {
            const started = performance.now();
            parsed = processPdf(buffer, null);
            wallMsRuns.push(performance.now() - started);
          }
          const predictedRouting =
            parsed.pdfType === 'TextBased' &&
            !parsed.hasEncodingIssues &&
            (parsed.pagesNeedingOcr?.length ?? 0) === 0
              ? 'local'
              : 'ocr';
          record.firecrawl = {
            completed: true,
            success: true,
            wallMsRuns,
            wallMsMedian: percentile(wallMsRuns, 0.5),
            wallMsP95: percentile(wallMsRuns, 0.95),
            predictedRouting,
            pdfType: parsed.pdfType,
            pageCount: parsed.pageCount,
            pagesNeedingOcr: parsed.pagesNeedingOcr,
            ocrReasonsByPage: parsed.ocrReasonsByPage,
            confidence: parsed.confidence,
            isComplexLayout: parsed.isComplexLayout,
            pagesWithTables: parsed.pagesWithTables,
            pagesWithColumns: parsed.pagesWithColumns,
            hasEncodingIssues: parsed.hasEncodingIssues,
            markdownCharacters: parsed.markdown?.length ?? 0,
            markdown: parsed.markdown ?? '',
          };
          await writeFile(
            resolve(outputDir, 'firecrawl-markdown', `${document.id}.md`),
            parsed.markdown ?? '',
          );
        } catch (error) {
          record.firecrawl = {
            completed: true,
            success: false,
            wallMsRuns,
            wallMsMedian: percentile(wallMsRuns, 0.5),
            wallMsP95: percentile(wallMsRuns, 0.95),
            predictedRouting: 'ocr',
            error: cleanError(error),
          };
        }
        await persist(results);
      }

      const currentTimingInvalid =
        Boolean(record.current?.primary?.completed) &&
        record.current!.primary.ocrWallMs > primaryTimeoutMs + 10_000;
      if (!record.current?.primary?.completed || currentTimingInvalid) {
        const primary = await runCurrentAttempt(buffer, primaryTimeoutMs);
        record.current = { primary };
        if (!primary.success) {
          record.current.diagnosticRetry = await runCurrentAttempt(buffer, retryTimeoutMs);
        }
        await persist(results);
      }

      const localTimingInvalid =
        Boolean(record.firecrawlLocal?.ai?.completed) &&
        record.firecrawlLocal!.ai.chatWallMs > 130_000;
      if (
        record.firecrawl?.success &&
        record.firecrawl.predictedRouting === 'local' &&
        (!record.firecrawlLocal?.ai?.completed || localTimingInvalid)
      ) {
        const heuristicsOnly = await runLocalAttempt(
          record.firecrawl.markdown ?? '',
          record.firecrawl.wallMsMedian,
          false,
        );
        const ai = await runLocalAttempt(
          record.firecrawl.markdown ?? '',
          record.firecrawl.wallMsMedian,
          true,
        );
        record.firecrawlLocal = { ai, heuristicsOnly };
        await persist(results);
      }

      const current = record.current?.primary;
      const route = record.firecrawl?.predictedRouting ?? 'ocr';
      console.log(
        `[${index + 1}/100] ${document.id} ${document.category} route=${route} ` +
          `current=${current?.success ? `${current.wallMs.toFixed(0)}ms` : 'FAILED'} ` +
          `${record.firecrawlLocal?.ai ? `local+AI=${record.firecrawlLocal.ai.wallMs.toFixed(0)}ms` : ''}`,
      );
    }

    await persist(results);
    await writeFile(finalPath, await readFile(partialPath));
    console.log(`Wrote ${finalPath}`);
  } finally {
    await prisma.$disconnect();
  }
}

await main();
