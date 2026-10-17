import { OFFLINE_RETRY_MAX_MIN } from './constants';

export interface QueuedReport {
  id: string;
  timestamp: number;
  payload: {
    kind: 'out' | 'back';
    lat: number;
    lng: number;
    loc_precision: 'gps' | 'pin' | 'area';
    area_name?: string;
    device_id: string;
    turnstile_token?: string;
  };
}

const STORAGE_KEY = 'banange_queue';
const MAX_QUEUE_SIZE = 5;

export function getOfflineQueue(): QueuedReport[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function saveOfflineQueue(queue: QueuedReport[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // ignore
  }
}

export function enqueueReport(payload: QueuedReport['payload']): void {
  const current = getOfflineQueue();
  const newItem: QueuedReport = {
    id: `queue-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    payload,
  };

  const updated = [...current, newItem];
  // Keep max 5, drop oldest
  while (updated.length > MAX_QUEUE_SIZE) {
    updated.shift();
  }

  saveOfflineQueue(updated);
}

export async function flushOfflineQueue(
  onSuccess?: (item: QueuedReport) => void
): Promise<void> {
  if (typeof window === 'undefined' || !navigator.onLine) return;

  const current = getOfflineQueue();
  if (current.length === 0) return;

  const now = Date.now();
  const maxAgeMs = OFFLINE_RETRY_MAX_MIN * 60 * 1000;

  // Discard items older than OFFLINE_RETRY_MAX_MIN
  const valid = current.filter((item) => now - item.timestamp <= maxAgeMs);

  const remaining: QueuedReport[] = [];

  for (let i = 0; i < valid.length; i++) {
    const item = valid[i];
    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.payload),
      });

      if (res.ok || res.status === 429 || res.status === 422) {
        // Successfully delivered or rejected cleanly
        if (res.ok && onSuccess) {
          onSuccess(item);
        }
      } else {
        // Server error, keep this and rest
        remaining.push(...valid.slice(i));
        break;
      }
    } catch {
      // Network failure again, stop flushing
      remaining.push(...valid.slice(i));
      break;
    }
  }

  saveOfflineQueue(remaining);
}
