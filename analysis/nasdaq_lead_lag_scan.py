"""
NAS100 lead-lag scan: testing the "lag-replay" theory of a trading educator's
blue forecast line.

Background (see NasdaqMacroLead/ for the companion regression-based fair-value
line, which is smooth by construction and does NOT match the educator's jagged
reference chart). The working theory here is different: the blue line is not a
synthesized prediction at all, it's some macro-sensitive, continuously-quoted
proxy's OWN historical price path, re-timestamped ~36h later and overlaid on
NAS100 (rescaled). Because it's a real observed path just time-shifted, it
keeps genuine jaggedness that a regression's output cannot.

This script does NOT eyeball a chart. For every candidate proxy it reports TWO
separate numbers, exactly as analysis/yield_asset_coupling.py (the house
standard for this kind of claim) insists on, because "levels of two trending
series correlate spuriously":

  1. LEVEL/SHAPE correlation at the best lag -- does the candidate's own price
     path, time-shifted by lag L, look like NAS100's path? This explains
     VISUAL similarity only. It is NOT evidence of real predictive information
     -- two things that both trend up over years will "correlate" at almost
     any lag. Selected on a TRAIN split only (see below), reported over the
     FULL overlap for a representative "how similar does it actually look"
     number.

  2. HONEST walk-forward test at that same lag L -- does the candidate's own
     realized return over the last L hours (fully known right now) predict
     NAS100's forward return over the next L hours, evaluated ONLY on a TEST
     split that played no part in choosing L? Scored with:
       - rank-IC (Spearman), Newey-West t-stat (window-overlap aware)
       - a circular-shift null (real IC vs ~1500 circularly-shifted draws)
       - a split-half sign-stability check within the test split
     Same gates as yield_asset_coupling.py / js/nasdaqMacroLeadCore.js's
     oosStats: |IC| above a floor AND p_null < 0.05 AND sign-stable.

Why train/test, not full-sample: the level-correlation scan tries ~20 lags
and takes the best one. Picking L on the SAME data used to judge whether L
"works" is look-ahead bias baked into a grid search -- with enough lags
scanned, *something* will look good by chance. So:
    TRAIN split (first ~65% of each candidate's overlap with NAS100)
        -> scan the lag grid, pick L* = argmax |level corr|
    TEST split (remaining ~35%, never touched by the lag search)
        -> honest IC / null / split-half test, fixed at L*

Data sourcing, in preference order: OANDA M15 (native resolution, matches the
NAS100 target) > FRED daily (forward-filled) > Yahoo daily (last resort,
explicitly flagged lower-resolution in every output row it appears in).

Usage:
    python -m analysis.nasdaq_lead_lag_scan --refresh   # pull OANDA+FRED+Yahoo
    python -m analysis.nasdaq_lead_lag_scan             # run the scan on cache
"""
from __future__ import annotations

import argparse
import os
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "analysis" / "output" / "nasdaq_lead_lag"
RAW = OUT / "raw"
RAW.mkdir(parents=True, exist_ok=True)

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
ENV_FILES = ["RegimeV2/.env", "bot/.env", "backtestSystem/.env", "Gold/.env"]

# -- stats knobs (matched to analysis/yield_asset_coupling.py's house standard) --
N_NULL = 1500
IC_SCREEN = 0.025          # only bother null-testing cells at/above this |IC|
STABLE_MIN_HALF = 0.02     # each half's |IC| must clear this for "stable"
VERDICT_IC_FLOOR = 0.025
VERDICT_P_NULL = 0.05
LEVEL_CORR_EYECATCH = 0.5  # |level corr| above this = "looks like the chart"
MIN_OBS = 300
TRAIN_FRAC = 0.65

# -- lag grid: every 3h from 0 to 60h. At 36h-scale target this gives 21 grid
# points -- fine enough to localize a peak near 36h without so many points
# that the "best of N lags" multiple-testing problem gets out of hand (this is
# exactly why the honest test is scored on a held-out split, see docstring).
# Excludes 0: a "0-hour lead" is coincident, not leading, and is a real
# question (is this candidate just moving WITH Nasdaq right now?) but a
# different one from what this scan is for. Including 0 in the grid also
# breaks the honest test below by construction -- at L=0, "candidate's
# change over the last 0 hours" and "NAS100's forward return over the next
# 0 hours" are both trivially the zero series, which silently produces
# ic=0.0/p_null=nan (looks like "no signal" but is actually a degenerate,
# unrun test) instead of a real answer. Found via a run where every
# candidate whose RAW level correlation happened to peak at same-bar came
# back with that exact suspicious ic=0.0/p_null=nan/stable=False pattern.
LAG_GRID_H = list(range(3, 61, 3))

