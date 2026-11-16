// scripts/ghost-walk-shot.mjs: opens the real Desk Terminal in headless Chromium as the owner and plays the ghost walk, so its look and its overflow can be checked.
// Not part of CI (needs a browser and the network). The /api/replay/ghosts answer is built HERE, from the live /api/replay/day answers and the real core
// (js/ghostWalkCore.js buildGhostPayload), so the picture is drawn from real days even before the route is deployed; every other /api/ call goes to the live site.
//   PW_CORE=<node_modules/playwright-core> CHROME=<chrome.exe> node scripts/ghost-walk-shot.mjs [outDir]   (env: INST=NQ FOCUS=2026-11-13 DAYS=26 WIDTHS=1440,390 THEMES=default,daylight)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildGhostPayload } from '../js/ghostWalkCore.js';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE || 'playwright-core');
const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const OUT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(ROOT, 'scratch_ghost');
const LIVE = process.env.LIVE || 'https://macrofxmodel-production.up.railway.app';
const INST = process.env.INST || 'NQ', FOCUS = process.env.FOCUS || '2026-11-13', NDAYS = +(process.env.DAYS || 26);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const owner = { ok: true, role: 'owner', auth: true };

// ── the payload the route would send, from live days ──
const weekdays = []; for (let t = Date.parse(`${FOCUS}T12:00:00Z`); weekdays.length < NDAYS; t -= 864e5) { const d = new Date(t); if (![0, 6].includes(d.getUTCDay())) weekdays.push(d.toISOString().slice(0, 10)); }
weekdays.reverse();
const get = async u => { const r = await fetch(LIVE + u); if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); };
const CACHE = path.join(process.env.TEMP || '.', `ghost_payload_${INST}_${FOCUS}_${NDAYS}.json`);   // the live days are slow to fetch: kept between runs
const days = [];
if (!fs.existsSync(CACHE)) for (let i = 0; i < weekdays.length; i += 5) days.push(...await Promise.all(weekdays.slice(i, i + 5).map(d => get(`/api/replay/day?inst=${INST}&date=${d}`).catch(e => { console.log('skip', d, e.message); return null; }))));
const bars = [], entries = new Map(), forecasts = {};
if (!fs.existsSync(CACHE)) {
for (const d of days.filter(Boolean)) {
  const m = new Map();
  for (const b of d.bars) { const k = Math.floor(b[0] / 9e5) * 9e5, c = m.get(k); if (!c) m.set(k, [k, b[1], b[2], b[3], b[4]]); else { c[2] = Math.max(c[2], b[2]); c[3] = Math.min(c[3], b[3]); c[4] = b[4]; } }
  bars.push(...m.values()); for (const e of d.oi.entries) entries.set(e.date, e); if (d.forecast) forecasts[d.date] = d.forecast;
}
bars.sort((a, b) => a[0] - b[0]); const uniq = bars.filter((b, i) => !i || b[0] !== bars[i - 1][0]);
let payloadBuilt = { ok: true, inst: INST, label: days.find(Boolean)?.label ?? INST, dp: days.find(Boolean)?.dp ?? 2, date: FOCUS, ...buildGhostPayload({ bars: uniq, entries: [...entries.values()], forecasts, focus: FOCUS, today: null, n: 90 }) };
fs.writeFileSync(CACHE, JSON.stringify(payloadBuilt)); }
const payload = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
console.log(`payload: ${payload.days.length} days used, first OI ${payload.firstOi}, dropped ${JSON.stringify(payload.dropped)}, focus found ${payload.focusFound}`);

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname === '/api/desk-session') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(owner)); }
    if (u.pathname === '/api/desk-access') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ ok: true, role: 'owner', schema: 2, visible: [], saved: {} })); }
    if (u.pathname === '/api/replay/ghosts') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ ...payload, date: u.searchParams.get('date') ?? FOCUS })); }
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
for (const theme of (process.env.THEMES ?? 'default').split(',')) {
  for (const width of (process.env.WIDTHS ?? '1440,390').split(',').map(Number)) {
    const ctx = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 1, acceptDownloads: true });
    await ctx.addInitScript(t => { try { localStorage.setItem('deskTheme', t); } catch { /* none */ } }, theme);
    const page = await ctx.newPage(); const r = { theme, width, errors: [] };
    page.on('pageerror', e => r.errors.push(String(e).slice(0, 200)));
    await page.goto(base + '/desk-terminal.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    await page.locator('button[data-t="options"]').first().click().catch(() => {});
    await page.waitForSelector('#tr-card', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2500);
    r.buttonOnTerrain = await page.locator('#tr-card [data-gw-open]').count();
    r.status = await page.evaluate(() => globalThis.__deskFeel?.features?.ghostWalk ?? null);
    if (r.buttonOnTerrain) { await page.locator('#tr-card [data-gw-open]').first().click(); await page.waitForTimeout(1500); r.buttonOpensPlayer = await page.locator('#rpv-back').count(); r.terrainMarket = (await page.locator('#tr-name').innerText().catch(() => '')).slice(0, 40); await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
    await page.evaluate(([i, d]) => globalThis.deskGhostWalk?.open(i, d), [INST, FOCUS]);
    await page.waitForSelector('.gw-svg', { timeout: 60000 }).catch(() => {});
    r.opened = await page.locator('.gw-svg').count();
    r.stage = (await page.locator('#rpv-stage').innerText().catch(() => '')).slice(0, 300); r.cov0 = (await page.locator('#rpv-cov').innerText().catch(() => '')).slice(0, 300);
    await page.waitForTimeout(800);
    const seek = async v => { await page.evaluate(v => { const s = document.getElementById('rpv-scrub'); s.value = String(v); s.dispatchEvent(new Event('input', { bubbles: true })); }, v); await page.waitForTimeout(250); };
    for (const [name, v] of [['early', 20], ['mid', 56], ['late', 88]]) { await seek(v); await page.screenshot({ path: path.join(OUT, `ghost_${name}_${theme}_${width}.png`), fullPage: false }).catch(() => {}); }
    await seek(56);
    r.caption = await page.locator('#rpv-cap').innerText().catch(() => null);
    r.coverage = await page.locator('#rpv-cov').innerText().catch(() => null);
    r.over = await page.evaluate(() => { const d = document.querySelector('.rpv'); const bad = []; for (const el of d?.querySelectorAll('*') ?? []) { if (el.closest('svg')) continue; const b = el.getBoundingClientRect(), p = d.getBoundingClientRect(); if (b.width && b.right > p.right + 2) bad.push(el.className || el.tagName); } return { doc: document.documentElement.scrollWidth, inner: innerWidth, dialog: d ? [d.scrollWidth, d.clientWidth] : null, bad: bad.slice(0, 8) }; });
    // the filter pick, the CSV and the PNG
    await page.locator('[data-pick="flt"][data-val="regime"]').click().catch(() => {}); await page.waitForTimeout(1200);
    r.regimeCov = await page.locator('#rpv-cov').innerText().catch(() => null);
    await page.screenshot({ path: path.join(OUT, `ghost_regime_${theme}_${width}.png`) }).catch(() => {});
    await page.locator('[data-pick="flt"][data-val="all"]').click().catch(() => {}); await page.waitForTimeout(1200);
    const dl = async sel => { try { const [d] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.locator(sel).first().click()]); return d.suggestedFilename(); } catch (e) { return 'NONE: ' + String(e).slice(0, 80); } };
    r.csv = await dl('[data-gw-ex="csv"]'); r.png = await dl('[data-gw-ex="png"]'); r.exNote = await page.locator('#ex-note').innerText().catch(() => null);
    report.push(r); await ctx.close();
  }
}
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1).slice(0, 4000));
await browser.close(); server.close();
