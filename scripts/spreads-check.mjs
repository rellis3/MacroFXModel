// scripts/spreads-check.mjs (derived from insight-overflow.mjs): opens the real Desk Terminal in headless Chromium, as the owner, against the LIVE data, and measures
// what overflows its card on the Insight tab (and the other preview tabs). Not part of CI (needs a browser and the network).
//   PW_CORE=<path to node_modules/playwright-core> CHROME=<chrome.exe> node scripts/insight-overflow.mjs [outDir] [--tabs=insight,monitor,...]
// For each theme and width it clicks every pill of the tab, waits for the board, then reports every block whose content is wider than
// its box (scrollWidth > clientWidth with no scroll container) or that pokes out past its card, and saves a screenshot.
// --pagewidth: the WHOLE-PAGE check for every tab (all of the tab strip unless --tabs= is given): reports the document's scrollWidth against the
//   viewport and the ROOT offenders (an element past the viewport edge whose parent is not), so a page that scrolls sideways is named at its cause.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE || 'playwright-core');
const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const OUT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(ROOT, 'scratch_overflow');
const PAGEWIDTH = process.argv.includes('--pagewidth');
const TABS = (process.argv.find(a => a.startsWith('--tabs=')) ?? '--tabs=insight').slice(7).split(',');
const ALLTABS = PAGEWIDTH && !process.argv.some(a => a.startsWith('--tabs='));
const LIVE = process.env.LIVE || 'https://macrofxmodel-production.up.railway.app';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const owner = { ok: true, role: 'owner', auth: true };
let extrasHeld = null;
async function localExtras() {
  if (extrasHeld) return extrasHeld;
  const { createSpreadExtras } = await import('../js/spreadExtrasRoutes.js');
  const fredCsv = async id => { const r = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error(`FRED ${id} HTTP ${r.status}`); return (await r.text()).trim().split('\n').slice(1).map(l => { const [d, v] = l.split(','); return { date: d, value: parseFloat(v) }; }).filter(o => Number.isFinite(o.value)); };
  extrasHeld = await createSpreadExtras({ fredCsv }).get(); return extrasHeld;
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname === '/api/desk-session') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(owner)); }
    if (u.pathname === '/api/desk-access') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ ok: true, role: 'owner', schema: 2, visible: [], saved: {} })); }
    if (u.pathname === '/api/spread-extras') {   // not deployed yet on the live site: build it here from FRED with the same module the server mounts (js/spreadExtrasRoutes.js)
      const lr = await fetch(LIVE + req.url, { headers: { accept: 'application/json' } }).catch(() => null);
      if (!lr?.ok) { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(await localExtras())); }
      res.statusCode = lr.status; res.setHeader('content-type', 'application/json'); return res.end(Buffer.from(await lr.arrayBuffer()));
    }
    if (u.pathname.startsWith('/api/')) {
      const r = await fetch(LIVE + req.url, { headers: { accept: 'application/json' } });
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

const MEASURE = whole => {
  const sec = whole ? document.body : document.querySelector('.tab.on, section.on') ?? [...document.querySelectorAll('main section, section.tab')].find(x => !x.hidden && x.offsetWidth) ?? document.body;
  const scrolls = el => { for (let e = el; e && e !== document.body; e = e.parentElement) { const o = getComputedStyle(e).overflowX; if (o === 'auto' || o === 'scroll') return true; if (e === sec) break; } return false; };
  const bad = [];
  for (const el of sec.querySelectorAll('*')) {
    if (el.closest('svg') || el.closest('canvas') || el.closest('.tk, #tk, .ticker, [data-surface="strip.news"], [data-surface="strip.events"]')) continue;   // the scrolling ticker is a marquee clipped by its own box
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect(); if (!r.width) continue;
    const card = el.closest('.card, .in-li, .in-tblw');
    const spills = el.scrollWidth > el.clientWidth + 2 && cs.overflowX === 'visible' && !scrolls(el) && el.clientWidth > 0;
    const out = card && card !== el && r.right > card.getBoundingClientRect().right + 2 && !scrolls(el);
    const wide = r.right > innerWidth + 2 && !scrolls(el);
    if (spills || out || wide) bad.push({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 60), sw: el.scrollWidth, cw: el.clientWidth, right: Math.round(r.right), cardRight: card ? Math.round(card.getBoundingClientRect().right) : null, kind: spills ? 'spill' : out ? 'outside-card' : 'beyond-viewport', txt: (el.textContent || '').trim().slice(0, 50) });
  }
  return { docScroll: document.documentElement.scrollWidth, inner: innerWidth, bad: bad.slice(0, 40), nbad: bad.length };
};

