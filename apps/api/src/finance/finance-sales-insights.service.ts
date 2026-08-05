import { Injectable } from '@nestjs/common';
import { FinanceImportStatus, FinanceReportKind, FinanceSourceType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { deduplicateCrossSourceSales } from './finance-sales-dedupe';

type Range = { from: Date; to: Date };
type FinanceSaleRow = Prisma.FinanceDailySalesGetPayload<{
  include: {
    source: { select: { id: true; name: true; provider: true; isPrimaryPos: true } };
    importBatch: { select: { id: true; reportKind: true; periodStart: true; periodEnd: true } };
  };
}>;

const DAY = 86_400_000;
const WEEKDAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

function startOfDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function endOfDay(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 23, 59, 59, 999),
  );
}

function parseDate(value: string | undefined, fallback: Date) {
  if (!value) return fallback;
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function shiftYear(value: Date, years: number) {
  return new Date(
    Date.UTC(
      value.getUTCFullYear() + years,
      value.getUTCMonth(),
      value.getUTCDate(),
      value.getUTCHours(),
      value.getUTCMinutes(),
      value.getUTCSeconds(),
      value.getUTCMilliseconds(),
    ),
  );
}

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function numeric(value: unknown) {
  if (value == null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percentage(value: number, total: number) {
  return total ? round((value / total) * 100, 1) : 0;
}

function variation(current: number | null, reference: number | null) {
  if (current == null || reference == null || reference === 0) return null;
  return round(((current - reference) / Math.abs(reference)) * 100, 1);
}

function metadata(row: { metadata: Prisma.JsonValue | null }) {
  return (
    row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? row.metadata
      : {}
  ) as Record<string, unknown>;
}

function productKey(name: string, category: string) {
  return `${name.trim().toLocaleLowerCase('fr-FR')}|${category.trim().toLocaleLowerCase('fr-FR')}`;
}

function isSummaryProduct(name: string) {
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
  return ['total', 'yhteensa', 'subtotal', 'soustotal', 'grandtotal'].includes(normalized);
}

function dateParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(value)
    .reduce<Record<string, string>>((result, part) => {
      if (part.type !== 'literal') result[part.type] = part.value;
      return result;
    }, {});
  const weekdayIndex = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    weekday: Math.max(0, weekdayIndex),
  };
}

function dateRange(from: Date, to: Date): Range {
  return { from: startOfDay(from), to: endOfDay(to) };
}

export function completeDailySalesSeries(
  from: Date,
  to: Date,
  points: Array<{ date: string; revenue: number; transactions: number }>,
) {
  const values = new Map(points.map((point) => [point.date, point]));
  const result: Array<{ date: string; revenue: number; transactions: number }> = [];
  for (let cursor = startOfDay(from).getTime(); cursor <= startOfDay(to).getTime(); cursor += DAY) {
    const date = new Date(cursor).toISOString().slice(0, 10);
    result.push(values.get(date) ?? { date, revenue: 0, transactions: 0 });
  }
  return result;
}

function previousRange(range: Range): Range {
  const days =
    Math.floor((startOfDay(range.to).getTime() - startOfDay(range.from).getTime()) / DAY) + 1;
  const sameCalendarMonth =
    range.from.getUTCDate() === 1 &&
    range.from.getUTCFullYear() === range.to.getUTCFullYear() &&
    range.from.getUTCMonth() === range.to.getUTCMonth();
  if (sameCalendarMonth) {
    const previousMonthStart = new Date(
      Date.UTC(range.from.getUTCFullYear(), range.from.getUTCMonth() - 1, 1),
    );
    const previousMonthEndDay = new Date(
      Date.UTC(range.from.getUTCFullYear(), range.from.getUTCMonth(), 0),
    ).getUTCDate();
    const comparableDay = Math.min(range.to.getUTCDate(), previousMonthEndDay);
    return dateRange(
      previousMonthStart,
      new Date(
        Date.UTC(
          previousMonthStart.getUTCFullYear(),
          previousMonthStart.getUTCMonth(),
          comparableDay,
        ),
      ),
    );
  }
  const to = new Date(range.from.getTime() - 1);
  const from = new Date(startOfDay(to).getTime() - (days - 1) * DAY);
  return dateRange(from, to);
}

function comparableName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
}

type ProductBatch = {
  id: string;
  sourceId?: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  createdAt: Date;
};

