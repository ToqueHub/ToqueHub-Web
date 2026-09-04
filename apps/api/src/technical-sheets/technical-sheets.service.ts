import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AuditAction,
  DocumentStatus,
  OcrBusinessExtractionStatus,
  OcrExtractionType,
  OcrProcessingStatus,
  Prisma,
  ProductKind,
  ProductionProfileMode,
  TechnicalSheetExportFormat,
  TechnicalSheetHistoryAction,
  TechnicalSheetMode,
  TechnicalSheetStatus,
  TechnicalSheetStockPolicy,
  TechnicalSheetYieldMode,
  UnitType,
} from '@prisma/client';
import AdmZip from 'adm-zip';
import { createHash, randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { extname, join, resolve } from 'path';
import PDFDocument from 'pdfkit';
import { MistralClientService } from '../mistral/mistral-client.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  DuplicateTechnicalSheetDto,
  ProductionSimulationDto,
  TechnicalSheetListQueryDto,
  UpdateTechnicalSheetPricingDto,
  UpsertAllergenDto,
  UpsertRecipeCategoryDto,
  UpsertTechnicalSheetDto,
} from './dto/technical-sheets.dto';
import {
  technicalSheetSalesTaxPolicy,
  type TechnicalSheetSalesTaxPolicy,
} from './technical-sheet-tax-policy';

type Actor = { id: string; role: string };
type Tx = Prisma.TransactionClient;
type UploadedRecipePdf = { originalname: string; mimetype: string; size: number; buffer: Buffer };
type ImportedRecipeIngredient = {
  name?: string | null;
  quantity?: number | null;
  unit?: string | null;
  comment?: string | null;
  sku?: string | null;
  gtin?: string | null;
};
type ImportedRecipeStep = {
  title?: string | null;
  description?: string | null;
  estimatedTimeMinutes?: number | null;
};
type PreparedImportedIngredient = {
  productId?: string;
  productName?: string;
  productSku?: string;
  productGtin?: string;
  createProduct?: boolean;
  unitId: string;
  quantity: number;
  comment?: string;
  order: number;
};

const DEFAULT_CATEGORIES = [
  'Entrées',
  'Plats',
  'Accompagnements',
  'Sauces',
  'Bases',
  'Crèmes',
  'Mousses',
  'Desserts',
  'Petit-déjeuner',
  'Pâtisserie',
  'Boulangerie',
  'Boissons',
  'Cocktails',
  'Cocktails sans alcool',
  'Cafés et boissons chaudes',
  'Sirops et infusions',
];
const STOCK_INPUT_PRODUCT_KINDS = [
  ProductKind.UNSPECIFIED,
  ProductKind.RAW_MATERIAL,
  ProductKind.PACKAGED,
];
const MAX_RECIPE_PDF_BYTES = 20 * 1024 * 1024;
const MAX_RECIPE_IMPORT_FILES = 10;
const TECHNICAL_SHEETS_UPLOAD_ROOT = resolve(
  process.env.UPLOAD_DIR || 'uploads',
  'technical-sheets',
);
const RECIPE_IMPORT_SOURCE = 'recipe-import';
const RECIPE_IMPORT_ACCEPTED_EXTENSIONS = new Set([
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.heic',
  '.heif',
  '.avif',
  '.pages',
  '.numbers',
]);
const RECIPE_IMPORT_ACCEPTED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/avif',
  'application/vnd.apple.pages',
  'application/vnd.apple.numbers',
  'application/zip',
  'application/octet-stream',
]);

@Injectable()
export class TechnicalSheetsService {
  private readonly logger = new Logger(TechnicalSheetsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mistralClient: MistralClientService,
  ) {}

  private page(q?: TechnicalSheetListQueryDto) {
    const take = Math.min(q?.pageSize ?? 50, 200);
    const skip = ((q?.page ?? 1) - 1) * take;
    return { take, skip };
  }

