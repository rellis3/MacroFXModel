"""
NAS100 lead-lag BLEND search -- follow-on to analysis/nasdaq_lead_lag_scan.py.

That scan tested 24 macro proxies individually and found 5 that clear an
honest walk-forward bar on their own, each at a DIFFERENT natural lag (XLY/XLP
discretionary-vs-staples at 12h, VIX at 45h, HY-IG credit spread at 6h,
copper/gold at 3h, plus the full Jordan risk-appetite composite at 15h,
though that one is weaker than its own XLY/XLP leg alone). The user's
question: is the educator's line a blend of several such signals rather than
one dominant proxy? Plausible -- each of ours is modest alone but plausibly
carries different, complementary information. This script tests that
directly, honestly.

Why this needs a THIRD data split, not just train/test again: the 5 (well,
~8, see BLEND_POOL below) candidates below were already SELECTED as "real"
using nasdaq_lead_lag_scan.py's TEST split (the 35% after the 65% used to
pick each one's own best lag). If we now fit a blend and score it on that
SAME test split, we'd be quietly reusing the data that picked the ingredients
to also grade the finished dish -- the identical look-ahead trap this whole
project exists to catch, just one level up. So this script uses a proper
three-way split on top of the lag-search TRAIN window:

    TRAIN   (0-65%)     -- already used by nasdaq_lead_lag_scan.py to pick
                           each candidate's own best lag L_i. Not reused here.
    SELECT  (65-82.5%)  -- fit blend weights (small-ridge OLS on rank-z'd
                           inputs, same regularization idea as the Pine
                           fair-value fix for collinear features) for every
                           combination of 2+ candidates from the pool, rank
                           combinations by SELECT-split IC.
    HOLDOUT (82.5-100%) -- never touched until the very end. Only the top few
                           combinations by SELECT performance get scored here,
                           once, with the full honest battery (rank-IC,
                           circular-shift null, split-half stability). This
                           is the number that actually answers "does a blend
                           help" -- everything before it is just search.

Testing a handful of finalists (not thousands) against one never-reused
holdout is standard practice, but it's not perfectly zero-leakage either --
report that plainly rather than pretend the top HOLDOUT result is as clean
as a single pre-registered hypothesis test would be.

Every combo predicts the SAME fixed forecast horizon (--target-lag-h, default
12h) regardless of how far back any individual ingredient looks -- e.g.
nas_rvol's x_i is its own change over the last 3h, but it still predicts
NAS100's return over the next `target_lag_h` hours, same as every other
ingredient. An earlier version derived the target from the SHORTEST lag
among a combo's members instead, which unfairly penalized any combo
containing a short-lookback ingredient (nas_rvol, hangseng, both 3h) by
forcing the whole blend onto a noisier 3h target. Fixed here -- run with
different --target-lag-h values (e.g. 12 and 45) to see whether short-lookback
intraday ingredients combine better into a near-term or a longer-horizon
target.

Usage:
    python -m analysis.nasdaq_blend_search [--target-lag-h 12]
        (reuses analysis/output/nasdaq_lead_lag/raw/ -- run
        nasdaq_lead_lag_scan.py --refresh first if that cache is missing)
"""
from __future__ import annotations

import argparse
from itertools import combinations
from pathlib import Path

import numpy as np
import pandas as pd

from analysis.nasdaq_lead_lag_scan import (
    align_asof, build_source_series, cell_stats, load_fred, load_oanda,
    load_yahoo, time_shift, OANDA_M15, N_NULL, STABLE_MIN_HALF, VERDICT_IC_FLOOR,
    VERDICT_P_NULL,
)

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "analysis" / "output" / "nasdaq_lead_lag"

SELECT_FRAC = 0.825   # of the FULL series: 0-65% train (reused lags only),
                       # 65-82.5% select, 82.5-100% holdout
RIDGE_LAMBDA_FRAC = 0.05   # x n_select, same idea as the Pine ridge fix
TOP_N_TO_HOLDOUT = 6        # how many SELECT-ranked combos get a HOLDOUT shot
MIN_SPLIT_OBS = 150
DEFAULT_TARGET_LAG_H = 12   # --target-lag-h overrides. The forecast HORIZON,
                             # fixed for the whole run and shared by every
                             # combo -- separate from how far back each
                             # ingredient's own x_i looks (that's each pool
                             # member's own lag in BLEND_POOL below).
                             # Earlier version picked target = the SHORTEST
                             # lag among a combo's members, which unfairly
                             # penalized combos containing nas_rvol/hangseng
                             # (3h) by forcing the whole blend onto a
                             # noisier 3h target instead of a real, fixed
                             # forecast horizon. Fixed here.

