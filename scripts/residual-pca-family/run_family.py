"""residual-pca-family: the one run (forge/RESIDUAL_PCA_FAMILY_PREREG.md).

T4 wide10 (scored), T5 idx6 lag 2, T1 news, T2 month-end, T3 COT crowd (described).
Harness checks first: a synthetic null and an OU positive control for 10 and 6 instruments.
Writes analysis/output/residual-pca-family/results.json (+ daily loop CSVs).
"""
import json
import os
import sys
from math import erf, sqrt

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
import engine as E  # noqa: E402
import tags as T  # noqa: E402

SEED = 20261031
B = 2000
BLOCK = 21
N_PLACEBO = 200
OUT = os.path.join(T.ROOT, "analysis/output/residual-pca-family")
BUCKETS = [-np.inf, -1.5, -0.5, 0.5, 1.5, np.inf]
BNAMES = ["below -1.5", "-1.5 to -0.5", "-0.5 to 0.5", "0.5 to 1.5", "above 1.5"]
rng = np.random.default_rng(SEED)


def p_one_sided(z):
    return 0.5 * (1 - erf(z / sqrt(2)))


def bh(pvals, q=0.10):
    p = np.asarray(pvals, float)
    o = np.argsort(p)
    m = len(p)
    thr = q * (np.arange(1, m + 1)) / m
    passed = p[o] <= thr
    k = np.max(np.where(passed)[0]) + 1 if passed.any() else 0
    out = np.zeros(m, bool)
    out[o[:k]] = True
    return out.tolist()


def r4(v):
    return None if v is None or (isinstance(v, float) and not np.isfinite(v)) else round(float(v), 4)


def buckets(disp, e):
    d = disp.values.ravel()
    v = e.values.ravel()
    cat = pd.cut(d, BUCKETS, labels=BNAMES)
    g = pd.DataFrame({"b": cat, "e": v}).groupby("b", observed=False)["e"]
    res = {}
    for k in BNAMES:
        x = g.get_group(k) if k in g.groups else pd.Series(dtype=float)
        res[k] = {"obs": int(len(x)), "mean_next": r4(x.mean()), "t": r4(x.mean() / (x.std() / np.sqrt(len(x)))) if len(x) > 2 else None}
    return res


def run_universe(name, lag):
    r = T.universe(name)
    x = E.basket(r)
    n_is = E.WINDOW + (len(x) - E.WINDOW) // 2
    K, hist, band = E.choose_k(x, n_is)
    disp, e, rec = E.walk(x, r, K, T.COST, lag=lag)
    _, _, rec2 = E.walk(x, r, K, T.COST, lag=lag, cost_mult=2.0)
    return {"r": r, "x": x, "K": K, "K_hist": hist, "band": [round(float(b) * 100, 2) for b in band],
            "disp": disp, "e": e, "rec": rec, "rec2": rec2}


def halves(n):
    h = n // 2
    return slice(0, h), slice(h, n)


def book_perf(rec, rec2=None):
    a, b = halves(len(rec))
    out = {"IS_gross": E.perf(rec.gross.iloc[a]), "IS_net": E.perf(rec.net.iloc[a]),
           "OOS_gross": E.perf(rec.gross.iloc[b]), "OOS_net": E.perf(rec.net.iloc[b]),
           "full_net": E.perf(rec.net), "mean_daily_turnover": r4(rec.turnover.mean()),
           "max_abs_factor_exp_after_neutralise": float(rec.max_abs_exp_post.max())}
    if rec2 is not None:
        out["OOS_net_2x_cost"] = E.perf(rec2.net.iloc[b])
        out["IS_net_2x_cost"] = E.perf(rec2.net.iloc[a])
    out["net_pct_by_year"] = {int(k): round(float(v), 2) for k, v in rec.net.groupby(rec.index.year).sum().mul(100).items()}
    return out


