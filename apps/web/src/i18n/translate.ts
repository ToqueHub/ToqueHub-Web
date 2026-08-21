import { englishCatalog } from './en.generated';
import { englishOverrides } from './overrides';
import { activeLanguage, type AppLanguage } from './runtime';

export function normalizeTranslationSource(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

const english: Record<string, string> = Object.fromEntries(
  Object.entries({ ...englishCatalog, ...englishOverrides }).map(([source, target]) => [
    normalizeTranslationSource(source),
    normalizeTranslationSource(target),
  ]),
);

const frenchSignal = /[àâçéèêëîïôùûüÿœ]|\b(?:accueil|achat|ajouter|annuler|aucun|avec|catégorie|choisir|commande|confirmer|connexion|créer|dans|depuis|document|donnée|enregistrer|établissement|fermer|fiche|fournisseur|français|général|historique|jour|langue|ligne|modifier|nouveau|paramètres|planning|produit|réception|rechercher|retour|sans|sélectionner|service|site|stock|suivant|supprimer|tableau|terminer|utilisateur|valider|votre|vous)\b/iu;

const embeddedTranslationsByWord = new Map<string, Array<readonly [string, string]>>();
function indexEmbeddedTranslation(source: string, target: string) {
  if (source.length < 4 || source.length > 1_500 || source === target || !frenchSignal.test(source)) {
    return;
  }
  const firstWord = source.match(/[A-Za-zÀ-ÖØ-öø-ÿŒœ]+/u)?.[0].toLocaleLowerCase('fr');
  if (!firstWord) return;
  const candidates = (embeddedTranslationsByWord.get(firstWord) ?? [])
    .filter(([candidateSource]) => candidateSource !== source);
  candidates.push([source, target]);
  candidates.sort(([left], [right]) => right.length - left.length);
  embeddedTranslationsByWord.set(firstWord, candidates);
}

for (const [source, target] of Object.entries(english)) {
  indexEmbeddedTranslation(source, target);
}

export function registerEnglishTranslations(catalog: Readonly<Record<string, string>>) {
  for (const [rawSource, rawTarget] of Object.entries(catalog)) {
    const source = normalizeTranslationSource(rawSource);
    const target = normalizeTranslationSource(rawTarget);
    english[source] = target;
    indexEmbeddedTranslation(source, target);
  }
}

const fallbackPhrases: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bAujourd’hui\b/giu, 'Today'],
  [/\bHier\b/giu, 'Yesterday'],
  [/\bDemain\b/giu, 'Tomorrow'],
  [/\bAucun message\b/giu, 'No messages'],
  [/\bAucune donnée disponible\b/giu, 'No data available'],
  [/\bAucun résultat\b/giu, 'No results'],
  [/\bAucune application trouvée\b/giu, 'No apps found'],
  [/\bAucune application installée\b/giu, 'No apps installed'],
  [/\bDate inconnue\b/giu, 'Unknown date'],
  [/\bFournisseur non renseigné\b/giu, 'Supplier not provided'],
  [/\bRéférence non renseignée\b/giu, 'Reference not provided'],
  [/\bEn cours\b/giu, 'In progress'],
  [/\bEn attente\b/giu, 'Pending'],
  [/\bTerminé(?:e|es|s)?\b/giu, 'Completed'],
  [/\bAnnulé(?:e|es|s)?\b/giu, 'Cancelled'],
  [/\bValidé(?:e|es|s)?\b/giu, 'Validated'],
  [/\bPlanifié(?:e|es|s)?\b/giu, 'Planned'],
  [/\bArchivé(?:e|es|s)?\b/giu, 'Archived'],
  [/\bBrouillon(?:s)?\b/giu, 'Draft'],
  [/\bErreur(?:s)?\b/giu, 'Error'],
  [/\bAttention\b/giu, 'Warning'],
  [/\bRéussi(?:e)?\b/giu, 'Successful'],
  [/\bmessage(?:s)?\b/giu, 'message(s)'],
  [/\bligne(?:s)?\b/giu, 'line(s)'],
  [/\bproduit(?:s)?\b/giu, 'product(s)'],
  [/\bfournisseur(?:s)?\b/giu, 'supplier(s)'],
  [/\bcatégorie(?:s)?\b/giu, 'category/categories'],
  [/\bdocument(?:s)?\b/giu, 'document(s)'],
  [/\butilisateur(?:s)?\b/giu, 'user(s)'],
  [/\bcollaborateur(?:s)?\b/giu, 'employee(s)'],
  [/\bquantité(?:s)?\b/giu, 'quantity/quantities'],
  [/\bnon reconnu(?:e|es|s)?\b/giu, 'not recognized'],
  [/\bseront créés?\b/giu, 'will be created'],
  [/\bà la validation\b/giu, 'when confirmed'],
  [/\bdepuis\b/giu, 'since'],
  [/\bDernier relevé\b/giu, 'Latest reading'],
  [/\bDernière mise à jour\b/giu, 'Last updated'],
];

function translateEmbeddedCatalogPhrases(value: string): string {
  const words = new Set(
    (value.match(/[A-Za-zÀ-ÖØ-öø-ÿŒœ]+/gu) ?? []).map((word) =>
      word.toLocaleLowerCase('fr'),
    ),
  );
  const candidates = new Map<string, string>();
  for (const word of words) {
    for (const [source, target] of embeddedTranslationsByWord.get(word) ?? []) {
      candidates.set(source, target);
    }
  }

  let result = value;
  for (const [source, target] of [...candidates].sort(
    ([left], [right]) => right.length - left.length,
  )) {
    if (result.includes(source)) result = result.replaceAll(source, target);
  }
  return result;
}

function translateFallback(value: string): string {
  let result = translateEmbeddedCatalogPhrases(value);
  for (const [pattern, replacement] of fallbackPhrases) result = result.replace(pattern, replacement);
  return result;
}

export function translateText(
  value: string,
  language: AppLanguage = activeLanguage(),
): string {
  if (language === 'fr' || !value.trim()) return value;
  const source = normalizeTranslationSource(value);
  const translated = english[source] ?? translateFallback(source);
  if (translated === source) return value;
  const leading = value.match(/^\s*/u)?.[0] ?? '';
  const trailing = value.match(/\s*$/u)?.[0] ?? '';
  return `${leading}${translated}${trailing}`;
}

export function hasEnglishTranslation(value: string): boolean {
  const source = normalizeTranslationSource(value);
  return Boolean(english[source] && english[source] !== source);
}
