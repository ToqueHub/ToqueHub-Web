import {
  CatererEventStatus,
  CatererFulfillmentMode,
  ConservationState,
  MenuActivity,
  MenuKind,
  MenuProductionGenerationMode,
  MenuSectionType,
  MenuServiceType,
  MenuStatus,
  OperationalTaskCategory,
  OperationalTaskSource,
  OperationalTaskStatus,
  PlanningAssignmentOrigin,
  PlanningAssignmentStatus,
  Prisma,
  PrismaClient,
  ProductKind,
  ProductionOrderStatus,
  ProductionPriority,
  TechnicalSheetMode,
  TechnicalSheetStatus,
  TechnicalSheetStockPolicy,
  TechnicalSheetYieldMode,
  UnitType,
} from '@prisma/client';
import { CatererMenusService } from '../src/menus/caterer-menus.service';
import { MenusService } from '../src/menus/menus.service';
import { CatererEventLifecycleService } from '../src/production/caterer-event-lifecycle.service';
import { ProductionExecutionService } from '../src/production/production-execution.service';
import { ProductionPlanningService } from '../src/production/production-planning.service';
import { ProductionService } from '../src/production/production.service';

const prisma = new PrismaClient();
const DEMO_PREFIX = 'DEMO TRAITEUR';

function futureDate(days: number, hours: number, minutes = 0) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  value.setHours(hours, minutes, 0, 0);
  return value;
}

