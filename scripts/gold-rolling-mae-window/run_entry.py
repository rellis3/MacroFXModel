"""gold-rolling-mae-window, amendment A2: trade arm E = Jordan's gold entry (ForecastBandFade.cs arm-then-retest,
generalised to the 18 shadow lines) with the rolling line-to-line MAE stops of W. K = Ken's reading (any poke arms,
no cancel, no chase), comparison only.

    python scripts/gold-rolling-mae-window/run_entry.py [SYM]     (default GOLD)
    -> analysis/output/gold-rolling-mae-window/<SYM>/entry_arms.csv, entry_results.json, entry_equity.csv,
       entry_examples.json, entry_report.txt
"""
from __future__ import annotations

import importlib.util
import json
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from numba import njit

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parents[2]
_sp = importlib.util.spec_from_file_location("rmw", ROOT / "scripts/gold-rolling-mae-window/run.py")
R = importlib.util.module_from_spec(_sp)
_sp.loader.exec_module(R)
L = R.L
LEVELS, SHORT, WINS, TIERS = R.LEVELS, R.SHORT, R.WINS, R.TIERS
SEED, NPERM = R.SEED, R.NPERM
IS_END, START = R.IS_END, R.START_SCORE
TGT, STP, BEX, TIME = 0, 1, 2, 3
SHORT_V = np.array([SHORT[l[:-2]] for l in LEVELS])
NL = len(LEVELS)


def load4(sym):
    m = L.load_m1(sym, "F", "unadj")
    tick = R.tick_of(m["close"].to_numpy()[-200000:])
    lt = m.index.tz_convert("Europe/London")
    keep = (lt.hour < 22) & (lt.dayofweek < 5)
    m, lt = m[keep], lt[keep]
    di = pd.Index(lt.tz_localize(None).normalize())
    O, H, Lo, C = (m[c].to_numpy(float) for c in ("open", "high", "low", "close"))
    tm = lt.tz_localize(None).to_numpy()
    st = np.flatnonzero(np.r_[True, di[1:] != di[:-1]]); en = np.r_[st[1:], len(di)]
    D4, Dold, TM = {}, {}, {}
    for s, e in zip(st, en):
        if e - s >= 600:
            a = tuple(np.ascontiguousarray(x[s:e]) for x in (O, H, Lo, C))
            D4[di[s]] = a
            Dold[di[s]] = (a[1], a[2], a[3], float(a[0][0]))
            TM[di[s]] = tm[s:e]
    return D4, Dold, TM, tick


def build_P(h, l, o, row):
    n = len(h)
    rl = np.minimum(o, np.r_[o, np.minimum.accumulate(l)[:-1]])
    rh = np.maximum(o, np.r_[o, np.maximum.accumulate(h)[:-1]])
    P = np.empty((NL, n))
    for i, lev in enumerate(LEVELS):
        f, t = lev[:-2], int(lev[-2:])
        k = TIERS.index(t)
        if f == "oh": P[i] = o * (1 + row["oh"][k] / 100)
        elif f == "cup": P[i] = o * (1 + row["cup"][k] / 100)
        elif f == "ol": P[i] = o * (1 - row["ol"][k] / 100)
        elif f == "cdn": P[i] = o * (1 - row["cdn"][k] / 100)
        elif f == "hlH": P[i] = rl + row["hl"][k] / 100 * o
        else: P[i] = rh - row["hl"][k] / 100 * o
    return P


@njit(cache=True)
def tgt_at(P, short, k, j, lv, sg, o):
    best = np.nan
    for q in range(P.shape[0]):
        if q == k or short[q] != short[k]:
            continue
        v = P[q, j]
        if short[k]:
            if lv - v > 0.05 * sg and (np.isnan(best) or v > best): best = v
        else:
            if v - lv > 0.05 * sg and (np.isnan(best) or v < best): best = v
    if np.isnan(best): best = o
    if short[k] and best >= lv: best = o if o < lv else lv - sg
    if (not short[k]) and best <= lv: best = o if o > lv else lv + sg
    return best


@njit(cache=True)
def manage(O, H, Lo, C, j, n, sh, entry, SP, TP, S, fbar, moved):
    """One bar of an open trade. Returns (exit, outcome, SP, moved); outcome -1 = still open."""
    ex = np.nan; oc = -1
    if sh:
        if j > fbar and O[j] >= SP: ex = O[j]; oc = BEX if moved else STP
        elif H[j] >= SP: ex = SP; oc = BEX if moved else STP
        elif j > fbar and Lo[j] <= TP: ex = TP; oc = TGT
    else:
        if j > fbar and O[j] <= SP: ex = O[j]; oc = BEX if moved else STP
        elif Lo[j] <= SP: ex = SP; oc = BEX if moved else STP
        elif j > fbar and H[j] >= TP: ex = TP; oc = TGT
    if oc < 0 and j == n - 1:
        ex = C[j]; oc = TIME
    return ex, oc


