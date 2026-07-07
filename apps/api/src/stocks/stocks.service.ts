import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, InventoryStatus, Prisma, StockMovementType, UnitType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { CreateInventoryDto, UpdateInventoryCountsDto } from './dto/inventory.dto';
import {
  ListQueryDto,
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
const NEGATIVE_TYPES = new Set<StockMovementType>([StockMovementType.OUT, StockMovementType.LOSS]);
const CONSUMPTION_TYPES = [StockMovementType.OUT, StockMovementType.PRODUCTION, StockMovementType.LOSS, StockMovementType.CORRECTION, StockMovementType.INVENTORY];
const UNCATEGORIZED_CATEGORY_NAME = 'Sans catégorie';
const DEFAULT_STOCK_CATEGORIES = ['Épicerie', 'Produits frais', 'Surgelés', 'Boissons', 'Viandes', 'Poissons', 'Produits laitiers', 'Fruits et légumes', 'Sans catégorie'];

type Actor = { id: string; role: string };
type Tx = Prisma.TransactionClient;

@Injectable()
export class StocksService {
  constructor(private readonly prisma: PrismaService) {}

  private assertWrite(actor: Actor) {
    if (!WRITE_ROLES.includes(actor.role)) throw new ForbiddenException('Insufficient stock permissions');
  }

  private assertManager(actor: Actor) {
    if (!ADMIN_MANAGER_ROLES.includes(actor.role)) throw new ForbiddenException('Manager permissions required');
  }

  private page(q?: ListQueryDto) {
    const take = Math.min(q?.pageSize ?? 50, 200);
    const skip = ((q?.page ?? 1) - 1) * take;
    return { take, skip };
  }

  private async audit(tx: Tx, organizationId: string, userId: string | null, action: AuditAction, entityType: string, entityId?: string | null, entityName?: string | null, details?: Prisma.InputJsonValue) {
    await tx.auditLog.create({ data: { organizationId, userId, action, entityType, entityId, entityName, details } });
  }

  async installDefaults(organizationId: string, actor: Actor) {
    this.assertManager(actor);
    return this.prisma.$transaction(async (tx) => {
      await tx.organization.update({ where: { id: organizationId }, data: { stocksInstalledAt: new Date() } });
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
      const site = await tx.site.upsert({ where: { organizationId_name: { organizationId, name: 'Site principal' } }, update: {}, create: { organizationId, name: 'Site principal' } });
      await tx.location.createMany({
        data: ['Réserve sèche', 'Chambre froide positive', 'Chambre froide négative', 'Congélateur', 'Cuisine', 'Zone de production', 'Quai de réception'].map((name) => ({ organizationId, siteId: site.id, name })),
        skipDuplicates: true,
      });
      await this.seedConversions(tx, organizationId);
      await this.audit(tx, organizationId, actor.id, AuditAction.MODULE_STOCKS_INSTALLED, 'Module', 'stocks', 'Stocks');
      return { installed: true };
    });
  }

  async uninstallFromInterface(organizationId: string, actor: Actor) {
    this.assertManager(actor);
    return this.prisma.$transaction(async (tx) => {
      await tx.organization.update({ where: { id: organizationId }, data: { stocksInstalledAt: null } });
      await this.audit(tx, organizationId, actor.id, AuditAction.MODULE_STOCKS_UNINSTALLED, 'Module', 'stocks', 'Stocks');
      return { installed: false };
    });
  }

  private async seedConversions(tx: Tx, organizationId: string) {
    const units = await tx.unit.findMany({ where: { organizationId } });
    const bySymbol = Object.fromEntries(units.map((u) => [u.symbol, u]));
    const pairs: Array<[string, string, string]> = [['kg', 'g', '1000'], ['g', 'kg', '0.001'], ['L', 'mL', '1000'], ['mL', 'L', '0.001']];
    for (const [from, to, factor] of pairs) {
      if (bySymbol[from] && bySymbol[to]) {
        await tx.unitConversion.upsert({
          where: { organizationId_fromUnitId_toUnitId: { organizationId, fromUnitId: bySymbol[from].id, toUnitId: bySymbol[to].id } },
          update: { factor },
          create: { organizationId, fromUnitId: bySymbol[from].id, toUnitId: bySymbol[to].id, factor },
        });
      }
    }
  }

  async listCategories(organizationId: string, q: ListQueryDto = {}) {
    const categories = await this.prisma.category.findMany({ where: { organizationId, ...(q.includeArchived ? {} : { isArchived: false }), name: q.search ? { contains: q.search, mode: 'insensitive' } : undefined }, orderBy: { name: 'asc' }, ...this.page(q) });
    return this.sortCategoriesWithUncategorizedLast(categories);
  }
  async createCategory(organizationId: string, actor: Actor, dto: UpsertCategoryDto) { this.assertWrite(actor); return this.createAudited('category', organizationId, actor.id, AuditAction.CATEGORY_CREATED, dto); }
  async updateCategory(organizationId: string, actor: Actor, id: string, dto: UpsertCategoryDto) { this.assertWrite(actor); const item = await this.prisma.category.update({ where: { id, organizationId }, data: dto }); await this.log(organizationId, actor.id, AuditAction.CATEGORY_UPDATED, 'Category', item.id, item.name); return item; }
  async archiveCategory(organizationId: string, actor: Actor, id: string) {
    this.assertWrite(actor);
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.category.findFirst({ where: { id, organizationId } });
      if (!category) throw new NotFoundException('Category not found');
      if (this.categoryKey(category.name) === this.categoryKey(UNCATEGORIZED_CATEGORY_NAME)) {
        throw new BadRequestException('La catégorie Sans catégorie ne peut pas être supprimée.');
      }

      const fallback = await this.ensureUncategorizedCategory(tx, organizationId);
      const moved = await tx.product.updateMany({ where: { organizationId, categoryId: category.id }, data: { categoryId: fallback.id } });
      const item = await tx.category.update({ where: { id: category.id }, data: { isArchived: true, archivedAt: new Date() } });
      await this.audit(tx, organizationId, actor.id, AuditAction.CATEGORY_ARCHIVED, 'Category', item.id, item.name, { movedProducts: moved.count, fallbackCategoryId: fallback.id });
      return item;
    });
  }

  listUnits(organizationId: string, q: ListQueryDto = {}) { return this.prisma.unit.findMany({ where: { organizationId, ...(q.includeArchived ? {} : { isArchived: false }), OR: q.search ? [{ name: { contains: q.search, mode: 'insensitive' } }, { symbol: { contains: q.search, mode: 'insensitive' } }] : undefined }, include: { fromConversions: { include: { toUnit: true } } }, orderBy: { name: 'asc' }, ...this.page(q) }); }
  async createUnit(organizationId: string, actor: Actor, dto: UpsertUnitDto) { this.assertWrite(actor); const item = await this.prisma.unit.create({ data: { ...dto, type: dto.type ?? UnitType.OTHER, organizationId } }); await this.log(organizationId, actor.id, AuditAction.UNIT_CREATED, 'Unit', item.id, item.name); return item; }
  async updateUnit(organizationId: string, actor: Actor, id: string, dto: UpsertUnitDto) { this.assertWrite(actor); const item = await this.prisma.unit.update({ where: { id, organizationId }, data: dto }); await this.log(organizationId, actor.id, AuditAction.UNIT_UPDATED, 'Unit', item.id, item.name); return item; }
  archiveUnit(organizationId: string, actor: Actor, id: string) { return this.archive('unit', organizationId, actor, id, AuditAction.UNIT_ARCHIVED, 'Unit'); }
  async upsertConversion(organizationId: string, actor: Actor, dto: UpsertUnitConversionDto) { this.assertWrite(actor); await this.ensureUnit(organizationId, dto.fromUnitId); await this.ensureUnit(organizationId, dto.toUnitId); return this.prisma.unitConversion.upsert({ where: { organizationId_fromUnitId_toUnitId: { organizationId, fromUnitId: dto.fromUnitId, toUnitId: dto.toUnitId } }, update: { factor: dto.factor }, create: { organizationId, ...dto } }); }

  listSuppliers(organizationId: string, q: ListQueryDto = {}) { return this.prisma.supplier.findMany({ where: { organizationId, ...(q.includeArchived ? {} : { isArchived: false }), OR: q.search ? [{ name: { contains: q.search, mode: 'insensitive' } }, { contactName: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }] : undefined }, orderBy: { name: 'asc' }, ...this.page(q) }); }
  async createSupplier(organizationId: string, actor: Actor, dto: UpsertSupplierDto) { this.assertWrite(actor); const item = await this.prisma.supplier.create({ data: { ...dto, organizationId } }); await this.log(organizationId, actor.id, AuditAction.SUPPLIER_CREATED, 'Supplier', item.id, item.name); return item; }
  async updateSupplier(organizationId: string, actor: Actor, id: string, dto: UpsertSupplierDto) { this.assertWrite(actor); const item = await this.prisma.supplier.update({ where: { id, organizationId }, data: dto }); await this.log(organizationId, actor.id, AuditAction.SUPPLIER_UPDATED, 'Supplier', item.id, item.name); return item; }
  archiveSupplier(organizationId: string, actor: Actor, id: string) { return this.archive('supplier', organizationId, actor, id, AuditAction.SUPPLIER_ARCHIVED, 'Supplier'); }

  listProducts(organizationId: string, q: ListQueryDto = {}) { return this.prisma.product.findMany({ where: { organizationId, ...(q.includeArchived ? {} : { isArchived: false }), OR: q.search ? [{ name: { contains: q.search, mode: 'insensitive' } }, { sku: { contains: q.search, mode: 'insensitive' } }, { gtin: { contains: q.search, mode: 'insensitive' } }, { originCountry: { contains: q.search, mode: 'insensitive' } }, { primarySupplier: { name: { contains: q.search, mode: 'insensitive' } } }, { category: { name: { contains: q.search, mode: 'insensitive' } } }] : undefined }, include: { category: true, unit: true, primarySupplier: true, stocks: true }, orderBy: { name: 'asc' }, ...this.page(q) }); }
  async createProduct(organizationId: string, actor: Actor, dto: UpsertProductDto) { this.assertWrite(actor); await this.ensureUnit(organizationId, dto.unitId); if (dto.categoryId) await this.ensureCategory(organizationId, dto.categoryId); if (dto.primarySupplierId) await this.ensureSupplier(organizationId, dto.primarySupplierId); const item = await this.prisma.product.create({ data: { ...dto, organizationId }, include: { category: true, unit: true, primarySupplier: true, stocks: true } }); await this.log(organizationId, actor.id, AuditAction.PRODUCT_CREATED, 'Product', item.id, item.name); return item; }
  async updateProduct(organizationId: string, actor: Actor, id: string, dto: UpsertProductDto) { this.assertWrite(actor); await this.ensureProduct(organizationId, id, false); if (dto.unitId) await this.ensureUnit(organizationId, dto.unitId); if (dto.categoryId) await this.ensureCategory(organizationId, dto.categoryId); if (dto.primarySupplierId) await this.ensureSupplier(organizationId, dto.primarySupplierId); const item = await this.prisma.product.update({ where: { id, organizationId }, data: dto, include: { category: true, unit: true, primarySupplier: true, stocks: true } }); await this.log(organizationId, actor.id, AuditAction.PRODUCT_UPDATED, 'Product', item.id, item.name); return item; }
  archiveProduct(organizationId: string, actor: Actor, id: string) { return this.archive('product', organizationId, actor, id, AuditAction.PRODUCT_ARCHIVED, 'Product'); }

  listSites(organizationId: string, q: ListQueryDto = {}) { return this.prisma.site.findMany({ where: { organizationId, ...(q.includeArchived ? {} : { isArchived: false }), name: q.search ? { contains: q.search, mode: 'insensitive' } : undefined }, include: { locations: true }, orderBy: { name: 'asc' }, ...this.page(q) }); }
  async createSite(organizationId: string, actor: Actor, dto: UpsertSiteDto) { this.assertWrite(actor); const item = await this.prisma.site.create({ data: { ...dto, organizationId } }); await this.log(organizationId, actor.id, AuditAction.SITE_CREATED, 'Site', item.id, item.name); return item; }
  async updateSite(organizationId: string, actor: Actor, id: string, dto: UpsertSiteDto) { this.assertWrite(actor); const item = await this.prisma.site.update({ where: { id, organizationId }, data: dto }); await this.log(organizationId, actor.id, AuditAction.SITE_UPDATED, 'Site', item.id, item.name); return item; }
  archiveSite(organizationId: string, actor: Actor, id: string) { return this.archive('site', organizationId, actor, id, AuditAction.SITE_ARCHIVED, 'Site'); }

  listLocations(organizationId: string, q: ListQueryDto = {}) { return this.prisma.location.findMany({ where: { organizationId, ...(q.includeArchived ? {} : { isArchived: false }), name: q.search ? { contains: q.search, mode: 'insensitive' } : undefined }, include: { site: true }, orderBy: [{ site: { name: 'asc' } }, { name: 'asc' }], ...this.page(q) }); }
  async createLocation(organizationId: string, actor: Actor, dto: UpsertLocationDto) { this.assertWrite(actor); await this.ensureSite(organizationId, dto.siteId); const item = await this.prisma.location.create({ data: { ...dto, organizationId } }); await this.log(organizationId, actor.id, AuditAction.LOCATION_CREATED, 'Location', item.id, item.name); return item; }
  async updateLocation(organizationId: string, actor: Actor, id: string, dto: UpsertLocationDto) { this.assertWrite(actor); const item = await this.prisma.location.update({ where: { id, organizationId }, data: dto }); await this.log(organizationId, actor.id, AuditAction.LOCATION_UPDATED, 'Location', item.id, item.name); return item; }
  archiveLocation(organizationId: string, actor: Actor, id: string) { return this.archive('location', organizationId, actor, id, AuditAction.LOCATION_ARCHIVED, 'Location'); }

  listLots(organizationId: string, q: ListQueryDto = {}) { return this.prisma.lot.findMany({ where: { organizationId, OR: q.search ? [{ lotNumber: { contains: q.search, mode: 'insensitive' } }, { product: { name: { contains: q.search, mode: 'insensitive' } } }] : undefined }, include: { product: { include: { unit: true } }, supplier: true, site: true, location: true, stocks: true }, orderBy: [{ expiresAt: 'asc' }, { receivedAt: 'desc' }], ...this.page(q) }); }
  async createLot(organizationId: string, actor: Actor, dto: UpsertLotDto) { this.assertWrite(actor); await this.ensureProduct(organizationId, dto.productId, false); const item = await this.prisma.lot.create({ data: { ...dto, organizationId, receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : undefined, expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined }, include: { product: true, supplier: true, site: true, location: true } }); await this.log(organizationId, actor.id, AuditAction.LOT_CREATED, 'Lot', item.id, item.lotNumber); return item; }

  async listStocks(organizationId: string, q: ListQueryDto = {}) {
    const stocks = await this.prisma.stock.findMany({ where: { organizationId, OR: q.search ? [{ product: { name: { contains: q.search, mode: 'insensitive' } } }, { product: { category: { name: { contains: q.search, mode: 'insensitive' } } } }, { lot: { lotNumber: { contains: q.search, mode: 'insensitive' } } }, { site: { name: { contains: q.search, mode: 'insensitive' } } }, { location: { name: { contains: q.search, mode: 'insensitive' } } }] : undefined }, include: { product: { include: { unit: true, category: true } }, lot: true, site: true, location: true }, orderBy: [{ product: { name: 'asc' } }], ...this.page(q) });
    return stocks.map((s) => ({ ...s, stockValue: s.quantity.mul(s.product.averagePrice), status: this.stockStatus(s.quantity, s.product.minimumStock) }));
  }

  listMovements(organizationId: string, q: ListQueryDto = {}) { return this.prisma.stockMovement.findMany({ where: { organizationId, OR: q.search ? [{ product: { name: { contains: q.search, mode: 'insensitive' } } }, { reason: { contains: q.search, mode: 'insensitive' } }, { createdBy: { email: { contains: q.search, mode: 'insensitive' } } }] : undefined }, include: { product: { include: { unit: true } }, lot: true, supplier: true, sourceSite: true, sourceLocation: true, destinationSite: true, destinationLocation: true, createdBy: { select: { id: true, email: true, firstName: true, lastName: true } } }, orderBy: [{ movementDate: 'desc' }, { createdAt: 'desc' }], ...this.page(q) }); }

  async createMovement(organizationId: string, actor: Actor, dto: CreateStockMovementDto) {
    this.assertWrite(actor);
    const product = await this.ensureProduct(organizationId, dto.productId, true);
    const inputUnit = dto.unitId ? await this.ensureUnit(organizationId, dto.unitId) : product.unit;
    const quantity = await this.convertToProductUnit(organizationId, inputUnit.id, product.unitId, dto.quantity);
    const date = dto.movementDate ? new Date(dto.movementDate) : new Date();
    return this.prisma.$transaction(async (tx) => {
      if (dto.type === StockMovementType.TRANSFER) {
        if (!dto.sourceSiteId && !dto.sourceLocationId) throw new BadRequestException('Transfer source is required');
        if (!dto.destinationSiteId && !dto.destinationLocationId) throw new BadRequestException('Transfer destination is required');
        await this.applyStock(tx, organizationId, product.id, dto.lotId, dto.sourceSiteId, dto.sourceLocationId, quantity.neg());
        await this.applyStock(tx, organizationId, product.id, dto.lotId, dto.destinationSiteId, dto.destinationLocationId, quantity);
      } else {
        const signed = this.signedQuantity(dto.type, quantity);
        const targetSite = signed.isNegative() ? dto.sourceSiteId : dto.destinationSiteId ?? dto.sourceSiteId;
        const targetLocation = signed.isNegative() ? dto.sourceLocationId : dto.destinationLocationId ?? dto.sourceLocationId;
        await this.applyStock(tx, organizationId, product.id, dto.lotId, targetSite, targetLocation, signed);
        if ((dto.type === StockMovementType.RECEPTION) && dto.supplierId) await this.recalculateAveragePrice(tx, product, signed);
      }
      const movement = await tx.stockMovement.create({ data: { organizationId, productId: product.id, lotId: dto.lotId, supplierId: dto.supplierId, type: dto.type, quantity: dto.type === StockMovementType.TRANSFER ? quantity : this.signedQuantity(dto.type, quantity), inputQuantity: dto.quantity, unitId: inputUnit.id, unitSymbolSnapshot: inputUnit.symbol, reason: dto.reason, sourceSiteId: dto.sourceSiteId, sourceLocationId: dto.sourceLocationId, destinationSiteId: dto.destinationSiteId, destinationLocationId: dto.destinationLocationId, movementDate: date, createdById: actor.id }, include: { product: { include: { unit: true } }, lot: true, supplier: true } });
      await this.audit(tx, organizationId, actor.id, dto.type === StockMovementType.TRANSFER ? AuditAction.TRANSFER_CREATED : AuditAction.MOVEMENT_CREATED, 'StockMovement', movement.id, product.name, { type: dto.type });
      return movement;
    });
  }

  async dashboard(organizationId: string) {
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const [productCount, supplierCount, stockRows, movementsThisMonth, latestMovements, consumed] = await Promise.all([
      this.prisma.product.count({ where: { organizationId, isArchived: false } }),
      this.prisma.supplier.count({ where: { organizationId, isArchived: false } }),
      this.prisma.stock.findMany({ where: { organizationId }, include: { product: true } }),
      this.prisma.stockMovement.count({ where: { organizationId, createdAt: { gte: monthStart } } }),
      this.listMovements(organizationId, { pageSize: 10 }),
      this.prisma.stockMovement.groupBy({ by: ['productId'], where: { organizationId, type: { in: CONSUMPTION_TYPES }, quantity: { lt: 0 } }, _sum: { quantity: true }, orderBy: { _sum: { quantity: 'asc' } }, take: 10 }),
    ]);
    const products = await this.prisma.product.findMany({ where: { id: { in: consumed.map((c) => c.productId) } }, include: { unit: true } });
    return { productCount, supplierCount, stockValue: stockRows.reduce((sum, s) => sum + Number(s.quantity.mul(s.product.averagePrice)), 0), movementsThisMonth, latestMovements, topConsumedProducts: consumed.map((c) => ({ product: products.find((p) => p.id === c.productId), quantity: Math.abs(Number(c._sum.quantity ?? 0)) })) };
  }

  async createInventory(organizationId: string, actor: Actor, dto: CreateInventoryDto) {
    this.assertWrite(actor);
    return this.prisma.$transaction(async (tx) => {
      const inv = await tx.inventory.create({ data: { organizationId, name: dto.name, comment: dto.comment, siteId: dto.siteId, locationId: dto.locationId, inventoryDate: dto.inventoryDate ? new Date(dto.inventoryDate) : new Date(), createdById: actor.id } });
      const products = await tx.product.findMany({ where: { organizationId, isArchived: false }, include: { stocks: { where: { organizationId, siteId: dto.siteId, locationId: dto.locationId } } } });
      await tx.inventoryLine.createMany({ data: products.map((p) => ({ inventoryId: inv.id, productId: p.id, theoreticalQuantity: p.stocks.reduce((sum, s) => sum.add(s.quantity), new Prisma.Decimal(0)) })) });
      await this.audit(tx, organizationId, actor.id, AuditAction.INVENTORY_CREATED, 'Inventory', inv.id, inv.name);
      return tx.inventory.findUnique({ where: { id: inv.id }, include: { lines: { include: { product: { include: { unit: true } } } }, site: true, location: true } });
    });
  }

  listInventories(organizationId: string, q: ListQueryDto = {}) { return this.prisma.inventory.findMany({ where: { organizationId, name: q.search ? { contains: q.search, mode: 'insensitive' } : undefined }, include: { lines: { include: { product: { include: { unit: true, category: true, primarySupplier: true } } } }, site: true, location: true, createdBy: { select: { email: true, firstName: true, lastName: true } } }, orderBy: { inventoryDate: 'desc' }, ...this.page(q) }); }

  async updateInventoryCounts(organizationId: string, actor: Actor, id: string, dto: UpdateInventoryCountsDto) {
    this.assertWrite(actor);
    const inv = await this.prisma.inventory.findFirst({ where: { id, organizationId } });
    if (!inv) throw new NotFoundException('Inventory not found');
    if (inv.status === InventoryStatus.VALIDATED) throw new BadRequestException('Validated inventory is locked');
    await this.prisma.$transaction(async (tx) => {
      for (const l of dto.lines) {
        const line = await tx.inventoryLine.findFirst({ where: { inventoryId: id, productId: l.productId, lotId: l.lotId ?? null } });
        if (!line) continue;
        const counted = new Prisma.Decimal(l.countedQuantity);
        await tx.inventoryLine.update({ where: { id: line.id }, data: { countedQuantity: counted, varianceQuantity: counted.sub(line.theoreticalQuantity) } });
      }
    });
    return this.prisma.inventory.findUnique({ where: { id }, include: { lines: true } });
  }

  async validateInventory(organizationId: string, actor: Actor, id: string) {
    this.assertManager(actor);
    const inv = await this.prisma.inventory.findFirst({ where: { id, organizationId }, include: { lines: true } });
    if (!inv) throw new NotFoundException('Inventory not found');
    if (inv.status === InventoryStatus.VALIDATED) throw new BadRequestException('Inventory already validated');
    return this.prisma.$transaction(async (tx) => {
      for (const line of inv.lines) {
        if (line.countedQuantity == null) continue;
        const variance = line.countedQuantity.sub(line.theoreticalQuantity);
        await tx.inventoryLine.update({ where: { id: line.id }, data: { varianceQuantity: variance } });
        if (!variance.isZero()) {
          await this.applyStock(tx, organizationId, line.productId, line.lotId, inv.siteId, inv.locationId, variance);
          await tx.stockMovement.create({ data: { organizationId, productId: line.productId, lotId: line.lotId, type: StockMovementType.INVENTORY, quantity: variance, inputQuantity: variance.abs(), reason: 'Correction inventaire', sourceSiteId: inv.siteId, sourceLocationId: inv.locationId, movementDate: inv.inventoryDate, createdById: actor.id, inventoryId: inv.id } });
        }
      }
      const updated = await tx.inventory.update({ where: { id }, data: { status: InventoryStatus.VALIDATED, validatedAt: new Date() }, include: { lines: true } });
      await this.audit(tx, organizationId, actor.id, AuditAction.INVENTORY_VALIDATED, 'Inventory', id, inv.name);
      return updated;
    });
  }

  listAudit(organizationId: string, q: ListQueryDto = {}) { return this.prisma.auditLog.findMany({ where: { organizationId, OR: q.search ? [{ entityName: { contains: q.search, mode: 'insensitive' } }, { entityType: { contains: q.search, mode: 'insensitive' } }] : undefined }, include: { user: { select: { email: true, firstName: true, lastName: true } } }, orderBy: { createdAt: 'desc' }, ...this.page(q) }); }
  async auditCsv(organizationId: string) { const rows = await this.listAudit(organizationId, { pageSize: 1000 }); return ['date,user,action,entityType,entityName', ...rows.map((r) => [r.createdAt.toISOString(), r.user?.email ?? '', r.action, r.entityType, r.entityName ?? ''].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n'); }

  private async applyStock(tx: Tx, organizationId: string, productId: string, lotId: string | undefined | null, siteId: string | undefined | null, locationId: string | undefined | null, delta: Prisma.Decimal) {
    const existing = await tx.stock.findFirst({ where: { organizationId, productId, lotId: lotId ?? null, siteId: siteId ?? null, locationId: locationId ?? null } });
    if (existing) return tx.stock.update({ where: { id: existing.id }, data: { quantity: existing.quantity.add(delta) } });
    return tx.stock.create({ data: { organizationId, productId, lotId, siteId, locationId, quantity: delta } });
  }
  private signedQuantity(type: StockMovementType, q: Prisma.Decimal) { if (NEGATIVE_TYPES.has(type)) return q.neg(); return q; }
  private stockStatus(q: Prisma.Decimal, min: Prisma.Decimal) { if (q.isNegative()) return 'NEGATIVE'; if (q.isZero()) return 'OUT'; if (q.lessThanOrEqualTo(min)) return 'LOW'; return 'NORMAL'; }
  private async convertToProductUnit(organizationId: string, fromUnitId: string, toUnitId: string, quantity: number) { if (fromUnitId === toUnitId) return new Prisma.Decimal(quantity); const c = await this.prisma.unitConversion.findFirst({ where: { organizationId, fromUnitId, toUnitId } }); if (!c) throw new BadRequestException('Incompatible unit conversion'); return new Prisma.Decimal(quantity).mul(c.factor); }
  private async recalculateAveragePrice(_tx: Tx, _product: { id: string; averagePrice: Prisma.Decimal }, _receivedQty: Prisma.Decimal) { /* V1 stores weighted average field; purchase price capture can refine this later. */ }
  private async log(organizationId: string, userId: string | null, action: AuditAction, entityType: string, entityId: string, entityName: string) { await this.prisma.auditLog.create({ data: { organizationId, userId: userId || null, action, entityType, entityId, entityName } }); }
  private async createAudited(model: 'category', organizationId: string, userId: string | null, action: AuditAction, dto: UpsertCategoryDto) { const item = await this.prisma.category.create({ data: { ...dto, organizationId } }); await this.log(organizationId, userId, action, 'Category', item.id, item.name); return item; }
  private ensureUncategorizedCategory(tx: Tx, organizationId: string) {
    return tx.category.upsert({
      where: { organizationId_name: { organizationId, name: UNCATEGORIZED_CATEGORY_NAME } },
      update: { isArchived: false, archivedAt: null },
      create: { organizationId, name: UNCATEGORIZED_CATEGORY_NAME, description: 'Produits sans famille attribuée.' },
    });
  }
  private categoryKey(name: string) { return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase(); }
  private isUncategorizedCategoryName(name: string) { return this.categoryKey(name) === this.categoryKey(UNCATEGORIZED_CATEGORY_NAME); }
  private sortCategoriesWithUncategorizedLast<T extends { name: string }>(categories: T[]) {
    return [...categories].sort((a, b) => {
      const aIsUncategorized = this.isUncategorizedCategoryName(a.name);
      const bIsUncategorized = this.isUncategorizedCategoryName(b.name);
      if (aIsUncategorized === bIsUncategorized) return 0;
      return aIsUncategorized ? 1 : -1;
    });
  }
  private async archive(model: 'category' | 'unit' | 'supplier' | 'product' | 'site' | 'location', organizationId: string, actor: Actor, id: string, action: AuditAction, entityType: string) { this.assertWrite(actor); const delegate = this.prisma[model] as any; const item = await delegate.update({ where: { id, organizationId }, data: { isArchived: true, archivedAt: new Date() } }); await this.log(organizationId, actor.id, action, entityType, item.id, item.name); return item; }
  private async ensureCategory(organizationId: string, id: string) { const item = await this.prisma.category.findFirst({ where: { id, organizationId } }); if (!item) throw new NotFoundException('Category not found'); return item; }
  private async ensureUnit(organizationId: string, id: string) { const item = await this.prisma.unit.findFirst({ where: { id, organizationId } }); if (!item) throw new NotFoundException('Unit not found'); return item; }
  private async ensureSupplier(organizationId: string, id: string) { const item = await this.prisma.supplier.findFirst({ where: { id, organizationId } }); if (!item) throw new NotFoundException('Supplier not found'); return item; }
  private async ensureSite(organizationId: string, id: string) { const item = await this.prisma.site.findFirst({ where: { id, organizationId } }); if (!item) throw new NotFoundException('Site not found'); return item; }
  private async ensureProduct(organizationId: string, id: string, activeOnly: boolean) { const item = await this.prisma.product.findFirst({ where: { id, organizationId, ...(activeOnly ? { isArchived: false } : {}) }, include: { unit: true } }); if (!item) throw new NotFoundException('Product not found'); return item; }
}
