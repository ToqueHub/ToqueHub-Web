export type DocumentationStatus = 'Disponible' | 'À configurer' | 'En préparation';

export type GuideChapter = {
  id: string;
  title: string;
  eyebrow: string;
  status: DocumentationStatus;
  audience: string;
  goal: string;
  prerequisites?: string[];
  steps: string[];
  result: string;
  tips: string[];
  related?: string[];
};

export const chapters: GuideChapter[] = [
  {
    id: 'demarrer', title: 'Démarrer avec ToqueHub', eyebrow: 'Prise en main', status: 'Disponible', audience: 'Toute l’équipe',
    goal: 'Accéder à votre espace, comprendre le tableau de bord et préparer un premier environnement de travail.',
    steps: [
      'Ouvrez l’adresse de votre instance ToqueHub communiquée par votre administrateur.',
      'Connectez-vous avec votre adresse et votre mot de passe, puis vérifiez le nom de l’établissement affiché.',
      'Si vous créez un nouvel environnement, suivez la visite guidée et confirmez le socle Stocks, Fiches Techniques et HACCP.',
      'Parcourez le tableau de bord : il rassemble les alertes, les raccourcis et les activités récentes.',
      'Utilisez le menu latéral pour ouvrir un module. Vos droits déterminent les écrans et actions disponibles.',
      'Commencez par les référentiels et les stocks avant de créer des recettes, menus ou productions.'
    ],
    result: 'Vous disposez d’un espace de travail identifié et savez où retrouver les fonctions utiles au quotidien.',
    tips: ['Ne partagez jamais un compte : chaque action doit rester attribuable à une personne.', 'Si un menu est absent, demandez un rôle adapté plutôt que d’utiliser le compte d’un collègue.'],
    related: ['utilisateurs', 'referentiels', 'parcours']
  },
  {
    id: 'referentiels', title: 'Référentiels cuisine', eyebrow: 'Socle commun', status: 'Disponible', audience: 'Gestionnaire, chef, magasinier',
    goal: 'Construire le vocabulaire commun de l’établissement : produits, unités, catégories, fournisseurs et emplacements.',
    steps: [
      'Créez les unités réellement utilisées : kilogramme, litre, pièce, bac, carton ou portion.',
      'Organisez les catégories pour faciliter les recherches, inventaires et analyses.',
      'Ajoutez chaque produit avec son unité de gestion, son fournisseur habituel et ses informations de suivi.',
      'Déclarez les sites et emplacements physiques : réserve sèche, chambre froide, congélateur ou cuisine.',
      'Relisez les doublons avant de poursuivre : tous les autres modules réutilisent ces données.'
    ],
    result: 'Les produits sont identifiés une seule fois et peuvent être utilisés de façon cohérente dans tous les modules.',
    tips: ['Choisissez une unité de stock stable par produit.', 'Nommez les emplacements comme ils sont nommés par la brigade.'],
    related: ['stocks', 'fiches-techniques', 'achats']
  },
  {
    id: 'stocks', title: 'Stocks, inventaires et mouvements', eyebrow: 'Pilotage matière', status: 'Disponible', audience: 'Magasinier, chef, gestionnaire',
    goal: 'Suivre ce qui entre, sort et reste disponible sans perdre l’historique des mouvements.',
    prerequisites: ['Référentiels produits, unités et emplacements renseignés.'],
    steps: [
      'Consultez le stock courant par produit et emplacement pour visualiser les niveaux disponibles.',
      'Enregistrez toute entrée par une réception et toute sortie par le mouvement adapté : production, perte, correction ou inventaire.',
      'Ajoutez les informations de lot quand la traçabilité de la marchandise le nécessite.',
      'Lancez un inventaire physique, comparez le comptage au niveau théorique puis validez la régularisation expliquée.',
      'Contrôlez l’historique et les alertes de seuil avant de préparer un réassort.'
    ],
    result: 'Le niveau de stock est calculé à partir de mouvements horodatés et auditables, jamais modifié silencieusement.',
    tips: ['Une correction doit toujours être justifiée.', 'Faites les inventaires aux mêmes périodes pour comparer les écarts.'],
    related: ['ocr-stocks', 'marges', 'production']
  },
  {
    id: 'ocr-stocks', title: 'Import et OCR de documents', eyebrow: 'Stocks', status: 'Disponible', audience: 'Réceptionnaire, gestionnaire',
    goal: 'Transformer un bon de livraison ou une facture en réception contrôlée.',
    prerequisites: ['Fournisseurs et produits référencés.'],
    steps: [
      'Importez une image ou un document d’achat depuis le module Stocks.',
      'Laissez ToqueHub extraire les lignes, puis vérifiez systématiquement les quantités, unités, prix et fournisseur.',
      'Rapprochez chaque ligne avec un produit existant ; créez un produit uniquement si le référentiel le justifie.',
      'Corrigez les ambiguïtés signalées, notamment les conditionnements et les taxes.',
      'Validez la réception seulement après le contrôle physique de la livraison.'
    ],
    result: 'La réception crée les mouvements de stock après une validation humaine, avec le document source conservé.',
    tips: ['L’OCR propose : il ne remplace pas le contrôle de réception.', 'Traitez les écarts fournisseur avant de valider le document.'],
    related: ['stocks', 'achats']
  },
  {
    id: 'marges', title: 'Marges et cours produits', eyebrow: 'Pilotage économique', status: 'Disponible', audience: 'Direction, gestionnaire, chef',
    goal: 'Suivre le coût matière, les évolutions de prix et les points de vigilance économiques.',
    steps: [
      'Vérifiez que les prix d’achat sont à jour dans les produits et réceptions.',
      'Consultez les indicateurs de marge par produit, fournisseur ou famille.',
      'Utilisez les cours des produits pour observer les tendances de marché et enregistrer vos favoris.',
      'Comparez une hausse inhabituelle avec vos derniers achats avant d’ajuster une fiche technique.',
      'Exportez les analyses lorsque la direction doit arbitrer un prix ou un approvisionnement.'
    ],
    result: 'Les décisions de coût et de carte reposent sur des données matière plutôt que sur une estimation.',
    tips: ['Les cours de marché éclairent une tendance ; ils ne remplacent pas vos prix facturés.', 'Analysez les variations sur plusieurs périodes.'],
    related: ['fiches-techniques', 'stocks']
  },
  {
    id: 'fiches-techniques', title: 'Fiches techniques', eyebrow: 'Référentiel culinaire', status: 'Disponible', audience: 'Chef, sous-chef, gestionnaire',
    goal: 'Standardiser une recette, ses ingrédients, allergènes, quantités, coûts et étapes.',
    prerequisites: ['Stocks configurés : les ingrédients utilisent les produits existants.'],
    steps: [
      'Créez une fiche et renseignez son nom, sa catégorie et son nombre de portions de référence.',
      'Ajoutez les ingrédients depuis le catalogue Stocks ; ne recréez pas de produit parallèle.',
      'Saisissez les étapes de réalisation dans l’ordre de production de la brigade.',
      'Vérifiez les allergènes et le coût matière calculé à partir des prix disponibles.',
      'Testez une autre quantité de portions, puis archivez ou dupliquez la fiche lorsqu’elle évolue.'
    ],
    result: 'Une préparation réutilisable alimente les productions et menus, avec un coût et des allergènes cohérents.',
    tips: ['Conservez une portion de référence réaliste.', 'Dupliquez une recette avant une variation saisonnière importante.'],
    related: ['production', 'menus', 'marges']
  },
  {
    id: 'production', title: 'Production', eyebrow: 'Exécution cuisine', status: 'Disponible', audience: 'Chef, responsable de production',
    goal: 'Planifier, réaliser et tracer les fabrications à partir des fiches techniques.',
    prerequisites: ['Stocks et fiches techniques disponibles ; RH et planning sont optionnels.'],
    steps: [
      'Créez un ordre de production depuis une fiche technique et indiquez le volume attendu.',
      'Contrôlez les besoins matières recalculés et les alertes de disponibilité.',
      'Affectez si besoin un service ou des collaborateurs, puis faites évoluer le statut de l’ordre.',
      'Renseignez la réalisation effective et les écarts observés.',
      'Examinez le déstockage proposé puis confirmez-le pour enregistrer les sorties matières.'
    ],
    result: 'La production relie la recette, le besoin matière, l’exécution et le stock réellement consommé.',
    tips: ['Une alerte de rupture doit être traitée avant le lancement.', 'Le déstockage reste proposé jusqu’à votre validation.'],
    related: ['menus', 'stocks', 'planning']
  },
  {
    id: 'menus', title: 'Menus et cycles', eyebrow: 'Planification culinaire', status: 'Disponible', audience: 'Chef, diététicien, gestionnaire',
    goal: 'Préparer des menus, variantes et prévisions de convives puis générer les productions nécessaires.',
    prerequisites: ['L’installation de Menus installe Stocks, Fiches Techniques et Production si nécessaire ; configurez-les progressivement avant vos premières productions.'],
    steps: [
      'Créez un menu et positionnez les préparations existantes aux dates et services concernés.',
      'Définissez les groupes de convives, régimes et variantes nécessaires.',
      'Renseignez ou mettez à jour les prévisions de convives.',
      'Utilisez un cycle pour répliquer une organisation récurrente sans recréer chaque journée.',
      'Vérifiez les quantités puis générez les productions depuis le menu.'
    ],
    result: 'Le menu transforme une intention de service en productions reliées à des fiches techniques existantes.',
    tips: ['Validez les prévisions avant de générer.', 'Une variante doit répondre à un besoin identifié, pas remplacer la recette de base.'],
    related: ['fiches-techniques', 'production']
  },
  {
    id: 'haccp', title: 'HACCP et traçabilité', eyebrow: 'Sécurité alimentaire', status: 'Disponible', audience: 'Brigade, responsable HACCP',
    goal: 'Digitaliser les contrôles quotidiens et conserver une preuve exploitable de chaque action.',
    steps: [
      'Commencez la journée par le tableau de bord HACCP et traitez les alertes prioritaires.',
      'Enregistrez les températures des équipements et indiquez toute action corrective nécessaire.',
      'Contrôlez les réceptions, consignez les lots et complétez la traçabilité des produits.',
      'Réalisez les processus dédiés : nettoyage, huiles, refroidissement, congélation et réchauffement.',
      'Ajoutez les photos requises, consultez l’historique puis générez le rapport journalier.'
    ],
    result: 'Les contrôles sont datés, attribués et réunis dans un historique prêt à être consulté.',
    tips: ['Saisissez le contrôle au moment où il est réalisé.', 'Documentez une non-conformité et son action corrective dans la même séquence.'],
    related: ['mobile', 'stocks', 'sauvegardes']
  },
  {
    id: 'rh', title: 'Ressources humaines', eyebrow: 'Organisation', status: 'Disponible', audience: 'Direction, RH, manager',
    goal: 'Centraliser les collaborateurs, services, postes, documents et éléments de conformité.',
    steps: [
      'Créez les services et postes qui reflètent l’organisation réelle de l’établissement.',
      'Ajoutez les collaborateurs, y compris ceux qui n’ont pas besoin d’un compte utilisateur.',
      'Renseignez leurs informations, documents, rattachements et compétences utiles.',
      'Utilisez l’organigramme et l’historique pour garder une structure lisible.',
      'Consultez les compteurs et recommandations de conformité avant la planification.'
    ],
    result: 'Le module RH devient la source unique pour les personnes et leur organisation.',
    tips: ['Un collaborateur et un compte utilisateur ne sont pas la même chose.', 'Limitez l’accès aux informations sensibles aux rôles autorisés.'],
    related: ['planning', 'utilisateurs']
  },
  {
    id: 'planning', title: 'Planning et remplacements', eyebrow: 'Organisation opérationnelle', status: 'Disponible', audience: 'Manager, RH, responsable de service',
    goal: 'Construire des plannings cohérents, gérer les absences et publier une version fiable à l’équipe.',
    prerequisites: ['L’installation de Planning installe aussi RH si nécessaire. Structurez ensuite RH avec au moins un service, un poste et un collaborateur actif avant de publier un premier planning.'],
    steps: [
      'Définissez les codes, besoins opérationnels, compétences et modèles de planning.',
      'Ajoutez les absences puis créez les affectations par jour, semaine ou mois.',
      'Contrôlez les conflits et utilisez les suggestions de remplacement si nécessaire.',
      'Appliquez les rotations seulement après prévisualisation.',
      'Publiez et verrouillez la période validée, puis exportez-la ou imprimez-la.'
    ],
    result: 'L’équipe consulte une version publiée du planning, tandis que les ajustements restent traçables.',
    tips: ['Ne verrouillez qu’après contrôle des absences.', 'Conservez les modèles pour les semaines récurrentes.'],
    related: ['rh', 'production']
  },
  {
    id: 'utilisateurs', title: 'Utilisateurs, rôles et documents', eyebrow: 'Administration', status: 'Disponible', audience: 'Administrateur',
    goal: 'Donner à chaque personne l’accès utile, sans ouvrir plus de droits que nécessaire.',
    steps: [
      'Créez ou invitez l’utilisateur et associez-le au collaborateur concerné lorsque cela est pertinent.',
      'Choisissez un rôle adapté à ses missions et vérifiez les permissions associées.',
      'Contrôlez le statut du compte avant sa première connexion.',
      'Utilisez la liste documentaire pour retrouver, télécharger ou mettre à jour les métadonnées des documents autorisés.',
      'Révoquez ou ajustez les accès dès qu’une mission évolue ou qu’un départ est confirmé.'
    ],
    result: 'Les accès sont individualisés et administrés suivant le principe du moindre privilège.',
    tips: ['Révisez les accès périodiquement.', 'N’utilisez jamais un rôle administrateur pour un usage quotidien.'],
    related: ['rh', 'sauvegardes']
  },
  {
    id: 'architecture', title: 'Centre d’architecture', eyebrow: 'Administration', status: 'Disponible', audience: 'Administrateur, direction',
    goal: 'Visualiser les modules de l’instance et comprendre les dépendances avant d’activer ou de faire évoluer un périmètre.',
    steps: [
      'Ouvrez le Centre d’architecture depuis les outils d’administration.',
      'Consultez la carte des modules pour identifier ceux qui alimentent les données dont vous avez besoin.',
      'Utilisez les relations affichées pour vérifier les prérequis d’un module avant son adoption.',
      'Examinez les impacts signalés lorsqu’un référentiel, un accès ou une organisation doit évoluer.',
      'Partagez cette lecture avec le référent métier avant de modifier les habitudes de travail.'
    ],
    result: 'Les décisions de déploiement s’appuient sur les liens réels entre référentiels, modules métier et administration.',
    tips: ['Le Centre d’architecture explique les dépendances ; il ne remplace pas une sauvegarde avant une intervention.', 'Utilisez-le pour préparer les formations par module.'],
    related: ['parcours', 'sauvegardes', 'referentiels']
  },
  {
    id: 'achats', title: 'Achats', eyebrow: 'Approvisionnement', status: 'À configurer', audience: 'Gestionnaire, acheteur',
    goal: 'Préparer, envoyer et réceptionner les commandes fournisseurs à partir des référentiels Stocks.',
    steps: [
      'Terminez le guide de configuration : fournisseurs, paramètres et messagerie d’envoi si elle est utilisée.',
      'Utilisez les référentiels, niveaux de stock et besoins de production pour préparer une commande fournisseur.',
      'Contrôlez l’aperçu et le destinataire avant l’envoi, puis suivez la confirmation et le statut de la commande.',
      'Créez une réception depuis la commande, contrôlez les quantités et écarts, puis validez l’intégration en stock.',
      'Clôturez la commande seulement lorsque les réceptions attendues et les écarts sont traités.'
    ],
    result: 'Les achats suivent un cycle traçable, du brouillon à la réception validée, sans dupliquer produits ni fournisseurs.',
    tips: ['Une réception partielle laisse la commande ouverte tant que tout n’est pas traité.', 'Testez la messagerie fournisseur avant le premier envoi réel.'],
    related: ['referentiels', 'stocks', 'ocr-stocks']
  },
  {
    id: 'mobile', title: 'Application mobile terrain', eyebrow: 'Mobilité', status: 'Disponible', audience: 'Brigade, responsable HACCP',
    goal: 'Utiliser ToqueHub au poste de travail et maintenir les relevés HACCP même lors d’une coupure réseau.',
    steps: [
      'Installez l’application fournie par votre établissement sur un appareil autorisé.',
      'Recherchez le serveur local sur le réseau ou saisissez son adresse si la découverte n’est pas disponible.',
      'Connectez-vous et vérifiez que le tableau de bord HACCP est bien synchronisé.',
      'Réalisez les contrôles terrain ; les opérations peuvent être conservées localement hors connexion.',
      'Rétablissez le réseau et vérifiez que la file d’attente est synchronisée avant la fin de service.'
    ],
    result: 'Les équipes terrain peuvent consigner les opérations sans attendre un poste fixe ni perdre une saisie hors ligne.',
    tips: ['Ne désinstallez pas l’application avant confirmation de la synchronisation.', 'Utilisez les étiquettes uniquement avec une imprimante configurée par l’administrateur.'],
    related: ['haccp', 'iot']
  },
  {
    id: 'sauvegardes', title: 'Sauvegardes, mise à jour et dépannage', eyebrow: 'Exploitation locale', status: 'Disponible', audience: 'Administrateur',
    goal: 'Assurer la continuité de l’instance locale et restaurer les données avec méthode.',
    steps: [
      'Définissez une fréquence de sauvegarde adaptée à l’activité de l’établissement.',
      'Vérifiez régulièrement qu’une sauvegarde est créée, téléchargeable et identifiable par date.',
      'Utilisez le stockage distant chiffré seulement après sa configuration par l’administrateur.',
      'Avant une mise à jour, réalisez une sauvegarde et consultez les informations de version.',
      'En cas d’incident, diagnostiquez l’accès réseau et l’état du serveur ; restaurez uniquement une sauvegarde validée.'
    ],
    result: 'Les données restent récupérables et les opérations de maintenance suivent un processus maîtrisé.',
    tips: ['Testez une restauration sur un environnement prévu à cet effet.', 'Une sauvegarde non vérifiée n’est pas une garantie de reprise.'],
    related: ['iot', 'utilisateurs']
  },
  {
    id: 'iot', title: 'Capteurs et serveur local', eyebrow: 'Exploitation locale', status: 'À configurer', audience: 'Administrateur, responsable HACCP',
    goal: 'Relier des capteurs compatibles à l’instance locale pour renforcer le suivi HACCP.',
    steps: [
      'Installez le serveur ToqueHub sur l’équipement choisi et vérifiez son accès depuis le réseau local.',
      'Configurez les services IoT et les capteurs uniquement avec les accès administrateur prévus.',
      'Associez les équipements suivis à leur emplacement réel : chambre froide, cellule ou zone de contrôle.',
      'Vérifiez la remontée des relevés et le comportement des alertes avant une mise en service.',
      'Prévoyez une procédure manuelle de relevé si un capteur ou le réseau devient indisponible.'
    ],
    result: 'Les équipements connectés complètent les contrôles de la brigade sans supprimer le contrôle opérationnel.',
    tips: ['Documentez chaque capteur et son emplacement.', 'Testez les alertes avant de vous y fier.'],
    related: ['haccp', 'mobile', 'sauvegardes']
  },
  {
    id: 'parcours', title: 'Parcours de déploiement recommandé', eyebrow: 'Méthode', status: 'Disponible', audience: 'Direction, administrateur, chef',
    goal: 'Adopter ToqueHub progressivement sans fragiliser le fonctionnement quotidien de la cuisine.',
    steps: [
      'Premier accès : utilisez la visite guidée pour installer le socle Stocks, Fiches Techniques et HACCP.',
      'Semaine 1 : configurez Stocks, puis préparez les utilisateurs, rôles et référentiels produits.',
      'Semaine 2 : enregistrez les mouvements réels et réalisez un premier inventaire.',
      'Semaine 3 : standardisez les fiches techniques les plus produites.',
      'Semaine 4 : pilotez les premières productions puis les menus.',
      'Ensuite : activez les routines HACCP, RH/planning, mobile et capteurs selon votre organisation.'
    ],
    result: 'Chaque module reçoit des données fiables avant de devenir un outil quotidien de la brigade.',
    tips: ['Commencez avec un périmètre pilote.', 'Gardez un référent métier par module pendant le déploiement.'],
    related: ['demarrer', 'referentiels', 'stocks']
  }
];

