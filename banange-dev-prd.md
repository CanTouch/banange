# Banange: Development PRD (build-ready)

You are building "Banange", a community map of power outages across Uganda. Read this whole file first, then build it end to end.

## 0. Operating rules for the builder (read first)
1. Do NOT ask the owner questions. Every decision you need is in this file. Where something is unspecified, pick the simplest option, and record it in `README.md` under "Decisions made".
2. The owner has not created accounts yet. If `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing, the app MUST run in DEV MODE using an in-memory store and show a small "DEV MODE" badge. This lets you build and test everything locally with zero setup.
3. If an external URL or service fails (tiles, GeoNames download, fonts), use the fallback given in this file, log a warning, and continue. Never stop on a network failure.
4. Build in order: Phase 1 first and finish it completely (tests passing, checklist done) before Phase 2, then Phase 3.
5. Never insert fake or demo reports into the real database. DEV MODE in-memory data is allowed only in DEV MODE and must show "DEV MODE".
6. Never store or log exact coordinates or IP addresses. Never put the service-role key in client code.
7. Everything user-visible comes from `messages/en.json` and `messages/lg.json`. No hard-coded UI strings.
8. At the end, write `README.md` (setup, env vars, admin SQL, decisions made, known issues).

## 1. Product in one paragraph
Anyone in Uganda taps "Power is out here" or "Power is back" (no account). The report is saved with a location rounded to a ~550 m grid. A public map shows where power is out, whether it is confirmed by several people, since when, and which areas had the most outages this week. It must feel like night-sky Uganda: dark, glowing dots, a cheeky Ugandan voice at reward moments, serious and honest everywhere else. Always labelled "Community reports, not official data."

URL: https://banange.kuppelabs.com. Tagline EN: "UEDCL, eehh?? Where's the power?"

## 2. Stack (fixed, do not substitute)
- Next.js (App Router) + TypeScript + Tailwind CSS
- MapLibre GL JS, OpenFreeMap vector tiles (free, no key)
- Supabase Postgres (server-side only, via service-role key)
- zod for validation, Vitest for tests
- Vercel Web Analytics (`@vercel/analytics`)
- Fonts via `next/font/google`: Bricolage Grotesque (headings, 600-800) and DM Sans (body, 400-600)
- Dev-only: `sharp` to generate images

Setup commands:
```
npx create-next-app@latest banange --typescript --tailwind --app --eslint --no-src-dir --import-alias "@/*"
cd banange
npm i maplibre-gl @supabase/supabase-js zod @vercel/analytics
npm i -D vitest sharp
```
package.json scripts: `"test": "vitest run"`, `"build:areas": "node scripts/build-areas.mjs"`, `"make:images": "node scripts/make-images.mjs"`.

## 3. Repo structure
```
app/layout.tsx  app/page.tsx  app/globals.css
app/api/report/route.ts   app/api/map/route.ts
app/api/areas/route.ts    app/api/health/route.ts
app/api/map/history/route.ts          (Phase 2)
components/MapView.tsx TopBar.tsx ReportButtons.tsx LocationPicker.tsx
           CelebrationOverlay.tsx AreaSheet.tsx BackPrompt.tsx AboutModal.tsx
           LangToggle.tsx ThemeToggle.tsx DevBadge.tsx
           TimeSlider.tsx (Phase 2)
lib/constants.ts cells.ts states.ts store.ts supabase-server.ts device.ts
    areas.ts mapStyle.ts offlineQueue.ts i18n.ts turnstile.ts liteMode.ts
