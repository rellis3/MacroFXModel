"""ladder-v2-nq build (forge/LADDER_V2_NQ_PREREG.md): per-track session rows with every arm's σ (daily %).

    python scripts/ladder-v2-nq/build.py            -> analysis/output/ladder-v2-nq/rows_{C,F}.parquet

C = OANDA NAS100 M1 (start-stamped). F = CME NQ M1 from NT8 (end-stamped -> shifted -1 min): unadjusted for the London
session levels, ratio-adjusted for the NY-close σ bars. Sessions after 2026-08-21 are never written (lockbox).
Positive control 1: the C NY-close bars must match analysis/output/ladder_candidates/d1/NQ.json on >= 99% of dates.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from forge import vol as V  # noqa: E402
from forge.run_combined_range import asof_before, cboe  # noqa: E402

OUT = ROOT / "analysis/output/ladder-v2-nq"
LOCK = pd.Timestamp("2026-08-21")
EST = ["yz_10", "ewma_094", "ewma_090", "yz_20", "yz_30", "naive", "har_rv_log"]
ARM_OF = {"yz_10": "A0", "ewma_094": "E1", "ewma_090": "E2", "yz_20": "E3", "yz_30": "E4", "naive": "E5", "har_rv_log": "E6"}


def load_m1(track: str, kind: str = "unadj") -> pd.DataFrame:
    if track == "C":
        d = pd.read_parquet(ROOT / "portfolioBacktest/cache/nq_m1.parquet")
        d.index = pd.to_datetime(d.index, utc=True)
    else:
        d = pd.read_parquet(ROOT / f"analysis/output/nt8/continuous/NQ_1m_{kind}.parquet")
        d.index = pd.to_datetime(d.pop("timestamp"), utc=True) - pd.Timedelta(minutes=1)   # NT8 bars are end-stamped
    d = d[~d.index.duplicated()].sort_index()
    return d[d.index < pd.Timestamp("2026-08-23", tz="UTC")][["open", "high", "low", "close"]].astype(float)


def london_sessions(m: pd.DataFrame) -> pd.DataFrame:
    lt = m.index.tz_convert("Europe/London")
    x = m[(lt.hour < 22) & (lt.dayofweek < 5)].copy()
    x["date"] = x.index.tz_convert("Europe/London").tz_localize(None).normalize()
    g = x.groupby("date")
    s = pd.DataFrame({"o": g["open"].first(), "h": g["high"].max(), "l": g["low"].min(), "c": g["close"].last(),
                      "n": g.size()})
    s = s[(s["n"] >= 600) & (s.index <= LOCK)]
    o = s["o"]
    return pd.DataFrame({"hl": (s["h"] - s["l"]) / o * 100, "oc": (s["c"] - o).abs() / o * 100,
                         "oh": (s["h"] - o) / o * 100, "ol": (o - s["l"]) / o * 100, "n": s["n"]})


def ny_bars(m: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series, pd.Series]:
    """NY-close daily bars (17:00 New York rolls to the next date), n >= 60; plus 5- and 15-minute realised variance."""
    ny = m.index.tz_convert("America/New_York")
    key = (ny.tz_localize(None) + pd.Timedelta(hours=7)).normalize()
    x = m.assign(d=key)
    g = x.groupby("d")
    b = pd.DataFrame({"open": g["open"].first(), "high": g["high"].max(), "low": g["low"].min(),
                      "close": g["close"].last(), "n": g.size()})
    b = b[(b["n"] >= 60) & (b.index.dayofweek < 5)]
    rv = {}
    for k in (5, 15):
        c = x["close"].resample(f"{k}min", label="left", closed="left").last().dropna()
        dk = (c.index.tz_convert("America/New_York").tz_localize(None) + pd.Timedelta(hours=7)).normalize()
        r = np.log(c).groupby(dk).diff()
        rv[k] = (r ** 2).groupby(dk).sum()
        rv[k] = rv[k][rv[k] > 0].reindex(b.index)
    return b, rv[5], rv[15]


def har800(name: str, b: pd.DataFrame) -> pd.Series:
    d = OUT / "d1"
    d.mkdir(parents=True, exist_ok=True)
    rows = [{"d": i.strftime("%Y-%m-%d"), "o": r.open, "h": r.high, "l": r.low, "c": r.close} for i, r in b.iterrows()]
    (d / f"{name}.json").write_text(json.dumps(rows))
    subprocess.run(["node", str(ROOT / "scripts/ladder-v2-nq/har800.mjs"), str(d)], check=True, cwd=ROOT)
    h = pd.read_csv(d / f"{name}_har800.csv", parse_dates=["date"]).set_index("date")["sig"]
    return h  # annualised %


def build(track: str) -> pd.DataFrame:
    S = london_sessions(load_m1(track, "unadj"))
    b, rv5, rv15 = ny_bars(load_m1(track, "ratio"))
    if track == "C":
        ref = pd.DataFrame(json.loads((ROOT / "analysis/output/ladder_candidates/d1/NQ.json").read_text()))
        ref.index = pd.to_datetime(ref.pop("d"))
        j = b.join(ref, how="inner")
        ok = np.isclose(j["open"], j["o"]) & np.isclose(j["high"], j["h"]) & np.isclose(j["low"], j["l"]) & np.isclose(j["close"], j["c"])
        rate = float(ok.mean())
        print(f"positive control 1 (C bars vs JS nyCloseDailyBars): {ok.sum()}/{len(j)} match = {rate:.4f}", flush=True)
        if rate < 0.99:
            raise SystemExit("positive control 1 FAILED: bar builder differs from nyCloseDailyBars")
    D = pd.DatetimeIndex(S.index)
    bb = b.reset_index(drop=True)
    for e in EST:
        s = pd.Series(V.ESTIMATORS[e](bb).astype(float), index=b.index)
        S[ARM_OF[e]] = asof_before(D, s.dropna()) / V.SQRT252
    S["H8"] = asof_before(D, har800(f"NQ_{track}", b).dropna()) / V.SQRT252
    vxn = cboe("VXN")
    S["iv"] = asof_before(D, vxn)                          # annualised %
    S["V4"] = S["iv"] / V.SQRT252
    # RV HAR features at bar t (target = bar t+1); the fit itself is walk-forward in score.py
    for k, rv in ((5, rv5), (15, rv15)):
        lr = np.log(rv)
        f = pd.DataFrame({"d1": lr, "d5": np.log(rv.rolling(5, min_periods=5).mean()),
                          "d22": np.log(rv.rolling(22, min_periods=22).mean())})
        f["y_next"] = lr.shift(-1)
        f["next_date"] = pd.Series(b.index, index=b.index).shift(-1)
        f.to_parquet(OUT / f"rvfeat_{track}_{k}.parquet")
        for c in ("d1", "d5", "d22"):
            S[f"R{k}_{c}"] = asof_before(D, f[c].dropna())
    S["date"] = S.index
    S = S.reset_index(drop=True)
    print(f"{track}: {len(S)} sessions {S['date'].min().date()} -> {S['date'].max().date()}", flush=True)
    return S


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for t in sys.argv[1:] or ["C", "F"]:
        build(t).to_parquet(OUT / f"rows_{t}.parquet")


if __name__ == "__main__":
    main()