export function selectNonOverlappingBatches(batches: ProductBatch[]) {
  const latestExact = new Map<string, ProductBatch>();
  for (const batch of batches) {
    if (!batch.periodStart || !batch.periodEnd) continue;
    const key = `${batch.periodStart.toISOString()}|${batch.periodEnd.toISOString()}`;
    const existing = latestExact.get(key);
    if (!existing || existing.createdAt < batch.createdAt) latestExact.set(key, batch);
  }
  const intervals = [...latestExact.values()].sort(
    (left, right) => left.periodEnd!.getTime() - right.periodEnd!.getTime(),
  );
  const previousCompatible = intervals.map((interval, index) => {
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      if (intervals[cursor].periodEnd!.getTime() < interval.periodStart!.getTime()) return cursor;
    }
    return -1;
  });
  const scores: number[] = [];
  intervals.forEach((interval, index) => {
    const duration =
      Math.floor(
        (startOfDay(interval.periodEnd!).getTime() - startOfDay(interval.periodStart!).getTime()) /
          DAY,
      ) + 1;
    const previous = previousCompatible[index] >= 0 ? scores[previousCompatible[index]] : 0;
    const include = duration + previous;
    const exclude = index > 0 ? scores[index - 1] : 0;
    scores.push(Math.max(include, exclude));
  });
  const selected: ProductBatch[] = [];
  for (let index = intervals.length - 1; index >= 0; ) {
    const duration =
      Math.floor(
        (startOfDay(intervals[index].periodEnd!).getTime() -
          startOfDay(intervals[index].periodStart!).getTime()) /
          DAY,
      ) + 1;
    const compatibleScore = previousCompatible[index] >= 0 ? scores[previousCompatible[index]] : 0;
    const excludeScore = index > 0 ? scores[index - 1] : 0;
    if (duration + compatibleScore >= excludeScore) {
      selected.push(intervals[index]);
      index = previousCompatible[index];
    } else index -= 1;
  }
  return selected.reverse();
}

@Injectable()
export class FinanceSalesInsightsService {
  constructor(private readonly prisma: PrismaService) {}