# The candidate pool: every nasdaq_lead_lag_scan.py candidate that cleared
# REAL or came close (|ic| >= 0.02 on that run's test split), each pinned at
# ITS OWN best lag from that scan (analysis/output/nasdaq_lead_lag/candidate_summary.csv).
# Hand-picked from that file rather than re-running the lag search here --
# the lag choice is already an honest TRAIN-split result, no reason to redo it.
BLEND_POOL = [
    # key                          lag_h  from nasdaq_lead_lag_scan.py's candidate_summary.csv
    ("leg_discretionary_staples_yahoo", 12),   # REAL, ic=0.36
    ("jordan_composite_yahoo",          15),   # REAL, ic=0.29 (correlated w/ the leg above -- kept anyway, let the ridge fit sort it out)
    ("vix",                             45),   # REAL, ic=-0.12
    ("hy_ig_oas_diff",                   6),   # REAL, ic=-0.06
    ("copper_gold_ratio_yahoo",          3),   # REAL, ic=0.04
    ("hangseng",                         3),   # REAL (borderline), ic=0.033, p_null=0.047 -- intraday-native
    ("leg_hy_ig_credit_yahoo",          15),   # not real alone (ic=0.034, p_null=0.38) -- test if it adds anything combined
    ("usd_basket",                      12),   # NO SIGNAL alone -- included as a genuine "does more data help or hurt" test
    ("nas_rvol",                         3),   # REAL, ic=0.055, p_null=0.005 -- intraday-native (OANDA-derived, updates every bar)
]


def ridge_ols(X: np.ndarray, y: np.ndarray, lam_frac: float) -> np.ndarray:
    """X: n x k (NO intercept column -- added here). Ridge on feature columns
    only, never the intercept, same convention as the Pine fair-value fix."""
    n, k = X.shape
    Xd = np.column_stack([np.ones(n), X])
    XtX = Xd.T @ Xd
    lam = lam_frac * n
    for j in range(1, k + 1):
        XtX[j, j] += lam
    Xty = Xd.T @ y
    return np.linalg.solve(XtX, Xty)  # [intercept, w1..wk]


