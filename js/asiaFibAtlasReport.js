/**
 * Asia Fib Atlas Report — turns `asiaFibAtlasWalk()`'s raw touch records into
 * the systematic reference tables. Same discipline as levelAtlasReport.js
 * (its own header applies verbatim: not a screen, every dimension reported
 * the same way every time, a 38%-of-the-time entry is a complete answer).
 *
 * Reuses levelAtlasReport.js's `splitAt`/`tableFor`/`summarizeAll`/`pctiles`
 * (exported specifically for this — see that file's comment at their
 * definitions) and its `annotateHolds` (THE shared OOS-holding gate every
 * reference book in this repo goes through identically per
 * REFERENCE_ENGINE_PLAYBOOK.md §3.2) — never a second copy of any of them.
 *
 * Pure: touches[] in, tables out. No network, no filtering by economic value.
 */

import { splitAt, tableFor, summarizeAll, annotateHolds, NOISE_FLOOR, leanOf } from './levelAtlasReport.js';

export const DIMENSIONS = [
  ['session', 'Session (Asia/London/NY) at the touch'],
  ['sessionHandoff', 'Finer session-transition phase (Asia-close breakout / London morning / London-NY overlap / NY afternoon / NY-late-pre-Asia)'],
  ['dowSession', 'Day of week × session'],
  ['dow', 'Day of week'],
  ['windowPos', 'Position within the post-Asia window (early/mid/late)'],
  ['gapBucket', "Gap from prior day's close"],
  ['dayVol', "Today's forecast volatility vs its own trailing"],
  ['asiaVolBucket', "Today's Asia range vs its own trailing history"],
  ['prevAsiaVolBucket', "YESTERDAY's Asia range vs its own trailing history"],
  ['rangeBudgetBucket', "How much of today's TYPICAL day-range is already used by this touch"],
  ['churn', 'How price got here: one-sided drive vs two-sided churn'],
  ['levelFlipState', 'Fresh touch vs a retest of a line already closed beyond earlier today'],
  ['confluenceGrade', 'Confluence vs previous Asia (categorical match/tight — the core track)'],
  ['asiaConfZone', 'Pip gap to nearest previous-Asia level (continuous zone — the core track)'],
  ['mondayWeekZone', "Pip gap between this week's and last week's Monday ladder (its own weekly track, independent of Asia)"],
  ['mondayCrossZone', 'Pip gap from this Asia rung to the Monday ladder (exploratory — not part of the original strategy)'],
  ['otherSideTouchedBefore', 'Was the OPPOSITE side already tagged today (two-way day)'],
  ['approachVel', 'Approach velocity into the line'],
  ['approachER', 'Approach efficiency (driven vs choppy)'],
  ['wtState', 'WaveTrend state at touch (window TF)'],
  ['wtMtf', 'WaveTrend MTF agreement (15m/1h/4h)'],
  ['wtSlow', 'WaveTrend 1h stretch'],
  ['vwapSide', 'Distance beyond the post-Asia VWAP'],
  ['momAdx', '1h ADX trend/range'],
  ['htfTrend', '4h EMA trend vs the touch direction'],
  ['volClimax', 'Touch-bar tick-volume spike vs its own trailing average'],
  ['roundNum', "The level's own distance to the nearest round number"],
  ['structConfluence', 'Structural confluence count (pivots/prior-hilo/volume-profile/swing/round)'],
  ['candleReject', 'Touch-bar wick rejection'],
  ['ordinal', 'Test number (1st/2nd/3rd…)'],
  ['prevOutcomeSameDay', 'Same-window retest: what the last visit to this rung did'],
  ['prevOutcomeCrossDay', 'A different day\'s prior visit to this rung'],
  // Added 2026-08-26 (owner request — "what else, like the volatility atlas").
  ['weeklyPivotZone', 'Pip gap to the nearest classic weekly pivot (PP/R1/R2/S1/S2) — a separate structural family from the fib grid'],
  ['ivRegime', "Yesterday's implied-vol level vs its own trailing history (CVOL, one-day settle lag)"],
  ['vrp', 'Implied vol vs realized (variance risk premium) — rich, cheap, or fair'],
  ['ivSkewDir', "Options-market directional skew, oriented to the touch"],
  ['hurstBucket', 'Trailing-80-day Hurst exponent (reverting/random-walk/trending) — known to saturate high in a different (entry-conviction) context; tested fresh here'],
  ['asiaShape', "Did Asia's OWN formation drive cleanly one way or chop both ways (same churn thresholds, Asia's own close-direction as reference)"],
  ['swingRegime', 'HTF swing structure (CHoCH/BOS) agreeing or conflicting with the range-extension direction'],
  ['macroEventBucket', "Hours to the nearest 'Major'-impact scheduled event (FOMC/ECB/BoE/NFP/CPI) in this instrument's currencies — schedule only, never the event's outcome"],
];

/**
 * Build the full book for one instrument's touches: every (side, level) cell
 * at a chosen re-arm definition, every dimension, IS and OOS.
 *
 *   buildAsiaFibAtlasBook(touches, { rearmFrac: 0.3 })
 *     -> { instrument, splitDate, cells: { 'above|1.5': {...}, 'below|-2.5': {...}, ... } }
 */
