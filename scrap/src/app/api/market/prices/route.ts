import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const labelId = searchParams.get('labelId') || '';
    const marketId = searchParams.get('marketId') || '';
    const stage = searchParams.get('stage') || '';
    const dateStr = searchParams.get('date') || ''; // YYYY-MM-DD

    const productName = searchParams.get('productName') || '';

    const where: any = {};

    if (labelId) where.labelId = labelId;
    if (marketId) where.marketId = marketId;
    if (stage) where.stage = stage;
    if (dateStr) {
      const parsedDate = new Date(dateStr);
      if (!isNaN(parsedDate.getTime())) {
        where.date = parsedDate;
      }
    }

    if (productName) {
      where.label = {
        product: {
          name: {
            contains: productName.toLowerCase(),
            mode: 'insensitive'
          }
        }
      };
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
              product: { select: { label: true } }
            }
          },
          market: {
            select: {
              name: true,
              code: true
            }
          }
        },
        orderBy: { date: 'desc' }
      }),
      prisma.marketPrice.count({ where })
    ]);

    return NextResponse.json({
      success: true,
      data: prices,
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
