/**
 * Range-Line Analyser — the Forecast-Level Strategy (STRATEGY_BUILD.md) applied to
 * RANGE-EXTENSION levels, with the confluence modules STRIPPED OUT.
 *
 * Motivation: the asiaRangeEngine confluence-module stack added noise (the module
 * audit showed most modules don't lift expectancy). This pipeline throws all of
 * that away and tests the clean question: treat each Asia/Monday range-extension
 * fib level as a "line", and learn — per (line × approach) cell, on after-cost
 * expectancy, IS→OOS — whether to FADE / FOLLOW / SKIP it. The exact machinery
 * the vol-forecaster used to reach 33/33 OOS, now fed by range levels instead of
 * the σ-forecast lines.
 *
 * It REUSES the proven bricks, never copies:
 *   • touchFeatures (approachVel etc.)        — the at-the-moment confidence read
 *   • perLineStrategy (extractTouches/buildPolicy/runPerLine) — the policy + book
 *   • barUtils / fibProjection                — ranges + fib projection
 *   • forecastAnalyser.bucketM1IntoSessions    — the 22:00-UTC session split
 *   • forecastCore.volSigmaSeries              — daily σ (for approachVel units)
 *
 * `analyseRangeWindow` emits the SAME line-record shape `perLineStrategy.extractTouches`
 * consumes: { name, side, outcome, level, innerLvl, outerLvl, decidedBy,
 * firstTouchTime, approachVel(bucket) }. Triple-barrier: TP = next line toward the
 * range mid (inner), SL = next away (outer); else mark-to-close. No confluence.
 */

import { bodyRange, extractBars } from './barUtils.js';
import { FIB_LEVELS } from './fibProjection.js';
import { volSigmaSeries } from './forecastCore.js';
import { bucketM1IntoSessions } from './forecastAnalyser.js';
import { createTouchFeatures } from './touchFeatures.js';
import { extractTouches, runPerLine, pnlFor, DEFAULT_COST_PCT, DEFAULT_SLIP_PCT } from './perLineStrategy.js';
import { portfolioStats } from './backtestStats.js';

// Sparse STRUCTURAL ladder — half-integer fib grid (…−1,−0.5,0,0.5,1,1.5…) so the
// triple-barrier neighbours are real distances, not the 0.25-dense grid.
// Exported so the LIVE v2 producer (levelsV2Engine.js) builds the IDENTICAL ladder
// the offline policy was learned on — same labels → same cell keys → no drift.
export const LADDER_LEVELS = FIB_LEVELS.filter(L => Number.isInteger(L * 2));

// Build the day's line ladder off a range: [{ label, level(price) }] sorted.
export function buildRangeLadder(low, range, srcTag) {
  return LADDER_LEVELS
    .map(L => ({ label: `${srcTag}_${L}`, fibL: L, level: low + range * L }))
    .sort((a, b) => a.level - b.level);
}

