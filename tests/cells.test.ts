import { describe, it, expect } from 'vitest';
import { latLngToCell, neighbours, parseCell, haversineKm } from '../lib/cells';

describe('cells logic', () => {
  it('same point -> same cell', () => {
    const lat = 0.3476;
    const lng = 32.5825;
    const c1 = latLngToCell(lat, lng);
    const c2 = latLngToCell(lat, lng);
    expect(c1.cell_id).toBe(c2.cell_id);
    expect(c1.cell_lat).toBe(c2.cell_lat);
    expect(c1.cell_lng).toBe(c2.cell_lng);
  });

  it('two points 100 m apart share a cell', () => {
    // 1 deg lat is ~111km, 100m is ~0.0009 degrees
    // Centered around 0.35, 32.60
    const lat1 = 0.3500;
    const lng1 = 32.6000;
    const lat2 = 0.3505; // ~55m apart
    const lng2 = 32.6004; // ~45m apart
    const distKm = haversineKm({ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 });
    expect(distKm).toBeLessThan(0.15); // ~100m
    const c1 = latLngToCell(lat1, lng1);
    const c2 = latLngToCell(lat2, lng2);
    expect(c1.cell_id).toBe(c2.cell_id);
  });

  it('neighbours returns 9 ids', () => {
    const cell = latLngToCell(0.35, 32.60);
    const n = neighbours(cell.cell_id);
    expect(n.length).toBe(9);
    expect(new Set(n).size).toBe(9);
    expect(n).toContain(cell.cell_id);
    const { ix, iy } = parseCell(cell.cell_id);
    expect(n).toContain(`${ix - 1}_${iy - 1}`);
    expect(n).toContain(`${ix + 1}_${iy + 1}`);
  });

  it('saved coordinates have at most 3 decimals', () => {
    const testCases = [
      { lat: 0.123456, lng: 32.987654 },
      { lat: -1.234567, lng: 30.111111 },
      { lat: 2.7747, lng: 32.2990 },
    ];
    for (const tc of testCases) {
      const cell = latLngToCell(tc.lat, tc.lng);
      const latDecimals = cell.cell_lat.toString().split('.')[1] || '';
      const lngDecimals = cell.cell_lng.toString().split('.')[1] || '';
      expect(latDecimals.length).toBeLessThanOrEqual(3);
      expect(lngDecimals.length).toBeLessThanOrEqual(3);
    }
  });
});
