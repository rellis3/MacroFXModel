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
    maxpain fires immediately (fade from current toward the pin)."""
    if z.get("mode") == "maxpain":
        return True
    entry = float(z.get("entry", 0))
    if arm_above(z, plan_spot):
        return px >= entry - tol
    return px <= entry + tol


def make_spec(instrument: str, z: dict) -> dict:
    """A ready-to-execute order spec from a fired zone (direction, protective stop,
    take-profit, size multiplier + the rationale for the comment/audit)."""
    return {
        "instrument": instrument,
        "zone_id": zone_id(z),
        "mode": z.get("mode"),
        "side": z.get("side"),
        "dir_up": z.get("side") == "buy",
        "entry": float(z.get("entry", 0)),
        "level": z.get("level"),
        "sl": float(z["sl"]) if z.get("sl") is not None else None,
        "tp": _tp(z),
        "size_factor": float(z.get("sizeFactor", 1.0) or 1.0),
        "regime": z.get("regime"),
        "rationale": z.get("rationale", ""),
    }


class OISession:
    """Per-instrument execution state: the plan's zones + one-shot bookkeeping.

    ``primed``  — fade/break zones already triggered when the plan loaded (skip).
    ``entered`` — zones a position has been opened for (fire once, ever)."""

    def __init__(self, instrument: str, spot: float, zones: list | None = None):
        self.instrument = instrument
        self.spot = float(spot or 0)
        self.zones = list(zones or [])
        self.primed: set[str] = set()
        self.entered: set[str] = set()

    def set_zones(self, spot, zones) -> None:
        """Adopt a refreshed plan slice WITHOUT losing one-shot state (a re-published
        plan keeps the same zone_ids, so ``entered``/``primed`` still apply)."""
        if spot:
            self.spot = float(spot)
        self.zones = list(zones or [])

    def decide(self, px: float, dry_run: bool = False, tol: float = 0.0) -> list:
        """Zones that fire at ``px`` this tick. ``dry_run`` primes (marks fade/break
        zones already past their entry) instead of returning specs — used once on
        load so overnight crossings don't retro-enter."""
        if px is None:
            return []
        out = []
        for z in self.zones:
            zid = zone_id(z)
            if zid in self.entered or zid in self.primed:
                continue
            if not should_fire(z, px, self.spot, tol):
                continue
            if dry_run:
                if z.get("mode") != "maxpain":     # maxpain enters near current price → never primed away
                    self.primed.add(zid)
            else:
                out.append(make_spec(self.instrument, z))
        return out

    def mark_entered(self, zid: str) -> None:
        self.entered.add(zid)
