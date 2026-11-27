"""gold-rolling-mae-window (forge/GOLD_ROLLING_MAE_WINDOW_PREREG.md, pushed 2b7e2279).

Jordan's "jackets" question on gold's 18 shadow lines: stop = median line-to-line MAE of that level type over a trailing
window (10 windows, 1 session .. 252 sessions); miss vs the next 21 sessions' median MAE, IS 2021-22 / OOS 2023-26; then
fade every first touch with that stop (target = the line inside, BE at +1R), costs on, pessimistic.

    python scripts/gold-rolling-mae-window/run.py [SYM]      (default GOLD)
"""
from __future__ import annotations

import json
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from numba import njit

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/ladder-v2"))
import ladder as L  # noqa: E402

SEED, B, BLOCK, NPERM = 20261127, 2000, 63, 100
WINS = {"1d": 1, "2d": 2, "1w": 5, "2w": 10, "3w": 15, "1m": 21, "2m": 42, "3m": 63, "6m": 126, "12m": 252}
FUT = 21
MIN_TRUTH = 5
MIN_GAP = 0.05
FAMS = ("oh", "ol", "cup", "cdn", "hlH", "hlL")          # short side: oh, cup, hlH
SHORT = {"oh": True, "cup": True, "hlH": True, "ol": False, "cdn": False, "hlL": False}
TIERS = (50, 75, 90)
LEVELS = [f"{f}{t}" for f in FAMS for t in TIERS]
START_SCORE, IS_END = pd.Timestamp("2021-01-01"), 2022
TGT, STP, BEX, TIME = 0, 1, 2, 3


def tick_of(px):
    u = np.unique(np.round(px[np.isfinite(px)], 8))
    d = np.diff(u); d = d[d > 1e-9]
    return float(np.quantile(d, 0.01))


def load_sessions(sym):
    m = L.load_m1(sym, "F", "unadj")
    tick = tick_of(m["close"].to_numpy()[-200000:])
    lt = m.index.tz_convert("Europe/London")
    keep = (lt.hour < 22) & (lt.dayofweek < 5)
    m, lt = m[keep], lt[keep]
    di = pd.Index(lt.tz_localize(None).normalize())
    H, Lo, C, O = (m[c].to_numpy(float) for c in ("high", "low", "close", "open"))
    st = np.flatnonzero(np.r_[True, di[1:] != di[:-1]]); en = np.r_[st[1:], len(di)]
    D = {}
    for s, e in zip(st, en):
        if e - s >= 600:
            D[di[s]] = (np.ascontiguousarray(H[s:e]), np.ascontiguousarray(Lo[s:e]), np.ascontiguousarray(C[s:e]), float(O[s]))
    return D, tick


@njit(cache=True)
def mae_of(h, l, t, entry, short, tp, outer):
    """Jordan line-to-line MAE from the touch bar t: until the target (not on the touch bar), the next line out (capped
    at the gap) or the session end. outer = nan -> uncapped. Returns (mae, how 0 tgt / 1 outer / 3 time)."""
    worst = 0.0
    n = h.shape[0]
    cap = abs(outer - entry) if np.isfinite(outer) else 1e18
    for j in range(t, n):
        adv = (h[j] - entry) if short else (entry - l[j])
        if adv > worst:
            worst = adv
        if worst >= cap:
            return cap, 1
        if j > t and ((short and l[j] <= tp) or ((not short) and h[j] >= tp)):
            return worst, 0
    return worst, 3


