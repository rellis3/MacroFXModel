"""
daily-open-fib-retest: the rule engine (pure numpy, no data loading).

The setup, as fixed in forge/DAILY_OPEN_FIB_RETEST_PREREG.md (sell side; the buy
side mirrors it):

  open      the session's first M1 bar (gold: 18:00 New York, 23:00 UK).
  H, L      running high / low since the open, and the bar each was set on.
  armed     the low was set AFTER the high (price fell from the top) and the
            impulse A - L is at least `min_imp` x ADR, before `entry_cut` minutes.
  A (the 1) anchor="high": H, the opening high wick (the video's drawing);
            anchor="do":   the open price itself.
  entry     a sell limit at A, filled when a bar's high reaches A.
  stop      the 1.2: A + 0.2 x (A - L).          risk  = 0.2 x (A - L)
  target    the 0 (L, = 5R), or entry - k x risk for a k-R variant.
  BE        once a bar's low reaches entry - 1R, the stop moves to entry from
            the NEXT bar.
  exit      stop, target, or the open of the first bar at/after `exit_min`.

Everything that decides the order (A, L, stop, target) uses bars BEFORE the fill
bar, so nothing is known late. L at the fill is the lowest low between the open
and the bar before the fill, i.e. exactly what is on the chart when the order
fills.

Fill-bar and same-bar rules are conservative: on the fill bar only the stop can
trigger (the bar came up through A, so its low is not credited); when a later bar
touches both the stop and the target, it counts as the stop. A bar that opens
beyond the stop exits at that open (slippage), a bar that opens through the entry
fills at that open.
"""
from __future__ import annotations

import numpy as np

# fib levels for the component study (C3 sweep beyond the 1, C4 target depth)
SWEEP_LEVELS = (1.1, 1.2, 1.272, 1.382, 1.5, 1.618)
TARGET_LEVELS = (0.786, 0.618, 0.5, 0.382, 0.0)


def _first(mask: np.ndarray, start: int) -> int:
    """First index >= start where mask is True, or len(mask)."""
    if start >= len(mask):
        return len(mask)
    sub = mask[start:]
    k = int(np.argmax(sub))
    return start + k if sub[k] else len(mask)


def _running_extremes(h, l):
    H = np.maximum.accumulate(h)
    L = np.minimum.accumulate(l)
    idx = np.arange(len(h))
    # bar on which the running extreme was (last) set; ties count as a new set
    tH = np.maximum.accumulate(np.where(h >= H, idx, 0))
    tL = np.maximum.accumulate(np.where(l <= L, idx, 0))
    return H, L, tH, tL


def find_fill(o, h, l, mins, adr, anchor="high", min_imp=0.10, entry_cut=360, buy_l=None, buy_o=None):
    """Return the fill for one session or None.

    o, h, l are the CHART prices the fib is drawn on (mid, or the bid a broker chart
    shows). A sell limit fills on the chart price itself; a buy limit fills on
    `buy_l` / `buy_o` (the ask low / open in the bid/ask model, the chart by default).

    dict(side=+1 buy / -1 sell, j=fill bar, A, L0 (the impulse extreme = the 0),
    entry (fill price), imp (impulse in ADR), t_ext (bar of the impulse extreme))
    """
    if buy_l is None:
        buy_l, buy_o = l, o
    n = len(h)
    if n < 3:
        return None
    H, L, tH, tL = _running_extremes(h, l)
    do = o[0]
    # state through bar j-1 decides the order resting on bar j
    Hp, Lp, tHp, tLp = H[:-1], L[:-1], tH[:-1], tL[:-1]
    hj, lj, mj = h[1:], l[1:], mins[1:]
    thr = min_imp * adr
    if anchor == "high":
        A_sell, A_buy = Hp, Lp
    else:
        A_sell = A_buy = np.full(n - 1, do)
    sell_arm = (tLp > tHp) & (A_sell - Lp >= thr) & (mj <= entry_cut)
    buy_arm = (tHp > tLp) & (Hp - A_buy >= thr) & (mj <= entry_cut)
    if anchor == "do":
        # the open must sit between the extremes for the 'return to the open' to exist
        sell_arm &= Lp < do
        buy_arm &= Hp > do
    sell_fill = sell_arm & (hj >= A_sell)
    buy_fill = buy_arm & (buy_l[1:] <= A_buy)
    ks = _first(sell_fill, 0)
    kb = _first(buy_fill, 0)
    k = min(ks, kb)
    if k >= n - 1:
        return None
    j = k + 1
    if ks <= kb:
        A = A_sell[k]
        return dict(side=-1, j=j, A=A, L0=Lp[k], entry=max(A, o[j]),
                    imp=(A - Lp[k]) / adr, t_ext=int(tLp[k]), t_anchor=int(tHp[k]))
    A = A_buy[k]
    return dict(side=+1, j=j, A=A, L0=Hp[k], entry=min(A, buy_o[j]),
                imp=(Hp[k] - A) / adr, t_ext=int(tHp[k]), t_anchor=int(tLp[k]))