async function main() {
  const requestedOrganizationId = process.env.DEMO_ORGANIZATION_ID?.trim();
  const organization = requestedOrganizationId
    ? await prisma.organization.findUnique({ where: { id: requestedOrganizationId } })
    : await prisma.organization.findFirst({
        where: { users: { some: { isActive: true } } },
        orderBy: { createdAt: 'asc' },
      });
  if (!organization) {
    throw new Error(
      'Aucune organisation active trouvée. Créez d’abord votre compte administrateur.',
    );
  }
  const actor = await prisma.user.findFirst({
    where: { organizationId: organization.id, isActive: true },
    orderBy: [{ isPrimaryAdmin: 'desc' }, { createdAt: 'asc' }],
  });
  if (!actor) throw new Error('Aucun utilisateur actif trouvé pour cette organisation.');

  await prisma.organization.update({
    where: { id: organization.id },
    data: {
      stocksInstalledAt: organization.stocksInstalledAt ?? new Date(),
      hrInstalledAt: organization.hrInstalledAt ?? new Date(),
      planningInstalledAt: organization.planningInstalledAt ?? new Date(),
      technicalSheetsInstalledAt: organization.technicalSheetsInstalledAt ?? new Date(),
      productionInstalledAt: organization.productionInstalledAt ?? new Date(),
      menusInstalledAt: organization.menusInstalledAt ?? new Date(),
    },
  });

  const [portionUnit, kilogramUnit, literUnit, pieceUnit] = await Promise.all([
    upsertUnit(organization.id, 'Portion', 'portion', UnitType.COUNT),
    upsertUnit(organization.id, 'Kilogramme', 'kg', UnitType.MASS),
    upsertUnit(organization.id, 'Litre', 'L', UnitType.VOLUME),
    upsertUnit(organization.id, 'Pièce', 'pce', UnitType.COUNT),
  ]);
  const category = await prisma.category.upsert({
    where: {
      organizationId_name: { organizationId: organization.id, name: DEMO_PREFIX },
    },
    create: {
      organizationId: organization.id,
      name: DEMO_PREFIX,
      description: 'Produits de démonstration du parcours Traiteur vers Production.',
    },
    update: { isArchived: false, archivedAt: null },
  });
  const site = await prisma.site.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: `${DEMO_PREFIX} · Cuisine centrale`,
      },
    },
    create: {
      organizationId: organization.id,
      name: `${DEMO_PREFIX} · Cuisine centrale`,
      address: '12 rue des Saveurs, 75011 Paris',
      responsibleName: 'Alice Martin',
      responsibleEmail: 'alice.demo@toquehub.local',
    },
    update: { isArchived: false, archivedAt: null },
  });
  const location = await prisma.location.upsert({
    where: {
      organizationId_siteId_name: {
        organizationId: organization.id,
        siteId: site.id,
        name: `${DEMO_PREFIX} · Réserve cuisine`,
      },
    },
    create: {
      organizationId: organization.id,
      siteId: site.id,
      name: `${DEMO_PREFIX} · Réserve cuisine`,
    },
    update: { isArchived: false, archivedAt: null },
  });

  const kitchenDepartment = await prisma.hrDepartment.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: `${DEMO_PREFIX} · Cuisine`,
      },
    },
    create: {
      organizationId: organization.id,
      name: `${DEMO_PREFIX} · Cuisine`,
      description: 'Service cuisine utilisé pour les fabrications Traiteur de démonstration.',
    },
    update: { isArchived: false, archivedAt: null },
  });
  const logisticsDepartment = await prisma.hrDepartment.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: `${DEMO_PREFIX} · Logistique`,
      },
    },
    create: {
      organizationId: organization.id,
      name: `${DEMO_PREFIX} · Logistique`,
      description: 'Conditionnement, chargement, livraison et installation.',
    },
    update: { isArchived: false, archivedAt: null },
  });
  const chefPosition = await upsertPosition(
    organization.id,
    kitchenDepartment.id,
    `${DEMO_PREFIX} · Chef de cuisine`,
  );
  const cookPosition = await upsertPosition(
    organization.id,
    kitchenDepartment.id,
    `${DEMO_PREFIX} · Cuisinier`,
  );
  const logisticsPosition = await upsertPosition(
    organization.id,
    logisticsDepartment.id,
    `${DEMO_PREFIX} · Responsable logistique`,
  );
  const driverPosition = await upsertPosition(
    organization.id,
    logisticsDepartment.id,
    `${DEMO_PREFIX} · Chauffeur-livreur`,
  );
  const [chef, cook, logisticsLead, driver] = await Promise.all([
    upsertEmployee(
      organization.id,
      kitchenDepartment.id,
      chefPosition.id,
      site.id,
      'Alice',
      'Martin',
      'DEMO-TR-001',
      'alice.demo@toquehub.local',
    ),
    upsertEmployee(
      organization.id,
      kitchenDepartment.id,
      cookPosition.id,
      site.id,
      'Karim',
      'Benali',
      'DEMO-TR-002',
      'karim.demo@toquehub.local',
    ),
    upsertEmployee(
      organization.id,
      logisticsDepartment.id,
      logisticsPosition.id,
      site.id,
      'Léa',
      'Moreau',
      'DEMO-TR-003',
      'lea.demo@toquehub.local',
    ),
    upsertEmployee(
      organization.id,
      logisticsDepartment.id,
      driverPosition.id,
      site.id,
      'Thomas',
      'Roy',
      'DEMO-TR-004',
      'thomas.demo@toquehub.local',
    ),
  ]);

  const rawProducts = {
    eggs: await upsertProduct(
      organization.id,
      category.id,
      pieceUnit.id,
      `${DEMO_PREFIX} · Œufs`,
      ProductKind.RAW_MATERIAL,
      0.28,
    ),
    cream: await upsertProduct(
      organization.id,
      category.id,
      literUnit.id,
      `${DEMO_PREFIX} · Crème liquide`,
      ProductKind.RAW_MATERIAL,
      4.2,
    ),
    vegetables: await upsertProduct(
      organization.id,
      category.id,
      kilogramUnit.id,
      `${DEMO_PREFIX} · Légumes forestiers`,
      ProductKind.RAW_MATERIAL,
      6.5,
    ),
    chicken: await upsertProduct(
      organization.id,
      category.id,
      kilogramUnit.id,
      `${DEMO_PREFIX} · Suprême de volaille`,
      ProductKind.RAW_MATERIAL,
      12,
    ),
    butter: await upsertProduct(
      organization.id,
      category.id,
      kilogramUnit.id,
      `${DEMO_PREFIX} · Beurre`,
      ProductKind.RAW_MATERIAL,
      9,
    ),
    chocolate: await upsertProduct(
      organization.id,
      category.id,
      kilogramUnit.id,
      `${DEMO_PREFIX} · Chocolat noir`,
      ProductKind.RAW_MATERIAL,
      14,
    ),
  };
  const juice = await upsertProduct(
    organization.id,
    category.id,
    pieceUnit.id,
    `${DEMO_PREFIX} · Jus de pomme individuel`,
    ProductKind.PACKAGED,
    1.4,
  );
  await Promise.all([
    seedStock(organization.id, site.id, location.id, rawProducts.eggs.id, 1200, 'OEUFS', 21),
    seedStock(organization.id, site.id, location.id, rawProducts.cream.id, 180, 'CREME', 18),
    seedStock(
      organization.id,
      site.id,
      location.id,
      rawProducts.vegetables.id,
      220,
      'LEGUMES',
      25,
    ),
    seedStock(
      organization.id,
      site.id,
      location.id,
      rawProducts.chicken.id,
      260,
      'VOLAILLE',
      16,
    ),
    seedStock(organization.id, site.id, location.id, rawProducts.butter.id, 140, 'BEURRE', 35),
    seedStock(
      organization.id,
      site.id,
      location.id,
      rawProducts.chocolate.id,
      180,
      'CHOCOLAT',
      90,
      ConservationState.AMBIENT,
    ),
    seedStock(
      organization.id,
      site.id,
      location.id,
      juice.id,
      600,
      'JUS-POMME',
      120,
      ConservationState.AMBIENT,
    ),
  ]);

  const quicheOutput = await upsertProduct(
    organization.id,
    category.id,
    portionUnit.id,
    `${DEMO_PREFIX} · Mini quiche forestière finie`,
    ProductKind.FINISHED,
    0,
  );
  const chickenOutput = await upsertProduct(
    organization.id,
    category.id,
    portionUnit.id,
    `${DEMO_PREFIX} · Volaille forestière finie`,
    ProductKind.FINISHED,
    0,
  );
  const tartOutput = await upsertProduct(
    organization.id,
    category.id,
    portionUnit.id,
    `${DEMO_PREFIX} · Tarte chocolat finie`,
    ProductKind.FINISHED,
    0,
  );
  const quicheSheet = await upsertTechnicalSheet({
    organizationId: organization.id,
    name: `${DEMO_PREFIX} · Mini quiches forestières`,
    outputProductId: quicheOutput.id,
    yieldUnitId: portionUnit.id,
    referencePortions: 20,
    ingredients: [
      { product: rawProducts.eggs, unitId: pieceUnit.id, quantity: 10 },
      { product: rawProducts.cream, unitId: literUnit.id, quantity: 1 },
      { product: rawProducts.vegetables, unitId: kilogramUnit.id, quantity: 2 },
    ],
    steps: [
      ['Préparer l’appareil', 'Mélanger les œufs, la crème et assaisonner.', 20],
      ['Garnir les moules', 'Répartir la garniture et remplir les moules.', 25],
      ['Cuire et refroidir', 'Cuire, contrôler puis refroidir avant conditionnement.', 35],
    ],
  });
  const chickenSheet = await upsertTechnicalSheet({
    organizationId: organization.id,
    name: `${DEMO_PREFIX} · Suprême de volaille sauce forestière`,
    outputProductId: chickenOutput.id,
    yieldUnitId: portionUnit.id,
    referencePortions: 20,
    ingredients: [
      { product: rawProducts.chicken, unitId: kilogramUnit.id, quantity: 4 },
      { product: rawProducts.cream, unitId: literUnit.id, quantity: 2 },
      { product: rawProducts.vegetables, unitId: kilogramUnit.id, quantity: 1.5 },
    ],
    steps: [
      ['Préparer la volaille', 'Parer, portionner et assaisonner les suprêmes.', 30],
      ['Cuire', 'Cuire la volaille et contrôler la température à cœur.', 45],
      ['Réaliser la sauce', 'Réduire la crème avec la garniture forestière.', 30],
      ['Conditionner', 'Assembler, refroidir et étiqueter les bacs.', 25],
    ],
  });
  const tartSheet = await upsertTechnicalSheet({
    organizationId: organization.id,
    name: `${DEMO_PREFIX} · Tarte chocolat`,
    outputProductId: tartOutput.id,
    yieldUnitId: portionUnit.id,
    referencePortions: 12,
    ingredients: [
      { product: rawProducts.butter, unitId: kilogramUnit.id, quantity: 0.5 },
      { product: rawProducts.chocolate, unitId: kilogramUnit.id, quantity: 1 },
      { product: rawProducts.eggs, unitId: pieceUnit.id, quantity: 6 },
      { product: rawProducts.cream, unitId: literUnit.id, quantity: 0.5 },
    ],
    steps: [
      ['Foncer les tartes', 'Préparer les fonds puis les cuire à blanc.', 35],
      ['Préparer la ganache', 'Émulsionner le chocolat et la crème.', 25],
      ['Garnir et réserver', 'Garnir les fonds et laisser cristalliser au froid.', 40],
    ],
  });
  await Promise.all([
    upsertProductionProfile(
      organization.id,
      site.id,
      quicheSheet.id,
      quicheOutput.id,
      portionUnit.id,
      20,
    ),
    upsertProductionProfile(
      organization.id,
      site.id,
      chickenSheet.id,
      chickenOutput.id,
      portionUnit.id,
      20,
    ),
    upsertProductionProfile(
      organization.id,
      site.id,
      tartSheet.id,
      tartOutput.id,
      portionUnit.id,
      12,
    ),
  ]);

  const client = await prisma.catererClient.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: `${DEMO_PREFIX} · Maison Dupont`,
      },
    },
    create: {
      organizationId: organization.id,
      name: `${DEMO_PREFIX} · Maison Dupont`,
      contactName: 'Camille Dupont',
      email: 'camille.dupont@example.test',
      phone: '06 00 00 00 42',
      address: '25 avenue de la République, 75011 Paris',
      notes: 'Client fictif réservé aux tests du parcours Traiteur.',
    },
    update: { isArchived: false, archivedAt: null },
  });

  const events = [
    await createEventIfMissing({
      organizationId: organization.id,
      actorId: actor.id,
      siteId: site.id,
      clientId: client.id,
      reference: 'DEMO-TRAITEUR-LIVRAISON',
      name: `${DEMO_PREFIX} · Mariage – Livraison`,
      fulfillmentMode: CatererFulfillmentMode.DELIVERY,
      dayOffset: 7,
      address: 'Domaine des Tilleuls, 8 route de Meaux, 77410 Villevaudé',
      prestations: [
        {
          name: 'Cocktail apéritif',
          service: MenuServiceType.EVENT,
          expectedGuests: 60,
          readyHour: 15,
          handoffHour: 16,
          serviceHour: 18,
          items: [
            { section: MenuSectionType.STARTER, technicalSheetId: quicheSheet.id, serving: 0.5 },
            { section: MenuSectionType.DRINK, productId: juice.id, serving: 1 },
          ],
        },
        {
          name: 'Dîner assis',
          service: MenuServiceType.DINNER,
          expectedGuests: 60,
          readyHour: 16,
          handoffHour: 17,
          serviceHour: 19,
          items: [
            { section: MenuSectionType.MAIN, technicalSheetId: chickenSheet.id, serving: 1 },
          ],
        },
        {
          name: 'Dessert',
          service: MenuServiceType.DINNER,
          expectedGuests: 60,
          readyHour: 17,
          handoffHour: 18,
          serviceHour: 21,
          items: [
            { section: MenuSectionType.DESSERT, technicalSheetId: tartSheet.id, serving: 1 },
          ],
        },
      ],
    }),
    await createEventIfMissing({
      organizationId: organization.id,
      actorId: actor.id,
      siteId: site.id,
      clientId: client.id,
      reference: 'DEMO-TRAITEUR-RETRAIT',
      name: `${DEMO_PREFIX} · Cocktail entreprise – Retrait`,
      fulfillmentMode: CatererFulfillmentMode.PICKUP,
      dayOffset: 10,
      address: 'Retrait à la cuisine centrale',
      prestations: [
        {
          name: 'Cocktail déjeunatoire',
          service: MenuServiceType.EVENT,
          expectedGuests: 35,
          readyHour: 10,
          handoffHour: 11,
          serviceHour: 12,
          items: [
            { section: MenuSectionType.STARTER, technicalSheetId: quicheSheet.id, serving: 1 },
            { section: MenuSectionType.DESSERT, technicalSheetId: tartSheet.id, serving: 0.5 },
            { section: MenuSectionType.DRINK, productId: juice.id, serving: 1 },
          ],
        },
      ],
    }),
    await createEventIfMissing({
      organizationId: organization.id,
      actorId: actor.id,
      siteId: site.id,
      clientId: client.id,
      reference: 'DEMO-TRAITEUR-SUR-SITE',
      name: `${DEMO_PREFIX} · Réception – Sur site`,
      fulfillmentMode: CatererFulfillmentMode.ON_SITE,
      dayOffset: 14,
      address: 'Galerie Lumière, 18 rue du Bac, 75007 Paris',
      prestations: [
        {
          name: 'Réception sur site',
          service: MenuServiceType.BUFFET,
          expectedGuests: 80,
          readyHour: 15,
          handoffHour: 16,
          serviceHour: 18,
          items: [
            { section: MenuSectionType.STARTER, technicalSheetId: quicheSheet.id, serving: 0.75 },
            { section: MenuSectionType.MAIN, technicalSheetId: chickenSheet.id, serving: 1 },
            { section: MenuSectionType.DESSERT, technicalSheetId: tartSheet.id, serving: 1 },
          ],
        },
      ],
    }),
  ];
  const productionDemo = await seedProductionAndOperationalPlanning({
    organizationId: organization.id,
    actorId: actor.id,
    siteId: site.id,
    kitchenDepartmentId: kitchenDepartment.id,
    logisticsDepartmentId: logisticsDepartment.id,
    chef,
    cook,
    logisticsLead,
    driver,
    events,
  });

  console.log(
    JSON.stringify(
      {
        organization: organization.name,
        site: site.name,
        kitchenDepartment: kitchenDepartment.name,
        logisticsDepartment: logisticsDepartment.name,
        events: events.map((event) => ({
          reference: event.reference,
          name: event.name,
          startsAt: event.startsAt,
          status: event.status,
        })),
        recipes: [quicheSheet.name, chickenSheet.name, tartSheet.name],
        production: productionDemo,
      },
      null,
      2,
    ),
  );
}

