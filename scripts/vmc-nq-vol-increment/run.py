"""vmc-nq-vol-increment: Stages 1-5 exactly as registered (forge/VMC_NQ_VOL_INCREMENT_PREREG.md). One timeframe per call.

    python -I scripts/vmc-nq-vol-increment/run.py TF        -> analysis/output/vmc-nq-vol-increment/runs/tf<TF>.json
"""
import json
import sys
import time

from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as cm  # noqa: E402
import s4ref  # noqa: E402

YEARS = (2023, 2024, 2025, 2026)


def main(tf):
    t0 = time.time()
    t = cm.load(tf)
    S = cm.sets(t)
    td = pd.to_datetime(t.trade_date)
    tdn = td.to_numpy()
    y = t.y12.to_numpy(float)
    fitm = t.period.eq("fit").to_numpy() & t.elig12.to_numpy()
    testm = t.period.eq("test").to_numpy() & t.elig12.to_numpy()
    tr = cm.train_rows(t, fitm, tf)
    te = np.where(testm)[0]
    boot = cm.Boot(tdn[te])
    blk = boot.blocks(tdn[te])
    yt = y[te]
    out = {"tf": tf, "n_fit_rows": int(len(tr)), "n_fit_eligible": int(fitm.sum()), "n_test": int(len(te)),
           "test_dates": int(len(np.unique(tdn[te]))), "blocks": int(boot.nb)}
    # exclusion accounting
    src = t.src.to_numpy()
    out["exclusions"] = {per: {"bars": int((t.period == per).sum()), "eligible": int(((t.period == per) & t.elig12).sum()),
                               "eligible_owner_share": float(src[(t.period == per).to_numpy() & t.elig12.to_numpy()].mean())}
                         for per in ("fit", "test")}

    preds = {}

    def run(name, cols, yy=None, rows_tr=tr, rows_te=te):
        yy = y if yy is None else yy
        m = cm.fit(t, rows_tr, cols, yy[rows_tr])
        preds[name] = cm.predict(m, t, rows_te, cols)
        print(f"  tf{tf} {name} {time.time() - t0:.0f}s", flush=True)
        return preds[name]

    C, P, K, V, SV, PVD = (S[k] for k in ("C", "P", "K", "V", "SV", "PVD"))
    run("C", C)
    run("CP", C + P)
    run("CPK", C + P + K)
    run("CPKV", C + P + K + V)
    run("CPV", C + P + V)
    run("CPK_SV", C + P + K + SV)
    run("CPK_PVD", C + P + K + PVD)
    for b, cols in cm.F.V_BLOCKS.items():
        run(f"CPK+{b}", C + P + K + cols)
        run(f"CPKV-{b}", C + P + K + [c for c in V if c not in cols])
    e = {k: (yt - v) ** 2 for k, v in preds.items()}

    def skill(a, b, mask=None):
        m = np.ones(len(te), bool) if mask is None else mask
        return boot.ratio_skill(blk[m], e[a][m], e[b][m])

    # Stage 1 / S1 and absolute errors
    var = float(np.mean((yt - yt.mean()) ** 2))
    out["S1"] = {k: {"r2": 1 - float(np.mean(e[k])) / var, **cm.abs_errors(yt, preds[k]), "calibration": cm.calibration(yt, preds[k])}
                 for k in ("C", "CP", "CPK", "CPKV", "CPV")}
    naive = t.p_lr12.to_numpy(float)[te]
    out["S1"]["naive_last12"] = {"r2": 1 - float(np.mean((yt - naive) ** 2)) / var, **cm.abs_errors(yt, naive)}
    out["pairs"] = {"C->CP": skill("CP", "C"), "CP->CPK (calendar)": skill("CPK", "CP"),
                    "CPK->CPKV (PRIMARY H3)": skill("CPKV", "CPK"), "CP->CPV (H3-noK)": skill("CPV", "CP"),
                    "CPK->CPK+stale V": skill("CPK_SV", "CPK"), "CPK->CPK+PVD (descriptive)": skill("CPK_PVD", "CPK")}
    out["blocks"] = {b: skill(f"CPK+{b}", "CPK") for b in cm.F.V_BLOCKS}
    out["ablation"] = {b: skill("CPKV", f"CPKV-{b}") for b in cm.F.V_BLOCKS}
    out["V_minus_staleV"] = boot.diff_skill(blk, e["CPKV"], e["CPK_SV"], e["CPK"])
    # top 1% of base |error| removed (same bars for both models)
    ab = np.abs(yt - preds["CPK"])
    keep = ab < np.quantile(ab, 0.99)
    out["H3_without_top1pct"] = skill("CPKV", "CPK", keep)
    abn = np.abs(yt - preds["CP"])
    out["H3noK_without_top1pct"] = skill("CPV", "CP", abn < np.quantile(abn, 0.99))
    # descriptive splits of the primary pair
    yr = td.dt.year.to_numpy()[te]
    out["by_year_fixed_model"] = {int(Y): skill("CPKV", "CPK", yr == Y) for Y in YEARS}
    sess = t.c_sess.to_numpy()[te]
    out["by_session"] = {nm: skill("CPKV", "CPK", sess == i) for i, nm in enumerate(("rth", "europe", "post", "asia"))}
    out["nt8_only"] = skill("CPKV", "CPK", src[te] == 0)
    # Stage 2 (reassessment): residuals of the C+P+K model
    x = t.v_wtc_cross.to_numpy()[te] > 0
    z = np.abs(t.v_wtl_wt1.to_numpy(float)[te]) < 20
    groups = {"A": z & x, "B": z & ~x, "C": ~z & x, "D": ~z & ~x}

    def contrasts(r):
        g = boot.means(blk, r, groups)
        o = {k: {"n": g[k][2], "mean": g[k][0]} for k in "ABCD"}
        for nm, (p, q) in {"level_B_D": ("B", "D"), "cross_C_D": ("C", "D"), "cross_given_level_A_B": ("A", "B")}.items():
            o[nm] = cm.summarise(g[p][0] - g[q][0], g[p][1] - g[q][1])
        o["interaction"] = cm.summarise((g["A"][0] - g["B"][0]) - (g["C"][0] - g["D"][0]),
                                        (g["A"][1] - g["B"][1]) - (g["C"][1] - g["D"][1]))
        for nm in ("level_B_D", "cross_C_D", "cross_given_level_A_B", "interaction"):
            o[nm]["mde"] = 2.8 * o[nm]["se"]
        return o
    out["stage2_vs_CPK"] = contrasts(yt - preds["CPK"])
    # the banked simple baseline: NY hour x sigma500 tercile x signed prior 12-bar move decile (cutpoints from fit)
    hour = t.c_hh.to_numpy() // 2
    ls = t.p_ls500.to_numpy(float)
    mv = np.sign(t.p_disp12.to_numpy(float)) * t.p_zdisp12.to_numpy(float)
    qs = np.nanquantile(ls[fitm], [1 / 3, 2 / 3])
    qm = np.nanquantile(mv[fitm], np.linspace(0.1, 0.9, 9))
    key = hour * 100 + np.searchsorted(qs, ls) * 10 + np.searchsorted(qm, mv)
    mu = pd.Series(yt).groupby(key[te]).transform("mean").to_numpy()
    out["stage2_vs_simple_baseline"] = contrasts(yt - mu)
    # Stage 3/5 robustness: walk-forward annual refits
    wf = {}
    td_end = pd.to_datetime(td.shift(-12)).to_numpy()
    for Y in YEARS:
        yy = (yr == Y)
        if not yy.any():
            continue
        if Y == 2023:
            wf[str(Y)] = {"H3": skill("CPKV", "CPK", yy), "H3-noK": skill("CPV", "CP", yy)}
            continue
        start = np.datetime64(f"{Y}-01-01")
        rows = np.where(t.elig12.to_numpy() & (tdn < start) & (td_end < start))[0]
        rows = rows[rows % 3 == 0] if tf in (1, 3) else rows
        sub = te[yy]
        pw = {}
        for nm, cols in (("CPK", C + P + K), ("CPKV", C + P + K + V), ("CP", C + P), ("CPV", C + P + V)):
            pw[nm] = cm.predict(cm.fit(t, rows, cols, y[rows]), t, sub, cols)
            print(f"  tf{tf} wf{Y} {nm} {time.time() - t0:.0f}s", flush=True)
        ew = {k: (y[sub] - v) ** 2 for k, v in pw.items()}
        b2 = blk[yy]
        wf[str(Y)] = {"H3": boot.ratio_skill(b2, ew["CPKV"], ew["CPK"]), "H3-noK": boot.ratio_skill(b2, ew["CPV"], ew["CP"]),
                      "n": int(len(sub)), "fit_rows": int(len(rows))}
    out["walk_forward"] = wf
    # shuffled target (within trade date), every gated regression pair
    rng = np.random.default_rng(cm.SEED)
    el = np.where(t.elig12.to_numpy())[0]
    ys = y.copy()
    ys[el] = cm.shuffle_within_date(y[el], tdn[el], rng)
    sh = {}
    for nm, cols in [("CPK", C + P + K), ("CPKV", C + P + K + V), ("CP", C + P), ("CPV", C + P + V)] + \
            [(f"CPK+{b}", C + P + K + cols) for b, cols in cm.F.V_BLOCKS.items()]:
        m = cm.fit(t, tr, cols, ys[tr])
        sh[nm] = (ys[te] - cm.predict(m, t, te, cols)) ** 2
        print(f"  tf{tf} shuffled {nm} {time.time() - t0:.0f}s", flush=True)
    out["shuffled_target"] = {"H3": boot.ratio_skill(blk, sh["CPKV"], sh["CPK"]),
                              "H3-noK": boot.ratio_skill(blk, sh["CPV"], sh["CP"]),
                              **{f"block {b}": boot.ratio_skill(blk, sh[f"CPK+{b}"], sh["CPK"]) for b in cm.F.V_BLOCKS}}
    # OLS (secondary, descriptive)
    yo = {}
    for nm, cols in (("CPK", C + P + K), ("CPKV", C + P + K + V)):
        yo[nm] = cm.ols(t, tr, te, cols, y[tr])
    out["ols"] = {"CPK->CPKV": boot.ratio_skill(blk, (yt - yo["CPKV"]) ** 2, (yt - yo["CPK"]) ** 2),
                  "mse_CPK": float(np.mean((yt - yo["CPK"]) ** 2))}
    # h = 48 (descriptive)
    S48 = cm.sets(t, 48)
    f48 = t.period.eq("fit").to_numpy() & t.elig48.to_numpy()
    t48 = np.where(t.period.eq("test").to_numpy() & t.elig48.to_numpy())[0]
    tr48 = cm.train_rows(t, f48, tf)
    y48 = t.y48.to_numpy(float)
    b48 = boot.blocks(tdn[t48])
    p48 = {}
    for nm, cols in (("CPK", S48["C"] + P + S48["K"]), ("CPKV", S48["C"] + P + S48["K"] + V)):
        p48[nm] = cm.predict(cm.fit(t, tr48, cols, y48[tr48]), t, t48, cols)
    out["h48"] = boot.ratio_skill(b48, (y48[t48] - p48["CPKV"]) ** 2, (y48[t48] - p48["CPK"]) ** 2)
    # Stage 4
    out["stage4"], state = stage4(t, tf, tdn, boot, C + P + K, V, SV, P, t0)
    out["by_state"] = {k: skill("CPKV", "CPK", state[te] == k) for k in np.unique(state[te]) if (state[te] == k).sum() >= 1000}
    out["seconds"] = round(time.time() - t0)
    (cm.F.OUT / "runs").mkdir(exist_ok=True)
    (cm.F.OUT / "runs" / f"tf{tf}.json").write_text(json.dumps(out, indent=1, default=float))


