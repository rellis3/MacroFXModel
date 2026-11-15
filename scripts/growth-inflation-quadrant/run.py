"""growth-inflation-quadrant: does the growth x inflation quadrant, built strictly point-in-time from ALFRED vintages,
tilt the 1-8 week direction of the dollar, gold and US indices against the unconditional drift (B0)?

Prereg: forge/GROWTH_INFLATION_QUADRANT_PREREG.md. Seed 20261115. Reads FRED/ALFRED (read-only, free API; key from
RegimeV2/.env, never printed) and the local feature store's OANDA daily closes. Never R2 (R2_* unset below).
No price after the 2026-08-21 lockbox is read into any outcome (asserted).

Modes
  python -X utf8 -I scripts/growth-inflation-quadrant/run.py --fetch      pull ALFRED vintages into _cache/ (once)
  python -X utf8 -I scripts/growth-inflation-quadrant/run.py --selftest   planted tilt recovered, zero world null,
                                                                          snapshot/look-ahead canaries
  python -X utf8 -I scripts/growth-inflation-quadrant/run.py --power      labels + circular-shift placebo SE only
                                                                          (real outcomes, real alignment never scored)
  python -X utf8 -I scripts/growth-inflation-quadrant/run.py              the registered run + evidence packs

Construction (prereg section 3):
  * Every Friday t (decision = Friday NY close), each FRED series is "snapshotted" as it stood the day BEFORE t:
    for each observation date the value of the latest vintage with realtime_start < t. Nothing revised later is used.
  * PRIMARY quadrant = the desk's js/regimeCore.js construction (growth composite: CFNAI 3m mean, -dlog claims 3m vs
    12m, IP 3m annualised, payrolls 3m annualised; inflation composite: core CPI 3m ann., core PCE 3m ann., 5y
    breakeven level; each leg z over a trailing 120 months, >= 36), growth score = composite 3m mean - 12m mean,
    inflation score = composite 3m change; label = signs, for the LATEST month the snapshot can score (no lag shift
    is needed: the snapshot itself only holds what had printed).
  * SECONDARY quadrant (S2) = payrolls 3m-ann minus 12m-ann log growth x core CPI 3m-ann minus 12m-ann.
  * Outcome z = log(P[t+h]/P[t]) / (sd of the 52 weekly log returns to t x sqrt(h)), oriented (USD up for the basket).
    B0: z is demeaned per instrument and horizon over the scored sample; the statistic is mean(side x z_dm) over
    rows where the pre-registered map takes a side.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from statistics import NormalDist

for _k in list(os.environ):
    if _k.startswith("R2_"):
        del os.environ[_k]
os.environ.setdefault("OMP_NUM_THREADS", "2")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "2")
os.environ.setdefault("MKL_NUM_THREADS", "2")

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SLUG = "growth-inflation-quadrant"
OUT = ROOT / "analysis" / "output" / SLUG
CACHE = OUT / "_cache"
PREREG = "forge/GROWTH_INFLATION_QUADRANT_PREREG.md"
PREREG_COMMIT = "11ce3c39"
BRANCH = "claude/signal-bot-bias-analysis-bwr1qv"
SEED = 20261115
LOCKBOX_LAST = pd.Timestamp("2026-08-21")
FEAT = ROOT / "features"

SERIES = {  # id -> (FRED id, cadence)
    "payems": ("PAYEMS", "monthly"), "indpro": ("INDPRO", "monthly"), "cfnai": ("CFNAI", "monthly"),
    "claims": ("ICSA", "weekly"), "corecpi": ("CPILFESL", "monthly"), "corepce": ("PCEPILFE", "monthly"),
}
BEI = "T5YIE"   # daily market series, not revised: value for date d known after d

GROWTH_LEGS = [("cfnai", "mean3"), ("claims", "negLogMom"), ("indpro", "annLog3"), ("payems", "annLog3")]
INFL_LEGS = [("corecpi", "annLog3"), ("corepce", "annLog3"), ("bei5", "level")]
MIN_G, MIN_I, ZWIN, ZMIN = 3, 2, 120, 36

QUADS = ("goldilocks", "reflation", "stagflation", "deflation")
REG = {(1, -1): "goldilocks", (1, 1): "reflation", (-1, 1): "stagflation", (-1, -1): "deflation"}

# The pre-registered map (prereg section 3.5): +1 = the asset is expected UP in that quadrant, 0 = no call.
MAP = {
    "indices": {"goldilocks": 1, "reflation": 1, "stagflation": -1, "deflation": -1},
    "gold":    {"goldilocks": -1, "reflation": 0, "stagflation": 1, "deflation": 1},
    "usd":     {"goldilocks": -1, "reflation": 0, "stagflation": 0, "deflation": 1},
}
GROUPS = {
    "usd": [("eurusd", -1), ("gbpusd", -1), ("audusd", -1), ("nzdusd", -1), ("usdjpy", 1), ("usdcad", 1), ("usdchf", 1)],
    "gold": [("xauusd", 1)],
    "indices": [("nas100", 1), ("spx500", 1)],
}
HORIZONS = (1, 2, 4, 8)
IR_USEFUL, IR_LARGE = 0.30, 1.00     # annualised information ratio: the useful bar and the "folklore-size" tilt


def bar_for(h, ir=IR_USEFUL):
    return ir * math.sqrt(h / 52.0)


def cell_list():
    cells = []
    for g in ("usd", "gold", "indices"):
        for h in HORIZONS:
            cells.append({"id": f"map_{g}_{h}w", "arm": "map", "group": g, "h": h, "def": "primary"})
    for g in ("usd", "gold", "indices"):
        cells.append({"id": f"trans_{g}_4w", "arm": "transition", "group": g, "h": 4, "def": "primary"})
    for g in ("usd", "gold", "indices"):
        cells.append({"id": f"xfit_{g}_4w", "arm": "crossfit", "group": g, "h": 4, "def": "primary"})
    for g in ("usd", "gold", "indices"):
        cells.append({"id": f"s2map_{g}_4w", "arm": "map", "group": g, "h": 4, "def": "secondary"})
    return cells


CELLS = cell_list()
N_CELLS = len(CELLS)   # 21, Holm over all
Z_MDE = NormalDist().inv_cdf(1 - 0.05 / (2 * N_CELLS)) + NormalDist().inv_cdf(0.80)


# ── fetching (read-only) ─────────────────────────────────────────────────────────────────────────────────────

def fred_key():
    for line in (ROOT / "RegimeV2" / ".env").read_text(encoding="utf-8", errors="ignore").splitlines():
        m = re.match(r"\s*FRED_KEY\s*=\s*['\"]?([^'\"\s#]+)", line)
        if m:
            return m.group(1)
    raise SystemExit("FRED_KEY not found in RegimeV2/.env")


def _get(url, key):
    req = urllib.request.Request(url, headers={"User-Agent": "research-client/1.0"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except urllib.error.HTTPError as ex:
            body = ex.read().decode(errors="replace").replace(key, "<key>")[:200]
            if ex.code in (429, 500, 502, 503) and attempt < 3:
                time.sleep(3 * (attempt + 1)); continue
            raise RuntimeError(f"HTTP {ex.code}: {body}")


def fetch_vintages(fid, key, yearly):
    """Every ALFRED real-time period for the series, observations from 1990. Keeps realtime_start AND end."""
    today = pd.Timestamp.now().strftime("%Y-%m-%d")
    windows = [(f"{y}-01-01", min(f"{y}-12-31", today)) for y in range(2000, 2027)] if yearly else [("2000-01-01", "9999-12-31")]
    out = []
    for rs, re_ in windows:
        u = ("https://api.stlouisfed.org/fred/series/observations?series_id=%s&realtime_start=%s&realtime_end=%s"
             "&observation_start=1990-01-01&file_type=json&limit=100000&api_key=%s") % (fid, rs, re_, key)
        try:
            j = _get(u, key)
        except RuntimeError as ex:
            if not yearly and "exceed" in str(ex).lower():
                return fetch_vintages(fid, key, True)
            if yearly and "does not exist in alfred" in str(ex).lower():
                continue
            raise
        out += j["observations"]
        time.sleep(0.25)
    df = pd.DataFrame(out)
    df = df[~df["value"].isin([".", ""])].copy()
    df["value"] = df["value"].astype(float)
    df = df[["date", "realtime_start", "realtime_end", "value"]].drop_duplicates()
    return df


def fetch_all():
    CACHE.mkdir(parents=True, exist_ok=True)
    key = fred_key()
    for sid, (fid, cad) in SERIES.items():
        df = fetch_vintages(fid, key, yearly=(cad == "weekly"))
        df.to_parquet(CACHE / f"{sid}.parquet", index=False)
        print(f"{sid:8s} {fid:9s} rows {len(df):6d}  vintages {df.realtime_start.nunique():5d}  "
              f"first vintage {df.realtime_start.min()}  obs {df.date.min()} -> {df.date.max()}")
    u = ("https://api.stlouisfed.org/fred/series/observations?series_id=%s&observation_start=2002-01-01"
         "&file_type=json&limit=100000&api_key=%s") % (BEI, key)
    j = _get(u, key)
    b = pd.DataFrame(j["observations"]); b = b[~b["value"].isin([".", ""])]
    b = b[["date", "value"]].assign(value=lambda d: d["value"].astype(float))
    b.to_parquet(CACHE / "bei5.parquet", index=False)
    print(f"bei5     {BEI:9s} rows {len(b):6d}  {b.date.min()} -> {b.date.max()}")


def load_vintages():
    V = {}
    for sid in SERIES:
        d = pd.read_parquet(CACHE / f"{sid}.parquet")
        V[sid] = pd.DataFrame({"date": pd.to_datetime(d["date"]).astype("datetime64[ns]"),
                               "rs": pd.to_datetime(d["realtime_start"]).astype("datetime64[ns]"),
                               "value": d["value"].astype(float)}).sort_values(["rs", "date"]).reset_index(drop=True)
    b = pd.read_parquet(CACHE / "bei5.parquet")
    V["bei5"] = pd.DataFrame({"date": pd.to_datetime(b["date"]).astype("datetime64[ns]"), "value": b["value"].astype(float)})
    return V


# ── point-in-time snapshot and the quadrant ──────────────────────────────────────────────────────────────────

def snapshot(v: pd.DataFrame, T: pd.Timestamp) -> pd.Series:
    """The series as it stood strictly before day T: per observation date, the latest vintage with rs < T.
    Returns month-end values (last observation of each month), indexed by month Period."""
    s = v[v["rs"] < T]
    if s.empty:
        return pd.Series(dtype=float)
    s = s.sort_values("rs").drop_duplicates("date", keep="last").sort_values("date")
    m = s.groupby(s["date"].dt.to_period("M"))["value"].last()
    return m


def bei_snapshot(b: pd.DataFrame, T: pd.Timestamp) -> pd.Series:
    s = b[b["date"] < T]     # a daily market print is known after its own day closes
    return s.groupby(s["date"].dt.to_period("M"))["value"].last()


def _derive(x: pd.Series, kind: str) -> pd.Series:
    if kind == "mean3":
        return x.rolling(3, min_periods=3).mean()
    if kind == "negLogMom":
        lx = np.log(x.where(x > 0))
        return -(lx.rolling(3, min_periods=3).mean() - lx.rolling(12, min_periods=12).mean()) * 100
    if kind == "annLog3":
        return np.log(x / x.shift(3)) * 4 * 100
    if kind == "annLog12":
        return np.log(x / x.shift(12)) * 100
    return x


def _ztrail(x: pd.Series) -> pd.Series:
    r = x.rolling(ZWIN, min_periods=ZMIN)
    z = (x - r.mean()) / r.std(ddof=1)
    return z.where(x.notna())


def quadrant_from_monthly(M: dict) -> dict | None:
    """Port of js/regimeCore.regimeFromLegs (lagMonths=0: the snapshot already holds only printed data).
    M: leg id -> month-end Series indexed by Period. Returns the label for the latest scorable month."""
    have = [s for s in M.values() if len(s)]
    if not have:
        return None
    idx = pd.period_range(min(s.index.min() for s in have), max(s.index.max() for s in have), freq="M")
    leg = lambda k: M[k].reindex(idx) if len(M.get(k, [])) else pd.Series(np.nan, index=idx)   # a leg with no vintage yet = missing
    gz = pd.concat([_ztrail(_derive(leg(k), kind)) for k, kind in GROWTH_LEGS], axis=1)
    iz = pd.concat([_ztrail(_derive(leg(k), kind)) for k, kind in INFL_LEGS], axis=1)
    gc = gz.mean(axis=1).where(gz.notna().sum(axis=1) >= MIN_G)
    ic = iz.mean(axis=1).where(iz.notna().sum(axis=1) >= MIN_I)
    gs = gc.rolling(3, min_periods=3).mean() - gc.rolling(12, min_periods=12).mean()
    is_ = ic - ic.shift(3)
    ok = gs.notna() & is_.notna()
    if not ok.any():
        return None
    m = ok[ok].index[-1]
    g, i = float(gs[m]), float(is_[m])
    return {"month": str(m), "g": g, "i": i, "label": REG[(1 if g > 0 else -1, 1 if i > 0 else -1)]}


def quadrant_s2(M: dict) -> dict | None:
    p, c = M["payems"], M["corecpi"]
    if len(p) < 15 or len(c) < 15:
        return None
    gs = (_derive(p, "annLog3") - _derive(p, "annLog12")).dropna()
    is_ = (_derive(c, "annLog3") - _derive(c, "annLog12")).dropna()
    common = gs.index.intersection(is_.index)
    if not len(common):
        return None
    m = common[-1]
    g, i = float(gs[m]), float(is_[m])
    return {"month": str(m), "g": g, "i": i, "label": REG[(1 if g > 0 else -1, 1 if i > 0 else -1)]}


def labels_at(V: dict, dates, shift_days: int = 0) -> pd.DataFrame:
    """Quadrant labels at each decision date. shift_days > 0 = the look-ahead CANARY (vintages treated as known
    `shift_days` earlier than they were)."""
    rows = []
    for T in dates:
        Ts = T + pd.Timedelta(days=shift_days)
        M = {k: snapshot(V[k], Ts) for k in SERIES}
        M["bei5"] = bei_snapshot(V["bei5"], Ts)
        q = quadrant_from_monthly(M)
        q2 = quadrant_s2(M)
        rows.append({"date": T, "label": q["label"] if q else None, "month": q["month"] if q else None,
                     "g": q["g"] if q else np.nan, "i": q["i"] if q else np.nan,
                     "label_s2": q2["label"] if q2 else None, "month_s2": q2["month"] if q2 else None})
    return pd.DataFrame(rows)


def labels_revised(V: dict, dates) -> pd.DataFrame:
    """CANARY: the old regime-study way -- today's fully revised data, one-month publication lag."""
    final = pd.Timestamp("2026-11-01")
    M = {k: snapshot(V[k], final) for k in SERIES}
    M["bei5"] = bei_snapshot(V["bei5"], final)
    out = []
    for T in dates:
        lastm = T.to_period("M") - 1          # month m is labelled with data through m-1
        Mt = {k: s[s.index <= lastm] for k, s in M.items()}
        q = quadrant_from_monthly(Mt)
        out.append({"date": T, "label_rev": q["label"] if q else None})
    return pd.DataFrame(out)


