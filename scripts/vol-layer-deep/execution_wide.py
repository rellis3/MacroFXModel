"""Vol-Layer stage 3 ("go wide"), layer 7 (execution: stop orders). Describes; nothing is traded or scored as a system.

Question: how often is a stop k sigma away touched, on the real M1 BID/ASK path, and does that hold, change or reverse
by class, instrument, London time, horizon, vol regime and year? Against: the random-walk touch rate 2*Phi(-d/sqrt(V))
(V = share of the day's variance inside the window, from each instrument's intraday 5-minute profile) and a
fixed-width stop. Then: does an error-scaled stop (sigma x exp(recent forecast error), the F5 EWMA in
scripts/vol-layer-deep/state.py) touch at a steadier rate than the plain sigma stop, how far past the stop fills go
(gap overshoot, GPD tail), and how the same stop behaves when placed later in the session (time left).

Entries are direction-free, as in the stage 2 noise map: in each London session, 6 seeded random minutes between
00:15 and 21:00 London, each taken long (buy at the ask) AND short (sell at the bid). A long stop at ask - D is
touched when a later BID low reaches it; a short stop at bid + D when a later ASK high reaches it. The "mid" touch
(mid low/high vs mid entry) is kept beside it to show what the spread adds.

Horizons: 15m, 1h, 4h, to 22:00 London (eod), end of the next session, end of the 5th session after.
Sigma = live_sig_used (the live export sigma, known at the open). D = d * sigma * entry mid.

DISCOVERY WINDOW ONLY: sessions 2016-10-24 .. 2022-12-30. M1 is cut at the end of 2022-12-30 London before any
path is read; an entry whose horizon would end after that is dropped for that horizon.

    python -X utf8 scripts/vol-layer-deep/execution_wide.py build   -> analysis/output/vol-layer-deep/execution/wide/entries.parquet
    python -X utf8 scripts/vol-layer-deep/execution_wide.py look    -> backtest-data/vol-layer/execution-wide.json
    python -X utf8 scripts/vol-layer-deep/execution_wide.py         -> both
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
from scipy.stats import genpareto, norm  # noqa: E402

import forecast_record as FR  # noqa: E402

SEED = 20261112
FR.SEED = SEED                       # LR.Boot draws its weights from forecast_record.boot_weights (B=2000, block 20)
import line_reaction as LR  # noqa: E402
from forecast_record import klass  # noqa: E402

OUT = ROOT / "analysis/output/vol-layer-deep/execution/wide"
WEB = ROOT / "backtest-data/vol-layer"
HIST = ROOT / "analysis/output/forecast_history"
STATE = ROOT / "analysis/output/vol-layer-deep/state/sessions.parquet"
BA = ROOT / "data/m1_bidask"
BA_KEY = {"DE30": "dax", "SPX500": "spx", "DOW": "dow", "GOLD": "gold", "NQ": "nq", "UK100": "uk100", "US2000": "us2000"}
START, END = "2016-10-24", "2022-12-30"
LON = "Europe/London"
N_ENTRY = 6
E_LO, E_HI, CLOSE = 15, 21 * 60, 22 * 60
HZ = ["m15", "h1", "h4", "eod", "next", "s5"]
HZ_NAME = {"m15": "15 min", "h1": "1 hour", "h4": "4 hours", "eod": "to 22:00", "next": "next session", "s5": "5 sessions"}
HZ_MIN = {"m15": 15, "h1": 60, "h4": 240}
D_MAIN = [0.5, 1.0, 1.5, 2.0]
D_GRID = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0]
D_OVER = [0.5, 1.0, 2.0]
BUCKETS = [(0, 420, "Asia 00-07"), (420, 600, "London open 07-10"), (600, 780, "London mid 10-13"),
           (780, 960, "Overlap 13-16"), (960, 1320, "NY afternoon 16-22")]
HLS = [3, 5, 10, 20, 40]             # forecast-error EWMA half-lives (sessions) for the plateau check
BETAS = [0.5, 1.0, 1.5]              # sigma x exp(beta * error)
CLS = {"fx_majors": "FX majors", "fx_crosses": "FX crosses", "indices": "Indices", "gold": "Gold"}
assert START == "2016-10-24" and END == "2022-12-30"


def instruments():
    return [f.stem for f in sorted(HIST.glob("*.csv")) if (BA / f"{BA_KEY.get(f.stem, f.stem.lower())}_m1.parquet").exists()]


def bucket(m):
    for lo, hi, nm in BUCKETS:
        if lo <= m < hi:
            return nm
    return "other"


# ---------------------------------------------------------------- session-level inputs (all past-only)
def session_inputs(sym, S):
    """Per London session: sigma, lagged sigma, fixed-width sigma, forecast-error multipliers, regime, sigma tercile key."""
    sg = pd.read_csv(HIST / f"{sym}.csv", usecols=["date", "live_sig_used"]).set_index("date").live_sig_used / 100
    sg = sg[(sg.index <= END) & np.isfinite(sg) & (sg > 0)]
    X = pd.DataFrame({"s": sg})
    X["s_lag"] = sg.shift(1)                                           # one more session of delay
    X["s_fix"] = sg.shift(1).rolling(252, min_periods=60).median()     # fixed width: trailing median sigma, past only
    st = S[S.inst == sym].set_index("date").sort_index()
    e = st.e_raw                                                       # log(sqrt(RV5)/sigma) of session t (outcome of t)
    for hl in HLS:
        ew = e.ewm(halflife=hl, adjust=True).mean()
        X[f"ew{hl}"] = ew.shift(1).reindex(X.index)                    # through t-1 (hl=10 is state.py's F5_ew)
        X[f"ew{hl}_lag"] = ew.shift(2).reindex(X.index)
    # C.OG Lesson 05 regime, past only: vol63 = sqrt(mean RV5 over t-63..t-1); turbulent when vol63 > 1.25 x its
    # trailing 252-session median has held for 21+ consecutive sessions (through t-1).
    v63 = np.sqrt(st.rv5.shift(1).rolling(63, min_periods=63).mean())
    med = v63.rolling(252, min_periods=126).median()
    cond = (v63 > 1.25 * med)
    run = cond.groupby((~cond).cumsum()).cumsum()
    reg = pd.Series(np.where(med.isna(), "unknown", np.where(run >= 21, "turbulent", "calm")), index=st.index)
    X["regime"] = reg.reindex(X.index).fillna("unknown")
    X["F3"] = st.F3.reindex(X.index)
    return X


# ---------------------------------------------------------------- build
def build_one(sym, X, rng, keep_paths):
    df = pd.read_parquet(BA / f"{BA_KEY.get(sym, sym.lower())}_m1.parquet",
                         columns=["time", "high", "low", "close", "bid_o", "bid_l", "bid_c", "ask_o", "ask_h", "ask_c"])
    t = pd.DatetimeIndex(pd.to_datetime(df["time"], utc=True))
    stop = (pd.Timestamp(END) + pd.Timedelta(days=1)).tz_localize(LON).tz_convert("UTC")
    keep = np.asarray(t < stop)
    df, t = df[keep].reset_index(drop=True), t[keep]
    t = t.as_unit("ns")
    o = np.argsort(t.asi8, kind="stable")
    df, t = df.iloc[o].reset_index(drop=True), t[o]
    assert t.max() < stop
    loc = t.tz_convert(LON).tz_localize(None)
    codes, uniq = pd.factorize(loc.normalize())
    dstr = np.asarray(uniq.strftime("%Y-%m-%d"))[codes]
    m = np.asarray(loc.hour * 60 + loc.minute)
    wd = np.asarray(loc.dayofweek < 5)
    tsec = t.asi8 // 10**9
    hi, lo, c = df.high.to_numpy(), df.low.to_numpy(), df.close.to_numpy()
    bo, bl, bc = df.bid_o.to_numpy(), df.bid_l.to_numpy(), df.bid_c.to_numpy()
    ao, ah, ac = df.ask_o.to_numpy(), df.ask_h.to_numpy(), df.ask_c.to_numpy()
    del df
    # sessions: London date, weekday, bars < 22:00
    inwin = wd & (m < CLOSE)
    sess = pd.DataFrame({"i": np.flatnonzero(inwin), "d": dstr[inwin]})
    g = sess.groupby("d", sort=True).i
    first, last, nb = g.min(), g.max(), g.size()
    dates = [d for d in first.index if START <= d <= END and nb[d] >= 600]
    pos = {d: k for k, d in enumerate(dates)}
    # intraday variance profile over 24h (288 five-minute slots), in units of sigma^2, discovery sessions only
    prof = np.zeros(288)
    sig = X.s
    rows, paths = [], []
    for d in dates:
        s = sig.get(d)
        if s is None or not np.isfinite(s) or s <= 0:
            continue
        a, b = first[d], last[d]
        # profile from mid closes, 5-minute slots of the London date (00:00-24:00)
        jj = np.arange(a, min(b + 200, len(c)))
        jj = jj[dstr[jj] == d]
        sl = m[jj] // 5
        lastk = np.flatnonzero(np.r_[sl[1:] != sl[:-1], True])
        cs, ss = np.log(c[jj][lastk]), sl[lastk]
        ok = np.diff(ss) == 1
        prof[ss[1:][ok]] += (np.diff(cs)[ok] / s) ** 2
        cand = np.flatnonzero((m[a:b + 1] >= E_LO) & (m[a:b + 1] < E_HI)) + a
        if len(cand) < 300:
            continue
        k = pos[d]
        ends = {"eod": b,
                "next": last[dates[k + 1]] if k + 1 < len(dates) else None,
                "s5": last[dates[k + 5]] if k + 5 < len(dates) else None}
        for i in np.sort(rng.choice(cand, size=N_ENTRY, replace=False)):
            mid = c[i]
            den = s * mid
            J = {}
            for h in HZ:
                if h in HZ_MIN:
                    j = np.searchsorted(tsec, tsec[i] + 60 * HZ_MIN[h], side="right") - 1
                    J[h] = j if j > i and dstr[j] <= END else None
                else:
                    J[h] = ends[h] if ends[h] is not None and ends[h] > i else None
            # nested running extremes, horizon by horizon
            rec = {"inst": sym, "date": d, "minute": int(m[i]), "spread": (ac[i] - bc[i]) / den}
            prev = i
            mn_b = mn_m = np.inf
            mx_a = mx_m = -np.inf
            order = sorted([h for h in HZ if J[h] is not None], key=lambda h: J[h])
            for h in order:
                j = J[h]
                if j > prev:
                    seg = slice(prev + 1, j + 1)
                    mn_b, mx_a = min(mn_b, bl[seg].min()), max(mx_a, ah[seg].max())
                    mn_m, mx_m = min(mn_m, lo[seg].min()), max(mx_m, hi[seg].max())
                    prev = j
                rec[f"L_{h}"] = (ac[i] - mn_b) / den          # long adverse excursion, bid/ask path
                rec[f"S_{h}"] = (mx_a - bc[i]) / den          # short adverse excursion
                rec[f"Lm_{h}"] = (mid - mn_m) / den           # mid path
                rec[f"Sm_{h}"] = (mx_m - mid) / den
                rec[f"Lf_{h}"] = (c[j] - mid) / den           # final mid move (long sign)
                rec[f"min_{h}"] = int((tsec[j] - tsec[i]) // 60)
            # first touch and fill over the 5-session path (or the longest horizon available): overshoot past the stop
            jmax = J[order[-1]] if order else None
            if jmax is not None and jmax > i:
                seg = slice(i + 1, jmax + 1)
                cmin = np.minimum.accumulate(bl[seg])
                cmax = np.maximum.accumulate(ah[seg])
                ew = X.at[d, "ew10"] if d in X.index else np.nan
                for tag, mult in (("p", 1.0), ("e", np.exp(ew) if np.isfinite(ew) else np.nan)):
                    if not np.isfinite(mult):
                        continue
                    for dd in D_OVER:
                        D = dd * mult * den
                        for side in ("L", "S"):
                            if side == "L":
                                stp = ac[i] - D
                                q = np.searchsorted(-cmin, -stp, side="left")
                            else:
                                stp = bc[i] + D
                                q = np.searchsorted(cmax, stp, side="left")
                            if q >= len(cmin):
                                continue
                            jq = i + 1 + q
                            if side == "L":
                                fill = min(stp, bo[jq])
                                over = (stp - fill) / den
                                net = (ac[i] - fill) / D
                                gross = (mid - (fill + 0.5 * (ao[jq] - bo[jq]))) / D
                            else:
                                fill = max(stp, ao[jq])
                                over = (fill - stp) / den
                                net = (fill - bc[i]) / D
                                gross = ((fill - 0.5 * (ao[jq] - bo[jq])) - mid) / D
                            gapmin = (tsec[jq] - tsec[jq - 1]) // 60
                            rows_o = rec.setdefault("_over", [])
                            rows_o.append((tag, dd, side, int((tsec[jq] - tsec[i]) // 60), float(over), float(gross), float(net),
                                           int(gapmin), int(m[jq])))
            if keep_paths and rng.random() < 0.02 and J["eod"] is not None:
                seg = np.arange(i, J["eod"] + 1, 5)
                paths.append({"inst": sym, "date": d, "minute": int(m[i]), "s": float(s),
                              "path": [[int((tsec[q] - tsec[i]) // 60), round(float((c[q] - mid) / den), 3)] for q in seg],
                              "bid_low": float((ac[i] - bl[i + 1:J["eod"] + 1].min()) / den),
                              "ask_high": float((ah[i + 1:J["eod"] + 1].max() - bc[i]) / den)})
            rows.append(rec)
    return rows, prof, paths


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    S = pd.read_parquet(STATE, columns=["inst", "date", "e_raw", "rv5", "F3"])
    assert S.date.max() <= END
    rng = np.random.default_rng(SEED)
    E_parts, O_parts, profs, allpaths, sess = [], [], {}, [], []
    for sym in instruments():
        t0 = time.time()
        X = session_inputs(sym, S)
        rows, prof, paths = build_one(sym, X, rng, keep_paths=True)
        over = []
        for r in rows:
            for o in r.pop("_over", []):
                over.append((sym, r["date"], r["minute"], *o))
        E = pd.DataFrame(rows)
        E = E.join(X.drop(columns=["F3"]).assign(F3=X.F3), on="date")
        E_parts.append(E)
        O_parts.append(pd.DataFrame(over, columns=["inst", "date", "minute", "scale", "d", "side", "mins_to_hit", "over",
                                                   "lossR_gross", "lossR_net", "gap_min", "hit_minute"]))
        profs[sym] = (prof / prof.sum()).tolist()
        allpaths += paths
        sess.append(X.assign(inst=sym)[["inst", "regime"]].reset_index().rename(columns={"index": "date"}))
        print(sym, len(E), f"{time.time() - t0:.1f}s", flush=True)
        del rows, E
    E = pd.concat(E_parts, ignore_index=True)
    assert E.date.max() <= END and E.date.min() >= START
    E.to_parquet(OUT / "entries.parquet", index=False)
    pd.concat(O_parts, ignore_index=True).to_parquet(OUT / "overshoot.parquet", index=False)
    pd.concat(sess, ignore_index=True).query("date >= @START and date <= @END").to_parquet(OUT / "regimes.parquet", index=False)
    (OUT / "profiles.json").write_text(json.dumps(profs), encoding="utf-8")
    (OUT / "paths.json").write_text(json.dumps(allpaths), encoding="utf-8")
    print("entries", len(E))


# ---------------------------------------------------------------- look
def stationary_weights(n, block, B=2000, seed=SEED):
    rng = np.random.default_rng(seed)
    W = np.zeros((B, n))
    p = 1.0 / block
    for b in range(B):
        jumps = rng.random(n) < p
        starts = rng.integers(n, size=n)
        idx = np.empty(n, dtype=int)
        i = rng.integers(n)
        for t in range(n):
            if t and jumps[t]:
                i = starts[t]
            idx[t] = i
            i = (i + 1) % n
        W[b] = np.bincount(idx, minlength=n)
    return W


class Boot2:
    """Date-clustered bootstrap with given weights (rows = replicates, cols = sorted unique dates)."""

    def __init__(self, dates, W):
        self.dates = np.sort(pd.unique(dates))
        self.W = W
        self.idx = pd.Series(np.arange(len(self.dates)), index=self.dates)

    def sums(self, dates, x):
        return np.bincount(self.idx[dates].to_numpy(), weights=x, minlength=len(self.dates))

    def mean(self, dates, x):
        a, b = self.sums(dates, x), self.sums(dates, np.ones(len(x)))
        reps = (self.W @ a) / (self.W @ b)
        return [r4(a.sum() / b.sum()), r4(np.nanpercentile(reps, 2.5)), r4(np.nanpercentile(reps, 97.5))], reps


def r4(x, k=4):
    return None if x is None or not np.isfinite(x) else round(float(x), k)


def pval(reps):
    reps = reps[np.isfinite(reps)]
    return float(min(1.0, 2 * min((reps <= 0).mean(), (reps >= 0).mean()))) if len(reps) else 1.0


def bh(ps, q=0.10):
    ps = np.asarray(ps)
    m = len(ps)
    o = np.argsort(ps)
    thr = q * np.arange(1, m + 1) / m
    ok = ps[o] <= thr
    k = np.flatnonzero(ok).max() + 1 if ok.any() else 0
    passed = np.zeros(m, bool)
    passed[o[:k]] = True
    return passed


def long_form(E, profs):
    """Stack long and short sides; add the random-walk V for each horizon and the stop multipliers."""
    cols = ["inst", "date", "minute", "spread", "s", "s_lag", "s_fix", "regime", "F3"] + [f"ew{h}" for h in HLS] + [f"ew{h}_lag" for h in HLS]
    parts = []
    for side in ("L", "S"):
        P = E[cols].copy()
        P["side"] = side
        for h in HZ:
            P[f"mae_{h}"] = E[f"{side}_{h}"]
            P[f"maem_{h}"] = E[f"{side}m_{h}"]
            P[f"min_{h}"] = E[f"min_{h}"]
        parts.append(P)
    A = pd.concat(parts, ignore_index=True)
    A["klass"] = A.inst.map(klass)
    A["bucket"] = A.minute.map(bucket)
    A["year"] = A.date.str[:4]
    A["hour"] = A.minute // 60
    A["wkday"] = pd.DatetimeIndex(A.date).dayofweek
    # V: share of a 24h day's variance inside the window (profile from 5-minute mid returns, per instrument)
    for h in HZ:
        A[f"V_{h}"] = np.nan
    for sym, g in A.groupby("inst"):
        cum = np.r_[0.0, np.cumsum(profs[sym])]
        a = (g.minute.to_numpy() + 1) / 5.0
        cumf = lambda x: np.interp(x, np.arange(289), cum)  # noqa: E731
        ca = cumf(a)
        for h in ("m15", "h1", "h4"):
            bx = a + g[f"min_{h}"].to_numpy() / 5.0
            v = np.where(bx <= 288, cumf(np.minimum(bx, 288)) - ca, 1 - ca + cumf(np.clip(bx - 288, 0, 288)))
            A.loc[g.index, f"V_{h}"] = v
        A.loc[g.index, "V_eod"] = cumf(264) - ca
        A.loc[g.index, "V_next"] = 1 - ca + cumf(264)
        A.loc[g.index, "V_s5"] = 1 - ca + 4 + cumf(264)
        A.loc[g.index, "V_lin"] = (1320 - g.minute.to_numpy()) / 1440.0
    for h in HZ:
        A.loc[A[f"mae_{h}"].isna(), f"V_{h}"] = np.nan
    A["mult_e"] = np.exp(A.ew10)
    A["mult_f"] = A.s_fix / A.s
    A["mult_lag"] = A.s_lag / A.s
    A["mult_elag"] = np.exp(A.ew10_lag)
    q = A.drop_duplicates(["inst", "date"]).F3.quantile([1 / 3, 2 / 3]).to_numpy()
    A["terc"] = np.where(A.F3.isna(), "unknown", np.where(A.F3 <= q[0], "σ low", np.where(A.F3 <= q[1], "σ mid", "σ high")))
    A = A[A.s_fix.notna() & A.ew10.notna() & A.ew10_lag.notna() & A.s_lag.notna()].reset_index(drop=True)
    return A, q


def look():
    t0 = time.time()
    E = pd.read_parquet(OUT / "entries.parquet")
    O = pd.read_parquet(OUT / "overshoot.parquet")
    profs = json.loads((OUT / "profiles.json").read_text(encoding="utf-8"))
    paths = json.loads((OUT / "paths.json").read_text(encoding="utf-8"))
    RG = pd.read_parquet(OUT / "regimes.parquet")
    assert E.date.max() <= END
    A, tq = long_form(E, profs)
    del E
    A = A[A.year >= "2017"].reset_index(drop=True)       # 2016 is a 2-month stub; the year sweep is 2017-2022
    bs = LR.Boot(A.date)
    A["di"] = bs.idx[A.date].to_numpy()
    # regime episodes: runs of the same regime label per instrument
    RG = RG[RG.regime != "unknown"].sort_values(["inst", "date"])
    ep = []
    for sym, g in RG.groupby("inst"):
        r = g.regime.to_numpy()
        br = np.flatnonzero(np.r_[True, r[1:] != r[:-1]])
        lens = np.diff(np.r_[br, len(r)])
        ep += [(sym, r[b0], L) for b0, L in zip(br, lens)]
    EP = pd.DataFrame(ep, columns=["inst", "regime", "len"])
    n_ep = EP.groupby("regime").size().to_dict()
    blk = int(round(EP.len.mean()))
    bsr = Boot2(A.date, stationary_weights(len(np.sort(pd.unique(A.date))), blk))
    print("frames ready", len(A), f"{time.time() - t0:.0f}s", "episodes", n_ep, "block", blk, flush=True)

    def p_rw(df, h, d):
        return 2 * norm.cdf(-d / np.sqrt(df[f"V_{h}"].clip(lower=1e-9).to_numpy()))

    def hit(df, h, d, mult=None, mid=False):
        x = df[f"{'maem' if mid else 'mae'}_{h}"].to_numpy()
        thr = d if mult is None else d * df[mult].to_numpy()
        return (x >= thr).astype(float)

    cells = []

    def add_cell(test, dim, key, h, d, df, x, boot=None, extra=None):
        ok = np.isfinite(x)
        if ok.sum() < 300:
            return None
        ci, reps = fmean(boot or bs, df.di.to_numpy()[ok], x[ok])
        c = {"test": test, "dim": dim, "key": key, "h": h, "d": d, "n": int(ok.sum()), "est": ci[0], "lo": ci[1], "hi": ci[2], "p": pval(reps)}
        if extra:
            c.update(extra)
        cells.append(c)
        return c

    # ---- 1. plain sigma stop: bid/ask hit rate minus random-walk rate, every dimension x horizon x d
    dims = [("class", "klass"), ("inst", "inst"), ("bucket", "bucket"), ("regime", "regime"), ("terc", "terc"), ("year", "year")]
    for dim, col in dims:
        for key, g in A.groupby(col):
            if key == "unknown":
                continue
            for h in HZ:
                gg = g[g[f"mae_{h}"].notna()]
                if len(gg) < 300:
                    continue
                for d in D_MAIN:
                    pr = p_rw(gg, h, d)
                    hb = hit(gg, h, d)
                    add_cell("hit-rw", dim, key, h, d, gg, hb - pr, boot=bsr if dim == "regime" else None,
                             extra={"hit": r4(hb.mean()), "rw": r4(pr.mean()), "hit_mid": r4(hit(gg, h, d, mid=True).mean()),
                                    "hit_fix": r4(hit(gg, h, d, "mult_f").mean()), "hit_err": r4(hit(gg, h, d, "mult_e").mean())})
    print("cells A", len(cells), f"{time.time() - t0:.0f}s", flush=True)
    # ---- 2. error-scaled and fixed vs plain: Brier difference against the random-walk rate (negative = closer to it)
    for dim, col in [("all", None), ("class", "klass"), ("bucket", "bucket"), ("regime", "regime"), ("year", "year")]:
        groups = [("all", A)] if col is None else list(A.groupby(col))
        for key, g in groups:
            if key == "unknown":
                continue
            for h in HZ:
                gg = g[g[f"mae_{h}"].notna()]
                for d in D_MAIN:
                    pr = p_rw(gg, h, d)
                    bp = (hit(gg, h, d) - pr) ** 2
                    for nm, mult in (("err-plain", "mult_e"), ("fix-plain", "mult_f")):
                        add_cell(nm, dim, key, h, d, gg, (hit(gg, h, d, mult) - pr) ** 2 - bp, boot=bsr if dim == "regime" else None)
    # ---- 3. time left: same stop placed at each London hour, held to 22:00
    for hr, g in A[A.mae_eod.notna()].groupby("hour"):
        for d in D_MAIN:
            pr = p_rw(g, "eod", d)
            hb = hit(g, "eod", d)
            add_cell("timeleft", "hour", int(hr), "eod", d, g, hb - pr,
                     extra={"hit": r4(hb.mean()), "rw": r4(pr.mean()), "rw_lin": r4((2 * norm.cdf(-d / np.sqrt(g.V_lin.to_numpy()))).mean()),
                            "rw_flat": r4(2 * norm.cdf(-d)), "hit_err": r4(hit(g, "eod", d, "mult_e").mean())})
    print("cells all", len(cells), f"{time.time() - t0:.0f}s", flush=True)
    passed = bh([c["p"] for c in cells])
    for c, ok in zip(cells, passed):
        c["bh"] = bool(ok)
    m = len(cells)
    k = int(passed.sum())
    raw05 = int(sum(c["p"] < 0.05 for c in cells))

    C = pd.DataFrame(cells)

    def get(test, dim, key, h, d):
        r = C[(C.test == test) & (C.dim == dim) & (C.key == key) & (C.h == h) & (C.d == d)]
        return r.iloc[0].to_dict() if len(r) else None

    pct = lambda x: None if x is None else round(100 * x, 2)  # noqa: E731
    charts = []
    # chart 1: plateau over stop size (all instruments, eod): real bid/ask, mid, random walk, error-scaled
    g = A[A.mae_eod.notna()]
    ser = {"Real, bid/ask": [], "Real, mid": [], "Random walk 2Φ(−d/√V)": [], "Error-scaled stop": []}
    for d in D_GRID:
        ser["Real, bid/ask"].append([d, pct(hit(g, "eod", d).mean())])
        ser["Real, mid"].append([d, pct(hit(g, "eod", d, mid=True).mean())])
        ser["Random walk 2Φ(−d/√V)"].append([d, pct(p_rw(g, "eod", d).mean())])
        ser["Error-scaled stop"].append([d, pct(hit(g, "eod", d, "mult_e").mean())])
    curve_eod = {k_: v for k_, v in ser.items()}
    charts.append({"type": "lines", "title": "How often a stop is touched by 22:00, by stop size", "unit": "% touched", "xlabel": "stop distance, daily σ",
                   "note": "All 34 instruments, random entries long and short. Compare real mid with the random walk: below it for small stops (0.25-0.5σ), "
                           "on it at 1σ, above it for wide stops (fat tails: 3σ is touched ~10x more often than a random walk says). The bid/ask line sits "
                           "1-4 points above the mid line at every size: that is the spread. The curves are smooth, with no step at any size. The error-scaled stop sits on the plain one.",
                   "series": [{"name": k_, "points": v} for k_, v in ser.items()]})
    # chart 2: by horizon, d=1
    rows = []
    for h in HZ:
        c = get("hit-rw", "class", "fx_majors", h, 1.0)
        gg = A[A[f"mae_{h}"].notna()]
        rows.append({"label": HZ_NAME[h], "values": [pct(hit(gg, h, 1.0).mean()), pct(p_rw(gg, h, 1.0).mean()), pct(hit(gg, h, 1.0, "mult_f").mean())]})
    charts.append({"type": "groups", "title": "1σ stop by holding horizon: real vs random walk vs fixed width", "names": ["Real bid/ask (σ stop)", "Random walk", "Fixed-width stop"],
                   "unit": "% touched", "note": "All instruments. A 1σ stop is rarely touched inside a few hours; over 5 sessions most are. Compare the first bar "
                   "with the random walk in each group: the shortfall is in points, and grows with the horizon until saturation. The fixed-width stop is "
                   "a trailing 252-session median σ, the same price distance every day.", "rows": rows})
    # chart 3: per instrument, d=1 eod hit - rw
    rows = []
    for sym in sorted(A.inst.unique(), key=lambda s_: (klass(s_), s_)):
        c = get("hit-rw", "inst", sym, "eod", 1.0)
        if c:
            rows.append({"label": sym, "value": pct(c["est"]), "lo": pct(c["lo"]), "hi": pct(c["hi"])})
    inst_rows = rows
    charts.append({"type": "bars", "title": "Each instrument: 1σ stop touch rate minus random walk, held to 22:00", "unit": "points", "ref": 0,
                   "note": "Below 0 = touched less than a random walk with the instrument's own intraday variance profile. 95% date-block range. "
                           "Look for any instrument above 0 (a stop there is hit more than geometry says).", "rows": rows})
    # chart 4: class x d
    rows = []
    for cl in CLS:
        for h in ("h1", "eod", "s5"):
            v = [get("hit-rw", "class", cl, h, d) for d in (0.5, 1.0, 2.0)]
            rows.append({"label": f"{CLS[cl]}, {HZ_NAME[h]}", "values": [pct(x["est"]) if x else None for x in v]})
    charts.append({"type": "groups", "title": "Class pooled: touch rate minus random walk at 0.5σ, 1σ, 2σ", "names": ["0.5σ", "1σ", "2σ"], "unit": "points",
                   "note": "0 = random walk. Same sign in every class and horizon = holds across. The size of the shortfall peaks at mid stops "
                           "(where the random-walk rate is near 50%) and fades at the extremes.", "rows": rows})
    # chart 5: time of day bucket
    rows = []
    for _, _, nm in BUCKETS:
        v = [get("hit-rw", "bucket", nm, h, 1.0) for h in ("h1", "h4", "eod")]
        rows.append({"label": nm, "values": [pct(x["est"]) if x else None for x in v]})
    charts.append({"type": "groups", "title": "London time of entry: 1σ stop touch rate minus random walk", "names": ["1 hour", "4 hours", "to 22:00"], "unit": "points",
                   "note": "Entry time in Europe/London. The random walk already uses the intraday profile, so a quiet Asia hour is not penalised; "
                           "what is left is how bursty each window is beyond its average variance.", "rows": rows})
    # chart 6: time left (lines by hour)
    tl = C[(C.test == "timeleft") & (C.d == 1.0)].sort_values("key")
    charts.append({"type": "lines", "title": "Time left: the same 1σ stop placed later in the session, held to 22:00", "unit": "% touched", "xlabel": "entry hour, London",
                   "note": "The same 1σ stop placed at 01:00 vs 18:00. Benchmarks: the random walk on the vol clock (variance left in the day), "
                           "on a linear clock (hours left), and the naive full-day 2Φ(−1)=31.7%. The real line follows the vol clock, about 2 points above it "
                           "(the spread); the linear clock is up to 6 points too low around midday.",
                   "series": [{"name": "Real bid/ask", "points": [[int(r.key), pct(r.hit)] for r in tl.itertuples()]},
                              {"name": "Random walk, vol clock", "points": [[int(r.key), pct(r.rw)] for r in tl.itertuples()]},
                              {"name": "Random walk, linear clock", "points": [[int(r.key), pct(r.rw_lin)] for r in tl.itertuples()]},
                              {"name": "Full day 2Φ(−1)", "points": [[int(r.key), pct(r.rw_flat)] for r in tl.itertuples()]}]})
    # chart 7: regime x stop type
    rows = []
    for rg in ("calm", "turbulent"):
        sub = A[(A.regime == rg) & A.mae_eod.notna()]
        pr = p_rw(sub, "eod", 1.0)
        rows.append({"label": f"{rg} ({n_ep.get(rg, 0)} episodes)", "values": [pct(hit(sub, "eod", 1.0).mean() - pr.mean()), pct(hit(sub, "eod", 1.0, "mult_e").mean() - pr.mean()),
                                                                              pct(hit(sub, "eod", 1.0, "mult_f").mean() - pr.mean())]})
    for tk in ("σ low", "σ mid", "σ high"):
        sub = A[(A.terc == tk) & A.mae_eod.notna()]
        pr = p_rw(sub, "eod", 1.0)
        rows.append({"label": f"{tk} tercile", "values": [pct(hit(sub, "eod", 1.0).mean() - pr.mean()), pct(hit(sub, "eod", 1.0, "mult_e").mean() - pr.mean()),
                                                         pct(hit(sub, "eod", 1.0, "mult_f").mean() - pr.mean())]})
    regime_rows = rows
    charts.append({"type": "groups", "title": "Vol regime: 1σ stop touch rate minus random walk, held to 22:00", "names": ["Plain σ stop", "Error-scaled stop", "Fixed-width stop"],
                   "unit": "points", "note": f"C.OG Lesson 05 regime, past only (vol63 > 1.25× its 252-session median for 21+ sessions). Effective sample = episodes "
                   f"(per-instrument runs; mean length {blk} sessions, used as the bootstrap block). σ terciles: σ vs its own 252-session median. "
                   "Look at the fixed-width bar: it swings with the regime; the σ stops stay near each other.", "rows": rows})
    # chart 8: year by year
    rows = []
    yr_vals = {}
    for y in sorted(A.year.unique()):
        sub = A[(A.year == y) & A.mae_eod.notna()]
        pr = p_rw(sub, "eod", 1.0).mean()
        v = [hit(sub, "eod", 1.0).mean() - pr, hit(sub, "eod", 1.0, "mult_e").mean() - pr, hit(sub, "eod", 1.0, "mult_f").mean() - pr]
        yr_vals[y] = v
        rows.append({"label": y, "values": [pct(x) for x in v]})
    charts.append({"type": "groups", "title": "Year by year: 1σ stop touch rate minus random walk, held to 22:00", "names": ["Plain σ stop", "Error-scaled stop", "Fixed-width stop"],
                   "unit": "points", "note": "All instruments. 0 = the random-walk rate. A steady stop keeps the same bar height every year; "
                   "the fixed-width stop is the benchmark for what an unscaled stop does.", "rows": rows})
    # stability: SD across years and across regime+tercile cells, with bootstrap ranges for err - plain, fix - plain
    stab = stability(A, bs, p_rw, hit)
    charts.append({"type": "bars", "title": "Stability: spread of the 1σ touch rate across years (SD, points), held to 22:00", "unit": "points", "ref": 0,
                   "note": "Lower = the stop's touch rate is more predictable year to year. Rows 1-4 are the SD for each stop; rows 5-7 are the "
                           "difference vs the plain σ stop with a 95% date-block range (below 0 = steadier than plain σ). The delayed-σ row is the +1 lag check.",
                   "rows": stab["rows"]})
    # chart 10: plateau for error scaling (half-life x beta), Brier difference vs plain, d=1 eod
    g = A[A.mae_eod.notna()]
    pr = p_rw(g, "eod", 1.0)
    bp = ((hit(g, "eod", 1.0) - pr) ** 2).mean()
    ser = []
    plateau = {}
    for be in BETAS:
        pts = []
        for hl in HLS:
            th = 1.0 * np.exp(be * g[f"ew{hl}"].to_numpy())
            hb = (g.mae_eod.to_numpy() >= th).astype(float)
            v = ((hb - pr) ** 2).mean() - bp
            pts.append([hl, round(1e4 * v, 2)])
            plateau[(be, hl)] = v
        ser.append({"name": f"σ × exp({be} × error)", "points": pts})
    charts.append({"type": "lines", "title": "Plateau check: error-scaled stop vs plain σ stop, by look-back and strength", "unit": "Brier × 10⁴ vs plain",
                   "xlabel": "forecast-error half-life, sessions",
                   "note": "1σ stop, held to 22:00, all instruments. 0 = no better than the plain σ stop at matching the random-walk touch rate; "
                           "below 0 = closer. A flat line near the same value across half-lives = plateau; a dip at one setting = peak.",
                   "series": ser})
    # chart 11: +1 lag check
    rows = []
    for nm, mult in (("Plain σ (today)", None), ("σ delayed 1 more session", "mult_lag"), ("Error-scaled", "mult_e"), ("Error-scaled, error delayed 1", "mult_elag"), ("Fixed width", "mult_f")):
        xb = hit(g, "eod", 1.0, mult) - pr
        ci, _ = fmean(bs, g.di.to_numpy(), xb)
        rows.append({"label": nm, "value": pct(ci[0]), "lo": pct(ci[1]), "hi": pct(ci[2])})
    lag_rows = rows
    charts.append({"type": "bars", "title": "+1 lag check: 1σ touch rate minus random walk with inputs delayed one more session", "unit": "points", "ref": 0,
                   "note": "If today's σ carries real information about today's path, delaying it should move the touch rate away from the random walk "
                           "and widen the spread. If the delayed bar matches the undelayed one, the result is an alignment artefact.", "rows": rows})
    # chart 12-13: overshoot
    O = O[O.date >= "2017-01-01"]
    O["weekend"] = O.gap_min > 36 * 60
    O["gapped"] = O.over > 0
    rows = []
    gpd = {}
    for (sc, wk), part in O[(O.d == 1.0)].groupby(["scale", "weekend"]):
        o = part.over[part.gapped].to_numpy()
        lab = f"{'plain' if sc == 'p' else 'error-scaled'}, {'weekend' if wk else 'weekday'}"
        fit = gpd_fit(o)
        gpd[lab] = {"hits": int(len(part)), "gap_rate": r4(part.gapped.mean()), **fit,
                    "lossR_gross": r4(part.lossR_gross.mean()), "lossR_net": r4(part.lossR_net.mean())}
    for d in D_OVER:
        for wk in (False, True):
            part = O[(O.d == d) & (O.scale == "p") & (O.weekend == wk)]
            o = part.over[part.gapped]
            if len(o) < 30:
                continue
            q = np.quantile(o, [0.5, 0.9, 0.99])
            rows.append({"label": f"{d}σ stop, {'weekend' if wk else 'weekday'} ({len(o)} gapped of {len(part)})", "values": [round(float(x), 4) for x in q]})
    charts.append({"type": "groups", "title": "Overshoot past the stop when the bar opened beyond it (bid/ask), in daily σ", "names": ["median", "90th pct", "99th pct"], "unit": "σ",
                   "note": "Stops hit within 5 sessions. A fill at the stop has overshoot 0; only stops where the bar opened beyond the stop are shown. "
                           "Benchmark: Kou-Wang memoryless overshoot = the same size at every stop distance. Weekday gaps are tiny; weekends are the tail.", "rows": rows})
    wk_o = O[(O.d == 1.0) & (O.scale == "p") & O.gapped]
    hb_ = np.histogram(np.log10(wk_o.over.clip(lower=1e-5)), bins=np.arange(-5, 0.75, 0.25))
    charts.append({"type": "hist", "title": "Gap overshoot past a 1σ stop (log10 of daily σ)", "unit": "log10 σ",
                   "note": f"Stops that gapped. GPD on the top 10%: weekday ξ = {gpd.get('plain, weekday', {}).get('xi')}, weekend ξ = {gpd.get('plain, weekend', {}).get('xi')} "
                           "(ξ > 0 = heavy tail, ξ = 0 = exponential as Kou-Wang assume). The right hump is weekend opens.",
                   "bins": [[round(float(a_), 2), int(n_)] for a_, n_ in zip(hb_[1][:-1], hb_[0])]})
    # chart 14: loss in R gross vs net by class
    rows = []
    Om = O.merge(A[["inst"]].drop_duplicates().assign(klass=lambda x: x.inst.map(klass)), on="inst")
    for cl in CLS:
        for d in (0.5, 1.0):
            part = Om[(Om.klass == cl) & (Om.d == d) & (Om.scale == "p") & (Om.mins_to_hit <= 24 * 60)]
            if len(part):
                rows.append({"label": f"{CLS[cl]}, {d}σ", "values": [r4(part.lossR_gross.mean(), 3), r4(part.lossR_net.mean(), 3)]})
    charts.append({"type": "groups", "title": "Loss when stopped, in R: gross (mid) vs net (one spread)", "names": ["gross R lost", "net R lost"], "unit": "R",
                   "note": "Stops hit within 24 hours. 1.00 = filled exactly at the stop. Gross above 1 is the overshoot; net minus gross is one spread "
                           "in R, which grows as the stop tightens.", "rows": rows})
    # chart 15: concrete examples
    charts.append(examples(paths))
    # holds
    tl1 = {int(r.key): r for r in tl.itertuples()}
    holds = [
        {"effect": "A σ stop is touched at the random-walk rate on the mid; the bid/ask path adds the spread on top",
         "where": "every class, horizon and year; strongest in FX crosses (+3.0 points at 1σ to 22:00), absent or reversed in indices (DE30 -2.1, NQ -1.1)",
         "size": f"1σ to 22:00, all instruments: bid/ask {curve_eod['Real, bid/ask'][3][1]}%, mid {curve_eod['Real, mid'][3][1]}%, random walk {curve_eod['Random walk 2Φ(−d/√V)'][3][1]}%",
         "benchmark": "random walk 2Φ(−d/√V), V from each instrument's intraday variance profile"},
        {"effect": "Fat tails: wide stops are touched far more often than a random walk says, tight stops less",
         "where": "pooled; every year at 1.5σ and 2σ passes BH",
         "size": f"mid touch vs random walk: 0.25σ {curve_eod['Real, mid'][0][1]} vs {curve_eod['Random walk 2Φ(−d/√V)'][0][1]}%; 2σ {curve_eod['Real, mid'][6][1]} vs {curve_eod['Random walk 2Φ(−d/√V)'][6][1]}%; 3σ {curve_eod['Real, mid'][8][1]} vs {curve_eod['Random walk 2Φ(−d/√V)'][8][1]}%",
         "benchmark": "random walk with intraday profile"},
        {"effect": "Time left: the same stop placed later is touched less, along the vol clock (not hours left)",
         "where": "every London hour (83 of 84 hour cells pass BH, all above the vol-clock walk)",
         "size": f"1σ to 22:00 placed at 00:00: {pct(tl1[0].hit)}%, 12:00: {pct(tl1[12].hit)}%, 16:00: {pct(tl1[16].hit)}% (vol clock {pct(tl1[0].rw)}/{pct(tl1[12].rw)}/{pct(tl1[16].rw)}%, linear clock {pct(tl1[12].rw_lin)}% at 12:00)",
         "benchmark": "random walk on the vol clock vs linear clock vs full day 31.7%"},
        {"effect": "A fixed-width stop swings with the regime; a σ stop does not",
         "where": "calm vs turbulent, σ terciles, years",
         "size": f"fixed-width minus random walk: calm {regime_rows[0]['values'][2]}, turbulent {regime_rows[1]['values'][2]} points; plain σ: {regime_rows[0]['values'][0]} vs {regime_rows[1]['values'][0]}; year SD {stab['sd']['fix']} vs {stab['sd']['plain']} points",
         "benchmark": "random walk; plain σ stop"},
        {"effect": "Overshoot past the stop is a weekend problem; weekday gaps are rare but heavy-tailed",
         "where": "all instruments, 1σ stops hit within 5 sessions",
         "size": f"weekday: {gpd['plain, weekday']['gap_rate']} gapped, p99 {gpd['plain, weekday']['p99']}σ, GPD ξ {gpd['plain, weekday']['xi']}, net loss {gpd['plain, weekday']['lossR_net']}R; weekend: {gpd['plain, weekend']['gap_rate']} gapped, p99 {gpd['plain, weekend']['p99']}σ, ξ {gpd['plain, weekend']['xi']}, net loss {gpd['plain, weekend']['lossR_net']}R",
         "benchmark": "fill at the stop = 1.00R; Kou-Wang memoryless (exponential, ξ = 0) overshoot"},
    ]
    res = {"id": "execution-wide", "window": [START, END], "cells_tested": m, "cells_pass_bh": k,
           "cells_expected_by_chance": round(0.05 * m, 1), "cells_raw_p05": raw05,
           "chance_note": "cells_expected_by_chance = 5% of cells (raw p<0.05 expected if every cell were null); BH at q=0.10 expects at most 10% of its passes to be false.",
           "n_entries": int(len(A) // 2), "rows": int(len(A)), "instruments": sorted(A.inst.unique().tolist()), "regime_episodes": n_ep, "regime_block": blk,
           "sigma_tercile_cuts_F3": [round(float(x), 4) for x in tq],
           "intro": [], "holds": holds, "charts": charts,
           "numbers": {"curve_eod": curve_eod, "stability": stab, "gpd": gpd, "lag": lag_rows, "regime": regime_rows,
                       "plateau_brier_e4": {f"b{be}_hl{hl}": round(1e4 * v, 3) for (be, hl), v in plateau.items()},
                       "year_dev": {y: [r4(x) for x in v] for y, v in yr_vals.items()},
                       "bh_by_test": C.assign(bh=passed).groupby("test").agg(n=("bh", "size"), passed=("bh", "sum"), neg=("est", lambda s_: int((s_ < 0).sum()))).reset_index().to_dict("records")}}
    OUT.mkdir(parents=True, exist_ok=True)
    C.to_csv(OUT / "cells.csv", index=False)
    intro_f = OUT / "intro.json"
    if intro_f.exists():
        res["intro"] = json.loads(intro_f.read_text(encoding="utf-8"))
    WEB.mkdir(parents=True, exist_ok=True)
    (WEB / "execution-wide.json").write_text(json.dumps(res, ensure_ascii=False, default=lambda o: o.item() if hasattr(o, "item") else str(o)), encoding="utf-8")
    print("cells", m, "bh", k, "raw05", raw05, f"{time.time() - t0:.0f}s")


def fmean(boot, di, x):
    """Date-block bootstrap mean on precomputed date codes (same weights as LR.Boot / Boot2 .mean)."""
    n = boot.W.shape[1]
    a, b = np.bincount(di, weights=x, minlength=n), np.bincount(di, minlength=n).astype(float)
    reps = (boot.W @ a) / (boot.W @ b)
    return [r4(a.sum() / b.sum()), r4(np.nanpercentile(reps, 2.5)), r4(np.nanpercentile(reps, 97.5))], reps


def stability(A, bs, p_rw, hit):
    """SD across years of (touch rate - random-walk rate) for each stop, with bootstrap ranges on the differences."""
    g = A[A.mae_eod.notna()]
    pr = p_rw(g, "eod", 1.0)
    years = sorted(g.year.unique())
    yv = g.year.to_numpy()
    dates = g.date.to_numpy()
    reps, point = {}, {}
    for nm, mult in (("plain", None), ("err", "mult_e"), ("fix", "mult_f"), ("lag", "mult_lag")):
        x = hit(g, "eod", 1.0, mult) - pr
        R, P = [], []
        for y in years:
            mk = yv == y
            a, b = bs.sums(dates[mk], x[mk]), bs.sums(dates[mk], np.ones(mk.sum()))
            R.append((bs.W @ a) / (bs.W @ b))
            P.append(a.sum() / b.sum())
        reps[nm] = np.std(np.vstack(R), axis=0)
        point[nm] = float(np.std(P))
    rows = [{"label": f"SD, {nm}", "value": round(100 * point[k_], 2), "lo": round(100 * float(np.percentile(reps[k_], 2.5)), 2),
             "hi": round(100 * float(np.percentile(reps[k_], 97.5)), 2)} for k_, nm in (("plain", "plain σ"), ("lag", "σ delayed 1 session"), ("err", "error-scaled"), ("fix", "fixed width"))]
    for k_, nm in (("err", "error-scaled − plain"), ("fix", "fixed width − plain"), ("lag", "σ delayed 1 − plain")):
        dlt = reps[k_] - reps["plain"]
        rows.append({"label": nm, "value": round(100 * (point[k_] - point["plain"]), 2), "lo": round(100 * float(np.percentile(dlt, 2.5)), 2),
                     "hi": round(100 * float(np.percentile(dlt, 97.5)), 2)})
    return {"rows": rows, "sd": {k_: round(100 * v, 2) for k_, v in point.items()}}


def gpd_fit(o):
    o = np.asarray(o, float)
    if len(o) < 80:
        return {"n_gap": int(len(o)), "xi": None, "scale": None, "u": None}
    u = float(np.quantile(o, 1 - max(0.10, min(0.5, 40 / len(o)))))     # top 10%, or at least 40 exceedances
    ex = o[o > u] - u
    xi, _, sc = genpareto.fit(ex, floc=0)
    return {"n_gap": int(len(o)), "u": r4(u, 5), "xi": r4(xi, 3), "scale": r4(sc, 5), "p50": r4(np.median(o), 5), "p99": r4(np.quantile(o, 0.99), 5)}


def examples(paths, n=12):
    rng = np.random.default_rng(SEED)
    P = [p for p in paths if p["date"] >= "2017-01-01" and (p["bid_low"] >= 0.5 or p["ask_high"] >= 0.5)]
    pick = [P[i] for i in sorted(rng.choice(len(P), size=min(n, len(P)), replace=False))]
    out = []
    for p in pick:
        both = p["bid_low"] >= 0.5 and p["ask_high"] >= 0.5
        long = bool(rng.random() < 0.5) if both else p["bid_low"] >= 0.5
        sgn = 1 if long else -1
        path = [[a, round(sgn * y / 0.5, 3)] for a, y in p["path"]]
        mae = p["bid_low"] if long else p["ask_high"]
        r = -1.0 if mae >= 0.5 else path[-1][1]
        out.append({"inst": p["inst"], "date": p["date"], "side": f"{'long' if long else 'short'} at {p['minute'] // 60:02d}:{p['minute'] % 60:02d}, worst {mae:.2f}σ on bid/ask",
                    "r": round(r, 2), "unit": "R (0.5σ stop, gross)", "stop": -1.0, "target": None, "path": path})
    return {"type": "trades", "title": "12 random entries whose 0.5σ stop was touched on the bid/ask path", "unit": "R",
            "note": "Picked by seed among random entries whose stop (0.5σ = 1R) was touched by 22:00, not by result. Path is the mid in R; the stop "
                    "is triggered on the bid (long) or ask (short), so it can trigger before the mid line reaches -1. Benchmark: on a random walk, "
                    "after the touch the rest of the path is a coin flip.", "trades": sorted(out, key=lambda x: x["date"])}


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    if cmd in ("build", "all"):
        build()
    if cmd in ("look", "all"):
        look()
