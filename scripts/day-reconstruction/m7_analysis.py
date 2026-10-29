"""Day reconstruction, milestone 7: post-touch path book at the forecast levels.

Prereg: forge/DAY_RECON_PATH_BOOK_PREREG.md (frozen 2291306d, with the features-only stage 1 it names) under
forge/DAY_RECON_PATH_BOOK_DECISION_RULES.md (frozen d7ce9e06). This file was committed before the run.

Order of work (prereg §6): every build-time check runs before any share or EV is computed, and a failed check stops the
run (SystemExit) with the failure written to m7/build_checks.json.
  0. regeneration of M3's phantom touch files (byte-identical, 0 misaligned days) -- read from M7_REGEN
  1. stage-1 reproduction (eligibility and race distances recomputed from the path and day rows)
  2. category assertion
  3a forecast fixed vs archive next_*_min; 3b phantom fixed vs M3 next_*_min; 3c primary vs independent reconstruction
  4. tie-mismatch diagnostic (uncast prices), reported only
  5. EV decomposition identity

    python scripts/day-reconstruction/m7_analysis.py
Env M7_DATA = checkout holding gitignored inputs (archive/*_path.parquet, m3/*_phantom_outcomes.parquet);
    M7_REGEN = folder holding the regenerated phantom files and their logs (m3/*.jsonl, ph_*.log, ph2_*.log).
"""
import hashlib
import json
import os
import time
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DATA = Path(os.environ.get("M7_DATA", ROOT))
REGEN = Path(os.environ["M7_REGEN"]) if os.environ.get("M7_REGEN") else None
ARC_GIT = ROOT / "analysis/output/day-reconstruction/archive"
ARC_DATA = DATA / "analysis/output/day-reconstruction/archive"
M3_DATA = DATA / "analysis/output/day-reconstruction/m3"
OUT = ROOT / "analysis/output/day-reconstruction/m7"

NAMES = ["GOLD", "NQ", "EURUSD"]
FACT4 = (0.70, 0.85, 1.15, 1.30)
SETS = (1.0,) + FACT4
W_B2 = np.linalg.pinv(np.array([[1, f - 1, (f - 1) ** 2] for f in FACT4]))[0]
B = 2000
SEED = 20261030
SPREAD = {"GOLD": 0.020, "NQ": 0.005, "EURUSD": 0.035}       # c, sigma units (R3, frozen)
CATS = {"p50": ["1", "2", "3", "4b", "5a", "5b"], "p75": ["1", "2", "3", "4a", "4b", "5a", "5b"]}
WINDOWS = ["00:00-08:00", "08:00-13:30", "13:30-17:00", "17:00-22:00"]
REGEN_HASH = {"EURUSD_phantom_touches.jsonl": "9a0c188ebb46737d", "EURUSD_phantom_touches_f0.7,1.3.jsonl": "6716c6aa94b3f2b1",
              "GOLD_phantom_touches.jsonl": "19852e06fe7c251e", "GOLD_phantom_touches_f0.7,1.3.jsonl": "022cc63e3e24d18c",
              "NQ_phantom_touches.jsonl": "7dea829cee43672f", "NQ_phantom_touches_f0.7,1.3.jsonl": "0a4e8a607e0ccc6b"}
CHECKS = {}


def stop(name, detail):
    CHECKS[name] = {"pass": False, **detail}
    (OUT / "build_checks.json").write_text(json.dumps(CHECKS, indent=1, default=str))
    raise SystemExit(f"BUILD CHECK FAILED: {name}: {json.dumps(detail, default=str)[:2000]}")


# ── check 0: regeneration of the M3 phantom files ──────────────────────────────────────────────────────────────────
def check_regen():
    if REGEN is None:
        stop("0_regeneration", {"reason": "M7_REGEN not set"})
    got, mis = {}, {}
    for fn, want in REGEN_HASH.items():
        p = REGEN / "analysis/output/day-reconstruction/m3" / fn
        got[fn] = hashlib.sha256(p.read_bytes()).hexdigest()[:16] if p.exists() else None
    for lg in sorted(REGEN.glob("ph*_*.log")):
        for line in lg.read_text().splitlines():
            if line.startswith("{"):
                mis[lg.name] = json.loads(line)["misaligned_days"]
    ok = all(got[f] == REGEN_HASH[f] for f in REGEN_HASH) and len(mis) == 6 and all(v == 0 for v in mis.values())
    if not ok:
        stop("0_regeneration", {"hashes": got, "expected": REGEN_HASH, "misaligned_days": mis})
    CHECKS["0_regeneration"] = {"pass": True, "hashes": got, "misaligned_days": mis}


