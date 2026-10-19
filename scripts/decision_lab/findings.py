"""Decision Lab findings: the analysis behind the report at the top of decision-lab.html. Exploratory (not a registered test).

    PYTHONPATH=. python scripts/decision_lab/findings.py

Rule A at its registered setting (stop 0.2 sigma, target 5R, 2x spread table). For each of the five candidate filters in
forge/DECISION_LAB_FILTERS_PREREG.md: net R per trade when the condition agrees vs disagrees, with a week-block bootstrap
interval on the difference, in 2020-23 and in 2024-26 separately (both already viewed once; neither is a confirmation),
instruments agreeing in sign, and what a size rule (1.5x when agreeing, 0.5x when not) does to the record.
Output: backtest-data/decision-lab/findings.json.
"""
import gzip
import json
from pathlib import Path

import numpy as np
import pandas as pd

R = json.load(gzip.open("backtest-data/decision-lab/rule_a.json.gz", "rt"))
S, TG, MULT = 0.2, "5", 2.0
rows = []
for t in R["trades"]:
    m = R["instruments"][t["inst"]]
    j = m["stops"].index(S) * len(m["targets"]) + m["targets"].index(TG)
    g = t["g"][j]
    if not g:
        continue
    unit = t["o"] * t["sig"] / 100
    risk = abs(t["ep"] - (t["L"] - t["side"] * S * unit))
    rows.append({"inst": t["inst"], "d": t["d"], "net": g[0] / 1000 - (MULT * m["spread"] / risk if risk > 0 else 0), **t["f"]})
D = pd.DataFrame(rows)
D["wk"] = pd.to_datetime(D.d).dt.to_period("W").astype(str)
D["blk"] = np.where(D.d < "2024-01-01", "2020-23", "2024-26")
cuts = {k: D[k].quantile([1 / 3, 2 / 3]).tolist() for k in ("ivrv",)}
H = {
    "H1 funds positioned the trade's way": lambda x: x.cot_crowd > 0,
    "H2 rates moving the trade's way (20d)": lambda x: x.rates_20d > 0,
    "H3 IV/RV in its middle third": lambda x: (x.ivrv >= cuts["ivrv"][0]) & (x.ivrv < cuts["ivrv"][1]),
    "H4 VIX term structure inverted (stress)": lambda x: x.vix_term > 1,
    "H5 US surprises on the trade's side": lambda x: x.usd_surpr_5d > 0,
}
NEED = {"H1": "cot_crowd", "H2": "rates_20d", "H3": "ivrv", "H4": "vix_term", "H5": "usd_surpr_5d"}
rng = np.random.default_rng(20261019)


def boot_diff(sub, flag, B=2000):
    w = sub.assign(a=flag.astype(int))
    g = w.groupby(["wk", "a"]).net.agg(["sum", "count"]).unstack(fill_value=0)
    s1, n1, s0, n0 = (g[("sum", 1)].to_numpy() if ("sum", 1) in g else 0), (g[("count", 1)].to_numpy() if ("count", 1) in g else 0), \
                     (g[("sum", 0)].to_numpy() if ("sum", 0) in g else 0), (g[("count", 0)].to_numpy() if ("count", 0) in g else 0)
    k = len(g)
    idx = rng.integers(0, k, (B, k))
    d = s1[idx].sum(1) / np.maximum(n1[idx].sum(1), 1) - s0[idx].sum(1) / np.maximum(n0[idx].sum(1), 1)
    return [float(x) for x in np.quantile(d, [0.025, 0.975])]


out = {"setting": "rule A, stop 0.2 sigma, target 5R, 2x spread table", "trades": int(len(D)), "base_net_R": round(float(D.net.mean()), 4), "hyp": {}}
for name, f in H.items():
    col = NEED[name[:2]]
    sub = D[D[col].notna()]
    rec = {"coverage": int(len(sub))}
    for blk in ("2020-23", "2024-26", "all"):
        b = sub if blk == "all" else sub[sub.blk == blk]
        flag = f(b)
        a1, a0 = b[flag].net, b[~flag].net
        lo, hi = boot_diff(b, flag)
        per = b.assign(a=flag).groupby("inst").apply(lambda x: x[x.a].net.mean() - x[~x.a].net.mean() if x.a.sum() >= 10 and (~x.a).sum() >= 10 else np.nan, include_groups=False).dropna()
        rec[blk] = {"n_agree": int(flag.sum()), "n_other": int((~flag).sum()), "net_agree": round(float(a1.mean()), 3), "net_other": round(float(a0.mean()), 3),
                    "diff": round(float(a1.mean() - a0.mean()), 3), "ci95": [round(lo, 3), round(hi, 3)],
                    "instruments_same_sign": f"{int((np.sign(per) == np.sign(a1.mean() - a0.mean())).sum())}/{len(per)}"}
    # size rule on the whole record: 1.5x when the condition agrees, 0.5x when not, 1x when the input is missing
    sz = np.where(D[col].isna(), 1.0, np.where(f(D.fillna({col: np.nan})).fillna(False), 1.5, 0.5))
    pnl_flat, pnl_size = D.net.to_numpy(), D.net.to_numpy() * sz
    def weekly(p):
        w = pd.Series(p).groupby(D.wk.values).sum()
        return float(w.mean() / w.std(ddof=1) * np.sqrt(52))
    def mdd(p):
        e = np.cumsum(p); return float((e - np.maximum.accumulate(e)).min())
    rec["size_rule"] = {"flat_total_R": round(float(pnl_flat.sum()), 1), "sized_total_R": round(float(pnl_size.sum()), 1),
                        "flat_sharpe": round(weekly(pnl_flat), 2), "sized_sharpe": round(weekly(pnl_size), 2),
                        "flat_maxdd_R": round(mdd(pnl_flat), 1), "sized_maxdd_R": round(mdd(pnl_size), 1)}
    out["hyp"][name] = rec
