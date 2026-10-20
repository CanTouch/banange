import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { parseUedclAlertsHtmlWithStats, ParsedUedclAlert } from '@/lib/uedcl';

export const dynamic = 'force-dynamic';

const UEDCL_URL = 'https://www.uedcl.co.ug/outage-alerts/';
const USER_AGENT = 'BananageBot/1.0 (+https://banange.kuppelabs.com; banange@kuppelabs.com)';
const FETCH_TIMEOUT_MS = 15000;
const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB

export async function POST(req: NextRequest) {
  // Constant-time compare of Authorization: Bearer <CRON_SECRET>
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[UEDCL Ingest] CRON_SECRET is not configured on server');
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const authHeader = req.headers.get('authorization') || '';
  const expectedAuth = `Bearer ${cronSecret}`;

  const authBuf = Buffer.from(authHeader);
  const expBuf = Buffer.from(expectedAuth);

  if (authBuf.length !== expBuf.length || !timingSafeEqual(authBuf, expBuf)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const contentType = (req.headers.get('content-type') || '').toLowerCase();
  let html = '';
  let source: 'posted' | 'fetched' = 'fetched';

  // Check if raw HTML was posted
  // If request has Content-Type text/html (or starts with text/html), use body
  if (contentType.includes('text/html')) {
    try {
      const rawText = await req.text();
      if (rawText && rawText.trim().length > 0) {
        if (Buffer.byteLength(rawText, 'utf8') > MAX_BODY_BYTES) {
          return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
        }
        if (!rawText.includes('custom-outage-table')) {
          return NextResponse.json({ error: 'unexpected_page' }, { status: 400 });
        }
        html = rawText;
        source = 'posted';
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[UEDCL Ingest] Failed to read request body: ${message}`);
      return NextResponse.json({ error: 'invalid_body', message }, { status: 400 });
    }
  }

  // If no body provided (empty body or not posted HTML), fall back to server-side fetch
  if (!html) {
    source = 'fetched';
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const res = await fetch(UEDCL_URL, {
        method: 'GET',
        headers: {
          'User-Agent': USER_AGENT,
        },
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timeout);

      if (!res.ok) {
        console.error(`[UEDCL Ingest] Fetch failed with status ${res.status}`);
        return NextResponse.json(
          { error: 'uedcl_fetch_failed', status: res.status },
          { status: 502 }
        );
      }

      html = await res.text();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[UEDCL Ingest] Error fetching alerts: ${message}`);
      return NextResponse.json(
        { error: 'uedcl_unavailable', message },
        { status: 502 }
      );
    }
  }

  // Parse HTML
  let parsedAlerts: ParsedUedclAlert[] = [];
  let skippedBadDate = 0;
  try {
    const parseResult = parseUedclAlertsHtmlWithStats(html);
    parsedAlerts = parseResult.alerts;
    skippedBadDate = parseResult.skipped_bad_date;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[UEDCL Ingest] Format parse error: ${message}`);
    return NextResponse.json(
      { error: 'uedcl_parse_failed', message },
      { status: 502 }
    );
  }

  // Safety: If parser finds 0 rows, mark nothing dropped and do not crash
  if (parsedAlerts.length === 0) {
    console.warn('[UEDCL Ingest] 0 alerts parsed from page');
    return NextResponse.json({
      source,
      fetched: 0,
      inserted: 0,
      updated: 0,
      restored: 0,
      dropped: 0,
      unknown_status: 0,
      skipped_bad_date: skippedBadDate,
    });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    console.error('[UEDCL Ingest] Supabase client not configured');
    return NextResponse.json(
      { error: 'database_unavailable' },
      { status: 500 }
    );
  }

  const nowIso = new Date().toISOString();
  let inserted = 0;
  let updated = 0;
  let restored = 0;
  let unknownStatusCount = 0;

  try {
    // 1. Fetch all existing alerts to compare status, first_seen, restored_seen
    const { data: existingRows, error: fetchErr } = await supabase
      .from('official_alerts')
      .select('id, source_key, status, status_raw, first_seen_status, restored_seen_at, restored_time_exact, dropped_at');

    if (fetchErr) {
      console.error('[UEDCL Ingest] Error querying existing alerts:', fetchErr.message);
      return NextResponse.json(
        { error: 'database_error', message: fetchErr.message },
        { status: 502 }
      );
    }

    const existingMap = new Map<string, {
      id: string;
      source_key: string;
      status: string;
      status_raw: string;
      first_seen_status: string | null;
      restored_seen_at: string | null;
      restored_time_exact: boolean;
      dropped_at: string | null;
    }>();

    for (const r of existingRows || []) {
      existingMap.set(r.source_key, r);
    }

    const currentSourceKeys = new Set<string>();

    for (const alert of parsedAlerts) {
      currentSourceKeys.add(alert.source_key);
      if (alert.is_unknown_status) {
        unknownStatusCount++;
      }

      const existing = existingMap.get(alert.source_key);

      if (!existing) {
        // First time seeing this alert
        const isRestored = alert.status === 'restored';
        // If first seen restored: restored_seen_at = null, restored_time_exact = false
        const restoredSeenAt = null;
        const restoredTimeExact = false;

        const { data: insertRes, error: insertErr } = await supabase
          .from('official_alerts')
          .insert({
            source: 'uedcl',
            source_key: alert.source_key,
            published_at: alert.published_at,
            service_area: alert.service_area,
            status_raw: alert.status_raw,
            status: alert.status,
            first_seen_status: alert.status,
            areas_raw: alert.areas_raw,
            areas: alert.areas,
            first_seen_at: nowIso,
            last_seen_at: nowIso,
            restored_seen_at: restoredSeenAt,
            restored_time_exact: restoredTimeExact,
            dropped_at: null,
          })
          .select('id')
          .single();

        if (insertErr) {
          console.error(`[UEDCL Ingest] Failed to insert alert ${alert.source_key}:`, insertErr.message);
          continue;
        }

        inserted++;
        if (isRestored) {
          restored++;
        }

        // Write first event
        if (insertRes?.id) {
          await supabase.from('official_alert_events').insert({
            alert_id: insertRes.id,
            status_raw: alert.status_raw,
            seen_at: nowIso,
          });
        }
      } else {
        // Seen before: check if status changed
        const statusChanged = existing.status_raw !== alert.status_raw;
        // Previously active or partial that later shows restored
        const transitionedToRestored =
          alert.status === 'restored' &&
          (existing.first_seen_status === 'active' || existing.first_seen_status === 'partial' || existing.status === 'active' || existing.status === 'partial') &&
          !existing.restored_seen_at;

        const updates: Record<string, unknown> = {
          last_seen_at: nowIso,
          dropped_at: null, // Still on page, clear dropped_at if previously marked
        };

        if (statusChanged) {
          updates.status = alert.status;
          updates.status_raw = alert.status_raw;
        }
        if (transitionedToRestored) {
          updates.restored_seen_at = nowIso;
          updates.restored_time_exact = true;
        }

        const { error: updateErr } = await supabase
          .from('official_alerts')
          .update(updates)
          .eq('id', existing.id);

        if (updateErr) {
          console.error(`[UEDCL Ingest] Failed to update alert ${alert.source_key}:`, updateErr.message);
          continue;
        }

        // Count only rows whose status actually changed
        if (statusChanged) {
          updated++;
        }
        if (transitionedToRestored) {
          restored++;
        }

        // Record status change event
        if (statusChanged) {
          await supabase.from('official_alert_events').insert({
            alert_id: existing.id,
            status_raw: alert.status_raw,
            seen_at: nowIso,
          });
        }
      }
    }

    // 2. Mark dropped: previously active rows that disappeared from the page
    // (alert was active/partial, has no dropped_at, and is not in currentSourceKeys)
    let dropped = 0;
    const toDrop = Array.from(existingMap.values()).filter(
      (e) =>
        !currentSourceKeys.has(e.source_key) &&
        !e.dropped_at &&
        (e.status === 'active' || e.status === 'partial')
    );

    for (const dropAlert of toDrop) {
      const { error: dropErr } = await supabase
        .from('official_alerts')
        .update({ dropped_at: nowIso })
        .eq('id', dropAlert.id);

      if (!dropErr) {
        dropped++;
      }
    }

    return NextResponse.json({
      source,
      fetched: parsedAlerts.length,
      inserted,
      updated,
      restored,
      dropped,
      unknown_status: unknownStatusCount,
      skipped_bad_date: skippedBadDate,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[UEDCL Ingest] Database processing error: ${message}`);
    return NextResponse.json(
      { error: 'database_error', message },
      { status: 502 }
    );
  }
}
