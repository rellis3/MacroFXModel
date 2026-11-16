// scripts/oi-time-shot.mjs: opens the real Desk Terminal in headless Chromium as the owner and plays the three OI-over-time views, so their look and overflow can be checked.
// Not part of CI (needs a browser and the network). /api/replay/oi-days is built HERE from the live /api/oi-history (all captures) and live /api/replay/day sessions (the
// daily candles of the most recent days), through the real core (js/oiTimeCore.js buildOiDays); every other /api/ call goes to the live site.
//   PW_CORE=<node_modules/playwright-core> CHROME=<chrome.exe> node scripts/oi-time-shot.mjs [outDir]   (env: INST=NQ DAYS=30 WIDTHS=1440,390 THEMES=default)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildOiDays } from '../js/oiTimeCore.js';
import { londonDate } from '../js/replayCore.js';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE || 'playwright-core');
const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const OUT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(ROOT, 'scratch_oit');
const LIVE = process.env.LIVE || 'https://macrofxmodel-production.up.railway.app';
const INST = process.env.INST || 'NQ', NDAYS = +(process.env.DAYS || 30);
const OIKEY = { NQ: 'NAS100_USD', GOLD: 'XAU/USD', EURUSD: 'EUR/USD' }[INST] ?? INST;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const get = async u => { for (let i = 0; i < 3; i++) { try { const r = await fetch(LIVE + u, { signal: AbortSignal.timeout(120000) }); if (r.ok) return r.json(); } catch { /* retry */ } } return null; };
const CACHE = path.join(process.env.TEMP || '.', `oit_payload_${INST}_${NDAYS}.json`);
if (!fs.existsSync(CACHE)) {
  const hist = await get(`/api/oi-history?pair=${encodeURIComponent(OIKEY)}&limit=400`);
  const per = Object.fromEntries(hist.history.map(h => [h.date, h]));
  const dates = Object.keys(per).filter(d => ![0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay())).sort().slice(-NDAYS);
  const candles = [];
  for (let i = 0; i < dates.length; i += 6) {
    const rs = await Promise.all(dates.slice(i, i + 6).map(d => get(`/api/replay/day?inst=${INST}&date=${d}`)));
    for (const r of rs.filter(Boolean)) { const rows = r.bars.filter(b => b[0] >= r.win.start && b[0] < r.win.end); if (rows.length < 100) continue; candles.push([r.win.start, rows[0][1], Math.max(...rows.map(b => b[2])), Math.min(...rows.map(b => b[3])), rows.at(-1)[4]]); }
  }
  const days = buildOiDays(per, candles, { tzDate: londonDate });
  const meta = await get(`/api/replay/meta?inst=${INST}`);
  fs.writeFileSync(CACHE, JSON.stringify({ ok: true, inst: INST, label: INST === 'NQ' ? 'Nasdaq 100' : INST, dp: INST === 'NQ' ? 1 : 2, days, first: Object.keys(per).sort()[0], captureDates: Object.keys(per).length, coverage: { n: days.length }, meta: meta?.coverage?.oi }));
}
const payload = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
console.log(`payload: ${payload.days.length} days (${payload.days.filter(d => d.px).length} with a candle), capture dates ${payload.captureDates}, first ${payload.first}`);

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname === '/api/desk-session') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ ok: true, role: 'owner', auth: true })); }
    if (u.pathname === '/api/desk-access') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ ok: true, role: 'owner', schema: 2, visible: [], saved: {} })); }
    if (u.pathname === '/api/replay/oi-days') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(payload)); }
    if (u.pathname.startsWith('/api/')) { const r = await fetch(LIVE + req.url, { headers: { accept: 'application/json' } }); res.statusCode = r.status; res.setHeader('content-type', r.headers.get('content-type') ?? 'application/json'); return res.end(Buffer.from(await r.arrayBuffer())); }
    const f = path.join(ROOT, decodeURIComponent(u.pathname === '/' ? '/desk-terminal.html' : u.pathname));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end('nf'); }
    res.setHeader('content-type', MIME[path.extname(f)] ?? 'application/octet-stream'); res.end(fs.readFileSync(f));
  } catch (e) { res.statusCode = 502; res.end(String(e)); }
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true });
const report = [];
for (const theme of (process.env.THEMES ?? 'default').split(',')) for (const width of (process.env.WIDTHS ?? '1440,390').split(',').map(Number)) {
  const ctx = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(t => { try { localStorage.setItem('deskTheme', t); } catch { /* none */ } }, theme);
  const page = await ctx.newPage(); const r = { theme, width, errors: [], views: {} };
  page.on('pageerror', e => r.errors.push(String(e).slice(0, 200)));
  await page.goto(base + '/desk-terminal.html', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4000);
  await page.locator('button[data-t="options"]').first().click().catch(() => {});
  await page.waitForSelector('#tr-card', { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(2500);
  r.buttons = await page.locator('#tr-card [data-oit-open]').count(); r.status = await page.evaluate(() => globalThis.__deskFeel?.features?.oiTime ?? null);
  const seek = async v => { await page.evaluate(v => { const s = document.getElementById('rpv-scrub'); if (!s) return; s.value = String(v); s.dispatchEvent(new Event('input', { bubbles: true })); }, v); await page.waitForTimeout(250); };
  const shot = async (name, v) => { if (v != null) await seek(v); await page.screenshot({ path: path.join(OUT, `oit_${name}_${theme}_${width}.png`) }).catch(() => {}); };
  const measure = async () => page.evaluate(() => { const d = document.querySelector('.rpv'); const bad = []; for (const el of d?.querySelectorAll('*') ?? []) { if (el.closest('svg')) continue; const b = el.getBoundingClientRect(), p = d.getBoundingClientRect(); if (b.width && b.right > p.right + 2) bad.push(String(el.className || el.tagName).slice(0, 40)); } return { doc: document.documentElement.scrollWidth, inner: innerWidth, dialog: d ? [d.scrollWidth, d.clientWidth] : null, bad: bad.slice(0, 6), stage: document.getElementById('rpv-stage')?.innerText.slice(0, 160), cap: document.getElementById('rpv-cap')?.innerText.slice(0, 300), cov: document.getElementById('rpv-cov')?.innerText.slice(0, 260) }; });
  console.log('buttons', r.buttons, JSON.stringify(r.status), 'errors', JSON.stringify(r.errors));
  for (const view of ['terrain', 'walk', 'gauge']) {
    await page.locator(`#tr-card [data-oit-open="${view}"]`).first().click().catch(() => {}); await page.waitForTimeout(800);
    if (!(await page.locator('#rpv-back').count())) { r.views[view + '_fallback'] = true; await page.evaluate(v => globalThis.deskOiTime?.open(v, 'NQ'), view); }
    await page.waitForSelector('.rpv-stage svg, .rpv-stage .oit-gauge', { timeout: 45000 }).catch(() => {}); await page.waitForTimeout(700);
    await page.locator('[data-pick="inst"][data-val="NQ"]').click().catch(() => {}); await page.waitForTimeout(1500);
    const n = await page.evaluate(() => +document.getElementById('rpv-scrub')?.max || 0);
    await shot(`${view}_mid`, Math.round(n * 0.6)); r.views[view] = await measure(); r.views[view].frames = n + 1;
    if (view === 'terrain') {   // within a day
      await page.locator('[data-pick="mode"][data-val="intraday"]').click().catch(() => {}); await page.waitForTimeout(6000);
      const n2 = await page.evaluate(() => +document.getElementById('rpv-scrub')?.max || 0); await shot('terrain_intraday', Math.round(n2 * 0.55)); r.views.terrainIntraday = await measure();
    }
    if (view === 'walk') { await shot('walk_end', n); await page.locator('[data-pick="kind"][data-val="maxpain"]').click().catch(() => {}); await page.waitForTimeout(1200); await shot('walk_maxpain', 4); }
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  }
  report.push(r); await ctx.close();
}
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1).slice(0, 5000));
await browser.close(); server.close();
