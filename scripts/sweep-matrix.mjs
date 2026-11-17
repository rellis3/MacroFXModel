// scripts/sweep-matrix.mjs: the verification sweep. Opens the real Desk Terminal in headless Chromium against the LIVE data, as a stubbed role, per theme and width,
// visits every tab (and every sub-pill), and records: console errors and warnings, failed requests, whole-page overflow and card overflow, loading cards that never
// finished, text under 4.5:1 contrast, the phone header height, the docked time bar against Ask the desk, tab order; and, for a desk login, what the role stub leaves in the DOM.
//   PW_CORE=<node_modules/playwright-core> CHROME=<chrome.exe> ROLE=owner|desk|deskprev THEMES=default,daylight WIDTHS=1440,390 TABSET=key|other|all [TABS=macro,pair] OUT=<dir> node scripts/sweep-matrix.mjs
// Not part of CI (needs a browser and the network). The API is the live site's (read-only GETs, cached 2 minutes here to spare it); the role is stubbed client-side.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE || 'playwright-core');
const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const LIVE = process.env.LIVE || 'https://macrofxmodel-production.up.railway.app';
const ROLE = process.env.ROLE || 'owner';
const THEMES = (process.env.THEMES || 'default').split(',');
const WIDTHS = (process.env.WIDTHS || '1440').split(',').map(Number);
const TABSET = process.env.TABSET || 'key';
const OUT = process.env.OUT || path.join(ROOT, 'scratch_sweep');
const WAIT = Number(process.env.WAIT || 1500);
const SHOTS = process.env.SHOTS || 'key390';   // none | key390 | all
const KEY = new Set(['overview', 'pair', 'insight', 'macro', 'options', 'monitor', 'assets']);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const { SURFACES } = await import('../js/terminal/tabRegistry.js');
const liveAccess = await (await fetch(LIVE + '/api/desk-access')).json();
const previewIds = SURFACES.filter(s => s.hidden === 'preview').map(s => s.id);
const visibleFor = ROLE === 'owner' ? [] : ROLE === 'deskprev' ? [...new Set([...liveAccess.visible, ...previewIds])] : liveAccess.visible;
const J = o => JSON.stringify(o);
const cache = new Map();
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname === '/api/desk-session') { res.setHeader('content-type', 'application/json'); return res.end(J(ROLE === 'owner' ? { ok: true, role: 'owner', auth: true } : { ok: true, role: null, deskLogin: true, auth: true })); }
    if (u.pathname === '/api/desk-access') { res.setHeader('content-type', 'application/json'); return res.end(J(ROLE === 'owner' ? { ok: true, role: 'owner', schema: 2, visible: [], saved: {} } : { ok: true, role: 'viewer', schema: 2, visible: visibleFor })); }
    if (u.pathname.startsWith('/api/')) {
      const k = req.method + ' ' + req.url, hit = cache.get(k);
      if (req.method === 'GET' && hit && Date.now() - hit.t < 120000) { res.statusCode = hit.s; res.setHeader('content-type', hit.ct); return res.end(hit.b); }
      const r = await fetch(LIVE + req.url, { method: req.method === 'GET' ? 'GET' : req.method, headers: { accept: 'application/json' }, signal: AbortSignal.timeout(60000) });
      const b = Buffer.from(await r.arrayBuffer()), ct = r.headers.get('content-type') ?? 'application/json';
      if (req.method === 'GET') cache.set(k, { t: Date.now(), s: r.status, ct, b });
      res.statusCode = r.status; res.setHeader('content-type', ct); return res.end(b);
    }
    const f = path.join(ROOT, decodeURIComponent(u.pathname === '/' ? '/desk-terminal.html' : u.pathname));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end('nf'); }
    res.setHeader('content-type', MIME[path.extname(f)] ?? 'application/octet-stream'); res.end(fs.readFileSync(f));
  } catch (e) { res.statusCode = 502; res.end(String(e)); }
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
fs.mkdirSync(OUT, { recursive: true });

