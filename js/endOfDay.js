/**
 * The end-of-day read: what the page said this morning, against what happened.
 *
 * WHY A CHAIN RE-READ IS NOT THIS. Pulling the chain read again at the close gives a
 * fresh AI read of the CURRENT state. It has no memory of the morning, so it cannot
 * say what changed or whether the morning read held — and it costs a paid call to
 * produce the wrong thing. A look-back has to compare two points in time, which means
 * reading a record rather than generating a new opinion.
 *
 * THE RECORD ALREADY EXISTS. `daily_snapshot_v1` has been written hourly for days:
 * the morning brief, the digest text, per-pair `plan` (lean, expected range, 5- and
 * 20-day outlook with confidence, the price at the time), the firing triggers, which
 * chain links were broken, and the day's releases. Nothing new needs collecting. It
 * has simply never been read back.
 *
 * WHAT IT SCORES, AND WHAT IT REFUSES TO. Expected range against realised range is a
 * genuine, closeable question: the page published a number and the day either cleared
 * it or did not. Direction is scored ONLY where the page actually committed to a lean,
 * and reported as a tally rather than a verdict, because the lean record on this desk
 * is 19 of 33 — not yet clear of a coin flip. A single day never settles that, and
 * this panel says so rather than celebrating a good one.
 *
 * Pure: no fetch, no DOM. Tested in js/endOfDay.test.mjs.
 */

/** Percentage of the expected range the day actually used. */
const usedPct = (realised, expected) =>
  (realised == null || !(expected > 0)) ? null : +((realised / expected) * 100).toFixed(0);

/**
 * The pip size, taken from the SAME rule the page uses (`_pipSz` in today.html):
 * a JPY pair is 0.01, any other FX pair 0.0001, everything else 1 — which covers
 * indices and gold, whose canonical pip is 1.0 and NOT the 0.1 that js/utils.js
 * still carries.
 *
 * It is derived from the live row rather than a name table so a pair the page adds
 * later (a JPY cross, a new index) scores correctly the day it appears instead of
 * silently falling through to price units and reporting a 38-pip day as 0.0038.
 * The name table is only the fallback for a caller with no instrument metadata.
 */
const BY_NAME = { GOLD: [1, '$', 0], XAUUSD: [1, '$', 0] };
const fxUnit = s => [/JPY/.test(s) ? 100 : 10000, 'pips', 0];
function unitOf(name, live) {
  // `ac` is the page's own asset class and the only field that separates FX from an
  // index: every OANDA symbol carries an underscore, so `SPX500_USD` and `EUR_USD`
  // look identical to a shape test — and `JP225_USD` would have scored in pips.
  const ac = live?.ac ?? null;
  if (ac) return ac === 'fx' ? fxUnit(String(live.sym ?? '') + name) : (BY_NAME[name] ?? [1, 'pts', 0]);
  if (BY_NAME[name]) return BY_NAME[name];
  return /^[A-Z]{6}$/.test(name) ? fxUnit(name) : [1, 'pts', 0];
}

/**
 * Score one pair.
 *
 * `morning` is that pair's row from the snapshot's `plan.pairs`; `live` is the current
 * instrument row (needs `session_open` and `current_price`).
 *
 * The realised range comes from whichever of three sources the caller can supply, best
 * first, and the row says which one in `rangeFrom` — the number means different things:
 *
 *   high-low   an actual session high and low
 *   range-pct  the live session's H-L as a percent of price, which is the field this
 *              page already carries (`session.instruments[x].hl`) and the same unit
 *              `hl_med.pct` is quoted in, so the two are directly comparable
 *   open-to-now  |close − open|, the last resort. It UNDERSTATES a day that travelled
 *              and came back, which is exactly the day worth knowing about, so it is
 *              labelled rather than quietly averaged in with the others.
 */
