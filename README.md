# ToqueHub

ToqueHub is an open source, self-hosted ERP platform for professional kitchens. The goal is to replace scattered spreadsheets with a modular core shared by restaurants, care homes, caterers, hotels and public-sector kitchens.

Phase 1 focuses only on **ToqueHub Core**: authentication, organizations, products, categories, units, suppliers, lots-ready data structures, stocks and stock movements.

## Principles

- AGPL v3 open source license.
- Community version is free and self-hosted.
- Local-first development; not a SaaS for the first version.
- PostgreSQL only for persistence.
- All modules share the same business entities and database.
- Stock is never edited directly by users: every change must create a `stock_movements` entry, while `stocks` is a projection for fast reads.

## Monorepo

```text
apps/
  api/   NestJS + Prisma REST API
  web/   React + TypeScript MVP
packages/
  shared-types/
  ui/
  core/
docs/
docker/  Reserved for future Docker assets
```

## Requirements

- Node.js 20.11+
- npm 10+
- PostgreSQL 14+

## Local PostgreSQL setup

The default `.env.example` expects this local database URL:

```text
postgresql://toquehub:toquehub@localhost:5432/toquehub?schema=public
```

If PostgreSQL is already installed and running, you can create the matching local role/database with:

```bash
npm run db:setup:local
```

Equivalent manual SQL, from a PostgreSQL superuser connection:

```sql
CREATE USER toquehub WITH PASSWORD 'toquehub' CREATEDB;
CREATE DATABASE toquehub OWNER toquehub;
GRANT ALL PRIVILEGES ON DATABASE toquehub TO toquehub;
\c toquehub
GRANT ALL ON SCHEMA public TO toquehub;
```

If the role already exists:

```sql
ALTER USER toquehub WITH PASSWORD 'toquehub' CREATEDB;
```

Prisma `migrate dev` needs `CREATEDB` locally to create its shadow database.

If `npm run prisma:migrate` fails with `P1010: User was denied access`, the `.env` file is being read correctly but PostgreSQL permissions are not ready yet; run the setup script or apply the SQL above.

If it fails with `P3014` / `permission denied to create database`, grant `CREATEDB` to the local role:

```sql
ALTER USER toquehub CREATEDB;
```

## Quick start

### Démarrage quotidien

À chaque fois que tu veux travailler sur ToqueHub, lance deux terminaux.

Terminal 1 — backend API NestJS :

```bash
npm run api:dev
```

- Lance l'API sur `http://localhost:3000`.
- Swagger est disponible sur `http://localhost:3000/api/docs`.
- À garder ouvert pendant le développement backend/frontend.

Terminal 2 — frontend React/Vite :

```bash
npm run web:dev
```

- Lance l'interface web sur `http://localhost:5173`.
- C'est cette URL qu'il faut ouvrir dans le navigateur.
- Le frontend proxifie `/api` vers `http://localhost:3000`.

### Première installation

```bash
cp .env.example .env
npm install
npm run db:setup:local
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run api:dev
npm run web:dev
```

To reset the local database and replay migrations from scratch without recreating demo data, use:

```bash
npm run prisma:reset
```

`npm run prisma:reset` uses `prisma migrate reset --skip-seed`, so it keeps the database empty after migrations and lets you test the first-start bootstrap flow.

Do not use `npm run prisma:migrate reset`: it appends `reset` to `prisma migrate dev`, which is not the Prisma reset command.

### Tester le flow de premier démarrage

Pour revoir le parcours `Créer un environnement`, il faut une base vide :

```bash
npm run prisma:reset
npm run api:dev
npm run web:dev
```

Ne lance pas `npm run prisma:seed` après le reset, sinon l'admin de démo est recréé et le bouton `Créer un environnement` est masqué par sécurité.

### Démo avec compte administrateur existant

Pour avoir rapidement une instance déjà initialisée :

```bash
npm run prisma:seed
npm run api:dev
npm run web:dev
```

Default seeded account:

- Email: `admin@toquehub.local`
- Password: `toquehub`

API documentation is available at `http://localhost:3000/api/docs` when the backend is running.

## Main scripts

| Commande | Utilité |
| --- | --- |
| `npm run api:dev` | Lance le backend NestJS en watch mode sur `localhost:3000`. |
| `npm run web:dev` | Lance le frontend React/Vite sur `localhost:5173`. |
| `npm run db:setup:local` | Crée/configure la base PostgreSQL locale `toquehub`. |
| `npm run prisma:generate` | Régénère le client Prisma après changement du schema. |
| `npm run prisma:migrate` | Applique les migrations Prisma en développement. |
| `npm run prisma:reset` | Supprime les données locales et rejoue toutes les migrations, sans lancer le seed. |
| `npm run prisma:seed` | Ajoute les données de démo, dont l'admin `admin@toquehub.local`. |
| `npm run typecheck` | Vérifie le typage TypeScript de tous les workspaces. |
| `npm run build` | Compile backend, frontend et packages. |
| `npm run format` | Formate le projet avec Prettier. |

```bash
npm run typecheck
npm run build
npm run api:dev
npm run web:dev
npm run prisma:migrate
npm run prisma:reset
npm run prisma:seed
```

## Phase 1 MVP capabilities

- Login with JWT.
- Create and list categories.
- Create and list units.
- Create and list products linked to units and optional categories.
- Create and list suppliers.
- Add stock through stock movements.
- View current stocks.
- View stock movement history.

## Not in current scope

Docker deployment, Raspberry Pi packaging, mobile applications and plugin systems are intentionally deferred.
