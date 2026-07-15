# Plan — Refonte complète de l’onboarding et du dashboard vide ToqueHub

## 1. Vision générale

Refondre le premier démarrage pour donner l’impression d’installer un véritable environnement professionnel ToqueHub : rapide, premium, clair et rassurant.

Le parcours devra :

- rester centré sur l’essentiel ;
- inclure la création complète du compte administrateur ;
- configurer l’établissement en quelques écrans ;
- persister les informations d’organisation en base ;
- éviter toute impression d’écran vide après la première connexion ;
- utiliser Material UI, les composants existants lorsque possible, les couleurs ToqueHub et des animations légères avec Framer Motion.

---

## 2. Parcours d’onboarding cible

Le premier démarrage deviendra un parcours guidé en plein écran, moderne et centré.

### Étape 1 — Bienvenue

Objectif : poser immédiatement l’image premium et professionnelle de ToqueHub.

Contenu :

- Titre :  
  **Bienvenue sur ToqueHub**
- Sous-titre :  
  **La plateforme open source conçue pour les cuisines professionnelles.**  
  **Configurez votre environnement en moins d’une minute.**
- Visuel moderne : illustration, icône ou composition graphique autour de l’idée de cuisine professionnelle connectée.
- Bouton principal :  
  **Commencer**

Comportement :

- Le clic sur **Commencer** ouvre l’étape de création administrateur.
- L’écran doit être centré, responsive et très soigné visuellement.

---

### Étape 2 — Création du compte administrateur

Objectif : inclure le bootstrap administrateur dans le même parcours, comme demandé, tout en conservant les champs complets existants.

Champs à demander :

- Pseudo
- Prénom
- Nom
- Email
- Mot de passe
- Confirmation du mot de passe

Comportement attendu :

- Validation des champs obligatoires.
- Vérification de la correspondance entre mot de passe et confirmation.
- Conservation d’un indicateur de robustesse du mot de passe.
- L’utilisateur ne doit pas ressentir cette étape comme technique : elle doit être présentée comme la création du compte pilote de l’environnement.

Texte d’intention possible :

- Titre :  
  **Créez votre compte administrateur**
- Texte :  
  **Ce compte vous permettra de piloter votre environnement ToqueHub.**

Navigation :

- Boutons :
  - **Retour**
  - **Continuer**

---

### Étape 3 — Création de l’établissement

Objectif : créer l’identité principale de l’organisation.

Contenu :

- Titre :  
  **Parlez-nous de votre établissement**

Champ obligatoire :

- **Nom de l’établissement**
- Placeholder :  
  **Exemple : EHPAD Les Tilleuls**

Champ optionnel :

- **Type d’établissement**

Liste déroulante :

- Restaurant
- EHPAD
- Collectivité
- Hôtel
- Traiteur
- Cuisine centrale
- Autre

Boutons :

- **Retour**
- **Continuer**

Validation :

- Le nom de l’établissement est obligatoire.

Persistance :

- Le nom de l’établissement est stocké dans l’organisation.
- Le type d’établissement est stocké dans l’organisation lorsqu’il est renseigné.

---

### Étape 4 — Taille de l’équipe

Objectif : adapter l’environnement sans créer d’employés à ce stade.

Contenu :

- Titre :  
  **Combien de personnes travaillent dans votre cuisine ?**
- Texte :  
  **Cette information nous aide à mieux adapter votre environnement.**

Choix sous forme de cartes :

- 1 à 5 personnes
- 6 à 10 personnes
- 11 à 20 personnes
- Plus de 20 personnes

Comportement :

- Une seule carte peut être sélectionnée.
- Le choix est stocké dans l’organisation.
- Aucun employé n’est créé pendant cette étape.

Boutons :

- **Retour**
- **Continuer**

---

### Étape 5 — Personnalisation

Objectif : donner une sensation d’environnement personnalisé sans rendre l’étape bloquante.

Contenu :

- Titre :  
  **Votre environnement est presque prêt**

Zone de dépôt :

- **Logo de l’établissement**
- Optionnel

Texte secondaire :

- **Vous pourrez modifier cette information plus tard.**

Boutons :

- **Ignorer**
- **Créer mon environnement**

Comportement :

- Le logo est optionnel.
- Si fourni, il est persisté avec l’organisation.
- Si ignoré, l’environnement est créé sans logo.
- La zone de dépôt doit être visuelle, rassurante et compatible mobile.

---

### Étape 6 — Création de l’environnement

