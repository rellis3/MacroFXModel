"""regime-picks-rule (forge/REGIME_PICKS_RULE_PREREG.md).

Does a regime known before 07:00 London (ATR percentile / filtered HMM vol state / named sigma-chain) pick which of
three fixed intraday rules (FADE at the shipped p50 line, FOLLOW the first move after 07:00, BREAK the Asia range)
pays that day? Real bid/ask M1 fills, 13 instruments, walk-forward picker, 2020-08-24 -> 2026-08-21.

    python -X utf8 -I scripts/regime-picks-rule/run.py --selftest
    python -X utf8 -I scripts/regime-picks-rule/run.py            # real run (refuses if selftest fails)

Run from the repo root. Never R2 (R2_* unset). CPU capped.
"""
from __future__ import annotations

import os

for _k in [k for k in os.environ if k.startswith("R2_")]:
    del os.environ[_k]
os.environ.setdefault("OMP_NUM_THREADS", "2")
os.environ.setdefault("MKL_NUM_THREADS", "2")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "2")

import json
import math
import sys
import time
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "evidence_pack"))

SEED = 20261115
B = 2000
BLOCK = 21
N_SHUF = 200
N_PLANT = 40
BAR = 0.04
Z_CRIT = 2.64            # Holm first step over 6 cells, two-sided
LOCKBOX = pd.Timestamp("2026-08-21")
TRAIN_START = pd.Timestamp("2018-01-02")
TEST_START = pd.Timestamp("2020-08-24")
HALF2 = pd.Timestamp("2023-08-21")
OUT = ROOT / "analysis/output/regime-picks-rule"

# (display, forecast-history name, bid/ask key, group)
INSTS = [("EURUSD", "EURUSD", "eurusd", "fx"), ("GBPUSD", "GBPUSD", "gbpusd", "fx"), ("USDJPY", "USDJPY", "usdjpy", "fx"),
         ("USDCAD", "USDCAD", "usdcad", "fx"), ("AUDUSD", "AUDUSD", "audusd", "fx"), ("NZDUSD", "NZDUSD", "nzdusd", "fx"),
         ("USDCHF", "USDCHF", "usdchf", "fx"), ("EURJPY", "EURJPY", "eurjpy", "fx"), ("GBPJPY", "GBPJPY", "gbpjpy", "fx"),
         ("GOLD", "GOLD", "gold", "gold"), ("NQ", "NQ", "nq", "indices"), ("SPX500", "SPX500", "spx", "indices"),
         ("US30", "DOW", "dow", "indices")]
RULES = ["FADE", "FOLLOW", "BREAK"]
FAMS = ["atr", "hmm", "chain"]
PLANT_MAP = {"atr": {"LOW": 0, "MID": 1, "HIGH": 2}, "hmm": {"LOW": 0, "MID": 1, "HIGH": 2},
             "chain": {"UP-LO": 0, "DN-LO": 0, "UP-HI": 2, "DN-HI": 2}}

M_07, M_ENTRY_END, M_FOLLOW_END, M_EXIT = 7 * 60, 15 * 60 + 59, 11 * 60 + 59, 21 * 60 + 55


# ───────────────────────────────────────────── fill engine (one session) ──────────────────────────────────────────

def _first(mask, start=0):
    if start >= len(mask):
        return -1
    m = mask[start:]
    k = int(np.argmax(m))
    return start + k if m[k] else -1


def _exit_short(S, j, ex, stop, target):
    """Short entered on bar j. Returns exit price. Stop = buy stop (ask_h >= stop), target = buy limit (ask_l < tgt)."""
    if S["ah"][j] >= stop:                                    # entry bar: stop only
        return stop, "stop"
    if j + 1 > ex:
        return S["ac"][ex], "time"
    seg = slice(j + 1, ex + 1)
    st = S["ah"][seg] >= stop
    tg = (S["al"][seg] < target) if target is not None else np.zeros_like(st)
    ks, kt = _first(st), _first(tg)
    if ks >= 0 and (kt < 0 or ks <= kt):
        return max(stop, S["ao"][j + 1 + ks]), "stop"
    if kt >= 0:
        return target, "target"
    return S["ac"][ex], "time"


def _exit_long(S, j, ex, stop, target):
    if S["bl"][j] <= stop:
        return stop, "stop"
    if j + 1 > ex:
        return S["bc"][ex], "time"
    seg = slice(j + 1, ex + 1)
    st = S["bl"][seg] <= stop
    tg = (S["bh"][seg] > target) if target is not None else np.zeros_like(st)
    ks, kt = _first(st), _first(tg)
    if ks >= 0 and (kt < 0 or ks <= kt):
        return min(stop, S["bo"][j + 1 + ks]), "stop"
    if kt >= 0:
        return target, "target"
    return S["bc"][ex], "time"


def rule_fade(S, k07, ex, jend, O, U50, L50, U75, L75):
    pre = S["c"][k07 - 1]
    if not (L50 < pre < U50):
        return None, "outside_p50"
    seg = slice(k07, jend + 1)
    sell = S["bh"][seg] > U50
    buy = S["al"][seg] < L50
    any_ = sell | buy
    k = _first(any_)
    if k < 0:
        return None, "no_touch"
    j = k07 + k
    if sell[k] and buy[k]:
        return None, "both_same_bar"
    if sell[k]:
        px, why = _exit_short(S, j, ex, U75, O)
        return (U50 - px) / (U75 - U50), why
    px, why = _exit_long(S, j, ex, L75, O)
    return (px - L50) / (L50 - L75), why


def rule_follow(S, k07, ex, jfol, sig_px):
    P0 = S["o"][k07]
    th = 0.10 * sig_px
    seg = slice(k07, jfol + 1)
    up = S["h"][seg] >= P0 + th
    dn = S["l"][seg] <= P0 - th
    k = _first(up | dn)
    if k < 0:
        return None, "no_move"
    if up[k] and dn[k]:
        return None, "both_same_bar"
    j = k07 + k + 1
    if j > ex:
        return None, "no_next_bar"
    R = 0.25 * sig_px
    if up[k]:
        e = S["ao"][j]
        px, why = _exit_long(S, j, ex, e - R, None)
        return (px - e) / R, why
    e = S["bo"][j]
    px, why = _exit_short(S, j, ex, e + R, None)
    return (e - px) / R, why


