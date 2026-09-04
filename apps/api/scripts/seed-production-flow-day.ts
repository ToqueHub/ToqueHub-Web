import {
  OperationalTaskCategory,
  OperationalTaskSource,
  OperationalTaskStatus,
  Prisma,
  PrismaClient,
  ProductKind,
  ProductionBatchStatus,
  ProductionOperationStatus,
  ProductionOperationType,
  ProductionOrderStatus,
  ProductionPriority,
  TechnicalSheetMode,
  TechnicalSheetStatus,
  TechnicalSheetStockPolicy,
  TechnicalSheetYieldMode,
  UnitType,
} from '@prisma/client';

const prisma = new PrismaClient();
const PREFIX = 'DEMO FLOW PRODUCTION';

type IngredientDefinition = {
  key: string;
  name: string;
  symbol: 'kg' | 'L' | 'pce';
  quantity: number;
  price: number;
  gtin: string;
};

type RecipeDefinition = {
  key: string;
  name: string;
  outputName: string;
  referencePortions: number;
  plannedPortions: number;
  hour: number;
  minute: number;
  ingredients: IngredientDefinition[];
  steps: Array<{
    title: string;
    description: string;
    minutes: number;
    type: ProductionOperationType;
  }>;
};

const recipes: RecipeDefinition[] = [
  {
    key: 'croissants',
    name: 'Croissants au beurre',
    outputName: 'Croissant au beurre fini',
    referencePortions: 24,
    plannedPortions: 48,
    hour: 6,
    minute: 0,
    ingredients: [
      { key: 'farine', name: 'Farine de gruau T45', symbol: 'kg', quantity: 1.25, price: 1.35, gtin: '3760000001014' },
      { key: 'beurre', name: 'Beurre de tourage AOP', symbol: 'kg', quantity: 0.5, price: 10.9, gtin: '3760000001021' },
      { key: 'lait', name: 'Lait entier', symbol: 'L', quantity: 0.45, price: 1.2, gtin: '3760000001038' },
      { key: 'levure', name: 'Levure boulangère fraîche', symbol: 'kg', quantity: 0.04, price: 4.8, gtin: '3760000001045' },
      { key: 'sucre', name: 'Sucre semoule', symbol: 'kg', quantity: 0.12, price: 1.5, gtin: '3760000001052' },
      { key: 'sel', name: 'Sel fin', symbol: 'kg', quantity: 0.025, price: 0.8, gtin: '3760000001069' },
    ],
    steps: [
      { title: 'Pétrir la détrempe', description: 'Peser les ingrédients, pétrir jusqu’à obtenir une pâte lisse puis contrôler la température.', minutes: 20, type: ProductionOperationType.PREPARATION },
      { title: 'Pointer et refroidir', description: 'Laisser pointer la détrempe, la rabattre puis la refroidir avant le tourage.', minutes: 25, type: ProductionOperationType.COOLING },
      { title: 'Tourer la pâte', description: 'Enchâsser le beurre et réaliser trois tours simples avec repos entre chaque tour.', minutes: 30, type: ProductionOperationType.ASSEMBLY },
      { title: 'Détailler et façonner', description: 'Abaisser à l’épaisseur prévue, détailler les triangles puis façonner régulièrement.', minutes: 20, type: ProductionOperationType.FINISHING },
      { title: 'Apprêter et cuire', description: 'Dorer, apprêter puis cuire jusqu’à coloration homogène. Refroidir sur grille.', minutes: 18, type: ProductionOperationType.COOKING },
    ],
  },
  {
    key: 'quiches',
    name: 'Quiches lorraines individuelles',
    outputName: 'Quiche lorraine individuelle finie',
    referencePortions: 12,
    plannedPortions: 36,
    hour: 9,
    minute: 0,
    ingredients: [
      { key: 'farine', name: 'Farine de gruau T45', symbol: 'kg', quantity: 0.3, price: 1.35, gtin: '3760000001014' },
      { key: 'beurre', name: 'Beurre de tourage AOP', symbol: 'kg', quantity: 0.15, price: 10.9, gtin: '3760000001021' },
      { key: 'oeufs', name: 'Œufs plein air', symbol: 'pce', quantity: 4, price: 0.32, gtin: '3760000001076' },
      { key: 'creme', name: 'Crème liquide 30 %', symbol: 'L', quantity: 0.4, price: 4.4, gtin: '3760000001083' },
      { key: 'lardons', name: 'Lardons fumés', symbol: 'kg', quantity: 0.3, price: 9.6, gtin: '3760000001090' },
      { key: 'emmental', name: 'Emmental râpé', symbol: 'kg', quantity: 0.15, price: 8.2, gtin: '3760000001106' },
    ],
    steps: [
      { title: 'Préparer la pâte brisée', description: 'Sabler farine et beurre, fraiser puis réserver la pâte au froid.', minutes: 20, type: ProductionOperationType.PREPARATION },
      { title: 'Foncer les moules', description: 'Abaisser, foncer les moules individuels et piquer les fonds.', minutes: 15, type: ProductionOperationType.ASSEMBLY },
      { title: 'Préparer la garniture', description: 'Saisir les lardons, préparer l’appareil œufs-crème et peser le fromage.', minutes: 15, type: ProductionOperationType.PREPARATION },
      { title: 'Garnir et cuire', description: 'Répartir la garniture, verser l’appareil puis cuire à cœur.', minutes: 35, type: ProductionOperationType.COOKING },
      { title: 'Refroidir et conditionner', description: 'Contrôler la cuisson, refroidir puis conditionner et étiqueter.', minutes: 15, type: ProductionOperationType.PACKAGING },
    ],
  },
  {
    key: 'veloute',
    name: 'Velouté de potimarron',
    outputName: 'Velouté de potimarron fini',
    referencePortions: 10,
    plannedPortions: 30,
    hour: 14,
    minute: 0,
    ingredients: [
      { key: 'potimarron', name: 'Potimarron frais', symbol: 'kg', quantity: 2, price: 2.6, gtin: '3760000001113' },
      { key: 'oignon', name: 'Oignons jaunes', symbol: 'kg', quantity: 0.25, price: 1.8, gtin: '3760000001120' },
      { key: 'bouillon', name: 'Bouillon de légumes', symbol: 'L', quantity: 1.5, price: 1.1, gtin: '3760000001137' },
      { key: 'creme', name: 'Crème liquide 30 %', symbol: 'L', quantity: 0.2, price: 4.4, gtin: '3760000001083' },
      { key: 'beurre', name: 'Beurre de tourage AOP', symbol: 'kg', quantity: 0.05, price: 10.9, gtin: '3760000001021' },
    ],
    steps: [
      { title: 'Préparer les légumes', description: 'Laver, parer et tailler le potimarron et les oignons.', minutes: 15, type: ProductionOperationType.PREPARATION },
      { title: 'Suer et cuire', description: 'Faire suer au beurre, mouiller au bouillon puis cuire à frémissement.', minutes: 30, type: ProductionOperationType.COOKING },
      { title: 'Mixer et rectifier', description: 'Mixer finement, ajouter la crème, rectifier l’assaisonnement et contrôler la texture.', minutes: 10, type: ProductionOperationType.FINISHING },
      { title: 'Refroidir et étiqueter', description: 'Refroidir rapidement, conditionner puis renseigner le lot fini.', minutes: 15, type: ProductionOperationType.COOLING },
    ],
  },
];

