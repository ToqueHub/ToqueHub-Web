import { OperationalTaskCategory } from '@prisma/client';
import { HR_CATALOG } from './hr.catalog';

export type HrPositionTaskPreset = {
  id: string;
  title: string;
  description?: string;
  category: OperationalTaskCategory;
  defaultDurationMinutes?: number;
  requiresTechnicalSheet?: boolean;
};

const normalize = (value?: string | null) =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const slug = (value: string) =>
  normalize(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);

const preset = (
  title: string,
  category: OperationalTaskCategory,
  duration?: number,
  requiresTechnicalSheet = false,
  description?: string,
): HrPositionTaskPreset => ({
  id: slug(title),
  title,
  category,
  ...(duration ? { defaultDurationMinutes: duration } : {}),
  ...(requiresTechnicalSheet ? { requiresTechnicalSheet: true } : {}),
  ...(description ? { description } : {}),
});

const GROUP_PRESETS: Record<string, HrPositionTaskPreset[]> = {
  direction: [
    preset('Briefing des responsables de service', 'MANAGEMENT', 30),
    preset('Contrôler les priorités de la journée', 'MANAGEMENT', 30),
    preset('Faire le point sur les incidents et décisions', 'MANAGEMENT', 30),
  ],
  administration: [
    preset('Traiter les documents administratifs', 'MANAGEMENT', 60),
    preset('Contrôler les factures et justificatifs', 'MANAGEMENT', 45),
    preset('Mettre à jour le suivi administratif', 'MANAGEMENT', 30),
  ],
  rh: [
    preset('Mettre à jour les dossiers collaborateurs', 'MANAGEMENT', 45),
    preset('Préparer le planning et les remplacements', 'MANAGEMENT', 45),
    preset('Réaliser un point avec un collaborateur', 'MANAGEMENT', 30),
  ],
  cuisine: [
    preset('Préparer la préparation de', 'KITCHEN', undefined, true, 'Choisir une fiche technique complète ou une de ses étapes.'),
    preset('Préparer la mise en place du service', 'KITCHEN', 45),
    preset('Contrôler et nettoyer le poste', 'KITCHEN', 30),
  ],
  'cuisine-centrale': [
    preset('Réaliser la production de', 'KITCHEN', undefined, true, 'Choisir une fiche technique complète ou une de ses étapes.'),
    preset('Préparer le conditionnement', 'KITCHEN', 45),
    preset('Contrôler les quantités et la traçabilité', 'KITCHEN', 30),
  ],
  patisserie: [
    preset('Préparer la préparation de', 'KITCHEN', undefined, true, 'Choisir une fiche technique complète ou une de ses étapes.'),
    preset('Préparer le poste pâtisserie', 'KITCHEN', 30),
    preset('Nettoyer et ranger le laboratoire', 'KITCHEN', 30),
  ],
  boulangerie: [
    preset('Fabriquer', 'KITCHEN', undefined, true, 'Choisir une fiche technique complète ou une de ses étapes.'),
    preset('Préparer le pétrissage et le façonnage', 'KITCHEN', 45),
    preset('Nettoyer et ranger le fournil', 'KITCHEN', 30),
  ],
  salle: [
    preset('Préparer la salle et la mise en place', 'SERVICE', 45),
    preset('Faire le briefing avant service', 'SERVICE', 20),
    preset('Ranger et contrôler la salle après service', 'SERVICE', 30),
  ],
  bar: [
    preset('Préparer la boisson de', 'SERVICE', undefined, true, 'Choisir une fiche technique de boisson ou une de ses étapes.'),
    preset('Préparer la mise en place du bar', 'SERVICE', 30),
    preset('Réapprovisionner et contrôler le bar', 'SERVICE', 30),
    preset('Nettoyer et fermer le bar', 'SERVICE', 30),
  ],
  'cafe-barista': [
    preset('Préparer la boisson de', 'SERVICE', undefined, true, 'Choisir une fiche technique de boisson ou une de ses étapes.'),
    preset('Préparer le poste café', 'SERVICE', 30),
    preset('Contrôler les boissons et consommables', 'SERVICE', 20),
    preset('Nettoyer les machines et le comptoir', 'SERVICE', 30),
  ],
  reception: [
    preset('Préparer les arrivées et départs', 'RECEPTION', 45),
    preset('Contrôler les réservations et demandes clients', 'RECEPTION', 30),
    preset('Réaliser la passation de réception', 'RECEPTION', 20),
  ],
  hebergement: [
    preset('Préparer et contrôler les chambres', 'HOUSEKEEPING', 30),
    preset('Réapprovisionner le linge et les produits d’accueil', 'HOUSEKEEPING', 30),
    preset('Signaler les anomalies de chambre', 'HOUSEKEEPING', 15),
  ],
  entretien: [
    preset('Nettoyage des toilettes', 'HOUSEKEEPING', 30),
    preset('Nettoyage des espaces communs', 'HOUSEKEEPING', 45),
    preset('Contrôler et réapprovisionner les consommables', 'HOUSEKEEPING', 20),
  ],
  maintenance: [
    preset('Réaliser le contrôle technique quotidien', 'MAINTENANCE', 45),
    preset('Traiter une intervention de maintenance', 'MAINTENANCE', 60),
    preset('Contrôler les équipements de sécurité', 'MAINTENANCE', 30),
  ],
  achats: [
    preset('Préparer les commandes fournisseurs', 'LOGISTICS', 45),
    preset('Contrôler les besoins d’approvisionnement', 'LOGISTICS', 30),
    preset('Suivre les livraisons attendues', 'LOGISTICS', 30),
  ],
  stock: [
    preset('Réceptionner et contrôler une livraison', 'LOGISTICS', 45),
    preset('Ranger et organiser le magasin', 'LOGISTICS', 45),
    preset('Réaliser un contrôle de stock', 'LOGISTICS', 60),
  ],
  evenementiel: [
    preset('Préparer l’événement', 'SERVICE', 60),
    preset('Faire le briefing des équipes événementielles', 'MANAGEMENT', 20),
    preset('Contrôler et remettre en état les espaces', 'SERVICE', 45),
  ],
  animation: [
    preset('Préparer l’activité client', 'OTHER', 45),
    preset('Contrôler le matériel d’animation', 'OTHER', 20),
    preset('Ranger l’espace après l’activité', 'OTHER', 30),
  ],
  securite: [
    preset('Réaliser une ronde de sécurité', 'OTHER', 45),
    preset('Contrôler les accès et équipements', 'OTHER', 30),
    preset('Réaliser la passation sécurité', 'OTHER', 20),
  ],
  spa: [
    preset('Préparer la cabine et le matériel', 'OTHER', 30),
    preset('Préparer les rendez-vous clients', 'OTHER', 20),
    preset('Nettoyer et remettre en état la cabine', 'HOUSEKEEPING', 20),
  ],
  logistique: [
    preset('Préparer une livraison ou un transfert', 'LOGISTICS', 45),
    preset('Contrôler le chargement et les documents', 'LOGISTICS', 30),
    preset('Ranger la zone logistique', 'LOGISTICS', 30),
  ],
  autre: [preset('Réaliser une tâche du poste', 'OTHER', 30)],
};

