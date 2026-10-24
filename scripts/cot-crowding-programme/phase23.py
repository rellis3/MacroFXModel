"""Phases 2-3 of cot-crowding-programme: scored cells P1-P10 plus the registered descriptive tables.
Runs the frozen design in forge/COT_CROWDING_PROGRAMME_PREREG.md (registered 705e46ea). Seed 20261024.
"""
import json, os, sys
from math import erf, sqrt

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
import panel as PN, states as ST, outcomes as OC  # noqa: E402

OUT = PN.DATA
SEED, B, BLOCK = 20261024, 2000, 26
SPLIT = pd.Timestamp("2016-12-31")
BARS = {"r12": 0.20, "r4": 0.25, "big_adverse4": 0.05, "rv_ratio": 0.05}
OUTS = ["r1", "r4", "r12", "mae4", "mae12", "mfe4", "mfe12", "big_adverse4", "shock20", "rv_ratio", "rev12"]


def p_from_ci(est, lo, hi):
    se = (hi - lo) / (2 * 1.959964)
    if not np.isfinite(se) or se <= 0:
        return np.nan
    z = abs(est) / se
    return 2 * (1 - 0.5 * (1 + erf(z / sqrt(2))))


def holm(ps):
    idx = sorted(range(len(ps)), key=lambda i: ps[i])
    adj, run = [0.0] * len(ps), 0.0
    for r, i in enumerate(idx):
        run = max(run, min(1.0, (len(ps) - r) * ps[i]))
        adj[i] = run
    return adj


def bh(ps, q=0.10):
    n = len(ps); order = sorted(range(n), key=lambda i: ps[i]); passed = [False] * n; k = 0
    for r, i in enumerate(order, 1):
        if ps[i] <= q * r / n:
            k = r
    for r, i in enumerate(order, 1):
        passed[i] = r <= k
    return passed


def block_weights(dates_sorted, rng):
    n = len(dates_sorted); nb = int(np.ceil(n / BLOCK))
    st = rng.integers(0, max(1, n - BLOCK + 1), nb)
    idx = (st[:, None] + np.arange(BLOCK)).ravel()
    return np.bincount(idx[idx < n], minlength=n).astype(float)


def matched(test, ctrl, keys, col, rng=None):
    """mean over test rows of (value - mean of its matched control cell); date-block bootstrap CI."""
    test = test.dropna(subset=[col] + keys); ctrl = ctrl.dropna(subset=[col] + keys)
    if len(test) == 0 or len(ctrl) == 0:
        return {"est": np.nan, "n": int(len(test))}
    cells = pd.concat([test[keys], ctrl[keys]]).drop_duplicates().reset_index(drop=True)
    cells["cell"] = np.arange(len(cells))
    t = test.merge(cells, on=keys, how="left"); c = ctrl.merge(cells, on=keys, how="left")
    dates = np.array(sorted(set(t.report_date) | set(c.report_date)))
    pos = {d: i for i, d in enumerate(dates)}
    td, cd = t.report_date.map(pos).values, c.report_date.map(pos).values
    tv, cv, tc, cc, nc = t[col].values, c[col].values, t.cell.values, c.cell.values, len(cells)

    def est(w):
        cs = np.bincount(cc, weights=cv * w[cd], minlength=nc); cn = np.bincount(cc, weights=w[cd], minlength=nc)
        has = cn[tc] > 0
        cm = np.where(cn > 0, cs / np.maximum(cn, 1e-12), np.nan)[tc]
        ww = w[td] * has
        return np.nansum((tv - cm) * ww) / ww.sum() if ww.sum() > 0 else np.nan, int(has.sum())

    point, nm = est(np.ones(len(dates)))
    out = {"est": round(float(point), 4), "n": int(len(t)), "matched": nm, "dropped": int(len(t) - nm),
           "test_mean": round(float(np.nanmean(tv)), 4)}
    if rng is not None:
        bs = np.array([est(block_weights(dates, rng))[0] for _ in range(B)])
        lo, hi = np.nanpercentile(bs, [2.5, 97.5])
        out.update({"lo": round(float(lo), 4), "hi": round(float(hi), 4), "p": p_from_ci(point, lo, hi)})
    return out


def eps(df, gap=2):
    """runs of the selected rows per market, by report date: a new run when consecutive selected reports
    are more than gap+1 weeks apart (the prereg's 'gaps of up to 2 reports merged')."""
    n = 0
    for _, g in df.groupby("sym"):
        d = g.report_date.sort_values().values
        if len(d):
            n += 1 + int((np.diff(d).astype("timedelta64[D]").astype(int) > 7 * (gap + 1)).sum())
    return n


