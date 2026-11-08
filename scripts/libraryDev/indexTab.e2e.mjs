// Index tab e2e at phone width (430px) against the mock server: rows render, the filter box ranks through /find, no sideways page scroll.
//   node scripts/libraryDev/indexTab.e2e.mjs [screenshot.png]     (needs playwright; CHROME=/path/to/chrome if it is not found)
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const require = (await import('node:module')).createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { try { ({ chromium } = require('playwright-core')); } catch { console.log('playwright not installed'); process.exit(2); } }
const { startServer } = await import(path.join(path.dirname(fileURLToPath(import.meta.url)), 'mockServer.mjs'));
const { srv, port } = await startServer(0);
const shot = process.argv[2];
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/library.html`);
  await page.click('.lib-tab[data-tab="index"]');
  await page.waitForSelector('.lib-ix-row');
  const n = await page.locator('.lib-ix-row').count(); assert.equal(n, 15, 'one row per paper');
  assert.ok((await page.textContent('#ixInfo')).includes('15 of 15'));
  const noScroll = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways page scroll');
  await noScroll();
  // Ask the librarian (mock route runs the real js/libraryLibrarian.js with a fake model): marked as one AI call, picks with why and links, no sideways scroll
  assert.ok((await page.textContent('#lbGo')).includes('1 AI call') && /one small AI call/.test(await page.textContent('.lib-lb')));
  await page.fill('#lbBox', 'does volatility clustering predict jumps'); await page.click('#lbGo');
  await page.waitForSelector('.lib-lb-pick');
  assert.equal(await page.locator('.lib-lb-pick').count(), 2); assert.match(await page.locator('.lib-lb-why').first().textContent(), /Synthetic reason/);
  assert.match(await page.textContent('#lbOut'), /1 small AI call used/);
  assert.ok((await page.locator('.lib-lb-q').count()) >= 3, 'the queries are shown');
  const box = await page.locator('.lib-lb').boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= 431, 'the box fits the phone width');
  await noScroll();
  if (shot) await page.screenshot({ path: shot.replace(/\.png$/, '-librarian.png'), fullPage: false });
  await page.fill('#ixBox', 'jump volatility clustering');
  await page.waitForFunction(() => /best match/.test(document.getElementById('ixInfo').textContent));
  const first = await page.locator('.lib-ix-row .lib-ix-t').first().textContent(); assert.match(first, /Volatility Clustering|Jump/);
  assert.ok((await page.locator('.lib-ix-why').count()) > 0, 'matched terms are shown');
  await noScroll();
  if (shot) await page.screenshot({ path: shot, fullPage: false });
  await page.fill('#ixBox', ''); await page.selectOption('#ixEv', 'oos');
  await page.waitForFunction(() => /of 15/.test(document.getElementById('ixInfo').textContent));
  assert.ok((await page.locator('.lib-ix-row').count()) < 15);
  await page.click('.lib-ix-row'); await page.waitForFunction(() => location.hash.startsWith('#/paper/'));
  assert.deepEqual(errors, []);
  console.log('index tab e2e ok');
} finally { await browser.close(); srv.close(); }
