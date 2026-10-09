"""US-EU short-rate differential vs Nasdaq: lead / lag / coincident, 15-min family (plans/RATE_DIFF_NQ_LEADLAG_PLAN.md).

    python scripts/rate_diff_nq/leadlag15.py --period explore     # 2025-10-13 .. 2026-03-31 (clean data only)
    python scripts/rate_diff_nq/leadlag15.py --period confirm     # 2026-04-01 .. 2026-10-08 (after the euro re-pull)
    python scripts/rate_diff_nq/leadlag15.py --period explore --mid   # MIDPOINT bars (analysis/output/stir_mid15)

Lag convention everywhere: k > 0 = the RATE series moved k bars BEFORE the Nasdaq move (rates lead);
k < 0 = Nasdaq moved first; k = 0 = same bar.
"""
import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.api as sm
from statsmodels.tsa.api import VAR

ap = argparse.ArgumentParser()
ap.add_argument("--period", choices=["explore", "confirm"], default="explore")
ap.add_argument("--mid", action="store_true", help="use MIDPOINT 15-min bars where available")
ap.add_argument("--scrambles", type=int, default=100)
A = ap.parse_args()
PER = {"explore": ("2025-10-13", "2026-04-01"), "confirm": ("2026-04-01", "2026-10-09")}[A.period]
STIR = Path("analysis/output/stir")
MID = Path("analysis/output/stir_mid15")
OUT = Path("analysis/output/rate_diff_nq") / (A.period + ("_mid" if A.mid else ""))
OUT.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(20261009)
BPD = 96                                      # 15-min slots per day on the full grid
LAGS = range(-8, 9)
# last trading day per contract (expired: their last bar; live: IBKR contract details)
LAST = {"CME_SR3M6": "2026-09-15", "CME_SR3U6": "2026-12-15", "CME_SR3Z6": "2027-03-16", "CME_SR3H7": "2027-06-15",
        "CME_SR3M7": "2027-09-14", "ICEEU_IM6": "2026-06-15", "ICEEU_IU6": "2026-09-14", "ICEEU_IZ6": "2026-12-14"}


def load(name):
    """rate (%) and volume per 15-min bar for one contract; MIDPOINT if asked and present (volume then n/a)."""
    p = (MID / f"{name}.csv") if A.mid and (MID / f"{name}.csv").exists() else STIR / f"{name}.csv"
    d = pd.read_csv(p)
    idx = pd.to_datetime(d.time).dt.tz_localize(None)
    vol = d.volume.to_numpy(float) if "volume" in d and d.volume.max() > 0 else np.full(len(d), np.nan)
    return pd.DataFrame({"rate": 100 - d.close.to_numpy(float), "vol": vol}, index=idx), p.parent.name


grid = pd.date_range(PER[0], PER[1], freq="15min", inclusive="left")
grid = grid[grid.dayofweek < 5]
day = grid.normalize()
lon = grid.tz_localize("UTC").tz_convert("Europe/London")
hm = lon.hour * 60 + lon.minute
SESS = {"asia": hm < 420, "london": (hm >= 420) & (hm < 750), "us_data_open": (hm >= 750) & (hm < 960), "us_pm": (hm >= 960) & (hm < 1260)}

src = {}
LEG = {}
for n in LAST:
    try:
        df, s = load(n)
    except FileNotFoundError:
        continue
    src[n] = s
    LEG[n] = df.reindex(grid)                 # NO forward fill: a missing bar is missing


def dleg(n, fresh=False):
    """bp change bar-to-bar within one contract; NaN unless both bars exist (and, if fresh, both had trades)."""
    r = LEG[n].rate
    d = r.diff() * 100
    ok = r.notna() & r.shift(1).notna()
    if fresh and LEG[n].vol.notna().any():
        ok &= (LEG[n].vol > 0) & (LEG[n].vol.shift(1) > 0)
    return d.where(ok)


