#!/usr/bin/env python3
"""Intraday validation pass, using R2 M1 candles instead of daily OHLC.

Motivation: Part 8 of the book (wall rejection vs. break) ran on daily OHLC
and explicitly flagged its own weakness -- only 35-80 touch events per
bucket, no significance test run. It also had a subtler issue: the wall
level used to classify a day's high/low was that SAME day's own OI-derived
level, which technically isn't "known" until that day's CME settlement
report lands -- not a clean predictive setup, even though walls are sticky
enough (Part 4: 88-95% unchanged day/day) that it's usually also yesterday's
level in practice.

This script fixes both: every wall/gamma level applied to a trading day's
minute bars is the value as of the PRIOR trading day's close (genuinely
known before that day starts, no lookahead), and every wall touch across
the whole day is detected and classified at minute resolution, not just
the day's single close vs. its own high/low.

Output: oi_research_book/data/results/intraday_touch_events.csv and
intraday_touch_summary.csv, cited in RESEARCH_BOOK.md Part 12.
"""
import sys
import numpy as np
import pandas as pd
from scipy import stats
from pair_config import cfg, suffix

PAIR = sys.argv[2] if len(sys.argv) > 2 else "EUR_USD"
_CFG = cfg(PAIR)
_SUFFIX = suffix(PAIR)
_PIP = _CFG["pip_size"]

DATA = "oi_research_book/data"
RES = f"{DATA}/results"
M1_PATH = sys.argv[1] if len(sys.argv) > 1 else f"VolRangeForecaster/data/m1/{_CFG['price_file']}_m1.parquet"

TOUCH_BUFFER = 2 * _PIP    # how close counts as "touching" the level -- was hardcoded to
REARM_MARGIN = 5 * _PIP    # EUR/USD's 0.0001 pip; JPY pairs use 0.01, indices use 1
HORIZONS_MIN = [15, 60, 240, 1440]  # 1440min = "by end of the next full day" ceiling


def load_m1(path):
    m1 = pd.read_parquet(path)
    m1 = m1.reset_index().rename(columns={"datetime": "ts"})
    m1["ts"] = pd.to_datetime(m1["ts"]).dt.tz_localize(None)
    m1["date"] = m1["ts"].dt.normalize()
    return m1[["ts", "date", "open", "high", "low", "close"]].sort_values("ts").reset_index(drop=True)


def load_lagged_levels():
    d = pd.read_parquet(f"{DATA}/daily_master_all{_SUFFIX}.parquet").sort_values("date").reset_index(drop=True)
    d["date"] = pd.to_datetime(d["date"]).dt.tz_localize(None)
    keep = ["date", "call_wall_a", "put_wall_a", "gamma_flip", "call_wall_a_oi", "put_wall_a_oi"]
    lagged = d[keep].copy()
    # shift levels down one row: the row now labeled with date D actually carries
    # date D-1's (the prior trading day's) level -- i.e. what was knowable
    # before trading on D began.
    for c in ["call_wall_a", "put_wall_a", "gamma_flip", "call_wall_a_oi", "put_wall_a_oi"]:
        lagged[c] = lagged[c].shift(1)
    return lagged


def detect_touch_events(m1, levels, wall_col, side):
    """side='call' -> approached from below (price rising into it);
    side='put' -> approached from above (price falling into it)."""
    merged = m1.merge(levels[["date", wall_col]], on="date", how="inner")
    merged = merged[merged[wall_col].notna()].reset_index(drop=True)
    events = []

    for date, g in merged.groupby("date", sort=False):
        g = g.reset_index(drop=True)
        W = g[wall_col].iloc[0]
        n = len(g)
        highs, lows, closes = g["high"].values, g["low"].values, g["close"].values
        ts = g["ts"].values

        if side == "call":
            ready = closes[0] < W - REARM_MARGIN
        else:
            ready = closes[0] > W + REARM_MARGIN

        i = 0
        while i < n:
            if side == "call":
                if ready and highs[i] >= W - TOUCH_BUFFER:
                    events.append(_classify_event(g, i, W, side, date))
                    ready = False
                elif not ready and closes[i] < W - REARM_MARGIN:
                    ready = True
            else:
                if ready and lows[i] <= W + TOUCH_BUFFER:
                    events.append(_classify_event(g, i, W, side, date))
                    ready = False
                elif not ready and closes[i] > W + REARM_MARGIN:
                    ready = True
            i += 1
    return pd.DataFrame(events)


