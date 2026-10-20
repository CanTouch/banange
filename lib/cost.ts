/**
 * Cost calculation constants and arithmetic according to specification:
 *
 * Seeded values:
 * - tariff_low_ugx_per_kwh: 412
 * - tariff_high_ugx_per_kwh: 779.4 (Daily Monitor report on UEDCL Q4 tariffs)
 * - generator_usd_per_kwh: 0.47 (Oseni and Pollitt, Energy for Growth Hub)
 * - value_of_lost_load_usd_per_kwh_floor: 2 (Oseni and Pollitt, Energy for Growth Hub)
 * - usd_to_ugx: 3700 (Placeholder, to be updated from Bank of Uganda)
 * - assumed_customers_per_place: 1000 (range 500 to 2000, our own assumption)
 * - avg_kw_per_customer: 0.17 (ERA Distribution Statistics Q2 2026, computed by Banange)
 *
 * Calculation per day:
 * - customer_hours = total_areas x assumed_customers x hours
 * - kWh = customer_hours x avg_kw
 * - revenue not billed = kWh x tariff (low and high)
 * - generator cost = kWh x 0.47 x usd_to_ugx
 * - economic value floor = kWh x 2 x usd_to_ugx (shown as "at least")
 */

export interface CostConstant {
  key: string;
  value: number;
  unit: string;
  source_name: string;
  source_url: string;
}

export const DEFAULT_COST_CONSTANTS: Record<string, CostConstant> = {
  tariff_low_ugx_per_kwh: {
    key: 'tariff_low_ugx_per_kwh',
    value: 412,
    unit: 'UGX/kWh',
    source_name: 'UEDCL Q4 Tariffs (Daily Monitor)',
    source_url: 'https://www.monitor.co.ug/uganda/news/national/uedcl-sets-new-power-tariffs-for-final-quarter-5620680',
  },
  tariff_high_ugx_per_kwh: {
    key: 'tariff_high_ugx_per_kwh',
    value: 779.4,
    unit: 'UGX/kWh',
    source_name: 'UEDCL Q4 Tariffs (Daily Monitor)',
    source_url: 'https://www.monitor.co.ug/uganda/news/national/uedcl-sets-new-power-tariffs-for-final-quarter-5620680',
  },
  generator_usd_per_kwh: {
    key: 'generator_usd_per_kwh',
    value: 0.47,
    unit: 'USD/kWh',
    source_name: 'Oseni and Pollitt, as summarised by Energy for Growth Hub',
    source_url: 'https://energyforgrowth.org/article/costs-of-unreliable-electricity-to-african-firms/',
  },
  value_of_lost_load_usd_per_kwh_floor: {
    key: 'value_of_lost_load_usd_per_kwh_floor',
    value: 2,
    unit: 'USD/kWh',
    source_name: 'Oseni and Pollitt, as summarised by Energy for Growth Hub',
    source_url: 'https://energyforgrowth.org/article/costs-of-unreliable-electricity-to-african-firms/',
  },
  usd_to_ugx: {
    key: 'usd_to_ugx',
    value: 3700,
    unit: 'UGX/USD',
    source_name: 'Placeholder, to be updated from Bank of Uganda',
    source_url: '',
  },
  assumed_customers_per_place: {
    key: 'assumed_customers_per_place',
    value: 1000,
    unit: 'customers',
    source_name: 'unused, removed from the model',
    source_url: '',
  },
  avg_kw_domestic: {
    key: 'avg_kw_domestic',
    value: 0.0559,
    unit: 'kW',
    source_name: 'ERA Distribution Statistics Q2 2026, computed by Banange',
    source_url: 'https://www.era.go.ug/media/2026/09/Distribution_Statistics_Q2_2026_280926.xlsm',
  },
  avg_kw_all: {
    key: 'avg_kw_all',
    value: 0.1706,
    unit: 'kW',
    source_name: 'ERA Distribution Statistics Q2 2026, computed by Banange',
    source_url: 'https://www.era.go.ug/media/2026/09/Distribution_Statistics_Q2_2026_280926.xlsm',
  },
  avg_kw_per_customer: {
    key: 'avg_kw_per_customer',
    value: 0.1706,
    unit: 'kW',
    source_name: 'ERA Distribution Statistics Q2 2026, computed by Banange',
    source_url: 'https://www.era.go.ug/media/2026/09/Distribution_Statistics_Q2_2026_280926.xlsm',
  },
  uedcl_customers_2025: {
    key: 'uedcl_customers_2025',
    value: 2487346,
    unit: 'customers',
    source_name: 'UEDCL Annual Report 2025 (Page 32)',
    source_url: 'https://www.uedcl.co.ug/wp-content/uploads/2026/05/UEDCL-Annual-Report-2025-FINAL.pdf',
  },
  uedcl_saidi_low_hours: {
    key: 'uedcl_saidi_low_hours',
    value: 7.93,
    unit: 'hours/month (unit assumed monthly)',
    source_name: 'UEDCL Annual Report 2025 (Page 43)',
    source_url: 'https://www.uedcl.co.ug/wp-content/uploads/2026/05/UEDCL-Annual-Report-2025-FINAL.pdf',
  },
  uedcl_saidi_high_hours: {
    key: 'uedcl_saidi_high_hours',
    value: 12.39,
    unit: 'hours/month (unit assumed monthly)',
    source_name: 'UEDCL Annual Report 2025 (Page 43)',
    source_url: 'https://www.uedcl.co.ug/wp-content/uploads/2026/05/UEDCL-Annual-Report-2025-FINAL.pdf',
  },
};

