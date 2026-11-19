# Bias Engine V2 (shadow): specification, calculation definitions and acceptance tests

**Status: v1.1, decisions taken 2026-11-19; build in progress. NOT FROZEN** (the freeze, §6.4, comes after the technical
trial and before the official forward record). Owner, 2026-11-19: "proceed with Bias Engine V2 in shadow mode", with
recommendations 1–5 of the audit (`analysis/output/bias-engine-audit/AUDIT.md`), and the decisions in §10.

**No promotion, and no change to any production consumer, without the owner's explicit approval.**

The question is not whether V2 gives a more attractive bias score. It is whether V2 gives a **more economically
meaningful and statistically useful** assessment than V1. V2 is not promoted to production without enough forward
evidence (§9).

## 0. Ground rules

| # | Rule | How it is enforced |
|---|---|---|
| G1 | **V1 is untouched.** It keeps issuing at 05:30–06:00 and stays the production engine and the control. Its code (`js/biasEngine.js`), KV keys, routes, scoreboard rows and every consumer (the Desk Bias Process, the Desk Terminal) are not changed. | Test A13: the hash of `js/biasEngine.js` and V1's issue code is pinned. V2 lives in new files and new KV keys only. |
| G2 | **V2 affects no production decision.** No card, tab, process call, trade plan or alert reads V2. It is visible only on its own owner-only panel and route. | Test A14: no production module imports the V2 module or reads its keys. Its surface kind is `internal`. |
| G3 | **Identical point-in-time inputs.** One gather builds one input snapshot. Every variant (V1-replay, V2, the switch variants) is computed from that snapshot, and its hash is stored with the record. | Tests A9, A10, A11. |
| G4 | **No weight or threshold fitting.** V1's theory weights are kept. Every new constant is set here from economics and units, frozen before any outcome is seen, and listed in §4.9. | Test A15: the spec's constant table equals the code's. |
| G5 | **Each change has its own switch.** F1–F5 (§2) can each be turned on or off independently. With all five off, V2 reproduces V1 exactly. | Tests A1, A12. |
| G6 | **Separate outputs.** Direction, strength, confidence, data quality and driver agreement are separate fields. None is derived from another except as defined in §5. | Schema test A16. |
| G7 | **Same scoreboard.** V1 and V2 outputs, and their outcomes, are recorded on the bias scoreboard on the same rows and horizons, under one mapping. | §8; prereg amendment A7, committed before the first V2 issue. |
| G8 | **Lockbox.** Nothing on or after 2026-08-21 is used to set or check any constant. History may rule a change out, never in. | §7. |

## 1. Scope

**In scope** (audit recommendations 1–5):

| Switch | Change | Replaces in V1 |
|---|---|---|
| **F1** | Correct timestamps, cadence-aware freshness, data-quality scoring | month-start stamps; "newest input" dating; flat 120-day cliffs |
| **F2** | Rates as genuine bilateral differentials (carry) | the own-history z of each currency's short rate (`ratesDriver`) |
| **F3** | Central-bank tone and COT out of the directional score; kept as context | the stance ±1 inside `policyDriver`; the positioning driver |
| **F4** | One drift-adjusted, symmetric risk factor, tested before use | the four banded risk inputs averaged into R (`riskScore`) |
| **F5** | Policy from the priced path (level and 20-day change), one scale for futures and the 2y proxy | the 5-day change in pricing (`policyDriver`, `TH.policyWeekBp`) |

**Out of scope for V2** (later versions; V1 behaviour is kept for these):
- the growth/inflation split (rec 6);
- the full pair relative-value engine (rec 7). V2 builds the pair layer it will plug into (§3.3);
- shrinking missing drivers instead of renormalising (rec 9);
- asset de-duplication beyond what F3–F5 change (rec 10);
- new indicators of any kind.

## 2. Feature switches and variants

Every issue computes, from one input snapshot:

| Variant id | F1 | F2 | F3 | F4 | F5 | Role |
|---|---|---|---|---|---|---|
| `v1r` (V1 replay) | off | off | off | off | off | **control on identical inputs**; must equal V1's logic exactly |
| `v2` | on | on | on | on | on | **the candidate** |
| `v2-noF1` … `v2-noF5` | one off | | | | | attribution: what each change adds inside V2 |
| `v1r+F1` … `v1r+F5` | one on | | | | | attribution: what each change does alone on V1 |

That makes 12 variants a day. They cost nothing beyond computation, since the gather is shared. Only `v2` against
`v1r` is the primary comparison (§9). The other ten are descriptive attribution and never promote anything. Switches
are a frozen config object `{ F1, F2, F3, F4, F5 }`, stored with each variant.

## 3. Architecture

```
S0  Input snapshot      one gather at the issue time; every reading with value, observation period end,
                        knowable time, fetchedAt, cadence, source, fallback flag; content hash
S1  Feature layer       per currency: policy rate (carry), priced 6 m repricing, data momentum, real yield, commodity, trend,
                        stance (context), COT (context); global: risk factor F (or V1's R)
S2  Pair layer          28 crosses: bilateral drivers (carry gap, policy-path gap) + leg drivers (V1 style)
S3  Market views        pair scores; currency views (each vs the other seven); asset models (V1 shape, V2 inputs)
S4  Outputs             per market: direction, score, strength, confidence, dataQuality, agreement, drivers, context
```

### 3.1 S0: input snapshot (G3)

- **Gather.** The V2 issue job runs in V1's window (05:30–06:00 London), after V1's issue exists. It **calls V1's own
  gather function** (`_beGather`, unchanged) for V1's inputs, then adds the extras below. V1's code is not edited; V2
  only calls it.