@njit(cache=True)
def trade(h, l, c, t, entry, short, tp, S, be, slip_in, slip_out, comm):
    """Fade at entry from bar t: stop entry +/- S, target tp (not on the touch bar), BE at +1R from the next bar,
    pessimistic (stop first). Returns (netR, how)."""
    n = h.shape[0]
    SP = entry + S if short else entry - S
    moved = False
    for j in range(t, n):
        hs = (h[j] >= SP) if short else (l[j] <= SP)
        if hs:
            ex = SP
            g = (entry - ex) if short else (ex - entry)
            return (g - slip_in - slip_out - comm) / S, (BEX if moved else STP)
        if j > t and ((short and l[j] <= tp) or ((not short) and h[j] >= tp)):
            g = (entry - tp) if short else (tp - entry)
            return (g - slip_in - comm) / S, TGT
        if be and not moved and j > t:
            if (short and l[j] <= entry - S) or ((not short) and h[j] >= entry + S):
                SP = entry; moved = True                  # effective from the next bar
    ex = c[n - 1]
    g = (entry - ex) if short else (ex - entry)
    return (g - slip_in - slip_out - comm) / S, TIME


def touches(D, W, perm=None):
    """First touch of each of the 18 lines per session. Rows: date, si, level, short, t, entry, tp, outer, sig$, mae, how."""
    rows = []
    dates = W["date"].to_numpy()
    cols = {q: W[[f"{q}{t}" for t in TIERS]].to_numpy() for q in ("oh", "ol", "cup", "cdn", "hl")}
    sig = W["sig"].to_numpy()
    src = np.arange(len(W)) if perm is None else perm
    for si, iw in enumerate(src):
        d = pd.Timestamp(dates[si])
        x = D.get(d)
        if x is None:
            continue
        h, l, c, o = x
        n = len(h)
        if not all(np.all(np.isfinite(cols[q][iw])) for q in cols) or not np.isfinite(sig[iw]):
            continue
        sg = sig[iw] / 100 * o
        rl = np.minimum(o, np.r_[o, np.minimum.accumulate(l)[:-1]])
        rh = np.maximum(o, np.r_[o, np.maximum.accumulate(h)[:-1]])
        P = {}
        for k, t_ in enumerate(TIERS):
            P[f"oh{t_}"] = np.full(n, o * (1 + cols["oh"][iw, k] / 100))
            P[f"cup{t_}"] = np.full(n, o * (1 + cols["cup"][iw, k] / 100))
            P[f"ol{t_}"] = np.full(n, o * (1 - cols["ol"][iw, k] / 100))
            P[f"cdn{t_}"] = np.full(n, o * (1 - cols["cdn"][iw, k] / 100))
            P[f"hlH{t_}"] = rl + cols["hl"][iw, k] / 100 * o
            P[f"hlL{t_}"] = rh - cols["hl"][iw, k] / 100 * o
        for lev in LEVELS:
            fam = lev[:-2]; sh = SHORT[fam]
            p = P[lev]
            hit = np.flatnonzero(h >= p) if sh else np.flatnonzero(l <= p)
            if not len(hit):
                continue
            t = int(hit[0]); e = float(p[t])
            same = [float(P[q][t]) for q in LEVELS if SHORT[q[:-2]] == sh and q != lev]
            if sh:
                beyond = [v for v in same if v - e > MIN_GAP * sg]; inside = [v for v in same if e - v > MIN_GAP * sg]
                outer = min(beyond) if beyond else np.nan; tp = max(inside) if inside else o
                if tp >= e: tp = o if o < e else e - sg            # never: the open is below an upper touch
            else:
                beyond = [v for v in same if e - v > MIN_GAP * sg]; inside = [v for v in same if v - e > MIN_GAP * sg]
                outer = max(beyond) if beyond else np.nan; tp = min(inside) if inside else o
                if tp <= e: tp = o if o > e else e + sg
            mae, how = mae_of(h, l, t, e, sh, tp, outer)
            rows.append((d, si, lev, sh, t, e, tp, outer, sg, mae, how))
    return pd.DataFrame(rows, columns=["date", "si", "level", "short", "t", "entry", "tp", "outer", "sig", "mae", "how"])


