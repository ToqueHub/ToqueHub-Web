import { PrismaClient } from '@prisma/client';
import { MarketTrendReport } from '../types';

const prisma = new PrismaClient();

export class MarketAnalyticsService {
  /**
   * Helper to execute a query retrieving price variation for a specific interval.
   */
  private async getVariationForInterval(
    labelId: string,
    marketId: string,
    stage: string,
    refDate: Date,
    intervalStr: string
  ): Promise<{ oldPrice: number; percentageVar: number } | null> {
    const result = await prisma.$queryRaw<any[]>`
      WITH current_price AS (
        SELECT avg_price, quotation_date
        FROM market_prices
        WHERE label_id = ${labelId}
          AND market_id = ${marketId}
          AND stage = ${stage}
          AND quotation_date <= ${refDate}
        ORDER BY quotation_date DESC
        LIMIT 1
      ),
      historical_price AS (
        SELECT avg_price, quotation_date
        FROM market_prices
        WHERE label_id = ${labelId}
          AND market_id = ${marketId}
          AND stage = ${stage}
          AND quotation_date <= (SELECT quotation_date FROM current_price) - ${intervalStr}::interval
        ORDER BY quotation_date DESC
        LIMIT 1
      )
      SELECT 
        (SELECT avg_price FROM current_price) as curr,
        (SELECT avg_price FROM historical_price) as hist
    `;

    if (result && result.length > 0 && result[0].curr !== null && result[0].hist !== null) {
      const curr = parseFloat(result[0].curr);
      const oldVal = parseFloat(result[0].hist);
      if (oldVal > 0) {
        return {
          oldPrice: oldVal,
          percentageVar: parseFloat(((curr - oldVal) / oldVal * 100).toFixed(2))
        };
      }
    }
    return null;
  }

  /**
   * Calculates variation between the last quotation and the immediate previous quotation.
   */
  public async getDailyVariation(labelId: string, marketId: string, stage: string, refDate: Date = new Date()): Promise<number> {
    const result = await prisma.$queryRaw<any[]>`
      WITH latest_prices AS (
        SELECT avg_price, quotation_date
        FROM market_prices
        WHERE label_id = ${labelId}
          AND market_id = ${marketId}
          AND stage = ${stage}
          AND quotation_date <= ${refDate}
        ORDER BY quotation_date DESC
        LIMIT 2
      )
      SELECT avg_price FROM latest_prices ORDER BY quotation_date ASC
    `;

    if (result && result.length === 2) {
      const oldPrice = parseFloat(result[0].avg_price);
      const currPrice = parseFloat(result[1].avg_price);
      if (oldPrice > 0) {
        return parseFloat(((currPrice - oldPrice) / oldPrice * 100).toFixed(2));
      }
    }
    return 0;
  }

  /**
   * Calculates variation over 7 days.
   */
  public async getWeeklyVariation(labelId: string, marketId: string, stage: string, refDate: Date = new Date()): Promise<number> {
    const res = await this.getVariationForInterval(labelId, marketId, stage, refDate, '7 days');
    return res ? res.percentageVar : 0;
  }

  /**
   * Calculates variation over 30 days.
   */
  public async getMonthlyVariation(labelId: string, marketId: string, stage: string, refDate: Date = new Date()): Promise<number> {
    const res = await this.getVariationForInterval(labelId, marketId, stage, refDate, '30 days');
    return res ? res.percentageVar : 0;
  }

  /**
   * Calculates variation over 1 year (annual).
   */
  public async getYearlyVariation(labelId: string, marketId: string, stage: string, refDate: Date = new Date()): Promise<number> {
    const res = await this.getVariationForInterval(labelId, marketId, stage, refDate, '1 year');
    return res ? res.percentageVar : 0;
  }

