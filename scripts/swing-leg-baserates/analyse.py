#!/usr/bin/env python3
"""swing-leg-baserates: EXPLORATORY, not pre-registered (register row swing-leg-baserates).

The gold chart's frame, run on 10 years of daily closes for 18 instruments, everything in each instrument's own
volatility units so FX, metals and indices pool:

  sigma_d      trailing 60-day stdev of daily log returns, known at the close of day t (no lookahead)
  1. Legs      zigzag on closes; a leg ends when price reverses by REV x sigma_d (sigma at the extreme) from its
               extreme. Leg size in sigma units = |log move| / sigma_d at the leg's start. Duration in sessions.
  2. Survival  for legs that have already travelled X sigma, how much further did they go? (The honest form of
               "this leg is already the size where the others ran out".)
  3. State     the gold-chart condition, vol-normalised: drawdown from the 252-day high >= D annual-sigma units,
               RSI(14) < 30 and a 20-day closing low (mirror for rallies). First signal, then 20 sessions blocked.
               Forward: 20-day return, 60-day further adverse move and best favourable move, all in sigma*sqrt(h).
  4. Order     which barrier is hit first: bounce +UP or flush -DN (in sigma_d*sqrt(20) units), and the median
               sessions to each. Compared against the same barriers from EVERY day (the placebo baseline).

Sources: m15 (primary) = the repo's OANDA M15 closes cut at 17:00 New York, 11 instruments, 2018-01 -> 2026-10-07;
yahoo (robustness) = Yahoo daily, 18 instruments, 2016-01 -> today (different close hour; gold/silver are futures).
Run: python scripts/swing-leg-baserates/analyse.py m15   and   ... analyse.py yahoo

Outcomes only for signals whose forward window closes on or before the lockbox date 2026-08-21. Bootstrap: blocks
of calendar months of the signal date (signals on the same month across instruments are correlated), 2,000 draws,
seed 20261101. The current reading for each instrument uses data to the latest bar (display only, never scored).
"""
import json, os, glob, sys
import numpy as np
import pandas as pd

SEED = 20261101
LOCKBOX = pd.Timestamp("2026-08-21")
DIR = "analysis/output/swing-leg-baserates"
REV = 6.0                      # leg reversal threshold in daily sigmas (gold: ~1.3% x 6 = ~8%, close to the chart's ~10% swings)
UP, DN = 0.75, 0.45            # first-passage barriers in sigma_d*sqrt(20): gold's +5% / -3% at sigma 1.5% are ~0.75 / ~0.45
DEPTHS = [1.0, 1.5]            # drawdown from the 252-day extreme, in annualised sigma units (gold 2026: about 1.5)
H20, H60 = 20, 60
rng = np.random.default_rng(SEED)
SRC = sys.argv[1] if len(sys.argv) > 1 else "m15"          # m15 = OANDA NY-close (primary), yahoo = robustness
SUB = {"m15": "daily_m15", "yahoo": "daily"}[SRC]


def load(path):
    d = pd.read_csv(path, parse_dates=["date"]).set_index("date").sort_index()
    d = d[d.index.dayofweek < 5]
    d = d[~d.index.duplicated(keep="last")]
    d["r"] = np.log(d["close"]).diff()
    d = d[d["r"].abs() < 0.25]                               # drop Yahoo glitch prints (none expected; counted below)
    d["r"] = np.log(d["close"]).diff()
    d["sig"] = d["r"].rolling(60, min_periods=40).std()
    delta = d["close"].diff()
    up = delta.clip(lower=0).ewm(alpha=1 / 14, adjust=False).mean()
    dn = (-delta.clip(upper=0)).ewm(alpha=1 / 14, adjust=False).mean()
    d["rsi"] = 100 - 100 / (1 + up / dn.replace(0, np.nan))
    d["hi252"] = d["close"].rolling(252, min_periods=200).max()
    d["lo252"] = d["close"].rolling(252, min_periods=200).min()
    d["lo20"] = d["close"].rolling(20).min()
    d["hi20"] = d["close"].rolling(20).max()
    return d.dropna(subset=["sig"])


