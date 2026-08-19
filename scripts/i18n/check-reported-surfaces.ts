import { translateText } from '../../apps/web/src/i18n/translate';

const checks: ReadonlyArray<readonly [string, string, string]> = [
  ['Backup hero title', 'Sauvegarde & Restauration', 'Backup & Restore'],
  [
    'Backup hero description with JSX whitespace',
    'Gestion complète de vos données : sauvegardes manuelles nommées,\n automatisation programmée, réplication Cloud Google Drive et reprise après sinistre.',
    'Complete control of your data: named manual backups, scheduled automation, Google Drive cloud replication and disaster recovery.',
  ],
  ['API settings title', 'Clés API & IA', 'API Keys & AI'],
  [
    'API settings description',
    "Configurez vos services d'intelligence artificielle locale.",
    'Configure your local artificial intelligence services.',
  ],
  ['Market Prices module title', 'Cours des Produits', 'Market Prices'],
  [
    'Planning module description',
    'Planning devient le centre opérationnel de ToqueHub sans dupliquer la RH. Il consomme collaborateurs, services, postes, roulements, absences et compétences pour générer des affectations déterministes, contrôler les conflits RH, proposer des remplacements et préparer exports PDF/Excel/impression.',
    'Planning is ToqueHub’s operational scheduling hub. It uses employees, departments, positions, rotations, absences and skills to generate deterministic assignments, detect HR conflicts, suggest replacements and prepare PDF, Excel and print exports.',
  ],
  [
    'Stocks hero',
    'Vue d’ensemble du stock physique. Toute variation passe par un mouvement tracé ; le catalogue produit reste indépendant des quantités.',
    'Overview of physical inventory. Every change is recorded as a traceable stock movement, while the product catalog remains independent of quantities.',
  ],
  [
    'Inventory import safety notice',
    'ToqueHub lit les cellules localement. Mistral peut seulement proposer une correspondance pour un nom ambigu à partir des noms candidats du catalogue ; il ne reçoit ni quantités, ni prix, ni totaux et ne met jamais le stock à jour.',
    'ToqueHub reads spreadsheet cells locally. Mistral can only suggest a match for an ambiguous name from catalog candidates; it receives no quantities, prices or totals and never updates stock.',
  ],
  [
    'Technical-sheet mode help',
    'Si le résultat est directement présenté au client, choisissez « Plat ou produit fini ». S’il sert à fabriquer autre chose, choisissez « Préparation intermédiaire ».',
    'If the result is served directly to the customer, choose “Dish or finished product”. If it is used to make something else, choose “Intermediate preparation”.',
  ],
  [
    'HR catalog instructions',
    "Sélectionnez les services présents dans votre établissement. Vous pourrez en ajouter d'autres plus tard.",
    'Select the departments present at your location. You can add more later.',
  ],
  ['Menus tab requested wording', 'Carte', 'Card'],
  ['Product textarea placeholder', 'Notes produit, marque, informations utiles...', 'Product notes, brand, useful information...'],
  [
    'Storage textarea placeholder',
    'Température, conditions de stockage, précautions après ouverture...',
    'Temperature, storage conditions, precautions after opening...',
  ],
];

const failures: string[] = [];
for (const [label, source, expected] of checks) {
  const actual = translateText(source, 'en').trim();
  if (actual !== expected) failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

if (failures.length) {
  console.error(`Reported-surface translation checks failed: ${failures.length}`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Reported-surface translation checks passed: ${checks.length}`);
}
