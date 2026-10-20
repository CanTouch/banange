import { getAreas, AreaRecord } from './areas';
import { haversineKm } from './cells';

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

export interface MatchedPlace {
  place_name: string;
  lat: number;
  lng: number;
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
 * Normalizes an area name token for matching:
 * - lowercase, trims whitespace
 * - strips common suffix descriptors like " tc", " town", " village", " hospital", etc.
 */
export function normalizeAreaForMatch(name: string): string {
  let s = name.toLowerCase().trim();
  // Strip common prefixes
  s = s.replace(/^(?:parts?\s+of\s+)/i, '');
  // Strip trailing descriptors
  s = s.replace(/\s+(?:tc|t\/c|town|village|estate|rd|road|hill|quarters|market|substation)$/i, '');
  return s.trim();
}

/**
 * Builds area name lookup map from all known places
 */
export function buildPlaceLookup(): Map<string, AreaRecord> {
  const allPlaces = getAreas();
  const map = new Map<string, AreaRecord>();
  for (const p of allPlaces) {
    const rawKey = p.name.toLowerCase().trim();
    if (!map.has(rawKey)) map.set(rawKey, p);

    const normKey = normalizeAreaForMatch(p.name);
    if (!map.has(normKey)) map.set(normKey, p);
  }
  return map;
}

/**
 * Matches an array of area strings from an alert to known places
 */
export function matchAlertAreasToPlaces(
  areas: string[],
  placeLookup: Map<string, AreaRecord>
): MatchedPlace[] {
  const matched: MatchedPlace[] = [];
  const seenPlaces = new Set<string>();

  for (const a of areas) {
    const rawKey = a.toLowerCase().trim();
    let found = placeLookup.get(rawKey);
    if (!found) {
      const normKey = normalizeAreaForMatch(a);
      found = placeLookup.get(normKey);
    }

    if (found) {
      const dedupeKey = `${found.name}_${found.lat}_${found.lng}`;
      if (!seenPlaces.has(dedupeKey)) {
        seenPlaces.add(dedupeKey);
        matched.push({
          place_name: found.name,
          lat: found.lat,
          lng: found.lng,
        });
      }
    }
  }

  return matched;
}

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
  now: Date = new Date()
): {
  processed: ProcessedAlert[];
  total_matched_places: number;
  total_unique_areas_seen: number;
} {
  const placeLookup = buildPlaceLookup();
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

    const matchedPlaces = matchAlertAreasToPlaces(alert.areas, placeLookup);
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