def rank_z(a: np.ndarray) -> np.ndarray:
    r = pd.Series(a).rank().to_numpy()
    r = r - r.mean()
    sd = r.std()
    return r / sd if sd > 0 else r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target-lag-h", type=int, default=DEFAULT_TARGET_LAG_H,
                     help="Fixed forecast horizon (hours) shared by every combo, "
                          "independent of each ingredient's own lookback lag.")
    args = ap.parse_args()
    target_lag_h = args.target_lag_h

    oanda = {name: load_oanda(name) for name in OANDA_M15}
    oanda = {k: v for k, v in oanda.items() if v is not None}
    fred = load_fred()
    yahoo_names = ["iwm", "spy", "xly", "xlp", "hyg", "lqd", "copper", "gold_yahoo"]
    yahoo = {k: v for k, v in {n: load_yahoo(n) for n in yahoo_names}.items() if v is not None}

    if "nas100" not in oanda:
        raise SystemExit("no cached NAS100 M15 data -- run nasdaq_lead_lag_scan.py --refresh first")

    nas_close = oanda["nas100"]
    nas_idx = nas_close.index
    nas_logpx = np.log(nas_close)
    n = len(nas_idx)
    print(f"NAS100 M15: {n:,} bars, {nas_idx[0]} .. {nas_idx[-1]}")

    src = build_source_series(oanda, fred, yahoo)

    select_i = int(n * SELECT_FRAC)
    train_end_i = int(n * 0.65)  # matches nasdaq_lead_lag_scan.py's TRAIN_FRAC; not reused, just for the printed summary
    print(f"TRAIN (lags already fixed): {nas_idx[0]} .. {nas_idx[train_end_i]}")
    print(f"SELECT (fit blend weights): {nas_idx[train_end_i]} .. {nas_idx[select_i]}")
    print(f"HOLDOUT (final honest test): {nas_idx[select_i]} .. {nas_idx[-1]}")
    print(f"Target horizon (fixed for all combos): {target_lag_h}h")

    # ONE shared forecast target for every combo -- NAS100's forward return
    # over the fixed target_lag_h, independent of any ingredient's own
    # lookback lag.
    y_target = time_shift(nas_logpx, -target_lag_h) - nas_logpx

    # -- build each pool member's x_i(t) = candidate's own realized change
    # over ITS OWN lag (how far back this specific ingredient looks -- e.g.
    # nas_rvol looks back 3h even though the target is 12h ahead), same
    # formula as nasdaq_lead_lag_scan.py's run_candidate().
    series = {}   # key -> x: pd.Series, on nas_idx
    for key, L in BLEND_POOL:
        if key not in src:
            print(f"  SKIP {key}: source unavailable")
            continue
        cand_aligned = align_asof(nas_idx, src[key])
        cand_lag = time_shift(cand_aligned, L)
        x = cand_aligned - cand_lag
        series[key] = x
        n_valid = int((x.notna() & y_target.notna()).sum())
        print(f"  loaded {key:32s} lookback={L}h  n_valid={n_valid:,}")

    pool_keys = list(series.keys())
    if len(pool_keys) < 2:
        raise SystemExit("fewer than 2 usable pool candidates -- nothing to blend")

    # -- SELECT: for every combo size 2..N, fit ridge weights, rank by SELECT IC --
    y_valid = y_target.notna()
    select_mask_by_key = {}
    for key, x in series.items():
        idx_pos = np.arange(n)
        m = (x.notna() & y_valid).to_numpy() & (idx_pos > train_end_i) & (idx_pos <= select_i)
        select_mask_by_key[key] = m

    combo_results = []
    for k in range(2, len(pool_keys) + 1):
        for combo in combinations(pool_keys, k):
            # rows valid across ALL members of this combo, in SELECT window
            m = select_mask_by_key[combo[0]].copy()
            for key in combo[1:]:
                m &= select_mask_by_key[key]
            n_sel = int(m.sum())
            if n_sel < MIN_SPLIT_OBS:
                continue
            y_sel = y_target.to_numpy()[m]
            X_sel = np.column_stack([rank_z(series[key].to_numpy()[m]) for key in combo])
            yz_sel = rank_z(y_sel)
            w = ridge_ols(X_sel, yz_sel, RIDGE_LAMBDA_FRAC)
            pred_sel = w[0] + X_sel @ w[1:]
            ic_sel = float(np.corrcoef(rank_z(pred_sel), yz_sel)[0, 1])
            combo_results.append(dict(combo=combo, weights=w, n_select=n_sel, ic_select=ic_sel))

    combo_results.sort(key=lambda r: abs(r["ic_select"]), reverse=True)
    print(f"\n{len(combo_results)} combinations tested on SELECT split. Top {TOP_N_TO_HOLDOUT} by |IC|:")
    for r in combo_results[:TOP_N_TO_HOLDOUT]:
        print(f"  {'+'.join(r['combo']):70s} ic_select={r['ic_select']:.4f}  n={r['n_select']}")

    # -- HOLDOUT: only the top finalists get scored here, ONCE --
    print(f"\nHOLDOUT results (final, honest -- this is the number that matters):")
    rng = np.random.default_rng(11)
    holdout_rows = []
    nw_lag_bars = max(1, int(target_lag_h * 4))
    for r in combo_results[:TOP_N_TO_HOLDOUT]:
        combo = r["combo"]
        idx_pos = np.arange(n)
        m = y_valid.to_numpy() & (idx_pos > select_i)
        for key in combo:
            m &= series[key].notna().to_numpy()
        n_hold = int(m.sum())
        if n_hold < MIN_SPLIT_OBS:
            print(f"  {'+'.join(combo):70s} SKIP -- insufficient holdout overlap ({n_hold})")
            continue
        X_hold = np.column_stack([rank_z(series[key].to_numpy()[m]) for key in combo])
        y_hold = y_target.to_numpy()[m]
        w = r["weights"]
        pred_hold = w[0] + X_hold @ w[1:]
        st = cell_stats(pred_hold, y_hold, nw_lag_bars, rng)
        verdict = "REAL" if (abs(st["ic"]) >= VERDICT_IC_FLOOR and st.get("p_null") is not None
                              and np.isfinite(st.get("p_null", np.nan)) and st["p_null"] < VERDICT_P_NULL
                              and st["stable"]) else "NOT CONFIRMED ON HOLDOUT"
        print(f"  {'+'.join(combo):70s} ic_holdout={st['ic']:.4f}  p_null={st.get('p_null')}  "
              f"stable={st['stable']}  n={n_hold}  -> {verdict}")
        holdout_rows.append(dict(combo="+".join(combo), target_lag_h=target_lag_h, ic_select=r["ic_select"],
                                   n_select=r["n_select"], ic_holdout=st["ic"], p_null=st.get("p_null"),
                                   stable=st["stable"], n_holdout=n_hold, verdict=verdict))

    suffix = f"_h{target_lag_h}"
    pd.DataFrame(holdout_rows).to_csv(OUT / f"blend_holdout_results{suffix}.csv", index=False)
    pd.DataFrame([dict(combo="+".join(r["combo"]), ic_select=r["ic_select"], n_select=r["n_select"])
                  for r in combo_results]).to_csv(OUT / f"blend_all_combos_select{suffix}.csv", index=False)
    print(f"\nwrote {OUT / f'blend_holdout_results{suffix}.csv'}")
    print(f"wrote {OUT / f'blend_all_combos_select{suffix}.csv'}")


if __name__ == "__main__":
    main()