messages/en.json messages/lg.json
data/areas.json                       (generated, committed)
data/areas.starter.json               (fallback, section 9)
scripts/build-areas.mjs scripts/make-images.mjs
supabase/migrations/001_init.sql
tests/cells.test.ts tests/states.test.ts tests/areas.test.ts
public/manifest.webmanifest public/favicon.svg (icons and og.png are generated)
README.md
```

## 4. Environment variables
```
NEXT_PUBLIC_SITE_URL=https://banange.kuppelabs.com
NEXT_PUBLIC_CONTACT_EMAIL=hello@kuppelabs.com
SUPABASE_URL=                      # optional locally (DEV MODE if missing)
SUPABASE_SERVICE_ROLE_KEY=         # server only
DEVICE_SALT=                       # server only; if missing in DEV MODE use "dev-salt"
TURNSTILE_SECRET=                  # optional: if set, bot check is enforced
NEXT_PUBLIC_TURNSTILE_SITE_KEY=    # optional
```
Create `.env.example` with these keys (no values) and make `.env.local` git-ignored.

## 5. Constants (`lib/constants.ts`)
```
GRID_SIZE_DEG = 0.005
OUT_TTL_HOURS = 6
RECENT_RESTORE_HOURS = 2
CONFIRM_MIN_DEVICES = 3
CONFIRM_WINDOW_MIN = 30
RATE_LIMIT_MINUTES = 10
DAILY_LIMIT = 20
POLL_SECONDS = 30
MAP_CACHE_SECONDS = 20
BACK_PROMPT_REASK_MIN = 30
OFFLINE_RETRY_MAX_MIN = 15
AREA_MATCH_KM = 4
UGANDA_BOUNDS = { latMin: -1.6, latMax: 4.4, lngMin: 29.4, lngMax: 35.2 }
UGANDA_CENTER = { lat: 1.37, lng: 32.29 }
DEFAULT_ZOOM = 6.5
```

## 6. Data

### 6.1 SQL (`supabase/migrations/001_init.sql`)
```sql
create extension if not exists pgcrypto;

create table public.reports (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  kind          text not null check (kind in ('out','back')),
  cell_id       text not null,
  cell_lat      double precision not null,
  cell_lng      double precision not null,
  loc_precision text not null check (loc_precision in ('gps','pin','area')),
  area_name     text,
  device_hash   text not null,
  flagged       boolean not null default false
);
create index reports_cell_time_idx   on public.reports (cell_id, created_at desc);
create index reports_device_kind_idx on public.reports (device_hash, kind, created_at desc);
create index reports_time_idx        on public.reports (created_at desc);

create table public.blocked_devices (
  device_hash text primary key,
  reason      text,
  created_at  timestamptz not null default now()
);

alter table public.reports enable row level security;
alter table public.blocked_devices enable row level security;
revoke all on public.reports from anon, authenticated;
revoke all on public.blocked_devices from anon, authenticated;
-- no policies on purpose: only the service role (server) can read/write
```

### 6.2 Store adapter (`lib/store.ts`)
```ts
interface ReportStore {
  insertReport(r: NewReport): Promise<void>
  lastReport(deviceHash: string, kind: 'out'|'back', sinceIso: string): Promise<boolean>
  countReports(deviceHash: string, sinceIso: string): Promise<number>
  isBlocked(deviceHash: string): Promise<boolean>
  reportsSince(sinceIso: string, untilIso?: string, limit?: number): Promise<Report[]> // excludes flagged; limit default 20000
}
```
Two implementations: `SupabaseStore` (server, service role) and `MemoryStore` (module-level arrays, DEV MODE only). Export `getStore()` which picks by env.

## 7. Core logic (pure functions, fully unit-tested)

### 7.1 `lib/cells.ts`
```
ix = Math.round(lat / GRID_SIZE_DEG); iy = Math.round(lng / GRID_SIZE_DEG)
cell_id  = `${ix}_${iy}`
cell_lat = Number((ix * GRID_SIZE_DEG).toFixed(3)); cell_lng = Number((iy * GRID_SIZE_DEG).toFixed(3))
parseCell(id) -> {ix, iy}
neighbours(id) -> 9 cell ids (3x3 including itself)
haversineKm(a, b)
```

### 7.2 Device identity (`lib/device.ts`)
- Client: `localStorage['banange_device']` = `crypto.randomUUID()` created on first visit (wrap in try/catch; fall back to an in-memory id).
- Server: `device_hash = sha256_hex(device_id + DEVICE_SALT)`. Never store the raw id.

### 7.3 `lib/states.ts`
Signature: `computeState(reports: Report[], now: Date, blocked: Set<string>): { cells: CellOut[]; episodes: Episode[] }`. Must be pure (no I/O, no Date.now() inside; use `now`).

Types:
```ts
type Episode = { cell_id: string; start: string; lastActivity: string; end?: string;
  endedBy?: 'restored'|'expired'; confirmed: boolean; approximate: boolean; devices: number;
  durationHoursEstimated: number }
type CellOut = { cell_id: string; lat: number; lng: number; state: 'out'|'restored';
  confirmed: boolean; approximate: boolean; since: string; last_activity: string;
  restored_at?: string; fade?: number /* 0..1 for restored */; reporters: number }