  private async assertInstalled(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { stocksInstalledAt: true, technicalSheetsInstalledAt: true },
    });
    if (!org?.stocksInstalledAt)
      throw new BadRequestException(
        'Le module Stocks doit être installé avant les Fiches Techniques.',
      );
    if (!org.technicalSheetsInstalledAt)
      throw new BadRequestException(
        'Le module Fiches Techniques n’est pas installé pour cette organisation.',
      );
  }

  async install(organizationId: string, actor: Actor) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        stocksInstalledAt: true,
        rnmPricesInstalledAt: true,
        hrInstalledAt: true,
        planningInstalledAt: true,
      },
    });
    if (!org?.stocksInstalledAt)
      throw new BadRequestException('Installation impossible: Stocks est obligatoire.');
    await this.prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: organizationId },
        data: { technicalSheetsInstalledAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId: actor.id,
          action: AuditAction.MODULE_TECHNICAL_SHEETS_INSTALLED,
          entityType: 'Module',
          entityId: 'technical-sheets',
          entityName: 'Fiches Techniques',
        },
      });
    });
    return {
      installed: true,
      installedApplications: this.installedApps({ ...org, technicalSheetsInstalledAt: new Date() }),
    };
  }

  async uninstall(organizationId: string, actor: Actor) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        stocksInstalledAt: true,
        rnmPricesInstalledAt: true,
        hrInstalledAt: true,
        planningInstalledAt: true,
      },
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: organizationId },
        data: { technicalSheetsInstalledAt: null },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId: actor.id,
          action: AuditAction.MODULE_TECHNICAL_SHEETS_UNINSTALLED,
          entityType: 'Module',
          entityId: 'technical-sheets',
          entityName: 'Fiches Techniques',
        },
      });
    });
    return {
      installed: false,
      installedApplications: this.installedApps({ ...org, technicalSheetsInstalledAt: null }),
    };
  }

  async dashboard(organizationId: string) {
    await this.assertInstalled(organizationId);
    const [recipeCount, categoryCount, sheets, latest, used] = await Promise.all([
      this.prisma.technicalSheet.count({ where: { organizationId, isArchived: false } }),
      this.prisma.technicalSheetCategory.count({ where: { organizationId, isArchived: false } }),
      this.prisma.technicalSheet.findMany({
        where: { organizationId, isArchived: false },
        select: { totalCost: true },
      }),
      this.prisma.technicalSheet.findMany({
        where: { organizationId },
        include: this.recipeInclude(),
        orderBy: { updatedAt: 'desc' },
        take: 8,
      }),
      this.prisma.technicalSheetIngredient.groupBy({
        by: ['productId'],
        where: { organizationId },
        _count: { productId: true },
        orderBy: { _count: { productId: 'desc' } },
        take: 10,
      }),
    ]);
    const products = await this.prisma.product.findMany({
      where: { id: { in: used.map((u) => u.productId) } },
      include: { unit: true, category: true },
    });
    const total = sheets.reduce((sum, s) => sum + Number(s.totalCost), 0);
    return {
      recipeCount,
      categoryCount,
      averageMaterialCost: sheets.length ? total / sheets.length : 0,
      usedStockProductsCount: used.length,
      latestRecipes: latest.map((s) => this.serializeRecipe(s)),
      topProducts: used.map((u) => {
        const product = products.find((p) => p.id === u.productId);
        return {
          productId: u.productId,
          name: product?.name ?? 'Produit Stocks',
          count: u._count.productId,
          product,
        };
      }),
      lastModifiedAt: latest[0]?.updatedAt?.toISOString?.() ?? null,
    };
  }

  async onboarding(organizationId: string) {
    await this.assertInstalled(organizationId);
    const [categories, recipeCount] = await Promise.all([
      this.prisma.technicalSheetCategory.findMany({
        where: { organizationId, isArchived: false },
        select: { name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.technicalSheet.count({ where: { organizationId, isArchived: false } }),
    ]);
    return {
      categoryCount: categories.length,
      recipeCount,
      completed: recipeCount > 0,
      nextStep: categories.length ? 'recipe' : 'categories',
      suggestedCategories: DEFAULT_CATEGORIES,
      selectedCategoryNames: categories.map((category) => category.name),
    };
  }

  async completeOnboardingCategories(organizationId: string, actor: Actor, names: string[]) {
    await this.assertInstalled(organizationId);
    const normalizedNames = [
      ...names
        .reduce((byNormalizedName, name) => {
          const trimmedName = name.trim();
          if (trimmedName && !byNormalizedName.has(trimmedName.toLocaleLowerCase('fr')))
            byNormalizedName.set(trimmedName.toLocaleLowerCase('fr'), trimmedName);
          return byNormalizedName;
        }, new Map<string, string>())
        .values(),
    ];
    if (!normalizedNames.length)
      throw new BadRequestException('Sélectionnez au moins une catégorie recette.');
    await this.prisma.$transaction(async (tx) => {
      const existingCategories = await tx.technicalSheetCategory.findMany({
        where: { organizationId },
        select: { id: true, name: true, isArchived: true },
      });
      const selectedKeys = new Set(normalizedNames.map((name) => name.toLocaleLowerCase('fr')));
      const categoriesToRestore = existingCategories
        .filter(
          (category) =>
            category.isArchived && selectedKeys.has(category.name.toLocaleLowerCase('fr')),
        )
        .map((category) => category.id);
      if (categoriesToRestore.length)
        await tx.technicalSheetCategory.updateMany({
          where: { id: { in: categoriesToRestore }, organizationId },
          data: { isArchived: false, archivedAt: null },
        });
      const existingKeys = new Set(
        existingCategories.map((category) => category.name.toLocaleLowerCase('fr')),
      );
      const categoriesToCreate = normalizedNames.filter(
        (name) => !existingKeys.has(name.toLocaleLowerCase('fr')),
      );
      if (categoriesToCreate.length)
        await tx.technicalSheetCategory.createMany({
          data: categoriesToCreate.map((name) => ({ organizationId, name })),
          skipDuplicates: true,
        });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId: actor.id,
          action: AuditAction.CATEGORY_CREATED,
          entityType: 'TechnicalSheetOnboarding',
          entityId: 'categories',
          entityName: 'Catégories recettes',
          details: { names: normalizedNames },
        },
      });
    });
    return this.onboarding(organizationId);
  }

  async listCategories(organizationId: string, q: TechnicalSheetListQueryDto = {}) {
    await this.assertInstalled(organizationId);
    return this.prisma.technicalSheetCategory.findMany({
      where: {
        organizationId,
        ...(q.includeArchived ? {} : { isArchived: false }),
        name: q.search ? { contains: q.search, mode: 'insensitive' } : undefined,
      },
      orderBy: { name: 'asc' },
      ...this.page(q),
    });
  }
  async createCategory(organizationId: string, dto: UpsertRecipeCategoryDto) {
    await this.assertInstalled(organizationId);
    return this.prisma.technicalSheetCategory.create({ data: { ...dto, organizationId } });
  }
  async updateCategory(organizationId: string, id: string, dto: UpsertRecipeCategoryDto) {
    await this.assertInstalled(organizationId);
    return this.prisma.technicalSheetCategory.update({ where: { id, organizationId }, data: dto });
  }
  async archiveCategory(organizationId: string, id: string) {
    await this.assertInstalled(organizationId);
    return this.prisma.technicalSheetCategory.update({
      where: { id, organizationId },
      data: { isArchived: true, archivedAt: new Date() },
    });
  }
  async listAllergens(organizationId: string, q: TechnicalSheetListQueryDto = {}) {
    await this.assertInstalled(organizationId);
    return this.prisma.technicalSheetAllergen.findMany({
      where: {
        organizationId,
        ...(q.includeArchived ? {} : { isArchived: false }),
        name: q.search ? { contains: q.search, mode: 'insensitive' } : undefined,
      },
      orderBy: { name: 'asc' },
      ...this.page(q),
    });
  }
  async createAllergen(organizationId: string, dto: UpsertAllergenDto) {
    await this.assertInstalled(organizationId);
    return this.prisma.technicalSheetAllergen.create({
      data: { name: dto.name, description: dto.description, organizationId },
    });
  }
  async updateAllergen(organizationId: string, id: string, dto: UpsertAllergenDto) {
    await this.assertInstalled(organizationId);
    return this.prisma.technicalSheetAllergen.update({ where: { id, organizationId }, data: dto });
  }
  async archiveAllergen(organizationId: string, id: string) {
    await this.assertInstalled(organizationId);
    return this.prisma.technicalSheetAllergen.update({
      where: { id, organizationId },
      data: { isArchived: true, archivedAt: new Date() },
    });
  }

  async listRecipes(organizationId: string, q: TechnicalSheetListQueryDto = {}) {
    await this.assertInstalled(organizationId);
    const where = {
      organizationId,
      ...(q.includeArchived ? {} : { isArchived: false }),
      categoryId: q.categoryId,
      status: q.status,
      OR: q.search
        ? [
            { name: { contains: q.search, mode: 'insensitive' as const } },
            { description: { contains: q.search, mode: 'insensitive' as const } },
            { category: { name: { contains: q.search, mode: 'insensitive' as const } } },
            {
              ingredients: {
                some: { product: { name: { contains: q.search, mode: 'insensitive' as const } } },
              },
            },
          ]
        : undefined,
    };
    const [items, total, salesTaxPolicy] = await Promise.all([
      this.prisma.technicalSheet.findMany({
        where,
        include: this.recipeInclude(),
        orderBy: { updatedAt: 'desc' },
        ...this.page(q),
      }),
      this.prisma.technicalSheet.count({ where }),
      this.salesTaxPolicy(organizationId),
    ]);
    return {
      items: items.map((i) => this.serializeRecipe(i, salesTaxPolicy)),
      total,
      page: q.page ?? 1,
      pageSize: Math.min(q.pageSize ?? 50, 200),
      salesTaxPolicy,
    };
  }

  async getRecipe(organizationId: string, id: string) {
    await this.assertInstalled(organizationId);
    const recipe = await this.prisma.technicalSheet.findFirst({
      where: { id, organizationId },
      include: this.recipeInclude(true),
    });
    if (!recipe) throw new NotFoundException('Fiche technique introuvable');
    return this.serializeRecipe(recipe);
  }

  async ensureProductionProfile(
    organizationId: string,
    actor: Actor,
    technicalSheetId: string,
    siteId: string,
  ) {
    await this.assertInstalled(organizationId);
    return this.prisma.$transaction(async (tx) => {
      const [sheet, site] = await Promise.all([
        tx.technicalSheet.findFirst({
          where: {
            id: technicalSheetId,
            organizationId,
            isArchived: false,
            status: { in: [TechnicalSheetStatus.ACTIVE, TechnicalSheetStatus.VALIDATED] },
          },
        }),
        tx.site.findFirst({
          where: { id: siteId, organizationId, isArchived: false },
          select: { id: true },
        }),
      ]);
      if (!sheet) {
        throw new NotFoundException('Fiche technique active introuvable.');
      }
      if (!site) throw new NotFoundException('Site de production introuvable.');
      const referenceYield = this.referenceYield(sheet);
      if (referenceYield.lte(0)) {
        throw new BadRequestException(
          `Le rendement de la fiche « ${sheet.name} » doit être supérieur à zéro.`,
        );
      }

      const output = await this.resolveRecipeOutputTx(
        tx,
        organizationId,
        {
          name: sheet.name,
          referencePortions: Number(sheet.referencePortions),
          yieldMode: sheet.yieldMode,
          mode: sheet.mode,
          outputProductId: sheet.outputProductId ?? undefined,
          yieldUnitId: sheet.yieldUnitId ?? undefined,
        },
        sheet,
        actor.id,
      );
      if (
        sheet.outputProductId !== output.outputProductId ||
        sheet.yieldUnitId !== output.yieldUnitId
      ) {
        await tx.technicalSheet.update({
          where: { id: sheet.id },
          data: output,
        });
      }

      const existing = await tx.productionProfile.findFirst({
        where: {
          organizationId,
          siteId,
          technicalSheetId,
          outputVariantId: null,
        },
        orderBy: { createdAt: 'asc' },
      });
      const data = {
        outputProductId: output.outputProductId!,
        yieldUnitId: output.yieldUnitId!,
        referenceYield,
      };
      if (existing) {
        return tx.productionProfile.update({
          where: { id: existing.id },
          data,
        });
      }
      return tx.productionProfile.create({
        data: {
          organizationId,
          siteId,
          technicalSheetId,
          ...data,
          mode: ProductionProfileMode.FIXED,
        },
      });
    });
  }

  async createRecipe(organizationId: string, actor: Actor, dto: UpsertTechnicalSheetDto) {
    await this.assertInstalled(organizationId);
    if (!dto.categoryId) {
      throw new BadRequestException(
        'Veuillez créer une catégorie avant de créer une fiche technique.',
      );
    }
    const category = await this.ensureCategory(organizationId, dto.categoryId);
    if (category.isArchived) {
      throw new BadRequestException(
        'Veuillez créer une catégorie avant de créer une fiche technique.',
      );
    }
    const name = dto.name.trim();
    const existing = await this.prisma.technicalSheet.findFirst({
      where: { organizationId, name: { equals: name, mode: 'insensitive' } },
      select: { id: true, name: true, isArchived: true },
    });
    if (existing && !existing.isArchived) {
      throw new BadRequestException(`Une fiche technique nommée « ${existing.name} » existe déjà.`);
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (existing?.isArchived) {
          const current = await tx.technicalSheet.findUniqueOrThrow({ where: { id: existing.id } });
          const output = await this.resolveRecipeOutputTx(
            tx,
            organizationId,
            { ...dto, name },
            current,
            actor.id,
          );
          await tx.technicalSheet.update({
            where: { id: current.id, organizationId },
            data: {
              ...this.recipeUpdateData({ ...dto, name }),
              ...output,
              isArchived: false,
              archivedAt: null,
              sourceTechnicalSheetId: null,
            },
          });
          await this.replaceChildren(tx, organizationId, current.id, dto, actor.id);
          await this.recalculateCostTx(tx, organizationId, current.id, actor.id, false);
          await this.assertRecipeCanBeActiveTx(tx, current.id);
          await this.syncProductionProfileTx(tx, organizationId, current.id, dto, output);
          if (dto.importDocumentId)
            await this.markRecipeImportReviewedTx(tx, organizationId, dto.importDocumentId);
          await this.history(
            tx,
            organizationId,
            current.id,
            actor.id,
            TechnicalSheetHistoryAction.STATUS_CHANGED,
            'Réactivation de la fiche archivée avec un nouvel import',
            { restoredFromArchive: true, importDocumentId: dto.importDocumentId ?? null },
          );
          const restored = await tx.technicalSheet.findUnique({
            where: { id: current.id },
            include: this.recipeInclude(true),
          });
          return { ...this.serializeRecipe(restored), restoredFromArchive: true };
        }

        const output = await this.resolveRecipeOutputTx(
          tx,
          organizationId,
          { ...dto, name },
          undefined,
          actor.id,
        );
        const created = await tx.technicalSheet.create({
          data: { ...this.recipeCreateData(organizationId, { ...dto, name }), ...output },
        });
        await this.replaceChildren(tx, organizationId, created.id, dto, actor.id);
        await this.recalculateCostTx(tx, organizationId, created.id, actor.id, false);
        await this.assertRecipeCanBeActiveTx(tx, created.id);
        await this.syncProductionProfileTx(tx, organizationId, created.id, dto, output);
        if (dto.importDocumentId)
          await this.markRecipeImportReviewedTx(tx, organizationId, dto.importDocumentId);
        await this.history(
          tx,
          organizationId,
          created.id,
          actor.id,
          TechnicalSheetHistoryAction.CREATED,
          'Création de la fiche technique',
          dto.importDocumentId ? { importDocumentId: dto.importDocumentId } : undefined,
        );
        return this.serializeRecipe(
          await tx.technicalSheet.findUnique({
            where: { id: created.id },
            include: this.recipeInclude(true),
          }),
        );
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException(`Une fiche technique nommée « ${name} » existe déjà.`);
      }
      throw error;
    }
  }

  async updateRecipe(
    organizationId: string,
    actor: Actor,
    id: string,
    dto: UpsertTechnicalSheetDto,
  ) {
    await this.assertInstalled(organizationId);
    await this.ensureRecipe(organizationId, id);
    if (dto.categoryId) await this.ensureCategory(organizationId, dto.categoryId);
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.technicalSheet.findUniqueOrThrow({ where: { id } });
      const output = await this.resolveRecipeOutputTx(tx, organizationId, dto, current, actor.id);
      await tx.technicalSheet.update({
        where: { id, organizationId },
        data: { ...this.recipeUpdateData(dto), ...output },
      });
      if (dto.ingredients)
        await this.replaceIngredients(tx, organizationId, id, dto.ingredients, actor.id);
      if (dto.steps) await this.replaceSteps(tx, organizationId, id, dto.steps);
      await this.recalculateCostTx(tx, organizationId, id, actor.id, false);
      await this.assertRecipeCanBeActiveTx(tx, id);
      await this.syncProductionProfileTx(tx, organizationId, id, dto, output);
      await this.history(
        tx,
        organizationId,
        id,
        actor.id,
        TechnicalSheetHistoryAction.GENERAL_UPDATED,
        'Modification de la fiche technique',
      );
      return this.serializeRecipe(
        await tx.technicalSheet.findUnique({ where: { id }, include: this.recipeInclude(true) }),
      );
    });
  }

  async reassignRecipeCategory(
    organizationId: string,
    actor: Actor,
    id: string,
    categoryId: string,
  ) {
    await this.assertInstalled(organizationId);
    await this.ensureRecipe(organizationId, id);
    const category = await this.prisma.technicalSheetCategory.findFirst({
      where: { id: categoryId, organizationId, isArchived: false },
    });
    if (!category) {
      throw new BadRequestException('Choisissez une catégorie de recette active.');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.technicalSheet.update({
        where: { id, organizationId },
        data: { categoryId },
      });
      await this.history(
        tx,
        organizationId,
        id,
        actor.id,
        TechnicalSheetHistoryAction.GENERAL_UPDATED,
        `Catégorie réaffectée à « ${category.name} »`,
        { categoryId, categoryName: category.name },
      );
      return this.serializeRecipe(
        await tx.technicalSheet.findUnique({ where: { id }, include: this.recipeInclude(true) }),
      );
    });
  }

  async updateRecipePricing(
    organizationId: string,
    actor: Actor,
    id: string,
    dto: UpdateTechnicalSheetPricingDto,
  ) {
    await this.assertInstalled(organizationId);
    await this.ensureRecipe(organizationId, id);
    const hasExclTax = Object.prototype.hasOwnProperty.call(dto, 'targetSellingPriceExclTax');
    const hasInclTax = Object.prototype.hasOwnProperty.call(dto, 'targetSellingPriceInclTax');
    if (!hasExclTax && !hasInclTax)
      throw new BadRequestException('Renseignez un prix de vente HT ou TTC.');
    const salesTaxPolicy = await this.salesTaxPolicy(organizationId);
    const exclTaxInput = dto.targetSellingPriceExclTax;
    const inclTaxInput = dto.targetSellingPriceInclTax;
    if (inclTaxInput != null && salesTaxPolicy.rate == null)
      throw new BadRequestException(
        'Le pays de réglementation doit être configuré avant de calculer un prix TTC.',
      );
    const taxFactor =
      salesTaxPolicy.rate == null
        ? null
        : new Prisma.Decimal(1).add(new Prisma.Decimal(salesTaxPolicy.rate).div(100));
    let targetPrice: Prisma.Decimal | null = null;
    if (exclTaxInput != null) targetPrice = new Prisma.Decimal(exclTaxInput).toDecimalPlaces(4);
    else if (inclTaxInput != null && taxFactor)
      targetPrice = new Prisma.Decimal(inclTaxInput).div(taxFactor).toDecimalPlaces(4);
    if (exclTaxInput != null && inclTaxInput != null && taxFactor) {
      const expectedInclTax = new Prisma.Decimal(exclTaxInput).mul(taxFactor);
      if (expectedInclTax.sub(inclTaxInput).abs().greaterThan(0.02))
        throw new BadRequestException(
          'Les prix HT et TTC ne correspondent pas au taux réglementaire de l’organisation.',
        );
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.technicalSheet.update({
        where: { id, organizationId },
        data: { targetSellingPriceHtPerPortion: targetPrice },
      });
      await this.history(
        tx,
        organizationId,
        id,
        actor.id,
        TechnicalSheetHistoryAction.GENERAL_UPDATED,
        targetPrice == null
          ? 'Suppression du prix de vente visé'
          : 'Mise à jour du prix de vente visé',
        {
          targetSellingPriceHtPerPortion: targetPrice?.toString() ?? null,
          salesTaxRate: salesTaxPolicy.rate,
          regulatoryCountryCode: salesTaxPolicy.countryCode,
        },
      );
      return tx.technicalSheet.findUnique({ where: { id }, include: this.recipeInclude(true) });
    });
    return this.serializeRecipe(updated, salesTaxPolicy);
  }

  async archiveRecipe(organizationId: string, actor: Actor, id: string) {
    await this.assertInstalled(organizationId);
    await this.ensureRecipe(organizationId, id);
    return this.prisma.$transaction(async (tx) => {
      const sheet = await tx.technicalSheet.update({
        where: { id, organizationId },
        data: { status: TechnicalSheetStatus.ARCHIVED, isArchived: true, archivedAt: new Date() },
        include: this.recipeInclude(true),
      });
      await this.history(
        tx,
        organizationId,
        id,
        actor.id,
        TechnicalSheetHistoryAction.ARCHIVED,
        'Archivage de la fiche technique',
      );
      return this.serializeRecipe(sheet);
    });
  }

  async deleteRecipe(organizationId: string, id: string) {
    await this.assertInstalled(organizationId);
    const sheet = await this.ensureRecipe(organizationId, id);
    const [productionOrders, menuItems, menuReplacements, menuCycleItems, batches, lots] =
      await Promise.all([
        this.prisma.productionOrder.count({ where: { organizationId, technicalSheetId: id } }),
        this.prisma.menuItem.count({ where: { organizationId, technicalSheetId: id } }),
        this.prisma.menuVariantReplacement.count({
          where: { replacementTechnicalSheetId: id, variant: { organizationId } },
        }),
        this.prisma.menuCycleItem.count({ where: { organizationId, technicalSheetId: id } }),
        this.prisma.productionBatch.count({
          where: { organizationId, recipeVersion: { technicalSheetId: id } },
        }),
        this.prisma.lot.count({
          where: { organizationId, recipeVersion: { technicalSheetId: id } },
        }),
      ]);
    const productionLinks = productionOrders + batches + lots;
    const menuLinks = menuItems + menuReplacements + menuCycleItems;
    if (productionLinks || menuLinks) {
      const usages = [
        productionLinks
          ? `${productionLinks} utilisation${productionLinks > 1 ? 's' : ''} en production`
          : '',
        menuLinks ? `${menuLinks} utilisation${menuLinks > 1 ? 's' : ''} dans les menus` : '',
      ].filter(Boolean);
      throw new BadRequestException(
        `La fiche « ${sheet.name} » ne peut pas être supprimée car elle possède ${usages.join(' et ')}. Retirez d’abord ces liens.`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.productionProfile.deleteMany({ where: { organizationId, technicalSheetId: id } });
      await tx.technicalSheetVersion.deleteMany({ where: { organizationId, technicalSheetId: id } });
      await tx.technicalSheet.delete({ where: { id, organizationId } });
    });
    return { id, deleted: true };
  }

  async exportRecipePdf(organizationId: string, actor: Actor, id: string) {
    await this.assertInstalled(organizationId);
    const recipe = (await this.getRecipe(organizationId, id)) as any;
    const filename = `fiche-technique-${this.slug(recipe.name)}-${this.dateSlug()}.pdf`;
    const body = await this.recipePdf(recipe);
    await this.prisma.technicalSheetExport.create({
      data: {
        organizationId,
        technicalSheetId: id,
        format: TechnicalSheetExportFormat.PDF,
        filename,
        payload: { type: 'TECHNICAL_SHEET', recipeName: recipe.name },
        createdById: actor.id,
      },
    });
    return { filename, contentType: 'application/pdf', body };
  }

  async duplicateRecipe(
    organizationId: string,
    actor: Actor,
    id: string,
    dto: DuplicateTechnicalSheetDto,
  ) {
    await this.assertInstalled(organizationId);
    const source = (await this.getRecipe(organizationId, id)) as any;
    const name = dto.name || `${source.name} (copie)`;
    const duplicatePayload = {
      name,
      referencePortions: dto.copyGeneral === false ? 1 : Number(source.referencePortions),
      yieldMode: dto.copyGeneral === false ? TechnicalSheetYieldMode.PORTIONS : source.yieldMode,
      mode: source.mode ?? TechnicalSheetMode.ASSEMBLY,
      stockPolicy: TechnicalSheetStockPolicy.MAKE_TO_STOCK,
      status: TechnicalSheetStatus.DRAFT,
    } as UpsertTechnicalSheetDto;
    return this.prisma.$transaction(async (tx) => {
      const output = await this.resolveRecipeOutputTx(
        tx,
        organizationId,
        duplicatePayload,
        undefined,
        actor.id,
      );
      const created = await tx.technicalSheet.create({
        data: {
          organizationId,
          sourceTechnicalSheetId: id,
          name,
          description: dto.copyGeneral === false ? undefined : source.description,
          categoryId: dto.copyCategory === false ? undefined : source.categoryId,
          photoUrl: dto.copyPhoto === false ? undefined : source.photoUrl,
          photoDataUrl: dto.copyPhoto === false ? undefined : source.photoDataUrl,
          referencePortions: duplicatePayload.referencePortions,
          yieldMode: duplicatePayload.yieldMode,
          preparationTimeMinutes: dto.copyGeneral === false ? 0 : source.preparationTimeMinutes,
          cookingTimeMinutes: dto.copyGeneral === false ? 0 : source.cookingTimeMinutes,
          totalTimeMinutes: dto.copyGeneral === false ? 0 : source.totalTimeMinutes,
          status: TechnicalSheetStatus.DRAFT,
          mode: duplicatePayload.mode,
          stockPolicy: duplicatePayload.stockPolicy,
          ...output,
        },
      });
      if (dto.copyIngredients !== false)
        await this.replaceIngredients(
          tx,
          organizationId,
          created.id,
          source.ingredients.map((i: any) => ({
            productId: i.productId,
            sourceTechnicalSheetId: i.sourceTechnicalSheetId,
            unitId: i.unitId,
            quantity: Number(i.quantity),
            comment: i.comment,
            section: i.section,
            order: i.order,
          })),
        );
      if (dto.copySteps !== false)
        await this.replaceSteps(
          tx,
          organizationId,
          created.id,
          source.steps.map((s: any) => ({
            order: s.order,
            title: s.title,
            description: s.description,
            section: s.section,
            estimatedMinutes: s.estimatedMinutes ?? s.estimatedTimeMinutes,
          })),
        );
      await this.history(
        tx,
        organizationId,
        created.id,
        actor.id,
        TechnicalSheetHistoryAction.DUPLICATED,
        `Duplication depuis ${source.name}`,
        { sourceTechnicalSheetId: id },
      );
      await this.recalculateCostTx(tx, organizationId, created.id, actor.id, false);
      await this.syncProductionProfileTx(tx, organizationId, created.id, duplicatePayload, output);
      return this.serializeRecipe(
        await tx.technicalSheet.findUnique({
          where: { id: created.id },
          include: this.recipeInclude(true),
        }),
      );
    });
  }

  async recalculateCost(organizationId: string, actor: Actor, id: string) {
    await this.assertInstalled(organizationId);
    await this.ensureRecipe(organizationId, id);
    return this.serializeRecipe(
      await this.prisma.$transaction((tx) =>
        this.recalculateCostTx(tx, organizationId, id, actor.id, true),
      ),
    );
  }
  async costs(organizationId: string, q: TechnicalSheetListQueryDto = {}) {
    return this.listRecipes(organizationId, q);
  }
  async historyList(organizationId: string, id: string, q: TechnicalSheetListQueryDto = {}) {
    await this.assertInstalled(organizationId);
    return this.prisma.technicalSheetHistory.findMany({
      where: { organizationId, technicalSheetId: id },
      include: { user: { select: { email: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      ...this.page(q),
    });
  }

  async importRecipePdf(organizationId: string, file: UploadedRecipePdf) {
    await this.assertInstalled(organizationId);
    this.validateRecipePdf(file);
    return (await this.analyzeRecipeFile(organizationId, file)).result;
  }

  /** Analyse synchrone utilisée par Kokki pour les PDF et images ajoutés au chat. */
  async analyzeRecipeAttachment(organizationId: string, file: UploadedRecipePdf) {
    await this.assertInstalled(organizationId);
    this.validateRecipeFile(file);
    return (await this.analyzeRecipeFile(organizationId, file)).result;
  }

  async uploadRecipeImports(organizationId: string, actor: Actor, files: UploadedRecipePdf[]) {
    await this.assertInstalled(organizationId);
    if (!files?.length) throw new BadRequestException('Aucune fiche technique fournie.');
    if (files.length > MAX_RECIPE_IMPORT_FILES)
      throw new BadRequestException(
        `Vous pouvez importer ${MAX_RECIPE_IMPORT_FILES} fiches techniques maximum.`,
      );

    await mkdir(join(TECHNICAL_SHEETS_UPLOAD_ROOT, organizationId), { recursive: true });
    const documents: any[] = [];
    for (const file of files) {
      this.validateRecipeFile(file);
      const id = randomUUID();
      const extension = this.safeRecipeExtension(file);
      const internalFilename = `${id}${extension}`;
      const storagePath = join(organizationId, internalFilename);
      await writeFile(join(TECHNICAL_SHEETS_UPLOAD_ROOT, storagePath), file.buffer);
      const document = await this.prisma.$transaction(async (tx) => {
        const created = await tx.document.create({
          data: {
            organizationId,
            uploadedById: actor.id,
            internalFilename,
            originalName: file.originalname,
            mimeType: file.mimetype || 'application/octet-stream',
            sizeBytes: file.size ?? file.buffer.length,
            storagePath,
            contentSha256: createHash('sha256').update(file.buffer).digest('hex'),
            sourceModule: 'technical-sheets',
            sourceType: RECIPE_IMPORT_SOURCE,
            status: DocumentStatus.UPLOADED,
          },
        });
        await tx.ocrDocument.create({
          data: {
            organizationId,
            documentId: created.id,
            provider: 'mistral',
            model: process.env.OCR_MISTRAL_MODEL || 'mistral-ocr-latest',
            status: OcrProcessingStatus.PENDING,
          },
        });
        return created;
      });
      documents.push(document);
    }

    setImmediate(() => {
      void this.processRecipeImportBatch(
        organizationId,
        documents.map((document) => document.id),
      );
    });
    return { statuses: documents.map((document) => this.recipeImportStatus(document, null, null)) };
  }

  async listRecipeImportStatuses(organizationId: string) {
    await this.assertInstalled(organizationId);
    const documents = await this.prisma.document.findMany({
      where: { organizationId, sourceModule: 'technical-sheets', sourceType: RECIPE_IMPORT_SOURCE },
      include: {
        ocrDocuments: {
          include: { extractions: { orderBy: { updatedAt: 'desc' }, take: 1 } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return {
      statuses: documents.map((document) => {
        const ocr = document.ocrDocuments[0] ?? null;
        return this.recipeImportStatus(document, ocr, ocr?.extractions[0] ?? null);
      }),
    };
  }

  async retryFailedRecipeImports(organizationId: string) {
    await this.assertInstalled(organizationId);
    const failedDocuments = await this.prisma.document.findMany({
      where: {
        organizationId,
        sourceModule: 'technical-sheets',
        sourceType: RECIPE_IMPORT_SOURCE,
        status: DocumentStatus.FAILED,
      },
      include: {
        ocrDocuments: {
          include: { extractions: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    const retriedDocumentIds: string[] = [];

    for (const document of failedDocuments) {
      const reset = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.document.updateMany({
          where: {
            id: document.id,
            organizationId,
            sourceModule: 'technical-sheets',
            sourceType: RECIPE_IMPORT_SOURCE,
            status: DocumentStatus.FAILED,
          },
          data: { status: DocumentStatus.UPLOADED, sourceId: null },
        });
        if (!updated.count) return false;

        const ocrDocument = document.ocrDocuments[0];
        if (ocrDocument) {
          await tx.ocrBusinessExtraction.deleteMany({
            where: { ocrDocumentId: ocrDocument.id },
          });
          await tx.ocrDocument.updateMany({
            where: { id: ocrDocument.id, organizationId, documentId: document.id },
            data: {
              status: OcrProcessingStatus.PENDING,
              rawText: null,
              rawMarkdown: null,
              rawJson: Prisma.DbNull,
              pageCount: null,
              processingDurationMs: null,
              errorCode: null,
              errorMessage: null,
            },
          });
        }
        return true;
      });
      if (reset) retriedDocumentIds.push(document.id);
    }

    if (!retriedDocumentIds.length) return { retried: 0, statuses: [] };
    const resetDocuments = await this.prisma.document.findMany({
      where: { organizationId, id: { in: retriedDocumentIds } },
      include: {
        ocrDocuments: {
          include: { extractions: { orderBy: { updatedAt: 'desc' }, take: 1 } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    setImmediate(() => {
      void this.processRecipeImportBatch(organizationId, retriedDocumentIds);
    });
    return {
      retried: retriedDocumentIds.length,
      statuses: resetDocuments.map((document) => {
        const ocr = document.ocrDocuments[0] ?? null;
        return this.recipeImportStatus(document, ocr, ocr?.extractions[0] ?? null);
      }),
    };
  }

  async dismissRecipeImport(organizationId: string, documentId: string) {
    await this.assertInstalled(organizationId);
    const document = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        organizationId,
        sourceModule: 'technical-sheets',
        sourceType: RECIPE_IMPORT_SOURCE,
      },
      include: { ocrDocuments: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!document) throw new NotFoundException('Import de fiche technique introuvable.');
    const ocrStatus = document.ocrDocuments[0]?.status;
    if (
      document.status === DocumentStatus.UPLOADED ||
      document.status === DocumentStatus.PROCESSING ||
      ocrStatus === OcrProcessingStatus.PENDING ||
      ocrStatus === OcrProcessingStatus.PROCESSING
    ) {
      throw new BadRequestException('Impossible de retirer une analyse OCR en cours.');
    }

    const removed = await this.prisma.document.updateMany({
      where: {
        id: documentId,
        organizationId,
        sourceModule: 'technical-sheets',
        sourceType: RECIPE_IMPORT_SOURCE,
        status: { in: [DocumentStatus.FAILED, DocumentStatus.PROCESSED] },
      },
      data: { sourceType: `${RECIPE_IMPORT_SOURCE}-dismissed` },
    });
    if (!removed.count)
      throw new BadRequestException('Impossible de retirer une analyse OCR en cours.');
    return { removed: true };
  }

  async reviewRecipeImport(organizationId: string, documentId: string) {
    await this.assertInstalled(organizationId);
    await this.prisma.$transaction((tx) =>
      this.markRecipeImportReviewedTx(tx, organizationId, documentId),
    );
    return { reviewed: true };
  }

  private async markRecipeImportReviewedTx(tx: Tx, organizationId: string, documentId: string) {
    const document = await tx.document.findFirst({
      where: {
        id: documentId,
        organizationId,
        sourceModule: 'technical-sheets',
        sourceType: RECIPE_IMPORT_SOURCE,
      },
    });
    if (!document) throw new NotFoundException('Import de fiche technique introuvable.');
    if (document.sourceId)
      await tx.ocrBusinessExtraction.updateMany({
        where: { id: document.sourceId, organizationId },
        data: { status: OcrBusinessExtractionStatus.REVIEWED },
      });
    await tx.document.update({
      where: { id: document.id },
      data: { sourceType: `${RECIPE_IMPORT_SOURCE}-reviewed` },
    });
  }

  private async processRecipeImportBatch(organizationId: string, documentIds: string[]) {
    for (const documentId of documentIds) {
      await this.processRecipeImport(organizationId, documentId).catch((error) => {
        this.logger.warn(
          `Import de fiche technique échoué document=${documentId}: ${error instanceof Error ? error.message : error}`,
        );
      });
    }
  }

  private async processRecipeImport(organizationId: string, documentId: string) {
    const document = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        organizationId,
        sourceModule: 'technical-sheets',
        sourceType: RECIPE_IMPORT_SOURCE,
      },
      include: { ocrDocuments: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!document) throw new NotFoundException('Import de fiche technique introuvable.');
    const ocrDocument =
      document.ocrDocuments[0] ??
      (await this.prisma.ocrDocument.create({
        data: {
          organizationId,
          documentId,
          provider: 'mistral',
          model: process.env.OCR_MISTRAL_MODEL || 'mistral-ocr-latest',
          status: OcrProcessingStatus.PENDING,
        },
      }));
    const started = Date.now();
    await this.prisma.$transaction([
      this.prisma.document.update({
        where: { id: document.id },
        data: { status: DocumentStatus.PROCESSING },
      }),
      this.prisma.ocrDocument.update({
        where: { id: ocrDocument.id },
        data: { status: OcrProcessingStatus.PROCESSING, errorCode: null, errorMessage: null },
      }),
    ]);
    try {
      const buffer = await readFile(join(TECHNICAL_SHEETS_UPLOAD_ROOT, document.storagePath));
      const analyzed = await this.analyzeRecipeFile(organizationId, {
        originalname: document.originalName,
        mimetype: document.mimeType,
        size: document.sizeBytes,
        buffer,
      });
      await this.prisma.$transaction(async (tx) => {
        await tx.ocrDocument.update({
          where: { id: ocrDocument.id },
          data: {
            status: OcrProcessingStatus.COMPLETED,
            rawText: analyzed.ocr.markdown,
            rawMarkdown: analyzed.ocr.markdown,
            rawJson: this.jsonValue(analyzed.ocr.rawJson),
            pageCount: analyzed.ocr.pageCount,
            processingDurationMs: analyzed.ocr.durationMs ?? Date.now() - started,
          },
        });
        await tx.ocrBusinessExtraction.deleteMany({ where: { ocrDocumentId: ocrDocument.id } });
        const extraction = await tx.ocrBusinessExtraction.create({
          data: {
            organizationId,
            ocrDocumentId: ocrDocument.id,
            type: OcrExtractionType.UNKNOWN,
            status: OcrBusinessExtractionStatus.DRAFT,
            extractedJson: this.jsonValue(analyzed.result),
          },
        });
        await tx.document.update({
          where: { id: document.id },
          data: { status: DocumentStatus.PROCESSED, sourceId: extraction.id },
        });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Import OCR impossible.';
      await this.prisma
        .$transaction([
          this.prisma.document.update({
            where: { id: document.id },
            data: { status: DocumentStatus.FAILED },
          }),
          this.prisma.ocrDocument.update({
            where: { id: ocrDocument.id },
            data: {
              status: OcrProcessingStatus.FAILED,
              errorCode: 'RECIPE_IMPORT_FAILED',
              errorMessage: message,
              processingDurationMs: Date.now() - started,
            },
          }),
        ])
        .catch(() => undefined);
      throw error;
    }
  }

  private async analyzeRecipeFile(organizationId: string, file: UploadedRecipePdf) {
    this.validateRecipeFile(file);
    const [products, units, categories] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          organizationId,
          isArchived: false,
          kind: { in: STOCK_INPUT_PRODUCT_KINDS },
        },
        include: { unit: true, category: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.unit.findMany({
        where: { organizationId, isArchived: false },
        orderBy: { name: 'asc' },
      }),
      this.prisma.technicalSheetCategory.findMany({
        where: { organizationId, isArchived: false },
        orderBy: { name: 'asc' },
      }),
    ]);
    if (!units.length) throw new BadRequestException('Aucune unité Stocks active disponible.');
    const ocrInput = this.recipeOcrInput(file);
    const ocr = await this.mistralClient.ocrMarkdown(organizationId, {
      buffer: ocrInput.buffer,
      mimeType: ocrInput.mimeType,
      withAnnotation: true,
    });
    const aiImported = await this.extractRecipeFromOcr(
      organizationId,
      ocr.markdown,
      file.originalname,
    );
    const imported = this.applyKesproRecipeData(ocr.markdown, aiImported);
    const warnings = [...(imported.warnings ?? [])];
    const categoryId =
      this.matchCategory(imported.categoryName, categories)?.id ?? categories[0]?.id ?? '';
    let matchedIngredientsCount = 0;
    let newProductsCount = 0;
    const preparedIngredients = (imported.ingredients ?? [])
      .map(
        (
          ingredient: ImportedRecipeIngredient,
          index: number,
        ): PreparedImportedIngredient | null => {
          if (!ingredient.name?.trim()) {
            warnings.push(`Ingrédient sans nom ignoré à la ligne ${index + 1}.`);
            return null;
          }
          const product = this.matchProduct(
            ingredient.name ?? '',
            products,
            ingredient.sku,
            ingredient.gtin,
          );
          const unit =
            this.matchUnit(ingredient.unit, units) ??
            (product ? (units.find((item) => item.id === product.unitId) ?? product.unit) : null) ??
            units[0];
          const common = {
            unitId: unit.id,
            quantity: Math.max(Number(ingredient.quantity ?? 1) || 1, 0.001),
            comment: ingredient.comment || undefined,
            order: index,
          };
          if (product) {
            matchedIngredientsCount += 1;
            return { ...common, productId: product.id };
          }
          newProductsCount += 1;
          return {
            ...common,
            productName: ingredient.name.trim().slice(0, 180),
            productSku: ingredient.sku?.trim() || undefined,
            productGtin: ingredient.gtin?.trim() || undefined,
            createProduct: true,
          };
        },
      )
      .filter(
        (ingredient: PreparedImportedIngredient | null): ingredient is PreparedImportedIngredient =>
          Boolean(ingredient),
      );
    const result = {
      filename: file.originalname,
      pageCount: ocr.pageCount,
      matchedIngredientsCount,
      newProductsCount,
      skippedIngredientsCount: Math.max(
        (imported.ingredients ?? []).length - preparedIngredients.length,
        0,
      ),
      warnings,
      payload: {
        name: imported.name || this.nameFromFilename(file.originalname),
        description: imported.description || undefined,
        categoryId,
        mode: TechnicalSheetMode.PRODUCTION,
        stockPolicy: TechnicalSheetStockPolicy.MAKE_TO_STOCK,
        yieldMode: TechnicalSheetYieldMode.PORTIONS,
        referencePortions: Math.max(Number(imported.referencePortions ?? 1) || 1, 0.001),
        prepTimeMinutes: Math.max(Number(imported.prepTimeMinutes ?? 0) || 0, 0),
        cookTimeMinutes: Math.max(Number(imported.cookTimeMinutes ?? 0) || 0, 0),
        status: TechnicalSheetStatus.DRAFT,
        ingredients: preparedIngredients,
        steps: (imported.steps ?? []).map((step: ImportedRecipeStep, index: number) => ({
          order: index + 1,
          title: step.title || `Étape ${index + 1}`,
          description: step.description || '',
          estimatedTimeMinutes: Math.max(Number(step.estimatedTimeMinutes ?? 0) || 0, 0),
        })),
      },
    };
    return { result, ocr };
  }

  async simulate(organizationId: string, actor: Actor, dto: ProductionSimulationDto) {
    await this.assertInstalled(organizationId);
    const technicalSheetId = dto.technicalSheetId ?? dto.recipeId;
    if (!technicalSheetId)
      throw new BadRequestException('Fiche technique requise pour la simulation');
    const recipe = (await this.getRecipe(organizationId, technicalSheetId)) as any;
    const factor = new Prisma.Decimal(dto.requestedPortions).div(recipe.referencePortions);
    const allergenNames = [
      ...new Set<string>(
        recipe.ingredients.flatMap((i: any) => this.productAllergenNames(i.product)),
      ),
    ];
    const lines = recipe.ingredients.map((i: any) => ({
      ingredientId: i.id,
      productId: i.productId,
      productName: i.product?.name ?? i.productNameSnapshot,
      quantity: Number(new Prisma.Decimal(i.quantity).mul(factor)),
      unit: i.unit?.symbol,
      unitSymbol: i.unit?.symbol,
      estimatedCost: i.cost == null ? null : Number(new Prisma.Decimal(i.cost).mul(factor)),
      isCalculable: i.isCalculable,
      nonCalculableReason: i.nonCalculableReason,
      allergens: this.productAllergenNames(i.product),
    }));
    const sim = await this.prisma.technicalSheetSimulation.create({
      data: {
        organizationId,
        technicalSheetId: recipe.id,
        requestedPortions: dto.requestedPortions,
        factor,
        totalEstimatedCost: new Prisma.Decimal(recipe.totalCost ?? 0).mul(factor),
        hasNonCalculableLines: recipe.hasNonCalculableLines,
        lines,
        allergenNames,
        createdById: actor.id,
      },
      include: { technicalSheet: true },
    });
    await this.prisma.technicalSheetHistory.create({
      data: {
        organizationId,
        technicalSheetId: recipe.id,
        userId: actor.id,
        action: TechnicalSheetHistoryAction.SIMULATION_CREATED,
        summary: `Simulation pour ${dto.requestedPortions} portions`,
      },
    });
    return {
      ...sim,
      recipeId: recipe.id,
      recipe,
      estimatedCost: Number(sim.totalEstimatedCost),
      allergens: allergenNames.map((name) => ({ id: name, name })),
      simulatedAt: sim.createdAt,
      lines,
    };
  }

  async exportSimulation(
    organizationId: string,
    actor: Actor,
    simulationId: string,
    format: TechnicalSheetExportFormat,
  ) {
    await this.assertInstalled(organizationId);
    const sim = await this.prisma.technicalSheetSimulation.findFirst({
      where: { id: simulationId, organizationId },
      include: { technicalSheet: true },
    });
    if (!sim) throw new NotFoundException('Simulation introuvable');
    const extension = format === TechnicalSheetExportFormat.CSV ? 'csv' : 'pdf';
    const filename = `production-theorique-${this.slug(sim.technicalSheet.name)}-${this.dateSlug(sim.createdAt)}.${extension}`;
    await this.prisma.technicalSheetExport.create({
      data: {
        organizationId,
        technicalSheetId: sim.technicalSheetId,
        simulationId: sim.id,
        format,
        filename,
        payload: { simulationId: sim.id },
        createdById: actor.id,
      },
    });
    await this.prisma.technicalSheetHistory.create({
      data: {
        organizationId,
        technicalSheetId: sim.technicalSheetId,
        userId: actor.id,
        action: TechnicalSheetHistoryAction.EXPORT_CREATED,
        summary: `Export ${format} préparé`,
      },
    });
    return format === TechnicalSheetExportFormat.CSV
      ? { filename, contentType: 'text/csv; charset=utf-8', body: this.simulationCsv(sim as any) }
      : { filename, contentType: 'application/pdf', body: await this.simulationPdf(sim as any) };
  }

  private recipeInclude(full = false) {
    return {
      category: true,
      outputProduct: { include: { unit: true, category: true } },
      yieldUnit: true,
      productionProfiles: {
        include: { site: true, outputProduct: true, yieldUnit: true },
        orderBy: { createdAt: 'asc' as const },
      },
      ingredients: {
        orderBy: { order: 'asc' as const },
        include: {
          product: { include: { unit: true, category: true } },
          unit: true,
          sourceTechnicalSheet: { include: { outputProduct: true, yieldUnit: true } },
          allergens: { include: { allergen: true } },
        },
      },
      steps: { orderBy: { order: 'asc' as const } },
      ...(full
        ? {
            costSnapshots: { orderBy: { createdAt: 'desc' as const }, take: 20 },
            history: {
              orderBy: { createdAt: 'desc' as const },
              take: 20,
              include: { user: { select: { email: true, firstName: true, lastName: true } } },
            },
          }
        : {}),
    };
  }

  private serializeRecipe(sheet: any, salesTaxPolicy?: TechnicalSheetSalesTaxPolicy) {
    if (!sheet) return sheet;
    const ingredients = (sheet.ingredients ?? []).map((line: any) => ({
      ...line,
      quantity: Number(line.quantity),
      cost: line.cost == null ? null : Number(line.cost),
      costTotal: line.cost == null ? null : Number(line.cost),
      unitPriceSnapshot: line.unitPriceSnapshot == null ? null : Number(line.unitPriceSnapshot),
      stockUnitPrice: line.product?.averagePrice == null ? null : Number(line.product.averagePrice),
      stockUnitSymbol: line.product?.unit?.symbol ?? null,
      allergens: this.productAllergens(line.product),
    }));
    const allergensById = new Map<string, any>();
    ingredients.forEach((line: any) =>
      (line.allergens ?? []).forEach((allergen: any) =>
        allergensById.set(allergen.id ?? allergen.name, allergen),
      ),
    );
    const yieldMode =
      sheet.yieldMode === TechnicalSheetYieldMode.MASS
        ? TechnicalSheetYieldMode.MASS
        : TechnicalSheetYieldMode.PORTIONS;
    const costPerPortion =
      yieldMode === TechnicalSheetYieldMode.PORTIONS && sheet.costPerPortion != null
        ? Number(sheet.costPerPortion)
        : null;
    const targetSellingPriceExclTax =
      sheet.targetSellingPriceHtPerPortion == null
        ? null
        : Number(sheet.targetSellingPriceHtPerPortion);
    const targetSellingPriceInclTax =
      targetSellingPriceExclTax == null || salesTaxPolicy?.rate == null
        ? null
        : targetSellingPriceExclTax * (1 + salesTaxPolicy.rate / 100);
    const grossMarginAmount =
      targetSellingPriceExclTax == null || costPerPortion == null
        ? null
        : targetSellingPriceExclTax - costPerPortion;
    const grossMarginRate =
      grossMarginAmount == null || !targetSellingPriceExclTax
        ? null
        : (grossMarginAmount / targetSellingPriceExclTax) * 100;
    return {
      ...sheet,
      status: [TechnicalSheetStatus.ACTIVE, TechnicalSheetStatus.VALIDATED].includes(sheet.status)
        ? TechnicalSheetStatus.ACTIVE
        : TechnicalSheetStatus.DRAFT,
      trackOutputStock: Boolean(sheet.outputProductId),
      yieldMode,
      referencePortions: Number(sheet.referencePortions ?? 0),
      portions: Number(sheet.referencePortions ?? 0),
      totalMassGrams: Number(sheet.totalMassGrams ?? 0),
      referenceYield: Number(
        yieldMode === TechnicalSheetYieldMode.MASS
          ? (sheet.totalMassGrams ?? 0)
          : (sheet.referencePortions ?? 0),
      ),
      prepTimeMinutes: sheet.preparationTimeMinutes,
      cookTimeMinutes: sheet.cookingTimeMinutes,
      costTotal: sheet.totalCost == null ? null : Number(sheet.totalCost),
      totalCost: sheet.totalCost == null ? null : Number(sheet.totalCost),
      costPerPortion,
      costPerKg: sheet.costPerKg == null ? null : Number(sheet.costPerKg),
      costPerLiter: sheet.costPerLiter == null ? null : Number(sheet.costPerLiter),
      targetSellingPriceHtPerPortion: targetSellingPriceExclTax,
      targetSellingPriceExclTax,
      targetSellingPriceInclTax,
      grossMarginAmount,
      grossMarginRate,
      salesTaxRate: salesTaxPolicy?.rate ?? null,
      regulatoryCountryCode: salesTaxPolicy?.countryCode ?? null,
      duplicatedFromId: sheet.sourceTechnicalSheetId,
      ingredients,
      steps: (sheet.steps ?? []).map((step: any) => ({
        ...step,
        estimatedTimeMinutes: step.estimatedMinutes,
      })),
      allergens: [...allergensById.values()],
      nonCalculableLinesCount: ingredients.filter((line: any) => !line.isCalculable).length,
    };
  }
  private async salesTaxPolicy(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { regulatoryCountryCode: true },
    });
    return technicalSheetSalesTaxPolicy(organization?.regulatoryCountryCode);
  }
  private recipeCreateData(
    organizationId: string,
    dto: UpsertTechnicalSheetDto,
  ): Prisma.TechnicalSheetUncheckedCreateInput {
    const prep = dto.preparationTimeMinutes ?? dto.prepTimeMinutes ?? 0;
    const cook = dto.cookingTimeMinutes ?? dto.cookTimeMinutes ?? 0;
    return {
      organizationId,
      name: dto.name,
      description: dto.description,
      categoryId: dto.categoryId || null,
      photoUrl: dto.photoUrl,
      photoDataUrl: dto.photoDataUrl,
      yieldMode: dto.yieldMode ?? TechnicalSheetYieldMode.PORTIONS,
      referencePortions: dto.referencePortions ?? 1,
      preparationTimeMinutes: prep,
      cookingTimeMinutes: cook,
      totalTimeMinutes: dto.totalTimeMinutes ?? prep + cook,
      status: this.visibleRecipeStatus(dto.status),
      mode: dto.mode ?? TechnicalSheetMode.ASSEMBLY,
      stockPolicy: TechnicalSheetStockPolicy.MAKE_TO_STOCK,
    };
  }

  private recipeUpdateData(
    dto: UpsertTechnicalSheetDto,
  ): Prisma.TechnicalSheetUncheckedUpdateInput {
    const prep = dto.preparationTimeMinutes ?? dto.prepTimeMinutes ?? 0;
    const cook = dto.cookingTimeMinutes ?? dto.cookTimeMinutes ?? 0;
    return {
      name: dto.name,
      description: dto.description,
      categoryId: dto.categoryId || null,
      photoUrl: dto.photoUrl,
      photoDataUrl: dto.photoDataUrl,
      yieldMode: dto.yieldMode,
      referencePortions: dto.referencePortions,
      preparationTimeMinutes: prep,
      cookingTimeMinutes: cook,
      totalTimeMinutes: dto.totalTimeMinutes ?? prep + cook,
      status: this.visibleRecipeStatus(dto.status),
      mode: dto.mode,
      stockPolicy: TechnicalSheetStockPolicy.MAKE_TO_STOCK,
    };
  }

  private async resolveRecipeOutputTx(
    tx: Tx,
    organizationId: string,
    dto: UpsertTechnicalSheetDto,
    current?: {
      outputProductId: string | null;
      yieldUnitId: string | null;
      mode: TechnicalSheetMode;
      yieldMode?: TechnicalSheetYieldMode;
    },
    actorId?: string | null,
  ) {
    const mode = dto.mode ?? current?.mode ?? TechnicalSheetMode.ASSEMBLY;
    const yieldMode = dto.yieldMode ?? current?.yieldMode ?? TechnicalSheetYieldMode.PORTIONS;
    const expectedKind =
      mode === TechnicalSheetMode.PRODUCTION ? ProductKind.INTERMEDIATE : ProductKind.FINISHED;
    const requestedUnit =
      yieldMode === TechnicalSheetYieldMode.MASS
        ? await this.massUnitTx(tx, organizationId, dto.yieldUnitId)
        : await this.portionUnitTx(tx, organizationId, dto.yieldUnitId);
    let product =
      dto.outputProductId || current?.outputProductId
        ? await tx.product.findFirst({
            where: {
              id: dto.outputProductId || current?.outputProductId || undefined,
              organizationId,
              isArchived: false,
            },
            include: { unit: true },
          })
        : null;
    if (dto.outputProductId && !product) {
      throw new NotFoundException('Produit fabriqué introuvable ou archivé.');
    }

    if (!product) {
      const name = dto.name.trim();
      product = await tx.product.findFirst({
        where: { organizationId, isArchived: false, name: { equals: name, mode: 'insensitive' } },
        include: { unit: true },
      });
      if (!product) {
        product = await tx.product.create({
          data: {
            organizationId,
            name,
            unitId: requestedUnit.id,
            averagePrice: new Prisma.Decimal(0),
            kind: expectedKind,
          },
          include: { unit: true },
        });
        await tx.auditLog.create({
          data: {
            organizationId,
            userId: actorId || null,
            action: AuditAction.PRODUCT_CREATED,
            entityType: 'Product',
            entityId: product.id,
            entityName: product.name,
            details: { source: 'technical-sheet-output' } as Prisma.InputJsonValue,
          },
        });
      }
    }

    if (!product)
      throw new BadRequestException('La sortie technique de la fiche n’a pas pu être créée.');
    if (product.kind !== expectedKind || product.unitId !== requestedUnit.id) {
      product = await tx.product.update({
        where: { id: product.id },
        data: { kind: expectedKind, unitId: requestedUnit.id },
        include: { unit: true },
      });
    }
    return { outputProductId: product.id, yieldUnitId: requestedUnit.id };
  }

  private async portionUnitTx(tx: Tx, organizationId: string, preferredUnitId?: string) {
    if (preferredUnitId) {
      const preferred = await tx.unit.findFirst({
        where: { id: preferredUnitId, organizationId, isArchived: false, type: UnitType.COUNT },
      });
      if (preferred) return preferred;
    }
    const countUnit = await tx.unit.findFirst({
      where: { organizationId, isArchived: false, type: UnitType.COUNT },
      orderBy: { createdAt: 'asc' },
    });
    if (countUnit) return countUnit;
    return tx.unit.upsert({
      where: { organizationId_symbol: { organizationId, symbol: 'portion' } },
      update: { name: 'Portion', type: UnitType.COUNT, isArchived: false, archivedAt: null },
      create: { organizationId, name: 'Portion', symbol: 'portion', type: UnitType.COUNT },
    });
  }

  private async massUnitTx(tx: Tx, organizationId: string, preferredUnitId?: string) {
    if (preferredUnitId) {
      const preferred = await tx.unit.findFirst({
        where: {
          id: preferredUnitId,
          organizationId,
          isArchived: false,
          type: UnitType.MASS,
        },
      });
      if (preferred && this.massFactorToGrams(preferred.symbol) === 1) return preferred;
    }
    const gramUnit = await tx.unit.findFirst({
      where: {
        organizationId,
        isArchived: false,
        type: UnitType.MASS,
        symbol: { in: ['g', 'gr', 'G', 'GR'] },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (gramUnit) return gramUnit;
    return tx.unit.upsert({
      where: { organizationId_symbol: { organizationId, symbol: 'g' } },
      update: {
        name: 'Gramme',
        type: UnitType.MASS,
        isArchived: false,
        archivedAt: null,
      },
      create: {
        organizationId,
        name: 'Gramme',
        symbol: 'g',
        type: UnitType.MASS,
      },
    });
  }

  private async syncProductionProfileTx(
    tx: Tx,
    organizationId: string,
    technicalSheetId: string,
    dto: UpsertTechnicalSheetDto,
    output: { outputProductId: string | null; yieldUnitId: string | null },
  ) {
    if (!output.outputProductId || !output.yieldUnitId) {
      await tx.productionProfile.deleteMany({ where: { organizationId, technicalSheetId } });
      return;
    }
    const sites = await tx.site.findMany({
      where: { organizationId, isArchived: false },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!sites.length) return;
    const sheet = await tx.technicalSheet.findUnique({
      where: { id: technicalSheetId },
      select: {
        yieldMode: true,
        referencePortions: true,
        totalMassGrams: true,
      },
    });
    if (!sheet) throw new NotFoundException('Fiche technique introuvable.');
    const data = {
      outputProductId: output.outputProductId,
      yieldUnitId: output.yieldUnitId,
      referenceYield: this.referenceYield(sheet),
    };
    for (const site of sites) {
      const profile = await tx.productionProfile.findFirst({
        where: { organizationId, siteId: site.id, technicalSheetId, outputVariantId: null },
        orderBy: { createdAt: 'asc' },
      });
      if (profile) {
        await tx.productionProfile.update({ where: { id: profile.id }, data });
      } else {
        await tx.productionProfile.create({
          data: {
            organizationId,
            siteId: site.id,
            technicalSheetId,
            ...data,
            mode: ProductionProfileMode.FIXED,
          },
        });
      }
    }
  }

  private async replaceChildren(
    tx: Tx,
    organizationId: string,
    id: string,
    dto: UpsertTechnicalSheetDto,
    actorId?: string | null,
  ) {
    if (dto.ingredients)
      await this.replaceIngredients(tx, organizationId, id, dto.ingredients, actorId);
    if (dto.steps) await this.replaceSteps(tx, organizationId, id, dto.steps);
  }
  private async replaceIngredients(
    tx: Tx,
    organizationId: string,
    technicalSheetId: string,
    ingredients: NonNullable<UpsertTechnicalSheetDto['ingredients']>,
    actorId?: string | null,
  ) {
    const parentSheet = await tx.technicalSheet.findFirst({
      where: { id: technicalSheetId, organizationId },
      select: { mode: true },
    });
    if (!parentSheet) throw new NotFoundException('Fiche technique introuvable.');
    await tx.technicalSheetIngredient.deleteMany({ where: { technicalSheetId } });
    for (const [idx, line] of ingredients.entries()) {
      if (line.sourceTechnicalSheetId && parentSheet.mode === TechnicalSheetMode.PRODUCTION) {
        throw new BadRequestException(
          'Une fiche de fabrication utilise uniquement des produits Stocks, sans sous-recette.',
        );
      }
      const sourceTechnicalSheet = line.sourceTechnicalSheetId
        ? await tx.technicalSheet.findFirst({
            where: {
              id: line.sourceTechnicalSheetId,
              organizationId,
              isArchived: false,
            },
            include: { outputProduct: { include: { unit: true } }, yieldUnit: true },
          })
        : null;
      if (line.sourceTechnicalSheetId && !sourceTechnicalSheet) {
        throw new NotFoundException('Sous-recette introuvable ou archivée.');
      }
      if (sourceTechnicalSheet) {
        if (sourceTechnicalSheet.id === technicalSheetId) {
          throw new BadRequestException('Une fiche technique ne peut pas se contenir elle-même.');
        }
        if (sourceTechnicalSheet.mode !== TechnicalSheetMode.PRODUCTION) {
          throw new BadRequestException(
            `« ${sourceTechnicalSheet.name} » doit être une fiche de fabrication pour être utilisée comme sous-recette.`,
          );
        }
        if (
          sourceTechnicalSheet.status !== TechnicalSheetStatus.ACTIVE &&
          sourceTechnicalSheet.status !== TechnicalSheetStatus.VALIDATED
        ) {
          throw new BadRequestException(
            `La sous-recette « ${sourceTechnicalSheet.name} » doit être active.`,
          );
        }
        if (!sourceTechnicalSheet.outputProductId || !sourceTechnicalSheet.outputProduct) {
          throw new BadRequestException(
            `La sous-recette « ${sourceTechnicalSheet.name} » n’a pas de produit fabriqué.`,
          );
        }
        await this.assertNoSubRecipeCycleTx(
          tx,
          organizationId,
          technicalSheetId,
          sourceTechnicalSheet.id,
        );
      }
      const unit = await tx.unit.findFirst({
        where: { id: line.unitId, organizationId, isArchived: false },
      });
      if (!unit) throw new NotFoundException('Unité Stocks introuvable');
      const effectiveProductId = line.productId || sourceTechnicalSheet?.outputProductId;
      let product = effectiveProductId
        ? await tx.product.findFirst({
            where: { id: effectiveProductId, organizationId, isArchived: false },
            include: { unit: true },
          })
        : null;
      if (
        !sourceTechnicalSheet &&
        product &&
        (product.kind === ProductKind.INTERMEDIATE || product.kind === ProductKind.FINISHED)
      ) {
        throw new BadRequestException(
          `« ${product.name} » est une production interne. Ajoutez sa fiche technique comme sous-recette plutôt que comme produit Stocks.`,
        );
      }
      if (
        sourceTechnicalSheet?.outputProductId &&
        product &&
        product.id !== sourceTechnicalSheet.outputProductId
      ) {
        throw new BadRequestException(
          `Le produit choisi ne correspond pas à la sortie de « ${sourceTechnicalSheet.name} ».`,
        );
      }
      if (!product && line.createProduct && line.productName?.trim()) {
        const name = line.productName.trim();
        const sku = line.productSku?.trim() || null;
        const gtin = line.productGtin?.trim() || null;
        product = await tx.product.findFirst({
          where: {
            organizationId,
            isArchived: false,
            OR: [
              { name: { equals: name, mode: 'insensitive' } },
              ...(sku ? [{ sku }] : []),
              ...(gtin ? [{ gtin }] : []),
            ],
          },
          include: { unit: true },
        });
        if (!product) {
          product = await tx.product.create({
            data: {
              organizationId,
              name,
              sku,
              gtin,
              unitId: unit.id,
              averagePrice: new Prisma.Decimal(0),
            },
            include: { unit: true },
          });
          await tx.auditLog.create({
            data: {
              organizationId,
              userId: actorId || null,
              action: AuditAction.PRODUCT_CREATED,
              entityType: 'Product',
              entityId: product.id,
              entityName: product.name,
              details: {
                source: 'technical-sheet-pdf-import',
                technicalSheetId,
              } as Prisma.InputJsonValue,
            },
          });
        }
      }
      if (!product)
        throw new BadRequestException(
          'Chaque ingrédient doit être associé à un produit Stocks ou marqué comme nouveau produit.',
        );
      await tx.technicalSheetIngredient.create({
        data: {
          organizationId,
          technicalSheetId,
          sourceTechnicalSheetId: sourceTechnicalSheet?.id,
          productId: product.id,
          unitId: unit.id,
          quantity: line.quantity,
          comment: line.comment,
          section: line.section?.trim() || null,
          order: line.order ?? idx,
          productNameSnapshot: product.name,
          unitSymbolSnapshot: unit.symbol,
          productUnitIdSnapshot: product.unitId,
          productUnitSymbolSnapshot: product.unit.symbol,
          productArchivedSnapshot: product.isArchived,
        },
      });
    }
  }

  private visibleRecipeStatus(status?: TechnicalSheetStatus) {
    return status === TechnicalSheetStatus.ACTIVE || status === TechnicalSheetStatus.VALIDATED
      ? TechnicalSheetStatus.ACTIVE
      : TechnicalSheetStatus.DRAFT;
  }

  private async assertRecipeCanBeActiveTx(tx: Tx, technicalSheetId: string) {
    const sheet = await tx.technicalSheet.findUnique({
      where: { id: technicalSheetId },
      select: {
        name: true,
        status: true,
        mode: true,
        yieldMode: true,
        referencePortions: true,
        totalMassGrams: true,
        _count: { select: { ingredients: true, steps: true } },
      },
    });
    if (!sheet) return;
    if (sheet.mode === TechnicalSheetMode.PRODUCTION) {
      const subRecipeCount = await tx.technicalSheetIngredient.count({
        where: { technicalSheetId, sourceTechnicalSheetId: { not: null } },
      });
      if (subRecipeCount) {
        throw new BadRequestException(
          'Une fiche de fabrication utilise uniquement des produits Stocks, sans sous-recette.',
        );
      }
    }
    if (sheet.status !== TechnicalSheetStatus.ACTIVE) return;
    const invalidStepDuration = await tx.technicalSheetStep.findFirst({
      where: {
        technicalSheetId,
        OR: [{ estimatedMinutes: null }, { estimatedMinutes: { lte: 0 } }],
      },
      orderBy: { order: 'asc' },
      select: { order: true, title: true },
    });
    if (invalidStepDuration) {
      const stepLabel = invalidStepDuration.title.trim()
        ? `« ${invalidStepDuration.title.trim()} »`
        : `n° ${Math.max(1, invalidStepDuration.order)}`;
      throw new BadRequestException(
        `Indiquez une durée entière supérieure à 0 minute pour l’étape ${stepLabel}.`,
      );
    }
    if (sheet.yieldMode === TechnicalSheetYieldMode.PORTIONS && sheet.referencePortions.lte(0)) {
      throw new BadRequestException('Le nombre de portions obtenues doit être supérieur à zéro.');
    }
    if (sheet.yieldMode === TechnicalSheetYieldMode.MASS && sheet.totalMassGrams.lte(0)) {
      throw new BadRequestException(
        'La masse totale doit être calculable à partir d’au moins un ingrédient en unité de masse.',
      );
    }
    if (!sheet._count.ingredients) {
      throw new BadRequestException(
        'Ajoutez au moins un ingrédient avant de rendre la fiche active.',
      );
    }
    if (sheet.mode === TechnicalSheetMode.PRODUCTION && !sheet._count.steps) {
      throw new BadRequestException(
        'Ajoutez au moins une étape avant de rendre une fabrication active.',
      );
    }
  }
  private async assertNoSubRecipeCycleTx(
    tx: Tx,
    organizationId: string,
    parentTechnicalSheetId: string,
    sourceTechnicalSheetId: string,
  ) {
    const pending = [sourceTechnicalSheetId];
    const visited = new Set<string>();
    while (pending.length) {
      const current = pending.shift()!;
      if (current === parentTechnicalSheetId) {
        throw new BadRequestException(
          'Cycle de sous-recettes détecté. Vérifiez la composition des fiches.',
        );
      }
      if (visited.has(current)) continue;
      visited.add(current);
      const children = await tx.technicalSheetIngredient.findMany({
        where: {
          organizationId,
          technicalSheetId: current,
          sourceTechnicalSheetId: { not: null },
        },
        select: { sourceTechnicalSheetId: true },
      });
      children.forEach((child) => {
        if (child.sourceTechnicalSheetId) pending.push(child.sourceTechnicalSheetId);
      });
    }
  }
  private assertStepDurations(steps: NonNullable<UpsertTechnicalSheetDto['steps']>) {
    const invalidStepIndex = steps.findIndex((step) => {
      const duration = step.estimatedMinutes ?? step.estimatedTimeMinutes;
      return !Number.isInteger(duration) || Number(duration) <= 0;
    });
    if (invalidStepIndex < 0) return;
    const invalidStep = steps[invalidStepIndex];
    const stepLabel = invalidStep.title?.trim()
      ? `« ${invalidStep.title.trim()} »`
      : `n° ${invalidStepIndex + 1}`;
    throw new BadRequestException(
      `Indiquez une durée entière supérieure à 0 minute pour l’étape ${stepLabel}.`,
    );
  }

  private async replaceSteps(
    tx: Tx,
    organizationId: string,
    technicalSheetId: string,
    steps: NonNullable<UpsertTechnicalSheetDto['steps']>,
  ) {
    this.assertStepDurations(steps);
    await tx.technicalSheetStep.deleteMany({ where: { technicalSheetId } });
    await tx.technicalSheetStep.createMany({
      data: steps.map((step, index) => ({
        organizationId,
        technicalSheetId,
        order: step.order ?? index,
        title: step.title ?? `Étape ${index + 1}`,
        description: step.description ?? '',
        section: step.section?.trim() || null,
        estimatedMinutes: step.estimatedMinutes ?? step.estimatedTimeMinutes,
      })),
    });
  }
  private async recalculateCostTx(
    tx: Tx,
    organizationId: string,
    technicalSheetId: string,
    userId: string | null,
    snapshot: boolean,
  ) {
    const recipe = await tx.technicalSheet.findUnique({
      where: { id: technicalSheetId },
      include: {
        ingredients: {
          include: {
            product: { include: { unit: true } },
            unit: true,
            sourceTechnicalSheet: {
              select: {
                yieldMode: true,
                referencePortions: true,
                totalMassGrams: true,
              },
            },
          },
        },
      },
    });
    if (!recipe) throw new NotFoundException('Fiche technique introuvable');

    let total = new Prisma.Decimal(0);
    let totalMassGrams = new Prisma.Decimal(0);
    const details: any[] = [];
    let hasNonCalculable = false;
    const gramUnit = await this.findGramUnitTx(tx, organizationId);

    for (const line of recipe.ingredients) {
      const calc = await this.calculateLine(tx, organizationId, line);
      const lineMass = await this.ingredientMassGramsTx(
        tx,
        organizationId,
        line,
        gramUnit?.id ?? null,
      );
      hasNonCalculable ||= !calc.isCalculable;
      if (calc.cost) total = total.add(calc.cost);
      if (lineMass) totalMassGrams = totalMassGrams.add(lineMass);
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
      details.push({
        ingredientId: line.id,
        productId: line.productId,
        productName: line.product.name,
        stockUnitPrice: line.product.averagePrice.toString(),
        stockUnitSymbol: line.product.unit.symbol,
        quantity: line.quantity.toString(),
        unitSymbol: line.unit.symbol,
        massGrams: lineMass?.toString() ?? null,
        cost: calc.cost?.toString() ?? null,
        isCalculable: calc.isCalculable,
        reason: calc.reason,
      });
    }

    const perPortion =
      recipe.yieldMode === TechnicalSheetYieldMode.PORTIONS && !recipe.referencePortions.isZero()
        ? total.div(recipe.referencePortions)
        : new Prisma.Decimal(0);
    const perKg = totalMassGrams.isZero() ? null : total.div(totalMassGrams.div(1000));
    const updated = await tx.technicalSheet.update({
      where: { id: technicalSheetId },
      data: {
        totalCost: total,
        costPerPortion: perPortion,
        costPerKg: perKg,
        totalMassGrams,
        hasNonCalculableLines: hasNonCalculable,
        lastCostCalculationAt: new Date(),
      },
      include: this.recipeInclude(true),
    });
    if (snapshot) {
      await tx.technicalSheetCostSnapshot.create({
        data: {
          organizationId,
          technicalSheetId,
          totalCost: total,
          costPerPortion: perPortion,
          costPerKg: perKg,
          hasNonCalculableLines: hasNonCalculable,
          lineDetails: details,
        },
      });
    }
    await this.history(
      tx,
      organizationId,
      technicalSheetId,
      userId,
      TechnicalSheetHistoryAction.COST_RECALCULATED,
      'Recalcul du coût matière et de la masse totale',
      {
        totalCost: total.toString(),
        totalMassGrams: totalMassGrams.toString(),
        hasNonCalculableLines: hasNonCalculable,
      },
    );
    return updated;
  }

  private async findGramUnitTx(tx: Tx, organizationId: string) {
    return tx.unit.findFirst({
      where: {
        organizationId,
        isArchived: false,
        type: UnitType.MASS,
        symbol: { in: ['g', 'gr', 'G', 'GR'] },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async ingredientMassGramsTx(
    tx: Tx,
    organizationId: string,
    line: any,
    gramUnitId: string | null,
  ) {
    const quantity = new Prisma.Decimal(line.quantity);
    const source = line.sourceTechnicalSheet;
    if (source) {
      if (source.yieldMode === TechnicalSheetYieldMode.MASS) {
        const factor = this.massFactorToGrams(line.unit.symbol);
        return factor == null ? null : quantity.mul(factor);
      }
      if (
        source.totalMassGrams == null ||
        new Prisma.Decimal(source.totalMassGrams).isZero() ||
        new Prisma.Decimal(source.referencePortions).isZero()
      ) {
        return null;
      }
      return new Prisma.Decimal(source.totalMassGrams).mul(quantity).div(source.referencePortions);
    }
    if (line.unit.type !== UnitType.MASS) {
      const unitWeight = new Prisma.Decimal(
        line.product.unitWeightGrams ?? line.product.netWeightGrams ?? 0,
      );
      if (unitWeight.lte(0)) return null;
      let quantityInStockUnit = quantity;
      if (line.unitId !== line.product.unitId) {
        const conversion = await tx.unitConversion.findFirst({
          where: {
            organizationId,
            fromUnitId: line.unitId,
            toUnitId: line.product.unitId,
          },
        });
        if (!conversion) return null;
        quantityInStockUnit = quantityInStockUnit.mul(conversion.factor);
      }
      return quantityInStockUnit.mul(unitWeight);
    }
    const builtInFactor = this.massFactorToGrams(line.unit.symbol);
    if (builtInFactor != null) return quantity.mul(builtInFactor);
    if (!gramUnitId) return null;
    if (line.unitId === gramUnitId) return quantity;
    const direct = await tx.unitConversion.findFirst({
      where: {
        organizationId,
        fromUnitId: line.unitId,
        toUnitId: gramUnitId,
      },
    });
    if (direct) return quantity.mul(direct.factor);
    const reverse = await tx.unitConversion.findFirst({
      where: {
        organizationId,
        fromUnitId: gramUnitId,
        toUnitId: line.unitId,
      },
    });
    return reverse && !reverse.factor.isZero() ? quantity.div(reverse.factor) : null;
  }

  private massFactorToGrams(symbol?: string | null) {
    const normalized = String(symbol ?? '')
      .trim()
      .toLocaleLowerCase('fr');
    return (
      {
        t: 1_000_000,
        tonne: 1_000_000,
        tonnes: 1_000_000,
        kg: 1_000,
        kilo: 1_000,
        kilos: 1_000,
        kilogramme: 1_000,
        kilogrammes: 1_000,
        g: 1,
        gr: 1,
        gramme: 1,
        grammes: 1,
        mg: 0.001,
      }[normalized] ?? null
    );
  }

  private referenceYield(sheet: {
    yieldMode: TechnicalSheetYieldMode;
    referencePortions: Prisma.Decimal;
    totalMassGrams: Prisma.Decimal;
  }) {
    return sheet.yieldMode === TechnicalSheetYieldMode.MASS
      ? sheet.totalMassGrams
      : sheet.referencePortions;
  }
  private async calculateLine(tx: Tx, organizationId: string, line: any) {
    if (line.product.isArchived)
      return { isCalculable: false, cost: null, reason: 'Produit Stocks archivé' };
    let qty = new Prisma.Decimal(line.quantity);
    if (line.sourceTechnicalSheetId) {
      const source = await tx.technicalSheet.findFirst({
        where: { id: line.sourceTechnicalSheetId, organizationId, isArchived: false },
      });
      if (!source || !source.yieldUnitId) {
        return {
          isCalculable: false,
          cost: null,
          reason: 'Rendement de la sous-recette indisponible',
        };
      }
      const sourceReferenceYield = this.referenceYield(source);
      if (sourceReferenceYield.isZero()) {
        return {
          isCalculable: false,
          cost: null,
          reason: 'Rendement de la sous-recette indisponible',
        };
      }
      if (line.unitId !== source.yieldUnitId) {
        const conversion = await tx.unitConversion.findFirst({
          where: { organizationId, fromUnitId: line.unitId, toUnitId: source.yieldUnitId },
        });
        if (!conversion) {
          return {
            isCalculable: false,
            cost: null,
            reason: 'Conversion vers la sous-recette indisponible',
          };
        }
        qty = qty.mul(conversion.factor);
      }
      return {
        isCalculable: true,
        cost: source.totalCost.mul(qty).div(sourceReferenceYield),
        reason: null,
      };
    }
    if (line.unitId !== line.product.unitId) {
      const conv = await tx.unitConversion.findFirst({
        where: { organizationId, fromUnitId: line.unitId, toUnitId: line.product.unitId },
      });
      if (!conv)
        return {
          isCalculable: false,
          cost: null,
          reason: 'Conversion unité indisponible dans Stocks',
        };
      qty = qty.mul(conv.factor);
    }
    return { isCalculable: true, cost: qty.mul(line.product.averagePrice), reason: null };
  }
  private async history(
    tx: Tx,
    organizationId: string,
    technicalSheetId: string,
    userId: string | null,
    action: TechnicalSheetHistoryAction,
    summary: string,
    details?: Prisma.InputJsonValue,
  ) {
    await tx.technicalSheetHistory.create({
      data: { organizationId, technicalSheetId, userId: userId || null, action, summary, details },
    });
  }
  private async ensureCategory(organizationId: string, id: string) {
    const item = await this.prisma.technicalSheetCategory.findFirst({
      where: { id, organizationId },
    });
    if (!item) throw new NotFoundException('Catégorie recette introuvable');
    return item;
  }
  private async ensureRecipe(organizationId: string, id: string) {
    const item = await this.prisma.technicalSheet.findFirst({ where: { id, organizationId } });
    if (!item) throw new NotFoundException('Fiche technique introuvable');
    return item;
  }
  private installedApps(org: any) {
    return [
      ...(org?.stocksInstalledAt ? ['stocks'] : []),
      ...(org?.rnmPricesInstalledAt ? ['rnm-prices'] : []),
      ...(org?.hrInstalledAt ? ['hr'] : []),
      ...(org?.planningInstalledAt ? ['planning'] : []),
      ...(org?.technicalSheetsInstalledAt ? ['technical-sheets'] : []),
    ];
  }
  private simulationCsv(sim: any) {
    const lines = Array.isArray(sim.lines) ? sim.lines : [];
    const rows: unknown[][] = [
      ['Fiche technique', sim.technicalSheet?.name ?? ''],
      ['Portions demandees', sim.requestedPortions ?? ''],
      ['Cout estime', this.formatMoney(sim.totalEstimatedCost ?? 0)],
      ['Allergenes produits', (sim.allergenNames ?? []).join(', ')],
      [],
      ['Produit', 'Quantite', 'Unite', 'Cout estime', 'Allergenes produits'],
      ...lines.map((line: any) => [
        line.productName,
        this.formatNumber(line.quantity),
        line.unitSymbol ?? line.unit ?? '',
        this.formatMoney(line.estimatedCost ?? 0),
        (line.allergens ?? []).join(', '),
      ]),
    ];
    return `\ufeff${rows.map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n')}`;
  }

  private async recipePdf(recipe: any) {
    const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
    const steps = Array.isArray(recipe.steps) ? recipe.steps : [];
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 42,
        info: { Title: `Fiche technique - ${recipe.name}`, Author: 'ToqueHub' },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width;
      const contentWidth = pageWidth - 84;
      const addPage = () => {
        doc.addPage({ size: 'A4', margin: 42 });
        return 48;
      };
      const ensureSpace = (y: number, height: number) =>
        y + height > doc.page.height - 52 ? addPage() : y;

      doc.rect(0, 0, pageWidth, 136).fill('#073f3a');
      // Signature de marque compacte : toque blanche dessinée en vectoriel, puis nom ToqueHub.
      doc.circle(49, 29, 5.5).fill('#ffffff');
      doc.circle(57, 25.5, 6.5).fill('#ffffff');
      doc.circle(65, 29, 5.5).fill('#ffffff');
      doc.roundedRect(49, 29, 16, 11, 2).fill('#ffffff');
      doc.rect(51, 38, 12, 2).fill('#073f3a');
      doc.fillColor('#ffffff').fontSize(13).font('Helvetica-Bold').text('ToqueHub', 74, 24, {
        width: 110,
      });
      doc
        .fillColor('#a7f3d0')
        .fontSize(7.5)
        .font('Helvetica-Bold')
        .text('FICHE TECHNIQUE', 42, 50, { characterSpacing: 0.6 });
      const recipeTitleSize =
        recipe.name.length > 58 ? 20 : recipe.name.length > 36 ? 24 : 28;
      doc
        .fillColor('#ffffff')
        .fontSize(recipeTitleSize)
        .font('Helvetica-Bold')
        .text(recipe.name, 42, 73, {
          width: contentWidth,
          height: 48,
          align: 'center',
          lineGap: 1,
        });

      let y = 158;
      const yieldLabel =
        recipe.yieldMode === TechnicalSheetYieldMode.MASS
          ? `${this.formatNumber(Number(recipe.totalMassGrams ?? 0) / 1000)} kg`
          : `${this.formatNumber(recipe.referencePortions ?? 0)} portions`;
      const summary = [
        ['CATÉGORIE', recipe.category?.name ?? 'Sans catégorie'],
        ['RENDEMENT', yieldLabel],
        ['COÛT TOTAL', this.formatMoney(recipe.totalCost ?? recipe.costTotal ?? 0)],
      ];
      const cardWidth = (contentWidth - 20) / 3;
      summary.forEach(([label, value], index) => {
        const x = 42 + index * (cardWidth + 10);
        doc.roundedRect(x, y, cardWidth, 62, 8).fillAndStroke('#f8fafc', '#dbe7e5');
        doc.fillColor('#64748b').fontSize(7.5).font('Helvetica-Bold').text(label, x + 11, y + 11);
        doc
          .fillColor('#0f172a')
          .fontSize(11)
          .font('Helvetica-Bold')
          .text(String(value), x + 11, y + 29, { width: cardWidth - 22, height: 24 });
      });
      y += 82;

      if (recipe.description) {
        doc.fillColor('#0f172a').fontSize(12).font('Helvetica-Bold').text('Description', 42, y);
        y += 19;
        doc
          .fillColor('#475569')
          .fontSize(9)
          .font('Helvetica')
          .text(recipe.description, 42, y, { width: contentWidth, lineGap: 2 });
        y = doc.y + 18;
      }

      y = ensureSpace(y, 82);
      doc.fillColor('#0f172a').fontSize(13).font('Helvetica-Bold').text('Ingrédients', 42, y);
      y += 23;
      const drawIngredientHeader = (top: number) => {
        doc.roundedRect(42, top, contentWidth, 23, 5).fill('#ecfdf5');
        doc.fillColor('#065f46').fontSize(7.5).font('Helvetica-Bold');
        doc.text('INGRÉDIENT', 50, top + 8, { width: 245 });
        doc.text('QUANTITÉ', 300, top + 8, { width: 95, align: 'right' });
        doc.text('COÛT', 405, top + 8, { width: 95, align: 'right' });
        return top + 29;
      };
      y = drawIngredientHeader(y);
      if (!ingredients.length) {
        doc.fillColor('#64748b').fontSize(9).font('Helvetica').text('Aucun ingrédient renseigné.', 50, y);
        y += 28;
      } else {
        ingredients.forEach((line: any) => {
          if (y + 27 > doc.page.height - 52) y = drawIngredientHeader(addPage());
          const name =
            line.sourceTechnicalSheet?.name ??
            line.product?.name ??
            line.productNameSnapshot ??
            'Ingrédient';
          const unit = line.unit?.symbol ?? line.unitSymbolSnapshot ?? '';
          doc.fillColor('#0f172a').fontSize(8.5).font('Helvetica').text(name, 50, y, {
            width: 245,
            height: 18,
          });
          doc.text(`${this.formatNumber(line.quantity)} ${unit}`, 300, y, {
            width: 95,
            align: 'right',
          });
          doc.text(line.cost == null ? 'Non calculable' : this.formatMoney(line.cost), 405, y, {
            width: 95,
            align: 'right',
          });
          doc.moveTo(42, y + 21).lineTo(pageWidth - 42, y + 21).strokeColor('#e2e8f0').stroke();
          y += 28;
        });
      }

      const allergens = Array.isArray(recipe.allergens)
        ? recipe.allergens.map((allergen: any) => allergen.name).filter(Boolean)
        : [];
      if (allergens.length) {
        y = ensureSpace(y + 8, 45);
        doc.fillColor('#92400e').fontSize(8).font('Helvetica-Bold').text('ALLERGÈNES', 42, y);
        doc
          .fillColor('#78350f')
          .fontSize(9)
          .font('Helvetica')
          .text(allergens.join(', '), 42, y + 16, { width: contentWidth });
        y = doc.y + 18;
      }

      y = ensureSpace(y + 8, 62);
      doc.fillColor('#0f172a').fontSize(13).font('Helvetica-Bold').text('Étapes de préparation', 42, y);
      y += 24;
      if (!steps.length) {
        doc.fillColor('#64748b').fontSize(9).font('Helvetica').text('Aucune étape renseignée.', 42, y);
      } else {
        steps.forEach((step: any, index: number) => {
          const description = String(step.description ?? '');
          const blockHeight = Math.max(48, doc.heightOfString(description, { width: contentWidth - 48 }) + 31);
          y = ensureSpace(y, Math.min(blockHeight, 180));
          doc.circle(55, y + 12, 12).fill('#10b981');
          doc
            .fillColor('#ffffff')
            .fontSize(9)
            .font('Helvetica-Bold')
            .text(String(index + 1), 47, y + 8, { width: 16, align: 'center' });
          doc
            .fillColor('#0f172a')
            .fontSize(10)
            .font('Helvetica-Bold')
            .text(step.title || `Étape ${index + 1}`, 82, y + 2, { width: contentWidth - 40 });
          const duration = step.estimatedMinutes ?? step.estimatedTimeMinutes;
          if (duration) {
            doc
              .fillColor('#64748b')
              .fontSize(7.5)
              .font('Helvetica-Bold')
              .text(`${duration} min`, pageWidth - 105, y + 3, { width: 60, align: 'right' });
          }
          doc
            .fillColor('#475569')
            .fontSize(8.5)
            .font('Helvetica')
            .text(description || '—', 82, y + 19, { width: contentWidth - 48, lineGap: 2 });
          y = Math.max(y + blockHeight, doc.y + 15);
        });
      }

      doc
        .fillColor('#94a3b8')
        .fontSize(7.5)
        .font('Helvetica')
        .text(`Généré par ToqueHub le ${new Date().toLocaleDateString('fr-FR')}`, 42, doc.page.height - 38, {
          width: contentWidth,
          align: 'center',
        });
      doc.end();
    });
  }

  private async simulationPdf(sim: any) {
    const lines = Array.isArray(sim.lines) ? sim.lines : [];
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 42,
        info: {
          Title: `Production theorique - ${sim.technicalSheet?.name ?? ''}`,
          Author: 'ToqueHub',
        },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const width = doc.page.width;
      doc.rect(0, 0, width, 118).fill('#073f3a');
      doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold').text('ToqueHub', 42, 34);
      doc.fillColor('#d1fae5').fontSize(10).font('Helvetica').text('Production theorique', 42, 58);
      doc
        .fillColor('#ffffff')
        .fontSize(22)
        .font('Helvetica-Bold')
        .text(sim.technicalSheet?.name ?? 'Fiche technique', 42, 78, { width: width - 84 });

      let y = 148;
      const summary = [
        ['Portions', this.formatNumber(sim.requestedPortions)],
        ['Cout estime', this.formatMoney(sim.totalEstimatedCost ?? 0)],
        ['Allergenes produits', (sim.allergenNames ?? []).join(', ') || 'Aucun renseigne'],
      ];
      const cardWidth = (width - 84 - 20) / 3;
      summary.forEach(([label, value], index) => {
        const x = 42 + index * (cardWidth + 10);
        doc.roundedRect(x, y, cardWidth, 64, 8).fillAndStroke('#f8fafc', '#dbeafe');
        doc
          .fillColor('#64748b')
          .fontSize(8)
          .font('Helvetica-Bold')
          .text(label.toUpperCase(), x + 12, y + 12, { width: cardWidth - 24 });
        doc
          .fillColor('#0f172a')
          .fontSize(index === 2 ? 10 : 14)
          .font('Helvetica-Bold')
          .text(value, x + 12, y + 30, { width: cardWidth - 24, height: 24 });
      });
      y += 94;

      doc
        .fillColor('#0f172a')
        .fontSize(13)
        .font('Helvetica-Bold')
        .text('Ingredients requis', 42, y);
      y += 24;
      this.drawPdfTableHeader(doc, y);
      y += 26;
      lines.forEach((line: any) => {
        if (y > doc.page.height - 72) {
          doc.addPage({ size: 'A4', margin: 42 });
          y = 52;
          this.drawPdfTableHeader(doc, y);
          y += 26;
        }
        const allergens = (line.allergens ?? []).join(', ');
        doc
          .fillColor('#0f172a')
          .fontSize(9)
          .font('Helvetica')
          .text(line.productName ?? '', 50, y, { width: 205 });
        doc.text(
          `${this.formatNumber(line.quantity)} ${line.unitSymbol ?? line.unit ?? ''}`,
          260,
          y,
          { width: 98, align: 'right' },
        );
        doc.text(this.formatMoney(line.estimatedCost ?? 0), 382, y, { width: 78, align: 'right' });
        doc.fillColor('#64748b').text(allergens || '-', 474, y, { width: 78 });
        doc
          .moveTo(42, y + 20)
          .lineTo(width - 42, y + 20)
          .strokeColor('#e2e8f0')
          .stroke();
        y += 28;
      });

      doc
        .fillColor('#64748b')
        .fontSize(8)
        .font('Helvetica')
        .text(
          `Genere par ToqueHub le ${new Date().toLocaleDateString('fr-FR')}`,
          42,
          doc.page.height - 48,
          { align: 'center', width: width - 84 },
        );
      doc.end();
    });
  }

  private drawPdfTableHeader(doc: PDFKit.PDFDocument, y: number) {
    doc.roundedRect(42, y, doc.page.width - 84, 22, 6).fill('#ecfdf5');
    doc.fillColor('#065f46').fontSize(8).font('Helvetica-Bold');
    doc.text('PRODUIT', 50, y + 7, { width: 205 });
    doc.text('QUANTITE', 260, y + 7, { width: 98, align: 'right' });
    doc.text('COUT', 382, y + 7, { width: 78, align: 'right' });
    doc.text('ALLERGENES', 474, y + 7, { width: 78 });
  }

  private validateRecipePdf(file: UploadedRecipePdf) {
    if (!file?.buffer?.length) throw new BadRequestException('Aucun PDF fourni');
    const name = file.originalname?.toLowerCase() ?? '';
    if (file.size > MAX_RECIPE_PDF_BYTES)
      throw new BadRequestException('Le PDF recette ne doit pas dépasser 20 Mo.');
    if (file.mimetype !== 'application/pdf' && !name.endsWith('.pdf'))
      throw new BadRequestException(
        'Seuls les fichiers PDF sont acceptés pour importer une recette.',
      );
  }

  private validateRecipeFile(file: UploadedRecipePdf) {
    if (!file?.buffer?.length)
      throw new BadRequestException('Une fiche technique importée est vide.');
    const size = file.size ?? file.buffer.length;
    if (size > MAX_RECIPE_PDF_BYTES)
      throw new BadRequestException(
        `« ${file.originalname} » dépasse la taille maximale de 20 Mo.`,
      );
    const extension = extname(file.originalname || '').toLowerCase();
    const mimeType = (file.mimetype || '').toLowerCase();
    const specificMimeAccepted =
      RECIPE_IMPORT_ACCEPTED_MIME.has(mimeType) &&
      !['application/zip', 'application/octet-stream'].includes(mimeType);
    if (!RECIPE_IMPORT_ACCEPTED_EXTENSIONS.has(extension) && !specificMimeAccepted) {
      throw new BadRequestException(
        `Format non pris en charge pour « ${file.originalname} ». Utilisez PDF, image, Pages ou Numbers.`,
      );
    }
  }

  private safeRecipeExtension(file: UploadedRecipePdf) {
    const extension = extname(file.originalname || '').toLowerCase();
    if (RECIPE_IMPORT_ACCEPTED_EXTENSIONS.has(extension)) return extension;
    const byMime: Record<string, string> = {
      'application/pdf': '.pdf',
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/webp': '.webp',
      'image/heic': '.heic',
      'image/heif': '.heif',
      'image/avif': '.avif',
    };
    return byMime[file.mimetype] ?? '.bin';
  }

  private recipeOcrInput(file: UploadedRecipePdf) {
    const extension = extname(file.originalname || '').toLowerCase();
    if (extension !== '.pages' && extension !== '.numbers') {
      return { buffer: file.buffer, mimeType: this.recipeDocumentMime(file) };
    }
    try {
      const archive = new AdmZip(file.buffer);
      const entries = archive.getEntries();
      const preview = [
        'preview.jpg',
        'preview.jpeg',
        'preview.png',
        'quicklook/preview.pdf',
        'quicklook/thumbnail.jpg',
      ]
        .map((name) => entries.find((entry) => entry.entryName.toLowerCase() === name))
        .find(Boolean);
      if (!preview || preview.isDirectory) throw new Error('aperçu absent');
      if (preview.header.size > MAX_RECIPE_PDF_BYTES) throw new Error('aperçu trop volumineux');
      const previewExtension = extname(preview.entryName).toLowerCase();
      const mimeType =
        previewExtension === '.pdf'
          ? 'application/pdf'
          : previewExtension === '.png'
            ? 'image/png'
            : 'image/jpeg';
      return { buffer: preview.getData(), mimeType };
    } catch {
      throw new BadRequestException(
        `« ${file.originalname} » ne contient pas d’aperçu exploitable. Exportez le document en PDF puis réessayez.`,
      );
    }
  }

  private recipeDocumentMime(file: UploadedRecipePdf) {
    const extension = extname(file.originalname || '').toLowerCase();
    const byExtension: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.heic': 'image/heic',
      '.heif': 'image/heif',
      '.avif': 'image/avif',
    };
    return byExtension[extension] ?? file.mimetype ?? 'application/octet-stream';
  }

  private recipeImportStatus(document: any, ocr: any, extraction: any) {
    const failed =
      document.status === DocumentStatus.FAILED || ocr?.status === OcrProcessingStatus.FAILED;
    const ready = Boolean(extraction) && document.status === DocumentStatus.PROCESSED;
    const processing =
      document.status === DocumentStatus.PROCESSING ||
      ocr?.status === OcrProcessingStatus.PROCESSING;
    return {
      document: {
        id: document.id,
        originalName: document.originalName,
        mimeType: document.mimeType,
        sizeBytes: document.sizeBytes,
        status: document.status,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
      },
      state: failed ? 'erreur' : ready ? 'vérifier' : processing ? 'analyse' : 'en attente',
      progress: failed || ready ? 100 : processing ? 55 : 12,
      result: ready ? extraction.extractedJson : null,
      errorMessage: failed ? ocr?.errorMessage || 'Import OCR impossible.' : null,
    };
  }

  private jsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private async extractRecipeFromOcr(organizationId: string, markdown: string, filename: string) {
    if (!markdown.trim())
      throw new BadRequestException('Le document ne contient pas de texte exploitable après OCR.');
    const messages = [
      {
        role: 'system',
        content: [
          'Tu analyses une recette ou fiche technique de cuisine pour ToqueHub.',
          'Retourne uniquement un JSON conforme au schema.',
          'Objectif: extraire les informations utiles a la creation d une fiche technique.',
          'Les ingredients doivent rester dans la langue du document, avec quantite numerique et unite courte si disponible.',
          'Les etapes doivent etre ordonnees et redigees en francais si le document est francais, sinon conserve la langue source.',
          'Dans les tableaux DENREES / Unites / Poids / PUHT / PTHT, utilise seulement le nom, l unite et le poids. Ignore les prix, couts, totaux et lignes de section sans quantite.',
          'Dans les tableaux Ingredients / Unite / Quantites / *2 / *3, utilise la colonne Quantites comme recette de base. Ignore les colonnes multiplicatrices et la ligne Masse total.',
          'Une ligne telle que Bechamel, Garniture, La pate, Farce ou Assaisonnement sans quantite est un titre de section, pas un ingredient.',
          'Conserve exactement l unite affichee meme si la valeur semble inhabituelle; signale une incoherence dans warnings au lieu de la corriger par supposition.',
          'N invente pas d ingredient manquant et signale les incertitudes dans warnings.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: JSON.stringify({ filename, ocrMarkdown: markdown.slice(0, 45_000) }),
      },
    ] as Array<{ role: 'system' | 'user'; content: string }>;
    const configuredTimeoutMs = Number(process.env.RECIPE_IMPORT_MISTRAL_TIMEOUT_MS ?? 180_000);
    const timeoutMs =
      Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0
        ? configuredTimeoutMs
        : 180_000;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.mistralClient.chatJson<any>(
          organizationId,
          messages,
          'toquehub_recipe_pdf_import',
          this.recipeImportSchema(),
          { timeoutMs },
        );
      } catch (error) {
        const transientFailure =
          error instanceof Error &&
          /\b429\b|rate.?limit|trop de requ|d[ée]lai mistral d[ée]pass[ée]|operation was aborted|\babort(?:ed)?\b/i.test(
            error.message,
          );
        if (!transientFailure || attempt === 2) throw error;
        await this.waitRecipeImportRetry(
          Number(process.env.RECIPE_IMPORT_RETRY_DELAY_MS ?? 12_000) * (attempt + 1),
        );
      }
    }
    throw new BadRequestException('Extraction de la fiche technique impossible.');
  }

  private waitRecipeImportRetry(delayMs: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, delayMs)));
  }

  private recipeImportSchema() {
    const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] };
    const nullableNumber = { anyOf: [{ type: 'number' }, { type: 'null' }] };
    return {
      type: 'object',
      additionalProperties: false,
      required: [
        'name',
        'description',
        'categoryName',
        'referencePortions',
        'prepTimeMinutes',
        'cookTimeMinutes',
        'ingredients',
        'steps',
        'warnings',
      ],
      properties: {
        name: nullableString,
        description: nullableString,
        categoryName: nullableString,
        referencePortions: nullableNumber,
        prepTimeMinutes: nullableNumber,
        cookTimeMinutes: nullableNumber,
        ingredients: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'quantity', 'unit', 'comment', 'sku', 'gtin'],
            properties: {
              name: nullableString,
              quantity: nullableNumber,
              unit: nullableString,
              comment: nullableString,
              sku: nullableString,
              gtin: nullableString,
            },
          },
        },
        steps: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['title', 'description', 'estimatedTimeMinutes'],
            properties: {
              title: nullableString,
              description: nullableString,
              estimatedTimeMinutes: nullableNumber,
            },
          },
        },
        warnings: { type: 'array', items: { type: 'string' } },
      },
    };
  }

  private applyKesproRecipeData(markdown: string, imported: any) {
    if (!/(?:Kespro\.com|oma\.kespro\.com)/i.test(markdown)) return imported;
    const ingredients = this.parseKesproIngredients(markdown);
    if (!ingredients.length) return imported;
    const documentTitle = markdown.match(/^(.+?)\s+-\s+Kespro\.com\s*$/m)?.[1];
    const heading = (documentTitle || markdown.match(/^#\s+(.+?)\s*$/m)?.[1])
      ?.replace(/\s+\d+\s+kpl\b.*$/i, '')
      .trim();
    const portions = this.decimalFromText(
      markdown.match(/Plate serving\s+([\d.,]+)\s+servings?/i)?.[1],
    );
    const warnings = Array.isArray(imported?.warnings)
      ? imported.warnings.filter(
          (warning: unknown) =>
            !/quantit(?:e|é).*?(?:non|pas|absent|pr(?:e|é)cis|estim)/i.test(String(warning)),
        )
      : [];
    return {
      ...imported,
      name: heading || imported?.name,
      referencePortions: portions ?? imported?.referencePortions,
      ingredients,
      warnings,
    };
  }

  private parseKesproIngredients(markdown: string): ImportedRecipeIngredient[] {
    const lines = markdown.split(/\r?\n/);
    const ingredients: ImportedRecipeIngredient[] = [];
    let inIngredientTable = false;
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (/^\|\s*PRODUCT\s*\|\s*AMOUNT\s*\|/i.test(line)) {
        inIngredientTable = true;
        continue;
      }
      if (!inIngredientTable) continue;
      if (!line.startsWith('|')) break;
      if (/^\|(?:\s*:?-+:?\s*\|)+$/i.test(line)) continue;
      const cells = line
        .slice(1, line.endsWith('|') ? -1 : undefined)
        .split('|')
        .map((cell) => cell.trim());
      if (cells.length < 2) continue;
      const sourceName = cells[0].replace(/\*\*/g, '').trim();
      const amount = cells[1].match(/^([\d.,]+)\s*([^\s|]+)?/);
      const quantity = this.decimalFromText(amount?.[1]);
      if (!sourceName || quantity == null) continue;
      const gtin = sourceName.match(/\bGTIN\s+(\d{8,14})\b/i)?.[1] ?? null;
      const sku = sourceName.match(/\bSAP\s+([A-Za-z0-9-]+)\b/i)?.[1] ?? null;
      const name = sourceName
        .replace(/\s+GTIN\s+\d{8,14}\s*-?\s*SAP\s+[A-Za-z0-9-]+.*$/i, '')
        .trim();
      const additionalInfo = cells[2] && cells[2] !== '-' ? cells[2] : null;
      ingredients.push({
        name,
        quantity,
        unit: amount?.[2] ?? null,
        comment: additionalInfo,
        sku,
        gtin,
      });
    }
    return ingredients;
  }

  private decimalFromText(value?: string | null) {
    if (!value) return null;
    const parsed = Number(value.replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }

  private matchProduct(name: string, products: any[], sku?: string | null, gtin?: string | null) {
    const target = this.norm(name);
    if (!target) return null;
    const exactReference = products.find(
      (product) => (sku && product.sku === sku) || (gtin && product.gtin === gtin),
    );
    if (exactReference) return exactReference;
    let best: { product: any; score: number } | null = null;
    for (const product of products) {
      const candidate = this.norm(
        [product.name, product.sku, product.gtin, product.description].filter(Boolean).join(' '),
      );
      const score = this.textScore(target, candidate);
      if (!best || score > best.score) best = { product, score };
    }
    return best && best.score >= 0.58 ? best.product : null;
  }

  private matchUnit(unit: string | null | undefined, units: any[]) {
    const target = this.norm(unit ?? '');
    if (!target) return null;
    return (
      units.find((item) =>
        [item.symbol, item.name].some((value) => this.norm(value ?? '') === target),
      ) ?? null
    );
  }

  private matchCategory(name: string | null | undefined, categories: any[]) {
    const target = this.norm(name ?? '');
    if (!target) return null;
    return categories.find((item) => this.norm(item.name) === target) ?? null;
  }

  private productAllergens(product: any) {
    const present = Array.isArray(product?.allergensPresent) ? product.allergensPresent : [];
    const traces = Array.isArray(product?.possibleTraces) ? product.possibleTraces : [];
    return [
      ...present.map((name: string) => ({
        id: `present:${this.slug(name)}`,
        name,
        source: 'product',
        type: 'present',
      })),
      ...traces.map((name: string) => ({
        id: `trace:${this.slug(name)}`,
        name: `Traces possibles: ${name}`,
        source: 'product',
        type: 'trace',
      })),
    ];
  }

  private productAllergenNames(product: any) {
    return this.productAllergens(product)
      .map((allergen) => allergen.name)
      .filter(Boolean);
  }

  private textScore(target: string, candidate: string) {
    if (!candidate) return 0;
    if (candidate === target) return 1;
    const targetWords = target.split(' ').filter((word) => word.length > 2);
    if (!targetWords.length) return 0;
    const candidateWords = candidate.split(' ').filter((word) => word.length > 2);
    const candidateSet = new Set(candidateWords);
    const overlap = targetWords.filter((word) => candidateSet.has(word)).length;
    const coverage = overlap / Math.max(targetWords.length, candidateSet.size, 1);
    if (overlap === targetWords.length && candidateSet.size <= Math.ceil(targetWords.length * 1.5))
      return 0.9;
    if (overlap === candidateSet.size && targetWords.length <= Math.ceil(candidateSet.size * 1.5))
      return 0.86;
    return coverage;
  }

  private norm(value: string) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private slug(value: string) {
    return this.norm(value).replace(/\s+/g, '-').slice(0, 80) || 'fiche';
  }

  private nameFromFilename(filename: string) {
    return (
      filename
        .replace(/\.[^.]+$/, '')
        .replace(/[-_]+/g, ' ')
        .trim() || 'Recette importee'
    );
  }

  private dateSlug(value?: Date | string | null) {
    const date = value ? new Date(value) : new Date();
    return Number.isNaN(+date)
      ? new Date().toISOString().slice(0, 10)
      : date.toISOString().slice(0, 10);
  }

  private formatNumber(value: unknown) {
    const number = Number(value ?? 0);
    return Number.isFinite(number)
      ? number.toLocaleString('fr-FR', { maximumFractionDigits: 3 })
      : '0';
  }

  private formatMoney(value: unknown) {
    const number = Number(value ?? 0);
    return Number.isFinite(number) ? `${number.toFixed(2)} EUR` : '0.00 EUR';
  }
}
