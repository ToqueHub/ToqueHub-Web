import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StockMovementType, StockReceptionStatus, TechnicalSheetHistoryAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RnmPricesService } from '../rnm-prices/rnm-prices.service';
import { GenerateMarginReportDto, MarginsQueryDto, UpdateMarginSettingsDto } from './dto/stocks-margins.dto';

type Tx = Prisma.TransactionClient;
type Actor = { id: string; role: string };

const RECEPTION_INCLUDE = {
  product: { include: { unit: true, category: true, primarySupplier: true } },
  unitModel: true,
  lot: true,
  reception: { include: { supplier: true, document: true } },
} satisfies Prisma.StockReceptionLineInclude;

@Injectable()
export class StocksMarginsService {
  constructor(private readonly prisma: PrismaService, private readonly rnmPricesService: RnmPricesService) {}

  async settings(organizationId: string) {
    return this.prisma.marginSettings.upsert({
      where: { organizationId },
      update: {},
      create: { organizationId },
    });
  }

  async updateSettings(organizationId: string, dto: UpdateMarginSettingsDto) {
    return this.prisma.marginSettings.upsert({
      where: { organizationId },
      update: {
        priceIncreaseThresholdPct: dto.priceIncreaseThresholdPct,
        anomalyThresholdPct: dto.anomalyThresholdPct,
        quantityAnomalyThresholdPct: dto.quantityAnomalyThresholdPct,
      },
      create: {
        organizationId,
        priceIncreaseThresholdPct: dto.priceIncreaseThresholdPct,
        anomalyThresholdPct: dto.anomalyThresholdPct,
        quantityAnomalyThresholdPct: dto.quantityAnomalyThresholdPct,
      },
    });
  }

  async dashboard(organizationId: string, q: MarginsQueryDto = {}) {
    const range = this.range(q);
    const where = this.lineWhere(organizationId, q, range);
    const allLines = await this.prisma.stockReceptionLine.findMany({ where, include: RECEPTION_INCLUDE, orderBy: { reception: { validatedAt: 'desc' } } });
    const monthRange = this.monthRange(new Date());
    const monthLines = allLines.filter((line) => this.inRange(this.lineDate(line), monthRange.start, monthRange.end));
    const previousMonthRange = this.previousMonthRange(new Date());
    const previousMonthLines = allLines.filter((line) => this.inRange(this.lineDate(line), previousMonthRange.start, previousMonthRange.end));
    const supplierIds = new Set(allLines.map((line) => line.reception.supplierId).filter(Boolean));
    const invoiceIds = new Set(allLines.map((line) => line.receptionId));
    const spend = this.sumLines(allLines);
    const monthSpend = this.sumLines(monthLines);
    const previousMonthSpend = this.sumLines(previousMonthLines);
    const technicalSheetImpact = await this.technicalSheetImpact(organizationId, allLines);
    const [openAlerts, reports, forecasts, rnmComparisons] = await Promise.all([
      this.prisma.marginAlert.findMany({ where: { organizationId, status: 'OPEN' as any }, include: { product: true, supplier: true }, orderBy: [{ severity: 'desc' }, { detectedAt: 'desc' }], take: 10 }),
      this.prisma.marginReport.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' }, take: 5 }),
      this.purchaseForecasts(organizationId),
      this.rnmComparisons(organizationId, allLines),
    ]);

    return {
      range,
      kpis: {
        monthlyPurchases: monthSpend,
        materialCost: technicalSheetImpact.totalMaterialCost,
        invoiceCount: invoiceIds.size,
        supplierCount: supplierIds.size,
        averageIncreasePct: this.averageIncrease(allLines),
        potentialSavings: this.potentialSavings(allLines),
        averagePrice: this.averageUnitPrice(allLines),
        yearlyEvolutionPct: this.evolutionPct(spend, this.sumPreviousYear(allLines)),
        monthlyEvolutionPct: this.evolutionPct(monthSpend, previousMonthSpend),
        weeklyEvolutionPct: this.weeklyEvolution(allLines),
        openAlerts: openAlerts.length,
      },
      charts: {
        purchases: this.timeseries(allLines, q.period ?? 'month'),
        materialCost: technicalSheetImpact.timeseries,
        prices: this.priceTimeseries(allLines),
        categories: this.byCategory(allLines),
        suppliers: this.bySupplier(allLines),
        expenseDistribution: this.bySupplier(allLines),
        productFamilies: this.byCategory(allLines),
        topProducts: this.topProducts(allLines),
        topSuppliers: this.topSuppliers(allLines),
      },
      alerts: openAlerts.map((alert) => this.serializeAlert(alert)),
      suggestions: this.suggestions(allLines, technicalSheetImpact, forecasts, rnmComparisons),
      reports,
      forecasts,
      rnmComparisons,
      technicalSheetImpact,
    };
  }

