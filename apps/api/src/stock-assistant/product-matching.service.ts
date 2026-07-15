import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const normalizeStockText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

@Injectable()
export class ProductMatchingService {
  constructor(private readonly prisma: PrismaService) {}
  async match(organizationId: string, rawLabel: string, supplierId?: string | null, supplierSku?: string | null) {
    const normalized = normalizeStockText(rawLabel);
    const [aliases, products] = await Promise.all([
      this.prisma.productAlias.findMany({
        where: {
          organizationId,
          OR: [
            { normalizedAlias: normalized, supplierId: supplierId || null },
            { normalizedAlias: normalized, supplierId: null },
            ...(supplierSku ? [{ supplierSku, supplierId: supplierId || undefined }, { supplierSku, supplierId: null }] : []),
          ],
        },
      }),
      this.prisma.product.findMany({ where: { organizationId, isArchived: false }, include: { unit: true } }),
    ]);
    const alias = aliases.sort((a, b) => Number(Boolean(b.supplierId)) - Number(Boolean(a.supplierId)))[0];
    if (alias) {
      const product = products.find((item) => item.id === alias.productId);
      return { productId: alias.productId, confidence: 1, status: 'MATCHED' as const, inputUnitId: product?.unitId || null, candidates: product ? [{ id: product.id, name: product.name, unitId: product.unitId, score: 1 }] : [] };
    }
    const ranked = products.map((product) => {
      const name = normalizeStockText(product.name); const sku = normalizeStockText(product.sku || ''); const gtin = normalizeStockText(product.gtin || '');
      const score = supplierSku && (supplierSku === product.sku || supplierSku === product.gtin) ? 1 : normalized === sku || normalized === gtin ? 0.99 : normalized === name ? 0.98 : name.includes(normalized) || normalized.includes(name) ? 0.78 : this.tokenScore(normalized, name);
      return { product, score };
    }).sort((a, b) => b.score - a.score);
    const best = ranked[0]; const second = ranked[1]; const status = !best || best.score < .45 ? 'UNMATCHED' : best.score >= .84 && (!second || best.score - second.score >= .12) ? 'MATCHED' : 'AMBIGUOUS';
    return { productId: status === 'UNMATCHED' ? null : best.product.id, confidence: best?.score || 0, status, inputUnitId: status === 'UNMATCHED' ? null : best.product.unitId, candidates: ranked.filter(x => x.score >= .38).slice(0, 8).map(x => ({ id: x.product.id, name: x.product.name, unitId: x.product.unitId, score: x.score })) };
  }
  async suggestions(organizationId: string, q: string) { return (await this.match(organizationId, q)).candidates; }
  private tokenScore(a: string, b: string) { const left = new Set(a.split(' ').filter(x => x.length > 2)); const right = new Set(b.split(' ').filter(x => x.length > 2)); const common = [...left].filter(x => right.has(x)).length; return left.size && right.size ? common / Math.max(left.size, right.size) : 0; }
}
