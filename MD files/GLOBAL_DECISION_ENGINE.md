# Global Decision Engine: one read from every model

*Written 2026-10-13. Core: `js/globalReadCore.js` (pure) plus `js/globalReadInputs.js`
(the one normalise step), tested in `js/globalReadCore.test.mjs`. Live on today.html since
the same day (§7): the server job `globalRead` builds the read every 15 minutes and serves
`/api/global-read`; the CLI `scripts/global_read.mjs` runs the identical code against
production. §6 is the pre-registered test that decides whether it stays.*

## 0. The question this engine answers

> Given everything the system knows about global markets right now, what is the most
> probable scenario, which instruments offer the clearest opportunities, what behaviour
> should we expect, and how strong is the evidence?

Today the dashboard has about 40 live engines. Each speaks alone, so the reader joins the
dots by hand. The engines that sound most confident (direction leans, macro scores, COT,
OI magnets) are the ones the Evidence Book scores as noise. The engines that are right
(range, vol surface, event size) sound modest. This engine reads **all of them** and sets
each one's weight from its measured evidence, not from how loud it is.

## 1. Audit: what exists, what it can answer, how fresh it is

Every live input, by family, with the job the evidence allows it.
- **Timing.** *L* = leading (known before the outcome, with a tested lead), *C* =
  coincident (same-bar co-movement), *G* = lagging (monthly or weekly prints, post-meeting
  text).
- **Tier.** confirmed = an independent second test or a forward record; validated = one
  out-of-sample pass; descriptive = measured but never pre-registered; null = a banked null.

| family | live input (route) | timing | allowed to answer | tier | state on 2026-10-13 |
|---|---|---|---|---|---|
| vol surface | IV÷σ per instrument (`/api/daily-read`) | L | range, behaviour | validated (combined-range, iv-ladder) | fresh |
| vol surface | VIX/VIX3M, VIX9D front (`/api/desk-watch`, `/api/today-reads`) | L | range | confirmed (vix-inversion + mv-vixterm) | fresh |
| vol forecast | fitted ladder p50/p75/p90 (`/api/vol-forecast`) | L | range (the base) | validated (forecast-persistence-fix, pick) | fresh (22:04 UTC) |
| equity stress | NQ down-week (`desk-watch`) | L | range | confirmed (us-extras-confirm) | firing |
| equity stress | all six indices down | L | range | validated (breadth-all-down) | **not computed live** |
| positioning | net GEX sign, NQ (`/api/oi-levels`) | L | range (NQ only) | validated (gex-range) | long gamma (spot above flip) |
| events | calendar × Event Response Book | L | range | validated (event-impact-map, surprise-size) | nothing due in 24h |
| rates RV | 2Y spread z (`/api/yield-spread/plan`) | L | ~~direction, weeks~~ nothing (2026-10-18) | ~~confirmed~~ **null**: yield-spread-sleeve deflated 2026-10-17 (point-in-time OOS Sharpe 0.09, p 0.91); registry tier set to null 2026-10-18 | shown, weight 0 |
| events | post-FOMC 5-session USD drift | L | **direction, 5 sessions** | validated (n=81) | outside window |
| macro state | regime → FX 20d (`/api/macro-regime-fx`) | G | direction | descriptive: OOS hit 64–93% but **n_eff = 6** | shown, weight ≈ 0.03 |
| macro state | macro scorecard (`/api/macro-scorecard`) | G | state only | null (macro-direction) | 2 stale dims (GBP rateDiff 285d) |
| macro state | quadrant (`/api/regime`) | G | state only | context | Goldilocks, 5 months |
| macro state | econ surprise (`/api/econ-surprise`) | G | range (size, via event book) | validated for size, untested for direction | **6 of 8 currencies have no recent prints** |
| macro state | nowcast, Fed path, CB tone, Beige Book | G | state only | null / context | Fed path 5d old; `/api/fomc/latest` returns June (history is current) |
| price state | daily HMM (`/api/hmm/regimes`) | C | state (variance label) | untested for direction | **all 20 instruments RANGE**: no information today |
| price state | intraday HMM 5m/1h | C | state | untested | off by owner default (`SVC_HMM5M_V2`/`SVC_HMM1H`), serves `{}` |
| price state | page lean / direction tag | C | nothing | null (forward ledger h1 41% [35,48]) | shown, weight 0 |
| price state | 12m trend basket | G | nothing at day horizon | null (trend-following-fx) | shown, weight 0 |
| positioning | COT (`/api/cot`, `/api/cot-extremes`) | G | state only | null (crowded-bond-short-fomc, squeeze-fuel) | **live FX leg 403**, weekly copy 2026-10-06 |
| positioning | OI walls, max pain, PIN/BREAKOUT | C | nothing | null (oi-max-pain, wall-placebo) | **implausible levels** (SPX hvl 59, DOW call wall 3.12) |
| rates | curve, real yields, chain links (`/api/macro-changes`, `desk-watch`) | C | state | context | FRED legs 3–5 days behind; broad dollar 11 days |
| credit | HY, credit-stress composite, liquidity gate | C | state | context (credit gate failed OOS) | HY +47bp/20d, gate BLOCKED |
| cross-asset | PC1 sides, FX concentration (`/api/today-reads`) | C | state | context | 78% of markets risk-on side |
| intraday | live range, extreme-in, reach-from-here, reversal hour | L | intraday behaviour | validated | separate engines, hourly |

