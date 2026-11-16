// scripts/roc-check.mjs: opens the Desk Terminal (local files, live data, a stand-in owner) in headless Chromium, goes to Insight > Momentum, opens a hero and the lists, and measures
// what overflows its card on the Insight tab (and the other preview tabs). Not part of CI (needs a browser and the network).
//   PW_CORE=<path to node_modules/playwright-core> CHROME=<chrome.exe> node scripts/roc-check.mjs [outDir]
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


const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true });
const report = [], fails = [];
for (const theme of (process.env.THEMES ?? 'default,daylight').split(',')) {
  for (const width of (process.env.WIDTHS ?? '1440,390').split(',').map(Number)) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(t => { try { localStorage.setItem('deskTheme', t); localStorage.removeItem('deskRoc:v1'); } catch { /* none */ } }, theme);
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    await page.goto(base + '/desk-terminal.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    const nav = page.locator('button[data-t="insight"]').first(); if (await nav.count()) await nav.click();
    await page.waitForTimeout(1500);
    const pill = page.locator('.in-tab[data-p="roc"]').first();
    const hasPill = await pill.count(); if (!hasPill) { fails.push(`${theme} ${width}: no Momentum pill`); await ctx.close(); continue; }
    await pill.click(); await page.waitForSelector('.rc-row', { timeout: 45000 }).catch(() => {}); await page.waitForTimeout(800);
    const rows = await page.locator('.rc-row').count(), chips = await page.locator('.rc-st').count();
    await page.screenshot({ path: path.join(OUT, `roc-ladder_${theme}_${width}.png`), fullPage: true });
    const m1 = await page.evaluate(MEASURE, false);
    await page.locator('.rc-row').first().click(); await page.waitForTimeout(800);
    const hero = await page.locator('.rc-hero svg.rc-chart').count(), cap = (await page.locator('.rc-cap').first().textContent().catch(() => '')) ?? '';
    await page.screenshot({ path: path.join(OUT, `roc-hero_${theme}_${width}.png`), fullPage: true });
    const m2 = await page.evaluate(MEASURE, false);
    await page.locator('.in-tab[data-view="lists"]').first().click(); await page.waitForTimeout(600);
    const blocks = await page.locator('.rc-block').count();
    await page.screenshot({ path: path.join(OUT, `roc-lists_${theme}_${width}.png`), fullPage: true });
    const m3 = await page.evaluate(MEASURE, false);
    await page.locator('.in-tab[data-view="ladder"]').first().click(); await page.waitForTimeout(400);
    await page.locator('details.rc-said summary').first().click().catch(() => {}); await page.waitForTimeout(300);
    const found = await page.locator('.rc-found-row').count();
    await page.screenshot({ path: path.join(OUT, `roc-found_${theme}_${width}.png`), fullPage: true });
    const m4 = await page.evaluate(MEASURE, false);
    const nbad = m1.nbad + m2.nbad + m3.nbad + m4.nbad;
    report.push({ theme, width, rows, chips, hero, blocks, found, nbad, doc: m4.docScroll, inner: m4.inner, errs, cap: cap.slice(0, 160), bad: [...m1.bad, ...m2.bad, ...m3.bad, ...m4.bad].slice(0, 6) });
    if (rows < 20) fails.push(`${theme} ${width}: only ${rows} rows`);
    if (!hero) fails.push(`${theme} ${width}: no hero svg`);
    if (blocks !== 4) fails.push(`${theme} ${width}: ${blocks} list blocks`);
    if (found !== 6) fails.push(`${theme} ${width}: ${found} verdict rows`);
    if (nbad) fails.push(`${theme} ${width}: ${nbad} overflow offenders ${JSON.stringify(report.at(-1).bad.slice(0, 2))}`);
    if (errs.length) fails.push(`${theme} ${width}: page errors ${errs.join(' | ')}`);
    await ctx.close();
  }
}
fs.writeFileSync(path.join(OUT, 'roc-report.json'), JSON.stringify(report, null, 1));
for (const r of report) console.log(`${r.theme} ${r.width}: ${r.rows} rows, ${r.chips} state chips, hero ${r.hero}, ${r.blocks} list blocks, ${r.found} verdict rows, ${r.nbad} offenders, page ${r.doc}/${r.inner}, errors ${r.errs.length}`);
console.log(fails.length ? ['FAIL', ...fails].join(String.fromCharCode(10)) : 'ALL CHECKS PASSED');
await browser.close(); server.close(); process.exit(fails.length ? 1 : 0);