// ── Analyse one session's M1 path against one or more range ladders ───────────
// ladders: [{ low, high, levels:[{label,level}] }] (e.g. Asia, Monday). All
// resolved against the SAME intraday path (this session's bars). Emits line
// records in perLineStrategy's shape.
export function analyseRangeWindow({ open, bars }, ladders, ctx = {}) {
  const { sigma = 0, tf = null, pip = 0 } = ctx;
  const n = bars.length;
  if (n < 2) return [];
  const closePx = bars[n - 1].close;
  const wt1 = tf ? tf.wtSeries(bars) : null;
  const out = [];

  for (const lad of ladders) {
    const mid = (lad.low + lad.high) / 2;
    const prices = lad.levels.map(l => l.level);          // sorted ascending
    // NO LOOKAHEAD: a level isn't tradeable until its range is KNOWN. The Asia
    // low/high (A_0/A_1) are defined by the formation window, so a touch DURING
    // formation + "revert to mid" is circular (price is inside its own range by
    // construction). `validFrom` excludes every bar before the range closed.
    const validFrom = lad.validFrom ?? -Infinity;
    for (const ln of lad.levels) {
      const L = ln.level;
      const side = L > mid ? 'up' : 'dn';

      // First intrabar touch of the line, ON OR AFTER the level became known.
      let touchIdx = -1, ftt = null;
      for (let k = 0; k < n; k++) {
        if (bars[k].time < validFrom) continue;            // level not yet known
        const hit = side === 'up' ? bars[k].high >= L : bars[k].low <= L;
        if (hit) { touchIdx = k; ftt = bars[k].time ?? null; break; }
      }
      if (touchIdx < 0) continue;                          // never touched (post-formation) → not a trade

      // Neighbours among the ladder: inner = next toward mid (TP), outer = away (SL).
      let belowP = null, aboveP = null;
      for (const p of prices) {
        if (p < L - 1e-12) belowP = p;
        else if (p > L + 1e-12 && aboveP == null) aboveP = p;
      }
      const inner = side === 'up' ? belowP : aboveP;
      const outer = side === 'up' ? aboveP : belowP;
      if (inner == null || outer == null) continue;        // extreme line, no barrier → skip

      // At-the-moment approach features (approachVel etc.) — bucket, lookahead-free.
      let approachVel = null;
      if (tf) {
        const f = tf.compute({ bars, touchIdx, open, sigma, side, wt1, level: L, pip });
        approachVel = f.approachVel?.bucket ?? null;
      }

      // Triple-barrier walk from the touch: inner first = reverted, outer = continued.
      let outcome = 'undecided', decidedBy = 'close';
      for (let k = touchIdx; k < n; k++) {
        const bar = bars[k];
        if (side === 'up') {
          if (bar.low  <= inner) { outcome = 'reverted';  decidedBy = 'barrier'; break; }
          if (bar.high >= outer) { outcome = 'continued'; decidedBy = 'barrier'; break; }
        } else {
          if (bar.high >= inner) { outcome = 'reverted';  decidedBy = 'barrier'; break; }
          if (bar.low  <= outer) { outcome = 'continued'; decidedBy = 'barrier'; break; }
        }
      }
      if (outcome === 'undecided') {
        outcome = side === 'up' ? (closePx > L ? 'continued' : 'reverted')
                                : (closePx < L ? 'continued' : 'reverted');
      }

      // MFE/MAE excursion from the touch to SESSION CLOSE (not truncated at the
      // barrier) — measures whether price RUNS past the level (favouring a
      // let-it-run / trailing exit) or pokes and reverts (favouring a fixed TP).
      // Mid-referenced: `excMid` = furthest it travelled toward the range mid,
      // `excAway` = furthest away. % of open. Decision-agnostic; the E-ratio per
      // decision is derived later (fade: MFE=excMid; follow: MFE=excAway).
      let excMid = 0, excAway = 0;
      for (let k = touchIdx; k < n; k++) {
        const upPct = (bars[k].high - L) / open * 100;
        const dnPct = (L - bars[k].low)  / open * 100;
        if (side === 'up') {                 // away = up (out of range), toward-mid = down
          if (upPct > excAway) excAway = upPct;
          if (dnPct > excMid)  excMid  = dnPct;
        } else {                             // dn side: away = down, toward-mid = up
          if (dnPct > excAway) excAway = dnPct;
          if (upPct > excMid)  excMid  = upPct;
        }
      }

      // FOLLOW-direction trailing exits, simulated on the M1 path (for the exit
      // A/B). Entry = L, going AWAY from mid (continuation). Two trails, both with
      // the same protective stop = inner (one rung toward mid):
      //   • structural ratchet: each time price reaches the next ladder level, the
      //     stop ratchets to one level behind the peak — exit on a level-flip back.
      //   • chandelier: stop = peak − chandFrac×rung (continuous give-back).
      // Adverse-first within a bar (conservative). fStruct/fChand = realised GROSS
      // PnL (% of open, + = favourable for the follow trade). Fade keeps the fixed
      // barrier, so these are only consumed for follow decisions.
      const rung = Math.abs(outer - L);
      const trailW = rung * (ctx.chandFrac ?? 0.5);
      // Both trails share the protective stop = inner; the chandelier never starts
      // tighter than that (it only ratchets ABOVE inner once price is in profit),
      // so the A/B compares give-back-from-peak, not initial-stop width.
      let sStop = inner, sPeak = L, sExit = null, cPeak = L, cStop = inner, cExit = null;
      for (let k = touchIdx; k < n && (sExit === null || cExit === null); k++) {
        const bar = bars[k];
        if (side === 'up') {
          if (sExit === null) { if (bar.low <= sStop) sExit = sStop;
            else while (bar.high >= sPeak + rung - 1e-12) { sPeak += rung; sStop = sPeak - rung; } }
          if (cExit === null) { if (bar.low <= cStop) cExit = cStop;
            else if (bar.high > cPeak) { cPeak = bar.high; cStop = Math.max(inner, cPeak - trailW); } }
        } else {
          if (sExit === null) { if (bar.high >= sStop) sExit = sStop;
            else while (bar.low <= sPeak - rung + 1e-12) { sPeak -= rung; sStop = sPeak + rung; } }
          if (cExit === null) { if (bar.high >= cStop) cExit = cStop;
            else if (bar.low < cPeak) { cPeak = bar.low; cStop = Math.min(inner, cPeak + trailW); } }
        }
      }
      if (sExit === null) sExit = closePx;
      if (cExit === null) cExit = closePx;
      const fStruct = (side === 'up' ? sExit - L : L - sExit) / open * 100;
      const fChand  = (side === 'up' ? cExit - L : L - cExit) / open * 100;

      out.push({
        name: ln.label, side, level: +L.toFixed(6),
        innerLvl: +inner.toFixed(6), outerLvl: +outer.toFixed(6),
        decidedBy, firstTouchTime: ftt, outcome, approachVel,
        excMid: +excMid.toFixed(5), excAway: +excAway.toFixed(5),
        fStruct: +fStruct.toFixed(5), fChand: +fChand.toFixed(5),
      });
    }
  }
  return out;
}

