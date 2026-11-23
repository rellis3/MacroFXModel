"""ladder-exhaustion-accuracy (forge/LADDER_EXHAUSTION_ACCURACY_PREREG.md): absolute error of p50 HL and Close lines,
ours (QLIKE walk-forward picks) vs Jordan's recipe as published (3-day ATR x textbook constants).
    python scripts/ladder-exhaustion-accuracy/score.py -> analysis/output/ladder-exhaustion-accuracy/
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/ladder-wide-race"))
import importlib.util  # noqa: E402
import race as R  # noqa: E402
_spec = importlib.util.spec_from_file_location("jordan_recipe", ROOT / "scripts/ladder-jordan-recipe/score.py")
JR = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(JR)  # ladder-jordan-recipe; j_arms

QP, SEED = R.QP, 20261123
OUT = ROOT / "analysis/output/ladder-exhaustion-accuracy"
OUT.mkdir(parents=True, exist_ok=True)
K = {"hl": 1.572, "oc": 0.6745}
LOG: list[str] = []


def say(s=""):
    sys.stdout.reconfigure(encoding="utf-8")
    print(s, flush=True)
    LOG.append(str(s))


def main():
    rng = np.random.default_rng(SEED)
    E, desc = {}, []
    for sym in QP.SYMS:
        T, old = QP.lines(sym)
        T = T.reset_index(drop=True)
        J, _ = JR.j_arms(sym, T)
        _, ok = QP.qlike_rows(T, old)
        ok = ok & (T["oc"].to_numpy() > 0)
        yrs = T["year"].to_numpy()
        test = (yrs >= 2020) & ok & np.isfinite(J["J_atr3"]) & np.isfinite(J["J_ema15"])
        hl = T["hl"].to_numpy()
        big_prev = np.zeros(len(T), bool)                  # prior session's HL above its prior-year 80th pct
        ph = pd.Series(hl).shift(1)
        thr = pd.Series(hl).shift(1).rolling(250, min_periods=120).quantile(0.8)
        big_prev = (ph > thr).to_numpy()
        E[sym] = {}
        for q in ("hl", "oc"):
            sig = {(a, q): QP.sig(T, a, q).astype(float) for a in old}
            Q = {k: R.qlike(T, R.h_series(T, s, q, ok), q, ok) for k, s in sig.items()}
            sel, _ = R.picks(T, Q, old, ok, q)
            ours = QP.take(T, sel, f"_{q}_50")
            act = T[q].to_numpy()
            lines = {"OURS": ours, "JORDAN": K[q] * J["J_atr3"], "BANK": K[q] * J["J_ema15"]}
            m = test & np.isfinite(ours)
            E[sym][q] = {k: np.abs(v - act)[m] for k, v in lines.items()}
            E[sym][q]["_yrs"] = yrs[m]
            for k, v in lines.items():
                rel = np.abs(v[m] / act[m] - 1)
                for grp, g in (("all", np.ones(m.sum(), bool)), ("after big day", big_prev[m]),
                               ("other days", ~big_prev[m])):
                    desc.append(dict(sym=sym, line=q, who=k, days=grp, n=int(g.sum()),
                                     mae=float(np.mean(np.abs(v[m] - act[m])[g])),
                                     median_ae=float(np.median(np.abs(v[m] - act[m])[g])),
                                     within10=float(np.mean(rel[g] <= 0.10) * 100),
                                     within20=float(np.mean(rel[g] <= 0.20) * 100),
                                     mean_line=float(np.mean(v[m][g])), mean_actual=float(np.mean(act[m][g]))))
    res = {}
    for q in ("hl", "oc"):
        for who in ("JORDAN", "BANK"):
            def pairs():
                return {s: (E[s][q]["_yrs"], E[s][q][who], E[s][q]["OURS"]) for s in QP.SYMS}
            r = {"all": QP.rel_delta(pairs(), rng)}
            for h, yr in QP.HALVES.items():
                r[h] = QP.rel_delta(pairs(), rng, yr)
            p = pairs()
            r["syms"] = {s: QP.rel_delta({s: p[s]}, rng) for s in QP.SYMS}
            res[f"{q}_{who}"] = r
    hlJ = res["hl_JORDAN"]
    verdict = ("VALIDATED" if hlJ["all"][1][1] < 0 and all(hlJ[h][1][1] < 0 for h in QP.HALVES)
               else "NULL" if hlJ["all"][1][0] > -0.5 else "UNDERPOWERED")
    for k, r in res.items():
        say(f"\n== {k}: total abs error vs OURS (% change; negative = theirs nearer the actual)")
        for h in ("all", *QP.HALVES):
            say(f"  {h:8s} {r[h][0]:+.2f}% [{r[h][1][0]:+.2f}, {r[h][1][1]:+.2f}]")
        say("  " + "  ".join(f"{s} {pt:+.1f}% [{ci[0]:+.1f},{ci[1]:+.1f}]" for s, (pt, ci) in r["syms"].items()))
    say(f"\nVERDICT (HL, Jordan as published vs ours): {verdict}")
    D = pd.DataFrame(desc)
    D.to_csv(OUT / "accuracy.csv", index=False)
    say("\n== Descriptive: mean abs error (% of open), median abs error, % of days within 10% / 20% of the actual, mean line vs mean actual")
    for (s, q, g), x in D.groupby(["sym", "line", "days"], sort=False):
        say(f"  {s:7s} {q} {g:13s} n={x.n.iloc[0]:4d}  " + "  |  ".join(
            f"{r.who} {r.mae:.3f}/{r.median_ae:.3f} {r.within10:.0f}%/{r.within20:.0f}% line {r.mean_line:.2f} vs {r.mean_actual:.2f}"
            for r in x.itertuples()))
    (OUT / "results.json").write_text(json.dumps(dict(seed=SEED, verdict=verdict, deltas=res), indent=1, default=str))
    (OUT / "report.txt").write_text("\n".join(LOG), encoding="utf-8")


if __name__ == "__main__":
    main()
