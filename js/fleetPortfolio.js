/**
 * Phases 27-28: the portfolio researcher and the risk researcher, on the bot fleet (plans/DESK_ANALYST_PIPELINE.md
 * §9ab). The risk manager (Phase 11, js/deskRisk.js) looks at one morning book; this looks at the bots together, the
 * way a fund looks at its sleeves:
 *   - each bot's daily result (in R by default: account profit depends on lot size), its Sharpe, drawdown and hit rate
 *   - how the bots move together (correlation of daily results) and the effective number of independent bots
 *   - weights: equal, inverse-volatility and equal risk contribution (risk parity), and each bot's capped half-Kelly
 *     risk per trade from its own R record
 *   - what each bot adds: the fleet's Sharpe with and without it
 *   - risk: historical VaR and expected shortfall of the fleet day, a bootstrap of fleet days for the drawdown it could
 *     have, and the pairs whose recent correlation broke away from their full-sample one
 *   - drift (the live monitor): a downward CUSUM on each bot's recent results against its own earlier record
 *
 * Description of the bots' own trades, not a test: every figure carries its count, and a bot with fewer than 20 trade
 * days is listed but not weighted. Pure. Tested in js/fleetPortfolio.test.mjs.
 */
import { londonParts } from './deskJournal.js';
import { tradeMonteCarlo, cusum } from './validationDesk.js';

const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const sd = a => { if (a.length < 2) return NaN; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const r3 = x => (Number.isFinite(x) ? +x.toFixed(3) : null);
const corr = (a, b) => { const n = Math.min(a.length, b.length); if (n < 5) return NaN; const ma = mean(a.slice(0, n)), mb = mean(b.slice(0, n)); let sab = 0, sa = 0, sb = 0; for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; sa += x * x; sb += y * y; } return sa > 0 && sb > 0 ? sab / Math.sqrt(sa * sb) : NaN; };
const maxDD = s => { let p = 0, e = 0, d = 0; for (const x of s) { e += x; if (e > p) p = e; if (p - e > d) d = p - e; } return d; };

/** trades (js/deskJournal.js tradeRows) → aligned daily series per bot on the union of London close dates. */
export function dailySeries(trades, { unit = 'R' } = {}) {
  const by = new Map(), dates = new Set(), per = {};
  for (const t of trades ?? []) {
    const v = unit === 'profit' ? t.profit : t.R; if (!Number.isFinite(v)) continue;
    const d = t.closeMs ? londonParts(t.closeMs).date : t.date; if (!d) continue;
    dates.add(d); const k = `${t.bot}|${d}`; by.set(k, (by.get(k) ?? 0) + v); (per[t.bot] ??= []).push(v);
  }
  const D = [...dates].sort(), bots = Object.keys(per).sort();
  const series = Object.fromEntries(bots.map(b => [b, D.map(d => by.get(`${b}|${d}`) ?? 0)]));
  const active = Object.fromEntries(bots.map(b => [b, D.filter(d => by.has(`${b}|${d}`)).length]));
  return { dates: D, bots, series, perTrade: per, active };
}

/** Covariance matrix of the bots' daily series. */
const covMatrix = (bots, series) => bots.map(a => bots.map(b => { const x = series[a], y = series[b], ma = mean(x), mb = mean(y); let s = 0; for (let i = 0; i < x.length; i++) s += (x[i] - ma) * (y[i] - mb); return x.length > 1 ? s / (x.length - 1) : 0; }));

/** Equal risk contribution weights (risk parity) by the multiplicative fixed point; sums to 1. */
export function riskParity(cov, { iters = 500, tol = 1e-10 } = {}) {
  const n = cov.length; if (!n) return [];
  let w = cov.map((r, i) => (r[i] > 0 ? 1 / Math.sqrt(r[i]) : 0)); let s = w.reduce((a, b) => a + b, 0) || 1; w = w.map(x => x / s);
  for (let it = 0; it < iters; it++) {
    const mw = cov.map(r => r.reduce((a, c, j) => a + c * w[j], 0)), port = w.reduce((a, x, i) => a + x * mw[i], 0);
    if (!(port > 0)) break;
    const nw = w.map((x, i) => (mw[i] > 0 ? x * Math.sqrt(port / n / (x * mw[i] || 1e-18)) : x));
    s = nw.reduce((a, b) => a + b, 0) || 1;
    const next = nw.map(x => x / s), diff = next.reduce((a, x, i) => a + Math.abs(x - w[i]), 0); w = next;
    if (diff < tol) break;
  }
  return w;
}

/** Capped half-Kelly risk per trade (fraction of equity per 1R) from a list of R results. */
export function halfKelly(R, { cap = 0.02 } = {}) {
  const r = (R ?? []).filter(Number.isFinite); if (r.length < 20) return { ok: false, n: r.length, note: 'fewer than 20 trades' };
  const m = mean(r), v = sd(r) ** 2, full = v > 0 ? m / v : 0;
  return { ok: true, n: r.length, meanR: r3(m), full: r3(Math.max(0, full)), half: r3(Math.max(0, full / 2)), suggested: r3(Math.min(cap, Math.max(0, full / 2))), capped: full / 2 > cap };
}

