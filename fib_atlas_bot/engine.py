"""fib_atlas_bot engine — the PURE, offline-testable pieces: the bot-side
rearm state machine and the chandelier trailing-stop math. No network, no
clock, no MT5, no broker — everything here is a small function/class fed
plain values, exactly like volatility_bot_v2/engine.py's split (this file
has zero I/O; fib_atlas_bot.py owns all of that).

The strategy itself (which rungs are armed-with-a-vote, the entry/sl/tp
prices, margin, decision) is computed entirely server-side (server.js's
`_refreshFibAtlasPlan` over `js/asiaFibAtlasRoutes.js` / `js/mondayFibAtlas
Routes.js`'s already-validated `voteDecision` + rung-pricing math) and
shipped, fully priced, in the `fib_atlas_bot_plan` KV artifact. This engine
never re-derives a vote, a level, or a stop.

Three things this engine DOES own, all deliberately left to the bot by the
plan producer's own doc (see asiaFibAtlasRoutes.js's `asiaLivePlanZones`
comment block):

  1. RearmTracker — "has price crossed this rung's trigger, and is it
     currently eligible to fire" — the SAME live-tick-watching job the bot
     already has to do for its own entry trigger, so replicating it
     server-side would just be exposing the walk's internal bookkeeping for
     no new information. Mirrors `js/asiaFibAtlasEngine.js`'s
     `asiaFibAtlasWalk` `armed`/`rearmDist` state machine — see that
     class's own docstring for exactly how, and where this is a documented
     simplification rather than a bit-identical port.

  2. chandelier_stop() — a NEW execution behavior (volatility_bot_v2 has no
     equivalent): once a position is open, trail its SL behind the best
     price reached using `chandelier_mult x ATR(60, M1)`, only ever
     tightening. The ATR formula here is a confirmed, deliberate match to
     `js/levelAtlasVoteReview.js`'s `rollingATR` (Wilder-EMA smoothing,
     k=1/period, seeded at the first bar's own high-low) — that exact
     function (via `applyTrailingContinuation`) is what
     `analysis/fib_atlas_chandelier_exit_backtest.mjs` /
     `analysis/fib_atlas_chandelier_walkforward.mjs` used to validate this
     bot's own frozen per-ladder multipliers (Asia 3.0, Monday 1.5) — see
     chandelier_stop()'s own docstring for the one real (and disclosed, not
     hidden) way this live version still differs from that backtest's math.

  3. occupied_directions() — hedge-only concurrency (2026-09-03, owner
     review of live paper results vs backtest). `js/levelAtlasVoteReview.js`'s
     `applyConcurrencyCap({perDirection:true, maxConcurrent:1})` is what was
     actually OOS-validated for this bot's exit stack
     (`analysis/fib_atlas_chandelier_exit_backtest.mjs` STEP 3 — "hedgeOnly":
     Asia OOS Sharpe 19.47->19.49, Monday 12.85->13.07, both re-tested after
     the duplicate-counting correction, see LEGO_MODULES.md) — but that
     function is a BATCH replay over an already-fully-resolved trade list
     (it reads each trade's own future `resolveTime`), so it cannot run as a
     live, tick-by-tick admission check; nothing in this repo ported it to a
     live equivalent before this bot shipped, which is the actual reason a
     real paper-trading review (2026-09-03) found EURGBP repeatedly stacking
     several same-direction rungs on one trending day — never validated,
     just never explicitly blocked either. This function is that live port:
     "is a position of the SAME direction already open for this
     (pair, ladder)" — at most 1 long AND 1 short at once, same-direction
     pyramiding blocked outright. `fib_atlas_bot.py`'s own
     `max_concurrent_per_pair` stays as a secondary flat safety cap (now
     effectively redundant once this binds, not wrong).
"""
from __future__ import annotations


