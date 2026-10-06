"""STEP 2 variant 3 (forge/JUMPS_PREREG.md Amendment 1): seasonality-adjusted Lee-Mykland jump days.

Rebuilds each table session's 5-minute closes from M1 on the same grid as scripts/forecast_history/build.mjs
(last close before each 5-min edge from London midnight, to 22:00, forward-filled, first return from the open),
scales each return by the day's bipower sigma and by a causal time-of-day factor (robust median over the previous
250 sessions), and flags a jump day when the largest |z| exceeds the Lee-Mykland 1% critical value for n = 264.

    python scripts/forecast_history/jump_flags_seasonal.py
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import pandas as pd

from forge.bars import load_m1
from forge.vol import discover_full_universe

H = Path("analysis/output/forecast_history")
OUT = Path("analysis/output/jumps/flags_seasonal.csv")
N = 264
_c = math.sqrt(2 * math.log(N))
CRIT = (_c - (math.log(math.pi) + math.log(math.log(N))) / (2 * _c)) + (1 / _c) * (-math.log(-math.log(0.99)))
FILE_KEY = {"DOW": "us30", "SPX500": "spx500"}


def flags_for(sym: str, root: str) -> pd.DataFrame:
    tab = pd.read_csv(H / f"{sym}.csv", usecols=["date", "open"])
    m1 = load_m1(FILE_KEY.get(sym, sym.lower()), root)
    loc = m1.tz_convert("Europe/London")
    minute = loc.index.hour * 60 + loc.index.minute
    keep = minute < 22 * 60
    df = pd.DataFrame({"date": loc.index.strftime("%Y-%m-%d")[keep], "slot": (minute[keep] // 5),
                       "close": loc["close"].to_numpy()[keep]})
    c5 = df.groupby(["date", "slot"]).close.last().unstack("slot").reindex(columns=range(N))
    c5 = c5.reindex(tab.date)
    opens = tab.set_index("date").open
    c5 = c5.ffill(axis=1)
    c5 = c5.apply(lambda row: row.fillna(opens[row.name]), axis=1)
    prev = pd.concat([opens.rename(-1), c5.iloc[:, :-1]], axis=1).to_numpy()
    r = np.log(c5.to_numpy() / prev)
    a = np.abs(r)
    bv = (math.pi / 2) * np.nansum(a[:, 1:] * a[:, :-1], axis=1)
    u = r / np.sqrt(bv / N)[:, None]
    # time-of-day factor: robust scale of u per slot over the PREVIOUS 250 sessions only
    f = pd.DataFrame(np.abs(u)).rolling(250, min_periods=120).median().shift(1).to_numpy() / 0.6745
    f[f <= 0] = np.nan
    norm = np.sqrt(np.nanmean(f ** 2, axis=1))
    f = f / norm[:, None]
    z = np.where(np.isfinite(f), u / f, 0.0)
    z = np.nan_to_num(z)
    k = np.abs(z).argmax(axis=1)
    zmax = np.abs(z)[np.arange(len(z)), k]
    ok = np.isfinite(norm)
    # variant 4: Barndorff-Nielsen-Shephard ratio test (day level, 1% one-sided)
    rv = np.nansum(r ** 2, axis=1)
    mu43 = 2 ** (2 / 3) * math.gamma(7 / 6) / math.gamma(0.5)
    a43 = a ** (4 / 3)
    tq = N * mu43 ** -3 * np.nansum(a43[:, 2:] * a43[:, 1:-1] * a43[:, :-2], axis=1)
    zb = ((rv - bv) / rv) / np.sqrt((math.pi ** 2 / 4 + math.pi - 5) / N * np.maximum(1, tq / bv ** 2))
    return pd.DataFrame({"inst": sym, "date": tab.date, "zmax": np.round(zmax, 3),
                         "jump_lm": np.where(ok, (zmax > CRIT).astype(float), np.nan),
                         "min_jump_lm": (k + 1) * 5, "r_jump_lm": np.round(r[np.arange(len(r)), k] * 100, 5),
                         "z_bns": np.round(zb, 3), "jump_bns": (zb > 2.326).astype(float)})


def main():
    roots = discover_full_universe()
    alias = {"us30": "DOW"}
    parts = []
    for f in sorted(H.glob("*.csv")):
        sym = f.stem
        key = FILE_KEY.get(sym, sym.lower())
        root = roots.get(key)
        if root is None:
            print(sym, "no M1 root"); continue
        d = flags_for(sym, root)
        parts.append(d)
        print(f"{sym}: LM {d.jump_lm.mean() * 252:.0f}/yr, BNS {d.jump_bns.mean() * 252:.0f}/yr", flush=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    pd.concat(parts).to_csv(OUT, index=False)
    print(f"critical value {CRIT:.3f}; wrote {OUT}")


if __name__ == "__main__":
    main()
