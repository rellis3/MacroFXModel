"""vol-layer-round-numbers (forge/VOL_LAYER_ROUND_NUMBERS_PREREG.md): reaction at round numbers vs arbitrary prices.

    python scripts/vol-layer/round_numbers.py --stage check      # replay must reproduce LINE-REACTION at the lines
    python scripts/vol-layer/round_numbers.py --stage events     # replay every instrument
    python scripts/vol-layer/round_numbers.py --stage analyse    # scored cells, trades, line interaction, RESULTS.md
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "scripts/forecast_history"), str(ROOT / "scripts/vol-layer")]
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import line_reaction as LR  # noqa: E402

OUT = ROOT / "analysis/output/vol-layer-round-numbers"
EV = ROOT / "analysis/output/line_reaction/events_chosen"
LINES = ROOT / "analysis/output/line_reaction/chosen_lines.csv"
ARB = (0.13, 0.37, 0.63, 0.87)
GEOM = {"G1": (0.25, 120), "G2": (0.10, 30)}
STEP = {"GOLD": 50.0, "NQ": 500.0, "DE30": 500.0, "SPX500": 100.0, "UK100": 100.0, "DOW": 1000.0, "US2000": 50.0}
DIST_MIN, DIST_MAX = 0.1, 3.0
DIST_EDGES = [0.1, 0.3, 0.5, 0.75, 1.0, 1.5, 3.0001]
NEAR = 0.05
HOUR = 60
T_MIN, T_MAX = 60, 20 * 60


def step_of(sym):
    if sym in STEP:
        return STEP[sym]
    return 1.0 if sym.endswith("JPY") else 0.01


def race(H, L, C, mins, t, lv, s, sigp, K, hz):
    """LINE-REACTION's outcome rule. Returns (outcome, x_h in K units, clipped later)."""
    m = int(mins[t])
    thr = s * ((H if s > 0 else L) - lv) / sigp
    back = s * ((L if s > 0 else H) - lv) / sigp
    end = int(np.searchsorted(mins, m + hz, "right"))
    x_h = float(s * (C[end - 1] - lv) / sigp)
    end60 = int(np.searchsorted(mins, m + 60, "right"))
    beyond60 = float(thr[t:end60].max())
    if thr[t] >= K:
        return "break", x_h, beyond60
    wb, wr = thr[t + 1:end] >= K, back[t + 1:end] <= -K
    ib = int(np.argmax(wb)) if wb.any() else 10 ** 9
    ir = int(np.argmax(wr)) if wr.any() else 10 ** 9
    if ib == ir == 10 ** 9:
        return "timeout", x_h, beyond60
    if ib < ir:
        return "break", x_h, beyond60
    if ir < ib:
        return "reject", x_h, beyond60
    return "ambiguous", x_h, beyond60


def grid_levels(lo, hi, S):
    """{label: [levels]} for prices in (lo, hi). Labels 00, 50, arb."""
    out = {"00": [], "50": [], "arb": []}
    k0, k1 = int(math.floor(lo / S)) - 1, int(math.ceil(hi / S)) + 1
    for k in range(k0, k1 + 1):
        for label, fs in (("00", (0.0,)), ("50", (0.5,)), ("arb", ARB)):
            for f in fs:
                v = (k + f) * S
                if lo < v < hi:
                    out[label].append(v)
    return out


def session_events(sym, date, fold, klass, o_, sig, b):
    mins, H, L, C = b
    sigp = o_ * sig / 100
    chi, clo = np.maximum.accumulate(H), np.minimum.accumulate(L)
    S = step_of(sym)
    rows = []
    grids = grid_levels(o_ - DIST_MAX * sigp, o_ + DIST_MAX * sigp, S)
    for label, levels in grids.items():
        for lv in levels:
            dist = abs(lv - o_) / sigp
            if dist < DIST_MIN:
                continue
            s = 1 if lv > o_ else -1
            t = LR._first_touch(chi, clo, s, lv)
            if t is None or t == 0:
                continue
            m = int(mins[t])
            if m < T_MIN or m > T_MAX:
                continue
            rec = {"inst": sym, "date": date, "fold": fold, "klass": klass, "grid": label, "side": "up" if s > 0 else "dn",
                   "dist": dist, "minute": m, "sig": sig, "open": o_}
            for g, (K, hz) in GEOM.items():
                oc, x_h, b60 = race(H, L, C, mins, t, lv, s, sigp, K, hz)
                rec[f"out_{g}"], rec[f"x_{g}"], rec[f"b60_{g}"] = oc, x_h, b60
            rows.append(rec)
    return rows


def sessions(sym):
    m, days, _, _ = LR.load_m1(sym)
    mins, H, L, C = m["min"].to_numpy(), m.h.to_numpy(), m.l.to_numpy(), m.c.to_numpy()
    return {d: (mins[a:b], H[a:b], L[a:b], C[a:b]) for d, (a, b) in days.items()}


