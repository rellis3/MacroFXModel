# meta-labelling — results

Prereg: `forge/META_LABELLING_PREREG.md`. Seed 20261115. Run 2026-11-15. Data to 2026-08-21 (lockbox); nothing later read.

## Verdict: **UNDERPOWERED** (ledger id `meta-labelling`)

| Cell | Statistic | Estimate [95% CI, 21-day blocks] | Bar | Random same-fraction placebo mean / 97.5th pct / real pct | Halves H1 / H2 | Mirror (stood-aside days) | SE used | Holm p | Binding MDE | Pack 1× plant | Word |
|---|---|---|---|---|---|---|---|---|---|---|---|
| dR_meta_all | R̄(acted) − R̄(all) | +0.0029 [-0.0105, +0.0162] | 0.05 | +0.0071 / +0.0159 / 20 | -0.0161 / +0.0214 | -0.0031 [-0.0169, +0.0116] | 0.0069 | 1.000 | 0.034 | 1.0 | **NULL** |
| dhit_meta_all | hit(acted) − hit(all) | +0.0081 [+0.0009, +0.0151] | 0.03 | +0.0036 / +0.0090 / 94 | -0.0012 / +0.0171 | -0.0086 [-0.0162, -0.0010] | 0.0037 | 0.085 | 0.020 | 1.0 | **NULL** |
| dSR_meta_all | Sharpe(meta book) − Sharpe(act-all) | +0.1772 [-0.3360, +0.6841] | 0.3 | +0.3246 / +0.6587 / 21 | -0.2569 / +0.7091 | +0.0178 [-0.4834, +0.5039] | 0.2664 | 1.000 | 0.890 | 0.0 | **UNDERPOWERED** |
| dR_meta_conf | R̄(meta acted) − R̄(strength-only acted) | -0.0176 [-0.0309, -0.0033] | 0.05 | -0.0134 / -0.0046 / 20 | -0.0229 / -0.0016 | -0.0236 [-0.0448, -0.0021] | 0.0072 | 0.058 | 0.040 | 1.0 | **NULL** |

Test rows 24826 on 1952 dates (2019-01 → 2026-08-21); acted on 51.6%. R per day: act-all -0.0060R, meta-acted -0.0031R, strength-only-acted +0.0145R. Hit: all 0.480, acted 0.488. Book Sharpe: act-all -0.31, meta -0.13.

## Power stage (prereg 3.7; real effect removed by a common circular date shift, planted feature through the whole walk-forward)

| γ (R per SD) | detected (z ≥ 2.50) | mean realised C1 | mean realised ΔSharpe |
|---|---|---|---|
| 0.05 | 100% | +0.0336 | +1.328 |
| 0.1 | 100% | +0.0736 | +2.819 |
| 0.15 | 100% | +0.1154 | +4.431 |
| 0.25 | 100% | +0.1952 | +7.380 |
| 0.4 | 100% | +0.3193 | +11.759 |

Simulated MDE (C1): +0.0336R.

## R and hit by decile of the meta probability (a working filter is a rising staircase)

| decile | n | mean p_meta | R̄ | hit |
|---|---|---|---|---|
| D1 | 2483 | 0.423 | +0.0400 | 0.478 |
| D2 | 2483 | 0.441 | -0.0233 | 0.453 |
| D3 | 2482 | 0.449 | -0.0044 | 0.477 |
| D4 | 2483 | 0.455 | -0.0221 | 0.475 |
| D5 | 2482 | 0.462 | -0.0531 | 0.462 |
| D6 | 2483 | 0.468 | -0.0308 | 0.484 |
| D7 | 2482 | 0.475 | -0.0247 | 0.466 |
| D8 | 2483 | 0.484 | +0.0245 | 0.492 |
| D9 | 2482 | 0.496 | -0.0079 | 0.497 |
| D10 | 2483 | 0.517 | +0.0420 | 0.519 |

## Decomposition (BH q = 0.10; candidates only)