BARS_PER_HOUR = 4  # M15


# ============================================================================
# credentials
# ============================================================================
def _read_env_var(name: str) -> str | None:
    for cand in ENV_FILES:
        p = ROOT / cand
        if not p.exists():
            continue
        m = re.search(name + r"\s*=\s*(\S+)", p.read_text(errors="ignore"))
        if m:
            return m.group(1).strip("\"'")
    return None


def fred_key() -> str:
    k = _read_env_var("FRED_KEY") or os.environ.get("FRED_KEY") or os.environ.get("FRED_API_KEY")
    if not k:
        raise SystemExit("no FRED key found (checked %s + env)" % ENV_FILES)
    return k


def oanda_creds() -> tuple[str, str]:
    key = _read_env_var("OANDA_KEY") or os.environ.get("OANDA_KEY")
    if not key:
        raise SystemExit("no OANDA_KEY found (checked %s + env)" % ENV_FILES)
    env = os.environ.get("OANDA_ENV")
    if env:
        is_practice = env == "practice"
    else:
        prac = _read_env_var("OANDA_PRACTICE")
        is_practice = prac == "1" if prac is not None else True
    base = "https://api-fxpractice.oanda.com" if is_practice else "https://api-fxtrade.oanda.com"
    return key, base


# ============================================================================
# candidate universe -- name -> (label, group, oanda symbol | fred id | yahoo ticker)
# ============================================================================
OANDA_M15 = {
    "nas100":   "NAS100_USD",   # target
    "us2000":   "US2000_USD",
    "spx500":   "SPX500_USD",
    "usb02y":   "USB02Y_USD",
    "usb10y":   "USB10Y_USD",
    "gold":     "XAU_USD",
    "oil":      "BCO_USD",
    "dax":      "DE30_EUR",     # DE30_USD is not served; DE30_EUR is the live OANDA symbol
    "ftse":     "UK100_GBP",
    "nikkei":   "JP225_USD",
    "hangseng": "HK33_HKD",     # HK33_USD returns no candles; HK33_HKD does
    "eurusd":   "EUR_USD",
    "gbpusd":   "GBP_USD",
    "audusd":   "AUD_USD",
    "nzdusd":   "NZD_USD",
    "usdjpy":   "USD_JPY",
    "usdcad":   "USD_CAD",
    "usdchf":   "USD_CHF",
}
USD_BASE_LEGS = ["eurusd", "gbpusd", "audusd", "nzdusd"]   # USD is quote -> basket rises when these FALL
USD_QUOTE_LEGS = ["usdjpy", "usdcad", "usdchf"]            # USD is base -> basket rises when these RISE

FRED_SERIES = {
    "hy_oas":   "BAMLH0A0HYM2",
    "ig_oas":   "BAMLC0A0CM",
    "real10":   "DFII10",
    "be10":     "T10YIE",
    "fwd5y5y":  "T5YIFR",
    "vix":      "VIXCLS",
    "nfci":     "NFCI",
    "y2":       "DGS2",
    "y10":      "DGS10",
}

YAHOO = {
    "iwm": "IWM", "spy": "SPY", "xly": "XLY", "xlp": "XLP", "hyg": "HYG", "lqd": "LQD",
    "copper": "HG=F", "gold_yahoo": "GC=F",
}


