import { describe, it, expect, beforeEach } from 'vitest';
import {
  getOutageDurationHours,
  isOutageActive,
  isOutageConfirmed,
  getCurrentlyDarkCount,
  getAreaOutageDuration,
} from '../lib/duration';
import { getStore } from '../lib/store';
import { computeState } from '../lib/states';
import { getInsightsData } from '../lib/insights';
import { hashDeviceId } from '../lib/device';
import { latLngToCell } from '../lib/cells';
import { nearestArea } from '../lib/areas';

describe('Outage duration and active rules (lib/duration.ts)', () => {
  const now = new Date('2026-10-19T12:00:00.000Z');

  it('outage with no back report, last report 8 h ago -> duration capped at 6 h after the last report, not active', () => {
    const eightHoursAgo = new Date(now.getTime() - 8 * 60 * 60 * 1000).toISOString();

    const outage = {
      area: 'Ntinda',
      start: eightHoursAgo,
      lastReport: eightHoursAgo,
      confirmed: true,
    };

    const duration = getOutageDurationHours(outage, now);
    const active = isOutageActive(outage, now);

    // Stops growing 6 hours after its last report: 8h ago -> capped at 6h
    expect(duration).toBe(6);
    expect(active).toBe(false);

    // Multi-report outage: first report 10h ago, last report 8h ago -> capped at (10 - 8) + 6 = 8h
    const tenHoursAgo = new Date(now.getTime() - 10 * 60 * 60 * 1000).toISOString();
    const multiReportOutage = {
      area: 'Kololo',
      start: tenHoursAgo,
      lastReport: eightHoursAgo,
      confirmed: true,
    };
    expect(getOutageDurationHours(multiReportOutage, now)).toBe(8);
    expect(isOutageActive(multiReportOutage, now)).toBe(false);
  });

  it('outage restored after 2 h -> 2 h', () => {
    const fiveHoursAgo = new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString();
    const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString();
    const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString(); // 2h after start

    const outage = {
      area: 'Nakasero',
      start: fiveHoursAgo,
      lastReport: fourHoursAgo,
      restoredAt: threeHoursAgo,
      confirmed: true,
    };

    const duration = getOutageDurationHours(outage, now);
    const active = isOutageActive(outage, now);

    expect(duration).toBe(2);
    expect(active).toBe(false);
  });

  it('outage still active, 3 h old -> about 3 h', () => {
    const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
    const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString();

    const outage = {
      area: 'Makerere',
      start: threeHoursAgo,
      lastReport: oneHourAgo,
      confirmed: true,
    };

    const duration = getOutageDurationHours(outage, now);
    const active = isOutageActive(outage, now);

    expect(duration).toBeCloseTo(3, 1);
    expect(active).toBe(true);
  });

  it('single unconfirmed device -> not counted in hours', () => {
    const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();

    const unconfirmedOutage = {
      area: 'Kamwokya',
      start: threeHoursAgo,
      lastReport: threeHoursAgo,
      devices: 1,
      confirmed: false,
    };

    expect(isOutageConfirmed(unconfirmedOutage)).toBe(false);
    // Excluded from hours total: returns 0 hours
    expect(getOutageDurationHours(unconfirmedOutage, now)).toBe(0);

    // If raw duration requested, returns actual elapsed time
    expect(getOutageDurationHours(unconfirmedOutage, now, { raw: true })).toBeCloseTo(3, 1);
  });

  it('Dark now count equals Insights currently-dark count for the same data', async () => {
    const store = getStore();
    const dev1 = hashDeviceId('dark-count-test-dev-1');
    const dev2 = hashDeviceId('dark-count-test-dev-2');
    const dev3 = hashDeviceId('dark-count-test-dev-3');

    const cellNtinda = latLngToCell(0.3536, 32.6128);
    const cellKololo = latLngToCell(0.3350, 32.5900);
    const cellGulu = latLngToCell(2.7747, 32.2989);

    // Area 1 (Ntinda): Active outage started 2h ago, last report 30m ago (Confirmed)
    await store.insertReport({
      kind: 'out',
      cell_id: cellNtinda.cell_id,
      cell_lat: cellNtinda.cell_lat,
      cell_lng: cellNtinda.cell_lng,
      loc_precision: 'pin',
      area_name: 'Ntinda',
      device_hash: dev1,
      created_at: new Date(now.getTime() - 2 * 3600 * 1000).toISOString(),
    });
    await store.insertReport({
      kind: 'out',
      cell_id: cellNtinda.cell_id,
      cell_lat: cellNtinda.cell_lat,
      cell_lng: cellNtinda.cell_lng,
      loc_precision: 'pin',
      area_name: 'Ntinda',
      device_hash: dev2,
      created_at: new Date(now.getTime() - 90 * 60 * 1000).toISOString(),
    });
    await store.insertReport({
      kind: 'out',
      cell_id: cellNtinda.cell_id,
      cell_lat: cellNtinda.cell_lat,
      cell_lng: cellNtinda.cell_lng,
      loc_precision: 'pin',
      area_name: 'Ntinda',
      device_hash: dev3,
      created_at: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
    });

    // Area 2 (Kololo): Outage restored 1h ago (NOT currently dark)
    await store.insertReport({
      kind: 'out',
      cell_id: cellKololo.cell_id,
      cell_lat: cellKololo.cell_lat,
      cell_lng: cellKololo.cell_lng,
      loc_precision: 'pin',
      area_name: 'Kololo',
      device_hash: dev1,
      created_at: new Date(now.getTime() - 4 * 3600 * 1000).toISOString(),
    });
    await store.insertReport({
      kind: 'back',
      cell_id: cellKololo.cell_id,
      cell_lat: cellKololo.cell_lat,
      cell_lng: cellKololo.cell_lng,
      loc_precision: 'pin',
      area_name: 'Kololo',
      device_hash: dev1,
      created_at: new Date(now.getTime() - 1 * 3600 * 1000).toISOString(),
    });

    // Area 3 (Gulu): Active outage started 1h ago, last report 15m ago (Confirmed)
    await store.insertReport({
      kind: 'out',
      cell_id: cellGulu.cell_id,
      cell_lat: cellGulu.cell_lat,
      cell_lng: cellGulu.cell_lng,
      loc_precision: 'pin',
      area_name: 'Gulu',
      device_hash: dev1,
      created_at: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
    });
    await store.insertReport({
      kind: 'out',
      cell_id: cellGulu.cell_id,
      cell_lat: cellGulu.cell_lat,
      cell_lng: cellGulu.cell_lng,
      loc_precision: 'pin',
      area_name: 'Gulu',
      device_hash: dev2,
      created_at: new Date(now.getTime() - 45 * 60 * 1000).toISOString(),
    });
    await store.insertReport({
      kind: 'out',
      cell_id: cellGulu.cell_id,
      cell_lat: cellGulu.cell_lat,
      cell_lng: cellGulu.cell_lng,
      loc_precision: 'pin',
      area_name: 'Gulu',
      device_hash: dev3,
      created_at: new Date(now.getTime() - 15 * 60 * 1000).toISOString(),
    });

    // 1. Compute state for the home screen / map
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
    const reports = await store.reportsSince(sevenDaysAgo);
    const blocked = await store.getBlockedDevices();
    const { cells } = computeState(reports, now, blocked);

    // Home screen "Dark now" list: active outages
    const darkNowCells = cells
      .map((c) => ({ ...c, area: nearestArea(c.lat, c.lng) }))
      .filter((c) =>
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

    const homeScreenDarkCount = darkNowCells.length;

    // 2. Compute Insights data
    const insights = await getInsightsData(7, undefined, now);
    const insightsCurrentlyDarkCount = insights.summary.currently_dark;

    // Must be equal and non-zero
    expect(homeScreenDarkCount).toBeGreaterThan(0);
    expect(insightsCurrentlyDarkCount).toBe(homeScreenDarkCount);
  });
});