| single-feature rule | ΔR vs all [95% CI] | acted | p | BH |
|---|---|---|---|---|
| conf | +0.0202 [+0.0083, +0.0319] | 51% | 0.001 | pass |
| beyond | -0.0066 [-0.0204, +0.0067] | 56% | 0.359 | – |
| atr_pct | -0.0042 [-0.0133, +0.0046] | 60% | 0.368 | – |
| vol_ratio | -0.0002 [-0.0110, +0.0108] | 53% | 0.964 | – |
| ev_today | +0.0053 [-0.0019, +0.0116] | 83% | 0.123 | – |
| gap_side | -0.0121 [-0.0289, +0.0033] | 50% | 0.137 | – |
| gap_abs | -0.0116 [-0.0250, +0.0021] | 48% | 0.092 | – |
| hit20 | +0.0073 [-0.0104, +0.0268] | 36% | 0.430 | – |
| hit5_all | -0.0047 [-0.0189, +0.0117] | 48% | 0.553 | – |
| h4_agree | +0.0048 [-0.0095, +0.0189] | 62% | 0.506 | – |
| mon | +0.0299 [+0.0065, +0.0546] | 20% | 0.013 | pass |
| fri | -0.0147 [-0.0322, +0.0023] | 43% | 0.090 | – |
| C1 in fx | -0.0100 [-0.0278, +0.0074] | 41% | 0.271 | – |
| C1 in gold | -0.0401 [-0.0836, +0.0037] | 43% | 0.068 | – |
| C1 in idx | +0.0027 [-0.0099, +0.0150] | 87% | 0.680 | – |

## Descriptive arms (not scored)

| arm | C1 ΔR | C2 Δhit | C3 ΔSharpe | C4 vs strength | acted |
|---|---|---|---|---|---|
| GBM (depth 2) | +0.0022 | +0.0075 | +0.120 | -0.0183 | 52% |
| rolling 3-year window | -0.0007 | +0.0068 | +0.055 | -0.0210 | 52% |
| primary side = sign(p − b0) | -0.0108 | +0.0033 | -0.236 | -0.0307 | 53% |

Sized arm (size = 2 × training percentile of p_meta, mean 1.02): Sharpe -0.18 vs act-all -0.31; R per unit risk -0.0037.

## Evidence packs

| Cell | Diagnosis | Pack estimate [iid CI] | placebo pct | plants 0.5×/1×/2× | halves | canary | pack |
|---|---|---|---|---|---|---|---|
| dR_meta_all | FLAT: the test could see a useful effect (planted control found), and the interval rules it out | +0.0029 [-0.0113, +0.0175] | 7 | 100%/100%/100% | -0.0154 / +0.0208 | +0.7236 | [pack](evidence/dR_meta_all/EVIDENCE.md) |
| dhit_meta_all | SMALL BUT REAL: above zero, below the useful size | +0.0081 [+0.0006, +0.0162] | 71 | 100%/100%/100% | -0.0010 / +0.0169 | +0.5197 | [pack](evidence/dhit_meta_all/EVIDENCE.md) |
| dSR_meta_all | UNDERPOWERED: the test cannot reliably see an effect of the useful size, so 'no effect' is not shown | +0.1771 [-0.2569, +0.6134] | 9 | 0%/0%/100% | -0.2330 / +0.6883 | +22.8001 | [pack](evidence/dSR_meta_all/EVIDENCE.md) |
| dR_meta_conf | WRONG SIGN: there is an effect, and it is the opposite of the claim | -0.0176 [-0.0334, -0.0028] | 7 | 100%/100%/100% | -0.0237 / -0.0013 | +0.7031 | [pack](evidence/dR_meta_conf/EVIDENCE.md) |

## Why it fails: what the meta-model actually learned (diagnosis)