```
Algorithm:
1. Drop reports where `flagged` or `device_hash` in `blocked`, or `created_at > now`. Sort ascending by time. Group by `cell_id`.
2. Process each cell with this state machine (state starts IDLE):
   - on `out` at t from device d:
     - IDLE: start episode {start=t, lastActivity=t, outDevices={d}, backDevices={}, approximate = precision != 'gps'}.
     - OUT: outDevices.add(d); lastActivity=t; backDevices={}; approximate ||= precision != 'gps'.
     - After handling, evaluate confirmation at t: count distinct `out` devices across the 3x3 neighbourhood whose latest-open-episode `out` reports fall within `[t - CONFIRM_WINDOW_MIN, t]`. If count >= CONFIRM_MIN_DEVICES set episode.confirmed = true (it stays true for the episode).
   - on `back` at t from device d:
     - OUT: backDevices.add(d); needed = episode.confirmed ? 2 : 1; if backDevices.size >= needed then close episode {end=t, endedBy='restored'} and state=IDLE.
     - IDLE: ignore.
   - Expiry check before applying each event and at the end with `now`: if state is OUT and (t_ref - lastActivity) > OUT_TTL_HOURS, close episode {end=lastActivity, endedBy='expired'}; state=IDLE.
3. `durationHoursEstimated`: restored = end - start; expired = lastActivity - start; still open = now - start. Minimum 0.
4. Cells output: for each cell with an open episode -> `state:'out'`. For each cell whose latest closed episode ended `restored` within RECENT_RESTORE_HOURS of `now` and has no open episode -> `state:'restored'` with `restored_at` and `fade = 1 - (now - restored_at)/RECENT_RESTORE_HOURS` clamped 0..1. `reporters` = distinct devices in the episode.
5. Return all episodes (open and closed) for stats.

### 7.4 Area naming (`lib/areas.ts`)
- Load `data/areas.json` (fall back to `data/areas.starter.json`).
- `nearestArea(lat, lng)`: brute-force nearest by haversine. If distance <= AREA_MATCH_KM return its name; else return `Near ${name}`.
- `searchAreas(q)`: case-insensitive "contains" on name, prefix matches first, then population/type order, max 6 results.
- Weekly stats group episodes (start within last 7 days) by `nearestArea` of the cell centre.

## 8. API (all JSON; errors `{ "error": code, "message": text }`; set `export const dynamic = 'force-dynamic'`)

### POST /api/report
Body (zod): `{ kind:'out'|'back', lat:number, lng:number, loc_precision:'gps'|'pin'|'area', area_name?:string (max 60), device_id:string (uuid), turnstile_token?:string }`
1. Validate. Outside UGANDA_BOUNDS -> 422 `out_of_bounds` "Banange only covers Uganda for now."
2. If `TURNSTILE_SECRET` is set: verify token with Cloudflare (`https://challenges.cloudflare.com/turnstile/v0/siteverify`); fail -> 403 `challenge_failed`. If not set, skip.
3. Hash device. If blocked -> return 201 `{ok:true}` WITHOUT inserting (silent drop).
4. Rate limit: same device + kind within RATE_LIMIT_MINUTES -> 429 `rate_limited` with `retry_after_seconds`. More than DAILY_LIMIT reports in 24 h -> 429 `daily_limit`.
5. Round to grid; insert (area_name is stored only if it exactly matches a name in areas.json, else null). Never log raw coordinates, IP or device id.
6. 201 `{ ok:true, cell_id, cell_lat, cell_lng }`.

### GET /api/map
Fetch `reportsSince(now - 7 days)`, run `computeState`, return:
```
{ generated_at, dev_mode: boolean,
  cells: [{ cell_id, lat, lng, state, confirmed, approximate, since, last_activity, restored_at?, fade?, reporters, area }],
  areas: [{ name, episodes_7d, hours_dark_7d_estimated, dark_now }],
  totals: { dark_now, confirmed_now } }
```
`areas` sorted by episodes_7d desc then hours desc. Header: `Cache-Control: public, s-maxage=20, stale-while-revalidate=60`.

### GET /api/areas?q=
Returns `{ results: [{ name, lat, lng }] }` (max 6) via `searchAreas`.

### GET /api/health -> `{ ok:true, time }`

### GET /api/map/history?from=ISO&to=ISO&step=30 (Phase 2)
Range max 7 days; step in minutes, min 15. Load reports for `[from-7d, to]` once; for each snapshot time t (from..to by step) run `computeState(reportsUpTo(t), t)`; return `{ snapshots: [{ t, cells: [...slim cells...], totals }] }`. Slim cell = `{cell_id, lat, lng, state, confirmed, fade}`. Header `Cache-Control: public, s-maxage=300`. Reject ranges over the limit with 422.

