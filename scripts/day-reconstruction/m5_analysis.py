"""Day reconstruction, milestone 5, stage 2: does the approach path change continue-first vs revert-first, and by more
than at placebo lines? Prereg: forge/DAY_RECON_APPROACH_PATH_PREREG.md (committed ba39a08d before this file existed).

Joins the frozen stage-1 path measures and terciles (m5/features.parquet) to milestone 3's outcome tables, fits the
prereg's linear probability model per instrument x family group x path measure x line set x era, and bootstraps with
ONE Poisson weight per calendar date shared by every touch on that date (forecast and all placebo sets together).

    python scripts/day-reconstruction/m5_analysis.py
Env M5_DATA = checkout holding the gitignored inputs (archive/*_path.parquet, m3/*_phantom_outcomes.parquet).
"""
import json
import os
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DATA = Path(os.environ.get("M5_DATA", ROOT))
ARC_GIT = ROOT / "analysis/output/day-reconstruction/archive"
ARC_DATA = DATA / "analysis/output/day-reconstruction/archive"
M3_GIT = ROOT / "analysis/output/day-reconstruction/m3"
M3_DATA = DATA / "analysis/output/day-reconstruction/m3"
OUT = ROOT / "analysis/output/day-reconstruction/m5"

NAMES = ["GOLD", "NQ", "EURUSD"]
GROUPS = ["Fixed OH/OL", "Projected H/L"]
MEASURES = ["p1", "p2"]
ERAS = ["oos_pit", "insample_prod_params"]
SETS = (1.0, 0.70, 0.85, 1.15, 1.30)
FACT4 = (0.70, 0.85, 1.15, 1.30)
W_B2 = np.linalg.pinv(np.array([[1, f - 1, (f - 1) ** 2] for f in FACT4]))[0]
PCT = {"OH": "oh_{}_pct", "OL": "ol_{}_pct", "ProjH": "hl_{}", "ProjL": "hl_{}"}
NEXT = {"p50": "p75", "p75": "p90"}
PREV = {"p75": "p50", "p90": "p75"}
HURDLE = {"GOLD": max(2 * 0.04, 0.05), "NQ": max(2 * 0.01, 0.05), "EURUSD": max(2 * 0.07, 0.05)}
B = 2000
SEED = 20261029
PRIMARY = "cont_first"
SECONDARY = ["rev_first", "race50_cont", "open_revisit", "closeback"]
EQUIV = 5.0          # pp: NULL needs the 95% interval inside +-5pp


def load(name):
    days = pd.read_parquet(ARC_GIT / f"{name}_days.parquet")
    days["date"] = days.date.astype(str)
    feat = pd.read_parquet(OUT / "features.parquet")
    feat = feat[(feat.instrument == name) & (feat.excluded == "")].copy()
    real = pd.read_parquet(M3_GIT / f"{name}_real_outcomes.parquet")
    real["factor"] = 1.0
    ph = pd.read_parquet(M3_DATA / f"{name}_phantom_outcomes.parquet")
    o = pd.concat([real, ph], ignore_index=True)
    o = o[o.family.isin(PCT)].copy()
    o["date"] = o.date.astype(str)
    o["fkey"] = o.factor.round(2)
    feat["fkey"] = feat.factor.round(2)
    keep = ["date", "level", "fkey", "level_price", "scale", "hl_before_pct", "next_Open_min",
            "race50_cont", "race50_rev", "race50_R_cont", "race50_R_rev", "open_revisit", "closeback"] + \
           [c for c in o.columns if c.startswith("next_") and c.endswith("_min") and c != "next_Open_min"]
    m = feat.merge(o[keep], on=["date", "level", "fkey"], how="left", validate="one_to_one")
    assert m.level_price.notna().all(), "feature row without an outcome row"
    path = pd.read_parquet(ARC_DATA / f"{name}_path.parquet", columns=["date", "t", "high", "low"])
    path["date"] = path.date.astype(str)
    return days, m, {d: (g.t.to_numpy(np.int64), g.high.to_numpy(), g.low.to_numpy()) for d, g in path.groupby("date")}


