"""
overnight-hold: honest-cost scoring of the engine's gross trades. Prereg: forge/OVERNIGHT_HOLD_PREREG.md.

Inputs: analysis/output/overnight-hold/trades_<k>_full.csv (from run_engine.mjs), data/m1_bidask/<k>_m1.parquet,
the OANDA financing snapshot and FRED DFF (analysis/output/overnight-hold/dff.csv).

Window 2016-10-24 -> 2026-08-21 (bid/ask start -> lockbox).
  spread    long buys the ask at entry, sells the bid at exit, at the fill minute
  financing (DFF + markup)/365 per financing day, one 17:00 New York rollover per trade;
            NAS100 Wednesday = 1 day, XAU Wednesday = 3 (snapshot financing_days_wed)
  buy&hold  CFD long first entry -> last exit, one spread round trip, financing every calendar day
Scored: mean net return per trade, block bootstrap (mean block 20 trades, B 10,000), Holm over NQ/gold, halves.

Usage: python scripts/overnight-hold/honest.py
"""
import json
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "analysis" / "output" / "overnight-hold"
SEED, B, BLOCK = 20261025, 10_000, 20
START, END = pd.Timestamp("2016-10-24"), pd.Timestamp("2026-08-21")
SNAP = {"nq": ("NAS100_USD", "commodity" and "index"), "gold": ("XAU_USD", "commodity")}
ENGINE_SLIP = {"nq": 0.008 * 1.25, "gold": 0.012 * 1.25}     # engine default slip %, entry/exit blended
RULES = {"daily_loss": 5.0, "trailing_dd": 10.0, "target": 8.0, "days": 30, "consistency": 30.0}


