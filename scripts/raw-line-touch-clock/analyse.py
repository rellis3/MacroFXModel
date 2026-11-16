"""raw-line-touch-clock analysis, exactly as forge/RAW_LINE_TOUCH_CLOCK_PREREG.md §4-§6. -> results.json, RESULTS_TABLES.md"""
import json, os
import numpy as np
import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "analysis/output/raw-line-touch-clock")
SEED, NB = 20261116, 1000
rng = np.random.default_rng(SEED)
T = pd.read_parquet(os.path.join(OUT, "touches.parquet"))
LINES = [f"{f} p{q}" for f in ["EXT", "HL", "OC"] for q in [50, 75, 90]] + ["PRIOR PDH", "PRIOR PDL"]
BLOCKS = list(range(0, 22, 2))
for m in ["kind", "harsh"]:
    for d in ["fade", "follow"]:
        T[f"net_{d}_{m}"] = T[f"{d}_{m}"] - T["cost_U"]
        T[f"edge_{d}_{m}"] = T[f"{d}_{m}"] - T[f"pl_{d}_{m}"]
        T[f"win_{d}_{m}"] = (T[f"{d}_{m}"] > 0).astype(float)


def boot(df, cols):
    """date-clustered bootstrap: mean, lo, hi, two-sided p for each column."""
    ud, inv = np.unique(df["date"].to_numpy(), return_inverse=True); nd = len(ud)
    X = df[cols].to_numpy(float)
    s = np.zeros((nd, len(cols))); np.add.at(s, inv, X); c = np.bincount(inv, minlength=nd).astype(float)
    mean = s.sum(0) / c.sum()
    W = np.stack([np.bincount(rng.integers(0, nd, nd), minlength=nd) for _ in range(NB)]).astype(float)
    bm = (W @ s) / (W @ c)[:, None]; cen = bm - mean
    p = np.minimum(1, 2 * np.minimum((cen >= np.abs(mean)).mean(0), (cen <= -np.abs(mean)).mean(0)) + 1 / NB)
    return {col: dict(mean=float(mean[k]), lo=float(np.percentile(bm[:, k], 2.5)), hi=float(np.percentile(bm[:, k], 97.5)),
                      p=float(p[k])) for k, col in enumerate(cols)}


def bh(ps, q=0.10):
    ps = np.asarray(ps, float); n = len(ps); o = np.argsort(ps)
    ok = ps[o] <= q * np.arange(1, n + 1) / n
    k = np.nonzero(ok)[0].max() + 1 if ok.any() else 0
    r = np.zeros(n, bool); r[o[:k]] = True
    return r


pct = lambda x: (np.exp(x) - 1) * 100
R = {"seed": SEED, "n": {p: int((T.period == p).sum()) for p in ["discovery", "confirm"]}}

# ---------- H1 ----------
h1 = {}
for period in ["discovery", "confirm"]:
    D = T[T.period == period]
    prim = boot(D[D.line.isin(["EXT p75", "EXT p90"])], ["h1_effect"])["h1_effect"]
    h1[period] = {"primary": dict(n=int(D.line.isin(["EXT p75", "EXT p90"]).sum()), **prim,
                                  pct=pct(prim["mean"]), pct_lo=pct(prim["lo"]), pct_hi=pct(prim["hi"]))}
    sec = {}
    for ln in LINES:
        b = boot(D[D.line == ln], ["h1_effect"])["h1_effect"]
        sec[ln] = dict(n=int((D.line == ln).sum()), **b, pct=pct(b["mean"]), pct_lo=pct(b["lo"]), pct_hi=pct(b["hi"]))
    flags = bh([sec[l]["p"] for l in LINES])
    for l, f in zip(LINES, flags):
        sec[l]["bh"] = bool(f)
    h1[period]["lines"] = sec
    # by hour block, primary cell (descriptive)
    h1[period]["by_block"] = {b: dict(n=int(len(g)), pct=pct(g.h1_effect.mean()))
                              for b, g in D[D.line.isin(["EXT p75", "EXT p90"])].groupby("block")}
pd_, pc_ = h1["discovery"]["primary"], h1["confirm"]["primary"]
if pd_["pct"] >= 5 and pd_["lo"] > 0 and pc_["pct"] >= 5 and pc_["lo"] > 0:
    v1 = "VALIDATED"
elif pd_["pct"] <= -5 and pd_["hi"] < 0 and pc_["pct"] <= -5 and pc_["hi"] < 0:
    v1 = "CONTEXT"  # mirror
else:
    v1 = "NULL"
h1["verdict"] = v1
R["H1"] = h1