def rule_break(S, k07, ex, jend, sig_px):
    ahi, alo = S["h"][:k07].max(), S["l"][:k07].min()
    mid = 0.5 * (ahi + alo)
    if (ahi - alo) / 2 < 0.05 * sig_px:
        return None, "asia_too_narrow"
    seg = slice(k07, jend + 1)
    lg = S["ah"][seg] >= ahi
    sh = S["bl"][seg] <= alo
    k = _first(lg | sh)
    if k < 0:
        return None, "no_break"
    if lg[k] and sh[k]:
        return None, "both_same_bar"
    j = k07 + k
    if lg[k]:
        e = max(ahi, S["ao"][j])
        px, why = _exit_long(S, j, ex, mid, None)
        return (px - e) / (ahi - mid), why
    e = min(alo, S["bo"][j])
    px, why = _exit_short(S, j, ex, mid, None)
    return (e - px) / (mid - alo), why


def session_rules(S, line):
    """S: dict of arrays for 00:00-21:59 London bars (mins, o,h,l,c mid, bo..bc, ao..ac). line: O, sig, oh50/75, ol50/75 (%)."""
    mins = S["mins"]
    if len(mins) < 600:
        return None, "few_bars"
    k07 = int(np.searchsorted(mins, M_07))
    if k07 >= len(mins) or mins[k07] > M_07 + 4:
        return None, "no_0700_bar"
    if k07 < 120:
        return None, "thin_asia"
    ex = int(np.searchsorted(mins, M_EXIT)) - 1
    jend = int(np.searchsorted(mins, M_ENTRY_END, side="right")) - 1
    jfol = int(np.searchsorted(mins, M_FOLLOW_END, side="right")) - 1
    if ex <= jend:
        return None, "short_session"
    O, sig = line["open"], line["pit_sig_used"]
    sig_px = sig / 100 * O
    U50, U75 = O * (1 + line["pit_oh_p50"] / 100), O * (1 + line["pit_oh_p75"] / 100)
    L50, L75 = O * (1 - line["pit_ol_p50"] / 100), O * (1 - line["pit_ol_p75"] / 100)
    f, fw = rule_fade(S, k07, ex, jend, O, U50, L50, U75, L75)
    g, gw = rule_follow(S, k07, ex, jfol, sig_px)
    b, bw = rule_break(S, k07, ex, jend, sig_px)
    hl = (S["h"][:ex + 1].max() - S["l"][:ex + 1].min()) / sig_px
    return {"R_FADE": f, "w_FADE": fw, "R_FOLLOW": g, "w_FOLLOW": gw, "R_BREAK": b, "w_BREAK": bw, "hl_sig": hl,
            "open_m1": S["o"][0]}, "ok"


# ───────────────────────────────────────────── data ───────────────────────────────────────────────────────────────

def load_m1(key):
    import pyarrow.parquet as pq
    t = pq.read_table(ROOT / "data/m1_bidask" / f"{key}_m1.parquet").to_pandas(ignore_metadata=True)
    if "time" not in t.columns:
        t = t.reset_index().rename(columns={"index": "time"})
    tt = pd.to_datetime(t["time"])
    if tt.dt.tz is None:
        tt = tt.dt.tz_localize("UTC")
    lon = tt.dt.tz_convert("Europe/London")
    t["utc"] = tt
    t["ldate"] = lon.dt.tz_localize(None).dt.normalize()
    t["mins"] = lon.dt.hour * 60 + lon.dt.minute
    t = t[t["ldate"] <= LOCKBOX].sort_values("utc").reset_index(drop=True)
    assert t["ldate"].max() <= LOCKBOX
    return t


def daily_bars(m):
    ny = m["utc"].dt.tz_convert("America/New_York")
    lab = (ny.dt.tz_localize(None) + pd.Timedelta(hours=7)).dt.normalize()
    g = m.assign(lab=lab).groupby("lab")
    d = pd.DataFrame({"o": g["open"].first(), "h": g["high"].max(), "l": g["low"].min(), "c": g["close"].last(),
                      "n": g["open"].size()})
    d = d[(d.index.dayofweek < 5) & (d.n >= 60)].copy()
    # completes 17:00 New York on its label date
    comp = (pd.DatetimeIndex(d.index) + pd.Timedelta(hours=17)).tz_localize("America/New_York").tz_convert("UTC")
    d["comp"] = comp
    return d


def atr_labels(d):
    pc = d.c.shift(1)
    tr = np.maximum(d.h, pc) - np.minimum(d.l, pc)
    a = (tr.rolling(14, min_periods=14).mean() / d.c).to_numpy()
    pct = np.full(len(a), np.nan)
    for i in range(len(a)):
        lo = max(0, i - 252)
        prev = a[lo:i]
        prev = prev[np.isfinite(prev)]
        if np.isfinite(a[i]) and len(prev) >= 200:
            pct[i] = ((prev < a[i]).sum() + 0.5 * (prev == a[i]).sum()) / len(prev)
    lab = np.where(np.isnan(pct), None, np.where(pct < 1 / 3, "LOW", np.where(pct > 2 / 3, "HIGH", "MID")))
    return lab


def chain_labels(d):
    r = np.log(d.c).diff()
    s20 = r.rolling(20, min_periods=20).sum()
    sd20 = r.rolling(20, min_periods=20).std()
    med = sd20.shift(1).rolling(250, min_periods=100).median()
    ok = s20.notna() & sd20.notna() & med.notna()
    lab = np.where(~ok, None, np.where(s20 >= 0, "UP", "DN").astype(object) + "-" + np.where(sd20 > med, "HI", "LO"))
    return np.where(ok, lab, None)


def _gauss_logpdf(x, mu, var):
    return -0.5 * (np.log(2 * np.pi * var)[None, :] + (x[:, None] - mu[None, :]) ** 2 / var[None, :])


def forward_filter(model, x):
    mu = model.means_[:, 0]
    var = np.array([np.diag(c)[0] for c in model.covars_])
    lp = _gauss_logpdf(x, mu, var)
    K = len(mu)
    A = model.transmat_
    out = np.empty((len(x), K))
    a = np.log(model.startprob_ + 1e-300) + lp[0]
    a -= np.logaddexp.reduce(a)
    out[0] = a
    logA = np.log(A + 1e-300)
    for t in range(1, len(x)):
        a = np.logaddexp.reduce(a[:, None] + logA, axis=0) + lp[t]
        a -= np.logaddexp.reduce(a)
        out[t] = a
    return np.exp(out)


def fit_hmm(x, seed=SEED):
    from hmmlearn.hmm import GaussianHMM

    def best(xx, K):
        bm, bl = None, -np.inf
        for s in range(4):
            m = GaussianHMM(n_components=K, covariance_type="diag", n_iter=200, tol=1e-4, min_covar=1e-3,
                            random_state=seed + s)
            try:
                m.fit(xx.reshape(-1, 1))
                ll = m.score(xx.reshape(-1, 1))
            except Exception:
                continue
            if np.isfinite(ll) and ll > bl:
                bm, bl = m, ll
        return bm
    n = len(x)
    cut = int(0.8 * n)
    held = {}
    for K in (2, 3):
        m = best(x[:cut], K)
        held[K] = m.score(x[cut:].reshape(-1, 1)) if m is not None else -np.inf
    K = 2 if held[2] >= held[3] else 3
    return best(x, K), K