def generic(prefix, lo=6, hi=12, fresh=False):
    """change per bar from the contract with lo-hi months to expiry (nearest in bucket)."""
    out = pd.Series(np.nan, index=grid); best = pd.Series(np.inf, index=grid)
    for n in LAST:
        if not n.startswith(prefix) or n not in LEG:
            continue
        mte = (pd.Timestamp(LAST[n]) - grid).days / 30.44
        d = dleg(n, fresh)
        take = (mte >= lo) & (mte < hi) & d.notna().to_numpy() & (mte < best.to_numpy())
        out[take] = d[take]; best[take] = mte[take]
    return out


nq = pd.read_parquet("analysis/output/rates_residual/m15/NAS100_USD.parquet")["close"].reindex(grid)
dP = (np.log(nq).diff() * 100).where(nq.notna() & nq.shift(1).notna())     # % per bar

SERIES = {}
for fresh in (False, True):
    tag = "_fresh" if fresh else ""
    if "CME_SR3Z6" in LEG and "ICEEU_IZ6" in LEG:
        SERIES[f"US-EU Dec26{tag}"] = dleg("CME_SR3Z6", fresh) - dleg("ICEEU_IZ6", fresh)
    SERIES[f"US-EU generic 6-12m{tag}"] = generic("CME_SR3", fresh=fresh) - generic("ICEEU_I", fresh=fresh)
    if "CME_SR3Z6" in LEG:
        SERIES[f"US leg SR3Z6{tag}"] = dleg("CME_SR3Z6", fresh)
    if "CME_SR3H7" in LEG:
        SERIES[f"US leg SR3H7{tag}"] = dleg("CME_SR3H7", fresh)
    if "ICEEU_IZ6" in LEG:
        SERIES[f"EU leg IZ6{tag}"] = dleg("ICEEU_IZ6", fresh)

TF = {"15m": 1, "30m": 2, "1h": 4, "4h": 16}


def agg(s, k):
    """non-overlapping k-bar sums aligned to the clock; NaN if any constituent bar is missing."""
    if k == 1:
        return s
    g = np.arange(len(s)) // k
    v = pd.Series(s.to_numpy(), index=g)
    tot = v.groupby(level=0).sum(min_count=k)
    cnt = v.groupby(level=0).count()
    tot[cnt < k] = np.nan
    return pd.Series(tot.to_numpy(), index=grid[::k][:len(tot)])


def daily(s):
    return s.groupby(day).sum(min_count=20)


def stats_corr(x, y, dy):
    ok = np.isfinite(x) & np.isfinite(y)
    if ok.sum() < 30:
        return np.nan, (np.nan, np.nan), int(ok.sum())
    x, y, dy = x[ok], y[ok], dy[ok]
    u, inv = np.unique(dy, return_inverse=True)
    st = np.zeros((len(u), 6))
    for j, v in enumerate((np.ones_like(x), x, y, x * x, y * y, x * y)):
        np.add.at(st[:, j], inv, v)

    def corr(s):
        n, sx, sy, sxx, syy, sxy = s
        return (sxy / n - sx * sy / n / n) / np.sqrt(max((sxx / n - (sx / n) ** 2) * (syy / n - (sy / n) ** 2), 1e-30))
    pt = corr(st.sum(0))
    reps = [corr(np.bincount(rng.integers(0, len(u), len(u)), minlength=len(u)) @ st) for _ in range(300)]
    return float(pt), tuple(np.percentile(reps, [2.5, 97.5]).round(4)), int(ok.sum())


