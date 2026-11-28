"""g10-2y-gap-momentum: score FX-001 exactly as forge/G10_2Y_GAP_MOMENTUM_PREREG.md fixes it.

    python scripts/g10-2y-gap-momentum/score.py control   # positive control + shuffle (must pass first)
    python scripts/g10-2y-gap-momentum/score.py           # the scored run
Output: analysis/output/g10-2y-gap-momentum/control.json, results.json, site.json
"""
import json
import os
import sys

import numpy as np
import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "scripts", "residual-pca-family"))
import tags as T  # noqa: E402

OUT = os.path.join(ROOT, "analysis/output/g10-2y-gap-momentum")
FRED = os.path.join(ROOT, "analysis/output/residual-g10-layers/fred")
SEED, B = 20261128, 2000
START, END = pd.Timestamp("2005-01-03"), pd.Timestamp("2026-08-20")
MIN_N = 7
CELLS = [("g10-2y-gap-l20h5", 20, 5), ("g10-2y-gap-l5h5", 5, 5), ("g10-2y-gap-l20h20", 20, 20), ("g10-2y-gap-l5h20", 5, 20)]
PRIMARY = "g10-2y-gap-l20h5"
H10 = {"EUR": ("DEXUSEU", 1), "GBP": ("DEXUSUK", 1), "AUD": ("DEXUSAL", 1), "JPY": ("DEXJPUS", -1),
       "CAD": ("DEXCAUS", -1), "CHF": ("DEXSZUS", -1), "NOK": ("DEXNOUS", -1), "SEK": ("DEXSDUS", -1)}
CCYS = ["USD"] + list(H10)
COST = dict(T.COST, NOK=0.035, SEK=0.035)


# ---------------------------------------------------------------- inputs
def fx_returns():
    cols = {}
    for c, (sid, _) in H10.items():
        d = pd.read_csv(os.path.join(FRED, f"{sid}.csv"))
        d.columns = ["date", "v"]
        cols[c] = pd.Series(pd.to_numeric(d.v, errors="coerce").values, index=pd.to_datetime(d.date))
    p = pd.DataFrame(cols)
    p = p[(p.index.dayofweek < 5) & (p.index <= END)].dropna()
    lr = np.log(p).diff().dropna()
    r = pd.DataFrame(0.0, index=lr.index, columns=CCYS)
    for c, (_, sgn) in H10.items():
        r[c] = sgn * lr[c]
    return r


def yields_on(index):
    """Latest yield dated on or before t-1 (calendar), carried at most 5 calendar days."""
    y = pd.read_csv(os.path.join(OUT, "yields/yields_daily.csv"), index_col=0, parse_dates=True)
    out = pd.DataFrame(np.nan, index=index, columns=CCYS)
    t = pd.DataFrame({"t": index})
    for c in CCYS:
        s = y[c].dropna()
        a = pd.DataFrame({"avail": s.index + pd.Timedelta(days=1), "v": s.values}).sort_values("avail")
        m = pd.merge_asof(t, a, left_on="t", right_on="avail", direction="backward", tolerance=pd.Timedelta(days=5))
        out[c] = m["v"].values
    return out


# ---------------------------------------------------------------- panel
def rank_rows(A):
    return pd.DataFrame(A).rank(axis=1).values


def spearman_rows(a, b):
    """Row-wise Spearman on masked rows (NaN = not in the universe)."""
    ra = pd.DataFrame(a).rank(axis=1).values
    rb = pd.DataFrame(b).rank(axis=1).values
    ra = ra - np.nanmean(ra, axis=1, keepdims=True)
    rb = rb - np.nanmean(rb, axis=1, keepdims=True)
    num = np.nansum(ra * rb, axis=1)
    den = np.sqrt(np.nansum(ra * ra, axis=1) * np.nansum(rb * rb, axis=1))
    with np.errstate(invalid="ignore", divide="ignore"):
        return num / den