  async build(organizationId: string, query: { from?: string; to?: string; siteId?: string } = {}) {
    const settings = await this.prisma.financeSettings.findUnique({ where: { organizationId } });
    const timeZone = settings?.timezone || 'Europe/Helsinki';
    const now = new Date();
    const to = endOfDay(parseDate(query.to, now));
    const defaultFrom = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
    const current = dateRange(parseDate(query.from, defaultFrom), to);
    const previous = previousRange(current);
    const previousYear = dateRange(shiftYear(current.from, -1), shiftYear(current.to, -1));

    const importedTransactionRows = await this.prisma.financeDailySales.findMany({
      where: {
        organizationId,
        OR: [current, previous, previousYear].map((range) => ({
          saleDate: { gte: range.from, lte: range.to },
        })),
        AND: [
          {
            source: {
              is: {
                isPrimarySales: true,
                ...(query.siteId ? { siteId: query.siteId } : {}),
              },
            },
          },
          {
            OR: [
              {
                importBatch: {
                  is: {
                    reportKind: {
                      in: [FinanceReportKind.SALES_ORDERS, FinanceReportKind.RECEIPTS],
                    },
                  },
                },
              },
              {
                importBatchId: null,
                source: { is: { sourceType: FinanceSourceType.POS_API } },
              },
            ],
          },
        ],
      },
      include: {
        source: {
          select: { id: true, name: true, provider: true, siteId: true, isPrimaryPos: true },
        },
        importBatch: {
          select: { id: true, reportKind: true, periodStart: true, periodEnd: true },
        },
      },
      orderBy: { saleDate: 'asc' },
    });
    const deduplication = deduplicateCrossSourceSales(importedTransactionRows);
    const transactionRows = deduplication.rows;

    const [currentProducts, previousProducts, previousYearProducts, technicalSheets, assignments] =
      await Promise.all([
        this.productsFor(organizationId, current, query.siteId),
        this.productsFor(organizationId, previous, query.siteId),
        this.productsFor(organizationId, previousYear, query.siteId),
        this.prisma.technicalSheet.findMany({
          where: {
            organizationId,
            isArchived: false,
            status: { in: ['ACTIVE', 'VALIDATED'] },
            costPerPortion: { gt: 0 },
          },
          select: {
            name: true,
            costPerPortion: true,
            outputProduct: { select: { name: true } },
          },
        }),
        this.prisma.planningAssignment.findMany({
          where: {
            organizationId,
            ...(query.siteId ? { siteId: query.siteId } : {}),
            status: { not: 'CANCELLED' },
            startTime: { lte: current.to },
            endTime: { gte: current.from },
          },
          select: { startTime: true, endTime: true, breakMinutes: true },
        }),
      ]);
    const currentRows = transactionRows.filter(
      ({ saleDate }) => saleDate >= current.from && saleDate <= current.to,
    );
    const previousRows = transactionRows.filter(
      ({ saleDate }) => saleDate >= previous.from && saleDate <= previous.to,
    );
    const previousYearRows = transactionRows.filter(
      ({ saleDate }) => saleDate >= previousYear.from && saleDate <= previousYear.to,
    );
    const currentSummary = this.transactionSummary(currentRows);
    const previousSummary = this.transactionSummary(previousRows);
    const previousYearSummary = this.transactionSummary(previousYearRows);
    const currentProductMap = new Map(currentProducts.products.map((item) => [item.key, item]));
    const previousProductMap = new Map(previousProducts.products.map((item) => [item.key, item]));
    const costs = new Map<string, number>();
    for (const sheet of technicalSheets) {
      const cost = numeric(sheet.costPerPortion);
      for (const name of [sheet.name, sheet.outputProduct?.name]) {
        if (name && cost > 0) costs.set(comparableName(name), cost);
      }
    }
    const totalProductGross = currentProducts.products.reduce((sum, item) => sum + item.gross, 0);
    const products = currentProducts.products
      .map((item) => {
        const unitCost = costs.get(comparableName(item.name)) ?? null;
        const estimatedCost = unitCost == null ? null : round(unitCost * item.quantity);
        const margin = estimatedCost == null ? null : round(item.net - estimatedCost);
        return {
          name: item.name,
          category: item.category,
          quantity: round(item.quantity, 2),
          gross: round(item.gross),
          net: round(item.net),
          discount: round(item.discount),
          sharePercent: percentage(item.gross, totalProductGross),
          previousQuantity: previousProductMap.get(item.key)?.quantity ?? null,
          quantityVariationPercent: variation(
            item.quantity,
            previousProductMap.get(item.key)?.quantity ?? null,
          ),
          unitCost,
          estimatedCost,
          margin,
          marginRate: margin == null ? null : percentage(margin, item.net),
        };
      })
      .sort((left, right) => right.gross - left.gross);
    const categories = [...currentProductMap.values()].reduce((map, item) => {
      const key = item.category || 'Non classé';
      const currentValue = map.get(key) ?? { category: key, quantity: 0, gross: 0, net: 0 };
      currentValue.quantity += item.quantity;
      currentValue.gross += item.gross;
      currentValue.net += item.net;
      map.set(key, currentValue);
      return map;
    }, new Map<string, { category: string; quantity: number; gross: number; net: number }>());
    const categoryRows = [...categories.values()]
      .map((item) => ({
        ...item,
        quantity: round(item.quantity, 2),
        gross: round(item.gross),
        net: round(item.net),
        sharePercent: percentage(item.gross, totalProductGross),
      }))
      .sort((left, right) => right.gross - left.gross);
    const activity = this.activity(currentRows, timeZone, current);
    const staffing = this.staffing(assignments, activity.hourly, current, timeZone);
    const sources = [...new Map(currentRows.map((row) => [row.source.id, row.source])).values()];
    const periodDays =
      Math.floor((startOfDay(current.to).getTime() - startOfDay(current.from).getTime()) / DAY) + 1;

    return {
      period: {
        from: current.from.toISOString(),
        to: current.to.toISOString(),
        days: periodDays,
        timeZone,
      },
      scope: { siteId: query.siteId ?? null },
      summary: {
        ...currentSummary,
        productCount: products.length,
        categoryCount: categoryRows.length,
        peakHour: activity.peakHour,
        peakWeekday: activity.peakWeekday,
      },
      comparisons: {
        previousPeriod: {
          from: previous.from.toISOString(),
          to: previous.to.toISOString(),
          ...previousSummary,
          revenueVariationPercent: variation(currentSummary.revenue, previousSummary.revenue),
          transactionVariationPercent: variation(
            currentSummary.transactions,
            previousSummary.transactions,
          ),
          averageTicketVariationPercent: variation(
            currentSummary.averageTicket,
            previousSummary.averageTicket,
          ),
        },
        previousYear: {
          from: previousYear.from.toISOString(),
          to: previousYear.to.toISOString(),
          ...previousYearSummary,
          revenueVariationPercent: variation(currentSummary.revenue, previousYearSummary.revenue),
          transactionVariationPercent: variation(
            currentSummary.transactions,
            previousYearSummary.transactions,
          ),
          averageTicketVariationPercent: variation(
            currentSummary.averageTicket,
            previousYearSummary.averageTicket,
          ),
        },
      },
      hourly: activity.hourly,
      weekdays: activity.weekdays,
      daily: activity.daily,
      products,
      topProducts: products.slice(0, 12),
      lowProducts: products
        .filter(({ quantity }) => quantity > 0)
        .sort((left, right) => left.quantity - right.quantity)
        .slice(0, 8),
      categories: categoryRows,
      staffing,
      quality: {
        transactionRows: currentRows.length,
        crossSourceDuplicatesExcluded: deduplication.duplicateCandidates,
        productRows: currentProducts.rowCount,
        productCoverageDays: currentProducts.coverageDays,
        productCoveragePercent: percentage(currentProducts.coverageDays, periodDays),
        selectedProductReports: currentProducts.batchCount,
        overlappingProductReportsExcluded: currentProducts.excludedBatchCount,
        productPeriod: currentProducts.period
          ? {
              from: currentProducts.period.from.toISOString(),
              to: currentProducts.period.to.toISOString(),
            }
          : null,
        sources,
        limitations: [
          ...(currentProducts.coverageDays === 0
            ? [
                'Aucun Sales Overview ne couvre précisément cette période. Les chiffres de ventes et d’affluence restent disponibles sans afficher de produits d’une autre période.',
              ]
            : currentProducts.coverageDays < periodDays
              ? [
                  `Les ventes produit couvrent ${currentProducts.coverageDays} jour(s) sur ${periodDays} pour cette période.`,
                ]
              : []),
          ...(products.length && products.every(({ margin }) => margin == null)
            ? ['La marge par produit nécessite un coût matière ou une fiche technique rapprochée.']
            : []),
          ...(!staffing.available
            ? ['Aucun planning exploitable ne permet encore de comparer affluence et effectif.']
            : []),
          ...(!currentRows.some((row) => numeric(metadata(row).discount) !== 0)
            ? ['Aucune remise n’est présente dans les transactions de cette période.']
            : []),
        ],
      },
      productComparisons: {
        previousPeriodCoveragePercent: percentage(previousProducts.coverageDays, periodDays),
        previousYearCoveragePercent: percentage(previousYearProducts.coverageDays, periodDays),
        previousYearProductCount: previousYearProducts.products.length,
      },
    };
  }