// Daily OHLC from the M1 sessions (open=first, close=last) — for σ + Monday range.
function sessionsToD1(sessions, dates) {
  return dates.map(date => {
    const b = sessions.get(date);
    let hi = -Infinity, lo = Infinity;
    for (const x of b) { if (x.high > hi) hi = x.high; if (x.low < lo) lo = x.low; }
    return { date, open: b[0].open, high: hi, low: lo, close: b[b.length - 1].close };
  });
}

// Monday-of-week date string for a given session date (UTC).
function mondayOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const dow = d.getUTCDay();                                // 0=Sun..6=Sat
  d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return d.toISOString().slice(0, 10);
}

// ── Walk every session → range-line records (no confluence, no modules) ───────
// sessions = Map(date → ordered M1 bars[]) from bucketM1IntoSessions.
// opts: { sources:['asia','monday'], minLookback, minBarsPerSession, asiaHrs:6,
//         dateFrom, dateTo, touchCfg }.
export function runRangeLineAnalyser(sessions, assetClass = 'fx', opts = {}) {
  const { sources = ['asia', 'monday'], minLookback = 20, minBarsPerSession = 30,
          asiaHrs = 6, dateFrom = '', dateTo = '' } = opts;
  const tf = createTouchFeatures(opts.touchCfg);

  const dates = [...sessions.keys()].sort()
    .filter(d => (sessions.get(d)?.length ?? 0) >= minBarsPerSession);
  if (dates.length <= minLookback) return [];

  const d1 = sessionsToD1(sessions, dates);
  const sigD = volSigmaSeries(d1, assetClass);
  const dateIdx = new Map(dates.map((d, i) => [d, i]));

  // Asia range per session = first asiaHrs of that session's bars (5m bodies).
  // Monday range per week = the Monday session's full-day bars (15m bodies).
  const mondayCache = new Map();   // mondayDate → { low, high } | null

  const records = [];
  for (let i = minLookback; i < dates.length; i++) {
    const date = dates[i];
    if (dateFrom && date < dateFrom) continue;
    if (dateTo && date > dateTo) continue;
    const bars = sessions.get(date);
    if (!bars || bars.length < 2) continue;
    const open = bars[0].open;
    const sigma = sigD[i] || 0;

    const ladders = [];
    if (sources.includes('asia')) {
      const t0 = bars[0].time;
      const asiaClose = t0 + asiaHrs * 3600;               // Asia range known only after this
      const asiaBars = bars.filter(b => b.time < asiaClose);
      const ar = bodyRange(asiaBars, 5);
      // Only tradeable if there are post-formation bars left in the session.
      if (ar && bars[bars.length - 1].time >= asiaClose)
        ladders.push({ low: ar.low, high: ar.high, validFrom: asiaClose, levels: buildRangeLadder(ar.low, ar.range, 'A') });
    }
    if (sources.includes('monday')) {
      const monDate = mondayOf(date);
      // The Monday range is only known once Monday closes — never trade it on
      // Monday itself (that would be the same circular formation-window lookahead).
      if (monDate !== date) {
        let mr = mondayCache.get(monDate);
        if (mr === undefined) {
          const monBars = sessions.get(monDate);
          mr = monBars && monBars.length >= minBarsPerSession ? bodyRange(monBars, 15) : null;
          mondayCache.set(monDate, mr);
        }
        if (mr) ladders.push({ low: mr.low, high: mr.high, validFrom: bars[0].time, levels: buildRangeLadder(mr.low, mr.range, 'M') });
      }
    }
    if (!ladders.length) continue;

    const lines = analyseRangeWindow({ open, bars }, ladders, { sigma, tf, pip: opts.pip ?? 0 });
    if (lines.length) records.push({ date, open: +open.toFixed(6), realized: { close: +bars[bars.length - 1].close.toFixed(6) }, lines });
  }
  return records;
}

