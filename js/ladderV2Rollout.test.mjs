// Parity: the site's rollout sigma (js/ladderV2Shadow.js rolloutSigmaSeries) against the research harness's sigma on
// the same inputs (js/ladderV2Rollout.fixture.json, written by scripts/ladder-v2/build_params_rollout.py).
//   node js/ladderV2Rollout.test.mjs
import { readFileSync } from 'node:fs';
import { PARAMS, rolloutSigmaSeries, sigmaForSession, ladderFor, buildText } from './ladderV2Shadow.js';

const FX = JSON.parse(readFileSync(new URL('./ladderV2Rollout.fixture.json', import.meta.url), 'utf8'));
const TOL = 1e-3;          // relative
let bad = 0, n = 0;
for (const [sym, f] of Object.entries(FX.instruments)) {
  const inp = { d1: f.d1.map(([key, open, high, low, close]) => ({ key, open, high, low, close })), m5: f.m5, m15: f.m15 };
  const got = sigmaForSession(rolloutSigmaSeries(sym, inp), f.session);
  const rel = got ? Math.abs(got.sigma / f.sigma - 1) : Infinity;
  n++;
  const ok = rel <= TOL;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${sym.padEnd(9)} ${PARAMS.instruments[sym].arm.padEnd(13)} py ${f.sigma.toFixed(5)} js ${got ? got.sigma.toFixed(5) : 'null'} (rel ${rel.toExponential(1)})`);
}
// every rollout instrument with a track has widths for all 12 rungs, and the export text names it
for (const track of ['cfd', 'fut']) {
  const sig = Object.fromEntries(Object.keys(PARAMS.instruments).map(s => [s, { sigma: 0.8, asof: 'x' }]));
  const txt = buildText('forecast', track, sig, '2026-11-23');
  for (const [s, P] of Object.entries(PARAMS.instruments)) {
    if (!P[track]) continue;
    const L = ladderFor(s, track, 0.8);
    const okW = Object.values(L).every(r => Object.values(r).every(v => Number.isFinite(v) && v > 0));
    const okT = txt.includes(`──── ${s} `);
    if (!okW || !okT) { bad++; console.log(`FAIL ${s} ${track}: widths ${okW} text ${okT}`); }
  }
}
console.log(bad ? `${bad} FAILED of ${n} sigma checks + text` : `all ${n} rollout sigmas match the Python within ${TOL}; texts complete`);
process.exit(bad ? 1 : 0);
