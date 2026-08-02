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
// Outcomes are captured at SEVERAL horizons from one read, because the offline
// work left the horizon question genuinely open: the DIRECTIONAL edge grows out
// to a day (windows.py: +2.04pp at 15m, +1.95 at 60m, +2.86 at 240m, +3.93 at
// 1440m) while the sigma-normalised MAGNITUDE decays to nothing by ~6h. Those
// are consistent — sigma scales as sqrt(t) — but they point at different best
// horizons, and only forward data settles it.
//
// This costs one extra price lookup per horizon and is the difference between a
// week of logs that can answer that question and a week that cannot. Schema
// changes are the one thing that CANNOT be applied retroactively.
export const HORIZONS = [15, 60, 240, 1440];
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
                           horizon = DEFAULT_HORIZON, priorMove = null,
                           horizons = HORIZONS }) {
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
    horizons,                                 // every horizon this row will be scored at
    // One entry per horizon, filled in as each elapses. A row is only fully
    // resolved once the longest has. `resolved` stays as the headline-horizon
    // flag so the health check and scorer keep a single obvious meaning.
    outcomes: {},
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
export async function resolveDue(rows, priceAt, { now = Date.now(), pathAt = null } = {}) {
  const nowSec = Math.floor(now / 1000);
  let resolved = 0, skipped = 0, pending = 0;
  for (const r of rows) {
    const horizons = r.horizons?.length ? r.horizons : [r.horizon];
    r.outcomes ||= {};
    let anyPending = false;

    for (const h of horizons) {
      if (r.outcomes[h]) continue;                       // already scored
      const dueAt = r.slotTs + h * 60;
      if (nowSec < dueAt) { anyPending = true; continue; }

      const later = await priceAt(r.instrument, dueAt);
      if (later == null || !Number.isFinite(later) || !Number.isFinite(r.price)) {
        anyPending = true; continue;                     // unpriceable: retry later
      }
      const fwd = later / r.price - 1;
      const scale = Number.isFinite(r.sigma) ? r.sigma * Math.sqrt(h) : null;
      const priorSig = scale && Number.isFinite(r.priorMove) ? r.priorMove / scale : null;
      const o = { priceLater: later, fwdMove: fwd, fwdSigma: scale ? fwd / scale : null };

      // The path between entry and the horizon, when the caller can supply it.
      // Without this the log records only where price ENDED, so "went the right
      // way first, then reversed" is unanswerable — and that is exactly the
      // shape the fade question is about.
      if (pathAt) {
        const ex = await pathAt(r.instrument, r.slotTs, dueAt, r.price);
        if (ex) {
          o.mfe = ex.mfe; o.mae = ex.mae;
          o.mfeSigma = scale ? ex.mfe / scale : null;
          o.maeSigma = scale ? ex.mae / scale : null;
          o.tMfeMin = ex.tMfeMin;                        // minutes to best excursion
        }
      }

      if (priorSig == null || Math.abs(priorSig) < MIN_PRIOR_SIGMA) {
        o.skipped = 'flat';
      } else {
        const priorDir = Math.sign(r.priorMove);
        const fwdDir = Math.sign(fwd);
        o.reverted = fwdDir !== 0 && fwdDir !== priorDir;
        o.correct = r.read === 'NONE' ? null : (r.read === 'FADE') === o.reverted;
      }
      r.outcomes[h] = o;
    }

    // Mirror the headline horizon onto the top level so the health check, the
    // page and scoreRows keep working off one obvious set of fields.
    const head = r.outcomes[r.horizon];
    if (head && !r.resolved) {
      r.resolved = true;
      r.priceLater = head.priceLater; r.fwdMove = head.fwdMove; r.fwdSigma = head.fwdSigma;
      if (head.skipped) { r.skipped = head.skipped; skipped++; }
      else { r.reverted = head.reverted; r.correct = head.correct; resolved++; }
    }
    if (anyPending) pending++;
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
export function scoreRows(rows, horizon = null) {
  // With no horizon, score the headline fields (back-compatible). With one,
  // score that horizon's own outcome — this is what makes the forward test of
  // "which horizon is actually best" possible.
  if (horizon != null) {
    rows = rows.map(r => {
      const o = r.outcomes?.[horizon];
      return o ? { ...r, ...o, resolved: true } : { ...r, resolved: false };
    });
  }
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
