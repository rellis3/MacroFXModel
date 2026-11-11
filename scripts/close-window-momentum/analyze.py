"""close-window-momentum: score the 32 registered cells + the registered descriptives (run once).

Prereg: forge/CLOSE_WINDOW_MOMENTUM_PREREG.md (commit 2bd383b8). Seed 20261111, week-cluster bootstrap B = 2000.
Inputs: analysis/output/close-window-momentum/days_*.parquet (build.py), level_touches.parquet (levels.py).
Output: analysis/output/close-window-momentum/results.json (+ printed tables).
"""
import importlib.util
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import norm
import statsmodels.api as sm

_s = importlib.util.spec_from_file_location("common", Path(__file__).with_name("common.py"))
C = importlib.util.module_from_spec(_s)
_s.loader.exec_module(C)
OUT = C.OUT
RNG = np.random.default_rng(C.SEED)
POWER = json.loads((OUT / "power_count.json").read_text())

BAR = {"beta": 0.025, "beta_neg": 0.066, "inter": 0.058, "beta_fh": 0.035, "trade_idx": 2.75, "trade_sec": 1.0,
       "L": 0.10}


# ------------------------------------------------------------------ bootstrap machinery
def weights(weeks):
    u, inv = np.unique(weeks, return_inverse=True)
    W = RNG.multinomial(len(u), np.full(len(u), 1 / len(u)), size=C.B).astype(float)
    return u, inv, W


def wsum(inv, nweeks, v):
    return np.bincount(inv, weights=v, minlength=nweeks)


def beta_from(S):
    n, sx, sy, sxx, sxy = S
    return (sxy - sx * sy / n) / (sxx - sx * sx / n)


def reg_sums(inv, nw, x, y, mask=None):
    m = np.ones(len(x), bool) if mask is None else mask
    return np.vstack([wsum(inv, nw, m * 1.0), wsum(inv, nw, m * x), wsum(inv, nw, m * y),
                      wsum(inv, nw, m * x * x), wsum(inv, nw, m * x * y)])


def boot_beta(d, xcol="x", ycol="y", mask=None):
    x, y = d[xcol].to_numpy(), d[ycol].to_numpy()
    u, inv, W = weights(d["week"].to_numpy())
    S = reg_sums(inv, len(u), x, y, mask)
    est = beta_from(S.sum(1))
    bs = beta_from(S @ W.T)
    return est, bs


def summarize(est, bs):
    se = float(np.nanstd(bs))
    lo, hi = np.nanpercentile(bs, [2.5, 97.5])
    z = est / se if se > 0 else np.nan
    return {"est": float(est), "lo": float(lo), "hi": float(hi), "se": se, "t_boot": float(z),
            "p": float(2 * (1 - norm.cdf(abs(z))))}


def hac_t(x, y):
    m = sm.OLS(y, sm.add_constant(x)).fit(cov_type="HAC", cov_kwds={"maxlags": 5})
    return float(m.params[1]), float(m.tvalues[1])


def ols(x, y):
    x, y = np.asarray(x), np.asarray(y)
    if len(x) < 3:
        return np.nan
    xm = x - x.mean()
    return float((xm * (y - y.mean())).sum() / (xm * xm).sum())