def correlogram(x, y, idx_day, lags, bars_per_day):
    """corr(x[t-k], y[t]) for each k, with day-block CI and a scrambled-day null band (x shifted by whole days)."""
    X, Y = x.to_numpy(float), y.to_numpy(float)
    dy = np.asarray(idx_day)
    out = {}
    for k in lags:
        xs = np.roll(X, k); xs[:k] = np.nan if k > 0 else xs[:k]
        if k < 0:
            xs[k:] = np.nan
        c, ci, n = stats_corr(xs, Y, dy)
        out[k] = {"corr": c, "ci": ci, "n": n}
    nd = len(np.unique(dy))
    null = {k: [] for k in lags}
    for _ in range(A.scrambles):
        sh = int(rng.integers(5, max(nd - 5, 6))) * bars_per_day
        Xs = np.roll(X, sh)
        for k in lags:
            xs = np.roll(Xs, k)
            ok = np.isfinite(xs) & np.isfinite(Y)
            null[k].append(np.corrcoef(xs[ok], Y[ok])[0, 1] if ok.sum() > 30 else np.nan)
    for k in lags:
        out[k]["null95"] = float(np.nanpercentile(np.abs(null[k]), 95))
    return out


def granger(x, y, maxlag=8):
    """lag order by BIC on a VAR of (rate, price); HAC Wald tests of each direction."""
    df = pd.DataFrame({"r": x, "p": y}).dropna()
    if len(df) < 200:
        return {"n": len(df)}
    try:
        p = max(1, int(VAR(df.to_numpy()).select_order(maxlag).selected_orders["bic"]))
    except Exception:
        p = 2
    res = {"n": int(len(df)), "lag_order_bic": p}
    for name, dep, oth in (("rate->price", "p", "r"), ("price->rate", "r", "p")):
        L = pd.concat({f"{c}{i}": df[c].shift(i) for c in (dep, oth) for i in range(1, p + 1)}, axis=1)
        Z = pd.concat([df[dep], L], axis=1).dropna()
        m = sm.OLS(Z[dep], sm.add_constant(Z.drop(columns=dep))).fit(cov_type="HAC", cov_kwds={"maxlags": p})
        R = [c for c in m.params.index if c.startswith(oth)]
        w = m.wald_test(" = 0, ".join(R) + " = 0", scalar=True)
        res[name] = {"F": round(float(w.statistic), 3), "p": round(float(w.pvalue), 4),
                     "coef_sum": round(float(m.params[R].sum()), 5)}
    return res


def deseason_abs(s):
    """|change| divided by its mean at that time of day (removes the intraday volume clock, which fakes vol leads)."""
    a = s.abs()
    tod = pd.Series(hm, index=grid)
    mean = a.groupby(tod.to_numpy()).transform("mean")
    return a / mean


res = {"period": A.period, "range": PER, "source": src, "bars": int(len(grid)), "series": {}, "diagnostics": {}}
dPfin = dP.notna()
res["diagnostics"]["nasdaq_bars_present"] = round(float(dPfin.mean()), 3)
for name, s in SERIES.items():
    d = {"share_present": round(float(s.notna().mean()), 3), "share_zero_change": round(float((s[s.notna()] == 0).mean()), 3),
         "joint_with_nq": int((s.notna() & dPfin).sum())}
    res["diagnostics"][name] = d