# ── RearmTracker ─────────────────────────────────────────────────────────────
class RearmTracker:
    """Per-(pair, ladder, side, rung) touch/rearm state machine.

    The plan ships every rung the vote currently favors (margin >= 2), fully
    priced, but does NOT say whether THIS particular instant is a fresh,
    tradeable touch of that rung or just "price is still sitting past it
    from an earlier touch today" — that's a live, tick-by-tick fact the plan
    producer can't know without re-implementing this bot's own price watch,
    so it's left here (see this module's docstring, and asiaFibAtlasRoutes.
    js's own extensive comment on the same point).

    Reimplements `js/asiaFibAtlasEngine.js`'s `asiaFibAtlasWalk` rearm state
    machine:
        let armed = true;
        ...
        if (!armed) {
          const away = isAbove ? (here - bar.close) : (bar.close - here);
          if (away >= rearmDist) armed = true;
          continue;                      // <- never fires on the SAME bar it re-arms
        }
        if (!reach(px, here)) continue;
        armed = false;                    // fires -> immediately un-arms

    Two DELIBERATE, DISCLOSED differences from that JS walk (not bit-
    identical, not meant to be — a live tick stream isn't a fixed M1 bar
    series):

      1. The JS walk measures "away" (the rearm distance) off each bar's
         CLOSE, but the touch/reach itself off each bar's HIGH/LOW (wick).
         A live price stream has no separate open/high/low/close per
         instant — there is only "the current price" — so both checks here
         use the same single `current_price` each call. On a fast, wicky
         market this can rearm very slightly sooner/later than the JS walk
         would judging the same path from 1-minute bars; on the timescale
         a rearm distance operates at (a real fraction of a rung's own
         span) this is not expected to matter in practice, but it is a
         real, disclosed difference, not asserted to be equivalent.

      2. `rearm_dist` (the price distance price must travel back before a
         rung re-arms) is computed by the CALLER, not this class — see
         `rearm_distance()` below for exactly how, and why it is a
         documented proxy for the walk's own `rungSpan`, not a guess.

    Usage — call `touch()` once per (pair, ladder, side, rung) key, every
    tick the zone is present in the current plan:

        tracker = RearmTracker()
        fired = tracker.touch(key, side, rung_price, session_date,
                               current_price, rearm_dist)
        if fired:
            ... take the trade ...
    """

    def __init__(self):
        self._armed: dict[str, bool] = {}
        self._date: dict[str, str] = {}

    def touch(self, key: str, side: str, rung_price: float, session_date: str,
              current_price: float, rearm_dist: float) -> bool:
        """Returns True exactly on a fresh, currently-armed touch of `rung_price`
        — the caller should treat that, and only that, as a real entry
        trigger. `side` is 'above' (rung sits above the range, approached
        from below: fires on `current_price >= rung_price`) or 'below'
        (approached from above: fires on `current_price <= rung_price`) —
        the same 'above'/'below' the plan's own `zone['side']` carries.
        `session_date` is the plan slice's own `date` field for this
        (pair, ladder) — a change resets this key's state fresh (a new
        day's rungs are a new instance, even if the price level happens to
        coincide with yesterday's), matching the JS walk's own per-day
        window reset.
        """
        is_fresh = key not in self._date or self._date[key] != session_date
        is_above = side == "above"
        reached = current_price >= rung_price if is_above else current_price <= rung_price

        if is_fresh:
            self._date[key] = session_date
            # PRIME, don't fire, on the very first observation of a
            # (key, date): if price is ALREADY past the rung the first time
            # this bot (or this rung's plan entry) ever sees it, that
            # crossing already happened before there was a live tick to
            # judge it against — there is no real "edge" to trade, only a
            # stale fact. Mirrors volatility_bot_v2's own dry_run priming
            # (VoteSession.decide) and oi_bot's identical discipline: never
            # retro-enter a level price has already left, especially right
            # after a restart. Still starts the day's cycle ARMED (per this
            # class's own contract below) when price has NOT already
            # reached it -- priming only ever suppresses the very first
            # tick's fire, it never permanently disarms a key.
            self._armed[key] = not reached
            return False

        if not self._armed.get(key, True):
            away = (rung_price - current_price) if is_above else (current_price - rung_price)
            if away >= rearm_dist:
                self._armed[key] = True
            # Never fires the SAME tick it re-arms -- mirrors the JS walk's
            # `continue` right after `armed = true`, which only starts
            # checking `reach()` again from the NEXT bar.
            return False

        if reached:
            self._armed[key] = False
            return True
        return False

    def is_armed(self, key: str) -> bool:
        """Side-effect-free read of the current armed state, for a status
        display -- True (unknown key) rather than False, matching the
        class's own default-armed contract."""
        return self._armed.get(key, True)