export interface CostCalculationInput {
  customers: number;
  hours: number;
  avg_kw?: number;
  tariff_low?: number;
  tariff_high?: number;
  generator_usd_per_kwh?: number;
  voll_usd_floor?: number;
  usd_to_ugx?: number;
}

export interface CostCalculationResult {
  customer_hours: number;
  kwh: number;
  revenue_loss_low_ugx: number;
  revenue_loss_high_ugx: number;
  generator_cost_ugx: number;
  economic_value_floor_ugx: number;
}

export function calculateCostArithmetic(input: CostCalculationInput): CostCalculationResult {
  const avgKw = input.avg_kw ?? DEFAULT_COST_CONSTANTS.avg_kw_all.value;
  const tariffLow = input.tariff_low ?? DEFAULT_COST_CONSTANTS.tariff_low_ugx_per_kwh.value;
  const tariffHigh = input.tariff_high ?? DEFAULT_COST_CONSTANTS.tariff_high_ugx_per_kwh.value;
  const genUsd = input.generator_usd_per_kwh ?? DEFAULT_COST_CONSTANTS.generator_usd_per_kwh.value;
  const vollFloorUsd = input.voll_usd_floor ?? DEFAULT_COST_CONSTANTS.value_of_lost_load_usd_per_kwh_floor.value;
  const usdToUgx = input.usd_to_ugx ?? DEFAULT_COST_CONSTANTS.usd_to_ugx.value;

  const customer_hours = input.customers * input.hours;
  const kwh = customer_hours * avgKw;
  const revenue_loss_low_ugx = kwh * tariffLow;
  const revenue_loss_high_ugx = kwh * tariffHigh;
  const generator_cost_ugx = kwh * genUsd * usdToUgx;
  const economic_value_floor_ugx = kwh * vollFloorUsd * usdToUgx;

  return {
    customer_hours,
    kwh,
    revenue_loss_low_ugx,
    revenue_loss_high_ugx,
    generator_cost_ugx,
    economic_value_floor_ugx,
  };
}

export interface NationalSaidiInput {
  customers?: number;
  saidi_low_hours?: number;
  saidi_high_hours?: number;
  avg_kw_domestic?: number;
  avg_kw_all?: number;
  tariff_low?: number;
  tariff_high?: number;
  generator_usd_per_kwh?: number;
  voll_usd_floor?: number;
  usd_to_ugx?: number;
}