# ── data ───────────────────────────────────────────────────────────────────────────────────────────────────────────
def load(name):
    f = pd.read_parquet(OUT / "features.parquet")
    f = f[(f.instrument == name) & f.elig_share].copy().reset_index(drop=True)
    days = pd.read_parquet(ARC_GIT / f"{name}_days.parquet")
    days["date"] = days.date.astype(str)
    d = days.set_index("date")
    f["open"] = f.date.map(d.open)
    f["scale"] = f.date.map(d.scale)
    path = pd.read_parquet(ARC_DATA / f"{name}_path.parquet", columns=["date", "t", "open", "high", "low", "close"])
    path["date"] = path.date.astype(str)
    pbd = {}
    for dt, g in path.groupby("date"):
        raw = (g.high.to_numpy(), g.low.to_numpy())
        cast = [g[c].to_numpy().astype(np.float32).astype(np.float64) for c in ("open", "high", "low", "close")]
        pbd[dt] = (g.t.to_numpy(np.int64), *cast, *raw)
    return f, days, pbd


def first_primary(x, thr, ge):
    hit = np.flatnonzero(x >= thr) if ge else np.flatnonzero(x <= thr)
    return int(hit[0]) if len(hit) else -1


def first_independent(x, thr, ge):
    """Different algorithm: binary search on the running extreme."""
    if ge:
        run = np.maximum.accumulate(x)
        i = int(np.searchsorted(run, thr, side="left"))
    else:
        run = -np.minimum.accumulate(x)
        i = int(np.searchsorted(run, -thr, side="left"))
    return i if i < len(x) else -1


