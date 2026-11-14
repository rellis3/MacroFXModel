"""post-release-drift-pooled: shared constants, price access, sigma, stats.

Prereg: forge/POST_RELEASE_DRIFT_POOLED_PREREG.md (committed 3849e8a7, 2026-11-14).
Everything here is read-only on local files. No R2 client, no OANDA client, no loader that merges the nightly R2
tail (`loadM1ForPair` is never used: parquet files are read directly and truncated at the lockbox).
"""
from __future__ import annotations

import json
import math
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from statistics import NormalDist

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SLUG = "post-release-drift-pooled"
OUT = ROOT / "analysis" / "output" / SLUG
PREREG = "forge/POST_RELEASE_DRIFT_POOLED_PREREG.md"
PREREG_COMMIT = "3849e8a7"
BRANCH = "claude/signal-bot-bias-analysis-bwr1qv"
SEED = 20261114

IDS = ("post-release-drift-pooled", "post-release-momentum-pooled")
HORIZONS = ("h1", "h2", "h3", "h4")
BARS = {"h1": 0.05, "h2": 0.10, "h3": 0.10, "h4": 0.20}       # prereg §5, in daily sigma
STOP_SIGMA = 0.5                                              # prereg §3.6
INSTRUMENTS = (("gold", -1), ("eurusd", -1), ("gbpusd", -1), ("usdjpy", +1), ("nq", -1))   # prereg §3.3
FAMILIES = ("CPI", "NFP", "PPI", "FOMC")

NS_MIN = 60_000_000_000
LONDON, NEWYORK = "Europe/London", "America/New_York"


@dataclass
class Params:
    """Run parameters. The defaults are the registered values; --selftest shrinks the resampling counts and moves
    the dates onto the synthetic sample."""
    lockbox_last_date: str = "2026-08-21"                     # last London date that may be read
    half_split: str = "2018-01-01"                            # prereg §3.10
    last3_from: str = "2023-08-22"                            # concentration: most recent 3 years
    B: int = 2000                                             # cluster / month bootstrap
    n_flip: int = 20000                                       # sign flips for the scored p
    n_flip_posctrl: int = 2000                                # sign flips inside the positive control (see README)
    n_placebo: int = 2000                                     # placebo replicates
    n_posctrl: int = 500                                      # positive-control draws per delta
    n_power_reps: int = 20                                    # placebo replicates averaged for the bootstrap SE
    placebo_window: int = 40                                  # +-40 trading days
    placebo_excl: int = 3                                     # event's own +-3 trading days
    sigma_window: int = 800                                   # HAR-800
    sigma_min_bars: int = 250
    seed: int = SEED

    @property
    def lockbox_end_utc(self) -> pd.Timestamp:                # last bar may start before London midnight
        return (pd.Timestamp(self.lockbox_last_date) + pd.Timedelta(days=1)).tz_localize(LONDON).tz_convert("UTC")

    @property
    def last_horizon_end_utc(self) -> pd.Timestamp:
        return pd.Timestamp(self.lockbox_last_date + " 21:00").tz_localize(LONDON).tz_convert("UTC")


def rng_for(params: Params, *tags) -> np.random.Generator:
    """One seed for the study; independent streams per use, derived from it deterministically."""
    words = [params.seed] + [int.from_bytes(str(t).encode(), "little") % (2**32) for t in tags]
    return np.random.default_rng(words)


class DataMissing(RuntimeError):
    pass


def need(path: Path, what: str) -> Path:
    if not Path(path).exists():
        raise DataMissing(f"MISSING DATA FILE: {path}  ({what}). See scripts/{SLUG}/README.md")
    return Path(path)


# ── prices ──────────────────────────────────────────────────────────────────────────────────────────────────────

