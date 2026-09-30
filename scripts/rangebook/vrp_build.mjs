// Your vol forecast vs implied vol (forge/VRP_FORECAST_PREREG.md). One row per instrument-month:
// implied vol at the month's last NY close, your forecast σ from bars through that close, and the
// realised vol of the next 21 NY days.
//   node scripts/rangebook/vrp_build.mjs
import fs from 'fs';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { nyCloseDailyBars } from '../../js/voteAtlasV4Lines.js';
import { forecastSigma } from '../../js/forecastSigma.js';
import { paramsFor } from '../../js/forecastLadder.js';
import { assetClassFor } from '../../js/forecastAnalyserStore.js';
import { scrambleFrom } from './common.mjs';

const INST = [['eurusd', 'EURUSD', 'EURUSD'], ['gbpusd', 'GBPUSD', 'GBPUSD'], ['audusd', 'AUDUSD', 'AUDUSD'], ['usdcad', 'USDCAD', 'USDCAD'],
              ['usdchf', 'USDCHF', 'USDCHF'], ['usdjpy', 'USDJPY', 'USDJPY'], ['gold', 'GOLD', 'XAUUSD']];
const CV = JSON.parse(fs.readFileSync('js/data/cmeCvolEod.json', 'utf8')).series;
const H = 21;

function months(packed, sym, cvKey) {
  const est = paramsFor(sym, assetClassFor(sym.toLowerCase())).estimator ?? 'yz_30';
  const ny = nyCloseDailyBars(packed).filter(b => b.n >= 60);
  const cv = CV[cvKey], cd = cv.map(x => x.date);
  const out = [];
  for (let i = 60; i + H < ny.length; i++) {
    if (ny[i + 1].key.slice(0, 7) === ny[i].key.slice(0, 7)) continue;          // i = last NY day of its month
    let c = -1; for (let j = cd.length - 1; j >= 0; j--) if (cd[j] <= ny[i].key) { c = j; break; }
    if (c < 0) continue;
    const s = forecastSigma(ny.slice(0, i + 1), est);
    if (!(s > 0)) continue;
    let ss = 0; for (let j = i + 1; j <= i + H; j++) ss += Math.log(ny[j].close / ny[j - 1].close) ** 2;
    out.push({ date: ny[i].key, endSec: ny[i].endSec, iv: cv[c].cvol, ivDate: cv[c].date,
               f: s * Math.sqrt(252) * 100, rv: Math.sqrt(252 * ss / H) * 100 });
  }
  return { rows: out, est };
}

const all = {};
for (const [pair, sym, cvKey] of INST) {
  const packed = await loadM1ForPair(pair);
  const { rows, est } = months(packed, sym, cvKey);
  // Self-check: F must not change when every M1 bar after the entry close is replaced.
  for (const r of rows.filter((_, i) => i % Math.floor(rows.length / 3) === 1).slice(0, 3)) {
    let from = 0; while (from < packed.n && packed.times[from] < r.endSec) from++;
    const again = months(scrambleFrom(packed, from, 151), sym, cvKey).rows.find(x => x.date === r.date);
    if (!again || again.f !== r.f) { console.error(`LOOK-AHEAD ${pair} ${r.date}: ${r.f} vs ${again?.f}`); process.exit(2); }
  }
  all[pair] = rows;
  console.log(`[${pair}] estimator ${est}, ${rows.length} months ${rows[0].date} -> ${rows.at(-1).date}; self-check 3 months identical`);
}
fs.writeFileSync('analysis/output/rangebook/vrp.json', JSON.stringify(all));
