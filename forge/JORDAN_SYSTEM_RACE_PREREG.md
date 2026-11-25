# jordan-system-race: does choosing the HL calc by trade result beat choosing it by forecast score?

**Pre-registered 2026-11-25, before any trade outcome by calc was computed.**

| | |
|---|---|
| ID / ledger id | `jordan-system-race` |
| Branch | `jvphone` (pushed to main through the sparse worktree) |
| Register row | `plans/RESEARCH_REGISTER.md` → `jordan-system-race` |
| Source | Jordan (a C.OG group member), 2026-11-19: "Clue: the best forecaster will not result in the best system". Every calc pick so far was made on forecast score (QLIKE, pinball, abs error), never on a trade's result. Owner 2026-11-25: "close the gap and see what the outcome is" |
| Data | **Futures (primary):** the 25 NT8 futures of `ladder-qlike-per-line-fut`, track F, unadjusted M1. **CFDs (replication):** the 40 OANDA CFDs of `ladder-qlike-per-line-cfd`, track C, M1 mid. Sessions 00:00–22:00 London, 2020-01-02 → **2026-08-21** (lockbox untouched) |
| Seed | `20261125` |
| Uncertainty | date-clustered bootstrap (sessions resampled with replacement, all instruments on a date together), B = 1000, 90% percentile CI |
| Scripts / outputs | `scripts/jordan-system-race/run.py` → `analysis/output/jordan-system-race/` |
| Harness | own script (reuses the walk-forward level code of `jordan-lines-mae` / `close-level-reversal`) |

## 1. Claim

On Jordan's HL line, the σ calc that gives the best **trade result** in earlier years gives a better trade result in
the next year than the calc with the best **QLIKE** (the current site pick).

## 2. Why this isn't already settled

- `ladder-wide-race`, `ladder-qlike-per-line(-fut/-cfd)` and `ladder-exhaustion-events` (H1 pinball pick, −0.12%)
  all chose calcs by forecast score. None scored a calc by what a trade made with it.
- `futures-qlike-trades` B (follow the p90 break, VALIDATED +0.054R) used one calc per line (QLIKE) and the OH/OL
  lines, not the HL moving projections.
- `jordan-lines-mae` (exploratory) found fading the HL p90 projection worse than placebo, a continuation pointer.

## 3. Definitions

- **HL projections** (Jordan's HL line, moving): projected high = running low (to the previous bar, open included) + W,
  projected low = running high − W. W = k_τ × σ_a × open / 100, where σ_a is calc a's forecast and k_τ is the τ
  quantile of realised HL / σ_a over the line's own days 2018…Y−1 (walk-forward, per calc).
- **Calcs raced:** every site arm of the instrument (`L.arms_for(sym)` minus `RC.NO_SITE`).
- **System S1, FOLLOW-HL90.** Per session and side, the first bar whose high reaches the p90 projected high (low reaches
  the p90 projected low). Enter with the break at the projection price. Stop = the p75 projection at that bar (fixed
  price). Exit at the 22:00 London close. Stop checked from the next bar. Up and down are separate trades.
- **System S2, FADE-HL75 → CLOSE±.** Per session and side, the first bar that reaches the p75 projection. Fade it.
  Stop = the p90 projection at that bar (fixed). Target = the Close± median line on that side (Close+ for a fade of
  the high, Close− for the low; their own QLIKE-pick calc, unchanged). Trade only if the target lies on the open side
  of the entry. First of stop / target from the next bar; a tie counts as the stop; unresolved trades are closed at
  22:00.
- **R** = (exit − entry) / |entry − stop| in the trade's direction.
- **Costs (futures):** 2.5 ticks per round trip (1 tick slippage each side plus commission), tick read from the
  contract's prices; net R = gross R − 2.5 ticks / stop distance. CFDs are scored gross (no per-instrument spread
  history), as a replication of the ranking only.
- **Picking rules,** per instrument × system × test year Y = 2021…2026:
  - **QL**: the HL line's walk-forward QLIKE pick (`RF.wf_pick` / `RC.wf_pick`, as on the site).
  - **SYS**: the calc with the highest mean net R per trade over 2020…Y−1 (≥ 30 trades; otherwise QL).
  - Descriptive only: hindsight-best calc per instrument (the ceiling), and the average over all calcs.

## 4. Hypotheses

- **H1 (primary, futures, S1):** mean net R per trade, SYS-picked minus QL-picked, test years 2021 → 2026-08-21 pooled.
- **H2 (futures, S2):** the same for the fade system.
- **THE GATE (per H):** VALIDATED if the 90% CI is above 0 **and** both halves (2021–23, 2024–26) are above 0
  **and** it survives BH q = 0.10 across the 4 tests (H1, H2 × futures, CFDs). NULL if the upper CI is below
  +0.02R (the smallest gain worth a different calc per system). Otherwise UNDERPOWERED.
- **THE MIRROR:** CFDs (gross) must agree in sign for a validated futures result to be called general.
- **Secondary (descriptive):** net R of each system under the QL pick, with its CI. This is S1 on HL projections, new
  mechanics next to the banked B on OH/OL. It is reported, not used for the verdict. Also how far apart the calcs are
  (spread of net R across calcs per instrument) and whether SYS picks are stable year to year.

## 5. Power

Not computable before outcomes without peeking at R by calc. If the calcs differ by less than about 0.02R in hindsight,
the test cannot pass; that ceiling is reported first so the reader sees whether a pass was possible.

## 6. Multiplicity

Four primary tests (2 systems × 2 families), BH q = 0.10. The calc pool is fixed by the site. Nothing else is varied.

## 7. What it does NOT test

Other trades, other lines (Close± calcs stay on QLIKE), stop or target sizes, session anchors, intraday-updated lines.

## 8. What each verdict changes

- **VALIDATED:** the site gets a "system pick" option per instrument for HL, chosen by trade result, beside QLIKE.
- **NULL:** keep QLIKE picks; Jordan's clue then points at the entry and timing, not the calc
  (`close-reversal-confirm`).
- **UNDERPOWERED:** keep QLIKE, log the SYS picks forward.

## Amendments

## RESULTS
