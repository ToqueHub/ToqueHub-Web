import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
  try {
    const sectors = await prisma.marketSector.findMany({
      include: {
        categories: {
          where: { parentId: null }, // Start with top-level categories
          include: {
            children: {
              include: {
                products: {
                  select: {
                    id: true,
                    name: true,
                    label: true,
                    especeId: true
                  }
                }
              }
            },
            products: {
              select: {
                id: true,
                name: true,
                label: true,
                especeId: true
              }
            }
          }
        }
      },
      orderBy: { label: 'asc' }
    });

    return NextResponse.json({
      success: true,
      data: sectors
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
