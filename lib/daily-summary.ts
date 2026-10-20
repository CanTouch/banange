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
    let customerHoursLow = 0;
    let customerHoursHigh = 0;
    let rowsCounted = 0;
    let rowsExcluded = 0;

    const avgKw = DEFAULT_COST_CONSTANTS.avg_kw_per_customer.value; // 0.18

    for (const p of processed) {
      const placesCount = Math.max(1, p.matched_places.length);
      matchedPlacesCount += p.matched_places.length;

      if (p.duration_hours !== null && (p.duration_type === 'exact' || p.duration_type === 'running')) {
        rowsCounted++;
        // Low: 500 customers per place; High: 2000 customers per place
        const chLow = placesCount * 500 * p.duration_hours;
        const chHigh = placesCount * 2000 * p.duration_hours;
        customerHoursLow += chLow;
        customerHoursHigh += chHigh;
      } else {
        rowsExcluded++;
      }
    }

    const kwhLow = customerHoursLow * avgKw;
    const kwhHigh = customerHoursHigh * avgKw;

    await supabase.from('outage_daily_summary').upsert({
      date: kampalaDateStr,
      notices,
      matched_places: matchedPlacesCount,
      customer_hours_low: Number(customerHoursLow.toFixed(2)),
      customer_hours_high: Number(customerHoursHigh.toFixed(2)),
      kwh_low: Number(kwhLow.toFixed(2)),
      kwh_high: Number(kwhHigh.toFixed(2)),
      rows_counted: rowsCounted,
      rows_excluded: rowsExcluded,
      created_at: now.toISOString(),
    });
  } catch (err) {
    console.warn('[Daily Summary] Error computing daily summary:', err);
  }
}