async function upsertUnit(
  organizationId: string,
  name: string,
  symbol: string,
  type: UnitType,
) {
  return prisma.unit.upsert({
    where: { organizationId_symbol: { organizationId, symbol } },
    create: { organizationId, name, symbol, type },
    update: { name, type, isArchived: false, archivedAt: null },
  });
}

async function upsertPosition(organizationId: string, departmentId: string, name: string) {
  return prisma.hrPosition.upsert({
    where: { organizationId_name: { organizationId, name } },
    create: { organizationId, departmentId, name },
    update: { departmentId, isArchived: false, archivedAt: null },
  });
}

async function upsertEmployee(
  organizationId: string,
  departmentId: string,
  positionId: string,
  mainSiteId: string,
  firstName: string,
  lastName: string,
  employeeNumber: string,
  email: string,
) {
  return prisma.hrEmployee.upsert({
    where: { organizationId_employeeNumber: { organizationId, employeeNumber } },
    create: {
      organizationId,
      departmentId,
      positionId,
      mainSiteId,
      firstName,
      lastName,
      employeeNumber,
      email,
      hireDate: new Date('2025-01-06T00:00:00.000Z'),
      contractType: 'CDI',
      contractWeeklyMinutes: 2100,
    },
    update: {
      departmentId,
      positionId,
      mainSiteId,
      firstName,
      lastName,
      email,
      status: 'ACTIVE',
      isArchived: false,
      archivedAt: null,
    },
  });
}