  private transactionSummary(rows: FinanceSaleRow[]) {
    const revenueRows = rows.filter(({ isRevenueRecord }) => isRevenueRecord);
    const revenue = revenueRows.reduce((sum, row) => sum + numeric(row.grossAmount), 0);
    const netRevenue = revenueRows.reduce((sum, row) => sum + numeric(row.netAmount), 0);
    const transactions = revenueRows.reduce((sum, row) => sum + row.transactionCount, 0);
    const refunds = rows.reduce((sum, row) => sum + numeric(row.refundAmount), 0);
    const discounts = rows.reduce((sum, row) => sum + numeric(metadata(row).discount as number), 0);
    const cancellations = rows.filter((row) => {
      const status = String(metadata(row).status ?? '').toLowerCase();
      return status.includes('cancel') || status.includes('void');
    }).length;
    return {
      revenue: round(revenue),
      netRevenue: round(netRevenue),
      transactions,
      averageTicket: transactions ? round(revenue / transactions) : null,
      refunds: round(refunds),
      discounts: round(discounts),
      cancellations,
    };
  }

  private activity(rows: FinanceSaleRow[], timeZone: string, range: Range) {
    const revenueRows = rows.filter(({ isRevenueRecord }) => isRevenueRecord);
    const hourly = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      label: `${String(hour).padStart(2, '0')}h–${String((hour + 1) % 24).padStart(2, '0')}h`,
      revenue: 0,
      transactions: 0,
      sharePercent: 0,
      averageTicket: null as number | null,
    }));
    const weekdays = WEEKDAYS.map((label, weekday) => ({
      weekday,
      label,
      revenue: 0,
      transactions: 0,
      sharePercent: 0,
      averageTicket: null as number | null,
    }));
    const dailyMap = new Map<string, { date: string; revenue: number; transactions: number }>();
    for (const row of revenueRows) {
      const parts = dateParts(row.saleDate, timeZone);
      const gross = numeric(row.grossAmount);
      hourly[parts.hour].revenue += gross;
      hourly[parts.hour].transactions += row.transactionCount;
      weekdays[parts.weekday].revenue += gross;
      weekdays[parts.weekday].transactions += row.transactionCount;
      const day = dailyMap.get(parts.date) ?? { date: parts.date, revenue: 0, transactions: 0 };
      day.revenue += gross;
      day.transactions += row.transactionCount;
      dailyMap.set(parts.date, day);
    }
    const revenue = hourly.reduce((sum, item) => sum + item.revenue, 0);
    for (const item of hourly) {
      item.revenue = round(item.revenue);
      item.sharePercent = percentage(item.revenue, revenue);
      item.averageTicket = item.transactions ? round(item.revenue / item.transactions) : null;
    }
    for (const item of weekdays) {
      item.revenue = round(item.revenue);
      item.sharePercent = percentage(item.revenue, revenue);
      item.averageTicket = item.transactions ? round(item.revenue / item.transactions) : null;
    }
    const daily = completeDailySalesSeries(
      range.from,
      range.to,
      [...dailyMap.values()].map((item) => ({ ...item, revenue: round(item.revenue) })),
    );
    const peakHour =
      [...hourly]
        .filter(({ transactions }) => transactions > 0)
        .sort((left, right) => right.transactions - left.transactions)[0] ?? null;
    const peakWeekday =
      [...weekdays]
        .filter(({ transactions }) => transactions > 0)
        .sort((left, right) => right.transactions - left.transactions)[0] ?? null;
    return { hourly, weekdays, daily, peakHour, peakWeekday };
  }

  private staffing(
    assignments: Array<{ startTime: Date; endTime: Date; breakMinutes: number }>,
    activity: Array<{ hour: number; revenue: number; transactions: number }>,
    range: Range,
    timeZone: string,
  ) {
    const hours = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      plannedHours: 0,
      revenue: activity[hour]?.revenue ?? 0,
      transactions: activity[hour]?.transactions ?? 0,
      revenuePerPlannedHour: null as number | null,
      transactionsPerPlannedHour: null as number | null,
    }));
    let plannedHours = 0;
    for (const assignment of assignments) {
      const start = Math.max(assignment.startTime.getTime(), range.from.getTime());
      const end = Math.min(assignment.endTime.getTime(), range.to.getTime());
      if (end <= start) continue;
      const durationHours = (end - start) / 3_600_000;
      const paidRatio = Math.max(0, durationHours - assignment.breakMinutes / 60) / durationHours;
      plannedHours += durationHours * paidRatio;
      let cursor = start;
      while (cursor < end) {
        const nextHour = Math.min(end, Math.floor(cursor / 3_600_000) * 3_600_000 + 3_600_000);
        const midpoint = new Date(cursor + (nextHour - cursor) / 2);
        const hour = dateParts(midpoint, timeZone).hour;
        hours[hour].plannedHours += ((nextHour - cursor) / 3_600_000) * paidRatio;
        cursor = nextHour;
      }
    }
    for (const item of hours) {
      item.plannedHours = round(item.plannedHours, 1);
      item.revenuePerPlannedHour = item.plannedHours
        ? round(item.revenue / item.plannedHours)
        : null;
      item.transactionsPerPlannedHour = item.plannedHours
        ? round(item.transactions / item.plannedHours, 1)
        : null;
    }
    const pressureHours = hours
      .filter(({ transactions, plannedHours: value }) => transactions > 0 && value > 0)
      .sort(
        (left, right) =>
          (right.transactionsPerPlannedHour ?? 0) - (left.transactionsPerPlannedHour ?? 0),
      )
      .slice(0, 5);
    return {
      available: plannedHours > 0,
      assignments: assignments.length,
      plannedHours: round(plannedHours, 1),
      revenuePerPlannedHour: plannedHours
        ? round(activity.reduce((sum, item) => sum + item.revenue, 0) / plannedHours)
        : null,
      hourly: hours,
      pressureHours,
    };
  }

  private async productsFor(organizationId: string, range: Range, siteId?: string) {
    const batches = await this.prisma.financeImportBatch.findMany({
      where: {
        organizationId,
        status: FinanceImportStatus.READY,
        reportKind: { in: [FinanceReportKind.PRODUCT_SALES, FinanceReportKind.RECEIPTS] },
        periodStart: { not: null },
        periodEnd: { not: null, lte: range.to },
        source: { isPrimarySales: true, ...(siteId ? { siteId } : {}) },
      },
      select: { id: true, sourceId: true, periodStart: true, periodEnd: true, createdAt: true },
      orderBy: [{ periodEnd: 'desc' }, { createdAt: 'desc' }],
    });
    const batchesWithinRange = batches.filter(
      (batch) => batch.periodStart! >= range.from && batch.periodEnd! <= range.to,
    );
    // Les intervalles ne se neutralisent qu'au sein d'une même caisse. Deux caisses actives
    // simultanément (FlatPay + Loyverse, par exemple) doivent toutes les deux être conservées.
    const batchesBySource = new Map<string, typeof batchesWithinRange>();
    for (const batch of batchesWithinRange) {
      const sourceId = batch.sourceId ?? 'unassigned';
      const values = batchesBySource.get(sourceId) ?? [];
      values.push(batch);
      batchesBySource.set(sourceId, values);
    }
    const selected = [...batchesBySource.values()].flatMap((values) =>
      selectNonOverlappingBatches(values),
    );
    const selectedIds = selected.map(({ id }) => id);
    const apiSources = await this.prisma.financeDataSource.findMany({
      where: {
        organizationId,
        isPrimarySales: true,
        sourceType: FinanceSourceType.POS_API,
        ...(siteId ? { siteId } : {}),
      },
      select: { id: true },
    });
    const [fileRows, apiRows] = await Promise.all([
      selectedIds.length
        ? this.prisma.financeDailySales.findMany({
            where: { organizationId, importBatchId: { in: selectedIds }, isRevenueRecord: false },
            include: { source: { select: { provider: true } } },
          })
        : [],
      apiSources.length
        ? this.prisma.financeDailySales.findMany({
            where: {
              organizationId,
              sourceId: { in: apiSources.map(({ id }) => id) },
              importBatchId: null,
              isRevenueRecord: false,
              saleDate: { gte: range.from, lte: range.to },
            },
            include: { source: { select: { provider: true } } },
          })
        : [],
    ]);
    // Une API et un ancien export peuvent couvrir le même reçu. Dans ce cas l'API, plus riche et
    // actualisable, remplace intégralement les lignes produit de l'export pour ce reçu.
    const apiReceipts = new Set(
      apiRows
        .map((row) => {
          const receipt = String(metadata(row).receiptNumber ?? '').trim();
          return receipt ? `${row.source.provider}|${receipt}` : '';
        })
        .filter(Boolean),
    );
    const rows = [
      ...apiRows,
      ...fileRows.filter((row) => {
        const receipt = String(metadata(row).receiptNumber ?? '').trim();
        return !receipt || !apiReceipts.has(`${row.source.provider}|${receipt}`);
      }),
    ];
    const products = new Map<
      string,
      {
        key: string;
        name: string;
        category: string;
        quantity: number;
        gross: number;
        net: number;
        discount: number;
      }
    >();
    for (const row of rows) {
      const details = metadata(row);
      if (details.recordType && details.recordType !== 'product_snapshot') continue;
      const name = String(details.product ?? '').trim();
      if (!name || isSummaryProduct(name)) continue;
      const category = row.productCategory?.trim() || 'Non classé';
      const key = productKey(name, category);
      const item = products.get(key) ?? {
        key,
        name,
        category,
        quantity: 0,
        gross: 0,
        net: 0,
        discount: 0,
      };
      item.quantity += numeric(details.quantity as number);
      item.gross += numeric(row.grossAmount);
      item.net += numeric(row.netAmount);
      item.discount += numeric(details.discount as number);
      products.set(key, item);
    }
    const coveredDates = new Set<string>();
    for (const batch of selected) {
      for (
        let cursor = startOfDay(batch.periodStart!).getTime();
        cursor <= startOfDay(batch.periodEnd!).getTime();
        cursor += DAY
      ) {
        coveredDates.add(new Date(cursor).toISOString().slice(0, 10));
      }
    }
    for (const row of apiRows)
      coveredDates.add(startOfDay(row.saleDate).toISOString().slice(0, 10));
    const allDates = [
      ...selected.flatMap((batch) => [batch.periodStart!, batch.periodEnd!]),
      ...apiRows.map(({ saleDate }) => saleDate),
    ];
    const period = allDates.length
      ? {
          from: new Date(Math.min(...allDates.map((value) => value.getTime()))),
          to: new Date(Math.max(...allDates.map((value) => value.getTime()))),
        }
      : null;
    return {
      products: [...products.values()],
      rowCount: rows.length,
      coverageDays: coveredDates.size,
      batchCount: selected.length + apiSources.length,
      excludedBatchCount: Math.max(0, batchesWithinRange.length - selected.length),
      period,
    };
  }
}
