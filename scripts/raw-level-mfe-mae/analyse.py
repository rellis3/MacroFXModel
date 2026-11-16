"""Summarise raw-level-mfe-mae -> results.json + RESULTS_TABLES.md. Exploratory, not pre-registered."""
import json, os
import numpy as np
import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "analysis/output/raw-level-mfe-mae")
SEED, N_BOOT = 20261115, 1000
rng = np.random.default_rng(SEED)

T = pd.read_parquet(os.path.join(OUT, "touches.parquet"))
GA = np.load(os.path.join(OUT, "grid_real.npy"))     # n x model x dir x S x T, gross, in U
PA = np.load(os.path.join(OUT, "grid_placebo.npy"))
MODELS = ["kind", "harsh"]
meta = json.load(open(os.path.join(OUT, "meta.json")))
STOPS, TGTS = meta["stops_U"], meta["targets_U"]
T["line"] = T["fam"] + " " + T["rung"]
ORDER = [f"{f} {r}" for f in ["EXT", "HL", "OC"] for r in ["p50", "p75", "p90"]] + ["PRIOR PDH", "PRIOR PDL"]


def q(x, p):
    return round(float(np.percentile(x, p)), 3)


# A. excursion distributions (fade direction; a follow's MFE is the fade's MAE)
dist = {}
for ln in ORDER + ["ALL"]:
    d = T if ln == "ALL" else T[T.line == ln]
    dist[ln] = dict(
        n=int(len(d)),
        fade_mfe=[q(d.mfe, 50), q(d.mfe, 75), q(d.mfe, 90)], fade_mae=[q(d.mae, 50), q(d.mae, 75), q(d.mae, 90)],
        placebo_mfe=[q(d.pl_mfe, 50), q(d.pl_mfe, 75), q(d.pl_mfe, 90)],
        placebo_mae=[q(d.pl_mae, 50), q(d.pl_mae, 75), q(d.pl_mae, 90)],
        mfe_gt_mae=round(float((d.mfe > d.mae).mean() * 100), 1),
        placebo_mfe_gt_mae=round(float((d.pl_mfe > d.pl_mae).mean() * 100), 1),
        mae_before_mfe_med=q(d.mae_before_mfe, 50), mae_before_mfe_p75=q(d.mae_before_mfe, 75),
        hours_to_mfe_med=round(float(np.median(d.bars_to_mfe)) / 4, 2),
        close_med=q(d.close, 50), cost_U_med=q(d.cost_U, 50),
    )

# B. stop x target grid, date-clustered bootstrap for every cell (fade + follow) of every line group
dates = T["date"].to_numpy()
ud, inv = np.unique(dates, return_inverse=True)
nd = len(ud)
W = np.stack([np.bincount(rng.integers(0, nd, nd), minlength=nd) for _ in range(N_BOOT)]).astype(np.float32)


def boot(mask, X):
    """mean, 95% CI and two-sided p of mean(X[mask]) by date-clustered bootstrap. X: n x k."""
    Xm = X[mask]; im = inv[mask]
    s = np.zeros((nd, Xm.shape[1]), np.float64); np.add.at(s, im, Xm)
    c = np.bincount(im, minlength=nd).astype(np.float64)
    mean = s.sum(0) / c.sum()
    bm = (W @ s) / (W @ c)[:, None]
    lo, hi = np.percentile(bm, 2.5, 0), np.percentile(bm, 97.5, 0)
    cen = bm - mean
    p = np.minimum(1, 2 * np.minimum((cen >= np.abs(mean)).mean(0), (cen <= -np.abs(mean)).mean(0)) + 1 / N_BOOT)
    return mean, lo, hi, p


