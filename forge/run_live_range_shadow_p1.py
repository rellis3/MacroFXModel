"""LIVE-RANGE-SHADOW parts 1 and 3 (forge/LIVE_RANGE_SHADOW_PREREG.md).

    PYTHONIOENCODING=utf-8 python -m forge.run_live_range_shadow_p1
Part 1: P(this running high/low is the day's final extreme) table, walk-forward validated, exported to js/extremeInParams.js.
Part 3: grids refit in the page's own sigma basis, exported to js/intradayRangeParamsPit.js.
"""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier

sys.path.insert(0, "scripts/forecast_history")
from forecast_record import boot_weights  # noqa: E402

from forge.run_live_range_history_build import cls_of  # noqa: E402

O = Path("analysis/output/live_range_shadow"); O.mkdir(parents=True, exist_ok=True)
FEAT = Path("analysis/output/live_range_features")
D_EDGES = np.array([0.05, 0.10, 0.20, 0.30, 0.45, 0.60, 0.80, 1.00, 1.30, 1.70, 2.50])   # 12 bins
NB = len(D_EDGES) + 1
M_SHRINK = 30
LOG, RES = [], {}


def say(s=""):
    print(s, flush=True); LOG.append(s)


names = json.loads((FEAT / "names.json").read_text()); names = [names[str(i)] for i in range(len(names))]
X = pd.read_parquet(FEAT / "features.parquet")
X = X[X.h >= 2].reset_index(drop=True)
X["cls"] = np.array([cls_of(n) for n in names])[X.inst.to_numpy()]
parts = []
for side in (1, -1):
    parts.append(pd.DataFrame({
        "inst": X.inst.to_numpy(), "date": X.date.to_numpy(), "cls": X.cls.to_numpy(), "h": X.h.to_numpy().astype(int), "used": X.used.to_numpy(), "speed": X.speed.to_numpy(),
        "side": side, "d": ((1 - X.pos) * X.used if side == 1 else X.pos * X.used).to_numpy(),
        "y": ((X.U if side == 1 else X.Dn) <= 0.05).astype(float).to_numpy()}))
