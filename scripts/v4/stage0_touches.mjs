// Stage 0 per-touch builder (forge/V4_STAGE0_PREREG.md). One pair per run; writes
// analysis/output/v4_stage0/<pair>-<tags>.json. Read-only against R2.
//   node scripts/v4/stage0_touches.mjs eurusd proxy|none
import fs from 'fs';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { v4Days, firstTouches } from '../../js/voteAtlasV4Lines.js';
import { costForPair } from '../../js/perLineStrategy.js';
import { assetClassFor } from '../../js/forecastAnalyserStore.js';
import { loadCalendarProxy } from './calendarProxy.mjs';

const [pair, tagMode = 'proxy'] = process.argv.slice(2);
const OUT = 'analysis/output/v4_stage0';
const M = [0.25, 0.5];
const sym = pair.toUpperCase(), assetClass = assetClassFor(pair), cost = costForPair(pair, assetClass);
const tagFor = tagMode === 'none' ? () => 'none' : loadCalendarProxy()(sym);

let packed = await loadM1ForPair(pair);
// Same deliberate 10-year window as Vote Atlas (levelAtlasRoutes.js LOOKBACK_DAYS).
const cut = packed.times[packed.n - 1] - Math.round(365.25 * 10) * 86400;
let ci = 0; while (ci < packed.n && packed.times[ci] < cut) ci++;
const sl = k => Array.from(packed[k].slice(ci));
packed = { n: packed.n - ci, times: sl('times'), opens: sl('opens'), highs: sl('highs'), lows: sl('lows'), closes: sl('closes'), volumes: sl('volumes') };

// Seeded U(0,1) per (date, side) for the control level.
function u01(str) { let h = 2166136261; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return ((h >>> 0) % 1e6) / 1e6; }

// Score one entry: fade R for barriers ±b around `level`, from bar k+1 to day end.
function fadeR(bars, k, level, up, b) {
  const back = up ? level - b : level + b, beyond = up ? level + b : level - b;
  for (let j = k + 1; j < bars.length; j++) {
    const x = bars[j];
    const hitBack = up ? x.low <= back : x.high >= back;
    const hitBeyond = up ? x.high >= beyond : x.low <= beyond;
    if (hitBack && hitBeyond) return { r: null, why: 'ambiguous' };
    if (hitBack) return { r: 1, why: 'back' };
    if (hitBeyond) return { r: -1, why: 'beyond' };
  }
  const last = bars[bars.length - 1].close;
  const mtm = (up ? level - last : last - level) / b;
  return { r: Math.max(-1, Math.min(1, mtm)), why: 'close' };
}

const days = v4Days(packed, { instrument: sym, assetClass, eventTagFor: tagFor });
const rows = [];
for (const d of days) {
  const touches = firstTouches(d);
  // Control: one random static level per side, first touch, same scoring.
  const hl75 = d.ladder.hl?.p75;
  if (hl75) {
    for (const side of ['up', 'dn']) {
      const u = 0.2 + 0.8 * u01(`${sym}|${d.date}|${side}`);
      const lvl = side === 'up' ? d.open * (1 + u * hl75 / 100) : d.open * (1 - u * hl75 / 100);
      const k = d.bars.findIndex(x => side === 'up' ? x.high >= lvl : x.low <= lvl);
      if (k >= 0) touches.push({ line: side === 'up' ? 'CtrlUp' : 'CtrlDn', side, k, time: d.bars[k].time, level: lvl });
    }
  }
  for (const t of touches) {
    const row = { date: d.date, line: t.line, side: t.side, k: t.k, time: t.time, tag: d.eventTag };
    for (const m of M) {
      const b = m * d.sigmaFrac * d.open;
      const s = fadeR(d.bars, t.k, t.level, t.side === 'up', b);
      row[`r${m}`] = s.r; row[`why${m}`] = s.why;
      row[`c${m}`] = +(cost / (b / d.open * 100)).toFixed(4);   // cost in R units
    }
    rows.push(row);
  }
}
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(`${OUT}/${pair}-${tagMode}.json`, JSON.stringify({ pair: sym, assetClass, cost, tagMode,
  generatedAt: new Date().toISOString(), days: days.length, from: days[0]?.date, to: days.at(-1)?.date, rows }));
console.log(`${sym} ${tagMode}: ${days.length} days ${days[0]?.date}→${days.at(-1)?.date}, ${rows.length} touches, cost ${cost}%`);
