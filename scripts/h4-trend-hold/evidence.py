"""Evidence pack for h4-trend-hold (EXPLORATORY study; register row evidence-pack-retrofit, diagnostics only, the
reading in RESULTS.md does not change).

DIFFERENT DATA FROM THE STUDY. The study ran on the dashboard's OANDA H1 candles (2026-02-26 -> 2026-11-12), which are
not in this checkout. This pack uses local M1 mid (VolRangeForecaster/data/m1 for FX and gold,
portfolioBacktest/cache for NAS100/SPX500/US30) resampled to H1 bars stamped at their UTC start, 2016-01-04 ->
2026-08-21 (M1 cut at 2026-08-21 20:00 UTC = 21:00 London; nothing later is read). The rule is the study's own code:
scripts/h4-trend-hold/backtest.py (S.slope, S.sigma, simulate) imported unchanged.

    DAY   per weekday: side = the 07:00 4h EMA20 slope; R = the study's simulate() trade R (1 daily-sigma stop, 0.03R
          cost). To give the placebo and positive control something real to move, the same simulate() is also run with
          the slope forced long and forced short, so every entry has R_long and R_short on the identical path; the
          headline mean(R of the chosen side) equals the study's DAY mean exactly.
    HOLD  the study's HOLD trades. The counterfactual side is approximated as -(R + cost) - cost (exact when the trade
          exits at a review, not when it is stopped), stated in the pack notes.

Bar: the study had no pass bar (exploratory). +0.05 R per trade is used, the bar of exit-on-fixed-entries for the
same kind of 07:00 entry.

    python -X utf8 -I scripts/h4-trend-hold/evidence.py
"""
from __future__ import annotations

import datetime as dt
import importlib.util
import os
import shutil
import sys
from pathlib import Path

os.environ.setdefault("OMP_NUM_THREADS", "2")
os.environ.setdefault("MKL_NUM_THREADS", "2")
for k in [k for k in os.environ if k.startswith("R2_")]:
    del os.environ[k]

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "evidence_pack"))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from pack import build_pack  # noqa: E402

spec = importlib.util.spec_from_file_location("h4_bt", HERE / "backtest.py")
BT = importlib.util.module_from_spec(spec)
sys.modules["h4_bt"] = BT
spec.loader.exec_module(BT)

OUT = ROOT / "analysis" / "output" / "h4-trend-hold"
EV = OUT / "evidence"
BAR = 0.05
CUT = pd.Timestamp("2026-08-21 20:00", tz="UTC")
START = pd.Timestamp("2015-11-01", tz="UTC")
FILES = {"GOLD": "VolRangeForecaster/data/m1/gold_m1.parquet", "NAS100": "portfolioBacktest/cache/nq_m1.parquet",
         "SPX500": "portfolioBacktest/cache/spx500_m1.parquet", "US30": "portfolioBacktest/cache/us30_m1.parquet"}
for a in ("EURUSD", "GBPUSD", "USDJPY", "USDCAD", "AUDUSD", "NZDUSD", "USDCHF", "EURJPY", "GBPJPY"):
    FILES[a] = f"VolRangeForecaster/data/m1/{a.lower()}_m1.parquet"
DAYS = [d.date() for d in pd.bdate_range("2016-01-04", "2026-08-21")]


