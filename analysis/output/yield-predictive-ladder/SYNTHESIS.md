# Institutional yield-to-asset framework — synthesis of the rates book (2026-10-21)

This answers the brief's final question:

> Can we identify a small number of robust, economically interpretable and regime-dependent yield signals that
> provide incremental, out-of-sample predictive information about future asset returns, with sufficient lead time
> and net trading value to justify inclusion in MacroFXModel?

It draws on about 90 Evidence Book entries plus this study (`RESULTS.md`).

**Answer: not yet, and not on anything tested so far.** Rates explain the same bar or day well (descriptive). No yield
variable — level, change, differential, curve shape, decomposed component, futures-implied path, episode or regime —
has produced out-of-sample forward information that survives costs, on EURUSD or Nasdaq, from 1 minute to 1 month.

The failures are not one-off. They fall into five recurring mechanisms, below. Two of them (the timing artefact and
the lookahead artefact) are reasons earlier "positives" were false. The remaining open questions are narrow. Each
needs data the repo does not have yet.

Labels: **D** descriptive, **P** predictive, **C** causal, **T** tradable.

## 1. What holds (all D)

| Relationship | Evidence | Note |
|---|---|---|
| EURUSD falls when US rates rise relative to Germany | same hour −0.30 (every year 2012–26); same day −0.13..−0.21 for the US−DE 2y; US 2y −0.25 in 2020–26 | sign-stable; strongest via the front end (`us-leg-same-day-link`, this study) |
| USDJPY rises and gold falls with US front-end rates | same hour +0.54 / −0.20..−0.33 | sign-stable (`us-leg-same-day-link`) |
| Nasdaq and rates: same-day link | +0.35 (2005–14), +0.31 (2015–19), ≈ 0 (2020–26) for the US 2y; intraday sign flipped in 2026 | **not** sign-stable; any rule must re-measure the current sign (`stir-curve-map`, this study) |
| Nasdaq moves before real yields and breakevens | Granger asset→rates p ≤ 0.025 in all three periods; lag −1 correlation ≈ −0.1 for real yields | equities lead rates at a daily scale (this study); Nasdaq leads rate quotes by about a minute intraday (`rate-diff-nq-leadlag`) |
| How tightly rates and price move together varies far more than chance between sessions or months | overdispersion beats a constant-link null | real, but not persistent enough to recognise in advance (`spread-episodes-*`) |
| Carry (the rate *level* ranking across currencies) | Sharpe 0.54, 1976–2014 | the one rates-derived return source with a long record (`rate-diff-xsmom` construction check); a separate factor sleeve, not a timing signal |

## 2. Failure analysis (deliverable 8): why rate signals failed

| Mechanism | What it looks like | Studies it explains | How it was caught |
|---|---|---|---|
| **1. Same bar, not a lead** | Big same-bar correlation; zero at +1 bar | `yields-to-fx-direction`, `rate-diff-nq-leadlag`, `spread-leads-fx-hours`, `nonus-yield-gap-direction`, the whole STIR book | lag profiles with intervals; placebo-shifted series |
| **2. Print-timing overlap posing as a lead** | A "lag +1" effect from asynchronous prints (EURUSD noon fix vs 15:30 yields; 1-minute bars stamped at their start) | this study's EURUSD lag +1; the one-bar lookahead in `cog-video-claims` | checking each series' clock; same-day control |
| **3. Publication lookahead** | A monthly or weekly series used as if known on its date | the 2Y yield-spread sleeve (GS2 published ~32 days late) → Sharpe 1.1 became 0.09 | point-in-time re-run (`yield-spread-sleeve`, `ys-long-confirm`); this study's A1 (broad dollar, term premium) |
| **4. Regime instability and sign flips** | Coefficients learned in one era reverse | EURUSD rate forecasts anti-predictive 2015–26 (IC −0.10..−0.21); stock–rate sign flip in 2026; follow-through only in 2016 and 2020 (`rates-follow-through-regimes`) | chronological splits; anti-persistence of the coupling state |
| **5. Selection noise** | The in-sample best of N looks good, then walk-forward erases it | `cog-spread-direction` (best of 192), `stir-wide-scan` (48,600 → borderline → failed on new data), the Fed-path cluster | selection-aware placebos; Holm/BH; untouched confirmation |
| *(method)* **6. Underpowered detector** | A null from a model that could not have seen the effect | this study's ridge ladder (finds only ρ ≥ 0.10 at 1 d); 15–60 min grids with interval ±0.05 | planted-signal positive control; MDE tables |