def hmm_labels(d, years):
    """Per calendar year fold: filtered (and smoothed, canary) labels for every daily bar through the year end.
    Returns dict year -> (filtered labels array over d, smoothed labels array, K, dwell)."""
    r = np.log(d.c).diff().to_numpy()
    idx = pd.DatetimeIndex(d.index)
    out = {}
    for Y in years:
        tr = (idx < pd.Timestamp(f"{Y}-01-01")) & np.isfinite(r)
        if tr.sum() < 200:
            continue
        sd = r[tr].std(ddof=1)
        m, K = fit_hmm(r[tr] / sd)
        upto = (idx < pd.Timestamp(f"{Y + 1}-01-01")) & np.isfinite(r)
        ii = np.flatnonzero(upto)
        x = r[ii] / sd
        filt = forward_filter(m, x)
        smo = m.predict_proba(x.reshape(-1, 1))
        var = np.array([np.diag(c)[0] for c in m.covars_])
        order = np.argsort(var)
        names = ["LOW", "HIGH"] if K == 2 else ["LOW", "MID", "HIGH"]
        rank = np.empty(K, int)
        rank[order] = np.arange(K)
        fl = np.full(len(d), None, dtype=object)
        sl = np.full(len(d), None, dtype=object)
        fl[ii] = np.array(names, dtype=object)[rank[filt.argmax(1)]]
        sl[ii] = np.array(names, dtype=object)[rank[smo.argmax(1)]]
        st = rank[filt.argmax(1)]
        flips = float((np.diff(st) != 0).mean())
        out[Y] = (fl, sl, K, flips)
    return out


def build_instrument(disp, fh, key, grp, log):
    m = load_m1(key)
    lines = pd.read_csv(ROOT / "analysis/output/forecast_history" / f"{fh}.csv",
                        usecols=["date", "oos", "open", "pit_sig_used", "pit_oh_p50", "pit_oh_p75", "pit_ol_p50",
                                 "pit_ol_p75"])
    lines["date"] = pd.to_datetime(lines["date"])
    lines = lines[(lines.date >= TRAIN_START) & (lines.date <= LOCKBOX)].set_index("date")
    d = daily_bars(m)
    d["atr"] = atr_labels(d)
    d["chain"] = chain_labels(d)
    years = sorted(set(lines.index.year))
    H = hmm_labels(d, years)
    comp = d["comp"].dt.tz_convert("UTC").dt.tz_localize(None).to_numpy("datetime64[ns]")
    sess = m[m["mins"] < 22 * 60]
    starts = np.flatnonzero(np.r_[True, sess["ldate"].to_numpy()[1:] != sess["ldate"].to_numpy()[:-1]])
    ends = np.r_[starts[1:], len(sess)]
    dates = sess["ldate"].to_numpy()[starts]
    arr = {c: sess[c].to_numpy(float) for c in ["open", "high", "low", "close", "bid_o", "bid_h", "bid_l", "bid_c",
                                                 "ask_o", "ask_h", "ask_l", "ask_c"]}
    mins = sess["mins"].to_numpy()
    rows, skips = [], {}
    pos = {pd.Timestamp(x): (a, b) for x, a, b in zip(dates, starts, ends)}
    for dt_, ln in lines.iterrows():
        rec = {"inst": disp, "group": grp, "date": dt_, "oos": int(ln.oos)}
        if dt_.dayofweek >= 5:
            continue
        if dt_ not in pos or not np.isfinite(ln[["open", "pit_sig_used", "pit_oh_p50", "pit_oh_p75", "pit_ol_p50",
                                                   "pit_ol_p75"]].to_numpy(float)).all():
            skips["no_m1_or_line"] = skips.get("no_m1_or_line", 0) + 1
            continue
        a, b = pos[dt_]
        S = {"mins": mins[a:b], "o": arr["open"][a:b], "h": arr["high"][a:b], "l": arr["low"][a:b],
             "c": arr["close"][a:b], "bo": arr["bid_o"][a:b], "bh": arr["bid_h"][a:b], "bl": arr["bid_l"][a:b],
             "bc": arr["bid_c"][a:b], "ao": arr["ask_o"][a:b], "ah": arr["ask_h"][a:b], "al": arr["ask_l"][a:b],
             "ac": arr["ask_c"][a:b]}
        res, why = session_rules(S, ln)
        if res is None:
            skips[why] = skips.get(why, 0) + 1
            continue
        dec = (dt_ + pd.Timedelta(hours=7)).tz_localize("Europe/London").tz_convert("UTC")
        k = int(np.searchsorted(comp, np.datetime64(dec.tz_convert("UTC").tz_localize(None), "ns"), side="right")) - 1
        if k < 0:
            skips["no_daily"] = skips.get("no_daily", 0) + 1
            continue
        rec.update(res)
        rec["atr"] = d["atr"].iat[k]
        rec["chain"] = d["chain"].iat[k]
        Y = dt_.year
        if Y in H:
            rec["hmm"], rec["hmm_s"], rec["hmm_K"] = H[Y][0][k], H[Y][1][k], H[Y][2]
        else:
            rec["hmm"] = rec["hmm_s"] = None
            rec["hmm_K"] = None
        rec["daily_label"] = d.index[k]
        rec["open_mismatch"] = abs(res["open_m1"] / ln.open - 1) > 1e-4
        rows.append(rec)
    df = pd.DataFrame(rows)
    hinfo = {int(Y): {"K": int(v[2]), "flip_rate": v[3]} for Y, v in H.items()}
    log(f"{disp}: {len(df)} sessions, skips {skips}, HMM {hinfo}")
    return df, skips, hinfo


# ───────────────────────────────────────────── picker + statistics ────────────────────────────────────────────────

def refit_dates(test_dates):
    td = pd.DatetimeIndex(sorted(set(test_dates)))
    out = [td[0]]
    q = td.to_period("Q")
    for i in range(1, len(td)):
        if q[i] != q[i - 1]:
            out.append(td[i])
    return out


def run_picker(codes, R, dnum, refits_num, train_mask, n_codes, min_n=100):
    """codes: int label per row (-1 = none). R: (n,3) net R (0 = no trade). Returns pick per row (-1 FLAT) and the
    pick table per refit."""
    n = len(codes)
    pick = np.full(n, -1)
    table = []
    edges = list(refits_num) + [np.inf]
    for i in range(len(refits_num)):
        tr = train_mask & (dnum < edges[i]) & (codes >= 0)
        cnt = np.bincount(codes[tr], minlength=n_codes)
        sums = np.stack([np.bincount(codes[tr], weights=R[tr, k], minlength=n_codes) for k in range(3)], 1)
        means = sums / np.maximum(cnt, 1)[:, None]
        best = means.argmax(1)
        ch = np.where((cnt >= min_n) & (means.max(1) > 0), best, -1)
        table.append(ch)
        sel = (dnum >= edges[i]) & (dnum < edges[i + 1]) & (codes >= 0)
        pick[sel] = ch[codes[sel]]
    return pick, table


