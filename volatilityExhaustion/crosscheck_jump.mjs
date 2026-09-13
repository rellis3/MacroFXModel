/**
 * crosscheck_jump.mjs — proves js/jumpDiffusionCore.js reproduces the Python study maths.
 *
 * Same contract as crosscheck_sigma.mjs: Python writes the inputs, this reads them, runs
 * the REAL live-side module, and prints results as JSON. crosscheck_jump.py asserts the
 * two agree. Byte-identical inputs on both sides, so nothing rides on RNG parity.
 *
 * The live endpoint and the offline study run the same estimator on the same instrument
 * minutes apart; if they ever disagree the page is describing a different market than the
 * research did. This test is the thing that stops that happening silently.
 *
 * Run:  node volatilityExhaustion/crosscheck_jump.mjs
 */
import { readFileSync } from 'node:fs';
import { bipower, jumpFraction, localSigma, lmThreshold, deseasonalise, detectJumps }
  from '../js/jumpDiffusionCore.js';

const inp = JSON.parse(readFileSync(new URL('./_xcheck_jump.json', import.meta.url)));
const { returns, tod, factors, k, alpha, n } = inp;

const bp = bipower(returns);
const des = deseasonalise(returns, tod, factors);
// local sigma is compared on the DESEASONALISED series, because that is the series the
// detector actually scales by — comparing it on raw returns would be comparing two
// different quantities and would not test the path that runs live.
const sig = localSigma(des.adjusted, k);
const det = detectJumps(returns, tod, factors, { k, alpha, n });

process.stdout.write(JSON.stringify({
  rv: bp.rv,
  bv: bp.bv,
  jump_fraction: jumpFraction(returns),
  threshold: lmThreshold(n, alpha),
  // NaN is not representable in JSON — send null and let Python compare against nan
  local_sigma: Array.from(sig, v => (Number.isFinite(v) ? v : null)),
  adjusted: Array.from(des.adjusted),
  jump_idx: det.flags.map((f, i) => (f ? i : -1)).filter(i => i >= 0),
}));