Regime gating did not rescue any of these. The real-yield trend, hawkish/dovish repricing, risk-on/off, volatility,
release days, coupled state and confirmation were tried here and in `rates-spread-asset-lead`. Not one predefined
regime turned a forward relationship positive out of sample.

## 3. Ranked shortlist for further research (deliverable 9)

Each item is exploratory, ranked by how plausible the mechanism is, then by how cleanly it can be tested. None is a
finding.

| Rank | Candidate | Why it is still open | Data needed | Test shape |
|---|---|---|---|---|
| 1 | **Rate *surprise* at scheduled releases → FX follow-through over hours**, decomposed into front-end and real-yield parts | Every test so far used unconditional rate *moves*. The literature effect sits in *surprises* (news vs consensus). The US point-in-time consensus exists (ALFRED vintages); the intraday rate response does not yet | Intraday ZT/ZN futures 1-min around releases (IBKR serves live contracts back to listing); release-time consensus (calendar_events actual vs consensus, US 2014–2026) | Event study: surprise → 15–240 min EURUSD/NQ, controlled for the same-minute move; prereg on 2024–26, confirm on the forward record |
| 2 | **Equities lead rates** (Nasdaq → real yields / breakevens next day) | The cleanest daily lead found here, in the opposite direction to the brief's hypothesis. Its value would be as a *rates* signal (or for FX via rates) | Already in hand (FRED + NDX) | Prereg the reverse ladder (NDX → DFII10 / T10YIE next day) with the positive control first; costed on ZN futures |
| 3 | **US 2y down → Nasdaq up next day** | Same sign in three periods (−0.045 / −0.061 / −0.048), but t −1.7..−1.8 after Nasdaq's own reversal | Forward record only (history is spent) | Log the 1-day rule on the live site from now; judge at ~500 days |
| 4 | **EURUSD revert after a confirmed yield turn near FOMC/NFP/CPI** (from `spread-episodes-eurusd`) | Same sign in all three periods; daily data too thin | Intraday yields (ZT/ZN or OANDA USB02Y/USB10Y CFDs) to time the turn against the release; more USD pairs as one date-clustered family | Event study around releases; multi-pair family |
| 5 | **SOFR/€STR futures-implied policy paths as the differential** (brief §2) | Only 2024–26 daily history; the intraday versions are closed | Accumulate the daily strip forward (scheduled refresh is already running for 7 legs) | Daily path-differential vs EURUSD at 5–20 days, from 2027 |

**Deliberately not on the list** (closed, do not reopen without new data):

- STIR→Nasdaq intraday lead;
- yield-spread z mean reversion;
- divergence/catch-up;
- curve inversion → equities;
- the daily US spread direction filter;
- coupled-state gating;
- decomposed-rates multivariate daily forecasting (this study).

## 4. What would justify inclusion in MacroFXModel

A candidate from the shortlist would need all of the following:

- a pre-registered test that passes its positive control first;
- the chronological gate, with Holm across the family;
- a beat on a shifted-series placebo;
- net expectancy after costs above the price-only baseline;
- |t| ≥ 3, or a passing forward record.

Until then, rates belong in MacroFXModel as **same-bar attribution and context** (the rates-regime card, the spread
episodes page), not as a direction input.