def cell(name, q, test_mask, ctrl_mask, keys, col, rng, scope="holdout"):
    """registered cell: scope set (holdout or all macro), discovery reference, halves, episodes."""
    sc = q.set.eq("holdout") if scope == "holdout" else q.macro_ok.notna()
    res = {"name": name, "outcome": col, "keys": keys, "scope": scope}
    res["main"] = matched(q[test_mask & sc], q[ctrl_mask & sc], keys, col, rng)
    res["episodes"] = eps(q[test_mask & sc])
    early, late = q.report_date <= SPLIT, q.report_date > SPLIT
    res["half1"] = matched(q[test_mask & sc & early], q[ctrl_mask & sc & early], keys, col)
    res["half2"] = matched(q[test_mask & sc & late], q[ctrl_mask & sc & late], keys, col)
    if scope == "holdout":
        d = q.set.eq("discovery")
        res["discovery"] = matched(q[test_mask & d], q[ctrl_mask & d], keys, col, rng)
        res["discovery_episodes"] = eps(q[test_mask & d])
        cl = q.sym.isin(PN.CLEAN_HOLDOUT)
        res["clean_holdout"] = matched(q[test_mask & cl], q[ctrl_mask & cl], keys, col, rng)
    return res


# ── logistic incremental-value test (P9 / P10) ──────────────────────────────
def logit_fit(X, y, l2=1e-3, iters=50):
    w = np.zeros(X.shape[1])
    for _ in range(iters):
        z = np.clip(X @ w, -30, 30); p = 1 / (1 + np.exp(-z))
        g = X.T @ (p - y) / len(y) + l2 * w
        H = (X.T * (p * (1 - p))) @ X / len(y) + l2 * np.eye(X.shape[1])
        step = np.linalg.solve(H, g); w -= step
        if np.abs(step).max() < 1e-8:
            break
    return w


def logloss(X, y, w):
    p = np.clip(1 / (1 + np.exp(-np.clip(X @ w, -30, 30))), 1e-9, 1 - 1e-9)
    return -(y * np.log(p) + (1 - y) * np.log(1 - p))


def features(q):
    f = pd.DataFrame(index=q.index)
    f["tstr"] = q.tstr.clip(0, 5); f["m4"] = q.m4; f["mom26"] = (q.mom26 * q.trend_dir / (q.sigma_w * np.sqrt(26))).clip(-6, 6)
    f["vr"] = q.vr.clip(0, 4)
    f["mac_sup"], f["mac_ag"], f["mac_na"] = (q.macro_ok == 1).astype(float), (q.macro_ok == -1).astype(float), q.macro_ok.isna().astype(float)
    base = list(f.columns)
    f["with_trend"] = q.with_trend.astype(float); f["against"] = q.against_trend.astype(float)
    for s_ in ("B", "C", "D"):
        f[f"st_{s_}"] = (q.state == s_).astype(float)
    f["s"] = q.s / 100; f["flow_t"] = (q.d_share4 * q.trend_dir).clip(-0.5, 0.5)
    f["oi_chg4"] = q.oi_chg4.clip(-1, 1); f["frac80"] = q.frac80_26.fillna(0)
    return f, base, list(f.columns)


def incremental(q, target, rng):
    f, base, full = features(q)
    y = target.values.astype(float)
    ok = np.isfinite(y) & np.isfinite(f[full].values).all(1)
    disc, hold = q.set.eq("discovery").values & ok, q.set.eq("holdout").values & ok
    mu, sd = f[full][disc].mean(), f[full][disc].std().replace(0, 1)
    Z = (f[full] - mu) / sd
    Xb = np.c_[np.ones(len(Z)), Z[base].values]; Xf = np.c_[np.ones(len(Z)), Z[full].values]
    wb, wf = logit_fit(Xb[disc], y[disc]), logit_fit(Xf[disc], y[disc])
    d = logloss(Xb[hold], y[hold], wb) - logloss(Xf[hold], y[hold], wf)     # > 0 = COT features help
    hd = q[hold]
    dates = np.array(sorted(hd.report_date.unique())); pos = {x: i for i, x in enumerate(dates)}
    di = hd.report_date.map(pos).values
    S = np.bincount(di, weights=d, minlength=len(dates)); N = np.bincount(di, minlength=len(dates)).astype(float)
    point = d.mean()
    bs = []
    for _ in range(B):
        w = block_weights(dates, rng); bs.append((S * w).sum() / (N * w).sum())
    lo, hi = np.percentile(bs, [2.5, 97.5])
    early = (hd.report_date <= SPLIT).values
    return {"est": round(float(point), 5), "lo": round(float(lo), 5), "hi": round(float(hi), 5), "p": p_from_ci(point, lo, hi),
            "half1": round(float(d[early].mean()), 5), "half2": round(float(d[~early].mean()), 5),
            "n_holdout_rows": int(hold.sum()), "base_logloss": round(float(logloss(Xb[hold], y[hold], wb).mean()), 4),
            "coef_full": dict(zip(["const"] + full, np.round(wf, 3).tolist()))}