def outcomes(f, pbd):
    n = len(f)
    cols = {c: np.full(n, np.nan) for c in (
        "jN", "jP", "jO", "jN2", "jP2", "jO2", "jNu", "jPu", "jOu", "tN", "tP", "tO", "E_chk",
        "minz_pre", "maxz_pre", "maxz_sess", "minz_sess", "zc", "gap_sig")}
    cat = np.empty(n, dtype=object)
    first = np.empty(n, dtype=object)
    gap = np.zeros(n, bool)
    for i, r in enumerate(f[["date", "k", "s", "E", "N", "P", "open", "scale", "rung"]].itertuples(index=False)):
        T, Op, H, L, C, Hu, Lu = pbd[r.date]
        k, s, E, N, P, Oo, sc = int(r.k), int(r.s), r.E, r.N, r.P, r.open, r.scale
        cols["E_chk"][i] = C[k]
        h, lo, op = H[k + 1:], L[k + 1:], Op[k + 1:]
        cont, fade = (h, lo) if s > 0 else (lo, h)          # extreme in the continuation / fade direction
        jN = first_primary(cont, N, s > 0)
        jP = first_primary(fade, P, s < 0)
        jO = first_primary(fade, Oo, s < 0)
        cols["jN2"][i], cols["jP2"][i], cols["jO2"][i] = (first_independent(cont, N, s > 0), first_independent(fade, P, s < 0),
                                                          first_independent(fade, Oo, s < 0))
        hu, lu = Hu[k + 1:], Lu[k + 1:]
        cu, fu = (hu, lu) if s > 0 else (lu, hu)
        cols["jNu"][i], cols["jPu"][i], cols["jOu"][i] = (first_primary(cu, N, s > 0), first_primary(fu, P, s < 0),
                                                          first_primary(fu, Oo, s < 0))
        mins = lambda j: round((T[k + 1 + j] - T[0]) / 60) - round((T[k] - T[0]) / 60)
        cols["jN"][i], cols["jP"][i], cols["jO"][i] = jN, jP, jO
        cols["tN"][i] = mins(jN) if jN >= 0 else np.nan
        cols["tP"][i] = mins(jP) if jP >= 0 else np.nan
        cols["tO"][i] = mins(jO) if jO >= 0 else np.nan
        zmax = s * (cont - E) / sc            # oriented: the continuation-side extreme gives max z
        zmin = s * (fade - E) / sc            # the fade-side extreme gives min z
        cols["maxz_sess"][i] = max(0.0, zmax.max()) if len(zmax) else 0.0
        cols["minz_sess"][i] = min(0.0, zmin.min()) if len(zmin) else 0.0
        cols["zc"][i] = s * (C[-1] - E) / sc
        nN = jN if jN >= 0 else np.inf
        nP = jP if jP >= 0 else np.inf
        if nN < nP:
            first[i], jd = "N", jN
        elif nP < nN:
            first[i], jd = "P", jP
        elif np.isfinite(nN):
            first[i], jd = "U", jN
        else:
            first[i], jd = "none", len(cont)
        pre_max = zmax[:jd].max() if jd > 0 else 0.0
        pre_min = zmin[:jd].min() if jd > 0 else 0.0
        cols["maxz_pre"][i], cols["minz_pre"][i] = max(0.0, pre_max), min(0.0, pre_min)
        if first[i] == "N":
            cat[i] = "1" if cols["minz_pre"][i] > -0.25 else "2"
            if s * (op[jN] - N) >= 0:
                gap[i], cols["gap_sig"][i] = True, abs(op[jN] - N) / sc
        elif first[i] == "P":
            cat[i] = "3" if jN >= 0 else ("4b" if (r.rung == "p50" or jO >= 0) else "4a")
            if s * (op[jP] - P) <= 0:
                gap[i], cols["gap_sig"][i] = True, abs(op[jP] - P) / sc
        elif first[i] == "U":
            cat[i] = "U"
            if s * (op[jN] - N) >= 0 or s * (op[jN] - P) <= 0:
                gap[i] = True
                cols["gap_sig"][i] = max(s * (op[jN] - N), -s * (op[jN] - P), 0) / sc
        else:
            cat[i] = "5a" if (cols["maxz_pre"][i] < 0.25 and cols["minz_pre"][i] > -0.25) else "5b"
    out = f.copy()
    for c, v in cols.items():
        out[c] = v
    out["cat"], out["first"], out["gap"] = cat, first, gap
    a, b = out.a.to_numpy(), out.b.to_numpy()
    # payoffs (R3); NaN where not EV-eligible
    fadep = np.select([out["first"] == "P", out["first"] == "N", out["first"] == "U"], [b / a, -1.0, -1.0], -out.zc / a)
    contp = np.select([out["first"] == "N", out["first"] == "P", out["first"] == "U"], [a / b, -1.0, -1.0], out.zc / b)
    ev = out.elig_ev.to_numpy()
    out["pay_F"] = np.where(ev, fadep, np.nan)
    out["pay_C"] = np.where(ev, contp, np.nan)
    c = out.instrument.map(SPREAD).to_numpy()
    out["h_F"] = np.where(ev, np.maximum(2 * c / a, 0.05), np.nan)
    out["h_C"] = np.where(ev, np.maximum(2 * c / b, 0.05), np.nan)
    # excursions (U6 + MFE): window E .. j_end
    out["MAE_C"] = -out.minz_pre
    out["MFE_C"] = out.maxz_pre
    out["MAE_F"] = out.maxz_pre
    out["MFE_F"] = -out.minz_pre
    out["unres"] = out["first"] == "none"
    out["U"] = out["first"] == "U"
    return out


# ── build-time checks ──────────────────────────────────────────────────────────────────────────────────────────────
NEXT = {"p50": "p75", "p75": "p90"}


def ref_names(fam, rung):
    return f"{fam}_{NEXT[rung]}", ("Open" if rung == "p50" else f"{fam}_p50"), "Open"


def to_min(j, t):
    return np.where(j >= 0, t, np.nan)


