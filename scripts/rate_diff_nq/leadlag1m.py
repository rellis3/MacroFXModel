"""US-EU rate differential vs Nasdaq at 1-minute resolution (plans/RATE_DIFF_NQ_LEADLAG_PLAN.md, 1-min family).

IBKR 1-min MIDPOINT bars (analysis/output/stir_1m/): SOFR SR3Z6 / SR3H7, Euribor IZ6, ICE ESTR ER3U6, NQ futures (front
stitched M6 -> U6 -> Z6 by calendar roll; returns only within one contract).
  A. cross-correlograms of 1-min and 5-min changes, lags -15..+15 min, both directions, day-block intervals and a
     scrambled-day null band; Granger (BIC lags, HAC) both ways. Explore Apr-Jun 2026, confirm Jul-Oct 2026.
  B. release-window event study: for each major US/EU release (calendar_events.csv, UTC), cumulative moves from -10 to
     +30 min; which series completes half of its 30-min move first.

    python scripts/rate_diff_nq/leadlag1m.py
Lag convention: k > 0 = the rate series moved k minutes BEFORE Nasdaq.
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.api as sm
from statsmodels.tsa.api import VAR

D1 = Path("analysis/output/stir_1m")
OUT = Path("analysis/output/rate_diff_nq/one_minute")
OUT.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(20261009)
SPLIT = pd.Timestamp("2026-07-01")
NQ_ROLL = [("CME_NQM6", None, "2026-06-11"), ("CME_NQU6", "2026-06-11", "2026-09-10"), ("CME_NQZ6", "2026-09-10", None)]


def load(name):
    p = D1 / f"{name}.parquet"
    if not p.exists():
        return None
    d = pd.read_parquet(p)
    return pd.Series(d.close.to_numpy(float), index=pd.to_datetime(d.time).dt.tz_localize(None)).sort_index()


sofr_z, sofr_h, eur_z, estr = load("CME_SR3Z6"), load("CME_SR3H7"), load("ICEEU_IZ6"), load("ICEEU_ER3U6")
legs = {k: v for k, v in {"SR3Z6": sofr_z, "SR3H7": sofr_h, "IZ6": eur_z, "ER3U6": estr}.items() if v is not None}
start = max(s.index[0] for s in legs.values())
end = min(s.index[-1] for s in legs.values())
grid = pd.date_range(start.ceil("1min"), end, freq="1min")
grid = grid[grid.dayofweek < 5]


def dmin(s):
    """bp change in RATE terms per minute (100 - price), only between consecutive minutes that both exist."""
    r = (100 - s).reindex(grid)
    return (r.diff() * 100).where(r.notna() & r.shift(1).notna())


# NQ: % change per minute within one contract
dnq = pd.Series(np.nan, index=grid)
for name, a, b in NQ_ROLL:
    s = load(name)
    if s is None:
        continue
    lp = np.log(s.reindex(grid))
    r = (lp.diff() * 100).where(lp.notna() & lp.shift(1).notna())
    m = np.ones(len(grid), bool)
    if a:
        m &= grid >= pd.Timestamp(a)
    if b:
        m &= grid < pd.Timestamp(b)
    dnq[m] = r[m]

S = {}
if "SR3Z6" in legs and "IZ6" in legs:
    S["US-EU Dec26 (SR3Z6 - IZ6)"] = dmin(sofr_z) - dmin(eur_z)
if "SR3Z6" in legs and "ER3U6" in legs:
    S["US-EU vs ESTR (SR3Z6 - ER3U6)"] = dmin(sofr_z) - dmin(estr)
for k in ("SR3Z6", "SR3H7", "IZ6", "ER3U6"):
    if k in legs:
        S[f"leg {k}"] = dmin(legs[k])
def bond_yield_bp(roll):
    """1-min yield change in bp from 2-year bond futures (price -> yield: dy = -dlnP / D * 1e4, D = 1.9), contracts
    stitched by calendar roll, changes only within one contract. None if the files are not there."""
    out = pd.Series(np.nan, index=grid)
    got = False
    for name, a, b in roll:
        s = load(name)
        if s is None:
            continue
        got = True
        lp = np.log(s.reindex(grid))
        r = (-(lp.diff()) / 1.9 * 1e4).where(lp.notna() & lp.shift(1).notna())
        m = np.ones(len(grid), bool)
        if a:
            m &= grid >= pd.Timestamp(a)
        if b:
            m &= grid < pd.Timestamp(b)
        out[m] = r[m]
    return out if got else None


ROLL_2Y = "2026-08-28"
us2 = bond_yield_bp([("CBOT_ZTU6", None, ROLL_2Y), ("CBOT_ZTZ6", ROLL_2Y, None)])
_gbs = lambda tok: next((p.stem for p in sorted(D1.glob("EUREX_*GBS*.parquet")) if tok in p.stem), None)
de2 = bond_yield_bp([(n, a, b) for n, a, b in ((_gbs("202609"), None, ROLL_2Y), (_gbs("202612"), ROLL_2Y, None)) if n])
if us2 is not None:
    S["leg US 2y yield (ZT)"] = us2
if de2 is not None:
    S["leg DE 2y yield (Schatz)"] = de2
if us2 is not None and de2 is not None:
    S["2y spread (US - DE)"] = us2 - de2
day = grid.normalize()


def agg(s, k):
    if k == 1:
        return s
    g = np.arange(len(s)) // k
    v = pd.Series(s.to_numpy(), index=g)
    tot = v.groupby(level=0).sum(min_count=k)
    return pd.Series(tot.to_numpy(), index=grid[::k][:len(tot)])


def corr_ci(x, y, dy, reps=200):
    ok = np.isfinite(x) & np.isfinite(y)
    if ok.sum() < 100:
        return np.nan, (np.nan, np.nan), int(ok.sum())
    x, y, dy = x[ok], y[ok], dy[ok]
    u, inv = np.unique(dy, return_inverse=True)
    st = np.zeros((len(u), 6))
    for j, v in enumerate((np.ones_like(x), x, y, x * x, y * y, x * y)):
        np.add.at(st[:, j], inv, v)

    def c(s):
        n, sx, sy, sxx, syy, sxy = s
        return (sxy / n - sx * sy / n / n) / np.sqrt(max((sxx / n - (sx / n) ** 2) * (syy / n - (sy / n) ** 2), 1e-30))
    pt = c(st.sum(0))
    bs = [c(np.bincount(rng.integers(0, len(u), len(u)), minlength=len(u)) @ st) for _ in range(reps)]
    return float(pt), tuple(np.round(np.percentile(bs, [2.5, 97.5]), 4)), int(ok.sum())


def correlogram(x, y, lags, per_day, scr=60):
    X, Y = x.to_numpy(float), y.to_numpy(float)
    dy = x.index.normalize().to_numpy()
    out = {}
    for k in lags:
        xs = np.roll(X, k)
        if k > 0:
            xs[:k] = np.nan
        elif k < 0:
            xs[k:] = np.nan
        c, ci, n = corr_ci(xs, Y, dy)
        out[k] = {"corr": c, "ci": ci, "n": n}
    nd = len(np.unique(dy))
    null = {k: [] for k in lags}
    for _ in range(scr):
        Xs = np.roll(X, int(rng.integers(3, max(nd - 3, 4))) * per_day)
        for k in lags:
            xs = np.roll(Xs, k)
            ok = np.isfinite(xs) & np.isfinite(Y)
            null[k].append(np.corrcoef(xs[ok], Y[ok])[0, 1] if ok.sum() > 100 else np.nan)
    for k in lags:
        out[k]["null95"] = float(np.nanpercentile(np.abs(null[k]), 95))
    return out


def granger(x, y, maxlag=15):
    df = pd.DataFrame({"r": x, "p": y}).dropna()
    if len(df) < 500:
        return {"n": len(df)}
    try:
        p = max(1, int(VAR(df.to_numpy()).select_order(maxlag).selected_orders["bic"]))
    except Exception:
        p = 3
    res = {"n": int(len(df)), "lag_order_bic": p}
    for name, dep, oth in (("rate->price", "p", "r"), ("price->rate", "r", "p")):
        L = pd.concat({f"{c}{i}": df[c].shift(i) for c in (dep, oth) for i in range(1, p + 1)}, axis=1)
        Z = pd.concat([df[dep], L], axis=1).dropna()
        m = sm.OLS(Z[dep], sm.add_constant(Z.drop(columns=dep))).fit(cov_type="HAC", cov_kwds={"maxlags": p})
        R = [c for c in m.params.index if c.startswith(oth)]
        w = m.wald_test(" = 0, ".join(R) + " = 0", scalar=True)
        res[name] = {"F": round(float(w.statistic), 3), "p": round(float(w.pvalue), 4), "coef_sum": round(float(m.params[R].sum()), 5)}
    return res


res = {"range": [str(grid[0]), str(grid[-1])], "legs": list(legs), "nq_minutes": int(dnq.notna().sum()),
       "series_minutes": {k: int(v.notna().sum()) for k, v in S.items()},
       "zero_change_share": {k: round(float((v[v.notna()] == 0).mean()), 3) for k, v in S.items()}, "A": {}}
for name, s in S.items():
    r = {}
    for per, msk in (("explore Apr-Jun", grid < SPLIT), ("confirm Jul-Oct", grid >= SPLIT)):
        xs, ys = s.where(msk), dnq.where(msk)
        r[per] = {}
        for tf, k in (("1m", 1), ("5m", 5)):
            x, y = agg(xs, k), agg(ys, k)
            lags = range(-15, 16) if k == 1 else range(-6, 7)
            cg = correlogram(x, y, lags, 1440 // k)
            r[per][tf] = {"correlogram": {str(kk): v for kk, v in cg.items()}, "granger": granger(x, y, 15 if k == 1 else 6)}
    res["A"][name] = r
    print("A done", name, flush=True)

# ── B. release windows ──────────────────────────────────────────────────────────────────────────────────────────────
cal = pd.read_csv("calendar_events.csv", encoding="latin-1")
US = r"^(Inflation Rate Month-over-Month|Core Inflation Rate Month-over-Month|Headline Unemployment Rate|Fed Interest Rate Decision|PCE Price Index Month-over-Month|Retail Sales Month-over-Month|ISM Manufacturing PMI|GDP Growth Quarter-over-Quarter.*)$"
EU = r"^(ECB Interest Rate Decision|Inflation Rate Year-over-Year Flash Estimate)$"
ev = cal[((cal.ccy == "USD") & cal.event.str.match(US, na=False)) | ((cal.ccy == "EUR") & cal.event.str.match(EU, na=False))].copy()
ev["t"] = pd.to_datetime(ev.datetime_raw)
ev = ev[(ev.t >= grid[0] + pd.Timedelta(minutes=15)) & (ev.t <= grid[-1] - pd.Timedelta(minutes=35))]
ev = ev.sort_values("t").drop_duplicates("t")
main = "US-EU Dec26 (SR3Z6 - IZ6)" if "US-EU Dec26 (SR3Z6 - IZ6)" in S else next(iter(S))
rate_series = {"diff": S[main]}
if "leg SR3Z6" in S:
    rate_series["US leg"] = S["leg SR3Z6"]
rows = []
for _, e in ev.iterrows():
    w = pd.date_range(e.t - pd.Timedelta(minutes=10), e.t + pd.Timedelta(minutes=30), freq="1min")
    py = dnq.reindex(w)
    if py.notna().mean() < 0.8:
        continue
    cp = py.fillna(0).cumsum()
    rec = {"t": str(e.t), "event": e.event, "ccy": e.ccy, "nq_move_30m_pct": float(cp.iloc[-1] - cp.loc[e.t - pd.Timedelta(minutes=1)])}

    def t_half(c):
        """minutes after release when the cumulative move first reaches half of its +30 min value."""
        base = c.loc[e.t - pd.Timedelta(minutes=1)]
        tot = c.iloc[-1] - base
        if abs(tot) < 1e-9:
            return np.nan
        after = (c.loc[e.t:] - base) / tot
        hit = after[after >= 0.5]
        return float((hit.index[0] - e.t).total_seconds() / 60) if len(hit) else np.nan
    rec["nq_t_half"] = t_half(cp)
    for nm, rs in rate_series.items():
        x = rs.reindex(w)
        if x.notna().mean() < 0.5:
            rec[f"{nm}_t_half"] = np.nan
            continue
        cx = x.fillna(0).cumsum()
        rec[f"{nm}_move_30m_bp"] = float(cx.iloc[-1] - cx.loc[e.t - pd.Timedelta(minutes=1)])
        rec[f"{nm}_t_half"] = t_half(cx)
        rec[f"{nm}_pre10_bp"] = float(cx.loc[e.t - pd.Timedelta(minutes=1)] - cx.iloc[0])
    rec["nq_pre10_pct"] = float(cp.loc[e.t - pd.Timedelta(minutes=1)] - cp.iloc[0])
    rows.append(rec)
E = pd.DataFrame(rows)
E.to_csv(OUT / "release_windows.csv", index=False, float_format="%.4f")
B = {"events": int(len(E))}
for nm in rate_series:
    col = f"{nm}_t_half"
    if col not in E:
        continue
    d = (E[col] - E.nq_t_half).dropna()
    B[nm] = {"events_with_both": int(len(d)), "median_rate_minus_nq_min": float(d.median()) if len(d) else None,
             "rate_first": int((d < 0).sum()), "nq_first": int((d > 0).sum()), "same_minute": int((d == 0).sum()),
             "median_rate_t_half": float(E[col].median()), "median_nq_t_half": float(E.nq_t_half.median()),
             "same_direction_share": float((np.sign(E.get(f"{nm}_move_30m_bp")) == np.sign(E.nq_move_30m_pct)).mean())}
res["B"] = B
(OUT / "results.json").write_text(json.dumps(res, indent=1, default=str))

fmt = lambda v: "n/a" if v is None or not np.isfinite(v) else f"{v:+.3f}"
md = ["# US–EU rate differential vs Nasdaq — 1-minute (IBKR MIDPOINT)", "",
      f"Range {res['range'][0]} → {res['range'][1]}. k > 0 = rate moved k minutes before Nasdaq. ★ = beyond the scrambled-day "
      "95% band. Explore Apr–Jun, confirm Jul–Oct.", "",
      "Minutes with data: " + ", ".join(f"{k} {v:,}" for k, v in res["series_minutes"].items()) + f"; NQ {res['nq_minutes']:,}.",
      "Zero-change share: " + ", ".join(f"{k} {v:.0%}" for k, v in res["zero_change_share"].items()), ""]
for name, r in res["A"].items():
    md += [f"## {name}", ""]
    for per in r:
        for tf in r[per]:
            cg, g = r[per][tf]["correlogram"], r[per][tf]["granger"]
            ks = [-10, -5, -3, -2, -1, 0, 1, 2, 3, 5, 10] if tf == "1m" else [-6, -3, -2, -1, 0, 1, 2, 3, 6]
            cells = " ".join(f"{k}:{fmt(cg[str(k)]['corr'])}{'★' if np.isfinite(cg[str(k)]['corr']) and abs(cg[str(k)]['corr']) > cg[str(k)]['null95'] else ''}" for k in ks)
            gp = lambda key: f"{g[key]['p']:.3f}" if key in g else "n/a"
            md.append(f"- **{per}, {tf}**: {cells} | Granger rate→NQ p {gp('rate->price')}, NQ→rate p {gp('price->rate')} (BIC lags {g.get('lag_order_bic', 'n/a')})")
    md.append("")
md += ["## Release windows (−10 … +30 min)", "", f"{B['events']} releases with NQ data."]
for nm in rate_series:
    if nm in B:
        b = B[nm]
        md.append(f"- **{nm}**: half of the 30-min move reached first by the RATE in {b['rate_first']} events, by NQ in {b['nq_first']}, "
                  f"same minute {b['same_minute']} (median rate − NQ {b['median_rate_minus_nq_min']} min; median t½ rate "
                  f"{b['median_rate_t_half']} vs NQ {b['median_nq_t_half']} min); same 30-min direction {b['same_direction_share']:.0%}")
(OUT / "RESULTS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
print("\n".join(md).encode("ascii", "replace").decode())
