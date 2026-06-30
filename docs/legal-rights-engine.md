# Moteur Droits RH/Planning

## Source V1

La base France V1 provient de `docs/legal/toquehub_base_droits_rh_planning_france_v1.xlsx`.

Elle est normalisée dans `apps/api/src/legal-rights/data/fr-v1.json` avec :

- référentiels `legal_regimes`, `collective_agreements`, `public_regimes` ;
- catalogue `legal_rights` ;
- versions datées `legal_right_rule_versions` ;
- mappings indicatifs `legal_job_families` et `legal_job_to_agreement_mappings` ;
- tags Toquehub, sources officielles et lots `requires_review`.

Le hash SHA-256 du classeur est conservé dans `legal_import_batches.sourceHash`.

## Pays De Réglementation

Le pays utilisé par les droits RH et le planning est `Organization.regulatoryCountryCode`.

Ce réglage est distinct de la langue d’interface : une organisation peut utiliser ToqueHub en français et relever de la Finlande, ou utiliser ToqueHub en anglais et relever de la France.

Pour l’instant les valeurs prévues sont :

- `FR` : France, branché sur la base légale France V1 ;
- `FI` : Finlande, structure prête mais base légale à importer ultérieurement ;
- `null` : non configuré.

Une nouvelle organisation reste à `null`. La démo locale est seedée en `FR`. Le réglage se fait dans `Organisation > Général`, carte “Pays de réglementation”, avec le texte d’aide produit. Changer ce pays peut modifier les droits salariés, conventions, jours fériés et contrôles planning ; les anciens calculs doivent donc rester historisés.

Le frontend ne doit pas proposer de sélection pays dans `RH > Droits`. Il lit l’organisation active et appelle les endpoints droits sans imposer `country`. Côté backend, les endpoints tenant-aware utilisent `organization.regulatoryCountryCode` comme source de vérité.

Si le pays est absent :

- `GET /rights/search` retourne `status = "missing_regulatory_country"` et aucun droit ;
- `POST /rights/calculate` et `POST /planning/compliance/check` retournent `calculation_status = "blocked"`, `reason = "missing_regulatory_country"`.

## Import Idempotent

L’import est assuré par `seedFrenchLegalRights()` dans `apps/api/src/legal-rights/legal-rights.seed.ts`.

Il fait des `upsert` sur les clés stables :

- régime : `code` ;
- convention : `key` ;
- régime public : `code` ;
- droit : `code` ;
- version de règle : `stableId` ;
- famille métier : `code` ;
- mapping métier : `stableKey`.

Relancer `npm run prisma:seed -w apps/api` met à jour les règles sans doublons.

Pour charger uniquement la base légale France V1 dans une instance locale/demo :

```bash
npm run seed:legal-rights
```

Avant le seed, appliquer la migration si les tables `legal_*` n’existent pas encore :

```bash
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
```

Dans l’application locale, le frontend Vite appelle l’API via `/api`, proxifié vers `http://localhost:3000`. Après une modification du module droits, redémarrer l’API sur le port 3000, sinon l’écran RH peut encore interroger une ancienne version et afficher `0 résultat(s)`, `404 /rights/diagnostics` ou `500 /rights/search?regime=all`.

## Résolution

Le droit applicable n’est jamais déduit du métier seul.

Ordre logique :

`pays -> privé/public -> convention ou régime public -> établissement -> contrat -> métier -> ancienneté -> temps de travail -> accords locaux -> période`.

Si un profil explicite existe dans `employee_legal_profiles`, il est prioritaire. Sinon le moteur dérive un profil minimal depuis l’organisation, l’établissement, le contrat et le salarié, avec un avertissement si convention/régime reste à confirmer.

## Calcul Et Audit

Endpoints principaux :