def checks(name, o):
    res = {}
    # 1 stage-1 reproduction: E and a, b from the path / day rows
    dE = np.abs(o.E_chk - o.E).max()
    a2 = o.s * (o.N - o.E_chk) / o.scale
    b2 = -o.s * (o.P - o.E_chk) / o.scale
    if dE != 0 or np.abs(a2 - o.a).max() > 1e-12 or np.abs(b2 - o.b).max() > 1e-12:
        stop("1_stage1_reproduction", {"instrument": name, "max_dE": dE})
    inv = pd.read_csv(OUT / "cell_inventory.csv")
    res["1_stage1_reproduction"] = {"pass": True, "touches": int(len(o))}
    # 2 category assertion
    allowed = {"1", "2", "3", "4a", "4b", "5a", "5b", "U"}
    bad = (~o.cat.isin(allowed)) | ((o.rung == "p50") & (o.cat == "4a"))
    if bad.any() or o.cat.isna().any() or len(o) != o.cat.value_counts().sum():
        stop("2_category_assertion", {"instrument": name, "bad": int(bad.sum())})
    res["2_category_assertion"] = {"pass": True, "labels": {k: int(v) for k, v in o.cat.value_counts().items()}}
    # 3c primary vs independent, every line set
    for x in ("N", "P", "O"):
        m = (o[f"j{x}"].fillna(-9) != o[f"j{x}2"].fillna(-9))
        if m.any():
            stop("3c_independent_reconstruction", {"instrument": name, "ref": x, "n": int(m.sum())})
    res["3c_independent_reconstruction"] = {"pass": True, "touches": int(len(o)), "refs": 3}
    # 3a forecast fixed vs archive; 3b phantom fixed vs M3; projected disagreement reported
    arc = pd.read_parquet(ARC_GIT / f"{name}_touches.parquet")
    arc["date"] = arc.date.astype(str)
    arc["fkey"] = 1.0
    ph = pd.read_parquet(M3_DATA / f"{name}_phantom_outcomes.parquet")
    ph["date"] = ph.date.astype(str)
    ph["fkey"] = ph.factor.round(2)
    ncols = [c for c in arc.columns if c.startswith("next_")]
    ev = pd.concat([arc[["date", "level", "fkey"] + ncols], ph[["date", "level", "fkey"] + ncols]], ignore_index=True)
    o2 = o.assign(fkey=o.factor.round(2)).merge(ev, on=["date", "level", "fkey"], how="left", validate="one_to_one")
    agree = {}
    tie = {}
    for (grp, isfc), g in o2.groupby([o2.group, o2.factor == 1.0]):
        dis = np.zeros(len(g), bool)
        dis_u = np.zeros(len(g), bool)
        for x, col in zip(("N", "P", "O"), (0, 1, 2)):
            names = [ref_names(fa, ru)[col] for fa, ru in zip(g.family, g.rung)]
            want = np.array([getattr(r, f"next_{nm}_min") if hasattr(r, f"next_{nm}_min") else np.nan
                             for r, nm in zip(g.itertuples(index=False), names)], float)
            got = g[f"t{x}"].to_numpy()
            dis |= ~((np.isnan(want) & np.isnan(got)) | (want == got))
            if grp == "Fixed" and isfc:
                gu = g[f"j{x}u"].to_numpy()
                gu_t = np.where(gu >= 0, 1, np.nan)
                dis_u |= ~((np.isnan(want) & np.isnan(gu_t)) | (~np.isnan(want) & ~np.isnan(gu_t)))
                dis_u |= (g[f"j{x}u"].to_numpy() != g[f"j{x}"].to_numpy())
        key = f"{grp}|{'forecast' if isfc else 'placebo'}"
        agree[key] = {"touches": int(len(g)), "disagree": int(dis.sum()), "rate": float(dis.mean())}
        if grp == "Fixed" and isfc:
            tie["forecast_fixed_uncast_vs_cast_disagree"] = {"touches": int(len(g)), "disagree": int(dis_u.sum()),
                                                            "rate": float(dis_u.mean())}
        if grp == "Fixed" and dis.any():
            bad = g[dis][["date", "level", "factor", "tN", "tP", "tO"]].head(20).to_dict("records")
            stop("3a_3b_archive_agreement", {"instrument": name, "cell": key, "disagree": int(dis.sum()), "examples": bad})
    res["3a_forecast_fixed_vs_archive"] = {"pass": True, **agree["Fixed|forecast"]}
    res["3b_placebo_fixed_vs_M3"] = {"pass": True, **agree["Fixed|placebo"]}
    res["projected_vs_archive_moving_refs (reported)"] = {"forecast": agree.get("Projected|forecast"),
                                                         "placebo": agree.get("Projected|placebo")}
    res["4_tie_mismatch_diagnostic (reported)"] = tie
    return res


# ── statistics ─────────────────────────────────────────────────────────────────────────────────────────────────────
def summ(v, scale=1.0):
    d = v[1:][np.isfinite(v[1:])]
    if not len(d) or not np.isfinite(v[0]):
        return {"est": float(v[0] * scale) if np.isfinite(v[0]) else None, "ci": [None, None], "p": None}
    lo, hi = np.percentile(d, [2.5, 97.5])
    p = max(1.0 / B, min(1.0, 2 * min(np.mean(d <= 0), np.mean(d >= 0))))
    return {"est": float(v[0] * scale), "ci": [float(lo * scale), float(hi * scale)], "p": float(p)}


