-- Migration 005: Add area_hours and distinct_areas to outage_daily_summary, and update cost constants
alter table if exists public.outage_daily_summary
  add column if not exists area_hours double precision,
  add column if not exists distinct_areas integer;

-- Update cost constants for SAIDI-derived national reliability and ERA statistics
insert into public.cost_constants (key, value, unit, source_name, source_url, checked_at)
values
  ('tariff_low_ugx_per_kwh', 412, 'UGX/kWh', 'UEDCL Q4 Tariffs (Daily Monitor)', 'https://www.monitor.co.ug/uganda/news/national/uedcl-sets-new-power-tariffs-for-final-quarter-5620680', now()),
  ('tariff_high_ugx_per_kwh', 779.4, 'UGX/kWh', 'UEDCL Q4 Tariffs (Daily Monitor)', 'https://www.monitor.co.ug/uganda/news/national/uedcl-sets-new-power-tariffs-for-final-quarter-5620680', now()),
  ('generator_usd_per_kwh', 0.47, 'USD/kWh', 'Oseni and Pollitt, as summarised by Energy for Growth Hub', 'https://energyforgrowth.org/article/costs-of-unreliable-electricity-to-african-firms/', now()),
  ('value_of_lost_load_usd_per_kwh_floor', 2, 'USD/kWh', 'Oseni and Pollitt, as summarised by Energy for Growth Hub', 'https://energyforgrowth.org/article/costs-of-unreliable-electricity-to-african-firms/', now()),
  ('usd_to_ugx', 3700, 'UGX/USD', 'Placeholder, to be updated from Bank of Uganda', '', now()),
  ('assumed_customers_per_place', 1000, 'customers', 'unused, removed from the model', '', now()),
  ('avg_kw_domestic', 0.0559, 'kW', 'ERA Distribution Statistics Q2 2026, computed by Banange', 'https://www.era.go.ug/media/2026/09/Distribution_Statistics_Q2_2026_280926.xlsm', now()),
  ('avg_kw_all', 0.1706, 'kW', 'ERA Distribution Statistics Q2 2026, computed by Banange', 'https://www.era.go.ug/media/2026/09/Distribution_Statistics_Q2_2026_280926.xlsm', now()),
  ('uedcl_customers_2025', 2487346, 'customers', 'UEDCL Annual Report 2025 (Page 32)', 'https://www.uedcl.co.ug/wp-content/uploads/2026/05/UEDCL-Annual-Report-2025-FINAL.pdf', now()),
  ('uedcl_saidi_low_hours', 7.93, 'hours/month (unit assumed monthly)', 'UEDCL Annual Report 2025 (Page 43)', 'https://www.uedcl.co.ug/wp-content/uploads/2026/05/UEDCL-Annual-Report-2025-FINAL.pdf', now()),
  ('uedcl_saidi_high_hours', 12.39, 'hours/month (unit assumed monthly)', 'UEDCL Annual Report 2025 (Page 43)', 'https://www.uedcl.co.ug/wp-content/uploads/2026/05/UEDCL-Annual-Report-2025-FINAL.pdf', now())
on conflict (key) do update set
  value = excluded.value,
  unit = excluded.unit,
  source_name = excluded.source_name,
  source_url = excluded.source_url,
  checked_at = excluded.checked_at;
