import { loadM1ForPair } from '../../../js/volBacktestM1Engine.js';
import { runVwapSessionReversion } from '../../../js/vwapSessionReversionV1Engine.js';
import { summarizeSplit } from '../../../js/honestForecastEngine.js';
import { summarizeTrades, sortinoRatio } from '../../../js/metricsCore.js';
import fs from 'fs';

const pair = process.argv[2];           // 'gold' | any FX key
const outDir = process.argv[3];
const m1Dir = process.argv[4] || undefined;
const minMovePct = process.argv[5] ? Number(process.argv[5]) : undefined;
const slAtrMult = process.argv[6] ? Number(process.argv[6]) : undefined;

const enrich = (pnls, dates) => { if (!pnls.length) return { trades: 0 }; const s = summarizeTrades(pnls, dates); s.sortino = +sortinoRatio(pnls).toFixed(3); return s; };

const packed = m1Dir ? await loadM1ForPair(pair, m1Dir) : await loadM1ForPair(pair);
if (!packed) { process.stderr.write(`${pair}: no data\n`); process.exit(2); }

const cfg = { instrument: pair };
if (minMovePct !== undefined) cfg.minMovePct = minMovePct;
if (slAtrMult !== undefined) cfg.slAtrMult = slAtrMult;

const t0 = Date.now();
const { trades, records, meta } = runVwapSessionReversion(packed, cfg);
const split = summarizeSplit(records, 0.4);
const full = enrich(records.map(r => r.pnl_pct), records.map(r => r.date));
const isP  = records.filter(r => split.splitDate ? r.date <  split.splitDate : true);
const oosP = records.filter(r => split.splitDate ? r.date >= split.splitDate : false);
const is  = enrich(isP.map(r => r.pnl_pct), isP.map(r => r.date));
const oos = enrich(oosP.map(r => r.pnl_pct), oosP.map(r => r.date));

const label = (minMovePct !== undefined || slAtrMult !== undefined)
  ? `${pair}_m${cfg.minMovePct ?? 'd'}_s${cfg.slAtrMult ?? 'd'}`
  : pair;
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(`${outDir}/${label}.summary.json`, JSON.stringify({ pair, nTrades: trades.length, splitDate: split.splitDate, full, is, oos, from: meta.from, to: meta.to, cost: meta.cost, cfg: meta.cfg }, null, 2));
fs.writeFileSync(`${outDir}/${label}.trades.json`, JSON.stringify(trades));
process.stderr.write(`${label}: ${trades.length} trades in ${Date.now() - t0}ms  full.sharpe=${full.sharpe} winRate=${full.winRate}%  oos.sharpe=${oos.sharpe}(n=${oos.trades})\n`);