def bh(ps, q=0.10):
    ps = np.asarray(ps, float)
    o = np.argsort(ps)
    ok = ps[o] <= q * np.arange(1, len(ps) + 1) / len(ps)
    k = np.max(np.flatnonzero(ok)) + 1 if ok.any() else 0
    r = np.zeros(len(ps), bool)
    r[o[:k]] = True
    return r


def wmean(W, x, m):
    s = W[:, m].sum(1)
    return (W[:, m] @ x[m]) / np.where(s > 0, s, np.nan)


def wshare(W, num, den):
    s = W[:, den].sum(1)
    return W[:, num & den].sum(1) / np.where(s > 0, s, np.nan)


def wquant(x, W, qs):
    if len(x) == 0:
        return np.full((len(W), len(qs)), np.nan)
    o = np.argsort(x)
    xs, cw = x[o], np.cumsum(W[:, o], 1)
    tot = cw[:, -1:]
    out = np.full((len(W), len(qs)), np.nan)
    ok = tot[:, 0] > 0
    for j, q in enumerate(qs):
        idx = (cw < q * tot).sum(1)
        out[ok, j] = xs[np.clip(idx[ok], 0, len(xs) - 1)]
    return out


def sign_ok(pooled, periods):
    if pooled is None or pooled == 0:
        return False
    return all(p is not None and p != 0 and np.sign(p) == np.sign(pooled) for p in periods)


def period_masks(g):
    pit = (g.era == "oos_pit").to_numpy()
    return {"pooled": pit, "Y1-Y3": pit & g.yr.between(1, 3).to_numpy(), "Y4-Y6": pit & g.yr.between(4, 6).to_numpy(),
            "2016-20": (g.era != "oos_pit").to_numpy(),
            "untagged_excluded": pit & (g.tag_status != "unknown").to_numpy()}


def t1_group(g, W):
    """T1 cells for one instrument x family x rung: category shares, forecast vs B2 placebo."""
    fac = g.factor.to_numpy()
    ordered = (g.cat != "U").to_numpy()
    PM = period_masks(g)
    out = []
    counts = {}
    for f in SETS:
        mf = np.isclose(fac, f) & PM["pooled"]
        counts[str(f)] = {"share_eligible": int(mf.sum()), "U": int((mf & ~ordered).sum()), "denominator": int((mf & ordered).sum())}
    for c in CATS[g.rung.iloc[0]]:
        isc = (g.cat == c).to_numpy()
        res = {"category": c, "n": counts}
        for pk, pm in PM.items():
            vals = {f: wshare(W, isc, np.isclose(fac, f) & pm & ordered) for f in SETS}
            pl = sum(w * vals[fv] for w, fv in zip(W_B2, FACT4))
            res[pk] = {"forecast": summ(vals[1.0], 100), "placebo_B2": summ(pl, 100), "delta": summ(vals[1.0] - pl, 100),
                       "by_factor_pp": {str(fv): float(100 * vals[fv][0]) for fv in FACT4}}
        out.append(res)
    return out


