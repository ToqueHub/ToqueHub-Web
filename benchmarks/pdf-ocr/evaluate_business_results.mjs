import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const manifestPath = resolve(
  process.argv[2] ?? resolve(repoRoot, 'tmp/pdfs/ocr-business-benchmark/manifest.json'),
);
const resultsPath = resolve(
  process.argv[3] ??
    resolve(repoRoot, 'outputs/pdf-ocr-business-benchmark-2026-08-02/raw-results.json'),
);
const outputDir = resolve(
  process.argv[4] ?? resolve(repoRoot, 'outputs/pdf-ocr-business-benchmark-2026-08-02'),
);

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(value) {
  return new Set(normalize(value).split(/\s+/).filter(Boolean));
}

function tokenCoverage(expected, predicted) {
  const expectedTokens = tokens(expected);
  const predictedTokens = tokens(predicted);
  if (!expectedTokens.size) return predictedTokens.size ? 0 : 1;
  let found = 0;
  for (const token of expectedTokens) if (predictedTokens.has(token)) found += 1;
  return found / expectedTokens.size;
}

function numericEqual(expected, predicted, relativeTolerance = 0.002, absoluteTolerance = 0.02) {
  if (expected == null) return predicted == null || predicted === '';
  const actual = Number(predicted);
  if (!Number.isFinite(actual)) return false;
  return (
    Math.abs(Number(expected) - actual) <=
    Math.max(absoluteTolerance, Math.abs(expected) * relativeTolerance)
  );
}

function normalizeUnit(value) {
  const unit = normalize(value).replace(/\s/g, '');
  if (['pc', 'pcs', 'piece', 'pieces', 'kpl', 'ea', 'unit'].includes(unit)) return 'piece';
  if (['l', 'litre', 'liter', 'ltr'].includes(unit)) return 'l';
  if (['kg', 'kilogramme', 'kilogram'].includes(unit)) return 'kg';
  if (['g', 'gramme', 'gram'].includes(unit)) return 'g';
  return unit;
}

function identifierField(documentType) {
  if (documentType === 'invoice') return 'invoiceNumber';
  if (documentType === 'delivery_note') return 'deliveryNoteNumber';
  if (documentType === 'receipt') return 'receiptNumber';
  return 'purchaseOrderNumber';
}

function supplierName(extraction) {
  return (
    extraction?.supplier?.name || extraction?.supplierName || extraction?.supplier?.supplierName
  );
}

function productLines(extraction) {
  const source = Array.isArray(extraction?.lines)
    ? extraction.lines
    : Array.isArray(extraction?.items)
      ? extraction.items
      : [];
  return source.filter(
    (line) =>
      line && line.ignored !== true && line.isFreight !== true && line.isStockItem !== false,
  );
}

function matchLines(expectedLines, predictedLines) {
  const used = new Set();
  return expectedLines.map((expected) => {
    const expectedReference = normalize(expected.reference);
    let index = predictedLines.findIndex(
      (predicted, candidateIndex) =>
        !used.has(candidateIndex) &&
        expectedReference &&
        normalize(predicted.reference || predicted.supplierProductCode) === expectedReference,
    );
    if (index < 0) {
      let bestScore = 0;
      for (const [candidateIndex, predicted] of predictedLines.entries()) {
        if (used.has(candidateIndex)) continue;
        const score = tokenCoverage(expected.label, predicted.label || predicted.nameOriginal);
        if (score > bestScore) {
          bestScore = score;
          index = candidateIndex;
        }
      }
      if (bestScore < 0.6) index = -1;
    }
    if (index >= 0) used.add(index);
    return index >= 0 ? predictedLines[index] : null;
  });
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
}

function rate(values) {
  return values.length ? values.filter(Boolean).length / values.length : null;
}

