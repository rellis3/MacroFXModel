"""vol-layer-rule-a-confirm: Vol-Layer stage 4 on Rule A's own trades (forge/VOL_LAYER_RULE_A_CONFIRM_PREREG.md).

Rule A = the rich-day break on the chosen v3 lines (scripts/backtest/build_line_backtest.py, trades "A"): first 1-minute
close >= 0.05 sigma through an O->H / O->L p50 / p75 line, 00:00-10:00 London, enter at the next bar's open, stop 0.2 sigma
behind the line, target 5R, otherwise out at the last bar before 22:00 London. The signals are taken as they are from
backtest-data/line-backtest; only the stop, the size unit and the book are changed, and every trade is re-run here on the
M1 BID/ASK path (buys fill at the offer, sells at the bid; a stop that gaps fills at the bar's open).

Arms (same signals, same entry bar):
  B0  registered stop: line - side * 0.2 sigma
  S1  spread-aware stop: line - side * (0.2 sigma + a * spread at entry), a in {0.5, 1, 1.5}, base 1
  S2  vol-clock stop: line - side * 0.2 sigma * (Vrem(entry) / Vrem(00:00)) ** p, p in {0.25, 0.5, 0.75}, base 0.5
      Vrem = share of the 00:00-22:00 variance still to come, per instrument, from DISCOVERY sessions 2016-10-24..2022-12-30
  S3  S1 + S2 at their base settings
  Z1  sigma level floor: sigma_f = max(sigma, q-quantile of sigma over the previous 252 sessions (min 126)), q in
      {0.1, 0.2, 0.3}, base 0.2; stop = line - side * 0.2 * sigma_f
  K1  dollar-cluster cap on B0: a trade is skipped if it would take same-direction USD exposure among open trades above c,
      c in {1, 2, 3}, base 2 (EURUSD/GBPUSD/AUDUSD/GOLD long = short USD; USDCAD/USDCHF/USDJPY long = long USD; indices 0)
Target is always 5x the arm's own risk (entry fill to stop); 1R per trade.

    python -X utf8 scripts/vol-layer-rule-a-confirm/run.py --window discovery   # 2020-08-24..2022-12-30, builds profile
    python -X utf8 scripts/vol-layer-rule-a-confirm/run.py --window confirm     # 2023-01-01..2026-08-20, ONCE, after prereg
Writes analysis/output/vol-layer-rule-a-confirm/<window>/{trades.parquet, results.json}; profile.json (discovery only).
"""
from __future__ import annotations

import argparse
import gzip
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "scripts/forecast_history")]
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import line_reaction as LR  # noqa: E402

LON = "Europe/London"
RULEA = ROOT / "backtest-data/line-backtest"
BA = ROOT / "data/m1_bidask"
OUTD = ROOT / "analysis/output/vol-layer-rule-a-confirm"
WINDOWS = {"discovery": ("2020-08-24", "2022-12-30"), "confirm": ("2023-01-01", "2026-08-20")}
PROFILE_END = "2022-12-30"
LOCKBOX = "2026-08-21"
SEED = 20261115
CLOSE = 1320
NAMES = ["EURUSD", "GBPUSD", "AUDUSD", "USDCAD", "USDCHF", "USDJPY", "GOLD", "NQ", "SPX500", "US30", "US2000"]
BA_KEY = {"SPX500": "spx", "US30": "dow"}
USD = {"EURUSD": -1, "GBPUSD": -1, "AUDUSD": -1, "GOLD": -1, "USDCAD": 1, "USDCHF": 1, "USDJPY": 1}
S1_A = [0.5, 1.0, 1.5]
S2_P = [0.25, 0.5, 0.75]
Z1_Q = [0.1, 0.2, 0.3]
K1_C = [1, 2, 3]
SESOI = 0.15          # smallest Sharpe difference worth having (annualised, daily book)