- **What the snapshot adds to V1's inputs:**
  - the futures rungs' `rate`, `rate4wAgo` and their dates (already in KV `cb_rate_futures_v1`);
  - the policy-rate table for all eight currencies;
  - the 2y daily points (60 kept);
  - the raw risk series: VIX and VIX3M daily closes for 1 year, HY OAS daily, S&P closes for 1 year;
  - the macro scorecard's per-dimension scores, `asOf` and cadence.
- **Storage.** Stored with its SHA-256 (KV `bias_engine_v2_snap_<date>`), so a whole record can be replayed byte for
  byte.
- **Lookahead guard.** Any reading whose knowable time is after the issue time is removed before S1, and the
  removal is logged.
- **Data identity check.** `v1r` (V1's logic on the V2 snapshot) is compared with the production V1 issue of the same
  day. Labels should agree on ≥ 95% of markets; a lower rate is an operational alert, not a result.

### 3.2 S1: feature layer (definitions in §4)

### 3.3 S2: pair layer (the hook for a future relative-value engine)

For a pair (b, q), drivers fall into two sets:
- **bilateral set B**: carry (if F2 is on) and expected repricing (if F5 is on). These are computed from the two
  legs' readings directly (§4.2, §4.5), never from the currency views.
- **leg set L**: every other driver, computed per currency as in V1. When F2 or F5 is off, V1's per-currency rates or
  policy driver is in L.

```
leg score     s_c^L = Σ_{k∈L, available} w_k d_{k,c} / Σ_{k∈L, available} w_k            (V1's renormalisation)
pair score    S(b,q) = [ W_L·(s_b^L − s_q^L)/2 + Σ_{k∈B, available} w_k d_k(b,q) ] / [ W_L + Σ_{k∈B, available} w_k ]
              where W_L = the mean of the two legs' applicable L weights (symmetric in b and q)
```

- With B empty, S(b,q) = (s_b − s_q)/2, which is V1's pair score exactly.
- S(q,b) = −S(b,q) exactly, bit for bit: every term negates and the sums run in the same order (test A5).
- Pair coverage = [W_L·min(cov_b^L, cov_q^L) + Σ_{B, available} w_k] / [W_L + Σ_{B, applicable} w_k]. With B empty
  this is V1's min(cov_b, cov_q).

**The per-pair feature vector is stored on every record:**
`{ carryGapPp, expectedGapBp, expectedChgBp, y2GapPp (context), dataGap, realGapPp, riskExposure, legs, sources }`. These are the raw bilateral
inputs a later pair relative-value engine (rec 7) consumes, so that engine can be built and shadowed without changing V2.

**Currency view (the reference for individual currency scores).** Each currency is scored against a basket: the
equal-weight mean of the other seven currencies' readings that are available (at least 4 of 7):
`s_c = [ W_L,c·s_c^L + Σ_{k∈B} w_k · d_k(c, basket) ] / [ W_L,c + Σ_{k∈B, available} w_k ]`.
- With B empty this is V1's currency score.
- Currency views are context, and the USD view feeds the asset models.
- **Pair scores are never derived from currency views**, so a pair is not "currency A's score minus currency B's"
  under F2 or F5.

### 3.4 S3: asset models

V1's asset model shapes and weights are kept. Only inputs that a switch changes are replaced:

| Input | Changed by | V2 |
|---|---|---|
| Fed path (gold, US indices) | F5 | the USD repricing reading of §4.5 (d_fedPath), on its own (not against a basket) |
| USD score (gold, oil, copper) | F2, F5 | the V2 USD currency view |
| Risk (all assets) | F4 | the risk factor F of §4.4 in place of R, with the same roles |
| Positioning (gold, indices, DE30, UK100) | F3 | removed from the score, shown as context |

## 4. Calculation definitions

Notation: t = issue time; bd = London business day; `clip(x, −2, 2)`; every driver outputs a continuous d ∈ [−2, 2]
(V2's bilateral drivers are continuous, not banded); w = V1's theory-v1 weight; "n/a" = outside the data universe
(out of the weight base, as V1); "missing" = in the universe but unavailable or stale (counts against coverage, as V1).

### 4.1 F1: timestamps, freshness, data quality

**Observation date.** Every reading carries `obsEnd`, the end of the period it measures:

| Source | V1 stamp | V2 `obsEnd` |
|---|---|---|
| Monthly series (rate-diff, real yield, scorecard monthly dims) | first day of the month (`YYYY-MM-01`) | last calendar day of that month |
| Quarterly series (GDP) | first day of the quarter | last day of the quarter |
| Daily series (policy rate, 2y, futures, VIX, HY, prices) | the observation date | the observation date (close) |
| Weekly COT | report date | report date. Knowable at its release (Friday 15:30 ET), as V1 |
| A partial month (e.g. a GBP monthly average built before the month ends) | period start | the date of the last daily point inside it, flagged `partial: true` |

**Age.** age = t − obsEnd, in days. A driver built from several inputs takes the age of its **oldest** used input,
not the newest. Each input carries its own age.

**Cadence budget.** An input is usable only while age ≤ `budget(cadence)`. Past that it is dropped individually, not
with its whole currency.

| Cadence | Expected age when current (cadence + typical lag) | Budget (V2) | Half-life for freshness |
|---|---|---|---|
| daily | 1 d | 10 d | 3 d |
| weekly | 10 d | 21 d | 10 d |
| monthly | 31 + 45 = 76 d | 110 d | 45 d |
| quarterly | 92 + 60 = 152 d | 245 d | 120 d |

These are a priori values from publication calendars. They are frozen (§4.9) and not fitted.

**Freshness.** For each input, f = 0.5^(max(0, age − expected) / halfLife) ∈ (0, 1].

**Data momentum under F1.** The currency's data reading is recomputed from the scorecard's per-dimension scores,
keeping only dimensions within budget. Factor means are recomputed from the surviving dimensions. At least 2 of the
growth, inflation, labour and demand factors are needed (V1's rule). The driver's age is its oldest surviving
dimension's age.

**Data quality.** This is an output, not a score adjustment (G6):
`dataQuality = Σ_{applicable k} w_k · present_k · f_k / Σ_{applicable k} w_k ∈ [0, 1]`, with f_k the driver's own
freshness (the minimum over its inputs). A pair's dataQuality is the weight-averaged dataQuality of its drivers,
bilateral drivers counting once.
- **The score is not discounted by freshness in V2.** Whether a discount helps is a separate later question (audit
  change 1b).
- **What F1 does change in the score:** (a) which inputs are dropped (now per input, by cadence, from `obsEnd`), and
  (b) the data driver's recomputation.

**F1 off** keeps V1's stamps, V1's "newest input" dating and V1's `MAX_AGE_DAYS` cliffs.

### 4.0 Two separate monetary signals

Current carry and expected repricing are different economic signals, and V2 keeps them as two separate drivers. Each
has its own weight, its own reading, its own contribution on the scoreboard and its own switch.

| Driver | Economic question | Reading | Horizon | Switch | Weight |
|---|---|---|---|---|---|
| **Carry** (`carry`) | What does holding base against quote pay **now**? | policy rate gap, pp | today | F2 | 0.20 (V1's rates weight) |
| **Expected policy repricing** (`repricing`) | How much **change** in the policy-rate gap does the market price over the next 6 months, and how has that expectation moved over the last 20 business days? | priced 6 m change gap, bp; its 20-bd change, bp | 6 months ahead; 20 bd of news | F5 | 0.25 (V1's policy weight) |

Neither includes the other:
- **Carry** uses only the current policy rates and never a future one.
- **Repricing** measures change relative to each bank's current rate, so a gap that is high but expected to stay put
  scores carry, not repricing.

The 2y yields are kept as **context** (`y2GapPp` on each pair) and as the repricing proxy where futures are missing
(§4.5). They never enter carry.

### 4.2 F2: carry, a genuine bilateral rate differential

**Reading.** r_c = the central bank's current policy rate in %, for all eight currencies:
- Fed funds upper, ECB deposit rate, BoE Bank Rate, BoJ operating target, RBA cash rate, RBNZ OCR, BoC target, SNB
  rate;
- source `/api/cb-expectations` `.policy`.

The policy rate is the same tenor (overnight) for every currency, held by all eight, and is what holding the currency
pays at the short end.

**Freshness of a policy rate.** A policy rate's `asOf` is its last **decision** date, and the rate stays valid until the
next decision. So its age is measured from when the policy table was **fetched** (daily budget, 10 d), never from the
decision date. A table not refreshed within 10 d makes carry missing.

**Pair driver (computed from the two legs' readings directly, never from currency views):**
`carryGapPp(b,q) = r_b − r_q`, `d_carry(b,q) = clip(carryGapPp / 1.0 pp, −2, 2)`.
- The scale is 1 pp per unit: a gap of 2 pp or more is a full ±2. For G10 that is an economically large carry against
  typical annual FX volatility of 7–10%. It is frozen a priori.
- **Exact sign flip.** r_q − r_b = −(r_b − r_q) exactly in floating point, and clip is symmetric, so
  d_carry(q,b) = −d_carry(b,q) bit for bit (test A5).

**Currency view (the reference).** Each currency is compared with a **basket = the equal-weight mean of the other seven
currencies' readings that are available**. At least 4 of the 7 must be available, else the currency view's carry is
missing. So d_carry(c, basket) = clip((r_c − mean_{j≠c} r_j) / 1.0, −2, 2).
- The basket is used **only** for the eight currency views (context, and the USD score used by the asset models). Pair
  scores never use it.

**What F2 removes.** F2 drops V1's own-history z term entirely. The rate-gap **change** is not counted here: priced
change belongs to repricing (F5).

**Missing.** If either leg's policy rate is missing, d_carry for the pair is missing.

### 4.3 F3: stance and COT out of the score

- The stance ±1 is removed from the policy driver. This happens under F3 whether the policy driver is V1's (F5 off) or
  V2's (F5 on).
- The positioning driver is removed from currency, pair and asset scores. Its weight leaves the base, and the remaining
  weights are renormalised as V1 does for n/a.
- Both are still computed and shown in a `context` block per market:
  - `stance: { score, meetingDate, note: 'banked NULL as a direction signal (cb-tone-direction); context only' }`;
  - `cot: { percentile, netSide, crowded, note: 'context only' }`.
- **Guarantee:** under F3, changing any stance or COT input changes no score, direction, strength or agreement (test
  A6).

### 4.4 F4: one risk factor

**Inputs.** All are point-in-time, and each z is against its own trailing 252-bd window ending at t − 1 bd.

| Input | Reading x | Risk-on sign |
|---|---|---|
| VIX level | log VIX close | − |
| VIX term | VIX / VIX3M | − |
| Credit | HY OAS 20-bd change, bp | − |
| Equity momentum, drift-adjusted | S&P 20-bd log return minus its own trailing 252-bd mean 20-bd return | + |

- **z-scores:** z_i = clip((x_i − mean_252) / sd_252, −3, 3) × sign_i.
- **The factor:** F = clip(mean of the available z_i, −2, 2). It needs at least 3 of the 4 inputs, else F is missing.
- **Equal weights.** PC1 loadings were 0.48–0.52 in the audit, so equal weights equal PC1 without fitting anything.
  Symmetry is by construction: z is symmetric, unlike V1's −2/+1 VIX-term bands.
- **Drift adjustment** removes the S&P leg's built-in +0.73 mean (audit finding 3).

**Use.** F replaces R wherever V1 uses R, with **V1's roles, weights and banding unchanged** (owner decision D1). F4
isolates only the construction of the factor:
- the risk-role driver of currencies: d = band(role × F, [0.3, 1.0]), V1's `TH.roleR` mapping;
- the regime layer;
- the asset models.


**"Tested before use": gate G-F4.** The factor is switched on in `v2` only if, on 2010-01-04 → 2024-08-20 (discovery;
the HY OAS gap before 2023-10 uses the 3-input version, labelled) and 2024-08-21 → 2026-08-20 (confirm), **without any
price outcome**:

| Check | Pass |
|---|---|
| (a) corr(F, PC1 of the same z's) | ≥ 0.90 in both periods |
| (b) mean F (drift-neutral) | \|mean F\| ≤ 0.10 in both periods |
| (c) symmetry | share of days F > 0 within 50 ± 10% |
| (d) coverage | F available on ≥ 95% of business days |

If the gate fails, `v2` runs with F4 off and the failure is reported. **The open question of the roles' sign** (the
backtest's FX risk-role −4.4 pp at 20 d) is not settled in V2. It needs its own pre-registered study (§10, D1).

### 4.5 F5: expected policy repricing (the priced 6-month path)

**Futures reading (primary)**, per currency with a futures strip (USD, EUR, GBP, CHF, CAD, AUD, JPY):
- **Expected repricing, level:** P_c = implied rate of the **6-month** rung − the current policy rate, in bp. This is the
  change priced by about 6 months: hikes +, cuts −. A `bill` strip (credit spread over policy) is read against its front
  contract instead, as `js/cbExpectations.js` does, and flagged.
- **Change in the expectation:** ΔP_c = 100 × (rate − rate4wAgo) **of the same contract**, in bp, read from the raw
  rung in KV `cb_rate_futures_v1`.
- **Kept for analysis, not scored:** the 3-month and 12-month rungs, with their bp and 4-week change, are stored on every
  record (`context.policyCurve`).

**Rung selection and roll handling.** The 6-month rung is chosen fresh at each issue from the raw rungs:
- **Rung choice:** the contract whose reference month is closest to issue month + 6. It must be within **±1 month** (V1
  allows ±2), else the futures reading is not used.
- **No splicing.** ΔP always compares a contract with **its own** price 4 weeks earlier (same `local` symbol). When the
  chosen rung moves to the next contract (the month rolls), the change is still that one contract's own change.
  Contracts are never spliced, so the roll creates no artificial jump.

**Continuity checks.** The futures reading is used only if all hold; otherwise the whole currency falls back to the 2y
proxy (level and change together, never mixed within a currency), with the failed check named:

| # | Check | Why |
|---|---|---|
| C1 | `rate` and `rate4wAgo` both present | a change needs both prices |
| C2 | 20 ≤ (date − date4wAgo) ≤ 35 calendar days | the "4 weeks ago" bar really is about 20 bd back (thin trading or a missing bar can make it older) |
| C3 | the rung's `date` ≤ 3 bd before the issue | the level is current |
| C4 | the contract's reference month ≥ issue month + 3 | not in or near delivery, where the price converges on the realised rate |
| C5 | the contract existed 4 weeks ago: `date4wAgo` ≥ the contract's first trading date when known; else C1–C2 are the guard | no change against a price that did not exist |
| C6 | \|ΔP\| ≤ 150 bp | a 6-bank-move repricing in 4 weeks is treated as a data error (stated), not a reading |

**Heterogeneity, stated not hidden.** USD and AUD use 1-month contracts (one month's average rate); EUR, GBP, CHF, CAD
and JPY use 3-month contracts (the compounded rate over months 6–9). Each bank's contract kind is stored. The level
measures slightly different windows across banks; this is a known limitation of the data held.

**2y proxy** (fallback; NZD always, as no NZD futures are held):
- **Level:** P̃_c = (y2_c − r_c) × 100 bp × 0.5;
- **Change:** ΔP̃_c = (y2_c(t) − y2_c(t − 20 bd)) × 100 bp, from the stored daily points.
- **Scaling, frozen a priori.** The 0.5 maps a 2-year average-rate gap onto a 6-month path; the 2y spread over policy
  also holds term premium, so it is a noisier measure. The proxy is marked `proxy: true`.
- **Missing** if the 2y point at t or at t − 20 bd is older than its budget. CHF is monthly (often stale, as V1) and NZD
  depends on RBNZ access.

**Pair driver** (bilateral, computed from the two legs' readings directly):

```
expectedGapBp  = P_b − P_q              (expected 6 m repricing gap)
expectedChgBp  = ΔP_b − ΔP_q            (the 20-bd change in that gap: the news)
d_repricing = 0.5·clip(expectedGapBp / 50 bp, −2, 2) + 0.5·clip(expectedChgBp / 25 bp, −2, 2)
```

- **Scales:** 50 bp = two standard 25 bp moves priced; 25 bp = one full move repriced in a month. These are frozen a
  priori.
- **Level and change carry equal weight.** The level is what is priced; the change is the news. A priori, neither
  dominates.
- **Two components on the scoreboard.** `repricing.level` and `repricing.change` are each reported with their own
  contribution: 0.5·w·d_level / den and 0.5·w·d_change / den, which sum to the driver's contribution.
- **Weight:** V1's policy weight, 0.25.
- **Exact sign flip:** as carry.
- **Mixed legs:** if one leg is futures and the other is proxy, the driver is computed and flagged `mixedSource`.
  Quality falls through f (§4.1).

**Currency view:** the same formula against the basket (§4.2): the equal-weight mean of the other seven currencies' P
and ΔP, at least 4 of 7 available.

**Fed path for assets:** d_fedPath = −[0.5·clip(P_USD / 50, −2, 2) + 0.5·clip(ΔP_USD / 25, −2, 2)]. Hawkish is negative
for gold and indices, V1's convention. The USD reading is used on its own, not against a basket. The ECB and BoE paths
for DE30 and UK100 work the same way.

**F5 off** keeps V1's 5-day policy driver. With F3 off it also keeps V1's stance nudge.

### 4.6 Unchanged drivers

Data momentum (except F1's dating and recomputation), real yield, commodity link and trend are V1's definitions, bands
and weights.

### 4.7 Combination, direction, strength (identical mapping for V1 and V2)

So the comparison isolates content, not presentation:
- **score:** as §3.3 for pairs and currencies; V1's `combine` for assets.
- **strength** = clamp(round(|score| × 5), 0, 10). This is a magnitude label only, never a probability.
- **direction** = sign(score), Neutral when:
  - strength ≤ 2; or
  - coverage < 0.5; or
  - V1's conflict rule (the two largest contributions have opposite signs and differ by < 0.1).

  These are V1's rules, kept so labels are comparable. Revising them is a later question.

### 4.8 Agreement, independent evidence, confidence

**Agreement** = Σ w_k·|d_k| over drivers whose contribution has the score's sign / Σ w_k·|d_k| over all present
drivers ∈ [0, 1]. Risk counts once. With a Neutral score it is reported, but it is "no direction".

**Independent evidence (families).** Drivers that read the same underlying market are grouped, so one source is not
counted as several confirmations:

| Family | Drivers |
|---|---|
| monetary | carry, repricing (or V1's rates and policy) |
| real rates | real yield, US real yield |
| macro data | data momentum, global data |
| risk | risk role |
| commodity | commodity link, inventories |
| cross-market | USD (inverted), own currency (assets) |
| price | trend |
| positioning | COT (only when F3 is off) |

`support = { for, against, families }`. A family is **for** when its net contribution has the score's sign and
\|net\| ≥ 0.02, **against** when the opposite. A direction resting on one family is shown as such ("monetary only").
Whether support predicts outcomes is a forward question (§9, descriptive).

**Confidence: explicitly uncalibrated.** Every market carries
`confidence: { status: "uncalibrated", haveDays: n, needDays: 120, note: "no forward calibration yet; strength is not a probability" }`.
- **Becoming calibrated:** only after ≥ 120 shared scored days of the **official** forward record (trial days never
  count).
- **The map:** a monotone (isotonic) map from |score| to P(direction right) per horizon, fitted only on V2's own
  earlier forward rows (expanding window, refitted monthly), scored on later rows.
- **Status:** `"calibrated"` only when that map exists and passes a reliability check (pre-registered in A7).
- **Never** fitted on history and never shared with V1's record.

### 4.9 Frozen constant table (G4; test A15 asserts the code equals this)

| Constant | Value | Section |
|---|---|---|
| Budgets daily / weekly / monthly / quarterly | 10 / 21 / 110 / 245 d | 4.1 |
| Expected age daily / weekly / monthly / quarterly | 1 / 10 / 76 / 152 d | 4.1 |
| Half-lives daily / weekly / monthly / quarterly | 3 / 10 / 45 / 120 d | 4.1 |
| Carry scale | 1.0 pp per unit | 4.2 |
| Risk window, z clip, minimum inputs | 252 bd, ±3, 3 of 4 | 4.4 |
| Risk gate thresholds | 0.90, 0.10, 50 ± 10%, 95% | 4.4 |
| Repricing rung, rung tolerance, futures age limit | 6 m, ±1 month, 3 bd | 4.5 |
| Continuity: 4-week window, minimum delivery distance, error cap | 20–35 cd, 3 months, 150 bp | 4.5 |
| Basket minimum | 4 of the other 7 | 4.2 |
| Family support threshold | \|net\| ≥ 0.02 | 4.8 |
| Repricing level scale, change scale, mix | 50 bp, 25 bp, 0.5 / 0.5 | 4.5 |
| 2y proxy level factor, change window | 0.5, 20 bd | 4.5 |
| Weights | V1 theory-v1, unchanged | — |
| Strength, Neutral rules | V1's, unchanged | 4.7 |
| Confidence minimum | 120 shared scored days of the official record | 4.8 |
| Dimension cadences | `DIM_CADENCE` in `js/biasEngineV2.js` (GDP quarterly; retail sales monthly for USD, quarterly otherwise; CPI quarterly for AUD and NZD; business confidence quarterly for AUD and NZD; labour quarterly for NZD; the rest monthly) | 4.1 |

## 5. Output schema (one record per issue; KV `bias_engine_v2_<date>`, index `bias_engine_v2_index`)

```json
{ "version": "bias-engine-v2-shadow", "specVersion": "1.1", "configHash": "...", "phase": "trial|forward",
  "date": "...", "asOf": "...", "issuedAt": "...",
  "snapshot": { "sha256": "...", "removedLookahead": [] },
  "dataIdentity": { "v1Issue": "bias_engine_<date>", "labelAgreement": 0.97 },
  "riskGate": { "pass": true, "checks": { ... } },
  "variants": {
    "v1r": { "switches": { "F1": false, ... }, "markets": { "<MARKET>": MARKET } , "currencies": { ... } },
    "v2":  { ... }, "v2-noF1": { ... }, ..., "v1r+F5": { ... } } }
MARKET = { "direction": "BULLISH|BEARISH|NEUTRAL", "score": -0.84, "strength": 4,
           "confidence": { "status": "uncalibrated", "haveDays": 0, "needDays": 120, "note": "..." },
           "dataQuality": 0.81, "agreement": 0.72, "coverage": 0.9,
           "support": { "for": ["monetary", "risk"], "against": ["price"], "families": 5 },
           "drivers": [{ "key", "family", "leg", "bilateral", "d", "w", "contrib", "components", "reading", "obsEnd", "age", "f", "proxy", "why" }],
           "pairFeatures": { "carryGapPp", "expectedGapBp", "expectedChgBp", "y2GapPp", "dataGap", "realGapPp", "riskExposure", "sources" },
           "context": { "stance": {...}, "cot": {...}, "policyCurve": { "m3", "m6", "m12" } } }
```

- **Routes:** `GET /api/bias-engine-v2` (`?date`, `?market`, `?variant`, `?index=1`) and `/api/bias-engine-v2/compare`
  (V1 against V2 per market, with each switch's attribution).
- **Desk Terminal:** an owner-only panel `panel.macro.bev2`, kind `internal`, in the Macro tab beside the Bias engine
  section. It shows V1 against V2, the switch attribution and the forward record. The desk login never sees it.

## 6. Acceptance tests (must all pass before the first shadow issue)

### 6.1 Identity, isolation, lookahead (code tests, `js/biasEngineV2.test.mjs`)

| # | Test | Pass |
|---|---|---|
| A1 | All switches off reproduce V1 exactly | On the V1 test fixtures and on three stored live snapshots, `v1r` equals `buildBiasRecord` from `js/biasEngine.js` for every market's score (to 1e-12), direction, strength and coverage. |
| A2 | Determinism | The same snapshot gives a byte-identical record (`issuedAt` excluded). |
| A3 | Lookahead | A reading with knowable time > t is removed: the result equals the snapshot without it, for every variant. |
| A4 | One snapshot | All 12 variants carry the same `snapshot.sha256`. |
| A5 | Pair antisymmetry | S(q,b) = −S(b,q) and the pair features flip sign, for all 28 crosses and every variant. |
| A6 | F3 isolation | Under F3, random stance and COT inputs (1,000 draws) change no score, direction, strength or agreement. They change only `context`. |
| A7 | Switch locality | Toggling Fi changes only the drivers Fi owns (F1: drops, ages and the data recomputation; F2: rates → carry; F3: the policy stance part, positioning; F4: risk and its consumers; F5: policy → repricing, and the Fed/ECB/BoE paths). Every other driver's d is identical. |
| A8 | Carry correctness | AUD 4.85% vs JPY 1.228% gives carryGapPp +3.62 and d_carry +2 for AUDJPY, −2 for JPYAUD. Equal rates give 0. d is monotone in the gap. |
| A9 | Repricing correctness | USD m6 +54 bp and EUR +42 bp, with 20-bd changes USD −8 and EUR −2: EURUSD expectedGapBp = −12, expectedChgBp = +6, d_repricing = 0.5·(−0.24) + 0.5·(+0.24) = 0.00. Equal levels, base repriced +25 bp against an unchanged quote: d_repricing = +0.5. Proxy legs are flagged. |
| A10 | Risk factor | Mirrored inputs give −F. A constant upward S&P drift with flat vol gives F ≈ 0 (drift-adjusted). With fewer than 3 inputs F is missing. |
| A11 | Freshness | A monthly October value has obsEnd 10-31. A driver's age is its oldest input's age. On 11-18, Q2 GDP (obsEnd 06-30) is 141 d old: kept, f = 1 (within the 152 d expected age). Q1 GDP (obsEnd 03-31) is 232 d old: kept, f = 0.5^((232 − 152)/120) = 0.63. An input past budget is dropped alone, not its currency. dataQuality is in [0, 1] and falls monotonically with age. |
| A12 | Variant table | The 12 variants exist with the switch sets of §2. |
| A13 | V1 untouched | The pinned SHA-256 of `js/biasEngine.js` and of V1's issue function text in `server.js` match. |
| A14 | No production reads | No file other than V2's own, its route, its panel and the scoreboard imports `js/biasEngineV2.js` or reads `bias_engine_v2_*`. |
| A15 | Constants | The code's constant object equals the §4.9 table. |
| A16 | Schema | Every market in every variant has all of direction, score, strength, confidence, dataQuality, agreement, support, coverage, drivers and context. None is null except a missing driver's d (with its `why`). confidence.status is `"uncalibrated"`. |
| A17 | Contributions sum | For every market and variant, the drivers' contributions (repricing's two components included) sum to the score within 1e-9. |
| A18 | Pairs independent of currency views | Under F2 or F5, changing a third currency's reading (not b or q) leaves S(b,q) unchanged and moves the currency views. |
| A19 | Roll and continuity | A rung whose 4-week bar is 40 days back, or whose month is 2 months out, or whose change is 200 bp, fails C2, C4 or C6 respectively, and the currency falls back to the 2y proxy for both level and change. The chosen rung moves to the next contract at a month boundary with no jump in ΔP (its own price history only). |
| A20 | Trial excluded | With no frozen forward start, or a date before it, no scoreboard row for V2 is produced (the issue function returns none). From the forward start on, rows are produced. |
| A21 | Freeze | After the freeze, the SHA-256 of the spec, of the constants and config object, and of `js/biasEngineV2.js` equal the freeze manifest's. Any change fails the test until a new version (`-v2.1`) with a new forward start is declared. |

### 6.2 Economic sanity (scenario fixtures, `js/biasEngineV2.econ.test.mjs`)

Each scenario has a direction that follows from theory alone, fixed here:

| # | Scenario (all else equal) | V2 must |
|---|---|---|
| E1 | Base currency's policy rate 2 pp above the quote's | lean Bullish the pair through carry (d_carry +2) |
| E2 | Base currency's priced 6 m path +50 bp, quote 0, no change | d_repricing +0.5 (level half) |
| E3 | Base repriced +25 bp hawkish in 20 bd, quote unchanged | d_repricing +0.5 (change half) |
| E9 | Base pays 2 pp more carry, but cuts are priced so the gap is expected to shrink by 50 bp | carry +2 and repricing −0.5, shown as two separate contributions |
| E4 | Hawkish base with crowded long COT | the same score as without the COT (F3); a COT warning in context |
| E5 | Risk-off shock (VIX +2 sd, term inverted, HY +2 sd, S&P −2 sd) | F ≤ −1.5. JPY and CHF view up and AUD/NZD down through the roles; indices down |
| E6 | Calm, steadily rising equities only | F within ±0.25 (no risk-on lean from drift alone) |
| E7 | US priced path +50 bp hawkish | gold and US indices' Fed-path d negative |
| E8 | A currency whose only fresh data is one dimension | data driver missing (needs 2 factors); dataQuality falls; no label from one stale driver |

### 6.3 Technical trial (5 London weekdays after deploy; technical validation only)

The trial checks that the machinery works. **Trial days never count towards the official forward record**:
- V2 records are stored with `phase: "trial"`;
- no V2 scoreboard row is written (test A20);
- no trial outcome is ever scored or reported as performance;
- the trial's direction calls are not looked at for any decision.

| # | Check | Pass |
|---|---|---|
| O1 | Issued inside 05:30–06:00 | ≥ 4 of 5 days |
| O2 | Data identity: `v1r` labels vs the production V1 issue | ≥ 95% agreement each day, or a logged cause |
| O3 | The risk gate G-F4 result is recorded | present |
| O4 | V1, the Desk Bias Process and the Desk Terminal output unchanged | V1 record hash pattern and process issues unchanged; no new reads of V2 keys |
| O5 | Scoreboard rows | `<D>_engine_v2.json` written each day, with the same instruments and anchors as `<D>_engine.json` |

### 6.4 Freeze, then the official forward record

After O1–O5 pass, and before the first official day, one commit:
1. **Freeze manifest.** It writes `forge/BIAS_ENGINE_V2_FREEZE.json` with the SHA-256 of this spec, of the constants
   and config object, and of `js/biasEngineV2.js`, plus the risk-gate result and the B0 d20 baselines version.
2. **Forward start.** It sets `FORWARD_START` (the next London weekday) in the V2 config.
3. **Prereg.** It commits prereg amendment A7 to `forge/BIAS_SCOREBOARD_PREREG.md`, with the power simulation.

From then on, test A21 fails on any change to the frozen files. A change means a new version (`bias-engine-v2.1`) with
its own forward start, and the old version keeps running beside it for 20 days. The thresholds, weights, switches and
configuration are frozen together; nothing is tuned after the forward record starts.

**Before the freeze can happen, the B0 base rates for d20 must exist.** They come from the research M1 cache on the
laptop: `python scripts/bias-scoreboard/b0.py --d20`, writing `js/biasScoreboardBaselinesD20.json`, version
`b0-sameday-d20-20260821`, from data before 2026-08-21.

## 7. Historical screens (falsification only; pre-registered with the build; lockbox respected)

These can **demote** a change, never promote one (G8). Each is its own slug with a register row and prereg.
- **S2 (carry):** monthly, 28 crosses, 2010-01 → 2024-08 discovery, 2024-08 → 2026-08-20 confirm, point-in-time
  policy rates (ALFRED or central-bank decision dates). Rank-IC of d_carry with the next 20-bd pair return, against V1's
  (d_b − d_q)/2 rates term. Demote F2 if its IC is below V1's beyond the CI in both periods.
- **S4 (risk factor):** gate G-F4 (§4.4), construction only, no outcomes.
- **S5 (policy, 2y proxy only):** futures history is not held, so only the proxy can be screened. Currency-level
  rank-IC of the 2y-proxy d_repricing with the next 20-bd currency (basket) return, against V1's 5-day policy driver.
  Demote F5 if its IC is below V1's beyond the CI in both periods.
- **F1 and F3** have no historical screen (no point-in-time scorecard or stance history). Forward only.

## 8. The scoreboard (G7)

Recorded in prereg amendment A7, committed at the freeze (§6.4), before the first official day.
- **Official days only.** The source file `forward/direction_ledger/sameday/<D>_engine_v2.json` is written only for
  London dates on or after the frozen `FORWARD_START`. It is written on the first tick in [07:00, 10:00) London after
  `bias_engine_v2_<D>` exists, at the 07:00 anchor (the same rule as V1's `<D>_engine.json`). Trial dates get no file
  (test A20).
- **Forecaster rows**, all from the same day's records:

  | Row | Source | Role |
  |---|---|---|
  | `bias-engine-v1` | the production V1 issue `bias_engine_<D>` | the production control |
  | `bias-engine-v1r` | variant `v1r` of the V2 record | the control on identical inputs |
  | `bias-engine-v2` | variant `v2` | the candidate |
  | `bias-engine-v2-noF1…5`, `bias-engine-v1r+F1…5` | the attribution variants | descriptive only |

  V1's existing `<D>_engine.json` rows (prereg A3) are left as they are.
- **Mapping:** V1's frozen `bias-engine` mapping for every row: side = direction; Neutral = no view; p_up = clip(p0 ±
  0.01 × strength). Identical mapping means only the engine's content differs.
- **Each driver's contribution is on the row.** Every row's `inputs` carries:
  - `drivers: [{ key, family, leg, d, w, contrib, components }]`, the full list, contributions summing to the score;
  - `support: { for, against, families }`;
  - `dataQuality`, `agreement`, `coverage` and `score`.

  The scoreboard can show, per call, which drivers produced it and whether that conclusion rests on independent
  families or on one source.
- **Horizons:** d21, n07, d5 (as now) and **d20** (07:00 London 20 weekdays later). d20 is added only in this source
  file, through an optional per-source target list (`issueSameDay({ targets })`). The other sources keep their three
  targets unchanged.
- **B0 for d20:** `js/biasScoreboardBaselinesD20.json`, version `b0-sameday-d20-20260821`, built on the laptop from data
  before 2026-08-21 (§6.4).
- **Instruments:** the scoreboard's 13. The V2 record keeps all 28 crosses and the assets for the later pair engine,
  but only these 13 are scored.
- **Per-driver forward record (descriptive).** For each driver and each family, on official days:
  - the hit rate of the sign of its contribution, where |contrib| ≥ 0.02, against the outcome at d5 and d20, with B0;
  - the hit rate of calls with support from ≥ 3 families against calls resting on 1.

  This shows whether a conclusion that rests on independent evidence does better than one that does not. It is served
  by `/api/bias-engine-v2/compare` and the owner panel.

## 9. Evaluation and promotion rules (forward; frozen in A7)

**Primary question.** On shared instrument-days, does `v2` beat `v1r` at **d5** and **d20**?
- **Measures:** hit excess over B0 and log score vs B0, as paired differences (v2 − v1r).
- **Intervals:** 20-bd block bootstrap (B 2000, seed 20261119); Holm over the 2 horizons × 3 groups (fx, gold, idx).
- **Disagreement days:** the paired comparison on days where v2 and v1r directions differ (the only days that can
  separate them) is reported alongside.

**Secondary (descriptive, BH q 0.10):**
- each switch's attribution (`v2-noFi` vs `v2`, `v1r+Fi` vs `v1r`);
- dataQuality terciles;
- agreement terciles;
- Neutral share;
- label flicker (changes per market-week);
- d21 and n07.

**Looks:** 60, 120 and 250 shared scored days. No other looks.

**Honest power.**
- d20 outcomes overlap and the 13 instruments are correlated (seven USD pairs). At 250 days the effective sample is
  roughly 60–100 independent observations, so only a large difference (of order 10–15 pp hit excess at d20, about half
  that at d5) can be separated statistically.
- The prereg will fix this with a planted-signal power simulation before the first issue.
- A verdict of "V2 is better" may therefore take more than a year. Most of the evidence in the first months will be
  §6 (economic meaning) and non-inferiority.

**Promotion to production requires all of:**
1. §6 all passing, the technical trial passed, and the freeze in place;
2. ≥ 250 shared scored days of the official record (trial days excluded);
3. at d20 and d5, v2 not worse than v1r beyond a non-inferiority margin of −1 pp hit excess (one-sided 95%) in fx, and
   in gold and idx where powered;
4. v2's hit excess over B0 at d20 not negative beyond its CI;
5. no historical screen (§7) demoted a switch that is on in `v2`, or that switch is turned off first and the 250 days
   restart for the new configuration;
6. the owner's explicit approval. Nothing in production (the Desk Bias Process, the Desk Terminal cards, any trade
   plan or alert) reads V2 until then.

**"More useful" is claimed only if** the Holm-adjusted v2 − v1r interval excludes zero. Non-inferiority alone supports
"more economically meaningful at no measured cost", not "better".

## 10. Decisions (owner, 2026-11-19)

| # | Decision | Taken |
|---|---|---|
| D1 | FX risk roles in `v2` | **Keep V1's roles, weight and banding.** F4 isolates the construction of the risk factor. The roles' sign gets its own pre-registered study later. |
| D2 | Rate gap | **The policy rate is the primary carry measure.** The 2y yields are kept separately as context (`y2GapPp`) and as the repricing proxy. |
| D3 | Policy horizon | **6 months, with the 20-business-day change.** The 3 m and 12 m readings are kept for analysis (`context.policyCurve`). |
| D4 | Visibility | **Owner only until promotion.** |

Further requirements, all written into this spec:
- carry and expected repricing are separate signals (§4.0);
- the currency reference is the basket, and pair differentials are independent of it and flip exactly (§3.3, §4.2;
  A5, A18);
- futures roll and continuity checks (§4.5; A19);
- the trial is technical only and never counts (§6.3; A20);
- freeze before the official record (§6.4; A21);
- confidence is explicitly uncalibrated (§4.8);
- each driver's contribution is on the scoreboard, with independent-evidence families (§4.8, §8).

## 11. Build order

1. `js/biasEngineV2.js` (pure: snapshot → 12 variants, carrying its own copy of V1's driver logic, since V1 is not
   edited; A1 proves the copy exact), the A and E tests, and the constant table.
2. The risk-gate script (`scripts/bias-engine-v2/risk_gate.mjs`, the same factor code, data before 2026-08-21) and its
   committed result. F4 is on in `v2` only if the gate passes.
3. The snapshot gather and the issue job in `server.js` (new code only: it calls V1's gather and adds the extras), KV
   keys, registries, service flag `biasEngineV2`.
4. The routes and the owner-only panel.
5. The scoreboard: `<D>_engine_v2.json` (official days only), the per-source d20 target, `b0.py --d20` (laptop).
6. Deploy → the technical trial (§6.3).
7. Freeze, prereg A7 and its power simulation, `FORWARD_START` (§6.4) → the official forward record.
8. The historical screens S2 and S5 (register rows, preregs, laptop runs), in parallel. They can only demote.

Also: a register row `EXPLORATORY` for the audit, as the research protocol requires (the audit could not write it).