async function upsertProduct(
  organizationId: string,
  categoryId: string,
  unitId: string,
  name: string,
  kind: ProductKind,
  averagePrice: number,
) {
  const existing = await prisma.product.findFirst({ where: { organizationId, name } });
  const data = {
    categoryId,
    unitId,
    kind,
    averagePrice: new Prisma.Decimal(averagePrice),
    isArchived: false,
    archivedAt: null,
  };
  return existing
    ? prisma.product.update({ where: { id: existing.id }, data })
    : prisma.product.create({ data: { organizationId, name, ...data } });
}

async function seedStock(
  organizationId: string,
  siteId: string,
  locationId: string,
  productId: string,
  quantity: number,
  lotCode: string,
  shelfLifeDays: number,
  conservationState = ConservationState.CHILLED,
) {
  const expiresAt = futureDate(shelfLifeDays, 23, 59);
  const lot = await prisma.lot.upsert({
    where: {
      organizationId_lotNumber_productId: {
        organizationId,
        lotNumber: `${DEMO_PREFIX}-${lotCode}`,
        productId,
      },
    },
    create: {
      organizationId,
      productId,
      lotNumber: `${DEMO_PREFIX}-${lotCode}`,
      siteId,
      locationId,
      initialQuantity: new Prisma.Decimal(quantity),
      conservationState,
      expiresAt,
    },
    update: {
      siteId,
      locationId,
      initialQuantity: new Prisma.Decimal(quantity),
      conservationState,
      expiresAt,
    },
  });
  const existing = await prisma.stock.findFirst({
    where: {
      organizationId,
      productId,
      variantId: null,
      lotId: lot.id,
      siteId,
      locationId,
    },
  });
  return existing
    ? prisma.stock.update({
        where: { id: existing.id },
        data: { quantity: new Prisma.Decimal(quantity) },
      })
    : prisma.stock.create({
        data: {
          organizationId,
          productId,
          lotId: lot.id,
          siteId,
          locationId,
          quantity: new Prisma.Decimal(quantity),
        },
      });
}

async function upsertTechnicalSheet(input: {
  organizationId: string;
  name: string;
  outputProductId: string;
  yieldUnitId: string;
  referencePortions: number;
  ingredients: Array<{
    product: { id: string; name: string; unitId: string; averagePrice: Prisma.Decimal };
    unitId: string;
    quantity: number;
  }>;
  steps: Array<[string, string, number]>;
}) {
  const existing = await prisma.technicalSheet.findUnique({
    where: {
      organizationId_name: {
        organizationId: input.organizationId,
        name: input.name,
      },
    },
  });
  const totalMinutes = input.steps.reduce((sum, step) => sum + step[2], 0);
  const data = {
    outputProductId: input.outputProductId,
    yieldUnitId: input.yieldUnitId,
    referencePortions: new Prisma.Decimal(input.referencePortions),
    yieldMode: TechnicalSheetYieldMode.PORTIONS,
    mode: TechnicalSheetMode.PRODUCTION,
    stockPolicy: TechnicalSheetStockPolicy.MAKE_TO_ORDER,
    preparationTimeMinutes: Math.max(0, totalMinutes - 35),
    cookingTimeMinutes: Math.min(35, totalMinutes),
    totalTimeMinutes: totalMinutes,
    status: TechnicalSheetStatus.ACTIVE,
    isArchived: false,
    archivedAt: null,
  };
  const sheet = existing
    ? await prisma.technicalSheet.update({ where: { id: existing.id }, data })
    : await prisma.technicalSheet.create({
        data: { organizationId: input.organizationId, name: input.name, ...data },
      });
  for (const [index, ingredient] of input.ingredients.entries()) {
    const current = await prisma.technicalSheetIngredient.findFirst({
      where: {
        organizationId: input.organizationId,
        technicalSheetId: sheet.id,
        productId: ingredient.product.id,
      },
    });
    const quantity = new Prisma.Decimal(ingredient.quantity);
    const ingredientData = {
      unitId: ingredient.unitId,
      quantity,
      order: index,
      productNameSnapshot: ingredient.product.name,
      productUnitIdSnapshot: ingredient.product.unitId,
      unitPriceSnapshot: ingredient.product.averagePrice,
      cost: quantity.mul(ingredient.product.averagePrice),
      isCalculable: true,
    };
    if (current) {
      await prisma.technicalSheetIngredient.update({
        where: { id: current.id },
        data: ingredientData,
      });
    } else {
      await prisma.technicalSheetIngredient.create({
        data: {
          organizationId: input.organizationId,
          technicalSheetId: sheet.id,
          productId: ingredient.product.id,
          ...ingredientData,
        },
      });
    }
  }
  for (const [index, step] of input.steps.entries()) {
    await prisma.technicalSheetStep.upsert({
      where: { technicalSheetId_order: { technicalSheetId: sheet.id, order: index } },
      create: {
        organizationId: input.organizationId,
        technicalSheetId: sheet.id,
        order: index,
        title: step[0],
        description: step[1],
        estimatedMinutes: step[2],
      },
      update: {
        title: step[0],
        description: step[1],
        estimatedMinutes: step[2],
      },
    });
  }
  return sheet;
}

async function upsertProductionProfile(
  organizationId: string,
  siteId: string,
  technicalSheetId: string,
  outputProductId: string,
  yieldUnitId: string,
  referenceYield: number,
) {
  const existing = await prisma.productionProfile.findFirst({
    where: {
      organizationId,
      siteId,
      technicalSheetId,
      outputProductId,
      outputVariantId: null,
    },
  });
  const data = {
    yieldUnitId,
    referenceYield: new Prisma.Decimal(referenceYield),
    minimumQuantity: new Prisma.Decimal(referenceYield),
    optimalQuantity: new Prisma.Decimal(referenceYield * 2),
    maximumQuantity: new Prisma.Decimal(referenceYield * 8),
    stepQuantity: new Prisma.Decimal(referenceYield),
    allowHalfBatch: true,
    allowDoubleBatch: true,
    averageLossPercent: new Prisma.Decimal(2),
    safetyMarginPercent: new Prisma.Decimal(3),
    canFreeze: true,
    shelfLifeHours: 72,
    frozenShelfLifeHours: 720,
  };
  return existing
    ? prisma.productionProfile.update({ where: { id: existing.id }, data })
    : prisma.productionProfile.create({
        data: {
          organizationId,
          siteId,
          technicalSheetId,
          outputProductId,
          ...data,
        },
      });
}

