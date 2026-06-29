import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';

const MODULE_DEFINITIONS = [
  {
    id: 'core',
    name: 'Core',
    installedField: null,
    description: 'Fondation du système.',
    dependencies: [] as string[],
    patterns: [/^Organization$/, /^User$/, /^Role$/, /^Permission$/, /^RolePermission$/, /^AuditLog$/],
    labels: ['core', 'auth', 'user', 'role', 'permission', 'organization', 'audit'],
  },
  {
    id: 'stocks',
    name: 'Stocks',
    installedField: 'stocksInstalledAt',
    description: 'Gestion des stocks, produits, fournisseurs, inventaires et mouvements.',
    dependencies: ['Core'],
    patterns: [/^Category$/, /^Unit$/, /^UnitConversion$/, /^Product$/, /^Supplier$/, /^Site$/, /^Location$/, /^Lot$/, /^Stock$/, /^StockMovement$/, /^Inventory/, /^RnmProductFavorite$/],
    labels: ['stock', 'product', 'supplier', 'inventory', 'lot', 'unit', 'category', 'site', 'location', 'rnm'],
  },
  {
    id: 'hr',
    name: 'RH',
    installedField: 'hrInstalledAt',
    description: 'Gestion des employés, droits RH, départements, postes, compétences, rotations et absences.',
    dependencies: ['Core'],
    patterns: [/^Hr/, /^Legal/, /^CollectiveAgreement$/, /^PublicRegime$/],
    labels: ['hr', 'employee', 'department', 'position', 'skill', 'absence', 'rotation', 'legal', 'right', 'entitlement'],
  },
  {
    id: 'planning',
    name: 'Planning',
    installedField: 'planningInstalledAt',
    description: 'Planification opérationnelle, affectations, besoins, remplacements et exports.',
    dependencies: ['Core', 'RH'],
    patterns: [/^Planning/],
    labels: ['planning', 'assignment', 'replacement', 'template', 'conflict', 'notification'],
  },
  {
    id: 'technical-sheets',
    name: 'Fiches techniques',
    installedField: 'technicalSheetsInstalledAt',
    description: 'Fiches techniques, ingrédients, étapes, allergènes, coûts, simulations et exports.',
    dependencies: ['Core', 'Stocks'],
    patterns: [/^TechnicalSheet/],
    labels: ['technical', 'sheet', 'recipe', 'ingredient', 'allergen', 'cost'],
  },
  {
    id: 'production',
    name: 'Production',
    installedField: 'productionInstalledAt',
    description: 'Ordres de production, besoins matières, alertes, réalisations et exports.',
    dependencies: ['Core', 'Stocks', 'Fiches techniques'],
    patterns: [/^Production/],
    labels: ['production', 'order', 'material', 'destocking', 'realization'],
  },
  {
    id: 'menus',
    name: 'Menus',
    installedField: 'menusInstalledAt',
    description: 'Planification des repas, cycles, régimes, convives, exports et génération Production.',
    dependencies: ['Core', 'Fiches techniques', 'Production'],
    patterns: [/^Menu/],
    labels: ['menu', 'cycle', 'diet', 'guest', 'variant'],
  },
  {
    id: 'haccp',
    name: 'HACCP',
    installedField: 'haccpInstalledAt',
    description: 'Traçabilité sanitaire, relevés HACCP, nettoyage, huiles, températures et rapports.',
    dependencies: ['Core'],
    patterns: [/^Haccp/],
    labels: ['haccp', 'temperature', 'traceability', 'cleaning', 'reception', 'oil', 'cooling'],
  },
] as const;

const COMMON_FIELD_NAMES = new Set(['id', 'organizationId', 'createdAt', 'updatedAt', 'isArchived', 'archivedAt']);
type ArchitectureModuleId = string;

type AlertLevel = 'information' | 'attention' | 'critique';

type PrismaField = {
  name: string;
  type: string;
  kind: string;
  required: boolean;
  list: boolean;
  relationName?: string;
  relationFromFields: string[];
  relationToFields: string[];
  documentation?: string;
};