**What the audit says.**
1. **The leading inputs are all about size, not direction.** Two directional inputs have
   out-of-sample evidence: the 2Y spread sleeve and the post-FOMC drift. Both work over days
   to weeks, and both are switched off today.
2. **Most of the dashboard is coincident or lagging description:** HMM, chain, curve,
   credit, cross-asset, quadrant, scorecard, COT. It describes the state well and predicts
   the next move badly. The Evidence Book's 84 nulls are mostly this kind of input asked to
   lead.
3. **The inputs are heavily correlated in families.**
   - rates / real yields / spreads / scorecard-rates / carry share one factor;
   - HMM / lean / trend / travel / tape share price momentum;
   - VIX / IV÷σ / VIX term / GEX share the vol factor;
   - COT / OANDA books / OI share positioning.

   That leaves roughly 6 independent families, not 40 signals. Counting them as 40 votes is
   how the old combiners overstated agreement.
4. **Data faults are common enough to change the read** (§5). They need to be in the
   engine's output, not found by eye.

## 2. Why the earlier combiners failed, and the rule that follows

| combiner | method | result |
|---|---|---|
| DecisionEngine | rule chain / permission gates | never validated |
| Trade Decision Engine | logistic meta-label (110,883 events) | calibrated, no discrimination (everything ≈ 0.56) |
| Vote Atlas, conviction vote | count of agreeing dimensions | 0.23× cost; anti-predictive |
| Direction vote S6/S7 | net vote ≥ 2 | 49.0% day direction, n=1,534 |
| forge confluence, ConfluenceBot | stack of confirmations | stacking made it worse (t_lift −0.41) |
| macro-direction, scorecard | equal-weight average | null |
| **combined-range** | **joint fit into the forecast, scored by pinball** | **PASS: 0.90 indices, 0.94 FX+gold, 13/13** |

**The rule:**
- Combine by **fitting** inputs jointly into one forecast of a measurable outcome, and
  score that forecast with a proper scoring rule.
- Never count votes.
- Never give an input weight it has not earned out of sample.

Votes fail for two reasons. They weight a null input the same as a validated one, and they
count correlated inputs as independent agreement.

## 3. The engine

### 3.1 Layers (each tested on its own; LAYER_INTERFACES.md style)

```
 inputs (all ~40 routes)                     ─┐
   │ normalise → registry (job, timing, tier, │  scripts/global_read.mjs  (live)
   │ IC/coef, n_eff, cadence, asOf)           │  → server job later (§7)
   ▼                                          ─┘
 A. Data quality      stale / dead / contradictory → freshness weight, issues list
 B. State nowcast     5 axes: risk, USD, rates, vol, credit  (coincident, described)
 C. Range forecast    joint multipliers on the fitted ladder → E[H-L], P(>p75)
 D. Behaviour         expansion / two-way / contained / exhaustion  (from C)
 E. Direction         correlation-aware combination of tested inputs → P(up)
 F. Scenarios         base (persistence) / alternative (measured base rate) / event
 G. Conviction        range and direction scored separately, decomposed
 H. Invalidation      the thresholds that flip B–E
 I. Record            every output stored, scored at the close (§6)
```

