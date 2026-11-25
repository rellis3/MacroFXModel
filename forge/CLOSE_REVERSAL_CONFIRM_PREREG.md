# close-reversal-confirm: does waiting for the turn make Jordan's close levels work as reversing points?

**Pre-registered 2026-11-25, before any confirmation-entry outcome was computed.**

| | |
|---|---|
| ID / ledger id | `close-reversal-confirm` |
| Branch | `jvphone` (pushed to main through the sparse worktree) |
| Register row | `plans/RESEARCH_REGISTER.md` → `close-reversal-confirm` |
| Source | Jordan (a C.OG group member), 2026-11-20: "we use the close level as reversing points". `close-level-reversal` (banked NULL) and `jordan-lines-mae` (exploratory) tested entering **at the touch**: a coin flip, and a median 60-minute overshoot of about 0.16σ that the owner calls "already in a negative position" (2026-11-25). The owner asked whether the overshoot can be cut without overfitting; this tests the entry, not the lines |
| Data | **Futures (primary):** 25 NT8 futures, track F, unadjusted M1. **CFDs (replication):** 40 OANDA CFDs, track C, M1 mid. Sessions 00:00–22:00 London, 2020-01-02 → **2026-08-21** |
| Seed | `20261125` |
| Uncertainty | date-clustered bootstrap, B = 1000, 90% percentile CI |
| Scripts / outputs | `scripts/close-reversal-confirm/run.py` → `analysis/output/close-reversal-confirm/` |
| Harness | own script (same lines and touch rule as `jordan-lines-mae`) |

## 1. Claim

At Jordan's Close+ / Close− lines, waiting for price to turn back before fading gives a positive result and beats
the same rule at placebo levels. Entering at the touch does not.

## 2. Why this isn't already settled

`close-level-reversal`, `level-touch-excursions`, `level-stack-stop` and `jordan-lines-mae` all entered at the touch.
No study has tested a confirmation entry at the per-line QLIKE lines. `futures-line-research` listed "post-touch
confirmation" as an open option.

## 3. Definitions

- **Lines:** Close+ and Close−, median / 75th / 90th, each instrument × line on its own walk-forward QLIKE calc (as in
  `jordan-lines-mae`). Secondary: the HL moving projections (same τ).
- **Touches:** every touch, re-armed after 0.1 line-σ back off. **Placebo:** the same line at 0.75–0.90 or
  1.10–1.25 × its distance from the open (HL × m for projections), one draw per session × line × τ.
- **Entries** (each a fade toward the open side):
  - **C0, at the touch:** entry at the line, stop 0.20σ beyond the line (the median 60-minute overshoot).
  - **C1, 5-minute close back inside:** the first 5-minute bar (London clock buckets) ending at or after the touch,
    within 60 minutes, that closes back on the open side of the line. Entry at that close.
  - **C2, 0.05σ back inside:** the first bar after the touch, within 60 minutes, that trades 0.05σ back on the open
    side. Entry at that price.
  - For C1 and C2, stop = the furthest price beyond the line from the touch through the entry bar, plus 0.05σ.
  - No confirmation within 60 minutes: no trade (counted).
- **Exit:** 1R target (primary), 2R (secondary). First of stop / target from the next bar; a tie counts as the stop;
  unresolved trades are closed at 22:00 London.
- **Costs (futures):** 2.5 ticks per round trip; net R = gross R − 2.5 ticks / stop distance. CFDs gross.
- **Also reported:** share of touches that trade, stop distance in σ, adverse move after entry (60 minutes) in σ and
  futures ticks, win rate.

## 4. Hypotheses

For each confirmation rule r ∈ {C1, C2}, futures, Close± lines, τ pooled, 1R:
- **H1_r:** net R per trade (line) minus net R per trade (placebo, same rule).
- **H2_r:** net R per trade (line) itself.
- **THE GATE (per rule):** VALIDATED if H1_r and H2_r both have 90% CIs above 0, both halves (2020–22, 2023–26) are
  above 0, and H1_r survives BH q = 0.10 over the 4 primary tests (C1, C2 × futures, CFDs). NULL if H1_r's upper CI is
  below +0.02R. Otherwise UNDERPOWERED.
- **THE MIRROR:** CFDs (gross) must agree in sign for a validated futures result to be called general.
- **Descriptive:** C0 for reference; C1/C2 minus C0 on the line; by τ; by London hour bucket; touch number; 2R; HL
  projections; how much smaller the post-entry adverse move is than at the touch.

## 5. Power

From `jordan-lines-mae`: about 165,000 futures Close± touches, gross R SD about 1. Even if a rule trades a quarter of
them and SD rises to 1.2, the date-clustered SE is about 0.01R, so the 90% CI half-width is about 0.02R. The
test can detect about +0.03R line minus placebo.

## 6. Multiplicity

Four primary tests (2 rules × 2 families), BH q = 0.10. Rule parameters (5 minutes, 0.05σ, 60 minutes, stop buffer
0.05σ, C0 stop 0.20σ) are fixed here and not swept.

## 7. What it does NOT test

Order flow, VWAP, macro or vol filters at the touch; other stop or target sizes; position sizing.

## 8. What each verdict changes

- **VALIDATED:** the confirmation rule becomes the entry for the Close± fade on the site (shadow first) and the base for
  Jordan's trade.
- **NULL:** a bare price-turn confirmation does not turn Close± into reversing points. The remaining lever is context
  (time of day, vol so far, follow at the p90).
- **UNDERPOWERED:** log forward.

## Amendments

### A1 — 2026-11-25 — PRE-RESULTS
- **C0:** the touch bar counts toward the stop, but not toward the target. The fill is inside that bar and the rest
  of the bar can run through, so this is conservative for the baseline and matches the `jordan-lines-mae` race.
- **C1 / C2:** the stop is checked from the bar after entry, as registered.
- **C2:** the entry fills at the bar's open if that bar opens beyond the 0.05σ price.
- **Disclosure:** decided while writing the script. It was recorded after a one-instrument mechanics check (gold
  futures) that showed counts by exit type only, with no line-vs-placebo or R comparison.

## RESULTS
