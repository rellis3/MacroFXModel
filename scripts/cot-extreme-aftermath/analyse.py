"""cot-extreme-aftermath: what did price do after the COT Extremes page flagged an extreme?

EXPLORATORY, NOT PRE-REGISTERED. Prior registered test on the same data family:
cot-positioning-factor (null, MD files/COT_POSITIONING_FACTOR_TEST.md). Design fixed in
this header before any outcome was computed:

Signal (matches /api/cot-extremes, BASIS='share', the page default)
  share = spec_net / open interest; pct = round(100 * #(prior 155 weeks < current) / 155).
  Extreme = pct >= 90 (crowded long, crowd dir +1) or pct <= 10 (crowded short, -1).
  Streak = consecutive reports at the same-side extreme, current one included.

Timing (no lookahead)
  Report dated Tuesday T is public Friday T+3 15:30 America/New_York. P0 = last M15 close
  at or before that instant. Reports caught in the 2018-19 and 2025 government shutdowns
  (released weeks late) are excluded outright.

Price: OANDA M15 closes committed in analysis/output/rates_residual/m15 (2018-01 ->
2026-10-07), cut at the lockbox (nothing after 2026-08-21 22:00 London is scored).
  USD index COT is scored against a synthetic DXY built from EUR, JPY, GBP, CAD, CHF
  (ICE weights, SEK's 4.2% dropped and the rest renormalised).

Horizons from P0: +1h, +4h, +1 trading day (counted in M15 bars, so weekends are skipped),
then +1, +4, +12 calendar weeks.

Outcome: signed log return x crowd direction (> 0 = price kept going the crowd's way,
"continuation"; < 0 = reversal), also in sigma units: return / (trailing 20-day daily
sigma from M15 closes before P0 x sqrt(horizon in days)).

Groups
  EXT      every extreme report, signed by crowd direction
  STREAK   EXT split by weeks-in-extreme: 1, 2-4, 5-11, 12+
  EXIT     first report after an extreme run ends, signed by the former crowd direction
  MOM      baseline: every report, signed by the trailing 12-week price return
  EXTxMOM  EXT split by whether crowd direction agrees with the 12-week trend
  FLOW     every report, +1h/+4h/+1d signed by the week's change in spec share (release
           reaction to the news in the report)

Stats: 95% CIs from a moving-block bootstrap over release weeks (all markets on a date
move together; block = max(4, horizon weeks)); 2000 reps, seed 20261022.
"""
import json, os, sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
OUT = os.path.join(ROOT, "analysis/output/cot-extreme-aftermath")
M15 = os.path.join(ROOT, "analysis/output/rates_residual/m15")
SEED = 20261022
NY, LDN = ZoneInfo("America/New_York"), ZoneInfo("Europe/London")
LOCKBOX_END = datetime(2026, 8, 21, 22, 0, tzinfo=LDN).astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
SHUTDOWNS = [("2018-12-18", "2019-02-26"), ("2025-09-30", "2025-12-23")]

PRICE = {"EUR": "EUR_USD", "GBP": "GBP_USD", "AUD": "AUD_USD", "JPY": "USD_JPY",
         "CAD": "USD_CAD", "CHF": "USD_CHF", "GOLD": "XAU_USD", "SILVER": "XAG_USD",
         "NQ": "NAS100_USD", "ES": "SPX500_USD", "TY": "USB10Y_USD", "USD": "DXY"}
LABEL = {"EUR": "EURUSD", "GBP": "GBPUSD", "AUD": "AUDUSD", "JPY": "USDJPY", "CAD": "USDCAD",
         "CHF": "USDCHF", "GOLD": "Gold", "SILVER": "Silver", "NQ": "Nasdaq", "ES": "S&P 500",
         "TY": "US 10Y note", "USD": "Dollar index (DXY)"}
# DXY = ... EURUSD^-0.576 USDJPY^0.136 GBPUSD^-0.119 USDCAD^0.091 USDSEK^0.042 USDCHF^0.036
DXY_W = {"EUR_USD": -0.576, "USD_JPY": 0.136, "GBP_USD": -0.119, "USD_CAD": 0.091, "USD_CHF": 0.036}

