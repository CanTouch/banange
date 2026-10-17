import { AREA_MATCH_KM } from './constants';
import { haversineKm } from './cells';
import starterAreas from '../data/areas.starter.json';

export interface AreaRecord {
  name: string;
  lat: number;
  lng: number;
  type: 'district' | 'town' | 'place' | string;
  pop: number;
}

let loadedAreas: AreaRecord[] | null = null;

export function getAreas(): AreaRecord[] {
  if (loadedAreas) return loadedAreas;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const generatedAreas = require('../data/areas.json');
    if (Array.isArray(generatedAreas) && generatedAreas.length > 0) {
      loadedAreas = generatedAreas;
      return loadedAreas!;
    }
  } catch {
    // fallback
  }

  loadedAreas = starterAreas as AreaRecord[];
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

  if (minDist <= AREA_MATCH_KM) {
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
