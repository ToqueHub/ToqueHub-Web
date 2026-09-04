import {
  HaccpReceptionControlStatus,
  ProductKind,
  Prisma,
  PrismaClient,
  PurchaseOrderStatus,
  StockReceptionLineMatchingStatus,
  StockReceptionStatus,
  UnitType,
} from '@prisma/client';

const prisma = new PrismaClient();
const PREFIX = 'DEMO RÉCEPTION MOBILE';

type OrderDefinition = {
  key: string;
  status: PurchaseOrderStatus;
  expectedDeliveryDate: Date;
  lines: Array<{ productId: string; unitId: string; name: string; quantity: number; price: number; received?: number }>;
};

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.MOBILE_RECEPTION_DEMO_ALLOW_PRODUCTION !== 'true') {
    throw new Error('Seed Réception refusé en production. Utilisez une base de développement.');
  }

  const requestedOrganizationId = process.env.MOBILE_RECEPTION_DEMO_ORGANIZATION_ID?.trim();
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

  const [kg, piece] = await Promise.all([
    prisma.unit.upsert({
      where: { organizationId_symbol: { organizationId: organization.id, symbol: 'kg' } },
      create: { organizationId: organization.id, name: 'Kilogramme', symbol: 'kg', type: UnitType.MASS },
      update: { name: 'Kilogramme', type: UnitType.MASS, isArchived: false, archivedAt: null },
    }),
    prisma.unit.upsert({
      where: { organizationId_symbol: { organizationId: organization.id, symbol: 'pce' } },
      create: { organizationId: organization.id, name: 'Pièce', symbol: 'pce', type: UnitType.COUNT },
      update: { name: 'Pièce', type: UnitType.COUNT, isArchived: false, archivedAt: null },
    }),
  ]);
  const category = await prisma.category.upsert({
    where: { organizationId_name: { organizationId: organization.id, name: PREFIX } },
    create: { organizationId: organization.id, name: PREFIX, description: 'Jeu de données pour tester le parcours Réception mobile.' },
    update: { isArchived: false, archivedAt: null },
  });
  const site = await prisma.site.upsert({
    where: { organizationId_name: { organizationId: organization.id, name: `${PREFIX} · Cuisine` } },
    create: { organizationId: organization.id, name: `${PREFIX} · Cuisine`, address: '10 rue des Tests, 75011 Paris' },
    update: { isArchived: false, archivedAt: null },
  });
  const location = await prisma.location.upsert({
    where: { organizationId_siteId_name: { organizationId: organization.id, siteId: site.id, name: `${PREFIX} · Chambre froide` } },
    create: { organizationId: organization.id, siteId: site.id, name: `${PREFIX} · Chambre froide` },
    update: { isArchived: false, archivedAt: null },
  });
  const supplier = await prisma.supplier.upsert({
    where: { organizationId_name: { organizationId: organization.id, name: `${PREFIX} · Frais & Co` } },
    create: { organizationId: organization.id, name: `${PREFIX} · Frais & Co`, email: 'commandes@frais-co.demo', phone: '01 84 80 20 20' },
    update: { isArchived: false, archivedAt: null, email: 'commandes@frais-co.demo' },
  });

  const [tomatoes, chicken, yoghurt] = await Promise.all([
    product(organization.id, category.id, kg.id, supplier.id, `${PREFIX} · Tomates grappes`, 3.9),
    product(organization.id, category.id, kg.id, supplier.id, `${PREFIX} · Filet de poulet`, 12.5),
    product(organization.id, category.id, piece.id, supplier.id, `${PREFIX} · Yaourt nature`, 0.62),
  ]);

  const today = new Date();
  const at = (offset: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset, 9, 30);
  const orders: OrderDefinition[] = [
    {
      key: 'SENT', status: PurchaseOrderStatus.SENT, expectedDeliveryDate: at(0),
      lines: [{ productId: tomatoes.id, unitId: kg.id, name: tomatoes.name, quantity: 12, price: 3.9 }, { productId: yoghurt.id, unitId: piece.id, name: yoghurt.name, quantity: 48, price: 0.62 }],
    },
    {
      key: 'ACK', status: PurchaseOrderStatus.ACKNOWLEDGED, expectedDeliveryDate: at(1),
      lines: [{ productId: chicken.id, unitId: kg.id, name: chicken.name, quantity: 8, price: 12.5 }, { productId: tomatoes.id, unitId: kg.id, name: tomatoes.name, quantity: 6, price: 3.9 }],
    },
    {
      key: 'PARTIAL', status: PurchaseOrderStatus.PARTIALLY_RECEIVED, expectedDeliveryDate: at(-1),
      lines: [{ productId: chicken.id, unitId: kg.id, name: chicken.name, quantity: 15, price: 12.5, received: 6 }, { productId: yoghurt.id, unitId: piece.id, name: yoghurt.name, quantity: 60, price: 0.62, received: 24 }],
    },
  ];
  for (const order of orders) await upsertOrder(organization.id, actor.id, supplier.id, site.id, order);

  await upsertReception({
    organizationId: organization.id, actorId: actor.id, supplierId: supplier.id, supplierName: supplier.name,
    siteId: site.id, locationId: location.id, productId: tomatoes.id, unitId: kg.id,
    key: 'CONFORME', date: at(-2), document: 'BL-DEMO-1001', status: HaccpReceptionControlStatus.CONFORMING,
    delivered: 10, accepted: 10, temperature: 3.2, note: 'Contrôle conforme — données de démonstration.',
  });
  await upsertReception({
    organizationId: organization.id, actorId: actor.id, supplierId: supplier.id, supplierName: supplier.name,
    siteId: site.id, locationId: location.id, productId: chicken.id, unitId: kg.id,
    key: 'PARTIELLE', date: at(-1), document: 'BL-DEMO-1002', status: HaccpReceptionControlStatus.PARTIAL,
    delivered: 10, accepted: 7, temperature: 5.8, note: '3 kg refusés : température de livraison élevée.',
  });
  await upsertReception({
    organizationId: organization.id, actorId: actor.id, supplierId: supplier.id, supplierName: supplier.name,
    siteId: site.id, locationId: location.id, productId: yoghurt.id, unitId: piece.id,
    key: 'REFUSEE', date: at(0), document: 'BL-DEMO-1003', status: HaccpReceptionControlStatus.REJECTED,
    delivered: 24, accepted: 0, temperature: 9.1, note: 'Réception refusée — aucune quantité entrée en stock.',
  });

  console.log(JSON.stringify({ organizationId: organization.id, site: site.name, supplier: supplier.name, orders: orders.map(({ key, status }) => ({ key, status })), receptions: 3 }, null, 2));
}

