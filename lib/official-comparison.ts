import { haversineKm } from './cells';
import { getAreas } from './areas';

export interface OfficialAlertRow {
  id: string;
  source: string;
  source_key: string;
  published_at: string;
  service_area: string;
  status_raw: string;
  status: 'active' | 'partial' | 'restored' | 'other';
  first_seen_status: string | null;
  areas_raw: string;
  areas: string[];
  first_seen_at: string;
  last_seen_at: string;
  restored_seen_at: string | null;
  restored_time_exact: boolean;
  dropped_at: string | null;
}

export interface PlaceRecord {
  osm_id?: number | string;
  name: string;
  normalized_name: string;
  kind?: string;
  district?: string | null;
  lat: number;
  lng: number;
  source?: string;
}

export interface MatchedPlace {
  place_name: string;
  lat: number;
  lng: number;
  district?: string | null;
  match_quality?: 'exact' | 'partial';
  tier?: 1 | 2;
  distance_to_anchor_km?: number | null;
  matched_from_raw?: string;
}

export interface ProcessedAlert {
  alert: OfficialAlertRow;
  is_stale: boolean; // active/partial and >24h old
  age_hours: number;
  duration_hours: number | null; // null if unknown
  duration_type: 'exact' | 'running' | 'unknown';
  matched_places: MatchedPlace[];
  total_areas: number;
}

export interface ComparisonSummary {
  counters: {
    uedcl_notices: number;
    citizen_reports: number;
    in_both: number;
  };
  uedcl_only_areas: Array<{
    area: string;
    service_area: string;
    status_raw: string;
    published_at: string;
  }>;
  citizen_only_areas: Array<{
    area_name: string;
    district: string;
    report_count: number;
    last_report_time: string;
  }>;
  office_durations: Array<{
    service_area: string;
    median_hours: number | null;
    sample_size: number;
  }>;
  footer: {
    matched_count: number;
    total_places: number;
    stale_notices: Array<{
      service_area: string;
      status_raw: string;
      published_at: string;
      age_hours: number;
      areas_raw: string;
    }>;
  };
}

/**
 * Company detection regex:
 * Names that look like companies (Ltd, Industries, Corporation, Factory, School, Hospital, University) stay unplaced.
 */
const COMPANY_REGEX =
  /\b(?:ltd|limited|industries|corporation|factory|factories|school|schools|hospital|hospitals|university|universities)\b/i;

export function isCompanyName(name: string): boolean {
  return COMPANY_REGEX.test(name);
}

/**
 * Normalizes an area name token for matching according to strict requirements:
 * - lowercase
 * - strip "parts of"
 * - strip punctuation
 * - strip trailing words: tc, town council, town, trading centre, rd, road, ltd
 */
export function normalizePlaceName(name: string): string {
  if (!name) return '';
  let s = name.toLowerCase().trim();
  // Strip "parts of"
  s = s.replace(/^parts?\s+of\s+/i, '');
  // Strip periods first so abbreviations like "t.c." or "rd." become "tc" or "rd"
  s = s.replace(/\./g, '');
  // Strip other punctuation (replace with space to preserve word boundaries like Luwero-Kiwoko)
  s = s.replace(/[\/,\-_;:!?()"'’]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  // Strip trailing descriptor words: tc, town council, town, trading centre, trading center, rd, road, ltd, hill, estate, quarters, substation, village, market
  const trailingRegex =
    /(?:\s+|^)(?:tc|town\s+council|town|trading\s+cent(?:re|er)|rd|road|ltd|hill|estate|quarters|substation|village|market)$/i;
  while (trailingRegex.test(s)) {
    s = s.replace(trailingRegex, '').trim();
  }
  return s;
}

// Preserve backward-compatible alias for existing imports
export const normalizeAreaForMatch = normalizePlaceName;

let cachedPlacesLookup: Map<string, PlaceRecord[]> | null = null;

/**
 * Loads places lookup map indexed by normalized_name.
 * If places array is supplied, uses it directly.
 * Otherwise loads from local data/places.osm.json cache or fallbacks.
 */
export function loadOsmPlacesLookup(places?: PlaceRecord[]): Map<string, PlaceRecord[]> {
  if (places && places.length > 0) {
    const map = new Map<string, PlaceRecord[]>();
    for (const p of places) {
      const norm = p.normalized_name || normalizePlaceName(p.name);
      if (!norm) continue;
      const list = map.get(norm) || [];
      list.push(p);
      map.set(norm, list);
    }
    return map;
  }

  if (cachedPlacesLookup) {
    return cachedPlacesLookup;
  }

  const cacheMap = new Map<string, PlaceRecord[]>();

  if (typeof window === 'undefined') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const path = require('path');
      const cachePath = path.resolve(process.cwd(), 'data', 'places.osm.json');
      if (fs.existsSync(cachePath)) {
        const raw = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        for (const p of raw) {
          const norm = p.normalized_name || normalizePlaceName(p.name);
          if (!norm) continue;
          const list = cacheMap.get(norm) || [];
          list.push(p);
          cacheMap.set(norm, list);
        }
      }
    } catch {
      // ignore
    }
  }

  // Fallback if data/places.osm.json was not found
  if (cacheMap.size === 0) {
    const fallbackAreas = getAreas();
    for (const a of fallbackAreas) {
      const norm = normalizePlaceName(a.name);
      if (!norm) continue;
      const list = cacheMap.get(norm) || [];
      list.push({
        name: a.name,
        normalized_name: norm,
        lat: a.lat,
        lng: a.lng,
        district: null,
      });
      cacheMap.set(norm, list);
    }
  }

  cachedPlacesLookup = cacheMap;
  return cachedPlacesLookup;
}