def stage_check():
    bad = 0
    tot = 0
    X = pd.read_csv(LINES)
    for sym in ("EURUSD", "GOLD", "NQ"):
        S_ = sessions(sym)
        E = pd.read_parquet(EV / f"{sym}.parquet", columns=["date", "side", "rung", "offset", "minute", "outcome"])
        E = E[E.offset == 0]
        L0 = X[X.inst == sym].set_index("date")
        for r in E.itertuples():
            row = L0.loc[r.date]
            s = 1 if r.side == "up" else -1
            q = "oh" if s > 0 else "ol"
            lv = row.open * (1 + s * row[f"{q}_{r.rung}"] / 100)
            mins, H, L, C = S_[r.date]
            chi, clo = np.maximum.accumulate(H), np.minimum.accumulate(L)
            t = LR._first_touch(chi, clo, s, lv)
            oc = race(H, L, C, mins, t, lv, s, row.open * row.sig / 100, 0.25, 120)[0]
            tot += 1
            bad += int(oc != r.outcome or int(mins[t]) != r.minute)
        print(sym, "checked", flush=True)
    share = 1 - bad / tot
    print(f"replay match {share:.5f} on {tot:,} encounters")
    if share < 0.999:
        raise SystemExit("replay check FAILED: nothing is scored")
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "replay_check.json").write_text(json.dumps({"encounters": tot, "match": share}))


def stage_events():
    if not (OUT / "replay_check.json").exists():
        raise SystemExit("run --stage check first")
    X = pd.read_csv(LINES, usecols=["inst", "date", "fold", "klass", "open", "sig"])
    parts = []
    for sym, g in X.groupby("inst"):
        S_ = sessions(sym)
        rows = []
        for r in g.itertuples():
            if r.date in S_ and r.sig > 0:
                rows += session_events(sym, r.date, int(r.fold), r.klass, float(r.open), float(r.sig), S_[r.date])
        parts.append(pd.DataFrame(rows))
        print(sym, len(rows), flush=True)
    pd.concat(parts, ignore_index=True).to_parquet(OUT / "events.parquet", index=False)


# ── analyse ──────────────────────────────────────────────────────────────────────

def pnl(oc, x_h, K):
    return np.select([oc == "reject", np.isin(oc, ["break", "ambiguous"])], [1.0, -1.0], np.clip(-x_h / K, -1, 1))


def strata(d):
    b = np.digitize(d.dist.to_numpy(), DIST_EDGES)
    sess = np.select([d.minute < 7 * 60, d.minute < 12 * 60], [0, 1], 2)
    return pd.Series(b * 100 + sess * 10).astype(str).to_numpy() + d.klass.to_numpy()


def weigh(arb, rnd):
    """Fixed post-stratification weights: arbitrary rows reweighted to the round-number mix."""
    a = pd.Series(strata(arb))
    r = pd.Series(strata(rnd))
    cr, ca = r.value_counts(), a.value_counts()
    w = (cr / ca).reindex(a).fillna(0.0).to_numpy()
    return w


def cell(bs, rnd, arb, g, res):
    """P(reject | resolved) round minus weighted arbitrary, with date-block reps."""
    o = f"out_{g}"
    R = rnd[rnd[o].isin(["reject", "break"])]
    A = arb[arb[o].isin(["reject", "break"])]
    w = weigh(A, R)
    k = w > 0
    A, w = A[k], w[k]
    a_n, a_d = bs.sums(A.date, (A[o] == "reject").to_numpy(float) * w), bs.sums(A.date, w)
    r_n, r_d = bs.sums(R.date, (R[o] == "reject").to_numpy(float)), bs.sums(R.date, np.ones(len(R)))
    reps = (bs.W @ r_n) / (bs.W @ r_d) - (bs.W @ a_n) / (bs.W @ a_d)
    est = r_n.sum() / r_d.sum() - a_n.sum() / a_d.sum()
    res.update({"n_round": int(len(R)), "n_arb": int(len(A)), "p_round": round(float(r_n.sum() / r_d.sum()), 4), "p_arb": round(float(a_n.sum() / a_d.sum()), 4),
                "diff": round(float(est), 4), "lo": round(float(np.percentile(reps, 2.5)), 4), "hi": round(float(np.percentile(reps, 97.5)), 4),
                "p": float((reps <= 0).mean())})
    return res


