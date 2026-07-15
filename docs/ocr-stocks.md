# OCR Stocks V1

## Configuration

Variables backend :

- `MISTRAL_API_KEY` ou `OCR_MISTRAL_API_KEY` : clé API Mistral globale, optionnelle si une clé est renseignée dans l’organisation.
- `OCR_PROVIDER` : `mistral` par défaut.
- `OCR_MISTRAL_MODEL` : `mistral-ocr-latest` par défaut.
- `OCR_MAX_FILE_MB` : `20` par défaut.
- `OCR_MAX_FILES` : `8` par défaut.
- `OCR_TIMEOUT_MS` : `60000` par défaut.
- `OCR_MISTRAL_DOCUMENT_ANNOTATION` : `true` par défaut. Mettre `false` pour désactiver l’annotation structurée Mistral OCR et revenir au flux OCR + analyse IA séparée.
- `STOCKS_OCR_UPLOAD_DIR` ou `UPLOAD_DIR` : stockage local des originaux.

La clé peut aussi être ajoutée depuis `Organisation > Général > Clés API`. Si aucune clé Mistral n’est disponible, l’interface Stocks bloque l’import OCR avant l’upload et redirige vers la configuration. La clé n’est jamais renvoyée en clair au frontend.

## Formats supportés

- PDF
- PNG
- JPEG / JPG
- WEBP
- HEIC / HEIF
- AVIF

Chaque fichier est limité à 20 Mo par défaut. Un import contient au maximum 8 fichiers.

## Workflow utilisateur

1. Ouvrir `Stocks`.
2. Cliquer sur `Importer facture / BL`.
3. Déposer un ou plusieurs fichiers.
4. Lancer l’analyse OCR.
5. Attendre le statut `prêt à vérifier`.
6. Corriger fournisseur, dates, totaux, lignes et produits.
7. Créer manuellement les produits manquants si nécessaire.
8. Créer la réception.

Le stock est impacté uniquement à la validation finale. Avant cela, aucun mouvement `RECEPTION` n’est créé.

## Workflow technique

L’upload crée un `Document` générique isolé par organisation. L’analyse crée ou réutilise un `OcrDocument`, appelle `mistral-ocr-latest` côté backend avec tables markdown et annotation structurée JSON quand l’API l’accepte, stocke le markdown et le JSON brut, puis génère une `OcrBusinessExtraction`.

Si l’annotation structurée est présente et exploitable, elle est utilisée comme première compréhension métier. Sinon, le backend conserve le repli existant : analyse IA Mistral du markdown OCR, puis parsing heuristique si nécessaire. Si Mistral refuse les options enrichies de l’OCR, le backend retente automatiquement l’OCR de base.

Les exports Kespro sont traités comme des commandes/confirmations fournisseur et le fournisseur est normalisé à `Kespro`, même si l’OCR ne conserve pas l’URL `kespro.fi`. Les libellés produits Kespro sont aussi inspectés pour récupérer le conditionnement produit (`500 g par unité`, `250 g par unité`, `1 L par unité`, etc.). Ce conditionnement est conservé comme aide à la création produit, sans convertir automatiquement les quantités de réception tant qu’aucune conversion produit-spécifique n’a été validée.

La validation utilisateur crée ensuite une `StockReception`, ses `StockReceptionLine`, les lots si un numéro de lot ou une DLC existe, puis les mouvements `RECEPTION`. L’opération est transactionnelle.

## Permissions et sécurité

Les permissions ajoutées au catalogue sont :

- `stocks.receptions.create`
- `stocks.ocr.import`
- `stocks.ocr.validate`

Les endpoints restent filtrés par organisation et protégés par authentification. Les rôles opérationnels Stocks autorisés peuvent importer, consulter, télécharger, corriger et valider.

Les documents originaux ne sont servis que via endpoint authentifié. Aucun lien public direct n’est créé.

## Limites V1

- Pas de matching IA avancé.
- Pas de création automatique de produit.
- Pas de commande fournisseur automatique.
- Pas de paiement ni rapprochement comptable.
- Pas de mouvement de stock avant validation utilisateur.
- Pas d’OCR local.
- Pas de mode démo OCR visible en production.

## Coût Mistral

Chaque analyse appelle l’API Mistral OCR. Les coûts dépendent du volume de documents, du nombre de pages et de la tarification Mistral applicable au moment de l’usage.
