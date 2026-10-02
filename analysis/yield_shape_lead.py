"""
Yield SHAPE lead test (not the daily-level-lag coupling test).

Question: does YESTERDAY's intraday yield path, overlaid on TODAY, give any lead on
today's intraday TREND DIRECTION over 15/30/60-min windows? This is a different
design from analysis/yield_asset_coupling.py (which lagged a single daily yield
CHANGE by 1 day and tested forward RETURN). Here we match same-time-of-day slots
across consecutive trading days and compare ROLLING SLOPE SIGN, which is the
"smoothed arrow direction" version of the TradingView overlay the owner is looking at.

Data: Yahoo chart API, 15m bars, 60d lookback (Yahoo's intraday cap -> ~40 trading
day-pairs per asset. Small sample -- treat results as a pilot, not a verdict).

Design points carried over from yield_asset_coupling.py:
  * yield(D-1) is the "template", asset(D) is what we're trying to lead -- the lag
    is a full trading day, never same-day.
  * sign-only slope, not level -- kills the "levels both trend" spurious-correlation trap.
  * placebo: shuffle which yield-day gets paired with which price-day (500 draws) to
    get the null hit-rate distribution this data/method produces by chance.
  * h=0 same-day pass as a positive control (does TODAY's yield shape match TODAY's
    price shape contemporaneously? if that's also weak, the pipeline/method is suspect,
    not the hypothesis).

Usage:
    python -m analysis.yield_shape_lead --refresh    # pull intraday Yahoo data
    python -m analysis.yield_shape_lead              # run the study
"""
from __future__ import annotations

import argparse
import time
from pathlib import Path

import numpy as np
import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "analysis" / "output" / "yield_shape_lead"
OUT.mkdir(parents=True, exist_ok=True)

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

ASSETS = {
    "EURUSD": "EURUSD=X",
    "GBPUSD": "GBPUSD=X",
    "USDJPY": "JPY=X",
    "AUDUSD": "AUDUSD=X",
    "USDCAD": "CAD=X",
    "USDCHF": "CHF=X",
    "NZDUSD": "NZDUSD=X",
    "SPX":    "^GSPC",
    "NDX":    "^NDX",
    "GOLD":   "GC=F",
}
YIELD_TICKER = "^TNX"   # CBOE 10yr yield index, intraday, free

WINDOWS_MIN = [15, 30, 60]
BAR_MIN = 15
N_PLACEBO = 500


def _fetch(ticker: str, interval="15m", rng="60d") -> pd.Series:
    r = requests.get(
        "https://query1.finance.yahoo.com/v8/finance/chart/" + ticker,
        params={"range": rng, "interval": interval}, headers=UA, timeout=40)
    res = r.json()["chart"]["result"]
    if not res:
        raise RuntimeError(f"{ticker}: no data ({r.json()['chart'].get('error')})")
    res = res[0]
    idx = pd.to_datetime(res["timestamp"], unit="s", utc=True)
    close = pd.Series(res["indicators"]["quote"][0]["close"], index=idx, name=ticker).dropna()
    return close[~close.index.duplicated(keep="last")].sort_index()


def refresh():
    print("pulling", YIELD_TICKER)
    _fetch(YIELD_TICKER).to_csv(OUT / "yield_TNX.csv")
    for name, tk in ASSETS.items():
        try:
            s = _fetch(tk)
            s.to_csv(OUT / f"px_{name}.csv")
            print(f"  {name:7s} {len(s):5d} bars  {s.index[0]} .. {s.index[-1]}")
        except Exception as e:
            print(f"  {name:7s} ERR {e!r}")
        time.sleep(0.4)


def _load(name: str) -> pd.Series:
    p = OUT / f"{name}.csv"
    df = pd.read_csv(p, index_col=0, parse_dates=True)
    return df.iloc[:, 0]


def _to_time_of_day_grid(s: pd.Series) -> pd.DataFrame:
    """Return a DataFrame indexed by (date, time-of-day bucket) -> value, snapped to a
    BAR_MIN clock grid so two different tickers' timestamps (which rarely land on the
    exact same second) can be compared slot-for-slot."""
    s = s.copy()
    s.index = s.index.tz_convert("UTC")
    bucket = s.index.floor(f"{BAR_MIN}min")
    df = pd.DataFrame({"value": s.values}, index=bucket)
    df = df.groupby(level=0).last()
    df["date"] = df.index.date
    df["tod"] = df.index.time
    return df


def _slope_signs(day_series: pd.Series, window_bars: int) -> pd.Series:
    """Sign of (value[t] - value[t-window_bars]) at each slot within a single day's
    time-of-day-indexed series."""
    diff = day_series.diff(window_bars)
    return np.sign(diff)


def pair_days(yield_df: pd.DataFrame, px_df: pd.DataFrame):
    """Yield-day D-1 paired with the NEXT trading day D present in px_df (gap 1-3
    calendar days to admit weekends), matched on time-of-day slots common to both."""
    y_dates = sorted(set(yield_df["date"]))
    p_dates = sorted(set(px_df["date"]))
    p_dates_arr = np.array(p_dates)
    pairs = []
    for d0 in y_dates:
        later = p_dates_arr[p_dates_arr > d0]
        if len(later) == 0:
            continue
        d1 = later[0]
        if (d1 - d0).days > 4:
            continue
        pairs.append((d0, d1))
    return pairs