@njit(cache=True)
def sim(O, H, Lo, C, P, short, S, sg, o, kmode, be, slip_in, slip_out, comm, out, cnt, tpo=False):
    """kmode 0 = E (Jordan / PDF), 1 = K (Ken). out[i] = (k, entry, exit, S, oc, netR, grossR, armbar, fillbar, exitbar,
    tp). cnt = [armed, chased, cancelled, filled]."""
    n = O.shape[0]
    spent = np.zeros(NL_, np.bool_)
    for k in range(NL_):
        if not np.isfinite(S[k]): spent[k] = True
    armed = np.array([-1, -1]); armbar = np.array([-1, -1]); alv = np.zeros(2); atp = np.zeros(2)
    kar = np.zeros(NL_, np.bool_); kbar = np.zeros(NL_, np.int64); klv = np.zeros(NL_); ktp = np.zeros(NL_)
    inpos = False; sh = False; pk = 0; entry = 0.0; SP = 0.0; TP = 0.0; sd = 0.0; fbar = 0; moved = False; ab = 0
    nt = 0
    for j in range(n):
        if inpos:
            ex, oc = manage(O, H, Lo, C, j, n, sh, entry, SP, TP, sd, fbar, moved)
            if oc >= 0:
                g = (entry - ex) if sh else (ex - entry)
                cost = slip_in + comm + (0.0 if oc == TGT else slip_out)
                out[nt, 0] = pk; out[nt, 1] = entry; out[nt, 2] = ex; out[nt, 3] = sd; out[nt, 4] = oc
                out[nt, 5] = (g - cost) / sd; out[nt, 6] = g / sd; out[nt, 7] = ab; out[nt, 8] = fbar; out[nt, 9] = j
                out[nt, 10] = TP
                nt += 1; inpos = False
            elif be and not moved and j > fbar:
                if (sh and Lo[j] <= entry - sd) or ((not sh) and H[j] >= entry + sd):
                    SP = entry; moved = True
            if kmode == 1:                      # Ken: a level poked while a trade is open gets no order that session
                for k in range(NL_):
                    if not spent[k] and ((short[k] and H[j] >= P[k, j]) or ((not short[k]) and Lo[j] <= P[k, j])):
                        spent[k] = True
            continue
        fk = -1; fe = 0.0; ftp = 0.0; fab = 0
        if kmode == 0:
            for side in range(2):
                ss = side == 0
                best = -1; bp = 0.0
                for k in range(NL_):
                    if spent[k] or short[k] != ss: continue
                    lv = P[k, j]; a = 0.10 * S[k]
                    if (ss and H[j] >= lv + a) or ((not ss) and Lo[j] <= lv - a):
                        if best < 0 or (ss and lv > bp) or ((not ss) and lv < bp):
                            best = k; bp = lv
                if best >= 0:
                    for k in range(NL_):       # lines passed on the way are spent
                        if spent[k] or short[k] != ss: continue
                        lv = P[k, j]; a = 0.10 * S[k]
                        if (ss and H[j] >= lv + a) or ((not ss) and Lo[j] <= lv - a):
                            spent[k] = True
                    if armed[side] < 0 or (ss and bp > alv[side]) or ((not ss) and bp < alv[side]):
                        if armed[side] >= 0: cnt[1] += 1
                        armed[side] = best; armbar[side] = j; alv[side] = bp
                        atp[side] = (min(o, bp) if ss else max(o, bp)) if tpo else tgt_at(P, short, best, j, bp, sg, o)
                        cnt[0] += 1
                if armed[side] < 0: continue
                k = armed[side]; lv = alv[side]; s_ = S[k]; same = armbar[side] == j
                if ss:
                    hit_c = H[j] >= lv + 1.2 * s_; hit_f = (C[j] <= lv) if same else (Lo[j] <= lv)
                else:
                    hit_c = Lo[j] <= lv - 1.2 * s_; hit_f = (C[j] >= lv) if same else (H[j] >= lv)
                if hit_c and not hit_f:
                    armed[side] = -1; cnt[2] += 1
                    continue
                if not hit_f: continue
                e = lv
                if not same:
                    if ss and O[j] < lv: e = O[j]
                    if (not ss) and O[j] > lv: e = O[j]
                fk = k; fe = e; ftp = atp[side]; fab = armbar[side]
                break
        else:
            # Ken: any poke arms an order at the line (first poke only), it can fill from the next bar; no cancel/chase
            for k in range(NL_):
                if kar[k] and j > kbar[k]:
                    lv = klv[k]
                    if (short[k] and Lo[j] <= lv) or ((not short[k]) and H[j] >= lv):
                        e = lv
                        if short[k] and O[j] < lv: e = O[j]
                        if (not short[k]) and O[j] > lv: e = O[j]
                        if fk < 0 or (short[k] and e > fe) or ((not short[k]) and e < fe):
                            fk = k; fe = e; ftp = ktp[k]; fab = kbar[k]
            if fk < 0:
                for k in range(NL_):
                    if spent[k]: continue
                    lv = P[k, j]
                    if (short[k] and H[j] >= lv) or ((not short[k]) and Lo[j] <= lv):
                        spent[k] = True; kar[k] = True; kbar[k] = j; klv[k] = lv
                        ktp[k] = tgt_at(P, short, k, j, lv, sg, o); cnt[0] += 1
        if fk < 0: continue
        # ---- fill
        cnt[3] += 1
        spent[fk] = True
        armed[0] = -1; armed[1] = -1
        for k in range(NL_):
            if kar[k]: kar[k] = False
        inpos = True; sh = short[fk]; pk = fk; entry = fe; sd = S[fk]; fbar = j; moved = False; TP = ftp; ab = fab
        SP = entry + sd if sh else entry - sd
        if tpo: TP = min(o, entry) if sh else max(o, entry)
        ex, oc = manage(O, H, Lo, C, j, n, sh, entry, SP, TP, sd, fbar, moved)
        if oc >= 0:
            g = (entry - ex) if sh else (ex - entry)
            cost = slip_in + comm + (0.0 if oc == TGT else slip_out)
            out[nt, 0] = pk; out[nt, 1] = entry; out[nt, 2] = ex; out[nt, 3] = sd; out[nt, 4] = oc
            out[nt, 5] = (g - cost) / sd; out[nt, 6] = g / sd; out[nt, 7] = ab; out[nt, 8] = fbar; out[nt, 9] = j
            out[nt, 10] = TP
            nt += 1; inpos = False
    return nt


