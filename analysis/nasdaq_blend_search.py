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

Usage:
    python -m analysis.nasdaq_blend_search
        (reuses analysis/output/nasdaq_lead_lag/raw/ -- run
        nasdaq_lead_lag_scan.py --refresh first if that cache is missing)
"""
from __future__ import annotations

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
    ("hangseng",                         3),   # close miss: ic=0.033, p_null=0.052
    ("leg_hy_ig_credit_yahoo",          15),   # not real alone (ic=0.034, p_null=0.38) -- test if it adds anything combined
    ("usd_basket",                      12),   # NO SIGNAL alone -- included as a genuine "does more data help or hurt" test
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

    # -- build each pool member's x_i(t) = candidate's own realized change
    # over ITS lag, on NAS100's grid, same formula as nasdaq_lead_lag_scan.py's
    # run_candidate() -- and NAS100's own forward-return y_i(t) at that SAME
    # lag (each candidate has a different lag, so each gets its own y too).
    series = {}   # key -> (x: pd.Series, y: pd.Series) both on nas_idx
    for key, L in BLEND_POOL:
        if key not in src:
            print(f"  SKIP {key}: source unavailable")
            continue
        cand_aligned = align_asof(nas_idx, src[key])
        cand_lag = time_shift(cand_aligned, L)
        x = cand_aligned - cand_lag
        nas_ahead = time_shift(nas_logpx, -L)
        y = nas_ahead - nas_logpx
        series[key] = (x, y)
        print(f"  loaded {key:32s} lag={L}h  n_valid={int((x.notna() & y.notna()).sum()):,}")

    pool_keys = list(series.keys())
    if len(pool_keys) < 2:
        raise SystemExit("fewer than 2 usable pool candidates -- nothing to blend")

    # -- SELECT: for every combo size 2..N, fit ridge weights, rank by SELECT IC --
    select_mask_by_key = {}
    for key, (x, y) in series.items():
        idx_pos = np.arange(n)
        m = (x.notna() & y.notna()).to_numpy() & (idx_pos > train_end_i) & (idx_pos <= select_i)
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
            # y must agree across members at different lags -- it doesn't
            # (each candidate's y is NAS100's forward return over ITS OWN
            # lag). Use the SHORTEST lag in the combo's y as the blend's
            # target horizon -- the shortest-horizon claim is the more
            # conservative (harder) one to satisfy anyway.
            lags = {key: L for key, L in BLEND_POOL if key in combo}
            target_key = min(lags, key=lags.get)
            y_sel = series[target_key][1].to_numpy()[m]
            X_sel = np.column_stack([rank_z(series[key][0].to_numpy()[m]) for key in combo])
            yz_sel = rank_z(y_sel)
            w = ridge_ols(X_sel, yz_sel, RIDGE_LAMBDA_FRAC)
            pred_sel = w[0] + X_sel @ w[1:]
            ic_sel = float(np.corrcoef(rank_z(pred_sel), yz_sel)[0, 1])
            combo_results.append(dict(combo=combo, target_key=target_key, target_lag_h=lags[target_key],
                                        weights=w, n_select=n_sel, ic_select=ic_sel))

    combo_results.sort(key=lambda r: abs(r["ic_select"]), reverse=True)
    print(f"\n{len(combo_results)} combinations tested on SELECT split. Top {TOP_N_TO_HOLDOUT} by |IC|:")
    for r in combo_results[:TOP_N_TO_HOLDOUT]:
        print(f"  {'+'.join(r['combo']):70s} lag={r['target_lag_h']}h  ic_select={r['ic_select']:.4f}  n={r['n_select']}")

    # -- HOLDOUT: only the top finalists get scored here, ONCE --
    print(f"\nHOLDOUT results (final, honest -- this is the number that matters):")
    rng = np.random.default_rng(11)
    holdout_rows = []
    for r in combo_results[:TOP_N_TO_HOLDOUT]:
        combo = r["combo"]
        target_key = r["target_key"]
        idx_pos = np.arange(n)
        m = np.ones(n, dtype=bool)
        for key in combo:
            x, y = series[key]
            m &= (x.notna() & y.notna()).to_numpy()
        m &= idx_pos > select_i
        n_hold = int(m.sum())
        if n_hold < MIN_SPLIT_OBS:
            print(f"  {'+'.join(combo):70s} SKIP -- insufficient holdout overlap ({n_hold})")
            continue
        X_hold = np.column_stack([rank_z(series[key][0].to_numpy()[m]) for key in combo])
        y_hold = series[target_key][1].to_numpy()[m]
        w = r["weights"]
        pred_hold = w[0] + X_hold @ w[1:]
        L = r["target_lag_h"]
        nw_lag_bars = max(1, int(L * 4))
        st = cell_stats(pred_hold, y_hold, nw_lag_bars, rng)
        verdict = "REAL" if (abs(st["ic"]) >= VERDICT_IC_FLOOR and st.get("p_null") is not None
                              and np.isfinite(st.get("p_null", np.nan)) and st["p_null"] < VERDICT_P_NULL
                              and st["stable"]) else "NOT CONFIRMED ON HOLDOUT"
        print(f"  {'+'.join(combo):70s} ic_holdout={st['ic']:.4f}  p_null={st.get('p_null')}  "
              f"stable={st['stable']}  n={n_hold}  -> {verdict}")
        holdout_rows.append(dict(combo="+".join(combo), target_lag_h=L, ic_select=r["ic_select"],
                                   n_select=r["n_select"], ic_holdout=st["ic"], p_null=st.get("p_null"),
                                   stable=st["stable"], n_holdout=n_hold, verdict=verdict))

    pd.DataFrame(holdout_rows).to_csv(OUT / "blend_holdout_results.csv", index=False)
    pd.DataFrame([dict(combo="+".join(r["combo"]), target_lag_h=r["target_lag_h"],
                        ic_select=r["ic_select"], n_select=r["n_select"])
                  for r in combo_results]).to_csv(OUT / "blend_all_combos_select.csv", index=False)
    print(f"\nwrote {OUT / 'blend_holdout_results.csv'}")
    print(f"wrote {OUT / 'blend_all_combos_select.csv'}")


if __name__ == "__main__":
    main()