class Px:
    """One instrument's bars: start-stamped UTC int64 ns, OHLC mid, per-bar length (M1 or M15)."""

    def __init__(self, key, t, o, h, l, c, barlen, spread=None):
        self.key = key
        self.t = np.asarray(t, dtype=np.int64)
        self.o, self.h, self.l, self.c = (np.asarray(a, dtype=float) for a in (o, h, l, c))
        self.barlen = np.asarray(barlen, dtype=np.int64)
        self.end = self.t + self.barlen
        self.tol = np.maximum(5 * NS_MIN, self.barlen)
        if len(self.t) and not (np.all(np.diff(self.t) > 0) and np.all(np.diff(self.end) >= 0)):
            raise ValueError(f"{key}: bar stamps not strictly increasing")
        self.spread = spread                                   # (t, spread_open, spread_close) or None
        self.m1_start = int(self.t[self.barlen == NS_MIN][0]) if np.any(self.barlen == NS_MIN) else None

    def entry(self, T: int):
        """Price at instant T: open of the bar stamped T, else close of the last bar ending <= T (within tol).
        Returns (price, index of the first path bar, bar length used)."""
        i = int(np.searchsorted(self.t, T))
        if i < len(self.t) and self.t[i] == T:
            return self.o[i], i, int(self.barlen[i])
        j = int(np.searchsorted(self.end, T, "right")) - 1
        if j >= 0 and self.end[j] >= T - self.tol[j]:
            return self.c[j], j + 1, int(self.barlen[j])
        return math.nan, -1, 0

    def exit(self, T: int):
        """Close of the last bar starting before T and ending by T (prereg §3.5); missing if older than tol."""
        j = int(np.searchsorted(self.end, T, "right")) - 1
        if j >= 0 and self.end[j] >= T - self.tol[j]:
            return self.c[j], j
        return math.nan, -1

    def spread_at(self, T: int) -> float:
        if self.spread is None:
            return math.nan
        st, so, sc = self.spread
        i = int(np.searchsorted(st, T, "right")) - 1
        if i >= 0 and st[i] >= T - 5 * NS_MIN:
            v = so[i] if st[i] == T else sc[i]
            return float(v) if np.isfinite(v) and v >= 0 else math.nan
        return math.nan


def _frame_from_parquet(path: Path) -> pd.DataFrame:
    df = pd.read_parquet(path)
    if not isinstance(df.index, pd.DatetimeIndex):
        if "time" not in df.columns:
            raise ValueError(f"{path}: no DatetimeIndex and no `time` column")
        idx = pd.to_datetime(df["time"], utc=True)
        df = df.drop(columns=["time"])
        df.index = idx
    elif df.index.tz is None:
        df.index = df.index.tz_localize("UTC")
    else:
        df.index = df.index.tz_convert("UTC")
    df = df[~df.index.duplicated(keep="first")].sort_index()
    if len(df) and df.index[0].year < 2000:
        raise ValueError(f"{path}: timestamps before 2000 (BAM/1970 fault, data-rules faults-log). Refetch with --price M")
    return df


def lockbox_cut(df: pd.DataFrame, params: Params, name: str) -> pd.DataFrame:
    """Keep bars whose London date is <= the lockbox date; then ASSERT nothing later survived."""
    df = df[df.index < params.lockbox_end_utc]
    if len(df):
        last_london = df.index[-1].tz_convert(LONDON).date()
        assert str(last_london) <= params.lockbox_last_date, f"{name}: bar after the lockbox ({last_london})"
    return df


def load_ohlc(path: Path, params: Params, name: str) -> pd.DataFrame:
    df = lockbox_cut(_frame_from_parquet(path), params, name)
    miss = {"open", "high", "low", "close"} - set(df.columns)
    if miss:
        raise ValueError(f"{path}: missing columns {sorted(miss)}")
    return df[["open", "high", "low", "close"]].astype(float)


def load_close_m15(path: Path, params: Params, name: str) -> pd.Series:
    df = lockbox_cut(_frame_from_parquet(path), params, name)
    return df["close"].astype(float)


def load_spread(path: Path, params: Params, name: str):
    df = lockbox_cut(_frame_from_parquet(path), params, name)
    for col in ("bid_o", "ask_o", "bid_c", "ask_c"):
        if col not in df.columns:
            raise ValueError(f"{path}: bid/ask column {col} missing")
    t = df.index.asi8 if df.index.dtype.unit == "ns" else df.index.as_unit("ns").asi8
    return (t, (df["ask_o"] - df["bid_o"]).to_numpy(float), (df["ask_c"] - df["bid_c"]).to_numpy(float))


def _ns(idx: pd.DatetimeIndex) -> np.ndarray:
    return idx.as_unit("ns").asi8


