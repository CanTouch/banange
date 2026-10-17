import { NextRequest, NextResponse } from 'next/server';
import { searchAreas } from '@/lib/areas';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') || '';

  const results = searchAreas(q);

  return NextResponse.json({ results });
}
