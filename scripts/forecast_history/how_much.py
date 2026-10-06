"""STEP B — stop and size rule numbers (forge/HOW_MUCH_SPEC.md; thresholds fixed there before this ran).

Per class and side: minimum stop = smallest d (0.05 sigma grid) where a single 5-minute bar moves more than d on <= 5%
of sessions; overshoot allowance = p90 of how far that bar carried past d; weekend allowance = p90 Monday |gap|.
sigma = the chosen forecast's walk-forward sigma (lines_B sigB). Writes js/howMuchParams.js + analysis/output/how_much/.

    PYTHONPATH=. python scripts/forecast_history/how_much.py
"""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from forecast_record import H, boot_weights, complete, klass  # noqa: E402

OUT = Path("analysis/output/how_much")
GRID = np.round(np.arange(0.05, 3.001, 0.05), 2)
CROSS_MAX, OVER_Q, GAP_Q = 0.05, 0.90, 0.90


def load():
    X = pd.concat([pd.read_csv(f, usecols=["inst", "date", "oos", "last_min", "gap"]) for f in sorted(H.glob("*.csv"))], ignore_index=True)
    X = X[(X.oos == 1) & complete(X)]
    B = pd.read_csv("analysis/output/forecast_fix/live_variant/lines_B.csv", usecols=["inst", "date", "sigB"])
    Fl = pd.read_csv("analysis/output/jumps/flags_seasonal.csv", usecols=["inst", "date", "max_up5", "max_dn5"])
    X = X.merge(B, on=["inst", "date"]).merge(Fl, on=["inst", "date"])
    X["klass"] = X.inst.map(klass)
    X["up"] = X.max_up5 / X.sigB          # largest single 5-min rise, sigma units
    X["dn"] = X.max_dn5 / X.sigB          # largest single 5-min fall
    X["gapz"] = X.gap.abs() / X.sigB
    X["monday"] = pd.to_datetime(X.date).dt.dayofweek == 0
    return X.dropna(subset=["up", "dn", "sigB"]).reset_index(drop=True)


def main():
    X = load()
    dates = np.sort(X.date.unique())
    di = pd.Series(np.arange(len(dates)), index=dates)[X.date].to_numpy()
    nd = len(dates)
    W = boot_weights(nd)

    def share_ci(flag, m):
        sn = np.bincount(di[m], weights=flag[m].astype(float), minlength=nd)
        sd = np.bincount(di[m], minlength=nd).astype(float)
        reps = (W @ sn) / np.maximum(W @ sd, 1e-12)
        return [round(float(sn.sum() / sd.sum()), 4), *[round(float(x), 4) for x in np.percentile(reps, [2.5, 97.5])]]

    params, report = {}, {}
    for cls in sorted(X.klass.unique()):
        m = (X.klass == cls).to_numpy()
        P = {"n_sessions": int(m.sum())}
        # a LONG's stop sits below entry: crossed by a single falling bar; a SHORT's by a rising bar
        for side, col in (("long", "dn"), ("short", "up")):
            v = X[col].to_numpy()
            share = {float(d): float((v[m] > d).mean()) for d in GRID}
            dmin = next(d for d in GRID if share[float(d)] <= CROSS_MAX)
            over = v[m & (v > dmin)] - dmin
            P[side] = {"min_stop_sigma": float(dmin), "overshoot_p90_sigma": round(float(np.quantile(over, OVER_Q)), 3),
                       "cross_share_at_min": share_ci(v > dmin, m),
                       "cross_share_curve": {str(d): round(share[float(d)], 4) for d in (0.25, 0.5, 0.75, 1.0, 1.5)}}
        g = X.gapz.to_numpy()
        mon, ok = X.monday.to_numpy(), np.isfinite(g)
        P["weekend_gap_p90_sigma"] = round(float(np.quantile(g[m & mon & ok], GAP_Q)), 3)
        P["weekday_gap_p90_sigma"] = round(float(np.quantile(g[m & ~mon & ok], GAP_Q)), 3)
        params[cls] = P
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "results.json").write_text(json.dumps(params, indent=1))
    js = ("/**\n * Stop and size rule numbers (forge/HOW_MUCH_SPEC.md). GENERATED — do not hand-edit.\n"
          " * Regenerate: PYTHONPATH=. python scripts/forecast_history/how_much.py\n"
          " * Units: the chosen forecast's daily sigma. Out-of-sample sessions 2020-08 -> 2026-08, per instrument class.\n */\n"
          "export const HOW_MUCH = " + json.dumps({"generated": str(date.today()), "rules": {"cross_max": CROSS_MAX, "overshoot_q": OVER_Q,
                                                     "gap_q": GAP_Q}, "classes": params}) + ";\n")
    Path("js/howMuchParams.js").write_text(js, encoding="utf-8")
    md = ["# STEP B — stop and size numbers (results)", "", "Spec: `forge/HOW_MUCH_SPEC.md` (thresholds fixed first). σ = the chosen "
          "forecast's daily σ, walk-forward. Out-of-sample sessions 2020-08 → 2026-08.", "",
          "| class | side | minimum stop (σ) | one bar crosses it on % of days [95%] | overshoot allowance p90 (σ) | planned loss per unit risk (σ) |",
          "|---|---|---|---|---|---|"]
    for cls, P in params.items():
        for side in ("long", "short"):
            s = P[side]
            c = s["cross_share_at_min"]
            md.append(f"| {cls} | {side} | {s['min_stop_sigma']:.2f} | {c[0] * 100:.1f} [{c[1] * 100:.1f}, {c[2] * 100:.1f}] | "
                      f"{s['overshoot_p90_sigma']:.2f} | {s['min_stop_sigma'] + s['overshoot_p90_sigma']:.2f} |")
    md += ["", "| class | Monday gap p90 (σ) | Tue–Fri gap p90 (σ) |", "|---|---|---|"]
    md += [f"| {c} | {P['weekend_gap_p90_sigma']:.2f} | {P['weekday_gap_p90_sigma']:.2f} |" for c, P in params.items()]
    md += ["", "How often one 5-minute bar crosses a stop at d σ (long side):", "", "| class | 0.25 | 0.5 | 0.75 | 1.0 | 1.5 |", "|---|---|---|---|---|---|"]
    md += [f"| {c} | " + " | ".join(f"{v * 100:.1f}%" for v in P["long"]["cross_share_curve"].values()) + " |" for c, P in params.items()]
    (OUT / "RESULTS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md))


if __name__ == "__main__":
    main()
