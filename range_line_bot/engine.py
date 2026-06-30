"""Range-Line Bot decision engine — pure, broker-agnostic, offline-testable.

Composes the golden-tested strategy bricks (build_ladder / ladder_side /
neighbours / trade_spec / chandelier_stop) into the §13/§15 live behaviour:

  * build the Asia (London-window) + Monday fib ladders from session bars — the
    IDENTICAL ladder the offline policy learned on (same labels → same cell keys),
  * on each tick, the first touch of a ladder level → look up the frozen fade/
    follow/skip policy → an order spec,
  * HELD POSITION: at most ONE position per (source, side) per session — the
    earliest non-skip touch wins, re-entry suppressed (matches the honest
    held-position model; the chandelier trail is managed by the bot loop).

No MT5, no network. The loop (range_line_bot.py) feeds prices/bars and routes
specs to a Broker, and trails the exit via ``strategy.chandelier_stop``.
"""
from datetime import datetime, timezone, timedelta

from pylego.strategy.rangeline import (
    build_ladder, ladder_side, neighbours, trade_spec, cell_key, body_range,
)

# Resample minutes per source (matches the backtest: Asia=5m bodies, Monday=15m).
SRC_MINUTES = {"A": 5, "M": 15}


def session_anchor_epoch(now_epoch, boundary_hour):
    """Most-recent ``boundary_hour:00`` UTC as an epoch — the range-window open.

    FIXED UTC (not DST-aware London) so the live window matches the FROZEN window
    the policy was learned on (the plan ships ``boundaryHour``). At the autumn
    clock change, re-freeze with ``boundaryHour=0`` and the bot follows (no drift).
    """
    now = datetime.fromtimestamp(now_epoch, tz=timezone.utc)
    anchor = now.replace(hour=int(boundary_hour) % 24, minute=0, second=0, microsecond=0)
    if anchor > now:
        anchor -= timedelta(days=1)
    return int(anchor.timestamp())


class RangeSession:
    """Per-instrument range/ladder state + one-shot, held-position bookkeeping."""

    def __init__(self, instrument, ladder_fibs, *, chand_frac=0.5):
        self.instrument = instrument
        self.ladder_fibs = list(ladder_fibs)
        self.chand_frac = chand_frac
        self.ladders = {}          # src_tag -> {low, high, levels:[{label,side,level,inner,outer,rung}]}
        self.acted = set()         # (label, side) decided once this session
        self.entered = set()       # (src_tag, side) with a position taken (held-position suppression)

    # ── ladder construction (call once the range is known) ────────────────────
    def set_range(self, src_tag, bars):
        """Build the ``src_tag`` ladder from its session bars (Asia window / Monday
        session). Returns True if a ladder was built."""
        br = body_range(bars, SRC_MINUTES.get(src_tag, 5))
        if not br:
            return False
        raw = build_ladder(br["low"], br["range"], src_tag, self.ladder_fibs)
        prices = [r["level"] for r in raw]
        levels = []
        for r in raw:
            side = ladder_side(r["level"], br["low"], br["high"])
            inner, outer = neighbours(r["level"], side, prices)
            if inner is None:
                continue           # extreme level, no barrier → not tradeable
            levels.append({"label": r["label"], "side": side, "level": r["level"],
                           "inner": inner, "outer": outer, "rung": abs(outer - r["level"])})
        self.ladders[src_tag] = {"low": br["low"], "high": br["high"], "levels": levels}
        return True

    def has_range(self, src_tag):
        return src_tag in self.ladders

    # ── decision (call each tick with the current price + frozen policy) ───────
    def decide(self, px, policy, *, dry_run=False):
        """Ladder levels newly touched this tick that map to a tradeable cell and
        whose (source, side) slot is still open. Marks them acted/entered so a
        level fires once and only ONE position opens per (source, side).

        ``dry_run=True`` marks touched levels acted but returns nothing — used after
        catch-up to prime levels price already crossed (never retro-enter).
        Returns specs: ``{instrument, src, label, side, decision, side_order, entry,
        protect_stop, rung, dir_up}``.
        """
        out = []
        for src_tag, lad in self.ladders.items():
            for lv in lad["levels"]:
                key = (lv["label"], lv["side"])
                if key in self.acted:
                    continue
                touched = (px >= lv["level"]) if lv["side"] == "up" else (px <= lv["level"])
                if not touched:
                    continue
                self.acted.add(key)                      # one decision per level per session
                if dry_run:
                    continue
                if (src_tag, lv["side"]) in self.entered:
                    continue                             # held position already open for this (src, side)
                decision = (policy.get(cell_key(lv["label"], lv["side"])) or {}).get("decision")
                if decision not in ("fade", "follow"):
                    continue                             # skip / unseen → no trade
                spec = trade_spec(lv["level"], lv["side"], decision, lv["inner"], lv["outer"])
                if not spec:
                    continue
                self.entered.add((src_tag, lv["side"]))  # take the slot (one per src/side)
                out.append({
                    "instrument": self.instrument, "src": src_tag, "label": lv["label"],
                    "side": lv["side"], "decision": decision,
                    "side_order": spec["side"], "entry": spec["entry"],
                    "protect_stop": spec["protect_stop"], "rung": spec["rung"],
                    "dir_up": spec["side"] == "buy",
                })
        return out
