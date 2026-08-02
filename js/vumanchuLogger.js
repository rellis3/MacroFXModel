/**
 * VuManChu forward-validation logger — the only out-of-sample evidence this
 * work will ever have.
 *
 * Everything in `vumanchuLab/FINDINGS.md` was measured on history the analysis
 * had already seen. This records what the engine SAYS, in advance, and then
 * what price ACTUALLY did — so that in a few months there is a sample nobody
 * fitted anything to.
 *
 * ── HOW A PREDICTION IS SCORED ──────────────────────────────────────────────
 * At write time a row carries the state, the cell it matched, the claimed
 * probability, and the price. Nothing else. It is UNRESOLVED.
 *
 * `resolveDue` later fills in what happened, using the same definition the lab
 * used, so live numbers and backtest numbers are comparable:
 *
 *   priorDir   sign of the move over the PRIOR `horizon` minutes (at log time)
 *   fwdDir     sign of the move over the NEXT `horizon` minutes
 *   reverted   fwdDir !== priorDir      <- the outcome the table predicts
 *   correct    (read === 'FADE') === reverted
 *
 * A row where |prior move| is below the lab's 0.5σ floor is marked
 * `skipped: 'flat'` and excluded from scoring — "revert" is meaningless with no
 * move to revert, and the offline study dropped those bars too. Scoring them
 * would inflate the sample with coin flips.
 *
 * ── WHAT MAKES THIS HONEST ──────────────────────────────────────────────────
 * A row is written BEFORE the outcome exists and is never edited afterwards
 * except to attach the resolution. `read` is frozen at write time, so there is
 * no way to quietly re-interpret a prediction once its outcome is known.
 * NONE reads are logged too — an engine that only records the times it spoke
 * would look far more decisive than it is, and "it said nothing" is the modal
 * and most reliable output.
 *
 * Pure except for the injected `kv` and `clock` — offline-testable.
 */

export const LOG_PREFIX = 'vmlog_';          // registered in all three KV gates
export const DEFAULT_HORIZON = 60;           // minutes; the lab's headline horizon
export const MIN_PRIOR_SIGMA = 0.5;          // the lab's floor for a meaningful move

/** `vmlog_YYYY-MM-DD` for a Date (UTC). One key per day keeps values small. */
export function logKey(d) {
  return LOG_PREFIX + new Date(d).toISOString().slice(0, 10);
}

/**
 * Append rows to today's log, idempotently.
 *
 * Dedupe is on `${instrument}|${slotTs}` where slotTs is the bar the read was
 * taken at — so a cron that fires twice, or a redeploy mid-cycle, cannot
 * double-count a prediction and inflate the forward sample.
 */
export async function appendRows(kv, rows, { now = Date.now() } = {}) {
  if (!rows?.length) return { added: 0, key: logKey(now) };
  const key = logKey(now);
  let existing = [];
  try {
    const raw = await kv.get(key);
    if (raw) existing = JSON.parse(raw);
  } catch { /* corrupt/absent — start fresh rather than lose today's writes */ }
  if (!Array.isArray(existing)) existing = [];

  const seen = new Set(existing.map(r => `${r.instrument}|${r.slotTs}`));
  const add = rows.filter(r => !seen.has(`${r.instrument}|${r.slotTs}`));
  if (!add.length) return { added: 0, key, total: existing.length };

  const merged = existing.concat(add);
  await kv.put(key, JSON.stringify(merged));
  return { added: add.length, key, total: merged.length };
}

/** Read the last `days` daily logs, oldest first. Missing days are skipped. */
export async function readRange(kv, days = 14, { now = Date.now() } = {}) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 86400_000);
    try {
      const raw = await kv.get(logKey(d));
      if (raw) {
        const rows = JSON.parse(raw);
        if (Array.isArray(rows)) out.push(...rows);
      }
    } catch { /* skip unreadable day */ }
  }
  return out;
}

/**
 * Build one unresolved row. `state`/`hit`/`verdict` come from vumanchuState.
 * `priceNow` and `sigma` are captured so resolution needs only the later price.
 */
export function buildRow({ instrument, slotTs, state, hit, verdict, price, sigma,
                           horizon = DEFAULT_HORIZON, priorMove = null }) {
  return {
    instrument,
    slotTs,                                   // bar the read was taken at (epoch s)
    loggedAt: Math.floor(Date.now() / 1000),
    horizon,
    read: verdict?.read ?? 'NONE',            // frozen — never re-derived later
    matched: hit?.matched ?? null,
    cell: hit?.cell ?? null,
    n: hit?.n ?? null,
    deltaPP: hit?.deltaPP ?? null,
    pRevert: hit?.pRevert ?? null,
    baseline: hit?.baseline ?? null,
    stackZone: state?.stackZone ?? null,
    codes: state ? [1, 5, 15].map(tf => state.per?.[tf]?.code ?? null) : null,
    price,
    sigma,                                    // per-minute return sd, for the 0.5σ floor
    priorMove,                                // signed return over the prior `horizon`
    resolved: false,
  };
}

