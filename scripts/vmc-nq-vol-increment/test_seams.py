"""vmc-nq-vol-increment: code-level test of the seam rule (prereg section 3.1). NO OUTCOMES are computed or scored.

The claim tested: no eligible observation's features or target depend on any bar outside its own segment, i.e. no
actual lookback (or forward target window) crosses a contract roll or a feed join.

Method (segment perturbation): segments are split by parity. Every 1-minute bar in the odd segments (and in mixed bars)
is replaced arbitrarily (a random level factor per segment, independent noise on O/H/L/C, random volume); the tau-bars
and all features are rebuilt; every eligible observation in an even segment must be bit-identical. Then the same with
parities swapped. A negative control (a feature computed across the whole array, as the banked dataset did) must FAIL
the same test, so the test is shown to have teeth.

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
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts/vmc-nq-cipher"))
import seams  # noqa: E402
from vmcResearch.vmcfeat import tf_state  # noqa: E402

SEED = 20261031
H = 12
STALE = 12
V_COLS = ["wt1", "wt2", "mf", "vwap_dist"]


def trade_date(t_open):
    ct = pd.to_datetime(t_open, unit="s", utc=True).tz_convert("America/Chicago")
    return (ct + pd.Timedelta(hours=7)).normalize().tz_localize(None)


def resample(m1, tf):
    if tf == 1:
        g = m1.copy()
        g["t_close"] = g.t_open + 60
        return g.reset_index(drop=True)
    k = (m1.t_open // (tf * 60)) * (tf * 60)
    g = m1.groupby(k, sort=True).agg(open=("open", "first"), high=("high", "max"), low=("low", "min"),
                                     close=("close", "last"), volume=("volume", "sum"), trade_date=("trade_date", "last"))
    g["t_open"] = np.asarray(g.index, dtype="int64")
    g["t_close"] = g.t_open + tf * 60
    return g.reset_index(drop=True)


def features(d):
    """Representative of every feature class in prereg 3.3-3.4: short and long rolling ranges, return dispersion over
    500 bars, the real VuManChu state (recursive WaveTrend, MF SMA60, VWAP distance with its 500-bar sigma),
    previous-trade-date range, stale V (+12), and the forward target. Built on ONE segment."""
    c, hi, lo = d.close, d.high, d.low
    out = pd.DataFrame(index=d.index)
    for k in (12, 288):
        out[f"lrng{k}"] = np.log(hi.rolling(k).max() / lo.rolling(k).min())
    out["lsig500"] = np.log(np.log(c).diff().rolling(500).std())
    v = tf_state(d[["open", "high", "low", "close", "volume"]])
    for col in V_COLS:
        out[col] = v[col].to_numpy()
        out[col + "_stale"] = out[col].shift(STALE)
    td = pd.to_datetime(d.trade_date)
    day = d.groupby(td).agg(h=("high", "max"), l=("low", "min"))
    prev = np.log(day.h / day.l).shift(1)
    out["lrng_prevday"] = prev.reindex(td).to_numpy()
    fh = hi[::-1].rolling(H).max()[::-1].shift(-1)
    fl = lo[::-1].rolling(H).min()[::-1].shift(-1)
    out["y12"] = np.log(fh / fl)
    return out


LOOKBACK = 500 + STALE      # longest lookback of the features above, plus the stale shift


def build(m1, tf, seam_t, leaky=False):
    bars = resample(m1, tf)
    seg, mixed = seams.segments(bars, seam_t, m1.t_open.to_numpy())
    if leaky:                                       # negative control: whole-array computation (ignores seams)
        f = features(bars)
    else:
        f = seams.per_segment(bars, seg, features)
    el = seams.eligible(seg, bars.trade_date, LOOKBACK, H)
    return bars, seg, f, el


def perturb(m1, tf, seg_of_m1, parity, rng):
    p = m1.copy()
    hit = (seg_of_m1 < 0) | (seg_of_m1 % 2 == parity)
    fac = pd.Series(rng.uniform(0.9, 1.1, seg_of_m1.max() + 2), dtype=float)
    lvl = fac.reindex(seg_of_m1 + 1).to_numpy()
    n = hit.sum()
    noise = lambda: rng.normal(0, 3e-4, n)        # noqa: E731
    o, c = p.open.to_numpy(float)[hit] * lvl[hit] * (1 + noise()), p.close.to_numpy(float)[hit] * lvl[hit] * (1 + noise())
    hi = np.maximum(o, c) * (1 + np.abs(noise()))
    lo = np.minimum(o, c) * (1 - np.abs(noise()))
    for col, val in (("open", o), ("close", c), ("high", hi), ("low", lo)):
        arr = p[col].to_numpy(float).copy()
        arr[hit] = val
        p[col] = arr
    vol = p.volume.to_numpy(float).copy()
    vol[hit] = rng.integers(1, 5000, n)
    p["volume"] = vol
    return p


def seg_of_m1(m1, bars, seg, tf):
    k = (m1.t_open.to_numpy() // (tf * 60)) * (tf * 60) if tf != 1 else m1.t_open.to_numpy()
    j = np.searchsorted(bars.t_open.to_numpy(), k)
    return seg[j]


def check(m1, tf, seam_t, leaky=False):
    rng = np.random.default_rng(SEED)
    bars, seg, f0, el = build(m1, tf, seam_t, leaky)
    s1 = seg_of_m1(m1, bars, seg, tf)
    res = {"bars": int(len(bars)), "mixed_bars": int((seg < 0).sum()), "segments": int(seg.max() + 1),
           "eligible_pct": round(100 * el.mean(), 2)}
    bad = 0
    for parity in (0, 1):
        _, seg_p, f1, _ = build(perturb(m1, tf, s1, parity, rng), tf, seam_t, leaky)
        assert (seg_p == seg).all()
        keep = el & (seg >= 0) & (seg % 2 != parity)
        a, b = f0[keep].to_numpy(float), f1[keep].to_numpy(float)
        same = (a == b) | (np.isnan(a) & np.isnan(b))
        bad += int((~same).sum())
        res[f"checked_cells_parity{parity}"] = int(same.size)
        undefined = int(np.isnan(a).any(axis=1).sum())
        res[f"eligible_rows_with_undefined_feature_parity{parity}"] = undefined
    res["changed_cells"] = bad
    res["eligible_rows"] = int(el.sum())
    res["pass"] = bad == 0 and res["eligible_rows"] > 0 and res["eligible_rows_with_undefined_feature_parity0"] == 0 and \
        res["eligible_rows_with_undefined_feature_parity1"] == 0
    return res


def synthetic():
    """60 trade dates of 1-minute bars with a roll at a session open (+2% level step) and a feed join at 18:18 ET
    (mid 30-minute bar, -1.5% step), so a mixed bar occurs at 30m."""
    rng = np.random.default_rng(SEED)
    t0 = int(pd.Timestamp("2024-03-03 23:00", tz="UTC").timestamp())
    t = []
    for d in range(60):
        s = t0 + d * 86400
        t.append(np.arange(s, s + 23 * 3600, 60))
    t = np.concatenate(t)
    n = len(t)
    c = 15000 * np.exp(np.cumsum(rng.normal(0, 4e-4, n)))
    roll_at = t0 + 20 * 86400
    join_at = t0 + 40 * 86400 + 78 * 60
    c = np.where(t >= roll_at, c * 1.02, c)
    c = np.where(t >= join_at, c * 0.985, c)
    o = np.r_[c[0], c[:-1]]
    m1 = pd.DataFrame({"t_open": t, "open": o, "close": c, "high": np.maximum(o, c) * (1 + np.abs(rng.normal(0, 2e-4, n))),
                       "low": np.minimum(o, c) * (1 - np.abs(rng.normal(0, 2e-4, n))), "volume": rng.integers(1, 900, n).astype(float),
                       "contract": np.where(t >= roll_at, "B", "A"), "owner_share": np.where(t >= join_at, 1.0, 0.0)})
    m1["trade_date"] = trade_date(m1.t_open.values)
    sm = seams.find_seams(m1)
    assert list(sm.kind) == ["roll", "join"], sm
    st = sm.t_open.to_numpy()
    out = {}
    for tf in (1, 30):
        r = check(m1, tf, st)
        assert r["pass"], (tf, r)
        if tf == 30:
            assert r["mixed_bars"] == 1, r
        neg = check(m1, tf, st, leaky=True)
        assert not neg["pass"] and neg["changed_cells"] > 0, ("negative control did not fail", tf, neg)
        r["negative_control_changed_cells"] = neg["changed_cells"]
        out[str(tf)] = r
    return out


def real():
    import vmcds
    m1 = vmcds.load(1, columns=["t_open", "trade_date", "contract", "open", "high", "low", "close", "volume", "owner_share"])
    m1 = m1[pd.to_datetime(m1.trade_date) <= pd.Timestamp("2026-08-20")].reset_index(drop=True)
    sm = seams.find_seams(m1)
    st = sm.t_open.to_numpy()
    out = {"seams": sm.kind.value_counts().to_dict(),
           "seam_et_times": pd.to_datetime(sm.t_open, unit="s", utc=True).dt.tz_convert("America/New_York")
           .dt.strftime("%H:%M").value_counts().to_dict()}
    for tf in (1, 3, 5, 30):
        r = check(m1, tf, st)
        out[str(tf)] = r
        print(tf, r, flush=True)
    return out


if __name__ == "__main__":
    res = {"synthetic": synthetic()}
    print("synthetic", json.dumps(res["synthetic"]))
    if "--real" in sys.argv:
        res["real"] = real()
        o = ROOT / "analysis/output/vmc-nq-vol-increment"
        o.mkdir(parents=True, exist_ok=True)
        (o / "seam_test.json").write_text(json.dumps(res, indent=1, default=str))
        assert all(res["real"][k]["pass"] for k in ("1", "3", "5", "30"))
    print("PASS")
