"""residual-pca-stops (EXPLORATORY, not pre-registered).

C.OG to Chris (VIP Discord, 2026-10-31 13:20): before choosing a time stop or a z-score hard stop,
map the system's actual trade distribution with full MFE and MAE analysis, then engineer the stop
to that distribution (method: education/cog-snippets.md #1, the MAE noise threshold).

Model: the micro bank q1 residual model exactly as in scripts/residual-pca-family/engine.py
(window 120, K by the noise-band rule, 17:00 NY closes, panel to 2026-08-20; lockbox untouched).

Trade path in RESIDUAL-SD UNITS: holding instrument i in direction d from signal day t0, the day-k
return is d * e[t0+k-1, i] (e = next-day residual, loadings frozen at the signal day, scaled by the
window residual sd). This is the factor-hedged residual a z-score/half-life trader is betting on;
units are comparable across instruments and regimes. Resolution: daily closes only (no intraday
MAE in this container), so MAE/MFE here understate the true intraday excursion.

Two trade definitions (both per instrument):
  L  lesson book: in the trade while target = -disp is outside the 0.2 dead band and keeps its
     sign; a new trade on every sign change.
  C  threshold trade (Chris-style): enter when |z| >= 1.5 (direction -sign z); normal exit when z
     crosses 0 (back home); one trade at a time per instrument.

Stop grid, fixed here before any result was seen (exploratory, every cell reported):
  z hard stop (C only): exit at the close where |z| >= Zs on the entry side, Zs in {2.0, 2.5, 3.0}
  time stop (C):        exit at the close after N days,   N in {5, 10, 20, 40}
  book versions (L, net of house costs): target set to 0 while |disp| > Zs; or while the
                        instrument's same-sign run is older than N days (until the sign flips)
Reported per half (IS/OOS split at the middle signal day, as residual-pca-family) and in total.
"""
import json
import os
import sys

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "residual-pca-family"))
import engine as E  # noqa: E402
import tags as T  # noqa: E402

OUT = os.path.join(T.ROOT, "analysis/output/residual-pca-stops")
ZS = [2.0, 2.5, 3.0]
NS = [5, 10, 20, 40]
ENTRY = 1.5
MAE_GRID = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0]


def r4(v):
    return None if v is None or not np.isfinite(v) else round(float(v), 4)


# ---------------------------------------------------------------- episodes
def episodes_L(disp, e):
    D, Ev = disp.values, e.values
    n, m = D.shape
    out = []
    for i in range(m):
        cur = None
        for t in range(n):
            tgt = -D[t, i]
            s = 0 if abs(D[t, i]) < E.DEAD_BAND else int(np.sign(tgt))
            if cur is not None and s != cur["d"]:
                out.append(close_ep(cur, i, "signal flip"))
                cur = None
            if cur is None and s != 0:
                cur = {"t0": t, "d": s, "path": [], "z0": D[t, i]}
            if cur is not None:
                cur["path"].append(s * Ev[t, i])
        if cur is not None:
            out.append(close_ep(cur, i, "end of data"))
    return out


def episodes_C(disp, e, zstop=None, nstop=None):
    D, Ev = disp.values, e.values
    n, m = D.shape
    out = []
    for i in range(m):
        cur = None          # the open trade
        blocked = 0.0       # after a stop: no re-entry until z leaves this side (goes home)
        for t in range(n):
            z = D[t, i]
            if blocked and np.sign(z) != blocked:
                blocked = 0.0
            if cur is not None:
                # decision at close t (the path already holds every move up to close t)
                reason = None
                if np.sign(z) != np.sign(cur["z0"]):
                    reason = "back home"
                elif zstop is not None and abs(z) >= zstop:
                    reason = "z stop"
                elif nstop is not None and len(cur["path"]) >= nstop:
                    reason = "time stop"
                if reason:
                    out.append(close_ep(cur, i, reason))
                    cur = None
                    if reason != "back home":
                        blocked = np.sign(z)
            if cur is None and not blocked and abs(z) >= ENTRY and not (zstop is not None and abs(z) >= zstop):
                cur = {"t0": t, "d": int(-np.sign(z)), "path": [], "z0": z}
            if cur is not None:
                cur["path"].append(cur["d"] * Ev[t, i])
        if cur is not None:
            out.append(close_ep(cur, i, "end of data"))
    return out


def close_ep(cur, i, reason):
    c = np.cumsum(cur["path"])
    return {"i": i, "t0": cur["t0"], "d": cur["d"], "z0": float(cur["z0"]), "days": len(c),
            "final": float(c[-1]), "mfe": float(max(0.0, c.max())), "mae": float(min(0.0, c.min())),
            "reason": reason}