const MEASURE_PAGE = () => {
  const iw = document.documentElement.clientWidth;
  const clipped = el => { for (let e = el.parentElement; e && e !== document.documentElement; e = e.parentElement) { const o = getComputedStyle(e).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return true; } return false; };
  const path = el => { const out = []; for (let e = el, i = 0; e && e !== document.body && i < 3; e = e.parentElement, i++) out.push(e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '')); const ds = el.closest('[data-surface]'); return out.join(' < ') + (ds ? ' [' + ds.getAttribute('data-surface') + ']' : ''); };
  const roots = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (el.closest('svg, canvas, .tk, #tk, .ticker, [data-surface="strip.news"], [data-surface="strip.events"]')) continue;
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') continue;
    const r = el.getBoundingClientRect(); if (!r.width || r.right <= iw + 1 || clipped(el)) continue;
    const p = el.parentElement, pr = p.getBoundingClientRect();
    if (p === document.body || pr.right <= iw + 1 || cs.position === 'absolute') roots.push({ at: path(el), txt: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50), width: Math.round(r.width), right: Math.round(r.right), sw: el.scrollWidth, cw: el.clientWidth });
  }
  return { docScroll: document.documentElement.scrollWidth, inner: iw, bad: roots.slice(0, 12), nbad: roots.length };
};

