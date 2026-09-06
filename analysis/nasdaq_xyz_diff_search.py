"""
NAS100 lead-lag XYZ-DIFFERENCE search -- exhaustive fixed-sign combinations
across the FULL 39-candidate universe, not just the pre-filtered "already
looks real" pool nasdaq_blend_search.py works from.

The user's idea, and why it's genuinely different from the ridge blend
search: ridge regression already searches over *weighted* combinations, so
"x - y" is technically inside that search space (weight +1, -1). But ridge
was only ever handed the ~9 candidates that already looked promising ALONE.
This script tests something the blend search structurally couldn't find:
a pair or triple where EACH MEMBER looks spurious or noisy by itself, but
subtracting them cancels a shared confound (e.g. "both just track the
broad risk-on/off tape") and leaves a cleaner residual. This is exactly
the mechanism that already made XLY/XLP, HY-IG spread, and 2s10s slope
into real signals in the first place -- this script asks whether more such
differences exist among candidates nobody paired up yet, including ones
individually flagged SPURIOUS-LOOKING-ONLY or NO SIGNAL (gold, DAX, FTSE,
Nikkei, USB02Y, etc.).

Also methodologically different in a second way, worth being explicit
about: fixed +-1 "sign" weights are LOWER VARIANCE than ridge-fit weights
(nothing to overfit -- you can't tune a coefficient that isn't there). The
ridge blend's 45h target failed with a classic overfitting signature
(SELECT ic~0.31 -> HOLDOUT ic~0.11); a fixed-sign combination might
generalize better at exactly the horizon where fitted weights didn't,
precisely because it has fewer effective degrees of freedom to overfit
with. Worth a genuine, separate shot at both 12h and 45h targets.

Search space: C(39,2)=741 pairs x 2 sign patterns (sum, diff) = 1,482, plus
C(39,3)=9,139 triples x 4 sign patterns (flipping ALL signs doesn't change
|IC|, so only 4 of the 8 patterns are distinct) = 36,556. ~38,000 total.

Same three-way split discipline as nasdaq_blend_search.py: each
candidate's own lag was already chosen on TRAIN (0-65%, by
nasdaq_lead_lag_scan.py, not reused here); this script ranks all ~38,000
combos on SELECT (65-82.5%); only the top handful get scored on HOLDOUT
(82.5-100%), once, with the full honest battery. With this many combos
tested, the SELECT ranking is a much more aggressive multiple-comparison
search than the blend script's -- treat a HOLDOUT pass here as suggestive,
not as clean as a single pre-registered test, same caveat as before but
more so.

Simplification for speed/clarity: uses ONE shared valid-data mask across
ALL 39 candidates (not a per-combo mask like the blend script), since with
~3 years of largely-complete data the intersection is still the large
majority of bars -- reported explicitly so it's not a hidden assumption.

Usage:
    python -m analysis.nasdaq_xyz_diff_search [--target-lag-h 12] [--max-triples 9139]
        (reuses analysis/output/nasdaq_lead_lag/raw/ and candidate_summary.csv)
"""
from __future__ import annotations

import argparse
from itertools import combinations
from pathlib import Path

import numpy as np
import pandas as pd

from analysis.nasdaq_lead_lag_scan import (
    align_asof, build_source_series, cell_stats, load_fred, load_oanda,
    load_yahoo, time_shift, OANDA_M15, VERDICT_IC_FLOOR, VERDICT_P_NULL,
)

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "analysis" / "output" / "nasdaq_lead_lag"

SELECT_FRAC = 0.825
TRAIN_FRAC = 0.65
TOP_N_TO_HOLDOUT = 12
ZWIN = 250


