import { NextRequest, NextResponse } from 'next/server';
import { getStore, isDemoMode, isProductionMissingConfig } from '@/lib/store';
import { computeState, CellOut } from '@/lib/states';
import { nearestArea } from '@/lib/areas';
import { validateHistoryWindow, MAX_HISTORY_WINDOW_MS } from '@/lib/history';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    if (isProductionMissingConfig()) {
      return NextResponse.json(
        {
          error: 'server_misconfigured',
          message: 'Database misconfigured: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in production.',
        },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const store = getStore();
    const now = new Date();
    const nowMs = now.getTime();

    const atParam = searchParams.get('at');
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    const rawStep = searchParams.get('step');

    // Case 1: Animation series (?from=...&to=...&step=...)
    if (fromParam && toParam) {
      const fromMs = fromParam === 'now-24h'
        ? nowMs - 24 * 60 * 60 * 1000
        : new Date(fromParam).getTime();
      const toMs = toParam === 'now' ? nowMs : new Date(toParam).getTime();
      const stepParam = rawStep ? parseInt(rawStep, 10) : 30;

      // Validate window and step
      const validation = validateHistoryWindow(fromMs, toMs, stepParam);
      if (!validation.valid) {
        return NextResponse.json(
          {
            error: validation.code,
            message: validation.error,
          },
          { status: validation.status || 422 }
        );
      }

      const stepMs = stepParam * 60 * 1000;
      const sevenDaysBeforeFrom = new Date(fromMs - MAX_HISTORY_WINDOW_MS).toISOString();
      const [reports, blocked] = await Promise.all([
        store.reportsSince(sevenDaysBeforeFrom, new Date(toMs).toISOString()),
        store.getBlockedDevices(),
      ]);

      const snapshots: Array<{
        time: string;
        cells: Array<CellOut & { area?: string }>;
        totals: { dark_now: number; confirmed_now: number };
      }> = [];

      for (let t = fromMs; t <= toMs; t += stepMs) {
        const timeObj = new Date(t);
        const { cells } = computeState(reports, timeObj, blocked);
        const cellsWithArea = cells.map((c) => ({
          ...c,
          fade: typeof c.fade === 'number' ? c.fade : 1,
          area: nearestArea(c.lat, c.lng),
        }));

        snapshots.push({
          time: timeObj.toISOString(),
          cells: cellsWithArea,
          totals: {
            dark_now: cellsWithArea.filter((c) => c.state === 'out').length,
            confirmed_now: cellsWithArea.filter((c) => c.state === 'out' && c.confirmed).length,
          },
        });
      }

      return NextResponse.json(
        {
          demo_mode: isDemoMode(),
          snapshots,
        },
        {
          status: 200,
          headers: {
            'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
          },
        }
      );
    }

    // Case 2: Single snapshot (?at=...)
    const snapshotDate = atParam ? new Date(atParam) : now;
    const snapshotMs = snapshotDate.getTime();
    if (isNaN(snapshotMs)) {
      return NextResponse.json(
        { error: 'invalid_timestamp', message: 'Invalid at parameter timestamp format' },
        { status: 422 }
      );
    }

    // Check if at is older than 7 days
    if (nowMs - snapshotMs > MAX_HISTORY_WINDOW_MS) {
      return NextResponse.json(
        { error: 'window_exceeds_max', message: 'Requested snapshot time cannot be older than 7 days' },
        { status: 422 }
      );
    }

    const sevenDaysPrior = new Date(snapshotMs - MAX_HISTORY_WINDOW_MS).toISOString();
    const [reports, blocked] = await Promise.all([
      store.reportsSince(sevenDaysPrior, snapshotDate.toISOString()),
      store.getBlockedDevices(),
    ]);

    const { cells } = computeState(reports, snapshotDate, blocked);
    const cellsWithArea = cells.map((c) => ({
      ...c,
      fade: typeof c.fade === 'number' ? c.fade : 1,
      area: nearestArea(c.lat, c.lng),
    }));

    return NextResponse.json(
      {
        at: snapshotDate.toISOString(),
        demo_mode: isDemoMode(),
        cells: cellsWithArea,
        totals: {
          dark_now: cellsWithArea.filter((c) => c.state === 'out').length,
          confirmed_now: cellsWithArea.filter((c) => c.state === 'out' && c.confirmed).length,
        },
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        },
      }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'server_error', message: 'Failed to generate history data', details: errorMsg },
      { status: 500 }
    );
  }
}
