"""ladder-qlike-per-line (forge/LADDER_QLIKE_PER_LINE_PREREG.md): per-line sigma models chosen on QLIKE, futures.

    python scripts/ladder-qlike-per-line/score.py   -> analysis/output/ladder-qlike-per-line/{results.json, report.txt, leaderboard.csv}

Seed 20261122. Lines: ladder.walk_forward (tau 10/25/50/75/90) on the futures rows of NQ / GOLD / EURUSD
(ladder-per-line build) and USDJPY (ladder-v2 rollout).
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts/ladder-v2"))
import ladder as L  # noqa: E402
from forge import vol as V  # noqa: E402

SEED, B, BLOCK = 20261122, 2000, 63
TAUS5 = (10, 25, 50, 75, 90)
LINES = ("hl", "oh", "ol")
QYEARS = range(2019, 2027)          # years with a walk-forward QLIKE value
TEST = range(2020, 2027)            # scored years (A1)
HALVES = {"2020-22": (2020, 2022), "2023-26": (2023, 2026)}
SYMS = ("NQ", "GOLD", "EURUSD", "USDJPY")
OUT = ROOT / "analysis/output/ladder-qlike-per-line"
LOG: list[str] = []


def say(s=""):
    sys.stdout.reconfigure(encoding="utf-8")
    print(s, flush=True)
    LOG.append(str(s))


def rows_dir(sym):
    return (f"analysis/output/ladder-per-line/build/{sym.lower()}" if sym != "USDJPY"
            else "analysis/output/ladder-v2-usdjpy")


def lines(sym, oracle=False):
    os.environ["LADDER_OUT"] = rows_dir(sym)
    L.TAUS = TAUS5
    S = pd.read_parquet(ROOT / rows_dir(sym) / "rows_F.parquet")
    S["rel"] = S["A0"] / S["A0"].rolling(250, min_periods=60).median().shift(1)
    arms = list(L.arms_for(sym))
    if oracle:
        m = float(np.nanmedian(S["oh"] / S["A0"]))
        S["ORACLE"] = np.sqrt(S["A0"] * S["oh"] / m)
        arms.append("ORACLE")
    T = L.walk_forward(S, sym, "F", arms, quiet=True).sort_values("date").reset_index(drop=True)
    T = T[T["date"] <= pd.Timestamp("2026-08-21")].reset_index(drop=True)
    if oracle:
        for q in ("hl", "ol", "oc"):
            for t in TAUS5:
                T[f"ORACLE_{q}_{t}"] = T[f"A0_{q}_{t}"] * 1.3
    return T, arms


def sig(T, a, q):
    if a == "ORACLE" and q != "oh":
        return T["A0"].to_numpy() * 1.3
    return T[a].to_numpy()


def qlike_rows(T, arms):
    """Per (arm, line): per-session QLIKE with h = c * sigma^2, c = mean(x^2/sigma^2) over 2018..Y-1 (walk-forward)."""
    yrs = T["year"].to_numpy()
    ok_all = np.ones(len(T), bool)
    for q in LINES:
        ok_all &= T[q].to_numpy() > 0
    Q = {}
    for a in arms:
        for q in LINES:
            x2, s2 = T[q].to_numpy() ** 2, sig(T, a, q) ** 2
            h = np.full(len(T), np.nan)
            for Y in QYEARS:
                tr, te = (yrs >= 2018) & (yrs < Y) & ok_all, yrs == Y
                if te.any() and tr.any():
                    h[te] = np.mean(x2[tr] / s2[tr]) * s2[te]
            r = x2 / h
            Q[(a, q)] = np.where(ok_all, r - np.log(np.where(r > 0, r, np.nan)) - 1, np.nan)
    return Q, ok_all


def pinball(T, a, q):
    return np.mean([V.pinball_loss(T[q].to_numpy(), T[f"{a}_{q}_{t}"].to_numpy(), t / 100) for t in TAUS5], axis=0)


def select(T, arms, Q, ok):
    P = {(a, q): pinball(T, a, q) for a in arms for q in LINES}
    yrs = T["year"].to_numpy()
    sel = {k: {q: np.full(len(T), None) for q in LINES} for k in ("Q1", "QL", "P1", "A0")}
    picks = {}
    for Y in TEST:
        tr, te = (yrs >= 2019) & (yrs < Y) & ok, yrs == Y
        if not te.any():
            continue
        mq = {k: float(np.nanmean(v[tr])) for k, v in Q.items()}
        mp = {k: float(np.nanmean(v[(yrs >= 2019) & (yrs < Y)])) for k, v in P.items()}
        q1 = min(arms, key=lambda a: sum(mq[(a, q)] for q in LINES))
        ql = {q: min(arms, key=lambda a: mq[(a, q)]) for q in LINES}
        p1 = min(arms, key=lambda a: sum(mp[(a, q)] for q in LINES))
        for q in LINES:
            sel["Q1"][q][te], sel["QL"][q][te], sel["P1"][q][te], sel["A0"][q][te] = q1, ql[q], p1, "A0"
        picks[Y] = {"Q1": q1, **{f"QL_{q}": ql[q] for q in LINES}, "P1": p1}
    return sel, picks


def pick_vec(V_, sel_q, q, n):
    out = np.full(n, np.nan)
    for a in set(x for x in sel_q if x is not None):
        m = sel_q == a
        out[m] = V_[(a, q)][m]
    return out


def take(T, sel_q, col):
    out = np.full(len(T), np.nan)
    for a in set(x for x in sel_q if x is not None):
        m = sel_q == a
        out[m] = T[f"{a}{col}"].to_numpy()[m]
    return out


def regime_miss(T, sel_s, keep):
    Tk = T[keep]
    edges = np.quantile(Tk["rel"], [.2, .4, .6, .8]); f = np.searchsorted(edges, Tk["rel"].to_numpy())
    gaps = []
    for q in LINES:
        for t, tg in ((75, .25), (90, .10)):
            hit = (Tk[q].to_numpy() > take(T, sel_s[q], f"_{q}_{t}")[keep]).astype(float)
            gaps += [abs(hit[f == k].mean() - tg) for k in range(5)]
    return float(np.mean(gaps) * 100)


def hit_rates(T, sel_s, keep):
    return {q: {t: float((T[q].to_numpy()[keep] > take(T, sel_s[q], f"_{q}_{t}")[keep]).mean() * 100) for t in (50, 75, 90)}
            for q in LINES}


def blocks(n, rng):
    nb = int(np.ceil(n / BLOCK))
    st = rng.integers(0, max(n - BLOCK, 1), size=(B, nb))
    return (st[:, :, None] + np.arange(BLOCK)[None, None, :]).reshape(B, -1)[:, :n]


def rel_delta(pairs, rng, years=None):
    pts, draws = [], []
    for sym, (yrs, new, base) in pairs.items():
        m = np.ones(len(yrs), bool) if years is None else (yrs >= years[0]) & (yrs <= years[1])
        nw, bs = new[m], base[m]
        pts.append(nw.sum() / bs.sum() - 1)
        bi = blocks(len(nw), rng)
        draws.append(nw[bi].sum(1) / bs[bi].sum(1) - 1)
    d = np.mean(draws, 0)
    return float(np.mean(pts) * 100), [float(np.quantile(d, .05) * 100), float(np.quantile(d, .95) * 100)]


def verdict(r, guard_ok):
    if r["all"][1][1] < 0 and all(r[h][1][1] < 0 for h in HALVES) and guard_ok:
        return "VALIDATED"
    if r["all"][0] >= 0 and r["all"][1][0] > -0.5:
        return "NULL"
    return "UNDERPOWERED"


def grade(r, v):
    pt, (lo, hi) = r["all"]
    if v == "VALIDATED":
        return "Strong"
    if hi < 0:
        return "Leaning"
    if pt < 0:
        return "Faint"
    if lo > -0.5:
        return "Against"
    return "Untested-properly"


def compare(TC, new, base, rng, by_q=None):
    def pairs(yrs_rng=None):
        out = {}
        for s, c in TC.items():
            k = c["keep"]
            qs = (by_q,) if by_q else LINES
            nw = sum(pick_vec(c["Q"], c["sel"][new][q], q, len(c["T"])) for q in qs)[k]
            bs = sum(pick_vec(c["Q"], c["sel"][base][q], q, len(c["T"])) for q in qs)[k]
            out[s] = (c["T"]["year"].to_numpy()[k], nw, bs)
        return out
    r = {"all": rel_delta(pairs(), rng)}
    for h, yr in HALVES.items():
        r[h] = rel_delta(pairs(), rng, yr)
    return r


def prep(sym, oracle=False):
    T, arms = lines(sym, oracle)
    Q, ok = qlike_rows(T, arms)
    sel, picks = select(T, arms, Q, ok)
    keep = (T["year"].to_numpy() >= TEST[0]) & ok
    return {"T": T, "arms": arms, "Q": Q, "sel": sel, "picks": picks, "keep": keep}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(SEED)
    res = {"seed": SEED, "B": B, "block": BLOCK, "syms": SYMS, "track": "F"}

    say("== positive control (ORACLE informed OH sigma) ==")
    PCT, pc_ok = {}, True
    for s in SYMS:
        c = prep(s, oracle=True)
        yrs_or = sum(1 for Y, p in c["picks"].items() if p["QL_oh"] == "ORACLE")
        n_y = len(c["picks"])
        say(f"  {s}: QL picks ORACLE for oh in {yrs_or}/{n_y} years")
        pc_ok &= yrs_or >= n_y - 1
        PCT[s] = c
    pc = compare(PCT, "QL", "Q1", rng)
    say(f"  delta QL vs Q1 {pc['all'][0]:+.2f}% {pc['all'][1]}")
    pc_ok &= pc["all"][1][1] < 0
    res["pc"] = {"pass": bool(pc_ok), "delta": pc}
    if not pc_ok:
        say("POSITIVE CONTROL FAILED, nothing scored")
        (OUT / "report.txt").write_text("\n".join(LOG) + "\n", encoding="utf-8")
        json.dump(res, open(OUT / "results.json", "w"), indent=1)
        return
    del PCT

    TC = {s: prep(s) for s in SYMS}
    for s, c in TC.items():
        say(f"{s}: {int(c['keep'].sum())} scored sessions {c['T']['date'][c['keep']].min().date()} -> {c['T']['date'][c['keep']].max().date()}, arms {len(c['arms'])}")

    # leaderboard: every arm's OOS QLIKE per line (2020+ rows, where every arm has a walk-forward c)
    lb = []
    for s, c in TC.items():
        k = c["keep"]
        for q in LINES:
            vals = {a: float(np.nanmean(c["Q"][(a, q)][k])) for a in c["arms"]}
            rk = sorted(vals, key=vals.get)
            for a in c["arms"]:
                lb.append({"sym": s, "line": q, "arm": a, "qlike": vals[a], "rank": rk.index(a) + 1, "n_arms": len(rk)})
    LB = pd.DataFrame(lb)
    LB.to_csv(OUT / "leaderboard.csv", index=False)
    say("\n== QLIKE leaderboard (OOS 2020-2026.08; top 3 per line, plus live A0) ==")
    for (s, q), g in LB.groupby(["sym", "line"], sort=False):
        g = g.sort_values("rank")
        a0 = g[g.arm == "A0"].iloc[0]
        say(f"  {s} {q}: " + ", ".join(f"{r.arm} {r.qlike:.4f}" for r in g.head(3).itertuples())
            + f" | A0 {a0.qlike:.4f} (#{int(a0['rank'])}/{int(a0.n_arms)})")

    res["picks"] = {s: c["picks"] for s, c in TC.items()}
    say("\n== per-year picks ==")
    for s, c in TC.items():
        say(f"  {s}: " + "; ".join(f"{Y} QL hl/oh/ol={p['QL_hl']}/{p['QL_oh']}/{p['QL_ol']} Q1={p['Q1']} P1={p['P1']}"
                                     for Y, p in c["picks"].items()))

    rm = {k: float(np.mean([regime_miss(c["T"], c["sel"][k], c["keep"]) for c in TC.values()])) for k in ("Q1", "QL", "P1", "A0")}
    rm_i = {s: {k: regime_miss(c["T"], c["sel"][k], c["keep"]) for k in ("Q1", "QL", "P1", "A0")} for s, c in TC.items()}
    hr = {s: {k: hit_rates(c["T"], c["sel"][k], c["keep"]) for k in ("QL", "P1", "A0")} for s, c in TC.items()}
    ql_abs = {s: {k: {q: float(np.nanmean(pick_vec(c["Q"], c["sel"][k][q], q, len(c["T"]))[c["keep"]])) for q in LINES}
                  for k in ("Q1", "QL", "P1", "A0")} for s, c in TC.items()}
    res.update(regime_miss=rm, regime_miss_by_inst=rm_i, hit_rates=hr, qlike_by_strategy=ql_abs)

    A = compare(TC, "QL", "Q1", rng)
    A["per_line"] = {q: compare(TC, "QL", "Q1", rng, by_q=q)["all"] for q in LINES}
    A["verdict"] = verdict(A, rm["QL"] <= rm["Q1"] + 0.5)
    A["grade"] = grade(A, A["verdict"])
    Bp = compare(TC, "QL", "P1", rng)
    Bp["per_line"] = {q: compare(TC, "QL", "P1", rng, by_q=q)["all"] for q in LINES}
    Bp["verdict"] = verdict(Bp, rm["QL"] <= rm["P1"] + 0.5)
    Bp["grade"] = grade(Bp, Bp["verdict"])
    vsA0 = compare(TC, "QL", "A0", rng)
    vsA0_P1 = compare(TC, "P1", "A0", rng)
    res.update(A=A, B=Bp, QL_vs_A0=vsA0, P1_vs_A0=vsA0_P1)

    say("\n== Part A: per-line QLIKE pick (QL) vs one QLIKE model (Q1); summed hl+oh+ol QLIKE, % change (neg = better) ==")
    for k in ("all", *HALVES):
        say(f"  {k}: {A[k][0]:+.2f}% [{A[k][1][0]:+.2f}, {A[k][1][1]:+.2f}]")
    say("  per line: " + ", ".join(f"{q} {v[0]:+.2f}% [{v[1][0]:+.2f}, {v[1][1]:+.2f}]" for q, v in A["per_line"].items()))
    say(f"  regime miss Q1 {rm['Q1']:.2f}pp, QL {rm['QL']:.2f}pp -> {A['verdict']} (weight: {A['grade']})")
    say("\n== Part B: QL vs the current pinball-chosen one model (P1) ==")
    for k in ("all", *HALVES):
        say(f"  {k}: {Bp[k][0]:+.2f}% [{Bp[k][1][0]:+.2f}, {Bp[k][1][1]:+.2f}]")
    say("  per line: " + ", ".join(f"{q} {v[0]:+.2f}% [{v[1][0]:+.2f}, {v[1][1]:+.2f}]" for q, v in Bp["per_line"].items()))
    say(f"  regime miss P1 {rm['P1']:.2f}pp, QL {rm['QL']:.2f}pp -> {Bp['verdict']} (weight: {Bp['grade']})")
    say(f"\n  QL vs live A0: {vsA0['all'][0]:+.2f}% {vsA0['all'][1]}; P1 vs A0: {vsA0_P1['all'][0]:+.2f}% {vsA0_P1['all'][1]}; A0 regime miss {rm['A0']:.2f}pp")
    say("\n== hit rates of the QL ladder (target 50 / 25 / 10) ==")
    for s in SYMS:
        say(f"  {s}: " + "; ".join(f"{q} {v[50]:.1f}/{v[75]:.1f}/{v[90]:.1f}" for q, v in hr[s]["QL"].items()))
    (OUT / "report.txt").write_text("\n".join(LOG) + "\n", encoding="utf-8")
    json.dump(res, open(OUT / "results.json", "w"), indent=1, default=str)


if __name__ == "__main__":
    main()
