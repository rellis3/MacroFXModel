"""Vol-Layer layer 5 (meta-labelling), stage 3: GO WIDE. Exploratory, not pre-registered; no verdict words.

Stage 2 (scripts/vol-layer-deep/meta.py) built 60,211 first touches of the open +/- 0.5 sigma line (34 instruments,
2016-10-24 .. 2022-12-30) and found: the hit rate is barrier geometry b/(a+b); geometry alone gives AUC 0.69 on a random
walk; a purged logistic gets AUC 0.573 on real labels vs 0.568 on random-walk labels; every quintile loses after one
spread; design effect 3.5. This script asks whether ANY condition breaks that.

  Q1  Across barrier geometries (stop b = 0.25/0.5/1/2 sigma, target/stop ratio 0.5/1/2/3, horizons 15m/1h/2h/4h/to 21:00,
      fade and follow = 160 shape-sides) and conditions (pooled, class, London time bucket, C.OG Lesson 05 regime, sigma
      tercile, year, instrument): is the meta-model's AUC on REAL labels above the same model's AUC on RANDOM-WALK labels
      drawn at each touch's own realised variance (same barriers, same clock)? Clustered (20-session date block) DeLong
      on the paired difference; Benjamini-Hochberg q = 0.10 over every cell. Chance count = a placebo run where a second
      random-walk draw plays "real".
  Q2  Vol-state features one at a time on top of geometry (logit of the geometry P + class): sigma level (F1), sigma vs
      its long-run level (F3, the over-reaction field), expected change (F2), P(high vol) (F4), forecast error (F5),
      vol so far today, yesterday's dollar share (USD majors), yesterday's jump share, a jump earlier today.
      Increment on real labels minus increment on random-walk labels.
  Q3  C.OG Lesson 06: judge the filter (keep the top half by out-of-fold P) by the book's Sharpe and effective bets,
      net of one spread (touches measured on the M1 bid/ask path: buys fill at the offer, sells at the bid).
      Benchmarks: unfiltered book and a seeded random half.
  Q4  Rule A's own trades (backtest-data/line-backtest, registered stop 0.2 sigma / target 5R / 2x spread table),
      discovery window only (2020-08-24 .. 2022-12-30): can a meta-model sort them? Benchmarks: shuffled labels,
      entry-time only, a random half.
  Lesson 01: features delayed one more session (+1 lag) and the neighbouring-geometry plateau.

DISCOVERY WINDOW ONLY: sessions 2016-10-24 .. 2022-12-30 (asserted; M1 read with a time filter before 2022-12-31 UTC).
    python -X utf8 scripts/vol-layer-deep/meta_wide.py            # build grid if missing, then analyse
    python -X utf8 scripts/vol-layer-deep/meta_wide.py --rebuild  # rebuild the per-instrument grid from M1
Writes analysis/output/vol-layer-deep/meta/wide/{grid_<SYM>.parquet, cells.parquet, numbers.json}
       backtest-data/vol-layer/meta-wide.json
"""
from __future__ import annotations

import gzip
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "scripts/forecast_history"), str(ROOT / "scripts/vol-layer-deep")]
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from scipy.stats import norm, rankdata  # noqa: E402
from sklearn.linear_model import LogisticRegression  # noqa: E402
from joblib import Parallel, delayed  # noqa: E402

import line_reaction as LR  # noqa: E402
import meta as M  # noqa: E402  (stage 2 loaders: strip_exit, purged CV pieces, BA_KEY, FEATS)

OUT = ROOT / "analysis/output/vol-layer-deep/meta/wide"
SRC = ROOT / "analysis/output/vol-layer-deep/meta"
WEB = ROOT / "backtest-data/vol-layer"
STATE = ROOT / "analysis/output/vol-layer-deep/state/sessions.parquet"
DOLLAR = ROOT / "analysis/output/vol-layer-deep/features/days.parquet"
RULEA = ROOT / "backtest-data/line-backtest"
START, END = "2016-10-24", "2022-12-30"
SEED = 20261112
STOPS = [0.25, 0.5, 1.0, 2.0]
RATIOS = [0.5, 1.0, 2.0, 3.0]
HORIZ = [("15m", 15), ("1h", 60), ("2h", 120), ("4h", 240), ("to 21:00", None)]
LEVELS = sorted({round(b * r, 4) for b in STOPS for r in RATIOS} | set(STOPS))
SIDES = ("fade", "follow")
CLOSE = 21 * 60
TOD = [("Asia 00-07", 0, 420), ("London open 07-10", 420, 600), ("London mid 10-13", 600, 780),
       ("Overlap 13-16", 780, 960), ("NY afternoon 16-22", 960, 1320)]
HEAD = [("1:1 0.25σ, 2h", 0.25, 1.0, "2h", "fade"), ("2:1 0.5/0.25σ, to 21:00", 0.25, 2.0, "to 21:00", "fade")]
BLOCK = 20
NOTERM = 10 ** 6
NJOBS = 3                                # parallel logistic fits (memory: ~0.4 GB each)
Q2_H = ("1h", "2h", "to 21:00")            # feature sweep horizons (15m/4h skipped to bound the fit count)


def shapes():
    out = []
    for hn, H in HORIZ:
        for b in STOPS:
            for r in RATIOS:
                out.append((f"b{b:g} x{r:g} {hn}", round(b * r, 4), b, hn, H))
    return out


SHAPES = shapes()


# ── build: first-touch minute of every barrier level on mid and bid/ask paths ─────────────────────────────────────

