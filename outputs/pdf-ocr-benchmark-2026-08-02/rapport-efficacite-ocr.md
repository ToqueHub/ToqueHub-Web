# Rapport comparatif - analyse PDF ToqueHub vs Firecrawl

Date du test : 2 août 2026  
Corpus : 100 PDF, 105 pages  
Décision : **conserver l'OCR Mistral de ToqueHub et ajouter Firecrawl en pré-analyse; ne pas effectuer de remplacement complet.**

## Résumé exécutif

Firecrawl est extrêmement rapide et son routage a été correct sur **100/100 PDF**. Son passage médian complet sur les 100 documents a pris **118.2 ms**. En revanche, il n'effectue pas d'OCR : les **60 scans** et les **5 PDF mixtes** ne sont pas entièrement extractibles sans le moteur actuel.

Sur les 35 PDF à texte natif, l'extraction Firecrawl a pris une médiane de **2.14 ms**, contre **1652 ms** pour ToqueHub/Mistral, soit un facteur de **773x**. Mais la qualité moyenne est inférieure : **0.829** contre **0.910**.

Pour les 5 documents métier natifs, l'écart est plus important : score global **0.600** contre **0.810**, et fidélité des tableaux **0.645** contre **1.000**. C'est le point décisif pour Stocks.

## Scénarios comparés

| Scénario | Local | Appels OCR | Pages OCR | Qualité globale | Temps total séquentiel | Gain de temps |
|---|---:|---:|---:|---:|---:|---:|
| ToqueHub OCR actuel | 0 | 100 | 105 | 0.894 | 238.7 s | 0.0 % |
| Remplacement complet Firecrawl | 100 | 0 | 0 | 0.313 | 0.1 s | 100.0 % |
| Hybride rapide | 35 | 65 | 70 | 0.866 | 177.1 s | 25.8 % |
| Hybride protégé (sans tables) | 20 | 80 | 85 | 0.882 | 201.3 s | 15.6 % |

Le remplacement complet est rejeté : son score global tombe à **0.313**, essentiellement parce que Firecrawl ne lit pas les scans. L'hybride rapide économise **35.0 %** des appels OCR et **25.8 %** du temps dans ce corpus, mais perd **0.028** point de qualité.

L'hybride protégé est la meilleure piste de pilote : il réserve Firecrawl aux PDF natifs sans table détectée. Il économise **20.0 %** des appels, réduit le temps de **15.6 %**, et limite la baisse de qualité à **0.012**. Tous les 15 documents métier du corpus restent alors sur Mistral.

## Résultats par type de PDF

| Catégorie | N | Score ToqueHub | NID texte | Latence médiane ToqueHub | Score Firecrawl |
|---|---:|---:|---:|---:|---:|
| native_text | 35 | 0.910 | 0.941 | 1652 ms | 0.829 |
| scan_clean | 18 | 0.906 | 0.930 | 1674 ms | 0.000 |
| scan_lowres | 18 | 0.922 | 0.943 | 1502 ms | 0.000 |
| scan_skewed | 12 | 0.814 | 0.870 | 1948 ms | 0.000 |
| scan_noisy | 6 | 0.920 | 0.960 | 1768 ms | 0.000 |
| scan_compressed | 6 | 0.836 | 0.915 | 1527 ms | 0.000 |
| mixed | 5 | 0.871 | 0.966 | 1722 ms | 0.453 |

## Fiabilité et rapidité

- Firecrawl : 100 appels locaux réussis, décision local/OCR correcte dans 100 cas sur 100; débit séquentiel médian de **846 PDF/s** après initialisation.
- ToqueHub/Mistral : **99/100** réussites au premier passage; médiane **1711 ms**, p95 **3199 ms**.
- Le test-068 a atteint le timeout de production à 60 s. Une relance diagnostique a réussi en 2 046 ms, ce qui indique un incident transitoire et justifie un retry borné.
- Sur les 35 PDF natifs, Firecrawl gagne le score global dans 9 cas, Mistral dans 25 cas, avec 1 égalité.

## Méthode

Le corpus combine 90 pages publiques uniques issues d'OpenDataLoader Bench et 15 documents métier synthétiques distincts. Il contient 35 PDF natifs, 18 scans propres, 18 scans basse résolution, 12 scans inclinés, 6 scans bruités, 6 scans fortement compressés et 5 PDF mixtes de deux pages. Les documents métier couvrent factures, bons de livraison, confirmations de commande, tickets et catalogues en français, finnois et anglais.

Les sorties Markdown sont comparées à une vérité terrain avec les métriques OpenDataLoader : NID pour le texte et l'ordre de lecture, TEDS pour les tableaux, MHS pour les titres. Le score global est la moyenne des métriques disponibles par document. Les temps Firecrawl mesurent l'appel en mémoire après initialisation; les temps ToqueHub incluent encodage base64, réseau et traitement Mistral via la classe réellement utilisée dans le dépôt.

Versions : pdf-inspector npm 1.11.2, source Firecrawl commit a15ec2d68d51dbe6a39d1da688ec7a3f642d846c; OpenDataLoader Bench commit 7af1d8f4d0c09f51ea1a5c6ba5f66e993286d109; modèle ToqueHub mistral-ocr-latest.

## Recommandation

1. **Ne pas remplacer Mistral OCR par Firecrawl dans Stocks.** Les scans exigent l'OCR et les tableaux métier sont sensiblement mieux reconstruits par Mistral.
2. **Ajouter Firecrawl comme pré-analyse locale.** Exploiter le type PDF, les pages à OCR, les problèmes d'encodage et la détection de tables pour décider du parcours.
3. **Piloter l'hybride protégé derrière un feature flag.** Fast-path uniquement si le PDF est TextBased, sans problème d'encodage, sans page à OCR et sans table détectée.
4. **Ajouter un retry borné sur timeout/réseau.** Une seule relance avec backoff et métriques séparées suffit pour traiter le cas observé sans masquer les pannes.
5. **Avant d'élargir le fast-path aux documents Stocks**, constituer un jeu anonymisé de vraies factures/BL et mesurer les champs métier : fournisseur, numéros, dates, totaux, références, quantités, unités et prix.

## Limites

- Les 15 documents métier sont synthétiques; aucune facture réelle ni donnée RH du dépôt n'a été envoyée au benchmark.
- Le benchmark mesure la lecture PDF/Markdown, pas l'exactitude finale de chaque champ de réception de stock.
- Les gains d'appels et de pages dépendent du taux réel de PDF natifs en production. Ici, il est de 35 %.
- Les temps Mistral incluent la variabilité réseau et un timeout réel; les temps Firecrawl sont locaux et après initialisation.

## Sources et artefacts

- Firecrawl pdf-inspector : https://github.com/firecrawl/pdf-inspector
- OpenDataLoader Bench : https://github.com/opendataloader-project/opendataloader-bench
- Résultats machine : `comparison.json`, `*/results.json`, `*/evaluation.json` et `*/evaluation.csv` dans ce dossier.