NL_ = NL   # numba global


def prep(D4, W, perm=None):
    """Per session: (si, date, O, H, Lo, C, P, sg, o)."""
    cols = {q: W[[f"{q}{t}" for t in TIERS]].to_numpy() for q in ("oh", "ol", "cup", "cdn", "hl")}
    sig = W["sig"].to_numpy(); dates = W["date"].to_numpy()
    src = np.arange(len(W)) if perm is None else perm
    S = []
    for si, iw in enumerate(src):
        d = pd.Timestamp(dates[si])
        if d not in D4: continue
        if not all(np.all(np.isfinite(cols[q][iw])) for q in cols) or not np.isfinite(sig[iw]): continue
        O, H, Lo, C = D4[d]; o = O[0]
        P = build_P(H, Lo, o, {q: cols[q][iw] for q in cols})
        S.append((si, d, O, H, Lo, C, P, sig[iw] / 100 * o, o))
    return S


def run(sess, stops, sstops, win, per_level, be, mode, kmode, costs, floor):
    si_, so, cm = costs
    out = np.zeros((64, 11)); cnt = np.zeros(4, np.int64)
    rows = []
    for (si, d, O, H, Lo, C, P, sg, o) in sess:
        if mode == "usd":
            Sv = np.array([stops[win][l if per_level else "all"][si] for l in LEVELS])
        else:
            Sv = np.array([sstops[win][l if per_level else "all"][si] for l in LEVELS]) * sg
        Sv = np.where(np.isfinite(Sv), np.maximum(Sv, floor), np.nan)
        nt = sim(O, H, Lo, C, P, SHORT_V, Sv, sg, o, kmode, be, si_, so, cm, out, cnt)
        for r in out[:nt]:
            rows.append((d, si) + tuple(r))
    X = pd.DataFrame(rows, columns=["date", "si", "k", "entry", "exit", "S", "oc", "R", "gR", "armbar", "fillbar", "exitbar", "tp"])
    return X, dict(zip(["armed", "chased", "cancelled", "filled"], cnt.tolist()))