def rolling_stops(T, nsess, mode="usd", wins=None):
    """stop[win][level] -> array over session index (value known before the session). Also 'all' pooled.
    mode 'usd': median MAE in $; 'sig': median MAE/sig ratio (multiply by today's sig later)."""
    val = T["mae"].to_numpy() if mode == "usd" else (T["mae"] / T["sig"]).to_numpy()
    si = T["si"].to_numpy(); lev = T["level"].to_numpy()
    out = {}
    for wn, w in WINS.items():
        if wins and wn not in wins:
            continue
        out[wn] = {}
        for L_ in LEVELS + ["all"]:
            m = np.ones(len(T), bool) if L_ == "all" else (lev == L_)
            v, s = val[m], si[m]
            order = np.argsort(s, kind="stable"); v, s = v[order], s[order]
            res = np.full(nsess, np.nan)
            last = np.nan
            lo = hi = 0
            for k in range(nsess):
                while hi < len(s) and s[hi] < k:
                    hi += 1
                while lo < hi and s[lo] < k - w:
                    lo += 1
                if hi > lo:
                    last = float(np.median(v[lo:hi]))
                res[k] = last
            out[wn][L_] = res
    return out


def truth(T, nsess):
    """Median $ MAE of each level's touches over sessions [k, k+21); nan if < MIN_TRUTH touches."""
    out = {}
    for L_ in LEVELS + ["all"]:
        m = np.ones(len(T), bool) if L_ == "all" else (T["level"].to_numpy() == L_)
        v, s = T["mae"].to_numpy()[m], T["si"].to_numpy()[m]
        o = np.argsort(s, kind="stable"); v, s = v[o], s[o]
        res = np.full(nsess, np.nan)
        for k in range(nsess):
            a, b = np.searchsorted(s, k), np.searchsorted(s, k + FUT)
            need = MIN_TRUTH if L_ != "all" else MIN_TRUTH * 4
            if b - a >= need:
                res[k] = float(np.median(v[a:b]))
        out[L_] = res
    return out


def run_trades(D, T, W, stops, sigstops, win, per_level, be, mode, costs, tickfloor):
    si_, so, cm = costs
    dates = W["date"].to_numpy()
    R = np.full(len(T), np.nan); how = np.full(len(T), -1)
    Sx = np.full(len(T), np.nan)
    for i, r in enumerate(T.itertuples(index=False)):
        key = r.level if per_level else "all"
        if mode == "usd":
            S = stops[win][key][r.si]
        else:
            S = sigstops[win][key][r.si] * r.sig
        if not np.isfinite(S):
            continue
        S = max(S, tickfloor)
        h, l, c, _ = D[pd.Timestamp(dates[r.si])]
        R[i], how[i] = trade(h, l, c, r.t, r.entry, r.short, r.tp, S, be, si_, so, cm)
        Sx[i] = S
    return R, how, Sx


def boot(dates, R, rng):
    df = pd.DataFrame({"d": dates, "R": R}).dropna()
    g = df.groupby("d")["R"]
    r, n = g.sum().to_numpy(), g.count().to_numpy()
    N = len(r); nb = int(np.ceil(N / BLOCK)); v = np.empty(B)
    for b in range(B):
        st = rng.integers(0, max(N - BLOCK + 1, 1), nb)
        ii = (st[:, None] + np.arange(BLOCK)).ravel()[:N] % N
        v[b] = r[ii].sum() / max(n[ii].sum(), 1)
    return float(r.sum() / n.sum()), np.percentile(v, [5, 95]).tolist(), int(n.sum()), float(r.sum())


