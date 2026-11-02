# Edges by regime: pre-registration (EXPLORATORY)

*Written 2026-11-01, before any number was computed. Register row: `edges-by-regime`. Status: EXPLORATORY. Nothing
here can promote an edge. The output is a context table for `state.html`, so the page can say "this edge was measured
in regimes like today's" or "it was not".*

## Question
Two range edges stand in the 2026-10-31 code audit: `vix-inversion` (PLAUSIBLE) and `us-extras-confirm`. A third,
`nq-down-week`, was graded FRAGILE. Is each effect present in every state the Market State Engine labels (vol,
credit, curve)? Or does it live in one regime only?

## Data (real, all public)
- **Indices.** `^NDX` and `^GSPC` daily OHLC from Yahoo, explicit period1/period2. These are exchange sessions.
  Cached to `data/` with the fetch date.
- **Vol.** VIX and VIX3M daily closes from the committed Cboe seeds (`analysis/surfaces/cboe/`).
- **Credit and curve.** FRED `BAMLH0A0HYM2` (HY OAS) and `T10Y2Y`, from the public CSV.
- **Lockbox.** Every row dated after 2026-08-21 is dropped before any computation, outcomes included.

## Outcome
`R = HL / ATR14`, where:
- HL is the session's high − low.
- ATR14 is the mean HL of the 14 sessions ending at the signal day t. It is known at t's close.
- For E1, `R` is the next session's (t+1) HL / ATR14.
- For E2, `R` is the mean HL over t+1..t+5, divided by ATR14.

## Edges (as banked, not re-tuned)
- **E1 `nq-down-week`.** NDX close(t) / close(t−5) − 1 ≤ −1%. Outcome on NDX.
- **E2 `vix-inversion`, first day.** VIX/VIX3M > 1 at t and ≤ 1 at t−1. Outcome on SPX (`^GSPC`).
- **Control.** All other days in the same regime (no event).
- **Effect.** mean R(event) − mean R(control).

## Regimes at t (point-in-time)
FRED daily series are first published the next business day, so they are taken as of t−1.
- **vol.** VIX close(t) above / at-or-below its trailing 252-session median.
- **credit.** HY OAS(t−1) − HY OAS(t−21): widening (> 0) / not widening (≤ 0).
- **curve.** T10Y2Y(t−1) < 0, inverted / ≥ 0, not inverted.

## Inference
- Effect within each regime half, plus the unconditional effect.
- 95% CI from a moving-block bootstrap: 20-session blocks over the date index, 2,000 reps, seed 20261101.
- Six regime cells per edge, twelve in total. Read them as a pattern, not twelve tests. No cell can validate
  anything.

## How it is read
- If both halves of a split have CIs clear of zero with the same sign, the edge is labelled "seen in both".
- If only one half does, it is labelled "measured in <half> only".
- Otherwise it is labelled "not resolved".
- The page shows the label for today's regime.
- The verdict word is CONTEXT.

## Amendment 1 (2026-11-01, written before the v2 run)
The v1 run broke the repo's data rules (`.claude/skills/data-rules`), and the owner flagged that it ignored data the
repo already holds:
- **Index bars.** v1 used Yahoo `^NDX`/`^GSPC` cash-index OHLC. The repo's notes say Yahoo cash-index ranges run
  14–28% low. v2 uses the committed NY-close daily bars built from M1:
  `oi_research_book/data/gex_range_es/{nas100,spx500}_nyclose_d1.parquet`.
  - Coverage is 2016-01-04 → 2026-08-20, which ends at the lockbox.
  - Bars with `n < 60` M1 bars are dropped.
- **Credit.** v1 used FRED's public HY OAS, which only starts in 2023-10. v2 uses the committed Moody's BAA − 10Y
  series (`analysis/output/cog_yield_dir/fred/BAA10Y.csv`, 1986 →). This is the long credit series the feature store
  carries (`credit_baa10y`).
  - Same rule as v1: 20-print change, taken as of t−1.
- **Curve.** v2 uses the committed `T10Y2Y.csv` in the same folder.
- **Unchanged:** outcome, events, regimes (vol, credit, curve), bootstrap, seed and the reading rules.
- **What is primary.** v2 is the primary result. v1 is kept in `results_v1_yahoo.json` as superseded, not deleted.