def gate(c, bar_key):
    m = c["main"]
    ci_ex = m.get("lo", np.nan) > 0 or m.get("hi", np.nan) < 0
    halves = np.sign(c["half1"]["est"]) == np.sign(c["half2"]["est"]) == np.sign(m["est"])
    disc_same = np.sign(c["discovery"]["est"]) == np.sign(m["est"]) if "discovery" in c else True
    epi = c["episodes"] >= 40
    prac = abs(m["est"]) >= BARS[bar_key]
    return {"ci_excludes_0": bool(ci_ex), "both_halves": bool(halves), "discovery_same_sign": bool(disc_same),
            "episodes>=40": bool(epi), "practical_bar": bool(prac)}


def main():
    rng = np.random.default_rng(SEED)
    px = PN.daily_prices()
    p = ST.add(PN.build(), px)
    # outcomes on the COMPLETE weekly panel: compute() finds "h reports later" by position, so it must
    # never see a filtered frame (dropped shutdown / non-ok weeks would silently stretch the horizon)
    p["dir"] = p.trend_dir
    p = p.join(OC.compute(p, px, "dir"))
    q = p[p.ok & p.history_ok & p.trend_dir.notna()].copy()
    q.to_csv(os.path.join(OUT, "phase23_rows.csv.gz"), index=False, compression="gzip")

    wt, ctl = q.with_trend, q.control
    K = ["sym", "T3", "m4", "V3"]
    cells = {
        "P1": cell("crowded with trend vs control", q, wt, ctl, K, "r12", rng),
        "P2": cell("crowded with trend vs control", q, wt, ctl, K, "big_adverse4", rng),
        "P3": cell("crowded with trend vs control", q, wt, ctl, K, "rv_ratio", rng),
        "P4": cell("state B vs control", q, q.state.eq("B"), ctl, K, "big_adverse4", rng),
        "P5": cell("state D vs control", q, q.state.eq("D"), ctl, K, "r4", rng),
        "P6": cell("state A vs control", q, q.state.eq("A"), ctl, K, "r12", rng),
        "P7": cell("danger vs other crowded-with-trend", q, wt & q.danger, wt & ~q.danger, ["sym", "T3", "V3"], "big_adverse4", rng),
        "P8": cell("macro against (F) vs supports (E)", q, wt & (q.macro_ok == -1), wt & (q.macro_ok == 1), K, "r4", rng, scope="macro"),
    }
    bar_of = {"P1": "r12", "P2": "big_adverse4", "P3": "rv_ratio", "P4": "big_adverse4", "P5": "r4", "P6": "r12", "P7": "big_adverse4", "P8": "r4"}
    cells["P9"] = {"name": "incremental prediction of big_adverse4 (holdout log-loss gain)", **incremental(q, q.big_adverse4, rng)}
    cells["P10"] = {"name": "incremental prediction of continuation sign(r12) (holdout log-loss gain)", **incremental(q, (q.r12 > 0).where(q.r12.notna()), rng)}

    names = [f"P{i}" for i in range(1, 11)]
    pv = [cells[k]["main"]["p"] if "main" in cells[k] else cells[k]["p"] for k in names]
    adj = holm(pv)
    for k, a, pr in zip(names, adj, pv):
        cells[k]["p"] = pr if "main" not in cells[k] else cells[k]["main"]["p"]
        cells[k]["holm_p"] = a
        if k in bar_of:
            g = gate(cells[k], bar_of[k]); g["holm<0.05"] = a < 0.05
            cells[k]["gate"] = g
            stat_ok = g["ci_excludes_0"] and g["holm<0.05"] and g["both_halves"] and g["discovery_same_sign"]
            if not g["episodes>=40"]:
                v = "UNDERPOWERED"
            elif stat_ok:
                v = "VALIDATED" if g["practical_bar"] else "CONTEXT"
            else:
                m = cells[k]["main"]; bar = BARS[bar_of[k]]
                v = "NULL" if (m["lo"] > -bar and m["hi"] < bar) else "UNDERPOWERED"   # CI rules out the practical effect -> NULL
            cells[k]["verdict"] = v
        else:
            c = cells[k]; ok = c["lo"] > 0 and a < 0.05 and c["half1"] > 0 and c["half2"] > 0
            cells[k]["gate"] = {"ci_excludes_0_positive": bool(c["lo"] > 0), "holm<0.05": bool(a < 0.05), "both_halves_positive": bool(c["half1"] > 0 and c["half2"] > 0)}
            cells[k]["verdict"] = "VALIDATED" if ok else "NULL"

    # ── descriptive (registered; BH q=0.10) ──
    desc = {}
    hold = q.set.eq("holdout")
    for st_ in ("A", "B", "C", "D"):
        for col in OUTS:
            desc[f"state {st_} | {col}"] = matched(q[q.state.eq(st_) & hold], q[ctl & hold], K, col, rng)
    q["trimmed"] = (((q.pct_share >= 90) & (q.share < 0)) | ((q.pct_share <= 10) & (q.share > 0))) & (q.crowd == q.trend_dir)
    for nm, m in (("against-trend (mirror)", q.against_trend), ("trimmed (mirror)", q.trimmed)):
        for col in ("r12", "big_adverse4", "rv_ratio"):
            desc[f"{nm} | {col}"] = matched(q[m & hold], q[ctl & hold], K, col, rng)
    q["long_held"] = q.frac80_26 >= 2 / 3
    q["onesided"] = np.exp(q.lgr * q.crowd) >= 3
    for nm, m in (("long-held", wt & q.long_held), ("recently arrived", wt & (q.frac80_26 < 1 / 3)),
                  ("one-sided (gross >= 3:1)", wt & q.onesided), ("not one-sided", wt & ~q.onesided)):
        for col in ("r12", "big_adverse4", "rv_ratio"):
            desc[f"{nm} | {col}"] = matched(q[m & hold], q[ctl & hold], K, col, rng)
    dlist = [k for k in desc if "p" in desc[k] and np.isfinite(desc[k]["p"])]
    passed = bh([desc[k]["p"] for k in dlist])
    for k, ps in zip(dlist, passed):
        desc[k]["bh_q10"] = bool(ps)
    per_mkt = {}
    for sym in sorted(q.sym.unique()):
        s_ = q.sym.eq(sym)
        per_mkt[sym] = {col: matched(q[wt & s_], q[ctl & s_], K, col)["est"] for col in ("r12", "big_adverse4", "rv_ratio")}
        per_mkt[sym]["n"] = int((wt & s_).sum()); per_mkt[sym]["set"] = q[s_].set.iat[0]
    counts = {"rows": int(len(q)), "with_trend": int(wt.sum()), "control": int(ctl.sum()),
              "states_holdout": q[hold & wt].state.value_counts().to_dict(), "states_discovery": q[~hold & wt].state.value_counts().to_dict()}
    km = {}
    for st_ in ("A", "B", "C", "D", "control"):
        m = (ctl if st_ == "control" else q.state.eq(st_)) & hold
        r = q[m]
        km[st_] = {"rev_within_12w": round(float(r.rev12.mean()), 3), "rev_within_26w": round(float(r.rev26.mean()), 3), "median_weeks_if_reversed": float(r.t_rev.median())}

    res = {"id": "cot-crowding-programme", "seed": SEED, "B": B, "prereg": "forge/COT_CROWDING_PROGRAMME_PREREG.md", "preregCommit": "705e46ea",
           "cells": cells, "descriptive": desc, "descriptive_bh_passes": int(sum(passed)), "descriptive_tests": len(dlist),
           "per_market_with_trend": per_mkt, "counts": counts, "time_to_reversal_holdout": km}
    json.dump(res, open(os.path.join(OUT, "phase23_results.json"), "w"), indent=1, default=lambda x: None if isinstance(x, float) and np.isnan(x) else str(x))
    for k in names:
        c = cells[k]
        if "main" in c:
            m = c["main"]
            print(k, c["name"], c["outcome"], f"est {m['est']:+.3f} [{m['lo']:+.3f},{m['hi']:+.3f}] n={m['n']} ep={c['episodes']}",
                  f"halves {c['half1']['est']:+.3f}/{c['half2']['est']:+.3f}", f"disc {c.get('discovery', {}).get('est', float('nan')):+.3f}",
                  f"clean {c.get('clean_holdout', {}).get('est', float('nan')):+.3f}", f"holm {c['holm_p']:.3f}", c["verdict"])
        else:
            print(k, c["name"], f"est {c['est']:+.5f} [{c['lo']:+.5f},{c['hi']:+.5f}] halves {c['half1']:+.5f}/{c['half2']:+.5f} holm {c['holm_p']:.3f}", c["verdict"])
    print("descriptive BH passes", res["descriptive_bh_passes"], "of", res["descriptive_tests"])


if __name__ == "__main__":
    main()
