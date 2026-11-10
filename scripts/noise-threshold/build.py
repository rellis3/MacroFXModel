"""Noise-threshold map, Vol-Layer stops stage 2 (build and look; nothing scored).

C.OG: find the adverse move below which it carries no information about the outcome; the stop goes beyond it.
On a random walk, trades that went d against end on average exactly -d (optional stopping), so the measure is

    excess(d) = mean(final | MAE reached d) + d          (in daily sigma)

> 0: adverse moves of size d tend to come back (noise).  < 0: they keep going (information).  0: random walk.

Entries are direction-free: in each London session, 4 seeded random minutes between 01:00 and 17:00 London, each taken
long AND short at the mid close. Paths use the mid high/low of the following 1-minute bars (MAE) and the mid close at
the horizon. Horizons: 60 min, 240 min, and to 21:00 London. Sigma = the session's live_sig_used (HAR, known at the open).

DISCOVERY WINDOW ONLY: sessions 2016-10-24 .. 2022-12-30. 2023-01-01 .. 2026-08-20 stays unseen for stage 4.

    python scripts/noise-threshold/build.py          -> analysis/output/noise-threshold/{entries.parquet, map.json}
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "scripts/forecast_history")]
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import line_reaction as LR  # noqa: E402
from forecast_record import klass  # noqa: E402

OUT = ROOT / "analysis/output/noise-threshold"
HIST = ROOT / "analysis/output/forecast_history"
BA = ROOT / "data/m1_bidask"
BA_KEY = {"DE30": "dax", "SPX500": "spx", "DOW": "dow", "GOLD": "gold", "NQ": "nq", "UK100": "uk100", "US2000": "us2000"}
START, END = "2016-10-24", "2022-12-30"          # discovery only
SEED = 20261110
N_ENTRY = 4
E_LO, E_HI, CLOSE = 60, 17 * 60, 21 * 60         # entry minutes (London) and the day's end
HZ = {"h60": 60, "h240": 240, "eod": None}
D_GRID = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.75, 1.0]
BUCKET = [(60, 420, "01-07 Asia"), (420, 720, "07-12 London"), (720, 960, "12-16 Overlap"), (960, 1020, "16-17 Late")]


def instruments():
    out = []
    for f in sorted(HIST.glob("*.csv")):
        s = f.stem
        if (BA / f"{BA_KEY.get(s, s.lower())}_m1.parquet").exists():
            out.append(s)
    return out


def bucket(m):
    for lo, hi, nm in BUCKET:
        if lo <= m < hi:
            return nm
    return "other"


def build_one(sym, rng):
    sig = pd.read_csv(HIST / f"{sym}.csv", usecols=["date", "live_sig_used"]).set_index("date").live_sig_used / 100
    df = pd.read_parquet(BA / f"{BA_KEY.get(sym, sym.lower())}_m1.parquet", columns=["time", "high", "low", "close", "bid_c", "ask_c"])
    idx = pd.DatetimeIndex(pd.to_datetime(df["time"], utc=True)).tz_convert("Europe/London").tz_localize(None)
    codes, uniq = pd.factorize(idx.normalize())           # strftime on 3.6M stamps takes minutes; on the unique days, none
    df["date"] = np.asarray(uniq.strftime("%Y-%m-%d"))[codes]
    df["m"] = idx.hour * 60 + idx.minute
    df = df[(df.date >= START) & (df.date <= END) & (df.m < CLOSE)]
    assert df.date.max() < "2023-01-01"
    rows, prof = [], np.zeros(CLOSE // 5)
    for date, g in df.groupby("date", sort=True):
        s = sig.get(date)
        if s is None or not np.isfinite(s) or s <= 0 or len(g) < 600:
            continue
        g = g.sort_values("m")
        m, hi, lo, c = g.m.to_numpy(), np.log(g.high.to_numpy()), np.log(g.low.to_numpy()), np.log(g.close.to_numpy())
        sp = (g.ask_c - g.bid_c).to_numpy() / g.close.to_numpy()
        # intraday variance profile (5-minute squared returns), for the random-walk touch benchmark
        c5 = pd.Series(c, index=m // 5).groupby(level=0).last()
        r5 = c5.diff().dropna()
        prof[r5.index.to_numpy()] += (r5.to_numpy() / s) ** 2
        cand = np.flatnonzero((m >= E_LO) & (m < E_HI))
        if len(cand) < 50:
            continue
        for i in rng.choice(cand, size=min(N_ENTRY, len(cand)), replace=False):
            e = c[i]
            for hz, h in HZ.items():
                stop_m = CLOSE if h is None else m[i] + h
                j = np.searchsorted(m, stop_m, side="right") - 1      # last bar at or before the horizon
                if j <= i:
                    continue
                up = (hi[i + 1:j + 1].max() - e) / s
                dn = (e - lo[i + 1:j + 1].min()) / s
                fin = (c[j] - e) / s
                for side, mae, f in (("long", dn, fin), ("short", up, -fin)):
                    rows.append((sym, date, int(m[i]), hz, side, mae, f, sp[i] / s, int(stop_m - m[i])))
    E = pd.DataFrame(rows, columns=["inst", "date", "minute", "hz", "side", "mae", "final", "spread", "mins"])
    return E, prof


def remaining_share(prof):
    p = prof / prof.sum()
    return p


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(SEED)
    parts, profs = [], {}
    for sym in instruments():
        E, prof = build_one(sym, rng)
        parts.append(E)
        profs[sym] = (prof / prof.sum()).tolist() if prof.sum() > 0 else None
        print(sym, len(E), flush=True)
    E = pd.concat(parts, ignore_index=True)
    E["klass"] = E.inst.map(klass)
    E["bucket"] = E.minute.map(bucket)
    E.to_parquet(OUT / "entries.parquet", index=False)

    # random-walk touch benchmark: P(MAE >= d) = 2 Phi(-d / sqrt(V)), V = share of the day's variance in the window
    from scipy.stats import norm
    E["V"] = np.nan
    for sym, g in E.groupby("inst"):
        cum = np.concatenate([[0.0], np.cumsum(profs[sym])])
        a = (g.minute // 5).to_numpy()
        b = np.minimum((g.minute + g.mins) // 5, len(cum) - 1).to_numpy()
        E.loc[g.index, "V"] = cum[b] - cum[a]

    bs = LR.Boot(E.date)
    cells = []
    groups = [("class", "klass"), ("bucket", "bucket"), ("inst", "inst")]
    for kind, col in groups:
        for (key, hz), part in E.groupby([col, "hz"]):
            for d in D_GRID:
                hit = part[part.mae >= d]
                theory = float((2 * norm.cdf(-d / np.sqrt(part.V.clip(lower=1e-9)))).mean())
                row = {"kind": kind, "key": key, "hz": hz, "d": d, "n": int(len(part)), "hits": int(len(hit)),
                       "reach": round(len(hit) / len(part), 4), "reach_rw": round(theory, 4)}
                if len(hit) >= 200 and kind != "inst":
                    ci = bs.mean(hit.date, (hit.final + d).to_numpy(float))[0]
                    row.update(excess=ci[0], lo=ci[1], hi=ci[2])
                elif len(hit):
                    row.update(excess=round(float((hit.final + d).mean()), 4))
                cells.append(row)
    # per-year curve, all instruments, eod (stability look)
    E["year"] = E.date.str[:4]
    years = []
    for (y, hz), part in E.groupby(["year", "hz"]):
        for d in D_GRID:
            hit = part[part.mae >= d]
            if len(hit):
                years.append({"year": y, "hz": hz, "d": d, "excess": round(float((hit.final + d).mean()), 4), "hits": int(len(hit))})
    res = {"window": [START, END], "seed": SEED, "n_entries": int(len(E) // 2 // len(HZ)), "rows": int(len(E)),
           "instruments": sorted(E.inst.unique().tolist()), "d_grid": D_GRID, "cells": cells, "years": years,
           "spread_sigma_median": {k: round(float(v), 4) for k, v in E.groupby("klass").spread.median().items()}}
    (OUT / "map.json").write_text(json.dumps(res, default=lambda o: o.item() if hasattr(o, "item") else str(o)), encoding="utf-8")
    print("done", len(E))


if __name__ == "__main__":
    main()
