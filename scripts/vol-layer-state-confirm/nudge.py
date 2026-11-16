"""vol-layer-state-confirm, cell B (-nudge): do HAR-month and HARQ terms beat S+RV on pinball?
Prereg: forge/VOL_LAYER_STATE_CONFIRM_PREREG.md. Same rows, folds, widths and pinball as forecast_pick.py and
scripts/vol-layer/rv5_increment.py (--live --livetype).

  SR  = chosen persistence form (F.FB) + rv1 + rv5m                     (rv5_increment arm SR)
  SRH = SR + rv22m + hq
        rv22m = mean of rv1 over the previous 22 sessions (>= 15)
        hq    = rv1 x (q_{t-1} - expanding mean of q through t-2), q = log(sqrt(RQ) / RV) of a session (build.py, forge/rv.py grid)

    python -X utf8 scripts/vol-layer-state-confirm/nudge.py --window discovery   -> discovery/step0_nudge.json
    python -X utf8 scripts/vol-layer-state-confirm/nudge.py --window confirm     -> confirm/nudge.json (refuses unless step 0 passed)
Runs with cwd = DATA_ROOT (the forecast loaders use relative paths); writes only under the worktree.
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

WT = Path(__file__).resolve().parents[2]
DATA_ROOT = Path("c:/Users/relli/OneDrive/Documents/Programming/Trading/v2 trading model/MacroFXModel")
os.chdir(DATA_ROOT)
sys.path[:0] = [str(WT), str(WT / "scripts/forecast_history"), str(WT / "scripts/vol-layer-deep")]
sys.argv += ["--live", "--livetype"]
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import forecast_record as FR  # noqa: E402

FR.SEED = 20261116
import forecast_pick as P  # noqa: E402
import state as ST  # noqa: E402

F = P.F
OUT = WT / "analysis/output/vol-layer-state-confirm"
SESS = OUT / "build/sessions.parquet"
CHOSEN = DATA_ROOT / "analysis/output/line_reaction/chosen_lines.csv"
SEED = 20261116
RV = ["rv1", "rv5m"]
H = ["rv22m", "hq"]
N_PLACEBO = 200
DISC_END = "2022-12-30"
CONF_START, CONF_END = "2023-01-01", "2026-08-20"


def month_shuffle(X, col, rng):
    out = X[col].to_numpy().copy()
    res = np.full(len(X), np.nan)
    for _, g in X.groupby("inst", sort=False):
        ix = g.index.to_numpy()
        months = g.date.str[:7].to_numpy()
        um, inv = np.unique(months, return_inverse=True)
        perm = rng.permutation(len(um))
        for k in range(len(um)):
            tgt = ix[inv == k]
            src = out[ix[inv == perm[k]]]
            res[tgt] = np.resize(src, len(tgt))
    return res


def load(window):
    X = P.load()
    X = X[X.date <= (DISC_END if window == "discovery" else CONF_END)]
    X = X.sort_values(["inst", "date"]).reset_index(drop=True)
    sd = np.sqrt(X.rv5.clip(lower=1e-10))
    X["_rv"] = np.log(sd / X.live_sig_daily)
    g = X.groupby("inst")
    X["rv1"] = g["_rv"].shift(1)
    X["rv5m"] = X.groupby("inst")["rv1"].transform(lambda s: s.rolling(5, min_periods=3).mean())
    X["rv22m"] = X.groupby("inst")["rv1"].transform(lambda s: s.rolling(22, min_periods=15).mean())
    S = pd.read_parquet(SESS, columns=["inst", "date", "rq", "rv", "har1", "garch", "garch_vt", "rv5", "hl"])
    S = S[S.date <= X.date.max()].sort_values(["inst", "date"])
    S["q"] = np.log(np.sqrt(S.rq) / S.rv)
    S["q_prev"] = S.groupby("inst").q.shift(1)
    S["q_bar"] = S.groupby("inst").q.transform(lambda s: s.expanding().mean().shift(2))
    X = X.merge(S[["inst", "date", "q_prev", "q_bar", "har1", "garch", "garch_vt"]].rename(columns={"har1": "b_har1"}), on=["inst", "date"], how="left")
    X["hq"] = X.rv1 * (X.q_prev - X.q_bar)
    X["lhar"] = np.log(np.sqrt(X.b_har1) / X.live_sig_daily)            # per-instrument log-HAR forecast as a nudge term (described)
    C = pd.read_csv(CHOSEN, usecols=["inst", "date", "sig"]).rename(columns={"sig": "c_sig"})
    X = X.merge(C, on=["inst", "date"], how="left")
    e = 0.5 * np.log(X.rv5.clip(lower=1e-10)) - np.log(X.c_sig)
    lam = 0.5 ** (1 / 10)

    def f5c(s):
        s2 = s.dropna()
        return (s2.ewm(alpha=1 - lam, adjust=True).mean().shift(1) - s2.expanding(20).mean().shift(1)).reindex(s.index)
    X["e_c"] = e
    X["F5c"] = X.groupby("inst").e_c.transform(f5c)
    for c in H:
        X[f"{c}_l1"] = X.groupby("inst")[c].shift(1)
    return X.sort_values(["date", "inst"]).reset_index(drop=True)


def fit_folds(X, arms, folds, rolling=False, test_from=None, verbose=False):
    rows = []
    for f in folds:
        te = X[(X.oos == 1) & (X.fold == f)].copy()
        prior = np.sort(X.loc[X.date < te.date.min(), "date"].unique())
        tr = X[X.date < prior[-F.EMBARGO]].copy()
        if rolling:
            lo = (pd.Timestamp(te.date.min()) - pd.DateOffset(years=3)).strftime("%Y-%m-%d")
            tr = tr[tr.date >= lo].copy()
        if test_from:
            te = te[te.date >= test_from].copy()
        for arm, feats in arms.items():
            tr[f"sig_{arm}"], te[f"sig_{arm}"] = np.nan, np.nan
            for cls in sorted(X.klass.unique()):
                trc = tr[(tr.klass == cls) & tr[feats].notna().all(axis=1)]
                mk = (te.klass == cls) & te[feats].notna().all(axis=1) & te.inst.isin(trc.inst.unique())
                if len(trc) < 500 or not mk.any():
                    continue
                b, mu = F.fit_beta(trc, feats)
                tr.loc[trc.index, f"sig_{arm}"] = F.apply_beta(trc, feats, b, mu)
                te.loc[mk, f"sig_{arm}"] = F.apply_beta(te[mk], feats, b, mu)
            ok = tr[f"sig_{arm}"].notna() & (tr[f"sig_{arm}"] > 0)
            w = F.widths(tr.loc[ok, f"sig_{arm}"].to_numpy(), tr[ok])
            for q, r in F.CELLS:
                te[f"{arm}_{q}_{r}"] = te[f"sig_{arm}"] * w[(q, r)].reindex(te.inst).to_numpy()
            # range^2 QLIKE scale: per instrument training mean of r_hl^2 / sig^2
            k = (tr.loc[ok, "r_hl"] ** 2 / tr.loc[ok, f"sig_{arm}"] ** 2).groupby(tr.loc[ok, "inst"]).mean()
            te[f"{arm}_h2"] = te[f"sig_{arm}"] ** 2 * k.reindex(te.inst).to_numpy()
        if verbose:
            print(f"fold {f}: train {len(tr):,}, test {len(te):,}", flush=True)
        rows.append(te)
    T = pd.concat(rows, ignore_index=True)
    T["regime_b"] = np.select([T.regime < np.log(0.85), T.regime > np.log(1.15)], ["quiet", "busy"], "normal")
    return T


def losses(T, arms):
    sig = T[F.BASE].to_numpy()
    return {a: sum(P.pinball(T[F.Q[q]].to_numpy(), T[f"{a}_{q}_{r}"].to_numpy(), F.R[r]) / sig for q, r in F.CELLS) for a in arms}


def qlike(T, a):
    z = T.r_hl.to_numpy() ** 2 / T[f"{a}_h2"].to_numpy()
    z = np.where(z > 0, z, np.nan)
    return z - np.log(z) - 1


def board(T, L, new, old, mask=None, W=None):
    m = np.isfinite(L[new]) & np.isfinite(L[old])
    if mask is not None:
        m &= mask
    dates = np.sort(T.date[m].unique())
    di = pd.Series(np.arange(len(dates)), index=dates)[T.date[m]].to_numpy()
    if W is None or W.shape[1] != len(dates):
        W = FR.boot_weights(len(dates))
    a = np.bincount(di, weights=L[new][m], minlength=len(dates))
    b = np.bincount(di, weights=L[old][m], minlength=len(dates))
    reps = (W @ a) / (W @ b)
    ratio = float(a.sum() / b.sum())
    ql_n, ql_o = qlike(T, new), qlike(T, old)
    mq = m & np.isfinite(ql_n) & np.isfinite(ql_o)
    cls = {c: float(L[new][m & (T.klass == c).to_numpy()].sum() / L[old][m & (T.klass == c).to_numpy()].sum()) for c in sorted(T.klass[m].unique())}

    def miss(arm):
        vals = {}
        for gname in ("quiet", "normal", "busy"):
            k = m & (T.regime_b == gname).to_numpy()
            vals[gname] = float((T.r_hl[k] > T[f"{arm}_hl_p75"][k]).mean())
        return vals, max(abs(v - 0.25) for v in vals.values())
    mn, mo = miss(new), miss(old)
    ci = [float(x) for x in np.percentile(reps, [2.5, 97.5])]
    out = {"rows": int(m.sum()), "dates": int(len(dates)), "ratio": ratio, "lo": ci[0], "hi": ci[1], "se": float(reps.std()),
           "p_one_sided": float(max(1 / (len(reps) + 1), (reps >= 1).mean())),
           "qlike_range2_ratio": float(np.nansum(ql_n[mq]) / np.nansum(ql_o[mq])),
           "by_class": cls, "regime_hl_p75_new": mn[0], "regime_hl_p75_old": mo[0], "regime_miss_new": mn[1], "regime_miss_old": mo[1],
           "by_fold": {int(f): float(L[new][m & (T.fold == f).to_numpy()].sum() / L[old][m & (T.fold == f).to_numpy()].sum()) for f in sorted(T.fold[m].unique())},
           "by_year": {y: float(L[new][m & (T.date.str[:4] == y).to_numpy()].sum() / L[old][m & (T.date.str[:4] == y).to_numpy()].sum()) for y in sorted(T.date[m].str[:4].unique())},
           "by_inst": {i: float(L[new][m & (T.inst == i).to_numpy()].sum() / L[old][m & (T.inst == i).to_numpy()].sum()) for i in sorted(T.inst[m].unique())}}
    return out


ARMS = {"SR": F.FB + RV, "SRH": F.FB + RV + H, "SIR": F.FC + RV, "SIRH": F.FC + RV + H}
ARMS_S = {"S": F.FB, "SR": F.FB + RV}


def discovery():
    X = load("discovery")
    assert X.date.max() <= DISC_END
    out = {}
    T = fit_folds(X, ARMS_S, [0, 1], verbose=True)
    L = losses(T, ARMS_S)
    rs = board(T, L, "SR", "S")
    out["repro_SR_vs_S_by_fold"] = rs["by_fold"]
    out["repro_target"] = {0: 0.9877, 1: 0.9862}
    out["repro_pass"] = bool(round(rs["by_fold"][0], 4) == 0.9877 and round(rs["by_fold"][1], 4) == 0.9862)
    # power re-check: SRH / SR on discovery folds
    T = fit_folds(X, {"SR": ARMS["SR"], "SRH": ARMS["SRH"]}, [0, 1])
    L = losses(T, ["SR", "SRH"])
    b = board(T, L, "SRH", "SR")
    se_c = b["se"] * np.sqrt(b["dates"] / 940)
    mde = 3.168 * se_c                                           # one-sided alpha 0.01, 80% power (z 2.326 + 0.842)
    out["power"] = {"disc_ratio": b["ratio"], "disc_ci": [b["lo"], b["hi"]], "disc_se": b["se"], "disc_dates": b["dates"],
                    "se_confirm": float(se_c), "mde_alpha01": float(mde), "mde_alpha05": float(2.487 * se_c),
                    "status": "POWERED" if mde <= 0.005 else "UNDERPOWERED"}
    # plants: weak leak in rv22m (today's realised vol), month-shuffled terms
    rng = np.random.default_rng(SEED)
    pl = {}
    for k in (0.06, 0.10, 0.15, 0.20, 0.30):
        Z = X.copy()
        Z["rv22m"] = Z.rv22m + k * Z._rv
        Tz = fit_folds(Z, {"SR": ARMS["SR"], "SRH": ARMS["SRH"]}, [0, 1])
        bz = board(Tz, losses(Tz, ["SR", "SRH"]), "SRH", "SR")
        pl[f"weak_{k}"] = {"ratio": bz["ratio"], "lo": bz["lo"], "hi": bz["hi"]}
    best = min(pl.values(), key=lambda v: abs(v["ratio"] - 0.995))
    pl["weak_pass"] = bool(best["hi"] < 1 and 0.985 <= best["ratio"] <= 0.9985)
    Z = X.copy()
    for c in H:
        Z[c] = month_shuffle(Z, c, rng)
    Tz = fit_folds(Z, {"SR": ARMS["SR"], "SRH": ARMS["SRH"]}, [0, 1])
    bz = board(Tz, losses(Tz, ["SR", "SRH"]), "SRH", "SR")
    pl["shuffle"] = {"ratio": bz["ratio"], "lo": bz["lo"], "hi": bz["hi"], "pass": bool(abs(bz["ratio"] - 1) <= 0.001)}
    out["plants"] = pl
    out["pass"] = bool(out["repro_pass"] and pl["weak_pass"] and pl["shuffle"]["pass"])
    (OUT / "discovery").mkdir(parents=True, exist_ok=True)
    (OUT / "discovery/step0_nudge.json").write_text(json.dumps(out, indent=1, default=float), encoding="utf-8")
    print(json.dumps(out, indent=1, default=float))


def confirm():
    s0 = json.loads((OUT / "discovery/step0.json").read_text())
    if not s0.get("pass"):
        raise SystemExit("step 0 has not passed: confirm refused")
    t0 = time.time()
    X = load("confirm")
    folds = [2, 3, 4, 5]
    res = {}
    arms = {**ARMS, "SR_rv22m": F.FB + RV + ["rv22m"], "SR_hq": F.FB + RV + ["hq"], "SR_lhar": F.FB + RV + ["lhar"],
            "SR_F5c": F.FB + RV + ["F5c"]}
    T = fit_folds(X, arms, folds, test_from=CONF_START, verbose=True)
    assert T.date.min() >= CONF_START and T.date.max() <= CONF_END
    L = losses(T, arms)
    base = board(T, L, "SRH", "SR")
    W = FR.boot_weights(base["dates"])
    res["base"] = base
    (OUT / "confirm").mkdir(parents=True, exist_ok=True)
    pd.DataFrame({"inst": T.inst, "date": T.date, "klass": T.klass, "fold": T.fold, "L_SR": L["SR"], "L_SRH": L["SRH"]}).to_parquet(OUT / "confirm/nudge_losses.parquet", index=False)
    iv = T.iv_sig.notna().to_numpy()
    res["neighbour_iv13"] = board(T, L, "SIRH", "SIR", mask=iv)
    res["described"] = {nm: board(T, L, nm, "SR") for nm in ("SR_rv22m", "SR_hq", "SR_lhar", "SR_F5c")}
    print("base", base["ratio"], base["lo"], base["hi"], f"{time.time() - t0:.0f}s", flush=True)
    # block 60 sensitivity
    FR_BLOCK = FR.BLOCK
    FR.BLOCK = 60
    W60 = FR.boot_weights(base["dates"])
    FR.BLOCK = FR_BLOCK
    b60 = board(T, L, "SRH", "SR", W=W60)
    res["block60"] = {"ratio": b60["ratio"], "lo": b60["lo"], "hi": b60["hi"], "p_one_sided": b60["p_one_sided"]}
    # rolling 3-year fit window
    Tr = fit_folds(X, {"SR": ARMS["SR"], "SRH": ARMS["SRH"]}, folds, rolling=True, test_from=CONF_START)
    res["neighbour_rolling3y"] = board(Tr, losses(Tr, ["SR", "SRH"]), "SRH", "SR")
    # +1 lag: both new terms one session older
    Xl = X.copy()
    for c in H:
        Xl[c] = Xl[f"{c}_l1"]
    Tl = fit_folds(Xl, {"SR": ARMS["SR"], "SRH": ARMS["SRH"]}, folds, test_from=CONF_START)
    res["lag1"] = board(Tl, losses(Tl, ["SR", "SRH"]), "SRH", "SR")
    print("neighbours done", f"{time.time() - t0:.0f}s", flush=True)
    # placebo: the two new terms shuffled in calendar-month blocks, 200 draws
    pv = []
    for k in range(N_PLACEBO):
        rng = np.random.default_rng(SEED + k)
        Z = X.copy()
        for c in H:
            Z[c] = month_shuffle(Z, c, rng)
        Tz = fit_folds(Z, {"SR": ARMS["SR"], "SRH": ARMS["SRH"]}, folds, test_from=CONF_START)
        Lz = losses(Tz, ["SR", "SRH"])
        m = np.isfinite(Lz["SR"]) & np.isfinite(Lz["SRH"])
        pv.append(float(Lz["SRH"][m].sum() / Lz["SR"][m].sum()))
        if k == 0:
            bz = board(Tz, Lz, "SRH", "SR")
            res["shuffle_draw0"] = {"ratio": bz["ratio"], "lo": bz["lo"], "hi": bz["hi"]}
        if k % 20 == 0:
            print("placebo", k, pv[-1], f"{time.time() - t0:.0f}s", flush=True)
    pv = np.array(pv)
    res["placebo"] = {"n": len(pv), "p025": float(np.percentile(pv, 2.5)), "mean": float(pv.mean()), "p975": float(np.percentile(pv, 97.5))}
    res["race"] = race(X, T)
    (OUT / "confirm").mkdir(parents=True, exist_ok=True)
    (OUT / "confirm/nudge.json").write_text(json.dumps(res, indent=1, default=float), encoding="utf-8")
    print("done", f"{time.time() - t0:.0f}s")


def race(X, T):
    """Standalone QLIKE race (described): each forecast scaled by a past-only expanding mean of target / forecast,
    on RV5 and on range^2, scored on the confirm test rows; ratios to the chosen sigma."""
    S = pd.read_parquet(SESS, columns=["inst", "date", "rv5", "hl", "rq", "rv", "lrv", "har1", "garch", "garch_vt", "sig"])
    S = S[S.date <= CONF_END].sort_values(["inst", "date"]).reset_index(drop=True)
    S["klass"] = S.inst.map(FR.klass)
    # HARQ and class-panel log-HAR, quarterly expanding refits (state.py conventions)
    S["harq"], S["phar"] = np.nan, np.nan
    S["q"] = np.log(np.sqrt(S.rq) / S.rv)
    parts = {}
    for inst, g in S.groupby("inst", sort=False):
        Xh = ST.har_design(g.lrv.to_numpy())
        qd = g.q.shift(1) - g.q.expanding().mean().shift(2)
        Xq = np.column_stack([Xh, Xh[:, 1] * qd.to_numpy()])
        parts[inst] = (g.index.to_numpy(), Xh, Xq, g.lrv.to_numpy(), ST.quarter_starts(g.date), g.date.to_numpy())
    allq = np.unique(np.concatenate([p[4] for p in parts.values()]))
    for qs in allq:
        if qs < "2018-01-01":
            continue
        cls_rows = {}
        for inst, (ix, Xh, Xq, y, q, d) in parts.items():
            tr = np.flatnonzero(d < qs)
            te = np.flatnonzero(q == qs)
            if len(tr) < ST.MIN_FIT or not len(te):
                continue
            b, s2 = ST.har_fit(Xq[tr], y[tr])
            S.loc[ix[te], "harq"] = np.exp(Xq[te] @ b + 0.5 * s2)
            cls_rows.setdefault(FR.klass(inst), []).append((inst, ix, Xh, y, tr, te))
        for cls, items in cls_rows.items():
            Zs, ys, mus = [], [], {}
            for inst, ix, Xh, y, tr, te in items:
                ok = np.isfinite(Xh[tr]).all(1) & np.isfinite(y[tr])
                mx, my = Xh[tr][ok][:, 1:].mean(0), y[tr][ok].mean()
                mus[inst] = (mx, my)
                Zs.append(Xh[tr][ok][:, 1:] - mx)
                ys.append(y[tr][ok] - my)
            Z, yy = np.vstack(Zs), np.concatenate(ys)
            b = np.linalg.lstsq(Z, yy, rcond=None)[0]
            s2 = float((yy - Z @ b).var())
            for inst, ix, Xh, y, tr, te in items:
                mx, my = mus[inst]
                S.loc[ix[te], "phar"] = np.exp(my + (Xh[te][:, 1:] - mx) @ b + 0.5 * s2)
    C = pd.read_csv(CHOSEN, usecols=["inst", "date", "sig"]).rename(columns={"sig": "c_sig"})
    S = S.merge(C, on=["inst", "date"], how="left")
    S = S.merge(T[["inst", "date", "sig_SR", "sig_SRH"]], on=["inst", "date"], how="left")
    S["hl2"] = S.hl ** 2
    S = S.sort_values(["inst", "date"]).reset_index(drop=True)
    cand = {"live": S.sig ** 2, "chosen": S.c_sig ** 2, "S+RV": S.sig_SR ** 2, "S+RV+H": S.sig_SRH ** 2, "garch": S.garch,
            "garch_vt": S.garch_vt, "log_har": S.har1, "harq": S.harq, "panel_log_har": S.phar}
    out = {}
    for tgt in ("rv5", "hl2"):
        Lq = {}
        for nm, f in cand.items():
            z = S[tgt] / f
            sc = z.groupby(S.inst).transform(lambda s: s.expanding(60).mean().shift(1))
            h = f * sc
            zz = S[tgt] / h
            Lq[nm] = zz - np.log(zz) - 1
        m = (S.date >= CONF_START) & (S.date <= CONF_END)
        for v in Lq.values():
            m &= np.isfinite(v)
        out[tgt] = {"rows": int(m.sum()), "ratio_to_chosen": {nm: float(v[m].sum() / Lq["chosen"][m].sum()) for nm, v in Lq.items()}}
    return out


if __name__ == "__main__":
    w = sys.argv[sys.argv.index("--window") + 1]
    discovery() if w == "discovery" else confirm()