### 3.2 Weight of one input

```
e_i = P(real | tier) × IC_i × n_eff/(n_eff + 30) × freshness_i
```

- **P(real | tier):** confirmed 0.95, validated 0.80, descriptive 0.25, null or untested 0.
  - The 0.80 comes from the trial ledger: 35 single-test passes, about 6 expected by luck,
    so P(real) ≈ 0.83.
  - This is the "predictive value × reliability" the brief asked for, and it is the only
    place a tier enters.
- **IC:** the correlation-scale measure of predictive value at the stated horizon. For
  hit-rate evidence, IC ≈ 2(hit − 0.5).
  - yield spread 0.26 (63% OOS);
  - post-FOMC 0.30 (65%);
  - macro-regime-fx uses its own live OOS hit rate.
- **Shrinkage:** n_eff/(n_eff + 30).
  - macro-regime-fx shows an 80% OOS hit at 20 days, but its overlapping windows leave
    **n_eff = 6**. Shrinkage takes it from an apparent IC of 0.6 to an effective 0.025.
  - This is the single most important correction on today's page. It is the strongest-
    looking directional number on the dashboard, and it is six episodes.
- **Freshness:** 1 inside the input's cadence, falling linearly to 0 at 3× cadence.

A null input is still **read and shown** in the agreement table. Its weight is 0 because
its evidence is 0, not because it was hand-excluded. If a null input later earns a
validated tier, it gains weight with no code change, only a registry edit.

### 3.3 Direction: correlation-aware, not a vote

The inputs are standardised signals s_i (sign × activation), with effective IC e_i and an
assumed family correlation matrix R (0.5 within a family, 0.15 across). Then:

```
β = R⁻¹ e          ŷ = βᵀ s          R² = eᵀ R⁻¹ e          P(up) = Φ( ŷ / √(1 − R²) )
```

- Inputs that **disagree cancel** (ŷ → 0).
- **Correlated inputs do not double count**: two same-family inputs give less than two
  independent ones (tested).
- A **lone confirmed input** gives about 60/40, matching its own record (yield sleeve: 60%
  model vs 63% OOS).
- **Agreement** is reported as Σe·s / Σe·|s| over weighted inputs only. A wall of agreeing
  nulls cannot manufacture conviction.

R is assumed for now. §6 replaces it with the correlation measured on the replay.

### 3.4 Range and behaviour

- **The base** is the fitted ladder (`ladder_flat`, which already carries the event
  multiplier).
