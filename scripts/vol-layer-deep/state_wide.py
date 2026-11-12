"""Vol-Layer stage 3 ("go wide") for layer 1, the vol state. Descriptive; nothing here is a trading rule.

Takes the five state fields built by state.py (analysis/output/vol-layer-deep/state/sessions.parquet) and asks how the
stage 2 effects act across conditions:
  E1 over-reaction   session range / sigma in the bottom sigma fifth minus the top fifth (within instrument). > 0 = the
                     live sigma is too high after loud spells and too low after quiet ones. Benchmark: 0 (sigma alone is
                     flat), a shuffled sigma rank, and the same curve for log-HAR / GARCH forecasts.
  E2 error effect    range / sigma in the top fifth of F5 (recent under-forecast) minus the bottom fifth. Benchmark:
                     shuffled F5 (within instrument).
  SG stop gap        hit rate of a 1-sigma stop from the entry, measured on the M1 BID/ASK path (long fills at the ask,
                     stopped at the bid; short the reverse), F5 top two fifths minus bottom two fifths. Benchmark: the
                     same gap on the mid path, and a shuffled F5.
  QL log-HAR race    QLIKE(log-HAR) / QLIKE(plain live sigma) and / QLIKE(chosen sigma, 2020-08 on), on RV5 and on
                     squared range. Benchmark: 1.
  HL GARCH half-life ln 0.5 / ln(a+b) per instrument from the quarterly fits; benchmark: realised log-RV5 ACF half-life.

Sweeps: class, instrument, London time-of-day bucket (range / stop from the bucket start), horizon (15m, 1h, 4h from
the 00:00 open, session, next session, 5 sessions), vol regime (C.OG Lesson 05: rolling 63-session vol > 1.25 x its
past rolling median for 21+ sessions = turbulent; regime cells bootstrapped in blocks of the median episode length) and
sigma terciles, and year 2017-2022. Every tested cell is counted; Benjamini-Hochberg q = 0.10 across the whole sweep,
and the whole sweep is re-run with the fields shuffled to show how many cells pass by chance.

DISCOVERY WINDOW ONLY: sessions 2016-10-24 .. 2022-12-30, asserted below. M1 is cut at the end of 2022-12-30 London.

    python -X utf8 scripts/vol-layer-deep/state_wide.py m1     -> analysis/output/vol-layer-deep/state/wide/m1_extras.parquet
    python -X utf8 scripts/vol-layer-deep/state_wide.py        -> backtest-data/vol-layer/state-wide.json  (runs m1 if missing)
"""
from __future__ import annotations

import gc
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "scripts/forecast_history"), str(ROOT / "scripts/vol-layer-deep")]
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import forecast_record as FR  # noqa: E402

FR.SEED = 20261112            # the brief's seed for the date-block bootstrap (boot_weights reads it at call time)
import line_reaction as LR  # noqa: E402
import state as ST  # noqa: E402
from forecast_record import klass  # noqa: E402

SEED = 20261112
START, END = "2016-10-24", "2022-12-30"
assert (ST.START, ST.END) == (START, END)
WIDE = ST.OUT / "wide"
CHOSEN = ROOT / "analysis/output/line_reaction/chosen_lines.csv"
WINS = {"w15": (0, 15), "w60": (0, 60), "w240": (0, 240),
        "b0": (0, 420), "b1": (420, 600), "b2": (600, 780), "b3": (780, 960), "b4": (960, 1320)}
TOD = {"b0": "Asia 00-07", "b1": "London open 07-10", "b2": "London mid 10-13", "b3": "Overlap 13-16", "b4": "NY afternoon 16-22"}
STARTS = {"b0": 0, "b1": 420, "b2": 600, "b3": 780, "b4": 960}
HOR = [("w15", "15m"), ("w60", "1h"), ("w240", "4h"), ("sess", "session 00-22"), ("next", "next session"), ("s5", "5 sessions")]
CLASSES = ["fx_majors", "fx_crosses", "gold", "indices"]
YEARS = ["2017", "2018", "2019", "2020", "2021", "2022"]
CNAME = {"fx_majors": "FX majors", "fx_crosses": "FX crosses", "gold": "gold", "indices": "indices"}


def r4(x, k=4):
    return None if x is None or not np.isfinite(x) else round(float(x), k)


# ---------------------------------------------------------------- M1: ranges per window and bid/ask stop paths
def m1_one(sym):
    cols = ["time", "open", "high", "low", "close", "bid_o", "bid_l", "bid_c", "ask_o", "ask_h", "ask_c"]
    df = pd.read_parquet(ST.BA / f"{ST.BA_KEY.get(sym, sym.lower())}_m1.parquet", columns=cols)
    t = pd.DatetimeIndex(pd.to_datetime(df["time"], utc=True))
    stop = (pd.Timestamp(END) + pd.Timedelta(days=1)).tz_localize(ST.LON).tz_convert("UTC")
    keep = np.asarray(t < stop)
    df, t = df[keep].reset_index(drop=True), t[keep]
    assert t.is_monotonic_increasing and t.max() < stop
    loc = t.tz_convert(ST.LON).tz_localize(None)
    minute = (loc.hour * 60 + loc.minute).to_numpy()
    ok = (minute < 1320) & (loc.dayofweek < 5) & np.isfinite(df.close.to_numpy()) & np.isfinite(df.bid_l.to_numpy()) & np.isfinite(df.ask_h.to_numpy())
    A = {c: df[c].to_numpy()[ok] for c in cols[1:]}
    minute = minute[ok]
    codes, uniq = pd.factorize(loc[ok].normalize())
    dates = np.asarray(uniq.strftime("%Y-%m-%d"))
    del df, t, loc
    nd = len(dates)
    out = {}

    def groups(mask):
        idx = np.flatnonzero(mask)
        c = codes[idx]
        st = np.flatnonzero(np.r_[True, c[1:] != c[:-1]]) if len(idx) else np.array([], int)
        en = np.r_[st[1:] - 1, len(idx) - 1] if len(idx) else st
        return idx, c[st] if len(idx) else st, st, en

    for nm, (a, b) in WINS.items():
        idx, d, st, en = groups((minute >= a) & (minute < b))
        rng = np.full(nd, np.nan)
        hi = np.maximum.reduceat(A["high"][idx], st)
        lo = np.minimum.reduceat(A["low"][idx], st)
        n = en - st + 1
        v = (hi - lo) / A["open"][idx][st] * 100
        v[n < 0.5 * (b - a)] = np.nan                        # thin window (e.g. DAX before 01:00): not used
        rng[d] = v
        out[nm] = rng
    for nm, s in STARTS.items():
        idx, d, st, en = groups(minute >= s)
        first_min = minute[idx][st]
        good = first_min <= s + 15                           # entry bar within 15 min of the bucket start
        fields = {"e_mid": A["open"][idx][st], "e_ask": A["ask_o"][idx][st], "e_bid": A["bid_o"][idx][st],
                  "lo_mid": np.minimum.reduceat(A["low"][idx], st), "hi_mid": np.maximum.reduceat(A["high"][idx], st),
                  "lo_bid": np.minimum.reduceat(A["bid_l"][idx], st), "hi_ask": np.maximum.reduceat(A["ask_h"][idx], st),
                  "x_mid": A["close"][idx][en], "x_bid": A["bid_c"][idx][en], "x_ask": A["ask_c"][idx][en]}
        for k, v in fields.items():
            z = np.full(nd, np.nan)
            z[d[good]] = v[good]
            out[f"{nm}_{k}"] = z
    R = pd.DataFrame(out, index=dates)
    R.index.name = "date"
    R["inst"] = sym
    R = R[(R.index >= START) & (R.index <= END)]
    return R.reset_index()


