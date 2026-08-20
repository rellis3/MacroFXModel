#!/usr/bin/env python3
"""Stage 3 of MD files/CB_SENTIMENT_PRICE_TEST.md — the registered confirmatory
cell: does Δhawkishness (Scorer A, cb-lexicon-v1) predict the post-release
daily dollar drift?

Design FROZEN in the pre-registration before any score existed:
  cell 1 (confirmatory): R1 ~ dScore — pass iff slope>0, |t|>=2, N>=60,
          and sign-stable across the 2016-2020 / 2021-2026 halves.
  cell 2 (validity only): R0 ~ dScore — if ~0 the scorer measures nothing
          and cell 1 is void.
Scorer B (LLM, dLlmScore) is reported alongside as EXPLORATORY — it cannot
pass Stage 3 alone (hindsight contamination, see the pre-registration).

Inputs: stage1_events.csv (price windows, produced by stage1_event_study.py)
        fomc_lexicon_scores.json (the deployed server's backfill output,
        committed verbatim for provenance).
Run from repo root: python3 analysis/fomc_event_study/stage3_score_join.py
"""
import json
import math
import os

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))


def ols(x, y):
    n = len(x)
    beta = ((x - x.mean()) * (y - y.mean())).sum() / ((x - x.mean()) ** 2).sum()
    resid = y - (y.mean() + beta * (x - x.mean()))
    se = math.sqrt((resid ** 2).sum() / (n - 2) / ((x - x.mean()) ** 2).sum())
    r = x.corr(y)
    return beta, beta / se, r, n


def main():
    ev = pd.read_csv(os.path.join(HERE, "stage1_events.csv"))
    scores = json.load(open(os.path.join(HERE, "fomc_lexicon_scores.json")))
    sc = pd.DataFrame(scores["meetings"])
    df = ev.merge(sc, on="date", how="inner")
    df = df[df["join_ok"]]

    print(f"joined events: {len(df)} (stage1 {len(ev)} x scores {len(sc)})")

    # ── registered confirmatory cell 1: R1 ~ dScore (lexicon) ──
    d = df.dropna(subset=["dScore", "r1"])
    b, t, r, n = ols(d.dScore, d.r1)
    halves = {}
    for name, part in (("2016-2020", d[d.date < "2021"]), ("2021-2026", d[d.date >= "2021"])):
        hb, ht, hr, hn = ols(part.dScore, part.r1)
        halves[name] = (hb, ht, hn)
    stable = (halves["2016-2020"][0] > 0) == (halves["2021-2026"][0] > 0)
    print(f"\nCELL 1 (REGISTERED, confirmatory) R1 ~ dScore[lexicon]: "
          f"N={n} slope={b:.4f} t={t:.2f} corr={r:.3f}")
    for k, (hb, ht, hn) in halves.items():
        print(f"  {k}: slope={hb:.4f} t={ht:.2f} N={hn}")
    verdict = b > 0 and abs(t) >= 2 and n >= 60 and stable
    print(f"  pass bar: slope>0 AND |t|>=2 AND N>=60 AND sign-stable halves "
          f"-> {'PASS' if verdict else 'FAIL'}")

    # ── cell 2 (validity check only): R0 ~ dScore ──
    d0 = df.dropna(subset=["dScore", "r0"])
    b0, t0, r0c, n0 = ols(d0.dScore, d0.r0)
    print(f"\nCELL 2 (validity, not pass/fail) R0 ~ dScore[lexicon]: "
          f"N={n0} slope={b0:.4f} t={t0:.2f} corr={r0c:.3f}")

    # ── exploratory: the LLM scorer, same cells ──
    dl = df.dropna(subset=["dLlmScore", "r1"])
    lb, lt, lr, ln = ols(dl.dLlmScore, dl.r1)
    dl0 = df.dropna(subset=["dLlmScore", "r0"])
    lb0, lt0, lr0, ln0 = ols(dl0.dLlmScore, dl0.r0)
    print(f"\nEXPLORATORY (Scorer B, LLM — cannot pass alone):")
    print(f"  R1 ~ dLlmScore: N={ln} slope={lb:.4f} t={lt:.2f} corr={lr:.3f}")
    print(f"  R0 ~ dLlmScore: N={ln0} slope={lb0:.4f} t={lt0:.2f} corr={lr0:.3f}")

    # descriptive: level scores vs windows, and scorer agreement
    agree = df.dropna(subset=["score", "llmScore"])
    print(f"\ndescriptive: corr(lexicon level, LLM level) = "
          f"{agree.score.corr(agree.llmScore):.3f}  (N={len(agree)})")
    d5 = df.dropna(subset=["dScore", "r5"])
    b5, t5, r5c, n5 = ols(d5.dScore, d5.r5)
    print(f"descriptive R5 ~ dScore: N={n5} slope={b5:.4f} t={t5:.2f}")

    df.to_csv(os.path.join(HERE, "stage3_joined.csv"), index=False)


if __name__ == "__main__":
    main()