# ── prices and outcomes ──────────────────────────────────────────────────────────────────────────────────────

def fridays(start="2003-01-03", end=LOCKBOX_LAST):
    return pd.date_range(start, end, freq="W-FRI")


def weekly_prices(inst: str, grid) -> pd.Series:
    d = pd.read_parquet(FEAT / f"px_d1_{inst}.parquet")
    s = pd.Series(d["value"].astype(float).to_numpy(), index=pd.to_datetime(d["date"]).astype("datetime64[ns]")).sort_index()
    s = s[s.index <= LOCKBOX_LAST]                         # lockbox: no price after 2026-08-21
    assert s.index.max() <= LOCKBOX_LAST
    pos = s.index.searchsorted(grid, side="right") - 1
    vals = np.where(pos >= 0, s.to_numpy()[np.clip(pos, 0, None)], np.nan)
    stale = np.where(pos >= 0, (grid - s.index[np.clip(pos, 0, None)]).days > 4, True)
    vals[stale] = np.nan
    return pd.Series(vals, index=grid)


def outcome_rows(lab: pd.DataFrame) -> pd.DataFrame:
    grid = fridays()
    rows = []
    for g, insts in GROUPS.items():
        for inst, orient in insts:
            p = weekly_prices(inst, grid)
            lp = np.log(p)
            wr = lp.diff()
            sig1 = wr.rolling(52, min_periods=40).std(ddof=1)       # weekly returns ending at t: known at t
            for h in HORIZONS:
                fwd = (lp.shift(-h) - lp) * orient
                z = fwd / (sig1 * math.sqrt(h))
                df = pd.DataFrame({"date": grid, "group": g, "inst": inst, "h": h, "z": z.to_numpy(),
                                   "end": pd.Series(grid).shift(-h).to_numpy()})
                rows.append(df)
    R = pd.concat(rows, ignore_index=True)
    R = R[np.isfinite(R["z"])]
    assert (pd.to_datetime(R["end"]) <= LOCKBOX_LAST).all()
    R = R.merge(lab, on="date", how="inner")
    return R


