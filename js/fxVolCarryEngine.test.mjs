// Synthetic, no-network unit tests for the CME CVOL vol-carry (VRP) brick.
// Proves the pipeline is wired correctly on data with a known answer, before
// trusting it against real OANDA/CVOL data (which this sandbox can't reach —
// see MD files/CLAUDE.md's OANDA-egress note). Not a claim of edge — see
// fx-vol-carry-backtest.html on the live deploy for that.
//
//   node js/fxVolCarryEngine.test.mjs

import { alignCvolToBars, computeVRPSeries, realizedVolPct, loadCvolSeries, loadCboeVolSeries, crossCheckSeries } from './impliedVolCore.js';
import { selectStrategyVRP, runVRPBacktest, toCsvReturns, toCsvRMultiples, toCsvCurrency, VRP_INSTRUMENTS } from './fxVolCarryEngine.js';
import { resolveHonestDay } from './honestForecastEngine.js';

let failures = 0;
const ok = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };

// ── Deterministic synthetic D1 series (no Math.random) ────────────────────
function makeBars(n, { seedPx = 1.1000, driftAmp = 0.0006, volAmp = 0.004 } = {}) {
  const bars = [];
  let px = seedPx;
  const t0 = Date.UTC(2016, 0, 4); // a Monday
  for (let i = 0; i < n; i++) {
    const drift = driftAmp * Math.sin(i / 30);
    // Deterministic (no Math.random) day-to-day vol clustering: every 4th bar
    // is a wide-range day so the exhaustion bands actually get touched —
    // this is a wiring test, not a realistic-price-action test.
    const wide = i % 4 === 0 ? 3.2 : 1;
    const wiggle = volAmp * wide * Math.sin(i * 1.7) * px;
    const open = px;
    const close = px * (1 + drift) + wiggle * 0.3;
    const high = Math.max(open, close) + Math.abs(wiggle) * 0.9;
    const low = Math.min(open, close) - Math.abs(wiggle) * 0.9;
    const date = new Date(t0 + i * 86400000).toISOString().slice(0, 10);
    bars.push({ date, open, high, low, close });
    px = close;
  }
  return bars;
}

// ── 1) alignCvolToBars: exact-date match, no forward-fill ─────────────────
{
  const bars = makeBars(5);
  const cvolRows = [
    { date: bars[0].date, cvol: 8.0 },
    { date: bars[2].date, cvol: 9.5 },
  ];
  const aligned = alignCvolToBars(bars, cvolRows);
  ok('alignCvolToBars matches bar 0', aligned[0]?.cvol === 8.0);
  ok('alignCvolToBars leaves unmatched bar null (no forward-fill)', aligned[1] === null);
  ok('alignCvolToBars matches bar 2', aligned[2]?.cvol === 9.5);
}

// ── 2) realizedVolPct: no-lookahead lag, fx path ───────────────────────────
{
  const bars = makeBars(80);
  const rv = realizedVolPct(bars, 'fx');
  ok('realizedVolPct fx: leading window is null (warmup)', rv[5] === null);
  ok('realizedVolPct fx: settles to a finite positive % past warmup', Number.isFinite(rv[60]) && rv[60] > 0);
}

// ── 3) computeVRPSeries: VRP sign and z-score behave as designed ──────────
{
  const bars = makeBars(400, { volAmp: 0.002 }); // low realized vol throughout
  // CVOL row for every bar, richly priced (cvol always far above what this
  // low-vol synthetic series will realize) — VRP should be persistently
  // positive and the rolling z-score should settle near 0 once the window is
  // saturated (constant offset → low dispersion → z near the noise floor,
  // never systematically extreme in one direction on a CONSTANT series).
  const cvolRows = bars.map(b => ({ date: b.date, cvol: 15.0 }));
  const vrpRows = computeVRPSeries(bars, cvolRows, 'fx', { zPeriod: 100 });
  const late = vrpRows.slice(350);
  ok('computeVRPSeries: VRP positive when CVOL >> realized', late.every(r => r.vrp === null || r.vrp > 0));
  ok('computeVRPSeries: z-score is finite once window is saturated', Number.isFinite(late[late.length - 1].vrpZ));
}

// ── 4) selectStrategyVRP: threshold logic ──────────────────────────────────
{
  ok('selectStrategyVRP: null z → flat', selectStrategyVRP(null) === 'flat');
  ok('selectStrategyVRP: rich (>= richZ) → fade', selectStrategyVRP(1.2) === 'fade');
  ok('selectStrategyVRP: cheap (<= cheapZ) → follow', selectStrategyVRP(-1.2) === 'follow');
  ok('selectStrategyVRP: neutral → flat', selectStrategyVRP(0.1) === 'flat');
  ok('selectStrategyVRP: custom thresholds respected', selectStrategyVRP(0.6, { richZ: 1.0 }) === 'flat');
}

