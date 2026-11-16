// scripts/asof-check.mjs: opens the real Desk Terminal in headless Chromium as the owner, once live and once with ?asof=, against the LIVE server's data and
// snapshots, and reports what a past view actually did. Not part of CI (needs a browser and the network).
//   PW_CORE=<path to node_modules/playwright-core> CHROME=<chrome.exe> node scripts/asof-check.mjs [outDir] [--asof=2026-11-15T12:00Z]
// The local server forwards every /api request to the live site and LOGS it. The LIVE-LEAK check is on that log: in the past view, no request for market data
// (a route the clock must answer from the record or refuse) may have reached the server. Prints the log summary, the banner, how many boards said "no record",
// and saves screenshots (live, past view, control open, phone width).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { classify } from '../js/asofCore.js';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE || 'playwright-core');
const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const OUT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(ROOT, 'scratch_asof');
const ASOF = (process.argv.find(a => a.startsWith('--asof=')) ?? '--asof=2026-11-15T12:00Z').slice(7);
const LIVE = process.env.LIVE || 'https://macrofxmodel-production.up.railway.app';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const owner = { ok: true, role: 'owner', auth: true };
let LOG = [];
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname === '/api/desk-session') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(owner)); }
    if (u.pathname === '/api/desk-access') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ ok: true, role: 'owner', schema: 2, visible: [], saved: {} })); }
    if (u.pathname.startsWith('/api/')) {
      LOG.push({ method: req.method, path: u.pathname + u.search });
      const r = await fetch(LIVE + req.url, { method: req.method, headers: { accept: 'application/json' } });
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
const out = {};

async function open(name, search, { width = 1440, height = 1000, wait = 14000, after = null } = {}) {
  LOG = [];
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  await page.goto(`${base}/desk-terminal.html${search}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(wait);
  let afterError = null;
  if (after) { try { await after(page); } catch (e) { afterError = String(e).slice(0, 120); } }
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  const info = await page.evaluate(() => ({
    url: location.href, asof: !!globalThis.__deskAsof?.active, t: globalThis.__deskAsof?.t ?? null, failed: globalThis.__deskAsof?.failed ?? null,
    banner: document.getElementById('asofbar')?.hidden === false ? document.getElementById('asofbar').textContent.replace(/\s+/g, ' ').trim() : null,
    btn: document.getElementById('asofbtn')?.textContent ?? null,
    noRecordText: [...document.querySelectorAll('.card, section')].filter(e => /No record of this at/.test(e.textContent) && ![...e.children].some(c => /No record of this at/.test(c.textContent))).length,
    feel: globalThis.__deskFeel?.features?.asof ?? null,
  }));
  const paths = LOG.map(l => l.path);
  const leaks = LOG.filter(l => l.method === 'GET' && classify(l.path).kind === 'snapshot').map(l => l.path);
  await ctx.close();
  return { name, info, requests: paths.length, leaks, bars: paths.filter(p => classify(p).kind === 'bars').length, deskrun: paths.filter(p => classify(p).kind === 'deskrun').length, snap: paths.filter(p => /desk-snapshots/.test(p)).length, errs: errs.slice(0, 6), afterError };
}

const probe = async page => page.evaluate(() => {
  const vis = sel => { const e = document.querySelector(sel); if (!e || e.hidden) return null; const r = e.getBoundingClientRect(); const cx = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1), cy = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1); const top = document.elementFromPoint(cx, cy);
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), inView: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth, reachable: !!top && (top === e || e.contains(top)) }; };
  const a = document.getElementById('askbtn')?.getBoundingClientRect(), d = document.getElementById('asofdock')?.getBoundingClientRect();
  return { chip: document.getElementById('asofchip')?.textContent ?? null, dockPill: vis('#asofdock .ad-live'), dockBack: vis('#asofdock .ad-past'), bannerLive: vis('#asofbar [data-asof="live"]'), track: vis('#asof-track'), tab: vis('#asofdocktab'), dockOpen: document.getElementById('asofdock')?.hidden === false,
    askOverlapsDock: !!(a && d && !document.getElementById('asofdock').hidden && a.bottom > d.top && a.top < d.bottom && a.right > d.left && a.left < d.right), docW: document.documentElement.scrollWidth, innerW: innerWidth,
    wide: [...document.querySelectorAll('body *')].filter(e => !e.closest('.tk, #tk, .ticker, svg, canvas') && e.getBoundingClientRect().right > innerWidth + 2 && getComputedStyle(e).position !== 'fixed').slice(0, 5).map(e => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}.${String(e.className).slice(0, 30)} right=${Math.round(e.getBoundingClientRect().right)}`),
    heatRects: document.querySelectorAll('#ad-heat rect').length, cov: document.getElementById('ad-cov')?.textContent ?? null };
});
const SC = [
  ['a_live_1440_navy', '', { width: 1440, height: 900 }, null, 'default'],
  ['b_past_1440_navy', `?asof=${ASOF}`, { width: 1440, height: 900, wait: 18000 }, null, 'default'],
  ['c_collapsed_1440_navy', `?asof=${ASOF}`, { width: 1440, height: 900, wait: 18000 }, async p => { await p.click('#asofdock [data-asof="dock-close"]'); await p.waitForTimeout(500); }, 'default'],
  ['d_live_390_navy', '', { width: 390, height: 844 }, null, 'default'],
  ['e_past_390_navy', `?asof=${ASOF}`, { width: 390, height: 844, wait: 18000 }, null, 'default'],
  ['f_collapsed_390_navy', `?asof=${ASOF}`, { width: 390, height: 844, wait: 18000 }, async p => { await p.click('#asofdock [data-asof="dock-close"]'); await p.waitForTimeout(500); }, 'default'],
  ['g_live_1440_daylight', '', { width: 1440, height: 900 }, null, 'daylight'],
  ['h_past_390_daylight', `?asof=${ASOF}`, { width: 390, height: 844, wait: 18000 }, null, 'daylight'],
  ['i_scrolled_past_390_navy', `?asof=${ASOF}`, { width: 390, height: 844, wait: 18000 }, async p => { await p.evaluate(() => window.scrollTo(0, 1500)); await p.waitForTimeout(600); }, 'default'],
];
for (const [name, search, o, after, theme] of SC) {
  if (process.env.ONLY && !process.env.ONLY.split(',').includes(name)) continue;
  const ctx = await browser.newContext({ viewport: { width: o.width, height: o.height } });
  await ctx.addInitScript(t => { try { localStorage.setItem('deskTheme', t); } catch { /* none */ } }, theme);
  const page = await ctx.newPage(); const errs = []; LOG = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  await page.goto(`${base}/desk-terminal.html${search}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(o.wait ?? 12000);
  if (after) { try { await after(page); } catch (e) { errs.push('after: ' + String(e).slice(0, 100)); } }
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  const leaks = LOG.filter(l => l.method === 'GET' && classify(l.path).kind === 'snapshot').map(l => l.path);
  out[name] = { ...(await probe(page)), leaks: leaks.length, requests: LOG.length, errs: errs.slice(0, 3) };
  await ctx.close();
}
await browser.close(); server.close();
console.log(JSON.stringify(out, null, 1));
const pastLeaks = Object.entries(out).filter(([k, v]) => /past/.test(k) && v.leaks > 0);
console.log(pastLeaks.length ? 'LIVE LEAK in: ' + pastLeaks.map(([k, v]) => k + ' (' + v.leaks + ')').join(', ') : 'No market-data request reached the live server in any past view.');
