<p align="center">
  <img src="./docs/assets/toquehub-logo-wide.png" alt="ToqueHub" width="520" />
</p>

<p align="center">
  <strong>Le système d'exploitation open source des cuisines professionnelles.</strong><br />
  Stocks, achats, production, menus, HACCP, RH, planning et pilotage financier dans une plateforme locale et modulaire.
</p>

<p align="center">
  <img alt="Licence AGPL-3.0" src="https://img.shields.io/badge/licence-AGPL--3.0-10b981?style=for-the-badge" />
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-20.11+-0f766e?style=for-the-badge" />
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-14+-1f6f43?style=for-the-badge" />
  <img alt="Mobile" src="https://img.shields.io/badge/Expo-Mobile-a88e6a?style=for-the-badge" />
</p>

---

## Sommaire

- [Vision](#vision)
- [Périmètre fonctionnel](#périmètre-fonctionnel)
- [Modules métier](#modules-métier)
- [Fonctionnalités transversales](#fonctionnalités-transversales)
- [Relations entre les modules](#relations-entre-les-modules)
- [Intégrations](#intégrations)
- [Application mobile](#application-mobile)
- [Sécurité, confidentialité et traçabilité](#sécurité-confidentialité-et-traçabilité)
- [Architecture et stack](#architecture-et-stack)
- [Installation](#installation)
- [Scripts utiles](#scripts-utiles)
- [Documentation](#documentation)

## Vision

ToqueHub remplace les tableurs, classeurs HACCP, exports isolés et applications métier dispersées par un ERP modulaire pensé pour les restaurants, cafés, hôtels, traiteurs, cuisines centrales, EHPAD et collectivités.

La plateforme est **self-hosted** et **locale par défaut**. Les produits, unités, fournisseurs, sites, emplacements, collaborateurs et droits sont partagés entre les modules afin d'éviter les doubles saisies et les référentiels concurrents.

Principes du produit :

- **Local-first** : l'organisation garde son instance, sa base, ses documents et ses sauvegardes.
- **Modulaire** : chaque application métier peut être installée séparément tout en réutilisant le socle commun.
- **Multi-établissement** : les données opérationnelles peuvent être rattachées à un site précis puis filtrées ou consolidées.
- **Traçable** : mouvements, corrections, validations, sources, imports et historiques restent contrôlables.
- **Terrain d'abord** : vues opérationnelles, application mobile, mode hors ligne, capteurs et impression d'étiquettes.
- **Assisté, pas automatisé à l'aveugle** : l'OCR et l'IA proposent ou analysent ; les actions sensibles restent confirmées par un utilisateur.

## Périmètre fonctionnel

| Domaine                    | Statut                            | Finalité                                                                                                    |
| -------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Core & Dashboard**       | Disponible                        | Authentification, onboarding, organisation, établissements, catalogue d'applications et pilotage quotidien. |
| **Stocks & Marges**        | Disponible                        | Référentiel produits, quantités, mouvements, inventaires, lots, équipements, OCR et rentabilité matière.    |
| **Cours des produits**     | Disponible                        | Consultation des cotations RNM FranceAgriMer, tendances, historiques et favoris.                            |
| **Fiches Techniques**      | Disponible                        | Recettes, ingrédients, allergènes, coûts, historique, simulations et exports.                               |
| **Achats**                 | Disponible                        | Suggestions, commandes fournisseurs, envoi, bons de livraison, écarts et réceptions Stocks.                 |
| **Production**             | Disponible                        | Ordres et tâches de fabrication, besoins, équipes, exécution, traçabilité et déstockage.                    |
| **Menus**                  | Disponible                        | Menus planifiés, cycles, régimes, convives, cuisine centrale, traiteur et génération Production.            |
| **HACCP**                  | Disponible                        | Températures, capteurs, réceptions, procédés, huiles, nettoyage, traçabilité et rapports.                   |
| **RH**                     | Disponible                        | Collaborateurs, services, postes, organigramme, documents, contrats et compteurs temps.                     |
| **Planning**               | Disponible                        | Affectations, présences, besoins, absences, remplacements, modèles, rotations et publication.               |
| **Droits RH & conformité** | Disponible, base pays progressive | Référentiel juridique versionné, profils salariés, calculs auditables et contrôles Planning.                |
| **Finance**                | Disponible                        | Lecture de la situation financière, budget, ventes, affluence, imports et rapprochement multi-sources.      |
| **Assistants IA & OCR**    | Disponible si configuré           | Analyse documentaire et assistants Stocks, Fiches Techniques, HACCP et Finance avec Mistral.                |
| **Application mobile**     | Workspace compagnon               | HACCP terrain, synchronisation hors ligne, découverte locale, notifications et étiquettes Brother.          |

## Modules métier

### Core, organisation et tableau de bord

Le socle Core organise l'instance et donne accès aux applications installées.

- création du premier administrateur, de l'organisation et du premier établissement ;
- onboarding guidé et suivi de la progression du workspace ;
- authentification JWT, profils utilisateurs, rôles et permissions modifiables ;
- activation, désactivation et rattachement des comptes aux collaborateurs RH ;
- catalogue d'applications avec installation et retrait sans suppression des données métier ;
- organisation multi-établissement et identité réglementaire par pays ;
- dashboard personnalisable et pilotage du jour ;
- préchargement en arrière-plan du module Finance lorsqu'il est installé ;
- paramétrage des clés d'intégration et de l'accès distant ;
- statut de l'instance, version, changelog et mise à jour depuis l'interface.

### Stocks & Marges

Stocks est le référentiel physique central de ToqueHub.

**Référentiels**

- produits et articles, consommables et équipements ;
- catégories, unités et conversions d'unités ;
- fournisseurs, sites, emplacements et lots ;
- références, SKU, coûts d'achat et informations utiles aux autres modules ;
- archivage sans perte d'historique.

**Opérations**

- projection du stock par produit et emplacement ;
- mouvements d'entrée, sortie, perte, correction et production ;
- ajustements explicites : la quantité n'est jamais modifiée silencieusement ;
- inventaires, saisie des comptages, calcul des écarts et validation ;
- réception contrôlée des achats et alimentation du stock ;
- affectation des produits aux établissements ;
- journal d'audit consultable et exportable en CSV.

**Imports et OCR**

- modèle CSV, analyse préalable et import contrôlé du catalogue ;
- création assistée d'un CSV depuis des documents ou des images ;
- import par lot de factures et documents d'achat ;
- OCR, rapprochement fournisseur/produit, corrections manuelles et nouvelle analyse IA ;
- création d'une réception à partir d'une extraction validée ;
- lecture d'étiquettes produit et validation du résultat avant application.

**Marges**

- configuration des règles de marge ;
- tableaux de bord produit et fournisseur ;
- recherche, alertes et détection des écarts ;
- rapports figés et exports CSV.

**Assistant Stocks**

- conversations contextualisées par emplacement ;
- proposition de réception, perte, transfert, inventaire ou ajustement ;
- analyse de pièces jointes et factures ;
- rapprochement par alias produit ;
- brouillon modifiable, versionné, applicable ou rejetable.

### Cours des Produits

Le module Cours des Produits apporte une veille de marché depuis les données RNM FranceAgriMer.

- statistiques agrégées et tendances ;
- recherche paginée dans le catalogue ;
- filtres par secteur, catégorie et marché ;
- fiche produit avec dernières cotations ;
- historique global ou par produit ;
- favoris propres à l'organisation.

### Fiches Techniques

Fiches Techniques centralise les recettes professionnelles sans dupliquer le catalogue Stocks.

- catégories de recettes et allergènes ;
- ingrédients liés exclusivement aux produits et unités Stocks ;
- étapes de préparation et informations de rendement ;
- coûts matières recalculés depuis les prix d'achat ;
- prix, coût par portion et indicateurs de rentabilité ;
- création, modification, duplication et archivage ;
- historique des versions ;
- import de recettes et pièces jointes avec contrôle ;
- simulation de production théorique ;
- exports PDF et CSV.

L'assistant Fiches Techniques accepte du texte et des pièces jointes, prépare un brouillon structuré puis attend sa validation avant création.

### Achats

Achats exploite les fournisseurs, produits, unités, établissements et stocks déjà configurés.

**Commandes**

- tableau de bord et suggestions de réassort ;
- recherche dans les référentiels produits, catégories et fournisseurs ;
- création, modification et duplication des commandes ;
- cycle de vie : brouillon, envoi, accusé, annulation et clôture ;
- génération d'un bon de commande PDF ;
- aperçu de l'e-mail avant envoi ;
- options de livraison par fournisseur.

**E-mail fournisseur**

- envoi avec Resend ;
- connexions Google ou Microsoft par OAuth ;
- configuration SMTP ;
- test, activation et déconnexion de chaque canal ;
- secrets chiffrés côté serveur.

**Bons de livraison et réceptions**

- import d'un bon de livraison ou de plusieurs pièces jointes ;
- OCR et rapprochement avec la commande attendue ;
- gestion des lignes conformes, manquantes, excédentaires, inattendues ou substituées ;
- réception partielle ou complète ;
- validation avant création des mouvements Stocks ;
- traitement idempotent pour éviter les doubles réceptions ;
- historique complet des commandes et réceptions.

### Production

Production orchestre les Fiches Techniques, Stocks, RH et Planning sans recréer leurs données.

**Ordres de fabrication**

- création depuis une fiche technique ;
- recalcul des portions, besoins matières, coûts et allergènes ;
- statuts planifiée, validée, en cours, terminée ou annulée ;
- alertes critiques avec contournement confirmé et historisé ;
- affectation facultative à des collaborateurs, services ou postes ;
- saisie de la réalisation ;
- proposition de déstockage puis confirmation dans Stocks.

**Pilotage opérationnel**

- tableau de bord, productions du jour, calendrier et historique ;
- tâches manuelles ou générées depuis un menu ;
- découpage d'une recette en étapes et fusion de tâches ;
- changement de statut et suivi de l'exécution ;
- besoins matières et profils de production ;
- campagnes, suggestions, validation et expiration des tâches non affectées ;
- validation et clôture de journée, avec report des tâches restantes ;
- exports préparés et PDF opérationnels.

**Exécution et traçabilité**

- démarrage, reprise et clôture des lots ;
- suivi des opérations ;
- saisie de la traçabilité par ingrédient ;
- consultation de la chaîne d'un lot ;
- transitions du stock de production.

### Menus, cuisine centrale et traiteur

Menus référence les fiches techniques existantes, lit leurs coûts et allergènes, puis peut créer le travail attendu dans Production.

- catalogue et catégories de menus ;
- menus planifiés, calendrier et statuts ;
- cycles réutilisables ;
- régimes alimentaires et groupes de convives ;
- prévisions de quantités ;
- modèles de présentation ;
- exports téléchargeables et historisés ;
- génération des productions associées.

Deux parcours spécialisés complètent le module :

- **Cuisine centrale** : planification multi-jour, volumes, régimes, sites destinataires et préparation centralisée ;
- **Traiteur** : événements, groupes de convives, état de préparation, plan de production, génération des fabrications et documents d'événement.

### HACCP

HACCP couvre les contrôles quotidiens, la traçabilité et les procédés de sécurité alimentaire.

**Températures et capteurs**

- équipements, relevés manuels et historiques ;
- passerelle IoT MQTT/Zigbee2MQTT ;
- appairage, affectation, renommage et retrait des capteurs ;
- suivi des lectures et événements ;
- alertes de température et de capteur hors ligne ;
- réglages de notification et test de push.

**Contrôles opérationnels**

- réceptions et détail des contrôles ;
- traçabilité des lots et analyse d'image ;
- produits et équipements HACCP ;
- refroidissement, congélation et réchauffement ;
- contrôle des huiles avec photos ;
- zones, surfaces, sessions et historique de nettoyage ;
- sessions de production avec photos ;
- flux de traçabilité entre réceptions, Stocks et Production.

**Rapports et assistance**

- tableau de bord de conformité ;
- génération, régénération, statistiques, historique et téléchargement des rapports journaliers ;
- synchronisation des opérations réalisées hors ligne sur mobile ;
- assistant HACCP capable de préparer un brouillon contrôlable avant application.

### Ressources humaines

RH est le référentiel humain de l'organisation.

- collaborateurs avec ou sans compte ToqueHub ;
- liaison unique entre un utilisateur Core et sa fiche collaborateur ;
- services, postes et organigramme ;
- onboarding guidé des référentiels et du premier collaborateur ;
- documents rattachés à un salarié : ajout, consultation, remplacement, métadonnées et suppression ;
- analyse OCR des contrats et documents RH ;
- archivage et historique ;
- comptes temps, recalculs et ajustements manuels tracés ;
- données consommées par Planning, Production et les analyses d'affluence.

### Planning

Planning transforme les données RH en organisation opérationnelle.

- vues jour, semaine et mois ;
- affectations, déplacement et saisie journalière ;
- besoins en personnel par période ;
- absences et propositions de remplacement ;
- présences, émargement et validation ;
- dictionnaire de codes et profils de règles ;
- compétences et rattachement aux collaborateurs ;
- modèles, journées types et rotations hebdomadaires ;
- affectation des modèles aux salariés ;
- prévisualisation et application des rotations ;
- génération déterministe et application après contrôle ;
- détection des conflits et prise en compte des indisponibilités RH ;
- contrôle, publication et verrouillage d'une période ;
- notifications, historique et archivage ;
- exports PDF et préparation d'exports.

### Finance

Finance est un module de **pilotage et de compréhension**, pas un logiciel de saisie comptable. Une source comptable comme Fennoa reste la vérité comptable ; les caisses et imports apportent le détail opérationnel.

**Vues**

- **Tableau de bord** : lecture synthétique annuelle, mensuelle et journalière ;
- **Ventes & affluence** : produits, catégories, horaires, paiements, remises, annulations et remboursements ;
- **Annuel** : exercice en cours, trajectoire cumulée, historique et comparaison à même avancement ;
- **Mensuel** : réalisé, budget, période précédente et activité jour par jour ;
- **Journalier** : activité de la journée et repères comparables ;
- **Budget** : budget réel mois par mois, trajectoire, seuil sans perte et simulation selon le nombre de jours ouverts ;
- **Sources & qualité** : connexions, imports, couverture, statut, site, source principale et inclusion dans le chiffre d'affaires.

**Indicateurs disponibles selon les données**

- chiffre d'affaires, charges d'exploitation, masse salariale et résultat d'exploitation ;
- résultat net, résultat cumulé et chiffre d'affaires cumulé ;
- trésorerie disponible et charges fixes ;
- ticket moyen et nombre de transactions ;
- marge contributive et taux de marge ;
- seuil de chiffre d'affaires, point mort et objectifs par jour, semaine ou mois ;
- comparaisons au budget, à la période précédente et aux exercices antérieurs ;
- personnalisation des KPI, avec masquage des indicateurs non exploitables.

**Ventes et affluence**

- addition de plusieurs POS actifs dans un même établissement ;
- séparation des comptes et des sources entre établissements ;
- top/flop produits et classement des catégories ;
- quantités, chiffre d'affaires, part du chiffre d'affaires et marge lorsque le coût est disponible ;
- carte de chaleur jour de semaine × heure ;
- heures de pointe et heures creuses ;
- part du chiffre d'affaires, transactions et ticket moyen par tranche horaire ;
- comparaison avec la semaine, le mois ou l'année précédente ;
- rapprochement de l'affluence avec les effectifs planifiés lorsque Planning contient des données.

**Sources et consolidation**

- API comptable Fennoa : comptes, exercices, verrouillages, grand livre, soldes et budgets ;
- automatisation locale FlatPay : Orders et Sales Overview, découpés en petites périodes pour contourner les limites d'export ;
- API Loyverse : tickets, lignes produits, magasins, paiements, TVA, remboursements et catégories, y compris les références supprimées ;
- API PayPal POS/Zettle lorsque les identifiants développeur sont disponibles ;
- imports de rapports FlatPay, Loyverse, PayPal POS, Fennoa et fichiers génériques ;
- imports universels XLSX, CSV, PDF et images avec OCR pour les documents non structurés ;
- reconnaissance des états comptables français, anglais et finnois ;
- corpus de test de 30 rapports synthétiques : 10 français, 10 anglais et 10 finnois ;
- déduplication inter-sources, normalisation des tickets et lignes produits, conservation du fichier et traçabilité du parseur ;
- contrôle de la période, de la couverture et de la confiance avant consolidation ;
- analyse Mistral fondée sur les données déjà normalisées et traçables.

Chaque connexion POS est rattachée à un établissement. Un établissement peut cumuler plusieurs fournisseurs de caisse, tandis qu'un même compte fournisseur ne peut pas être attribué silencieusement à plusieurs sites.

## Fonctionnalités transversales

### IA et OCR

Une clé Mistral peut être enregistrée au niveau de l'organisation. Elle alimente :

- l'OCR des factures et documents Stocks ;
- l'import et l'aide à la création des fiches techniques ;
- l'analyse de contrats et documents RH ;
- l'analyse d'images et l'assistant HACCP ;
- l'OCR comptable multilingue et l'analyste Finance ;
- les assistants Stocks et Fiches Techniques.

Les réponses IA ne sont pas utilisées comme écritures libres dans les données métier : elles produisent une extraction ou une proposition qui doit être contrôlée, corrigée ou validée.

### Droits RH et conformité Planning

Le moteur de droits sépare la réglementation, la configuration de l'établissement, l'attribution au salarié et les compteurs opérationnels.

- pays réglementaire distinct de la langue d'interface ;
- base France V1 versionnée, sourcée et importable de manière idempotente ;
- structure multi-pays prête à recevoir d'autres bases, la Finlande ne disposant pas encore de règles actives dans la V1 ;
- recherche et diagnostic des droits disponibles ;
- profils légaux par salarié, privé ou public ;
- activation et paramétrage au niveau de l'établissement sans dupliquer la règle source ;
- règles datées, états `requires_review` et absence explicite de calcul lorsque la donnée est insuffisante ;
- calculs, compteurs et journaux d'audit historisés ;
- contrôle de conformité d'un planning ;
- règlement interne du temps de travail séparé du droit commun ;
- suivi du travail de nuit, des jours fériés et des week-ends sans inventer de majoration ou de compensation.

Ce moteur apporte une aide au paramétrage et au contrôle. Les règles marquées à valider ne remplacent pas une validation juridique ou de paie.

### Documents

- registre documentaire partagé ;
- téléchargement sécurisé ;
- métadonnées modifiables ;
- rattachement des pièces aux modules concernés ;
- fichiers conservés localement hors du dépôt Git.

### Sauvegardes

- création et inventaire des sauvegardes ;
- planification ;
- inspection avant restauration ;
- restauration d'une sauvegarde locale ou téléversée ;
- téléchargement ;
- connexion Google Drive facultative ;
- chiffrement des secrets et jetons cloud.

### Support humain

- création de tickets depuis l'application ;
- pièces jointes ;
- fil de messages et compteur de non-lus ;
- clôture d'un ticket ;
- relais de support séparé, enrollement d'instance et échange d'événements ;
- intégration Telegram possible côté relais.

### Architecture Center et diagnostic

- liste des modules et résumé de l'architecture ;
- carte des données, relations et schéma ;
- recherche de doublons ;
- analyse d'impact globale ou par module ;
- documentation technique embarquée ;
- statut PostgreSQL, statistiques de l'instance et diagnostic du Core.

### Accès local, distant et mises à jour

- découverte locale via `/api/discovery` et mDNS `_toquehub._tcp` ;
- configuration d'un accès distant privé, notamment via Tailscale ;
- consultation du statut de connexion ;
- vérification, téléchargement et application des mises à jour ;
- changelog et suivi de l'opération de mise à jour.

## Relations entre les modules

| Donnée de référence                                       | Module propriétaire | Principaux consommateurs                                     |
| --------------------------------------------------------- | ------------------- | ------------------------------------------------------------ |
| Produits, unités, fournisseurs, lots, sites, emplacements | Stocks              | Achats, Fiches Techniques, Production, Menus, HACCP, Finance |
| Recettes, ingrédients, coûts, allergènes                  | Fiches Techniques   | Production, Menus                                            |
| Commandes et réceptions fournisseurs                      | Achats              | Stocks, HACCP                                                |
| Ordres, tâches, lots et réalisations                      | Production          | Stocks, HACCP, Menus                                         |
| Menus, régimes, convives et prévisions                    | Menus               | Production                                                   |
| Collaborateurs, services, postes et documents             | RH                  | Planning, Production, Finance                                |
| Affectations, présences et heures planifiées              | Planning            | RH, Production, Finance                                      |
| Contrôles et preuves sanitaires                           | HACCP               | Dashboard, mobile, rapports                                  |
| Comptabilité, caisse, budget et imports                   | Finance             | Dashboard et analyses Finance                                |

Les modules consommateurs référencent les identifiants du module propriétaire. Ils n'entretiennent pas de copie parallèle des mêmes produits, personnes ou établissements.

## Intégrations

| Intégration                   | Usage                                                         | Mode                                        |
| ----------------------------- | ------------------------------------------------------------- | ------------------------------------------- |
| **Mistral AI**                | OCR, classification documentaire et assistants métier         | Clé d'organisation ou variable serveur      |
| **Fennoa**                    | Comptes, exercices, grand livre, soldes et budgets            | API comptable                               |
| **FlatPay**                   | Orders, Sales Overview, transactions et clôtures              | Automatisation navigateur locale et imports |
| **Loyverse**                  | Tickets, produits, magasins, paiements, TVA et remboursements | API avec jeton personnel et import CSV      |
| **PayPal POS / Zettle**       | Tickets, produits et paiements                                | API développeur et imports de rapports      |
| **Resend**                    | Envoi des bons de commande                                    | API                                         |
| **Google / Microsoft / SMTP** | Envoi des commandes fournisseurs                              | OAuth ou identifiants SMTP                  |
| **Google Drive**              | Copie distante des sauvegardes                                | OAuth                                       |
| **RNM FranceAgriMer**         | Cotations et historiques de prix                              | Source de marché                            |
| **MQTT / Zigbee2MQTT**        | Capteurs HACCP                                                | Réseau local                                |
| **Tailscale**                 | Accès privé à une instance locale                             | Réseau privé                                |
| **Brother TD-2130N**          | Impression d'étiquettes terrain                               | SDK natif mobile                            |

Les intégrations facultatives restent inactives tant qu'elles ne sont pas configurées. Une défaillance externe ne doit pas empêcher l'utilisation des autres modules locaux.

## Application mobile

L'application mobile est maintenue dans le workspace compagnon `../AppToqueHub`. Elle utilise Expo, React Native, React Navigation, React Query, AsyncStorage, SecureStore, SQLite et Zeroconf.

### Parcours mobile

- découverte automatique des serveurs ToqueHub sur le réseau local ;
- saisie manuelle d'une URL lorsque la découverte n'est pas disponible ;
- session serveur persistée ;
- interface centrée sur les opérations HACCP ;
- mode hors ligne avec SQLite et file d'opérations ;
- resynchronisation lorsque le serveur redevient accessible ;
- notifications HACCP et suivi des actions du jour ;
- impression d'étiquettes Brother.

### Écrans HACCP mobiles

| Zone            | Fonctions                                               |
| --------------- | ------------------------------------------------------- |
| Tableau de bord | Synthèse HACCP, états du jour et raccourcis.            |
| Températures    | Équipements, relevés, détail et ajout.                  |
| Réceptions      | Contrôles à réception et historique.                    |
| Traçabilité     | Lots, création, édition et analyse d'image.             |
| Production      | Sessions, photos et historique.                         |
| Nettoyage       | Zones, surfaces, session active et historique.          |
| Procédés        | Refroidissement, congélation et réchauffement.          |
| Huiles          | Équipements, sessions, photos et historique.            |
| Produits        | Produits HACCP, ajout et historique.                    |
| Étiqueteuse     | Configuration et impression Brother.                    |
| Rapports        | Génération, historique, statistiques et téléchargement. |

### Impression terrain

L'intégration Brother TD-2130N prend en charge la découverte réseau, les modèles P-touch, le remplacement de champs et le transfert de templates. Un build natif est requis : Expo Go ne charge pas les modules Brother.

```bash
cd ../AppToqueHub
npm install
npm run ios
npm run android
```

## Sécurité, confidentialité et traçabilité

- isolation des données par organisation et rattachement explicite aux établissements ;
- authentification JWT, rôles et permissions par action ;
- secrets Fennoa, Loyverse, PayPal POS, e-mail et sauvegarde chiffrés côté serveur avec AES-256-GCM ;
- mot de passe FlatPay stocké dans le trousseau macOS lorsqu'il est disponible, sinon chiffré dans la base locale ;
- secrets masqués dans l'interface et jamais renvoyés au navigateur ;
- journaux d'audit, historiques de versions et validations explicites ;
- déduplication et idempotence pour les imports Finance et réceptions Stocks ;
- uploads, sauvegardes, bases locales, profils navigateur et fichiers d'environnement exclus de Git ;
- contrôle automatique des chemins personnels, secrets et documents avant commit.

Avant de publier une modification :

```bash
npm run privacy:check
git add -A
npm run privacy:check:staged
```

Le contrôle bloquera notamment les fichiers `.env`, bases, sauvegardes, sessions navigateur, clés privées, jetons détectables et documents métier placés hors des répertoires de test/documentation autorisés.

## Architecture et stack

```text
toquehub/
  apps/
    api/             API NestJS, Prisma, PostgreSQL, WebSocket, tâches locales
    web/             Back-office React + TypeScript + Vite
    landing/         Site de présentation et démonstration
    support-relay/   Relais facultatif pour le support humain
    video/           Présentation Remotion
  packages/
    core/            Socle partagé
    ui/              Composants partagés
    shared-types/    Types partagés
  docker/            Images, Compose, Nginx et entrypoint API
  scripts/           Installation, base, Docker, Raspberry Pi, IoT et confidentialité
  docs/              Documentation technique et fonctionnelle

../AppToqueHub/      Application mobile compagnon, si ce workspace est installé
```

| Couche         | Technologies principales                                                  |
| -------------- | ------------------------------------------------------------------------- |
| API            | NestJS, Prisma, Swagger, JWT, Socket.IO, PostgreSQL                       |
| Web            | React, TypeScript, Vite, Material UI, Lucide, Framer Motion, React Query  |
| Documents      | ExcelJS, PDFKit, PDF-lib, OCR Mistral                                     |
| Automatisation | Playwright Core et planificateurs locaux                                  |
| Mobile         | Expo, React Native, React Navigation, SQLite, Zeroconf                    |
| IoT            | Mosquitto MQTT, Zigbee2MQTT                                               |
| Déploiement    | Docker Compose, images multi-architecture, scripts Ubuntu et Raspberry Pi |
| Données        | PostgreSQL, migrations Prisma, uploads locaux et sauvegardes restaurables |

## Installation

### Démarrage local

Prérequis :

- Node.js `20.11+` ;
- npm `10+` ;
- PostgreSQL `14+`.

Préparer entièrement une copie fraîche sous Windows :

```powershell
npm run welcome
```

Sous Linux ou macOS :

```bash
npm run bienvenue
```

Ces commandes installent les dépendances, préparent PostgreSQL, appliquent les migrations, génèrent Prisma Client et vérifient les tables attendues.

Lancer ensuite l'API et le web dans deux terminaux :

```bash
npm run api:dev
npm run web:dev
```

Adresses locales :

- API : `http://localhost:3000` ;
- Swagger : `http://localhost:3000/api/docs` ;
- Web : `http://localhost:5173`.

Au premier démarrage, créez le compte administrateur et l'établissement depuis l'onboarding.

### Docker, Ubuntu et Raspberry Pi

ToqueHub peut fonctionner comme une appliance locale avec web, API, PostgreSQL, MQTT et Zigbee2MQTT.

```bash
npm run docker:setup
npm run docker:up
npm run docker:logs
```

Interface Docker par défaut : `http://localhost:8080`.

```bash
npm run ubuntu:install
npm run pi:install
npm run pi:image
```

Commandes disponibles sur le Raspberry Pi :

```bash
toquehub status
toquehub logs
toquehub update
toquehub backup
toquehub restart
```

## Scripts utiles

| Commande                       | Description                                                   |
| ------------------------------ | ------------------------------------------------------------- |
| `npm run bienvenue`            | Prépare une installation locale sous Linux ou macOS.          |
| `npm run welcome`              | Prépare une installation locale sous Windows.                 |
| `npm run api:dev`              | Vérifie les migrations puis lance l'API NestJS en watch mode. |
| `npm run web:dev`              | Lance l'interface web Vite.                                   |
| `npm run landing:dev`          | Lance le site de présentation.                                |
| `npm run build`                | Compile tous les workspaces concernés.                        |
| `npm run typecheck`            | Vérifie le typage des workspaces.                             |
| `npm run lint`                 | Lance les linters disponibles.                                |
| `npm run prisma:generate`      | Génère Prisma Client.                                         |
| `npm run prisma:deploy`        | Applique les migrations déjà créées.                          |
| `npm run prisma:status`        | Affiche l'état des migrations.                                |
| `npm run prisma:verify`        | Vérifie la présence des tables attendues.                     |
| `npm run prisma:prepare`       | Déploie, génère et vérifie Prisma.                            |
| `npm run prisma:migrate`       | Crée/applique une migration en développement.                 |
| `npm run prisma:reset`         | Réinitialise explicitement la base locale.                    |
| `npm run docker:up`            | Construit et lance la stack Docker.                           |
| `npm run docker:down`          | Arrête la stack Docker.                                       |
| `npm run iot:docker:up`        | Lance Mosquitto et Zigbee2MQTT.                               |
| `npm run addresses`            | Affiche les adresses d'accès utiles.                          |
| `npm run privacy:check`        | Analyse tous les fichiers versionnés ou candidats.            |
| `npm run privacy:check:staged` | Analyse uniquement le contenu préparé pour le commit.         |

> `prisma:reset` et toute restauration remplacent des données locales. Vérifiez toujours la cible et la sauvegarde disponible avant de les lancer.

## Documentation

- [Architecture générale](./docs/architecture.md)
- [API](./docs/api.md)
- [Module Achats V1](./docs/module-achats-v1.md)
- [OCR Stocks](./docs/ocr-stocks.md)
- [Moteur de droits RH et Planning](./docs/legal-rights-engine.md)
- [Audit et conception Production](./docs/production-module-audit-design.md)
- [Relais de support humain](./docs/human-support-relay.md)
- [Workflow de publication et de mise à jour](./docs/release-update-workflow.md)

## Licence

ToqueHub est distribué sous licence **AGPL-3.0-only**.
