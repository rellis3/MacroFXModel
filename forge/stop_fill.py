"""One stop-order trade on real bid/ask M1 bars (vol-layer, forge/ROUND_BREAK_FOLLOW_PREREG.md).

A buy stop at `lv` triggers when the ask high reaches it and fills at lv, or at the bar's ask open if the bar gapped
through it. A long exits on the bid; a short mirrors this. Same-bar conflicts are losses, because M1 cannot give the order.
"""
from __future__ import annotations

import numpy as np


def first_trigger(side: int, lv: float, ask_h, bid_l) -> int | None:
    """Index of the first bar in which a stop at `lv` would trigger, or None."""
    hit = ask_h >= lv if side > 0 else bid_l <= lv
    if not hit.any():
        return None
    return int(np.argmax(hit))


def stop_trade(side: int, lv: float, t: int, stop: float, target: float, end: int,
               bid_o, bid_h, bid_l, bid_c, ask_o, ask_h, ask_l, ask_c) -> dict:
    """Enter at a stop at bar t; stop and target are price distances from the fill. Bars t..end-1 are live.
    Returns outcome ('target', 'stop', 'time'), fill, exit and r: profit in units of the stop distance, costs included."""
    if side > 0:
        fill = max(lv, ask_o[t])
        tp, sl = fill + target, fill - stop
        hit_tp, hit_sl = bid_h[t:end] >= tp, bid_l[t:end] <= sl
        gap_px = bid_o[t:end]
        close_px = bid_c[end - 1]
    else:
        fill = min(lv, bid_o[t])
        tp, sl = fill - target, fill + stop
        hit_tp, hit_sl = ask_l[t:end] <= tp, ask_h[t:end] >= sl
        gap_px = ask_o[t:end]
        close_px = ask_c[end - 1]
    i_tp = int(np.argmax(hit_tp)) if hit_tp.any() else 10 ** 9
    i_sl = int(np.argmax(hit_sl)) if hit_sl.any() else 10 ** 9
    if i_sl <= i_tp and i_sl < 10 ** 9:                       # a same-bar conflict is a loss
        g = gap_px[i_sl]
        ex = (min(sl, g) if side > 0 else max(sl, g)) if i_sl > 0 else sl
        oc = "stop"
    elif i_tp < 10 ** 9:
        ex, oc = tp, "target"
    else:
        ex, oc = close_px, "time"
    return {"outcome": oc, "fill": float(fill), "exit": float(ex), "r": float(side * (ex - fill) / stop)}