- **The call loses a little on every kind of day.** Over the test years, acting on every day earns −0.006R per day (hit 48.0%; book Sharpe −0.31). A filter can only help by finding the call's good days. On the key comparison, a random stand-aside of the same fraction (acting on 51.6% of days, chosen within instrument × year), the meta filter sits at the **20th percentile for R per traded day and the 21st for Sharpe**. Picking days at random would have done as well or better.
- **Most of the "+0.18 Sharpe" comes from trading less, not from choosing better.** When act-all loses, any stand-aside pulls the book toward 0. The random same-fraction placebo lifts Sharpe by +0.32 on average; the meta filter manages +0.18. Its Sharpe cell can't resolve 0.30 anyway (binding MDE 0.89; pack 1× plant found 0%), so it is UNDERPOWERED. The placebo still shows the direction: worse than random.
- **The model mostly learned "trade the indices".** The largest and steadiest coefficient is the index dummy, and the model acts on 87% of index days against 41% of FX and 43% of gold days. Index days carry the base-rate long drift (+0.045R per day). Inside each group the model picks no better or worse days: C1 within FX −0.010R [−0.028, +0.007], gold −0.040R [−0.084, +0.004], indices +0.003R [−0.010, +0.015]. So the pooled +0.003R is a mix effect, and within markets the model's acted days are slightly worse than the ones it skipped.
- **No staircase.** R by decile of the meta probability is flat with noise. D1 (+0.040R) and D10 (+0.042R) both beat the middle; the hit rate rises from 47.8% to 51.9%. That 4 pp hit-rate tilt is the small C2 effect (+0.8 pp [+0.1, +1.5]). It is below the 3 pp bar, fails Holm (p 0.085), sits at the placebo's 94th percentile and is ≈ 0 in H1. It doesn't carry into R, because the extra hits are small wins.
- **The simple rule beats the model (C4 WRONG SIGN, −0.018R [−0.031, −0.003]).** "Act when the call is strong" (|p − 0.5| above its training median) earns +0.015R per traded day against the meta model's −0.003R. That too is mostly mix: strength is largest where the base rate is far from 0.5, so the rule acts on 99% of index days and 37% of FX days. Inside FX, strong-call days earn −0.008R against −0.029R for weak ones, a small within-FX gain. The model adds 13 noise features to that one, and they cost it (lesson #12: what a model gives up against the simpler baseline).
- **Every feature fails on its own after the call is taken.** Single-feature stand-aside rules, BH q = 0.10 over 15 tests: only `conf` (+0.020R [+0.008, +0.032]; mostly the index mix above) and Monday-only (+0.030R [+0.007, +0.055], acts on 20% of days) pass. Both are **candidates only, never results**. The vol regime (ATR percentile, σ20/σ60), the release flag, the overnight gap, the call's recent hit record, 4h agreement and the cross-market hit record are all within ±0.012R with CIs spanning 0.
- **Same answer from every variant:** GBM +0.002R; rolling 3-year window −0.001R; the call beyond its base rate (side = sign(p − b0)) −0.011R; sized by meta probability, Sharpe −0.18 against −0.31 (less exposure on average, as with the random placebo).
- **The test could see a useful effect.** Power stage: a planted feature giving +0.034R per traded day, run through the whole walk-forward on date-shifted real rows, was detected in 30/30 runs, so the simulated MDE is ≤ +0.034R. This is an upper bound: the smallest γ on the registered grid was already detected 100% of the time. The packs' 1× plants were found 100% of the time for C1, C2 and C4. The canaries work: feeding in the outcome gives +0.72R (C1). In selftest, a one-day leak of `hit20` lifts C1 and the planted act-signal is recovered (+0.176R).

## What this changes

Per prereg §8. Ledger id `meta-labelling` → **UNDERPOWERED** (by the id-word rule, because the Sharpe cell can't resolve its bar). The money cells are **NULL**: R per traded day (C1) is FLAT and its interval [−0.011, +0.016] rules out the +0.05R bar, and the hit-rate cell is below its bar. **The parent should bank it as UNDERPOWERED with the C1/C2/C4 NULL detail and say plainly that the R question is answered.**

- **For the morning card:** no "act / stand aside" tag from a fitted model on the bias-learner call. A meta-model on this call picks days no better than chance, and worse than simply acting when the call is strong. The card's "no view" days stay rule-based (review §3 step 5: thresholds on |z|, cost, and agreement between families). They are scored as rules on the bias-scoreboard, not learned.
- **Meta-labelling the bias-learner call is closed** until the primary itself shows skill. Meta-labelling concentrates a primary's edge; with a FLAT primary there is nothing to concentrate. This agrees with `meta-label-proper` from the other side: there the sample was too small; here the sample is ample (≈ 25,000 calls, ≈ 1,950 dates, MDE ≤ 0.034R) and the primary is the limit.
- **Where the null points next:**
  1. The two BH candidates. Strength-only within FX (strong-call days −0.008R vs −0.029R) and Monday-only are inputs for a future prereg on fresh data or the forward scoreboard, never a result.
  2. Re-run meta-labelling only on a primary with demonstrated conditional skill. Candidates: the forward desk/Max calls once the bias-scoreboard has 300+ called days, or a validated sparse validator (`cot-crowding-p5`, `positioning-into-release-direction`) as the primary, where the meta question becomes "which firings to act on".
  3. If anything, the pattern says: don't pool across markets. The cross-market mix (index drift) dominates any pooled act/stand-aside model. A future version should score within group, or demean R by each market's base-rate drift first.

