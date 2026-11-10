"""Synthetic RTH sessions in the module schema, for the null and planted-signal controls.

null:    1-minute changes are i.i.d. Student-t(4) on the tick grid; U-shaped intraday volume; no persistence.
planted: the same, plus a hidden intraday drift regime (+mu / -mu / 0) that persists for ~60-120 minutes and
         switches at random. Price then trends while value migrates, so a working pipeline must find S > 0.
Volume is independent of direction in both, so delta/absorption proxies carry no extra information.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .data import RTH_MINUTES, TICK

N_SUB = 6
GAUSS = False


def make_sessions(n_days=300, seed=1, planted_mu=0.0, sigma_pts=6.0, start_px=15000.0):
    rng = np.random.default_rng(seed)
    t = np.arange(RTH_MINUTES)
    ushape = 1.0 + 2.5 * np.exp(-t / 20) + 1.5 * np.exp(-(RTH_MINUTES - 1 - t) / 15)
    rows = []
    px = start_px
    dates = pd.bdate_range("2019-01-01", periods=n_days)
    for d, date in enumerate(dates):
        drift = np.zeros(RTH_MINUTES)
        if planted_mu:
            m = 0
            while m < RTH_MINUTES:
                L = int(rng.integers(60, 121))
                drift[m:m + L] = rng.choice([-1, 0, 1]) * planted_mu * sigma_pts
                m += L
        for m in range(RTH_MINUTES):
            n_sub = N_SUB
            steps = (rng.standard_normal(n_sub) if GAUSS else rng.standard_t(4, n_sub) / np.sqrt(2)) * sigma_pts / np.sqrt(n_sub) + drift[m] / n_sub
            path = px + np.cumsum(steps)
            path = np.round(path / TICK) * TICK
            o = round(px / TICK) * TICK
            hi, lo, c = max(o, path.max()), min(o, path.min()), path[-1]
            vol = float(rng.poisson(800 * ushape[m]))
            rows.append((d, date.strftime("%Y-%m-%d"), m, o, hi, lo, c, vol))
            px = c
    df = pd.DataFrame(rows, columns=["day", "date", "m", "open", "high", "low", "close", "volume"])
    df["delta"] = np.nan
    return df