/**
 * Attach outcomes to rows whose horizon has elapsed.
 *
 * `priceAt(instrument, ts)` returns the close at-or-before ts, or null when the
 * market was shut. A row that cannot be priced stays UNRESOLVED rather than
 * being scored on a stale quote — a weekend gap would otherwise be recorded as
 * a real forward move.
 */
export async function resolveDue(rows, priceAt, { now = Date.now() } = {}) {
  const nowSec = Math.floor(now / 1000);
  let resolved = 0, skipped = 0, pending = 0;
  for (const r of rows) {
    if (r.resolved) continue;
    const dueAt = r.slotTs + r.horizon * 60;
    if (nowSec < dueAt) { pending++; continue; }

    const later = await priceAt(r.instrument, dueAt);
    if (later == null || !Number.isFinite(later) || !Number.isFinite(r.price)) {
      pending++; continue;                    // unpriceable: leave for a later pass
    }

    const fwd = later / r.price - 1;
    // The lab's floor: below 0.5σ over the horizon there is no move to revert.
    const scale = Number.isFinite(r.sigma) ? r.sigma * Math.sqrt(r.horizon) : null;
    const priorSig = scale && Number.isFinite(r.priorMove) ? r.priorMove / scale : null;

    r.resolved = true;
    r.priceLater = later;
    r.fwdMove = fwd;
    r.fwdSigma = scale ? fwd / scale : null;

    if (priorSig == null || Math.abs(priorSig) < MIN_PRIOR_SIGMA) {
      r.skipped = 'flat';                     // excluded from scoring, kept for audit
      skipped++;
      continue;
    }
    const priorDir = Math.sign(r.priorMove);
    const fwdDir = Math.sign(fwd);
    r.reverted = fwdDir !== 0 && fwdDir !== priorDir;
    r.correct = r.read === 'NONE' ? null
              : (r.read === 'FADE') === r.reverted;
    resolved++;
  }
  return { resolved, skipped, pending };
}

/**
 * Score a set of resolved rows.
 *
 * The headline is NOT the hit rate — it is the hit rate against the SAME
 * rows' own claimed baseline. The engine claims a few points over a matched
 * bar, so "58% correct" means nothing without knowing the baseline was 52%.
 * `edgePP` is the number that decides whether the forward record agrees with
 * the backtest, and `expectedPP` is what the table promised.
 */
export function scoreRows(rows) {
  const done = rows.filter(r => r.resolved && !r.skipped);
  const scored = done.filter(r => r.correct != null);
  const byRead = {};
  for (const key of ['FADE', 'FOLLOW', 'NONE']) {
    const g = done.filter(r => r.read === key);
    const s = g.filter(r => r.correct != null);
    byRead[key] = {
      n: g.length,
      resolved: s.length,
      hitPct: s.length ? +(100 * s.filter(r => r.correct).length / s.length).toFixed(2) : null,
      revertPct: g.length ? +(100 * g.filter(r => r.reverted).length / g.length).toFixed(2) : null,
    };
  }
  // What the table claimed, weighted by how many rows carried each claim.
  const withClaim = scored.filter(r => Number.isFinite(r.deltaPP));
  const expectedPP = withClaim.length
    ? +(withClaim.reduce((s, r) => s + Math.abs(r.deltaPP), 0) / withClaim.length).toFixed(2)
    : null;
  const claimedBase = withClaim.length
    ? +(100 * withClaim.reduce((s, r) => s + (r.baseline ?? 0.5), 0) / withClaim.length).toFixed(2)
    : null;
  const hitPct = scored.length
    ? +(100 * scored.filter(r => r.correct).length / scored.length).toFixed(2) : null;

  return {
    total: rows.length,
    resolved: done.length,
    scored: scored.length,
    pending: rows.filter(r => !r.resolved).length,
    skippedFlat: rows.filter(r => r.skipped === 'flat').length,
    hitPct,
    claimedBaselinePct: claimedBase,
    edgePP: hitPct != null && claimedBase != null ? +(hitPct - claimedBase).toFixed(2) : null,
    expectedPP,
    byRead,
    // Honest floor: with this many scored rows, what spread is indistinguishable
    // from chance? 1.96 * sqrt(0.25/n) in percentage points.
    noiseBandPP: scored.length ? +(196 * Math.sqrt(0.25 / scored.length)).toFixed(2) : null,
  };
}