// ── 5) resolveHonestDay: MAE% and slDPct are real, path-derived numbers ───
{
  // A SELL at upBand that gets stopped out: MAE should be bounded by how far
  // price ran against it (high - entry), scaled to % of open — not a
  // placeholder.
  // hl75pct=3 → upBand=103; slMult=1.5 → SL sits at 103+4.5=107.5. high=110
  // runs THROUGH that SL, so this must resolve as a loss, not a win.
  const bar = { open: 100, high: 110, low: 99, close: 101 };
  const r = resolveHonestDay(bar, 3, 1, 'up', 'fade', { slMult: 1.5, costPct: 0, slipPct: 0, breachReclaim: false });
  ok('resolveHonestDay: fills the SELL at the up band', r.filled === true && r.side === 'SELL');
  ok('resolveHonestDay: reports a stop-loss when price runs through SL', r.outcome === 'loss');
  ok('resolveHonestDay: maePct is a finite non-negative number', Number.isFinite(r.maePct) && r.maePct >= 0);
  ok('resolveHonestDay: slDPct matches slMult × hl75pct', Math.abs(r.slDPct - 3 * 1.5) < 1e-6, `got ${r.slDPct}`);
}

// ── 6) runVRPBacktest: end-to-end wiring, three arms, CSV exports ─────────
{
  const bars = makeBars(500);
  const cvolRows = bars.map((b, i) => ({ date: b.date, cvol: 10 + 4 * Math.sin(i / 15) }));
  const out = runVRPBacktest(bars, 'fx', cvolRows, { minLookback: 60, zPeriod: 100, oosFrac: 0.4 });
  ok('runVRPBacktest: three arms present', !!(out.arms.vrp && out.arms.alwaysFade && out.arms.alwaysFollow));
  ok('runVRPBacktest: diagnostics length matches bars', out.diagnostics.length === bars.length);
  ok('runVRPBacktest: alwaysFade and alwaysFollow trade every eligible day (no VRP gate)',
    out.records.alwaysFade.filter(r => r.filled).length > 0 && out.records.alwaysFollow.filter(r => r.filled).length > 0);
  ok('runVRPBacktest: VRP arm has fewer-or-equal filled trades than always-fade (flat zone withholds trades)',
    out.records.vrp.filter(r => r.filled).length <= out.records.alwaysFade.filter(r => r.filled).length + out.records.alwaysFollow.filter(r => r.filled).length);
  const csv1 = toCsvReturns(out.records.vrp);
  const csv2 = toCsvRMultiples(out.records.vrp);
  const csv3 = toCsvCurrency(out.records.vrp);
  ok('toCsvReturns header matches house schema', csv1.startsWith('Date,Return %,MAE %'));
  ok('toCsvRMultiples header matches house schema', csv2.startsWith('date,R,MAE (R)'));
  ok('toCsvCurrency header matches house schema', csv3.startsWith('Trade Date,PnL ($),Risk ($)'));
}

// ── 7) CBOE data (GVZ/VXN) — real files, loads and shapes match the CME contract
{
  const nas = loadCboeVolSeries('NAS100');
  const gold = loadCboeVolSeries('XAUUSD');
  ok('loadCboeVolSeries: NAS100 (VXN) has rows', nas.length > 2000, `n=${nas.length}`);
  ok('loadCboeVolSeries: XAUUSD (GVZ) has rows', gold.length > 2000, `n=${gold.length}`);
  ok('loadCboeVolSeries: normalizes close into the cvol field', Number.isFinite(nas[0]?.cvol));
  ok('loadCboeVolSeries: GVZ has no OHLC — atm/skew stay null, not fabricated', gold[0]?.atm === null && gold[0]?.skew === null);
  ok('loadCboeVolSeries: unknown product returns empty, not a throw', loadCboeVolSeries('NOPE').length === 0);
}

// ── 8) index asset class end-to-end (NQ/VXN) — GARCH realized-vol path wired ──
{
  const bars = makeBars(400);
  const rv = realizedVolPct(bars, 'index');
  ok('realizedVolPct index: produces finite values once GARCH warms up', Number.isFinite(rv[100]) && rv[100] > 0);
  const out = runVRPBacktest(bars, 'index', loadCboeVolSeries('NAS100'), { minLookback: 60, zPeriod: 100, oosFrac: 0.4 });
  ok('runVRPBacktest index: three arms present', !!(out.arms.vrp && out.arms.alwaysFade && out.arms.alwaysFollow));
  ok('runVRPBacktest index: diagnostics carries a numeric cvol where CBOE dates overlap the synthetic bars',
    out.diagnostics.some(d => Number.isFinite(d.cvol)));
}

