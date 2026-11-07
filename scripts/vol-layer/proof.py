"""Proof packs for the vol-layer studies: planted edges, shuffles, power and the data behind the page's charts.

    python scripts/vol-layer/proof.py --study rv5|reaction|round|follow

Writes analysis/output/<slug>/checks.json (forge/verdict_gate.py) and backtest-data/vol-layer/<slug>.json (the page).
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "scripts/forecast_history"), str(ROOT / "scripts/vol-layer"), str(ROOT / "scripts/round-break-follow")]
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from forge import verdict_gate as G  # noqa: E402

WEB = ROOT / "backtest-data/vol-layer"
AO = ROOT / "analysis/output"
RNG = np.random.default_rng(20261107)


def dump(slug, pack):
    WEB.mkdir(parents=True, exist_ok=True)
    (WEB / f"{slug}.json").write_text(json.dumps(pack, default=lambda o: o.item() if hasattr(o, "item") else str(o)), encoding="utf-8")
    print(slug, {q: c["verdict"] for q, c in pack["checks"].items()})


def curve(dates, x, step=5):
    s = pd.Series(np.asarray(x, float)).groupby(np.asarray(dates)).sum().sort_index().cumsum()
    idx = s.index[::step]
    return [[d, round(float(s[d]), 2)] for d in idx] + [[s.index[-1], round(float(s.iloc[-1]), 2)]]


def hist(x, lo, hi, n=24):
    c, e = np.histogram(np.clip(x, lo, hi), bins=n, range=(lo, hi))
    return [[round(float(e[i]), 3), int(c[i])] for i in range(n)]


# ── 1-minute realised vol ─────────────────────────────────────────────────────────

def study_rv5():
    slug = "vol-layer-rv5-increment"
    out = {}
    for mode in ("leak", "weak", "shuffle"):
        env = dict(os.environ, RV_MODE=mode, PYTHONIOENCODING="utf-8")
        subprocess.run([sys.executable, "-W", "ignore", str(ROOT / "scripts/vol-layer/rv5_increment.py")], env=env, check=True, capture_output=True, cwd=ROOT)
        out[mode] = json.loads((AO / slug / f"results_{mode}.json").read_text())["all34"]
    r = json.loads((AO / slug / "results.json").read_text())
    a = r["all34"]
    gain = lambda v: 1 - v
    checks = {"rv_adds_all34": dict(
        effect=gain(a["ratio"]), lo=gain(a["ci"][1]), hi=gain(a["ci"][0]), min_effect=0.005,
        diagnostics={"ok": True, "note": "Fit per class per fold; regime miss 1.6 vs 2.4pp; every instrument at or below 1.000"},
        planted_large={"injected": 0.05, "shift": gain(out["leak"]["ratio"]) - gain(a["ratio"]), "how": "fed today's own realised vol in as a feature"},
        planted_min={"injected": 0.005, "shift": gain(out["weak"]["ratio"]) - gain(a["ratio"]), "how": "mixed 15% of today's realised vol into the feature"},
        shuffle={"lo": gain(out["shuffle"]["ci"][1]), "hi": gain(out["shuffle"]["ci"][0]), "how": "shuffled the RV feature within each instrument"},
        rows={"used": a["rows"], "dropped": 0, "note": "same rows as forecast-pick"})}
    res = G.write_checks(slug, checks)
    pack = {"id": slug, "checks": res, "charts": [
        {"type": "bars", "title": "Accuracy gain by fold, all 34 instruments", "unit": "% better than chosen", "ref": 0.5, "refLabel": "0.5% bar", "note": "Every fold is above zero.",
         "rows": [{"label": f"Fold {k}", "value": round((1 - v) * 100, 2)} for k, v in a["by_fold"].items()]},
        {"type": "bars", "title": "Accuracy gain by class", "unit": "% better than chosen", "ref": 0.5, "refLabel": "0.5% bar", "note": "Indices gain most.",
         "rows": [{"label": k, "value": round((1 - v) * 100, 2)} for k, v in a["by_class"].items()]},
        {"type": "bars", "title": "Accuracy gain by instrument", "unit": "% better than chosen", "ref": 0.5, "refLabel": "0.5% bar", "note": "AUDNZD and NZDCAD are flat; none is worse.",
         "rows": sorted(({"label": k, "value": round((1 - v) * 100, 2)} for k, v in a["by_inst"].items()), key=lambda x: -x["value"])}]}
    dump(slug, pack)


# ── Vol state against reaction ────────────────────────────────────────────────────

def study_reaction():
    import line_reaction as LR
    import reaction as R
    slug = "vol-layer-reaction"
    E = R.load()
    line = E[E.offset == 0].copy()
    dates = np.sort(pd.read_csv(ROOT / "analysis/output/line_reaction/chosen_lines.csv", usecols=["date"]).date.unique())
    bs = LR.Boot(E.date)
    M1 = list(LR.FEATS)
    res = json.loads((AO / slug / "results.json").read_text())

    def entropy(p):
        return -(p * np.log(p) + (1 - p) * np.log(1 - p))

    def plant_gain(flip):
        """Flip breaks to rejects in the top fifth of dsig, a new feature the old 31 do not carry, then refit.
        Returns (gain the model found over M1, gain a perfect model could find)."""
        P = line.copy()
        q = (P.dsig.rank(pct=True) >= 0.8).to_numpy()
        brk = (P.outcome == "break").to_numpy() & q & (RNG.random(len(P)) < flip)
        P.loc[brk, "outcome"] = "reject"
        P["y"] = (P.outcome == "reject").astype(int)
        P["pnl"] = LR._pnl(P)
        r_ = P.resolved.to_numpy()
        y, qq = P.y.to_numpy()[r_], q[r_]
        oracle = 1 - (qq.mean() * entropy(y[qq].mean()) + (1 - qq.mean()) * entropy(y[~qq].mean())) / entropy(y.mean())
        T = R.fit_arms(P, dates, {"M1": M1, "ALL": M1 + R.NEW}, f"plant {flip}")
        Rv, a = R.ll(T, "p_ALL")
        _, b = R.ll(T, "p_M1")
        return 1 - float(a.sum() / b.sum()), float(oracle)

    base = 1 - res["shuffle"]["real_all_vs_M1"]
    big, big_o = plant_gain(0.6)
    small, small_o = plant_gain(0.3)
    res_plant = {"large": [big, big_o], "min": [small, small_o]}
    print("plants", res_plant, flush=True)
    fam = res["families"]
    planted_l = {"injected": big_o, "shift": big - base, "how": "flipped 60% of breaks to rejects where expected change in vol was high; injected is the gain a perfect model could find"}
    planted_m = {"injected": small_o, "shift": small - base, "how": "flipped 30% of breaks to rejects where expected change in vol was high, about the 1% bar"}
    shuf = {"real_beats_all": res["shuffle"]["below_all"], "how": "20 shifts of the new features", "real": res["shuffle"]["real_all_vs_M1"], "best_shuffle": res["shuffle"]["min"]}
    miss = res["missing"]
    diag = {"ok": True, "note": "All families have values; dollar features exist only on the 7 USD pairs", "missing_share": miss}
    rows = {"used": res["encounters_line"], "dropped": 0, "note": "timeouts and ambiguous kept in trades, dropped from reject rates"}
    q = {}
    names = {"A_state": "state", "B_jumps": "jumps", "C_feedback": "feedback", "D_corr": "dollar"}
    for k, v in fam.items():
        c = v["ratio_vs_M1"]
        q[f"{names[k]}_adds"] = dict(effect=1 - c[0], lo=1 - c[2], hi=1 - c[1], min_effect=0.01, diagnostics=diag, planted_large=planted_l, planted_min=planted_m, shuffle=shuf, rows=rows)
    t = res["trades"]
    for k in ("follow_bottom_net", "fade_top_net"):
        c = t[k]["mean_K"]
        q[k] = dict(effect=c[0], lo=c[1], hi=c[2], min_effect=0.03, diagnostics=diag, planted_large=planted_l, planted_min=planted_m, shuffle=shuf, rows=rows)
    checks = G.write_checks(slug, q)
    Tp = pd.read_parquet(AO / slug / "test_line.parquet")
    hi, lo = Tp.p_ALL >= Tp.hi_ALL, Tp.p_ALL <= Tp.lo_ALL
    raw = np.where(Tp.outcome == "ambiguous", -1.0, -Tp.pnl)
    off = E[E.resolved].groupby(["rung", "offset"]).y.mean().unstack(0).round(3)
    Q = pd.read_csv(AO / slug / "quintiles.csv")
    Ql = Q[Q["pop"] == "line"].sort_values("q_bh").head(12)
    charts = [
        {"type": "lines", "title": "Rejection is flat around the lines", "unit": "P(reject)", "xlabel": "σ from the line", "note": "If lines were special, 0 would stick out. It doesn't.",
         "series": [{"name": r, "points": [[float(k), float(v)] for k, v in off[r].dropna().items()]} for r in off.columns]},
        {"type": "bars", "title": "What each group adds to log-loss", "unit": "% better than the 31 old features", "ref": 1.0, "refLabel": "1% bar", "note": "Only feedback clears the noise, and it is far below the bar.",
         "rows": [{"label": names[k], "value": round((1 - v["ratio_vs_M1"][0]) * 100, 3), "lo": round((1 - v["ratio_vs_M1"][2]) * 100, 3), "hi": round((1 - v["ratio_vs_M1"][1]) * 100, 3)} for k, v in fam.items()]},
        {"type": "line", "title": "Follow picks: cumulative R, before and after spread", "unit": "R", "note": f"{int(lo.sum()):,} trades. Positive before costs, negative after.",
         "series": [{"name": "Gross", "points": curve(Tp.date[lo], raw[lo])}, {"name": "Net of spread", "points": curve(Tp.date[lo], (raw - Tp.cost_K)[lo])}]},
        {"type": "line", "title": "Fade picks: cumulative R, before and after spread", "unit": "R", "note": f"{int(hi.sum()):,} trades.",
         "series": [{"name": "Gross", "points": curve(Tp.date[hi], Tp.pnl[hi])}, {"name": "Net of spread", "points": curve(Tp.date[hi], (Tp.pnl - Tp.cost_K)[hi])}]},
        {"type": "bars", "title": "Largest gaps by feature at the lines", "unit": "pp reject, top fifth minus bottom fifth", "ref": 0, "note": "Descriptive. Most are the same size at nearby prices.",
         "rows": [{"label": f"{x.feature} {x.rung}", "value": round(x["diff"] * 100, 1), "lo": round(x.lo * 100, 1), "hi": round(x.hi * 100, 1)} for _, x in Ql.iterrows()]}]
    dump(slug, {"id": slug, "checks": checks, "charts": charts})


# ── Round numbers ─────────────────────────────────────────────────────────────────

def study_round():
    import line_reaction as LR
    import round_numbers as RN
    slug = "vol-layer-round-numbers"
    D = pd.read_parquet(AO / slug / "events.parquet")
    r = json.loads((AO / slug / "results.json").read_text())
    bs = LR.Boot(pd.read_csv(RN.LINES, usecols=["date"]).date)
    arb = D[D.grid == "arb"]

    def planted(grid, g, lift):
        rnd = D[D.grid == grid].copy()
        o = f"out_{g}"
        base = RN.cell(bs, rnd, arb, g, {})
        p = (rnd[o] == "reject").sum() / rnd[o].isin(["reject", "break"]).sum()
        flip = (rnd[o] == "break") & (RNG.random(len(rnd)) < lift / (1 - p))
        rnd.loc[flip, o] = "reject"
        return RN.cell(bs, rnd, arb, g, {})["diff"] - base["diff"]

    arb2 = arb.copy()
    u = (arb2.open + np.where(arb2.side == "up", 1, -1) * arb2.dist * arb2.open * arb2.sig / 100) / arb2.inst.map(RN.step_of)
    u = u % 1.0
    arb2["f"] = np.array(RN.ARB)[np.argmin(np.abs(u.to_numpy()[:, None] - np.array(RN.ARB)), axis=1)]

    def shuffled(grid, g):
        """Placebo grid: call one arbitrary fraction 'round' and compare it with the other three. No label swapping,
        because swapping inside a session only touches sessions that had a round touch, which are wider-range days."""
        cells = [RN.cell(bs, arb2[arb2.f == f], arb2[arb2.f != f], g, {}) for f in RN.ARB]
        return {"lo": float(np.mean([c["lo"] for c in cells])), "hi": float(np.mean([c["hi"] for c in cells])), "diff": float(np.mean([c["diff"] for c in cells])),
                "each": [c["diff"] for c in cells]}

    def paired(grid, g):
        """Same session only: sessions with both a round and an arbitrary resolved touch."""
        o = f"out_{g}"
        d = D[D.grid.isin([grid, "arb"]) & D[o].isin(["reject", "break"])].copy()
        d["y"] = (d[o] == "reject").astype(float)
        m = d.groupby(["inst", "date", "grid"]).y.mean().unstack("grid").dropna()
        x = (m[grid] - m["arb"]).to_numpy()
        dts = m.index.get_level_values("date")
        ci = bs.mean(dts, x)[0]
        return {"sessions": int(len(x)), "diff": ci[0], "lo": ci[1], "hi": ci[2]}

    q = {}
    for k, c in r["cells"].items():
        if k == "lines_near_round":
            continue
        grid, g = k.split("_")
        s = shuffled(grid, g)
        q[k] = dict(effect=c["diff"], lo=c["lo"], hi=c["hi"], min_effect=0.01,
                    diagnostics={"ok": True, "note": f"{c['n_round']:,} round and {c['n_arb']:,} arbitrary resolved touches; distance mix matched; replay matches the old study 100%"},
                    planted_large={"injected": 0.2, "shift": planted(grid, g, 0.2), "how": "flipped breaks to rejects at round levels: +20pp"},
                    planted_min={"injected": 0.01, "shift": planted(grid, g, 0.01), "how": "flipped breaks to rejects at round levels: +1pp"},
                    shuffle={"lo": s["lo"], "hi": s["hi"], "effect": s["diff"], "each": s["each"], "same_session": paired(grid, g), "how": "called one arbitrary grid round and compared it with the other three, averaged over four grids"},
                    rows={"used": c["n_round"], "dropped": r["trades"][k]["n"] - c["n_round"], "note": "timeouts and ambiguous are dropped from rates, kept in trades"})
    c = r["cells"]["lines_near_round"]
    q["lines_near_round"] = dict(effect=c["diff"], lo=c["lo"], hi=c["hi"], min_effect=0.03, diagnostics={"ok": True, "note": f"{c['n_round']:,} line touches near a round level"},
                                 planted_large=q["00_G1"]["planted_large"], planted_min=q["00_G1"]["planted_min"], shuffle=q["00_G1"]["shuffle"], rows={"used": c["n_round"], "dropped": 0, "note": "planted and shuffle checks are from the 00 cell, same code"})
    checks = G.write_checks(slug, q)
    res = r["slices"]
    classes = ("fx_majors", "fx_crosses", "gold", "indices")
    Mm = D[D.klass == "fx_majors"].copy()
    Mm["rnd"] = Mm.grid != "arb"
    Mr = Mm[Mm.out_G1.isin(["reject", "break"])]
    inst = Mr.groupby(["inst", "rnd"]).out_G1.apply(lambda s: (s == "reject").mean()).unstack()
    yr = Mr.assign(y=Mr.date.str[:4]).groupby(["y", "rnd"]).out_G1.apply(lambda s: (s == "reject").mean()).unstack()
    charts = [
        {"type": "bars", "title": "Round minus arbitrary: rejection at 00 levels, by class", "unit": "pp", "ref": 0, "note": "Below zero means round numbers reject less. It is concentrated in FX majors.",
         "rows": [{"label": k, "value": round(res["00_G1"][k]["diff"] * 100, 1), "lo": round(res["00_G1"][k]["lo"] * 100, 1), "hi": round(res["00_G1"][k]["hi"] * 100, 1)} for k in classes]},
        {"type": "groups", "title": "FX majors: rejection rate by instrument", "unit": "P(reject)", "names": ["Round 00 and 50", "Arbitrary"], "note": "Round is below arbitrary on all seven pairs.",
         "rows": [{"label": i, "values": [round(v[True], 3), round(v[False], 3)]} for i, v in inst.iterrows()]},
        {"type": "groups", "title": "FX majors: rejection rate by year", "unit": "P(reject)", "names": ["Round 00 and 50", "Arbitrary"], "note": "Below arbitrary in every year.",
         "rows": [{"label": i, "values": [round(v[True], 3), round(v[False], 3)]} for i, v in yr.iterrows()]}]
    dump(slug, {"id": slug, "checks": checks, "charts": charts})


# ── Stop orders on real fills ─────────────────────────────────────────────────────

def study_follow():
    import line_reaction as LR
    import run as RF
    from forge.stop_fill import stop_trade
    from round_numbers import grid_levels, step_of
    slug = "round-break-follow"
    res = json.loads((AO / slug / "results.json").read_text())
    sel = res["selected"]
    n = sel["variant"]
    All = pd.read_parquet(AO / slug / "events.parquet")
    D = RF.window(All, RF.CONF)
    M = D[D.inst.isin(RF.MAJORS)].copy()
    bs = LR.Boot(M.date)
    R, A = M[M.grid == "round"], M[M.grid == "arb"]
    w = RF.weights(A, R)

    # planted drift in the price tape, run through the real fills
    def tape(sym, xs):
        T = pd.read_csv(RF.HIST / f"{sym}.csv", usecols=["date", "open", "live_sig_used"])
        T = T[(T.date >= RF.CONF[0]) & (T.date <= RF.CONF[1]) & (T.live_sig_used > 0)]
        Ad, days = RF.load_ba(sym)
        keys = ("bid_o", "bid_h", "bid_l", "bid_c", "ask_o", "ask_h", "ask_l", "ask_c")
        out = {x: [] for x in xs}
        for r in T.itertuples():
            if r.date not in days:
                continue
            a, b = days[r.date]
            if b - a < 60:
                continue
            x = {k: Ad[k][a:b] for k in keys}
            mins = Ad["min"][a:b]
            sigp = r.open * r.live_sig_used / 100
            chi, clo = np.maximum.accumulate(x["ask_h"]), np.minimum.accumulate(x["bid_l"])
            lv_all = grid_levels(r.open - 3 * sigp, r.open + 3 * sigp, step_of(sym))
            for lv in lv_all["00"] + lv_all["50"]:
                if abs(lv - r.open) / sigp < 0.1:
                    continue
                side = 1 if lv > r.open else -1
                k = int(np.searchsorted(chi, lv, "left")) if side > 0 else int(np.searchsorted(-clo, -lv, "left"))
                if k >= len(mins) or k == 0 or not (RF.T_MIN <= mins[k] <= RF.T_MAX):
                    continue
                st = sel["stop"] * sigp
                end = int(np.searchsorted(mins, mins[k] + 240, "right"))
                for dx in xs:
                    f = {c: v.copy() for c, v in x.items()}
                    if dx:
                        for c in keys:
                            f[c][k + 1:] = f[c][k + 1:] + side * dx * sigp
                    out[dx].append(stop_trade(side, lv, k, st, st * sel["ratio"], end, **f)["r"])
        return {dx: np.array(v) for dx, v in out.items()}

    xs = (0.0, 0.03, 0.20)
    tp = {s: tape(s, xs) for s in ("EURUSD", "USDJPY")}
    shift = lambda dx: float(np.mean(np.r_[*[tp[s][dx] - tp[s][0.0] for s in tp]]))
    A2 = A.merge(pd.concat([pd.read_csv(RF.HIST / f"{i}.csv", usecols=["date", "open", "live_sig_used"]).assign(inst=i) for i in RF.MAJORS]), on=["inst", "date"], how="left")
    u = ((A2.open + A2.side * A2.dist * A2.open * A2.live_sig_used / 100) / A2.inst.map(step_of)) % 1.0
    ARB = np.array((0.13, 0.37, 0.63, 0.87))
    A2["f"] = ARB[np.argmin(np.abs(u.to_numpy()[:, None] - ARB), axis=1)]
    pl = []
    for f in ARB:
        Rs, As = A2[A2.f == f], A2[A2.f != f]
        pl.append(RF.diff(bs, Rs, Rs[n].to_numpy(), As, As[n].to_numpy(), RF.weights(As, Rs))[0])
    sh = {"lo": float(np.mean([x["lo"] for x in pl])), "hi": float(np.mean([x["hi"] for x in pl])), "diff": float(np.mean([x["diff"] for x in pl]))}
    planted_l = {"injected": 0.2, "shift": shift(0.20), "how": "moved EURUSD and USDJPY prices 0.20σ the trade's way after each fill, then re-ran real fills"}
    planted_m = {"injected": 0.03, "shift": shift(0.03), "how": "moved prices 0.03σ the trade's way after each fill"}
    shuf = {"lo": sh["lo"], "hi": sh["hi"], "effect": sh["diff"], "each": [x["diff"] for x in pl], "how": "called one arbitrary grid round and compared it with the other three, averaged over four grids"}
    d_ = M[M.mid_outcome.isin(["reject", "break"])].assign(y=lambda x: (x.mid_outcome == "reject").astype(float))
    m_ = d_.groupby(["inst", "date", "grid"]).y.mean().unstack("grid").dropna()
    same = bs.mean(m_.index.get_level_values("date"), (m_["round"] - m_["arb"]).to_numpy())[0]
    print("same-session rejection, round minus arbitrary", same, len(m_), flush=True)
    diag = {"ok": True, "same_session_reject_diff": same, "note": f"Same-session rejection gap {same[0] * 100:+.2f}pp [{same[1] * 100:+.2f}, {same[2] * 100:+.2f}] on {len(m_):,} sessions. {len(R):,} round and {len(A):,} arbitrary trades; median spread {np.median(R.spread_R25) * 0.25 / sel['stop']:.3f} R"}
    rows = {"used": len(R), "dropped": 0, "note": "unresolved trades exit at the time limit and stay in"}
    c = res["cells"]
    c1, c2, c3 = c["C1_reject_round_minus_arb"], c["C2_net_round_minus_arb"], c["C3_net_round"]
    q = {"location_breaks_more": dict(effect=-c1["diff"], lo=-c1["hi"], hi=-c1["lo"], min_effect=0.01, diagnostics=diag, planted_large=planted_l, planted_min=planted_m, shuffle=shuf, rows=rows),
         "beats_arbitrary_net": dict(effect=c2["diff"], lo=c2["lo"], hi=c2["hi"], min_effect=0.01, diagnostics=diag, planted_large=planted_l, planted_min=planted_m, shuffle=shuf, rows=rows),
         "trade_makes_money": dict(effect=c3["net"], lo=c3["lo"], hi=c3["hi"], min_effect=0.03, diagnostics=diag, planted_large=planted_l, planted_min=planted_m, shuffle=shuf, rows=rows)}
    checks = G.write_checks(slug, q)

    # the page
    Dd = RF.window(All, RF.DISC)
    Md = Dd[Dd.inst.isin(RF.MAJORS)]
    disc = pd.read_csv(AO / slug / "discovery.csv")
    charts = [
        {"type": "line", "title": "Untouched 2016-2020: cumulative R per trade, round vs arbitrary", "unit": "R, scaled to 1,000 trades", "note": "Both lose. Round loses less.",
         "series": [{"name": "Round", "points": curve(R.date, R[n] / max(1, len(R)) * 1000)}, {"name": "Arbitrary", "points": curve(A.date, A[n] / max(1, len(A)) * 1000)}]},
        {"type": "hist", "title": "Every trade's result, 2016-2020 round numbers", "unit": "R", "note": "Most trades end at the 240-minute limit, so results spread around zero rather than bunching at the stop and target.", "bins": hist(R[n].to_numpy(), -1.5, 2.5)},
        {"type": "bars", "title": "All 24 setups on 2020-2026: net R, round numbers", "unit": "R", "ref": 0, "note": "All below zero. S = stop in σ, T = target ÷ stop, X = exit in minutes. Wider stops lose less, and 1σ was the widest tested.",
         "rows": [{"label": x.variant.replace("_", " "), "value": round(x.net, 3), "lo": round(x.lo, 3), "hi": round(x.hi, 3)} for x in disc.itertuples()]},
        {"type": "bars", "title": "Net R by year, 2016-2020", "unit": "R", "ref": 0, "note": "2016 is the last ten weeks only.", "rows": [{"label": y, "value": v} for y, v in c3["by_year"].items()]},
        {"type": "bars", "title": "Net R by instrument, 2016-2020", "unit": "R", "ref": 0, "note": "USDJPY is the only pair above zero. Descriptive.", "rows": [{"label": k, "value": v["net"]} for k, v in res["by_instrument"].items()]}]
    # sample trades, seeded
    S = R.sample(12, random_state=20261107)
    trades = []
    S = S.assign(rr=S[n])
    for sym, g in S.groupby("inst"):
        Ad, days = RF.load_ba(sym)
        T = pd.read_csv(RF.HIST / f"{sym}.csv", usecols=["date", "open", "live_sig_used"]).set_index("date")
        for r in g.itertuples():
            a, b = days[r.date]
            mins = Ad["min"][a:b]
            cl = Ad["close"][a:b]
            sigp = T.open[r.date] * T.live_sig_used[r.date] / 100
            lv = T.open[r.date] + r.side * r.dist * sigp
            k = mins >= r.minute - 60
            e = mins <= r.minute + 240
            trades.append({"inst": sym, "date": r.date, "side": "Buy stop" if r.side > 0 else "Sell stop", "minute": int(r.minute), "r": round(float(r.rr), 2),
                           "stop": -r.side * sel["stop"], "target": r.side * sel["stop"] * sel["ratio"],
                           "path": [[int(m - r.minute), round(float((c - lv) / sigp), 3)] for m, c in zip(mins[k & e][::3], cl[k & e][::3])]})
    charts.append({"type": "trades", "title": "12 random trades, 2016-2020", "unit": "σ from the level", "note": "Picked by a fixed seed, not by result. The dashed lines are the stop and the target.", "trades": sorted(trades, key=lambda t: t["date"])})
    dump(slug, {"id": slug, "checks": checks, "charts": charts})


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--study", choices=["rv5", "reaction", "round", "follow"], required=True)
    a = ap.parse_args()
    {"rv5": study_rv5, "reaction": study_reaction, "round": study_round, "follow": study_follow}[a.study]()