def book_R(pick, R):
    out = np.zeros(len(pick))
    ok = pick >= 0
    out[ok] = R[ok, pick[ok]]
    return out


class DateStats:
    def __init__(self, dates, rng):
        self.ud, self.inv = np.unique(dates, return_inverse=True)
        N = len(self.ud)
        nb = int(np.ceil(N / BLOCK))
        st = rng.integers(0, N - BLOCK + 1, size=(B, nb))
        self.idx = (st[:, :, None] + np.arange(BLOCK)).reshape(B, -1)[:, :N]
        self.N = N

    def sums(self, v):
        return np.bincount(self.inv, weights=v, minlength=self.N), np.bincount(self.inv, minlength=self.N).astype(float)

    def ci(self, v):
        s, c = self.sums(v)
        bs = s[self.idx].sum(1) / c[self.idx].sum(1)
        return float(s.sum() / c.sum()), float(np.percentile(bs, 2.5)), float(np.percentile(bs, 97.5)), float(bs.std(ddof=1))


def block_shuffle_codes(codes, inst_idx, rng):
    out = codes.copy()
    for g in np.unique(inst_idx):
        ii = np.flatnonzero(inst_idx == g)          # rows already in date order
        nb = int(np.ceil(len(ii) / BLOCK))
        blocks = [ii[k * BLOCK:(k + 1) * BLOCK] for k in range(nb)]
        perm = rng.permutation(nb)
        vals = np.concatenate([codes[blocks[p]] for p in perm])[:len(ii)]
        out[ii] = vals
    return out


def holm(ps):
    ps = np.asarray(ps, float)
    o = np.argsort(ps)
    m = len(ps)
    adj = np.empty(m)
    run = 0.0
    for r, i in enumerate(o):
        run = max(run, min(1.0, (m - r) * ps[i]))
        adj[i] = run
    return adj


def bh(ps, q=0.10):
    ps = np.asarray(ps, float)
    m = len(ps)
    o = np.argsort(ps)
    thr = q * (np.arange(1, m + 1)) / m
    passed = ps[o] <= thr
    k = np.flatnonzero(passed).max() + 1 if passed.any() else 0
    out = np.zeros(m, bool)
    out[o[:k]] = True
    return out


def p_from_z(z):
    return float(math.erfc(abs(z) / math.sqrt(2)))


# ───────────────────────────────────────────── analysis core ──────────────────────────────────────────────────────