cells = []
k = len(STOPS) * len(TGTS)
for mi, mname in enumerate(MODELS):
  G, P = GA[:, mi], PA[:, mi]
  NET = G - T["cost_U"].to_numpy(np.float32)[:, None, None, None]
  EDGE = G - P
  for ln in ORDER + ["ALL"]:
    mask = np.ones(len(T), bool) if ln == "ALL" else (T.line == ln).to_numpy()
    for a, dname in enumerate(["fade", "follow"]):
        net = NET[:, a].reshape(len(T), k); edge = EDGE[:, a].reshape(len(T), k)
        win = (G[:, a] > 0).reshape(len(T), k).astype(np.float32)
        m_n, lo_n, hi_n, p_n = boot(mask, net)
        m_e, lo_e, hi_e, p_e = boot(mask, edge)
        wr = win[mask].mean(0)
        for c in range(k):
            si, ti = divmod(c, len(TGTS))
            cells.append(dict(model=mname, line=ln, dir=dname, stop=STOPS[si], target=TGTS[ti], n=int(mask.sum()),
                              win=round(float(wr[c]) * 100, 1),
                              net=round(float(m_n[c]), 4), net_ci=[round(float(lo_n[c]), 4), round(float(hi_n[c]), 4)],
                              net_p=float(p_n[c]), edge=round(float(m_e[c]), 4),
                              edge_ci=[round(float(lo_e[c]), 4), round(float(hi_e[c]), 4)], edge_p=float(p_e[c])))
C = pd.DataFrame(cells)


def bh(ps, qv=0.10):
    ps = np.asarray(ps); n = len(ps); o = np.argsort(ps)
    ok = ps[o] <= qv * np.arange(1, n + 1) / n
    kk = np.nonzero(ok)[0].max() + 1 if ok.any() else 0
    r = np.zeros(n, bool); r[o[:kk]] = True
    return r


# A cell counts only if it holds under BOTH stop-fill models: merge them side by side.
key = ["line", "dir", "stop", "target"]
K, H = C[C.model == "kind"].set_index(key), C[C.model == "harsh"].set_index(key)
M = K[["n", "win"]].copy()
for nm, src in (("kind", K), ("harsh", H)):
    for col in ["net", "net_ci", "net_p", "edge", "edge_ci", "edge_p"]:
        M[f"{col}_{nm}"] = src[col]
M = M.reset_index()
M["net_lo"] = np.minimum(M.net_kind, M.net_harsh)
# robust positive net: both models positive, BH on the worse p
M["net_pos_both"] = (M.net_ci_kind.str[0] > 0) & (M.net_ci_harsh.str[0] > 0)
pw = np.where((M.net_kind > 0) & (M.net_harsh > 0), np.maximum(M.net_p_kind, M.net_p_harsh), 1.0)
M["net_pos_bh"] = bh(pw) & M.net_pos_both
same = np.sign(M.edge_kind) == np.sign(M.edge_harsh)
pe = np.where(same, np.maximum(M.edge_p_kind, M.edge_p_harsh), 1.0)
M["edge_bh_both"] = bh(pe) & same

# C. per instrument, in U and in price units at the latest U
inst = {}
for i, d in T.groupby("inst"):
    ds = d.sort_values("date")
    lastU = float(ds["U"].iloc[-1]); px = float(ds["entry"].iloc[-1])
    inst[i] = dict(n=int(len(d)), U_pct=round(lastU * 100, 3), U_price=round(lastU * px, 5),
                   fade_mfe_med=q(d.mfe, 50), fade_mae_med=q(d.mae, 50), fade_mae_p75=q(d.mae, 75),
                   fade_mae_p90=q(d.mae, 90), placebo_mae_med=q(d.pl_mae, 50), placebo_mfe_med=q(d.pl_mfe, 50),
                   cost_U=q(d.cost_U, 50))

R = {"seed": SEED, "label": "exploratory, not pre-registered", "n_touches": int(len(T)), "stops_U": STOPS,
     "targets_U": TGTS, "n_cells": int(len(M)), "dist": dist, "inst": inst,
     "n_net_positive_both_models": int(M.net_pos_both.sum()), "n_net_positive_bh": int(M.net_pos_bh.sum()),
     "n_edge_bh_both_models": int(M.edge_bh_both.sum()),
     "best_net": M.sort_values("net_lo", ascending=False).head(15).to_dict("records"),
     "edge_cells": M[M.edge_bh_both].sort_values("edge_harsh").to_dict("records")}
json.dump(R, open(os.path.join(OUT, "results.json"), "w"), indent=1, default=float)
C.to_csv(os.path.join(OUT, "grid_cells.csv"), index=False)

L = ["# raw-level-mfe-mae tables (generated by analyse.py)", "",
     "Units: U = one typical day's range (trailing-250 median session high-low). Fade direction; a follow's MFE is the fade's MAE.", "",
     "## A. How far price goes after touching each line (fade direction, to 22:00 London)",
     "| line | touches | MFE p50/p75/p90 | placebo MFE p50/p75/p90 | MAE p50/p75/p90 | placebo MAE p50/p75/p90 | MFE > MAE % (placebo) | heat before best, p50/p75 | hours to best (p50) | cost (U) |",
     "|---|---|---|---|---|---|---|---|---|---|"]
