# Module Achats V1

Le module Achats transforme les fournisseurs, produits, unités, sites et emplacements Stocks en un parcours de commande complet. Il ne crée aucun référentiel parallèle et conserve ses données lorsqu’il est désinstallé.

## Prérequis et installation

- Installer le module Stocks avant Achats.
- Installer Achats depuis le Store. L’installation est idempotente et ouvre le dashboard `purchasing-dashboard`.
- Créer une clé API et vérifier le domaine d’envoi dans Resend. La clé Resend se configure dans **Clés API & IA**, selon le même cycle que Mistral : elle est chiffrée au repos au niveau de l’organisation, masquée dans les réponses et n’est jamais renvoyée au frontend.
- Configurer `PURCHASING_RESEND_ENCRYPTION_KEY` avec un secret serveur dédié. Une clé historique en clair reste lisible si ce secret manque ; dès qu’il est disponible, sa lecture déclenche une migration chiffrée vérifiée avant l’effacement de la valeur historique.
- L’absence de Resend ou d’OCR n’empêche pas la préparation manuelle des commandes et des réceptions.

## Prise en main

L’onboarding peut être interrompu et repris :

1. comprendre le parcours préparer, envoyer, suivre et réceptionner ;
2. connecter l’API Resend et tester l’adresse d’envoi vérifiée avec `delivered@resend.dev`, ou reporter cette étape ;
3. enregistrer un premier vrai brouillon.

Les fournisseurs et produits restent exclusivement administrés dans Stocks. Le composeur recherche côté serveur les seuls produits dont `primarySupplierId` correspond au fournisseur sélectionné ; aucun catalogue Achats autonome n’est créé.

Un brouillon est autosauvegardé et protégé par un numéro de version. Les suggestions de réassort ne créent et n’envoient jamais une commande automatiquement. Une commande envoyée est immuable ; elle peut être dupliquée vers un nouveau brouillon.

## Réception d’une commande

Une commande envoyée ou confirmée peut recevoir plusieurs bons de livraison. Le BL peut être saisi manuellement ou importé en PDF/image. Avant validation Stocks, l’utilisateur contrôle :

- la correspondance avec la ligne commandée et le produit Stocks ;
- les quantités livrées et acceptées, les reliquats et les écarts ;
- le prix HT du BL, utilisé en priorité pour la valorisation ;
- le site et l’emplacement de destination.

La validation est transactionnelle et idempotente : une même réception Achats ne peut créer qu’une seule réception Stocks et qu’un seul ensemble de mouvements.

## Permissions

- `purchasing.read` : consultation ;
- `purchasing.draft` : création et modification de ses propres brouillons ;
- `purchasing.write` : confirmation, annulation et clôture ;
- `purchasing.send` : envoi fournisseur ;
- `purchasing.receive` : contrôle et validation des réceptions ;
- `purchasing.manage` : installation, paramètres et onboarding.

Les contrôles sont appliqués dans l’API. Les boutons masqués ou désactivés dans l’interface ne constituent pas la protection d’accès.

## Cycle de vie

`DRAFT → SENT → ACKNOWLEDGED → PARTIALLY_RECEIVED → RECEIVED`

- `CANCELLED` interrompt une commande avant toute réception, avec un motif.
- `CLOSED` clôture le reliquat d’une commande partiellement reçue, avec une justification.

Tous les changements importants sont enregistrés dans `PurchaseOrderEvent`. Chaque tentative Resend possède aussi sa propre ligne `PurchaseOrderDispatch`, réussie ou échouée. L’identifiant retourné par Resend est conservé avec la tentative.

## Architecture et contrats compatibles

`PurchasingService` reste la façade de compatibilité utilisée par le contrôleur. Les règles et responsabilités extraites sont portées notamment par :

- `PurchasingInstallationService` et `PurchasingDashboardService` ;
- `PurchaseOrderQueryService`, `PurchaseOrderNumberService`, `PurchaseOrderPolicy` et `PurchasingDeliveryService` ;
- `PurchaseDispatchService`, `PurchaseOrderPdfService` et `ResendPurchasingGateway` derrière l’interface `PurchasingEmailTransport` ;
- `PurchaseReceiptMatchingService` et le service Stocks partagé `StocksReceptionInventoryService` ;
- `PurchaseHistoryService` et les fonctions Decimal pures de `purchasing-calculations.ts`.

Les routes historiques sont conservées. Les routes optimisées ajoutées sont :

- `GET /purchasing/references/suppliers` ;
- `GET /purchasing/references/products?supplierId=…` ;
- `GET /purchasing/receipts/page` ;
- `GET /purchasing/receipts/:id`.

`GET /purchasing/receipts` reste disponible pour compatibilité, mais le client utilise désormais la pagination. Les commandes, réceptions et événements sont chargés selon l’onglet actif ; le détail d’une commande ou réception n’est chargé qu’à son ouverture.

Les tables `SupplierProductOffer` et `SupplierProductPriceHistory` sont volontairement conservées pour compatibilité historique. Le module Achats reconstruit ne les utilise plus comme source de prix ou de catalogue.

## Vérifications de livraison

Depuis la racine du projet :

```bash
npm run prisma:generate
npm run prisma:deploy -w apps/api
NODE_OPTIONS=--max-old-space-size=8192 npm run typecheck -w apps/api
NODE_OPTIONS=--max-old-space-size=8192 npm run typecheck -w apps/web
npm test -w apps/api -- --runInBand src/purchasing src/common/secrets/organization-api-key-secret.service.spec.ts src/stocks/stocks-reception-inventory.service.spec.ts src/stocks/stocks-ocr.service.spec.ts
npm run build -w apps/api
NODE_OPTIONS=--max-old-space-size=8192 npm run build -w apps/web
```