export const statusOrder: DocumentationStatus[] = ['Disponible', 'À configurer', 'En préparation'];

export type GuideScreen = { title: string; purpose: string; actions: string; flow?: string[] };

/**
 * Inventaire éditorial des écrans réellement exposés par l’interface web.
 * Chaque entrée est vérifiée contre la navigation du module correspondant.
 */
export const screensByChapter: Record<string, GuideScreen[]> = {
  demarrer: [
    { title: 'Connexion', purpose: 'Ouvrir une session personnelle sur l’instance de l’établissement.', actions: 'Saisir vos identifiants ; demander une réinitialisation ou un rôle si l’accès manque.' },
    { title: 'Tableau de bord général', purpose: 'Consulter les raccourcis, applications installées, alertes et activité récente.', actions: 'Ouvrir un module depuis le menu ; épingler les accès utilisés fréquemment.' },
    { title: 'Premier démarrage', purpose: 'Présenter l’écosystème et installer le socle Stocks, Fiches Techniques et HACCP.', actions: 'Le créateur administrateur confirme le lot, découvre les repères de l’interface puis configure Stocks en premier. Installer un module ne signifie pas devoir le mettre immédiatement en production.' },
  ],
  referentiels: [
    { title: 'Produits', purpose: 'Décrire les articles utilisés par la cuisine et leur mode de suivi.', actions: 'Créer, rechercher, modifier ou archiver un produit ; préciser unité, catégorie, fournisseur et suivi nécessaire.' },
    { title: 'Catégories', purpose: 'Classer les produits pour les listes et analyses.', actions: 'Créer des familles lisibles, puis archiver celles qui ne sont plus utilisées.' },
    { title: 'Unités', purpose: 'Normaliser la façon de compter chaque article.', actions: 'Choisir une unité de gestion durable et éviter de mélanger pièce, carton et kilogramme.' },
    { title: 'Fournisseurs', purpose: 'Centraliser les partenaires d’approvisionnement.', actions: 'Créer la fiche, renseigner les informations utiles et l’associer aux produits concernés.' },
    { title: 'Sites et emplacements', purpose: 'Situer les denrées dans l’établissement.', actions: 'Déclarer les zones de stockage et les utiliser de manière constante lors des mouvements.' },
  ],
  stocks: [
    { title: 'Tableau de bord Stocks', purpose: 'Voir la valeur, les alertes, les niveaux faibles et les dernières activités.', actions: 'Traiter une rupture ou ouvrir directement le produit, l’inventaire ou la réception concernée.' },
    { title: 'Produits', purpose: 'Consulter le catalogue et le stock disponible par article.', actions: 'Rechercher, filtrer, créer un mouvement ou lancer un inventaire depuis la fiche appropriée.' },
    { title: 'Fournisseur', purpose: 'Gérer les partenaires associés aux articles.', actions: 'Mettre à jour les coordonnées et les relations produit-fournisseur sans recréer les articles.' },
    { title: 'Inventaire', purpose: 'Comparer le niveau théorique au comptage physique.', actions: 'Préparer un comptage, saisir les quantités observées, expliquer l’écart puis valider.' },
    { title: 'Réglage', purpose: 'Accéder aux catégories, unités, types de mouvement et audit.', actions: 'N’ajuster les paramètres que si la structure métier évolue ; consulter l’audit avant toute correction.' },
  ],
  'ocr-stocks': [
    { title: 'Importer un document', purpose: 'Ajouter un bon de livraison ou une facture au format accepté.', actions: 'Choisir le document lisible et vérifier qu’il correspond à la livraison physique.' },
    { title: 'Analyse OCR', purpose: 'Lire les lignes proposées par l’analyse automatique.', actions: 'Contrôler fournisseur, produit, quantité, unité et prix ; aucun champ ne doit être validé sans vérification.' },
    { title: 'Rapprochement et réception', purpose: 'Associer les lignes aux produits du catalogue avant de créer la réception.', actions: 'Corriger les ambiguïtés, gérer les écarts puis valider la réception qui crée les mouvements de stock.' },
  ],
  marges: [
    { title: 'Indicateurs de marge', purpose: 'Lire les coûts matières et points d’attention par produit ou fournisseur.', actions: 'Filtrer une période ou une famille, puis comparer une hausse avec les réceptions réelles.' },
    { title: 'Cours des produits — Tableau de bord', purpose: 'Obtenir un aperçu des cotations et des tendances RNM.', actions: 'Ouvrir un produit suivi ou un secteur pour approfondir l’évolution.' },
    { title: 'Cours des produits — Catalogue et secteurs', purpose: 'Rechercher les cotations par produit, famille ou secteur.', actions: 'Sélectionner une période, consulter le détail et ajouter les articles utiles aux favoris.' },
    { title: 'Cours des produits — Favoris, historique et comparaison', purpose: 'Suivre une liste personnelle et comparer des évolutions.', actions: 'Garder les références pertinentes, choisir la période et interpréter la tendance avant une décision d’achat.' },
    { title: 'À propos', purpose: 'Rappeler le périmètre de la source de cotation.', actions: 'Distinguer toujours une tendance de marché d’un prix réellement facturé.' },
  ],
  'fiches-techniques': [
    { title: 'Tableau de bord', purpose: 'Voir le nombre de fiches, catégories, coûts et points de démarrage.', actions: 'Utiliser les raccourcis vers les recettes, catégories, coûts ou simulation.' },
    { title: 'Recettes', purpose: 'Créer, rechercher, modifier, dupliquer, consulter l’historique et archiver les fiches techniques.', actions: 'Composer uniquement avec les produits Stocks, les étapes et les informations d’allergènes adaptées.' },
    { title: 'Catégories recettes', purpose: 'Organiser les fiches culinaires par famille.', actions: 'Créer ou archiver une catégorie sans supprimer l’historique des recettes.' },
    { title: 'Coûts et marges', purpose: 'Comparer coût HT, objectif de vente et résultat par portion.', actions: 'Mettre à jour d’abord le prix matière dans Stocks puis analyser les conséquences sur la fiche.' },
    { title: 'Production théorique', purpose: 'Simuler les quantités pour un nombre de portions donné.', actions: 'Choisir une fiche, saisir les portions et exporter le résultat sans déclencher de sortie de stock.' },
  ],
  production: [
    { title: 'Tableau de bord', purpose: 'Prioriser les ordres, alertes et productions à venir.', actions: 'Ouvrir l’ordre concerné ou créer une nouvelle production.' },
    { title: 'Ordres de production', purpose: 'Créer et faire évoluer chaque fabrication.', actions: 'Définir la date, portions, priorité, responsable et statut ; documenter les écarts de réalisation.' },
    { title: 'Calendrier', purpose: 'Lire les productions sur la période choisie.', actions: 'Ouvrir un ordre depuis la date et vérifier les chevauchements.' },
    { title: 'Productions du jour', purpose: 'Concentrer la brigade sur les réalisations du service.', actions: 'Suivre le statut, confirmer le résultat et traiter les retards ou alertes.' },
    { title: 'Affectations RH', purpose: 'Relier une fabrication à un service ou à des collaborateurs.', actions: 'Affecter seulement des personnes disponibles ; RH reste propriétaire de leurs informations.' },
    { title: 'Besoins matières', purpose: 'Comparer les ingrédients requis avec le stock disponible.', actions: 'Résoudre les manques avant le lancement et confirmer ensuite le déstockage proposé.' },
    { title: 'Exports & Documents', purpose: 'Préparer les fiches cuisine, besoins matières et rapports.', actions: 'Choisir le périmètre puis le format PDF, Excel ou impression.' },
    { title: 'Historique d’audit', purpose: 'Retrouver les actions et changements liés aux ordres.', actions: 'Consulter l’événement avant de corriger une anomalie ou de répondre à une question.' },
  ],
  menus: [
    { title: 'Tableau de bord', purpose: 'Piloter les menus à préparer et les raccourcis de planification.', actions: 'Ouvrir la liste, le calendrier, un cycle ou les régimes selon l’action à réaliser.' },
    { title: 'Menus planifiés', purpose: 'Créer les menus et leurs préparations par service.', actions: 'Ajouter les fiches techniques existantes, définir le statut brouillon, validé, publié ou archivé.' },
    { title: 'Calendrier', purpose: 'Visualiser les menus par jour, semaine, mois ou année.', actions: 'Ouvrir le menu d’une date pour l’ajuster ou contrôler sa publication.' },
    { title: 'Cycles', purpose: 'Répliquer une organisation alimentaire récurrente.', actions: 'Créer un cycle, le prévisualiser, le dupliquer puis contrôler ses dates avant application.' },
    { title: 'Régimes', purpose: 'Définir les adaptations alimentaires.', actions: 'Créer une règle claire et l’utiliser dans les variantes plutôt que de dupliquer tout le menu.' },
    { title: 'Convives par groupes', purpose: 'Prévoir les volumes par population.', actions: 'Mettre à jour les effectifs avant toute génération de production.' },
    { title: 'Exports & Documents', purpose: 'Préparer les supports de diffusion et de cuisine.', actions: 'Choisir le menu, la période et le format demandé.' },
    { title: 'Historique d’audit', purpose: 'Consulter les changements de planification.', actions: 'Vérifier qui a publié, modifié ou généré une production.' },
  ],
  haccp: [
    { title: 'Tableau de bord HACCP', purpose: 'Prioriser les contrôles, écarts et actions sanitaires de la journée.', actions: 'Traiter les alertes avant d’ouvrir les écrans de saisie.' },
    { title: 'Configuration zones & matériels', purpose: 'Préparer les équipements, processus et zones de nettoyage.', actions: 'Renseigner le référentiel avant de demander des relevés à la brigade.' },
    { title: 'Capteurs', purpose: 'Suivre les sondes connectées et leur lien avec les enceintes HACCP.', actions: 'Appairer/configurer avec l’administrateur, nommer clairement le capteur et vérifier qu’il est rattaché au bon équipement.', flow: ['Ouvrir Capteurs et vérifier l’état de chaque sonde.', 'Si une sonde est hors ligne, contrôler alimentation, réseau et emplacement ; basculer immédiatement sur un relevé manuel.', 'Après remise en service, vérifier que la sonde remonte une mesure cohérente avec la température observée sur place.'] },
    { title: 'Alertes température', purpose: 'Prioriser une température trop chaude, trop froide, hors seuil ou un capteur indisponible.', actions: 'Ne clôturez pas une alerte par simple lecture écran : une vérification physique et une action corrective sont nécessaires.', flow: ['Ouvrir Alertes et identifier l’équipement, la valeur observée, le seuil et le niveau de gravité.', 'Se rendre auprès de l’équipement ; contrôler la température avec une méthode de secours si nécessaire et vérifier porte, charge, alimentation ou réglage.', 'Appliquer la mesure corrective adaptée à la procédure de l’établissement : sécuriser les denrées, alerter le responsable, isoler le matériel ou ajuster son fonctionnement.', 'Créer ou compléter le relevé de température avec la mesure vérifiée et la correction apportée.', 'Contrôler le relevé suivant : l’alerte n’est considérée résolue que lorsque la situation est redevenue conforme et tracée.'] },
    { title: 'Températures', purpose: 'Enregistrer et consulter les relevés des enceintes.', actions: 'Choisir l’équipement, saisir la mesure et la correction si la valeur est hors seuil.', flow: ['Ouvrir Températures puis choisir l’équipement concerné.', 'Saisir le relevé réellement mesuré, jamais une estimation.', 'En cas de valeur hors seuil, renseigner la remarque et l’action menée dans la même intervention.', 'Consulter le détail et l’historique pour confirmer le retour à la normale ou escalader au responsable HACCP.'] },
    { title: 'Nettoyage', purpose: 'Gérer les zones, surfaces, sessions actives et l’historique.', actions: 'Démarrer la session, marquer les surfaces, compléter et clôturer sans omission.' },
    { title: 'Traçabilité et réceptions', purpose: 'Consigner lots, produits, contrôles de livraison et étiquetage.', actions: 'Vérifier la marchandise, compléter les données puis conserver les preuves nécessaires.' },
    { title: 'Processus', purpose: 'Suivre refroidissement, congélation et remise en température.', actions: 'Sélectionner produit et équipement, enregistrer les étapes et contrôler la conformité.' },
    { title: 'Huiles, production et produits HACCP', purpose: 'Tracer les bains de friture, préparations et durées de conservation.', actions: 'Associer le bon équipement/produit, joindre une photo si demandée et consulter l’historique.' },
    { title: 'Étiquettes et rapports', purpose: 'Imprimer des étiquettes de traçabilité et produire les rapports sanitaires.', actions: 'Vérifier les informations avant impression, puis générer le rapport de la période concernée.' },
  ],
  rh: [
    { title: 'Tableau de bord RH', purpose: 'Suivre l’avancement de la structure et les compteurs essentiels.', actions: 'Terminer les prérequis proposés avant de créer des collaborateurs.' },
    { title: 'Services', purpose: 'Structurer les équipes et départements de l’établissement.', actions: 'Créer, modifier ou archiver une référence sans supprimer l’historique associé.' },
    { title: 'Postes', purpose: 'Définir les fonctions par service.', actions: 'Créer les postes après les services, puis les utiliser pour les collaborateurs.' },
    { title: 'Collaborateurs', purpose: 'Gérer les personnes, avec ou sans compte ToqueHub.', actions: 'Créer la fiche, lier le compte si nécessaire, compléter le poste, service et statut ; archiver en cas de départ.' },
    { title: 'Fiche collaborateur', purpose: 'Consulter contrat, formations, justificatifs, congés et renvoi vers le planning.', actions: 'Déposer, prévisualiser, remplacer ou télécharger les documents selon vos droits.' },
    { title: 'Organigramme', purpose: 'Visualiser les relations hiérarchiques.', actions: 'Renseigner le responsable dans les fiches puis filtrer par service pour contrôler la structure.' },
  ],
  planning: [
    { title: 'Tableau de bord', purpose: 'Piloter une période : statut, heures, coût estimé, alertes, actions et historique.', actions: 'Choisir la période, personnaliser les blocs et ouvrir l’action qui demande une décision.' },
    { title: 'Planning', purpose: 'Construire les affectations en vue jour, semaine, mois ou année.', actions: 'Créer une affectation, contrôler les conflits, puis préparer la publication de la période.' },
    { title: 'Présences', purpose: 'Consulter ou gérer les présences liées à l’exploitation.', actions: 'Sélectionner la période et vérifier les informations avant un export ou un verrouillage.' },
    { title: 'Absences et besoins', purpose: 'Enregistrer les indisponibilités et les besoins opérationnels à couvrir.', actions: 'Saisir l’absence avant l’affectation ; ajuster les besoins avant de rechercher un remplacement.' },
    { title: 'Remplacements', purpose: 'Proposer et accepter un remplaçant adapté à une situation ouverte.', actions: 'Vérifier disponibilité, service et compétence, puis accepter la proposition retenue.' },
    { title: 'Modèles et rotations', purpose: 'Réutiliser des journées types et roulements hebdomadaires.', actions: 'Prévisualiser la génération ou la rotation, puis l’appliquer seulement après contrôle.' },
    { title: 'Réglages — créneaux, disponibilités et règles', purpose: 'Préparer les modèles horaires, contraintes et disponibilité.', actions: 'Configurer cette base avant les affectations afin d’éviter les corrections répétées.' },
    { title: 'Réglages — coûts, notifications et exports', purpose: 'Paramétrer les lectures économiques, alertes et documents.', actions: 'Vérifier les données RH avant de rendre un coût ou export opposable.' },
    { title: 'Publication et verrouillage', purpose: 'Diffuser une période validée puis la protéger pour la paie ou les exports.', actions: 'Traiter les avertissements ; forcer seulement avec une justification connue de la direction.' },
  ],
  utilisateurs: [
    { title: 'Membres', purpose: 'Créer, inviter, activer ou désactiver les comptes.', actions: 'Associer le compte à un collaborateur quand cela apporte du sens et vérifier son statut.' },
    { title: 'Rôles et permissions', purpose: 'Définir qui peut lire, gérer ou administrer chaque domaine.', actions: 'Choisir le rôle minimal utile ; vérifier les droits sensibles avant enregistrement.' },
    { title: 'Documents', purpose: 'Retrouver les documents autorisés et leurs métadonnées.', actions: 'Télécharger ou mettre à jour seulement les éléments relevant de votre rôle.' },
  ],
  architecture: [
    { title: 'Vue globale', purpose: 'Obtenir une synthèse des modules, tables et liens détectés.', actions: 'Utiliser cette vue pour préparer une évolution ou une formation.' },
    { title: 'Modules et Data Map', purpose: 'Voir les propriétaires des données et les entités partagées.', actions: 'Éviter de créer un référentiel doublon lorsqu’un module possède déjà la donnée.' },
    { title: 'Relations et schéma', purpose: 'Lire les dépendances et la structure de données de l’instance.', actions: 'Réservé à l’administration ; utiliser les relations pour évaluer un impact avant intervention.' },
    { title: 'Doublons, impact, roadmap et documentation', purpose: 'Identifier les incohérences, zones touchées et état de maturité.', actions: 'Traiter un doublon à sa source, puis suivre les recommandations et l’état réel du module.' },
  ],
  achats: [
    { title: 'Guide de configuration', purpose: 'Préparer fournisseurs, paramètres et première commande.', actions: 'Suivre l’assistant jusqu’à la messagerie fournisseur si cette fonction est activée.' },
    { title: 'Tableau de bord', purpose: 'Voir commandes à préparer, montants, livraisons et réceptions à contrôler.', actions: 'Ouvrir la commande ou réception prioritaire depuis les indicateurs.' },
    { title: 'Commandes', purpose: 'Préparer, filtrer, envoyer, confirmer, réceptionner, clôturer ou annuler les commandes.', actions: 'Contrôler les lignes et le fournisseur avant envoi ; suivre le statut jusqu’à clôture.' },
    { title: 'Réceptions', purpose: 'Importer, contrôler et valider les livraisons contre les commandes.', actions: 'Gérer les écarts et les réceptions partielles avant l’intégration dans Stocks.' },
    { title: 'Historique', purpose: 'Retrouver les événements du module Achats.', actions: 'S’en servir pour expliquer un statut, un écart ou une action d’envoi.' },
  ],
  mobile: [
    { title: 'Bienvenue, découverte et connexion', purpose: 'Découvrir le serveur local, le sélectionner puis ouvrir une session.', actions: 'Vérifier le réseau local ; en cas d’échec, renseigner l’adresse du serveur communiquée par l’administrateur.' },
    { title: 'Onboarding mobile', purpose: 'Préparer une nouvelle instance depuis le téléphone lorsque ce parcours est autorisé.', actions: 'Renseigner établissement, site, pays réglementaire et compte administrateur avec les informations validées.' },
    { title: 'Tableau de bord HACCP mobile', purpose: 'Accéder aux actions terrain et à l’état du jour.', actions: 'Démarrer par les alertes, puis ouvrir le contrôle concerné.' },
    { title: 'Températures et capteurs', purpose: 'Consulter les équipements, le détail d’un relevé, ajouter une mesure ou un équipement et configurer un capteur.', actions: 'Choisir le bon équipement, relever la valeur sur place puis signaler une non-conformité.' },
    { title: 'Réceptions et traçabilité', purpose: 'Contrôler les marchandises, créer/éditer une ligne de traçabilité et consulter son détail.', actions: 'Vérifier quantité, état, lot et date avant validation ; ne jamais inventer une information absente.' },
    { title: 'Nettoyage', purpose: 'Gérer les zones, la session active, l’historique et le détail d’une journée.', actions: 'Démarrer la session, cocher les surfaces réellement traitées, compléter puis contrôler l’historique.' },
    { title: 'Refroidissement, congélation et réchauffement', purpose: 'Créer une session, suivre les étapes et consulter l’historique HACCP.', actions: 'Associer produit et matériel, relever les températures demandées puis clôturer le processus.' },
    { title: 'Huiles, productions et produits HACCP', purpose: 'Ajouter une session huile, tracer une production ou gérer le catalogue sanitaire.', actions: 'Sélectionner l’équipement ou le produit exact et joindre les preuves attendues.' },
    { title: 'Rapports, planning et étiqueteuse', purpose: 'Consulter les rapports journaliers, le planning HACCP et la configuration d’impression.', actions: 'Générer un rapport une fois les contrôles terminés ; tester l’imprimante avant le service.' },
    { title: 'Mode hors ligne et synchronisation', purpose: 'Conserver les opérations quand le réseau est absent.', actions: 'Ne pas supprimer l’application ; reconnecter l’appareil et vérifier la file avant la fin du service.' },
  ],
  sauvegardes: [
    { title: 'Liste et création de sauvegardes', purpose: 'Voir, créer, télécharger et planifier les sauvegardes de l’instance.', actions: 'Nommer/identifier les sauvegardes et vérifier leur date avant toute opération sensible.' },
    { title: 'Restauration', purpose: 'Remettre une sauvegarde validée en cas d’incident.', actions: 'Confirmer le périmètre et la date ; réaliser l’opération dans un créneau maîtrisé.' },
    { title: 'Stockage distant chiffré', purpose: 'Configurer l’intégration cloud autorisée.', actions: 'Vérifier la connexion et conserver les accès exclusivement côté administration.' },
    { title: 'Mises à jour et diagnostic', purpose: 'Maintenir le serveur local, Docker ou Raspberry Pi.', actions: 'Sauvegarder avant mise à jour, consulter l’état du service et suivre le diagnostic réseau en cas de panne.' },
  ],
  iot: [
    { title: 'Capteurs HACCP', purpose: 'Appairer et surveiller les sondes de température du réseau local.', actions: 'Identifier chaque capteur et l’associer à l’enceinte réelle ; vérifier son état en continu.' },
    { title: 'Alertes capteurs', purpose: 'Réagir à une température hors seuil ou un capteur hors ligne.', actions: 'Contrôler l’équipement physiquement, documenter l’action corrective et maintenir un relevé manuel si nécessaire.' },
    { title: 'Serveur local', purpose: 'Faire fonctionner les services ToqueHub et la découverte réseau.', actions: 'Utiliser les procédures d’installation, statut, journaux, mise à jour et sauvegarde prévues pour l’administrateur.' },
  ],
  parcours: [
    { title: 'Déploiement par étapes', purpose: 'Adopter les modules dans l’ordre de leurs dépendances.', actions: 'Ne passer à l’étape suivante qu’après validation des données de l’étape précédente.' },
    { title: 'Référents métier', purpose: 'Distribuer la responsabilité de la qualité des informations.', actions: 'Nommer une personne responsable du catalogue, des recettes, du HACCP, du planning et de l’administration.' },
  ],
};