T = pd.concat(parts, ignore_index=True)
T["db"] = np.digitize(T.d, D_EDGES)
T["q"] = (pd.to_datetime(T.date.map(pd.Timestamp.fromordinal)).dt.year * 4 + (pd.to_datetime(T.date.map(pd.Timestamp.fromordinal)).dt.month - 1) // 3)


def fit_table(tr: pd.DataFrame):
    """returns edges (22,2) for used terciles and prob array P[h, db, ut] with hierarchical shrinkage."""
    ue = np.zeros((22, 2))
    P = np.zeros((22, NB, 3)); n_b = np.bincount(tr.db, minlength=NB).astype(float); k_b = np.bincount(tr.db, weights=tr.y, minlength=NB)
    g = tr.y.mean()
    p_b = (k_b + M_SHRINK * g) / (n_b + M_SHRINK)
    for h in range(2, 22):
        th = tr[tr.h == h]
        if len(th) == 0:
            P[h] = p_b[:, None]; continue
        ue[h] = np.quantile(th.used, [1 / 3, 2 / 3])
        n_hb = np.bincount(th.db, minlength=NB).astype(float); k_hb = np.bincount(th.db, weights=th.y, minlength=NB)
        p_hb = (k_hb + M_SHRINK * p_b) / (n_hb + M_SHRINK)
        ut = np.digitize(th.used, ue[h])
        idx = th.db.to_numpy() * 3 + ut
        n_u = np.bincount(idx, minlength=NB * 3).reshape(NB, 3).astype(float); k_u = np.bincount(idx, weights=th.y, minlength=NB * 3).reshape(NB, 3)
        P[h] = (k_u + M_SHRINK * p_hb[:, None]) / (n_u + M_SHRINK)
    return ue, P


def predict_table(ue, P, te: pd.DataFrame):
    h = te.h.to_numpy()
    ut = np.where(te.used.to_numpy() < ue[h, 0], 0, np.where(te.used.to_numpy() < ue[h, 1], 1, 2))
    return P[h, te.db.to_numpy(), ut]


def base_rate(tr, te):
    """the page-implied base: frequency by hour x used tercile x pace tercile (side pooled)."""
    out = np.zeros(len(te))
    for h in range(2, 22):
        th = tr[tr.h == h]; mh = (te.h == h).to_numpy()
        if len(th) == 0 or not mh.any():
            continue
        eu = np.quantile(th.used, [1 / 3, 2 / 3]); es = np.quantile(th.speed, [1 / 3, 2 / 3])
        c_tr = np.digitize(th.used, eu) * 3 + np.digitize(th.speed, es)
        c_te = np.digitize(te.used[mh], eu) * 3 + np.digitize(te.speed[mh], es)
        fr = np.array([th.y.to_numpy()[c_tr == c].mean() if (c_tr == c).sum() >= 30 else th.y.mean() for c in range(9)])
        out[mh] = fr[c_te]
    return out


say("# LIVE-RANGE-SHADOW — Part 1: calibrated 'this high / low is in' probability\n\nPre-registration: `forge/LIVE_RANGE_SHADOW_PREREG.md`. Walk-forward: the table is refit every quarter "
    "on prior data only; scored 2018-04 → 2026-08, 34 instruments, both sides.\n")
qs = sorted(T.q.unique()); first_q = 2018 * 4 + 1                              # 2018-Q2
out_rows = []
for cls in ("fx_gold", "indices"):
    C = T[T.cls == cls]
    pred_t = np.full(len(C), np.nan); pred_b = np.full(len(C), np.nan)
    for q in qs:
        if q < first_q:
            continue
        trm = (C.q < q).to_numpy(); tem = (C.q == q).to_numpy()
        if tem.sum() == 0:
            continue
        tr, te = C[trm], C[tem]
        ue, P = fit_table(tr)
        pred_t[tem] = predict_table(ue, P, te); pred_b[tem] = base_rate(tr, te)
    ok = np.isfinite(pred_t)
    Cs = C[ok].copy(); Cs["pt"] = pred_t[ok]; Cs["pb"] = pred_b[ok]
    y = Cs.y.to_numpy()
    dts = np.sort(Cs.date.unique()); Wb = boot_weights(len(dts)); di = np.searchsorted(dts, Cs.date.to_numpy())
    lt, lb = (y - Cs.pt.to_numpy()) ** 2, (y - Cs.pb.to_numpy()) ** 2
    nt, nb_ = np.bincount(di, weights=lt, minlength=len(dts)), np.bincount(di, weights=lb, minlength=len(dts))
    sk = 1 - nt.sum() / nb_.sum(); skb = 1 - (Wb @ nt) / (Wb @ nb_)
    # ceiling: geometry GBM fitted once on the first 60% of dates, scored on the last 40%
    split = C.date.quantile(0.6)
    trm = (C.date < split).to_numpy(); keep = trm & (np.random.default_rng(0).random(len(C)) < 0.4)
    FE = ["h", "used", "speed", "side", "d"]
    gb = HistGradientBoostingClassifier(max_iter=100, learning_rate=0.1, max_leaf_nodes=31, min_samples_leaf=300, random_state=0).fit(C.loc[keep, FE].to_numpy(), C.y.to_numpy()[keep])
    last = Cs.date >= split
    pg = gb.predict_proba(Cs.loc[last, FE].to_numpy())[:, 1]
    bg = ((Cs.y[last] - pg) ** 2).sum(); bb = ((Cs.y[last] - Cs.pb[last]) ** 2).sum(); bt = ((Cs.y[last] - Cs.pt[last]) ** 2).sum()
    sk_g, sk_t_last = 1 - bg / bb, 1 - bt / bb
    # reliability by decile
    Cs["dec"] = pd.qcut(Cs.pt, 10, labels=False, duplicates="drop")
    rel = Cs.groupby("dec").agg(pred=("pt", "mean"), real=("y", "mean"), n=("y", "size"))
    gap = float((rel.real - rel.pred).abs().max())
    passed = bool(sk_t_last >= 0.8 * sk_g and gap <= 0.03 and rel.n.min() >= 300)
    say(f"## {cls}\n")
    say(f"- Brier skill of the table over the page's hour × used × pace base rate, 2018-04 → 2026-08: **{sk*100:+.2f}%** [{np.percentile(skb, 2.5)*100:+.2f}%, {np.percentile(skb, 97.5)*100:+.2f}%].")
    say(f"- On the last 40% of dates (same rows as the ceiling): table **{sk_t_last*100:+.2f}%**, geometry GBM ceiling {sk_g*100:+.2f}% → table reaches {sk_t_last/sk_g:.0%} of the ceiling.")
    say(f"- Reliability, largest decile gap |realised − predicted|: **{gap*100:.2f}pp** (smallest decile n {int(rel.n.min()):,}).  → **{'CALIBRATED SHADOW' if passed else 'FAILS'}**\n")
    say("| decile | predicted | realised | n |"); say("|---|---|---|---|")
    for dd, x in rel.iterrows():
        say(f"| {int(dd) + 1} | {x.pred:.1%} | {x.real:.1%} | {int(x.n):,} |")
    say("")
    hh = Cs.groupby(pd.cut(Cs.h, [1, 7, 14, 21], labels=["02-07", "08-14", "15-21"]), observed=True).apply(lambda g: 1 - ((g.y - g.pt) ** 2).sum() / ((g.y - g.pb) ** 2).sum())
    say("Skill by hours: " + ", ".join(f"{k}: {v*100:+.1f}%" for k, v in hh.items()) + "\n")
    out_rows.append(dict(cls=cls, skill=float(sk), lo=float(np.percentile(skb, 2.5)), hi=float(np.percentile(skb, 97.5)), skill_last=float(sk_t_last), ceiling=float(sk_g), gap=gap, passed=passed))
RES["p1"] = out_rows

# ---- export the all-data table (labelled as such) for the shadow page
exp = {"generated": str(date.today()), "source": "forge/run_live_range_shadow_p1.py", "prereg": "forge/LIVE_RANGE_SHADOW_PREREG.md",
       "note": "fitted on ALL dates, page sigma basis (pit_sig_daily); the walk-forward evidence is in analysis/output/live_range_shadow/RESULTS.md",
       "d_edges": D_EDGES.tolist(), "m": M_SHRINK, "classes": {}}
for cls in ("fx_gold", "indices"):
    ue, P = fit_table(T[T.cls == cls])
    exp["classes"][cls] = {"used_edges": {str(h): [round(float(x), 4) for x in ue[h]] for h in range(2, 22)},
                           "p": {str(h): np.round(P[h], 4).tolist() for h in range(2, 22)}}
exp["instrument_class"] = {n: cls_of(n) for n in names}
exp["alias"] = {"SPX500": "SPX500", "US30": "DOW"}
Path("js/extremeInParams.js").write_text("/**\n * 'This high / low is in' probability table. GENERATED - do not hand-edit.\n * Regenerate: python -m forge.run_live_range_shadow_p1  (forge/LIVE_RANGE_SHADOW_PREREG.md)\n */\n"
                                          f"export const EXTREME_IN_PARAMS = {json.dumps(exp)};\n", encoding="utf-8")
(O / "p1_table_check.json").write_text(json.dumps({"example": {"h": 12, "used_edges": exp["classes"]["fx_gold"]["used_edges"]["12"], "p": exp["classes"]["fx_gold"]["p"]["12"]}}))

# ================================================================ Part 3: grids in the page's own sigma
F = pd.read_parquet("analysis/output/live_range_wf/frame.parquet")
F["cls"] = F.inst.map(cls_of)
GRID = [round(x, 2) for x in np.arange(0.05, 0.951, 0.05)]
MIN_CELL = 30
P3 = {"generated": str(date.today()), "source": "forge/run_live_range_shadow_p1.py", "prereg": "forge/LIVE_RANGE_SHADOW_PREREG.md", "grid": GRID,
      "units": "sigma_daily * open, sigma = pit_sig_daily (the page's own basis). Fitted on ALL dates (in-sample by construction, like the shipped file); shadow only.",
      "checkpoints_london": list(range(1, 22)), "classes": {}}
for cls in ("fx_gold", "indices"):
    C = F[F.cls == cls]; cp = {}
    for h in range(1, 22):
        Ch = C[C.h == h]
        if len(Ch) < 500:
            continue
        eu = np.quantile(Ch.used, [1 / 3, 2 / 3]); es = np.quantile(Ch.speed, [1 / 3, 2 / 3])
        cell = np.digitize(Ch.used, eu) * 3 + np.digitize(Ch.speed, es)
        R = (Ch.U + Ch.Dn).to_numpy()
        cells = []
        for c in range(9):
            sel = cell == c
            def q(v):
                vv = v[sel] if sel.sum() >= MIN_CELL else v
                return [round(float(x), 4) for x in np.quantile(vv, GRID)]
            cells.append({"U": q(Ch.U.to_numpy()), "Dn": q(Ch.Dn.to_numpy()), "R": q(R), "n": int(sel.sum())})
        cp[str(h)] = {"used_edges": [round(float(x), 4) for x in eu], "speed_edges": [round(float(x), 4) for x in es], "cells": cells}
    P3["classes"][cls] = cp
P3["instrument_class"] = {n: cls_of(n) for n in names}
P3["alias"] = {"SPX500": "SPX", "US30": "DOW"}
Path("js/intradayRangeParamsPit.js").write_text("/**\n * Intraday range re-forecast params refit in the page's own sigma basis. GENERATED - do not hand-edit. SHADOW ONLY.\n"
                                                 " * Regenerate: python -m forge.run_live_range_shadow_p1  (forge/LIVE_RANGE_SHADOW_PREREG.md)\n */\n"
                                                 f"export const INTRADAY_PARAMS_PIT = {json.dumps(P3)};\n", encoding="utf-8")
say("## Part 3 — grids refit in the page's own σ (`js/intradayRangeParamsPit.js`)\n")
say("Written (all-data fit, shadow). Walk-forward evidence already measured in LIVE_RANGE_HISTORY: refit-on-first-60% lines hit p75 / p90 on the last 40% at "
    "FX 24.0% / 9.5%, indices 27.6% / 11.2% (targets 25 / 10), versus the shipped params' 21.5% / 8.0% and 24.2% / 9.2%.\n"
    "Registered check (±1.5pp of 25 / 10): FX p75 ✓ p90 ✓; indices p75 ✗ (+2.6pp, the known tight indices downside), p90 ✓.\n")
(O / "results_p1.json").write_text(json.dumps(RES, indent=1, default=str))
(O / "RESULTS_p1.md").write_text("\n".join(LOG), encoding="utf-8")
print("wrote")