def ordered_outcomes(m, days, pbd):
    d = days.set_index("date")
    nxt = np.full(len(m), np.nan)
    prv = np.full(len(m), np.nan)
    for i, r in enumerate(m.itertuples(index=False)):
        fam, rung = r.family, r.rung
        prv[i] = r.next_Open_min if rung == "p50" else getattr(r, f"next_{fam}_{PREV[rung]}_min")
        if rung in NEXT:
            nxt[i] = getattr(r, f"next_{fam}_{NEXT[rung]}_min")
        else:                                    # p90: one more rung step, first minute after the touch bar
            T, H, L = pbd[r.date]
            day = d.loc[r.date]
            step = (day[PCT[fam].format("p90")] - day[PCT[fam].format("p75")]) * r.factor / 100 * r.level_price
            k = int(r.k)
            s = 1 if r.side == "up" else -1
            hit = np.flatnonzero(H[k + 1:] >= r.level_price + step) if s > 0 else np.flatnonzero(L[k + 1:] <= r.level_price - step)
            if len(hit):
                j = k + 1 + int(hit[0])
                nxt[i] = round((T[j] - T[0]) / 60) - round((T[k] - T[0]) / 60)
    n_ok, p_ok = np.isfinite(nxt), np.isfinite(prv)
    m["cont_first"] = (n_ok & (~p_ok | (nxt < np.where(p_ok, prv, np.inf)))).astype(float)
    m["rev_first"] = (p_ok & (~n_ok | (prv < np.where(n_ok, nxt, np.inf)))).astype(float)
    m["u"] = m.hl_before_pct / m.date.map(d.hl_p50)
    return m


def design(g, m):
    """rung x hour fixed effects + u + u^2 + top + middle; rows outside a tercile are already excluded."""
    fe = pd.get_dummies(g.rung + "|" + g.hour_bucket).astype(float)
    X = np.column_stack([fe.to_numpy(), g.u.to_numpy(), g.u.to_numpy() ** 2,
                         (g[f"{m}_tercile"] == "top").to_numpy(float), (g[f"{m}_tercile"] == "middle").to_numpy(float)])
    return X, X.shape[1] - 2                  # column index of the top-tercile coefficient


def fit(X, Y, Wd, pos):
    """Point estimate and bootstrap draws of the coefficient vector for each outcome column in Y.
    Wd: [B, n_dates] Poisson weights; pos: date index of each row. Returns beta_pt [p, k], beta_b [B, p, k]."""
    Z = (X[:, :, None] * X[:, None, :]).reshape(len(X), -1)
    w = Wd[:, pos]
    xtwx = (w @ Z).reshape(len(Wd), X.shape[1], X.shape[1])
    xtwy = np.einsum("bn,np,nk->bpk", w, X, Y, optimize=True)
    beta_b = np.einsum("bpq,bqk->bpk", np.linalg.pinv(xtwx), xtwy)
    beta_pt = np.linalg.pinv(X.T @ X) @ (X.T @ Y)
    return beta_pt, beta_b


def summarise(pt, draws):
    lo, hi = np.nanpercentile(draws, [2.5, 97.5])
    p = 2 * min(np.mean(draws <= 0), np.mean(draws >= 0))
    return {"est_pp": 100 * pt, "ci_pp": [100 * lo, 100 * hi], "p": min(1.0, p)}


def bh(ps, q=0.10):
    ps = np.asarray(ps, float)
    o = np.argsort(ps)
    thr = q * (np.arange(1, len(ps) + 1)) / len(ps)
    ok = ps[o] <= thr
    k = np.max(np.flatnonzero(ok)) + 1 if ok.any() else 0
    res = np.zeros(len(ps), bool)
    res[o[:k]] = True
    return res


