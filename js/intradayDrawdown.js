/**
 * intradayDrawdown — portfolio MARK-TO-MARKET drawdown that includes the two
 * things the closed-trade daily curve omits and which make the headline DD a
 * lower bound:
 *   (1) INTRATRADE adverse excursion (MAE) — a fade that runs most of the way to
 *       its stop before reverting to target is a "clean win" in closed PnL, but
 *       you were underwater while it was open;
 *   (2) CONCURRENCY — many positions open at once net to a single daily number, so
 *       simultaneous open-position drawdown is invisible.
 *
 * Each trade is modelled by a 3-point unrealised-PnL path anchored on its ACTUAL
 * peak adverse excursion and entry/exit times:
 *     u(entry) = 0  →  u(maeTime) = −maePct  →  u(exit) = finalPnl     (linear between)
 * Portfolio equity at any instant t = Σ finalPnl of trades already CLOSED (exit ≤ t)
 * + Σ unrealised u_i(t) of trades still OPEN (entry ≤ t < exit). Equity is
 * piecewise-linear, so its extremes fall on trade breakpoints (entry / mae / exit)
 * — we evaluate there and take the peak-to-trough.
 *
 * This is an MAE-anchored approximation (real worst excursion + real timing,
 * linear in between), NOT a full tick replay — but it captures both MAE and
 * concurrency, so it is a far more honest drawdown than the closed-trade figure.
 * Pure + unit-tested (js/intradayDrawdown.test.mjs); no network.
 *
 * trades: [{ entryTime, exitTime, finalPnl|pnl, maePct (≥0 adverse, % of price), maeTime? }]
 *   times are comparable numbers (epoch seconds/ms). Realised PnL may be supplied as
 *   `finalPnl` OR `pnl` (the per-line pipeline's field) — they are the same number.
 *   maeTime defaults to the entry/exit midpoint when absent. maePct is the adverse
 *   excursion magnitude for the trade's DECISION (continuation distance for a fade,
 *   reversion for a follow).
 */

// Coerce a bar time (epoch seconds, epoch ms, or ISO string) to epoch ms so all
// pairs land on ONE absolute clock — required for cross-pair concurrency to be
// meaningful. Returns null if it can't be parsed.
function _ms(t) {
  if (t == null) return null;
  if (typeof t === 'number') return Number.isFinite(t) ? (t < 1e12 ? t * 1000 : t) : null;
  const v = Date.parse(t);
  return Number.isNaN(v) ? null : v;
}

// Unrealised PnL of one open trade at time t (piecewise-linear through the 3 pts).
// tr here is the NORMALISED record { e, x, m, f, dip } with numeric ms times.
function _uPnL(tr, t) {
  const { e, x, m, f, dip } = tr;
  if (t <= e) return 0;
  if (t >= x) return f;
  if (t <= m) {                                   // entry → MAE
    const span = (m - e) || 1;
    return 0 + (dip - 0) * (t - e) / span;
  }
  const span = (x - m) || 1;                      // MAE → exit
  return dip + (f - dip) * (t - m) / span;
}

export function intradayMtmDrawdown(trades) {
  // Normalise to numeric ms times and drop anything we can't place on the clock.
  const ts = [];
  for (const t of trades || []) {
    if (!t) continue;
    const e = _ms(t.entryTime), x = _ms(t.exitTime);
    if (e == null || x == null || x < e) continue;
    let m = _ms(t.maeTime);
    if (m == null || m < e || m > x) m = (e + x) / 2;   // default / clamp to (entry,exit)
    // Realised PnL: accept the house-convention `pnl` field (what the per-line
    // pipeline pushes) as well as `finalPnl` — they are the same number. Reading
    // only `finalPnl` silently zeroed every trade's realised leg and collapsed the
    // whole drawdown to ~0 (the "0.0× closed" bug).
    const f = +(t.finalPnl ?? t.pnl) || 0;
    ts.push({ e, x, m, f, dip: -Math.abs(t.maePct || 0) });
  }
  if (!ts.length) return { maxDD: 0, peak: 0, trough: 0, breakpoints: 0 };

  // All breakpoints where the piecewise-linear equity can change slope.
  const times = new Set();
  for (const t of ts) { times.add(t.e); times.add(t.x); times.add(t.m); }
  const grid = [...times].sort((a, b) => a - b);

  // Active-set sweep keeps it ~O(T · concurrency) rather than O(T · N): trades are
  // intraday, so the open set is small.
  const byEntry = [...ts].sort((a, b) => a.e - b.e);
  let ei = 0;
  const active = new Set();
  let realised = 0;
  let peak = 0, maxDD = 0, trough = 0;
  const seenClosed = new Set();

  for (const t of grid) {
    while (ei < byEntry.length && byEntry[ei].e <= t) active.add(byEntry[ei++]);
    let eq = 0;
    for (const tr of active) {
      if (tr.x <= t) {                            // closed at/just before t → realise, drop
        if (!seenClosed.has(tr)) { realised += tr.f; seenClosed.add(tr); }
        active.delete(tr);
      } else {
        eq += _uPnL(tr, t);                        // still open → unrealised mark
      }
    }
    eq += realised;
    if (eq > peak) peak = eq;
    const dd = eq - peak;
    if (dd < maxDD) { maxDD = dd; trough = eq; }
  }
  return { maxDD: +maxDD.toFixed(4), peak: +peak.toFixed(4), trough: +trough.toFixed(4), breakpoints: grid.length };
}

// Summary stats over the SAME trade list intradayMtmDrawdown consumes — the
// discriminator for whether the intraday-DD uplift is real. Genuine intraday trades
// have durations of minutes-to-hours and pctZeroDuration ≈ 0; if the records lack
// real extTime/exitTime the trades collapse to entry==exit (pctZeroDuration high) and
// the uplift is an artifact, not mean-reversion. Durations in MINUTES; maePct is the
// adverse-excursion magnitude (% of price). Times coerced with the same _ms as above.
export function tradeTimingStats(trades) {
  const durs = [], maes = [];
  let n = 0, zero = 0;
  for (const t of trades || []) {
    if (!t) continue;
    const e = _ms(t.entryTime), x = _ms(t.exitTime);
    if (e == null || x == null) continue;
    n++;
    if (x <= e) zero++;
    durs.push(Math.max(0, (x - e) / 60000));          // minutes
    maes.push(Math.abs(+t.maePct || 0));
  }
  if (!n) return { n: 0 };
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  const sorted = a => [...a].sort((p, q) => p - q);
  const median = a => { const s = sorted(a), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const pctl = (a, p) => { const s = sorted(a); return s[Math.min(s.length - 1, Math.max(0, Math.floor(p / 100 * s.length)))]; };
  return {
    n,
    avgDurationMin:    +mean(durs).toFixed(1),
    medianDurationMin: +median(durs).toFixed(1),
    pctZeroDuration:   +(zero / n * 100).toFixed(1),
    avgMaePct:         +mean(maes).toFixed(4),
    medianMaePct:      +median(maes).toFixed(4),
    p95MaePct:         +pctl(maes, 95).toFixed(4),
  };
}