def px_from_m1(key: str, df: pd.DataFrame, spread=None, m15_before: pd.Series | None = None) -> Px:
    t = _ns(df.index)
    o, h, l, c = (df[k].to_numpy(float) for k in ("open", "high", "low", "close"))
    bl = np.full(len(t), NS_MIN, dtype=np.int64)
    if m15_before is not None and len(m15_before):
        first = t[0] if len(t) else np.iinfo(np.int64).max
        s = m15_before[_ns(m15_before.index) + 15 * NS_MIN <= first]
        ct = s.to_numpy(float)
        ot = np.r_[np.nan, ct[:-1]]
        tt = _ns(s.index)
        gap = np.r_[True, np.diff(tt) != 15 * NS_MIN]
        ot[gap] = ct[gap]                                     # first bar after a gap: open = close (no jump inside)
        t = np.r_[tt, t]
        o = np.r_[ot, o]
        c = np.r_[ct, c]
        h = np.r_[np.maximum(ot, ct), h]
        l = np.r_[np.minimum(ot, ct), l]
        bl = np.r_[np.full(len(tt), 15 * NS_MIN, dtype=np.int64), bl]
    return Px(key, t, o, h, l, c, bl, spread)


# ── NY-close daily bars and sigma (data-rules item 2) ───────────────────────────────────────────────────────────

