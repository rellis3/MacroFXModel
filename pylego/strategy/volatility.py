"""Volatility Bot strategy bricks — the ONLY Category-A logic the live bot runs.

Everything else (band fractions, the fade/follow policy, the survivor universe)
is consumed from the frozen ``volatility_bot_plan`` — never recomputed here. This
module only computes:

  * ``approach_velocity`` — the policy cell-key bucket (golden-tested vs JS so it
    can never silently drift from ``js/touchFeatures.approachVelocity``),
  * ``line_levels``       — the 8 live forecast-line levels (OC static off open,
    HL dynamic off the opposite running extreme — matches the Pine overlay),
  * ``neighbours``        — inner (toward open) / outer (away) line for a touch,
  * ``trade_spec``        — fade/follow → ``{side, entry, tp, sl}`` (triple-barrier).

Mirrors ``js/touchFeatures.approachVelocity`` + ``js/forecastAnalyser.levelAt`` +
the inner/outer pick + ``perLineStrategy.pnlFor``'s buy/sell rule. Pure, offline.
"""

# Locked defaults — mirror js/touchFeatures.js TOUCH_DEFAULTS (the live config).
VEL_WIN, VEL_FAST, VEL_SLOW = 15, 0.60, 0.25

LINE_NAMES = ("OC50", "OC75", "HL50", "HL75")


def approach_velocity(closes, touch_idx, open_px, sigma,
                      *, vel_win=VEL_WIN, vel_fast=VEL_FAST, vel_slow=VEL_SLOW):
    """|move| over ``vel_win`` bars in daily-σ units → ``(value, bucket)``.

    Identical to ``touchFeatures.approachVelocity``: the bucket comes from the
    UNROUNDED ratio (as in JS), the reported value is rounded to 4dp. Returns
    ``(None, None)`` when there aren't enough bars or σ/open are non-positive.
    """
    if not (touch_idx >= vel_win) or not (open_px > 0) or not (sigma > 0):
        return None, None
    ret = abs(closes[touch_idx] - closes[touch_idx - vel_win]) / open_px
    v_sig = ret / sigma
    if v_sig >= vel_fast:
        bucket = "3·spike"
    elif v_sig <= vel_slow:
        bucket = "1·grind"
    else:
        bucket = "2·med"
    return round(v_sig, 4), bucket


def line_levels(open_px, run_low, run_high, frac):
    """The 8 forecast-line price levels right now.

    OC (Close) lines are STATIC off the day open; HL (Proj-H/L) lines are DYNAMIC
    — the up line trails the running LOW, the down line trails the running HIGH
    (``analyseWindow.levelAt`` / the live chart). ``frac`` = ``{hl50,hl75,ocMed,oc75}``.
    """
    return {
        "OC50_up": open_px * (1 + frac["ocMed"]), "OC50_dn": open_px * (1 - frac["ocMed"]),
        "OC75_up": open_px * (1 + frac["oc75"]),  "OC75_dn": open_px * (1 - frac["oc75"]),
        "HL50_up": run_low * (1 + frac["hl50"]),  "HL50_dn": run_high * (1 - frac["hl50"]),
        "HL75_up": run_low * (1 + frac["hl75"]),  "HL75_dn": run_high * (1 - frac["hl75"]),
    }


def neighbours(touch_name, side, levels, open_px, frac):
    """Inner (toward open) and outer (away) neighbour levels for the touched line,
    among the 4 SAME-SIDE lines — mirrors ``analyseWindow``'s frozen inner/outer.

    Inner defaults to the open when no line sits between; outer defaults to the
    touched level ± ``open·(hl75−hl50)`` when no line sits beyond.
    """
    touched = levels[f"{touch_name}_{side}"]
    same = [levels[f"{nm}_{side}"] for nm in LINE_NAMES]
    span = open_px * (frac["hl75"] - frac["hl50"])
    if side == "up":
        inner = max([open_px] + [v for v in same if open_px < v < touched - 1e-12])
        outs = [v for v in same if v > touched + 1e-12]
        outer = min(outs) if outs else touched + span
    else:
        inner = min([open_px] + [v for v in same if touched + 1e-12 < v < open_px])
        outs = [v for v in same if v < touched - 1e-12]
        outer = max(outs) if outs else touched - span
    return inner, outer


def trade_spec(touch_name, side, levels, decision, open_px, frac):
    """Turn a touched line + policy decision into a triple-barrier order spec.

    fade  → TP = inner line (toward open), SL = outer line (away);
    follow → TP = outer, SL = inner.
    Direction mirrors ``perLineStrategy.pnlFor``: BUY when fading a down-line or
    following an up-line, else SELL. Returns ``None`` for a skip/degenerate cell.
    """
    if decision not in ("fade", "follow"):
        return None
    entry = levels[f"{touch_name}_{side}"]
    inner, outer = neighbours(touch_name, side, levels, open_px, frac)
    if inner is None or outer is None or inner == outer:
        return None
    tp, sl = (inner, outer) if decision == "fade" else (outer, inner)
    is_buy = (decision == "fade" and side == "dn") or (decision == "follow" and side == "up")
    return {"side": "buy" if is_buy else "sell", "entry": entry, "tp": tp, "sl": sl}


def cell_key(touch_name, side, vel_bucket):
    """The policy cell key the plan is keyed by: ``"{NAME}_{side}|{bucket}"`` —
    matches ``perLineStrategy.extractTouches`` (conditions = [approachVel])."""
    return f"{touch_name}_{side}|{vel_bucket}"