def zigzag(d):
    """Legs on closes. Confirmation is only known once price reverses REV sigma from the extreme; the leg table is
    descriptive (sizes of completed legs), the survival read below uses only the size travelled so far."""
    c, s, idx = d["close"].to_numpy(), d["sig"].to_numpy(), d.index
    legs = []
    # undecided until price has moved REV sigma from the running high or low; that extreme becomes the first pivot
    hi_i = lo_i = 0
    direction, start_i, ext_i = 0, 0, 0
    for i in range(1, len(c)):
        if direction == 0:
            if c[i] > c[hi_i]: hi_i = i
            if c[i] < c[lo_i]: lo_i = i
            if np.log(c[hi_i] / c[i]) >= REV * s[hi_i]:
                direction, start_i, ext_i = -1, hi_i, i
            elif np.log(c[i] / c[lo_i]) >= REV * s[lo_i]:
                direction, start_i, ext_i = 1, lo_i, i
            continue
        if direction == 1:
            if c[i] >= c[ext_i]:
                ext_i = i
            elif np.log(c[ext_i] / c[i]) >= REV * s[ext_i]:
                legs.append((start_i, ext_i, 1))
                direction, start_i, ext_i = -1, ext_i, i
        else:
            if c[i] <= c[ext_i]:
                ext_i = i
            elif np.log(c[i] / c[ext_i]) >= REV * s[ext_i]:
                legs.append((start_i, ext_i, -1))
                direction, start_i, ext_i = 1, ext_i, i
    rows = []
    for a, b, sgn in legs:
        mv = np.log(c[b] / c[a])
        rows.append({"start": idx[a], "end": idx[b], "dir": "up" if sgn > 0 else "down", "pct": (np.exp(mv) - 1) * 100,
                     "sigma_units": abs(mv) / s[a], "days": b - a})
    live = {"start": idx[start_i], "dir": "up" if direction > 0 else "down",
            "pct_so_far": (c[-1] / c[start_i] - 1) * 100, "sigma_so_far": abs(np.log(c[-1] / c[start_i])) / s[start_i],
            "days_so_far": len(c) - 1 - start_i}
    return pd.DataFrame(rows), live


def first_passage(c, s, i, up, dn, sign, horizon=H60):
    """sign=+1: bounce = price up. Returns ('bounce'|'flush'|'none', sessions)."""
    unit = s[i] * np.sqrt(H20)
    for j in range(i + 1, min(i + 1 + horizon, len(c))):
        m = sign * np.log(c[j] / c[i]) / unit
        if m >= up:
            return "bounce", j - i
        if m <= -dn:
            return "flush", j - i
    return "none", None


def signals(d, depth, side):
    """side='down': extended fall (bounce = up). side='up': extended rally (bounce = down)."""
    ann = d["sig"] * np.sqrt(252)
    if side == "down":
        dd = np.log(d["hi252"] / d["close"]) / ann
        cond = (dd >= depth) & (d["rsi"] < 30) & (d["close"] <= d["lo20"])
    else:
        dd = np.log(d["close"] / d["lo252"]) / ann
        cond = (dd >= depth) & (d["rsi"] > 70) & (d["close"] >= d["hi20"])
    out, block = [], -10**9
    pos = np.flatnonzero(cond.to_numpy())
    for p in pos:
        if p - block < H20:
            continue
        block = p
        out.append(p)
    return out