function evaluateExtraction(groundTruth, extraction) {
  const document = extraction?.document ?? {};
  const totals = extraction?.totals ?? {};
  const idField = identifierField(groundTruth.documentType);
  const metadataChecks = {
    documentType: normalize(extraction?.documentType) === normalize(groundTruth.documentType),
    supplier: normalize(supplierName(extraction)) === normalize(groundTruth.supplierName),
    identifier: normalize(document[idField]) === normalize(groundTruth[idField]),
    documentDate: normalize(document.documentDate) === normalize(groundTruth.documentDate),
  };
  if (groundTruth.deliveryDate != null) {
    metadataChecks.deliveryDate =
      normalize(document.deliveryDate) === normalize(groundTruth.deliveryDate);
  }

  const totalChecks = {};
  for (const field of ['totalExcludingTax', 'totalTax', 'totalIncludingTax']) {
    if (groundTruth.totals[field] != null) {
      totalChecks[field] = numericEqual(groundTruth.totals[field], totals[field]);
    }
  }

  const expectedLines = groundTruth.lines ?? [];
  const predictedLines = productLines(extraction);
  const matched = matchLines(expectedLines, predictedLines);
  const matchedCount = matched.filter(Boolean).length;
  const recall = expectedLines.length ? matchedCount / expectedLines.length : 1;
  const precision = predictedLines.length
    ? matchedCount / predictedLines.length
    : expectedLines.length
      ? 0
      : 1;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  const lineChecks = [];
  for (const [index, expected] of expectedLines.entries()) {
    const predicted = matched[index];
    lineChecks.push({
      matched: Boolean(predicted),
      reference:
        Boolean(predicted) &&
        normalize(predicted.reference || predicted.supplierProductCode) ===
          normalize(expected.reference),
      label:
        Boolean(predicted) &&
        tokenCoverage(expected.label, predicted.label || predicted.nameOriginal) >= 0.8,
      quantity:
        Boolean(predicted) && numericEqual(expected.quantity, predicted.quantity, 0.001, 0.01),
      unit: Boolean(predicted) && normalizeUnit(expected.unit) === normalizeUnit(predicted.unit),
      unitPrice:
        expected.unitPrice == null
          ? null
          : Boolean(predicted) && numericEqual(expected.unitPrice, predicted.unitPrice),
      total:
        expected.total == null
          ? null
          : Boolean(predicted) && numericEqual(expected.total, predicted.total),
      vatRate:
        expected.vatRate == null
          ? null
          : Boolean(predicted) && numericEqual(expected.vatRate, predicted.vatRate, 0.001, 0.01),
      lotNumber:
        expected.lotNumber == null
          ? null
          : Boolean(predicted) && normalize(expected.lotNumber) === normalize(predicted.lotNumber),
      bestBeforeDate:
        expected.bestBeforeDate == null
          ? null
          : Boolean(predicted) &&
            normalize(expected.bestBeforeDate) === normalize(predicted.bestBeforeDate),
    });
  }

  const metadataValues = Object.values(metadataChecks).map(Number);
  const totalValues = Object.values(totalChecks).map(Number);
  const lineFieldValues = lineChecks.flatMap((check) =>
    Object.entries(check)
      .filter(([field, value]) => field !== 'matched' && value != null)
      .map(([, value]) => Number(value)),
  );
  const components = [
    { weight: 0.25, value: mean(metadataValues) },
    { weight: 0.2, value: mean(totalValues) },
    { weight: 0.15, value: f1 },
    { weight: 0.4, value: mean(lineFieldValues) },
  ].filter((component) => component.value != null);
  const businessScore =
    components.reduce((sum, component) => sum + component.weight * component.value, 0) /
    components.reduce((sum, component) => sum + component.weight, 0);
  const criticalChecks = [
    ...Object.values(metadataChecks),
    ...Object.values(totalChecks),
    recall === 1,
    ...lineChecks.flatMap((check) =>
      ['reference', 'quantity', 'unit', 'unitPrice', 'total']
        .map((field) => check[field])
        .filter((value) => value != null),
    ),
  ];

  return {
    businessScore,
    perfectCritical: criticalChecks.every(Boolean),
    metadataChecks,
    totalChecks,
    lineDetection: {
      expected: expectedLines.length,
      predicted: predictedLines.length,
      matched: matchedCount,
      precision,
      recall,
      f1,
    },
    lineChecks,
  };
}

