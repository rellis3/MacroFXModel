// Vote Atlas's EXACT trade setup, unconditioned (no vote), three ways:
//   v1        Vote Atlas's own lines + walk (js/levelAtlasEngine.js atlasWalk, the
//             honest post-34d3438 engine), priced by its own priceBarrierTrade.
//   v4exact   v4 lines (export-faithful) with atlasWalk's rung geometry, re-arm
//             rule and outcome race copied exactly — race starts ON the touch bar.
//   v4strict  same, but the race starts on the bar AFTER the touch (the touch
//             bar's own intrabar order is unknowable).
// Fade: target = inner rung, stop = outer rung; follow mirrored. p50/p75 only
// (p90 has no outer rung). Unresolved -> marked to the session's last close.
// Writes analysis/output/v4_stage0/<pair>-vageom.json (gitignored).
//   node scripts/v4/va_geometry.mjs eurusd
import fs from 'fs';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { atlasWalk } from '../../js/levelAtlasEngine.js';
import { priceBarrierTrade } from '../../js/levelAtlasVoteReview.js';
import { v4Days } from '../../js/voteAtlasV4Lines.js';
import { costForPair } from '../../js/perLineStrategy.js';
import { assetClassFor } from '../../js/forecastAnalyserStore.js';
import { loadCalendarProxy } from './calendarProxy.mjs';

const pair = process.argv[2];
const sym = pair.toUpperCase(), assetClass = assetClassFor(pair), cost = costForPair(pair, assetClass);
const REARM = 0.3;

let packed = await loadM1ForPair(pair);
const cut = packed.times[packed.n - 1] - Math.round(365.25 * 10) * 86400;
let ci = 0; while (ci < packed.n && packed.times[ci] < cut) ci++;
const sl = k => Array.from(packed[k].slice(ci));
packed = { n: packed.n - ci, times: sl('times'), opens: sl('opens'), highs: sl('highs'), lows: sl('lows'), closes: sl('closes'), volumes: sl('volumes') };

const rows = [];   // { v, date, rung, side, fadePct, stopPct, targetPct, onTouchBar }

// ── v1: Vote Atlas's own walk + pricing ──────────────────────────────────────
{
  const { touches } = atlasWalk(packed, { instrument: sym, assetClass, rearmFracs: [REARM], pendingRearmFrac: REARM });
  for (const t of touches) {
    if (t.rearmFrac !== REARM || t.rung === 'p90') continue;
    const f = priceBarrierTrade(t, 'fade', 0);
    if (!f) continue;
    rows.push({ v: 'v1', date: t.date, rung: t.rung, side: t.side,
      fadePct: f.pnlPct, stopPct: f.stopPips * t.pip / t.open * 100, targetPct: f.targetPips * t.pip / t.open * 100,
      onTouchBar: t.resolveTime != null && t.resolveTime === t.time });
  }
}

// ── v4: export-faithful lines, atlasWalk's geometry copied exactly ──────────
const days = v4Days(packed, { instrument: sym, assetClass, eventTagFor: loadCalendarProxy()(sym) });
for (const strict of [false, true]) {
  const v = strict ? 'v4strict' : 'v4exact';
  for (const d of days) {
    const { bars, open, ladder } = d;
    for (const side of ['up', 'down']) {
      const isUp = side === 'up', q = isUp ? ladder.oh : ladder.ol;
      if (!(q?.p50 && q?.p75 && q?.p90)) continue;
      const sg = isUp ? 1 : -1;
      const lv = [open, ...['p50', 'p75', 'p90'].map(r => open * (1 + sg * q[r] / 100))];
      const reach = (px, target) => (isUp ? px >= target : px <= target);
      for (let ri = 0; ri < 2; ri++) {                 // p50, p75 (p90 has no outer)
        const here = lv[ri + 1], inner = lv[ri], outer = lv[ri + 2];
        const rearmDist = REARM * Math.abs(here - inner);
        let armed = true;
        for (let k = 0; k < bars.length; k++) {
          const bar = bars[k];
          if (!armed) {
            const away = isUp ? (here - bar.close) : (bar.close - here);
            if (away >= rearmDist) armed = true;
            continue;
          }
          if (!reach(isUp ? bar.high : bar.low, here)) continue;
          armed = false;
          let outcome = 'neither', at = null;
          for (let j = strict ? k + 1 : k; j < bars.length; j++) {
            const b2 = bars[j], fwd = isUp ? b2.high : b2.low, bwd = isUp ? b2.low : b2.high;
            if (reach(fwd, outer)) { outcome = 'out'; at = j; break; }
            if (isUp ? bwd <= inner : bwd >= inner) { outcome = 'back'; at = j; break; }
          }
          const tgt = Math.abs(here - inner) / open * 100, stp = Math.abs(outer - here) / open * 100;
          let fadePct;
          if (outcome === 'back') fadePct = tgt;
          else if (outcome === 'out') fadePct = -stp;
          else fadePct = (isUp ? here - bars.at(-1).close : bars.at(-1).close - here) / open * 100;
          rows.push({ v, date: d.date, rung: ['p50', 'p75'][ri], side, fadePct, stopPct: stp, targetPct: tgt, onTouchBar: at === k });
        }
      }
    }
  }
}

fs.mkdirSync('analysis/output/v4_stage0', { recursive: true });
fs.writeFileSync(`analysis/output/v4_stage0/${pair}-vageom.json`, JSON.stringify({ pair: sym, cost, rows }));
const c = rows.reduce((a, r) => (a[r.v] = (a[r.v] ?? 0) + 1, a), {});
console.log(`${sym}: ${JSON.stringify(c)} cost ${cost}%`);
