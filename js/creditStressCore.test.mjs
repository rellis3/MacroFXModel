/**
 * creditStressCore tests — CSI composition (equal-weight rolling z), frozen gate
 * tiers, the as-of ≤ t−1 no-lookahead application, gate switching cost, and the
 * frozen three-way verdict (csi / vix-enough / no-gate) on constructed worlds.
 * Offline, synthetic data. Run: node js/creditStressCore.test.mjs
 */
import {
  CSI_DEFAULTS, buildCsi, gateExposure, buildGateSeries, applyGate,
  dailyStats, runCsiOverlay, evaluateCsi, creditVega, vegaLabel,
} from './creditStressCore.js';

let pass = 0, failCount = 0;
const ok = (name, cond) => cond ? (pass++, console.log(`  ✓ ${name}`))
                                : (failCount++, console.error(`  ✗ ${name}`));

// Weekday date sequence from 2018-01-01.
function tradingDates(n) {
  const out = []; let t = Date.parse('2018-01-01T00:00:00Z');
  while (out.length < n) {
    const d = new Date(t), dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10));
    t += 86_400_000;
  }
  return out;
}
const toSeries = (dates, vals) => dates.map((d, i) => ({ d, v: vals[i] }));

// ── buildCsi ─────────────────────────────────────────────────────────────────
console.log('buildCsi');
{
  const dates = tradingDates(300);
  // component A flat then step-up at i=200; component B pure noise-free flat.
  const a = dates.map((_, i) => (i < 200 ? 1 : 3));
  const b = dates.map(() => 5);
  const { series, componentZ, n } = buildCsi(
    { a: toSeries(dates, a), b: toSeries(dates, b) }, { zWindow: 60 });
  ok('warmup respected (no values before zWindow)', n > 0 && series[0].d >= dates[59]);
  const atStep = series.find(p => p.d === dates[200]);
  const before = series.find(p => p.d === dates[199]);
  ok('step-up lifts the composite', atStep.v > before.v + 1);
  ok('flat component contributes z≈0 (composite = mean)', Math.abs(before.v) < 0.2);
  ok('latest component z reported', Number.isFinite(componentZ.a) && Number.isFinite(componentZ.b));

  // inner-join: a date missing from one component is dropped
  const gap = { a: toSeries(dates, a).filter(p => p.d !== dates[250]), b: toSeries(dates, b) };
  const g = buildCsi(gap, { zWindow: 60 });
  ok('inner-join drops incomplete dates', !g.series.some(p => p.d === dates[250]));
}

// ── gate tiers (frozen) ──────────────────────────────────────────────────────
console.log('gateExposure');
{
  ok('calm → ×1', gateExposure(0.5) === 1);
  ok('z≥1 → ×0.5', gateExposure(1.0) === 0.5 && gateExposure(1.9) === 0.5);
  ok('z≥2 → ×0', gateExposure(2.0) === 0 && gateExposure(4) === 0);
  ok('no reading → fail-open ×1', gateExposure(NaN) === 1);
}

// ── applyGate: no lookahead + switching cost ─────────────────────────────────
console.log('applyGate');
{
  const dates = tradingDates(6);
  const rets = [0.01, 0.01, 0.01, 0.01, 0.01, 0.01];
  // gate goes flat exactly on dates[2]
  const gate = [{ d: dates[0], v: 1 }, { d: dates[1], v: 1 }, { d: dates[2], v: 0 }];
  const out = applyGate(dates, rets, gate, { gateCostBps: 0 });
  ok('day t uses gate ≤ t−1 (dates[2] still full exposure)', out[2] === 0.01);
  ok('flat exposure applies from the NEXT day', out[3] === 0);
  const costed = applyGate(dates, rets, gate, { gateCostBps: 10 });
  ok('|Δexposure| charged when the gate switches', costed[3] === -0.001 && costed[4] === 0);
  ok('day 0 defaults to exposure 1', out[0] === 0.01);
}

