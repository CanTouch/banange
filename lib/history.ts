import { CellOut } from '@/lib/states';

export interface PlaybackSnapshot {
  time: string;
  cells: Array<CellOut & { area?: string }>;
  totals: { dark_now: number; confirmed_now: number };
}

/**
 * 7 days in milliseconds
 */
export const MAX_HISTORY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Minimum step in minutes (15 min)
 */
export const MIN_HISTORY_STEP_MINUTES = 15;

/**
 * Pure function: map slider time (epoch ms) to nearest frame from a frame sequence
 */
export function findNearestFrame<T extends { time: string }>(
  targetTimeMs: number,
  frames: T[]
): T | null {
  if (!Array.isArray(frames) || frames.length === 0) return null;
  let closest = frames[0];
  let minDiff = Math.abs(new Date(closest.time).getTime() - targetTimeMs);

  for (let i = 1; i < frames.length; i++) {
    const frameTime = new Date(frames[i].time).getTime();
    if (isNaN(frameTime)) continue;
    const diff = Math.abs(frameTime - targetTimeMs);
    if (diff < minDiff) {
      minDiff = diff;
      closest = frames[i];
    }
  }

  return closest;
}

/**
 * Pure function: map slider time to index of nearest frame
 */
export function findNearestFrameIndex<T extends { time: string }>(
  targetTimeMs: number,
  frames: T[]
): number {
  if (!Array.isArray(frames) || frames.length === 0) return -1;
  let closestIdx = 0;
  let minDiff = Math.abs(new Date(frames[0].time).getTime() - targetTimeMs);

  for (let i = 1; i < frames.length; i++) {
    const frameTime = new Date(frames[i].time).getTime();
    if (isNaN(frameTime)) continue;
    const diff = Math.abs(frameTime - targetTimeMs);
    if (diff < minDiff) {
      minDiff = diff;
      closestIdx = i;
    }
  }

  return closestIdx;
}

/**
 * Compute recommended step:
 * Step 30 minutes for windows up to 2 days (48h), 60 minutes for longer windows (max 7 days).
 */
export function calculateHistoryStep(windowMs: number): number {
  const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
  if (windowMs <= TWO_DAYS_MS) {
    return 30;
  }
  return 60;
}

/**
 * Validate history query window and step
 */
export function validateHistoryWindow(
  fromMs: number,
  toMs: number,
  stepMinutes?: number
): { valid: boolean; error?: string; code?: string; status?: number } {
  if (isNaN(fromMs) || isNaN(toMs)) {
    return { valid: false, error: 'Invalid timestamp format', code: 'invalid_timestamp', status: 422 };
  }

  if (fromMs > toMs) {
    return { valid: false, error: 'Start time cannot be after end time', code: 'invalid_window', status: 422 };
  }

  const windowMs = toMs - fromMs;
  if (windowMs > MAX_HISTORY_WINDOW_MS) {
    return {
      valid: false,
      error: 'Requested window cannot exceed 7 days',
      code: 'window_exceeds_max',
      status: 422,
    };
  }

  if (stepMinutes !== undefined && (isNaN(stepMinutes) || stepMinutes < MIN_HISTORY_STEP_MINUTES)) {
    return {
      valid: false,
      error: `Step must be at least ${MIN_HISTORY_STEP_MINUTES} minutes`,
      code: 'step_below_min',
      status: 422,
    };
  }

  return { valid: true };
}

/**
 * Format and strictly validate raw cells into a MapLibre FeatureCollection.
 * Always returns a valid FeatureCollection, never undefined.
 */
export function formatGeoJSON(rawCells: unknown): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const empty: GeoJSON.FeatureCollection<GeoJSON.Point> = {
    type: 'FeatureCollection',
    features: [],
  };

  if (!Array.isArray(rawCells)) return empty;

  const features: GeoJSON.Feature<GeoJSON.Point>[] = [];

  for (const c of rawCells) {
    if (!c || typeof c !== 'object') continue;
    const lat = Number(c.lat);
    const lng = Number(c.lng);
    if (isNaN(lat) || isNaN(lng)) continue;

    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [lng, lat],
      },
      properties: {
        cell_id: String(c.cell_id || ''),
        state: c.state === 'restored' ? 'restored' : 'out',
        confirmed: Boolean(c.confirmed),
        approximate: Boolean(c.approximate),
        since: String(c.since || ''),
        last_activity: String(c.last_activity || ''),
        restored_at: String(c.restored_at || ''),
        fade: typeof c.fade === 'number' && !isNaN(c.fade) ? c.fade : 1,
        reporters: typeof c.reporters === 'number' && !isNaN(c.reporters) ? c.reporters : 1,
        area: String(c.area || ''),
      },
    });
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}
