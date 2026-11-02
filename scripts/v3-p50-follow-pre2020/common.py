"""Shared loaders for v3-p50-follow-pre2020 and vwap-stretch-line-touch (run from the repo root; data is local).

discovery_lines(): NQ rows of vf3_stage_b.build (walk-forward folds, 5-session embargo), 2020-08-24 -> 2026-08-20.
backcast_lines():  NQ rows of rule-a-pre2020's backcast (fit on 2020-08-24 -> 2026-08-20, applied to 2016-20).
sessions(dates):   London-session M1 arrays (00:00 -> before 22:00), OANDA NAS100_USD.
"""
from __future__ import annotations

import importlib.util
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
sys.path.insert(0, ".")
sys.path.insert(0, "scripts/forecast_history")

SEED, B, BLOCK = 20261102, 2000, 21
COST = 0.0068                      # % round trip, OANDA NAS100 model (analysis/output/cost-verification/cost_table.json)
EXIT = 21 * 60 + 55                # last bar starting before 21:55 London
LOCKBOX = "2026-08-21"


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def history():
    d = pd.read_csv("analysis/output/forecast_history/NQ.csv").sort_values("date").reset_index(drop=True)
    for q in ("oh", "ol"):
        for r in (50, 75, 90):
            d[f"tq_{q}{r}"] = d[f"r_{q}"].shift(1).rolling(250, min_periods=250).quantile(r / 100)
    d["atr20"] = d.r_hl.shift(1).rolling(20, min_periods=20).mean()
    return d


def discovery_lines(cache: Path):
    if cache.exists():
        return pd.read_parquet(cache)
    import vf3_stage_b as V
    T = V.build(V.load())
    n = T[(T.inst == "NQ") & (T.oos == 1) & (T.date < LOCKBOX)]
    n = n[["date"] + [c for c in n.columns if c.startswith("SI_")]].reset_index(drop=True)
    cache.parent.mkdir(parents=True, exist_ok=True)
    n.to_parquet(cache)
    return n


def backcast_lines():
    ra = _mod("ra", "scripts/rule-a-pre2020/run.py")
    te, last = ra.backcast_lines()
    n = te[te.inst == "NQ"]
    return n[["date"] + [c for c in n.columns if c.startswith("SI_")]].reset_index(drop=True), last


def sessions(dates):
    m = pd.read_parquet("portfolioBacktest/cache/nas100_usd_m1.parquet")
    lon = m.index.tz_convert("Europe/London")
    m = m.assign(date=lon.strftime("%Y-%m-%d"), mins=lon.hour * 60 + lon.minute)
    m = m[(m.mins < 22 * 60) & m.date.isin(set(dates))]
    out = {}
    for d, g in m.groupby("date"):
        o = g.open.iat[0]
        mins = g.mins.to_numpy()
        ex = int(np.searchsorted(mins, EXIT) - 1)
        if ex < 60:
            continue
        hi, lo, cl, op, v = (g[c].to_numpy(float) for c in ("high", "low", "close", "open", "volume"))
        up, dn = (hi / o - 1) * 100, (1 - lo / o) * 100
        out[d] = dict(o=o, mins=mins[:ex], ex=ex, ru=np.maximum.accumulate(up[:ex]), rd=np.maximum.accumulate(dn[:ex]),
                      op=(op[:ex] / o - 1) * 100, cl=(cl / o - 1) * 100, x=(cl[ex] / o - 1) * 100,
                      hi=hi, lo=lo, c=cl, v=v)
    return out


def first_touch(P, du, dd):
    """du, dd: (n, K) line distances in % of open. Returns k (bar index, -1 none), side (+1 upper, -1 lower, 0 none), fill % of open."""
    n, K = du.shape
    k = np.full((n, K), -1)
    side = np.zeros((n, K), int)
    fill = np.full((n, K), np.nan)
    amb = 0
    for i, p in enumerate(P):
        L = len(p["ru"])
        ku = np.searchsorted(p["ru"], du[i])
        kd = np.searchsorted(p["rd"], dd[i])
        hu, hd = ku < L, kd < L
        amb += int((hu & hd & (ku == kd)).sum())
        upf = hu & (~hd | (ku < kd))
        dnf = hd & (~hu | (kd < ku))
        kuc, kdc = np.minimum(ku, L - 1), np.minimum(kd, L - 1)
        k[i] = np.where(upf, kuc, np.where(dnf, kdc, -1))
        side[i] = np.where(upf, 1, np.where(dnf, -1, 0))
        fill[i] = np.where(upf, np.maximum(du[i], p["op"][kuc]), np.where(dnf, np.minimum(-dd[i], p["op"][kdc]), np.nan))
    return k, side, fill, amb


def blocks(n, rng):
    nb = int(np.ceil(n / BLOCK))
    starts = rng.integers(0, n - BLOCK + 1, size=(B, nb))
    return (starts[:, :, None] + np.arange(BLOCK)).reshape(B, -1)[:, :n]


def per_trade(v, idx):
    """v: per-session values with nan = no trade. Mean per trade, block CI, two-sided bootstrap p."""
    t = ~np.isnan(v)
    z = np.where(t, v, 0.0)
    bm = np.array([z[j].sum() / max(t[j].sum(), 1) for j in idx])
    m = float(z.sum() / max(t.sum(), 1))
    p = 2 * min((bm <= 0).mean(), (bm >= 0).mean())
    return {"n": int(t.sum()), "mean": m, "lo": float(np.percentile(bm, 2.5)), "hi": float(np.percentile(bm, 97.5)),
            "p": float(max(p, 1 / len(idx))), "se": float(bm.std(ddof=1))}


def diff_trade(a, b, idx):
    """Difference of per-trade means of two per-session series (different trade sets), bootstrapped jointly by session."""
    ta, tb = ~np.isnan(a), ~np.isnan(b)
    za, zb = np.where(ta, a, 0.0), np.where(tb, b, 0.0)
    bm = np.array([za[j].sum() / max(ta[j].sum(), 1) - zb[j].sum() / max(tb[j].sum(), 1) for j in idx])
    m = float(za.sum() / ta.sum() - zb.sum() / tb.sum())
    return {"mean": m, "lo": float(np.percentile(bm, 2.5)), "hi": float(np.percentile(bm, 97.5)), "se": float(bm.std(ddof=1))}


def shuffle_quarter(v, dates, K, rng, partner=None):
    q = pd.PeriodIndex(pd.Series(dates), freq="Q").astype(str).to_numpy()
    groups = [np.flatnonzero(q == g) for g in np.unique(q)]
    out = np.repeat(v[:, None], K, 1)
    out2 = None if partner is None else np.repeat(partner[:, None], K, 1)
    for k in range(K):
        for g in groups:
            pp = rng.permutation(g)
            out[g, k] = v[pp]
            if partner is not None:
                out2[g, k] = partner[pp]
    return out, out2
