/**
 * cotArchive — market list in sync with the worker; column filter; pagination (fake fetch).
 * Run: node --test js/cotArchive.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { COT_MARKETS, keepColumn, normaliseRows, fetchCotFull } from './cotArchive.js';

test('every worker COT market (primary name and sym) is in the archive list', () => {
  const w = readFileSync(new URL('../_worker.js', import.meta.url), 'utf8');
  const names = [...w.matchAll(/\{ name:'([^']+)'[^\n]*sym:'([^']+)'/g)].map(m => [m[1], m[2]]);
  assert.ok(names.length >= 36);
  const bySym = Object.fromEntries(COT_MARKETS.map(m => [m.sym, m]));
  for (const [name, sym] of names) {
    assert.ok(bySym[sym], `missing ${sym}`);
    assert.equal(bySym[sym].names[0], name, `${sym} primary name drifted from _worker.js`);
  }
});

test('columns: positions, traders and OI kept; percent/change/concentration dropped', () => {
  assert.ok(keepColumn('lev_money_positions_long'));
  assert.ok(keepColumn('open_interest_all'));
  assert.ok(keepColumn('traders_lev_money_short_all'));
  assert.ok(!keepColumn('pct_of_oi_lev_money_long'));
  assert.ok(!keepColumn('change_in_lev_money_long'));
  assert.ok(!keepColumn('conc_gross_le_4_tdr_long'));
  const r = normaliseRows([{ report_date_as_yyyy_mm_dd: '2026-10-27T00:00:00.000', open_interest_all: '700', lev_money_positions_long: '50', market_and_exchange_names: 'X' }, { report_date_as_yyyy_mm_dd: 'bad' }]);
  assert.deepEqual(r, [{ date: '2026-10-27', open_interest_all: 700, lev_money_positions_long: 50 }]);
});

test('pagination reads every page; falls through to the alternative name', async () => {
  const calls = [];
  const fake = async url => {
    calls.push(url);
    const u = new URL(url), name = u.searchParams.get('market_and_exchange_names'), off = +u.searchParams.get('$offset');
    if (name === 'OLD') return { ok: true, json: async () => [] };
    const n = off === 0 ? 2 : 1;
    return { ok: true, json: async () => Array.from({ length: n }, (_, i) => ({ report_date_as_yyyy_mm_dd: `2020-01-0${off + i + 1}`, open_interest_all: '1' })) };
  };
  const r = await fetchCotFull({ sym: 'X', dataset: 'd', names: ['OLD', 'NEW'] }, { fetchImpl: fake, pageSize: 2 });
  assert.equal(r.name, 'NEW');
  assert.equal(r.rows.length, 3);
  assert.equal(calls.length, 3);
});