def rank_z(a: np.ndarray) -> np.ndarray:
    r = pd.Series(a).rank().to_numpy()
    r = r - r.mean()
    sd = r.std()
    return r / sd if sd > 0 else r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target-lag-h", type=int, default=12)
    args = ap.parse_args()
    target_lag_h = args.target_lag_h

    oanda = {name: load_oanda(name) for name in OANDA_M15}
    oanda = {k: v for k, v in oanda.items() if v is not None}
    fred = load_fred()
    yahoo_names = ["iwm", "spy", "xly", "xlp", "hyg", "lqd", "copper", "gold_yahoo"]
    yahoo = {k: v for k, v in {n: load_yahoo(n) for n in yahoo_names}.items() if v is not None}

    nas_close = oanda["nas100"]
    nas_idx = nas_close.index
    nas_logpx = np.log(nas_close)
    n = len(nas_idx)
    src = build_source_series(oanda, fred, yahoo)

    lag_map = pd.read_csv(OUT / "candidate_summary.csv").set_index("key")["best_lag_h"].to_dict()

    print(f"NAS100 M15: {n:,} bars, {nas_idx[0]} .. {nas_idx[-1]}")
    print(f"Target horizon (fixed): {target_lag_h}h")

    y_target = time_shift(nas_logpx, -target_lag_h) - nas_logpx

    def rolling_z(s: pd.Series) -> pd.Series:
        mu = s.rolling(ZWIN, min_periods=60).mean()
        sd = s.rolling(ZWIN, min_periods=60).std()
        return (s - mu) / sd

    keys, cols = [], []
    for key, L in lag_map.items():
        if key not in src or not np.isfinite(L):
            continue
        aligned = align_asof(nas_idx, src[key])
        x = aligned - time_shift(aligned, int(L))
        cols.append(rolling_z(x).to_numpy())
        keys.append(key)
    Z = np.column_stack(cols)  # n x k
    print(f"Loaded {len(keys)} candidates into the shared matrix.")

    train_end_i = int(n * TRAIN_FRAC)
    select_i = int(n * SELECT_FRAC)
    idx_pos = np.arange(n)

    # ONE shared valid mask across every candidate (see docstring) -- report
    # exactly how much of the window this costs us.
    valid_all = np.isfinite(Z).all(axis=1) & y_target.notna().to_numpy()
    sel_mask = valid_all & (idx_pos > train_end_i) & (idx_pos <= select_i)
    hold_mask = valid_all & (idx_pos > select_i)
    print(f"Shared-valid bars: {valid_all.sum():,} / {n:,} total "
          f"({valid_all[idx_pos <= select_i].sum():,} in train+select, {hold_mask.sum():,} in holdout)")

    Z_sel = Z[sel_mask]
    y_sel = rank_z(y_target.to_numpy()[sel_mask])
    Z_sel_rz = np.column_stack([rank_z(Z_sel[:, i]) for i in range(Z_sel.shape[1])])

    results = []
    k = len(keys)

    for i, j in combinations(range(k), 2):
        for sign, tag in [(1, "+"), (-1, "-")]:
            combo_z = Z_sel_rz[:, i] + sign * Z_sel_rz[:, j]
            ic = float(np.corrcoef(rank_z(combo_z), y_sel)[0, 1])
            results.append((ic, (keys[i], keys[j]), (1, sign)))

    triple_patterns = [(1, 1, 1), (1, 1, -1), (1, -1, 1), (1, -1, -1)]
    for i, j, l in combinations(range(k), 3):
        for signs in triple_patterns:
            combo_z = signs[0] * Z_sel_rz[:, i] + signs[1] * Z_sel_rz[:, j] + signs[2] * Z_sel_rz[:, l]
            ic = float(np.corrcoef(rank_z(combo_z), y_sel)[0, 1])
            results.append((ic, (keys[i], keys[j], keys[l]), signs))

    results.sort(key=lambda r: abs(r[0]), reverse=True)
    print(f"\n{len(results):,} combinations tested on SELECT split. Top {TOP_N_TO_HOLDOUT} by |IC|:")

    def fmt_combo(combo, signs):
        parts = []
        for name, s in zip(combo, signs):
            sign_str = "+" if s > 0 else "-"
            parts.append(f"{sign_str}{name}")
        out = " ".join(parts)
        return out[1:] if out.startswith("+") else out

    for ic, combo, signs in results[:TOP_N_TO_HOLDOUT]:
        print(f"  {fmt_combo(combo, signs):90s} ic_select={ic:.4f}")

    print(f"\nHOLDOUT results (final, honest -- this is the number that matters):")
    rng = np.random.default_rng(13)
    holdout_rows = []
    nw_lag_bars = max(1, int(target_lag_h * 4))
    key_pos = {kk: idx for idx, kk in enumerate(keys)}
    for ic_sel, combo, signs in results[:TOP_N_TO_HOLDOUT]:
        cols_idx = [key_pos[c] for c in combo]
        Z_hold = Z[hold_mask][:, cols_idx]
        y_hold = y_target.to_numpy()[hold_mask]
        Z_hold_rz = np.column_stack([rank_z(Z_hold[:, m]) for m in range(Z_hold.shape[1])])
        combo_z_hold = sum(s * Z_hold_rz[:, m] for m, s in enumerate(signs))
        st = cell_stats(combo_z_hold, y_hold, nw_lag_bars, rng)
        verdict = "REAL" if (abs(st["ic"]) >= VERDICT_IC_FLOOR and st.get("p_null") is not None
                              and np.isfinite(st.get("p_null", np.nan)) and st["p_null"] < VERDICT_P_NULL
                              and st["stable"]) else "NOT CONFIRMED ON HOLDOUT"
        label = fmt_combo(combo, signs)
        print(f"  {label:90s} ic_select={ic_sel:.4f}  ic_holdout={st['ic']:.4f}  "
              f"p_null={st.get('p_null')}  stable={st['stable']}  -> {verdict}")
        holdout_rows.append(dict(combo=label, ic_select=ic_sel, ic_holdout=st["ic"],
                                   p_null=st.get("p_null"), stable=st["stable"], verdict=verdict))

    suffix = f"_h{target_lag_h}"
    pd.DataFrame(holdout_rows).to_csv(OUT / f"xyz_diff_holdout{suffix}.csv", index=False)
    pd.DataFrame([dict(combo=fmt_combo(c, s), ic_select=ic) for ic, c, s in results[:2000]]
                 ).to_csv(OUT / f"xyz_diff_top2000_select{suffix}.csv", index=False)
    print(f"\nwrote {OUT / f'xyz_diff_holdout{suffix}.csv'}")
    print(f"wrote {OUT / f'xyz_diff_top2000_select{suffix}.csv'}")


if __name__ == "__main__":
    main()
