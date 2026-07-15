import { Prisma } from '@prisma/client';
import {
  addDeliveryFee,
  assertMinimumOrder,
  calculateLineTotals,
  sumTotals,
} from './purchasing-calculations';

describe('purchasing calculations', () => {
  it('calculates Decimal line totals and delivery fees without floating point drift', () => {
    const first = calculateLineTotals(
      new Prisma.Decimal('3'),
      new Prisma.Decimal('2.55'),
      new Prisma.Decimal('14'),
    );
    const second = calculateLineTotals(
      new Prisma.Decimal('2'),
      new Prisma.Decimal('1.20'),
      new Prisma.Decimal('25.5'),
    );
    const totals = addDeliveryFee(sumTotals([first, second]), new Prisma.Decimal('4.90'));

    expect(totals.deliveryFeeSnapshot.toFixed(2)).toBe('4.90');
    expect(totals.orderTotals.totalExcludingTax.toFixed(2)).toBe('14.95');
    expect(totals.orderTotals.totalTax.toFixed(3)).toBe('1.683');
    expect(totals.orderTotals.totalIncludingTax.toFixed(3)).toBe('16.633');
  });

  it('applies the minimum to products excluding delivery fees', () => {
    expect(() =>
      assertMinimumOrder(new Prisma.Decimal('49.99'), new Prisma.Decimal('50')),
    ).toThrow('articles : 49.99 € HT');
    expect(() =>
      assertMinimumOrder(new Prisma.Decimal('50'), new Prisma.Decimal('50')),
    ).not.toThrow();
  });
});
