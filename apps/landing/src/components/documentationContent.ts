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
    id: 'stocks', title: 'Stocks, matériel, inventaires et mouvements', eyebrow: 'Pilotage matière', status: 'Disponible', audience: 'Magasinier, chef, gestionnaire',
    goal: 'Suivre les produits et le parc matériel, ce qui entre, sort et reste disponible, sans perdre l’historique des mouvements.',
    prerequisites: ['Référentiels produits, unités et emplacements renseignés.'],
    steps: [
      'Importez ou créez le catalogue produits, puis organisez catégories, unités, fournisseurs, sites et emplacements.',
      'Séparez les denrées du matériel et renseignez les informations de parc utiles aux équipements.',
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
    id: 'ocr-stocks', title: 'Imports tableurs et OCR Stocks', eyebrow: 'Stocks', status: 'Disponible', audience: 'Réceptionnaire, gestionnaire',
    goal: 'Construire un catalogue depuis un CSV/XLSX, reprendre un inventaire tableur ou transformer un document d’achat en réception contrôlée.',
    prerequisites: ['Au moins un site configuré ; documents lisibles pour les parcours OCR.'],
    steps: [
      'Choisissez le parcours adapté : catalogue CSV/XLSX, inventaire CSV/XLSX/XML ou document d’achat analysé.',
      'Vérifiez l’association des colonnes et les lignes détectées avant toute création de produit ou d’inventaire.',
      'Pour un document d’achat, contrôlez systématiquement quantités, unités, prix, fournisseur et rapprochement produit.',
      'Corrigez les doublons, ambiguïtés de conditionnement et lignes signalées comme nécessitant une revue.',
      'Conservez l’inventaire importé en brouillon jusqu’au comptage ; validez une réception uniquement après le contrôle physique.'
    ],
    result: 'Le catalogue, l’inventaire ou la réception est préparé par l’import puis confirmé par une personne avant tout effet sur le stock réel.',
    tips: ['Un classeur structuré est lu directement, sans OCR.', 'L’OCR propose : il ne remplace jamais le contrôle de réception.'],
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
    id: 'production', title: 'Production et planning opérationnel', eyebrow: 'Exécution cuisine', status: 'Disponible', audience: 'Chef, responsable de production, manager',
    goal: 'Piloter des campagnes de fabrication et organiser les tâches de la brigade à partir des fiches techniques, menus et événements.',
    prerequisites: ['Stocks et Fiches Techniques installés ; RH améliore les affectations, mais une tâche peut rester non affectée selon les droits.'],
    steps: [
      'Dans Fabrication, créez ou ouvrez une campagne à partir d’une fiche technique, d’un menu ou d’un dossier traiteur.',
      'Contrôlez site, date, quantité cible, besoins matières, opérations et état de la campagne.',
      'Validez la campagne lorsque les informations nécessaires sont prêtes pour l’exécution.',
      'Dans Planning opérationnel, placez les tâches en attente sur la journée ou la semaine et affectez service, poste ou collaborateurs.',
      'Suivez les statuts, horaires et priorités ; scindez une recette en étapes lorsque son déroulé doit être distribué.',
      'Renseignez l’avancement réel et consultez les liens conservés vers la fiche, le menu ou l’événement source.'
    ],
    result: 'La fabrication et le travail de la brigade restent reliés à leurs recettes, quantités, origines, personnes et horaires.',
    tips: ['Une campagne décrit ce qui doit être fabriqué ; une tâche décrit qui fait quoi et quand.', 'Gardez les tâches non planifiées dans la file jusqu’à ce qu’un horaire soit réellement décidé.'],
    related: ['menus', 'stocks', 'planning']
  },
  {
    id: 'menus', title: 'Menus, cartes, événements et cycles', eyebrow: 'Planification culinaire', status: 'Disponible', audience: 'Chef, diététicien, restaurateur, traiteur, gestionnaire',
    goal: 'Adapter la planification culinaire au profil de l’activité puis relier cartes, menus ou événements aux productions nécessaires.',
    prerequisites: ['L’installation de Menus installe Stocks, Fiches Techniques et Production si nécessaire ; configurez-les progressivement avant vos premières productions.'],
    steps: [
      'Choisissez le profil correspondant à votre activité : restaurant/café, traiteur ou cuisine centrale.',
      'Pour une carte, ajoutez produits Stocks et fiches d’assemblage, puis contrôlez disponibilité et seuils de préparation.',
      'Pour un menu collectif, positionnez les fiches aux dates et services, puis renseignez régimes, groupes et prévisions de convives.',
      'Pour un événement traiteur, centralisez client, prestations, logistique, recettes, documents et passage en Production.',
      'Pour une cuisine centrale, organisez cycles, effectifs habituels, sites de production et documents de distribution.',
      'Validez les volumes avant de préparer les manques ou de générer les fabrications.'
    ],
    result: 'L’offre commerciale ou alimentaire devient un besoin de production traçable, sans dupliquer produits ni recettes.',
    tips: ['Le profil change l’expérience et les onglets : choisissez-le avant de former l’équipe.', 'Le profil peut être adapté plus tard depuis le module, mais vérifiez l’impact avec l’équipe avant de le changer.'],
    related: ['fiches-techniques', 'production']
  },
  {
    id: 'haccp', title: 'HACCP, capteurs et traçabilité terrain', eyebrow: 'Sécurité alimentaire', status: 'Disponible', audience: 'Brigade, responsable HACCP, administrateur',
    goal: 'Configurer le plan de maîtrise sanitaire sur le web, exécuter les contrôles sur mobile et réunir les preuves dans un historique commun.',
    steps: [
      'Dans ToqueHub web, configurez enceintes, équipements de process, zones, surfaces, fréquences et seuils.',
      'Appairez les capteurs Sonoff/Zigbee si ce périmètre est déployé, puis vérifiez leur équipement associé et les notifications.',
      'Sur l’application mobile, la brigade réalise températures, réceptions, traçabilité, nettoyage, huiles et processus chaud/froid.',
      'En cas d’alerte, contrôlez physiquement l’équipement et consignez la mesure ainsi que l’action corrective.',
      'Depuis le web, consultez les registres synchronisés, les courbes capteurs et les preuves photo.',
      'Contrôlez les rapports PDF quotidiens archivés automatiquement et complétez toute information manquante à sa source.'
    ],
    result: 'La configuration, les contrôles terrain, les alertes capteurs et les rapports restent synchronisés et attribuables.',
    tips: ['Le web prépare et supervise ; l’application mobile accompagne l’exécution quotidienne.', 'Un capteur complète le contrôle humain, il ne le remplace pas.'],
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
    id: 'achats', title: 'Achats', eyebrow: 'Approvisionnement', status: 'Disponible', audience: 'Gestionnaire, acheteur, réceptionnaire',
    goal: 'Préparer, envoyer avec le bon de commande PDF et réceptionner les commandes fournisseurs à partir des référentiels Stocks.',
    prerequisites: ['Fournisseurs et produits Stocks prêts.', 'Pour envoyer depuis ToqueHub : au moins une connexion Google Workspace/Gmail, Microsoft 365/Outlook, SMTP ou Resend configurée et testée.'],
    steps: [
      'Terminez le guide de configuration : fournisseurs, paramètres et messagerie d’envoi si elle est utilisée.',
      'Dans Messagerie fournisseur, connectez Google Workspace/Gmail ou Microsoft 365/Outlook par OAuth, configurez un SMTP sécurisé ou renseignez Resend ; lancez le test puis activez la connexion retenue.',
      'Utilisez les référentiels, niveaux de stock et besoins de production pour préparer une commande fournisseur.',
      'Contrôlez l’aperçu, le destinataire et le PDF avant l’envoi, puis suivez chaque tentative, la confirmation et le statut de la commande.',
      'Créez une réception depuis la commande, contrôlez les quantités et écarts, puis validez l’intégration en stock.',
      'Clôturez la commande seulement lorsque les réceptions attendues et les écarts sont traités.'
    ],
    result: 'Les achats suivent un cycle traçable, du brouillon à la réception validée, sans dupliquer produits ni fournisseurs.',
    tips: ['Une réception partielle laisse la commande ouverte tant que tout n’est pas traité.', 'Une connexion enregistrée n’est pas nécessairement active : testez-la, puis vérifiez la messagerie choisie avant l’envoi réel.', 'Les secrets et jetons de messagerie sont réservés à la configuration autorisée.'],
    related: ['integrations', 'referentiels', 'stocks', 'ocr-stocks']
  },
  {
    id: 'integrations', title: 'Intégrations et connecteurs', eyebrow: 'Services externes', status: 'À configurer', audience: 'Administrateur, direction, référent de module',
    goal: 'Savoir quels services externes ToqueHub sait réellement connecter, à quoi ils servent et comment contrôler leur activation.',
    prerequisites: ['Un compte administrateur ou les permissions du module concerné.', 'Les identifiants, clés API ou autorisations OAuth fournis par le service externe.', 'Une sauvegarde récente avant une modification d’infrastructure importante.'],
    steps: [
      'Pour Achats, choisissez Google Workspace/Gmail, Microsoft 365/Outlook, SMTP sécurisé ou Resend ; configurez, testez puis activez une messagerie pour joindre le PDF aux commandes fournisseur.',
      'Pour Finance, rattachez Fennoa, Flatpay, Loyverse ou PayPal POS/Zettle au bon établissement ; les imports génériques restent disponibles pour les fichiers pris en charge.',
      'Configurez Mistral uniquement si vous utilisez l’OCR documentaire, les suggestions de rapprochement ou les analyses assistées ; conservez toujours la validation humaine.',
      'Dans Cours des produits, utilisez les cotations publiques RNM FranceAgriMer comme tendance de marché, jamais comme prix facturé automatiquement.',
      'Dans Sauvegardes, connectez Google Drive par OAuth, testez la connexion et vérifiez l’envoi d’une sauvegarde identifiée.',
      'Pour HACCP, déployez les capteurs Sonoff/Zigbee et les services IoT locaux uniquement après appairage, association à l’équipement réel et test d’alerte.',
      'Après chaque connexion, contrôlez son statut, sa dernière synchronisation, son périmètre et le comportement prévu en cas d’indisponibilité.'
    ],
    result: 'Chaque connecteur est affecté à un usage précis, testé avant mise en service et surveillé sans devenir une source de données opaque.',
    tips: ['OAuth évite de confier le mot de passe de votre boîte à ToqueHub.', 'Ne mélangez pas Google Workspace pour les commandes et Google Drive pour les sauvegardes : ce sont deux connexions distinctes.', 'Une intégration indisponible ne doit jamais empêcher le parcours manuel prévu.'],
    related: ['achats', 'finance', 'sauvegardes', 'haccp']
  },
  {
    id: 'finance', title: 'Finance et ventes', eyebrow: 'Pilotage économique', status: 'Disponible', audience: 'Direction, finance, gestionnaire',
    goal: 'Consolider des données comptables et opérationnelles pour piloter ventes, rentabilité, trésorerie et budget sans refaire la comptabilité.',
    prerequisites: ['Sources identifiées : Fennoa, caisse/POS ou fichiers à importer.', 'Chaque source opérationnelle rattachée au bon établissement avant consolidation.'],
    steps: [
      'Ouvrez Sources & qualité, connectez Fennoa ou une caisse compatible, ou importez les rapports disponibles.',
      'Rattachez chaque source au bon établissement et choisissez la source POS principale lorsqu’un même périmètre en contient plusieurs.',
      'Vérifiez période, statut, couverture et doublons avant d’inclure une source dans le chiffre d’affaires.',
      'Lisez le cockpit puis les vues Ventes, Annuel, Mensuel, Journalier et Budget avec leur source et leur période affichées.',
      'Dans Ventes & affluence, analysez transactions, ticket moyen, heures, jours, produits, catégories et rapprochement avec l’effectif planifié.',
      'Lancez l’analyste Mistral seulement si la clé est configurée et relisez ses signaux à la lumière des agrégats et limites indiqués.',
      'Générez le rapport PDF adapté : synthèse annuelle, rapport annuel, mensuel, journalier ou ventes sur une période définie.'
    ],
    result: 'La direction dispose d’indicateurs consolidés dont la provenance, la fraîcheur et les limites restent visibles.',
    tips: ['Fennoa reste la vérité comptable ; les caisses apportent le détail opérationnel et le provisoire.', 'N’interprétez jamais une période partiellement couverte comme une période complète.'],
    related: ['integrations', 'marges', 'achats', 'planning', 'sauvegardes']
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
      'Connectez Google Drive par OAuth si un stockage distant est prévu, testez la connexion puis vérifiez l’envoi d’une sauvegarde identifiée.',
      'Avant une mise à jour, réalisez une sauvegarde et consultez les informations de version.',
      'En cas d’incident, diagnostiquez l’accès réseau et l’état du serveur ; restaurez uniquement une sauvegarde validée.'
    ],
    result: 'Les données restent récupérables et les opérations de maintenance suivent un processus maîtrisé.',
    tips: ['Testez une restauration sur un environnement prévu à cet effet.', 'Une sauvegarde non vérifiée n’est pas une garantie de reprise.'],
    related: ['integrations', 'iot', 'utilisateurs']
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
      'Semaine 4 : pilotez les premières campagnes de fabrication puis adaptez Menus à votre activité.',
      'Ensuite : activez les routines HACCP mobile, RH/planning, Achats et Finance selon votre organisation.'
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
    { title: 'Produits', purpose: 'Consulter le catalogue et le stock disponible par article.', actions: 'Rechercher, filtrer, ajouter manuellement ou ouvrir l’assistant d’import CSV/XLSX et contrôler chaque ligne proposée.' },
    { title: 'Matériel', purpose: 'Gérer séparément le parc d’équipements et son stock.', actions: 'Créer les catégories et fiches matériel, suivre leur emplacement et utiliser les mouvements dédiés sans les mélanger aux denrées.' },
    { title: 'Fournisseur', purpose: 'Gérer les partenaires associés aux articles.', actions: 'Mettre à jour les coordonnées et les relations produit-fournisseur sans recréer les articles.' },
    { title: 'Inventaire', purpose: 'Comparer le niveau théorique au comptage physique.', actions: 'Créer un inventaire complet ou importer un CSV/XLSX/XML en brouillon, contrôler les lignes, saisir les quantités observées, expliquer l’écart puis valider.' },
    { title: 'Réglage', purpose: 'Accéder aux catégories, unités, types de mouvement et audit.', actions: 'N’ajuster les paramètres que si la structure métier évolue ; consulter l’audit avant toute correction.' },
  ],
  'ocr-stocks': [
    { title: 'Import catalogue CSV/XLSX', purpose: 'Créer ou enrichir le référentiel produits depuis un tableur.', actions: 'Vérifier la structure, associer les colonnes, traiter doublons et lignes à revoir puis sélectionner uniquement les lignes prêtes.' },
    { title: 'Import inventaire', purpose: 'Préparer un comptage à partir d’un CSV, XLSX ou Excel XML.', actions: 'Contrôler le site, les produits rapprochés et les quantités ; l’import crée un brouillon et ne modifie pas immédiatement le stock.' },
    { title: 'Importer un document', purpose: 'Ajouter un bon de commande, bon de livraison, facture ou photo au format accepté.', actions: 'Choisir le document lisible et vérifier qu’il correspond à l’opération physique.' },
    { title: 'Analyse OCR', purpose: 'Lire les lignes proposées par l’analyse automatique.', actions: 'Contrôler fournisseur, produit, quantité, unité et prix ; aucun champ ne doit être validé sans vérification humaine.' },
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
    { title: 'Fabrication — campagnes', purpose: 'Piloter ce qui doit être fabriqué par période et par site.', actions: 'Créer une campagne, choisir la fiche, la date et la quantité cible, puis suivre son état en tableau, grille ou kanban.' },
    { title: 'Détail d’une campagne', purpose: 'Réunir informations générales, besoins matières et données RH.', actions: 'Contrôler la quantité, les opérations, le service et les responsables avant validation ou passage en exécution.' },
    { title: 'Planning des tâches', purpose: 'Organiser le travail opérationnel en vue jour ou semaine.', actions: 'Placer les éléments de la file sur un horaire, ajuster leur durée puis vérifier les chevauchements et priorités.' },
    { title: 'Assistant de tâche', purpose: 'Créer une tâche manuelle, depuis une fiche, une étape de recette, un modèle de poste ou une campagne.', actions: 'Choisir site, service, personnes, contenu, date, horaires et quantité ; laisser non affecté seulement si le circuit le permet.' },
    { title: 'Depuis un menu', purpose: 'Créer des tâches simples pour les fiches présentes dans un menu.', actions: 'Choisir le menu, le service RH, la date et l’heure puis contrôler les tâches générées dans la file.' },
    { title: 'Dossier traiteur', purpose: 'Faire passer les fabrications et la logistique d’un événement au planning.', actions: 'Valider les fabrications, préparer les tâches logistiques puis ouvrir le planning sur les dates de production concernées.' },
  ],
  menus: [
    { title: 'Choix du profil', purpose: 'Adapter le module au type d’activité.', actions: 'Choisir restaurant/café, traiteur ou cuisine centrale ; les outils et vues opérationnelles s’adaptent automatiquement.' },
    { title: 'Restaurant/café — Carte', purpose: 'Composer les cartes nourriture et boissons et calculer leur disponibilité.', actions: 'Ajouter produits Stocks ou fiches d’assemblage, renseigner portions/seuils et préparer uniquement les manques dans Production.' },
    { title: 'Collectivité — Tableau de bord', purpose: 'Piloter les menus à préparer et les raccourcis de planification.', actions: 'Ouvrir la liste, le calendrier, un cycle ou les régimes selon l’action à réaliser.' },
    { title: 'Menus planifiés', purpose: 'Créer les menus et leurs préparations par service.', actions: 'Ajouter les fiches techniques existantes, définir le statut brouillon, validé, publié ou archivé.' },
    { title: 'Calendrier', purpose: 'Visualiser les menus par jour, semaine, mois ou année.', actions: 'Ouvrir le menu d’une date pour l’ajuster ou contrôler sa publication.' },
    { title: 'Cycles', purpose: 'Répliquer une organisation alimentaire récurrente.', actions: 'Créer un cycle, le prévisualiser, le dupliquer puis contrôler ses dates avant application.' },
    { title: 'Régimes', purpose: 'Définir les adaptations alimentaires.', actions: 'Créer une règle claire et l’utiliser dans les variantes plutôt que de dupliquer tout le menu.' },
    { title: 'Convives par groupes', purpose: 'Prévoir les volumes par population.', actions: 'Mettre à jour les effectifs avant toute génération de production.' },
    { title: 'Exports & Documents', purpose: 'Préparer les supports de diffusion et de cuisine.', actions: 'Choisir le menu, la période et le format demandé.' },
    { title: 'Historique d’audit', purpose: 'Consulter les changements de planification.', actions: 'Vérifier qui a publié, modifié ou généré une production.' },
    { title: 'Traiteur — Événements', purpose: 'Gérer dossiers client, prestations, recettes, lieu, logistique et statuts.', actions: 'Constituer le dossier, confirmer l’événement puis transmettre fabrications et tâches logistiques à Production.' },
    { title: 'Cuisine centrale', purpose: 'Préparer cycles, effectifs habituels et documents de distribution.', actions: 'Définir le site de production, construire le cycle et télécharger les documents nécessaires.' },
  ],
  haccp: [
    { title: 'Tableau de bord HACCP web', purpose: 'Superviser le score, les domaines couverts, alertes et preuves synchronisées.', actions: 'Identifier les priorités, puis ouvrir le registre ou l’alerte concerné ; les saisies terrain courantes se font dans l’application mobile.' },
    { title: 'Zones & matériels', purpose: 'Configurer enceintes, équipements de process, zones et surfaces de nettoyage.', actions: 'Terminer le socle avant de demander des relevés à la brigade ; les mêmes références sont partagées avec le mobile.' },
    { title: 'Capteurs', purpose: 'Suivre les sondes connectées et leur lien avec les enceintes HACCP.', actions: 'Appairer/configurer avec l’administrateur, nommer clairement le capteur et vérifier qu’il est rattaché au bon équipement.', flow: ['Ouvrir Capteurs et vérifier l’état de chaque sonde.', 'Si une sonde est hors ligne, contrôler alimentation, réseau et emplacement ; basculer immédiatement sur un relevé manuel.', 'Après remise en service, vérifier que la sonde remonte une mesure cohérente avec la température observée sur place.'] },
    { title: 'Alertes température', purpose: 'Prioriser une température trop chaude, trop froide, hors seuil ou un capteur indisponible.', actions: 'Ne clôturez pas une alerte par simple lecture écran : une vérification physique et une action corrective sont nécessaires.', flow: ['Ouvrir Alertes et identifier l’équipement, la valeur observée, le seuil et le niveau de gravité.', 'Se rendre auprès de l’équipement ; contrôler la température avec une méthode de secours si nécessaire et vérifier porte, charge, alimentation ou réglage.', 'Appliquer la mesure corrective adaptée à la procédure de l’établissement : sécuriser les denrées, alerter le responsable, isoler le matériel ou ajuster son fonctionnement.', 'Créer ou compléter le relevé de température avec la mesure vérifiée et la correction apportée.', 'Contrôler le relevé suivant : l’alerte n’est considérée résolue que lorsque la situation est redevenue conforme et tracée.'] },
    { title: 'Températures', purpose: 'Consulter les relevés manuels et automatiques, ainsi que les courbes capteurs.', actions: 'Contrôler la cohérence des mesures et ouvrir l’historique du capteur ; créer le relevé terrain depuis le mobile lorsqu’une vérification est nécessaire.' },
    { title: 'Registres synchronisés', purpose: 'Retrouver nettoyage, traçabilité, réceptions, processus, huiles et productions saisis par l’équipe.', actions: 'Consulter détail, décision, notes et photos ; corriger l’information dans le parcours métier qui l’a créée.' },
    { title: 'Produits & étiquettes', purpose: 'Préparer les données de conservation et l’impression de traçabilité.', actions: 'Vérifier produit, lot et date avant impression, avec une imprimante configurée.' },
    { title: 'Rapports', purpose: 'Retrouver les dossiers sanitaires PDF classés par année et mois.', actions: 'Contrôler le rapport quotidien archivé automatiquement et télécharger la période nécessaire.' },
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
    { title: 'Émargement', purpose: 'Comparer les heures planifiées aux présences de la période.', actions: 'Sélectionner le mois, vérifier les lignes collaborateur et traiter les écarts avant un export ou un verrouillage.' },
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
    { title: 'Guide de configuration', purpose: 'Préparer fournisseurs, paramètres, messagerie et première commande.', actions: 'Suivre l’assistant dans l’ordre ; la page Messagerie permet de revenir ensuite sur la connexion active.' },
    { title: 'Messagerie fournisseur', purpose: 'Choisir la voie utilisée pour expédier les bons de commande PDF.', actions: 'Connecter Google Workspace/Gmail ou Microsoft 365/Outlook par OAuth 2.0, configurer un serveur SMTP sécurisé ou une clé Resend ; tester la connexion, l’activer et vérifier l’adresse d’envoi.' },
    { title: 'Tableau de bord', purpose: 'Voir commandes à préparer, montants, livraisons et réceptions à contrôler.', actions: 'Ouvrir la commande ou réception prioritaire depuis les indicateurs.' },
    { title: 'Commandes', purpose: 'Préparer, filtrer, envoyer avec PDF, confirmer, réceptionner, clôturer ou annuler les commandes.', actions: 'Contrôler lignes, fournisseur, destinataire et aperçu PDF ; après l’envoi, vérifier le fournisseur de messagerie, l’identifiant du message et le statut conservés.' },
    { title: 'Réceptions', purpose: 'Importer, contrôler et valider les livraisons contre les commandes.', actions: 'Gérer les écarts et les réceptions partielles avant l’intégration dans Stocks.' },
    { title: 'Historique', purpose: 'Retrouver les événements du module Achats et les tentatives d’envoi.', actions: 'S’en servir pour expliquer un statut, un écart ou une action ; corriger la connexion avant de relancer un envoi échoué.' },
  ],
  integrations: [
    { title: 'Achats · Google Workspace / Gmail', purpose: 'Envoyer depuis une boîte Google professionnelle ou Gmail autorisée.', actions: 'Lancer OAuth 2.0, sélectionner le compte, autoriser l’envoi, attendre le retour ToqueHub, tester puis activer la connexion.' },
    { title: 'Achats · Microsoft 365 / Outlook', purpose: 'Envoyer depuis une boîte Microsoft professionnelle.', actions: 'Passer par Microsoft Identity, autoriser l’accès demandé, revenir dans ToqueHub, tester puis activer la connexion.' },
    { title: 'Achats · SMTP sécurisé', purpose: 'Utiliser un serveur de messagerie compatible.', actions: 'Renseigner expéditeur, hôte, port, sécurité TLS, identifiant et mot de passe d’application ; tester la boîte puis l’activer.' },
    { title: 'Achats · Resend', purpose: 'Utiliser l’API transactionnelle Resend pour les commandes.', actions: 'Renseigner la clé API, l’adresse expéditrice vérifiée, le nom et éventuellement reply-to ; lancer l’e-mail de test puis vérifier l’état actif.' },
    { title: 'Finance · Fennoa et caisses', purpose: 'Rapprocher la comptabilité et les ventes opérationnelles.', actions: 'Configurer Fennoa, Flatpay, Loyverse ou PayPal POS/Zettle, rattacher au bon site, tester/synchroniser et désigner le POS principal sans additionner les doublons.' },
    { title: 'Mistral · OCR et analyses', purpose: 'Assister la lecture documentaire, les rapprochements Stocks et l’analyse Finance/HACCP selon les écrans activés.', actions: 'Configurer la clé dans l’administration ; contrôler les propositions et conserver la validation humaine avant tout effet métier.' },
    { title: 'RNM FranceAgriMer', purpose: 'Consulter les cours et tendances publics des denrées.', actions: 'Rechercher, suivre des favoris et comparer les périodes ; ne jamais remplacer automatiquement un prix fournisseur par une cotation RNM.' },
    { title: 'Sauvegardes · Google Drive', purpose: 'Copier des sauvegardes vers un dossier distant autorisé.', actions: 'Configurer le client, connecter le compte par OAuth, tester l’accès puis envoyer une sauvegarde et vérifier son identifiant distant.' },
    { title: 'HACCP · Sonoff/Zigbee', purpose: 'Remonter des mesures de capteurs vers l’instance locale.', actions: 'Installer les services IoT prévus, appairer la sonde, l’associer à l’équipement physique, tester une mesure et une alerte puis conserver une procédure manuelle.' },
  ],
  finance: [
    { title: 'Tableau de bord', purpose: 'Lire le cockpit financier et la trajectoire de l’exercice.', actions: 'Choisir le périmètre établissement, contrôler la période et ouvrir l’indicateur qui demande une explication.' },
    { title: 'Ventes & affluence', purpose: 'Analyser CA TTC, transactions, ticket moyen, heures, jours, produits et catégories.', actions: 'Comparer les périodes, vérifier la couverture produit et les doublons écartés, puis rapprocher l’affluence de l’effectif planifié si disponible.' },
    { title: 'Analyse annuelle', purpose: 'Comparer le réalisé cumulé au budget cumulé des mêmes mois.', actions: 'Lire les indicateurs, le réel vs budget et le rapprochement caisse/comptabilité sans extrapoler les mois non engagés.' },
    { title: 'Analyse mensuelle', purpose: 'Étudier un mois et ses comparaisons.', actions: 'Vérifier si la période est clôturée dans Fennoa ou encore provisoire côté caisse avant d’interpréter l’écart.' },
    { title: 'Analyse journalière', purpose: 'Piloter le jour, les objectifs et les écarts disponibles.', actions: 'Contrôler fraîcheur et source ; comparer à N-1 seulement si une période comparable existe.' },
    { title: 'Budget & trajectoire', purpose: 'Lire le scénario, les lignes mensuelles et objectifs de référence.', actions: 'Importer ou synchroniser le budget, puis contrôler ses dates et ses huit indicateurs avant comparaison.' },
    { title: 'Sources & qualité', purpose: 'Configurer Fennoa, Flatpay, Loyverse, PayPal POS/Zettle ou des imports génériques.', actions: 'Tester les connexions, rattacher au site, choisir le POS principal et surveiller statut, couverture, imports et doublons.' },
    { title: 'Import documentaire', purpose: 'Analyser PDF, image, XLS/XLSX ou CSV et conserver le fichier source.', actions: 'Rattacher au bon établissement ; relire les périodes, signes, unités et totaux. Sans clé Mistral, les tableurs restent lisibles mais les images/PDF passent à contrôler.' },
    { title: 'Analyste Mistral', purpose: 'Produire des signaux et actions à partir d’agrégats financiers vérifiés.', actions: 'Lancer l’analyse sur la vue utile, puis lire aussi les limites de couverture ; ne pas prendre le texte généré pour une écriture comptable.' },
    { title: 'Exports PDF', purpose: 'Créer des rapports professionnels avec KPI, graphiques, tableaux, sources et limites.', actions: 'Choisir synthèse annuelle, annuel, mensuel, journalier ou ventes, définir la période et le site puis vérifier le document généré.' },
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
    { title: 'Google Drive', purpose: 'Configurer le stockage distant actuellement pris en charge.', actions: 'Configurer OAuth, connecter le compte, tester l’accès, envoyer une sauvegarde choisie et contrôler son statut ; conserver les accès côté administration.' },
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
  'ocr-stocks': { when: 'Pour reprendre un catalogue, préparer un inventaire ou analyser un document d’achat.', prerequisites: ['Site configuré.', 'Fichier structuré ou document lisible.', 'Personne chargée de la revue.'], steps: ['Choisir catalogue, inventaire ou OCR documentaire.', 'Importer le CSV/XLSX/XML accepté ou déposer le document.', 'Contrôler le mapping des colonnes ou les lignes extraites.', 'Rapprocher les produits et traiter doublons, unités et conditionnements ambigus.', 'Sélectionner uniquement les lignes prêtes.', 'Conserver l’inventaire en brouillon ou valider la réception après contrôle physique.'], checks: ['Chaque ligne pointe vers le bon produit.', 'Le site et le fournisseur sont corrects.', 'Aucun stock réel ne change avant la validation prévue.'], result: 'L’import accélère la préparation tout en conservant une validation humaine avant l’effet métier.', pitfalls: ['Envoyer un classeur structuré à l’OCR au lieu de le lire directement.', 'Valider toutes les lignes sans examiner les doublons et avertissements.'] },
  marges: { when: 'Pour analyser une hausse de coût, fixer un prix ou préparer une décision fournisseur.', prerequisites: ['Prix d’achat actualisés par les réceptions.', 'Fiches techniques reliées aux produits.'], steps: ['Choisir le produit, fournisseur ou la période à analyser.', 'Comparer coût courant et historique.', 'Consulter les tendances de cotation lorsque disponible.', 'Identifier si la variation provient du marché, du fournisseur ou de la saisie.', 'Mettre à jour le prix source si nécessaire.', 'Recalculer les fiches techniques concernées et partager la décision.'], checks: ['Le prix analysé provient d’une réception réelle.', 'La période de comparaison est comparable.'], result: 'La décision économique s’appuie sur des coûts vérifiables.', pitfalls: ['Prendre une cotation de marché pour un prix de facture.', 'Modifier une marge sans actualiser le coût matière.'] },
  'fiches-techniques': { when: 'Pour standardiser une préparation ou mettre à jour une recette existante.', prerequisites: ['Produits Stocks actifs.', 'Catégories de recettes prêtes.'], steps: ['Créer ou ouvrir la fiche.', 'Définir portions de référence et catégorie.', 'Ajouter chaque ingrédient depuis Stocks avec sa quantité.', 'Rédiger les étapes de réalisation dans l’ordre réel.', 'Vérifier allergènes et coût matière.', 'Simuler d’autres volumes si nécessaire.', 'Dupliquer avant une variation majeure, puis archiver l’ancienne version au besoin.'], checks: ['Tous les ingrédients pointent vers le bon produit.', 'La portion de référence est réaliste.', 'Le coût est recalculé après changement de prix.'], result: 'La recette est reproductible, chiffrée et exploitable par Production et Menus.', pitfalls: ['Écrire un ingrédient libre au lieu de le sélectionner dans Stocks.', 'Écraser une recette historique au lieu de la dupliquer.'] },
  production: { when: 'Pour transformer un besoin de fabrication en travail planifié pour la brigade.', prerequisites: ['Fiche technique active ou source Menus/Traiteur.', 'Site de production.', 'Services et collaborateurs RH si des affectations nominatives sont attendues.'], steps: ['Créer ou ouvrir la campagne de fabrication.', 'Vérifier quantité cible, date, opérations et besoins matières.', 'Affecter le service et valider la campagne.', 'Ouvrir le planning opérationnel.', 'Placer les tâches en attente sur un horaire ou les créer depuis une fiche, une étape, un menu ou un modèle.', 'Affecter les personnes et ajuster la durée.', 'Faire évoluer les statuts au fil de l’exécution et documenter les blocages.'], checks: ['La campagne et la tâche ne sont pas confondues.', 'Le site, le service et les quantités sont cohérents.', 'Les éléments encore sans horaire restent visibles dans la file.'], result: 'Le besoin culinaire devient une campagne suivie et un ensemble de tâches planifiées, reliées à leurs sources.', pitfalls: ['Planifier une tâche avant de valider sa quantité ou son site.', 'Créer une tâche manuelle qui duplique une fabrication déjà générée.'] },
  menus: { when: 'Pour organiser une carte, un service collectif, un événement ou une production centralisée.', prerequisites: ['Profil d’activité choisi.', 'Stocks, Fiches Techniques et Production installés/configurés selon le parcours.'], steps: ['Choisir ou confirmer le profil d’activité.', 'Construire la carte, le menu, le cycle ou le dossier événementiel avec les références existantes.', 'Renseigner disponibilité, convives, client, logistique ou site de distribution selon le profil.', 'Contrôler quantités, allergènes, statuts et alertes bloquantes.', 'Valider ou publier la version attendue.', 'Préparer les manques ou générer les fabrications.', 'Suivre le passage dans Production et conserver les documents/historiques.'], checks: ['Aucun produit ou recette n’est recréé dans Menus.', 'Le profil correspond aux écrans utilisés par l’équipe.', 'Les volumes sont validés avant génération.'], result: 'Chaque type d’activité dispose d’un parcours adapté tout en partageant les mêmes référentiels et la même production.', pitfalls: ['Former l’équipe avant d’avoir fixé le profil.', 'Utiliser un menu collectif pour gérer un dossier traiteur complet.'] },
  haccp: { when: 'Lors de la configuration du PMS, à chaque contrôle terrain et à toute alerte.', prerequisites: ['Équipements, zones, produits et seuils configurés sur le web.', 'Application mobile connectée pour la brigade.', 'Procédures de l’établissement connues.'], steps: ['Configurer le socle HACCP dans ToqueHub web.', 'Appairer et tester les capteurs si le périmètre IoT est actif.', 'Réaliser les contrôles quotidiens dans l’application mobile.', 'Enregistrer immédiatement mesure, non-conformité, correction et preuve.', 'Surveiller alertes et courbes depuis le web.', 'Contrôler les registres synchronisés et le rapport PDF quotidien.', 'Corriger les informations incomplètes dans leur parcours source.'], checks: ['Chaque alerte reçoit une vérification terrain.', 'La file mobile est synchronisée.', 'Le rapport reprend les contrôles réellement effectués.'], result: 'Le web, le mobile et les capteurs composent un dossier sanitaire continu et consultable.', pitfalls: ['Saisir de mémoire en fin de journée.', 'Considérer un capteur ou un PDF comme un remplacement de l’action corrective.'] },
  rh: { when: 'À la création d’une structure, à l’arrivée, l’évolution ou au départ d’un collaborateur.', prerequisites: ['Services validés.', 'Postes structurés par service.'], steps: ['Terminer l’assistant de structure.', 'Créer services puis postes.', 'Créer la fiche collaborateur.', 'Associer service, poste, responsable et statut.', 'Lier un compte utilisateur uniquement si la personne doit accéder à ToqueHub.', 'Ajouter les documents et formations selon les droits.', 'Mettre à jour l’organigramme et archiver plutôt que supprimer lors d’un départ.'], checks: ['La personne existe une seule fois.', 'Les documents sensibles restent accessibles aux seuls rôles autorisés.'], result: 'RH devient la référence des personnes utilisée par Planning et Production.', pitfalls: ['Créer un compte utilisateur sans fiche collaborateur lorsque la liaison est requise.', 'Supprimer un historique de départ.'] },
  planning: { when: 'Pour préparer, contrôler, publier puis clôturer une période de travail.', prerequisites: ['Planning installe automatiquement RH lorsque nécessaire.', 'Avant la première publication : au moins un service, un poste et un collaborateur actif correctement rattaché.', 'Créneaux, règles et disponibilités configurés.'], steps: ['Choisir la période et consulter son état.', 'Saisir absences et besoins opérationnels.', 'Créer les affectations ou appliquer un modèle après prévisualisation.', 'Traiter les conflits et proposer un remplacement si nécessaire.', 'Contrôler heures, alertes et coûts estimés.', 'Publier la période une fois validée.', 'Verrouiller après diffusion pour préparer les exports ou la paie.'], checks: ['Absences et besoins sont intégrés.', 'Les conflits ouverts ont une décision.', 'La période publiée est celle réellement diffusée.'], result: 'Le planning est cohérent, communicable et traçable.', pitfalls: ['Modifier une période verrouillée sans décision formelle.', 'Appliquer une rotation sans prévisualisation.'] },
  utilisateurs: { when: 'À chaque arrivée, changement de mission ou départ d’une personne ayant un accès.', prerequisites: ['Fiche RH si la personne est collaborateur.', 'Rôle cible défini.'], steps: ['Créer ou inviter le compte.', 'Associer la fiche collaborateur si applicable.', 'Attribuer le rôle minimal nécessaire.', 'Vérifier les permissions sensibles.', 'Tester l’accès avec la personne ou par contrôle administrateur.', 'Désactiver ou ajuster le compte dès la fin de mission.'], checks: ['Un compte correspond à une personne.', 'Aucun droit d’administration n’est accordé par confort.'], result: 'Chaque action est attribuable et l’accès est proportionné au besoin.', pitfalls: ['Partager des identifiants.', 'Conserver un accès après un départ.'] },
  architecture: { when: 'Avant d’activer un module, modifier un référentiel ou préparer une évolution.', prerequisites: ['Accès administrateur.', 'Périmètre de la décision identifié.'], steps: ['Ouvrir la vue globale pour identifier les modules concernés.', 'Consulter les données propriétaires dans Data Map.', 'Lire les relations et l’impact avant toute décision.', 'Identifier un éventuel doublon à sa source.', 'Vérifier l’état du module et la roadmap.', 'Préparer une sauvegarde et une communication avant intervention.'], checks: ['La donnée existe déjà ou non dans un module propriétaire.', 'Les conséquences sur les modules dépendants sont comprises.'], result: 'Les évolutions limitent les doublons et les effets de bord.', pitfalls: ['Modifier une donnée partagée sans vérifier ses dépendances.'] },
  achats: { when: 'Pour commander, envoyer et réceptionner un approvisionnement fournisseur.', prerequisites: ['Fournisseurs et produits Stocks prêts.', 'Si ToqueHub expédie le bon : Google Workspace/Gmail, Microsoft 365/Outlook, SMTP ou Resend connecté, testé et actif.'], steps: ['Terminer le guide de configuration.', 'Dans Messagerie fournisseur, connecter la voie d’envoi autorisée, lancer le test et l’activer.', 'Créer une commande avec ses lignes et quantités.', 'Contrôler fournisseur, adresses, prix, destinataire et aperçu PDF.', 'Envoyer ou conserver le brouillon selon le circuit choisi.', 'Vérifier le statut de la tentative et la confirmation fournisseur.', 'Créer une réception, accepter les quantités réelles, expliquer les écarts et valider.', 'Clôturer la commande après traitement des réceptions partielles.'], checks: ['Le bon fournisseur et le bon destinataire sont sélectionnés.', 'La connexion active correspond à l’adresse d’envoi attendue.', 'Le PDF joint a été relu.', 'Les écarts sont expliqués avant validation.', 'Les mouvements de stock proviennent d’une réception validée.'], result: 'Le cycle achat, son envoi et ses réceptions restent reliés aux Stocks et historisés de bout en bout.', pitfalls: ['Confondre une connexion enregistrée avec une connexion testée et active.', 'Envoyer une commande sans relire son PDF.', 'Clôturer malgré une réception partielle non traitée.'] },
  integrations: { when: 'Lors de la première connexion d’un service externe, d’un changement de compte ou d’un incident de synchronisation.', prerequisites: ['Droits adaptés au module et à l’administration.', 'Identifiants, clé API ou consentement OAuth du service.', 'Périmètre organisation/site connu.'], steps: ['Choisir le connecteur correspondant au besoin réel.', 'Configurer la connexion sans exposer le secret à un utilisateur non autorisé.', 'Pour OAuth, terminer le parcours chez le fournisseur puis revenir dans ToqueHub.', 'Lancer le test proposé et lire le message de résultat.', 'Activer la connexion ou la rattacher au bon site seulement après succès.', 'Réaliser une opération témoin : e-mail, synchronisation, OCR, cotation, sauvegarde ou mesure.', 'Contrôler la trace, la date, le périmètre et le résultat métier.', 'Documenter le mode manuel de secours puis surveiller les erreurs.'], checks: ['Le compte connecté est celui de l’établissement.', 'Le site et le fournisseur sélectionnés sont corrects.', 'Aucun secret n’est copié dans un document partagé.', 'Le fonctionnement de secours est connu.'], result: 'L’intégration est explicite, testée, rattachée au bon périmètre et réversible sans perdre le parcours manuel.', pitfalls: ['Activer une connexion sans test.', 'Additionner deux sources Finance qui couvrent les mêmes ventes.', 'Prendre une suggestion Mistral ou RNM pour une donnée validée.', 'Confondre Gmail Achats et Google Drive Sauvegardes.'] },
  finance: { when: 'Pour consolider les chiffres, comprendre une variation ou préparer un rapport de direction.', prerequisites: ['Sources connectées ou fichiers disponibles.', 'Rattachement correct de chaque source à un établissement.', 'Permissions Finance adaptées.'], steps: ['Connecter ou importer les sources.', 'Tester leur accès puis lancer les synchronisations nécessaires.', 'Contrôler période, statut, couverture, rattachement et doublons.', 'Définir le POS principal et les sources incluses dans le CA.', 'Lire le cockpit puis approfondir dans la vue annuelle, mensuelle, journalière, ventes ou budget.', 'Utiliser l’analyste Mistral si configuré, en conservant les limites affichées.', 'Générer et relire le PDF adapté avant diffusion.'], checks: ['Fennoa et la caisse ne sont pas additionnés en double.', 'La période comparée possède une couverture suffisante.', 'Le périmètre site ou organisation est explicite.'], result: 'Les indicateurs et rapports restent rapprochables de leurs fichiers, connecteurs, périodes et règles de consolidation.', pitfalls: ['Prendre un chiffre provisoire de caisse pour une clôture comptable.', 'Diffuser une analyse sans sa couverture ni ses sources.'] },
  mobile: { when: 'Pour réaliser un contrôle HACCP sur le terrain avec ou sans réseau temporaire.', prerequisites: ['Application installée.', 'Serveur connu et compte autorisé.'], steps: ['Découvrir ou saisir le serveur puis se connecter.', 'Vérifier le tableau HACCP et l’état de synchronisation.', 'Réaliser le contrôle dans l’écran correspondant.', 'Ajouter mesures, lots, photos et corrections immédiatement.', 'Si hors ligne, poursuivre sans désinstaller l’application.', 'Reconnecter l’appareil et vérifier que toutes les opérations sont synchronisées.', 'Générer ou consulter le rapport une fois les contrôles terminés.'], checks: ['L’équipement est relié au bon serveur.', 'La file hors ligne est vide après synchronisation.'], result: 'Les actions terrain restent tracées même pendant une coupure de réseau.', pitfalls: ['Supposer qu’une saisie hors ligne est arrivée au serveur sans vérifier.', 'Supprimer l’application avant synchronisation.'] },
  sauvegardes: { when: 'Avant mise à jour, changement technique, incident ou à fréquence planifiée.', prerequisites: ['Droits administrateur.', 'Emplacement de sauvegarde validé.', 'Compte Google Drive autorisé si la copie distante est utilisée.'], steps: ['Vérifier les dernières sauvegardes.', 'Créer une sauvegarde avant une opération à risque.', 'La télécharger ou connecter Google Drive par OAuth, tester la connexion puis envoyer la sauvegarde choisie.', 'Contrôler le statut et l’identifiant de la copie distante.', 'Documenter date et raison de la sauvegarde.', 'En cas d’incident, diagnostiquer avant restauration.', 'Restaurer uniquement une sauvegarde identifiée et validée.', 'Vérifier l’accès, les données et les services après restauration.'], checks: ['La sauvegarde existe et peut être identifiée.', 'La copie Google Drive est confirmée si ce canal est requis.', 'Une restauration est testée selon la procédure prévue.'], result: 'La continuité de l’instance est préparée et les restaurations locales ou copiées vers Google Drive sont maîtrisées.', pitfalls: ['Mettre à jour sans sauvegarde.', 'Supposer qu’une connexion Drive suffit sans contrôler l’envoi du fichier.', 'Restaurer une date non vérifiée en production.'] },
  iot: { when: 'Lors du déploiement ou de la maintenance de capteurs HACCP.', prerequisites: ['Serveur local opérationnel.', 'Capteurs, réseau et emplacements préparés.'], steps: ['Installer/configurer les services IoT autorisés.', 'Appairer chaque capteur.', 'Nommer et associer le capteur au bon équipement.', 'Définir ou vérifier les seuils de l’équipement.', 'Tester une remontée et une alerte.', 'Prévoir le relevé manuel de secours.', 'Contrôler périodiquement l’état en ligne des capteurs.'], checks: ['Chaque capteur est physiquement identifiable.', 'Une alerte test a été reçue et traitée selon la procédure.'], result: 'Les capteurs complètent les contrôles HACCP sans devenir un point de défaillance unique.', pitfalls: ['Se fier à une sonde sans vérification initiale.', 'Ne pas prévoir de procédure manuelle.'] },
  parcours: { when: 'Lors de l’adoption progressive de ToqueHub dans un établissement.', prerequisites: ['Référent métier nommé pour chaque domaine.', 'Temps de formation et données de départ disponibles.'], steps: ['Installer et sécuriser les accès.', 'Utiliser la visite guidée pour préparer le socle Stocks, Fiches Techniques et HACCP.', 'Configurer Stocks et construire les référentiels avec un périmètre pilote.', 'Créer les fiches techniques essentielles.', 'Passer à Production puis choisir le profil Menus adapté.', 'Mettre progressivement en service les routines HACCP web/mobile.', 'Structurer RH avant Planning.', 'Activer Achats puis Finance lorsque les référentiels et sources sont fiables.', 'Ajouter IoT et connecteurs externes selon la maturité.', 'Mesurer les écarts et améliorer les procédures.'], checks: ['Chaque étape possède un responsable.', 'Les données de l’étape précédente sont validées avant la suivante.', 'Un module installé n’est mis en production qu’après configuration et formation.'], result: 'Le déploiement reste progressif et les modules reposent sur des données fiables.', pitfalls: ['Activer tous les modules sans référentiels ni formation.', 'Recréer les mêmes données dans plusieurs modules.'] },
};
