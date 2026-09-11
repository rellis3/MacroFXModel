/**
 * js/scorecardHistory.js — one row per day of what the Macro Scorecard said.
 *
 * WHY. The scorecard is rebuilt from cached KV on every request and persists
 * nothing, so there has never been a time series of composites. That makes the
 * only question worth asking of it — does this ranking say anything about forward
 * FX returns? — unanswerable, and the alternative (replaying every FRED series
 * back through every engine to reconstruct what the score WOULD have been) is a
 * large build whose result you would then have to trust. Recording is cheap and
 * needs no trust: what the page showed on a given day is what gets tested.
 *
 * This makes NO claim that the composite predicts anything. Macro-as-signal is a
 * banked null in this repo five times over, and the factor layer is explicitly
 * framed as explanation rather than prediction. Recording is what lets that
 * framing be checked instead of assumed.
 *
 * WHAT IS KEPT. Per day: each currency's composite, its six factor scores, how
 * many factors were scored, and the board's driver and pair. Not the dimensions —
 * those are reconstructible from the engines' own KV, and a row must stay small
 * enough that five years of them is still one comfortable KV value.
 *
 * WHAT IS NOT KEPT. Anything the row could not honestly carry: a day where the
 * scorecard ranked nobody is recorded as an empty ranking, not skipped, so a gap
 * in the record is visible as a gap rather than silently closing up.
 *
 * Pure. The read/write lives in server.js and follows the econ_surprise_v1 rules:
 * getStrict so a swallowed read can never wipe the store, refuse to write over a
 * value that failed to parse, and write only when the day's row actually changed.
 */

export const SCORECARD_HISTORY_KV = 'macro_scorecard_history_v1';
export const MAX_ROWS = 5 * 366;           // five years, daily
export const FACTOR_KEYS = ['rates', 'inflation', 'growth', 'labour', 'demand', 'external'];

/** UTC calendar day of a timestamp, as YYYY-MM-DD. */
export const dayOf = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 10);

/**
 * Compact one scorecard payload into a history row.
 *
 * Numbers are copied as-is (already rounded by the engine). Missing factor scores
 * stay null — a null and a zero mean different things and the row must not
 * conflate them any more than the engine does.
 */
export function rowFromScorecard(sc, ms = Date.now()) {
  const ranked = (sc?.ranked ?? []).map(r => ({
    ccy: r.ccy,
    c: r.composite ?? null,
    f: Object.fromEntries(FACTOR_KEYS.map(k => [k, r.factors?.[k]?.score ?? null])),
    n: r.factorsScored ?? null,
  }));
  return {
    d: dayOf(ms),
    ranked,
    uncovered: sc?.uncovered ?? [],
    driver: sc?.driver ? { k: sc.driver.key ?? null, s: sc.driver.spread ?? null, hi: sc.driver.high ?? null, lo: sc.driver.low ?? null } : null,
    pair: sc?.pair ? { l: sc.pair.long, s: sc.pair.short, g: sc.pair.gap } : null,
    stale: sc?.staleCount ?? 0,
  };
}

/** Two rows are the same observation if every scored number matches. */
export function sameRow(a, b) {
  if (!a || !b) return false;
  return JSON.stringify({ ...a, d: null }) === JSON.stringify({ ...b, d: null });
}

/**
 * Merge today's row into the stored rows.
 *
 * Idempotent by day: calling it ten times in one day yields one row, and the LAST
 * call wins — the scorecard can legitimately change during the day as engines
 * refresh, and the end-of-day state is the one that matters for a daily series.
 * Returns whether anything changed so the caller can skip the write when nothing did.
 */
export function upsertRow(rows, row) {
  const list = Array.isArray(rows) ? rows.slice() : [];
  const i = list.findIndex(r => r.d === row.d);
  if (i >= 0) {
    if (sameRow(list[i], row)) return { rows: list, changed: false, action: 'unchanged' };
    list[i] = row;
    return { rows: list, changed: true, action: 'replaced' };
  }
  list.push(row);
  list.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  // Cap from the OLD end only.
  const trimmed = list.length > MAX_ROWS ? list.slice(list.length - MAX_ROWS) : list;
  return { rows: trimmed, changed: true, action: 'appended', dropped: list.length - trimmed.length };
}

/**
 * Parse a stored value. A corrupt store is NOT an empty store — return null so the
 * caller refuses to write, rather than [] which would be overwritten in good faith.
 */
export function parseStore(raw) {
  if (raw == null || raw === '') return [];
  try {
    const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const rows = p?.rows ?? p;
    return Array.isArray(rows) ? rows : null;
  } catch { return null; }
}

/** One currency's daily series out of the rows — what a rank-IC study would consume. */
export function seriesFor(rows, ccy, field = 'c') {
  return (rows ?? []).map(r => {
    const x = r.ranked?.find(q => q.ccy === ccy);
    const v = x == null ? null : field === 'c' ? x.c : (x.f?.[field] ?? null);
    return { d: r.d, v };
  }).filter(p => p.v != null);
}
