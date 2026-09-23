#!/usr/bin/env python3
"""Placebo control for the wall-touch rejection effect. Frozen spec:
oi_research_book/WALL_PLACEBO_PREREG.md.

    python oi_research_book/scripts/17_wall_placebo.py build PAIR M1_PATH
    python oi_research_book/scripts/17_wall_placebo.py report

Runs 05_intraday_validation.py's OWN touch detector and classifier on placebo
levels (neighbouring listed strikes, and off-grid half-steps) on the same days.
"""
import sys
import json
import importlib.util
from pathlib import Path
import numpy as np
import pandas as pd
from pair_config import PAIR_CONFIG, cfg, suffix

HERE = Path(__file__).parent
RES = "oi_research_book/data/results"
STEP_NATIVE = {"USD_JPY": 5e-5, "NAS100_USD": 100.0}      # every other pair: 0.005
GRID_K = [-2, -1, 1, 2]
OFF_K = [-0.5, 0.5]
HORIZONS = [15, 60, 240]


def build(pair, m1_path):
    sys.argv = ["05", m1_path, pair]                       # 05 reads PAIR / M1 path at import
    spec = importlib.util.spec_from_file_location("v05", str(HERE / "05_intraday_validation.py"))
    v05 = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(v05)

    inv = cfg(pair)["inverted"]
    step = STEP_NATIVE.get(pair, 0.005)
    m1 = v05.load_m1(m1_path)
    lv = v05.load_lagged_levels()

    def shifted(level, k):
        if inv:
            return 1.0 / (1.0 / level + k * step)
        return level + k * step

    out = []
    for side, col, other in (("call", "call_wall_a", "put_wall_a"), ("put", "put_wall_a", "call_wall_a")):
        ev = v05.detect_touch_events(m1, lv, col, side)
        ev["kind"], ev["k"] = "wall", 0.0
        out.append(ev)
        for k in GRID_K + OFF_K:
            name = f"pl_{side}_{k}"
            lv[name] = shifted(lv[col], k)
            # drop a placebo that lands on the opposite wall that day
            half_inc = 0.5 * step * (lv[col] ** 2 if inv else 1.0)   # native step in OANDA units
            lv.loc[(lv[name] - lv[other]).abs() < half_inc, name] = np.nan
            ev = v05.detect_touch_events(m1, lv, name, side)
            if len(ev):
                ev["kind"] = "grid" if k in GRID_K else "offgrid"
                ev["k"] = k
                out.append(ev)
        print(f"[{pair}] {side} done", flush=True)
    ev = pd.concat(out, ignore_index=True)
    ev["pair"] = pair
    path = f"{RES}/wall_placebo_events{suffix(pair)}.csv"
    ev.to_csv(path, index=False)
    print(f"[{pair}] {len(ev):,} events -> {path}\n{ev.groupby(['side','kind']).size()}", flush=True)


def report(n_boot=2000, seed=7):
    rng = np.random.default_rng(seed)
    ev = pd.concat([pd.read_csv(f"{RES}/wall_placebo_events{suffix(p)}.csv", parse_dates=["date"])
                    for p in PAIR_CONFIG], ignore_index=True)
    iso = ev["date"].dt.isocalendar()
    ev["cluster"] = ev["pair"] + "_" + iso["year"].astype(str) + "_" + iso["week"].astype(str)
    res = {"pooled": [], "per_pair": []}
    for side in ("call", "put"):
        for h in HORIZONS:
            oc = f"outcome_{h}m"
            s = ev[(ev["side"] == side) & ev[oc].notna()].copy()
            s["brk"] = (s[oc] == "break").astype(float)
            rates = s.groupby("kind")["brk"].mean()
            # cluster bootstrap of (wall - grid)
            agg = s[s["kind"].isin(["wall", "grid"])].groupby(["cluster", "kind"])["brk"].agg(["sum", "count"]).unstack("kind", fill_value=0)
            cl = agg.index.values
            diffs = []
            for _ in range(n_boot):
                pick = agg.loc[rng.choice(cl, len(cl))]
                w = pick[("sum", "wall")].sum() / max(pick[("count", "wall")].sum(), 1)
                g = pick[("sum", "grid")].sum() / max(pick[("count", "grid")].sum(), 1)
                diffs.append(w - g)
            lo, hi = np.percentile(diffs, [2.5, 97.5])
            row = {"side": side, "horizon_min": h,
                   "wall_break_pct": 100 * rates.get("wall", np.nan), "grid_break_pct": 100 * rates.get("grid", np.nan),
                   "offgrid_break_pct": 100 * rates.get("offgrid", np.nan),
                   "diff_pp": 100 * (rates.get("wall", np.nan) - rates.get("grid", np.nan)),
                   "ci_lo_pp": 100 * lo, "ci_hi_pp": 100 * hi,
                   "n_wall": int((s["kind"] == "wall").sum()), "n_grid": int((s["kind"] == "grid").sum()),
                   "n_clusters": int(len(cl))}
            res["pooled"].append(row)
            for p, sp in s.groupby("pair"):
                r = sp.groupby("kind")["brk"].mean()
                res["per_pair"].append({"pair": p, "side": side, "horizon_min": h,
                                        "wall": 100 * r.get("wall", np.nan), "grid": 100 * r.get("grid", np.nan),
                                        "offgrid": 100 * r.get("offgrid", np.nan),
                                        "n_wall": int((sp["kind"] == "wall").sum())})
    pooled = pd.DataFrame(res["pooled"])
    per = pd.DataFrame(res["per_pair"])
    print(pooled.round(2).to_string(index=False))
    print(per[per["horizon_min"] == 15].round(1).to_string(index=False))
    p15 = pooled[pooled["horizon_min"] == 15]
    passed = bool(((p15["ci_hi_pp"] < 0) & (p15["diff_pp"] <= -3)).all())
    res["PASS"] = passed
    print("PASS" if passed else "FAIL")
    with open(f"{RES}/wall_placebo_results.json", "w") as f:
        json.dump(res, f, indent=2, default=float)


if __name__ == "__main__":
    if sys.argv[1] == "build":
        build(sys.argv[2], sys.argv[3])
    else:
        report()
