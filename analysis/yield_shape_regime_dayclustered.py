"""
Day-clustered significance test for the regime-gated turn-prediction result in
yield_shape_regime_test.py.

That script's z-scores treated every 15-min bar as an independent draw against a
bar-level bootstrap placebo. They aren't independent -- bars inside the same trading
day share the same yield-day template and the same price day, so the true sample size
is the ~40-90 DAY-PAIRS, not the several-hundred bar count. This re-tests the same
"in-sync AND yield-turn -> price-turn" hypothesis with a placebo that respects day
clustering: for each day's selected bucket-A time slots, the null draws the outcome
from a RANDOMLY DIFFERENT day's price-turn series at those same time-of-day slots
(instead of pooling all bars). That preserves each day's own within-day correlation
structure and destroys only the true D-1->D correspondence, which is the thing being
tested.

Usage:
    python -m analysis.yield_shape_regime_dayclustered
(reuses Yahoo data pulled by yield_shape_lead.py --refresh)
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from analysis.yield_shape_regime_test import (
    ASSETS, FWD_WINDOWS_MIN, SYNC_THRESHOLDS, load, tod_grid, pair_days, run_asset, OUT,
)

N_SHUFFLE = 500
MIN_DAYS = 8


def day_clustered_test(df: pd.DataFrame, H: int, thr: float, rng) -> dict | None:
    yt_col, pt_col = f"y_turn_{H}", f"p_turn_{H}"
    sub = df[["pair", "i", "corr", yt_col, pt_col]]
    bucket_a = sub[(sub["corr"].abs() > thr) & sub[yt_col]]
    n_days = bucket_a["pair"].nunique()
    if n_days < MIN_DAYS or len(bucket_a) < 15:
        return None

    hits = bucket_a[pt_col].sum()
    n = len(bucket_a)
    hit_rate = hits / n

    p_lookup = {pid: dict(zip(g["i"], g[pt_col])) for pid, g in sub.groupby("pair")}
    all_pairs = sub["pair"].unique()
    bucket_a_days = bucket_a.groupby("pair")["i"].apply(list).to_dict()

    null_rates = np.empty(N_SHUFFLE)
    for k in range(N_SHUFFLE):
        total_hits, total_n = 0, 0
        for pid, idxs in bucket_a_days.items():
            others = all_pairs[all_pairs != pid]
            if len(others) == 0:
                continue
            pj = rng.choice(others)
            lut = p_lookup.get(pj, {})
            for i in idxs:
                v = lut.get(i)
                if v is None or (isinstance(v, float) and np.isnan(v)):
                    continue
                total_hits += int(v)
                total_n += 1
        null_rates[k] = (total_hits / total_n) if total_n > 0 else np.nan

    null_rates = null_rates[~np.isnan(null_rates)]
    if len(null_rates) < N_SHUFFLE * 0.5:
        return None
    null_mean, null_std = null_rates.mean(), null_rates.std()
    z = (hit_rate - null_mean) / null_std if null_std > 0 else np.nan
    if hit_rate >= null_mean:
        p_emp = (np.sum(null_rates >= hit_rate) + 1) / (len(null_rates) + 1)
    else:
        p_emp = (np.sum(null_rates <= hit_rate) + 1) / (len(null_rates) + 1)

    return dict(n_bars=n, n_days=n_days, hit_rate=hit_rate,
                null_mean=null_mean, null_std=null_std, z=z, p_emp=p_emp)


def main():
    yield_df = tod_grid(load("yield_TNX"))
    y_by = {d: g.set_index("tod")["value"] for d, g in yield_df.groupby("date")}
    rng = np.random.default_rng(11)

    out_rows = []
    for name in ASSETS:
        px_df = tod_grid(load(f"px_{name}"))
        p_by = {d: g.set_index("tod")["value"] for d, g in px_df.groupby("date")}
        pairs = pair_days(y_by.keys(), p_by.keys())
        df = run_asset(name, y_by, p_by, pairs)
        if df is None or df.empty:
            continue
        for H in FWD_WINDOWS_MIN:
            for thr in SYNC_THRESHOLDS:
                r = day_clustered_test(df, H, thr, rng)
                if r:
                    r.update(asset=name, fwd_min=H, sync_thr=thr)
                    out_rows.append(r)

    res = pd.DataFrame(out_rows)
    res = res[["asset", "fwd_min", "sync_thr", "n_days", "n_bars", "hit_rate",
               "null_mean", "null_std", "z", "p_emp"]]
    res.to_csv(OUT / "regime_dayclustered_results.csv", index=False)
    with pd.option_context("display.width", 160, "display.max_rows", 200):
        print(res.sort_values("z", ascending=False).to_string(index=False))


if __name__ == "__main__":
    main()
