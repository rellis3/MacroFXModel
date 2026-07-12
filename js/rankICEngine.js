/**
 * Rank-IC Diagnostic — pure JavaScript engine (math is network-free; the suite
 * fetches D1).
 *
 * The honest question: the strategy stack produces SCORES that implicitly claim
 * "higher score → better forward outcome" (the day-type trend-day-ness score, its
 * component estimators, the regime/momentum directional call). Do they actually
 * SORT the outcome? This measures each score's Spearman rank information
 * coefficient (rank-IC) against the realized forward window, the standard quant
 * first-pass: rank-IC is robust to FX fat tails (one crisis print can't hijack a
 * rank) and to the monotonic-but-curved shape signal→return relationships take.
 *
 * What this is and is NOT
 *   • It is a FALSIFICATION tool, not an edge finder. A rank-IC near 0 out-of-
 *     sample means the score is decoration; ~0.02–0.05 is a real-but-weak signal.
 *     The benchmark to beat is IC=0, and only OOS — a high in-sample IC is not
 *     edge (CLAUDE.md working agreement: name the benchmark, true OOS split).
 *   • It grades ONLY the scores reproducible from pure D1 with NO lookahead. The
 *     live star / signalScore need intraday level context (density, cross-session
 *     match, EMA-RSI, HMM) that cannot be honestly rebuilt from D1 — grading them
 *     needs the logged live-trade book (score + realized pnl). The rank-IC brick
 *     (statsCore.rankIC) is general enough to ingest that book when it's wired;
 *     this engine deliberately does not fake it from D1.
 *
 * No-lookahead contract: every score for window i reads closes strictly BEFORE i;
 * the target is the realized forward window starting AT i. For multi-day horizons
 * the forward windows are stepped non-overlapping (step = windowDays) so the
 * t-stats aren't inflated by overlap autocorrelation. Vol math / classifier are
 * IMPORTED (dayTypeCore, volBacktestEngine) — never copied.
 */

import { dayTypeScore, ESTIMATORS } from './dayTypeCore.js';
import { classifyRegime, fetchD1, INSTRUMENTS } from './volBacktestEngine.js';
import { linregSlope, rankIC } from './statsCore.js';
import { HORIZONS } from './forecastCore.js';

// ── Score registry ────────────────────────────────────────────────────────────
// Each score is computed with NO lookahead (closes < i only). `kind` picks the
// realized target it is graded against:
//   'magnitude'   → trend efficiency |close−open| / (high−low) ∈ [0,1]. Asks: does
//                   a higher trend-day score actually mark a more trending window?
//   'directional' → signed forward return (close−open)/open. Asks: does the
//                   direction call rank-predict which way the window goes?
// dayTypeT is the composite; the '·'-prefixed rows are its component estimators,
// disaggregated so we can see WHICH brick (if any) carries the ranking rather
// than declaring the blend null on a pooled number (CLAUDE.md: disaggregate).
export const SCORES = [
  { key: 'dayTypeT',        label: 'Day-type T (composite)',  kind: 'magnitude',   fn: (c, i, win) => dayTypeScore(c, i, win) },
  { key: 'efficiencyRatio', label: '· Efficiency ratio',      kind: 'magnitude',   fn: (c, i, win) => ESTIMATORS.efficiencyRatio({ closes: c, idx: i, win }) },
  { key: 'varianceRatio',   label: '· Variance ratio VR(2)',  kind: 'magnitude',   fn: (c, i, win) => ESTIMATORS.varianceRatio({ closes: c, idx: i, win }) },
  { key: 'hurst',           label: '· Hurst (R/S)',           kind: 'magnitude',   fn: (c, i, win) => ESTIMATORS.hurst({ closes: c, idx: i, win }) },
  { key: 'driftTStat',      label: '· Drift t-stat',          kind: 'magnitude',   fn: (c, i, win) => ESTIMATORS.driftTStat({ closes: c, idx: i, win }) },
  { key: 'momSlope',        label: 'Momentum (linreg slope)', kind: 'directional', fn: (c, i, win) => linregSlope(c.slice(Math.max(0, i - win), i)) },
  { key: 'regime',          label: 'Regime call (BULL/BEAR)', kind: 'directional', fn: (c, i, win, st, bm) => { const r = classifyRegime(c, i, 20, 5, st, bm); return r === 'BULL' ? 1 : r === 'BEAR' ? -1 : 0; } },
];

// Aggregate the forward window [i, i+w): open of the first bar, close of the last,
// high/low the span extremes. Returns null if the window runs off the end.
function fwdAgg(bars, i, w) {
  if (i + w > bars.length) return null;
  let hi = -Infinity, lo = Infinity;
  for (let k = i; k < i + w; k++) { if (bars[k].high > hi) hi = bars[k].high; if (bars[k].low < lo) lo = bars[k].low; }
  return { open: bars[i].open, high: hi, low: lo, close: bars[i + w - 1].close };
}

