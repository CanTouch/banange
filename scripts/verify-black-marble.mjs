import fs from 'node:fs';

async function connectWithRetry(url, maxAttempts = 15, delayMs = 500) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const socket = new WebSocket(url);
      await new Promise((resolve, reject) => {
        socket.onopen = resolve;
        socket.onerror = reject;
      });
      return socket;
    } catch {
      if (attempt === maxAttempts) throw new Error('Failed to connect after ' + maxAttempts + ' attempts');
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

let ws;
let idCounter = 1;
function send(method, params = {}) {
  const id = idCounter++;
  return new Promise((resolve, reject) => {
    const handler = (event) => {
      const data = JSON.parse(event.data);
      if (data.id === id) {
        ws.removeEventListener('message', handler);
        if (data.error) reject(data);
        else resolve(data.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

const ARTIFACT_DIR = '/home/orich/.gemini/antigravity/brain/71277087-cd5e-4473-9388-ea501ebcdf21';

async function main() {
  ws = await connectWithRetry('ws://127.0.0.1:9222/session');
  console.log('[TEST] WebSocket connected!');

  const consoleErrors = [];

  try {
    console.log('[TEST] Starting BiDi session...');
    await send('session.new', { capabilities: {} });

    await send('session.subscribe', { events: ['log.entryAdded'] });
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'log.entryAdded') {
        const { level, text } = msg.params;
        if (level === 'error') {
          consoleErrors.push(text);
          console.error('[BROWSER ERROR]', text);
        }
      }
    });

    const tree = await send('browsingContext.getTree', {});
    const context = tree.contexts[0].context;

    // 1. Mobile Viewport: 360 x 740
    console.log('[TEST 1] Setting viewport to 360 x 740 mobile...');
    await send('browsingContext.setViewport', {
      context,
      viewport: { width: 360, height: 740 },
    });

    console.log('[TEST 1] Navigating to http://127.0.0.1:3000 ...');
    await send('browsingContext.navigate', {
      context,
      url: 'http://127.0.0.1:3000',
      wait: 'complete',
    });

    await send('script.evaluate', {
      target: { context },
      expression: `localStorage.setItem('banange_theme', 'dark'); document.documentElement.setAttribute('data-theme', 'dark');`,
      awaitPromise: true,
      returnByValue: true,
    });

    // Wait 3.5s for map tiles and styles
    await new Promise((r) => setTimeout(r, 3500));

    // Inspect elements
    const mapInspect = await send('script.evaluate', {
      target: { context },
      expression: `
        (() => {
          const wordmark = document.querySelector('header span.font-serif')?.textContent;
          const statusLine = document.querySelector('main p.font-mono')?.textContent;
          const headline = document.querySelector('main div.font-serif')?.textContent;
          const canvas = document.querySelector('canvas.maplibregl-canvas');
          const buttons = Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim()).filter(Boolean);
          const hasOutBtn = buttons.some(b => b.includes('Power is out here') || b.includes('out'));
          const hasBackBtn = buttons.some(b => b.includes('Power is back') || b.includes('back'));

          return {
            wordmark,
            statusLine,
            headline,
            hasCanvas: Boolean(canvas),
            hasOutBtn,
            hasBackBtn
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });
    console.log('Mobile Map Inspection:', JSON.stringify(mapInspect));

    let shot = await send('browsingContext.captureScreenshot', { context });
    fs.writeFileSync(`${ARTIFACT_DIR}/black_marble_map_360px.png`, Buffer.from(shot.data, 'base64'));
    console.log('Saved black_marble_map_360px.png');

    // 2. Test Warm Paper Light Mode Toggle
    console.log('\n[TEST 2] Testing Theme Toggle to Warm Paper...');
    const clickRes = await send('script.evaluate', {
      target: { context },
      expression: `
        (() => {
          const initialTheme = document.documentElement.getAttribute('data-theme');
          const savedLocal = localStorage.getItem('banange_theme');
          const themeBtn = document.querySelector('button[aria-label="Toggle theme"]');
          if (themeBtn) {
            themeBtn.click();
            return {
              initialTheme,
              savedLocal,
              clicked: true,
              afterClickTheme: document.documentElement.getAttribute('data-theme'),
              newSaved: localStorage.getItem('banange_theme')
            };
          }
          return { clicked: false, buttons: Array.from(document.querySelectorAll('button')).map(b => b.getAttribute('aria-label') || b.textContent) };
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });
    console.log('Theme toggle click response:', JSON.stringify(clickRes));
    await new Promise((r) => setTimeout(r, 2000));

    shot = await send('browsingContext.captureScreenshot', { context });
    fs.writeFileSync(`${ARTIFACT_DIR}/warm_paper_light_360px.png`, Buffer.from(shot.data, 'base64'));
    console.log('Saved warm_paper_light_360px.png');

    // Toggle back to dark theme
    await send('script.evaluate', {
      target: { context },
      expression: `
        (() => {
          const themeBtn = document.querySelector('button[aria-label="Toggle theme"]');
          if (themeBtn) themeBtn.click();
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });
    await new Promise((r) => setTimeout(r, 1500));

    // 3. Desktop Viewport (1200 x 780)
    console.log('\n[TEST 3] Desktop Viewport 1200 x 780...');
    await send('browsingContext.setViewport', {
      context,
      viewport: { width: 1200, height: 780 },
    });
    await new Promise((r) => setTimeout(r, 1500));

    shot = await send('browsingContext.captureScreenshot', { context });
    fs.writeFileSync(`${ARTIFACT_DIR}/black_marble_map_desktop.png`, Buffer.from(shot.data, 'base64'));
    console.log('Saved black_marble_map_desktop.png');

    // 4. Insights Screen at 1200px
    console.log('\n[TEST 4] Navigating to http://127.0.0.1:3000/insights ...');
    await send('browsingContext.navigate', {
      context,
      url: 'http://127.0.0.1:3000/insights',
      wait: 'complete',
    });
    await new Promise((r) => setTimeout(r, 2500));

    const insightsInspect = await send('script.evaluate', {
      target: { context },
      expression: `
        (() => {
          const title = document.querySelector('h1.font-serif')?.textContent;
          const statNumbers = Array.from(document.querySelectorAll('p.font-serif')).map(p => p.textContent);
          const hasDotGrid = Boolean(document.querySelector('pattern#dot-grid'));
          const heatmapDates = Array.from(document.querySelectorAll('th.font-mono')).map(th => th.textContent?.trim());
          return {
            title,
            statNumbers,
            hasDotGrid,
            sampleDates: heatmapDates.slice(0, 5)
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });
    console.log('Insights Inspection:', JSON.stringify(insightsInspect));

    shot = await send('browsingContext.captureScreenshot', { context });
    fs.writeFileSync(`${ARTIFACT_DIR}/black_marble_insights_desktop.png`, Buffer.from(shot.data, 'base64'));
    console.log('Saved black_marble_insights_desktop.png');

    // 5. Insights Screen at 360px mobile
    console.log('\n[TEST 5] Insights at 360 x 740 mobile...');
    await send('browsingContext.setViewport', {
      context,
      viewport: { width: 360, height: 740 },
    });
    await new Promise((r) => setTimeout(r, 1500));

    shot = await send('browsingContext.captureScreenshot', { context });
    fs.writeFileSync(`${ARTIFACT_DIR}/black_marble_insights_360px.png`, Buffer.from(shot.data, 'base64'));
    console.log('Saved black_marble_insights_360px.png');

    console.log('\n=== REAL BROWSER AUDIT COMPLETE ===');
    console.log('Total console error count:', consoleErrors.length);

    if (ws) ws.close();
    process.exit(0);
  } catch (err) {
    console.error('Fatal test error:', err);
    if (ws) ws.close();
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unhandled script error:', err);
  process.exit(1);
});
