// Every page has a shortcut (owner, 2026-11-12: "as a default of creating a page, we need a shortcut to that page from somewhere").
// The command strip (js/commandHub.js, on today.html and the other pages) is where the owner finds things. A top-level page that is
// not in it is lost: the Research rooms (research.html) shipped on 2026-11-12 and the owner could not find them.
//
// ORPHANS lists the pages that had no shortcut when this test was written. The list may only SHRINK: a new page must be added to a
// menu in js/commandHub.js (or, if it is a sub-page reached from another page, to this list with a reason). Run: node js/commandHub.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const hub = fs.readFileSync(path.join(root, 'js', 'commandHub.js'), 'utf8');
const pages = fs.readdirSync(root).filter(f => f.endsWith('.html'));
const linked = f => hub.includes(`data-href="${f}"`);

const ORPHANS = new Set([
  'index.html',          // the site root itself
  'terminal.html', 'brief-config.html',
  'band-fade.html', 'claim-watch.html', 'drift.html', 'exhaustion-surface.html', 'fed-path.html', 'forecast-range-timeline.html', 'forecaster-system.html',
  'hedge-backtest.html', 'hedge-signals-v2.html', 'hedge-signals.html', 'impulse-range-lab.html', 'ips-shadow.html', 'jump-diffusion.html',
  'level-atlas-vote-portfolio-v2.html', 'live-range-shadow.html', 'live-validation.html', 'motif-combined-backtest.html', 'oi-all-lines.html',
  'oi-level-lab.html', 'path-map.html', 'pattern-lab.html', 'portfolio-book.html', 'trade-lab.html', 'volatility-intelligence.html', 'world-economies.html',
]);

test('every top-level page has a shortcut in the command strip (or is a listed, older orphan)', () => {
  const missing = pages.filter(f => !linked(f) && !ORPHANS.has(f));
  assert.deepEqual(missing, [], `add these to a menu in js/commandHub.js: ${missing.join(', ')}`);
});

test('the orphan list only shrinks: a listed page that now has a shortcut (or no longer exists) must come off it', () => {
  const stale = [...ORPHANS].filter(f => linked(f) || !pages.includes(f));
  assert.deepEqual(stale, [], `remove from ORPHANS: ${stale.join(', ')}`);
});

test('the research pages are in the Research menu', () => {
  const menu = hub.slice(hub.indexOf('id="chubDDresearch"'), hub.indexOf('id="chubDDequity"'));
  for (const f of ['research.html', 'roe.html', 'research-log.html']) assert.ok(menu.includes(`data-href="${f}"`), f);
});