H_BARS = {"1h": 4, "4h": 16, "1d": 96}
H_WEEKS = {"1w": 1, "4w": 4, "12w": 12}
H_DAYS = {"1h": 1 / 24, "4h": 4 / 24, "1d": 1, "1w": 5, "4w": 20, "12w": 60}
HORIZONS = list(H_BARS) + list(H_WEEKS)


def load_prices():
    px = {}
    for f in set(PRICE.values()) | set(DXY_W):
        if f == "DXY":
            continue
        s = pd.read_parquet(os.path.join(M15, f + ".parquet"))["close"].astype(float)
        px[f] = s[s.index <= LOCKBOX_END].sort_index()
    legs = pd.concat({k: np.log(px[k]) for k in DXY_W}, axis=1, join="inner").dropna()
    wsum = sum(abs(w) for w in DXY_W.values())
    px["DXY"] = np.exp(sum(legs[k] * w for k, w in DXY_W.items()) / wsum)
    return px


def release_utc(report_date):
    t = pd.Timestamp(report_date).to_pydatetime() + timedelta(days=3)
    return datetime(t.year, t.month, t.day, 15, 30, tzinfo=NY).astimezone(ZoneInfo("UTC")).replace(tzinfo=None)


def cot_panel():
    df = pd.read_csv(os.path.join(OUT, "cot_weekly.csv"), parse_dates=["report_date"])
    df = df[df.oi > 0].sort_values(["sym", "report_date"]).copy()
    df["share"] = df.spec_net / df.oi
    # USD (legs): average USD-direction share across the six currency legs, ranked like the rest
    legs = df[df.sym.isin(["EUR", "GBP", "AUD", "JPY", "CAD", "CHF"])].pivot(index="report_date", columns="sym", values="share")
    usd_dir = pd.concat([-legs[c] if c in ("EUR", "GBP", "AUD") else legs[c] for c in legs], axis=1).mean(axis=1)
    comp = pd.DataFrame({"sym": "USDLEGS", "report_date": usd_dir.index, "share": usd_dir.values})
    df = pd.concat([df[["sym", "report_date", "share"]], comp], ignore_index=True).sort_values(["sym", "report_date"])

    out = []
    for sym, g in df.groupby("sym"):
        g = g.reset_index(drop=True)
        sh = g.share.values
        pct = np.full(len(g), np.nan)
        for i in range(len(g)):
            prior = sh[max(0, i - 155):i]
            if len(prior) >= 52:
                pct[i] = round(100 * (prior < sh[i]).sum() / len(prior))
        g["pct"] = pct
        g["dshare"] = g.share.diff()
        crowd = np.where(pct >= 90, 1, np.where(pct <= 10, -1, 0))
        g["crowd"] = crowd
        streak, prev_crowd = np.zeros(len(g), int), np.zeros(len(g), int)
        for i in range(len(g)):
            prev_crowd[i] = crowd[i - 1] if i else 0
            streak[i] = (streak[i - 1] + 1 if i and crowd[i] == crowd[i - 1] and crowd[i] != 0 else (1 if crowd[i] else 0))
        g["streak"], g["prev_crowd"] = streak, prev_crowd
        g["prev_streak"] = np.r_[0, streak[:-1]]
        out.append(g)
    p = pd.concat(out, ignore_index=True)
    bad = np.zeros(len(p), bool)
    for a, b in SHUTDOWNS:
        bad |= (p.report_date >= a) & (p.report_date <= b)
    p = p[~bad].copy()
    p["release"] = p.report_date.map(release_utc)
    return p


def price_at(s, t):
    """Last close at or before t (index position), or None."""
    i = s.index.searchsorted(t, side="right") - 1
    return i if i >= 0 else None


