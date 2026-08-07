// Synthetic, no-network tests for the backtest exit-study brick.
//   node js/backtestExitStudy.test.mjs
import { mfeMae, replayFixedTP, replayTrail, replayBreakeven, replayTimeStop, studyTrade, summarizeExitStudy } from './backtestExitStudy.js';

let fail = 0;
const ok = (n, c, x = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${x ? '  ' + x : ''}`); if (!c) fail++; };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const bar = (t, o, h, l, c) => ({ time: t, open: o, high: h, low: l, close: c });

// LONG entry 100, SL 99 (risk 1). Rises 100→101.5→103.
const up = [bar(10, 100, 100.6, 99.8, 100.5), bar(20, 100.5, 101.6, 100.4, 101.5), bar(30, 101.5, 103.1, 101.4, 103.0)];
ok('fixedTP 1R hits (+1)', near(replayFixedTP(up, 100, 99, 1, 1), 1));
ok('fixedTP 2R hits (+2)', near(replayFixedTP(up, 100, 99, 1, 2), 2));
ok('fixedTP 3R hits (+3)', near(replayFixedTP(up, 100, 99, 1, 3), 3));
ok('MFE ≈ 3.1R', near(mfeMae(up, 100, 99, 1).mfeR, 3.1, 1e-9));

// LONG, drops straight to SL.
const dn = [bar(10, 100, 100.1, 98.5, 98.7)];
ok('SL hit → −1R', near(replayFixedTP(dn, 100, 99, 1, 2), -1));
ok('MAE ≈ 1.5R', near(mfeMae(dn, 100, 99, 1).maeR, 1.5, 1e-9));

// Conservative: bar touching BOTH SL and TP → adverse wins.
const both = [bar(10, 100, 102.5, 98.5, 100)];
ok('SL+TP same bar → −1 (conservative)', near(replayFixedTP(both, 100, 99, 1, 2), -1));

// Trailing up to +2R then back → +1.5R.
const trail = [bar(10, 100, 100.6, 99.9, 100.5), bar(20, 100.5, 102.0, 100.4, 101.8), bar(30, 101.8, 101.9, 101.0, 101.1)];
ok('trail 0.5/0.5 banks ≈ +1.5R', near(replayTrail(trail, 100, 99, 1, 0.5, 0.5), 1.5, 1e-9), `got ${replayTrail(trail, 100, 99, 1, 0.5, 0.5)}`);

// Breakeven: arm at +1R then dip to entry → ~0R.
const beDip = [bar(10, 100, 101.2, 99.9, 101.0), bar(20, 101.0, 101.1, 99.95, 100.0)];
ok('BE@1R then dip → ~0R', near(replayBreakeven(beDip, 100, 99, 103, 1, 1), 0, 0.02), `got ${replayBreakeven(beDip, 100, 99, 103, 1, 1)}`);

// Time-stop: unresolved after 4h → mark to close.
const flat = [bar(0, 100, 100.3, 99.7, 100.1), bar(4 * 3600, 100.1, 100.4, 99.8, 100.2)];
ok('time-stop 4h → close (+0.2R)', near(replayTimeStop(flat, 100, 99, 103, 1, 0, 4), 0.2, 1e-9));

// studyTrade + summarize
const s1 = studyTrade(up, { direction: 'LONG', entry: 100, sl: 99, tp: 102, entry_ts: 10, exit_ts: 30, pnl_r: 2 });
ok('studyTrade returns rules', s1.rules.actual === 2 && s1.rules['tp1R'] === 1);
const summary = summarizeExitStudy([s1, studyTrade(dn, { direction: 'LONG', entry: 100, sl: 99, tp: 102, entry_ts: 10, exit_ts: 10, pnl_r: -1 })]);
ok('summary aggregates per rule', summary.byRule.actual.n === 2 && summary.byRule['tp1R'].n === 2);
ok('winnersMedianMfe > 0', summary.winnersMedianMfe > 0);

console.log(fail ? `\n${fail} FAILURE(S)` : '\nAll backtest exit-study tests passed');
process.exit(fail ? 1 : 0);
