// Macro-Direction predictiveness — pure scoring core (no I/O, no network).
//
// THE QUESTION (falsification-first): does a macro DIRECTION call predict forward FX
// drift AT ALL — before we build any level entries or z-exits on top of it? If macro
// direction has no edge on these pairs, the whole "macro sets direction, levels time
// the entry, z-score exits" bot is built on sand, and we learn that cheaply here.
//
// This is NOT a trade engine. It scores, per pair per day, a macro direction from the
// REPLICATED, FX-directional macro factors (the two framework docs + CLAUDE.md agree
// these are the ones with evidence), then measures the forward H-day return in that
// direction. No levels, no fib, no z-gate — just "does macro lead price?".
//
// Factors (each a directional vote ∈ {−1,0,+1}, fixed principled windows — NOT tuned):
//   • carry — momentum of the 2Y rate differential (US2Y − foreign short). Widening in
//             the USD's favour → USD strong. THE replicated FX driver (docs: 2Y diffs
//             explain 50–80% of major-pair variance over the medium term).
//   • real  — momentum of the US 10Y real yield (DFII10). Rising real yield → USD strong.
//   • risk  — momentum of VIX. Rising (risk-off) → the higher-haven leg strengthens.
//
// The score is the mean of the available votes ∈ [−1,+1]; position = sign(score). Every
// factor is reported standalone too, so we see if e.g. carry alone leads even if the
// blend doesn't. Pure + unit-tested (js/macroDirectionCore.test.mjs); the real run needs
// live FRED + M1 on Railway.

// Safe-haven ranking (higher = stronger haven, bid in risk-off). USD is a haven but JPY/
// CHF are stronger; commodity currencies are risk-on.
export const CURRENCY_HAVEN = { jpy: 2, chf: 2, usd: 1, eur: 0, gbp: 0, cad: -1, aud: -1, nzd: -1 };

export const MACRO_DIR_DEFAULTS = {
  changeWindow: 30,   // calendar-day lookback for factor momentum (~1 month / policy cycle)
  horizons:     [1, 5, 20],   // forward-return horizons (trading days) to test
  costPct:      0.02, // round-trip cost as % of notional (majors ~0.5–1 pip)
  splitFrac:    0.6,  // IS fraction; headline is the OOS tail
  weights:      { carry: 1, real: 1, risk: 1 },   // equal — no tuning
};

// ── Pair geometry ─────────────────────────────────────────────────────────────────
export function pairLegs(pairKey) {
  const k = String(pairKey || '').toLowerCase();
  return { base: k.slice(0, 3), quote: k.slice(3, 6) };
}
// +1 USD is the base (USDJPY: USD strong → pair up), −1 USD is the quote (EURUSD: USD
// strong → pair down), 0 if neither.
export function usdRole(pairKey) {
  const { base, quote } = pairLegs(pairKey);
  if (base === 'usd') return 1;
  if (quote === 'usd') return -1;
  return 0;
}
// haven(base) − haven(quote): >0 means the base is the stronger haven, so risk-off lifts
// the pair; <0 means risk-off sinks it.
export function havenTilt(pairKey) {
  const { base, quote } = pairLegs(pairKey);
  return (CURRENCY_HAVEN[base] ?? 0) - (CURRENCY_HAVEN[quote] ?? 0);
}

// ── Directional votes (each → −1 / 0 / +1) ──────────────────────────────────────────
const sgn = x => (x > 0 ? 1 : x < 0 ? -1 : 0);

// Carry: a widening US-favoured 2Y differential lifts USD → orient by the pair's USD role.
export function carryVote(spreadChange, role) {
  if (!Number.isFinite(spreadChange) || !role) return null;
  return sgn(spreadChange) * role;
}
// Real rate: a rising US 10Y real yield lifts USD → orient by USD role.
export function realVote(realChange, role) {
  if (!Number.isFinite(realChange) || !role) return null;
  return sgn(realChange) * role;
}
// Risk: rising VIX (risk-off) lifts the higher-haven leg → orient by haven tilt.
export function riskVote(vixChange, tilt) {
  if (!Number.isFinite(vixChange) || !tilt) return null;
  return sgn(vixChange) * sgn(tilt);
}

