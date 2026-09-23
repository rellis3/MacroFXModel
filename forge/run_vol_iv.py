"""run_vol_iv — IV-driven forecast ladder vs the production realized ladder, on the
same sessions, rows and folds. Frozen spec: forge/IV_LADDER_PREREG.md.

    python -m forge.run_vol_iv

Writes forge/out_vol_iv/vol_report.json in run_vol's report shape (IV specs only,
with per-horizon widths attached as run_horizons does), so

    python -m forge.export_ladder_params --report forge/out_vol_iv/vol_report.json \
        --out js/forecastLadderParamsIV.js

produces the IV params file unchanged. The head-to-head comparison goes to
forge/out_vol_iv/compare.json.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from forge import vol as V
from forge import ff_calendar as FF

OI_PAIR = {"eurusd": "EUR_USD", "gbpusd": "GBP_USD", "audusd": "AUD_USD", "usdcad": "USD_CAD",
           "usdchf": "USD_CHF", "usdjpy": "USD_JPY", "nq": "NAS100_USD"}
IV_DIR = Path("oi_research_book/data")
OUT = Path("forge/out_vol_iv")
CALENDAR = "data/calendar/ff_calendar_2007_2025.csv"
N_FOLDS = 6
HORIZONS = ("weekly", "monthly")
TARGET = {"p50": 0.50, "p75": 0.25, "p90": 0.10}


def attach_iv(frame: pd.DataFrame, pair: str) -> pd.DataFrame:
    """sigma_iv30[t] = annualized % iv30 from the last settlement STRICTLY before t."""
    iv = pd.read_parquet(IV_DIR / f"iv_daily_{OI_PAIR[pair].lower()}.parquet")[["date", "iv30"]]
    iv["date"] = pd.to_datetime(iv["date"]).astype("datetime64[ns]")
    iv = iv.dropna().sort_values("date")
    f = frame.sort_values("date").copy()
    f["date"] = pd.to_datetime(f["date"]).astype("datetime64[ns]")
    m = pd.merge_asof(f, iv.rename(columns={"date": "settle_date"}), left_on="date",
                      right_on="settle_date", direction="backward",
                      allow_exact_matches=False, tolerance=pd.Timedelta(days=5))
    m["sigma_iv30"] = m["iv30"] * 100.0
    return m.drop(columns=["iv30"])


def _mean_calib_gap(oos: dict) -> float:
    gaps = [abs(v - TARGET[k.rsplit("_", 1)[1]]) for k, v in oos.items()
            if k.startswith("exceed_") and np.isfinite(v)]
    return float(np.mean(gaps)) if gaps else float("nan")


def run_pair(pair: str, root: str, ff_df, covered) -> tuple[dict, dict]:
    daily = V.load_daily(pair, root, years=10, session="london22")
    inst = V.NAME_FOR_PAIR.get(pair, pair.upper())
    tags = {"tags": FF.event_tags(ff_df, FF.instrument_currencies(inst)), "covered": covered}
    frame = attach_iv(V.build_forecast_frame(daily, event_tags=tags), pair)
    frame = frame[frame["sigma_iv30"].notna()].reset_index(drop=True)   # same rows for both

    iv_specs, iv_folds, cmp_rows = [], [], []
    for i, (tr0, split, te1) in enumerate(V.fold_bounds(frame["date"], N_FOLDS)):
        train = frame[(frame["date"] >= tr0) & (frame["date"] < split)]
        test = frame[(frame["date"] >= split) & (frame["date"] < te1)]
        if len(train) < 200 or len(test) < 30:
            continue
        rv = V.design_vol(train)
        iv = V.design_vol(train, estimators=("iv30",))
        iv.fold = i
        o_rv, o_iv = V.apply_vol_spec(rv, test), V.apply_vol_spec(iv, test)
        if not o_rv or not o_iv:
            continue
        iv_specs.append(iv)
        iv_folds.append(dict(fold=i, train_end=str(split), test_end=str(te1),
                             estimator="iv30", width_source=iv.width_source, oos=o_iv))
        cmp_rows.append({"fold": i, "n": o_iv["n"], "rv_estimator": rv.estimator,
                         "rv_pinball": o_rv["combined_hl_pinball"], "iv_pinball": o_iv["combined_hl_pinball"],
                         "rv_calib_gap": _mean_calib_gap(o_rv), "iv_calib_gap": _mean_calib_gap(o_iv),
                         "rv_oos": o_rv, "iv_oos": o_iv})

    # per-horizon widths on the LAST fold's IV spec, exactly as run_horizons does
    specs = [s.to_dict() for s in iv_specs]
    if specs:
        split = pd.Timestamp(iv_folds[-1]["train_end"])
        horizons = {}
        for hz in HORIZONS:
            width = V.fit_horizon_widths(daily, frame, "iv30", hz, train_end=split)
            if not width:
                continue
            oos = V.score_horizon(daily, frame, "iv30", hz, width, test_start=split)
            meta = {k: width.pop(k) for k in ("_n", "_n_effective", "_overlapping") if k in width}
            horizons[hz] = {"width_mult": width, "n_train": meta.get("_n"),
                            "n_effective": meta.get("_n_effective"),
                            "overlapping": meta.get("_overlapping"), "oos_exceed": oos}
        specs[-1]["horizons"] = horizons

    w = np.array([r["n"] for r in cmp_rows], float)
    summary = {
        "n_folds": len(cmp_rows), "n_rows": int(len(frame)),
        "span": [str(frame["date"].min())[:10], str(frame["date"].max())[:10]],
        "rv_pinball": float(np.average([r["rv_pinball"] for r in cmp_rows], weights=w)),
        "iv_pinball": float(np.average([r["iv_pinball"] for r in cmp_rows], weights=w)),
        "rv_calib_gap": float(np.average([r["rv_calib_gap"] for r in cmp_rows], weights=w)),
        "iv_calib_gap": float(np.average([r["iv_calib_gap"] for r in cmp_rows], weights=w)),
        "rv_estimators": [r["rv_estimator"] for r in cmp_rows],
    }
    summary["iv_better_pct"] = 100 * (1 - summary["iv_pinball"] / summary["rv_pinball"])
    return {"folds": iv_folds, "specs": specs}, {"summary": summary, "folds": cmp_rows}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    universe = V.discover_full_universe()
    ff_df = FF.load_repaired(CALENDAR)
    covered = (ff_df["date"].min(), ff_df["date"].max())
    report, compare = {}, {}
    for pair in OI_PAIR:
        rep, cmp = run_pair(pair, universe[pair], ff_df, covered)
        report[pair], compare[pair] = rep, cmp
        s = cmp["summary"]
        print(f"[{pair:6s}] {s['n_folds']} folds {s['span']} | HL pinball rv {s['rv_pinball']:.4f} "
              f"iv {s['iv_pinball']:.4f} ({s['iv_better_pct']:+.1f}%) | calib gap rv "
              f"{100*s['rv_calib_gap']:.1f}pp iv {100*s['iv_calib_gap']:.1f}pp | rv picked {s['rv_estimators']}",
              flush=True)

    wins = sum(c["summary"]["iv_pinball"] < c["summary"]["rv_pinball"] for c in compare.values())
    rv_gap = float(np.mean([c["summary"]["rv_calib_gap"] for c in compare.values()]))
    iv_gap = float(np.mean([c["summary"]["iv_calib_gap"] for c in compare.values()]))
    verdict = {"iv_wins": wins, "of": len(compare), "rv_calib_gap_pp": 100 * rv_gap,
               "iv_calib_gap_pp": 100 * iv_gap,
               "PASS": wins >= 5 and iv_gap <= rv_gap + 0.01}
    compare["_verdict"] = verdict
    print("VERDICT", verdict)
    for pair, rep in report.items():
        hz = (rep["specs"][-1].get("horizons") if rep["specs"] else {}) or {}
        for name, h in hz.items():
            o = h["oos_exceed"]
            print(f"  {pair:6s} {name:7s} OOS exceed HL p50/p75/p90 = "
                  f"{o.get('BM_P50')}/{o.get('BM_P75')}/{o.get('BM_P90')} (target .50/.25/.10)")
    (OUT / "vol_report.json").write_text(json.dumps(report, indent=2, default=str))
    (OUT / "compare.json").write_text(json.dumps(compare, indent=2, default=str))


if __name__ == "__main__":
    main()
