// Parity: the site's QLIKE per-line sigmas (js/ladderV2Qlike.js) against the research harness on the same inputs
// (js/ladderV2Qlike.fixture.json, scripts/ladder-qlike-per-line/build_params.py).   node js/ladderV2Qlike.test.mjs
import { readFileSync } from 'node:fs';
import { QPARAMS, qlikeSeries, qlikeDayLevels, qlikeText } from './ladderV2Qlike.js';
import { sigmaForSession } from './ladderV2Shadow.js';

const FX = JSON.parse(readFileSync(new URL('./ladderV2Qlike.fixture.json', import.meta.url), 'utf8'));
const TOL = 1e-3;
let bad = 0, n = 0;
const lv = {};
for (const [sym, f] of Object.entries(FX.instruments)) {
  const inp = { d1: f.d1.map(([key, open, high, low, close]) => ({ key, open, high, low, close })), m5: f.m5, m15: f.m15 };
  const ser = qlikeSeries(sym, inp);
  for (const [arm, py] of Object.entries(f.sigma)) {
    const got = sigmaForSession(ser[arm], f.session);
    const rel = got ? Math.abs(got.sigma / py - 1) : Infinity;
    n++; if (!(rel <= TOL)) bad++;
    console.log(`${rel <= TOL ? 'ok  ' : 'FAIL'} ${sym.padEnd(7)} ${arm.padEnd(13)} py ${py.toFixed(5)} js ${got ? got.sigma.toFixed(5) : 'null'} (rel ${rel.toExponential(1)})`);
  }
  lv[sym] = qlikeDayLevels(sym, ser, f.session);
  const okL = lv[sym] && ['hl', 'oc', 'oh', 'ol'].every(q => ['50', '75', '90'].every(t => lv[sym][`${q}_p${t}`] > 0));
  if (!okL) { bad++; console.log(`FAIL ${sym} levels`); }
}
const txt = qlikeText(lv, '2026-08-21');
for (const s of Object.keys(QPARAMS.instruments)) if (!txt.includes(`──── ${s} `)) { bad++; console.log(`FAIL text ${s}`); }
console.log(bad ? `${bad} FAILED` : `all ${n} QLIKE per-line sigmas match the Python within ${TOL}; levels + text complete`);
process.exit(bad ? 1 : 0);