def outcomes(p, px):
    rows = []
    for _, r in p.iterrows():
        key = "DXY" if r.sym in ("USD", "USDLEGS") else PRICE.get(r.sym)
        if key is None:
            continue
        s = px[key]
        if r.release < s.index[0] + timedelta(days=30) or r.release > s.index[-1]:
            continue
        i0 = price_at(s, r.release)
        if i0 is None or (r.release - s.index[i0]) > timedelta(hours=6):
            continue  # no fresh price at release (holiday)
        v = s.values
        p0 = v[i0]
        # trailing 20-day sigma of daily (96-bar) log returns, strictly before P0
        lo = max(0, i0 - 96 * 20)
        daily = np.diff(np.log(v[lo:i0 + 1][::-96][::-1]))
        if len(daily) < 15:
            continue
        sig = daily.std(ddof=1)
        i12 = price_at(s, r.release - timedelta(weeks=12))
        mom = np.sign(np.log(p0 / v[i12])) if i12 is not None and i12 < i0 else 0
        rec = {"sym": r.sym, "report_date": r.report_date.date().isoformat(), "pct": r.pct,
               "crowd": r.crowd, "streak": r.streak, "prev_crowd": r.prev_crowd,
               "prev_streak": r.prev_streak, "dshare": r.dshare, "mom": mom, "sig": sig}
        for h, nb in H_BARS.items():
            j = i0 + nb
            rec["r_" + h] = np.log(v[j] / p0) if j < len(v) else np.nan
        for h, w in H_WEEKS.items():
            t1 = r.release + timedelta(weeks=w)
            j = price_at(s, t1) if t1 <= s.index[-1] else None
            rec["r_" + h] = np.log(v[j] / p0) if j is not None else np.nan
        # how price got here: the 12 weeks into the report
        rec["r_into12"] = np.log(p0 / v[i12]) if i12 is not None and i12 < i0 else np.nan
        rows.append(rec)
    return pd.DataFrame(rows)


def block_boot(df, col, sign_col, h, rng, reps=2000):
    """Mean signed sigma-return and hit rate with a moving-block bootstrap over release weeks."""
    d = df.dropna(subset=[col])
    d = d[d[sign_col] != 0]
    if len(d) < 10:
        return None
    x = (d[col] * d[sign_col]).values
    z = x / (d.sig.values * np.sqrt(H_DAYS[h]))
    dates = sorted(d.report_date.unique())
    pos = {dt: k for k, dt in enumerate(dates)}
    idx = np.array([pos[t] for t in d.report_date])
    by_date = [np.where(idx == k)[0] for k in range(len(dates))]
    L = max(4, H_WEEKS.get(h, 1))
    nb = int(np.ceil(len(dates) / L))
    mz, hr = [], []
    for _ in range(reps):
        starts = rng.integers(0, max(1, len(dates) - L + 1), nb)
        sel = np.concatenate([np.concatenate(by_date[s:s + L]) for s in starts])
        mz.append(z[sel].mean()); hr.append((x[sel] > 0).mean())
    return {"n": int(len(d)), "dates": len(dates), "mean_pct": float(x.mean() * 100),
            "mean_sigma": float(z.mean()), "ci_sigma": [float(np.percentile(mz, 2.5)), float(np.percentile(mz, 97.5))],
            "hit": float((x > 0).mean()), "ci_hit": [float(np.percentile(hr, 2.5)), float(np.percentile(hr, 97.5))]}


def episodes(o):
    """One row per extreme run: weeks, move while it lasted, and after it ended (crowd-signed)."""
    eps = []
    for sym, g in o.sort_values("report_date").groupby("sym"):
        g = g.reset_index(drop=True)
        i = 0
        while i < len(g):
            if g.crowd[i] == 0 or g.streak[i] != 1:
                i += 1; continue
            j = i
            while j + 1 < len(g) and g.crowd[j + 1] == g.crowd[i] and g.streak[j + 1] == g.streak[j] + 1:
                j += 1
            d = g.crowd[i]
            # move from first flagged release to the first release after the run ended
            end = j + 1 if j + 1 < len(g) else None
            during = None
            if end is not None:
                # cumulative = sum of weekly (release-to-release) returns over the run
                during = float(np.nansum(g.r_1w[i:end]) * d * 100)
            eps.append({"sym": sym, "start": g.report_date[i], "end": g.report_date[j], "weeks": int(j - i + 1),
                        "side": "long" if d > 0 else "short", "into12_pct": float(g.r_into12[i] * d * 100) if pd.notna(g.r_into12[i]) else None,
                        "during_pct": during, "after4w_pct": float(g.r_4w[end] * d * 100) if end is not None and pd.notna(g.r_4w[end]) else None,
                        "after12w_pct": float(g.r_12w[end] * d * 100) if end is not None and pd.notna(g.r_12w[end]) else None,
                        "open": end is None})
            i = j + 1
    return pd.DataFrame(eps)