// ── overlay + frozen verdict on constructed worlds ───────────────────────────
console.log('runCsiOverlay / evaluateCsi');
{
  const N = 1000, dates = tradingDates(N);
  // book: calm drift +0.1%/day with stress windows in BOTH halves —
  // IS [300,350) and OOS [600,700) — each at −1.5%/day.
  const inStress = i => (i >= 300 && i < 350) || (i >= 600 && i < 700);
  const rets = dates.map((_, i) => (inStress(i) ? -0.015 : 0.001));
  // CSI that LEADS each stress window by ~10 days.
  const csiOn = i => (i >= 290 && i < 360) || (i >= 590 && i < 710);
  const csi = toSeries(dates, dates.map((_, i) => (csiOn(i) ? 3 : 0)));
  // VIX z that reacts LATE (misses the first half of each window).
  const vixOn = i => (i >= 325 && i < 360) || (i >= 650 && i < 710);
  const vixLate = toSeries(dates, dates.map((_, i) => (vixOn(i) ? 3 : 0)));
  const overlay = runCsiOverlay({ dates, returns: rets }, csi, vixLate, { isFrac: 0.5 });
  ok('CSI gate beats ungated OOS (stress sidestepped)', overlay.csiGated.oos.sharpe > overlay.ungated.oos.sharpe);
  ok('CSI gate beats the late VIX gate OOS', overlay.csiGated.oos.sharpe > overlay.vixGated.oos.sharpe);
  ok('drawdown reduced (maxDD is negative-signed)', overlay.csiGated.oos.maxDD > overlay.ungated.oos.maxDD);
  const ev = evaluateCsi(overlay);
  ok('constructed world → pass, verdict csi', ev.pass === true && ev.verdict === 'csi');

  // world 2: VIX carries the same info → CSI cannot beat it → 'vix-enough'
  const overlay2 = runCsiOverlay({ dates, returns: rets }, csi, csi, { isFrac: 0.5 });
  const ev2 = evaluateCsi(overlay2);
  ok('identical-info world → not pass, verdict vix-enough', ev2.pass === false && ev2.verdict === 'vix-enough');

  // world 3: a useless gate that flattens only the BEST stretch → 'no-gate'
  const badCsi = toSeries(dates, dates.map((_, i) => (i < 590 || i >= 710 ? 3 : 0)));
  const overlay3 = runCsiOverlay({ dates, returns: rets }, badCsi, badCsi, { isFrac: 0.5 });
  const ev3 = evaluateCsi(overlay3);
  ok('harmful gate → verdict no-gate', ev3.pass === false && ev3.verdict === 'no-gate');
}

// ── creditVega (diagnostic) ──────────────────────────────────────────────────
console.log('creditVega');
{
  const N = 400, dates = tradingDates(N);
  // VIX: deterministic zig-zag walk; spread reacts at k bps/VIX-pt, with a
  // regime shift k=2 → k=8 at i=200. Spread is in % points (bps = ×100).
  let s = 7; const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const vix = [15]; for (let i = 1; i < N; i++) vix.push(Math.max(9, vix[i - 1] + (rand() - 0.5) * 4));
  const spread = [4];
  for (let i = 1; i < N; i++) {
    const k = i < 200 ? 2 : 8;                       // bps per VIX point
    spread.push(spread[i - 1] + (k * (vix[i] - vix[i - 1])) / 100);
  }
  const v = creditVega(toSeries(dates, spread), toSeries(dates, vix), { window: 40, pctlWindow: 150 });
  const early = v.series.find(p => p.d === dates[150]);
  const late = v.series[v.series.length - 1];
  // percentile is RELATIVE to the trailing window: it flags High while the window
  // still spans both regimes (dates[280]), then adapts once fully in the new one.
  const shift = v.series.find(p => p.d === dates[240]);
  ok('recovers the early beta (≈2 bps/pt)', Math.abs(early.beta - 2) < 0.3);
  ok('detects the regime shift (late beta ≈8)', Math.abs(late.beta - 8) < 0.5);
  ok('percentile flags High across the regime shift', shift.pctl >= 80 && vegaLabel(shift.pctl) === 'High');
  ok('current reading has beta/pctl/label', v.current && Number.isFinite(v.current.beta)
     && ['High', 'Elevated', 'Normal', 'Low'].includes(v.current.label));
  ok('labels: cuts respected', vegaLabel(85) === 'High' && vegaLabel(65) === 'Elevated'
     && vegaLabel(50) === 'Normal' && vegaLabel(10) === 'Low' && vegaLabel(NaN) === null);
  ok('too-short input → empty, null current',
     creditVega(toSeries(dates.slice(0, 10), spread.slice(0, 10)), toSeries(dates.slice(0, 10), vix.slice(0, 10)), { window: 40 }).current === null);
}

// ── dailyStats sanity ────────────────────────────────────────────────────────
console.log('dailyStats');
{
  const s = dailyStats([0.001, 0.001, -0.001, 0.002, 0.001]);
  ok('shape', Number.isFinite(s.sharpe) && Number.isFinite(s.maxDD) && s.days === 5);
}

console.log(`\n${pass} passed, ${failCount} failed`);
if (failCount) process.exit(1);
