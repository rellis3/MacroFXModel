import assert from 'node:assert/strict';
import { scoreOf, bandOf, marketScore, withScores, contextRead, scoreTrack, trackLine, scoreChip, MDE_1D } from './directionScore.js';
import { directionReads, BASE_1D } from './directionRead.js';

// boundaries of the frozen mapping (prereg 3.5)
const cases = [[0, 5], [0.0001, 6], [0.4999, 6], [0.5, 7], [0.9999, 7], [1, 8], [1.9999, 8], [2, 9], [2.9999, 9], [3, 10], [9, 10],
  [-0.0001, 5], [-0.4999, 5], [-0.5, 4], [-0.9999, 4], [-1, 3], [-1.9999, 3], [-2, 2], [-2.9999, 2], [-3, 1], [-9, 1]];
for (const [u, s] of cases) assert.equal(scoreOf(u), s, `u=${u}`);
assert.equal(scoreOf(NaN), 5);
// bands: the middle is 4-7, 'Lean' from 1 unit, 'Clear' from 2
for (let s = 4; s <= 7; s++) assert.equal(bandOf(s, 0.9).band, 'No direction');
assert.deepEqual(bandOf(8, 1.2), { band: 'Bullish', strength: 'Lean' });
assert.deepEqual(bandOf(10, 3.1), { band: 'Bullish', strength: 'Clear' });
assert.deepEqual(bandOf(3, -1.5), { band: 'Bearish', strength: 'Lean' });
assert.deepEqual(bandOf(1, -2.5), { band: 'Bearish', strength: 'Clear' });

const card = (pUp, nLive, shown = []) => ({ direction: { pUp, nLive, shown } });
// no tested input live: 5, No direction, P(up) = the market's own base rate, whatever zero-weight inputs say
const quiet = marketScore('NQ', card(0.5, 0, [{ id: 'trend', label: '12m trend basket', tier: 'null', s: 1, e: 0 }, { id: 'a', label: 'A', tier: 'untested', s: -0.5, e: 0 }]));
assert.equal(quiet.score, 5); assert.equal(quiet.band, 'No direction'); assert.equal(quiet.pUp, BASE_1D.NQ); assert.equal(quiet.live, 0);
assert.deepEqual(quiet.context.map(c => c.id), ['trend', 'a']);           // read, shown, never scored
assert.equal(quiet.context[0].tier, 'tested, no edge'); assert.equal(quiet.context[1].tier, 'never tested');
// a weighted input at the MDE moves the score to the Lean band: pUp - 0.5 = +0.07 on EURUSD (MDE 0.063) -> u 1.11 -> 8
const up = marketScore('EURUSD', card(0.57, 1, [{ id: 'post-fomc', label: 'Post-FOMC USD drift', tier: 'descriptive', s: 1, e: 0.075 }]));
assert.equal(up.score, 8); assert.equal(up.band, 'Bullish'); assert.equal(up.strength, 'Lean'); assert.equal(up.weighted.length, 1);
assert.ok(Math.abs(up.pUp - (BASE_1D.EURUSD + 0.07)) < 1e-9);
// today's real shape: a 3-point shift is under half a unit, so it stays in the middle
const small = marketScore('USDJPY', card(0.53, 1, [{ id: 'post-fomc', label: 'x', tier: 'descriptive', s: 1, e: 0.075 }]));
assert.equal(small.score, 6); assert.equal(small.band, 'No direction');
const down = marketScore('GBPUSD', card(0.47, 1, [{ id: 'post-fomc', label: 'x', tier: 'descriptive', s: -1, e: 0.075 }]));
assert.equal(down.score, 5);
assert.equal(marketScore('SPX500', null), null);                          // no card: no score
assert.equal(marketScore('US2000', card(0.5, 0)), null);                  // no frozen MDE: no score
// a weight-0 input with a non-zero signal can never create a score away from 5
for (const sym of Object.keys(MDE_1D)) {
  const s = marketScore(sym, card(0.9, 0, [{ id: 'x', label: 'x', tier: 'null', s: 1, e: 0 }]));
  assert.equal(s.score, 5, sym);
}
// withScores attaches to directionReads rows
const gr = { ranked: [{ sym: 'NQ' }, { sym: 'EURUSD' }], cards: { NQ: card(0.5, 0), EURUSD: card(0.57, 1, [{ id: 'p', label: 'p', tier: 'descriptive', s: 1, e: 0.1 }]), GOLD: card(0.5, 0) } };
const reads = withScores(directionReads(gr), gr);
assert.equal(reads.rows.find(r => r.sym === 'EURUSD').score.score, 8);
assert.equal(reads.scores.length, 3);
assert.equal(withScores(null, gr), null);
assert.equal(scoreChip(up), '8 Lean bullish'); assert.equal(scoreChip(quiet), '5 No direction');
assert.deepEqual(contextRead(card(0.5, 0, [{ id: 'tiny', label: 't', tier: 'null', s: 0.05, e: 0 }])), []);

// track record: bands vs the mean B0 of the same rows; under 30 rows is 'n too small'
const mkRec = (date, band) => ({ issue_date: date, forecasts: [
  { id: `${date}|nq|1|B0`, model_id: 'B0', inst: 'nq', h: 1, p_up: 0.55 },
  { id: `${date}|nq|1|direction-score`, model_id: 'direction-score', inst: 'nq', h: 1, p_up: 0.55, inputs: { band } }] });
const mkOut = (date, up) => ({ issue_date: date, h: 1, outcomes: { nq: { up } }, scores: {} });
const recs = [mkRec('2026-11-02', 'No direction'), mkRec('2026-11-03', 'No direction'), mkRec('2026-11-04', 'Bullish')];
const t = scoreTrack(recs, [mkOut('2026-11-02', 1), mkOut('2026-11-03', 0)]);
assert.equal(t.bands['No direction'].n, 2); assert.equal(t.bands['No direction'].up, 0.5); assert.equal(t.bands.Bullish.n, 0);
assert.ok(t.bands['No direction'].small);
assert.match(trackLine(t), /n too small/);
assert.match(trackLine(null), /starting/);
const big = Array.from({ length: 31 }, (_, i) => mkRec(`2027-01-${String(i + 1).padStart(2, '0')}`, 'Bullish'));
const t2 = scoreTrack(big, big.map((r, i) => mkOut(r.issue_date, i % 2)));
assert.equal(t2.bands.Bullish.n, 31); assert.ok(!t2.bands.Bullish.small); assert.match(trackLine(t2), /bullish: 48% closed up vs 55% base, 31 rows/);
console.log('directionScore.test.mjs ok');