type PrismaModel = {
  name: string;
  table: string;
  moduleOwner: string;
  fields: PrismaField[];
  foreignKeys: { field: string; referencesModel: string; referencesField: string; relationName?: string }[];
  indexes: string[];
  uniqueConstraints: string[];
};

type ModuleInfo = {
  id: ArchitectureModuleId;
  name: string;
  status: 'actif' | 'installé' | 'disponible';
  description: string;
  ownedData: string[];
  consumedData: string[];
  consumerModules: string[];
  dependencies: string[];
  installed: boolean;
};

@Injectable()
export class ArchitectureService {
  constructor(private readonly prisma: PrismaService) {}

  async getArchitecture(user: { organizationId: string | null }) {
    const schema = this.getSchemaModels();
    const modules = await this.getModules(user, schema);
    const dataMap = this.getDataMap(schema);
    const relations = this.getRelations(schema, dataMap, modules);
    const duplicates = this.getDuplicateAlerts(schema, dataMap);
    const roadmap = modules.map((module) => ({
      module: module.name,
      status: module.installed ? 'actif' : 'disponible',
      active: module.installed,
      note: module.installed ? 'Module existant dans le périmètre v1.' : 'Module existant mais non installé pour cette organisation.',
    }));
    const impact = this.getImpacts(modules, dataMap, relations.edges);
    const summary = await this.getSummary(user, schema, modules, relations.edges.length);
    const documentation = this.getDocumentation(modules, dataMap, relations.edges, duplicates, roadmap);

    return {
      generatedAt: new Date().toISOString(),
      readonly: true,
      source: 'Analyse automatique du schéma Prisma, compteurs réels et règles métier internes v1.',
      summary,
      modules,
      dataMap,
      relations,
      schema,
      duplicates,
      impact,
      roadmap,
      documentation,
    };
  }

  async getSummaryOnly(user: { organizationId: string | null }) {
    const architecture = await this.getArchitecture(user);
    return architecture.summary;
  }

  private async getSummary(user: { organizationId: string | null }, schema: PrismaModel[], modules: ModuleInfo[], relationsCount: number) {
    const [users, organizations, products, suppliers] = await Promise.all([
      this.safeCount('user', this.orgWhere(user.organizationId)),
      this.safeCount('organization', undefined),
      this.safeCount('product', this.orgWhere(user.organizationId)),
      this.safeCount('supplier', this.orgWhere(user.organizationId)),
    ]);

    return {
      modules: modules.length,
      tables: schema.length,
      relations: relationsCount,
      users,
      organizations,
      products,
      suppliers,
      installedModules: modules.filter((module) => module.installed).length,
      alerts: this.getDuplicateAlerts(schema, this.getDataMap(schema)).length,
    };
  }

  private async getModules(user: { organizationId: string | null }, schema: PrismaModel[]): Promise<ModuleInfo[]> {
    const organization = await this.getOrganizationInstallState(user.organizationId);
    const dataMap = this.getDataMap(schema);
    const byOwner = (owner: string) => dataMap.filter((item) => item.owner === owner).map((item) => item.table);

    return MODULE_DEFINITIONS
      .filter((definition) => byOwner(definition.name).length > 0)
      .map((definition) => {
        const installed = definition.id === 'core' || Boolean(definition.installedField && organization?.[definition.installedField]);
        const owned = byOwner(definition.name);
        const consumed = dataMap.filter((item) => item.consumers.includes(definition.name) && item.owner !== definition.name).map((item) => item.table);
        const consumerModules = [...new Set(dataMap.filter((item) => item.owner === definition.name).flatMap((item) => item.consumers).filter((consumer) => consumer !== definition.name))];

        return {
          id: definition.id,
          name: definition.name,
          status: installed ? 'actif' : 'disponible',
          installed,
          description: definition.description,
          ownedData: owned,
          consumedData: consumed,
          consumerModules,
          dependencies: definition.dependencies.filter((dependency) => dataMap.some((item) => item.owner === dependency)),
        };
      });
  }