## 9. Areas data: cover ALL of Uganda
Goal: the area search, naming and weekly stats must cover every district and major town in Uganda, not just Kampala.

### 9.1 `scripts/build-areas.mjs` (run once at build time, commit the output)
1. Download `https://download.geonames.org/export/dump/UG.zip`, unzip `UG.txt` (tab-separated GeoNames format: col0 id, col1 name, col4 lat, col5 lng, col6 feature class, col7 feature code, col14 population).
2. Keep a row if ANY of these is true:
   - feature code is `ADM2` (districts) or `ADM1`
   - feature code is `PPLC`, `PPLA`, `PPLA2`, `PPLA3`, `PPLA4`
   - feature class `P` (`PPL`, `PPLX`, `PPLL`, etc.) with population >= 5000
   - feature class `P` inside Greater Kampala box `lat 0.15..0.50, lng 32.40..32.80` (any population)
3. Clean: trim names, remove the word " District" from ADM2 names, dedupe by lowercase name + coordinates rounded to 2 decimals, drop names shorter than 3 characters.
4. Output `data/areas.json` as `[{ "name": "...", "lat": 0.0, "lng": 0.0, "type": "district|town|place", "pop": 0 }]`, sorted by pop descending, max 4000 entries.
5. If the download or parsing fails for any reason: copy `data/areas.starter.json` to `data/areas.json`, print a warning, exit 0.
6. GeoNames data is licensed CC BY 4.0: add "Place names: GeoNames (CC BY 4.0)" to the About modal credits.

### 9.2 `data/areas.starter.json` (create this file exactly; approximate centroids)
Kampala and Greater Kampala:
Kampala Central 0.3476,32.5825; Ntinda 0.3536,32.6128; Kamwokya 0.3400,32.5900; Kololo 0.3350,32.5900; Nakawa 0.3333,32.6167; Bugolobi 0.3167,32.6167; Muyenga 0.2967,32.6150; Ggaba 0.2500,32.6250; Nsambya 0.3000,32.5833; Makindye 0.2833,32.5833; Rubaga 0.3050,32.5500; Kawempe 0.3800,32.5600; Kisaasi 0.3667,32.6167; Kyanja 0.3900,32.6000; Najjera 0.3833,32.6500; Kira 0.4000,32.6400; Wakiso 0.4000,32.4594; Mukono 0.3533,32.7553; Entebbe 0.0512,32.4637; Namugongo 0.3900,32.6500; Bweyogerere 0.3600,32.6500; Kansanga 0.2850,32.6000; Lubaga 0.3050,32.5500; Mengo 0.3050,32.5600; Mulago 0.3400,32.5750; Wandegeya 0.3350,32.5700; Kabalagala 0.2950,32.5950; Namasuba 0.2650,32.5550; Kajjansi 0.2000,32.5500; Nansana 0.3600,32.5300; Gayaza 0.4500,32.6000; Seeta 0.3600,32.7200.
Central: Masaka -0.3136,31.7350; Mpigi 0.2250,32.3125; Mityana 0.4167,32.0500; Luwero 0.8500,32.4667; Mubende 0.5833,31.3667; Kayunga 0.7000,32.9000; Kalangala -0.3000,32.2900; Lyantonde -0.4000,31.1500; Rakai -0.7100,31.4000; Sembabule -0.0800,31.4600.
Eastern: Jinja 0.4244,33.2041; Iganga 0.6092,33.4686; Mbale 1.0821,34.1751; Tororo 0.6928,34.1810; Busia 0.4608,34.0911; Soroti 1.7147,33.6111; Kumi 1.4600,33.9400; Pallisa 1.1450,33.7100; Kapchorwa 1.4000,34.4500; Bugiri 0.5700,33.7500; Kamuli 0.9500,33.1200; Mayuge 0.4600,33.4800.
Northern: Gulu 2.7747,32.2990; Lira 2.2499,32.8999; Arua 3.0200,30.9100; Kitgum 3.2800,32.8800; Moyo 3.6500,31.7200; Adjumani 3.3700,31.7900; Apac 1.9800,32.5400; Pader 2.8000,33.0800; Nebbi 2.4800,31.0900; Kotido 3.0000,34.1100; Moroto 2.5300,34.6600; Amuru 2.8000,31.9000.
Western: Mbarara -0.6072,30.6545; Fort Portal 0.6710,30.2748; Kasese 0.1833,30.0833; Hoima 1.4331,31.3524; Masindi 1.6800,31.7200; Kabale -1.2490,29.9899; Kisoro -1.2850,29.6850; Bushenyi -0.5400,30.1900; Ntungamo -0.8800,30.2600; Rukungiri -0.8400,29.9400; Kabarole 0.6700,30.2700; Bundibugyo 0.7100,30.0600; Kyenjojo 0.6300,30.6400; Kibaale 0.8000,31.0700; Ibanda -0.1300,30.5000; Kiruhura -0.2000,30.8000.
Format: `[{"name":"Ntinda","lat":0.3536,"lng":32.6128,"type":"place","pop":0}, ...]`. Use type `place` for neighbourhoods, `town` for towns.