def run_asset(name: str, yield_df: pd.DataFrame):
    px = _load(f"px_{name}")
    px_df = _to_time_of_day_grid(px)
    pairs = pair_days(yield_df, px_df)
    if len(pairs) < 10:
        print(f"  {name:7s} skip -- only {len(pairs)} day-pairs")
        return None

    y_by_date = {d: g.set_index("tod")["value"] for d, g in yield_df.groupby("date")}
    p_by_date = {d: g.set_index("tod")["value"] for d, g in px_df.groupby("date")}

    rows = []  # (pair_idx, window_min, y_sign, p_sign)
    for pi, (dy, dp) in enumerate(pairs):
        ys = y_by_date[dy]
        ps = p_by_date[dp]
        common_tod = sorted(set(ys.index) & set(ps.index))
        if len(common_tod) < max(WINDOWS_MIN) // BAR_MIN + 2:
            continue
        ys_c = ys.reindex(common_tod)
        ps_c = ps.reindex(common_tod)
        for w in WINDOWS_MIN:
            wb = w // BAR_MIN
            y_sign = _slope_signs(ys_c, wb)
            p_sign = _slope_signs(ps_c, wb)
            for t in common_tod:
                a, b = y_sign.get(t), p_sign.get(t)
                if pd.isna(a) or pd.isna(b) or a == 0 or b == 0:
                    continue
                rows.append((pi, w, int(a), int(b)))

    if not rows:
        print(f"  {name:7s} no usable slots")
        return None

    df = pd.DataFrame(rows, columns=["pair", "window", "y", "p"])
    out_rows = []
    rng = np.random.default_rng(42)
    n_pairs = len(pairs)
    for w, g in df.groupby("window"):
        n = len(g)
        hit = (g["y"] == g["p"]).mean()
        # placebo: shuffle pair-id -> pair-id mapping (break the D-1/D correspondence),
        # recompute hit rate, repeat N_PLACEBO times
        placebo_hits = np.empty(N_PLACEBO)
        pair_ids = g["pair"].values
        unique_pairs = np.unique(pair_ids)
        for k in range(N_PLACEBO):
            shuffled = rng.permutation(unique_pairs)
            mapping = dict(zip(unique_pairs, shuffled))
            remapped_pair = np.vectorize(mapping.get)(pair_ids)
            # pull p-values from a different (remapped) pair's y-slots at same count --
            # approximate via resampling y's sign vector against p's sign vector shuffled
            placebo_hits[k] = (g["y"].values == rng.permutation(g["p"].values)).mean()
        p_null_mean = placebo_hits.mean()
        p_null_std = placebo_hits.std()
        z = (hit - p_null_mean) / p_null_std if p_null_std > 0 else np.nan
        out_rows.append(dict(asset=name, window_min=w, n_slots=n, n_daypairs=n_pairs,
                              hit_rate=hit, placebo_mean=p_null_mean, placebo_std=p_null_std, z=z))
    return out_rows


def run_h0_control(name: str):
    """Same-day (contemporaneous) sign agreement -- positive control."""
    yield_s = _load("yield_TNX")
    yield_df = _to_time_of_day_grid(yield_s)
    px = _load(f"px_{name}")
    px_df = _to_time_of_day_grid(px)
    y_by_date = {d: g.set_index("tod")["value"] for d, g in yield_df.groupby("date")}
    p_by_date = {d: g.set_index("tod")["value"] for d, g in px_df.groupby("date")}
    common_dates = sorted(set(y_by_date) & set(p_by_date))
    rows = []
    for d in common_dates:
        ys, ps = y_by_date[d], p_by_date[d]
        common_tod = sorted(set(ys.index) & set(ps.index))
        if len(common_tod) < 6:
            continue
        ys_c, ps_c = ys.reindex(common_tod), ps.reindex(common_tod)
        for w in WINDOWS_MIN:
            wb = w // BAR_MIN
            y_sign = _slope_signs(ys_c, wb)
            p_sign = _slope_signs(ps_c, wb)
            for t in common_tod:
                a, b = y_sign.get(t), p_sign.get(t)
                if pd.isna(a) or pd.isna(b) or a == 0 or b == 0:
                    continue
                rows.append((w, int(a), int(b)))
    if not rows:
        return None
    df = pd.DataFrame(rows, columns=["window", "y", "p"])
    out = []
    for w, g in df.groupby("window"):
        out.append(dict(asset=name, window_min=w, n_slots=len(g),
                         hit_rate=(g["y"] == g["p"]).mean()))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args()
    if args.refresh:
        refresh()
        return

    yield_s = _load("yield_TNX")
    yield_df = _to_time_of_day_grid(yield_s)

    all_rows = []
    print(f"\n=== FORWARD: yield(D-1) shape -> price(D) slope sign, window={WINDOWS_MIN}min ===")
    for name in ASSETS:
        try:
            r = run_asset(name, yield_df)
            if r:
                all_rows.extend(r)
        except Exception as e:
            print(f"  {name:7s} ERR {e!r}")

    fwd = pd.DataFrame(all_rows)
    if not fwd.empty:
        fwd.to_csv(OUT / "forward_results.csv", index=False)
        print(fwd.to_string(index=False))

    print(f"\n=== CONTROL: same-day (h=0) contemporaneous slope sign agreement ===")
    h0_rows = []
    for name in ASSETS:
        try:
            r = run_h0_control(name)
            if r:
                h0_rows.extend(r)
        except Exception as e:
            print(f"  {name:7s} ERR {e!r}")
    h0 = pd.DataFrame(h0_rows)
    if not h0.empty:
        h0.to_csv(OUT / "h0_control.csv", index=False)
        print(h0.to_string(index=False))


if __name__ == "__main__":
    main()