  private getSchemaModels(): PrismaModel[] {
    const rawSchema = this.readPrismaSchema();
    const blocks = this.extractModelBlocks(rawSchema);

    return Prisma.dmmf.datamodel.models.map((model) => {
      const block = blocks.get(model.name) ?? '';
      const indexes = [...block.matchAll(/@@index\(([^\n]+)\)/g)].map((match) => match[1].trim());
      const uniqueConstraints = [...block.matchAll(/@@unique\(([^\n]+)\)/g)].map((match) => match[1].trim());
      const fields: PrismaField[] = model.fields.map((field) => ({
        name: field.name,
        type: field.type,
        kind: field.kind,
        required: field.isRequired,
        list: field.isList,
        relationName: field.relationName,
        relationFromFields: [...(field.relationFromFields ?? [])],
        relationToFields: [...(field.relationToFields ?? [])],
        documentation: field.documentation,
      }));
      const foreignKeys = fields
        .filter((field) => field.kind === 'object' && field.relationFromFields.length > 0)
        .flatMap((field) =>
          field.relationFromFields.map((fromField, index) => ({
            field: fromField,
            referencesModel: field.type,
            referencesField: field.relationToFields[index] ?? 'id',
            relationName: field.relationName,
          })),
        );

      return {
        name: model.name,
        table: model.dbName ?? this.toSnakeCase(model.name),
        moduleOwner: this.ownerForModel(model.name),
        fields,
        foreignKeys,
        indexes,
        uniqueConstraints,
      };
    });
  }

  private getDataMap(schema: PrismaModel[]) {
    const consumers = new Map<string, Set<string>>();
    schema.forEach((model) => consumers.set(model.name, new Set([model.moduleOwner])));

    schema.forEach((model) => {
      model.foreignKeys.forEach((fk) => {
        const targetConsumers = consumers.get(fk.referencesModel);
        if (targetConsumers && model.moduleOwner !== this.ownerForModel(fk.referencesModel)) {
          targetConsumers.add(model.moduleOwner);
        }
      });
    });

    return schema.map((model) => ({
      model: model.name,
      table: model.table,
      owner: model.moduleOwner,
      consumers: [...(consumers.get(model.name) ?? new Set([model.moduleOwner]))],
      description: this.descriptionForModel(model.name),
      confidence: this.hasExplicitOwner(model.name) ? 'élevé' : 'moyen',
      origin: this.hasExplicitOwner(model.name) ? 'règles métier internes + analyse automatique du schéma' : 'déduction par convention de nommage',
    }));
  }

  private getRelations(schema: PrismaModel[], dataMap: ReturnType<ArchitectureService['getDataMap']>, modules: ModuleInfo[]) {
    const moduleNames = [...new Set(dataMap.map((item) => item.owner))];
    const nodes = [
      ...moduleNames.map((module) => ({ id: `module:${module}`, label: module, type: 'module', module })),
      ...schema.map((model) => ({ id: `table:${model.table}`, label: model.table, type: 'table', module: model.moduleOwner, model: model.name })),
    ];

    const ownershipEdges = dataMap.map((item) => ({
      id: `owns:${item.owner}:${item.table}`,
      source: `module:${item.owner}`,
      target: `table:${item.table}`,
      type: 'propriété',
      label: 'possède',
    }));

    const relationEdges = schema.flatMap((model) =>
      model.foreignKeys.map((fk) => {
        const target = schema.find((candidate) => candidate.name === fk.referencesModel);
        return {
          id: `fk:${model.table}:${fk.field}:${target?.table ?? fk.referencesModel}`,
          source: `table:${model.table}`,
          target: `table:${target?.table ?? this.toSnakeCase(fk.referencesModel)}`,
          type: 'relation directe',
          label: `${fk.field} → ${fk.referencesModel}.${fk.referencesField}`,
          field: fk.field,
        };
      }),
    );

    const consumptionEdges = dataMap.flatMap((item) =>
      item.consumers
        .filter((consumer) => consumer !== item.owner)
        .map((consumer) => ({
          id: `consumes:${consumer}:${item.table}`,
          source: `module:${consumer}`,
          target: `table:${item.table}`,
          type: 'consommation',
          label: 'consomme',
        })),
    );

    const dependencyEdges = modules.flatMap((module) =>
      module.dependencies.map((dependency) => ({
        id: `depends:${module.name}:${dependency}`,
        source: `module:${module.name}`,
        target: `module:${dependency}`,
        type: 'dépendance',
        label: 'dépend de',
      })),
    );

    return { nodes, edges: [...ownershipEdges, ...relationEdges, ...consumptionEdges, ...dependencyEdges] };
  }