PAGE_ROWS = [  # (page key, results cell, label shown on cot-extremes.html)
    ("base", "MOM all reports, signed by 12w price trend", "Baseline: any week, in the direction of the 12-week price trend"),
    ("all", "EXT all extremes, signed by crowd", "Any extreme (90th / 10th)"),
    ("s1", "STREAK 1 (fresh) weeks", "Week 1 of an extreme (fresh)"),
    ("s2", "STREAK 2-4 weeks", "Weeks 2-4"),
    ("s5", "STREAK 5-11 weeks", "Weeks 5-11"),
    ("s12", "STREAK 12+ weeks", "Week 12 or later"),
    ("exit", "EXIT extreme just ended (signed by old crowd)", "The week an extreme ends"),
    ("exit5", "EXIT after a 5+ week run", "The week a 5+ week extreme ends"),
    ("flow", "FLOW signed by this week's change in spec share", "Any week, in the direction specs added"),
    ("dxy", "DXY: ICE dollar-index COT extremes", "Dollar index (DXY) extremes"),
]


def write_page_data(res):
    """js/cotAftermathData.js: the compact numbers cot-extremes.html shows. Regenerated by this script."""
    def pack(v):
        return None if v is None else [v["n"], round(v["hit"] * 100), round(v["mean_sigma"], 2),
                                       round(v["ci_sigma"][0], 2), round(v["ci_sigma"][1], 2)]
    rows = [{"k": k, "label": lab, **{h: pack(res["cells"][c][h]) for h in HORIZONS}} for k, c, lab in PAGE_ROWS]
    per = {sym: {"n": v["n_ext"], **{h: pack(v[h]) for h in ("1w", "4w", "12w")}} for sym, v in res["per_market"].items()}
    eps = {k: {kk: (None if vv is None else (round(vv, 2) if isinstance(vv, float) else vv)) for kk, vv in v.items()}
           for k, v in res["episodes"]["by_length"].items()}
    data = {"id": "cot-extreme-aftermath", "status": "exploratory, not pre-registered", "window": res["window"],
            "horizons": HORIZONS, "rows": rows, "perMarket": per, "episodes": eps,
            "fields": "[n, % kept going the crowd's way, mean move in sigma, 95% CI low, high]"}
    with open(os.path.join(ROOT, "js/cotAftermathData.js"), "w") as f:
        f.write("// GENERATED by scripts/cot-extreme-aftermath/analyse.py -- do not edit by hand.\n"
                "// What price did after the COT Extremes page's 90th/10th flags, 2018-2026 (lockbox excluded).\n"
                "// Exploratory, not pre-registered: analysis/output/cot-extreme-aftermath/RESULTS.md\n"
                "window.COT_AFTERMATH = " + json.dumps(data, separators=(",", ":")) + ";\n")