# ---------------------------------------------------------------- IC tests (T4, T5)
def ic_test(U, label):
    disp, e = U["disp"], U["e"]
    ic = E.daily_ic(disp, e)
    a, b = halves(len(ic))
    t_full = float(E.tstat(ic, 5))
    res = {
        "label": label, "K": U["K"], "K_hist_IS": U["K_hist"], "noise_band_pct": U["band"],
        "signal_days": int(len(ic)), "first_signal": str(ic.index[0].date()), "oos_start": str(ic.index[b.start].date()),
        "IS": {"days": int(len(ic.iloc[a])), "mean_ic": r4(ic.iloc[a].mean()), "t_nw5": r4(E.tstat(ic.iloc[a], 5))},
        "OOS": {"days": int(len(ic.iloc[b])), "mean_ic": r4(ic.iloc[b].mean()), "t_nw5": r4(E.tstat(ic.iloc[b], 5))},
        "full": {"mean_ic": r4(ic.mean()), "t_nw5": r4(t_full), "p_one_sided": r4(p_one_sided(t_full))},
        "buckets_IS": buckets(disp.iloc[a], e.iloc[a]), "buckets_OOS": buckets(disp.iloc[b], e.iloc[b]),
        "ic_by_year": {int(k): {"mean_ic": r4(v["mean"]), "days": int(v["count"])}
                       for k, v in ic.groupby(ic.index.year).agg(["mean", "count"]).iterrows()},
    }
    gate = {"is_ic_pos": res["IS"]["mean_ic"] > 0, "oos_ic_pos": res["OOS"]["mean_ic"] > 0,
            "full_p_le_0.05": res["full"]["p_one_sided"] <= 0.05}
    res["gate"] = gate
    res["gate_pass"] = all(gate.values())
    # per instrument (time-series corr of -disp_i with e_i), full sample, BH q 0.10
    per, ps = {}, []
    for c in disp.columns:
        cc = float(np.corrcoef(-disp[c], e[c])[0, 1])
        tt = cc * np.sqrt(len(ic))
        per[c] = {"corr": r4(cc), "corr_IS": r4(np.corrcoef(-disp[c].iloc[a], e[c].iloc[a])[0, 1]),
                  "corr_OOS": r4(np.corrcoef(-disp[c].iloc[b], e[c].iloc[b])[0, 1]), "p": r4(p_one_sided(tt))}
        ps.append(per[c]["p"])
    for c, f in zip(disp.columns, bh(ps)):
        per[c]["bh_q10"] = f
    res["per_instrument"] = per
    # date-scramble placebo
    pl = []
    D, Ev = disp.values, e.values
    for _ in range(N_PLACEBO):
        perm = rng.permutation(len(Ev))
        pl.append(float(E.daily_ic(pd.DataFrame(D), pd.DataFrame(Ev[perm])).mean()))
    res["placebo_scramble"] = {"mean": r4(np.mean(pl)), "sd": r4(np.std(pl, ddof=1)),
                               "share_ge_real": r4(np.mean(np.array(pl) >= ic.mean()))}
    res["book"] = book_perf(U["rec"], U["rec2"])
    return res, ic


