"""noise-area-fx-book: session day matrices for OANDA FX/gold M1 bid/ask and the paper's rule on them.

Prereg: forge/NOISE_AREA_FX_BOOK_PREREG.md (seed 20261117). Lockbox: no session after 2026-08-21.
"""
import os
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DATA = Path(os.environ.get("NAM_DATA", ROOT))
OUT = ROOT / "analysis/output/noise-area-fx-book"
CACHE = OUT / "_cache"
LOCKBOX_END = pd.Timestamp("2026-08-21")
FX = ["eurusd", "gbpusd", "usdjpy", "audusd", "usdcad", "usdchf", "nzdusd", "gold"]
SESSIONS = {"LDN": ("Europe/London", 8 * 60, 480), "NY": ("America/New_York", 8 * 60, 540)}  # tz, open minute, length


def checks(n):
    """0-based index of bars ENDING at open+30, +60 ... close-30."""
    return np.arange(29, n - 30, 30)


def build(sym, sess):
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / f"{sym}_{sess}_v1.npz"
    if f.exists():
        z = np.load(f, allow_pickle=False)
        return {k: z[k] for k in z.files}
    tz, m0, N = SESSIONS[sess]
    d = pd.read_parquet(DATA / f"data/m1_bidask/{sym}_m1.parquet",
                        columns=["time", "open", "high", "low", "close", "volume", "bid_c", "ask_c"])
    t = d["time"].dt.tz_localize("UTC").dt.tz_convert(tz)  # OANDA: bar open time, naive UTC
    mins = t.dt.hour * 60 + t.dt.minute - m0
    keep = (mins >= 0) & (mins < N) & (t.dt.dayofweek < 5)
    d = d[keep].copy()
    d["m"] = mins[keep].to_numpy()
    d["day"] = t[keep].dt.tz_localize(None).dt.normalize().to_numpy()
    d = d[d["day"] <= LOCKBOX_END].drop_duplicates(["day", "m"], keep="last")
    d["spr"] = d["ask_c"] - d["bid_c"]
    days = np.array(sorted(d["day"].unique()))
    pos = pd.Index(days).get_indexer(d["day"])
    A = {}
    for col in ("open", "high", "low", "close", "volume", "spr"):
        a = np.full((len(days), N), np.nan)
        a[pos, d["m"].to_numpy()] = d[col].to_numpy(float)
        A[col] = a
    nb = (~np.isnan(A["close"])).sum(1)
    valid = ~np.isnan(A["open"][:, 0]) & (nb >= 0.8 * N)
    days = days[valid]
    for k in A:
        A[k] = A[k][valid]
    C = pd.DataFrame(A["close"]).ffill(axis=1).to_numpy()
    miss = np.isnan(A["close"])
    H = np.where(miss, C, A["high"])
    L = np.where(miss, C, A["low"])
    V = np.where(miss, 0.0, A["volume"])
    SP = pd.DataFrame(A["spr"]).ffill(axis=1).bfill(axis=1).to_numpy()
    O = A["open"][:, 0].copy()
    last = np.full(len(days), N - 1)
    prev = np.full(len(O), np.nan)
    prev[1:] = C[:-1, -1]
    dd = days.astype("datetime64[D]").astype("int64")
    gap = np.zeros(len(O), bool)
    gap[1:] = np.diff(dd) > 5
    prev[gap] = np.nan
    out = dict(days=dd, open=O, close=C, high=H, low=L, vol=V, spr=SP, last=last, prev=prev, n=np.array(N))
    np.savez_compressed(f, **out)
    return out


def sigma_open(C, O, lookback=14):
    move = np.abs(C / O[:, None] - 1.0)
    s = pd.DataFrame(move).rolling(lookback, min_periods=lookback).mean().shift(1)
    return s.to_numpy()


def vwap(C, H, L, V):
    tp = (H + L + C) / 3.0
    pv = np.cumsum(np.nan_to_num(tp * V), axis=1)
    cv = np.cumsum(np.nan_to_num(V), axis=1)
    return np.where(cv > 0, pv / np.where(cv > 0, cv, 1), C)