# ============================================================================
# OANDA fetch (M15, native) -- mirrors scripts/fetch_m1_oanda.py's pagination
# ============================================================================
def fetch_oanda_m15(instrument: str, base: str, headers: dict, years: float) -> pd.Series | None:
    all_rows = []
    cursor = (datetime.now(timezone.utc) - timedelta(days=int(365 * years))).replace(tzinfo=None)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    empty_streak = 0
    while cursor < now and empty_streak < 30:
        params = {
            "granularity": "M15", "count": 5000, "price": "M",
            "from": cursor.strftime("%Y-%m-%dT%H:%M:%S.000000000Z"),
        }
        try:
            r = requests.get(f"{base}/v3/instruments/{instrument}/candles",
                              headers=headers, params=params, timeout=30)
        except requests.RequestException as e:
            print(f"    {instrument}: network retry ({e})")
            time.sleep(2)
            continue
        if r.status_code == 422:
            cursor += timedelta(days=14)
            empty_streak += 1
            continue
        if r.status_code in (400, 404):
            print(f"    {instrument}: fatal {r.status_code} -- instrument unavailable on OANDA")
            return None
        r.raise_for_status()
        candles = [c for c in r.json().get("candles", []) if c.get("complete") and c.get("mid")]
        if not candles:
            cursor += timedelta(days=7)
            empty_streak += 1
            continue
        empty_streak = 0
        for c in candles:
            all_rows.append((c["time"], float(c["mid"]["c"])))
        last_t = pd.Timestamp(candles[-1]["time"]).to_pydatetime().replace(tzinfo=None)
        cursor = last_t + timedelta(minutes=15)
        if len(candles) < 5000:
            pass  # caught up to `now` on the next loop check
        time.sleep(0.05)
    if not all_rows:
        return None
    df = pd.DataFrame(all_rows, columns=["time", "close"]).drop_duplicates("time")
    df["time"] = pd.to_datetime(df["time"], utc=True).dt.tz_localize(None)
    s = df.sort_values("time").set_index("time")["close"]
    return s


def pull_oanda_all(years: float) -> None:
    key, base = oanda_creds()
    headers = {"Authorization": f"Bearer {key}"}
    print(f"OANDA base = {base}  (years={years})")
    for name, sym in OANDA_M15.items():
        s = fetch_oanda_m15(sym, base, headers, years)
        if s is None or not len(s):
            print(f"  {name:10s} {sym:12s} FAILED / no data")
            continue
        s.to_csv(RAW / f"oanda_{name}_m15.csv")
        span = (s.index[-1] - s.index[0]).days
        print(f"  {name:10s} {sym:12s} {len(s):7,d} bars  {s.index[0]}..{s.index[-1]}  ({span}d)")


def load_oanda(name: str) -> pd.Series | None:
    p = RAW / f"oanda_{name}_m15.csv"
    if not p.exists():
        return None
    s = pd.read_csv(p, index_col=0, parse_dates=True)["close"]
    return s.sort_index()


# ============================================================================
# FRED fetch (daily levels)
# ============================================================================
def pull_fred(start="2018-01-01") -> None:
    key = fred_key()
    cols = {}
    for name, sid in FRED_SERIES.items():
        r = requests.get(
            "https://api.stlouisfed.org/fred/series/observations",
            params=dict(series_id=sid, api_key=key, file_type="json", observation_start=start),
            timeout=60,
        )
        r.raise_for_status()
        vals = {}
        for o in r.json()["observations"]:
            v = o["value"]
            vals[pd.Timestamp(o["date"])] = np.nan if v in (".", "") else float(v)
        cols[name] = pd.Series(vals, name=name)
        print(f"  FRED {sid:14s} {cols[name].notna().sum():5d} obs")
    df = pd.DataFrame(cols).sort_index()
    df["slope_2s10s"] = df["y10"] - df["y2"]
    df["hy_ig_oas_diff"] = df["hy_oas"] - df["ig_oas"]
    df.to_csv(RAW / "fred.csv")


def load_fred() -> pd.DataFrame | None:
    p = RAW / "fred.csv"
    if not p.exists():
        return None
    return pd.read_csv(p, index_col=0, parse_dates=True)


# ============================================================================
# Yahoo fetch (daily close) -- same v8 chart endpoint yield_asset_coupling.py uses
# ============================================================================
def pull_yahoo(range_="5y") -> None:
    for name, tk in YAHOO.items():
        try:
            r = requests.get(
                "https://query1.finance.yahoo.com/v8/finance/chart/" + tk,
                params={"range": range_, "interval": "1d"}, headers=UA, timeout=40)
            res = r.json()["chart"]["result"]
            if not res:
                print(f"  {name:12s} no data")
                continue
            res = res[0]
            idx = pd.to_datetime(res["timestamp"], unit="s", utc=True).tz_localize(None).normalize()
            close = pd.Series(res["indicators"]["quote"][0]["close"], index=idx, name="close").dropna()
            close = close[~close.index.duplicated(keep="last")]
            close.to_csv(RAW / f"yahoo_{name}.csv")
            print(f"  {name:12s} {tk:8s} {len(close):5d} bars  {close.index[0].date()}..{close.index[-1].date()}")
        except Exception as e:
            print(f"  {name:12s} ERR {repr(e)[:100]}")
        time.sleep(0.4)