for name, s in SERIES.items():
    r = {}
    for tf, k in TF.items():
        x, y = agg(s, k), agg(dP, k)
        dd = x.index.normalize()
        cg = correlogram(x, y, dd, LAGS, BPD // k)
        n_days = len(np.unique(dd[np.isfinite(x.to_numpy()) & np.isfinite(y.to_numpy())]))
        r[tf] = {"correlogram": {str(kk): v for kk, v in cg.items()}, "granger": granger(x, y),
                 "mdc_80pct_power": round(float(2.8 / np.sqrt(max(cg[0]["n"], 1))), 4), "days": n_days}
        if tf in ("15m", "1h"):
            vx, vy = agg(deseason_abs(s), k), agg(deseason_abs(dP), k)
            r[tf]["vol_correlogram"] = {str(kk): v for kk, v in correlogram(vx, vy, dd, range(-4, 5), BPD // k).items()}
    xd, yd = daily(s), daily(dP)
    r["daily"] = {"correlogram": {str(kk): v for kk, v in correlogram(xd, yd, xd.index, range(-3, 4), 1).items()},
                  "granger": granger(xd, yd, 3)}
    # regimes at 15m: same bar and rate-leads-1 by session, release days, rate-vol
    reg = {}
    for sn, sm_ in SESS.items():
        x = s.where(sm_); reg[f"session:{sn}"] = {kk: stats_corr(np.roll(x.to_numpy(float), kk), dP.to_numpy(float), day.to_numpy())[0] for kk in (0, 1, 2, -1)}
    res["series"][name] = r | {"regimes_15m": {k: {str(kk): (round(v, 4) if np.isfinite(v) else None) for kk, v in d.items()} for k, d in reg.items()}}
    print("done", name, flush=True)

# release days vs others, rolling stability: on the main series
cal = pd.read_csv("calendar_events.csv", encoding="latin-1")
KEY = r"CPI|Nonfarm|Non-Farm|Payroll|FOMC|Fed Interest Rate|Federal Funds|PCE|GDP|ISM|Retail Sales|ECB|HICP|Deposit Facility"
rel = set(cal[(cal.impact.isin(["Major", "High"]) | cal.event.str.contains(KEY, case=False, na=False)) & cal.ccy.isin(["USD", "EUR"])].date)
reldays = np.array([str(d.date()) in rel for d in day])
main = "US-EU Dec26" if "US-EU Dec26" in SERIES else "US-EU generic 6-12m"
rs = {}
for lab, m in (("release_days", reldays), ("other_days", ~reldays)):
    x = SERIES[main].where(m)
    rs[lab] = {str(kk): round(stats_corr(np.roll(x.to_numpy(float), kk), dP.to_numpy(float), day.to_numpy())[0], 4) for kk in (0, 1, 2, 4, -1)}
dv = SERIES[main].abs().groupby(day).sum()
hi = set(dv[dv > dv.median()].index)
hm_ = np.array([d in hi for d in day])
for lab, m in (("high_rate_vol_days", hm_), ("low_rate_vol_days", ~hm_)):
    x = SERIES[main].where(m)
    rs[lab] = {str(kk): round(stats_corr(np.roll(x.to_numpy(float), kk), dP.to_numpy(float), day.to_numpy())[0], 4) for kk in (0, 1, 2, 4, -1)}
# rolling 20-day windows: same-bar and rate-leads-1 correlation (1h bars)
x1, y1 = agg(SERIES[main], 4), agg(dP, 4)
dd1 = x1.index.normalize()
ud = np.unique(dd1)
roll = []
for i in range(20, len(ud) + 1, 5):
    w = np.isin(dd1, ud[i - 20:i])
    c0 = stats_corr(x1.to_numpy(float)[w], y1.to_numpy(float)[w], dd1.to_numpy()[w])[0]
    xl = np.roll(x1.to_numpy(float), 1)
    c1 = stats_corr(xl[w], y1.to_numpy(float)[w], dd1.to_numpy()[w])[0]
    roll.append({"end": str(pd.Timestamp(ud[i - 1]).date()), "same_bar": round(c0, 3), "rate_leads_1h": round(c1, 3)})
res["regimes_main"] = {"series": main, "release_vs_other_and_vol": rs, "rolling_20d_1h": roll}
(OUT / "results.json").write_text(json.dumps(res, indent=1, default=str))

# ── report ──────────────────────────────────────────────────────────────────────────────────────────────────────────
fmt = lambda v: "n/a" if v is None or (isinstance(v, float) and not np.isfinite(v)) else f"{v:+.3f}"
md = [f"# US–EU rate differential vs Nasdaq — {A.period} ({PER[0]} → {PER[1]}){' — MIDPOINT' if A.mid else ''}", "",
      "Lag k > 0 = the rate series moved k bars BEFORE Nasdaq; k < 0 = Nasdaq first; 0 = same bar. ★ = |corr| beyond "
      "the scrambled-day 95% band at that lag. Rates in rate terms (+ = higher US-minus-EU rates priced).", "",
      "## Data diagnostics", "", f"Sources: {res['source']}. Nasdaq bars present: {res['diagnostics']['nasdaq_bars_present']:.0%} of the grid.", "",
      "| series | bars present | zero-change share | bars with Nasdaq |", "|---|---|---|---|"]
for n in SERIES:
    d = res["diagnostics"][n]
    md.append(f"| {n} | {d['share_present']:.0%} | {d['share_zero_change']:.0%} | {d['joint_with_nq']:,} |")
for name in SERIES:
    if name.endswith("_fresh") and "Dec26" not in name:
        continue
    r = res["series"][name]
    md += ["", f"## {name}", "", "| timeframe | " + " | ".join(f"k={k}" for k in LAGS if abs(k) <= 4 or k in (-8, 8)) + " | Granger rate→price p | price→rate p | BIC lags | min detectable |",
           "|---|" + "---|" * (len([k for k in LAGS if abs(k) <= 4 or k in (-8, 8)]) + 4)]
    dcg = r["daily"]["correlogram"]
    daily_line = "Daily (k = −3 … +3 days): " + ", ".join(
        f"{k}:{fmt(dcg[str(k)]['corr'])}{'★' if np.isfinite(dcg[str(k)]['corr']) and abs(dcg[str(k)]['corr']) > dcg[str(k)]['null95'] else ''}" for k in range(-3, 4))
    for tf in list(TF):
        cg = r[tf]["correlogram"]
        ks = [k for k in LAGS if abs(k) <= 4 or k in (-8, 8)]
        cells = []
        for k in ks:
            c = cg.get(str(k))
            if c is None:
                cells.append("")
                continue
            star = "★" if np.isfinite(c["corr"]) and abs(c["corr"]) > c["null95"] else ""
            cells.append(f"{fmt(c['corr'])}{star}")
        g = r[tf]["granger"]
        gp = lambda key: f"{g[key]['p']:.3f}" if key in g else "n/a"
        md.append(f"| {tf} | " + " | ".join(cells + [""] * (len([k for k in LAGS if abs(k) <= 4 or k in (-8, 8)]) - len(cells))) +
                  f" | {gp('rate->price')} | {gp('price->rate')} | {g.get('lag_order_bic', 'n/a')} | {r[tf].get('mdc_80pct_power', 'n/a')} |")
    md.append("\n" + daily_line)
    for tf in ("15m", "1h"):
        vc = r[tf]["vol_correlogram"]
        md.append(f"\nVolatility (deseasonalised |Δ|) {tf}, k = -4..4: " + ", ".join(
            f"{k}:{fmt(vc[str(k)]['corr'])}{'★' if abs(vc[str(k)]['corr']) > vc[str(k)]['null95'] else ''}" for k in range(-4, 5)))
    md.append("\nBy session (15m; k = 0 / 1 / 2 / −1): " + "; ".join(f"{k.split(':')[1]} " + " / ".join(fmt(v) for v in d.values()) for k, d in r["regimes_15m"].items()))
rm = res["regimes_main"]
md += ["", f"## Regimes — {rm['series']} (15m; k = 0 / 1 / 2 / 4 / −1)", ""]
for k, d in rm["release_vs_other_and_vol"].items():
    md.append(f"- {k}: " + " / ".join(fmt(v) for v in d.values()))
md += ["", "Rolling 20-day windows (1h bars): same-bar / rate-leads-1h", "", " ".join(f"{w['end'][5:]}: {w['same_bar']:+.2f}/{w['rate_leads_1h']:+.2f}" for w in rm["rolling_20d_1h"])]
(OUT / "RESULTS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
print("\n".join(md).encode("ascii", "replace").decode())
