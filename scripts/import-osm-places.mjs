import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 1. Load .env.local
const envLocalPath = path.join(rootDir, '.env.local');
if (fs.existsSync(envLocalPath)) {
  const envContent = fs.readFileSync(envLocalPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"](.*)['"]$/, '$1');
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

// 2. Normalization function matching requirement 3
export function normalizePlaceName(name) {
  if (!name) return '';
  let s = name.toLowerCase().trim();
  // Strip "parts of"
  s = s.replace(/^parts?\s+of\s+/i, '');
  // Strip punctuation (replace with space to preserve word boundaries)
  s = s.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'’]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  // Strip trailing words: tc, town council, town, trading centre, rd, road, ltd, hill, estate, quarters, substation, village, market
  const trailingRegex =
    /(?:\s+|^)(?:tc|town\s+council|town|trading\s+cent(?:re|er)|rd|road|ltd|hill|estate|quarters|substation|village|market)$/i;
  while (trailingRegex.test(s)) {
    s = s.replace(trailingRegex, '').trim();
  }
  return s;
}

// 3. Point-in-polygon district resolution
const districtsPath = path.join(rootDir, 'data', 'districts.json');
let districtsData = null;
if (fs.existsSync(districtsPath)) {
  districtsData = JSON.parse(fs.readFileSync(districtsPath, 'utf8'));
}

function pointInPolygon(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect = yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInFeature(pt, feature) {
  const geom = feature.geometry;
  if (geom.type === 'Polygon') {
    if (!pointInPolygon(pt, geom.coordinates[0])) return false;
    for (let i = 1; i < geom.coordinates.length; i++) {
      if (pointInPolygon(pt, geom.coordinates[i])) return false;
    }
    return true;
  } else if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) {
      if (pointInPolygon(pt, poly[0])) {
        let inHole = false;
        for (let i = 1; i < poly.length; i++) {
          if (pointInPolygon(pt, poly[i])) {
            inHole = true;
            break;
          }
        }
        if (!inHole) return true;
      }
    }
  }
  return false;
}

function resolveDistrict(lat, lng) {
  if (!districtsData || !districtsData.features) return null;
  const pt = [lng, lat];
  for (const f of districtsData.features) {
    const bbox = f.properties.bbox;
    if (bbox && (lng < bbox[0] || lat < bbox[1] || lng > bbox[2] || lat > bbox[3])) {
      continue;
    }
    if (pointInFeature(pt, f)) {
      return f.properties.name;
    }
  }
  return null;
}

const ALLOWED_KINDS = new Set([
  'city',
  'town',
  'suburb',
  'neighbourhood',
  'quarter',
  'village',
  'hamlet',
  'locality',
]);