def analyse(df, rng, log, n_shuf=N_SHUF, n_plant=N_PLANT, packs=True):
    df = df.sort_values(["inst", "date"]).reset_index(drop=True)
    R = np.nan_to_num(df[["R_FADE", "R_FOLLOW", "R_BREAK"]].to_numpy(float), nan=0.0)
    dnum = df["date"].to_numpy("datetime64[D]").astype(np.int64)
    test = (df["oos"].to_numpy() == 1) & (df["date"] >= TEST_START).to_numpy()
    train = np.ones(len(df), bool)
    refits = refit_dates(df.loc[test, "date"])
    refits_num = np.array(refits, dtype="datetime64[D]").astype(np.int64)
    inst_idx = pd.factorize(df["inst"])[0]
    T = df[test].reset_index(drop=True)
    ds = DateStats(T["date"].to_numpy("datetime64[D]"), rng)
    h2 = (T["date"] >= HALF2).to_numpy()
    halves = {}
    for nm, msk in (("H1", ~h2), ("H2", h2)):
        halves[nm] = DateStats(T.loc[msk, "date"].to_numpy("datetime64[D]"), rng)

    def codes_of(col):
        cats = sorted({x for x in df[col] if x is not None and x == x})
        mp = {c: i for i, c in enumerate(cats)}
        return np.array([mp.get(x, -1) if x is not None and x == x else -1 for x in df[col]]), cats

    zero_codes = np.zeros(len(df), int)
    pick0, tab0 = run_picker(zero_codes, R, dnum, refits_num, train, 1)
    b0 = book_R(pick0, R)
    res = {"refits": [str(x.date()) for x in refits], "n_test_rows": int(test.sum()), "n_test_dates": int(ds.N),
           "n_train_rows": int(len(df)), "always": {}, "book0": {}, "families": {}}
    for k, nm in enumerate(RULES):
        e, lo, hi, se = ds.ci(R[test, k])
        res["always"][nm] = {"est": e, "lo": lo, "hi": hi, "trade_rate": float(df.loc[test, f"R_{nm}"].notna().mean()),
                             "per_trade": float(df.loc[test, f"R_{nm}"].mean())}
    e, lo, hi, se = ds.ci(b0[test])
    res["book0"] = {"est": e, "lo": lo, "hi": hi, "picks": [RULES[p] if p >= 0 else "FLAT" for p in [t[0] for t in tab0]]}

    fam_out, books = {}, {}
    for F in FAMS:
        codes, cats = codes_of(F)
        pk, tab = run_picker(codes, R, dnum, refits_num, train, len(cats))
        bF = book_R(pk, R)
        books[F] = (pk, bF)
        c1 = ds.ci(bF[test])
        c2 = ds.ci((bF - b0)[test])
        hv = {nm: {"C1": hs.ci(bF[test][(~h2 if nm == "H1" else h2)])[0],
                   "C2": hs.ci((bF - b0)[test][(~h2 if nm == "H1" else h2)])[0]} for nm, hs in halves.items()}
        # label-block shuffle
        sh1, sh2 = [], []
        for s in range(n_shuf):
            cs = block_shuffle_codes(codes, inst_idx, rng)
            pks, _ = run_picker(cs, R, dnum, refits_num, train, len(cats))
            bs = book_R(pks, R)
            sh1.append(bs[test].mean())
            sh2.append((bs - b0)[test].sum() / test.sum())
        sh1, sh2 = np.array(sh1), np.array(sh2)
        vs_rule = {}
        for k, nm in enumerate(RULES):
            vs_rule[nm] = dict(zip(["est", "lo", "hi", "se"], ds.ci((bF - R[:, k])[test])))
        # regime x rule table on test
        rxr = []
        for ci_, c in enumerate(cats):
            msk = test & (codes == ci_)
            if msk.sum() < 30:
                continue
            sub = DateStats(df.loc[msk, "date"].to_numpy("datetime64[D]"), rng)
            for k, nm in enumerate(RULES):
                e_, l_, h_, s_ = sub.ci(R[msk, k])
                rxr.append({"regime": c, "rule": nm, "n": int(msk.sum()), "est": e_, "lo": l_, "hi": h_,
                            "p": p_from_z(e_ / s_) if s_ > 0 else 1.0})
        if rxr:
            flags = bh([x["p"] for x in rxr])
            for x, f in zip(rxr, flags):
                x["bh_q10"] = bool(f)
        picks_hist = [{c: (RULES[t[i]] if t[i] >= 0 else "FLAT") for i, c in enumerate(cats)} for t in tab]
        share = {c: float((codes[test] == i).mean()) for i, c in enumerate(cats)}
        fam_out[F] = {"cats": cats, "C1": dict(zip(["est", "lo", "hi", "se"], c1)), "C2": dict(zip(["est", "lo", "hi", "se"], c2)),
                      "halves": hv, "shuffle": {"C1": {"mean": float(sh1.mean()), "sd": float(sh1.std(ddof=1)),
                                                       "p97_5": float(np.percentile(sh1, 97.5)),
                                                       "real_pct": float((sh1 < c1[0]).mean() * 100)},
                                                "C2": {"mean": float(sh2.mean()), "sd": float(sh2.std(ddof=1)),
                                                       "p97_5": float(np.percentile(sh2, 97.5)),
                                                       "real_pct": float((sh2 < c2[0]).mean() * 100)}},
                      "vs_rule": vs_rule, "regime_x_rule": rxr, "picks": picks_hist, "label_share_test": share,
                      "flat_share_test": float((pk[test] < 0).mean()),
                      "pick_share_test": {("FLAT" if p < 0 else RULES[p]): float((pk[test] == p).mean()) for p in (-1, 0, 1, 2)}}
        log(f"{F}: C1 {c1[0]:+.4f} [{c1[1]:+.4f},{c1[2]:+.4f}]  C2 {c2[0]:+.4f} [{c2[1]:+.4f},{c2[2]:+.4f}]")

    # G5: hmm vs chain
    g5 = ds.ci((books["hmm"][1] - books["chain"][1])[test])
    res["hmm_minus_chain"] = dict(zip(["est", "lo", "hi", "se"], g5))

    # plants (G6)
    for F in FAMS:
        codes, cats = codes_of(F)
        d1, d2, rec1, rec2 = 0, 0, [], []
        for s in range(n_plant):
            Rp = plant(R, df, codes, cats, F, rng)
            pk, _ = run_picker(codes, Rp, dnum, refits_num, train, len(cats))
            p0, _ = run_picker(zero_codes, Rp, dnum, refits_num, train, 1)
            bF, bb = book_R(pk, Rp), book_R(p0, Rp)
            for which, v in (("C1", bF[test]), ("C2", (bF - bb)[test])):
                e_, l_, h_, s_ = ds.ci(v)
                se = max(s_, fam_out[F]["shuffle"][which]["sd"])
                hit = (e_ / se >= Z_CRIT) and l_ > 0
                if which == "C1":
                    d1 += hit; rec1.append(e_)
                else:
                    d2 += hit; rec2.append(e_)
        fam_out[F]["plant"] = {"C1": {"detected": d1 / n_plant, "mean_recovered": float(np.mean(rec1))},
                               "C2": {"detected": d2 / n_plant, "mean_recovered": float(np.mean(rec2))}}
        log(f"{F}: plant detection C1 {d1 / n_plant:.0%} (rec {np.mean(rec1):+.4f}), C2 {d2 / n_plant:.0%} (rec {np.mean(rec2):+.4f})")

    # leak canaries
    can = {}
    codes_s, cats_s = codes_of("hmm_s")
    pk, _ = run_picker(codes_s, R, dnum, refits_num, train, len(cats_s))
    bS = book_R(pk, R)
    can["hmm_smoothed"] = {"C1": float(bS[test].mean()), "C2": float((bS - b0)[test].mean()),
                           "label_agreement_with_filtered": float((df["hmm_s"] == df["hmm"]).mean())}
    q = df["hl_sig"].quantile([1 / 3, 2 / 3]).to_numpy()
    df["realised"] = np.where(df.hl_sig < q[0], "LOW", np.where(df.hl_sig > q[1], "HIGH", "MID"))
    codes_r, cats_r = codes_of("realised")
    pk, _ = run_picker(codes_r, R, dnum, refits_num, train, len(cats_r))
    bR = book_R(pk, R)
    can["realised_day"] = {"C1": float(bR[test].mean()), "C2": float((bR - b0)[test].mean())}
    res["canaries"] = can
    res["families"] = fam_out
    return res, df, books, b0, test, R, bS, pick0


def plant(R, df, codes, cats, F, rng):
    """Add, per regime r, an increment on the mapped rule's traded rows so its mean per instrument-session in r
    exceeds the best alternative (incl. flat) by BAR (full sample); random 2x-on-half for variation."""
    Rp = R.copy()
    traded = ~np.isnan(df[["R_FADE", "R_FOLLOW", "R_BREAK"]].to_numpy(float))
    mp = PLANT_MAP[F]
    for ci_, c in enumerate(cats):
        if c not in mp:
            continue
        k = mp[c]
        msk = codes == ci_
        if msk.sum() == 0:
            continue
        means = R[msk].mean(0)
        alt = max(0.0, max(means[j] for j in range(3) if j != k))
        need = BAR + alt - means[k]
        tr = msk & traded[:, k]
        rate = tr.sum() / msk.sum()
        if rate <= 0 or need <= 0:
            continue
        per = need / rate
        coin = rng.random(len(R)) < 0.5
        Rp[tr & coin, k] += 2 * per
    return Rp


# ───────────────────────────────────────────── selftest ───────────────────────────────────────────────────────────

def _synthetic_panel(rng, effect, n_inst=13):
    dates = pd.bdate_range("2018-01-02", "2026-08-21")
    rows = []
    P = np.array([[0.95, 0.04, 0.01], [0.03, 0.94, 0.03], [0.01, 0.04, 0.95]])
    cumP = P.cumsum(1)
    ST = np.zeros((len(dates), n_inst), int)
    U = rng.random((len(dates), n_inst))
    ST[0] = rng.integers(0, 3, n_inst)
    for t in range(1, len(dates)):
        ST[t] = (U[t][:, None] > cumP[ST[t - 1]]).sum(1)
    base = np.array([0.02, 0.0, -0.02])         # rules with different, regime-free means: the picker trades
    for i in range(n_inst):
        st = ST[:, i]
        R = base + rng.normal(0.0, 1.0, size=(len(dates), 3))
        tr = rng.random((len(dates), 3)) < 0.6
        for k in range(3):
            R[st == k, k] += effect
        R[~tr] = np.nan
        lab = np.array(["LOW", "MID", "HIGH"])[st]
        rows.append(pd.DataFrame({"inst": f"I{i}", "group": "fx", "date": dates, "oos": (dates >= TEST_START).astype(int),
                                  "R_FADE": R[:, 0], "R_FOLLOW": R[:, 1], "R_BREAK": R[:, 2], "atr": lab, "hmm": lab,
                                  "chain": lab, "hmm_s": lab, "hl_sig": rng.random(len(dates))}))
    return pd.concat(rows, ignore_index=True)