# ---------------------------------------------------------------- data
def load_ba(sym, t_from, t_to):
    df = pd.read_parquet(BA / f"{BA_KEY.get(sym, sym.lower())}_m1.parquet",
                         columns=["time", "open", "high", "low", "close", "bid_o", "bid_h", "bid_l", "bid_c",
                                  "ask_o", "ask_h", "ask_l", "ask_c"])
    t = pd.DatetimeIndex(pd.to_datetime(df["time"], utc=True))
    lo = pd.Timestamp(t_from).tz_localize(LON).tz_convert("UTC")
    hi = (pd.Timestamp(t_to) + pd.Timedelta(days=1)).tz_localize(LON).tz_convert("UTC")
    k = np.asarray((t >= lo) & (t < hi))
    df, t = df[k].reset_index(drop=True), t[k]
    o = np.argsort(t.asi8, kind="stable")
    df, t = df.iloc[o].reset_index(drop=True), t[o]
    loc = t.tz_convert(LON).tz_localize(None)
    df["d"] = np.asarray(loc.strftime("%Y-%m-%d"))
    df["m"] = np.asarray(loc.hour * 60 + loc.minute)
    df["wd"] = np.asarray(loc.dayofweek < 5)
    assert df.d.max() <= t_to
    return df


def build_profile(sym):
    """Share of the 00:00-22:00 London variance in each 5-minute slot, discovery sessions only."""
    df = load_ba(sym, "2016-10-24", PROFILE_END)
    assert df.d.max() <= PROFILE_END
    df = df[df.wd & (df.m < CLOSE)]
    df["slot"] = df.m // 5
    last = df.groupby(["d", "slot"]).close.last().reset_index()
    last["lc"] = np.log(last.close)
    last["r2"] = last.groupby("d").lc.diff() ** 2
    last.loc[last.groupby("d").slot.diff() != 1, "r2"] = np.nan
    last["tot"] = last.groupby("d").r2.transform("sum")
    last = last[last.tot > 0]
    last["sh"] = last.r2 / last.tot
    prof = last.groupby("slot").sh.mean().reindex(range(CLOSE // 5)).fillna(0).to_numpy()
    prof = prof / prof.sum()
    return prof.tolist(), int(last.d.nunique())


def vrem(prof, m, p):
    rem = np.cumsum(np.asarray(prof)[::-1])[::-1]       # rem[s] = share from slot s to 22:00
    return (rem[min(m // 5, len(rem) - 1)] / rem[0]) ** p


# ---------------------------------------------------------------- simulation on the bid/ask path
def sim(A, i0, i1, side, stop, k=5.0):
    """Enter at bar i0's open (offer for buys, bid for sells); walk bars i0..i1; stop wins ties.
    Returns dict(net, gross, exit, reason, risk) or None when the entry is already beyond the stop."""
    if side > 0:
        E, Em = A["ao"][i0], A["o"][i0]
    else:
        E, Em = A["bo"][i0], A["o"][i0]
    risk = side * (E - stop)
    risk_m = side * (Em - stop)
    if risk <= 0 or risk_m <= 0:
        return None
    T = E + side * k * risk
    sl = slice(i0, i1 + 1)
    if side > 0:
        hs, ht = np.flatnonzero(A["bl"][sl] <= stop), np.flatnonzero(A["bh"][sl] >= T)
    else:
        hs, ht = np.flatnonzero(A["ah"][sl] >= stop), np.flatnonzero(A["al"][sl] <= T)
    js = hs[0] if len(hs) else None
    jt = ht[0] if len(ht) else None
    if js is not None and (jt is None or js <= jt):
        j = i0 + js
        X = min(stop, A["bo"][j]) if side > 0 else max(stop, A["ao"][j])
        if j == i0:                                     # the entry bar itself: no gap fill at its own open
            X = stop
        reason = "stop"
    elif jt is not None:
        j, X, reason = i0 + jt, T, "target"
    else:
        j = i1
        X = A["bc"][j] if side > 0 else A["ac"][j]
        reason = "time"
    # mid path (parity with the registered gross grid)
    Tm = Em + side * k * risk_m
    if side > 0:
        ms, mt = np.flatnonzero(A["l"][sl] <= stop), np.flatnonzero(A["h"][sl] >= Tm)
    else:
        ms, mt = np.flatnonzero(A["h"][sl] >= stop), np.flatnonzero(A["l"][sl] <= Tm)
    a_, b_ = (ms[0] if len(ms) else None), (mt[0] if len(mt) else None)
    if a_ is not None and (b_ is None or a_ <= b_):
        gross = -1.0
    elif b_ is not None:
        gross = k
    else:
        gross = side * (A["c"][i1] - Em) / risk_m
    return {"net": side * (X - E) / risk, "gross": gross, "exit_m": int(A["m"][j]), "reason": reason, "risk": risk,
            "spread_R": (A["ao"][i0] - A["bo"][i0]) / risk}


def run_instrument(sym, win, prof):
    a, b = WINDOWS[win]
    r = json.load(gzip.open(RULEA / f"{sym}.json.gz", "rt"))
    days = {d["d"]: d for d in r["days"]}
    dlist = sorted(days)
    sig = pd.Series({d: days[d]["sig"] for d in dlist}, dtype=float)
    floor = {q: sig.shift(1).rolling(252, min_periods=126).quantile(q) for q in Z1_Q}
    floor_lag = sig.shift(2).rolling(252, min_periods=126).quantile(0.2)
    si, ti = r["stops"].index(0.2), r["targets"].index("5")
    gi = si * len(r["targets"]) + ti
    trades = [x for x in r["trades"]["A"] if a <= x["d"] <= b]
    prev_day = {d: dlist[k - 1] for k, d in enumerate(dlist) if k}
    t_from = prev_day.get(min((x["d"] for x in trades), default=a), a)
    df = load_ba(sym, min(t_from, a), b)
    A = {"o": df.open.to_numpy(), "h": df.high.to_numpy(), "l": df.low.to_numpy(), "c": df.close.to_numpy(),
         "bo": df.bid_o.to_numpy(), "bh": df.bid_h.to_numpy(), "bl": df.bid_l.to_numpy(), "bc": df.bid_c.to_numpy(),
         "ao": df.ask_o.to_numpy(), "ah": df.ask_h.to_numpy(), "al": df.ask_l.to_numpy(), "ac": df.ask_c.to_numpy(),
         "m": df.m.to_numpy()}
    inday = df.wd.to_numpy() & (df.m.to_numpy() < CLOSE)
    idx = pd.DataFrame({"i": np.flatnonzero(inday), "d": df.d.to_numpy()[inday], "m": df.m.to_numpy()[inday]})
    g = idx.groupby("d")
    first, last = g.i.min(), g.i.max()
    bym = {d: dict(zip(s.m, s.i)) for d, s in g}
    del df
    rows, miss = [], {"no_bar": 0, "no_day": 0}
    book_days = [d for d in dlist if a <= d <= b and d in first.index]
    for x in trades:
        d = x["d"]
        if d not in bym:
            miss["no_day"] += 1
            continue
        i0 = bym[d].get(x["em"])
        if i0 is None:
            miss["no_bar"] += 1
            continue
        i1 = last[d]
        day, side = days[d], x["side"]
        u = day["o"] * day["sig"] / 100
        L = day["L"][x["line"]]
        spr = A["ao"][i0] - A["bo"][i0]
        pd_ = prev_day.get(d)
        spr_lag = np.nan
        if pd_ in bym:
            mm = [m for m in bym[pd_] if m <= x["em"]]
            if mm:
                j = bym[pd_][max(mm)]
                spr_lag = A["ao"][j] - A["bo"][j]
        base = {"inst": sym, "date": d, "em": x["em"], "side": side, "line": x["line"], "sig": day["sig"],
                "reg_gross": None if x["g"][gi] is None else x["g"][gi][0] / 1000, "usd": USD.get(sym, 0) * side}
        arms = {"B0": L - side * 0.2 * u}
        for aa in S1_A:
            arms[f"S1_{aa}"] = L - side * (0.2 * u + aa * spr)
        if np.isfinite(spr_lag):
            arms["S1_lag"] = L - side * (0.2 * u + spr_lag)
        for p in S2_P:
            arms[f"S2_{p}"] = L - side * 0.2 * u * vrem(prof, x["em"], p)
        arms["S3"] = L - side * (0.2 * u * vrem(prof, x["em"], 0.5) + spr)
        for q in Z1_Q:
            f = floor[q].get(d)
            sf = max(day["sig"], f) if f is not None and np.isfinite(f) else day["sig"]
            arms[f"Z1_{q}"] = L - side * 0.2 * day["o"] * sf / 100
        f = floor_lag.get(d)
        sf = max(day["sig"], f) if f is not None and np.isfinite(f) else day["sig"]
        arms["Z1_lag"] = L - side * 0.2 * day["o"] * sf / 100
        for arm, stp in arms.items():
            res = sim(A, i0, i1, side, stp)
            if res is None:
                continue
            rows.append({**base, "arm": arm, **res})
    return rows, miss, book_days


# ---------------------------------------------------------------- statistics
def sharpe_reps(W, x):
    w = W.sum(1)
    m = (W @ x) / w
    v = (W @ (x * x)) / w - m * m
    return m / np.sqrt(np.maximum(v, 1e-18)) * np.sqrt(252)


def sharpe(x):
    return float(x.mean() / (x.std() + 1e-18) * np.sqrt(252))


def cvar5(x):
    k = max(1, int(round(0.05 * len(x))))
    return float(np.sort(x)[:k].mean())


def pval(reps):
    reps = reps[np.isfinite(reps)]
    return float(min(1.0, 2 * min((reps <= 0).mean(), (reps >= 0).mean())))


def holm(ps):
    order = np.argsort(ps)
    adj, run = np.empty(len(ps)), 0.0
    for k, i in enumerate(order):
        run = max(run, (len(ps) - k) * ps[i])
        adj[i] = min(1.0, run)
    return adj


def r4(x):
    return None if x is None or not np.isfinite(x) else round(float(x), 4)


def dollar_cap(T, c):
    """Walk B0 trades day by day in entry order; skip a trade that would take same-direction open USD exposure above c."""
    keep = np.ones(len(T), bool)
    for _, g in T.groupby("date", sort=True):
        open_ = []
        for i in g.sort_values(["em", "inst"]).index:
            em, u = T.at[i, "em"], T.at[i, "usd"]
            open_ = [(x, e) for x, e in open_ if x > em]
            if u != 0:
                same = sum(e for _, e in open_ if np.sign(e) == np.sign(u))
                if abs(same + u) > c:
                    keep[T.index.get_loc(i)] = False
                    continue
                open_.append((T.at[i, "exit_m"], u))
    return keep


def analyse(R, book_days, win, rng):
    days = np.array(sorted(set(book_days)))
    bs = LR.Boot(days)
    W = bs.W
    pos = pd.Series(np.arange(len(days)), index=days)

    def book(sub):
        return np.bincount(pos[sub.date].to_numpy(), weights=sub.net.to_numpy(), minlength=len(days))

    B0 = R[R.arm == "B0"].reset_index(drop=True)
    b0 = book(B0)
    out = {"window": WINDOWS[win], "seed": SEED, "book_days": len(days), "n_trades_B0": len(B0),
           "B0": {"net_R": r4(B0.net.mean()), "gross_mid_R": r4(B0.gross.mean()), "sharpe": r4(sharpe(b0)),
                  "cvar5": r4(cvar5(b0)), "stop_rate": r4((B0.reason == "stop").mean()),
                  "net_R_ci": [r4(v) for v in bs.mean(B0.date, B0.net.to_numpy())[0]]}}
    # parity with the registered gross grid (mid, research M1)
    pm = B0.dropna(subset=["reg_gross"])
    out["parity"] = {"n": len(pm), "same_sign": r4((np.sign(pm.gross) == np.sign(pm.reg_gross)).mean()),
                     "mean_reg": r4(pm.reg_gross.mean()), "mean_mid_here": r4(pm.gross.mean()),
                     "abs_diff_lt_0p1": r4((abs(pm.gross - pm.reg_gross) < 0.1).mean())}
    years = sorted(set(d[:4] for d in days))

    def arm_stats(name, sub):
        x = book(sub)
        d = sharpe_reps(W, x) - sharpe_reps(W, b0)
        key = ["inst", "date", "em", "line"]
        mg = B0[key + ["net"]].merge(sub[key + ["net"]], on=key, suffixes=("_b", "_a"))
        dd = mg.net_a.to_numpy() - mg.net_b.to_numpy()
        by_year = {}
        for y in years:
            m = np.array([dd_[:4] == y for dd_ in days])
            if m.sum() > 20:
                by_year[y] = r4(sharpe(x[m]) - sharpe(b0[m]))
        stop_y = sub.assign(y=sub.date.str[:4]).groupby("y").reason.apply(lambda s: (s == "stop").mean())
        return {"arm": name, "n": len(sub), "net_R": r4(sub.net.mean()), "sharpe": r4(sharpe(x)),
                "d_sharpe": r4(sharpe(x) - sharpe(b0)), "d_sharpe_ci": [r4(v) for v in np.nanpercentile(d, [2.5, 97.5])],
                "p": pval(d), "se": r4(np.nanstd(d)), "paired_dR": r4(dd.mean()) if len(dd) else None,
                "paired_dR_ci": [r4(v) for v in bs.mean(mg.date, dd)[0]] if len(dd) else None,
                "cvar5": r4(cvar5(x)), "d_cvar5": r4(cvar5(x) - cvar5(b0)), "stop_rate": r4((sub.reason == "stop").mean()),
                "stop_rate_year_sd": r4(stop_y.std() * 100), "by_year_d_sharpe": by_year,
                "mean_risk_vs_B0": r4((sub.groupby(key).risk.first().reindex(B0.set_index(key).index)
                                       / B0.set_index(key).risk).mean())}

    arms = {}
    for a_ in sorted(R.arm.unique()):
        if a_ != "B0":
            arms[a_] = arm_stats(a_, R[R.arm == a_])
    # K1 dollar cap on B0 trades, with a random-skip benchmark of the same count per day
    for c in K1_C:
        keep = dollar_cap(B0, c)
        sub = B0[keep]
        st = arm_stats(f"K1_{c}", sub)
        x = book(sub)
        skipped = (~keep)
        n_skip_day = B0[skipped].groupby("date").size()
        rand_cv, rand_sh = [], []
        for _ in range(500):
            kk = np.ones(len(B0), bool)
            for d, n in n_skip_day.items():
                ii = np.flatnonzero((B0.date == d).to_numpy())
                kk[rng.choice(ii, size=n, replace=False)] = False
            xr = book(B0[kk])
            rand_cv.append(cvar5(xr))
            rand_sh.append(sharpe(xr))
        rand_cv, rand_sh = np.array(rand_cv), np.array(rand_sh)
        st.update({"skipped": int(skipped.sum()), "rand_cvar5_mean": r4(rand_cv.mean()),
                   "p_cvar_vs_random": float((1 + (rand_cv >= cvar5(x)).sum()) / (1 + len(rand_cv))),
                   "rand_sharpe_mean": r4(rand_sh.mean())})
        # bootstrap CVaR5 difference vs B0
        cv = []
        for w in W[:1000]:
            rep = np.repeat(np.arange(len(days)), np.round(w).astype(int))
            cv.append(cvar5(x[rep]) - cvar5(b0[rep]))
        st["d_cvar5_ci"] = [r4(v) for v in np.percentile(cv, [2.5, 97.5])]
        arms[f"K1_{c}"] = st
    out["arms"] = arms
    # scored cells (registered): S1_1.0, S2_0.5, S3, Z1_0.2 on d_sharpe; K1_2 on CVaR5 vs random skip
    prim = {"S1": ("S1_1.0", "p"), "S2": ("S2_0.5", "p"), "S3": ("S3", "p"), "Z1": ("Z1_0.2", "p"), "K1": ("K1_2", "p_cvar_vs_random")}
    ps = np.array([arms[v[0]][v[1]] for v in prim.values()])
    adj = holm(ps)
    out["scored"] = {k: {"cell": v[0], "p": r4(ps[i]), "p_holm": r4(adj[i])} for i, (k, v) in enumerate(prim.items())}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--window", choices=list(WINDOWS), required=True)
    args = ap.parse_args()
    win = args.window
    a, b = WINDOWS[win]
    assert b < LOCKBOX
    t0 = time.time()
    od = OUTD / win
    od.mkdir(parents=True, exist_ok=True)
    pf = OUTD / "profile.json"
    if win == "discovery" or not pf.exists():
        assert win == "discovery", "build the profile with --window discovery first"
        profs = {}
        for sym in NAMES:
            p, n = build_profile(sym)
            profs[sym] = {"share": p, "sessions": n, "through": PROFILE_END}
            print(sym, "profile", n, "sessions", flush=True)
        pf.write_text(json.dumps(profs))
    profs = json.loads(pf.read_text())
    assert all(v["through"] == PROFILE_END for v in profs.values())
    rng = np.random.default_rng(SEED)
    rows, misses, bdays = [], {}, set()
    for sym in NAMES:
        rr, miss, bd = run_instrument(sym, win, profs[sym]["share"])
        rows += rr
        misses[sym] = miss
        bdays |= set(bd)
        print(sym, len(rr), miss, round(time.time() - t0), "s", flush=True)
    R = pd.DataFrame(rows)
    assert R.date.min() >= a and R.date.max() <= b
    R.to_parquet(od / "trades.parquet")
    out = analyse(R, bdays, win, rng)
    out["missing"] = misses
    out["vrem_at"] = {sym: {h: r4(vrem(profs[sym]["share"], h * 60, 0.5)) for h in (0, 2, 4, 7, 8, 9, 10)} for sym in NAMES}
    out["runtime_s"] = round(time.time() - t0)
    (od / "results.json").write_text(json.dumps(out, indent=1))
    print(json.dumps({k: out[k] for k in ("B0", "parity", "scored")}, indent=1))


if __name__ == "__main__":
    main()
