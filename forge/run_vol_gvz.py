"""run_vol_gvz — gold's IV ladder from CBOE GVZ vs the production realized ladder.
Frozen spec: forge/IV_LADDER_GOLD_PREREG.md. Same walk-forward code path as the majors
(forge/run_vol_iv.run_pair), only the sigma source differs.

    python -m forge.run_vol_gvz

GVZ history: forge/GVZ_History.csv (CBOE's DATE,GVZ file; refresh from
cdn.cboe.com/api/global/us_indices/daily_prices/GVZ_History.csv — it redirects, follow it).
Writes forge/out_vol_iv/gvz_report.json (run_vol's report shape) and gvz_compare.json.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from forge import vol as V
from forge import ff_calendar as FF
from forge.run_vol_iv import run_pair, OUT, CALENDAR, TARGET

GVZ_CSV = Path("forge/GVZ_History.csv")


def attach_gvz(frame: pd.DataFrame, _pair: str) -> pd.DataFrame:
    """sigma_gvz[t] = GVZ close of the latest CBOE date STRICTLY before session t's start."""
    g = pd.read_csv(GVZ_CSV)
    g["date"] = pd.to_datetime(g["DATE"], format="%m/%d/%Y").astype("datetime64[ns]")
    g = g[["date", "GVZ"]].dropna().sort_values("date")
    f = frame.sort_values("date").copy()
    f["date"] = pd.to_datetime(f["date"]).astype("datetime64[ns]")
    m = pd.merge_asof(f, g.rename(columns={"date": "gvz_date"}), left_on="date", right_on="gvz_date",
                      direction="backward", allow_exact_matches=False, tolerance=pd.Timedelta(days=5))
    m["sigma_gvz"] = m["GVZ"]                     # already annualized %
    return m.drop(columns=["GVZ"])


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    universe = V.discover_full_universe()
    ff_df = FF.load_repaired(CALENDAR)
    covered = (ff_df["date"].min(), ff_df["date"].max())
    rep, cmp = run_pair("gold", universe["gold"], ff_df, covered, attach=attach_gvz, est="gvz")
    s = cmp["summary"]
    folds = cmp["folds"]
    gvz_fold_wins = sum(f["iv_pinball"] < f["rv_pinball"] for f in folds)
    verdict = {"pooled_better_pct": s["iv_better_pct"], "fold_wins": gvz_fold_wins, "of": len(folds),
               "rv_calib_gap_pp": 100 * s["rv_calib_gap"], "gvz_calib_gap_pp": 100 * s["iv_calib_gap"],
               "PASS": s["iv_pinball"] < s["rv_pinball"] and gvz_fold_wins >= 4
                       and s["iv_calib_gap"] <= s["rv_calib_gap"] + 0.01}
    cmp["_verdict"] = verdict
    print(f"[gold] {s['n_folds']} folds {s['span']} n={s['n_rows']} | HL pinball realized {s['rv_pinball']:.4f} "
          f"GVZ {s['iv_pinball']:.4f} ({s['iv_better_pct']:+.1f}%) | calib gap realized "
          f"{100*s['rv_calib_gap']:.1f}pp GVZ {100*s['iv_calib_gap']:.1f}pp | realized picked {s['rv_estimators']}")
    for f in folds:
        print(f"   fold {f['fold']}: n={f['n']} realized {f['rv_pinball']:.4f} ({f['rv_estimator']}) "
              f"GVZ {f['iv_pinball']:.4f}  {'GVZ' if f['iv_pinball'] < f['rv_pinball'] else 'realized'}")
    hz = (rep["specs"][-1].get("horizons") if rep["specs"] else {}) or {}
    for name, h in hz.items():
        o = h["oos_exceed"]
        print(f"   {name:7s} OOS exceed HL p50/p75/p90 = {o.get('BM_P50')}/{o.get('BM_P75')}/{o.get('BM_P90')}")
    print("VERDICT", verdict)
    (OUT / "gvz_report.json").write_text(json.dumps({"gold": rep}, indent=2, default=str))
    (OUT / "gvz_compare.json").write_text(json.dumps(cmp, indent=2, default=str))


if __name__ == "__main__":
    main()
