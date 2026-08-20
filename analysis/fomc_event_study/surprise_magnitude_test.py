#!/usr/bin/env python3
"""MD files/FOMC_SURPRISE_MAGNITUDE_TEST.md — does |Δhawkishness| predict the
SIZE of the post-release move? Design frozen in the doc before running.

Confirmatory cell: OLS |R1| ~ |dScore| (lexicon): pass iff slope>0, |t|>=2,
N>=60, slope positive in both halves.

Run from repo root: python3 analysis/fomc_event_study/surprise_magnitude_test.py
"""
import math
import os

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))


def ols(x, y):
    n = len(x)
    beta = ((x - x.mean()) * (y - y.mean())).sum() / ((x - x.mean()) ** 2).sum()
    resid = y - (y.mean() + beta * (x - x.mean()))
    se = math.sqrt((resid ** 2).sum() / (n - 2) / ((x - x.mean()) ** 2).sum())
    return beta, beta / se, x.corr(y), n


def spearman(x, y):
    return x.rank().corr(y.rank())


def main():
    df = pd.read_csv(os.path.join(HERE, "stage3_joined.csv"))
    d = df.dropna(subset=["dScore", "r1", "r0"]).copy()
    d["absD"] = d.dScore.abs()
    d["absR1"] = d.r1.abs()
    d["absR0"] = d.r0.abs()

    # ── confirmatory cell ──
    b, t, r, n = ols(d.absD, d.absR1)
    h1 = d[d.date < "2021"]
    h2 = d[d.date >= "2021"]
    b1, t1, _, n1 = ols(h1.absD, h1.absR1)
    b2, t2, _, n2 = ols(h2.absD, h2.absR1)
    stable = b1 > 0 and b2 > 0
    print(f"CONFIRMATORY |R1| ~ |dScore[lexicon]|: N={n} slope={b:.4f} "
          f"t={t:.2f} corr={r:.3f}")
    print(f"  halves: 2016-2020 slope={b1:.4f} t={t1:.2f} N={n1} | "
          f"2021-2026 slope={b2:.4f} t={t2:.2f} N={n2}")
    verdict = b > 0 and abs(t) >= 2 and n >= 60 and stable
    print(f"  pass bar: slope>0 AND |t|>=2 AND N>=60 AND both halves slope>0 "
          f"-> {'PASS' if verdict else 'FAIL'}")

    # ── descriptives ──
    b0, t0, r0c, n0 = ols(d.absD, d.absR0)
    print(f"\ndescriptive |R0| ~ |dScore|: N={n0} slope={b0:.4f} t={t0:.2f} "
          f"corr={r0c:.3f}")
    dl = df.dropna(subset=["dLlmScore", "r1", "r0"]).copy()
    dl["absDL"] = dl.dLlmScore.abs()
    lb, lt, lr, ln = ols(dl.absDL, dl.r1.abs())
    lb0, lt0, lr0, _ = ols(dl.absDL, dl.r0.abs())
    print(f"descriptive LLM |R1|~|dLlm|: t={lt:.2f} corr={lr:.3f} | "
          f"|R0|~|dLlm|: t={lt0:.2f} corr={lr0:.3f}")
    print(f"descriptive Spearman: |R1|~|dScore| {spearman(d.absD, d.absR1):.3f}"
          f"  |R0|~|dScore| {spearman(d.absD, d.absR0):.3f}")
    zero = d[d.absD == 0]
    nz = d[d.absD > 0]
    print(f"descriptive groups: zero-surprise N={len(zero)} "
          f"mean|R1|={zero.absR1.mean() * 1e4:.1f}bp mean|R0|={zero.absR0.mean() * 1e4:.1f}bp | "
          f"nonzero N={len(nz)} mean|R1|={nz.absR1.mean() * 1e4:.1f}bp "
          f"mean|R0|={nz.absR0.mean() * 1e4:.1f}bp")


if __name__ == "__main__":
    main()
