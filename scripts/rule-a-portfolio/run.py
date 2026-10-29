"""rule-a-portfolio (forge/RULE_A_PORTFOLIO_PREREG.md): Lesson 06 on rule A.

    python scripts/rule-a-portfolio/run.py

Q3  walk-forward cluster risk budget (corr >= 0.30 clusters share one budget, 1/sigma inside) vs 1R per trade, 2022-26.
Q4  rule A (1R per trade) vs the CFD-tradeable portfolio book (S1g, S2, S3g, S4 equal weight): corr + joint worst-5% days.
Also writes the structure read the Decision Lab's Lesson 06 panel draws (matrix, spectrum, effective bets, tails).
Seed 20261027. Outputs analysis/output/rule-a-portfolio/{results.json, RESULTS.md} and backtest-data/decision-lab/portfolio.json.
"""
from __future__ import annotations

import gzip
import json
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import hypergeom, norm

SEED = 20261027
OUT = Path("analysis/output/rule-a-portfolio")
PAGE = Path("backtest-data/decision-lab/portfolio.json")
START, END, TEST0 = "2020-08-24", "2026-08-20", "2022-01-01"
THR, B, BLOCK, NPLACEBO = 0.30, 2000, 20, 200
FXG = ["EURUSD", "GBPUSD", "AUDUSD", "USDCAD", "USDCHF", "USDJPY", "GOLD"]
CFD = ["S1g", "S2", "S3g", "S4"]
UNIT = 1e8                                                       # js/portfolioBook.js


def rule_a_legs():
    R = json.load(gzip.open("backtest-data/decision-lab/rule_a.json.gz", "rt"))
    rows = []
    for t in R["trades"]:
        m = R["instruments"][t["inst"]]
        g = t["g"][m["stops"].index(0.2) * len(m["targets"]) + m["targets"].index("5")]
        if not g:
            continue
        unit = t["o"] * t["sig"] / 100
        risk = abs(t["ep"] - (t["L"] - t["side"] * 0.2 * unit))
        rows.append((t["inst"], t["d"], g[0] / 1000 - (2 * m["spread"] / risk if risk > 0 else 0)))
    D = pd.DataFrame(rows, columns=["inst", "d", "net"])
    P = D.pivot_table(index="d", columns="inst", values="net", aggfunc="sum")
    idx = pd.bdate_range(START, END).strftime("%Y-%m-%d")
    return P.reindex(idx).fillna(0.0), len(D)


def book_sleeves():
    b = json.load(open("analysis/output/portfolio-book/book.json"))
    out = {}
    for s in b["sleeves"]:
        out[s["id"]] = pd.Series(np.sum([np.asarray(l["c"], float) for l in s["legs"]], axis=0) / UNIT, index=b["dates"])
    return pd.DataFrame(out)


def sharpe(x):
    x = np.asarray(x, float)
    sd = x.std(ddof=1)
    return float(x.mean() / sd * np.sqrt(252)) if sd > 0 else float("nan")


def block_idx(T, rng):
    nb = int(np.ceil(T / BLOCK))
    st = rng.integers(0, T - BLOCK + 1, (B, nb))
    return (st[:, :, None] + np.arange(BLOCK)).reshape(B, -1)[:, :T]


def eff_bets(C):
    ev = np.sort(np.linalg.eigvalsh(C))[::-1]
    p = ev / ev.sum()
    n = len(ev)
    w = np.ones(n) / n
    return ev, {"N_PR": float(ev.sum() ** 2 / (ev ** 2).sum()), "N_ent": float(np.exp(-(p * np.log(p)).sum())),
                "N_var": float(1 / (w @ C @ w))}


def clusters(C, cols):
    n, seen, comp = len(cols), set(), []
    for i in range(n):
        if i in seen:
            continue
        stack, cc = [i], []
        while stack:
            k = stack.pop()
            if k in seen:
                continue
            seen.add(k)
            cc.append(k)
            stack += [j for j in range(n) if j not in seen and C[k, j] >= THR]
        comp.append(sorted(cc))
    return comp