def t2_cells(g, W, inst):
    """T2 cells for one instrument x family x rung: every condition level x race."""
    fac = g.factor.to_numpy()
    ev = g.elig_ev.to_numpy()
    PM = period_masks(g)
    conds = [("all", np.ones(len(g), bool))]
    conds += [(f"window {w}", (g.window == w).to_numpy()) for w in WINDOWS]
    if g.group.iloc[0] == "Fixed":
        conds += [(f"range used {q}", (g.ru_tercile == q).to_numpy()) for q in ("bottom", "middle", "top")]
    conds += [(f"P1 {q}", (g.p1_tercile == q).to_numpy()) for q in ("bottom", "middle", "top")]
    conds += [(f"P2 {q}", (g.p2_tercile == q).to_numpy()) for q in ("bottom", "middle", "top")]
    unres = g.unres.to_numpy()
    isU = g.U.to_numpy()
    out = []
    for cname, cm in conds:
        for race in ("F", "C"):
            pay = g[f"pay_{race}"].to_numpy()
            hh = g[f"h_{race}"].to_numpy()
            R = g.a.to_numpy() if race == "F" else g.b.to_numpy()
            other = g.b.to_numpy() if race == "F" else g.a.to_numpy()
            res = {"condition": cname, "race": "fade" if race == "F" else "continuation", "n": {}}
            for f in SETS:
                res["n"][str(f)] = int((np.isclose(fac, f) & cm & ev & PM["pooled"]).sum())
            res["small_placebo_flag"] = any(res["n"][str(f)] < 150 for f in FACT4)
            for pk, pm in PM.items():
                base = cm & ev & pm
                evs = {f: wmean(W, np.nan_to_num(pay), base & np.isclose(fac, f)) for f in SETS}
                pl = sum(w * evs[fv] for w, fv in zip(W_B2, FACT4))
                mfc = base & np.isclose(fac, 1.0)
                hcell = float(np.nanmean(hh[mfc])) if mfc.any() else np.nan
                entry = {"EV_fc": summ(evs[1.0]), "EV_pl": summ(pl), "dEV": summ(evs[1.0] - pl), "H": hcell,
                         "EV_by_factor": {str(fv): float(evs[fv][0]) for fv in FACT4}}
                if pk in ("pooled", "untagged_excluded"):
                    den = W[:, mfc].sum(1)
                    den = np.where(den > 0, den, np.nan)
                    p0 = np.nan_to_num(pay)
                    rc = (W[:, mfc & ~unres] @ p0[mfc & ~unres]) / den
                    uc = (W[:, mfc & unres] @ p0[mfc & unres]) / den
                    entry["unresolved_share"] = summ(W[:, mfc & unres].sum(1) / den, 100)
                    entry["resolved_contribution"] = summ(rc)
                    entry["unresolved_contribution"] = summ(uc)
                    entry["mean_unresolved_payoff"] = summ(wmean(W, p0, mfc & unres))
                    if np.isfinite(evs[1.0][0]) and abs(rc[0] + uc[0] - evs[1.0][0]) > 1e-9:
                        stop("5_decomposition_identity", {"instrument": inst, "condition": cname, "race": race})
                    # D2 sensitivity: U removed from numerator and denominator
                    evd2 = {f: wmean(W, p0, base & np.isclose(fac, f) & ~isU) for f in SETS}
                    pld2 = sum(w * evd2[fv] for w, fv in zip(W_B2, FACT4))
                    entry["D2_U_excluded"] = {"EV_fc": summ(evd2[1.0]), "dEV": summ(evd2[1.0] - pld2)}
                    entry["breakeven_share"] = float(np.mean((R / (R + other))[mfc])) if mfc.any() else None
                res[pk] = entry
            out.append(res)
    return out


def distributions(g, W):
    """Within-category distributions, forecast and B2 placebo (PIT), plus race-outcome excursion medians (forecast)."""
    fac = g.factor.to_numpy()
    pit = (g.era == "oos_pit").to_numpy()
    meas = {"further_travel": g.maxz_sess.to_numpy(), "retrace_depth": -g.minz_pre.to_numpy(), "t_N": g.tN.to_numpy(),
            "t_P": g.tP.to_numpy(), "t_O": g.tO.to_numpy(), "MAE_C": g.MAE_C.to_numpy(), "MFE_C": g.MFE_C.to_numpy(),
            "MAE_F": g.MAE_F.to_numpy(), "MFE_F": g.MFE_F.to_numpy()}
    out = {}
    for c in CATS[g.rung.iloc[0]] + ["U"]:
        isc = (g.cat == c).to_numpy() & pit
        out[c] = {}
        for mk, x in meas.items():
            if mk == "retrace_depth" and c in ("5a", "5b", "U"):
                continue
            qv = {}
            for f in SETS:
                m = isc & np.isclose(fac, f) & np.isfinite(x)
                qv[f] = wquant(x[m], W[:, m], [0.25, 0.5, 0.75, 0.9])
            pl = sum(w * qv[fv] for w, fv in zip(W_B2, FACT4))
            n_fc = int((isc & np.isclose(fac, 1.0) & np.isfinite(x)).sum())
            if n_fc == 0:
                continue
            out[c][mk] = {"n_forecast": n_fc,
                          **{f"q{int(q * 100)}": {"forecast": summ(qv[1.0][:, j]), "placebo_B2": summ(pl[:, j]),
                                                  "diff": summ(qv[1.0][:, j] - pl[:, j])}
                             for j, q in enumerate((0.25, 0.5, 0.75, 0.9))}}
    # race-outcome MAE/MFE medians (forecast, PIT, point only)
    fc = g[pit & np.isclose(fac, 1.0)]
    ro = {}
    for race, win, lose in (("continuation", "N", "P"), ("fade", "P", "N")):
        lab = np.select([fc["first"] == win, fc["first"] == lose, fc["first"] == "U"], ["win", "loss", "U"], "unresolved")
        sfx = "C" if race == "continuation" else "F"
        ro[race] = {o_: {"n": int((lab == o_).sum()),
                         "MAE_median": float(fc[f"MAE_{sfx}"][lab == o_].median()) if (lab == o_).any() else None,
                         "MFE_median": float(fc[f"MFE_{sfx}"][lab == o_].median()) if (lab == o_).any() else None}
                    for o_ in ("win", "loss", "U", "unresolved")}
    out["_race_outcome_excursions"] = ro
    return out


