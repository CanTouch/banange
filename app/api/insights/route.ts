import { NextRequest, NextResponse } from 'next/server';
import { getInsightsData } from '@/lib/insights';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const daysParam = parseInt(searchParams.get('days') || '7', 10);
    const days = daysParam === 30 ? 30 : 7;

    const data = await getInsightsData(days);

    return NextResponse.json(data, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'server_error', message: 'Failed to generate insights', details: errorMsg },
      { status: 500 }
    );
  }
}
