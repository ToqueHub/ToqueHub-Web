import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DEMO_PREFIX = 'haccp-dashboard-demo';

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60_000);
}

async function upsertDemo(
  model: { findFirst: Function; create: Function; update: Function },
  organizationId: string,
  clientId: string,
  create: Record<string, unknown>,
  update: Record<string, unknown>,
) {
  const existing = await model.findFirst({ where: { organizationId, clientId } });
  return existing
    ? model.update({ where: { id: existing.id }, data: update })
    : model.create({ data: { ...create, organizationId, clientId } });
}

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.HACCP_DEMO_ALLOW_PRODUCTION !== 'true') {
    throw new Error('Seed HACCP refusé en production. Utilisez une base de développement.');
  }

  const requestedOrganizationId = process.env.HACCP_DEMO_ORGANIZATION_ID?.trim();
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
  if (!actor) throw new Error('Aucun utilisateur actif trouvé dans l’organisation ciblée.');

  await prisma.organization.update({
    where: { id: organization.id },
    data: { haccpInstalledAt: organization.haccpInstalledAt ?? new Date() },
  });

  const temperatureDefinitions = [
    {
      key: 'positive',
      name: 'Chambre froide positive',
      type: 'enceinte_positive',
      min: 0,
      max: 4,
      value: 2.6,
      minutes: 4,
    },
    {
      key: 'negative',
      name: 'Chambre froide négative',
      type: 'enceinte_negative',
      min: -22,
      max: -18,
      value: -18.4,
      minutes: 8,
    },
    {
      key: 'desserts',
      name: 'Vitrine desserts',
      type: 'enceinte_produits_finis',
      min: 0,
      max: 4,
      value: 5.8,
      minutes: 22,
    },
    {
      key: 'vegetables',
      name: 'Chambre légumes',
      type: 'enceinte_legumes',
      min: 0,
      max: 8,
      value: 6.2,
      minutes: 51,
    },
  ];

  for (const definition of temperatureDefinitions) {
    const equipment = await upsertDemo(
      prisma.haccpTemperatureEquipment,
      organization.id,
      `${DEMO_PREFIX}:temperature:${definition.key}`,
      {
        createdById: actor.id,
        name: definition.name,
        type: definition.type,
        temperatureMin: definition.min,
        temperatureMax: definition.max,
      },
      {
        name: definition.name,
        type: definition.type,
        temperatureMin: definition.min,
        temperatureMax: definition.max,
        isActive: true,
        archivedAt: null,
        deletedAt: null,
      },
    );
    await upsertDemo(
      prisma.haccpTemperatureReading,
      organization.id,
      `${DEMO_PREFIX}:reading:${definition.key}`,
      {
        createdById: actor.id,
        equipmentId: equipment.id,
        temperature: definition.value,
        date: minutesAgo(definition.minutes),
        notes: 'Donnée de démonstration saisie depuis l’application mobile',
      },
      {
        equipmentId: equipment.id,
        temperature: definition.value,
        date: minutesAgo(definition.minutes),
        notes: 'Donnée de démonstration saisie depuis l’application mobile',
        deletedAt: null,
      },
    );
  }

  const cleaningDefinitions = [
    {
      key: 'kitchen',
      name: 'Cuisine / Production',
      description: 'Plans de travail et matériel de préparation',
      surfaces: ['Plan de travail', 'Matériel', 'Poignées', 'Sols'],
      cleaned: 4,
    },
    {
      key: 'dish',
      name: 'Plonge',
      description: 'Lavage, égouttage et robinetterie',
      surfaces: ['Évier', 'Lave-vaisselle', 'Robinetterie'],
      cleaned: 2,
    },
    {
      key: 'storage',
      name: 'Réserve sèche',
      description: 'Stockage, rayonnages et circulation',
      surfaces: ['Étagères', 'Sols', 'Bacs'],
      cleaned: 1,
    },
  ];
  const seededSurfaces: Array<{
    id: string;
    name: string;
    zoneId: string;
    zoneName: string;
    cleanedAt: Date | null;
  }> = [];

  for (const [zoneIndex, definition] of cleaningDefinitions.entries()) {
    const zone = await upsertDemo(
      prisma.haccpCleaningZone,
      organization.id,
      `${DEMO_PREFIX}:zone:${definition.key}`,
      {
        createdById: actor.id,
        name: definition.name,
        description: definition.description,
      },
      {
        name: definition.name,
        description: definition.description,
        isActive: true,
        archivedAt: null,
        deletedAt: null,
      },
    );

    for (const [surfaceIndex, surfaceName] of definition.surfaces.entries()) {
      const cleanedAt =
        surfaceIndex < definition.cleaned
          ? minutesAgo(28 + zoneIndex * 12 + surfaceIndex * 3)
          : null;
      const surface = await upsertDemo(
        prisma.haccpCleaningSurface,
        organization.id,
        `${DEMO_PREFIX}:surface:${definition.key}:${surfaceIndex}`,
        {
          createdById: actor.id,
          zoneId: zone.id,
          name: surfaceName,
          frequency: 'daily',
          lastCleaned: cleanedAt,
        },
        {
          zoneId: zone.id,
          name: surfaceName,
          frequency: 'daily',
          lastCleaned: cleanedAt,
          isActive: true,
          archivedAt: null,
          deletedAt: null,
        },
      );
      seededSurfaces.push({
        id: surface.id,
        name: surface.name,
        zoneId: zone.id,
        zoneName: zone.name,
        cleanedAt,
      });
    }
  }

  const cleaningSession = await upsertDemo(
    prisma.haccpCleaningSession,
    organization.id,
    `${DEMO_PREFIX}:cleaning-session`,
    {
      createdById: actor.id,
      sessionDate: minutesAgo(95),
      startTime: minutesAgo(95),
      endTime: minutesAgo(24),
      totalSurfaces: seededSurfaces.length,
      completedSurfaces: seededSurfaces.filter((surface) => surface.cleanedAt).length,
      status: 'completed',
      notes: 'Session de démonstration réalisée depuis l’application mobile',
    },
    {
      sessionDate: minutesAgo(95),
      startTime: minutesAgo(95),
      endTime: minutesAgo(24),
      totalSurfaces: seededSurfaces.length,
      completedSurfaces: seededSurfaces.filter((surface) => surface.cleanedAt).length,
      status: 'completed',
      notes: 'Session de démonstration réalisée depuis l’application mobile',
      deletedAt: null,
    },
  );

  for (const [index, surface] of seededSurfaces.filter((item) => item.cleanedAt).entries()) {
    await upsertDemo(
      prisma.haccpCleanedSurface,
      organization.id,
      `${DEMO_PREFIX}:cleaned-surface:${index}`,
      {
        createdById: actor.id,
        sessionId: cleaningSession.id,
        surfaceId: surface.id,
        surfaceName: surface.name,
        zoneId: surface.zoneId,
        zoneName: surface.zoneName,
        cleanedAt: surface.cleanedAt!,
        notes: 'Validation mobile de démonstration',
      },
      {
        sessionId: cleaningSession.id,
        surfaceId: surface.id,
        surfaceName: surface.name,
        zoneId: surface.zoneId,
        zoneName: surface.zoneName,
        cleanedAt: surface.cleanedAt!,
        notes: 'Validation mobile de démonstration',
        deletedAt: null,
      },
    );
  }

  const processDefinitions = [
    {
      key: 'cooling-main',
      name: 'Cellule de refroidissement 01',
      type: 'refroidissement',
      min: 0,
      max: 4,
      product: 'Velouté de courge',
      lot: 'LOT-DEMO-A',
      start: 63,
      end: 3.2,
      started: 112,
      ended: 34,
      duration: 78,
      status: 'termine',
    },
    {
      key: 'cooling-dessert',
      name: 'Cellule desserts',
      type: 'refroidissement',
      min: 0,
      max: 4,
      product: 'Crème pâtissière',
      lot: 'LOT-DEMO-B',
      start: 67,
      end: 7.1,
      started: 141,
      ended: 19,
      duration: 122,
      status: 'termine',
    },
    {
      key: 'freezing',
      name: 'Cellule de congélation',
      type: 'congelation',
      min: -25,
      max: -18,
      product: 'Saumon portionné',
      lot: 'LOT-DEMO-C',
      start: 3.8,
      end: null,
      started: 46,
      ended: null,
      duration: 46,
      status: 'en_cours',
    },
    {
      key: 'reheating',
      name: 'Four de remise en température',
      type: 'rechauffement',
      min: 63,
      max: 85,
      product: 'Lasagnes végétales',
      lot: 'LOT-DEMO-D',
      start: 4.2,
      end: 68.5,
      started: 72,
      ended: 30,
      duration: 42,
      status: 'termine',
    },
  ];

  for (const definition of processDefinitions) {
    const equipment = await upsertDemo(
      prisma.haccpProcessEquipment,
      organization.id,
      `${DEMO_PREFIX}:process-equipment:${definition.key}`,
      {
        createdById: actor.id,
        name: definition.name,
        type: definition.type,
        temperatureMin: definition.min,
        temperatureMax: definition.max,
        location: 'Cuisine de démonstration',
      },
      {
        name: definition.name,
        type: definition.type,
        temperatureMin: definition.min,
        temperatureMax: definition.max,
        location: 'Cuisine de démonstration',
        isActive: true,
        archivedAt: null,
        deletedAt: null,
      },
    );
    const product = await upsertDemo(
      prisma.haccpProduct,
      organization.id,
      `${DEMO_PREFIX}:product:${definition.key}`,
      {
        createdById: actor.id,
        name: definition.product,
        type: 'preparation',
        description: 'Produit HACCP de démonstration',
        isActive: true,
      },
      {
        name: definition.product,
        type: 'preparation',
        description: 'Produit HACCP de démonstration',
        isActive: true,
        archivedAt: null,
        deletedAt: null,
      },
    );
    await upsertDemo(
      prisma.haccpProcessSession,
      organization.id,
      `${DEMO_PREFIX}:process-session:${definition.key}`,
      {
        createdById: actor.id,
        type: definition.type,
        productId: product.id,
        equipmentId: equipment.id,
        sessionDate: minutesAgo(definition.started),
        startTime: minutesAgo(definition.started),
        endTime: definition.ended == null ? null : minutesAgo(definition.ended),
        startTemperature: definition.start,
        endTemperature: definition.end,
        lotNumber: definition.lot,
        status: definition.status,
        duration: definition.duration,
        notes: 'Suivi process de démonstration saisi depuis l’application mobile',
      },
      {
        type: definition.type,
        productId: product.id,
        equipmentId: equipment.id,
        sessionDate: minutesAgo(definition.started),
        startTime: minutesAgo(definition.started),
        endTime: definition.ended == null ? null : minutesAgo(definition.ended),
        startTemperature: definition.start,
        endTemperature: definition.end,
        lotNumber: definition.lot,
        status: definition.status,
        duration: definition.duration,
        notes: 'Suivi process de démonstration saisi depuis l’application mobile',
        deletedAt: null,
      },
    );
  }

  console.log(`Données HACCP de démonstration installées pour l’organisation ${organization.id}.`);
  console.log(
    '4 enceintes, 4 relevés, 3 zones, 10 surfaces, 1 session nettoyage, 4 équipements process et 4 cycles.',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