// ── One instrument: score → forward-outcome pairs, rank-IC per score, IS/OOS ──
export function runRankIC(bars, assetClass, opts = {}) {
  const { horizon = 'daily', win = 14, oosFrac = 0.4, slopeThresh = 0.002, bearMult = 1.0 } = opts;
  const H = HORIZONS[horizon] ?? HORIZONS.daily;
  const w = H.windowDays;
  const step = w > 1 ? w : 1;                    // non-overlapping windows for multi-day
  const closes = bars.map(b => b.close);
  const minLookback = Math.max(win + 2, 30);

  const records = [];
  for (let i = minLookback; i + w <= bars.length; i += step) {
    const fwd = fwdAgg(bars, i, w);
    if (!fwd || !(fwd.open > 0)) continue;
    const rng = fwd.high - fwd.low;
    const eff  = rng > 1e-12 ? Math.abs(fwd.close - fwd.open) / rng : NaN;   // magnitude target
    const sret = (fwd.close - fwd.open) / fwd.open;                          // directional target
    const sv = {};
    for (const s of SCORES) { const v = s.fn(closes, i, win, slopeThresh, bearMult); sv[s.key] = Number.isFinite(v) ? v : NaN; }
    records.push({ date: bars[i].date, sv, eff, sret });
  }

  // True time split: earliest (1−oosFrac) in-sample, latest oosFrac out-of-sample.
  records.sort((a, b) => (a.date < b.date ? -1 : 1));
  const cut = Math.floor(records.length * (1 - oosFrac));
  const splitDate = records[cut]?.date ?? null;
  const parts = {
    full: records,
    is:   records.filter(r => (splitDate ? r.date < splitDate : true)),
    oos:  records.filter(r => (splitDate ? r.date >= splitDate : false)),
  };

  const scores = SCORES.map(s => {
    const tgt = s.kind === 'directional' ? 'sret' : 'eff';
    const seg = {};
    for (const [name, recs] of Object.entries(parts)) {
      seg[name] = rankIC(recs.map(r => r.sv[s.key]), recs.map(r => r[tgt]));
    }
    return {
      key: s.key, label: s.label, kind: s.kind,
      target: s.kind === 'directional' ? 'signed return' : 'trend efficiency',
      full: seg.full, is: seg.is, oos: seg.oos,
    };
  });

  return { horizon, win, oosFrac, splitDate, nWindows: records.length, scores };
}

// ── Suite: fetch D1 + run across instruments, with a pooled OOS summary ───────
export async function runRankICSuite(opts = {}, instruments = INSTRUMENTS) {
  if (!process.env.OANDA_KEY) throw new Error('OANDA_KEY not set — cannot fetch D1 data');
  const results = [], log = [];
  for (const cfg of instruments) {
    try {
      const bars = await fetchD1(cfg.oanda, 5000);
      log.push(`${cfg.name}: ${bars.length} bars (${bars[0]?.date} → ${bars.at(-1)?.date})`);
      if (bars.length < 120) { log.push(`  ${cfg.name}: too few bars — skipped`); continue; }
      const r = runRankIC(bars, cfg.assetClass, opts);
      results.push({ instrument: cfg.name, assetClass: cfg.assetClass, ...r });
    } catch (e) {
      log.push(`  Error ${cfg.name}: ${e.message}`);
    }
  }

  // Pooled per-score summary across instruments. Rank-IC pools badly (different
  // scales/vols per pair), so instead of pooling the pairs we report the mean /
  // median of the per-instrument OOS ICs and how many are individually
  // significant (|t|≥2). With SCORES × instruments cells, a few "significant"
  // survivors are what multiple testing produces by chance — nSig is shown next
  // to the cell count so a null can't be re-narrated as a subset win.
  const summary = SCORES.map(s => {
    const oos = results.map(r => r.scores.find(x => x.key === s.key)?.oos).filter(Boolean);
    const vals = oos.map(x => x.ic);
    const sig  = oos.filter(x => Math.abs(x.tStat) >= 2).length;
    const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    const sorted = vals.slice().sort((a, b) => a - b);
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    return {
      key: s.key, label: s.label, kind: s.kind,
      target: s.kind === 'directional' ? 'signed return' : 'trend efficiency',
      meanOosIC: +mean.toFixed(4), medianOosIC: +median.toFixed(4),
      nInst: vals.length, nSig: sig,
    };
  });

  return { results, summary, log, opts };
}

export { INSTRUMENTS as RANKIC_INSTRUMENTS };
