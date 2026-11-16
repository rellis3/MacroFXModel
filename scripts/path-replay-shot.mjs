// scripts/path-replay-shot.mjs: opens the real Desk Terminal in headless Chromium as the owner, finds the Path card on the Options tab and plays the Path replay.
// Not part of CI (needs a browser and the network). /api/replay/path-days is built HERE from the live /api/swing-map (its walkHistory: the most recent nightly records, 6 of
// them; production holds every record since 2026-11-03) and live /api/replay/day sessions aggregated to 15-minute bars; every other /api/ call goes to the live site.
//   PW_CORE=<node_modules/playwright-core> CHROME=<chrome.exe> node scripts/path-replay-shot.mjs [outDir]   (env: INST=GOLD WIDTHS=1440,390 THEMES=default)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE || 'playwright-core');
const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const OUT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(ROOT, 'scratch_path');
const LIVE = process.env.LIVE || 'https://macrofxmodel-production.up.railway.app';
const INST = process.env.INST || 'GOLD';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const get = async u => { for (let i = 0; i < 3; i++) { try { const r = await fetch(LIVE + u, { signal: AbortSignal.timeout(120000) }); if (r.ok) return r.json(); } catch { /* retry */ } } return null; };
const CACHE = path.join(process.env.TEMP || '.', `path_payload_${INST}.json`);
if (!fs.existsSync(CACHE)) {
  const sm = await get(`/api/swing-map?inst=${INST}`), by = new Map();
  for (const r of sm.walkHistory ?? []) { const o = by.get(r.closeDate); if (!o || r.captureDate > o.captureDate) by.set(r.closeDate, r); }
  const records = [...by.values()].sort((a, b) => a.captureDate.localeCompare(b.captureDate)).map(r => ({ captureDate: r.captureDate, closeDate: r.closeDate, close: r.close, vol: r.vol, walks: r.walks }));
  const first = new Date(Date.parse(`${records[0].closeDate}T12:00:00Z`)), today = new Date(), dates = [];
  for (let d = new Date(first); d <= today; d = new Date(d.getTime() + 864e5)) if (![0, 6].includes(d.getUTCDay())) dates.push(d.toISOString().slice(0, 10));
  const bars = [];
  for (let i = 0; i < dates.length; i += 4) for (const r of await Promise.all(dates.slice(i, i + 4).map(d => get(`/api/replay/day?inst=${INST}&date=${d}`)))) {
    if (!r) continue; const m = new Map();
    for (const b of r.bars) { if (b[0] < r.win.start || b[0] >= r.win.end) continue; const k = Math.floor(b[0] / 9e5) * 9e5, c = m.get(k); if (!c) m.set(k, [k, b[1], b[2], b[3], b[4]]); else { c[2] = Math.max(c[2], b[2]); c[3] = Math.min(c[3], b[3]); c[4] = b[4]; } }
    bars.push(...m.values());
  }
  bars.sort((a, b) => a[0] - b[0]);
  fs.writeFileSync(CACHE, JSON.stringify({ ok: true, inst: INST, label: INST === 'GOLD' ? 'Gold' : INST, dp: INST === 'GOLD' ? 2 : 1, records, bars: bars.filter((b, i) => !i || b[0] !== bars[i - 1][0]), first: records[0].captureDate, count: records.length }));
}
const payload = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
console.log(`payload: ${payload.records.length} records from ${payload.first}, ${payload.bars.length} bars`);
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname === '/api/desk-session') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ ok: true, role: 'owner', auth: true })); }
    if (u.pathname === '/api/desk-access') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ ok: true, role: 'owner', schema: 2, visible: [], saved: {} })); }
    if (u.pathname === '/api/replay/path-days') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(payload)); }
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
  const ctx = await browser.newContext({ viewport: { width, height: 1100 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(t => { try { localStorage.setItem('deskTheme', t); } catch { /* none */ } }, theme);
  const page = await ctx.newPage(); const r = { theme, width, errors: [] };
  page.on('pageerror', e => r.errors.push(String(e).slice(0, 200)));
  await page.goto(base + '/desk-terminal.html', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4000);
  await page.locator('button[data-t="options"]').first().click().catch(() => {});
  await page.waitForFunction(() => [...document.querySelectorAll('.ch .lbl')].some(l => /^The path/i.test(l.textContent)), null, { timeout: 60000 }).catch(() => {}); await page.waitForTimeout(2500);
  r.heads = await page.evaluate(() => [...document.querySelectorAll('.lbl')].map(l => l.textContent.trim()).filter(t => /path/i.test(t)).slice(0, 6)); r.parents = await page.evaluate(() => [...document.querySelectorAll('.lbl')].filter(l => /^The path/i.test(l.textContent.trim())).map(l => l.parentElement.className + '|' + l.parentElement.tagName + '|' + (l.closest('.ch') ? 'ch' : 'noch')));
  r.headHtml = await page.evaluate(() => { const l = [...document.querySelectorAll('.ch .lbl')].find(l => /^The path/i.test(l.textContent.trim())); const h = l?.closest('.ch'); return h ? { hasR: !!h.querySelector('.r'), connected: h.isConnected, html: h.outerHTML.slice(0, 260), oit: document.querySelectorAll('[data-oit-open]').length, mounted: document.body.dataset.oitMounted ?? null, api: typeof globalThis.deskOiTime } : null; });
  r.steps = await page.evaluate(() => { const o = {}; const ls = [...document.querySelectorAll('.ch .lbl')]; o.n = ls.length; const l = ls.find(x => /^The path/i.test(String(x.textContent).trim())); o.found = !!l; const head = l && l.closest('.ch'); o.head = !!head; o.pre = head ? head.querySelectorAll('[data-oit-open="path"]').length : null; const t = document.createElement('span'); t.innerHTML = '<button type="button" data-oit-open="path">x</button>'; o.btn = !!t.querySelector('button'); return o; });
  r.decorateTry = await page.evaluate(() => { try { globalThis.deskOiTime.decorate(); return 'ok ' + document.querySelectorAll('[data-oit-open="path"]').length; } catch (e) { return String(e && e.stack || e).slice(0, 300); } });
  r.buttonBefore = await page.locator('[data-oit-open="path"]').count(); await page.evaluate(() => { document.body.appendChild(document.createElement('i')); }); await page.waitForTimeout(1000);
  r.button = await page.locator('[data-oit-open="path"]').count(); r.status = await page.evaluate(() => globalThis.__deskFeel?.features?.oiTime ?? null);
  await page.locator('[data-oit-open="path"]').first().click().catch(() => {}); await page.waitForTimeout(1000);
  if (!(await page.locator('#rpv-back').count())) { r.fallback = true; await page.evaluate(i => globalThis.deskOiTime?.open('path', i), INST); }
  await page.waitForSelector('.rpv-stage svg', { timeout: 45000 }).catch(() => {}); await page.waitForTimeout(800);
  const n = await page.evaluate(() => +document.getElementById('rpv-scrub')?.max || 0); r.frames = n + 1;
  const seek = async v => { await page.evaluate(v => { const s = document.getElementById('rpv-scrub'); if (!s) return; s.value = String(v); s.dispatchEvent(new Event('input', { bubbles: true })); }, v); await page.waitForTimeout(250); };
  for (const [name, f] of [['early', 0.15], ['mid', 0.5], ['late', 0.9]]) { await seek(Math.round(n * f)); await page.screenshot({ path: path.join(OUT, `path_${name}_${theme}_${width}.png`) }).catch(() => {}); }
  r.cap = (await page.locator('#rpv-cap').innerText().catch(() => '')).slice(0, 360); r.cov = (await page.locator('#rpv-cov').innerText().catch(() => '')).slice(0, 300);
  r.over = await page.evaluate(() => { const d = document.querySelector('.rpv'); const bad = []; for (const el of d?.querySelectorAll('*') ?? []) { if (el.closest('svg')) continue; const b = el.getBoundingClientRect(), p = d.getBoundingClientRect(); if (b.width && b.right > p.right + 2 && !el.closest('.oit-tblw')) bad.push(String(el.className || el.tagName).slice(0, 40)); } return { doc: document.documentElement.scrollWidth, inner: innerWidth, dialog: d ? [d.scrollWidth, d.clientWidth] : null, bad: bad.slice(0, 6) }; });
  await page.locator('[data-pick="anchor"][data-val="maxPain"]').click().catch(() => {}); await page.waitForTimeout(1500); await seek(Math.round(n * 0.7)); await page.screenshot({ path: path.join(OUT, `path_maxpain_${theme}_${width}.png`) }).catch(() => {});
  report.push(r); await ctx.close();
}
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1).slice(0, 3500));
await browser.close(); server.close();
