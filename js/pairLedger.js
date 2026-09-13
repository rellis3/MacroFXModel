/**
 * js/pairLedger.js — the record of what today.html CALLED, scored against what
 * HAPPENED.
 *
 * WHY. The page makes a call on every pair every day -- a direction tag with an
 * agreement count, a tape label, a threat, an expected range -- and nothing has
 * ever checked one. The direction tag carries a "context" glyph because it has no
 * track record, not because it was found weak. This is the track record.
 *
 * WHAT IS RECORDED. What the page rendered, not a server-side reconstruction: the
 * direction tag is assembled from seven browser-side sources and exists nowhere
 * else, so a reconstruction could quietly score a different call from the one the
 * reader saw. The board posts its calls once per UTC day when it renders; the
 * server stamps the time and price and keeps the FIRST call of the day (the one
 * made with the day still ahead), updating only the price.
 *
 * WHAT IS SCORED. Three horizons, reported separately because they answer
 * different questions: the session close (did the day go the way the morning
 * said), +1 day, +5 days. A hit is the sign of the move agreeing with the tag;
 * MIXED calls are recorded but not scored as directional -- they are the page
 * declining to call, and "declined" is its own honest bucket. Moves are in ATR so
 * pairs pool, and a net-of-cost column subtracts the spread the page showed at the
 * time, because a 51% hit rate on a move smaller than the spread is a loss.
 *
 * WHAT IT MAY FIND. The last conviction vote that was scored on this platform was
 * anti-predictive. That is a possible outcome here and it is the point: the page
 * can then cite itself honestly ("leans like this one have been right 54% of the
 * time -- a coin flip"), and the tag's glyph stops meaning "nobody looked".
 *
 * Pure. The store discipline lives in server.js (getStrict, refuse corrupt,
 * write on change), same as the scorecard and book histories.
 */

export const LEDGER_KV = 'pair_ledger_v1';
export const MAX_DAYS = 3 * 366;
export const MIN_N_TO_SHOW = 30;   // below this the summary says "collecting", never a rate

export const dayOf = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 10);

/**
 * One call as the board posts it. `call` fields come from the rendered card;
 * `price`/`atr` are stamped server-side where possible.
 */
export function rowFromCall(call, { day = dayOf(), at = Date.now() } = {}) {
  if (!call?.pair || !call?.direction) return null;
  return {
    d: day, pair: call.pair, sym: call.sym ?? null,
    at,                                          // ms of the FIRST record that day
    dir: call.direction,                          // 'up' | 'down' | 'mixed'
    agree: call.agree ?? null, total: call.total ?? null, strength: call.strength ?? null,
    tape: call.tape ?? null,                      // 'DRIFT' … 'FAST' or null
    threat: call.threat ?? null,                  // short text, e.g. 'cost', 'prox', 'cot', 'pain'
    used: call.used ?? null,                      // range used at the call
    expRange: call.expRange ?? null,              // expected day range, price units
    spread: call.spread ?? null,                  // dealing spread at the call, price units
    price: call.price ?? null,                    // price at the call
    atr: call.atr ?? null,                        // daily ATR at the call, price units
    // Filled by the scorer.
    out: null,
  };
}

/** Key for dedupe. */
export const keyOf = r => `${r.d}|${r.pair}`;

/**
 * Merge a batch of today's calls into the store. First call of the day wins for
 * the call fields; the price is refreshed so the scorer has the latest known.
 */
export function upsertCalls(rows, calls, opts = {}) {
  const list = Array.isArray(rows) ? rows.slice() : [];
  const idx = new Map(list.map((r, i) => [keyOf(r), i]));
  let added = 0, refreshed = 0;
  for (const c of calls ?? []) {
    const row = rowFromCall(c, opts);
    if (!row) continue;
    const k = keyOf(row), i = idx.get(k);
    if (i == null) { list.push(row); idx.set(k, list.length - 1); added++; }
    else if (row.price != null && list[i].out == null) { list[i].price = row.price; refreshed++; }
  }
  list.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.pair < b.pair ? -1 : a.pair > b.pair ? 1 : 0));
  // Cap by days, from the OLD end.
  const days = [...new Set(list.map(r => r.d))];
  const keep = new Set(days.slice(-MAX_DAYS));
  const trimmed = list.filter(r => keep.has(r.d));
  return { rows: trimmed, added, refreshed, changed: added > 0 || refreshed > 0 || trimmed.length !== list.length };
}

/**
 * Score one row against a daily close series [{d, close}] (oldest -> newest).
 * Horizons: h0 = close of the call day, h1 = next session close, h5 = fifth.
 * Returns null when the day has not closed yet -- never a partial score.
 */
export function scoreRow(row, closes) {
  if (!row || row.price == null || !Array.isArray(closes) || !closes.length) return null;
  const i0 = closes.findIndex(c => c.d === row.d);
  if (i0 < 0) return null;
  const atr = row.atr > 0 ? row.atr : null;
  const dirSign = row.dir === 'up' ? 1 : row.dir === 'down' ? -1 : 0;
  const h = (k) => {
    const c = closes[i0 + k]; if (!c || c.close == null) return null;
    const move = c.close - row.price;
    const inAtr = atr ? move / atr : null;
    const net = row.spread != null ? (Math.abs(move) - row.spread) * Math.sign(move) : null;   // what a taker of the call keeps
    return {
      close: c.close, move, inAtr: inAtr != null ? +inAtr.toFixed(3) : null,
      hit: dirSign === 0 ? null : (move === 0 ? null : Math.sign(move) === dirSign),
      // Directional P&L in ATR for a taker of the call, gross and net of the spread.
      pnlAtr: dirSign === 0 || !atr ? null : +((move * dirSign) / atr).toFixed(3),
      pnlNetAtr: dirSign === 0 || !atr || row.spread == null ? null : +(((move * dirSign) - row.spread) / atr).toFixed(3),
    };
  };
  const out = { h0: h(0), h1: h(1), h5: h(5), scoredAt: Date.now() };
  if (!out.h0) return null;
  return out;
}