Objectif : transformer l’attente technique en moment premium.

Contenu :

- Écran de chargement élégant.
- Animation légère.
- Étapes affichées progressivement :

  - ✓ Création de l’organisation
  - ✓ Création du site principal
  - ✓ Configuration de l’administrateur
  - ✓ Finalisation

Comportement :

- Création effective du compte administrateur.
- Création effective de l’organisation.
- Association de l’administrateur à l’organisation.
- Enregistrement du type d’établissement, de la taille d’équipe et du logo si fournis.
- Création ou initialisation du site principal selon le modèle fonctionnel retenu par ToqueHub.
- Redirection automatique vers le dashboard lorsque tout est terminé.

Gestion des erreurs :

- Si une erreur survient, afficher un message clair et non technique.
- Permettre à l’utilisateur de revenir ou de réessayer sans perdre les informations déjà saisies dans le parcours.

---

## 3. Données à persister

Les informations suivantes devront être enregistrées durablement :

### Compte administrateur

- Pseudo
- Prénom
- Nom
- Email
- Mot de passe sécurisé
- Rôle administrateur principal

### Organisation

- Nom de l’établissement
- Type d’établissement
- Taille d’équipe
- Logo de l’établissement
- Informations nécessaires au rattachement de l’administrateur

### Site principal

- Un site principal doit être initialisé dans le parcours de création, conformément à l’expérience affichée à l’utilisateur.
- Il doit représenter le point de départ opérationnel de l’établissement.

---

## 4. Expérience visuelle de l’onboarding

### Direction artistique

Le rendu doit évoquer :

- Linear pour la précision et la sobriété ;
- Notion pour la clarté ;
- Stripe pour le polish visuel ;
- Vercel pour la modernité et les transitions fluides.

### Principes UI

- Plein écran.
- Interface centrée.
- Cartes nettes, espacées, premium.
- Hiérarchie typographique forte.
- Beaucoup d’espace blanc.
- Dégradés subtils et surfaces légères.
- Icônes modernes.
- États de sélection clairs.
- Transitions douces entre étapes.

### Animations

Utiliser Framer Motion pour :

- transitions entre étapes ;
- apparition progressive des cartes ;
- feedback de sélection ;
- animation de l’écran de création ;
- micro-interactions sur les boutons et cartes.

Les animations doivent rester légères, rapides et professionnelles.

---

## 5. Dashboard vide cible

Le dashboard après onboarding ne doit jamais sembler vide, même sans application installée.

Il devient une page d’accueil moderne orientée démarrage.

---

### Bandeau supérieur

Contenu :

- Message :  
  **Bonjour {Prénom} 👋**
- Sous-message :  
  **Bienvenue dans {NomEtablissement}**  
  **Votre environnement est prêt.**
- Badge :  
  **0 application installée**

Comportement :

- Utiliser le prénom de l’administrateur.
- Utiliser le nom de l’établissement configuré pendant l’onboarding.
- Si le prénom est indisponible, prévoir un fallback élégant.

---

### Carte principale

Grande carte centrale.

Contenu :

- Titre :  
  **Commencez à construire votre environnement**
- Texte :  
  **Installez votre première application pour débloquer les fonctionnalités de ToqueHub.**
- Bouton :  
  **Explorer les applications**

Comportement :

- Le bouton guide vers la section Applications du dashboard.
- L’expérience doit donner une direction claire sans bloquer l’utilisateur.

---

### Section Applications

Afficher une grille de cartes modernes.

#### Carte 1 — Stocks

- Icône : 📦
- Titre : **Stocks**
- Description :  
  **Gestion des stocks, inventaires et mouvements.**
- Statut :  
  **Disponible**
- Bouton :  
  **Installer**

Comportement :

- C’est la première application réellement installable.
- Le bouton doit être actif.

#### Carte 2 — Recettes

- Icône : 🧾
- Titre : **Recettes**
- Description :  
  **Fiches techniques et calculs de coûts.**
- Badge :  
  **Bientôt disponible**

#### Carte 3 — Production

- Icône : 👨‍🍳
- Titre : **Production**
- Description :  
  **Planification et suivi de production.**
- Badge :  
  **Bientôt disponible**

#### Carte 4 — HACCP

- Icône : 🧊
- Titre : **HACCP**
- Description :  
  **Traçabilité et contrôle qualité.**
- Badge :  
  **Bientôt disponible**

#### Carte 5 — Achats

- Icône : 🛒
- Titre : **Achats**
- Description :  
  **Commandes fournisseurs et réceptions.**
