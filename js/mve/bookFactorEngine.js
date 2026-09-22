// mve/bookFactorEngine.js — I/O for the MVE book layer (js/mve/bookFactor.js).
//
// Loads the 7 USD majors' daily closes (M1 → daily, the SAME day boundaries the
// spread sleeves' trade dates use), runs the validated 2Y sleeve and the 10Y
// multi-spread sleeve through js/multiSpreadEngine.js's runSpreadBook (imported, not
// re-implemented, frozen configs untouched), turns their trades into daily
// positions, and hands everything to the pure runBookLayer.
//
// Pre-registration: MD files/MVE_BOOK_FACTOR_AUDIT.md. Needs FRED_KEY + M1 (Railway).
// Read-only research: feeds no live signal, bot or dashboard decision.

import { loadM1ForPair } from '../volBacktestM1Engine.js';
import { runSpreadBook, dailyClosesFrom } from '../multiSpreadEngine.js';
import {
  USD_MAJORS, alignCloses, currencyReturns, positionsAfterClose, runBookLayer, publicBookResult,
} from './bookFactor.js';

// Pre-registered sleeve config (MVE_BOOK_FACTOR_AUDIT.md §3) — the validated 2Y
// region's representative cell, applied unchanged to both tenors. Not swept here.
export const BOOK_SLEEVE_CONFIG = {
  zWindow: 126, entryThreshold: 2.0, zExit: 1.5, maxHoldDays: 20,
  costPct: 0.02, splitFrac: 0.6, autoOrient: true,
  pubLagUsDays: 2, pubLagForeignDays: 45, dateFrom: '2015-01-01',
};
// One-way cost per unit of turnover = half the sleeves' validated 0.02% round trip,
// charged on every pair the (raw or hedged) book trades.
export const BOOK_COST_ONE_WAY = 0.0001;

export async function loadMajorCloses({ dateFrom = BOOK_SLEEVE_CONFIG.dateFrom, dateTo } = {}) {
  const closesByPair = {};
  const log = [];
  for (const p of Object.keys(USD_MAJORS)) {
    const packed = await loadM1ForPair(p);
    if (!packed) throw new Error(`No M1 data for ${p} — check R2 credentials / local parquet cache`);
    closesByPair[p] = dailyClosesFrom(packed).filter(d => d.date >= dateFrom && (!dateTo || d.date <= dateTo));
    log.push({ pair: p, days: closesByPair[p].length });
  }
  return { closesByPair, log };
}

// Everything the book walk needs, built once: aligned closes, currency returns,
// sleeve trades → daily positions (y2, y10, combined at ½ each), the OOS split.
// Shared by the audit (runBookFactorAudit) and the forward tracker
// (bookForwardEngine.js) so both see the SAME books from the SAME code.
// opts.trades = { y2: [...], y10: [...] } bypasses FRED (tests / offline runs).
// opts.dropFromDate = 'YYYY-MM-DD' drops that date and later (an incomplete day).
export async function prepareBookInputs(opts = {}) {
  const cfg = { ...BOOK_SLEEVE_CONFIG, ...(opts.sleeveConfig || {}) };
  const { closesByPair, log } = await loadMajorCloses({ dateFrom: cfg.dateFrom, dateTo: cfg.dateTo });
  if (opts.dropFromDate) for (const p of Object.keys(closesByPair)) closesByPair[p] = closesByPair[p].filter(d => d.date < opts.dropFromDate);
  const aligned = alignCloses(closesByPair);
  const cr = currencyReturns(aligned);

  let trades = opts.trades, splitDate = opts.splitDate || null;
  const sleeveSummary = {};
  if (!trades) {
    trades = {};
    for (const tenor of ['y2', 'y10']) {
      const book = await runSpreadBook(tenor, cfg);
      trades[tenor] = book.trades;
      sleeveSummary[tenor] = {
        nTrades: book.trades.length, splitDate: book.combined.splitDate,
        engineOosSharpe: book.combined.portfolioSharpe?.oos ?? null,
        engineAllSharpe: book.combined.portfolioSharpe?.all ?? null, log: book.log,
      };
      if (tenor === 'y2') splitDate = book.combined.splitDate;   // the validated sleeve's own OOS start
    }
  }
  const pos = {};
  for (const [nm, tr] of Object.entries(trades)) pos[nm] = positionsAfterClose(tr, aligned.dates);
  // equal-risk combined book (MULTI_SPREAD_SLEEVE.md Bar B convention: each leg at half size)
  if (pos.y2 && pos.y10) {
    pos.combined = pos.y2.map((a, i) => {
      const out = {};
      for (const [p, v] of Object.entries(a)) out[p] = (out[p] || 0) + 0.5 * v;
      for (const [p, v] of Object.entries(pos.y10[i])) out[p] = (out[p] || 0) + 0.5 * v;
      return out;
    });
  }
  // flat trade list tagged by sleeve, for the sized system backtest (bookSystem.js)
  const tradeList = Object.entries(trades).flatMap(([sleeve, tr]) => (tr || []).map(t => ({ ...t, sleeve })));
  return { cfg, log, aligned, cr, pos, splitDate, sleeveSummary, trades: tradeList };
}

export async function runBookFactorAudit(opts = {}) {
  const { cfg, log, aligned, cr, pos, splitDate, sleeveSummary } = await prepareBookInputs(opts);
  const costOneWay = Object.fromEntries(Object.keys(USD_MAJORS).map(p => [p, opts.costOneWay ?? BOOK_COST_ONE_WAY]));
  const res = runBookLayer({
    ...cr, books: pos, splitDate, costOneWay, K: opts.K ?? 'auto', shadowResidual: opts.shadowResidual !== false,
  });
  return {
    ...publicBookResult(res),
    config: cfg, costOneWay: opts.costOneWay ?? BOOK_COST_ONE_WAY,
    data: { closes: log, alignedDays: aligned.dates.length, from: aligned.dates[0], to: aligned.dates[aligned.dates.length - 1] },
    sleeves: sleeveSummary,
  };
}