export function scorePair(name, morning, live, { high = null, low = null, rangePct = null } = {}) {
  if (!morning || !live) return null;
  const [mult, unit, dp] = unitOf(name, live);
  const open = live.session_open ?? morning.price ?? null;
  const now = live.current_price ?? null;
  if (open == null || now == null) return null;

  const haveHL = Number.isFinite(high) && Number.isFinite(low) && high > low;
  const havePct = !haveHL && Number.isFinite(rangePct) && rangePct > 0;
  const realised = haveHL ? (high - low) * mult
    : havePct ? (open * rangePct / 100) * mult
    : Math.abs(now - open) * mult;
  const expected = Number.isFinite(morning.expRange) ? morning.expRange : null;
  const move = (now - open) * mult;

  // Direction is only scored where the page actually said something. "flat" is not a
  // wrong call, it is the absence of one, and counting it either way would flatter
  // or punish a record that is already barely distinguishable from a coin flip.
  const lean = String(morning.lean ?? '').toLowerCase();
  const committed = lean === 'up' || lean === 'down' || lean === 'bullish' || lean === 'bearish';
  const leanUp = lean === 'up' || lean === 'bullish';
  const leanRight = committed ? ((move > 0) === leanUp) : null;

  const used = usedPct(realised, expected);
  return {
    name, unit, dp,
    // carried so a caller can group the board without a second lookup table — the
    // brief needs to know an index from a currency pair to say anything about the day
    ac: live.ac ?? null,
    // today's regime and volatility percentile, so the brief can set them against the
    // ones the morning plan stored. Null on any day whose plan predates those fields,
    // which reads as silence rather than as a false "unchanged"
    regimeNow: live.regime?.label ?? null,
    regimeOkNow: live.regime?.reliable ?? null,
    volPctNow: live.vol_pct ?? null,
    open: +open.toFixed(dp + 2), now: +now.toFixed(dp + 2),
    move: +move.toFixed(dp), moveUp: move > 0,
    expected: expected == null ? null : +expected.toFixed(dp),
    realised: +realised.toFixed(dp),
    rangeFrom: haveHL ? 'high-low' : havePct ? 'range-pct' : 'open-to-now',
    used,
    movedPct: open ? +(((now / open) - 1) * 100).toFixed(2) : null,
    // the honest bands: under 60% is a quiet day, over 140% is one the forecast missed
    rangeVerdict: used == null ? null : used >= 140 ? 'over' : used <= 60 ? 'under' : 'about right',
    lean: committed ? (leanUp ? 'up' : 'down') : 'flat',
    leanRight,
    o5: morning.o5 ?? null, o5c: morning.o5c ?? null,
    o20: morning.o20 ?? null, o20c: morning.o20c ?? null,
  };
}

/**
 * The whole board, scored, plus the day's tallies.
 *
 * `leans` counts only pairs where the page committed, and carries `n` so a reader can
 * see the denominator — 3 of 4 and 3 of 12 are very different days.
 */
export const PLAN_WINDOW_UTC = { from: 6, to: 11 };   // 07:00-12:00 London in BST

/** Was this plan captured in the morning window, or just labelled as if it were? */
export function plannedInWindow(at) {
  const ms = Date.parse(at ?? '');
  if (!Number.isFinite(ms)) return false;
  const h = new Date(ms).getUTCHours();
  return h >= PLAN_WINDOW_UTC.from && h < PLAN_WINDOW_UTC.to;
}

export function endOfDay({ morning = null, live = {}, hl = {}, chainAM = null, chainPM = null } = {}) {
  const plan = morning?.plan?.pairs ?? null;
  if (!plan) return { ok: false, reason: 'no morning snapshot for today yet' };
  // A plan captured at 20:43 is not a morning plan, whatever the row calls it. Scoring
  // one would read 20 leans right out of 20 for the obvious reason, and a look-back that
  // flatters itself that hard is worse than no look-back. Seen live: the first version
  // of this gated on "after 06:00 UTC" only, and a tab opened in the evening wrote the
  // day's record minutes before it was read back.
  const at = morning?.plan?.at ?? null;
  if (!plannedInWindow(at)) return { ok: false, outOfWindow: true, plannedAt: at,
    reason: at ? `the day's plan was captured at ${String(at).slice(11, 16)} UTC, outside the 06:00-11:00 window — that is a snapshot of the afternoon, not a morning call, so there is nothing here to mark`
               : "the day's plan carries no timestamp, so it cannot be told apart from an afternoon snapshot" };

  const rows = [];
  for (const [name, m] of Object.entries(plan)) {
    // the full per-pair review, not just the range score: the board's headline counts
    // need the falsifiers and the aims, and a row the drawer opens needs them anyway
    const r = pairReview(name, m, live[name], hl[name] ?? {});
    if (r) rows.push(r);
  }
  if (!rows.length) return { ok: false, reason: 'the morning plan carried no pair this page can price' };

  const committed = rows.filter(r => r.leanRight !== null);
  const scored = rows.filter(r => r.used != null);

  // Which chain links changed state between the morning read and now. This is the bit
  // a re-read cannot give you: it needs both ends.
  let chain = null;
  if (Array.isArray(chainAM) && Array.isArray(chainPM)) {
    const am = new Map(chainAM.map(c => [c.id, !!c.broken]));
    const pm = new Map(chainPM.map(c => [c.id, !!c.broken]));
    const broke = [], healed = [];
    for (const [id, was] of am) {
      const is = pm.get(id);
      if (is === undefined) continue;
      if (!was && is) broke.push(id);
      if (was && !is) healed.push(id);
    }
    chain = { broke, healed, stillBroken: [...pm].filter(([id, v]) => v && am.get(id)).map(([id]) => id) };
  }

  return {
    ok: true,
    rows: rows.sort((a, b) => (b.used ?? -1) - (a.used ?? -1)),
    leans: { right: committed.filter(r => r.leanRight).length, n: committed.length },
    range: {
      n: scored.length,
      over: scored.filter(r => r.rangeVerdict === 'over').length,
      under: scored.filter(r => r.rangeVerdict === 'under').length,
      about: scored.filter(r => r.rangeVerdict === 'about right').length,
      medianUsed: scored.length ? [...scored].map(r => r.used).sort((a, b) => a - b)[Math.floor(scored.length / 2)] : null,
      // how many rows are on the weak measure, so the panel can say the board is
      // understated rather than presenting open-to-now as if it were a range
      weak: scored.filter(r => r.rangeFrom === 'open-to-now').length,
    },
    // What the page COMMITTED to, and what became of it. Kept apart from the direction
    // tally because they answer different questions: a lean can be right by the close
    // on a day its own falsifier traded, and a board that reported only the close
    // would never show you that.
    commitments: {
      nFalsifiers: rows.filter(r => r.wrongAt).length,
      falsified: rows.filter(r => r.wrongAt?.hit).length,
      nAims: rows.filter(r => r.aim).length,
      aimsPaid: rows.filter(r => r.aim?.hit).length,
      // how many of those verdicts rest on a real high/low rather than the close alone
      certain: rows.filter(r => (r.wrongAt?.certain ?? r.aim?.certain) === true).length,
    },
    chain,
    morningAt: morning?.brief?.generatedAt ?? morning?.at ?? null,
    // stated every time, because one good day proves nothing and this desk's own
    // lean record is 19 of 33 — not yet clear of a coin flip
    caveat: 'One day settles nothing. Expected range is a published number the day either cleared or did not, so it is scorable; direction is a tally against a record that has not yet beaten a coin flip.',
  };
}

