import { NextRequest, NextResponse } from 'next/server';
import { MarketAnalyticsService } from '../../../../modules/rnm/services/market-analytics.service';

const analyticsService = new MarketAnalyticsService();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const report = await analyticsService.getTrendsReport(limit, offset);

    return NextResponse.json({
      success: true,
      data: report,
      pagination: {
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