/** Apply the scorer across the store. Only rows lacking a complete h5 are touched. */
export function scoreRows(rows, closesBySym) {
  let scored = 0;
  const list = (rows ?? []).map(r => {
    if (r.out?.h5) return r;
    const closes = closesBySym[r.sym] ?? closesBySym[r.pair];
    const out = scoreRow(r, closes);
    if (!out) return r;
    if (r.out && JSON.stringify(r.out.h0) === JSON.stringify(out.h0) && !!r.out.h1 === !!out.h1 && !!r.out.h5 === !!out.h5) return r;
    scored++;
    return { ...r, out };
  });
  return { rows: list, scored };
}

// ── summaries ────────────────────────────────────────────────────────────────
const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
function tally(rows, horizon) {
  const pts = rows.map(r => r.out?.[horizon]).filter(o => o && o.hit != null);
  const hits = pts.filter(o => o.hit).length;
  const pnl = pts.map(o => o.pnlAtr).filter(v => v != null);
  const net = pts.map(o => o.pnlNetAtr).filter(v => v != null);
  const n = pts.length;
  // Binomial standard error on the hit rate, so "54% on 40 calls" reads as the
  // coin flip it is.
  const p = n ? hits / n : null;
  const se = n ? Math.sqrt(p * (1 - p) / n) : null;
  return {
    n, hits, hitRate: p != null ? +p.toFixed(3) : null,
    hitRateLo: p != null ? +Math.max(0, p - 1.96 * se).toFixed(3) : null,
    hitRateHi: p != null ? +Math.min(1, p + 1.96 * se).toFixed(3) : null,
    meanPnlAtr: pnl.length ? +mean(pnl).toFixed(3) : null,
    meanPnlNetAtr: net.length ? +mean(net).toFixed(3) : null,
    // Does the 95% interval clear 50%? That is the only claim the summary makes.
    clearsCoinFlip: p != null && n >= MIN_N_TO_SHOW ? (p - 1.96 * se > 0.5 ? 'above' : p + 1.96 * se < 0.5 ? 'below' : 'no') : null,
  };
}

/**
 * The report. Overall, by pair, by agreement level, by direction, by tape label --
 * each at the three horizons. Every cell carries n, and below MIN_N_TO_SHOW the
 * page shows "collecting", never a rate.
 */
export function summarise(rows) {
  const scored = (rows ?? []).filter(r => r.out);
  const directional = scored.filter(r => r.dir === 'up' || r.dir === 'down');
  const declined = scored.filter(r => r.dir === 'mixed').length;
  const by = (keyFn) => {
    const groups = new Map();
    for (const r of directional) { const k = keyFn(r); if (k == null) continue; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
    return Object.fromEntries([...groups.entries()].sort().map(([k, rs]) => [k, { h0: tally(rs, 'h0'), h1: tally(rs, 'h1'), h5: tally(rs, 'h5') }]));
  };
  return {
    days: [...new Set((rows ?? []).map(r => r.d))].length,
    calls: (rows ?? []).length, scored: scored.length, declined,
    minN: MIN_N_TO_SHOW,
    overall: { h0: tally(directional, 'h0'), h1: tally(directional, 'h1'), h5: tally(directional, 'h5') },
    byPair: by(r => r.pair),
    byAgreement: by(r => (r.agree != null && r.total) ? `${r.agree}/${r.total}` : null),
    byDirection: by(r => r.dir),
    byTape: by(r => r.tape),
    byThreat: by(r => r.threat ?? 'none'),
  };
}

/** The one-line self-citation the drawer shows for a pair, honest about n. */
export function citeFor(rows, pair, horizon = 'h1') {
  const rs = (rows ?? []).filter(r => r.pair === pair && r.out && (r.dir === 'up' || r.dir === 'down'));
  const t = tally(rs, horizon);
  if (t.n < MIN_N_TO_SHOW) return { n: t.n, text: `This page has made ${t.n} scored directional call${t.n === 1 ? '' : 's'} on this pair — too few to mean anything yet (needs ${MIN_N_TO_SHOW}).` };
  const pct = Math.round(t.hitRate * 100);
  const verdict = t.clearsCoinFlip === 'above' ? 'better than a coin flip' : t.clearsCoinFlip === 'below' ? 'WORSE than a coin flip' : 'not distinguishable from a coin flip';
  return { n: t.n, hitRate: t.hitRate, text: `Leans like this one have been right ${pct}% of the time on this pair over ${t.n} calls (${Math.round(t.hitRateLo * 100)}–${Math.round(t.hitRateHi * 100)}%) — ${verdict}${t.meanPnlNetAtr != null ? `, ${t.meanPnlNetAtr >= 0 ? '+' : ''}${t.meanPnlNetAtr} ATR per call after the spread` : ''}.` };
}