- `GET /rights/search`
- `GET /rights/diagnostics`
- `GET /rights/:id`
- `POST /rights/:id/activate`
- `POST /rights/import/fr-v1`
- `POST /rights/calculate`
- `POST /planning/compliance/check`
- `GET /rights/employees/:employeeId/profile`
- `PUT /rights/employees/:employeeId/profile`

`GET /rights/diagnostics` retourne les compteurs d’import, le pays réglementaire de l’organisation, l’état de la base légale du pays courant, les configurations établissement et le dernier import.

`GET /rights/search?regime=all&status=all&includeRequiresReview=true` doit retourner les droits du pays réglementaire de l’organisation, y compris les règles à valider avec badge UI. Le paramètre `country` reste utile pour des outils hors tenant, mais l’application ne doit pas s’en servir comme source produit.

`POST /rights/:id/activate` crée ou met à jour une configuration établissement dans `hr_entitlement_rules` sans dupliquer la règle juridique. Le lien source est conservé dans les colonnes `sourceRightId`, `sourceRuleVersionId` et aussi dans `metadata.sourceLegalRightId`, `metadata.sourceRuleVersionId`, `metadata.sourceRuleStableId` pour compatibilité.

Le modèle logique est :

`legal_right -> legal_right_rule_versions -> hr_entitlement_rules`

`hr_entitlement_rules` représente ici la configuration établissement :

- `enabled` active/désactive le droit pour l’établissement ;
- `sourceRightId` pointe vers le droit légal ;
- `sourceRuleVersionId` pointe vers la version juridique sélectionnée ;
- `localSettingsJson` contient les paramètres locaux ;
- `overrideReason` explique une surcharge locale.

La désactivation d’un droit ne supprime pas la règle légale. Une surcharge locale doit rester explicite et auditable.

Chaque calcul crée, sauf `persist: false`, une entrée `legal_calculation_runs`, met à jour `legal_right_counters`, et écrit les messages dans `legal_calculation_audit_logs`.

Les règles `requires_review` ne sont pas inventées. Si aucune règle active/calculable ne peut être appliquée, le compteur revient avec `calculation_status = "incomplete"`.

## Référentiel, Configuration, Attribution, Compteur

Les droits RH utilisent quatre niveaux distincts.

| Niveau | Table actuelle | Rôle | Ce que ce niveau ne doit pas faire |
| --- | --- | --- | --- |
| Référentiel légal | `legal_rights` | Décrit le droit juridique stable : nom, catégorie, tags, description. | Ne stocke pas les choix d’un établissement. |
| Version calculable | `legal_right_rule_versions` | Porte la règle datée, sourcée, priorisée et calculable. | Ne dépend pas d’un salarié ou d’une organisation. |
| Configuration établissement | `hr_entitlement_rules` | Active ou paramètre un droit pour l’organisation. Peut référencer `sourceRightId` et `sourceRuleVersionId`, ou venir d’un template manuel. | Ne duplique pas une règle juridique. |
| Template manuel/interne | `hr_entitlement_catalog_items` | Propose un modèle établissement quand aucune source légale fiable n’est utilisée. | Ne devient pas une source légale et ne crée pas de `LegalRight`. |
| Attribution salarié | `hr_employee_entitlements` | Attribue une configuration ou un droit manuel à un collaborateur. | Ne porte pas la règle juridique source. |
| Compteur | `hr_time_accounts` et transactions | Stocke les soldes et mouvements par salarié/période. | Ne devient jamais une source juridique. |

Dans le code, le nom Prisma `HrEntitlementRule` reste conservé pour éviter une migration destructive, mais les services l’appellent désormais “configuration établissement”. Les anciens champs de réponse `rule`/`rules` peuvent rester pour compatibilité d’API, mais les nouveaux traitements doivent préférer `establishmentConfiguration` et `establishmentConfigurations`.

## Règlement Interne Temps De Travail

Le règlement du temps de travail d’un client ou établissement est une source interne établissement. Il ne doit pas être importé comme `LegalRight`, ni mélangé au droit commun ou à une convention collective.

