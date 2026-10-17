import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const distDir = path.join(root, 'node_modules', 'maplibre-gl', 'dist');
const publicDir = path.join(root, 'public');

if (fs.existsSync(distDir)) {
  const cspWorker = path.join(distDir, 'maplibre-gl-csp-worker.js');
  const workerMjs = path.join(distDir, 'maplibre-gl-worker.mjs');
  const targetCsp = path.join(publicDir, 'maplibre-gl-csp-worker.js');
  const targetMjs = path.join(publicDir, 'maplibre-gl-worker.mjs');

  const src = fs.existsSync(cspWorker) ? cspWorker : workerMjs;
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, targetCsp);
    if (fs.existsSync(workerMjs)) {
      fs.copyFileSync(workerMjs, targetMjs);
    }
    console.log('MapLibre worker successfully copied to public/');
  }
}
