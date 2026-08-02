import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const outputRoot = resolve(
  process.argv[2] ?? resolve(repoRoot, 'outputs/pdf-ocr-benchmark-2026-08-02'),
);
const manifest = JSON.parse(
  await readFile(resolve(repoRoot, 'tmp/pdfs/ocr-benchmark/manifest.json'), 'utf8'),
);
const engineNames = ['firecrawl', 'toquehub-ocr', 'hybrid', 'hybrid-guarded'];
const engines = {};
for (const name of engineNames) {
  engines[name] = {
    results: JSON.parse(await readFile(resolve(outputRoot, name, 'results.json'), 'utf8')),
    evaluation: JSON.parse(await readFile(resolve(outputRoot, name, 'evaluation.json'), 'utf8')),
  };
}

const evaluationMaps = Object.fromEntries(
  engineNames.map((name) => [
    name,
    new Map(
      engines[name].evaluation.documents.map((document) => [document.document_id, document.scores]),
    ),
  ]),
);
const resultMaps = Object.fromEntries(
  engineNames.map((name) => [
    name,
    new Map(engines[name].results.results.map((result) => [result.id, result])),
  ]),
);

const mean = (values) => {
  const present = values.filter((value) => value !== null && value !== undefined);
  return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
};
const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null;
};
const percent = (value) => value * 100;
const fixed = (value, digits = 3) => (value === null ? 'n/a' : value.toFixed(digits));
const percentText = (value, digits = 1) => `${percent(value).toFixed(digits)} %`;
const idsWhere = (predicate) => manifest.documents.filter(predicate).map((document) => document.id);

function quality(engine, ids) {
  const scores = evaluationMaps[engine];
  return Object.fromEntries(
    ['overall', 'nid', 'nid_s', 'teds', 'teds_s', 'mhs', 'mhs_s'].map((metric) => [
      metric,
      mean(ids.map((id) => scores.get(id)?.[metric])),
    ]),
  );
}

function groupSummary(predicate) {
  const ids = idsWhere(predicate);
  return {
    documentCount: ids.length,
    firecrawl: quality('firecrawl', ids),
    toquehubOcr: quality('toquehub-ocr', ids),
    hybrid: quality('hybrid', ids),
    guardedHybrid: quality('hybrid-guarded', ids),
  };
}

const groups = {
  all: groupSummary(() => true),
  native: groupSummary((document) => document.category === 'native_text'),
  nativePublic: groupSummary(
    (document) => document.category === 'native_text' && document.origin === 'opendataloader-bench',
  ),
  nativeBusiness: groupSummary(
    (document) =>
      document.category === 'native_text' && document.origin === 'synthetic-toquehub-business',
  ),
  scans: groupSummary((document) => document.category.startsWith('scan_')),
  mixed: groupSummary((document) => document.category === 'mixed'),
  business: groupSummary((document) => document.origin === 'synthetic-toquehub-business'),
};

const perCategory = {};
for (const category of Object.keys(manifest.categoryCounts)) {
  const ids = idsWhere((document) => document.category === category);
  const mistralResults = ids.map((id) => resultMaps['toquehub-ocr'].get(id));
  const firecrawlResults = ids.map((id) => resultMaps.firecrawl.get(id));
  perCategory[category] = {
    documentCount: ids.length,
    firecrawlQuality: quality('firecrawl', ids),
    toquehubQuality: quality('toquehub-ocr', ids),
    toquehubMedianLatencyMs: median(mistralResults.map((result) => result.wallMs)),
    toquehubSuccessRate: mean(mistralResults.map((result) => (result.success ? 1 : 0))),
    firecrawlMedianLatencyMs: median(firecrawlResults.map((result) => result.wallMsMedian)),
  };
}

const nativeIds = idsWhere((document) => document.category === 'native_text');
let firecrawlWins = 0;
let ties = 0;
let mistralWins = 0;
for (const id of nativeIds) {
  const local = evaluationMaps.firecrawl.get(id).overall;
  const remote = evaluationMaps['toquehub-ocr'].get(id).overall;
  if (local > remote + 1e-9) firecrawlWins += 1;
  else if (remote > local + 1e-9) mistralWins += 1;
  else ties += 1;
}

const current = engines['toquehub-ocr'].results;
const fastHybrid = engines.hybrid.results;
const guardedHybrid = engines['hybrid-guarded'].results;
const firecrawl = engines.firecrawl.results;
const totalPages = manifest.documents.reduce((sum, document) => sum + document.pageCount, 0);
const fastLocalPages = fastHybrid.results
  .filter((result) => result.selectedEngine === 'firecrawl')
  .reduce(
    (sum, result) =>
      sum + manifest.documents.find((document) => document.id === result.id).pageCount,
    0,
  );