- Badge :  
  **Bientôt disponible**

---

### Section progression

Ajouter une carte :

- Titre :  
  **Votre progression**

Checklist initiale :

- □ Installer une application
- □ Créer votre premier produit
- □ Ajouter un fournisseur
- □ Effectuer un mouvement de stock

Progression initiale :

- **0%**

Comportement attendu :

- La progression évolue automatiquement selon les actions de l’utilisateur.
- Les actions déjà effectuées doivent se cocher automatiquement.
- La barre de progression reflète le nombre d’actions complétées.

Règles de progression :

- Application installée : coche **Installer une application**
- Au moins un produit créé : coche **Créer votre premier produit**
- Au moins un fournisseur créé : coche **Ajouter un fournisseur**
- Au moins un mouvement de stock effectué : coche **Effectuer un mouvement de stock**

---

## 6. Installation de l’application Stocks

Le dashboard introduit la notion d’applications installables.

Pour cette refonte :

- **Stocks** est disponible.
- Les autres applications sont affichées comme à venir.
- L’installation de Stocks doit faire évoluer le badge du dashboard.
- Après installation, l’utilisateur doit comprendre qu’il peut commencer à gérer ses produits, fournisseurs et mouvements.

Comportement recommandé :

- Avant installation : dashboard d’accueil avec appel à installer.
- Après installation : accès aux fonctionnalités Stocks existantes, dans une présentation cohérente avec le nouveau design.
- Le badge passe de **0 application installée** à **1 application installée**.

---

## 7. Modernisation des fonctionnalités existantes

Les fonctionnalités de gestion déjà présentes ne doivent pas disparaître.

Elles doivent être intégrées dans l’expérience post-installation de Stocks :

- catégories ;
- unités ;
- produits ;
- fournisseurs ;
- niveaux de stock ;
- mouvements de stock.

Objectif :

- éviter de tout afficher brutalement dès le premier dashboard ;
- transformer l’interface actuelle en expérience modulaire ;
- conserver les capacités existantes tout en les rendant plus professionnelles.

---

## 8. Responsive design

Le parcours doit être pleinement utilisable sur :

- mobile ;
- tablette ;
- desktop.

Principes :

- Une colonne sur mobile.
- Cartes empilées sur petits écrans.
- Grilles adaptatives sur desktop.
- Boutons facilement accessibles au pouce sur mobile.
- Aucun contenu critique ne doit déborder horizontalement.

---

## 9. États et cas particuliers

### Instance déjà initialisée

Si l’instance dispose déjà d’un administrateur ou d’une organisation :

- ne pas permettre de recréer un bootstrap initial ;
- afficher une expérience claire ;
- proposer la connexion.

### Session administrateur existante sans organisation

Si un administrateur existe mais n’a pas encore terminé la configuration :

- reprendre le parcours à l’étape établissement ;
- ne pas redemander inutilement les informations administrateur déjà créées.

### Erreurs de création

En cas d’erreur :

- afficher un message clair ;
- ne pas exposer de détails techniques ;
- conserver les champs renseignés ;
- permettre de réessayer.

### Logo non fourni

Si aucun logo n’est déposé :

- continuer normalement ;
- utiliser une représentation visuelle par défaut de l’établissement.

---

## 10. Qualité attendue

Avant validation finale :

- vérifier que l’onboarding complet fonctionne de bout en bout ;
- vérifier la validation des champs obligatoires ;
- vérifier la persistance du type d’établissement, de la taille d’équipe et du logo ;
- vérifier la création de l’administrateur ;
- vérifier l’association administrateur / organisation ;
- vérifier la redirection automatique vers le dashboard ;
- vérifier que le dashboard n’est jamais vide ;
- vérifier la progression initiale à 0% ;
- vérifier l’évolution automatique de la progression ;
- vérifier le comportement mobile et desktop ;
- vérifier que Material UI reste la base visuelle ;
- vérifier que les animations Framer Motion restent sobres et fluides.

---

## 11. Résultat attendu

À la fin de la refonte, ToqueHub doit donner l’impression d’un ERP nouvelle génération pour cuisines professionnelles :

- onboarding rapide ;
- image premium dès le premier écran ;
- configuration claire et rassurante ;
- dashboard accueillant même vide ;
- applications présentées comme un environnement modulaire ;
- progression guidée pour aider l’utilisateur à démarrer ;
- expérience cohérente avec un produit professionnel, open source et moderne.
