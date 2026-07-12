/**
 * Honest-Policy Portfolio — COG's SELECTION, on our HONEST 1-min fills.
 *
 * The tearsheet's "Complete Book" (~+290%, smooth) is NOT the blind fade (that
 * loses at every resolution — see fillRealismEngine). It is the blind fade PLUS
 * two ingredients: (1) a per-cell SELECTION — learn fade/follow/skip on the
 * in-sample half, trade only the winners OOS; (2) a MULTI-PAIR PORTFOLIO netting
 * many streams into one curve. This reproduces BOTH ingredients but keeps the
 * fills honest (real 1-min TP/SL touch order via the shared walkBars — no
 * favourable mark-to-close, no broken-timestamp zero-duration trades).
 *
 * Per instrument, each session yields four candidate cells (fade/follow × up/dn),
 * priced by the report's own simulateEntry on 1-min bars. The policy keeps a cell
 * only if its IN-SAMPLE after-cost expectancy clears a margin; the kept cells are
 * summed per OOS session into that instrument's daily stream. The route nets all
 * instruments into a portfolio equity curve.
 *
 * Pre-registered read: if the honest portfolio curve is flat/negative, COG's
 * selection needs the optimistic marking to exist — the fireworks are the fills.
 * If it rises, the selection is a real conditional edge and we adopt it.
 *
 * Pure; reuses computeBands + simulateEntry + volSigmaSeries + sessionsAt. No new
 * math, no fill-walker copy.
 */
import { computeBands, simulateEntry, volSigmaSeries } from './forecastCore.js';
import { summarizeTrades } from './metricsCore.js';
import { costForPair, DEFAULT_SLIP_PCT } from './perLineStrategy.js';
import { sessionsAt } from './fillRealismEngine.js';

const r3 = (x, d = 3) => x == null || !isFinite(x) ? null : +x.toFixed(d);
const _mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;

// The four per-session candidate cells: {action} × {side}. Each priced by the
// report's simulateEntry (honest walkBars) — single-sided so the cell is isolated.
const CELLS = [
  { key: 'fade_up', action: 'fade', dir: 'up' },
  { key: 'fade_dn', action: 'fade', dir: 'down' },
  { key: 'follow_up', action: 'follow', dir: 'up' },
  { key: 'follow_dn', action: 'follow', dir: 'down' },
];

// Approach-velocity bucket at the fill — COG's `line × approach-velocity` cell
// dimension (the Crabel "stretch"). Speed of the move INTO the level over the
// last `velWin` bars, in daily-σ units → fast-spike / medium / slow-grind.
// Reuses the same defaults as the live analyser (velWin 15, velFast 0.60σ).
function _velBucket(bars, idxByTime, fillTime, open, sigma, velWin, velFast, velSlow) {
  const idx = idxByTime.get(fillTime);
  if (idx == null || !(sigma > 0) || !(open > 0)) return 'na';
  const start = Math.max(0, idx - velWin);
  const vel = Math.abs(bars[idx].close - bars[start].close) / (open * sigma);   // σ-units
  return vel >= velFast ? 'fast' : vel <= velSlow ? 'slow' : 'med';
}