def weights(prior, comp, inv_vol=True, use_clusters=True):
    n = prior.shape[1]
    sd = prior.std(ddof=1).to_numpy()
    sd = np.where(sd > 0, sd, np.nanmedian(sd[sd > 0]))
    w = np.zeros(n)
    if use_clusters:
        for cc in comp:
            for i in cc:
                w[i] = 1 / len(comp) / len(cc)
    else:
        w[:] = 1 / n
    if inv_vol:
        w = w / sd
    return w / w.mean()


def walk_forward(P, mode="cr", perm_rng=None):
    cols = list(P.columns)
    out = pd.Series(0.0, index=P.index)
    log = {}
    for Y in range(2022, 2027):
        y0, y1 = f"{Y}-01-01", f"{Y + 1}-01-01"
        prior = P[P.index < y0]
        C = prior.corr().to_numpy()
        comp = clusters(C, cols)
        if perm_rng is not None:                                  # placebo: same cluster sizes, legs shuffled
            perm = perm_rng.permutation(len(cols))
            flat, k = [], 0
            for cc in comp:
                flat.append(sorted(perm[k:k + len(cc)].tolist()))
                k += len(cc)
            comp = flat
        w = weights(prior, comp, inv_vol=mode in ("cr", "iv"), use_clusters=mode in ("cr", "cl"))
        cur = (P.index >= y0) & (P.index < y1)
        out[cur] = P[cur].to_numpy() @ w
        log[Y] = {"clusters": [[cols[i] for i in cc] for cc in comp if len(cc) > 1],
                  "weights": {c: round(float(x), 3) for c, x in zip(cols, w)}}
    return out, log


def joint_worst(a, b):
    T = len(a)
    k = int(round(0.05 * T))
    wa = a.sort_values(kind="stable").index[:k]
    wb = b.sort_values(kind="stable").index[:k]
    o = len(set(wa) & set(wb))
    return {"T": T, "k": k, "observed": o, "expected": round(k * k / T, 2), "p": float(hypergeom.sf(o - 1, T, k, k)),
            "b_on_a_worst": float(b[wa].sum()), "a_on_a_worst": float(a[wa].sum()),
            "a_on_b_worst": float(a[wb].sum()), "b_on_b_worst": float(b[wb].sum())}


