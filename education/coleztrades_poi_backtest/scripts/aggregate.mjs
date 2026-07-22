import { summarizeSplit } from '/home/user/MacroFXModel/js/honestForecastEngine.js';
import { summarizeTrades, sortinoRatio } from '/home/user/MacroFXModel/js/metricsCore.js';
import fs from 'fs';

const dir = process.argv[2];
const outDir = process.argv[3];
const PAIRS = ['eurusd','gbpusd','audusd','nzdusd','usdcad','usdchf','usdjpy','eurjpy','gbpjpy','audjpy','cadjpy','chfjpy','nzdjpy','eurgbp','euraud','eurcad','eurchf','eurnzd','audnzd','audcad','audchf','gbpaud','gbpcad','gbpchf','gbpnzd','gold'];
const enrich = (pnls, dates) => { if (!pnls.length) return { trades: 0 }; const s = summarizeTrades(pnls, dates); s.sortino = +sortinoRatio(pnls).toFixed(3); return s; };

const perPair = [];
const allTrades = [];
const allRecords = [];
for (const p of PAIRS) {
  const sf = `${dir}/${p}.summary.json`, tf = `${dir}/${p}.trades.json`;
  if (!fs.existsSync(sf)) { console.error('MISSING', p); continue; }
  const summ = JSON.parse(fs.readFileSync(sf));
  const trades = JSON.parse(fs.readFileSync(tf));
  perPair.push(summ);
  for (const t of trades) { allTrades.push(t); allRecords.push({ filled: true, pnl_pct: t.netPct, date: t.date, pair: p }); }
}
allRecords.sort((a,b)=> a.date < b.date ? -1 : 1);
allTrades.sort((a,b)=> a.date < b.date ? -1 : 1);

const pooledSplit = summarizeSplit(allRecords, 0.4);
const sd = pooledSplit.splitDate;
const pFull = enrich(allRecords.map(r=>r.pnl_pct), allRecords.map(r=>r.date));
const pIS  = allRecords.filter(r=> sd ? r.date <  sd : true);
const pOOS = allRecords.filter(r=> sd ? r.date >= sd : false);
const pooled = { full: pFull, is: enrich(pIS.map(r=>r.pnl_pct),pIS.map(r=>r.date)), oos: enrich(pOOS.map(r=>r.pnl_pct),pOOS.map(r=>r.date)), splitDate: sd };

// Yearly / monthly R aggregation.
const byYear = {}; const byMonth = {};
for (const t of allTrades) { const y=t.date.substring(0,4), ym=t.date.substring(0,7); byYear[y]=(byYear[y]||0)+t.R; byMonth[ym]=(byMonth[ym]||0)+t.R; }

// Portfolio equity in R over time (cumulative), sampled to keep it light.
let cum=0; const equity = allTrades.map(t=>{ cum+=t.R; return { date:t.date, cumR:+cum.toFixed(3) }; });

const bhMean = +(perPair.reduce((a,b)=>a+b.bhSharpe,0)/perPair.length).toFixed(3);
const result = { pairs: perPair.length, totalTrades: allTrades.length, window: perPair[0] ? `${perPair[0].from}..${perPair[0].to}` : '', splitDate: sd, perPair, pooled, byYear, byMonth, bhSharpeMean: bhMean };
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(`${outDir}/results.json`, JSON.stringify(result, null, 1));

// ── 3 CSV exports (CLAUDE.md schemas), combined across pairs with an instrument col ──
const w = (name, header, rows) => fs.writeFileSync(`${outDir}/${name}`, header + '\n' + rows.join('\n') + '\n');
w('trades_pct_returns.csv', 'Instrument,Date,Return %,MAE %',
  allTrades.map(t=>`${t.instrument},${t.date},${t.netPct},${t.maePct}`));
w('trades_r_multiples.csv', 'instrument,date,R,MAE (R)',
  allTrades.map(t=>`${t.instrument},${t.date},${t.R},${t.maeR}`));
w('trades_currency_pnl.csv', 'Instrument,Trade Date,PnL ($),Risk ($)',
  allTrades.map(t=>`${t.instrument},${t.date},${t.pnlCcy},${t.riskCcy}`));

// Per-pair metrics table CSV.
w('per_pair_metrics.csv', 'pair,nTrades,full_sharpe,full_sortino,full_win%,full_PF,full_maxDD,full_expectancy,IS_sharpe,IS_n,OOS_sharpe,OOS_n,OOS_win%,OOS_PF,buyhold_sharpe',
  perPair.map(p=>[p.pair,p.nTrades,p.full.sharpe,p.full.sortino,p.full.winRate,p.full.profitFactor,p.full.maxDD,p.full.expectancy,p.is.sharpe,p.is.trades,p.oos.sharpe,p.oos.trades,p.oos.winRate,p.oos.profitFactor,p.bhSharpe].join(',')));

// Equity + heatmap data for the chart page.
fs.writeFileSync(`${outDir}/equity.json`, JSON.stringify(equity));
fs.writeFileSync(`${outDir}/heatmap.json`, JSON.stringify({ byYear, byMonth }));

const f = x => x==null?'n/a':(+x).toFixed(3);
console.log('POOLED  full.sharpe', f(pFull.sharpe), 'n', pFull.trades, '| IS', f(pooled.is.sharpe),'(n',pooled.is.trades,') | OOS', f(pooled.oos.sharpe),'(n',pooled.oos.trades,')');
console.log('POOLED  win%', f(pFull.winRate), 'PF', f(pFull.profitFactor), 'expectancy', f(pFull.expectancy), 'maxDD', f(pFull.maxDD), 'skew', f(pFull.skew), 'kurt', f(pFull.excessKurt));
console.log('buy&hold mean sharpe', bhMean, '| split', sd, '| total trades', allTrades.length);
const posOOS = perPair.filter(p=>p.oos.sharpe>0).length, posFull = perPair.filter(p=>p.full.sharpe>0).length;
console.log(`pairs with positive FULL sharpe: ${posFull}/26 ; positive OOS sharpe: ${posOOS}/26`);
