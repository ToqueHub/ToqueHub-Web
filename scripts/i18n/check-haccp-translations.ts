import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { haccpEnglishCatalog } from '../../apps/web/src/i18n/haccp';
import { registerEnglishTranslations, translateText } from '../../apps/web/src/i18n/translate';

registerEnglishTranslations(haccpEnglishCatalog);

const checks: ReadonlyArray<readonly [string, string, string]> = [
  ['Dashboard navigation', 'Tableau de bord', 'Dashboard'],
  ['Checks navigation', 'Contrôles', 'Checks'],
  ['Processes navigation', 'Procédés', 'Processes'],
  ['Production navigation', 'Production', 'Production'],
  ['Records navigation', 'Registres', 'Records'],
  ['Reports navigation', 'Rapports', 'Reports'],
  ['Settings navigation', 'Réglages', 'Settings'],
  ['Temperatures sub-navigation', 'Températures', 'Temperatures'],
  ['Cleaning sub-navigation', 'Nettoyage', 'Cleaning'],
  ['Traceability sub-navigation', 'Traçabilité', 'Traceability'],
  ['Receipts sub-navigation', 'Réceptions', 'Goods Receipts'],
  ['Oils sub-navigation', 'Huiles', 'Oils'],
  ['Products sub-navigation', 'Produits', 'Products'],
  ['Labels sub-navigation', 'Étiquettes', 'Labels'],
  ['Areas and equipment sub-navigation', 'Zones & matériels', 'Areas & Equipment'],
  ['Sensors sub-navigation', 'Capteurs', 'Sensors'],
  ['Thresholds sub-navigation', 'Seuils & alertes', 'Thresholds & Alerts'],

  ['Dashboard title', 'Tableau de bord HACCP', 'HACCP Dashboard'],
  ['Setup title', 'Zones et matériels', 'Areas & Equipment'],
  ['Sensors title', 'Capteurs de température', 'Temperature Sensors'],
  ['Alerts title', 'Alertes de température', 'Temperature Alerts'],
  ['Temperature title', 'Relevés de température', 'Temperature Readings'],
  ['Cleaning title', 'Nettoyage et désinfection', 'Cleaning & Disinfection'],
  ['Traceability title', 'Traçabilité et étiquetage', 'Traceability & Labelling'],
  ['Receipts title', 'Réception des marchandises', 'Goods Receipt'],
  ['Processes title', 'Procédés froid et chaud', 'Cold & Hot Processes'],
  ['Oil title', 'Contrôle des huiles de friture', 'Frying Oil Checks'],
  ['Production title', 'Suivi de production', 'Production Tracking'],
  ['Products title', 'Catalogue produits', 'Product Catalog'],
  ['Labels title', 'Impression d’étiquettes', 'Label Printing'],
  ['Reports title', 'Rapports et audits HACCP', 'HACCP Reports & Audits'],

  ['Name column', 'Nom', 'Name'],
  ['Equipment column', 'Équipement', 'Equipment'],
  ['Status column', 'Statut', 'Status'],
  ['Report date column', 'Date du rapport', 'Report Date'],
  ['Start temperature column', 'Température départ', 'Start Temperature'],
  ['End temperature column', 'Température fin', 'End Temperature'],
  ['Finished product column', 'Produit fini', 'Finished Product'],
  ['Created date column', 'Créé le', 'Created At'],
  ['Measured date column', 'Mesuré le', 'Measured At'],
  ['Shelf-life column', 'DLC jours', 'Shelf Life (Days)'],

  ['Active status', 'Actif', 'Active'],
  ['Completed status', 'Terminé', 'Completed'],
  ['In-progress status', 'En cours', 'In Progress'],
  ['Pending status', 'En attente', 'Pending'],
  ['Cancelled status', 'Annulé', 'Cancelled'],
  ['Open status', 'Ouverte', 'Open'],
  ['Acknowledged status', 'Prise en compte', 'Acknowledged'],
  ['Resolved status', 'Résolue', 'Resolved'],
  ['Cooling value', 'Refroidissement', 'Cooling'],
  ['Freezing value', 'Congélation', 'Freezing'],
  ['Reheating value', 'Remise en température', 'Reheating'],
  ['Daily frequency', 'Quotidien', 'Daily'],
  ['Weekly frequency', 'Hebdomadaire', 'Weekly'],
  ['Monthly frequency', 'Mensuel', 'Monthly'],
  ['Yearly frequency', 'Annuel', 'Yearly'],

  ['Setup guide', 'Guide de configuration', 'Setup Guide'],
  ['Chart day selector', 'Jour', 'Day'],
  ['Chart week selector', 'Semaine', 'Week'],
  ['Chart month selector', 'Mois', 'Month'],
  ['Chart year selector', 'Année', 'Year'],
  ['No temperature reading', 'Sans relevé', 'No Reading'],
  ['Sensor online', 'En ligne', 'Online'],
  ['Sensor offline', 'Hors ligne', 'Offline'],
  ['Gateway ready', 'Prête', 'Ready'],
  ['Unassigned sensor', 'Non affecté', 'Unassigned'],
];