- **The adjustment** is the joint coefficients from `forge/COMBINED_RANGE_PREREG.md`,
  centred as in the fit:
  - a flag contributes mult^(flag − freq);
  - IV÷σ contributes (ratio ÷ the instrument's usual ratio)^0.70 for indices, ^0.79 for
    FX+gold;
  - NQ short gamma adds ×1.176 (gex-range).

  Because these were fitted together, their overlap is already netted out.
- **P(H-L > p75)** comes from the ladder's own log-dispersion.
- **Cross-check:** the result matches the separately measured IV÷σ tag rates (EURUSD 15%
  model vs 13% tag history; GBPUSD 35% vs 34.8%).

Behaviour is read from P(>p75):

| label | rule | evidence |
|---|---|---|
| expansion | P ≥ 32% | breaks of p50/p75 tend to run on rich-IV days (continue tag 34.8% vs 25%); follow, do not fade |
| contained / exhaustion | P ≤ 18% | p75/p90 act as caps (exhaust tag 13%); take profit at lines |
| two-way | otherwise | no edge at a touch either way |

**Day-level continuation vs reversal is not labelled.** It is a banked null (S7a 49.0%). The
engine says so, and hands that question to the validated intraday rules:
- fast-start → wider rest of day;
- reach-from-here;
- extreme-in-probability (+18–21% Brier skill);
- the 21:00 reversal hour;
- tape-speed persistence.

### 3.5 Scenarios, conviction and invalidation

- **Scenarios.**
  - The base case is **persistence**, which is the honest best forecaster for slow states.
  - The alternative is the **measured unconditional base rate** of the transition that
    matters most: a first VIX inversion within 5 sessions, about 9% (86 first days since
    2008). It carries the tested consequence: SPX +0.76, NQ +0.82, USDJPY +0.44 and gold
    +0.43 ATR over 5 sessions.
  - **A probability is quoted only where it is measured.** "Credit widening raises the
    alternative" is plausible and untested, and the read says so.
- **Conviction** is two numbers, never one, because the system is strong on one and weak
  on the other:
  - range conviction = mean distance of P(>p75) from 25%, × tier × data quality;
  - direction conviction = the largest |P(up) − 0.5|, × data quality.
- **Invalidation** is generated from live values: the VIX ≥ VIX3M line, HY 4%, any 2Y |z|
  crossing entry, an IV÷σ tag flip at the 22:00 rebuild, a tier-1 print entering the 24h
  window, and the next FOMC.

## 4. The worked read: 2026-10-13 (from production, ~11:00 UTC)

**Environment:** real-rate dollar regime · compressed volatility · credit widening under a
calm tape · mixed risk appetite.

| axis | score | agree | what it is made of |
|---|---|---|---|
| USD | +0.93 | 2/2 | broad dollar +2.7% / 20d; USD factor +1.7% |
| rates | +0.78 | 3/3 | 10Y +21bp (all real: TIPS +19bp, breakevens 0); 3.5 hikes priced |
| credit | +0.74 | 3/3 | HY +47bp / 20d; stress composite −1.36; index liquidity gate BLOCKED |
| vol | −0.56 | 3/3 | index realised vol at the 13th percentile; VIX front calm |
| risk | +0.03 | 2/4 | 78% of markets on the risk-on side, but HY widening and stocks and bonds moving together (+0.46) |

**Most probable scenario (base, ~91% over 5 sessions):**
- The grind continues: the real-rate-led dollar holds, equity vol stays compressed, and
  credit keeps leaking.
- **What it means for behaviour:**
  - EURUSD, USDCHF and USDJPY: contained/capped days (P(>p75) 15–17%); fade the outer
    lines, don't chase breaks.
  - GBPUSD: expansion (35%); follow breaks.
  - NQ and US2000: slightly wide two-way (29–31%), from the NQ down-week offset by the calm
    VIX front.
  - Gold: a normal day (25%).

**Alternative (~9%, unconditional):**
- Credit transmits into equity vol and the VIX curve inverts.
- Index, USDJPY and gold ranges widen by 0.4–0.8 ATR over 5 sessions. The engine does not
  predict which way.

**Direction:**
- **No tested directional input is active on any market.** The largest 2Y spread |z| is
  1.15 against an entry of 2–2.75, and FOMC is outside its window.
- Everything that does point a way has weight ≈ 0 by evidence: the lean, HMM, trend,
  scorecard, CB tone, COT, OI walls, and macro-regime-fx (n_eff 6). The agreement table
  shows them in open conflict.
  - EURUSD: the macro regime and the scorecard say up; the lean and trend say down.
  - USDJPY: trend, CB tone and OI say up; the scorecard and COT say down.
- **The strongest evidence-supported view today is about size and shape, not direction.**
  The engine says that explicitly instead of picking a side.

**Conviction:** range 13/100, direction 3/100, data quality 38/100. This is a quiet,
weak-evidence day, and the read says so.

**Clearest opportunities (by clarity):**
- EURUSD and USDCHF capped days;
- GBPUSD expansion;
- USDJPY and USDCAD contained.

All of them are about where price stops, not which way it goes.

## 5. Data problems the engine raised today (each lowers its data-quality weight)

1. COT live FX feed returns HTTP 403; only the weekly copy (2026-10-06) is available.
2. Intraday HMM (`/api/hmm5m-v2`, `/api/hmm1h-v2`) serve `{}`. The services are OFF by owner
   default (CLAUDE.md, Live deployment), so this is not a fault, but the input is absent from the read.
3. `/api/fomc/latest` returns the 2026-06-17 meeting, while `/api/fomc/history` (which today.html
   reads) already has 07-29 and 09-16. Only the `latest` route is wrong.
4. Econ surprise: AUD, GBP, CHF, EUR, JPY and NZD have no recent prints (several last
   printed in March–April 2025).
5. Daily HMM labels all 20 instruments RANGE. It is a variance label, and today it carries
   no information.
6. OI levels below 50% of max pain on gold, NQ, DOW, SPX and RUT (hvl / cluster parse).
   The DOW call wall reads 3.12.
7. Macro scorecard: GBP rateDiff is 285 days old; EUR trade balance is 165 days old.
8. Broad dollar last printed 2026-10-02 (11 days). CVOL EVZ is dead (415 sessions).
9. The yield-spread plan enters at |z| 2; the validated rule is 2.75.
10. breadth-all-down is validated but no live job computes it.
11. The release-calls record is empty, so that six-week-review record is not filling.
12. Two rates sources disagree on the 20-day 10Y move: the chain read says +32bp, FRED via
    `macro-changes` says +21bp. Different end dates; the engine uses the FRED series and
    flags the age.

## 6. Does combining actually improve accuracy? Evidence so far, and the pre-registered test

**Already measured:**
- **Range, historical out of sample:** combined-range PASS. Pinball 0.90 for indices (6/6)
  and 0.94 for FX+gold (7/7); flagged states move toward the 25% design rate.
- **Range, live forward:** the 07:00 range calls (1.0 ATR plus firing tested effects).
  Flagged days realised **1.30 ATR (n=11)** vs **0.94** on ordinary days (n=109).
  Directionally right; too few flagged days to call.
- **Direction, live forward:** the page lean (a combination of descriptive reads) scored
  h0 52% [46,58], **h1 41% [35,48]**, h5 47%, net −0.25 ATR at h5 (n=241).

  So combining descriptive inputs for direction is worse than a coin flip forward. That is
  exactly why the engine gives them zero weight.

**Pre-registration (locked with this commit; bars do not move once the record starts).**

- **Record.** The server job's first read in the 07:00 London hour, one row per weekday
  session in KV `global_read_v1`, scored from the daily-read score of the same session (the
  same ladder lines: realised H-L, the band it reached, open-to-close). Served at
  `/api/global-read/record` with the R1/R2/D1 summary computed by `scoreRecord`. A day the
  server missed at 07:00 stays missing; no late rows. No conclusions below 30 sessions.
  Halves must be sign-stable.
  - *Amendment, 2026-10-13, before any row existed:* the record moved from "the CLI at 07:00
    UTC" to the server job at 07:00 London, so it runs without anyone pressing anything.
    The bars below did not change.

| target | engine output | baseline | PASS | FAIL |
|---|---|---|---|---|
| R1 range size | expected H-L (p50) and p75 per instrument | plain ladder (arm A) and the IV-adjusted ladder | median pinball ratio < 0.97 vs plain AND ≤ 1.00 vs IV-adjusted, better on ≥ 60% of instruments | ratio ≥ 1.00 vs plain |
| R2 behaviour | P(H-L > p75) | constant 25% | Brier skill > 0 with expansion-labelled days' p75 rate > contained-labelled days' by ≥ 10pp | skill ≤ 0 |
| D1 direction | P(up) where \|P − 0.5\| ≥ 0.04 | 50% | Brier skill > 0 at n ≥ 30 calls, sign-stable | skill ≤ 0 ⇒ direction stays "no view" |
| C1 combination | R1 and D1 | best single input (IV-only ladder for range; yield sleeve alone for direction) | engine ≥ best single on its metric | engine < best single ⇒ ship the single input, not the engine |
| K1 conviction | range conviction score | — | sessions in the top tercile of conviction have larger \|realised ÷ plain − 1\| than the bottom tercile | otherwise the score is cosmetic and is removed |

*Amendment, 2026-10-16, before any story row existed (the arm went live after both record windows that day):*
the **story arm** (`storyDirection`: every read that points a way, nominal weight IC 0.05 unless its tested rule is
active, family-correlation aware) is recorded as a shadow and never moves D1, R1 or R2.

| target | engine output | baseline | PASS | FAIL |
|---|---|---|---|---|
| D2 story, 07:00 | story P(up), \|P − 0.5\| ≥ 0.02 | 50% | Brier skill > 0 AND > D1's, at n ≥ 30 sessions, sign-stable halves | otherwise the lean leaves the Day Read |
| D3 story, 10:00 | the 10:00 re-read | 50% | same bar | same |

Both are scored on the move **left** after the read (close minus the 07:00 / 10:00 level, % of the London-midnight
open), because the read includes the tape so far. Calls are clustered by day (one dollar move is several pairs),
so the verdict also reports the session-clustered hit rate before any claim.

**Chance baseline.** Five targets: expect about one to look good at n=30 by luck. One pass
alone is not evidence.

**Expected outcome.**
- R1/R2 pass, since they inherit a validated fit.
- D1 has too few calls to judge for months, because the yield sleeve and FOMC drift fire
  rarely. That is a feature: the engine should rarely claim direction.
- Any D1 call that does fire is a direct forward test of the only two directional findings
  the programme has.

**Historical replay (phase 2, before any UI).** Everything in layers C and E can be rebuilt
point-in-time for 2016–2026:
- VIX / VIX3M / VIX9D, CVOL IV, the ladder from M1, index closes, FRED 2Y spreads, FOMC dates,
  and the OI archive for GEX.

`forge/run_global_read_replay.py` would:
1. score R1, R2, D1 and C1 on the lockbox-respecting window;
2. **measure the family correlation matrix R** to replace the assumed 0.5 / 0.15;
3. calibrate the clarity weights.

The lockbox (opens 2027-01-04) stays sealed; the replay uses the same train/test dates as
combined-range.

## 7. Build plan in the current architecture

1. **Registry from the Evidence Book.** Add numeric fields to `js/deskEvidence.js`
   entries: `effect`, `ic`, `n`, `n_eff`, `horizon`, `question`, `timing`. Generate
   `REGISTRY` from them, so banking a verdict re-weights the engine.
   - deskWatch's hard-coded effect copies move to the same source.
2. **Server job + store. Done 2026-10-13.**
   - `svcInterval('globalRead')` every 15 minutes (plus once 2 minutes after boot). It reads
     this server's own routes over 127.0.0.1, the same pattern as the OI basis refresh;
     `/api/cot` is skipped because it hits CFTC on every call.
   - `/api/global-read` serves the latest read; `?refresh=1` rebuilds it.
   - `global_read_v1` (in `_CF_EXACT` and the worker's `PERMANENT_KEYS`) holds one row per
     session. Realised values come from the daily-read score, so no second scorer exists.
   - `/api/global-read/record` returns the rows and the R1/R2/D1 verdict.
3. **Fix the inputs that §5 found broken.** COT 403, FOMC feed, the
   non-US surprise fills, OI parse guards, a live `all_down` job, and the 2.75 entry.
   Each is small and each raises the data-quality weight.
4. **One page. Done 2026-10-13, on today.html at the page's three levels:**
   - **global:** the 🧭 Global Read panel at the top of the main column;
   - **currency:** a Global Read section at the top of each currency drawer (its pairs, range
     pressure, currency-space direction, its own readings);
   - **pair:** a `read` row on every pair card (stance, P beyond p75, direction) and a
     section first in the pair drawer's Now tab (the plan, the range drivers, every
     direction input with its weight).

   The panel carries:
   - environment line and the five axes;
   - scenarios with probabilities and their sources;
   - the clarity-ranked market table;
   - an agreement heat-map (families × pairs, with weight shown);
   - the data-problems list and the invalidation list.

   Everything the user currently joins by hand.
5. **Telegram 07:00 digest.** Replace the five-line digest with the read's environment,
   the top three markets and the two conviction numbers. The digest's range call becomes R1.
6. **Six-week review (on or after 1 November).** Add R1/R2/D1 to the records it reads.
   The lean wording on today.html can now point at the engine's direction line instead of
   its own arrow.

**What would make it better, in order of evidence value:**
1. The replay's measured R.
2. A pre-registered test of credit-widening → VIX-inversion hazard. That would turn
   today's "untested conditional" into a number.
3. Forward-proving post-FOMC drift; the next FOMC is the first live call.
4. Anything that adds a *second* directional input with OOS evidence. The engine is built
   so one would slot in with a registry entry.

## 8. Decisions for the owner

- *(Decided 2026-10-13: the read lives on today.html, global → currency → pair; the server
  job and the record ship with it.)*
- Align the live yield-spread entry to the validated 2.75, or pre-register 2.0 as a
  separate test?