def outcomes(d, positions, side):
    c, s, idx = d["close"].to_numpy(), d["sig"].to_numpy(), d.index
    sign = 1 if side == "down" else -1
    rows = []
    for p in positions:
        if p + H60 >= len(c) or idx[min(p + H60, len(c) - 1)] > LOCKBOX:
            continue
        u20 = s[p] * np.sqrt(H20)
        u60 = s[p] * np.sqrt(H60)
        path = sign * np.log(c[p + 1:p + 1 + H60] / c[p])
        fp, n = first_passage(c, s, p, UP, DN, sign)
        rows.append({"date": idx[p], "ret20": sign * np.log(c[p + H20] / c[p]) / u20,
                     "adverse60": -path.min() / u60, "favour60": path.max() / u60,
                     "first": fp, "days": n})
    return pd.DataFrame(rows)


def boot_ci(df, stat, n=2000):
    if len(df) < 3:
        return [None, None]
    months = df["date"].dt.to_period("M")
    groups = [g for _, g in df.groupby(months)]
    vals = []
    for _ in range(n):
        pick = rng.integers(0, len(groups), len(groups))
        vals.append(stat(pd.concat([groups[k] for k in pick])))
    return [round(float(np.nanpercentile(vals, 2.5)), 3), round(float(np.nanpercentile(vals, 97.5)), 3)]


def summary(df):
    if df.empty:
        return {"n": 0}
    pb = lambda x: float((x["first"] == "bounce").mean())
    return {"n": int(len(df)), "first_date": str(df["date"].min().date()), "last_date": str(df["date"].max().date()),
            "ret20_mean": round(float(df["ret20"].mean()), 3), "ret20_median": round(float(df["ret20"].median()), 3),
            "ret20_win": round(float((df["ret20"] > 0).mean()), 3),
            "ret20_mean_ci": boot_ci(df, lambda x: x["ret20"].mean()),
            "adverse60_median": round(float(df["adverse60"].median()), 3),
            "adverse60_p75": round(float(df["adverse60"].quantile(0.75)), 3),
            "favour60_median": round(float(df["favour60"].median()), 3),
            "p_bounce_first": round(pb(df), 3), "p_bounce_first_ci": boot_ci(df, pb),
            "p_neither_60d": round(float((df["first"] == "none").mean()), 3),
            "days_to_bounce_median": float(df.loc[df["first"] == "bounce", "days"].median()) if (df["first"] == "bounce").any() else None,
            "days_to_flush_median": float(df.loc[df["first"] == "flush", "days"].median()) if (df["first"] == "flush").any() else None}