def load_yahoo(name: str) -> pd.Series | None:
    p = RAW / f"yahoo_{name}.csv"
    if not p.exists():
        return None
    return pd.read_csv(p, index_col=0, parse_dates=True)["close"].sort_index()


# ============================================================================
# alignment helpers -- all onto NAS100's own M15 timestamp grid, "as-of"
# (last known value at-or-before each target bar), same semantics as
# js/nasdaqMacroLeadCore.js's alignToTarget / ffillFredLevels.
# ============================================================================
def align_asof(target_idx: pd.DatetimeIndex, s: pd.Series) -> pd.Series:
    s = s[~s.index.duplicated(keep="last")].sort_index()
    if not len(s):
        return pd.Series(np.nan, index=target_idx)
    combined = target_idx.union(s.index)
    filled = s.reindex(combined).ffill()
    return filled.reindex(target_idx)


def time_shift(s: pd.Series, hours: float) -> pd.Series:
    """Value of `s` (indexed on the shared target grid) at-or-before (t - hours)
    for every t in s.index. hours<0 looks FORWARD (at-or-before t+|hours|) --
    used for the NAS100 forward-return leg. Wall-clock based, not row-count
    based, so weekend/holiday gaps in the shared grid don't silently distort
    a 36h-scale lag."""
    idx_vals = s.index.values.astype("datetime64[ns]")
    query = (s.index - pd.Timedelta(hours=hours)).values.astype("datetime64[ns]")
    pos = np.searchsorted(idx_vals, query, side="right") - 1
    vals = s.to_numpy()
    out = np.where(pos >= 0, vals[np.clip(pos, 0, len(vals) - 1)], np.nan)
    return pd.Series(out, index=s.index)


# ============================================================================
# stats -- ported from analysis/yield_asset_coupling.py (the house standard)
# ============================================================================
def rank_z(a: np.ndarray) -> np.ndarray:
    r = pd.Series(a).rank().to_numpy()
    r = r - r.mean()
    sd = r.std()
    return r / sd if sd > 0 else r


def nw_t(x: np.ndarray, y: np.ndarray, lag: int) -> float:
    n = len(x)
    if n < 30:
        return np.nan
    X = np.column_stack([np.ones(n), x])
    xtx_inv = np.linalg.pinv(X.T @ X)
    b = xtx_inv @ X.T @ y
    e = y - X @ b
    Xe = X * e[:, None]
    S = Xe.T @ Xe
    for L in range(1, max(lag, 1) + 1):
        w = 1.0 - L / (max(lag, 1) + 1.0)
        A = Xe[L:].T @ Xe[:-L]
        S += w * (A + A.T)
    V = xtx_inv @ S @ xtx_inv
    se = np.sqrt(max(V[1, 1], 1e-300))
    return float(b[1] / se)


def null_p(xz: np.ndarray, yz: np.ndarray, ic: float, n_null: int, rng) -> float:
    n = len(xz)
    if n < 120:
        return np.nan
    offs = rng.integers(30, n - 30, size=n_null)
    idx = (np.arange(n)[None, :] + offs[:, None]) % n
    null = (xz[idx] @ yz) / n
    return float((np.abs(null) >= abs(ic)).mean())


def cell_stats(x: np.ndarray, y: np.ndarray, nw_lag: int, rng) -> dict:
    xz, yz = rank_z(x), rank_z(y)
    n = len(x)
    ic = float(xz @ yz / n)
    half = n // 2
    ic1 = float(rank_z(x[:half]) @ rank_z(y[:half]) / half) if half > 30 else np.nan
    ic2 = float(rank_z(x[half:]) @ rank_z(y[half:]) / (n - half)) if (n - half) > 30 else np.nan
    stable = bool(
        np.isfinite(ic1) and np.isfinite(ic2)
        and np.sign(ic1) == np.sign(ic2)
        and min(abs(ic1), abs(ic2)) > STABLE_MIN_HALF
    )
    return dict(
        n=n, ic=ic, nw_t=nw_t(x, y, nw_lag),
        p_null=(null_p(xz, yz, ic, N_NULL, rng) if abs(ic) >= IC_SCREEN else np.nan),
        hit=float(np.mean(np.sign(-x) == np.sign(y))),
        ic_h1=ic1, ic_h2=ic2, stable=stable,
    )


