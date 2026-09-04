import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'products'; // 'products' | 'markets' | 'prices'
    const limit = Math.min(parseInt(searchParams.get('limit') || '500', 10), 5000);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    if (type === 'products') {
      const products = await prisma.marketProduct.findMany({
        include: {
          category: {
            include: {
              sector: true
            }
          },
          labels: {
            select: {
              id: true,
              libcod: true,
              name: true
            }
          }
        },
        orderBy: { label: 'asc' }
      });

      return NextResponse.json({
        success: true,
        count: products.length,
        data: products.map(p => ({
          id: p.id,
          slug: p.name,
          label: p.label,
          especeId: p.especeId,
          category: p.category.label,
          categorySlug: p.category.name,
          sector: p.category.sector.label,
          sectorSlug: p.category.sector.name,
          varieties: p.labels
        }))
      });
    }

    if (type === 'markets') {
      const markets = await prisma.market.findMany({
        orderBy: { name: 'asc' }
      });

      return NextResponse.json({
        success: true,
        count: markets.length,
        data: markets
      });
    }

    if (type === 'prices') {
      const dateFrom = searchParams.get('dateFrom') || '';
      const dateTo = searchParams.get('dateTo') || '';
      const productSlug = searchParams.get('product') || '';

      const where: any = {};

      if (productSlug) {
        where.label = {
          product: { name: productSlug }
        };
      }

      if (dateFrom || dateTo) {
        where.date = {};
        if (dateFrom) {
          const from = new Date(dateFrom);
          if (!isNaN(from.getTime())) where.date.gte = from;
        }
        if (dateTo) {
          const to = new Date(dateTo);
          if (!isNaN(to.getTime())) where.date.lte = to;
        }
      }

      const [prices, total] = await Promise.all([
        prisma.marketPrice.findMany({
          where,
          take: limit,
          skip: offset,
          orderBy: { date: 'desc' }
        }),
        prisma.marketPrice.count({ where })
      ]);

      return NextResponse.json({
        success: true,
        data: prices.map(p => ({
          id: p.id,
          labelId: p.labelId,
          marketId: p.marketId,
          date: p.date,
          stage: p.stage,
          unit: p.unit,
          avgPrice: parseFloat(p.avgPrice.toString()),
          minPrice: p.minPrice ? parseFloat(p.minPrice.toString()) : null,
          maxPrice: p.maxPrice ? parseFloat(p.maxPrice.toString()) : null,
          variation: p.variation ? parseFloat(p.variation.toString()) : null
        })),
        pagination: {
          total,
          limit,
          offset
        }
      });
    }

    return NextResponse.json(
      { success: false, message: `Type d'exportation inconnu. Utilisez 'products', 'markets' ou 'prices'.` },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
