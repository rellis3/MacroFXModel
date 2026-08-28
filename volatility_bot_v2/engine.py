"""volatility_bot_v2 (Level Atlas Vote Portfolio) engine — the PURE execution
logic (touch detection + one-shot state). Mirrors oi_bot/engine.py's shape and
contract exactly (same split: this file has no network/clock/broker; the
executor in volatility_bot_v2.py owns all of that).

The strategy itself lives in JS (js/levelAtlasVoteReview.js's voteDecision +
priceBarrierTrade) and is shipped, fully computed and priced, in the
volatility_bot_v2_plan artifact (server.js's _refreshVolatilityV2Plan) — this
engine never re-derives a vote, a level, or a stop. It only decides WHEN a
planned zone becomes tradeable as live price moves, and guarantees each zone
fires at most once.

A zone from the plan is {zone_id, side, rung, decision, margin, entry, sl, tp,
rationale} (see server.js's _volatilityV2PriceZone). Unlike OI's fade/break/
maxpain modes, Level Atlas has exactly ONE trigger shape: price must reach
`entry` (== the rung's level) from the direction its own `side` implies — an
'up' rung is approached from below (arm while price < entry, fire once price
>= entry); a 'down' rung is approached from above (fire once price <= entry).
There is no OI-style "compare entry to plan spot" step because `side` already
encodes which way price must travel.

Pure: no network / clock / broker. Offline-testable (engine_test.py).
"""
from __future__ import annotations


def bet_direction(zone: dict) -> str:
    """Which way a decision+side actually bets, in market terms — mirrors
    js/levelAtlasVoteReview.js's betDirection EXACTLY (a wrong sign here would
    silently trade the opposite of what the backtest validated). A fade on an
    up-touch bets DOWN (price faded back toward the level from above); a
    follow on an up-touch bets UP (price kept going the way it was already
    moving). Returns 'long' or 'short'.
    """
    with_side = zone.get("decision") == "follow"
    is_up = zone.get("side") == "up"
    return "long" if with_side == is_up else "short"


def arm_above(zone: dict) -> bool:
    """True when price must RISE to reach this zone's entry — determined
    purely by `side` ('up' rungs sit above the session open, 'down' rungs
    below it), unlike oi_bot's zones where the arm direction is inferred by
    comparing entry to the plan spot."""
    return zone.get("side") == "up"


def should_fire(zone: dict, px: float, tol: float = 0.0) -> bool:
    """Has live price reached this zone's entry from the side its own `side`
    implies? `tol` (price units) is the same touch-tolerance slack oi_bot
    uses around an entry level."""
    entry = float(zone.get("entry", 0))
    if arm_above(zone):
        return px >= entry - tol
    return px <= entry + tol


def zone_key(zone: dict) -> str:
    """The zone's own stable id, straight from the plan — server.js's
    `_refreshVolatilityV2Plan` already makes this unique per (pair, date,
    side, rung, rearm-instance) and stable across polls for the CURRENT armed
    instance. A thin wrapper (not `zone['zone_id']` inline everywhere) so a
    future id-scheme change has one call site."""
    return zone["zone_id"]


def make_spec(instrument: str, z: dict) -> dict:
    """A ready-to-execute order spec from a fired zone — mirrors
    oi_bot.engine.make_spec's contract (instrument/zone_id/dir_up/entry/sl/tp/
    rationale), minus fields Level Atlas has no equivalent of (mode/regime/
    hold/tp2 — there is no scale-out ladder here, one bracket per zone)."""
    dir_up = bet_direction(z) == "long"
    return {
        "instrument": instrument,
        "zone_id": zone_key(z),
        "side": z.get("side"),
        "rung": z.get("rung"),
        "decision": z.get("decision"),
        "dir_up": dir_up,
        "entry": float(z.get("entry", 0)),
        "sl": float(z["sl"]) if z.get("sl") is not None else None,
        "tp": float(z["tp"]) if z.get("tp") is not None else None,
        "margin": z.get("margin"),
        "rationale": z.get("rationale", ""),
    }


def stack_conflict(symbols, dir_up: bool, entry: float, open_positions: list,
                    min_dist: float) -> dict | None:
    """Same contract as oi_bot.engine.stack_conflict — the first OPEN position
    that would make a new entry a redundant same-direction stack near an
    already-open one on this instrument, else None. `min_dist < 0` disables
    the check; `min_dist is None` also disables it (fail open, not closed —
    a missing config value must not silently block every entry)."""
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


class VoteSession:
    """Per-instrument execution state: the plan's zones + one-shot bookkeeping.
    Mirrors oi_bot.engine.OISession's contract (primed/entered/decide/
    set_zones/mark_entered) minus the OI-specific streak/break-confirm
    machinery Level Atlas has no use for (there is no 'break' dwell filter
    here — every zone fires on first touch, the same discipline the backtest
    itself uses).

    ``primed``  — zones already triggered when the plan loaded (skip — never
                  retro-enter a level price has already left).
    ``entered`` — zones a position has been opened for (fire once, ever).
    ``touches`` — how many times price has REACHED each zone's trigger
                  (rising-edge count) — telemetry only, mirrors oi_bot's.
    """

    def __init__(self, instrument: str, zones: list | None = None):
        self.instrument = instrument
        self.zones = list(zones or [])
        self.primed: dict[str, dict] = {}
        self.entered: set[str] = set()
        self.touches: dict[str, int] = {}
        self._firing: dict[str, bool] = {}   # last-tick trigger state (edge detection)

    def set_zones(self, zones) -> None:
        """Adopt a refreshed plan slice WITHOUT losing one-shot state (a
        re-published plan keeps the same zone_ids for a still-armed instance,
        so entered/primed still apply — a NEW rearm gets a NEW zone_id from
        the producer, so it naturally starts fresh)."""
        self.zones = list(zones or [])

    def decide(self, px: float, dry_run: bool = False, tol: float = 0.0,
               now: float | None = None) -> list:
        """Zones that fire at `px` this tick. `dry_run` primes (marks zones
        already past their entry) instead of returning specs — used once on
        plan load so an overnight crossing can't retro-enter. `now` (epoch
        seconds, injected so the engine stays clock-free) is stamped onto
        each new primed record."""
        if px is None:
            return []
        out = []
        for z in self.zones:
            zid = zone_key(z)
            if zid in self.entered or zid in self.primed:
                continue
            firing = should_fire(z, px, tol)
            if not dry_run:
                if firing and not self._firing.get(zid, False):
                    self.touches[zid] = self.touches.get(zid, 0) + 1
                self._firing[zid] = firing
            if not firing:
                continue
            if dry_run:
                entry = float(z.get("entry", 0))
                self.primed[zid] = {
                    "at": now, "price": float(px), "entry": entry,
                    "side": z.get("side"), "decision": z.get("decision"),
                    "past": round(abs(float(px) - entry), 6),
                }
            else:
                out.append(make_spec(self.instrument, z))
        return out

    def mark_entered(self, zid: str) -> None:
        self.entered.add(zid)