// ---- in-page measures ----
const MEASURE_PAGE = () => {
  const iw = document.documentElement.clientWidth;
  const clipped = el => { for (let e = el.parentElement; e && e !== document.documentElement; e = e.parentElement) { const o = getComputedStyle(e).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return true; } return false; };
  const path = el => { const out = []; for (let e = el, i = 0; e && e !== document.body && i < 3; e = e.parentElement, i++) out.push(e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/)[0] : '')); return out.join(' < '); };
  const roots = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (el.closest('svg, canvas, .tk, #tk, .ticker, [data-surface="strip.news"], [data-surface="strip.events"]')) continue;
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') continue;
    const r = el.getBoundingClientRect(); if (!r.width || r.right <= iw + 1 || clipped(el)) continue;
    const p = el.parentElement, pr = p.getBoundingClientRect();
    if (p === document.body || pr.right <= iw + 1 || cs.position === 'absolute') roots.push({ at: path(el), txt: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40), width: Math.round(r.width), right: Math.round(r.right) });
  }
  return { docScroll: document.documentElement.scrollWidth, inner: iw, nroot: roots.length, root: roots.slice(0, 4) };
};
const MEASURE_CARDS = () => {
  const sec = (document.getElementById(window.__curTab) ?? document.body);
  const scrolls = el => { for (let e = el; e && e !== document.body; e = e.parentElement) { const o = getComputedStyle(e).overflowX; if (o === 'auto' || o === 'scroll') return true; if (e === sec) break; } return false; };
  const bad = [];
  for (const el of sec.querySelectorAll('*')) {
    if (el.closest('svg, canvas, .tk, #tk, .ticker')) continue;
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect(); if (!r.width) continue;
    const card = el.closest('.card, .in-li, .in-tblw');
    const spills = el.scrollWidth > el.clientWidth + 2 && cs.overflowX === 'visible' && !scrolls(el) && el.clientWidth > 0;
    const out = card && card !== el && r.right > card.getBoundingClientRect().right + 2 && !scrolls(el);
    if (spills || out) bad.push((el.tagName.toLowerCase() + '.' + String(el.className).trim().split(/\s+/)[0]).slice(0, 50) + ' "' + (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30) + '"');
  }
  return { n: bad.length, ex: bad.slice(0, 3) };
};
const MEASURE_STATE = () => {
  const sec = (document.getElementById(window.__curTab) ?? document.body);
  const vis = el => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  // loading cards that never finished
  const loading = [];
  for (const el of sec.querySelectorAll('*')) { if (el.children.length) continue; const t = (el.textContent || '').trim(); if (t && t.length < 40 && /^(loading|reading|fetching|building)\b.*|^…$|^\.\.\.$/i.test(t) && vis(el)) loading.push(t); }
  // contrast
  const parse = s => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b); };
  const over = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  const bgOf = el => { const stack = []; for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.backgroundImage && cs.backgroundImage !== 'none') return null; const c = parse(cs.backgroundColor); if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; } } let base = { r: 255, g: 255, b: 255, a: 1 }; if (!stack.length || stack[stack.length - 1].a < 1) { const pb = parse(getComputedStyle(document.body).backgroundColor); if (pb && pb.a > 0) base = pb; } for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base); return base; };
  const low = []; let checked = 0, below = 0; const seen = new Set();
  for (const el of sec.querySelectorAll('*')) {
    if (checked > 500) break;
    if (el.closest('svg, canvas, .tk, #tk, .ticker, .asof-dock, .fab')) continue;
    let own = ''; for (const n of el.childNodes) if (n.nodeType === 3) own += n.nodeValue; own = own.trim(); if (own.length < 3 || !vis(el)) continue;
    const cs = getComputedStyle(el); const fg = parse(cs.color); if (!fg) continue; const bg = bgOf(el); if (!bg) continue;
    let op = 1; for (let e = el; e && e !== document.body; e = e.parentElement) op *= Number(getComputedStyle(e).opacity); const eff = over({ ...fg, a: fg.a * op }, bg);
    const ratio = (Math.max(lum(eff), lum(bg)) + .05) / (Math.min(lum(eff), lum(bg)) + .05);
    const size = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700, large = size >= 24 || (size >= 18.66 && bold);
    checked++;
    if (ratio < (large ? 3 : 4.5)) { below++; const key = (el.className || el.tagName) + '|' + cs.color; if (!seen.has(key) && low.length < 6) { seen.add(key); low.push({ el: (el.tagName.toLowerCase() + '.' + String(el.className).trim().split(/\s+/)[0]).slice(0, 40), txt: own.slice(0, 28), ratio: Math.round(ratio * 100) / 100, fg: cs.color, size }); } }
  }
  const hdr = document.querySelector('header.top'); const dock = document.getElementById('asofdock'), ask = document.getElementById('askbtn');
  const rr = e => { if (!e) return null; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return null; const r = e.getBoundingClientRect(); return r.width && r.height ? r : null; };
  const a = rr(dock), b = rr(ask);
  const overlap = a && b && !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
  return { loading: loading.length, loadingEx: loading.slice(0, 3), contrastChecked: checked, contrastLow: below, contrastEx: low, header: hdr ? Math.round(hdr.getBoundingClientRect().height) : null, dock: a ? Math.round(a.height) : 0, askDockOverlap: !!overlap, textLen: (sec.textContent || '').trim().length };
};

