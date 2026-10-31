"""vmc-nq-vol-increment: code-level test of the seam rule (prereg section 3.1). NO OUTCOMES are computed or scored.

The claim tested: no eligible observation's features or target depend on any bar outside its own segment, i.e. no
actual lookback (or forward target window) crosses a contract roll or a feed join.

Method (segment perturbation): segments are split by parity. Every 1-minute bar in the odd segments (and in mixed bars)
is replaced arbitrarily (a random level factor per segment, independent noise on O/H/L/C, random volume); the tau-bars
and ALL features (features.build, the one builder the study uses) are rebuilt; every eligible observation in an even
segment must be bit-identical and fully defined. Then the same with parities swapped. A negative control (the same
builder with seams ignored, i.e. whole-array computation as the banked dataset did) must FAIL, so the test has teeth.

Stage 4 references (s4ref.py) use other segments by design, but only through within-segment log ranges of the same
feed: every other segment is multiplied by its own random level factor (no noise) and p must not move (<= 1e-12).

    python -I scripts/vmc-nq-vol-increment/test_seams.py            synthetic only (fast)
    python -I scripts/vmc-nq-vol-increment/test_seams.py --real     + the NQ fit/test data (no lockbox), tf 1/3/5/30
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
import features  # noqa: E402
import s4ref  # noqa: E402
import seams  # noqa: E402

SEED = 20261031


def trade_date(t_open):
    ct = pd.to_datetime(t_open, unit="s", utc=True).tz_convert("America/Chicago")
    return (ct + pd.Timedelta(hours=7)).normalize().tz_localize(None)


def seg_of_m1(m1, bars, seg, tf):
    k = (m1.t_open.to_numpy() // (tf * 60)) * (tf * 60)
    return seg[np.searchsorted(bars.t_open.to_numpy(), k)]


def perturb(m1, s1, parity, rng, noise=True):
    p = m1.copy()
    hit = (s1 < 0) | (s1 % 2 == parity)
    lvl = rng.uniform(0.9, 1.1, s1.max() + 2)[s1 + 1]
    n = int(hit.sum())
    e = (lambda: rng.normal(0, 3e-4, n)) if noise else (lambda: np.zeros(n))
    cols = {k: p[k].to_numpy(float).copy() for k in ("open", "high", "low", "close")}
    o, c = cols["open"][hit] * lvl[hit] * (1 + e()), cols["close"][hit] * lvl[hit] * (1 + e())
    hi = np.maximum(cols["high"][hit] * lvl[hit], np.maximum(o, c)) * (1 + np.abs(e()))
    lo = np.minimum(cols["low"][hit] * lvl[hit], np.minimum(o, c)) * (1 - np.abs(e()))
    for k, val in (("open", o), ("close", c), ("high", hi), ("low", lo)):
        cols[k][hit] = val
        p[k] = cols[k]
    if noise:
        vol = p.volume.to_numpy(float).copy()
        vol[hit] = rng.integers(1, 5000, n)
        p["volume"] = vol
    return p


def compare(f0, f1, rows, cols):
    a, b = f0.loc[rows, cols].to_numpy(float), f1.loc[rows, cols].to_numpy(float)
    same = (a == b) | (np.isnan(a) & np.isnan(b))
    return int((~same).sum()), int(same.size), int(np.isnan(a).any(axis=1).sum())


def check(m1, tf, seam_t):
    rng = np.random.default_rng(SEED)
    bars, f0 = features.build(m1, tf, seam_t)
    seg = f0.seg.to_numpy()
    el = {h: seams.eligible(seg, bars.trade_date, features.LOOKBACK, h) for h in (12, 48)}
    cols = [c for c in f0.columns if c.startswith(("p_", "v_", "sv_", "pvd")) or c in ("y12",)]
    s1 = seg_of_m1(m1, bars, seg, tf)
    res = {"bars": int(len(bars)), "mixed_bars": int((seg < 0).sum()), "segments": int(seg.max() + 1),
           "eligible_pct": round(100 * el[12].mean(), 2), "eligible_rows": int(el[12].sum()), "features_checked": len(cols)}
    changed = checked = undefined = 0
    neg = 0
    _, fl0 = features.build(m1, tf, seam_t, ignore_seams=True)
    for parity in (0, 1):
        pm = perturb(m1, s1, parity, rng)
        _, f1 = features.build(pm, tf, seam_t)
        assert (f1.seg.to_numpy() == seg).all()
        keep = (seg >= 0) & (seg % 2 != parity)
        for rows, cc in ((el[12] & keep, cols), (el[48] & keep, ["y48"])):
            a, b, u = compare(f0, f1, rows, cc)
            changed, checked, undefined = changed + a, checked + b, undefined + u
        _, fl1 = features.build(pm, tf, seam_t, ignore_seams=True)
        neg += compare(fl0, fl1, el[12] & keep, cols)[0]
    # Stage 4 references: level factors only
    t0 = f0.assign(src=(bars.owner_share.to_numpy() > 0.5).astype(np.int8), trade_date=bars.trade_date.values,
                   c_hh=features.clock(bars, tf, 12).c_hh.to_numpy())
    p0 = s4ref.percentile(t0)
    s4_moved = 0
    for parity in (0, 1):
        _, f1 = features.build(perturb(m1, s1, parity, rng, noise=False), tf, seam_t)
        p1 = s4ref.percentile(f1.assign(src=t0.src.values, trade_date=t0.trade_date.values, c_hh=t0.c_hh.values))
        keep = el[12] & (seg >= 0) & (seg % 2 != parity) & np.isfinite(p0)
        s4_moved += int((np.abs(p0[keep] - p1[keep]) > 1e-12).sum())
    res.update({"checked_cells": checked, "changed_cells": changed, "eligible_rows_with_undefined_feature": undefined,
                "negative_control_changed_cells": neg, "s4_p_defined_pct_of_eligible": round(100 * np.isfinite(p0[el[12]]).mean(), 2),
                "s4_p_moved": s4_moved})
    res["pass"] = changed == 0 and undefined == 0 and res["eligible_rows"] > 0 and neg > 0 and s4_moved == 0
    return res


def synthetic():
    """60 trade dates of 1-minute bars: a roll at a session open (+2% level step) and a feed join at 18:18 ET
    (mid 30-minute bar, -1.5% step), so a mixed bar occurs at 30m."""
    rng = np.random.default_rng(SEED)
    t0 = int(pd.Timestamp("2024-03-03 23:00", tz="UTC").timestamp())
    t = np.concatenate([np.arange(t0 + d * 86400, t0 + d * 86400 + 23 * 3600, 60) for d in range(60)])
    n = len(t)
    c = 15000 * np.exp(np.cumsum(rng.normal(0, 4e-4, n)))
    roll_at, join_at = t0 + 20 * 86400, t0 + 40 * 86400 + 78 * 60
    c = np.where(t >= roll_at, c * 1.02, c)
    c = np.where(t >= join_at, c * 0.985, c)
    o = np.r_[c[0], c[:-1]]
    m1 = pd.DataFrame({"t_open": t, "open": o, "close": c, "high": np.maximum(o, c) * (1 + np.abs(rng.normal(0, 2e-4, n))),
                       "low": np.minimum(o, c) * (1 - np.abs(rng.normal(0, 2e-4, n))), "raw_close": c,
                       "volume": rng.integers(1, 900, n).astype(float),
                       "contract": np.where(t >= roll_at, "B", "A"), "owner_share": np.where(t >= join_at, 1.0, 0.0)})
    m1["trade_date"] = trade_date(m1.t_open.values)
    sm = seams.find_seams(m1)
    assert list(sm.kind) == ["roll", "join"], sm
    out = {}
    for tf in (1, 30):
        r = check(m1, tf, sm.t_open.to_numpy())
        print("synthetic", tf, r, flush=True)
        assert r["pass"], (tf, r)
        if tf == 30:
            assert r["mixed_bars"] == 1, r
        out[str(tf)] = r
    return out


def real():
    m1 = features.load_m1()
    sm = seams.find_seams(m1)
    out = {"seams": sm.kind.value_counts().to_dict()}
    for tf in features.TFS:
        r = check(m1, tf, sm.t_open.to_numpy())
        out[str(tf)] = r
        print(tf, r, flush=True)
    return out


if __name__ == "__main__":
    res = {"synthetic": synthetic()}
    if "--real" in sys.argv:
        res["real"] = real()
        (features.OUT / "seam_test_full.json").write_text(json.dumps(res, indent=1, default=str))
        assert all(res["real"][str(k)]["pass"] for k in features.TFS)
    print("PASS")
