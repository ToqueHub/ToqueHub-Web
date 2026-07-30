import { Prisma, PurchaseReceiptLineStatus } from '@prisma/client';
import { PurchaseReceiptMatchingService, ReceiptOrderLine } from './purchase-receipt-matching.service';

const orderLine = (values: Partial<ReceiptOrderLine> = {}): ReceiptOrderLine => ({
  id: 'line-1',
  productId: 'product-1',
  unitId: 'unit-1',
  supplierReferenceSnapshot: 'REF-001',
  supplierLabelSnapshot: 'Farine fournisseur',
  productNameSnapshot: 'Farine',
  orderedQuantity: new Prisma.Decimal(10),
  receivedQuantity: new Prisma.Decimal(2),
  unitsPerOrderUnit: new Prisma.Decimal(1),
  unitPrice: new Prisma.Decimal('2.50'),
  ...values,
});

describe('PurchaseReceiptMatchingService', () => {
  const matching = new PurchaseReceiptMatchingService();

  it.each([
    [5, PurchaseReceiptLineStatus.SHORT],
    [8, PurchaseReceiptLineStatus.MATCHED],
    [9, PurchaseReceiptLineStatus.OVER],
  ])('classifies a delivered quantity of %s as %s', (quantity, status) => {
    const [line] = matching.normalize('org-1', [orderLine()], [
      {
        purchaseOrderLineId: 'line-1',
        label: 'Farine',
        deliveredQuantity: quantity,
        acceptedQuantity: Math.min(quantity, 8),
      },
    ]);
    expect(line.status).toBe(status);
    expect(line.organizationId).toBe('org-1');
  });

  it('keeps an unmatched OCR line visible as UNEXPECTED', () => {
    const extraction = matching.fromOcr({
      document: { deliveryNoteNumber: 'BL-42', deliveryDate: '2026-07-15' },
      lines: [{ supplierProductCode: 'UNKNOWN', nameOriginal: 'Autre produit', quantity: 3 }],
    });
    const [line] = matching.matchOcrLines([orderLine()], extraction);
    expect(line.status).toBe(PurchaseReceiptLineStatus.UNEXPECTED);
    expect(line.purchaseOrderLineId).toBeUndefined();
    expect(extraction.deliveryNoteNumber).toBe('BL-42');
  });

  it('accepts a manually added product outside the purchase order', () => {
    const [line] = matching.normalize('org-1', [orderLine()], [
      {
        productId: 'product-extra',
        unitId: 'unit-1',
        label: 'Produit supplémentaire',
        deliveredQuantity: 4,
        acceptedQuantity: 4,
      },
    ]);

    expect(line.status).toBe(PurchaseReceiptLineStatus.UNEXPECTED);
    expect(line.purchaseOrderLineId).toBeUndefined();
    expect(line.productId).toBe('product-extra');
    expect(Number(line.acceptedQuantity)).toBe(4);
  });

  it('rejects malformed OCR JSON before converting it to business data', () => {
    expect(() => matching.fromOcr({ lines: [{ quantity: 'invalide' }] })).toThrow(
      'quantité OCR',
    );
    expect(() => matching.fromOcr({ result: [] })).toThrow('aucune liste de lignes valide');
  });

  it('does not allow accepted quantities above delivered quantities', () => {
    expect(() =>
      matching.normalize('org-1', [orderLine()], [
        {
          purchaseOrderLineId: 'line-1',
          label: 'Farine',
          deliveredQuantity: 2,
          acceptedQuantity: 3,
        },
      ]),
    ).toThrow('ne peut pas dépasser la quantité livrée');
  });
});
