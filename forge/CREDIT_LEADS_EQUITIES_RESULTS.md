# Does credit move before equities? — result

*Run 2026-10-19 by `analysis/harness/credit_leads_equities.mjs` under
`forge/CREDIT_LEADS_EQUITIES_PREREG.md`. Full cells in `analysis/output/harness/credit-leads-equities.json`.*

## Verdict: **null**, as expected

12 scored cells (Moody's Baa−Aaa quality spread and Baa-over-Treasury × horizons 1/5/20 × direction
and vol-beyond-persistence), NAS100 + SPX500 pooled and date-clustered, OOS 2016 → 2026-10,
5,549–5,587 rows per cell. Every interval across zero, |IC| ≤ 0.07, BH-FDR 10% rejects none. The
60-session-lagged placebo cells look the same as the real ones.

| spread | h | direction IC [95%] | vol IC [95%] |
|---|---|---|---|
| Baa−Aaa | 1 | +0.017 [−0.019, +0.054] | −0.001 [−0.038, +0.035] |
| Baa−Aaa | 5 | −0.006 [−0.075, +0.056] | −0.030 [−0.094, +0.036] |
| Baa−Aaa | 20 | −0.053 [−0.164, +0.063] | −0.067 [−0.181, +0.047] |
| Baa−10y | 1 | −0.005 [−0.041, +0.032] | +0.037 [−0.005, +0.077] |
| Baa−10y | 5 | −0.017 [−0.080, +0.052] | +0.025 [−0.042, +0.094] |
| Baa−10y | 20 | −0.029 [−0.151, +0.084] | −0.073 [−0.189, +0.039] |

Direction IC is on −z, so "widening → down" would read positive. It does not.

## The descriptive leg (not scored, three years of data)

ICE HY OAS, 2023-12 → 2026-10, ~1,000 rows:

| h | direction IC | vol IC [95%] | p | halves | placebo vol IC |
|---|---|---|---|---|---|
| 1 | +0.063 | **+0.149 [+0.071, +0.233]** | 0.002 | +0.19 / +0.11 | −0.02 |
| 5 | +0.127 | **+0.255 [+0.104, +0.392]** | 0.002 | +0.35 / +0.13 | +0.02 |
| 20 | +0.134 | +0.200 [−0.022, +0.411] | 0.092 | +0.32 / +0.03 | +0.08 |

Widening in the junk-bond spread is followed by more realised equity vol than persistence predicts,
over the next day and week, in both halves, with a flat placebo. Direction is the right sign and
not significant. Three years is one regime (the 2024–25 cycle) and FRED's licensing cap stops the
series there, so by the pre-registration this is reported and not scored. The Moody's legs, which
do have history, show nothing — which may be because a yield-minus-Treasury quality spread is a
slower, smoother thing than an OAS on junk, or because the HY result is three years of luck.

## What changed on the pages

- Chain: `hy → nq` and `hy → spx` links added (sign −1). Holds text: agreement in the window, no
  lead at 1–20 sessions, tested.
- Market view `hy-spx`: "credit usually moves first" replaced by the tested statement.
- Ledger: `credit-leads-equities`, null, POWER recorded.

## Next, if wanted

A separate pre-registration for **HY OAS → next-week vol** on a long high-yield series: HYG or JNK
ETF prices from 2007 as the junk-credit leg (a price, not a spread — the spread must be rebuilt
against Treasuries, and the ETF's own vol confounds it), or the Cboe/ICE OAS history if a source
exists. Only then does the +0.26 mean anything.
