# Module Finance et comptabilité — fonctionnement métier

**Document de référence à partager avec un associé ou un partenaire**  
Version du 15 août 2026

## 1. Résumé en une minute

Le module Finance de ToqueHub rapproche trois familles de données qui n'ont ni la même fonction ni la même vitesse de mise à jour :

- la **caisse** décrit immédiatement les tickets, paiements, produits, remboursements et transactions ;
- la **comptabilité** décrit le chiffre d'affaires comptabilisé, les factures, les charges, les salaires, les amortissements, le résultat et la trésorerie ;
- le **budget** décrit un objectif futur ou une trajectoire de référence.

La règle fondamentale est la suivante :

> **Pour un mois entièrement couvert par la comptabilité, le chiffre comptable fait foi. Pour le mois encore ouvert, ToqueHub utilise les tickets de caisse dédupliqués et ajoute uniquement le chiffre d'affaires comptable absent de la caisse, notamment les factures clients.**

Les charges et les résultats comptables proviennent toujours de la comptabilité. Le budget ne remplace jamais le réalisé : il sert uniquement à calculer les objectifs et les écarts.

Cette logique permet à la fois :

- de suivre l'activité récente sans attendre le cabinet comptable ;
- de retrouver exactement les comptes officiels une fois le mois intégré en comptabilité ;
- de ne pas doubler un paiement présent à la fois dans une caisse et chez un prestataire de paiement ;
- de conserver séparément les ventes facturées qui n'ont pas transité par la caisse.

## 2. Ce que contient le module

Le module est organisé en sept vues complémentaires.

| Vue | Rôle principal | Période |
| --- | --- | --- |
| **Tableau de bord** | Synthèse financière, KPI personnalisables, budget et alertes | Exercice comptable au stade sélectionné |
| **Ventes & affluence** | Tickets, chiffre d'affaires caisse, TVA, paiements, produits et horaires | Période de vente sélectionnée |
| **Annuel** | Cumul du seul exercice comptable sélectionné, historique et budget | Dates exactes de l'exercice |
| **Mensuel** | Lecture du mois et comparaison avec les périodes pertinentes | Mois complet ou mois à date |
| **Journalier** | Pilotage opérationnel d'une journée | Journée sélectionnée |
| **Budget** | Choix, import et construction du budget de référence | Exercice comptable |
| **Sources** | Connexions, imports, couverture, synchronisation et qualité | Par source et établissement |

Le bouton **Personnaliser** sert uniquement à afficher ou masquer les KPI disponibles. Il ne change aucune formule et n'influence aucun total.

## 3. Les sources et leur rôle

### 3.1 Sources comptables

Fennoa est la connexion comptable actuellement utilisée. Le moteur est toutefois conçu autour du rôle **source comptable**, afin que la même logique puisse être utilisée avec une autre application de comptabilité.

Une source comptable peut fournir :

- le plan comptable et la catégorie des comptes ;
- les écritures du grand livre ;
- les exercices comptables et leurs dates exactes ;
- les soldes de banque et de caisse ;
- les budgets existants ;
- selon le connecteur, les clients, factures et historiques de facturation.

### 3.2 Sources de caisse et de paiement

Les connecteurs actuellement reconnus sont notamment :

- Loyverse ;
- FlatPay ;
- PayPal POS / Zettle ;
- les imports universels structurés.

Ils fournissent selon les cas :

- les tickets et reçus ;
- les montants HT, TTC et TVA ;
- le nombre de transactions ;
- les produits, catégories et quantités ;
- les remises et remboursements ;
- les moyens de paiement ;
- la date et l'heure précises de chaque vente.

### 3.3 Imports manuels

Le module accepte aussi des documents comptables, budgets et exports structurés. Les imports restent identifiés par source et par lot afin que l'origine de la donnée ne soit pas perdue.

### 3.4 Affectation à un établissement

Chaque source peut être affectée à un établissement. Les chiffres d'un établissement ne doivent utiliser que :