async function product(organizationId: string, categoryId: string, unitId: string, supplierId: string, name: string, averagePrice: number) {
  return prisma.product.upsert({
    where: { organizationId_name: { organizationId, name } },
    create: { organizationId, categoryId, unitId, primarySupplierId: supplierId, name, kind: ProductKind.RAW_MATERIAL, averagePrice: new Prisma.Decimal(averagePrice) },
    update: { categoryId, unitId, primarySupplierId: supplierId, isArchived: false, archivedAt: null, averagePrice: new Prisma.Decimal(averagePrice) },
  });
}

async function upsertOrder(organizationId: string, actorId: string, supplierId: string, siteId: string, definition: OrderDefinition) {
  const number = `REC-MOB-${definition.key}`;
  const total = definition.lines.reduce((sum, line) => sum + line.quantity * line.price, 0);
  const existing = await prisma.purchaseOrder.findUnique({ where: { organizationId_number: { organizationId, number } } });
  const data = {
    supplierId, siteId, status: definition.status, supplierNameSnapshot: `${PREFIX} · Frais & Co`, supplierEmailSnapshot: 'commandes@frais-co.demo',
    expectedDeliveryDate: definition.expectedDeliveryDate, sentById: actorId, sentAt: definition.status === PurchaseOrderStatus.SENT ? new Date() : atPast(1),
    acknowledgedAt: definition.status === PurchaseOrderStatus.ACKNOWLEDGED || definition.status === PurchaseOrderStatus.PARTIALLY_RECEIVED ? atPast(1) : null,
    totalExcludingTax: new Prisma.Decimal(total), totalTax: new Prisma.Decimal(0), totalIncludingTax: new Prisma.Decimal(total),
    notes: 'Commande de démonstration pour le parcours Réception mobile.',
  };
  const order = existing
    ? await prisma.purchaseOrder.update({ where: { id: existing.id }, data })
    : await prisma.purchaseOrder.create({ data: { organizationId, number, createdById: actorId, ...data } });
  await prisma.purchaseOrderLine.deleteMany({ where: { orderId: order.id } });
  await prisma.purchaseOrderLine.createMany({ data: definition.lines.map((line, index) => ({
    organizationId, orderId: order.id, productId: line.productId, unitId: line.unitId, position: index + 1,
    productNameSnapshot: line.name, unitSymbolSnapshot: line.unitId, orderedQuantity: new Prisma.Decimal(line.quantity),
    expectedStockQuantity: new Prisma.Decimal(line.quantity), receivedQuantity: new Prisma.Decimal(line.received ?? 0),
    unitsPerOrderUnit: new Prisma.Decimal(1), unitPrice: new Prisma.Decimal(line.price), vatRate: new Prisma.Decimal(0),
    lineExcludingTax: new Prisma.Decimal(line.quantity * line.price), lineTax: new Prisma.Decimal(0), lineIncludingTax: new Prisma.Decimal(line.quantity * line.price),
  })) });
}

function atPast(days: number) { const date = new Date(); date.setDate(date.getDate() - days); return date; }

async function upsertReception(input: {
  organizationId: string; actorId: string; supplierId: string; supplierName: string; siteId: string; locationId: string;
  productId: string; unitId: string; key: string; date: Date; document: string; status: HaccpReceptionControlStatus;
  delivered: number; accepted: number; temperature: number; note: string;
}) {
  const existing = await prisma.stockReception.findFirst({ where: { organizationId: input.organizationId, deliveryNoteNumber: input.document } });
  const data = {
    supplierId: input.supplierId, supplierName: input.supplierName, deliveryNoteNumber: input.document, deliveryDate: input.date,
    status: input.accepted > 0 ? StockReceptionStatus.VALIDATED : StockReceptionStatus.CANCELLED,
    createdById: input.actorId, siteId: input.siteId, locationId: input.locationId, deliveryTemperature: new Prisma.Decimal(input.temperature), controlStatus: input.status, controlNotes: input.note, validatedAt: input.date,
  };
  const reception = existing
    ? await prisma.stockReception.update({ where: { id: existing.id }, data })
    : await prisma.stockReception.create({ data: { organizationId: input.organizationId, ...data } });
  await prisma.stockReceptionLine.deleteMany({ where: { receptionId: reception.id } });
  await prisma.stockReceptionLine.create({ data: {
    receptionId: reception.id, productId: input.productId, unitId: input.unitId, ocrLabel: `${PREFIX} · ${input.key}`,
    quantity: new Prisma.Decimal(input.delivered), deliveredQuantity: new Prisma.Decimal(input.delivered), acceptedQuantity: new Prisma.Decimal(input.accepted),
    unit: 'unité', matchingStatus: StockReceptionLineMatchingStatus.MATCHED, userCorrection: { demo: true, note: input.note },
  } });
}

main().finally(() => prisma.$disconnect());
