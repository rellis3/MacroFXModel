#!/usr/bin/env node
/**
 * q6-netliq-rerun / macro-equity: runs js/macroEquityEngine.js runMacroEquityBacktest (v3, default
 * config, the route's defaults: QQQ + SPY, Russell included when available) on data assembled the way
 * server.js fetchMeRawData does, with these substitutions (no OANDA_KEY / FRED_KEY in this session):
 *   - OANDA D1 NAS100_USD / SPX500_USD (fetchOandaD1Range, same close-day label) -> feature store
 *     px_d1_nas100 / px_d1_spx500 closes. The store has no open, so each day's open = the previous
 *     day's close (the engine only uses the open of the FIRST day of each month, i.e. a monthly
 *     return measured close-to-close instead of first-open-to-close).
 *   - US2000_USD (Russell) is not in the store -> not available, so IWM is left out (the engine skips it).
 *   - Yahoo ^VIX -> FRED VIXCLS (the same CBOE close).
 *   - FRED API -> fredgraph dump (fetch_fred.mjs). NAPM 404s on FRED, so ISM = INDPRO, as the server
 *     falls back. EU PMI is unused without DAX.
 *   - date spine: union of the NAS100 and SPX500 dates (the server also unions the Yahoo TLT/GLD/BIL dates).
 *   - everything cut at 2026-08-21 (lockbox).
 *
 *   node scripts/q6-netliq-rerun/run_macro_equity.mjs <fixed|old> [no-netliq]
 * mode old: WTREGEN x1000 into the engine, which then computes the 2026-07-02..2026-10-17 line.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMacroEquityBacktest } from '../../js/macroEquityEngine.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTDIR = path.join(ROOT, 'analysis', 'output', 'q6-netliq-rerun');
const mode = process.argv[2];
const ablate = process.argv[3] === 'no-netliq';   // context: same run with the net-liquidity weight set to 0
if (!['fixed', 'old'].includes(mode)) { console.error('usage: run_macro_equity.mjs <fixed|old>'); process.exit(2); }
const FROM = '2005-01-01', END = '2026-08-21';

const px = JSON.parse(fs.readFileSync(path.join(OUTDIR, 'px_index.json'), 'utf8'));   // written by export_index_closes.py
const fred = JSON.parse(fs.readFileSync(path.join(OUTDIR, 'fred.json'), 'utf8'));
const cut = rows => rows.filter(([d]) => d >= FROM && d <= END);
const nas = new Map(cut(px.nas100)), spx = new Map(cut(px.spx500));
const dates = [...new Set([...nas.keys(), ...spx.keys()])].sort();
function inst(map) {
  const close = dates.map(d => map.get(d) ?? NaN);
  const open = close.map((_, i) => { for (let k = i - 1; k >= 0; k--) if (Number.isFinite(close[k])) return close[k]; return NaN; });
  return { open, close };
}
const fmap = id => new Map((fred[id] || []).filter(o => o.date >= FROM && o.date <= END).map(o => [o.date, o.value]));
const alignSparse = m => dates.map(d => m.has(d) ? m.get(d) : NaN);   // server.js alignSparse
const tga = fmap('WTREGEN'); if (mode === 'old') for (const [k, v] of tga) tga.set(k, v * 1000);
const data = {
  dates,
  instruments: {
    QQQ: { ...inst(nas), label: 'QQQ — Nasdaq-100', inverted: false },
    SPY: { ...inst(spx), label: 'SPY — S&P 500', inverted: false },
  },
  vix: alignSparse(fmap('VIXCLS')),
  fred: {
    walcl: alignSparse(fmap('WALCL')), wtregen: alignSparse(tga), rrpontsyd: alignSparse(fmap('RRPONTSYD')),
    t10y2y: alignSparse(fmap('T10Y2Y')), bamlh0a0hym2: alignSparse(fmap('BAMLH0A0HYM2')), dfii10: alignSparse(fmap('DFII10')),
    napm: alignSparse(fmap('INDPRO')), eupmi: dates.map(() => NaN),
  },
};
const r = runMacroEquityBacktest(data, ablate ? { weights: { netLiq: 0 } } : {});
const out = { mode, ranAt: new Date().toISOString(), from: FROM, end: END, dateRange: r.dateRange, nDays: r.nDays, instruments: {} };
for (const k of r.instruments) {
  const x = r[k];
  out.instruments[k] = { metrics: x.metrics, bh: x.bh, walkForward: { windows: x.walkForward.windows.length, meanOOSSharpe: x.walkForward.meanOOSSharpe, meanISSharpe: x.walkForward.meanISSharpe, wfe: x.walkForward.wfe }, verdict: x.verdict, regime: x.regime };
  console.log(`${k}: Sharpe ${x.metrics.sharpe} (B&H ${x.bh.sharpe})  CAGR ${(x.metrics.cagr * 100).toFixed(1)}% (B&H ${(x.bh.cagr * 100).toFixed(1)}%)  maxDD ${(x.metrics.maxDD * 100).toFixed(1)}% (B&H ${(x.bh.maxDD * 100).toFixed(1)}%)  WF windows ${x.walkForward.windows.length}  OOS Sharpe ${x.walkForward.meanOOSSharpe}  IS ${x.walkForward.meanISSharpe}  WFE ${x.walkForward.wfe}  -> overallPass ${x.verdict.overallPass}`);
}
fs.writeFileSync(path.join(OUTDIR, `macro_equity_${mode}${ablate ? '_no-netliq' : ''}.json`), JSON.stringify(out, null, 1));
console.log(`span ${r.dateRange.start} -> ${r.dateRange.end} (${r.nDays} days); written macro_equity_${mode}${ablate ? '_no-netliq' : ''}.json`);
