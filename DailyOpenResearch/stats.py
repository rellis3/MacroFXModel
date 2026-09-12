"""Small statistics helpers shared by every study."""
from __future__ import annotations
import math
import numpy as np
from scipy import stats as sps


def prop_ci(k: int, n: int):
    """Wilson 95% CI for a proportion, in percent."""
    if n <= 0:
        return {"p": None, "lo": None, "hi": None, "n": 0}
    z = 1.96
    p = k / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return {"p": round(100 * p, 1), "lo": round(100 * max(0, centre - half), 1),
            "hi": round(100 * min(1, centre + half), 1), "n": int(n)}


def binom_p(k: int, n: int, p0: float = 0.5) -> float | None:
    if n <= 0:
        return None
    return float(sps.binomtest(int(k), int(n), p0).pvalue)


def summarize(x, digits=3):
    x = np.asarray([v for v in x if v is not None and np.isfinite(v)], dtype=float)
    if x.size == 0:
        return {"n": 0}
    q = np.percentile(x, [10, 25, 50, 75, 90])
    return {"n": int(x.size), "mean": round(float(x.mean()), digits), "p10": round(float(q[0]), digits),
            "p25": round(float(q[1]), digits), "median": round(float(q[2]), digits),
            "p75": round(float(q[3]), digits), "p90": round(float(q[4]), digits)}


def trade_stats(r_list, cost_r=None):
    """Summarise a list of R-multiples (already net of cost). If cost_r (the
    cost expressed in R for each trade) is given, the gross average is also
    reported so the reader can see how much of the result is cost drag."""
    pairs = [(v, (cost_r[i] if cost_r is not None else None)) for i, v in enumerate(r_list) if v is not None and np.isfinite(v)]
    r = np.asarray([v for v, _ in pairs], dtype=float)
    if r.size == 0:
        return {"n": 0}
    wins = r[r > 0]; losses = r[r <= 0]
    pf = float(wins.sum() / -losses.sum()) if losses.sum() < 0 else None
    # t-stat of mean R against zero
    t = float(r.mean() / (r.std(ddof=1) / math.sqrt(r.size))) if r.size > 2 and r.std(ddof=1) > 0 else None
    out = {"n": int(r.size), "win_pct": round(100 * float((r > 0).mean()), 1), "avg_r": round(float(r.mean()), 3),
           "median_r": round(float(np.median(r)), 3), "profit_factor": round(pf, 2) if pf else None,
           "t_stat": round(t, 2) if t is not None else None,
           "avg_win_r": round(float(wins.mean()), 3) if wins.size else None,
           "avg_loss_r": round(float(losses.mean()), 3) if losses.size else None}
    # max drawdown in R along the sequence
    eq = np.cumsum(r); peak = np.maximum.accumulate(eq); dd = eq - peak
    out["max_dd_r"] = round(float(dd.min()), 2)
    out["total_r"] = round(float(eq[-1]), 1)
    if cost_r is not None:
        cr = np.asarray([c for _, c in pairs], dtype=float)
        out["cost_r_mean"] = round(float(cr.mean()), 3)
        g = r + cr
        out["avg_r_gross"] = round(float(g.mean()), 3)
        out["t_stat_gross"] = round(float(g.mean() / (g.std(ddof=1) / math.sqrt(g.size))), 2) if g.size > 2 and g.std(ddof=1) > 0 else None
    return out


def is_oos(records, day_key, n_days, frac=0.6):
    """Split records into in-sample / out-of-sample by day index (first 60% of days = IS)."""
    cut = int(n_days * frac)
    return [r for r in records if r[day_key] < cut], [r for r in records if r[day_key] >= cut]


def bucketize(value, edges, labels):
    for e, lab in zip(edges, labels):
        if value < e:
            return lab
    return labels[-1]
