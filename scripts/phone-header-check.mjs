// scripts/phone-header-check.mjs: opens the real Desk Terminal in headless Chromium and measures the HEADER on phones and desktop:
// the header's height at rest, whether every control is reachable (directly or through the phone "More" menu), page width, page errors,
// the docked time bar and the Ask button not covering the end of the content, and (desktop) the header layout rectangles so a change can be
// compared with the same measurement on another checkout. Not part of CI (needs a browser and the network).
//   PW_CORE=<node_modules/playwright-core> CHROME=<chrome.exe> node scripts/phone-header-check.mjs [outDir] [--json=<file>]
//   ROLE=owner|viewer (default owner)   LIVE=<origin for the /api proxy>
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE || 'playwright-core');
const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const args = process.argv.slice(2);
const OUT = args.find(a => !a.startsWith('--')) ?? path.join(ROOT, 'scratch_phonehdr');
const JSON_OUT = (args.find(a => a.startsWith('--json=')) ?? '').slice(7);
const LIVE = process.env.LIVE || 'https://macrofxmodel-production.up.railway.app';
const ROLE = process.env.ROLE === 'viewer' ? 'viewer' : 'owner';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname === '/api/desk-session') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ ok: true, role: ROLE, auth: ROLE === 'owner' })); }
    if (u.pathname === '/api/desk-access' && ROLE === 'owner') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ ok: true, role: 'owner', schema: 2, visible: [], saved: {} })); }
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
const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true });
const results = []; let fails = 0;
const ok = (name, pass, extra = '') => { if (!pass) fails++; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const CONTROLS = ['cmdbtn', 'alertsbtn', 'linkchip', 'mktchip', 'asofchip', 'asofbtn', 'bookchip', 'dqchip', 'themebtn', 'signout'];
const SIZES = (process.env.SIZES ? process.env.SIZES.split(',').map(x => x.split('x').map(Number)) : [[390, 844], [360, 740], [768, 900], [1440, 900]]);
const WAIT = Number(process.env.WAIT || 7000);

for (const [width, height] of SIZES) {
  const tag = `${ROLE}@${width}x${height}`;
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: width < 700 });
  await ctx.addInitScript(() => { try { localStorage.setItem('deskTheme', 'default'); localStorage.removeItem('deskAsofDock:v1'); } catch { /* fine */ } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  const warns = [];
  page.on('console', c => { if (['warning', 'error'].includes(c.type()) && !/40[14]|Failed to load resource/.test(c.text())) warns.push(c.text().slice(0, 160)); });
  await page.goto(base + '/desk-terminal.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(WAIT);
  const m = await page.evaluate((ids) => {
    const R = e => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x * 10) / 10, y: Math.round(r.y * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }; };
    const top = document.querySelector('header.top');
    const topin = document.querySelector('.topin');
    const ticker = document.querySelector('.ticker');
    const rects = {};
    for (const id of ids) { const e = document.getElementById(id); rects[id] = e ? { ...R(e), hidden: e.hidden || getComputedStyle(e).display === 'none' } : null; }
    return {
      header: R(top), topin: R(topin), ticker: R(ticker), pos: getComputedStyle(top).position,
      docW: document.documentElement.scrollWidth, innerW: document.documentElement.clientWidth,
      rects, clocks: R(document.getElementById('clocks')), more: (() => { const b = document.getElementById('hdrmore'); return !!b && getComputedStyle(b).display !== 'none'; })(),
      fab: R(document.getElementById('askbtn')), bodyPadBottom: getComputedStyle(document.body).paddingBottom,
      dockTab: R(document.getElementById('asofdocktab')), dockOpen: document.documentElement.classList.contains('asof-dock-open'),
      tabs: R(document.getElementById('tabs')),
    };
  }, CONTROLS);
  const feel = await page.evaluate(() => { const f = window.__deskFeel; return f ? JSON.stringify(f).slice(0, 700) : 'no __deskFeel'; }).catch(() => 'n/a');
  if (process.env.SHOWFEEL) console.log('      feel:', feel);
  await page.screenshot({ path: path.join(OUT, `${tag}_rest.png`) });
  // open the phone menu when there is one, then check every un-hidden control is on screen
  let menu = null;
  if (m.more) {
    await page.click('#hdrmore').catch(() => {});
    await page.waitForTimeout(400);
    menu = await page.evaluate((ids) => {
      const out = {}; for (const id of ids) { const e = document.getElementById(id); if (!e) { out[id] = null; continue; } const r = e.getBoundingClientRect(); out[id] = { hiddenAttr: e.hidden, shown: !e.hidden && r.width > 0 && r.height > 0 && r.x >= -1 && r.x + r.width <= innerWidth + 1 }; }
      const links = [...document.querySelectorAll('.top a.btn')].map(a => { const r = a.getBoundingClientRect(); return { t: a.textContent.trim(), shown: r.width > 0 && r.height > 0 && r.x >= -1 && r.x + r.width <= innerWidth + 1 }; });
      const more = document.getElementById('hdrmore');
      return { out, links, expanded: more?.getAttribute('aria-expanded'), focus: document.activeElement?.id || document.activeElement?.tagName, docW: document.documentElement.scrollWidth };
    }, CONTROLS);
    await page.screenshot({ path: path.join(OUT, `${tag}_menu.png`) });
    await page.keyboard.press('Escape'); await page.waitForTimeout(250);
    const after = await page.evaluate(() => ({ expanded: document.getElementById('hdrmore')?.getAttribute('aria-expanded'), focus: document.activeElement?.id }));
    menu.afterEsc = after;
  }
  // scroll to the bottom: the Ask button and the dock tab must not sit on the last content
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(500);
  const bottom = await page.evaluate(() => {
    const R = e => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
    const main = document.querySelector('main.wrap'); const mr = main ? main.getBoundingClientRect() : null;
    return { fab: R(document.getElementById('askbtn')), dockTab: R(document.getElementById('asofdocktab')), mainBottom: mr ? mr.bottom : null, innerH: innerHeight, padB: getComputedStyle(document.body).paddingBottom };
  });
  await page.screenshot({ path: path.join(OUT, `${tag}_bottom.png`) });
  results.push({ tag, width, height, m, menu, bottom, errs });
  const hh = m.header ? m.header.h : null;
  console.log(`--- ${tag}: header ${hh}px (topin ${m.topin?.h}, ticker ${m.ticker?.h}), position ${m.pos}, doc ${m.docW}/${m.innerW}, menu button ${m.more}`);
  if (width <= 700) {
    ok(`${tag} header at rest <= 120px`, hh != null && hh <= 120, `${hh}px of ${height}`);
    ok(`${tag} has the More menu`, m.more);
  }
  ok(`${tag} no horizontal overflow`, m.docW <= m.innerW + 1, `${m.docW}/${m.innerW}`);
  ok(`${tag} no page errors`, errs.length === 0, errs.join(' | '));
  if (warns.length) console.log(`      console warnings: ${[...new Set(warns)].slice(0, 6).join(' || ')}`);
  if (menu) {
    const OWNER_ONLY = ['alertsbtn', 'linkchip', 'mktchip', 'asofchip', 'asofbtn', 'dqchip', 'signout'];   // hidden by the access rules for a desk login
    const missing = CONTROLS.filter(id => { const o = menu.out[id]; return o && !o.hiddenAttr && id !== 'cmdbtn' && id !== 'asofchip' && !(ROLE === 'viewer' && OWNER_ONLY.includes(id)) && !o.shown; });
    ok(`${tag} every control reachable in the menu`, missing.length === 0, missing.join(','));
    ok(`${tag} owner links visible`, ROLE === 'viewer' || menu.links.length >= 3 && menu.links.every(l => l.shown), JSON.stringify(menu.links));
    ok(`${tag} aria-expanded true when open, false after Esc`, menu.expanded === 'true' && menu.afterEsc.expanded === 'false', JSON.stringify([menu.expanded, menu.afterEsc]));
    ok(`${tag} Esc returns focus to the More button`, menu.afterEsc.focus === 'hdrmore', menu.afterEsc.focus);
  }
  if (width <= 700 && bottom.mainBottom != null) {
    const fabTop = bottom.fab ? bottom.fab.y : bottom.innerH;
    ok(`${tag} content ends above the Ask button when scrolled to the end`, bottom.mainBottom <= fabTop + 2 || (bottom.fab && bottom.fab.w <= 56), `main bottom ${Math.round(bottom.mainBottom)} fab top ${Math.round(fabTop)} w ${bottom.fab && Math.round(bottom.fab.w)}`);
  }
  await ctx.close();
}
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(results.map(r => ({ tag: r.tag, header: r.m.header, topin: r.m.topin, ticker: r.m.ticker, rects: r.m.rects, clocks: r.m.clocks, tabs: r.m.tabs })), null, 1));
await browser.close(); server.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