function dateKey(value: Date) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-');
}

function atTime(day: Date, hours: number, minutes: number) {
  const value = new Date(day);
  value.setHours(hours, minutes, 0, 0);
  return value;
}

async function upsertUnit(organizationId: string, name: string, symbol: string, type: UnitType) {
  return prisma.unit.upsert({
    where: { organizationId_symbol: { organizationId, symbol } },
    create: { organizationId, name, symbol, type },
    update: { name, type, isArchived: false, archivedAt: null },
  });
}

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.PRODUCTION_FLOW_DEMO_ALLOW_PRODUCTION !== 'true') {
    throw new Error('Seed Production refusé en production. Utilisez une base de développement.');
  }

  const requestedOrganizationId = process.env.PRODUCTION_FLOW_DEMO_ORGANIZATION_ID?.trim();
  const organization = requestedOrganizationId
    ? await prisma.organization.findUnique({ where: { id: requestedOrganizationId } })
    : await prisma.organization.findFirst({
        where: { users: { some: { isActive: true } } },
        orderBy: { createdAt: 'asc' },
      });
  if (!organization) throw new Error('Aucune organisation active trouvée.');

  const actor = await prisma.user.findFirst({
    where: { organizationId: organization.id, isActive: true },
    orderBy: [{ isPrimaryAdmin: 'desc' }, { createdAt: 'asc' }],
  });
  if (!actor) throw new Error('Aucun utilisateur actif trouvé dans l’organisation.');

  await prisma.organization.update({
    where: { id: organization.id },
    data: {
      haccpInstalledAt: organization.haccpInstalledAt ?? new Date(),
      hrInstalledAt: organization.hrInstalledAt ?? new Date(),
      planningInstalledAt: organization.planningInstalledAt ?? new Date(),
      technicalSheetsInstalledAt: organization.technicalSheetsInstalledAt ?? new Date(),
      productionInstalledAt: organization.productionInstalledAt ?? new Date(),
    },
  });

  const [portionUnit, kilogramUnit, literUnit, pieceUnit] = await Promise.all([
    upsertUnit(organization.id, 'Portion', 'portion', UnitType.COUNT),
    upsertUnit(organization.id, 'Kilogramme', 'kg', UnitType.MASS),
    upsertUnit(organization.id, 'Litre', 'L', UnitType.VOLUME),
    upsertUnit(organization.id, 'Pièce', 'pce', UnitType.COUNT),
  ]);
  const unitBySymbol = new Map([
    ['kg', kilogramUnit],
    ['L', literUnit],
    ['pce', pieceUnit],
  ]);

  const category = await prisma.category.upsert({
    where: { organizationId_name: { organizationId: organization.id, name: PREFIX } },
    create: {
      organizationId: organization.id,
      name: PREFIX,
      description: 'Produits de test du parcours mobile Production et traçabilité HACCP.',
    },
    update: { isArchived: false, archivedAt: null },
  });
  const site = await prisma.site.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: `${PREFIX} · Laboratoire`,
      },
    },
    create: {
      organizationId: organization.id,
      name: `${PREFIX} · Laboratoire`,
      address: 'Cuisine de démonstration ToqueHub',
      responsibleName: 'Équipe Production',
    },
    update: { isArchived: false, archivedAt: null },
  });
  const location = await prisma.location.upsert({
    where: {
      organizationId_siteId_name: {
        organizationId: organization.id,
        siteId: site.id,
        name: `${PREFIX} · Chambre froide positive`,
      },
    },
    create: {
      organizationId: organization.id,
      siteId: site.id,
      name: `${PREFIX} · Chambre froide positive`,
    },
    update: { isArchived: false, archivedAt: null },
  });
  const department = await prisma.hrDepartment.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: `${PREFIX} · Cuisine`,
      },
    },
    create: {
      organizationId: organization.id,
      name: `${PREFIX} · Cuisine`,
      description: 'Équipe de la journée type Production.',
    },
    update: { isArchived: false, archivedAt: null },
  });
  const position = await prisma.hrPosition.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: `${PREFIX} · Cuisinier`,
      },
    },
    create: {
      organizationId: organization.id,
      departmentId: department.id,
      name: `${PREFIX} · Cuisinier`,
    },
    update: { departmentId: department.id, isArchived: false, archivedAt: null },
  });

  const employees = [];
  for (const [index, identity] of [
    ['Alice', 'Martin'],
    ['Karim', 'Benali'],
    ['Sofia', 'Dubois'],
  ].entries()) {
    employees.push(await prisma.hrEmployee.upsert({
      where: {
        organizationId_employeeNumber: {
          organizationId: organization.id,
          employeeNumber: `FLOW-PROD-${index + 1}`,
        },
      },
      create: {
        organizationId: organization.id,
        firstName: identity[0],
        lastName: identity[1],
        hireDate: new Date('2024-01-01T00:00:00.000Z'),
        departmentId: department.id,
        positionId: position.id,
        mainSiteId: site.id,
        employeeNumber: `FLOW-PROD-${index + 1}`,
      },
      update: {
        firstName: identity[0],
        lastName: identity[1],
        departmentId: department.id,
        positionId: position.id,
        mainSiteId: site.id,
        status: 'ACTIVE',
        isArchived: false,
        archivedAt: null,
      },
    }));
  }

  const allIngredientDefinitions = new Map<string, IngredientDefinition>();
  for (const recipe of recipes) {
    for (const ingredient of recipe.ingredients) {
      allIngredientDefinitions.set(ingredient.key, ingredient);
    }
  }
  const products = new Map<string, any>();
  for (const ingredient of allIngredientDefinitions.values()) {
    const unit = unitBySymbol.get(ingredient.symbol);
    if (!unit) throw new Error(`Unité introuvable : ${ingredient.symbol}`);
    const product = await prisma.product.upsert({
      where: {
        organizationId_name: {
          organizationId: organization.id,
          name: `${PREFIX} · ${ingredient.name}`,
        },
      },
      create: {
        organizationId: organization.id,
        categoryId: category.id,
        unitId: unit.id,
        name: `${PREFIX} · ${ingredient.name}`,
        sku: `FLOW-${ingredient.key.toUpperCase()}`,
        gtin: ingredient.gtin,
        averagePrice: new Prisma.Decimal(ingredient.price),
        kind: ProductKind.RAW_MATERIAL,
      },
      update: {
        categoryId: category.id,
        unitId: unit.id,
        sku: `FLOW-${ingredient.key.toUpperCase()}`,
        gtin: ingredient.gtin,
        averagePrice: new Prisma.Decimal(ingredient.price),
        kind: ProductKind.RAW_MATERIAL,
        isArchived: false,
        archivedAt: null,
      },
    });
    products.set(ingredient.key, product);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = dateKey(today);
  const seeded: Array<Record<string, unknown>> = [];

  for (const [recipeIndex, recipe] of recipes.entries()) {
    const outputProduct = await prisma.product.upsert({
      where: {
        organizationId_name: {
          organizationId: organization.id,
          name: `${PREFIX} · ${recipe.outputName}`,
        },
      },
      create: {
        organizationId: organization.id,
        categoryId: category.id,
        unitId: portionUnit.id,
        name: `${PREFIX} · ${recipe.outputName}`,
        sku: `FLOW-OUTPUT-${recipe.key.toUpperCase()}`,
        kind: ProductKind.FINISHED,
      },
      update: {
        categoryId: category.id,
        unitId: portionUnit.id,
        kind: ProductKind.FINISHED,
        isArchived: false,
        archivedAt: null,
      },
    });
    const totalMinutes = recipe.steps.reduce((sum, step) => sum + step.minutes, 0);
    const sheet = await prisma.technicalSheet.upsert({
      where: {
        organizationId_name: {
          organizationId: organization.id,
          name: `${PREFIX} · ${recipe.name}`,
        },
      },
      create: {
        organizationId: organization.id,
        name: `${PREFIX} · ${recipe.name}`,
        description: `Recette de démonstration complète : ${recipe.name}.`,
        outputProductId: outputProduct.id,
        yieldUnitId: portionUnit.id,
        yieldMode: TechnicalSheetYieldMode.PORTIONS,
        referencePortions: new Prisma.Decimal(recipe.referencePortions),
        preparationTimeMinutes: Math.max(0, totalMinutes - 35),
        cookingTimeMinutes: Math.min(35, totalMinutes),
        totalTimeMinutes: totalMinutes,
        status: TechnicalSheetStatus.ACTIVE,
        mode: TechnicalSheetMode.PRODUCTION,
        stockPolicy: TechnicalSheetStockPolicy.MAKE_TO_ORDER,
      },
      update: {
        description: `Recette de démonstration complète : ${recipe.name}.`,
        outputProductId: outputProduct.id,
        yieldUnitId: portionUnit.id,
        referencePortions: new Prisma.Decimal(recipe.referencePortions),
        preparationTimeMinutes: Math.max(0, totalMinutes - 35),
        cookingTimeMinutes: Math.min(35, totalMinutes),
        totalTimeMinutes: totalMinutes,
        status: TechnicalSheetStatus.ACTIVE,
        mode: TechnicalSheetMode.PRODUCTION,
        stockPolicy: TechnicalSheetStockPolicy.MAKE_TO_ORDER,
        isArchived: false,
        archivedAt: null,
      },
    });

    await prisma.technicalSheetIngredient.deleteMany({ where: { technicalSheetId: sheet.id } });
    await prisma.technicalSheetStep.deleteMany({ where: { technicalSheetId: sheet.id } });
    const ingredientRows = [];
    for (const [ingredientIndex, ingredient] of recipe.ingredients.entries()) {
      const product = products.get(ingredient.key);
      const unit = unitBySymbol.get(ingredient.symbol)!;
      ingredientRows.push(await prisma.technicalSheetIngredient.create({
        data: {
          organizationId: organization.id,
          technicalSheetId: sheet.id,
          productId: product.id,
          unitId: unit.id,
          quantity: new Prisma.Decimal(ingredient.quantity),
          order: ingredientIndex,
          productNameSnapshot: product.name,
          unitSymbolSnapshot: unit.symbol,
          productUnitIdSnapshot: product.unitId,
          productUnitSymbolSnapshot: unit.symbol,
          unitPriceSnapshot: product.averagePrice,
          cost: new Prisma.Decimal(ingredient.quantity).mul(product.averagePrice),
        },
      }));
    }
    const stepRows = [];
    for (const [stepIndex, step] of recipe.steps.entries()) {
      stepRows.push(await prisma.technicalSheetStep.create({
        data: {
          organizationId: organization.id,
          technicalSheetId: sheet.id,
          order: stepIndex,
          title: step.title,
          description: step.description,
          estimatedMinutes: step.minutes,
        },
      }));
    }

    const snapshot = {
      name: recipe.name,
      description: sheet.description,
      yieldMode: TechnicalSheetYieldMode.PORTIONS,
      referencePortions: String(recipe.referencePortions),
      totalMassGrams: '0',
      preparationTimeMinutes: sheet.preparationTimeMinutes,
      cookingTimeMinutes: sheet.cookingTimeMinutes,
      totalTimeMinutes: totalMinutes,
      mode: TechnicalSheetMode.PRODUCTION,
      stockPolicy: TechnicalSheetStockPolicy.MAKE_TO_ORDER,
      outputProductId: outputProduct.id,
      yieldUnitId: portionUnit.id,
      ingredients: ingredientRows.map((row, index) => ({
        id: row.id,
        productId: row.productId,
        unitId: row.unitId,
        quantity: row.quantity.toString(),
        productName: recipe.ingredients[index].name,
        unitSymbol: recipe.ingredients[index].symbol,
        comment: null,
        section: 'Préparation globale · étape 1',
        order: index,
      })),
      steps: stepRows.map((row) => ({
        id: row.id,
        order: row.order,
        title: row.title,
        description: row.description,
        section: null,
        estimatedMinutes: row.estimatedMinutes,
      })),
    };
    const version = await prisma.technicalSheetVersion.upsert({
      where: {
        technicalSheetId_version: {
          technicalSheetId: sheet.id,
          version: 1,
        },
      },
      create: {
        organizationId: organization.id,
        technicalSheetId: sheet.id,
        version: 1,
        sourceUpdatedAt: sheet.updatedAt,
        referenceYield: new Prisma.Decimal(recipe.referencePortions),
        snapshot,
      },
      update: {
        sourceUpdatedAt: sheet.updatedAt,
        referenceYield: new Prisma.Decimal(recipe.referencePortions),
        snapshot,
      },
    });
    const existingProfile = await prisma.productionProfile.findFirst({
      where: {
        organizationId: organization.id,
        siteId: site.id,
        technicalSheetId: sheet.id,
        outputProductId: outputProduct.id,
        outputVariantId: null,
      },
    });
    const profileData = {
      yieldUnitId: portionUnit.id,
      referenceYield: new Prisma.Decimal(recipe.referencePortions),
      minimumQuantity: new Prisma.Decimal(recipe.referencePortions),
      optimalQuantity: new Prisma.Decimal(recipe.plannedPortions),
      maximumQuantity: new Prisma.Decimal(recipe.plannedPortions * 2),
      canFreeze: true,
      shelfLifeHours: 72,
      frozenShelfLifeHours: 720,
    };
    if (existingProfile) {
      await prisma.productionProfile.update({
        where: { id: existingProfile.id },
        data: profileData,
      });
    } else {
      await prisma.productionProfile.create({
        data: {
          organizationId: organization.id,
          siteId: site.id,
          technicalSheetId: sheet.id,
          outputProductId: outputProduct.id,
          ...profileData,
        },
      });
    }

    const plannedTime = `${String(recipe.hour).padStart(2, '0')}:${String(recipe.minute).padStart(2, '0')}`;
    const orderNumber = `FLOW-${todayKey.replaceAll('-', '')}-${String(recipeIndex + 1).padStart(2, '0')}`;
    const order = await prisma.productionOrder.upsert({
      where: {
        organizationId_number: {
          organizationId: organization.id,
          number: orderNumber,
        },
      },
      create: {
        organizationId: organization.id,
        siteId: site.id,
        number: orderNumber,
        name: recipe.name,
        technicalSheetId: sheet.id,
        recipeVersionId: version.id,
        outputProductId: outputProduct.id,
        productionDate: today,
        plannedTime,
        status: ProductionOrderStatus.VALIDATED,
        priority: recipeIndex === 0 ? ProductionPriority.HIGH : ProductionPriority.NORMAL,
        serviceId: department.id,
        responsibleEmployeeId: employees[recipeIndex % employees.length].id,
        targetMode: TechnicalSheetYieldMode.PORTIONS,
        targetQuantity: new Prisma.Decimal(recipe.plannedPortions),
        plannedPortions: new Prisma.Decimal(recipe.plannedPortions),
        grossRequirement: new Prisma.Decimal(recipe.plannedPortions),
        netRequirement: new Prisma.Decimal(recipe.plannedPortions),
        proposedQuantity: new Prisma.Decimal(recipe.plannedPortions),
        validatedQuantity: new Prisma.Decimal(recipe.plannedPortions),
        comments: 'Journée type mobile Production → traçabilité HACCP.',
        source: 'DEMO_PRODUCTION_FLOW',
        createdById: actor.id,
        updatedById: actor.id,
      },
      update: {
        siteId: site.id,
        name: recipe.name,
        technicalSheetId: sheet.id,
        recipeVersionId: version.id,
        outputProductId: outputProduct.id,
        productionDate: today,
        plannedTime,
        status: ProductionOrderStatus.VALIDATED,
        priority: recipeIndex === 0 ? ProductionPriority.HIGH : ProductionPriority.NORMAL,
        serviceId: department.id,
        responsibleEmployeeId: employees[recipeIndex % employees.length].id,
        targetQuantity: new Prisma.Decimal(recipe.plannedPortions),
        plannedPortions: new Prisma.Decimal(recipe.plannedPortions),
        grossRequirement: new Prisma.Decimal(recipe.plannedPortions),
        netRequirement: new Prisma.Decimal(recipe.plannedPortions),
        proposedQuantity: new Prisma.Decimal(recipe.plannedPortions),
        validatedQuantity: new Prisma.Decimal(recipe.plannedPortions),
        realizedPortions: null,
        completedById: null,
        completedAt: null,
        cancelledAt: null,
        comments: 'Journée type mobile Production → traçabilité HACCP.',
        updatedById: actor.id,
      },
    });

    const startsAt = atTime(today, recipe.hour, recipe.minute);
    const endsAt = new Date(startsAt.getTime() + totalMinutes * 60_000);
    const batch = await prisma.productionBatch.upsert({
      where: {
        organizationId_reference: {
          organizationId: organization.id,
          reference: `${orderNumber}-LOT-01`,
        },
      },
      create: {
        organizationId: organization.id,
        orderId: order.id,
        recipeVersionId: version.id,
        unitId: portionUnit.id,
        destinationLocationId: location.id,
        producerUserId: actor.id,
        number: 1,
        reference: `${orderNumber}-LOT-01`,
        plannedQuantity: new Prisma.Decimal(recipe.plannedPortions),
        status: ProductionBatchStatus.TO_PREPARE,
        plannedStartAt: startsAt,
      },
      update: {
        orderId: order.id,
        recipeVersionId: version.id,
        unitId: portionUnit.id,
        destinationLocationId: location.id,
        producerUserId: actor.id,
        plannedQuantity: new Prisma.Decimal(recipe.plannedPortions),
        actualQuantity: null,
        lostQuantity: new Prisma.Decimal(0),
        status: ProductionBatchStatus.TO_PREPARE,
        plannedStartAt: startsAt,
        startedAt: null,
        completedAt: null,
        completedById: null,
      },
    });
    await prisma.haccpProductionIngredientTraceability.deleteMany({
      where: { organizationId: organization.id, productionBatchId: batch.id },
    });

    const operationRows = [];
    let cursor = new Date(startsAt);
    for (const [stepIndex, step] of recipe.steps.entries()) {
      const operation = await prisma.productionOperation.upsert({
        where: {
          batchId_position: {
            batchId: batch.id,
            position: stepIndex,
          },
        },
        create: {
          organizationId: organization.id,
          batchId: batch.id,
          responsibleEmployeeId: employees[recipeIndex % employees.length].id,
          type: step.type,
          title: step.title,
          position: stepIndex,
          plannedAt: cursor,
          activeMinutes: step.minutes,
          status: stepIndex === 0 ? ProductionOperationStatus.READY : ProductionOperationStatus.PENDING,
          notes: step.description,
        },
        update: {
          responsibleEmployeeId: employees[recipeIndex % employees.length].id,
          type: step.type,
          title: step.title,
          plannedAt: cursor,
          activeMinutes: step.minutes,
          status: stepIndex === 0 ? ProductionOperationStatus.READY : ProductionOperationStatus.PENDING,
          startedAt: null,
          completedAt: null,
          notes: step.description,
        },
      });
      operationRows.push(operation);
      cursor = new Date(cursor.getTime() + step.minutes * 60_000);
    }
    await prisma.productionOperationDependency.deleteMany({
      where: { organizationId: organization.id, operationId: { in: operationRows.map((row) => row.id) } },
    });
    for (let index = 1; index < operationRows.length; index += 1) {
      await prisma.productionOperationDependency.create({
        data: {
          organizationId: organization.id,
          operationId: operationRows[index].id,
          prerequisiteId: operationRows[index - 1].id,
        },
      });
    }

    const task = await prisma.operationalTask.upsert({
      where: {
        organizationId_sourceKey: {
          organizationId: organization.id,
          sourceKey: `${PREFIX}:${todayKey}:${recipe.key}`,
        },
      },
      create: {
        organizationId: organization.id,
        sourceKey: `${PREFIX}:${todayKey}:${recipe.key}`,
        title: `Recette complète · ${recipe.name}`,
        description: `Réaliser ${recipe.name} étape par étape et saisir une preuve photo par ingrédient.`,
        category: OperationalTaskCategory.KITCHEN,
        status: OperationalTaskStatus.TODO,
        source: OperationalTaskSource.PRODUCTION,
        departmentId: department.id,
        positionId: position.id,
        siteId: site.id,
        assignedEmployeeId: employees[recipeIndex % employees.length].id,
        technicalSheetId: sheet.id,
        productionBatchId: batch.id,
        startsAt,
        endsAt,
        isTimeScheduled: true,
        quantity: new Prisma.Decimal(recipe.plannedPortions),
        unitLabel: portionUnit.symbol,
        createdById: actor.id,
      },
      update: {
        title: `Recette complète · ${recipe.name}`,
        description: `Réaliser ${recipe.name} étape par étape et saisir une preuve photo par ingrédient.`,
        category: OperationalTaskCategory.KITCHEN,
        status: OperationalTaskStatus.TODO,
        departmentId: department.id,
        positionId: position.id,
        siteId: site.id,
        assignedEmployeeId: employees[recipeIndex % employees.length].id,
        technicalSheetId: sheet.id,
        technicalSheetStepId: null,
        productionBatchId: batch.id,
        productionOperationId: null,
        startsAt,
        endsAt,
        isTimeScheduled: true,
        quantity: new Prisma.Decimal(recipe.plannedPortions),
        unitLabel: portionUnit.symbol,
        completedAt: null,
      },
    });
    await prisma.operationalTaskAssignment.deleteMany({ where: { taskId: task.id } });
    await prisma.operationalTaskAssignment.create({
      data: {
        organizationId: organization.id,
        taskId: task.id,
        employeeId: employees[recipeIndex % employees.length].id,
        isLead: true,
        mission: `Réaliser et contrôler ${recipe.name}`,
        plannedMinutes: totalMinutes,
      },
    });
    await prisma.productionAssignment.upsert({
      where: {
        orderId_employeeId: {
          orderId: order.id,
          employeeId: employees[recipeIndex % employees.length].id,
        },
      },
      create: {
        organizationId: organization.id,
        orderId: order.id,
        employeeId: employees[recipeIndex % employees.length].id,
        mission: `Responsable ${recipe.name}`,
        plannedMinutes: totalMinutes,
        isLead: true,
      },
      update: {
        mission: `Responsable ${recipe.name}`,
        plannedMinutes: totalMinutes,
        isLead: true,
      },
    });

    seeded.push({
      taskId: task.id,
      batchId: batch.id,
      reference: batch.reference,
      recipe: recipe.name,
      schedule: `${plannedTime}–${String(endsAt.getHours()).padStart(2, '0')}:${String(endsAt.getMinutes()).padStart(2, '0')}`,
      portions: recipe.plannedPortions,
      ingredients: recipe.ingredients.length,
      steps: recipe.steps.length,
      employee: `${employees[recipeIndex % employees.length].firstName} ${employees[recipeIndex % employees.length].lastName}`,
    });
  }

  console.log(JSON.stringify({
    organization: { id: organization.id, name: organization.name },
    date: todayKey,
    site: site.name,
    reset: 'Les lots de démonstration sont remis à TO_PREPARE et leurs preuves HACCP sont vidées.',
    productions: seeded,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
