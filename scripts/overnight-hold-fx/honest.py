"""
overnight-hold-fx: honest-cost scoring of the engine's gross FX trades. Prereg: forge/OVERNIGHT_HOLD_FX_PREREG.md.

The banked scorer (scripts/overnight-hold/honest.py) with one change: FX financing. OANDA charges/credits the long
side r_long(t) = base(t) - quote(t) - m a year, m fixed from the 2026-10-20 snapshot; 3 days on Wednesday.
Overnight rates: GBP = SONIA, USD = DFF, JPY = BoJ TONA (forward-filled). A positive r_long is a credit (cost < 0).
Spread, bootstrap, verdict rule, buy & hold and the prop check are the banked functions, unchanged.

Inputs: analysis/output/overnight-hold-fx/trades_<k>_full.csv (run_engine.mjs), data/m1_bidask/<k>_m1.parquet.
Usage: python scripts/overnight-hold-fx/honest.py
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "overnight-hold"))
import honest as H  # noqa: E402  (the banked scorer: half_spread_at, boot, summary, breakeven, prop_rolling)

OUT = ROOT / "analysis" / "output" / "overnight-hold-fx"
SEED = 20261108
START, END = H.START, H.END
SNAP_DATE = pd.Timestamp("2026-10-20")
PAIRS = {"gbpusd": ("GBP_USD", "gbp", "usd"), "usdjpy": ("USD_JPY", "usd", "jpy")}
H.B, H.BLOCK = 10_000, 20


def rates():
    usd = pd.read_csv(ROOT / "analysis/output/overnight-hold/dff.csv", parse_dates=["observation_date"]).set_index("observation_date")["DFF"]
    obs = json.loads((ROOT / "analysis/output/xccy-basis/rates/IUDSOIA.json").read_text())["observations"]
    gbp = pd.Series({pd.Timestamp(o["date"]): float(o["value"]) for o in obs if o["value"] not in (".", "")})
    jpy = {}
    for line in (ROOT / "analysis/output/xccy-basis/rates/BOJ_STRDCLUCON.csv").read_text(encoding="utf-8", errors="ignore").splitlines():
        p = line.split(",")
        if p and p[0] == "STRDCLUCON" and p[-1].strip() not in ("null", "") and p[-2].strip().isdigit():
            jpy[pd.Timestamp(p[-2].strip())] = float(p[-1])
    days = pd.date_range("2015-01-01", "2026-10-31")
    return {k: s.sort_index().reindex(days).ffill() for k, s in {"usd": usd, "gbp": gbp, "jpy": pd.Series(jpy)}.items()}


def load(k):
    t = pd.read_csv(OUT / f"trades_{k}_full.csv")
    t["date"] = pd.to_datetime(t["date"])
    t = t[(t["date"] >= START) & (t["date"] <= END)].reset_index(drop=True)
    ba = pd.read_parquet(ROOT / "data" / "m1_bidask" / f"{k}_m1.parquet", columns=["time", "bid_c", "ask_c"])
    ba["epoch"] = (ba["time"].astype("int64") // 10**6).astype("int64") if ba["time"].dtype.str.endswith("[us]") \
        else (ba["time"].astype("int64") // 10**9)
    ba = ba[["epoch", "bid_c", "ask_c"]].sort_values("epoch").reset_index(drop=True)
    meta = pd.read_parquet(ROOT / "Oanda Parquet Files" / "Bid and Ask" / "instrument_meta_log.parquet")
    return t, ba, meta[meta["name"] == PAIRS[k][0]].iloc[-1]


def fin_model(k, row, R):
    _, b, q = PAIRS[k]
    diff = R[b] - R[q]
    d0 = float(diff.loc[SNAP_DATE])
    m_long = d0 - float(row["financing_long_rate"]) * 100
    m_short = -d0 - float(row["financing_short_rate"]) * 100
    return diff, {"diff_snapshot_pp": d0, "markup_long_pp": m_long, "markup_short_pp": m_short,
                  "snapshot_long_pct": float(row["financing_long_rate"]) * 100, "snapshot_short_pct": float(row["financing_short_rate"]) * 100,
                  "wed_days": int(row["financing_days_wed"])}


def costs(t, ba, diff, fm):
    t = t.copy()
    t["spread_entry"] = H.half_spread_at(ba, t["entryEpoch"].to_numpy())
    t["spread_exit"] = H.half_spread_at(ba, t["exitEpoch"].to_numpy())
    days = np.where(t["date"].dt.dayofweek == 2, fm["wed_days"], 1)
    d = diff.reindex(t["date"]).to_numpy()
    t["fin_days"] = days
    t["financing"] = -(d - fm["markup_long_pp"]) / 365 * days          # cost; negative = credit
    t["financing_short"] = -(-d - fm["markup_short_pp"]) / 365 * days   # mirror (short) leg
    t["spread"] = t["spread_entry"] + t["spread_exit"]
    t["net"] = t["grossPct"] - t["spread"] - t["financing"]
    t["net_short"] = -t["grossPct"] - t["spread"] - t["financing_short"]
    return t


def buy_hold(t, ba, diff, fm):
    first, last = t.iloc[0], t.iloc[-1]
    gross_mult = last["exitPrice"] / first["entryPrice"]
    sp = H.half_spread_at(ba, np.array([first["entryEpoch"]]))[0] + H.half_spread_at(ba, np.array([last["exitEpoch"]]))[0]
    days = pd.date_range(first["date"], pd.to_datetime(last["exitDate"]), freq="D")[:-1]
    r = (diff.reindex(days).to_numpy() - fm["markup_long_pp"]) / 365 / 100   # + = credit
    net_mult = gross_mult * (1 - sp / 100) * np.prod(1 + r)
    yrs = (pd.to_datetime(last["exitDate"]) - first["date"]).days / 365.25
    return {"gross_totalPct": (gross_mult - 1) * 100, "net_totalPct": (net_mult - 1) * 100,
            "gross_cagr": (gross_mult ** (1 / yrs) - 1) * 100, "net_cagr": (net_mult ** (1 / yrs) - 1) * 100,
            "financing_credit_pct_simple": float(r.sum() * 100), "calendar_days": len(days), "years": yrs}


def main():
    rng = np.random.default_rng(SEED)
    R = rates()
    res = {"seed": SEED, "B": H.B, "block": H.BLOCK, "window": [str(START.date()), str(END.date())], "instruments": {}}
    for k in PAIRS:
        t, ba, row = load(k)
        diff, fm = fin_model(k, row, R)
        t = costs(t, ba, diff, fm)
        miss = t["spread"].isna() | t["financing"].isna()
        t = t[~miss].reset_index(drop=True)
        years = (pd.to_datetime(t["exitDate"].iloc[-1]) - t["date"].iloc[0]).days / 365.25
        h = len(t) // 2
        r = {"trades": len(t), "dropped_no_bidask_or_rate": int(miss.sum()), "years": years, "financing_model": fm,
             "avg_cost_pct": {"spread": float(t["spread"].mean()), "financing": float(t["financing"].mean())},
             "decomposition_simple_sum_pct": {"gross_price": float(t["grossPct"].sum()), "spread": float(-t["spread"].sum()),
                                              "financing": float(-t["financing"].sum())},
             "gross": H.summary(t["grossPct"], years) | {"mean": float(t["grossPct"].mean())},
             "net": H.summary(t["net"], years) | H.boot(t["net"], rng),
             "mirror_short_DESCRIPTIVE": {"gross": H.summary(-t["grossPct"], years), "net": H.summary(t["net_short"], years) | {"mean": float(t["net_short"].mean())}},
             "halves_net_mean": [float(t["net"].iloc[:h].mean()), float(t["net"].iloc[h:].mean())],
             "split_date": str(t["date"].iloc[h].date()),
             "breakeven_cost_multiple": H.breakeven(t),
             "by_year_net_pct": {int(y): float((np.prod(1 + g["net"] / 100) - 1) * 100) for y, g in t.groupby(t["date"].dt.year)},
             "by_weekday": {d: {"n": len(g), "gross": float(g["grossPct"].mean()), "net": float(g["net"].mean()), "fin": float(g["financing"].mean())}
                            for d, g in t.groupby(t["date"].dt.day_name())},
             "buy_hold_cfd": buy_hold(t, ba, diff, fm),
             "prop_intraday_1x": H.prop_rolling(t, 1.0)}
        res["instruments"][k] = r
        t.to_csv(OUT / f"honest_trades_{k}.csv", index=False)

    ks = list(PAIRS)
    ps = [res["instruments"][k]["net"]["p"] for k in ks]
    order = np.argsort(ps); adj = [0.0] * len(ks); run = 0.0
    for i_, j in enumerate(order):
        run = max(run, (len(ks) - i_) * ps[j]); adj[j] = min(run, 1.0)
    for k, a in zip(ks, adj):
        r = res["instruments"][k]; n = r["net"]
        r["holm_p"] = a
        if n["ci95"][0] > 0 and a < 0.05 and min(r["halves_net_mean"]) > 0: v = "VALIDATED"
        elif n["ci95"][1] < 0.01: v = "NULL"
        else: v = "UNDERPOWERED"
        r["verdict"] = v
    (OUT / "results.json").write_text(json.dumps(res, indent=2, default=float))
    for k, r in res["instruments"].items():
        n, g, bh, fm = r["net"], r["gross"], r["buy_hold_cfd"], r["financing_model"]
        print(f"\n== {k}: {r['trades']} trades ({r['dropped_no_bidask_or_rate']} dropped), {r['years']:.2f} yrs  verdict {r['verdict']}")
        print(f"  financing: snapshot long {fm['snapshot_long_pct']:+.2f}%  diff {fm['diff_snapshot_pp']:+.2f}  markup long {fm['markup_long_pp']:.2f} short {fm['markup_short_pp']:.2f}")
        print(f"  avg cost/trade: spread {r['avg_cost_pct']['spread']:.4f}%  financing {r['avg_cost_pct']['financing']:+.4f}%  decomposition {r['decomposition_simple_sum_pct']}")
        print(f"  gross: mean {g['mean']:+.4f}%  total {g['totalPct']:+.1f}%  CAGR {g['cagr']:+.2f}%  DD {g['max_dd']:.1f}%  Sharpe {g['sharpe_ann']:.2f}")
        print(f"  NET:   mean {n['mean']:+.4f}% [{n['ci95'][0]:+.4f}, {n['ci95'][1]:+.4f}] Holm p {r['holm_p']:.3f}  total {n['totalPct']:+.1f}%  CAGR {n['cagr']:+.2f}%  DD {n['max_dd']:.1f}%  Sharpe {n['sharpe_ann']:.2f}")
        print(f"  halves {r['halves_net_mean']}  breakeven x{r['breakeven_cost_multiple']}")
        print(f"  B&H CFD: gross {bh['gross_totalPct']:+.1f}% ({bh['gross_cagr']:+.2f}%/yr)  net {bh['net_totalPct']:+.1f}% ({bh['net_cagr']:+.2f}%/yr)  carry ~{bh['financing_credit_pct_simple']:+.1f}%")
        ms = r["mirror_short_DESCRIPTIVE"]
        print(f"  mirror short: gross total {ms['gross']['totalPct']:+.1f}%  net total {ms['net']['totalPct']:+.1f}%")
        print(f"  by year: { {y: round(v, 1) for y, v in r['by_year_net_pct'].items()} }")
        print(f"  prop 1x intraday: pass {r['prop_intraday_1x']['pass_rate']:.2%} of {r['prop_intraday_1x']['starts']}")


if __name__ == "__main__":
    main()