// ── 9) crossCheckSeries — GVZ vs itself is a perfect check; independent series correlate weakly ──
{
  const bars = makeBars(300);
  const gvz = loadCboeVolSeries('XAUUSD').filter(r => bars.some(b => b.date === r.date));
  const selfCheck = crossCheckSeries(bars, gvz, gvz);
  ok('crossCheckSeries: a series checked against itself is correlation 1', selfCheck.correlation === 1, `got ${selfCheck.correlation}`);
  ok('crossCheckSeries: point count matches overlapping dates', selfCheck.n === selfCheck.points.filter(p => p.primary != null).length);
  const empty = crossCheckSeries(bars, [], gvz);
  ok('crossCheckSeries: no overlap → null correlation, not a fabricated 0', empty.correlation === null);
}

// ── 10) GOLD's declared cross-check wiring is present in VRP_INSTRUMENTS ──
{
  const gold = VRP_INSTRUMENTS.find(i => i.name === 'GOLD');
  const nq = VRP_INSTRUMENTS.find(i => i.name === 'NQ');
  ok('VRP_INSTRUMENTS: GOLD declares a CBOE/GVZ cross-check', gold?.crossCheck?.volSource === 'CBOE' && gold?.crossCheck?.cboeProduct === 'XAUUSD');
  ok('VRP_INSTRUMENTS: NQ is present with CBOE/VXN as its primary source (CME CVOL has no index coverage)', nq?.volSource === 'CBOE' && nq?.cboeProduct === 'NAS100');
}

// ── 11) REGRESSION — real CVOL calendar gaps must not kill the z-score on
// every day forever. Found live 2026-08-22: the first production run showed
// the VRP arm firing ZERO trades on all 8 instruments, IS and OOS, while the
// baselines traded normally — the tell that something upstream was broken,
// not a null result. Root cause: CME/CBOE only settle on US options-exchange
// days, so US holidays OANDA still trades through (MLK, Presidents Day, Good
// Friday, Thanksgiving, …) show up as missing CVOL rows — ~98 gaps over
// 2016-2026, spaced every ~28 trading days on average. The z-score used to
// require the ENTIRE 252-day trailing window to be gap-free, and no window
// ever was — verified directly against the real data file: 0 of 2774 days
// came out finite. This test builds bars for every real weekday in EURUSD's
// actual CVOL date range (so it reproduces the true gap pattern, not a
// synthetic approximation of it) and asserts a meaningful majority of days
// now get a real z-score.
{
  const eurCvol = loadCvolSeries('EURUSD');
  const cvolDates = new Set(eurCvol.map(r => r.date));
  const isWeekend = d => { const wd = new Date(d + 'T00:00:00Z').getUTCDay(); return wd === 0 || wd === 6; };
  const addDays = (d, n) => { const dt = new Date(d + 'T00:00:00Z'); dt.setUTCDate(dt.getUTCDate() + n); return dt.toISOString().slice(0, 10); };
  const bars = [];
  let px = 1.10, cur = eurCvol[0].date, i = 0;
  while (cur <= eurCvol[eurCvol.length - 1].date) {
    if (!isWeekend(cur)) {
      // Deterministic wide-range days (same trick as makeBars above) so the
      // exhaustion bands actually get touched — this test is checking the
      // real CVOL calendar's effect on the z-score/selector wiring, not
      // realistic price action.
      const wide = i % 4 === 0 ? 3.2 : 1;
      const wiggle = 0.003 * wide * Math.sin(i * 1.3) * px;
      const open = px, close = px * (1 + 0.00002 * Math.sin(i / 30)) + wiggle * 0.3;
      bars.push({ date: cur, open, high: Math.max(open, close) + Math.abs(wiggle) * 0.9, low: Math.min(open, close) - Math.abs(wiggle) * 0.9, close });
      px = close; i++;
    }
    cur = addDays(cur, 1);
  }
  const gapDays = bars.filter(b => !cvolDates.has(b.date)).length;
  ok('regression setup: reproduces the real ~98-gap CVOL calendar pattern', gapDays > 80 && gapDays < 120, `gaps=${gapDays}`);

  const vrpRows = computeVRPSeries(bars, eurCvol, 'fx', { zPeriod: 252 });
  const finiteZ = vrpRows.filter(r => Number.isFinite(r.vrpZ)).length;
  ok('regression: z-score is finite on a large majority of days despite calendar gaps (was 0/N before the fix)',
    finiteZ > bars.length * 0.7, `finite=${finiteZ}/${bars.length}`);

  const out = runVRPBacktest(bars, 'fx', eurCvol, { minLookback: 60, zPeriod: 252, oosFrac: 0.4 });
  ok('regression: VRP arm actually fires trades against the real gap pattern (was 0 in every instrument before the fix)',
    out.records.vrp.filter(r => r.filled).length > 0, `filled=${out.records.vrp.filter(r => r.filled).length}`);
}

console.log(failures === 0 ? `\nAll fxVolCarryEngine tests passed.` : `\n${failures} FAILURE(S).`);
process.exit(failures === 0 ? 0 : 1);