def rearm_distance(zone: dict) -> float:
    """The live counterpart of `asiaFibAtlasWalk`'s `rearmDist = rearmFrac *
    rungSpan` — in PRICE units, ready to feed straight into
    `RearmTracker.touch`'s `rearm_dist` argument.

    The plan does not ship the ladder's raw rung prices (only the ALREADY-
    priced current zone), so `rungSpan` itself is not directly available —
    it has to be reconstructed from the zone's own `targetPips`/
    `sizingStopPips` fields. This reconstruction is EXACT, not a guess:
    read straight from the plan producer's own source
    (`js/asiaFibAtlasRoutes.js`'s `asiaLivePlanZones`, mirrored byte-for-
    byte by `js/mondayFibAtlasRoutes.js`'s `mondayLivePlanZones`):

        targetPips     = decision === 'fade' ? innerDistPips : outerDistPips
        sizingStopPips = decision === 'fade' ? outerDistPips : innerDistPips

    where `innerDistPips` (from `asiaRungBarrierPips`) is, by construction,
    EXACTLY `rungSpan` in pips (`Math.abs(here - inner)`, the same
    neighbour-rung distance `asiaFibAtlasWalk`'s hot loop uses for
    `rearmDist`). Solving for `innerDistPips` from the two assignments
    above:

        rungSpan_pips = targetPips      if decision == 'fade'
                      = sizingStopPips   if decision == 'follow'

    This is therefore the EXACT rungSpan the backtest's own rearm math
    uses, not the "min(targetPips, sizingStopPips)" fallback proxy — worth
    flagging plainly since it is easy to reach for the wrong one of the two
    fields by pattern-matching the names alone (`sizingStopPips` reads like
    it should be the "stop", not the span; it is only the span for a
    'follow' zone specifically because of how the sizing-vs-stop split
    works, per the assignments above).

    Converted to PRICE units via the zone's own `pip` field (already the
    correct per-instrument pip size, straight from the plan).
    """
    rung_span_pips = zone["targetPips"] if zone.get("decision") == "fade" else zone["sizingStopPips"]
    rearm_frac = float(zone.get("rearmFrac", 0.3) or 0.3)
    pip = float(zone.get("pip") or 0.0001)
    return rearm_frac * float(rung_span_pips) * pip


# ── direction ────────────────────────────────────────────────────────────────
def zone_is_long(zone: dict) -> bool:
    """LONG/SHORT for a zone, read straight off its OWN already-computed
    entry/tp (tp above entry -> long, tp below entry -> short) rather than
    re-deriving it from `side`+`decision`. Deliberate: this bot must never
    compute strategy logic itself (see this module's docstring), and the
    side+decision -> direction mapping is genuinely NOT a fixed, guessable
    rule here -- reading the real `asiaLivePlanZones`/`mondayLivePlanZones`
    source shows BOTH `decision`s at a given `side` price the SAME
    direction (an 'above' touch is always long, a 'below' touch always
    short; fade vs follow only changes which neighbour-rung distance
    becomes the target vs the stop, not the trade's direction) -- reading
    the zone's own tp-vs-entry sign gets this right unconditionally,
    without depending on that convention holding forever.
    """
    return float(zone["tp"]) > float(zone["entry"])