  private getDuplicateAlerts(schema: PrismaModel[], dataMap: ReturnType<ArchitectureService['getDataMap']>) {
    const synonyms = [
      ['Vendor', 'Supplier', 'critique'],
      ['Worker', 'HrEmployee', 'attention'],
      ['Store', 'Site', 'information'],
    ] as const;
    const alerts: { id: string; level: AlertLevel; title: string; message: string; models: string[]; recommendation: string }[] = [];

    synonyms.forEach(([left, right, level]) => {
      const leftModel = schema.find((model) => model.name.toLowerCase().includes(left.toLowerCase()));
      const rightModel = schema.find((model) => model.name.toLowerCase().includes(right.toLowerCase()));
      if (leftModel && rightModel && leftModel.name !== rightModel.name && !this.hasDirectRelation(leftModel, rightModel)) {
        alerts.push({
          id: `synonym:${leftModel.name}:${rightModel.name}`,
          level,
          title: `Proximité métier ${leftModel.table} / ${rightModel.table}`,
          message: `La table “${leftModel.table}” semble pouvoir dupliquer “${rightModel.table}”.`,
          models: [leftModel.name, rightModel.name],
          recommendation: `Réutiliser la donnée propriétaire ${dataMap.find((item) => item.model === rightModel.name)?.owner ?? 'existante'} avant de recréer ce concept.`,
        });
      }
    });

    for (let index = 0; index < schema.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < schema.length; otherIndex += 1) {
        const left = schema[index];
        const right = schema[otherIndex];
        if (left.moduleOwner === right.moduleOwner) continue;
        if (this.hasDirectRelation(left, right)) continue;
        if (this.isKnownConsumerBridge(left, right) || this.isKnownConsumerBridge(right, left)) continue;
        if (this.isKnownDistinctConceptPair(left, right)) continue;

        const overlap = this.fieldOverlap(left, right);
        const semanticOverlap = this.semanticFieldOverlap(left, right);
        if (overlap >= 0.78 && semanticOverlap >= 0.5) {
          alerts.push({
            id: `fields:${left.name}:${right.name}`,
            level: overlap >= 0.75 ? 'attention' : 'information',
            title: `Champs proches entre ${left.table} et ${right.table}`,
            message: `Les modèles partagent ${Math.round(overlap * 100)}% de champs métier comparables.`,
            models: [left.name, right.name],
            recommendation: 'Vérifier la règle de propriétaire unique avant toute extension.',
          });
        }
      }
    }