def h1_candles(path: Path) -> list:
    m = pd.read_parquet(path, columns=["open", "high", "low", "close"],
                        filters=[("datetime", ">=", START), ("datetime", "<", CUT)])
    if "datetime" in m.columns:
        m = m.set_index("datetime")
    m.index = pd.to_datetime(m.index, utc=True)
    m = m[(m.index >= START) & (m.index < CUT)].sort_index()
    assert m.index.max() < CUT and m.index.min().year >= 2015, f"{path}: lockbox/timestamp check failed"
    h = m.resample("1h", label="left", closed="left").agg({"open": "first", "high": "max", "low": "min", "close": "last"})
    h = h.dropna()
    t = (h.index.asi8 // 10**9).astype(np.int64)
    return [{"t": int(a), "o": float(o), "h": float(hh), "l": float(ll), "c": float(c)}
            for a, o, hh, ll, c in zip(t, h["open"], h["high"], h["low"], h["close"])]


def forced(s, side):
    s2 = BT.S.__new__(BT.S)
    s2.__dict__.update(s.__dict__)
    s2.slope = lambda T: side
    return s2


def build_rows():
    cache = EV / "trades.parquet"
    if cache.exists():
        return pd.read_parquet(cache)
    rec = []
    for a, f in FILES.items():
        print(f"{a} ...", flush=True)
        s = BT.S(h1_candles(ROOT / f))
        day = {t["entry_day"]: t for t in BT.simulate(s, DAYS, "DAY")}
        lon = {t["entry_day"]: t for t in BT.simulate(forced(s, 1), DAYS, "DAY")}
        sho = {t["entry_day"]: t for t in BT.simulate(forced(s, -1), DAYS, "DAY")}
        for d, t in day.items():
            if d in lon and d in sho:
                rec.append({"variant": "DAY", "date": d, "inst": a, "side": t["side"], "r": t["r"],
                            "RL": lon[d]["r"], "RS": sho[d]["r"], "exit": t["exit"], "nights": 0})
        for t in BT.simulate(s, DAYS, "HOLD"):
            rec.append({"variant": "HOLD", "date": t["entry_day"], "inst": a, "side": t["side"], "r": t["r"],
                        "RL": np.nan, "RS": np.nan, "exit": t["exit"], "nights": t["nights"]})
        del s
    df = pd.DataFrame(rec)
    df["date"] = pd.to_datetime(df["date"])
    assert df["date"].max() <= pd.Timestamp("2026-08-21"), "lockbox breach"
    EV.mkdir(parents=True, exist_ok=True)
    df.to_parquet(cache, index=False)
    return df


def est(r):
    v = np.where(r["side"].to_numpy() > 0, r["RL"].to_numpy(), r["RS"].to_numpy())
    return float(np.mean(v)) if len(v) else float("nan")


def plant(r, eff, rng):
    pos = r["side"].to_numpy() > 0
    return r.assign(RL=r["RL"] + np.where(pos, eff, 0.0), RS=r["RS"] + np.where(~pos, eff, 0.0))


def leak(r, rng):
    s = np.where(r["RL"] >= r["RS"], 1, -1)
    return r.assign(side=s, signal=s)


def main():
    df = build_rows()
    summary = []
    for v in ("DAY", "HOLD"):
        sub = df[df["variant"] == v].copy()
        if v == "HOLD":                                   # approximate counterfactual side (see docstring)
            other = -(sub["r"] + BT.COST) - BT.COST
            sub["RL"] = np.where(sub["side"] > 0, sub["r"], other)
            sub["RS"] = np.where(sub["side"] < 0, sub["r"], other)
        chk = np.where(sub["side"] > 0, sub["RL"], sub["RS"])
        mism = float(np.abs(chk - sub["r"]).max())
        rows = pd.DataFrame({"date": sub["date"], "inst": sub["inst"], "signal": sub["side"].astype(int),
                             "side": sub["side"].astype(int), "RL": sub["RL"], "RS": sub["RS"],
                             "outcome": (sub["RL"] - sub["RS"]) / 2})
        tmp = EV / f"_build_{v}"
        pk = build_pack(rows.reset_index(drop=True), slug=f"h4-trend-hold:{v}", out=str(tmp), estimate_fn=est, bar=BAR,
                        unit="R per trade (net of 0.03 R)", plant_fn=plant, leak_fn=leak,
                        verdict_word="EXPLORATORY (no verdict word)", signal_is_state=True, n_plants=30,
                        notes=("DATA DIFFERS FROM THE STUDY: local M1 mid resampled to H1, 2016-01-04 -> 2026-08-21, "
                               "13 instruments; the study used dashboard OANDA H1 2026-02-26 -> 2026-11-12. The rule is "
                               "the study's own simulate(). Bar +0.05 R borrowed from exit-on-fixed-entries (the study "
                               f"had none). Max |chosen-side R - simulate() R| = {mism:.2e}. "
                               + ("DAY: R_long/R_short from simulate() with the slope forced, same path."
                                  if v == "DAY" else
                                  "HOLD: opposite-side R approximated as -(R+cost)-cost (wrong for stopped trades), "
                                  "so the HOLD placebo is approximate.")
                               + " Buckets: (R_long - R_short)/2 by slope state; a working trend read would put the "
                                 "long-slope bucket above zero and the short-slope bucket below."))
        dest = EV / v
        if dest.exists():
            shutil.rmtree(dest)
        shutil.move(str(tmp / "evidence"), str(dest))
        shutil.rmtree(tmp, ignore_errors=True)
        pc = {x["multiple_of_bar"]: x["detected_share"] for x in pk["positive_control"]}
        line = (f"{v}: n {len(rows)} est {pk['estimate']:+.4f} CI [{pk['ci'][0]:+.4f}, {pk['ci'][1]:+.4f}] placebo pct "
                f"{pk['placebo']['real_percentile']:.0f} plant1x {pc[1.0]:.2f} halves "
                f"{[round(x['estimate'], 4) for x in pk['by_half']]} canary "
                f"{pk['lookahead_canary']['estimate_with_leak']:+.3f} -> {pk['diagnosis']['label']}")
        print(line, flush=True)
        summary.append(line)
    (EV / "summary.txt").write_text("\n".join(summary) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
