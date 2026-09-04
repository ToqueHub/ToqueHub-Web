# Audit refonte module Planning ToqueHub

Date: 2026-06-24
Repo : racine locale du projet ToqueHub
Portee: audit uniquement, aucun code applicatif modifie.

## 1. Resume de l'architecture actuelle

Le module Planning existe deja cote backend sous `apps/api/src/planning` et cote frontend sous `apps/web/src/components/PlanningApp.tsx`.

Architecture actuelle:

- Backend NestJS: `PlanningModule` expose `PlanningController` et `PlanningService`.
- Prisma: le schema contient un bloc Planning assez large: affectations, remplacements, besoins operationnels, templates, applications de templates, generations, conflits, notifications, historique, exports, preferences de vue.
- Frontend: pas de sous-dossier, hook ou store dedie Planning; tout est concentre dans `PlanningApp.tsx`, avec appels API limites dans `api/client.ts`.
- Orchestration UI: `Dashboard.tsx` gere la navigation Planning et fournit au Planning les donnees RH deja chargees: collaborateurs, services, postes, roulements, sites.
- Dependances: Planning consomme fortement RH: `HrEmployee`, `HrDepartment`, `HrPosition`, `HrRotation`, `HrAbsence`, `HrSkill`.

Constat majeur:

- Le backend Planning est plus riche que le frontend actuellement branche.
- `PlanningService.bootstrap()` ne renvoie aujourd'hui que les prerequis RH, collaborateurs, services, postes, roulements, sites et competences. Il ne renvoie pas les affectations, absences, besoins, remplacements, templates, alertes ou historique que le frontend essaie pourtant de normaliser.
- Le frontend compense en creant des affectations synthetiques et des ecrans de demonstration, ce qui ne doit pas rester dans la refonte.
- Les roulements sont encore entierement dans RH (`hr_rotations`, `hr_rotation_assignments`) alors que la vision cible demande de les sortir vers Planning.

## 2. Fichiers backend Planning existants

Directement Planning:

- `apps/api/src/planning/planning.module.ts`
- `apps/api/src/planning/planning.controller.ts`
- `apps/api/src/planning/planning.service.ts`
- `apps/api/src/planning/dto/planning.dto.ts`

Integration module:

- `apps/api/src/app.module.ts` importe `PlanningModule`.
- `apps/api/src/auth/auth.controller.ts` expose installation/desinstallation Planning.
- `apps/api/src/auth/auth.service.ts` ecrit `organization.planningInstalledAt`.
- `apps/api/src/dashboard/dashboard.service.ts` lit Planning pour widgets modulaires.
- `apps/api/src/architecture/architecture.service.ts` reference Planning dans le maillage.
- `apps/api/src/production/production.service.ts` inclut les liens vers `planningAssignment`.
- `apps/api/src/production/dto/production.dto.ts` accepte `planningAssignmentId`.
- `apps/api/prisma/schema.prisma` contient les modeles Planning.
- `apps/api/prisma/cleanup-legacy-hr-defaults.ts` compte les usages Planning avant nettoyage de services/postes RH.

Fichiers RH a auditer pour extraction des roulements:

- `apps/api/src/hr/hr.controller.ts`
- `apps/api/src/hr/hr.service.ts`
- `apps/api/src/hr/dto/hr.dto.ts`
- `apps/api/src/hr/hr.service.spec.ts`

## 3. Fichiers frontend Planning existants

Directement Planning:

- `apps/web/src/components/PlanningApp.tsx`

Integration frontend:

- `apps/web/src/api/client.ts`
- `apps/web/src/types.ts`
- `apps/web/src/components/Dashboard.tsx`
- `apps/web/src/styles.css`

Fichiers RH concernes par les roulements:

- `apps/web/src/components/HrApp.tsx`
- `apps/web/src/components/hr/collaborator/CollaboratorModal.tsx`

Hooks/stores:

- Aucun hook `usePlanning`, aucun store Planning dedie, aucun dossier frontend Planning. L'etat Planning est local a `PlanningApp.tsx`.

