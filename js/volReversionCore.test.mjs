// Synthetic, no-network unit tests for volReversionCore.js.
//   node js/volReversionCore.test.mjs

import { volRichnessZ, volOuDiagnostic, scoreVolPredictsForwardVol } from './volReversionCore.js';

let passed = 0, failed = 0;
const ok = (c, m) => { if (c) passed++; else { failed++; console.error('  ✗', m); } };

function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const gauss = (r) => { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

// GARCH(1,1)-ish vol clustering + leverage effect (negative return → vol ticks up).
function garchSeries(seed, N = 2000) {
  const r = rng(seed);
  let vol = 0.01, price = 100;
  const closes = [];
  for (let i = 0; i < N; i++) {
    const ret = gauss(r) * vol;
    price *= (1 + ret);
    closes.push(price);
    vol = Math.sqrt(0.000002 + 0.08 * ret * ret + 0.90 * vol * vol) + (ret < 0 ? 0.0003 : 0);
  }
  return closes;
}

// Same clustering, but with a REGIME-SHIFTING baseline vol level every 500 bars —
// raw level should track the (highly persistent) regime much better than a z-score
// that explicitly strips regime-level information out by construction.
function regimeShiftGarchSeries(seed, N = 3000) {
  const r = rng(seed);
  let vol = 0.01, price = 100, baseline = 0.01;
  const closes = [];
  for (let i = 0; i < N; i++) {
    if (i > 0 && i % 500 === 0) baseline *= (gauss(r) > 0 ? 1.8 : 0.55);
    const ret = gauss(r) * vol;
    price *= (1 + ret);
    closes.push(price);
    vol = Math.sqrt(baseline * baseline * 0.2 + 0.08 * ret * ret + 0.72 * vol * vol);
  }
  return closes;
}

console.log('\n── volRichnessZ / volOuDiagnostic ──');
{
  const closes = garchSeries(11);
  const { rv, z } = volRichnessZ(closes);
  ok(rv.length === closes.length && z.length === closes.length, 'rv/z aligned to closes');
  ok(z.filter(Number.isFinite).length > 1500, 'z has substantial coverage after warmup');

  const ou = volOuDiagnostic(closes);
  ok(ou && ou.ok === true, 'vol-richness z mean-reverts on GARCH-clustered data (ouFit.ok)', ou?.ok);
  ok(ou.kappa > 0, 'κ > 0 (genuine reversion, not a random walk)', `κ=${ou?.kappa}`);
  ok(Math.abs(ou.tStat) > 4, 'reversion is strongly significant (|t|>4)', `t=${ou?.tStat}`);
  ok(ou.halfLife > 0 && ou.halfLife < 200, 'half-life is a sane finite number of bars', `hl=${ou?.halfLife}`);

  // degenerate input guards (mirrors ouCore.test.mjs's own degenerate-case coverage)
  ok(volOuDiagnostic([1, 2, 3]) === null, 'too-short series → null, not a crash');
}

console.log('\n── scoreVolPredictsForwardVol — plain clustering (no regime info to strip) ──');
{
  const closes = garchSeries(11);
  const rep = scoreVolPredictsForwardVol(closes);
  ok(rep.ok === true, 'runs on GARCH-clustered data', rep.error || '');
  ok(Object.values(rep.perHorizon).every(h => h.n >= 30 || h.insufficient), 'every horizon has a real OOS sample or is honestly marked insufficient');
  ok(Object.values(rep.perHorizon).some(h => h.icBenchmark != null && h.icBenchmark > 0.1), 'raw-level persistence benchmark shows real forecast power (vol clusters)', JSON.stringify(rep.perHorizon));
  ok(typeof rep.verdict === 'string' && /SURVIVES|NULL/.test(rep.verdict), 'verdict is a string with a call');
}

console.log('\n── scoreVolPredictsForwardVol — regime-shifting baseline (raw level should win decisively) ──');
{
  // Mechanism proof: when the vol REGIME itself is persistent and long-lived
  // relative to the z-window, standardizing throws away exactly the information
  // that predicts future raw level — icEdge should read clearly, decisively
  // negative here, not just noise near zero. Proves the test discriminates real
  // effect sizes rather than always reading the same thing regardless of input.
  const closes = regimeShiftGarchSeries(11);
  const rep = scoreVolPredictsForwardVol(closes, { horizons: [5, 10, 20, 60] });
  ok(rep.ok === true, 'runs on regime-shifting series', rep.error || '');
  ok(rep.bestEdge < -0.2, 'icEdge reads decisively negative (raw level captures regime persistence that z discards)', `bestEdge=${rep.bestEdge}`);
  ok(/NULL/.test(rep.verdict), 'verdict correctly reads NULL (standardizing did not help here)', rep.verdict.slice(0, 40));

  // and the plain-clustering case above should NOT show this same large magnitude —
  // confirms the effect scales with how much regime information actually exists,
  // not a fixed artifact of the harness itself.
  const closesPlain = garchSeries(11);
  const repPlain = scoreVolPredictsForwardVol(closesPlain);
  ok(Math.abs(repPlain.bestEdge) < Math.abs(rep.bestEdge), 'regime-shift edge magnitude clearly exceeds the no-regime-shift case', `plain=${repPlain.bestEdge} regime=${rep.bestEdge}`);
}

console.log('\n── guards ──');
{
  const short = scoreVolPredictsForwardVol(Array.from({ length: 50 }, (_, i) => 100 + i * 0.1));
  ok(short.ok === false && /need/.test(short.error), 'too-short series → clean error, not a crash');
}

console.log(`\n${failed === 0 ? '✅' : '❌'} volReversionCore tests: ${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