def counts_and_gaps(g):
    pit = (g.era == "oos_pit").to_numpy()
    out = {}
    for f in SETS:
        m = pit & np.isclose(g.factor, f)
        x = g[m]
        gp = x[x.gap]
        out[str(f)] = {
            "share_eligible": int(len(x)), "ev_eligible": int(x.elig_ev.sum()), "U": int(x.U.sum()),
            "categories": {k: int(v) for k, v in x.cat.value_counts().items()},
            "assigned_total_check": int(x.cat.value_counts().sum()) == int(len(x)),
            "gap_resolved": int(gp.shape[0]),
            "gap_by_category": {k: int(v) for k, v in gp.cat.value_counts().items()},
            "gap_by_first_event": {k: int(v) for k, v in gp["first"].value_counts().items()},
            "gap_sigma_median": float(gp.gap_sig.median()) if len(gp) else None,
            "gap_sigma_max": float(gp.gap_sig.max()) if len(gp) else None,
            "U_gap": int((x.U & x.gap).sum()), "U_no_gap": int((x.U & ~x.gap).sum()),
        }
    return out


def classify(t1, t2):
    # T1
    ps = [c["pooled"]["delta"]["p"] for c in t1]
    sig = bh(ps)
    for c, s in zip(t1, sig):
        d = c["pooled"]["delta"]
        per = [c[k]["delta"]["est"] for k in ("Y1-Y3", "Y4-Y6", "2016-20")]
        stab = sign_ok(d["est"], per)
        trig = bool(s) and abs(d["est"]) >= 5 and stab
        lo, hi = d["ci"]
        failed = [n for n, ok in (("BH", bool(s)), ("|delta|>=5pp", abs(d["est"]) >= 5), ("period sign", stab)) if not ok]
        if trig:
            lab = "Triggered"
        elif lo > 5 or hi < -5:
            lab = "Inconclusive — material effect remains, trigger unmet"
        elif -5 <= lo and hi <= 5:
            lab = "Ruled out"
        else:
            lab = "Underpowered"
        c["bh_sig"], c["period_sign_stable"], c["failed_conditions"], c["class"] = bool(s), stab, failed, lab
        c["untagged_trigger_check"] = None
    # T2
    fam = [c for c in t2 if c["in_family"]]
    sig = bh([c["pooled"]["EV_fc"]["p"] for c in fam])
    for c, s in zip(fam, sig):
        c["bh_sig"] = bool(s)
    for c in t2:
        P = c["pooled"]
        ev, dev, H = P["EV_fc"], P["dEV"], P["H"]
        s = c.get("bh_sig", False)
        pev = [c[k]["EV_fc"]["est"] for k in ("Y1-Y3", "Y4-Y6", "2016-20")]
        pdev = [c[k]["dEV"]["est"] for k in ("Y1-Y3", "Y4-Y6", "2016-20")]
        c1 = c["in_family"] and ev["est"] is not None and ev["est"] > 0 and s
        c2 = ev["est"] is not None and H is not None and np.isfinite(H) and ev["est"] >= H
        c3 = dev["est"] is not None and dev["ci"][0] is not None and (dev["ci"][0] > 0 or dev["ci"][1] < 0) and dev["est"] >= 0.05
        ev_stab = sign_ok(ev["est"], pev)
        c4 = ev_stab and sign_ok(dev["est"], pdev)
        conds = {"1_EV_pos_BH": bool(c1), "2_EV_ge_H": bool(c2), "3_dEV": bool(c3), "4_period_sign": bool(c4)}
        if c1 and c2 and c3 and c4:
            lab = "Triggered"
        elif c1 and c2 and not c3 and ev_stab:
            lab = "Market-wide context"
        elif (dev["ci"][1] is not None and dev["ci"][1] < 0.05) or (ev["ci"][1] is not None and H is not None and ev["ci"][1] < H):
            which = []
            if dev["ci"][1] is not None and dev["ci"][1] < 0.05:
                which.append("dEV upper < +0.05R")
            if ev["ci"][1] is not None and ev["ci"][1] < H:
                which.append("EV_fc upper < H")
            lab = "Ruled out (" + "; ".join(which) + ")"
        else:
            lab = "Underpowered"
        c["conditions"], c["class"] = conds, lab
        # untagged dependence of a trigger
        if lab == "Triggered":
            U_ = c["untagged_excluded"]
            c["depends_on_untagged_days"] = not (U_["EV_fc"]["est"] > 0 and U_["EV_fc"]["est"] >= U_["H"]
                                                 and U_["dEV"]["ci"][0] > 0 and U_["dEV"]["est"] >= 0.05)
    return t1, t2


