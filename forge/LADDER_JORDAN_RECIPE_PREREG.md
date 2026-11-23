# ladder-jordan-recipe: does a fast True-Range σ × textbook constants (the Jordan / C.OG-style recipe) beat our QLIKE picks?

**Pre-registered 2026-11-23, before any arm below was scored.**

| | |
|---|---|
| ID / ledger ids | `ladder-jordan-recipe` |
| Register row | `plans/RESEARCH_REGISTER.md` → `ladder-jordan-recipe` |
| Source | Owner 2026-11-23. Jordan's one-off 23 Nov levels (a C.OG group member, not C.OG) are matched best by a 2–3 day ATR-type σ (√252) × the driftless-Brownian constants (HL p50 1.572 / p75 2.049, Close± p50 0.6745 / p75 1.1503). The C.OG Bank "Daily Volatility Forecasting" page recommends an EMA of True Range. Exploratory fingerprint in the session scratchpad, not banked. Owner: "let's race it and see the score" |
| Instruments | Futures (NT8), as `ladder-wide-race`: NQ, GC, 6E, 6J |
| Window | scored 2020 → **2026-08-21** (lockbox untouched); c from 2018, picks from 2019 |
| Seed | `20261123`. B = 2000, 63-session blocks |
| Scripts | `scripts/ladder-jordan-recipe/` → `analysis/output/ladder-jordan-recipe/` |

## Arms (σ_daily = True-Range average ÷ 1.596, the Brownian mean range; days before the session only)

TR = max(H−L, |H−C₋₁|, |L−C₋₁|) ÷ C₋₁ on the futures NY-close daily bars of the build.
`J_atr2`, `J_atr3`, `J_atr10` (simple averages of 2/3/10 days); `J_ema15`, `J_ema30`, `J_ema40`, `J_ema50`,
`J_ema60` (EMA of TR, α = 0.15 … 0.60; α 0.15 is the Bank's recommendation).

## Scoring

**Part A (σ quality):** QLIKE exactly as `ladder-qlike-per-line` / `ladder-wide-race` (walk-forward c per arm and
line). JORDAN = per line, the walk-forward pick among the J_ arms only. Compared with OLD = the current QLIKE per-line
pick (old field, what the site's QLIKE ladder uses). Δ = summed QLIKE(JORDAN)/summed QLIKE(OLD) − 1, mean over 4
instruments, 90% CI by block bootstrap, all years and each half.

**Part B (as published, no refit):** h = c₀·σ² with the textbook constants instead of a fitted c: HL c₀ = 4 ln 2 =
2.773 (E[range²] of driftless Brownian motion), OH and OL c₀ = 1 (E[max²]). Arm = `J_atr3` (the fingerprint's best
match). Compared with OLD (fitted c) the same way.

Verdicts (each part): **VALIDATED** if CI upper < 0 overall and in both halves (Jordan-style better);
**NULL** if point ≥ 0 and CI lower > −0.5%; else **UNDERPOWERED**.

**Descriptive:** each J_ arm's out-of-sample QLIKE and its rank inside the `ladder-wide-race` leaderboard; hit rates
of the published-style lines (J_atr3 × textbook constants: HL 1.572/2.049/2.50, Close± 0.6745/1.1503/1.645) vs the
50/25/10% targets, beside the same rates for our QLIKE ladder.

## Controls

1. Mechanics: the TR series rebuilt here must reproduce `ladder-wide-race`'s day table (same bars; checked by
   Yang-Zhang 20 against the build at ≥ 95% within 1%).
2. OLD pick reproduces `ladder-qlike-per-line` QL QLIKE within 0.5%.

## What it changes

- **Part A or B VALIDATED:** a Jordan-style ladder goes on the site as a shadow set next to ours.
- **Otherwise:** keep ours; the score and hit rates go to the owner (and Jordan if wanted).

## Amendments