def positions_v2(C, ub, lb, vw, ck):
    P = np.zeros((C.shape[0], len(ck)))
    for k, c in enumerate(ck):
        cc, u, l, v = C[:, c], ub[:, c], lb[:, c], vw[:, c]
        band = ~np.isnan(u) & ~np.isnan(l)
        P[:, k] = np.where(band & (cc > u) & (cc > v), 1.0, np.where(band & (cc < l) & (cc < v), -1.0, 0.0))
    return P


def pnl(Z, P, ck):
    """1x gross and spread cost per session (fractions of the session open)."""
    C, O, SP = Z["close"], Z["open"], Z["spr"]
    N = C.shape[1]
    ends = np.concatenate([ck[1:], [N - 1]])
    gross = np.zeros(len(O))
    for k, c in enumerate(ck):
        gross += P[:, k] * (C[:, ends[k]] - C[:, c]) / O
    prevP = np.concatenate([np.zeros((len(O), 1)), P], axis=1)
    dP = np.abs(np.diff(prevP, axis=1))
    cost = (dP * SP[:, ck]).sum(1) / 2 / O + np.abs(P[:, -1]) * SP[:, -1] / 2 / O
    units = dP.sum(1) + np.abs(P[:, -1])
    return gross, cost, units


def run(Z):
    C, O = Z["close"], Z["open"]
    N = int(Z["n"])
    ck = checks(N)
    sig = sigma_open(C, O)
    hi, lo = np.fmax(O, Z["prev"]), np.fmin(O, Z["prev"])
    ub, lb = hi[:, None] * (1 + sig), lo[:, None] * (1 - sig)
    vw = vwap(C, Z["high"], Z["low"], Z["vol"])
    P = positions_v2(C, ub, lb, vw, ck)
    g, c, u = pnl(Z, P, ck)
    dc = C[:, -1]
    r = dc / Z["prev"] - 1
    sd = pd.Series(r).rolling(14, min_periods=13).std(ddof=1).shift(1).to_numpy()
    lev = np.nan_to_num(np.minimum(4.0, 0.02 / sd))
    return dict(P=P, ck=ck, gross=g, cost=c, units=u, net=g - c, lev=lev, bh=np.nan_to_num(r))


def trades(Z, R):
    C, O, SP = Z["close"], Z["open"], Z["spr"]
    P, ck = R["P"], R["ck"]
    N = C.shape[1]
    out = []
    for d in np.nonzero(np.abs(P).sum(1) > 0)[0]:
        row = P[d]
        k = 0
        while k < len(ck):
            if row[k] == 0:
                k += 1
                continue
            side = row[k]
            j = k + 1
            while j < len(ck) and row[j] == side:
                j += 1
            eb = int(ck[j]) if j < len(ck) else N - 1
            g = side * (C[d, eb] - C[d, ck[k]]) / O[d] * 1e4
            n = g - (SP[d, ck[k]] + SP[d, eb]) / 2 / O[d] * 1e4
            out.append((int(d), int(ck[k]), eb, int(side), round(float(g), 2), round(float(n), 2), round(float(R["lev"][d]), 3)))
            k = j
    return out


def permute(Z, rng):
    C, O, H, L, V = Z["close"], Z["open"], Z["high"], Z["low"], Z["vol"]
    D, N = C.shape
    prevC = np.concatenate([O[:, None], C[:, :-1]], axis=1)
    r = np.log(C / prevC)
    ho, lo = np.log(H / C), np.log(L / C)
    order = np.argsort(rng.random((D, N)), axis=1)
    tk = lambda a: np.take_along_axis(a, order, axis=1)
    C2 = O[:, None] * np.exp(np.cumsum(tk(r), axis=1))
    out = dict(Z)
    out.update(close=C2, high=C2 * np.exp(tk(ho)), low=C2 * np.exp(tk(lo)), vol=tk(V))
    return out
