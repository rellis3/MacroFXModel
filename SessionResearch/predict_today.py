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
    python3 -m SessionResearch.predict_today --pair gold --live

`--live` is the genuinely real-time mode (see `predict_live` below): as of
right now, whichever of today's sessions have already closed, predict the
rest of today directly — no `--date` needed, and no historical "actual
outcome" to compare against, because the outcome genuinely isn't known yet.
Meant to run on a schedule wherever the M1 data is kept current (Railway,
via `AnalogML/refresh_m1.py`) — this sandbox's frozen 2026-06-05 snapshot
will just report "no_checkpoint_yet" or similarly stale-looking output if
run here, same as any other now()-based code would.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression

from forge.bars import frame, load_m1
from SessionResearch.dayflow import CHECKPOINTS, build_day_checkpoints
from SessionResearch.forecast import CP_SEEN, _clf_pipeline, _feature_cols, _reg_pipeline, run_forecast_study
from SessionResearch.sessions import CYCLE, SESSION_WINDOWS, build_session_table

CHECKPOINT_NAMES = [c[0] for c in CHECKPOINTS]
# The UTC hour at which each checkpoint's "seen" sessions are all complete —
# derived from SESSION_WINDOWS, not hardcoded, so a boundary change in
# sessions.py can't silently desync this from the actual session cycle.
CHECKPOINT_HOUR = {name: SESSION_WINDOWS[seen[-1]][1] for name, seen, _ in CHECKPOINTS}


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


def _live_checkpoint(now_hour: int) -> str | None:
    """Which checkpoint has today already reached, if any — None before
    07:00 UTC (still in the Asia session, nothing to predict from yet)."""
    reached = [name for name, hour in CHECKPOINT_HOUR.items() if now_hour >= hour]
    return max(reached, key=lambda n: CHECKPOINT_HOUR[n]) if reached else None


def build_live_row(m1: pd.DataFrame, tab: pd.DataFrame, checkpoint: str, day_start_hour: int = 0,
                   today: pd.Timestamp | None = None) -> pd.Series | None:
    """Today's feature row for `checkpoint`, built from whatever of today's
    data actually exists in `tab` right now. Unlike `dayflow.build_day_checkpoints`
    (which needs a day's all 4 sessions present, so it can never include an
    in-progress day), this only needs the sessions THIS checkpoint sees —
    today is never in the historical training set to begin with, so there's
    no leakage question in using it as a live prediction target.

    `today` defaults to the real current UTC date; pass an explicit past
    date to replay this exact code path against a known historical day
    (e.g. to cross-check it against `dayflow.build_day_checkpoints`'s
    output for the same day/checkpoint — see SessionResearch/tests or the
    ad-hoc check in the module docstring's usage notes)."""
    seen = CP_SEEN[checkpoint]
    if today is None:
        today = pd.Timestamp(pd.Timestamp.now(tz="UTC").date())  # tz-naive midnight, matches tab['day']'s dtype
    today_rows = tab[tab["day"] == today]
    seen_rows = today_rows[today_rows["session"].isin(seen)]
    if set(seen_rows["session"]) != set(seen):
        return None  # a needed session hasn't printed (or didn't clear the coverage filter) yet

    asia_open = float(seen_rows.loc[seen_rows["session"] == "asia", "open"].iloc[0])
    last_seen_close = float(seen_rows.loc[seen_rows["session"] == seen[-1], "close"].iloc[0])
    seen_high, seen_low = float(seen_rows["high"].max()), float(seen_rows["low"].min())

    # Prior-bar ATR AS OF `today` specifically — not just the dataset's last row, which
    # only coincides with `today` when `today` really is now() (i.e. not during a replay/
    # test against a historical date, and this cross-check is exactly what caught it).
    daily = frame(m1, "d1", day_start_hour=day_start_hour)
    atr_lookup = daily["atr0"]
    atr_lookup.index = pd.DatetimeIndex(atr_lookup.index).normalize().tz_localize(None)
    atr_series = atr_lookup.reindex([today])
    if atr_series.empty or pd.isna(atr_series.iloc[0]) or not (atr_series.iloc[0] > 0):
        return None
    atr = float(atr_series.iloc[0])

    row = {
        "range_so_far_atr": (seen_high - seen_low) / atr,
        "net_so_far_atr": (last_seen_close - asia_open) / atr,
        "pos_in_range_so_far": (last_seen_close - seen_low) / (seen_high - seen_low) if seen_high > seen_low else 0.5,
        "dow": int(today.dayofweek),
    }
    for s in CYCLE:
        srow = seen_rows[seen_rows["session"] == s]
        row[f"{s}_range_atr"] = float(srow["range_atr"].iloc[0]) if len(srow) else np.nan
        row[f"{s}_dir"] = float(srow["direction"].iloc[0]) if len(srow) else np.nan

    prior = tab[tab["day"] < today]
    row["prev_day_range_atr"] = np.nan
    row["prev_day_dir"] = np.nan
    if len(prior):
        last_day = prior["day"].max()
        last_rows = prior[prior["day"] == last_day]
        # dayflow.build_day_checkpoints defines prev_day_range_atr using the PRIOR day's
        # OWN atr0 scale (its total_range_atr, computed as-of that day), not today's —
        # ATR moves slowly day to day so using today's scale here is a subtle, easy-to-miss
        # bug (caught by cross-checking this function against build_day_checkpoints's
        # output for a known historical day; see the module docstring's usage notes).
        prev_atr_series = atr_lookup.reindex([last_day])
        if set(last_rows["session"]) >= set(CYCLE) and not prev_atr_series.empty and prev_atr_series.iloc[0] > 0:
            prev_atr = float(prev_atr_series.iloc[0])
            day_high, day_low = float(last_rows["high"].max()), float(last_rows["low"].min())
            day_close = float(last_rows.loc[last_rows["session"] == "ny", "close"].iloc[0])
            day_open = float(last_rows.loc[last_rows["session"] == "asia", "open"].iloc[0])
            row["prev_day_range_atr"] = (day_high - day_low) / prev_atr
            row["prev_day_dir"] = float(np.sign(day_close - day_open))

    row["_today"] = str(today.date())
    row["_generated_at"] = pd.Timestamp.now(tz="UTC").isoformat()
    return pd.Series(row)