def summarise(eps, n_days):
    if not eps:
        return {"n": 0}
    df = pd.DataFrame(eps)
    h = n_days // 2
    res = {}
    for lab, part in [("all", df), ("IS", df[df.t0 < h]), ("OOS", df[df.t0 >= h])]:
        w = part.final > 0
        res[lab] = {
            "n": int(len(part)), "win_rate": r4(w.mean()), "mean_final": r4(part.final.mean()),
            "se_final": r4(part.final.std(ddof=1) / np.sqrt(len(part))) if len(part) > 1 else None,
            "median_final": r4(part.final.median()), "sum_final": r4(part.final.sum()),
            "days_q": {q: r4(part.days.quantile(q)) for q in (0.25, 0.5, 0.75, 0.9)},
            "mfe_q_winners": {q: r4(part.mfe[w].quantile(q)) for q in (0.5, 0.75, 0.9)},
            "mfe_q_losers": {q: r4(part.mfe[~w].quantile(q)) for q in (0.5, 0.75, 0.9)},
            "mae_q_winners": {q: r4(part.mae[w].quantile(q)) for q in (0.1, 0.25, 0.5)},
            "mae_q_losers": {q: r4(part.mae[~w].quantile(q)) for q in (0.1, 0.25, 0.5)},
            "giveback_mean": r4((part.mfe - part.final).mean()),
            "reasons": part.reason.value_counts().to_dict(),
        }
    return res


def noise_threshold(eps, n_days):
    """Snippet #1: beyond what MAE does going against you predict a loser? For trades that
    reached MAE <= -m, the win rate and mean final, vs all trades. Per half."""
    df = pd.DataFrame(eps)
    h = n_days // 2
    out = {}
    for lab, part in [("IS", df[df.t0 < h]), ("OOS", df[df.t0 >= h])]:
        base_w = (part.final > 0).mean()
        rows = {"base_win": r4(base_w), "base_mean": r4(part.final.mean())}
        for m in MAE_GRID:
            hit = part[part.mae <= -m]
            # what happens AFTER the touch: final minus the -m level (continuation cost of holding on)
            rows[str(m)] = {"n": int(len(hit)), "share": r4(len(hit) / len(part)),
                            "win_rate": r4((hit.final > 0).mean()) if len(hit) else None,
                            "mean_final": r4(hit.final.mean()) if len(hit) else None,
                            "mean_after_touch": r4((hit.final + m).mean()) if len(hit) else None}
        out[lab] = rows
    return out


# ---------------------------------------------------------------- book with stops
def book_with_stop(U, zstop=None, nstop=None):
    x, r, K = U["x"], U["r"], U["K"]
    disp = U["disp"]
    D = disp.values
    mask = np.ones_like(D, dtype=bool)
    if zstop is not None:
        mask &= np.abs(D) <= zstop
    if nstop is not None:
        age = np.zeros(D.shape[1])
        prev = np.zeros(D.shape[1])
        for t in range(D.shape[0]):
            s = np.where(np.abs(D[t]) < E.DEAD_BAND, 0, -np.sign(D[t]))
            age = np.where((s == prev) & (s != 0), age + 1, np.where(s != 0, 1, 0))
            prev = s
            mask[t] &= age <= nstop
    M = pd.DataFrame(mask, index=disp.index, columns=disp.columns)
    _, _, rec = E.walk(x, r, K, T.COST, mask=M)
    h = len(rec) // 2
    return {"IS_net": E.perf(rec.net.iloc[:h]), "OOS_net": E.perf(rec.net.iloc[h:]), "full_net": E.perf(rec.net),
            "turnover": r4(rec.turnover.mean())}


