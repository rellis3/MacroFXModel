#!/usr/bin/env python3
"""Simulates execution of the real bot's zones (08_bot_backtest_zones.mjs's
output) against real EUR/USD M1 candles, mirroring oi_bot.py's actual
mechanics: a limit-style touch entry, a shared stop, a two-leg TP1/TP2
scale-out (TP1 banks half + moves the runner's stop to breakeven, matching
oi_bot.py's SCALE-OUT logic), and a mode-specific time exit
(max_hold_hours = {fade:48, break:24, maxpain:24} from oi_bot.py) that closes
whatever remains at market. Conservative tie-break: a bar that touches both
SL and a TP is scored as the SL (never assume the friendlier fill order).

A flat one-way cost of HALF_SPREAD_PRICE is charged on both entry and exit
(costs on by default, per MD files/CLAUDE.md).

Output: oi_research_book/data/results/bot_backtest_trades.csv (one row per
zone/trade) and bot_backtest_summary.csv (aggregated).
"""
import numpy as np
import pandas as pd
import json

DATA = "oi_research_book/data"
RES = f"{DATA}/results"
ZONES_PATH = f"{DATA}/bot_backtest/zones.jsonl"
M1_PATH = "VolRangeForecaster/data/m1/eurusd_m1.parquet"

MAX_HOLD_HOURS = {"fade": 48, "break": 24, "maxpain": 24}
HALF_SPREAD_PRICE = 0.00007  # ~0.7 pip round trip total, a conservative retail EUR/USD estimate
FILL_WINDOW_DAYS_CAP = 10    # a zone stops waiting to fill after this many calendar days (or its own DTE if smaller)


def load_m1():
    m1 = pd.read_parquet(M1_PATH).reset_index().rename(columns={"datetime": "ts"})
    m1["ts"] = pd.to_datetime(m1["ts"]).dt.tz_localize(None)
    m1 = m1.sort_values("ts").reset_index(drop=True)
    return m1


def load_zones():
    rows = []
    with open(ZONES_PATH) as f:
        for line in f:
            rows.append(json.loads(line))
    return rows


def simulate_zone(zone_date, dte, mode, side, entry, sl, tp1, tp2, spot_at_creation, ts, hi, lo, cl, start_idx):
    """ts/hi/lo/cl are full-array numpy views into the M1 data; start_idx is the
    first bar index at/after the zone's own trading day (T+1 already applied
    by the caller). Returns a dict describing the outcome, or None if the
    entry never filled within the window.

    Fill direction is about GEOMETRY, not the buy/sell label: an entry placed
    ABOVE spot needs price to RISE to reach it (a fade SELL at a call wall
    above price, or a breakout BUY stop above price -- both fill on a rally
    through the level); an entry BELOW spot needs price to FALL (a fade BUY
    at a put wall below price, or a breakout SELL stop below price). Keying
    the fill condition off is_buy instead of this geometry silently filled
    breakout stop orders backwards -- confirmed by inspecting real zone output
    (386/421 sampled breakout buys sit ABOVE spot, needing a high>=entry fill,
    not the low<=entry a naive "buy = wait for price to fall" rule assumes).
    """
    n = len(ts)
    fill_window_days = min(dte, FILL_WINDOW_DAYS_CAP)
    fill_deadline = np.datetime64(zone_date) + np.timedelta64(fill_window_days, "D")
    end_fill = np.searchsorted(ts, fill_deadline)
    end_fill = min(end_fill, n)
    if start_idx >= end_fill:
        return None

    is_buy = side == "buy"
    entry_above_spot = entry >= spot_at_creation
    if entry_above_spot:
        fill_mask = hi[start_idx:end_fill] >= entry
    else:
        fill_mask = lo[start_idx:end_fill] <= entry
    hits = np.flatnonzero(fill_mask)
    if len(hits) == 0:
        return {"outcome": "never_filled"}
    i_fill = start_idx + hits[0]

    risk = abs(entry - sl)
    if risk <= 0:
        return {"outcome": "bad_zone"}

    cap_h = MAX_HOLD_HOURS.get(mode, 24)
    time_exit_deadline = ts[i_fill] + np.timedelta64(int(cap_h * 60), "m")
    end_exec = np.searchsorted(ts, time_exit_deadline)
    end_exec = min(end_exec, n)

    has_tp1 = tp1 is not None
    two_leg = has_tp1 and tp2 is not None
    frac1 = 0.5 if two_leg else 1.0
    frac2 = 0.5 if two_leg else 0.0

    def r_of(price):
        raw = (price - entry) if is_buy else (entry - price)
        return raw / risk

    leg1_open, leg2_open = True, two_leg
    leg1_r, leg2_r = None, None
    stop2 = sl  # leg2's stop; moves to entry (breakeven) once TP1 banks

    j = i_fill + 1
    while j < end_exec and (leg1_open or leg2_open):
        bar_hi, bar_lo = hi[j], lo[j]
        sl_hit = (bar_lo <= sl) if is_buy else (bar_hi >= sl)
        tp1_hit = leg1_open and has_tp1 and ((bar_hi >= tp1) if is_buy else (bar_lo <= tp1))
        if leg1_open:
            if sl_hit:
                leg1_r = -1.0
                leg1_open = False
                if leg2_open:
                    leg2_r = -1.0
                    leg2_open = False
            elif tp1_hit:
                leg1_r = r_of(tp1)
                leg1_open = False
                if not two_leg:
                    leg2_open = False
        if leg2_open:
            stop2_hit = (bar_lo <= stop2) if is_buy else (bar_hi >= stop2)
            tp2_hit = (bar_hi >= tp2) if is_buy else (bar_lo <= tp2)
            if stop2_hit and not leg1_open:  # only relevant once leg1 has moved this to BE
                leg2_r = r_of(stop2)
                leg2_open = False
            elif tp2_hit:
                leg2_r = r_of(tp2)
                leg2_open = False
        j += 1

    exit_reason = "barrier"
    if leg1_open or leg2_open:
        exit_reason = "time_exit"
        mark = cl[min(j, n - 1)]
        if leg1_open:
            leg1_r = r_of(mark)
        if leg2_open:
            leg2_r = r_of(mark)

    cost_r = HALF_SPREAD_PRICE / risk  # charged once (entry+exit combined estimate) per leg
    total_r = frac1 * ((leg1_r or 0) - cost_r) + frac2 * ((leg2_r or 0) - cost_r if two_leg else 0)
    return {
        "outcome": "traded", "fill_ts": ts[i_fill], "exit_reason": exit_reason,
        "leg1_r": leg1_r, "leg2_r": leg2_r, "total_r": total_r, "two_leg": two_leg,
        "hold_bars": j - i_fill,
    }