async function createEventIfMissing(input: {
  organizationId: string;
  actorId: string;
  siteId: string;
  clientId: string;
  reference: string;
  name: string;
  fulfillmentMode: CatererFulfillmentMode;
  dayOffset: number;
  address: string;
  prestations: Array<{
    name: string;
    service: MenuServiceType;
    expectedGuests: number;
    readyHour: number;
    handoffHour: number;
    serviceHour: number;
    items: Array<{
      section: MenuSectionType;
      technicalSheetId?: string;
      productId?: string;
      serving: number;
    }>;
  }>;
}) {
  const existing = await prisma.catererEvent.findUnique({
    where: {
      organizationId_reference: {
        organizationId: input.organizationId,
        reference: input.reference,
      },
    },
  });
  if (existing) return existing;
  const client = await prisma.catererClient.findUnique({ where: { id: input.clientId } });
  const startsAt = futureDate(input.dayOffset, 18);
  const endsAt = futureDate(input.dayOffset, 23, 30);
  return prisma.$transaction(async (tx) => {
    const event = await tx.catererEvent.create({
      data: {
        organizationId: input.organizationId,
        reference: input.reference,
        name: input.name,
        clientId: input.clientId,
        clientSnapshot: client
          ? {
              id: client.id,
              name: client.name,
              contactName: client.contactName,
              email: client.email,
              phone: client.phone,
              address: client.address,
            }
          : Prisma.JsonNull,
        productionSiteId: input.siteId,
        startsAt,
        endsAt,
        venueName:
          input.fulfillmentMode === CatererFulfillmentMode.PICKUP
            ? `${DEMO_PREFIX} · Cuisine centrale`
            : 'Lieu événementiel fictif',
        address: input.address,
        accessNotes: 'Accès livraison côté cour. Contact fictif : 06 00 00 00 42.',
        fulfillmentMode: input.fulfillmentMode,
        status: CatererEventStatus.CONFIRMED,
        notes: 'Dossier de démonstration pour tester Fabrication et Planning opérationnel.',
      },
    });
    for (const [position, prestation] of input.prestations.entries()) {
      const readyAt = futureDate(input.dayOffset, prestation.readyHour);
      const handoffAt = futureDate(input.dayOffset, prestation.handoffHour);
      const serviceAt = futureDate(input.dayOffset, prestation.serviceHour);
      const menu = await tx.menu.create({
        data: {
          organizationId: input.organizationId,
          name: `${input.name} · ${prestation.name}`,
          date: serviceAt,
          service: prestation.service,
          kind: MenuKind.EVENT,
          activity: MenuActivity.CATERER,
          siteId: input.siteId,
          expectedGuests: prestation.expectedGuests,
          status: MenuStatus.VALIDATED,
          createdById: input.actorId,
          updatedById: input.actorId,
          items: {
            create: prestation.items.map((item, itemPosition) => ({
              organizationId: input.organizationId,
              section: item.section,
              technicalSheetId: item.technicalSheetId,
              productId: item.productId,
              servingQuantity: new Prisma.Decimal(item.serving),
              position: itemPosition,
              availabilityEnabled: true,
            })),
          },
        },
      });
      await tx.catererPrestation.create({
        data: {
          organizationId: input.organizationId,
          eventId: event.id,
          menuId: menu.id,
          name: prestation.name,
          service: prestation.service,
          readyAt,
          handoffAt,
          serviceAt,
          expectedGuests: prestation.expectedGuests,
          position,
        },
      });
    }
    await tx.menuHistory.create({
      data: {
        organizationId: input.organizationId,
        actorUserId: input.actorId,
        action: 'CREATED',
        summary: `Création du dossier de démonstration ${input.reference}`,
        details: { catererEventId: event.id, demo: true },
      },
    });
    return event;
  });
}

