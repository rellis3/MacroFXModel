// js/terminal/staleChips.test.mjs: the "source stale since" chips on the boards whose feed the Info map flags (review 2026-11-27).
// node --test js/terminal/staleChips.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { STALE_SURFACES, staleNote, chipHtml } from './staleChips.js';
import { SURFACES } from './tabRegistry.js';
import { FAMILIES } from '../infoMap.js';
import { ownerText, staleHtml } from './infoMapView.js';

test('every mapped board is a registered surface and every family is a flagged Info map family', () => {
  for (const [sid, fam] of Object.entries(STALE_SURFACES)) {
    assert.ok(SURFACES.some(s => s.id === sid), `${sid} is registered`);
    assert.ok(FAMILIES.find(f => f.id === fam)?.flag, `${fam} is flagged in js/infoMap.js`);
  }
});

test('the chip says what is stale and since when, in the Info map\'s own words, with no script paths', () => {
  assert.equal(staleNote('vol-forecast-family').short, 'CVOL stale since 21 Aug 2026');
  assert.equal(staleNote('risk-state').short, 'EVZ flag stale since 11 Mar 2025');
  assert.equal(staleNote('rbnz-statement-tone').short, 'RBNZ statements blocked since July');
  assert.equal(staleNote('fed-path-odds').short, 'laptop feed: check its date');
  assert.doesNotMatch(staleNote('policy-rates-and-priced-path').long, /\.bat|\.md|plans\//, 'no script or plan path on a board');
  assert.equal(staleNote('hedge-and-beta-alerts'), null, 'a retired family has no board to mark');
  assert.equal(staleNote('no-such-family'), null);
  assert.match(chipHtml(staleNote('vol-forecast-family')), /class="chip gold stale-src" title="Stale: The CME CVOL export/);
  assert.equal(chipHtml(null), '');
});

test('Info map: script and plan paths are the owner\'s detail', () => {
  const t = 'Central-bank expectations come from a laptop pull (scripts/rates_line/run_cb_expectations.bat, see plans/LAPTOP_TASKS.md); the same run as run_cb_expectations.bat.';
  assert.equal(ownerText(t, true), t);
  assert.equal(ownerText(t, false), 'Central-bank expectations come from a laptop pull; the same run as a desk script.');
  assert.doesNotMatch(staleHtml(FAMILIES, false), /run_cb_expectations\.bat|LAPTOP_TASKS\.md/);
  assert.match(staleHtml(FAMILIES, true), /run_cb_expectations\.bat/);
});
