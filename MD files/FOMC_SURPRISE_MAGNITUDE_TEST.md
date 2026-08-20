# FOMC surprise magnitude → movement size — pre-registration

> **Status: PRE-REGISTERED 2026-08-20, design frozen BEFORE the run; result
> appended below same day.** Follows `CB_SENTIMENT_PRICE_TEST.md` (whose
> registered directional cell is a banked null) and uses its validated
> instruments. This is a NEW registered question, counted as such: direction
> died; this asks whether the *size* of the hawkishness surprise predicts the
> *size* of the subsequent move — the platform's own thesis (vol is the
> forecastable thing, direction is not) applied to the one calendar event the
> forecaster currently treats as flat.

## Hypothesis and use-case

A large wording change (|Δscore| big) means more new information to digest —
repricing, second-day flows, and elevated realized movement into the next
session. If true, the lexicon becomes an **event-day range multiplier** for
the vol forecaster: at ~14:05 ET the score is computable, and the *remaining*
horizon's expected range can be scaled before the next session — closing the
"calendar-flat forecaster" gap the education notes name
(`cross-asset-options-diagnostic-notes.md` §14).

Honest prior: |Δscore| is coarsely quantized (many exact zeros — statements
often repeat verbatim) and vol clusters regardless of text; the effect may be
subsumed by "it's an FOMC day." **Blunt odds: ~25–35%.**

## Design (frozen)

**Data:** the Stage-1/Stage-3 join (`stage3_joined.csv`): 81 events with
`dScore` (lexicon, confirmatory) and the R0/R1 windows.

**Confirmatory cell (one):** OLS `|R1| ~ |Δscore|` (lexicon).
R1 = dollar-basket log return 14:30 ET → next day 14:00 ET, as already
computed. **Pass:** slope > 0, |t| ≥ 2, N ≥ 60, and slope positive in both
halves (2016–2020 / 2021–2026). **Fail** otherwise. (|R1| of a 7-pair
*basket* understates single-pair movement via diversification — accepted:
it is the same series the directional nulls used, so results are comparable,
and a basket-level effect is the conservative form.)

**Descriptives (no pass/fail weight):** `|R0| ~ |Δscore|` (near-concurrent
validity), the LLM scorer (`|ΔllmScore|`) on both windows, zero-surprise vs
nonzero-surprise group means, and Spearman rank correlations (robust to the
quantization).

## Decision table (written before running)

- **Pass:** build the event-day range-multiplier spec into the vol-forecast
  family as its own A/B vs the calendar-flat incumbent, judged by exceedance
  calibration on the OOS card (the forecaster's own bar), not PnL.
- **Fail:** banked; the lexicon stays context-only in full, and event-day
  range widening (if ever built) is calendar-based (a flat FOMC-day
  multiplier), not score-based.

---

## Result (run 2026-08-20, code `analysis/fomc_event_study/surprise_magnitude_test.py`)

**CONFIRMATORY CELL: FAIL — clean null, banked.**
|R1| ~ |Δscore| (lexicon): slope +0.0011, **t = 0.54**, N=81; halves flip
sign (2016–2020 slope −0.0024, 2021–2026 +0.0017). Spearman 0.045 — the
quantization-robust check agrees.

Descriptives that sharpen the null:
- Even the **instant reaction's size** is unrelated to the wording-change
  size: |R0| ~ |Δscore| t = −0.46. Direction of the surprise was priced
  (the validated Stage-3 cell 2); its *size* predicts nothing, anywhere.
- The LLM scorer concurs (|R1| ~ |ΔllmScore| t = −1.57 — mildly *negative*).
- Zero-surprise meetings (N=28, statement ~unchanged) moved slightly MORE
  than nonzero ones: mean |R1| 57.6bp vs 50.3bp. **The FOMC day itself is
  the vol event; the text delta adds nothing measurable to magnitude.**

**Per the frozen decision table (executed):** the lexicon stays fully
context-only. If event-day range widening is ever added to the vol
forecaster it should be **calendar-based** (a flat FOMC-day multiplier —
supported by the ~2× event-day |R1| vs ordinary days visible across this
study) — not score-based. The sentiment→price research program is now
closed on all three registered fronts (direction, drift-conditioning,
magnitude); the one survivor from this event-study family is the
*unconditional* post-FOMC USD drift (`POST_FOMC_DRIFT_TEST.md`, PASS),
which is calendar-only and needs no text input at all.
