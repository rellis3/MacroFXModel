"""RATE-XSMOM (forge/RATE_XSMOM_PREREG.md): cross-sectional momentum in short-term rate differentials across 9 currencies
vs USD, plus a US-rates timing rule for NASDAQ. Monthly, 1976-2026, FRED data.

    node scripts/rate_xsmom/fetch.mjs     # once
    python scripts/rate_xsmom/study.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

F = Path("analysis/output/ys_long/fred")
OUT = Path("analysis/output/rate_xsmom")
OUT.mkdir(parents=True, exist_ok=True)
B, BLOCK, SEED = 2000, 12, 20261008
rng = np.random.default_rng(SEED)
COST_FX, COST_NQ = 0.0002, 0.0005
P1, P2 = ("1976-01", "2014-12"), ("2015-01", "2026-09")

# ccy: (FRED spot id, quoted as USD per foreign?, [(rate id, used until YYYY-MM or None)])
CCY = {
    "EUR": ("DEXUSEU", True, [("IR3TIB01DEM156N", None)]),
    "JPY": ("DEXJPUS", False, [("IRSTCI01JPM156N", "2002-03"), ("IR3TIB01JPM156N", None)]),
    "GBP": ("DEXUSUK", True, [("IR3TIB01GBM156N", None)]),
    "AUD": ("DEXUSAL", True, [("IR3TIB01AUM156N", None)]),
    "CAD": ("DEXCAUS", False, [("IR3TIB01CAM156N", None)]),
    "CHF": ("DEXSZUS", False, [("IRSTCI01CHM156N", "1999-06"), ("IR3TIB01CHM156N", None)]),
    "NZD": ("DEXUSNZ", True, [("IR3TIB01NZM156N", None)]),
    "NOK": ("DEXNOUS", False, [("IR3TIB01NOM156N", None)]),
    "SEK": ("DEXSDUS", False, [("IR3TIB01SEM156N", None)]),
}


def fred(i):
    d = pd.read_csv(F / f"{i}.csv")
    d.columns = ["date", "v"]
    d["v"] = pd.to_numeric(d.v, errors="coerce")
    return pd.Series(d.v.to_numpy(float), index=pd.to_datetime(d.date)).dropna()


MONTHS = pd.period_range("1971-01", "2026-09", freq="M")


def monthly_rate(parts):
    """month-indexed rate; spliced; value for month M = observation dated M-01."""
    s = pd.Series(np.nan, index=MONTHS)
    for i, until in parts:
        r = fred(i)
        r.index = r.index.to_period("M")
        r = r[~r.index.duplicated()].reindex(MONTHS)
        if until is None:
            s = s.fillna(r) if s.notna().any() else r
        else:
            s[s.index <= pd.Period(until)] = r[r.index <= pd.Period(until)]
    return s


def usable(rate):
    """rate usable at the END of month t = observation of month t-1 (dated t-1's 1st, +45 days); stale > 3 months -> NaN."""
    u = rate.shift(1)
    return u.ffill(limit=3)


US = usable(monthly_rate([("IR3TIB01USM156N", None)]))
spot_ret, d, cur_d = {}, {}, {}
for c, (sid, usd_per, parts) in CCY.items():
    s = fred(sid)
    me = s.groupby(s.index.to_period("M")).last().reindex(MONTHS)
    val = me if usd_per else 1.0 / me
    spot_ret[c] = np.log(val).diff()                      # month t return, end t-1 -> end t
    d[c] = usable(monthly_rate(parts)) - US               # differential known at end of month t
SR = pd.DataFrame(spot_ret)
D = pd.DataFrame(d)
CARRY_NEXT = D / 12 / 100                                 # carry earned over month t+1 for a position opened at end t


def book(signal):
    """long top third / short bottom third by signal at end t, held over t+1. Returns monthly net return series."""
    W = pd.DataFrame(0.0, index=MONTHS, columns=SR.columns)
    for t in MONTHS:
        s = signal.loc[t]
        ok = s.notna() & D.loc[t].notna() & SR.shift(-1).loc[t].notna()
        s = s[ok]
        k = len(s) // 3
        if k < 2:
            continue
        o = s.sort_values()
        W.loc[t, o.index[-k:]] = 1.0 / k
        W.loc[t, o.index[:k]] = -1.0 / k
    gross = (W.shift(1) * (SR + CARRY_NEXT.shift(1))).sum(axis=1)
    cost = W.diff().abs().sum(axis=1).shift(1) * COST_FX
    active = W.shift(1).abs().sum(axis=1) > 0
    return (gross - cost)[active], W


def boot_mean(x):
    x = np.asarray(x, float); n = len(x)
    reps = []
    for _ in range(B):
        idx = np.concatenate([np.arange(s, s + BLOCK) % n for s in rng.integers(0, n, n // BLOCK + 1)])[:n]
        reps.append(x[idx].mean())
    return [round(float(x.mean()) * 100, 4), *np.round(np.percentile(reps, [2.5, 97.5]) * 100, 4).tolist()]


def stats(r):
    r = r.dropna()
    eq = r.cumsum()
    return {"months": int(len(r)), "mean_pct_month": boot_mean(r), "ann_return_pct": round(float(r.mean() * 12 * 100), 2),
            "sharpe": round(float(r.mean() / r.std() * np.sqrt(12)), 3), "max_dd_pct": round(float((eq - eq.cummax()).min() * 100), 1),
            "hit": round(float((r > 0).mean()), 3)}


def per(r, p):
    return r[(r.index >= pd.Period(p[0])) & (r.index <= pd.Period(p[1]))]


def nw_alpha(y, X, lags=6):
    df = pd.concat([y.rename("y"), X], axis=1).dropna()
    Y = df.y.to_numpy(); Z = np.column_stack([np.ones(len(df)), df.drop(columns="y").to_numpy()])
    b = np.linalg.lstsq(Z, Y, rcond=None)[0]; e = Y - Z @ b
    ZZi = np.linalg.inv(Z.T @ Z)
    S = (Z * e[:, None]).T @ (Z * e[:, None])
    for L in range(1, lags + 1):
        w = 1 - L / (lags + 1)
        G = (Z[L:] * e[L:, None]).T @ (Z[:-L] * e[:-L, None])
        S += w * (G + G.T)
    V = ZZi @ S @ ZZi
    return {"alpha_pct_month": round(float(b[0] * 100), 4), "t": round(float(b[0] / np.sqrt(V[0, 0])), 2),
            "betas": dict(zip(df.drop(columns="y").columns, np.round(b[1:], 3).tolist())), "months": int(len(df))}


res = {}
xs = {}
for L in (1, 3, 6, 12):
    xs[L], _ = book(D - D.shift(L))
carry, _ = book(D)
fxmom, _ = book(SR.rolling(3).sum())
main = xs[3]
res["fx_main_L3"] = {"1976-2014": stats(per(main, P1)), "2015-2026": stats(per(main, P2)), "all": stats(main)}
res["fx_other_L"] = {f"L{L}": {"1976-2014": stats(per(xs[L], P1)), "2015-2026": stats(per(xs[L], P2))} for L in (1, 6, 12)}
res["carry"] = {"1976-2014": stats(per(carry, P1)), "2015-2026": stats(per(carry, P2))}
res["fx_momentum"] = {"1976-2014": stats(per(fxmom, P1)), "2015-2026": stats(per(fxmom, P2))}
res["alpha_vs_carry_mom"] = nw_alpha(main, pd.concat([carry.rename("carry"), fxmom.rename("fx_mom")], axis=1))
res["correlations"] = {"carry": round(float(main.corr(carry)), 3), "fx_momentum": round(float(main.corr(fxmom)), 3)}
try:
    ys = pd.read_csv("analysis/output/ys_long/daily_flat.csv")
    dcol = [c for c in ys.columns if "date" in c.lower()][0]
    vcol = [c for c in ys.columns if c != dcol][-1]
    ysm = ys.groupby(pd.to_datetime(ys[dcol]).dt.to_period("M"))[vcol].sum()
    res["correlations"]["yield_spread_book"] = round(float(main.corr(ysm)), 3)
except Exception as e:
    res["correlations"]["yield_spread_book"] = f"n/a ({e})"
p1, p2 = res["fx_main_L3"]["1976-2014"], res["fx_main_L3"]["2015-2026"]
res["fx_checks"] = {"p1_ci_above_0": bool(p1["mean_pct_month"][1] > 0), "p2_mean_above_0": bool(p2["mean_pct_month"][0] > 0),
                    "alpha_t_ge_2": bool(res["alpha_vs_carry_mom"]["alpha_pct_month"] > 0 and res["alpha_vs_carry_mom"]["t"] >= 2)}
res["fx_pass"] = all(res["fx_checks"].values())

# ── NASDAQ ──────────────────────────────────────────────────────────────────────────────────────────────────────────
nq = fred("NASDAQCOM")
nqm = np.log(nq.groupby(nq.index.to_period("M")).last().reindex(MONTHS)).diff()
tb = monthly_rate([("TB3MS", None)])
tbu = usable(tb)
tb_month = tb / 12 / 100                                  # T-bill return over month t (rate of month t; earned, not a signal)
excess_bh = nqm - tb_month
others = pd.DataFrame({c: usable(monthly_rate(CCY[c][2])) for c in CCY}).mean(axis=1)
sigA = (tbu < tbu.shift(3))
usd_diff = US - others
sigB = (usd_diff < usd_diff.shift(3))


def timing(sig):
    pos = sig.astype(float).where(tbu.notna() & tbu.shift(3).notna())
    held = pos.shift(1)
    ex = held * excess_bh - pos.diff().abs().shift(1).fillna(0) * COST_NQ
    return ex.dropna()


def sharpe(x):
    return float(x.mean() / x.std() * np.sqrt(12))


def sharpe_diff(a, b):
    j = a.index.intersection(b.index); a, b = a[j].to_numpy(), b[j].to_numpy(); n = len(a)
    reps = []
    for _ in range(B):
        idx = np.concatenate([np.arange(s, s + BLOCK) % n for s in rng.integers(0, n, n // BLOCK + 1)])[:n]
        reps.append(sharpe(pd.Series(a[idx])) - sharpe(pd.Series(b[idx])))
    pt = sharpe(pd.Series(a)) - sharpe(pd.Series(b))
    return [round(pt, 3), *np.round(np.percentile(reps, [2.5, 97.5]), 3).tolist()]


bh = excess_bh.dropna()
bh = bh[bh.index >= pd.Period("1976-01")]
for name, sig in (("A_us_tbill", sigA), ("B_us_differential", sigB)):
    ex = timing(sig)
    ex = ex[ex.index >= pd.Period("1976-01")]
    r = {"time_in_market": round(float(sig.reindex(ex.index).mean()), 3)}
    for lab, p in (("1976-2014", P1), ("2015-2026", P2), ("all", ("1976-01", "2026-09"))):
        a, b_ = per(ex, p), per(bh, p)
        r[lab] = {"rule_sharpe": round(sharpe(a), 3), "buyhold_sharpe": round(sharpe(b_), 3),
                  "rule_ann_excess_pct": round(float(a.mean() * 1200), 2), "buyhold_ann_excess_pct": round(float(b_.mean() * 1200), 2),
                  "sharpe_diff": sharpe_diff(a, b_)}
    res[f"nasdaq_{name}"] = r
A = res["nasdaq_A_us_tbill"]
res["nasdaq_checks"] = {"all_ci_above_0": bool(A["all"]["sharpe_diff"][1] > 0),
                        "both_periods_positive": bool(A["1976-2014"]["sharpe_diff"][0] > 0 and A["2015-2026"]["sharpe_diff"][0] > 0)}
res["nasdaq_pass"] = all(res["nasdaq_checks"].values())
(OUT / "results.json").write_text(json.dumps(res, indent=1, default=str))
pd.DataFrame({"xs_rate_mom_L3": main, "carry": carry, "fx_momentum": fxmom}).to_csv(OUT / "monthly_returns.csv")

ci = lambda c: f"{c[0]:+.3f} [{c[1]:+.3f}, {c[2]:+.3f}]"
row = lambda s: f"{s['months']} | {ci(s['mean_pct_month'])} | {s['ann_return_pct']:+.2f} | {s['sharpe']:+.2f} | {s['max_dd_pct']:.1f} | {s['hit'] * 100:.0f}%"
md = ["# RATE-XSMOM — results", "", "Pre-registration: `forge/RATE_XSMOM_PREREG.md`. FRED monthly 3-month rates (45-day lag) + daily spot, "
      "9 currencies vs USD; long top third / short bottom third; spot + carry − 0.02% turnover cost. 12-month block bootstrap.", "",
      f"## FX book, signal = 3-month change in the short-rate differential: **{'PASS' if res['fx_pass'] else 'FAIL'}**", "",
      f"Checks: {res['fx_checks']}", "",
      "| book | period | months | mean % / month [95%] | ann. % | Sharpe | max DD % | months up |", "|---|---|---|---|---|---|---|---|"]
for lab in ("1976-2014", "2015-2026", "all"):
    md.append(f"| **rate-diff momentum L3** | {lab} | {row(res['fx_main_L3'][lab])} |")
for L in (1, 6, 12):
    for lab in ("1976-2014", "2015-2026"):
        md.append(f"| rate-diff momentum L{L} | {lab} | {row(res['fx_other_L'][f'L{L}'][lab])} |")
for k, nm in (("carry", "carry (rate level)"), ("fx_momentum", "FX price momentum")):
    for lab in ("1976-2014", "2015-2026"):
        md.append(f"| {nm} | {lab} | {row(res[k][lab])} |")
a = res["alpha_vs_carry_mom"]
md += ["", f"- **Beyond carry and FX momentum:** alpha {a['alpha_pct_month']:+.3f}% / month, Newey-West t {a['t']:+.2f} "
       f"({a['months']} months); betas {a['betas']}",
       f"- Correlations of the L3 book with: {res['correlations']}", "",
       f"## NASDAQ: long when US short rates are falling (else T-bills): **{'PASS' if res['nasdaq_pass'] else 'FAIL'}**", "",
       f"Checks (rule A): {res['nasdaq_checks']}", "",
       "| rule | period | rule Sharpe | buy & hold Sharpe | difference [95%] | rule ann. excess % | B&H ann. excess % |", "|---|---|---|---|---|---|---|"]
for name, lab_ in (("A_us_tbill", "A: US T-bill falling"), ("B_us_differential", "B: US − others falling")):
    r = res[f"nasdaq_{name}"]
    for lab in ("1976-2014", "2015-2026", "all"):
        x = r[lab]
        md.append(f"| {lab_} | {lab} | {x['rule_sharpe']:+.2f} | {x['buyhold_sharpe']:+.2f} | {ci(x['sharpe_diff'])} | "
                  f"{x['rule_ann_excess_pct']:+.2f} | {x['buyhold_ann_excess_pct']:+.2f} |")
    md.append(f"| {lab_} | time in market | {r['time_in_market'] * 100:.0f}% | | | | |")
(OUT / "RESULTS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
print("\n".join(md).encode("ascii", "replace").decode())
