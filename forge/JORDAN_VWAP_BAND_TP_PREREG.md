# jordan-vwap-band-tp: does the owner's fixed-σ VWAP indicator, used for targets, make Jordan's lines tradeable?

**Pre-registered 2026-11-25, before any outcome with this indicator's exact construction was computed.**

| | |
|---|---|
| ID / ledger id | `jordan-vwap-band-tp` |
| Branch | `jvphone` (pushed to main through the sparse worktree) |
| Register row | `plans/RESEARCH_REGISTER.md` → `jordan-vwap-band-tp` |
| Source | Jordan (a C.OG group member): VWAP as the target of an exhaustion fade; "load your indicator on a futures chart"; "for bias-based trades use forecasting as targets, not entries"; his 2026-09-26 MAE table (GC 33.8 / NQ 114 / 6E 12.2 / 6J 12.0 median ticks). Owner 2026-11-25: pasted the indicator "VWAP Fixed Sigma + MFE MAE" (Pine v6) and asked whether Jordan sets TPs like this. Owner also asked for staged 15 / 30 / 60-minute MAE |
| Data | 25 NT8 futures (`ladder-qlike-per-line-fut`), unadjusted M1 with exchange volume, sessions 00:00–22:00 London (the CME session starts 18:00 CT = 00:00 London), 2020-01-02 → **2026-08-21**. CFDs not used (no exchange volume) |
| Seed | `20261125` |
| Uncertainty | date-clustered bootstrap, B = 1000, 90% CI |
| Scripts / outputs | `scripts/jordan-vwap-band-tp/run.py` → `analysis/output/jordan-vwap-band-tp/` |

## 1. Claim

Fading Jordan's lines where they meet the owner's outer VWAP bands, with the target at an inner band or VWAP, makes
money after costs and beats the same trade at placebo levels.

## 2. Why this isn't already settled

`futures-qlike-trades` C used a loose copy (14-session **mean**, σ as % of VWAP) as an **entry filter** with a VWAP
target, on OH/OL p75 lines (−0.086R). This study copies the indicator exactly, uses Jordan's own lines, and uses the
bands as **targets**. Band-level targets and the ±2σ re-entry signal have never been tested.

## 3. Definitions (the indicator, as coded)

- **VWAP:** source hlc3 × volume, reset each session. At bar t the bands use the VWAP of the bars before t (the
  indicator fixes VWAP at the confirmed close).
- **σ_v:** for each completed session, RMS of (hlc3 − VWAP) over its bars, in price. The fixed σ for a session is
  the **median of the previous 20 sessions** (sessions with fewer than 20 prior sessions are skipped). Bands are
  VWAP ± k·σ_v, k ∈ {1, 1.5, 2, 2.5, 3}.
- **Bars:** 1-minute. Windows are 15, 30 and 60 minutes, plus to 22:00 London.
- **Jordan's lines:** Close+ / Close− (median, 75th, 90th; fixed) and the HL moving projections. Each uses its own
  walk-forward QLIKE calc, as in `jordan-lines-mae`. Every touch counts, re-armed after 0.1 line-σ. Placebo levels at
  0.75–0.90 / 1.10–1.25 × distance.

**Parts:**
- **A. The indicator's own MFE/MAE** (descriptive). Fresh touches of ±2σ, ±2.5σ and ±3σ, as coded: the previous
  close is inside the band, and the high (or low) reaches the band of the previous bar. Entry is at the band. MAE and
  MFE run from the next bar over 15 / 30 / 60 minutes and to 22:00. Reported as mean / median / P75 / P90 in ticks and
  σ_v, set beside Jordan's table.
- **B. Staged MAE / MFE at Jordan's lines** (descriptive). The same stats for every line touch at 15 / 30 / 60
  minutes and to 22:00, in ticks and line σ.
- **C. Fade at the line, target at a band** (primary). At a touch of a Close± or HL line on the side away from
  VWAP, if the line is at or beyond the ±2σ_v band (z = (line − VWAP) / σ_v ≥ 2 in the fade's direction):
  - Enter at the line.
  - Stop = 0.30 line-σ beyond the line. The touch bar counts toward the stop, not the target.
  - Target = the ±1σ_v band (**C1**), or VWAP (**C2**), at its price at the touch.
  - First of stop / target; a tie counts as the stop; otherwise exit at 22:00.
  - Reported alongside: the same trade on touches with z < 2.
- **D. The indicator's ±2σ re-entry signal** (secondary). The previous close is outside ±2σ and this bar closes back
  inside. Enter at the close. Stop at the ±3σ band, target the ±1σ band, both fixed at entry. Skip if the entry is
  beyond the stop. Placebo: the same rule with the band multipliers scaled by one draw from 0.75–0.90 / 1.10–1.25 per
  session.
- **Costs:** 2.5 ticks per round trip; net R = gross R − 2.5 ticks / stop distance.

## 4. Hypotheses

For C1 and C2 (Close± and HL pooled, τ pooled):
- **H1:** net R per trade (line) minus net R per trade (placebo).
- **H2:** net R per trade (line).
- **THE GATE:** VALIDATED if both 90% CIs are above 0, both halves (2020–22, 2023–26) are above 0, and H1 survives
  BH q = 0.10 over the 3 tests (C1, C2, D). NULL if H1's upper CI is below +0.02R. Otherwise UNDERPOWERED.
- **D:** the same gate, with H1 = re-entry at the real bands minus the placebo bands.
- **THE MIRROR:** C must hold for both the Close± lines and the HL lines in sign, to be called a line effect.

## 5. Power

About 165,000 futures Close± touches and 85,000 HL touches. Even if only 20% sit beyond ±2σ_v, that leaves about
50,000 trades, an SE of about 0.01R, and a detectable effect of about +0.03R.

## 6. Multiplicity

Three primary tests (C1, C2, D), BH q = 0.10. The parameters (20 sessions, median, k = 2 entry, targets 1σ / VWAP,
stop 0.30σ, D stop 3σ) are fixed here. Parts A and B are descriptive.

## 7. What it does NOT test

Chart timeframes other than 1-minute bars for the band arithmetic, other look-backs, CFDs, sizing.

## 8. What each verdict changes

- **VALIDATED:** the band-target fade is drawn on the site, in shadow, as Jordan's trade.
- **NULL:** VWAP bands as targets don't rescue fades at the lines. Parts A and B still answer how Jordan's MAE table
  could be so small.
- **UNDERPOWERED:** log forward.

## Amendments

## RESULTS
