// Bennett-style yield-spread mean-reversion — pure core (no I/O, no network).
//
// Replicates the ACTUAL mechanism on Bennett's dashboard (confirmed from a screenshot):
// the signal is the US-vs-foreign 2Y yield-SPREAD z-score. Enter when |z| is extreme
// (≥ entryThreshold, his 2.75), in the z-direction; the trade bets the spread MEAN-
// REVERTS and the FX follows. Exit when z reverts toward the mean (|z| ≤ zExit, his
// 1.5) or a max-hold cap. NO price levels — the z-threshold IS the trigger. Position
// is sized by z-tier (1× / 1.5× / 2× at deeper extremes).
//
// Direction: z>0 → spread above mean → reverts down → USD softer → LONG the pair;
// z<0 → SHORT (matches the dashboard: EURUSD z=−5.534 → SHORT). `inverted` flips it
// for pairs whose sign is unconfirmed.
//
// Daily-close resolution: the z-signal is daily, trades hold days, so we enter/exit on
// daily closes and mark the FX return over the hold — no intrabar TP/SL path assumed
// (CLAUDE.md anti-pattern). The z-tier SIZING is A/B'd (flat vs sized) to test Bennett's
// "size up at extremes" rule directly against our z-tier-decay finding.
//
// Pure + unit-tested (js/bennettZCore.test.mjs); the real run needs FRED + M1 on Railway.

import { splitByDate } from './macroDirectionCore.js';
export { splitByDate };

export const BENNETT_DEFAULTS = {
  entryThreshold: 2.75,   // |z| to enter (Bennett's ±2.75)
  zExit:          1.5,    // |z| to exit on reversion (Bennett's ±1.5)
  maxHoldDays:    20,     // hard time stop if z never reverts
  costPct:        0.02,   // round-trip cost, % of notional
  splitFrac:      0.6,
  // size multiplier by |z| tier (largest tier whose z ≤ |z|); Bennett's ladder
  tiers: [{ z: 2.75, size: 1 }, { z: 3.75, size: 1.5 }, { z: 4.5, size: 2 }],
};

const sgn = x => (x > 0 ? 1 : x < 0 ? -1 : 0);

export function directionFromZ(z, inverted = false) {
  const d = z > 0 ? 'LONG' : 'SHORT';
  return inverted ? (d === 'LONG' ? 'SHORT' : 'LONG') : d;
}

// Resolve the direction inversion for a pair. The spread = US − foreign, and the raw
// rule z>0→LONG is only correct when the PAIR moves WITH the USD — i.e. USD is the base
// (USDJPY). For USD-QUOTE pairs (EURUSD, GBPUSD, AUDUSD) "pair up" = "USD down", so the
// sign must flip. `usdRoleVal` = +1 (USD base) / −1 (USD quote) / 0. `autoOrient` applies
// this economic convention (default on; validated against USDJPY being the confirmed
// correct sign); `manualInvert` flips further for an explicit A/B. Returns a boolean.
export function resolveInverted(usdRoleVal, { autoOrient = true, manualInvert = false } = {}) {
  const quoteUsd = usdRoleVal < 0;
  return (autoOrient && quoteUsd) !== !!manualInvert;   // XOR
}

// Size multiplier for a given |z| (0 if below entry threshold).
export function zTierSize(absZ, tiers = BENNETT_DEFAULTS.tiers) {
  let size = 0;
  for (const t of tiers) if (absZ >= t.z) size = t.size;
  return size;
}
export function zTierLabel(absZ, tiers = BENNETT_DEFAULTS.tiers) {
  let lbl = '<entry';
  for (const t of tiers) if (absZ >= t.z) lbl = `${t.z}+`;
  return lbl;
}

// Exit decision given the current |z| and days held.
export function shouldExit(absZ, holdDays, { zExit = 1.5, maxHoldDays = 20 } = {}) {
  if (absZ <= zExit) return { exit: true, reason: 'z-revert' };
  if (holdDays >= maxHoldDays) return { exit: true, reason: 'max-hold' };
  return { exit: false, reason: null };
}

// Signed FX return of a directional trade (fraction).
export function tradeReturn(dir, entryClose, exitClose) {
  if (!(entryClose > 0)) return 0;
  const raw = (exitClose - entryClose) / entryClose;
  return dir === 'LONG' ? raw : -raw;
}

const isWeekday = dt => { const g = dt.getUTCDay(); return g !== 0 && g !== 6; };