## 10. Screens and behaviour (Phase 1)

### 10.1 Layout (single page, mobile first, works from 360 px)
- **Top bar, 56 px:** wordmark "Banange" with tiny tagline; right side: share button, language toggle (EN | LG), theme toggle, info icon.
- **Map:** full screen under the bar; attribution bottom-left: "© OpenStreetMap contributors · OpenFreeMap".
- **Stats chip** under the top bar, centered: "{n} areas dark now" (hidden if the API fails). Empty state: "No dark spots reported. Enjoy it while it lasts."
- **Bottom dock:** two buttons side by side, min height 56 px, radius 16 px, 18 px semibold labels with icons. Left "Power is out here" (red), right "Power is back" (amber).
- **Area sheet:** drag handle above the dock opens a bottom sheet with tabs "Dark now" (areas dark now, with "since 18:42") and "This week" (ranked "Ntinda: 4 outages, about 11 h dark (est.)"). Footer text: "Community reports, not official data". Tapping an area flies the map there (zoom 13).
- **Tap a dot:** popover: area name, "Out since 18:42 (2 h 10 m)" or "Power back at 19:05", tag Confirmed/Unconfirmed, tag "Approximate location" if approximate, "{n} people reported". Times shown in Africa/Kampala (EAT).

### 10.2 Report flow
1. Tap a button -> immediately `navigator.geolocation.getCurrentPosition` (timeout 8000 ms, `enableHighAccuracy:false`, `maximumAge:60000`).
2. Success -> POST report with `loc_precision:'gps'` -> celebration.
3. Denied/timeout/unavailable -> open LocationPicker sheet: map with a draggable pin (starts at map centre), area text box with autocomplete from `/api/areas?q=` (selecting moves the pin, `loc_precision:'area'`), "Confirm location" button (`loc_precision:'pin'` when dragged manually). Helper text `loc_helper`.
4. On 429 show a calm message (`err_rate`, with minutes left). On 422 show `err_bounds`. On network error see 10.4. Never block or delay sending for animations.

### 10.3 "Is it back?" prompt
After a successful `out` report save `localStorage['banange_last_out'] = {lat,lng,loc_precision,at}`. On app open and on tab focus, if it exists and is under 6 h old and not snoozed, show a top banner `prompt_back_q` with `prompt_yes` / `prompt_no`. Yes -> send `back` using the saved location, clear the record. No -> snooze BACK_PROMPT_REASK_MIN minutes.

### 10.4 Offline queue (`lib/offlineQueue.ts`)
On network failure save the report to `localStorage['banange_queue']` (max 5, drop oldest) and show toast `offline_saved`. Retry in order on the `online` event and app open. Discard queued items older than OFFLINE_RETRY_MAX_MIN. Wrap all storage access in try/catch.

### 10.5 Celebrations (`CelebrationOverlay`)
- **After "out":** dimmed backdrop, centered card. Letters "E","E","H","H" pop in one at a time (150 ms stagger, scale 0.6 -> 1.15 -> 1), then "sorry" scales in below (the strings `out_title` / `out_sub`). Total about 1.5 s, auto-dismiss at 1.8 s, tap to dismiss. Then the map flies to the reported cell (800 ms) and a red pulse ring plays once.
- **After "back":** amber radial bloom expands from the Back button across the screen (700 ms), text `back_title` ("Weebale!") with `back_sub`; auto-dismiss at 1.5 s. The dot at that cell turns amber and fades.
- Reduced motion or Lite mode: no letter pops or bloom, just a text card fading in and out over 1.2 s.
- `navigator.vibrate(30)` on success when available and not Lite.
- Overlay has `role="status"` and is dismissible.

### 10.6 Lite mode (`lib/liteMode.ts`)
Auto on if `navigator.deviceMemory <= 2`, or `prefers-reduced-motion`, or `navigator.connection?.saveData`. Lite = no pulsing, no halo blur, no celebration animation, no sheet slide animation. Toggle in the About modal, saved in `localStorage['banange_lite']` (overrides auto).

