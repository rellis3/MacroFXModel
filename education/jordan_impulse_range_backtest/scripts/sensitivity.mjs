import { loadM1ForPair } from '/home/user/MacroFXModel/js/volBacktestM1Engine.js';
import { runImpulseEmaRange } from '/home/user/MacroFXModel/js/impulseEmaRangeV1Engine.js';
import { summarizeSplit } from '/home/user/MacroFXModel/js/honestForecastEngine.js';
import { summarizeTrades } from '/home/user/MacroFXModel/js/metricsCore.js';

const enrich = (pnls, dates) => { if (!pnls.length) return { trades: 0 }; return summarizeTrades(pnls, dates); };

const goldPacked = await loadM1ForPair('gold');
const nqPacked = await loadM1ForPair('nq', './portfolioBacktest/cache');

const variants = [
  { label: 'baseline (rr=2, gate on, ema on)', cfg: {} },
  { label: 'rr=1.0',   cfg: { rr: 1.0 } },
  { label: 'rr=1.5',   cfg: { rr: 1.5 } },
  { label: 'rr=3.0',   cfg: { rr: 3.0 } },
  { label: 'no range gate (frac=99)', cfg: { rangeGateMaxUsedFrac: 99 } },
  { label: 'tight range gate (frac=0.5)', cfg: { rangeGateMaxUsedFrac: 0.5 } },
  { label: 'wider impulse (3.5x atr)', cfg: { impulseAtrMult: 3.5 } },
];

for (const [name, packed] of [['GOLD', goldPacked], ['NQ', nqPacked]]) {
  console.log(`\n=== ${name} ===`);
  for (const v of variants) {
    const { trades, records } = runImpulseEmaRange(packed, { instrument: name === 'GOLD' ? 'gold' : 'nq', ...v.cfg });
    const split = summarizeSplit(records, 0.4);
    const full = enrich(records.map(r => r.pnl_pct), records.map(r => r.date));
    const isP  = records.filter(r => split.splitDate ? r.date <  split.splitDate : true);
    const oosP = records.filter(r => split.splitDate ? r.date >= split.splitDate : false);
    const oos = enrich(oosP.map(r => r.pnl_pct), oosP.map(r => r.date));
    console.log(`  ${v.label.padEnd(32)} n=${String(trades.length).padStart(5)}  win%=${String(full.winRate ?? '-').padStart(5)}  PF=${String(full.profitFactor ?? '-').padStart(6)}  exp=${String(full.expectancy ?? '-').padStart(8)}  Sharpe(full)=${String(full.sharpe ?? '-').padStart(7)}  Sharpe(OOS)=${String(oos.sharpe ?? '-').padStart(7)}(n=${oos.trades})`);
  }
}
