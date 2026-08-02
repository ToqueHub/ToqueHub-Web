import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  InventoryStatus,
  Prisma,
  ProductKind,
  PurchasingDeliveryMode,
  StockMovementType,
  TechnicalSheetHistoryAction,
  UnitType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdjustProductStockDto } from './dto/adjust-product-stock.dto';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { CreateInventoryDto, UpdateInventoryCountsDto } from './dto/inventory.dto';
import {
  ListArticlesQueryDto,
  ListQueryDto,
  UpsertEquipmentProfileDto,
  UpsertCategoryDto,
  UpsertLocationDto,
  UpsertLotDto,
  UpsertProductDto,
  UpsertSiteDto,
  UpsertSupplierDto,
  UpsertUnitConversionDto,
  UpsertUnitDto,
} from './dto/stocks-reference.dto';

const WRITE_ROLES = ['SUPER_ADMIN', 'Administrateur', 'Manager', 'Chef', 'Second', 'Magasinier'];
const ADMIN_MANAGER_ROLES = ['SUPER_ADMIN', 'Administrateur', 'Manager', 'Chef'];
const STOCK_CATALOG_PRODUCT_KINDS = [
  ProductKind.UNSPECIFIED,
  ProductKind.RAW_MATERIAL,
  ProductKind.PACKAGED,
];
const STOCK_MANAGED_PRODUCT_KINDS = [...STOCK_CATALOG_PRODUCT_KINDS, ProductKind.EQUIPMENT];
const NEGATIVE_TYPES = new Set<StockMovementType>([
  StockMovementType.OUT,
  StockMovementType.CONSUMPTION,
  StockMovementType.LOSS,
  StockMovementType.BREAKAGE,
  StockMovementType.TASTING,
  StockMovementType.EXPIRATION,
  StockMovementType.DESTRUCTION,
  StockMovementType.SALE,
]);
const CONSUMPTION_TYPES = [
  StockMovementType.OUT,
  StockMovementType.CONSUMPTION,
  StockMovementType.LOSS,
  StockMovementType.CORRECTION,
  StockMovementType.INVENTORY,
];
const UNCATEGORIZED_CATEGORY_NAME = 'Sans catégorie';
const DEFAULT_STOCK_CATEGORIES = [
  'Épicerie',
  'Produits frais',
  'Surgelés',
  'Boissons',
  'Viandes',
  'Poissons',
  'Produits laitiers',
  'Fruits et légumes',
  'Sans catégorie',
];

type Actor = { id: string; role: string };
type Tx = Prisma.TransactionClient;

@Injectable()
export class StocksService {
  constructor(private readonly prisma: PrismaService) {}

  private assertWrite(actor: Actor) {
    if (!WRITE_ROLES.includes(actor.role))
      throw new ForbiddenException('Insufficient stock permissions');
  }

  private assertManager(actor: Actor) {
    if (!ADMIN_MANAGER_ROLES.includes(actor.role))
      throw new ForbiddenException('Manager permissions required');
  }

  private page(q?: ListQueryDto) {
    const take = Math.min(q?.pageSize ?? 50, 200);
    const skip = ((q?.page ?? 1) - 1) * take;
    return { take, skip };
  }

  private async audit(
    tx: Tx,
    organizationId: string,
    userId: string | null,
    action: AuditAction,
    entityType: string,
    entityId?: string | null,
    entityName?: string | null,
    details?: Prisma.InputJsonValue,
  ) {
    await tx.auditLog.create({
      data: { organizationId, userId, action, entityType, entityId, entityName, details },
    });
  }