def _quick_c2(df, rng, n_shuf=30):
    df = df.sort_values(["inst", "date"]).reset_index(drop=True)
    R = np.nan_to_num(df[["R_FADE", "R_FOLLOW", "R_BREAK"]].to_numpy(float), nan=0.0)
    dnum = df["date"].to_numpy("datetime64[D]").astype(np.int64)
    test = (df["oos"].to_numpy() == 1)
    refits = refit_dates(df.loc[test, "date"])
    rn = np.array(refits, dtype="datetime64[D]").astype(np.int64)
    cats = ["HIGH", "LOW", "MID"]
    codes = df["atr"].map({c: i for i, c in enumerate(cats)}).to_numpy()
    tr = np.ones(len(df), bool)
    pk, _ = run_picker(codes, R, dnum, rn, tr, 3)
    p0, _ = run_picker(np.zeros(len(df), int), R, dnum, rn, tr, 1)
    v = (book_R(pk, R) - book_R(p0, R))[test]
    ds = DateStats(df.loc[test, "date"].to_numpy("datetime64[D]"), rng)
    e, lo, hi, se = ds.ci(v)
    inst_idx = pd.factorize(df["inst"])[0]
    sh = []
    for _ in range(n_shuf):
        cs = block_shuffle_codes(codes, inst_idx, rng)
        pks, _ = run_picker(cs, R, dnum, rn, tr, 3)
        sh.append((book_R(pks, R) - book_R(p0, R))[test].mean())
    se = max(se, float(np.std(sh, ddof=1)))
    return e, lo, hi, e / se