def main():
    m1 = load_m1()
    ts = m1["ts"].values
    hi, lo, cl = m1["high"].values, m1["low"].values, m1["close"].values

    zones_days = load_zones()
    trades = []
    for day in zones_days:
        zdate = np.datetime64(day["date"]) + np.timedelta64(1, "D")  # tradeable starting the next day
        start_idx = np.searchsorted(ts, zdate)
        if start_idx >= len(ts):
            continue
        for z in day["zones"]:
            if z.get("tp1") is None and z.get("sl") is None:
                continue
            res = simulate_zone(zdate, day["dte"], z["mode"], z["side"], z["entry"], z["sl"],
                                 z.get("tp1"), z.get("tp2"), day["spot"], ts, hi, lo, cl, start_idx)
            if res is None or res.get("outcome") != "traded":
                trades.append({"date": day["date"], "mode": z["mode"], "side": z["side"],
                                "regime": day["regime"], "entry": z["entry"], "sl": z["sl"],
                                "tp1": z.get("tp1"), "tp2": z.get("tp2"),
                                "outcome": res["outcome"] if res else "no_data", "total_r": np.nan})
            else:
                trades.append({"date": day["date"], "mode": z["mode"], "side": z["side"],
                                "regime": day["regime"], "entry": z["entry"], "sl": z["sl"],
                                "tp1": z.get("tp1"), "tp2": z.get("tp2"),
                                "outcome": "traded", "exit_reason": res["exit_reason"],
                                "total_r": res["total_r"], "hold_bars": res["hold_bars"]})

    df = pd.DataFrame(trades)
    df.to_csv(f"{RES}/bot_backtest_trades.csv", index=False)
    print(f"Total zones considered: {len(df)}")
    print(df["outcome"].value_counts())

    filled = df[df["outcome"] == "traded"].copy()
    filled["date"] = pd.to_datetime(filled["date"])
    filled = filled.sort_values("date").reset_index(drop=True)
    print(f"\nFilled trades: {len(filled)} ({len(filled)/max(len(df),1)*100:.1f}% of zones ever filled)")

    def summarize(g, label):
        n = len(g)
        if n == 0:
            return {"segment": label, "n_trades": 0}
        r = g["total_r"]
        return {
            "segment": label, "n_trades": n,
            "win_rate_pct": (r > 0).mean() * 100,
            "mean_r": r.mean(), "median_r": r.median(), "sum_r": r.sum(),
            "std_r": r.std(), "sharpe_like": r.mean() / r.std() if r.std() > 0 else np.nan,
            "worst_r": r.min(), "best_r": r.max(),
        }

    rows = [summarize(filled, "ALL")]
    for mode, g in filled.groupby("mode"):
        rows.append(summarize(g, f"mode={mode}"))

    n = len(filled)
    if n >= 30:
        i1, i2 = int(n * 0.6), int(n * 0.8)
        rows.append(summarize(filled.iloc[:i1], "IS (first 60%)"))
        rows.append(summarize(filled.iloc[i1:i2], "validation (20%)"))
        rows.append(summarize(filled.iloc[i2:], "OOS (last 20%)"))

    summary = pd.DataFrame(rows)
    summary.to_csv(f"{RES}/bot_backtest_summary.csv", index=False)
    print("\n=== OI bot backtest summary (real production zone logic, real M1 execution) ===")
    print(summary.to_string(index=False))


if __name__ == "__main__":
    main()
