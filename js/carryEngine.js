/**
 * Carry Engine — the HONEST FX carry factor. Long high-rate currencies, short
 * low-rate ones (vs a USD funding leg), sized by inverse volatility (equal risk
 * budget), rebalanced periodically, net of cost, IS/OOS. This is the replicated
 * carry premium (Lustig-Verdelhan; the "carry trade" of the FX literature) — a
 * modest, crash-prone diversifier, NOT a wealth engine.
 *
 * ── Why this replaces the spot-proxy (`system-fx-carry.html`) ─────────────────
 * A carry return is made of TWO parts and the old proxy had neither right:
 *
 *     total_return  =  spot_return  +  carry_accrual
 *     carry_accrual ≈  (rate_ccy − rate_funding) / 100 / 252   per day held
 *
 *   1. SIGNAL — the old page used a credit z-score and HARD-CODED long GBPJPY/
 *      AUDJPY/NZDJPY. That never responds to rates. Carry's signal IS the rate
 *      differential; here `sign(rate_ccy − rate_USD)` per currency, so it flips
 *      when a central bank cuts (e.g. RBA 7%→0.1%).
 *   2. RETURN — the old page measured PURE SPOT price return and dropped the
 *      accrual entirely — i.e. it ignored the whole economic point of carry.
 *      Here the accrual is added explicitly and REPORTED SEPARATELY so you can
 *      see how much of the edge is spot vs carry (the honest disaggregation).
 *
 * ── Honesty caveat (state it on every result) ────────────────────────────────
 * The accrual is computed at INTERBANK rates (FRED 3-month series). A retail
 * broker charges a spread on swap, so your REAL tradeable carry is worse than
 * this backtest. The live OANDA-financing reconciliation (server route) measures
 * that haircut; treat this engine's number as an interbank UPPER BOUND.
 *
 * Pure & offline-testable — the caller fetches prices + rates and passes them in.
 * Reuses `statsCore` (moments) and `metricsCore` (Sharpe, drawdown). No net/DOM.
 * No-lookahead: the position held into day i is decided from data through i−1,
 * and the accrual over day i uses the rate known at i−1.
 */

import { mean, stdev } from './statsCore.js';
import { sharpeRatio, maxDrawdownFromEquity } from './metricsCore.js';

// ── Alignment ────────────────────────────────────────────────────────────────
// Prices: { EUR:[{t,v}], JPY:[{t,v}], … } — daily close of 1 unit ccy in USD
// (so a long position is long-ccy / short-USD; the caller orients USD_JPY etc).
// Inner-join on common dates so every column is defined on the same calendar.
export function alignSeries(seriesByCcy) {
  const ccys = Object.keys(seriesByCcy);
  if (!ccys.length) return { dates: [], cols: {}, ccys };
  const maps = ccys.map(c => new Map(seriesByCcy[c].map(p => [p.t, p.v])));
  const dates = [...maps[0].keys()]
    .filter(t => maps.every(m => m.has(t) && Number.isFinite(m.get(t))))
    .sort();
  const cols = {};
  ccys.forEach((c, i) => { cols[c] = dates.map(t => maps[i].get(t)); });
  return { dates, cols, ccys };
}

// Forward-fill a sparse {t → rate%} map onto a master date array. Rates print
// monthly (OECD) and lag; carrying the last known rate forward over gaps is the
// no-lookahead choice (never reaches past `d`).
export function forwardFillRates(dates, rateSeries) {
  const keys = [...rateSeries.keys()].sort();
  let ptr = -1, last = NaN;
  return dates.map(d => {
    while (ptr + 1 < keys.length && keys[ptr + 1] <= d) { ptr++; last = rateSeries.get(keys[ptr]); }
    return last;
  });
}