// ── E-ratio study: does a let-it-run exit have a trend to ride? ───────────────
// For each TRADED cell, average the MFE (favourable excursion in the decision's
// direction) and MAE (adverse). E-ratio = MFE÷MAE measured to session close —
// the question the fixed one-level barrier can't answer: when price reaches a
// level, does it RUN past it (E>1 → a structural/chandelier trail would capture
// more than the fixed TP) or poke and revert (E≈1 → the fixed TP is right)?
//   fade decision:  favourable = toward mid (excMid), adverse = away  (excAway)
//   follow decision: favourable = away      (excAway), adverse = mid  (excMid)
export function eRatioByCell(touchesByPair, policy) {
  const agg = {};
  for (const touches of Object.values(touchesByPair || {})) {
    for (const t of touches) {
      const p = policy?.[t.cell];
      if (!p || p.decision === 'skip') continue;
      if (t.excMid == null || t.excAway == null) continue;
      const fav = p.decision === 'fade' ? t.excMid : t.excAway;
      const adv = p.decision === 'fade' ? t.excAway : t.excMid;
      const a = (agg[t.cell] ??= { cell: t.cell, decision: p.decision, n: 0, mfe: 0, mae: 0 });
      a.n++; a.mfe += fav; a.mae += adv;
    }
  }
  const cells = Object.values(agg).map(a => ({
    cell: a.cell, decision: a.decision, n: a.n,
    mfe: +(a.mfe / a.n).toFixed(4), mae: +(a.mae / a.n).toFixed(4),
    eRatio: a.mae > 1e-9 ? +(a.mfe / a.mae).toFixed(2) : null,
  })).sort((x, y) => (y.eRatio ?? 0) - (x.eRatio ?? 0));
  let MFE = 0, MAE = 0, N = 0;
  for (const c of cells) { MFE += c.mfe * c.n; MAE += c.mae * c.n; N += c.n; }
  return { overall: MAE > 1e-9 ? +(MFE / MAE).toFixed(2) : null, n: N, cells };
}

// ── Exit A/B: same entries (the learned policy), four exits, honest harness ────
// fade decisions always keep the fixed barrier (their E-ratio ≈ 1); follow
// decisions are priced under each exit. Trail PnLs (fStruct/fChand) are gross and
// pay cost+slip once (they're stop-based). Returns, per mode, the daily-aggregated
// portfolio stats + cost-stress + trades/day + win% + payoff so the table reads
// exactly like the rigor card — the winner is the mode that beats `fixed` on OOS
// after cost-stress while its trades/day fall (breadth deflating).
const _toDaily = (trades) => {
  const m = new Map();
  for (const t of trades) m.set(t.date, (m.get(t.date) || 0) + t.pnl);
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, p]) => p);
};
function _priceExit(t, decision, mode, cost, slip) {
  if (decision === 'fade') return pnlFor(t, 'fade', { costPct: cost, slipPct: slip });
  const fixed = pnlFor(t, 'follow', { costPct: cost, slipPct: slip });   // net
  if (mode === 'fixed' || t.fStruct == null) return fixed;
  const tc = cost + slip;                                                // trail = stop exit → slip
  if (mode === 'struct') return +(t.fStruct - tc).toFixed(5);
  if (mode === 'chand')  return t.fChand != null ? +(t.fChand - tc).toFixed(5) : fixed;
  if (mode === 'scale')  return +(0.5 * fixed + 0.5 * (t.fStruct - tc)).toFixed(5);
  return fixed;
}
export function runExitAB(touchesByPair, { policy, splitDate, costByPair = {}, slipByPair = {}, costMults = [1, 2, 3] } = {}) {
  if (!policy || !splitDate) return null;
  const out = {};
  for (const mode of ['fixed', 'struct', 'chand', 'scale']) {
    const trades = [], byMult = Object.fromEntries(costMults.map(m => [m, []]));
    let wins = 0, grossWin = 0, grossLoss = 0;
    for (const [pair, touches] of Object.entries(touchesByPair)) {
      const cost = costByPair[pair] ?? DEFAULT_COST_PCT.fx, slip = slipByPair[pair] ?? DEFAULT_SLIP_PCT.fx;
      for (const t of touches) {
        if (t.date < splitDate) continue;
        const p = policy[t.cell];
        if (!p || p.decision === 'skip') continue;
        const pnl = _priceExit(t, p.decision, mode, cost, slip);
        trades.push({ date: t.date, pnl });
        if (pnl > 0) { wins++; grossWin += pnl; } else grossLoss += -pnl;
        for (const mult of costMults) byMult[mult].push({ date: t.date, pnl: _priceExit(t, p.decision, mode, cost * mult, slip * mult) });
      }
    }
    const n = trades.length;
    if (!n) { out[mode] = { trades: 0 }; continue; }
    const port = portfolioStats(_toDaily(trades));
    const days = new Set(trades.map(t => t.date)).size, losses = n - wins;
    out[mode] = {
      sharpe: port.sharpe, psr: port.psr, cagr: port.volTarget?.cagr ?? null, maxDD: port.volTarget?.maxDD ?? null,
      trades: n, tradesPerDay: days ? +(n / days).toFixed(1) : 0,
      winRate: +(wins / n * 100).toFixed(1),
      expectancy: +(trades.reduce((s, x) => s + x.pnl, 0) / n).toFixed(4),
      payoff: (losses && grossLoss > 1e-9) ? +(((grossWin / wins) / (grossLoss / losses))).toFixed(2) : null,
      costStress: costMults.map(mult => ({ mult, sharpe: portfolioStats(_toDaily(byMult[mult])).sharpe })),
    };
  }
  return out;
}

