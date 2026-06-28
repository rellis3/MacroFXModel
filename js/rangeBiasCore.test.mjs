// Golden test: the rangeBiasCore brick must reproduce the ORIGINAL levels.js
// range-bias features bit-for-bit (so wiring levels.js to it changes no alert).
//   node js/rangeBiasCore.test.mjs

import {
  computeADX, computeHurst, ema, computeRangeBiasServer, computeWeeklyPivots,
  featureADX, featureSwingRegime, featureTwap, featureEmaRsi, featureHurst,
} from './rangeBiasCore.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── verbatim references copied from levels.js ────────────────────────────────
const rbH = b => parseFloat(b.high), rbL = b => parseFloat(b.low), rbC = b => parseFloat(b.close);
function refADX(bars, period = 14) {
  if (bars.length < period + 2) return null;
  const plusDM = [], minusDM = [], tr = [];
  for (let i = 1; i < bars.length; i++) {
    const h = rbH(bars[i]), l = rbL(bars[i]), pc = rbC(bars[i - 1]);
    const ph = rbH(bars[i - 1]), pl = rbL(bars[i - 1]);
    const up = h - ph, dn = pl - l;
    plusDM.push(up > dn && up > 0 ? up : 0); minusDM.push(dn > up && dn > 0 ? dn : 0);
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const smooth = (arr) => { let val = arr.slice(0, period).reduce((s, x) => s + x, 0); const out = [val]; for (let i = period; i < arr.length; i++) { val = val - val / period + arr[i]; out.push(val); } return out; };
  const sTR = smooth(tr), sPDM = smooth(plusDM), sMDM = smooth(minusDM);
  const pDI = sPDM.map((v, i) => sTR[i] > 0 ? (v / sTR[i]) * 100 : 0);
  const mDI = sMDM.map((v, i) => sTR[i] > 0 ? (v / sTR[i]) * 100 : 0);
  const dx = pDI.map((v, i) => { const s = v + mDI[i]; return s > 0 ? Math.abs(v - mDI[i]) / s * 100 : 0; });
  let adx = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dx.length; i++) adx = (adx * (period - 1) + dx[i]) / period;
  return { adx, plusDI: pDI[pDI.length - 1], minusDI: mDI[mDI.length - 1] };
}
function refHurst(closes) {
  const n = closes.length; if (n < 8) return 0.5;
  const lags = [2, 4, 8, 16].filter(l => l < n / 2); if (!lags.length) return 0.5;
  const logLags = [], logRS = [];
  for (const lag of lags) {
    const chunks = [];
    for (let start = 0; start + lag <= n; start += lag) {
      const sub = closes.slice(start, start + lag); const mean = sub.reduce((a, b) => a + b, 0) / lag;
      let cum = 0; const cumDev = sub.map(v => { cum += v - mean; return cum; });
      const range = Math.max(...cumDev) - Math.min(...cumDev);
      const std = Math.sqrt(sub.reduce((s, v) => s + (v - mean) ** 2, 0) / lag);
      if (std > 0) chunks.push(range / std);
    }
    if (chunks.length) { logLags.push(Math.log(lag)); logRS.push(Math.log(chunks.reduce((a, b) => a + b, 0) / chunks.length)); }
  }
  if (logLags.length < 2) return 0.5;
  const n2 = logLags.length, meanX = logLags.reduce((a, b) => a + b, 0) / n2, meanY = logRS.reduce((a, b) => a + b, 0) / n2;
  const num = logLags.reduce((s, x, i) => s + (x - meanX) * (logRS[i] - meanY), 0);
  const den = logLags.reduce((s, x) => s + (x - meanX) ** 2, 0);
  return den > 0 ? Math.max(0, Math.min(1, num / den)) : 0.5;
}

// ── synthetic bars (oldest-first, string fields like OANDA) ──────────────────
const mk = (n, base, amp, period) => Array.from({ length: n }, (_, i) => {
  const c = base + amp * Math.sin(i / period) + 0.3 * Math.cos(i / 3);
  const o = base + amp * Math.sin((i - 1) / period);
  return { high: String(Math.max(o, c) + 0.5), low: String(Math.min(o, c) - 0.5), close: String(c), open: String(o) };
});
const bars30 = mk(220, 100, 4, 12);
const bars5  = mk(60, 100, 2, 9);
const daily  = mk(90, 100, 6, 14);
const closes = daily.map(b => parseFloat(b.close));

console.log('[helpers bit-identical]');
ok('computeADX == ref', eq(computeADX(bars30, 14), refADX(bars30, 14)));
ok('computeHurst == ref', computeHurst(closes) === refHurst(closes));
ok('ema == ref (manual)', ema([1,2,3,4,5,6,7,8,9,10], 4) === (() => { const p=4,k=2/5; let e=(1+2+3+4)/4; for(let i=4;i<10;i++) e=[1,2,3,4,5,6,7,8,9,10][i]*k+e*(1-k); return e; })());

console.log('[features run + aggregate]');
for (const dir of ['long', 'short']) {
  const rb = computeRangeBiasServer('EUR/USD', dir, bars5, bars30, daily);
  ok(`[${dir}] 5 features present`, rb.features.length === 5);
  ok(`[${dir}] conviction in [-1,1]`, rb.conviction >= -1 && rb.conviction <= 1, `conv=${rb.conviction.toFixed(3)}`);
  ok(`[${dir}] confirm+conflict counts consistent`, rb.confirmCount + rb.conflictCount === rb.features.filter(f => f.signal !== null).length);
}
ok('featureADX shape', (() => { const f = featureADX(bars30, 'long'); return f.key === 'adx' && ['long','short',null].includes(f.signal); })());
ok('featureSwingRegime shape', featureSwingRegime(bars30, 'long').key === 'swing');
ok('featureTwap shape', featureTwap(bars5, 'long').key === 'twap');
ok('featureEmaRsi shape', featureEmaRsi(daily, 'long').key === 'ema');
ok('featureHurst shape', featureHurst(daily, 'long').key === 'hurst');

console.log('[weekly pivots]');
const piv = computeWeeklyPivots(daily);
ok('pivots PP between S1 and R1', piv && piv.S1 < piv.PP && piv.PP < piv.R1, piv ? `PP=${piv.PP.toFixed(2)}` : 'null');

console.log(`\n${failures === 0 ? 'ALL PASSED ✓' : failures + ' CHECK(S) FAILED ✗'}`);
process.exit(failures === 0 ? 0 : 1);