La table dédiée est `establishment_work_time_regulations`. Elle porte notamment :

- `nightWorkEnabled`, `nightWorkStartTime`, `nightWorkEndTime` ;
- `publicHolidayWorkEnabled`, `publicHolidayDates` ;
- `weekendWorkEnabled`, `saturdayWorkAllowed`, `sundayWorkAllowed` ;
- `compensationsEnabled` ;
- les champs télétravail extraits si le document fourni concerne le télétravail ;
- `sourceDocumentName`, `sourceDocumentMetadata`, `extractedRules`, `rulesToConfirm` ;
- `validationStatus`.

La source est toujours exposée avec `sourceLayer = "establishment_internal"` et `sourceKind = "work_time_regulation"`.

Endpoints Planning :

- `GET /planning/work-time-regulation` : retourne le paramétrage interne courant ou les valeurs extraites par défaut si aucun enregistrement n’existe encore ;
- `PATCH /planning/work-time-regulation` : met à jour le paramétrage interne sans créer de droit légal ;
- `GET /planning/work-time-regulation/position-mapping/preview` : prépare les correspondances de postes reçues métier sans modifier les collaborateurs.

Le document `2026 06 Règlement du temps de travail.pdf` fourni pour la passe du 30 juin 2026 a été rendu visuellement car l’extraction texte PDF renvoyait des glyphes `cid`. Le contenu lisible correspond à un règlement du télétravail, pas à un règlement complet nuit / jours fériés / week-end.

Règles extraites avec confiance élevée :

- télétravail volontaire et réversible ;
- agents éligibles à partir de 80 % du temps complet ;
- maximum 1 jour de télétravail par semaine ;
- maximum 47 jours par an à temps complet ;
- maximum 37 jours par an à 80 % ou 90 % ;
- plage de travail télétravail 08:00-17:00 ;
- pause méridienne minimale 45 minutes ;
- quota journalier 7h16 ;
- le télétravail ne génère pas d’heures complémentaires ou supplémentaires.

Règles à confirmer manuellement car non trouvées dans le PDF fourni :

- heures de nuit ;
- jours fériés travaillés ;
- travail week-end ;
- astreintes ;
- récupération ou compensation interne ;
- RTT interne.

Le Planning peut détecter des événements internes si les paramètres sont configurés :

- `INTERNAL_NIGHT_WORK_DETECTED` ;
- `INTERNAL_PUBLIC_HOLIDAY_WORK_DETECTED` ;
- `INTERNAL_WEEKEND_WORK_DETECTED`.

Ces alertes sont stockées dans `planning_conflicts` avec `sourceLayer = "establishment_internal"`. Elles restent des alertes ou compteurs de suivi tant que la règle interne n’est pas validée. Aucune majoration, compensation ou solde dû n’est inventé par le moteur : les détails portent `balanceImpact = "tracking_only"` et `compensationGenerated = false`.

Dans `Planning > Paramétrage`, la section “Règlement du temps de travail” affiche l’état de configuration nuit / jours fériés / week-end, la source interne et le statut de validation. Dans `Émargement > Droits & soldes`, les heures nuit / jour férié / week-end peuvent apparaître comme lignes de suivi uniquement, distinctes des soldes `hr_time_accounts`.

## Heures Vertes

`HEURE_VERTE` est un tag interne Toquehub, pas un droit légal autonome.

Une heure verte doit toujours avoir :

- une raison lisible ;
- une origine structurée : `source_rule_id`, `source_event_id`, `sourceLegalOrigin`, `originLegalCode` ou équivalent.

Les compteurs RH refusent désormais `green_hours` sans origine. Les origines attendues sont notamment récupération HS, RCR, COR, RTT, annualisation, jour férié compensé, repos hebdomadaire reporté ou accord local.

## Privé/Public

Les agents publics ne relèvent pas d’une convention collective privée.

Les règles publiques sont stockées dans `public_regimes` et `legal_right_rule_versions.publicRegimeId`. Les règles privées conventionnelles utilisent `collective_agreements` et `agreementId`.