def tail_curve(a, b, rng, reps=2000):
    T = len(a)
    # Flat days are exact zeros in both halves; ranking ties by date would line them up and fake shared "worst" days
    # once q passes the share of losing days (the index half loses on ~9% of days). Ties are broken at random instead.
    ra = (a + rng.uniform(0, 1e-9, T)).rank(method="first").to_numpy()
    rb = (b + rng.uniform(0, 1e-9, T)).rank(method="first").to_numpy()
    out = []
    for q in np.arange(0.02, 0.255, 0.01):
        k = int(round(q * T))
        ia, ib = ra <= k, rb <= k
        lam = float((ia & ib).sum() / k)
        sims = np.array([(ia & ib[rng.permutation(T)]).sum() / k for _ in range(reps // 10)])
        out.append({"q": round(float(q), 2), "lam": round(lam, 4), "lo": round(float(np.quantile(sims, .05)), 4),
                    "hi": round(float(np.quantile(sims, .95)), 4)})
    return out


def main():
    rng = np.random.default_rng(SEED)
    P, ntr = rule_a_legs()
    cols = list(P.columns)
    T = len(P)
    ew = P.sum(axis=1)

    # ---- Structure (descriptive; full sample was seen before the prereg) ----
    C = P.corr().to_numpy()
    iu = np.triu_indices(len(cols), 1)
    ev, eb = eff_bets(C)
    q = len(cols) / T
    fx, ix = [c for c in cols if c in FXG], [c for c in cols if c not in FXG]
    A, Bk = P[fx].sum(axis=1), P[ix].sum(axis=1)
    structure = {
        "days": T, "trades": ntr, "legs": cols, "corr": np.round(C, 3).tolist(), "avg_corr": float(C[iu].mean()),
        "corr_se": float(1 / np.sqrt(T)), "eigen": np.round(ev, 3).tolist(),
        "mp": [float((1 - q ** .5) ** 2), float((1 + q ** .5) ** 2)], **eb,
        "leg_sharpe": {c: round(sharpe(P[c]), 3) for c in cols}, "ew_sharpe": sharpe(ew),
        "mean_leg_sharpe": float(np.mean([sharpe(P[c]) for c in cols])),
        "books": {"A": fx, "B": ix, "corr": float(A.corr(Bk)), **joint_worst(A, Bk)},
        "tail_curve": tail_curve(A, Bk, np.random.default_rng(SEED)),
    }

    # ---- Q3: walk-forward cluster risk budget ----
    test = P.index >= TEST0
    cr, cr_log = walk_forward(P, "cr")
    x_cr, x_ew = cr[test].to_numpy(), ew[test].to_numpy()
    Tt = len(x_cr)
    idx = block_idx(Tt, rng)
    def sh_rows(M):
        m, s = M.mean(1), M.std(1, ddof=1)
        return m / s * np.sqrt(252)
    diff_bs = sh_rows(x_cr[idx]) - sh_rows(x_ew[idx])
    d_obs = sharpe(x_cr) - sharpe(x_ew)
    lo, hi = np.quantile(diff_bs, [0.025, 0.975])
    years = {}
    for Y in range(2022, 2027):
        m = (cr.index >= f"{Y}-01-01") & (cr.index < f"{Y + 1}-01-01")
        years[Y] = {"ew": round(sharpe(ew[m]), 3), "cr": round(sharpe(cr[m]), 3)}
    yrs_up = sum(v["cr"] >= v["ew"] for v in years.values())
    prng = np.random.default_rng(SEED + 1)
    plac = [sharpe(walk_forward(P, "cr", perm_rng=prng)[0][test]) for _ in range(NPLACEBO)]
    variants = {m: round(sharpe(walk_forward(P, m)[0][test]), 3) for m in ("iv", "cl")}
    def mdd(x):
        c = np.cumsum(x)
        return float((np.maximum.accumulate(c) - c).max())
    # scale-free drawdown: in units of the stream's own daily SD
    q3 = {"sharpe_ew": sharpe(x_ew), "sharpe_cr": sharpe(x_cr), "diff": d_obs, "ci95": [float(lo), float(hi)],
          "years": years, "years_cr_ge_ew": f"{yrs_up}/5", "placebo_median": float(np.median(plac)),
          "placebo_p90": float(np.quantile(plac, .9)), "cr_beats_placebo_share": float(np.mean(np.array(plac) < sharpe(x_cr))),
          "variants_sharpe": {"inverse_vol_only": variants["iv"], "clusters_only": variants["cl"]},
          "maxdd_in_daily_sd": {"ew": mdd(x_ew) / x_ew.std(ddof=1), "cr": mdd(x_cr) / x_cr.std(ddof=1)},
          "walk_forward": {str(k): v for k, v in cr_log.items()}}
    q3["p"] = float(2 * norm.sf(abs(d_obs) / ((hi - lo) / 3.92))) if hi > lo else 1.0
    gate3 = {"lower_bound_gt_0": lo > 0, "three_of_five_years": yrs_up >= 3}
    q3["gate"] = gate3

    # ---- Q4: rule A vs the CFD portfolio book ----
    S = book_sleeves()
    common = [d for d in P.index if d in S.index]
    a = ew.loc[common]
    Bb = S.loc[common, CFD].mean(axis=1)
    n4 = len(common)
    idx4 = block_idx(n4, np.random.default_rng(SEED + 2))
    av, bv = a.to_numpy(), Bb.to_numpy()
    def corr_rows(X, Y):
        X = X - X.mean(1, keepdims=True)
        Y = Y - Y.mean(1, keepdims=True)
        return (X * Y).sum(1) / np.sqrt((X * X).sum(1) * (Y * Y).sum(1))
    cb = corr_rows(av[idx4], bv[idx4])
    c_obs = float(np.corrcoef(av, bv)[0, 1])
    clo, chi = np.quantile(cb, [0.025, 0.975])
    jw = joint_worst(a, Bb)
    s1 = S.loc[common, "S1g"]
    mirror = {"corr": float(np.corrcoef(av, s1.to_numpy())[0, 1]),
              "ci95": [float(x) for x in np.quantile(corr_rows(av[idx4], s1.to_numpy()[idx4]), [0.025, 0.975])],
              **{k: v for k, v in joint_worst(a, s1).items() if k in ("observed", "expected", "p")}}
    per_sleeve = {k: round(float(np.corrcoef(av, S.loc[common, k].to_numpy())[0, 1]), 3) for k in S.columns}
    za, zb = a / a.std(ddof=1), Bb / Bb.std(ddof=1)                # equal risk
    comb = (za + zb) / 2
    M = pd.concat([P.loc[common], S.loc[common, CFD]], axis=1)
    _, eb15 = eff_bets(M.corr().to_numpy())
    q4 = {"days": n4, "corr": c_obs, "ci95": [float(clo), float(chi)], "joint_worst": jw, "mirror_S1g": mirror,
          "corr_by_sleeve": per_sleeve, "sharpe_rule_a": sharpe(a), "sharpe_book": sharpe(Bb), "sharpe_equal_risk": sharpe(comb),
          "effective_bets_15": eb15, "book_daily_sd": float(Bb.std(ddof=1))}
    se4 = (chi - clo) / 3.92
    q4["p"] = float(norm.cdf((0.20 - c_obs) / se4)) if se4 > 0 else 1.0     # p for "corr >= 0.20"
    q4["p"] = 1 - q4["p"]
    gate4 = {"corr_upper_lt_0.20": chi < 0.20, "joint_worst_p_gt_0.05": jw["p"] > 0.05}
    q4["gate"] = gate4

    # ---- verdicts (Holm over the two scored cells) ----
    ps = sorted([("Q3", q3["p"]), ("Q4", q4["p"])], key=lambda t: t[1])
    holm = {}
    for r, (k, p) in enumerate(ps):
        holm[k] = p <= 0.05 / (2 - r) and all(holm.values())
    v3 = "VALIDATED" if all(gate3.values()) and holm["Q3"] else ("UNDERPOWERED" if d_obs > 0 and lo <= 0 else "NULL")
    v4 = "VALIDATED" if all(gate4.values()) else "NULL"
    res = {"seed": SEED, "prereg": "forge/RULE_A_PORTFOLIO_PREREG.md", "structure": structure, "Q3": q3, "Q4": q4,
           "holm": holm, "verdicts": {"rule-a-portfolio-budget": v3, "rule-a-portfolio-second-book": v4}}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "results.json").write_text(json.dumps(res, indent=1, default=float))
    page = {"built": pd.Timestamp.now().strftime("%Y-%m-%d"), "prereg": res["prereg"], "verdicts": res["verdicts"],
            "structure": structure, "Q3": {k: v for k, v in q3.items() if k != "walk_forward"},
            "Q3_weights_2026": cr_log[2026], "Q4": q4,
            "cum": {"d": list(P.index[test][::5]), "ew": np.round(np.cumsum(x_ew)[::5], 2).tolist(),
                    "cr": np.round(np.cumsum(x_cr)[::5], 2).tolist()}}
    PAGE.write_text(json.dumps(page, default=float))
    print(json.dumps({"structure": {k: structure[k] for k in ("avg_corr", "N_PR", "N_ent", "N_var", "ew_sharpe")},
                      "Q3": {k: q3[k] for k in ("sharpe_ew", "sharpe_cr", "diff", "ci95", "years", "years_cr_ge_ew",
                                                 "placebo_median", "cr_beats_placebo_share", "variants_sharpe", "maxdd_in_daily_sd", "p")},
                      "Q3_2026": cr_log[2026],
                      "Q4": {k: q4[k] for k in ("days", "corr", "ci95", "joint_worst", "mirror_S1g", "corr_by_sleeve",
                                                 "sharpe_rule_a", "sharpe_book", "sharpe_equal_risk", "effective_bets_15", "p")},
                      "holm": holm, "verdicts": res["verdicts"]}, indent=1, default=float))


if __name__ == "__main__":
    main()
