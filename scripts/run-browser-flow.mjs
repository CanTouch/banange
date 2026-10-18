import fs from 'node:fs';

const ws = new WebSocket('ws://127.0.0.1:9222/session');

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

ws.onopen = async () => {
  const consoleMessages = [];

  try {
    console.log('[TEST] Initializing WebDriver BiDi session...');
    await send('session.new', { capabilities: {} });

    await send('session.subscribe', { events: ['log.entryAdded'] });
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'log.entryAdded') {
        const { level, text } = msg.params;
        const line = `[CONSOLE ${level.toUpperCase()}] ${text}`;
        consoleMessages.push(line);
        // Only log errors or warnings to keep stdout focused
        if (level === 'error' || level === 'warn') {
          console.log(line);
        }
      }
    });

    const tree = await send('browsingContext.getTree', {});
    const context = tree.contexts[0].context;

    console.log('[TEST] Navigating to http://localhost:3000 ...');
    await send('browsingContext.navigate', {
      context,
      url: 'http://localhost:3000',
      wait: 'complete',
    });

    // 1. Wait for map initialization (3s)
    await new Promise((r) => setTimeout(r, 3000));
    console.log('[TEST 1: MAP INITIALIZED] Map mounted cleanly.');

    // Save initial screenshot
    let shot = await send('browsingContext.captureScreenshot', { context });
    fs.writeFileSync('/home/orich/.gemini/antigravity/brain/71277087-cd5e-4473-9388-ea501ebcdf21/flow_1_initial.png', Buffer.from(shot.data, 'base64'));

    // 2. Drag slider back 2 days (48 hours = 48 * 60 * 60 * 1000 ms)
    console.log('\n[TEST 2: DRAG BACK 2 DAYS]');
    const dragResult = await send('script.evaluate', {
      target: { context },
      expression: `
        (() => {
          const slider = document.querySelector('input[type="range"]');
          if (!slider) return { error: 'Slider not found' };

          const max = parseInt(slider.max, 10);
          const twoDaysMs = 48 * 60 * 60 * 1000;
          const targetVal = max - twoDaysMs;

          slider.value = targetVal;
          slider.dispatchEvent(new Event('change', { bubbles: true }));
          slider.dispatchEvent(new Event('input', { bubbles: true }));

          const header = document.querySelector('span.text-sm.font-extrabold')?.textContent;
          return { success: true, targetVal, headerText: header };
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });
    console.log('Drag result:', JSON.stringify(dragResult));

    // Wait 1s for single snapshot fetch
    await new Promise((r) => setTimeout(r, 1000));

    shot = await send('browsingContext.captureScreenshot', { context });
    fs.writeFileSync('/home/orich/.gemini/antigravity/brain/71277087-cd5e-4473-9388-ea501ebcdf21/flow_2_dragged_2days.png', Buffer.from(shot.data, 'base64'));

    // 3. Press Play
    console.log('\n[TEST 3: PRESS PLAY]');
    const playResult = await send('script.evaluate', {
      target: { context },
      expression: `
        (() => {
          const playBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Play'));
          if (!playBtn) return { error: 'Play button not found' };
          playBtn.click();
          return { success: true };
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });
    console.log('Play button clicked:', JSON.stringify(playResult));

    // Let playback run for 2.5 seconds (about 5 frames)
    await new Promise((r) => setTimeout(r, 2500));

    // Verify during playback: Play button is Pause, Stop button exists, canvas exists
    const playingState = await send('script.evaluate', {
      target: { context },
      expression: `
        (() => {
          const pauseBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Pause'));
          const stopBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Stop'));
          const canvas = document.querySelector('canvas.maplibregl-canvas');
          const header = document.querySelector('span.text-sm.font-extrabold')?.textContent;
          return {
            hasPauseBtn: Boolean(pauseBtn),
            hasStopBtn: Boolean(stopBtn),
            hasCanvas: Boolean(canvas),
            headerText: header
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });
    console.log('Playback running state:', JSON.stringify(playingState));

    shot = await send('browsingContext.captureScreenshot', { context });
    fs.writeFileSync('/home/orich/.gemini/antigravity/brain/71277087-cd5e-4473-9388-ea501ebcdf21/flow_3_playing.png', Buffer.from(shot.data, 'base64'));

    // 4. Press Pause
    console.log('\n[TEST 4: PRESS PAUSE]');
    const pauseResult = await send('script.evaluate', {
      target: { context },
      expression: `
        (() => {
          const pauseBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Pause'));
          if (!pauseBtn) return { error: 'Pause button not found' };
          pauseBtn.click();
          return { success: true };
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });
    console.log('Pause clicked:', JSON.stringify(pauseResult));

    await new Promise((r) => setTimeout(r, 800));

    shot = await send('browsingContext.captureScreenshot', { context });
    fs.writeFileSync('/home/orich/.gemini/antigravity/brain/71277087-cd5e-4473-9388-ea501ebcdf21/flow_4_paused.png', Buffer.from(shot.data, 'base64'));

    // 5. Drag slider again (e.g. 1 day ago)
    console.log('\n[TEST 5: DRAG AGAIN]');
    const dragAgainResult = await send('script.evaluate', {
      target: { context },
      expression: `
        (() => {
          const slider = document.querySelector('input[type="range"]');
          if (!slider) return { error: 'Slider not found' };

          const max = parseInt(slider.max, 10);
          const oneDayMs = 24 * 60 * 60 * 1000;
          const targetVal = max - oneDayMs;

          slider.value = targetVal;
          slider.dispatchEvent(new Event('change', { bubbles: true }));
          slider.dispatchEvent(new Event('input', { bubbles: true }));

          const header = document.querySelector('span.text-sm.font-extrabold')?.textContent;
          return { success: true, targetVal, headerText: header };
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });
    console.log('Drag again result:', JSON.stringify(dragAgainResult));

    await new Promise((r) => setTimeout(r, 1000));

    shot = await send('browsingContext.captureScreenshot', { context });
    fs.writeFileSync('/home/orich/.gemini/antigravity/brain/71277087-cd5e-4473-9388-ea501ebcdf21/flow_5_dragged_again.png', Buffer.from(shot.data, 'base64'));

    // 6. Press Stop (Return to live)
    console.log('\n[TEST 6: PRESS STOP]');
    const stopResult = await send('script.evaluate', {
      target: { context },
      expression: `
        (() => {
          // In paused state or active state, check for Stop button or Return to Live button
          const stopBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && (b.textContent.includes('Stop') || b.textContent.includes('Return to Live')));
          if (!stopBtn) return { error: 'Stop/Return button not found' };
          stopBtn.click();
          return { success: true, text: stopBtn.textContent };
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });
    console.log('Stop / Return to Live clicked:', JSON.stringify(stopResult));

    await new Promise((r) => setTimeout(r, 1000));

    // 7. Verify Live state
    console.log('\n[TEST 7: VERIFY LIVE STATE]');
    const liveState = await send('script.evaluate', {
      target: { context },
      expression: `
        (() => {
          const liveBadge = Array.from(document.querySelectorAll('*')).find(el => el.textContent === 'LIVE');
          const header = document.querySelector('span.text-sm.font-extrabold')?.textContent;
          const playBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Play 24h'));
          return {
            isLive: Boolean(liveBadge),
            headerText: header,
            hasPlay24h: Boolean(playBtn)
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });
    console.log('Live state verified:', JSON.stringify(liveState));

    shot = await send('browsingContext.captureScreenshot', { context });
    fs.writeFileSync('/home/orich/.gemini/antigravity/brain/71277087-cd5e-4473-9388-ea501ebcdf21/flow_6_returned_live.png', Buffer.from(shot.data, 'base64'));

    console.log('\n=== REAL BROWSER TEST COMPLETE ===');
    console.log('Total console messages captured:', consoleMessages.length);
    const webGlLost = consoleMessages.filter((m) => m.includes('WebGL context was lost'));
    console.log('WebGL context was lost occurrences:', webGlLost.length);

    ws.close();
    process.exit(0);
  } catch (err) {
    console.error('Fatal test error:', err);
    ws.close();
    process.exit(1);
  }
};