Les règles communes du privé restent séparées des règles publiques, même si leur libellé métier se ressemble.

## Socle Commun France Privé

Pour une organisation dont `Organization.regulatoryCountryCode = "FR"` et un collaborateur rattaché au régime privé, les droits issus du droit du travail commun sont inclus automatiquement. Ils ne sont pas à activer manuellement pour prouver leur existence.

La couche est identifiée par :

- `sourceLayer = "common_law"` ;
- `country = "FR"` ;
- `regime = "private"` ou règle commune compatible privé ;
- `autoApplicable = true` ;
- `applicableByDefault = true`.

Les droits prioritaires de cette passe sont : congés payés (`CP`), congés payés et maladie (`CP_MALADIE`), heures supplémentaires (`HS`), pause obligatoire après 6h (`PAUSE_6H`), repos quotidien (`REPOS_QUOTIDIEN`), repos hebdomadaire (`REPOS_HEBDOMADAIRE`), jours fériés (`JF`), 1er mai (`JF_1MAI`) et récupération de pont (`RECUP_PONT`).

Dans `GET /rights/search`, ces droits reviennent avec `uiStatus = "included"` ou `uiStatus = "included_requires_review"` si la règle reste juridiquement à valider. Le frontend doit afficher “Inclus automatiquement” et ne pas proposer de bouton principal “Activer” pour ces droits. Les règles `requires_review` restent visibles avec un badge “À valider juridiquement”.

Une configuration établissement (`hr_entitlement_rules`) est nécessaire uniquement quand l’établissement veut définir ou modifier un paramètre local : méthode de décompte, seuil local autorisé, rattachement manuel, surcharge documentée, etc. Cliquer sur “Configurer” peut créer ou mettre à jour cette configuration, mais aucun enregistrement établissement n’est créé automatiquement au simple fait que le droit commun s’applique.

`GET /rights/employees/:employeeId/applicable` retourne les droits applicables à la personne avec :

- le profil légal résolu ;
- `hasActiveContract` ;
- les droits du socle commun ;
- les compteurs disponibles ;
- les avertissements bloquants ou partiels.

Si le pays réglementaire est absent, le statut est bloqué avec `missing_regulatory_country`. Si le salarié n’a pas de contrat actif, les droits potentiels peuvent rester visibles, mais le calcul des compteurs revient en `partial` avec `missing_active_contract`.

Les compteurs ne doivent pas inventer de soldes. Quand aucune donnée n’existe encore dans `legal_right_counters` ou `hr_time_accounts`, l’API retourne un état explicite comme `not_initialized`, `partial` ou `incomplete`. Les contrôles planning, repos et pause peuvent apparaître comme contrôles applicables même sans solde salarié.

Les conventions collectives HCR, restauration rapide, hôtellerie de plein air et autres couches conventionnelles seront ajoutées ensuite comme couches supplémentaires. Elles ne doivent pas transformer le socle commun en template optionnel ni créer de doublons de `LegalRight`.

## Ajouter Ou Modifier Une Règle

Créer une nouvelle version avec un nouveau `stableId` ou incrémenter `version` si la même règle stable change.

Champs obligatoires côté moteur :

- `rightCode` ;
- `countryCode` ;
- `sector` ;
- `effectiveFrom` ;
- `priority` ;
- `unit` ;
- `formulaType` ;
- `sourceUrl` ou justification de source ;
- `validationStatus`.

Si la formule n’est pas prête, utiliser `validationStatus = "requires_review"` et une `formulaJson.rawText`.

## Limites V1

Les extractions article par article listées dans `A_valider_phase2` restent à compléter avant usage paie/RH opposable.

Les calculs actifs couvrent en priorité : congés payés privés, enfant malade, événements familiaux, congés annuels publics, repos quotidien, pause, repos hebdomadaire et heures supplémentaires planning.