def predict_live(pair: str, root: str = "VolRangeForecaster/data/m1", out_dir: str = "SessionResearch/out",
                 day_start_hour: int = 0) -> dict:
    """The genuinely real-time path: as of RIGHT NOW, what does the
    production model say about the rest of today? Always returns a dict AND
    always writes it to `predict_live.json` — a `status` other than "ok"
    (e.g. "no_checkpoint_yet" before 07:00 UTC) is an honest, expected state
    to report and persist, not an error to swallow. Persisting every status
    (not just "ok") is what lets a dashboard show "last checked at HH:MM,
    still in the Asia session" instead of a silently missing/stale file."""
    def _finish(result: dict) -> dict:
        out_path = Path(out_dir) / pair
        out_path.mkdir(parents=True, exist_ok=True)
        (out_path / "predict_live.json").write_text(json.dumps(result, indent=2))
        return result

    now = pd.Timestamp.now(tz="UTC")
    checkpoint = _live_checkpoint(now.hour)
    if checkpoint is None:
        return _finish({"status": "no_checkpoint_yet", "pair": pair, "now": now.isoformat(),
                        "note": "still in the Asia session — first checkpoint (post_asia) at 07:00 UTC"})

    m1 = load_m1(pair, root=root)
    tab = build_session_table(m1, day_start_hour=day_start_hour)
    live_row = build_live_row(m1, tab, checkpoint, day_start_hour)
    if live_row is None:
        return _finish({"status": "no_data_yet", "pair": pair, "now": now.isoformat(), "checkpoint": checkpoint})

    cols = _feature_cols(checkpoint)
    if live_row[cols].isna().any():
        return _finish({"status": "missing_features", "pair": pair, "now": now.isoformat(), "checkpoint": checkpoint})

    cp = build_day_checkpoints(tab, m1, day_start_hour=day_start_hour)
    train = cp[cp["checkpoint"] == checkpoint].dropna(subset=cols + ["remaining_range_atr"])
    if len(train) < 100:
        return _finish({"status": "insufficient_history", "pair": pair, "now": now.isoformat(), "checkpoint": checkpoint})

    reg_pipe = _fit_range(train, cols)
    clf_pipe = _fit_direction(train, cols)
    X = live_row[cols].to_numpy(dtype=float).reshape(1, -1)
    pred_range = float(reg_pipe.predict(X)[0])
    pred_p_up = float(clf_pipe.predict_proba(X)[0, 1]) if clf_pipe is not None else float("nan")
    persist_range = float(LinearRegression()
                          .fit(train[["range_so_far_atr"]].to_numpy(float), train["remaining_range_atr"].to_numpy(float))
                          .predict([[live_row["range_so_far_atr"]]])[0])
    persist_up = bool(live_row["net_so_far_atr"] > 0)

    reliability = _reliability_lookup(run_forecast_study(cp))
    rel = reliability.get(checkpoint, {})
    rel_range, rel_dir = rel.get("remaining_range_atr", {}), rel.get("direction", {})

    out = dict(
        status="ok", pair=pair, day=live_row["_today"], checkpoint=checkpoint, generated_at=live_row["_generated_at"],
        range_so_far_atr=float(live_row["range_so_far_atr"]), net_so_far_atr=float(live_row["net_so_far_atr"]),
        model_range_atr=pred_range, persistence_range_atr=persist_range,
        model_p_up=pred_p_up, persistence_call_up=persist_up,
        range_reliability={k: rel_range.get(k) for k in
                           ("mae_model", "mae_climatology", "mae_persistence", "p_vs_persistence", "p_vs_null")},
        direction_reliability={k: rel_dir.get(k) for k in
                               ("acc_model", "acc_climatology", "acc_persistence", "p_vs_persistence", "p_vs_null")},
    )

    print(format_report(out))
    return _finish(out)


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
    ap.add_argument("--live", action="store_true",
                    help="genuinely real-time: predict from whatever of today has happened so far, "
                         "no --date needed (mutually exclusive with --date)")
    args = ap.parse_args()
    if args.live:
        result = predict_live(args.pair, args.root, args.out, args.day_start_hour)
        if result["status"] != "ok":
            print(f"[{args.pair}] {result['status']}: {result.get('note', '')} (now={result['now']})")
    else:
        run(args.pair, args.root, args.out, args.date, args.day_start_hour)


if __name__ == "__main__":
    main()