def selftest():
    rng = np.random.default_rng(SEED)
    ok = True
    # (i) planted interaction recovered
    e, lo, hi, z = _quick_c2(_synthetic_panel(rng, 0.15), rng)
    print(f"[selftest i] planted +0.15 interaction: C2 {e:+.4f} [{lo:+.4f},{hi:+.4f}] z {z:.2f}")
    ok &= lo > 0
    # (ii) null not flagged
    e, lo, hi, z = _quick_c2(_synthetic_panel(rng, 0.0), rng)
    print(f"[selftest ii] null registered draw: C2 {e:+.4f} z {z:.2f}")
    ok &= abs(z) < Z_CRIT
    flagged = 0
    for _ in range(20):
        e, lo, hi, z = _quick_c2(_synthetic_panel(rng, 0.0, n_inst=6), rng, n_shuf=15)
        flagged += abs(z) >= Z_CRIT
    print(f"[selftest ii] null draws flagged: {flagged}/20")
    ok &= flagged <= 3
    # (iii) HMM filter, causality, smoothed leak visible
    from hmmlearn.hmm import GaussianHMM
    n = 3000
    st = np.zeros(n, int)
    for t in range(1, n):
        st[t] = st[t - 1] if rng.random() < 0.97 else 1 - st[t - 1]
    x = rng.normal(0, np.where(st == 1, 1.8, 0.6))
    m, K = fit_hmm(x[:2000] / x[:2000].std())
    xs = x / x[:2000].std()
    f = forward_filter(m, xs)
    pp = m.predict_proba(xs.reshape(-1, 1))
    d_last = float(np.abs(f[-1] - pp[-1]).max())
    print(f"[selftest iii] K chosen {K}; |filtered - hmmlearn posterior| at last obs = {d_last:.2e}")
    ok &= d_last < 1e-6
    x2 = xs.copy()
    x2[2500:] = rng.normal(0, 3, size=n - 2500)
    f2 = forward_filter(m, x2)
    same = bool((f2[:2500].argmax(1) == f[:2500].argmax(1)).all() and np.allclose(f2[:2500], f[:2500]))
    print(f"[selftest iii] filtered labels before t unchanged when returns after t perturbed: {same}")
    ok &= same
    var = np.array([np.diag(c)[0] for c in m.covars_])
    hi_state = int(np.argmax(var))
    # payoff on day t+1 depends on true state at t+1; label read from bar t
    pay = np.where(st[1:] == 1, 0.3, -0.3) + rng.normal(0, 1, n - 1)
    lab_f = f[:-1].argmax(1) == hi_state
    lab_s = pp[:-1].argmax(1) == hi_state
    diff = np.where(lab_s, pay, 0) - np.where(lab_f, pay, 0)
    bs = [diff[rng.integers(0, len(diff) - BLOCK, size=len(diff) // BLOCK)[:, None] + np.arange(BLOCK)].mean() for _ in range(500)]
    lo = float(np.percentile(bs, 2.5))
    print(f"[selftest iii] smoothed book - filtered book: {diff.mean():+.4f}, CI lower {lo:+.4f}")
    ok &= lo > 0
    # (iv) fill engine
    ok &= _engine_tests()
    print("SELFTEST", "PASSED" if ok else "FAILED")
    return ok


def _mk_session(mid_path, spread=0.0002, n_asia=420):
    """mid_path: list of (o,h,l,c) for bars from 07:00; Asia bars flat at 1.0 +/- 0.001."""
    mins = np.r_[np.arange(0, n_asia), np.arange(420, 420 + len(mid_path))]
    asia = [(1.0, 1.001, 0.999, 1.0)] * n_asia
    P = np.array(asia + list(mid_path), float)
    S = {"mins": mins, "o": P[:, 0], "h": P[:, 1], "l": P[:, 2], "c": P[:, 3]}
    for p, s in (("b", -spread / 2), ("a", spread / 2)):
        for j, c in enumerate("ohlc"):
            S[p + c] = P[:, j] + s
    return S


def _engine_tests():
    ok = True
    line = {"open": 1.0, "pit_sig_used": 1.0, "pit_oh_p50": 0.5, "pit_oh_p75": 0.8, "pit_ol_p50": 0.5, "pit_ol_p75": 0.8}
    flat = [(1.0, 1.0002, 0.9998, 1.0)]
    # FADE target: rise through U50 (1.005) then fall to open
    path = flat * 10 + [(1.0, 1.0060, 1.0, 1.0055)] + [(1.0055, 1.0056, 0.9990, 0.9995)] + flat * 900
    S = _mk_session(path)
    res, _ = session_rules(S, line)
    exp = (1.005 - 1.0) / (1.008 - 1.005)
    print(f"[selftest iv] FADE target R {res['R_FADE']:+.3f} (expect {exp:+.3f}) via {res['w_FADE']}")
    ok &= abs(res["R_FADE"] - exp) < 1e-6 and res["w_FADE"] == "target"
    # FADE stop with gap: fill at U50, next bar opens at 1.010 above stop 1.008
    path = flat * 10 + [(1.0, 1.0055, 1.0, 1.0052)] + [(1.0100, 1.0110, 1.0090, 1.0100)] + flat * 900
    res, _ = session_rules(_mk_session(path), line)
    exp = (1.005 - (1.0100 + 0.0001)) / 0.003
    print(f"[selftest iv] FADE gap-through stop R {res['R_FADE']:+.3f} (expect {exp:+.3f}) via {res['w_FADE']}")
    ok &= abs(res["R_FADE"] - exp) < 1e-6 and res["w_FADE"] == "stop"
    # FOLLOW time exit: first move up 0.10 sigma = 0.001 on bar 3; enter next bar open at ask; drift to 1.003 by exit
    path = flat * 2 + [(1.0, 1.0012, 1.0, 1.0011)] + [(1.0011, 1.0013, 1.0010, 1.0012)] + \
        [(1.0012, 1.0031, 1.0011, 1.0030)] * 896
    S = _mk_session(path)
    res, _ = session_rules(S, line)
    ex = int(np.searchsorted(S["mins"], M_EXIT)) - 1
    exp = ((1.0030 - 0.0001) - (1.0011 + 0.0001)) / 0.0025
    print(f"[selftest iv] FOLLOW time exit R {res['R_FOLLOW']:+.3f} (expect {exp:+.3f}) via {res['w_FOLLOW']}; exit bar {S['mins'][ex]}")
    ok &= abs(res["R_FOLLOW"] - exp) < 1e-6 and res["w_FOLLOW"] == "time"
    # BREAK OCO: Asia 0.999-1.001; first trigger is the short (bid_l <= 0.999), later the high also trades
    path = flat * 5 + [(1.0, 1.0, 0.9985, 0.9988)] + [(0.9988, 1.0030, 0.9988, 1.0025)] + flat * 900
    res, _ = session_rules(_mk_session(path), line)
    exp = (0.999 - 1.0) / (1.0 - 0.999)    # stop at Asia mid 1.0: short filled 0.999, stopped at 1.000
    print(f"[selftest iv] BREAK OCO short then stopped R {res['R_BREAK']:+.3f} (expect {exp:+.3f}) via {res['w_BREAK']}")
    ok &= abs(res["R_BREAK"] - exp) < 1e-6 and res["w_BREAK"] == "stop"
    return ok


# ───────────────────────────────────────────── main ───────────────────────────────────────────────────────────────

def main():
    if "--selftest" in sys.argv:
        sys.exit(0 if selftest() else 1)
    st_log = OUT / "selftest.log"
    if "--selftest-passed" in sys.argv:          # the selftest ran on its own (slow box); require its saved PASS
        if not (st_log.exists() and "SELFTEST PASSED" in st_log.read_text(encoding="utf-8")):
            sys.exit("no saved SELFTEST PASSED in selftest.log: refusing the real run")
    elif not selftest():
        sys.exit("selftest failed: refusing the real run")
    OUT.mkdir(parents=True, exist_ok=True)
    logf = open(OUT / "run.log", "w", encoding="utf-8")

    def log(s):
        print(s, flush=True)
        logf.write(s + "\n")
        logf.flush()
    t0 = time.time()
    cache = OUT / "rows.parquet"
    if cache.exists() and "--rebuild" not in sys.argv:
        df = pd.read_parquet(cache)
        meta = json.loads((OUT / "build_meta.json").read_text())
        log(f"rows from cache {cache} ({len(df)})")
    else:
        parts, meta = [], {"skips": {}, "hmm": {}}
        for disp, fh, key, grp in INSTS:
            d, sk, hi = build_instrument(disp, fh, key, grp, log)
            parts.append(d)
            meta["skips"][disp] = sk
            meta["hmm"][disp] = hi
        df = pd.concat(parts, ignore_index=True)
        for c in ("atr", "chain", "hmm", "hmm_s"):
            df[c] = df[c].astype(object).where(df[c].notna(), None)
        df["daily_label"] = pd.to_datetime(df["daily_label"])
        df.to_parquet(cache)
        (OUT / "build_meta.json").write_text(json.dumps(meta, indent=1, default=str))
        log(f"built {len(df)} rows in {time.time() - t0:.0f}s")
    assert df["date"].max() <= LOCKBOX
    n0 = len(df)
    keep = df["atr"].notna() & df["hmm"].notna() & df["chain"].notna()
    meta["dropped_no_label"] = int((~keep).sum())
    df = df[keep].reset_index(drop=True)
    log(f"common sample {len(df)} of {n0} rows (no label: {n0 - len(df)}); open mismatch share {df.open_mismatch.mean():.4f}")
    rng = np.random.default_rng(SEED)
    res, df2, books, b0, test, R, bS, pick0 = analyse(df, rng, log)
    res["build"] = meta
    res["open_mismatch_share"] = float(df["open_mismatch"].mean())

    # scoring
    cells = []
    for F in FAMS:
        fo = res["families"][F]
        for which in ("C1", "C2"):
            c = fo[which]
            se = max(c["se"], fo["shuffle"][which]["sd"])
            z = c["est"] / se
            cells.append({"cell": f"{which}-{F}", "fam": F, "which": which, "n_rows": res["n_test_rows"],
                          "n_dates": res["n_test_dates"], "est": c["est"], "lo": c["lo"], "hi": c["hi"], "se": se,
                          "z": z, "p": p_from_z(z), "bar": BAR, "H1": fo["halves"]["H1"][which],
                          "H2": fo["halves"]["H2"][which], "shuffle_p97_5": fo["shuffle"][which]["p97_5"],
                          "shuffle_pct": fo["shuffle"][which]["real_pct"], "detected": fo["plant"][which]["detected"],
                          "mde": (Z_CRIT + 0.84) * se})
    adj = holm([c["p"] for c in cells])
    for c, a in zip(cells, adj):
        g = {"G1": a < 0.05, "G2": c["est"] >= BAR, "G3": c["H1"] > 0 and c["H2"] > 0,
             "G4": c["est"] > c["shuffle_p97_5"], "G6": c["detected"] >= 0.8}
        if c["cell"] == "C2-hmm":
            g["G5"] = res["hmm_minus_chain"]["lo"] > 0
        c["holm_p"] = float(a)
        c["gates"] = g
        powered = g["G6"]
        if all(g.values()):
            w = "VALIDATED"
        elif powered and c["hi"] < BAR:
            w = "CONTEXT" if (c["lo"] > 0 or c["hi"] < 0) else "NULL"
        else:
            w = "UNDERPOWERED"
        c["verdict"] = w
    res["cells"] = cells
    fam_words = {}
    for F in FAMS:
        c1 = next(c for c in cells if c["cell"] == f"C1-{F}")
        c2 = next(c for c in cells if c["cell"] == f"C2-{F}")
        w = c2["verdict"]
        if w == "VALIDATED" and c1["est"] <= 0:
            w = "CONTEXT"
        fam_words[F] = w
    res["family_verdicts"] = fam_words
    res.update({"id": "regime-picks-rule", "seed": SEED, "B": B, "block": BLOCK, "n_shuffles": N_SHUF, "n_plants": N_PLANT,
                "bar": BAR, "ranAt": pd.Timestamp.now(tz="UTC").strftime("%Y-%m-%dT%H:%M:%SZ"),
                "prereg": "forge/REGIME_PICKS_RULE_PREREG.md", "branch": "claude/signal-bot-bias-analysis-bwr1qv"})

    # descriptive breakdowns: by instrument (C1, C2 per family; BH), by group, by year
    T = df2[test].reset_index(drop=True)
    desc = {"by_inst": [], "by_group": [], "by_year": []}
    for F in FAMS:
        bF = books[F][1][test]
        d2 = bF - b0[test]
        for col, key in (("inst", "by_inst"), ("group", "by_group")):
            for g, idx in T.groupby(col).groups.items():
                idx = np.asarray(idx)
                sub = DateStats(T.loc[idx, "date"].to_numpy("datetime64[D]"), rng)
                e1 = sub.ci(bF[idx]); e2 = sub.ci(d2[idx])
                desc[key].append({"fam": F, col: g, "n": int(len(idx)), "C1": e1[0], "C1_lo": e1[1], "C1_hi": e1[2],
                                  "C2": e2[0], "C2_lo": e2[1], "C2_hi": e2[2], "p_C2": p_from_z(e2[0] / e2[3]) if e2[3] > 0 else 1})
        for y, idx in T.groupby(T["date"].dt.year).groups.items():
            idx = np.asarray(idx)
            desc["by_year"].append({"fam": F, "year": int(y), "C1": float(bF[idx].mean()), "C2": float(d2[idx].mean())})
    bi = [x for x in desc["by_inst"]]
    fl = bh([x["p_C2"] for x in bi])
    for x, f in zip(bi, fl):
        x["bh_q10"] = bool(f)
    res["descriptive"] = desc
    # always-rule per instrument (for the 'why')
    ar = []
    for g, idx in T.groupby("inst").groups.items():
        idx = np.asarray(idx)
        ar.append({"inst": g, **{nm: float(R[test][idx, k].mean()) for k, nm in enumerate(RULES)},
                   **{f"{nm}_per_trade": float(T.loc[idx, f"R_{nm}"].mean()) for nm in RULES}})
    res["always_by_inst"] = ar
    skipc = {}
    for nm in RULES:
        skipc[nm] = T[f"w_{nm}"].value_counts().to_dict()
    res["exit_or_skip_reasons_test"] = skipc

    # evidence packs
    from pack import build_pack
    est_fn = lambda r: float((r["side"] * r["outcome"]).sum() / len(r))
    mean3 = R[test].mean(1)
    blk = (pd.factorize(T["date"])[0] // BLOCK)
    T["cluster"] = blk
    pack_out = {}
    for F in FAMS:
        pk = books[F][0][test]
        bF = books[F][1][test]
        p0 = None
        for which in ("C1", "C2"):
            rows = pd.DataFrame({"date": T["date"], "inst": T["inst"], "cluster": T["cluster"],
                                 "signal": T[F].astype(str)})
            if which == "C1":
                rows["side"] = (pk >= 0).astype(int)
                rows["outcome"] = np.where(pk >= 0, bF, mean3)
                leak_vals = np.maximum(R[test].max(1), 0.0)
                leak_side = np.ones(len(rows), int)
            else:
                rows["side"] = (books[F][0][test] != pick0[test]).astype(int)
                rows["outcome"] = bF - b0[test]
                if F == "hmm":
                    leak_vals = bS[test] - b0[test]
                else:
                    leak_vals = np.maximum(R[test].max(1), 0.0) - b0[test]
                leak_side = np.ones(len(rows), int)
            if which == "C1" and F == "hmm":
                leak_vals = bS[test]
                leak_side = np.ones(len(rows), int)

            def plant_fn(r, eff, g, _s=None):
                r = r.copy()
                sh = max(float((r["side"] != 0).mean()), 1e-9)
                r.loc[r["side"] != 0, "outcome"] = r.loc[r["side"] != 0, "outcome"] + eff / sh
                return r

            def leak_fn(r, g, _lv=leak_vals, _ls=leak_side):
                r = r.copy()
                r["outcome"] = _lv
                r["side"] = _ls
                return r
            word = next(c["verdict"] for c in cells if c["cell"] == f"{which}-{F}")
            note = ("Rows = test instrument-sessions 2020-08-24 -> 2026-08-21, 13 instruments; unit R per instrument-"
                    "session; cluster = 21-session date block. " +
                    ("C1: outcome = the regime book's net R (flat sessions carry the mean of the three rules' R with "
                     "side 0, so estimate = book mean). " if which == "C1" else
                     "C2: outcome = regime book minus regime-free picker; side = 1 where the picks differ. ") +
                    "The pack's placebo shuffles side within instrument; the registered noise threshold is the run's "
                    "regime-label block shuffle (RESULTS.md). Leak: " +
                    ("smoothed (forward-backward) HMM labels re-picked." if F == "hmm" else
                     "the realised-day oracle (best of the three rules and flat that day)."))
            pk_ = build_pack(rows, slug=f"regime-picks-rule {which}-{F}", out=str(OUT / f"{which}-{F}"),
                             estimate_fn=est_fn, bar=BAR, unit="R per instrument-session", plant_fn=plant_fn,
                             leak_fn=leak_fn, verdict_word=word, seed=SEED, B=1000, n_placebo=300, n_plants=40,
                             signal_is_state=True, notes=note)
            pack_out[f"{which}-{F}"] = {"label": pk_["diagnosis"]["label"], "checks": pk_["diagnosis"]["checks"],
                                        "plant": pk_["positive_control"], "canary": pk_.get("lookahead_canary"),
                                        "placebo": pk_["placebo"]}
            log(f"pack {which}-{F}: {pk_['diagnosis']['label']}")
    res["evidence_packs"] = pack_out
    (OUT / "results.json").write_text(json.dumps(res, indent=1, default=str))
    log(f"done in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