const failures: string[] = [];

for (const [label, source, expected] of checks) {
  const actual = translateText(source, 'en').trim();
  if (actual !== expected) {
    failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

for (const [source, expected] of Object.entries(haccpEnglishCatalog)) {
  const actual = translateText(source, 'en').trim();
  if (actual !== expected.trim()) {
    failures.push(`Catalog entry ${JSON.stringify(source)}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const componentPath = fileURLToPath(new URL('../../apps/web/src/components/HaccpApp.tsx', import.meta.url));
const componentSource = readFileSync(componentPath, 'utf8');
const extractedCatalogPath = fileURLToPath(new URL('../../apps/web/src/i18n/fr-source.generated.json', import.meta.url));
const extractedCatalog = JSON.parse(readFileSync(extractedCatalogPath, 'utf8')) as Array<{
  text: string;
  files: string[];
}>;
const frenchHaccpSignal = /[àâçéèêëîïôùûüÿœ]|\b(?:accueil|achat|ajouter|annuler|aucun|avec|capteur|choisir|commande|confirmer|connexion|contrôle|créer|dans|depuis|document|domaines|donnée|enceinte|enregistrer|équipement|établissement|fermer|fiche|fournisseur|français|général|historique|jour|langue|ligne|matériel|modifier|nettoyage|non|nouveau|oui|paramètres|planning|preuve|procédé|produit|réception|rechercher|rapport|retour|sans|sélectionner|service|site|stock|suivant|supprimer|tableau|température|terminer|utilisateur|valider|votre|vous|zone)\b/iu;

const untranslatedHaccpCandidates = extractedCatalog
  .filter((entry) => entry.files.includes('apps/web/src/components/HaccpApp.tsx'))
  .map((entry) => entry.text.trim())
  .filter((source) => frenchHaccpSignal.test(source) && translateText(source, 'en').trim() === source);
if (untranslatedHaccpCandidates.length) {
  failures.push(`Untranslated HACCP source candidates:\n${untranslatedHaccpCandidates.join('\n')}`);
}

const rawEnglishHeaderPatterns = [
  /\bname:\s*['"]Name['"]/u,
  /\bstatus:\s*['"]Status['"]/u,
  /\bcreatedAt:\s*['"]Created(?: At)?['"]/u,
];
for (const pattern of rawEnglishHeaderPatterns) {
  if (pattern.test(componentSource)) {
    failures.push(`Raw English table header remains in HaccpApp: ${String(pattern)}`);
  }
}

const legacyPluralMarkers = componentSource
  .split(/\r?\n/u)
  .filter((line) => /['"`][^'"`]*\(s\)/u.test(line));
if (legacyPluralMarkers.length) {
  failures.push(`Legacy “(s)” UI wording remains:\n${legacyPluralMarkers.join('\n')}`);
}

if (failures.length) {
  console.error(`HACCP translation checks failed: ${failures.length}`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`HACCP translation checks passed: ${checks.length} critical surfaces, ${Object.keys(haccpEnglishCatalog).length} reviewed catalog entries and all extracted HACCP candidates.`);
}
