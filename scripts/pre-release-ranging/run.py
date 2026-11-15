"""pre-release-ranging: does the market range before a tier-1 US release?

Prereg: forge/PRE_RELEASE_RANGING_PREREG.md. Seed 20261115. Read-only on local files; never R2 (R2_* unset below).

Modes
  python -X utf8 -I scripts/pre-release-ranging/run.py --selftest   planted compression recovered; null not flagged
  python -X utf8 -I scripts/pre-release-ranging/run.py --power      control-only power table (reads NO event outcome)
  python -X utf8 -I scripts/pre-release-ranging/run.py              the registered run + evidence packs

Unit of analysis: one (instrument, London date). Windows in London clock minutes:
  Asia [00:00, 07:00), day [07:00, 21:00), pre [07:00, T), post [T, 21:00), T = the release minute (London).
Outcomes (prereg §3): share = pre range / day range; pre_sig = pre range / open07 / sigma; brk = 1 if the pre
window trades beyond the Asia high or low; post_sig likewise. Each event / pseudo-event row is compared with the mean of
its K=4 matched controls (same instrument, same weekday, +-10 weeks, nearest point-in-time sigma, not a tier-1 day)
evaluated at the SAME London clock T. "Compression" = control - row (positive = narrower / less than matched).
Scored statistic per cell = mean compression on event rows - mean compression on pseudo-event rows (DiD), pooled over
instruments, date-cluster bootstrap.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import subprocess
import sys
from pathlib import Path
from statistics import NormalDist

for _k in list(os.environ):
    if _k.startswith("R2_"):
        del os.environ[_k]
os.environ.setdefault("OMP_NUM_THREADS", "2")

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SLUG = "pre-release-ranging"
OUT = ROOT / "analysis" / "output" / SLUG
PREREG = "forge/PRE_RELEASE_RANGING_PREREG.md"
PREREG_COMMIT = "76c66710"
BRANCH = "claude/signal-bot-bias-analysis-bwr1qv"
SEED = 20261115
LOCKBOX_LAST = "2026-08-21"
HALF_SPLIT = "2022-01-01"
M1_DIR = ROOT / "VolRangeForecaster" / "data" / "m1"
EVENTS = ROOT / "analysis" / "output" / "post-release-drift-pooled" / "events.parquet"
SIGMA_MJS = ROOT / "scripts" / "post-release-drift-pooled" / "sigma.mjs"
INSTRUMENTS = ("gold", "eurusd", "gbpusd", "usdjpy", "nq", "spx500")
LONDON, NEWYORK = "Europe/London", "America/New_York"

ASIA = (0, 420)
DAY = (420, 1260)
K_CTRL, WEEKS, MIN_CTRL = 4, 10, 2
COV_DAY, COV_ASIA, COV_WIN = 0.80, 0.60, 0.80
PSEUDO_MULT = 2
CELLS = ("A_share", "B_pre_sigma", "C_asia_break", "D_coiling")
# Pass bars, fixed in the prereg §5 (B's bar = 10% of the control mean pre-range, from the --power run).
BARS = {"A_share": 0.05, "B_pre_sigma": None, "C_asia_break": 0.08, "D_coiling": 0.15}
BAR_FILE = HERE / "bars.json"


# ── loading ───────────────────────────────────────────────────────────────────────────────────────────────────

def lockbox_end_utc() -> pd.Timestamp:
    return (pd.Timestamp(LOCKBOX_LAST) + pd.Timedelta(days=1)).tz_localize(LONDON).tz_convert("UTC")


def load_m1(inst: str) -> pd.DataFrame:
    import pyarrow.parquet as pq
    t = pq.read_table(M1_DIR / f"{inst}_m1.parquet")
    df = t.to_pandas(ignore_metadata=True)
    tcol = "datetime" if "datetime" in df.columns else "time"
    idx = pd.to_datetime(df[tcol], utc=True)
    df = df[["open", "high", "low", "close"]].astype(float)
    df.index = pd.DatetimeIndex(idx)
    df = df[~df.index.duplicated(keep="first")].sort_index()
    assert df.index[0].year >= 2000, f"{inst}: 1970 timestamps (BAM fault)"
    df = df[df.index < lockbox_end_utc()]
    last = df.index[-1].tz_convert(LONDON).date()
    assert str(last) <= LOCKBOX_LAST, f"{inst}: bar after lockbox {last}"
    return df


def ny_close_daily(df: pd.DataFrame) -> pd.DataFrame:
    """js/voteAtlasV4Lines.js nyCloseDailyBars port: key = date of (NY time + 7h); n >= 60; weekdays."""
    key = (df.index.tz_convert(NEWYORK) + pd.Timedelta(hours=7)).tz_localize(None).normalize()
    g = df.groupby(key, sort=True)
    d = pd.DataFrame({"open": g["open"].first(), "high": g["high"].max(), "low": g["low"].min(),
                      "close": g["close"].last(), "n": g["close"].size()})
    return d[(d["n"] >= 60) & (d.index.dayofweek < 5)]


def sigma_series(df: pd.DataFrame, inst: str, workdir: Path) -> pd.DataFrame:
    """Point-in-time HAR-800 (shipped js/forecastSigma.js 'har_rv_log') and sigma60. Row key k holds the forecast made
    at the close of bar k (for bar k+1)."""
    d = ny_close_daily(df)
    workdir.mkdir(parents=True, exist_ok=True)
    fin, fout = workdir / f"_d1_{inst}.json", workdir / f"_sig_{inst}.json"
    fin.write_text(json.dumps({"window": 800, "minBars": 250, "bars": [
        {"open": a, "high": b, "low": c, "close": e} for a, b, c, e in d[["open", "high", "low", "close"]].to_numpy().tolist()]}))
    r = subprocess.run(["node", str(SIGMA_MJS), str(fin), str(fout)], capture_output=True, text=True, cwd=ROOT)
    if r.returncode != 0:
        raise RuntimeError(f"sigma.mjs failed for {inst}: {r.stderr[-1500:]}")
    har = np.array([np.nan if v is None else v for v in json.loads(fout.read_text())], dtype=float)
    fin.unlink(missing_ok=True); fout.unlink(missing_ok=True)
    lr = np.log(d["close"]).diff()
    s60 = np.sqrt((lr ** 2).rolling(60, min_periods=60).mean()).to_numpy()
    return pd.DataFrame({"key": d.index, "sig": har, "sig60": s60})


def sigma_for_dates(sig: pd.DataFrame, dates: pd.DatetimeIndex) -> pd.DataFrame:
    """sigma known before London session d: the forecast made at the last NY-close bar with key < d
    (that bar closed 17:00 NY on d-1 = 22:00 London, before the 00:00 London start)."""
    keys = sig["key"].to_numpy()
    i = np.searchsorted(keys, dates.to_numpy(), "left") - 1
    ok = i >= 0
    out = pd.DataFrame(index=dates, data={"sig": np.nan, "sig60": np.nan})
    out.loc[ok, "sig"] = sig["sig"].to_numpy()[i[ok]]
    out.loc[ok, "sig60"] = sig["sig60"].to_numpy()[i[ok]]
    return out


def to_london_minutes(df: pd.DataFrame) -> pd.DataFrame:
    loc = df.index.tz_convert(LONDON)
    out = df.copy()
    out["ldate"] = loc.tz_localize(None).normalize()
    out["lmin"] = loc.hour * 60 + loc.minute
    out = out[(out["lmin"] < DAY[1]) & (out["ldate"].dt.dayofweek < 5)]
    return out.reset_index(drop=True)


# ── per-date window statistics ──────────────────────────────────────────────────────────────────────────────

def day_grid(lm: pd.DataFrame):
    """dates x 1260 minute arrays of high/low (NaN = no bar) + open at/after 07:00."""
    dates = pd.DatetimeIndex(np.sort(lm["ldate"].unique()))
    di = np.searchsorted(dates.to_numpy(), lm["ldate"].to_numpy())
    mi = lm["lmin"].to_numpy()
    H = np.full((len(dates), DAY[1]), np.nan); L = np.full_like(H, np.nan); O = np.full_like(H, np.nan)
    H[di, mi] = lm["high"].to_numpy(); L[di, mi] = lm["low"].to_numpy(); O[di, mi] = lm["open"].to_numpy()
    return dates, H, L, O


def window_stats(H, L, O, clocks):
    """Per date, per clock T: ranges and coverage; vectorised over dates."""
    n = H.shape[0]
    with np.errstate(all="ignore"):
        asia_h = np.nanmax(H[:, ASIA[0]:ASIA[1]], axis=1); asia_l = np.nanmin(L[:, ASIA[0]:ASIA[1]], axis=1)
        asia_n = np.isfinite(H[:, ASIA[0]:ASIA[1]]).sum(1)
        dH, dL = H[:, DAY[0]:DAY[1]], L[:, DAY[0]:DAY[1]]
        day_h = np.nanmax(dH, axis=1); day_l = np.nanmin(dL, axis=1); day_n = np.isfinite(dH).sum(1)
        # open07: open of first bar at/after 07:00
        fin = np.isfinite(O[:, DAY[0]:DAY[1]])
        first = np.where(fin.any(1), fin.argmax(1), -1)
        open07 = np.where(first >= 0, O[np.arange(n), DAY[0] + np.maximum(first, 0)], np.nan)
        cumH = np.fmax.accumulate(np.where(np.isfinite(dH), dH, -np.inf), axis=1)
        cumL = np.fmin.accumulate(np.where(np.isfinite(dL), dL, np.inf), axis=1)
        revH = np.fmax.accumulate(np.where(np.isfinite(dH), dH, -np.inf)[:, ::-1], axis=1)[:, ::-1]
        revL = np.fmin.accumulate(np.where(np.isfinite(dL), dL, np.inf)[:, ::-1], axis=1)[:, ::-1]
        cnt = np.cumsum(fin, axis=1)
    base = {"asia_h": asia_h, "asia_l": asia_l, "asia_n": asia_n, "day_h": day_h, "day_l": day_l, "day_n": day_n,
            "open07": open07}
    per = {}
    for T in clocks:
        j = T - DAY[0]                                   # pre = [0, j), post = [j, 840)
        pre_h, pre_l = cumH[:, j - 1], cumL[:, j - 1]
        post_h, post_l = revH[:, j], revL[:, j]
        pre_n = cnt[:, j - 1]; post_n = cnt[:, -1] - cnt[:, j - 1]
        per[T] = {"pre_h": pre_h, "pre_l": pre_l, "post_h": post_h, "post_l": post_l, "pre_n": pre_n, "post_n": post_n}
    return base, per


def outcomes_at(base, per, rows_idx, T, sig):
    """Outcome vectors for date indices rows_idx at clock T. Invalid (coverage / sigma) -> NaN."""
    b = {k: v[rows_idx] for k, v in base.items()}
    p = {k: v[rows_idx] for k, v in per[T].items()}
    s = sig[rows_idx]
    jlen = T - DAY[0]
    ok = ((b["day_n"] >= COV_DAY * (DAY[1] - DAY[0])) & (b["asia_n"] >= COV_ASIA * (ASIA[1] - ASIA[0]))
          & (p["pre_n"] >= COV_WIN * jlen) & (p["post_n"] >= COV_WIN * (DAY[1] - T))
          & np.isfinite(s) & (s > 0) & np.isfinite(b["open07"]) & np.isfinite(b["asia_h"]))
    with np.errstate(all="ignore"):
        pre_r = p["pre_h"] - p["pre_l"]; post_r = p["post_h"] - p["post_l"]; day_r = b["day_h"] - b["day_l"]
        o = {"share": pre_r / day_r,
             "pre_sig": pre_r / b["open07"] / s,
             "post_sig": post_r / b["open07"] / s,
             "day_sig": day_r / b["open07"] / s,
             "brk": ((p["pre_h"] > b["asia_h"]) | (p["pre_l"] < b["asia_l"])).astype(float)}
    ok &= day_r > 0
    for k in o:
        o[k] = np.where(ok, o[k], np.nan)
    return o


# ── matching ────────────────────────────────────────────────────────────────────────────────────────────────

def match_controls(dates: pd.DatetimeIndex, sig: np.ndarray, target_idx: int, excluded: np.ndarray,
                   valid_at_T: np.ndarray) -> np.ndarray:
    """Prereg §3.5: same instrument, same weekday, within +-WEEKS weeks, not an excluded date (tier-1 day or the
    target), valid at T; K nearest by |log sigma ratio|, ties to the nearer week. Returns date indices."""
    d0 = dates[target_idx]
    cands = d0 + pd.to_timedelta(7 * np.r_[np.arange(-WEEKS, 0), np.arange(1, WEEKS + 1)], unit="D")
    pos = np.searchsorted(dates.to_numpy(), cands.to_numpy())
    pos = pos[(pos < len(dates))]
    pos = pos[dates[pos].isin(cands)]
    pos = pos[~excluded[pos] & valid_at_T[pos] & (pos != target_idx)]
    if len(pos) < MIN_CTRL or not np.isfinite(sig[target_idx]):
        return np.array([], dtype=int)
    dist = np.abs(np.log(sig[pos] / sig[target_idx]))
    wk = np.abs((dates[pos] - d0).days.to_numpy())
    order = np.lexsort((wk, dist))
    return pos[order[:K_CTRL]]


def build_rows(inst, dates, base, per, sig_main, targets, tier1_mask, side, sig_alt=None):
    """targets: list of (date_index, clock T, family). Returns a DataFrame of event/pseudo rows with matched
    control means."""
    out = []
    valid_cache = {}
    for di, T, fam in targets:
        if T not in valid_cache:
            o_all = outcomes_at(base, per, np.arange(len(dates)), T, sig_main)
            valid_cache[T] = (o_all, np.isfinite(o_all["pre_sig"]))
        o_all, valid = valid_cache[T]
        if not valid[di]:
            continue
        excl = tier1_mask.copy(); excl[di] = True
        ctrl = match_controls(dates, sig_main, di, excl, valid)
        if len(ctrl) < MIN_CTRL:
            continue
        r = {"date": dates[di], "inst": inst, "side": side, "family": fam, "T": T, "n_ctrl": len(ctrl),
             "sig": sig_main[di], "ctrl_sig_ratio": float(np.mean(sig_main[ctrl]) / sig_main[di])}
        for k in ("share", "pre_sig", "post_sig", "day_sig", "brk"):
            r[k] = float(o_all[k][di]); r["c_" + k] = float(np.mean(o_all[k][ctrl]))
        if sig_alt is not None and np.isfinite(sig_alt[di]) and np.all(np.isfinite(sig_alt[ctrl])):
            r["pre_sig60"] = r["pre_sig"] * sig_main[di] / sig_alt[di]
            r["c_pre_sig60"] = float(np.mean(o_all["pre_sig"][ctrl] * sig_main[ctrl] / sig_alt[ctrl]))
        out.append(r)
    return pd.DataFrame(out)


def derive(rows: pd.DataFrame) -> pd.DataFrame:
    r = rows.copy()
    r["comp_share"] = r["c_share"] - r["share"]
    r["comp_pre"] = r["c_pre_sig"] - r["pre_sig"]
    r["comp_brk"] = r["c_brk"] - r["brk"]
    r["post_x"] = r["post_sig"] - r["c_post_sig"]
    if "pre_sig60" in r:
        r["comp_pre60"] = r["c_pre_sig60"] - r["pre_sig60"]
    return r


# ── statistics ──────────────────────────────────────────────────────────────────────────────────────────────

def _spearman(x, y):
    if len(x) < 10:
        return np.nan
    rx = pd.Series(x).rank().to_numpy(); ry = pd.Series(y).rank().to_numpy()
    return float(np.corrcoef(rx, ry)[0, 1])


def est_mean_did(col):
    def f(r):
        a = r.loc[r["side"] == 1, col]; b = r.loc[r["side"] == -1, col]
        if len(a) == 0 or len(b) == 0:
            return np.nan
        return float(a.mean() - b.mean())
    return f


def est_coil(r):
    a = r[r["side"] == 1]; b = r[r["side"] == -1]
    return _spearman(b["pre_sig"].to_numpy(), b["post_sig"].to_numpy()) - _spearman(a["pre_sig"].to_numpy(), a["post_sig"].to_numpy())


ESTIMATORS = {"A_share": est_mean_did("comp_share"), "B_pre_sigma": est_mean_did("comp_pre"),
              "C_asia_break": est_mean_did("comp_brk"), "D_coiling": est_coil}
OUTCOME_COL = {"A_share": "comp_share", "B_pre_sigma": "comp_pre", "C_asia_break": "comp_brk", "D_coiling": "post_sig"}


def cluster_boot_fast(r: pd.DataFrame, cell: str, B: int, rng) -> np.ndarray:
    """Date-cluster bootstrap via multinomial cluster weights (vectorised)."""
    dates, inv = np.unique(r["date"].to_numpy(), return_inverse=True)
    nC = len(dates)
    W = rng.multinomial(nC, np.full(nC, 1.0 / nC), size=B).astype(float)          # B x nC
    side = r["side"].to_numpy()
    def agg(v, mask):
        return np.bincount(inv[mask], weights=v[mask], minlength=nC)
    if cell != "D_coiling":
        y = r[OUTCOME_COL[cell]].to_numpy()
        m1, m0 = side == 1, side == -1
        s1, c1 = agg(y, m1), agg(np.ones_like(y), m1)
        s0, c0 = agg(y, m0), agg(np.ones_like(y), m0)
        with np.errstate(all="ignore"):
            return (W @ s1) / (W @ c1) - (W @ s0) / (W @ c0)
    res = []
    for sd in (-1, 1):
        m = side == sd
        x = pd.Series(r["pre_sig"].to_numpy()[m]).rank().to_numpy(); y = pd.Series(r["post_sig"].to_numpy()[m]).rank().to_numpy()
        ii = inv[m]
        S = [np.bincount(ii, weights=w, minlength=nC) for w in (np.ones_like(x), x, y, x * x, y * y, x * y)]
        n, sx, sy, sxx, syy, sxy = (W @ s for s in S)
        cov = sxy / n - (sx / n) * (sy / n)
        vx = sxx / n - (sx / n) ** 2; vy = syy / n - (sy / n) ** 2
        res.append(cov / np.sqrt(vx * vy))
    return res[0] - res[1]


def p_from_boot(est, boots):
    se = np.nanstd(boots, ddof=1)
    if not np.isfinite(se) or se == 0:
        return 1.0, se
    return float(2 * (1 - NormalDist().cdf(abs(est) / se))), float(se)


def holm(p):
    p = np.asarray(p, float); m = len(p); order = np.argsort(p); adj = np.empty(m); run = 0
    for k, i in enumerate(order):
        run = max(run, min(1.0, (m - k) * p[i])); adj[i] = run
    return adj


def label_shuffle(r: pd.DataFrame, cell: str, rng, n: int) -> np.ndarray:
    """Permute event/pseudo labels across DATES (all instruments of a date move together)."""
    est = ESTIMATORS[cell]
    dates, inv = np.unique(r["date"].to_numpy(), return_inverse=True)
    dside = pd.Series(r["side"].to_numpy()).groupby(inv).first().to_numpy()
    out = []
    for _ in range(n):
        perm = rng.permutation(dside)
        rr = r.assign(side=perm[inv])
        out.append(est(rr))
    return np.asarray(out)


# ── the pipeline ───────────────────────────────────────────────────────────────────────────────────────────

def load_events():
    ev = pd.read_parquet(EVENTS)
    ev["lt"] = ev["t"].dt.tz_convert(LONDON)
    ev["ldate"] = ev["lt"].dt.tz_localize(None).dt.normalize()
    ev["lmin"] = ev["lt"].dt.hour * 60 + ev["lt"].dt.minute
    tier1_all = pd.DatetimeIndex(ev["ldate"].unique())
    ev = ev.sort_values("t").groupby("ldate", as_index=False).first()          # first release of the day
    ev = ev[(ev["ldate"] <= pd.Timestamp(LOCKBOX_LAST)) & (ev["ldate"].dt.dayofweek < 5)]
    return ev[["ldate", "lmin", "family", "t"]].reset_index(drop=True), tier1_all


def prepare_instrument(inst, workdir):
    df = load_m1(inst)
    sig = sigma_series(df, inst, workdir)
    lm = to_london_minutes(df)
    dates, H, L, O = day_grid(lm)
    s = sigma_for_dates(sig, dates)
    return dates, H, L, O, s["sig"].to_numpy(), s["sig60"].to_numpy()


def pseudo_targets(all_dates: pd.DatetimeIndex, tier1: pd.DatetimeIndex, ev: pd.DataFrame, rng):
    """Prereg §3.6: 2x event dates drawn without replacement from non-tier-1 weekdays in the event span; each takes the
    London clock of a randomly drawn real event (its family label too, for bookkeeping)."""
    pool = all_dates[(~all_dates.isin(tier1)) & (all_dates >= ev["ldate"].min()) & (all_dates <= ev["ldate"].max())]
    n = min(len(pool), PSEUDO_MULT * len(ev))
    pick = np.sort(rng.choice(len(pool), n, replace=False))
    src = rng.integers(0, len(ev), n)
    return pd.DataFrame({"ldate": pool[pick], "lmin": ev["lmin"].to_numpy()[src], "family": "pseudo"})


def collect(instdata: dict, ev: pd.DataFrame, tier1: pd.DatetimeIndex, rng, include_events=True):
    all_dates = pd.DatetimeIndex(sorted(set().union(*[set(v[0]) for v in instdata.values()])))
    ps = pseudo_targets(all_dates, tier1, ev, rng)
    clocks = sorted(set(ev["lmin"]) | set(ps["lmin"]))
    rows = []
    for inst, (dates, H, L, O, sig, sig60) in instdata.items():
        base, per = window_stats(H, L, O, clocks)
        tmask = dates.isin(tier1)
        dpos = {d: i for i, d in enumerate(dates)}
        def tg(frame):
            return [(dpos[d], int(T), f) for d, T, f in zip(frame["ldate"], frame["lmin"], frame["family"]) if d in dpos]
        if include_events:
            rows.append(build_rows(inst, dates, base, per, sig, tg(ev), tmask, +1, sig60))
        rows.append(build_rows(inst, dates, base, per, sig, tg(ps), tmask, -1, sig60))
    r = pd.concat([x for x in rows if len(x)], ignore_index=True)
    return derive(r), ps


def assert_no_lockbox(r):
    assert r["date"].max() <= pd.Timestamp(LOCKBOX_LAST), "row after the lockbox"


# ── power (control-only) ──────────────────────────────────────────────────────────────────────────────────

def power_mode(instdata, ev, tier1, rng):
    """Reads NO event outcome: pseudo rows only. SE of each cell's DiD approximated by splitting the pseudo rows
    into two random date halves of sizes n_event_dates and n_pseudo_dates - n_event... (here: label shuffle among
    pseudo dates with the registered event:pseudo ratio)."""
    r, _ = collect(instdata, ev, tier1, rng, include_events=False)
    assert_no_lockbox(r)
    n_ev_dates = len(ev)
    pd_dates = np.unique(r["date"])
    out = {"n_event_dates_planned": int(n_ev_dates), "n_pseudo_dates": int(len(pd_dates)),
           "control_mean_pre_sig": float(r["c_pre_sig"].mean()), "control_mean_share": float(r["c_share"].mean()),
           "control_mean_brk": float(r["c_brk"].mean()), "cells": {}}
    # fake split: a random third of pseudo dates relabelled +1 (event-sized group), DiD distribution over 400 draws
    frac = n_ev_dates / (n_ev_dates + len(pd_dates))
    for cell in CELLS:
        vals = []
        for _ in range(300):
            lab = np.where(rng.random(len(pd_dates)) < frac, 1, -1)
            m = dict(zip(pd_dates, lab))
            rr = r.assign(side=r["date"].map(m).to_numpy())
            vals.append(ESTIMATORS[cell](rr))
        sd = float(np.nanstd(vals, ddof=1))
        # the fake split has n_pseudo total dates; the real run has n_ev + n_pseudo dates -> rescale
        scale = math.sqrt(len(pd_dates) / (n_ev_dates + len(pd_dates)))
        se = sd * scale
        out["cells"][cell] = {"se_did": se, "mde_holm_0125": 3.34 * se, "fake_split_mean": float(np.nanmean(vals))}
    out["bar_B"] = round(0.10 * out["control_mean_pre_sig"], 3)
    return out


# ── evidence packs ────────────────────────────────────────────────────────────────────────────────────────

def run_packs(r, bars, verdicts, seed):
    sys.path.insert(0, str(ROOT / "scripts" / "evidence_pack"))
    from pack import build_pack
    packs = {}
    for cell in CELLS:
        rows = r.copy()
        rows["signal"] = rows["side"]
        rows["outcome"] = rows[OUTCOME_COL[cell]]
        rows["cluster"] = rows["date"].astype(str)
        rows = rows[np.isfinite(rows["outcome"])].reset_index(drop=True)
        est = ESTIMATORS[cell]
        if cell == "D_coiling":
            def plant(rr, e, g):
                rr = rr.copy(); m = rr["side"] == 1
                z = pd.Series(rr.loc[m, "pre_sig"]).rank().to_numpy()
                z = (z - z.mean()) / z.std()
                rr.loc[m, "post_sig"] = rr.loc[m, "post_sig"] - 1.15 * e * z * rr.loc[m, "post_sig"].std()
                rr["outcome"] = rr["post_sig"]
                return rr
        else:
            col = OUTCOME_COL[cell]
            def plant(rr, e, g, col=col):
                rr = rr.copy(); m = rr["side"] == 1
                rr.loc[m, col] = rr.loc[m, col] + e
                rr["outcome"] = rr[col]
                return rr
        def leak(rr, g):
            rr = rr.copy()
            rr["side"] = np.where(rr["post_x"] > rr["post_x"].median(), 1, -1)
            return rr
        note = ("Rows: event days (side +1) and pseudo-event non-release days (side -1); outcome = compression vs the "
                "row's own matched controls (control - row; positive = narrower / fewer breaks). Estimate = event mean - "
                "pseudo mean. Placebo = event/pseudo labels shuffled across dates. Leak canary: labels reassigned by the "
                "realised post-release range excess (top half = +1).") if cell != "D_coiling" else (
                "Rows as above; estimate = Spearman(pre, post) on pseudo days - Spearman(pre, post) on event days "
                "(positive = coiling: a tight pre-release range goes with a wider post-release range, beyond normal days). "
                "Plant adds a negative pre->post rank relation of about the bar on event rows.")
        packs[cell] = build_pack(rows, slug=f"{SLUG}/{cell}", out=str(OUT / cell), estimate_fn=est, bar=bars[cell],
                                 unit={"A_share": "share of day range", "B_pre_sigma": "daily sigma",
                                       "C_asia_break": "probability", "D_coiling": "Spearman rho"}[cell],
                                 plant_fn=plant, leak_fn=leak, verdict_word=verdicts[cell], seed=seed, B=1000,
                                 n_placebo=300 if cell == "D_coiling" else 500, n_plants=40, signal_is_state=True,
                                 notes=note)
    return packs


# ── scoring ───────────────────────────────────────────────────────────────────────────────────────────────

def score(r: pd.DataFrame, bars: dict, mdes: dict, seed: int, B: int = 2000, n_shuffle: int = 1000,
          half_split: str = HALF_SPLIT) -> dict:
    rng = np.random.default_rng([seed, 1])
    res = {}
    for cell in CELLS:
        est = ESTIMATORS[cell](r)
        boots = cluster_boot_fast(r, cell, B, rng)
        lo, hi = np.nanpercentile(boots, [2.5, 97.5])
        p, se = p_from_boot(est, boots)
        shuf = label_shuffle(r, cell, np.random.default_rng([seed, 2, CELLS.index(cell)]), n_shuffle)
        h1 = r[r["date"] < pd.Timestamp(half_split)]; h2 = r[r["date"] >= pd.Timestamp(half_split)]
        halves = [ESTIMATORS[cell](h1), ESTIMATORS[cell](h2)]
        by_inst = {i: ESTIMATORS[cell](g) for i, g in r.groupby("inst")}
        if cell != "D_coiling":
            col = OUTCOME_COL[cell]
            ev_rows = r[r["side"] == 1]; thr = ev_rows[col].abs().quantile(0.99)
            trimmed = pd.concat([ev_rows[ev_rows[col].abs() <= thr], r[r["side"] == -1]])
            top1 = ESTIMATORS[cell](trimmed)
            ev_only = float(r.loc[r["side"] == 1, col].mean()); ps_only = float(r.loc[r["side"] == -1, col].mean())
        else:
            top1 = np.nan
            ev_only = _spearman(r.loc[r["side"] == 1, "pre_sig"].to_numpy(), r.loc[r["side"] == 1, "post_sig"].to_numpy())
            ps_only = _spearman(r.loc[r["side"] == -1, "pre_sig"].to_numpy(), r.loc[r["side"] == -1, "post_sig"].to_numpy())
        res[cell] = {"est": float(est), "lo": float(lo), "hi": float(hi), "se": se, "p": p, "bar": bars[cell],
                     "mde": mdes.get(cell), "n_rows_event": int((r["side"] == 1).sum()),
                     "n_rows_pseudo": int((r["side"] == -1).sum()),
                     "n_dates_event": int(r.loc[r["side"] == 1, "date"].nunique()),
                     "shuffle_p97_5": float(np.nanpercentile(shuf, 97.5)), "shuffle_mean": float(np.nanmean(shuf)),
                     "shuffle_pct": float((shuf < est).mean() * 100), "halves": [float(h) for h in halves],
                     "by_inst": {k: float(v) for k, v in by_inst.items()}, "top1_removed": float(top1),
                     "event_only": ev_only, "pseudo_only": ps_only}
    padj = holm([res[c]["p"] for c in CELLS])
    for c, pa in zip(CELLS, padj):
        x = res[c]; x["holm_p"] = float(pa)
        same_inst = sum(1 for v in x["by_inst"].values() if np.isfinite(v) and v > 0)
        gate = {"c1_holm": pa < 0.05, "c2_bar": x["est"] >= x["bar"], "c3_shuffle": x["est"] > x["shuffle_p97_5"],
                "c4_halves": all(h > 0 for h in x["halves"]), "c5_insts": same_inst >= math.ceil(2 * len(x["by_inst"]) / 3),
                "c6_top1": (not np.isfinite(x["top1_removed"])) or x["top1_removed"] > 0}
        x["gate"] = gate; x["insts_positive"] = same_inst
        powered = x["mde"] is not None and x["mde"] <= x["bar"]
        if all(gate.values()):
            v = "validated"
        elif x["hi"] < x["bar"] and powered:
            v = "context" if (pa < 0.05 and x["est"] > 0) else "null"
        else:
            v = "underpowered"
        x["powered"] = powered; x["verdict"] = v
    return res


def apply_posctrl_rule(res: dict, packs: dict) -> None:
    """Prereg §5 (ii): a cell whose evidence pack detects the 1x-bar plant < 80% of the time is UNDERPOWERED whatever
    its CI says. (Added 2026-11-15 after the first run: the rule was registered but not coded; see prereg A1.)"""
    for c, p in packs.items():
        one = next((x for x in p["positive_control"] if x["multiple_of_bar"] == 1.0), None)
        res[c]["posctrl_1x_detected"] = None if one is None else one["detected_share"]
        if one is not None and one["detected_share"] < 0.8 and res[c]["verdict"] != "underpowered":
            res[c]["verdict_before_posctrl_rule"] = res[c]["verdict"]
            res[c]["verdict"] = "underpowered"


# ── self-test ─────────────────────────────────────────────────────────────────────────────────────────────

def synth(rng, n_days=900, n_inst=3, compress=0.0, post_mult=2.0):
    """Synthetic London-minute paths with a daily vol regime; events every ~7th business day at 13:30.
    compress: fractional cut of minute vol in [07:00, T) on event days (the planted effect)."""
    dates = pd.bdate_range("2017-01-02", periods=n_days)
    ev_idx = np.sort(rng.choice(np.arange(60, n_days), n_days // 7, replace=False))
    T = 810
    ev = pd.DataFrame({"ldate": dates[ev_idx], "lmin": T, "family": "SYN"})
    instdata = {}
    for k in range(n_inst):
        lv = np.zeros(n_days);
        for i in range(1, n_days):
            lv[i] = 0.97 * lv[i - 1] + 0.25 * rng.normal() * math.sqrt(1 - 0.97 ** 2)
        dvol = 0.008 * np.exp(lv)                                  # daily sigma
        mvol = np.repeat((dvol / math.sqrt(1440))[:, None], DAY[1], 1)
        prof = np.ones(DAY[1]); prof[420:1000] = 1.6; prof[:420] = 1.3       # intraday shape
        mvol = mvol * prof
        evm = np.zeros(n_days, bool); evm[ev_idx] = True
        mvol[np.ix_(evm, np.arange(420, T))] *= (1 - compress)
        mvol[np.ix_(evm, np.arange(T, min(T + 60, DAY[1])))] *= post_mult
        ret = rng.normal(size=mvol.shape) * mvol
        lp = np.cumsum(ret.ravel()).reshape(mvol.shape) + 7.0
        C = np.exp(lp); Op = np.exp(lp - ret); wig = np.abs(rng.normal(size=C.shape)) * mvol * 0.5
        H = np.maximum(C, Op) * np.exp(wig); L = np.minimum(C, Op) * np.exp(-wig)
        sig = np.r_[np.nan, dvol[:-1]] * np.exp(rng.normal(0, 0.15, n_days))   # noisy point-in-time sigma
        sig[:60] = np.nan
        instdata[f"syn{k}"] = (dates, H, L, Op, sig, sig)
    return instdata, ev, pd.DatetimeIndex(ev["ldate"])


def selftest():
    print("SELFTEST: planted 30% pre-release compression must be found (B, C); a no-compression world must not flag B/C.")
    ok = True
    for name, comp in (("planted", 0.30), ("null", 0.0)):
        rng = np.random.default_rng(SEED)
        instdata, ev, tier1 = synth(rng, compress=comp)
        r, _ = collect(instdata, ev, tier1, rng)
        bars = {"A_share": 0.05, "B_pre_sigma": 0.10 * float(r.loc[r["side"] == -1, "c_pre_sig"].mean()),
                "C_asia_break": 0.08, "D_coiling": 0.15}
        res = score(r, bars, {c: 0.0 for c in CELLS}, SEED, B=500, n_shuffle=200, half_split=str(r["date"].median().date()))
        for c in CELLS:
            x = res[c]
            print(f"  {name:8s} {c:13s} est {x['est']:+.4f} [{x['lo']:+.4f}, {x['hi']:+.4f}] bar {x["bar"]:.3f} -> {x["verdict"]} {[k for k,v in x["gate"].items() if not v]}")
        if name == "planted":
            ok &= res["B_pre_sigma"]["lo"] > 0 and res["B_pre_sigma"]["est"] > bars["B_pre_sigma"]
            ok &= res["C_asia_break"]["lo"] > 0
            ok &= res["B_pre_sigma"]["verdict"] == "validated"
        else:
            ok &= res["B_pre_sigma"]["lo"] <= 0 <= res["B_pre_sigma"]["hi"] or abs(res["B_pre_sigma"]["est"]) < 0.3 * bars["B_pre_sigma"]
            ok &= res["B_pre_sigma"]["verdict"] != "validated" and res["C_asia_break"]["verdict"] != "validated"
            ok &= res["D_coiling"]["verdict"] != "validated"
            print("  note: A_share in the null world measures the mechanical denominator effect of the post-release burst")
    print("SELFTEST", "PASSED" if ok else "FAILED")
    return ok


# ── main ──────────────────────────────────────────────────────────────────────────────────────────────────

def load_all(insts):
    workdir = OUT / "_work"
    data = {}
    for inst in insts:
        print("loading", inst, flush=True)
        data[inst] = prepare_instrument(inst, workdir)
    return data


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--power", action="store_true")
    ap.add_argument("--no-packs", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        sys.exit(0 if selftest() else 1)
    OUT.mkdir(parents=True, exist_ok=True)
    ev, tier1 = load_events()
    data = load_all(INSTRUMENTS)
    first_sig = max(pd.Timestamp(d[0][np.argmax(np.isfinite(d[4]))]) for d in data.values())
    ev = ev[ev["ldate"] >= first_sig].reset_index(drop=True)
    print(f"events in sample: {len(ev)} dates from {ev['ldate'].min().date()} to {ev['ldate'].max().date()}")
    if a.power:
        pw = power_mode(data, ev, tier1, np.random.default_rng([SEED, 0]))
        pw["sample_from"] = str(ev["ldate"].min().date()); pw["family_counts"] = ev["family"].value_counts().to_dict()
        (OUT / "power.json").write_text(json.dumps(pw, indent=1))
        print(json.dumps(pw, indent=1))
        return
    pw = json.loads((OUT / "power.json").read_text())
    bars = dict(BARS); bars["B_pre_sigma"] = pw["bar_B"]
    mdes = {c: pw["cells"][c]["mde_holm_0125"] for c in CELLS}
    r, ps = collect(data, ev, tier1, np.random.default_rng([SEED, 0]))
    assert_no_lockbox(r)
    r.to_parquet(OUT / "rows.parquet")
    res = score(r, bars, mdes, SEED)
    # descriptive
    desc = {"coverage": {"event_dates": int(len(ev)), "event_rows_scored": int((r.side == 1).sum()),
                         "event_rows_possible": int(len(ev) * len(INSTRUMENTS)),
                         "pseudo_rows_scored": int((r.side == -1).sum()),
                         "by_inst": r.groupby(["inst", "side"]).size().unstack().to_dict()},
            "means": r.groupby("side")[["share", "c_share", "pre_sig", "c_pre_sig", "post_sig", "c_post_sig",
                                         "day_sig", "c_day_sig", "brk", "c_brk", "ctrl_sig_ratio"]].mean().to_dict(),
            "by_family": {}, "by_inst_family": {}, "sigma60_B": None}
    for fam, g in r[r.side == 1].groupby("family"):
        sub = pd.concat([g, r[r.side == -1]])
        desc["by_family"][fam] = {c: ESTIMATORS[c](sub) for c in CELLS} | {"n_rows": int(len(g)),
                                  "pre_sig": float(g.pre_sig.mean()), "c_pre_sig": float(g.c_pre_sig.mean()),
                                  "share": float(g.share.mean()), "c_share": float(g.c_share.mean()),
                                  "brk": float(g.brk.mean()), "c_brk": float(g.c_brk.mean()),
                                  "post_sig": float(g.post_sig.mean()), "c_post_sig": float(g.c_post_sig.mean())}
    if "comp_pre60" in r:
        rr = r[np.isfinite(r["comp_pre60"])]
        desc["sigma60_B"] = est_mean_did("comp_pre60")(rr)
    # T relative: distribution of clocks
    desc["clocks"] = r[r.side == 1]["T"].value_counts().to_dict()
    # BH over per-instrument and per-family slices for B (disaggregation)
    verdicts = {c: res[c]["verdict"].upper() for c in CELLS}
    packs = {} if a.no_packs else run_packs(r, bars, verdicts, SEED)
    apply_posctrl_rule(res, packs)
    out = {"id": SLUG, "ranAt": pd.Timestamp.now(tz="UTC").isoformat(), "seed": SEED, "B": 2000, "prereg": PREREG, "preregCommit": PREREG_COMMIT,
           "branch": BRANCH, "bars": bars, "power": pw, "cells": [
               {"name": c, "n": res[c]["n_dates_event"], **{k: v for k, v in res[c].items()}} for c in CELLS],
           "descriptive": desc,
           "evidence": {c: {"label": p["diagnosis"]["label"], "checks": p["diagnosis"]["checks"],
                            "positive_control": p["positive_control"], "lookahead_canary": p.get("lookahead_canary"),
                            "placebo": p["placebo"]} for c, p in packs.items()}}
    (OUT / "results.json").write_text(json.dumps(out, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o)))
    for c in CELLS:
        x = res[c]
        print(f"{c:13s} est {x['est']:+.4f} [{x['lo']:+.4f},{x['hi']:+.4f}] bar {x['bar']} mde {x['mde']:.4f} holm {x['holm_p']:.4f} "
              f"halves {x['halves']} insts+ {x['insts_positive']} shuffle97.5 {x['shuffle_p97_5']:+.4f} ev {x['event_only']:+.4f} "
              f"ps {x['pseudo_only']:+.4f} gate {x['gate']} -> {x['verdict']}")
        if c in packs:
            print("   evidence:", packs[c]["diagnosis"]["label"], packs[c]["positive_control"])
    print(json.dumps(desc, indent=1, default=str)[:6000])


if __name__ == "__main__":
    main()
