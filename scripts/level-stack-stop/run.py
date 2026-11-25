"""level-stack-stop (EXPLORATORY, not pre-registered).

    python scripts/level-stack-stop/run.py [SYM:TRACK ...]   -> analysis/output/level-stack-stop/
    python scripts/level-stack-stop/run.py summarise

Jordan (a C.OG group member) to the owner, 2026-11-17: "Switch your stops to median ticks. Do you trade every level?
What happens if 2 levels are within proximity of a few ticks?" C.OG on stop tables (2026-09-26): none of mean / median
/ p75 / p90; find the noise threshold (the adverse distance past which going against you carries information), per
look-back horizon, and read the distribution of results.

Same touches as level-touch-excursions (every touch of each instrument's per-line QLIKE level Close+/Close-/OH/OL,
median/75th/90th, re-arm 0.1 line-sigma, placebo at 0.75-0.90 / 1.10-1.25 x distance). Per touch we store first-passage
minutes to each distance on a sigma grid, through the line (touch bar counts) and back toward the open (from the next
bar), plus where price sits at +60 min and 22:00 London. From that:
  A. Stacks: nearest other per-line level on the same side (distance in line sigma; futures also in ticks, tick read
     from the contract's own M1 price steps). Stacked (<= 5 ticks / <= 0.05 sigma) vs single touches.
  B. Noise threshold: for stop distance X, mean of (close at 22:00 - stop price) toward the open among touches that
     reach X through. > 0 = after X, price tends to come back (noise); <= 0 = no come-back (information).
  C. Stops: fixed sigma stops; "median ticks" = trailing median 60-min MAE in price over W sessions
     (W = 10, 21, 32, 42, 63, 126, 252), strictly before the session; target = 1R and 2R; race to 22:00, unresolved
     marked at the 22:00 close; ties count as stops. Gross, in R. Line vs placebo with the same stop in price.
Sessions 2020 -> 2026-08-21. Seed 20261124.
"""
from __future__ import annotations

import importlib.util
import json
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

SEED = 20261124
OUT = ROOT / "analysis/output/level-stack-stop"
LINES, ABOVE, TAUS = CLR.LINES, CLR.ABOVE, CLR.TAUS
REARM = 0.10
GRID = np.r_[np.round(np.arange(0.025, 1.0001, 0.025), 3), 1.25, 1.5]
NEVER = 32767
WINDOWS = (10, 21, 32, 42, 63, 126, 252)
HOURS = [(0, 7), (7, 10), (10, 13), (13, 16), (16, 22)]


def tick_of(px):
    """Contract tick from its own prices: the smallest common price step."""
    u = np.unique(np.round(px[np.isfinite(px)], 8))
    d = np.diff(u)
    d = d[d > 1e-9]
    if not len(d):
        return np.nan
    return float(np.quantile(d, 0.01))


def first_passage(run_max, dist):
    """Index of the first bar where the running max reaches each distance, NEVER if not reached."""
    i = np.searchsorted(run_max, dist, side="left")
    return np.where(i < len(run_max), i, NEVER).astype(np.int16)