def build(r, Y, L, H):
    """Arrays over signal days: S (signal), F (forward basket return), YD (level), U (universe mask)."""
    idx = r.index
    n, m = len(idx), len(CCYS)
    R = r.values
    Yv = Y.values
    rows = [t for t in range(L, n - H) if START <= idx[t] and idx[t + H] <= END]
    S = np.full((len(rows), m), np.nan)
    F = np.full((len(rows), m), np.nan)
    YD = np.full((len(rows), m), np.nan)
    X1 = np.full((len(rows), m), np.nan)    # same-day basket return (descriptive)
    MOM = np.full((len(rows), m), np.nan)   # 20-day basket return (descriptive benchmark)
    for k, t in enumerate(rows):
        u = np.isfinite(Yv[t]) & np.isfinite(Yv[t - L])
        if u.sum() < MIN_N:
            continue
        y0, y1 = Yv[t - L][u], Yv[t][u]
        yd0, yd1 = y0 - y0.mean(), y1 - y1.mean()
        S[k, u] = yd1 - yd0
        YD[k, u] = yd1
        fwd = R[t + 1: t + H + 1][:, u]
        fwd = fwd - fwd.mean(axis=1, keepdims=True)
        F[k, u] = fwd.sum(axis=0)
        x1 = R[t][u] - R[t][u].mean()
        X1[k, u] = x1
        past = R[max(0, t - 19): t + 1][:, u]
        MOM[k, u] = (past - past.mean(axis=1, keepdims=True)).sum(axis=0)
    keep = np.isfinite(S).sum(axis=1) >= MIN_N
    dates = idx[np.array(rows)][keep]
    return dates, S[keep], F[keep], YD[keep], X1[keep], MOM[keep]


def carry_orth(S, YD):
    """Residual of signal ranks on level ranks, per day (with intercept)."""
    rs, ry = rank_rows(S), rank_rows(YD)
    out = np.full_like(rs, np.nan)
    for k in range(len(rs)):
        u = np.isfinite(rs[k])
        X = np.column_stack([np.ones(u.sum()), ry[k, u]])
        beta = np.linalg.lstsq(X, rs[k, u], rcond=None)[0]
        out[k, u] = rs[k, u] - X @ beta
    return out


# ---------------------------------------------------------------- stats
def block_idx(n, block, rng):
    k = int(np.ceil(n / block))
    st = rng.integers(0, n - block + 1, size=k)
    return (st[:, None] + np.arange(block)[None, :]).ravel()[:n]


def boot_mean(x, block, rng):
    x = np.asarray(x)
    x = x[np.isfinite(x)]
    mu = x.mean()
    bm = np.array([x[block_idx(len(x), block, rng)].mean() for _ in range(B)])
    p_pos = float(np.mean(bm - mu >= mu))          # one-sided p for mean > 0 (centred null)
    p_neg = float(np.mean(bm - mu <= mu))          # one-sided p for mean < 0
    lo, hi = np.percentile(bm, [2.5, 97.5])
    return {"mean": round(float(mu), 4), "se": round(float(bm.std(ddof=1)), 4), "ci95": [round(float(lo), 4), round(float(hi), 4)],
            "t": round(float(mu / bm.std(ddof=1)), 2), "p_pos": round(p_pos, 4), "p_neg": round(p_neg, 4), "days": int(len(x))}


def holm(ps):
    order = np.argsort(ps)
    adj = np.empty(len(ps))
    run = 0.0
    for rank, i in enumerate(order):
        run = max(run, (len(ps) - rank) * ps[i])
        adj[i] = min(1.0, run)
    return adj


