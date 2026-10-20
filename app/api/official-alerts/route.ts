import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { getStore } from '@/lib/store';
import { processOfficialAlerts, OfficialAlertRow, ComparisonSummary, calculateMedian } from '@/lib/official-comparison';
import { haversineKm } from '@/lib/cells';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const format = searchParams.get('format');
  const now = new Date();
  const since24hIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const supabase = getSupabaseServerClient();
  let alerts: OfficialAlertRow[] = [];

  if (supabase) {
    const { data, error } = await supabase
      .from('official_alerts')
      .select('*')
      .order('published_at', { ascending: false });

    if (!error && data) {
      alerts = data as OfficialAlertRow[];
    }
  }

  // Process all alerts for matching and duration rules
  const { processed, total_matched_places, total_unique_areas_seen } = processOfficialAlerts(alerts, now);

  // If CSV requested:
  // CSV columns: published_at, service_area, status_raw, status, areas_raw, matched_count, total_areas, stale, restored_time_exact
  if (format === 'csv') {
    const headers = [
      'published_at',
      'service_area',
      'status_raw',
      'status',
      'areas_raw',
      'matched_count',
      'total_areas',
      'stale',
      'restored_time_exact',
    ];

    const escapeCsv = (val: unknown) => {
      const s = String(val ?? '');
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const rows = processed.map((p) => [
      escapeCsv(p.alert.published_at),
      escapeCsv(p.alert.service_area),
      escapeCsv(p.alert.status_raw),
      escapeCsv(p.alert.status),
      escapeCsv(p.alert.areas_raw),
      escapeCsv(p.matched_places.length),
      escapeCsv(p.total_areas),
      escapeCsv(p.is_stale),
      escapeCsv(p.alert.restored_time_exact),
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="uedcl_notices.csv"',
      },
    });
  }

  // Fetch citizen reports for the last 24h
  const store = getStore();
  const citizenReports = await store.reportsSince(since24hIso);
  const blockedDevices = await store.getBlockedDevices();
  const validReports = citizenReports.filter(
    (r) => !blockedDevices.has(r.device_hash) && !r.flagged && r.kind === 'out'
  );

  // Group citizen reports by area / location
  const citizenAreaMap = new Map<string, {
    area_name: string;
    lat: number;
    lng: number;
    count: number;
    last_time: string;
  }>();

  for (const r of validReports) {
    const name = r.area_name || 'Nearby Area';
    const existing = citizenAreaMap.get(name);
    if (!existing) {
      citizenAreaMap.set(name, {
        area_name: name,
        lat: r.cell_lat,
        lng: r.cell_lng,
        count: 1,
        last_time: r.created_at,
      });
    } else {
      existing.count++;
      if (r.created_at > existing.last_time) {
        existing.last_time = r.created_at;
      }
    }
  }

  // Active or partial, not stale notices in last 24h
  const activeNonStaleAlerts = processed.filter(
    (p) => !p.is_stale && (p.alert.status === 'active' || p.alert.status === 'partial')
  );

  // Build active UEDCL matched places pool
  const activePlaces: Array<{ name: string; lat: number; lng: number }> = [];
  for (const a of activeNonStaleAlerts) {
    for (const mp of a.matched_places) {
      activePlaces.push({ name: mp.place_name, lat: mp.lat, lng: mp.lng });
    }
  }

  // 1a. Three counters: UEDCL notices (active or partial, not stale), citizen reports, in both
  const uedclCount = activeNonStaleAlerts.length;
  const citizenCount = citizenAreaMap.size;

  // In both: citizen areas that have an active, non-stale UEDCL place within 1.5 km
  let inBothCount = 0;
  const citizenOnlyAreas: ComparisonSummary['citizen_only_areas'] = [];

  for (const ca of Array.from(citizenAreaMap.values())) {
    let hasCloseUedcl = false;
    for (const up of activePlaces) {
      const dist = haversineKm({ lat: ca.lat, lng: ca.lng }, { lat: up.lat, lng: up.lng });
      if (dist <= 1.5) {
        hasCloseUedcl = true;
        break;
      }
    }

    if (hasCloseUedcl) {
      inBothCount++;
    } else {
      citizenOnlyAreas.push({
        area_name: ca.area_name,
        district: 'Uganda',
        report_count: ca.count,
        last_report_time: ca.last_time,
      });
    }
  }

  // 1b. "UEDCL listed, no citizen report": list of areas with time and status
  const uedclOnlyAreas: ComparisonSummary['uedcl_only_areas'] = [];
  const citizenPoints = Array.from(citizenAreaMap.values());

  for (const a of activeNonStaleAlerts) {
    for (const mp of a.matched_places) {
      let hasCloseCitizen = false;
      for (const cp of citizenPoints) {
        if (haversineKm({ lat: mp.lat, lng: mp.lng }, { lat: cp.lat, lng: cp.lng }) <= 1.5) {
          hasCloseCitizen = true;
          break;
        }
      }
      if (!hasCloseCitizen) {
        uedclOnlyAreas.push({
          area: mp.place_name,
          service_area: a.alert.service_area,
          status_raw: a.alert.status_raw,
          published_at: a.alert.published_at,
        });
      }
    }
    // Also add raw area tokens if no places matched
    if (a.matched_places.length === 0) {
      for (const rawArea of a.alert.areas.slice(0, 3)) {
        uedclOnlyAreas.push({
          area: rawArea,
          service_area: a.alert.service_area,
          status_raw: a.alert.status_raw,
          published_at: a.alert.published_at,
        });
      }
    }
  }

  // 1d. "Notice to restored": median hours per UEDCL service office, using ONLY alerts where restored_time_exact = true
  const officeSamples = new Map<string, number[]>();
  for (const p of processed) {
    if (p.alert.restored_time_exact && p.duration_hours !== null && p.alert.status === 'restored') {
      const office = p.alert.service_area.toUpperCase().trim();
      const list = officeSamples.get(office) || [];
      list.push(p.duration_hours);
      officeSamples.set(office, list);
    }
  }

  const officeDurations: ComparisonSummary['office_durations'] = [];
  for (const [office, samples] of Array.from(officeSamples.entries())) {
    const med = samples.length >= 5 ? calculateMedian(samples) : null;
    officeDurations.push({
      service_area: office,
      median_hours: med !== null ? Number(med.toFixed(1)) : null,
      sample_size: samples.length,
    });
  }
  officeDurations.sort((a, b) => b.sample_size - a.sample_size);

  // Stale notices (active or partial, older than 24h)
  const staleNotices = processed
    .filter((p) => p.is_stale)
    .map((p) => ({
      service_area: p.alert.service_area,
      status_raw: p.alert.status_raw,
      published_at: p.alert.published_at,
      age_hours: p.age_hours,
      areas_raw: p.alert.areas_raw,
    }));

  const summary: ComparisonSummary = {
    counters: {
      uedcl_notices: uedclCount,
      citizen_reports: citizenCount,
      in_both: inBothCount,
    },
    uedcl_only_areas: uedclOnlyAreas.slice(0, 30),
    citizen_only_areas: citizenOnlyAreas.slice(0, 30),
    office_durations: officeDurations,
    footer: {
      matched_count: total_matched_places,
      total_places: total_unique_areas_seen,
      stale_notices: staleNotices,
    },
  };

  return NextResponse.json(summary);
}
