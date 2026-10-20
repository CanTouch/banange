import { NextResponse } from 'next/server';
import { getStore, isDevMode, isDemoMode, isProductionMissingConfig } from '@/lib/store';
import { computeState } from '@/lib/states';
import { parseCell } from '@/lib/cells';
import { GRID_SIZE_DEG } from '@/lib/constants';
import { nearestArea } from '@/lib/areas';
import { getOutageDurationHours, isOutageActive, isOutageConfirmed } from '@/lib/duration';

export const dynamic = 'force-dynamic';

export async function GET() {
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

    const store = getStore();
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [reports, blocked] = await Promise.all([
      store.reportsSince(sevenDaysAgo),
      store.getBlockedDevices(),
    ]);

    const { cells, episodes } = computeState(reports, now, blocked);

    // Attach area to each cell
    const cellsWithArea = cells.map((c) => ({
      ...c,
      area: nearestArea(c.lat, c.lng),
    }));

    // Group weekly episodes by nearestArea of cell center
    const areaStatsMap = new Map<
      string,
      { name: string; episodes_7d: number; hours_dark_7d_estimated: number; dark_now: boolean }
    >();

    const activeDarkCells = cellsWithArea.filter(
      (c) =>
        c.state === 'out' &&
        isOutageActive(
          {
            area: c.area,
            start: c.since,
            lastReport: c.last_activity,
            restoredAt: c.restored_at,
            confirmed: c.confirmed,
            devices: c.reporters,
          },
          now
        )
    );

    const darkAreaNames = new Set(activeDarkCells.map((c) => c.area));

    const sevenDaysAgoMs = now.getTime() - 7 * 24 * 60 * 60 * 1000;

    for (const ep of episodes) {
      const epStartMs = new Date(ep.start).getTime();
      if (epStartMs < sevenDaysAgoMs) continue;

      const { ix, iy } = parseCell(ep.cell_id);
      const lat = Number((ix * GRID_SIZE_DEG).toFixed(3));
      const lng = Number((iy * GRID_SIZE_DEG).toFixed(3));
      const area = nearestArea(lat, lng);

      const outageInfo = {
        area,
        start: ep.start,
        lastReport: ep.lastActivity,
        end: ep.end,
        endedBy: ep.endedBy,
        confirmed: ep.confirmed,
        devices: ep.devices,
      };

      if (!isOutageConfirmed(outageInfo)) {
        continue;
      }

      const hours = getOutageDurationHours(outageInfo, now);

      let stat = areaStatsMap.get(area);
      if (!stat) {
        stat = {
          name: area,
          episodes_7d: 0,
          hours_dark_7d_estimated: 0,
          dark_now: darkAreaNames.has(area),
        };
        areaStatsMap.set(area, stat);
      }

      stat.episodes_7d += 1;
      stat.hours_dark_7d_estimated += hours;
    }

    // Also include any currently dark areas that might not have closed episodes yet
    for (const area of darkAreaNames) {
      if (!areaStatsMap.has(area)) {
        areaStatsMap.set(area, {
          name: area,
          episodes_7d: 1,
          hours_dark_7d_estimated: 0,
          dark_now: true,
        });
      }
    }

    const areasList = Array.from(areaStatsMap.values())
      .map((a) => ({
        ...a,
        hours_dark_7d_estimated: Math.round(a.hours_dark_7d_estimated * 10) / 10,
      }))
      .sort((a, b) => {
        if (b.episodes_7d !== a.episodes_7d) {
          return b.episodes_7d - a.episodes_7d;
        }
        return b.hours_dark_7d_estimated - a.hours_dark_7d_estimated;
      });

    const darkNowCount = activeDarkCells.length;
    const confirmedNowCount = activeDarkCells.filter((c) => c.confirmed).length;

    const body = {
      generated_at: now.toISOString(),
      dev_mode: isDevMode(),
      demo_mode: isDemoMode(),
      cells: cellsWithArea,
      areas: areasList,
      totals: {
        dark_now: darkNowCount,
        confirmed_now: confirmedNowCount,
      },
    };

    return NextResponse.json(body, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=60',
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'server_error', message: 'Failed to generate map data', details: errorMsg },
      { status: 500 }
    );
  }
}
