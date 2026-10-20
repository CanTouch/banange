import { Metadata } from 'next';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { DEFAULT_COST_CONSTANTS, CostConstant, calculateCostArithmetic } from '@/lib/cost';
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
  let totalCustomerHoursLow = 0;
  let totalCustomerHoursHigh = 0;
  let totalCustomerHoursMid = 0;

  for (const p of processed) {
    // The cost model must not depend on map matching: use total_areas (all listed areas)
    const areasCount = Math.max(1, p.total_areas);
    if (p.duration_hours !== null && (p.duration_type === 'exact' || p.duration_type === 'running')) {
      rowsCounted++;
      // Customer range: 500 (low) to 2000 (high), default/mid: 1000
      totalCustomerHoursLow += areasCount * 500 * p.duration_hours;
      totalCustomerHoursMid += areasCount * 1000 * p.duration_hours;
      totalCustomerHoursHigh += areasCount * 2000 * p.duration_hours;
    } else {
      rowsExcluded++;
    }
  }

  const avgKw = constantsMap.avg_kw_per_customer.value; // 0.17
  const tariffLow = constantsMap.tariff_low_ugx_per_kwh.value; // 412
  const tariffHigh = constantsMap.tariff_high_ugx_per_kwh.value; // 779.4
  const genUsd = constantsMap.generator_usd_per_kwh.value; // 0.47
  const vollFloor = constantsMap.value_of_lost_load_usd_per_kwh_floor.value; // 2
  const usdToUgx = constantsMap.usd_to_ugx.value; // 3700

  // Calculations for low, mid, high customer assumptions
  const calcLow = calculateCostArithmetic({
    customers: totalCustomerHoursLow,
    hours: 1, // already customer-hours
    avg_kw: avgKw,
    tariff_low: tariffLow,
    tariff_high: tariffHigh,
    generator_usd_per_kwh: genUsd,
    voll_usd_floor: vollFloor,
    usd_to_ugx: usdToUgx,
  });

  const calcHigh = calculateCostArithmetic({
    customers: totalCustomerHoursHigh,
    hours: 1,
    avg_kw: avgKw,
    tariff_low: tariffLow,
    tariff_high: tariffHigh,
    generator_usd_per_kwh: genUsd,
    voll_usd_floor: vollFloor,
    usd_to_ugx: usdToUgx,
  });

  const calcMid = calculateCostArithmetic({
    customers: totalCustomerHoursMid,
    hours: 1,
    avg_kw: avgKw,
    tariff_low: tariffLow,
    tariff_high: tariffHigh,
    generator_usd_per_kwh: genUsd,
    voll_usd_floor: vollFloor,
    usd_to_ugx: usdToUgx,
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

  // Sanity Benchmark calculations from UEDCL Annual Report 2025:
  // - Customer base: 2,487,346 (Page 32)
  // - Monthly SAIDI: 7.93 - 12.39 hours per month (Page 43, item 8)
  // Implied daily national customer-hours = 2,487,346 * (10.16 / 30.416) ~ 830,860 customer-hours/day
  const saidiImpliedCustomerHoursPerDay = 830860;
  const isEstimateHigherThanSaidi = totalCustomerHoursMid > saidiImpliedCustomerHoursPerDay;

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
            Cost & Economic Model
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Headline banner */}
        <section className="p-6 rounded-xl bg-gradient-to-b from-[#10182C] to-[#0A0F1E] border border-[var(--border)] space-y-3">
          <div className="flex items-center space-x-2 text-[var(--accent-amber)] font-mono text-xs uppercase tracking-wider font-semibold">
            <span className="inline-block w-2 h-2 rounded-full bg-[var(--accent-amber)] animate-pulse" />
            <span>Economic Impact Estimate</span>
          </div>

          <h1 className="font-serif text-3xl md:text-4xl text-white font-bold leading-tight">
            Estimated economic loss so far today: UGX {formatUgx(calcLow.economic_value_floor_ugx)} or more
          </h1>

          <p className="font-mono text-xs text-[var(--muted)] leading-relaxed">
            Estimate based on public UEDCL notices and citizen reports. Not an official figure.
          </p>

          <div className="pt-3 border-t border-[var(--border)]/60 flex flex-wrap gap-4 text-xs font-mono text-[var(--muted)]">
            <div>
              <span className="text-[var(--faint)]">Notices Counted: </span>
              <strong className="text-white">{rowsCounted}</strong>
            </div>
            <div>
              <span className="text-[var(--faint)]">Notices Excluded (unknown duration / stale): </span>
              <strong className="text-white">{rowsExcluded}</strong>
            </div>
            <div>
              <span className="text-[var(--faint)]">Calculated for: </span>
              <strong className="text-white">{kampalaDateStr} (EAT)</strong>
            </div>
          </div>
        </section>

        {/* 2. Sanity Panel against UEDCL Annual Report 2025 */}
        <section className="p-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-base font-semibold text-white">
              Sanity Benchmark: UEDCL Reported Reliability (2025 Annual Report)
            </h2>
            <span className="font-mono text-[10px] text-[var(--faint)]">Pages 32 &amp; 43</span>
          </div>

          <p className="font-mono text-xs text-[var(--muted)] leading-relaxed">
            In its 2024/25 Annual Report, UEDCL reported{' '}
            <strong className="text-white">2,487,346 customers</strong> (Page 32) and registered a System Average
            Interruption Duration Index (SAIDI) ranging between{' '}
            <strong className="text-white">7.93 – 12.39 hours per month</strong> (Page 43, item 8).
          </p>

          <div className="p-3 rounded-lg bg-[#0A0F1E] border border-[var(--border)]/60 font-mono text-xs space-y-2">
            <div className="text-[var(--muted)]">
              UEDCL&apos;s reported SAIDI implies about{' '}
              <strong className="text-white">
                {Math.round(saidiImpliedCustomerHoursPerDay).toLocaleString()} customer-hours per day nationally
              </strong>
              ; this page&apos;s estimate for today is{' '}
              <strong className="text-[var(--accent-amber)]">
                {Math.round(totalCustomerHoursMid).toLocaleString()}
              </strong>{' '}
              (mid-range assumption: 1,000 customers per listed area).
            </div>

            {isEstimateHigherThanSaidi && (
              <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] flex items-center space-x-2">
                <span>⚠</span>
                <span>
                  <strong>Warning:</strong> Today&apos;s estimate ({Math.round(totalCustomerHoursMid).toLocaleString()} customer-hours) is larger than UEDCL&apos;s reported daily average ({Math.round(saidiImpliedCustomerHoursPerDay).toLocaleString()}), indicating the estimate is probably too high.
                </span>
              </div>
            )}
          </div>
        </section>

        {/* 3 Metric cards: Low vs High ranges */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Economic Value Floor */}
          <div className="p-5 rounded-lg bg-[var(--surface)] border border-[var(--border)] space-y-2">
            <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--faint)]">
              Value of Lost Load (Economic Floor)
            </span>
            <div className="font-serif text-2xl font-bold text-white">
              at least UGX {formatUgx(calcLow.economic_value_floor_ugx)}
            </div>
            <p className="font-mono text-[11px] text-[var(--muted)]">
              Range: UGX {formatUgx(calcLow.economic_value_floor_ugx)} – {formatUgx(calcHigh.economic_value_floor_ugx)}
            </p>
            <div className="pt-2 text-[10px] font-mono text-[var(--faint)] border-t border-[var(--border)]/40">
              Source:{' '}
              <a
                href={constantsMap.value_of_lost_load_usd_per_kwh_floor.source_url}
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-white"
              >
                {constantsMap.value_of_lost_load_usd_per_kwh_floor.source_name}
              </a>
            </div>
          </div>

          {/* Card 2: Generator Operating Cost */}
          <div className="p-5 rounded-lg bg-[var(--surface)] border border-[var(--border)] space-y-2">
            <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--faint)]">
              Alternative Generator Running Cost
            </span>
            <div className="font-serif text-2xl font-bold text-[var(--accent-amber)]">
              UGX {formatUgx(calcMid.generator_cost_ugx)}
            </div>
            <p className="font-mono text-[11px] text-[var(--muted)]">
              Range: UGX {formatUgx(calcLow.generator_cost_ugx)} – {formatUgx(calcHigh.generator_cost_ugx)}
            </p>
            <div className="pt-2 text-[10px] font-mono text-[var(--faint)] border-t border-[var(--border)]/40">
              Source:{' '}
              <a
                href={constantsMap.generator_usd_per_kwh.source_url}
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-white"
              >
                {constantsMap.generator_usd_per_kwh.source_name}
              </a>
            </div>
          </div>

          {/* Card 3: Revenue Not Billed */}
          <div className="p-5 rounded-lg bg-[var(--surface)] border border-[var(--border)] space-y-2">
            <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--faint)]">
              Utility Unbilled Revenue
            </span>
            <div className="font-serif text-2xl font-bold text-white">
              UGX {formatUgx(calcMid.revenue_loss_low_ugx)} – {formatUgx(calcMid.revenue_loss_high_ugx)}
            </div>
            <p className="font-mono text-[11px] text-[var(--muted)]">
              Based on domestic &amp; commercial tariffs (412 to 779.4 UGX/kWh)
            </p>
            <div className="pt-2 text-[10px] font-mono text-[var(--faint)] border-t border-[var(--border)]/40">
              Source:{' '}
              <a
                href={constantsMap.tariff_low_ugx_per_kwh.source_url}
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-white"
              >
                {constantsMap.tariff_low_ugx_per_kwh.source_name}
              </a>
            </div>
          </div>
        </section>

        {/* Energy breakdown table */}
        <section className="p-6 rounded-lg bg-[var(--surface)] border border-[var(--border)] space-y-4">
          <h2 className="font-serif text-xl font-bold text-white">Calculations &amp; Assumptions</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                  <th className="py-2.5 pr-4 font-semibold">Metric</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Low (500 cust/area)</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Mid (1,000 cust/area)</th>
                  <th className="py-2.5 pl-4 font-semibold text-right">High (2,000 cust/area)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]/40">
                <tr>
                  <td className="py-2.5 pr-4 text-[var(--muted)]">Customer-Hours Dark</td>
                  <td className="py-2.5 px-4 text-right text-white">{Math.round(totalCustomerHoursLow).toLocaleString()}</td>
                  <td className="py-2.5 px-4 text-right text-white">{Math.round(totalCustomerHoursMid).toLocaleString()}</td>
                  <td className="py-2.5 pl-4 text-right text-white">{Math.round(totalCustomerHoursHigh).toLocaleString()}</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 text-[var(--muted)]">Unserved Energy (kWh)</td>
                  <td className="py-2.5 px-4 text-right text-white">{Math.round(calcLow.kwh).toLocaleString()}</td>
                  <td className="py-2.5 px-4 text-right text-white">{Math.round(calcMid.kwh).toLocaleString()}</td>
                  <td className="py-2.5 pl-4 text-right text-white">{Math.round(calcHigh.kwh).toLocaleString()}</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 text-[var(--muted)]">Generator Running Cost (UGX)</td>
                  <td className="py-2.5 px-4 text-right text-white">{formatUgx(calcLow.generator_cost_ugx)}</td>
                  <td className="py-2.5 px-4 text-right text-white">{formatUgx(calcMid.generator_cost_ugx)}</td>
                  <td className="py-2.5 pl-4 text-right text-white">{formatUgx(calcHigh.generator_cost_ugx)}</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 text-[var(--muted)]">Economic Value Floor (UGX)</td>
                  <td className="py-2.5 px-4 text-right text-white">{formatUgx(calcLow.economic_value_floor_ugx)}</td>
                  <td className="py-2.5 px-4 text-right text-white">{formatUgx(calcMid.economic_value_floor_ugx)}</td>
                  <td className="py-2.5 pl-4 text-right text-white">{formatUgx(calcHigh.economic_value_floor_ugx)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Model Constants Table with Links and Citations */}
        <section className="p-6 rounded-lg bg-[var(--surface)] border border-[var(--border)] space-y-4">
          <h2 className="font-serif text-xl font-bold text-white">Underlying Constants &amp; Citations</h2>
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
                      <a
                        href={c.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline hover:text-white"
                      >
                        {c.source_name}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--border)] py-6 px-5 text-center font-mono text-[11px] text-[var(--faint)]">
        <p>Banange Economic Model · Experimental estimate based on public UEDCL notices. Not a published figure.</p>
      </footer>
    </div>
  );
}