### 10.7 About modal
Text (from i18n): disclaimer ("Banange shows community reports of power outages. It is not official data from UEDCL or any utility, and should not be used in emergencies."); privacy ("We round your location to about 500 m. We don't ask for your name, phone or email, and we don't store your IP address. To stop spam we keep an anonymous device code that can't be traced back to you."); contact `NEXT_PUBLIC_CONTACT_EMAIL`; credits ("Map data © OpenStreetMap contributors, tiles by OpenFreeMap. Place names: GeoNames (CC BY 4.0)."); Lite mode switch.

### 10.8 Share and previews
Share button: `navigator.share({title, text, url})`, fallback copy to clipboard with a toast. Text: "Banange: where's the power gone? Report and see outages across Uganda. https://banange.kuppelabs.com". Add Open Graph and Twitter `summary_large_image` meta using `/og.png`, plus `<meta name="theme-color">` per theme.

### 10.9 Analytics
`@vercel/analytics`, cookieless. Custom events only: `report_out`, `report_back`, `location_fallback_used`, `share_clicked`, `lite_mode_on`, `lang_lg`. No locations or IDs in events.

### 10.10 PWA basics
`public/manifest.webmanifest`: name "Banange", short_name "Banange", start_url "/", display "standalone", background_color "#0B1020", theme_color "#0B1020", icons 192 and 512 (generated). No service worker in v1.

### 10.11 Bot check (optional, enabled by env)
If `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set, load Cloudflare Turnstile in invisible/managed mode, attach `turnstile_token` to each report request. If the key is absent, skip entirely.

## 11. Design system

### Color tokens (CSS variables; set on `:root` for dark, `[data-theme="light"]` for light; Tailwind reads the variables)
Dark (default):
```
--bg:#0B1020  --surface:#121A30  --surface-2:#1A2442  --text:#E8ECF5  --muted:#8A94AD
--border:#26325A  --out:#FF4D4D  --out-glow:rgba(255,77,77,0.35)
--back:#FFB020  --back-glow:rgba(255,176,32,0.35)  --focus:#7CC4FF
```
Light:
```
--bg:#F7F4EE  --surface:#FFFFFF  --surface-2:#EFEAE0  --text:#14182B  --muted:#5A6275
--border:#D9D2C3  --out:#D92D2D  --out-glow:rgba(217,45,45,0.25)
--back:#E08A00  --back-glow:rgba(224,138,0,0.25)  --focus:#0A6CC4
```
Theme: default dark. Respect a saved choice in `localStorage['banange_theme']`; otherwise default dark. Set `data-theme` before first paint to avoid flash. Button labels on red/amber use `--bg` text in dark, white in light; verify contrast is at least 4.5:1.

### Look
Night-sky Uganda. No purple gradients, no stock card grids, no default-template feel. Generous spacing, strong type: wordmark in Bricolage Grotesque 700; body DM Sans; base 16 px, buttons 18 px, nothing under 14 px. Cards radius 16 px, subtle 1 px borders, soft glows only on dots and the two buttons.

### Map style (`lib/mapStyle.ts`)
- Style URL: `https://tiles.openfreemap.org/styles/positron`. Fetch the JSON.
- Light: tint background and land to `--bg` light.
- Dark: recolor the fetched style in code: `background` and land fills `#0B1020`; layers with "water" in the id `#0F1A33`; line layers (roads) `#1E2A4A`; boundary lines `#26325A`; symbol layers `text-color #8A94AD`, `text-halo-color #0B1020`. Hide minor-road and POI labels to keep it light and readable.
- Re-apply the style on theme toggle and keep the dot layers after style change (re-add sources and layers on `style.load`).
- Fallback if the style fetch fails: `https://demotiles.maplibre.org/style.json` plus a console warning.

### Dot layers (GeoJSON source, circle layers)
- Out + confirmed: inner circle 7 px `--out`; halo 22 px `--out-glow`, blur 0.8; halo radius pulses 18 -> 26 px over 2.4 s (cap 30 fps via requestAnimationFrame).
- Out + unconfirmed: inner circle 6 px `--out` at 60% opacity with a 1.5 px dashed-look ring (a second ring circle with transparent fill and stroke); no pulse.
- Restored: `--back` inner and halo, opacity = `fade` (1 -> 0 over 2 h).
- Lite: inner circles only. Not by color alone: confirmed vs unconfirmed also differ by ring and by the text tag.
- Map interactions: pinch zoom, pan, `cooperativeGestures` off, max zoom 16, min zoom 5, `maxBounds` = UGANDA_BOUNDS padded by 1 degree.