# verdicts (fixed wording rules): same sign in both periods with >= 60% of instruments agreeing in each = a lead;
# a sign flip between periods = drop. Nothing is "proven": both periods were viewed, and no interval clears zero.
for name, v in out["hyp"].items():
    a, b = v["2020-23"], v["2024-26"]
    same = np.sign(a["diff"]) == np.sign(b["diff"])
    frac = lambda s_: int(s_.split("/")[0]) / max(1, int(s_.split("/")[1]))
    thin = min(a["n_agree"], b["n_agree"]) < 150
    if not same:
        v["verdict"], v["read"] = "drop", f"Flips sign between the periods ({a['diff']:+.2f}R then {b['diff']:+.2f}R): no stable effect."
    elif frac(a["instruments_same_sign"]) >= 0.6 and frac(b["instruments_same_sign"]) >= 0.6:
        v["verdict"] = "lead (thin)" if thin else "lead"
        v["read"] = (f"Same direction in both periods ({a['diff']:+.2f}R, {b['diff']:+.2f}R per trade) and on most instruments "
                     f"({a['instruments_same_sign']}, {b['instruments_same_sign']}). Sizing by it: Sharpe {v['size_rule']['flat_sharpe']} → "
                     f"{v['size_rule']['sized_sharpe']}, worst drawdown {v['size_rule']['flat_maxdd_R']}R → {v['size_rule']['sized_maxdd_R']}R."
                     + (f" Only {a['n_agree']} + {b['n_agree']} trades agree, so the interval is wide." if thin else ""))
    else:
        v["verdict"], v["read"] = "weak lead", (f"Same direction in both periods ({a['diff']:+.2f}R, {b['diff']:+.2f}R) but not on most instruments "
                                                f"({a['instruments_same_sign']}, {b['instruments_same_sign']}).")
out["bottom_line"] = ("No filter is proven: every interval crosses zero, and both periods have now been looked at. One filter is consistent: "
                      "IV÷RV in its middle band (better in both periods, on 5 of 7 instruments; sizing by it lifts the Sharpe from 0.96 to 1.12 "
                      "and cuts the worst drawdown from 98R to 64R). Two are weak leads: VIX stress (a large effect but only ~240 trades and 4 "
                      "of 7 instruments) and funds already positioned the trade's way (weak in 2020–23). Rates and US surprises flip sign and "
                      "are dropped. Next: register the three survivors and score them on data nobody has seen (the forward paper record and "
                      "the sealed holdout). Until one passes, rule A stays at flat size.")
srt = np.sort(D.net.to_numpy())[::-1]
k1 = max(1, len(srt) // 100)
out["concentration"] = {"top1pct_share_of_total": round(float(srt[:k1].sum() / srt.sum()), 2), "mean_without_top1pct": round(float(srt[k1:].mean()), 3),
                        "median_trade": round(float(np.median(srt)), 2)}
out["prior_art"] = [
    "Rule A's own registered test (forge/BREAK_IVRV_PREREG.md, branch fade-continue-book, never merged): passed 5 of 5 checks on the v4 lines, "
    "+0.118R per trade at one spread; but the edge was about one spread wide (+0.005R at two spreads on FX/gold), the best 1% of trades carried 64% "
    "of the total, and 2016–19 was negative. On the chosen lines here: top 1% carry " + f"{out['concentration']['top1pct_share_of_total']:.0%}" +
    f" of the total, +{out['concentration']['mean_without_top1pct']:.3f}R per trade without them, median trade {out['concentration']['median_trade']}R.",
    "IV ÷ RV: in that test the top third (≥ 1.27) made money and the middle and bottom thirds lost. The 'middle band' here is inside rule A's already-rich "
    "days (about 1.28–1.51), so the reading is: rich, but not extremely rich.",
    "COT (forge/IVRV_COT_PREREG.md, same branch): at the forecast lines, moves heading the way speculators are crowded continued 2.7 points LESS "
    "(both halves). That points the opposite way to the weak lead here (breaks with funds positioned their way did better). The two measures differ "
    "(crowded = 156-week percentile ≥ 80 at line passes, vs z-score > 0 on rule A breaks), but the conflict stands until a registered test settles it.",
]
Path("backtest-data/decision-lab/findings.json").write_text(json.dumps(out, indent=1))
print(json.dumps({k: (v["verdict"], v["read"]) for k, v in out["hyp"].items()}, indent=1))
for k, v in out["hyp"].items():
    print(k)
    for blk in ("2020-23", "2024-26"):
        x = v[blk]; print(f"   {blk}: agree {x['n_agree']} {x['net_agree']:+.3f} vs other {x['n_other']} {x['net_other']:+.3f}  diff {x['diff']:+.3f} {x['ci95']}  inst {x['instruments_same_sign']}")
    print("   size rule:", v["size_rule"])
