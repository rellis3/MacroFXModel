// Slow mean-reversion book (forge/SLOW_MR_BOOK_PREREG.md): one row per London day per instrument —
// the 20-day stretch z at 07:00 London, the day's forecast σ, and the move from that 07:00 bar's
// open to the next London day's 07:00 bar's open. Position, costs and the book are in slow_score.py.
//   node scripts/rangebook/slow_build.mjs <pair>
import fs from 'fs';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { loadCalendarProxy } from '../v4/calendarProxy.mjs';
import { assetClassFor } from '../../js/forecastAnalyserStore.js';
import { costForPair } from '../../js/perLineStrategy.js';
import { buildContext, scrambleFrom, stretchZ } from './common.mjs';

const PAIR = (process.argv[2] ?? 'eurusd').toLowerCase(), SYM = PAIR.toUpperCase(), ASSET = assetClassFor(PAIR);
const OPTS = { sym: SYM, assetClass: ASSET, tagFor: loadCalendarProxy()(SYM) };
const k7Of = d => d.bars.findIndex(b => b.time >= d.openSec + 7 * 3600);

function rowsOf(ctx) {
  const out = [];
  for (let di = 20; di < ctx.days.length - 1; di++) {
    const d = ctx.days[di], nx = ctx.days[di + 1], k = k7Of(d), kn = k7Of(nx);
    if (k < 1 || kn < 0 || !(d.sigmaFrac > 0)) continue;
    const st = stretchZ(ctx, di, k, 20, Math.sqrt(5));
    if (!st) continue;
    out.push({ date: d.date, t: d.bars[k].time, z: Math.round(st.z * 1e4) / 1e4, sig: d.sigmaFrac,
               r: (nx.bars[kn].open - d.bars[k].open) / d.bars[k].open });
  }
  return out;
}

const full = await loadM1ForPair(PAIR);
const ctx = buildContext(full, OPTS);
const rows = rowsOf(ctx);

// Self-check: z unchanged when the 07:00 bar onward is replaced; entry (the 07:00 open) unchanged
// when everything after the 07:00 bar is replaced.
{
  const idx = new Map(Array.from(full.times, (x, i) => [x, i]));
  const picks = rows.filter((_, i) => i % Math.floor(rows.length / 4) === 2).slice(0, 4);
  if (picks.length < 3) { console.error('self-check sampled too few'); process.exit(2); }
  for (const r of picks) {
    for (const [from, what] of [[idx.get(r.t), 'z'], [idx.get(r.t) + 1, 'entry']]) {
      const c2 = buildContext(scrambleFrom(full, from, 131), OPTS);
      const di = ctx.dayIdx.get(r.date), di2 = c2.dayIdx.get(r.date);
      const k = k7Of(ctx.days[di]), k2 = k7Of(c2.days[di2]);
      const a = what === 'z' ? JSON.stringify(stretchZ(ctx, di, k, 20, Math.sqrt(5))) : String(ctx.days[di].bars[k].open);
      const b = what === 'z' ? JSON.stringify(stretchZ(c2, di2, k2, 20, Math.sqrt(5))) : String(c2.days[di2].bars[k2].open);
      if (a !== b) { console.error(`LOOK-AHEAD ${what} ${r.date}\n ${a}\n ${b}`); process.exit(2); }
    }
  }
  console.log(`[${PAIR}] self-check: ${picks.length * 2} z/entry checks identical under future-scramble`);
}
fs.writeFileSync(`analysis/output/rangebook/${PAIR}_slow.json`, JSON.stringify({ pair: SYM, cost: costForPair(PAIR, ASSET), rows }));
console.log(`[${PAIR}] ${rows.length} days ${rows[0].date} -> ${rows.at(-1).date}`);