def _to_short(o, h, l, side):
    """Map a buy onto the sell geometry by negating prices (high <-> low)."""
    if side < 0:
        return o, h, l
    return -o, -l, -h


def trade(o, h, l, mins, f, stop_ext=0.2, target="zero", be=True, exit_min=540, fill_spread=0.0):
    """Outcome of one fill. Returns dict(R gross in planned-risk units, how, bars).

    o, h, l are the EXIT-side prices: the chart for mid, the ask for a sell and the bid
    for a buy in the bid/ask model. `fill_spread` (ask - bid at the fill) floors a
    fill-bar stop: a position opened inside a spread wider than the stop distance
    cannot be closed for less than that spread."""
    O, Hh, Ll = _to_short(o, h, l, f["side"])
    if f["side"] > 0:
        A, L0, entry = -f["A"], -f["L0"], -f["entry"]
    else:
        A, L0, entry = f["A"], f["L0"], f["entry"]
    leg = A - L0
    risk = stop_ext * leg
    stop = A + risk
    tp = L0 if target == "zero" else A - float(target) * risk
    j = f["j"]
    n = len(Hh)
    t_exit = _first(mins >= exit_min, j + 1)
    t_stop = _first(Hh >= stop, j)            # the fill bar can stop out
    t_tp = _first(Ll <= tp, j + 1)            # the fill bar's low is not credited
    t_be = _first(Ll <= A - risk, j + 1) if be else n
    t_bestop = _first(Hh >= A, t_be + 1) if be and t_be < n else n
    # resolve: earliest event wins. The time exit is at a bar's OPEN, so it beats
    # anything else in that bar; otherwise a stop beats the target in the same bar.
    events = [
        (t_exit, 0, "time"),
        (t_stop, 1, "stop"),
        (t_bestop, 2, "be"),
        (t_tp, 3, "target"),
    ]
    t, _, how = min(events)
    if t >= n:
        # session ended before the time exit with the trade open: last bar's open
        how, t = "eod", n - 1
        px = O[t]
    elif how == "stop":
        px = max(stop, O[t]) if t > j else max(stop, entry + fill_spread)
    elif how == "be":
        px = max(A, O[t])
    elif how == "target":
        px = tp
    else:
        px = O[t]
    R = (entry - px) / risk
    return dict(R=float(R), how=how, bars=int(t - j), risk_px=float(risk), leg_px=float(leg))


def components(o, h, l, mins, f, exit_min=540):
    """Reusable pieces for the null decomposition, all measured from the fill with
    the leg frozen at the fill and no stop or target in force (a pure race to the
    session's time exit). Returns first-passage results in leg units."""
    O, Hh, Ll = _to_short(o, h, l, f["side"])
    if f["side"] > 0:
        A, L0 = -f["A"], -f["L0"]
    else:
        A, L0 = f["A"], f["L0"]
    leg = A - L0
    j = f["j"]
    n = len(Hh)
    t_exit = min(_first(mins >= exit_min, j + 1), n)
    hh, ll = Hh[: t_exit], Ll[: t_exit]
    t_zero = _first(ll <= L0, j + 1)
    out = {"t_zero": t_zero < len(ll)}
    # C3: how far beyond the 1 does the retest sweep before the 0 is taken
    for x in SWEEP_LEVELS:
        t_up = _first(hh >= L0 + x * leg, j)
        out[f"sweep_{x}"] = bool(t_up < len(hh) and t_up <= t_zero)
    # C4: which depth is reached before the 1.2 (the video's stop)
    t_stop = _first(hh >= L0 + 1.2 * leg, j)
    for d in TARGET_LEVELS:
        t_d = _first(ll <= L0 + d * leg, j + 1)
        out[f"reach_{d}"] = bool(t_d < len(ll) and t_d < t_stop)
    # MFE / MAE to the time exit in leg units
    post_l = ll[j + 1:] if j + 1 < len(ll) else np.array([A])
    post_h = hh[j:] if j < len(hh) else np.array([A])
    out["mfe_leg"] = float((A - post_l.min()) / leg)
    out["mae_leg"] = float((post_h.max() - A) / leg)
    return out


def rw_null_sweep(x: float) -> float:
    """Driftless random walk from the 1: P(reach level x (> 1) before the 0) = 1 / x."""
    return 1.0 / x


def rw_null_reach(d: float, stop=1.2) -> float:
    """Driftless random walk from the 1: P(reach depth d before the stop)."""
    up = stop - 1.0
    down = 1.0 - d
    return up / (up + down)
