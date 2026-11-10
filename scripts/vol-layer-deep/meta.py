"""Vol-Layer layer 5 (meta-labelling), stage 2: build and look. Nothing here is scored as a trade or given a verdict.

C.OG: "Have you ever looked into meta labelling?"  Meta-labelling needs a PRIMARY signal that picks the side; a second
model then says take / skip / how much. This script builds the simplest transparent primary from what the repo has and
looks at what a secondary model would be working with.

PRIMARY (frozen here, no tuning): the first touch of a sigma line, open +/- 0.5 sigma, in a London session.
  sigma  = live_sig_used (HAR daily sigma, known at the open) from analysis/output/forecast_history/<SYM>.csv
  open   = the session open in the same table; session = London calendar day, bars 00:00-22:00 London
  touch  = first M1 bar whose high (low) reaches the upper (lower) line; kept only if it happens 01:00-19:00 London
  entry  = the MID close of the touch bar (a market order once the bar closes; no intra-bar fill guess)
  sides  = FADE (trade back toward the open) and FOLLOW (trade through the line). Both are kept; they are mirrors.
  (The export's p50 line sits at a median ~0.6 sigma; a fixed 0.5 sigma line is used so no fitted width enters.)

LABELS (triple barrier, AFML ch.3): target +a sigma, stop -b sigma from entry, time limit H minutes (or 21:00 London).
  y = 1 if the target is touched first; 0 if the stop is touched first OR time runs out. A bar touching both = stop.

GEOMETRY benchmark: a driftless random walk with the same barriers and time limit. Variance in the window V = the
instrument's average 5-minute squared return / sigma^2 summed over the clock window (discovery-sample profile: this is
a benchmark, not a feature). P(target first by V) comes from the exact series for Brownian exit from a strip.

DISCOVERY WINDOW ONLY: sessions 2016-10-24 .. 2022-12-30 (asserted). 2023-01 .. 2026-08-20 is the unseen confirm
window; after 2026-08-21 is the lockbox.

    python -X utf8 scripts/vol-layer-deep/meta.py            # build if missing, then look
    python -X utf8 scripts/vol-layer-deep/meta.py --rebuild  # rebuild events from M1 (~10 min)
Writes analysis/output/vol-layer-deep/meta/events.parquet and backtest-data/vol-layer/meta-look.json
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "scripts/forecast_history")]
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from scipy.stats import norm  # noqa: E402
from sklearn.linear_model import LogisticRegression  # noqa: E402
from sklearn.metrics import roc_auc_score  # noqa: E402

import line_reaction as LR  # noqa: E402
from forecast_record import klass  # noqa: E402

OUT = ROOT / "analysis/output/vol-layer-deep/meta"
WEB = ROOT / "backtest-data/vol-layer"
HIST = ROOT / "analysis/output/forecast_history"
BA = ROOT / "data/m1_bidask"
BA_KEY = {"DE30": "dax", "SPX500": "spx", "DOW": "dow", "GOLD": "gold", "NQ": "nq", "UK100": "uk100", "US2000": "us2000"}
START, END = "2016-10-24", "2022-12-30"
SEED = 20261111
LINE = 0.5                                   # sigma from the open
T_LO, T_HI, CLOSE, SESSION = 60, 19 * 60, 21 * 60, 22 * 60
# (name, target a, stop b, time limit minutes or None = 21:00 London)
SHAPES = [("1:1 0.25σ, 2h", 0.25, 0.25, 120), ("1:1 0.25σ, to 21:00", 0.25, 0.25, None),
          ("1:1 0.5σ, 2h", 0.5, 0.5, 120), ("1:1 0.5σ, to 21:00", 0.5, 0.5, None),
          ("2:1 0.5/0.25σ, to 21:00", 0.5, 0.25, None), ("1:2 0.25/0.5σ, to 21:00", 0.25, 0.5, None)]
HEAD = 0                                     # headline shape index for the model looks
SIDES = ("fade", "follow")
FEATS = ["tod", "ext_opp", "spd15", "spd60", "rv_pre", "regime", "res1", "gap", "spread", "event", "mon", "fri"]
FEAT_NAME = {"tod": "time of day", "ext_opp": "went the other way first", "spd15": "move in last 15 min", "spd60": "move in last 60 min",
             "rv_pre": "vol so far vs last 20 days", "regime": "sigma vs its 1-year median", "res1": "yesterday's range vs sigma",
             "gap": "|gap| at the open", "spread": "spread at entry", "event": "event day", "mon": "Monday", "fri": "Friday"}


# ── build ──────────────────────────────────────────────────────────────────────────────────────────────────────────

def instruments():
    return [f.stem for f in sorted(HIST.glob("*.csv")) if (BA / f"{BA_KEY.get(f.stem, f.stem.lower())}_m1.parquet").exists()]


def day_table(sym):
    d = pd.read_csv(HIST / f"{sym}.csv", usecols=["date", "open", "live_sig_used", "r_hl", "gap", "event"]).sort_values("date")
    d["sig"] = d.live_sig_used / 100
    d["regime"] = np.log(d.live_sig_used / d.live_sig_used.shift(1).rolling(250, min_periods=120).median())
    d["res1"] = np.log(d.r_hl.clip(lower=1e-6) / d.live_sig_used).shift(1)
    d["gap"] = (d.gap / d.live_sig_used).abs()
    d["event"] = d.event.isin(["high", "NFP", "CPI", "FOMC"]).astype(float)
    return d.set_index("date")


def build_one(sym):
    D = day_table(sym)
    df = pd.read_parquet(BA / f"{BA_KEY.get(sym, sym.lower())}_m1.parquet", columns=["time", "high", "low", "close", "bid_c", "ask_c"])
    idx = pd.DatetimeIndex(pd.to_datetime(df["time"], utc=True)).tz_convert("Europe/London").tz_localize(None)
    codes, uniq = pd.factorize(idx.normalize())
    df["date"] = np.asarray(uniq.strftime("%Y-%m-%d"))[codes]
    df["m"] = idx.hour * 60 + idx.minute
    df = df[(df.date >= START) & (df.date <= END) & (df.m < SESSION)]
    assert df.date.max() <= END, "discovery window breached"
    rows, prof, nprof = [], np.zeros(SESSION // 5), 0
    rv_hist = []                                         # cumulative 1-min RV on a minute grid, previous sessions
    for date, g in df.groupby("date", sort=True):
        if date not in D.index:
            continue
        r = D.loc[date]
        s, o = float(r.sig), float(r.open)
        if not np.isfinite(s) or s <= 0 or not np.isfinite(o) or len(g) < 600:
            continue
        g = g.sort_values("m")
        m = g.m.to_numpy()
        hi, lo, c = np.log(g.high.to_numpy()), np.log(g.low.to_numpy()), np.log(g.close.to_numpy())
        sp = ((g.ask_c - g.bid_c) / g.close).to_numpy()
        lo_ = np.log(o)
        # minute-grid cumulative realised variance (for the point-in-time "vol so far" feature)
        r1 = np.r_[0.0, np.diff(c)] ** 2
        grid = np.zeros(SESSION + 1)
        np.add.at(grid, m + 1, r1)
        cum = np.cumsum(grid)
        # 5-minute profile (benchmark only) and the day's own 5-minute RV (random-walk-with-the-day's-vol benchmark)
        c5 = pd.Series(c, index=m // 5).groupby(level=0).last()
        r5 = c5.diff().dropna()
        prof[r5.index.to_numpy()] += (r5.to_numpy() / s) ** 2
        nprof += 1
        day5 = np.zeros(SESSION // 5 + 1)
        day5[r5.index.to_numpy() + 1] = (r5.to_numpy() / s) ** 2
        cum5 = np.cumsum(day5)
        ref = rv_hist[-20:]
        wd = pd.Timestamp(date).dayofweek
        for direction, sgn in (("up", 1), ("dn", -1)):
            lv = lo_ + sgn * LINE * s
            hit = np.flatnonzero(hi >= lv) if sgn > 0 else np.flatnonzero(lo <= lv)
            if not len(hit):
                continue
            i = int(hit[0])
            mi = int(m[i])
            if mi < T_LO or mi > T_HI:
                continue
            e = c[i]
            feat = {
                "tod": mi,
                "ext_opp": max(0.0, (lo_ - lo[:i + 1].min()) / s if sgn > 0 else (hi[:i + 1].max() - lo_) / s),
                "spd15": sgn * (e - c[max(0, np.searchsorted(m, mi - 15) - 1)]) / s if mi >= 15 else np.nan,
                "spd60": sgn * (e - c[max(0, np.searchsorted(m, mi - 60) - 1)]) / s,
                "rv_pre": np.log(cum[mi + 1] / np.median([h[mi + 1] for h in ref])) if len(ref) >= 10 and cum[mi + 1] > 0 and np.median([h[mi + 1] for h in ref]) > 0 else np.nan,
                "regime": r.regime, "res1": r.res1, "gap": r.gap, "spread": sp[i] / s, "event": r.event,
                "mon": float(wd == 0), "fri": float(wd == 4),
            }
            rec = {"inst": sym, "date": date, "dir": direction, "minute": mi, "sig": s, "entry": e, **feat}
            for k, (_, a, b, H) in enumerate(SHAPES):
                end_m = CLOSE if H is None else min(mi + H, CLOSE)
                j = int(np.searchsorted(m, end_m, side="right"))           # bars i+1 .. j-1 are inside the window
                hh, ll = hi[i + 1:j], lo[i + 1:j]
                up_r, dn_r = (hh - e) / s, (e - ll) / s
                fin = sgn * (c[j - 1] - e) / s if j - 1 > i else 0.0
                rec[f"end{k}"] = end_m
                rec[f"rvpost{k}"] = cum5[end_m // 5] - cum5[mi // 5]
                for side in SIDES:
                    # with-touch direction = sgn; follow trades with it, fade against it
                    sd = sgn if side == "follow" else -sgn
                    fav, adv = (up_r, dn_r) if sd > 0 else (dn_r, up_r)
                    tg, st = fav >= a, adv >= b
                    it = int(np.argmax(tg)) if tg.any() else 10 ** 9
                    is_ = int(np.argmax(st)) if st.any() else 10 ** 9
                    if is_ <= it and is_ < 10 ** 9:
                        y, t_ex, rr = 0, int(m[i + 1 + is_]), -b
                    elif it < 10 ** 9:
                        y, t_ex, rr = 1, int(m[i + 1 + it]), a
                    else:
                        y, t_ex, rr = 2, end_m, (fin if side == "follow" else -fin)
                    rec[f"y{k}_{side}"] = y
                    rec[f"t{k}_{side}"] = t_ex
                    rec[f"r{k}_{side}"] = rr
                    rec[f"both{k}_{side}"] = int(is_ == it and is_ < 10 ** 9)
            rows.append(rec)
        rv_hist.append(cum)
    E = pd.DataFrame(rows)
    return E, prof / max(nprof, 1)


def strip_exit(a, b, V, terms=300):
    """Driftless Brownian motion from 0, barriers +a (target) and -b (stop), variance V (sigma^2 units).
    Returns P(target first by V), P(stop first by V). Exact sine series for the strip (0, a+b)."""
    a, b, V = np.broadcast_arrays(np.asarray(a, float), np.asarray(b, float), np.asarray(V, float))
    w = a + b
    n = np.arange(1, terms + 1)[:, None]

    def up(x):
        ser = (2 * (-1.0) ** (n + 1) / (n * np.pi)) * np.sin(n * np.pi * x / w) * np.exp(-(n * np.pi) ** 2 * V / (2 * w ** 2))
        return np.clip(x / w - ser.sum(axis=0), 0, 1)
    return up(b.ravel()).reshape(a.shape), up(a.ravel()).reshape(a.shape)


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    parts, profs = [], {}
    for sym in instruments():
        t0 = time.time()
        E, prof = build_one(sym)
        profs[sym] = prof
        parts.append(E)
        print(f"{sym}: {len(E):,} touches ({time.time() - t0:.0f}s)", flush=True)
    E = pd.concat(parts, ignore_index=True)
    E["klass"] = E.inst.map(klass)
    for k, (_, a, b, H) in enumerate(SHAPES):
        V = np.empty(len(E))
        for sym, g in E.groupby("inst"):
            cp = np.r_[0.0, np.cumsum(profs[sym])]
            V[g.index] = cp[(g[f"end{k}"] // 5).to_numpy()] - cp[(g.minute // 5).to_numpy()]
        E[f"V{k}"] = V
        E[f"pg{k}"], E[f"pgs{k}"] = strip_exit(a, b, V)
    assert E.date.max() <= END
    E.to_parquet(OUT / "events.parquet", index=False)
    pd.DataFrame(profs).to_csv(OUT / "profile5.csv", index=False)
    return E


# ── look ───────────────────────────────────────────────────────────────────────────────────────────────────────────

def r4(x):
    return None if x is None or not np.isfinite(x) else round(float(x), 4)


def auc(y, p):
    ok = np.isfinite(p)
    y, p = np.asarray(y)[ok], np.asarray(p)[ok]
    return float(roc_auc_score(y, p)) if 0 < y.sum() < len(y) else np.nan


def date_blocks(dates, k=6):
    u = np.sort(pd.unique(dates))
    edges = np.array_split(np.arange(len(u)), k)
    pos = pd.Series(np.arange(len(u)), index=u)
    return u, edges, pos


def purged_cv(E, ycol, feats, k=6, embargo=5, C=1.0, sizes=None, rng=None, test_block=None):
    """Purged + embargoed k-fold by contiguous date blocks. Labels end the same session, so purging = dropping
    training sessions within `embargo` sessions of the test block on either side. Returns out-of-fold P(y=1)."""
    u, edges, pos = date_blocks(E.date.to_numpy(), k)
    di = pos[E.date].to_numpy()
    X = E[feats].to_numpy(float)
    y = E[ycol].to_numpy()
    oof = np.full(len(E), np.nan)
    blocks = range(k) if test_block is None else [test_block]
    curve = []
    for b in blocks:
        lo_, hi_ = edges[b][0], edges[b][-1]
        te = (di >= lo_) & (di <= hi_)
        tr = (di < lo_ - embargo) | (di > hi_ + embargo)
        mu, sd = np.nanmean(X[tr], axis=0), np.nanstd(X[tr], axis=0) + 1e-9
        Z = np.nan_to_num((X - mu) / sd)
        if sizes is None:
            m = LogisticRegression(C=C, max_iter=2000).fit(Z[tr], y[tr])
            oof[te] = m.predict_proba(Z[te])[:, 1]
        else:
            idx = np.flatnonzero(tr)
            for n in sizes:
                vals = []
                for rep in range(5):
                    sub = rng.choice(idx, size=min(n, len(idx)), replace=False)
                    m = LogisticRegression(C=C, max_iter=2000).fit(Z[sub], y[sub])
                    vals.append(auc(y[te], m.predict_proba(Z[te])[:, 1]))
                curve.append((n, float(np.mean(vals))))
    return curve if sizes is not None else oof


def design(E):
    X = pd.get_dummies(E.klass, prefix="k", dtype=float)
    E = pd.concat([E, X], axis=1)
    f = FEATS + list(X.columns[1:])
    return E, f


def trade_path(sym, date, minute, end_m, sgn_side, e, s):
    df = pd.read_parquet(BA / f"{BA_KEY.get(sym, sym.lower())}_m1.parquet", columns=["time", "close"],
                         filters=[("time", ">=", pd.Timestamp(date) - pd.Timedelta(hours=2)), ("time", "<=", pd.Timestamp(date) + pd.Timedelta(hours=24))])
    idx = pd.DatetimeIndex(pd.to_datetime(df["time"], utc=True)).tz_convert("Europe/London").tz_localize(None)
    keep = (idx.strftime("%Y-%m-%d") == date)
    mins = (idx.hour * 60 + idx.minute)[keep]
    c = np.log(df.close.to_numpy()[keep])
    sel = (mins >= minute) & (mins <= end_m)
    t, cc = np.asarray(mins[sel]), c[sel]
    step = max(1, len(t) // 60)
    return [[int(tt - minute), round(float(sgn_side * (x - e) / s), 3)] for tt, x in zip(t[::step], cc[::step])]


def look(E):
    rng = np.random.default_rng(SEED)
    assert E.date.max() <= END and E.date.min() >= START
    E = E.copy()
    E["year"] = E.date.str[:4]
    bs = LR.Boot(E.date)
    n_ev, n_days, n_inst = len(E), E.date.nunique(), E.inst.nunique()
    charts, nums = [], {}
    sh = [s[0] for s in SHAPES]

    # spread cost in R per shape (round trip = one spread, mid entry and mid exit both pay half)
    spread_med = float(E.spread.median())

    # 1 base rate vs geometry, by shape (fade); 1b real minus geometry with intervals and the break-even gap
    rows1, rows1b, rows2 = [], [], []
    for k, (nm, a, b, H) in enumerate(SHAPES):
        for side in SIDES:
            yk_ = E[f"y{k}_{side}"].to_numpy()
            y = (yk_ == 1).astype(float)
            ci = bs.mean(E.date, y)[0]
            pg_ = E[f"pg{k}"].to_numpy()
            dci = bs.mean(E.date, y - pg_)[0]
            res = yk_ < 2
            yr = (yk_[res] == 1).astype(float)
            cir = bs.mean(E.date[res], yr)[0]
            pres = float((E[f"pg{k}"] / (E[f"pg{k}"] + E[f"pgs{k}"])).mean())
            # break-even P(target): timeouts pay their mean R, one median spread per trade
            to = yk_ == 2
            p_to = float(to.mean())
            r_to = float(E.loc[to, f"r{k}_{side}"].mean()) if to.any() else 0.0
            be = (b * (1 - p_to) - p_to * r_to + spread_med) / (a + b)
            nums[f"{nm}|{side}"] = dict(rate=ci, geo=float(pg_.mean()), diff=dci, res=cir, geo_res=pres, timeout=p_to, r_timeout=r_to, be=be,
                                        both=float(E[f"both{k}_{side}"].mean()))
            if side == "fade":
                rows1.append({"label": nm, "values": [r4(ci[0]), r4(pg_.mean())]})
            rows1b.append({"label": f"{nm} {side} (break-even {100 * (be - pg_.mean()):+.1f}pp)", "value": r4(dci[0]), "lo": r4(dci[1]), "hi": r4(dci[2])})
            rows2.append({"label": f"{nm} {side}", "values": [r4(cir[0]), r4(pres)]})
    charts.append({"type": "groups", "title": "Fade the 0.5σ line: how often the target comes first, real vs a random walk", "names": ["Real (fade)", "Random walk, same barriers and clock"],
                   "unit": "share of touches", "note": "Target first = 1, stop or time-out = 0. The random walk uses each touch's own barriers, its own minutes left and the instrument's average variance by time of day. The barrier shape sets almost the whole number; read the gap between the two dots, not their height.",
                   "rows": rows1})
    charts.append({"type": "bars", "title": "Real minus random walk, every shape and side, with the gap a trade must clear", "unit": "share of touches (0 = random walk)", "ref": 0,
                   "note": "95% date-block intervals. In brackets: how far above the random walk the hit rate must sit just to pay the median spread and what time-outs returned. A filter has to find trades that clear that bracket, not trades above 0.",
                   "rows": rows1b})
    charts.append({"type": "groups", "title": "Only the touches that hit a barrier: real vs b/(a+b)", "names": ["Real", "Random walk"], "unit": "P(target | a barrier was hit)",
                   "note": "Without the time-outs a driftless walk gives about b/(a+b): 0.5 for 1:1, 0.33 for 2:1, 0.67 for 1:2 (time limits shift it a little). Fade and follow are mirrors, so their gaps have opposite signs. Fade above the random walk = touches tend to come back.",
                   "rows": rows2})

    # 3 geometry-only AUC on a random walk
    k0 = HEAD
    pg = E[f"pg{k0}"].to_numpy()
    pgs = E[f"pgs{k0}"].to_numpy()
    u = rng.random(len(E))
    y_rw = (u < pg).astype(int)                                  # random walk, forecast-scaled variance
    # random walk with the day's own realised variance in the window (vol clustering, no direction)
    pg_o, _ = strip_exit(SHAPES[k0][1], SHAPES[k0][2], E[f"rvpost{k0}"].clip(lower=1e-6).to_numpy())
    y_rwo = (rng.random(len(E)) < pg_o).astype(int)
    y_real = (E[f"y{k0}_fade"] == 1).astype(int).to_numpy()
    # pooled shapes: one row per (touch, shape), p = geometry, label drawn on a random walk
    pool_p = np.concatenate([E[f"pg{k}"].to_numpy() for k in range(len(SHAPES))])
    pool_y = (rng.random(len(pool_p)) < pool_p).astype(int)
    pool_real = np.concatenate([(E[f"y{k}_fade"] == 1).astype(int).to_numpy() for k in range(len(SHAPES))])
    a_pool_rw, a_pool_real = auc(pool_y, pool_p), auc(pool_real, pool_p)
    a_geo_rw, a_geo_real = auc(y_rw, pg), auc(y_real, pg)
    a_vol_rwo, a_vol_real = auc(y_rwo, E.rv_pre.to_numpy()), auc(y_real, E.rv_pre.to_numpy())
    a_tod_rw, a_tod_real = auc(y_rw, -E.tod.to_numpy()), auc(y_real, -E.tod.to_numpy())
    nums["auc_geo"] = dict(pool=[a_pool_rw, a_pool_real], geo=[a_geo_rw, a_geo_real], vol=[a_vol_rwo, a_vol_real], tod=[a_tod_rw, a_tod_real])
    charts.append({"type": "groups", "title": "AUC above 0.5 with no edge at all: what geometry alone gives", "names": ["Pure random walk", "Real fade trades"], "unit": "ROC AUC (0.5 = no sorting)",
                   "note": "Each score is ranked against the label it would face. On a random walk there is no direction to find, yet mixing barrier shapes, minutes left in the day, or the day's own vol all sort trades. A meta-model must beat these numbers, not 0.5. 'Vol so far' is scored against a random walk run at each day's actual vol.",
                   "rows": [{"label": "6 barrier shapes pooled, score = b/(a+b) with time", "values": [r4(a_pool_rw), r4(a_pool_real)]},
                            {"label": f"{sh[k0]}: score = geometry P (minutes left)", "values": [r4(a_geo_rw), r4(a_geo_real)]},
                            {"label": f"{sh[k0]}: score = earlier entry", "values": [r4(a_tod_rw), r4(a_tod_real)]},
                            {"label": f"{sh[k0]}: score = vol so far today", "values": [r4(a_vol_rwo), r4(a_vol_real)]}]})

    # 4 univariate AUC per feature: real vs the vol-matched random walk
    Ed, feats = design(E)
    rowsf = []
    for f in FEATS:
        x = Ed[f].to_numpy(float)
        ar, aw = auc(y_real, x), auc(y_rwo, x)
        rowsf.append({"label": FEAT_NAME[f], "values": [r4(ar), r4(aw)]})
    nums["feat_auc"] = rowsf
    charts.append({"type": "groups", "title": f"Each entry feature on its own ({sh[k0]}, fade)", "names": ["Real trades", "Random walk at the day's vol"], "unit": "ROC AUC",
                   "note": "Above 0.5: higher values go with the target. Where the real bar matches the random-walk bar, the feature is reading vol or time, not direction. Direction information would show as a real bar that differs from its random-walk twin.",
                   "rows": rowsf})

    # 5 feature spread across the three outcomes
    rows5 = []
    yk = E[f"y{k0}_fade"].to_numpy()
    for f in FEATS[:9]:
        x = Ed[f].to_numpy(float)
        z = (x - np.nanmean(x)) / (np.nanstd(x) + 1e-12)
        rows5.append({"label": FEAT_NAME[f], "values": [r4(np.nanmean(z[yk == 1]) - np.nanmean(z[yk == 0])), r4(np.nanmean(z[yk == 2]) - np.nanmean(z[yk == 0]))]})
    charts.append({"type": "groups", "title": f"How far apart the outcomes sit on each entry feature ({sh[k0]}, fade)", "names": ["Target first minus stop first", "Time ran out minus stop first"], "unit": "standard deviations",
                   "note": "Benchmark: 0 (a feature that knows nothing about the outcome). The target-vs-stop gap is all a filter could use to pick a side's winners; the time-out gap is mostly clock and vol (late, quiet touches run out of time).",
                   "rows": rows5})

    # 6 label overlap / concurrency (headline shape, fade)
    t0 = pd.to_datetime(E.date).values.astype("datetime64[D]").astype(np.int64) * 1440 + E.minute.to_numpy()
    t1 = t0 - E.minute.to_numpy() + E[f"t{k0}_fade"].to_numpy()
    t1 = np.maximum(t1, t0 + 1)
    lo_t = t0.min()
    span = int(t1.max() - lo_t + 2)
    cnt = np.zeros(span)
    np.add.at(cnt, t0 - lo_t, 1)
    np.add.at(cnt, t1 - lo_t, -1)
    conc = np.cumsum(cnt)
    inv = np.r_[0.0, np.cumsum(np.where(conc > 0, 1 / np.maximum(conc, 1), 0))]
    uniq = (inv[t1 - lo_t] - inv[t0 - lo_t]) / (t1 - t0)
    hist_u = np.histogram(uniq, bins=np.linspace(0, 1, 11))[0]
    y_h = y_real.astype(float)
    v_iid = y_h.var() / len(y_h)
    reps = bs.mean(E.date, y_h)[1]
    deff = float(np.var(reps) / v_iid)
    n_eff_u = float(uniq.sum())
    nums["overlap"] = dict(mean_uniq=float(uniq.mean()), n_eff_uniq=n_eff_u, deff=deff, n_eff_deff=len(E) / deff, max_conc=int(conc.max()))
    charts.append({"type": "hist", "title": f"Label overlap: average uniqueness of each trade ({sh[k0]})", "unit": "uniqueness (1 = no other trade open at the same time)",
                   "note": f"AFML ch.4: uniqueness = mean over the trade's life of 1/(trades open). Mean {uniq.mean():.2f}, so {len(E):,} trades carry about {n_eff_u:,.0f} trades' worth of separate time. The date-block bootstrap says the hit rate's variance is {deff:.1f}x the independent-coin figure, an effective {len(E) / deff:,.0f} trades. Benchmark: 1.0 for every trade if none overlapped.",
                   "bins": [[round(float(x), 2), int(c)] for x, c in zip(np.linspace(0, 1, 11)[:-1], hist_u)]})

    # 7 power: trades needed to see 50 -> 50+d
    pts = {nm: [] for nm in ("5% test", "Bonferroni over 100 trials")}
    for d_pp in (1, 2, 3, 4, 5, 6, 8, 10):
        p0, p1 = 0.5, 0.5 + d_pp / 100
        for nm, za in (("5% test", norm.ppf(0.975)), ("Bonferroni over 100 trials", norm.ppf(1 - 0.025 / 100))):
            n = ((za * np.sqrt(p0 * (1 - p0)) + norm.ppf(0.8) * np.sqrt(p1 * (1 - p1))) / (p1 - p0)) ** 2
            pts[nm].append([d_pp, round(float(n))])
    n53 = [p for p in pts["5% test"] if p[0] == 3][0][1]
    nums["power"] = dict(n53=n53, n53_bonf=[p for p in pts["Bonferroni over 100 trials"] if p[0] == 3][0][1])
    series = [{"name": k, "points": v} for k, v in pts.items()]
    series.append({"name": f"5% test x design effect {deff:.1f}", "points": [[p[0], round(p[1] * deff)] for p in pts["5% test"]]})
    charts.append({"type": "lines", "title": "Power: retained trades needed to see a 50% hit rate become 50% + d", "unit": "trades kept by the filter", "xlabel": "lift in percentage points",
                   "note": f"80% power. 50 to 53% needs {n53:,} independent kept trades at a single 5% test. Our trades are not independent: multiply by the design effect. A filter that keeps half of {len(E):,} touches keeps {len(E) // 2:,} raw, about {len(E) / 2 / deff:,.0f} effective.",
                   "series": series})

    # 8 learning curve, last block held out
    sizes = [250, 500, 1000, 2000, 5000, 10000, 20000, 40000]
    Ed["y_real"], Ed["y_rwo"] = y_real, y_rwo
    lc_real = purged_cv(Ed, "y_real", feats, sizes=sizes, rng=rng, test_block=5)
    lc_rw = purged_cv(Ed, "y_rwo", feats, sizes=sizes, rng=rng, test_block=5)
    charts.append({"type": "lines", "title": "Learning curve: logistic meta-model, last sixth of the window held out", "unit": "ROC AUC on the held-out block", "xlabel": "training trades",
                   "note": f"Purged by date with a 5-session embargo; 5 seeded subsamples per size. The random-walk line is the same model trained and scored on random-walk labels at each day's vol: what geometry and vol alone are worth. Real above random-walk = direction information. ({sh[k0]}, fade)",
                   "series": [{"name": "Real labels", "points": [[n, r4(a)] for n, a in lc_real]}, {"name": "Random walk at the day's vol", "points": [[n, r4(a)] for n, a in lc_rw]}]})

    # 9 calibration of purged-CV logistic (looked at, not scored)
    oof = purged_cv(Ed, "y_real", feats)
    oof_rw = purged_cv(Ed, "y_rwo", feats)
    Ed["oof"] = oof
    q = pd.qcut(oof, 10, labels=False, duplicates="drop")
    cal = pd.DataFrame({"q": q, "p": oof, "y": y_real, "g": pg}).groupby("q").agg(p=("p", "mean"), y=("y", "mean"), g=("g", "mean"))
    qg = pd.qcut(pg, 10, labels=False, duplicates="drop")
    calg = pd.DataFrame({"q": qg, "p": pg, "y": y_real}).groupby("q").agg(p=("p", "mean"), y=("y", "mean"))
    base = y_real.mean()
    brier = lambda p: float(np.mean((p - y_real) ** 2))  # noqa: E731
    nums["cv"] = dict(auc=auc(y_real, oof), auc_rw=auc(y_rwo, oof_rw), auc_geo=a_geo_real, bss_base=1 - brier(oof) / brier(np.full(len(oof), base)),
                      bss_geo=1 - brier(oof) / brier(pg), bss_geo_vs_base=1 - brier(pg) / brier(np.full(len(oof), base)))
    charts.append({"type": "lines", "title": "Calibration: purged 6-fold logistic vs the random-walk geometry", "unit": "share that hit the target", "xlabel": "predicted P(target first)",
                   "note": f"Deciles of the out-of-fold prediction. On the diagonal = calibrated. AUC {nums['cv']['auc']:.3f} (geometry alone {a_geo_real:.3f}). Brier skill vs the base rate {100 * nums['cv']['bss_base']:.2f}%, vs the geometry {100 * nums['cv']['bss_geo']:.2f}%. Looked at only: the model was fitted on the same window and nothing was chosen from it. ({sh[k0]}, fade)",
                   "series": [{"name": "Logistic, out of fold", "points": [[r4(r.p), r4(r.y)] for r in cal.itertuples()]},
                              {"name": "Random-walk geometry", "points": [[r4(r.p), r4(r.y)] for r in calg.itertuples()]},
                              {"name": "Perfect calibration", "points": [[0.1, 0.1], [0.6, 0.6]]}]})

    # 10 what a filter keeps: mean R by out-of-fold quintile vs take-all and vs a random filter
    rr = E[f"r{k0}_fade"].to_numpy() - E.spread.to_numpy()
    qq = pd.qcut(oof, 5, labels=False)
    rows10 = []
    for i_ in range(5):
        msk = qq == i_
        ci = bs.mean(E.date[msk], rr[msk])[0]
        rows10.append({"label": f"quintile {i_ + 1} (P {oof[msk].mean():.2f})", "value": r4(ci[0]), "lo": r4(ci[1]), "hi": r4(ci[2])})
    ci_all = bs.mean(E.date, rr)[0]
    rnd = rng.random(len(E)) < 0.2
    ci_rnd = bs.mean(E.date[rnd], rr[rnd])[0]
    rows10 += [{"label": "take every touch", "value": r4(ci_all[0]), "lo": r4(ci_all[1]), "hi": r4(ci_all[2])},
               {"label": "random 20% (seeded)", "value": r4(ci_rnd[0]), "lo": r4(ci_rnd[1]), "hi": r4(ci_rnd[2])}]
    nums["quintiles"] = rows10
    charts.append({"type": "bars", "title": f"What the filter would keep: mean result by out-of-fold quintile, after spread ({sh[k0]}, fade)", "unit": "σ per trade", "ref": 0,
                   "note": "Not a backtest score: the model and the window are the same discovery data, and nothing was tuned. Benchmarks: taking every touch, and a seeded random 20%. 95% date-block intervals. Spread = the touch bar's bid/ask, charged once.",
                   "rows": rows10})

    # 11 year by year: real vs geometry, two shapes
    rows11 = []
    for yv, g in E.groupby("year"):
        rows11.append({"label": f"{yv} ({len(g):,})", "values": [r4((g[f"y{k0}_fade"] == 1).mean() - g[f"pg{k0}"].mean()), r4((g["y4_fade"] == 1).mean() - g["pg4"].mean())]})
    charts.append({"type": "groups", "title": "Year by year: target-first rate minus the random walk (fade)", "names": [sh[k0], sh[4]], "unit": "share of touches (0 = random walk)",
                   "note": "Fade side. 2016 is from late October only. The random walk moves with the clock and the vol profile only; the real rate moving away from it in some years and not others is what a filter would have to track.",
                   "rows": rows11})

    # 12 per instrument: real minus geometry
    rows12 = []
    for sym, g in E.groupby("inst"):
        rows12.append((sym, float((g[f"y{k0}_fade"] == 1).mean() - g[f"pg{k0}"].mean()), len(g)))
    rows12.sort(key=lambda r: r[1])
    charts.append({"type": "bars", "title": f"Each instrument: real target-first rate minus the random walk ({sh[k0]}, fade)", "unit": "share of touches (0 = random walk)", "ref": 0,
                   "note": "About 900-1,300 touches each, one shared clock; no intervals per instrument. Look for a pattern by asset class, not a winner.",
                   "rows": [{"label": f"{s_} ({n_})", "value": r4(v)} for s_, v, n_ in rows12]})

    # 13 per class
    rows13 = []
    for kc, g in E.groupby("klass"):
        yv = (g[f"y{k0}_fade"] == 1).astype(float).to_numpy() - g[f"pg{k0}"].to_numpy()
        ci = LR.Boot(g.date).mean(g.date, yv)[0]
        rows13.append({"label": f"{kc} ({len(g):,})", "value": r4(ci[0]), "lo": r4(ci[1]), "hi": r4(ci[2])})
    charts.append({"type": "bars", "title": f"By asset class: real minus random walk ({sh[k0]}, fade)", "unit": "share of touches", "ref": 0,
                   "note": "95% date-block intervals. Zero = the touch behaves like a random walk at that time of day.", "rows": rows13})

    # 14 example trades: kept (top decile) vs dropped (bottom decile), seeded, not chosen by result
    dec = pd.qcut(oof, 10, labels=False)
    ex = []
    for lab, dsel in (("kept (top 10% P)", 9), ("dropped (bottom 10% P)", 0)):
        pick = E[dec == dsel].sample(5, random_state=SEED)
        for r in pick.itertuples():
            k = k0
            sgn = 1 if r.dir == "up" else -1
            sd = -sgn
            end_m = int(getattr(r, f"end{k}"))
            path = trade_path(r.inst, r.date, int(r.minute), end_m, sd, float(r.entry), float(r.sig))
            ex.append({"inst": r.inst, "date": r.date, "side": f"{lab}: fade {'short' if sd < 0 else 'long'} at {int(r.minute) // 60:02d}:{int(r.minute) % 60:02d}, P={oof[r.Index]:.2f}",
                       "r": r4(getattr(r, f"r{k}_fade")), "unit": "σ", "stop": -SHAPES[k][2], "target": SHAPES[k][1], "path": path})
    charts.append({"type": "trades", "title": "Ten touches: five the filter would keep, five it would drop", "unit": "σ from entry (fade side)",
                   "note": f"Picked by seed {SEED} inside the top and bottom out-of-fold deciles, not by result. Dashed lines: target +0.25σ, stop -0.25σ; the path is cut at the 2-hour limit. Top-decile touches are fast, busy ones (avg 13:00 London, 0.53σ in the last 15 min, 7% time out); bottom-decile ones are quiet Asia touches (avg 05:15, 48% time out). The model is sorting by activity, not by which side wins.",
                   "trades": ex})
    return charts, nums, dict(n=n_ev, days=n_days, inst=n_inst, spread_med=spread_med)


def main():
    p = OUT / "events.parquet"
    E = build() if ("--rebuild" in sys.argv or not p.exists()) else pd.read_parquet(p)
    charts, nums, meta = look(E)
    (OUT / "numbers.json").write_text(json.dumps(nums, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o)), encoding="utf-8")
    intro = json.loads((OUT / "intro.json").read_text(encoding="utf-8")) if (OUT / "intro.json").exists() else ["(intro written after the numbers are read)"]
    WEB.mkdir(parents=True, exist_ok=True)
    out = {"id": "meta-look", "window": [START, END], "n_touches": meta["n"], "sessions": meta["days"], "instruments": meta["inst"],
           "primary": "first touch of open ± 0.5σ (HAR σ), 01:00-19:00 London, entry at the touch bar's mid close; fade and follow",
           "intro": intro, "charts": charts}
    (WEB / "meta-look.json").write_text(json.dumps(out, ensure_ascii=False, default=lambda o: o.item() if hasattr(o, "item") else str(o)), encoding="utf-8")
    print(json.dumps(nums, indent=1, default=str)[:6000])


if __name__ == "__main__":
    main()
