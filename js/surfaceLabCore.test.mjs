// Synthetic, no-network unit tests for the Surface Lab maths.
//   node js/surfaceLabCore.test.mjs
import { eigenSym, absorption, persistence, volTime, windowShare, curveRegime, rates, regimeOutcomes, TENORS } from './surfaceLabCore.js';

let failures = 0;
const ok = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());

console.log('eigen');
const E = eigenSym([[2, 1, 0], [1, 2, 0], [0, 0, 5]]);
ok('eigenvalues 5, 3, 1', [5, 3, 1].every((v, i) => Math.abs(E.values[i] - v) < 1e-9), JSON.stringify(E.values));
ok('top vector is the third axis', Math.abs(Math.abs(E.vectors[0][2]) - 1) < 1e-9);

console.log('absorption');
const pairs = ['EURUSD', 'GBPUSD', 'AUDUSD', 'USDJPY', 'USDCAD', 'EURGBP'];
const closes = Object.fromEntries(pairs.map(p => [p, new Map()]));
const px = Object.fromEntries(pairs.map(p => [p, 1]));
for (let t = 0; t < 200; t++) {
  const usd = gauss() * 0.006, d = `2026-${String(1 + Math.floor(t / 28)).padStart(2, '0')}-${String(1 + (t % 28)).padStart(2, '0')}`;
  for (const p of pairs) { const s = p === 'EURGBP' ? 0 : p.startsWith('USD') ? 1 : -1; px[p] *= Math.exp(s * usd + gauss() * 0.002); closes[p].set(d, px[p]); }
}
const A = absorption(closes, { window: 60, keep: 50 });
ok('50 days out', A.dates.length === 50);
ok('one-factor market → PC1 share high', A.share.at(-1)[0] > 0.6, String(A.share.at(-1)[0]));
ok('shares sum ≤ 1 and descend', A.share.at(-1).reduce((s, x) => s + x, 0) <= 1.0001 && A.share.at(-1)[0] >= A.share.at(-1)[1]);
ok('PC1 is the dollar (|corr| > 0.9) and signed with it', A.dollarCorr.at(-1) > 0.9);
ok('USDJPY loads positive, EURUSD negative', A.loadings.at(-1)[pairs.slice().sort().indexOf('USDJPY')] > 0 && A.loadings.at(-1)[pairs.slice().sort().indexOf('EURUSD')] < 0);

console.log('persistence and vol time');
const mk = step => { const b = []; let c = 1, t = Date.UTC(2026, 0, 5) / 1000; for (let i = 0; i < 96 * 70; i++) { t += 900; const dt = new Date(t * 1000).getUTCDay(); if (dt === 0 || dt === 6) continue; c *= Math.exp(step(i)); b.push({ t, close: c }); } return b; };
const rw = persistence(mk(() => gauss() * 0.001), { days: 20 });
ok('random walk VR ≈ 1 at 1h', Math.abs(rw.vr.at(-1)[1] - 1) < 0.2, String(rw.vr.at(-1)));
let last = 0; const mr = persistence(mk(() => { const x = gauss() * 0.001 - 0.6 * last; last = x; return x; }), { days: 20 });
ok('anti-persistent series VR < 0.7 at 4h', mr.vr.at(-1)[3] < 0.7, String(mr.vr.at(-1)));
const vt = volTime(mk(() => gauss() * 0.001));
ok('weekly profile has 96 slots summing to 1', vt.share.at(-1).length === 96 && Math.abs(vt.share.at(-1).reduce((s, x) => s + x, 0) - 1) < 0.01);
ok('00–10 window share ≈ 10/24 on flat vol', Math.abs(windowShare(vt.share.at(-1), 0, 40) - 10 / 24) < 0.06, String(windowShare(vt.share.at(-1), 0, 40)));

console.log('rates');
ok('both down, 2Y more → bull steepener', curveRegime(-0.3, -0.1) === 'bull steepener');
ok('both up, 10Y more → bear steepener', curveRegime(0.1, 0.3) === 'bear steepener');
ok('both up, 2Y more → bear flattener', curveRegime(0.3, 0.1) === 'bear flattener');
ok('both down, 10Y more → bull flattener', curveRegime(-0.1, -0.3) === 'bull flattener');
ok('opposite signs → twist', curveRegime(-0.2, 0.2) === 'steepening twist');
ok('same move → parallel', curveRegime(0.2, 0.22) === 'parallel up');
const series = Object.fromEntries(TENORS.map(([id, , y]) => [id, new Map()]));
for (let i = 0; i < 120; i++) { const d = new Date(Date.UTC(2025, 0, 6) + i * 7 * 864e5).toISOString().slice(0, 10);
  for (const [id, , y] of TENORS) series[id].set(d, 4 + (i < 60 ? 0.03 * i * (y < 3 ? 1 : 0.3) : 1.8 - 0.03 * (i - 60) * (y < 3 ? 1 : 0.3))); }
const R = rates(series);
ok('weekly curve has 11 tenors', R.curve.at(-1).length === 11 && R.weeks.length >= 119);
ok('front-led rise reads bear flattener', R.regime[30] === 'bear flattener', R.regime[30]);
ok('front-led fall reads bull steepener', R.regime[100] === 'bull steepener', R.regime[100]);
const asset = new Map(R.weeks.map((w, i) => [w, 100 + i]));
const O = regimeOutcomes(R, { X: asset });
ok('outcomes counted for a rising asset', O.byAsset.X['bull steepener']?.newer?.upRate === 1);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