# ---------- H2 ----------
D = T[T.period == "discovery"]
cells = []
for ln in LINES:
    for b in BLOCKS:
        g = D[(D.line == ln) & (D.block == b)]
        if not len(g):
            continue
        cols = [f"{k}_{d}_{m}" for k in ["net", "edge"] for d in ["fade", "follow"] for m in ["kind", "harsh"]]
        bb = boot(g, cols) if len(g) >= 30 else None
        for d in ["fade", "follow"]:
            row = dict(line=ln, block=b, dir=d, n=int(len(g)), eligible=len(g) >= 200,
                       win_kind=float(g[f"win_{d}_kind"].mean() * 100),
                       mfe_med=float(g.mfe.median() if d == "fade" else g.mae.median()),
                       mae_med=float(g.mae.median() if d == "fade" else g.mfe.median()),
                       pl_mfe_med=float(g.pl_mfe.median() if d == "fade" else g.pl_mae.median()),
                       pl_mae_med=float(g.pl_mae.median() if d == "fade" else g.pl_mfe.median()))
            for m in ["kind", "harsh"]:
                for k in ["net", "edge"]:
                    x = bb[f"{k}_{d}_{m}"] if bb else dict(mean=np.nan, lo=np.nan, hi=np.nan, p=1.0)
                    row[f"{k}_{m}"] = x["mean"]; row[f"{k}_{m}_ci"] = [x["lo"], x["hi"]]; row[f"{k}_{m}_p"] = x["p"]
            cells.append(row)
C = pd.DataFrame(cells)
E = C[C.eligible].copy()
for m in ["kind", "harsh"]:
    E[f"bh_{m}"] = bh(E[f"edge_{m}_p"].to_numpy())
E["cand"] = E.bh_kind & E.bh_harsh & (E.net_kind > 0) & (E.net_harsh > 0)
E["same_sign_bh"] = E.bh_kind & E.bh_harsh & (np.sign(E.edge_kind) == np.sign(E.edge_harsh))
# confirm check for candidates: block x family, NQ+EURUSD pooled, harsh edge CI excludes 0 with the same sign
Cf = T[T.period == "confirm"].copy(); Cf["fam"] = Cf.line.str.split().str[0]
conf = []
for _, r in E[E.cand].iterrows():
    g = Cf[(Cf.fam == r.line.split()[0]) & (Cf.block == r.block)]
    b = boot(g, [f"edge_{r.dir}_harsh"])[f"edge_{r.dir}_harsh"] if len(g) >= 30 else None
    ok = bool(b and np.sign(b["mean"]) == np.sign(r.edge_harsh) and (b["lo"] > 0 or b["hi"] < 0))
    conf.append(dict(line=r.line, block=int(r.block), dir=r.dir, confirm_n=int(len(g)), confirm=b, holds=ok))
v2 = "VALIDATED" if any(c["holds"] for c in conf) else ("CONTEXT" if len(conf) else "NULL")
R["H2"] = dict(verdict=v2, n_cells=int(len(C)), n_eligible=int(len(E)), n_bh_kind=int(E.bh_kind.sum()),
               n_bh_harsh=int(E.bh_harsh.sum()), n_same_sign_both=int(E.same_sign_bh.sum()),
               n_candidates=int(E.cand.sum()), confirm=conf,
               same_sign_cells=E[E.same_sign_bh].sort_values("edge_harsh").to_dict("records"))
C.to_csv(os.path.join(OUT, "h2_cells.csv"), index=False)

# ---------- H2b descriptive by block (all lines pooled, and EXT p75+p90) ----------
desc = {}
for name, sub in [("all lines", D), ("EXT p75+p90", D[D.line.isin(["EXT p75", "EXT p90"])])]:
    rows = {}
    for b, g in sub.groupby("block"):
        rows[int(b)] = dict(n=int(len(g)), mfe_med=float(g.mfe.median()), mae_med=float(g.mae.median()),
                            mfe_p75=float(g.mfe.quantile(.75)), mae_p75=float(g.mae.quantile(.75)),
                            pl_mfe_med=float(g.pl_mfe.median()), pl_mae_med=float(g.pl_mae.median()),
                            fade_win=float(g.win_fade_kind.mean() * 100), follow_win=float(g.win_follow_kind.mean() * 100),
                            fade_net_harsh=float(g.net_fade_harsh.mean()), follow_net_harsh=float(g.net_follow_harsh.mean()),
                            fade_edge_harsh=float(g.edge_fade_harsh.mean()), follow_edge_harsh=float(g.edge_follow_harsh.mean()),
                            neither=float(((g.fade_kind.abs() < 0.2) & (g.follow_kind.abs() < 0.2)).mean() * 100))
    desc[name] = rows
R["H2b"] = desc
json.dump(R, open(os.path.join(OUT, "results.json"), "w"), indent=1, default=float)