- ses caisses ;
- sa comptabilité directe ;
- son budget direct.

Une comptabilité ou un budget global ne peut suivre automatiquement un établissement que si celui-ci est le seul établissement actif concerné. Cette règle empêche d'attribuer arbitrairement des charges ou de la trésorerie globales à un site parmi plusieurs.

En vue consolidée, ToqueHub additionne les établissements inclus dans le périmètre.

## 4. Ordre de priorité des données

La priorité dépend du type d'indicateur. Il n'existe pas une source unique qui serait la meilleure pour tout.

| Information | Source prioritaire | Pourquoi |
| --- | --- | --- |
| **CA d'un mois entièrement couvert** | Comptabilité | C'est le montant officiel enregistré au grand livre |
| **CA du mois ouvert** | Caisse dédupliquée + factures/canaux comptables absents | La caisse est plus rapide ; les factures complètent les encaissements non passés en caisse |
| **Charges, achats, salaires, amortissements** | Comptabilité | Ces informations ne sont pas exhaustives dans la caisse |
| **Résultat comptable et résultat net** | Comptabilité | Ils dépendent de l'ensemble des comptes de produits et de charges |
| **Transactions, ticket moyen, produits, horaires** | Caisse | La comptabilité ne contient généralement pas le détail des tickets |
| **Trésorerie** | Derniers soldes comptables de banque/caisse | Il s'agit d'un solde, pas d'un total de ventes |
| **Objectifs et écarts** | Budget de référence choisi | Le budget est une cible indépendante du réalisé |

### 4.1 Décision appliquée au chiffre d'affaires

Pour chaque mois, ToqueHub applique les décisions suivantes dans cet ordre :

1. **Le mois est entièrement couvert ou clôturé en comptabilité**  
   Le CA affiché est exactement le CA comptable du mois. Il remplace le total opérationnel, même si la caisse est plus élevée ou plus faible.

2. **Le mois est encore ouvert et les tickets existent**  
   Le CA provisoire est calculé ainsi :

   `CA provisoire HT = tickets de caisse HT dédupliqués + factures comptables absentes + canaux comptables absents`

   Les récapitulatifs comptables d'une caisse déjà connectée ne sont pas ajoutés une deuxième fois.

3. **La caisse est absente mais la comptabilité contient des écritures**  
   Le CA comptable est utilisé comme solution de repli.

4. **Aucune donnée exploitable n'est disponible**  
   La valeur est déclarée indisponible. Elle n'est pas transformée artificiellement en zéro.

Le bloc de rapprochement conserve, pour contrôle, le CA caisse HT, le CA comptable, leur différence, la base finalement retenue et la ventilation des compléments : factures, canaux absents, ajustements et récapitulatifs qui se chevauchent. Ces éléments expliquent le chiffre sans créer un deuxième chiffre concurrent dans les KPI.

### 4.2 Ce que signifie « couvert par la comptabilité »

La couverture est déterminée à partir de la date de fin de couverture fournie par les sources comptables sélectionnées et, lorsqu'elle existe, de la date de verrouillage comptable.

S'il existe plusieurs sources comptables dans le périmètre, ToqueHub retient la date de couverture complète commune. Un mois ne devient donc définitif que lorsque toutes les sources comptables nécessaires le couvrent.

Une clôture ne suffit pas à ajouter aveuglément les écritures et les tickets : elle sert à déterminer le caractère définitif de la période. Le moteur de rapprochement continue d'empêcher les doubles comptes.

### 4.3 Comparaison historique à une date intermédiaire

Le grand livre peut contenir un total mensuel sans détail quotidien fidèle. Pour comparer, par exemple, les 15 premiers jours d'août 2026 aux 15 premiers jours d'août 2025 :

- le total du mois historique reste ancré sur le montant comptable officiel ;
- la répartition à l'intérieur du mois suit le profil temporel réel des tickets disponibles ;
- la somme de toutes les fractions du mois retombe exactement sur le total comptable.

