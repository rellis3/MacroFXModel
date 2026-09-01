"""OI Gamma bot engine — the PURE execution logic (touch detection + one-shot state).

The strategy itself lives in JS (`js/oiZones.js buildOIZones`) and is shipped,
fully computed, in the `oi_bot_zones` plan artifact — this engine never re-derives
a level, a direction or a stop. It only decides WHEN a planned zone becomes
tradeable as live price moves, and guarantees each zone fires at most once
(the range-line "ship the plan" pattern → no JS/Python drift).

A zone from the plan is ``{mode, side, level, entry, sl, tp1, tp2, sizeFactor,
rationale, regime}`` (see js/oiZones.js). The trigger:

  • fade / break — ``entry`` is a price the market must travel TO. If the plan
    placed it ABOVE the plan spot, fire when price rises to it; if BELOW, fire
    when price falls to it. (Covers all four cases: fade-sell/​buy-break arm
    above, fade-buy/​break-sell arm below.)
  • maxpain — a "fade from wherever we are toward the pin" trade: fire on the
    next live tick, never primed away.

Priming: on plan load the bot calls ``decide(px, dry_run=True)`` once so any
fade/break zone price has ALREADY passed is marked primed (skip — never
retro-enter a wall the market left overnight). maxpain is exempt (it's meant to
enter near current price).

Pure: no network / clock / broker. Offline-testable (oi_bot/engine_test.py).
"""
from __future__ import annotations


def position_mode(comment: str) -> str | None:
    """Which MODE (fade/break/maxpain/react) a live position belongs to, parsed
    from the dedup tag its order comment carries ("OI [fade_sell_4300]", runner
    legs "[…~r]"). The time-based exit keys its per-mode max hold off this —
    the position itself is the only durable record once the plan has rolled.
    None when the comment has no recognisable tag (never guess a mode)."""
    c = str(comment or "")
    i, j = c.find("["), c.find("]")
    if i < 0 or j <= i + 1:
        return None
    mode = c[i + 1:j].split("~")[0].split("_")[0]
    return mode if mode in ("fade", "break", "maxpain", "react") else None


def zone_id(z: dict) -> str:
    """Stable one-shot key — same across intraday plan re-publishes so a restamped
    plan can't double-enter a zone already taken. The level is formatted compactly
    (``:g`` drops float noise like 2976.9500000000003 → 2976.95) so the id doubles
    as a short MT5 order comment / dedup tag."""
    lvl = z.get("level")
    lvl_s = f"{lvl:g}" if isinstance(lvl, (int, float)) else str(lvl)
    return f"{z.get('mode')}_{z.get('side')}_{lvl_s}"


def _tp(z: dict):
    """Bracket take-profit: TP1 (primary scale-out) if present, else TP2, else 0
    (SL-only). One broker-enforced TP — the scale-out ladder is a Stage-3 refinement."""
    if z.get("tp1") is not None:
        return float(z["tp1"])
    if z.get("tp2") is not None:
        return float(z["tp2"])
    return 0.0


def arm_above(z: dict, plan_spot: float) -> bool:
    """True when the entry sits at/above the plan spot → the market must RISE to it."""
    return float(z.get("entry", 0)) >= float(plan_spot or 0)


def should_fire(z: dict, px: float, plan_spot: float, tol: float = 0.0) -> bool:
    """Has live price reached this zone's entry from the side the plan placed it?

    maxpain fires on the next tick — but RE-VALIDATED against live price when the
    plan stamped ``minDist`` (the extended-from-pin threshold, price units): the
    build-time "price is extended" check is stale by the time the bot loads the
    plan (or restarts — maxpain is exempt from priming by design), and entering a
    reversion after price already reverted trades an edge that is spent. Fire only
    while price is still ≥ minDist from the pin ON THE PLANNED SIDE. Plans without
    minDist keep the old fire-immediately behaviour."""
    if z.get("mode") == "maxpain":
        try:
            md = float(z["minDist"]) if z.get("minDist") is not None else None
        except (TypeError, ValueError):
            md = None
        if md and md > 0:
            lvl = float(z.get("level", 0))
            if z.get("side") == "sell":
                return px - lvl >= md
            if z.get("side") == "buy":
                return lvl - px >= md
        return True
    entry = float(z.get("entry", 0))
    if arm_above(z, plan_spot):
        return px >= entry - tol
    return px <= entry + tol


