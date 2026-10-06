// Layer 5 — REMAINING TRAVEL builder (forge/REMAINING_TRAVEL_PREREG.md). Read-only research on the OANDA M1 cache.
// Per instrument-session, at London checkpoints 01:00, 03:00 … 21:00: price, running high/low, realised variance so
// far, and the travel still to come (all in σ·open units, σ = the session's HAR-800 daily σ, as layer 3).
// Also writes the intraday variance profile (Σ r²/σ² by London minute) from TRAIN sessions only, for R1/R2.
//   node scripts/pathmap/remaining_travel_build.mjs [fileKey:SYM ...]
import fs from 'fs';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { bucketM1IntoSessions } from '../../js/forecastAnalyser.js';
import { londonMidnightSec } from '../../js/volBacktestEngine.js';

const OUT = 'analysis/output/remaining_travel', SIG = 'analysis/output/ladder_candidates/d1', SPLIT = '2025-09-05';
const FX = ['audcad', 'audchf', 'audjpy', 'audnzd', 'audusd', 'cadchf', 'cadjpy', 'chfjpy', 'euraud', 'eurcad', 'eurchf', 'eurgbp',
  'eurjpy', 'eurnzd', 'eurusd', 'gbpaud', 'gbpcad', 'gbpchf', 'gbpjpy', 'gbpnzd', 'gbpusd', 'nzdcad', 'nzdjpy', 'nzdusd', 'usdcad', 'usdchf', 'usdjpy'];
const DEFAULT = [...FX.map(k => `${k}:${k.toUpperCase()}`), 'gold:GOLD', 'nq:NQ', 'spx500:SPX500', 'us30:US30', 'us2000:US2000', 'de30:DE30', 'uk100:UK100'];
const JOBS = (process.argv.length > 2 ? process.argv.slice(2) : DEFAULT).map(a => a.split(':'));
const MAJORS = new Set(['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY']);
const INDICES = new Set(['NQ', 'SPX500', 'US30', 'US2000', 'DE30', 'UK100']);
const CHECK = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21];
const r4 = x => Math.round(x * 1e4) / 1e4;
fs.mkdirSync(OUT, { recursive: true });

for (const [key, SYM] of JOBS) {
  const t0 = Date.now();
  const har = fs.readFileSync(`${SIG}/${SYM}_har800.csv`, 'utf8').trim().split('\n').slice(1).map(l => l.split(',')).map(([d, s]) => [d, +s]).filter(([, s]) => s > 0);
  const packed = await loadM1ForPair(key);
  const sessions = bucketM1IntoSessions(packed, 'Europe/London');
  const cls = INDICES.has(SYM) ? 'index' : SYM === 'GOLD' ? 'gold' : MAJORS.has(SYM) ? 'major' : 'cross';
  const prof = new Float64Array(1500), profN = new Float64Array(1500);
  const out = ['inst,cls,date,h,sig,sigRel,pos,used,rv,up,down,nhi,nlo,hiPos,loPos'];
  let j = 0; const hist = [];
  for (const date of [...sessions.keys()].sort()) {
    const dow = new Date(date + 'T12:00:00Z').getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const bars = sessions.get(date);
    if (!bars || bars.length < 600) continue;
    while (j < har.length && har[j][0] < date) { hist.push(har[j][1]); j++; }
    if (!hist.length) continue;
    const sigAnn = hist[hist.length - 1], sd = sigAnn / Math.sqrt(252) / 100;      // daily σ as a fraction
    const prior = hist.slice(-251, -1);
    let sigRel = '';
    if (prior.length >= 120) { const s = [...prior].sort((x, y) => x - y); sigRel = r4(sigAnn / s[s.length >> 1]); }
    const mid = londonMidnightSec(new Date(`${date}T00:30:00Z`));
    const o = bars[0].open, unit = sd * o, n = bars.length;
    // suffix max/min for "after t"
    const sufHi = new Float64Array(n + 1).fill(-Infinity), sufLo = new Float64Array(n + 1).fill(Infinity);
    for (let x = n - 1; x >= 0; x--) { sufHi[x] = Math.max(sufHi[x + 1], bars[x].high); sufLo[x] = Math.min(sufLo[x + 1], bars[x].low); }
    let hi = -Infinity, lo = Infinity, rv = 0, prev = o, ci = 0;
    const train = date < SPLIT;
    for (let x = 0; x < n; x++) {
      const b = bars[x], m = Math.floor((b.time - mid) / 60);
      const r = Math.log(b.close / prev); prev = b.close;
      if (train && m >= 0 && m < 1500) { prof[m] += (r * r) / (sd * sd); profN[m]++; }
      // emit every checkpoint whose minute is reached before this bar
      while (ci < CHECK.length && m >= CHECK[ci] * 60) {
        if (x > 0 && Number.isFinite(hi)) {
          const P = bars[x - 1].close;
          out.push([SYM, cls, date, CHECK[ci], r4(sigAnn / Math.sqrt(252)), sigRel, r4((P - o) / unit), r4((hi - lo) / unit), r4(rv / (sd * sd)),
            r4(Math.max(0, sufHi[x] - P) / unit), r4(Math.max(0, P - sufLo[x]) / unit),
            r4(Math.max(0, sufHi[x] - hi) / unit), r4(Math.max(0, lo - sufLo[x]) / unit), r4((hi - o) / unit), r4((lo - o) / unit)].join(','));
        }
        ci++;
      }
      if (b.high > hi) hi = b.high; if (b.low < lo) lo = b.low;
      rv += r * r;
    }
  }
  fs.writeFileSync(`${OUT}/${SYM}.csv`, out.join('\n') + '\n');
  const pr = ['minute,sum,n']; for (let m = 0; m < 1500; m++) if (profN[m]) pr.push(`${m},${prof[m]},${profN[m]}`);
  fs.writeFileSync(`${OUT}/${SYM}_profile.csv`, pr.join('\n') + '\n');
  console.log(`${SYM}: ${out.length - 1} checkpoints, ${Math.round((Date.now() - t0) / 1000)} s`);
}
