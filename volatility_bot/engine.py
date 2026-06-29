"""Volatility Bot decision engine — pure, broker-agnostic, offline-testable.

Turns the frozen plan + a pair's live session state + the latest price into trade
specs by composing the golden-tested strategy bricks (approach_velocity,
line_levels, neighbours, trade_spec). No MT5, no network. The loop
(volatility_bot.py) feeds it prices/closes and routes specs to a Broker.
"""
from collections import deque

from pylego.strategy.volatility import (
    approach_velocity, line_levels, trade_spec, cell_key, LINE_NAMES, VEL_WIN,
)

SIDES = ("up", "dn")


class SessionTracker:
    """Per-pair intraday state for ONE session:
      * ``open``                — the session open anchor (OC lines hang off it),
      * ``run_low`` / ``run_high`` — running extremes (drive the dynamic HL lines),
      * ``closes``              — a minutely close buffer (drives approach velocity),
      * ``acted``               — line ids already decided this session (one shot).
    """

    def __init__(self, open_px, vel_win=VEL_WIN):
        self.open = float(open_px)
        self.run_low = float(open_px)
        self.run_high = float(open_px)
        self.closes = deque(maxlen=vel_win + 1)
        self.closes.append(float(open_px))
        self.acted = set()

    def on_price(self, px):
        px = float(px)
        if px < self.run_low:
            self.run_low = px
        if px > self.run_high:
            self.run_high = px

    def on_minute(self, close_px):
        self.closes.append(float(close_px))


def decide(plan_pair, policy, tracker, px, *, sigma=None):
    """Lines newly touched this tick that map to a tradeable (fade/follow) cell.

    Returns a list of specs: ``{side, entry, tp, sl, line, name, ln_side,
    decision, bucket, velocity}``. A line is decided ONCE per session (touched or
    not), so a level can't re-fire while price sits beyond it.
    """
    frac = {"hl50": plan_pair["hl50"], "hl75": plan_pair["hl75"],
            "ocMed": plan_pair["ocMed"], "oc75": plan_pair["oc75"]}
    sig = sigma if sigma is not None else plan_pair.get("sigma")
    levels = line_levels(tracker.open, tracker.run_low, tracker.run_high, frac)
    closes = list(tracker.closes)
    val, bucket = approach_velocity(closes, len(closes) - 1, tracker.open, sig)
    out = []
    if bucket is None:
        return out                         # not enough minutely closes yet
    for name in LINE_NAMES:
        for side in SIDES:
            line_id = f"{name}_{side}"
            if line_id in tracker.acted:
                continue
            lvl = levels[line_id]
            touched = (px >= lvl) if side == "up" else (px <= lvl)
            if not touched:
                continue
            tracker.acted.add(line_id)     # one decision per line per session
            decision = (policy.get(cell_key(name, side, bucket)) or {}).get("decision")
            if decision not in ("fade", "follow"):
                continue                   # skip cell / unseen → no trade
            spec = trade_spec(name, side, levels, decision, tracker.open, frac)
            if spec:
                out.append({**spec, "line": line_id, "name": name, "ln_side": side,
                            "decision": decision, "bucket": bucket, "velocity": val})
    return out