def maxpain_stop(z: dict, px: float) -> float | None:
    """Max-pain protective stop RE-ANCHORED to live price — or None when the plan
    didn't ship the ingredients (an older plan shape → caller keeps the stamped ``sl``).

    Mode C is the only mode whose stop the planner derives from SPOT, and that spot is
    the OI capture's (once a day, paired to the futures for the basis). A wall fade's
    ``wall ± buf`` is the same number all session; ``spot ± dist`` is not, and by
    mid-session it can sit the WRONG SIDE of the market — a max-pain buy whose stop is
    above the bid, rejected by the broker on every retry because a rejection keeps the
    zone open. So the plan ships day-static ingredients (``slGuardWall`` is a strike,
    ``slFrac``/``slFloor`` are constants) and the distance is resolved HERE, at ``px``:

        dist = max(slFloor, min(guard-wall distance, slFrac × live distance to the pin))

    mirroring the planner's own resolution. The guard wall only counts while it is still
    on the protective side of ``px`` (price that has already traded through it is past
    its protection — fall back to the pin-fraction cap alone). ``slFrac`` caps the stop
    at a fraction of the run to the target, so reward:risk ≥ 1/slFrac stays true against
    the LIVE pin distance, which is the invariant the plan-time number silently lost."""
    if px is None:
        return None
    try:
        px = float(px)
        level = float(z["level"])
        floor = float(z.get("slFloor") or 0)
        frac = float(z.get("slFrac") or 0)
        wall = z.get("slGuardWall")
        wall = float(wall) if wall is not None else None
    except (KeyError, TypeError, ValueError):
        return None
    up = z.get("side") == "buy"
    cands = []
    if wall is not None and ((wall < px) if up else (wall > px)):
        cands.append(abs(px - wall) + floor)
    if frac > 0:
        cands.append(frac * abs(level - px))
    if not cands:                                  # no guard wall and the cap switched off
        try:
            cands.append(float(z["slDist"]))       # the planner's own resolution
        except (KeyError, TypeError, ValueError):
            return None                            # nothing to anchor with → keep the plan's sl
    dist = max(floor, min(cands))
    if dist <= 0:
        return None
    return round(px - dist if up else px + dist, 6)


def make_spec(instrument: str, z: dict, px: float | None = None) -> dict:
    """A ready-to-execute order spec from a fired zone (direction, protective stop,
    take-profit, size multiplier + the rationale for the comment/audit). Carries the
    plan's hold-score/conviction stamps through so the executor can log them as the
    trade's features (the hold-calibration inputs).

    With a live ``px``, a max-pain zone's entry and stop are re-anchored to it (see
    ``maxpain_stop``); every other mode is strike-anchored and passes through unchanged.
    ``sl_anchor`` says which happened ('live' / 'plan') — a max-pain spec that reports
    'plan' is running on a stop that could be hours stale, and the executor says so
    rather than letting the fallback go quiet."""
    entry = float(z.get("entry", 0))
    sl = float(z["sl"]) if z.get("sl") is not None else None
    anchor = "plan"
    if z.get("mode") == "maxpain" and px is not None:
        live_sl = maxpain_stop(z, px)
        if live_sl is not None:
            entry, sl, anchor = float(px), live_sl, "live"
    return {
        "instrument": instrument,
        "zone_id": zone_id(z),
        "mode": z.get("mode"),
        "side": z.get("side"),
        "dir_up": z.get("side") == "buy",
        "entry": entry,
        "level": z.get("level"),
        "sl": sl,
        "sl_anchor": anchor,
        "tp": _tp(z),
        "tp2": float(z["tp2"]) if z.get("tp2") is not None else None,   # runner target (scale-out)
        "size_factor": float(z.get("sizeFactor", 1.0) or 1.0),
        "regime": z.get("regime"),
        "rationale": z.get("rationale", ""),
        "hold": z.get("hold"),
        "hold_parts": z.get("holdParts"),
        "conviction": z.get("conviction"),
    }


