"""
Yield -> asset coupling test.

Question (from the COG/Alex thread, generalised off BTC):
  bond prices and yields are mechanically inverse; does a MOVE IN YIELDS carry
  any FORWARD, TRADEABLE information for equity indices and FX?

What this does that a naive correlation does not:
  * changes, not levels        -- levels of two trending series correlate spuriously
  * FORWARD returns            -- a contemporaneous correlation is not tradeable
  * signal lagged 1 day        -- index/FX closes are NOT synchronous with the 3pm ET
                                  yield print; without the lag, Europe/Asia "predictability"
                                  is just their close catching up to US news
  * Newey-West t-stats         -- overlapping h-day windows fake the sample size
  * circular-shift null        -- what |IC| does pure noise produce on THIS data?
  * split-half OOS             -- does the first half's sign survive into the second?
  * real vs breakeven split    -- bonds rally for opposite reasons; averaging them -> 0
  * h=0 contemporaneous pass   -- a positive control. If same-bar coupling is huge and
                                  forward coupling is nil, that IS the answer.

Usage:
    python -m analysis.yield_asset_coupling --refresh    # pull prices + FRED
    python -m analysis.yield_asset_coupling              # run the study
"""
from __future__ import annotations

import argparse
import io
import os
import re
import time
from pathlib import Path

import numpy as np
import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "analysis" / "output" / "yield_coupling"
OUT.mkdir(parents=True, exist_ok=True)

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

# -- universe: name -> (yahoo ticker, group) --------------------------------
ASSETS = {
    "SPX":    ("^GSPC",    "index_us"),
    "NDX":    ("^NDX",     "index_us"),
    "DJI":    ("^DJI",     "index_us"),
    "RUT":    ("^RUT",     "index_us"),    # small caps = most rate-sensitive
    "DAX":    ("^GDAXI",   "index_eu"),
    "FTSE":   ("^FTSE",    "index_eu"),
    "STOXX":  ("^STOXX50E", "index_eu"),
    "NIKKEI": ("^N225",    "index_asia"),
    "EURUSD": ("EURUSD=X", "fx"),
    "USDJPY": ("JPY=X",    "fx"),
    "GBPUSD": ("GBPUSD=X", "fx"),
    "AUDUSD": ("AUDUSD=X", "fx"),
    "USDCAD": ("CAD=X",    "fx"),
    "USDCHF": ("CHF=X",    "fx"),
    "NZDUSD": ("NZDUSD=X", "fx"),
    "GOLD":   ("GC=F",     "commod"),
    # bond ETFs: sanity anchors, not trade candidates
    "TLT":    ("TLT",      "bond"),
    "IEF":    ("IEF",      "bond"),
}

# FRED daily yield series. real/breakeven are the confound-busters: a bond rally
# driven by falling REAL yields (easier policy) is a different animal from one
# driven by falling breakevens (growth scare).
FRED = {
    "y2": "DGS2",
    "y10": "DGS10",
    "y30": "DGS30",
    "real10": "DFII10",   # 10y TIPS = real yield
    "be10": "T10YIE",     # 10y breakeven inflation
}
DRIVERS = ["y2", "y10", "y30", "slope", "real10", "be10"]

LOOKBACKS = [1, 5, 21]      # days over which the yield CHANGE is measured
HORIZONS = [1, 5, 21]       # days of forward asset return
SIGNAL_LAG = 1              # days: signal must be knowable before the entry close
N_NULL = 2000               # circular-shift draws
IC_SCREEN = 0.025           # only bootstrap cells above this |IC|
MIN_OBS = 400


# -- data -------------------------------------------------------------------
def fred_key() -> str:
    for cand in ["RegimeV2/.env", "bot/.env", "backtestSystem/.env"]:
        p = ROOT / cand
        if not p.exists():
            continue
        m = re.search(r"FRED_KEY\s*=\s*(\S+)", p.read_text(errors="ignore"))
        if m:
            return m.group(1).strip("\"'")
    k = os.environ.get("FRED_KEY") or os.environ.get("FRED_API_KEY")
    if k:
        return k
    raise SystemExit("no FRED key found")