def ny_close_daily(px: Px) -> pd.DataFrame:
    """Port of js/voteAtlasV4Lines.js nyCloseDailyBars: key = date of (New York time + 7h); keep n >= 60 minutes."""
    idx = pd.DatetimeIndex(px.t, tz="UTC").tz_convert(NEWYORK) + pd.Timedelta(hours=7)
    key = idx.tz_localize(None).normalize()
    df = pd.DataFrame({"key": key, "o": px.o, "h": px.h, "l": px.l, "c": px.c, "m": px.barlen // NS_MIN})
    g = df.groupby("key", sort=True)
    d = pd.DataFrame({"open": g["o"].first(), "high": g["h"].max(), "low": g["l"].min(), "close": g["c"].last(),
                      "n": g["m"].sum()})
    d = d[(d["n"] >= 60) & (d.index.dayofweek < 5)]
    return d


def sigma_table(px: Px, params: Params, workdir: Path) -> pd.DataFrame:
    """sigma_next[i] = HAR-RV-log forecast for the bar after daily bar i, via js/forecastSigma.js on the last
    `sigma_window` bars (>= sigma_min_bars), and sigma60_next[i] = RMS of the 60 log returns ending at bar i."""
    d = ny_close_daily(px)
    workdir.mkdir(parents=True, exist_ok=True)
    fin, fout = workdir / f"_d1_{px.key}.json", workdir / f"_sig_{px.key}.json"
    fin.write_text(json.dumps({"window": params.sigma_window, "minBars": params.sigma_min_bars,
                               "bars": [{"open": a, "high": b, "low": c, "close": e}
                                        for a, b, c, e in d[["open", "high", "low", "close"]].to_numpy().tolist()]}))
    r = subprocess.run(["node", str(HERE / "sigma.mjs"), str(fin), str(fout)], capture_output=True, text=True, cwd=ROOT)
    if r.returncode != 0:
        raise RuntimeError(f"sigma.mjs failed for {px.key}: {r.stderr[-2000:]}")
    har = np.array([math.nan if v is None else v for v in json.loads(fout.read_text())], dtype=float)
    fin.unlink(missing_ok=True)
    fout.unlink(missing_ok=True)
    lr = np.log(d["close"]).diff().to_numpy()
    s60 = np.sqrt(pd.Series(lr ** 2).rolling(60, min_periods=60).mean().to_numpy())
    return pd.DataFrame({"key": d.index, "sig_har_next": har, "sig60_next": s60, "close": d["close"].to_numpy()})


def ny_key(ts: pd.Timestamp) -> pd.Timestamp:
    return (ts.tz_convert(NEWYORK) + pd.Timedelta(hours=7)).tz_localize(None).normalize()


def sigma_for(sig: pd.DataFrame, key: pd.Timestamp):
    """sigma known before session `key`: the forecast made at the last daily bar with key < `key`."""
    i = int(np.searchsorted(sig["key"].to_numpy(), np.datetime64(key), "left")) - 1
    if i < 0:
        return math.nan, math.nan
    return float(sig["sig_har_next"].iat[i]), float(sig["sig60_next"].iat[i])


# ── horizon clocks (prereg §3.5) ────────────────────────────────────────────────────────────────────────────────

def _at(date, hhmm: str, tz: str) -> pd.Timestamp:
    return pd.Timestamp(f"{pd.Timestamp(date).date()} {hhmm}").tz_localize(tz).tz_convert("UTC")


def horizon_ends(t_rel: pd.Timestamp, entry: pd.Timestamp) -> dict:
    d = np.datetime64(t_rel.tz_convert(LONDON).date())
    return {"h1": entry + pd.Timedelta(minutes=60),
            "h2": _at(d, "21:00", LONDON),
            "h3": _at(np.busday_offset(d, 1, roll="forward"), "07:00", LONDON),
            "h4": _at(np.busday_offset(d, 3, roll="forward"), "21:00", LONDON)}


def measure(px: Px, sig: float, T0: int, Tent: int, ends: dict, with_path: bool, last_end: int) -> dict:
    """Prices at release T0 and entry Tent, exit at each horizon end, and (with_path) the 0.5-sigma stop R, MAE, MFE
    for both directions from the bar path between entry and exit."""
    p0, _, _ = px.entry(T0)
    pent, i0, blen = px.entry(Tent)
    out = {"p0": p0, "pent": pent, "m15": blen == 15 * NS_MIN}
    for h, T in ends.items():
        T = int(T)
        if T > last_end:
            out[h] = {"lr": math.nan, "lockbox": True}
            continue
        pex, j = px.exit(T) if np.isfinite(pent) and T > Tent else (math.nan, -1)
        rec = {"lr": math.log(pex / pent) if np.isfinite(pex) else math.nan}
        if with_path and np.isfinite(pex) and np.isfinite(sig) and sig > 0:
            H, L = px.h[i0:j + 1], px.l[i0:j + 1]
            for d in (1, -1):
                stop = pent * (1 - d * STOP_SIGMA * sig)
                hit = (L <= stop) if d == 1 else (H >= stop)
                k = int(np.argmax(hit)) if len(hit) and hit.any() else -1
                if k >= 0:
                    Hs, Ls, R, xT = H[:k + 1], L[:k + 1], -1.0, int(px.t[i0 + k])
                else:
                    Hs, Ls, R, xT = H, L, d * (pex - pent) / (STOP_SIGMA * sig * pent), T
                fav = d * (pex - pent) if k < 0 else 0.0
                adv = -d * (pex - pent) if k < 0 else STOP_SIGMA * sig * pent
                if len(Hs):
                    fav = max(fav, (Hs.max() - pent) if d == 1 else (pent - Ls.min()))
                    adv = max(adv, (pent - Ls.min()) if d == 1 else (Hs.max() - pent))
                cost = (px.spread_at(Tent) + px.spread_at(xT)) / 2.0          # half-spread in + half-spread out
                rec[d] = {"R": R, "mae": max(adv, 0) / (sig * pent), "mfe": max(fav, 0) / (sig * pent),
                          "stopped": k >= 0, "costR": cost / (STOP_SIGMA * sig * pent)}
        out[h] = rec
    return out


# ── statistics ──────────────────────────────────────────────────────────────────────────────────────────────────

ND = NormalDist()


def flip_matrix(n_flip: int, E: int, rng: np.random.Generator) -> np.ndarray:
    return (rng.integers(0, 2, size=(n_flip, E), dtype=np.int8) * 2 - 1).astype(np.float32)


def flip_p(ybar: np.ndarray, F: np.ndarray) -> float:
    """Two-sided event-level sign-flip randomisation p (prereg §3.8); F rows are +-1 per event."""
    y = np.asarray(ybar, dtype=np.float64)
    if len(y) == 0:
        return math.nan
    M = abs(y.mean())
    Ms = np.abs(F[:, :len(y)] @ y.astype(np.float32)) / len(y)
    return float((1 + np.sum(Ms >= M - 1e-12)) / (1 + F.shape[0]))


def cluster_boot(y: np.ndarray, clusters: np.ndarray, B: int, rng: np.random.Generator):
    y = np.asarray(y, float)
    if len(y) < 2:
        return math.nan, math.nan, math.nan
    _, c = np.unique(clusters, return_inverse=True)
    C = c.max() + 1
    S = np.bincount(c, weights=y, minlength=C)
    N = np.bincount(c, minlength=C).astype(float)
    idx = rng.integers(0, C, size=(B, C))
    m = S[idx].sum(1) / N[idx].sum(1)
    lo, hi = np.percentile(m, [2.5, 97.5])
    return float(lo), float(hi), float(m.std(ddof=1))


def beta_fwl(u, q, g, w=None) -> float:
    """beta in u = alpha_g + beta*q (one intercept per group), weighted."""
    w = np.ones(len(u)) if w is None else w
    G = g.max() + 1
    W = np.bincount(g, weights=w, minlength=G)
    W[W == 0] = 1
    qb = np.bincount(g, weights=w * q, minlength=G) / W
    ub = np.bincount(g, weights=w * u, minlength=G) / W
    dq, du = q - qb[g], u - ub[g]
    den = np.sum(w * dq * dq)
    return float(np.sum(w * dq * du) / den) if den > 0 else math.nan


def beta_boot(u, q, g, clusters, B, rng):
    _, c = np.unique(clusters, return_inverse=True)
    C = c.max() + 1
    est = beta_fwl(u, q, g)
    draws = np.empty(B)
    for b in range(B):
        cnt = np.bincount(rng.integers(0, C, C), minlength=C).astype(float)
        draws[b] = beta_fwl(u, q, g, cnt[c])
    lo, hi = np.nanpercentile(draws, [2.5, 97.5])
    return est, float(lo), float(hi)


def holm_adjust(p):
    p = np.asarray(p, float)
    m = len(p)
    order = np.argsort(p)
    adj = np.empty(m)
    run = 0.0
    for k, i in enumerate(order):
        run = max(run, min(1.0, (m - k) * p[i]))
        adj[i] = run
    return adj


def bh_reject(p, q=0.10):
    p = np.asarray(p, float)
    ok = np.isfinite(p)
    rej = np.zeros(len(p), bool)
    pv = p[ok]
    m = len(pv)
    if m == 0:
        return rej
    order = np.argsort(pv)
    thr = q * (np.arange(1, m + 1) / m)
    passed = pv[order] <= thr
    k = np.max(np.where(passed)[0]) + 1 if passed.any() else 0
    sub = np.zeros(m, bool)
    sub[order[:k]] = True
    rej[np.where(ok)[0]] = sub
    return rej


def chance_baseline(tests: int, passes: int, alpha: float = 0.05):
    """Expected passes by chance and P(>= passes) under Binomial(tests, alpha) (as js/preregStats.js chanceBaseline)."""
    exp = tests * alpha
    p = sum(math.comb(tests, k) * alpha ** k * (1 - alpha) ** (tests - k) for k in range(passes, tests + 1))
    return {"tests": tests, "passes": passes, "expected": exp, "p_at_least": p}


def mde_from_se(se: float, alpha: float, power: float = 0.8) -> float:
    return (ND.inv_cdf(1 - alpha / 2) + ND.inv_cdf(power)) * se


def union_find_clusters(starts: np.ndarray, ends: np.ndarray) -> np.ndarray:
    """Connected components of overlapping [start, end] windows (sorted sweep)."""
    order = np.argsort(starts)
    cl = np.empty(len(starts), dtype=np.int64)
    cur, cur_end = -1, None
    for i in order:
        if cur_end is None or starts[i] > cur_end:
            cur += 1
            cur_end = ends[i]
        else:
            cur_end = max(cur_end, ends[i])
        cl[i] = cur
    return cl


def jdump(obj, path: Path):
    def conv(o):
        if isinstance(o, (np.floating,)):
            return None if not np.isfinite(o) else float(o)
        if isinstance(o, (np.integer,)):
            return int(o)
        if isinstance(o, (np.bool_,)):
            return bool(o)
        if isinstance(o, (pd.Timestamp,)):
            return o.isoformat()
        if isinstance(o, float) and not math.isfinite(o):
            return None
        raise TypeError(type(o))

    def clean(o):
        if isinstance(o, dict):
            return {str(k): clean(v) for k, v in o.items()}
        if isinstance(o, (list, tuple)):
            return [clean(v) for v in o]
        if isinstance(o, float) and not math.isfinite(o):
            return None
        return o
    path.write_text(json.dumps(clean(obj), indent=1, default=conv))