Le total mensuel est donc exact. Une valeur historique « au même jour » est une allocation contrôlée lorsque la comptabilité n'offre qu'un agrégat mensuel.

## 5. Prévention des doubles comptes

La déduplication est faite dans le moteur de calcul, sans ajouter de KPI technique au tableau de bord.

### 5.1 Doublons au sein d'un même fournisseur

Plusieurs imports ou anciennes connexions peuvent représenter la même caisse. ToqueHub lit toutes les copies techniques du périmètre activé, puis fusionne :

- le même numéro de reçu chez un même fournisseur et sur le même site ;
- ou la même empreinte : fournisseur, site, date/heure, montant, nombre de transactions et moyen de paiement.

La ligne provenant de la caisse principale ou contenant le détail le plus riche est conservée.

### 5.2 Doublons entre deux fournisseurs

Exemple réel : Loyverse enregistre un ticket et transmet le paiement au terminal PayPal/Zettle. Les deux systèmes renvoient alors deux lignes pour une seule vente.

ToqueHub ne fusionne ces lignes que si plusieurs preuves concordent :

- même établissement ;
- fournisseurs différents ;
- même montant TTC au centime ;
- horodatage à 90 secondes près ;
- éventuel décalage entier de fuseau horaire détecté entre API et export ;
- profil suffisamment répété pour prouver qu'une source miroir l'autre.

Cette exigence évite de supprimer deux ventes réellement distinctes qui auraient simplement le même montant.

### 5.3 Libellés techniques pris pour des produits

Un numéro de transaction, de ticket, de reçu ou un identifiant technique n'est jamais considéré comme un produit. Les libellés purement numériques, les UUID et les libellés du type « transaction … » sont exclus des classements produits, tout en restant présents dans la donnée brute pour l'audit.

L'exclusion d'un faux produit et la déduplication du CA sont deux contrôles différents : le CA n'est retiré que lorsqu'un véritable doublon de transaction est identifié.

## 6. Gestion des périodes comptables

### 6.1 Vue annuelle

La vue **Annuel** n'additionne jamais arbitrairement deux années. Elle recherche d'abord l'exercice comptable qui contient la date « Situation au ».

Exemple : avec un exercice du **1er juin 2026 au 31 mai 2027** :

- une situation au 31 juillet 2026 cumule uniquement juin et juillet ;
- une situation au 14 août 2026 cumule juin, juillet et août jusqu'au 14 ;
- elle n'inclut rien avant le 1er juin 2026 ni après la date sélectionnée.

Les dates viennent en priorité des exercices synchronisés depuis la comptabilité. Un premier exercice exceptionnel de 18 mois reste donc un exercice de 18 mois ; il n'est pas ramené artificiellement à 12 mois.

Si aucun exercice comptable n'est disponible, le module utilise en repli le mois de début d'exercice configuré dans ToqueHub et construit une période de 12 mois.

### 6.2 Comparaison annuelle

Les exercices précédents sont comparés au **même nombre de jours écoulés** dans chacun de leurs propres calendriers, avec un maximum à la date réelle de fin de l'exercice concerné.

Ainsi, un exercice de 18 mois peut être comparé sans fausser les exercices de 12 mois. La description affiche les dates exactes utilisées.

### 6.3 Vue mensuelle

- Un mois terminé est affiché du premier au dernier jour.
- Le mois en cours est affiché du premier jour à la date de situation disponible.
- La comparaison N-1 reprend la même portion de mois.
- L'historique mensuel précise s'il compare des mois complets ou des périodes à date.

### 6.4 Vue journalière

La journée sélectionnée est comparée :

- au même jour de la semaine une semaine plus tôt ;
- au même jour de la semaine deux semaines plus tôt ;
- au jour équivalent de l'année précédente, décalé de 364 jours afin de conserver le même jour de semaine.

La vue journalière reste naturellement provisoire et principalement fondée sur la caisse.

## 7. Formules des principaux KPI

