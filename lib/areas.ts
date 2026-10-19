import { haversineKm } from './cells';
import starterAreas from '../data/areas.starter.json';
import customAreas from '../data/areas.custom.json';
import districtsData from '../data/districts.json';

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

// Ray-casting point in polygon
function pointInPolygon(pt: [number, number], ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect = yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pointInFeature(pt: [number, number], feature: any): boolean {
  const geom = feature.geometry;
  if (geom.type === 'Polygon') {
    if (!pointInPolygon(pt, geom.coordinates[0])) return false;
    for (let i = 1; i < geom.coordinates.length; i++) {
      if (pointInPolygon(pt, geom.coordinates[i])) return false;
    }
    return true;
  } else if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) {
      if (pointInPolygon(pt, poly[0])) {
        let inHole = false;
        for (let i = 1; i < poly.length; i++) {
          if (pointInPolygon(pt, poly[i])) {
            inHole = true;
            break;
          }
        }
        if (!inHole) return true;
      }
    }
  }
  return false;
}

export function findDistrict(lat: number, lng: number): string {
  const pt: [number, number] = [lng, lat];
  for (const f of districtsData.features) {
    const bbox = f.properties.bbox;
    if (bbox && (lng < bbox[0] || lat < bbox[1] || lng > bbox[2] || lat > bbox[3])) {
      continue;
    }
    if (pointInFeature(pt, f)) {
      return f.properties.name;
    }
  }

  // Fallback to nearest district centroid
  let minDist = Infinity;
  let nearest = 'Kampala';
  for (const f of districtsData.features) {
    const dLat = f.properties.lat - lat;
    const dLng = f.properties.lng - lng;
    const dist = dLat * dLat + dLng * dLng;
    if (dist < minDist) {
      minDist = dist;
      nearest = f.properties.name;
    }
  }
  return nearest;
}

export function getAllDistricts(): string[] {
  return districtsData.features.map((f: { properties: { name: string } }) => f.properties.name).sort();
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

  const merged: AreaRecord[] = [];
  const nameSeen = new Set<string>();

  // 1. Custom areas (Kampala neighbourhoods) take highest priority
  for (const item of customAreas as AreaRecord[]) {
    const key = item.name.toLowerCase().trim();
    if (!nameSeen.has(key)) {
      nameSeen.add(key);
      merged.push(item);
    }
  }

  // 2. Base list (towns, places across Uganda)
  for (const item of baseList) {
    const key = item.name.toLowerCase().trim();
    if (!nameSeen.has(key)) {
      nameSeen.add(key);
      merged.push(item);
    }
  }

  // 3. District centers for all 135 districts in Uganda
  for (const f of districtsData.features) {
    const name = f.properties.name;
    const key = name.toLowerCase().trim();
    if (!nameSeen.has(key)) {
      nameSeen.add(key);
      merged.push({
        name,
        lat: f.properties.lat,
        lng: f.properties.lng,
        type: 'district',
        pop: 0,
      });
    }
  }

  loadedAreas = merged;
  return loadedAreas;
}

export function nearestArea(lat: number, lng: number): string {
  try {
    const district = findDistrict(lat, lng);
    const inKampala = district.toLowerCase() === 'kampala' || isInsideGreaterKampala(lat, lng);

    if (inKampala) {
      let minDist = Infinity;
      let closestName = 'Kampala Central';
      const kampalaPlaces = customAreas as AreaRecord[];

      for (const a of kampalaPlaces) {
        const dist = haversineKm({ lat, lng }, { lat: a.lat, lng: a.lng });
        if (dist < minDist) {
          minDist = dist;
          closestName = a.name;
        }
      }

      if (minDist <= 1.5) {
        return closestName;
      }
      if (minDist <= 4.0) {
        return `Near ${closestName}`;
      }
      return 'Kampala';
    }

    // Outside Kampala:
    // Resolve to nearest named town or sub-county if available, otherwise district name
    const areas = getAreas();
    let minDist = Infinity;
    let closestTown: string | null = null;

    for (const a of areas) {
      if (a.type === 'district') continue;
      if (isInsideGreaterKampala(a.lat, a.lng)) continue;

      const dist = haversineKm({ lat, lng }, { lat: a.lat, lng: a.lng });
      if (dist < minDist) {
        minDist = dist;
        closestTown = a.name;
      }
    }

    if (closestTown && minDist <= 2.5) {
      return closestTown;
    }
    if (closestTown && minDist <= 5.0) {
      return `Near ${closestTown}`;
    }

    return `${district} district`;
  } catch {
    return 'Uganda';
  }
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

    if (aPrefix && bPrefix && aName.length !== bName.length) {
      return aName.length - bName.length;
    }

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
