// Development benchmark: hover work and DOM writes, not a device-independent FPS claim.
const { chromium } = require('playwright');
const { readFile } = require('node:fs/promises');
const { resolve } = require('node:path');
const { createServer } = require('node:http');

(async () => {
  const source = resolve(process.argv[2] || resolve(__dirname, '..', 'index.html'));
  const html = await readFile(source);
  const server = createServer((_, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); });
  let browser;
  try {
    await new Promise(done => server.listen(0, '127.0.0.1', done));
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => window.SIM);
    await page.evaluate(() => { clearInterval(LIVE.timer); setMode('free', pClone(pracRef())); });
    await page.waitForTimeout(100);
    const result = await page.evaluate(async () => {
      const stats = {};
      for (const name of ['renderOver', 'renderWorld', 'wirePts', 'basePts', 'tieGeo', 'deform', 'bigLabels', 'hoverHL']) {
        const f = eval(name); stats[name] = { calls: 0, ms: 0 };
        eval(`${name} = function(...args) { const start = performance.now(); try { return f(...args); } finally { stats[name].calls++; stats[name].ms += performance.now() - start; } }`);
      }
      const measure = tool => {
        setTool(tool); UI.overBoard = true; const samples = [];
        for (let i = 0; i < 50; i++) {
          UI.pointer = { x: 900 + (i % 10) * 12, y: 430 + (i % 5) * 6 };
          const start = performance.now(); renderOver(); samples.push(performance.now() - start);
        }
        samples.sort((a, b) => a - b);
        return { medianMs: +samples[25].toFixed(2), p95Ms: +samples[47].toFixed(2) };
      };
      const hand = measure('hand'), wire = measure('wire');
      let unchangedOverlayWrites = 0;
      const observer = new MutationObserver(records => unchangedOverlayWrites += records.length);
      observer.observe(gOver, { childList: true });
      for (let i = 0; i < 20; i++) renderOver();
      await new Promise(done => setTimeout(done, 0)); observer.disconnect();
      for (const stat of Object.values(stats)) stat.ms = +stat.ms.toFixed(2);
      return { hand, wire, stats, unchangedOverlayWrites, worldNodes: gWorld.querySelectorAll('*').length };
    });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } finally {
    await browser?.close(); if (server.listening) await new Promise(done => server.close(done));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