def mirror(bs, rnd, arb, g):
    o, b = f"out_{g}", f"b60_{g}"
    R, A = rnd[rnd[o] == "break"], arb[arb[o] == "break"]
    w = weigh(A, R)
    x, r = bs.sums(A.date, A[b].to_numpy() * w), bs.sums(R.date, R[b].to_numpy())
    dx, dr = bs.sums(A.date, w), bs.sums(R.date, np.ones(len(R)))
    reps = (bs.W @ r) / (bs.W @ dr) - (bs.W @ x) / (bs.W @ dx)
    return {"beyond60_round": round(float(r.sum() / dr.sum()), 4), "beyond60_arb": round(float(x.sum() / dx.sum()), 4), "diff": round(float(r.sum() / dr.sum() - x.sum() / dx.sum()), 4),
            "lo": round(float(np.percentile(reps, 2.5)), 4), "hi": round(float(np.percentile(reps, 97.5)), 4)}


def trades(bs, d, g, cost):
    K = GEOM[g][0]
    p = pnl(d[f"out_{g}"].to_numpy(), d[f"x_{g}"].to_numpy(), K)
    c = d.inst.map(cost).to_numpy() / (d.open.to_numpy() * d.sig.to_numpy() / 100 * K)
    gross, net = bs.mean(d.date, p)[0], bs.mean(d.date, p - c)[0]
    by = {int(f): round(float((p - c)[d.fold.to_numpy() == f].mean()), 4) for f in sorted(d.fold.unique())}
    return {"n": int(len(d)), "gross": gross, "net": net, "mean_cost_K": round(float(c.mean()), 4), "by_fold": by, "positive_folds": int(sum(v > 0 for v in by.values())), "folds": len(by)}


def line_interaction(bs):
    X = pd.read_csv(LINES, usecols=["inst", "date", "open", "sig", "klass", *[f"{q}_{r}" for q in ("oh", "ol") for r in LR.RUNGS]])
    E = pd.concat([pd.read_parquet(p, columns=["inst", "date", "side", "rung", "offset", "outcome"]) for p in sorted(EV.glob("*.parquet"))], ignore_index=True)
    E = E[E.offset == 0].merge(X, on=["inst", "date"], how="left")
    E = E[E.outcome.isin(["reject", "break"])].copy()
    s = np.where(E.side == "up", 1.0, -1.0)
    pct = np.array([getattr(r, f"{'oh' if r.side == 'up' else 'ol'}_{r.rung}") for r in E.itertuples()])
    lv = E.open.to_numpy() * (1 + s * pct / 100)
    sigp = E.open.to_numpy() * E.sig.to_numpy() / 100
    S = E.inst.map(step_of).to_numpy()

    def nearest(fracs):
        u = (lv / S) % 1.0
        return np.min([np.minimum(np.abs(u - f), 1 - np.abs(u - f)) for f in fracs], axis=0) * S / sigp
    E["near_round"] = nearest((0.0, 0.5)) <= NEAR
    E["near_arb"] = (nearest(ARB) <= NEAR) & ~E.near_round
    E["y"] = (E.outcome == "reject").astype(float)
    # same mix of rung and class: arbitrary reweighted
    R, A = E[E.near_round], E[E.near_arb]
    key = lambda d: (d.rung + d.klass).to_numpy()
    w = (pd.Series(key(R)).value_counts() / pd.Series(key(A)).value_counts()).reindex(key(A)).fillna(0).to_numpy()
    r_n, r_d = bs.sums(R.date, R.y.to_numpy()), bs.sums(R.date, np.ones(len(R)))
    a_n, a_d = bs.sums(A.date, A.y.to_numpy() * w), bs.sums(A.date, w)
    reps = (bs.W @ r_n) / (bs.W @ r_d) - (bs.W @ a_n) / (bs.W @ a_d)
    return {"n_round": int(len(R)), "n_arb": int(len(A)), "p_round": round(float(r_n.sum() / r_d.sum()), 4), "p_arb": round(float(a_n.sum() / a_d.sum()), 4),
            "diff": round(float(r_n.sum() / r_d.sum() - a_n.sum() / a_d.sum()), 4), "lo": round(float(np.percentile(reps, 2.5)), 4), "hi": round(float(np.percentile(reps, 97.5)), 4),
            "p": float((reps <= 0).mean())}


