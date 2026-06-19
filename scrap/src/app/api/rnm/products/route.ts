import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const search = searchParams.get('search') || '';
    const sectorSlug = searchParams.get('sector') || '';
    const categorySlug = searchParams.get('category') || '';

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { label: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (categorySlug) {
      where.categoryId = categorySlug;
    } else if (sectorSlug) {
      where.category = {
        sector: {
          name: sectorSlug
        }
      };
    }

    const [products, total] = await Promise.all([
      prisma.marketProduct.findMany({
        where,
        take: limit,
        skip: offset,
        include: {
          category: {
            select: {
              name: true,
              label: true,
              sector: {
                select: {
                  name: true,
                  label: true
                }
              }
            }
          }
        },
        orderBy: { label: 'asc' }
      }),
      prisma.marketProduct.count({ where })
    ]);

    return NextResponse.json({
      success: true,
      data: products,
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
