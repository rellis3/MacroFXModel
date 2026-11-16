// scripts/preview-check.mjs: opens the real Desk Terminal in headless Chromium, as the owner, against the LIVE data, drives ONE preview feature and checks that it draws,
// has no page errors and nothing overflows. Not part of CI (needs a browser and the network). Sibling of scripts/insight-overflow.mjs (same stand-in owner session).
//   PW_CORE=<path to node_modules/playwright-core> CHROME=<chrome.exe> node scripts/preview-check.mjs --case=event [--out=dir]
// Cases: event (Calendar tab > Event replay), changed (Changed tab), flags (Insight > Risk flags and Overview), oidrill (Options tab OI card drill), bis (Macro > Credit), smile (Options tab IV smile replay).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE || 'playwright-core');
const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) ?? '').slice(k.length + 3);
const CASE = arg('case') || 'event', OUT = arg('out') || path.join(ROOT, 'scratch_preview'), LIVE = process.env.LIVE || 'https://macrofxmodel-production.up.railway.app';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const owner = { ok: true, role: 'owner', auth: true };
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname === '/api/desk-session') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(owner)); }
    if (u.pathname === '/api/desk-access') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ ok: true, role: 'owner', schema: 2, visible: [], saved: {} })); }
    if (u.pathname.startsWith('/api/')) { const r = await fetch(LIVE + req.url, { headers: { accept: 'application/json' } }); res.statusCode = r.status; res.setHeader('content-type', r.headers.get('content-type') ?? 'application/json'); return res.end(Buffer.from(await r.arrayBuffer())); }
    const f = path.join(ROOT, decodeURIComponent(u.pathname === '/' ? '/desk-terminal.html' : u.pathname));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end('nf'); }
    res.setHeader('content-type', MIME[path.extname(f)] ?? 'application/octet-stream'); res.end(fs.readFileSync(f));
  } catch (e) { res.statusCode = 502; res.end(String(e)); }
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
fs.mkdirSync(OUT, { recursive: true });

/** What overflows inside `sel` (or the whole page when sel is null): blocks wider than their box with no scroll container, or poking past the viewport. */
const MEASURE = sel => {
  const root = (sel && document.querySelector(sel)) || document.body, bad = [];
  const scrolls = el => { for (let e = el; e && e !== root.parentElement; e = e.parentElement) { const o = getComputedStyle(e).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
  for (const el of root.querySelectorAll('*')) {
    if (el.closest('svg, canvas, .tk, #tk, .ticker, [data-surface="strip.news"], [data-surface="strip.events"]')) continue;
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect(); if (!r.width) continue;
    const spills = el.scrollWidth > el.clientWidth + 2 && cs.overflowX === 'visible' && !scrolls(el) && el.clientWidth > 0, wide = r.right > innerWidth + 2 && !scrolls(el);
    if (spills || wide) bad.push({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 50), sw: el.scrollWidth, cw: el.clientWidth, right: Math.round(r.right), txt: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50) });
  }
  return { docScroll: document.documentElement.scrollWidth, inner: innerWidth, nbad: bad.length, bad: bad.slice(0, 8), text: (root.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 240), svgs: root.querySelectorAll('svg').length };
};

const CASES = {
  async changed(page, shot) {
    await page.locator('button[data-t="changed"]').first().click(); await page.waitForSelector('[data-sl-card] .sl-span, [data-sl-card] .muted', { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(1500);
    if (!(await page.locator('[data-sl-card]').count())) return { ok: false, why: 'no since-you-last-looked card on the Changed tab' };
    await shot('changed-default');
    const out = { ok: true, dialog: '[data-sl-card]' };
    out.cap = await page.locator('[data-sl-card] .sl-span').first().textContent().catch(() => '');
    out.items = await page.locator('[data-sl-card] .sl-list li').count();
    out.first = await page.locator('[data-sl-card] .sl-list li').first().textContent().catch(() => '');
    await page.locator('[data-sl-r="24h"]').first().click().catch(() => {}); await page.waitForTimeout(4000); await shot('changed-24h');
    out.cov = await page.locator('[data-sl-card] .sl-span').first().textContent().catch(() => '');
    out.items24 = await page.locator('[data-sl-card] .sl-list li').count();
    return out;
  },
  async event(page, shot) {
    await page.locator('button[data-t="cal"]').first().click(); await page.waitForSelector('[data-evr-open]', { timeout: 20000 }).catch(() => {});
    const btn = page.locator('[data-evr-open]').first(); if (!(await btn.count())) return { ok: false, why: 'no Event replay button on the Calendar tab' };
    await btn.click(); await page.waitForSelector('#rpv-stage svg', { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(800);
    const out = { ok: true, steps: [] };
    await shot('event-open');
    for (const k of ['next', 'next', 'next']) { await page.locator('[data-rpv="next"]').first().click().catch(() => {}); }
    await page.locator('#rpv-scrub').evaluate(el => { el.value = String(Math.min(+el.max, 70)); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }).catch(() => {});
    await page.waitForTimeout(500); await shot('event-plus40');
    out.cap = await page.locator('#rpv-cap').textContent().catch(() => ''); out.cov = await page.locator('#rpv-cov').textContent().catch(() => '');
    const picks = await page.$$eval('.rpv-picks button', els => els.map(e => e.textContent.trim()).slice(0, 40)); out.picks = picks.length;
    const m = await page.locator('.rpv-picks[aria-label="Market"] button').nth(2).click().then(() => page.waitForTimeout(2500)).catch(() => {}); await shot('event-other-market');
    out.after = await page.locator('#rpv-cap').textContent().catch(() => '');
    return { ...out, dialog: '#rpv-back' };
  },
};
const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true });
const results = [];
for (const [theme, width] of (process.env.RUNS ?? 'default:1440,default:390,daylight:1440').split(',').map(s => s.split(':'))) {
  const ctx = await browser.newContext({ viewport: { width: +width, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(t => { try { localStorage.setItem('deskTheme', t); } catch { /* none */ } }, theme);
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
  await page.goto(base + '/desk-terminal.html', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4500);
  const shot = n => page.screenshot({ path: path.join(OUT, `${n}_${theme}_${width}.png`), fullPage: false }).catch(() => {});
  let r; try { r = await CASES[CASE](page, shot); } catch (e) { r = { ok: false, why: String(e).slice(0, 200) }; }
  const m = r.dialog ? await page.evaluate(MEASURE, r.dialog) : await page.evaluate(MEASURE, null);
  results.push({ theme, width: +width, ...r, measure: m, errors });
  await ctx.close();
}
fs.writeFileSync(path.join(OUT, `${CASE}-report.json`), JSON.stringify(results, null, 1));
for (const r of results) console.log(`${r.theme} ${r.width}: ok=${r.ok} ${r.why ?? ''} svgs=${r.measure?.svgs} overflow=${r.measure?.nbad} doc=${r.measure?.docScroll}/${r.measure?.inner} errors=${r.errors.length}${r.errors.length ? ' ' + r.errors[0] : ''}${r.cap ? '\n   caption: ' + r.cap.slice(0, 200) : ''}${r.cov ? '\n   coverage: ' + r.cov.slice(0, 220) : ''}`);
await browser.close(); server.close();