Tous les montants de chiffre d'affaires et de résultat sont présentés hors taxes lorsque le KPI le requiert. Les montants TTC restent utilisés pour les indicateurs de ticket et de paiement.

Il faut notamment distinguer :

- le **CA des tableaux financiers**, qui est un CA HT rapproché avec la comptabilité ;
- le **Chiffre d'affaires TTC** de la vue Ventes & affluence, qui décrit les encaissements issus des tickets ;
- le **CA net caisse** également disponible dans l'analyse des ventes.

Un écart entre un montant TTC de vente et un montant HT financier est donc normal s'il correspond à la TVA. En revanche, deux KPI HT portant sur la même période et le même périmètre utilisent le même moteur de rapprochement.

| KPI | Formule métier | Source |
| --- | --- | --- |
| **Chiffre d'affaires** | CA rapproché selon les règles de priorité de la section 4 | Comptabilité ou mix caisse/comptabilité |
| **Charges d'exploitation** | Achats/matières + masse salariale + autres charges d'exploitation, amortissements compris | Comptabilité |
| **Masse salariale** | Salaires + charges employeur classés dans les comptes de personnel | Comptabilité |
| **Résultat avant amortissements** | CA comptable + autres produits d'exploitation − achats − salaires − autres charges hors amortissements | Comptabilité |
| **Résultat d'exploitation comptable** | CA comptable + autres produits d'exploitation − toutes les charges d'exploitation | Comptabilité |
| **Résultat opérationnel à date** | CA rapproché + autres produits d'exploitation − charges comptables disponibles | Mix si le CA est encore provisoire |
| **Résultat net** | Résultat d'exploitation comptable − charges/résultat financier − impôts, selon les signes comptables normalisés | Comptabilité |
| **Marge contributive** | CA rapproché − achats/matières | Mix CA + comptabilité |
| **Taux de marge contributive** | Marge contributive ÷ CA × 100 | Calculé |
| **Charges fixes** | Masse salariale + autres charges d'exploitation | Comptabilité |
| **Seuil de rentabilité** | Charges fixes ÷ taux de marge contributive | Calculé |
| **Transactions** | Somme des tickets dédupliqués | Caisse |
| **Ticket moyen** | Ventes TTC ÷ nombre de transactions | Caisse |
| **Trésorerie disponible** | Dernier solde disponible des comptes de banque et de caisse à la date sélectionnée | Comptabilité |

### 7.1 Pourcentage par rapport au CA

Les KPI financiers comparables affichent automatiquement leur poids dans le chiffre d'affaires :

`Poids du KPI = montant du KPI ÷ chiffre d'affaires de la même période × 100`

Le chiffre d'affaires affiche donc 100 %. Une charge de 25 000 € pour un CA de 100 000 € affiche 25 % du CA. Un résultat négatif conserve un pourcentage négatif.

Ce ratio n'est pas appliqué aux valeurs qui ne sont pas de même nature, comme la trésorerie, le nombre de transactions ou le ticket moyen.

### 7.2 Catégorisation comptable finlandaise actuellement utilisée

Avec Fennoa et un plan comptable finlandais, le moteur applique notamment les plages suivantes :

| Comptes | Catégorie ToqueHub |
| --- | --- |
| 3000–3899 | Chiffre d'affaires |
| 3900–3999 | Autres produits d'exploitation |
| 4000–4999 | Achats et matières |
| 5000–6799 | Masse salariale |
| 6800–6899 | Amortissements |
| 6900–8999 | Autres charges d'exploitation |
| 9000–9799 | Résultat/charges financières |
| 9800–9999 | Impôts |

Pour un autre logiciel ou un autre plan comptable, le module utilise les catégories de comptes configurées ou synchronisées, plutôt que de supposer que les numéros finlandais s'appliquent.

## 8. Budget et trajectoire

### 8.1 Origines possibles d'un budget

Trois origines peuvent coexister :