  /**
   * Generates a complete trends report for all active labels.
   */
  public async getTrendsReport(limit: number = 20, offset: number = 0): Promise<MarketTrendReport[]> {
    const rawTrends = await prisma.$queryRaw<any[]>`
      WITH latest_date AS (
        SELECT MAX(quotation_date) as max_date FROM market_prices
      ),
      current_prices AS (
        SELECT 
          mp.id,
          mp.label_id,
          mp.market_id,
          mp.stage,
          mp.quotation_date,
          mp.avg_price
        FROM market_prices mp
        JOIN latest_date ld ON mp.quotation_date = ld.max_date
      )
      SELECT 
        lbl.name as labelName,
        mkt.name as marketName,
        cp.stage as stage,
        cp.quotation_date::text as date,
        cp.avg_price as currentPrice,
        
        -- Daily variation (prev record)
        COALESCE(
          (
            SELECT ROUND(((cp.avg_price - prev_1.avg_price) / prev_1.avg_price) * 100, 2)
            FROM market_prices prev_1
            WHERE prev_1.label_id = cp.label_id 
              AND prev_1.market_id = cp.market_id 
              AND prev_1.stage = cp.stage 
              AND prev_1.quotation_date < cp.quotation_date
            ORDER BY prev_1.quotation_date DESC
            LIMIT 1
          ), 0
        ) as variation1d,

        -- 7 days variation
        COALESCE(
          (
            SELECT ROUND(((cp.avg_price - prev_7.avg_price) / prev_7.avg_price) * 100, 2)
            FROM market_prices prev_7
            WHERE prev_7.label_id = cp.label_id 
              AND prev_7.market_id = cp.market_id 
              AND prev_7.stage = cp.stage 
              AND prev_7.quotation_date <= cp.quotation_date - INTERVAL '7 days'
            ORDER BY prev_7.quotation_date DESC
            LIMIT 1
          ), 0
        ) as variation7d,

        -- 30 days variation
        COALESCE(
          (
            SELECT ROUND(((cp.avg_price - prev_30.avg_price) / prev_30.avg_price) * 100, 2)
            FROM market_prices prev_30
            WHERE prev_30.label_id = cp.label_id 
              AND prev_30.market_id = cp.market_id 
              AND prev_30.stage = cp.stage 
              AND prev_30.quotation_date <= cp.quotation_date - INTERVAL '30 days'
            ORDER BY prev_30.quotation_date DESC
            LIMIT 1
          ), 0
        ) as variation30d,

        -- Annual variation
        COALESCE(
          (
            SELECT ROUND(((cp.avg_price - prev_1y.avg_price) / prev_1y.avg_price) * 100, 2)
            FROM market_prices prev_1y
            WHERE prev_1y.label_id = cp.label_id 
              AND prev_1y.market_id = cp.market_id 
              AND prev_1y.stage = cp.stage 
              AND prev_1y.quotation_date <= cp.quotation_date - INTERVAL '1 year'
            ORDER BY prev_1y.quotation_date DESC
            LIMIT 1
          ), 0
        ) as variation1y

      FROM current_prices cp
      JOIN market_labels lbl ON cp.label_id = lbl.id
      JOIN markets mkt ON cp.market_id = mkt.id
      ORDER BY lbl.name ASC, mkt.name ASC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return rawTrends.map(t => ({
      labelName: t.labelname,
      marketName: t.marketname,
      stage: t.stage,
      currentPrice: parseFloat(t.currentprice),
      date: t.date,
      variation1d: parseFloat(t.variation1d),
      variation7d: parseFloat(t.variation7d),
      variation30d: parseFloat(t.variation30d),
      variation1y: parseFloat(t.variation1y)
    }));
  }

  /**
   * Retrieves top gainers or losers based on 7 days percentage changes.
   */
  public async getTopMovers(type: 'gainers' | 'losers', limit: number = 10): Promise<any[]> {
    const sortOrder = type === 'gainers' ? 'DESC' : 'ASC';
    const filterCond = type === 'gainers' ? 'pct_var > 0' : 'pct_var < 0';

    const result = await prisma.$queryRawUnsafe<any[]>(`
      WITH latest_date AS (
        SELECT MAX(quotation_date) as max_date FROM market_prices
      ),
      price_variations AS (
        SELECT 
          lbl.name as "labelName",
          prod.label as "productName",
          mkt.name as "marketName",
          curr.stage as "stage",
          curr.avg_price as "currentPrice",
          prev.avg_price as "oldPrice",
          ROUND(((curr.avg_price - prev.avg_price) / prev.avg_price) * 100, 2) as "pctVar"
        FROM market_prices curr
        JOIN latest_date ld ON curr.quotation_date = ld.max_date
        JOIN market_labels lbl ON curr.label_id = lbl.id
        JOIN market_products prod ON lbl.product_id = prod.id
        JOIN markets mkt ON curr.market_id = mkt.id
        LEFT JOIN LATERAL (
          SELECT avg_price 
          FROM market_prices
          WHERE label_id = curr.label_id 
            AND market_id = curr.market_id 
            AND stage = curr.stage
            AND quotation_date <= curr.quotation_date - INTERVAL '7 days'
          ORDER BY quotation_date DESC
          LIMIT 1
        ) prev ON TRUE
        WHERE prev.avg_price IS NOT NULL AND prev.avg_price > 0
      )
      SELECT * 
      FROM price_variations 
      WHERE ${filterCond} 
      ORDER BY "pctVar" ${sortOrder} 
      LIMIT ${limit}
    `);

    return result.map(r => ({
      labelName: r.labelName,
      productName: r.productName,
      marketName: r.marketName,
      stage: r.stage,
      currentPrice: parseFloat(r.currentPrice),
      oldPrice: parseFloat(r.oldPrice),
      pctVar: parseFloat(r.pctVar)
    }));
  }
}
