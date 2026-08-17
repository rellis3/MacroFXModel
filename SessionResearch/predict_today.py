"""predict_today — the research turned into an actual number for a specific
day, instead of a walk-forward accuracy statistic.

`forecast.py` already answered the question that matters most: DOES this
approach work at all (mostly: range weakly yes, direction no, checked
against baselines and a null). That verdict is the one to trust for
reliability, and it does not change here. This module answers a different,
narrower question: having accepted that verdict, what does a model trained
on everything available actually say about one specific day?

Every prediction below is trained on days STRICTLY BEFORE the target day
only — exactly the walk-forward discipline `forecast.py` validated, not a
weaker "leave this one day out" version — and every number is printed next
to that checkpoint/target's own walk-forward accuracy from `forecast.py`,
specifically so a live number can't be read with more confidence than the
research earned. Direction in particular: the walk-forward study found NO
reliable skill anywhere, and a real loss to the naive baseline at two
checkpoints — so a direction call here is reported as "no validated edge"
even when the model's raw probability looks decisive, because a raw
probability from an already-disproven model is not information.

Usage:
    python3 -m SessionResearch.predict_today --pair gold
    python3 -m SessionResearch.predict_today --pair gold --date 2026-06-04
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression

from forge.bars import load_m1
from SessionResearch.dayflow import CHECKPOINTS, build_day_checkpoints
from SessionResearch.forecast import _clf_pipeline, _feature_cols, _reg_pipeline, run_forecast_study
from SessionResearch.sessions import build_session_table

CHECKPOINT_NAMES = [c[0] for c in CHECKPOINTS]


def _reliability_lookup(forecast_res: pd.DataFrame) -> dict:
    out: dict = {}
    for _, r in forecast_res.iterrows():
        out.setdefault(r["checkpoint"], {})[r["target"]] = r.to_dict()
    return out


def _fit_range(train: pd.DataFrame, cols: list[str]):
    X, y = train[cols].to_numpy(float), train["remaining_range_atr"].to_numpy(float)
    return _reg_pipeline().fit(X, y)


def _fit_direction(train: pd.DataFrame, cols: list[str]):
    t = train[train["remaining_net_atr"] != 0]
    X = t[cols].to_numpy(float)
    y = (t["remaining_net_atr"] > 0).astype(int).to_numpy()
    if y.sum() == 0 or y.sum() == len(y):
        return None
    return _clf_pipeline().fit(X, y)


def predict_day(cp: pd.DataFrame, checkpoint: str, day, reliability: dict) -> dict | None:
    """Everything the production-fitted models say about `day` from
    `checkpoint` onward: model prediction, the persistence baseline, the
    actual outcome (if this day is far enough in the past to know it), and
    the checkpoint/target's own already-validated walk-forward reliability."""
    all_cp = cp[cp["checkpoint"] == checkpoint]
    row = all_cp[all_cp["day"] == day]
    if row.empty:
        return None
    row = row.iloc[0]
    cols = _feature_cols(checkpoint)
    if row[cols].isna().any():
        return None  # can't predict off missing features (e.g. no prior-day row) -- don't guess

    train = all_cp[all_cp["day"] < day].dropna(subset=cols + ["remaining_range_atr"])
    if len(train) < 100:
        return None

    reg_pipe = _fit_range(train, cols)
    clf_pipe = _fit_direction(train, cols)
    X = row[cols].to_numpy(float).reshape(1, -1)
    pred_range = float(reg_pipe.predict(X)[0])
    pred_p_up = float(clf_pipe.predict_proba(X)[0, 1]) if clf_pipe is not None else float("nan")

    # Persistence baseline, computed the identical way forecast.py's is: a
    # straight-line fit of remaining range on range-so-far, trained on the
    # same strictly-prior data.
    persist_range = float(LinearRegression()
                          .fit(train[["range_so_far_atr"]].to_numpy(float), train["remaining_range_atr"].to_numpy(float))
                          .predict([[row["range_so_far_atr"]]])[0])
    persist_up = bool(row["net_so_far_atr"] > 0)

    rel = reliability.get(checkpoint, {})
    rel_range, rel_dir = rel.get("remaining_range_atr", {}), rel.get("direction", {})

    out = dict(
        day=str(pd.Timestamp(day).date()), checkpoint=checkpoint,
        range_so_far_atr=float(row["range_so_far_atr"]), net_so_far_atr=float(row["net_so_far_atr"]),
        model_range_atr=pred_range, persistence_range_atr=persist_range,
        model_p_up=pred_p_up, persistence_call_up=persist_up,
        range_reliability={k: rel_range.get(k) for k in
                           ("mae_model", "mae_climatology", "mae_persistence", "p_vs_persistence", "p_vs_null")},
        direction_reliability={k: rel_dir.get(k) for k in
                               ("acc_model", "acc_climatology", "acc_persistence", "p_vs_persistence", "p_vs_null")},
    )
    actual_range, actual_net = row.get("remaining_range_atr"), row.get("remaining_net_atr")
    if pd.notna(actual_range):
        out["actual_range_atr"] = float(actual_range)
        out["actual_up"] = bool(actual_net > 0)
    return out