    return this.deduplicateAlerts(alerts);
  }

  private getImpacts(modules: ModuleInfo[], dataMap: ReturnType<ArchitectureService['getDataMap']>, edges: { source: string; target: string; type: string; label: string }[]) {
    return modules.map((module) => {
      const owned = dataMap.filter((item) => item.owner === module.name).map((item) => item.table);
      const used = dataMap.filter((item) => item.consumers.includes(module.name) && item.owner !== module.name).map((item) => item.table);
      const impactedModules = [...new Set(dataMap.filter((item) => item.owner === module.name).flatMap((item) => item.consumers).filter((consumer) => consumer !== module.name))];
      const criticalDependencies = edges
        .filter((edge) => owned.some((table) => edge.source === `table:${table}` || edge.target === `table:${table}`))
        .slice(0, 12)
        .map((edge) => edge.label);

      return {
        module: module.name,
        status: module.status,
        ownedTables: owned,
        usedTables: used,
        dependentModules: module.dependencies,
        impactedModules,
        deactivationRisks: owned.length
          ? [`${owned.slice(0, 4).join(', ')} indisponibles`, 'Relations directes et écrans consommateurs potentiellement impactés.']
          : ['Aucun risque détecté.'],
        criticalDependencies,
      };
    });
  }

  private getDocumentation(
    modules: ModuleInfo[],
    dataMap: ReturnType<ArchitectureService['getDataMap']>,
    edges: { type: string }[],
    duplicates: ReturnType<ArchitectureService['getDuplicateAlerts']>,
    roadmap: { module: string; status: string; note: string }[],
  ) {
    return [
      {
        slug: 'architecture',
        title: 'Architecture',
        content: `ToqueHub est organisé autour de ${modules.length} modules v1 réellement présents. Chaque donnée possède un propriétaire unique et les autres modules la consomment via les relations existantes.`,
      },
      {
        slug: 'modules',
        title: 'Modules',
        content: modules.map((module) => `${module.name} possède ${module.ownedData.length} tables et dépend de ${module.dependencies.join(', ') || 'aucun module'}.`).join('\n'),
      },
      {
        slug: 'tables',
        title: 'Tables',
        content: dataMap.map((item) => `${item.table}: propriétaire ${item.owner}, consommateurs ${item.consumers.join(', ')}.`).join('\n'),
      },
      {
        slug: 'relations',
        title: 'Relations',
        content: `${edges.length} liens détectés entre modules et tables, incluant propriété, consommation et clés étrangères directes.`,
      },
      {
        slug: 'roadmap',
        title: 'Roadmap',
        content: roadmap.map((item) => `${item.module} — ${item.status}: ${item.note}`).join('\n'),
      },
      {
        slug: 'doublons',
        title: 'Risques de doublons',
        content: duplicates.length ? duplicates.map((alert) => `${alert.level}: ${alert.message}`).join('\n') : 'Aucune alerte de doublon détectée dans le schéma actuel.',
      },
    ];
  }

  private ownerForModel(modelName: string): string {
    const owner = this.moduleDefinitionForModel(modelName);
    return owner.name;
  }

  private descriptionForModel(modelName: string): string {
    const descriptions: Record<string, string> = {
      Organization: 'Organisations clientes ToqueHub.',
      User: 'Comptes utilisateurs ToqueHub.',
      Role: 'Rôles applicatifs.',
      Permission: 'Permissions applicatives.',
      RolePermission: 'Association rôles-permissions.',
      Product: 'Produits de référence.',
      Category: 'Catégories de produits.',
      Unit: 'Unités de mesure.',
      UnitConversion: 'Conversions entre unités.',
      Supplier: 'Fournisseurs.',
      Site: 'Sites de stockage.',
      Location: 'Emplacements de stockage.',
      Lot: 'Lots de produits.',
      Stock: 'Niveaux de stocks projetés.',
      StockMovement: 'Mouvements de stock.',
      Inventory: 'Inventaires.',
      InventoryLine: 'Lignes d’inventaire.',
      AuditLog: 'Journal d’audit métier.',
      RnmProductFavorite: 'Favoris produits du référentiel RNM.',
      HrDepartment: 'Départements RH de l’organisation.',
      HrPosition: 'Postes et fonctions RH.',
      HrEmployee: 'Employés de l’établissement.',
      HrEmployeeHistory: 'Historique des événements collaborateurs.',
      HrRotation: 'Rotations et cycles de travail.',
      HrRotationAssignment: 'Affectations des rotations aux employés.',
      HrSkill: 'Compétences RH.',
      HrEmployeeSkill: 'Compétences rattachées aux employés.',
      HrPositionSkill: 'Compétences requises par poste.',
      HrDepartmentSkill: 'Compétences requises par département.',
      HrAbsence: 'Absences et demandes RH.',
      HrEntitlementRule: 'Configurations établissement des droits RH.',
      HrEntitlementCatalogItem: 'Templates manuels ou internes de droits RH.',
      HrEmployeeEntitlement: 'Attributions de droits RH aux collaborateurs.',
      HrTimeAccount: 'Compteurs et soldes RH par collaborateur.',
      LegalRight: 'Référentiel juridique stable des droits RH.',
      LegalRightRuleVersion: 'Versions datées, sourcées et calculables des règles juridiques.',
      LegalJobFamily: 'Classification métier légale utilisée pour router les règles.',
      PlanningAssignment: 'Affectations de planning.',
      PlanningReplacement: 'Remplacements proposés ou validés.',
      PlanningOperationalNeed: 'Besoins opérationnels de planning.',
      PlanningTemplate: 'Modèles de planning.',
      PlanningTemplateApplication: 'Applications de modèles de planning.',
      PlanningGeneration: 'Générations automatiques de planning.',
      PlanningConflict: 'Conflits détectés sur le planning.',
      PlanningNotification: 'Notifications de planning.',
      PlanningHistory: 'Historique du planning.',
      PlanningExport: 'Exports de planning.',
      PlanningViewPreference: 'Préférences de vue planning.',
      TechnicalSheetCategory: 'Catégories de fiches techniques.',
      TechnicalSheet: 'Fiches techniques et recettes.',
      TechnicalSheetIngredient: 'Ingrédients de fiches techniques réutilisant les produits.',
      TechnicalSheetStep: 'Étapes de préparation.',
      TechnicalSheetAllergen: 'Allergènes de fiches techniques.',
      TechnicalSheetIngredientAllergen: 'Lien ingrédients-allergènes.',
      TechnicalSheetCostSnapshot: 'Instantanés de coûts matière.',
      TechnicalSheetSimulation: 'Simulations de fiches techniques.',
      TechnicalSheetExport: 'Exports de fiches techniques.',
      TechnicalSheetHistory: 'Historique des fiches techniques.',
    };
    return descriptions[modelName] ?? `Modèle ${modelName} détecté automatiquement.`;
  }

  private moduleDefinitionForModel(modelName: string) {
    return MODULE_DEFINITIONS.find((definition) => definition.patterns.some((pattern) => pattern.test(modelName))) ?? MODULE_DEFINITIONS[0];
  }

  private hasExplicitOwner(modelName: string) {
    return MODULE_DEFINITIONS.some((definition) => definition.patterns.some((pattern) => pattern.test(modelName)));
  }

  private async getOrganizationInstallState(organizationId: string | null) {
    const select = Object.fromEntries(
      MODULE_DEFINITIONS
        .map((definition) => definition.installedField)
        .filter((field): field is NonNullable<typeof field> => Boolean(field))
        .map((field) => [field, true]),
    );

    if (!organizationId) {
      const organizations = await this.prisma.organization.findMany({ select, take: 50 });
      return Object.fromEntries(Object.keys(select).map((field) => [field, organizations.some((organization) => Boolean((organization as Record<string, unknown>)[field]))]));
    }

    return (await this.prisma.organization.findUnique({ where: { id: organizationId }, select })) as Record<string, unknown> | null;
  }

  private async safeCount(model: string, where?: Record<string, unknown>) {
    try {
      const delegate = (this.prisma as unknown as Record<string, { count(args?: unknown): Promise<number> }>)[model];
      if (!delegate || typeof delegate.count !== 'function') return 0;
      return await delegate.count(where ? { where } : undefined);
    } catch {
      return 0;
    }
  }

  private orgWhere(organizationId: string | null) {
    if (!organizationId) return undefined;
    return { organizationId };
  }

  private fieldOverlap(left: PrismaModel, right: PrismaModel) {
    const ignored = new Set([...COMMON_FIELD_NAMES, 'name', 'description', 'notes', 'status', 'color', 'order', 'isSystem']);
    const leftFields = new Set(left.fields.filter((field) => field.kind !== 'object' && !ignored.has(field.name)).map((field) => field.name.toLowerCase()));
    const rightFields = new Set(right.fields.filter((field) => field.kind !== 'object' && !ignored.has(field.name)).map((field) => field.name.toLowerCase()));
    if (leftFields.size < 3 || rightFields.size < 3) return 0;
    const shared = [...leftFields].filter((field) => rightFields.has(field)).length;
    return shared / Math.min(leftFields.size, rightFields.size);
  }

  private semanticFieldOverlap(left: PrismaModel, right: PrismaModel) {
    const semanticFields = new Set([
      'email',
      'phone',
      'address',
      'firstname',
      'lastname',
      'username',
      'employeenumber',
      'sku',
      'reference',
      'code',
      'contactname',
      'birthdate',
      'hiredate',
    ]);
    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
    const leftFields = new Set(left.fields.filter((field) => field.kind !== 'object').map((field) => normalize(field.name)).filter((field) => semanticFields.has(field)));
    const rightFields = new Set(right.fields.filter((field) => field.kind !== 'object').map((field) => normalize(field.name)).filter((field) => semanticFields.has(field)));
    if (!leftFields.size || !rightFields.size) return 0;
    const shared = [...leftFields].filter((field) => rightFields.has(field)).length;
    return shared / Math.min(leftFields.size, rightFields.size);
  }

  private hasDirectRelation(left: PrismaModel, right: PrismaModel) {
    return left.foreignKeys.some((fk) => fk.referencesModel === right.name) || right.foreignKeys.some((fk) => fk.referencesModel === left.name);
  }

  private isKnownConsumerBridge(left: PrismaModel, right: PrismaModel) {
    const leftName = left.name.toLowerCase();
    const rightName = right.name.toLowerCase();
    if (leftName.includes('ingredient') && rightName === 'product') return true;
    if (leftName.includes('employee') && rightName === 'user') return true;
    if (leftName.includes('history') && rightName.includes('audit')) return true;
    return false;
  }

  private isKnownDistinctConceptPair(left: PrismaModel, right: PrismaModel) {
    const pair = new Set([left.name, right.name]);
    // Template UI/interne vs classification légale: les champs code/label/category se ressemblent,
    // mais ce ne sont pas deux sources d'un même droit métier.
    if (pair.has('HrEntitlementCatalogItem') && pair.has('LegalJobFamily')) return true;
    return false;
  }

  private deduplicateAlerts(alerts: { id: string; level: AlertLevel; title: string; message: string; models: string[]; recommendation: string }[]) {
    const levelWeight: Record<AlertLevel, number> = { information: 1, attention: 2, critique: 3 };
    const byPair = new Map<string, (typeof alerts)[number]>();

    alerts.forEach((alert) => {
      const key = [...alert.models].sort().join(':');
      const current = byPair.get(key);
      if (!current || levelWeight[alert.level] > levelWeight[current.level]) {
        byPair.set(key, alert);
      }
    });

    return [...byPair.values()];
  }

  private readPrismaSchema() {
    const candidates = [
      join(process.cwd(), 'prisma/schema.prisma'),
      join(process.cwd(), 'apps/api/prisma/schema.prisma'),
      join(__dirname, '../../prisma/schema.prisma'),
    ];
    const path = candidates.find((candidate) => existsSync(candidate));
    return path ? readFileSync(path, 'utf8') : '';
  }

  private extractModelBlocks(schema: string) {
    const blocks = new Map<string, string>();
    const regexp = /model\s+(\w+)\s+\{([\s\S]*?)\n\}/g;
    let match: RegExpExecArray | null;
    while ((match = regexp.exec(schema))) {
      blocks.set(match[1], match[2]);
    }
    return blocks;
  }

  private toSnakeCase(value: string) {
    return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  }
}