function retryAttempt(current) {
  const primary = current?.primary;
  if (!primary) return null;
  if (primary.success) return { ...primary, usedRetry: false };
  const retry = current?.diagnosticRetry;
  if (!retry) return { ...primary, usedRetry: false };
  return {
    ...retry,
    wallMs: primary.wallMs + retry.wallMs,
    remoteCallCount: primary.remoteCallCount + retry.remoteCallCount,
    ocrRequestCount: primary.ocrRequestCount + retry.ocrRequestCount,
    chatCallCount: primary.chatCallCount + retry.chatCallCount,
    usedRetry: true,
  };
}

function chooseAttempt(record, mode, withRetry) {
  const current = withRetry ? retryAttempt(record.current) : record.current?.primary;
  if (mode === 'current') return current;
  const inspectorMs = record.firecrawl?.wallMsMedian ?? 0;
  const route = record.firecrawl?.predictedRouting ?? 'ocr';
  if (route === 'local') {
    return mode === 'hybrid_ai' ? record.firecrawlLocal?.ai : record.firecrawlLocal?.heuristicsOnly;
  }
  if (!current) return current;
  return {
    ...current,
    wallMs: current.wallMs + inspectorMs,
    pdfInspectorWallMs: inspectorMs,
  };
}

function flattenChecks(evaluations, group, field) {
  return evaluations
    .flatMap((entry) =>
      field == null
        ? Object.values(entry.evaluation?.[group] ?? {})
        : [entry.evaluation?.[group]?.[field]],
    )
    .filter((value) => value != null)
    .map(Boolean);
}

function lineFieldChecks(evaluations, field) {
  return evaluations
    .flatMap((entry) => entry.evaluation?.lineChecks ?? [])
    .map((check) => check[field])
    .filter((value) => value != null)
    .map(Boolean);
}

