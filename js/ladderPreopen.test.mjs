// Parity: the site's pre-open sigma (js/ladderPreopen.js) against the research code on the same 5-minute bars and IV
// closes (js/ladderPreopen.fixture.json, scripts/calc-upgrades-wide/build_params.py).   node js/ladderPreopen.test.mjs
import { readFileSync, existsSync } from 'node:fs';
import { preopenParams, preopenSigma, preopenDayLevels, preopenText, preopenInstruments } from './ladderPreopen.js';

const TOL = 1e-3;
const u = new URL('./ladderPreopen.fixture.json', import.meta.url);
if (!existsSync(u)) { console.log('FAIL missing fixture'); process.exit(1); }
const FX = JSON.parse(readFileSync(u, 'utf8'));
let bad = 0, n = 0;
for (const track of ['fut', 'cfd']) {
  const lv = {};
  for (const [sym, f] of Object.entries(FX[track] ?? {})) {
    const P = preopenParams(sym, track);
    const v = preopenSigma(P, f.m5, f.iv, f.session);
    const rel = v ? Math.abs(v.sigma / f.sigma - 1) : Infinity;
    n++; if (!(rel <= TOL)) bad++;
    console.log(`${rel <= TOL ? 'ok  ' : 'FAIL'} ${track} ${sym.padEnd(9)} ${P.arm.padEnd(9)} asof py ${f.asof} js ${v?.asof ?? '-'}  py ${f.sigma.toFixed(5)} js ${v ? v.sigma.toFixed(5) : 'null'} (rel ${rel.toExponential(1)})`);
    lv[sym] = preopenDayLevels(sym, track, v);
    const okL = lv[sym] && ['hl', 'oc', 'oh', 'ol', 'cup', 'cdn'].every(q => ['50', '75', '90'].every(t => lv[sym][`${q}_p${t}`] > 0));
    if (!okL) { bad++; console.log(`FAIL ${track} ${sym} levels`); }
    // before London midnight there are no pre-open bars yet: the sigma must refuse, not fall back silently
    const early = preopenSigma(P, f.m5.filter(b => b[0] < Date.parse(f.session + 'T00:00:00Z') / 1000 - 6 * 3600), f.iv, f.session);
    if (early) { bad++; console.log(`FAIL ${track} ${sym}: built without pre-open bars`); }
  }
  const names = preopenInstruments(track);
  const txt = preopenText(lv, names, '2026-08-21', track);
  for (const s of Object.keys(FX[track] ?? {})) if (!txt.includes(`──── ${s} `)) { bad++; console.log(`FAIL ${track} text ${s}`); }
}
console.log(bad ? `${bad} FAILED` : `all ${n} pre-open sigmas match the Python within ${TOL}; levels + text complete`);
process.exit(bad ? 1 : 0);