const guardedLocalPages = guardedHybrid.results
  .filter((result) => result.selectedEngine === 'firecrawl')
  .reduce(
    (sum, result) =>
      sum + manifest.documents.find((document) => document.id === result.id).pageCount,
    0,
  );

const nativeFirecrawlMedianMs = median(
  nativeIds.map((id) => resultMaps.firecrawl.get(id).wallMsMedian),
);
const nativeMistralMedianMs = median(
  nativeIds.map((id) => resultMaps['toquehub-ocr'].get(id).wallMs),
);

const scenarios = {
  current: {
    label: 'ToqueHub OCR actuel',
    localDocuments: 0,
    ocrDocuments: 100,
    ocrPages: totalPages,
    successfulDocuments: current.successfulDocuments,
    totalLatencyMs: current.totalWallMs,
    overallQuality: groups.all.toquehubOcr.overall,
  },
  replacement: {
    label: 'Remplacement complet Firecrawl',
    localDocuments: 100,
    ocrDocuments: 0,
    ocrPages: 0,
    successfulDocuments: 35,
    totalLatencyMs: firecrawl.medianCompleteRunMs,
    overallQuality: groups.all.firecrawl.overall,
    note: '35 PDF totalement extractibles; les 60 scans et 5 documents mixtes nécessitent un OCR.',
  },
  fastHybrid: {
    label: 'Hybride rapide',
    localDocuments: fastHybrid.localDocuments,
    ocrDocuments: fastHybrid.ocrDocuments,
    ocrPages: totalPages - fastLocalPages,
    successfulDocuments: fastHybrid.successfulDocuments,
    totalLatencyMs: fastHybrid.totalSimulatedLatencyMs,
    overallQuality: groups.all.hybrid.overall,
  },
  guardedHybrid: {
    label: 'Hybride protégé (sans tables)',
    localDocuments: guardedHybrid.localDocuments,
    ocrDocuments: guardedHybrid.ocrDocuments,
    ocrPages: totalPages - guardedLocalPages,
    successfulDocuments: guardedHybrid.successfulDocuments,
    totalLatencyMs: guardedHybrid.totalSimulatedLatencyMs,
    overallQuality: groups.all.guardedHybrid.overall,
  },
};
for (const scenario of Object.values(scenarios)) {
  scenario.latencyReductionVsCurrent =
    1 - scenario.totalLatencyMs / scenarios.current.totalLatencyMs;
  scenario.ocrCallReductionVsCurrent = 1 - scenario.ocrDocuments / 100;
  scenario.ocrPageReductionVsCurrent = 1 - scenario.ocrPages / totalPages;
  scenario.qualityDeltaVsCurrent = scenario.overallQuality - scenarios.current.overallQuality;
}

const comparison = {
  generatedAt: new Date().toISOString(),
  decision:
    'Conserver Mistral OCR; ne pas le remplacer par Firecrawl. Ajouter Firecrawl en pré-analyse et tester un routage protégé derrière un feature flag.',
  corpus: {
    documentCount: manifest.documentCount,
    pageCount: totalPages,
    categoryCounts: manifest.categoryCounts,
    uniquePublicSourcePages: manifest.sourceCorpus.uniquePublicSourcePages,
    syntheticBusinessDocuments: manifest.sourceCorpus.syntheticBusinessDocuments,
    languagesInSyntheticBusinessSet: ['fr', 'fi', 'en'],
  },
  environment: {
    platform: `${os.platform()} ${os.arch()} ${os.release()}`,
    cpu: os.cpus()[0]?.model,
    logicalCpuCount: os.cpus().length,
    memoryGiB: os.totalmem() / 1024 ** 3,
    node: process.version,
  },
  engines: {
    firecrawl: {
      version: '1.11.2',
      sourceCommit: 'a15ec2d68d51dbe6a39d1da688ec7a3f642d846c',
      completeRunMedianMs: firecrawl.medianCompleteRunMs,
      sequentialDocumentsPerSecond: firecrawl.sequentialDocumentsPerSecond,
      routingAccuracy: firecrawl.routingCorrectDocuments / firecrawl.documentCount,
      nativeMedianLatencyMs: nativeFirecrawlMedianMs,
    },
    toquehub: {
      model: current.engine.model,
      successfulDocuments: current.successfulDocuments,
      latencyMs: current.latencyMs,
      nativeMedianLatencyMs: nativeMistralMedianMs,
      diagnosticRetry: {
        documentId: 'test-068',
        firstAttempt: 'timeout at 60013 ms',
        secondAttempt: 'success in 2046 ms with a 120 s diagnostic timeout',
      },
    },
  },
  groups,
  perCategory,
  nativeHeadToHead: {
    documentCount: nativeIds.length,
    firecrawlWins,
    ties,
    mistralWins,
    medianSpeedup: nativeMistralMedianMs / nativeFirecrawlMedianMs,
  },
  scenarios,
  recommendation: {
    immediate: [
      'Keep Mistral OCR as the production source of truth for Stocks invoices, delivery notes, orders and receipts.',
      'Use pdf-inspector as a local preflight classifier and observability layer, not as the only OCR engine.',
      'Add one bounded retry for timeout/network failures; test-068 succeeded on the diagnostic retry.',
    ],
    pilot: [
      'Behind a feature flag, use local extraction only for high-confidence TextBased PDFs with no encoding issue, no pagesNeedingOcr and no detected table.',
      'Keep every scan, mixed PDF and detected table on Mistral OCR.',
      'Before widening the fast path to stock documents, run a field-level benchmark on real anonymized invoices and delivery notes.',
    ],
  },
};

