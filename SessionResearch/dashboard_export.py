"""dashboard_export — distills each pair's full SessionResearch output (tens
of MB of cells and raw tables) into ONE small combined file the live
today.html dashboard can actually afford to fetch and feed to an LLM prompt:
`SessionResearch/out/dashboard_summary.json`, shaped like AnalogML's
`motif_state.json` (`{generated_at, pairs: [...]}`) so `server.js` can read
it with the exact same disk-read-with-R2-fallback pattern already used for
AnalogML, and today.html can key it the same way
(`Object.fromEntries(pairs.map(p => [p.pair, p]))`).

Every field here is pulled generically from `all_cells.json`'s `bh_pass`
column — nothing is hand-tuned per pair. A pair with no significant range
handoff gets `range_handoff: null`, not a fabricated number to keep the
schema looking full. Run this AFTER `run_study.py` (and optionally
`predict_today.py`, for the `today_outlook` field) for every pair you want
included.

Usage:
    python3 -m SessionResearch.dashboard_export --pairs gold eurusd ...
    python3 -m SessionResearch.dashboard_export --all     # every out/<pair>/ present
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

BOUNDARIES = ("asia", "london", "overlap", "ny")
CHECKPOINTS = ("post_asia", "post_london", "post_overlap")


def _load(base: Path, name: str):
    p = base / f"{name}.json"
    return json.loads(p.read_text()) if p.exists() else None


def _range_handoff(cells: pd.DataFrame) -> dict | None:
    rows = cells[(cells["source"] == "handoff") & (cells["metric"] == "range_spearman") & cells["bh_pass"]]
    if rows.empty:
        return None
    best = rows.loc[rows["value"].idxmax()]
    return {"n_significant": int(len(rows)), "strongest_pair": best["pair"],
           "strongest_rho": round(float(best["value"]), 3)}


def _direction_handoff(cells: pd.DataFrame) -> dict:
    rows = cells[(cells["source"] == "handoff") & (cells["metric"] == "dir_continuation_rate")]
    sig = rows[rows["bh_pass"]]
    return {"any_significant": bool(len(sig)), "n_tested": int(len(rows)),
           "max_deviation_from_coinflip": round(float((rows["value"] - 0.5).abs().max()), 3) if len(rows) else None}


def _spike_reversal(cells: pd.DataFrame) -> dict:
    rows = cells[(cells["source"] == "spike_fade") & (cells["metric"] == "spike_reversal_rate")
                & (cells["post_min"] == 30)]
    out = {}
    for _, r in rows.iterrows():
        out[r["boundary"]] = {"reversal_rate_spike": round(float(r["reversal_rate_spike"]), 3),
                              "reversal_rate_nonspike": round(float(r["reversal_rate_nonspike"]), 3),
                              "bh_pass": bool(r["bh_pass"])}
    return out


def _impulse(cells: pd.DataFrame) -> dict | None:
    rows = cells[(cells["source"] == "impulse") & (cells["metric"] == "win_rate_impulse_vs_grind")
                & (cells["horizon_min"] == 15)]
    sym = cells[(cells["source"] == "impulse") & (cells["metric"] == "low_vs_high_win_rate")
               & (cells["horizon_min"] == 30)]
    if rows.empty:
        return None
    out = {"by_kind": {}}
    for _, r in rows.iterrows():
        out["by_kind"][r["kind"]] = {"win_rate_impulse": round(float(r["win_rate_impulse"]), 3),
                                     "win_rate_grind": round(float(r["win_rate_grind"]), 3),
                                     "bh_pass": bool(r["bh_pass"])}
    if not sym.empty:
        s = sym.iloc[0]
        out["symmetry_30min"] = {"win_rate_low": round(float(s["win_rate_low"]), 3),
                                 "win_rate_high": round(float(s["win_rate_high"]), 3),
                                 "bh_pass": bool(s["bh_pass"])}
    return out


def _forecast_reliability(cells: pd.DataFrame) -> dict:
    rows = cells[cells["source"] == "forecast"]
    out = {}
    for cp in CHECKPOINTS:
        sub = rows[rows["checkpoint"] == cp]
        if sub.empty:
            continue
        out[cp] = {}
        for target in ("remaining_range_atr", "direction"):
            t = sub[(sub["target"] == target) & (sub["metric"] == "beats_persistence")]
            if t.empty:
                continue
            row = t.iloc[0]
            out[cp][target] = {"beats_persistence": bool(row["better_than_baseline"]) and bool(row["bh_pass"]),
                               "p": None if pd.isna(row["p"]) else round(float(row["p"]), 4)}
    return out


def build_pair_summary(pair: str, out_dir: str = "SessionResearch/out") -> dict | None:
    base = Path(out_dir) / pair
    all_cells_raw = _load(base, "all_cells")
    meta = _load(base, "meta")
    if all_cells_raw is None or meta is None:
        return None
    cells = pd.DataFrame(all_cells_raw)

    summary = dict(
        pair=pair, data_through=str(meta["data_end"])[:10], n_hypotheses_pooled=meta["n_hypotheses_pooled"],
        n_bh_pass=meta["n_bh_pass"],
        range_handoff=_range_handoff(cells),
        direction_handoff=_direction_handoff(cells),
        spike_reversal=_spike_reversal(cells),
        impulse=_impulse(cells),
        forecast_reliability=_forecast_reliability(cells),
    )
    # Prefer the genuinely live prediction (predict_today.py --live) over the historical
    # replay (predict_today.py's default mode) whenever a real live one is available —
    # the replay exists mainly so the engine has *something* to show/demo when live data
    # isn't current (e.g. in this sandbox), not because it should be preferred when a real
    # live number exists.
    live = _load(base, "predict_live")
    if live and live.get("status") == "ok":
        summary["today_outlook"] = [live]
        summary["today_outlook_is_live"] = True
    else:
        historical = _load(base, "predict_today")
        if historical:
            summary["today_outlook"] = historical
            summary["today_outlook_is_live"] = False
    if live and live.get("status") != "ok":
        summary["live_status"] = live.get("status")
    return summary


def run(pairs: list[str], out_dir: str = "SessionResearch/out") -> dict:
    rows = []
    skipped = []
    for pair in pairs:
        s = build_pair_summary(pair, out_dir)
        if s:
            rows.append(s)
        else:
            skipped.append(pair)
    payload = {"generated_at": datetime.now(timezone.utc).isoformat(), "pairs": rows}
    out_path = Path(out_dir) / "dashboard_summary.json"
    out_path.write_text(json.dumps(payload, indent=2))
    print(f"wrote {out_path}: {len(rows)} pairs" + (f" (skipped, no run_study output: {skipped})" if skipped else ""))
    return payload


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--pairs", nargs="*", default=None)
    ap.add_argument("--all", action="store_true", help="every out/<pair>/ subdirectory present")
    ap.add_argument("--out", default="SessionResearch/out")
    args = ap.parse_args()
    if args.all:
        pairs = sorted(p.name for p in Path(args.out).iterdir() if p.is_dir())
    elif args.pairs:
        pairs = args.pairs
    else:
        ap.error("pass --pairs <p1> <p2> ... or --all")
    run(pairs, args.out)


if __name__ == "__main__":
    main()
