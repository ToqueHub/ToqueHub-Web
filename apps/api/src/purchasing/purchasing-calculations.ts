import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type PurchasingTotals = {
  totalExcludingTax: Prisma.Decimal;
  totalTax: Prisma.Decimal;
  totalIncludingTax: Prisma.Decimal;
};

export function calculateLineTotals(quantity: Prisma.Decimal, price: Prisma.Decimal, vatRate: Prisma.Decimal) {
  const excludingTax = quantity.mul(price);
  const tax = excludingTax.mul(vatRate).div(100);
  return { excludingTax, tax, includingTax: excludingTax.add(tax) };
}

export function sumTotals(lines: Array<{ excludingTax: Prisma.Decimal; tax: Prisma.Decimal; includingTax: Prisma.Decimal }>): PurchasingTotals {
  return lines.reduce<PurchasingTotals>(
    (sum, line) => ({
      totalExcludingTax: sum.totalExcludingTax.add(line.excludingTax),
      totalTax: sum.totalTax.add(line.tax),
      totalIncludingTax: sum.totalIncludingTax.add(line.includingTax),
    }),
    {
      totalExcludingTax: new Prisma.Decimal(0),
      totalTax: new Prisma.Decimal(0),
      totalIncludingTax: new Prisma.Decimal(0),
    },
  );
}

export function addDeliveryFee(totals: PurchasingTotals, fee: Prisma.Decimal | null | undefined) {
  const deliveryFeeSnapshot = new Prisma.Decimal(fee ?? 0);
  return {
    deliveryFeeSnapshot,
    orderTotals: {
      totalExcludingTax: totals.totalExcludingTax.add(deliveryFeeSnapshot),
      totalTax: totals.totalTax,
      totalIncludingTax: totals.totalIncludingTax.add(deliveryFeeSnapshot),
    },
  };
}

export function assertMinimumOrder(productSubtotal: Prisma.Decimal, minimum: Prisma.Decimal) {
  if (productSubtotal.lt(minimum))
    throw new BadRequestException(
      `Le minimum de commande de ${minimum.toFixed(2)} € HT n’est pas atteint (articles : ${productSubtotal.toFixed(2)} € HT).`,
    );
}