// ── small helpers ─────────────────────────────────────────────────────────────
function sampleEquity(dates, eq, target) {
  const n = eq.length;
  if (n <= target) return dates.map((d, i) => ({ t: d, v: +eq[i].toFixed(4) }));
  const step = (n - 1) / (target - 1), out = [];
  for (let k = 0; k < target; k++) { const i = Math.round(k * step); out.push({ t: dates[i], v: +eq[i].toFixed(4) }); }
  return out;
}
function perYearReturns(dates, portRet) {
  const byYear = {};
  for (let i = 0; i < dates.length; i++) { const y = dates[i].slice(0, 4); byYear[y] = (byYear[y] || 0) + portRet[i]; }
  return Object.entries(byYear).map(([year, r]) => ({ year, ret: +((Math.exp(r) - 1) * 100).toFixed(1) }));
}
// Metrics on a daily LOG-return series (annualised where relevant).
function stats(r) {
  const sh = sharpeRatio(r, 252);
  const e = []; let c = 0; for (const x of r) { c += x; e.push(Math.exp(c)); }
  const dd = maxDrawdownFromEquity(e);
  const cagr = r.length > 1 ? Math.exp(mean(r) * 252) - 1 : 0;
  const vol = stdev(r, 0) * Math.sqrt(252);
  const nz = r.filter(x => x !== 0);
  const win = nz.length ? nz.filter(x => x > 0).length / nz.length : 0;
  return {
    days: r.length,
    sharpe: +sh.toFixed(2), cagr: +(cagr * 100).toFixed(1), vol: +(vol * 100).toFixed(1),
    maxDD: +(dd * 100).toFixed(1), calmar: dd < 0 ? +(cagr / -dd).toFixed(2) : 0,
    winRate: +(win * 100).toFixed(1),
  };
}
// Annualised mean of a daily arithmetic contribution series → % (for decomposition).
const annPct = arr => +(mean(arr) * 252 * 100).toFixed(2);

// ── Carry basket backtest ──────────────────────────────────────────────────────
// priceByCcy : { EUR:[{t,v}], … }  daily close of 1 ccy in USD (long = long ccy/USD)
// rateByCcy  : { USD:Map<t,rate%>, EUR:Map<t,rate%>, … } short rates, ANNUAL %
// Returns total/spot-only/IS/OOS stats + the spot-vs-carry decomposition.
export function runCarryBasket(priceByCcy, rateByCcy, {
  fundingCcy = 'USD', volWindow = 60, targetVol = 0.10, rebalDays = 21,
  costBps = 2, isFrac = 0.7, signalMode = 'sign',   // 'sign' | 'diff' (magnitude-weighted)
} = {}) {
  const { dates, cols, ccys } = alignSeries(priceByCcy);
  const n = dates.length;
  const fundRate = rateByCcy[fundingCcy];
  if (!fundRate) return { error: `funding-currency rate '${fundingCcy}' missing` };
  // keep only ccys that have BOTH price and rate history
  const active = ccys.filter(c => c !== fundingCcy && rateByCcy[c] && rateByCcy[c].size);
  const nC = active.length;
  if (n < volWindow + 60 || nC < 2) return { error: `insufficient data (${n} days, ${nC} rated ccys)`, nDays: n, ccys: active };

  // Forward-filled rate columns (annual %), incl. the funding leg.
  const rCol = { [fundingCcy]: forwardFillRates(dates, fundRate) };
  for (const c of active) rCol[c] = forwardFillRates(dates, rateByCcy[c]);

  // Daily log spot returns per ccy vs USD.
  const spotRet = {};
  for (const c of active) {
    const p = cols[c], r = new Array(n).fill(0);
    for (let i = 1; i < n; i++) r[i] = p[i - 1] > 0 && p[i] > 0 ? Math.log(p[i] / p[i - 1]) : 0;
    spotRet[c] = r;
  }

  const perCcyRisk = targetVol / Math.sqrt(nC);   // equal risk budget, ~uncorrelated
  let weights = Object.fromEntries(active.map(c => [c, 0]));
  const spotComp = new Array(n).fill(0);   // Σ w·spotRet   (price P&L)
  const carryComp = new Array(n).fill(0);  // Σ w·accrual   (interest earned/paid)
  const costComp = new Array(n).fill(0);   // −turnover·cost

  for (let i = 1; i < n; i++) {
    if ((i - 1) % rebalDays === 0 && i - 1 >= volWindow) {   // rebalance on data ≤ i-1 (no lookahead)
      const newW = {}; let turnover = 0;
      for (const c of active) {
        const diff = rCol[c][i - 1] - rCol[fundingCcy][i - 1];     // rate differential, % (annual)
        if (!Number.isFinite(diff)) { newW[c] = weights[c] || 0; continue; }
        const sig = signalMode === 'diff' ? diff / 5 : Math.sign(diff);   // /5 ≈ normalise a ~5% spread to ~1
        const win = spotRet[c].slice(i - 1 - volWindow, i - 1).filter(Number.isFinite);
        const vol = stdev(win, 0) * Math.sqrt(252);
        const w = vol > 1e-6 ? sig * perCcyRisk / vol : 0;
        newW[c] = w; turnover += Math.abs(w - (weights[c] || 0));
      }
      costComp[i] -= turnover * (costBps / 10000);
      weights = newW;
    }
    for (const c of active) {
      const w = weights[c] || 0;
      if (!w) continue;
      spotComp[i]  += w * spotRet[c][i];
      // accrual earned over day i uses the rate known at i-1 (no lookahead)
      const diff = rCol[c][i - 1] - rCol[fundingCcy][i - 1];
      if (Number.isFinite(diff)) carryComp[i] += w * (diff / 100 / 252);
    }
  }

  const total    = spotComp.map((s, i) => s + carryComp[i] + costComp[i]);
  const spotOnly = spotComp.map((s, i) => s + costComp[i]);   // the old proxy's world: no accrual
  const eq = []; { let c = 0; for (let i = 0; i < n; i++) { c += total[i]; eq.push(Math.exp(c)); } }
  const split = Math.floor(n * isFrac);

  const current = active.map(c => ({
    ccy: c,
    rate: +(_last(rCol[c]) ?? NaN).toFixed(2),
    diffVsUSD: +((_last(rCol[c]) - _last(rCol[fundingCcy])) || 0).toFixed(2),
    position: Math.sign(_last(rCol[c]) - _last(rCol[fundingCcy])) > 0 ? 'long' : 'short',
  })).sort((a, b) => b.diffVsUSD - a.diffVsUSD);

  return {
    params: { fundingCcy, volWindow, targetVol, rebalDays, costBps, isFrac, signalMode },
    ccys: active, nDays: n, first: dates[0], last: dates[n - 1],
    all: stats(total), is: stats(total.slice(0, split)), oos: stats(total.slice(split)),
    spotOnly: stats(spotOnly),               // strategy with SAME positions but no carry accrual
    // Honest disaggregation: how much annualised return comes from each leg.
    decomposition: {
      totalAnnPct: annPct(total),
      spotAnnPct:  annPct(spotComp),
      carryAnnPct: annPct(carryComp),        // the piece the old proxy threw away
      costAnnPct:  annPct(costComp),
    },
    equity: sampleEquity(dates, eq, 400),
    perYear: perYearReturns(dates, total),
    current,
  };
}

