"""jordan-lines-mae (EXPLORATORY, not pre-registered; register row 17336f35).

    python scripts/jordan-lines-mae/run.py [SYM:TRACK ...]   -> analysis/output/jordan-lines-mae/
    python scripts/jordan-lines-mae/run.py summarise

Owner 2026-11-25: the median-MAE / stack analysis on JORDAN'S lines only: HL, Close+, Close-. OH / OL are our site
ladder's lines, not his, and are left out.
  Close+ / Close-: fixed price levels, open x (1 +/- D/100), D = k_tau x sigma of that line's QLIKE pick.
  HL: a width, so intraday it is two MOVING lines: projected high = running low (to the previous bar) + HL,
      projected low = running high - HL. Touching one means the day's range has reached that HL percentile.
Every touch (re-armed after 0.1 line-sigma back off), median / 75th / 90th, placebo at 0.75-0.90 / 1.10-1.25 x
distance (HL x m for the projections).
  A. Jordan-style MAE table: mean / median / p75 / p90 of the adverse move (through the line) at 30 / 60 min, in line
     sigma, and in ticks on futures (tick read from the contract's own prices).
  B. Stacks as Jordan meant them: a Close+ / Close- touch with an HL projection (same side, any tau) within a few
     ticks / sigma at that bar, and vice versa. Stacked vs isolated, line vs placebo.
  C. Noise threshold (C.OG): mean move after the stop price, toward the open side of the fade, by stop distance.
  D. Stops: fixed sigma and trailing median 60-min MAE (W sessions, earlier sessions only, keyed on every session),
     target 1R / 2R, race to 22:00, unresolved marked at the close, ties = stop. Gross.
Sessions 2020 -> 2026-08-21. Seed 20261125.
"""
from __future__ import annotations

import importlib.util
import json
import os
import sys
import warnings
import zlib
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts/ladder-v2"))
import ladder as L  # noqa: E402


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


CLR = _load("clr", "scripts/close-level-reversal/race.py")
LTE = _load("lte", "scripts/level-touch-excursions/run.py")
LSS = _load("lss", "scripts/level-stack-stop/run.py")
RC, RF = CLR.RC, CLR.RF

SEED = 20261125
OUT = ROOT / "analysis/output/jordan-lines-mae"
QLINES = ("hl", "cup", "cdn")
TAUS = (0.50, 0.75, 0.90)
REARM = 0.10
GRID, NEVER, snap, race_R, dboot, first_passage, tick_of = (LSS.GRID, LSS.NEVER, LSS.snap, LSS.race_R, LSS.dboot,
                                                             LSS.first_passage, LSS.tick_of)
WINDOWS = (10, 21, 63, 126, 252)
# touched line -> (price side above open?, which sigma, group)
TL = {"cup": (True, "cup", "Close±"), "cdn": (False, "cdn", "Close±"),
      "hlH": (True, "hl", "HL proj"), "hlL": (False, "hl", "HL proj")}