def half_year(d: pd.Series) -> np.ndarray:
    return (d.dt.year.astype(str) + np.where(d.dt.month <= 6, "H1", "H2")).to_numpy()


# ── estimators (weighted, so the cluster bootstrap is a matrix product) ──────────────────────────────────────

class Cell:
    """Arrays for one scored cell. Rows = (instrument, decision date) for one group and horizon, on the scored
    sample (label present). Weighted estimators: w = cluster multiplicity from the bootstrap."""

    def __init__(self, R: pd.DataFrame, spec: dict, label_col: str):
        r = R[(R["group"] == spec["group"]) & (R["h"] == spec["h"]) & R[label_col].notna()].copy()
        r = r.sort_values(["date", "inst"]).reset_index(drop=True)
        self.spec, self.r = spec, r
        self.z = r["z"].to_numpy(float)
        self.inst_codes, self.inst = np.unique(r["inst"].to_numpy(), return_inverse=True)
        self.dates, self.didx = np.unique(r["date"].to_numpy(), return_inverse=True)
        self.lab_by_date = r.drop_duplicates("date").set_index("date")[label_col].reindex(self.dates).to_numpy()
        self.qcode_by_date = np.array([QUADS.index(x) for x in self.lab_by_date])
        self.cl_codes, self.cl = np.unique(half_year(r["date"]), return_inverse=True)
        mid = self.dates[len(self.dates) // 2]
        self.half = (r["date"].to_numpy() >= mid).astype(int)
        self.map_vec = np.array([MAP[spec["group"]][q] for q in QUADS], float)

    # the label series can be replaced (circular-shift placebo) without touching outcomes
    def sides(self, qd=None):
        qd = self.qcode_by_date if qd is None else qd
        side = self.map_vec[qd][self.didx]
        if self.spec["arm"] == "transition":
            ev = np.r_[False, qd[1:] != qd[:-1]]
            side = np.where(ev[self.didx], side, 0.0)
        return side

    def zdm(self, w):
        s = np.bincount(self.inst, weights=w * self.z, minlength=len(self.inst_codes))
        c = np.bincount(self.inst, weights=w, minlength=len(self.inst_codes))
        zd = self.z - (s / np.where(c > 0, c, np.nan))[self.inst]
        return np.where(w > 0, zd, 0.0)          # rows outside the weighted sample carry no weight and no NaN

    def est(self, w=None, qd=None, z_add=None, eval_mask=None):
        """w: bootstrap weights (learning AND averaging). eval_mask: restrict only the averaging (halves, per
        instrument, top-1% removal) while B0 demeaning and the cross-fit learning use the full weighted sample."""
        w = np.ones(len(self.z)) if w is None else w
        zsave = self.z
        if z_add is not None:
            self.z = self.z + z_add
        try:
            zd = self.zdm(w)
            qd_ = self.qcode_by_date if qd is None else qd
            if self.spec["arm"] == "crossfit":
                q = qd_[self.didx]
                side = np.zeros(len(zd))
                for hh in (0, 1):
                    m = self.half == hh
                    s = np.bincount(q[m], weights=(w * zd)[m], minlength=4)
                    c = np.bincount(q[m], weights=w[m], minlength=4)
                    mu = s / np.where(c > 0, c, np.nan)
                    sgn = np.nan_to_num(np.sign(mu))
                    side[~m] = sgn[q[~m]]          # learned on one half, applied to the other
            else:
                side = self.sides(qd_)
            a = side != 0
            we = w if eval_mask is None else w * eval_mask
            den = (we * a).sum()
            return float((we * side * zd)[a].sum() / den) if den > 0 else np.nan
        finally:
            self.z = zsave

    def boot(self, B, rng, z_add=None):
        nC = len(self.cl_codes)
        W = rng.multinomial(nC, np.full(nC, 1.0 / nC), size=B).astype(float)
        return np.array([self.est(W[b][self.cl], z_add=z_add) for b in range(B)])

    def circ_placebo(self, n, rng):
        N = len(self.dates)
        ks = rng.integers(52, max(53, N - 52), size=n)
        return np.array([self.est(qd=np.roll(self.qcode_by_date, k)) for k in ks])

    def plant_vec(self, effect):
        side = self.sides() if self.spec["arm"] != "crossfit" else self.map_vec[self.qcode_by_date][self.didx]
        return effect * side


def p_from_se(est, se):
    if not np.isfinite(se) or se == 0:
        return 1.0
    return float(2 * (1 - NormalDist().cdf(abs(est) / se)))


def holm(p):
    p = np.asarray(p, float); m = len(p); order = np.argsort(p); adj = np.empty(m); run = 0
    for k, i in enumerate(order):
        run = max(run, min(1.0, (m - k) * p[i])); adj[i] = run
    return adj


# ── scoring ──────────────────────────────────────────────────────────────────────────────────────────────────

def score_cell(c: Cell, rng, B=2000, n_plc=1000, n_plant=40):
    est = c.est()
    bo = c.boot(B, rng)
    lo, hi = np.nanpercentile(bo, [2.5, 97.5]); se = float(np.nanstd(bo, ddof=1))
    plc = c.circ_placebo(n_plc, rng)
    bar = bar_for(c.spec["h"]); big = bar_for(c.spec["h"], IR_LARGE)
    halves = [c.est(eval_mask=(c.half == hh).astype(float)) for hh in (0, 1)]
    per_inst = {str(k): c.est(eval_mask=(c.inst == j).astype(float)) for j, k in enumerate(c.inst_codes)}
    # top-1% removal (by |side x z_dm| on active rows)
    zd = c.zdm(np.ones(len(c.z)))
    side = c.sides() if c.spec["arm"] != "crossfit" else c.map_vec[c.qcode_by_date][c.didx]
    contrib = np.abs(side * zd)
    thr = np.quantile(contrib[side != 0], 0.99) if (side != 0).any() else np.inf
    est_top = c.est(eval_mask=(contrib <= thr).astype(float))
    # pipeline sanity (c7): an effect of the cell's own MDE planted into the REAL rows must be found by the
    # cluster-bootstrap 95% CI >= 80% of the time; the bar-sized plant is reported (it is below the MDE by design)
    mde = Z_MDE * float(np.nanstd(plc, ddof=1))
    def detect(effect):
        hits = 0
        for _ in range(n_plant):
            b = c.boot(300, rng, z_add=c.plant_vec(effect))
            hits += int(np.nanpercentile(b, 2.5) > 0)
        return hits / n_plant
    det_mde, det_bar = detect(mde), detect(bar)
    return {"cell": c.spec["id"], **c.spec, "n_rows": int(len(c.z)), "n_dates": int(len(c.dates)),
            "n_active_rows": int((side != 0).sum()), "n_clusters": int(len(c.cl_codes)),
            "span": [str(pd.Timestamp(c.dates[0]).date()), str(pd.Timestamp(c.dates[-1]).date())],
            "estimate": est, "ci": [float(lo), float(hi)], "se_boot": se, "p_raw": p_from_se(est, se),
            "placebo_sd": float(np.nanstd(plc, ddof=1)), "placebo_p97_5": float(np.nanpercentile(plc, 97.5)),
            "placebo_pct_of_real": float((plc < est).mean() * 100), "mde": mde, "bar": bar, "large_bar": big,
            "halves": halves, "per_inst": per_inst, "without_top1pct": est_top,
            "plant_mde_detected": det_mde, "plant_bar_detected": det_bar,
            "quad_counts": {q: int((c.lab_by_date == q).sum()) for q in QUADS}}


def verdicts(res: list) -> None:
    ph = holm([r["p_raw"] for r in res])
    for r, p in zip(res, ph):
        r["p_holm"] = float(p)
        ninst = len(r["per_inst"])
        share_pos = sum(1 for v in r["per_inst"].values() if v > 0) / ninst
        gate = {
            "c1_holm": bool(p < 0.05 and r["estimate"] > 0),
            "c2_bar": bool(r["estimate"] >= r["bar"]),
            "c3_placebo": bool(r["estimate"] > r["placebo_p97_5"]),
            "c4_halves": bool(all(h > 0 for h in r["halves"])),
            "c5_instruments": bool(share_pos >= 2 / 3) if ninst > 1 else None,
            "c6_top1pct": bool(r["without_top1pct"] > 0),
            "c7_plant_mde": bool(r["plant_mde_detected"] >= 0.8),
        }
        r["gate"] = gate
        r["powered_for_bar"] = bool(r["mde"] <= r["bar"])
        lo, hi = r["ci"]
        if all(v for v in gate.values() if v is not None):
            v = "validated"
        elif hi < r["bar"]:
            v = "context" if (p < 0.05 and r["estimate"] > 0) else "null"
        else:
            v = "underpowered"
        r["verdict"] = v
        r["large_tilt_ruled_out"] = bool(hi < r["large_bar"])
        r["wrong_sign"] = bool(hi < 0)


# ── evidence packs ───────────────────────────────────────────────────────────────────────────────────────────

def packs(cells_by_id: dict, res: list):
    sys.path.insert(0, str(ROOT / "scripts" / "evidence_pack"))
    from pack import build_pack
    out = {}
    pick = [r for r in res if r["arm"] in ("map", "transition") and r["h"] == 4]
    for r in pick:
        c = cells_by_id[r["cell"]]
        side = c.sides()
        rows = pd.DataFrame({"date": pd.to_datetime(c.r["date"]), "inst": c.r["inst"].to_numpy(),
                             "signal": c.lab_by_date[c.didx], "side": side.astype(int),
                             "outcome": c.zdm(np.ones(len(c.z))), "cluster": c.cl_codes[c.cl]})
        rows = rows[rows["side"] != 0].reset_index(drop=True)
        est = lambda rr: float((rr["side"] * rr["outcome"]).mean())
        plant = lambda rr, e, g: rr.assign(outcome=rr["outcome"] + e * rr["side"])
        leak = lambda rr, g: rr.assign(side=np.where(rr["outcome"] >= 0, 1, -1))
        note = ("Rows = (instrument, Friday) where the map takes a side; outcome = forward z demeaned per instrument "
                "(B0). Cluster = calendar half-year. CAUTION: the pack's shuffled placebo permutes the side row by row, "
                "which breaks the quadrant's persistence and makes its band too narrow; the registered placebo is the "
                "circular shift in results.json (placebo_p97_5). Leak = side set to the sign of the realised outcome.")
        out[r["cell"]] = build_pack(rows, slug=f"{SLUG}/{r['cell']}", out=str(OUT / r["cell"]), estimate_fn=est,
                                    bar=r["bar"], unit=f"sigma of {r['h']}w return", plant_fn=plant, leak_fn=leak,
                                    verdict_word=r["verdict"], seed=SEED, B=1000, n_placebo=500, n_plants=40,
                                    signal_is_state=True, notes=note)
    return out


# ── canaries on the real labels ──────────────────────────────────────────────────────────────────────────────

def canary(V, lab, R, res_map4):
    dates = lab["date"]
    early = labels_at(V, dates, shift_days=35)
    rev = labels_revised(V, dates)
    m = lab.merge(early[["date", "label"]].rename(columns={"label": "label_early"}), on="date").merge(rev, on="date")
    m = m[m["label"].notna()]
    agree_early = float((m["label"] == m["label_early"]).mean())
    agree_rev = float((m["label"] == m["label_rev"]).mean())
    out = {"share_labels_same_if_released_35d_earlier": agree_early,
           "share_labels_same_with_revised_data_1m_lag": agree_rev, "estimates": {}}
    for col, nm in (("label_early", "released_35d_earlier"), ("label_rev", "revised_data")):
        R2 = R.drop(columns=["label"]).merge(m[["date", col]].rename(columns={col: "label"}), on="date")
        for g in ("usd", "gold", "indices"):
            c = Cell(R2, {"id": f"canary_{g}", "arm": "map", "group": g, "h": 4, "def": "primary"}, "label")
            out["estimates"].setdefault(nm, {})[g] = c.est()
    out["estimates"]["point_in_time"] = {g: res_map4[g] for g in res_map4}
    out["flag_revised_data_differs"] = bool(agree_rev < 0.99)
    out["flag_early_release_changes_labels"] = bool(agree_early < 0.99)
    return out


# ── self-test ────────────────────────────────────────────────────────────────────────────────────────────────

def synth_world(rng, effect, n_weeks=1000, stay=0.93):
    dates = pd.date_range("2007-01-05", periods=n_weeks, freq="W-FRI")
    q = np.zeros(n_weeks, int); q[0] = rng.integers(4)
    for t in range(1, n_weeks):
        q[t] = q[t - 1] if rng.random() < stay else rng.integers(4)
    lab = pd.DataFrame({"date": dates, "label": [QUADS[k] for k in q], "label_s2": [QUADS[k] for k in np.roll(q, 3)]})
    rows = []
    for g, insts in GROUPS.items():
        side_w = np.array([MAP[g][QUADS[k]] for k in q], float)
        common = rng.normal(size=n_weeks)
        for inst, _ in insts:
            wk = 0.6 * common + 0.8 * rng.normal(size=n_weeks) + effect * side_w + 0.05   # weekly z with drift
            cs = np.r_[0, np.cumsum(wk)]
            for h in HORIZONS:
                z = np.full(n_weeks, np.nan)
                z[: n_weeks - h] = (cs[h + 1: n_weeks + 1] - cs[1: n_weeks - h + 1]) / math.sqrt(h)
                rows.append(pd.DataFrame({"date": dates, "group": g, "inst": inst, "h": h, "z": z}))
    R = pd.concat(rows, ignore_index=True).dropna().merge(lab, on="date")
    return R


def run_cells(R, rng, B, n_plc, n_plant, only=None):
    res, cells = [], {}
    for spec in CELLS:
        if only and spec["id"] not in only:
            continue
        c = Cell(R, spec, "label" if spec["def"] == "primary" else "label_s2")
        cells[spec["id"]] = c
        res.append(score_cell(c, rng, B, n_plc, n_plant))
    verdicts(res)
    return res, cells


def selftest():
    rng = np.random.default_rng(SEED)
    ok = True
    # 1. snapshot = first print until the revision is published; nothing before the first print
    v = pd.DataFrame({"date": pd.to_datetime(["2020-01-01", "2020-01-01", "2020-02-01"]),
                      "rs": pd.to_datetime(["2020-02-07", "2020-03-06", "2020-03-06"]), "value": [100.0, 120.0, 50.0]})
    s1, s2, s0 = snapshot(v, pd.Timestamp("2020-02-20")), snapshot(v, pd.Timestamp("2020-03-10")), snapshot(v, pd.Timestamp("2020-02-07"))
    t1 = (s1.iloc[-1] == 100.0 and len(s1) == 1) and (s2[pd.Period("2020-01", "M")] == 120.0) and s0.empty
    print(f"[snapshot] first print before revision, revised after, nothing on release day itself: {'PASS' if t1 else 'FAIL'}")
    ok &= t1
    # 2. planted world: the tilt must be found (4w map cells VALIDATED or at least significant)
    only = {"map_usd_4w", "map_gold_4w", "map_indices_4w", "map_indices_1w", "trans_indices_4w", "xfit_indices_4w", "s2map_indices_4w"}
    R = synth_world(rng, effect=0.25)
    res, _ = run_cells(R, rng, B=300, n_plc=200, n_plant=5, only=only)
    for r in res:
        print(f"[planted 0.25/wk] {r['cell']:18s} est {r['estimate']:+.3f} [{r['ci'][0]:+.3f},{r['ci'][1]:+.3f}] "
              f"plc97.5 {r['placebo_p97_5']:+.3f} -> {r['verdict']}")
    t2 = all(r["ci"][0] > 0 for r in res if r["cell"] in ("map_usd_4w", "map_gold_4w", "map_indices_4w", "xfit_indices_4w"))
    t2 &= sum(r["verdict"] == "validated" for r in res) >= 3
    print(f"[planted] map/crossfit cells find the tilt, >=3 VALIDATED: {'PASS' if t2 else 'FAIL'}")
    ok &= t2
    # 3. zero world: nothing VALIDATED
    R0 = synth_world(np.random.default_rng(SEED + 1), effect=0.0)
    res0, _ = run_cells(R0, rng, B=300, n_plc=200, n_plant=5, only=only)
    for r in res0:
        print(f"[zero world]      {r['cell']:18s} est {r['estimate']:+.3f} [{r['ci'][0]:+.3f},{r['ci'][1]:+.3f}] -> {r['verdict']}")
    t3 = not any(r["verdict"] == "validated" for r in res0)
    print(f"[zero world] nothing VALIDATED (drift 0.05/wk present, removed by B0 demeaning): {'PASS' if t3 else 'FAIL'}")
    ok &= t3
    # 4. look-ahead canary on a synthetic vintage table: shifting release dates earlier must change some labels
    #    (tested in the real run on the real vintages; here the snapshot must move when rs moves)
    vv = v.copy(); vv["rs"] = vv["rs"] - pd.Timedelta(days=35)
    t4 = snapshot(vv, pd.Timestamp("2020-02-20"))[pd.Period("2020-01", "M")] == 120.0
    print(f"[canary] release dates 35d earlier -> revised value leaks into the earlier snapshot: {'PASS' if t4 else 'FAIL'}")
    ok &= bool(t4)
    print("SELFTEST", "PASSED" if ok else "FAILED")
    return ok


# ── main ─────────────────────────────────────────────────────────────────────────────────────────────────────

def build_labels(V):
    cache = OUT / "_cache" / "labels.parquet"
    grid = fridays()
    if cache.exists():
        lab = pd.read_parquet(cache)
        if len(lab) == len(grid):
            return lab
    t0 = time.time()
    lab = labels_at(V, grid)
    lab.to_parquet(cache, index=False)
    print(f"labels built in {time.time() - t0:.0f}s")
    return lab


def describe_labels(lab):
    l = lab[lab["label"].notna()]
    sp = (l["label"] != l["label"].shift()).cumsum()
    runs = l.groupby(sp).size()
    stale = (l["date"].dt.to_period("M") - pd.PeriodIndex(l["month"], freq="M")).apply(lambda x: x.n)
    return {"first": str(l["date"].min().date()), "n_fridays": int(len(l)),
            "share": l["label"].value_counts(normalize=True).round(3).to_dict(),
            "n_spells": int(len(runs)), "median_spell_weeks": float(runs.median()),
            "label_month_age_months": stale.value_counts().sort_index().to_dict(),
            "agree_primary_s2": float((l["label"] == l["label_s2"]).mean())}


def main_power():
    V = load_vintages()
    lab = build_labels(V)
    print(json.dumps(describe_labels(lab), indent=1, default=str))
    R = outcome_rows(lab)
    rng = np.random.default_rng([SEED, 7])
    print(f"\nZ for MDE (Holm worst case over {N_CELLS} cells, 80% power) = {Z_MDE:.2f}")
    print(f"{'cell':20s} {'n_dates':>7s} {'plc_sd':>7s} {'MDE':>6s} {'bar':>6s} {'large':>6s}")
    table = []
    for spec in CELLS:
        c = Cell(R, spec, "label" if spec["def"] == "primary" else "label_s2")
        plc = c.circ_placebo(300, rng)
        sd = float(np.nanstd(plc, ddof=1))
        row = {"cell": spec["id"], "n_dates": len(c.dates), "placebo_sd": sd, "mde": Z_MDE * sd,
               "bar": bar_for(spec["h"]), "large": bar_for(spec["h"], IR_LARGE)}
        table.append(row)
        print(f"{spec['id']:20s} {row['n_dates']:7d} {sd:7.3f} {row['mde']:6.3f} {row['bar']:6.3f} {row['large']:6.3f}")
    (OUT / "power.json").write_text(json.dumps({"z_mde": Z_MDE, "cells": table, "labels": describe_labels(lab)}, indent=1, default=str))


def main_run():
    V = load_vintages()
    lab = build_labels(V)
    R = outcome_rows(lab)
    rng = np.random.default_rng([SEED, 1])
    res, cells = run_cells(R, rng, B=2000, n_plc=1000, n_plant=40)
    for r in res:
        print(f"{r['cell']:18s} est {r['estimate']:+.3f} [{r['ci'][0]:+.3f},{r['ci'][1]:+.3f}] p_holm {r['p_holm']:.3f} "
              f"MDE {r['mde']:.3f} bar {r['bar']:.3f} plant@MDE {r['plant_mde_detected']:.2f} @bar {r['plant_bar_detected']:.2f} -> {r['verdict']}")
    res_map4 = {r["group"]: r["estimate"] for r in res if r["arm"] == "map" and r["h"] == 4 and r["def"] == "primary"}
    can = canary(V, lab, R, res_map4)
    print(json.dumps(can, indent=1))
    # descriptive: per-quadrant demeaned mean z by group, 4w (the old table, honestly built)
    desc = {}
    for g in ("usd", "gold", "indices"):
        c = cells[f"map_{g}_4w"]
        zd = c.zdm(np.ones(len(c.z))); q = c.qcode_by_date[c.didx]
        desc[g] = {}
        for k, qq in enumerate(QUADS):
            m = q == k
            if m.sum() == 0:
                continue
            W = np.random.default_rng([SEED, 9, k]).multinomial(len(c.cl_codes), np.full(len(c.cl_codes), 1 / len(c.cl_codes)), size=1000)
            bs = []
            for b in range(1000):
                w = W[b][c.cl] * m
                bs.append((w * zd).sum() / w.sum() if w.sum() > 0 else np.nan)
            desc[g][qq] = {"n_dates": int(len(np.unique(c.didx[m]))), "mean_z_dm": float(zd[m].mean()),
                           "ci": [float(np.nanpercentile(bs, 2.5)), float(np.nanpercentile(bs, 97.5))]}
    pk = packs(cells, res)
    for r in res:
        if r["cell"] in pk:
            r["evidence_label"] = pk[r["cell"]]["diagnosis"]["label"]
            r["evidence_pack"] = f"analysis/output/{SLUG}/{r['cell']}/evidence/EVIDENCE.md"
    try:
        commit = subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, text=True).strip()
    except Exception:
        commit = None
    out = {"slug": SLUG, "prereg": PREREG, "prereg_commit": PREREG_COMMIT, "seed": SEED, "branch": BRANCH, "code_commit_at_run": commit,
           "lockbox_last_price": str(LOCKBOX_LAST.date()), "n_cells_holm": N_CELLS, "z_mde": Z_MDE,
           "labels": describe_labels(lab), "cells": res, "canary": can, "per_quadrant_4w": desc}
    (OUT / "results.json").write_text(json.dumps(out, indent=1, default=float))
    print("wrote", OUT / "results.json")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--power", action="store_true")
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True); CACHE.mkdir(parents=True, exist_ok=True)
    if a.fetch:
        fetch_all()
    elif a.selftest:
        sys.exit(0 if selftest() else 1)
    elif a.power:
        main_power()
    else:
        main_run()
