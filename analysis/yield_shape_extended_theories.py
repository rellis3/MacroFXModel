"""
Five extensions of the regime-gated yield-shape result (yield_shape_regime_dayclustered.py,
day-clustered-survived cells: EURUSD 15m/corr>0.7, GBPUSD 15m/corr>0.5, NZDUSD 30m/corr>0.5,
USDCHF 60m/corr>0.5 -- the exact config wired into js/yieldShapeRegimeCore.js). Reuses the
cached 60-day Yahoo dataset pulled 2026-10-02 (analysis/output/yield_shape_lead/).

A — MISS FOLLOW-THROUGH: when price does not turn inside the window, does it keep going?
    How much further, and how much longer until it does turn (same price-day only)?
B — SLOPE STEEPNESS -> MOVE SIZE: does a steeper yesterday-yield-slope at the signal point
    predict a bigger forward price move (terciles), not just a sign?
C — CONTINUOUS DOSE-RESPONSE: hit-rate as a smooth function of |corr|, not just the three
    discrete thresholds already tested.
D — CROSS-PAIR CONFLUENCE: when 2+ of the 4 pairs fire at the same (date, time-of-day), is
    the hit-rate higher than a single pair firing alone?
E — CALENDAR CONFOUND CHECK: are "hit" events concentrated on particular weekdays (this
    project has twice found real-looking effects that were actually day-of-month/week
    artefacts -- funding-stress, repo-stress-range) -- required before trusting the result
    further, not optional.

Usage:
    python -m analysis.yield_shape_extended_theories
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from analysis.yield_shape_regime_test import (
    BAR_MIN, TRAIL_BARS, CORR_WINDOW_BARS, load, tod_grid, pair_days, rolling_zcorr, slope_sign, OUT,
)

# the exact live config from js/yieldShapeRegimeCore.js INSTRUMENTS
LIVE_CONFIG = {
    "EURUSD": {"window": 15, "thr": 0.7},
    "GBPUSD": {"window": 15, "thr": 0.5},
    "NZDUSD": {"window": 30, "thr": 0.5},
    "USDCHF": {"window": 60, "thr": 0.5},
}


def build_pair_arrays(name, y_by, p_by, pairs):
    """For each (yield-day, price-day) pair, return the common tod-aligned yv/pv arrays plus the
    rolling correlation -- everything needed to look arbitrarily far forward/back per event."""
    out = []
    for pi, (dy, dp) in enumerate(pairs):
        ys, ps = y_by[dy], p_by[dp]
        common = sorted(set(ys.index) & set(ps.index))
        if len(common) < CORR_WINDOW_BARS + 4 + 2:
            continue
        yv = ys.reindex(common).values.astype(float)
        pv = ps.reindex(common).values.astype(float)
        corr = rolling_zcorr(yv, pv, CORR_WINDOW_BARS)
        out.append(dict(pair=pi, dy=dy, dp=dp, tod=common, yv=yv, pv=pv, corr=corr))
    return out


def events_for(name, cfg, arrays):
    """bucket_a events for this pair's OWN live config: in_sync & yield_turn at H.
    Returns one row per event with everything needed for A/B/C/D/E."""
    H, thr = cfg["window"], cfg["thr"]
    hb = H // BAR_MIN
    rows = []
    for a in arrays:
        yv, pv, corr, tod = a["yv"], a["pv"], a["corr"], a["tod"]
        n = len(yv)
        for i in range(n):
            if np.isnan(corr[i]) or abs(corr[i]) <= thr:
                continue
            yt, yf = slope_sign(yv, i, TRAIL_BARS, hb)
            if np.isnan(yt) or yt == 0 or yf == 0 or yt == yf:
                continue  # no yield turn predicted here
            pt, pf = slope_sign(pv, i, TRAIL_BARS, hb)
            if np.isnan(pt) or pt == 0:
                continue
            hit = bool(pf != 0 and pt != pf)
            # A: if miss, scan forward (same price-day array) for the first later turn
            extra_bars, extra_mag, found = None, None, False
            if not hit:
                for j in range(i + hb + 1, n):
                    tj, fj = slope_sign(pv, j, TRAIL_BARS, 1)
                    if np.isnan(tj) or tj == 0 or fj == 0:
                        continue
                    if tj != fj:
                        extra_bars = (j - i) * BAR_MIN
                        extra_mag = abs(pv[j] - pv[i])
                        found = True
                        break
                if not found:
                    extra_bars = (n - 1 - i) * BAR_MIN
                    extra_mag = abs(pv[-1] - pv[i])
            window_mag = abs(pv[i + hb] - pv[i])
            rows.append(dict(
                asset=name, pair=a["pair"], i=i, date=a["dp"], tod=tod[i],
                weekday=pd.Timestamp(a["dp"]).day_name(),
                corr=corr[i], yield_slope=abs(yv[i] - yv[i - TRAIL_BARS]),
                hit=hit, window_mag=window_mag,
                miss_found_later_turn=found if not hit else None,
                extra_bars_to_turn=extra_bars, extra_mag_to_turn=extra_mag,
            ))
    return pd.DataFrame(rows)


def theory_a(df):
    miss = df[~df["hit"]]
    print(f"\n=== A: MISS FOLLOW-THROUGH (n={len(miss)}) ===")
    if miss.empty:
        print("  no misses in sample"); return
    found = miss[miss["miss_found_later_turn"] == True]
    not_found = miss[miss["miss_found_later_turn"] == False]
    print(f"  later turn found same day: {len(found)}/{len(miss)} ({len(found)/len(miss)*100:.0f}%)")
    if len(found):
        print(f"    extra time to turn: mean {found['extra_bars_to_turn'].mean():.0f}min  median {found['extra_bars_to_turn'].median():.0f}min")
        print(f"    extra move to that turn: mean {found['extra_mag_to_turn'].mean():.5f}  vs hit-window move mean {df[df['hit']]['window_mag'].mean():.5f}")
    if len(not_found):
        print(f"  no turn found before day end ({len(not_found)}): mean move by day-end {not_found['extra_mag_to_turn'].mean():.5f}")
    hit_mag = df[df["hit"]]["window_mag"].mean()
    print(f"  compare: HIT window move mean {hit_mag:.5f} vs MISS eventual move mean {miss['extra_mag_to_turn'].mean():.5f}  (ratio {miss['extra_mag_to_turn'].mean()/hit_mag:.2f}x)" if hit_mag else "")


def theory_b(df):
    print(f"\n=== B: SLOPE STEEPNESS -> MOVE SIZE (n={len(df)}) ===")
    if len(df) < 15:
        print("  UNTESTABLE -- too few events"); return
    terc = pd.qcut(df["yield_slope"], 3, labels=["shallow", "medium", "steep"], duplicates="drop")
    g = df.groupby(terc, observed=True).agg(n=("hit", "size"), hit_rate=("hit", "mean"), mean_move=("window_mag", "mean"))
    print(g.to_string())


def theory_c(df):
    print(f"\n=== C: CONTINUOUS DOSE-RESPONSE on |corr| (n={len(df)}) ===")
    if len(df) < 20:
        print("  UNTESTABLE -- too few events"); return
    bins = [0.0, 0.5, 0.6, 0.7, 0.8, 1.01]
    labels = ["0.0-0.5", "0.5-0.6", "0.6-0.7", "0.7-0.8", "0.8-1.0"]
    cut = pd.cut(df["corr"].abs(), bins=bins, labels=labels, include_lowest=True)
    g = df.groupby(cut, observed=True).agg(n=("hit", "size"), hit_rate=("hit", "mean"))
    print(g.to_string())


def theory_d(all_events: pd.DataFrame):
    print("\n=== D: CROSS-PAIR CONFLUENCE ===")
    key = all_events.groupby(["date", "tod"])["asset"].apply(lambda s: sorted(set(s)))
    overlap_count = key.apply(len)
    all_events = all_events.merge(overlap_count.rename("n_pairs_firing"), on=["date", "tod"], how="left")
    solo = all_events[all_events["n_pairs_firing"] == 1]
    conf = all_events[all_events["n_pairs_firing"] >= 2]
    print(f"  solo-firing events: n={len(solo)}  hit-rate={solo['hit'].mean():.3f}" if len(solo) else "  solo: none")
    print(f"  confluence (2+ pairs): n={len(conf)}  hit-rate={conf['hit'].mean():.3f}" if len(conf) else "  confluence: none -- too rare in this 60-day window")
    if len(conf) >= 5:
        print(conf[["date", "tod", "asset", "hit"]].to_string(index=False))


def theory_e(df):
    print(f"\n=== E: CALENDAR CONFOUND CHECK (n={len(df)}) ===")
    if df.empty:
        print("  no events"); return
    order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    g = df.groupby("weekday").agg(n=("hit", "size"), hit_rate=("hit", "mean")).reindex(order).dropna(how="all")
    print(g.to_string())
    share = (df["weekday"] == "Monday").mean()
    print(f"  Monday share of events: {share*100:.0f}% (base rate ~20% if evenly spread across a 5-day week)")


def main():
    yield_df = tod_grid(load("yield_TNX"))
    y_by = {d: g.set_index("tod")["value"] for d, g in yield_df.groupby("date")}

    all_events = []
    for name, cfg in LIVE_CONFIG.items():
        px_df = tod_grid(load(f"px_{name}"))
        p_by = {d: g.set_index("tod")["value"] for d, g in px_df.groupby("date")}
        pairs = pair_days(y_by.keys(), p_by.keys())
        arrays = build_pair_arrays(name, y_by, p_by, pairs)
        ev = events_for(name, cfg, arrays)
        print(f"{name}: {len(ev)} bucket_a events ({cfg['window']}m, |corr|>{cfg['thr']})")
        if ev.empty:
            continue
        theory_a(ev)
        theory_b(ev)
        theory_c(ev)
        all_events.append(ev)

    if not all_events:
        print("no events across any pair -- nothing to analyse")
        return
    pooled = pd.concat(all_events, ignore_index=True)
    theory_d(pooled)
    theory_e(pooled)

    pooled.to_csv(OUT / "extended_theories_events.csv", index=False)
    print(f"\nwritten {OUT / 'extended_theories_events.csv'}  ({len(pooled)} total events)")


if __name__ == "__main__":
    main()