export function buildAsiaFibAtlasBook(touches, { rearmFrac = 0.3 } = {}) {
  const pool = touches.filter(t => t.rearmFrac === rearmFrac);
  if (!pool.length) return null;
  const { split, is, oos } = splitAt(pool);
  const instrument = pool[0].instrument;

  const cellKeys = [...new Set(pool.map(t => `${t.side}|${t.level}`))]
    .sort((a, b) => {
      const [sa, la] = a.split('|'), [sb, lb] = b.split('|');
      return sa === sb ? Math.abs(+la) - Math.abs(+lb) : sa.localeCompare(sb);
    });

  const cells = {};
  for (const key of cellKeys) {
    const [side, levelStr] = key.split('|');
    const level = +levelStr;
    const cellIS = is.filter(t => t.side === side && t.level === level);
    const cellOOS = oos.filter(t => t.side === side && t.level === level);
    if (!cellIS.length) continue;
    const base = { is: summarizeAll(cellIS), oos: cellOOS.length ? summarizeAll(cellOOS) : null };
    const dims = {};
    for (const [dimKey] of DIMENSIONS) {
      const tIs = tableFor(cellIS, dimKey), tOos = tableFor(cellOOS, dimKey);
      if (!Object.keys(tIs).length) continue;
      dims[dimKey] = { is: tIs, oos: tOos };
    }
    if (base.oos) annotateHolds(dims, base.is, base.oos);
    cells[key] = { side, level, n: { is: cellIS.length, oos: cellOOS.length }, base, dims };
  }
  return { instrument, splitDate: split, cells };
}

/**
 * Every dimension-bucket entry across the whole book that clears `holdsOOS`,
 * flattened and sorted by |effect size| — same role as
 * levelAtlasReport.extractHeldFindings, kept as a local copy rather than an
 * import ONLY because it needs to read `book.cells` generically either way;
 * the logic itself is identical and trivial (a straight flatten+filter+sort),
 * not independently re-derived math.
 */
export function extractHeldFindings(book, { limit = 50 } = {}) {
  if (!book) return [];
  const out = [];
  for (const [cellKey, cell] of Object.entries(book.cells)) {
    for (const [dimKey, dim] of Object.entries(cell.dims)) {
      for (const [bucket, g] of Object.entries(dim.is)) {
        if (!g.holdsOOS) continue;
        const o = dim.oos[bucket];
        out.push({ cellKey, side: cell.side, level: cell.level, dimKey, bucket, n: { is: g.n, oos: o.n },
          deltaOutIS: g.deltaOut, deltaOutOOS: o.deltaOut,
          outPctIS: g.outPct, outPctOOS: o.outPct, avgFadePips: g.avgFadePips });
      }
    }
  }
  return out.sort((a, b) => Math.abs(b.deltaOutIS) - Math.abs(a.deltaOutIS)).slice(0, limit);
}

// ── Plain-text renderer — one instrument's book as a readable reference page ──
export function renderAsiaFibBookText(book) {
  if (!book) return '(no data)';
  const lines = [];
  lines.push(`${book.instrument} — Asia Fib Atlas  (OOS split ${book.splitDate})`);
  lines.push('='.repeat(70));
  for (const [key, cell] of Object.entries(book.cells)) {
    lines.push('');
    lines.push(`── ${cell.side.toUpperCase()} ${cell.level}x  (n IS=${cell.n.is} OOS=${cell.n.oos}) ${'─'.repeat(Math.max(0, 30 - key.length))}`);
    const b = cell.base;
    lines.push(`  base:  IS  out ${b.is.outPct}% / back ${b.is.backPct}% / neither ${b.is.neitherPct}%   avg fade ${b.is.avgFadePips}p, run ${b.is.avgRunPips}p, pullback ${b.is.avgPullback}%, resolve ${b.is.avgMinsToResolve}min`);
    if (b.oos) lines.push(`         OOS out ${b.oos.outPct}% / back ${b.oos.backPct}% / neither ${b.oos.neitherPct}%   avg fade ${b.oos.avgFadePips}p, run ${b.oos.avgRunPips}p, pullback ${b.oos.avgPullback}%, resolve ${b.oos.avgMinsToResolve}min`);
    for (const [dimKey, dimLabel] of DIMENSIONS) {
      const d = cell.dims[dimKey]; if (!d) continue;
      lines.push(`  · ${dimLabel}:`);
      for (const bucket of Object.keys(d.is).sort()) {
        const i = d.is[bucket], o = d.oos[bucket];
        lines.push(`      ${String(bucket).padEnd(16)} n=${String(i.n).padStart(4)}  out ${String(i.outPct).padStart(5)}%/back ${String(i.backPct).padStart(5)}%  fade ${String(i.avgFadePips).padStart(6)}p${i.holdsOOS ? '  [HOLDS OOS]' : ''}` +
          (o ? `   |  OOS n=${String(o.n).padStart(4)}  out ${String(o.outPct).padStart(5)}%/back ${String(o.backPct).padStart(5)}%  fade ${String(o.avgFadePips).padStart(6)}p` : '   |  OOS —'));
      }
    }
  }
  return lines.join('\n');
}

export { NOISE_FLOOR, leanOf };