def levels(sym, track):
    """Walk-forward per-line levels (% of open) for HL, Close+, Close-; same method as close-level-reversal."""
    bd = RF.bdir(sym) if track == "F" else RC.bdir(sym)
    os.environ["LADDER_OUT"] = bd
    L.TAUS = (50, 75, 90)
    S = pd.read_parquet(ROOT / bd / f"rows_{track}.parquet")
    S["rel"] = S["A0"] / S["A0"].rolling(250, min_periods=60).median().shift(1)
    arms = list(L.arms_for(sym))
    T = L.walk_forward(S, sym, track, arms, quiet=True).sort_values("date").reset_index(drop=True)
    T = T[T["date"] <= L.LOCK].reset_index(drop=True)
    R = (RF.realised_f(sym) if track == "F" else RC.realised(sym)).reindex(pd.to_datetime(T["date"]))
    so = R["soc"].to_numpy()
    T["cup"] = np.where(so > 0, so, np.nan)
    T["cdn"] = np.where(so < 0, -so, np.nan)
    ok = np.ones(len(T), bool)
    for q in ("hl", "oh", "ol"):
        ok &= T[q].to_numpy() > 0
    masks = {"hl": ok, "cup": ok & (so > 0), "cdn": ok & (so < 0)}
    yrs = T["year"].to_numpy()
    site = [a for a in arms if a not in RC.NO_SITE]
    prior = json.loads(CLR.PRIOR[track].read_text())["picks"].get(sym, {})
    lv = {q: np.full((len(T), 3), np.nan) for q in QLINES}
    sg = {q: np.full(len(T), np.nan) for q in QLINES}
    c1 = []
    for q in QLINES:
        m = masks[q]
        Q = {(a, q): RC.qlike(T, RC.h_series(T, T[a].to_numpy(float), q, m), q, m) for a in site}
        sel, pk = RF.wf_pick(T, Q, site, m, q)
        want = prior.get(q, {}).get("wf_site", {})
        c1 += [str(pk[Y]) == str(want.get(str(Y))) for Y in RC.TEST if want]
        x = T[q].to_numpy()
        for Y in range(2020, 2027):
            te = yrs == Y
            if not te.any() or sel[te][0] is None:
                continue
            sig = T[sel[te][0]].to_numpy(float)
            r = x / sig
            tr = (yrs >= 2018) & (yrs < Y) & m & np.isfinite(r) & (r > 0)
            if tr.sum() <= 50:
                continue
            k = np.quantile(r[tr], TAUS)
            lv[q][te] = np.outer(sig[te], k)
            sg[q][te] = sig[te]
    return pd.to_datetime(T["date"]).dt.normalize(), lv, sg, (float(np.mean(c1)) if c1 else float("nan"))


def run(job):
    sym, track = job
    dates, lv, sg, c1 = levels(sym, track)
    m = L.load_m1(sym, track, "unadj") if track == "F" else L.load_m1(sym, track)
    lt = m.index.tz_convert("Europe/London")
    keep = (lt.hour < 22) & (lt.dayofweek < 5)
    m, lt = m[keep], lt[keep]
    di = pd.Index(lt.tz_localize(None).normalize())
    mins = (lt.hour * 60 + lt.minute).to_numpy()
    H, Lo, O, C = (m[c].to_numpy() for c in ("high", "low", "open", "close"))
    tick = tick_of(C[-200000:]) if track == "F" else np.nan
    starts = np.flatnonzero(np.r_[True, di[1:] != di[:-1]])
    ends = np.r_[starts[1:], len(di)]
    pos = {di[s]: (s, e) for s, e in zip(starts, ends)}
    rng = np.random.default_rng([SEED, zlib.crc32(f"{sym}:{track}".encode())])
    rows, thr_fp, back_fp = [], [], []
    for i, dt in enumerate(dates):
        if dt.year < 2020 or dt not in pos:
            continue
        s, e = pos[dt]
        if e - s < 600 or not all(np.isfinite(lv[q][i, 0]) for q in QLINES):
            continue
        h, l, c, o, n = H[s:e], Lo[s:e], C[s:e], O[s], e - s
        ds = dt.strftime("%Y-%m-%d")
        rl = np.minimum(o, np.r_[o, np.minimum.accumulate(l)[:-1]])      # running low to the previous bar
        rh = np.maximum(o, np.r_[o, np.maximum.accumulate(h)[:-1]])
        hlpx = lv["hl"][i] * o / 100
        # real line price paths (n,) per side, for the stack distance
        real = {"cup": [np.full(n, o * (1 + lv["cup"][i, j] / 100)) for j in range(3)],
                "cdn": [np.full(n, o * (1 - lv["cdn"][i, j] / 100)) for j in range(3)],
                "hlH": [rl + hlpx[j] for j in range(3)], "hlL": [rh - hlpx[j] for j in range(3)]}
        cross = {"cup": "hlH", "hlH": "cup", "cdn": "hlL", "hlL": "cdn"}
        for tl, (ab, sq, _) in TL.items():
            sig_px = sg[sq][i] * o / 100
            sgn = 1.0 if ab else -1.0
            for j, tau in enumerate(TAUS):
                mult = rng.uniform(0.75, 0.90) if rng.random() < 0.5 else rng.uniform(1.10, 1.25)
                for kind in ("line", "placebo"):
                    mm = 1.0 if kind == "line" else mult
                    if tl == "cup":
                        P = np.full(n, o * (1 + lv["cup"][i, j] * mm / 100))
                    elif tl == "cdn":
                        P = np.full(n, o * (1 - lv["cdn"][i, j] * mm / 100))
                    elif tl == "hlH":
                        P = rl + hlpx[j] * mm
                    else:
                        P = rh - hlpx[j] * mm
                    for k, t in enumerate(LTE.touches(h, l, P, REARM * sig_px, ab), 1):
                        Pt = float(P[t])
                        near = min(abs(x[t] - Pt) for x in real[cross[tl]])
                        thr = np.maximum.accumulate((h[t:] - Pt) if ab else (Pt - l[t:]))
                        thr_fp.append(first_passage(thr, GRID * sig_px))
                        if t + 1 < n:
                            bk = np.maximum.accumulate((Pt - l[t + 1:]) if ab else (h[t + 1:] - Pt))
                            back_fp.append(np.minimum(first_passage(bk, GRID * sig_px).astype(np.int32) + 1,
                                                      NEVER).astype(np.int16))
                        else:
                            back_fp.append(np.full(len(GRID), NEVER, np.int16))
                        mae30 = max(float(thr[min(len(thr) - 1, 30)]), 0.0)
                        mae60 = max(float(thr[min(len(thr) - 1, 60)]), 0.0)
                        rows.append((ds, tl, int(tau * 100), kind, k, int(mins[s + t]), sig_px,
                                     near / sig_px, near / tick if np.isfinite(tick) else np.nan,
                                     mae30 / sig_px, mae60 / sig_px, mae30, mae60,
                                     -sgn * (c[-1] - Pt) / sig_px))
    cols = ["date", "line", "tau", "kind", "touch_n", "minute", "sig_px", "near_sig", "near_ticks",
            "mae30", "mae60", "mae30_px", "mae60_px", "back_eod"]
    df = pd.DataFrame(rows, columns=cols)
    for c_ in cols[6:]:
        df[c_] = df[c_].astype("float32")
    tf = pd.DataFrame(np.array(thr_fp).reshape(len(df), len(GRID)), columns=[f"t{g:g}" for g in GRID])
    bf = pd.DataFrame(np.array(back_fp).reshape(len(df), len(GRID)), columns=[f"b{g:g}" for g in GRID])
    df = pd.concat([df, tf, bf], axis=1)
    df.insert(0, "track", track)
    df.insert(0, "sym", sym)
    df["tick"] = tick
    df.to_parquet(OUT / "touches" / f"{track}_{sym}.parquet")
    nl = df[df.kind == "line"]
    return (f"{track} {sym}: control1 {c1:.0%}, tick {tick:g}, line touches "
            + ", ".join(f"{q} {int((nl.line == q).sum())}" for q in TL)
            + f"; Close/HL within 0.05sig {np.mean(nl['near_sig'] <= 0.05):.0%}")