def run_universe(name):
    r = T.universe(name)
    x = E.basket(r)
    n_is = E.WINDOW + (len(x) - E.WINDOW) // 2
    K, _, _ = E.choose_k(x, n_is)
    disp, e, rec = E.walk(x, r, K, T.COST)
    U = {"x": x, "r": r, "K": K, "disp": disp, "e": e}
    n = len(disp)
    res = {"K": K, "signal_days": n, "first": str(disp.index[0].date()), "oos_start": str(disp.index[n // 2].date())}
    epL = episodes_L(disp, e)
    epC = episodes_C(disp, e)
    res["L_lesson_book_trades"] = summarise(epL, n)
    res["C_threshold_trades"] = summarise(epC, n)
    res["noise_threshold_L"] = noise_threshold(epL, n)
    res["noise_threshold_C"] = noise_threshold(epC, n)
    grid = {"none": summarise(epC, n)}
    for z in ZS:
        grid[f"z{z}"] = summarise(episodes_C(disp, e, zstop=z), n)
    for k in NS:
        grid[f"t{k}"] = summarise(episodes_C(disp, e, nstop=k), n)
    res["C_stop_grid"] = {k: {h: {kk: v[h][kk] for kk in ("n", "win_rate", "mean_final", "se_final", "sum_final")}
                              for h in ("IS", "OOS", "all")} for k, v in grid.items()}
    bk = {"none": book_with_stop(U)}
    for z in ZS:
        bk[f"z{z}"] = book_with_stop(U, zstop=z)
    for k in NS:
        bk[f"t{k}"] = book_with_stop(U, nstop=k)
    res["L_book_stop_grid"] = bk
    pd.DataFrame(epC).assign(instrument=lambda d: [disp.columns[i] for i in d.i],
                             entry_date=lambda d: [str(disp.index[t].date()) for t in d.t0]) \
        .drop(columns=["i", "t0"]).to_csv(os.path.join(OUT, f"trades_C_{name}.csv"), index=False, float_format="%.4f")
    return res


def main():
    os.makedirs(OUT, exist_ok=True)
    out = {"label": "EXPLORATORY, not pre-registered", "units": "residual-sd units, daily-close resolution",
           "entry_C": ENTRY, "zs": ZS, "ns": NS}
    for u in ["fx8", "wide10"]:
        out[u] = run_universe(u)
    json.dump(out, open(os.path.join(OUT, "results.json"), "w"), indent=1, default=str)
    print(json.dumps(out, indent=1, default=str)[:200])


if __name__ == "__main__" and len(sys.argv) == 1:
    main()


# ---------------------------------------------------------------- robustness of the C result (added after the first look)
def c_robustness(name, seed=20261031, B=2000, block=63):
    """Trades overlap across instruments and in time, so an iid SE overstates the evidence.
    Date-block bootstrap: resample blocks of 63 signal days (about two median holds) and take
    the mean final of trades entered in them. Plus net sum by entry year."""
    r = T.universe(name)
    x = E.basket(r)
    n_is = E.WINDOW + (len(x) - E.WINDOW) // 2
    K, _, _ = E.choose_k(x, n_is)
    disp, e, _ = E.walk(x, r, K, T.COST)
    df = pd.DataFrame(episodes_C(disp, e))
    n = len(disp)
    rng = np.random.default_rng(seed)
    out = {}
    for lab, lo, hi in [("IS", 0, n // 2), ("OOS", n // 2, n), ("all", 0, n)]:
        part = df[(df.t0 >= lo) & (df.t0 < hi)]
        by_day = part.groupby("t0").final.agg(["sum", "count"]).reindex(range(lo, hi), fill_value=0)
        S, C = by_day["sum"].values, by_day["count"].values
        m = hi - lo
        vals = []
        for _ in range(B):
            ix = E.block_starts(m, block, rng)
            c = C[ix].sum()
            if c:
                vals.append(S[ix].sum() / c)
        se = float(np.std(vals, ddof=1))
        mu = float(part.final.mean())
        out[lab] = {"n": int(len(part)), "mean_final": r4(mu), "se_block": r4(se), "t_block": r4(mu / se)}
    df["year"] = [disp.index[t].year for t in df.t0]
    out["sum_final_by_entry_year"] = {int(k): r4(v) for k, v in df.groupby("year").final.sum().items()}
    out["mean_final_by_instrument"] = {disp.columns[int(k)]: r4(v) for k, v in df.groupby("i").final.mean().items()}
    return out


if __name__ == "__main__" and len(sys.argv) > 1 and sys.argv[1] == "robust":
    res = json.load(open(os.path.join(OUT, "results.json")))
    for u in ["fx8", "wide10"]:
        res[u]["C_robustness"] = c_robustness(u)
        print(u, json.dumps(res[u]["C_robustness"]))
    json.dump(res, open(os.path.join(OUT, "results.json"), "w"), indent=1, default=str)


def threshold_book(name):
    """The C rule as a costed, factor-neutral book: the lesson loop with every instrument's
    target set to 0 except while it is inside a C trade (entered |z| >= 1.5, until home)."""
    r = T.universe(name)
    x = E.basket(r)
    n_is = E.WINDOW + (len(x) - E.WINDOW) // 2
    K, _, _ = E.choose_k(x, n_is)
    disp, e, _ = E.walk(x, r, K, T.COST)
    mask = np.zeros(disp.shape, dtype=bool)
    for ep in episodes_C(disp, e):
        mask[ep["t0"]: ep["t0"] + ep["days"], ep["i"]] = True
    M = pd.DataFrame(mask, index=disp.index, columns=disp.columns)
    out = {}
    for cm in (1.0, 2.0):
        _, _, rec = E.walk(x, r, K, T.COST, mask=M, cost_mult=cm)
        h = len(rec) // 2
        out[f"cost_x{int(cm)}"] = {"IS_gross": E.perf(rec.gross.iloc[:h]), "IS_net": E.perf(rec.net.iloc[:h]),
                                   "OOS_gross": E.perf(rec.gross.iloc[h:]), "OOS_net": E.perf(rec.net.iloc[h:]),
                                   "turnover": r4(rec.turnover.mean()),
                                   "share_days_any_position": r4(float((mask.any(1)).mean()))}
    return out


if __name__ == "__main__" and len(sys.argv) > 1 and sys.argv[1] == "book":
    res = json.load(open(os.path.join(OUT, "results.json")))
    for u in ["fx8", "wide10"]:
        res[u]["C_threshold_book"] = threshold_book(u)
        print(u, json.dumps(res[u]["C_threshold_book"]))
    json.dump(res, open(os.path.join(OUT, "results.json"), "w"), indent=1, default=str)
