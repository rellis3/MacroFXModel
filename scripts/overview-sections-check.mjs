// scripts/overview-sections-check.mjs: opens the real Desk Terminal in headless Chromium against the LIVE data and checks the Overview sections preview
// (js/terminal/overviewSections.js) in two sessions: the OWNER (preview on: pills, one section at a time, hash, memory, keys, the hook) and a DESK LOGIN
// (preview off: the Overview is one long page exactly as before, trade and P&L blocks still hidden). Measures page width and page errors, writes screenshots.
// Not part of CI (needs a browser and the network).
//   PW_CORE=<node_modules/playwright-core> CHROME=<chrome.exe> node scripts/overview-sections-check.mjs [outDir]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE || 'playwright-core');
const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const OUT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(ROOT, 'scratch_ovs');
const LIVE = process.env.LIVE || 'https://macrofxmodel-production.up.railway.app';
const { SURFACES } = await import(pathToFileURL(path.join(ROOT, 'js/terminal/tabRegistry.js')).href);
const { OV_SUBS, ALL_BLOCKS } = await import(pathToFileURL(path.join(ROOT, 'js/terminal/overviewSubtabs.js')).href);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
// a desk login sees what the registry shows by default: everything not hidden (the previews are off, the trade, P&L, cost and internal blocks are hidden)
const viewerVisible = SURFACES.filter(s => !s.hidden).map(s => s.id);
let ROLE = 'owner';
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname === '/api/desk-session') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(ROLE === 'owner' ? { ok: true, role: 'owner', auth: true } : { ok: true, role: 'viewer', auth: true })); }
    if (u.pathname === '/api/desk-access') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(ROLE === 'owner' ? { ok: true, role: 'owner', schema: 2, visible: [], saved: {} } : { ok: true, role: 'viewer', schema: 2, visible: viewerVisible, saved: {} })); }
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
let fails = 0;
const ok = (name, pass, extra = '') => { if (!pass) fails++; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const docWidth = page => page.evaluate(() => ({ doc: document.documentElement.scrollWidth, inner: document.documentElement.clientWidth }));
const blocksState = page => page.evaluate(ids => [...document.querySelectorAll('#overview .sfc')].filter(e => ids.includes(e.dataset.surface)).map(e => ({ id: e.dataset.surface, off: e.classList.contains('ovs-off'), shown: getComputedStyle(e).display !== 'none', filled: !!e.textContent.trim() || e.children.length > 0 })), ALL_BLOCKS);

for (const theme of (process.env.THEMES ?? 'default,daylight').split(',')) {
  for (const width of (process.env.WIDTHS ?? '1440,390').split(',').map(Number)) {
    for (const role of ['owner', 'viewer']) {
      ROLE = role;
      const tag = `${role} ${theme}@${width}`;
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
      await ctx.addInitScript(t => { try { localStorage.setItem('deskTheme', t); localStorage.removeItem('deskOverviewSub:v1'); } catch { /* ignore */ } }, theme);
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
      await page.goto(base + '/desk-terminal.html', { waitUntil: 'domcontentloaded' });
      if (role === 'owner') {
        await page.waitForSelector('#overview .ovs-pills', { timeout: 45000 }).catch(() => {});
        await page.waitForTimeout(6000);   // the xo blocks (risk state, EM, strength in sigma...) arrive a little later
        const labels = await page.$$eval('#overview .ovs-pills [data-ovsub]', els => els.map(e => e.textContent));
        ok(`${tag} pills are there`, labels.length >= 3, labels.join(' | '));
        const pre = await page.evaluate(() => { const p = document.querySelector('#overview .ovs-pills'); const prev = p?.previousElementSibling; return { prev: prev?.className ?? '', glance: !!prev?.querySelector?.('.fl-glance') || (prev?.className ?? '').includes('fl-'), first: document.querySelector('#overview')?.firstElementChild?.className ?? '' }; });
        ok(`${tag} the pills sit under the glance`, pre.glance || pre.prev.includes('fl-'), JSON.stringify(pre));
        const ids = await page.$$eval('#overview .ovs-pills [data-ovsub]', els => els.map(e => e.dataset.ovsub));
        const seen = new Set();
        for (const id of ids) {
          await page.locator(`#overview .ovs-pills [data-ovsub="${id}"]`).click(); await page.waitForTimeout(500);
          const st = await blocksState(page);
          const want = new Set(OV_SUBS.find(s => s.id === id).blocks);
          const wrong = st.filter(b => b.shown && !want.has(b.id)), missing = st.filter(b => !b.shown && want.has(b.id));
          st.filter(b => b.shown && want.has(b.id)).forEach(b => seen.add(b.id));
          ok(`${tag} ${id}: only its blocks are on screen`, wrong.length === 0 && missing.length === 0, `shown ${st.filter(b => b.shown).map(b => b.id.replace('panel.ov.', '')).join(',')}${wrong.length ? ' WRONG ' + wrong.map(b => b.id) : ''}${missing.length ? ' MISSING ' + missing.map(b => b.id) : ''}`);
          const gh = await page.evaluate(() => location.hash); ok(`${tag} ${id}: hash`, gh === `#overview/${id}`, gh);
          const w = await docWidth(page); ok(`${tag} ${id}: page width`, w.doc <= w.inner + 1, `${w.doc}/${w.inner}`);
          await page.screenshot({ path: path.join(OUT, `ov_${id}_${theme}_${width}.png`), fullPage: false }).catch(() => {});
        }
        const allPresent = (await blocksState(page)).filter(b => b.filled).map(b => b.id);
        ok(`${tag} every block that drew is in some section`, allPresent.every(id => seen.has(id)) , `drawn ${allPresent.length}, seen ${seen.size}${allPresent.filter(id => !seen.has(id)).length ? ' NOT SEEN ' + allPresent.filter(id => !seen.has(id)) : ''}`);
        // the choice is remembered and a #overview/ address wins
        await page.locator('#overview .ovs-pills [data-ovsub="news"]').click().catch(() => {});
        await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('#overview .ovs-pills', { timeout: 45000 }).catch(() => {}); await page.waitForTimeout(2500);
        ok(`${tag} the section is remembered`, await page.evaluate(() => document.querySelector('#overview [data-ovsub="news"]')?.getAttribute('aria-pressed') === 'true' || document.querySelector('#overview [data-ovsub="today"]')?.getAttribute('aria-pressed') === 'true'), await page.evaluate(() => [...document.querySelectorAll('#overview [data-ovsub]')].filter(e => e.getAttribute('aria-pressed') === 'true').map(e => e.dataset.ovsub).join()));
        // keys
        await page.locator('#overview .ovs-pills [data-ovsub][aria-pressed="true"]').focus(); await page.keyboard.press('Home'); await page.waitForTimeout(300);
        const first = await page.evaluate(() => document.querySelector('#overview [data-ovsub][aria-pressed="true"]')?.dataset.ovsub);
        await page.keyboard.press('ArrowRight'); await page.waitForTimeout(300);
        const second = await page.evaluate(() => document.querySelector('#overview [data-ovsub][aria-pressed="true"]')?.dataset.ovsub);
        ok(`${tag} Home and ArrowRight move along the pills`, first === ids[0] && second === ids[1], `${first} -> ${second}`);
        ok(`${tag} the hook opens a section`, await page.evaluate(() => typeof window.openOverviewSection === 'function' && window.openOverviewSection('desk') === true && document.querySelector('#overview [data-ovsub="desk"]')?.getAttribute('aria-pressed') === 'true'));
        // another tab and back: still one section
        await page.locator('#tabs [data-t="assets"]').first().click(); await page.waitForTimeout(800);
        await page.locator('#tabs [data-t="overview"]').first().click(); await page.waitForTimeout(800);
        ok(`${tag} back on Overview the pills are still there`, (await page.locator('#overview .ovs-pills').count()) === 1);
        await page.evaluate(() => { location.hash = '#overview/risk'; }); await page.waitForTimeout(800);
        ok(`${tag} a #overview/risk address opens Risk and markets`, await page.evaluate(() => document.querySelector('#overview [data-ovsub="risk"]')?.getAttribute('aria-pressed') === 'true'));
      } else {
        await page.waitForTimeout(14000);
        ok(`${tag} no pill row for a desk login (preview off)`, (await page.locator('#overview .ovs-pills').count()) === 0);
        const st = await blocksState(page);
        ok(`${tag} no block carries a section class`, st.every(b => !b.off), `${st.length} blocks`);
        const trade = st.filter(b => ['panel.ov.tradewatch', 'panel.ov.playbooks', 'panel.ov.bestpairs', 'panel.ov.record', 'panel.ov.alerts'].includes(b.id));
        ok(`${tag} trade, P&L and internal blocks stay hidden`, trade.every(b => !b.shown), trade.map(b => `${b.id}:${b.shown}`).join(','));
        await page.screenshot({ path: path.join(OUT, `ov_viewer_${theme}_${width}.png`), fullPage: false }).catch(() => {});
        const w = await docWidth(page); ok(`${tag} page width`, w.doc <= w.inner + 1, `${w.doc}/${w.inner}`);
      }
      ok(`${tag} no page errors`, errs.length === 0, errs.slice(0, 2).join(' | '));
      await ctx.close();
    }
  }
}
await browser.close(); server.close();
console.log(fails ? `\n${fails} check(s) FAILED` : '\nall checks passed');
process.exit(fails ? 1 : 0);
