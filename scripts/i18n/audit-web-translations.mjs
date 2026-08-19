import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const rootDir = resolve(import.meta.dirname, '../..');
const sourcePath = resolve(rootDir, 'apps/web/src/i18n/fr-source.generated.json');
const catalogPath = resolve(rootDir, 'apps/web/src/i18n/en.generated.ts');
const overridesPath = resolve(rootDir, 'apps/web/src/i18n/overrides.ts');
const entries = JSON.parse(await readFile(sourcePath, 'utf8'));
const { englishCatalog } = await import(pathToFileURL(catalogPath).href);
const { englishOverrides } = await import(pathToFileURL(overridesPath).href);
const normalize = (value) => value.replace(/\s+/gu, ' ').trim();
const english = Object.fromEntries(
  Object.entries({ ...englishCatalog, ...englishOverrides }).map(([source, target]) => [
    normalize(source),
    normalize(target),
  ]),
);

const frenchSignal = /[àâçéèêëîïôùûüÿœ]|\b(?:accueil|achats?|ajouter|annuler|aucun(?:e)?|catégories?|choisir|commandes?|confirmer|connexion|créer|données?|enregistrer|établissements?|fermer|fiches?|fournisseurs?|français|général|historique|jours?|langue|lignes?|modifier|nouveau|paramètres|plannings?|produits?|réceptions?|rechercher|retour|sauvegardes?|sélectionner|services?|stocks?|suivant|supprimer|tableau|terminer|utilisateurs?|valider|votre|vos|vous)\b/iu;
const ignored = /^(?:ToqueHub|HACCP|Mistral|FranceAgriMer|RNM|FlatPay|Fennoa)$/i;
const validUnchanged = /^(?:date|document|document:|document OCR|service|service\(s\)|service\(s\) ·|stock|stock:|stock ·|min stock|minimum stock|planning|planning -|multi-site|type & date|action planning|export planning|LIÈG|The French Café(?: Oy)?|date,action,entity,user|date,user,action,entityType,entityName|system-ui, -apple-system, sans-serif)$/i;
const technicalString = /(?:\b(?:badge|btn|card|modal|planning|stocks|stock|equipment|inventory|settings|setup|stats|row|hr|cockpit|production)[-_][a-z]|^(?:GET|POST|PUT|PATCH|DELETE) \/|^[a-z][a-z0-9_.:/-]+$|^[?·]|\$1|^[a-z-]+(?: [a-z-]+){2,}$)/i;
const alreadyEnglish = /\b(?:and|application|creates|first|for|installs|levels|operation|organization|preserving|projected|read-only|starts|the|through|uninstalls|updates|used|with)\b/i;
const essentialTranslations = {
  'Tableau de bord': 'Dashboard',
  'Cours des Produits': 'Market Prices',
  'Fiches Techniques': 'Technical Sheets',
  Achats: 'Purchasing',
  'Ressources humaines': 'Human Resources',
  'Applications installées': 'Installed apps',
  'Répertoire clients': 'Customer directory',
  Paramètres: 'Settings',
  'Aucune application trouvée': 'No apps found',
  'Ajouter un produit': 'Add a product',
  'Créer une fiche technique': 'Create a technical sheet',
  'Nouvelle commande': 'New order',
  'Rapports HACCP': 'HACCP Reports',
};

const candidates = entries.filter(
  ({ text }) =>
    frenchSignal.test(text) &&
    !ignored.test(text) &&
    !validUnchanged.test(text) &&
    !technicalString.test(text) &&
    !alreadyEnglish.test(text),
);
const untranslated = candidates.filter(({ text }) => !english[normalize(text)]);

const totalFrenchCandidates = candidates.length;
const coverage = totalFrenchCandidates
  ? ((totalFrenchCandidates - untranslated.length) / totalFrenchCandidates) * 100
  : 100;

console.log(`Catalog entries: ${entries.length}`);
console.log(`French-looking entries: ${totalFrenchCandidates}`);
console.log(`French-looking entries translated: ${totalFrenchCandidates - untranslated.length}`);
console.log(`Static French coverage: ${coverage.toFixed(2)}%`);

const brokenPlaceholders = Object.entries(english).filter(([, target]) =>
  /\bTERM[\s_]*\d{2}\b/i.test(target),
);
const brokenEssentials = Object.entries(essentialTranslations).filter(
  ([source, expected]) => english[source] !== expected,
);

if (untranslated.length) {
  console.log('\nUntranslated French-looking candidates:');
  for (const entry of untranslated.slice(0, 200)) {
    console.log(`- ${JSON.stringify(entry.text)} (${entry.files[0]})`);
  }
  process.exitCode = 1;
}

if (brokenPlaceholders.length) {
  console.log(`\nBroken protected-term placeholders: ${brokenPlaceholders.length}`);
  for (const [source, target] of brokenPlaceholders.slice(0, 50)) {
    console.log(`- ${JSON.stringify(source)} => ${JSON.stringify(target)}`);
  }
  process.exitCode = 1;
}

if (brokenEssentials.length) {
  console.log('\nMissing or unexpected essential module translations:');
  for (const [source, expected] of brokenEssentials) {
    console.log(`- ${JSON.stringify(source)}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(english[source])}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Essential module translations verified: ${Object.keys(essentialTranslations).length}`);
}