def build_inst(sym, ev):
    key = M.BA_KEY.get(sym, sym.lower())
    df = pd.read_parquet(M.BA / f"{key}_m1.parquet", columns=["time", "high", "low", "close", "bid_h", "bid_l", "bid_c", "ask_h", "ask_l", "ask_c"],
                         filters=[("time", ">=", pd.Timestamp("2016-10-23")), ("time", "<", pd.Timestamp("2022-12-31"))])
    idx = pd.DatetimeIndex(pd.to_datetime(df["time"], utc=True)).tz_convert("Europe/London").tz_localize(None)
    codes, uniq = pd.factorize(idx.normalize())
    df["date"] = np.asarray(uniq.strftime("%Y-%m-%d"))[codes]
    df["m"] = idx.hour * 60 + idx.minute
    df = df[(df.date >= START) & (df.date <= END) & (df.m < 22 * 60)]
    assert df.date.max() <= END, "discovery window breached"
    bad = ~((df.ask_c > df.bid_c) & np.isfinite(df.bid_c) & np.isfinite(df.ask_c))
    nbad = int(bad.sum())
    if nbad:                                   # fall back to mid +/- the median half spread (counted)
        hs = float(((df.ask_c - df.bid_c) / df.close)[~bad].median()) / 2
        for c_, s_ in (("bid_h", -1), ("bid_l", -1), ("bid_c", -1), ("ask_h", 1), ("ask_l", 1), ("ask_c", 1)):
            base = df["high" if c_.endswith("_h") else "low" if c_.endswith("_l") else "close"]
            df.loc[bad, c_] = base[bad] * (1 + s_ * hs)
    groups = {d: g for d, g in df.groupby("date", sort=False)}
    rows = []
    for r in ev.itertuples():
        g = groups.get(r.date)
        if g is None:
            continue
        g = g.sort_values("m")
        m = g.m.to_numpy()
        i = int(np.searchsorted(m, r.minute))
        if i >= len(m) or m[i] != r.minute:
            continue
        s = r.sig
        L = lambda c: np.log(g[c].to_numpy())  # noqa: E731
        hi, lo, c = L("high"), L("low"), L("close")
        bh, bl, bc, ah, al, ac = L("bid_h"), L("bid_l"), L("bid_c"), L("ask_h"), L("ask_l"), L("ask_c")
        J = int(np.searchsorted(m, CLOSE, side="right"))
        fm = m[i + 1:J]
        e, eb, ea = c[i], bc[i], ac[i]
        sgn = 1 if r.dir == "up" else -1
        rec = {"inst": sym, "date": r.date, "dir": r.dir, "minute": int(r.minute)}
        # cumulative excursions (sigma): mid up/down; long fav/adv on bid/ask (buy at ask); short fav/adv (sell at bid)
        paths = {"mu": (hi[i + 1:J] - e) / s, "md": (e - lo[i + 1:J]) / s,
                 "lf": (bh[i + 1:J] - ea) / s, "la": (ea - bl[i + 1:J]) / s,
                 "sf": (eb - al[i + 1:J]) / s, "sa": (ah[i + 1:J] - eb) / s}
        for k_, x in paths.items():
            cm = np.maximum.accumulate(x) if len(x) else x
            pos = np.searchsorted(cm, np.array(LEVELS) - 1e-12, side="left")
            for lv, p in zip(LEVELS, pos):
                rec[f"{k_}{lv:g}"] = int(fm[p]) if p < len(fm) else NOTERM
        # time-out marks per horizon: mid move (with the touch direction = up-signed), long and short net exits
        c5 = pd.Series(c, index=m // 5).groupby(level=0).last()
        r5 = c5.diff().dropna()
        day5 = np.zeros(22 * 12 + 1)
        day5[r5.index.to_numpy() + 1] = (r5.to_numpy() / s) ** 2
        cum5 = np.cumsum(day5)
        for hn, H in HORIZ:
            end_m = CLOSE if H is None else min(r.minute + H, CLOSE)
            j = int(np.searchsorted(m, end_m, side="right"))
            jj = max(j - 1, i)
            rec[f"end_{hn}"] = end_m
            rec[f"mid_{hn}"] = (c[jj] - e) / s
            rec[f"lnet_{hn}"] = (bc[jj] - ea) / s
            rec[f"snet_{hn}"] = (eb - ac[jj]) / s
            rec[f"rv_{hn}"] = cum5[end_m // 5] - cum5[r.minute // 5]
        # a jump earlier today: biggest 1-min |return| before the touch, in units of sigma/sqrt(1320)
        r1 = np.abs(np.diff(c[:i + 1])) if i > 0 else np.array([0.0])
        rec["jump_today"] = float(r1.max() / (s / np.sqrt(1320))) if len(r1) else 0.0
        rec["spread_ba"] = (ea - eb) / s
        rows.append(rec)
    del df, groups
    return pd.DataFrame(rows), nbad


def build(rebuild=False):
    OUT.mkdir(parents=True, exist_ok=True)
    E = pd.read_parquet(SRC / "events.parquet")
    assert E.date.max() <= END and E.date.min() >= START
    log = {}
    for sym in sorted(E.inst.unique()):
        p = OUT / f"grid_{sym}.parquet"
        if p.exists() and not rebuild:
            continue
        t0 = time.time()
        G, nbad = build_inst(sym, E[E.inst == sym])
        G.to_parquet(p, index=False)
        log[sym] = dict(n=len(G), n_events=int((E.inst == sym).sum()), bidask_fallback_bars=nbad, sec=round(time.time() - t0))
        print(sym, log[sym], flush=True)
    if log:
        (OUT / "build_log.json").write_text(json.dumps(log, indent=1), encoding="utf-8")


# ── labels ──────────────────────────────────────────────────────────────────────────────────────────────────────────

def first_touch(G, fav, adv, a, b, end):
    tf, ta = G[f"{fav}{a:g}"].to_numpy(), G[f"{adv}{b:g}"].to_numpy()
    hit_t, hit_s = tf <= end, ta <= end
    stop = hit_s & (~hit_t | (ta <= tf))
    targ = hit_t & ~stop
    return np.where(targ, 1, np.where(stop, 0, 2))


def labels(G, a, b, hn, side):
    """y (mid path, 1 target / 0 stop / 2 time-out), gross R and net R (bid/ask path) in sigma, for one shape-side."""
    up = (G.dir == "up").to_numpy()
    long_ = up if side == "follow" else ~up
    end = G[f"end_{hn}"].to_numpy()
    y_long = first_touch(G, "mu", "md", a, b, end)
    y_short = first_touch(G, "md", "mu", a, b, end)
    y = np.where(long_, y_long, y_short)
    midto = G[f"mid_{hn}"].to_numpy()
    gross = np.where(y == 1, a, np.where(y == 0, -b, np.where(long_, midto, -midto)))
    n_long = first_touch(G, "lf", "la", a, b, end)
    n_short = first_touch(G, "sf", "sa", a, b, end)
    yn = np.where(long_, n_long, n_short)
    nto = np.where(long_, G[f"lnet_{hn}"].to_numpy(), G[f"snet_{hn}"].to_numpy())
    net = np.where(yn == 1, a, np.where(yn == 0, -b, nto))
    return y, gross, net


# ── context: regime, sigma terciles, vol-state fields ───────────────────────────────────────────────────────────────

def context(E):
    rows = []
    for sym in E.inst.unique():
        d = pd.read_csv(M.HIST / f"{sym}.csv", usecols=["date", "live_sig_used", "r_ocs", "jump_share"]).sort_values("date")
        d = d[d.date <= END].reset_index(drop=True)
        vol = d.r_ocs.rolling(63, min_periods=40).std().shift(1)                    # past only
        med = vol.rolling(252, min_periods=126).median()
        above = (vol > 1.25 * med).astype(float).where(med.notna())
        run = above.groupby((above != above.shift()).cumsum()).cumsum()
        d["turb"] = np.where(med.isna(), np.nan, ((above == 1) & (run >= 21)).astype(float))
        d["sig_rel"] = np.log(d.live_sig_used / d.live_sig_used.shift(1).rolling(250, min_periods=120).median())
        d["jump_prev"] = d.jump_share.shift(1)
        d["inst"] = sym
        rows.append(d[["inst", "date", "turb", "sig_rel", "jump_prev"]])
    C = pd.concat(rows)
    S = pd.read_parquet(STATE, columns=["inst", "date", "F1", "F2", "F3", "F4", "F5_ew"])
    S = S[S.date <= END]
    D = pd.read_parquet(DOLLAR, columns=["inst", "date", "dshare"]).sort_values(["inst", "date"])
    D = D[D.date <= END]
    D["dshare_prev"] = D.groupby("inst").dshare.shift(1)
    C = C.merge(S, on=["inst", "date"], how="left").merge(D[["inst", "date", "dshare_prev"]], on=["inst", "date"], how="left")
    return C


def episodes(E):
    """Turbulent episodes per instrument (runs of turb == 1 in the session table) and their mean length."""
    n_ep, lens = 0, []
    for sym, g in E.drop_duplicates(["inst", "date"]).sort_values("date").groupby("inst"):
        t = g.turb.fillna(0).to_numpy()
        starts = np.flatnonzero((t == 1) & (np.r_[0, t[:-1]] == 0))
        ends = np.flatnonzero((t == 1) & (np.r_[t[1:], 0] == 0))
        n_ep += len(starts)
        lens += list(ends - starts + 1)
    return n_ep, float(np.mean(lens)) if lens else np.nan


# ── statistics ─────────────────────────────────────────────────────────────────────────────────────────────────────

def auc_if(y, p):
    """AUC and its per-observation influence (DeLong placements). Var(AUC) ~ sum over clusters of (sum IF)^2."""
    y = np.asarray(y).astype(bool)
    n1, n0 = int(y.sum()), int((~y).sum())
    if n1 < 30 or n0 < 30:
        return np.nan, None
    ra = rankdata(p)
    v10 = (ra[y] - rankdata(p[y])) / n0
    v01 = (n1 - (ra[~y] - rankdata(p[~y]))) / n1
    A = float(v10.mean())
    IF = np.empty(len(y))
    IF[y] = (v10 - A) / n1
    IF[~y] = (v01 - A) / n0
    return A, IF


def clustered_p(diff, IF, cl):
    s = np.bincount(cl, weights=IF)
    se = float(np.sqrt((s ** 2).sum()))
    if not se > 0:
        return np.nan, np.nan
    z = diff / se
    return z, float(2 * norm.sf(abs(z)))


def bh(p, q=0.10):
    p = np.asarray(p)
    n = len(p)
    o = np.argsort(p)
    thr = q * np.arange(1, n + 1) / n
    ok = p[o] <= thr
    k = np.flatnonzero(ok).max() + 1 if ok.any() else 0
    passed = np.zeros(n, bool)
    passed[o[:k]] = True
    return passed


def oof_logit(X, y, di, k=6, embargo=5, C=1.0, train_mask=None):
    """Purged + embargoed k-fold by contiguous date blocks (stage 2 recipe), standardised on the training part only."""
    nd = di.max() + 1
    edges = np.array_split(np.arange(nd), k)
    oof = np.full(len(y), np.nan)
    for ed in edges:
        te = (di >= ed[0]) & (di <= ed[-1])
        tr = (di < ed[0] - embargo) | (di > ed[-1] + embargo)
        if train_mask is not None:
            tr &= train_mask
        if not te.any():
            continue
        mu, sd = np.nanmean(X[tr], axis=0), np.nanstd(X[tr], axis=0) + 1e-9
        Z = np.nan_to_num((X - mu) / sd)
        if len(np.unique(y[tr])) < 2:
            oof[te] = y[tr].mean()
            continue
        m = LogisticRegression(C=C, max_iter=500, tol=1e-3).fit(Z[tr], y[tr])
        oof[te] = m.predict_proba(Z[te])[:, 1]
    return oof



def oof_masked(X, di, y, mask, predict_all=False):
    """oof_logit trained on the rows in mask only. predict_all=False: NaN outside the mask (a subset model, e.g. rows where
    a feature exists). predict_all=True: the model trained on mask rows scores every row of the test fold (e.g. trained on
    resolved trades only, applied at entry when nobody knows yet whether the trade will resolve)."""
    out = np.full(len(y), np.nan)
    idx = np.flatnonzero(mask)
    if len(idx) < 200 or len(np.unique(np.asarray(y)[idx])) < 2:
        return out
    if predict_all:
        return oof_logit(X, np.asarray(y), di, train_mask=np.asarray(mask, bool))
    out[idx] = oof_logit(X[idx], np.asarray(y)[idx], np.unique(di[idx], return_inverse=True)[1])
    return out


def unpaired_p(diff, IF1, cl1, IF2, cl2):
    """Two AUCs on different row sets (independent label draws): variance = sum of the two clustered variances."""
    v = 0.0
    for IF, cl in ((IF1, cl1), (IF2, cl2)):
        s = np.bincount(pd.factorize(cl)[0], weights=IF)
        v += float((s ** 2).sum())
    if not v > 0:
        return np.nan, np.nan
    z = diff / np.sqrt(v)
    return z, float(2 * norm.sf(abs(z)))


def lag_session(Ed, sess, feats):
    """Session-level inputs delayed one more session (per instrument), intraday inputs left as built."""
    out = Ed[feats].copy()
    day = Ed[["inst", "date"] + sess].drop_duplicates(["inst", "date"]).sort_values(["inst", "date"])
    day[sess] = day.groupby("inst")[sess].shift(1)
    out[sess] = Ed[["inst", "date"]].merge(day, on=["inst", "date"], how="left")[sess].to_numpy()
    return out


def r4(x):
    return None if x is None or not np.isfinite(x) else round(float(x), 4)


def sharpe_reps(W, x):
    w = W.sum(1)
    m = (W @ x) / w
    v = (W @ (x * x)) / w - m * m
    return m / np.sqrt(np.maximum(v, 1e-18)) * np.sqrt(252)


def sharpe(x):
    return float(x.mean() / (x.std() + 1e-18) * np.sqrt(252))


def eff_bets(P):
    """Participation ratio of the instrument-by-day correlation matrix (Lesson 06 / scripts/rule-a-portfolio)."""
    P = P.loc[:, P.std() > 0]
    C = np.corrcoef(P.to_numpy().T)
    ev = np.linalg.eigvalsh(np.nan_to_num(C))
    return float(ev.sum() ** 2 / (ev ** 2).sum())


# ── analysis ────────────────────────────────────────────────────────────────────────────────────────────────────────

def load():
    E = pd.read_parquet(SRC / "events.parquet")
    G = pd.concat([pd.read_parquet(p) for p in sorted(OUT.glob("grid_*.parquet"))], ignore_index=True)
    E = E[["inst", "date", "dir", "minute", "sig", "klass"] + M.FEATS].merge(G, on=["inst", "date", "dir", "minute"], how="inner")
    E = E.merge(context(E), on=["inst", "date"], how="left")
    assert E.date.max() <= END and E.date.min() >= START
    E = E.sort_values(["date", "inst", "minute"]).reset_index(drop=True)
    prof = pd.read_csv(SRC / "profile5.csv")
    for hn, H in HORIZ:
        V = np.empty(len(E))
        for sym, g in E.groupby("inst"):
            cp = np.r_[0.0, np.cumsum(prof[sym].to_numpy())]
            V[g.index] = cp[(g[f"end_{hn}"] // 5).to_numpy()] - cp[(g.minute // 5).to_numpy()]
        E[f"V_{hn}"] = np.maximum(V, 1e-6)
    return E


def lagged_features(E, feats):
    """Every model input delayed one more session: each touch takes the features of the same instrument's same-direction
    touch on the previous session that had one (intraday fields too), so nothing from the touch's own session enters."""
    L = E[["inst", "dir", "date"] + feats].copy()
    L = L.sort_values(["inst", "dir", "date"])
    L[feats] = L.groupby(["inst", "dir"])[feats].shift(1)
    return L.loc[E.index, feats]


def main():
    t_start = time.time()
    build("--rebuild" in sys.argv)
    E = load()
    n = len(E)
    rng = np.random.default_rng(SEED)
    dates = np.sort(E.date.unique())
    dpos = pd.Series(np.arange(len(dates)), index=dates)
    di = dpos[E.date].to_numpy()
    cl20 = di // BLOCK
    E["year"] = E.date.str[:4]
    E["tod_b"] = pd.cut(E.minute, [t[1] for t in TOD] + [TOD[-1][2]], right=False, labels=[t[0] for t in TOD]).astype(str)
    q = E.groupby("inst").sig_rel.transform(lambda x: pd.qcut(x, 3, labels=False, duplicates="drop"))
    E["sig_terc"] = q.map({0: "σ low third", 1: "σ middle third", 2: "σ high third"})
    E["vreg"] = E.turb.map({0.0: "calm", 1.0: "turbulent"})
    n_ep, ep_len = episodes(E)
    blk_reg = max(BLOCK, int(round(ep_len))) if np.isfinite(ep_len) else BLOCK
    cl_reg = di // blk_reg
    Ed, feats = M.design(E)
    X = Ed[feats].to_numpy(float)
    W = LR.Boot(dates).W                                         # 2000 x n_dates stationary-block weights (seed in forecast_record)

    # conditions: (family, label, mask, cluster ids)
    conds = [("pooled", "all", np.ones(n, bool), cl20)]
    conds += [("class", k, (E.klass == k).to_numpy(), cl20) for k in sorted(E.klass.unique())]
    conds += [("time of day", t[0], (E.tod_b == t[0]).to_numpy(), cl20) for t in TOD]
    conds += [("regime", k, (E.vreg == k).to_numpy(), cl_reg) for k in ("calm", "turbulent")]
    conds += [("σ tercile", k, (E.sig_terc == k).to_numpy(), cl20) for k in ("σ low third", "σ middle third", "σ high third")]
    conds += [("year", y, (E.year == y).to_numpy(), cl20) for y in ("2017", "2018", "2019", "2020", "2021", "2022")]
    conds += [("instrument", s_, (E.inst == s_).to_numpy(), cl20) for s_ in sorted(E.inst.unique())]

    cells, oofs, store = [], {}, {}
    t0 = time.time()
    # labels first (fast, main process), then every logistic fit in parallel (NJOBS workers, X memory-mapped)
    jobs, meta_ = [], []
    for si, (nm, a, b, hn, H) in enumerate(SHAPES):
        pt_o, ps_o = M.strip_exit(a, b, np.maximum(E[f"rv_{hn}"].to_numpy(), 1e-6))
        pg, _ = M.strip_exit(a, b, E[f"V_{hn}"].to_numpy())
        u1, u2 = rng.random(n), rng.random(n)
        y_rw, y_rw2 = (u1 < pt_o).astype(np.int8), (u2 < pt_o).astype(np.int8)
        res_rw, res_rw2 = u1 < pt_o + ps_o, u2 < pt_o + ps_o          # random walk: target or stop before the clock
        for side in SIDES:
            y, gross, net = labels(E, a, b, hn, side)
            yr = (y == 1).astype(np.int8)
            if yr.sum() < 100 or yr.sum() > n - 100:
                continue
            key = (nm, side)
            res = y < 2
            store[key] = dict(y=y.astype(np.int8), gross=gross.astype(np.float32), net=net.astype(np.float32), pg=pg.astype(np.float32),
                              y_rw=y_rw, y_rw2=y_rw2, res=res, res_rw=res_rw, res_rw2=res_rw2)
            allm_ = np.ones(n, bool)
            for tag, yy, mm in (("real", yr, allm_), ("rw", y_rw, allm_), ("rw2", y_rw2, allm_),
                                ("real_res", yr, res), ("rw_res", y_rw, res_rw), ("rw2_res", y_rw2, res_rw2)):
                jobs.append((yy, mm, tag.endswith("_res")))
                meta_.append((key, tag))
    print(f"Q1 labels ready: {len(jobs)} fits  {time.time() - t0:.0f}s", flush=True)
    fits = Parallel(n_jobs=NJOBS, backend="loky", verbose=0, batch_size=4)(delayed(oof_masked)(X, di, yy, mm, pa) for yy, mm, pa in jobs)
    F = {}
    for (key, tag), o in zip(meta_, fits):
        F.setdefault(key, {})[tag] = o
    del fits, jobs
    print(f"Q1 fits done  {time.time() - t0:.0f}s", flush=True)
    for key, f_ in F.items():
        nm, side = key
        sh_ = [s_ for s_ in SHAPES if s_[0] == nm][0]
        st = store[key]
        yr = (st["y"] == 1).astype(int)
        oofs[key] = (f_["real"], f_["rw"], f_["real_res"])
        for fam, lab, msk, cl in conds:
            ar, IFr = auc_if(yr[msk], f_["real"][msk])
            aw, IFw = auc_if(st["y_rw"][msk], f_["rw"][msk])
            ap, IFp = auc_if(st["y_rw2"][msk], f_["rw2"][msk])
            if IFr is None or IFw is None or IFp is None:
                continue
            c_ = pd.factorize(cl[msk])[0]
            z, p = clustered_p(ar - aw, IFr - IFw, c_)
            zp, pp = clustered_p(ap - aw, IFp - IFw, c_)
            ag, _ = auc_if(yr[msk], st["pg"][msk])
            # resolved only: target vs stop among trades that hit a barrier (which side wins); unpaired row sets
            m1, m2, m3 = msk & st["res"], msk & st["res_rw"], msk & st["res_rw2"]
            rr_, IR = auc_if(yr[m1], f_["real_res"][m1])
            rw_, IW = auc_if(st["y_rw"][m2], f_["rw_res"][m2])
            rp_, IP = auc_if(st["y_rw2"][m3], f_["rw2_res"][m3])
            if IR is not None and IW is not None and IP is not None:
                zr, pr = unpaired_p(rr_ - rw_, IR, cl[m1], IW, cl[m2])
                zrp, prp = unpaired_p(rp_ - rw_, IP, cl[m3], IW, cl[m2])
                hr, hw = float(yr[m1].mean()), float(st["y_rw"][m2].mean())
            else:
                rr_ = rw_ = zr = pr = zrp = prp = hr = hw = np.nan
            cells.append(dict(q="Q1", shape=nm, a=sh_[1], b=sh_[2], h=sh_[3], side=side, fam=fam, cond=lab, n=int(msk.sum()), auc_real=ar, auc_rw=aw,
                              auc_geo=ag, diff=ar - aw, z=z, p=p, z_placebo=zp, p_placebo=pp, hit=float(yr[msk].mean()), hit_rw=float(st["y_rw"][msk].mean()),
                              n_res=int(m1.sum()), auc_res_real=rr_, auc_res_rw=rw_, diff_res=rr_ - rw_, z_res=zr, p_res=pr, z_res_placebo=zrp, p_res_placebo=prp,
                              hit_res=hr, hit_res_rw=hw))
    C1 = pd.DataFrame(cells)
    print(f"Q1 cells {len(C1)}  {time.time() - t0:.0f}s", flush=True)

    # ── Q2 vol-state features beyond geometry (fade side; 1h, 2h, to 21:00; pooled, class, time of day) ─────────────
    VS = [("F1", "σ level (F1)"), ("F3", "σ vs its long-run level (F3, over-reaction)"), ("F2", "expected change in vol (F2)"),
          ("F4", "P(high-vol regime) (F4)"), ("F5_ew", "forecast error (F5)"), ("rv_pre", "vol so far today"),
          ("dshare_prev", "yesterday's dollar share (USD majors)"), ("jump_prev", "yesterday's jump share"), ("jump_today", "jump earlier today")]
    kd = [c for c in feats if c.startswith("k_")]
    cells2 = []
    q2conds = [c for c in conds if c[0] in ("pooled", "class", "time of day")]
    t0 = time.time()
    jobs, meta_ = [], []
    KD = Ed[kd].to_numpy(float)
    oks = {f: np.isfinite(E[f].to_numpy(float)) & ((E.klass == "fx_majors").to_numpy() if f == "dshare_prev" else True) for f, _ in VS}
    for si, (nm, a, b, hn, H) in enumerate(SHAPES):
        key = (nm, "fade")
        if hn not in Q2_H or key not in store:
            continue
        st = store[key]
        yr = (st["y"] == 1).astype(np.int8)
        pgc = np.clip(st["pg"].astype(float), 1e-4, 1 - 1e-4)
        Xb = np.column_stack([np.log(pgc / (1 - pgc)), KD])
        for f, fname in VS:
            if oks[f].sum() < 2000:
                continue
            Xf = np.column_stack([Xb, np.nan_to_num(E[f].to_numpy(float))])
            for tag, XX, yy in (("b_r", Xb, yr), ("f_r", Xf, yr), ("b_w", Xb, st["y_rw"]), ("f_w", Xf, st["y_rw"])):
                jobs.append((XX, yy, oks[f]))
                meta_.append((nm, f, tag))
    print(f"Q2 jobs {len(jobs)}", flush=True)
    fits = Parallel(n_jobs=NJOBS, backend="loky", verbose=0, batch_size=4)(delayed(oof_masked)(XX, di, yy, mm) for XX, yy, mm in jobs)
    F2 = {}
    for (nm, f, tag), o in zip(meta_, fits):
        F2.setdefault((nm, f), {})[tag] = o
    del fits, jobs
    for (nm, f), g in F2.items():
        sh_ = [s_ for s_ in SHAPES if s_[0] == nm][0]
        st = store[(nm, "fade")]
        yr = (st["y"] == 1).astype(int)
        fname = dict(VS)[f]
        for fam, lab, msk, cl in q2conds:
            mm = msk & oks[f]
            if mm.sum() < 500:
                continue
            A1, I1 = auc_if(yr[mm], g["f_r"][mm])
            A0, I0 = auc_if(yr[mm], g["b_r"][mm])
            B1, J1 = auc_if(st["y_rw"][mm], g["f_w"][mm])
            B0, J0 = auc_if(st["y_rw"][mm], g["b_w"][mm])
            if any(v is None for v in (I1, I0, J1, J0)):
                continue
            c_ = pd.factorize(cl[mm])[0]
            d_ = (A1 - A0) - (B1 - B0)
            z, p = clustered_p(d_, (I1 - I0) - (J1 - J0), c_)
            cells2.append(dict(q="Q2", shape=nm, a=sh_[1], b=sh_[2], h=sh_[3], side="fade", feat=f, feat_name=fname, fam=fam, cond=lab, n=int(mm.sum()),
                               inc_real=A1 - A0, inc_rw=B1 - B0, diff=d_, auc_base=A0, z=z, p=p))
    C2 = pd.DataFrame(cells2)
    print(f"Q2 cells {len(C2)}  {time.time() - t0:.0f}s", flush=True)

    # ── Q3 Lesson 06: the filter judged on the book, net of one spread (bid/ask path) ─────────────────────────────
    insts = sorted(E.inst.unique())
    rnd_half = rng.random(n) < 0.5

    def wmean(x, msk):
        """Date-block bootstrap mean [mean, lo, hi] on the global LR.Boot weights (same as LR.Boot.mean, built once)."""
        a_ = np.bincount(di[msk], weights=x[msk], minlength=len(dates))
        c_ = np.bincount(di[msk], minlength=len(dates)).astype(float)
        reps = (W @ a_) / (W @ c_)
        return [r4(a_.sum() / c_.sum()), r4(np.nanpercentile(reps, 2.5)), r4(np.nanpercentile(reps, 97.5))], reps

    def book(rr, msk):
        return np.bincount(di[msk], weights=rr[msk], minlength=len(dates))

    def lesson06(key, msk_cond):
        """Keep the top half by the meta P (within the condition). Benchmarks at EQUAL retention: the top half by the
        geometry P alone (what clock and vol give for free) and a seeded random half; plus the unfiltered book.
        Test = net R per trade, meta-kept minus geometry-kept (date-block bootstrap)."""
        st = store[key]
        b_ = [s_ for s_ in SHAPES if s_[0] == key[0]][0][2]
        rr = st["net"].astype(float) / b_                          # net R per unit of stop
        gr = st["gross"].astype(float) / b_
        o = oofs[key][0]
        keep = msk_cond & (o >= np.nanmedian(o[msk_cond]))
        pg = st["pg"].astype(float)
        keep_g = msk_cond & (pg >= np.nanmedian(pg[msk_cond]))
        rh = msk_cond & rnd_half
        od = oofs[key][2]                                         # "which side wins" model (trained on resolved trades)
        keep_d = msk_cond & (od >= np.nanmedian(od[msk_cond]))
        (mu_u, _), (mu_f, rf), (mu_g, rg_), (mu_r, _), (mu_d, rd) = wmean(rr, msk_cond), wmean(rr, keep), wmean(rr, keep_g), wmean(rr, rh), wmean(rr, keep_d)
        dlt = rf - rg_
        p = float(min(1, 2 * min((dlt <= 0).mean(), (dlt >= 0).mean())))
        dld = rd - rg_
        p_d = float(min(1, 2 * min((dld <= 0).mean(), (dld >= 0).mean())))
        return dict(sh_u=sharpe(book(rr, msk_cond)), sh_f=sharpe(book(rr, keep)), sh_g=sharpe(book(rr, keep_g)), sh_r=sharpe(book(rr, rh)),
                    r_u=mu_u, r_f=mu_f, r_g=mu_g, r_r=mu_r, d_r=float(np.nanmean(rr[keep]) - np.nanmean(rr[keep_g])),
                    d_ci=[r4(np.nanpercentile(dlt, 2.5)), r4(np.nanpercentile(dlt, 97.5))], p=p,
                    sh_d=sharpe(book(rr, keep_d)), r_d=mu_d, d_rd=float(np.nanmean(rr[keep_d]) - np.nanmean(rr[keep_g])),
                    dd_ci=[r4(np.nanpercentile(dld, 2.5)), r4(np.nanpercentile(dld, 97.5))], p_d=p_d, g_d=float(gr[keep_d].mean()),
                    g_u=float(gr[msk_cond].mean()), g_f=float(gr[keep].mean()), g_g=float(gr[keep_g].mean()),
                    n_u=int(msk_cond.sum()), n_f=int(keep.sum()))

    cells3 = []
    allm = np.ones(n, bool)
    for key in store:
        sh = [s_ for s_ in SHAPES if s_[0] == key[0]][0]
        cells3.append(dict(q="Q3", shape=key[0], a=sh[1], b=sh[2], h=sh[3], side=key[1], fam="pooled", cond="all", **lesson06(key, allm)))
    head_keys = []
    for (hnm, b_, ratio, hn, side) in HEAD:
        nm = [s_[0] for s_ in SHAPES if s_[2] == b_ and abs(s_[1] - b_ * ratio) < 1e-9 and s_[3] == hn][0]
        head_keys.append((nm, side, hnm))
        for fam, lab, msk, cl in conds:
            if fam in ("pooled", "instrument"):
                continue
            cells3.append(dict(q="Q3", shape=nm, a=b_ * ratio, b=b_, h=hn, side=side, fam=fam, cond=lab, **lesson06((nm, side), msk)))
    C3 = pd.DataFrame(cells3)
    print(f"Q3 cells {len(C3)}  {time.time() - t0:.0f}s", flush=True)
    # effective bets: per-instrument daily book, headline shapes
    effb = {}
    for nm, side, hnm in head_keys:
        st = store[(nm, side)]
        b_ = [s_ for s_ in SHAPES if s_[0] == nm][0][2]
        rr = st["net"].astype(float) / b_
        keep = oofs[(nm, side)][0] >= np.nanmedian(oofs[(nm, side)][0])
        keep_g = st["pg"] >= np.nanmedian(st["pg"])
        keep_d = oofs[(nm, side)][2] >= np.nanmedian(oofs[(nm, side)][2])
        out = {}
        for lab, mk in (("unfiltered", allm), ("meta top half", keep), ("direction top half", keep_d), ("geometry top half", keep_g), ("random half", rnd_half)):
            P = pd.DataFrame({s_: book(rr, mk & (E.inst == s_).to_numpy()) for s_ in insts})
            out[lab] = dict(n_pr=eff_bets(P), sharpe=sharpe(P.sum(1).to_numpy()), r=float(rr[mk].mean()), n=int(mk.sum()))
        effb[hnm] = out

    # ── Lesson 01: +1 session lag (session-level inputs only, and every input) ─────────────────────────────────────
    Lf = lagged_features(Ed, M.FEATS)
    XL = np.column_stack([Lf.to_numpy(float), Ed[kd].to_numpy(float)])
    XS = np.column_stack([lag_session(Ed, ["regime", "res1", "gap", "event"], M.FEATS).to_numpy(float), Ed[kd].to_numpy(float)])
    lagres = {}
    for nm, side, hnm in head_keys:
        st = store[(nm, side)]
        yr = (st["y"] == 1).astype(int)
        res = st["res"]
        out = {}
        for tag, XX in (("as built", X), ("+1 session, session inputs", XS), ("+1 session, all inputs", XL)):
            o_r, o_w = (oofs[(nm, side)][:2] if tag == "as built" else (oof_logit(XX, yr, di), oof_logit(XX, st["y_rw"], di)))
            Ar, Ir = auc_if(yr, o_r)
            Aw, Iw = auc_if(st["y_rw"], o_w)
            o_res = oof_masked(XX, di, yr, res, predict_all=True)
            Arr, _ = auc_if(yr[res], o_res[res])
            out[tag] = dict(auc_real=Ar, auc_rw=Aw, gap=Ar - Aw, p=clustered_p(Ar - Aw, Ir - Iw, cl20)[1], auc_res_real=Arr)
        lagres[hnm] = out

    # ── Q4 Rule A's own trades, discovery window ───────────────────────────────────────────────────────────────────
    ra = rule_a(rng)

    # ── multiple testing over the whole sweep ─────────────────────────────────────────────────────────────────────
    parts = [pd.DataFrame({"p": C1.p.to_numpy(), "src": "Q1", "row": np.arange(len(C1))}),
             pd.DataFrame({"p": C1.p_res.to_numpy(), "src": "Q1r", "row": np.arange(len(C1))}),
             pd.DataFrame({"p": C2.p.to_numpy(), "src": "Q2", "row": np.arange(len(C2))}),
             pd.DataFrame({"p": C3.p.to_numpy(), "src": "Q3", "row": np.arange(len(C3))}),
             pd.DataFrame({"p": C3.p_d.to_numpy(), "src": "Q3d", "row": np.arange(len(C3))})]
    if ra:
        parts.append(pd.DataFrame({"p": ra["ps"], "src": "Q4", "row": [0, 1]}))
    allp = pd.concat(parts, ignore_index=True)
    allp = allp[np.isfinite(allp.p)].reset_index(drop=True)
    passed = bh(allp.p.to_numpy())
    allp["pass"] = passed
    N = len(allp)
    for Cx, src, col in ((C1, "Q1", "ok"), (C1, "Q1r", "ok_res"), (C2, "Q2", "ok"), (C3, "Q3", "ok"), (C3, "Q3d", "ok_d")):
        Cx[col] = False
        sel = allp[allp.src == src]
        Cx.loc[sel.row.to_numpy(), col] = sel["pass"].to_numpy()
    # chance: placebo Q1 / Q1r cells (a second random walk plays "real") through the same BH with every other real p
    pl = np.r_[C1.p_placebo.to_numpy(), C1.p_res_placebo.to_numpy()]
    pl = pl[np.isfinite(pl)]
    others = allp[~allp.src.isin(["Q1", "Q1r"])].p.to_numpy()
    pl_pass = int(bh(np.r_[pl, others])[:len(pl)].sum())
    raw05 = int((allp.p < 0.05).sum())
    OUT.mkdir(parents=True, exist_ok=True)
    pd.concat([C1, C2, C3], ignore_index=True).to_parquet(OUT / "cells.parquet", index=False)

    nums = dict(n_touches=n, sessions=len(dates), cells=N, pass_bh=int(passed.sum()), pass_by_q=allp.groupby("src")["pass"].sum().astype(int).to_dict(),
                cells_by_q=allp.groupby("src").size().astype(int).to_dict(),
                raw_p05=raw05, raw_p05_expected=0.05 * N, placebo_q1_pass=pl_pass, placebo_raw05=int((pl < 0.05).sum()), placebo_cells=len(pl), q1_cells=int(np.isfinite(C1.p).sum()), q1r_cells=int(np.isfinite(C1.p_res).sum()),
                q1r_pos_pass=int(((C1.diff_res > 0) & C1.ok_res).sum()), q1r_neg_pass=int(((C1.diff_res < 0) & C1.ok_res).sum()),
                episodes=n_ep, episode_len=ep_len, regime_block=blk_reg, regime_share=float(E.turb.mean()),
                q1_pos_pass=int(((C1["diff"] > 0) & C1["ok"]).sum()), q1_neg_pass=int(((C1["diff"] < 0) & C1["ok"]).sum()),
                q2_pos_pass=int(((C2["diff"] > 0) & C2["ok"]).sum()), q2_neg_pass=int(((C2["diff"] < 0) & C2["ok"]).sum()),
                q3_pos_pass=int(((C3.d_r > 0) & C3["ok"]).sum()), q3_neg_pass=int(((C3.d_r < 0) & C3["ok"]).sum()),
                q3d_pos_pass=int(((C3.d_rd > 0) & C3["ok_d"]).sum()), q3d_neg_pass=int(((C3.d_rd < 0) & C3["ok_d"]).sum()),
                effb=effb, lag=lagres, rule_a={k: v for k, v in (ra or {}).items() if k not in ("ps", "chart_rows", "ex")},
                runtime_s=round(time.time() - t_start))
    (OUT / "numbers.json").write_text(json.dumps(nums, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o)), encoding="utf-8")
    charts = make_charts(E, C1, C2, C3, effb, lagres, ra, head_keys, store, oofs, nums)
    intro_p = OUT / "intro.json"
    intro = json.loads(intro_p.read_text(encoding="utf-8")) if intro_p.exists() else ["(intro written after the numbers are read)"]
    holds_p = OUT / "holds.json"
    holds = json.loads(holds_p.read_text(encoding="utf-8")) if holds_p.exists() else []
    out = {"id": "meta-wide", "window": [START, END], "cells_tested": N, "cells_pass_bh": int(passed.sum()),
           "cells_expected_by_chance": round(pl_pass * N / max(1, len(pl)), 1),
           "chance_note": f"Chance = a placebo: a second random-walk draw plays 'real' through the same model and the same {len(pl)} Q1 cells (all-label and resolved-only), BH with every other real p; it passed {pl_pass}, scaled to {N} cells = the figure above. Nominal p<0.05 would give {0.05 * N:.0f} of {N} by chance; observed {raw05}.",
           "intro": intro, "holds": holds, "charts": charts}
    WEB.mkdir(parents=True, exist_ok=True)
    (WEB / "meta-wide.json").write_text(json.dumps(out, ensure_ascii=False, default=lambda o: o.item() if hasattr(o, "item") else str(o)), encoding="utf-8")
    print(json.dumps(nums, indent=1, default=str)[:5000])
    print(f"done in {time.time() - t_start:.0f}s")


# ── Rule A ─────────────────────────────────────────────────────────────────────────────────────────────────────────

def rule_a(rng):
    names = ["EURUSD", "GBPUSD", "AUDUSD", "USDCAD", "USDCHF", "USDJPY", "GOLD", "NQ", "SPX500", "US30", "US2000"]
    rows = []
    for sym in names:
        p = RULEA / f"{sym}.json.gz"
        if not p.exists():
            continue
        r = json.load(gzip.open(p, "rt"))
        days = {d["d"]: d for d in r["days"] if d["d"] <= END}
        si, ti = r["stops"].index(0.2), r["targets"].index("5")
        gi = si * len(r["targets"]) + ti
        for x in r["trades"]["A"]:
            if x["d"] > END or x["d"] not in days:
                continue
            g = x["g"][gi]
            if g is None:
                continue
            day = days[x["d"]]
            unit = day["o"] * day["sig"] / 100 * 0.2
            cost = 2 * r["spread"] / unit
            rows.append(dict(inst=sym, date=x["d"], em=x["em"], side=x["side"], line=x["line"], p75=float("p75" in x["line"]),
                             gross=g[0] / 1000, net=g[0] / 1000 - cost, exit_m=g[1], sig=day["sig"], ratio=day.get("ratio"),
                             rv20=day.get("rv20"), jump=float(day.get("jump") or 0), gap=day.get("gap"), ev=float(bool(day.get("ev"))),
                             wd=day.get("wd")))
    if not rows:
        return None
    T = pd.DataFrame(rows).sort_values(["date", "em"]).reset_index(drop=True)
    assert T.date.max() <= END
    for c in ("ratio", "rv20", "gap", "wd"):
        T[c] = pd.to_numeric(T[c], errors="coerce")
    T["rv_sig"] = T.rv20 / T.sig
    T["agap"] = T.gap.abs()
    T["y"] = (T.net > 0).astype(int)
    f = ["em", "side", "p75", "ratio", "rv_sig", "jump", "agap", "ev"]
    X = T[f].to_numpy(float)
    dts = np.sort(T.date.unique())
    di = pd.Series(np.arange(len(dts)), index=dts)[T.date].to_numpy()
    o = oof_logit(X, T.y.to_numpy(), di, k=5)
    A, IF = auc_if(T.y.to_numpy(), o)
    perm = []
    for _ in range(200):
        yp = rng.permutation(T.y.to_numpy())
        perm.append(auc_if(yp, oof_logit(X, yp, di, k=5))[0])
    perm = np.array(perm)
    p_auc = float((1 + (perm >= A).sum()) / (1 + len(perm)))
    a_time, _ = auc_if(T.y.to_numpy(), -T.em.to_numpy(float))
    keep = o >= np.nanmedian(o)
    rh = rng.random(len(T)) < 0.5
    bs = LR.Boot(T.date)
    mu = lambda m_: bs.mean(T.date[m_], T.net.to_numpy()[m_])[0]  # noqa: E731
    W = bs.W
    book = lambda m_: np.bincount(pd.Series(np.arange(len(bs.dates)), index=bs.dates)[T.date[m_]].to_numpy(), weights=T.net.to_numpy()[m_], minlength=len(bs.dates))  # noqa: E731
    allm = np.ones(len(T), bool)
    d_reps = sharpe_reps(W, book(keep)) - sharpe_reps(W, book(allm))
    p_sh = float(min(1, 2 * min((d_reps <= 0).mean(), (d_reps >= 0).mean())))
    q_ = pd.qcut(o, 4, labels=False, duplicates="drop")
    rows_q = []
    for k in sorted(np.unique(q_)):
        m_ = q_ == k
        c = mu(m_)
        rows_q.append({"label": f"meta quarter {k + 1} (P {o[m_].mean():.2f}, n {m_.sum()})", "value": r4(c[0]), "lo": r4(c[1]), "hi": r4(c[2])})
    for lab, m_ in (("all rule A trades", allm), ("top half by P", keep), ("random half (seeded)", rh)):
        c = mu(m_)
        rows_q.append({"label": f"{lab} (n {m_.sum()})", "value": r4(c[0]), "lo": r4(c[1]), "hi": r4(c[2])})
    return dict(n=len(T), days=int(T.date.nunique()), first=T.date.min(), last=T.date.max(), win=float(T.y.mean()),
                auc=A, auc_perm_mean=float(perm.mean()), auc_perm_95=float(np.percentile(perm, 95)), p_auc=p_auc, auc_time=a_time,
                sh_all=sharpe(book(allm)), sh_keep=sharpe(book(keep)), sh_rand=sharpe(book(rh)), p_sh=p_sh,
                net_all=float(T.net.mean()), net_keep=float(T.net[keep].mean()), net_rand=float(T.net[rh].mean()),
                ps=[p_auc, p_sh], chart_rows=rows_q)


# ── charts ──────────────────────────────────────────────────────────────────────────────────────────────────────────

def make_charts(E, C1, C2, C3, effb, lagres, ra, head_keys, store, oofs, nums):
    ch = []
    H1, H2 = head_keys

    def ci_from(d, z):
        se = abs(d / z) if z and np.isfinite(z) and z != 0 else np.nan
        return r4(d - 1.96 * se), r4(d + 1.96 * se)

    # 1 the sweep at a glance: z-score histogram, real vs placebo
    bins = np.arange(-6, 6.5, 0.5)
    hz = np.histogram(np.clip(C1.z.dropna(), -5.99, 5.99), bins)[0]
    hp = np.histogram(np.clip(C1.z_placebo.dropna(), -5.99, 5.99), bins)[0]
    hr = np.histogram(np.clip(C1.z_res.dropna(), -5.99, 5.99), bins)[0]
    hrp = np.histogram(np.clip(C1.z_res_placebo.dropna(), -5.99, 5.99), bins)[0]
    pts = lambda h: [[float(b + 0.25), int(c)] for b, c in zip(bins[:-1], h)]  # noqa: E731
    ch.append({"type": "lines", "title": "Every Q1 cell: real-label AUC minus random-walk AUC, as z-scores", "unit": "number of cells", "xlabel": "z of AUC(real) − AUC(random walk)",
               "note": f"{nums['q1_cells']:,} cells = 160 barrier shapes × 55 conditions (pooled, 4 classes, 5 London time buckets, 2 regimes, 3 σ terciles, 6 years, 34 instruments). 'All labels' scores target-first vs stop-or-time-out; 'resolved' scores target vs stop among trades that hit a barrier (which side wins). Benchmark: the placebo curves, where a second random-walk draw plays 'real'. BH (q=0.10, all {nums['cells']:,} cells): all-label {nums['q1_pos_pass']} above / {nums['q1_neg_pass']} below; resolved {nums['q1r_pos_pass']} above / {nums['q1r_neg_pass']} below; placebo {nums['placebo_q1_pass']}.",
               "series": [{"name": "All labels, real", "points": pts(hz)}, {"name": "All labels, placebo", "points": pts(hp)},
                          {"name": "Resolved only, real", "points": pts(hr)}, {"name": "Resolved only, placebo", "points": pts(hrp)}]})

    # 2 plateau, all labels: pooled gap by stop size, series = target/stop ratio, fade, to 21:00
    P = C1[(C1.fam == "pooled") & (C1.side == "fade")]
    series = []
    for r in RATIOS:
        pts_ = [[b, r4(P[(P.b == b) & (np.isclose(P.a, b * r)) & (P.h == "to 21:00")]["diff"].mean())] for b in STOPS]
        series.append({"name": f"target = {r:g} × stop", "points": [p for p in pts_ if p[1] is not None]})
    ch.append({"type": "lines", "title": "Plateau check, all labels: real minus random-walk AUC across barrier sizes (fade, to 21:00)", "unit": "AUC(real) − AUC(random walk)", "xlabel": "stop size (σ)",
               "note": "Each point is a separate barrier shape, pooled over 34 instruments. Benchmark: 0 = the same logistic model scored on random-walk labels drawn at each touch's own realised variance. Small barriers sit a little above 0 and big ones below: that is the random walk mis-modelling time-outs (real vol arrives in bursts), not a side being picked. Missing points: too few targets hit.",
               "series": series})
    # 3 plateau, resolved only, symmetric 1:1 shapes (the only shapes where a random walk gives exactly 50/50 whatever the vol)
    series = []
    for hn in ("1h", "2h", "4h", "to 21:00"):
        pts_ = [[b, r4(P[(P.b == b) & np.isclose(P.a, b) & (P.h == hn)]["diff_res"].mean())] for b in STOPS]
        series.append({"name": f"1:1, {hn}", "points": [p for p in pts_ if p[1] is not None]})
    ch.append({"type": "lines", "title": "Plateau check, which side wins: resolved-only AUC minus random walk, every 1:1 shape (fade)", "unit": "AUC(real) − AUC(random walk), resolved trades", "xlabel": "stop size (σ)",
               "note": "Target vs stop among touches that hit one of them. For 1:1 barriers a random walk is 50/50 whatever the vol or clock, so its AUC sits at 0.5 and this gap is pure 'which side'. Benchmark: 0. Every point is above 0 (+0.015 to +0.08): a plateau across stop size and horizon, not a peak. 2σ shapes have too few resolved trades.",
               "series": series})

    # 4 horizon x side at 1:1 0.25
    rows = []
    for hn, _ in HORIZ:
        for side in SIDES:
            x = C1[(C1.fam == "pooled") & (C1.side == side) & (C1.b == 0.25) & np.isclose(C1.a, 0.25) & (C1.h == hn)]
            if len(x):
                x = x.iloc[0]
                rows.append({"label": f"{hn} {side}", "values": [r4(x.auc_real), r4(x.auc_rw), r4(x.auc_res_real)]})
    ch.append({"type": "groups", "title": "By horizon: meta-model AUC on real vs random-walk labels (1:1, 0.25σ)", "names": ["Real labels", "Random-walk labels", "Real, resolved only"], "unit": "ROC AUC",
               "note": "Benchmark: the random-walk bar (same model, labels drawn at each touch's own realised variance) and 0.5 for the resolved-only bar (a random walk gives no target-vs-stop sorting). Short clocks sort well on both real and random-walk labels because the model reads 'will it resolve in time' from the clock and vol.",
               "rows": rows})

    def cond_bars(fam, title, shape_key, col, zc, okc, note, sort=False):
        nm, side, hnm = shape_key
        x = C1[(C1.fam == fam) & (C1["shape"] == nm) & (C1.side == side)]
        rws = []
        for r in x.itertuples():
            d, z = getattr(r, col), getattr(r, zc)
            lo, hi = ci_from(d, z)
            nn = r.n_res if col == "diff_res" else r.n
            rws.append({"label": f"{r.cond} ({nn:,})" + (" *" if getattr(r, okc) else ""), "value": r4(d), "lo": lo, "hi": hi})
        if sort:
            rws.sort(key=lambda d: d["value"] if d["value"] is not None else 0)
        return {"type": "bars", "title": title, "unit": "AUC(real) − AUC(random walk)", "ref": 0, "note": note, "rows": rws}

    ch.append(cond_bars("instrument", f"Per instrument, resolved touches only: which side wins, real vs random walk ({H1[2]}, fade)", H1, "diff_res", "z_res", "ok_res",
                        "Among touches that hit target or stop: the meta-model's AUC on real labels minus a random walk's (about 0.5). Above 0 = the model picks winners on that instrument. 95% intervals from 20-session date-block clustering; * = passes BH over the whole sweep. Look for a class pattern, not a winner.", sort=True))
    cls = sorted(C1[C1.fam == "class"].cond.unique())
    sel = lambda k, s: C1[(C1.fam == "class") & (C1.cond == k) & (C1["shape"] == s) & (C1.side == "fade")]  # noqa: E731
    ch.append({"type": "groups", "title": f"By asset class: AUC real vs random walk ({H1[2]}, fade)", "names": ["Real, all labels", "Random walk, all labels", "Real, resolved only"],
               "unit": "ROC AUC", "note": "Classes in the touch set: FX majors, FX crosses, gold, indices (no energy or rates). Benchmarks: the random-walk bar for all labels, 0.5 for resolved only.",
               "rows": [{"label": k, "values": [r4(sel(k, H1[0]).auc_real.mean()), r4(sel(k, H1[0]).auc_rw.mean()), r4(sel(k, H1[0]).auc_res_real.mean())]} for k in cls]})
    ch.append(cond_bars("time of day", f"London time of day: real minus random-walk AUC, all labels ({H1[2]}, fade)", H1, "diff", "z", "ok",
                        "Touches run 01:00-19:00 London (Europe/London clock). Benchmark: 0 = a random walk at the same vol and clock. 95% date-block intervals; * = passes BH."))
    rg = C1[(C1.fam.isin(["regime", "σ tercile"])) & (C1["shape"] == H1[0]) & (C1.side == "fade")]
    ch.append({"type": "groups", "title": f"Vol regime (C.OG Lesson 05) and σ terciles: AUC real vs random walk ({H1[2]}, fade)", "names": ["Real, all labels", "Random walk, all labels", "Real, resolved only"], "unit": "ROC AUC",
               "note": f"Turbulent = 63-session vol above 1.25 × its past 252-session median for 21+ sessions running (past data only): {nums['regime_share'] * 100:.0f}% of touches, {nums['episodes']} episodes across instruments, mean {nums['episode_len']:.0f} sessions, so the turbulent cells rest on about {nums['episodes']} episodes, not thousands of touches; they are clustered in {nums['regime_block']}-session blocks. σ terciles: σ vs its own past-year median, per instrument. Benchmarks: the random-walk bar, 0.5 for resolved.",
               "rows": [{"label": f"{r.cond} ({r.n:,})", "values": [r4(r.auc_real), r4(r.auc_rw), r4(r.auc_res_real)]} for r in rg.itertuples()]})
    yr = C1[(C1.fam == "year") & (C1.side == "fade")]
    ch.append({"type": "groups", "title": "Year by year: real minus random-walk AUC (fade)", "names": [f"{H1[2]}, all labels", f"{H2[2]}, all labels", "median over all fade shapes, resolved only"], "unit": "AUC(real) − AUC(random walk)",
               "note": "Benchmark: 0. The third bar is the median resolved-only gap across every fade shape that year: if the market gave the model 'which side wins' in some year, it would show there across shapes.",
               "rows": [{"label": y, "values": [r4(yr[(yr.cond == y) & (yr["shape"] == H1[0])]["diff"].mean()), r4(yr[(yr.cond == y) & (yr["shape"] == H2[0])]["diff"].mean()),
                                                  r4(yr[yr.cond == y]["diff_res"].median())]} for y in ("2017", "2018", "2019", "2020", "2021", "2022")]})

    # Q2 features
    Q = C2[C2.fam == "pooled"]
    rows = []
    for f, g in Q.groupby("feat", sort=False):
        h1 = g[g["shape"] == H1[0]]
        rows.append({"label": g.feat_name.iloc[0], "values": [r4(h1.inc_real.mean()), r4(h1.inc_rw.mean()), r4(g["diff"].median())]})
    ch.append({"type": "groups", "title": "Vol-state features on top of geometry: AUC added on real vs random-walk labels", "names": [f"Real, {H1[2]}", f"Random walk, {H1[2]}", "Real minus random walk, median over 48 fade shapes"],
               "unit": "AUC added beyond logit(geometry P) + class", "note": f"Base model = the random-walk geometry probability (clock + average vol profile) and class. Benchmark: the same increment on random-walk labels drawn at each touch's realised variance (a feature that only says 'it will resolve' adds there too). {int(C2['ok'].sum())} of {len(C2):,} feature cells pass BH ({nums['q2_pos_pass']} above, {nums['q2_neg_pass']} below the random walk). Dollar share: USD majors only.",
               "rows": rows})
    top = C2.sort_values("z", ascending=False).head(12)
    ch.append({"type": "bars", "title": "Q2: the twelve strongest feature cells anywhere (real minus random-walk increment)", "unit": "AUC difference", "ref": 0,
               "note": f"Ranked by z out of {len(C2):,} feature cells, so these are the best of thousands: judge them by BH (* = passes), not their own intervals. Benchmark: 0. A plateau would show the same feature across neighbouring shapes and conditions.",
               "rows": [{"label": f"{r.feat_name} | {r.shape} | {r.cond}" + (" *" if r.ok else ""), "value": r4(r.diff), "lo": ci_from(r.diff, r.z)[0], "hi": ci_from(r.diff, r.z)[1]} for r in top.itertuples()]})

    # Q3 Lesson 06
    nm, side, hnm = H1
    x = C3[(C3["shape"] == nm) & (C3.side == side) & (C3.fam != "pooled")]
    e1, e2 = effb[H1[2]], effb[H2[2]]
    ch.append({"type": "groups", "title": f"Lesson 06: the book's Sharpe under each filter, net of spread ({hnm}, {side})", "names": ["Meta top half (will it resolve)", "Direction top half (which side wins)", "Geometry top half (benchmark)"], "unit": "annualised Sharpe of the daily book",
               "note": f"Each condition is its own book: every touch, equal risk (R per unit of stop), stops and targets on the M1 bid/ask path. All three keep 50% so the Sharpe is comparable (halving a losing book shrinks |Sharpe| by itself). Pooled: unfiltered {e1['unfiltered']['sharpe']:.1f} ({e1['unfiltered']['r']:+.3f} R/trade), meta {e1['meta top half']['sharpe']:.1f} ({e1['meta top half']['r']:+.3f}), direction {e1['direction top half']['sharpe']:.1f} ({e1['direction top half']['r']:+.3f}), geometry {e1['geometry top half']['sharpe']:.1f} ({e1['geometry top half']['r']:+.3f}), random half {e1['random half']['sharpe']:.1f}; effective bets (participation ratio of the 34-instrument book) {e1['unfiltered']['n_pr']:.1f} unfiltered / {e1['meta top half']['n_pr']:.1f} meta / {e1['direction top half']['n_pr']:.1f} direction / {e1['geometry top half']['n_pr']:.1f} geometry. {H2[2]}: unfiltered {e2['unfiltered']['sharpe']:.1f}, meta {e2['meta top half']['sharpe']:.1f}, direction {e2['direction top half']['sharpe']:.1f}, geometry {e2['geometry top half']['sharpe']:.1f}.",
               "rows": [{"label": f"{r.fam}: {r.cond}", "values": [r4(r.sh_f), r4(r.sh_d), r4(r.sh_g)]} for r in x.itertuples()]})
    pq_ = C3[C3.fam == "pooled"]
    series = []
    for col, lab in (("d_r", "meta"), ("d_rd", "direction")):
        for hn in ("2h", "to 21:00"):
            g = pq_[(pq_.side == "fade") & (pq_.h == hn) & np.isclose(pq_.a, pq_.b)]
            series.append({"name": f"{lab} minus geometry, fade 1:1, {hn}", "points": [[r.b, r4(getattr(r, col))] for r in g.sort_values("b").itertuples()]})
    ch.append({"type": "lines", "title": "Lesson 06 plateau: net R per trade, filter's top half minus geometry's top half (fade, 1:1)", "unit": "R per trade (net, bid/ask)", "xlabel": "stop size (σ)",
               "note": f"Benchmark: 0 = the filter keeps trades no better than the plain geometry P does at the same 50% retention. Over all {len(C3)} Lesson 06 shape/condition books: meta filter {nums['q3_pos_pass']} pass BH better / {nums['q3_neg_pass']} worse; direction filter {nums['q3d_pos_pass']} better / {nums['q3d_neg_pass']} worse.",
               "series": series})
    # +1 lag
    rows = []
    for h, v in lagres.items():
        for tag, w in v.items():
            rows.append({"label": f"{h}: {tag}", "values": [r4(w["auc_real"]), r4(w["auc_rw"]), r4(w["auc_res_real"])]})
    ch.append({"type": "groups", "title": "Lesson 01 +1 lag: inputs delayed one more session", "names": ["Real, all labels", "Random walk, all labels", "Real, resolved only"], "unit": "ROC AUC",
               "note": "'Session inputs' delays σ-vs-its-year, yesterday's range, the gap and the event flag by one session and keeps the intraday inputs; 'all inputs' gives each touch the previous same-direction touch's features. Benchmark: the random-walk bar beside each, and 0.5 for resolved. A market effect should keep its real-minus-random-walk gap under the session lag; an alignment artefact would lose it.",
               "rows": rows})
    if ra:
        ch.append({"type": "bars", "title": f"Rule A's own trades, {ra['first']} to {ra['last']}: net R by meta-model quarter", "unit": "R per trade, net of 2× spread", "ref": 0,
                   "note": f"{ra['n']} trades on {ra['days']} days (stop 0.2σ, target 5R, out by 22:00; discovery window only), purged 5-fold logistic on entry time, side, p50/p75 line, rich ratio, rv20/σ, jump, |gap|, event. AUC {ra['auc']:.3f} vs shuffled labels {ra['auc_perm_mean']:.3f} (95th pct {ra['auc_perm_95']:.3f}, p {ra['p_auc']:.2f}); entry time alone {ra['auc_time']:.3f}. Book Sharpe: all {ra['sh_all']:.2f}, meta top half {ra['sh_keep']:.2f}, random half {ra['sh_rand']:.2f}. 95% date-block intervals.",
                   "rows": ra["chart_rows"]})
    # concrete examples: headline shape, three kept (top decile) and three dropped (bottom decile), seeded
    nm, side, hnm = H1
    st = store[(nm, side)]
    o = oofs[(nm, side)][0]
    dec = pd.qcut(o, 10, labels=False, duplicates="drop")
    ex = []
    shp = [s_ for s_ in SHAPES if s_[0] == nm][0]
    rs = np.random.default_rng(SEED)
    for lab, dsel in (("kept (top 10% P)", np.nanmax(dec)), ("dropped (bottom 10% P)", 0)):
        cand = np.flatnonzero(dec == dsel)
        for ix in rs.choice(cand, 3, replace=False):
            r = E.iloc[ix]
            sgn = 1 if r.dir == "up" else -1
            sd = -sgn if side == "fade" else sgn
            path = trade_path_mid(r.inst, r.date, int(r.minute), int(r[f"end_{shp[3]}"]), sd, float(r.sig), shp[2])
            ex.append({"inst": r.inst, "date": r.date, "side": f"{lab}: {side} {'short' if sd < 0 else 'long'} at {int(r.minute) // 60:02d}:{int(r.minute) % 60:02d} London, P={o[ix]:.2f}, {r.vreg if isinstance(r.vreg, str) else 'regime n/a'}",
                       "r": r4(st["net"][ix] / shp[2]), "unit": "R (net, bid/ask)", "stop": -1.0, "target": shp[1] / shp[2], "path": path})
    ch.append({"type": "trades", "title": f"Six real touches: three the filter keeps, three it drops ({hnm}, {side})", "unit": "R from entry (mid path; 1R = the 0.25σ stop)",
               "note": f"Picked by seed {SEED} inside the top and bottom out-of-fold deciles, not by result; r is net on the bid/ask path. Benchmark: a random walk hits this target first about {st['y_rw'].mean() * 100:.0f}% of the time (resolved: 50%). Kept touches are busy-hour ones that resolve inside the clock; dropped ones are quiet hours that run out of time. Neither group picks the winning side.",
               "trades": ex})
    return ch


def trade_path_mid(sym, date, minute, end_m, sd, s, b):
    df = pd.read_parquet(M.BA / f"{M.BA_KEY.get(sym, sym.lower())}_m1.parquet", columns=["time", "close"],
                         filters=[("time", ">=", pd.Timestamp(date) - pd.Timedelta(hours=2)), ("time", "<=", pd.Timestamp(date) + pd.Timedelta(hours=24))])
    idx = pd.DatetimeIndex(pd.to_datetime(df["time"], utc=True)).tz_convert("Europe/London").tz_localize(None)
    keep = idx.strftime("%Y-%m-%d") == date
    mins = (idx.hour * 60 + idx.minute)[keep]
    c = np.log(df.close.to_numpy()[keep])
    i0 = int(np.searchsorted(mins, minute))
    e = c[i0]
    sel = (mins >= minute) & (mins <= end_m)
    t, cc = np.asarray(mins[sel]), c[sel]
    step = max(1, len(t) // 60)
    return [[int(tt - minute), round(float(sd * (x - e) / s / b), 3)] for tt, x in zip(t[::step], cc[::step])]


if __name__ == "__main__":
    main()