function catalogGroupId(positionName: string, departmentName?: string | null) {
  const position = normalize(positionName);
  const department = normalize(departmentName);

  // Certains intitulés existent dans plusieurs catalogues. Le métier précis prime
  // sur un nom de service composé comme « Achats & Logistique ».
  if (/magasin|econome|gestionnaire de stock|responsable des stocks|receptionnaire|inventoriste|preparateur de commandes/.test(position)) return 'stock';
  if (/acheteur|approvisionneur|assistant achats|responsable achats/.test(position)) return 'achats';
  if (/barista|torrefacteur|responsable cafe|serveur cafe/.test(position)) return 'cafe-barista';
  if (/barman|barmaid|mixologue|bar$|bar /.test(position)) return 'bar';
  if (/patiss|chocolatier|glacier|tourier/.test(position)) return 'patisserie';
  if (/boulanger|viennoisier|fournil/.test(position)) return 'boulangerie';
  if (/conditionneur|agent de production|cuisinier de production|chef de production|cuisine centrale/.test(position)) return 'cuisine-centrale';
  if (/cuisin|chef executif|sous-chef|chef de partie|commis de cuisine|aide de cuisine/.test(position)) return 'cuisine';
  if (/salle|serveur|serveuse|maitre d.hotel|chef de rang|sommelier|runner|restauration/.test(position)) return 'salle';

  const exactDepartment = HR_CATALOG.find((group) => normalize(group.name) === department);
  if (exactDepartment) return exactDepartment.id;

  if (/cuisine centrale/.test(department)) return 'cuisine-centrale';
  if (/cuisine/.test(department)) return 'cuisine';
  if (/patiss/.test(department)) return 'patisserie';
  if (/boulanger/.test(department)) return 'boulangerie';
  if (/cafe|barista/.test(department)) return 'cafe-barista';
  if (/restaurant|salle/.test(department)) return 'salle';
  if (/bar/.test(department)) return 'bar';
  if (/stock|magasin/.test(department)) return 'stock';
  if (/achat/.test(department)) return 'achats';
  if (/logistique/.test(department)) return 'logistique';

  const catalog = HR_CATALOG.find((group) => group.positions.some((item) => normalize(item) === position));
  return catalog?.id ?? 'autre';
}

function canUseTechnicalSheets(groupId: string, positionName: string) {
  const position = normalize(positionName);
  if (/plongeur|econome|magasin|conditionneur|serveur de bar/.test(position)) return false;
  if (['cuisine', 'cuisine-centrale', 'patisserie', 'boulangerie'].includes(groupId)) return true;
  if (groupId === 'bar') return /barman|barmaid|mixologue|responsable de bar|chef barman|commis de bar/.test(position);
  if (groupId === 'cafe-barista') return /barista|responsable cafe|torrefacteur/.test(position);
  return false;
}

export function positionSupportsTechnicalSheets(positionName: string, departmentName?: string | null) {
  return canUseTechnicalSheets(catalogGroupId(positionName, departmentName), positionName);
}

export function defaultTaskPresets(positionName: string, departmentName?: string | null) {
  const groupId = catalogGroupId(positionName, departmentName);
  let tasks = GROUP_PRESETS[groupId] ?? GROUP_PRESETS.autre;
  const normalizedPosition = normalize(positionName);

  if (!positionSupportsTechnicalSheets(positionName, departmentName)) {
    tasks = tasks.filter((task) => !task.requiresTechnicalSheet);
  }

  if (/plongeur/.test(normalizedPosition)) {
    tasks = [
      preset('Assurer la plonge et le rangement', 'KITCHEN', 60),
      preset('Nettoyer la zone de plonge', 'HOUSEKEEPING', 30),
      preset('Évacuer et trier les déchets', 'HOUSEKEEPING', 20),
    ];
  }
  if (/responsable|directeur|chef|gouvernant|manager/.test(normalizedPosition)) {
    tasks = [preset('Briefing et répartition des tâches', 'MANAGEMENT', 30), ...tasks];
  }

  return tasks.map((task) => ({ ...task }));
}