def main(sym="GOLD"):
    OUT = ROOT / "analysis/output/gold-rolling-mae-window" / sym
    lines = []
    def say(s=""):
        print(s, flush=True); lines.append(s)
    W = pd.read_parquet(ROOT / f"analysis/output/gold-rolling-mae-window/widths/F_{sym}.parquet")
    W["date"] = pd.to_datetime(W["date"]); W = W.sort_values("date").reset_index(drop=True)
    D4, Dold, TM, tick = load4(sym)
    W = W[W["date"].isin(D4.keys())].reset_index(drop=True)
    nsess = len(W)
    costs = (0.10, 0.10, 0.12) if sym == "GOLD" else (tick, tick, tick)
    floor = 5 * tick
    T = R.touches(Dold, W)
    stops = R.rolling_stops(T, nsess, "usd"); sstops = R.rolling_stops(T, nsess, "sig")
    chosen = json.load(open(OUT / "results.json"))["chosen_window"]
    sess = prep(D4, W)
    say(f"{sym}: {nsess} sessions, {len(T)} first touches; IS-chosen window {chosen}; costs {costs}")

    rng = np.random.default_rng(SEED + 2)
    arms, keep = [], {}
    for kmode, kn in ((0, "E"), (1, "K")):
        for mode in ("usd", "sig"):
            for wn in WINS:
                for per_level in (True, False):
                    for be in (1, 0):
                        X, cnt = run(sess, stops, sstops, wn, per_level, be, mode, kmode, costs, floor)
                        X = X[X["date"] >= START]
                        yr = X["date"].dt.year
                        a = dict(entry=kn, mode=mode, window=wn, stops="per-level" if per_level else "pooled", be="on" if be else "off")
                        for lab, m in (("IS", yr <= IS_END), ("OOS", yr > IS_END)):
                            pt, ci, n, tot = R.boot(X["date"][m].to_numpy(), X["R"][m].to_numpy(), rng)
                            a.update({f"{lab}_R": pt, f"{lab}_lo": ci[0], f"{lab}_hi": ci[1], f"{lab}_n": n, f"{lab}_totR": tot,
                                      f"{lab}_gross": float(X["gR"][m].mean())})
                        o_ = X[yr > IS_END]
                        a.update(OOS_win=100 * float((o_.R > 0).mean()), OOS_tgt=100 * float((o_.oc == TGT).mean()),
                                 OOS_stop=100 * float((o_.oc == STP).mean()), OOS_be=100 * float((o_.oc == BEX).mean()),
                                 OOS_time=100 * float((o_.oc == TIME).mean()), OOS_stop_med=float(o_.S.median()),
                                 OOS_pf=float(o_.R[o_.R > 0].sum() / max(-o_.R[o_.R < 0].sum(), 1e-9)),
                                 trades_per_day=float(len(X) / max(X["date"].nunique(), 1)), **{f"n_{k}": v for k, v in cnt.items()})
                        arms.append(a); keep[(kn, mode, wn, per_level, be)] = X
        print(f"  entry {kn} done", flush=True)
    A = pd.DataFrame(arms)
    A.to_csv(OUT / "entry_arms.csv", index=False)
    pd.set_option("display.width", 250)
    say("\nARMS (net R/trade OOS with 90% CI; gross = before costs):")
    say(A[["entry", "mode", "window", "stops", "be", "IS_R", "OOS_R", "OOS_lo", "OOS_hi", "OOS_n", "OOS_totR", "OOS_gross",
           "OOS_pf", "OOS_tgt", "OOS_stop", "trades_per_day"]].round(3).to_string(index=False))

    X = keep[("E", "usd", chosen, True, 1)]
    prim = A[(A.entry == "E") & (A["mode"] == "usd") & (A.window == chosen) & (A.stops == "per-level") & (A.be == "on")].iloc[0].to_dict()
    # placebo: shuffled widths, whole pipeline
    prng = np.random.default_rng(SEED + 3)
    yrsW = W["year"].to_numpy() if "year" in W else W["date"].dt.year.to_numpy()
    plm = []
    for p in range(NPERM):
        perm = np.arange(nsess)
        for y in np.unique(yrsW):
            m = yrsW == y
            perm[m] = prng.permutation(perm[m])
        Tp = R.touches(Dold, W, perm)
        sp = R.rolling_stops(Tp, nsess, "usd", wins=[chosen])
        Xp, _ = run(prep(D4, W, perm), sp, None, chosen, True, 1, "usd", 0, costs, floor)
        plm.append(float(Xp.R[Xp["date"].dt.year > IS_END].mean()))
        if p % 20 == 19: print(f"  placebo {p+1}/{NPERM}", flush=True)
    prim["pl1_mean"] = float(np.mean(plm)); prim["pl1_p95"] = float(np.percentile(plm, 95))
    # one-sided bootstrap p for BH over {T, E}
    o_ = X[X["date"].dt.year > IS_END]
    g = o_.groupby("date")["R"]; r, nn = g.sum().to_numpy(), g.count().to_numpy()
    brng = np.random.default_rng(SEED + 4); N = len(r); nb = int(np.ceil(N / R.BLOCK)); bv = np.empty(R.B)
    for b in range(R.B):
        st = brng.integers(0, max(N - R.BLOCK + 1, 1), nb); ii = (st[:, None] + np.arange(R.BLOCK)).ravel()[:N] % N
        bv[b] = r[ii].sum() / nn[ii].sum()
    pE = float((bv <= 0).mean())
    if prim["OOS_hi"] < 0.05: v = "NULL"
    elif (prim["OOS_lo"] > 0 and prim["IS_R"] > 0 and prim["OOS_R"] > prim["pl1_p95"] and prim["OOS_totR"] > 0
          and pE <= 0.10 / 2 * 1): v = "VALIDATED"      # BH over {T (NULL, p ~ 1), E}: E is the smaller p -> rank 1 of 2
    else: v = "UNDERPOWERED"
    prim["p_one_sided"] = pE; prim["verdict"] = v
    say(f"\nPRIMARY E ({chosen}, per-level $, BE on): IS {prim['IS_R']:+.3f} | OOS {prim['OOS_R']:+.3f} "
        f"[{prim['OOS_lo']:+.3f},{prim['OOS_hi']:+.3f}] n {prim['OOS_n']} total {prim['OOS_totR']:+.1f}R gross "
        f"{prim['OOS_gross']:+.3f} PF {prim['OOS_pf']:.2f} | placebo {prim['pl1_mean']:+.3f} p95 {prim['pl1_p95']:+.3f} | p {pE:.3f} -> {v}")

    # equity curves (primary E, K same settings, and the best-OOS E arm), daily cumulative R
    eq = {}
    for lab, key in (("E", ("E", "usd", chosen, True, 1)), ("K", ("K", "usd", chosen, True, 1))):
        Y = keep[key]; eq[lab] = Y.groupby("date")["R"].sum().cumsum()
    EQ = pd.DataFrame(eq).ffill().fillna(0); EQ.index.name = "date"
    EQ.round(3).to_csv(OUT / "entry_equity.csv")
    # trade examples: 2 per year (seeded), with the M1 path around the trade
    erng = np.random.default_rng(SEED + 5)
    exs = []
    sessmap = {d: (O, H, Lo, C, P) for (_, d, O, H, Lo, C, P, _, _) in sess}
    for y, G in X.groupby(X["date"].dt.year):
        for i in erng.choice(len(G), size=min(2, len(G)), replace=False):
            t = G.iloc[i]
            O, H, Lo, C, P = sessmap[t["date"]]
            a, b = max(int(t.armbar) - 60, 0), min(int(t.exitbar) + 30, len(O) - 1)
            step = max(1, (b - a) // 240)
            idx = np.arange(a, b + 1, step)
            bars = [[int(j), float(O[j]), float(H[j:j + step].max()), float(Lo[j:j + step].min()), float(C[min(j + step - 1, b)])] for j in idx]
            k = int(t.k); sh = bool(SHORT_V[k])
            tm = TM[t["date"]]
            exs.append(dict(date=str(t["date"].date()), level=LEVELS[k], short=sh, line=float(P[k, int(t.armbar)]),
                            entry=float(t.entry), stop=float(t.entry + t.S if sh else t.entry - t.S), tp=float(t.tp),
                            exit=float(t.exit), oc=["target", "stop", "break-even", "time"][int(t.oc)], R=float(t.R),
                            armbar=int(t.armbar), fillbar=int(t.fillbar), exitbar=int(t.exitbar),
                            t0=str(pd.Timestamp(tm[a]).strftime("%H:%M")), step=int(step), bars=bars))
    json.dump(exs, open(OUT / "entry_examples.json", "w"))
    json.dump({"seed": SEED, "sym": sym, "chosen_window": chosen, "primary": prim, "placebo_means": plm},
              open(OUT / "entry_results.json", "w"), indent=1, default=float)
    by = X.assign(y=X["date"].dt.year).groupby("y").R.agg(["count", "mean", "sum"]).round(3)
    say("\nPrimary E by year:\n" + by.to_string())
    (OUT / "entry_report.txt").write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main(*(sys.argv[1:2] or ["GOLD"]))