def build_m1():
    WIDE.mkdir(parents=True, exist_ok=True)
    parts = []
    for sym in ST.instruments():
        t0 = time.time()
        parts.append(m1_one(sym))
        gc.collect()
        print("m1", sym, len(parts[-1]), f"{time.time() - t0:.1f}s", flush=True)
    X = pd.concat(parts, ignore_index=True)
    assert X.date.max() <= END and X.date.min() >= START
    X.to_parquet(WIDE / "m1_extras.parquet", index=False)


# ---------------------------------------------------------------- bootstrap helpers
def boot_weights(n, block, B=2000, seed=SEED):
    """Stationary bootstrap weights (B x n), mean block length `block` dates."""
    rng = np.random.default_rng(seed)
    W = np.zeros((B, n))
    p = 1.0 / block
    for b in range(B):
        jumps = rng.random(n) < p
        starts = rng.integers(n, size=n)
        i = rng.integers(n)
        idx = np.empty(n, dtype=int)
        for t in range(n):
            if t and jumps[t]:
                i = starts[t]
            idx[t] = i
            i = (i + 1) % n
        W[b] = np.bincount(idx, minlength=n)
    return W


class Bs:
    def __init__(self, dates, W=None):
        base = LR.Boot(dates) if W is None else None
        self.dates = np.sort(pd.unique(dates))
        self.W = base.W if W is None else W
        self.idx = pd.Series(np.arange(len(self.dates)), index=self.dates)

    def s(self, d, x):
        return np.bincount(self.idx[d].to_numpy(), weights=x, minlength=len(self.dates))

    def diff(self, d1, y1, d2, y2):
        """mean(y1) - mean(y2), date-block bootstrap; returns value, lo, hi, p, reps."""
        a, na, b, nb = self.s(d1, y1), self.s(d1, np.ones(len(y1))), self.s(d2, y2), self.s(d2, np.ones(len(y2)))
        reps = self.W @ a / (self.W @ na) - self.W @ b / (self.W @ nb)
        v = a.sum() / na.sum() - b.sum() / nb.sum()
        return v, *pval(reps, 0.0)

    def ratio(self, d, num, den):
        a, b = self.s(d, num), self.s(d, den)
        reps = self.W @ a / (self.W @ b)
        return a.sum() / b.sum(), *pval(reps, 1.0)


def pval(reps, null):
    r = reps[np.isfinite(reps)]
    if len(r) < 100:
        return np.nan, np.nan, np.nan
    lo, hi = np.percentile(r, [2.5, 97.5])
    p = max(1 / (len(r) + 1), min(1.0, 2 * min((r <= null).mean(), (r >= null).mean())))
    return lo, hi, p


def bh(ps, q=0.10):
    ps = np.asarray(ps, float)
    n = len(ps)
    o = np.argsort(ps)
    thr = q * np.arange(1, n + 1) / n
    passed = ps[o] <= thr
    k = np.flatnonzero(passed).max() + 1 if passed.any() else 0
    out = np.zeros(n, bool)
    out[o[:k]] = True
    return out


# ---------------------------------------------------------------- data
def qrank(D, col, by, q=5):
    return D.groupby(by)[col].transform(lambda s: pd.qcut(s.rank(method="first"), q, labels=False) if s.notna().sum() >= q * 4 else s * np.nan)


def past_scale(D, col, tgt):
    z = D[tgt] / D[col]
    return z.groupby(D.inst).transform(lambda s: s.expanding(60).mean().shift(1))


def regime(g):
    """C.OG Lesson 05, past only: v63 = sqrt(mean RV5 over the previous 63 sessions); hot when v63 > 1.25 x the median of
    v63 over the previous 252 sessions; turbulent when hot for the 21 sessions ending t."""
    v63 = np.sqrt(g.rv5.shift(1).rolling(63).mean())
    med = v63.shift(1).rolling(252, min_periods=126).median()
    hot = (v63 > 1.25 * med).astype(float)
    hot[med.isna() | v63.isna()] = np.nan
    turb = hot.rolling(21).sum() == 21
    out = np.where(hot.rolling(21).count() < 21, None, np.where(turb, "turbulent", "calm"))
    return pd.Series(out, index=g.index)