def main(sym="GOLD"):
    OUT = ROOT / "analysis/output/gold-rolling-mae-window" / sym
    OUT.mkdir(parents=True, exist_ok=True)
    say_lines = []
    def say(s=""):
        print(s, flush=True); say_lines.append(s)
    W = pd.read_parquet(ROOT / f"analysis/output/gold-rolling-mae-window/widths/F_{sym}.parquet")
    W["date"] = pd.to_datetime(W["date"]); W = W.sort_values("date").reset_index(drop=True)
    D, tick = load_sessions(sym)
    W = W[W["date"].isin(D.keys())].reset_index(drop=True)
    nsess = len(W)
    costs = (0.10, 0.10, 0.12) if sym == "GOLD" else (tick, tick, tick)
    floor = 5 * tick
    T = touches(D, W)
    T.to_parquet(OUT / "touches.parquet")
    yrs = W["date"].dt.year.to_numpy()
    say(f"{sym}: {nsess} sessions {W.date.min().date()} -> {W.date.max().date()}, tick {tick:g}; {len(T)} first touches "
        f"({len(T)/nsess:.1f}/session); MAE median ${T.mae.median():.2f}, exits tgt/outer/time "
        f"{(T.how==0).mean():.2f}/{(T.how==1).mean():.2f}/{(T.how==3).mean():.2f}")
    stops = rolling_stops(T, nsess, "usd")
    sstops = rolling_stops(T, nsess, "sig")
    tr = truth(T, nsess)
    score = (W["date"] >= START_SCORE).to_numpy()
    sigd = W["sig"].to_numpy() / 100 * np.array([D[d][3] for d in W["date"]])

    # ---------------- W: miss table
    rows = []
    for mode in ("usd", "sig"):
        for wn in WINS:
            for scope in ("per-level", "pooled"):
                levs = LEVELS if scope == "per-level" else ["all"]
                recs = []
                for L_ in levs:
                    st = stops[wn][L_] if mode == "usd" else sstops[wn][L_] * sigd
                    tt = tr[L_]
                    ok = score & np.isfinite(st) & np.isfinite(tt) & (tt > 0)
                    for k in np.flatnonzero(ok):
                        recs.append((yrs[k], abs(st[k] - tt[k]) / tt[k]))
                M = pd.DataFrame(recs, columns=["y", "miss"])
                by = M.groupby("y").miss.mean()
                last = stops[wn]["all"][-1] if mode == "usd" else sstops[wn]["all"][-1] * sigd[-1]
                rows.append(dict(mode=mode, scope=scope, window=wn, miss_IS=100 * M[M.y <= IS_END].miss.mean(),
                                 miss_OOS=100 * M[M.y > IS_END].miss.mean(), worst_year=int(by.idxmax()),
                                 worst=100 * by.max(), n=len(M), stop_today=last))
    MT = pd.DataFrame(rows)
    MT.to_csv(OUT / "miss_table.csv", index=False)
    pd.set_option("display.width", 220)
    say("\nMISS TABLE (% |stop - next-21-session median MAE| / truth; scored 2021+):")
    say(MT.round(2).to_string(index=False))
    pl = MT[(MT["mode"] == "usd") & (MT.scope == "per-level")]
    chosen = pl.loc[pl.miss_IS.idxmin(), "window"]
    oos_rank = int(pl.miss_OOS.rank().loc[pl.miss_IS.idxmin()])
    say(f"\nIS-chosen window (per-level, $): {chosen}; OOS rank {oos_rank}/10")

    # ---------------- per-level stop today + medians by level
    lv = T[T["date"] >= START_SCORE].groupby("level").mae.agg(["count", "mean", "median"]).reindex(LEVELS)
    lv["stop_today_" + chosen] = [stops[chosen][L_][-1] for L_ in LEVELS]
    lv.to_csv(OUT / "by_level.csv")
    say("\nMAE by level type (2021+), $:\n" + lv.round(2).to_string())

    # ---------------- T: trades
    rng = np.random.default_rng(SEED)
    oos = (T["date"].dt.year > IS_END).to_numpy() & (T["date"] >= START_SCORE).to_numpy()
    ins = (T["date"].dt.year <= IS_END).to_numpy() & (T["date"] >= START_SCORE).to_numpy()
    arms = []
    keep = {}
    for mode in ("usd", "sig"):
        for wn in WINS:
            for per_level in (True, False):
                for be in (1, 0):
                    R, how, S = run_trades(D, T, W, stops, sstops, wn, per_level, be, mode, costs, floor)
                    a = dict(mode=mode, window=wn, stops="per-level" if per_level else "pooled", be="on" if be else "off")
                    for lab, m in (("IS", ins), ("OOS", oos)):
                        pt, ci, n, tot = boot(T["date"].to_numpy()[m], R[m], rng)
                        a.update({f"{lab}_R": pt, f"{lab}_lo": ci[0], f"{lab}_hi": ci[1], f"{lab}_n": n, f"{lab}_totR": tot})
                    mm = oos & np.isfinite(R)
                    a.update(OOS_win=100 * float((R[mm] > 0).mean()), OOS_tgt=100 * float((how[mm] == TGT).mean()),
                             OOS_stop=100 * float((how[mm] == STP).mean()), OOS_be=100 * float((how[mm] == BEX).mean()),
                             OOS_time=100 * float((how[mm] == TIME).mean()), OOS_stop_med=float(np.nanmedian(S[mm])))
                    arms.append(a)
                    keep[(mode, wn, per_level, be)] = (R, how, S)
    A = pd.DataFrame(arms)
    A.to_csv(OUT / "trade_arms.csv", index=False)
    say("\nTRADES (net R per trade; 90% CI; totals in R):")
    say(A.round(3).to_string(index=False))

    # primary
    R, how, S = keep[("usd", chosen, True, 1)]
    prim = A[(A["mode"] == "usd") & (A.window == chosen) & (A.stops == "per-level") & (A.be == "on")].iloc[0].to_dict()
    # placebo: whole pipeline on shuffled widths (same-year permutation)
    prng = np.random.default_rng(SEED + 1)
    yrsW = W["year"].to_numpy()
    plm = []
    for p in range(NPERM):
        perm = np.arange(nsess)
        for y in np.unique(yrsW):
            m = yrsW == y
            perm[m] = prng.permutation(perm[m])
        Tp = touches(D, W, perm)
        sp = rolling_stops(Tp, nsess, "usd", wins=[chosen])
        Rp, _, _ = run_trades(D, Tp, W, sp, None, chosen, True, 1, "usd", costs, floor)
        mo = (Tp["date"].dt.year > IS_END).to_numpy() & np.isfinite(Rp)
        plm.append(float(Rp[mo].mean()))
        if p % 20 == 19:
            print(f"  placebo {p+1}/{NPERM}", flush=True)
    prim["pl1_mean"] = float(np.mean(plm)); prim["pl1_p95"] = float(np.percentile(plm, 95))
    if prim["OOS_hi"] < 0.05:
        v = "NULL"
    elif prim["OOS_lo"] > 0 and prim["IS_R"] > 0 and prim["OOS_R"] > prim["pl1_p95"] and prim["OOS_totR"] > 0:
        v = "VALIDATED"
    else:
        v = "UNDERPOWERED"
    prim["verdict"] = v
    say(f"\nPRIMARY T ({chosen}, per-level $, BE on): IS {prim['IS_R']:+.3f} | OOS {prim['OOS_R']:+.3f} "
        f"[{prim['OOS_lo']:+.3f},{prim['OOS_hi']:+.3f}] n {prim['OOS_n']} total {prim['OOS_totR']:+.1f}R | placebo mean "
        f"{prim['pl1_mean']:+.3f} p95 {prim['pl1_p95']:+.3f} -> {v}")
    # trade examples (OOS, last 12)
    ex = T.assign(R=R, how=how, stop=S)[oos & np.isfinite(R)].tail(12)
    ex[["date", "level", "short", "entry", "tp", "stop", "how", "R"]].to_csv(OUT / "trade_examples.csv", index=False)
    say("\nTrade examples (last 12 OOS):\n" + ex[["date", "level", "short", "entry", "tp", "stop", "how", "R"]].round(2).to_string(index=False))
    json.dump({"seed": SEED, "sym": sym, "chosen_window": chosen, "chosen_oos_rank": oos_rank, "primary": prim,
               "placebo_means": plm}, open(OUT / "results.json", "w"), indent=1, default=float)
    (OUT / "report.txt").write_text("\n".join(say_lines), encoding="utf-8")


if __name__ == "__main__":
    main(*(sys.argv[1:2] or ["GOLD"]))
