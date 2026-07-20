# Module Production — audit, conception et stratégie d’implémentation

Date de l’audit : 18 juillet 2026.

Ce document décrit l’état réellement observé dans le dépôt et le modèle retenu pour faire évoluer le module Production sans créer de catalogue, de stock, de site, d’utilisateur ou de fiche technique parallèle.

## 1. Architecture actuelle

ToqueHub est un monorepo npm composé principalement de :

- `apps/api` : API NestJS 11, Prisma 6 et PostgreSQL ;
- `apps/web` : React 19, Vite et TypeScript ;
- `packages/core`, `packages/shared-types` et `packages/ui` : fondations partagées encore légères ;
- `apps/api/prisma` : schéma et historique des migrations ;
- `docs` : documentation d’architecture et de modules.

L’API est découpée en modules NestJS. Le contexte utilisateur vient du JWT et contient l’organisation, le rôle et les permissions. Toutes les entités métier importantes sont rattachées à `Organization`. Les stocks, menus, employés et achats peuvent en plus être rattachés à `Site` et `Location`.

Le frontend reste une application React monolithique par grands composants métier. Le design system est principalement constitué de classes CSS partagées, de composants locaux et d’icônes Lucide. Plusieurs composants, dont Production, sont encore sous `// @ts-nocheck`.

## 2. Modèles existants réutilisés

| Besoin                | Modèle canonique conservé               | Décision                                           |
| --------------------- | --------------------------------------- | -------------------------------------------------- |
| organisation          | `Organization`                          | aucun nouveau tenant                               |
| établissement         | `Site`                                  | isolation des besoins et productions               |
| emplacement           | `Location`                              | destination et stockage                            |
| utilisateurs et rôles | `User`, `Role`, `Permission`            | permissions Production enrichies                   |
| produit               | `Product`                               | type métier ajouté, aucun second catalogue         |
| unités                | `Unit`, `UnitConversion`                | conversions explicites uniquement                  |
| fiche technique       | `TechnicalSheet`                        | source de recette maintenue                        |
| stock physique        | `Stock`                                 | projection physique unique                         |
| lot de stock          | `Lot`                                   | métadonnées de production et conservation ajoutées |
| journal stock         | `StockMovement`                         | journal unique enrichi                             |
| campagne              | `ProductionOrder`                       | étendu, pas de `ProductionCampaign` concurrent     |
| menu                  | `Menu`, `MenuItem`, `MenuGuestForecast` | origine des besoins planifiés                      |
| lien menu-production  | `MenuProductionLink`                    | conservé                                           |
| ressources humaines   | `HrEmployee`, `HrDepartment`            | responsables et postes réutilisés                  |
| HACCP                 | modèles `Haccp*`                        | intégration future par lots et mouvements          |

## 3. Composants et services réutilisables

- `ProductionApp.tsx` fournit déjà tableau de bord, ordres, calendrier, production du jour, affectations, matières, exports et historique.
- `MenusService.generateProductions` fournit déjà la génération depuis un menu validé.
- `StocksService.createMovement` fournit la transaction générique d’un mouvement et de sa projection de stock.
- `TechnicalSheetsService` gère fiches, ingrédients, étapes, simulations et historique.
- `PrismaService` est le point d’accès transactionnel partagé.
- `JwtAuthGuard` et `AuthenticatedUser.permissions` fournissent le contexte d’autorisation.
- `Site` et `Location` ont déjà été introduits et utilisés dans Stocks, Achats et Planning.

## 4. Écarts et incohérences observés

### Production actuelle

- un ordre représente une quantité planifiée, mais pas un besoin brut, un manque net et une quantité réalisable distincts ;
- aucun lot d’exécution n’existe ;
- aucun produit fini ni lot de stock n’est créé lors d’une réalisation ;
- le déstockage consomme des produits sans FEFO et sans détail des lots ;
- les stocks sont additionnés au niveau de l’organisation dans certains calculs, sans isolation de site ;
- aucune réservation n’est soustraite ;
- les états congelé, en décongélation, bloqué et expiré ne sont pas modélisés ;
- les fiches restent mutables après création d’un ordre ;
- le calcul matières est dupliqué entre Production et Menus ;
- les sous-recettes ne peuvent pas être explorées récursivement ;
- les permissions Production sont seulement `read/write` et plusieurs contrôles reposent sur le nom du rôle ;
- l’interface et les messages serveur sont majoritairement en français, sans système i18n FR/EN/FI effectif.