# ============================================================================
# candidate registry -- each entry builds an ADDITIVE base series (so a plain
# diff over any window IS the return/change, uniformly): log(price) for
# tradable instruments/ratios, raw level for spread/yield/vol series that are
# already additive, cumulative log-return for the synthetic USD basket, and
# summed z-scores for the Jordan composite.
# ============================================================================
def build_source_series(oanda: dict, fred: pd.DataFrame | None, yahoo: dict) -> dict:
    """Returns {key: (raw pandas Series in ADDITIVE units, native resolution)}."""
    src = {}

    def logpx(name):
        s = oanda.get(name)
        return np.log(s) if s is not None and len(s) else None

    for name in ["us2000", "spx500", "usb02y", "usb10y", "gold", "oil", "dax", "ftse", "nikkei", "hangseng"]:
        lp = logpx(name)
        if lp is not None:
            src[name] = lp

    if "us2000" in src and "spx500" in src:
        src["smallcap_largecap_oanda"] = (src["us2000"] - src["spx500"]).dropna()

    # USD basket: average signed per-bar log return of the FX legs, aligned
    # first onto NAS100's own grid (so the diff step is wall-clock-consistent
    # with everything else), then cumsum'd into an additive "log level".
    nas = oanda.get("nas100")
    if nas is not None and len(nas):
        nas_idx = nas.index
        leg_rets = []
        for leg in USD_BASE_LEGS:
            s = oanda.get(leg)
            if s is None or not len(s):
                continue
            aligned = align_asof(nas_idx, np.log(s))
            leg_rets.append(-aligned.diff())
        for leg in USD_QUOTE_LEGS:
            s = oanda.get(leg)
            if s is None or not len(s):
                continue
            aligned = align_asof(nas_idx, np.log(s))
            leg_rets.append(aligned.diff())
        if leg_rets:
            basket_ret = pd.concat(leg_rets, axis=1).mean(axis=1, skipna=True)
            src["usd_basket"] = basket_ret.fillna(0).cumsum()

    if fred is not None:
        for name in ["hy_oas", "ig_oas", "hy_ig_oas_diff", "real10", "be10", "fwd5y5y", "vix", "nfci", "slope_2s10s"]:
            if name in fred.columns:
                src[name] = fred[name].dropna()

    def ylog(name):
        s = yahoo.get(name)
        return np.log(s) if s is not None and len(s) else None

    iwm, spy, xly, xlp, hyg, lqd = (ylog(k) for k in ["iwm", "spy", "xly", "xlp", "hyg", "lqd"])
    copper, goldy = ylog("copper"), ylog("gold_yahoo")

    def ratio(a, b):
        if a is None or b is None:
            return None
        return (a - b).dropna()

    leg_sc = ratio(iwm, spy)     # small-cap / large-cap
    leg_ds = ratio(xly, xlp)     # discretionary / staples
    leg_hy = ratio(hyg, lqd)     # high-yield / IG credit
    if leg_sc is not None:
        src["leg_smallcap_largecap_yahoo"] = leg_sc
    if leg_ds is not None:
        src["leg_discretionary_staples_yahoo"] = leg_ds
    if leg_hy is not None:
        src["leg_hy_ig_credit_yahoo"] = leg_hy
    cg = ratio(copper, goldy)
    if cg is not None:
        src["copper_gold_ratio_yahoo"] = cg

    def rollz(s, win=252, minp=60):
        mu = s.rolling(win, min_periods=minp).mean()
        sd = s.rolling(win, min_periods=minp).std()
        return ((s - mu) / sd).replace([np.inf, -np.inf], np.nan)

    zc = []
    for leg in [leg_sc, leg_ds, leg_hy]:
        if leg is not None:
            zc.append(rollz(leg))
    if len(zc) == 3:
        src["jordan_composite_yahoo"] = pd.concat(zc, axis=1).sum(axis=1, min_count=3).dropna()

    return src