const report = `# Rapport comparatif - analyse PDF ToqueHub vs Firecrawl

Date du test : 2 août 2026  
Corpus : 100 PDF, 105 pages  
Décision : **conserver l'OCR Mistral de ToqueHub et ajouter Firecrawl en pré-analyse; ne pas effectuer de remplacement complet.**

## Résumé exécutif

Firecrawl est extrêmement rapide et son routage a été correct sur **100/100 PDF**. Son passage médian complet sur les 100 documents a pris **${fixed(firecrawl.medianCompleteRunMs, 1)} ms**. En revanche, il n'effectue pas d'OCR : les **60 scans** et les **5 PDF mixtes** ne sont pas entièrement extractibles sans le moteur actuel.

Sur les 35 PDF à texte natif, l'extraction Firecrawl a pris une médiane de **${fixed(nativeFirecrawlMedianMs, 2)} ms**, contre **${fixed(nativeMistralMedianMs, 0)} ms** pour ToqueHub/Mistral, soit un facteur de **${fixed(nativeMistralMedianMs / nativeFirecrawlMedianMs, 0)}x**. Mais la qualité moyenne est inférieure : **${fixed(groups.native.firecrawl.overall)}** contre **${fixed(groups.native.toquehubOcr.overall)}**.

Pour les 5 documents métier natifs, l'écart est plus important : score global **${fixed(groups.nativeBusiness.firecrawl.overall)}** contre **${fixed(groups.nativeBusiness.toquehubOcr.overall)}**, et fidélité des tableaux **${fixed(groups.nativeBusiness.firecrawl.teds)}** contre **${fixed(groups.nativeBusiness.toquehubOcr.teds)}**. C'est le point décisif pour Stocks.

## Scénarios comparés

| Scénario | Local | Appels OCR | Pages OCR | Qualité globale | Temps total séquentiel | Gain de temps |
|---|---:|---:|---:|---:|---:|---:|
${Object.values(scenarios)
  .map(
    (scenario) =>
      `| ${scenario.label} | ${scenario.localDocuments} | ${scenario.ocrDocuments} | ${scenario.ocrPages} | ${fixed(scenario.overallQuality)} | ${fixed(scenario.totalLatencyMs / 1000, 1)} s | ${percentText(scenario.latencyReductionVsCurrent)} |`,
  )
  .join('\n')}

Le remplacement complet est rejeté : son score global tombe à **${fixed(scenarios.replacement.overallQuality)}**, essentiellement parce que Firecrawl ne lit pas les scans. L'hybride rapide économise **${percentText(scenarios.fastHybrid.ocrCallReductionVsCurrent)}** des appels OCR et **${percentText(scenarios.fastHybrid.latencyReductionVsCurrent)}** du temps dans ce corpus, mais perd **${fixed(Math.abs(scenarios.fastHybrid.qualityDeltaVsCurrent))}** point de qualité.

L'hybride protégé est la meilleure piste de pilote : il réserve Firecrawl aux PDF natifs sans table détectée. Il économise **${percentText(scenarios.guardedHybrid.ocrCallReductionVsCurrent)}** des appels, réduit le temps de **${percentText(scenarios.guardedHybrid.latencyReductionVsCurrent)}**, et limite la baisse de qualité à **${fixed(Math.abs(scenarios.guardedHybrid.qualityDeltaVsCurrent))}**. Tous les 15 documents métier du corpus restent alors sur Mistral.

## Résultats par type de PDF

| Catégorie | N | Score ToqueHub | NID texte | Latence médiane ToqueHub | Score Firecrawl |
|---|---:|---:|---:|---:|---:|
${Object.entries(perCategory)
  .map(
    ([category, values]) =>
      `| ${category} | ${values.documentCount} | ${fixed(values.toquehubQuality.overall)} | ${fixed(values.toquehubQuality.nid)} | ${fixed(values.toquehubMedianLatencyMs, 0)} ms | ${fixed(values.firecrawlQuality.overall)} |`,
  )
  .join('\n')}

## Fiabilité et rapidité

- Firecrawl : 100 appels locaux réussis, décision local/OCR correcte dans 100 cas sur 100; débit séquentiel médian de **${fixed(firecrawl.sequentialDocumentsPerSecond, 0)} PDF/s** après initialisation.
- ToqueHub/Mistral : **99/100** réussites au premier passage; médiane **${fixed(current.latencyMs.median, 0)} ms**, p95 **${fixed(current.latencyMs.p95, 0)} ms**.
- Le test-068 a atteint le timeout de production à 60 s. Une relance diagnostique a réussi en 2 046 ms, ce qui indique un incident transitoire et justifie un retry borné.
- Sur les 35 PDF natifs, Firecrawl gagne le score global dans ${firecrawlWins} cas, Mistral dans ${mistralWins} cas, avec ${ties} égalité.

## Méthode

Le corpus combine 90 pages publiques uniques issues d'OpenDataLoader Bench et 15 documents métier synthétiques distincts. Il contient 35 PDF natifs, 18 scans propres, 18 scans basse résolution, 12 scans inclinés, 6 scans bruités, 6 scans fortement compressés et 5 PDF mixtes de deux pages. Les documents métier couvrent factures, bons de livraison, confirmations de commande, tickets et catalogues en français, finnois et anglais.

Les sorties Markdown sont comparées à une vérité terrain avec les métriques OpenDataLoader : NID pour le texte et l'ordre de lecture, TEDS pour les tableaux, MHS pour les titres. Le score global est la moyenne des métriques disponibles par document. Les temps Firecrawl mesurent l'appel en mémoire après initialisation; les temps ToqueHub incluent encodage base64, réseau et traitement Mistral via la classe réellement utilisée dans le dépôt.

Versions : pdf-inspector npm 1.11.2, source Firecrawl commit a15ec2d68d51dbe6a39d1da688ec7a3f642d846c; OpenDataLoader Bench commit 7af1d8f4d0c09f51ea1a5c6ba5f66e993286d109; modèle ToqueHub ${current.engine.model}.

## Recommandation

1. **Ne pas remplacer Mistral OCR par Firecrawl dans Stocks.** Les scans exigent l'OCR et les tableaux métier sont sensiblement mieux reconstruits par Mistral.
2. **Ajouter Firecrawl comme pré-analyse locale.** Exploiter le type PDF, les pages à OCR, les problèmes d'encodage et la détection de tables pour décider du parcours.
3. **Piloter l'hybride protégé derrière un feature flag.** Fast-path uniquement si le PDF est TextBased, sans problème d'encodage, sans page à OCR et sans table détectée.
4. **Ajouter un retry borné sur timeout/réseau.** Une seule relance avec backoff et métriques séparées suffit pour traiter le cas observé sans masquer les pannes.
5. **Avant d'élargir le fast-path aux documents Stocks**, constituer un jeu anonymisé de vraies factures/BL et mesurer les champs métier : fournisseur, numéros, dates, totaux, références, quantités, unités et prix.

## Limites

- Les 15 documents métier sont synthétiques; aucune facture réelle ni donnée RH du dépôt n'a été envoyée au benchmark.
- Le benchmark mesure la lecture PDF/Markdown, pas l'exactitude finale de chaque champ de réception de stock.
- Les gains d'appels et de pages dépendent du taux réel de PDF natifs en production. Ici, il est de 35 %.
- Les temps Mistral incluent la variabilité réseau et un timeout réel; les temps Firecrawl sont locaux et après initialisation.

## Sources et artefacts

- Firecrawl pdf-inspector : https://github.com/firecrawl/pdf-inspector
- OpenDataLoader Bench : https://github.com/opendataloader-project/opendataloader-bench
- Résultats machine : \`comparison.json\`, \`*/results.json\`, \`*/evaluation.json\` et \`*/evaluation.csv\` dans ce dossier.
`;

await writeFile(resolve(outputRoot, 'comparison.json'), `${JSON.stringify(comparison, null, 2)}\n`);
await writeFile(resolve(outputRoot, 'rapport-efficacite-ocr.md'), report);
console.log(`Wrote ${resolve(outputRoot, 'comparison.json')}`);
console.log(`Wrote ${resolve(outputRoot, 'rapport-efficacite-ocr.md')}`);