### Stocks

- `Stock` est une projection matérialisée correcte, mais l’ancienne contrainte composée contenant des colonnes nullables n’empêchait pas toutes les lignes logiquement dupliquées sous PostgreSQL ; la migration vérifie les doublons puis utilise `NULLS NOT DISTINCT` sous PostgreSQL 15 ;
- `PRODUCTION` avait un sens ambigu : consommation négative dans Production, entrée positive dans Stocks ; le nouveau socle réserve `CONSUMPTION` aux composants et `PRODUCTION` au produit créé ;
- le service accepte historiquement un stock négatif : l’exécution des lots devra verrouiller et vérifier avant consommation.

## 5. Modèle de données retenu

```text
Organization
 ├─ Site
 │   ├─ ProductionProfile ── TechnicalSheet ── TechnicalSheetVersion
 │   ├─ ProductionNeed ── Product/ProductVariant
 │   └─ ProductionOrder (campagne)
 │       ├─ ProductionNeedAllocation ── ProductionNeed
 │       ├─ ProductionBatch
 │       │   ├─ ProductionOperation ── ProductionOperationDependency
 │       │   ├─ ProductionBatchConsumption ── Lot/StockMovement
 │       │   └─ Lot (produit) ── Stock
 │       └─ StockReservation ── Stock/Lot
 └─ Menu ── MenuProductionLink ── ProductionOrder

Product
 ├─ ProductVariant
 └─ PackagingCompositionItem
```

### Principes

- `ProductionOrder` est la campagne existante et reçoit les champs besoin brut, manque net, proposition, validation, réservation et surplus.
- `ProductionNeed` porte l’origine et la date du besoin.
- `ProductionNeedAllocation` autorise le regroupement de plusieurs besoins dans une campagne et la ventilation d’un besoin entre plusieurs campagnes.
- `ProductionProfile` relie une fiche, un produit de sortie, une unité et un site.
- `TechnicalSheetVersion` conserve un snapshot immuable des ingrédients et étapes utilisé par les campagnes.
- `ProductionBatch` représente un lot réel d’exécution.
- `ProductionOperation` représente les étapes datées et leurs dépendances.
- `ProductionBatchConsumption` relie chaque consommation réelle au lot composant et au mouvement.
- `Lot` conserve l’état de conservation et l’origine de production ; la quantité physique restante demeure dans `Stock`.
- `StockReservation` ne modifie pas le stock physique. Le stock libre est la quantité physique moins les réservations actives.
- `ProductVariant` sépare les parfums ou déclinaisons ; `PackagingCompositionItem` représente une composition standard explicite.

## 6. Statuts et transitions

### Besoin

```text
DRAFT → CONFIRMED → PARTIALLY_COVERED → COVERED
   └──────────────→ CANCELLED
```

### Campagne (`ProductionOrder`)

```text
DRAFT → PROPOSED → VALIDATED → PLANNED → IN_PROGRESS
                                      ├→ PARTIALLY_COMPLETED → COMPLETED
                                      ├→ BLOCKED
                                      └→ CANCELLED
```

Les anciens statuts restent présents pour compatibilité. Les transitions devront être centralisées dans un validateur backend lors de l’incrément Campagnes/Lots.

### Lot

```text
TO_PREPARE → PREPARING → COOKING/COOLING/FREEZING → COMPLETED
                                ├→ PARTIALLY_LOST
                                └→ CANCELLED
```

### Opération

```text
PENDING → READY → IN_PROGRESS → COMPLETED
                     ├→ BLOCKED
                     ├→ SKIPPED
                     └→ CANCELLED
```

Une opération ne devient `READY` que lorsque toutes ses dépendances sont terminées.

## 7. Règles de calcul du socle

Tous les calculs sensibles utilisent `Prisma.Decimal`.

```text
manqueNet = max(0, besoinBrut - stockUtilisable - productionConfirméeDisponibleÀTemps)
```

