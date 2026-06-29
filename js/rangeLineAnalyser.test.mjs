// Synthetic end-to-end test for the range-line analyser (Forecast-Level Strategy
// applied to range levels, modules stripped). Proves the clean pipeline emits
// perLineStrategy-shaped records and runs through the proven policy engine.
//   node js/rangeLineAnalyser.test.mjs

import { analyseRangeWindow, runRangeLineAnalyser, runRangeLineBook } from './rangeLineAnalyser.js';
import { bucketM1IntoSessions } from './forecastAnalyser.js';
import { extractTouches } from './perLineStrategy.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

// ── Synthetic packed M1: N days × an up-then-down intraday swing (so range lines
// get touched and revert/continue). Deterministic (no Math.random). ────────────
function makePacked(days, base0, seed) {
  const perDay = 90;                                   // 90 × 1-min bars (00:00–01:30 UTC) → same-day session
  const n = days * perDay;
  const times = new Float64Array(n), opens = new Float64Array(n), highs = new Float64Array(n),
        lows = new Float64Array(n), closes = new Float64Array(n), volumes = new Float64Array(n);
  const day0 = Date.UTC(2024, 0, 1) / 1000;
  let idx = 0, base = base0;
  for (let d = 0; d < days; d++) {
    const dayStart = day0 + d * 86400;                 // 00:00 UTC each day
    base *= 1 + 0.0009 * Math.sin((d + seed) / 5);     // slow drift in the base
    const amp = 0.006 + 0.002 * Math.sin((d + seed) / 3);
    for (let m = 0; m < perDay; m++) {
      const o = base * (1 + amp * Math.sin((m + seed) / 12));
      const c = base * (1 + amp * Math.sin((m + 1 + seed) / 12));
      times[idx] = dayStart + m * 60;
      opens[idx] = o; closes[idx] = c;
      highs[idx] = Math.max(o, c) * 1.0002; lows[idx] = Math.min(o, c) * 0.9998;
      volumes[idx] = 100 + (m % 11) + (d % 7);
      idx++;
    }
  }
  return { n, times, opens, highs, lows, closes, volumes };
}

console.log('[records shape — perLineStrategy compatible]');
const packed = makePacked(60, 1.1000, 0);
const sessions = bucketM1IntoSessions(packed, 22);
// asiaHrs 0.5 so the 90-min synthetic session has a post-formation window left
// to trade (the no-lookahead gate drops touches during range formation).
const records = runRangeLineAnalyser(sessions, 'fx', { sources: ['asia', 'monday'], minLookback: 20, minBarsPerSession: 30, asiaHrs: 0.5 });
ok('produces window records', records.length > 0, `${records.length} sessions`);
const allLines = records.flatMap(r => r.lines);
ok('lines have outcome reverted/continued', allLines.length > 0 && allLines.every(l => l.outcome === 'reverted' || l.outcome === 'continued'));
ok('lines carry triple-barrier geometry', allLines.every(l => Number.isFinite(l.innerLvl) && Number.isFinite(l.outerLvl) && Number.isFinite(l.level)));
ok('lines tagged decidedBy (barrier|close)', allLines.every(l => l.decidedBy === 'barrier' || l.decidedBy === 'close'));
ok('lines have approachVel (bucket or null)', allLines.every(l => 'approachVel' in l));
ok('both Asia (A_) and Monday (M_) line sources present', allLines.some(l => l.name.startsWith('A_')) && allLines.some(l => l.name.startsWith('M_')));

console.log('[extractTouches consumes the records]');
const touches = extractTouches(records, { conditions: [] });   // cell = line only (dense, for the test)
ok('extractTouches yields decided touches', touches.length > 0, `${touches.length} touches`);
ok('touches have cell + barrier prices', touches.every(t => t.cell && Number.isFinite(t.innerLvl) && Number.isFinite(t.outerLvl)));

