"""
Conditional yield-shape turning-point test.

Not "does yesterday's whole-day shape predict today's whole-day trend" (tested in
yield_shape_lead.py -- null, see that file's docstring). This tests the owner's actual
idea: use CURRENT tracking quality as a real-time confidence gate, then ask whether a
known upcoming turn in yesterday's yield shape (we already know all of yesterday, so
"upcoming" just means ahead of the current clock-time within today) predicts an
upcoming turn in today's price over the next 15/30/60 min -- as one input to LAYER
onto other confidence signals, not a standalone system.

Method, per (yield day D-1, price day D) pair, at each time-of-day slot t:
  1. in_sync(t)   = rolling correlation over a trailing 2h window between yield(D-1)
                    and price(D), both z-scored in-window -- "is today currently
                    tracking yesterday's shape so far?"
  2. yield_turn(t) = yesterday's yield reverses slope direction between the trailing
                     1h and the next H minutes (H in 15/30/60) -- a known, already-
                     happened turn, read off the template.
  3. price_turn(t) = today's price reverses slope direction between the trailing 1h
                     and the next H minutes -- the thing we're trying to anticipate.

Compare hit-rate of price_turn(t) in four buckets:
  A. in_sync AND yield_turn      <- the owner's hypothesis: THIS should beat the rest
  B. yield_turn, NOT in_sync     <- control: does the gate add anything over yield_turn alone?
  C. unconditional (all t)       <- base rate of price turning at all
  D. placebo: bucket A recomputed with yield(D-1) paired to a RANDOM other price day
     (500 draws) -- null rate this method/data produces by chance once you condition
     on "in sync AND a turn is coming", which is a much narrower slice than the
     unconditional test and needs its own null, not bucket C's.

Usage:
    python -m analysis.yield_shape_regime_test
(reuses the Yahoo data already pulled by yield_shape_lead.py --refresh)
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "analysis" / "output" / "yield_shape_lead"

ASSETS = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD", "SPX", "NDX", "GOLD"]

BAR_MIN = 15
TRAIL_BARS = 4          # 1h trailing slope
CORR_WINDOW_BARS = 8    # 2h rolling correlation
SYNC_THRESHOLDS = [0.3, 0.5, 0.7]
FWD_WINDOWS_MIN = [15, 30, 60]
N_PLACEBO = 300


def load(name: str) -> pd.Series:
    df = pd.read_csv(OUT / f"{name}.csv", index_col=0, parse_dates=True)
    return df.iloc[:, 0]


def tod_grid(s: pd.Series) -> pd.DataFrame:
    s = s.copy()
    s.index = s.index.tz_convert("UTC")
    bucket = s.index.floor(f"{BAR_MIN}min")
    df = pd.DataFrame({"value": s.values}, index=bucket).groupby(level=0).last()
    df["date"] = df.index.date
    df["tod"] = df.index.time
    return df


def pair_days(y_dates, p_dates):
    p_arr = np.array(sorted(p_dates))
    pairs = []
    for d0 in sorted(y_dates):
        later = p_arr[p_arr > d0]
        if len(later) == 0:
            continue
        d1 = later[0]
        if (d1 - d0).days > 4:
            continue
        pairs.append((d0, d1))
    return pairs


def rolling_zcorr(y: np.ndarray, p: np.ndarray, w: int) -> np.ndarray:
    n = len(y)
    out = np.full(n, np.nan)
    for i in range(w - 1, n):
        yy = y[i - w + 1:i + 1]
        pp = p[i - w + 1:i + 1]
        if np.std(yy) == 0 or np.std(pp) == 0:
            continue
        out[i] = np.corrcoef(yy, pp)[0, 1]
    return out


def slope_sign(x: np.ndarray, i: int, back: int, fwd: int):
    """sign of trailing slope (i-back..i) vs sign of forward slope (i..i+fwd);
    returns (trail_sign, fwd_sign) or (nan, nan) if out of range."""
    n = len(x)
    if i - back < 0 or i + fwd >= n:
        return np.nan, np.nan
    trail = x[i] - x[i - back]
    forward = x[i + fwd] - x[i]
    return np.sign(trail), np.sign(forward)


def run_asset(name: str, y_by, p_by, pairs):
    rows = []  # pair_idx, t_idx, in_sync_corr, y_trail, y_fwd{H}, p_trail, p_fwd{H}
    for pi, (dy, dp) in enumerate(pairs):
        ys, ps = y_by[dy], p_by[dp]
        common = sorted(set(ys.index) & set(ps.index))
        if len(common) < CORR_WINDOW_BARS + max(FWD_WINDOWS_MIN) // BAR_MIN + TRAIL_BARS + 2:
            continue
        yv = ys.reindex(common).values.astype(float)
        pv = ps.reindex(common).values.astype(float)
        corr = rolling_zcorr(yv, pv, CORR_WINDOW_BARS)
        for i in range(len(common)):
            if np.isnan(corr[i]):
                continue
            rec = dict(pair=pi, i=i, corr=corr[i])
            ok = True
            for H in FWD_WINDOWS_MIN:
                hb = H // BAR_MIN
                yt, yf = slope_sign(yv, i, TRAIL_BARS, hb)
                pt, pf = slope_sign(pv, i, TRAIL_BARS, hb)
                if np.isnan(yt) or np.isnan(pt) or yt == 0 or pt == 0:
                    ok = False
                    break
                rec[f"y_turn_{H}"] = bool(yt != 0 and yf != 0 and yt != yf)
                rec[f"p_turn_{H}"] = bool(pt != 0 and pf != 0 and pt != pf)
            if ok:
                rows.append(rec)
    if not rows:
        return None
    return pd.DataFrame(rows)


def summarize(df: pd.DataFrame, name: str):
    out = []
    rng = np.random.default_rng(7)
    for H in FWD_WINDOWS_MIN:
        yt_col, pt_col = f"y_turn_{H}", f"p_turn_{H}"
        base_rate = df[pt_col].mean()
        for thr in SYNC_THRESHOLDS:
            in_sync = df["corr"].abs() > thr
            bucket_a = df[in_sync & df[yt_col]]
            bucket_b = df[(~in_sync) & df[yt_col]]
            if len(bucket_a) < 15:
                continue
            hit_a = bucket_a[pt_col].mean()
            hit_b = bucket_b[pt_col].mean() if len(bucket_b) >= 15 else np.nan

            # placebo: shuffle pair id on the p_turn column within bucket A's size,
            # drawing from the unconditional p_turn pool each time
            placebo = np.empty(N_PLACEBO)
            pool = df[pt_col].values
            for k in range(N_PLACEBO):
                placebo[k] = rng.choice(pool, size=len(bucket_a), replace=True).mean()
            z = (hit_a - placebo.mean()) / placebo.std() if placebo.std() > 0 else np.nan

            out.append(dict(asset=name, fwd_min=H, sync_thr=thr,
                             n_a=len(bucket_a), hit_a=hit_a,
                             n_b=len(bucket_b), hit_b=hit_b,
                             base_rate=base_rate, placebo_mean=placebo.mean(), z=z))
    return out


def main():
    yield_df = tod_grid(load("yield_TNX"))
    y_by = {d: g.set_index("tod")["value"] for d, g in yield_df.groupby("date")}
    all_rows = []
    for name in ASSETS:
        px_df = tod_grid(load(f"px_{name}"))
        p_by = {d: g.set_index("tod")["value"] for d, g in px_df.groupby("date")}
        pairs = pair_days(y_by.keys(), p_by.keys())
        df = run_asset(name, y_by, p_by, pairs)
        if df is None or df.empty:
            print(f"{name:7s} skip -- no usable rows")
            continue
        rows = summarize(df, name)
        all_rows.extend(rows)

    res = pd.DataFrame(all_rows)
    res.to_csv(OUT / "regime_test_results.csv", index=False)
    with pd.option_context("display.width", 160, "display.max_rows", 200):
        print(res.sort_values("z", ascending=False).to_string(index=False))


if __name__ == "__main__":
    main()