Le stock utilisable exclut :

- les réservations actives à la date de besoin ;
- les lots bloqués, expirés, épuisés ou en refroidissement ;
- les lots dont la DLC précède le besoin ;
- les lots congelés sans décongélation planifiée ;
- les lots disponibles après l’heure de besoin ;
- les stocks d’un autre site.

Le moteur construit ensuite les quantités réalisables selon le mode fixe, les multiples, les formats ou une plage min/max/pas. Il peut retourner recommandé, minimal et optimisé, avec couverture, manque restant, surplus, lots et déficit de stockage.

La sélection des composants est FEFO et peut ventiler une quantité sur plusieurs lots. La capacité d’un conditionnement est le minimum des quotients disponibles/composition ; la variante limitante est explicitement retournée.

## 8. Services métier

### Implémentés

- `production-calculations.ts` : manque net, formats, lots, scénarios, stockage, FEFO, conditionnement et cycles ;
- `ProductionPlanningService` : profils, besoins, disponibilité par site, explosion récursive des sous-recettes, prévention des cycles, simulation et snapshots de recette ;
- `ProductionExecutionService` : campagnes, allocations, lots, opérations, validation transactionnelle, réservations FEFO, clôture atomique, pertes, transitions de conservation et traçabilité ;
- génération depuis un besoin réactif ou un menu avec le même moteur et un `TechnicalSheetVersion` immuable ;
- création automatique des besoins enfants lorsque les sous-recettes disponibles sont insuffisantes ;
- couverture sans fabrication lorsque le stock immédiatement utilisable satisfait déjà le besoin.

### Garanties transactionnelles

- les réservations rendent le stock indisponible sans diminuer le stock physique ;
- les consommations et les produits finis sont enregistrés dans une seule transaction sérialisable ;
- les clôtures de lots et les transitions de conservation sont idempotentes ;
- les mouvements de stock permettent de reconstituer production, consommation, réservation, perte, congélation et décongélation ;
- une quantité réservée ne peut pas être déplacée vers un autre état de conservation ;
- les insuffisances bloquent la validation, sauf dérogation explicite et motivée.

## 9. API

### Routes existantes conservées

- `/production/orders`
- `/production/orders/:id/status`
- `/production/orders/:id/realization`
- `/production/orders/:id/destocking/*`
- `/production/materials`, `/today`, `/calendar`, `/history`, `/exports`
- `/menus/menus/:id/generate-productions`

### Routes ajoutées au socle

- `GET /production/needs`
- `POST /production/needs`
- `GET /production/profiles`
- `POST /production/profiles`
- `PATCH /production/profiles/:id`
- `POST /production/simulations/suggestions`

L’endpoint de simulation est sans écriture. Les quantités d’entrée sont des chaînes décimales pour éviter une perte de précision JSON/JavaScript.

### Routes d’exécution ajoutées

- `GET|POST /production/campaigns`
- `GET /production/campaigns/:id`
- `POST /production/campaigns/:id/validate`
- `POST /production/batches/:id/start`
- `POST /production/batches/:id/complete`
- `PATCH /production/operations/:id`
- `GET /production/stock`
- `POST /production/stock/:id/transition`
- `GET /production/traceability/lots/:id`

La génération `POST /menus/menus/:id/generate-productions` crée désormais des besoins confirmés puis appelle ce même moteur de campagne. Elle ne maintient plus une logique de calcul parallèle.

## 10. Écrans proposés

Le composant Production a été réécrit comme un poste de pilotage unifié et typé :

1. tableau de bord avec urgences, retards, tâches et alertes ;
2. assistant réactif avec simulation serveur et choix de scénario ;
3. génération planifiée depuis les menus ;
4. campagnes, lots, opérations et clôture réelle ;
5. besoins futurs et planning hebdomadaire ;
6. stock de production avec états de conservation ;
7. historique et traçabilité des lots ;
8. paramétrage des profils, rendements, multiples et capacités simples.

Les textes structurants de ce module sont disponibles en français, anglais et finnois. Les quantités recommandées affichées sont exclusivement celles calculées par l’API : le navigateur ne duplique aucune règle métier.

