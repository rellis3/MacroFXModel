"""run_study — orchestrates sessions -> handoff -> intraday -> spike_fade ->
dayflow -> forecast -> impulse for one pair, pools every p-value produced
into ONE Benjamini-Hochberg correction, and writes JSON + a text summary.

Usage (from repo root):
    python3 -m SessionResearch.run_study --pair gold
    python3 -m SessionResearch.run_study --pair eurusd --n-perm 2000

The engine is pair-agnostic by construction (everything routes through
`forge.bars.load_m1`), so pointing `--pair` at any of the 26 parquets in
VolRangeForecaster/data/m1/ reruns the identical study on that pair.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from forge.bars import load_m1
from SessionResearch.dayflow import build_day_checkpoints, dayflow_cells
from SessionResearch.forecast import run_forecast_study
from SessionResearch.handoff import run_handoff_study
from SessionResearch.impulse import build_impulse_events, run_impulse_study
from SessionResearch.intraday import build_hourly_frame, day_of_week_summary, hour_of_day_cells
from SessionResearch.sessions import build_session_table
from SessionResearch.spike_fade import run_spike_fade_study
from SessionResearch.stats_util import bh_fdr


def _primary_p(row: pd.Series) -> float:
    """The null-controlled p-value where we have one (circular-shift beats a
    plain parametric p by construction — see stats_util); the parametric
    p-value otherwise. NaN (purely descriptive rows, e.g. retrace_fraction's
    magnitude) is excluded from the FDR pool entirely."""
    p_perm = row.get("p_perm")
    if p_perm is not None and np.isfinite(p_perm):
        return float(p_perm)
    p = row.get("p")
    return float(p) if p is not None and np.isfinite(p) else float("nan")


def _forecast_to_cells(forecast_res: pd.DataFrame) -> pd.DataFrame:
    """Reduces each forecast row (one per checkpoint x target, carrying both
    baselines' errors and the null check) to the two hypotheses that belong in
    the pooled FDR: does the model beat climatology, does it beat persistence.
    `p_vs_null` is reported in the full forecast.json for every row but is
    deliberately NOT pooled here — it's a sanity check on the model itself
    (comparable-to-null score = don't trust this row), not a "reject H0"
    test in the same family as the others."""
    rows = []
    for _, r in forecast_res.iterrows():
        regression = r["target"] == "remaining_range_atr"
        value = r["mae_model"] if regression else r["acc_model"]
        for metric, p, baseline in (
            ("beats_climatology", r.get("p_vs_climatology"), r.get("mae_climatology" if regression else "acc_climatology")),
            ("beats_persistence", r.get("p_vs_persistence"), r.get("mae_persistence" if regression else "acc_persistence")),
        ):
            # MAE: lower is better. Accuracy: higher is better. A significant cell here can
            # mean the model significantly BEATS the baseline OR significantly LOSES to it —
            # the direction has to travel with the p-value or a "significant" row reads as a
            # win by default, which is exactly backwards for e.g. post_overlap direction below.
            better = (value < baseline) if regression else (value > baseline)
            rows.append(dict(checkpoint=r["checkpoint"], target=r["target"], n=r["n"],
                             metric=metric, value=value, baseline=baseline, better_than_baseline=bool(better),
                             p=p, p_perm=None, p_vs_null=r.get("p_vs_null")))
    return pd.DataFrame(rows)


def run_study(pair: str, root: str = "VolRangeForecaster/data/m1", out_dir: str = "SessionResearch/out",
             day_start_hour: int = 0, n_perm: int = 1000, q: float = 0.10, seed: int = 0) -> dict:
    m1 = load_m1(pair, root=root)

    tab = build_session_table(m1, day_start_hour=day_start_hour)
    handoff_cells = run_handoff_study(tab, n_perm=n_perm, seed=seed)
    handoff_cells["source"] = "handoff"

    h1 = build_hourly_frame(m1, day_start_hour=day_start_hour)
    intraday_cells = hour_of_day_cells(h1)
    intraday_cells["source"] = "intraday"
    dow = day_of_week_summary(h1)

    spike_cells = run_spike_fade_study(m1, day_start_hour=day_start_hour, n_perm=n_perm, seed=seed + 1)
    spike_cells["source"] = "spike_fade"

    cp = build_day_checkpoints(tab, m1, day_start_hour=day_start_hour)
    dayflow_c = dayflow_cells(cp, n_perm=n_perm, seed=seed + 2)
    dayflow_c["source"] = "dayflow"

    forecast_res = run_forecast_study(cp, n_null=max(20, n_perm // 50), seed=seed + 3)
    forecast_cells = _forecast_to_cells(forecast_res)
    forecast_cells["source"] = "forecast"

    impulse_ev = build_impulse_events(m1, day_start_hour=day_start_hour)
    # Circular-shift nulls here run over ~120k M5 pivots (not ~2.6k session-days), so this
    # module's n_perm is capped separately — 500 already takes ~50s/horizon-kind at this n.
    impulse_cells = run_impulse_study(impulse_ev, n_perm=min(n_perm, 500), seed=seed + 5)
    impulse_cells["source"] = "impulse"

    all_cells = pd.concat([handoff_cells, intraday_cells, spike_cells, dayflow_c, forecast_cells,
                          impulse_cells], ignore_index=True, sort=False)
    all_cells["primary_p"] = all_cells.apply(_primary_p, axis=1)
    all_cells["bh_pass"] = bh_fdr(all_cells["primary_p"], q=q)
    all_cells["n_hypotheses_pooled"] = int(all_cells["primary_p"].notna().sum())

    out = Path(out_dir) / pair
    out.mkdir(parents=True, exist_ok=True)

    def _dump(df: pd.DataFrame, name: str):
        df.to_json(out / f"{name}.json", orient="records", date_format="iso")

    _dump(tab, "session_table")
    _dump(cp, "day_checkpoints")
    _dump(impulse_ev, "impulse_events")
    _dump(forecast_res, "forecast")
    _dump(all_cells[all_cells["source"] == "handoff"].drop(columns="source"), "handoff")
    _dump(all_cells[all_cells["source"] == "intraday"].drop(columns="source"), "intraday")
    _dump(all_cells[all_cells["source"] == "spike_fade"].drop(columns="source"), "spike_fade")
    _dump(all_cells[all_cells["source"] == "dayflow"].drop(columns="source"), "dayflow")
    _dump(all_cells[all_cells["source"] == "forecast"].drop(columns="source"), "forecast_cells")
    _dump(all_cells[all_cells["source"] == "impulse"].drop(columns="source"), "impulse")
    _dump(dow, "day_of_week")
    _dump(all_cells, "all_cells")

    meta = dict(
        pair=pair, generated_at=datetime.now(timezone.utc).isoformat(),
        data_start=str(m1.index.min()), data_end=str(m1.index.max()), m1_rows=len(m1),
        n_trading_day_sessions=len(tab), day_start_hour=day_start_hour, n_perm=n_perm, bh_q=q,
        n_hypotheses_pooled=int(all_cells["primary_p"].notna().sum()),
        n_bh_pass=int(all_cells["bh_pass"].sum()),
    )
    (out / "meta.json").write_text(json.dumps(meta, indent=2))

    print(f"\n=== {pair} session research: {meta['data_start'][:10]} -> {meta['data_end'][:10]} "
          f"({meta['m1_rows']:,} M1 bars, {meta['n_trading_day_sessions']:,} session-days) ===")
    print(f"{meta['n_hypotheses_pooled']} hypotheses pooled for FDR @ q={q}: "
          f"{meta['n_bh_pass']} survive.\n")

    survivors = all_cells[all_cells["bh_pass"]].sort_values("primary_p")
    if len(survivors):
        print("Survivors (sorted by p):")
        cols = [c for c in ["source", "pair", "boundary", "hour", "metric", "n", "value",
                            "primary_p"] if c in survivors.columns]
        print(survivors[cols].to_string(index=False))
    else:
        print("No cell survived FDR correction.")

    return {"meta": meta, "all_cells": all_cells, "session_table": tab, "day_of_week": dow}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--pair", default="gold")
    ap.add_argument("--root", default="VolRangeForecaster/data/m1")
    ap.add_argument("--out", default="SessionResearch/out")
    ap.add_argument("--day-start-hour", type=int, default=0)
    ap.add_argument("--n-perm", type=int, default=1000)
    ap.add_argument("--q", type=float, default=0.10)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()
    run_study(args.pair, args.root, args.out, args.day_start_hour, args.n_perm, args.q, args.seed)


if __name__ == "__main__":
    main()