def run(job):
    sym, track = job
    dates, lv, sg, _, _ = CLR.levels(sym, track)
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
        if e - s < 600:
            continue
        h, l, c, o, n = H[s:e], Lo[s:e], C[s:e], O[s], e - s
        ds = dt.strftime("%Y-%m-%d")
        # every real level price this session, by side
        real = {True: [], False: []}
        for q in LINES:
            if np.isfinite(lv[q][i, 0]):
                for j in range(3):
                    D = lv[q][i, j]
                    real[ABOVE[q]].append((q, j, o * (1 + D / 100) if ABOVE[q] else o * (1 - D / 100)))
        for q in LINES:
            if not np.isfinite(lv[q][i, 0]):
                continue
            sig_px = sg[q][i] * o / 100
            ab = ABOVE[q]
            sgn = 1.0 if ab else -1.0
            for j, tau in enumerate(TAUS):
                D = lv[q][i, j]
                mult = rng.uniform(0.75, 0.90) if rng.random() < 0.5 else rng.uniform(1.10, 1.25)
                for kind, dd in (("line", D), ("placebo", D * mult)):
                    P = o * (1 + dd / 100) if ab else o * (1 - dd / 100)
                    others = np.array([p for (qq, jj, p) in real[ab] if not (kind == "line" and qq == q and jj == j)])
                    near = float(np.min(np.abs(others - P))) if len(others) else np.inf
                    for k, t in enumerate(LTE.touches(h, l, P, REARM * sig_px, ab), 1):
                        thr = np.maximum.accumulate((h[t:] - P) if ab else (P - l[t:]))
                        thr_fp.append(first_passage(thr, GRID * sig_px))
                        if t + 1 < n:
                            bk = np.maximum.accumulate((P - l[t + 1:]) if ab else (h[t + 1:] - P))
                            back_fp.append(np.minimum(first_passage(bk, GRID * sig_px).astype(np.int32) + 1,
                                                      NEVER).astype(np.int16))
                        else:
                            back_fp.append(np.full(len(GRID), NEVER, np.int16))
                        t60 = min(n - 1, t + 60)
                        mae60 = max(float(thr[min(len(thr) - 1, 60)]), 0.0)
                        rows.append((ds, q, int(tau * 100), kind, k, int(mins[s + t]), sig_px,
                                     near / sig_px, near / tick if np.isfinite(tick) else np.nan,
                                     mae60 / sig_px, mae60,
                                     -sgn * (c[t60] - P) / sig_px, -sgn * (c[-1] - P) / sig_px))
    cols = ["date", "line", "tau", "kind", "touch_n", "minute", "sig_px", "near_sig", "near_ticks",
            "mae60", "mae60_px", "back_c60", "back_eod"]
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
    st = float(np.mean(nl["near_ticks"] <= 5)) if track == "F" else float("nan")
    return (f"{track} {sym}: tick {tick:g}, {len(nl)} line touches, stacked<=0.05sig "
            f"{np.mean(nl['near_sig'] <= 0.05):.0%}, <=5 ticks {st:.0%}")


# ----------------------------------------------------------------------------------------------------------- summary
def snap(x):
    """Stop / target distance in sigma -> grid index (rounded up; > 1.5 sigma -> last)."""
    return np.minimum(np.searchsorted(GRID, np.asarray(x) - 1e-9, side="left"), len(GRID) - 1)


def race_R(A, Tm, Bm, xi, ti):
    """Gross result in R for stop grid index xi, target grid index ti (per row)."""
    r = np.arange(len(A))
    ts, tt = Tm[r, xi].astype(np.int32), Bm[r, ti].astype(np.int32)
    X, T = GRID[xi], GRID[ti]
    out = np.where(tt < ts, T / X, -1.0)
    neither = (ts >= NEVER) & (tt >= NEVER)
    return np.where(neither, A["back_eod"].to_numpy() / X, out), tt < ts


def dboot(df, col, B=500, seed=SEED):
    """Line minus placebo mean of col, date-clustered bootstrap 90% CI."""
    g = df.groupby(["date", "kind"])[col].agg(["sum", "count"]).unstack("kind").fillna(0)
    if ("sum", "line") not in g or ("sum", "placebo") not in g:
        return np.nan, np.nan, np.nan
    sl, nl = g[("sum", "line")].to_numpy(), g[("count", "line")].to_numpy()
    sp, npl = g[("sum", "placebo")].to_numpy(), g[("count", "placebo")].to_numpy()
    est = sl.sum() / max(nl.sum(), 1) - sp.sum() / max(npl.sum(), 1)
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(g), (B, len(g)))
    bs = sl[idx].sum(1) / np.maximum(nl[idx].sum(1), 1) - sp[idx].sum(1) / np.maximum(npl[idx].sum(1), 1)
    lo, hi = np.quantile(bs, [0.05, 0.95])
    return float(est), float(lo), float(hi)