const SAMPLE = (process.env.PAIRS ?? 'curve-2s10s,vix-vix3m,rsp-spy,audjpy,sbcorr,skew,dx-dxy-tips,hy-ig,real-bei').split(',');
const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true });
const report = [];
for (const theme of (process.env.THEMES ?? 'default,daylight,contrast').split(',')) {
  for (const width of (process.env.WIDTHS ?? '1440,390').split(',').map(Number)) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(t => { try { localStorage.setItem('deskTheme', t); localStorage.removeItem('deskSpreads:v1'); } catch { /* none */ } }, theme);
    // the board needs only the daily bundle and the extras: every other /api call is answered at once, so a slow live API cannot hold the page's few sockets (and the module imports queued behind them)
    const ALLOWED_API = ['/api/drill-series', '/api/spread-extras', '/api/desk-session', '/api/desk-access'];
    await ctx.route('**/api/**', route => { const u = new URL(route.request().url()); return ALLOWED_API.some(a => u.pathname.startsWith(a)) ? route.continue() : route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false,"error":"not loaded in this check"}' }); });
    const page = await ctx.newPage();
    page.on('pageerror', e => report.push({ theme, width, pageerror: String(e).slice(0, 160) }));
    if (process.env.DEBUGLOG) { page.on('console', m => { if (['error', 'warning'].includes(m.type())) console.log('  console', m.type(), m.text().slice(0, 160)); }); page.on('requestfailed', r => console.log('  reqfailed', r.url().slice(0, 100), r.failure()?.errorText)); page.on('response', r => { if (r.status() >= 400) console.log('  http', r.status(), r.url().slice(0, 100)); }); }
    page.on('crash', () => report.push({ theme, width, pageerror: 'PAGE CRASHED' })); page.on('close', () => console.log('page closed', theme, width));
    await page.goto(base + '/desk-terminal.html', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(4000);
    await page.locator('button[data-t="insight"]').first().click().catch(() => {});
    await page.waitForTimeout(1500);
    await page.locator('.in-tab[data-p="spreads"]').first().click().catch(() => {});
    if (process.env.DEBUGDOM) { for (const t of [2000, 8000, 20000]) { await page.waitForTimeout(t); console.log('  dom@', t, JSON.stringify(await page.evaluate(() => { const h = document.querySelector('#in-p-spreads'); return h ? { hidden: h.hidden, w: h.getBoundingClientRect().width, html: h.innerHTML.slice(0, 160) } : 'no panel'; }))); } }
    await page.waitForSelector('.sp-row', { timeout: 150000 }).catch(() => console.log('  NO ROWS in 150s'));
    await page.waitForTimeout(1200);
    const snap = async (name, view = 'ladder') => {
      console.log('  snap', name); await page.waitForTimeout(500);
      const m = await page.evaluate(MEASURE, true), host = page.locator('.in-tab[data-p="spreads"]').first();
      if (!process.env.NOFULL) await page.screenshot({ path: path.join(OUT, `${name}_${theme}_${width}.png`), fullPage: true }).catch(e => console.log('  fullshot', String(e).slice(0, 80)));
      report.push({ theme, width, view: name, docScroll: m.docScroll, inner: m.inner, nbad: m.nbad, bad: m.bad });
      console.log(`  RESULT ${theme} ${width} ${name}: doc ${m.docScroll}/${m.inner}, ${m.nbad} offenders${m.bad.filter(o => !/ad-ticks/.test(o.cls)).slice(0, 3).map(o => ` [${o.tag}.${o.cls} ${o.kind} sw ${o.sw} cw ${o.cw}]`).join('')}`);
    };
    await snap('ladder');
    if (process.env.TALL) { await page.evaluate(i => window.deskSpreads?.open?.(i), SAMPLE[0]); await page.waitForTimeout(900); console.log(JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().width > 2500).slice(0, 8).map(e => ({ tag: e.tagName, cls: String(e.className?.baseVal ?? e.className).slice(0, 50), h: Math.round(e.getBoundingClientRect().height), sw: e.scrollWidth, w: Math.round(e.getBoundingClientRect().width), id: e.id })))), 'tall'); }
    for (const id of SAMPLE) {
      const ok = await page.evaluate(i => window.deskSpreads?.open?.(i), id); if (!ok) { report.push({ theme, width, view: id, missing: true }); continue; }
      await page.waitForTimeout(700);
      const el = page.locator(`.sp-row[data-id="${id}"]`).first();
      await el.scrollIntoViewIfNeeded().catch(() => {});
      await snap(`hero-${id}`);
      if (!process.env.NOHERO) { const box = await page.evaluate(() => { const e = document.querySelector('.sp-hero'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: 0, y: Math.max(0, r.top + scrollY - 6), width: innerWidth, height: Math.min(r.height + 12, 12000) }; }); if (box) await page.screenshot({ path: path.join(OUT, `heroonly-${id}_${theme}_${width}.png`), fullPage: true, clip: box, timeout: 90000 }).catch(e => console.log('  heroshot', String(e).slice(0, 80))); }
    }
    console.log('  compare'); await page.locator('.sp-cmp').nth(0).click({ timeout: 8000 }).catch(e => console.log('  cmp0', String(e).slice(0, 100))); await page.locator('.sp-cmp').nth(3).click({ timeout: 8000 }).catch(e => console.log('  cmp3', String(e).slice(0, 100)));
    await page.waitForTimeout(800); await snap('compare');
    await page.locator('.in-tab[data-view="wall"]').first().click().catch(() => {}); await snap('wall');
    await page.locator('.in-tab[data-view="pick"]').first().click().catch(() => {}); await snap('picker');
    await ctx.close();
  }
}
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
for (const r of report) { if (r.pageerror) console.log('PAGEERROR', r.theme, r.width, r.pageerror); else if (r.missing) console.log('MISSING', r.theme, r.width, r.view); else console.log(`${r.theme} ${r.width} ${r.view}: doc ${r.docScroll}/${r.inner}, ${r.nbad} offenders`); }
for (const r of report) if (r.bad?.length) for (const o of r.bad.slice(0, 4)) console.log(`   ${r.theme} ${r.width} ${r.view}: ${o.tag}.${o.cls} ${o.kind} sw ${o.sw} cw ${o.cw} "${o.txt}"`);
await browser.close(); server.close();
