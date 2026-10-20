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
    source_url: 'https://www.bou.or.ug/',
  },
  assumed_customers_per_place: {
    key: 'assumed_customers_per_place',
    value: 1000,
    unit: 'customers',
    source_name: 'Banange Model (range 500 to 2000, our own assumption)',
    source_url: 'https://banange.kuppelabs.com/cost',
  },
  avg_kw_per_customer: {
    key: 'avg_kw_per_customer',
    value: 0.17,
    unit: 'kW',
    source_name: 'ERA Distribution Statistics Q2 2026 (sheets Energy Sales_kWh and Number of Customers), computed by Banange',
    source_url: 'https://www.era.go.ug/energy-sales-by-customer-category/',
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
  const avgKw = input.avg_kw ?? DEFAULT_COST_CONSTANTS.avg_kw_per_customer.value;
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
