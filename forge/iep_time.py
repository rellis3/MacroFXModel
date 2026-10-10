"""iep_time — analysis for forge/IEP_TIME_PREREG.md (families T, H2, H4, X, D + descriptive tables).

    python -m forge.iep_time

Reads data/iep/time_rows.parquet, carry_races.parquet, features_2016_2024.parquet. Test block = 2022-01-01 .. 2024-12-31, oos = 1.
Writes analysis/output/intraday_extreme_paths/TIME.md and time.json.
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

from forge.iep_build import OUT, SUM
from forge.iep_stage2 import ols_cr1, wald_interaction, holm, bh, block_boot, calib

T0, T1 = "2022-01-01", "2025-01-01"
YEARS = ("2022", "2023", "2024")
RNG = np.random.default_rng(20261010)
NTRAIN = 300_000
SESS = lambda h: np.select([h < 7, h < 12, h < 16, h < 19], ["asia", "london", "overlap", "ny"], "late")
WD = ["Mon", "Tue", "Wed", "Thu", "Fri"]


# ------------------------------------------------------------------ data
def load():
    x = pd.read_parquet(OUT / "time_rows.parquet")
    f = pd.read_parquet(OUT / "features_2016_2024.parquet", columns=["inst", "date", "h", "iv_sig"])
    x = x.merge(f, on=["inst", "date", "h"], how="left")
    prof = json.loads((SUM / "discovery_profile.json").read_text())["share"]
    vl = {c: {h: sum(s.get(f"{k}|1", 0) for k in range(h, 22)) for h in range(2, 22)} for c, s in prof.items()}
    x["v_left"] = [vl[c][h] for c, h in zip(x.cls, x.h)]
    x["o"] = np.where(x.D >= 0, 1, -1)
    sd = x.pit_sig_daily
    up = x.o == 1
    x["EXT75"] = np.where(up, x.U75, x.L75)
    x["OPP75"] = np.where(up, x.L75, x.U75)
    x["ext50_done"] = np.where(up, x.ohp50_done, x.olp50_done)
    lvl_up, lvl_dn = x.pit_oh_p75, -x.pit_ol_p75
    x["z_ext"] = np.clip(np.where(up, lvl_up - x.pos, x.pos - lvl_dn) / (sd * np.sqrt(x.v_left)), -10, 10)
    x["z_opp"] = np.clip(np.where(up, x.pos - lvl_dn, lvl_up - x.pos) / (sd * np.sqrt(x.v_left)), -10, 10)
    x["z_up75"] = np.clip((lvl_up - x.pos) / (sd * np.sqrt(x.v_left)), -10, 10)
    x["z_up90"] = np.clip((x.pit_oh_p90 - x.pos) / (sd * np.sqrt(x.v_left)), -10, 10)
    x["absD"] = (x.pos / sd).abs()
    x["used50x"] = (x.run_oh + x.run_ol) / x.pit_hl_p50
    x["pb_ext"] = np.where(up, x.hi_pb, x.lo_pb)
    x["age_ext"] = np.where(up, x.hi_age, x.lo_age)
    x["om1"] = (x.o * x.m1).fillna(0)
    r = x["res2_1.0"]
    x["CONS"] = np.where((r == 0), 1.0, np.where(r.isin([1, -1]), 0.0, np.nan))
    x.loc[x.h > 20, "CONS"] = np.nan
    x["CONT"] = np.where(r * x.o == 1, 1.0, np.where(r * x.o == -1, 0.0, np.nan))
    x.loc[x.h > 20, "CONT"] = np.nan
    x["FTup"] = np.where(x.FT == "up", 1.0, np.where(x.FT == "down", 0.0, np.nan))
    x["session"] = SESS(x.h.to_numpy())
    dt = pd.to_datetime(x.date)
    x["wd"] = dt.dt.dayofweek.map(dict(enumerate(WD)))
    x["year"] = x.date.str[:4]
    x["test"] = (x.date >= T0) & (x.date < T1) & (x.oos == 1)
    # New York hour at the checkpoint and the US/UK DST-mismatch flag
    ud = x[["date", "h"]].drop_duplicates()
    ts = (pd.to_datetime(ud.date) + pd.to_timedelta(ud.h, unit="h")).dt.tz_localize("Europe/London")
    ny = ts.dt.tz_convert("America/New_York")
    ud["ny_h"] = ny.dt.hour.to_numpy()
    ud["dst_mis"] = ((ts.dt.tz_localize(None) - ny.dt.tz_localize(None)) != pd.Timedelta(hours=5)).to_numpy()
    x = x.merge(ud, on=["date", "h"], how="left")
    return x


M0_NUM = ["z_ext", "z_opp", "lvl", "absD", "used50x", "pb_ext", "lage", "om1", "lsr", "srna", "iv", "ivna"]


def m0_frame(x):
    f = pd.DataFrame({"z_ext": x.z_ext, "z_opp": x.z_opp, "lvl": np.log(x.v_left), "absD": x.absD, "used50x": x.used50x,
                      "pb_ext": x.pb_ext, "lage": np.log1p(x.age_ext), "om1": x.om1, "lsr": np.log(x.sigRel.fillna(1)),
                      "srna": x.sigRel.isna().astype(float), "iv": x.iv_sig.fillna(0), "ivna": x.iv_sig.isna().astype(float)}, index=x.index)
    return pd.concat([f, pd.get_dummies(x.event, prefix="ev", dtype=float), pd.get_dummies(x.cls, prefix="c", dtype=float)], axis=1)


def extra(x, kind):
    if kind == "hour":
        return pd.get_dummies(x.h, prefix="h", dtype=float)
    if kind == "session":
        return pd.get_dummies(x.session, prefix="s", dtype=float)
    if kind == "weekday":
        return pd.get_dummies(x.wd, prefix="w", dtype=float)
    if kind == "nyhour":
        return pd.get_dummies(x.ny_h, prefix="ny", dtype=float)
    raise KeyError(kind)


def walk(x, y, feats):
    """Walk-forward yearly logistic predictions on the test rows; returns p aligned to x[test & y notna]."""
    ok = y.notna()
    p = pd.Series(np.nan, index=x.index)
    X = feats.astype(float)
    for yr in YEARS:
        tr = ok & (x.date < f"{yr}-01-01")
        te = ok & x.test & (x.year == yr)
        tri = np.flatnonzero(tr.to_numpy())
        if len(tri) > NTRAIN:
            tri = np.sort(RNG.choice(tri, NTRAIN, replace=False))
        Xtr, ytr = X.iloc[tri].to_numpy(), y.iloc[tri].to_numpy()
        sc = StandardScaler().fit(Xtr)
        m = LogisticRegression(C=1.0, max_iter=2000).fit(sc.transform(Xtr), ytr)
        p[te] = m.predict_proba(sc.transform(X[te].to_numpy()))[:, 1]
    return p


def skill(y, p_ref, p_new, dates):
    br_r, br_n = (p_ref - y) ** 2, (p_new - y) ** 2
    e = lambda q: np.clip(q, 1e-9, 1 - 1e-9)
    ll_r = -(y * np.log(e(p_ref)) + (1 - y) * np.log(1 - e(p_ref)))
    ll_n = -(y * np.log(e(p_new)) + (1 - y) * np.log(1 - e(p_new)))
    out = {}
    for name, a, b in (("brier", br_r, br_n), ("logloss", ll_r, ll_n)):
        d = (a - b).to_numpy()
        bs = block_boot(d, dates) / a.mean()
        out[name] = round(100 * d.mean() / a.mean(), 3)
        out[f"{name}_ci"] = [round(100 * np.quantile(bs, 0.025), 3), round(100 * np.quantile(bs, 0.975), 3)]
    return out


def cell_table(t, by, ycol, pcol, base_rate, min_dates=30):
    """Conditional probability, matched (M0) baseline, unconditional baseline, pp and relative differences, n, CI, per-year gaps."""
    rows = []
    for k, g in t.groupby(by, observed=True):
        y, p = g[ycol], g[pcol]
        res = (y - p).to_numpy()
        b, V, G = ols_cr1(res, np.ones((len(res), 1)), g.date.to_numpy())
        se = np.sqrt(V[0, 0])
        yrs = {yr: round(100 * (gg[ycol] - gg[pcol]).mean(), 1) for yr, gg in g.groupby("year")}
        rows.append({by if isinstance(by, str) else "cell": k, "n": len(g), "dates": G, "P%": round(100 * y.mean(), 1),
                     "M0%": round(100 * p.mean(), 1), "uncond%": round(100 * base_rate, 1),
                     "P-M0 pp": round(100 * b[0], 2), "ci": f"±{196 * se:.2f}", "rel_vs_M0 %": round(100 * (y.mean() / p.mean() - 1), 1),
                     "P-uncond pp": round(100 * (y.mean() - base_rate), 1), "per-year P-M0": yrs,
                     "interpret": "" if G >= min_dates else "too few dates"})
    return pd.DataFrame(rows)


# ------------------------------------------------------------------ families
def family_T(x):
    outs = {"EXT75": x.EXT75, "OPP75": x.OPP75, "CONS": x.CONS, "EXP": x.EXP}
    base = m0_frame(x)
    res, preds = {}, {}
    for oname, y in outs.items():
        p0 = walk(x, y, base)
        preds[oname] = p0
        te = x.test & y.notna()
        r = {"n_test": int(te.sum()), "M0_calib_gap_pp": round(calib(p0[te].to_numpy(), y[te].to_numpy())[0], 2)}
        for kind in ("hour", "session", "weekday"):
            p1 = walk(x, y, pd.concat([base, extra(x, kind)], axis=1))
            s = skill(y[te], p0[te], p1[te], x.date[te].to_numpy())
            s["calib_gap_pp"] = round(calib(p1[te].to_numpy(), y[te].to_numpy())[0], 2)
            s["by_year_brier"] = {yr: round(100 * (((p0 - y) ** 2)[te & (x.year == yr)].mean() - ((p1 - y) ** 2)[te & (x.year == yr)].mean())
                                            / ((p0 - y) ** 2)[te & (x.year == yr)].mean(), 3) for yr in YEARS}
            s["by_class_brier"] = {c: round(100 * (((p0 - y) ** 2)[te & (x.cls == c)].mean() - ((p1 - y) ** 2)[te & (x.cls == c)].mean())
                                            / ((p0 - y) ** 2)[te & (x.cls == c)].mean(), 3) for c in sorted(x.cls.unique())}
            nm = te & ~x.dst_mis
            s["brier_excl_dst_mismatch"] = round(100 * (((p0 - y) ** 2)[nm].mean() - ((p1 - y) ** 2)[nm].mean()) / ((p0 - y) ** 2)[nm].mean(), 3)
            # bootstrap p for Holm: share of bootstrap draws <= 0 (one-sided twice)
            d = (((p0 - y) ** 2) - ((p1 - y) ** 2))[te].to_numpy()
            bs = block_boot(d, x.date[te].to_numpy())
            s["p_boot"] = float(min(1, 2 * min((bs <= 0).mean(), (bs >= 0).mean()) + 1 / len(bs)))
            s["credited"] = bool(s["brier_ci"][0] > 0 and s["brier"] >= 0.3)
            r[kind] = s
        res[oname] = r
    keys = [(o, k) for o in res for k in ("hour", "session", "weekday")]
    adj = holm([res[o][k]["p_boot"] for o, k in keys])
    for (o, k), a in zip(keys, adj):
        res[o][k]["p_holm"] = round(float(a), 4)
    return res, preds


def family_H2(c):
    t = c[(c.date >= T0) & (c.date < T1) & (c.oos == 1) & c.res.isin(["cont", "rev"])].copy()
    t["y"] = (t.res == "cont").astype(float)
    t["real"] = (t.kind == "real").astype(float)
    rows = []
    for (w, cl), g in t.groupby(["win", "cls"]):
        b, V, G = ols_cr1(g.y.to_numpy(), np.column_stack([np.ones(len(g)), g.real]), g.date.to_numpy())
        se = np.sqrt(V[1, 1])
        from scipy import stats
        sh = g.groupby("kind").y.agg(["mean", "size"])
        yrs = {yr: round(100 * (gg[gg.real == 1].y.mean() - gg[gg.real == 0].y.mean()), 1) for yr, gg in g.groupby(g.date.str[:4])}
        rows.append({"window": w, "class": cl, "real_cont%": round(100 * sh.loc["real", "mean"], 1), "placebo_cont%": round(100 * g[g.real == 0].y.mean(), 1),
                     "diff_pp": round(100 * b[1], 2), "ci": f"[{100 * (b[1] - 1.96 * se):.2f}, {100 * (b[1] + 1.96 * se):.2f}]",
                     "rel %": round(100 * (sh.loc["real", "mean"] / g[g.real == 0].y.mean() - 1), 1), "n_real": int(sh.loc["real", "size"]),
                     "n_placebo": int(g.real.eq(0).sum()), "dates": G, "p": 2 * stats.norm.sf(abs(b[1] / se)), "per-year diff": yrs})
    R = pd.DataFrame(rows)
    R["p_holm"] = holm(R.p.to_numpy())
    return R


def family_H4(x, preds_ext):
    from scipy import stats
    g = x[(x.inst == "GOLD") & x.h.between(7, 17)].copy()
    est, te = g[g.date < T0], g[g.test]
    # distance-matched geometry model fitted on GOLD estimation rows: U75 ~ z_up75, log v_left (no extension, no hour)
    out = {}
    tables = {}
    for target, zc in (("U75", "z_up75"), ("U90", "z_up90")):
        e = est[est[target].notna()]
        sc = StandardScaler().fit(np.c_[e[zc], np.log(e.v_left)])
        mg = LogisticRegression(max_iter=2000).fit(sc.transform(np.c_[e[zc], np.log(e.v_left)]), e[target])
        t = te[te[target].notna()].copy()
        t["pg"] = mg.predict_proba(sc.transform(np.c_[t[zc], np.log(t.v_left)]))[:, 1]
        t["ext"] = t.ohp50_done.astype(float)
        # H4a (U75 only is tested): ext coefficient in an LPM with flexible geometry (z deciles x v_left terciles) — date-clustered
        zq = pd.qcut(t[zc], 10, labels=False, duplicates="drop").astype(str) + "_" + pd.qcut(t.v_left, 3, labels=False, duplicates="drop").astype(str)
        D = pd.get_dummies(zq, drop_first=True, dtype=float).to_numpy()
        b, V, G = ols_cr1(t[target].to_numpy(), np.column_stack([np.ones(len(t)), t.ext, D]), t.date.to_numpy())
        se = np.sqrt(V[1, 1])
        out[f"{target}: extension beyond distance-matched geometry"] = {"eff_pp": round(100 * b[1], 2), "ci": [round(100 * (b[1] - 1.96 * se), 2), round(100 * (b[1] + 1.96 * se), 2)],
                                                                        "p": float(2 * stats.norm.sf(abs(b[1] / se))), "n": len(t), "dates": G}
        # hourly table (07-17), T7 baselines, M0g baseline
        rows = []
        band_rate = t[t.ext == 1].groupby(SESS(t[t.ext == 1].h.to_numpy()))[target].mean()
        for h, gh in t.groupby("h"):
            ex, ne = gh[gh.ext == 1], gh[gh.ext == 0]
            if len(ex) < 5:
                continue
            sess = SESS(np.array([h]))[0]
            k, n = ex[target].sum(), len(ex)
            shr = (k + 30 * band_rate.get(sess, ex[target].mean())) / (n + 30)
            res = (ex[target] - ex.pg).to_numpy()
            bb, VV, GG = ols_cr1(res, np.ones((len(res), 1)), ex.date.to_numpy())
            rows.append({"hour": f"{h:02d}:00", "P(|ext)%": round(100 * ex[target].mean(), 1), "shrunk%": round(100 * shr, 1), "n_ext": n, "dates": GG,
                         "T7 base P(|not ext)%": round(100 * ne[target].mean(), 1), "uncond same hour%": round(100 * gh[target].mean(), 1),
                         "distance-matched%": round(100 * ex.pg.mean(), 1), "P-matched pp": round(100 * bb[0], 1), "ci": f"±{196 * np.sqrt(VV[0, 0]):.1f}",
                         "rel vs matched %": round(100 * (ex[target].mean() / ex.pg.mean() - 1), 1),
                         "P-T7base pp": round(100 * (ex[target].mean() - ne[target].mean()), 1),
                         "per-year P-matched": {yr: round(100 * (gg[target] - gg.pg).mean(), 1) for yr, gg in ex.groupby("year")}})
        tables[target] = pd.DataFrame(rows)
        if target == "U75":
            ex = t[t.ext == 1]
            for nm, col in (("H4b hour band", ex.session), ("H4c weekday", ex.wd)):
                Dg = pd.get_dummies(zq[ex.index], drop_first=True, dtype=float).to_numpy()
                Dc = pd.get_dummies(col, drop_first=True, dtype=float).to_numpy()
                b2, V2, G2 = ols_cr1(ex[target].to_numpy(), np.column_stack([np.ones(len(ex)), Dc, Dg]), ex.date.to_numpy())
                k = Dc.shape[1]
                W = float(b2[1:1 + k] @ np.linalg.pinv(V2[1:1 + k, 1:1 + k]) @ b2[1:1 + k])
                shares = ex.assign(r=ex[target] - ex.pg).groupby(col).r.mean().mul(100).round(1).to_dict()
                out[nm] = {"wald": round(W, 2), "df": k, "p": float(stats.chi2.sf(W, k)), "P-matched by level pp": shares, "n": len(ex), "dates": G2}
            tables["U75 by session (ext)"] = cell_table(ex.assign(r=0), "session", target, "pg", t[target].mean())
            tables["U75 by weekday (ext)"] = cell_table(ex, "wd", target, "pg", t[target].mean())
    # CL75 (close-plus-p75) reported, not tested
    t = te.copy()
    t["ext"] = t.ohp50_done
    tables["CL75 up (close >= open+oc_p75), GOLD"] = t.groupby(["h", "ext"]).CL75u.agg(["mean", "size"]).unstack().round(3)
    # H4d pooled all instruments: extension beyond geometry on U75 (EXT side oriented up only, as T7)
    a = x[x.test & x.h.between(7, 17) & x.U75.notna()].copy()
    zq = pd.qcut(a.z_up75, 10, labels=False, duplicates="drop").astype(str) + "_" + pd.qcut(a.v_left, 3, labels=False, duplicates="drop").astype(str) + "_" + a.cls
    D = pd.get_dummies(zq, drop_first=True, dtype=float).to_numpy()
    b, V, G = ols_cr1(a.U75.to_numpy(), np.column_stack([np.ones(len(a)), a.ohp50_done.astype(float), D]), a.date.to_numpy())
    se = np.sqrt(V[1, 1])
    out["H4d all instruments: extension beyond geometry (U75)"] = {"eff_pp": round(100 * b[1], 2), "ci": [round(100 * (b[1] - 1.96 * se), 2), round(100 * (b[1] + 1.96 * se), 2)],
                                                                   "p": float(2 * stats.norm.sf(abs(b[1] / se))), "n": len(a), "dates": G}
    keys = ["U75: extension beyond distance-matched geometry", "H4b hour band", "H4c weekday", "H4d all instruments: extension beyond geometry (U75)"]
    for k, ph in zip(keys, holm([out[k]["p"] for k in keys])):
        out[k]["p_holm"] = round(float(ph), 4)
    return out, tables


def family_X(x, preds):
    t = x[x.test].copy()
    est = x[x.date < T0]
    q = est.groupby(["cls", "h"]).used50x.quantile([1 / 3, 2 / 3]).unstack()
    q.columns = ["u1", "u2"]
    t = t.join(q, on=["cls", "h"])
    t["used_t"] = np.select([t.used50x <= t.u1, t.used50x <= t.u2], ["low", "mid"], "high")
    t["reg"] = np.select([t.sigRel < 0.85, t.sigRel <= 1.15], ["quiet", "normal"], "busy")
    t["tier1"] = t.event.isin(["FOMC", "NFP", "CPI", "tier1"]).map({True: "tier1", False: "other"})
    specs = [("session", "used_t", "EXT75"), ("session", "ext50_done", "EXT75"), ("session", "ext50_done", "CONS"),
             ("wd", "reg", "CONS"), ("wd", "reg", "EXP"), ("tier1", "session", "CONS"), ("tier1", "session", "EXP")]
    rows = []
    for a, b, o in specs:
        g = t[t[o].notna()]
        resid = (g[o] - preds[o][g.index]).to_numpy()
        w = wald_interaction(resid, g[a].astype(str), g[b].astype(str), g.date.to_numpy())
        wr = wald_interaction(g[o].to_numpy(), g[a].astype(str), g[b].astype(str), g.date.to_numpy())
        rows.append({"interaction": f"{a} x {b}", "outcome": o, "wald_resid": round(w["wald"], 2), "df": w["df"], "p": w["p"],
                     "max_int_resid_pp": round(w["max_int_pp"], 2), "raw_wald (not tested)": round(wr["wald"], 2), "raw_p": wr["p"]})
    R = pd.DataFrame(rows)
    R["q_bh"] = bh(R.p.to_numpy())
    R["pass_fdr10"] = R.q_bh <= 0.10
    # event codes actually present, for the record
    return R, sorted(t.event.unique())


def family_D(x):
    t = x[x.h.between(12, 18)]
    base = m0_frame(t)
    out = {}
    for o in ("CONS", "EXT75"):
        y = t[o]
        p_l = walk(t, y, pd.concat([base, extra(t, "hour")], axis=1))
        p_n = walk(t, y, pd.concat([base, extra(t, "nyhour")], axis=1))
        te = t.test & y.notna()
        s = skill(y[te], p_l[te], p_n[te], t.date[te].to_numpy())  # positive = New York clock better than London clock
        d = ((((p_l - y) ** 2) - ((p_n - y) ** 2))[te]).to_numpy()
        bs = block_boot(d, t.date[te].to_numpy())
        s["p_boot_bonf2"] = float(min(1, 2 * (2 * min((bs <= 0).mean(), (bs >= 0).mean()) + 1 / len(bs))))
        s["n_test"], s["mismatch_rows"] = int(te.sum()), int((te & t.dst_mis).sum())
        out[o] = s
    return out


def descriptive(x, preds):
    t = x[x.test].copy()
    tabs = {}
    for o in ("EXT75", "OPP75", "CONS", "EXP"):
        g = t[t[o].notna()].assign(p=preds[o])
        g = g[g.p.notna()]
        base = g[o].mean()
        tabs[f"{o} by hour"] = cell_table(g, "h", o, "p", base)
        tabs[f"{o} by weekday"] = cell_table(g, "wd", o, "p", base)
        tabs[f"{o} by session"] = cell_table(g, "session", o, "p", base)
    # first touch (up vs down among resolved) by hour and weekday: raw only (direction; M0 not fitted for it)
    ft = t[t.FTup.notna()]
    tabs["FT up-first share by session"] = ft.groupby("session").FTup.agg(["mean", "size"]).round(3)
    tabs["FT up-first share by weekday"] = ft.groupby("wd").FTup.agg(["mean", "size"]).round(3)
    return tabs


def daily_weekday(x):
    from forge.iep_time_build import load_fh
    from forge.iep_build import JOBS
    f = pd.concat([load_fh(s)[["inst", "date", "oos", "r_hl", "pit_hl_p75", "pit_sig_daily"]] for s in JOBS])
    f = f[(f.date >= T0) & (f.date < T1) & (f.oos == 1)].copy()
    f["exc"] = (f.r_hl > f.pit_hl_p75).astype(float)
    f["ratio"] = f.r_hl / f.pit_sig_daily
    f["wd"] = pd.to_datetime(f.date).dt.dayofweek.map(dict(enumerate(WD)))
    rows = []
    for w, g in f.groupby("wd"):
        b, V, G = ols_cr1(g.exc.to_numpy(), np.ones((len(g), 1)), g.date.to_numpy())
        rows.append({"weekday": w, "HL p75 exceeded %": round(100 * b[0], 1), "ci": f"±{196 * np.sqrt(V[0, 0]):.1f}", "target %": 25,
                     "mean HL/sigma": round(g.ratio.mean(), 3), "sessions": len(g), "dates": G,
                     "per-year exceed %": {yr: round(100 * gg.exc.mean(), 1) for yr, gg in g.groupby(g.date.str[:4])}})
    return pd.DataFrame(rows).set_index("weekday").loc[WD].reset_index()


def main():
    x = load()
    print("loaded", len(x), "test rows", int(x.test.sum()))
    T, preds = family_T(x)
    print("T done")
    H2 = family_H2(pd.read_parquet(OUT / "carry_races.parquet"))
    H4, h4tabs = family_H4(x, preds)
    X, evcodes = family_X(x, preds)
    D = family_D(x)
    tabs = descriptive(x, preds)
    DW = daily_weekday(x)
    write(T, H2, H4, h4tabs, X, evcodes, D, tabs, DW, x)


def write(T, H2, H4, h4tabs, X, evcodes, D, tabs, DW, x):
    md = ["# IEP-TIME results (test block 2022-2024, out-of-sample export lines)", "",
          f"Rows in the test block: {int(x.test.sum()):,} ({x[x.test].date.nunique()} dates, {x.inst.nunique()} instruments). Registration: forge/IEP_TIME_PREREG.md.", "",
          "## Family T — does hour / session / weekday add to the existing model (M0)? Brier and log-loss skill over M0, % (block-bootstrap 95% CI); Holm over 12", "```"]
    rows = []
    for o, r in T.items():
        for k in ("hour", "session", "weekday"):
            s = r[k]
            rows.append({"outcome": o, "adds": k, "n_test": r["n_test"], "brier_skill%": s["brier"], "ci": s["brier_ci"], "ll_skill%": s["logloss"], "ll_ci": s["logloss_ci"],
                         "p_holm": s["p_holm"], "credited": s["credited"], "M0 calib gap": r["M0_calib_gap_pp"], "calib gap": s["calib_gap_pp"],
                         "by year": s["by_year_brier"], "excl DST-mismatch": s["brier_excl_dst_mismatch"]})
    md += [pd.DataFrame(rows).to_string(index=False), "```", "", "By class (Brier skill over M0, %):", "```"]
    md += [pd.DataFrame({f"{o}+{k}": T[o][k]["by_class_brier"] for o in T for k in ("hour", "session", "weekday")}).T.to_string(), "```", ""]
    md += ["## Family H2 — session carry: real Asia/London extremes vs placebo levels (continuation beyond 0.25σ vs back 0.25σ, after the first touch); Holm over 8",
           "```", H2.drop(columns=["p"]).to_string(index=False), "```", ""]
    md += ["## Family H4 — GOLD band read re-examined (Holm over 4)", "```", json.dumps(H4, indent=1, default=str), "```", ""]
    for k, t in h4tabs.items():
        md += [f"### {k}", "```", t.to_string(index=not isinstance(t.index, pd.RangeIndex)), "```", ""]
    md += ["## Family X — interactions on the residual after M0 (BH-FDR 10% over 7)", f"event codes present: {evcodes}", "```", X.round(4).to_string(index=False), "```", ""]
    md += ["## Family D — New York clock vs London clock on overlap/NY rows (h 12-18); positive skill = NY coding better", "```", json.dumps(D, indent=1), "```", ""]
    md += ["## Daily: export HL p75 exceedance by weekday (descriptive confirmation of reused results)", "```", DW.to_string(index=False), "```", ""]
    md += ["## Descriptive tables (test block): conditional probability vs M0-matched and unconditional baselines"]
    for k, t in tabs.items():
        md += [f"### {k}", "```", t.to_string(index=not isinstance(t.index, pd.RangeIndex)), "```", ""]
    (SUM / "TIME.md").write_text("\n".join(md), encoding="utf-8")
    (SUM / "time.json").write_text(json.dumps({"T": T, "H2": H2.to_dict("records"), "H4": H4, "X": X.to_dict("records"), "D": D}, indent=1, default=str), encoding="utf-8")
    print("\n".join(md).encode("ascii", "replace").decode()[:20000])


if __name__ == "__main__":
    main()