export type OperationalFlow = { when: string; prerequisites: string[]; steps: string[]; checks: string[]; result: string; pitfalls: string[] };

/** Parcours de bout en bout : ces flows décrivent la séquence métier, pas seulement la navigation. */
export const operationalFlows: Record<string, OperationalFlow> = {
  demarrer: { when: 'Lors de la première prise en main ou de l’arrivée d’un nouvel utilisateur.', prerequisites: ['Un compte individuel actif.', 'L’adresse de l’instance locale.'], steps: ['Se connecter avec son compte personnel.', 'Pour le créateur administrateur, suivre la visite guidée et confirmer le socle Stocks, Fiches Techniques et HACCP.', 'Vérifier l’établissement et les modules disponibles.', 'Lire les alertes et ouvrir le tableau de bord général.', 'Configurer Stocks avant toute saisie dans les modules dépendants.', 'Demander le bon rôle si une action est absente.'], checks: ['Le nom de l’établissement est correct.', 'Aucun compte partagé n’est utilisé.', 'L’installation du socle ne déclenche pas une mise en production automatique.'], result: 'L’utilisateur accède uniquement aux outils utiles à sa mission et le créateur dispose d’un socle prêt à configurer.', pitfalls: ['Créer des données métier avec un compte administrateur partagé.', 'Configurer plusieurs modules en parallèle avant de fiabiliser Stocks.'] },
  referentiels: { when: 'Avant d’utiliser Stocks, fiches techniques, achats ou production.', prerequisites: ['Liste validée des produits, familles, fournisseurs et lieux de stockage.'], steps: ['Créer les unités de gestion réellement utilisées.', 'Créer les catégories pour classer les produits.', 'Créer les fournisseurs.', 'Créer chaque produit une seule fois et lui associer ses références.', 'Déclarer les sites et emplacements.', 'Relire les doublons avec le référent catalogue.'], checks: ['Chaque produit possède une unité cohérente.', 'Les noms correspondent au vocabulaire de la brigade.'], result: 'Tous les modules utilisent le même catalogue et aucune donnée n’est ressaisie ailleurs.', pitfalls: ['Créer un nouveau produit pour une simple variante de conditionnement.', 'Mélanger l’unité d’achat et l’unité de stock sans règle claire.'] },
  stocks: { when: 'À chaque réception, sortie matière, perte, correction ou inventaire.', prerequisites: ['Référentiel produit complet.', 'Personne habilitée à enregistrer les mouvements.'], steps: ['Consulter le niveau de stock et les alertes.', 'Choisir le mouvement qui correspond au fait réel.', 'Saisir quantité, unité, emplacement, date et motif.', 'Ajouter lot ou information de traçabilité si nécessaire.', 'Contrôler le mouvement créé dans l’historique.', 'Faire un inventaire physique régulier et valider les écarts justifiés.'], checks: ['Le mouvement correspond à une réalité physique.', 'Une correction est motivée.', 'Le stock final est cohérent avec le comptage.'], result: 'Le stock courant découle d’un historique complet et vérifiable.', pitfalls: ['Modifier une quantité sans mouvement.', 'Utiliser une correction pour masquer une perte ou une réception.'] },
  'ocr-stocks': { when: 'Lorsqu’un bon de livraison ou une facture doit devenir une réception.', prerequisites: ['Document lisible.', 'Produits et fournisseurs déjà référencés.'], steps: ['Importer le document.', 'Attendre l’extraction puis comparer les lignes au papier ou à la marchandise.', 'Rapprocher chaque ligne du bon produit.', 'Corriger quantités, unités, prix et lots ambigus.', 'Traiter les écarts fournisseur.', 'Valider la réception seulement après contrôle physique.'], checks: ['Chaque ligne a un produit correct.', 'Les conditionnements sont compris.', 'La réception correspond à ce qui est réellement livré.'], result: 'Les mouvements de réception sont fiables et leur origine documentaire est conservée.', pitfalls: ['Valider des données OCR sans les lire.', 'Créer des doublons de produit pour accélérer le rapprochement.'] },
  marges: { when: 'Pour analyser une hausse de coût, fixer un prix ou préparer une décision fournisseur.', prerequisites: ['Prix d’achat actualisés par les réceptions.', 'Fiches techniques reliées aux produits.'], steps: ['Choisir le produit, fournisseur ou la période à analyser.', 'Comparer coût courant et historique.', 'Consulter les tendances de cotation lorsque disponible.', 'Identifier si la variation provient du marché, du fournisseur ou de la saisie.', 'Mettre à jour le prix source si nécessaire.', 'Recalculer les fiches techniques concernées et partager la décision.'], checks: ['Le prix analysé provient d’une réception réelle.', 'La période de comparaison est comparable.'], result: 'La décision économique s’appuie sur des coûts vérifiables.', pitfalls: ['Prendre une cotation de marché pour un prix de facture.', 'Modifier une marge sans actualiser le coût matière.'] },
  'fiches-techniques': { when: 'Pour standardiser une préparation ou mettre à jour une recette existante.', prerequisites: ['Produits Stocks actifs.', 'Catégories de recettes prêtes.'], steps: ['Créer ou ouvrir la fiche.', 'Définir portions de référence et catégorie.', 'Ajouter chaque ingrédient depuis Stocks avec sa quantité.', 'Rédiger les étapes de réalisation dans l’ordre réel.', 'Vérifier allergènes et coût matière.', 'Simuler d’autres volumes si nécessaire.', 'Dupliquer avant une variation majeure, puis archiver l’ancienne version au besoin.'], checks: ['Tous les ingrédients pointent vers le bon produit.', 'La portion de référence est réaliste.', 'Le coût est recalculé après changement de prix.'], result: 'La recette est reproductible, chiffrée et exploitable par Production et Menus.', pitfalls: ['Écrire un ingrédient libre au lieu de le sélectionner dans Stocks.', 'Écraser une recette historique au lieu de la dupliquer.'] },
  production: { when: 'Pour fabriquer une recette planifiée ou une production exceptionnelle.', prerequisites: ['Fiche technique active.', 'Stocks et responsables disponibles.'], steps: ['Créer l’ordre à partir de la fiche et fixer date, heure, portions et priorité.', 'Lire les besoins matières et les alertes.', 'Résoudre les ruptures ou justifier explicitement tout contournement critique.', 'Affecter responsables et équipe si nécessaire.', 'Réaliser la production et saisir les quantités réellement obtenues.', 'Effectuer le contrôle qualité.', 'Examiner puis confirmer le déstockage proposé.', 'Consulter l’historique et produire les documents nécessaires.'], checks: ['Aucun manque matière critique n’est ignoré.', 'Le déstockage est confirmé après la réalisation.', 'Les écarts de portions sont expliqués.'], result: 'La fabrication est reliée à la recette, au stock consommé et aux personnes impliquées.', pitfalls: ['Clôturer sans contrôle qualité.', 'Confondre proposition de déstockage et mouvement déjà confirmé.'] },
  menus: { when: 'Pour préparer les repas, cycles et volumes de service.', prerequisites: ['Menus installe Stocks, Fiches Techniques et Production si nécessaire.', 'Avant la première génération : fiches techniques, groupes de convives et régimes sont configurés.'], steps: ['Créer le menu sur la bonne date et le bon service.', 'Ajouter les fiches techniques existantes à chaque composante.', 'Créer les variantes régime nécessaires.', 'Renseigner les prévisions de convives par groupe.', 'Vérifier coûts, allergènes et quantités.', 'Valider puis publier le menu.', 'Générer les productions seulement après validation des volumes.'], checks: ['Chaque préparation est une fiche technique existante.', 'Les effectifs sont à jour avant la génération.', 'Le statut publié correspond à une version validée.'], result: 'Le menu pilote directement les productions sans dupliquer recettes ni ingrédients.', pitfalls: ['Générer les productions avant les prévisions.', 'Créer une recette dans Menus au lieu de Fiches techniques.'] },
  haccp: { when: 'Chaque jour, à chaque contrôle sanitaire et à toute non-conformité.', prerequisites: ['Équipements, zones, produits et seuils configurés.', 'Brigade formée aux procédures de l’établissement.'], steps: ['Ouvrir le tableau HACCP et traiter d’abord les alertes.', 'Vérifier capteurs et compléter les relevés de température.', 'Contrôler les réceptions, lots et traçabilités du jour.', 'Effectuer nettoyage, huiles et processus chaud/froid planifiés.', 'Enregistrer immédiatement une non-conformité et son action corrective.', 'Joindre les preuves requises.', 'Relire les éléments incomplets puis générer le rapport journalier.'], checks: ['Chaque alerte a une vérification terrain.', 'Les valeurs sont réellement mesurées.', 'Les actions correctives sont tracées dans la même intervention.'], result: 'Le dossier sanitaire quotidien est complet, attribué et consultable.', pitfalls: ['Reporter une saisie en fin de journée de mémoire.', 'Traiter une alerte capteur sans contrôler l’équipement.'] },
  rh: { when: 'À la création d’une structure, à l’arrivée, l’évolution ou au départ d’un collaborateur.', prerequisites: ['Services validés.', 'Postes structurés par service.'], steps: ['Terminer l’assistant de structure.', 'Créer services puis postes.', 'Créer la fiche collaborateur.', 'Associer service, poste, responsable et statut.', 'Lier un compte utilisateur uniquement si la personne doit accéder à ToqueHub.', 'Ajouter les documents et formations selon les droits.', 'Mettre à jour l’organigramme et archiver plutôt que supprimer lors d’un départ.'], checks: ['La personne existe une seule fois.', 'Les documents sensibles restent accessibles aux seuls rôles autorisés.'], result: 'RH devient la référence des personnes utilisée par Planning et Production.', pitfalls: ['Créer un compte utilisateur sans fiche collaborateur lorsque la liaison est requise.', 'Supprimer un historique de départ.'] },
  planning: { when: 'Pour préparer, contrôler, publier puis clôturer une période de travail.', prerequisites: ['Planning installe automatiquement RH lorsque nécessaire.', 'Avant la première publication : au moins un service, un poste et un collaborateur actif correctement rattaché.', 'Créneaux, règles et disponibilités configurés.'], steps: ['Choisir la période et consulter son état.', 'Saisir absences et besoins opérationnels.', 'Créer les affectations ou appliquer un modèle après prévisualisation.', 'Traiter les conflits et proposer un remplacement si nécessaire.', 'Contrôler heures, alertes et coûts estimés.', 'Publier la période une fois validée.', 'Verrouiller après diffusion pour préparer les exports ou la paie.'], checks: ['Absences et besoins sont intégrés.', 'Les conflits ouverts ont une décision.', 'La période publiée est celle réellement diffusée.'], result: 'Le planning est cohérent, communicable et traçable.', pitfalls: ['Modifier une période verrouillée sans décision formelle.', 'Appliquer une rotation sans prévisualisation.'] },
  utilisateurs: { when: 'À chaque arrivée, changement de mission ou départ d’une personne ayant un accès.', prerequisites: ['Fiche RH si la personne est collaborateur.', 'Rôle cible défini.'], steps: ['Créer ou inviter le compte.', 'Associer la fiche collaborateur si applicable.', 'Attribuer le rôle minimal nécessaire.', 'Vérifier les permissions sensibles.', 'Tester l’accès avec la personne ou par contrôle administrateur.', 'Désactiver ou ajuster le compte dès la fin de mission.'], checks: ['Un compte correspond à une personne.', 'Aucun droit d’administration n’est accordé par confort.'], result: 'Chaque action est attribuable et l’accès est proportionné au besoin.', pitfalls: ['Partager des identifiants.', 'Conserver un accès après un départ.'] },
  architecture: { when: 'Avant d’activer un module, modifier un référentiel ou préparer une évolution.', prerequisites: ['Accès administrateur.', 'Périmètre de la décision identifié.'], steps: ['Ouvrir la vue globale pour identifier les modules concernés.', 'Consulter les données propriétaires dans Data Map.', 'Lire les relations et l’impact avant toute décision.', 'Identifier un éventuel doublon à sa source.', 'Vérifier l’état du module et la roadmap.', 'Préparer une sauvegarde et une communication avant intervention.'], checks: ['La donnée existe déjà ou non dans un module propriétaire.', 'Les conséquences sur les modules dépendants sont comprises.'], result: 'Les évolutions limitent les doublons et les effets de bord.', pitfalls: ['Modifier une donnée partagée sans vérifier ses dépendances.'] },
  achats: { when: 'Pour commander, suivre et réceptionner un approvisionnement fournisseur.', prerequisites: ['Fournisseurs et produits Stocks prêts.', 'Messagerie testée si envoi depuis ToqueHub.'], steps: ['Terminer le guide de configuration.', 'Créer une commande avec ses lignes et quantités.', 'Contrôler fournisseur, adresses, prix et destinataire.', 'Envoyer ou conserver le brouillon selon le circuit choisi.', 'Suivre confirmation, livraison et éventuels écarts.', 'Créer une réception, accepter les quantités réelles et valider.', 'Clôturer la commande après traitement des réceptions partielles.'], checks: ['Le bon fournisseur est sélectionné.', 'Les écarts sont expliqués avant validation.', 'Les mouvements de stock proviennent d’une réception validée.'], result: 'Le cycle achat est relié aux Stocks et reste historisé de bout en bout.', pitfalls: ['Envoyer une commande sans aperçu.', 'Clôturer malgré une réception partielle non traitée.'] },
  mobile: { when: 'Pour réaliser un contrôle HACCP sur le terrain avec ou sans réseau temporaire.', prerequisites: ['Application installée.', 'Serveur connu et compte autorisé.'], steps: ['Découvrir ou saisir le serveur puis se connecter.', 'Vérifier le tableau HACCP et l’état de synchronisation.', 'Réaliser le contrôle dans l’écran correspondant.', 'Ajouter mesures, lots, photos et corrections immédiatement.', 'Si hors ligne, poursuivre sans désinstaller l’application.', 'Reconnecter l’appareil et vérifier que toutes les opérations sont synchronisées.', 'Générer ou consulter le rapport une fois les contrôles terminés.'], checks: ['L’équipement est relié au bon serveur.', 'La file hors ligne est vide après synchronisation.'], result: 'Les actions terrain restent tracées même pendant une coupure de réseau.', pitfalls: ['Supposer qu’une saisie hors ligne est arrivée au serveur sans vérifier.', 'Supprimer l’application avant synchronisation.'] },
  sauvegardes: { when: 'Avant mise à jour, changement technique, incident ou à fréquence planifiée.', prerequisites: ['Droits administrateur.', 'Emplacement de sauvegarde validé.'], steps: ['Vérifier les dernières sauvegardes.', 'Créer une sauvegarde avant une opération à risque.', 'Télécharger ou vérifier le dépôt distant chiffré.', 'Documenter date et raison de la sauvegarde.', 'En cas d’incident, diagnostiquer avant restauration.', 'Restaurer uniquement une sauvegarde identifiée et validée.', 'Vérifier l’accès, les données et les services après restauration.'], checks: ['La sauvegarde existe et peut être identifiée.', 'Une restauration est testée selon la procédure prévue.'], result: 'La continuité de l’instance est préparée et les restaurations sont maîtrisées.', pitfalls: ['Mettre à jour sans sauvegarde.', 'Restaurer une date non vérifiée en production.'] },
  iot: { when: 'Lors du déploiement ou de la maintenance de capteurs HACCP.', prerequisites: ['Serveur local opérationnel.', 'Capteurs, réseau et emplacements préparés.'], steps: ['Installer/configurer les services IoT autorisés.', 'Appairer chaque capteur.', 'Nommer et associer le capteur au bon équipement.', 'Définir ou vérifier les seuils de l’équipement.', 'Tester une remontée et une alerte.', 'Prévoir le relevé manuel de secours.', 'Contrôler périodiquement l’état en ligne des capteurs.'], checks: ['Chaque capteur est physiquement identifiable.', 'Une alerte test a été reçue et traitée selon la procédure.'], result: 'Les capteurs complètent les contrôles HACCP sans devenir un point de défaillance unique.', pitfalls: ['Se fier à une sonde sans vérification initiale.', 'Ne pas prévoir de procédure manuelle.'] },
  parcours: { when: 'Lors de l’adoption progressive de ToqueHub dans un établissement.', prerequisites: ['Référent métier nommé pour chaque domaine.', 'Temps de formation et données de départ disponibles.'], steps: ['Installer et sécuriser les accès.', 'Utiliser la visite guidée pour préparer le socle Stocks, Fiches Techniques et HACCP.', 'Configurer Stocks et construire les référentiels avec un périmètre pilote.', 'Créer les fiches techniques essentielles.', 'Passer à Production puis Menus.', 'Mettre progressivement en service les routines HACCP déjà installées.', 'Ajouter RH, Planning, mobile et IoT selon la maturité.', 'Mesurer les écarts et améliorer les procédures.'], checks: ['Chaque étape possède un responsable.', 'Les données de l’étape précédente sont validées avant la suivante.', 'Un module installé n’est mis en production qu’après configuration et formation.'], result: 'Le déploiement reste progressif et les modules reposent sur des données fiables.', pitfalls: ['Activer tous les modules sans référentiels ni formation.', 'Recréer les mêmes données dans plusieurs modules.'] },
};
