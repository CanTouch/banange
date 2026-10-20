import { SupabaseClient } from '@supabase/supabase-js';
import { processOfficialAlerts, OfficialAlertRow } from './official-comparison';
import { DEFAULT_COST_CONSTANTS } from './cost';

export async function updateTodayOutageDailySummary(supabase: SupabaseClient, now: Date = new Date()) {
  try {
    // Current date in Africa/Kampala time (UTC+3)
    const kampalaDateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Kampala',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now); // e.g. "2026-10-20"

    // Fetch alerts for today (or all alerts) to compute today's summary
    const { data: allAlerts, error } = await supabase
      .from('official_alerts')
      .select('*')
      .order('published_at', { ascending: false });

    if (error || !allAlerts) {
      console.warn('[Daily Summary] Failed to fetch alerts:', error?.message);
      return;
    }

    // Filter alerts published today in Africa/Kampala
    const todayAlerts = (allAlerts as OfficialAlertRow[]).filter((a) => {
      if (!a.published_at) return false;
      const d = new Date(a.published_at);
      if (isNaN(d.getTime())) return false;
      const pubDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Kampala',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d);
      return pubDate === kampalaDateStr;
    });

    const { processed } = processOfficialAlerts(todayAlerts, now);

    let notices = todayAlerts.length;
    let matchedPlacesCount = 0;
    let rowsCounted = 0;
    let rowsExcluded = 0;
    let areaHours = 0;

    const distinctAreas = new Set<string>();
    for (const a of todayAlerts) {
      for (const areaStr of a.areas) {
        const cleaned = areaStr.trim();
        if (cleaned) distinctAreas.add(cleaned.toLowerCase());
      }
    }

    for (const p of processed) {
      // Measured area-hours: total_areas x duration_hours
      const areasCount = Math.max(1, p.total_areas);
      matchedPlacesCount += p.matched_places.length;

      if (p.duration_hours !== null && (p.duration_type === 'exact' || p.duration_type === 'running')) {
        rowsCounted++;
        areaHours += areasCount * p.duration_hours;
      } else {
        rowsExcluded++;
      }
    }

    await supabase.from('outage_daily_summary').upsert({
      date: kampalaDateStr,
      notices,
      matched_places: matchedPlacesCount,
      area_hours: Number(areaHours.toFixed(2)),
      distinct_areas: distinctAreas.size,
      rows_counted: rowsCounted,
      rows_excluded: rowsExcluded,
      created_at: now.toISOString(),
    });
  } catch (err) {
    console.warn('[Daily Summary] Error computing daily summary:', err);
  }
}
