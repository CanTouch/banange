import { createHash } from 'crypto';

export type UedclAlertStatus = 'active' | 'partial' | 'restored' | 'other';

export interface ParsedUedclAlert {
  source_key: string;
  published_at: string; // ISO 8601 string with Africa/Kampala offset (+03:00)
  service_area: string;
  status_raw: string;
  status: UedclAlertStatus;
  is_unknown_status: boolean;
  areas_raw: string;
  areas: string[];
}

export interface ParseUedclResult {
  alerts: ParsedUedclAlert[];
  skipped_bad_date: number;
}

/**
 * Maps raw UEDCL status text to normalized status enum:
 * - "Ongoing" -> active
 * - containing "partly" -> partial (e.g. "Feeder Partly In")
 * - containing "restor" OR "completed" -> restored (keep status_raw exactly)
 * - anything else -> other with status_raw kept exactly; flags unknown_status
 */
export function mapUedclStatus(raw: string): { status: UedclAlertStatus; isUnknown: boolean } {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();

  if (trimmed === 'Ongoing' || lower === 'ongoing') {
    return { status: 'active', isUnknown: false };
  }
  if (lower.includes('partly')) {
    return { status: 'partial', isUnknown: false };
  }
  if (lower.includes('restor') || lower.includes('completed')) {
    return { status: 'restored', isUnknown: false };
  }

  // Not matching known expected status keywords
  return { status: 'other', isUnknown: true };
}

/**
 * Cleans individual area token:
 * - strips whitespace
 * - removes leading "Part Of" / "Parts Of" (case-insensitive)
 * - trims trailing commas or periods
 * - does NOT guess or correct spellings, keeps digits attached ("Najjera1")
 */
export function cleanAreaName(name: string): string {
  let cleaned = name.trim();
  // Strip trailing periods or commas
  cleaned = cleaned.replace(/^[,\.\s]+|[,\.\s]+$/g, '');
  // Strip leading "Part Of " or "Parts Of "
  cleaned = cleaned.replace(/^(?:parts?\s+of\s+)/i, '');
  // Final trim
  return cleaned.trim();
}

/**
 * Parses raw areas string into cleaned area names:
 * - Handles space before comma ("Nankuwadde Tc ,Nankuwadde Mpawo")
 * - Handles no space after comma
 * - Handles trailing commas
 * - Drops empty segments
 */
export function parseAreaNames(raw: string): string[] {
  if (!raw) return [];
  const parts = raw.split(',');
  const cleaned: string[] = [];

  for (const part of parts) {
    const item = cleanAreaName(part);
    if (item.length > 0) {
      cleaned.push(item);
    }
  }

  return cleaned;
}

/**
 * Normalizes areas text for deterministic sha1 hashing:
 * - Splits by comma
 * - Cleans each area token and lowercases it
 * - Filters empty tokens
 * - Joins with comma
 */
export function normalizeAreasText(raw: string): string {
  return parseAreaNames(raw)
    .map((s) => s.toLowerCase())
    .join(',');
}

/**
 * Parses a date string like "2026-10-20 08:53" as Africa/Kampala time (UTC+3)
 * and returns standard ISO 8601 string.
 * Must NOT fall back to now. Returns null if invalid or cannot be parsed.
 */
export function parseKampalaDateToIso(dateStr: string): string | null {
  const trimmed = dateStr.trim();
  // Matches "YYYY-MM-DD HH:mm" or "YYYY-MM-DD HH:mm:ss"
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2}(?::\d{2})?)/);
  if (!match) {
    return null;
  }

  const [, datePart, timePart] = match;
  // Validate basic date sanity
  const timeWithSec = timePart.length === 5 ? `${timePart}:00` : timePart;
  const isoCandidate = `${datePart}T${timeWithSec}+03:00`;
  const timestamp = Date.parse(isoCandidate);
  if (isNaN(timestamp)) {
    return null;
  }

  return isoCandidate;
}

/**
 * Generates deterministic source_key:
 * sha1(published_at + service_area + normalized areas text)
 */
export function computeUedclSourceKey(
  publishedAtIso: string,
  serviceArea: string,
  normalizedAreas: string
): string {
  return createHash('sha1')
    .update(`${publishedAtIso}|${serviceArea.trim().toUpperCase()}|${normalizedAreas}`)
    .digest('hex');
}

/**
 * Parses UEDCL outage alerts HTML table.
 * Returns parsed alerts and count of rows skipped due to unparseable dates.
 */
export function parseUedclAlertsHtmlWithStats(html: string): ParseUedclResult {
  const alerts: ParsedUedclAlert[] = [];
  let skipped_bad_date = 0;
  if (!html) return { alerts, skipped_bad_date };

  const rowMatches = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
  if (!rowMatches) return { alerts, skipped_bad_date };

  for (const rowHtml of rowMatches) {
    // If it's a header row with <th>, skip
    if (/<th\b/i.test(rowHtml)) {
      continue;
    }

    // Extract all <td>...</td>
    const cellMatches = Array.from(rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi));
    if (cellMatches.length < 4) {
      continue;
    }

    const rawCol = (match: RegExpMatchArray) => {
      return match[1]
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]+>/g, '') // strip remaining tags
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&#39;/gi, "'")
        .replace(/&quot;/gi, '"')
        .trim();
    };

    const dateCol = rawCol(cellMatches[0]);
    const districtCol = rawCol(cellMatches[1]);
    const statusCol = rawCol(cellMatches[2]);
    const areasCol = rawCol(cellMatches[3]);

    if (!dateCol || !districtCol) {
      continue;
    }

    const publishedAtIso = parseKampalaDateToIso(dateCol);
    if (!publishedAtIso) {
      console.warn(`[UEDCL Parser] Skipping row with invalid date: "${dateCol}"`);
      skipped_bad_date++;
      continue;
    }

    const serviceArea = districtCol.trim();
    const { status, isUnknown } = mapUedclStatus(statusCol);
    const areas = parseAreaNames(areasCol);
    const normalizedAreas = normalizeAreasText(areasCol);
    const sourceKey = computeUedclSourceKey(publishedAtIso, serviceArea, normalizedAreas);

    alerts.push({
      source_key: sourceKey,
      published_at: publishedAtIso,
      service_area: serviceArea,
      status_raw: statusCol,
      status,
      is_unknown_status: isUnknown,
      areas_raw: areasCol,
      areas,
    });
  }

  return { alerts, skipped_bad_date };
}

/**
 * Backward-compatible helper returning just parsed alerts array
 */
export function parseUedclAlertsHtml(html: string): ParsedUedclAlert[] {
  return parseUedclAlertsHtmlWithStats(html).alerts;
}
