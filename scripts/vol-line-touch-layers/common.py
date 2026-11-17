"""Shared definitions for vol-line-touch-layers (prereg forge/VOL_LINE_TOUCH_LAYERS_PREREG.md, A1)."""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

WT = Path(__file__).resolve().parents[2]
OUT = WT / "analysis/output/vol-line-touch-layers"
FROZEN = OUT / "frozen"
SEED = 20261117
DISC0, DISC_END, CONF0, CONF_END = "2016-10-24", "2022-12-30", "2023-01-01", "2026-08-20"
SIDES = ("fade", "follow")
SHAPES = ("S1", "S2", "S3")
COMBOS = [(s, h) for s in SIDES for h in SHAPES]
KLASS = {"fx_majors": 0, "fx_crosses": 1, "gold": 2, "indices": 3}

BASE = ["minute", "ext_opp", "spd15", "spd60", "rv_pre", "regime", "res1", "gapz", "spread", "ev", "mon", "fri",
        "rung", "dirn", "kl"]
LAYERS = ["err10", "mr5", "cgap", "burst", "common", "since", "vratio", "used", "vleft"]
FEATS = {"base": BASE, "layered": BASE + LAYERS}
MAP_INPUTS = ["mr5", "err10", "burst", "common", "vleft", "spread", "vratio", "used"]
BLOCKS = ((60, 420, "01-07"), (420, 780, "07-13"), (780, 1140, "13-19"))
OUTCOMES = [f"r_{s}_{h}{l}" for s in SIDES for h in SHAPES for l in ("", "_l1")]
EXC = [f"{k}_{s}" for k in ("mfe60", "mae60", "mfe", "mae") for s in SIDES]
GBM = dict(max_depth=3, learning_rate=0.05, max_iter=300, min_samples_leaf=200, l2_regularization=1.0)
WF_YEARS = (2019, 2020, 2021, 2022)
EMBARGO = 5


def load(window, outcomes=True):
    """window 'disc' or 'conf'. With outcomes=False the outcome and excursion columns are never read."""
    import pyarrow.parquet as pq
    f = OUT / "touches.parquet"
    cols = pq.ParquetFile(f).schema_arrow.names
    keep = [c for c in cols if outcomes or (c not in OUTCOMES and c not in EXC)]
    E = pd.read_parquet(f, columns=keep)
    lo, hi = (DISC0, DISC_END) if window == "disc" else (CONF0, CONF_END)
    E = E[(E.date >= lo) & (E.date <= hi)].reset_index(drop=True)
    E["mon"] = (E.wd == 0).astype(float)
    E["fri"] = (E.wd == 4).astype(float)
    E["dirn"] = (E.dir == "up").astype(float)
    E["kl"] = E.klass.map(KLASS).astype(float)
    E["block"] = pd.cut(E.minute, [b[0] for b in BLOCKS] + [BLOCKS[-1][1]], right=False, labels=[b[2] for b in BLOCKS]).astype(str)
    E["year"] = E.date.str[:4].astype(int)
    return E


def model():
    return HistGradientBoostingRegressor(**GBM, random_state=SEED, categorical_features=None)


def fit_predict(Etr, ytr, Ete, feats):
    m = model().fit(Etr[feats].to_numpy(float), ytr)
    return m, m.predict(Ete[feats].to_numpy(float))


def walk_forward(E, y, feats):
    """Out-of-sample predictions for 2019-2022: fit on sessions before year Y minus a 5-session embargo."""
    dates = np.sort(E.date.unique())
    oof = np.full(len(E), np.nan)
    for Y in WF_YEARS:
        first = f"{Y}-01-01"
        before = dates[dates < first]
        cut = before[-EMBARGO] if len(before) > EMBARGO else before[0]
        tr = (E.date < cut).to_numpy()
        te = (E.year == Y).to_numpy()
        _, p = fit_predict(E[tr], y[tr], E[te], feats)
        oof[te] = p
    return oof


# ── stationary date-block bootstrap ─────────────────────────────────────────────────────────────────────────────

def boot_index(n_dates, B=2000, block=20, seed=SEED):
    rng = np.random.default_rng(seed)
    p = 1.0 / block
    idx = np.empty((B, n_dates), dtype=np.int32)
    for b in range(B):
        start = rng.integers(0, n_dates, size=n_dates)
        new = rng.random(n_dates) < p
        new[0] = True
        pos = np.empty(n_dates, dtype=np.int64)
        cur = 0
        for t in range(n_dates):
            cur = start[t] if new[t] else (cur + 1) % n_dates
            pos[t] = cur
        idx[b] = pos
    return idx


class Boot:
    """Mean of a per-row value with dates as the resampling unit. One date index set, reused for every statistic."""

    def __init__(self, dates, B=2000, block=20):
        self.u = np.sort(pd.unique(dates))
        self.pos = pd.Series(np.arange(len(self.u)), index=self.u)
        self.idx = boot_index(len(self.u), B, block)

    def sums(self, dates, v):
        d = self.pos[dates].to_numpy()
        s = np.bincount(d, weights=v, minlength=len(self.u))
        n = np.bincount(d, minlength=len(self.u)).astype(float)
        return s, n

    def mean(self, dates, v):
        v = np.asarray(v, float)
        s, n = self.sums(dates, v)
        est = s.sum() / n.sum()
        S, N = s[self.idx].sum(1), n[self.idx].sum(1)
        draws = S / np.maximum(N, 1)
        return est, draws

    def diff(self, dates_a, va, dates_b, vb):
        sa, na = self.sums(dates_a, np.asarray(va, float))
        sb, nb = self.sums(dates_b, np.asarray(vb, float))
        est = sa.sum() / na.sum() - sb.sum() / nb.sum()
        draws = sa[self.idx].sum(1) / np.maximum(na[self.idx].sum(1), 1) - sb[self.idx].sum(1) / np.maximum(nb[self.idx].sum(1), 1)
        return est, draws


def summ(est, draws, n=None, ndates=None, lvl=0.95):
    a = (1 - lvl) / 2
    lo, hi = np.quantile(draws, [a, 1 - a])
    sd = float(np.std(draws))
    out = {"est": round(float(est), 5), "lo": round(float(lo), 5), "hi": round(float(hi), 5), "se": round(sd, 5),
           "p_le0": round(float((np.sum(draws <= 0) + 1) / (len(draws) + 1)), 5), "mde80": round(2.8 * sd, 5)}
    if n is not None:
        out["n"] = int(n)
    if ndates is not None:
        out["dates"] = int(ndates)
    return out


def holm(ps, alpha=0.025):
    """Holm step-down (one-sided alpha). Returns a pass flag per p."""
    order = np.argsort(ps)
    ok = np.zeros(len(ps), bool)
    for k, i in enumerate(order):
        if ps[i] <= alpha / (len(ps) - k):
            ok[i] = True
        else:
            break
    return ok
