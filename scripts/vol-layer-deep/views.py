"""Vol-Layer deep dive, layer 4 'Conditional views': stage 2 build and look (nothing scored as a trade, no verdicts).

C.OG: "the way to really develop this is by having conditional views and then other layers supporting it."
A view = a direction with a strength, frozen before the London open of each session. Here we build five simple,
point-in-time views per instrument and LOOK at them:

  mom1, mom3, mom12   own time-series momentum: log(open_t / open_{t-k}) / (sigma_t * sqrt(k)), k = 21, 63, 252 sessions
  carry               3-month rate of the base currency minus the quote currency (% a year), FX pairs only
                      (rates from features/rate3m_*.parquet, first print, known before the open; USD = EFFR after 2013-06)
  surprise            macro-surprise momentum: decayed (half-life 91 d, 365 d window) sum of release surprises,
                      base minus quote; indices +US, gold -US (declared before looking)
  combo               equal-weight mean of the signs of mom3, mom12, carry, surprise (whatever exists for the instrument)

Outcomes (all in daily sigma, sigma = live_sig_used, the HAR forecast known at the open):
  next-day  = signed open-to-close of the session (r_ocs / sigma)
  horizons  = log(open_{t+h} / open_t) / (sigma * sqrt(h)), h = 1, 2, 5, 10, 20 sessions
  races     = from the open, which of open +/- k sigma (k = 0.25, 0.5, 1.0) is touched first before 21:00 London (M1 mid)

Benchmarks: circular-shift placebo (the whole view series moved by a random 1-4 year offset, same offset for every
instrument, so the view keeps its persistence and cross-instrument correlation but loses its timing), always-long,
50%, and the drifted random-walk first-passage theory.

DISCOVERY WINDOW ONLY: sessions 2016-10-24 .. 2022-12-30 (inputs may use earlier prices; no outcome after 2022-12-30).

    python -X utf8 scripts/vol-layer-deep/views.py   -> backtest-data/vol-layer/views-look.json
                                                       analysis/output/vol-layer-deep/views/{rows.parquet, summary.json}
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "scripts/forecast_history")]
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from scipy.stats import spearmanr, skew  # noqa: E402

import line_reaction as LR  # noqa: E402

spec = importlib.util.spec_from_file_location("ffs", ROOT / "scripts/fx-factor-stack/run.py")
FFS = importlib.util.module_from_spec(spec)
spec.loader.exec_module(FFS)

SEED = 20261111
START, END = "2016-10-24", "2022-12-30"
HIST = ROOT / "analysis/output/forecast_history"
BA = ROOT / "data/m1_bidask"
FEAT = ROOT / "features"
OUTD = ROOT / "analysis/output/vol-layer-deep/views"
OUTJ = ROOT / "backtest-data/vol-layer/views-look.json"
INST = {  # symbol: (m1 key, base ccy, quote ccy)
    "EURUSD": ("eurusd", "EUR", "USD"), "GBPUSD": ("gbpusd", "GBP", "USD"), "AUDUSD": ("audusd", "AUD", "USD"),
    "NZDUSD": ("nzdusd", "NZD", "USD"), "USDJPY": ("usdjpy", "USD", "JPY"), "USDCAD": ("usdcad", "USD", "CAD"),
    "USDCHF": ("usdchf", "USD", "CHF"), "GOLD": ("gold", None, "USD"), "NQ": ("nq", "USD+", None),
    "SPX500": ("spx", "USD+", None),
}
SURP = {"US": "USD", "EU": "EUR", "GB": "GBP", "JP": "JPY", "AU": "AUD", "NZ": "NZD", "CA": "CAD", "CH": "CHF"}
KS = [0.25, 0.5, 1.0]
HZ = [1, 2, 5, 10, 20]
CLOSE = 21 * 60
VIEWS = ["mom1", "mom3", "mom12", "carry", "surprise", "combo"]
N_PLACEBO = 200
INTRO = [
 "No view's next-session drift stands out from its own shifted-view placebo. The best, carry and the equal-weight combo, earn about +0.016 sigma a session (annual Sharpe about 0.25). Simply being long all ten instruments earned +0.016 too.",
 "Power is the real limit. Over 6.2 years and 10 instruments, the smallest drift we could detect is 0.03-0.04 sigma a session (Sharpe 0.45-0.6). That is the size of the published premia, so this window can neither confirm nor rule them out.",
 "Drift builds with horizon, as the monthly papers would predict: the combo reaches +0.08 per sqrt-session at 20 sessions and mom12 reaches +0.05. Every horizon still sits under the combo placebo's 95th percentile (0.15 at 20 sessions).",
 "Vol state barely moves the hit rate. The combo hits 52.9% in low sigma, 51.2% in mid and 51.7% in high, all within about +/-1.6pp of 50%. Carry did not crash in high vol in 2016-22 (skew +0.04, against -0.17 in low vol); rates were near zero and differentials small.",
 "The level races match the theory. A Sharpe-0.25 view should move P(its line first) by 0.2-0.8pp. The measured shifts run from -1.0 to +1.1pp, with intervals of about +/-1pp, and all sit inside the placebo.",
 "The views are mostly independent: sign correlations across families run from -0.15 to +0.21. That makes an equal-weight combo the natural form, but it did not beat carry alone here.",
 "For now a view is a tilt (which side, how big), not a trigger. At 1 sigma lines a Sharpe-0.25 view is worth about 0.016 sigma per race, against roughly 0.04 sigma for one spread."
]  # written after reading the numbers
R = lambda x, k=4: None if x is None or not np.isfinite(x) else round(float(x), k)  # noqa: E731


# ------------------------------------------------------------------ inputs
def load_hist(sym):
    d = pd.read_csv(HIST / f"{sym}.csv", usecols=["date", "open", "live_sig_used", "r_ocs"])
    d = d[d.date <= END].drop_duplicates("date", keep="last").sort_values("date").reset_index(drop=True)
    assert d.date.max() <= END
    d["sig"] = d.live_sig_used / 100.0
    lo = np.log(d.open.to_numpy())
    for k, nm in ((21, "mom1"), (63, "mom3"), (252, "mom12")):
        past = np.full(len(d), np.nan)
        past[k:] = lo[k:] - lo[:-k]
        d[nm] = past / (d.sig * np.sqrt(k))
    d["z1"] = (d.r_ocs / 100.0) / d.sig
    for h in HZ:
        fut = np.full(len(d), np.nan)
        fut[:-h] = lo[h:] - lo[:-h]
        d[f"f{h}"] = fut / (d.sig * np.sqrt(h))
    # vol state: rank of today's sigma among the previous 250 sessions (point-in-time)
    s = d.sig.to_numpy()
    pr = np.full(len(d), np.nan)
    for i in range(120, len(d)):
        w = s[max(0, i - 250):i]
        pr[i] = (w < s[i]).mean()
    d["sig_pct"] = pr
    d["vstate"] = pd.cut(d.sig_pct, [-0.01, 1 / 3, 2 / 3, 1.01], labels=["low", "mid", "high"]).astype(str)
    d["inst"] = sym
    return d


def rates_for(dates):
    idx = pd.DatetimeIndex(pd.to_datetime(dates)) - pd.Timedelta(days=1)   # known by 20:00 UTC the day before the session
    out = {}
    for c in ["EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF"]:
        out[c] = FFS.known_series(FFS.first_print(pd.read_parquet(FEAT / f"rate3m_{c.lower()}.parquet")), idx).to_numpy()
    out["USD"] = FFS.daily_known(pd.read_parquet(FEAT / "effr.parquet"), idx).to_numpy()
    return out


def surprises_for(dates):
    s = pd.read_parquet(FEAT / "surprises.parquet")
    s["asof"] = pd.to_datetime(s["asof"], utc=True).dt.tz_localize(None)
    s["v"] = pd.to_numeric(s["value"], errors="coerce")
    s = s[np.isfinite(s.v) & s.ccy.isin(SURP)]
    out = {c: np.full(len(dates), np.nan) for c in SURP.values()}
    starts = pd.DatetimeIndex(pd.to_datetime(dates)).tz_localize("Europe/London").tz_convert("UTC").tz_localize(None)
    by = {code: g.sort_values("asof") for code, g in s.groupby("ccy")}
    for code, g in by.items():
        a, v, ser = g["asof"].to_numpy(), g["v"].to_numpy(), g["series"].to_numpy()
        for k, t in enumerate(starts):
            t64 = np.datetime64(t)
            hi = np.searchsorted(a, t64, side="left")                       # strictly before the open
            lo = np.searchsorted(a, t64 - np.timedelta64(365, "D"), side="left")
            if hi <= lo:
                continue
            r91 = np.searchsorted(a, t64 - np.timedelta64(91, "D"), side="left")
            if len(set(ser[max(r91, lo):hi])) < 3:
                continue
            age = (t64 - a[lo:hi]) / np.timedelta64(1, "D")
            out[SURP[code]][k] = float((v[lo:hi] * 0.5 ** (age / 91.0)).sum())
    return out


def races(sym, d):
    key = INST[sym][0]
    lo_t, hi_t = pd.Timestamp(START) - pd.Timedelta(days=2), pd.Timestamp(END) + pd.Timedelta(days=1)
    df = pd.read_parquet(BA / f"{key}_m1.parquet", columns=["time", "high", "low"],
                         filters=[("time", ">=", lo_t), ("time", "<", hi_t)])
    idx = pd.DatetimeIndex(pd.to_datetime(df["time"], utc=True)).tz_convert("Europe/London").tz_localize(None)
    codes, uniq = pd.factorize(idx.normalize())
    df["date"] = np.asarray(uniq.strftime("%Y-%m-%d"))[codes]
    df["m"] = idx.hour * 60 + idx.minute
    df = df[(df.date >= START) & (df.date <= END) & (df.m < CLOSE)]
    assert df.date.max() <= END
    info = d.set_index("date")[["open", "sig"]]
    rows, paths = {}, {}
    for date, g in df.groupby("date", sort=True):
        if date not in info.index or len(g) < 600:
            continue
        o, s = info.loc[date, "open"], info.loc[date, "sig"]
        if not (np.isfinite(s) and s > 0):
            continue
        m = g.m.to_numpy()
        up = (np.log(g.high.to_numpy()) - np.log(o)) / s
        dn = (np.log(o) - np.log(g.low.to_numpy())) / s
        rec = {}
        for k in KS:
            iu, idn = np.flatnonzero(up >= k), np.flatnonzero(dn >= k)
            tu = m[iu[0]] if len(iu) else 99999
            td = m[idn[0]] if len(idn) else 99999
            rec[k] = np.nan if tu == td else (1.0 if tu < td else 0.0)   # same-minute ties and no-touch -> NaN
        rows[date] = rec
        mid = (up - dn) / 2.0                                              # mid path in sigma from the open
        paths[date] = (m, mid, up, dn)
    return rows, paths


# ------------------------------------------------------------------ build
def build():
    parts, allpaths = [], {}
    for sym, (key, base, quote) in INST.items():
        d = load_hist(sym)
        dates = d.date.tolist()
        if base and base != "USD+" and quote:
            rt = rates_for(dates)
            d["carry"] = rt[base] - rt[quote]
        else:
            d["carry"] = np.nan
        su = surprises_for(dates)
        us = su["USD"]
        if base == "USD+":
            d["surprise"] = us
        elif base is None:
            d["surprise"] = -us
        else:
            b = np.nan_to_num(su[base]) if base != "USD" else us
            q = np.nan_to_num(su[quote]) if quote != "USD" else us
            d["surprise"] = np.where(np.isfinite(us), b - q, np.nan)
        sg = np.column_stack([np.sign(d[v]) for v in ["mom3", "mom12", "carry", "surprise"]])
        cnt = np.isfinite(sg).sum(1)
        d["combo"] = np.where(cnt >= 2, np.nansum(sg, 1) / np.maximum(cnt, 1), np.nan)
        d = d[(d.date >= START) & (d.date <= END)].copy()
        rc, paths = races(sym, d)
        for k in KS:
            d[f"up{k}"] = d.date.map(lambda x: rc.get(x, {}).get(k, np.nan))
        allpaths[sym] = paths
        parts.append(d)
        print(sym, len(d), "races", len(rc), flush=True)
    D = pd.concat(parts, ignore_index=True)
    assert D.date.max() <= END and D.date.min() >= START
    return D, allpaths


# ------------------------------------------------------------------ look helpers
def signed(D, view, out):
    x = np.sign(D[view].to_numpy()) * D[out].to_numpy()
    ok = np.isfinite(x) & (D[view].to_numpy() != 0)
    return D.date.to_numpy()[ok], x[ok]


def boot_mean(bs, dates, x):
    return bs.mean(dates, x)[0]


def shift_view(D, view, off):
    out = np.full(len(D), np.nan)
    for sym, g in D.groupby("inst", sort=False):
        v = g[view].to_numpy()
        out[g.index.to_numpy()] = np.roll(v, off)
    return out


def placebo(D, view, outcome, rng, n=N_PLACEBO, stat="mean"):
    nd = D.groupby("inst").size().min()
    vals = []
    for _ in range(n):
        off = int(rng.integers(250, min(1000, nd - 250)))
        v = shift_view(D, view, off)
        y = D[outcome].to_numpy()
        ok = np.isfinite(v) & np.isfinite(y) & (v != 0)
        if stat == "mean":
            vals.append(float(np.mean(np.sign(v[ok]) * y[ok])))
        else:  # race: P(view side first)
            vals.append(float(np.mean(np.where(v[ok] > 0, y[ok], 1 - y[ok]))))
    return np.array(vals)


def theory_p(mu, k):
    """Drifted Brownian motion, unit daily sigma, barriers +/-k: P(upper first) = 1 / (1 + exp(-2 k mu))."""
    return 1.0 / (1.0 + np.exp(-2.0 * k * mu))


# ------------------------------------------------------------------ look
def look(D, paths):
    rng = np.random.default_rng(SEED)
    bs = LR.Boot(D.date)
    charts, S = [], {}
    yrs = sorted(D.date.str[:4].unique())

    # 1. headline: next-day signed return per view vs placebo band and always-long
    rows = []
    for v in VIEWS:
        dt, x = signed(D, v, "z1")
        m = boot_mean(bs, dt, x)
        pl = placebo(D, v, "z1", rng)
        S[v] = {"n": int(len(x)), "z1": m, "sharpe": R(np.mean(x) / np.std(x) * np.sqrt(252), 3),
                "placebo_p05": R(np.percentile(pl, 5)), "placebo_p95": R(np.percentile(pl, 95)), "placebo_mean": R(pl.mean())}
        rows.append({"label": f"{v} (n {len(x):,})", "value": m[0], "lo": m[1], "hi": m[2]})
        rows.append({"label": f"{v} placebo 90% band", "value": R(pl.mean()), "lo": R(np.percentile(pl, 5)), "hi": R(np.percentile(pl, 95))})
    al = boot_mean(bs, D.date.to_numpy()[np.isfinite(D.z1)], D.z1.to_numpy()[np.isfinite(D.z1)])
    S["always_long_z1"] = al
    rows.append({"label": "always long (base drift)", "value": al[0], "lo": al[1], "hi": al[2]})
    charts.append({"type": "bars", "title": "Next-session return in the view's direction, by view", "unit": "daily sigma", "ref": 0,
                   "note": "Mean of sign(view) x open-to-close return, all 10 instruments pooled, 95% date-block bootstrap interval. "
                           "Benchmark: the grey-label rows, the same view shifted by a random 1-4 years (200 draws, 5th-95th pct), "
                           "and always-long. A Sharpe-0.5 view would sit at +0.03 sigma.",
                   "rows": rows})

    # 2. horizon sweep
    ser = []
    for v in ["mom12", "carry", "combo"]:
        pts = []
        for h in HZ:
            dt, x = signed(D, v, f"f{h}")
            pts.append([h, R(np.mean(x))])
        ser.append({"name": v, "points": pts})
    ser.append({"name": "combo placebo 95th pct", "points": [[h, R(np.percentile(placebo(D, "combo", f"f{h}", rng, n=100), 95))] for h in HZ]})
    S["horizon"] = {s["name"]: s["points"] for s in ser}
    charts.append({"type": "lines", "title": "Horizon sweep: view-signed return per sqrt(day)", "unit": "sigma x sqrt(h)", "xlabel": "horizon (sessions, open to open)",
                   "note": "Return over h sessions in the view's direction, divided by sigma x sqrt(h), so a constant drift per day would rise as sqrt(h). "
                           "Benchmark: the combo's shifted-view placebo 95th percentile at each horizon (100 draws; it sits above 0 because views and drift persist). "
                           "Overlapping windows: points at h>1 are not independent.",
                   "series": ser})

    # 3. year by year
    ser = []
    for v in ["mom3", "mom12", "carry", "combo"]:
        pts = []
        for y in yrs:
            sub = D[D.date.str[:4] == y]
            dt, x = signed(sub, v, "f5")
            pts.append([int(y), R(np.mean(x)) if len(x) > 50 else None])
        ser.append({"name": v, "points": [p for p in pts if p[1] is not None]})
    S["by_year_f5"] = {s["name"]: s["points"] for s in ser}
    charts.append({"type": "lines", "title": "Year by year: next-week return in the view's direction", "unit": "sigma x sqrt(5)", "xlabel": "year",
                   "note": "Each point pools the 10 instruments for one year (2016 = 24 Oct to 30 Dec only). Benchmark: 0. "
                           "A stable view keeps one sign across years; look for sign flips. One year holds about 50 independent weeks.",
                   "series": ser})

    # 4. per instrument (next week), three views
    rws = []
    for sym in INST:
        sub = D[D.inst == sym]
        vals = []
        for v in ["mom12", "carry", "surprise"]:
            dt, x = signed(sub, v, "f5")
            vals.append(R(np.mean(x)) if len(x) > 100 else 0)
        rws.append({"label": sym, "values": vals})
    S["per_inst_f5"] = rws
    charts.append({"type": "groups", "title": "Per instrument: next-week return in the view's direction", "names": ["mom12", "carry", "surprise"], "unit": "sigma x sqrt(5)",
                   "note": "Benchmark: 0, and the per-instrument noise: one instrument over 6 years has about 300 independent weeks, so the 95% band is about +/-0.11. "
                           "Carry is 0 (not defined) for gold and the indices.",
                   "rows": rws})

    # 5. IC per instrument with circular-shift placebo (Spearman, next week)
    rows = []
    ic_tab = {}
    for sym in INST:
        sub = D[D.inst == sym].reset_index(drop=True)
        v, y = sub.combo.to_numpy(), sub.f5.to_numpy()
        ok = np.isfinite(v) & np.isfinite(y)
        if ok.sum() < 200:
            continue
        ic = spearmanr(v[ok], y[ok]).statistic
        pl = []
        for _ in range(N_PLACEBO):
            off = int(rng.integers(250, len(sub) - 250))
            vv = np.roll(v, off)
            o2 = np.isfinite(vv) & np.isfinite(y)
            pl.append(spearmanr(vv[o2], y[o2]).statistic)
        pl = np.array(pl)
        ic_tab[sym] = [R(ic), R(np.percentile(pl, 5)), R(np.percentile(pl, 95))]
        rows.append({"label": sym, "value": R(ic), "lo": R(np.percentile(pl, 5)), "hi": R(np.percentile(pl, 95))})
    S["ic_combo_f5"] = ic_tab
    charts.append({"type": "bars", "title": "Combo view: rank IC with next-week return, per instrument", "unit": "Spearman IC", "ref": 0,
                   "note": "Bar = the instrument's IC. The whisker here is NOT a confidence interval: it is the 5th-95th percentile of the same IC "
                           "with the view shifted by a random 1-3 years (200 draws). A bar outside its whisker beats the placebo at 10% two-sided, one test of ten.",
                   "rows": rows})

    # 6. hit rate by vol state
    rws, vs_tab = [], {}
    for v in VIEWS:
        vals = []
        for st in ["low", "mid", "high"]:
            sub = D[D.vstate == st]
            dt, x = signed(sub, v, "z1")
            vals.append(R(100 * np.mean(x > 0), 2))
        vs_tab[v] = vals
        rws.append({"label": v, "values": vals})
    S["hit_by_vstate"] = vs_tab
    charts.append({"type": "groups", "title": "Hit rate (next session in the view's direction) by vol state", "names": ["low sigma", "mid sigma", "high sigma"], "unit": "%",
                   "note": "Vol state = today's sigma ranked against its own previous 250 sessions (terciles, point-in-time). "
                           "Benchmark: 50%; each cell holds about 5,000 instrument-days, about 2.5 independent instruments a day, so the 95% band is roughly +/-1.6pp.",
                   "rows": rws})

    # 7. signed return by vol state with CI (combo, carry, mom12), and skew of carry
    rows, vs2 = [], {}
    for v in ["combo", "carry", "mom12"]:
        for st in ["low", "mid", "high"]:
            sub = D[D.vstate == st]
            dt, x = signed(sub, v, "f5")
            m = boot_mean(bs, dt, x)
            vs2[f"{v}_{st}"] = m + [R(skew(x), 3)]
            rows.append({"label": f"{v} | {st} sigma (skew {skew(x):+.2f})", "value": m[0], "lo": m[1], "hi": m[2]})
    S["f5_by_vstate"] = vs2
    charts.append({"type": "bars", "title": "Next-week view-signed return by vol state (with skew)", "unit": "sigma x sqrt(5)", "ref": 0,
                   "note": "95% date-block bootstrap. The papers say carry crashes in high vol (negative skew); the skew of the view-signed weekly return is in each label. "
                           "Benchmark: 0, and the unconditional value of the same view in chart 2 at h=5.",
                   "rows": rows})

    # 8. theory: Sharpe -> P(up first)
    ser = []
    for k in KS:
        ser.append({"name": f"lines at +/-{k} sigma", "points": [[round(s, 2), R(100 * (theory_p(s / np.sqrt(252), k) - 0.5), 3)] for s in np.arange(0, 2.01, 0.1)]})
    charts.append({"type": "lines", "title": "Theory: how much a view's Sharpe moves P(its line first)", "unit": "pp above 50%", "xlabel": "annual Sharpe of the view",
                   "note": "Driftless random walk = 0 pp. With drift mu (sigma per day), barriers +/-k sigma: P = 1/(1+exp(-2 k mu)), mu = Sharpe/sqrt(252). "
                           "A Sharpe-0.5 view adds 0.8pp at 0.25 sigma lines and 1.6pp at 1 sigma lines. Derived, not measured.",
                   "series": ser})

    # 9. measured P(view side first) vs theory from the view's own drift, vs placebo
    rows, race_tab = [], {}
    for v in ["mom12", "carry", "combo"]:
        mu = S[v]["z1"][0]
        for k in KS:
            col = f"up{k}"
            vv, y = D[v].to_numpy(), D[col].to_numpy()
            ok = np.isfinite(vv) & np.isfinite(y) & (vv != 0)
            hit = np.where(vv[ok] > 0, y[ok], 1 - y[ok])
            m = bs.mean(D.date.to_numpy()[ok], hit)[0]
            pl = placebo(D, v, col, rng, n=100, stat="race")
            th = theory_p(mu, k)
            race_tab[f"{v}_{k}"] = {"measured": m, "theory": R(th), "placebo": [R(np.percentile(pl, 5)), R(np.percentile(pl, 95))], "n": int(ok.sum())}
            rows.append({"label": f"{v} +/-{k}s measured (n {ok.sum():,})", "value": R(100 * m[0], 2), "lo": R(100 * m[1], 2), "hi": R(100 * m[2], 2)})
            rows.append({"label": f"{v} +/-{k}s theory | placebo 90%", "value": R(100 * th, 2), "lo": R(100 * np.percentile(pl, 5), 2), "hi": R(100 * np.percentile(pl, 95), 2)})
    S["race"] = race_tab
    charts.append({"type": "bars", "title": "Measured: P(the line on the view's side is touched first)", "unit": "%", "ref": 50,
                   "note": "Lines at open +/- k sigma, first touch before 21:00 London on M1 mids; days with no touch or a same-minute tie dropped. "
                           "Measured rows: 95% bootstrap. 'theory | placebo' rows: the bar is the theory value from the view's own measured next-day drift; "
                           "the whisker is the 5th-95th pct of the shifted-view placebo. Benchmark: 50%.",
                   "rows": rows})

    # 10. correlation between views (signs, pooled)
    rows, cor = [], {}
    base = ["mom1", "mom3", "mom12", "carry", "surprise"]
    for i, a in enumerate(base):
        for b in base[i + 1:]:
            x, y = np.sign(D[a].to_numpy()), np.sign(D[b].to_numpy())
            ok = np.isfinite(x) & np.isfinite(y)
            c = float(np.corrcoef(x[ok], y[ok])[0, 1])
            cor[f"{a}~{b}"] = R(c, 3)
            rows.append({"label": f"{a} ~ {b}", "value": R(c, 3)})
    S["view_corr"] = cor
    charts.append({"type": "bars", "title": "How alike are the views? Correlation of their signs", "unit": "correlation", "ref": 0,
                   "note": "Pooled over instruments and days. Benchmark: 0 = independent views, where an equal-weight combo gains most. "
                           "mom1/mom3/mom12 overlap by construction (nested windows).",
                   "rows": rows})

    # 11. power: minimum detectable effect vs measured vs a Sharpe-0.5 view
    rows, mde = [], {}
    for v in VIEWS:
        lo, hi = S[v]["z1"][1], S[v]["z1"][2]
        se = (hi - lo) / (2 * 1.96)
        md = 2.8 * se
        mde[v] = {"se": R(se, 5), "mde_sigma": R(md, 4), "mde_sharpe": R(md * np.sqrt(252) / max(np.std(signed(D, v, 'z1')[1]), 1e-9), 3)}
        rows.append({"label": f"{v}: MDE (80% power, 5%)", "value": R(md, 4)})
        rows.append({"label": f"{v}: measured |mean|", "value": R(abs(S[v]["z1"][0]), 4)})
    rows.append({"label": "a Sharpe-0.5 view", "value": R(0.5 / np.sqrt(252), 4)})
    S["mde"] = mde
    charts.append({"type": "bars", "title": "Power: smallest next-session drift we could detect", "unit": "daily sigma", "ref": 0,
                   "note": "MDE = 2.8 x bootstrap standard error of the pooled view-signed return (6.2 years, 10 instruments, date-block bootstrap so "
                           "cross-instrument correlation is counted). Benchmark: the published-size view (Sharpe 0.5 = 0.032 sigma/day).",
                   "rows": rows})

    # 12. placebo histogram for the combo next week
    pl = placebo(D, "combo", "f5", rng, n=N_PLACEBO)
    dt, x = signed(D, "combo", "f5")
    act = float(np.mean(x))
    edges = np.linspace(min(pl.min(), act) - 0.005, max(pl.max(), act) + 0.005, 21)
    cnt, _ = np.histogram(pl, edges)
    S["combo_f5_actual"] = R(act)
    S["combo_f5_placebo_rank"] = R(float((pl < act).mean()), 3)
    charts.append({"type": "hist", "title": f"Combo, next week: actual {act:+.3f} against 200 shifted-view placebos", "unit": "sigma x sqrt(5)",
                   "note": f"Each placebo moves the whole combo series by a random 1-4 years. The actual value beats {100 * (pl < act).mean():.0f}% of them. "
                           "Benchmark: the placebo spread is what timing-free views of the same persistence produce.",
                   "bins": [[R(edges[i], 4), int(cnt[i])] for i in range(len(cnt))]})

    # 13. examples: strongest combo days on EURUSD/USDJPY/GOLD, path in sigma with +/-1 sigma lines
    ex = []
    pick = D[np.isfinite(D.combo) & (D.combo.abs() >= 0.99) & D.inst.isin(["EURUSD", "USDJPY", "AUDUSD", "GOLD"])]
    pick = pick.sample(n=min(6, len(pick)), random_state=SEED).sort_values("date")
    for _, r in pick.iterrows():
        m, mid, up, dn = paths[r.inst][r.date]
        side = "long" if r.combo > 0 else "short"
        sgn = 1 if side == "long" else -1
        keep = np.flatnonzero(np.isin(m, np.arange(0, CLOSE, 10)))
        path = [[int(m[i]), R(sgn * mid[i], 3)] for i in keep]
        res = r["up1.0"]
        rr = None if not np.isfinite(res) else (1.0 if (res == 1) == (sgn == 1) else -1.0)
        ex.append({"inst": r.inst, "date": r.date, "side": side, "r": rr if rr is not None else R(sgn * r.z1, 2), "unit": "R (1 sigma)",
                   "stop": -1.0, "target": 1.0, "path": path})
    charts.append({"type": "trades", "title": "Real days where all views agreed: race to +/-1 sigma in the view's direction", "unit": "sigma from the open, view-signed",
                   "note": "Six seeded random days where the combo was fully long or short. Path = mid price from the London open in sigma, flipped so up = the view's way. "
                           "Stop and target at 1 sigma. r = +1/-1 if a line was hit, else the signed close. Benchmark: a coin flip.",
                   "trades": ex})
    return charts, S


def main():
    OUTD.mkdir(parents=True, exist_ok=True)
    D, paths = build()
    D.to_parquet(OUTD / "rows.parquet", index=False)
    charts, S = look(D, paths)
    S["rows"] = int(len(D))
    S["coverage"] = {v: R(float(np.isfinite(D[v]).mean()), 3) for v in VIEWS}
    (OUTD / "summary.json").write_text(json.dumps(S, indent=1), encoding="utf-8")
    out = {"id": "views-look", "window": [START, END], "intro": INTRO, "charts": charts}
    OUTJ.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({k: S[k] for k in ["mde", "coverage"]}, indent=1))
    print("written", OUTJ, OUTJ.stat().st_size)


if __name__ == "__main__":
    main()
