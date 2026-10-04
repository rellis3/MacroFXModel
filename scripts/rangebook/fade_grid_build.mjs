// Fade stop/target grid at the export levels (diagnostic, NOT pre-registered — answers "is it just the SL/TP?").
// For every first touch of OH/OL p50 and p75 (the page's own daily levels via v4Days), simulate a FADE entered at the
// line with every stop x target combination below, resolved on M1 from the bar after the touch, exit at the London day
// end if neither is hit (same-bar stop+target = stop). Aggregates per instrument x half x line x cell.
//   node scripts/rangebook/fade_grid_build.mjs
import fs from 'fs';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { buildContext, targets } from './common.mjs';
import { firstTouches, LINE_SIDE } from '../../js/voteAtlasV4Lines.js';
import { loadCalendarProxy } from '../v4/calendarProxy.mjs';
import { assetClassFor } from '../../js/forecastAnalyserStore.js';
import { costForPair } from '../../js/perLineStrategy.js';

const JOBS = [['eurusd', 'EURUSD'], ['gbpusd', 'GBPUSD'], ['usdjpy', 'USDJPY'], ['audusd', 'AUDUSD'], ['usdcad', 'USDCAD'],
  ['usdchf', 'USDCHF'], ['nzdusd', 'NZDUSD'], ['gold', 'GOLD'], ['nq', 'NQ'], ['spx500', 'SPX500']];
const LINES = new Set(['OH_p50', 'OH_p75', 'OL_p50', 'OL_p75']);
// stops: sigma beyond the line, or 'next' = the next export line out; targets: sigma back toward the open,
// 'behind' = the export line behind, 'close' = no target (exit at day end)
const STOPS = [0.15, 0.3, 0.5, 'next'];
const TARGETS = [0.1, 0.2, 0.3, 0.5, 'behind', 'close'];
const CAL_END = '2026-07-02', calendar = loadCalendarProxy();
const agg = new Map();
const add = (k, gross, win, costR) => { const a = agg.get(k) ?? { n: 0, sum: 0, sumNet: 0, wins: 0 }; a.n++; a.sum += gross; a.sumNet += gross - costR; a.wins += win; agg.set(k, a); };

for (const [key, SYM] of JOBS) {
  const t0 = Date.now(), packed = await loadM1ForPair(key);
  if (!packed?.n) continue;
  const asset = assetClassFor(key), costPct = costForPair(key === 'spx500' ? 'spx500' : key, asset) / 100;
  const ctx = buildContext(packed, { sym: SYM, assetClass: asset, tagFor: calendar(SYM) });
  for (const d of ctx.days) {
    if (d.date > CAL_END) break;
    const half = d.date < '2023-01-01' ? 'A' : 'B', bars = d.bars, unit = d.sigmaFrac * d.open;
    if (!(unit > 0)) continue;
    for (const t of firstTouches(d)) {
      if (!LINES.has(t.line)) continue;
      const up = LINE_SIDE[t.line] === 'up', sg = up ? 1 : -1, k = t.k, L = t.level;
      const tg = targets(d, t.line, L, null, null); if (!tg) continue;
      const nextOut = Math.abs(tg.cont - L) / unit, behind = Math.abs(L - tg.fade) / unit;
      // excursions from the line, in sigma, bar by bar after the touch: adverse = further in the touch direction
      const adv = [], fav = []; for (let j = k + 1; j < bars.length; j++) { adv.push(sg * ((up ? bars[j].high : bars[j].low) - L) / unit); fav.push(sg * (L - (up ? bars[j].low : bars[j].high)) / unit); }
      const last = sg * (L - bars.at(-1).close) / unit;          // + = in the fade's favour
      for (const S of STOPS) {
        const s = S === 'next' ? nextOut : S;
        for (const T of TARGETS) {
          const tgt = T === 'behind' ? behind : T === 'close' ? Infinity : T;
          let r = null;
          for (let j = 0; j < adv.length; j++) {
            if (adv[j] >= s) { r = -1; break; }                   // stop first (same bar counts as stop)
            if (fav[j] >= tgt) { r = tgt / s; break; }
          }
          if (r === null) r = Math.max(-1, Math.min(last, tgt) / s);
          add(`${SYM}|${half}|${t.line.split('_')[1]}|${S}|${T}`, r, r > 0 ? 1 : 0, costPct * L / (s * unit));
        }
      }
    }
  }
  console.log(`${SYM} done ${Math.round((Date.now() - t0) / 1000)} s`);
}
const rows = ['inst,half,rung,stop,target,n,grossR,netR,winRate'];
for (const [k, a] of agg) rows.push([...k.split('|'), a.n, (a.sum / a.n).toFixed(4), (a.sumNet / a.n).toFixed(4), (a.wins / a.n).toFixed(4)].join(','));
fs.writeFileSync('analysis/surfaces/FADE_GRID.csv', rows.join('\n') + '\n');
console.log('wrote analysis/surfaces/FADE_GRID.csv');