def format_report(p: dict) -> str:
    lines = [f"=== {p['day']}  ({p['checkpoint']}) ===",
            f"So far: range {p['range_so_far_atr']:.2f}×ATR, net move {p['net_so_far_atr']:+.2f}×ATR", ""]

    rr = p["range_reliability"]
    lines.append("REMAINING RANGE")
    lines.append(f"  model:       {p['model_range_atr']:.2f}×ATR")
    lines.append(f"  persistence: {p['persistence_range_atr']:.2f}×ATR  (naive one-variable rule)")
    if "actual_range_atr" in p:
        lines.append(f"  actual:      {p['actual_range_atr']:.2f}×ATR")
    if rr.get("mae_model") is not None:
        beats = rr["mae_model"] < rr["mae_persistence"]
        lines.append(f"  reliability: walk-forward MAE {rr['mae_model']:.3f} vs. persistence "
                     f"{rr['mae_persistence']:.3f} ({'beats' if beats else 'does NOT beat'} the trivial rule, "
                     f"p={rr['p_vs_persistence']:.3f}); {rr['p_vs_null']:.0%} of null refits score as well or better")
    lines.append("")

    dd = p["direction_reliability"]
    lines.append("DIRECTION (close above checkpoint price?)")
    lines.append(f"  model:       {p['model_p_up']:.0%} probability up")
    lines.append(f"  persistence: {'up' if p['persistence_call_up'] else 'down'} (today's move so far continues)")
    if "actual_up" in p:
        lines.append(f"  actual:      {'up' if p['actual_up'] else 'down'}")
    if dd.get("acc_model") is not None:
        edge = dd["acc_model"] > dd["acc_persistence"] + 0.01 and dd["p_vs_persistence"] < 0.10
        verdict = "weak validated edge" if edge else "NO VALIDATED EDGE — read the probability above as noise"
        lines.append(f"  reliability: walk-forward accuracy {dd['acc_model']:.1%} vs. persistence "
                     f"{dd['acc_persistence']:.1%} (p={dd['p_vs_persistence']:.3f}) → {verdict}")
    return "\n".join(lines)


def run(pair: str, root: str = "VolRangeForecaster/data/m1", out_dir: str = "SessionResearch/out",
       date: str | None = None, day_start_hour: int = 0) -> list[dict]:
    m1 = load_m1(pair, root=root)
    tab = build_session_table(m1, day_start_hour=day_start_hour)
    cp = build_day_checkpoints(tab, m1, day_start_hour=day_start_hour)
    forecast_res = run_forecast_study(cp)
    reliability = _reliability_lookup(forecast_res)

    target_day = pd.Timestamp(date) if date else cp["day"].max()
    preds = []
    for name in CHECKPOINT_NAMES:
        p = predict_day(cp, name, target_day, reliability)
        if p:
            preds.append(p)

    if not preds:
        print(f"No predictable checkpoint found for {target_day.date()} "
              f"(missing features, or too little prior history).")
        return []

    for p in preds:
        print(format_report(p))
        print()

    out = Path(out_dir) / pair
    out.mkdir(parents=True, exist_ok=True)
    (out / "predict_today.json").write_text(json.dumps(preds, indent=2))
    return preds


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--pair", default="gold")
    ap.add_argument("--root", default="VolRangeForecaster/data/m1")
    ap.add_argument("--out", default="SessionResearch/out")
    ap.add_argument("--date", default=None, help="YYYY-MM-DD; defaults to the most recent day in the dataset")
    ap.add_argument("--day-start-hour", type=int, default=0)
    args = ap.parse_args()
    run(args.pair, args.root, args.out, args.date, args.day_start_hour)


if __name__ == "__main__":
    main()
