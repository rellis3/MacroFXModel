// Meta-labelling on the long history — layers 1-2 (forge/META_LABEL_LONG_PREREG.md). Close-only (FRED H.10).
// CUSUM events (threshold 1.0 x sigma known before the day), primary side at |z| >= 1.0, triple barrier on closes
// (+-2 sigma, 10 trading days, 0.02% cost), plus the close-based features. Six original pairs.
//   node scripts/ys_long/build_events.mjs   (after build.mjs has cached the FRED csvs)
import fs from 'fs';
import path from 'path';
import { buildRollingZSeries, _shiftDate } from '../../js/zscoreSpreadEngine.js';
import { directionFromZ, resolveInverted } from '../../js/yieldSpreadCore.js';
import { usdRole } from '../../js/macroDirectionCore.js';

const D = 'analysis/output/ys_long', FRED = path.join(D, 'fred');
const PAIRS = [['usdjpy', 'USDJPY', 'DEXJPUS', 'IRSTCI01JPM156N'], ['gbpusd', 'GBPUSD', 'DEXUSUK', 'IR3TIB01GBM156N'],
  ['audusd', 'AUDUSD', 'DEXUSAL', 'IR3TIB01AUM156N'], ['usdcad', 'USDCAD', 'DEXCAUS', 'IRSTCI01CAM156N'],
  ['usdchf', 'USDCHF', 'DEXSZUS', ['IRSTCI01CHM156N', 'IR3TIB01CHM156N', '1999-07-01']], ['eurusd', 'EURUSD', 'DEXUSEU', 'IRSTCI01DEM156N']];
const LAMBDA = 0.94, SEED_N = 20, H = 1.0, BAR = 2.0, HOR = 10, COST = 0.0002, Z_FIRE = 1.0;

const read = id => new Map(fs.readFileSync(path.join(FRED, `${id}.csv`), 'utf8').trim().split('\n').slice(1)
  .map(l => l.split(',')).filter(([, v]) => Number.isFinite(parseFloat(v))).map(([d, v]) => [d, parseFloat(v)]));
const shift = (m, k) => new Map([...m].map(([d, v]) => [_shiftDate(d, k), v]));
const us = shift(read('GS2'), 2);
const r6 = x => (x == null || !Number.isFinite(x)) ? '' : Math.round(x * 1e6) / 1e6;
const rows = ['pair,date,close,sigma,z,spread,dz5,since_cross,cusum_with,side,bar,exit,ret,regime,res5,today,dsig5'];
const closes = ['pair,date,close'];

for (const [key, label, fxId, rate] of PAIRS) {
  const fx = read(fxId);
  const foreign = shift(Array.isArray(rate)
    ? new Map([...[...read(rate[0])].filter(([d]) => d < rate[2]), ...[...read(rate[1])].filter(([d]) => d >= rate[2])]) : read(rate), 45);
  const daily = [...fx].map(([date, close]) => ({ date, close })).filter(d => d.close > 0).sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const d of daily) closes.push(`${label},${d.date},${d.close}`);
  const zBy = buildRollingZSeries(us, foreign, 126, daily[0].date, daily.at(-1).date);
  const inv = resolveInverted(usdRole(key), { autoOrient: true });
  const n = daily.length, r = new Array(n).fill(NaN), sig = new Array(n).fill(NaN);
  for (let i = 1; i < n; i++) r[i] = Math.log(daily[i].close / daily[i - 1].close);
  // EWMA daily sigma (fraction), sig[i] uses returns through i (point-in-time at the close of i)
  let v = null;
  for (let i = 1; i < n; i++) {
    if (i === SEED_N) { const w = r.slice(1, SEED_N + 1); const m = w.reduce((a, x) => a + x, 0) / w.length; v = w.reduce((a, x) => a + (x - m) ** 2, 0) / (w.length - 1); }
    else if (v != null) v = LAMBDA * v + (1 - LAMBDA) * r[i] ** 2;
    if (v != null) sig[i] = Math.sqrt(v);
  }
  let sP = 0, sN = 0, lastAbove = null, nEv = 0, nFire = 0;
  const zArr = daily.map(d => zBy.get(d.date)?.z ?? null);
  for (let i = 1; i < n - 1; i++) {
    const z = zArr[i];
    if (z == null || Math.abs(z) < Z_FIRE) lastAbove = null; else if (lastAbove == null) lastAbove = i;
    const h = H * sig[i - 1];
    if (!(h > 0)) continue;
    sP = Math.max(0, sP + r[i]); sN = Math.min(0, sN + r[i]);
    let ev = 0;
    if (sP > h) { ev = 1; sP = 0; } else if (sN < -h) { ev = -1; sN = 0; }
    if (!ev || z == null || Math.abs(z) < Z_FIRE || i < 260) continue;
    nEv++;
    const side = directionFromZ(z, inv) === 'LONG' ? 1 : -1;
    nFire++;
    // triple barrier on closes from i+1
    const e = daily[i].close, w = BAR * sig[i];
    let bar = 'vt', exitI = Math.min(i + HOR, n - 1), ret;
    for (let j = i + 1; j <= Math.min(i + HOR, n - 1); j++) {
      const m = side * Math.log(daily[j].close / e);
      if (m <= -w) { bar = 'sl'; exitI = j; break; }
      if (m >= w) { bar = 'pt'; exitI = j; break; }
    }
    ret = side * (daily[exitI].close - e) / e - COST;
    const prior = sig.slice(i - 250, i).filter(Number.isFinite).sort((a, b) => a - b);
    const med = prior[Math.floor(prior.length / 2)];
    let res = 0, k = 0;
    for (let j = i - 5; j < i; j++) if (sig[j - 1] > 0) { res += Math.abs(r[j]) / sig[j - 1]; k++; }
    const z5 = zArr[i - 5];
    rows.push([label, daily[i].date, r6(e), r6(sig[i]), r6(z), r6(zBy.get(daily[i].date).spread), z5 == null ? '' : r6(z - z5),
      lastAbove != null ? i - lastAbove : '', ev === side ? 1 : 0, side, bar, daily[exitI].date, r6(ret),
      r6(Math.log(sig[i - 1] / med)), r6(k ? res / k : NaN), r6(Math.abs(r[i]) / sig[i - 1]), r6(Math.log(sig[i] / sig[i - 5]))].join(','));
  }
  console.log(`${label}: ${nFire} primary bets from ${daily[260]?.date}`);
}
fs.writeFileSync(path.join(D, 'events.csv'), rows.join('\n') + '\n');
fs.writeFileSync(path.join(D, 'closes.csv'), closes.join('\n') + '\n');
console.log(`wrote ${rows.length - 1} primary bets`);