def load_inputs(k):
    t = pd.read_csv(OUT / f"trades_{k}_full.csv")
    t["date"] = pd.to_datetime(t["date"])
    t = t[(t["date"] >= START) & (t["date"] <= END)].reset_index(drop=True)
    ba = pd.read_parquet(ROOT / "data" / "m1_bidask" / f"{k}_m1.parquet", columns=["time", "bid_c", "ask_c"])
    ba["epoch"] = (ba["time"].astype("int64") // 10**6).astype("int64") if ba["time"].dtype.str.endswith("[us]") \
        else (ba["time"].astype("int64") // 10**9)
    ba = ba[["epoch", "bid_c", "ask_c"]].sort_values("epoch").reset_index(drop=True)
    meta = pd.read_parquet(ROOT / "Oanda Parquet Files" / "Bid and Ask" / "instrument_meta_log.parquet")
    row = meta[meta["name"] == SNAP[k][0]].iloc[-1]
    dff = pd.read_csv(OUT / "dff.csv", parse_dates=["observation_date"]).set_index("observation_date")["DFF"]
    return t, ba, row, dff


def half_spread_at(ba, epochs, max_gap=1800):
    """(ask-bid)/2 / mid at the last bid/ask bar at or before each epoch (within max_gap)."""
    e = ba["epoch"].to_numpy()
    i = np.searchsorted(e, epochs, side="right") - 1
    ok = (i >= 0) & ((epochs - e[np.clip(i, 0, None)]) <= max_gap)
    bid = ba["bid_c"].to_numpy()[np.clip(i, 0, None)]; ask = ba["ask_c"].to_numpy()[np.clip(i, 0, None)]
    hs = np.where(ok, (ask - bid) / 2 / ((ask + bid) / 2) * 100, np.nan)
    return hs


def costs(k, t, ba, row, dff):
    markup = abs(row["financing_long_rate"]) * 100 - dff.loc["2026-10-20"]
    wed_days = int(row["financing_days_wed"])
    dff_d = dff.reindex(pd.date_range(dff.index.min(), END + pd.Timedelta(days=5))).ffill()
    t = t.copy()
    t["spread_entry"] = half_spread_at(ba, t["entryEpoch"].to_numpy())
    t["spread_exit"] = half_spread_at(ba, t["exitEpoch"].to_numpy())
    dow = t["date"].dt.dayofweek                             # Mon=0 .. Sun=6; rollover is on the entry's NY date
    days = np.where(dow == 2, wed_days, 1)
    rate = dff_d.reindex(t["date"]).to_numpy() + markup      # % a year
    t["fin_days"] = days
    t["financing"] = rate / 365 * days
    t["spread"] = t["spread_entry"] + t["spread_exit"]
    t["net"] = t["grossPct"] - t["spread"] - t["financing"]
    return t, {"markup_pp": float(markup), "wed_days": wed_days}


def buy_hold(k, t, ba, row, dff, markup):
    first, last = t.iloc[0], t.iloc[-1]
    gross_mult = last["exitPrice"] / first["entryPrice"]
    sp = half_spread_at(ba, np.array([first["entryEpoch"]]))[0] + half_spread_at(ba, np.array([last["exitEpoch"]]))[0]
    days = pd.date_range(first["date"], pd.to_datetime(last["exitDate"]), freq="D")[:-1]
    dff_d = dff.reindex(pd.date_range(dff.index.min(), END + pd.Timedelta(days=5))).ffill()
    f = (dff_d.reindex(days).to_numpy() + markup) / 365 / 100
    net_mult = gross_mult * (1 - sp / 100) * np.prod(1 - f)
    yrs = (pd.to_datetime(last["exitDate"]) - first["date"]).days / 365.25
    return {"gross_totalPct": (gross_mult - 1) * 100, "net_totalPct": (net_mult - 1) * 100,
            "gross_cagr": (gross_mult ** (1 / yrs) - 1) * 100, "net_cagr": (net_mult ** (1 / yrs) - 1) * 100,
            "financing_paid_pct_simple": float(f.sum() * 100), "calendar_days": len(days), "years": yrs}


def boot(x, rng):
    x = np.asarray(x, float); n = len(x); p = 1 / BLOCK
    restarts = rng.random((B, n)) < p; restarts[:, 0] = True
    anchors = rng.integers(0, n, (B, n)); k = np.arange(n)
    last = np.maximum.accumulate(np.where(restarts, k, 0), axis=1)
    idx = (np.take_along_axis(anchors, last, axis=1) + (k - last)) % n
    m = x[idx].mean(axis=1); sd = m.std()
    return {"mean": float(x.mean()), "se": float(sd), "ci95": [float(x.mean() - 1.96 * sd), float(x.mean() + 1.96 * sd)],
            "p": float((np.abs(m - m.mean()) >= abs(x.mean())).mean()), "t": float(x.mean() / sd)}


def summary(r, years):
    eq = np.cumprod(1 + np.asarray(r) / 100)
    dd = ((eq - np.maximum.accumulate(eq)) / np.maximum.accumulate(eq)).min() * 100
    return {"totalPct": float((eq[-1] - 1) * 100), "cagr": float((eq[-1] ** (1 / years) - 1) * 100), "max_dd": float(dd),
            "sharpe_ann": float(np.mean(r) / np.std(r, ddof=1) * np.sqrt(len(r) / years)), "win": float((np.asarray(r) > 0).mean() * 100)}


def breakeven(t):
    g, c = t["grossPct"].to_numpy(), (t["spread"] + t["financing"]).to_numpy()
    tot = lambda s: np.prod(1 + (g - s * c) / 100) - 1
    lo, hi = 0.0, 5.0
    if tot(hi) > 0: return None
    for _ in range(60):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if tot(mid) > 0 else (lo, mid)
    return float(lo)


def prop_rolling(t, lev=1.0):
    """Rolling-start challenge on INTRADAY equity: low point of each trade = E_prev*(1 + lev*(MAE - entry spread)/100).
    Pass = closed equity reaches +target within `days` trades with no daily-loss / trailing-DD breach and best day
    <= consistency% of total profit. Starts every 21st trade."""
    net = t["net"].to_numpy() * lev
    low = (t["maePct"].to_numpy() - t["spread_entry"].to_numpy()) * lev
    out = {"pass": 0, "fail_daily": 0, "fail_dd": 0, "fail_consistency": 0, "timeout": 0}
    closed_only = {"pass": 0, "fail": 0, "timeout": 0}
    for s in range(0, len(t) - RULES["days"], 21):
        e, peak, best, prof, res, res_c = 1.0, 1.0, 0.0, 0.0, None, None
        ec, peakc = 1.0, 1.0
        for j in range(s, s + RULES["days"]):
            lo_eq = e * (1 + min(low[j], 0) / 100)
            e_new = e * (1 + net[j] / 100)
            day = min(lo_eq, e_new) / e - 1
            if res is None:
                if day * 100 <= -RULES["daily_loss"]: res = "fail_daily"
                elif min(lo_eq, e_new) <= peak * (1 - RULES["trailing_dd"] / 100): res = "fail_dd"
            # closed-trade-only version (the engine's convention)
            ec_new = ec * (1 + net[j] / 100)
            if res_c is None:
                if (ec_new / ec - 1) * 100 <= -RULES["daily_loss"] or ec_new <= peakc * (1 - RULES["trailing_dd"] / 100): res_c = "fail"
                elif (ec_new - 1) * 100 >= RULES["target"]: res_c = "pass"
            ec, peakc = ec_new, max(peakc, ec_new)
            prof += max(net[j], 0); best = max(best, net[j])
            e = e_new; peak = max(peak, e)
            if res is None and (e - 1) * 100 >= RULES["target"]:
                res = "fail_consistency" if best / prof * 100 > RULES["consistency"] else "pass"
            if res and res_c: break
        out[res or "timeout"] += 1
        closed_only[res_c or "timeout"] += 1
    n = sum(out.values())
    return {"lev": lev, "starts": n, **{k: v for k, v in out.items()}, "pass_rate": out["pass"] / n,
            "closed_trade_only": closed_only, "closed_pass_rate": closed_only["pass"] / n}


def main():
    rng = np.random.default_rng(SEED)
    res = {"seed": SEED, "B": B, "block": BLOCK, "window": [str(START.date()), str(END.date())], "instruments": {}}
    for k in ("nq", "gold"):
        t, ba, row, dff = load_inputs(k)
        t, fin = costs(k, t, ba, row, dff)
        miss = t["spread"].isna()
        t = t[~miss].reset_index(drop=True)
        years = (pd.to_datetime(t["exitDate"].iloc[-1]) - t["date"].iloc[0]).days / 365.25
        h = len(t) // 2
        r = {"trades": len(t), "dropped_no_bidask": int(miss.sum()), "years": years, "financing_model": fin,
             "avg_cost_pct": {"spread": float(t["spread"].mean()), "financing": float(t["financing"].mean()),
                              "engine_placeholder": float((t["grossPct"] - t["engineNetPct"]).mean())},
             "gross": summary(t["grossPct"], years) | {"mean": float(t["grossPct"].mean())},
             "net": summary(t["net"], years) | boot(t["net"], rng),
             "net_plus_engine_slip": summary(t["net"] - ENGINE_SLIP[k], years) | {"mean": float((t["net"] - ENGINE_SLIP[k]).mean())},
             "halves_net_mean": [float(t["net"].iloc[:h].mean()), float(t["net"].iloc[h:].mean())],
             "split_date": str(t["date"].iloc[h].date()),
             "breakeven_cost_multiple": breakeven(t),
             "by_year_net_pct": {int(y): float((np.prod(1 + g["net"] / 100) - 1) * 100) for y, g in t.groupby(t["date"].dt.year)},
             "by_weekday": {d: {"n": len(g), "gross": float(g["grossPct"].mean()), "net": float(g["net"].mean()), "fin": float(g["financing"].mean())}
                            for d, g in t.groupby(t["date"].dt.day_name())},
             "buy_hold_cfd": buy_hold(k, t, ba, row, dff, fin["markup_pp"]),
             "prop_intraday_1x": prop_rolling(t, 1.0),
             "prop_intraday_3x_DESCRIPTIVE": prop_rolling(t, 3.0)}
        res["instruments"][k] = r
        t.to_csv(OUT / f"honest_trades_{k}.csv", index=False)

    ps = [res["instruments"][k]["net"]["p"] for k in ("nq", "gold")]
    order = np.argsort(ps); adj = [0.0, 0.0]; run = 0.0
    for i_, j in enumerate(order):
        run = max(run, (2 - i_) * ps[j]); adj[j] = min(run, 1.0)
    for k, a in zip(("nq", "gold"), adj):
        r = res["instruments"][k]; n = r["net"]
        r["holm_p"] = a
        if n["ci95"][0] > 0 and a < 0.05 and min(r["halves_net_mean"]) > 0: v = "VALIDATED"
        elif n["ci95"][1] < 0.01: v = "NULL"
        else: v = "UNDERPOWERED"
        r["verdict"] = v
    (OUT / "results.json").write_text(json.dumps(res, indent=2, default=float))
    for k, r in res["instruments"].items():
        n, g, bh = r["net"], r["gross"], r["buy_hold_cfd"]
        print(f"\n== {k}: {r['trades']} trades ({r['dropped_no_bidask']} dropped), {r['years']:.2f} yrs  verdict {r['verdict']}")
        print(f"  avg cost/trade: spread {r['avg_cost_pct']['spread']:.4f}%  financing {r['avg_cost_pct']['financing']:.4f}%  (engine placeholder total {r['avg_cost_pct']['engine_placeholder']:.4f}%)  markup {r['financing_model']['markup_pp']:.2f}pp wed={r['financing_model']['wed_days']}")
        print(f"  gross: mean {g['mean']:+.4f}%  total {g['totalPct']:+.1f}%  CAGR {g['cagr']:+.2f}%  DD {g['max_dd']:.1f}%  Sharpe {g['sharpe_ann']:.2f}")
        print(f"  NET:   mean {n['mean']:+.4f}% [{n['ci95'][0]:+.4f}, {n['ci95'][1]:+.4f}] t {n['t']:+.2f} Holm p {r['holm_p']:.3f}  total {n['totalPct']:+.1f}%  CAGR {n['cagr']:+.2f}%  DD {n['max_dd']:.1f}%  Sharpe {n['sharpe_ann']:.2f}")
        print(f"  +engine slip: total {r['net_plus_engine_slip']['totalPct']:+.1f}%  CAGR {r['net_plus_engine_slip']['cagr']:+.2f}%")
        print(f"  halves {r['halves_net_mean']}  breakeven x{r['breakeven_cost_multiple']}")
        print(f"  B&H CFD: gross {bh['gross_totalPct']:+.1f}% ({bh['gross_cagr']:+.2f}%/yr)  net {bh['net_totalPct']:+.1f}% ({bh['net_cagr']:+.2f}%/yr)  financing ~{bh['financing_paid_pct_simple']:.1f}%")
        print(f"  by year: { {y: round(v,1) for y, v in r['by_year_net_pct'].items()} }")
        print(f"  weekday: { {d: (v['n'], round(v['gross'],4), round(v['net'],4)) for d, v in r['by_weekday'].items()} }")
        print(f"  prop 1x intraday: {r['prop_intraday_1x']}")
        print(f"  prop 3x intraday (descriptive): {r['prop_intraday_3x_DESCRIPTIVE']}")


if __name__ == "__main__":
    main()