const OVERPASS_ENDPOINTS = [
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

async function fetchFromOverpass() {
  const query = `[out:json][timeout:180];
node["place"~"^(city|town|suburb|neighbourhood|quarter|village|hamlet|locality)$"]["name"](-1.5,29.5,4.3,35.1);
out body;`;

  for (const ep of OVERPASS_ENDPOINTS) {
    console.log(`Querying Overpass endpoint: ${ep}...`);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);

      const res = await fetch(ep, {
        method: 'POST',
        headers: {
          'User-Agent': 'BanangeImporter/1.0 (+https://banange.kuppelabs.com; banange@kuppelabs.com)',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'data=' + encodeURIComponent(query),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        console.warn(`Endpoint ${ep} returned HTTP ${res.status}. Trying next...`);
        continue;
      }

      const json = await res.json();
      if (Array.isArray(json.elements) && json.elements.length > 0) {
        console.log(`Successfully fetched ${json.elements.length} elements from ${ep}.`);
        return json.elements;
      }
    } catch (err) {
      console.warn(`Endpoint ${ep} failed: ${err.message}. Trying next...`);
    }
  }

  throw new Error('All Overpass endpoints failed or timed out.');
}

async function run() {
  console.log('--- OpenStreetMap Uganda Places Importer ---');

  // 1. Fetch raw nodes
  const rawElements = await fetchFromOverpass();

  // 2. Filter & parse records
  console.log('Parsing and resolving districts...');
  const places = [];
  const seenOsmIds = new Set();
  const kindCounts = {};

  for (const kind of ALLOWED_KINDS) {
    kindCounts[kind] = 0;
  }

  let outsideUgandaCount = 0;

  for (const el of rawElements) {
    if (!el || !el.tags || !el.tags.name) continue;
    const kind = (el.tags.place || '').toLowerCase().trim();
    if (!ALLOWED_KINDS.has(kind)) continue;

    const osmId = el.id;
    if (seenOsmIds.has(osmId)) continue;
    seenOsmIds.add(osmId);

    const lat = Number(el.lat);
    const lng = Number(el.lon);
    if (isNaN(lat) || isNaN(lng)) continue;

    // Check if inside Uganda district
    const district =
      el.tags['addr:district'] ||
      el.tags['is_in:district'] ||
      el.tags.district ||
      resolveDistrict(lat, lng);

    if (!district) {
      outsideUgandaCount++;
      continue;
    }

    const name = el.tags.name.trim();
    const normalized = normalizePlaceName(name);
    if (!normalized) continue;

    kindCounts[kind] = (kindCounts[kind] || 0) + 1;

    places.push({
      osm_id: osmId,
      name,
      normalized_name: normalized,
      kind,
      district,
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      source: 'osm',
    });
  }

  console.log('\n=== Places imported per kind ===');
  for (const [k, count] of Object.entries(kindCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(16)}: ${count.toLocaleString()}`);
  }
  console.log(`  ----------------`);
  console.log(`  Total in Uganda : ${places.length.toLocaleString()}`);
  console.log(`  Filtered out (outside Uganda): ${outsideUgandaCount.toLocaleString()}`);

  // 3. Save local JSON cache for matching & fallback (gitignored)
  const cachePath = path.join(rootDir, 'data', 'places.osm.json');
  fs.writeFileSync(cachePath, JSON.stringify(places), 'utf8');
  console.log(`\nSaved ${places.length} parsed places to local cache: data/places.osm.json`);

  // 4. Upsert into Supabase places table
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.warn('\nSUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured. Skipping remote database upsert.');
    return;
  }

  const cleanUrl = supabaseUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
  const supabase = createClient(cleanUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log('\nUpserting into Supabase public.places table in batches of 500...');
  const batchSize = 500;
  let upsertedCount = 0;
  let tableMissing = false;

  for (let i = 0; i < places.length; i += batchSize) {
    const batch = places.slice(i, i + batchSize);
    const { error } = await supabase.from('places').upsert(batch, { onConflict: 'osm_id' });

    if (error) {
      if (error.code === 'PGRST205' || error.message?.includes('schema cache')) {
        console.warn('\nNotice: Table "public.places" does not exist yet in Supabase schema cache.');
        console.warn('Please execute "supabase/migrations/006_places.sql" in Supabase SQL editor.');
        tableMissing = true;
        break;
      } else {
        console.error(`Batch ${i / batchSize + 1} upsert error:`, error.message);
        break;
      }
    }
    upsertedCount += batch.length;
    if ((i / batchSize + 1) % 10 === 0 || i + batchSize >= places.length) {
      console.log(`Upserted ${upsertedCount.toLocaleString()} / ${places.length.toLocaleString()} rows...`);
    }
  }

  if (!tableMissing) {
    console.log(`\nDone! Successfully upserted ${upsertedCount.toLocaleString()} places into Supabase.`);
  }
}

// Run if executed directly
if (process.argv[1] && process.argv[1].endsWith('import-osm-places.mjs')) {
  run().catch((err) => {
    console.error('Fatal import error:', err);
    process.exit(1);
  });
}
