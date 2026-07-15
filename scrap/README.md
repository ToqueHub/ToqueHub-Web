# ToqueHub RNM - Module de Synchronisation & API FranceAgriMer

Ce projet est un module de scraping, de synchronisation de base de données et d'API REST pour récupérer les cours des denrées alimentaires du **Réseau des Nouvelles des Marchés (RNM)** de FranceAgriMer.

Il est construit avec **Next.js 15 (App Router)**, **TypeScript**, et **Prisma** pour s'interfacer avec une base de données **PostgreSQL**.

---

## 🚀 Fonctionnalités
- **Crawl automatique** : Découverte des produits disponibles sur les 4 principaux secteurs RNM (*Fruits et Légumes, Pêche et Aquaculture, Beurre-Œuf-Fromage, Viande*).
- **Importation intelligente** : Téléchargement et parsing des fichiers tableurs au format **SYLK (.slk)** générés par FranceAgriMer.
- **Normalisation des données** : Nettoyage et harmonisation des calibres, origines et variétés pour éviter les doublons.
- **Tâche planifiée automatique (Cron)** : Script configurable pour récupérer les prix chaque jour à 2h00 du matin.
- **API REST propre** : Endpoints prêts à l'emploi pour alimenter d'autres applications.
- **Dashboard web** : Interface graphique Next.js intégrée avec historique de prix et variations.

---

## 🗄️ Architecture de la Base de Données

La base de données PostgreSQL utilise le schéma suivant (géré via Prisma) :
- **MarketSector** : Les grands secteurs (ex: `fruits-et-legumes`, `viande`).
- **MarketCategory** : Les catégories et sous-catégories (ex: `legumes`, `fruits-graines`).
- **MarketProduct** : Le produit générique (ex: `tomate`, `cabillaud`) avec son `especeId` RNM.
- **MarketLabel** : Les variétés spécifiques d'un produit (ex: `TOMATE grappe colis 5kg`), identifiées par leur `libcod` unique.
- **Market** : Les lieux de cotation physique (ex: `Rungis`, `Belgique`).
- **MarketPrice** : Les relevés de prix journaliers avec le prix moyen (`avgPrice`), min/max, la variation, le stade commercial et l'unité de mesure.

---

## 📡 Documentation de l'API REST (Préfixe : `/api/rnm`)

### 1. Structure Hiérarchique
- **Endpoint** : `GET /api/rnm/hierarchy`
- **Description** : Retourne l'arbre complet des secteurs, catégories et produits. Idéal pour construire des menus de navigation.

### 2. Recherche & Filtres de Produits
- **Endpoint** : `GET /api/rnm/products`
- **Description** : Liste tous les produits de la base de données.
- **Paramètres acceptés** :
  - `search` (optionnel) : Recherche sur le nom (ex: `?search=tom`)
  - `sector` (optionnel) : Filtrer par slug de secteur (ex: `?sector=viande`)
  - `category` (optionnel) : Filtrer par slug de catégorie (ex: `?category=legumes`)
  - `limit` (défaut `50`) & `offset` (défaut `0`) pour la pagination.

### 3. Fiche Produit & Relevés les plus Récents (Snapshot)
- **Endpoint** : `GET /api/rnm/products/[slug]`
- **Description** : Retourne les détails du produit et **l'intégralité des cotations disponibles à la date la plus récente** (snapshot complet).
- **Exemple** : `GET /api/rnm/products/tomate`

### 4. Recherche Historique des Prix
- **Endpoint** : `GET /api/rnm/prices`
- **Description** : Effectue des recherches historiques complexes dans la table des prix.
- **Paramètres acceptés** :
  - `product` (optionnel) : Filtrer par slug de produit.
  - `market` (optionnel) : Filtrer par code de marché.
  - `stage` (optionnel) : Relevé de Production, Détail, Grossiste, etc.
  - `dateFrom` & `dateTo` (optionnel) : Dates limites (format YYYY-MM-DD).
  - `limit` (défaut `50`, max `500`) & `offset` (défaut `0`).

### 5. Export de Données en Masse
- **Endpoint** : `GET /api/rnm/export`
- **Description** : Conçu pour extraire des volumes importants de données vers d'autres plateformes.
- **Paramètres acceptés** :
  - `type` (requis) : `products` (tous les produits avec leurs catégories et variétés), `markets` (tous les marchés connus), ou `prices` (toutes les lignes de prix de la table).
  - `limit` (max `5000`) & `offset` pour paginer l'exportation des prix.
  - `dateFrom` / `dateTo` pour exporter uniquement les prix d'un intervalle de temps.

