// Synthetic, no-network unit tests for the motif live-vs-backtest brick.
//   node js/motifLiveVsBacktest.test.mjs
import {
  normPair, matchTradeToMotifKey, compareToBacktest,
  normalizeLiveTrade, buildLiveVsBacktestReport,
} from './motifLiveVsBacktest.js';

let failures = 0;
const ok = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };

const live = (over = {}) => ({
  symbol: 'EURUSD', direction: 'BUY', time_open: 1_800_000_000,
  reason: null, r: null, tz_offset_sec: 0, ...over,
});
const entered = (over = {}) => ({ pair: 'eurusd', t: 1_800_000_000, motif_key: 'eurusd:top:1-2', status: 'entered', ...over });

// ── normPair -- gold is the case a naive suffix-strip gets wrong ───────────
ok('normPair resolves XAUUSD to gold', normPair('XAUUSD') === 'gold');
ok('normPair lowercases a plain fx symbol', normPair('EURUSD') === 'eurusd');
ok('normPair falls back to lowercase for an unknown symbol', normPair('WEIRD_THING') === 'weird_thing');

// ── matchTradeToMotifKey ────────────────────────────────────────────────────
ok('matches same pair within tolerance',
  matchTradeToMotifKey(live({ time_open: 1000 }), [entered({ t: 1030, motif_key: 'eurusd:top:1-2' })]) === 'eurusd:top:1-2');
ok('no match outside tolerance',
  matchTradeToMotifKey(live({ time_open: 1000 }), [entered({ t: 1700 })]) === null);
ok('no match on a different pair',
  matchTradeToMotifKey(live({ symbol: 'GBPUSD', time_open: 1000 }), [entered({ pair: 'eurusd', t: 1000 })]) === null);
ok('picks the closest of several candidates',
  matchTradeToMotifKey(live({ time_open: 1000 }), [entered({ t: 1500, motif_key: 'far' }), entered({ t: 1010, motif_key: 'near' })]) === 'near');
ok('gold symbol matches a gold pair in the decision log',
  matchTradeToMotifKey(live({ symbol: 'XAUUSD', time_open: 1000 }), [entered({ pair: 'gold', t: 1000, motif_key: 'gold:top:1-2' })]) === 'gold:top:1-2');

// ── compareToBacktest ────────────────────────────────────────────────────────
ok('UNMATCHED when no motif_key', compareToBacktest(live(), null, {}).verdict === 'UNMATCHED');
ok('DIVERGENCE when motif_key missing from backtest log',
  compareToBacktest(live(), 'eurusd:top:1-2', {}).verdict === 'DIVERGENCE');
ok('DIVERGENCE on direction mismatch',
  compareToBacktest(live({ direction: 'BUY' }), 'k', { k: { direction: 'SELL', status: 'open' } }).verdict === 'DIVERGENCE');
ok('MATCH both still open',
  compareToBacktest(live({ direction: 'BUY', reason: null }), 'k', { k: { direction: 'BUY', status: 'open' } }).verdict === 'MATCH');
ok('UNRESOLVED when live closed but backtest still open',
  compareToBacktest(live({ direction: 'BUY', reason: 'tp' }), 'k', { k: { direction: 'BUY', status: 'open' } }).verdict === 'UNRESOLVED');
ok('MATCH both tp',
  compareToBacktest(live({ direction: 'BUY', reason: 'tp' }), 'k', { k: { direction: 'BUY', status: 'tp', r: 1.46 } }).verdict === 'MATCH');
ok('MATCH both sl',
  compareToBacktest(live({ direction: 'BUY', reason: 'sl' }), 'k', { k: { direction: 'BUY', status: 'sl', r: -1.04 } }).verdict === 'MATCH');
{
  // The exact failure mode this brick exists to catch.
  const v = compareToBacktest(live({ direction: 'BUY', reason: 'tp' }), 'k', { k: { direction: 'BUY', status: 'sl', r: -1.04 } });
  ok('DIVERGENCE when live tp but backtest sl', v.verdict === 'DIVERGENCE' && v.detail.includes('outcome mismatch'));
}
ok('DIVERGENCE when live closed manually',
  compareToBacktest(live({ direction: 'BUY', reason: 'manual' }), 'k', { k: { direction: 'BUY', status: 'sl', r: -1.04 } }).verdict === 'DIVERGENCE');

// ── normalizeLiveTrade -- broker-clock correction via the shipped offset ───
{
  const n = normalizeLiveTrade({ time_open: 1000, time_close: 2000, tz_offset_sec: 10800 });
  ok('normalizeLiveTrade subtracts tz_offset_sec from time_open', n.time_open === 1000 - 10800);
  ok('normalizeLiveTrade subtracts tz_offset_sec from time_close', n.time_close === 2000 - 10800);
}
{
  const n = normalizeLiveTrade({ time_open: 1000, time_close: null, tz_offset_sec: 10800 });
  ok('normalizeLiveTrade leaves a null time_close alone (still-open trade)', n.time_close === null);
}

// ── buildLiveVsBacktestReport -- the full pipeline end to end ──────────────
{
  const raw = [
    { symbol: 'EURUSD', direction: 'BUY', reason: 'tp', r: 1.46, time_open: 1000, tz_offset_sec: 0 },
    { symbol: 'XAUUSD', direction: 'SELL', reason: 'sl', r: -1.04, time_open: 5000, tz_offset_sec: 0 },
  ];
  const events = [
    entered({ pair: 'eurusd', t: 1010, motif_key: 'eurusd:top:1-2' }),
    entered({ pair: 'gold', t: 5010, motif_key: 'gold:bottom:9-10' }),
  ];
  const backtest = [
    { motif_key: 'eurusd:top:1-2', direction: 'BUY', status: 'tp', r: 1.46 },
    { motif_key: 'gold:bottom:9-10', direction: 'SELL', status: 'tp', r: 1.46 },  // deliberate mismatch vs live's sl
  ];
  const report = buildLiveVsBacktestReport(raw, events, backtest);
  ok('report has 2 trades', report.trades.length === 2);
  ok('report counts backtest_motifs', report.backtest_motifs === 2);
  ok('first trade MATCHes', report.trades[0].verdict === 'MATCH');
  ok('second trade DIVERGEs (live sl vs backtest tp)', report.trades[1].verdict === 'DIVERGENCE');
  ok('summary tallies both verdicts', report.summary.MATCH === 1 && report.summary.DIVERGENCE === 1);
}

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nAll motifLiveVsBacktest tests passed.');
