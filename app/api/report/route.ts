import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { DAILY_LIMIT, RATE_LIMIT_MINUTES, UGANDA_BOUNDS } from '@/lib/constants';
import { latLngToCell } from '@/lib/cells';
import { hashDeviceId } from '@/lib/device';
import { getStore } from '@/lib/store';
import { getAreas } from '@/lib/areas';
import { verifyTurnstileToken } from '@/lib/turnstile';

export const dynamic = 'force-dynamic';

const reportSchema = z.object({
  kind: z.enum(['out', 'back']),
  lat: z.number(),
  lng: z.number(),
  loc_precision: z.enum(['gps', 'pin', 'area']),
  area_name: z.string().max(60).optional(),
  device_id: z.string().uuid(),
  turnstile_token: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const parsed = reportSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_request', message: 'Invalid request payload', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { kind, lat, lng, loc_precision, area_name, device_id, turnstile_token } = parsed.data;

    // 1. Validate Uganda bounds
    if (
      lat < UGANDA_BOUNDS.latMin ||
      lat > UGANDA_BOUNDS.latMax ||
      lng < UGANDA_BOUNDS.lngMin ||
      lng > UGANDA_BOUNDS.lngMax
    ) {
      return NextResponse.json(
        { error: 'out_of_bounds', message: 'Banange only covers Uganda for now.' },
        { status: 422 }
      );
    }

    // 2. Turnstile bot check
    const isHuman = await verifyTurnstileToken(turnstile_token);
    if (!isHuman) {
      return NextResponse.json(
        { error: 'challenge_failed', message: 'Bot verification failed.' },
        { status: 403 }
      );
    }

    const store = getStore();
    const deviceHash = hashDeviceId(device_id);

    // 3. Silent drop if blocked
    const blocked = await store.isBlocked(deviceHash);
    if (blocked) {
      return NextResponse.json({ ok: true }, { status: 201 });
    }

    // 4. Rate limit: DAILY_LIMIT in 24 h
    const dailySince = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const dailyCount = await store.countReports(deviceHash, dailySince);
    if (dailyCount >= DAILY_LIMIT) {
      return NextResponse.json(
        { error: 'daily_limit', message: 'Daily report limit reached. Please try again tomorrow.' },
        { status: 429 }
      );
    }

    // Rate limit: same device + kind within RATE_LIMIT_MINUTES
    const rateLimitSince = new Date(Date.now() - RATE_LIMIT_MINUTES * 60 * 1000).toISOString();
    const hasRecentReport = await store.lastReport(deviceHash, kind, rateLimitSince);
    if (hasRecentReport) {
      return NextResponse.json(
        {
          error: 'rate_limited',
          message: `You already reported that. Thank you, we've got it. Try again in ${RATE_LIMIT_MINUTES} min.`,
          retry_after_seconds: RATE_LIMIT_MINUTES * 60,
        },
        { status: 429 }
      );
    }

    // 5. Round to grid & area matching
    const { cell_id, cell_lat, cell_lng } = latLngToCell(lat, lng);
    const areas = getAreas();
    const validatedAreaName =
      area_name && areas.some((a) => a.name === area_name) ? area_name : null;

    await store.insertReport({
      kind,
      cell_id,
      cell_lat,
      cell_lng,
      loc_precision,
      area_name: validatedAreaName,
      device_hash: deviceHash,
      flagged: false,
    });

    // 6. Return response
    return NextResponse.json(
      {
        ok: true,
        cell_id,
        cell_lat,
        cell_lng,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'server_error', message: 'Internal server error', details: errorMsg },
      { status: 500 }
    );
  }
}
