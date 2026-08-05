import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, Prisma, ProductKind, Unit, UnitType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CommitInventoryImportDto } from './dto/stocks-inventory-import.dto';
import {
  normalizeInventoryFamilyName,
  normalizeInventoryName,
  parseInventoryWorkbook,
} from './stocks-inventory-spreadsheet';

const WRITE_ROLES = ['SUPER_ADMIN', 'Administrateur', 'Manager', 'Chef', 'Second', 'Magasinier'];
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MISTRAL_MODEL = process.env.OCR_MISTRAL_AI_MODEL || 'mistral-large-latest';

type Actor = { id: string; role: string };
type UploadedFile = { originalname: string; mimetype?: string; size?: number; buffer?: Buffer };

type MatchCandidate = {
  productId: string;
  name: string;
  unitId: string;
  unitLabel: string;
  score: number;
};

@Injectable()
export class StocksInventoryImportService {
  private readonly logger = new Logger(StocksInventoryImportService.name);

  constructor(private readonly prisma: PrismaService) {}

  async analyze(organizationId: string, actor: Actor, siteId: string, file?: UploadedFile) {
    this.assertWrite(actor);
    this.assertFile(file);
    const site = await this.prisma.site.findFirst({
      where: { id: siteId, organizationId, isArchived: false },
      select: { id: true, name: true },
    });
    if (!site) throw new NotFoundException('Établissement introuvable ou archivé.');
    let parsed;
    try {
      parsed = await parseInventoryWorkbook(file!.originalname, file!.buffer!);
    } catch (error: any) {
      throw new BadRequestException(error?.message || 'Document d’inventaire illisible.');
    }
    const [products, aliases, units] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          organizationId,
          isArchived: false,
          kind: { not: ProductKind.EQUIPMENT },
        },
        include: {
          unit: true,
          category: true,
          primarySupplier: true,
          stocks: { where: { organizationId, siteId } },
          siteAssignments: { where: { organizationId, siteId, isActive: true } },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.productAlias.findMany({
        where: { organizationId },
        select: { productId: true, normalizedAlias: true },
      }),
      this.prisma.unit.findMany({
        where: { organizationId, isArchived: false },
        orderBy: { name: 'asc' },
      }),
    ]);
    const byExactName = new Map<string, (typeof products)[number]>();
    for (const product of products) byExactName.set(normalizeInventoryName(product.name), product);
    const aliasesByName = new Map(aliases.map((alias) => [alias.normalizedAlias, alias.productId]));
    const productsById = new Map(products.map((product) => [product.id, product]));

    const previewRows: Array<any> = parsed.rows.map((row) => {
      const normalized = normalizeInventoryName(row.sourceName);
      const exact = byExactName.get(normalized);
      const alias = productsById.get(aliasesByName.get(normalized) ?? '');
      const candidates = this.rankCandidates(row.sourceName, products).slice(0, 5);
      const deterministic = exact ?? alias ?? null;
      const unit = deterministic?.unit ?? this.resolveUnit(row.unitLabel, units);
      const unitWarning = deterministic
        ? this.unitCompatibilityWarning(row.unitLabel, deterministic.unit)
        : null;
      const theoreticalQuantity = deterministic
        ? deterministic.stocks.reduce((sum, stock) => sum + Number(stock.quantity), 0)
        : 0;
      return {
        ...row,
        action: deterministic ? ('MATCH' as const) : ('CREATE' as const),
        productId: deterministic?.id ?? null,
        productName: deterministic?.name ?? null,
        unitId: unit?.id ?? null,
        resolvedUnitLabel: unit ? `${unit.name} (${unit.symbol})` : null,
        theoreticalQuantity: round(theoreticalQuantity, 3),
        varianceQuantity: round(row.countedQuantity - theoreticalQuantity, 3),
        matchMethod: exact ? ('exact' as const) : alias ? ('learned_alias' as const) : null,
        matchConfidence: exact || alias ? 1 : null,
        needsReview: !deterministic || Boolean(unitWarning),
        selected: true,
        warnings: [...row.warnings, ...(unitWarning ? [unitWarning] : [])],
        candidates,
      };
    });

    const ai = await this.suggestAmbiguousMatches(organizationId, previewRows, productsById);
    for (const suggestion of ai.suggestions) {
      const row = previewRows.find((candidate) => candidate.sourceId === suggestion.sourceId);
      const product = productsById.get(suggestion.productId);
      if (!row || !product || row.productId) continue;
      row.action = 'MATCH';
      row.productId = product.id;
      row.productName = product.name;
      row.unitId = product.unitId;
      row.resolvedUnitLabel = `${product.unit.name} (${product.unit.symbol})`;
      row.matchMethod = 'mistral_suggestion';
      row.matchConfidence = suggestion.confidence;
      row.needsReview = true;
      row.theoreticalQuantity = round(
        product.stocks.reduce((sum, stock) => sum + Number(stock.quantity), 0),
        3,
      );
      row.varianceQuantity = round(row.countedQuantity - row.theoreticalQuantity, 3);
      row.warnings.push(
        'Correspondance présélectionnée par Mistral : à valider lors du contrôle final.',
      );
    }

    return {
      filename: file!.originalname,
      site,
      sourceKind: parsed.sourceKind,
      sheets: parsed.sheets,
      rows: previewRows,
      issues: parsed.issues,
      summary: {
        ...parsed.summary,
        exactMatches: previewRows.filter((row) => row.matchMethod === 'exact').length,
        learnedMatches: previewRows.filter((row) => row.matchMethod === 'learned_alias').length,
        suggestedMatches: previewRows.filter((row) => row.matchMethod === 'mistral_suggestion')
          .length,
        productsToCreate: previewRows.filter((row) => row.action === 'CREATE').length,
        rowsNeedingReview: previewRows.filter((row) => row.needsReview).length,
      },
      availableUnits: units.map((unit) => ({
        id: unit.id,
        name: unit.name,
        symbol: unit.symbol,
        type: unit.type,
      })),
      ai: {
        status: ai.status,
        provider: ai.status === 'not_needed' ? null : 'mistral',
        model: ai.status === 'not_needed' ? null : MISTRAL_MODEL,
        privacy:
          'Seuls les noms, catégories et unités des lignes ambiguës, ainsi que les noms candidats du catalogue, sont envoyés. Les quantités, prix et totaux restent locaux.',
        warnings: ai.warnings,
      },
    };
  }

  async commit(organizationId: string, actor: Actor, dto: CommitInventoryImportDto) {
    this.assertWrite(actor);
    const selectedRows = dto.rows.filter(
      (row) => row.selected !== false && row.action !== 'IGNORE',
    );
    if (!selectedRows.length) throw new BadRequestException('Sélectionnez au moins une ligne.');
    const site = await this.prisma.site.findFirst({
      where: { id: dto.siteId, organizationId, isArchived: false },
      select: { id: true, name: true },
    });
    if (!site) throw new NotFoundException('Établissement introuvable ou archivé.');
    const [units, existingProducts] = await Promise.all([
      this.prisma.unit.findMany({ where: { organizationId, isArchived: false } }),
      this.prisma.product.findMany({
        where: {
          organizationId,
          isArchived: false,
          kind: { not: ProductKind.EQUIPMENT },
        },
        include: { unit: true },
      }),
    ]);
    const unitsById = new Map(units.map((unit) => [unit.id, unit]));
    const productsById = new Map(existingProducts.map((product) => [product.id, product]));
    const productsByName = new Map(
      existingProducts.map((product) => [normalizeInventoryName(product.name), product]),
    );

    return this.prisma.$transaction(async (tx) => {
      const categoryCache = new Map<string, string>();
      const supplierCache = new Map<string, string>();
      const prepared: Array<{
        row: (typeof selectedRows)[number];
        productId: string;
        countedQuantity: Prisma.Decimal;
      }> = [];
      let createdProducts = 0;
      let matchedProducts = 0;
      let updatedPrices = 0;
      let learnedAliases = 0;

      for (const row of selectedRows) {
        let product =
          row.action === 'MATCH' && row.productId ? productsById.get(row.productId) : undefined;
        if (row.action === 'MATCH' && !product)
          throw new BadRequestException(`Produit sélectionné invalide pour « ${row.sourceName} ».`);
        if (!product && row.action === 'CREATE') {
          product = productsByName.get(normalizeInventoryName(row.sourceName));
          if (!product) {
            const unit = unitsById.get(row.unitId ?? '') ?? this.resolveUnit(row.unitLabel, units);
            if (!unit)
              throw new BadRequestException(
                `Unité non reconnue pour « ${row.sourceName} ». Sélectionnez une unité avant l’import.`,
              );
            const categoryId = await this.resolveCategory(
              tx,
              organizationId,
              row.categoryName,
              dto.createMissingCategories !== false,
              categoryCache,
            );
            const supplierId = await this.resolveSupplier(
              tx,
              organizationId,
              row.supplierName,
              dto.createMissingSuppliers === true,
              supplierCache,
            );
            product = await tx.product.create({
              data: {
                organizationId,
                name: row.sourceName.trim(),
                unitId: unit.id,
                categoryId,
                primarySupplierId: supplierId,
                averagePrice: row.unitPriceExVat ?? 0,
                kind: ProductKind.UNSPECIFIED,
              },
              include: { unit: true },
            });
            productsById.set(product.id, product);
            productsByName.set(normalizeInventoryName(product.name), product);
            createdProducts += 1;
          }
        }
        if (!product) continue;
        matchedProducts += row.action === 'MATCH' ? 1 : 0;
        if (
          dto.updatePrices === true &&
          row.unitPriceExVat != null &&
          row.unitPriceExVat > 0 &&
          !new Prisma.Decimal(row.unitPriceExVat).equals(product.averagePrice)
        ) {
          product = await tx.product.update({
            where: { id: product.id },
            data: { averagePrice: row.unitPriceExVat },
            include: { unit: true },
          });
          productsById.set(product.id, product);
          updatedPrices += 1;
        }
        await tx.productSite.upsert({
          where: {
            organizationId_productId_siteId: {
              organizationId,
              productId: product.id,
              siteId: site.id,
            },
          },
          update: { isActive: true },
          create: { organizationId, productId: product.id, siteId: site.id, isActive: true },
        });
        if (
          dto.learnAliases !== false &&
          normalizeInventoryName(row.sourceName) !== normalizeInventoryName(product.name)
        ) {
          const normalizedAlias = normalizeInventoryName(row.sourceName);
          const existingAlias = await tx.productAlias.findFirst({
            where: { organizationId, supplierId: null, normalizedAlias },
          });
          if (existingAlias) {
            await tx.productAlias.update({
              where: { id: existingAlias.id },
              data: { alias: row.sourceName, productId: product.id, createdBy: actor.id },
            });
          } else {
            await tx.productAlias.create({
              data: {
                organizationId,
                supplierId: null,
                alias: row.sourceName,
                normalizedAlias,
                productId: product.id,
                purchaseUnit: row.unitLabel,
                stockUnit: product.unit.symbol,
                createdBy: actor.id,
              },
            });
          }
          learnedAliases += 1;
        }
        prepared.push({
          row,
          productId: product.id,
          countedQuantity: new Prisma.Decimal(row.countedQuantity),
        });
      }

      const grouped = new Map<string, Prisma.Decimal>();
      for (const item of prepared) {
        grouped.set(
          item.productId,
          (grouped.get(item.productId) ?? new Prisma.Decimal(0)).add(item.countedQuantity),
        );
      }
      const productIds = [...grouped.keys()];
      const stocks = await tx.stock.findMany({
        where: { organizationId, siteId: site.id, productId: { in: productIds } },
        select: { productId: true, quantity: true },
      });
      const theoreticalByProduct = new Map<string, Prisma.Decimal>();
      for (const stock of stocks) {
        theoreticalByProduct.set(
          stock.productId,
          (theoreticalByProduct.get(stock.productId) ?? new Prisma.Decimal(0)).add(stock.quantity),
        );
      }
      const inventory = await tx.inventory.create({
        data: {
          organizationId,
          siteId: site.id,
          name: dto.name.trim(),
          comment:
            dto.comment?.trim() ||
            'Inventaire créé depuis un document importé. Vérifier les lignes avant validation.',
          inventoryDate: dto.inventoryDate ? new Date(dto.inventoryDate) : new Date(),
          createdById: actor.id,
        },
      });
      await tx.inventoryLine.createMany({
        data: productIds.map((productId) => {
          const theoreticalQuantity = theoreticalByProduct.get(productId) ?? new Prisma.Decimal(0);
          const countedQuantity = grouped.get(productId)!;
          return {
            inventoryId: inventory.id,
            productId,
            theoreticalQuantity,
            countedQuantity,
            varianceQuantity: countedQuantity.sub(theoreticalQuantity),
          };
        }),
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId: actor.id,
          action: AuditAction.INVENTORY_CREATED,
          entityType: 'Inventory',
          entityId: inventory.id,
          entityName: inventory.name,
          details: {
            source: 'DOCUMENT_IMPORT',
            siteId: site.id,
            importedLines: selectedRows.length,
            consolidatedProducts: productIds.length,
            createdProducts,
            updatedPrices,
            learnedAliases,
          },
        },
      });
      const result = await tx.inventory.findUnique({
        where: { id: inventory.id },
        include: {
          site: true,
          location: true,
          lines: { include: { product: { include: { unit: true, category: true } } } },
        },
      });
      return {
        inventory: result,
        status: 'DRAFT',
        stockUpdated: false,
        summary: {
          importedRows: selectedRows.length,
          inventoryLines: productIds.length,
          matchedProducts,
          createdProducts,
          updatedPrices,
          learnedAliases,
        },
        nextStep:
          'Contrôlez le brouillon puis cliquez sur « Valider l’inventaire » pour appliquer les écarts au stock.',
      };
    });
  }

  private rankCandidates(sourceName: string, products: any[]): MatchCandidate[] {
    const normalizedSource = normalizeInventoryFamilyName(sourceName);
    return products
      .map((product) => ({
        productId: product.id,
        name: product.name,
        unitId: product.unitId,
        unitLabel: `${product.unit.name} (${product.unit.symbol})`,
        score: nameSimilarity(normalizedSource, normalizeInventoryFamilyName(product.name)),
      }))
      .filter((candidate) => candidate.score >= 0.35)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .map((candidate) => ({ ...candidate, score: round(candidate.score, 3) }));
  }

  private resolveUnit(label: string | null | undefined, units: Unit[]) {
    const normalized = normalizeUnit(label);
    const type = unitType(normalized);
    const direct = units.find(
      (unit) =>
        normalizeUnit(unit.symbol) === normalized || normalizeUnit(unit.name) === normalized,
    );
    if (direct) return direct;
    if (type === UnitType.MASS)
      return units.find(
        (unit) => unit.type === UnitType.MASS && normalizeUnit(unit.symbol) === 'kg',
      );
    if (type === UnitType.VOLUME)
      return units.find(
        (unit) => unit.type === UnitType.VOLUME && normalizeUnit(unit.symbol) === 'l',
      );
    if (type === UnitType.PACKAGE)
      return (
        units.find((unit) => unit.type === UnitType.PACKAGE) ??
        units.find((unit) => unit.type === UnitType.COUNT)
      );
    if (type === UnitType.COUNT) return units.find((unit) => unit.type === UnitType.COUNT);
    return undefined;
  }

  private unitCompatibilityWarning(sourceLabel: string | null, target: Unit) {
    const sourceType = unitType(normalizeUnit(sourceLabel));
    if (!sourceType || sourceType === target.type) return null;
    const countLike = new Set<UnitType>([UnitType.COUNT, UnitType.PACKAGE]);
    if (countLike.has(sourceType) && countLike.has(target.type)) return null;
    return `Unité du document « ${sourceLabel} » incompatible avec l’unité produit « ${target.symbol} ».`;
  }

  private async resolveCategory(
    tx: Prisma.TransactionClient,
    organizationId: string,
    name: string | undefined,
    create: boolean,
    cache: Map<string, string>,
  ) {
    if (!name?.trim()) return null;
    const key = normalizeInventoryName(name);
    if (cache.has(key)) return cache.get(key)!;
    const existing = await tx.category.findFirst({
      where: {
        organizationId,
        kind: ProductKind.UNSPECIFIED,
        name: { equals: name.trim(), mode: 'insensitive' },
      },
    });
    if (existing) {
      cache.set(key, existing.id);
      return existing.id;
    }
    if (!create) return null;
    const created = await tx.category.create({
      data: { organizationId, name: name.trim(), kind: ProductKind.UNSPECIFIED },
    });
    cache.set(key, created.id);
    return created.id;
  }

  private async resolveSupplier(
    tx: Prisma.TransactionClient,
    organizationId: string,
    name: string | undefined,
    create: boolean,
    cache: Map<string, string>,
  ) {
    if (!name?.trim()) return null;
    const key = normalizeInventoryName(name);
    if (cache.has(key)) return cache.get(key)!;
    const existing = await tx.supplier.findFirst({
      where: { organizationId, name: { equals: name.trim(), mode: 'insensitive' } },
    });
    if (existing) {
      cache.set(key, existing.id);
      return existing.id;
    }
    if (!create) return null;
    const created = await tx.supplier.create({ data: { organizationId, name: name.trim() } });
    cache.set(key, created.id);
    return created.id;
  }

  private async suggestAmbiguousMatches(
    organizationId: string,
    rows: Array<any>,
    productsById: Map<string, any>,
  ): Promise<{
    status: 'not_needed' | 'no_match' | 'unavailable' | 'applied';
    suggestions: Array<{ sourceId: string; productId: string; confidence: number }>;
    warnings: string[];
  }> {
    const ambiguous = rows
      .filter(
        (row) =>
          !row.productId &&
          row.candidates.some((candidate: MatchCandidate) => candidate.score >= 0.45),
      )
      .slice(0, 20);
    if (!ambiguous.length) return { status: 'not_needed', suggestions: [], warnings: [] };
    const key = await this.resolveMistralApiKey(organizationId);
    if (!key)
      return {
        status: 'unavailable',
        suggestions: [],
        warnings: [
          'Mistral non configuré : les correspondances ambiguës restent à confirmer manuellement.',
        ],
      };
    const suggestions: Array<{ sourceId: string; productId: string; confidence: number }> = [];
    try {
      for (let offset = 0; offset < ambiguous.length; offset += 20) {
        const chunk = ambiguous.slice(offset, offset + 20);
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          Number(process.env.INVENTORY_MATCH_MISTRAL_TIMEOUT_MS ?? 25_000),
        );
        try {
          const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              model: MISTRAL_MODEL,
              temperature: 0,
              response_format: { type: 'json_object' },
              messages: [
                {
                  role: 'system',
                  content:
                    'Tu proposes des correspondances prudentes entre noms de produits. Utilise uniquement les productId fournis. En cas de doute, n’ajoute aucune suggestion. Réponds en JSON {"matches":[{"sourceId":"...","productId":"...","confidence":0.0}]}',
                },
                {
                  role: 'user',
                  content: JSON.stringify({
                    rows: chunk.map((row) => ({
                      sourceId: row.sourceId,
                      name: row.sourceName,
                      category: row.categoryName,
                      unit: row.unitLabel,
                      candidates: row.candidates.map((candidate: MatchCandidate) => ({
                        productId: candidate.productId,
                        name: candidate.name,
                        unit: candidate.unitLabel,
                      })),
                    })),
                  }),
                },
              ],
            }),
          });
          if (!response.ok) throw new Error(`Mistral ${response.status}`);
          const json: any = await response.json();
          const parsed = JSON.parse(json?.choices?.[0]?.message?.content || '{}');
          for (const match of Array.isArray(parsed?.matches) ? parsed.matches : []) {
            const row = chunk.find((candidate) => candidate.sourceId === match?.sourceId);
            const allowed = row?.candidates.some(
              (candidate: MatchCandidate) => candidate.productId === match?.productId,
            );
            const confidence = Number(match?.confidence);
            if (allowed && productsById.has(match.productId) && confidence >= 0.72) {
              suggestions.push({
                sourceId: match.sourceId,
                productId: match.productId,
                confidence: Math.min(1, confidence),
              });
            }
          }
        } finally {
          clearTimeout(timeout);
        }
      }
      return {
        status: suggestions.length ? 'applied' : 'no_match',
        suggestions,
        warnings: suggestions.length
          ? []
          : ['Mistral n’a proposé aucune correspondance suffisamment sûre.'],
      };
    } catch (error: any) {
      this.logger.warn(`Suggestions inventaire Mistral indisponibles: ${error?.message || error}`);
      return {
        status: 'unavailable',
        suggestions: [],
        warnings: ['Mistral indisponible : les correspondances locales restent utilisables.'],
      };
    }
  }

  private async resolveMistralApiKey(organizationId: string) {
    const envKey = process.env.MISTRAL_API_KEY || process.env.OCR_MISTRAL_API_KEY;
    if (envKey) return envKey;
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { mistralApiKey: true },
    });
    return organization?.mistralApiKey?.trim() || null;
  }

  private assertWrite(actor: Actor) {
    if (!WRITE_ROLES.includes(actor.role))
      throw new ForbiddenException('Droits Stocks insuffisants.');
  }

  private assertFile(file?: UploadedFile) {
    if (!file?.buffer?.length)
      throw new BadRequestException('Sélectionnez un document d’inventaire.');
    if ((file.size ?? file.buffer.length) > MAX_FILE_BYTES)
      throw new BadRequestException('Document trop volumineux. Taille maximale : 8 Mo.');
    const lower = file.originalname?.toLowerCase() ?? '';
    if (!['.xml', '.xlsx', '.csv'].some((extension) => lower.endsWith(extension)))
      throw new BadRequestException(
        'Format non supporté. Utilisez CSV, Excel (.xlsx) ou Excel XML (.xml).',
      );
  }
}