def book(dates, S, r, H):
    """Overlapping-tranche book on rank weights; P&L earned t -> t+1 at the noon fixing."""
    rk = rank_rows(S)
    w = rk - np.nanmean(rk, axis=1, keepdims=True)
    w = np.nan_to_num(w)
    g = np.abs(w).sum(axis=1, keepdims=True)
    w = np.divide(w, g, out=np.zeros_like(w), where=g > 0)
    W = pd.DataFrame(w).rolling(H, min_periods=1).mean().values
    R = r.reindex(dates).values           # placeholder for alignment checks
    nxt = r.shift(-1).reindex(dates).values
    cvec = np.array([COST[c] / 100.0 / 2.0 for c in CCYS])
    gross = np.nansum(W * nxt, axis=1)
    turn = np.abs(np.diff(np.vstack([np.zeros(len(CCYS)), W]), axis=0))
    cost = turn @ cvec
    del R
    return pd.DataFrame({"gross": gross, "cost": cost, "net": gross - cost}, index=dates), W


def sharpe(a):
    a = np.asarray(a)
    return float(a.mean() / a.std() * np.sqrt(252)) if a.std() > 0 else np.nan


def boot_sharpe(x, block, rng):
    x = np.asarray(x)
    v = np.array([sharpe(x[block_idx(len(x), block, rng)]) for _ in range(B)])
    lo, hi = np.percentile(v, [2.5, 97.5])
    return {"sharpe": round(sharpe(x), 3), "ci95": [round(float(lo), 3), round(float(hi), 3)],
            "ann_ret_pct": round(float(x.mean() * 252 * 100), 3), "ann_vol_pct": round(float(x.std() * np.sqrt(252) * 100), 3)}


# ---------------------------------------------------------------- runs
def control():
    rng = np.random.default_rng(SEED)
    r = fx_returns()
    Y = yields_on(r.index)
    out = {}
    for cid, L, H in CELLS[:1] + CELLS[2:3]:
        dates, S, F, YD, _, _ = build(r, Y, L, H)
        z = (F - np.nanmean(F, axis=1, keepdims=True)) / np.nanstd(F, axis=1, keepdims=True)
        Sp = z + 20.0 * rng.standard_normal(z.shape)
        Sp[~np.isfinite(S)] = np.nan
        ic = spearman_rows(Sp, F)
        planted = boot_mean(ic, max(21, 2 * H), rng)
        sh = []
        mask = ~np.isfinite(S)
        for _ in range(500):
            S2 = rng.random(S.shape)        # random keys = a uniform random ranking within each day's universe
            S2[mask] = np.nan
            sh.append(np.nanmean(spearman_rows(S2, F)))
        sh = np.array(sh)
        ok_p = 0.03 <= planted["mean"] <= 0.07 and planted["ci95"][0] > 0
        ok_s = abs(sh.mean()) < 2 * planted["se"]
        out[cid] = {"planted_ic_target": 0.048, "planted": planted, "shuffle_mean": round(float(sh.mean()), 4),
                    "shuffle_sd": round(float(sh.std()), 4), "pass_planted": bool(ok_p), "pass_shuffle": bool(ok_s),
                    "signal_days": int(len(dates)), "first": str(dates[0].date()), "last": str(dates[-1].date()),
                    "mean_n_ccy": round(float(np.isfinite(S).sum(1).mean()), 2)}
        print(cid, json.dumps(out[cid]))
    json.dump(out, open(os.path.join(OUT, "control.json"), "w"), indent=1)