1. **Budget synchronisé depuis la comptabilité** : tous les budgets existants sont conservés, y compris plusieurs versions sur la même période.
2. **Budget importé manuellement** : fichier structuré affecté à un exercice et, si nécessaire, à un établissement.
3. **Proposition Mistral** : budget suggéré à partir de l'historique comptable, puis accepté explicitement par l'utilisateur.

### 8.2 Choix du budget de référence

La sélection est mémorisée séparément pour chaque combinaison **établissement + dates d'exercice**.

L'ordre de choix est :

1. le budget explicitement sélectionné par l'utilisateur pour cette période et ce site ;
2. à défaut, un budget importé marqué comme référence ;
3. à défaut, le premier budget candidat compatible avec l'exercice.

Changer de budget de référence modifie les objectifs et écarts, jamais les chiffres réalisés.

### 8.3 Proposition Mistral et garde-fous

Mistral peut proposer un budget si :

- un établissement précis est sélectionné ;
- la comptabilité de cet établissement est disponible ;
- au moins un exercice antérieur existe ;
- au moins 12 mois comptables exploitables sont présents.

Jusqu'à trois exercices historiques sont analysés. Mistral reçoit les mois comptables vérifiés, la saisonnalité, la structure des coûts et, si l'utilisateur en fournit, ses hypothèses explicites.

ToqueHub recalcule ensuite lui-même tous les résultats et contrôle notamment :

- le nombre exact de mois de l'exercice cible ;
- l'absence de mois manquant ou dupliqué ;
- la validité, le signe et l'ordre de grandeur des montants ;
- l'évolution du CA par rapport au dernier exercice ;
- le ratio charges/CA ;
- la marge nette ;
- la structure achats/masse salariale ;
- les écarts de saisonnalité mensuelle ;
- la profondeur de l'historique.

Une proposition contenant un contrôle bloquant ne peut pas devenir le budget utilisé. Une proposition acceptable doit encore être validée par l'utilisateur. Mistral est donc une aide à la construction, jamais une source de vérité comptable.

### 8.4 Calcul des écarts au budget

Pour chaque KPI :

`Écart = réalisé − budget`

`Écart en % = écart ÷ valeur absolue du budget × 100`

L'interprétation dépend du KPI :

- pour le CA et les résultats, un écart positif est favorable ;
- pour les charges et la masse salariale, un écart négatif est favorable.

Le cumul annuel compare uniquement le réalisé écoulé au budget correspondant aux mêmes mois. Il ne compare pas trois mois de réalisé à douze mois de budget.

Le mois commencé est considéré comme un mois engagé : le réalisé s'arrête à la date de situation, tandis que la carte mensuelle indique l'objectif budgétaire du mois complet. Les objectifs de rythme journalier et de transactions tiennent, eux, compte des jours d'activité détectés.

## 9. Statuts affichés

| Statut | Signification |
| --- | --- |
| **Définitif / comptable** | La période est entièrement couverte par la comptabilité |
| **Provisoire** | La période peut encore évoluer, généralement parce que le mois est ouvert ou que la comptabilité n'est pas à jour |
| **Mixte** | Le CA associe la caisse et des compléments comptables non redondants |
| **Indisponible** | La donnée nécessaire n'existe pas dans le périmètre sélectionné |

« Provisoire » ne signifie pas « faux ». Cela signifie que le montant est le meilleur état opérationnel disponible avant son remplacement par la vérité comptable du mois complet.

## 10. Exemple concret : pourquoi 36 000 € et 15 361,86 € ne se contredisent pas

Pour l'exercice du **1er juin 2025 au 31 mai 2026**, le rapprochement du grand livre a donné :

| Indicateur | Montant rapproché |
| --- | ---: |
| Chiffre d'affaires comptable | **331 166,28 €** |
| Résultat avant amortissements | **36 564,09 €** |
| Résultat d'exploitation comptable | **20 852,37 €** |
| Résultat net | **15 361,86 €** |

Ces montants répondent à des questions différentes :