def cell_effects(frame, measure, outcomes, Wd, date_index, fe_extra=None):
    """D per line set, D_pl (B2) and Delta, for each outcome. frame holds all five line sets for one cell."""
    pts, drs = {}, {}
    for f in SETS:
        g = frame[np.isclose(frame.factor, f) & (frame[f"{measure}_tercile"] != "")]
        if fe_extra is not None:
            g = g.assign(hour_bucket=g.hour_bucket + "|" + g[fe_extra])
        X, j = design(g, measure)
        Y = g[outcomes].to_numpy(float)
        bp, bb = fit(X, Y, Wd, g.date.map(date_index).to_numpy())
        pts[f], drs[f] = bp[j], bb[:, j]                      # [k], [B, k]
    out = {}
    for c, oc in enumerate(outcomes):
        pl_pt = sum(w * pts[f][c] for w, f in zip(W_B2, FACT4))
        pl_dr = sum(w * drs[f][:, c] for w, f in zip(W_B2, FACT4))
        out[oc] = {"D_fc": summarise(pts[1.0][c], drs[1.0][:, c]),
                   "D_pl": summarise(pl_pt, pl_dr),
                   "Delta": summarise(pts[1.0][c] - pl_pt, drs[1.0][:, c] - pl_dr),
                   "D_by_set_pp": {str(f): 100 * pts[f][c] for f in SETS}}
    return out


def classify(eff, eff_rep, bh_ok):
    est, (lo, hi) = eff["est_pp"], eff["ci_pp"]
    if bh_ok and abs(est) >= EQUIV and eff_rep is not None and np.sign(eff_rep["est_pp"]) == np.sign(est):
        return "SIGNIFICANT"
    if lo > -EQUIV and hi < EQUIV:
        return "NULL"
    return "UNDERPOWERED"


def hurdle(frame, measure, name, Wd, date_index):
    """Gross race50 R by tercile and side, forecast vs B2 placebo (raw means, paired by date)."""
    res = {}
    for terc in ("top", "bottom"):
        for side in ("cont", "rev"):
            col = f"race50_R_{side}"
            pt, dr = {}, {}
            for f in SETS:
                g = frame[np.isclose(frame.factor, f) & (frame[f"{measure}_tercile"] == terc)]
                pos = g.date.map(date_index).to_numpy()
                v = g[col].to_numpy(float)
                s = Wd[:, pos] @ v
                n = Wd[:, pos].sum(1)
                pt[f], dr[f] = v.mean(), s / np.maximum(n, 1e-9)
            pl_pt = sum(w * pt[f] for w, f in zip(W_B2, FACT4))
            pl_dr = sum(w * dr[f] for w, f in zip(W_B2, FACT4))
            lo, hi = np.percentile(dr[1.0] - pl_dr, [2.5, 97.5])
            res[f"{terc}_{side}"] = {"gross_R_fc": pt[1.0], "gross_R_pl": pl_pt, "diff_ci": [lo, hi],
                                     "meets_cost_hurdle": bool(pt[1.0] >= HURDLE[name]), "beats_placebo": bool(lo > 0)}
    return res


