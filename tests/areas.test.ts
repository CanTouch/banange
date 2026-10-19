import { describe, it, expect } from 'vitest';
import { findDistrict, nearestArea, searchAreas } from '../lib/areas';

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

  it('a point in the middle of Lake Victoria resolves safely to Kalangala district or Near ...', () => {
    // Lat -0.8, Lng 33.0 is deep in Lake Victoria
    const lakeArea = nearestArea(-0.8, 33.0);
    expect(lakeArea.endsWith('district') || lakeArea.startsWith('Near ')).toBe(true);
    expect(lakeArea.toLowerCase()).toMatch(/buvuma|kalangala/);
  });

  it('searchAreas("nt") ranks "Ntinda" first', () => {
    const results = searchAreas('nt');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe('Ntinda');
  });

  it('searchAreas("karenga") finds Karenga', () => {
    const results = searchAreas('karenga');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.name.toLowerCase().includes('karenga'))).toBe(true);
  });

  it('a point in Makerere returns "Makerere" or "Kikoni"', () => {
    const area = nearestArea(0.3345, 32.5675);
    expect(['Makerere', 'Makerere Kikoni', 'Kikoni']).toContain(area);
  });

  it('a point in Nakasero returns "Nakasero"', () => {
    const area = nearestArea(0.3225, 32.5815);
    expect(area).toBe('Nakasero');
  });

  // Verify sample points from user request: Karenga (3.71, 33.77), Gulu, Mbarara, Mbale, and Kampala
  describe('Sample points across Uganda', () => {
    it('Karenga (3.71, 33.77) resolves to Karenga district and district is Karenga', () => {
      const district = findDistrict(3.71, 33.77);
      expect(district).toBe('Karenga');
      const area = nearestArea(3.71, 33.77);
      expect(area).toBe('Karenga district');
    });

    it('Gulu (2.7747, 32.2989) resolves to Gulu', () => {
      const district = findDistrict(2.7747, 32.2989);
      expect(district).toBe('Gulu');
      const area = nearestArea(2.7747, 32.2989);
      expect(['Gulu', 'Near Gulu']).toContain(area);
    });

    it('Mbarara (-0.6071, 30.6545) resolves to Mbarara', () => {
      const district = findDistrict(-0.6071, 30.6545);
      expect(district).toBe('Mbarara');
      const area = nearestArea(-0.6071, 30.6545);
      expect(['Mbarara', 'Near Mbarara']).toContain(area);
    });

    it('Mbale (1.0784, 34.1810) resolves to Mbale', () => {
      const district = findDistrict(1.0784, 34.1810);
      expect(district).toBe('Mbale');
      const area = nearestArea(1.0784, 34.1810);
      expect(['Mbale', 'Near Mbale']).toContain(area);
    });

    it('Kampala (0.3476, 32.5825) resolves to Kampala and neighbourhood', () => {
      const district = findDistrict(0.3476, 32.5825);
      expect(district).toBe('Kampala');
      const area = nearestArea(0.3476, 32.5825);
      expect(['Kampala Central', 'Kamwokya', 'Nakasero', 'Wandegeya', 'Kololo']).toContain(area);
    });
  });
});
