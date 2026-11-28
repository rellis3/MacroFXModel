// scripts/level-engine-shot.mjs: opens the real Desk Terminal in headless Chromium as the owner against the LIVE data, opens Insight > Level engine,
// types a level and a second level (a little either side of the price, in units of the day's sigma) and saves screenshots; then runs the REACH command.
// Not part of CI (needs a browser and the network). Every /api/ call goes to the live site, read-only; the page's own files are served from this checkout.
//   PW_CORE=<node_modules/playwright-core> CHROME=<chrome.exe> node scripts/level-engine-shot.mjs [outDir]   (env: INST=EURUSD WIDTHS=1440,390 THEMES=default,daylight)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE || 'playwright-core');
const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const OUT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(ROOT, 'scratch_level_engine');
const LIVE = process.env.LIVE || 'https://macrofxmodel-production.up.railway.app';
const INST = process.env.INST || 'EURUSD';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const owner = { ok: true, role: 'owner', auth: true };
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname === '/api/desk-session') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(owner)); }
    if (u.pathname === '/api/desk-access') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ ok: true, role: 'owner', schema: 2, visible: [], saved: {} })); }
    if (u.pathname.startsWith('/api/')) {
      const r = await fetch(LIVE + req.url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(90000) });
      res.statusCode = r.status; res.setHeader('content-type', r.headers.get('content-type') ?? 'application/json'); return res.end(Buffer.from(await r.arrayBuffer()));
    }
    const f = path.join(ROOT, decodeURIComponent(u.pathname === '/' ? '/desk-terminal.html' : u.pathname));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end('nf'); }
    res.setHeader('content-type', MIME[path.extname(f)] ?? 'application/octet-stream'); res.end(fs.readFileSync(f));
  } catch (e) { res.statusCode = 502; res.end(String(e)); }
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true });
const log = [];
for (const theme of (process.env.THEMES ?? 'default,daylight').split(',')) {
  for (const width of (process.env.WIDTHS ?? '1440,390').split(',').map(Number)) {
    const ctx = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(t => { try { localStorage.setItem('deskTheme', t); localStorage.setItem('deskInsight:v1', 'reach'); } catch { /* none */ } }, theme);
    const page = await ctx.newPage();
    page.on('pageerror', e => log.push(`PAGEERROR ${theme} ${width}: ${String(e).slice(0, 200)}`));
    await page.goto(base + '/desk-terminal.html#insight', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    const nav = page.locator('button[data-t="insight"]').first(); if (await nav.count()) await nav.click().catch(() => {});
    await page.waitForTimeout(1000);
    await page.locator('.in-tab[data-p="reach"]').first().click().catch(e => log.push(`no pill: ${e.message}`));
    await page.waitForSelector('#le-level', { timeout: 60000 }).catch(e => log.push(`no level box: ${e.message}`));
    await page.fill('#le-sym', INST).catch(() => {}); await page.dispatchEvent('#le-sym', 'change').catch(() => {});
    await page.waitForTimeout(6000);
    // a level 0.6 sigma above and a second 0.8 sigma below, from the ladder the card draws (its buttons hold the prices)
    const up = await page.$$eval('#le-out [data-level]', els => els.map(e => +e.dataset.level));
    if (up.length >= 12) {
      const sorted = [...new Set(up)].sort((a, b) => a - b), mid = sorted.length / 2;
      await page.fill('#le-level', String(sorted[mid + 1])); await page.waitForTimeout(500);
      await page.fill('#le-level2', String(sorted[mid - 2])); await page.waitForTimeout(2500);
    } else log.push(`${theme} ${width}: the ladder did not draw (${up.length} prices)`);
    const txt = await page.$eval('#le-out', e => e.innerText.slice(0, 1600)).catch(() => 'no #le-out');
    const chips = await page.$$eval('#le-out .in-vd', els => els.map(e => e.textContent));
    const doc = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: document.documentElement.clientWidth }));
    log.push(`${theme} ${width}: chips ${chips.length} [${[...new Set(chips)].join(', ')}], page ${doc.sw}/${doc.iw}\n${txt.replace(/\n+/g, ' | ').slice(0, 900)}`);
    await page.screenshot({ path: path.join(OUT, `level-engine_${theme}_${width}.png`), fullPage: true }).catch(() => {});
    if (theme === 'default' && width >= 1000) {   // the command line: REACH <market> <price> EOW
      const lvl = up.length ? [...new Set(up)].sort((a, b) => a - b).at(-2) : null;
      await page.keyboard.press('/'); await page.waitForTimeout(600);
      await page.keyboard.type(`reach ${INST.toLowerCase()} ${lvl} eow`); await page.waitForTimeout(400); await page.keyboard.press('Enter'); await page.waitForTimeout(4000);
      const st = await page.evaluate(() => ({ level: document.querySelector('#le-level')?.value, on: document.querySelector('[data-hz].on')?.dataset.hz, head: document.querySelector('.le-head')?.innerText }));
      log.push(`REACH command -> level box ${st.level}, horizon ${st.on}, headline ${String(st.head).replace(/\n/g, ' ')}`);
      await page.screenshot({ path: path.join(OUT, `level-engine_cmd_${width}.png`), fullPage: false }).catch(() => {});
    }
    await ctx.close();
  }
}
for (const l of log) console.log(l);
await browser.close(); server.close();
