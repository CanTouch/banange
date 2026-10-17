import { describe, it, expect } from 'vitest';
import { nearestArea, searchAreas } from '../lib/areas';

describe('areas logic', () => {
  it('nearestArea(0.3536, 32.6128) is "Ntinda"', () => {
    const area = nearestArea(0.3536, 32.6128);
    expect(area).toBe('Ntinda');
  });

  it('a point in the far north returns a northern town (Gulu/Kitgum/Arua area), not a Kampala name', () => {
    // 2.7747, 32.2990 is Gulu, 3.28, 32.88 is Kitgum
    const northArea = nearestArea(2.775, 32.299);
    expect(['Gulu', 'Near Gulu']).toContain(northArea);
    expect(northArea).not.toContain('Kampala');
    expect(northArea).not.toContain('Ntinda');
  });

  it('a point in the middle of Lake Victoria returns "Near ..."', () => {
    // Lat -0.8, Lng 33.0 is deep in Lake Victoria
    const lakeArea = nearestArea(-0.8, 33.0);
    expect(lakeArea.startsWith('Near ')).toBe(true);
  });

  it('searchAreas("nt") ranks "Ntinda" first', () => {
    const results = searchAreas('nt');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe('Ntinda');
  });
});
