/**
 * Alert Formatter v2 — pure Telegram message builder for a v2 graded entry.
 *
 * Transport (the /api/telegram fetch) stays OUT of this brick so the message can be
 * unit-tested and reused by the browser, the server producer and the cron worker.
 * The language is expectancy-first: the headline number is the measured after-cost
 * edge, not a 0-100 score — matching the v2 confidence model.
 *
 * Pure: returns a string; no network, no DOM.
 */

const GRADE_EMOJI = { 'A+': '🟢', A: '🟢', B: '🟡', C: '⚪', SKIP: '🔴' };

// Format one v2 entry into a Telegram HTML message.
//   sym   : display symbol, e.g. 'EUR/USD'
//   entry : a gradeLevelV2 entry { price, direction, grade, verdict, expectancy, n,
//           winRate, revRate, sl, rung, trailFrac, decision, cell, confidence, tags }
//   ctx   : { currentPrice, digits, unit?, distPips?, policyBuiltAt? }
export function formatV2Entry(sym, entry, ctx = {}) {
  const { currentPrice, digits = 5, unit = 'p', distPips = null, policyBuiltAt = null } = ctx;
  const dirTxt = entry.direction === 'long' ? '↑ BUY' : '↓ SELL';
  const ge     = GRADE_EMOJI[entry.grade] ?? '';
  const atTxt  = distPips == null ? '' : distPips <= 0 ? ' · AT LEVEL' : ` · ${distPips}${unit} away`;

  const lines = [
    `${ge} <b>${sym} ${dirTxt}</b> [${entry.grade}] · ${entry.verdict}`,
    `Level: <b>${Number(entry.price).toFixed(digits)}</b>${atTxt}`,
    currentPrice != null ? `Current: ${Number(currentPrice).toFixed(digits)}` : null,
    // The decision variable — measured after-cost expectancy + the sample behind it.
    `Edge: <b>+${Number(entry.expectancy).toFixed(3)}%</b> after costs · n=${entry.n}` +
      (entry.winRate != null ? ` · ${entry.winRate}% win` : entry.revRate != null ? ` · ${entry.revRate}% rev` : ''),
    `Play: ${entry.decision === 'fade' ? 'Fade (mean-revert)' : 'Follow (breakout)'}` +
      (entry.confidence != null ? ` · conf ${Math.round(entry.confidence * 100)}%` : ''),
    // No fixed TP — held position with a chandelier trail (RANGE_EXTENSION_GUIDE §13):
    // initial risk to `sl`, then the stop ratchets in trailFrac×rung from the peak.
    entry.sl != null
      ? `Initial SL ${Number(entry.sl).toFixed(digits)} · then trail ${Math.round((entry.trailFrac ?? 0.5) * 100)}% of a rung from peak (no fixed TP)`
      : null,
    (entry.tags ?? []).length ? `Tags: ${entry.tags.slice(0, 4).join(' · ')}` : null,
    (entry.warnings ?? []).length ? `⚠ ${entry.warnings.slice(0, 2).join(' · ')}` : null,
    `<i>policy cell: ${entry.cell}${policyBuiltAt ? ` · learned ${policyBuiltAt}` : ''}</i>`,
  ];
  return lines.filter(Boolean).join('\n');
}
