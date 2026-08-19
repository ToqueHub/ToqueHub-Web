import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const rootDir = resolve(import.meta.dirname, '../..');
const inputPath = resolve(rootDir, 'apps/web/src/i18n/fr-source.generated.json');
const outputPath = resolve(rootDir, 'apps/web/src/i18n/en.generated.ts');
const maxBatchCharacters = 3_200;
const concurrency = 1;

const entries = JSON.parse(await readFile(inputPath, 'utf8'));
let existingCatalog = {};
try {
  ({ englishCatalog: existingCatalog } = await import(pathToFileURL(outputPath).href));
} catch {
  // The first catalog generation has no existing output to reuse.
}

const protectedTerms = [
  'ToqueHub', 'HACCP', 'Mistral', 'FranceAgriMer', 'RNM', 'FlatPay', 'Fennoa',
  'Google', 'Microsoft', 'MQTT', 'OCR', 'SKU', 'CSV', 'PDF', 'API', 'JWT',
];
const frenchSignal = /[àâçéèêëîïôùûüÿœ]|\b(?:accueil|achats?|ajouter|annuler|aucun(?:e)?|catégories?|choisir|commandes?|confirmer|connexion|créer|données?|enregistrer|établissements?|fermer|fiches?|fournisseurs?|français|général|historique|jours?|langue|lignes?|modifier|nouveau|paramètres|plannings?|produits?|réceptions?|rechercher|retour|sauvegardes?|sélectionner|services?|stocks?|suivant|supprimer|tableau|terminer|utilisateurs?|valider|votre|vos|vous)\b/iu;

function marker(index) {
  return `__I18N_${String(index).padStart(6, '0')}__`;
}

function protect(text) {
  let result = text;
  protectedTerms.forEach((term, index) => {
    result = result.replaceAll(term, `__TERM_${String(index).padStart(2, '0')}__`);
  });
  return result;
}

function restore(text) {
  let result = text;
  protectedTerms.forEach((term, index) => {
    result = result.replaceAll(`__TERM_${String(index).padStart(2, '0')}__`, term);
    result = result.replaceAll(`__ term_${String(index).padStart(2, '0')} __`, term);
  });
  return result;
}

const batches = [];
let batch = [];
let batchLength = 0;
for (let index = 0; index < entries.length; index += 1) {
  if (existingCatalog[entries[index].text]) continue;
  if (!frenchSignal.test(entries[index].text)) continue;
  const text = protect(entries[index].text);
  const cost = text.length + marker(index).length + 2;
  if (batch.length && batchLength + cost > maxBatchCharacters) {
    batches.push(batch);
    batch = [];
    batchLength = 0;
  }
  batch.push({ index, text });
  batchLength += cost;
}
if (batch.length) batches.push(batch);

async function requestTranslation(text, attempt = 1) {
  try {
    const response = await fetch(
      'https://translate.googleapis.com/translate_a/single?client=gtx&sl=fr&tl=en&dt=t',
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams({ q: text }),
      },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    return payload[0].map((segment) => segment[0]).join('');
  } catch (error) {
    if (attempt >= 4) throw error;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, attempt * 1_000));
    return requestTranslation(text, attempt + 1);
  }
}

function parseBatch(translated, items) {
  const found = new Map();
  const matcher = /__I18N_(\d{6})__/g;
  const matches = [...translated.matchAll(matcher)];
  matches.forEach((match, offset) => {
    const index = Number(match[1]);
    const start = match.index + match[0].length;
    const end = matches[offset + 1]?.index ?? translated.length;
    found.set(index, restore(translated.slice(start, end).trim()));
  });
  return items.map((item) => ({ ...item, translated: found.get(item.index) }));
}

const translations = new Array(entries.length);
entries.forEach((entry, index) => {
  translations[index] = existingCatalog[entry.text];
});
let cursor = 0;
let completed = 0;
const failedBatches = [];

async function worker() {
  while (cursor < batches.length) {
    const currentIndex = cursor++;
    const items = batches[currentIndex];
    const request = items.map((item) => `${marker(item.index)}\n${item.text}`).join('\n');
    try {
      const translated = await requestTranslation(request);
      const parsed = parseBatch(translated, items);
      for (const item of parsed) {
        if (item.translated) {
          translations[item.index] = item.translated;
        } else {
          translations[item.index] = restore(await requestTranslation(item.text));
        }
      }
    } catch (error) {
      console.warn(`Batch ${currentIndex + 1} failed: ${error.message}`);
      failedBatches.push(currentIndex + 1);
    }
    completed += 1;
    if (completed % 10 === 0 || completed === batches.length) {
      console.log(`Translated ${completed}/${batches.length} batches.`);
    }
  }
}

console.log(`Translating ${entries.length} strings in ${batches.length} batches...`);
await Promise.all(Array.from({ length: concurrency }, () => worker()));

if (failedBatches.length) {
  throw new Error(
    `Translation stopped without overwriting the catalog; failed batches: ${failedBatches.join(', ')}`,
  );
}

const pairs = entries
  .map((entry, index) => [entry.text, translations[index] || entry.text])
  .filter(([source, target]) => source !== target);

const header = `// Generated by scripts/i18n/translate-web-catalog.mjs.\n`;
const contents = `${header}export const englishCatalog: Readonly<Record<string, string>> = ${JSON.stringify(
  Object.fromEntries(pairs),
  null,
  2,
)};\n`;

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, contents, 'utf8');
console.log(`Wrote ${pairs.length} translations to ${relative(rootDir, outputPath)}.`);
