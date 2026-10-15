#!/usr/bin/env python3
"""Second test frozen in RIPPLE_BOOK_PREREG.md: are ripple-weighted walls (W_ripple = largest |gamma| strike above / below spot, S4, +-2.5%)
reacted to more than neighbouring listed strikes?  Same detector as 05 / 17 (touch buffer, rearm, approach side, T-1 lag), grid placebo = +-1, +-2 steps (100 pts).

ONE addition beyond the prereg text, recorded here before the result is read: the archive's strikes are FUTURES strikes and prices are OANDA CFD, so each level is
shifted by that day's futures-minus-CFD basis, estimated from put-call parity on the nearest liquid expiry (F = K + C - P at strikes within 1% of spot, settlement
prices). Without it a level can sit ~50-190 pts from where its strike really trades, which dilutes wall AND placebo alike (and the OI wall test never did this).
Wall and placebo are shifted identically, so the contrast is unaffected; only the power is.

    .venv/Scripts/python.exe oi_research_book/scripts/24_ripple_walls_placebo.py
"""
import sys, json, importlib.util
from pathlib import Path
import numpy as np
import pandas as pd

HERE = Path(__file__).parent
ROOT = HERE.parent
DATA = ROOT / "data"; RES = DATA / "results"; RES.mkdir(parents=True, exist_ok=True)
M1 = "VolRangeForecaster/data/m1/nas100_usd_m1.parquet"
RAW = "OI Data/NAS100_USD.csv"
STEP = 100.0
GRID_K = [-2, -1, 1, 2]; HORIZONS = [15, 60, 240]
CUTOFF = pd.Timestamp("2026-08-21")


def basis_series():
    raw = pd.read_csv(RAW, usecols=["date", "expiry", "strike", "right", "settlement"], parse_dates=["date", "expiry"])
    raw["date"] = pd.to_datetime(raw["date"]).dt.tz_localize(None)
    raw["expiry"] = pd.to_datetime(raw["expiry"]).dt.tz_convert("UTC").dt.tz_localize(None).dt.normalize()
    raw = raw[(raw["date"] <= CUTOFF) & raw["settlement"].notna() & (raw["settlement"] > 0)]
    dm = pd.read_parquet(DATA / "daily_master_near_nas100_usd.parquet")[["date", "close"]]
    dm["date"] = pd.to_datetime(dm["date"]).dt.tz_localize(None)
    raw = raw.merge(dm, on="date"); raw["dte"] = (raw["expiry"] - raw["date"]).dt.days
    raw = raw[(raw["dte"] >= 3) & ((raw["strike"] / raw["close"] - 1).abs() <= 0.01)]
    p = raw.pivot_table(index=["date", "expiry", "strike", "close"], columns="right", values="settlement", aggfunc="first").dropna().reset_index()
    p["F"] = p["strike"] + p["C"] - p["P"]
    p = p.merge(raw[["date", "expiry", "dte"]].drop_duplicates(), on=["date", "expiry"])
    front = p.sort_values(["date", "dte"]).groupby("date").head(8)           # nearest-expiry strikes
    b = front.assign(b=front["F"] - front["close"]).groupby("date")["b"].median()
    print(f"basis estimated on {len(b)} dates: median {b.median():+.1f}, IQR [{b.quantile(.25):+.1f}, {b.quantile(.75):+.1f}] pts")
    return b


def main():
    sys.argv = ["05", M1, "NAS100_USD"]
    spec = importlib.util.spec_from_file_location("v05", str(HERE / "05_intraday_validation.py"))
    v05 = importlib.util.module_from_spec(spec); spec.loader.exec_module(v05)
    m1 = v05.load_m1(M1); m1 = m1[m1["date"] <= CUTOFF]
    w = pd.read_parquet(DATA / "ripple_walls_nq.parquet"); w["date"] = pd.to_datetime(w["date"])
    b = basis_series()
    w = w.set_index("date")
    w["basis"] = b.reindex(w.index).ffill(limit=3)
    n0 = len(w); w = w[w["basis"].notna()]
    print(f"days with a usable basis: {len(w)} of {n0} (dropped {n0 - len(w)}, counted not hidden)")
    lv = pd.DataFrame({"date": w.index, "call": (w["W_rip_call"] - w["basis"]).values, "put": (w["W_rip_put"] - w["basis"]).values})
    for c in ("call", "put"): lv[c] = lv[c].shift(1)                         # T-1 lag: what was knowable before day D
    out = []
    for side, col, other in (("call", "call", "put"), ("put", "put", "call")):
        ev = v05.detect_touch_events(m1, lv, col, side); ev["kind"], ev["k"] = "wall", 0.0; out.append(ev)
        for k in GRID_K:
            name = f"pl_{side}_{k}"; lv[name] = lv[col] + k * STEP
            lv.loc[(lv[name] - lv[other]).abs() < 0.5 * STEP, name] = np.nan
            ev = v05.detect_touch_events(m1, lv, name, side)
            if len(ev): ev["kind"] = "grid"; ev["k"] = k; out.append(ev)
        print(f"{side} done", flush=True)
    ev = pd.concat(out, ignore_index=True)
    ev.to_csv(RES / "ripple_walls_events.csv", index=False)
    print(ev.groupby(["side", "kind"]).size())
    # report
    rng = np.random.default_rng(11); iso = ev["date"].dt.isocalendar()
    ev["cluster"] = iso["year"].astype(str) + "_" + iso["week"].astype(str)
    rows = []
    for side in ("call", "put"):
        for h in HORIZONS:
            s = ev[(ev["side"] == side) & ev[f"outcome_{h}m"].notna()].copy(); s["brk"] = (s[f"outcome_{h}m"] == "break").astype(float)
            rate = s.groupby("kind")["brk"].mean()
            agg = s[s["kind"].isin(["wall", "grid"])].groupby(["cluster", "kind"])["brk"].agg(["sum", "count"]).unstack("kind", fill_value=0)
            cl = agg.index.values; diffs = []
            for _ in range(2000):
                pick = agg.loc[rng.choice(cl, len(cl))]
                wv = pick[("sum", "wall")].sum() / max(pick[("count", "wall")].sum(), 1); gv = pick[("sum", "grid")].sum() / max(pick[("count", "grid")].sum(), 1)
                diffs.append(wv - gv)
            lo, hi = np.percentile(diffs, [2.5, 97.5])
            rows.append({"side": side, "h": h, "wall_pct": 100 * rate.get("wall", np.nan), "grid_pct": 100 * rate.get("grid", np.nan),
                         "diff_pp": 100 * (rate.get("wall", np.nan) - rate.get("grid", np.nan)), "lo": 100 * lo, "hi": 100 * hi,
                         "n_wall": int((s["kind"] == "wall").sum()), "n_grid": int((s["kind"] == "grid").sum())})
    t = pd.DataFrame(rows); print(t.round(2).to_string(index=False))
    p15 = t[t["h"] == 15]
    passed = bool(((p15["hi"] < 0) & (p15["diff_pp"] <= -3)).all())
    print("PASS (wall-specific effect)" if passed else "FAIL (null: wall reacts like any listed strike)")
    json.dump({"rows": rows, "PASS": passed}, open(RES / "ripple_walls_results.json", "w"), indent=2, default=float)


if __name__ == "__main__":
    main()
