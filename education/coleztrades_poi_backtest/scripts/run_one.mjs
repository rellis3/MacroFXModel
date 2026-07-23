import { loadM1ForPair } from '/home/user/MacroFXModel/js/volBacktestM1Engine.js';
import { runPoiReaction } from '/home/user/MacroFXModel/js/poiReactionV1Engine.js';
import { summarizeSplit } from '/home/user/MacroFXModel/js/honestForecastEngine.js';
import { summarizeTrades, sortinoRatio } from '/home/user/MacroFXModel/js/metricsCore.js';
import fs from 'fs';

const pair = process.argv[2];
const outDir = process.argv[3];
const enrich = (pnls, dates) => { if (!pnls.length) return { trades: 0 }; const s = summarizeTrades(pnls, dates); s.sortino = +sortinoRatio(pnls).toFixed(3); return s; };

const packed = await loadM1ForPair(pair);
if (!packed) { process.stderr.write(`${pair}: no data\n`); process.exit(2); }
const { trades, records, meta } = runPoiReaction(packed, { instrument: pair });
const split = summarizeSplit(records, 0.4);
const full = enrich(records.map(r=>r.pnl_pct), records.map(r=>r.date));
const isP  = records.filter(r=> split.splitDate ? r.date <  split.splitDate : true);
const oosP = records.filter(r=> split.splitDate ? r.date >= split.splitDate : false);
const is  = enrich(isP.map(r=>r.pnl_pct), isP.map(r=>r.date));
const oos = enrich(oosP.map(r=>r.pnl_pct), oosP.map(r=>r.date));

// Buy-and-hold benchmark.
const { n, times, closes } = packed;
const dayClose = new Map();
for (let k=0;k<n;k++){ const d = times[k]-(times[k]%86400); dayClose.set(d, closes[k]); }
const dc = [...dayClose.entries()].sort((a,b)=>a[0]-b[0]).map(e=>e[1]);
const rets=[]; for(let k=1;k<dc.length;k++) rets.push((dc[k]-dc[k-1])/dc[k-1]);
const mean = rets.reduce((a,b)=>a+b,0)/rets.length;
const sd = Math.sqrt(rets.reduce((a,b)=>a+(b-mean)**2,0)/rets.length);
const bhSharpe = sd>0 ? +(mean/sd*Math.sqrt(252)).toFixed(3) : 0;

fs.writeFileSync(`${outDir}/${pair}.summary.json`, JSON.stringify({ pair, nTrades: trades.length, splitDate: split.splitDate, full, is, oos, bhSharpe, from: meta.from, to: meta.to, cost: meta.cost }));
fs.writeFileSync(`${outDir}/${pair}.trades.json`, JSON.stringify(trades));
process.stderr.write(`${pair}: ${trades.length} trades  full.sharpe=${full.sharpe}  oos.sharpe=${oos.sharpe}(n=${oos.trades})  bh=${bhSharpe}\n`);
