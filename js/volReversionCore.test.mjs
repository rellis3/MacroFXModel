// Synthetic, no-network unit tests for volReversionCore.js.
//   node js/volReversionCore.test.mjs

import { volRichnessZ, volOuDiagnostic, scoreVolPredictsForwardVol, scoreVolPredictsForwardReturn } from './volReversionCore.js';

let passed = 0, failed = 0;
const ok = (c, m) => { if (c) passed++; else { failed++; console.error('  ✗', m); } };

function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const gauss = (r) => { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

// Pure i.i.d.-return random walk — NO relationship of any kind between vol-richness
// and forward price return, by construction. Deliberately plain (no GARCH
// clustering) since scoreVolPredictsForwardReturn's null claim only needs vol
// itself to move around at all, not to cluster.
function randomWalkSeries(seed, N = 1000, dailyVol = 0.01) {
  const r = rng(seed);
  let price = 100;
  const closes = [];
  for (let i = 0; i < N; i++) { price *= (1 + gauss(r) * dailyVol); closes.push(price); }
  return closes;
}

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

console.log('\n── scoreVolPredictsForwardReturn — runs and returns a call ──');
{
  const closes = garchSeries(11);
  const rep = scoreVolPredictsForwardReturn(closes, { nBoot: 300 });
  ok(rep.ok === true, 'runs on GARCH-clustered data', rep.error || '');
  ok(rep.best && Number.isFinite(rep.best.pValue), 'produces a best-horizon p-value', JSON.stringify(rep.best));
  ok(typeof rep.verdict === 'string' && /SURVIVES|NULL/.test(rep.verdict), 'verdict is a string with a call');

  const short = scoreVolPredictsForwardReturn(Array.from({ length: 50 }, (_, i) => 100 + i * 0.1));
  ok(short.ok === false && /need/.test(short.error), 'too-short series → clean error, not a crash');
}

console.log('\n── scoreVolPredictsForwardReturn — null calibration on PURE random walk (the actual proof) ──');
{
  // This is the exact class of failure the prior PR flagged and dropped: a naive
  // circular-shift / block-permuted surrogate did NOT calibrate to a small null on
  // a pure random walk (mean |icEdge| 0.06-0.30). The right calibration check is
  // NOT "is any single |icEdge| small" (a null IC distribution centered at 0 still
  // has nonzero E[|X|] by construction) — it's whether the test's FALSE-POSITIVE
  // RATE across repeated independent no-signal simulations sits near its nominal
  // 5%, and whether the null distribution's mean sits near 0 (no systematic bias).
  // Run the full test (block-bootstrap + p-value) on many independent pure random
  // walks — each has NO relationship between vol-richness and forward return by
  // construction — and check both.
  const N_SIMS = 60, ALPHA = 0.05;
  let rejectionsRaw = 0, rejectionsAdj = 0, counted = 0;
  const nullMeans = [];
  for (let sim = 0; sim < N_SIMS; sim++) {
    const closes = randomWalkSeries(1000 + sim);
    // full production default (4 horizons) — the realistic multiple-testing case.
    const rep = scoreVolPredictsForwardReturn(closes, { nBoot: 200, seed: 0xC0FFEE + sim });
    if (rep.ok && rep.best) {
      counted++;
      if (rep.best.pValue < ALPHA) rejectionsRaw++;
      if (rep.best.pAdjusted < ALPHA) rejectionsAdj++;
      nullMeans.push(rep.best.nullMean);
    }
  }
  ok(counted >= N_SIMS * 0.9, 'nearly every simulated random walk produced a testable result', `counted=${counted}/${N_SIMS}`);
  const rawRate = rejectionsRaw / counted, adjRate = rejectionsAdj / counted;
  // The raw (uncorrected) best-of-4-horizons p-value SHOULD run hot vs nominal 5% —
  // that's the multiple-testing effect the Bonferroni correction exists to fix, not
  // a bug. Measured directly (not asserted from theory): ~14% raw on this exact
  // 4-horizon default. The Bonferroni-adjusted rate is the one that must sit near
  // nominal — that's the actual calibration proof for the number the verdict uses.
  ok(rawRate > 0.08, `raw best-of-N p-value measurably exceeds nominal ${ALPHA * 100}% (confirms multiple-testing effect the correction targets)`, `rawRate=${rawRate}`);
  ok(adjRate <= 0.12, `Bonferroni-adjusted false-positive rate stays near nominal ${ALPHA * 100}% on pure random walk, not blown out like the dropped uncorrected attempt (got ${(adjRate * 100).toFixed(0)}% over ${counted} sims)`, `adjRate=${adjRate}`);
  const avgNullMean = nullMeans.reduce((a, b) => a + b, 0) / nullMeans.length;
  ok(Math.abs(avgNullMean) < 0.03, 'null distribution is centered near zero across sims (no systematic bias)', `avgNullMean=${avgNullMean.toFixed(4)}`);
}

console.log('\n── guards ──');
{
  const short = scoreVolPredictsForwardVol(Array.from({ length: 50 }, (_, i) => 100 + i * 0.1));
  ok(short.ok === false && /need/.test(short.error), 'too-short series → clean error, not a crash');
}

console.log(`\n${failed === 0 ? '✅' : '❌'} volReversionCore tests: ${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
