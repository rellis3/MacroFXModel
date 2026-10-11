"""Daily vs weekly range lines, like for like (descriptive, 2026-10-11; no hypothesis, no tuning, nothing selected).

    python -m forge.daily_vs_weekly_descriptive

Same daily bars (london22 sessions, horizon_reversion daily_cache), same production sigma estimator per instrument, same
reverting horizon sigma as the shipped Weekly - Reverting (HL 5; daily = sigma itself). Widths fitted on the first 60% of
windows, scored on the last 40%. Per horizon: how much of the realised range the forecast explains (R2 of log range on log
forecast), how spread out outcomes are around the line (sd of log realised/forecast; p90 / p50 width ratio), p75 calibration,
and what one spread costs as a share of the typical range (repo cost table, x2 as in the research).
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from forge import vol as V
from forge.run_horizon_reversion import FORGE_KEY, ladder_estimators, daily_for, windows, horizon_sigma

OUT = Path("analysis/output/daily_vs_weekly")
SPREAD = {"EURUSD": 0.00006, "GBPUSD": 0.00009, "USDJPY": 0.007, "AUDUSD": 0.00007, "USDCHF": 0.00008, "AUDJPY": 0.010, "GOLD": 0.25,
          "NQ": 1.0, "SPX": 0.5, "DE30": 1.0, "UK100": 1.0, "DOW": 2.0, "CADJPY": 0.012, "CHFJPY": 0.014, "EURAUD": 0.00014,
          "EURCHF": 0.00010, "US2000": 0.4}


def stats(w, span, hl):
    n_tr = int(len(w) * 0.6)
    sh = horizon_sigma(w, span, hl)
    act = w["hl"].to_numpy()
    te = slice(n_tr, None)
    m = {q: V.fit_width_multiplier(sh[:n_tr], act[:n_tr], q) for q in (0.5, 0.75, 0.9)}
    la, lf = np.log(act[te]), np.log(m[0.5] * sh[te])
    r2 = 1 - np.var(la - lf) / np.var(la) if np.var(la) > 0 else np.nan
    return {"n_test": int(len(act[te])), "r2": float(r2), "corr": float(np.corrcoef(la, lf)[0, 1]), "sd_log": float(np.std(la - lf)),
            "p90_over_p50": float(m[0.9] / m[0.5]), "p75_exceed": float((act[te] > m[0.75] * sh[te]).mean()),
            "median_hl_pct": float(np.median(act[te]))}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rows = []
    for name, e in sorted(ladder_estimators().items()):
        d = daily_for(FORGE_KEY.get(name, name.lower()))
        if d is None:
            continue
        sig = V.as_of_yesterday(V.ESTIMATORS[e](d)) / V.SQRT252
        px = float(d["close"].iloc[-500:].median())
        for hz, span, hl in (("daily", 1, None), ("weekly", 5, 5)):
            w = windows(d, sig, span, span)
            if w is None or len(w) < 100:
                continue
            s = stats(w, span, hl)
            c = SPREAD.get(name)
            s["cost_share_of_median_range"] = float(2 * c / (s["median_hl_pct"] / 100 * px)) if c else None
            rows.append({"inst": name, "hz": hz, **s})
    T = pd.DataFrame(rows)
    T.to_csv(OUT / "per_instrument.csv", index=False)
    P = T.pivot(index="inst", columns="hz")
    summ = {}
    for k in ("r2", "corr", "sd_log", "p90_over_p50", "p75_exceed", "cost_share_of_median_range"):
        a, b = P[k]["daily"], P[k]["weekly"]
        ok = a.notna() & b.notna()
        summ[k] = {"daily_median": round(float(a[ok].median()), 4), "weekly_median": round(float(b[ok].median()), 4),
                   "weekly_better_share": round(float(((b < a) if k in ("sd_log", "p90_over_p50", "cost_share_of_median_range") else (b > a))[ok].mean()), 3) if k != "p75_exceed" else None,
                   "n": int(ok.sum())}
    (OUT / "summary.json").write_text(json.dumps(summ, indent=1))
    print(json.dumps(summ, indent=1))


if __name__ == "__main__":
    main()
