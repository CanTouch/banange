import { haversineKm } from './cells';
import starterAreas from '../data/areas.starter.json';
import customAreas from '../data/areas.custom.json';

export interface AreaRecord {
  name: string;
  lat: number;
  lng: number;
  type: 'district' | 'town' | 'place' | string;
  pop: number;
}

export const GREATER_KAMPALA_BOX = {
  latMin: 0.15,
  latMax: 0.50,
  lngMin: 32.40,
  lngMax: 32.80,
};

export function isInsideGreaterKampala(lat: number, lng: number): boolean {
  return (
    lat >= GREATER_KAMPALA_BOX.latMin &&
    lat <= GREATER_KAMPALA_BOX.latMax &&
    lng >= GREATER_KAMPALA_BOX.lngMin &&
    lng <= GREATER_KAMPALA_BOX.lngMax
  );
}

let loadedAreas: AreaRecord[] | null = null;

export function getAreas(): AreaRecord[] {
  if (loadedAreas) return loadedAreas;

  let baseList: AreaRecord[] = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const generatedAreas = require('../data/areas.json');
    if (Array.isArray(generatedAreas) && generatedAreas.length > 0) {
      baseList = generatedAreas;
    }
  } catch {
    // fallback
  }

  if (baseList.length === 0) {
    baseList = starterAreas as AreaRecord[];
  }

  // Priority merge: custom areas take priority over GeoNames/starter (deduped by name)
  const merged: AreaRecord[] = [];
  const nameSeen = new Set<string>();

  for (const item of customAreas as AreaRecord[]) {
    const key = item.name.toLowerCase().trim();
    if (!nameSeen.has(key)) {
      nameSeen.add(key);
      merged.push(item);
    }
  }

  for (const item of baseList) {
    const key = item.name.toLowerCase().trim();
    if (!nameSeen.has(key)) {
      nameSeen.add(key);
      merged.push(item);
    }
  }

  loadedAreas = merged;
  return loadedAreas;
}

export function nearestArea(lat: number, lng: number): string {
  const areas = getAreas();
  if (areas.length === 0) return 'Uganda';

  let minDist = Infinity;
  let closestName = areas[0].name;

  for (const a of areas) {
    const dist = haversineKm({ lat, lng }, { lat: a.lat, lng: a.lng });
    if (dist < minDist) {
      minDist = dist;
      closestName = a.name;
    }
  }

  // Inside Greater Kampala box use 1.5 km; outside use 4.0 km
  const inKampala = isInsideGreaterKampala(lat, lng);
  const matchRadius = inKampala ? 1.5 : 4.0;

  if (minDist <= matchRadius) {
    return closestName;
  }
  return `Near ${closestName}`;
}

export function searchAreas(q: string): Array<{ name: string; lat: number; lng: number }> {
  if (!q || !q.trim()) return [];
  const query = q.trim().toLowerCase();
  const areas = getAreas();

  const matched = areas.filter((a) => a.name.toLowerCase().includes(query));

  matched.sort((a, b) => {
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();

    const aExact = aName === query;
    const bExact = bName === query;
    if (aExact !== bExact) return aExact ? -1 : 1;

    const aPrefix = aName.startsWith(query);
    const bPrefix = bName.startsWith(query);
    if (aPrefix !== bPrefix) return aPrefix ? -1 : 1;

    // If both start with the query, prefer shorter names (closer match to the prefix)
    if (aPrefix && bPrefix && aName.length !== bName.length) {
      return aName.length - bName.length;
    }

    // Type priority: district / town before place
    const typeScore = (t: string) => (t === 'district' ? 3 : t === 'town' ? 2 : 1);
    const scoreDiff = typeScore(b.type) - typeScore(a.type);
    if (scoreDiff !== 0 && Math.abs((b.pop || 0) - (a.pop || 0)) < 10000) {
      return scoreDiff;
    }

    if ((b.pop || 0) !== (a.pop || 0)) {
      return (b.pop || 0) - (a.pop || 0);
    }

    return a.name.length - b.name.length;
  });

  return matched.slice(0, 6).map((a) => ({
    name: a.name,
    lat: a.lat,
    lng: a.lng,
  }));
}