def main():
    t0 = time.time()
    OUT.mkdir(parents=True, exist_ok=True)
    check_regen()
    rows = {}
    for name in NAMES:
        f, days, pbd = load(name)
        o = outcomes(f, pbd)
        CHECKS[name] = checks(name, o)
        rows[name] = o
        print("built", name, len(o), f"{time.time() - t0:.0f}s", flush=True)
    (OUT / "build_checks.json").write_text(json.dumps(CHECKS, indent=1, default=str))
    # weights: one Poisson(1) per calendar date over the union of the three instruments' session dates
    dates = sorted(set().union(*[set(pd.read_parquet(ARC_GIT / f"{n}_days.parquet", columns=["date"]).date.astype(str)) for n in NAMES]))
    dpos = {d: i for i, d in enumerate(dates)}
    rng = np.random.default_rng(SEED)
    Wd = np.vstack([np.ones(len(dates)), rng.poisson(1.0, (B, len(dates))).astype(float)])
    inv = pd.read_csv(OUT / "cell_inventory.csv")
    T1, T2, DIST, CNT = [], [], {}, {}
    for name in NAMES:
        o = rows[name]
        for (grp, ru), g in o.groupby(["group", "rung"]):
            g = g.reset_index(drop=True)
            W = Wd[:, g.date.map(dpos).to_numpy()]
            key = f"{name}|{grp}|{ru}"
            for c in t1_group(g, W):
                T1.append({"instrument": name, "family": grp, "rung": ru, **c})
            for c in t2_cells(g, W, name):
                n_inv = inv[(inv.instrument == name) & (inv.family == grp) & (inv.rung == ru) & (inv.condition == c["condition"])]
                assert len(n_inv) == 1 and int(n_inv["n_ev_1.0"].iloc[0]) == c["n"]["1.0"], ("inventory mismatch", key, c["condition"])
                T2.append({"instrument": name, "family": grp, "rung": ru, "in_family": bool(n_inv.in_family.iloc[0]), **c})
            DIST[key] = distributions(g, W)
            CNT[key] = counts_and_gaps(g)
            print("stats", key, f"{time.time() - t0:.0f}s", flush=True)
    CHECKS["1_stage1_inventory_counts"] = {"pass": True, "t2_cells": len(T2) // 2}
    T1, T2 = classify(T1, T2)
    res = {"meta": {"prereg": "forge/DAY_RECON_PATH_BOOK_PREREG.md", "frozen": "2291306d", "rules": "d7ce9e06", "B": B,
                    "seed": SEED, "W_B2": [float(w) for w in W_B2], "n_dates": len(dates), "runtime_s": round(time.time() - t0)},
           "checks": CHECKS, "T1": T1, "T2": T2, "distributions": DIST, "counts": CNT}
    (OUT / "results.json").write_text(json.dumps(res, indent=1, default=float))
    (OUT / "build_checks.json").write_text(json.dumps(CHECKS, indent=1, default=str))
    print("done", res["meta"]["runtime_s"], "s")


if __name__ == "__main__":
    main()
