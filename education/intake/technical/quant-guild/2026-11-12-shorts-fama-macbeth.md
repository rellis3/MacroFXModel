# Fama-MacBeth Regressions for Quant Finance (2 shorts)

| | |
|---|---|
| Lane / source | technical / quant-guild |
| Speaker(s) | QG = Roman Paolucci |
| URL | instagram.com/p/ DfSloXcjQ_v · DfQA9GeEYBF |
| ReelScribe id | j57057rn…, j5755775… · 21 s, 38 s |
| Recorded | posted 2026-11-02/03; clips of the YouTube video of the same name (not in the library) |
| Processed | 2026-11-12 |

## Lesson
Return distributions are **time-varying**: companies and industries go through regimes, so a pooled regression over
the whole sample mixes different worlds and looks like noise. Fama-MacBeth handles this: run a cross-sectional
regression in **each period**, then average the coefficients over time and use their time-series spread for the
standard error. The joke short ("correlated … prescriptions in Madagascar with … shrimp boats") is a jab at data-mined spurious correlation.

## Approach
- **Question**: is a characteristic priced *across* instruments, consistently *through time*?
- **Evidence**: per-period coefficients, so you can see the stability (or not) of the effect period by period, not just one pooled number.
- **Failure mode**: spurious correlation from searching ("150 basis points of arbitrage").

## Claims
| # | Claim (speaker) | Type | On file? |
|---|---|---|---|
| 1 | "We have time-varying return distributions… this creates what looks like just noise" (QG) | method | ALREADY DO in part: per-year / per-regime breakdowns and walk-forward folds in studies; HMM regimes |
| 2 | A quant should have run a Fama-MacBeth regression (QG) | method | PARTLY ON FILE: taught (C.OG regression course notes, `education/tools/whiteboards/institutional_fama_macbeth.py`, Theory Lab) but **never used in a study** (no hit in forge/, analysis/, preregs) |

## What we could learn
- **DON'T DO**: for cross-instrument questions (the 8 FX majors, the 62-market board, line-touch across pairs, residual-fx8)
  we pool. Fama-MacBeth gives a per-period coefficient series, so you see whether an effect is steady or comes from a few
  periods, and the standard errors handle cross-sectional correlation that pooled OLS understates.
- Overlaps with the data-rules multiple-testing rules (the shrimp-boat joke = data snooping). **ALREADY DO**.

## Research ideas
- **Fama-MacBeth re-read of a pooled cross-instrument result.** Take one banked pooled result across instruments
  (e.g. residual-fx8 or carry across the FX majors) · per-month cross-sectional regression · average coefficient and
  Newey-West t over months · benchmark: the pooled estimate · changes: whether the banked effect is steady or carried
  by a few months. Not carded to an agenda yet. It's a method check on an existing result, so it goes in
  `RESEARCH_METHOD_LESSONS.md` as a proposed robustness step instead.

## Quotes
- "We observe different regimes… and this creates what looks like just noise." (DfQA9GeEYBF, 0:12)
