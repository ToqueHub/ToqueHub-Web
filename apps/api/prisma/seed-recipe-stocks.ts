import { Prisma, PrismaClient, UnitType } from '@prisma/client';

const prisma = new PrismaClient();

const organizationName = process.env.RECIPE_STOCK_ORGANIZATION_NAME || 'The French Café';
const targetQuantity = new Prisma.Decimal(process.env.RECIPE_STOCK_TARGET || '200');

type RecipeProduct = {
  id: string;
  name: string;
  unit: {
    id: string;
    name: string;
    symbol: string;
    type: UnitType;
  };
};

function targetForProduct(product: RecipeProduct) {
  const symbol = product.unit.symbol.trim().toLowerCase();

  if (product.unit.type !== UnitType.MASS) {
    return targetQuantity;
  }

  if (['g', 'gr', 'gramme', 'grammes'].includes(symbol)) {
    return targetQuantity.mul(1_000);
  }

  if (['mg', 'milligramme', 'milligrammes'].includes(symbol)) {
    return targetQuantity.mul(1_000_000);
  }

  return targetQuantity;
}

async function main() {
  const organization = await prisma.organization.findFirst({
    where: { name: organizationName },
    select: {
      id: true,
      name: true,
      primarySite: {
        select: {
          id: true,
          name: true,
          locations: {
            where: { isArchived: false },
            orderBy: { name: 'asc' },
            select: { id: true, name: true },
          },
        },
      },
    },
  });

  if (!organization) {
    throw new Error(`Organisation introuvable : ${organizationName}`);
  }
  if (!organization.primarySite) {
    throw new Error(`Aucun site principal configuré pour ${organization.name}.`);
  }

  const technicalSheets = await prisma.technicalSheet.findMany({
    where: {
      organizationId: organization.id,
      isArchived: false,
    },
    select: {
      ingredients: {
        select: {
          product: {
            select: {
              id: true,
              name: true,
              unit: {
                select: {
                  id: true,
                  name: true,
                  symbol: true,
                  type: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const productsById = new Map<string, RecipeProduct>();
  for (const sheet of technicalSheets) {
    for (const ingredient of sheet.ingredients) {
      productsById.set(ingredient.product.id, ingredient.product);
    }
  }

  if (productsById.size === 0) {
    throw new Error(`Aucun produit de recette actif trouvé pour ${organization.name}.`);
  }

  const productionLocation =
    organization.primarySite.locations.find((location) =>
      location.name.toLocaleLowerCase('fr').includes('production'),
    ) ?? organization.primarySite.locations[0];

  const counters = {
    created: 0,
    updated: 0,
    unchanged: 0,
    products: productsById.size,
  };
  const unitBreakdown = new Map<string, number>();

  await prisma.$transaction(async (tx) => {
    for (const product of productsById.values()) {
      const target = targetForProduct(product);
      const stocks = await tx.stock.findMany({
        where: {
          organizationId: organization.id,
          productId: product.id,
          siteId: organization.primarySite!.id,
        },
        include: {
          reservations: {
            where: { status: 'ACTIVE' },
            select: { quantity: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      const lotStocks = stocks.filter((stock) => stock.lotId);
      const editableStocks = stocks.filter((stock) => !stock.lotId);
      const lotQuantity = lotStocks.reduce(
        (total, stock) => total.add(stock.quantity),
        new Prisma.Decimal(0),
      );
      const reservedOnEditableStocks = editableStocks.reduce(
        (total, stock) =>
          total.add(
            stock.reservations.reduce(
              (reserved, reservation) => reserved.add(reservation.quantity),
              new Prisma.Decimal(0),
            ),
          ),
        new Prisma.Decimal(0),
      );

      if (lotQuantity.add(reservedOnEditableStocks).gt(target)) {
        throw new Error(
          [
            `Impossible de fixer ${product.name} à ${target.toString()} ${product.unit.symbol}.`,
            `Les lots et réservations actifs représentent déjà`,
            `${lotQuantity.add(reservedOnEditableStocks).toString()} ${product.unit.symbol}.`,
          ].join(' '),
        );
      }

      const canonicalStock =
        editableStocks.find(
          (stock) => !stock.variantId && stock.locationId === productionLocation?.id,
        ) ??
        editableStocks.find((stock) => !stock.variantId) ??
        null;

      const otherReservedQuantity = editableStocks
        .filter((stock) => stock.id !== canonicalStock?.id)
        .reduce(
          (total, stock) =>
            total.add(
              stock.reservations.reduce(
                (reserved, reservation) => reserved.add(reservation.quantity),
                new Prisma.Decimal(0),
              ),
            ),
          new Prisma.Decimal(0),
        );
      const canonicalQuantity = target.sub(lotQuantity).sub(otherReservedQuantity);

      for (const stock of editableStocks) {
        const quantity =
          stock.id === canonicalStock?.id
            ? canonicalQuantity
            : stock.reservations.reduce(
                (reserved, reservation) => reserved.add(reservation.quantity),
                new Prisma.Decimal(0),
              );

        if (stock.quantity.eq(quantity)) {
          counters.unchanged += 1;
          continue;
        }

        await tx.stock.update({
          where: { id: stock.id },
          data: { quantity },
        });
        counters.updated += 1;
      }

      if (!canonicalStock) {
        await tx.stock.create({
          data: {
            organizationId: organization.id,
            productId: product.id,
            siteId: organization.primarySite!.id,
            locationId: productionLocation?.id,
            quantity: canonicalQuantity,
          },
        });
        counters.created += 1;
      }

      const unitKey = `${product.unit.type}:${product.unit.symbol}`;
      unitBreakdown.set(unitKey, (unitBreakdown.get(unitKey) ?? 0) + 1);
    }
  });

  console.log(
    JSON.stringify(
      {
        organization: organization.name,
        site: organization.primarySite.name,
        location: productionLocation?.name ?? null,
        recipeSheets: technicalSheets.length,
        target: `${targetQuantity.toString()} kg équivalent`,
        ...counters,
        unitBreakdown: Object.fromEntries(
          [...unitBreakdown.entries()].sort(([left], [right]) => left.localeCompare(right)),
        ),
      },
      null,
      2,
    ),
  );
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
