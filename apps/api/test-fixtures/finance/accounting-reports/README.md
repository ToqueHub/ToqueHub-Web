# ToqueHub Finance — corpus OCR comptable

Ce corpus contient **30 rapports d’exercice entièrement synthétiques** : 10 français, 10 anglais et 10 finnois. Aucune donnée réelle ni personnelle n’y figure.

Les cas couvrent quatre tailles d’entreprise, des exercices calendaires et décalés, des montants en euros, milliers d’euros et millions d’euros, ainsi que plusieurs présentations : PDF texte, PDF multipage, scans, scans légèrement inclinés, PNG, CSV et XLSX simple ou multifeuille.

## Utilisation

- `manifest.json` contient la vérité attendue de chaque cas : période, langue, unité et agrégats comptables.
- `corpus-manifest.xlsx` est l’index lisible du corpus.
- `_verification/` contient les rendus utilisés pour le contrôle visuel ; ce dossier n’est pas nécessaire à l’import ToqueHub.
- Les scripts `generate-finance-ocr-corpus.py`, `generate-finance-ocr-workbooks.mjs` et `verify-finance-ocr-corpus.py` permettent de régénérer et contrôler les fixtures.

Le corpus sert à tester le parseur, le prompt OCR et les régressions. Il ne modifie pas les poids de Mistral : l’OCR reste validé par un schéma structuré, des règles comptables et des seuils de confiance avant consolidation.

## Principes de validation

1. Détecter la langue et la période comptable.
2. Interpréter correctement les séparateurs décimaux, les parenthèses, les signes finaux et les multiplicateurs d’unité.
3. Mapper les lignes vers `REVENUE`, `MATERIAL_PURCHASES`, `PAYROLL`, `OTHER_OPEX`, `FINANCIAL`, `TAX` ou `CASH`.
4. Exclure du grand livre les sous-totaux et résultats calculés afin d’éviter tout double comptage.
5. Placer les cas incomplets ou ambigus en contrôle humain au lieu de les consolider silencieusement.