- **36 564,09 €** mesure la performance avant les amortissements ;
- **20 852,37 €** tient compte des amortissements dans l'exploitation ;
- **15 361,86 €** tient ensuite compte du financier et des impôts pour obtenir le résultat net.

La différence initiale ne venait donc pas seulement d'un calcul erroné : le libellé comparait aussi des niveaux de résultat différents. ToqueHub les présente désormais comme des KPI distincts.

Autres contrôles comptables effectués :

| Exercice | CA comptable | Résultat avant amortissements | Résultat d'exploitation comptable | Résultat net |
| --- | ---: | ---: | ---: | ---: |
| 20/12/2022 → 31/05/2024 | 368 055,23 € | −7 218,83 € | −35 150,78 € | −48 295,68 € |
| 01/06/2024 → 31/05/2025 | 333 296,89 € | 35 514,30 € | 14 565,34 € | 7 108,58 € |
| 01/06/2025 → 31/05/2026 | 331 166,28 € | 36 564,09 € | 20 852,37 € | 15 361,86 € |

Le premier exercice de cette liste couvre bien 18 mois et reste traité comme tel.

## 11. Contrôles de cohérence réalisés

La logique actuelle a été vérifiée sur l'ensemble des mois comptables disponibles dans la base de travail :

- **40 mois** entièrement couverts ont été rapprochés directement du grand livre ;
- **0 écart** constaté sur le CA mensuel comptable ;
- **0 écart** constaté sur le résultat d'exploitation mensuel comptable ;
- le mois de juillet 2026 retrouve un CA comptable complet de **74 123,57 €** ;
- les tests couvrent les exercices atypiques, les budgets multiples, les périodes partielles, les factures, les sources miroirs, les fuseaux horaires et les périmètres par établissement ;
- les tests automatisés Finance et les contrôles de types de l'API et de l'interface passent.

## 12. Limites à connaître

Le module réduit les erreurs de rapprochement, mais ne peut pas créer une information absente :

- tant que la comptabilité n'a pas couvert le mois, le CA reste provisoire ;
- si une écriture comptable est mal classée, le résultat officiel reproduira ce classement jusqu'à sa correction dans la comptabilité ou dans le mapping du compte ;
- le détail des transactions et produits reste dépendant de la qualité des exports de caisse ;
- une comparaison historique à mi-mois peut être une allocation contrôlée du total comptable lorsque le grand livre ne fournit pas de chronologie journalière ;
- la trésorerie dépend de la fraîcheur des écritures bancaires ;
- un budget décrit une intention et non une prévision garantie.

## 13. Lecture recommandée pour la direction

Pour lire rapidement la situation :

1. vérifier l'établissement et la date « Situation au » ;
2. lire l'exercice et ses dates exactes ;
3. regarder si la période est comptable, mixte ou provisoire ;
4. lire le CA, les charges, le résultat avant amortissements, le résultat d'exploitation comptable puis le résultat net ;
5. utiliser le pourcentage du CA pour juger le poids de chaque charge ;
6. comparer uniquement avec le budget de référence affiché ;
7. ouvrir **Sources** en cas de date de couverture ancienne ou de donnée indisponible ;
8. utiliser **Ventes & affluence** pour expliquer le détail opérationnel, pas pour remplacer les comptes officiels d'un mois clôturé.

## 14. Principe de gouvernance

La répartition des responsabilités peut être résumée ainsi :

- **la caisse explique l'activité** ;
- **la comptabilité certifie les mois couverts** ;
- **ToqueHub rapproche, déduplique, calcule et rend les écarts lisibles** ;
- **le budget fixe la cible** ;
- **Mistral aide à analyser ou proposer, sans jamais modifier seul la vérité comptable** ;
- **l'utilisateur choisit le périmètre et le budget de référence**.

Cette séparation est volontaire : elle permet d'obtenir un pilotage rapide au quotidien tout en garantissant que les périodes comptables terminées retombent sur les montants officiels.