def stage4(t, tf, tdn, boot, base, V, SV, P, t0):
    p = s4ref.percentile(t)
    s = s4ref.states(t, p)
    pt, pm, pf, p24 = (s[k].to_numpy() for k in ("p_t", "p_m12", "p_f", "p_24"))
    fitp = t.period.eq("fit").to_numpy()
    e12, e24 = t.elig12.to_numpy(), t.elig24.to_numpy()
    res = {"p_defined_pct_of_eligible": float(np.isfinite(pt[e12]).mean())}
    state = np.select([(pt <= .2) & (pm <= .2), (pt >= .8) & (pm <= .5), (pt >= .8) & (pm >= .8), (pt <= .5) & (pm >= .8)],
                      ["compression", "emerging", "established", "contraction"], "normal")
    state = np.where(np.isfinite(pt) & np.isfinite(pm), state, "undefined")
    res["state_share_test"] = pd.Series(state[e12 & ~fitp]).value_counts(normalize=True).to_dict()
    rng = np.random.default_rng(cm.SEED + 4)
    targets = {
        "H4a_onset": (e12 & np.isfinite(pt) & np.isfinite(pf) & (pt <= .5), pf >= .8),
        "H4b_onset_in_compression": (e12 & np.isfinite(pt) & np.isfinite(pm) & np.isfinite(pf) & (pt <= .2) & (pm <= .2), pf >= .8),
        "earlier_t13_24": (e24 & np.isfinite(pt) & np.isfinite(pf) & np.isfinite(p24) & (pt <= .5) & (pf < .8), p24 >= .8),
    }
    for nm, (pop, yb) in targets.items():
        yb = yb.astype(float)
        fr = cm.train_rows(t, pop & fitp, tf)
        te = np.where(pop & ~fitp)[0]
        if len(te) < 200 or len(fr) < 1000:
            res[nm] = {"n_test": int(len(te)), "skipped": "too few rows"}
            continue
        blk = boot.blocks(tdn[te])
        pr = {}
        for mn, cols in (("base", base), ("V", base + V), ("SV", base + SV)):
            pr[mn] = cm.predict(cm.fit(t, fr, cols, yb[fr], cls=True), t, te, cols, cls=True)
            print(f"  tf{tf} s4 {nm} {mn} {time.time() - t0:.0f}s", flush=True)
        yt = yb[te]
        br = {k: (v - yt) ** 2 for k, v in pr.items()}
        clim = float(yb[fr].mean())
        r = {"n_test": int(len(te)), "n_fit_rows": int(len(fr)), "skill_V": boot.ratio_skill(blk, br["V"], br["base"]),
             "skill_staleV": boot.ratio_skill(blk, br["SV"], br["base"]),
             "V_minus_staleV": boot.diff_skill(blk, br["V"], br["SV"], br["base"]),
             "base": cm.brier_block(yt, pr["base"], clim), "V": cm.brier_block(yt, pr["V"], clim)}
        if nm.startswith("H4"):
            # shuffled target within trade date
            pidx = np.where(pop)[0]
            ys = yb.copy()
            ys[pidx] = cm.shuffle_within_date(yb[pidx], tdn[pidx], rng)
            ps = {mn: cm.predict(cm.fit(t, fr, cols, ys[fr], cls=True), t, te, cols, cls=True)
                  for mn, cols in (("base", base), ("V", base + V))}
            r["shuffled_target"] = boot.ratio_skill(blk, (ps["V"] - ys[te]) ** 2, (ps["base"] - ys[te]) ** 2)
        res[nm] = r
    # recognising (descriptive): is bar t's own window >= 0.8? V alone vs P alone
    pop = e12 & np.isfinite(pt)
    yb = (pt >= .8).astype(float)
    fr = cm.train_rows(t, pop & fitp, tf)
    te = np.where(pop & ~fitp)[0]
    from sklearn.metrics import roc_auc_score
    rec = {}
    for mn, cols in (("V_only", V), ("P_only", P)):
        pr = cm.predict(cm.fit(t, fr, cols, yb[fr], cls=True), t, te, cols, cls=True)
        rec[mn] = {"auc": float(roc_auc_score(yb[te], pr)), "brier": float(np.mean((pr - yb[te]) ** 2))}
    res["recognising"] = rec
    return res, state


if __name__ == "__main__":
    main(int(sys.argv[1]))