def summarise():
    files = sorted((OUT / "touches").glob("*.parquet"))
    A = pd.concat([pd.read_parquet(p) for p in files], ignore_index=True)
    A["date"] = pd.to_datetime(A["date"])
    A["hours"] = A["minute"].map(LTE.hb)
    A["side"] = np.where(A["line"].isin(["cup", "cdn"]), "Close±", "OH/OL")
    A["tn"] = np.where(A["touch_n"] >= 4, "4+", A["touch_n"].astype(str))
    tcols = [f"t{g:g}" for g in GRID]
    bcols = [f"b{g:g}" for g in GRID]
    Tm, Bm = A[tcols].to_numpy(), A[bcols].to_numpy()
    res = {"seed": SEED, "label": "exploratory, not pre-registered", "grid_sigma": GRID.tolist()}

    # ---- A. stacks
    A["stack_sig"] = np.select([A["near_sig"] <= 0.02, A["near_sig"] <= 0.05, A["near_sig"] <= 0.15], ["<=0.02σ", "0.02-0.05σ", "0.05-0.15σ"], ">0.15σ")
    A["stack_tk"] = np.where(A["track"] != "F", "na",
                             np.select([A["near_ticks"] <= 5, A["near_ticks"] <= 20], ["<=5t", "6-20t"], ">20t"))
    xi1, ti1 = snap(0.25), snap(0.25)
    R1, _ = race_R(A, Tm, Bm, np.full(len(A), xi1), np.full(len(A), ti1))
    A["R_025"] = R1
    A["back_first_025"] = (Bm[:, ti1].astype(int) < Tm[:, xi1].astype(int)).astype(float)
    stack_rows = []
    for col in ("stack_sig", "stack_tk"):
        for keys, g in A[A[col] != "na"].groupby(["track", "side", col]):
            row = {"by": col, "track": keys[0], "side": keys[1], "bucket": keys[2]}
            for kind in ("line", "placebo"):
                gk = g[g.kind == kind]
                row[f"n_{kind}"] = len(gk)
                row[f"mae60_p50_{kind}"] = float(gk["mae60"].median())
                row[f"mae60_p75_{kind}"] = float(gk["mae60"].quantile(.75))
                row[f"back_first_{kind}"] = float(gk["back_first_025"].mean())
            e, lo, hi = dboot(g, "back_first_025")
            row.update(back_first_diff=e, diff_lo=lo, diff_hi=hi)
            stack_rows.append(row)
    ST = pd.DataFrame(stack_rows)
    ST.to_csv(OUT / "stacks.csv", index=False)
    shares = (A[A.kind == "line"].groupby(["track", "sym"])
              .agg(n=("near_sig", "size"), tick=("tick", "first"),
                   stacked_05sig=("near_sig", lambda v: float(np.mean(v <= 0.05))),
                   stacked_5t=("near_ticks", lambda v: float(np.mean(v <= 5))),
                   near_sig_p50=("near_sig", "median"), near_ticks_p50=("near_ticks", "median")).reset_index())
    shares.to_csv(OUT / "stack_share_by_instrument.csv", index=False)
    # which line sits next to which (what a stack is made of)
    res["stack_share"] = {tr: {f"<={d}σ": float(np.mean(v <= d)) for d in (0.02, 0.05, 0.15)}
                          for tr, v in A[A.kind == "line"].groupby("track")["near_sig"]}

    # ---- B. noise threshold
    nt = []
    eod = A["back_eod"].to_numpy()
    for gi, X in enumerate(GRID):
        hit = Tm[:, gi] < NEVER
        sub = A[hit].assign(post=eod[hit] + X)
        for keys, g in [(("all", "all"), sub)] + list(sub.groupby(["track", "side"])):
            row = {"X": X, "track": keys[0], "side": keys[1]}
            for kind in ("line", "placebo"):
                gk = g[g.kind == kind]
                row[f"reach_{kind}"] = len(gk)
                row[f"post_mean_{kind}"] = float(gk["post"].mean())
                row[f"post_pos_{kind}"] = float(np.mean(gk["post"] > 0))
            if keys[0] != "all":
                e, lo, hi = dboot(g, "post")
                row.update(post_diff=e, diff_lo=lo, diff_hi=hi)
            nt.append(row)
    NT = pd.DataFrame(nt)
    NT.to_csv(OUT / "noise_threshold.csv", index=False)
    nth = []
    for gi, X in enumerate(GRID[:24]):
        hit = Tm[:, gi] < NEVER
        sub = A[hit & (A.kind == "line").to_numpy()].assign(post=eod[hit & (A.kind == "line").to_numpy()] + X)
        for keys, g in sub.groupby(["track", "hours"]):
            nth.append({"X": X, "track": keys[0], "hours": keys[1], "n": len(g), "post_mean": float(g["post"].mean())})
    pd.DataFrame(nth).to_csv(OUT / "noise_threshold_by_hour.csv", index=False)

    # ---- C. stops: fixed sigma and trailing "median ticks"
    stop_rows = []
    for Xs in (0.10, 0.15, 0.20, 0.25, 0.35, 0.50):
        for rr in (1, 2):
            xi = np.full(len(A), snap(Xs))
            ti = np.full(len(A), snap(Xs * rr))
            R, win = race_R(A, Tm, Bm, xi, ti)
            B_ = A.assign(R=R, win=win.astype(float))
            for keys, g in B_.groupby(["track", "side"]):
                e, lo, hi = dboot(g, "R")
                gl, gp = g[g.kind == "line"], g[g.kind == "placebo"]
                stop_rows.append({"stop": f"{Xs:g}σ fixed", "rr": rr, "track": keys[0], "side": keys[1],
                                  "n": len(gl), "win_line": gl["win"].mean(), "win_placebo": gp["win"].mean(),
                                  "R_line": gl["R"].mean(), "R_placebo": gp["R"].mean(),
                                  "R_diff": e, "diff_lo": lo, "diff_hi": hi})
    # trailing median 60-min MAE in price, per instrument x side, from line touches of earlier sessions only
    A = A.sort_values(["track", "sym", "side", "date"]).reset_index(drop=True)
    Tm, Bm = A[tcols].to_numpy(), A[bcols].to_numpy()
    for W in WINDOWS:
        stop_px = np.full(len(A), np.nan)
        for (tr, sy, sd), g in A.groupby(["track", "sym", "side"]):
            ln = g[g.kind == "line"]
            ds = pd.Index(sorted(g["date"].unique()))   # every session with any touch, line or placebo
            daily = ln.groupby("date")["mae60_px"].apply(list).reindex(ds)
            daily = daily.apply(lambda v: v if isinstance(v, list) else [])
            vals = []
            for k in range(len(ds)):
                lo_k = max(0, k - W)
                pool = [x for lst in daily.iloc[lo_k:k] for x in lst]
                vals.append(np.median(pool) if len(pool) >= 10 else np.nan)
            mp = pd.Series(vals, index=ds)
            stop_px[g.index] = mp.reindex(g["date"]).to_numpy()
        Xs = stop_px / A["sig_px"].to_numpy()
        ok = np.isfinite(Xs) & (Xs > 0)
        for rr in (1, 2):
            xi, ti = snap(np.where(ok, Xs, 0.25)), snap(np.where(ok, Xs * rr, 0.25))
            R, win = race_R(A, Tm, Bm, xi, ti)
            B_ = A.assign(R=R, win=win.astype(float), Xs=Xs)[ok]
            for keys, g in B_.groupby(["track", "side"]):
                e, lo, hi = dboot(g, "R")
                gl, gp = g[g.kind == "line"], g[g.kind == "placebo"]
                stop_rows.append({"stop": f"median MAE60 trailing {W}d", "rr": rr, "track": keys[0], "side": keys[1],
                                  "n": len(gl), "stop_sigma_p50": float(gl["Xs"].median()),
                                  "win_line": gl["win"].mean(), "win_placebo": gp["win"].mean(),
                                  "R_line": gl["R"].mean(), "R_placebo": gp["R"].mean(),
                                  "R_diff": e, "diff_lo": lo, "diff_hi": hi})
    SR = pd.DataFrame(stop_rows)
    SR.to_csv(OUT / "stops.csv", index=False)
    res["files"] = ["stacks.csv", "stack_share_by_instrument.csv", "noise_threshold.csv",
                    "noise_threshold_by_hour.csv", "stops.csv"]
    json.dump(res, open(OUT / "results.json", "w"), indent=1, default=str)
    pd.set_option("display.width", 250, "display.max_columns", 30, "display.max_rows", 400)
    print(ST.round(3).to_string())
    print(NT[NT.track != "all"].iloc[::2].round(3).to_string())
    print(SR.round(3).to_string())


def main():
    (OUT / "touches").mkdir(parents=True, exist_ok=True)
    args = sys.argv[1:]
    if args == ["summarise"]:
        summarise()
        return
    J = [tuple(a.split(":")) for a in args] or ([(s, "F") for s in CLR.RF.syms()] + [(s, "C") for s in CLR.RC.syms()])
    print(f"{len(J)} jobs", flush=True)
    with ProcessPoolExecutor(max_workers=4) as ex:
        for msg in ex.map(run, J):
            print(msg, flush=True)
    if not args:
        summarise()


if __name__ == "__main__":
    main()
