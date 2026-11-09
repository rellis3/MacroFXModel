"""jump-after (forge/JUMP_AFTER_PREREG.md): after-jump path, stop-through and intensity.

    python scripts/jump-after/run.py --stage build     # detector on all instruments; audit counts only, no outcomes
    python scripts/jump-after/run.py --stage analyse   # scored cells, RESULTS.md
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "scripts/forecast_history"), str(ROOT / "scripts/vol-layer")]
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import jumps as JP  # noqa: E402
import line_reaction as LR  # noqa: E402
from forecast_record import klass  # noqa: E402
from forge import jump_lm as J  # noqa: E402
from forge import vol_state_hist as S  # noqa: E402
from reaction import slot_panel  # noqa: E402

OUT = ROOT / "analysis/output/jump-after"
HIST = ROOT / "analysis/output/forecast_history"
BA = ROOT / "data/m1_bidask"
BA_KEY = {"DE30": "dax", "SPX500": "spx", "DOW": "dow", "GOLD": "gold", "NQ": "nq", "UK100": "uk100", "US2000": "us2000"}
HORIZONS = {"m5": 1, "m15": 3, "m30": 6, "m60": 12, "m240": 48}
HALF = "2021-08-20"
ALLOWED = {"USD", "EUR", "GBP"}


def spread_panel(sym, dates):
    """Sessions x slots: last ask_c minus bid_c in each slot. NaN before bid/ask history starts."""
    df = pd.read_parquet(BA / f"{BA_KEY.get(sym, sym.lower())}_m1.parquet", columns=["time", "bid_c", "ask_c"])
    idx = pd.DatetimeIndex(pd.to_datetime(df["time"], utc=True)).tz_convert("Europe/London")
    mins = (idx.hour * 60 + idx.minute).to_numpy()
    pos = pd.Series(np.arange(len(dates)), index=dates)
    di = pos.reindex(idx.strftime("%Y-%m-%d")).to_numpy()
    keep = (mins < 22 * 60) & np.isfinite(di)
    d, s = di[keep].astype(int), mins[keep] // 5
    sp = (df["ask_c"] - df["bid_c"]).to_numpy(float)[keep]
    o = np.argsort(idx.asi8[keep], kind="stable")
    P = np.full((len(dates), J.N_SLOT), np.nan)
    P[d[o], s[o]] = sp[o]
    return P


def build_one(sym, ccy, rel_by_day, cal_end):
    d = pd.read_csv(HIST / f"{sym}.csv", usecols=["date", "open", "live_sig_used", "live_sig_daily", "event", "rv5", "bv5", "max_r5", "gap", "jump_share"]).sort_values("date").reset_index(drop=True)
    C, _, _ = slot_panel(sym, d.date.tolist())
    Sp = spread_panel(sym, d.date.tolist())
    D = J.detect(C)
    F = pd.DataFrame(C).ffill(axis=1).to_numpy()              # exits only: the last known close at the horizon
    sig = d.live_sig_used.to_numpy() / 100
    # A1: on real returns the Gumbel value flags about half of sessions, so the limit comes from each instrument's own
    # past: the 88th percentile of its session max |L| over the previous 500 sessions. Uses flag rates only, no outcomes.
    absL = np.abs(D["L"])
    has = np.isfinite(absL).any(axis=1)
    mx = np.full(len(d), np.nan)
    mx[has] = np.nanmax(absL[has], axis=1)
    crit_i = pd.Series(mx).rolling(500, min_periods=250).quantile(0.88).shift(1).to_numpy()
    with np.errstate(invalid="ignore"):
        flag = absL > crit_i[:, None]
    # A2: the main read ("x") takes the first burst between 01:00 and 21:00 London; "all" is the A1 read with the rollover
    in_x = np.zeros(J.N_SLOT, bool)
    in_x[12:252] = True
    firsts = {"all": J.first_flags(flag), "x": J.first_flags(flag & in_x[None, :])}
    # A2 proof: a copy of the tape where every close after the burst bar moves by sign x delta x sigma
    plants = {}
    for ver, first in firsts.items():
        for nm, dl in (("min", 0.03), ("large", 0.20)):
            P = F.copy()
            for i in np.flatnonzero(first >= 0):
                s = first[i]
                P[i, s + 1:] *= np.exp(np.sign(D["r"][i, s]) * dl * sig[i])
            plants[(ver, nm)] = P
    rows = []

    def rec(i, s, kind, ver):
        sign = np.sign(D["r"][i, s])
        out = {"inst": sym, "date": d.date[i], "slot": int(s), "kind": kind, "ver": ver, "sign": int(sign), "L": float(D["L"][i, s]), "size": float(abs(D["r"][i, s]) / sig[i]),
               "hour": int(s * 5 // 60), "spread0": float(Sp[i, s] / F[i, s]) if np.isfinite(Sp[i, s]) else np.nan}
        for name, h in HORIZONS.items():
            e = s + h
            if e < J.N_SLOT and np.isfinite(F[i, e]):
                out[name] = float(sign * np.log(F[i, e] / F[i, s]) / sig[i])
                out[f"sp_{name}"] = float(Sp[i, e] / F[i, e]) if np.isfinite(Sp[i, e]) else np.nan
            else:
                out[name], out[f"sp_{name}"] = np.nan, np.nan
        e = s + HORIZONS["m60"]
        for nm in ("min", "large"):
            P = plants[(ver, nm)]
            out[f"pl_{nm}"] = float(sign * np.log(P[i, e] / P[i, s]) / sig[i]) if kind == "flag" and e < J.N_SLOT and np.isfinite(P[i, e]) else np.nan
        return out

    scheds = {}
    for ver, first in firsts.items():
        fl_sched = np.full(len(d), np.nan)
        for i in range(len(d)):
            s = first[i]
            if s >= 0:
                rows.append(rec(i, s, "flag", ver))
                if d.date[i] <= cal_end:
                    st = s * 5
                    fl_sched[i] = 0.0
                    if d.date[i] in rel_by_day.groups:
                        g = rel_by_day.get_group(d.date[i])
                        g = g[g.ccy.isin(ccy)]
                        fl_sched[i] = float(((st >= g.minute - 5) & (st <= g.minute + 15)).any())
                rows[-1]["sched"] = fl_sched[i]
            L = np.abs(D["L"][i])
            lim = s if s >= 0 else J.N_SLOT
            if not np.isfinite(crit_i[i]):
                continue
            ok = (L[:lim] >= 3) & (L[:lim] < crit_i[i])
            if ver == "x":
                ok &= in_x[:lim]
            cand = np.flatnonzero(ok)
            if cand.size:
                rows.append(rec(i, int(cand[0]), "control", ver))
                rows[-1]["sched"] = np.nan
        scheds[ver] = fl_sched
    ev = pd.DataFrame(rows)
    # session frame: outcomes for Q2/Q3 and pre-open features. Main read = x; the A1 read is kept with an _all suffix.
    sd = d.live_sig_daily
    big = np.maximum(d.max_r5.abs().to_numpy(), d.gap.abs().fillna(0).to_numpy()) / d.live_sig_used.to_numpy()
    sess = pd.DataFrame({"inst": sym, "date": d.date, "event": d.event, "big": big,
                         "js20": d.jump_share.rolling(20, min_periods=10).mean().shift(1).to_numpy(),
                         "regime": np.log(sd / sd.shift(1).rolling(250, min_periods=120).median()).to_numpy()})
    for ver, sfx in (("x", ""), ("all", "_all")):
        flag_today = (firsts[ver] >= 0).astype(float)
        flag_today[~np.isfinite(crit_i)] = np.nan
        un = np.where(scheds[ver] == 0, 1.0, 0.0)
        sc = np.where(scheds[ver] == 1, 1.0, 0.0)
        un[np.isnan(flag_today)] = np.nan
        sc[np.isnan(flag_today)] = np.nan
        sess["flag" + sfx] = flag_today
        sess["lam_un" + sfx] = S.ewma_before(un, 20)
        sess["lam_sch" + sfx] = S.ewma_before(sc, 20)
        sess["flag_last" + sfx] = pd.Series(flag_today).shift(1).to_numpy()
    return ev, sess


def stage_build():
    OUT.mkdir(parents=True, exist_ok=True)
    syms = sorted(p.stem for p in HIST.glob("*.csv"))
    syms = [s for s in syms if (BA / f"{BA_KEY.get(s, s.lower())}_m1.parquet").exists()]
    ccy = JP.currencies(syms)
    rel = JP.releases()
    by = rel.groupby("date")
    cal_end = rel.date.max()
    evs, ss = [], []
    for s in syms:
        e, x = build_one(s, ccy[s], by, cal_end)
        evs.append(e)
        ss.append(x)
        fl = e[(e.kind == "flag") & (e.ver == "x")]
        print(f"{s}: {len(fl)} flags, {x.flag.mean() * 252:.1f}/yr, scheduled {fl.sched.mean():.2f}", flush=True)
    E, X = pd.concat(evs, ignore_index=True), pd.concat(ss, ignore_index=True)
    E.to_parquet(OUT / "events.parquet", index=False)
    X.to_parquet(OUT / "sessions.parquet", index=False)
    cov = sorted(i for i, c in ccy.items() if set(c) <= ALLOWED)
    fl = E[(E.kind == "flag") & (E.ver == "x")].assign(klass=lambda d: d.inst.map(klass))
    audit = {"flags": int(len(fl)), "instruments": len(syms), "covered": cov, "flags_covered": int(fl.inst.isin(cov).sum()),
             "sched_share_covered": float(fl[fl.inst.isin(cov)].sched.mean()), "by_class": fl.groupby("klass").size().to_dict(),
             "by_hour": fl.groupby("hour").size().to_dict(), "flags_per_instrument_year": float(X.groupby("inst").flag.mean().mean() * 252), "gumbel_crit": J.threshold()}
    (OUT / "audit.json").write_text(json.dumps(audit, indent=1, default=str))
    print(json.dumps(audit, indent=1, default=str))


def weights(a, r):
    ka = (a.inst + a.hour.astype(str)).to_numpy()
    kr = (r.inst + r.hour.astype(str)).to_numpy()
    return (pd.Series(kr).value_counts() / pd.Series(ka).value_counts()).reindex(ka).fillna(0.0).to_numpy()


def path_cell(bs, F, C, h):
    f, c = F[F[h].notna()], C[C[h].notna()]
    w = weights(c, f)
    k = w > 0
    c, w = c[k], w[k]
    fy = f[h].to_numpy()
    est, reps = bs.mean(f.date, fy)
    c_n, c_d = bs.sums(c.date, c[h].to_numpy() * w), bs.sums(c.date, w)
    f_n, f_d = bs.sums(f.date, fy), bs.sums(f.date, np.ones(len(f)))
    drep = (bs.W @ f_n) / (bs.W @ f_d) - (bs.W @ c_n) / (bs.W @ c_d)
    res = {"n": int(len(f)), "mean": est[0], "lo": est[1], "hi": est[2], "p_two": float(2 * min((reps <= 0).mean(), (reps >= 0).mean())),
           "control": round(float(c_n.sum() / c_d.sum()), 4), "vs_control": round(float(f_n.sum() / f_d.sum() - c_n.sum() / c_d.sum()), 4),
           "vs_lo": round(float(np.percentile(drep, 2.5)), 4), "vs_hi": round(float(np.percentile(drep, 97.5)), 4)}
    for nm, part in (("A", f[f.date <= HALF]), ("B", f[f.date > HALF])):
        res[f"half_{nm}"] = round(float(part[h].mean()), 4) if len(part) else None
    cost = f["cost_" + h].to_numpy()
    k2 = np.isfinite(cost)
    for nm, sign in (("follow", 1.0), ("fade", -1.0)):
        ci = bs.mean(f.date[k2], sign * fy[k2] - cost[k2])[0]
        res[f"{nm}_net"] = ci
    res["mean_cost"] = round(float(np.nanmean(cost)), 4)
    res["n_net"] = int(k2.sum())
    return res


def logit_cell(X, target_col, feats, bench, start_year=2019):
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    out = []
    years = sorted(int(y) for y in X.date.str[:4].unique() if int(y) >= start_year)
    for y in years:
        tr, te = X[X.date < f"{y}-01-01"], X[X.date.str[:4] == str(y)]
        tr, te = tr.dropna(subset=bench + feats + [target_col]), te.dropna(subset=bench + feats + [target_col])
        if len(tr) < 2000 or not len(te):
            continue
        m0 = make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000)).fit(tr[bench], tr[target_col])
        m1 = make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000)).fit(tr[bench + feats], tr[target_col])
        o = te[["date", target_col]].copy()
        o["p0"], o["p1"] = m0.predict_proba(te[bench])[:, 1], m1.predict_proba(te[bench + feats])[:, 1]
        out.append(o)
    return pd.concat(out, ignore_index=True)


def skill(bs, T, y):
    a, b = (T.p1 - T[y]) ** 2, (T.p0 - T[y]) ** 2
    ci, reps = bs.ratio(T.date, a.to_numpy(), T.date, b.to_numpy())
    gain = 1 - np.asarray(reps)
    return {"n": int(len(T)), "base": round(float(T[y].mean()), 4), "gain": round(1 - float(a.sum() / b.sum()), 5), "lo": round(float(np.percentile(gain, 2.5)), 5),
            "hi": round(float(np.percentile(gain, 97.5)), 5), "p": float((gain <= 0).mean())}


def holm(cells, key="p"):
    order = sorted(cells, key=lambda k: cells[k][key])
    prev = 0.0
    for i, k in enumerate(order):
        prev = max(prev, min(1.0, cells[k][key] * (len(order) - i)))
        cells[k]["p_holm"] = round(prev, 4)


NEWS_HOURS = range(7, 21)                                       # A2: the calendar can only see the news 07:00-21:00 London
PATH_MIN, GAIN_MIN = 0.03, 0.005


def path_family(bs, F, C, cov, h="m60"):
    """A2 scored cells. News cells: covered instruments, 07:00-21:00 London only."""
    nw = F.inst.isin(cov) & F.hour.isin(NEWS_HOURS)
    Cn = C[C.inst.isin(cov) & C.hour.isin(NEWS_HOURS)]
    cells = {"unscheduled": (F[nw & (F.sched == 0)], Cn), "scheduled": (F[nw & (F.sched == 1)], Cn), "all_34": (F, C),
             "common": (F[F.cojump >= 3], C), "own": (F[F.cojump < 3], C)}
    return cells, {k: path_cell(bs, f, c, h) for k, (f, c) in cells.items()}


def path_proof(bs, f, cell, rng):
    """verdict_gate input for one path cell: tape plants, random-direction shuffle, effect oriented by its own sign."""
    f = f[f.m60.notna()]
    sgn = 1.0 if cell["mean"] >= 0 else -1.0
    lo, hi = sorted((sgn * cell["lo"], sgn * cell["hi"]))
    pl = {}
    for nm, dl in (("min", 0.03), ("large", 0.20)):
        k = f[f"pl_{nm}"].notna()
        pl[nm] = {"injected": dl, "shift": round(float(f[f"pl_{nm}"][k].mean() - f.m60[k].mean()), 4)}
    # A3: one random sign per 5-minute moment (keeps cojumps together), 200 draws
    g = f.groupby(["date", "slot"]).ngroup().to_numpy()
    x = f.m60.to_numpy()
    means, hits = [], 0
    for _ in range(200):
        ci = bs.mean(f.date, x * rng.choice([-1.0, 1.0], g.max() + 1)[g])[0]
        means.append(ci[0])
        hits += (ci[1] > 0) or (ci[2] < 0)
    sh = [float(np.mean(means)), float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5))]
    return {"effect": sgn * cell["mean"], "lo": lo, "hi": hi, "min_effect": PATH_MIN, "diagnostics": {"ok": len(f) >= 200, "why": f"{len(f)} bursts"},
            "planted_large": pl["large"], "planted_min": pl["min"], "shuffle": {"lo": sh[1], "hi": sh[2], "mean": sh[0], "draws": 200, "false_positive_rate": hits / 200},
            "rows": {"used": int(len(f)), "dropped": int(cell["n"] - len(f))}}


def plant_target(X, bench, target, goal, rng):
    """A synthetic target from the in-sample benchmark probability plus a known random feature, sized to a true Brier gain."""
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    Z = X.dropna(subset=bench + [target]).copy()
    p0 = make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000)).fit(Z[bench], Z[target]).predict_proba(Z[bench])[:, 1]
    z, u = rng.normal(size=len(Z)), rng.random(len(Z))
    lg = np.log(p0 / (1 - p0))
    sc = (Z.date >= "2019-01-01").to_numpy()
    best = None
    for bb in np.linspace(0.05, 2.0, 40):
        pt = 1 / (1 + np.exp(-(lg + bb * z)))
        y = (u < pt).astype(float)
        inj = 1 - ((pt - y) ** 2)[sc].mean() / ((p0 - y) ** 2)[sc].mean()
        if best is None or abs(inj - goal) < abs(best[1] - goal):
            best = (bb, inj, y)
    Z["plant"], Z["y_syn"] = z, best[2]
    return Z, float(best[1])


def gain_family(bs, X, bench, feats, flag_col, rng, proofs=True):
    """Stop-through d = 0.25/0.5/1 and intensity, each with its verdict_gate input."""
    out, checks = {}, {}
    for k in ("d0.25", "d0.5", "d1.0", "flag_today"):
        Xy = X.copy()
        if k == "flag_today":
            tcol = flag_col
        else:
            tcol = "y"
            Xy["y"] = (Xy.big >= float(k[1:])).astype(float)
        out[k] = skill(bs, logit_cell(Xy, tcol, feats, bench), tcol)
        if not proofs:
            continue
        pls = {}
        for nm, goal in (("min", 0.005), ("large", 0.05)):
            Z, inj = plant_target(Xy, bench, tcol, goal, rng)
            g = skill(bs, logit_cell(Z, "y_syn", feats + ["plant"], bench), "y_syn")
            pls[nm] = {"injected": round(inj, 5), "shift": g["gain"]}
        Xs = Xy.copy()
        perm = rng.permutation(len(Xs))
        Xs[feats] = Xs[feats].to_numpy()[perm]
        g = skill(bs, logit_cell(Xs, tcol, feats, bench), tcol)
        c = out[k]
        checks[k] = {"effect": c["gain"], "lo": c["lo"], "hi": c["hi"], "min_effect": GAIN_MIN,
                     "diagnostics": {"ok": c["n"] > 10000 and 0.01 < c["base"] < 0.99, "why": f"n {c['n']}, base {c['base']}"},
                     "planted_large": pls["large"], "planted_min": pls["min"], "shuffle": {"lo": g["lo"], "hi": g["hi"], "mean": g["gain"], "one_sided": True},
                     "rows": {"used": c["n"], "dropped": int(len(X) - c["n"])}}
    return out, checks


def thirds(F):
    q = F["size"].quantile([1 / 3, 2 / 3]).to_numpy()
    lab = np.where(F["size"] <= q[0], "small", np.where(F["size"] <= q[1], "medium", "large"))
    return lab, [round(float(v), 3) for v in q]


def stage_analyse():
    from forge import verdict_gate as G
    E = pd.read_parquet(OUT / "events.parquet")
    X = pd.read_parquet(OUT / "sessions.parquet")
    audit = json.loads((OUT / "audit.json").read_text())
    cov = audit["covered"]
    bs = LR.Boot(X.date)
    rng = np.random.default_rng(20261108)
    E["klass"] = E.inst.map(klass)
    sig = {}
    for s in E.inst.unique():
        d = pd.read_csv(HIST / f"{s}.csv", usecols=["date", "live_sig_used"])
        sig[s] = d.set_index("date").live_sig_used / 100
    E["sg"] = [sig[i].get(d, np.nan) for i, d in zip(E.inst, E.date)]
    for h in HORIZONS:
        E[f"cost_{h}"] = 0.5 * (E[f"sp_{h}"] + E.spread0) / E.sg
    fl = E.kind == "flag"
    E.loc[fl, "cojump"] = E[fl].groupby(["ver", "date", "slot"]).inst.transform("size")
    res = {"id": "jump-after", "seed": 20261107, "B": 2000, "ranAt": pd.Timestamp.now("UTC").isoformat(), "prereg": "forge/JUMP_AFTER_PREREG.md",
           "amendments": ["A1", "A2"], "audit": audit, "reads": {}, "descriptive": {}}
    checks = {}
    for ver in ("x", "all"):
        F, C = E[fl & (E.ver == ver)], E[(E.kind == "control") & (E.ver == ver)]
        cells, path = path_family(bs, F, C, cov)
        holm(path, "p_two")
        r = {"n_flags": int(len(F)), "events": int(F.groupby(["date", "slot"]).ngroups), "path": path}
        if ver == "x":
            for k, (f, _) in cells.items():
                checks[f"jump-after-path:{k}"] = path_proof(bs, f, path[k], rng)
            dsc = res["descriptive"]
            dsc["horizons"] = {k: {h: path_cell(bs, f, c, h) for h in HORIZONS if h != "m60"} for k, (f, c) in cells.items()}
            dsc["by_sign_m60"] = {("up" if sg > 0 else "down"): {k: path_cell(bs, f[f.sign == sg], c, "m60") for k, (f, c) in cells.items()} for sg in (1, -1)}
            dsc["by_class_m60"] = {c: path_cell(bs, g, C[C.klass == c], "m60") for c, g in F.groupby("klass")}
            lab, cuts = thirds(F)
            dsc["size_cuts_sigma"] = cuts
            dsc["by_size_m60"] = {t: path_cell(bs, F[lab == t], C, "m60") for t in ("small", "medium", "large")}
            cj = F.cojump.to_numpy()
            dsc["by_size_common_m60"] = {f"{t} {nm}": path_cell(bs, F[(lab == t) & m], C, "m60") for t in ("small", "medium", "large")
                                         for nm, m in (("common", cj >= 3), ("own", cj < 3))}
            dsc["by_block_m60"] = {nm: path_cell(bs, F[F.hour.isin(hrs)], C, "m60") for nm, hrs in
                                   (("Asia 01-07", range(1, 7)), ("London 07-12", range(7, 12)), ("US data 12-14", range(12, 14)), ("Afternoon 14-21", range(14, 21)))}
        else:
            r["rollover_only"] = path_cell(bs, F[F.hour.isin([21, 0])], C, "m60")
        res["reads"][ver] = r

    X = X[X.event.ne("unknown")].copy()
    X["klass"] = X.inst.map(klass)
    for c in sorted(X.klass.unique()):
        X[f"c_{c}"] = (X.klass == c).astype(float)
    for t in ("FOMC", "NFP", "CPI", "high"):
        X[f"e_{t}"] = (X.event == t).astype(float)
    X["monday"] = (pd.to_datetime(X.date).dt.dayofweek == 0).astype(float)
    bench = [c for c in X.columns if c.startswith(("c_", "e_"))] + ["monday", "regime"]
    for ver, sfx in (("x", ""), ("all", "_all")):
        feats = [f + sfx for f in ("lam_un", "lam_sch", "flag_last")] + ["js20"]
        g, ck = gain_family(bs, X, bench, feats, "flag" + sfx, rng, proofs=(ver == "x"))
        st = {k: v for k, v in g.items() if k != "flag_today"}
        holm(st)
        it = {"flag_today": g["flag_today"]}
        holm(it)
        res["reads"][ver]["stop_through"], res["reads"][ver]["intensity"] = st, it
        for k, c in ck.items():
            checks[("jump-after-intensity:" if k == "flag_today" else "jump-after-stop-through:") + k] = c

    v = {}
    for ver, r in res["reads"].items():
        ok, ctx = [], []
        for k, c in r["path"].items():
            same = c["half_A"] is not None and c["half_B"] is not None and np.sign(c["half_A"]) == np.sign(c["half_B"]) == np.sign(c["mean"])
            if c["p_holm"] < 0.05 and same:
                ctx.append(k)
                dn = "follow_net" if c["mean"] > 0 else "fade_net"
                if (c["vs_lo"] > 0 or c["vs_hi"] < 0) and c[dn][1] > 0:
                    ok.append(k)
        vv = {"jump-after-path": "VALIDATED" if ok else ("CONTEXT" if ctx else "NULL"), "path_context_cells": ctx}
        for name, fam in (("jump-after-stop-through", r["stop_through"]), ("jump-after-intensity", r["intensity"])):
            val = [k for k, c in fam.items() if c["lo"] > 0 and c["gain"] >= GAIN_MIN and c["p_holm"] < 0.05]
            sg = [k for k, c in fam.items() if c["p_holm"] < 0.05]
            vv[name] = "VALIDATED" if val else ("CONTEXT" if sg else "NULL")
        v[ver] = vv
    res["verdicts_prereg"] = v
    res["gate"] = G.write_checks("jump-after", checks)
    (OUT / "results.json").write_text(json.dumps(res, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o)), encoding="utf-8")
    write_md(res)


def _ci(x):
    return f"{x[0]:+.3f} [{x[1]:+.3f}, {x[2]:+.3f}]"


def _row(k, c):
    return (f"| {k} | {c['n']:,} | {c['mean']:+.4f} [{c['lo']:+.4f}, {c['hi']:+.4f}] | {c['vs_control']:+.4f} [{c['vs_lo']:+.4f}, {c['vs_hi']:+.4f}] | "
            f"{c['half_A']:+.4f} / {c['half_B']:+.4f} | {c.get('p_holm', float('nan')):.3f} | {_ci(c['follow_net'])} | {_ci(c['fade_net'])} | {c['mean_cost']:.3f} |")


def write_md(r):
    a = r["audit"]
    H = ["| cell | n | mean [95%] | vs control [95%] | half A / B | Holm p | follow net | fade net | cost |", "|---|---|---|---|---|---|---|---|---|"]
    md = ["# jump-after: results", "", f"Prereg: `forge/JUMP_AFTER_PREREG.md` with A1 and A2 (pre-results) and A3 (post-hoc, proof checks only; run 1 kept as `RESULTS_run1.md`). Seed {r['seed']}, B = {r['B']}. "
          "Units: daily σ, signed so + means the burst carried on.", "", "## Verdicts", "", "Prereg gate, main read (01:00-21:00) and with the rollover:", ""]
    for ver, vv in r["verdicts_prereg"].items():
        md.append(f"- {'main' if ver == 'x' else 'with rollover'}: " + ", ".join(f"`{k}` **{x}**" for k, x in vv.items() if k.startswith("jump"))
                  + (f" (Holm-significant, same sign both halves: {', '.join(vv['path_context_cells'])})" if vv["path_context_cells"] else ""))
    md += ["", "Verdict gate (`checks.json`), main read:", "", "| question | verdict | why | power | planted min / large | shuffle |", "|---|---|---|---|---|---|"]
    for q, c in r["gate"].items():
        md.append(f"| {q} | **{c['verdict']}** | {c['reasons'][0]} | {c['power']:.2f} | {c['planted_min']['shift']:+.4f} of {c['planted_min']['injected']} / "
                  f"{c['planted_large']['shift']:+.4f} of {c['planted_large']['injected']} | [{c['shuffle']['lo']:+.4f}, {c['shuffle']['hi']:+.4f}] |")
    for ver, title in (("x", "Main read: first burst 01:00-21:00 London"), ("all", "With the rollover (A1 read, secondary)")):
        rr = r["reads"][ver]
        md += ["", f"## {title}", "", f"{rr['n_flags']:,} bursts in {rr['events']:,} distinct moments.", "", "### After-burst path, 60 minutes", ""] + H
        md += [_row(k, c) for k, c in rr["path"].items()]
        if "rollover_only" in rr:
            md += ["", "Rollover bursts alone (21:00-01:00):", ""] + H + [_row("rollover", rr["rollover_only"])]
        md += ["", "### Stop-through and intensity: Brier gain over σ, calendar, Monday and class", "", "| cell | n | base | gain [95%] | Holm p |", "|---|---|---|---|---|"]
        for k, c in {**rr["stop_through"], **rr["intensity"]}.items():
            md.append(f"| {k} | {c['n']:,} | {c['base']:.3f} | {c['gain']:+.5f} [{c['lo']:+.5f}, {c['hi']:+.5f}] | {c['p_holm']:.3f} |")
    dsc = r["descriptive"]
    md += ["", "## Descriptive (main read, not scored)", "", f"Size thirds cut at {dsc['size_cuts_sigma'][0]}σ and {dsc['size_cuts_sigma'][1]}σ.", ""] + H
    for grp in ("by_size_m60", "by_size_common_m60", "by_block_m60", "by_class_m60"):
        md += [_row(k, c) for k, c in dsc[grp].items()]
    md += ["", "| cell | horizon | mean [95%] | vs control |", "|---|---|---|---|"]
    for k, hs in dsc["horizons"].items():
        for h, c in hs.items():
            md.append(f"| {k} | {h} | {c['mean']:+.4f} [{c['lo']:+.4f}, {c['hi']:+.4f}] | {c['vs_control']:+.4f} |")
    (OUT / "RESULTS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md).encode("ascii", "replace").decode())


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", choices=["build", "analyse"], required=True)
    a = ap.parse_args()
    {"build": stage_build, "analyse": stage_analyse}[a.stage]()
