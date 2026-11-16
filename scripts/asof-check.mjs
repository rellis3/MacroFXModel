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

out.live = await open('1_live', '');
out.past = await open('2_asof', `?asof=${ASOF}`, { wait: 20000 });
out.pastPanel = await open('3_asof_panel', `?asof=${ASOF}`, { wait: 16000, after: async p => { await p.click('#asofbar [data-asof="open"]'); await p.waitForTimeout(800); } });
out.phone = await open('4_asof_phone', `?asof=${ASOF}`, { width: 390, height: 900, wait: 16000 });
out.liveOpen = await open('5_live_panel', '', { wait: 12000, after: async p => { await p.click('#asofbtn'); await p.waitForTimeout(2500); } });
await browser.close(); server.close();
console.log(JSON.stringify(out, null, 1));
const leaked = [...new Set(out.past.leaks)];
console.log(leaked.length ? `\nLIVE LEAK: ${leaked.length} market-data requests reached the live server in the past view:\n${leaked.join('\n')}` : '\nNo market-data request reached the live server in the past view.');