/**
 * The per-pair look-back, for the drawer.
 *
 * The board pane above answers "how did the day go?". This answers "what did the page
 * commit to on THIS pair this morning, and what became of each commitment?" — the lean,
 * the price that would have falsified it, the aim, and the 5- and 20-session outlooks.
 *
 * TWO KINDS OF "WAS IT HIT". With a session high and low, a level either traded or it
 * did not, and that is a fact. With only the open and the current price, the most that
 * can be said is that price finished the far side of it — a level can be touched and
 * given back inside a single session, and reporting that as "never reached" would be
 * wrong. Every line carries `certain`, and a caller that hides it is reporting a guess
 * as a fact.
 *
 * The outlooks are NOT scored. A 5-session bias cannot be graded on day one, so they
 * are carried as standing commitments with the days left on them, which is the only
 * honest thing to say about them today.
 */
export function pairReview(name, morning, live, opts = {}) {
  const base = scorePair(name, morning, live, opts);
  if (!base) return null;
  const { high = null, low = null } = opts;
  const haveHL = Number.isFinite(high) && Number.isFinite(low) && high > low;
  const now = base.now, open = base.open;

  // did price reach `level` on the side that matters?
  const reached = (level, side) => {
    if (!Number.isFinite(level)) return null;
    const above = side === 'above';
    const hit = haveHL ? (above ? high >= level : low <= level)
                       : (above ? now >= level : now <= level);
    return { level, side, hit, certain: haveHL,
             how: haveHL ? 'traded there' : 'finished the far side of it' };
  };

  // The falsifier: the price the morning named as the one that would make the lean
  // wrong. Which side falsifies follows the lean, so a missing lean means no test.
  const wrongAt = Number.isFinite(morning.wrongAt)
    ? reached(morning.wrongAt, base.lean === 'up' ? 'below' : 'above')
    : null;
  const aim = morning.aim && Number.isFinite(morning.aim.target)
    ? { ...reached(morning.aim.target, morning.aim.side === 'below' ? 'below' : 'above'),
        lift: morning.aim.lift ?? null }
    : null;

  // The lean read three ways, because they can disagree and the disagreement is the
  // interesting part: the direction was right, the falsifier held, the aim paid.
  //
  // WHEN BOTH LEVELS TRADED, THE VERDICT SAYS SO AND STOPS. A high and a low carry no
  // order, so a day that reached both the aim and the falsifier cannot be graded from
  // them — the trade either paid or was stopped depending on a sequence this data does
  // not contain. Ranking the aim above the falsifier would resolve that silently in the
  // flattering direction on every such day, which is the single easiest way for a
  // look-back to drift into a backtest that always wins.
  const both = aim?.hit && wrongAt?.hit;
  const verdict = base.leanRight === null ? 'no call'
    : both ? 'the aim and the falsifier both traded — a high and a low cannot say which came first'
    : aim?.hit && base.leanRight ? 'right, and it paid'
    : base.leanRight && wrongAt?.hit ? 'right by the close, but the falsifier traded during the day'
    : base.leanRight ? 'right on direction'
    : wrongAt?.hit ? 'wrong, and the falsifier said so'
    : 'wrong, though the falsifier never triggered';

  return {
    ...base,
    agree: morning.agree ?? null,
    wrongAt, aim, verdict, unordered: !!both,
    // carried, not graded — a 5-session call is not answerable on day one
    standing: [
      morning.o5 && morning.o5 !== 'NEUTRAL' ? { horizon: '5 sessions', bias: morning.o5, confidence: morning.o5c ?? null } : null,
      morning.o20 && morning.o20 !== 'NEUTRAL' ? { horizon: '20 sessions', bias: morning.o20, confidence: morning.o20c ?? null } : null,
    ].filter(Boolean),
  };
}