export function buildPlaceLookup(): Map<string, PlaceRecord[]> {
  return loadOsmPlacesLookup();
}

/**
 * Conservative matching for UEDCL areas:
 * - normalize: lowercase, strip "parts of", punctuation, and trailing words tc, town council, town, trading centre, rd, road, ltd.
 * - Tier 1: exact normalized_name match.
 * - Tier 2 (only if tier 1 fails): first word only, if it is at least 5 letters; mark match_quality='partial'.
 * - Ambiguity & anchor: centroid of that notice's unambiguous tier-1 matches.
 * - Several candidates: pick nearest notice anchor, accept only within 40 km. If no anchor, leave unplaced.
 * - Companies stay unplaced.
 */
export function matchNoticeAreas(
  areas: string[],
  placeLookup: Map<string, PlaceRecord[]>
): MatchedPlace[] {
  interface AreaCandidates {
    raw: string;
    normalized: string;
    candidates: PlaceRecord[];
    tier: 1 | 2;
  }

  const areaCandidatesList: (AreaCandidates | null)[] = [];

  for (const rawArea of areas) {
    if (isCompanyName(rawArea)) {
      areaCandidatesList.push(null);
      continue;
    }

    const norm = normalizePlaceName(rawArea);
    if (!norm) {
      areaCandidatesList.push(null);
      continue;
    }

    // Tier 1: exact normalized match
    const tier1 = placeLookup.get(norm) || [];
    if (tier1.length > 0) {
      areaCandidatesList.push({
        raw: rawArea,
        normalized: norm,
        candidates: tier1,
        tier: 1,
      });
      continue;
    }

    // Tier 2: first word only if >= 5 letters
    const firstWord = norm.split(' ')[0];
    if (firstWord && firstWord.length >= 5) {
      const tier2 = placeLookup.get(firstWord) || [];
      if (tier2.length > 0) {
        areaCandidatesList.push({
          raw: rawArea,
          normalized: norm,
          candidates: tier2,
          tier: 2,
        });
        continue;
      }
    }

    areaCandidatesList.push(null);
  }

  // Anchor = centroid of unambiguous tier-1 matches
  const unambiguousTier1: PlaceRecord[] = [];
  for (const item of areaCandidatesList) {
    if (item && item.tier === 1 && item.candidates.length === 1) {
      unambiguousTier1.push(item.candidates[0]);
    }
  }

  let anchor: { lat: number; lng: number } | null = null;
  if (unambiguousTier1.length > 0) {
    // If there are multiple unambiguous matches, filter out extreme outliers (>100 km from median) if any
    const sumLat = unambiguousTier1.reduce((sum, p) => sum + p.lat, 0);
    const sumLng = unambiguousTier1.reduce((sum, p) => sum + p.lng, 0);
    anchor = {
      lat: sumLat / unambiguousTier1.length,
      lng: sumLng / unambiguousTier1.length,
    };
  }

  const matched: MatchedPlace[] = [];
  const seenPlaces = new Set<string>();

  for (const item of areaCandidatesList) {
    if (!item) continue;

    let chosen: PlaceRecord | null = null;
    let distKm: number | null = null;

    if (item.candidates.length === 1) {
      const cand = item.candidates[0];
      if (anchor) {
        distKm = haversineKm({ lat: cand.lat, lng: cand.lng }, anchor);
        if (distKm <= 40) {
          chosen = cand;
        }
      } else {
        // Single candidate with no anchor: if it was the only match, it is unambiguous
        chosen = cand;
      }
    } else if (item.candidates.length > 1) {
      if (anchor) {
        let nearestDist = Infinity;
        let nearestCand: PlaceRecord | null = null;
        for (const cand of item.candidates) {
          const d = haversineKm({ lat: cand.lat, lng: cand.lng }, anchor);
          if (d < nearestDist) {
            nearestDist = d;
            nearestCand = cand;
          }
        }
        if (nearestCand && nearestDist <= 40) {
          chosen = nearestCand;
          distKm = nearestDist;
        }
      }
      // If no anchor, leave unplaced. Never pick arbitrarily.
    }

    if (chosen) {
      const dedupeKey = `${chosen.name}_${chosen.lat.toFixed(4)}_${chosen.lng.toFixed(4)}`;
      if (!seenPlaces.has(dedupeKey)) {
        seenPlaces.add(dedupeKey);
        matched.push({
          place_name: chosen.name,
          lat: chosen.lat,
          lng: chosen.lng,
          district: chosen.district || null,
          match_quality: item.tier === 1 ? 'exact' : 'partial',
          tier: item.tier,
          distance_to_anchor_km: distKm !== null ? Number(distKm.toFixed(2)) : null,
          matched_from_raw: item.raw,
        });
      }
    }
  }

  return matched;
}

