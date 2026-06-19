import { NextRequest, NextResponse } from 'next/server';
import { MarketAnalyticsService } from '../../../../modules/rnm/services/market-analytics.service';

const analyticsService = new MarketAnalyticsService();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    const losers = await analyticsService.getTopMovers('losers', limit);

    return NextResponse.json({
      success: true,
      data: losers
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