## 4. Tables Prisma Planning existantes

Tables demandees et auditees:

- `planning_assignments` -> `PlanningAssignment`
- `planning_replacements` -> `PlanningReplacement`
- `planning_operational_needs` -> `PlanningOperationalNeed`
- `planning_templates` -> `PlanningTemplate`
- `planning_template_applications` -> `PlanningTemplateApplication`
- `planning_generations` -> `PlanningGeneration`
- `planning_conflicts` -> `PlanningConflict`
- `planning_notifications` -> `PlanningNotification`

Autres tables Planning deja presentes:

- `planning_history` -> `PlanningHistory`
- `planning_exports` -> `PlanningExport`
- `planning_view_preferences` -> `PlanningViewPreference`

Tables RH consommees par Planning:

- `hr_employees`
- `hr_departments`
- `hr_positions`
- `hr_rotations`
- `hr_rotation_assignments`
- `hr_absences`
- `hr_skills`
- `hr_employee_skills`

Autres dependances:

- `sites`
- `users`
- `organizations`
- `production_assignments` contient `planningAssignmentId`.

## 5. Routes API Planning

Routes du controller Planning (`/api/planning`):

- `GET /planning/bootstrap`
- `GET /planning/dashboard`
- `GET /planning/assignments`
- `POST /planning/assignments`
- `GET /planning/assignments/:id`
- `PATCH /planning/assignments/:id`
- `PATCH /planning/assignments/:id/move`
- `DELETE /planning/assignments/:id`
- `GET /planning/requirements`
- `POST /planning/requirements`
- `PATCH /planning/requirements/:id`
- `DELETE /planning/requirements/:id`
- `GET /planning/needs`
- `GET /planning/absences`
- `POST /planning/absences`
- `PATCH /planning/absences/:id`
- `GET /planning/replacements`
- `POST /planning/replacements/propose`
- `POST /planning/replacements/:id/accept`
- `GET /planning/templates`
- `POST /planning/templates`
- `POST /planning/templates/:id/apply`
- `POST /planning/generate`
- `POST /planning/generate/:id/apply`
- `GET /planning/history`
- `POST /planning/history/archive`
- `GET /planning/notifications`
- `POST /planning/notifications/:id/read`
- `POST /planning/exports`
- `GET /planning/skills`
- `POST /planning/skills`
- `POST /planning/employees/:id/skills`

Routes d'installation:

- `POST /auth/apps/planning/install`
- `POST /auth/apps/planning/uninstall`

## 6. Dependances RH vers Planning et Planning vers RH

Planning vers RH:

- Affectation Planning reference `employeeId`, `departmentId`, `positionId`, `rotationId`, `absenceId`.
- Besoin operationnel reference `departmentId`, `positionId`, `requiredSkillId`.
- Remplacement reference absence RH et collaborateurs RH.
- Dashboard Planning compte les absences RH approuvees.
- Generation Planning lit collaborateurs actifs, absences approuvees, roulements actifs et besoins operationnels.
- Conflits Planning verifient collaborateur actif, absence approuvee, chevauchement, service/poste habituel.

RH vers Planning:

- `HrEmployee`, `HrDepartment`, `HrPosition`, `HrRotation`, `HrAbsence`, `HrSkill` ont des relations Prisma vers Planning.
- Le script de nettoyage RH bloque implicitement la suppression de services/postes utilises par Planning.
- La fiche collaborateur RH affiche une section Planning, mais elle represente surtout le roulement actif.

Autres modules:

- Production reference optionnellement `planningAssignmentId`.
- Dashboard modulaire expose des widgets Planning.
- Architecture classe Planning comme module dependant de RH.

## 7. Doublons et zones a deplacer

Zones a conserver dans RH:

- Collaborateurs.
- Contrats.
- Salaires / compensations.
- Duree contractuelle.
- Postes principaux et secondaires.
- Competences.
- Documents collaborateur.

Zones actuellement mal placees ou a sortir de RH:

- `HrRotation`
- `HrRotationAssignment`
- UI RH des roulements.
- Routes RH `/hr/rotations*`.
- Donnees de roulement affichees dans la fiche collaborateur comme organisation de travail.

Doublons / responsabilites floues:

- Planning expose `POST /planning/absences` et `PATCH /planning/absences/:id`, mais ecrit dans `hr_absences`. Pour la cible, les absences RH doivent rester RH, tandis que les indisponibilites purement planning doivent devenir Planning.
- Planning expose `POST /planning/skills` et `POST /planning/employees/:id/skills`, mais ecrit dans `hr_skills` et `hr_employee_skills`. Cela viole la regle "Planning consomme RH mais ne duplique/ne gere pas RH".
- `PlanningAssignment` stocke `departmentId` et `positionId`. C'est acceptable comme reference, mais il faudra clarifier si ces champs sont des references live RH ou des snapshots de contexte d'affectation.
- Frontend Planning utilise des affectations synthetiques quand les affectations persistent n'existent pas. Cela doit etre retire ou explicitement marque "demo" hors flux metier.
- Dashboard actuel met en avant des KPI que la cible refuse en gros KPI: absents, sous-effectif, remplacements. Ils devront etre retrogrades en alertes/actions.

## 8. Usage des tables existantes

- `planning_assignments`: utilisee par CRUD affectations, detection conflits, couverture, generations, remplacements, dashboard, production.
- `planning_replacements`: utilisee par remplacements proposes/acceptes et dashboard.
- `planning_operational_needs`: utilisee par besoins operationnels, couverture et generation.
- `planning_templates`: utilisee par liste/creation/application de templates.
- `planning_template_applications`: utilisee lors d'une application de template, mais l'application cree surtout une preview; elle ne cree pas encore de vraies affectations ou besoins.
- `planning_generations`: utilisee pour stocker preview + parametres et appliquer une generation.
- `planning_conflicts`: creee a la sauvegarde d'affectation, lue par dashboard et notifications d'alertes.
- `planning_notifications`: creee lors d'une nouvelle affectation, lue/marquee comme lue.
- `planning_history`: historise affectations, templates, generations, exports, notifications; archivable.
- `planning_exports`: prepare des exports mais ne genere pas encore de fichier reel.
- `planning_view_preferences`: presente dans Prisma mais pas de route/service/frontend trouve.

## 9. Plan de refonte en lots

Lot 0 - Stabilisation de contrat sans refonte visuelle:

- Definir le contrat fonctionnel cible: 4 onglets seulement: Dashboard, Planning, Parametrage, Emargement.
- Figeler les frontieres RH/Planning.
- Decider les noms API cibles sans casser l'existant immediatement.
- Ajouter tests de non-regression RH avant extraction des roulements.

Lot 1 - Backend Planning desktop, sans nouvelle table si possible:

- Recomposer `PlanningService.bootstrap` ou creer endpoint de contexte mensuel pour renvoyer les donnees reelles attendues: affectations, besoins, alertes, absences lues, remplacements, templates/presets, historique minimal.
- Separer les routes qui lisent RH de celles qui ecrivent RH.
- Retirer du domaine Planning les mutations RH directes: skills et absences RH doivent redevenir des responsabilites RH.
- Garder les tables existantes pour affectations, besoins, remplacements, conflits, notifications, generations, history, exports.

Lot 2 - Extraction progressive des roulements:

- Creer une couche service Planning pour les roulements en lisant d'abord les tables `hr_rotations` et `hr_rotation_assignments`.
- Deplacer les routes `/hr/rotations*` vers alias `/planning/rotations*` tout en gardant les anciennes routes RH temporairement comme compatibilite.
- Deplacer l'UI de gestion des roulements depuis `HrApp.tsx` vers l'onglet Planning > Parametrage > Presets & roulements.
- Dans RH, conserver seulement l'affichage read-only du roulement actif sur la fiche collaborateur.
- Ensuite seulement, migration eventuelle de tables vers noms Planning.

Lot 3 - Planning mensuel cible:

- Remplacer les vues actuelles jour/semaine/mois/assignments par l'onglet unique Planning.
- Construire la grille mensuelle 7 colonnes x 5 ou 6 lignes selon le mois, lundi-dimanche.
- Ajouter navigation mois/annee, preparation de mois futurs, filtres site/service/modele saisonnier/salarie.
- Implementer panneau lateral affectation rapide: selection collaborateur d'abord, puis presets jour et roulements semaine.
- Sauvegarde automatique via endpoint upsert/move.

Lot 4 - Parametrage:

- Regrouper besoins par service, presets journaliers, roulements hebdomadaires, indisponibilites planning, regles planning, regles paie/majorations, couts employeur.
- Les regles France/Finlande doivent etre des profils configurables par organisation, pas des constantes codees en dur.

Lot 5 - Alertes et couts:

- Recalculer alertes a partir des donnees reelles: conflits, absences RH, depassement contrat, couverture besoins, repos, chevauchement.
- Dashboard cible: heures planifiees, cout estime, heures supplementaires, alertes actives/prioritaires, repartition par service, actions a traiter.
- Ne pas mettre "personnel malade", "sous-effectif", "demandes vacances", "qualite planification" comme gros KPI.

Lot 6 - Emargement prepare, non mobile:

- Ajouter onglet Emargement en mode architecture/placeholder fonctionnel desktop.
- Prevoir donnees prevu vs reel, validation manager, export paie/compta futur.
- Ne pas developper l'app mobile salarie maintenant, mais concevoir les endpoints pour qu'ils puissent etre consommes plus tard.

Lot 7 - Architecture / maillage:

- Mettre a jour `architecture.service.ts` pour retirer rotations du descriptif RH et les rattacher a Planning une fois l'extraction faite.
- Ajouter les futures tables/regles au mapping Architecture uniquement apres migration.

## 10. Tables existantes a reutiliser

A reutiliser directement:

- `planning_assignments`
- `planning_operational_needs`
- `planning_replacements`
- `planning_conflicts`
- `planning_notifications`
- `planning_history`
- `planning_exports`

A reutiliser avec clarification:

- `planning_templates`: peut porter les presets journaliers et modeles saisonniers via `periodType` + `content`, au moins en phase 1.
- `planning_template_applications`: utile pour tracer application de presets/modeles.
- `planning_generations`: utile pour previews deterministes.
- `planning_view_preferences`: a reutiliser plus tard pour vues desktop/filtres utilisateur, mais actuellement inutilisee.

A conserver temporairement puis deplacer:

- `hr_rotations`
- `hr_rotation_assignments`

## 11. Nouvelles tables eventuelles

Aucune nouvelle table n'est necessaire pour commencer la refonte desktop si on accepte d'utiliser temporairement `planning_templates.content` pour presets et `hr_rotations` pour roulements.

Nouvelles tables probablement justifiees plus tard:

- `planning_rule_profiles`: profils configurables France/Finlande/entreprise.
- `planning_rule_profile_items`: regles modifiables, seuils, majorations, contraintes.
- `planning_day_presets`: si `planning_templates.content` devient trop generique pour les presets journaliers.
- `planning_unavailabilities`: indisponibilites purement planning, a ne pas confondre avec `hr_absences`.
- `planning_attendance_records`: emargement prevu/reel.
- `planning_pay_cost_rules`: cout employeur, paie, majorations, rattaches a un profil de regles.

Ces tables ne doivent pas etre creees maintenant. Elles doivent etre validees apres stabilisation du contrat backend et extraction des roulements.

## Conclusion

Le module existant contient deja beaucoup de briques utiles, mais il melange encore les responsabilites:

- Planning est techniquement present mais frontend et backend ne partagent pas encore un contrat solide.
- RH reste trop proprietaire des roulements.
- Planning modifie directement des donnees RH sur absences et competences.
- Le dashboard et la navigation actuels ne correspondent pas a la cible en 4 onglets.

La refonte doit donc commencer par le contrat backend et les frontieres metier, pas par l'interface.