### Accessibility
Buttons have visible text and `aria-label`s; focus ring 3 px `--focus`; honour `prefers-reduced-motion`; no horizontal scroll; layout verified at 360 px and 768 px.

## 12. Copy (`messages/en.json`, `messages/lg.json`)
Default language: Luganda if `navigator.language` starts with `lg`, else English; saved in `localStorage['banange_lang']`. All Luganda values are DRAFTS: add `"_review": true` at the top of `lg.json` and list "Luganda needs native review before promotion" in the README known issues. Keep keys identical in both files (a test must enforce this).

| key | English | Luganda (draft) |
|---|---|---|
| tagline | UEDCL, eehh?? Where's the power? | UEDCL, eehh?? Amasannyalaze gali ludda wa? |
| btn_out | Power is out here | Amasannyalaze gabula wano |
| btn_back | Power is back | Amasannyalaze gadda |
| out_title | Eeehh… sorry | Eeehh… sorry nnyo |
| out_sub | Your report is in. | Okutegeeza kwo kutuuse. |
| back_title | Weebale! | Weebale nnyo! |
| back_sub | Thanks for telling your neighbours. | Weebale okutegeeza baliraanwa bo. |
| prompt_back_q | Is the power back at your place? | Amasannyalaze gaddeyo gy'oli? |
| prompt_yes | Yes, it's back | Yee, gadda |
| prompt_no | Not yet | Nedda, tegannadda |
| stats_dark_now | {n} areas dark now | Ebitundu {n} birimu ekizikiza kati |
| stats_none | No dark spots reported. Enjoy it while it lasts. | Tewali kizikiza kitegeezeddwa. Kyenyumirize nga kikyaliwo. |
| tab_now | Dark now | Ekizikiza kati |
| tab_week | This week | Wiiki eno |
| tag_confirmed | Confirmed | Kikakasiddwa |
| tag_unconfirmed | Unconfirmed | Tekinnakakasibwa |
| tag_approx | Approximate location | Ekifo kya kuteebereza |
| reporters_n | {n} people reported | Abantu {n} bategeezezza |
| disclaimer | Community reports, not official data | Okutegeeza kw'abantu, si bigambo bya UEDCL |
| loc_helper | Location is rounded to about 500 m. We don't store anything exact. | Ekifo kiwunyiddwa okutuuka ku mita 500. Tetuterekawo kifo kituufu. |
| loc_type_area | Type your area (e.g. Ntinda) | Wandiika ekitundu kyo (nga Ntinda) |
| loc_confirm | Confirm location | Kakasa ekifo |
| err_rate | You already reported that. Thank you, we've got it. Try again in {n} min. | Wamaze okutegeeza. Weebale, tukifunye. Gezaako nate oluvannyuma lwa edakiika {n}. |
| err_bounds | Banange only covers Uganda for now. | Banange ekola mu Uganda yokka kati. |
| err_generic | Something went wrong. Please try again. | Waliwo ekyagudde. Gezaako nate. |
| offline_saved | Saved. We'll send it when you're back online. | Kiterekeddwa. Tujja kukisindika ng'okomyewo ku mutimbagano. |
| about_title | About Banange | Ebikwata ku Banange |
| lite_mode | Lite mode (less animation) | Lite mode (okutambula okutono) |
| share | Share | Gabana |

Voice: cheeky only at celebrations and the empty state. Errors, privacy and legal text stay plain.

## 13. Tests (Vitest; all must pass)
- `cells.test.ts`: same point -> same cell; two points 100 m apart share a cell; `neighbours` returns 9 ids; saved coordinates have at most 3 decimals.
- `states.test.ts`:
  1. out, then nothing for 7 h -> expired, no open cell.
  2. out then back (1 device each) -> restored, cell shows `state:'restored'` with fade.
  3. 3 distinct devices out in the neighbourhood within 30 min -> confirmed; 1 back keeps it out; 2 backs restore it.
  4. out, back, out again -> a new episode.
  5. back with no out is ignored.
  6. flagged reports and blocked devices are ignored.
  7. unconfirmed with 2 devices stays unconfirmed.
  8. `fade` goes 1 -> 0 across 2 h.
