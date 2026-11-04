// The Desk Terminal's short-term fair value views (js/terminal/fairValueView.js) on a saved /api/fx-fair-value payload
// (tests/fixtures/fx_fair_value/board.json: the board built from FRED H.10 rates and the issuers' yields, 2026-11-04;
// the crosses have no prices there, as when OANDA is unreachable).   node js/terminal/fairValueView.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stfvTable, stfvPairCard, fairLevel, rowOf, pathSvg, verdictChip } from './fairValueView.js';

const D = JSON.parse(fs.readFileSync(new URL('../../tests/fixtures/fx_fair_value/board.json', import.meta.url), 'utf8'));

test('the fixture is a description-only board with the five tested pairs read', () => {
  assert.equal(D.ok, true); assert.ok(D.descriptionOnly);
  for (const p of ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD']) assert.ok(rowOf(D, p)?.ok, p);
});
test('Macro table: verdict label first, every pair a row, a reason for the ones without prices', () => {
  const h = stfvTable(D);
  assert.match(h, /DESCRIPTION ONLY · UNDERPOWERED/);
  assert.match(h, /EURUSD/); assert.match(h, /missing EURJPY prices/);
  assert.equal((h.match(/<tr>/g) ?? []).length, 1 + D.rows.length);
  assert.match(stfvTable({ ok: false, error: 'FRED down' }), /FRED down/); assert.equal(stfvTable(null), '');
});
test('Pair card: fair value, gap, z, half-life, betas and the path; other markets get a reason', () => {
  const h = stfvPairCard(D, 'EURUSD'), r = rowOf(D, 'EURUSD');
  assert.match(h, /Gap half-life/); assert.match(h, /2y gap/); assert.match(h, /<svg/);
  assert.ok(h.includes(String(Math.round(r.gapPips))));
  assert.match(stfvPairCard(D, 'GOLD'), /No short-term fair value for GOLD/);
  assert.match(stfvPairCard(D, 'EURJPY'), /missing EURJPY prices/);
  assert.match(stfvPairCard({ ok: false, error: 'x' }, 'EURUSD'), /x/);
});
test('chart level: the fair value with its verdict in the label; none without a read', () => {
  const l = fairLevel(D, 'USDJPY'); assert.equal(l.price, rowOf(D, 'USDJPY').fair); assert.match(l.label, /underpowered/);
  assert.equal(fairLevel(D, 'EURJPY'), null); assert.equal(fairLevel(null, 'EURUSD'), null);
});
test('path svg and chip escape and degrade', () => {
  assert.equal(pathSvg([]), ''); assert.match(pathSvg([{ price: 1, fair: 1.1 }, { price: 1.2, fair: 1.1 }]), /<path/);
  assert.match(verdictChip({ verdict: 'VALIDATED', label: '<b>' }), /&lt;b&gt;/);
});
