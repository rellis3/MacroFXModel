// scripts/flow-check.mjs: opens the real Desk Terminal in headless Chromium as the OWNER against the LIVE data and checks the flow features
// (At a glance on Overview, the Analytics section pills, the promoted links, the slim "What drives this" on Pair, the dense Monitor): they appear, they work,
// nothing overflows, no page errors. Not part of CI (needs a browser and the network).
//   PW_CORE=<node_modules/playwright-core> CHROME=<chrome.exe> node scripts/flow-check.mjs [outDir]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE || 'playwright-core');
const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const OUT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(ROOT, 'scratch_flow');
const LIVE = process.env.LIVE || 'https://macrofxmodel-production.up.railway.app';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const owner = { ok: true, role: 'owner', auth: true };
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname === '/api/desk-session') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(owner)); }
    if (u.pathname === '/api/desk-access') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ ok: true, role: 'owner', schema: 2, visible: [], saved: {} })); }
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
const report = [];
const ok = (name, pass, extra = '') => { report.push({ name, pass, extra }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const docWidth = page => page.evaluate(() => ({ doc: document.documentElement.scrollWidth, inner: document.documentElement.clientWidth }));

for (const theme of (process.env.THEMES ?? 'default,daylight').split(',')) {
  for (const width of (process.env.WIDTHS ?? '1440,390').split(',').map(Number)) {
    const tag = `${theme}@${width}`;
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(t => { try { localStorage.setItem('deskTheme', t); localStorage.removeItem('deskDensity:v1'); localStorage.removeItem('deskSlimDrives:v1'); localStorage.removeItem('deskAnalytics:v1'); } catch { /* none */ } }, theme);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    await page.goto(base + '/desk-terminal.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);

    // F7 at a glance
    const g = page.locator('#overview .fl-glance');
    await page.waitForFunction(() => document.querySelector('#overview')?.firstElementChild?.querySelector('.fl-glance') != null, null, { timeout: 30000 }).catch(() => {});
    const gi = await page.evaluate(() => ({ n: document.querySelectorAll('#overview .fl-glance').length, first: document.querySelector('#overview')?.firstElementChild?.className, kids: document.querySelector('#overview')?.children.length }));
    ok(`${tag} glance is the first thing on Overview`, gi.n === 1 && String(gi.first).includes('fl-host'), JSON.stringify(gi));
    await page.waitForTimeout(3000);
    const tiles = await page.$$eval('#overview .fl-tile', els => els.map(e => ({ l: e.querySelector('.fl-lbl')?.textContent, na: !!e.querySelector('.fl-na'), t: e.textContent.replace(/\s+/g, ' ').slice(0, 90) })));
    ok(`${tag} glance tiles`, tiles.length === 5, JSON.stringify(tiles.map(t => `${t.l}${t.na ? ' (n/a)' : ''}`)));
    if (await g.count()) await g.first().screenshot({ path: path.join(OUT, `glance_${theme}_${width}.png`) }).catch(() => {});
    const gw = await page.evaluate(() => { const e = document.querySelector('#overview .fl-glance'); return e ? { sw: e.scrollWidth, cw: e.clientWidth } : null; });
    ok(`${tag} glance fits its box`, !gw || gw.sw <= gw.cw + 2, gw ? `${gw.sw}/${gw.cw}` : '');
    await page.locator('#overview .fl-tile[data-go="insight.unusual"]').first().click().catch(() => {});
    await page.waitForTimeout(1500);
    ok(`${tag} the Unusual tile opens the Insight board`, await page.evaluate(() => document.querySelector('#tabs [data-t="insight"]')?.getAttribute('aria-selected') === 'true' && !document.querySelector('#in-p-unusual')?.hidden));
    const wo = await docWidth(page); ok(`${tag} insight page width`, wo.doc <= wo.inner + 1, `${wo.doc}/${wo.inner}`);

    // F9 Analytics split
    await page.locator('#tabs [data-t="ana"]').first().click(); await page.waitForFunction(() => document.querySelector('#ana .fl-anapills [data-ana]'), null, { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(800);
    const pills = await page.$$eval('#ana .fl-anapills [data-ana]', els => els.map(e => e.dataset.ana));
    ok(`${tag} Analytics pills`, pills.join() === 'market,desk', pills.join());
    const vis = () => page.$$eval('#ana .sfc[data-surface^="panel.ana."]', els => els.filter(e => !e.hidden).map(e => e.dataset.surface.replace('panel.ana.', '')));
    const v1 = await vis(); ok(`${tag} Market behaviour shows its blocks`, ['web', 'strength', 'volfc'].every(k => v1.includes(k)) && !v1.includes('track'), v1.join());
    await page.locator('#ana [data-ana="desk"]').click(); await page.waitForTimeout(500);
    const v2 = await vis(); ok(`${tag} The desk's record shows its blocks`, ['track', 'days'].every(k => v2.includes(k)) && !v2.includes('web'), v2.join());
    ok(`${tag} hash follows`, (await page.evaluate(() => location.hash)) === '#ana/desk');
    await page.screenshot({ path: path.join(OUT, `analytics_desk_${theme}_${width}.png`), fullPage: false }).catch(() => {});
    const wa = await docWidth(page); ok(`${tag} analytics page width`, wa.doc <= wa.inner + 1, `${wa.doc}/${wa.inner}`);

    // F10 promoted links
    await page.locator('#tabs [data-t="assets"]').first().click(); await page.waitForTimeout(2500);
    ok(`${tag} Assets has the gold board link`, (await page.locator('#assets .fl-promo[data-promo="panel.insight.gold"]').count()) === 1);
    await page.locator('#assets .fl-promo[data-promo="panel.insight.gold"]').first().click().catch(() => {}); await page.waitForTimeout(1500);
    ok(`${tag} the gold link opens the gold board`, await page.evaluate(() => !document.querySelector('#in-p-gold')?.hidden));
    await page.locator('#tabs [data-t="macro"]').first().click(); await page.waitForTimeout(2000);
    ok(`${tag} Macro has the world economies link`, (await page.locator('#macro .fl-promo[data-promo="panel.insight.economies"]').count()) === 1);

    // slim What drives this
    await page.evaluate(() => { location.hash = '#pair=GOLD'; }); await page.locator('#tabs [data-t="pair"]').first().click(); await page.waitForTimeout(5000);
    ok(`${tag} Pair shows the slim drivers`, (await page.locator('#pair .fl-slim').count()) === 1 && await page.evaluate(() => document.querySelector('#pair .card.hd')?.hidden === true));
    const sl = await page.evaluate(() => { const e = document.querySelector('#pair .fl-slim'); return e ? { t: e.textContent.replace(/\s+/g, ' ').slice(0, 140), sw: e.scrollWidth, cw: e.clientWidth } : null; });
    ok(`${tag} slim fits its box`, !sl || sl.sw <= sl.cw + 2, sl ? sl.t : '');
    await page.locator('#pair .fl-slim').first().screenshot({ path: path.join(OUT, `slim_${theme}_${width}.png`) }).catch(() => {});
    await page.locator('#pair .fl-more').first().click().catch(() => {}); await page.waitForTimeout(400);
    ok(`${tag} Read the full analysis shows the full card`, await page.evaluate(() => document.querySelector('#pair .card.hd')?.hidden === false));
    const wp = await docWidth(page); ok(`${tag} pair page width`, wp.doc <= wp.inner + 1, `${wp.doc}/${wp.inner}`);

    // dense Monitor
    await page.locator('#tabs [data-t="monitor"]').first().click(); await page.waitForTimeout(4000);
    const row = () => page.evaluate(() => { const td = document.querySelector('#monitor .mon-t tbody td'); return td ? Math.round(td.getBoundingClientRect().height) : null; });
    const h1 = await row();
    ok(`${tag} Monitor has the density button`, (await page.locator('#monitor [data-density-btn]').count()) === 1);
    await page.locator('#monitor [data-density-btn]').first().click(); await page.waitForTimeout(400);
    const h2 = await row();
    ok(`${tag} dense rows are shorter`, h1 != null && h2 != null && h2 < h1, `${h1}px -> ${h2}px`);
    ok(`${tag} dense is remembered`, await page.evaluate(() => localStorage.getItem('deskDensity:v1') === 'dense' && document.documentElement.dataset.density === 'dense'));
    await page.screenshot({ path: path.join(OUT, `monitor_dense_${theme}_${width}.png`), fullPage: false }).catch(() => {});
    const wm = await docWidth(page); ok(`${tag} monitor page width`, wm.doc <= wm.inner + 1, `${wm.doc}/${wm.inner}`);

    ok(`${tag} no page errors`, errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }
}
fs.writeFileSync(path.join(OUT, 'flow-report.json'), JSON.stringify(report, null, 1));
const bad = report.filter(r => !r.pass);
console.log(`\n${report.length - bad.length}/${report.length} checks passed`);
await browser.close(); server.close();
process.exit(bad.length ? 1 : 0);
