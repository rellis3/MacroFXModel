"""Score C.OG's two setups x direction rules (forge/COG_SETUPS_PREREG.md).

    python scripts/cog_setups/score.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

D = Path("analysis/output/cog_setups")
B, SEED = 2000, 20261007
RULES = {"none": lambda X: X, "T20-with": lambda X: X[X.side == X.t20], "T20-against": lambda X: X[X.side == -X.t20],
         "P1-with": lambda X: X[X.side == X.p1], "P1-against": lambda X: X[X.side == -X.p1]}
HALF = "2021-09"


def boot(a, b=None, rng=None):
    """Mean R (or a minus b) with p (one-sided, <= 0) from a month-block bootstrap over the union of months."""
    months = sorted(set(a.date.str[:7]) | (set(b.date.str[:7]) if b is not None else set()))
    ga = {m: g.R.to_numpy() for m, g in a.groupby(a.date.str[:7])}
    gb = {m: g.R.to_numpy() for m, g in b.groupby(b.date.str[:7])} if b is not None else None
    reps = []
    for _ in range(B):
        pick = rng.choice(months, len(months))
        x = np.concatenate([ga.get(m, np.empty(0)) for m in pick])
        v = x.mean() if len(x) else np.nan
        if gb is not None:
            y = np.concatenate([gb.get(m, np.empty(0)) for m in pick])
            v -= y.mean() if len(y) else np.nan
        reps.append(v)
    reps = np.array(reps)
    pt = a.R.mean() - (b.R.mean() if b is not None else 0)
    lo, hi = np.nanpercentile(reps, [2.5, 97.5])
    return dict(est=round(float(pt), 4), lo=round(float(lo), 4), hi=round(float(hi), 4), p=float(np.mean(reps <= 0)))


def stats(G):
    return dict(n=int(len(G)), win=round(float((G.R > 0).mean()), 4) if len(G) else None,
                target=round(float((G.outcome == "target").mean()), 4) if len(G) else None,
                stop=round(float((G.outcome == "stop").mean()), 4) if len(G) else None)


def main():
    T = pd.read_csv(D / "trades.csv")
    rng = np.random.default_rng(SEED)
    res, tests = {"primary": {}, "by_ins": {}, "his_window": {}, "mirror": {}, "his_lines": {}}, []
    for setup in ("A", "B"):
        X = T[T.setup == setup]
        for rule, f in RULES.items():
            G = f(X)
            r = stats(G) | {"meanR": boot(G, rng=rng)}
            if rule != "none":
                r["minus_none"] = boot(G, X, rng=rng)
            r["halves"] = [round(float(G[G.date < HALF].R.mean()), 4), round(float(G[G.date >= HALF].R.mean()), 4)]
            res["primary"][f"{setup}|{rule}"] = r
            tests.append(f"{setup}|{rule}")
            res["by_ins"][f"{setup}|{rule}"] = {i: round(float(g.R.mean()), 4) for i, g in G.groupby("ins")}
            W = G[(G.fill_min >= 13 * 60) & (G.fill_min < 16 * 60)]
            res["his_window"][f"{setup}|{rule}"] = stats(W) | {"meanR": round(float(W.R.mean()), 4) if len(W) else None}
        M = T[T.setup == "Bmirror"]
        for rule, f in RULES.items():
            G = f(M)
            res["mirror"][rule] = stats(G) | {"meanR": round(float(G.R.mean()), 4)}
    # Holm across the 10 primary tests (on the mean-R p-values)
    ps = sorted(((res["primary"][t]["meanR"]["p"], t) for t in tests))
    m, run = len(ps), 0.0
    for k, (p, t) in enumerate(ps):
        run = max(run, min(1.0, (m - k) * p))
        res["primary"][t]["holm_p"] = round(run, 4)
    for t in tests:
        r = res["primary"][t]
        ok = r["holm_p"] < 0.05 and r["meanR"]["lo"] > 0 and all(h > 0 for h in r["halves"])
        if not t.endswith("none"):
            ok = ok and r["minus_none"]["lo"] > 0
        r["pass"] = bool(ok)
    for setup in ("A_his", "B_his", "Bmirror_his"):
        X = T[T.setup == setup]
        res["his_lines"][setup] = {rule: stats(f(X)) | {"meanR": round(float(f(X).R.mean()), 4) if len(f(X)) else None}
                                   for rule, f in RULES.items()}
    res["verdict"] = [t for t in tests if res["primary"][t]["pass"]] or "NOTHING PASSES"
    (D / "results.json").write_text(json.dumps(res, indent=1))

    f = lambda c: f"{c['est']:+.3f} [{c['lo']:+.3f}, {c['hi']:+.3f}]"
    md = ["# C.OG's two setups at his own lines, and which direction (results)", "",
          "Pre-registration: `forge/COG_SETUPS_PREREG.md`. EURUSD, GOLD, NQ, M1, 2016-10 → 2026-08, his formula on a rebuilt σ. "
          "R = net result ÷ stop, after costs. 95% month-block bootstrap; Holm across the 10 primary tests.", "",
          f"## Verdict: **{res['verdict'] if isinstance(res['verdict'], str) else 'PASS: ' + ', '.join(res['verdict'])}**", ""]
    for setup, title in (("A", "Setup A: fade at his median line (stop at his 75th, target halfway back)"),
                         ("B", "Setup B: London-midnight retest, breakaway direction (stop 0.1σ, target his 75th)")):
        md += [f"### {title}", "", "| direction rule | n | mean R [95%] | Holm p | minus none [95%] | halves | win | target | stop | pass |",
               "|---|---|---|---|---|---|---|---|---|---|"]
        for rule in RULES:
            r = res["primary"][f"{setup}|{rule}"]
            mn = f(r["minus_none"]) if "minus_none" in r else ""
            md.append(f"| {rule} | {r['n']} | {f(r['meanR'])} | {r['holm_p']:.3f} | {mn} | {r['halves'][0]:+.3f} / {r['halves'][1]:+.3f} | "
                      f"{r['win'] * 100:.1f}% | {r['target'] * 100:.1f}% | {r['stop'] * 100:.1f}% | {'**yes**' if r['pass'] else 'no'} |")
        md += ["", "By instrument (mean R): " + "; ".join(
            f"{rule}: " + ", ".join(f"{i} {v:+.3f}" for i, v in res["by_ins"][f"{setup}|{rule}"].items()) for rule in RULES),
            "", "His 13:00–16:00 UK window (mean R, n): " + "; ".join(
                f"{rule} {res['his_window'][f'{setup}|{rule}']['meanR']:+.3f} ({res['his_window'][f'{setup}|{rule}']['n']})" for rule in RULES), ""]
    md += ["### Setup B mirror (retest taken AGAINST the breakaway)", "", "| rule | n | mean R | win | target |", "|---|---|---|---|---|"]
    for rule, r in res["mirror"].items():
        md.append(f"| {rule} | {r['n']} | {r['meanR']:+.3f} | {r['win'] * 100:.1f}% | {r['target'] * 100:.1f}% |")
    md += ["", "### His exact published lines, 2026-06-11 → 2026-08-20 (descriptive, tiny n)", "", "| setup | rule | n | mean R | win |", "|---|---|---|---|---|"]
    for s, rr in res["his_lines"].items():
        for rule, r in rr.items():
            if r["n"]:
                md.append(f"| {s} | {rule} | {r['n']} | {r['meanR']:+.3f} | {r['win'] * 100:.1f}% |")
    (D / "RESULTS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md))


if __name__ == "__main__":
    main()