// HONEST portfolio Sharpe: distribute each trade's cost-inclusive return evenly across
// the WEEKDAYS it was held, sum concurrent positions per day, then Sharpe on the daily
// series INCLUDING flat (no-position) days, ×√252. This is the real risk-adjusted number
// for a rare-signal strategy — unlike per-trade-Sharpe×√(trades/yr), which ignores that
// capital sits idle between trades and overstates (the ENTRY_ZONE_CONFIDENCE.md trap).
export function portfolioDailySharpe(trades, { costPct = 0.02, periodsPerYear = 252 } = {}) {
  if (!trades.length) return 0;
  const cost = costPct / 100;
  const daily = new Map();   // epochMs → summed daily return
  let gMin = Infinity, gMax = -Infinity;
  for (const t of trades) {
    if (!t.exitDate) continue;
    const ret = (tradeReturn(t.dir, t.entryClose, t.exitClose) - cost) * (t.size ?? 1);
    const days = [];
    for (let d = new Date(t.date + 'T00:00:00Z'), end = new Date(t.exitDate + 'T00:00:00Z'); d < end; d = new Date(d.getTime() + 86_400_000)) {
      if (isWeekday(d)) days.push(d.getTime());
    }
    if (!days.length) continue;
    const per = ret / days.length;
    for (const ms of days) { daily.set(ms, (daily.get(ms) || 0) + per); if (ms < gMin) gMin = ms; if (ms > gMax) gMax = ms; }
  }
  if (!isFinite(gMin)) return 0;
  const rets = [];
  for (let ms = gMin; ms <= gMax; ms += 86_400_000) { if (isWeekday(new Date(ms))) rets.push(daily.get(ms) || 0); }
  const n = rets.length;
  if (n < 2) return 0;
  const mean = rets.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  return sd > 0 ? +(mean / sd * Math.sqrt(periodsPerYear)).toFixed(2) : 0;
}

// Per-calendar-year breakdown (flat-sized, cost-inclusive) — is the edge broad across
// years or concentrated in one regime (e.g. the 2022-24 rate-divergence)?
export function perYearBreakdown(trades, { costPct = 0.02 } = {}) {
  const cost = costPct / 100;
  const out = {};
  for (const t of trades) {
    const y = String(t.date).slice(0, 4);
    const ret = tradeReturn(t.dir, t.entryClose, t.exitClose) - cost;
    (out[y] ??= { n: 0, wins: 0, totalRetPct: 0 });
    out[y].n++; if (ret > 0) out[y].wins++; out[y].totalRetPct += ret * 100;
  }
  for (const y in out) { out[y].winRate = +(out[y].wins / out[y].n * 100).toFixed(1); out[y].totalRetPct = +out[y].totalRetPct.toFixed(2); }
  return out;
}

// Summary over trades. Reports FLAT-sized and z-TIER-sized results side by side (the
// A/B on Bennett's sizing rule), the by-tier breakdown (the falsification of "extreme
// z = better"), and cost-inclusive risk stats. periodsPerYear scales the per-trade
// Sharpe by trade frequency (annualised on the actual trade rate).
export function summarizeBennett(trades, { costPct = 0.02, periodsPerYear = 26 } = {}) {
  const n = trades.length;
  if (!n) return { n: 0, winRate: 0, totalRetPct: 0, sharpe: 0, profitFactor: 0, expectancyPct: 0,
    sizedTotalRetPct: 0, sizedSharpe: 0, byTier: {} };
  const cost = costPct / 100;
  const flat = trades.map(t => tradeReturn(t.dir, t.entryClose, t.exitClose) - cost);
  const sized = trades.map((t, i) => flat[i] * (t.size ?? 1));

  const stats = (rets) => {
    const sum = rets.reduce((a, b) => a + b, 0);
    const mean = sum / rets.length;
    const sd = Math.sqrt(Math.max(0, rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length));
    return { total: sum, mean, sharpe: sd > 0 ? mean / sd * Math.sqrt(periodsPerYear) : 0 };
  };
  const f = stats(flat), s = stats(sized);
  const wins = flat.filter(r => r > 0).length;
  const gW = flat.filter(r => r > 0).reduce((a, b) => a + b, 0);
  const gL = Math.abs(flat.filter(r => r < 0).reduce((a, b) => a + b, 0));

  // by |z| tier (flat-sized) — does performance rise or DECAY with extremity?
  const byTier = {};
  for (const tier of ['2.75+', '3.75+', '4.5+']) {
    const idx = trades.map((t, i) => t.tierLabel === tier ? i : -1).filter(i => i >= 0);
    if (!idx.length) { byTier[tier] = { n: 0, winRate: 0, totalRetPct: 0, profitFactor: 0 }; continue; }
    const rr = idx.map(i => flat[i]);
    const w = rr.filter(r => r > 0).length;
    const gw = rr.filter(r => r > 0).reduce((a, b) => a + b, 0);
    const gl = Math.abs(rr.filter(r => r < 0).reduce((a, b) => a + b, 0));
    byTier[tier] = {
      n: rr.length,
      winRate: +(w / rr.length * 100).toFixed(1),
      totalRetPct: +(rr.reduce((a, b) => a + b, 0) * 100).toFixed(2),
      profitFactor: gl > 0 ? +(gw / gl).toFixed(2) : (gw > 0 ? 999 : 0),
    };
  }

  return {
    n,
    winRate: +(wins / n * 100).toFixed(1),
    totalRetPct: +(f.total * 100).toFixed(2),
    sharpe: +f.sharpe.toFixed(2),
    portfolioSharpe: portfolioDailySharpe(trades, { costPct, periodsPerYear: 252 }),
    profitFactor: gL > 0 ? +(gW / gL).toFixed(2) : (gW > 0 ? 999 : 0),
    expectancyPct: +(f.mean * 100).toFixed(4),
    sizedTotalRetPct: +(s.total * 100).toFixed(2),
    sizedSharpe: +s.sharpe.toFixed(2),
    byTier,
  };
}
