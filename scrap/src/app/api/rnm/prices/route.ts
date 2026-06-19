import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 500);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    
    const productSlug = searchParams.get('product') || '';
    const marketCode = searchParams.get('market') || '';
    const stage = searchParams.get('stage') || '';
    const dateFrom = searchParams.get('dateFrom') || '';
    const dateTo = searchParams.get('dateTo') || '';

    const where: any = {};

    if (productSlug) {
      where.label = {
        product: {
          name: productSlug
        }
      };
    }

    if (marketCode) {
      where.market = {
        code: marketCode
      };
    }

    if (stage) {
      where.stage = stage;
    }

    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) {
        const from = new Date(dateFrom);
        if (!isNaN(from.getTime())) {
          where.date.gte = from;
        }
      }
      if (dateTo) {
        const to = new Date(dateTo);
        if (!isNaN(to.getTime())) {
          where.date.lte = to;
        }
      }
    }

    const [prices, total] = await Promise.all([
      prisma.marketPrice.findMany({
        where,
        take: limit,
        skip: offset,
        include: {
          label: {
            select: {
              name: true,
              product: {
                select: {
                  name: true,
                  label: true
                }
              }
            }
          },
          market: {
            select: {
              code: true,
              name: true
            }
          }
        },
        orderBy: { date: 'desc' }
      }),
      prisma.marketPrice.count({ where })
    ]);

    return NextResponse.json({
      success: true,
      data: prices.map(p => ({
        id: p.id,
        product: p.label.product.label,
        productSlug: p.label.product.name,
        variety: p.label.name,
        market: p.market.name,
        marketCode: p.market.code,
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
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