def main():
    data = {os.path.basename(p)[:-4]: load(p) for p in sorted(glob.glob(f"{DIR}/{SUB}/*.csv"))}
    leg_tables, live, state_rows, base_rows = [], {}, {}, {"down": [], "up": []}
    for k, d in data.items():
        legs, lv = zigzag(d)
        legs["inst"] = k
        leg_tables.append(legs)
        live[k] = lv
        # placebo baseline: every 5th day (non-overlapping-ish), same barriers, both directions
        for side in ("down", "up"):
            base_rows[side].append(outcomes(d, list(range(260, len(d), 5)), side).assign(inst=k))
            for depth in DEPTHS:
                o = outcomes(d, signals(d, depth, side), side).assign(inst=k)
                state_rows.setdefault((side, depth), []).append(o)
    legs = pd.concat(leg_tables, ignore_index=True)
    legs_scored = legs[legs["end"] <= LOCKBOX]

    # 1. leg distributions (sigma units), pooled and per instrument
    q = lambda x: {"n": int(len(x)), "median": round(float(x.median()), 2), "p25": round(float(x.quantile(.25)), 2),
                   "p75": round(float(x.quantile(.75)), 2), "p90": round(float(x.quantile(.9)), 2)}
    leg_dist = {dr: {"sigma_units": q(g["sigma_units"]), "days": q(g["days"]), "pct": q(g["pct"].abs())}
                for dr, g in legs_scored.groupby("dir")}
    per_inst = {k: {dr: {"n": int(len(g)), "median_sigma": round(float(g["sigma_units"].median()), 2),
                         "median_pct": round(float(g["pct"].abs().median()), 2), "median_days": float(g["days"].median())}
                    for dr, g in legs_scored[legs_scored["inst"] == k].groupby("dir")} for k in data}

    # 2. survival: given a leg has travelled at least X sigma, P(it goes at least +2 / +4 sigma further) and median extra
    surv = {}
    for dr, g in legs_scored.groupby("dir"):
        rows = []
        for x in [6, 8, 10, 12, 15, 20]:
            gg = g[g["sigma_units"] >= x]
            extra = gg["sigma_units"] - x
            rows.append({"travelled": x, "n": int(len(gg)), "share_of_legs": round(len(gg) / len(g), 3),
                         "p_extra_ge_2": round(float((extra >= 2).mean()), 3) if len(gg) else None,
                         "p_extra_ge_4": round(float((extra >= 4).mean()), 3) if len(gg) else None,
                         "median_extra": round(float(extra.median()), 2) if len(gg) else None})
        surv[dr] = rows

    # 3/4. state base rates vs the every-day baseline
    base = {side: summary(pd.concat(v, ignore_index=True)) for side, v in base_rows.items()}
    states = {}
    for (side, depth), parts in state_rows.items():
        df = pd.concat(parts, ignore_index=True)
        states[f"{side}_{depth}"] = {**summary(df), "by_inst": df.groupby("inst").size().to_dict()}

    # current readings (display only)
    now = {}
    for k, d in data.items():
        last = d.iloc[-1]
        ann = last["sig"] * np.sqrt(252)
        lv = live[k]
        g = legs_scored[(legs_scored["inst"] == k) & (legs_scored["dir"] == lv["dir"])]["sigma_units"]
        now[k] = {"date": str(d.index[-1].date()), "close": round(float(last["close"]), 5),
                  "leg_dir": lv["dir"], "leg_start": str(lv["start"].date()), "leg_pct": round(lv["pct_so_far"], 2),
                  "leg_sigma": round(lv["sigma_so_far"], 2), "leg_days": lv["days_so_far"],
                  "leg_pctile_vs_own": round(float((g < lv["sigma_so_far"]).mean()), 2) if len(g) else None,
                  "dd_from_252hi_ann_sigma": round(float(np.log(last["hi252"] / last["close"]) / ann), 2),
                  "up_from_252lo_ann_sigma": round(float(np.log(last["close"] / last["lo252"]) / ann), 2),
                  "rsi14": round(float(last["rsi"]), 1), "sigma_d_pct": round(float(last["sig"] * 100), 3),
                  "at_20d_low": bool(last["close"] <= last["lo20"]), "at_20d_high": bool(last["close"] >= last["hi20"])}
        now[k]["signal_now"] = [f"{s}_{x}" for s in ("down", "up") for x in DEPTHS
                                if (s == "down" and now[k]["dd_from_252hi_ann_sigma"] >= x and now[k]["rsi14"] < 30 and now[k]["at_20d_low"])
                                or (s == "up" and now[k]["up_from_252lo_ann_sigma"] >= x and now[k]["rsi14"] > 70 and now[k]["at_20d_high"])]

    res = {"study": "swing-leg-baserates", "source": SRC, "status": "EXPLORATORY (not pre-registered)", "seed": SEED,
           "lockbox": str(LOCKBOX.date()), "params": {"REV_sigma": REV, "UP": UP, "DN": DN, "depths_ann_sigma": DEPTHS},
           "instruments": list(data), "legs": leg_dist, "legs_per_instrument": per_inst, "survival": surv,
           "baseline_every_5th_day": base, "states": states, "now": now}
    with open(f"{DIR}/results_{SRC}.json", "w") as f:
        json.dump(res, f, indent=1, default=str)
    legs.to_csv(f"{DIR}/legs_{SRC}.csv", index=False)
    print(json.dumps({k: res[k] for k in ("legs", "survival", "baseline_every_5th_day", "states")}, indent=1, default=str))


if __name__ == "__main__":
    main()