# ----------------------------------------------------------------------------------------------------------- summary
def summarise():
    A = pd.concat([pd.read_parquet(p) for p in sorted((OUT / "touches").glob("*.parquet"))], ignore_index=True)
    A["date"] = pd.to_datetime(A["date"])
    A["grp"] = A["line"].map(lambda q: TL[q][2])
    A["hours"] = A["minute"].map(LTE.hb)
    tcols, bcols = [f"t{g:g}" for g in GRID], [f"b{g:g}" for g in GRID]
    res = {"seed": SEED, "label": "exploratory, not pre-registered", "lines": "HL projections, Close+, Close- (no OH/OL)"}

    # ---- A. Jordan-style MAE table
    def mae_tab(g, col):
        v = g[col].dropna()
        return pd.Series({"n": len(v), "mean": v.mean(), "median": v.median(), "p75": v.quantile(.75),
                          "p90": v.quantile(.9)})
    L_ = A[A.kind == "line"]
    rows = []
    for (tr, sy, grp, tau), g in L_.groupby(["track", "sym", "grp", "tau"]):
        for col in ("mae30", "mae60"):
            r = mae_tab(g, col)
            r = {"track": tr, "sym": sy, "lines": grp, "tau": tau, "window": col[3:] + "m", "unit": "sigma", **r}
            rows.append(r)
            if tr == "F":
                tk = g["tick"].iloc[0]
                r2 = mae_tab(g.assign(x=g[col + "_px"] / tk), "x")
                rows.append({"track": tr, "sym": sy, "lines": grp, "tau": tau, "window": col[3:] + "m",
                             "unit": "ticks", **r2})
    MT = pd.DataFrame(rows)
    MT.to_csv(OUT / "mae_table.csv", index=False)
    pooled = []
    for (tr, grp, tau), g in L_.groupby(["track", "grp", "tau"]):
        for col in ("mae30", "mae60"):
            pooled.append({"track": tr, "lines": grp, "tau": tau, "window": col[3:] + "m", **mae_tab(g, col)})
    pd.DataFrame(pooled).to_csv(OUT / "mae_pooled.csv", index=False)

    # ---- B. stacks (Close+- vs HL projection on the same side)
    A["stack_sig"] = np.select([A["near_sig"] <= 0.02, A["near_sig"] <= 0.05, A["near_sig"] <= 0.15],
                               ["a <=0.02σ", "b 0.02-0.05σ", "c 0.05-0.15σ"], "d >0.15σ")
    A["stack_tk"] = np.where(A["track"] != "F", "na",
                             np.select([A["near_ticks"] <= 5, A["near_ticks"] <= 20], ["a <=5t", "b 6-20t"], "c >20t"))
    Tm, Bm = A[tcols].to_numpy(), A[bcols].to_numpy()
    i25 = snap(0.25)
    A["back_first"] = (Bm[:, i25].astype(int) < Tm[:, i25].astype(int)).astype(float)
    i20 = snap(0.20)
    A["R20"], _ = race_R(A, Tm, Bm, np.full(len(A), i20), np.full(len(A), i20))
    srows = []
    for col in ("stack_sig", "stack_tk"):
        for keys, g in A[A[col] != "na"].groupby(["track", "grp", col]):
            row = {"by": col, "track": keys[0], "lines": keys[1], "bucket": keys[2]}
            for kind in ("line", "placebo"):
                gk = g[g.kind == kind]
                row[f"n_{kind}"] = len(gk)
                row[f"mae60_p50_{kind}"] = float(gk["mae60"].median())
                row[f"mae60_p75_{kind}"] = float(gk["mae60"].quantile(.75))
                row[f"back_first_{kind}"] = float(gk["back_first"].mean())
                row[f"R20_{kind}"] = float(gk["R20"].mean())
            e, lo, hi = dboot(g, "back_first", B=500, seed=SEED)
            row.update(back_first_diff=e, bf_lo=lo, bf_hi=hi)
            e, lo, hi = dboot(g, "R20", B=500, seed=SEED)
            row.update(R20_diff=e, R_lo=lo, R_hi=hi)
            srows.append(row)
    ST = pd.DataFrame(srows)
    ST.to_csv(OUT / "stacks.csv", index=False)
    # stacked vs isolated among REAL line touches (same line, same day pool): date-clustered bootstrap
    iso = []
    Ln = A[A.kind == "line"].copy()
    Ln["stk"] = Ln["near_sig"] <= 0.05
    for keys, g in Ln.groupby(["track", "grp"]):
        gg = g.assign(kind=np.where(g["stk"], "line", "placebo"))      # reuse dboot: 'line' = stacked
        for col in ("back_first", "R20", "mae60"):
            e, lo, hi = dboot(gg, col, B=500, seed=SEED)
            iso.append({"track": keys[0], "lines": keys[1], "stat": col, "stacked_share": float(g["stk"].mean()),
                        "stacked": float(g.loc[g.stk, col].mean()), "isolated": float(g.loc[~g.stk, col].mean()),
                        "stacked_minus_isolated": e, "lo": lo, "hi": hi})
    pd.DataFrame(iso).to_csv(OUT / "stacked_vs_isolated.csv", index=False)
    share = (Ln.groupby(["track", "sym", "grp"])
             .agg(n=("near_sig", "size"), tick=("tick", "first"),
                  within_005sig=("near_sig", lambda v: float(np.mean(v <= 0.05))),
                  within_5t=("near_ticks", lambda v: float(np.mean(v <= 5))),
                  near_sig_p50=("near_sig", "median"), near_ticks_p50=("near_ticks", "median")).reset_index())
    share.to_csv(OUT / "stack_share_by_instrument.csv", index=False)

    # ---- C. noise threshold
    eod = A["back_eod"].to_numpy()
    nt = []
    for gi, X in enumerate(GRID):
        hit = Tm[:, gi] < NEVER
        sub = A[hit].assign(post=eod[hit] + X)
        for keys, g in sub.groupby(["track", "grp"]):
            row = {"X": X, "track": keys[0], "lines": keys[1]}
            for kind in ("line", "placebo"):
                gk = g[g.kind == kind]
                row[f"reach_{kind}"] = len(gk)
                row[f"post_mean_{kind}"] = float(gk["post"].mean())
                row[f"post_pos_{kind}"] = float(np.mean(gk["post"] > 0))
            e, lo, hi = dboot(g, "post", B=300, seed=SEED)
            row.update(post_diff=e, diff_lo=lo, diff_hi=hi)
            nt.append(row)
    pd.DataFrame(nt).to_csv(OUT / "noise_threshold.csv", index=False)

    # ---- D. stops
    stop_rows = []

    def add(label, B_, extra=None):
        for keys, g in B_.groupby(["track", "grp", "tau"]):
            e, lo, hi = dboot(g, "R", B=300, seed=SEED)
            gl, gp = g[g.kind == "line"], g[g.kind == "placebo"]
            stop_rows.append({"stop": label[0], "rr": label[1], "track": keys[0], "lines": keys[1], "tau": keys[2],
                              "n": len(gl), "win_line": gl["win"].mean(), "win_placebo": gp["win"].mean(),
                              "R_line": gl["R"].mean(), "R_placebo": gp["R"].mean(), "R_diff": e, "lo": lo, "hi": hi,
                              **(extra(gl) if extra else {})})

    for Xs in (0.10, 0.15, 0.20, 0.25, 0.35, 0.50):
        for rr in (1, 2):
            R, win = race_R(A, Tm, Bm, np.full(len(A), snap(Xs)), np.full(len(A), snap(Xs * rr)))
            add((f"{Xs:g}σ fixed", rr), A.assign(R=R, win=win.astype(float)))
    A = A.sort_values(["track", "sym", "grp", "date"]).reset_index(drop=True)
    Tm, Bm = A[tcols].to_numpy(), A[bcols].to_numpy()
    for W in WINDOWS:
        stop_px = np.full(len(A), np.nan)
        for _, g in A.groupby(["track", "sym", "grp"]):
            ds = pd.Index(sorted(g["date"].unique()))                     # every session, line or placebo
            daily = g[g.kind == "line"].groupby("date")["mae60_px"].apply(list).reindex(ds)
            daily = [v if isinstance(v, list) else [] for v in daily]
            vals = []
            for k in range(len(ds)):
                pool = [x for lst in daily[max(0, k - W):k] for x in lst]
                vals.append(np.median(pool) if len(pool) >= 10 else np.nan)
            stop_px[g.index] = pd.Series(vals, index=ds).reindex(g["date"]).to_numpy()
        Xs = stop_px / A["sig_px"].to_numpy()
        ok = np.isfinite(Xs) & (Xs > 0)
        for rr in (1, 2):
            R, win = race_R(A, Tm, Bm, snap(np.where(ok, Xs, .25)), snap(np.where(ok, Xs * rr, .25)))
            add((f"median MAE60 trailing {W}d", rr), A.assign(R=R, win=win.astype(float), Xs=Xs)[ok],
                lambda gl: {"stop_sigma_p50": float(gl["Xs"].median())})
    SR = pd.DataFrame(stop_rows)
    SR.to_csv(OUT / "stops.csv", index=False)
    res["files"] = ["mae_table.csv", "mae_pooled.csv", "stacks.csv", "stacked_vs_isolated.csv",
                    "stack_share_by_instrument.csv", "noise_threshold.csv", "stops.csv"]
    json.dump(res, open(OUT / "results.json", "w"), indent=1)
    print("done")


def main():
    (OUT / "touches").mkdir(parents=True, exist_ok=True)
    args = sys.argv[1:]
    if args == ["summarise"]:
        summarise()
        return
    J = [tuple(a.split(":")) for a in args] or ([(s, "F") for s in RF.syms()] + [(s, "C") for s in RC.syms()])
    print(f"{len(J)} jobs", flush=True)
    with ProcessPoolExecutor(max_workers=4) as ex:
        for msg in ex.map(run, J):
            print(msg, flush=True)
    if not args:
        summarise()


if __name__ == "__main__":
    main()