### 6. Déclencheur de Synchronisation Sécurisé
- **Endpoint** : `POST /api/rnm/sync`
- **Description** : Déclenche la synchronisation globale des prix et produits en arrière-plan. Retourne immédiatement un code `202 Accepted` pour éviter les timeouts HTTP.
- **Authentification** : Si la variable d'environnement `SYNC_TOKEN` est définie, vous devez fournir le jeton soit en paramètre d'URL `?token=VOTRE_JETON` soit dans le header HTTP `x-sync-token`.

---

## 🛠️ Commandes Locales Utiles

### Installation
```bash
npm install
```

### Initialisation de la Base de Données
Configurez la variable `DATABASE_URL` dans votre fichier `.env` puis exécutez :
```bash
npx prisma db push
```

### Lancement du Dashboard (Développement)
```bash
npm run dev
```

### Vider complètement la Base de Données (Slate Clean)
```bash
npm run db:empty
```

### Lancer une Synchronisation Globale Ponctuelle
```bash
npm run sync:daily
```

---

## 🐳 Déploiement sur Coolify (NAS / VPS)

Ce dépôt est configuré pour être déployé en 1 clic sur **Coolify** grâce au `Dockerfile` et au script `start.sh` qui applique automatiquement les migrations de base de données à chaque démarrage.

### Planification de la Synchronisation Automatique quotidienne à 2h00
1. Déployez l'application sur Coolify.
2. Allez dans l'onglet **Cron Jobs** de votre application sur le tableau de bord de Coolify.
3. Ajoutez une tâche planifiée :
   - **Planification (Cron)** : `0 2 * * *`
   - **Commande** : `npm run sync:daily`
4. Enregistrez. Coolify gérera l'exécution du script à l'intérieur du conteneur chaque nuit à 2h et conservera les rapports de synchronisation dans ses logs.

---

## 🎈 Déploiement sur Fly.io

Le projet est préconfiguré pour **Fly.io** avec le fichier [fly.toml](file:///Users/paulbreton/Desktop/scrap/fly.toml).

### Étape 1 : Connexion à Fly.io
Installez l'outil `flyctl` puis connectez-vous :
```bash
fly auth login
```

### Étape 2 : Initialisation du projet
Initialisez l'application sur Fly.io (choisissez de créer une base de données PostgreSQL si vous n'en avez pas déjà une externe) :
```bash
fly launch
```
*Remarque : Ne lancez pas le déploiement immédiat avant d'avoir configuré les variables secrètes.*

### Étape 3 : Configuration des variables d'environnement
Configurez la connexion PostgreSQL et définissez un jeton sécurisé pour déclencher la synchronisation à distance :
```bash
fly secrets set DATABASE_URL="votre_connection_string" DIRECT_URL="votre_connection_string" SYNC_TOKEN="un_mot_de_passe_impenetrable"
```

### Étape 4 : Déploiement
Déployez l'application :
```bash
fly deploy
```

### Étape 5 : Planification de la synchronisation à 2h00 du matin
Pour que l'application ne consomme pas vos ressources inutilement, Fly.io éteint automatiquement le serveur si personne ne l'utilise (`auto_stop_machines = true` dans `fly.toml`).

Pour lancer la synchronisation sans forcer le serveur à rester allumé 24h/24 :
1. Créez un compte gratuit sur un planificateur HTTP (ex: [cron-job.org](https://cron-job.org/)).
2. Configurez une tâche planifiée pour s'exécuter tous les jours à **2h00 du matin**.
3. Définissez la requête de la tâche sur :
   - **URL** : `https://nom-de-votre-app.fly.dev/api/rnm/sync?token=VOTRE_SYNC_TOKEN`
   - **Méthode** : `POST`
4. **Pourquoi c'est idéal ?** L'appel HTTP de 2h00 va réveiller automatiquement votre conteneur sur Fly.io, démarrer la synchronisation des prix en arrière-plan, puis le conteneur s'éteindra de lui-même après quelques minutes d'inactivité pour préserver vos crédits gratuits Fly.io !