def load():
    D = pd.read_parquet(ST.OUT / "sessions.parquet")
    assert D.date.min() >= START and D.date.max() <= END
    D = D.sort_values(["inst", "date"]).reset_index(drop=True)
    if not (WIDE / "m1_extras.parquet").exists():
        build_m1()
    X = pd.read_parquet(WIDE / "m1_extras.parquet")
    assert X.date.max() <= END
    D = D.merge(X, on=["inst", "date"], how="left")
    D["klass"] = D.inst.map(klass)
    D["year"] = D.date.str[:4]
    g = D.groupby("inst")
    # outcomes in sigma of session t
    D["y_sess"] = D.hl_s
    D["y_next"] = g.hl.shift(-1) / D.sig
    hi5 = g.high.transform(lambda s: s[::-1].rolling(5).max()[::-1])
    lo5 = g.low.transform(lambda s: s[::-1].rolling(5).min()[::-1])
    D["y_s5"] = (hi5 - lo5) / D.open * 100 / D.sig
    for k in list(WINS):
        D[f"y_{k}"] = D[k] / D.sig
    # regime + sigma terciles
    D["reg"] = D.groupby("inst", group_keys=False).apply(regime)
    D["sig_t"] = qrank(D, "F1", "inst", 3).map({0: "σ low third", 1: "σ mid third", 2: "σ high third"})
    # past-only share of the session's RV from each bucket start to 22:00 (stop width for later entries)
    H = D[[f"h{k}" for k in range(22)]].to_numpy()
    tot = H.sum(1)
    for nm, s in STARTS.items():
        sh = pd.Series(H[:, s // 60:].sum(1) / tot, index=D.index)
        D[f"rem_{nm}"] = sh.groupby(D.inst).transform(lambda z: z.shift(1).rolling(252, min_periods=60).mean())
    # chosen sigma (walk-forward lines, 2020-08 on)
    Cc = pd.read_csv(CHOSEN, usecols=["inst", "date", "sig"]).rename(columns={"sig": "c_sig"})
    Cc = Cc[(Cc.date >= START) & (Cc.date <= END)]
    D = D.merge(Cc, on=["inst", "date"], how="left")
    D["hl2"] = D.hl ** 2
    D["sig2"] = D.sig ** 2
    D["c_sig2"] = D.c_sig ** 2
    for c in ["sig2", "har1", "c_sig2", "garch_vt", "garch"]:
        D[f"{c}_h"] = D[c] * past_scale(D, c, "rv5")
        D[f"{c}_g"] = D[c] * past_scale(D, c, "hl2")
    return D


# ---------------------------------------------------------------- stop helpers
def stop_hits(D, s="b0", k=1.0, path="ba", scale=None):
    """Two-sided 1-sigma-style stop from the entry at bucket start s, held to 22:00. Returns (hit share 0/0.5/1,
    mean R long+short gross/net). path 'ba' = bid/ask (net), 'mid' = mid (gross)."""
    w = k * D.sig / 100 * (1.0 if scale is None else np.sqrt(D[scale]))
    if path == "ba":
        el, es = D[f"{s}_e_ask"], D[f"{s}_e_bid"]
        hl_ = D[f"{s}_lo_bid"] <= el * (1 - w)
        hs_ = D[f"{s}_hi_ask"] >= es * (1 + w)
        rl = np.where(hl_, -1.0, (D[f"{s}_x_bid"] / el - 1) / w)
        rs = np.where(hs_, -1.0, (1 - D[f"{s}_x_ask"] / es) / w)
    else:
        e = D[f"{s}_e_mid"]
        hl_ = D[f"{s}_lo_mid"] <= e * (1 - w)
        hs_ = D[f"{s}_hi_mid"] >= e * (1 + w)
        rl = np.where(hl_, -1.0, (D[f"{s}_x_mid"] / e - 1) / w)
        rs = np.where(hs_, -1.0, (1 - D[f"{s}_x_mid"] / e) / w)
    hit = 0.5 * (hl_.astype(float) + hs_.astype(float))
    hit[D[f"{s}_e_mid"].isna() | w.isna()] = np.nan
    r = 0.5 * (rl + rs)
    r[np.isnan(hit.to_numpy())] = np.nan
    return hit, pd.Series(r, index=D.index)


# ---------------------------------------------------------------- the sweep
def shuffle_within(D, col, seed):
    rng = np.random.default_rng(seed)
    out = D[col].copy()
    for _, ix in D.groupby("inst").groups.items():
        v = out.loc[ix].to_numpy()
        out.loc[ix] = v[rng.permutation(len(v))]
    return out


def sweep(D, bs, bsr, shuffle=False):
    """Every tested cell. Returns list of dict(family, split, level, value, lo, hi, p, n)."""
    D = D.copy()
    if shuffle:
        D["F5"] = shuffle_within(D, "F5", SEED)
        D["F1r"] = shuffle_within(D, "F1", SEED + 1)
    else:
        D["F1r"] = D.F1
    cells = []
    E = D[D.date >= "2017-01-01"].dropna(subset=["F1", "F5", "y_sess"])
    E = E.assign(q1=qrank(E, "F1r", "inst"), q5=qrank(E, "F5", "inst"))
    E["hit"], _ = stop_hits(E)
    rng = np.random.default_rng(SEED + 7)

    def e1(sub, y, b, rer=None):
        sub = sub.dropna(subset=[y])
        q = qrank(sub, "F1r", rer) if rer else sub.q1
        lo_, hi_ = sub[q == 0], sub[q == 4]
        return b.diff(lo_.date, lo_[y].to_numpy(float), hi_.date, hi_[y].to_numpy(float)), len(sub)

    def e2(sub, y, b, rer=None):
        sub = sub.dropna(subset=[y])
        q = qrank(sub, "F5", rer) if rer else sub.q5
        hi_, lo_ = sub[q == 4], sub[q == 0]
        return b.diff(hi_.date, hi_[y].to_numpy(float), lo_.date, lo_[y].to_numpy(float)), len(sub)

    def sg(sub, b, col="hit", rer=None):
        sub = sub.dropna(subset=[col])
        q = qrank(sub, "F5", rer) if rer else sub.q5
        u, o = sub[q >= 3], sub[q <= 1]
        return b.diff(u.date, u[col].to_numpy(float), o.date, o[col].to_numpy(float)), len(sub)

    def add(fam, split, level, res, rel=None):
        (v, lo, hi, p), n = res
        if not np.isfinite(p) or n < 200:
            return                                         # too few sessions (e.g. UK100 has no 00:00 entry): not a cell
        c = {"family": fam, "split": split, "level": level, "value": v, "lo": lo, "hi": hi, "p": p, "n": n}
        if rel is not None:
            c["rel"] = rel
        cells.append(c)

    # pooled, class, instrument (session horizon)
    for fam, f in (("E1", lambda s, b, r=None: e1(s, "y_sess", b, r)), ("E2", lambda s, b, r=None: e2(s, "y_sess", b, r)), ("SG", lambda s, b, r=None: sg(s, b, rer=r))):
        add(fam, "pooled", "all", f(E, bs))
        for k in CLASSES:
            add(fam, "class", k, f(E[E.klass == k], bs))
        for s_, g in E.groupby("inst"):
            add(fam, "instrument", s_, f(g, bs))
        for y in YEARS:
            add(fam, "year", y, f(E[E.year == y], bs, ["inst"]))
        for rg in ["calm", "turbulent"]:
            add(fam, "regime", rg, f(E[E.reg == rg], bsr, ["inst"]))
        if fam != "E1":                                   # E1 inside sigma terciles is the same variable twice: skipped
            for t in ["σ low third", "σ mid third", "σ high third"]:
                add(fam, "sigma tercile", t, f(E[E.sig_t == t], bs))
    # time of day: range within the bucket (E1, E2); stop from the bucket start, width 1 sigma x sqrt(past share left)
    for b_, nm in TOD.items():
        for fam, fn in (("E1", e1), ("E2", e2)):
            res = fn(E, f"y_{b_}", bs)
            add(fam, "time of day", nm, res, rel=res[0][0] / float(E[f"y_{b_}"].mean()))
        h, _ = stop_hits(E, b_, 1.0, "ba", f"rem_{b_}")
        add("SG", "time of day", nm, sg(E.assign(hb=h), bs, "hb"))
    # horizon
    for k, nm in HOR:
        if k == "sess":
            continue                                       # = the pooled cell above
        for fam, fn in (("E1", e1), ("E2", e2)):
            res = fn(E, f"y_{k}", bs)
            add(fam, "horizon", nm, res, rel=res[0][0] / float(E[f"y_{k}"].mean()))
    # QLIKE race: log-HAR vs plain sigma (2018 on) and vs chosen sigma (where chosen is scaled)
    Q = D.dropna(subset=["har1_h", "sig2_h", "har1_g", "sig2_g", "rv5"]).copy()
    Q = Q[Q.date >= "2018-01-01"]
    Q["qh"], Q["qs"] = ST_qlike(Q.rv5, Q.har1_h), ST_qlike(Q.rv5, Q.sig2_h)
    Q["gh"], Q["gs"] = ST_qlike(Q.hl2, Q.har1_g), ST_qlike(Q.hl2, Q.sig2_g)
    Qc = Q.dropna(subset=["c_sig2_h", "c_sig2_g"]).copy()
    Qc["qc"], Qc["gc"] = ST_qlike(Qc.rv5, Qc.c_sig2_h), ST_qlike(Qc.hl2, Qc.c_sig2_g)
    if shuffle:                                            # null: swap the two models' losses on a random half of rows
        for T, pairs in ((Q, [("qh", "qs"), ("gh", "gs")]), (Qc, [("qh", "qc"), ("gh", "gc")])):
            for a, b in pairs:
                m = rng.random(len(T)) < 0.5
                av, bv = T[a].to_numpy().copy(), T[b].to_numpy().copy()
                av[m], bv[m] = bv[m], av[m]
                T[a], T[b] = av, bv

    def ql(T, num, den, b):
        return b.ratio(T.date, T[num].to_numpy(float), T[den].to_numpy(float)), len(T)

    for fam, T, num, den in (("QL-plain-RV5", Q, "qh", "qs"), ("QL-plain-range", Q, "gh", "gs"),
                             ("QL-chosen-RV5", Qc, "qh", "qc"), ("QL-chosen-range", Qc, "gh", "gc")):
        add(fam, "pooled", "all", ql(T, num, den, bs))
        for k in CLASSES:
            add(fam, "class", k, ql(T[T.klass == k], num, den, bs))
        if fam in ("QL-plain-RV5", "QL-plain-range", "QL-chosen-RV5"):
            for s_, g in T.groupby("inst"):
                add(fam, "instrument", s_, ql(g, num, den, bs))
        for rg in ["calm", "turbulent"]:
            g = T[T.reg == rg]
            if len(g) > 200:
                add(fam, "regime", rg, ql(g, num, den, bsr))
        for t in ["σ low third", "σ mid third", "σ high third"]:
            add(fam, "sigma tercile", t, ql(T[T.sig_t == t], num, den, bs))
        for y in sorted(T.year.unique()):
            if (T.year == y).sum() > 2000:
                add(fam, "year", y, ql(T[T.year == y], num, den, bs))
    return cells


def ST_qlike(rv, h):
    z = rv / h
    return z - np.log(z) - 1


# ---------------------------------------------------------------- main
def main():
    t0 = time.time()
    D = load()
    print("loaded", len(D), f"{time.time() - t0:.0f}s", flush=True)
    assert D.date.max() <= END
    E0 = D[D.date >= "2017-01-01"].dropna(subset=["F1", "F5", "y_sess"])
    bs = Bs(E0.date.unique())
    # regime episodes and their length -> block length for regime cells
    ep = []
    for s_, g in D.groupby("inst"):
        z = (g.reg == "turbulent").to_numpy()
        st = np.flatnonzero(np.diff(np.r_[0, z.astype(int)]) == 1)
        en = np.flatnonzero(np.diff(np.r_[z.astype(int), 0]) == -1)
        for a, b in zip(st, en):
            ep.append({"inst": s_, "start": g.date.iloc[a], "end": g.date.iloc[b], "len": int(b - a + 1)})
    EP = pd.DataFrame(ep)
    L = int(max(5, np.median(EP.len))) if len(EP) else 20
    # cross-instrument episodes: a date is in a 'market episode' when >= 25% of instruments are turbulent
    share = D.groupby("date").reg.apply(lambda s: (s == "turbulent").sum() / max(1, s.notna().sum()))
    mz = (share >= 0.25).astype(int).to_numpy()
    mkt_ep = int((np.diff(np.r_[0, mz]) == 1).sum())
    print("regime: episodes", len(EP), "median len", L, "market episodes", mkt_ep, "turb share", float((D.reg == "turbulent").mean()), flush=True)
    bsr = Bs(E0.date.unique(), W=boot_weights(len(bs.dates), L))
    cells = sweep(D, bs, bsr)
    print("cells", len(cells), f"{time.time() - t0:.0f}s", flush=True)
    cells_sh = sweep(D, bs, bsr, shuffle=True)
    ps = np.array([c["p"] for c in cells])
    pas = bh(ps)
    for c, p_ in zip(cells, pas):
        c["bh"] = bool(p_)
    pas_sh = bh(np.array([c["p"] for c in cells_sh]))
    N, K, Ksh = len(cells), int(pas.sum()), int(pas_sh.sum())
    print("BH pass", K, "of", N, "shuffled pass", Ksh, flush=True)
    WIDE.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(cells).to_csv(WIDE / "cells.csv", index=False)
    pd.DataFrame(cells_sh).to_csv(WIDE / "cells_shuffled.csv", index=False)
    EP.to_csv(WIDE / "regime_episodes.csv", index=False)

    def cell(fam, split, level):
        for c in cells:
            if c["family"] == fam and c["split"] == split and c["level"] == level:
                return c
        return None

    def shc(fam, split, level):
        for c in cells_sh:
            if c["family"] == fam and c["split"] == split and c["level"] == level:
                return c
        return None

    def row(c, label=None, scale=1.0):
        return {"label": (label or c["level"]) + (" *" if c.get("bh") else ""), "value": r4(c["value"] * scale), "lo": r4(c["lo"] * scale), "hi": r4(c["hi"] * scale)}

    charts, num = [], {"episodes": len(EP), "episode_median_len": L, "market_episodes": mkt_ep}
    star = "* = passes Benjamini-Hochberg (q 0.10) across all %d cells." % N
    E = E0.assign(q1=qrank(E0, "F1", "inst"), q5=qrank(E0, "F5", "inst"))
    E["hit"], E["R_net"] = stop_hits(E)
    E["hit_mid"], E["R_gross"] = stop_hits(E, path="mid")

    # ---- 1 per instrument: error effect (E2) and over-reaction (E1)
    for fam, ttl, bench in (("E2", "Error effect per instrument: session range ÷ σ, top fifth of forecast error minus bottom fifth", "shuffled forecast error"),
                            ("E1", "Over-reaction per instrument: session range ÷ σ, lowest σ fifth minus highest σ fifth", "shuffled σ rank")):
        rows = sorted([row(c) for c in cells if c["family"] == fam and c["split"] == "instrument"], key=lambda r: r["value"])
        rows += [row(cell(fam, "pooled", "all"), "ALL 34 pooled"), row(shc(fam, "pooled", "all"), f"benchmark: {bench}")]
        npos = sum(1 for c in cells if c["family"] == fam and c["split"] == "instrument" and c["lo"] > 0)
        num[f"{fam}_inst_lo_above0"] = npos
        charts.append({"type": "bars", "title": ttl, "unit": "Δ (high-low ÷ σ)", "ref": 0,
                       "note": f"Within-instrument fifths, 2017-2022, 95% date-block bootstrap. Benchmark: 0 (σ alone would be flat) and the {bench} row. {npos} of 34 instruments have the whole interval above 0. {star}",
                       "rows": rows})
    # chosen sigma check for E2 (stage 1 Q3, discovery look only)
    Cx = E.dropna(subset=["c_sig"]).copy()
    Cx["y_c"] = Cx.hl / Cx.c_sig
    Cx["q5c"] = qrank(Cx, "F5", "inst")
    a, b_ = Cx[Cx.q5c == 4], Cx[Cx.q5c == 0]
    v = bs.diff(a.date, a.y_c.to_numpy(float), b_.date, b_.y_c.to_numpy(float))
    num["E2_chosen"] = [r4(z) for z in v]
    charts[0]["rows"].insert(-1, {"label": f"pooled, range ÷ chosen σ ({Cx.date.min()[:7]} on)", "value": r4(v[0]), "lo": r4(v[1]), "hi": r4(v[2])})

    # ---- 2 by class
    grp = []
    for k in ["pooled"] + CLASSES:
        lv = "all" if k == "pooled" else k
        sp = "pooled" if k == "pooled" else "class"
        c1, c2 = cell("E1", sp, lv), cell("E2", sp, lv)
        grp.append({"label": ("all 34" if k == "pooled" else CNAME[k]) + (" *" if c1["bh"] and c2["bh"] else ""), "values": [r4(c1["value"], 3), r4(c2["value"], 3)]})
    s1, s2 = shc("E1", "pooled", "all"), shc("E2", "pooled", "all")
    grp.append({"label": "benchmark: shuffled", "values": [r4(s1["value"], 3), r4(s2["value"], 3)]})
    num["class"] = grp
    charts.append({"type": "groups", "title": "By class: over-reaction and error effect, session range ÷ σ", "names": ["over-reaction (low σ fifth − high)", "error effect (high F5 fifth − low)"], "unit": "Δ (high-low ÷ σ)",
                   "note": f"Within-instrument fifths, 2017-2022. Benchmark: 0 and the shuffled row. * = both cells pass BH. Intervals are in cells.csv. Gold is one instrument; indices are six.",
                   "rows": grp})

    # ---- 3 time of day
    grp = []
    for b_, nm in TOD.items():
        c1, c2 = cell("E1", "time of day", nm), cell("E2", "time of day", nm)
        grp.append({"label": nm + (" *" if c1["bh"] and c2["bh"] else ""), "values": [r4(c1["rel"] * 100, 1), r4(c2["rel"] * 100, 1)]})
    grp.append({"label": "whole session 00-22", "values": [r4(cell("E1", "pooled", "all")["value"] / float(E.y_sess.mean()) * 100, 1), r4(cell("E2", "pooled", "all")["value"] / float(E.y_sess.mean()) * 100, 1)]})
    grp.append({"label": "benchmark: shuffled (session)", "values": [r4(s1["value"] / float(E.y_sess.mean()) * 100, 1), r4(s2["value"] / float(E.y_sess.mean()) * 100, 1)]})
    num["tod"] = grp
    charts.append({"type": "groups", "title": "Time of day: the two effects on the range inside each London bucket", "names": ["over-reaction", "error effect"], "unit": "% of the bucket's mean range",
                   "note": "Range from the bucket's first bar to its end (London time, DST-aware), ÷ σ; effect as % of that bucket's mean so buckets of different length compare. Benchmark: 0 and the shuffled row. * = both pass BH.",
                   "rows": grp})

    # ---- 4 horizon
    grp = []
    for k, nm in HOR:
        if k == "sess":
            c1, c2 = cell("E1", "pooled", "all"), cell("E2", "pooled", "all")
            r1, r2 = c1["value"] / float(E.y_sess.mean()), c2["value"] / float(E.y_sess.mean())
        else:
            c1, c2 = cell("E1", "horizon", nm), cell("E2", "horizon", nm)
            r1, r2 = c1["rel"], c2["rel"]
        grp.append({"label": nm + (" *" if c1["bh"] and c2["bh"] else ""), "values": [r4(r1 * 100, 1), r4(r2 * 100, 1)]})
    num["horizon"] = grp
    charts.append({"type": "groups", "title": "Horizon: the two effects from 15 minutes to 5 sessions", "names": ["over-reaction", "error effect"], "unit": "% of the horizon's mean range",
                   "note": "15m/1h/4h = range from the 00:00 London open; next session = range of t+1 ÷ σ of t; 5 sessions = high-low over t..t+4 ÷ σ of t. Fields are fixed at the open of t. Benchmark: 0 (shuffled session values are in the time-of-day chart). * = both pass BH.",
                   "rows": grp})

    # ---- 5 regime and sigma terciles
    grp = []
    for sp, lv in [("regime", "calm"), ("regime", "turbulent"), ("sigma tercile", "σ low third"), ("sigma tercile", "σ mid third"), ("sigma tercile", "σ high third")]:
        c1, c2, c3 = cell("E1", sp, lv), cell("E2", sp, lv), cell("SG", sp, lv)
        n_ = c2["n"]
        lab = f"{lv} ({n_:,} sessions)"
        grp.append({"label": lab, "values": [None if c1 is None else r4(c1["value"], 3), r4(c2["value"], 3), r4(c3["value"] * 10, 3)]})
    num["regime"] = grp
    charts.append({"type": "groups", "title": "Vol regime (C.OG Lesson 05) and σ terciles", "names": ["over-reaction (σ)", "error effect (σ)", "stop gap (×10, hit-rate points ÷ 10)"], "unit": "Δ (see names)",
                   "note": f"Turbulent = past-only 63-session vol above 1.25× its past median for 21+ sessions. {len(EP)} turbulent episodes across 34 instruments (median {L} sessions), but only {mkt_ep} market-wide episodes (≥25% of instruments at once): that is the real sample. Regime cells are bootstrapped in blocks of {L} sessions and re-ranked within regime. Over-reaction inside σ terciles is skipped (same variable). Benchmark: 0.",
                   "rows": grp})

    # ---- 6 year by year
    grp = []
    for y in YEARS:
        c1, c2, c3 = cell("E1", "year", y), cell("E2", "year", y), cell("SG", "year", y)
        grp.append({"label": y, "values": [r4(c1["value"], 3), r4(c2["value"], 3), r4(c3["value"] * 10, 3)]})
    num["year"] = grp
    charts.append({"type": "groups", "title": "Year by year, 2017-2022: over-reaction, error effect, stop gap", "names": ["over-reaction (σ)", "error effect (σ)", "stop gap (×10)"], "unit": "Δ (see names)",
                   "note": "Fifths re-ranked within instrument-year, so a calm year is not just 'low σ'. Stop gap = 1σ stop hit rate (bid/ask) after under-forecasts minus after over-forecasts, ×10 to share the axis (0.5 = 5 points). Benchmark: 0. Intervals in cells.csv.",
                   "rows": grp})

    # ---- 7 calibration: is over-reaction sigma-only? range ÷ forecast by decile of the forecast
    Cq = D[D.date >= "2018-01-01"].dropna(subset=["sig2_g", "har1_g", "garch_vt_g", "hl"]).copy()
    ser = []
    for c, nm in (("sig2", "live σ"), ("har1", "log-HAR on RV5"), ("garch_vt", "GARCH(1,1) var-targeted")):
        Cq["rr"] = Cq.hl / np.sqrt(Cq[f"{c}_g"])
        Cq["dd"] = qrank(Cq, c, "inst", 10)
        m = Cq.groupby("dd").rr.mean()
        ser.append({"name": nm, "points": [[int(k) + 1, r4(v, 3)] for k, v in m.items()]})
        num[f"cal_{c}"] = [r4(v, 3) for v in m]
    ser.append({"name": "perfectly scaled (flat)", "points": [[1, 1.0], [10, 1.0]]})
    charts.append({"type": "lines", "title": "Is the over-reaction a σ flaw? Range ÷ forecast by decile of each forecast", "unit": "high-low ÷ forecast range", "xlabel": "decile of the forecast (within instrument)",
                   "note": "Each forecast is put on the range scale with a past-only expanding mean of range² ÷ forecast², 2018-2022, 34 instruments. A well-scaled forecast is flat at 1 (benchmark). A falling line = too high when high, too low when low.",
                   "series": ser})

    # ---- 8 QLIKE race by condition
    grp = []
    for sp, lv, lab in ([("pooled", "all", "all")] + [("class", k, CNAME[k]) for k in CLASSES] + [("regime", "calm", "calm"), ("regime", "turbulent", "turbulent")]
                        + [("sigma tercile", t, t) for t in ["σ low third", "σ mid third", "σ high third"]] + [("year", y, y) for y in ["2018", "2019", "2020", "2021", "2022"]]):
        vals = []
        for fam in ("QL-plain-RV5", "QL-plain-range", "QL-chosen-RV5"):
            c = cell(fam, sp, lv)
            vals.append(None if c is None else r4(c["value"], 3))
        grp.append({"label": lab, "values": vals})
    num["qlike"] = grp
    cc = cell("QL-chosen-range", "pooled", "all")
    num["qlike_chosen_range_pooled"] = [r4(cc["value"]), r4(cc["lo"]), r4(cc["hi"])]
    charts.append({"type": "groups", "title": "log-HAR vs the live σ and the chosen σ, by condition: QLIKE ratio", "names": ["÷ plain σ, RV5 yardstick", "÷ plain σ, range² yardstick", "÷ chosen σ, RV5 yardstick"], "unit": "QLIKE ÷ benchmark",
                   "note": f"Below 1 = log-HAR forecasts that cell's session variance better. Benchmark: 1. Chosen σ exists from 2020-08 (scaled from ~2020-11), so its column is 2020-11 to 2022 only; empty = not enough rows. On the range² yardstick vs chosen σ, pooled: {cc['value']:.3f} [{cc['lo']:.3f}, {cc['hi']:.3f}]. HAR has home advantage on RV5.",
                   "rows": grp})

    # ---- 9 per instrument: HAR vs chosen
    grp = []
    for s_ in sorted(D.inst.unique()):
        a1, a2, a3 = cell("QL-plain-RV5", "instrument", s_), cell("QL-plain-range", "instrument", s_), cell("QL-chosen-RV5", "instrument", s_)
        grp.append({"label": s_ + (" *" if a3 and a3["bh"] else ""), "values": [r4(a1["value"], 3), r4(a2["value"], 3), None if a3 is None else r4(a3["value"], 3)]})
    grp.sort(key=lambda r: r["values"][2] if r["values"][2] is not None else 9)
    n_lose = sum(1 for c in cells if c["family"] == "QL-chosen-RV5" and c["split"] == "instrument" and c["value"] >= 1)
    n_lose_g = sum(1 for c in cells if c["family"] == "QL-plain-range" and c["split"] == "instrument" and c["value"] >= 1)
    num["har_inst_lose_chosen"] = n_lose
    charts.append({"type": "groups", "title": "Per instrument: log-HAR loss ÷ plain σ and ÷ chosen σ", "names": ["÷ plain σ, RV5", "÷ plain σ, range²", "÷ chosen σ, RV5 (2020-11 on)"], "unit": "QLIKE ÷ benchmark",
                   "note": f"Benchmark: 1. Sorted by the chosen-σ column. HAR is worse than the chosen σ on {n_lose} of 34 instruments, and worse than plain σ on the range² yardstick on {n_lose_g}. * = the chosen-σ cell passes BH.",
                   "rows": grp})

    # ---- 10 GARCH half-life
    fits = json.loads((ST.OUT / "fits.json").read_text(encoding="utf-8"))
    grp, hl_all = [], {}
    lags = np.arange(1, 251)
    for s_ in sorted(fits):
        fs = [f for f in fits[s_] if f.get("garch")]
        if not fs:
            continue
        hl = [np.log(0.5) / np.log(f["garch"][1] + f["garch"][2]) for f in fs]
        hv = [np.log(0.5) / np.log(f["garch_vt"][1] + f["garch_vt"][2]) for f in fs]
        x = D.loc[D.inst == s_, "lrv"].to_numpy(float)
        x = x - x.mean()
        v0 = np.mean(x * x)
        ac = np.array([np.mean(x[k:] * x[:-k]) / v0 for k in lags])
        j = np.flatnonzero(ac < 0.5)
        ach = float(lags[j[0]]) if len(j) else np.nan
        hl_all[s_] = {"garch_last": r4(hl[-1], 1), "garch_median": r4(np.median(hl), 1), "garch_vt_last": r4(hv[-1], 1), "acf_half": ach,
                      "ab_last": r4(fs[-1]["garch"][1] + fs[-1]["garch"][2], 4)}
        grp.append({"label": s_, "values": [r4(hl[-1], 1), r4(np.median(hl), 1), ach]})
    grp.sort(key=lambda r: r["values"][1])
    med_g = float(np.median([v["garch_median"] for v in hl_all.values()]))
    med_a = float(np.nanmedian([v["acf_half"] for v in hl_all.values()]))
    num["halflife"] = hl_all
    num["halflife_median"] = {"garch": med_g, "acf": med_a}
    charts.append({"type": "groups", "title": "GARCH persistence as a half-life: h = ln 0.5 ÷ ln(α+β), per instrument", "names": ["GARCH, last fit (Q4 2022)", "GARCH, median of quarterly fits", "benchmark: realised log RV5, ACF half-life"], "unit": "sessions",
                   "note": f"C.OG Lesson 03. GARCH(1,1) by Gaussian MLE on NY-close daily returns, refitted each quarter on all earlier data. Median across instruments: GARCH {med_g:.0f} sessions vs realised {med_a:.0f} sessions (lag where the autocorrelation of log RV5 first drops below 0.5). The F5 error EWMA uses 10 sessions.",
                   "rows": grp})

    # ---- 11 stop gap by class / time of day (bid/ask vs mid)
    grp = []
    E_tmp = E.copy()
    for sp, lv, lab in ([("pooled", "all", "all, 00:00 entry")] + [("class", k, CNAME[k]) for k in CLASSES] + [("time of day", nm, "entry " + nm) for nm in TOD.values()]):
        c = cell("SG", sp, lv)
        if sp == "time of day":
            b_ = [k for k, v in TOD.items() if v == lv][0]
            hm, _ = stop_hits(E_tmp, b_, 1.0, "mid", f"rem_{b_}")
            sub = E_tmp.assign(hm=hm).dropna(subset=["hm"])
        else:
            sub = E_tmp if sp == "pooled" else E_tmp[E_tmp.klass == lv]
            sub = sub.assign(hm=sub.hit_mid)
        u, o = sub[sub.q5 >= 3], sub[sub.q5 <= 1]
        gm = float(u.hm.mean() - o.hm.mean())
        grp.append({"label": lab + (" *" if c["bh"] else ""), "values": [r4(c["value"] * 100, 2), r4(gm * 100, 2)]})
    sgs = shc("SG", "pooled", "all")
    grp.append({"label": "benchmark: shuffled F5", "values": [r4(sgs["value"] * 100, 2), None]})
    num["sg"] = grp
    charts.append({"type": "groups", "title": "Stop gap: 1σ stop hit rate after under-forecasts minus after over-forecasts", "names": ["bid/ask path (net)", "mid path (gross)"], "unit": "percentage points",
                   "note": "Two-sided stop 1σ from the entry, held to 22:00. Bid/ask: a long fills at the offer and is stopped when the bid trades through; a short the reverse. Later entries use 1σ × √(past share of the day's variance still to come). Under = F5 top two fifths, over = bottom two. Benchmark: shuffled F5 and the mid path. * = BH pass.",
                   "rows": grp})

    # ---- 12 plateau: stop width sweep (bid/ask)
    ks = [0.5, 0.75, 1.0, 1.25, 1.5]
    ser = {"under-forecast (F5 top two fifths)": [], "over-forecast (bottom two)": [], "all sessions (σ alone)": [], "gap × 5": []}
    pl = []
    for k in ks:
        h, rn = stop_hits(E, "b0", k, "ba")
        _, rg = stop_hits(E, "b0", k, "mid")
        u, o = h[E.q5 >= 3].mean(), h[E.q5 <= 1].mean()
        ser["under-forecast (F5 top two fifths)"].append([k, r4(u, 3)])
        ser["over-forecast (bottom two)"].append([k, r4(o, 3)])
        ser["all sessions (σ alone)"].append([k, r4(h.mean(), 3)])
        ser["gap × 5"].append([k, r4((u - o) * 5, 3)])
        pl.append({"k": k, "under": r4(u), "over": r4(o), "all": r4(h.mean()), "R_net_under": r4(rn[E.q5 >= 3].mean()), "R_net_over": r4(rn[E.q5 <= 1].mean()),
                   "R_gross_under": r4(rg[E.q5 >= 3].mean()), "R_gross_over": r4(rg[E.q5 <= 1].mean())})
    num["stop_sweep"] = pl
    sp_ = float(np.nanmedian((E.b0_e_ask - E.b0_e_bid) / E.b0_e_mid * 100 / E.sig))
    num["spread_sigma_00"] = r4(sp_)
    p1 = [z for z in pl if z["k"] == 1.0][0]
    charts.append({"type": "lines", "title": "Plateau check 1: the stop gap across stop widths (bid/ask path)", "unit": "share of sessions stopped", "xlabel": "stop width (live σ from the 00:00 entry)",
                   "note": f"Neighbouring widths, not just 1σ. A gap that holds across widths is a plateau. Benchmark: all sessions (what σ alone implies). Median spread at 00:00 = {sp_:.3f}σ. Mean R at 1σ (stop or 22:00 exit, long+short): net {p1['R_net_under']:+.3f} under / {p1['R_net_over']:+.3f} over; gross {p1['R_gross_under']:+.3f} / {p1['R_gross_over']:+.3f}.",
                   "series": [{"name": k, "points": v} for k, v in ser.items()]})

    # ---- 13 plateau: F5 half-life and split
    hls = [3, 5, 7, 10, 14, 20, 30, 45]
    ser = {"fifths": [], "deciles (top − bottom)": [], "terciles": []}
    pv = []
    for h in hls:
        lam = 0.5 ** (1 / h)
        e = E0.copy()
        full = D[["inst", "date", "e_raw"]].copy()
        full["f"] = full.groupby("inst").e_raw.transform(lambda s: s.ewm(alpha=1 - lam, adjust=True).mean().shift(1) - s.expanding(20).mean().shift(1))
        e = e.drop(columns=["F5"]).merge(full[["inst", "date", "f"]].rename(columns={"f": "F5"}), on=["inst", "date"])
        for nm, q in (("fifths", 5), ("deciles (top − bottom)", 10), ("terciles", 3)):
            qq = qrank(e, "F5", "inst", q)
            a, b_ = e[qq == q - 1], e[qq == 0]
            v = bs.diff(a.date, a.y_sess.to_numpy(float), b_.date, b_.y_sess.to_numpy(float))
            ser[nm].append([h, r4(v[0], 3)])
            if nm == "fifths":
                pv.append({"hl": h, "v": r4(v[0]), "lo": r4(v[1]), "hi": r4(v[2])})
    num["plateau_hl"] = pv
    ser["benchmark: shuffled"] = [[hls[0], r4(s2["value"], 3)], [hls[-1], r4(s2["value"], 3)]]
    charts.append({"type": "lines", "title": "Plateau check 2: error effect across EWMA half-lives and splits", "unit": "Δ (high-low ÷ σ)", "xlabel": "half-life of the error EWMA (sessions; stage 2 used 10)",
                   "note": f"Top minus bottom group of F5 rebuilt at each half-life. A flat run = plateau; a spike at 10 = a tuned peak. Benchmark: shuffled F5 at {s2['value']:+.3f}. Fifths: {pv[0]['v']:+.3f} at {hls[0]} sessions, {pv[3]['v']:+.3f} at 10, {pv[-1]['v']:+.3f} at {hls[-1]}.",
                   "series": [{"name": k, "points": v} for k, v in ser.items()]})

    # ---- 14 Lesson 01: inputs delayed by more sessions
    lags_ = [0, 1, 2, 3, 5, 10]
    base = {}
    lagres = {"over-reaction": [], "error effect": [], "stop gap": []}
    raw = []
    for k in lags_:
        e = D[D.date >= "2017-01-01"].copy()
        g = e.groupby("inst")
        e["sl"] = g.sig.shift(k)
        e["f5l"] = g.F5.shift(k)
        e = e.dropna(subset=["sl", "f5l", "hl", "F1"])
        e["yl"] = e.hl / e.sl
        q1 = qrank(e, "sl", "inst")
        q5 = qrank(e, "f5l", "inst")
        a, b_ = e[q1 == 0], e[q1 == 4]
        v1 = bs.diff(a.date, a.yl.to_numpy(float), b_.date, b_.yl.to_numpy(float))
        a, b_ = e[q5 == 4], e[q5 == 0]
        v2 = bs.diff(a.date, a.hl_s.to_numpy(float), b_.date, b_.hl_s.to_numpy(float))
        hh, _ = stop_hits(e)
        e["hh"] = hh
        a, b_ = e[(q5 >= 3) & e.hh.notna()], e[(q5 <= 1) & e.hh.notna()]
        v3 = bs.diff(a.date, a.hh.to_numpy(float), b_.date, b_.hh.to_numpy(float))
        raw.append({"lag": k, "E1": [r4(z) for z in v1], "E2": [r4(z) for z in v2], "SG": [r4(z) for z in v3]})
        for nm, v in (("over-reaction", v1), ("error effect", v2), ("stop gap", v3)):
            base.setdefault(nm, v[0])
            lagres[nm].append([k, r4(v[0] / base[nm], 3)])
    num["lag"] = raw
    r0, r1 = raw[0], raw[1]
    charts.append({"type": "lines", "title": "Lesson 01 check: every input delayed by more sessions", "unit": "share of the lag-0 effect", "xlabel": "extra delay (sessions)",
                   "note": f"σ, F5 and their fifths taken k sessions earlier; the outcome stays session t. 1 = as strong as with today's inputs; 0 = gone (benchmark). At +1: over-reaction {r1['E1'][0]:+.3f}σ [{r1['E1'][1]:+.3f}, {r1['E1'][2]:+.3f}] vs {r0['E1'][0]:+.3f} at 0; error effect {r1['E2'][0]:+.3f} [{r1['E2'][1]:+.3f}, {r1['E2'][2]:+.3f}] vs {r0['E2'][0]:+.3f}; stop gap {r1['SG'][0] * 100:+.1f} pts vs {r0['SG'][0] * 100:+.1f}. Over-reaction GROWS with delay (a staler σ is a noisier ranker); the error effect and stop gap fade to 0 by +5: they live in the last few sessions' misses.",
                   "series": [{"name": k, "points": v} for k, v in lagres.items()]})

    # ---- 15 real examples: GBPUSD 2022, bid/ask path from a long at the 00:00 offer
    rng = np.random.default_rng(SEED)
    ex = E[(E.inst == "GBPUSD") & (E.year == "2022")].dropna(subset=["b0_e_ask"])
    picks = [("under", ex[ex.q5 == 4]), ("over", ex[ex.q5 == 0])]
    df = pd.read_parquet(ST.BA / "gbpusd_m1.parquet", columns=["time", "bid_l", "bid_c", "ask_o"])
    t = pd.DatetimeIndex(pd.to_datetime(df.time, utc=True))
    keep = np.asarray((t >= pd.Timestamp("2022-01-01", tz="UTC")) & (t < (pd.Timestamp(END) + pd.Timedelta(days=1)).tz_localize(ST.LON).tz_convert("UTC")))
    df, t = df[keep], t[keep]
    loc = t.tz_convert(ST.LON).tz_localize(None)
    dstr = np.asarray(loc.strftime("%Y-%m-%d"))
    mins = (loc.hour * 60 + loc.minute).to_numpy()
    trades = []
    for lab, g in picks:
        for i in rng.choice(len(g), size=4, replace=False):
            r = g.iloc[i]
            m = (dstr == r.date) & (mins < 1320)
            bl, bc, tm = df.bid_l.to_numpy()[m], df.bid_c.to_numpy()[m], mins[m]
            ent = r.b0_e_ask
            w = r.sig / 100 * ent
            yb = (bl - ent) / w
            hit = np.flatnonzero(yb <= -1)
            end = hit[0] + 1 if len(hit) else len(yb)
            rr = -1.0 if len(hit) else float((bc[-1] - ent) / w)
            path = [[int(a), round(float(b), 3)] for a, b in zip(tm[:end:5], yb[:end:5])]
            trades.append({"inst": "GBPUSD", "date": r.date, "side": f"long; recent {lab}-forecast (F5 {r.F5:+.2f}), σ {r.sig:.2f}%",
                           "r": round(rr, 2), "unit": "R net (bid exit)", "stop": -1.0, "target": 1.0, "path": path})
    trades.sort(key=lambda z: z["date"])
    del df
    charts.append({"type": "trades", "title": "Real GBPUSD sessions, 2022: long at the 00:00 offer, path of the bid in σ", "unit": "σ from the entry (bid)",
                   "note": f"Four sessions after under-forecasts (F5 top fifth) and four after over-forecasts (bottom fifth), seeded pick. Stop line at −1σ (path ends at the stop); +1σ drawn for scale. R is net: entry at the offer, exit at the bid. Benchmark: across all 2017-2022 sessions a 1σ stop is hit {float(E.hit.mean()) * 100:.1f}% of the time (bid/ask).",
                   "trades": trades})

    # ---- intro / holds (text written after reading numbers.json; see intro.json)
    num["N"], num["K"], num["K_shuffled"] = N, K, Ksh
    num["raw_p05"] = int((ps < 0.05).sum())
    num["fam_pass"] = {f: f"{sum(1 for c in cells if c['family'] == f and c['bh'])}/{sum(1 for c in cells if c['family'] == f)}" for f in sorted({c['family'] for c in cells})}
    (WIDE / "numbers.json").write_text(json.dumps(num, indent=1, ensure_ascii=False, default=lambda o: o.item() if hasattr(o, "item") else str(o)), encoding="utf-8")
    ip = WIDE / "intro.json"
    txt = json.loads(ip.read_text(encoding="utf-8")) if ip.exists() else {"intro": ["(intro not written yet)"], "holds": []}
    res = {"id": "state-wide", "window": [START, END], "cells_tested": N, "cells_pass_bh": K, "cells_expected_by_chance": Ksh,
           "chance_note": f"Whole sweep re-run with F1/F5 shuffled within instrument and model losses randomly swapped: {Ksh} cells pass BH. Raw p < 0.05 in the real sweep: {num['raw_p05']} (5% of {N} = {0.05 * N:.0f}).",
           "intro": txt["intro"], "holds": txt["holds"], "charts": charts}
    s = json.dumps(res, ensure_ascii=False, default=lambda o: o.item() if hasattr(o, "item") else str(o))
    (ST.WEB / "state-wide.json").write_text(s, encoding="utf-8")
    print("charts", len(charts), "bytes", len(s), f"{time.time() - t0:.0f}s")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "m1":
        build_m1()
    else:
        main()