// Combine available votes → [−1,+1]. Null votes drop out; weight 0 ablates a factor.
export function macroDirScore(votes = {}, weights = MACRO_DIR_DEFAULTS.weights) {
  const keys = ['carry', 'real', 'risk'];
  let num = 0, den = 0;
  for (const k of keys) {
    const w = weights[k] ?? 0;
    const v = votes[k];
    if (w > 0 && v != null) { num += w * v; den += w; }
  }
  return den > 0 ? num / den : 0;
}

// ── Forward-return alignment & stats ────────────────────────────────────────────────
export const forwardReturn = (c0, cH) => (Number.isFinite(c0) && Number.isFinite(cH) && c0 !== 0) ? (cH - c0) / c0 : null;

// Spearman rank correlation (cost-free "is there ANY signal" measure).
export function spearman(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  const rank = arr => {
    const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    const r = new Array(arr.length);
    for (let i = 0; i < idx.length;) {
      let j = i; while (j < idx.length && idx[j][0] === idx[i][0]) j++;
      const avg = (i + j - 1) / 2 + 1;
      for (let k = i; k < j; k++) r[idx[k][1]] = avg;
      i = j;
    }
    return r;
  };
  const rx = rank(xs.slice(0, n)), ry = rank(ys.slice(0, n));
  const mx = rx.reduce((a, b) => a + b, 0) / n, my = ry.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = rx[i] - mx, dy = ry[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return (sxx > 0 && syy > 0) ? sxy / Math.sqrt(sxx * syy) : 0;
}

// records: [{ date, score, fwdRet }] (non-overlapping H-day samples). Position = sign(score);
// strategy return = position × fwdRet − cost (only when a position is taken, score ≠ 0).
export function summarizeDirection(records, { costPct = 0.02, periodsPerYear = 52 } = {}) {
  const taken = records.filter(r => r.score !== 0 && Number.isFinite(r.fwdRet));
  const n = taken.length;
  if (!n) return { n: 0, positions: 0, hitRate: 0, meanRetPct: 0, sharpe: 0, corr: 0, totalRetPct: 0 };
  const cost = costPct / 100;
  let hits = 0, sum = 0, sumSq = 0, total = 0;
  for (const r of taken) {
    const pos = Math.sign(r.score);
    if (Math.sign(r.fwdRet) === pos) hits++;
    const ret = pos * r.fwdRet - cost;   // fraction
    sum += ret; sumSq += ret * ret; total += ret;
  }
  const mean = sum / n;
  const sd = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
  const sharpe = sd > 0 ? mean / sd * Math.sqrt(periodsPerYear) : 0;
  const corr = spearman(records.map(r => r.score), records.map(r => r.fwdRet ?? 0));
  return {
    n, positions: n,
    hitRate: +(hits / n * 100).toFixed(1),
    meanRetPct: +(mean * 100).toFixed(4),
    totalRetPct: +(total * 100).toFixed(2),
    sharpe: +sharpe.toFixed(2),
    corr: +corr.toFixed(3),
  };
}

// IS/OOS split by date (headline is OOS). Same convention as the z-score work.
export function splitByDate(records, splitFrac = 0.6) {
  if (!records.length) return { splitDate: null, is: [], oos: [] };
  const dates = [...new Set(records.map(r => r.date))].sort();
  const splitDate = dates[Math.min(dates.length - 1, Math.floor(dates.length * splitFrac))];
  return {
    splitDate,
    is:  records.filter(r => r.date <  splitDate),
    oos: records.filter(r => r.date >= splitDate),
  };
}
