# level-context-engine: does the right trade at a volatility level depend on the level, the time of day, the touch number and the path?

**Pre-registered 2026-11-25, before any outcome in this design was computed.**

| | |
|---|---|
| ID / ledger id | `level-context-engine` |
| Branch | `jvphone` (pushed to main through the sparse worktree) |
| Register row | `plans/RESEARCH_REGISTER.md` → `level-context-engine` |
| Source | Owner 2026-11-25: "are we trading the right levels at the right time of day?" Treat every touch as its own event; test early-median continuation, late P75/P90 rejection, range consumed, touch number and touch sequence; build a level × time-of-day matrix; decide whether a dynamic (context-aware) level model beats a static one, out of sample |
| Data | 25 NT8 futures (`ladder-qlike-per-line-fut` set), unadjusted M1, sessions 00:00–22:00 London, 2020-01-02 → **2026-08-21** (lockbox respected). 40 CFDs (`ladder-qlike-per-line-cfd` set) as a gross-only replication universe |
| Seed | `20261125` |
| Uncertainty | date-clustered bootstrap (all instruments' events on one London date resample together), B = 1000, 90% CI |
| Scripts / outputs | `scripts/level-context-engine/` → `analysis/output/level-context-engine/` |
| Lessons applied | placebo ladder beside every line (a level effect must beat a level placed nowhere special); OOS split fixed before results; costs on; one position at a time in the engine; date clusters for stacked touches |

## 1. Claim

The outcome after a level touch (continue through vs reject) depends on which level it is, the time of day, the touch
number, the approach and the path taken so far, enough that a context-aware rule (continue at some, fade at others)
makes money after costs out of sample and beats the same rule fitted on placebo levels.

## 2. Why this isn't already settled

Earlier studies counted touches by line, hour and touch number one factor at a time (`close-level-reversal`,
`level-touch-excursions`, `line-touch-mae-futures`, `trade-at-lines`) and traded one rule everywhere. None conditioned on
range consumed, the speed of the approach, the vol regime, the approach side (first touch vs retest from beyond), the
order in which tiers were reached, or fitted a cell/model rule in one period and traded it in another.

## 3. Definitions

**Levels (15 per session, each its own walk-forward QLIKE calc, as in `close-level-reversal` / `jordan-lines-mae`):**
- **High / Low** = the site's OH / OL lines (open ± OH/OL quantile), fixed for the day.
- **Close+ / Close−** (Jordan), fixed.
- **HL projections** (Jordan), moving: running low + HL, running high − HL.
- Tiers **Median / P75 / P90** for each.
- Placebo: the same 15 lines with distances scaled by one draw per session per line from 0.75–0.90 or 1.10–1.25.

**Touch events:** every touch, re-armed after price moves 0.1 line-σ away.
- **Inside approach:** from the open side, which includes the first touch.
- **Outside approach:** a retest from beyond after a break.
- **Touch number:** counts every touch of that line that session, either side (1, 2, 3, 4+).

**Context at the touch** (known by bar t; nothing from t+1 on):
- **Time of day (London):** 00–07 Asia, 07–10 London open, 10–13 London, 13–16 NY overlap, 16–22 NY afternoon. Minutes since 00:00 London.
- **Prior move:** the signed move in the approach direction over the previous 30 minutes, in line σ. Buckets: < 0.15, 0.15–0.35, > 0.35 ("slow / normal / fast").
- **Range consumed:** (running high − running low through bar t−1) ÷ the day's forecast HL median. Buckets: < 0.6, 0.6–0.9, 0.9–1.2, > 1.2.
- **Vol regime:** today's line σ ÷ the median of the previous 250 sessions' σ. Buckets: < 0.85, 0.85–1.15, > 1.15.
- **Trend:** whether the previous session's close-to-close return agrees with the approach direction.
- **Sequence:**
  - the previous touch of the same line, resolved before t (rejected / continued / unresolved);
  - for P75 and P90 touches, whether the next tier in, same family, was first touched within 30 minutes (fast ladder) or earlier (slow ladder);
  - for the first P75 / P90 touch, whether the inner tier's first touch was rejected.

**Outcomes** (from bar t+1, so the touch bar's own path is never used):
- **Continuation:** price goes u = 0.25 line-σ further in the approach direction before going u back.
- **Rejection:** the reverse.
- **Consolidation:** neither within 120 minutes, or the session ends first.
- **Same bar:** both reached on one bar counts against whichever trade is taken (stop first), and is reported.
- **Excursions:** MFE and MAE in the continuation direction at 15 / 30 / 60 / 120 minutes, in σ and ticks.
- **Trades** (entry at the line, 1:1 bracket of u, 120-minute cap with a mark-to-market exit):
  - Continue R: +1 / −1 / mark.
  - Fade R: the mirror.
  - Futures net = gross − 2.5 ticks ÷ u. CFDs gross.
  - Secondary (descriptive): a 1:2 bracket.
- **Ladder race:** at the first P75 touch of a family/side, P(P90 is reached before the median) the same session. Benchmark: the same race on the placebo ladder.

## 4. Hypotheses (primary, futures)

Every hypothesis uses touch-level means with date-clustered bootstrap. "Line" = real levels; "vs placebo" = line minus
placebo in the same cell.

- **H1 early Median continues:** Median touches, inside approach, touch 1, 00–10 London. Continue net R > 0, and line − placebo > 0.
- **H2 late P75/P90 reject:** P75 + P90 touches, inside approach, 13–22 London. Fade net R > 0, and line − placebo > 0.
- **H3 range consumed:** inside-approach touches, all tiers. P(rejection) in the > 1.2 bucket minus the < 0.6 bucket > 0, and line − placebo > 0.
- **H4 touch number:** P(continuation) at touch 2+ minus touch 1, both ≠ 0, line − placebo ≠ 0 (two-sided).
- **H5 sequence:** P90 touches after a fast ladder (P75 first touched ≤ 30 minutes earlier) minus after a slow ladder, P(continuation), two-sided, line − placebo.
- **H6 the engine (the main test):** a cell rule chosen on **2020-01-02 → 2023-12-31** and traded **2024-01-02 → 2026-08-21**.
  - Cells: family × tier × time bucket × touch (1 / 2 / 3+) × approach × range-consumed bucket.
  - A cell is traded if its train continue-net-R or fade-net-R is > 0 with a date-clustered 90% CI above 0 and n ≥ 150. Take the better side.
  - The test trades the chosen cells, one open position per instrument (the earliest signal; ties go P90 > P75 > Median, then High/Low > Close± > HL).
  - **H6a:** test net R per trade > 0.
  - **H6b:** test net R (engine fitted on real levels) − test net R (the same procedure fitted and traded on the placebo ladder) > 0.
- **H6-model (secondary):** a regularised logistic regression of continuation vs rejection on all context features plus tier × time and tier × consumed interactions, fitted on 2020–23. Trade the side it predicts when |2p − 1| exceeds the cost in R. Same test window, same placebo comparison. Out-of-sample AUC is reported.

**Gates:**
- **H1–H3:**
  - **VALIDATED** if:
    - the 90% CIs of both the line net R and line − placebo are above 0,
    - both halves (2020–22, 2023–26) have the same sign,
    - and the test survives BH q = 0.10 over the six primary tests (H1–H5, H6b).
  - **NULL** if the upper CI of line − placebo is below +0.02R (H1, H2) or below +1 pp (H3).
  - Otherwise **UNDERPOWERED**.
- **H4–H5:** two-sided. **CONTEXT** if line − placebo is ≠ 0 and survives BH. NULL if the CI sits inside ±1 pp. Otherwise UNDERPOWERED.
- **H6:**
  - **VALIDATED** if:
    - H6a's CI is above 0,
    - H6b's CI is above 0 and survives BH,
    - and the test-window halves (2024, 2025–26) are both > 0.
  - **NULL** if H6b's upper CI is below +0.02R.
  - Otherwise UNDERPOWERED.
- **The mirror:** an H1/H2 effect is a "level effect" only if it holds in sign for the High/Low, Close± and HL families separately.
- **CFD replication:** the same hypotheses, gross, reported beside. CFDs cannot validate on their own, but a sign flip on CFDs is reported as a caveat.

## 5. Power

From earlier runs: about 165k Close± and 85k HL futures touches, plus a similar number for OH/OL. An H1 cell
(first-touch median, 00–10) is about 25–35k events. At p ≈ 0.5, the SE of the continuation share is about 0.3 pp
before clustering and about 0.6 pp after, so the MDE is about 1.5–2 pp, or about 0.03–0.04R. H6's test window is about
40% of events.

## 6. Multiplicity

There are six primary tests (H1–H5, H6b), with BH q = 0.10.

The performance matrix (level × time × session × touch × approach × outcome) is descriptive. Its cells carry
BH-adjusted q-values across all cells, and no cell from it is promoted to a finding without a new prereg on forward
data.

These parameters are fixed here: u = 0.25σ, the 120-minute cap, the buckets, the 2020–23 / 2024–26 split and n ≥ 150.

## 7. What it does NOT test

- Other bracket sizes as primary.
- Order flow or VWAP context (banked elsewhere).
- Sizing, CFD costs.
- The lockbox period (after 2026-08-21).

## 8. What each verdict changes

- **H6 VALIDATED:** the engine's cell table goes on the site in shadow as the level playbook (which side, at which level, when), with forward logging. Live calcs are untouched.
- **H6 NULL:** a static view of the levels is as good as a context one. The levels stay range and exhaustion context, not entries. Matrix cells are pointers only.
- **H1–H5:** each answers the owner's question directly (continue vs fade, timing, touch number, sequence) with a graded weight.

## Amendments

(none yet)
