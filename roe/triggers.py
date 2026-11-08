"""TRIGGERS with frozen parameters (roe/watch_config.json). Each function is a pure function of causal inputs and returns
a list of fired dicts {trigger, side, strength, ...} (empty = did not fire). Nothing here looks forward and nothing
computes an outcome."""
from __future__ import annotations

import math

import numpy as np

from .measures import MAD_SCALE, change_array


def extreme(meas: dict, cfg: dict):
    t = cfg["triggers"]["extreme"]
    p = meas.get("pct") or {}
    vals = [p.get(str(w)) for w in meas.get("windows", [])]
    if not vals or any(x is None for x in vals):
        return []
    if all(x >= t["upper"] for x in vals):
        return [{"trigger": "extreme", "side": "high", "strength": {"pct": {str(w): p[str(w)] for w in meas["windows"]}}}]
    if all(x <= t["lower"] for x in vals):
        return [{"trigger": "extreme", "side": "low", "strength": {"pct": {str(w): p[str(w)] for w in meas["windows"]}}}]
    return []


def speed(meas: dict, cfg: dict):
    t = cfg["triggers"]["speed"]
    k = str(t["horizon"][meas["cadence"]])
    z = (meas.get("chgZ") or {}).get(k)
    if z is None or abs(z) < t["robustZ"]:
        return []
    return [{"trigger": "speed", "side": "up" if z > 0 else "down",
             "strength": {"horizon": int(k), "robustZ": z, "change": meas["chg"][k]}}]


def confirmed_change(labels, hold: int):
    """Generic 'held category change': the last `hold` labels are identical (and not None) and the label before them is
    different (and not None). Returns (old, new) or None. Fires exactly once, on the confirming session."""
    if len(labels) < hold + 1:
        return None
    tail = labels[-hold:]
    prev = labels[-hold - 1]
    if any(x is None for x in tail) or prev is None:
        return None
    if all(x == tail[0] for x in tail) and prev != tail[0]:
        return prev, tail[0]
    return None


def flip(values, center: float, cfg: dict):
    hold = cfg["triggers"]["flip"]["hold"]
    sg = [None if (v is None or math.isnan(v) or v == center) else (1 if v > center else -1) for v in values[-(hold + 1):]]
    ch = confirmed_change(sg, hold)
    if not ch:
        return []
    return [{"trigger": "flip", "side": "to_positive" if ch[1] > 0 else "to_negative",
             "strength": {"center": center, "hold": hold, "value": float(values[-1])}}]


def regime_labels(values, cuts, labels):
    out = []
    for v in values:
        out.append(None if (v is None or math.isnan(v)) else labels[sum(1 for c in cuts if v >= c)])
    return out


def regime_change(label_series, cfg: dict, detail=None):
    hold = cfg["triggers"]["regime"]["hold"]
    ch = confirmed_change(list(label_series)[-(hold + 1):], hold)
    if not ch:
        return []
    s = {"from": ch[0], "to": ch[1], "hold": hold}
    if detail:
        s.update(detail)
    return [{"trigger": "regime", "side": f"to_{ch[1]}", "strength": s}]


def divergence(a_dates, a_vals, b_dates, b_vals, relation: int, a_kind: str, b_kind: str, cfg: dict):
    """Two normally co-moving series diverge. Align on common dates (<= as-of; the caller truncates). 'Normally co-move' =
    correlation of daily changes over the corrWindow ending the session BEFORE today >= minCorr (after applying `relation`,
    -1 for pairs that normally move inversely). Today's 20-session change of A is regressed on that of B over the prior
    fitWindow; the robust z of today's residual is the divergence size. Returns [] if there is too little overlap."""
    t = cfg["triggers"]["divergence"]
    bm = dict(zip(b_dates, b_vals))
    common = [(d, av, bm[d]) for d, av in zip(a_dates, a_vals) if d in bm]
    k, cw, fw = t["changeHorizon"], t["corrWindow"], t["fitWindow"]
    if len(common) < fw + k + 5:
        return [], {"reason": "short overlap", "n": len(common)}
    a = np.array([c[1] for c in common], float)
    b = np.array([c[2] for c in common], float)
    # `relation` is applied to the CHANGES of B (works for log and diff series alike)
    da1 = change_array(a, 1, a_kind)
    db1 = change_array(b, 1, b_kind) * relation
    # correlation window ends at index -2 (prior session) of the daily-change arrays
    ca, cb = da1[:-1][-cw:], db1[:-1][-cw:]
    if ca.size < cw // 2 or np.std(ca) == 0 or np.std(cb) == 0:
        return [], {"reason": "no variance"}
    # rank (Spearman) correlation: one sudden jump (the very divergence we look for, a day or two ago) must not erase
    # the evidence that the pair normally co-moves
    corr = float(np.corrcoef(np.argsort(np.argsort(ca)).astype(float), np.argsort(np.argsort(cb)).astype(float))[0, 1])
    yk = change_array(a, k, a_kind)
    xk = change_array(b, k, b_kind) * relation
    y_today, x_today = float(yk[-1]), float(xk[-1])
    y, x = yk[:-1][-fw:], xk[:-1][-fw:]
    if y.size < t["minFit"]:
        return [], {"reason": "short fit", "n": int(y.size)}
    xm, ym = x.mean(), y.mean()
    vx = ((x - xm) ** 2).sum()
    if vx <= 0:
        return [], {"reason": "no variance"}
    beta = float(((x - xm) * (y - ym)).sum() / vx)
    alpha = float(ym - beta * xm)
    res = y - (alpha + beta * x)
    med = float(np.median(res))
    mad = float(np.median(np.abs(res - med))) * MAD_SCALE
    if mad <= 0:
        return [], {"reason": "no residual variance"}
    z = (y_today - (alpha + beta * x_today) - med) / mad
    info = {"corr": corr, "beta": beta, "residualZ": z, "n": len(common)}
    if corr >= t["minCorr"] and abs(z) >= t["residualZ"]:
        return [{"trigger": "divergence", "side": "a_above_b" if z > 0 else "a_below_b", "strength": info}], info
    return [], info