export function honestPolicy(bars, opts = {}) {
  const {
    pair = 'EURUSD', assetClass = 'fx', isFrac = 0.5, band = 'hl75', slMult = 1.5,
    boundaryHour = 22, warmup = 40, minCellTrades = 30, marginPct = 0,
    conditionOnVel = true, velWin = 15, velFast = 0.60, velSlow = 0.25,
  } = opts;
  const costPct = opts.costPct ?? costForPair(pair, assetClass);
  const slipPct = opts.slipPct ?? (DEFAULT_SLIP_PCT[assetClass] ?? 0.006);

  const sess = sessionsAt(bars, boundaryHour);
  if (sess.length < 160) return { insufficient: true, nSessions: sess.length };
  const d1 = sess.map(s => ({ open: s.open, high: s.high, low: s.low, close: s.close }));
  const sig = volSigmaSeries(d1, assetClass);
  const split = Math.floor(sess.length * isFrac);

  // Per-cell trade streams. With conditionOnVel the cell is (action × dir × vel-bucket)
  // — COG's line×approach-velocity design; otherwise the coarse (action × dir) cell.
  const perCell = new Map();   // cellKey → { action, dir, velBucket, trades:[{i,date,pnl}] }
  const push = (action, dir, velBucket, rec) => {
    const key = conditionOnVel ? `${action}_${dir}_${velBucket}` : `${action}_${dir}`;
    if (!perCell.has(key)) perCell.set(key, { key, action, dir, velBucket: conditionOnVel ? velBucket : 'all', trades: [] });
    perCell.get(key).trades.push(rec);
  };
  for (let i = warmup; i < sess.length; i++) {
    const sigma = sig[i];
    if (!(sigma > 0)) continue;
    const s = sess[i];
    if (!s.bars || s.bars.length < 3 || !(s.open > 0)) continue;
    const bands = computeBands(s.open, sigma, assetClass);
    const idxByTime = conditionOnVel ? new Map(s.bars.map((b, k) => [b.time, k])) : null;
    for (const c of CELLS) {
      const r = simulateEntry({ open: s.open, bars: s.bars }, bands,
        { band, action: c.action, dir: c.dir, slMult, costPct, slipPct, dynamicHL: true });
      if (!r.filled) continue;
      const vb = conditionOnVel ? _velBucket(s.bars, idxByTime, r.fillTime, s.open, sigma, velWin, velFast, velSlow) : 'all';
      push(c.action, c.dir, vb, { i, date: s.date, pnl: r.pnlPct });
    }
  }

  // Learn the policy on IS: keep a cell only if its IS after-cost expectancy > margin
  // with enough IS trades. (COG's "trade only in-sample-profitable cells" rule.)
  const kept = [];
  for (const c of perCell.values()) {
    const isT = c.trades.filter(t => t.i < split);
    if (isT.length < minCellTrades) continue;
    const exp = _mean(isT.map(t => t.pnl));
    if (exp > marginPct) kept.push({ key: c.key, action: c.action, dir: c.dir, velBucket: c.velBucket, isExp: r3(exp, 4), isTrades: isT.length });
  }

  // Apply OOS: per session, sum the kept cells that fired that day (a portfolio of
  // cells within the instrument). Also keep the unselected "trade-all" stream for
  // contrast (the naive no-selection book).
  const oosByDate = new Map(), allByDate = new Map();
  const keptKeys = new Set(kept.map(c => c.key));
  for (const c of perCell.values()) {
    for (const t of c.trades) {
      if (t.i < split) continue;
      allByDate.set(t.date, (allByDate.get(t.date) || 0) + t.pnl);
      if (keptKeys.has(c.key)) oosByDate.set(t.date, (oosByDate.get(t.date) || 0) + t.pnl);
    }
  }
  const toStream = m => { const dates = [...m.keys()].sort(); return { dates, pnls: dates.map(d => m.get(d)) }; };
  const sel = toStream(oosByDate), all = toStream(allByDate);
  const selSum = summarizeTrades(sel.pnls, sel.dates);
  const allSum = summarizeTrades(all.pnls, all.dates);

  return {
    pair, assetClass, costPct, slipPct, isFrac, band, slMult, conditionOnVel,
    nSessions: sess.length, splitDate: sess[split]?.date, nCells: perCell.size,
    keptCells: kept, nKept: kept.length,
    // OOS daily streams (net %), for the portfolio aggregation + equity curve.
    selected: { sharpe: selSum.sharpe, days: sel.pnls.length, expectancy: r3(selSum.expectancy, 4), byDate: sel.dates.map((d, k) => ({ date: d, pnl: r3(sel.pnls[k], 5) })) },
    all: { sharpe: allSum.sharpe, days: all.pnls.length, expectancy: r3(allSum.expectancy, 4) },
  };
}

// Net many instruments' OOS daily streams into ONE portfolio equity curve (equal
// weight, simple returns, no compounding — matches COG's "Complete Book" basis).
// streamsByPair: { PAIR: [{date, pnl}] }. Returns curve points + portfolio Sharpe.
export function netPortfolio(streamsByPair) {
  const byDate = new Map();
  for (const [, stream] of Object.entries(streamsByPair)) {
    for (const { date, pnl } of stream || []) {
      if (pnl == null) continue;
      if (!byDate.has(date)) byDate.set(date, { sum: 0, n: 0 });
      const c = byDate.get(date); c.sum += pnl; c.n += 1;
    }
  }
  const dates = [...byDate.keys()].sort();
  const daily = dates.map(d => { const c = byDate.get(d); return c.sum / Math.max(c.n, 1); });  // equal-weight avg cell return
  const m = _mean(daily);
  let v = 0; for (const x of daily) v += (x - m) * (x - m); v /= Math.max(daily.length, 1);
  const sd = Math.sqrt(v);
  const yrs = dates.length ? Math.max((Date.parse(dates.at(-1)) - Date.parse(dates[0])) / (365.25 * 864e5), 0.25) : 1;
  const perYr = dates.length / yrs;
  const sharpe = sd > 1e-12 ? r3((m / sd) * Math.sqrt(perYr), 2) : 0;
  let cum = 0; const curve = dates.map((d, k) => { cum += daily[k]; return { date: d, cum: r3(cum, 3) }; });
  // max drawdown of the cumulative (%-of-start) curve
  let peak = 0, mdd = 0; for (const p of curve) { if (p.cum > peak) peak = p.cum; const dd = p.cum - peak; if (dd < mdd) mdd = dd; }
  return {
    days: dates.length, dateFrom: dates[0] ?? null, dateTo: dates.at(-1) ?? null,
    sharpe, totalReturnPct: r3(cum, 2), maxDrawdownPct: r3(mdd, 2),
    meanDaily: r3(m, 5), curve,
  };
}