function summarizeGroup(entries) {
  const successful = entries.filter((entry) => entry.success);
  const scored = entries.filter((entry) => entry.evaluation);
  const expectedLines = scored.reduce(
    (sum, entry) => sum + entry.evaluation.lineDetection.expected,
    0,
  );
  const predictedLines = scored.reduce(
    (sum, entry) => sum + entry.evaluation.lineDetection.predicted,
    0,
  );
  const matchedLines = scored.reduce(
    (sum, entry) => sum + entry.evaluation.lineDetection.matched,
    0,
  );
  const recall = expectedLines ? matchedLines / expectedLines : 1;
  const precision = predictedLines ? matchedLines / predictedLines : expectedLines ? 0 : 1;
  return {
    documents: entries.length,
    successfulDocuments: successful.length,
    successRate: entries.length ? successful.length / entries.length : null,
    latencyMs: {
      mean: mean(entries.map((entry) => entry.wallMs)),
      median: percentile(
        entries.map((entry) => entry.wallMs),
        0.5,
      ),
      p95: percentile(
        entries.map((entry) => entry.wallMs),
        0.95,
      ),
      max: entries.length ? Math.max(...entries.map((entry) => entry.wallMs)) : null,
      total: entries.reduce((sum, entry) => sum + entry.wallMs, 0),
    },
    remoteCalls: {
      total: entries.reduce((sum, entry) => sum + entry.remoteCallCount, 0),
      meanPerDocument: mean(entries.map((entry) => entry.remoteCallCount)),
    },
    quality: {
      meanBusinessScore: mean(entries.map((entry) => entry.evaluation?.businessScore ?? 0)),
      perfectCriticalDocuments: entries.filter((entry) => entry.evaluation?.perfectCritical).length,
      perfectCriticalRate: rate(entries.map((entry) => Boolean(entry.evaluation?.perfectCritical))),
      documentTypeAccuracy: rate(flattenChecks(scored, 'metadataChecks', 'documentType')),
      supplierAccuracy: rate(scored.map((entry) => entry.evaluation.metadataChecks.supplier)),
      identifierAccuracy: rate(scored.map((entry) => entry.evaluation.metadataChecks.identifier)),
      documentDateAccuracy: rate(
        scored.map((entry) => entry.evaluation.metadataChecks.documentDate),
      ),
      deliveryDateAccuracy: rate(
        scored
          .map((entry) => entry.evaluation.metadataChecks.deliveryDate)
          .filter((value) => value != null),
      ),
      totalsAccuracy: rate(flattenChecks(scored, 'totalChecks')),
      linePrecision: precision,
      lineRecall: recall,
      lineF1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0,
      referenceAccuracy: rate(lineFieldChecks(scored, 'reference')),
      labelAccuracy: rate(lineFieldChecks(scored, 'label')),
      quantityAccuracy: rate(lineFieldChecks(scored, 'quantity')),
      unitAccuracy: rate(lineFieldChecks(scored, 'unit')),
      unitPriceAccuracy: rate(lineFieldChecks(scored, 'unitPrice')),
      lineTotalAccuracy: rate(lineFieldChecks(scored, 'total')),
      vatRateAccuracy: rate(lineFieldChecks(scored, 'vatRate')),
      lotAccuracy: rate(lineFieldChecks(scored, 'lotNumber')),
      bestBeforeDateAccuracy: rate(lineFieldChecks(scored, 'bestBeforeDate')),
    },
  };
}

function grouped(entries, field) {
  const values = [...new Set(entries.map((entry) => entry[field]))].sort();
  return Object.fromEntries(
    values.map((value) => [
      value,
      summarizeGroup(entries.filter((entry) => entry[field] === value)),
    ]),
  );
}

