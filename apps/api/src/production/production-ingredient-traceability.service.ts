import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';

type Actor = { id: string; role?: string; permissions?: string[] };
type Tx = Prisma.TransactionClient;
type UploadedPhoto = {
  buffer: Buffer;
  mimetype?: string;
  originalname?: string;
  size?: number;
};
type PhotoMetadata = {
  documentId: string;
  path: string;
  storagePath: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
};

// The API is started both from the monorepo root and from apps/api.  Resolving a
// bare "uploads" from process.cwd() made proofs disappear after a restart.
const API_UPLOAD_ROOT = process.env.HACCP_UPLOAD_DIR || process.env.UPLOAD_DIR || join(__dirname, '..', 'uploads');
const HACCP_UPLOAD_ROOT = resolve(API_UPLOAD_ROOT, 'haccp');
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

const asStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(String);
  if (value == null || value === '') return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.map(String) : [String(value)];
  } catch {
    return [String(value)];
  }
};

@Injectable()
export class ProductionIngredientTraceabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async get(organizationId: string, batchId: string) {
    const batch = await this.loadBatch(this.prisma, organizationId, batchId);
    return this.buildDetail(batch);
  }

  async save(
    organizationId: string,
    actor: Actor,
    batchId: string,
    ingredientKey: string,
    body: Record<string, unknown>,
    files: UploadedPhoto[] = [],
  ) {
    const batch = await this.loadBatch(this.prisma, organizationId, batchId);
    const detail = this.buildDetail(batch);
    const ingredient = detail.ingredients.find((item) => item.key === ingredientKey);
    if (!ingredient) {
      throw new NotFoundException({ code: 'PRODUCTION_TRACEABILITY_INGREDIENT_NOT_FOUND' });
    }

    const existing = batch.haccpIngredientTraceability.find(
      (item: any) => item.ingredientKey === ingredientKey,
    );
    const existingPhotos = (Array.isArray(existing?.photos) ? existing.photos : []) as PhotoMetadata[];
    const retainedIds = new Set(asStringArray(body.retainedPhotoIds));
    const retainedPhotos = existingPhotos.filter((photo) => retainedIds.has(photo.documentId));

    for (const file of files) {
      const mimeType = String(file.mimetype || '').toLowerCase();
      if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
        throw new BadRequestException({
          code: 'PRODUCTION_TRACEABILITY_INVALID_PHOTO_TYPE',
          mimeType,
        });
      }
      if ((file.size ?? file.buffer?.length ?? 0) > MAX_PHOTO_BYTES) {
        throw new BadRequestException({ code: 'PRODUCTION_TRACEABILITY_PHOTO_TOO_LARGE' });
      }
    }
    if (retainedPhotos.length + files.length > 3) {
      throw new BadRequestException({
        code: 'PRODUCTION_TRACEABILITY_PHOTO_LIMIT',
        maximum: 3,
      });
    }

    const idempotencyKey = String(body.idempotencyKey || '').trim() || null;
    if (idempotencyKey) {
      const duplicate = await this.prisma.haccpProductionIngredientTraceability.findFirst({
        where: { organizationId, idempotencyKey },
      });
      if (duplicate && duplicate.id !== existing?.id) {
        throw new ConflictException({ code: 'PRODUCTION_TRACEABILITY_IDEMPOTENCY_CONFLICT' });
      }
      if (
        duplicate &&
        duplicate.productionBatchId === batchId &&
        duplicate.ingredientKey === ingredientKey
      ) {
        return this.get(organizationId, batchId);
      }
    }

    const addedPhotos: PhotoMetadata[] = [];
    for (const file of files) {
      const originalName = file.originalname || 'ingredient-photo.jpg';
      const internalFilename = `${randomUUID()}${extname(originalName) || '.jpg'}`;
      const storagePath = join(
        organizationId,
        'production-ingredients',
        batchId,
        internalFilename,
      );
      const absolutePath = join(HACCP_UPLOAD_ROOT, storagePath);
      mkdirSync(dirname(absolutePath), { recursive: true });
      writeFileSync(absolutePath, file.buffer);
      const document = await this.prisma.document.create({
        data: {
          organizationId,
          uploadedById: actor.id,
          internalFilename,
          originalName,
          mimeType: file.mimetype || 'image/jpeg',
          sizeBytes: file.size ?? file.buffer.length,
          storagePath,
          sourceModule: 'haccp',
          sourceType: 'production-ingredient-traceability',
          sourceId: existing?.id ?? batchId,
        },
      });
      addedPhotos.push({
        documentId: document.id,
        path: `/uploads/haccp/${storagePath}`,
        storagePath,
        originalName,
        mimeType: file.mimetype || 'image/jpeg',
        size: file.size ?? file.buffer.length,
        uploadedAt: new Date().toISOString(),
      });
    }

    const photos = [...retainedPhotos, ...addedPhotos];
    const saved = await this.prisma.haccpProductionIngredientTraceability.upsert({
      where: {
        productionBatchId_ingredientKey: { productionBatchId: batchId, ingredientKey },
      },
      update: {
        productId: ingredient.productId,
        ingredientNameSnapshot: ingredient.name,
        quantitySnapshot: ingredient.quantity,
        unitSnapshot: ingredient.unit,
        lotNumber: String(body.lotNumber || '').trim() || null,
        barcode: String(body.barcode || '').trim() || null,
        photos,
        idempotencyKey,
        createdById: actor.id,
        completedAt: photos.length ? existing?.completedAt ?? new Date() : null,
      },
      create: {
        organizationId,
        productionBatchId: batchId,
        productId: ingredient.productId,
        ingredientKey,
        ingredientNameSnapshot: ingredient.name,
        quantitySnapshot: ingredient.quantity,
        unitSnapshot: ingredient.unit,
        lotNumber: String(body.lotNumber || '').trim() || null,
        barcode: String(body.barcode || '').trim() || null,
        photos,
        idempotencyKey,
        createdById: actor.id,
        completedAt: photos.length ? new Date() : null,
      },
    });

    const removed = existingPhotos.filter((photo) => !retainedIds.has(photo.documentId));
    for (const photo of removed) {
      await this.prisma.document.deleteMany({
        where: { id: photo.documentId, organizationId },
      });
      const absolutePath = join(HACCP_UPLOAD_ROOT, photo.storagePath);
      if (absolutePath.startsWith(`${HACCP_UPLOAD_ROOT}/`) && existsSync(absolutePath)) {
        unlinkSync(absolutePath);
      }
    }
    if (addedPhotos.length && existing?.id == null) {
      await this.prisma.document.updateMany({
        where: { id: { in: addedPhotos.map((photo) => photo.documentId) }, organizationId },
        data: { sourceId: saved.id },
      });
    }
    return this.get(organizationId, batchId);
  }

  async assertCompleteTx(tx: Tx, organizationId: string, batchId: string) {
    const batch = await this.loadBatch(tx, organizationId, batchId);
    const detail = this.buildDetail(batch);
    if (detail.summary.missing > 0) {
      throw new ConflictException({
        code: 'PRODUCTION_TRACEABILITY_INCOMPLETE',
        missingIngredients: detail.ingredients
          .filter((ingredient) => !ingredient.completed)
          .map((ingredient) => ({
            key: ingredient.key,
            name: ingredient.name,
          })),
      });
    }
  }

  async flowDay(organizationId: string, date?: string) {
    const day = String(date || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const start = new Date(`${day}T00:00:00`);
    if (Number.isNaN(start.getTime())) {
      throw new BadRequestException({ code: 'PRODUCTION_INVALID_DAY' });
    }
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const batches = await this.prisma.productionBatch.findMany({
      where: {
        organizationId,
        operationalTasks: {
          some: {
            status: { not: 'CANCELLED' },
            startsAt: { lt: end },
            endsAt: { gt: start },
          },
        },
      },
      include: this.batchInclude(),
      orderBy: [{ plannedStartAt: 'asc' }, { reference: 'asc' }],
    });
    const items = batches.map((batch) => this.buildDetail(batch));
    return {
      date: day,
      summary: {
        planned: items.length,
        inProgress: items.filter((item) =>
          ['PREPARING', 'COOKING', 'COOLING', 'FREEZING'].includes(item.batch.status),
        ).length,
        completed: items.filter((item) =>
          ['COMPLETED', 'PARTIALLY_LOST'].includes(item.batch.status),
        ).length,
        traceabilityCompleted: items.reduce(
          (sum, item) => sum + item.summary.completed,
          0,
        ),
        traceabilityExpected: items.reduce((sum, item) => sum + item.summary.expected, 0),
      },
      items: items.map((item) => ({
        batch: item.batch,
        recipe: {
          id: item.recipe.id,
          name: item.recipe.name,
          version: item.recipe.version,
        },
        tasks: item.tasks,
        summary: item.summary,
      })),
    };
  }

  async flowDetail(organizationId: string, batchId: string) {
    return this.get(organizationId, batchId);
  }

  private batchInclude() {
    return {
      unit: true,
      recipeVersion: true,
      operations: { orderBy: { position: 'asc' as const } },
      operationalTasks: {
        where: { status: { not: 'CANCELLED' as const } },
        include: {
          assignedEmployee: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { startsAt: 'asc' as const },
      },
      haccpIngredientTraceability: { orderBy: { createdAt: 'asc' as const } },
      order: {
        include: {
          site: true,
          technicalSheet: {
            include: {
              ingredients: {
                include: { product: true, unit: true },
                orderBy: { order: 'asc' as const },
              },
            },
          },
        },
      },
    };
  }

  private async loadBatch(client: any, organizationId: string, batchId: string) {
    const batch = await client.productionBatch.findFirst({
      where: { id: batchId, organizationId },
      include: this.batchInclude(),
    });
    if (!batch) throw new NotFoundException({ code: 'PRODUCTION_BATCH_NOT_FOUND' });
    return batch;
  }

  private buildDetail(batch: any) {
    const snapshot = (batch.recipeVersion?.snapshot ?? null) as Record<string, any> | null;
    const sourceIngredients = Array.isArray(snapshot?.ingredients)
      ? snapshot.ingredients
      : batch.order.technicalSheet.ingredients.map((ingredient: any) => ({
          id: ingredient.id,
          productId: ingredient.productId,
          quantity: ingredient.quantity.toString(),
          productName: ingredient.product.name,
          unitSymbol: ingredient.unit.symbol,
          order: ingredient.order,
        }));
    const yieldMode = snapshot?.yieldMode ?? batch.order.technicalSheet.yieldMode;
    const referenceYield = new Prisma.Decimal(
      yieldMode === 'MASS'
        ? snapshot?.totalMassGrams ??
            batch.order.technicalSheet.totalMassGrams ??
            batch.recipeVersion?.referenceYield ??
            1
        : batch.recipeVersion?.referenceYield ??
            snapshot?.referencePortions ??
            batch.order.technicalSheet.referencePortions ??
            1,
    );
    const factor = referenceYield.isZero()
      ? new Prisma.Decimal(1)
      : batch.plannedQuantity.div(referenceYield);
    const records = new Map(
      batch.haccpIngredientTraceability.map((record: any) => [
        record.ingredientKey,
        record,
      ]),
    );
    const ingredients = [...sourceIngredients]
      .sort((left: any, right: any) => Number(left.order ?? 0) - Number(right.order ?? 0))
      .map((source: any, index: number) => {
        const key = String(source.id || source.productId || `ingredient-${index + 1}`);
        const record: any = records.get(key);
        const photos = Array.isArray(record?.photos) ? record.photos : [];
        return {
          key,
          productId: source.productId ?? null,
          name:
            source.productName ??
            source.productNameSnapshot ??
            record?.ingredientNameSnapshot ??
            'Ingrédient',
          quantity: new Prisma.Decimal(source.quantity ?? 0).mul(factor).toFixed(3),
          unit:
            source.unitSymbol ??
            source.unitSymbolSnapshot ??
            record?.unitSnapshot ??
            '',
          lotNumber: record?.lotNumber ?? null,
          barcode: record?.barcode ?? null,
          photos,
          completed: photos.length > 0,
          completedAt: record?.completedAt ?? null,
        };
      });
    const completed = ingredients.filter((ingredient) => ingredient.completed).length;
    return {
      batch: {
        id: batch.id,
        reference: batch.reference,
        status: batch.status,
        plannedQuantity: batch.plannedQuantity.toString(),
        actualQuantity: batch.actualQuantity?.toString() ?? null,
        unit: batch.unit,
        plannedStartAt: batch.plannedStartAt,
        startedAt: batch.startedAt,
        completedAt: batch.completedAt,
        site: batch.order.site
          ? { id: batch.order.site.id, name: batch.order.site.name }
          : null,
      },
      recipe: {
        id: batch.order.technicalSheetId,
        name: snapshot?.name ?? batch.order.technicalSheet.name,
        version: batch.recipeVersion?.version ?? null,
      },
      tasks: batch.operationalTasks.map((task: any) => ({
        id: task.id,
        title: task.title,
        startsAt: task.startsAt,
        endsAt: task.endsAt,
        status: task.status,
        assignedEmployee: task.assignedEmployee
          ? {
              id: task.assignedEmployee.id,
              name:
                [task.assignedEmployee.firstName, task.assignedEmployee.lastName]
                  .filter(Boolean)
                  .join(' ') || 'Non assignée',
            }
          : null,
      })),
      operations: batch.operations.map((operation: any) => ({
        id: operation.id,
        title: operation.title,
        position: operation.position,
        status: operation.status,
        notes: operation.notes,
        activeMinutes: operation.activeMinutes,
      })),
      ingredients,
      summary: {
        expected: ingredients.length,
        completed,
        missing: Math.max(ingredients.length - completed, 0),
        isComplete: ingredients.length === completed,
      },
    };
  }
}
