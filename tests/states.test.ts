import { describe, it, expect } from 'vitest';
import { computeState } from '../lib/states';
import { Report } from '../lib/store';
import { latLngToCell, neighbours } from '../lib/cells';

describe('states machine logic', () => {
  const baseTime = new Date('2026-10-17T12:00:00Z');
  const baseCell = latLngToCell(0.35, 32.60);

  function createReport(overrides: Partial<Report>): Report {
    return {
      id: crypto.randomUUID(),
      created_at: baseTime.toISOString(),
      kind: 'out',
      cell_id: baseCell.cell_id,
      cell_lat: baseCell.cell_lat,
      cell_lng: baseCell.cell_lng,
      loc_precision: 'gps',
      area_name: 'Ntinda',
      device_hash: 'device-1',
      flagged: false,
      ...overrides,
    };
  }

  it('1. out, then nothing for 7 h -> expired, no open cell', () => {
    const report = createReport({
      created_at: new Date(baseTime.getTime() - 7.5 * 3600 * 1000).toISOString(),
      kind: 'out',
      device_hash: 'd1',
    });

    const { cells, episodes } = computeState([report], baseTime, new Set());
    expect(cells.length).toBe(0); // No open cell, and expired is not restored
    expect(episodes.length).toBe(1);
    expect(episodes[0].endedBy).toBe('expired');
  });

  it('2. out then back (1 device each) -> restored, cell shows state:restored with fade', () => {
    const outTime = new Date(baseTime.getTime() - 1 * 3600 * 1000); // 1h ago
    const backTime = new Date(baseTime.getTime() - 0.5 * 3600 * 1000); // 30m ago

    const repOut = createReport({
      created_at: outTime.toISOString(),
      kind: 'out',
      device_hash: 'd1',
    });
    const repBack = createReport({
      created_at: backTime.toISOString(),
      kind: 'back',
      device_hash: 'd1',
    });

    const { cells, episodes } = computeState([repOut, repBack], baseTime, new Set());
    expect(cells.length).toBe(1);
    expect(cells[0].state).toBe('restored');
    expect(cells[0].restored_at).toBe(backTime.toISOString());
    expect(cells[0].fade).toBeDefined();
    expect(cells[0].fade).toBeGreaterThan(0);
    expect(cells[0].fade).toBeLessThan(1);
    expect(episodes.length).toBe(1);
    expect(episodes[0].endedBy).toBe('restored');
  });

  it('3. 3 distinct devices out in the neighbourhood within 30 min -> confirmed; 1 back keeps it out; 2 backs restore it', () => {
    const t0 = new Date(baseTime.getTime() - 40 * 60 * 1000);
    const t1 = new Date(baseTime.getTime() - 35 * 60 * 1000);
    const t2 = new Date(baseTime.getTime() - 20 * 60 * 1000);

    const neighs = neighbours(baseCell.cell_id);
    const rep1 = createReport({
      created_at: t0.toISOString(),
      kind: 'out',
      cell_id: baseCell.cell_id,
      device_hash: 'dev-A',
    });
    const rep2 = createReport({
      created_at: t1.toISOString(),
      kind: 'out',
      cell_id: neighs[1],
      device_hash: 'dev-B',
    });
    const rep3 = createReport({
      created_at: t2.toISOString(),
      kind: 'out',
      cell_id: baseCell.cell_id,
      device_hash: 'dev-C',
    });

    // Check confirmed
    const state1 = computeState([rep1, rep2, rep3], baseTime, new Set());
    const baseOutCell = state1.cells.find((c) => c.cell_id === baseCell.cell_id);
    expect(baseOutCell).toBeDefined();
    expect(baseOutCell?.confirmed).toBe(true);

    // 1 back from dev-A -> keeps it out because confirmed requires 2 backs
    const t3 = new Date(baseTime.getTime() - 15 * 60 * 1000);
    const back1 = createReport({
      created_at: t3.toISOString(),
      kind: 'back',
      cell_id: baseCell.cell_id,
      device_hash: 'dev-A',
    });

    const state2 = computeState([rep1, rep2, rep3, back1], baseTime, new Set());
    const baseCellStillOut = state2.cells.find((c) => c.cell_id === baseCell.cell_id);
    expect(baseCellStillOut?.state).toBe('out');

    // 2nd back from dev-C -> restores it
    const t4 = new Date(baseTime.getTime() - 10 * 60 * 1000);
    const back2 = createReport({
      created_at: t4.toISOString(),
      kind: 'back',
      cell_id: baseCell.cell_id,
      device_hash: 'dev-C',
    });

    const state3 = computeState([rep1, rep2, rep3, back1, back2], baseTime, new Set());
    const baseCellRestored = state3.cells.find((c) => c.cell_id === baseCell.cell_id);
    expect(baseCellRestored?.state).toBe('restored');
  });

  it('4. out, back, out again -> a new episode', () => {
    const t1 = new Date(baseTime.getTime() - 2 * 3600 * 1000).toISOString();
    const t2 = new Date(baseTime.getTime() - 1.5 * 3600 * 1000).toISOString();
    const t3 = new Date(baseTime.getTime() - 30 * 60 * 1000).toISOString();

    const rep1 = createReport({ created_at: t1, kind: 'out', device_hash: 'd1' });
    const rep2 = createReport({ created_at: t2, kind: 'back', device_hash: 'd1' });
    const rep3 = createReport({ created_at: t3, kind: 'out', device_hash: 'd1' });

    const { cells, episodes } = computeState([rep1, rep2, rep3], baseTime, new Set());
    expect(episodes.length).toBe(2);
    expect(cells.length).toBe(1);
    expect(cells[0].state).toBe('out');
    expect(cells[0].since).toBe(t3);
  });

  it('5. back with no out is ignored', () => {
    const repBack = createReport({
      created_at: baseTime.toISOString(),
      kind: 'back',
      device_hash: 'd1',
    });

    const { cells, episodes } = computeState([repBack], baseTime, new Set());
    expect(cells.length).toBe(0);
    expect(episodes.length).toBe(0);
  });

  it('6. flagged reports and blocked devices are ignored', () => {
    const repFlagged = createReport({
      created_at: baseTime.toISOString(),
      kind: 'out',
      device_hash: 'd1',
      flagged: true,
    });
    const repBlocked = createReport({
      created_at: baseTime.toISOString(),
      kind: 'out',
      device_hash: 'blocked-device',
      flagged: false,
    });

    const { cells, episodes } = computeState(
      [repFlagged, repBlocked],
      baseTime,
      new Set(['blocked-device'])
    );
    expect(cells.length).toBe(0);
    expect(episodes.length).toBe(0);
  });

  it('7. unconfirmed with 2 devices stays unconfirmed', () => {
    const rep1 = createReport({
      created_at: new Date(baseTime.getTime() - 10 * 60 * 1000).toISOString(),
      kind: 'out',
      device_hash: 'd1',
    });
    const rep2 = createReport({
      created_at: new Date(baseTime.getTime() - 5 * 60 * 1000).toISOString(),
      kind: 'out',
      device_hash: 'd2',
    });

    const { cells } = computeState([rep1, rep2], baseTime, new Set());
    expect(cells.length).toBe(1);
    expect(cells[0].confirmed).toBe(false);
  });

  it('8. fade goes 1 -> 0 across 2 h', () => {
    const outTime = new Date('2026-10-17T10:00:00Z');
    const restoredTime = new Date('2026-10-17T11:00:00Z');

    const repOut = createReport({
      created_at: outTime.toISOString(),
      kind: 'out',
      device_hash: 'd1',
    });
    const repBack = createReport({
      created_at: restoredTime.toISOString(),
      kind: 'back',
      device_hash: 'd1',
    });

    // At t = 11:00:00 (0 min after restore) -> fade ~ 1
    const res0 = computeState([repOut, repBack], new Date('2026-10-17T11:00:00Z'), new Set());
    expect(res0.cells[0].fade).toBeCloseTo(1, 1);

    // At t = 12:00:00 (1h after restore) -> fade ~ 0.5
    const res1 = computeState([repOut, repBack], new Date('2026-10-17T12:00:00Z'), new Set());
    expect(res1.cells[0].fade).toBeCloseTo(0.5, 1);

    // At t = 13:00:00 (2h after restore) -> fade ~ 0
    const res2 = computeState([repOut, repBack], new Date('2026-10-17T13:00:00Z'), new Set());
    expect(res2.cells[0].fade).toBeCloseTo(0, 1);

    // After 2h -> not returned in cells
    const res3 = computeState([repOut, repBack], new Date('2026-10-17T13:05:00Z'), new Set());
    expect(res3.cells.length).toBe(0);
  });

  describe('Rural confirmation outside Kampala', () => {
    // Karenga coordinates: ~ (3.71, 33.77), (3.65, 33.80), (3.75, 33.72)
    const karengaCell1 = latLngToCell(3.71, 33.77);
    const karengaCell2 = latLngToCell(3.65, 33.80);
    const karengaCell3 = latLngToCell(3.75, 33.72);

    it('single device in Karenga stays unconfirmed (lighter dot)', () => {
      const rep = createReport({
        cell_id: karengaCell1.cell_id,
        cell_lat: karengaCell1.cell_lat,
        cell_lng: karengaCell1.cell_lng,
        area_name: 'Karenga district',
        device_hash: 'kar-dev-1',
        created_at: baseTime.toISOString(),
      });

      const { cells } = computeState([rep], baseTime, new Set());
      expect(cells.length).toBe(1);
      expect(cells[0].confirmed).toBe(false);
      expect(cells[0].reporters).toBe(1);
    });

    it('3 different devices in different grid cells in Karenga district within 30 min confirm the outage', () => {
      const t0 = new Date(baseTime.getTime() - 20 * 60 * 1000);
      const t1 = new Date(baseTime.getTime() - 15 * 60 * 1000);
      const t2 = new Date(baseTime.getTime() - 5 * 60 * 1000);

      const rep1 = createReport({
        cell_id: karengaCell1.cell_id,
        cell_lat: karengaCell1.cell_lat,
        cell_lng: karengaCell1.cell_lng,
        area_name: 'Karenga district',
        device_hash: 'kar-dev-1',
        created_at: t0.toISOString(),
      });

      const rep2 = createReport({
        cell_id: karengaCell2.cell_id,
        cell_lat: karengaCell2.cell_lat,
        cell_lng: karengaCell2.cell_lng,
        area_name: 'Karenga district',
        device_hash: 'kar-dev-2',
        created_at: t1.toISOString(),
      });

      // Initially only 2 devices -> both unconfirmed
      const stateBefore = computeState([rep1, rep2], t1, new Set());
      expect(stateBefore.cells.every((c) => !c.confirmed)).toBe(true);

      const rep3 = createReport({
        cell_id: karengaCell3.cell_id,
        cell_lat: karengaCell3.cell_lat,
        cell_lng: karengaCell3.cell_lng,
        area_name: 'Karenga district',
        device_hash: 'kar-dev-3',
        created_at: t2.toISOString(),
      });

      // 3rd device arrives -> all cells in Karenga district confirmed!
      const stateAfter = computeState([rep1, rep2, rep3], baseTime, new Set());
      expect(stateAfter.cells.length).toBe(3);
      expect(stateAfter.cells.every((c) => c.confirmed)).toBe(true);
    });

    it('3 reports from the same device in Karenga do NOT confirm (requires 3 distinct devices)', () => {
      const rep1 = createReport({
        cell_id: karengaCell1.cell_id,
        device_hash: 'same-dev',
        created_at: new Date(baseTime.getTime() - 20 * 60 * 1000).toISOString(),
      });
      const rep2 = createReport({
        cell_id: karengaCell2.cell_id,
        device_hash: 'same-dev',
        created_at: new Date(baseTime.getTime() - 15 * 60 * 1000).toISOString(),
      });
      const rep3 = createReport({
        cell_id: karengaCell3.cell_id,
        device_hash: 'same-dev',
        created_at: new Date(baseTime.getTime() - 5 * 60 * 1000).toISOString(),
      });

      const state = computeState([rep1, rep2, rep3], baseTime, new Set());
      expect(state.cells.every((c) => !c.confirmed)).toBe(true);
    });
  });
});
