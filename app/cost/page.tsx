import { Metadata } from 'next';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { DEFAULT_COST_CONSTANTS, CostConstant, calculateNationalSaidiReliability } from '@/lib/cost';
import { processOfficialAlerts, OfficialAlertRow } from '@/lib/official-comparison';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Cost & Economic Model - Banange',
  robots: {
    index: false,
    follow: false,
  },
};

export default async function CostPage() {
  const supabase = getSupabaseServerClient();
  const now = new Date();

  // 1. Fetch cost constants from DB, falling back to defaults
  const constantsMap: Record<string, CostConstant> = { ...DEFAULT_COST_CONSTANTS };
  if (supabase) {
    const { data: dbConstants } = await supabase.from('cost_constants').select('*');
    if (dbConstants) {
      for (const row of dbConstants) {
        constantsMap[row.key] = {
          key: row.key,
          value: Number(row.value),
          unit: row.unit,
          source_name: row.source_name,
          source_url: row.source_url,
        };
      }
    }
  }

  // 2. Fetch today's official alerts (Africa/Kampala time)
  const kampalaDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Kampala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  let todayAlerts: OfficialAlertRow[] = [];
  if (supabase) {
    const { data: alertsData } = await supabase
      .from('official_alerts')
      .select('*')
      .order('published_at', { ascending: false });

    if (alertsData) {
      todayAlerts = (alertsData as OfficialAlertRow[]).filter((a) => {
        const d = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Africa/Kampala',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date(a.published_at));
        return d === kampalaDateStr;
      });
    }
  }

  const { processed } = processOfficialAlerts(todayAlerts, now);

  let rowsCounted = 0;
  let rowsExcluded = 0;
  let totalAreasListed = 0;
  let areaHoursSoFar = 0;

  const distinctAreas = new Set<string>();
  for (const a of todayAlerts) {
    for (const areaStr of a.areas) {
      const cleaned = areaStr.trim();
      if (cleaned) distinctAreas.add(cleaned.toLowerCase());
    }
  }

  for (const p of processed) {
    const areasCount = Math.max(1, p.total_areas);
    if (p.duration_hours !== null && (p.duration_type === 'exact' || p.duration_type === 'running')) {
      rowsCounted++;
      totalAreasListed += areasCount;
      areaHoursSoFar += areasCount * p.duration_hours;
    } else {
      rowsExcluded++;
    }
  }

  // Calculate national figures worked backwards from UEDCL's reported SAIDI
  const nationalSaidi = calculateNationalSaidiReliability({
    customers: constantsMap.uedcl_customers_2025?.value,
    saidi_low_hours: constantsMap.uedcl_saidi_low_hours?.value,
    saidi_high_hours: constantsMap.uedcl_saidi_high_hours?.value,
    avg_kw_domestic: constantsMap.avg_kw_domestic?.value,
    avg_kw_all: constantsMap.avg_kw_all?.value,
    tariff_low: constantsMap.tariff_low_ugx_per_kwh?.value,
    tariff_high: constantsMap.tariff_high_ugx_per_kwh?.value,
    generator_usd_per_kwh: constantsMap.generator_usd_per_kwh?.value,
    voll_usd_floor: constantsMap.value_of_lost_load_usd_per_kwh_floor?.value,
    usd_to_ugx: constantsMap.usd_to_ugx?.value,
  });

  const formatUgx = (n: number) => {
    if (n >= 1_000_000_000) {
      return `${(n / 1_000_000_000).toFixed(2)} Billion`;
    }
    if (n >= 1_000_000) {
      return `${(n / 1_000_000).toFixed(1)} Million`;
    }
    return Math.round(n).toLocaleString('en-US');
  };

  return (
    <div className="min-h-screen bg-[#05070D] text-[var(--ink)] font-sans">
      {/* 1. Top experimental banner */}
      <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2.5 text-center font-mono text-xs text-[var(--accent-amber)] font-medium">
        ⚠ Experimental estimate. Not a published figure.
      </div>

      {/* Header without app navigation links */}
      <header className="border-b border-[var(--border)] px-5 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <span className="font-serif text-2xl font-bold tracking-tight text-[var(--ink)]">
            Banange
          </span>
          <span className="font-mono text-xs px-2 py-0.5 rounded bg-[var(--surface)] text-[var(--muted)] border border-[var(--border)]">
            Cost &amp; Economic Model
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Measured Numbers Headline Banner */}
        <section className="p-6 rounded-xl bg-gradient-to-b from-[#10182C] to-[#0A0F1E] border border-[var(--border)] space-y-4">
          <div className="flex items-center space-x-2 text-[var(--accent-amber)] font-mono text-xs uppercase tracking-wider font-semibold">
            <span className="inline-block w-2 h-2 rounded-full bg-[var(--accent-amber)] animate-pulse" />
            <span>Today&apos;s Measured Outage Extent</span>
          </div>

          <h1 className="font-serif text-3xl md:text-4xl text-white font-bold leading-tight">
            {areaHoursSoFar.toFixed(1)} Area-Hours Recorded So Far Today
          </h1>

          <p className="font-mono text-xs text-[var(--muted)] leading-relaxed">
            Directly tallied from official UEDCL notices published for {kampalaDateStr} (Africa/Kampala time).
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-[var(--border)]/60">
            <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]/60">
              <span className="block font-mono text-[11px] text-[var(--faint)]">Notices Counted</span>
              <strong className="font-mono text-xl text-white">{rowsCounted}</strong>
            </div>
            <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]/60">
              <span className="block font-mono text-[11px] text-[var(--faint)]">Areas Listed</span>
              <strong className="font-mono text-xl text-white">
                {totalAreasListed}{' '}
                <span className="text-xs font-normal text-[var(--muted)]">({distinctAreas.size} unique)</span>
              </strong>
            </div>
            <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]/60">
              <span className="block font-mono text-[11px] text-[var(--faint)]">Area-Hours</span>
              <strong className="font-mono text-xl text-[var(--accent-amber)]">
                {areaHoursSoFar.toFixed(1)}
              </strong>
            </div>
            <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]/60">
              <span className="block font-mono text-[11px] text-[var(--faint)]">Excluded (Stale)</span>
              <strong className="font-mono text-xl text-[var(--muted)]">{rowsExcluded}</strong>
            </div>
          </div>
        </section>

        {/* 2. National Figures Section worked backwards from UEDCL reported SAIDI */}
        <section className="p-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] space-y-6">
          <div className="space-y-2">
            <div className="flex items-center space-x-2 text-[var(--accent-amber)] font-mono text-xs uppercase tracking-wider font-semibold">
              <span>National Reliability Benchmark</span>
            </div>
            <h2 className="font-serif text-2xl font-bold text-white">
              Worked backwards from UEDCL&apos;s reported reliability (Annual Report 2025), not today&apos;s outages
            </h2>
            <p className="font-mono text-xs text-[var(--muted)] leading-relaxed">
              Because alert-derived customer totals risk overstating local outages, this national estimate works
              backwards from UEDCL&apos;s published regulatory performance in its FY 2024/25 Annual Report:
              a national customer base of <strong className="text-white">2,487,346</strong> (Page 32) and reported SAIDI ranging between{' '}
              <strong className="text-white">7.93 – 12.39 hours</strong> (Page 43, item 8, unit assumed monthly).
            </p>
          </div>

          {/* Daily Reliability Totals */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-[#0A0F1E] border border-[var(--border)]/60 space-y-1">
              <span className="font-mono text-[11px] text-[var(--faint)] uppercase tracking-wider">
                Implied National Daily Customer-Hours
              </span>
              <div className="font-mono text-2xl font-bold text-white">
                {Math.round(nationalSaidi.implied_customer_hours_low).toLocaleString()} –{' '}
                {Math.round(nationalSaidi.implied_customer_hours_high).toLocaleString()}
              </div>
              <p className="font-mono text-[11px] text-[var(--muted)]">
                Based on 7.93 h (low) to 12.39 h (high) monthly SAIDI annualized across 2.487M customers.
              </p>
            </div>

            <div className="p-4 rounded-lg bg-[#0A0F1E] border border-[var(--border)]/60 space-y-1">
              <span className="font-mono text-[11px] text-[var(--faint)] uppercase tracking-wider">
                Implied Daily Unserved Energy (kWh)
              </span>
              <div className="font-mono text-2xl font-bold text-[var(--accent-amber)]">
                {Math.round(nationalSaidi.daily_unserved_kwh_low).toLocaleString()} –{' '}
                {Math.round(nationalSaidi.daily_unserved_kwh_high).toLocaleString()} kWh
              </div>
              <p className="font-mono text-[11px] text-[var(--muted)]">
                Low case: 0.0559 kW (domestic only); High case: 0.1706 kW (all customer categories). Source: ERA Q2 2026.
              </p>
            </div>
          </div>

          {/* 3 Monetary Metric Cards: Low vs High ranges */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Card 1: Economic Value Floor */}
            <div className="p-4 rounded-lg bg-[#0E1528] border border-[var(--border)]/80 space-y-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--faint)]">
                Value of Lost Load (Economic Floor)
              </span>
              <div className="font-serif text-xl font-bold text-white">
                UGX {formatUgx(nationalSaidi.economic_value_floor_low_ugx)} –{' '}
                {formatUgx(nationalSaidi.economic_value_floor_high_ugx)}
                <span className="block text-xs font-normal text-[var(--faint)] font-mono">per day nationally</span>
              </div>
              <p className="font-mono text-[11px] text-[var(--muted)] leading-relaxed">
                Benchmark floor: $2.00/kWh (Oseni &amp; Pollitt) converted at 3,700 UGX/USD.
              </p>
            </div>

            {/* Card 2: Generator Running Cost */}
            <div className="p-4 rounded-lg bg-[#0E1528] border border-[var(--border)]/80 space-y-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--faint)]">
                Alternative Generator Running Cost
              </span>
              <div className="font-serif text-xl font-bold text-[var(--accent-amber)]">
                UGX {formatUgx(nationalSaidi.generator_cost_low_ugx)} –{' '}
                {formatUgx(nationalSaidi.generator_cost_high_ugx)}
                <span className="block text-xs font-normal text-[var(--faint)] font-mono">per day nationally</span>
              </div>
              <p className="font-mono text-[11px] text-[var(--muted)] leading-relaxed">
                Backup diesel operating cost: $0.47/kWh converted at 3,700 UGX/USD.
              </p>
            </div>

            {/* Card 3: Utility Revenue Not Billed */}
            <div className="p-4 rounded-lg bg-[#0E1528] border border-[var(--border)]/80 space-y-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--faint)]">
                Utility Unbilled Revenue
              </span>
              <div className="font-serif text-xl font-bold text-white">
                UGX {formatUgx(nationalSaidi.revenue_loss_low_ugx)} –{' '}
                {formatUgx(nationalSaidi.revenue_loss_high_ugx)}
                <span className="block text-xs font-normal text-[var(--faint)] font-mono">per day nationally</span>
              </div>
              <p className="font-mono text-[11px] text-[var(--muted)] leading-relaxed">
                At official tariffs: 412 UGX/kWh (low, domestic) to 779.4 UGX/kWh (high, commercial).
              </p>
            </div>
          </div>
        </section>

        {/* Model Constants & Citations Table */}
        <section className="p-6 rounded-lg bg-[var(--surface)] border border-[var(--border)] space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-xl font-bold text-white">Underlying Constants &amp; Citations</h2>
            <span className="font-mono text-[11px] text-[var(--muted)]">All values verified</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                  <th className="py-2.5 pr-4 font-semibold">Parameter</th>
                  <th className="py-2.5 px-4 font-semibold">Value</th>
                  <th className="py-2.5 px-4 font-semibold">Unit</th>
                  <th className="py-2.5 pl-4 font-semibold">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]/40">
                {Object.values(constantsMap).map((c) => (
                  <tr key={c.key}>
                    <td className="py-2.5 pr-4 text-white font-medium">{c.key}</td>
                    <td className="py-2.5 px-4 text-[var(--accent-amber)] font-semibold">{c.value}</td>
                    <td className="py-2.5 px-4 text-[var(--muted)]">{c.unit}</td>
                    <td className="py-2.5 pl-4 text-[var(--faint)]">
                      {c.source_url ? (
                        <a
                          href={c.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline hover:text-white"
                        >
                          {c.source_name}
                        </a>
                      ) : (
                        <span>{c.source_name}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--border)] py-6 px-5 text-center font-mono text-[11px] text-[var(--faint)]">
        <p>Banange Economic Model · Experimental estimate based on public regulatory filings and notices. Not a published figure.</p>
      </footer>
    </div>
  );
}