CANDIDATES = [
    # key                              label                                            group  resolution
    ("jordan_composite_yahoo",         "Jordan composite Z(IWM/SPY)+Z(XLY/XLP)+Z(HYG/LQD)", "A", "yahoo_daily"),
    ("leg_smallcap_largecap_yahoo",    "IWM/SPY leg only",                              "A", "yahoo_daily"),
    ("leg_discretionary_staples_yahoo","XLY/XLP leg only",                              "A", "yahoo_daily"),
    ("leg_hy_ig_credit_yahoo",         "HYG/LQD leg only",                              "A", "yahoo_daily"),
    ("smallcap_largecap_oanda",        "US2000/SPX500 ratio (OANDA CFDs)",              "B", "oanda_m15"),
    ("hy_oas",                         "ICE BofA US HY OAS (FRED BAMLH0A0HYM2)",        "B", "fred_daily"),
    ("ig_oas",                         "ICE BofA US IG OAS (FRED BAMLC0A0CM)",          "B", "fred_daily"),
    ("hy_ig_oas_diff",                 "HY-IG OAS spread (derived)",                    "B", "fred_daily"),
    ("usb02y",                         "OANDA USB02Y_USD bond CFD price",               "C", "oanda_m15"),
    ("usb10y",                         "OANDA USB10Y_USD bond CFD price",               "C", "oanda_m15"),
    ("slope_2s10s",                    "2s10s slope, DGS10-DGS2 (FRED)",                "C", "fred_daily"),
    ("real10",                         "10y real/TIPS yield (FRED DFII10)",             "C", "fred_daily"),
    ("be10",                           "10y breakeven inflation (FRED T10YIE)",         "C", "fred_daily"),
    ("fwd5y5y",                        "5y5y forward breakeven (FRED T5YIFR)",          "C", "fred_daily"),
    ("usd_basket",                     "USD basket (OANDA FX legs, signed avg)",        "D", "oanda_m15"),
    ("gold",                           "Gold XAU_USD (OANDA)",                          "D", "oanda_m15"),
    ("oil",                            "Brent BCO_USD (OANDA)",                         "D", "oanda_m15"),
    ("copper_gold_ratio_yahoo",        "Copper/Gold ratio HG=F / GC=F (Yahoo)",         "D", "yahoo_daily"),
    ("vix",                            "VIX close (FRED VIXCLS)",                       "E", "fred_daily"),
    ("nfci",                           "Chicago Fed NFCI (FRED, weekly)",               "E", "fred_weekly"),
    ("dax",                            "DAX DE30_EUR (OANDA)",                          "F", "oanda_m15"),
    ("ftse",                           "FTSE UK100_GBP (OANDA)",                        "F", "oanda_m15"),
    ("nikkei",                         "Nikkei JP225_USD (OANDA)",                      "F", "oanda_m15"),
    ("hangseng",                       "Hang Seng HK33_HKD (OANDA)",                    "F", "oanda_m15"),
]