def stage_analyse():
    from reaction import cost_sigma, is_fx
    D = pd.read_parquet(OUT / "events.parquet")
    bs = LR.Boot(pd.read_csv(LINES, usecols=["date"]).date)
    cost = cost_sigma()
    arb = D[D.grid == "arb"]
    res = {"id": "vol-layer-round-numbers", "seed": 20261107, "B": 2000, "ranAt": pd.Timestamp.now("UTC").isoformat(), "prereg": "forge/VOL_LAYER_ROUND_NUMBERS_PREREG.md",
           "encounters": D.grid.value_counts().to_dict(), "replay": json.loads((OUT / "replay_check.json").read_text()), "cells": {}, "trades": {}, "mirror": {}, "slices": {}}
    for grid in ("00", "50"):
        rnd = D[D.grid == grid]
        for g in GEOM:
            k = f"{grid}_{g}"
            res["cells"][k] = cell(bs, rnd, arb, g, {})
            res["trades"][k] = trades(bs, rnd, g, cost)
            res["trades"][k + "_arb"] = trades(bs, arb, g, cost)
            res["mirror"][k] = mirror(bs, rnd, arb, g)
            sl = {}
            for name, mk in (("fx", lambda d: d.inst.map(is_fx)), ("fx_majors", lambda d: d.klass == "fx_majors"), ("fx_crosses", lambda d: d.klass == "fx_crosses"),
                             ("gold", lambda d: d.klass == "gold"), ("indices", lambda d: d.klass == "indices"),
                             ("first_half", lambda d: d.date < "2023-08-20"), ("second_half", lambda d: d.date >= "2023-08-20")):
                r2, a2 = rnd[mk(rnd).to_numpy()], arb[mk(arb).to_numpy()]
                if r2[f"out_{g}"].isin(["reject", "break"]).sum() >= 300:
                    sl[name] = cell(bs, r2, a2, g, {})
            res["slices"][k] = sl
    res["cells"]["lines_near_round"] = line_interaction(bs)
    order = sorted(res["cells"], key=lambda k: res["cells"][k]["p"])
    prev = 0.0
    for i, k in enumerate(order):
        prev = max(prev, min(1.0, res["cells"][k]["p"] * (len(order) - i)))
        res["cells"][k]["p_holm"] = round(prev, 4)
    passing = [k for k in order if res["cells"][k]["p_holm"] < 0.05]
    gate = [k for k in passing if k in res["trades"] and res["trades"][k]["net"][1] > 0 and res["trades"][k]["positive_folds"] >= 4]
    hw = max((c["hi"] - c["lo"]) / 2 for k, c in res["cells"].items() if k != "lines_near_round")
    res["passing_holm"], res["gate_cells"] = passing, gate
    res["verdict"] = "VALIDATED" if gate else ("CONTEXT" if passing else ("UNDERPOWERED" if hw > 0.015 else "NULL"))
    (OUT / "results.json").write_text(json.dumps(res, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o)), encoding="utf-8")
    write_md(res)


def write_md(r):
    md = ["# vol-layer-round-numbers: results", "", f"Prereg: `forge/VOL_LAYER_ROUND_NUMBERS_PREREG.md`. Run 2026-11-07, seed {r['seed']}, B = {r['B']}. Ledger id `vol-layer-round-numbers`.", "",
          f"Replay check: {r['replay']['match']:.4%} match with LINE-REACTION on {r['replay']['encounters']:,} encounters.", "", f"## Verdict: {r['verdict']}", "",
          "## Scored cells: P(reject | resolved)", "", "| cell | n | round / lines near round | arbitrary | diff [95%] | Holm p |", "|---|---|---|---|---|---|"]
    for k, c in r["cells"].items():
        md.append(f"| {k} | {c['n_round']:,} | {c['p_round']:.4f} | {c['p_arb']:.4f} | {c['diff']:+.4f} [{c['lo']:+.4f}, {c['hi']:+.4f}] | {c['p_holm']:.3f} |")
    md += ["", "## Fade net of one spread (units of K)", "", "| cell | n | gross | net | cost | folds + |", "|---|---|---|---|---|---|"]
    for k, t in r["trades"].items():
        md.append(f"| {k} | {t['n']:,} | {t['gross'][0]:+.3f} [{t['gross'][1]:+.3f}, {t['gross'][2]:+.3f}] | {t['net'][0]:+.3f} [{t['net'][1]:+.3f}, {t['net'][2]:+.3f}] | {t['mean_cost_K']:.3f} | {t['positive_folds']}/{t['folds']} |")
    md += ["", "## Mirror: how far past the level on breaks, 60 minutes (σ)", "", "| cell | round | arbitrary | diff [95%] |", "|---|---|---|---|"]
    for k, m in r["mirror"].items():
        md.append(f"| {k} | {m['beyond60_round']:.3f} | {m['beyond60_arb']:.3f} | {m['diff']:+.3f} [{m['lo']:+.3f}, {m['hi']:+.3f}] |")
    md += ["", "## Slices (descriptive)", "", "| cell | slice | n | round | arbitrary | diff [95%] |", "|---|---|---|---|---|---|"]
    for k, sl in r["slices"].items():
        for n, c in sl.items():
            md.append(f"| {k} | {n} | {c['n_round']:,} | {c['p_round']:.4f} | {c['p_arb']:.4f} | {c['diff']:+.4f} [{c['lo']:+.4f}, {c['hi']:+.4f}] |")
    (OUT / "RESULTS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", choices=["check", "events", "analyse"], required=True)
    a = ap.parse_args()
    {"check": stage_check, "events": stage_events, "analyse": stage_analyse}[a.stage]()