# ---------------------------------------------------------------- contrast tests (T1-T3)
def contrast_test(label, U, tagA, tagB, valid_rows, mirror=None):
    """tagA/tagB: bool DataFrames aligned to disp (signal dates). valid_rows: bool Series of days in scope."""
    disp, e = U["disp"], U["e"]
    S = (-disp * e)
    keep = valid_rows.reindex(S.index).fillna(False).values
    s = S.values[keep]
    A = tagA.reindex(S.index).fillna(False).values[keep].astype(float)
    Bm = tagB.reindex(S.index).fillna(False).values[keep].astype(float)
    dates = S.index[keep]
    n = len(s)
    a, b = halves(n)
    D_full = E.within_contrast(s, A, Bm)
    D_is = E.within_contrast(s, A, Bm, rows=np.arange(n)[a])
    D_oos = E.within_contrast(s, A, Bm, rows=np.arange(n)[b])
    se, _ = E.boot_se(lambda ix: E.within_contrast(s, A, Bm, rows=ix), n, BLOCK, B, rng)
    se_is, _ = E.boot_se(lambda ix: E.within_contrast(s[a], A[a], Bm[a], rows=ix), len(s[a]), BLOCK, B // 2, rng)
    se_oos, _ = E.boot_se(lambda ix: E.within_contrast(s[b], A[b], Bm[b], rows=ix), len(s[b]), BLOCK, B // 2, rng)

    def mean_in(mask, rows):
        m = mask[rows]
        return r4((s[rows] * m).sum() / m.sum()) if m.sum() > 0 else None

    res = {"label": label, "K": U["K"], "days": int(n), "first": str(dates[0].date()), "last": str(dates[-1].date()),
           "oos_start": str(dates[b.start].date()),
           "nA": int(A.sum()), "nB": int(Bm.sum()),
           "D_full": r4(D_full), "se_full": r4(se), "z_full": r4(D_full / se), "p_one_sided": r4(p_one_sided(D_full / se)),
           "D_IS": r4(D_is), "se_IS": r4(se_is), "D_OOS": r4(D_oos), "se_OOS": r4(se_oos),
           "mean_s_A": {"IS": mean_in(A, a), "OOS": mean_in(A, b)},
           "mean_s_B": {"IS": mean_in(Bm, a), "OOS": mean_in(Bm, b)},
           "mean_s_all": {"IS": r4(s[a].mean()), "OOS": r4(s[b].mean())}}
    if mirror is not None:
        Mm = mirror.reindex(S.index).fillna(False).values[keep].astype(float)
        res["mean_s_mirror"] = {"IS": mean_in(Mm, a), "OOS": mean_in(Mm, b), "n": int(Mm.sum())}
    gate = {"D_IS_pos": (D_is or 0) > 0, "D_OOS_pos": (D_oos or 0) > 0, "p_le_0.05": res["p_one_sided"] <= 0.05,
            "mean_s_A_IS_pos": (res["mean_s_A"]["IS"] or 0) > 0, "mean_s_A_OOS_pos": (res["mean_s_A"]["OOS"] or 0) > 0}
    res["candidate_gate"] = gate
    res["candidate"] = all(gate.values())
    # per-instrument contrast (disaggregation, BH q 0.10; iid SE x sqrt(deff 1.42) from the power table)
    per, ps = {}, []
    for j, c in enumerate(disp.columns):
        sa, sb = s[A[:, j] == 1, j], s[Bm[:, j] == 1, j]
        if len(sa) > 10 and len(sb) > 10:
            d = sa.mean() - sb.mean()
            sej = np.sqrt(sa.var(ddof=1) / len(sa) + sb.var(ddof=1) / len(sb)) * np.sqrt(1.42)
            per[c] = {"D": r4(d), "nA": int(len(sa)), "nB": int(len(sb)), "p": r4(p_one_sided(d / sej))}
            ps.append(per[c]["p"])
    for c, f in zip(per.keys(), bh(ps)):
        per[c]["bh_q10"] = f
    res["per_instrument"] = per
    return res, (s, A, Bm, dates)


def tag_shift_placebo(U, build_tags, valid_rows):
    """Circularly shift the raw tag inputs by >= 60 rows, rebuild A/B, recompute D."""
    disp, e = U["disp"], U["e"]
    S = (-disp * e)
    keep = valid_rows.reindex(S.index).fillna(False).values
    s = S.values[keep]
    n = len(s)
    out = []
    for _ in range(N_PLACEBO):
        k = int(rng.integers(60, n - 60))
        A, Bm = build_tags(k, keep)
        out.append(E.within_contrast(s, A, Bm))
    out = np.array([v for v in out if np.isfinite(v)])
    return {"mean": r4(out.mean()), "sd": r4(out.std(ddof=1)), "n": int(len(out))}, out


# ---------------------------------------------------------------- harness checks
def synthetic(kind, m, n=2400, seed=11):
    g = np.random.default_rng(seed)
    idx = pd.bdate_range("2016-01-04", periods=n)
    load = g.normal(0, 1, (m, 2)) * np.array([0.006, 0.003])
    f = g.standard_normal((n, 2))
    if kind == "null":
        eps = g.standard_normal((n, m)) * 0.003
    else:
        phi = 0.5 ** (1 / 15)
        lvl = np.zeros((n, m))
        for t in range(1, n):
            lvl[t] = phi * lvl[t - 1] + g.standard_normal(m) * 0.003
        eps = np.diff(lvl, axis=0, prepend=lvl[:1])
    return pd.DataFrame(f @ load.T + eps, index=idx, columns=[f"i{j}" for j in range(m)])


def harness_checks():
    out = {}
    for m, lag in [(10, 1), (6, 2), (8, 1)]:
        for kind in ["null", "ou"]:
            r = synthetic(kind, m)
            x = E.basket(r)
            d, ee, _ = E.walk(x, r, 2, {c: 0.0 for c in r.columns}, lag=lag)
            ic = E.daily_ic(d, ee)
            out[f"m{m}_lag{lag}_{kind}"] = {"mean_ic": r4(ic.mean()), "t_nw5": r4(E.tstat(ic, 5))}
    return out


def main():
    results = {"seed": SEED, "prereg": "forge/RESIDUAL_PCA_FAMILY_PREREG.md", "B": B, "block": BLOCK}
    results["harness_checks"] = harness_checks()
    print("harness", json.dumps(results["harness_checks"]))

    # T4 (scored) and T5 (described)
    W = run_universe("wide10", 1)
    results["T4_wide10"], _ = ic_test(W, "T4 wide10 (FX8 + XAU + XAG), lag 1")
    W["rec"].to_csv(os.path.join(OUT, "loop_wide10.csv"), float_format="%.7f")
    I = run_universe("idx6", 2)
    results["T5_idx6"], _ = ic_test(I, "T5 idx6 (6 index CFDs), lag 2")
    I["rec"].to_csv(os.path.join(OUT, "loop_idx6.csv"), float_format="%.7f")
    print("T4", json.dumps({k: results["T4_wide10"][k] for k in ["K", "IS", "OOS", "full", "gate_pass"]}))
    print("T5", json.dumps({k: results["T5_idx6"][k] for k in ["K", "IS", "OOS", "full", "gate_pass"]}))

    # T1-T3 on fx8
    F = run_universe("fx8", 1)
    idx = F["disp"].index
    cols = F["disp"].columns
    results["fx8_base"] = {"K": F["K"], "K_hist_IS": F["K_hist"], "book": book_perf(F["rec"], F["rec2"])}

    # T1 news
    news = T.news_tags(idx)
    valid1 = news.notna().all(axis=1)
    A1 = news == 0
    B1 = news == 1
    results["T1_news"], _ = contrast_test("T1 news: untagged (A) minus news-tagged (B)", F, A1, B1, valid1)
    nv = news.values

    def build1(k, keep):
        sh = np.roll(nv, k, axis=0)[keep]
        return (sh == 0).astype(float), (sh == 1).astype(float)
    results["T1_news"]["placebo_tag_shift"], _ = tag_shift_placebo(F, build1, valid1)
    _, _, recm = E.walk(F["x"], F["r"], F["K"], T.COST, mask=A1.where(valid1, True))
    results["T1_news"]["book_masked_to_A"] = book_perf(recm.loc[recm.index <= T.FF_END + pd.Timedelta(days=5)])

    # T2 month-end
    me = T.monthend_tags(idx)
    A2 = pd.DataFrame(np.repeat(me.values[:, None], len(cols), 1), index=idx, columns=cols)
    B2 = ~A2
    valid2 = pd.Series(True, index=idx)
    results["T2_monthend"], _ = contrast_test("T2 month-end close (A) minus other days (B)", F, A2, B2, valid2)
    mv = me.values

    def build2(k, keep):
        sh = np.roll(mv, k)[keep]
        a_ = np.repeat(sh[:, None], len(cols), 1).astype(float)
        return a_, 1 - a_
    results["T2_monthend"]["placebo_tag_shift"], _ = tag_shift_placebo(F, build2, valid2)
    _, _, recm2 = E.walk(F["x"], F["r"], F["K"], T.COST, mask=A2)
    results["T2_monthend"]["book_masked_to_A"] = book_perf(recm2)

    # T3 COT crowd
    cr = T.crowd_tags(idx)
    sg = np.sign(F["disp"])
    valid3 = cr.notna().all(axis=1)
    A3 = (cr != 0) & cr.notna() & (sg == cr)
    B3 = cr == 0
    M3 = (cr != 0) & cr.notna() & (sg == -cr)
    results["T3_cot"], _ = contrast_test("T3 COT: displacement aligned with an extreme crowd (A) minus neutral (B)",
                                         F, A3, B3, valid3, mirror=M3)
    cv, sv = cr.values, sg.values

    def build3(k, keep):
        sh = np.roll(cv, k, axis=0)
        a_ = ((sh != 0) & np.isfinite(sh) & (sv == sh))[keep].astype(float)
        b_ = (sh == 0)[keep].astype(float)
        return a_, b_
    results["T3_cot"]["placebo_tag_shift"], _ = tag_shift_placebo(F, build3, valid3)
    _, _, recm3 = E.walk(F["x"], F["r"], F["K"], T.COST, mask=A3)
    results["T3_cot"]["book_masked_to_A"] = book_perf(recm3)

    for k in ["T1_news", "T2_monthend", "T3_cot"]:
        print(k, json.dumps({kk: results[k][kk] for kk in ["nA", "nB", "D_full", "se_full", "p_one_sided", "D_IS", "D_OOS",
                                                            "mean_s_A", "mean_s_B", "candidate", "placebo_tag_shift"]}))
    json.dump(results, open(os.path.join(OUT, "results.json"), "w"), indent=1, default=str)


if __name__ == "__main__":
    main()
