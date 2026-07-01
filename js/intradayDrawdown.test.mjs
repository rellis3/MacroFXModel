/**
 * Offline tests for intradayMtmDrawdown — the MAE + concurrency-aware drawdown.
 * Run: node js/intradayDrawdown.test.mjs
 */
import { intradayMtmDrawdown, tradeTimingStats } from './intradayDrawdown.js';

let failures = 0;
const ok = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };
const near = (a, b, t = 1e-6) => Math.abs(a - b) <= t;

console.log('[intradayMtmDrawdown]');

// 1. A single WINNING trade that dipped to its MAE first — closed PnL is +2 (no DD),
//    but intraday it went to -3 (the MAE). The MTM drawdown must see the -3.
{
  const r = intradayMtmDrawdown([{ entryTime: 0, maeTime: 5, exitTime: 10, maePct: 3, finalPnl: 2 }]);
  ok('winning trade exposes its intratrade MAE', near(r.maxDD, -3), `maxDD=${r.maxDD}`);
}

// 2. Closed-trade view would be ZERO drawdown (all wins), but two CONCURRENT trades
//    each dip -3 at the same time → portfolio MTM drawdown is -6, not 0.
{
  const a = { entryTime: 0, maeTime: 5, exitTime: 10, maePct: 3, finalPnl: 2 };
  const b = { entryTime: 0, maeTime: 5, exitTime: 10, maePct: 3, finalPnl: 2 };
  const r = intradayMtmDrawdown([a, b]);
  ok('concurrency stacks: two -3 dips at once → -6', near(r.maxDD, -6), `maxDD=${r.maxDD}`);
}

// 3. NON-overlapping trades don't stack: each still has its own -3 intratrade dip,
//    so the worst peak-to-trough is -3 (trade A from peak 0, OR trade B from peak +2),
//    NOT the -6 the concurrent case produced.
{
  const a = { entryTime: 0, maeTime: 5, exitTime: 10, maePct: 3, finalPnl: 2 };
  const b = { entryTime: 20, maeTime: 25, exitTime: 30, maePct: 3, finalPnl: 2 };
  const r = intradayMtmDrawdown([a, b]);
  ok('sequential trades do NOT stack (-3, not the concurrent -6)', near(r.maxDD, -3), `maxDD=${r.maxDD}`);
}

// 4. It is always at least as deep as the closed-trade daily drawdown. Construct a
//    losing trade: closed -4, MAE -4 (hit the stop) → MTM also -4.
{
  const r = intradayMtmDrawdown([{ entryTime: 0, maeTime: 5, exitTime: 10, maePct: 4, finalPnl: -4 }]);
  ok('losing trade DD = its loss', near(r.maxDD, -4), `maxDD=${r.maxDD}`);
}

// 5. maeTime defaults to the midpoint when absent (still exposes the dip).
{
  const r = intradayMtmDrawdown([{ entryTime: 0, exitTime: 10, maePct: 3, finalPnl: 2 }]);
  ok('maeTime defaults to midpoint, dip still seen', near(r.maxDD, -3), `maxDD=${r.maxDD}`);
}

// 6. Empty / malformed input → 0, no throw.
{
  ok('empty input → 0', intradayMtmDrawdown([]).maxDD === 0);
  ok('malformed trades skipped', intradayMtmDrawdown([{ entryTime: 5, exitTime: 1 }]).maxDD === 0);
}

// 7. MTM drawdown ≥ closed-trade drawdown on a mixed book (the whole point).
{
  const trades = [
    { entryTime: 0,  maeTime: 3,  exitTime: 6,  maePct: 5, finalPnl: 1 },
    { entryTime: 1,  maeTime: 4,  exitTime: 7,  maePct: 5, finalPnl: 1 },
    { entryTime: 2,  maeTime: 5,  exitTime: 8,  maePct: 5, finalPnl: -2 },
  ];
  const mtm = intradayMtmDrawdown(trades).maxDD;
  // Closed-trade daily DD (all same "day"): cumulative closed PnL path 1,2,0 → DD 0.
  const closedDD = 0;
  ok('MTM DD is materially deeper than closed-trade DD', mtm <= closedDD - 1e-9 && mtm < -5, `mtm=${mtm}`);
}

// 8. Realised PnL via the pipeline's `pnl` field (NOT `finalPnl`) must be honoured —
//    reading only finalPnl zeroed every realised leg and gave a 0.0× multiple. Two
//    concurrent LOSING trades (closed -4 each, no MAE) must show a -8 portfolio DD.
{
  const a = { entryTime: 0, maeTime: 5, exitTime: 10, maePct: 0, pnl: -4 };
  const b = { entryTime: 0, maeTime: 5, exitTime: 10, maePct: 0, pnl: -4 };
  const r = intradayMtmDrawdown([a, b]);
  ok('realised PnL read from `pnl` field (concurrent losers → -8)', near(r.maxDD, -8), `maxDD=${r.maxDD}`);
}

// 9. tradeTimingStats — the discriminator between real short-lived trades and
//    zero-duration (missing-timestamp) records.
{
  // epoch-seconds: durations 5, 10, 15 min; maePct 1, 2, 3.
  const s = 1700000000;
  const real = [
    { entryTime: s,        exitTime: s + 300,  maePct: 1 },
    { entryTime: s + 100,  exitTime: s + 700,  maePct: 2 },
    { entryTime: s + 200,  exitTime: s + 1100, maePct: 3 },
  ];
  const st = tradeTimingStats(real);
  ok('tradeTimingStats counts all trades', st.n === 3, `n=${st.n}`);
  ok('tradeTimingStats median duration in minutes', near(st.medianDurationMin, 10, 0.1), `median=${st.medianDurationMin}`);
  ok('tradeTimingStats 0% zero-duration on real trades', st.pctZeroDuration === 0, `zero=${st.pctZeroDuration}`);
  ok('tradeTimingStats median maePct', near(st.medianMaePct, 2, 1e-9), `median maePct=${st.medianMaePct}`);
  ok('tradeTimingStats p95 maePct', st.p95MaePct === 3, `p95=${st.p95MaePct}`);
  // Zero-duration records (entry==exit) → flagged at 100%.
  const zero = [{ entryTime: s, exitTime: s, maePct: 0 }, { entryTime: s, exitTime: s, maePct: 0 }];
  ok('tradeTimingStats flags zero-duration records', tradeTimingStats(zero).pctZeroDuration === 100);
  ok('tradeTimingStats empty → {n:0}', tradeTimingStats([]).n === 0);
}

console.log(`\n${failures === 0 ? 'ALL PASSED ✓' : failures + ' CHECK(S) FAILED ✗'}`);
if (failures) process.exit(1);