# ============================================================================
# per-candidate lag scan + honest test
# ============================================================================
def run_candidate(key, label, group, resolution, cand_src: pd.Series, nas_logpx: pd.Series,
                   nas_idx: pd.DatetimeIndex, rng) -> dict | None:
    cand_aligned = align_asof(nas_idx, cand_src)
    valid = cand_aligned.notna() & nas_logpx.notna()
    if valid.sum() < MIN_OBS * 3:
        return dict(key=key, label=label, group=group, resolution=resolution,
                     status="insufficient overlap", n_overlap=int(valid.sum()))

    first_i, last_i = np.flatnonzero(valid.to_numpy())[[0, -1]]
    split_i = first_i + int((last_i - first_i) * TRAIN_FRAC)
    split_t = nas_idx[split_i]
    train_mask = valid & (nas_idx <= split_t)
    test_mask = valid & (nas_idx > split_t)

    # -- 1. level/shape lag scan on TRAIN only --
    train_scan = []
    for h in LAG_GRID_H:
        lagged = time_shift(cand_aligned, h)
        m = train_mask & lagged.notna()
        if m.sum() < MIN_OBS:
            train_scan.append((h, np.nan, int(m.sum())))
            continue
        corr = float(np.corrcoef(nas_logpx[m].to_numpy(), lagged[m].to_numpy())[0, 1])
        train_scan.append((h, corr, int(m.sum())))
    scan_df = pd.DataFrame(train_scan, columns=["lag_h", "train_level_corr", "n"])
    if scan_df["train_level_corr"].notna().sum() == 0:
        return dict(key=key, label=label, group=group, resolution=resolution,
                     status="no valid lag on train split")
    best_row = scan_df.loc[scan_df["train_level_corr"].abs().idxmax()]
    L = int(best_row["lag_h"])

    # descriptive full-overlap level corr at L* (illustrative only, NOT the honest test)
    lagged_full = time_shift(cand_aligned, L)
    m_full = valid & lagged_full.notna()
    full_level_corr = (float(np.corrcoef(nas_logpx[m_full].to_numpy(), lagged_full[m_full].to_numpy())[0, 1])
                        if m_full.sum() >= MIN_OBS else np.nan)

    # same-bar (0h) correlation, for reference only -- this is "moves WITH
    # Nasdaq right now", a different question from "leads Nasdaq", and is
    # deliberately excluded from the LAG_GRID_H candidate search itself.
    contemp_corr = (float(np.corrcoef(nas_logpx[valid].to_numpy(), cand_aligned[valid].to_numpy())[0, 1])
                     if valid.sum() >= MIN_OBS else np.nan)

    # -- 2. honest walk-forward test on TEST split, L fixed from train --
    cand_h_ago = time_shift(cand_aligned, L)               # candidate's own value L hours ago
    x = cand_aligned - cand_h_ago                            # candidate's realized change over last L hours (known now)
    nas_h_ahead = time_shift(nas_logpx, -L)                  # NAS100 value L hours from now (asof)
    y = nas_h_ahead - nas_logpx                               # NAS100 forward return over next L hours

    m = test_mask & x.notna() & y.notna()
    n_test = int(m.sum())
    if n_test < MIN_OBS:
        return dict(key=key, label=label, group=group, resolution=resolution,
                     best_lag_h=L, train_level_corr=float(best_row["train_level_corr"]),
                     full_level_corr=full_level_corr, contemp_corr=contemp_corr,
                     status="insufficient test-split overlap", n_test=n_test)

    xv, yv = x[m].to_numpy(), y[m].to_numpy()
    nw_lag_bars = max(1, int(L * BARS_PER_HOUR))
    st = cell_stats(xv, yv, nw_lag_bars, rng)

    verdict = "NO SIGNAL"
    if abs(st["ic"]) >= VERDICT_IC_FLOOR and st.get("p_null") is not None and np.isfinite(st.get("p_null", np.nan)) \
            and st["p_null"] < VERDICT_P_NULL and st["stable"]:
        verdict = "REAL"
    elif abs(full_level_corr) >= LEVEL_CORR_EYECATCH if np.isfinite(full_level_corr) else False:
        verdict = "SPURIOUS-LOOKING-ONLY"

    return dict(
        key=key, label=label, group=group, resolution=resolution, status="ok",
        best_lag_h=L, train_level_corr=round(float(best_row["train_level_corr"]), 4),
        full_level_corr=round(full_level_corr, 4) if np.isfinite(full_level_corr) else None,
        contemp_corr=round(contemp_corr, 4) if np.isfinite(contemp_corr) else None,
        n_test=n_test, ic=round(st["ic"], 4), nw_t=round(st["nw_t"], 3) if np.isfinite(st["nw_t"]) else None,
        p_null=round(st["p_null"], 4) if st["p_null"] is not None and np.isfinite(st["p_null"]) else None,
        hit=round(st["hit"], 4), ic_h1=round(st["ic_h1"], 4) if np.isfinite(st["ic_h1"]) else None,
        ic_h2=round(st["ic_h2"], 4) if np.isfinite(st["ic_h2"]) else None, stable=st["stable"],
        verdict=verdict,
    ), scan_df.assign(key=key)