export interface NationalSaidiResult {
  customers: number;
  saidi_low_hours: number;
  saidi_high_hours: number;
  daily_hours_per_customer_low: number;
  daily_hours_per_customer_high: number;
  implied_customer_hours_low: number;
  implied_customer_hours_high: number;
  daily_unserved_kwh_low: number;
  daily_unserved_kwh_high: number;
  revenue_loss_low_ugx: number;
  revenue_loss_high_ugx: number;
  generator_cost_low_ugx: number;
  generator_cost_high_ugx: number;
  economic_value_floor_low_ugx: number;
  economic_value_floor_high_ugx: number;
}

/**
 * Computes national reliability figures worked backwards from UEDCL's reported SAIDI
 * in the 2025 Annual Report (Pages 32 & 43).
 */
export function calculateNationalSaidiReliability(input?: NationalSaidiInput): NationalSaidiResult {
  const customers = input?.customers ?? DEFAULT_COST_CONSTANTS.uedcl_customers_2025.value; // 2,487,346
  const saidi_low_hours = input?.saidi_low_hours ?? DEFAULT_COST_CONSTANTS.uedcl_saidi_low_hours.value; // 7.93
  const saidi_high_hours = input?.saidi_high_hours ?? DEFAULT_COST_CONSTANTS.uedcl_saidi_high_hours.value; // 12.39
  const avg_kw_domestic = input?.avg_kw_domestic ?? DEFAULT_COST_CONSTANTS.avg_kw_domestic.value; // 0.0559
  const avg_kw_all = input?.avg_kw_all ?? DEFAULT_COST_CONSTANTS.avg_kw_all.value; // 0.1706
  const tariff_low = input?.tariff_low ?? DEFAULT_COST_CONSTANTS.tariff_low_ugx_per_kwh.value; // 412
  const tariff_high = input?.tariff_high ?? DEFAULT_COST_CONSTANTS.tariff_high_ugx_per_kwh.value; // 779.4
  const gen_usd = input?.generator_usd_per_kwh ?? DEFAULT_COST_CONSTANTS.generator_usd_per_kwh.value; // 0.47
  const voll_floor = input?.voll_usd_floor ?? DEFAULT_COST_CONSTANTS.value_of_lost_load_usd_per_kwh_floor.value; // 2
  const usd_to_ugx = input?.usd_to_ugx ?? DEFAULT_COST_CONSTANTS.usd_to_ugx.value; // 3700

  // Implied daily hours per customer (monthly hours annualized / 365 days)
  const daily_hours_per_customer_low = (saidi_low_hours * 12) / 365;
  const daily_hours_per_customer_high = (saidi_high_hours * 12) / 365;

  // Implied daily customer-hours nationally
  const implied_customer_hours_low = customers * daily_hours_per_customer_low;
  const implied_customer_hours_high = customers * daily_hours_per_customer_high;

  // Daily unserved energy: Low case uses domestic-only (0.0559 kW), High case uses all customers (0.1706 kW)
  const daily_unserved_kwh_low = implied_customer_hours_low * avg_kw_domestic;
  const daily_unserved_kwh_high = implied_customer_hours_high * avg_kw_all;

  // Revenue loss:
  const revenue_loss_low_ugx = daily_unserved_kwh_low * tariff_low;
  const revenue_loss_high_ugx = daily_unserved_kwh_high * tariff_high;

  // Generator cost:
  const generator_cost_low_ugx = daily_unserved_kwh_low * gen_usd * usd_to_ugx;
  const generator_cost_high_ugx = daily_unserved_kwh_high * gen_usd * usd_to_ugx;

  // VOLL economic floor:
  const economic_value_floor_low_ugx = daily_unserved_kwh_low * voll_floor * usd_to_ugx;
  const economic_value_floor_high_ugx = daily_unserved_kwh_high * voll_floor * usd_to_ugx;

  return {
    customers,
    saidi_low_hours,
    saidi_high_hours,
    daily_hours_per_customer_low,
    daily_hours_per_customer_high,
    implied_customer_hours_low,
    implied_customer_hours_high,
    daily_unserved_kwh_low,
    daily_unserved_kwh_high,
    revenue_loss_low_ugx,
    revenue_loss_high_ugx,
    generator_cost_low_ugx,
    generator_cost_high_ugx,
    economic_value_floor_low_ugx,
    economic_value_floor_high_ugx,
  };
}