function _last(a) { for (let i = a.length - 1; i >= 0; i--) if (Number.isFinite(a[i])) return a[i]; return NaN; }

// ── Live retail-swap haircut (pure; the route supplies OANDA financing) ────────
// synthetic: [{ pair, ccy, interbankDiffPct }]  — annual interbank differential
// financing: { 'EUR_USD': { longRate, shortRate }, … }  — OANDA annual financing
//   (decimals; longRate is what a LONG position earns, negative = you pay).
// Returns per-pair haircut = interbank carry the theory assumes − what OANDA pays.
export function financingHaircut(synthetic, financing) {
  const rows = [];
  for (const s of synthetic) {
    const f = financing?.[s.pair];
    if (!f) { rows.push({ ...s, oandaLongPct: null, oandaShortPct: null, haircutPct: null }); continue; }
    const longPct  = Number.isFinite(f.longRate)  ? f.longRate  * 100 : NaN;
    const shortPct = Number.isFinite(f.shortRate) ? f.shortRate * 100 : NaN;
    // Carry position: long the pair if ccy out-yields USD, else short. Compare the
    // financing you'd actually receive on that side to the interbank differential.
    const longSide = s.interbankDiffPct >= 0;
    const oandaCarryPct = longSide ? longPct : -shortPct;   // what you net from OANDA on the carry side
    const haircut = Number.isFinite(oandaCarryPct) ? +(Math.abs(s.interbankDiffPct) - oandaCarryPct).toFixed(2) : null;
    rows.push({
      pair: s.pair, ccy: s.ccy,
      interbankDiffPct: +s.interbankDiffPct.toFixed(2),
      oandaLongPct: Number.isFinite(longPct) ? +longPct.toFixed(2) : null,
      oandaShortPct: Number.isFinite(shortPct) ? +shortPct.toFixed(2) : null,
      oandaCarryPct: Number.isFinite(oandaCarryPct) ? +oandaCarryPct.toFixed(2) : null,
      haircutPct: haircut,
    });
  }
  const valid = rows.filter(r => Number.isFinite(r.haircutPct));
  const avgHaircut = valid.length ? +(valid.reduce((s, r) => s + r.haircutPct, 0) / valid.length).toFixed(2) : null;
  return { rows, avgHaircutPct: avgHaircut, note: 'haircut = |interbank differential| − OANDA financing on the carry side (annual %). Positive = broker keeps this much of the theoretical carry.' };
}