def _classify_event(g, i, W, side, date):
    row = {"date": date, "side": side, "level": W, "touch_ts": g["ts"].iloc[i], "touch_close": g["close"].iloc[i]}
    for h in HORIZONS_MIN:
        j = i + h  # M1 bars -> h minutes ahead
        if j >= len(g):
            row[f"outcome_{h}m"] = np.nan
            row[f"fwd_ret_{h}m"] = np.nan
            continue
        px = g["close"].iloc[j]
        row[f"fwd_ret_{h}m"] = (px / g["close"].iloc[i]) - 1
        if side == "call":
            row[f"outcome_{h}m"] = "break" if px > W else "reject"
        else:
            row[f"outcome_{h}m"] = "break" if px < W else "reject"
    return row


def summarize(events, horizons=HORIZONS_MIN):
    rows = []
    for side, g_side in events.groupby("side"):
        for h in horizons:
            col_out, col_ret = f"outcome_{h}m", f"fwd_ret_{h}m"
            valid = g_side[g_side[col_out].notna()]
            n = len(valid)
            if n == 0:
                continue
            n_break = (valid[col_out] == "break").sum()
            # continuation direction for a "call" break is +return; "put" break is -return
            expect_sign = 1 if side == "call" else -1
            mean_ret_break = valid.loc[valid[col_out] == "break", col_ret].mean()
            mean_ret_reject = valid.loc[valid[col_out] == "reject", col_ret].mean()
            rows.append({
                "side": side, "horizon_min": h, "n_events": n,
                "pct_break": n_break / n * 100, "pct_reject": 100 - n_break / n * 100,
                "mean_fwd_ret_break_pct": mean_ret_break * 100 if pd.notna(mean_ret_break) else np.nan,
                "mean_fwd_ret_reject_pct": mean_ret_reject * 100 if pd.notna(mean_ret_reject) else np.nan,
            })
    return pd.DataFrame(rows)


def binomial_test_vs_half(summary):
    """Is the break rate different from a coin flip at each horizon?"""
    pvals = []
    for _, r in summary.iterrows():
        n = r["n_events"]
        k = int(round(r["pct_break"] / 100 * n))
        res = stats.binomtest(k, n, 0.5, alternative="two-sided")
        pvals.append(res.pvalue)
    summary = summary.copy()
    summary["binom_p_vs_50pct"] = pvals
    return summary