async function seedProductionAndOperationalPlanning(input: {
  organizationId: string;
  actorId: string;
  siteId: string;
  kitchenDepartmentId: string;
  logisticsDepartmentId: string;
  chef: { id: string; positionId: string | null };
  cook: { id: string; positionId: string | null };
  logisticsLead: { id: string; positionId: string | null };
  driver: { id: string; positionId: string | null };
  events: Array<{ id: string; reference: string }>;
}) {
  const lifecycle = new CatererEventLifecycleService(prisma as any);
  const productionPlanning = new ProductionPlanningService(prisma as any);
  const productionExecution = new ProductionExecutionService(
    prisma as any,
    productionPlanning,
    lifecycle,
  );
  const menus = new MenusService(
    prisma as any,
    productionPlanning,
    productionExecution,
    undefined,
  );
  const caterer = new CatererMenusService(
    prisma as any,
    menus,
    productionExecution,
    lifecycle,
  );
  const production = new ProductionService(prisma as any, productionPlanning);
  const actor = {
    id: input.actorId,
    role: 'Manager',
    permissions: ['production.write', 'production.campaign.validate', 'production.override'],
  };

  // Une première version du seed utilisait par erreur le service Logistique
  // comme responsable de campagnes cuisine déjà validées. On répare uniquement
  // ces campagnes DEMO afin que les affectations et le planning restent cohérents.
  await prisma.productionOrder.updateMany({
    where: {
      organizationId: input.organizationId,
      serviceId: input.logisticsDepartmentId,
      status: ProductionOrderStatus.VALIDATED,
      technicalSheet: { name: { startsWith: DEMO_PREFIX } },
      menuProductionLinks: {
        some: {
          menu: {
            catererPrestation: { isNot: null },
          },
        },
      },
    },
    data: { serviceId: input.kitchenDepartmentId, updatedById: input.actorId },
  });
  await prisma.operationalTask.updateMany({
    where: {
      organizationId: input.organizationId,
      source: OperationalTaskSource.PRODUCTION,
      departmentId: input.logisticsDepartmentId,
      productionBatch: {
        order: {
          technicalSheet: { name: { startsWith: DEMO_PREFIX } },
          menuProductionLinks: {
            some: {
              menu: {
                catererPrestation: { isNot: null },
              },
            },
          },
        },
      },
    },
    data: { departmentId: input.kitchenDepartmentId },
  });

  // Les anciennes données de démonstration pouvaient contenir une campagne
  // groupée. Tant qu'elle n'a pas démarré, on la remplace par le mode détaillé
  // désormais utilisé par le parcours Traiteur.
  for (const event of input.events) {
    const initialPlan = await caterer.productionPlan(input.organizationId, event.id);
    const linesByOrder = new Map<string, typeof initialPlan.lines>();
    for (const line of initialPlan.lines) {
      if (!line.productionOrderId || !line.editable) continue;
      const current = linesByOrder.get(line.productionOrderId) ?? [];
      current.push(line);
      linesByOrder.set(line.productionOrderId, current);
    }
    for (const [orderId, lines] of linesByOrder) {
      if (lines.length < 2) continue;
      await productionExecution.cancelCampaign(
        input.organizationId,
        actor,
        orderId,
        `Normalisation du jeu de démonstration ${event.reference} en campagnes détaillées`,
      );
    }
  }

  for (const [eventIndex, event] of input.events.entries()) {
    let plan = await caterer.productionPlan(input.organizationId, event.id);
    const desiredLines = plan.lines.map((line: any, lineIndex: number) => {
      if (line.productionOrderId && !line.editable) {
        return {
          menuItemId: line.menuItemId,
          portions: line.portions,
          productionDate: String(line.productionDate).slice(0, 10),
          plannedTime: line.plannedTime,
        };
      }
      const readyAt = new Date(line.readyAt);
      const productionDate = new Date(readyAt);
      const daysBefore = eventIndex === 0 ? lineIndex % 2 : 1 + ((lineIndex + eventIndex) % 2);
      productionDate.setDate(productionDate.getDate() - daysBefore);
      const plannedTimes = ['06:30', '08:15', '10:00', '13:30'];
      return {
        menuItemId: line.menuItemId,
        portions: line.portions,
        productionDate: productionDate.toISOString().slice(0, 10),
        plannedTime: plannedTimes[lineIndex % plannedTimes.length],
      };
    });
    const desiredByItem = new Map(
      desiredLines.map((line: any) => [line.menuItemId, line] as const),
    );

    // Le moteur de disponibilité peut considérer qu'une production future du
    // même produit couvre déjà un besoin Traiteur plus tardif. Pour le jeu de
    // démonstration, chaque recette d'événement doit cependant disposer de sa
    // propre campagne manipulable. On crée donc les seules campagnes manquantes
    // avec le moteur commun, puis on les relie au Menu avec le contrat standard.
    for (const line of plan.lines as any[]) {
      if (line.productionOrderId) continue;
      const desired = desiredByItem.get(line.menuItemId);
      const profile = await prisma.productionProfile.findFirst({
        where: {
          organizationId: input.organizationId,
          siteId: input.siteId,
          technicalSheetId: line.technicalSheetId,
        },
      });
      if (!profile || !desired) {
        throw new Error(`Profil Production introuvable pour ${line.technicalSheetName}.`);
      }
      const campaign = await productionExecution.createCampaign(
        input.organizationId,
        actor,
        {
          profileId: profile.id,
          grossRequirement: new Prisma.Decimal(desired.portions).toFixed(3),
          neededAt: new Date(line.readyAt).toISOString(),
          productionDate: `${desired.productionDate}T${desired.plannedTime}:00`,
          plannedTime: desired.plannedTime,
          serviceId: input.kitchenDepartmentId,
          name: line.technicalSheetName,
          priority: ProductionPriority.NORMAL,
          needIds: [],
          createSubRecipeNeeds: true,
          comments: `Jeu de démonstration Traiteur · ${event.reference}`,
        },
      );
      await prisma.menuProductionLink.create({
        data: {
          organizationId: input.organizationId,
          menuId: line.menuId,
          productionOrderId: campaign.id,
          generationMode: MenuProductionGenerationMode.DETAILED,
          snapshot: {
            menuId: line.menuId,
            profileId: profile.id,
            recipeVersionId: campaign.recipeVersionId,
            catererEventId: event.id,
            catererReference: event.reference,
            catererPrestationId: line.prestationId,
            lines: [
              {
                menuItemId: line.menuItemId,
                technicalSheetId: line.technicalSheetId,
                section: line.section,
                portions: desired.portions,
                targetPortions: desired.portions,
                openingCarryOverPortions: 0,
                plannedTime: desired.plannedTime,
                productionDate: `${desired.productionDate}T${desired.plannedTime}:00`,
              },
            ],
          },
        },
      });
      await prisma.menu.update({
        where: { id: line.menuId },
        data: { productionGeneratedAt: new Date(), productionDirtySince: null },
      });
    }
    plan = await caterer.productionPlan(input.organizationId, event.id);
    const lines = plan.lines.map((line: any) => desiredByItem.get(line.menuItemId)!);
    await caterer.saveProductionPlan(input.organizationId, actor, event.id, {
      serviceId: input.kitchenDepartmentId,
      logisticsDepartmentId: input.logisticsDepartmentId,
      lines,
      logistics: plan.logistics.map((task: any) => ({
        key: task.key,
        enabled: true,
        startsAt: new Date(task.startsAt).toISOString(),
        endsAt: new Date(task.endsAt).toISOString(),
      })),
    });
  }

  const orders = await prisma.productionOrder.findMany({
    where: {
      organizationId: input.organizationId,
      status: { not: ProductionOrderStatus.CANCELLED },
      menuProductionLinks: {
        some: {
          menu: {
            catererPrestation: {
              eventId: { in: input.events.map((event) => event.id) },
            },
          },
        },
      },
    },
    include: {
      menuProductionLinks: {
        include: {
          menu: { include: { catererPrestation: true } },
        },
      },
    },
    orderBy: [{ productionDate: 'asc' }, { plannedTime: 'asc' }],
  });
  const allEventLogistics = await prisma.operationalTask.findMany({
    where: {
      organizationId: input.organizationId,
      OR: input.events.map((event) => ({ sourceKey: { startsWith: `CATERER:${event.id}:` } })),
      status: { not: OperationalTaskStatus.CANCELLED },
    },
  });

  const planningDays = new Map<string, Date>();
  for (const order of orders) {
    planningDays.set(dayKey(order.productionDate), order.productionDate);
  }
  for (const task of allEventLogistics) {
    planningDays.set(dayKey(task.startsAt), task.startsAt);
  }
  planningDays.set(dayKey(new Date()), new Date());

  const employees = [
    {
      ...input.chef,
      departmentId: input.kitchenDepartmentId,
      label: 'Chef cuisine',
    },
    {
      ...input.cook,
      departmentId: input.kitchenDepartmentId,
      label: 'Cuisine',
    },
    {
      ...input.logisticsLead,
      departmentId: input.logisticsDepartmentId,
      label: 'Logistique',
    },
    {
      ...input.driver,
      departmentId: input.logisticsDepartmentId,
      label: 'Livraison',
    },
  ];
  const shiftByEmployeeAndDay = new Map<string, string>();
  for (const day of planningDays.values()) {
    for (const employee of employees) {
      if (!employee.positionId) continue;
      const shift = await ensureDemoShift({
        organizationId: input.organizationId,
        actorId: input.actorId,
        siteId: input.siteId,
        day,
        employeeId: employee.id,
        departmentId: employee.departmentId,
        positionId: employee.positionId,
        label: employee.label,
      });
      shiftByEmployeeAndDay.set(`${employee.id}:${dayKey(day)}`, shift.id);
    }
  }

  for (const [index, order] of orders.entries()) {
    if (
      ![
        ProductionOrderStatus.DRAFT,
        ProductionOrderStatus.PROPOSED,
        ProductionOrderStatus.PLANNED,
        ProductionOrderStatus.BLOCKED,
        ProductionOrderStatus.VALIDATED,
      ].includes(order.status)
    ) {
      continue;
    }
    await production.assignEmployee(input.organizationId, actor, order.id, {
      employeeId: input.chef.id,
      isLead: true,
      mission: 'Piloter la recette et contrôler les points critiques',
      plannedMinutes: 120,
    });
    await production.assignEmployee(input.organizationId, actor, order.id, {
      employeeId: input.cook.id,
      isLead: false,
      mission: 'Mise en place, cuisson et conditionnement',
      plannedMinutes: 120,
    });

    const eventId = order.menuProductionLinks.find(
      (link) => link.menu.catererPrestation,
    )?.menu.catererPrestation?.eventId;
    const eventPosition = input.events.findIndex((event) => event.id === eventId);
    const shouldValidate =
      eventPosition === 0 ||
      eventPosition === 2 ||
      (eventPosition === 1 && index % 2 === 0);
    if (
      shouldValidate &&
      [
        ProductionOrderStatus.DRAFT,
        ProductionOrderStatus.PROPOSED,
        ProductionOrderStatus.PLANNED,
        ProductionOrderStatus.BLOCKED,
      ].includes(order.status)
    ) {
      await productionExecution.validateCampaign(input.organizationId, actor, order.id, {
        idempotencyKey: `demo-traiteur-${order.id}`,
      });
    }
  }

  const productionTasks = await prisma.operationalTask.findMany({
    where: {
      organizationId: input.organizationId,
      source: OperationalTaskSource.PRODUCTION,
      status: { not: OperationalTaskStatus.CANCELLED },
      productionBatch: {
        order: {
          menuProductionLinks: {
            some: {
              menu: {
                catererPrestation: {
                  eventId: { in: input.events.map((event) => event.id) },
                },
              },
            },
          },
        },
      },
    },
    include: {
      productionBatch: {
        include: {
          order: {
            include: {
              menuProductionLinks: {
                include: { menu: { include: { catererPrestation: true } } },
              },
            },
          },
        },
      },
    },
    orderBy: [{ startsAt: 'asc' }, { title: 'asc' }],
  });

  for (const [index, task] of productionTasks.entries()) {
    const employee = index % 2 === 0 ? input.chef : input.cook;
    const scheduled = index % 3 !== 2;
    const productionDate = task.productionBatch?.order.productionDate ?? task.startsAt;
    const startsAt = atTime(productionDate, 6 + (index % 4) * 2, index % 2 ? 15 : 0);
    const originalDuration = Math.max(
      30,
      Math.round((task.endsAt.getTime() - task.startsAt.getTime()) / 60_000),
    );
    const endsAt = new Date(startsAt.getTime() + originalDuration * 60_000);
    const planningAssignmentId = scheduled
      ? shiftByEmployeeAndDay.get(`${employee.id}:${dayKey(startsAt)}`) ?? null
      : null;
    await prisma.operationalTask.update({
      where: { id: task.id },
      data: {
        assignedEmployeeId: employee.id,
        planningAssignmentId,
        startsAt,
        endsAt,
        isTimeScheduled: scheduled,
      },
    });
    await prisma.operationalTaskAssignment.upsert({
      where: {
        taskId_employeeId: { taskId: task.id, employeeId: employee.id },
      },
      create: {
        organizationId: input.organizationId,
        taskId: task.id,
        employeeId: employee.id,
        planningAssignmentId,
        isLead: true,
        mission: 'Réaliser et contrôler la recette',
        plannedMinutes: originalDuration,
      },
      update: {
        planningAssignmentId,
        isLead: true,
        mission: 'Réaliser et contrôler la recette',
        plannedMinutes: originalDuration,
      },
    });
  }

  for (const [index, task] of allEventLogistics.entries()) {
    const scheduled = index % 2 === 0;
    const employee = index % 4 < 2 ? input.logisticsLead : input.driver;
    const planningAssignmentId = scheduled
      ? shiftByEmployeeAndDay.get(`${employee.id}:${dayKey(task.startsAt)}`) ?? null
      : null;
    await prisma.operationalTask.update({
      where: { id: task.id },
      data: {
        assignedEmployeeId: scheduled ? employee.id : null,
        planningAssignmentId,
        isTimeScheduled: scheduled,
      },
    });
    if (scheduled) {
      await prisma.operationalTaskAssignment.upsert({
        where: {
          taskId_employeeId: { taskId: task.id, employeeId: employee.id },
        },
        create: {
          organizationId: input.organizationId,
          taskId: task.id,
          employeeId: employee.id,
          planningAssignmentId,
          isLead: true,
          mission: task.title,
          plannedMinutes: Math.max(
            15,
            Math.round((task.endsAt.getTime() - task.startsAt.getTime()) / 60_000),
          ),
        },
        update: { planningAssignmentId, isLead: true, mission: task.title },
      });
    } else {
      await prisma.operationalTaskAssignment.deleteMany({ where: { taskId: task.id } });
    }
  }

  const manualTasks = await seedDenseOperationalDays({
    organizationId: input.organizationId,
    actorId: input.actorId,
    siteId: input.siteId,
    planningDays: [...planningDays.values()],
    kitchenDepartmentId: input.kitchenDepartmentId,
    logisticsDepartmentId: input.logisticsDepartmentId,
    chef: input.chef,
    cook: input.cook,
    logisticsLead: input.logisticsLead,
    driver: input.driver,
    shiftByEmployeeAndDay,
  });

  const finalOrders = await prisma.productionOrder.findMany({
    where: {
      id: { in: orders.map((order) => order.id) },
      status: { not: ProductionOrderStatus.CANCELLED },
    },
    select: { status: true },
  });
  const finalTasks = await prisma.operationalTask.findMany({
    where: {
      organizationId: input.organizationId,
      status: { not: OperationalTaskStatus.CANCELLED },
      OR: [
        { sourceKey: { startsWith: 'DEMO:OPERATIONAL:' } },
        ...input.events.map((event) => ({ sourceKey: { startsWith: `CATERER:${event.id}:` } })),
        {
          productionBatch: {
            order: {
              id: { in: orders.map((order) => order.id) },
            },
          },
        },
      ],
    },
    select: { category: true, isTimeScheduled: true },
  });
  return {
    campaigns: finalOrders.length,
    campaignsValidated: finalOrders.filter(
      (order) => order.status === ProductionOrderStatus.VALIDATED,
    ).length,
    operationalTasks: finalTasks.length,
    tasksToPlace: finalTasks.filter((task) => !task.isTimeScheduled).length,
    scheduledTasks: finalTasks.filter((task) => task.isTimeScheduled).length,
    kitchenTasks: finalTasks.filter(
      (task) => task.category === OperationalTaskCategory.KITCHEN,
    ).length,
    logisticsTasks: finalTasks.filter(
      (task) => task.category === OperationalTaskCategory.LOGISTICS,
    ).length,
    manualTasks,
    planningDays: [...planningDays.keys()].sort(),
  };
}

