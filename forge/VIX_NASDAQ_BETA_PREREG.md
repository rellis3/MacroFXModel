# vix-nasdaq-beta — C.OG's clarified ratio: does the signed VIX-per-Nasdaq % ratio, or how fast it is changing (dR/dt), carry information at extremes?

**Pre-registered 2026-10-23, before any outcome was computed.** Features: `analysis/output/vix-nasdaq-beta/FEATURES.md`.

| | |
|---|---|
| ID / ledger id | `vix-nasdaq-beta`; scored questions `vix-beta-level`, `vix-beta-change` |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `vix-nasdaq-beta` |
| Data | the vvix-nasdaq-ratio panel: daily closes 2009-09-14 → 2026-08-21 (lockbox), CBOE VIX family + FRED NASDAQ100, 4,259 sessions |
| Seed | `20261023` |
| Uncertainty | OLS, Newey–West lag = horizon; 200 shifted-signal placebos |
| Scripts / outputs | `scripts/vix-nasdaq-beta/` → `analysis/output/vix-nasdaq-beta/` |
| Harness | own scripts, reusing `scripts/vvix-nasdaq-ratio/model.py` |

## 1. The claim (required)

C.OG, 2026-10-23, 12:29 (verbatim in `education/cog-snippets.md` §3b):

> How quickly the ratio is changing could be modelled as dR/dt
> Where R is the relative change of vix % at time t / the relative change of Nasdaq % at time t
> Just make sure to factor in the sign as they're negatively correlated

## 2. Why it is not already settled (required)

This is a follow-up to `vvix-nasdaq-ratio`, banked the same day with **VALIDATED** for the vol reading: the unsigned
ratio's top decile → VIX −7% over the next month. That test used an **unsigned** ratio of realised vols and did not test
**dR/dt**. C.OG has now specified both.

The signed level largely duplicates the banked result: its percentile correlates −0.82 with the unsigned ratio's. So the
**level cells are scored with the banked ratio's flags as extra controls**. They must add information beyond it. The
change cells (dR/dt, correlation +0.25 with the level) are new.

## 3. Definitions, fixed in advance (required)

**Constructions:**

- **R over a window (`B_level`):** the slope of Δln VIX on Δln NDX over the last 20 sessions. This is the signed % VIX
  move per % Nasdaq move (median −4.9). Using a window makes a near-zero Nasdaq day harmless.
- **dR/dt (`B_change`):** B_level(d) − B_level(d−5).

**Extremes:** each construction's percentile within its last 252 sessions (causal). `hi` = top decile, `lo` = bottom
decile.

- Level `hi`: VIX is barely falling as Nasdaq rises, or rising with it, which is the classic warning reading.
- Level `lo`: VIX is overreacting to Nasdaq.
- Change `hi`: the relationship is weakening fast.
- Change `lo`: it is tightening fast.

**Timing, outcomes and controls:** identical to `vvix-nasdaq-ratio`.

- Entry is the close of d+1.
- Outcomes: `ret5`, `ret20`, `range20` (realised vol vs VXN) and `dvix20`.
- Controls: VIX percentile, VIX > VIX3M, VIX9D/VIX, the NDX 20-day return, NDX rv20/VXN.
- Level cells add **R_b_hi and R_b_lo** (the banked ratio's flags) as controls.

**Splits:** discover 2009–2015, validate 2016–2020, test 2021 → 2026-08-21.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| a | Beta level extremes add beyond the banked unsigned ratio | **Null** (−0.82 overlap) |
| b | dR/dt extremes predict VIX change or range | **Possible**, sign not predicted |
| c | Either predicts Nasdaq direction | **Null / underpowered** |
| | **THE GATE (16 cells)** | Holm α 0.05 across the 16 pooled cells; same sign in all three periods; \|t\| above the shifted-signal placebo p95 |
| | **THE MIRROR** | `lo` and `hi` are separate cells; a sign either way passes by the same gate |

## 5. Power (required)

This is the same panel, regression and outcomes as `vvix-nasdaq-ratio`, so its measured power applies (`power.json`
there). The Holm-16 bar (|t| ≈ 3.15) is slightly easier than Holm-24. 80% power needs ≈ 0.35 SD at 5 days and
≈ 0.6 SD at 20 days, against a pass bar of 0.2 SD. A cell is **NULL** only if its interval excludes ±0.2 SD, otherwise
**UNDERPOWERED**.

## 6. Multiplicity (required)

- **Scored:** 2 constructions × 2 tails × 4 outcomes = **16**. Holm, plus the period and placebo conditions.
- **Descriptive:** event paths around entries; the level cells *without* the R_b controls (to show how much is the
  banked effect).

## 7. What this does NOT test (required)

- Intraday R at time t: the intraday VIX and NDX legs now exist, with 60 days of history, so this is forward only.
- C.OG's exact time step.
- A trading rule.

## 8. What each verdict changes (required)

- **Pass:** a context line beside the banked VIX read, and dR/dt as a live chart quantity.
- **Null / underpowered:** recorded. The banked unsigned-ratio result stands as the usable read.

## Amendments

### A1 — 2026-10-23 — POST-HOC (results seen; demote-only)

These robustness checks were run on the one passing cell (dR/dt bottom decile → ret5), in
`scripts/vix-nasdaq-beta/robust.py`:

- extra controls for short-term reversal (Nasdaq 1d and 5d return);
- VIX's 5d and 20d change;
- the banked unsigned-ratio percentile;
- leave each year out in turn;
- drop the 10 largest flagged moves.

The rule was that any of them could demote the cell, and none did. With every control the t is 2.91, below the |t| ≥ 3
promotion bar, so the cell is research-only.

## RESULTS

See `analysis/output/vix-nasdaq-beta/RESULTS.md`.