def pull_fred(start="2005-01-01") -> pd.DataFrame:
    key = fred_key()
    cols = {}
    for name, sid in FRED.items():
        r = requests.get(
            "https://api.stlouisfed.org/fred/series/observations",
            params=dict(series_id=sid, api_key=key, file_type="json",
                        observation_start=start),
            timeout=60,
        )
        r.raise_for_status()
        vals = {}
        for o in r.json()["observations"]:
            v = o["value"]
            vals[pd.Timestamp(o["date"])] = np.nan if v in (".", "") else float(v)
        cols[name] = pd.Series(vals, name=name)
        print("  FRED %-8s %5d obs" % (sid, cols[name].notna().sum()))
    df = pd.DataFrame(cols).sort_index()
    df["slope"] = df["y10"] - df["y2"]
    df.to_csv(OUT / "yields.csv")
    return df


def pull_prices() -> None:
    for name, (tk, _grp) in ASSETS.items():
        try:
            r = requests.get(
                "https://query1.finance.yahoo.com/v8/finance/chart/" + tk,
                params={"range": "20y", "interval": "1d"}, headers=UA, timeout=40)
            res = r.json()["chart"]["result"]
            if not res:
                print("  %-7s no data" % name)
                continue
            res = res[0]
            idx = pd.to_datetime(res["timestamp"], unit="s", utc=True).tz_convert(None).normalize()
            close = pd.Series(res["indicators"]["quote"][0]["close"], index=idx, name="close")
            close = close.dropna()
            close = close[~close.index.duplicated(keep="last")]
            close.to_csv(OUT / ("px_%s.csv" % name))
            print("  %-7s %5d bars  %s..%s" % (name, len(close),
                                               close.index[0].date(), close.index[-1].date()))
        except Exception as e:
            print("  %-7s ERR %s" % (name, repr(e)[:90]))
        time.sleep(0.4)


def load_px(name: str):
    p = OUT / ("px_%s.csv" % name)
    if not p.exists():
        return None
    s = pd.read_csv(p, index_col=0, parse_dates=True)["close"]
    return s.sort_index()


# -- stats ------------------------------------------------------------------
def nw_t(x: np.ndarray, y: np.ndarray, lag: int) -> float:
    """Newey-West t-stat on the slope of y ~ a + b*x. lag absorbs the overlap."""
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


def rank_z(a: np.ndarray) -> np.ndarray:
    r = pd.Series(a).rank().to_numpy()
    r = r - r.mean()
    sd = r.std()
    return r / sd if sd > 0 else r


def null_p(xz: np.ndarray, yz: np.ndarray, ic: float, n_null: int, rng) -> float:
    """Circular-shift the driver; where does the real IC sit in the null?"""
    n = len(xz)
    if n < 120:
        return np.nan
    offs = rng.integers(30, n - 30, size=n_null)
    idx = (np.arange(n)[None, :] + offs[:, None]) % n
    null = (xz[idx] @ yz) / n
    return float((np.abs(null) >= abs(ic)).mean())


def cell_stats(x, y, nw_lag, rng, screen=IC_SCREEN):
    xz, yz = rank_z(x), rank_z(y)
    ic = float(xz @ yz / len(xz))
    half = len(x) // 2
    ic1 = float(rank_z(x[:half]) @ rank_z(y[:half]) / half)
    ic2 = float(rank_z(x[half:]) @ rank_z(y[half:]) / (len(x) - half))
    return dict(
        n=len(x), ic=ic, nw_t=nw_t(x, y, nw_lag),
        p_null=(null_p(xz, yz, ic, N_NULL, rng) if abs(ic) >= screen else np.nan),
        hit=float(np.mean(np.sign(-x) == np.sign(y))),
        ic_h1=ic1, ic_h2=ic2,
        stable=int(np.sign(ic1) == np.sign(ic2) and min(abs(ic1), abs(ic2)) > 0.02),
    )


# -- study ------------------------------------------------------------------
def align(name, yields):
    px = load_px(name)
    if px is None:
        return None
    y = yields.reindex(px.index.union(yields.index)).sort_index().ffill(limit=4)
    y = y.reindex(px.index)
    df = pd.concat([np.log(px).rename("lp"), y], axis=1)
    return df[~df.index.duplicated()].sort_index()