function pairedDelta(leftEntries, rightEntries, field) {
  const right = new Map(rightEntries.map((entry) => [entry.id, entry]));
  const differences = leftEntries
    .map((entry) => {
      const other = right.get(entry.id);
      if (!other) return null;
      return field(entry) - field(other);
    })
    .filter((value) => value != null);
  const average = mean(differences);
  const variance =
    differences.length > 1
      ? differences.reduce((sum, value) => sum + (value - average) ** 2, 0) /
        (differences.length - 1)
      : 0;
  const margin = differences.length ? 1.96 * Math.sqrt(variance / differences.length) : null;
  return {
    pairs: differences.length,
    meanDelta: average,
    confidenceInterval95: margin == null ? null : [average - margin, average + margin],
  };
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const raw = JSON.parse(await readFile(resultsPath, 'utf8'));
const groundTruthById = new Map(
  manifest.documents.map((document) => [document.id, document.groundTruth]),
);

const scenarioDefinitions = [
  { id: 'current', mode: 'current', withRetry: false, label: 'ToqueHub actuel' },
  { id: 'current_retry', mode: 'current', withRetry: true, label: 'ToqueHub actuel + 1 retry' },
  {
    id: 'hybrid_ai',
    mode: 'hybrid_ai',
    withRetry: false,
    label: 'Firecrawl routeur + analyse Mistral',
  },
  {
    id: 'hybrid_ai_retry',
    mode: 'hybrid_ai',
    withRetry: true,
    label: 'Firecrawl routeur + analyse Mistral + retry OCR',
  },
  {
    id: 'hybrid_heuristics',
    mode: 'hybrid_heuristics',
    withRetry: false,
    label: 'Firecrawl routeur + parseur sans IA',
  },
  {
    id: 'hybrid_heuristics_retry',
    mode: 'hybrid_heuristics',
    withRetry: true,
    label: 'Firecrawl routeur + parseur sans IA + retry OCR',
  },
];

const scenarios = {};
for (const definition of scenarioDefinitions) {
  const entries = raw.results.map((record) => {
    const attempt = chooseAttempt(record, definition.mode, definition.withRetry);
    const success = Boolean(attempt?.success && attempt?.extraction);
    const evaluation = success
      ? evaluateExtraction(groundTruthById.get(record.id), attempt.extraction)
      : null;
    return {
      id: record.id,
      category: record.category,
      language: record.language,
      documentType: record.documentType,
      route: record.firecrawl?.predictedRouting ?? 'ocr',
      success,
      wallMs: attempt?.wallMs ?? 0,
      remoteCallCount: attempt?.remoteCallCount ?? 0,
      usedRetry: Boolean(attempt?.usedRetry),
      error: attempt?.error ?? null,
      evaluation,
    };
  });
  scenarios[definition.id] = {
    label: definition.label,
    summary: summarizeGroup(entries),
    byCategory: grouped(entries, 'category'),
    byLanguage: grouped(entries, 'language'),
    byDocumentType: grouped(entries, 'documentType'),
    documents: entries,
  };
}

const routingCorrect = raw.results.filter(
  (record) => record.firecrawl?.predictedRouting === record.expectedRouting,
).length;
const localDocuments = scenarios.current.documents.filter((entry) => entry.route === 'local');
const localIds = new Set(localDocuments.map((entry) => entry.id));
const localSubset = (scenario) => scenario.documents.filter((entry) => localIds.has(entry.id));
const output = {
  generatedAt: new Date().toISOString(),
  corpus: {
    documents: manifest.documents.length,
    pages: manifest.documents.reduce((sum, document) => sum + document.pageCount, 0),
    categories: Object.fromEntries(
      [...new Set(manifest.documents.map((document) => document.category))]
        .sort()
        .map((category) => [
          category,
          manifest.documents.filter((document) => document.category === category).length,
        ]),
    ),
    languages: Object.fromEntries(
      [...new Set(manifest.documents.map((document) => document.language))]
        .sort()
        .map((language) => [
          language,
          manifest.documents.filter((document) => document.language === language).length,
        ]),
    ),
  },
  routing: {
    correct: routingCorrect,
    accuracy: routingCorrect / raw.results.length,
    localDocuments: raw.results.filter((record) => record.firecrawl?.predictedRouting === 'local')
      .length,
    ocrDocuments: raw.results.filter((record) => record.firecrawl?.predictedRouting === 'ocr')
      .length,
    inspectorLatencyMs: {
      median: percentile(
        raw.results.map((record) => record.firecrawl?.wallMsMedian ?? 0),
        0.5,
      ),
      p95: percentile(
        raw.results.map((record) => record.firecrawl?.wallMsP95 ?? 0),
        0.95,
      ),
    },
  },
  scenarios,
  pairedNativeTextComparison: {
    hybridAiMinusCurrentBusinessScore: pairedDelta(
      localSubset(scenarios.hybrid_ai),
      localSubset(scenarios.current),
      (entry) => entry.evaluation?.businessScore ?? 0,
    ),
    hybridAiMinusCurrentLatencyMs: pairedDelta(
      localSubset(scenarios.hybrid_ai),
      localSubset(scenarios.current),
      (entry) => entry.wallMs,
    ),
    heuristicsMinusCurrentBusinessScore: pairedDelta(
      localSubset(scenarios.hybrid_heuristics),
      localSubset(scenarios.current),
      (entry) => entry.evaluation?.businessScore ?? 0,
    ),
    heuristicsMinusCurrentLatencyMs: pairedDelta(
      localSubset(scenarios.hybrid_heuristics),
      localSubset(scenarios.current),
      (entry) => entry.wallMs,
    ),
  },
};

await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, 'evaluation.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${resolve(outputDir, 'evaluation.json')}`);
