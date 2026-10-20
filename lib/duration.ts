import { Report } from './store';

export interface OutageInfo {
  area?: string; // Full area name, never truncated
  start: string | number | Date; // First "out" report in that area for the current outage
  lastReport?: string | number | Date; // Last "out" report time
  lastActivity?: string | number | Date; // Alias for lastReport
  end?: string | number | Date | null;
  endedBy?: 'restored' | 'expired' | null;
  restoredAt?: string | number | Date | null; // Report that restored it
  confirmed?: boolean;
  devices?: number;
}

export const OUTAGE_EXPIRY_HOURS = 6;
export const OUTAGE_EXPIRY_MS = OUTAGE_EXPIRY_HOURS * 60 * 60 * 1000;

/**
 * Checks whether an outage is confirmed.
 * Outages with only one device and no confirmation are "unconfirmed".
 */
export function isOutageConfirmed(outage: OutageInfo): boolean {
  if (outage.confirmed === true) return true;
  if (typeof outage.devices === 'number' && outage.devices > 1) return true;
  if (outage.confirmed === false) return false;
  if (outage.devices === 1 && !outage.confirmed) return false;
  return true;
}

/**
 * Checks whether an outage is still active:
 * not restored and last report within 6 hours.
 */
export function isOutageActive(outage: OutageInfo, now?: Date | number): boolean {
  const nowMs = (now ? new Date(now) : new Date()).getTime();

  let restoredMs = Infinity;
  if (outage.restoredAt) {
    restoredMs = new Date(outage.restoredAt).getTime();
  } else if (outage.endedBy === 'restored' && outage.end) {
    restoredMs = new Date(outage.end).getTime();
  } else if (outage.end && outage.endedBy !== 'expired') {
    restoredMs = new Date(outage.end).getTime();
  }

  const isRestored = restoredMs !== Infinity && restoredMs <= nowMs;
  if (isRestored) return false;

  const lastReportMs = new Date(
    outage.lastReport ?? outage.lastActivity ?? outage.start
  ).getTime();

  return (nowMs - lastReportMs) <= OUTAGE_EXPIRY_MS && nowMs >= lastReportMs;
}

/**
 * Calculates an outage's duration in hours for an area.
 * Rules:
 * - Start = the first "out" report in that area for the current outage.
 * - End = the EARLIEST of: (a) the report that restored it ("back" report, or the confirmed restore),
 *   (b) the last "out" report time + 6 hours (the expiry), (c) now.
 * - So an outage nobody closes stops growing 6 hours after its last report. It must never exceed (last report - first report) + 6 h.
 * - Outages with only one device and no confirmation are "unconfirmed". Exclude them from the hours total and from the ranking.
 */
export function getOutageDurationHours(
  outage: OutageInfo,
  now?: Date | number,
  options?: { raw?: boolean }
): number {
  const nowMs = (now ? new Date(now) : new Date()).getTime();
  const startMs = new Date(outage.start).getTime();
  const lastReportMs = new Date(
    outage.lastReport ?? outage.lastActivity ?? outage.start
  ).getTime();

  let restoredMs = Infinity;
  if (outage.restoredAt) {
    restoredMs = new Date(outage.restoredAt).getTime();
  } else if (outage.endedBy === 'restored' && outage.end) {
    restoredMs = new Date(outage.end).getTime();
  } else if (outage.end && outage.endedBy !== 'expired') {
    restoredMs = new Date(outage.end).getTime();
  }

  const expiryMs = lastReportMs + OUTAGE_EXPIRY_MS;
  const endMs = Math.min(restoredMs, expiryMs, nowMs);

  const rawDurationHours = Math.max(0, (endMs - startMs) / (1000 * 60 * 60));

  const isConfirmed = isOutageConfirmed(outage);
  if (!isConfirmed && !options?.raw) {
    return 0;
  }

  return Math.round(rawDurationHours * 10) / 10;
}

export const getOutageDuration = getOutageDurationHours;
export const calculateOutageDuration = getOutageDurationHours;

/**
 * Counts active outages from a list of outage objects using isOutageActive.
 */
export function getCurrentlyDarkCount(outages: OutageInfo[], now?: Date | number): number {
  return outages.filter((o) => isOutageActive(o, now)).length;
}

/**
 * Calculates outage duration for an area directly from raw report records.
 */
export function getAreaOutageDuration(
  reports: Report[],
  areaName?: string,
  now?: Date | number
): number {
  if (!reports || reports.length === 0) return 0;
  const areaReports = areaName
    ? reports.filter((r) => r.area_name?.toLowerCase() === areaName.toLowerCase())
    : reports;
  if (areaReports.length === 0) return 0;

  const sorted = [...areaReports].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const outReports = sorted.filter((r) => r.kind === 'out');
  if (outReports.length === 0) return 0;

  const firstOut = outReports[0];
  const lastOut = outReports[outReports.length - 1];
  const backReport = sorted.find(
    (r) =>
      r.kind === 'back' &&
      new Date(r.created_at).getTime() >= new Date(firstOut.created_at).getTime()
  );

  const devices = new Set(outReports.map((r) => r.device_hash)).size;
  const confirmed = devices >= 3;

  return getOutageDurationHours(
    {
      area: areaName || firstOut.area_name || 'Uganda',
      start: firstOut.created_at,
      lastReport: lastOut.created_at,
      restoredAt: backReport ? backReport.created_at : undefined,
      devices,
      confirmed,
    },
    now
  );
}
