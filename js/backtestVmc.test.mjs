// Synthetic, no-network tests for the VMC-confirmation brick.
//   node js/backtestVmc.test.mjs
import { wtSeriesForPair, classifyEntry, summarize, OPERATOR_WT } from './backtestVmc.js';

let fail = 0;
const ok = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) fail++; };

// ── classifyEntry: causal read + fade semantics ──────────────────────────────
// series bars at t=100,200,300,400 with WT1 = [0, +60, -60, +10] (overbought,
// oversold, neutral). Fade LONG wants oversold; fade SHORT wants overbought.
const series = { times: [100, 200, 300, 400], wt1: [0, 60, -60, 10], wt2: [0, 50, -50, 5] };

// entryTs=250 → last bar strictly before = idx1 (WT1 +60, overbought)
ok('LONG @250 overbought → oppose', classifyEntry(series, 250, 'LONG', 45).cls === 'oppose');
ok('SHORT @250 overbought → confirm', classifyEntry(series, 250, 'SHORT', 45).cls === 'confirm');
// entryTs=350 → idx2 (WT1 -60, oversold)
ok('LONG @350 oversold → confirm', classifyEntry(series, 350, 'LONG', 45).cls === 'confirm');
ok('SHORT @350 oversold → oppose', classifyEntry(series, 350, 'SHORT', 45).cls === 'oppose');
// entryTs=450 → idx3 (WT1 +10, within band)
ok('LONG @450 mid-band → neutral', classifyEntry(series, 450, 'LONG', 45).cls === 'neutral');
// causality: a bar AT/after entry must not be used — entry=300 uses idx1 (t=200), not idx2 (t=300)
ok('causal: entry=300 reads bar t=200 not t=300', classifyEntry(series, 300, 'LONG', 45).wt1 === 60);
// too-early entry → unknown
ok('entry before 2nd bar → unknown', classifyEntry(series, 150, 'LONG', 45).cls === 'unknown');
ok('null series → unknown', classifyEntry(null, 300, 'LONG', 45).cls === 'unknown');

// ── summarize buckets ────────────────────────────────────────────────────────
const trades = [
  { vmc: 'confirm', win: true,  net_r: 1.8, conv: 0.5 },
  { vmc: 'confirm', win: true,  net_r: 1.6, conv: 0.45 },
  { vmc: 'confirm', win: false, net_r: -1.1, conv: 0.2 },
  { vmc: 'oppose',  win: false, net_r: -1.1, conv: 0.5 },
  { vmc: 'oppose',  win: false, net_r: -1.1, conv: 0.6 },
  { vmc: 'neutral', win: true,  net_r: 1.7, conv: 0.3 },
  { vmc: 'unknown', win: false, net_r: -1.0, conv: 0.4 },
];
const s = summarize(trades);
ok('confirm bucket n=3, win% 67', s.byClass.confirm.n === 3 && s.byClass.confirm.winPct === 66.7, `win% ${s.byClass.confirm.winPct}`);
ok('oppose bucket 0% win', s.byClass.oppose.winPct === 0);
ok('classified excludes unknown (n=6)', s.classified.n === 6);
ok('confirm expR > rest expR (the hypothesis shape)', s.confirmVsRest.confirm.expR > s.confirmVsRest.rest.expR,
   `${s.confirmVsRest.confirm.expR} vs ${s.confirmVsRest.rest.expR}`);
ok('highConv confirm isolates conv>=0.4 & confirm (n=2)', s.highConv.confirm.n === 2, `n=${s.highConv.confirm.n}`);

// ── wtSeriesForPair: causal WT on synthetic oscillating M1 ───────────────────
const N = 600, t0 = 1_700_000_000;
const times = new Int32Array(N), opens = new Float32Array(N), highs = new Float32Array(N),
      lows = new Float32Array(N), closes = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const p = 1.10 + 0.01 * Math.sin(i / 20);            // slow oscillation → WT swings ±
  times[i] = t0 + i * 60; opens[i] = p; closes[i] = p + 0.0002 * Math.cos(i / 20);
  highs[i] = Math.max(opens[i], closes[i]) + 0.0003; lows[i] = Math.min(opens[i], closes[i]) - 0.0003;
}
const packed = { n: N, times, opens, highs, lows, closes };
const ser = wtSeriesForPair(packed, t0, t0 + N * 60, 5, OPERATOR_WT);   // 5-min TF
ok('wtSeries returns finite WT1 series', ser && ser.wt1.length > 10 && Number.isFinite(ser.wt1.at(-1)));
ok('wtSeries times ascending', ser && ser.times.every((t, i) => i === 0 || t >= ser.times[i - 1]));
ok('oscillation drives WT beyond ±30', ser && Math.max(...ser.wt1.filter(Number.isFinite)) > 30);

console.log(fail ? `\n${fail} FAILURE(S)` : '\nAll backtestVmc tests passed');
process.exit(fail ? 1 : 0);
