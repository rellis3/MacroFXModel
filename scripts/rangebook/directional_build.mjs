// DIRECTIONAL-RESCORE builder (forge/DIRECTIONAL_RESCORE_PREREG.md, commit 3c5d132a).
// Every first touch of the static export lines on the page's own daily calculation (v4Days via common.mjs), with the
// race outcome, signed returns at 15/60/240 min, and the export's drift d — all from data before the touch / the day.
//   node scripts/rangebook/directional_build.mjs [fileKey SYM ...]
import fs from 'fs';
import path from 'path';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { buildContext, targets } from './common.mjs';
import { firstTouches, LINE_SIDE } from '../../js/voteAtlasV4Lines.js';
import { loadCalendarProxy } from '../v4/calendarProxy.mjs';
import { assetClassFor } from '../../js/forecastAnalyserStore.js';

const OUT = 'analysis/surfaces/directional';
const CAL_END = '2026-07-02';
const LINES = new Set(['OH_p50', 'OH_p75', 'OH_p90', 'OL_p50', 'OL_p75', 'OL_p90', 'CloseUp_p50', 'CloseUp_p75', 'CloseDn_p50', 'CloseDn_p75']);
// [file key, the instrument name the export uses] — SPX is built as the page builds it ('SPX500', class-default params).
const DEFAULT = [['eurusd', 'EURUSD'], ['gbpusd', 'GBPUSD'], ['usdjpy', 'USDJPY'], ['audusd', 'AUDUSD'], ['usdcad', 'USDCAD'],
  ['usdchf', 'USDCHF'], ['nzdusd', 'NZDUSD'], ['gold', 'GOLD'], ['nq', 'NQ'], ['spx500', 'SPX500']];
const args = process.argv.slice(2);
const JOBS = args.length ? Array.from({ length: args.length / 2 }, (_, i) => [args[2 * i], args[2 * i + 1]]) : DEFAULT;
const r5 = x => (x == null || !Number.isFinite(x)) ? '' : Math.round(x * 1e5) / 1e5;
fs.mkdirSync(OUT, { recursive: true });
const calendar = loadCalendarProxy();

for (const [key, SYM] of JOBS) {
  const t0 = Date.now();
  const packed = await loadM1ForPair(key);
  if (!packed?.n) { console.log(`${SYM}: no M1`); continue; }
  const asset = assetClassFor(key);
  const ctx = buildContext(packed, { sym: SYM, assetClass: asset, tagFor: calendar(SYM) });
  const rows = ['inst,date,line,up,minute,level,unit,dc,df,outcome,lastMove,r15,r60,r240,drift,sigDaily,sigUsed,event'];
  let nyj = 0;
  for (const d of ctx.days) {
    if (d.date > CAL_END) break;
    // export drift: mean of the last 14 NY-close log returns / the day's forecast sigma (both before the open)
    while (nyj < ctx.ny.length && ctx.ny[nyj].endSec <= d.openSec) nyj++;
    const cl = ctx.ny.slice(Math.max(0, nyj - 15), nyj).map(b => b.close);
    const sig = d.ladder.sigma_daily_pct / 100;
    let drift = null;
    if (cl.length === 15 && sig > 0) { let mu = 0; for (let i = 1; i < 15; i++) mu += Math.log(cl[i] / cl[i - 1]); drift = Math.max(-2, Math.min(2, mu / 14 / sig)); }
    const bars = d.bars, unit = d.sigmaFrac * d.open;
    if (!(unit > 0)) continue;
    for (const t of firstTouches(d)) {
      if (!LINES.has(t.line)) continue;
      const up = LINE_SIDE[t.line] === 'up', sg = up ? 1 : -1, k = t.k;
      const tg = targets(d, t.line, t.level, null, null); if (!tg) continue;
      const dc = Math.abs(tg.cont - t.level) / unit, df = Math.abs(t.level - tg.fade) / unit;
      if (!(dc > 0 && df > 0)) continue;
      // same-bar: continue target on the touch bar is only reachable after crossing the line -> continue;
      // a fade-target hit on the touch bar has unknown order -> excluded (prereg)
      const b0 = bars[k], cH = up ? b0.high >= tg.cont : b0.low <= tg.cont, fH = up ? b0.low <= tg.fade : b0.high >= tg.fade;
      let outcome = 'open';
      if (fH) outcome = 'excl';
      else if (cH) outcome = 'cont';
      else {
        for (let j = k + 1; j < bars.length; j++) {
          const b = bars[j], c = up ? b.high >= tg.cont : b.low <= tg.cont, f = up ? b.low <= tg.fade : b.high >= tg.fade;
          if (c || f) { outcome = c && f ? 'both' : c ? 'cont' : 'fade'; break; }
        }
      }
      const lastMove = sg * (bars.at(-1).close - t.level) / unit;
      const at = mins => { const tt = b0.time + mins * 60; for (let j = k; j < bars.length; j++) if (bars[j].time >= tt) return sg * (bars[j].close - t.level) / unit; return lastMove; };
      rows.push([SYM, d.date, t.line, up ? 1 : 0, Math.round((b0.time - d.openSec) / 60), r5(t.level), r5(unit), r5(dc), r5(df), outcome,
        r5(lastMove), r5(at(15)), r5(at(60)), r5(at(240)), r5(drift), r5(sig * 100), r5(d.sigmaFrac * 100), d.eventTag ?? ''].join(','));
    }
  }
  fs.writeFileSync(path.join(OUT, `${SYM}.csv`), rows.join('\n') + '\n');
  console.log(`${SYM}: ${ctx.days.length} days, ${rows.length - 1} touches, ${Math.round((Date.now() - t0) / 1000)} s`);
}