## 11. Stratégie de migration

La migration `20260718210000_production_engine_foundation` est additive :

- création d’enums et de tables ;
- ajout de colonnes nullables ou munies de valeurs par défaut ;
- ajout d’index et de clés étrangères ;
- extension des enums existants ;
- conservation de `plannedPortions` dans les nouveaux champs campagne pour les ordres existants ;
- remplacement de l’index Stock par sa version incluant la variante et `NULLS NOT DISTINCT` ;
- contrôle bloquant explicite si des doublons logiques historiques doivent d’abord être consolidés.

Aucune table ni colonne métier n’est supprimée. La migration n’est pas appliquée automatiquement par cette mission. Avant déploiement réel : sauvegarde, `prisma migrate deploy` sur une copie, contrôle des doublons de stocks logiques et validation des ordres historiques sans site.

## 12. Fichiers du socle

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260718210000_production_engine_foundation/migration.sql`
- `apps/api/src/production/production-calculations.ts`
- `apps/api/src/production/production-calculations.spec.ts`
- `apps/api/src/production/production-planning.service.ts`
- `apps/api/src/production/dto/production-planning.dto.ts`
- `apps/api/src/production/production-execution.service.ts`
- `apps/api/src/production/production-execution.service.spec.ts`
- `apps/api/src/production/dto/production-execution.dto.ts`
- `apps/api/src/production/production.controller.ts`
- `apps/api/src/production/production.module.ts`
- `apps/api/src/production/production.service.ts`
- `apps/api/src/menus/menus.service.ts`
- `apps/api/src/menus/menus.module.ts`
- `apps/api/src/stocks/stocks.service.ts`
- `apps/api/src/users/users.service.ts`
- `apps/api/prisma/seed.ts`
- `apps/web/src/components/ProductionApp.tsx`
- `apps/web/src/api/client.ts`
- `apps/web/src/types.ts`

## 13. Risques et points de contrôle

- vérifier les stocks historiques dont `siteId` est nul ;
- traiter l’éventuel blocage de migration signalant des doublons logiques de stock historiques ;
- ne jamais produire un stock négatif silencieusement ;
- ne pas considérer un ordre seulement planifié comme production confirmée ;
- vérifier la capacité de stockage avant validation d’un surplus ;
- conserver les snapshots de recette dans toutes les origines de campagne ;
- centraliser le calcul matières actuellement dupliqué ;
- retirer progressivement les `// @ts-nocheck` ;
- remplacer le numérotage historique `count + 1` par une séquence dédiée si plusieurs instances API créent massivement des campagnes ;
- compléter les calendriers de réservation horaire des fours, cuves, moules, postes et équipes avant de présenter l’ordonnancement comme une optimisation exhaustive.

## 14. Hypothèses

- `ProductionOrder` est la campagne canonique pour préserver les données et les interfaces.
- chaque profil de production est rattaché à un site ; une fiche peut avoir plusieurs profils de site.
- le produit de sortie est défini par le profil, pas directement par la fiche technique historique.
- le stock physique reste exclusivement porté par `Stock` et recalculable depuis les mouvements.
- une réservation est une indisponibilité logique et ne crée pas une seconde quantité physique.
- les ressources horaires avancées restent hors du premier socle, mais les opérations et références de ressource ne les bloquent pas.

## 15. Prochaines phases

Le MVP métier décrit dans la mission est couvert. Les extensions qui restent volontairement au-delà de ce socle sont :

1. calendrier horaire et arbitrage de conflits pour fours, cuves, moules, cellules, postes et personnel ;
2. capacité volumétrique dynamique des chambres froides et congélateurs ;
3. optimisation multi-campagnes et proposition automatique du meilleur créneau ;
4. prévisions de vente, charge prévisionnelle et réduction assistée du gaspillage ;
5. intégrations plus profondes avec HACCP, Achats, Planning et livraisons multi-sites ;
6. tests end-to-end frontend et tests de concurrence PostgreSQL sous charge.

Ces évolutions peuvent s’appuyer sur les opérations, dépendances, références de ressource, mouvements et snapshots déjà introduits, sans créer un second moteur de production.
