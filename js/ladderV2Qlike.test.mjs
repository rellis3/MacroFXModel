// Parity: the site's QLIKE per-line sigmas (js/ladderV2Qlike.js) against the research harness on the same inputs, for
// both tracks: futures (js/ladderV2Qlike.fixture.json, scripts/ladder-qlike-per-line/build_params.py) and CFD
// (js/ladderV2QlikeCfd.fixture.json, scripts/ladder-qlike-per-line-cfd/build_params.py).   node js/ladderV2Qlike.test.mjs
import { readFileSync, existsSync } from 'node:fs';
import { qlikeInstruments, qlikeSeries, qlikeDayLevels, qlikeText } from './ladderV2Qlike.js';
import { sigmaForSession } from './ladderV2Shadow.js';

const TOL = 1e-3;
let bad = 0, n = 0;
for (const [track, file] of [['fut', './ladderV2Qlike.fixture.json'], ['cfd', './ladderV2QlikeCfd.fixture.json']]) {
  const u = new URL(file, import.meta.url);
  if (!existsSync(u)) { if (track === 'fut') { bad++; console.log('FAIL missing futures fixture'); } continue; }
  const FX = JSON.parse(readFileSync(u, 'utf8'));
  const lv = {};
  for (const [sym, f] of Object.entries(FX.instruments)) {
    const inp = { d1: f.d1.map(([key, open, high, low, close]) => ({ key, open, high, low, close })), m5: f.m5, m15: f.m15 };
    const ser = qlikeSeries(sym, inp, track);
    for (const [arm, py] of Object.entries(f.sigma)) {
      const got = sigmaForSession(ser[arm], f.session);
      const rel = got ? Math.abs(got.sigma / py - 1) : Infinity;
      n++; if (!(rel <= TOL)) bad++;
      if (!(rel <= TOL) || track === 'fut') console.log(`${rel <= TOL ? 'ok  ' : 'FAIL'} ${track} ${sym.padEnd(9)} ${arm.padEnd(13)} py ${py.toFixed(5)} js ${got ? got.sigma.toFixed(5) : 'null'} (rel ${rel.toExponential(1)})`);
    }
    lv[sym] = qlikeDayLevels(sym, ser, f.session, track);
    const okL = lv[sym] && ['hl', 'oc', 'oh', 'ol', 'cup', 'cdn'].every(q => ['50', '75', '90'].every(t => lv[sym][`${q}_p${t}`] > 0));
    if (!okL) { bad++; console.log(`FAIL ${track} ${sym} levels`); }
  }
  const txt = qlikeText(lv, '2026-08-21', track);
  for (const s of qlikeInstruments(track)) if (!txt.includes(`──── ${s} `)) { bad++; console.log(`FAIL ${track} text ${s}`); }
  if (track === 'cfd' && !txt.includes('CFD (OANDA) charts')) { bad++; console.log('FAIL cfd header'); }
  console.log(`${track}: ${Object.keys(FX.instruments).length} instruments checked`);
}
console.log(bad ? `${bad} FAILED` : `all ${n} QLIKE per-line sigmas match the Python within ${TOL}; levels + text complete`);
process.exit(bad ? 1 : 0);
