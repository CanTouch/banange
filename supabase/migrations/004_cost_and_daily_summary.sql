-- Cost constants table
create table if not exists public.cost_constants (
  key         text primary key,
  value       double precision not null,
  unit        text not null,
  source_name text not null,
  source_url  text not null,
  checked_at  timestamptz not null default now()
);

-- Seed cost constants
insert into public.cost_constants (key, value, unit, source_name, source_url, checked_at)
values
  ('tariff_low_ugx_per_kwh', 412, 'UGX/kWh', 'UEDCL Q4 Tariffs (Daily Monitor)', 'https://www.monitor.co.ug/uganda/news/national/uedcl-sets-new-power-tariffs-for-final-quarter-5620680', now()),
  ('tariff_high_ugx_per_kwh', 779.4, 'UGX/kWh', 'UEDCL Q4 Tariffs (Daily Monitor)', 'https://www.monitor.co.ug/uganda/news/national/uedcl-sets-new-power-tariffs-for-final-quarter-5620680', now()),
  ('generator_usd_per_kwh', 0.47, 'USD/kWh', 'Oseni and Pollitt, as summarised by Energy for Growth Hub', 'https://energyforgrowth.org/article/costs-of-unreliable-electricity-to-african-firms/', now()),
  ('value_of_lost_load_usd_per_kwh_floor', 2, 'USD/kWh', 'Oseni and Pollitt, as summarised by Energy for Growth Hub', 'https://energyforgrowth.org/article/costs-of-unreliable-electricity-to-african-firms/', now()),
  ('usd_to_ugx', 3700, 'UGX/USD', 'Placeholder, to be updated from Bank of Uganda', 'https://www.bou.or.ug/', now()),
  ('assumed_customers_per_place', 1000, 'customers', 'Banange Model (range 500 to 2000, our own assumption)', 'https://banange.kuppelabs.com/cost', now()),
  ('avg_kw_per_customer', 0.17, 'kW', 'ERA Distribution Statistics Q2 2026 (sheets Energy Sales_kWh and Number of Customers), computed by Banange', 'https://www.era.go.ug/energy-sales-by-customer-category/', now())
on conflict (key) do update set
  value = excluded.value,
  unit = excluded.unit,
  source_name = excluded.source_name,
  source_url = excluded.source_url,
  checked_at = excluded.checked_at;

-- Daily outage summary table
create table if not exists public.outage_daily_summary (
  date                  date primary key,
  notices               integer not null default 0,
  matched_places        integer not null default 0,
  customer_hours_low    double precision not null default 0,
  customer_hours_high   double precision not null default 0,
  kwh_low               double precision not null default 0,
  kwh_high              double precision not null default 0,
  rows_counted          integer not null default 0,
  rows_excluded         integer not null default 0,
  created_at            timestamptz not null default now()
);

-- RLS
alter table public.cost_constants enable row level security;
alter table public.outage_daily_summary enable row level security;
revoke all on public.cost_constants from anon, authenticated;
revoke all on public.outage_daily_summary from anon, authenticated;