async function ensureDemoShift(input: {
  organizationId: string;
  actorId: string;
  siteId: string;
  day: Date;
  employeeId: string;
  departmentId: string;
  positionId: string;
  label: string;
}) {
  const date = atTime(input.day, 0, 0);
  const startTime = atTime(input.day, 5, 0);
  const endTime = atTime(input.day, 23, 30);
  const comment = `DEMO TRAITEUR · Journée ${input.label} · ${dayKey(input.day)}`;
  const existing = await prisma.planningAssignment.findFirst({
    where: {
      organizationId: input.organizationId,
      employeeId: input.employeeId,
      comment,
    },
  });
  const data = {
    departmentId: input.departmentId,
    positionId: input.positionId,
    siteId: input.siteId,
    date,
    startTime,
    endTime,
    breakMinutes: 45,
    status: PlanningAssignmentStatus.CONFIRMED,
    origin: PlanningAssignmentOrigin.MANUAL,
    comment,
    updatedById: input.actorId,
  };
  return existing
    ? prisma.planningAssignment.update({ where: { id: existing.id }, data })
    : prisma.planningAssignment.create({
        data: {
          organizationId: input.organizationId,
          employeeId: input.employeeId,
          createdById: input.actorId,
          ...data,
        },
      });
}

async function seedDenseOperationalDays(input: {
  organizationId: string;
  actorId: string;
  siteId: string;
  planningDays: Date[];
  kitchenDepartmentId: string;
  logisticsDepartmentId: string;
  chef: { id: string };
  cook: { id: string };
  logisticsLead: { id: string };
  driver: { id: string };
  shiftByEmployeeAndDay: Map<string, string>;
}) {
  const uniqueDays = [
    ...new Map(input.planningDays.map((day) => [dayKey(day), day] as const)).values(),
  ];
  const templates = [
    {
      slug: 'brief',
      title: 'Brief d’équipe et répartition des postes',
      description: 'Point météo de production, priorités Traiteur et répartition des postes.',
      category: OperationalTaskCategory.MANAGEMENT,
      departmentId: input.kitchenDepartmentId,
      employeeId: input.chef.id,
      hour: 5,
      minute: 30,
      duration: 30,
      scheduled: true,
    },
    {
      slug: 'mise-en-place',
      title: 'Mise en place froide et contrôle du matériel',
      description: 'Préparer les plans de travail, bacs GN, étiquettes et sondes.',
      category: OperationalTaskCategory.KITCHEN,
      departmentId: input.kitchenDepartmentId,
      employeeId: input.cook.id,
      hour: 6,
      minute: 0,
      duration: 75,
      scheduled: true,
    },
    {
      slug: 'controle-stock',
      title: 'Contrôle des sorties et DLC',
      description: 'Vérifier les lots FEFO réservés et les quantités sorties pour la journée.',
      category: OperationalTaskCategory.KITCHEN,
      departmentId: input.kitchenDepartmentId,
      employeeId: null,
      hour: 8,
      minute: 30,
      duration: 45,
      scheduled: false,
    },
    {
      slug: 'reception-emballages',
      title: 'Réception et préparation des emballages',
      description: 'Contrôler les contenants, consommables et étiquettes de transport.',
      category: OperationalTaskCategory.LOGISTICS,
      departmentId: input.logisticsDepartmentId,
      employeeId: input.logisticsLead.id,
      hour: 9,
      minute: 0,
      duration: 60,
      scheduled: true,
    },
    {
      slug: 'vehicule',
      title: 'Préparation du véhicule et du matériel isotherme',
      description: 'Nettoyage, contrôle carburant, sangles et enceintes isothermes.',
      category: OperationalTaskCategory.LOGISTICS,
      departmentId: input.logisticsDepartmentId,
      employeeId: null,
      hour: 11,
      minute: 0,
      duration: 60,
      scheduled: false,
    },
    {
      slug: 'nettoyage',
      title: 'Nettoyage, plonge et clôture du laboratoire',
      description: 'Nettoyer les postes, relever les températures et clôturer la zone.',
      category: OperationalTaskCategory.HOUSEKEEPING,
      departmentId: input.kitchenDepartmentId,
      employeeId: input.cook.id,
      hour: 18,
      minute: 0,
      duration: 75,
      scheduled: true,
    },
  ];
  let count = 0;
  for (const day of uniqueDays) {
    for (const template of templates) {
      const startsAt = atTime(day, template.hour, template.minute);
      const endsAt = new Date(startsAt.getTime() + template.duration * 60_000);
      const sourceKey = `DEMO:OPERATIONAL:${dayKey(day)}:${template.slug}`;
      const planningAssignmentId =
        template.scheduled && template.employeeId
          ? input.shiftByEmployeeAndDay.get(
              `${template.employeeId}:${dayKey(startsAt)}`,
            ) ?? null
          : null;
      const task = await prisma.operationalTask.upsert({
        where: {
          organizationId_sourceKey: {
            organizationId: input.organizationId,
            sourceKey,
          },
        },
        create: {
          organizationId: input.organizationId,
          sourceKey,
          title: template.title,
          description: template.description,
          category: template.category,
          status: OperationalTaskStatus.TODO,
          source: OperationalTaskSource.MANUAL,
          departmentId: template.departmentId,
          siteId: input.siteId,
          assignedEmployeeId: template.scheduled ? template.employeeId : null,
          planningAssignmentId,
          startsAt,
          endsAt,
          isTimeScheduled: template.scheduled,
          createdById: input.actorId,
        },
        update: {
          title: template.title,
          description: template.description,
          category: template.category,
          status: OperationalTaskStatus.TODO,
          departmentId: template.departmentId,
          siteId: input.siteId,
          assignedEmployeeId: template.scheduled ? template.employeeId : null,
          planningAssignmentId,
          startsAt,
          endsAt,
          isTimeScheduled: template.scheduled,
          completedAt: null,
        },
      });
      await prisma.operationalTaskAssignment.deleteMany({ where: { taskId: task.id } });
      if (template.scheduled && template.employeeId) {
        await prisma.operationalTaskAssignment.create({
          data: {
            organizationId: input.organizationId,
            taskId: task.id,
            employeeId: template.employeeId,
            planningAssignmentId,
            isLead: true,
            mission: template.title,
            plannedMinutes: template.duration,
          },
        });
      }
      count += 1;
    }
  }
  return count;
}

function dayKey(value: Date) {
  const date = new Date(value);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function atTime(value: Date, hours: number, minutes: number) {
  const date = new Date(value);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