def main():
    rng = np.random.default_rng(SEED)
    r = fx_returns()
    Y = yields_on(r.index)
    res, ps, site = {}, [], {"cells": {}}
    for cid, L, H in CELLS:
        blk = max(21, 2 * H)
        dates, S, F, YD, X1, MOM = build(r, Y, L, H)
        ic = spearman_rows(S, F)
        h = len(ic) // 2
        cell = {"L": L, "H": H, "block": blk, "signal_days": int(len(dates)), "first": str(dates[0].date()),
                "last": str(dates[-1].date()), "half_split": str(dates[h].date()),
                "mean_n_ccy": round(float(np.isfinite(S).sum(1).mean()), 2),
                "ic": boot_mean(ic, blk, rng),
                "ic_half1": boot_mean(ic[:h], blk, rng), "ic_half2": boot_mean(ic[h:], blk, rng)}
        cell["ic_carry_orth"] = boot_mean(spearman_rows(carry_orth(S, YD), F), blk, rng)
        bk, W = book(dates, S, r, H)
        cell["book_net"] = boot_sharpe(bk.net.values, blk, rng)
        cell["book_gross"] = {"sharpe": round(sharpe(bk.gross.values), 3)}
        cell["book_net_halves"] = [round(sharpe(bk.net.values[:h]), 3), round(sharpe(bk.net.values[h:]), 3)]
        cell["book_cost_bp_day"] = round(float(bk.cost.mean() * 1e4), 3)
        # descriptive
        cell["desc"] = {"same_day_ic": round(float(np.nanmean(spearman_rows(S, X1))), 4),
                        "carry_level_ic": boot_mean(spearman_rows(YD, F), blk, rng),
                        "price_mom20_ic": boot_mean(spearman_rows(MOM, F), blk, rng),
                        "ic_by_year": {int(y): round(float(np.nanmean(ic[dates.year == y])), 4) for y in sorted(set(dates.year))}}
        # per-currency share of the book's net P&L
        nxt = r.shift(-1).reindex(dates).values
        cell["desc"]["book_gross_bp_by_ccy"] = {c: round(float(np.nansum(W[:, j] * nxt[:, j]) * 1e4), 1) for j, c in enumerate(CCYS)}
        ps.append(cell["ic"]["p_pos"])
        res[cid] = cell
        site["cells"][cid] = {"dates": [str(d.date()) for d in dates], "ic": [None if not np.isfinite(v) else round(float(v), 4) for v in ic],
                              "net_bp": [round(float(v) * 1e4, 3) for v in bk.net.values],
                              "gross_bp": [round(float(v) * 1e4, 3) for v in bk.gross.values]}
        print(cid, "IC", cell["ic"], "| halves", cell["ic_half1"]["mean"], cell["ic_half2"]["mean"],
              "| orth", cell["ic_carry_orth"]["mean"], cell["ic_carry_orth"]["p_pos"], "| net", cell["book_net"])
    adj = holm(np.array(ps))
    adjn = holm(np.array([res[c]["ic"]["p_neg"] for c, _, _ in CELLS]))
    for (cid, _, _), a, an in zip(CELLS, adj, adjn):
        c = res[cid]
        c["holm_p_pos"], c["holm_p_neg"] = round(float(a), 4), round(float(an), 4)
        both = c["ic_half1"]["mean"] > 0 and c["ic_half2"]["mean"] > 0
        if a <= 0.05 and both:
            v = "VALIDATED"
        elif c["ic"]["ci95"][1] < 0.03:
            v = "NULL"
        else:
            v = "UNDERPOWERED"
        c["mirror_reversal"] = bool(an <= 0.05 and c["ic_half1"]["mean"] < 0 and c["ic_half2"]["mean"] < 0)
        if c["mirror_reversal"]:
            v = "NULL"
        c["verdict"] = v
    p = res[PRIMARY]
    if p["verdict"] == "VALIDATED":
        fam = "VALIDATED" if (p["ic_carry_orth"]["p_pos"] <= 0.05 and p["book_net"]["sharpe"] > 0) else "CONTEXT"
    else:
        fam = p["verdict"]
    meta = {"seed": SEED, "B": B, "prereg": "forge/G10_2Y_GAP_MOMENTUM_PREREG.md", "family_verdict": fam,
            "ccys": CCYS, "null_bar_ic": 0.03, "end": str(END.date())}
    json.dump({"meta": meta, "cells": res}, open(os.path.join(OUT, "results.json"), "w"), indent=1)
    site["meta"] = meta
    site["results"] = res
    json.dump(site, open(os.path.join(OUT, "site.json"), "w"), separators=(",", ":"))
    print("FAMILY", fam, {c: res[c]["verdict"] for c, _, _ in CELLS})


if __name__ == "__main__":
    control() if len(sys.argv) > 1 and sys.argv[1] == "control" else main()
