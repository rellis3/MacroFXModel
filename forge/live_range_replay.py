"""Replay of the Live Range page's hourly lines over history (forge/LIVE_RANGE_HISTORY_PREREG.md).

Mirrors js/intradayRange.js (sessionState / reforecast) on 5-minute London sessions. Read-only side study.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import numpy as np
import pandas as pd
from numba import njit

from forge import vol as V
from forge.bars import load_m1

H = Path("analysis/output/forecast_history")
GRID = np.array([round(x, 2) for x in np.arange(0.05, 0.951, 0.05)])
RUNGS = (0.50, 0.75, 0.90)
JUMP_SIGMA = 0.5          # real-time "jump bar": a 5-minute close-to-close move >= 0.5 sigma
EPS = 1e-9
INDEX = {"NQ", "SPX500", "DOW", "US2000", "DE30", "UK100"}
FORGE_KEY = {"SPX500": "spx500", "DOW": "us30"}
# hours-table columns
HC = ["h", "valid", "cell", "used", "speed", "U", "Dn", "runH", "runL", "offU0", "offU1", "offU2", "offD0", "offD1",
      "offD2", "jbefore", "jlast", "rU0", "rU1", "rU2", "rD0", "rD1", "rD2"]
EC = ["h", "side", "rung", "ti", "tmin", "off", "over", "j1", "a", "b", "pre", "code", "inhour", "rtjump", "cell",
      "used", "speed"]


def m1_root(key: str) -> str:
    return V.INDEX_DATA_ROOT if key in V.INDEX_PAIRS else "VolRangeForecaster/data/m1"


def m1_key(name: str) -> str:
    return FORGE_KEY.get(name, name.lower())


def load_sessions(name: str):
    """5-minute London sessions: returns dict date(str) -> (hrs, o, h, l, c) arrays (hour < 22)."""
    m = load_m1(m1_key(name), m1_root(m1_key(name))).tz_convert("Europe/London")
    m = m[m.index.hour < 22]
    f = m.resample("5min").agg({"open": "first", "high": "max", "low": "min", "close": "last"}).dropna()
    date = f.index.strftime("%Y-%m-%d").to_numpy()
    hrs = (f.index.hour + f.index.minute / 60.0).to_numpy(float)
    arr = f[["open", "high", "low", "close"]].to_numpy(float)
    cut = np.flatnonzero(date[1:] != date[:-1]) + 1
    starts = np.r_[0, cut]; ends = np.r_[cut, len(date)]
    return {date[s]: (hrs[s:e], arr[s:e, 0], arr[s:e, 1], arr[s:e, 2], arr[s:e, 3]) for s, e in zip(starts, ends)}


@njit(cache=True)
def replay(hrs, op, hi, lo, cl, unit, ue, se, offU, offD, scale):
    """ue/se: (22,2) edges, offU/offD: (22,9,3) offsets in sigma. Returns hours table (21,23) and events (126,17)."""
    n = len(hrs)
    HT = np.full((21, 23), np.nan)
    EV = np.full((126, 17), np.nan)
    kh = np.empty(23, np.int64)
    for h in range(23):
        k = 0
        while k < n and hrs[k] < h:
            k += 1
        kh[h] = k
    # real-time jump bars
    jump = np.zeros(n, np.bool_)
    first_jump = n
    for i in range(n):
        prev = op[0] if i == 0 else cl[i - 1]
        if abs(cl[i] - prev) >= 0.5 * unit:
            jump[i] = True
            if first_jump == n:
                first_jump = i
    sufH = np.empty(n + 1); sufL = np.empty(n + 1)
    sufH[n] = -np.inf; sufL[n] = np.inf
    for i in range(n - 1, -1, -1):
        sufH[i] = max(sufH[i + 1], hi[i]); sufL[i] = min(sufL[i + 1], lo[i])
    nev = 0
    for h in range(1, 22):
        k = kh[h]
        if k == 0 or hrs[n - 1] < h:
            continue
        kp = kh[h - 1]
        runH = hi[0]; runL = lo[0]
        for i in range(k):
            runH = max(runH, hi[i]); runL = min(runL, lo[i])
        lastH = -np.inf; lastL = np.inf; has = False
        for i in range(kp, k):
            has = True
            lastH = max(lastH, hi[i]); lastL = min(lastL, lo[i])
        used = (runH - runL) / unit
        speed = (lastH - lastL) / unit if has else 0.0
        tu = 0 if used < ue[h, 0] else (1 if used < ue[h, 1] else 2)
        ts = 0 if speed < se[h, 0] else (1 if speed < se[h, 1] else 2)
        c = tu * 3 + ts
        r = h - 1
        HT[r, 0] = h; HT[r, 1] = 1.0; HT[r, 2] = c; HT[r, 3] = used; HT[r, 4] = speed
        HT[r, 5] = (max(sufH[k], runH) - runH) / unit; HT[r, 6] = (runL - min(sufL[k], runL)) / unit
        HT[r, 7] = (runH - op[0]) / unit; HT[r, 8] = (runL - op[0]) / unit
        jb = 0.0
        for i in range(k):
            if jump[i]:
                jb = 1.0; break
        jl = 0.0
        for i in range(kp, k):
            if jump[i]:
                jl = 1.0; break
        HT[r, 15] = jb; HT[r, 16] = jl
        for q in range(3):
            HT[r, 9 + q] = offU[h, c, q]; HT[r, 12 + q] = offD[h, c, q]
            lu = runH + offU[h, c, q] * unit
            ld = runL - offD[h, c, q] * unit
            HT[r, 17 + q] = (1.0 if sufH[k] >= lu else 0.0) if offU[h, c, q] > EPS else -1.0
            HT[r, 20 + q] = (1.0 if sufL[k] <= ld else 0.0) if offD[h, c, q] > EPS else -1.0
        k2 = kh[h + 1]
        for side in range(2):
            sgn = 1.0 if side == 0 else -1.0
            anchor = sgn * (runH if side == 0 else runL)
            for q in range(3):
                off = offU[h, c, q] if side == 0 else offD[h, c, q]
                if off <= EPS:
                    continue
                L = np.empty(3)
                for qq in range(3):
                    o2 = offU[h, c, qq] if side == 0 else offD[h, c, qq]
                    L[qq] = anchor + o2 * scale * unit
                line = L[q]
                outE = L[q + 1] if q < 2 else L[2] + (L[2] - L[1])
                backE = L[q - 1] if q > 0 else anchor
                ti = -1
                for i in range(k, k2):
                    hiE = hi[i] if side == 0 else -lo[i]
                    if hiE >= line:
                        ti = i; break
                if ti < 0:
                    continue
                hiT = hi[ti] if side == 0 else -lo[ti]
                cE = sgn * cl[ti]
                a = (outE - cE) / unit; b = (cE - backE) / unit
                pre = 0.0; code = 0.0; inh = 0.0
                if a <= 0:
                    pre = 1.0; code = 1.0
                elif b <= 0:
                    pre = 2.0; code = 2.0
                else:
                    for j in range(ti + 1, n):
                        hiE = hi[j] if side == 0 else -lo[j]
                        loE = lo[j] if side == 0 else -hi[j]
                        ho = hiE >= outE; lb = loE <= backE
                        if ho and lb:
                            code = 3.0
                        elif ho:
                            code = 1.0
                        elif lb:
                            code = 2.0
                        if code != 0.0:
                            inh = 1.0 if j < k2 else 0.0
                            break
                e = nev
                EV[e, 0] = h; EV[e, 1] = sgn; EV[e, 2] = q; EV[e, 3] = ti; EV[e, 4] = hrs[ti] * 60.0
                EV[e, 5] = off; EV[e, 6] = (hiT - line) / unit; EV[e, 7] = 1.0 if hiT >= outE else 0.0
                EV[e, 8] = a; EV[e, 9] = b; EV[e, 10] = pre; EV[e, 11] = code; EV[e, 12] = inh
                EV[e, 13] = 1.0 if first_jump < ti else 0.0; EV[e, 14] = c; EV[e, 15] = used; EV[e, 16] = speed
                nev += 1
    return HT, EV[:nev]


def offsets_from_frame_fit(frame: pd.DataFrame, split, min_cell=30):
    """Refit edges / grids on rows with date < split. frame cols: h, used, speed, U, Dn, date (ordinal)."""
    ue = np.zeros((22, 2)); se = np.zeros((22, 2)); offU = np.zeros((22, 9, 3)); offD = np.zeros((22, 9, 3))
    for h in range(1, 22):
        t = frame[(frame.h == h) & (frame.date < split)]
        if len(t) < 500:
            continue
        e_u = np.quantile(t.used, [1 / 3, 2 / 3]); e_s = np.quantile(t.speed, [1 / 3, 2 / 3])
        ue[h] = e_u; se[h] = e_s
        cell = np.digitize(t.used, e_u) * 3 + np.digitize(t.speed, e_s)
        for c in range(9):
            for arr, col in ((offU, "U"), (offD, "Dn")):
                v = t[col].to_numpy(); vv = v[cell == c]
                vv = vv if len(vv) >= min_cell else v
                arr[h, c] = np.interp(RUNGS, GRID, np.quantile(vv, GRID))
    return ue, se, offU, offD


def shipped_params(cls: str):
    """Edges / offsets from js/intradayRangeParams.js (the page's own numbers)."""
    txt = Path("js/intradayRangeParams.js").read_text(encoding="utf-8")
    P = json.loads(re.search(r"INTRADAY_PARAMS = (\{.*\});", txt, re.S).group(1))
    ue = np.zeros((22, 2)); se = np.zeros((22, 2)); offU = np.zeros((22, 9, 3)); offD = np.zeros((22, 9, 3))
    g = np.array(P["grid"])
    for h in range(1, 22):
        C = P["classes"][cls].get(str(h))
        if not C:
            continue
        ue[h] = C["used_edges"]; se[h] = C["speed_edges"]
        for c in range(9):
            offU[h, c] = np.interp(RUNGS, g, C["cells"][c]["U"]); offD[h, c] = np.interp(RUNGS, g, C["cells"][c]["Dn"])
    return ue, se, offU, offD
