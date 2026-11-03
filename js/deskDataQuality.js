/**
 * Phase 14: the data quality officer (plans/DESK_ANALYST_PIPELINE.md §9o).
 *
 * Reads the Desk Pack's health and turns it into actions: for every failed or stale feed, the likely cause and the
 * fix, whether the feed matters (critical for the book, or for scoring), and a decision for the morning run:
 *   run            every critical feed is in and every analyst can see most of its data;
 *   run-with-gaps  something important is missing; the Head is told and the book is weaker for it;
 *   hold           the book would be blind or unscoreable: rebuild the pack once before the run.
 * After the run, it marks which gaps actually mattered: the ones an analyst or the Head named as a gap.
 *
 * Pure code, no model call. Tested in js/deskDataQuality.test.mjs.
 */

/** Feeds without which the book cannot be scored (the forecast lines are the unit and the price levels). */
export const SCORING_FEEDS = ['vol-forecast', 'vol-forecast/session'];
/** Feeds a book is markedly weaker without, one or two per layer. */
export const CRITICAL_FEEDS = ['global-read', 'credit-stress', 'liquidity-gate/live', 'calendar-ahead', 'rates', 'fomc/latest', 'fed-path', 'yield-curve', 'macro-scorecard', 'cot-state', 'oi-levels', 'ledger'];

// Known causes from the 2026-11-03 audit (plans/DESK_ANALYST_PIPELINE.md §9c, §9f) and what fixes each.
const KNOWN = [
  [/^trade-decision\/state/, 'The trade-decision snapshots live in server memory and every deploy empties them; the pack warms them first, so this means the OANDA warm-up failed.', 'POST /api/trade-decision/refresh, then rebuild the pack.'],
  [/^forward-track$/, 'A manual-refresh page: it only updates when its button is pressed.', 'Press refresh on the forward-track page, or leave it out.'],
  [/^rbnz\/latest$/, 'The RBNZ site blocks the server, so full statements need a manual fetch; decisions still come from the RSS feed (rbnz/decisions).', 'Fetch now on the RBNZ page, or ask the RBNZ service desk to allowlist the server.'],
  [/^rate-diff$/, 'Rebuilt after a deploy; it refills within a few minutes.', 'Open the rates page or wait, then rebuild the pack.'],
  [/^fed-path$/, 'The Atlanta Fed tracker publishes with a lag; the futures read (zq) is the live one.', 'Nothing to fix when zq is fresh.'],
  [/^funding-read$/, 'Built on its first call after a deploy.', 'Open the funding page once, then rebuild the pack.'],
  [/^(eod-review|morning-brief)$/, 'Written by its own daily job; stale on the morning after a missed run.', 'Check that job ran yesterday.'],
];
const GENERIC = {
  timeout: ['The route took longer than the pack allows.', 'Retried once with a longer wait; if it still times out, the route needs a cache.'],
  error: ['The route returned an error.', 'Open the route and read its error.'],
  empty: ['The route answered with nothing in it.', 'Its page probably needs a refresh or a fetch.'],
  stale: ['The data is older than this feed allows.', 'Check the job that refreshes it.'],
  oversize: ['The payload is too big to hand to an analyst.', 'Give the feed a slicer or a larger byte cap.'],
};
const causeOf = g => { const hit = KNOWN.find(([re]) => re.test(g.id)); return hit ? { cause: hit[1], fix: hit[2] } : { cause: GENERIC[g.status]?.[0] ?? 'Unknown.', fix: GENERIC[g.status]?.[1] ?? '' }; };
const base = id => id.replace(/:.*$/, '');

/** The morning assessment from a pack's health. */
export function assess(health) {
  const gaps = (health?.gaps ?? []).map(g => {
    const b = base(g.id), scoring = SCORING_FEEDS.includes(b), critical = scoring || CRITICAL_FEEDS.includes(b);
    return { ...g, ...causeOf(g), critical, scoring, usable: g.status === 'stale' };
  });
  const missing = gaps.filter(g => !g.usable);
  const byAnalyst = Object.entries(health?.bySkill ?? {}).map(([skill, s]) => ({ skill, usable: s.ok + s.stale, total: s.total, share: s.total ? +((s.ok + s.stale) / s.total).toFixed(2) : 0,
    missingCritical: missing.filter(g => g.skill === skill && g.critical).map(g => g.id) }));
  const scoringOut = missing.filter(g => g.scoring), criticalOut = missing.filter(g => g.critical), blind = byAnalyst.filter(a => a.share < 0.4);
  const usableShare = health?.total ? (health.usable ?? 0) / health.total : 0;
  const reasons = [];
  if (scoringOut.length) reasons.push(`no forecast lines (${scoringOut.map(g => g.id).join(', ')}): the book could not be scored`);
  if (criticalOut.length >= 3) reasons.push(`${criticalOut.length} critical feeds missing`);
  if (blind.length) reasons.push(`${blind.map(a => a.skill).join(', ')} can see under 40% of its data`);
  const decision = reasons.length ? 'hold' : criticalOut.length || usableShare < 0.85 ? 'run-with-gaps' : 'run';
  if (decision === 'run-with-gaps') reasons.push(criticalOut.length ? `missing: ${criticalOut.map(g => g.id).join(', ')}` : `only ${Math.round(usableShare * 100)}% of feeds usable`);
  return { decision, reasons, usableShare: +usableShare.toFixed(2), byAnalyst: byAnalyst.sort((a, b) => a.share - b.share), gaps: gaps.sort((a, b) => (b.scoring - a.scoring) || (b.critical - a.critical) || a.id.localeCompare(b.id)) };
}

/**
 * After the run: which gaps mattered? A gap matters when the analyst who reads that feed, or the Head, named it (or
 * its area) as something it could not see.
 */
export function afterRun(assessment, run) {
  if (!assessment || !run) return assessment;
  const said = skill => [...(run.analysts?.[skill]?.report?.gaps ?? []), ...(run.head?.book?.gaps ?? [])].join(' \n ').toLowerCase();
  const gaps = assessment.gaps.map(g => { const text = said(g.skill), b = base(g.id).toLowerCase(), word = b.split(/[/-]/)[0];
    return { ...g, mattered: text.includes(b) || (word.length > 3 && text.includes(word)) }; });
  return { ...assessment, gaps, matteredCount: gaps.filter(g => g.mattered).length };
}
