#!/usr/bin/env python3
"""oi-profile-gold-history, stage 1: Databento OG rows -> one session record per London date S (forge/OI_PROFILE_GOLD_HISTORY_PREREG.md §2-3).

    python scripts/oi-profile-gold-history/prep.py <dataDir> [--lag 2]

dataDir (gitignored, main checkout data/oi_gold_history/) holds og_raw.parquet (the Databento CSV, columns
date, expiry, strike, right, settlement, open_interest, volume, raw_symbol) and m1/GOLD.parquet (OANDA XAU_USD M1 mid, UTC index).
Writes sessions_T<lag>.jsonl: per S the OI date D (latest Databento date <= S - lag weekdays), per expiry still alive on S its code, DTE
(calendar days S -> expiry date), strikes, call/put OI, total volume, parity futures price F and Black-76 ATM IV/straddle on D; plus spot at
07:00 London on S, basis = F(front, D) - OANDA mid at 13:30 New York on D, and sigma = EWMA(0.94) of NY-close daily log returns
through S-1 x spot07 (point in time). No outcome is computed here.
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import brentq
from scipy.stats import norm

D = Path(sys.argv[1])
LAG = int(sys.argv[sys.argv.index("--lag") + 1]) if "--lag" in sys.argv else 2
LDN, NY = "Europe/London", "America/New_York"
LAM = 0.94


def b76(F, K, T, s, call):
    if s <= 0 or T <= 0:
        return max(0.0, (F - K) if call else (K - F))
    d1 = (math.log(F / K) + 0.5 * s * s * T) / (s * math.sqrt(T))
    d2 = d1 - s * math.sqrt(T)
    return F * norm.cdf(d1) - K * norm.cdf(d2) if call else K * norm.cdf(-d2) - F * norm.cdf(-d1)


def implied(F, K, T, px, call):
    intrinsic = max(0.0, (F - K) if call else (K - F))
    if not (px > intrinsic + 1e-6) or T <= 0:
        return None
    try:
        return brentq(lambda s: b76(F, K, T, s, call) - px, 1e-3, 5.0, xtol=1e-7)
    except ValueError:
        return None


def parity(g):
    """F = K + C - P at the strike where |C - P| is smallest; second estimate from the next-closest strike (build check)."""
    c = g[g.right == "C"].set_index("strike").settlement
    p = g[g.right == "P"].set_index("strike").settlement
    j = pd.concat([c.rename("c"), p.rename("p")], axis=1).dropna()
    j = j[(j.c > 0) & (j.p > 0)]
    if len(j) < 2:
        return None, None, None
    j["d"] = (j.c - j.p).abs()
    j = j.sort_values("d")
    k0, k1 = j.index[0], j.index[1]
    return float(k0 + j.c.iloc[0] - j.p.iloc[0]), float(k1 + j.c.iloc[1] - j.p.iloc[1]), j


def main():
    cache = D / "og_by_date.pkl"
    if cache.exists():
        by_date = pd.read_pickle(cache)
    else:
        og = pd.read_parquet(D / "og_raw.parquet")
        og["code"] = og.raw_symbol.str.slice(0, 4).astype("category")
        ue = pd.Series(og.expiry.unique())
        ts = pd.Series(pd.to_datetime(ue, utc=True).values, index=ue)
        og["exp_ts"] = og.expiry.map(ts)
        og["exp_date"] = og.expiry.map(pd.Series(pd.to_datetime(ue, utc=True).dt.strftime("%Y-%m-%d").values, index=ue))
        og["open_interest"] = og.open_interest.fillna(0.0)
        og["volume"] = og.volume.fillna(0.0)
        og = og.drop(columns=["raw_symbol", "expiry"])
        by_date = {str(d): g for d, g in og.groupby("date", sort=True)}
        pd.to_pickle(by_date, cache)
    oi_dates = np.array(sorted(by_date))

    m1 = pd.read_parquet(D / "m1" / "GOLD.parquet", columns=["open", "high", "low", "close"])
    # NY-close daily bars (17:00 New York), n >= 60 M1 bars, for sigma (data-rules item 2)
    ny = m1.index.tz_convert(NY)
    lab = (ny + pd.Timedelta(hours=7)).normalize().tz_localize(None)
    daily = m1.close.groupby(lab).agg(["last", "size"])
    daily = daily[(daily["size"] >= 60) & (daily.index.dayofweek < 5)]
    r = np.log(daily["last"]).diff().dropna()
    v = np.empty(len(r))
    v0 = float(np.var(r.iloc[:20]))
    for i, x in enumerate(r.values):
        v0 = LAM * v0 + (1 - LAM) * x * x
        v[i] = v0
    ewma = pd.Series(np.sqrt(v), index=r.index)  # value after the bar labelled index (close 17:00 NY that date)

    first_s = pd.Timestamp(str(oi_dates[0])) + pd.offsets.BDay(LAG)
    last_s = pd.Timestamp(str(oi_dates[-1])) + pd.offsets.BDay(LAG)
    out = open(D / f"sessions_T{LAG}.jsonl", "w")
    log = {"sessions": 0, "skipped": {}}

    def skip(w):
        log["skipped"][w] = log["skipped"].get(w, 0) + 1

    for S in pd.bdate_range(first_s, last_s):
        s = S.strftime("%Y-%m-%d")
        cutoff = (S - pd.offsets.BDay(LAG)).strftime("%Y-%m-%d")
        k = np.searchsorted(oi_dates, cutoff, side="right") - 1
        if k < 0:
            skip("no OI date"); continue
        d = str(oi_dates[k])
        g = by_date[d]
        if g.open_interest.sum() <= 0:
            skip("OI date has no OI"); continue
        t0 = pd.Timestamp(s + " 07:00", tz=LDN).tz_convert("UTC")
        b0 = m1.loc[t0: t0 + pd.Timedelta(minutes=30)]
        if b0.empty:
            skip("no 07:00 bar"); continue
        spot07 = float(b0.open.iloc[0])
        sig_d = ewma[ewma.index < pd.Timestamp(s)]
        if len(sig_d) < 60:
            skip("sigma history"); continue
        sigma = float(sig_d.iloc[-1]) * spot07
        tset = pd.Timestamp(d + " 13:30", tz=NY).tz_convert("UTC")
        bset = m1.loc[tset - pd.Timedelta(minutes=5): tset + pd.Timedelta(minutes=5)]
        if bset.empty:
            skip("no 13:30 NY bar on D"); continue
        spot_set = float(bset.close.iloc[len(bset) // 2])
        exps = []
        for (code, ed, ets), e in g.groupby(["code", "exp_date", "exp_ts"], observed=True):
            ets = pd.Timestamp(ets)
            ets = ets.tz_localize("UTC") if ets.tzinfo is None else ets
            T = (ets - tset).total_seconds() / (365.0 * 86400)
            F, F2, j = parity(e)
            dte = (pd.Timestamp(ed) - pd.Timestamp(s)).days
            ent = {"code": code, "exp_date": ed, "T_D": T, "F": F, "F2": F2, "dte": int(dte)}
            if F is not None and T > 0:
                K = float(j.index[0])
                cp = j.loc[K]
                ivc, ivp = implied(F, K, T, float(cp.c), True), implied(F, K, T, float(cp.p), False)
                ivs = [x for x in (ivc, ivp) if x]
                ent.update({"atmK": K, "iv": (float(np.mean(ivs)) if ivs else None), "straddle": float(cp.c + cp.p)})
            exps.append(ent)
            if dte < 0:
                continue
            oi = e.pivot_table(index="strike", columns="right", values="open_interest", aggfunc="sum").reindex(columns=["C", "P"]).fillna(0.0)
            oi = oi[(oi.C > 0) | (oi.P > 0)]
            vo = e.groupby("strike").volume.sum()
            ent.update({"strikes": oi.index.tolist(), "c": oi.C.tolist(), "p": oi.P.tolist(), "vol": {str(kk): float(vv) for kk, vv in vo[vo > 0].items()}})
        exps.sort(key=lambda x: x["exp_date"])
        # front = the nearest expiry with at least a day to run on D and a parity price
        fr = next((x for x in exps if x["F"] is not None and x["T_D"] > 1.0 / 365), None)
        if fr is None:
            skip("no parity F"); continue
        live = [x for x in exps if x["dte"] >= 0 and x.get("strikes")]
        if not live:
            skip("no live expiry"); continue
        rec = {"S": s, "D": d, "lag": LAG, "t0ms": int(t0.value // 10**6), "spot07": spot07, "spot_set": spot_set, "frontF": fr["F"],
               "frontF2": fr["F2"], "frontCode": fr["code"], "basis": fr["F"] - spot_set, "sigma": sigma, "sigmaPct": 100 * sigma / spot07,
               "expiries": live, "ivAll": [{k2: x.get(k2) for k2 in ("code", "exp_date", "dte", "F", "atmK", "iv", "straddle")} for x in exps if x["dte"] >= 0]}
        out.write(json.dumps(rec) + "\n")
        log["sessions"] += 1
    out.close()
    print(json.dumps(log))


if __name__ == "__main__":
    main()