function normalizeUnit(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function unitType(value: string): UnitType | null {
  if (['kg', 'kilogram', 'kilogramme', 'g', 'gram', 'gramme'].includes(value)) return UnitType.MASS;
  if (['l', 'litre', 'liter', 'ml', 'millilitre', 'cl'].includes(value)) return UnitType.VOLUME;
  if (['pkt', 'ltk', 'pss', 'rll', 'carton', 'box', 'package', 'pack'].includes(value))
    return UnitType.PACKAGE;
  if (['kpl', 'plo', 'tlk', 'pcs', 'pc', 'piece', 'unite', 'unit'].includes(value))
    return UnitType.COUNT;
  return null;
}

function nameSimilarity(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const leftTokens = new Set(left.split(' ').filter(Boolean));
  const rightTokens = new Set(right.split(' ').filter(Boolean));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  const tokenScore = union ? intersection / union : 0;
  const editScore = 1 - levenshtein(left, right) / Math.max(left.length, right.length, 1);
  const shorter = leftTokens.size <= rightTokens.size ? leftTokens : rightTokens;
  const longer = leftTokens.size <= rightTokens.size ? rightTokens : leftTokens;
  const containsScore =
    shorter.size > 0 && [...shorter].every((token) => token.length >= 3 && longer.has(token))
      ? 0.82
      : 0;
  return Math.max(tokenScore, editScore, containsScore);
}

function levenshtein(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
