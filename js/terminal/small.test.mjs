// js/terminal/small.test.mjs: the Risk flags board and the World economies tiles on synthetic payloads. node --test js/terminal/small.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { flagRows, flagsHtml, brief, FLAG_EVIDENCE } from './flagsView.js';
import { economiesHtml, readings } from './economiesView.js';
import { worldEconomies } from '../worldEconomies.js';
import { DESK_EVIDENCE } from '../deskEvidence.js';

const RF = () => ({ ok: true, computed_at: '2026-11-15T23:23:19Z', active: 1, available: 5, total: 6, level: 'WATCH', flags: [
  { key: 'vix_level', label: 'VIX elevated', on: false, value: 18.7, detail: 'VIX 18.7 (flag at 25 or more)' },
  { key: 'vix_term', label: 'VIX curve backwardated', on: true, value: 1.02, detail: 'VIX/VIX3M 1.02' },
  { key: 'hy_speed', label: 'Credit widening fast', on: false, value: -12, detail: 'HY OAS -12bp' },
  { key: 'jpy_bid', label: 'JPY safe-haven bid', on: false, value: 0.4, detail: 'USD/JPY +0.5%' },
  { key: 'evz_stress', label: 'FX implied vol stressed', on: null, value: null, detail: 'no percentile wired, so this flag is off rather than guessed' },
  { key: 'stock_bond_corr', label: 'Stock-bond correlation broken', on: false, value: 0.01, detail: 'SPY/TLT +0.01' }] });

test('every evidence id the flags point at exists in the Evidence Book (a renamed id must not silently drop a card)', () => {
  const ids = new Set(DESK_EVIDENCE.map(e => e.id));
  for (const [flag, m] of Object.entries(FLAG_EVIDENCE)) for (const id of m.ids) assert.ok(ids.has(id), `${flag} -> ${id}`);
});
test('flagRows: the VIX curve flag carries a validated range finding, the credit flag is marked nearest-test, the rest are plain lights', () => {
  const m = flagRows(RF()); assert.equal(m.ok, true); assert.equal(m.rows.length, 6); assert.equal(m.active, 1);
  const by = k => m.rows.find(r => r.key === k);
  assert.equal(by('vix_term').validatedRange, true); assert.ok(by('vix_term').evidence.some(e => e.verdict === 'validated'));
  assert.equal(by('hy_speed').nearest, true); assert.equal(by('hy_speed').validatedRange, false); assert.equal(by('vix_level').evidence.length, 0); assert.equal(by('stock_bond_corr').validatedRange, false);
  assert.equal(flagRows({ ok: false, error: 'down' }).ok, false); assert.equal(flagRows(null).ok, false);
});
test('flagsHtml: validated range section first, lights labelled, the off/on/not-available words, range-not-direction wording, no trade words, no hard-coded colours, escaped', () => {
  const h = flagsHtml(flagRows(RF()));
  assert.match(h, /Flags with a validated range finding/); assert.match(h, /Other lights \(no validated finding\)/); assert.match(h, /NOT AVAILABLE/); assert.match(h, /<b class="in-ls">ON<\/b>/); assert.match(h, /never which way/);
  assert.match(h, /No test of its own in the Evidence Book/); assert.match(h, /nearest test, not the same measure/); assert.match(h, /A flag that is off says nothing/);
  assert.ok(h.indexOf('validated range finding') < h.indexOf('Other lights')); assert.ok(!/#[0-9a-f]{6}\b/i.test(h)); assert.ok(!/\b(buy|sell|go long|go short|stop loss|take profit)\b/i.test(h.replace(/<[^>]+>/g, ' ')));
  const evil = flagRows({ ...RF(), flags: [{ key: 'x', label: '<img src=x>', on: false, detail: '<b>' }] }); assert.ok(!flagsHtml(evil).includes('<img src=x>'));
  assert.match(flagsHtml({ ok: false, error: 'the risk flags are not available' }), /not available/);
});
test('brief ends on a sentence or clause, never mid-number', () => {
  const t = 'First sentence is here and fairly long to be useful. Second sentence adds more detail about the range being +0.52 [0.38, 0.88] on SPX500 and more words to run on and on.';
  const b = brief(t, 120); assert.ok(b.length <= 121); assert.ok(/[.…]$/.test(b)); assert.equal(brief('short', 50), 'short');
});

const world = () => worldEconomies({
  gdp: { byCcy: { USD: { latestGrowth: 0.6, latestDate: '2026-07-01', z: 0.2 }, EUR: { latestGrowth: -0.1, latestDate: '2026-07-01', recessionFlag: true } } },
  cpi: { byCcy: { USD: { dims: { headlineLevel: { latestYoy: 3.2, target: 2, latestDate: '2026-10-01' }, coreLevel: { latestYoy: 3.0 } } }, EUR: { dims: { headlineLevel: { latestYoy: 2.1, target: 2, latestDate: '2026-10-01' } } } } },
  labor: { byCcy: { USD: { dims: { unemploymentTrend: { latestLevel: 4.3, latestDate: '2026-10-01' }, wageGrowth: { latestYoyPct: 3.9, latestDate: '2026-10-01' } } } } },
  retail: { byCcy: { USD: { dims: { headline: { latestYoy: 2.5, latestDate: '2026-09-01' } } } } }, conf: {}, trade: {}, real: {}, curve: { byCcy: { USD: { latestSlope: -0.2, latestDate: '2026-11-13' } } },
  scorecard: { cbSentiment: { USD: { regime: 'Hawkish', meetingDate: '2026-10-29' } } } });

test('readings: each arrow compares a reading with its own anchor, with a word beside it; a missing feed has no arrow', () => {
  const w = world(), usd = readings(w.rows.find(r => r.ccy === 'USD'), '2026-11-15'), eur = readings(w.rows.find(r => r.ccy === 'EUR'), '2026-11-15'), gbp = readings(w.rows.find(r => r.ccy === 'GBP'), '2026-11-15');
  const g = k => usd.find(x => x.key === k);
  assert.equal(g('growth').arrow, 'up'); assert.equal(g('growth').word, 'growing'); assert.equal(g('prices').arrow, 'up'); assert.equal(g('prices').word, 'above target'); assert.match(g('prices').value, /target 2\.0%/);
  assert.equal(g('jobs').arrow, 'up'); assert.equal(g('jobs').word, 'pay ahead of prices'); assert.equal(g('spend').arrow, 'up');
  assert.equal(eur.find(x => x.key === 'growth').arrow, 'down'); assert.match(eur.find(x => x.key === 'growth').value, /recession flag on/); assert.equal(eur.find(x => x.key === 'prices').word, 'near target');
  assert.ok(gbp.every(x => x.arrow === null), 'no feed, no arrow');
});
test('economiesHtml: eight tiles, arrows with words, the bank stance and inverted curve chips, a no-feed line, levels-not-trends wording, no hard-coded colours, escaped', () => {
  const h = economiesHtml(world(), '2026-11-15');
  assert.equal((h.match(/class="in-gcard"/g) ?? []).length, 8); assert.match(h, /▲/); assert.match(h, /▼/); assert.match(h, /no feed/); assert.match(h, /bank: hawkish/); assert.match(h, /curve inverted/);
  assert.match(h, /not whether it is getting better or worse/); assert.ok(!/#[0-9a-f]{6}\b/i.test(h)); assert.ok(!/\b(buy|sell|go long|go short|stop loss|take profit)\b/i.test(h.replace(/<[^>]+>/g, ' ')));
  assert.match(economiesHtml({ rows: [] }), /No economy data/);
});
