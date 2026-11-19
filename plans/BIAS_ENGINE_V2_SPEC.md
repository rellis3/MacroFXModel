# Bias Engine V2 (shadow): specification, calculation definitions and acceptance tests

**Status: SPEC FOR REVIEW. Nothing is built yet.** Owner, 2026-11-19: "proceed with Bias Engine V2 in shadow mode",
with recommendations 1–5 of the audit (`analysis/output/bias-engine-audit/AUDIT.md`).

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
S1  Feature layer       per currency: policy path, policy rate, data momentum, real yield, commodity, trend,
                        stance (context), COT (context); global: risk factor F (or V1's R)
S2  Pair layer          28 crosses: bilateral drivers (carry gap, policy-path gap) + leg drivers (V1 style)
S3  Market views        pair scores; currency views (each vs the other seven); asset models (V1 shape, V2 inputs)
S4  Outputs             per market: direction, score, strength, confidence, dataQuality, agreement, drivers, context
```

### 3.1 S0: input snapshot (G3)

- **Gather.** The V2 issue job runs in V1's window (05:30–06:00 London), after V1's issue exists. It does its own
  gather of a **superset** of V1's inputs. It does not touch V1's gather.
- **What the snapshot adds to V1's inputs:**
  - the futures rungs' `rate`, `rate4wAgo` and their dates (already in KV `cb_rate_futures_v1`);
  - the policy-rate table for all eight currencies;
  - the 2y daily points (60 kept);
  - the raw risk series: VIX and VIX3M daily closes for 1 year, HY OAS daily, S&P closes for 1 year;
  - the macro scorecard's per-dimension scores, `asOf` and cadence.
- **Storage.** Stored with its SHA-256, so a whole record can be replayed byte for byte.
- **Lookahead guard.** Any reading whose knowable time is after the issue time is removed before S1, and the
  removal is logged.
- **Data identity check.** `v1r` (V1's logic on the V2 snapshot) is compared with the production V1 issue of the same
  day. Labels should agree on ≥ 95% of markets; a lower rate is an operational alert, not a result.

### 3.2 S1: feature layer (definitions in §4)

### 3.3 S2: pair layer (the hook for a future relative-value engine)

For a pair (b, q), drivers fall into two sets:
- **bilateral set B**: carry (if F2 is on) and policy path (if F5 is on). These are defined on the pair directly.
- **leg set L**: every other driver, computed per currency as in V1. When F2 or F5 is off, V1's per-currency rates or
  policy driver is in L.

```
leg score     s_c^L = Σ_{k∈L, available} w_k d_{k,c} / Σ_{k∈L, available} w_k            (V1's renormalisation)
pair score    S(b,q) = [ W_L·(s_b^L − s_q^L)/2 + Σ_{k∈B, available} w_k d_k(b,q) ] / [ W_L + Σ_{k∈B, available} w_k ]
              where W_L = Σ_{k∈L} w_k (nominal; each leg is already renormalised)
```

- With B empty, S(b,q) = (s_b − s_q)/2, which is V1's pair score exactly.
- S(q,b) = −S(b,q) always (test A5).

**The per-pair feature vector is stored on every record:**
`{ carryGapPp, pathGapBp, pathGapChg20Bp, dataGap, realGapPp, riskExposure, legs }`. These are the raw bilateral
inputs a later pair relative-value engine (rec 7) consumes, so that engine can be built and shadowed without changing V2.

**Currency view.** Each currency is scored against the other seven:
`s_c = [ W_L·s_c^L + Σ_{k∈B} w_k · d_k(c, basket) ] / [ W_L + Σ_{k∈B, available} w_k ]`,
where d_k(c, basket) is the bilateral driver computed against the equal-weight mean of the other seven currencies'
readings. With B empty this is V1's currency score.

### 3.4 S3: asset models

V1's asset model shapes and weights are kept. Only inputs that a switch changes are replaced:

| Input | Changed by | V2 |
|---|---|---|
| Fed path (gold, US indices) | F5 | the USD policy-path driver d_policy(USD) of §4.5, on its own (not against a basket) |
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

### 4.2 F2: carry, a genuine bilateral rate differential

**Reading.** r_c = the central bank's current policy rate in %, for all eight currencies:
- Fed funds upper, ECB deposit rate, BoE Bank Rate, BoJ operating target, RBA cash rate, RBNZ OCR, BoC target, SNB
  rate;
- source `/api/cb-expectations` `.policy`;
- daily, with its own `asOf`.

The policy rate is the same tenor (overnight) for every currency, held by all eight, and is what holding the currency
pays at the short end.

**Pair driver.** carryGapPp(b,q) = r_b − r_q. d_carry = clip(carryGapPp / 1.0 pp, −2, 2).
- The scale is 1 pp per unit, so a gap of 2 pp or more is a full ±2. That is a carry gap that is economically large
  for G10 against typical annual FX volatility of 7–10%. It is frozen a priori.
- Weight: V1's rates weight, 0.20.

**Currency view:** d_carry(c, basket) = clip((r_c − mean_{j≠c} r_j) / 1.0, −2, 2).

**What F2 removes.** F2 drops V1's own-history z term entirely. The change in rate gaps is not double counted here:
expected changes belong to the policy path (F5).

**Missing.** If either leg's policy rate is missing or stale (> 10 d, daily budget), d_carry is missing.

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

**Use.** F replaces R wherever V1 uses R:
- the risk-role driver of currencies (role × F, d = clip(role × F, −2, 2), continuous);
- the regime layer;
- the asset models.

V1's roles and weights are kept: F4 isolates the **construction** of the factor, not the roles.

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

### 4.5 F5: policy from the priced path

**Futures reading (primary)**, per currency with a futures strip (USD, EUR, GBP, CHF, CAD, AUD, JPY):
- **Path level:** P_c = implied rate at the **6-month** rung minus the current policy rate, in bp (`m6.bp`). This is
  how many basis points of hikes (+) or cuts (−) are priced over 6 months.
- **Path change:** ΔP_c = 100 × (rate − rate4wAgo) of the same 6-month contract, in bp. This is the 20-bd repricing,
  from the rung's own `rate4wAgo`, already pulled by the laptop script.
- **Freshness:** the rung's `date`. Usable if ≤ 3 bd old; else fall back to the proxy.

**2y proxy** (fallback; NZD always, as no NZD futures are held):
- **Level:** P̃_c = (y2_c − r_c) × 100 bp × 0.5;
- **Change:** ΔP̃_c = (y2_c(t) − y2_c(t − 20 bd)) × 100 bp.
- **Scaling, frozen a priori.** The 0.5 maps a 2-year average-rate gap onto a 6-month path; the 2y spread over policy
  also holds term premium, so it is a noisier measure. The proxy is marked `proxy: true`.
- **Missing** if the 2y point at t or at t − 20 bd is older than its budget. CHF is monthly (often stale, as V1) and NZD
  depends on RBNZ access.

**Pair driver** (bilateral):

```
pathGapBp      = P_b − P_q              (level)
pathGapChg20Bp = ΔP_b − ΔP_q            (repricing)
d_policy = 0.5·clip(pathGapBp / 50 bp, −2, 2) + 0.5·clip(pathGapChg20Bp / 25 bp, −2, 2)
```

- **Scales:** 50 bp = two standard 25 bp moves priced; 25 bp = one full move repriced in a month. These are frozen a
  priori.
- **Level and change carry equal weight.** The level is what is priced; the change is the news. A priori, neither
  dominates.
- **Weight:** V1's policy weight, 0.25.
- **Mixed legs:** if one leg is futures and the other is proxy, the driver is computed and flagged `mixedSource`.
  Quality falls through f (§4.1).

**Currency view:** the same formula against the equal-weight mean of the other seven currencies' P and ΔP (those
available).

**Fed path for assets:** d_fedPath = 0.5·clip(P_USD / 50, −2, 2) + 0.5·clip(ΔP_USD / 25, −2, 2), signed so that hawkish
is negative for gold and indices (as V1's convention).

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

### 4.8 Agreement and confidence (§5 fields)

**Agreement** = Σ w_k·|d_k| over drivers whose contribution has the score's sign / Σ w_k·|d_k| over all present
drivers ∈ [0, 1]. Risk counts once. With a Neutral score it is reported, but it is "no direction".

**Confidence** = null, reported as `"uncalibrated"`, until V2 has ≥ 120 shared scored days. After that:
- **The map:** a monotone (isotonic) map from |score| to P(direction right) per horizon.
- **Fit data:** fitted only on V2's own earlier forward rows (expanding window, refitted monthly).
- **Scoring:** scored on later rows only.
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
| Path rung, futures age limit | 6 m, 3 bd | 4.5 |
| Path level scale, change scale, mix | 50 bp, 25 bp, 0.5 / 0.5 | 4.5 |
| 2y proxy level factor, change window | 0.5, 20 bd | 4.5 |
| Weights | V1 theory-v1, unchanged | — |
| Strength, Neutral rules | V1's, unchanged | 4.7 |
| Confidence minimum | 120 shared scored days | 4.8 |

## 5. Output schema (one record per issue; KV `bias_engine_v2_<date>`, index `bias_engine_v2_index`)

```json
{ "version": "bias-engine-v2-shadow", "specVersion": "2026-11-19", "date": "...", "asOf": "...", "issuedAt": "...",
  "snapshot": { "sha256": "...", "removedLookahead": [] },
  "dataIdentity": { "v1Issue": "bias_engine_<date>", "labelAgreement": 0.97 },
  "riskGate": { "pass": true, "checks": { ... } },
  "variants": {
    "v1r": { "switches": { "F1": false, ... }, "markets": { "<MARKET>": MARKET } , "currencies": { ... } },
    "v2":  { ... }, "v2-noF1": { ... }, ..., "v1r+F5": { ... } } }
MARKET = { "direction": "BULLISH|BEARISH|NEUTRAL", "score": -0.84, "strength": 4, "confidence": "uncalibrated",
           "dataQuality": 0.81, "agreement": 0.72, "coverage": 0.9,
           "drivers": [{ "key", "bilateral", "d", "w", "contrib", "reading", "obsEnd", "age", "f", "proxy", "why" }],
           "pairFeatures": { "carryGapPp", "pathGapBp", "pathGapChg20Bp", "dataGap", "realGapPp", "riskExposure" },
           "context": { "stance": {...}, "cot": {...} } }
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
| A7 | Switch locality | Toggling Fi changes only the drivers Fi owns (F1: drops, ages and the data recomputation; F2: rates/carry; F3: policy stance part, positioning; F4: risk and its consumers; F5: policy and Fed path). Every other driver's d is identical. |
| A8 | Carry correctness | AUD 4.85% vs JPY 1.228% gives carryGapPp +3.62 and d_carry +2 for AUDJPY, −2 for JPYAUD. Equal rates give 0. d is monotone in the gap. |
| A9 | Policy correctness | USD m6 +54 bp and EUR +42 bp, with 20-bd changes USD −8 and EUR −2: EURUSD pathGapBp = −12, pathGapChg20Bp = +6, d_policy = 0.5·(−0.24) + 0.5·(+0.24) = 0.00. Equal levels, base repriced +25 bp against an unchanged quote: d_policy = +0.5. Proxy legs are flagged. |
| A10 | Risk factor | Mirrored inputs give −F. A constant upward S&P drift with flat vol gives F ≈ 0 (drift-adjusted). With fewer than 3 inputs F is missing. |
| A11 | Freshness | A monthly October value has obsEnd 10-31. A driver's age is its oldest input's age. On 11-18, Q2 GDP (obsEnd 06-30) is 141 d old: kept, f = 1 (within the 152 d expected age). Q1 GDP (obsEnd 03-31) is 232 d old: kept, f = 0.5^((232 − 152)/120) = 0.63. An input past budget is dropped alone, not its currency. dataQuality is in [0, 1] and falls monotonically with age. |
| A12 | Variant table | The 12 variants exist with the switch sets of §2. |
| A13 | V1 untouched | The pinned SHA-256 of `js/biasEngine.js` and of V1's issue function text in `server.js` match. |
| A14 | No production reads | No file other than V2's own, its route, its panel and the scoreboard imports `js/biasEngineV2.js` or reads `bias_engine_v2_*`. |
| A15 | Constants | The code's constant object equals the §4.9 table. |
| A16 | Schema | Every market in every variant has all of direction, score, strength, confidence, dataQuality, agreement, coverage, drivers and context. None is null except confidence (`"uncalibrated"`) and a missing driver's d (with its `why`). |

### 6.2 Economic sanity (scenario fixtures, `js/biasEngineV2.econ.test.mjs`)

Each scenario has a direction that follows from theory alone, fixed here:

| # | Scenario (all else equal) | V2 must |
|---|---|---|
| E1 | Base currency's policy rate 2 pp above the quote's | lean Bullish the pair through carry (d_carry +2) |
| E2 | Base currency's priced 6 m path +50 bp, quote 0, no change | d_policy +0.5 (level half) |
| E3 | Base repriced +25 bp hawkish in 20 bd, quote unchanged | d_policy +0.5 (change half) |
| E4 | Hawkish base with crowded long COT | the same score as without the COT (F3); a COT warning in context |
| E5 | Risk-off shock (VIX +2 sd, term inverted, HY +2 sd, S&P −2 sd) | F ≤ −1.5. JPY and CHF view up and AUD/NZD down through the roles; indices down |
| E6 | Calm, steadily rising equities only | F within ±0.25 (no risk-on lean from drift alone) |
| E7 | US priced path +50 bp hawkish | gold and US indices' Fed-path d negative |
| E8 | A currency whose only fresh data is one dimension | data driver missing (needs 2 factors); dataQuality falls; no label from one stale driver |

### 6.3 Operational acceptance (shadow burn-in, 5 London weekdays after deploy, before the forward clock starts)

| # | Check | Pass |
|---|---|---|
| O1 | Issued inside 05:30–06:00 | ≥ 4 of 5 days |
| O2 | Data identity: `v1r` labels vs the production V1 issue | ≥ 95% agreement each day, or a logged cause |
| O3 | The risk gate G-F4 result is recorded | present |
| O4 | V1, the Desk Bias Process and the Desk Terminal output unchanged | V1 record hash pattern and process issues unchanged; no new reads of V2 keys |
| O5 | Scoreboard rows | `<D>_engine_v2.json` written each day, with the same instruments and anchors as `<D>_engine.json` |

The forward clock (§9) starts on the first weekday after O1–O5 pass.

## 7. Historical screens (falsification only; pre-registered with the build; lockbox respected)

These can **demote** a change, never promote one (G8). Each is its own slug with a register row and prereg.
- **S2 (carry):** monthly, 28 crosses, 2010-01 → 2024-08 discovery, 2024-08 → 2026-08-20 confirm, point-in-time
  policy rates (ALFRED or central-bank decision dates). Rank-IC of d_carry with the next 20-bd pair return, against V1's
  (d_b − d_q)/2 rates term. Demote F2 if its IC is below V1's beyond the CI in both periods.
- **S4 (risk factor):** gate G-F4 (§4.4), construction only, no outcomes.
- **S5 (policy, 2y proxy only):** futures history is not held, so only the proxy can be screened. Currency-level
  rank-IC of the 2y-proxy d_policy with the next 20-bd currency (basket) return, against V1's 5-day policy driver.
  Demote F5 if its IC is below V1's beyond the CI in both periods.
- **F1 and F3** have no historical screen (no point-in-time scorecard or stance history). Forward only.

## 8. The scoreboard (G7)

Recorded in prereg amendment A7, committed before the first V2 issue.
- **New source file** `forward/direction_ledger/sameday/<D>_engine_v2.json`. It is written on the first tick in
  [07:00, 10:00) London after `bias_engine_v2_<D>` exists, at the 07:00 anchor.
- **Forecaster rows:** `bias-engine-v2` (variant `v2`) and `bias-engine-v1r` (variant `v1r`), both primary.
  `bias-engine-v2-noF1…5` and `bias-engine-v1r+F1…5` are attribution rows, descriptive only.
- **Mapping:** V1's frozen `bias-engine` mapping for all of them: side = direction; Neutral = no view; p_up = clip(p0 ±
  0.01 × strength). Identical mapping means only the engine's content differs.
- **New target `d20`** (07:00 London 20 weekdays later). It is added for all engine forecasters (V1's production
  `bias-engine` too: adding an outcome horizon changes nothing in V1's engine).
  - B0 for d20 is computed from data before 2026-08-21 and frozen as baselines `b0-sameday-d20-20260821`.
  - The existing d21, n07 and d5 continue.
- **Instruments:** the scoreboard's 13. The V2 record keeps all 28 crosses and the assets for the later pair engine,
  but only these 13 are scored.

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
1. §6 all passing, and the burn-in passed;
2. ≥ 250 shared scored days;
3. at d20 and d5, v2 not worse than v1r beyond a non-inferiority margin of −1 pp hit excess (one-sided 95%) in fx, and
   in gold and idx where powered;
4. v2's hit excess over B0 at d20 not negative beyond its CI;
5. no historical screen (§7) demoted a switch that is on in `v2`, or that switch is turned off first and the 250 days
   restart for the new configuration;
6. the owner's decision.

**"More useful" is claimed only if** the Holm-adjusted v2 − v1r interval excludes zero. Non-inferiority alone supports
"more economically meaningful at no measured cost", not "better".

## 10. Decisions for the owner before the build

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | FX risk roles in `v2` | (a) keep V1's roles and weight, so F4 tests only the factor's construction; (b) set the roles to 0 now, as the audit suggested | **(a)**. Zeroing them because the old backtest found them harmful is using that backtest to choose a weight, which G4 rules out. Their sign gets its own pre-registered study (discovery 2010–2018, confirm 2018 → 2026-08-20). `v2-noRoles` can be recorded as an extra attribution row. |
| D2 | Carry tenor | (a) policy rate (all 8, daily); (b) 2y yield (7, CHF monthly, NZD often missing) | **(a)**. The 2y is used for the path proxy (F5), where its information belongs. |
| D3 | Policy rung | (a) 6 m; (b) 12 m; (c) an average of 3/6/12 m | **(a)**, matching V1's preferred horizon and the 20-bd question. 3 m and 12 m are shown as context. |
| D4 | V2 visible to the desk | (a) owner-only panel; (b) also the desk login | **(a)** until promotion (G2). |

## 11. Build order (after the owner signs off this spec)

1. `js/biasEngineV2.js` (pure: snapshot → 12 variants), the A and E tests, and the constant table.
2. The snapshot gather and the issue job in `server.js` (new code only), KV keys, registries, service flag
   `biasEngineV2`.
3. The risk gate G-F4 script and its result, before F4 is switched on.
4. The scoreboard: `<D>_engine_v2.json`, target d20, B0 d20 baselines, prereg amendment A7 with the power simulation.
5. The routes and the owner-only panel.
6. The historical screens S2 and S5 (register rows, preregs, laptop runs).
7. Burn-in (§6.3), then the forward clock starts.

Also: a register row `EXPLORATORY` for the audit, as the research protocol requires (the audit could not write it).