console.log('[analyseRangeWindow direct — inner toward mid, outer away]');
const oneDay = sessions.get([...sessions.keys()].sort()[30]);
const low = 1.10, high = 1.11, mid = 1.105;
const ladder = { low, high, levels: [
  { label: 'A_0', level: 1.10 }, { label: 'A_0.5', level: 1.105 }, { label: 'A_1', level: 1.11 },
] };
const lr = analyseRangeWindow({ open: oneDay[0].open, bars: oneDay }, [ladder], { sigma: 0.005, tf: null });
ok('direct analyse returns line records', Array.isArray(lr));
ok('no approachVel when tf=null (still has outcome geometry)', lr.every(l => l.approachVel == null && Number.isFinite(l.innerLvl)));

console.log('[no-lookahead gate — validFrom excludes formation-window touches]');
// Tiny session: price touches the MID level (which has both neighbours, so it's
// a valid trade) ONLY in the first 5 bars, then sits above it. With validFrom
// after those bars, the mid must NOT produce a trade; without it, it must.
const t0 = 1_700_000_000;
const synth = [];
for (let k = 0; k < 20; k++) {
  const px = k < 5 ? 1.1040 : 1.1080;   // dips to touch 1.105 only in the first 5 bars
  synth.push({ time: t0 + k * 60, open: px, high: px + 0.0001, low: px - 0.0001, close: px });
}
const lvls = [{ label: 'A_0', level: 1.10 }, { label: 'A_0.5', level: 1.105 }, { label: 'A_1', level: 1.11 }];
const gated = analyseRangeWindow({ open: 1.10, bars: synth },
  [{ low: 1.10, high: 1.11, validFrom: t0 + 10 * 60, levels: lvls }], { tf: null });
ok('A_0.5 dropped — its only touch was before validFrom', !gated.some(l => l.name === 'A_0.5'),
   `lines after gate: ${gated.map(l => l.name).join(',') || 'none'}`);
const ungated = analyseRangeWindow({ open: 1.10, bars: synth },
  [{ low: 1.10, high: 1.11, levels: lvls }], { tf: null });
ok('A_0.5 present without the gate (control)', ungated.some(l => l.name === 'A_0.5'));

console.log('[full book through the proven per-line engine]');
const book = runRangeLineBook(
  { eurusd: packed, gbpusd: makePacked(60, 1.2500, 3) },
  { sources: ['asia', 'monday'], conditions: [], minN: 3, splitFrac: 0.6, marginPct: 0, mcRuns: 30, bootRuns: 30, minLookback: 20, asiaHrs: 0.5 }
);
ok('book returns a policy', book && book.policy && Object.keys(book.policy).length > 0);
ok('book has per-pair OOS stats for both pairs', book.perPair.eurusd && book.perPair.gbpusd);
ok('book has aggregate stats + coverage', book.book && book.coverage &&
   Number.isFinite(book.coverage.fadeCells + book.coverage.followCells + book.coverage.skipCells));
ok('honest portfolio risk present (daily-aggregated Sharpe, not per-touch)',
   book.portfolio && Number.isFinite(book.portfolio.sharpe) && Number.isFinite(book.portfolio.avgTradesPerDay),
   `portSharpe=${book.portfolio?.sharpe} trades/day=${book.portfolio?.avgTradesPerDay}`);
ok('survivors block present (live universe re-aggregated)',
   book.survivors && Array.isArray(book.survivors.pairs) && book.survivors.portfolio,
   `kept=${book.survivors?.count}/${book.survivors?.total}`);
ok('policy cells decide fade/follow/skip', Object.values(book.policy).every(p => ['fade', 'follow', 'skip'].includes(p.decision)));
ok('nTrades is a count', Number.isFinite(book.nTrades) && book.nTrades >= 0, `nTrades=${book.nTrades}`);

console.log(`\n${failures === 0 ? 'ALL PASSED ✓' : failures + ' CHECK(S) FAILED ✗'}`);
process.exit(failures === 0 ? 0 : 1);
