import { Injectable } from '@nestjs/common';
import { Prisma, StockMovementType, StockReceptionLineMatchingStatus } from '@prisma/client';
import { StocksService } from './stocks.service';

type Tx = Prisma.TransactionClient;

export type ValidatedReceptionLineInput = {
  organizationId: string;
  receptionId: string;
  product: { id: string; averagePrice: Prisma.Decimal };
  unit: { id: string; symbol: string };
  lotId?: string | null;
  supplierId?: string | null;
  siteId?: string | null;
  locationId?: string | null;
  stockQuantity: Prisma.Decimal;
  inputQuantity: Prisma.Decimal;
  baseUnitPrice?: Prisma.Decimal | null;
  unitPrice?: Prisma.Decimal | null;
  lineTotal?: Prisma.Decimal | null;
  vatRate?: Prisma.Decimal | null;
  label: string;
  reference?: string | null;
  lotNumber?: string | null;
  bestBeforeDate?: Date | null;
  matchingStatus?: StockReceptionLineMatchingStatus;
  matchingScore?: Prisma.Decimal | null;
  userCorrection: Prisma.InputJsonValue;
  movementReason: string;
  movementDate: Date;
  actorId: string;
  priceMode: 'replace' | 'weighted-average';
};

/**
 * Unique physical stock-writing path for validated receptions.
 * Stocks OCR and Purchasing both call this service inside their own transaction.
 */
@Injectable()
export class StocksReceptionInventoryService {
  constructor(private readonly stocksService: StocksService) {}

  async applyValidatedLineTx(tx: Tx, input: ValidatedReceptionLineInput) {
    const existing = await tx.stock.findFirst({
      where: {
        organizationId: input.organizationId,
        productId: input.product.id,
        lotId: input.lotId ?? null,
        siteId: input.siteId ?? null,
        locationId: input.locationId ?? null,
      },
    });
    if (existing) await tx.stock.update({ where: { id: existing.id }, data: { quantity: existing.quantity.add(input.stockQuantity) } });
    else await tx.stock.create({ data: { organizationId: input.organizationId, productId: input.product.id, lotId: input.lotId, siteId: input.siteId, locationId: input.locationId, quantity: input.stockQuantity } });

    const receptionLine = await tx.stockReceptionLine.create({
      data: {
        receptionId: input.receptionId,
        productId: input.product.id,
        ocrLabel: input.label,
        reference: input.reference,
        quantity: input.inputQuantity,
        unit: input.unit.symbol,
        unitId: input.unit.id,
        unitPrice: input.unitPrice,
        lineTotal: input.lineTotal,
        vatRate: input.vatRate,
        lotNumber: input.lotNumber,
        bestBeforeDate: input.bestBeforeDate,
        matchingStatus: input.matchingStatus ?? StockReceptionLineMatchingStatus.RECOGNIZED,
        matchingScore: input.matchingScore ?? new Prisma.Decimal(1),
        userCorrection: input.userCorrection,
        lotId: input.lotId,
      },
    });

    const nextPrice = await this.nextAveragePrice(tx, input);
    if (nextPrice && nextPrice.greaterThanOrEqualTo(0) && !input.product.averagePrice.equals(nextPrice)) {
      await tx.product.update({ where: { id: input.product.id }, data: { averagePrice: nextPrice } });
      await this.stocksService.recalculateTechnicalSheetsForProductTx(tx, input.organizationId, input.product.id, input.actorId);
    }

    await tx.stockMovement.create({
      data: {
        organizationId: input.organizationId,
        productId: input.product.id,
        lotId: input.lotId,
        supplierId: input.supplierId,
        type: StockMovementType.RECEPTION,
        quantity: input.stockQuantity,
        inputQuantity: input.inputQuantity,
        unitId: input.unit.id,
        unitSymbolSnapshot: input.unit.symbol,
        reason: input.movementReason,
        destinationSiteId: input.siteId,
        destinationLocationId: input.locationId,
        movementDate: input.movementDate,
        createdById: input.actorId,
        stockReceptionLineId: receptionLine.id,
      },
    });
    return receptionLine;
  }

  private async nextAveragePrice(tx: Tx, input: ValidatedReceptionLineInput) {
    let basePrice = input.baseUnitPrice ?? null;
    if (!basePrice && input.lineTotal && !input.stockQuantity.isZero()) basePrice = input.lineTotal.div(input.stockQuantity);
    if (!basePrice && input.unitPrice) basePrice = input.unitPrice;
    if (!basePrice) return null;
    if (input.priceMode === 'replace') return basePrice;
    const aggregate = await tx.stock.aggregate({ where: { organizationId: input.organizationId, productId: input.product.id }, _sum: { quantity: true } });
    const quantityAfter = new Prisma.Decimal(aggregate._sum.quantity ?? 0);
    const quantityBefore = Prisma.Decimal.max(0, quantityAfter.sub(input.stockQuantity));
    if (quantityAfter.lte(0)) return basePrice;
    return quantityBefore.mul(input.product.averagePrice).add(input.stockQuantity.mul(basePrice)).div(quantityAfter);
  }
}
