// EXHAUSTION-SCHEDULE stage 2: H13 fade at the 80% schedule (forge/EXHAUSTION_SCHEDULE_PREREG.md + amendment b92e19e3).
// Reads the per-day schedule written by analysis/surfaces/exhaustion_fit.py and trades it on the same M1 days.
// Short the high side / long the low side; stop 0.25 sigma beyond entry; G1 exit at day end, G2 target 0.25 sigma (1R).
// Also 500 circular-shift shuffles of each day's schedule (sum/count per draw) for the benchmark.
//   node scripts/rangebook/exhaustion_fade.mjs
import fs from 'fs';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { buildContext } from './common.mjs';
import { loadCalendarProxy } from '../v4/calendarProxy.mjs';
import { assetClassFor } from '../../js/forecastAnalyserStore.js';
import { costForPair } from '../../js/perLineStrategy.js';

const DIR = 'analysis/surfaces/exhaustion', DRAWS = 500, CAL_END = '2026-07-02';
const KEY = { GOLD: 'gold', NQ: 'nq', SPX500: 'spx500', DOW: 'us30', US2000: 'us2000', DE30: 'de30', UK100: 'uk100' };
const calendar = loadCalendarProxy();
let seed = 20261004; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

function trade(bars, openSec, open, unit, sched, up, costPct) {
  // up = true: the HIGH side (fade = short). Returns { hour, g1, g2, costR } or null.
  let run = up ? -Infinity : Infinity;
  for (let j = 0; j < bars.length; j++) {
    const b = bars[j], h = Math.min(23, Math.floor((b.time - openSec) / 3600)), d = sched[h];
    if (d != null) {
      const level = up ? open * (1 + d * unit / open) : open * (1 - d * unit / open);
      let entry = null;
      if (up ? run >= level : run <= level) entry = b.open;                          // level stepped past price (amendment 1)
      else if (up ? b.high >= level : b.low <= level) entry = up ? Math.max(level, b.open) : Math.min(level, b.open);
      if (entry != null) {
        const risk = 0.25 * unit, stop = up ? entry + risk : entry - risk, tgt = up ? entry - risk : entry + risk;
        let g1 = null, g2 = null;
        for (let k = j + 1; k < bars.length && (g1 == null || g2 == null); k++) {
          const c = bars[k], hitS = up ? c.high >= stop : c.low <= stop, hitT = up ? c.low <= tgt : c.high >= tgt;
          if (g1 == null && hitS) g1 = -1;
          if (g2 == null && (hitS || hitT)) g2 = hitS ? -1 : 1;
        }
        const last = bars.at(-1).close, mark = (up ? entry - last : last - entry) / risk;
        if (g1 == null) g1 = Math.max(-1, mark);
        if (g2 == null) g2 = Math.max(-1, Math.min(1, mark));
        return { hour: h, g1, g2, costR: costPct * entry / risk };
      }
    }
    if (up ? b.high > run : b.low < run) run = up ? b.high : b.low;
  }
  return null;
}

const files = fs.readdirSync(`${DIR}/sched`).filter(f => f.endsWith('.json'));
const rows = ['inst,date,side,hour,g1,g2,costR'];
const shuffle = {};
for (const f of files) {
  const SYM = f.replace('.json', ''), key = KEY[SYM] ?? SYM.toLowerCase(), t0 = Date.now();
  const sched = JSON.parse(fs.readFileSync(`${DIR}/sched/${f}`, 'utf8'));
  const packed = await loadM1ForPair(key); if (!packed?.n) continue;
  const ctx = buildContext(packed, { sym: SYM, assetClass: assetClassFor(key), tagFor: calendar(SYM) });
  const costPct = costForPair(key, assetClassFor(key)) / 100;
  const days = ctx.days.filter(d => d.date <= CAL_END && sched[d.date] && d.sigmaFrac > 0 && d.bars.length >= 60);
  const sh = { A: { g1: new Float64Array(DRAWS), g2: new Float64Array(DRAWS), n: new Float64Array(DRAWS) }, B: { g1: new Float64Array(DRAWS), g2: new Float64Array(DRAWS), n: new Float64Array(DRAWS) } };
  for (const d of days) {
    const unit = d.sigmaFrac * d.open, half = d.date < '2023-01-01' ? 'A' : 'B';
    for (const side of ['H', 'L']) {
      const s = sched[d.date][side]; if (!s.some(x => x != null)) continue;
      const t = trade(d.bars, d.openSec, d.open, unit, s, side === 'H', costPct);
      if (t) rows.push([SYM, d.date, side, t.hour, t.g1.toFixed(4), t.g2.toFixed(4), t.costR.toFixed(4)].join(','));
      for (let r = 0; r < DRAWS; r++) {
        const k = 1 + Math.floor(rnd() * 23), s2 = s.map((_, h) => s[(h + k) % 24]);
        const u = trade(d.bars, d.openSec, d.open, unit, s2, side === 'H', costPct);
        if (u) { sh[half].g1[r] += u.g1 - u.costR; sh[half].g2[r] += u.g2 - u.costR; sh[half].n[r]++; }
      }
    }
  }
  shuffle[SYM] = { A: { g1: [...sh.A.g1], g2: [...sh.A.g2], n: [...sh.A.n] }, B: { g1: [...sh.B.g1], g2: [...sh.B.g2], n: [...sh.B.n] } };
  console.log(`${SYM}: ${days.length} days, ${Math.round((Date.now() - t0) / 1000)} s`);
}
fs.writeFileSync(`${DIR}/fade_trades.csv`, rows.join('\n') + '\n');
fs.writeFileSync(`${DIR}/fade_shuffle.json`, JSON.stringify(shuffle));
console.log('done');