def gamma_regime_intraday(m1, levels):
    """Finer-grained replication of Part 5's regime test: per-minute
    realized range while spot sits on each side of the T-1 gamma flip,
    aggregated PER DAY (not per minute, to avoid pseudo-replication from
    autocorrelated 1-minute bars) so the sample size is still ~1 obs/day
    but the regime label and the day's realized behaviour are now computed
    from the actual intraday path rather than a single close-to-close return.
    """
    merged = m1.merge(levels[["date", "gamma_flip"]], on="date", how="inner")
    merged = merged[merged["gamma_flip"].notna()].copy()
    merged["minute_ret"] = np.log(merged["close"] / merged["close"].shift(1))
    merged.loc[merged["date"] != merged["date"].shift(1), "minute_ret"] = np.nan

    rows = []
    for date, g in merged.groupby("date", sort=False):
        flip = g["gamma_flip"].iloc[0]
        above_frac = (g["close"] > flip).mean()
        regime = "above_flip" if above_frac > 0.5 else "below_flip"
        rows.append({
            "date": date, "regime": regime,
            "intraday_realized_vol_ann": g["minute_ret"].std() * np.sqrt(252 * 1440),
            "intraday_range_pct": (g["high"].max() - g["low"].min()) / g["close"].iloc[0] * 100,
            "n_bars": len(g),
        })
    daily = pd.DataFrame(rows)
    daily.to_csv(f"{RES}/intraday_gamma_regime_daily{_SUFFIX}.csv", index=False)

    summary = daily.groupby("regime").agg(
        n_days=("date", "count"),
        mean_intraday_range_pct=("intraday_range_pct", "mean"),
        mean_intraday_rv_ann=("intraday_realized_vol_ann", "mean"),
    ).reset_index()
    above = daily.loc[daily.regime == "above_flip", "intraday_range_pct"]
    below = daily.loc[daily.regime == "below_flip", "intraday_range_pct"]
    _, p = stats.mannwhitneyu(above, below, alternative="two-sided")
    summary["mannwhitney_p_range_above_vs_below"] = p
    summary.to_csv(f"{RES}/intraday_gamma_regime_summary{_SUFFIX}.csv", index=False)
    print("\n=== Intraday-derived gamma-flip regime test (T-1 flip, per-day intraday range) ===")
    print(summary.to_string(index=False))
    return daily, summary


def wall_strength_vs_intraday_outcome(events, levels, horizon=60):
    oi_col = {"call": "call_wall_a_oi", "put": "put_wall_a_oi"}
    rows = []
    for side, g in events.groupby("side"):
        lv = levels[["date", oi_col[side]]].rename(columns={oi_col[side]: "oi"})
        g = g.merge(lv, on="date", how="left")
        g = g[g["oi"].notna() & g[f"outcome_{horizon}m"].notna()].copy()
        g["oi_tercile"] = pd.qcut(g["oi"].rank(method="first"), 3, labels=["weak", "mid", "strong"])
        for t, gt in g.groupby("oi_tercile", observed=True):
            n = len(gt)
            n_break = (gt[f"outcome_{horizon}m"] == "break").sum()
            rows.append({"side": side, "oi_tercile": t, "n_events": n, "pct_break": n_break / n * 100 if n else np.nan})
    out = pd.DataFrame(rows)
    out.to_csv(f"{RES}/intraday_wall_strength_vs_outcome{_SUFFIX}.csv", index=False)
    print(f"\n=== Wall-OI-strength tercile vs {horizon}-min break rate (intraday events) ===")
    print(out.to_string(index=False))
    return out


def main():
    m1 = load_m1(M1_PATH)
    levels = load_lagged_levels()
    print(f"M1 bars: {len(m1):,}  ({m1['date'].min().date()} -> {m1['date'].max().date()})")
    print(f"Daily levels (lagged, T-1): {levels['call_wall_a'].notna().sum():,} usable days")

    call_events = detect_touch_events(m1, levels, "call_wall_a", "call")
    put_events = detect_touch_events(m1, levels, "put_wall_a", "put")
    events = pd.concat([call_events, put_events], ignore_index=True)
    events.to_csv(f"{RES}/intraday_touch_events{_SUFFIX}.csv", index=False)
    print(f"\nDetected {len(call_events):,} call-wall touch events and {len(put_events):,} put-wall touch events "
          f"(vs. 35 and 39 same-day-close 'break' counts derived from daily bars in Part 8).")

    summary = summarize(events)
    summary = binomial_test_vs_half(summary)
    summary.to_csv(f"{RES}/intraday_touch_summary{_SUFFIX}.csv", index=False)
    print("\n=== Intraday wall-touch outcomes by horizon (T-1 known level, real minute-bar classification) ===")
    print(summary.to_string(index=False))

    wall_strength_vs_intraday_outcome(events, levels, horizon=60)
    wall_strength_vs_intraday_outcome(events, levels, horizon=240)

    gamma_regime_intraday(m1, levels)


if __name__ == "__main__":
    main()