  async product(organizationId: string, productId: string) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, organizationId }, include: { unit: true, category: true, primarySupplier: true } });
    if (!product) throw new NotFoundException('Produit introuvable');
    const lines = await this.prisma.stockReceptionLine.findMany({
      where: { productId, reception: { organizationId, status: StockReceptionStatus.VALIDATED } },
      include: RECEPTION_INCLUDE,
      orderBy: { reception: { validatedAt: 'desc' } },
    });
    const prices = lines.map((line) => this.effectiveUnitPrice(line)).filter((n) => n != null) as number[];
    const suppliers = this.supplierComparison(lines);
    const techSheets = await this.prisma.technicalSheetIngredient.findMany({
      where: { organizationId, productId },
      include: { technicalSheet: true, unit: true },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });
    return {
      product,
      stats: {
        averagePrice: this.avg(prices),
        lastPrice: prices[0] ?? null,
        minPrice: prices.length ? Math.min(...prices) : null,
        maxPrice: prices.length ? Math.max(...prices) : null,
        firstPrice: prices[prices.length - 1] ?? null,
        averageVariationPct: this.averageIncrease(lines),
        purchaseFrequency: this.purchaseFrequency(lines),
      },
      chart: this.priceTimeseries(lines),
      history: lines.map((line) => this.serializeLine(line)),
      suppliers,
      latestInvoices: this.latestInvoices(lines),
      lots: lines.filter((line) => line.lot).map((line) => line.lot),
      technicalSheetImpact: techSheets.map((line) => ({
        technicalSheetId: line.technicalSheetId,
        technicalSheetName: line.technicalSheet.name,
        quantity: Number(line.quantity),
        unitSymbol: line.unit.symbol,
        currentCost: Number(line.cost ?? 0),
      })),
      rnmComparison: await this.rnmComparisonForProduct(organizationId, product, prices[0] ?? Number(product.averagePrice ?? 0)),
    };
  }

  async supplier(organizationId: string, supplierId: string) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id: supplierId, organizationId } });
    if (!supplier) throw new NotFoundException('Fournisseur introuvable');
    const lines = await this.prisma.stockReceptionLine.findMany({
      where: { reception: { organizationId, supplierId, status: StockReceptionStatus.VALIDATED } },
      include: RECEPTION_INCLUDE,
      orderBy: { reception: { validatedAt: 'desc' } },
    });
    const receptions = new Map(lines.map((line) => [line.receptionId, line.reception]));
    return {
      supplier,
      score: this.supplierScore(lines),
      stats: {
        orderCount: receptions.size,
        annualAmount: this.sumSince(lines, this.addDays(new Date(), -365)),
        monthlyAmount: this.sumSince(lines, this.monthRange(new Date()).start),
        productsCount: new Set(lines.map((line) => line.productId).filter(Boolean)).size,
        volume: lines.reduce((sum, line) => sum + Number(line.quantity ?? 0), 0),
      },
      evolution: this.timeseries(lines, 'month'),
      products: this.topProducts(lines, 25),
      priceEvolution: this.priceTimeseries(lines),
      history: lines.map((line) => this.serializeLine(line)),
      documents: [...receptions.values()].map((reception) => reception.document).filter(Boolean),
    };
  }

  async alerts(organizationId: string) {
    const items = await this.prisma.marginAlert.findMany({ where: { organizationId }, include: { product: true, supplier: true, stockReceptionLine: true }, orderBy: { detectedAt: 'desc' }, take: 100 });
    return items.map((item) => this.serializeAlert(item));
  }

  async search(organizationId: string, q: MarginsQueryDto) {
    const search = q.search?.trim();
    if (!search) return { products: [], suppliers: [], invoices: [], lots: [], lines: [] };
    const [products, suppliers, invoices, lots, lines] = await Promise.all([
      this.prisma.product.findMany({ where: { organizationId, OR: [{ name: { contains: search, mode: 'insensitive' } }, { sku: { contains: search, mode: 'insensitive' } }] }, include: { unit: true, category: true }, take: 20 }),
      this.prisma.supplier.findMany({ where: { organizationId, name: { contains: search, mode: 'insensitive' } }, take: 20 }),
      this.prisma.stockReception.findMany({ where: { organizationId, OR: [{ invoiceNumber: { contains: search, mode: 'insensitive' } }, { deliveryNoteNumber: { contains: search, mode: 'insensitive' } }] }, include: { supplier: true, document: true }, take: 20 }),
      this.prisma.lot.findMany({ where: { organizationId, lotNumber: { contains: search, mode: 'insensitive' } }, include: { product: true, supplier: true }, take: 20 }),
      this.prisma.stockReceptionLine.findMany({ where: { reception: { organizationId }, OR: [{ ocrLabel: { contains: search, mode: 'insensitive' } }, { reference: { contains: search, mode: 'insensitive' } }] }, include: RECEPTION_INCLUDE, take: 20 }),
    ]);
    return { products, suppliers, invoices, lots, lines: lines.map((line) => this.serializeLine(line)) };
  }

  async reports(organizationId: string) {
    return this.prisma.marginReport.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  async reportCsv(organizationId: string, reportId: string, language: 'fr' | 'en' = 'fr') {
    const report = await this.prisma.marginReport.findFirst({ where: { id: reportId, organizationId } });
    if (!report) throw new NotFoundException('Rapport Marges introuvable');
    const insights = Array.isArray(report.insights) ? report.insights : [];
    const metrics = (report.metrics ?? {}) as Record<string, unknown>;
    const rows = [
      ['Type', report.type],
      [language === 'en' ? 'Title' : 'Titre', report.title],
      [language === 'en' ? 'Period start' : 'Début période', report.periodStart?.toISOString?.() ?? ''],
      [language === 'en' ? 'Period end' : 'Fin période', report.periodEnd?.toISOString?.() ?? ''],
      [language === 'en' ? 'Created on' : 'Créé le', report.createdAt.toISOString()],
      [language === 'en' ? 'Summary' : 'Résumé', report.summary],
      [],
      language === 'en' ? ['Indicator', 'Value'] : ['Indicateur', 'Valeur'],
      ...Object.entries(metrics).map(([key, value]) => [key, String(value ?? '')]),
      [],
      [language === 'en' ? 'Insights' : 'Analyses'],
      ...insights.map((item) => [String(item)]),
    ];
    return rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  }

  async generateReport(organizationId: string, actor: Actor, dto: GenerateMarginReportDto = {}) {
    const dashboard = await this.dashboard(organizationId, { period: dto.period ?? 'month', dateFrom: dto.dateFrom, dateTo: dto.dateTo });
    const insights = dashboard.suggestions.map((suggestion: any) => suggestion.message);
    const summary = insights.length
      ? insights.slice(0, 5).join(' ')
      : 'Les achats sont consolidés depuis les réceptions validées. Aucun signal significatif détecté sur la période.';
    return this.prisma.marginReport.create({
      data: {
        organizationId,
        type: 'AUTOMATIC_SUMMARY' as any,
        title: `Synthèse Marges - ${new Date().toLocaleDateString('fr-FR')}`,
        periodStart: dashboard.range.start,
        periodEnd: dashboard.range.end,
        summary,
        insights,
        metrics: dashboard.kpis as Prisma.InputJsonValue,
        createdById: actor.id,
      },
    });
  }

  async analyzeReceptionForAlertsTx(tx: Tx, organizationId: string, receptionId: string) {
    const settings = await tx.marginSettings.upsert({ where: { organizationId }, update: {}, create: { organizationId } });
    const lines = await tx.stockReceptionLine.findMany({
      where: { receptionId, productId: { not: null } },
      include: { product: true, reception: true },
    });
    const affectedProductIds = [...new Set(lines.map((line) => line.productId).filter(Boolean) as string[])];
    for (const line of lines) {
      const current = this.effectiveUnitPrice(line);
      if (current == null || !line.productId) continue;
      const history = await tx.stockReceptionLine.findMany({
        where: { productId: line.productId, id: { not: line.id }, reception: { organizationId, status: StockReceptionStatus.VALIDATED, validatedAt: { lt: line.reception.validatedAt ?? new Date() } } },
        include: { reception: true },
        orderBy: { reception: { validatedAt: 'desc' } },
        take: 20,
      });
      const validatedAt = line.reception.validatedAt ?? new Date();
      const historyPrices = history.map((h) => this.effectiveUnitPrice(h)).filter((n) => n != null) as number[];
      const last = historyPrices[0];
      const average = this.avg(historyPrices);
      const reference = last ?? average;
      const avg30 = this.avg(history.filter((h) => this.inRange(this.lineDate(h), this.addDays(validatedAt, -30), validatedAt)).map((h) => this.effectiveUnitPrice(h)).filter((n) => n != null) as number[]);
      const avg90 = this.avg(history.filter((h) => this.inRange(this.lineDate(h), this.addDays(validatedAt, -90), validatedAt)).map((h) => this.effectiveUnitPrice(h)).filter((n) => n != null) as number[]);
      const avgYear = this.avg(history.filter((h) => this.inRange(this.lineDate(h), this.addDays(validatedAt, -365), validatedAt)).map((h) => this.effectiveUnitPrice(h)).filter((n) => n != null) as number[]);
      if (reference && reference > 0) {
        const variation = ((current - reference) / reference) * 100;
        if (variation >= Number(settings.priceIncreaseThresholdPct)) {
          await tx.marginAlert.create({
            data: {
              organizationId,
              type: 'PRICE_INCREASE' as any,
              severity: variation >= Number(settings.anomalyThresholdPct) ? 'CRITICAL' as any : 'WARNING' as any,
              priority: variation >= Number(settings.anomalyThresholdPct) ? 1 : 2,
              title: `Hausse détectée sur ${line.product?.name ?? 'un produit'}`,
              explanation: `Le prix validé (${current.toFixed(2)} EUR) dépasse la référence (${reference.toFixed(2)} EUR) de ${variation.toFixed(1)} %.`,
              productId: line.productId,
              supplierId: line.reception.supplierId,
              stockReceptionLineId: line.id,
              currentValue: new Prisma.Decimal(current),
              referenceValue: new Prisma.Decimal(reference),
              variationPct: new Prisma.Decimal(variation),
              metadata: { comparedWith: last ? 'last_purchase' : 'average_history', last, average, avg30, avg90, avgYear },
            },
          });
        }
        if (Math.abs(variation) >= Number(settings.anomalyThresholdPct)) {
          await tx.marginAlert.create({
            data: {
              organizationId,
              type: 'PRICE_ANOMALY' as any,
              severity: 'CRITICAL' as any,
              priority: 1,
              title: `Prix anormal sur ${line.product?.name ?? 'un produit'}`,
              explanation: `Le prix validé s'écarte de ${variation.toFixed(1)} % de l'historique récent.`,
              productId: line.productId,
              supplierId: line.reception.supplierId,
              stockReceptionLineId: line.id,
              currentValue: new Prisma.Decimal(current),
              referenceValue: new Prisma.Decimal(reference),
              variationPct: new Prisma.Decimal(variation),
              metadata: { last, average, avg30, avg90, avgYear },
            },
          });
        }
      }
      const quantityHistory = history.map((h) => Number(h.quantity ?? 0)).filter((n) => n > 0);
      const quantityAverage = this.avg(quantityHistory);
      const quantity = Number(line.quantity ?? 0);
      if (quantityAverage && quantityAverage > 0 && quantity > 0) {
        const quantityVariation = ((quantity - quantityAverage) / quantityAverage) * 100;
        if (Math.abs(quantityVariation) >= Number(settings.quantityAnomalyThresholdPct)) {
          await tx.marginAlert.create({
            data: {
              organizationId,
              type: 'QUANTITY_ANOMALY' as any,
              severity: Math.abs(quantityVariation) >= 100 ? 'CRITICAL' as any : 'WARNING' as any,
              priority: Math.abs(quantityVariation) >= 100 ? 1 : 2,
              title: `Quantité inhabituelle sur ${line.product?.name ?? 'un produit'}`,
              explanation: `La quantité validée (${quantity}) s'écarte de ${quantityVariation.toFixed(1)} % de la moyenne historique (${quantityAverage.toFixed(1)}).`,
              productId: line.productId,
              supplierId: line.reception.supplierId,
              stockReceptionLineId: line.id,
              currentValue: new Prisma.Decimal(quantity),
              referenceValue: new Prisma.Decimal(quantityAverage),
              variationPct: new Prisma.Decimal(quantityVariation),
            },
          });
        }
      }
      const previousWithVat = history.find((h) => h.vatRate != null);
      if (line.vatRate != null && previousWithVat?.vatRate != null && Math.abs(Number(line.vatRate) - Number(previousWithVat.vatRate)) >= 0.5) {
        await tx.marginAlert.create({
          data: {
            organizationId,
            type: 'VAT_ANOMALY' as any,
            severity: 'WARNING' as any,
            priority: 2,
            title: `TVA inhabituelle sur ${line.product?.name ?? 'un produit'}`,
            explanation: `Le taux TVA validé (${Number(line.vatRate).toFixed(2)} %) diffère du dernier taux observé (${Number(previousWithVat.vatRate).toFixed(2)} %).`,
            productId: line.productId,
            supplierId: line.reception.supplierId,
            stockReceptionLineId: line.id,
            currentValue: line.vatRate,
            referenceValue: previousWithVat.vatRate,
          },
        });
      }
      const previousUnit = history.find((h) => h.unitId);
      if (line.unitId && previousUnit?.unitId && line.unitId !== previousUnit.unitId) {
        await tx.marginAlert.create({
          data: {
            organizationId,
            type: 'UNIT_CHANGE' as any,
            severity: 'WARNING' as any,
            priority: 2,
            title: `Unité différente sur ${line.product?.name ?? 'un produit'}`,
            explanation: 'L’unité validée diffère de celle observée lors du dernier achat de ce produit.',
            productId: line.productId,
            supplierId: line.reception.supplierId,
            stockReceptionLineId: line.id,
            metadata: { currentUnitId: line.unitId, previousUnitId: previousUnit.unitId },
          },
        });
      }
      const knownSuppliers = new Set(history.map((h) => h.reception?.supplierId).filter(Boolean));
      if (line.reception.supplierId && history.length >= 3 && !knownSuppliers.has(line.reception.supplierId)) {
        await tx.marginAlert.create({
          data: {
            organizationId,
            type: 'UNUSUAL_SUPPLIER' as any,
            severity: 'INFO' as any,
            priority: 3,
            title: `Fournisseur inhabituel sur ${line.product?.name ?? 'un produit'}`,
            explanation: 'Ce fournisseur n’apparaît pas dans les achats récents de ce produit.',
            productId: line.productId,
            supplierId: line.reception.supplierId,
            stockReceptionLineId: line.id,
          },
        });
      }
      if (!line.lotNumber) {
        await tx.marginAlert.create({
          data: {
            organizationId,
            type: 'MISSING_LOT' as any,
            severity: 'INFO' as any,
            priority: 3,
            title: `Lot manquant sur ${line.product?.name ?? 'une ligne'}`,
            explanation: 'La réception validée ne contient pas de numéro de lot pour cette ligne.',
            productId: line.productId,
            supplierId: line.reception.supplierId,
            stockReceptionLineId: line.id,
          },
        });
      }
    }
    if (affectedProductIds.length) await this.recalculateTechnicalSheetsForProductsTx(tx, organizationId, affectedProductIds);
  }

  private lineWhere(organizationId: string, q: MarginsQueryDto, range = this.range(q)): Prisma.StockReceptionLineWhereInput {
    return {
      productId: q.productId,
      reception: {
        organizationId,
        status: StockReceptionStatus.VALIDATED,
        supplierId: q.supplierId,
        validatedAt: { gte: range.start, lte: range.end },
      },
      product: q.categoryId ? { categoryId: q.categoryId } : undefined,
      OR: q.search ? [{ ocrLabel: { contains: q.search, mode: 'insensitive' } }, { reference: { contains: q.search, mode: 'insensitive' } }, { product: { name: { contains: q.search, mode: 'insensitive' } } }] : undefined,
    };
  }

  private range(q: MarginsQueryDto) {
    const end = q.dateTo ? new Date(q.dateTo) : new Date();
    const start = q.dateFrom ? new Date(q.dateFrom) : this.addDays(end, q.period === 'week' ? -7 : q.period === 'year' ? -365 : -31);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  private lineDate(line: any) { return line.reception?.validatedAt ?? line.reception?.deliveryDate ?? line.reception?.documentDate ?? line.createdAt; }
  private inRange(date: Date | string | null | undefined, start: Date, end: Date) { const d = date ? new Date(date) : null; return Boolean(d && d >= start && d <= end); }
  private effectiveUnitPrice(line: any): number | null {
    if (line.lineTotal != null && line.quantity != null && Number(line.quantity) > 0) return Number(line.lineTotal) / Number(line.quantity);
    if (line.unitPrice != null) return Number(line.unitPrice);
    return null;
  }
  private lineTotal(line: any): number { const total = line.lineTotal == null ? null : Number(line.lineTotal); if (total != null && Number.isFinite(total)) return total; const price = this.effectiveUnitPrice(line); return price == null ? 0 : price * Number(line.quantity ?? 0); }
  private sumLines(lines: any[]) { return lines.reduce((sum, line) => sum + this.lineTotal(line), 0); }
  private avg(values: number[]) { return values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : null; }
  private averageUnitPrice(lines: any[]) { return this.avg(lines.map((line) => this.effectiveUnitPrice(line)).filter((n) => n != null) as number[]) ?? 0; }
  private addDays(date: Date, days: number) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
  private monthRange(date: Date) { const start = new Date(date.getFullYear(), date.getMonth(), 1); const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999); return { start, end }; }
  private previousMonthRange(date: Date) { return this.monthRange(new Date(date.getFullYear(), date.getMonth() - 1, 1)); }
  private evolutionPct(current: number, previous: number) { return previous ? ((current - previous) / previous) * 100 : 0; }
  private sumPreviousYear(lines: any[]) { const now = new Date(); return this.sumLines(lines.filter((line) => this.inRange(this.lineDate(line), new Date(now.getFullYear() - 1, 0, 1), new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999)))); }
  private weeklyEvolution(lines: any[]) { const now = new Date(); const week = this.sumLines(lines.filter((line) => this.inRange(this.lineDate(line), this.addDays(now, -7), now))); const previous = this.sumLines(lines.filter((line) => this.inRange(this.lineDate(line), this.addDays(now, -14), this.addDays(now, -7)))); return this.evolutionPct(week, previous); }

  private timeseries(lines: any[], period: string) {
    const map = new Map<string, number>();
    for (const line of lines) { const key = this.bucket(this.lineDate(line), period); map.set(key, (map.get(key) ?? 0) + this.lineTotal(line)); }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
  }
  private priceTimeseries(lines: any[]) { return lines.map((line) => ({ date: this.lineDate(line), productId: line.productId, productName: line.product?.name, supplierName: line.reception?.supplier?.name ?? line.reception?.supplierName, value: this.effectiveUnitPrice(line) })).filter((p) => p.value != null).reverse(); }
  private bucket(date: any, period: string) { const d = new Date(date); if (period === 'week') return `${d.getFullYear()}-W${Math.ceil((((d as any) - (new Date(d.getFullYear(), 0, 1) as any)) / 86400000 + 1) / 7)}`; if (period === 'year') return String(d.getFullYear()); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
  private byCategory(lines: any[]) { return this.group(lines, (line) => line.product?.category?.name ?? 'Sans categorie'); }
  private bySupplier(lines: any[]) { return this.group(lines, (line) => line.reception?.supplier?.name ?? line.reception?.supplierName ?? 'Fournisseur inconnu'); }
  private group(lines: any[], label: (line: any) => string) { const map = new Map<string, number>(); for (const line of lines) map.set(label(line), (map.get(label(line)) ?? 0) + this.lineTotal(line)); return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value })); }
  private topProducts(lines: any[], take = 10) { return this.group(lines, (line) => line.product?.name ?? line.ocrLabel).slice(0, take); }
  private topSuppliers(lines: any[], take = 10) { return this.bySupplier(lines).slice(0, take); }

  private averageIncrease(lines: any[]) {
    const byProduct = new Map<string, any[]>();
    for (const line of lines.filter((l) => l.productId)) byProduct.set(line.productId, [...(byProduct.get(line.productId) ?? []), line]);
    const variations: number[] = [];
    for (const productLines of byProduct.values()) {
      const ordered = [...productLines].reverse();
      for (let i = 1; i < ordered.length; i += 1) {
        const prev = this.effectiveUnitPrice(ordered[i - 1]); const current = this.effectiveUnitPrice(ordered[i]);
        if (prev && current != null) variations.push(((current - prev) / prev) * 100);
      }
    }
    return this.avg(variations) ?? 0;
  }

  private potentialSavings(lines: any[]) {
    const byProduct = new Map<string, any[]>();
    for (const line of lines.filter((l) => l.productId)) byProduct.set(line.productId, [...(byProduct.get(line.productId) ?? []), line]);
    let savings = 0;
    for (const productLines of byProduct.values()) {
      const prices = productLines.map((line) => this.effectiveUnitPrice(line)).filter((n) => n != null) as number[];
      const min = prices.length ? Math.min(...prices) : null;
      if (min == null) continue;
      for (const line of productLines) { const current = this.effectiveUnitPrice(line); if (current && current > min) savings += (current - min) * Number(line.quantity ?? 0); }
    }
    return savings;
  }

  private purchaseFrequency(lines: any[]) {
    const dates = [...new Set(lines.map((line) => new Date(this.lineDate(line)).toDateString()))];
    if (dates.length < 2) return dates.length;
    const ordered = dates.map((d) => new Date(d).getTime()).sort((a, b) => a - b);
    return Math.round((ordered[ordered.length - 1] - ordered[0]) / 86400000 / Math.max(1, dates.length - 1));
  }

  private supplierComparison(lines: any[]) {
    return this.groupBy(lines, (line) => line.reception?.supplierId ?? 'unknown').map((group) => {
      const prices = group.items.map((line) => this.effectiveUnitPrice(line)).filter((n) => n != null) as number[];
      return { supplierId: group.key, supplierName: group.items[0].reception?.supplier?.name ?? group.items[0].reception?.supplierName ?? 'Fournisseur inconnu', averagePrice: this.avg(prices), minPrice: prices.length ? Math.min(...prices) : null, maxPrice: prices.length ? Math.max(...prices) : null, frequency: this.purchaseFrequency(group.items), volume: group.items.reduce((sum, line) => sum + Number(line.quantity ?? 0), 0), score: this.supplierScore(group.items) };
    }).sort((a, b) => (a.averagePrice ?? Infinity) - (b.averagePrice ?? Infinity));
  }

  private supplierScore(lines: any[]) {
    const variations = Math.abs(this.averageIncrease(lines));
    const missingLots = lines.filter((line) => !line.lotNumber).length;
    const recency = lines[0] ? Math.min(20, Math.max(0, 20 - ((Date.now() - new Date(this.lineDate(lines[0])).getTime()) / 86400000) / 9)) : 0;
    const score = 100 - Math.min(45, variations * 1.5) - Math.min(20, missingLots * 2) + recency;
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private async technicalSheetImpact(organizationId: string, lines: any[]) {
    const ingredients = await this.prisma.technicalSheetIngredient.findMany({ where: { organizationId }, include: { technicalSheet: true, product: { include: { unit: true } }, unit: true } });
    const latestByProduct = new Map<string, any>();
    const previousByProduct = new Map<string, any>();
    for (const line of [...lines].reverse()) {
      if (!line.productId) continue;
      if (latestByProduct.has(line.productId)) previousByProduct.set(line.productId, latestByProduct.get(line.productId));
      latestByProduct.set(line.productId, line);
    }
    const impacts = [];
    let totalDelta = 0;
    for (const ingredient of ingredients) {
      const latest = latestByProduct.get(ingredient.productId);
      const previous = previousByProduct.get(ingredient.productId);
      const latestPrice = latest ? this.effectiveUnitPrice(latest) : Number(ingredient.product.averagePrice ?? 0);
      const previousPrice = previous ? this.effectiveUnitPrice(previous) : Number(ingredient.unitPriceSnapshot ?? ingredient.product.averagePrice ?? 0);
      if (latestPrice == null || previousPrice == null) continue;
      const quantity = Number(ingredient.quantity ?? 0);
      const oldCost = quantity * previousPrice;
      const newCost = quantity * latestPrice;
      const delta = newCost - oldCost;
      if (Math.abs(delta) >= 0.01) {
        totalDelta += delta;
        impacts.push({
          technicalSheetId: ingredient.technicalSheetId,
          technicalSheetName: ingredient.technicalSheet.name,
          productId: ingredient.productId,
          productName: ingredient.product.name,
          oldCost,
          newCost,
          delta,
          monthlyImpact: delta * 4,
          annualImpact: delta * 52,
        });
      }
    }
    const totalMaterialCost = ingredients.reduce((sum, line) => sum + Number(line.cost ?? 0), 0);
    return {
      totalMaterialCost,
      totalDelta,
      impactedRecipesCount: new Set(impacts.map((impact) => impact.technicalSheetId)).size,
      impacts: impacts.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 20),
      timeseries: this.timeseries(lines, 'month').map((point) => ({ ...point, value: point.value * 0.32 })),
    };
  }

  private async purchaseForecasts(organizationId: string) {
    const since = this.addDays(new Date(), -90);
    const [stocks, movements] = await Promise.all([
      this.prisma.stock.findMany({ where: { organizationId }, include: { product: { include: { unit: true, category: true, primarySupplier: true } } } }),
      this.prisma.stockMovement.findMany({
        where: { organizationId, movementDate: { gte: since }, quantity: { lt: 0 }, type: { in: [StockMovementType.OUT, StockMovementType.PRODUCTION, StockMovementType.LOSS, StockMovementType.CORRECTION, StockMovementType.INVENTORY] } },
        include: { product: { include: { unit: true, primarySupplier: true } } },
      }),
    ]);
    const stockByProduct = new Map<string, number>();
    for (const stock of stocks) stockByProduct.set(stock.productId, (stockByProduct.get(stock.productId) ?? 0) + Number(stock.quantity ?? 0));
    const consumedByProduct = new Map<string, { product: any; quantity: number }>();
    for (const movement of movements) {
      const existing = consumedByProduct.get(movement.productId) ?? { product: movement.product, quantity: 0 };
      existing.quantity += Math.abs(Number(movement.quantity ?? 0));
      consumedByProduct.set(movement.productId, existing);
    }
    const forecasts = [...consumedByProduct.entries()].map(([productId, item]) => {
      const currentStock = stockByProduct.get(productId) ?? 0;
      const dailyConsumption = item.quantity / 90;
      const daysUntilRupture = dailyConsumption > 0 ? currentStock / dailyConsumption : null;
      const targetDays = 21;
      const recommendedQuantity = Math.max(0, dailyConsumption * targetDays - currentStock);
      return {
        productId,
        productName: item.product?.name ?? 'Produit',
        supplierName: item.product?.primarySupplier?.name ?? null,
        currentStock,
        dailyConsumption,
        daysUntilRupture,
        estimatedRuptureDate: daysUntilRupture == null ? null : this.addDays(new Date(), Math.floor(daysUntilRupture)).toISOString(),
        recommendedQuantity,
        unitSymbol: item.product?.unit?.symbol ?? '',
        estimatedBudget: recommendedQuantity * Number(item.product?.averagePrice ?? 0),
      };
    });
    return forecasts.filter((item) => item.recommendedQuantity > 0 || (item.daysUntilRupture != null && item.daysUntilRupture <= 14)).sort((a, b) => (a.daysUntilRupture ?? Infinity) - (b.daysUntilRupture ?? Infinity)).slice(0, 20);
  }

  private async rnmComparisons(organizationId: string, lines: any[]) {
    const organization = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { rnmPricesInstalledAt: true } });
    if (!organization?.rnmPricesInstalledAt) return [];
    const byProduct = new Map<string, any>();
    for (const line of lines) if (line.productId && !byProduct.has(line.productId)) byProduct.set(line.productId, line);
    const top = [...byProduct.values()].slice(0, 8);
    const comparisons = await Promise.all(top.map((line) => this.rnmComparisonForProduct(organizationId, line.product, this.effectiveUnitPrice(line) ?? 0).catch(() => null)));
    return comparisons.filter(Boolean);
  }

  private async rnmComparisonForProduct(_organizationId: string, product: any, paidPrice: number | null) {
    if (!product?.name || paidPrice == null || paidPrice <= 0) return null;
    const result = await this.rnmPricesService.products({ search: product.name, limit: '5' } as any).catch(() => null);
    const candidates = result?.items ?? [];
    const best = candidates
      .map((candidate: any) => ({ candidate, score: this.nameScore(product.name, candidate.name) }))
      .filter((item: any) => item.score >= 0.35 && item.candidate.averagePrice != null)
      .sort((a: any, b: any) => b.score - a.score)[0]?.candidate;
    if (!best?.averagePrice) return null;
    const rnmPrice = Number(best.averagePrice);
    const gapValue = paidPrice - rnmPrice;
    const gapPct = rnmPrice ? (gapValue / rnmPrice) * 100 : 0;
    return {
      productId: product.id,
      productName: product.name,
      paidPrice,
      rnmProductId: best.id,
      rnmProductName: best.name,
      rnmPrice,
      rnmUnit: best.unit ?? null,
      latestQuotationDate: best.latestQuotationDate ?? null,
      gapValue,
      gapPct,
      message: gapPct <= 0 ? 'Vous achetez moins cher que le marché.' : `Vous achetez ${gapPct.toFixed(0)} % plus cher que le marché.`,
    };
  }

  private suggestions(lines: any[], impact: any, forecasts: any[] = [], rnmComparisons: any[] = []) {
    const suggestions: Array<{ type: string; message: string; priority: number }> = [];
    const savings = this.potentialSavings(lines);
    if (savings > 0) suggestions.push({ type: 'SUPPLIER_OPTIMIZATION', message: `Economie potentielle estimee a ${savings.toFixed(0)} EUR en achetant chaque produit au meilleur prix observe.`, priority: 1 });
    const top = this.topProducts(lines, 1)[0];
    if (top) suggestions.push({ type: 'COST_DRIVER', message: `${top.name} concentre ${top.value.toFixed(0)} EUR d'achats sur la periode.`, priority: 2 });
    if (impact.totalMaterialCost > 0) suggestions.push({ type: 'TECHNICAL_SHEETS', message: `Le cout matiere des fiches techniques represente ${impact.totalMaterialCost.toFixed(0)} EUR aux prix Stocks actuels.`, priority: 2 });
    const urgent = forecasts.find((forecast) => forecast.daysUntilRupture != null && forecast.daysUntilRupture <= 7);
    if (urgent) suggestions.push({ type: 'PURCHASE_FORECAST', message: `${urgent.productName} risque une rupture sous ${Math.ceil(urgent.daysUntilRupture)} jour(s). Quantite recommandee: ${urgent.recommendedQuantity.toFixed(1)} ${urgent.unitSymbol}.`, priority: 1 });
    const expensiveMarket = rnmComparisons.find((item) => item.gapPct > 10);
    if (expensiveMarket) suggestions.push({ type: 'RNM_MARKET_GAP', message: `${expensiveMarket.productName} est achete ${expensiveMarket.gapPct.toFixed(0)} % au-dessus du RNM.`, priority: 1 });
    const impacted = impact.impacts?.[0];
    if (impacted) suggestions.push({ type: 'RECIPE_IMPACT', message: `${impacted.productName} impacte ${impact.impactedRecipesCount} recette(s), premier impact: ${impacted.technicalSheetName}.`, priority: 2 });
    return suggestions;
  }

  private async recalculateTechnicalSheetsForProductsTx(tx: Tx, organizationId: string, productIds: string[]) {
    const impacted = await tx.technicalSheetIngredient.findMany({ where: { organizationId, productId: { in: productIds } }, select: { technicalSheetId: true } });
    const sheetIds = [...new Set(impacted.map((item) => item.technicalSheetId))];
    for (const technicalSheetId of sheetIds) {
      const sheet = await tx.technicalSheet.findUnique({ where: { id: technicalSheetId }, include: { ingredients: { include: { product: { include: { unit: true } }, unit: true } } } });
      if (!sheet) continue;
      let total = new Prisma.Decimal(0);
      let hasNonCalculableLines = false;
      const lineDetails = [];
      for (const line of sheet.ingredients) {
        const calc = await this.calculateTechnicalSheetLineTx(tx, organizationId, line);
        hasNonCalculableLines ||= !calc.isCalculable;
        if (calc.cost) total = total.add(calc.cost);
        await tx.technicalSheetIngredient.update({ where: { id: line.id }, data: { cost: calc.cost, unitPriceSnapshot: line.product.averagePrice, isCalculable: calc.isCalculable, nonCalculableReason: calc.reason, productArchivedSnapshot: line.product.isArchived } });
        lineDetails.push({ ingredientId: line.id, productId: line.productId, productName: line.product.name, cost: calc.cost?.toString() ?? null, isCalculable: calc.isCalculable, reason: calc.reason });
      }
      const perPortion = sheet.referencePortions.isZero() ? new Prisma.Decimal(0) : total.div(sheet.referencePortions);
      await tx.technicalSheet.update({ where: { id: technicalSheetId }, data: { totalCost: total, costPerPortion: perPortion, hasNonCalculableLines, lastCostCalculationAt: new Date() } });
      await tx.technicalSheetCostSnapshot.create({ data: { organizationId, technicalSheetId, totalCost: total, costPerPortion: perPortion, hasNonCalculableLines, lineDetails } });
      await tx.technicalSheetHistory.create({ data: { organizationId, technicalSheetId, action: TechnicalSheetHistoryAction.COST_RECALCULATED, summary: 'Recalcul automatique du coût matière après validation facture Stocks', details: { source: 'stocks-margins', productIds } } });
    }
  }

  private async calculateTechnicalSheetLineTx(tx: Tx, organizationId: string, line: any) {
    if (line.product.isArchived) return { isCalculable: false, cost: null, reason: 'Produit Stocks archive' };
    let qty = new Prisma.Decimal(line.quantity);
    if (line.unitId !== line.product.unitId) {
      const conv = await tx.unitConversion.findFirst({ where: { organizationId, fromUnitId: line.unitId, toUnitId: line.product.unitId } });
      if (!conv) return { isCalculable: false, cost: null, reason: 'Conversion unite indisponible dans Stocks' };
      qty = qty.mul(conv.factor);
    }
    return { isCalculable: true, cost: qty.mul(line.product.averagePrice), reason: null };
  }

  private latestInvoices(lines: any[]) { const map = new Map(lines.map((line) => [line.receptionId, line.reception])); return [...map.values()].slice(0, 10); }
  private sumSince(lines: any[], date: Date) { return this.sumLines(lines.filter((line) => new Date(this.lineDate(line)) >= date)); }
  private serializeLine(line: any) { return { ...line, effectiveUnitPrice: this.effectiveUnitPrice(line), lineAmount: this.lineTotal(line), date: this.lineDate(line), supplier: line.reception?.supplier, document: line.reception?.document }; }
  private serializeAlert(alert: any) { return { ...alert, currentValue: alert.currentValue == null ? null : Number(alert.currentValue), referenceValue: alert.referenceValue == null ? null : Number(alert.referenceValue), variationPct: alert.variationPct == null ? null : Number(alert.variationPct) }; }
  private groupBy(lines: any[], key: (line: any) => string) { const map = new Map<string, any[]>(); for (const line of lines) map.set(key(line), [...(map.get(key(line)) ?? []), line]); return [...map.entries()].map(([k, items]) => ({ key: k, items })); }
  private normalizeName(value?: string | null) { return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  private nameScore(a?: string | null, b?: string | null) {
    const left = new Set(this.normalizeName(a).split(' ').filter((token) => token.length > 2));
    const right = new Set(this.normalizeName(b).split(' ').filter((token) => token.length > 2));
    if (!left.size || !right.size) return 0;
    const common = [...left].filter((token) => right.has(token)).length;
    return Math.max(common / left.size, common / right.size);
  }
}