def main():
    rng = np.random.default_rng(SEED)
    px = load_prices()
    p = cot_panel()
    o = outcomes(p, px)
    o.to_csv(os.path.join(OUT, "events.csv"), index=False)

    core = o[o.sym != "USDLEGS"]
    ext = core[core.crowd != 0].assign(dir=lambda d: d.crowd)
    res = {"seed": SEED, "label": "exploratory, not pre-registered", "window": [str(o.report_date.min()), str(o.report_date.max())],
           "markets": sorted(core.sym.unique()), "n_reports": int(len(core)), "cells": {}}

    def cell(name, df, sign_col):
        res["cells"][name] = {h: block_boot(df, "r_" + h, sign_col, h, rng) for h in HORIZONS}

    allr = core.assign(dir=core.mom)
    cell("MOM all reports, signed by 12w price trend", allr, "dir")
    cell("EXT all extremes, signed by crowd", ext, "dir")
    for lab, lo, hi in [("1 (fresh)", 1, 1), ("2-4", 2, 4), ("5-11", 5, 11), ("12+", 12, 999)]:
        cell(f"STREAK {lab} weeks", ext[(ext.streak >= lo) & (ext.streak <= hi)], "dir")
    cell("EXT crowd agrees with 12w trend", ext[ext.crowd == ext.mom], "dir")
    cell("EXT crowd against 12w trend", ext[ext.crowd == -ext.mom], "dir")
    cell("EXT crowded long", ext[ext.crowd > 0], "dir")
    cell("EXT crowded short", ext[ext.crowd < 0], "dir")
    ex = core[(core.prev_crowd != 0) & (core.crowd != core.prev_crowd)].assign(dir=lambda d: d.prev_crowd)
    cell("EXIT extreme just ended (signed by old crowd)", ex, "dir")
    cell("EXIT after a 5+ week run", ex[ex.prev_streak >= 5], "dir")
    fl = core.assign(dir=np.sign(core.dshare.fillna(0)))
    cell("FLOW signed by this week's change in spec share", fl, "dir")
    big = core.assign(adsh=core.dshare.abs())
    q = big.groupby("sym").adsh.transform(lambda s: s.rank(pct=True))
    cell("FLOW top-decile weekly change only", big[q >= 0.9].assign(dir=lambda d: np.sign(d.dshare)), "dir")
    usd = o[o.sym.isin(["USD"])]
    cell("DXY: ICE dollar-index COT extremes", usd[usd.crowd != 0].assign(dir=lambda d: d.crowd), "dir")
    ul = o[o.sym == "USDLEGS"]
    cell("DXY: USD composite of 6 currency legs, extremes", ul[ul.crowd != 0].assign(dir=lambda d: d.crowd), "dir")

    # per market, EXT at 1w/4w/12w (descriptive)
    res["per_market"] = {}
    for sym, g in ext.groupby("sym"):
        res["per_market"][sym] = {"label": LABEL.get(sym, sym), "n_ext": int(len(g)), **{h: block_boot(g, "r_" + h, "dir", h, rng, reps=1000) for h in ("1w", "4w", "12w")}}

    # is positioning a mirror of price? weekly change in share vs price change before / after
    mirror = {}
    for sym, g in core.sort_values("report_date").groupby("sym"):
        g = g.dropna(subset=["dshare", "r_1w"])
        prev_ret = g.r_1w.shift(1)  # the week that ended at this release ~ the week the change happened in
        mirror[sym] = {"corr_dshare_with_past_week": float(np.corrcoef(g.dshare[1:], prev_ret[1:])[0, 1]),
                       "corr_dshare_with_next_week": float(np.corrcoef(g.dshare, g.r_1w)[0, 1]),
                       "corr_pct_with_past_12w": float(g[["pct", "r_into12"]].dropna().corr().iloc[0, 1])}
    res["mirror"] = mirror

    ep = episodes(o[o.sym != "USDLEGS"])
    ep.to_csv(os.path.join(OUT, "episodes.csv"), index=False)
    done = ep[~ep.open]
    res["episodes"] = {"n": int(len(ep)), "by_length": {}}
    for lab, lo, hi in [("1", 1, 1), ("2-4", 2, 4), ("5-11", 5, 11), ("12+", 12, 999)]:
        e = done[(done.weeks >= lo) & (done.weeks <= hi)]
        res["episodes"]["by_length"][lab] = {
            "n": int(len(e)), "into12_median": float(e.into12_pct.median()) if len(e) else None,
            "during_median": float(e.during_pct.median()) if len(e) else None,
            "during_pos_share": float((e.during_pct > 0).mean()) if len(e) else None,
            "after4w_median": float(e.after4w_pct.median()) if e.after4w_pct.notna().any() else None,
            "after4w_pos_share": float((e.after4w_pct > 0).mean()) if e.after4w_pct.notna().any() else None,
            "after12w_median": float(e.after12w_pct.median()) if e.after12w_pct.notna().any() else None}
    res["episodes"]["long_runs"] = done[done.weeks >= 12].sort_values("start").assign(
        start=lambda d: d.start.astype(str), end=lambda d: d.end.astype(str)).to_dict("records")

    write_page_data(res)
    with open(os.path.join(OUT, "results.json"), "w") as f:
        json.dump(res, f, indent=1, default=lambda x: None if (isinstance(x, float) and np.isnan(x)) else str(x))
    print(json.dumps({k: {h: (None if v is None else (v["n"], round(v["mean_sigma"], 3), [round(c, 3) for c in v["ci_sigma"]], round(v["hit"], 3))) for h, v in c.items()} for k, c in res["cells"].items()}, indent=1))


if __name__ == "__main__":
    main()
