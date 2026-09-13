// Synthetic tests for js/pairLedger.js. No network, no clock.
//   node js/pairLedger.test.mjs
import { rowFromCall, upsertCalls, scoreRow, scoreRows, summarise, citeFor, MIN_N_TO_SHOW, keyOf } from './pairLedger.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };
const call = (over = {}) => ({ pair: 'EURUSD', sym: 'EUR_USD', direction: 'up', agree: 4, total: 5, tape: 'DRIFT', threat: 'cot', used: 0.31, expRange: 0.0068, spread: 0.0001, price: 1.1600, atr: 0.0090, ...over });
const closes = [
  { d: '2026-09-14', close: 1.1650 },   // call day: +50 pips
  { d: '2026-09-15', close: 1.1580 },   // next day: -20 from the call price
  { d: '2026-09-16', close: 1.1700 },
  { d: '2026-09-17', close: 1.1720 },
  { d: '2026-09-18', close: 1.1690 },
  { d: '2026-09-19', close: 1.1750 },   // +5: +150
];

console.log('[rowFromCall — the call as rendered, not reconstructed]');
{
  const r = rowFromCall(call(), { day: '2026-09-14', at: 1 });
  ok('keeps direction, agreement, tape, threat, price, atr, spread', r.dir === 'up' && r.agree === 4 && r.tape === 'DRIFT' && r.threat === 'cot' && r.price === 1.16 && r.atr === 0.009 && r.spread === 0.0001);
  ok('is unscored on creation', r.out === null);
  ok('no direction -> null, not a row', rowFromCall({ pair: 'X' }) === null);
}

console.log('[upsertCalls — first call of the day wins; price refreshes; never duplicates]');
{
  let { rows, added } = upsertCalls([], [call()], { day: '2026-09-14' });
  ok('first post adds', added === 1 && rows.length === 1);
  ({ rows, added } = upsertCalls(rows, [call({ direction: 'down', price: 1.1620 })], { day: '2026-09-14' }));
  ok('a later post the same day does NOT change the call', added === 0 && rows[0].dir === 'up', rows[0].dir);
  ok('but refreshes the price', rows[0].price === 1.162);
  ({ rows, added } = upsertCalls(rows, [call()], { day: '2026-09-15' }));
  ok('the next day appends', added === 1 && rows.length === 2);
  ({ rows } = upsertCalls(rows, [call({ pair: 'XAUUSD', sym: 'XAU_USD' })], { day: '2026-09-15' }));
  ok('pairs are independent', rows.length === 3 && new Set(rows.map(keyOf)).size === 3);
}

console.log('[scoreRow — three horizons, sign hit, ATR and net-of-spread moves]');
{
  const r = rowFromCall(call(), { day: '2026-09-14' });
  const o = scoreRow(r, closes);
  ok('session close: +50 pips is a hit for an up call', o.h0.hit === true && Math.abs(o.h0.move - 0.005) < 1e-9);
  ok('in ATR: 0.005 / 0.009', Math.abs(o.h0.inAtr - 0.556) < 0.002, String(o.h0.inAtr));
  ok('next day: -20 pips is a miss', o.h1.hit === false);
  ok('+5 days: +150 is a hit', o.h5.hit === true);
  ok('net of spread subtracts the dealing cost', Math.abs(o.h0.pnlNetAtr - (0.005 - 0.0001) / 0.009) < 0.002, String(o.h0.pnlNetAtr));
  ok('a down call scores the mirror', scoreRow(rowFromCall(call({ direction: 'down' }), { day: '2026-09-14' }), closes).h0.hit === false);
}
{
  // MIXED is the page declining to call. Recorded, but never a directional hit.
  const o = scoreRow(rowFromCall(call({ direction: 'mixed' }), { day: '2026-09-14' }), closes);
  ok('mixed: no hit either way', o.h0.hit === null && o.h0.pnlAtr === null);
  ok('mixed: the move is still recorded', Math.abs(o.h0.move - 0.005) < 1e-9);
}
{
  ok('day not closed yet -> null, never a partial score', scoreRow(rowFromCall(call(), { day: '2026-09-20' }), closes) === null);
  const o = scoreRow(rowFromCall(call(), { day: '2026-09-18' }), closes);
  ok('h1 available but h5 not -> h5 is null, the rest scored', o.h1 && o.h5 === null);
}

console.log('[scoreRows — idempotent, only touches what needs scoring]');
{
  let { rows } = upsertCalls([], [call()], { day: '2026-09-14' });
  ({ rows } = upsertCalls(rows, [call()], { day: '2026-09-18' }));
  let r = scoreRows(rows, { EUR_USD: closes });
  ok('scores both (one fully, one partially)', r.scored === 2 && r.rows[0].out.h5 && r.rows[1].out.h5 === null);
  const again = scoreRows(r.rows, { EUR_USD: closes });
  ok('re-running with the same closes changes nothing', again.scored === 0);
}

console.log('[summarise — honest about n, and every cell says so]');
{
  // 40 up-calls that were right 60% of the time on h1.
  let rows = [];
  for (let i = 0; i < 40; i++) {
    const d = `2026-01-${String(i + 1).padStart(2, '0')}`;
    const r = rowFromCall(call({ agree: i % 2 ? 4 : 3 }), { day: d });
    r.out = { h0: { hit: true, pnlAtr: 0.3, pnlNetAtr: 0.28, move: 0.003, inAtr: 0.3 }, h1: { hit: i % 5 < 3, pnlAtr: i % 5 < 3 ? 0.4 : -0.3, pnlNetAtr: i % 5 < 3 ? 0.38 : -0.32, move: 0, inAtr: 0 }, h5: null };
    rows.push(r);
  }
  const s = summarise(rows);
  ok('overall h1 hit rate is 60%', s.overall.h1.hitRate === 0.6, String(s.overall.h1.hitRate));
  ok('carries a binomial interval', s.overall.h1.hitRateLo < 0.6 && s.overall.h1.hitRateHi > 0.6);
  ok('60% on 40 calls does NOT clear the coin flip — the interval includes 50%', s.overall.h1.clearsCoinFlip === 'no', s.overall.h1.clearsCoinFlip);
  ok('100% on 40 (h0) does clear it', s.overall.h0.clearsCoinFlip === 'above');
  ok('breaks down by agreement', Object.keys(s.byAgreement).sort().join() === '3/5,4/5');
  ok('h5 unscored -> n 0, no rate', s.overall.h5.n === 0 && s.overall.h5.hitRate === null);
}
{
  // Below MIN_N the cite says "collecting", never a percentage.
  let { rows } = upsertCalls([], [call()], { day: '2026-09-14' });
  rows[0].out = scoreRow(rows[0], closes);
  const c = citeFor(rows, 'EURUSD');
  ok('under MIN_N -> says too few, no rate', /too few/.test(c.text) && c.hitRate == null, c.text);
  ok(`MIN_N is ${MIN_N_TO_SHOW}`, MIN_N_TO_SHOW >= 30);
}
{
  // A page that is WORSE than a coin flip says so in those words.
  let rows = [];
  for (let i = 0; i < 100; i++) { const r = rowFromCall(call(), { day: `2025-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}` }); r.d = r.d + '-' + i; r.out = { h0: null, h1: { hit: i % 10 < 3, pnlAtr: -0.1, pnlNetAtr: -0.12, move: 0, inAtr: 0 }, h5: null }; rows.push(r); }
  const c = citeFor(rows, 'EURUSD');
  ok('30% on 100 calls reads "WORSE than a coin flip"', /WORSE/.test(c.text), c.text);
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll pairLedger tests passed.');
