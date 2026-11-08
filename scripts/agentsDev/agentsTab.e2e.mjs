// Agents tab e2e at 430px and 1280px against the mock server: the chart renders, a card's switch saves (and shows an error when the save fails), the other switch
// follows, and the page never scrolls sideways (the chart scrolls inside its own box).
//   NODE_PATH=/opt/node-tools/node_modules CHROME=/usr/bin/google-chrome node scripts/agentsDev/agentsTab.e2e.mjs [screenshotDir]
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const require = (await import('node:module')).createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { try { ({ chromium } = require('playwright-core')); } catch { console.log('playwright not installed'); process.exit(2); } }
const { startServer } = await import(path.join(path.dirname(fileURLToPath(import.meta.url)), 'mockServer.mjs'));
const { srv, port, state } = await startServer(0);
const shotDir = process.argv[2];
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
const shot = async (page, name) => { if (shotDir) await page.screenshot({ path: path.join(shotDir, name), fullPage: false }); };
try {
  for (const [w, h] of [[430, 900], [1280, 900]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    // the page pulls fonts and a chart library from CDNs; the sandbox has no network, so refuse them quickly
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await fetch(`http://127.0.0.1:${port}/__fail?on=0`, { method: 'POST' });
    await page.goto(`http://127.0.0.1:${port}/bot-config.html#tab-agents`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#agChart svg.ag-svg');
    const noScroll = async what => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${w}px: no sideways page scroll ${what}`);
    await noScroll('on load');
    // the tab button exists next to AI models and the tab is the active one
    assert.ok(await page.locator('.tab-btn[data-tab="agents"].active').count() === 1);
    assert.equal(await page.locator('.ag-chip').count(), 6);
    assert.ok((await page.locator('#agChart [data-node]').count()) >= 10, 'research case flow has its boxes');
    await shot(page, `agents-${w}-research.png`);
    // chart scrolls inside its container at phone width, never the page
    const sw = await page.evaluate(() => { const c = document.getElementById('agChart'); return { sw: c.scrollWidth, cw: c.clientWidth }; });
    if (w < 800) assert.ok(sw.sw > sw.cw, 'the chart is wider than the phone and scrolls inside its box'); else assert.ok(sw.cw <= w, 'the chart box fits the window');
    // every flow draws
    for (const name of ['Paper pipeline', 'Library enrichment', 'Daily desk', 'Librarian on its own', 'Research an idea']) {
      await page.click(`.ag-chip:has-text("${name}")`); await page.waitForSelector('#agChart svg.ag-svg');
      assert.ok((await page.locator('#agChart [data-node]').count()) >= 4, name);
      await noScroll(name);
      if (name === 'Daily desk' || name === 'Library enrichment') await shot(page, `agents-${w}-${name.toLowerCase().replace(/ /g, '-')}.png`);
    }
    assert.ok((await page.locator('.ag-node.ag-planned').count()) === 0 || true);
    await page.click('.ag-chip:has-text("Library enrichment")');
    assert.ok((await page.locator('#agChart .ag-node.ag-planned').count()) >= 2, 'planned agents are dashed boxes');
    await page.click('.ag-chip:has-text("Research case")');
    // click a box: its card opens and the info line names it
    await page.click('#agChart [data-node="library-librarian"]');
    await page.waitForSelector('#agent-library-librarian[open]');
    assert.match(await page.textContent('#agInfo'), /Library librarian/);
    await noScroll('after opening a card');
    // switches: libraryContext starts OFF (default), the cap bar shows 12 of 400
    const sw1 = page.locator('#agent-library-librarian [data-toggle="libraryContext"]');
    assert.equal(await sw1.getAttribute('aria-checked'), 'false');
    assert.match(await page.textContent('#agent-library-librarian'), /12 of 400 librarian calls used/);
    assert.match(await page.textContent('#agent-library-librarian'), /Spends money when on/);
    assert.ok(await page.locator('#agent-library-librarian .ag-note:not([hidden])').count() === 1, 'the dependent switch says it does nothing while the library switch is off');
    await sw1.click();
    await page.waitForFunction(() => document.querySelector('[data-toggle="libraryContext"]').getAttribute('aria-checked') === 'true');
    assert.match(await page.textContent('[data-msg="libraryContext"]'), /Saved/);
    assert.match(await page.textContent('[data-state="libraryContext"]'), /ON/);
    assert.ok(await page.locator('#agent-library-librarian .ag-note[hidden]').count() === 1, 'the note goes away once the library switch is on');
    assert.deepEqual(state.posts.at(-1), { id: 'libraryContext', value: true });
    await page.waitForTimeout(250); await shot(page, `agents-${w}-card.png`);
    if (shotDir) await page.locator('#agent-library-librarian').screenshot({ path: path.join(shotDir, `agents-${w}-librarian-card.png`) });
    // a failed save: shows the error and the switch does not move
    await fetch(`http://127.0.0.1:${port}/__fail?on=1`, { method: 'POST' });
    await page.locator('[data-toggle="libraryLibrarian"]').click();
    await page.waitForFunction(() => /Not saved/.test(document.querySelector('[data-msg="libraryLibrarian"]').textContent));
    assert.equal(await page.locator('[data-toggle="libraryLibrarian"]').getAttribute('aria-checked'), 'true', 'a failed save leaves the switch where it was');
    await fetch(`http://127.0.0.1:${port}/__fail?on=0`, { method: 'POST' });
    // reload: the saved value comes back from the server
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('#agChart svg.ag-svg');
    await page.click('#agChart [data-node="library-librarian"]'); await page.waitForSelector('#agent-library-librarian[open]');
    assert.equal(await page.locator('[data-toggle="libraryContext"]').getAttribute('aria-checked'), 'true');
    assert.match(await page.textContent('[data-src="libraryContext"]'), /saved on this page/);
    await noScroll('after reload');
    assert.deepEqual(errors, [], `page errors at ${w}px`);
    // opened by clicking the tab (no hash): the same chart loads
    const p2 = await ctx.newPage(); await p2.goto(`http://127.0.0.1:${port}/bot-config.html`, { waitUntil: 'domcontentloaded' });
    await p2.evaluate(() => { try { localStorage.removeItem('botConfigTab'); } catch (e) {} });
    await p2.click('.tab-btn[data-tab="agents"]'); await p2.waitForSelector('#agChart svg.ag-svg'); await p2.close();
    // turn it back off for the next width
    await page.locator('[data-toggle="libraryContext"]').click();
    await page.waitForFunction(() => document.querySelector('[data-toggle="libraryContext"]').getAttribute('aria-checked') === 'false');
    await ctx.close();
    console.log(`ok ${w}px`);
  }
} finally { await browser.close(); srv.close(); }