/** Historical VaR and expected shortfall (as positive losses) at the given levels. */
export function varEs(x, levels = [0.95, 0.99]) {
  const s = (x ?? []).filter(Number.isFinite).sort((a, b) => a - b); if (s.length < 20) return null;
  return Object.fromEntries(levels.map(l => { const k = Math.max(1, Math.floor((1 - l) * s.length)); const tail = s.slice(0, k); return [String(l), { var: r3(-s[k - 1]), es: r3(-mean(tail)), n: s.length }]; }));
}

const sharpe = x => { const s = sd(x); return s > 0 ? (mean(x) / s) * Math.sqrt(252) : NaN; };

/** The fleet report. trades: tradeRows; minDays: trade days a bot needs to be weighted. */
export function fleetReport(trades, { unit = 'R', minDays = 20, recent = 20, seed = 0x9e3779b9 } = {}) {
  const { dates, bots, series, perTrade, active } = dailySeries(trades, { unit });
  const perBot = bots.map(b => { const s = series[b], R = perTrade[b];
    return { bot: b, trades: R.length, days: active[b], total: r3(R.reduce((a, x) => a + x, 0)), meanTrade: r3(mean(R)), hit: r3(R.filter(x => x > 0).length / R.length),
      sharpe: r3(sharpe(s)), maxDrawdown: r3(maxDD(s)), kelly: unit === 'R' ? halfKelly(R) : null, weighted: active[b] >= minDays }; });
  const W = bots.filter(b => active[b] >= minDays);
  const C = covMatrix(W, series), vol = W.map((_, i) => Math.sqrt(C[i][i]));
  const inv = vol.map(v => (v > 0 ? 1 / v : 0)), invS = inv.reduce((a, b) => a + b, 0) || 1, erc = riskParity(C);
  const weights = W.map((b, i) => ({ bot: b, equal: r3(1 / W.length), inverseVol: r3(inv[i] / invS), riskParity: r3(erc[i]) }));
  const fleetOf = (w, skip = null) => dates.map((_, t) => W.reduce((a, b, i) => (b === skip ? a : a + w[i] * series[b][t]), 0));
  const eqW = W.map(() => 1 / Math.max(1, W.length)), fleet = fleetOf(erc.length ? erc : eqW);
  const base = sharpe(fleetOf(eqW));
  const adds = W.map(b => { const w = W.map(x => (x === b ? 0 : 1 / Math.max(1, W.length - 1))); return { bot: b, fleetSharpeWithout: r3(sharpe(fleetOf(w))), adds: r3(base - sharpe(fleetOf(w))) }; });
  const corrRows = [], breaks = [];
  for (let i = 0; i < bots.length; i++) for (let j = i + 1; j < bots.length; j++) {
    const a = series[bots[i]], b = series[bots[j]], full = corr(a, b), rec = corr(a.slice(-recent), b.slice(-recent));
    corrRows.push({ a: bots[i], b: bots[j], full: r3(full), recent: r3(rec) });
    if (Number.isFinite(full) && Number.isFinite(rec) && Math.abs(rec - full) >= 0.4) breaks.push({ a: bots[i], b: bots[j], full: r3(full), recent: r3(rec) });
  }
  // effective number of independent bots: participation ratio of the correlation matrix eigenvalues, approximated by 1/Σρ² (Choueifaty) on the weighted set
  let s2 = 0; for (let i = 0; i < W.length; i++) for (let j = 0; j < W.length; j++) { const r = i === j ? 1 : corr(series[W[i]], series[W[j]]); s2 += Number.isFinite(r) ? r * r : 0; }
  const effN = W.length ? r3((W.length * W.length) / s2) : null;
  const drift = bots.map(b => { const R = perTrade[b]; if (R.length < 30) return { bot: b, ok: false, note: 'fewer than 30 trades' };
    const cut = Math.floor(R.length * 2 / 3), early = R.slice(0, cut), late = R.slice(cut), c = cusum(late, { target: mean(early), sigma: sd(early) || null });
    return { bot: b, ok: c.ok, earlyMean: r3(mean(early)), lateMean: r3(mean(late)), alarm: c.alarm, stat: c.stat }; });
  return { unit, days: dates.length, from: dates[0] ?? null, to: dates.at(-1) ?? null, bots: perBot, weighted: W, weights, adds, effN, correlations: corrRows, breaks,
    fleet: { sharpe: r3(sharpe(fleet)), maxDrawdown: r3(maxDD(fleet)), varEs: varEs(fleet), monteCarlo: tradeMonteCarlo(fleet.filter(x => x !== 0), { seed }) }, drift,
    label: 'description of the bots\' own trades, not a test; weights are what the record implies, not advice' };
}
