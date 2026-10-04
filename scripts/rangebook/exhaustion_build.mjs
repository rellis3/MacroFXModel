// EXHAUSTION-SCHEDULE builder, stage 1 (forge/EXHAUSTION_SCHEDULE_PREREG.md, commit 150f69a4).
// For every instrument and London day on the page's own export calculation (v4Days): at the end of each London hour h,
// the running high's and low's distance from the open in sigma_used, and whether that running extreme is the day's
// final one. One row per day x side x hour. Day rows carry open / sigma for joins.
//   node scripts/rangebook/exhaustion_build.mjs [fileKey SYM ...]
import fs from 'fs';
import path from 'path';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { buildContext } from './common.mjs';
import { loadCalendarProxy } from '../v4/calendarProxy.mjs';
import { assetClassFor } from '../../js/forecastAnalyserStore.js';

const OUT = 'analysis/surfaces/exhaustion';
const CAL_END = '2026-07-02';
const FX = ['audcad', 'audchf', 'audjpy', 'audnzd', 'audusd', 'cadchf', 'cadjpy', 'chfjpy', 'euraud', 'eurcad', 'eurchf', 'eurgbp',
  'eurjpy', 'eurnzd', 'eurusd', 'gbpaud', 'gbpcad', 'gbpchf', 'gbpjpy', 'gbpnzd', 'gbpusd', 'nzdcad', 'nzdjpy', 'nzdusd', 'usdcad', 'usdchf', 'usdjpy'];
const DEFAULT = [...FX.map(k => [k, k.toUpperCase()]), ['gold', 'GOLD'], ['nq', 'NQ'], ['spx500', 'SPX500'], ['us30', 'DOW'],
  ['us2000', 'US2000'], ['de30', 'DE30'], ['uk100', 'UK100']];
const args = process.argv.slice(2);
const JOBS = args.length ? Array.from({ length: args.length / 2 }, (_, i) => [args[2 * i], args[2 * i + 1]]) : DEFAULT;
const r4 = x => Math.round(x * 1e4) / 1e4;
fs.mkdirSync(OUT, { recursive: true });
const calendar = loadCalendarProxy();

for (const [key, SYM] of JOBS) {
  const t0 = Date.now();
  let packed;
  try { packed = await loadM1ForPair(key); } catch (e) { console.log(`${SYM}: load failed ${e.message}`); continue; }
  if (!packed?.n) { console.log(`${SYM}: no M1`); continue; }
  const ctx = buildContext(packed, { sym: SYM, assetClass: assetClassFor(key), tagFor: calendar(SYM) });
  const hrs = ['inst,date,side,hour,D,final'], days = ['inst,date,open,sigUsed,sigDaily,event'];
  for (const d of ctx.days) {
    if (d.date > CAL_END) break;
    const bars = d.bars, unit = d.sigmaFrac * d.open;
    if (!(unit > 0) || bars.length < 60) continue;
    days.push([SYM, d.date, d.open, r4(d.sigmaFrac * 100), r4(d.ladder.sigma_daily_pct), d.eventTag ?? ''].join(','));
    let hi = d.open, lo = d.open, dayHi = -Infinity, dayLo = Infinity;
    for (const b of bars) { if (b.high > dayHi) dayHi = b.high; if (b.low < dayLo) dayLo = b.low; }
    const endHi = new Array(24).fill(null), endLo = new Array(24).fill(null);
    for (const b of bars) {
      const h = Math.min(23, Math.floor((b.time - d.openSec) / 3600));
      if (b.high > hi) hi = b.high; if (b.low < lo) lo = b.low;
      endHi[h] = hi; endLo[h] = lo;
    }
    for (let h = 0; h < 24; h++) {
      if (endHi[h] == null) continue;
      hrs.push([SYM, d.date, 'H', h, r4((endHi[h] - d.open) / unit), endHi[h] >= dayHi ? 1 : 0].join(','));
      hrs.push([SYM, d.date, 'L', h, r4((d.open - endLo[h]) / unit), endLo[h] <= dayLo ? 1 : 0].join(','));
    }
  }
  fs.writeFileSync(path.join(OUT, `${SYM}_hours.csv`), hrs.join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, `${SYM}_days.csv`), days.join('\n') + '\n');
  console.log(`${SYM}: ${days.length - 1} days, ${Math.round((Date.now() - t0) / 1000)} s`);
}
