import {
  CatererEventStatus,
  CatererFulfillmentMode,
  MenuSectionType,
  MenuServiceType,
  MenuStatus,
  PrismaClient,
  ProductKind,
  TechnicalSheetMode,
  TechnicalSheetStatus,
  TechnicalSheetStockPolicy,
  UnitType,
} from '@prisma/client';

const prisma = new PrismaClient();
const DEMO_PREFIX = '[Démo Traiteur]';

const at = (days: number, hour: number, minute = 0) => {
  const value = new Date();
  value.setDate(value.getDate() + days);
  value.setHours(hour, minute, 0, 0);
  return value;
};

async function main() {
  const organization =
    (await prisma.organization.findFirst({
      where: { menuSettings: { usageProfile: 'CATERER' } },
      orderBy: { createdAt: 'asc' },
    })) ??
    (await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } }));

  if (!organization) throw new Error('Aucune organisation disponible.');

  const site = await prisma.site.findFirst({
    where: { organizationId: organization.id, isArchived: false },
    orderBy: { createdAt: 'asc' },
  });
  if (!site) throw new Error('Aucun site de production disponible.');

  await prisma.menuSettings.upsert({
    where: { organizationId: organization.id },
    update: {
      usageProfile: 'CATERER',
      eventsEnabled: true,
      onboardingCompletedAt: new Date(),
    },
    create: {
      organizationId: organization.id,
      usageProfile: 'CATERER',
      catalogEnabled: false,
      scheduledMenusEnabled: false,
      eventsEnabled: true,
      cyclesEnabled: false,
      dietsEnabled: false,
      guestForecastsEnabled: false,
      targetStockEnabled: true,
      onboardingCompletedAt: new Date(),
    },
  });

  const unitDefs = [
    { symbol: 'kg', name: 'Kilogramme', type: UnitType.MASS },
    { symbol: 'L', name: 'Litre', type: UnitType.VOLUME },
    { symbol: 'pc', name: 'Pièce', type: UnitType.COUNT },
  ];
  const units = new Map<string, { id: string; symbol: string }>();
  for (const definition of unitDefs) {
    const unit = await prisma.unit.upsert({
      where: {
        organizationId_symbol: {
          organizationId: organization.id,
          symbol: definition.symbol,
        },
      },
      update: { name: definition.name, type: definition.type, isArchived: false },
      create: { ...definition, organizationId: organization.id },
    });
    units.set(unit.symbol, unit);
  }

  const rawCategory = await prisma.category.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: `${DEMO_PREFIX} Matières premières`,
      },
    },
    update: { isArchived: false },
    create: {
      organizationId: organization.id,
      name: `${DEMO_PREFIX} Matières premières`,
      description: 'Produits créés pour la démonstration du parcours Traiteur.',
    },
  });
  const recipeCategory = await prisma.technicalSheetCategory.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: `${DEMO_PREFIX} Recettes`,
      },
    },
    update: { isArchived: false, color: '#D97706' },
    create: {
      organizationId: organization.id,
      name: `${DEMO_PREFIX} Recettes`,
      description: 'Fiches techniques de démonstration Traiteur.',
      color: '#D97706',
    },
  });

  const rawDefs = [
    ['Farine', 'kg', 1.35],
    ['Beurre', 'kg', 9.8],
    ['Œufs', 'pc', 0.32],
    ['Comté', 'kg', 18.5],
    ['Saumon fumé', 'kg', 31],
    ['Concombre', 'kg', 2.4],
    ['Crème fraîche', 'kg', 5.6],
    ['Bœuf haché', 'kg', 14.5],
    ['Pain mini burger', 'pc', 0.42],
    ['Quinoa', 'kg', 6.2],
    ['Légumes de saison', 'kg', 4.8],
    ['Suprême de volaille', 'kg', 13.9],
    ['Champignons', 'kg', 7.4],
    ['Pommes de terre', 'kg', 1.9],
    ['Fruits rouges', 'kg', 12.5],
    ['Sucre', 'kg', 1.7],
    ['Mini viennoiserie', 'pc', 0.65],
    ['Pain de mie', 'pc', 0.18],
    ['Agrumes', 'kg', 3.8],
  ] as const;

  const rawProducts = new Map<string, { id: string; unitId: string; name: string }>();
  for (const [name, symbol, price] of rawDefs) {
    const unit = units.get(symbol)!;
    const product = await prisma.product.upsert({
      where: {
        organizationId_name: {
          organizationId: organization.id,
          name: `${DEMO_PREFIX} ${name}`,
        },
      },
      update: {
        unitId: unit.id,
        categoryId: rawCategory.id,
        averagePrice: price,
        kind: ProductKind.RAW_MATERIAL,
        isArchived: false,
      },
      create: {
        organizationId: organization.id,
        name: `${DEMO_PREFIX} ${name}`,
        sku: `DEMO-RAW-${rawProducts.size + 1}`,
        unitId: unit.id,
        categoryId: rawCategory.id,
        averagePrice: price,
        kind: ProductKind.RAW_MATERIAL,
      },
    });
    rawProducts.set(name, product);

    const stock = await prisma.stock.findFirst({
      where: {
        organizationId: organization.id,
        productId: product.id,
        siteId: site.id,
        variantId: null,
        lotId: null,
        locationId: null,
      },
    });
    if (stock) {
      await prisma.stock.update({ where: { id: stock.id }, data: { quantity: symbol === 'pc' ? 500 : 45 } });
    } else {
      await prisma.stock.create({
        data: {
          organizationId: organization.id,
          productId: product.id,
          siteId: site.id,
          quantity: symbol === 'pc' ? 500 : 45,
        },
      });
    }
  }

  const recipeDefs = [
    { name: 'Gougères au comté', section: MenuSectionType.STARTER, ingredients: [['Farine', 0.018], ['Beurre', 0.01], ['Œufs', 0.25], ['Comté', 0.012]] },
    { name: 'Verrine saumon et concombre', section: MenuSectionType.STARTER, ingredients: [['Saumon fumé', 0.035], ['Concombre', 0.04], ['Crème fraîche', 0.02]] },
    { name: 'Mini burger de bœuf', section: MenuSectionType.MAIN, ingredients: [['Bœuf haché', 0.065], ['Pain mini burger', 1], ['Comté', 0.012]] },
    { name: 'Salade de quinoa aux légumes', section: MenuSectionType.STARTER, ingredients: [['Quinoa', 0.07], ['Légumes de saison', 0.09]] },
    { name: 'Suprême de volaille forestier', section: MenuSectionType.MAIN, ingredients: [['Suprême de volaille', 0.18], ['Champignons', 0.06], ['Crème fraîche', 0.03]] },
    { name: 'Gratin dauphinois', section: MenuSectionType.SIDE, ingredients: [['Pommes de terre', 0.22], ['Crème fraîche', 0.06], ['Comté', 0.018]] },
    { name: 'Pavlova aux fruits rouges', section: MenuSectionType.DESSERT, ingredients: [['Œufs', 0.4], ['Sucre', 0.045], ['Fruits rouges', 0.08], ['Crème fraîche', 0.04]] },
    { name: 'Assortiment de mini viennoiseries', section: MenuSectionType.DESSERT, ingredients: [['Mini viennoiserie', 3]] },
    { name: 'Club sandwich volaille', section: MenuSectionType.MAIN, ingredients: [['Pain de mie', 3], ['Suprême de volaille', 0.09], ['Concombre', 0.025]] },
    { name: 'Mocktail aux agrumes', section: MenuSectionType.DRINK, ingredients: [['Agrumes', 0.18], ['Sucre', 0.018]] },
  ] as const;

  const recipes = new Map<string, { id: string; outputProductId: string; section: MenuSectionType }>();
  for (const [index, definition] of recipeDefs.entries()) {
    const output = await prisma.product.upsert({
      where: {
        organizationId_name: {
          organizationId: organization.id,
          name: `${DEMO_PREFIX} ${definition.name}`,
        },
      },
      update: { kind: ProductKind.FINISHED, unitId: units.get('pc')!.id, isArchived: false },
      create: {
        organizationId: organization.id,
        name: `${DEMO_PREFIX} ${definition.name}`,
        sku: `DEMO-FIN-${index + 1}`,
        unitId: units.get('pc')!.id,
        kind: ProductKind.FINISHED,
      },
    });
    const sheet = await prisma.technicalSheet.upsert({
      where: {
        organizationId_name: {
          organizationId: organization.id,
          name: `${DEMO_PREFIX} ${definition.name}`,
        },
      },
      update: {
        categoryId: recipeCategory.id,
        outputProductId: output.id,
        yieldUnitId: units.get('pc')!.id,
        status: TechnicalSheetStatus.ACTIVE,
        isArchived: false,
      },
      create: {
        organizationId: organization.id,
        categoryId: recipeCategory.id,
        outputProductId: output.id,
        yieldUnitId: units.get('pc')!.id,
        name: `${DEMO_PREFIX} ${definition.name}`,
        description: `Recette de démonstration pour ${definition.name.toLowerCase()}.`,
        referencePortions: 10,
        preparationTimeMinutes: 25,
        cookingTimeMinutes: 20,
        totalTimeMinutes: 45,
        status: TechnicalSheetStatus.ACTIVE,
        mode: TechnicalSheetMode.PRODUCTION,
        stockPolicy: TechnicalSheetStockPolicy.MAKE_TO_ORDER,
      },
    });
    await prisma.technicalSheetIngredient.deleteMany({ where: { technicalSheetId: sheet.id } });
    for (const [position, [rawName, quantity]] of definition.ingredients.entries()) {
      const raw = rawProducts.get(rawName)!;
      await prisma.technicalSheetIngredient.create({
        data: {
          organizationId: organization.id,
          technicalSheetId: sheet.id,
          productId: raw.id,
          unitId: raw.unitId,
          quantity: quantity * 10,
          order: position,
          productNameSnapshot: raw.name,
          unitSymbolSnapshot: unitDefs.find((unit) => units.get(unit.symbol)?.id === raw.unitId)!.symbol,
          productUnitIdSnapshot: raw.unitId,
        },
      });
    }
    await prisma.technicalSheetStep.deleteMany({ where: { technicalSheetId: sheet.id } });
    await prisma.technicalSheetStep.createMany({
      data: [
        { organizationId: organization.id, technicalSheetId: sheet.id, order: 1, title: 'Mise en place', description: 'Peser les ingrédients et préparer le poste.', estimatedMinutes: 15 },
        { organizationId: organization.id, technicalSheetId: sheet.id, order: 2, title: 'Production', description: 'Réaliser la recette selon les standards de la maison.', estimatedMinutes: 30 },
      ],
    });
    const profile = await prisma.productionProfile.findFirst({
      where: {
        organizationId: organization.id,
        siteId: site.id,
        technicalSheetId: sheet.id,
        outputProductId: output.id,
        outputVariantId: null,
      },
    });
    const profileData = {
      yieldUnitId: units.get('pc')!.id,
      referenceYield: 10,
      minimumQuantity: 10,
      optimalQuantity: 50,
      stepQuantity: 10,
      allowDoubleBatch: true,
      safetyMarginPercent: 3,
    };
    if (profile) await prisma.productionProfile.update({ where: { id: profile.id }, data: profileData });
    else {
      await prisma.productionProfile.create({
        data: {
          organizationId: organization.id,
          siteId: site.id,
          technicalSheetId: sheet.id,
          outputProductId: output.id,
          ...profileData,
        },
      });
    }
    recipes.set(definition.name, { id: sheet.id, outputProductId: output.id, section: definition.section });
  }

  const clientDefs = [
    ['Camille & Julien Martin', 'Camille Martin', 'camille.martin@example.test', '06 11 22 33 44', '12 rue des Lilas, 75019 Paris'],
    ['Atelier Horizon', 'Nora Benali', 'nora.benali@example.test', '01 44 20 18 90', '24 avenue Parmentier, 75011 Paris'],
    ['Mairie du 3e', 'Baptiste Leroy', 'evenements.mairie@example.test', '01 53 01 75 03', '2 rue Eugène-Spuller, 75003 Paris'],
    ['Fondation Belle Rive', 'Sophie Garnier', 's.garnier@example.test', '01 42 88 12 70', '8 quai de la Loire, 75019 Paris'],
    ['Maison Delacroix', 'Élodie Petit', 'elodie.petit@example.test', '06 78 32 10 05', '17 rue du Bac, 75007 Paris'],
  ] as const;
  const clients = new Map<string, Awaited<ReturnType<typeof prisma.catererClient.create>>>();
  for (const [name, contactName, email, phone, address] of clientDefs) {
    const client = await prisma.catererClient.upsert({
      where: { organizationId_name: { organizationId: organization.id, name: `${DEMO_PREFIX} ${name}` } },
      update: { contactName, email, phone, address, isArchived: false, notes: 'Contact de démonstration.' },
      create: { organizationId: organization.id, name: `${DEMO_PREFIX} ${name}`, contactName, email, phone, address, notes: 'Contact de démonstration.' },
    });
    clients.set(name, client);
  }

  type PrestationDef = {
    name: string;
    service: MenuServiceType;
    guests: number;
    readyHour: number;
    handoffHour: number;
    serviceHour: number;
    recipes: Array<[string, number, number?]>;
  };
  const eventDefs: Array<{
    reference: string; name: string; client: string; days: number; status: CatererEventStatus;
    mode: CatererFulfillmentMode; venue: string; address: string; prestations: PrestationDef[];
    generated?: boolean; dirty?: boolean; needsReview?: boolean;
  }> = [
    {
      reference: 'EVT-2026-9001', name: 'Mariage Camille & Julien', client: 'Camille & Julien Martin', days: 14,
      status: CatererEventStatus.CONFIRMED, mode: CatererFulfillmentMode.ON_SITE, venue: 'Domaine de la Roseraie',
      address: '5 chemin des Vignes, 77600 Bussy-Saint-Georges', generated: true,
      prestations: [
        { name: 'Cocktail de bienvenue', service: MenuServiceType.EVENT, guests: 120, readyHour: 14, handoffHour: 16, serviceHour: 18, recipes: [['Gougères au comté', 3], ['Verrine saumon et concombre', 1], ['Mocktail aux agrumes', 1]] },
        { name: 'Dîner de mariage', service: MenuServiceType.DINNER, guests: 105, readyHour: 16, handoffHour: 18, serviceHour: 20, recipes: [['Suprême de volaille forestier', 1], ['Gratin dauphinois', 1], ['Pavlova aux fruits rouges', 1]] },
        { name: 'Brunch du lendemain', service: MenuServiceType.BREAKFAST, guests: 65, readyHour: 7, handoffHour: 9, serviceHour: 11, recipes: [['Assortiment de mini viennoiseries', 1], ['Club sandwich volaille', 1]] },
      ],
    },
    {
      reference: 'EVT-2026-9002', name: 'Séminaire Atelier Horizon', client: 'Atelier Horizon', days: 5,
      status: CatererEventStatus.CONFIRMED, mode: CatererFulfillmentMode.DELIVERY, venue: 'Le Loft République',
      address: '42 rue René-Boulanger, 75010 Paris', dirty: true,
      prestations: [{ name: 'Déjeuner séminaire', service: MenuServiceType.BUFFET, guests: 48, readyHour: 9, handoffHour: 11, serviceHour: 12, recipes: [['Salade de quinoa aux légumes', 1], ['Mini burger de bœuf', 2], ['Pavlova aux fruits rouges', 1]] }],
    },
    {
      reference: 'EVT-2026-9003', name: 'Buffet des associations', client: 'Mairie du 3e', days: 25,
      status: CatererEventStatus.DRAFT, mode: CatererFulfillmentMode.DELIVERY, venue: 'Salle des fêtes municipale',
      address: '2 rue Eugène-Spuller, 75003 Paris', needsReview: true,
      prestations: [{ name: 'Buffet républicain', service: MenuServiceType.BUFFET, guests: 180, readyHour: 15, handoffHour: 17, serviceHour: 19, recipes: [['Gougères au comté', 2], ['Salade de quinoa aux légumes', 1], ['Mini burger de bœuf', 1]] }],
    },
    {
      reference: 'EVT-2026-9004', name: 'Gala Fondation Belle Rive', client: 'Fondation Belle Rive', days: -10,
      status: CatererEventStatus.COMPLETED, mode: CatererFulfillmentMode.ON_SITE, venue: 'Pavillon des Canaux',
      address: '39 quai de la Loire, 75019 Paris', generated: true,
      prestations: [{ name: 'Dîner de gala', service: MenuServiceType.DINNER, guests: 85, readyHour: 15, handoffHour: 17, serviceHour: 20, recipes: [['Verrine saumon et concombre', 1], ['Suprême de volaille forestier', 1], ['Gratin dauphinois', 1], ['Pavlova aux fruits rouges', 1]] }],
    },
    {
      reference: 'EVT-2026-9005', name: 'Cocktail Maison Delacroix', client: 'Maison Delacroix', days: 9,
      status: CatererEventStatus.CANCELLED, mode: CatererFulfillmentMode.PICKUP, venue: 'Retrait au laboratoire',
      address: site.address ?? 'Site de production',
      prestations: [{ name: 'Cocktail presse', service: MenuServiceType.EVENT, guests: 35, readyHour: 14, handoffHour: 16, serviceHour: 18, recipes: [['Gougères au comté', 3], ['Verrine saumon et concombre', 1], ['Mocktail aux agrumes', 1]] }],
    },
  ];

  for (const eventDefinition of eventDefs) {
    const client = clients.get(eventDefinition.client)!;
    const startsAt = at(eventDefinition.days, 8);
    const event = await prisma.catererEvent.upsert({
      where: { organizationId_reference: { organizationId: organization.id, reference: eventDefinition.reference } },
      update: {
        name: `${DEMO_PREFIX} ${eventDefinition.name}`, clientId: client.id,
        clientSnapshot: { name: client.name, contactName: client.contactName, email: client.email, phone: client.phone, address: client.address },
        productionSiteId: site.id, startsAt, endsAt: at(eventDefinition.days + (eventDefinition.name.includes('Mariage') ? 1 : 0), 23),
        venueName: eventDefinition.venue, address: eventDefinition.address,
        accessNotes: 'Accès livraison par l’entrée de service. Appeler le contact 20 minutes avant.',
        fulfillmentMode: eventDefinition.mode, status: eventDefinition.status, needsReview: eventDefinition.needsReview ?? false,
        notes: 'Dossier de démonstration — allergies et contraintes à confirmer avec le client.',
      },
      create: {
        organizationId: organization.id, reference: eventDefinition.reference, name: `${DEMO_PREFIX} ${eventDefinition.name}`,
        clientId: client.id, clientSnapshot: { name: client.name, contactName: client.contactName, email: client.email, phone: client.phone, address: client.address },
        productionSiteId: site.id, startsAt, endsAt: at(eventDefinition.days + (eventDefinition.name.includes('Mariage') ? 1 : 0), 23),
        venueName: eventDefinition.venue, address: eventDefinition.address,
        accessNotes: 'Accès livraison par l’entrée de service. Appeler le contact 20 minutes avant.',
        fulfillmentMode: eventDefinition.mode, status: eventDefinition.status, needsReview: eventDefinition.needsReview ?? false,
        notes: 'Dossier de démonstration — allergies et contraintes à confirmer avec le client.',
      },
    });

    for (const [position, prestationDefinition] of eventDefinition.prestations.entries()) {
      const menuName = `${DEMO_PREFIX} ${eventDefinition.reference} — ${prestationDefinition.name}`;
      let menu = await prisma.menu.findFirst({ where: { organizationId: organization.id, name: menuName, activity: 'CATERER' } });
      const menuStatus =
        eventDefinition.status === CatererEventStatus.COMPLETED ? MenuStatus.PUBLISHED :
        eventDefinition.status === CatererEventStatus.CONFIRMED ? MenuStatus.VALIDATED : MenuStatus.DRAFT;
      const menuData = {
        date: at(eventDefinition.days, prestationDefinition.serviceHour),
        service: prestationDefinition.service, kind: 'EVENT' as const, activity: 'CATERER' as const,
        siteId: site.id, expectedGuests: prestationDefinition.guests, status: menuStatus,
        productionGeneratedAt: eventDefinition.generated ? at(eventDefinition.days - 4, 10) : null,
        productionDirtySince: eventDefinition.dirty ? at(-1, 11) : null,
        description: `Composition de démonstration pour ${prestationDefinition.name}.`,
      };
      if (menu) menu = await prisma.menu.update({ where: { id: menu.id }, data: menuData });
      else menu = await prisma.menu.create({ data: { organizationId: organization.id, name: menuName, ...menuData } });

      const existingPrestation = await prisma.catererPrestation.findUnique({ where: { menuId: menu.id } });
      const prestationData = {
        eventId: event.id, name: prestationDefinition.name, service: prestationDefinition.service,
        readyAt: at(eventDefinition.days, prestationDefinition.readyHour),
        handoffAt: at(eventDefinition.days, prestationDefinition.handoffHour),
        serviceAt: at(eventDefinition.days, prestationDefinition.serviceHour),
        expectedGuests: prestationDefinition.guests, position,
        notes: position === 0 ? 'Prévoir étiquetage, matériel de remise et fiche allergènes.' : null,
      };
      if (existingPrestation) await prisma.catererPrestation.update({ where: { id: existingPrestation.id }, data: prestationData });
      else await prisma.catererPrestation.create({ data: { organizationId: organization.id, menuId: menu.id, ...prestationData } });

      await prisma.menuItem.deleteMany({ where: { menuId: menu.id } });
      for (const [itemPosition, [recipeName, servingQuantity, totalQuantity]] of prestationDefinition.recipes.entries()) {
        const recipe = recipes.get(recipeName)!;
        await prisma.menuItem.create({
          data: {
            organizationId: organization.id, menuId: menu.id, technicalSheetId: recipe.id,
            section: recipe.section, position: itemPosition,
            servingQuantity, portionsOverride: totalQuantity ?? null,
            notes: totalQuantity ? 'Quantité totale saisie explicitement.' : null,
          },
        });
      }

      const historyExists = await prisma.menuHistory.findFirst({
        where: { menuId: menu.id, summary: `${DEMO_PREFIX} Dossier initialisé` },
      });
      if (!historyExists) {
        await prisma.menuHistory.createMany({
          data: [
            { organizationId: organization.id, menuId: menu.id, action: 'CREATED', summary: `${DEMO_PREFIX} Dossier initialisé`, details: { eventReference: event.reference } },
            { organizationId: organization.id, menuId: menu.id, action: menuStatus === MenuStatus.VALIDATED ? 'VALIDATED' : 'UPDATED', summary: `${DEMO_PREFIX} Composition et logistique renseignées`, details: { expectedGuests: prestationDefinition.guests } },
          ],
        });
      }
    }
  }

  await prisma.catererEventSequence.upsert({
    where: { organizationId_year: { organizationId: organization.id, year: 2026 } },
    update: { value: 9005 },
    create: { organizationId: organization.id, year: 2026, value: 9005 },
  });

  const counts = await Promise.all([
    prisma.catererClient.count({ where: { organizationId: organization.id, name: { startsWith: DEMO_PREFIX } } }),
    prisma.catererEvent.count({ where: { organizationId: organization.id, name: { startsWith: DEMO_PREFIX } } }),
    prisma.catererPrestation.count({ where: { organizationId: organization.id, event: { name: { startsWith: DEMO_PREFIX } } } }),
    prisma.technicalSheet.count({ where: { organizationId: organization.id, name: { startsWith: DEMO_PREFIX } } }),
  ]);
  console.log(`Démo Traiteur prête pour « ${organization.name} » : ${counts[0]} clients, ${counts[1]} événements, ${counts[2]} prestations et ${counts[3]} recettes.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
