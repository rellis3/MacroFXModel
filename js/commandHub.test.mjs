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
  // 2026-11-15: every other orphan was given a tab in the nav restructure (plans/NAV_REVIEW_2026-11-15.md).
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
  const menu = hub.slice(hub.indexOf('id="chubDDresearch"'), hub.indexOf('id="chubDDlearn"'));
  for (const f of ['research.html', 'roe.html', 'research-log.html']) assert.ok(menu.includes(`data-href="${f}"`), f);
});

// 2026-11-15 restructure: the eight tabs, in order, and Null/Retired kept apart (owner: "move all pages which are null to null,
// retired where a new page/version has taken over").
test('the strip has the eight tabs in order', () => {
  const ids = [...hub.matchAll(/<div class="chub-dd" id="(chubDD\w+)">/g)].map(m => m[1]);
  assert.deepEqual(ids, ['chubDDlive', 'chubDDvol', 'chubDDmacro', 'chubDDbots', 'chubDDresearch', 'chubDDlearn', 'chubDDnull', 'chubDDretired']);
});

test('no page sits in two tabs', () => {
  const hrefs = [...hub.matchAll(/data-href="([^"']+)"[^>]*><span/g)].map(m => m[1]).filter(h => !/[#?]/.test(h));
  const dup = hrefs.filter((h, i) => hrefs.indexOf(h) !== i);
  assert.deepEqual(dup, []);
});