def main():
    frames = {}
    for name in NAMES:
        days, m, pbd = load(name)
        frames[name] = ordered_outcomes(m, days, pbd)
        print(name, len(frames[name]), flush=True)
    allf = pd.concat(frames.values(), ignore_index=True)
    dates = sorted(allf.date.unique())
    date_index = {d: i for i, d in enumerate(dates)}
    Wd = np.random.default_rng(SEED).poisson(1.0, (B, len(dates))).astype(float)
    outs = [PRIMARY] + SECONDARY
    R = {"meta": {"B": B, "seed": SEED, "W_B2": list(W_B2), "hurdle_R": HURDLE, "n_dates": len(dates)}}
    cells = {}
    for era in ERAS:
        for name in NAMES:
            for grp in GROUPS:
                fr = frames[name][(frames[name].era == era) & (frames[name].group == grp)]
                for ms in MEASURES:
                    key = f"{era}|{name}|{grp}|{ms}"
                    cells[key] = cell_effects(fr, ms, outs, Wd, date_index)
                    real = fr[np.isclose(fr.factor, 1.0)]
                    cells[key]["_n"] = {"touches_fc": int(len(real)), "days": int(real.date.nunique()),
                                        "terciles_fc": real[f"{ms}_tercile"].value_counts().to_dict(),
                                        "touches_by_set": {str(f): int(np.isclose(fr.factor, f).sum()) for f in SETS},
                                        "rate_fc_by_tercile": real.groupby(f"{ms}_tercile")[PRIMARY].mean().round(4).to_dict()}
                    if era == "oos_pit":
                        cells[key]["_hurdle"] = hurdle(fr, ms, name, Wd, date_index)
                print(era, name, grp, "done", flush=True)
    R["cells"] = cells
    # primary classification (oos), replication sign from the 2016-20 era
    keys = [f"{n}|{g}|{m}" for n in NAMES for g in GROUPS for m in MEASURES]
    verdicts = {}
    for q in ("Delta", "D_fc"):
        for oc in outs:
            ps = [cells[f"oos_pit|{k}"][oc][q]["p"] for k in keys]
            ok = bh(ps)
            for k, b_ok in zip(keys, ok):
                e, rep = cells[f"oos_pit|{k}"][oc][q], cells[f"insample_prod_params|{k}"][oc][q]
                verdicts.setdefault(oc, {}).setdefault(k, {})[q] = {"bh": bool(b_ok), "class": classify(e, rep, b_ok)}
    R["verdicts"] = verdicts
    # sensitivities on the primary outcome (oos): tagged days only, by side, by rung, by year
    sens = {}
    for name in NAMES:
        for grp in GROUPS:
            fr = frames[name][(frames[name].era == "oos_pit") & (frames[name].group == grp)]
            for ms in MEASURES:
                k = f"{name}|{grp}|{ms}"
                sens[f"{k}|tagged_only"] = cell_effects(fr[fr.tag_status == "ff"], ms, [PRIMARY], Wd, date_index)[PRIMARY]
                for side in ("up", "dn"):
                    sens[f"{k}|side_{side}"] = cell_effects(fr[fr.side == side], ms, [PRIMARY], Wd, date_index)[PRIMARY]
                for rung in ("p50", "p75", "p90"):
                    sens[f"{k}|rung_{rung}"] = cell_effects(fr[fr.rung == rung], ms, [PRIMARY], Wd, date_index)[PRIMARY]
                for yr, fy in fr.groupby(fr.date.str[:4]):
                    if (np.isclose(fy.factor, 1.0)).sum() >= 150:
                        sens[f"{k}|year_{yr}"] = cell_effects(fy, ms, [PRIMARY], Wd, date_index)[PRIMARY]
    R["sensitivity"] = sens
    # pooled across instruments (secondary): instrument x rung x hour fixed effects, shared date weights
    pooled = {}
    for era in ERAS:
        for grp in GROUPS:
            fr = allf[(allf.era == era) & (allf.group == grp)].copy()
            fr["rung"] = fr.instrument + "|" + fr.rung
            for ms in MEASURES:
                pooled[f"{era}|{grp}|{ms}"] = cell_effects(fr, ms, outs, Wd, date_index)
    R["pooled"] = pooled
    (OUT / "results.json").write_text(json.dumps(clean(R), indent=1))
    print_summary(R, keys)


def clean(o):
    if isinstance(o, dict):
        return {str(k): clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple, np.ndarray)):
        return [clean(v) for v in o]
    if isinstance(o, (np.floating, float)):
        return None if not np.isfinite(o) else round(float(o), 5)
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, np.bool_):
        return bool(o)
    return o


def print_summary(R, keys):
    for k in keys:
        c, r = R["cells"][f"oos_pit|{k}"][PRIMARY], R["cells"][f"insample_prod_params|{k}"][PRIMARY]
        v = R["verdicts"][PRIMARY][k]
        f = lambda e: f"{e['est_pp']:+6.1f} [{e['ci_pp'][0]:+5.1f},{e['ci_pp'][1]:+5.1f}] p{e['p']:.3f}"
        print(f"{k:32} Dfc {f(c['D_fc'])} {v['D_fc']['class']:12} | Dpl {f(c['D_pl'])} | Delta {f(c['Delta'])} "
              f"{v['Delta']['class']:12} | rep Dfc {r['D_fc']['est_pp']:+5.1f} Delta {r['Delta']['est_pp']:+5.1f}")


if __name__ == "__main__":
    main()