def stack_conflict(symbols, dir_up: bool, entry: float, open_positions: list,
                   min_dist: float) -> dict | None:
    """Return the first OPEN position that would make a new entry a redundant stack —
    same instrument (any spelling in ``symbols``), same direction, and within
    ``min_dist`` (price units) of ``entry`` — else ``None``.

    Two zones that point the same way at nearly the same price are ONE bet, not two
    (the wall fade + the max-pain reversion + a react-at-levels long all cluster near
    the pin), so opening both silently doubles the open risk on a single directional
    view — exactly what the Effective-Bets panel flags. The executor uses this to
    refuse (defer, not burn) the second one.

    ``symbols`` is a set/collection because the broker book may key by the canonical
    key (paper) or the venue symbol (MT5) — pass both. ``min_dist <= 0`` only blocks
    an exact-price duplicate; a negative ``min_dist`` disables the check entirely."""
    if min_dist is None or min_dist < 0:
        return None
    want = "BUY" if dir_up else "SELL"
    for p in (open_positions or []):
        if p.get("symbol") not in symbols or p.get("direction") != want:
            continue
        op = p.get("open_price")
        if op is None:
            continue
        try:
            if abs(float(op) - float(entry)) <= min_dist:
                return p
        except (TypeError, ValueError):
            continue
    return None


class OISession:
    """Per-instrument execution state: the plan's zones + one-shot bookkeeping.

    ``primed``  — fade/break zones already triggered when the plan loaded (skip).
                  A DICT keyed by zone_id → a record of WHEN and at WHAT PRICE it
                  was primed ({at, price, entry, plan_spot, side, mode, past}), so a
                  "hit but no trade" is legible: you can see whether the zone was
                  marked while price sat on the level or long after it had left, and
                  how far past the entry price already was (``past``).
    ``entered`` — zones a position has been opened for (fire once, ever).
    ``touches`` — how many times price has REACHED each zone's trigger (rising-edge
                  count) — telemetry for the hold-score calibration (a first-touch
                  fade and a fourth-test fade are different trades).
    ``streak``  — consecutive firing ticks per zone; break zones only emit once the
                  streak reaches ``break_confirm`` (the wick filter: a single poke
                  through wall+breakPips on a 3s poll is not a decisive break)."""

    def __init__(self, instrument: str, spot: float, zones: list | None = None):
        self.instrument = instrument
        self.spot = float(spot or 0)
        self.zones = list(zones or [])
        self.primed: dict[str, dict] = {}
        self.entered: set[str] = set()
        self.touches: dict[str, int] = {}
        self.streak: dict[str, int] = {}
        self._firing: dict[str, bool] = {}       # last-tick trigger state (edge detection)

    def set_zones(self, spot, zones) -> None:
        """Adopt a refreshed plan slice WITHOUT losing one-shot state (a re-published
        plan keeps the same zone_ids, so ``entered``/``primed`` still apply)."""
        if spot:
            self.spot = float(spot)
        self.zones = list(zones or [])

    def decide(self, px: float, dry_run: bool = False, tol: float = 0.0, now: float | None = None,
               break_confirm: int = 0) -> list:
        """Zones that fire at ``px`` this tick. ``dry_run`` primes (marks fade/break
        zones already past their entry) instead of returning specs — used once on
        load so overnight crossings don't retro-enter. ``now`` (epoch seconds, injected
        so the engine stays clock-free) is stamped onto each new primed record; with
        the price + entry it makes clear whether a zone was primed on the level or
        long after price had left it.

        ``break_confirm`` (live ticks only): a ``break`` zone must satisfy its trigger
        on this many CONSECUTIVE decide() calls before it fires — a wick through the
        trigger on one poll is not a decisive break. 0 = fire on first touch
        (unchanged). Touch counts (rising edges of the trigger) are kept per zone."""
        if px is None:
            return []
        out = []
        for z in self.zones:
            zid = zone_id(z)
            if zid in self.entered or zid in self.primed:
                continue
            firing = should_fire(z, px, self.spot, tol)
            if not dry_run:
                if firing and not self._firing.get(zid, False):
                    self.touches[zid] = self.touches.get(zid, 0) + 1
                self._firing[zid] = firing
                self.streak[zid] = (self.streak.get(zid, 0) + 1) if firing else 0
            if not firing:
                continue
            if dry_run:
                if z.get("mode") != "maxpain":     # maxpain enters near current price → never primed away
                    entry = float(z.get("entry", 0))
                    self.primed[zid] = {
                        "at": now, "price": float(px), "entry": entry,
                        "plan_spot": self.spot, "side": z.get("side"), "mode": z.get("mode"),
                        "past": round(abs(float(px) - entry), 6),   # how far price was ALREADY past the entry
                    }
            else:
                if z.get("mode") == "break" and break_confirm > 0 and self.streak.get(zid, 0) < break_confirm:
                    continue                        # dwell not met yet — wick filter
                out.append(make_spec(self.instrument, z, px))
        return out

    def mark_entered(self, zid: str) -> None:
        self.entered.add(zid)