- `areas.test.ts`: `nearestArea(0.3536,32.6128)` is "Ntinda"; a point in the far north returns a northern town (Gulu/Kitgum/Arua area), not a Kampala name; a point in the middle of Lake Victoria returns "Near ..."; `searchAreas("nt")` ranks "Ntinda" first.
- `i18n.test.ts`: `en.json` and `lg.json` have identical key sets.
- Report API test (call the route handler directly in DEV MODE): valid report -> 201; out-of-bounds -> 422; second identical report within 10 min -> 429; 21st report in a day -> 429; blocked device -> 201 but nothing stored.

## 14. Phase 2: History (build only after Phase 1 passes)
- Add `TimeSlider` under the map: range input from "now" back 7 days, 15-minute steps, label in EAT ("Sat 14:30").
- While scrubbing, request `/api/map/history` (debounce 300 ms) for the visible window and render the snapshot nearest to the slider time. Return to "Live" with a button.
- Play button: animates the last 24 hours at 2 snapshots per second using one `/api/map/history?from=now-24h&to=now&step=30` call. Pause/stop controls; disabled in Lite mode (slider still works).
- Weekly area stats keep using live data.

## 15. Phase 3: Night glow (build only after Phase 2 passes)
- A "Night view" toggle (dark theme only): `pitch: 55`, `bearing: -12`, max pitch 60.
- "City lights" layer: circle layer from `areas.json` points with `pop > 20000` (and all districts with a small size), warm white/amber glow, radius scaled by `sqrt(pop)`, blur 1.
- Dark cells render over the lights as red glows; restored cells briefly amber. Time slider drives both (Phase 2 data). Provide a "Flat view" toggle to go back. Disabled automatically in Lite mode.

## 16. Generated assets (`scripts/make-images.mjs`, using `sharp`)
Create from an inline SVG: `public/og.png` (1200x630: background `#0B1020`, a subtle Uganda-shaped scatter of glowing red and amber dots, the wordmark "Banange" in white and the tagline underneath), `public/icon-192.png`, `public/icon-512.png`, and `public/favicon.svg` (a glowing red dot on `#0B1020`). Run once and commit the output. If `sharp` fails to install, create simple solid-background PNGs with a text label and log a warning.

## 17. README.md must contain
- What Banange is, how to run (`npm run dev`), tests (`npm test`), `npm run build:areas`, `npm run make:images`.
- Env vars table and DEV MODE explanation.
- "Human steps to go live" (the owner does these):
  1. Create a Supabase project, run `supabase/migrations/001_init.sql` in the SQL editor, copy the URL and service_role key.
  2. Set env vars in `.env.local` and in Vercel (Production and Preview); `DEVICE_SALT` from `openssl rand -hex 32`.
  3. Push to GitHub, import into Vercel, deploy.
  4. Vercel > Project Settings > Domains > add `banange.kuppelabs.com`, add the CNAME that Vercel shows at the DNS provider.
  5. Enable Vercel Web Analytics.
  6. Optional: create a Cloudflare Turnstile site and set the two Turnstile env vars.
- Admin SQL:
```sql
update reports set flagged = true where device_hash = '<hash>';
insert into blocked_devices (device_hash, reason) values ('<hash>', 'spam');
select device_hash, count(*) from reports where created_at > now() - interval '24 hours' group by 1 order by 2 desc limit 20;
delete from reports where created_at < now() - interval '180 days';
```
- "Decisions made" and "Known issues" (include: Luganda drafts need native review; Vercel Hobby is non-commercial only).

## 18. Phase 1 acceptance checklist (tick all before moving on)
- [ ] `npm run build` succeeds with no TypeScript errors; `npm test` all green
- [ ] Runs locally with NO env vars (DEV MODE badge visible)
- [ ] Location allowed: two taps -> "out" report -> sorry animation -> dot appears
- [ ] Location blocked: picker opens, typing "Gulu" or "Ntinda" autocompletes and moves the pin; report saves as 'area' and shows "Approximate location"
- [ ] Searching a far-away district (for example "Kabale", "Moroto", "Arua") works
- [ ] Second identical report within 10 min shows the calm rate-limit message
- [ ] Airplane-mode report queues and sends on reconnect
- [ ] "Is it back?" banner appears on reopen; "Yes" turns the dot amber and fades
- [ ] Dark/light toggle persists and restyles the map; EN/LG toggle persists
- [ ] Lite mode removes pulsing and celebration animations
- [ ] About modal shows disclaimer, privacy text and credits
- [ ] Share works; OG tags present; manifest valid
- [ ] No exact coordinates, IPs or raw device ids appear in the database or logs
- [ ] Layout has no horizontal scroll at 360 px