def run(yields, lag=SIGNAL_LAG) -> pd.DataFrame:
    rng = np.random.default_rng(7)
    rows = []
    for name, (_tk, grp) in ASSETS.items():
        df = align(name, yields)
        if df is None:
            print("  %-7s no price file" % name)
            continue
        for drv in DRIVERS:
            for k in LOOKBACKS:
                dy_raw = df[drv].diff(k)
                # contemporaneous control: same window, no lag, not tradeable
                m0 = pd.concat([dy_raw, df["lp"].diff(k)], axis=1).dropna()
                if len(m0) >= MIN_OBS:
                    st = cell_stats(m0.iloc[:, 0].to_numpy(), m0.iloc[:, 1].to_numpy(),
                                    k, rng)
                    rows.append(dict(asset=name, group=grp, driver=drv, lookback=k,
                                     horizon=0, tradeable=0, **st))
                dy = dy_raw.shift(lag)
                for h in HORIZONS:
                    fwd = df["lp"].shift(-h) - df["lp"]
                    m = pd.concat([dy, fwd], axis=1).dropna()
                    if len(m) < MIN_OBS:
                        continue
                    x, y_ = m.iloc[:, 0].to_numpy(), m.iloc[:, 1].to_numpy()
                    st = cell_stats(x, y_, h, rng)
                    q = pd.qcut(m.iloc[:, 0], 5, labels=False, duplicates="drop")
                    qm = m.iloc[:, 1].groupby(q).mean()
                    st["qspread_bp"] = (float(qm.iloc[0] - qm.iloc[-1]) * 1e4
                                        if len(qm) == 5 else np.nan)
                    rows.append(dict(asset=name, group=grp, driver=drv, lookback=k,
                                     horizon=h, tradeable=1, **st))
        print("  %-7s done" % name)
    out = pd.DataFrame(rows)
    out.to_csv(OUT / "study_main.csv", index=False)
    return out


def report(res: pd.DataFrame):
    pd.set_option("display.width", 240)
    pd.set_option("display.max_rows", 500)
    fmt = lambda v: "%8.4f" % v
    cols = ["asset", "driver", "lookback", "horizon", "n", "ic", "nw_t",
            "p_null", "hit", "ic_h1", "ic_h2", "stable"]

    con = res[res.tradeable == 0]
    fwd = res[res.tradeable == 1]

    print("\n" + "=" * 78)
    print("POSITIVE CONTROL - contemporaneous (same-window) coupling, NOT tradeable")
    print("=" * 78)
    piv = (con[con.lookback == 5].pivot_table(index="asset", columns="driver", values="ic")
             .reindex([a for a in ASSETS]))
    print(piv.to_string(float_format=fmt))

    print("\n" + "=" * 78)
    print("FORWARD (tradeable) - strongest 25 by |IC|")
    print("=" * 78)
    top = fwd.reindex(fwd.ic.abs().sort_values(ascending=False).index).head(25)
    print(top[cols].to_string(index=False, float_format=fmt))

    print("\n" + "=" * 78)
    print("SURVIVORS: sign-stable across halves AND p_null < 0.05")
    print("=" * 78)
    surv = fwd[(fwd.stable == 1) & (fwd.p_null < 0.05)]
    if len(surv):
        surv = surv.reindex(surv.ic.abs().sort_values(ascending=False).index)
        print(surv[cols + ["qspread_bp"]].to_string(index=False, float_format=fmt))
    else:
        print("  none")

    print("\n" + "=" * 78)
    print("SCALE CHECK - median |IC|, contemporaneous vs forward")
    print("=" * 78)
    print("  contemporaneous  median |IC| = %.4f   max |IC| = %.4f"
          % (con.ic.abs().median(), con.ic.abs().max()))
    print("  forward          median |IC| = %.4f   max |IC| = %.4f"
          % (fwd.ic.abs().median(), fwd.ic.abs().max()))
    print("  forward cells tested = %d ; |IC|>0.05 = %d ; survivors = %d"
          % (len(fwd), (fwd.ic.abs() > 0.05).sum(), len(surv)))
    print("  (with %d cells, ~%d false positives at p<0.05 are expected by luck)"
          % (len(fwd), round(len(fwd) * 0.05)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--prices-only", action="store_true")
    ap.add_argument("--fred-only", action="store_true")
    ap.add_argument("--lag", type=int, default=SIGNAL_LAG)
    a = ap.parse_args()

    if a.prices_only or a.refresh:
        print("pulling Yahoo daily bars...")
        pull_prices()
    if a.fred_only or a.refresh:
        print("pulling FRED...")
        pull_fred()
    if a.prices_only or a.fred_only or a.refresh:
        return

    yields = pd.read_csv(OUT / "yields.csv", index_col=0, parse_dates=True)
    print("running study (signal lag = %d day)..." % a.lag)
    res = run(yields, lag=a.lag)
    report(res)
    print("\nwrote %s" % (OUT / "study_main.csv"))


if __name__ == "__main__":
    main()
