-- Migration 006: OpenStreetMap places table for UEDCL notice area placement
create table if not exists public.places (
  id              bigserial primary key,
  osm_id          bigint unique,
  name            text not null,
  normalized_name text not null,
  kind            text not null,
  district        text null,
  lat             double precision not null,
  lng             double precision not null,
  source          text not null default 'osm'
);

create index if not exists idx_places_normalized_name on public.places (normalized_name);

alter table public.places enable row level security;
revoke all on public.places from anon, authenticated;