// Alias for backward compatibility
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const matchAlertAreasToPlaces: any = matchNoticeAreas;

/**
 * Calculates median of an array of numbers
 */
export function calculateMedian(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Processes official alerts according to the strict duration, stale, and counting rules:
 * - 24-hour window from now (Africa/Kampala)
 * - Stale: active or partial AND published > 24 hours ago. Shown separately as "not updated by UEDCL", never counted above.
 * - Non-stale notices: active or partial and published <= 24 hours ago.
 * - Notice to restored: ONLY alerts with restored_time_exact = true (n >= 5 for office, else not enough data).
 * - Hours rule:
 *     - Restored with restored_time_exact = true: published_at to restored_seen_at
 *     - Active and not stale: published_at to now, shown as "running"
 *     - Excluded / unknown duration: stale notices and notices first seen already restored
 */
export function processOfficialAlerts(
  alerts: OfficialAlertRow[],
  now: Date = new Date(),
  places?: PlaceRecord[]
): {
  processed: ProcessedAlert[];
  total_matched_places: number;
  total_unique_areas_seen: number;
} {
  const placeLookup = loadOsmPlacesLookup(places);
  const nowMs = now.getTime();
  let totalMatched = 0;
  let totalUniqueAreas = 0;

  const processed: ProcessedAlert[] = [];

  for (const alert of alerts) {
    const pubMs = new Date(alert.published_at).getTime();
    const ageHours = Math.max(0, (nowMs - pubMs) / (1000 * 60 * 60));

    // Stale rule: active or partial and published > 24 h ago
    const isStale = (alert.status === 'active' || alert.status === 'partial') && ageHours > 24;

    // Duration rule:
    let durationHours: number | null = null;
    let durationType: 'exact' | 'running' | 'unknown' = 'unknown';

    if (alert.status === 'restored' && alert.restored_time_exact && alert.restored_seen_at) {
      const restMs = new Date(alert.restored_seen_at).getTime();
      durationHours = Math.max(0, (restMs - pubMs) / (1000 * 60 * 60));
      durationType = 'exact';
    } else if (!isStale && (alert.status === 'active' || alert.status === 'partial')) {
      durationHours = ageHours;
      durationType = 'running';
    } else {
      // Excluded: stale notices or first seen already restored
      durationHours = null;
      durationType = 'unknown';
    }

    const matchedPlaces = matchNoticeAreas(alert.areas, placeLookup);
    totalMatched += matchedPlaces.length;
    totalUniqueAreas += alert.areas.length;

    processed.push({
      alert,
      is_stale: isStale,
      age_hours: Number(ageHours.toFixed(1)),
      duration_hours: durationHours !== null ? Number(durationHours.toFixed(2)) : null,
      duration_type: durationType,
      matched_places: matchedPlaces,
      total_areas: alert.areas.length,
    });
  }

  return {
    processed,
    total_matched_places: totalMatched,
    total_unique_areas_seen: totalUniqueAreas,
  };
}
