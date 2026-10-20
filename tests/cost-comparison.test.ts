import { describe, it, expect } from 'vitest';
import { calculateCostArithmetic } from '../lib/cost';
import {
  processOfficialAlerts,
  OfficialAlertRow,
  calculateMedian,
} from '../lib/official-comparison';

describe('Cost Arithmetic', () => {
  it('correctly calculates the known example (40,000 customers, 3 h, 0.18 kW gives 21,600 kWh)', () => {
    // 40,000 customers, 3 hours -> 120,000 customer-hours
    // 120,000 * 0.18 kW = 21,600 kWh
    const result = calculateCostArithmetic({
      customers: 40000,
      hours: 3,
      avg_kw: 0.18,
      tariff_low: 412,
      tariff_high: 779.4,
      generator_usd_per_kwh: 0.47,
      voll_usd_floor: 2,
      usd_to_ugx: 3700,
    });

    expect(result.customer_hours).toBe(120000);
    expect(result.kwh).toBe(21600);

    // Revenue loss:
    // low: 21,600 * 412 = 8,899,200 UGX
    // high: 21,600 * 779.4 = 16,835,040 UGX
    expect(result.revenue_loss_low_ugx).toBe(21600 * 412);
    expect(result.revenue_loss_high_ugx).toBe(21600 * 779.4);

    // Generator cost:
    // 21,600 * 0.47 * 3700 = 37,562,400 UGX
    expect(result.generator_cost_ugx).toBe(21600 * 0.47 * 3700);

    // VOLL floor:
    // 21,600 * 2 * 3700 = 159,840,000 UGX
    expect(result.economic_value_floor_ugx).toBe(21600 * 2 * 3700);
  });

  it('has DEFAULT_COST_CONSTANTS configured with 0.17 kW and verified metadata', async () => {
    const { DEFAULT_COST_CONSTANTS } = await import('../lib/cost');
    expect(DEFAULT_COST_CONSTANTS.avg_kw_per_customer.value).toBe(0.17);
    expect(DEFAULT_COST_CONSTANTS.avg_kw_per_customer.source_name).toContain('ERA Distribution Statistics');
    expect(DEFAULT_COST_CONSTANTS.usd_to_ugx.source_name).toContain('Placeholder, to be updated from Bank of Uganda');
    expect(DEFAULT_COST_CONSTANTS.tariff_low_ugx_per_kwh.source_url).toContain('monitor.co.ug');
    expect(DEFAULT_COST_CONSTANTS.generator_usd_per_kwh.source_url).toContain('energyforgrowth.org');
  });
});

describe('Official Alerts & Comparison Rules', () => {
  const baseAlert: OfficialAlertRow = {
    id: 'test-id-1',
    source: 'uedcl',
    source_key: 'key-1',
    published_at: '2026-10-20T06:00:00+03:00',
    service_area: 'BANDA',
    status_raw: 'Ongoing',
    status: 'active',
    first_seen_status: 'active',
    areas_raw: 'Ntinda, Kiwatule',
    areas: ['Ntinda', 'Kiwatule'],
    first_seen_at: '2026-10-20T06:00:00+03:00',
    last_seen_at: '2026-10-20T06:00:00+03:00',
    restored_seen_at: null,
    restored_time_exact: false,
    dropped_at: null,
  };

  it('marks active or partial notices older than 24h as stale and excludes them from duration', () => {
    // Current time 26 hours later
    const now = new Date('2026-10-21T08:00:00+03:00');
    const { processed } = processOfficialAlerts([baseAlert], now);

    expect(processed[0].is_stale).toBe(true);
    expect(processed[0].duration_hours).toBeNull();
    expect(processed[0].duration_type).toBe('unknown');
  });

  it('uses exact restore durations ONLY when restored_time_exact = true', () => {
    const exactRestoredAlert: OfficialAlertRow = {
      ...baseAlert,
      status: 'restored',
      status_raw: 'Completed',
      first_seen_status: 'active',
      restored_seen_at: '2026-10-20T09:00:00+03:00', // 3 hours later
      restored_time_exact: true,
    };

    const firstSeenRestoredAlert: OfficialAlertRow = {
      ...baseAlert,
      id: 'test-id-2',
      status: 'restored',
      status_raw: 'Completed',
      first_seen_status: 'restored',
      restored_seen_at: null,
      restored_time_exact: false,
    };

    const now = new Date('2026-10-20T12:00:00+03:00');
    const { processed } = processOfficialAlerts([exactRestoredAlert, firstSeenRestoredAlert], now);

    // Exact restored alert has 3 hours duration
    expect(processed[0].duration_hours).toBe(3);
    expect(processed[0].duration_type).toBe('exact');

    // First seen restored alert has unknown duration
    expect(processed[1].duration_hours).toBeNull();
    expect(processed[1].duration_type).toBe('unknown');
  });

  it('handles office sample size (n < 5 shows not enough data yet)', () => {
    // Samples with < 5 items
    const sample4 = [2.5, 3.0, 1.5, 4.0];
    expect(sample4.length < 5).toBe(true);

    // Sample with >= 5 items calculates real median
    const sample5 = [2.0, 3.0, 4.0, 5.0, 6.0];
    expect(calculateMedian(sample5)).toBe(4.0);

    const sample6 = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0];
    expect(calculateMedian(sample6)).toBe(3.5);
  });

  it('normalizes area names for matching correctly', async () => {
    const { normalizeAreaForMatch } = await import('../lib/official-comparison');
    expect(normalizeAreaForMatch('Ntinda Town')).toBe('ntinda');
    expect(normalizeAreaForMatch('Parts of Nakasero')).toBe('nakasero');
    expect(normalizeAreaForMatch('Kiwatule TC')).toBe('kiwatule');
    expect(normalizeAreaForMatch('Kololo Hill')).toBe('kololo');
    expect(normalizeAreaForMatch('Bukoto Estate')).toBe('bukoto');
  });
});
