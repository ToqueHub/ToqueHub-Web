import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const product = await prisma.marketProduct.findUnique({
      where: { name: slug },
      include: {
        category: {
          include: {
            sector: true
          }
        },
        labels: true
      }
    });

    if (!product) {
      return NextResponse.json(
        { success: false, message: `Produit avec le slug "${slug}" non trouvé.` },
        { status: 404 }
      );
    }

    // Find the latest quotation date for this product's labels
    const latestDateRecord = await prisma.marketPrice.findFirst({
      where: {
        label: { productId: product.id }
      },
      orderBy: { date: 'desc' },
      select: { date: true }
    });

    // Retrieve all prices for that specific latest date
    const latestPrices = latestDateRecord
      ? await prisma.marketPrice.findMany({
          where: {
            label: { productId: product.id },
            date: latestDateRecord.date
          },
          include: {
            market: {
              select: {
                id: true,
                code: true,
                name: true
              }
            },
            label: {
              select: {
                id: true,
                libcod: true,
                name: true
              }
            }
          },
          orderBy: [
            { label: { name: 'asc' } },
            { market: { name: 'asc' } }
          ]
        })
      : [];

    return NextResponse.json({
      success: true,
      data: {
        product: {
          id: product.id,
          slug: product.name,
          label: product.label,
          especeId: product.especeId,
          category: product.category.label,
          sector: product.category.sector.label
        },
        latestQuotationDate: latestDateRecord?.date || null,
        varieties: product.labels.map(l => ({ id: l.id, libcod: l.libcod, name: l.name })),
        latestPrices: latestPrices.map(p => ({
          id: p.id,
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
        }))
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