# ── hedge-only concurrency ───────────────────────────────────────────────────
def occupied_directions(open_book: list[dict], ticket_ladder: dict[int, str],
                         pair_sym_set: set[str], ladder: str) -> set[str]:
    """Which direction(s) ('BUY'/'SELL') are ALREADY open for this specific
    (pair, ladder) right now, from the broker's own `serialize_open_positions()`
    shape (each row a dict with 'ticket'/'symbol'/'direction'). Pure: takes the
    caller's already-computed `pair_sym_set` (the broker-symbol spellings for
    this pair, e.g. `{eurgbp, EURGBP, ...}` — see fib_atlas_bot.py's own
    `pair_sym_set` construction) rather than re-deriving broker symbol
    resolution here, and the caller's own `ticket_ladder` map (a position
    carries no ladder field at the broker level — only this bot's own
    bookkeeping knows which ladder opened which ticket).

    The caller (`run()`'s entry loop) checks the candidate zone's own
    direction against this set BEFORE entering — if already present, that
    direction is at its hedge-only budget of 1 and the touch is skipped, same
    precedent as the existing risk-budget skip (the touch still consumes the
    RearmTracker's fire/un-arm, it just doesn't place an order this time).
    Call once per (pair, ladder) tick, then `.add()` the new direction locally
    after each fill within that same tick — mirrors how `open_for_pair` is
    already tracked incrementally in the same loop.
    """
    occ = set()
    for p in open_book:
        if p.get("symbol") not in pair_sym_set:
            continue
        if ticket_ladder.get(p.get("ticket")) != ladder:
            continue
        occ.add(p.get("direction"))
    return occ


# ── chandelier trailing stop ─────────────────────────────────────────────────
def _true_range(high: float, low: float, prev_close: float) -> float:
    return max(high - low, abs(high - prev_close), abs(low - prev_close))


def chandelier_stop(bars: list[dict], mult: float, period: int = 60,
                     is_long: bool = True) -> float | None:
    """Chandelier trailing-stop level from a list of OHLC bars (each a dict
    with 'high'/'low'/'close', e.g. `broker.session_bars(pair, since_epoch)`
    — Mt5Broker's own M1-bar shape, oldest-first):

        new_sl = best_price_in(bars) -/+ mult * ATR(period)

    (`-` for a long: the stop trails BELOW the best/highest price reached;
    `+` for a short: it trails ABOVE the best/lowest price reached).

    ATR is a SIMPLE-to-state but CONFIRMED-not-guessed match: Wilder-EMA
    smoothing (k = 1/period), seeded at the first bar's own high-low, one
    True-Range step per subsequent bar -- byte-for-byte the same recurrence
    as `js/levelAtlasVoteReview.js`'s `rollingATR` (and `js/indicatorCore.
    js`'s `trueRange`/`atrWilder`, the bar-object-array twin it's built
    from). That exact function, via `applyTrailingContinuation`, is what
    `analysis/fib_atlas_chandelier_exit_backtest.mjs` and
    `analysis/fib_atlas_chandelier_walkforward.mjs` used to pick THIS bot's
    own frozen chandelier_mult constants (Asia 3.0, Monday 1.5, period 60)
    -- this is not "a standard ATR, believed equivalent", it is the actual
    formula those backtests ran, located and read in this repo.

    ONE real, disclosed difference from that backtest math, not hidden:
    `rollingATR` there runs as ONE continuous EMA over a pair's entire M1
    history (seeded once, years ago) — a Wilder EMA needs on the order of
    a few multiples of `period` bars to fully forget its seed. This
    function seeds fresh at `bars[0]` every time it's called, so if the
    caller passes a short bars window (e.g. only the bars since a JUST-
    opened position), the very first ATR readings carry real seed bias
    versus the backtest's fully-converged long-run EMA. In practice the
    caller should pass a generously long bars window (materially more than
    `period` bars — several hours of M1, not just the position's own young
    life) so the EMA has room to converge before its value is trusted; this
    is a live-execution compromise (a real position's own bars are often
    too short early on), not a formula error.

    Returns None when `bars` is empty (no True Range, no best price, at
    all computable).
    """
    if not bars:
        return None
    atr = bars[0]["high"] - bars[0]["low"]
    k = 1.0 / period if period > 0 else 1.0
    prev_close = bars[0]["close"]
    for b in bars[1:]:
        tr = _true_range(b["high"], b["low"], prev_close)
        atr = k * tr + (1 - k) * atr
        prev_close = b["close"]

    if is_long:
        best = max(b["high"] for b in bars)
        return best - mult * atr
    best = min(b["low"] for b in bars)
    return best + mult * atr