const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true });
const events = [], rows = [], role = [];
const regIds = SURFACES.map(s => s.id), hiddenForDesk = ROLE === 'owner' ? [] : regIds.filter(id => !visibleFor.includes(id));
for (const theme of THEMES) for (const width of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 700 ? 844 : 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(t => { try { localStorage.setItem('deskTheme', t); } catch { /* none */ } }, theme);
  const page = await ctx.newPage(); let cur = 'load';
  const ev = o => events.push({ role: ROLE, theme, width, tab: cur, ...o });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') ev({ kind: 'console.' + m.type(), text: m.text().slice(0, 220) }); });
  page.on('pageerror', e => ev({ kind: 'pageerror', text: String(e).slice(0, 220) }));
  page.on('response', r => { if (r.status() >= 400) { const u = new URL(r.url()); ev({ kind: 'http' + r.status(), text: u.pathname + (u.search ? '?' : '') }); } });
  page.on('requestfailed', r => { const u = new URL(r.url()); ev({ kind: 'reqfailed', text: u.pathname + ' ' + (r.failure()?.errorText ?? '') }); });
  await page.goto(base + '/desk-terminal.html', { waitUntil: 'domcontentloaded', timeout: 150000 });
  await page.waitForTimeout(5000);
  const tabs = await page.$$eval('.tabs button[data-t]', els => els.map(e => ({ t: e.dataset.t, s: e.dataset.surface, vis: !!(e.offsetParent || getComputedStyle(e).position === 'fixed') })));
  const only = process.env.TABS ? process.env.TABS.split(',') : null;
  const pickTabs = tabs.filter(x => only ? only.includes(x.t) : (TABSET === 'all' || (TABSET === 'key' ? KEY.has(x.t) : !KEY.has(x.t))));
  // first-state measures (load): tab order, role
  if (theme === THEMES[0]) {
    const seq = []; await page.mouse.click(2, 2).catch(() => {}); for (let i = 0; i < 40; i++) { await page.keyboard.press('Tab'); seq.push(await page.evaluate(() => { const e = document.activeElement; return e ? (e.id || e.getAttribute('aria-label') || e.dataset?.t || e.textContent?.trim().slice(0, 18) || e.tagName) : '-'; })); }
    role.push({ kind: 'taborder', theme, width, seq: seq.slice(0, 40) });
    const feel = await page.evaluate(() => { const f = globalThis.__deskFeel ?? {}; return Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v?.loaded ? 'loaded' : v?.error ? 'error:' + String(v.error).slice(0, 50) : v?.requested ? 'requested' : 'off'])); });
    role.push({ kind: 'feel', theme, width, feel });
    if (ROLE !== 'owner' && (theme === 'default')) {
      const leak = await page.evaluate(hid => { const out = { rendered: [], present: [] }; for (const id of hid) for (const el of document.querySelectorAll(`[data-surface="${id}"]`)) { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); const shown = cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; const tl = (el.textContent || '').trim().length; if (shown) out.rendered.push({ id, tag: el.tagName.toLowerCase(), text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60) }); else if (tl > 20) out.present.push({ id, tl }); } return out; }, hiddenForDesk);
      role.push({ kind: 'leak', theme, width, rendered: leak.rendered.slice(0, 40), nRendered: leak.rendered.length, presentHidden: leak.present.slice(0, 60), nPresentHidden: leak.present.length });
      const bias = await page.evaluate(() => ['panel.ov.engine', 'panel.ccy.engine', 'panel.asset.engine', 'panel.pair.engine', 'panel.replay.engine'].map(id => { const els = [...document.querySelectorAll(`[data-surface="${id}"]`)]; return { id, n: els.length, shown: els.filter(e => { const r = e.getBoundingClientRect(); return getComputedStyle(e).display !== 'none' && r.width > 0; }).length, text: els[0] ? (els[0].textContent || '').trim().replace(/\s+/g, ' ').slice(0, 300) : null, chips: els[0] ? [...els[0].querySelectorAll('.chip, .evchip, [class*=chip]')].map(c => c.textContent.trim()).slice(0, 6) : [] }; }));
      role.push({ kind: 'bias-engine-load', theme, width, bias });
      // the command line list
      await page.keyboard.press('Escape').catch(() => {}); await page.mouse.click(2, 2).catch(() => {}); await page.keyboard.press('/'); await page.waitForTimeout(500);
      const open = await page.evaluate(() => !!document.querySelector('#cmdk-back:not([hidden])'));
      let cmds = null; if (open) { await page.fill('#cmdk-input', '?').catch(() => {}); await page.waitForTimeout(500); cmds = await page.evaluate(() => [...document.querySelectorAll('.cmdk-all tr td:first-child')].map(td => td.textContent.trim().replace(/\s+/g, ' '))); await page.keyboard.press('Escape'); }
      role.push({ kind: 'commands', theme, width, open, cmds });
    }
    if (ROLE === 'owner' && theme === 'default') {
      await page.mouse.click(2, 2).catch(() => {}); await page.keyboard.press('/'); await page.waitForTimeout(500);
      const open = await page.evaluate(() => !!document.querySelector('#cmdk-back:not([hidden])'));
      let cmds = null; if (open) { await page.fill('#cmdk-input', '?').catch(() => {}); await page.waitForTimeout(500); cmds = await page.evaluate(() => [...document.querySelectorAll('.cmdk-all tr td:first-child')].map(td => td.textContent.trim().replace(/\s+/g, ' '))); await page.keyboard.press('Escape'); }
      role.push({ kind: 'commands', theme, width, open, cmds });
    }
  }
  for (const tb of pickTabs) {
    cur = tb.t; await page.evaluate(t => { window.__curTab = t; }, tb.t);
    if (!tb.vis) { rows.push({ role: ROLE, theme, width, tab: tb.t, skipped: 'tab button not visible' }); continue; }
    const btn = page.locator(`.tabs button[data-t="${tb.t}"]`).first();
    await btn.click({ timeout: 4000 }).catch(async () => { await page.evaluate(t => document.querySelector(`.tabs button[data-t="${t}"]`)?.click(), tb.t); });
    await page.waitForTimeout(WAIT);
    const pills = await page.evaluate(() => { const sec = document.getElementById(window.__curTab); if (!sec) return []; return [...sec.querySelectorAll('.in-tab, [role="tablist"] [role="tab"]')].filter(e => e.offsetParent).map((e, i) => ({ i, label: (e.dataset.p || e.textContent).trim().slice(0, 24), cls: (e.className || '').toString().trim().split(/\s+/)[0] })); });
    const uniq = []; const seenL = new Set(); for (const p of pills) { if (!seenL.has(p.label)) { seenL.add(p.label); uniq.push(p); } }
    const states = uniq.length ? uniq.slice(0, 14) : [null];
    for (const p of states) {
      if (p) { await page.evaluate(({ label }) => { const sec = document.getElementById(window.__curTab); const el = [...sec.querySelectorAll('.in-tab, [role="tablist"] [role="tab"]')].find(e => (e.dataset.p || e.textContent).trim().slice(0, 24) === label); el?.click(); }, p).catch(() => {}); await page.waitForTimeout(WAIT); }
      const pw = await page.evaluate(MEASURE_PAGE), cd = await page.evaluate(MEASURE_CARDS), st = await page.evaluate(MEASURE_STATE);
      let loadingAfter = null; if (st.loading > 0) { await page.waitForTimeout(6000); loadingAfter = (await page.evaluate(MEASURE_STATE)); }
      const name = `${ROLE}_${tb.t}${p ? '-' + p.label.replace(/[^a-z0-9]+/gi, '_') : ''}_${theme}_${width}`;
      if (SHOTS === 'all' || (SHOTS === 'key390' && width < 700 && (KEY.has(tb.t)) && !p)) await page.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});
      rows.push({ role: ROLE, theme, width, tab: tb.t, pill: p?.label ?? null, docScroll: pw.docScroll, inner: pw.inner, overflowRoot: pw.nroot, root: pw.root, cardSpill: cd.n, cardEx: cd.ex, loading: st.loading, loadingEx: st.loadingEx, loadingAfter: loadingAfter ? loadingAfter.loading : null, loadingAfterEx: loadingAfter ? loadingAfter.loadingEx : null, contrastChecked: st.contrastChecked, contrastLow: st.contrastLow, contrastEx: st.contrastEx, header: st.header, dock: st.dock, askDockOverlap: st.askDockOverlap, textLen: st.textLen });
    }
  }
  // hash fallback for hidden tabs (desk roles)
  if (ROLE !== 'owner' && theme === 'default') {
    const hiddenTabs = SURFACES.filter(s => s.id.startsWith('tab.') && hiddenForDesk.includes(s.id)).map(s => s.id.slice(4));
    const res = [];
    for (const t of hiddenTabs) {
      cur = 'hash:' + t; const before = events.length;
      await page.evaluate(h => { location.hash = '#' + h; }, t); await page.waitForTimeout(900);
      const r = await page.evaluate(h => { const sec = document.querySelector('section:not([hidden])'); const hiddenSec = document.querySelector(`#t-${h}, [data-tab="${h}"], section[data-t="${h}"]`); return { active: sec?.id || sec?.dataset?.t || null, hiddenShown: !!(hiddenSec && hiddenSec.getBoundingClientRect().height > 0 && getComputedStyle(hiddenSec).display !== 'none') }; }, t);
      res.push({ t, ...r, newErrors: events.slice(before).filter(e => e.kind.startsWith('console.error') || e.kind === 'pageerror').length });
    }
    role.push({ kind: 'hashfallback', theme, width, res });
  }
  await ctx.close();
}
fs.writeFileSync(path.join(OUT, `sweep_${ROLE}_${TABSET}_${THEMES.join('+')}_${WIDTHS.join('+')}.json`), J({ events, rows, role }));
console.log(`done ${ROLE} ${TABSET} ${THEMES} ${WIDTHS}: ${rows.length} states, ${events.length} events`);
await browser.close(); server.close();