  async installDefaults(organizationId: string, actor: Actor) {
    this.assertManager(actor);
    return this.prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: organizationId },
        data: { stocksInstalledAt: new Date() },
      });
      await tx.category.createMany({
        data: DEFAULT_STOCK_CATEGORIES.map((name) => ({ organizationId, name })),
        skipDuplicates: true,
      });
      await tx.unit.createMany({
        data: [
          { name: 'Kilogramme', symbol: 'kg', type: UnitType.MASS },
          { name: 'Gramme', symbol: 'g', type: UnitType.MASS },
          { name: 'Litre', symbol: 'L', type: UnitType.VOLUME },
          { name: 'Millilitre', symbol: 'mL', type: UnitType.VOLUME },
          { name: 'Pièce', symbol: 'pièce', type: UnitType.COUNT },
          { name: 'Barquette', symbol: 'barquette', type: UnitType.PACKAGE },
          { name: 'Caisse', symbol: 'caisse', type: UnitType.PACKAGE },
          { name: 'Carton', symbol: 'carton', type: UnitType.PACKAGE },
          { name: 'Bac', symbol: 'bac', type: UnitType.PACKAGE },
        ].map((unit) => ({ ...unit, organizationId })),
        skipDuplicates: true,
      });
      const site = await tx.site.upsert({
        where: { organizationId_name: { organizationId, name: 'Site principal' } },
        update: {},
        create: { organizationId, name: 'Site principal' },
      });
      await tx.location.createMany({
        data: [
          'Réserve sèche',
          'Chambre froide positive',
          'Chambre froide négative',
          'Congélateur',
          'Cuisine',
          'Zone de production',
          'Quai de réception',
        ].map((name) => ({ organizationId, siteId: site.id, name })),
        skipDuplicates: true,
      });
      await this.seedConversions(tx, organizationId);
      await this.audit(
        tx,
        organizationId,
        actor.id,
        AuditAction.MODULE_STOCKS_INSTALLED,
        'Module',
        'stocks',
        'Stocks',
      );
      return { installed: true };
    });
  }

  async uninstallFromInterface(organizationId: string, actor: Actor) {
    this.assertManager(actor);
    return this.prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: organizationId },
        data: { stocksInstalledAt: null },
      });
      await this.audit(
        tx,
        organizationId,
        actor.id,
        AuditAction.MODULE_STOCKS_UNINSTALLED,
        'Module',
        'stocks',
        'Stocks',
      );
      return { installed: false };
    });
  }

  private async seedConversions(tx: Tx, organizationId: string) {
    const units = await tx.unit.findMany({ where: { organizationId } });
    const bySymbol = Object.fromEntries(units.map((u) => [u.symbol, u]));
    const pairs: Array<[string, string, string]> = [
      ['kg', 'g', '1000'],
      ['g', 'kg', '0.001'],
      ['L', 'mL', '1000'],
      ['mL', 'L', '0.001'],
    ];
    for (const [from, to, factor] of pairs) {
      if (bySymbol[from] && bySymbol[to]) {
        await tx.unitConversion.upsert({
          where: {
            organizationId_fromUnitId_toUnitId: {
              organizationId,
              fromUnitId: bySymbol[from].id,
              toUnitId: bySymbol[to].id,
            },
          },
          update: { factor },
          create: {
            organizationId,
            fromUnitId: bySymbol[from].id,
            toUnitId: bySymbol[to].id,
            factor,
          },
        });
      }
    }
  }

  async listCategories(organizationId: string, q: ListQueryDto = {}) {
    const equipmentCategories = q.kind === ProductKind.EQUIPMENT;
    const categories = await this.prisma.category.findMany({
      where: {
        organizationId,
        kind: equipmentCategories ? ProductKind.EQUIPMENT : { not: ProductKind.EQUIPMENT },
        ...(q.includeArchived ? {} : { isArchived: false }),
        name: q.search ? { contains: q.search, mode: 'insensitive' } : undefined,
      },
      orderBy: { name: 'asc' },
      ...this.page(q),
    });
    return this.sortCategoriesWithUncategorizedLast(categories);
  }
  async createCategory(organizationId: string, actor: Actor, dto: UpsertCategoryDto) {
    this.assertWrite(actor);
    return this.createAudited(
      'category',
      organizationId,
      actor.id,
      AuditAction.CATEGORY_CREATED,
      dto,
    );
  }
  async updateCategory(organizationId: string, actor: Actor, id: string, dto: UpsertCategoryDto) {
    this.assertWrite(actor);
    const item = await this.prisma.category.update({ where: { id, organizationId }, data: dto });
    await this.log(
      organizationId,
      actor.id,
      AuditAction.CATEGORY_UPDATED,
      'Category',
      item.id,
      item.name,
    );
    return item;
  }
  async archiveCategory(organizationId: string, actor: Actor, id: string) {
    this.assertWrite(actor);
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.category.findFirst({ where: { id, organizationId } });
      if (!category) throw new NotFoundException('Category not found');
      if (this.categoryKey(category.name) === this.categoryKey(UNCATEGORIZED_CATEGORY_NAME)) {
        throw new BadRequestException('La catégorie Sans catégorie ne peut pas être supprimée.');
      }

      const fallback = await this.ensureUncategorizedCategory(tx, organizationId, category.kind);
      const moved = await tx.product.updateMany({
        where: { organizationId, categoryId: category.id },
        data: { categoryId: fallback.id },
      });
      const item = await tx.category.update({
        where: { id: category.id },
        data: { isArchived: true, archivedAt: new Date() },
      });
      await this.audit(
        tx,
        organizationId,
        actor.id,
        AuditAction.CATEGORY_ARCHIVED,
        'Category',
        item.id,
        item.name,
        { movedProducts: moved.count, fallbackCategoryId: fallback.id },
      );
      return item;
    });
  }

  listUnits(organizationId: string, q: ListQueryDto = {}) {
    return this.prisma.unit.findMany({
      where: {
        organizationId,
        ...(q.includeArchived ? {} : { isArchived: false }),
        OR: q.search
          ? [
              { name: { contains: q.search, mode: 'insensitive' } },
              { symbol: { contains: q.search, mode: 'insensitive' } },
            ]
          : undefined,
      },
      include: { fromConversions: { include: { toUnit: true } } },
      orderBy: { name: 'asc' },
      ...this.page(q),
    });
  }
  async createUnit(organizationId: string, actor: Actor, dto: UpsertUnitDto) {
    this.assertWrite(actor);
    const item = await this.prisma.unit.create({
      data: { ...dto, type: dto.type ?? UnitType.OTHER, organizationId },
    });
    await this.log(organizationId, actor.id, AuditAction.UNIT_CREATED, 'Unit', item.id, item.name);
    return item;
  }
  async updateUnit(organizationId: string, actor: Actor, id: string, dto: UpsertUnitDto) {
    this.assertWrite(actor);
    const item = await this.prisma.unit.update({ where: { id, organizationId }, data: dto });
    await this.log(organizationId, actor.id, AuditAction.UNIT_UPDATED, 'Unit', item.id, item.name);
    return item;
  }
  archiveUnit(organizationId: string, actor: Actor, id: string) {
    return this.archive('unit', organizationId, actor, id, AuditAction.UNIT_ARCHIVED, 'Unit');
  }
  async upsertConversion(organizationId: string, actor: Actor, dto: UpsertUnitConversionDto) {
    this.assertWrite(actor);
    await this.ensureUnit(organizationId, dto.fromUnitId);
    await this.ensureUnit(organizationId, dto.toUnitId);
    return this.prisma.unitConversion.upsert({
      where: {
        organizationId_fromUnitId_toUnitId: {
          organizationId,
          fromUnitId: dto.fromUnitId,
          toUnitId: dto.toUnitId,
        },
      },
      update: { factor: dto.factor },
      create: { organizationId, ...dto },
    });
  }

  listSuppliers(organizationId: string, q: ListQueryDto = {}) {
    return this.prisma.supplier.findMany({
      where: {
        organizationId,
        ...(q.includeArchived ? {} : { isArchived: false }),
        OR: q.search
          ? [
              { name: { contains: q.search, mode: 'insensitive' } },
              { contactName: { contains: q.search, mode: 'insensitive' } },
              { email: { contains: q.search, mode: 'insensitive' } },
              { purchasingProfile: { orderEmail: { contains: q.search, mode: 'insensitive' } } },
            ]
          : undefined,
      },
      include: { purchasingProfile: true },
      orderBy: { name: 'asc' },
      ...this.page(q),
    });
  }
  async createSupplier(organizationId: string, actor: Actor, dto: UpsertSupplierDto) {
    this.assertWrite(actor);
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('Le nom du fournisseur est obligatoire.');
    const { purchasing, ...supplierData } = dto;
    const purchasingData = this.normalizeSupplierPurchasing(purchasing);

    const existing = await this.prisma.supplier.findUnique({
      where: { organizationId_name: { organizationId, name } },
    });

    if (existing) {
      if (!existing.isArchived) {
        return this.prisma.supplier.findUnique({
          where: { id: existing.id },
          include: { purchasingProfile: true },
        });
      }
      return this.prisma.$transaction(async (tx) => {
        const restored = await tx.supplier.update({
          where: { id: existing.id },
          data: { ...supplierData, name, isArchived: false, archivedAt: null },
        });
        if (purchasingData)
          await this.upsertSupplierPurchasing(tx, organizationId, restored.id, purchasingData);
        await this.audit(
          tx,
          organizationId,
          actor.id,
          AuditAction.SUPPLIER_UPDATED,
          'Supplier',
          restored.id,
          restored.name,
        );
        return tx.supplier.findUnique({
          where: { id: restored.id },
          include: { purchasingProfile: true },
        });
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const item = await tx.supplier.create({ data: { ...supplierData, name, organizationId } });
      if (purchasingData)
        await this.upsertSupplierPurchasing(tx, organizationId, item.id, purchasingData);
      await this.audit(
        tx,
        organizationId,
        actor.id,
        AuditAction.SUPPLIER_CREATED,
        'Supplier',
        item.id,
        item.name,
      );
      return tx.supplier.findUnique({
        where: { id: item.id },
        include: { purchasingProfile: true },
      });
    });
  }
  async updateSupplier(organizationId: string, actor: Actor, id: string, dto: UpsertSupplierDto) {
    this.assertWrite(actor);
    const { purchasing, ...supplierData } = dto;
    const purchasingData = this.normalizeSupplierPurchasing(purchasing);
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.supplier.update({ where: { id, organizationId }, data: supplierData });
      if (purchasingData)
        await this.upsertSupplierPurchasing(tx, organizationId, item.id, purchasingData);
      await this.audit(
        tx,
        organizationId,
        actor.id,
        AuditAction.SUPPLIER_UPDATED,
        'Supplier',
        item.id,
        item.name,
      );
      return tx.supplier.findUnique({
        where: { id: item.id },
        include: { purchasingProfile: true },
      });
    });
  }
  archiveSupplier(organizationId: string, actor: Actor, id: string) {
    return this.archive(
      'supplier',
      organizationId,
      actor,
      id,
      AuditAction.SUPPLIER_ARCHIVED,
      'Supplier',
    );
  }

  private normalizeSupplierPurchasing(settings?: UpsertSupplierDto['purchasing']) {
    if (!settings) return null;
    const deliveryWeekdays = [...new Set(settings.deliveryWeekdays)].sort((a, b) => a - b);
    if (settings.deliveryMode === PurchasingDeliveryMode.SCHEDULED_DAYS && !deliveryWeekdays.length)
      throw new BadRequestException(
        'Sélectionnez au moins un jour de livraison pour ce fournisseur.',
      );
    return {
      orderEmail:
        settings.deliveryMode === PurchasingDeliveryMode.NO_DELIVERY
          ? null
          : settings.orderEmail?.trim().toLowerCase() || null,
      deliveryMode: settings.deliveryMode,
      deliveryWeekdays:
        settings.deliveryMode === PurchasingDeliveryMode.SCHEDULED_DAYS ? deliveryWeekdays : [],
      minimumOrder: new Prisma.Decimal(
        settings.deliveryMode === PurchasingDeliveryMode.NO_DELIVERY ? 0 : settings.minimumOrder,
      ),
      deliveryFee: new Prisma.Decimal(
        settings.deliveryMode === PurchasingDeliveryMode.NO_DELIVERY ? 0 : settings.deliveryFee,
      ),
      timezone: settings.timezone?.trim() || 'UTC',
      leadTimeDays:
        settings.deliveryMode === PurchasingDeliveryMode.NO_DELIVERY
          ? 0
          : (settings.leadTimeDays ?? 1),
      orderingEnabled: settings.deliveryMode !== PurchasingDeliveryMode.NO_DELIVERY,
      emailSubjectTemplate: settings.emailSubjectTemplate?.trim() || null,
      emailBodyTemplate: settings.emailBodyTemplate?.trim() || null,
      emailSignature: settings.emailSignature?.trim() || null,
    };
  }

  private equipmentProfileData(dto: UpsertEquipmentProfileDto) {
    const financingStart = dto.financingStart ? new Date(dto.financingStart) : dto.financingStart;
    const financingEnd = dto.financingEnd ? new Date(dto.financingEnd) : dto.financingEnd;
    if (financingStart && financingEnd && financingEnd < financingStart)
      throw new BadRequestException(
        'La fin du financement doit être postérieure à sa date de début.',
      );
    return {
      brand: dto.brand,
      model: dto.model,
      purchaseUrl: dto.purchaseUrl,
      purchasedAt: dto.purchasedAt ? new Date(dto.purchasedAt) : dto.purchasedAt,
      warrantyEndsAt: dto.warrantyEndsAt ? new Date(dto.warrantyEndsAt) : dto.warrantyEndsAt,
      condition: dto.condition,
      targetQuantity: dto.targetQuantity,
      acquisitionMode: dto.acquisitionMode,
      financingProvider: dto.financingProvider,
      financingStart,
      financingEnd,
      monthlyPayment: dto.monthlyPayment,
      financedAmount: dto.financedAmount,
      buyoutValue: dto.buyoutValue,
      notes: dto.notes,
    };
  }

  private upsertSupplierPurchasing(
    tx: Tx,
    organizationId: string,
    supplierId: string,
    data: NonNullable<ReturnType<StocksService['normalizeSupplierPurchasing']>>,
  ) {
    return tx.supplierPurchasingProfile.upsert({
      where: { supplierId },
      update: data,
      create: { organizationId, supplierId, ...data },
    });
  }

  listProducts(organizationId: string, q: ListQueryDto = {}) {
    const kinds = q.kind ? [q.kind] : STOCK_CATALOG_PRODUCT_KINDS;
    return this.prisma.product.findMany({
      where: {
        organizationId,
        kind: { in: kinds },
        ...(q.includeArchived ? {} : { isArchived: false }),
        OR: q.search
          ? [
              { name: { contains: q.search, mode: 'insensitive' } },
              { sku: { contains: q.search, mode: 'insensitive' } },
              { gtin: { contains: q.search, mode: 'insensitive' } },
              { originCountry: { contains: q.search, mode: 'insensitive' } },
              { primarySupplier: { name: { contains: q.search, mode: 'insensitive' } } },
              { category: { name: { contains: q.search, mode: 'insensitive' } } },
            ]
          : undefined,
      },
      include: {
        category: true,
        unit: true,
        primarySupplier: true,
        stocks: true,
        equipmentProfile: true,
      },
      orderBy: { name: 'asc' },
      ...this.page(q),
    });
  }

  async listArticles(organizationId: string, q: ListArticlesQueryDto = {}) {
    if (q.siteId) await this.ensureSite(organizationId, q.siteId);
    const kinds = q.kind ? [q.kind] : STOCK_CATALOG_PRODUCT_KINDS;
    const where: Prisma.ProductWhereInput = {
      organizationId,
      kind: { in: kinds },
      ...(q.includeArchived ? {} : { isArchived: false }),
      ...(q.siteId ? { siteAssignments: { some: { siteId: q.siteId, isActive: true } } } : {}),
      categoryId: q.categoryId,
      primarySupplierId: q.supplierId,
      OR: q.search
        ? [
            { name: { contains: q.search, mode: 'insensitive' } },
            { sku: { contains: q.search, mode: 'insensitive' } },
            { gtin: { contains: q.search, mode: 'insensitive' } },
            { category: { name: { contains: q.search, mode: 'insensitive' } } },
            { primarySupplier: { name: { contains: q.search, mode: 'insensitive' } } },
          ]
        : undefined,
    };
    const products = await this.prisma.product.findMany({
      where,
      include: {
        category: true,
        unit: true,
        primarySupplier: true,
        equipmentProfile: true,
        siteAssignments: {
          where: q.siteId ? { siteId: q.siteId, isActive: true } : { isActive: true },
          include: { site: true },
        },
        stocks: {
          where: q.siteId ? { siteId: q.siteId } : undefined,
          include: { site: true, location: true, lot: true },
        },
      },
      orderBy: { name: 'asc' },
    });
    const allItems = products.map((product) => {
      const minimumStock =
        (q.siteId ? product.siteAssignments[0]?.minimumStock : null) ?? product.minimumStock;
      const quantity = product.stocks.reduce(
        (sum, stock) => sum.add(stock.quantity),
        new Prisma.Decimal(0),
      );
      const stockBySite = [
        ...product.stocks
          .reduce((bySite, stock) => {
            const key = stock.siteId ?? 'all';
            const current = bySite.get(key) ?? {
              siteId: stock.siteId,
              siteName: stock.site?.name ?? null,
              quantity: new Prisma.Decimal(0),
            };
            current.quantity = current.quantity.add(stock.quantity);
            bySite.set(key, current);
            return bySite;
          }, new Map<string, { siteId: string | null; siteName: string | null; quantity: Prisma.Decimal }>())
          .values(),
      ].map((site) => ({ ...site, quantity: site.quantity }));
      return {
        product,
        stock: {
          quantity,
          value: quantity.mul(product.averagePrice),
          minimumStock,
          status: product.stocks.length ? this.stockStatus(quantity, minimumStock) : 'NO_STOCK',
        },
        stockBySite,
        lots: product.stocks
          .filter((stock) => stock.lot)
          .map((stock) => ({
            lotNumber: stock.lot?.lotNumber ?? null,
            expiresAt: stock.lot?.expiresAt ?? null,
            quantity: stock.quantity,
            siteName: stock.site?.name ?? null,
            locationName: stock.location?.name ?? null,
          })),
      };
    });
    const filteredItems = q.status
      ? allItems.filter((item) => item.stock.status === q.status)
      : allItems;
    const pageSize = Math.min(q.pageSize ?? 25, 100);
    const pageCount = Math.max(1, Math.ceil(filteredItems.length / pageSize));
    const page = Math.min(Math.max(q.page ?? 1, 1), pageCount);
    const pageItems = filteredItems.slice((page - 1) * pageSize, page * pageSize);
    const productIds = pageItems.map((item) => item.product.id);
    const movements = productIds.length
      ? await this.prisma.stockMovement.findMany({
          where: {
            organizationId,
            productId: { in: productIds },
            ...(q.siteId
              ? {
                  OR: [{ sourceSiteId: q.siteId }, { destinationSiteId: q.siteId }],
                }
              : {}),
          },
          include: {
            product: { include: { unit: true } },
            supplier: true,
            sourceSite: true,
            sourceLocation: true,
            destinationSite: true,
            destinationLocation: true,
          },
          orderBy: [{ movementDate: 'desc' }, { createdAt: 'desc' }],
        })
      : [];
    const latestByProduct = new Map<string, (typeof movements)[number]>();
    for (const movement of movements)
      if (!latestByProduct.has(movement.productId))
        latestByProduct.set(movement.productId, movement);
    const items = pageItems.map((item) => ({
      ...item,
      lastMovement: latestByProduct.get(item.product.id) ?? null,
    }));
    const articlesWithStock = allItems.filter((item) => item.stock.status !== 'NO_STOCK').length;
    const lowStockCount = allItems.filter((item) => item.stock.status === 'LOW').length;
    const unassignedCount = await this.prisma.product.count({
      where: {
        organizationId,
        kind: { in: kinds },
        isArchived: false,
        siteAssignments: { none: { isActive: true } },
      },
    });
    return {
      items,
      summary: {
        articleCount: allItems.length,
        articlesWithStock,
        articlesWithoutStock: allItems.length - articlesWithStock,
        stockValue: allItems.reduce((sum, item) => sum + Number(item.stock.value), 0),
        lowStockCount,
        unassignedCount,
      },
      selectedSiteId: q.siteId ?? null,
      pagination: { page, pageSize, total: filteredItems.length, pages: pageCount },
    };
  }
  async createProduct(organizationId: string, actor: Actor, dto: UpsertProductDto) {
    this.assertWrite(actor);
    const kind = dto.kind ?? ProductKind.UNSPECIFIED;
    await this.ensureUnit(organizationId, dto.unitId);
    if (dto.categoryId) await this.ensureCategory(organizationId, dto.categoryId, kind);
    if (dto.primarySupplierId) await this.ensureSupplier(organizationId, dto.primarySupplierId);
    const { equipment, ...productData } = dto;
    const item = await this.prisma.product.create({
      data: {
        ...productData,
        kind,
        organizationId,
        equipmentProfile:
          kind === ProductKind.EQUIPMENT && equipment
            ? { create: { organizationId, ...this.equipmentProfileData(equipment) } }
            : undefined,
      },
      include: {
        category: true,
        unit: true,
        primarySupplier: true,
        stocks: true,
        equipmentProfile: true,
      },
    });
    await this.log(
      organizationId,
      actor.id,
      AuditAction.PRODUCT_CREATED,
      'Product',
      item.id,
      item.name,
    );
    return item;
  }
  async updateProduct(organizationId: string, actor: Actor, id: string, dto: UpsertProductDto) {
    this.assertWrite(actor);
    const before = await this.ensureProduct(organizationId, id, false);
    const nextKind = dto.kind ?? before.kind;
    if (dto.unitId) await this.ensureUnit(organizationId, dto.unitId);
    if (dto.categoryId) await this.ensureCategory(organizationId, dto.categoryId, nextKind);
    if (dto.primarySupplierId) await this.ensureSupplier(organizationId, dto.primarySupplierId);
    const { equipment, ...productData } = dto;
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.product.update({
        where: { id, organizationId },
        data: {
          ...productData,
          equipmentProfile:
            nextKind === ProductKind.EQUIPMENT && equipment !== undefined && equipment !== null
              ? {
                  upsert: {
                    create: { organizationId, ...this.equipmentProfileData(equipment) },
                    update: this.equipmentProfileData(equipment),
                  },
                }
              : undefined,
        },
        include: {
          category: true,
          unit: true,
          primarySupplier: true,
          stocks: true,
          equipmentProfile: true,
        },
      });
      await this.audit(
        tx,
        organizationId,
        actor.id,
        AuditAction.PRODUCT_UPDATED,
        'Product',
        item.id,
        item.name,
      );
      if (
        productData.averagePrice !== undefined &&
        !new Prisma.Decimal(productData.averagePrice).equals(before.averagePrice)
      ) {
        await this.recalculateTechnicalSheetsForProductTx(tx, organizationId, item.id, actor.id);
      }
      return item;
    });
  }
  async adjustProductStock(
    organizationId: string,
    actor: Actor,
    productId: string,
    dto: AdjustProductStockDto,
  ) {
    this.assertWrite(actor);
    const product = await this.ensureProduct(organizationId, productId, true);
    const [requestedStock, requestedLocation] = await Promise.all([
      dto.stockId
        ? this.prisma.stock.findFirst({
            where: { id: dto.stockId, organizationId, productId },
          })
        : null,
      dto.locationId
        ? this.prisma.location.findFirst({
            where: { id: dto.locationId, organizationId, isArchived: false },
            select: { id: true, siteId: true },
          })
        : null,
    ]);
    if (dto.stockId && !requestedStock)
      throw new NotFoundException('Projection de stock introuvable pour ce produit');
    if (dto.locationId && !requestedLocation)
      throw new NotFoundException('Emplacement de stock introuvable');

    if (dto.siteId && requestedStock?.siteId && dto.siteId !== requestedStock.siteId)
      throw new BadRequestException('Le stock ne correspond pas au site sélectionné');
    if (dto.siteId && requestedLocation?.siteId && dto.siteId !== requestedLocation.siteId)
      throw new BadRequestException("L'emplacement ne correspond pas au site sélectionné");
    const site = await this.resolveOperationalSite(
      organizationId,
      requestedStock?.siteId ?? requestedLocation?.siteId ?? dto.siteId,
    );
    const siteId = site.id;

    const stock =
      requestedStock ??
      (await this.prisma.stock.findFirst({
        where: {
          organizationId,
          productId,
          variantId: null,
          lotId: null,
          siteId,
          locationId: requestedLocation?.id ?? null,
        },
      }));
    const previousQuantity = stock?.quantity ?? new Prisma.Decimal(0);
    const targetQuantity = new Prisma.Decimal(dto.quantity);
    const delta = targetQuantity.sub(previousQuantity);
    if (delta.isZero())
      throw new BadRequestException('La quantité saisie est identique au stock actuel');

    return this.prisma.$transaction(async (tx) => {
      await tx.productSite.upsert({
        where: { organizationId_productId_siteId: { organizationId, productId, siteId } },
        update: { isActive: true },
        create: { organizationId, productId, siteId, minimumStock: product.minimumStock },
      });
      const adjustedStock = stock
        ? await tx.stock.update({
            where: { id: stock.id },
            data: { quantity: targetQuantity },
          })
        : await tx.stock.create({
            data: {
              organizationId,
              productId,
              siteId,
              locationId: requestedLocation?.id ?? null,
              quantity: targetQuantity,
            },
          });
      const reason = dto.reason?.trim() || 'Correction manuelle depuis la fiche produit';
      const movement = await tx.stockMovement.create({
        data: {
          organizationId,
          productId,
          variantId: adjustedStock.variantId,
          lotId: adjustedStock.lotId,
          type: StockMovementType.INVENTORY,
          quantity: delta,
          inputQuantity: targetQuantity,
          unitId: product.unitId,
          unitSymbolSnapshot: product.unit.symbol,
          reason,
          sourceSiteId: delta.isNegative() ? siteId : null,
          sourceLocationId: delta.isNegative() ? adjustedStock.locationId : null,
          destinationSiteId: delta.isPositive() ? siteId : null,
          destinationLocationId: delta.isPositive() ? adjustedStock.locationId : null,
          movementDate: new Date(),
          createdById: actor.id,
          sourceEntityType: 'ProductStockManualAdjustment',
          sourceEntityId: adjustedStock.id,
        },
        include: {
          product: { include: { unit: true } },
          sourceSite: true,
          sourceLocation: true,
          destinationSite: true,
          destinationLocation: true,
        },
      });
      await this.audit(
        tx,
        organizationId,
        actor.id,
        AuditAction.MOVEMENT_CREATED,
        'StockMovement',
        movement.id,
        product.name,
        {
          type: StockMovementType.INVENTORY,
          source: 'product-detail-manual-adjustment',
          stockId: adjustedStock.id,
          previousQuantity: previousQuantity.toString(),
          targetQuantity: targetQuantity.toString(),
          delta: delta.toString(),
        },
      );
      return movement;
    });
  }
  archiveProduct(organizationId: string, actor: Actor, id: string) {
    return this.archive(
      'product',
      organizationId,
      actor,
      id,
      AuditAction.PRODUCT_ARCHIVED,
      'Product',
    );
  }

  listSites(organizationId: string, q: ListQueryDto = {}) {
    return this.prisma.site.findMany({
      where: {
        organizationId,
        ...(q.includeArchived ? {} : { isArchived: false }),
        name: q.search ? { contains: q.search, mode: 'insensitive' } : undefined,
      },
      include: { locations: true },
      orderBy: { name: 'asc' },
      ...this.page(q),
    });
  }
  async createSite(organizationId: string, actor: Actor, dto: UpsertSiteDto) {
    this.assertWrite(actor);
    const item = await this.prisma.site.create({ data: { ...dto, organizationId } });
    await this.log(organizationId, actor.id, AuditAction.SITE_CREATED, 'Site', item.id, item.name);
    return item;
  }
  async updateSite(organizationId: string, actor: Actor, id: string, dto: UpsertSiteDto) {
    this.assertWrite(actor);
    const item = await this.prisma.site.update({ where: { id, organizationId }, data: dto });
    await this.log(organizationId, actor.id, AuditAction.SITE_UPDATED, 'Site', item.id, item.name);
    return item;
  }
  archiveSite(organizationId: string, actor: Actor, id: string) {
    return this.archive('site', organizationId, actor, id, AuditAction.SITE_ARCHIVED, 'Site');
  }

  listLocations(organizationId: string, q: ListQueryDto = {}) {
    return this.prisma.location.findMany({
      where: {
        organizationId,
        ...(q.includeArchived ? {} : { isArchived: false }),
        name: q.search ? { contains: q.search, mode: 'insensitive' } : undefined,
      },
      include: { site: true },
      orderBy: [{ site: { name: 'asc' } }, { name: 'asc' }],
      ...this.page(q),
    });
  }
  async createLocation(organizationId: string, actor: Actor, dto: UpsertLocationDto) {
    this.assertWrite(actor);
    await this.ensureSite(organizationId, dto.siteId);
    const item = await this.prisma.location.create({ data: { ...dto, organizationId } });
    await this.log(
      organizationId,
      actor.id,
      AuditAction.LOCATION_CREATED,
      'Location',
      item.id,
      item.name,
    );
    return item;
  }
  async updateLocation(organizationId: string, actor: Actor, id: string, dto: UpsertLocationDto) {
    this.assertWrite(actor);
    const item = await this.prisma.location.update({ where: { id, organizationId }, data: dto });
    await this.log(
      organizationId,
      actor.id,
      AuditAction.LOCATION_UPDATED,
      'Location',
      item.id,
      item.name,
    );
    return item;
  }
  archiveLocation(organizationId: string, actor: Actor, id: string) {
    return this.archive(
      'location',
      organizationId,
      actor,
      id,
      AuditAction.LOCATION_ARCHIVED,
      'Location',
    );
  }

  listLots(organizationId: string, q: ListQueryDto = {}) {
    return this.prisma.lot.findMany({
      where: {
        organizationId,
        product: { kind: { in: STOCK_CATALOG_PRODUCT_KINDS } },
        OR: q.search
          ? [
              { lotNumber: { contains: q.search, mode: 'insensitive' } },
              { product: { name: { contains: q.search, mode: 'insensitive' } } },
            ]
          : undefined,
      },
      include: {
        product: { include: { unit: true } },
        supplier: true,
        site: true,
        location: true,
        stocks: true,
      },
      orderBy: [{ expiresAt: 'asc' }, { receivedAt: 'desc' }],
      ...this.page(q),
    });
  }
  async createLot(organizationId: string, actor: Actor, dto: UpsertLotDto) {
    this.assertWrite(actor);
    await this.ensureProduct(organizationId, dto.productId, false);
    const item = await this.prisma.lot.create({
      data: {
        ...dto,
        organizationId,
        receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : undefined,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
      include: { product: true, supplier: true, site: true, location: true },
    });
    await this.log(
      organizationId,
      actor.id,
      AuditAction.LOT_CREATED,
      'Lot',
      item.id,
      item.lotNumber,
    );
    return item;
  }

  async listStocks(organizationId: string, q: ListQueryDto = {}) {
    const kinds = q.kind ? [q.kind] : STOCK_CATALOG_PRODUCT_KINDS;
    const stocks = await this.prisma.stock.findMany({
      where: {
        organizationId,
        product: { kind: { in: kinds } },
        OR: q.search
          ? [
              { product: { name: { contains: q.search, mode: 'insensitive' } } },
              { product: { category: { name: { contains: q.search, mode: 'insensitive' } } } },
              { lot: { lotNumber: { contains: q.search, mode: 'insensitive' } } },
              { site: { name: { contains: q.search, mode: 'insensitive' } } },
              { location: { name: { contains: q.search, mode: 'insensitive' } } },
            ]
          : undefined,
      },
      include: {
        product: { include: { unit: true, category: true, equipmentProfile: true } },
        lot: true,
        site: true,
        location: true,
      },
      orderBy: [{ product: { name: 'asc' } }],
      ...this.page(q),
    });
    return stocks.map((s) => ({
      ...s,
      stockValue: s.quantity.mul(s.product.averagePrice),
      status: this.stockStatus(s.quantity, s.product.minimumStock),
    }));
  }

  listMovements(organizationId: string, q: ListQueryDto = {}) {
    const kinds = q.kind ? [q.kind] : STOCK_CATALOG_PRODUCT_KINDS;
    return this.prisma.stockMovement.findMany({
      where: {
        organizationId,
        product: { kind: { in: kinds } },
        OR: q.search
          ? [
              { product: { name: { contains: q.search, mode: 'insensitive' } } },
              { reason: { contains: q.search, mode: 'insensitive' } },
              { createdBy: { email: { contains: q.search, mode: 'insensitive' } } },
            ]
          : undefined,
      },
      include: {
        product: { include: { unit: true, equipmentProfile: true } },
        lot: true,
        supplier: true,
        sourceSite: true,
        sourceLocation: true,
        destinationSite: true,
        destinationLocation: true,
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: [{ movementDate: 'desc' }, { createdAt: 'desc' }],
      ...this.page(q),
    });
  }

  async createMovement(organizationId: string, actor: Actor, dto: CreateStockMovementDto) {
    this.assertWrite(actor);
    const product = await this.ensureProduct(organizationId, dto.productId, true);
    const inputUnit = dto.unitId ? await this.ensureUnit(organizationId, dto.unitId) : product.unit;
    const [sourceLocation, destinationLocation] = await Promise.all([
      dto.sourceLocationId
        ? this.prisma.location.findFirst({
            where: { id: dto.sourceLocationId, organizationId, isArchived: false },
            select: { siteId: true },
          })
        : null,
      dto.destinationLocationId
        ? this.prisma.location.findFirst({
            where: { id: dto.destinationLocationId, organizationId, isArchived: false },
            select: { siteId: true },
          })
        : null,
    ]);
    if (dto.sourceLocationId && !sourceLocation)
      throw new NotFoundException('Emplacement source introuvable');
    if (dto.destinationLocationId && !destinationLocation)
      throw new NotFoundException('Emplacement destination introuvable');
    if (dto.sourceSiteId && sourceLocation?.siteId && dto.sourceSiteId !== sourceLocation.siteId)
      throw new BadRequestException('L’emplacement source ne correspond pas au site source.');
    if (
      dto.destinationSiteId &&
      destinationLocation?.siteId &&
      dto.destinationSiteId !== destinationLocation.siteId
    )
      throw new BadRequestException(
        'L’emplacement de destination ne correspond pas au site de destination.',
      );
    let sourceSiteId = dto.sourceSiteId ?? sourceLocation?.siteId;
    let destinationSiteId = dto.destinationSiteId ?? destinationLocation?.siteId;
    if (dto.type === StockMovementType.TRANSFER) {
      sourceSiteId = (await this.resolveOperationalSite(organizationId, sourceSiteId)).id;
      destinationSiteId = (await this.resolveOperationalSite(organizationId, destinationSiteId)).id;
    } else if (NEGATIVE_TYPES.has(dto.type)) {
      sourceSiteId = (await this.resolveOperationalSite(organizationId, sourceSiteId)).id;
    } else {
      destinationSiteId = (
        await this.resolveOperationalSite(organizationId, destinationSiteId ?? sourceSiteId)
      ).id;
    }
    const quantity = await this.convertToProductUnit(
      organizationId,
      inputUnit.id,
      product.unitId,
      dto.quantity,
    );
    const date = dto.movementDate ? new Date(dto.movementDate) : new Date();
    return this.prisma.$transaction(async (tx) => {
      const affectedSiteIds = [
        ...new Set([sourceSiteId, destinationSiteId].filter(Boolean)),
      ] as string[];
      await tx.productSite.createMany({
        data: affectedSiteIds.map((siteId) => ({
          organizationId,
          productId: product.id,
          siteId,
          minimumStock: product.minimumStock,
        })),
        skipDuplicates: true,
      });
      await tx.productSite.updateMany({
        where: { organizationId, productId: product.id, siteId: { in: affectedSiteIds } },
        data: { isActive: true },
      });
      if (dto.type === StockMovementType.TRANSFER) {
        if (!sourceSiteId && !dto.sourceLocationId)
          throw new BadRequestException('Transfer source is required');
        if (!destinationSiteId && !dto.destinationLocationId)
          throw new BadRequestException('Transfer destination is required');
        await this.applyStock(
          tx,
          organizationId,
          product.id,
          dto.lotId,
          sourceSiteId,
          dto.sourceLocationId,
          quantity.neg(),
        );
        await this.applyStock(
          tx,
          organizationId,
          product.id,
          dto.lotId,
          destinationSiteId,
          dto.destinationLocationId,
          quantity,
        );
      } else {
        const signed = this.signedQuantity(dto.type, quantity);
        const targetSite = signed.isNegative() ? sourceSiteId : (destinationSiteId ?? sourceSiteId);
        const targetLocation = signed.isNegative()
          ? dto.sourceLocationId
          : (dto.destinationLocationId ?? dto.sourceLocationId);
        await this.applyStock(
          tx,
          organizationId,
          product.id,
          dto.lotId,
          targetSite,
          targetLocation,
          signed,
        );
        if (dto.type === StockMovementType.RECEPTION && dto.supplierId)
          await this.recalculateAveragePrice(tx, product, signed);
      }
      const movement = await tx.stockMovement.create({
        data: {
          organizationId,
          productId: product.id,
          lotId: dto.lotId,
          supplierId: dto.supplierId,
          type: dto.type,
          quantity:
            dto.type === StockMovementType.TRANSFER
              ? quantity
              : this.signedQuantity(dto.type, quantity),
          inputQuantity: dto.quantity,
          unitId: inputUnit.id,
          unitSymbolSnapshot: inputUnit.symbol,
          reason: dto.reason,
          sourceSiteId,
          sourceLocationId: dto.sourceLocationId,
          destinationSiteId,
          destinationLocationId: dto.destinationLocationId,
          movementDate: date,
          createdById: actor.id,
        },
        include: { product: { include: { unit: true } }, lot: true, supplier: true },
      });
      await this.audit(
        tx,
        organizationId,
        actor.id,
        dto.type === StockMovementType.TRANSFER
          ? AuditAction.TRANSFER_CREATED
          : AuditAction.MOVEMENT_CREATED,
        'StockMovement',
        movement.id,
        product.name,
        { type: dto.type },
      );
      return movement;
    });
  }

  /** Used by reviewed Assistant Stock counts; the caller supplies the signed delta. */
  async createAssistantInventoryAdjustment(
    organizationId: string,
    actor: Actor,
    input: {
      productId: string;
      unitId: string;
      quantity: number;
      locationId: string;
      reason: string;
    },
  ) {
    this.assertWrite(actor);
    if (!input.quantity) throw new BadRequestException('Écart inventaire nul');
    const product = await this.ensureProduct(organizationId, input.productId, true);
    const unit = await this.ensureUnit(organizationId, input.unitId);
    const location = await this.prisma.location.findFirst({
      where: { id: input.locationId, organizationId },
      include: { site: true },
    });
    if (!location) throw new BadRequestException('Emplacement invalide');
    const absolute = await this.convertToProductUnit(
      organizationId,
      unit.id,
      product.unitId,
      Math.abs(input.quantity),
    );
    const delta = input.quantity < 0 ? absolute.neg() : absolute;
    return this.prisma.$transaction(async (tx) => {
      await this.applyStock(
        tx,
        organizationId,
        product.id,
        null,
        location.siteId,
        location.id,
        delta,
      );
      const movement = await tx.stockMovement.create({
        data: {
          organizationId,
          productId: product.id,
          type: StockMovementType.INVENTORY,
          quantity: delta,
          inputQuantity: absolute,
          unitId: unit.id,
          unitSymbolSnapshot: unit.symbol,
          reason: input.reason,
          destinationSiteId: location.siteId,
          destinationLocationId: location.id,
          createdById: actor.id,
        },
      });
      await this.audit(
        tx,
        organizationId,
        actor.id,
        AuditAction.MOVEMENT_CREATED,
        'StockMovement',
        movement.id,
        product.name,
        { type: StockMovementType.INVENTORY, assistant: true },
      );
      return movement;
    });
  }

  async dashboard(organizationId: string) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const [productCount, supplierCount, stockRows, movementsThisMonth, latestMovements, consumed] =
      await Promise.all([
        this.prisma.product.count({
          where: { organizationId, isArchived: false, kind: { in: STOCK_CATALOG_PRODUCT_KINDS } },
        }),
        this.prisma.supplier.count({ where: { organizationId, isArchived: false } }),
        this.prisma.stock.findMany({
          where: { organizationId, product: { kind: { in: STOCK_CATALOG_PRODUCT_KINDS } } },
          include: { product: true },
        }),
        this.prisma.stockMovement.count({
          where: {
            organizationId,
            product: { kind: { in: STOCK_CATALOG_PRODUCT_KINDS } },
            createdAt: { gte: monthStart },
          },
        }),
        this.listMovements(organizationId, { pageSize: 10 }),
        this.prisma.stockMovement.groupBy({
          by: ['productId'],
          where: {
            organizationId,
            product: { kind: { in: STOCK_CATALOG_PRODUCT_KINDS } },
            type: { in: CONSUMPTION_TYPES },
            quantity: { lt: 0 },
          },
          _sum: { quantity: true },
          orderBy: { _sum: { quantity: 'asc' } },
          take: 10,
        }),
      ]);
    const products = await this.prisma.product.findMany({
      where: { id: { in: consumed.map((c) => c.productId) } },
      include: { unit: true },
    });
    return {
      productCount,
      supplierCount,
      stockValue: stockRows.reduce(
        (sum, s) => sum + Number(s.quantity.mul(s.product.averagePrice)),
        0,
      ),
      movementsThisMonth,
      latestMovements,
      topConsumedProducts: consumed.map((c) => ({
        product: products.find((p) => p.id === c.productId),
        quantity: Math.abs(Number(c._sum.quantity ?? 0)),
      })),
    };
  }

  async createInventory(organizationId: string, actor: Actor, dto: CreateInventoryDto) {
    this.assertWrite(actor);
    const site = await this.resolveOperationalSite(organizationId, dto.siteId);
    if (dto.locationId) {
      const location = await this.prisma.location.findFirst({
        where: {
          id: dto.locationId,
          organizationId,
          siteId: site.id,
          isArchived: false,
        },
        select: { id: true },
      });
      if (!location)
        throw new BadRequestException('L’emplacement ne correspond pas au site sélectionné.');
    }
    return this.prisma.$transaction(async (tx) => {
      const inv = await tx.inventory.create({
        data: {
          organizationId,
          name: dto.name,
          comment: dto.comment,
          siteId: site.id,
          locationId: dto.locationId,
          inventoryDate: dto.inventoryDate ? new Date(dto.inventoryDate) : new Date(),
          createdById: actor.id,
        },
      });
      const products = await tx.product.findMany({
        where: {
          organizationId,
          isArchived: false,
          kind: { in: STOCK_CATALOG_PRODUCT_KINDS },
          siteAssignments: { some: { siteId: site.id, isActive: true } },
        },
        include: {
          stocks: { where: { organizationId, siteId: site.id, locationId: dto.locationId } },
        },
      });
      await tx.inventoryLine.createMany({
        data: products.map((p) => ({
          inventoryId: inv.id,
          productId: p.id,
          theoreticalQuantity: p.stocks.reduce(
            (sum, s) => sum.add(s.quantity),
            new Prisma.Decimal(0),
          ),
        })),
      });
      await this.audit(
        tx,
        organizationId,
        actor.id,
        AuditAction.INVENTORY_CREATED,
        'Inventory',
        inv.id,
        inv.name,
      );
      return tx.inventory.findUnique({
        where: { id: inv.id },
        include: {
          lines: { include: { product: { include: { unit: true } } } },
          site: true,
          location: true,
        },
      });
    });
  }

  listInventories(organizationId: string, q: ListQueryDto = {}) {
    return this.prisma.inventory.findMany({
      where: {
        organizationId,
        name: q.search ? { contains: q.search, mode: 'insensitive' } : undefined,
      },
      include: {
        lines: {
          where: { product: { kind: { in: STOCK_CATALOG_PRODUCT_KINDS } } },
          include: { product: { include: { unit: true, category: true, primarySupplier: true } } },
        },
        site: true,
        location: true,
        createdBy: { select: { email: true, firstName: true, lastName: true } },
      },
      orderBy: { inventoryDate: 'desc' },
      ...this.page(q),
    });
  }

  async updateInventoryCounts(
    organizationId: string,
    actor: Actor,
    id: string,
    dto: UpdateInventoryCountsDto,
  ) {
    this.assertWrite(actor);
    const inv = await this.prisma.inventory.findFirst({ where: { id, organizationId } });
    if (!inv) throw new NotFoundException('Inventory not found');
    if (inv.status === InventoryStatus.VALIDATED)
      throw new BadRequestException('Validated inventory is locked');
    await this.prisma.$transaction(async (tx) => {
      for (const l of dto.lines) {
        const line = await tx.inventoryLine.findFirst({
          where: { inventoryId: id, productId: l.productId, lotId: l.lotId ?? null },
        });
        if (!line) continue;
        const counted = new Prisma.Decimal(l.countedQuantity);
        await tx.inventoryLine.update({
          where: { id: line.id },
          data: {
            countedQuantity: counted,
            varianceQuantity: counted.sub(line.theoreticalQuantity),
          },
        });
      }
    });
    return this.prisma.inventory.findUnique({ where: { id }, include: { lines: true } });
  }

  async validateInventory(organizationId: string, actor: Actor, id: string) {
    this.assertManager(actor);
    const inv = await this.prisma.inventory.findFirst({
      where: { id, organizationId },
      include: { lines: true },
    });
    if (!inv) throw new NotFoundException('Inventory not found');
    if (inv.status === InventoryStatus.VALIDATED)
      throw new BadRequestException('Inventory already validated');
    return this.prisma.$transaction(async (tx) => {
      for (const line of inv.lines) {
        if (line.countedQuantity == null) continue;
        const variance = line.countedQuantity.sub(line.theoreticalQuantity);
        await tx.inventoryLine.update({
          where: { id: line.id },
          data: { varianceQuantity: variance },
        });
        if (!variance.isZero()) {
          await this.applyStock(
            tx,
            organizationId,
            line.productId,
            line.lotId,
            inv.siteId,
            inv.locationId,
            variance,
          );
          await tx.stockMovement.create({
            data: {
              organizationId,
              productId: line.productId,
              lotId: line.lotId,
              type: StockMovementType.INVENTORY,
              quantity: variance,
              inputQuantity: variance.abs(),
              reason: 'Correction inventaire',
              sourceSiteId: variance.isNegative() ? inv.siteId : null,
              sourceLocationId: variance.isNegative() ? inv.locationId : null,
              destinationSiteId: variance.isPositive() ? inv.siteId : null,
              destinationLocationId: variance.isPositive() ? inv.locationId : null,
              movementDate: inv.inventoryDate,
              createdById: actor.id,
              inventoryId: inv.id,
            },
          });
        }
      }
      const updated = await tx.inventory.update({
        where: { id },
        data: { status: InventoryStatus.VALIDATED, validatedAt: new Date() },
        include: { lines: true },
      });
      await this.audit(
        tx,
        organizationId,
        actor.id,
        AuditAction.INVENTORY_VALIDATED,
        'Inventory',
        id,
        inv.name,
      );
      return updated;
    });
  }

  listAudit(organizationId: string, q: ListQueryDto = {}) {
    return this.prisma.auditLog.findMany({
      where: {
        organizationId,
        OR: q.search
          ? [
              { entityName: { contains: q.search, mode: 'insensitive' } },
              { entityType: { contains: q.search, mode: 'insensitive' } },
            ]
          : undefined,
      },
      include: { user: { select: { email: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      ...this.page(q),
    });
  }
  async auditCsv(organizationId: string) {
    const rows = await this.listAudit(organizationId, { pageSize: 1000 });
    return [
      'date,user,action,entityType,entityName',
      ...rows.map((r) =>
        [r.createdAt.toISOString(), r.user?.email ?? '', r.action, r.entityType, r.entityName ?? '']
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(','),
      ),
    ].join('\n');
  }

  async recalculateTechnicalSheetsForProductTx(
    tx: Tx,
    organizationId: string,
    productId: string,
    userId: string | null,
  ) {
    const links = await tx.technicalSheetIngredient.findMany({
      where: { organizationId, productId },
      select: { technicalSheetId: true },
      distinct: ['technicalSheetId'],
    });
    for (const link of links)
      await this.recalculateTechnicalSheetCost(
        tx,
        organizationId,
        link.technicalSheetId,
        userId,
        productId,
      );
  }

  private async recalculateTechnicalSheetCost(
    tx: Tx,
    organizationId: string,
    technicalSheetId: string,
    userId: string | null,
    triggerProductId: string,
  ) {
    const recipe = await tx.technicalSheet.findUnique({
      where: { id: technicalSheetId },
      include: { ingredients: { include: { product: true, unit: true } } },
    });
    if (!recipe) return;
    let total = new Prisma.Decimal(0);
    let hasNonCalculable = false;
    for (const line of recipe.ingredients) {
      const calc = await this.calculateTechnicalSheetLineCost(tx, organizationId, line);
      hasNonCalculable ||= !calc.isCalculable;
      if (calc.cost) total = total.add(calc.cost);
      await tx.technicalSheetIngredient.update({
        where: { id: line.id },
        data: {
          cost: calc.cost,
          unitPriceSnapshot: line.product.averagePrice,
          isCalculable: calc.isCalculable,
          nonCalculableReason: calc.reason,
          productArchivedSnapshot: line.product.isArchived,
        },
      });
    }
    const costPerPortion = recipe.referencePortions.isZero()
      ? new Prisma.Decimal(0)
      : total.div(recipe.referencePortions);
    await tx.technicalSheet.update({
      where: { id: recipe.id },
      data: {
        totalCost: total,
        costPerPortion,
        hasNonCalculableLines: hasNonCalculable,
        lastCostCalculationAt: new Date(),
      },
    });
    await tx.technicalSheetHistory.create({
      data: {
        organizationId,
        technicalSheetId: recipe.id,
        userId,
        action: TechnicalSheetHistoryAction.COST_RECALCULATED,
        summary: 'Recalcul automatique après modification du prix produit Stocks',
        details: {
          source: 'stocks-product-price-update',
          productId: triggerProductId,
          totalCost: total.toString(),
          hasNonCalculableLines: hasNonCalculable,
        },
      },
    });
  }

  private async calculateTechnicalSheetLineCost(tx: Tx, organizationId: string, line: any) {
    if (line.product.isArchived)
      return { isCalculable: false, cost: null, reason: 'Produit Stocks archivé' };
    let quantity = new Prisma.Decimal(line.quantity);
    if (line.unitId !== line.product.unitId) {
      const conversion = await tx.unitConversion.findFirst({
        where: { organizationId, fromUnitId: line.unitId, toUnitId: line.product.unitId },
      });
      if (!conversion)
        return {
          isCalculable: false,
          cost: null,
          reason: 'Conversion unité indisponible dans Stocks',
        };
      quantity = quantity.mul(conversion.factor);
    }
    return { isCalculable: true, cost: quantity.mul(line.product.averagePrice), reason: null };
  }

  private async applyStock(
    tx: Tx,
    organizationId: string,
    productId: string,
    lotId: string | undefined | null,
    siteId: string | undefined | null,
    locationId: string | undefined | null,
    delta: Prisma.Decimal,
  ) {
    const existing = await tx.stock.findFirst({
      where: {
        organizationId,
        productId,
        lotId: lotId ?? null,
        siteId: siteId ?? null,
        locationId: locationId ?? null,
      },
    });
    if (existing)
      return tx.stock.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity.add(delta) },
      });
    return tx.stock.create({
      data: { organizationId, productId, lotId, siteId, locationId, quantity: delta },
    });
  }
  private signedQuantity(type: StockMovementType, q: Prisma.Decimal) {
    if (NEGATIVE_TYPES.has(type)) return q.neg();
    return q;
  }
  private stockStatus(q: Prisma.Decimal, min: Prisma.Decimal) {
    if (q.isNegative()) return 'NEGATIVE';
    if (q.isZero()) return 'OUT';
    if (q.lessThanOrEqualTo(min)) return 'LOW';
    return 'NORMAL';
  }
  private async convertToProductUnit(
    organizationId: string,
    fromUnitId: string,
    toUnitId: string,
    quantity: number,
  ) {
    if (fromUnitId === toUnitId) return new Prisma.Decimal(quantity);
    const c = await this.prisma.unitConversion.findFirst({
      where: { organizationId, fromUnitId, toUnitId },
    });
    if (!c) throw new BadRequestException('Incompatible unit conversion');
    return new Prisma.Decimal(quantity).mul(c.factor);
  }
  private async recalculateAveragePrice(
    _tx: Tx,
    _product: { id: string; averagePrice: Prisma.Decimal },
    _receivedQty: Prisma.Decimal,
  ) {
    /* V1 stores weighted average field; purchase price capture can refine this later. */
  }
  private async log(
    organizationId: string,
    userId: string | null,
    action: AuditAction,
    entityType: string,
    entityId: string,
    entityName: string,
  ) {
    await this.prisma.auditLog.create({
      data: { organizationId, userId: userId || null, action, entityType, entityId, entityName },
    });
  }
  private async createAudited(
    model: 'category',
    organizationId: string,
    userId: string | null,
    action: AuditAction,
    dto: UpsertCategoryDto,
  ) {
    const item = await this.prisma.category.create({ data: { ...dto, organizationId } });
    await this.log(organizationId, userId, action, 'Category', item.id, item.name);
    return item;
  }
  private ensureUncategorizedCategory(
    tx: Tx,
    organizationId: string,
    kind: ProductKind = ProductKind.UNSPECIFIED,
  ) {
    return tx.category.upsert({
      where: {
        organizationId_name_kind: { organizationId, name: UNCATEGORIZED_CATEGORY_NAME, kind },
      },
      update: { isArchived: false, archivedAt: null },
      create: {
        organizationId,
        name: UNCATEGORIZED_CATEGORY_NAME,
        kind,
        description:
          kind === ProductKind.EQUIPMENT
            ? 'Matériel sans famille attribuée.'
            : 'Produits sans famille attribuée.',
      },
    });
  }
  private categoryKey(name: string) {
    return name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }
  private isUncategorizedCategoryName(name: string) {
    return this.categoryKey(name) === this.categoryKey(UNCATEGORIZED_CATEGORY_NAME);
  }
  private sortCategoriesWithUncategorizedLast<T extends { name: string }>(categories: T[]) {
    return [...categories].sort((a, b) => {
      const aIsUncategorized = this.isUncategorizedCategoryName(a.name);
      const bIsUncategorized = this.isUncategorizedCategoryName(b.name);
      if (aIsUncategorized === bIsUncategorized) return 0;
      return aIsUncategorized ? 1 : -1;
    });
  }
  private async archive(
    model: 'category' | 'unit' | 'supplier' | 'product' | 'site' | 'location',
    organizationId: string,
    actor: Actor,
    id: string,
    action: AuditAction,
    entityType: string,
  ) {
    this.assertWrite(actor);
    const delegate = this.prisma[model] as any;
    const item = await delegate.update({
      where: { id, organizationId },
      data: { isArchived: true, archivedAt: new Date() },
    });
    await this.log(organizationId, actor.id, action, entityType, item.id, item.name);
    return item;
  }
  private async ensureCategory(organizationId: string, id: string, productKind: ProductKind) {
    const item = await this.prisma.category.findFirst({ where: { id, organizationId } });
    if (!item) throw new NotFoundException('Category not found');
    const expectsEquipment = productKind === ProductKind.EQUIPMENT;
    if ((item.kind === ProductKind.EQUIPMENT) !== expectsEquipment) {
      throw new BadRequestException(
        expectsEquipment
          ? 'Cette catégorie n’est pas destinée au matériel.'
          : 'Cette catégorie est réservée au matériel.',
      );
    }
    return item;
  }
  private async ensureUnit(organizationId: string, id: string) {
    const item = await this.prisma.unit.findFirst({ where: { id, organizationId } });
    if (!item) throw new NotFoundException('Unit not found');
    return item;
  }
  private async ensureSupplier(organizationId: string, id: string) {
    const item = await this.prisma.supplier.findFirst({ where: { id, organizationId } });
    if (!item) throw new NotFoundException('Supplier not found');
    return item;
  }
  private async resolveOperationalSite(organizationId: string, requestedSiteId?: string | null) {
    const sites = await this.prisma.site.findMany({
      where: { organizationId, isArchived: false },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    if (!sites.length) throw new BadRequestException('Aucun site actif n’est configuré.');
    if (requestedSiteId) {
      const selected = sites.find((site) => site.id === requestedSiteId);
      if (!selected) throw new BadRequestException('Le site sélectionné est invalide ou archivé.');
      return selected;
    }
    if (sites.length === 1) return sites[0];
    throw new BadRequestException(
      'Plusieurs sites sont actifs. Sélectionnez le site concerné avant de continuer.',
    );
  }
  private async ensureSite(organizationId: string, id: string) {
    const item = await this.prisma.site.findFirst({
      where: { id, organizationId, isArchived: false },
    });
    if (!item) throw new NotFoundException('Site not found');
    return item;
  }
  private async ensureProduct(organizationId: string, id: string, activeOnly: boolean) {
    const item = await this.prisma.product.findFirst({
      where: {
        id,
        organizationId,
        kind: { in: STOCK_MANAGED_PRODUCT_KINDS },
        ...(activeOnly ? { isArchived: false } : {}),
      },
      include: { unit: true },
    });
    if (!item) throw new NotFoundException('Produit Stocks introuvable');
    return item;
  }
}