# ============================================================================
# report
# ============================================================================
def write_report(results: list[dict], scans: list[pd.DataFrame], meta: dict):
    ok = [r for r in results if r.get("status") == "ok"]
    skipped = [r for r in results if r.get("status") != "ok"]

    summary_df = pd.DataFrame(ok).sort_values("ic", key=lambda s: s.abs(), ascending=False)
    summary_df.to_csv(OUT / "candidate_summary.csv", index=False)
    if scans:
        pd.concat(scans, ignore_index=True).to_csv(OUT / "lag_scan_full.csv", index=False)
    if skipped:
        pd.DataFrame(skipped).to_csv(OUT / "candidates_skipped.csv", index=False)

    lines = []
    lines.append("# NAS100 lead-lag scan -- lag-replay theory test")
    lines.append("")
    lines.append(f"NAS100 M15: {meta['nas_bars']:,} bars, {meta['nas_start']} .. {meta['nas_end']}")
    lines.append(f"Lag grid: {LAG_GRID_H[0]}-{LAG_GRID_H[-1]}h step {LAG_GRID_H[1]-LAG_GRID_H[0]}h "
                 f"({len(LAG_GRID_H)} points). Train/test split: {int(TRAIN_FRAC*100)}/{int((1-TRAIN_FRAC)*100)} "
                 f"chronological, lag selected on train only, honest stats scored on test only.")
    lines.append(f"Null draws per cell: {N_NULL}. Verdict = REAL requires |IC| >= {VERDICT_IC_FLOOR}, "
                 f"p_null < {VERDICT_P_NULL}, and split-half sign-stable.")
    lines.append("")
    lines.append("## Ranked table (by |honest test-split IC|)")
    lines.append("")
    cols = ["key", "group", "resolution", "contemp_corr", "best_lag_h", "full_level_corr", "ic", "p_null", "stable", "verdict"]
    header = "| " + " | ".join(cols) + " |"
    sep = "| " + " | ".join("---" for _ in cols) + " |"
    lines.append(header)
    lines.append(sep)
    for _, row in summary_df.iterrows():
        lines.append("| " + " | ".join(str(row.get(c, "")) for c in cols) + " |")
    if skipped:
        lines.append("")
        lines.append("## Skipped / insufficient data")
        for r in skipped:
            lines.append(f"- **{r['key']}** ({r.get('label','')}): {r['status']}")
    (OUT / "summary.md").write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines))


# ============================================================================
# main
# ============================================================================
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true", help="pull fresh OANDA+FRED+Yahoo data")
    ap.add_argument("--years", type=float, default=3.0, help="years of OANDA M15 history to pull")
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()

    if a.refresh:
        print("pulling OANDA M15...")
        pull_oanda_all(a.years)
        print("pulling FRED daily...")
        pull_fred()
        print("pulling Yahoo daily...")
        pull_yahoo()
        return

    oanda = {name: load_oanda(name) for name in OANDA_M15}
    oanda = {k: v for k, v in oanda.items() if v is not None}
    fred = load_fred()
    yahoo = {name: load_yahoo(name) for name in YAHOO}
    yahoo = {k: v for k, v in yahoo.items() if v is not None}

    if "nas100" not in oanda:
        raise SystemExit("no cached NAS100 M15 data -- run with --refresh first")

    nas_close = oanda["nas100"]
    nas_idx = nas_close.index
    nas_logpx = np.log(nas_close)
    print(f"NAS100 M15: {len(nas_close):,} bars, {nas_idx[0]} .. {nas_idx[-1]}")

    src = build_source_series(oanda, fred, yahoo)

    rng = np.random.default_rng(a.seed)
    results, scans = [], []
    for key, label, group, resolution in CANDIDATES:
        if key not in src:
            results.append(dict(key=key, label=label, group=group, resolution=resolution,
                                 status="source data unavailable"))
            print(f"  {key:32s} SKIP -- source unavailable")
            continue
        out = run_candidate(key, label, group, resolution, src[key], nas_logpx, nas_idx, rng)
        if isinstance(out, tuple):
            row, scan_df = out
            results.append(row)
            scans.append(scan_df)
            print(f"  {key:32s} lag={row.get('best_lag_h')}h  level_corr={row.get('full_level_corr')}  "
                  f"ic={row.get('ic')}  p_null={row.get('p_null')}  stable={row.get('stable')}  "
                  f"-> {row.get('verdict')}")
        else:
            results.append(out)
            print(f"  {key:32s} {out.get('status')}")

    meta = dict(nas_bars=len(nas_close), nas_start=str(nas_idx[0]), nas_end=str(nas_idx[-1]))
    write_report(results, scans, meta)
    print(f"\nwrote {OUT / 'candidate_summary.csv'}")
    print(f"wrote {OUT / 'summary.md'}")


if __name__ == "__main__":
    main()
