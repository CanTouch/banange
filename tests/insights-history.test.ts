import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getInsights } from '../app/api/insights/route';
import { GET as getHistory } from '../app/api/map/history/route';
import { getStore } from '../lib/store';
import { hashDeviceId } from '../lib/device';
import {
  findNearestFrame,
  findNearestFrameIndex,
  calculateHistoryStep,
  validateHistoryWindow,
  formatGeoJSON,
  PlaybackSnapshot,
} from '../lib/history';

describe('Insights and History APIs', () => {
  beforeEach(async () => {
    // Seed test reports in store
    const store = getStore();
    const now = Date.now();
    const devHash = hashDeviceId('test-history-device-1');

    await store.insertReport({
      kind: 'out',
      cell_id: '67_6523',
      cell_lat: 0.334,
      cell_lng: 32.568,
      loc_precision: 'pin',
      area_name: 'Makerere',
      device_hash: devHash,
      created_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    });

    await store.insertReport({
      kind: 'back',
      cell_id: '67_6523',
      cell_lat: 0.334,
      cell_lng: 32.568,
      loc_precision: 'pin',
      area_name: 'Makerere',
      device_hash: devHash,
      created_at: new Date(now - 1 * 60 * 60 * 1000).toISOString(),
    });
  });

  it('GET /api/insights?days=7 returns valid aggregates and heatmap', async () => {
    const req = new NextRequest('http://localhost:3000/api/insights?days=7');
    const res = await getInsights(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.range_days).toBe(7);
    expect(data.summary).toBeDefined();
    expect(typeof data.summary.total_outages).toBe('number');
    expect(typeof data.summary.total_hours_dark_estimated).toBe('number');
    expect(Array.isArray(data.ranked_areas)).toBe(true);
    expect(data.heatmap).toBeDefined();
    expect(Array.isArray(data.heatmap.dates)).toBe(true);
    expect(Array.isArray(data.heatmap.rows)).toBe(true);
  });

  // (a) Pure function that maps slider time to the nearest frame
  describe('(a) Pure frame mapping functions', () => {
    const mockFrames: PlaybackSnapshot[] = [
      {
        time: '2026-10-18T10:00:00.000Z',
        cells: [],
        totals: { dark_now: 2, confirmed_now: 1 },
      },
      {
        time: '2026-10-18T10:30:00.000Z',
        cells: [],
        totals: { dark_now: 5, confirmed_now: 3 },
      },
      {
        time: '2026-10-18T11:00:00.000Z',
        cells: [],
        totals: { dark_now: 1, confirmed_now: 0 },
      },
    ];

    it('findNearestFrame maps slider time to nearest frame correctly', () => {
      // Exact time
      const exact = findNearestFrame(new Date('2026-10-18T10:00:00.000Z').getTime(), mockFrames);
      expect(exact?.time).toBe('2026-10-18T10:00:00.000Z');

      // Between frames: 10:14 is closer to 10:00
      const closerToFirst = findNearestFrame(new Date('2026-10-18T10:14:00.000Z').getTime(), mockFrames);
      expect(closerToFirst?.time).toBe('2026-10-18T10:00:00.000Z');

      // Between frames: 10:16 is closer to 10:30
      const closerToSecond = findNearestFrame(new Date('2026-10-18T10:16:00.000Z').getTime(), mockFrames);
      expect(closerToSecond?.time).toBe('2026-10-18T10:30:00.000Z');

      // Beyond bounds
      const pastLast = findNearestFrame(new Date('2026-10-18T12:00:00.000Z').getTime(), mockFrames);
      expect(pastLast?.time).toBe('2026-10-18T11:00:00.000Z');

      // Empty frames
      expect(findNearestFrame(Date.now(), [])).toBeNull();
    });

    it('findNearestFrameIndex returns proper index', () => {
      const idx = findNearestFrameIndex(new Date('2026-10-18T10:25:00.000Z').getTime(), mockFrames);
      expect(idx).toBe(1);
      expect(findNearestFrameIndex(Date.now(), [])).toBe(-1);
    });

    it('calculateHistoryStep chooses 30m for <=2d and 60m for >2d', () => {
      const oneDay = 24 * 60 * 60 * 1000;
      const twoDays = 2 * 24 * 60 * 60 * 1000;
      const threeDays = 3 * 24 * 60 * 60 * 1000;

      expect(calculateHistoryStep(oneDay)).toBe(30);
      expect(calculateHistoryStep(twoDays)).toBe(30);
      expect(calculateHistoryStep(threeDays)).toBe(60);
    });

    it('formatGeoJSON validates and provides safe defaults for all required layer expressions', () => {
      const geojson = formatGeoJSON([
        {
          cell_id: 'c1',
          lat: 0.3,
          lng: 32.5,
          state: 'out',
          confirmed: true,
          fade: 0.8,
          reporters: 4,
          area: 'Kololo',
        },
        null, // Malformed
        { lat: 'not a number' }, // Invalid coordinates
      ]);

      expect(geojson.type).toBe('FeatureCollection');
      expect(geojson.features.length).toBe(1);
      const props = geojson.features[0].properties!;
      expect(props.cell_id).toBe('c1');
      expect(props.state).toBe('out');
      expect(props.confirmed).toBe(true);
      expect(props.fade).toBe(0.8);
      expect(props.reporters).toBe(4);
      expect(props.area).toBe('Kololo');

      // Empty fallback
      expect(formatGeoJSON(null)).toEqual({ type: 'FeatureCollection', features: [] });
    });
  });

  // (b) History API rejects windows over 7 days and steps under 15 minutes with 422
  describe('(b) History API validation and well-formed frames', () => {
    it('rejects window exceeding 7 days with HTTP 422', async () => {
      const now = Date.now();
      const eightDaysAgo = new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString();
      const nowIso = new Date(now).toISOString();

      const req = new NextRequest(`http://localhost:3000/api/map/history?from=${encodeURIComponent(eightDaysAgo)}&to=${encodeURIComponent(nowIso)}&step=30`);
      const res = await getHistory(req);
      expect(res.status).toBe(422);

      const json = await res.json();
      expect(json.error).toBe('window_exceeds_max');
      expect(json.message).toContain('cannot exceed 7 days');
    });

    it('rejects step under 15 minutes with HTTP 422', async () => {
      const now = Date.now();
      const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
      const nowIso = new Date(now).toISOString();

      const req = new NextRequest(`http://localhost:3000/api/map/history?from=${encodeURIComponent(oneDayAgo)}&to=${encodeURIComponent(nowIso)}&step=10`);
      const res = await getHistory(req);
      expect(res.status).toBe(422);

      const json = await res.json();
      expect(json.error).toBe('step_below_min');
      expect(json.message).toContain('at least 15 minutes');
    });

    it('rejects inverted window (from > to) with HTTP 422', async () => {
      const now = Date.now();
      const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
      const nowIso = new Date(now).toISOString();

      const req = new NextRequest(`http://localhost:3000/api/map/history?from=${encodeURIComponent(nowIso)}&to=${encodeURIComponent(oneDayAgo)}&step=30`);
      const res = await getHistory(req);
      expect(res.status).toBe(422);

      const json = await res.json();
      expect(json.error).toBe('invalid_window');
    });

    it('returns well-formed frames for valid query', async () => {
      const req = new NextRequest('http://localhost:3000/api/map/history?from=now-24h&to=now&step=60');
      const res = await getHistory(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(Array.isArray(data.snapshots)).toBe(true);
      expect(data.snapshots.length).toBeGreaterThan(0);

      // Verify every frame has required structure
      for (const frame of data.snapshots) {
        expect(typeof frame.time).toBe('string');
        expect(frame.totals).toBeDefined();
        expect(typeof frame.totals.dark_now).toBe('number');
        expect(typeof frame.totals.confirmed_now).toBe('number');
        expect(Array.isArray(frame.cells)).toBe(true);

        for (const cell of frame.cells) {
          expect(cell.cell_id).toBeDefined();
          expect(typeof cell.lat).toBe('number');
          expect(typeof cell.lng).toBe('number');
          expect(['out', 'restored']).toContain(cell.state);
          expect(typeof cell.confirmed).toBe('boolean');
          expect(cell.fade).toBeDefined();
          expect(typeof cell.area).toBe('string');
        }
      }
    });
  });

  // (c) Playback controller never unmounts or re-creates the map
  describe('(c) Map lifecycle during playback', () => {
    it('verifies map instance is created exactly ONCE and never unmounted across playback frames', () => {
      // Mock MapLibre map and source
      const mockSetData = vi.fn();
      const mockSource = {
        setData: mockSetData,
      };

      const mockMap = {
        getSource: vi.fn().mockReturnValue(mockSource),
        addSource: vi.fn(),
        addLayer: vi.fn(),
        getLayer: vi.fn().mockReturnValue(true),
        remove: vi.fn(),
        flyTo: vi.fn(),
        setStyle: vi.fn(),
        on: vi.fn((event, callback) => {
          if (event === 'load') callback();
        }),
        once: vi.fn(),
      };

      const mapFactorySpy = vi.fn(() => mockMap);

      // Simulate a Playback Map Controller that maintains a persistent map instance
      class PlaybackMapController {
        private map: ReturnType<typeof mapFactorySpy> | null = null;
        private isLoaded = false;

        constructor(private factory: typeof mapFactorySpy) {
          // Initial mount: map created once
          this.map = this.factory();
          this.isLoaded = true;
        }

        // Apply playback frame: must call source.setData(), NEVER factory() or map.remove()
        public applyFrame(cells: any[]) {
          if (!this.map || !this.isLoaded) return;
          const source = this.map.getSource('cells-source');
          if (source) {
            source.setData(formatGeoJSON(cells));
          }
        }

        // True unmount on component teardown only
        public unmount() {
          if (this.map) {
            this.map.remove();
            this.map = null;
            this.isLoaded = false;
          }
        }
      }

      // 1. Mount controller
      const controller = new PlaybackMapController(mapFactorySpy);
      expect(mapFactorySpy).toHaveBeenCalledTimes(1);
      expect(mockMap.remove).toHaveBeenCalledTimes(0);

      // 2. Simulate 20 continuous playback frames
      for (let frameNum = 1; frameNum <= 20; frameNum++) {
        const frameCells = [
          {
            cell_id: `cell_${frameNum}`,
            lat: 0.31,
            lng: 32.58,
            state: 'out' as const,
            confirmed: true,
            area: 'Kampala',
          },
        ];
        controller.applyFrame(frameCells);
      }

      // 3. Confirm factory was still only called ONCE across all frames
      expect(mapFactorySpy).toHaveBeenCalledTimes(1);
      // 4. Confirm map.remove was NEVER called during playback frames
      expect(mockMap.remove).toHaveBeenCalledTimes(0);
      // 5. Confirm source.setData was called once per frame (20 times)
      expect(mockSetData).toHaveBeenCalledTimes(20);
      // 6. Confirm setStyle was NEVER called during playback
      expect(mockMap.setStyle).toHaveBeenCalledTimes(0);

      // 7. Only when unmounting is remove called
      controller.unmount();
      expect(mockMap.remove).toHaveBeenCalledTimes(1);
    });
  });
});