f3 = lambda v: "/".join(f"{x:.2f}" for x in v)
for ln, d in dist.items():
    L.append(f"| {ln} | {d['n']} | {f3(d['fade_mfe'])} | {f3(d['placebo_mfe'])} | {f3(d['fade_mae'])} | {f3(d['placebo_mae'])} | {d['mfe_gt_mae']} ({d['placebo_mfe_gt_mae']}) | {d['mae_before_mfe_med']:.2f}/{d['mae_before_mfe_p75']:.2f} | {d['hours_to_mfe_med']} | {d['cost_U_med']:.3f} |")
L += ["", "## B. Stop x target grid: best 15 cells by the WORSE of the two stop-fill models",
      f"{len(M)} cells (11 line groups + ALL, fade and follow, 6 stops x 7 targets). Net = after one spread, U per trade; unresolved trades closed at 22:00 and kept.", "",
      "| line | dir | stop U | target U | n | win % | net kind [CI] | net harsh [CI] | edge vs placebo kind / harsh | net>0 both, BH |", "|---|---|---|---|---|---|---|---|---|---|"]
ci = lambda c: f"[{c[0]:+.3f}, {c[1]:+.3f}]"
for r in R["best_net"]:
    L.append(f"| {r['line']} | {r['dir']} | {r['stop']} | {r['target']} | {r['n']} | {r['win']} | {r['net_kind']:+.3f} {ci(r['net_ci_kind'])} | {r['net_harsh']:+.3f} {ci(r['net_ci_harsh'])} | {r['edge_kind']:+.3f} / {r['edge_harsh']:+.3f} | {'yes' if r['net_pos_bh'] else 'no'} |")
L += ["", "## B2. Pooled grid (all lines), net U per trade: kind / harsh stop fills", ""]
for dname in ["fade", "follow"]:
    sub = M[(M.line == "ALL") & (M.dir == dname)]
    L.append(f"**{dname}** (rows = stop, columns = target)"); L.append("")
    L.append("| stop \\ target | " + " | ".join(str(t) for t in TGTS) + " |"); L.append("|---" * (len(TGTS) + 1) + "|")
    for st in STOPS:
        row = sub[sub.stop == st].sort_values("target")
        L.append(f"| {st} | " + " | ".join(f"{a:+.3f} / {b:+.3f}" for a, b in zip(row.net_kind, row.net_harsh)) + " |")
    L.append("")
L += ["## B3. Line vs placebo, same trade: cells where both fill models agree on the sign and pass BH q=0.10", "",
      "| line | dir | stop | target | edge kind [CI] | edge harsh [CI] | net kind / harsh |", "|---|---|---|---|---|---|---|"]
for r in R["edge_cells"]:
    L.append(f"| {r['line']} | {r['dir']} | {r['stop']} | {r['target']} | {r['edge_kind']:+.4f} {ci(r['edge_ci_kind'])} | {r['edge_harsh']:+.4f} {ci(r['edge_ci_harsh'])} | {r['net_kind']:+.3f} / {r['net_harsh']:+.3f} |")
L += ["", "## C. Per instrument (all lines pooled)", "| inst | touches | 1 U today (% / price) | fade MFE p50 | fade MAE p50/p75/p90 | placebo MFE/MAE p50 | cost U |", "|---|---|---|---|---|---|---|"]
for i, d in inst.items():
    L.append(f"| {i} | {d['n']} | {d['U_pct']}% / {d['U_price']} | {d['fade_mfe_med']:.2f} | {d['fade_mae_med']:.2f}/{d['fade_mae_p75']:.2f}/{d['fade_mae_p90']:.2f} | {d['placebo_mfe_med']:.2f}/{d['placebo_mae_med']:.2f} | {d['cost_U']:.3f} |")
L += ["", f"Net > 0 under both fill models (CI above 0): {R['n_net_positive_both_models']} of {len(M)}; of those surviving BH q=0.10: {R['n_net_positive_bh']}. Line-vs-placebo cells agreeing in both models and passing BH: {R['n_edge_bh_both_models']}."]
open(os.path.join(OUT, "RESULTS_TABLES.md"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
