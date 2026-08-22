# Benchmark PDF/OCR ToqueHub
 
Ce dossier compare la lecture PDF locale de `@firecrawl/pdf-inspector` à la classe
`MistralClientService.ocrMarkdown` déjà utilisée par ToqueHub.

Le benchmark livré le 2 août 2026 porte sur 100 PDF et 105 pages : 90 pages publiques
uniques d'OpenDataLoader Bench et 15 documents métier synthétiques. Les PDF générés
restent sous `tmp/pdfs/ocr-benchmark/`; les mesures et prédictions sont écrites sous
`outputs/pdf-ocr-benchmark-2026-08-02/`.

## Reproduction

Prérequis : Node.js 20+, Python 3.12 avec Pillow, pypdf et ReportLab, Poppler, accès
réseau, base ToqueHub locale et une organisation disposant d'une clé Mistral.

```sh
git clone --depth 1 https://github.com/firecrawl/pdf-inspector.git tmp/pdf-inspector
git clone --depth 1 https://github.com/opendataloader-project/opendataloader-bench.git tmp/opendataloader-bench

npm install --prefix benchmarks/pdf-ocr
node benchmarks/pdf-ocr/source_inventory.mjs
python3 benchmarks/pdf-ocr/prepare_corpus.py
node benchmarks/pdf-ocr/run_firecrawl.mjs
node --env-file=.env --import tsx benchmarks/pdf-ocr/run_toquehub_ocr.ts
node benchmarks/pdf-ocr/build_hybrid.mjs
node benchmarks/pdf-ocr/build_guarded_hybrid.mjs
```

Les métriques NID, TEDS et MHS sont calculées avec l'évaluateur officiel
d'OpenDataLoader Bench. Après évaluation des quatre dossiers de prédictions, générer
la synthèse et le PDF :

```sh
node benchmarks/pdf-ocr/summarize_results.mjs
python3 benchmarks/pdf-ocr/generate_report_pdf.py
```

## Scénarios

- `firecrawl` : sortie locale de `processPdf` pour les 100 documents.
- `toquehub-ocr` : OCR Mistral actuel, sans l'étape ultérieure d'extraction métier.
- `hybrid` : Firecrawl pour tout PDF natif fiable, Mistral pour les scans et mixtes.
- `hybrid-guarded` : Firecrawl uniquement pour les PDF natifs fiables sans table;
  Mistral pour tous les autres documents.

Le runner ToqueHub reprend automatiquement un fichier `results.partial.json` après
une interruption. Il ne journalise jamais la clé Mistral.