# ------------------------------------------------------------------ cells
def own_half(df):
    """halves split at the cell's OWN median date (prereg section 3), not the instrument's full-sample split."""
    days = np.sort(df["day"].unique())
    cut = days[len(days) // 2 - 1]
    return np.where(df["day"] <= cut, 1, 2)


def verdict(c, bar, extra_ok=True):
    halves_ok = all(h > 0 for h in c["halves"])
    if c["lo"] > 0 and c["bh"] and halves_ok and c["est"] >= bar and extra_ok:
        return "VALIDATED"
    if c["lo"] > 0 and c["bh"]:
        return "CONTEXT"
    if c["hi"] < bar or c["hi"] < 0:
        return "NULL"
    return "UNDERPOWERED"


def slope_cell(name, d, kind, xcol="x", mask_col=None):
    if kind == "beta_neg":
        dd = d.dropna(subset=["gneg"])
        mask = (dd["gneg"] == 1).to_numpy()
        est, bs = boot_beta(dd, mask=mask)
        sub = dd[mask]
    else:
        dd = d.dropna(subset=[xcol])
        est, bs = boot_beta(dd, xcol=xcol)
        sub = dd
    c = summarize(est, bs)
    c["n"] = int(len(sub))
    c["halves"] = [ols(h[xcol], h["y"]) for _, h in sub.groupby(own_half(sub))]
    c["raw_beta"] = ols(sub["r1_raw"], sub["r2_raw"]) if xcol == "x" else None
    c["hac_beta"], c["hac_t"] = hac_t(sub[xcol].to_numpy(), sub["y"].to_numpy())
    return c


def inter_cell(d):
    dd = d.dropna(subset=["gneg"])
    x, y = dd["x"].to_numpy(), dd["y"].to_numpy()
    u, inv, W = weights(dd["week"].to_numpy())
    neg = (dd["gneg"] == 1).to_numpy()
    Sn, Sp = reg_sums(inv, len(u), x, y, neg), reg_sums(inv, len(u), x, y, ~neg)
    est = beta_from(Sn.sum(1)) - beta_from(Sp.sum(1))
    bs = beta_from(Sn @ W.T) - beta_from(Sp @ W.T)
    c = summarize(est, bs)
    c["n"] = int(len(dd))
    c["n_neg"], c["n_pos"] = int(neg.sum()), int((~neg).sum())
    c["beta_pos"] = float(beta_from(Sp.sum(1)))
    c["beta_pos_ci"] = [float(v) for v in np.nanpercentile(beta_from(Sp @ W.T), [2.5, 97.5])]
    c["halves"] = []
    for _, h in dd.groupby(own_half(dd)):
        hn = h[h.gneg == 1]
        hp = h[h.gneg == 0]
        c["halves"].append(ols(hn.x, hn.y) - ols(hp.x, hp.y))
    return c


def trade_cell(d):
    t = d[d["sgn"] != 0]
    u, inv, W = weights(t["week"].to_numpy())
    S = np.vstack([wsum(inv, len(u), np.ones(len(t))), wsum(inv, len(u), t["pnl_net_bp"].to_numpy())])
    est = S[1].sum() / S[0].sum()
    bsS = S @ W.T
    c = summarize(est, bsS[1] / bsS[0])
    c["n"] = int(len(t))
    c["gross_bp"] = float(t["pnl_gross_bp"].mean())
    c["cost_bp"] = float(t["cost_bp"].mean())
    c["halves"] = [float(h["pnl_net_bp"].mean()) for _, h in t.groupby(own_half(t))]
    lg, sh = t[t.sgn > 0], t[t.sgn < 0]
    c["long"] = {"n": int(len(lg)), "gross_bp": float(lg.pnl_gross_bp.mean()), "net_bp": float(lg.pnl_net_bp.mean())}
    c["short"] = {"n": int(len(sh)), "gross_bp": float(sh.pnl_gross_bp.mean()), "net_bp": float(sh.pnl_net_bp.mean())}
    c["always_long_bp"] = float(d["long_bp"].mean())
    c["hit_rate_net"] = float((t["pnl_net_bp"] > 0).mean())
    c["sharpe_net_ann"] = float(t["pnl_net_bp"].mean() / t["pnl_net_bp"].std() * np.sqrt(252))
    c["extra_ok"] = bool(c["long"]["gross_bp"] > 0 and c["short"]["gross_bp"] > 0)
    return c


def level_cells(tb, inst):
    s = tb[(tb.instrument == inst) & tb.with_day & tb.window.isin(["early", "late30", "late60only"])].copy()
    s["late"] = s.window.isin(["late30", "late60only"])
    s["real"] = s.factor == 1.0
    s["res"] = s.outcome != "open"
    s["fol"] = (s.outcome == "follow").astype(float)
    s = s[s.res]
    iso = pd.to_datetime(s["local_day"]).dt.isocalendar()
    s["week"] = (iso["year"].astype(int) * 100 + iso["week"].astype(int)).to_numpy()
    u, inv, W = weights(s["week"].to_numpy())
    cols = {}
    for key, m in (("rl", s.real & s.late), ("re", s.real & ~s.late), ("pl", ~s.real & s.late), ("pe", ~s.real & ~s.late)):
        cols[key] = np.vstack([wsum(inv, len(u), m.to_numpy() * 1.0), wsum(inv, len(u), (m * s.fol).to_numpy())])
    sh = {k: v[1].sum() / v[0].sum() if v[0].sum() > 0 else np.nan for k, v in cols.items()}
    bsh = {k: (v @ W.T)[1] / np.where((v @ W.T)[0] > 0, (v @ W.T)[0], np.nan) for k, v in cols.items()}
    L1 = summarize(sh["rl"] - sh["re"], bsh["rl"] - bsh["re"])
    L2 = summarize((sh["rl"] - sh["re"]) - (sh["pl"] - sh["pe"]),
                   (bsh["rl"] - bsh["re"]) - (bsh["pl"] - bsh["pe"]))
    n = {k: int(v[0].sum()) for k, v in cols.items()}
    for c in (L1, L2):
        c["n"] = n["rl"] + n["re"]
        c["shares"] = {k: float(v) for k, v in sh.items()}
        c["counts"] = n
    half_lab = s["local_day"] <= s["local_day"].sort_values().iloc[len(s) // 2 - 1]
    L1["halves"], L2["halves"] = [], []
    for hm in (half_lab, ~half_lab):
        h = s[hm]
        g = lambda m: h.loc[m, "fol"].mean() if m.any() else np.nan
        a = g(h.real & h.late) - g(h.real & ~h.late)
        b = g(~h.real & h.late) - g(~h.real & ~h.late)
        L1["halves"].append(float(a))
        L2["halves"].append(float(a - b))
    # descriptive: open share, late30-only, all-direction (not with-day) rates
    allr = tb[(tb.instrument == inst) & (tb.factor == 1.0) & tb.window.isin(["early", "late30", "late60only"])]
    desc = {"open_share_real": float((tb[(tb.instrument == inst) & tb.with_day & (tb.factor == 1.0)].outcome == "open").mean()),
            "late30_share_real": float(s[s.real & (s.window == "late30")].fol.mean()) if (s.real & (s.window == "late30")).any() else None,
            "late30_n_real": int((s.real & (s.window == "late30")).sum()),
            "against_day": {}}
    ag = allr[~allr.with_day & (allr.outcome != "open")]
    for w in ("early", "late"):
        m = ag.window.eq("early") if w == "early" else ag.window.isin(["late30", "late60only"])
        desc["against_day"][w] = {"n": int(m.sum()), "follow": float((ag[m].outcome == "follow").mean()) if m.any() else None}
    return L1, L2, desc


# ------------------------------------------------------------------ descriptives
def descriptives(name, d):
    out = {}
    dd = d.copy()
    out["by_year"] = {int(y): {"n": int(len(g)), "beta": ols(g.x, g.y)} for y, g in dd.groupby(dd.day.dt.year)}
    if "p_m0" in dd:
        m = dd.dropna(subset=["p_m0", "p_w60", "p_pc"])
        xm = np.log(m.p_m0 / m.p_prev) / m.sigma
        ym = np.log(m.p_w60 / m.p_m0) / m.sigma
        ypc = np.log(m.p_pc / m.p_w1) / m.sigma
        out["mirror_1430_1500"] = {"n": int(len(m)), "beta": ols(xm, ym), "hac_t": hac_t(xm.to_numpy(), ym.to_numpy())[1]}
        out["mirror_post_1600_1615"] = {"n": int(len(m)), "beta": ols(m.x, ypc), "hac_t": hac_t(m.x.to_numpy(), ypc.to_numpy())[1]}
        out["close_window_same_days"] = {"beta": ols(m.x, m.y)}
    rv = {}
    for h in (1, 2, 3):
        r = dd.dropna(subset=[f"rev{h}"])
        rv[f"next{h}"] = {"n": int(len(r)), "beta_rev_on_y": ols(r.y, r[f"rev{h}"]),
                          "hac_t": hac_t(r.y.to_numpy(), r[f"rev{h}"].to_numpy())[1]}
    out["reversal"] = rv
    # vol terciles (trailing sigma, ranked within the sample)
    q = pd.qcut(dd.sigma.rank(method="first"), 3, labels=["low", "mid", "high"])
    out["by_sigma_tercile"] = {str(k): {"n": int(len(g)), "beta": ols(g.x, g.y)} for k, g in dd.groupby(q, observed=True)}
    if "xfh" in dd:
        # Gao: first-half-hour |move| tercile (realised, known at 10:00)
        f = dd.dropna(subset=["xfh"])
        qf = pd.qcut(f.xfh.abs().rank(method="first"), 3, labels=["low", "mid", "high"])
        out["fh_by_absfh_tercile"] = {str(k): {"n": int(len(g)), "beta_fh": ols(g.xfh, g.y)} for k, g in f.groupby(qf, observed=True)}
    if "gneg" in dd:
        g = dd.dropna(subset=["gneg_d1"])
        out["gamma_d1_timing"] = {"n_neg": int((g.gneg_d1 == 1).sum()), "beta_neg": ols(g[g.gneg_d1 == 1].x, g[g.gneg_d1 == 1].y),
                                  "beta_pos": ols(g[g.gneg_d1 == 0].x, g[g.gneg_d1 == 0].y)}
        g2 = dd.dropna(subset=["gneg"])
        gsig = {}
        for arm, a in g2.groupby("gneg"):
            qa = pd.qcut(a.sigma.rank(method="first"), 3, labels=["low", "mid", "high"])
            gsig["neg" if arm == 1 else "pos"] = {str(k): {"n": int(len(b)), "beta": ols(b.x, b.y)} for k, b in a.groupby(qa, observed=True)}
        out["gamma_by_sigma_tercile"] = gsig
        out["gamma_window_full_beta"] = ols(g2.x, g2.y)
        out["gamma_arm_mean_x"] = {"neg": float(g2[g2.gneg == 1].x.mean()), "pos": float(g2[g2.gneg == 0].x.mean())}
    out["r2_pct"] = float(np.corrcoef(dd.x, dd.y)[0, 1] ** 2 * 100)
    return out


def bh(pvals, q=0.10):
    p = np.asarray(pvals)
    o = np.argsort(p)
    m = len(p)
    thr = q * (np.arange(1, m + 1)) / m
    passed = p[o] <= thr
    k = np.max(np.where(passed)[0]) + 1 if passed.any() else 0
    out = np.zeros(m, bool)
    out[o[:k]] = True
    return out


def holm(pvals, a=0.05):
    p = np.asarray(pvals)
    o = np.argsort(p)
    m = len(p)
    out = np.zeros(m, bool)
    for i, j in enumerate(o):
        if p[j] <= a / (m - i):
            out[j] = True
        else:
            break
    return out


def main():
    samples = {n: C.sample(n) for n in C.ALL}
    cells = []
    for n in C.PRIMARY:
        d = samples[n]
        cells.append({"id": f"P1_beta_{n}", "q": "close-window-momentum", "bar": BAR["beta"], **slope_cell(n, d, "beta")})
        cells.append({"id": f"P2_betaneg_{n}", "q": "close-window-momentum-gamma", "bar": BAR["beta_neg"], **slope_cell(n, d, "beta_neg")})
        cells.append({"id": f"P3_inter_{n}", "q": "close-window-momentum-gamma", "bar": BAR["inter"], **inter_cell(d)})
        cells.append({"id": f"P4_betafh_{n}", "q": "close-window-momentum", "bar": BAR["beta_fh"], **slope_cell(n, d, "beta", xcol="xfh")})
        cells.append({"id": f"P5_trade_{n}", "q": "close-window-momentum-trade", "bar": BAR["trade_idx"], **trade_cell(d)})
    for n in C.CFD:
        d = samples[n]
        cells.append({"id": f"P6_beta_{n}", "q": "cfd-replication-beta", "bar": BAR["beta"], **slope_cell(n, d, "beta")})
        cells.append({"id": f"P6_trade_{n}", "q": "close-window-momentum-trade", "bar": BAR["trade_idx"], **trade_cell(d)})
    for n in C.SECONDARY:
        d = samples[n]
        cells.append({"id": f"S1_beta_{n}", "q": "close-window-momentum-secondary", "bar": BAR["beta"], **slope_cell(n, d, "beta")})
        cells.append({"id": f"S2_trade_{n}", "q": "close-window-momentum-secondary", "bar": BAR["trade_sec"], **trade_cell(d)})
    tb = pd.read_parquet(OUT / "level_touches.parquet")
    level_desc = {}
    for inst in ("NQ", "GOLD", "EURUSD", "NQ_WALL"):
        L1, L2, desc = level_cells(tb, inst)
        cells.append({"id": f"L1_{inst}", "q": "close-window-momentum-levels", "bar": BAR["L"], **L1})
        cells.append({"id": f"L2_{inst}", "q": "close-window-momentum-levels", "bar": BAR["L"], **L2})
        level_desc[inst] = desc
    assert len(cells) == 32, len(cells)
    ps = [c["p"] if np.isfinite(c["p"]) else 1.0 for c in cells]
    bhp, hp = bh(ps), holm(ps)
    for c, b, h in zip(cells, bhp, hp):
        c["bh"], c["holm"] = bool(b), bool(h)
        c["verdict"] = verdict(c, c["bar"], c.get("extra_ok", True))
    qv = {}
    # prereg section 4: close-window-momentum = P1 + P4 futures cells; P6 beta cells are reported beside P1 only
    for q in sorted(set(c["q"] for c in cells) - {"cfd-replication-beta"}):
        vs = [c["verdict"] for c in cells if c["q"] == q]
        if "VALIDATED" in vs:
            qv[q] = "VALIDATED"
        elif "CONTEXT" in vs:
            qv[q] = "CONTEXT"
        elif all(v == "NULL" for v in vs):
            qv[q] = "NULL"
        else:
            qv[q] = "UNDERPOWERED"
    desc = {n: descriptives(n, samples[n]) for n in C.ALL}
    # descriptive only, after scoring, own generator (same study seed) so the scored draws above are unchanged:
    # the raw (unscaled, paper-comparable) slope with a week-cluster CI, and the trade without its top/bottom 1% days
    global RNG
    RNG = np.random.default_rng(C.SEED)
    for n in C.ALL:
        d = samples[n]
        est, bs = boot_beta(d, xcol="r1_raw", ycol="r2_raw")
        desc[n]["raw_beta_ci"] = summarize(est, bs)
        t = d[d.sgn != 0]
        lo_q, hi_q = t.pnl_gross_bp.quantile([0.01, 0.99])
        tt = t[(t.pnl_gross_bp > lo_q) & (t.pnl_gross_bp < hi_q)]
        desc[n]["trade_trim1pct_net_bp"] = float(tt.pnl_net_bp.mean())
        desc[n]["trade_net_by_year"] = {int(y): round(float(g.pnl_net_bp.mean()), 2) for y, g in t.groupby(t.day.dt.year)}
    res = {"id": "close-window-momentum", "ranAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "seed": C.SEED, "B": C.B, "prereg": "forge/CLOSE_WINDOW_MOMENTUM_PREREG.md", "preregCommit": "2bd383b8",
           "branch": "main", "question_verdicts": qv, "cells": cells, "descriptive": desc, "level_descriptive": level_desc}
    (OUT / "results.json").write_text(json.dumps(res, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o)))
    for c in cells:
        print(f"{c['id']:<24} n={c['n']:<5} est={c['est']:+.4f} [{c['lo']:+.4f},{c['hi']:+.4f}] t={c['t_boot']:+.2f} "
              f"p={c['p']:.4f} bh={c['bh']} halves={[round(h, 4) for h in c['halves']]} bar={c['bar']} -> {c['verdict']}")
    print(json.dumps(qv, indent=1))


if __name__ == "__main__":
    main()