# ---------- tables ----------
L = ["# raw-line-touch-clock tables (generated by analyse.py)", "", "## H1: rest-of-day range after a touch vs moments with the same clock hour and range used", "",
     f"**Verdict H1: {v1}**", "", "| period | cell | touches | line effect on remaining range [95% CI] | BH |", "|---|---|---|---|---|"]
for period in ["discovery", "confirm"]:
    p = h1[period]["primary"]
    L.append(f"| {period} | **EXT p75+p90 (primary)** | {p['n']} | {p['pct']:+.1f}% [{p['pct_lo']:+.1f}, {p['pct_hi']:+.1f}] | — |")
    for ln in LINES:
        s = h1[period]["lines"][ln]
        L.append(f"| {period} | {ln} | {s['n']} | {s['pct']:+.1f}% [{s['pct_lo']:+.1f}, {s['pct_hi']:+.1f}] | {'yes' if s['bh'] else 'no'} |")
L += ["", "Primary cell by 2-hour block (descriptive): " + ", ".join(
    f"{b:02d}h {v['pct']:+.1f}% (n {v['n']})" for b, v in h1["discovery"]["by_block"].items()), ""]
L += ["## H2: does the hour of the touch decide fade vs follow? (1:1, 0.2 U stop and target)", "",
      f"**Verdict H2: {v2}.** {R['H2']['n_cells']} line x block x direction cells, {R['H2']['n_eligible']} with n >= 200. "
      f"Edge vs placebo passing BH: kind {R['H2']['n_bh_kind']}, harsh {R['H2']['n_bh_harsh']}, both with the same sign {R['H2']['n_same_sign_both']}; "
      f"candidates (both pass and net > 0 in both) {R['H2']['n_candidates']}.", ""]
if R["H2"]["same_sign_cells"]:
    L += ["Cells passing BH in both fill models (same sign):", "", "| line | block | dir | n | win % | edge vs placebo kind / harsh U | net kind / harsh U |", "|---|---|---|---|---|---|---|"]
    for r in R["H2"]["same_sign_cells"]:
        L.append(f"| {r['line']} | {r['block']:02d}-{r['block']+1:02d} | {r['dir']} | {r['n']} | {r['win_kind']:.1f} | {r['edge_kind']:+.3f} / {r['edge_harsh']:+.3f} | {r['net_kind']:+.3f} / {r['net_harsh']:+.3f} |")
    L.append("")
for c in conf:
    L.append(f"- confirm {c['line']} {c['block']:02d}h {c['dir']}: n {c['confirm_n']}, holds = {c['holds']}")
L += ["", "## H2b: by hour of touch, all lines pooled (discovery, U units)", "",
      "| London block | touches | MFE p50 / p75 | MAE p50 / p75 | placebo MFE / MAE p50 | fade wins % | follow wins % | neither % | fade net (harsh) | follow net (harsh) | fade edge vs placebo (harsh) |",
      "|---|---|---|---|---|---|---|---|---|---|---|"]
for b, v in desc["all lines"].items():
    L.append(f"| {b:02d}-{b+1:02d} | {v['n']} | {v['mfe_med']:.2f} / {v['mfe_p75']:.2f} | {v['mae_med']:.2f} / {v['mae_p75']:.2f} | {v['pl_mfe_med']:.2f} / {v['pl_mae_med']:.2f} | {v['fade_win']:.1f} | {v['follow_win']:.1f} | {v['neither']:.1f} | {v['fade_net_harsh']:+.3f} | {v['follow_net_harsh']:+.3f} | {v['fade_edge_harsh']:+.3f} |")
for title, col in [("fade win % (bracket closed positive, kind fills)", "win_kind"),
                   ("fade edge vs placebo, harsh fills, in hundredths of U (+ = fading beat a random point)", "edge_harsh")]:
    L += ["", f"## H2 grid: {title}, discovery, line x London block", "",
          "| line | " + " | ".join(f"{b:02d}" for b in BLOCKS) + " |", "|---" * (len(BLOCKS) + 1) + "|"]
    for ln in LINES:
        row = []
        for b in BLOCKS:
            r = C[(C.line == ln) & (C.block == b) & (C.dir == "fade")]
            if not len(r):
                row.append(""); continue
            v = r[col].iloc[0] * (1 if col == "win_kind" else 100)
            row.append(f"{v:.0f}" if col == "win_kind" else f"{v:+.1f}")
            row[-1] += "" if r.n.iloc[0] >= 200 else "·"
        L.append(f"| {ln} | " + " | ".join(row) + " |")
L += ["", "(· = fewer than 200 touches, not in the BH family.) Follow is the mirror: its edge is about minus the fade's."]
open(os.path.join(OUT, "RESULTS_TABLES.md"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