// ── One pair: packed M1 → range-line touches (the per-pair unit of work) ──────
// Returns the lightweight touch array (perLineStrategy shape). The caller can
// drop `packed` after this — only the small touch list is retained — so a 26-pair
// book never holds all the M1 in memory at once.
export function touchesForPair(packed, assetClass = 'fx', opts = {}) {
  return extractTouches(recordsForPair(packed, assetClass, opts),
                        { conditions: opts.conditions ?? ['approachVel'] });
}

// The EXPENSIVE half (packed M1 → session walk → line records), split out so a
// caller can cache it: the records depend only on the data window + line/cell
// formation, NOT on `conditions` (which only changes how extractTouches keys the
// cell). So a cached records list lets a none↔approachVel toggle re-derive touches
// for free. Pair it with the re-exported `extractTouches` below.
export function recordsForPair(packed, assetClass = 'fx', opts = {}) {
  const sessions = bucketM1IntoSessions(packed, opts.boundaryHour ?? 22);
  return runRangeLineAnalyser(sessions, assetClass, opts);
}

// ── Full book: packed M1 per pair → records → pooled-IS policy → per-pair OOS ──
// packedByPair: { pair: packed }.  assetClassByPair optional. Returns the
// perLineStrategy.runPerLine result (policy + per-pair OOS + book stats + equity).
// NOTE: this holds every pair's packed M1 at once — fine for tests / a few pairs.
// The server route processes pairs one-at-a-time (releasing M1 + yielding) for
// the full 26-pair book; see /api/range-line/run.
export function runRangeLineBook(packedByPair, opts = {}) {
  const { assetClassByPair = {} } = opts;
  const touchesByPair = {};
  for (const [pair, packed] of Object.entries(packedByPair)) {
    touchesByPair[pair] = touchesForPair(packed, assetClassByPair[pair] ?? 'fx', opts);
  }
  return runPerLine(touchesByPair, opts);
}

// Re-export so a streaming caller (the server route) can build touchesByPair
// pair-by-pair and run the pooled policy itself without a second import.
// `costForPair` lets the route price each pair at its real round-trip spread
// (the survivor / cost-sensitivity logic depends on per-pair costs).
// `extractTouches` pairs with `recordsForPair` for cache-then-derive.
// `runRigor`/`runSensitivity`/`deflatedSharpe` are the forecast-engine's proven
// robustness battery (walk-forward / per-year / cost-stress / IS-vs-OOS /
// deflated Sharpe) — the range-line route surfaces them so the strategy is judged
// the same honest way, not by the breadth-inflated headline Sharpe alone.
export { runPerLine, costForPair, runRigor, runSensitivity } from './perLineStrategy.js';
export { extractTouches } from './perLineStrategy.js';
export { deflatedSharpe } from './backtestStats.js';
// runExitAB is defined above (range-line-specific exit comparison).
