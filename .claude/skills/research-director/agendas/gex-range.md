# Agenda: GEX range (dealer gamma → how far price travels)

Set 2026-11-03 by research-director. Theme keywords for `evidence_map.mjs`: `gex gamma "zero gamma" quikstrike cboe
dealer`. Hand chosen cards to `research-protocol` to claim.

## Evidence map (honest numbers, after controls)

- **Validated, but half of it is not gamma.** ES `gex-range-es`: vol-matched ΔDR +0.377 [+0.237, +0.516], 770 NY-close
  sessions 2020-11 → 2026-08-20. NQ `gex-range` re-run: +0.288 [+0.176, +0.400], banked UNDERPOWERED only because a
  single-shift placebo was mis-specified (real value above all 130 label shifts). **Short gamma follows falls**
  (ES short days −2.7% trailing 20d vs +2.7%). With trailing return and 60d drawdown controlled, the gamma part is
  **ES +0.147 [+0.006, +0.289], t 2.05; NQ +0.165 [+0.067, +0.263], t 3.31** (post-hoc, research-only).
  The useful side is "long gamma is quiet" (long DR 0.89-0.93, short 1.08-1.14).
- **ES and NQ are not two votes:** same sign on 82.5% of dates (147 both short, 52 ES-only, 83 NQ-only).
- **Survives:** event-day exclusion (NQ non-event +0.306 vs event +0.306, `eventday_and_g3.json`), vol strata (NQ gap
  in all five), top-1% trim, every year with ≥ 10 short days.
- **Adds nothing to what ships:** `one-range-forecast` Q2, NQ sign on top of the chosen lines 1.0019 [0.9972, 1.0075].
  ES/SPX500 has not been tried. `gamma-real-iv`: for FX, the IV surface already prices it.
- **Null / dead:** FX (`GEX_FX_CROSSMATCH`, pooled +0.038 [−0.015, +0.090]; `hedge-flow` FX ±0.014), every trade rule
  (`gamma-regime-trades` −0.03 R, `-fx` −0.081 R), walls/flips as magnets, max pain, flip *crossings* (RESEARCH_BOOK
  Part 6, |ret| null at 1/3/5d), direction from G2 (do-not-reopen).
- **Underpowered:** `zero-gamma-distance` (+0.023, s.e. ~0.06; long gamma within 0.5σ of the switch ranges like
  Brownian, but n = 21), `hedge-flow-side`, `opex-cycle-range` (+0.055 [−0.014, +0.124]). `hedge-flow` NQ all-book size
  +0.083 [+0.033, +0.131] is real, but strike-shifted books give the same. It is the size of the book, not the strikes.
- **Descriptive lead never tested:** variance ratios. Short gamma VR(5) 0.68 vs long 0.89 ("pushes the day out, then
  gives it back").
- **Data.** In repo: NY-close D1 for NQ/ES and near/all books (`oi_research_book/data/gex_range_es/nyc/`), so the
  history cards run in a cloud session. CME book = monthly/quarterly only (~5% of Nasdaq dealer gamma). Forward:
  QuikStrike weeklies since ~2026-08 (testable ~autumn 2027), Cboe index + ETF full chains since 2026-10-19 (~mid-2028),
  and `hedging-state-forward` (judge ~2027-10). After 2026-08-20 there is no OI history and the prices are lockbox H-A.
- **Mechanism.** Dealers long gamma sell rallies and buy dips, which damps the path. Short gamma does the reverse. The
  open puzzle is why it is ~8× bigger on index futures than FX. Candidates: 0DTE/ETF gamma dwarfing volume, or the
  confound that short gamma is where the market has already fallen.

## Questions, ranked

### Q1. Split-book mirror: NQ against ES on the days their books disagree — score 14/15 — **RUN 2026-11-03: NULL** (`gex-split-book`)

> Take the days when NQ's and ES's dealer books disagree, one short gamma and the other long. Build the spread of their
> next-session diffusion ratios. The two markets share the recent fall that drives the leverage effect, but not the
> book. Does the spread lean toward whichever book is short, and by more than the shifted-label noise? Compare it with
> the agreement days as the control, and with the mirror case where the other book is short.

| | |
|---|---|
| Construct | S = DR_NQ − DR_ES per session (each DR vs its own same-vol random walk, rv20 from NY-close bars); gamma sign from `net_gex_sum`, near surface, OI(D) → session D+2 (knowable at the open of D+2) |
| Condition | three states: NQ-only short (83), ES-only short (52), agreement (637); also within the disagreement days, the NQ−ES trailing-return gap at its own extremes (a tech-only fall) |
| Horizons | session D+2 primary; cumulative D+2…D+6 as the family |
| Noise threshold | all-shift label placebo (every shift 60…n−60, step 5) applied to the state labels; the real value's percentile is the gate (the `gex-range` lesson) |
| Outcome distribution | full distribution of S by state (median, p10/p90), not only the mean; ΔS = S(NQ-short) − S(ES-short) |
| Benchmark / control / mirror | agreement days (S should sit near its mean); mirror = ES-only short should push S negative by a similar amount; control regression adds the NQ−ES 20d return and drawdown gap |
| Mechanism | each dealer book hedges its own future. A fall common to both markets cannot produce a spread, but a book that differs can |
| Builds on | `gex-range-es` (+0.377, of which +0.147 gamma-specific), `gex-range` (+0.288, +0.165), the posthoc overlap counts |
| Data & power | in repo now, 135 disagreement days. NQ and ES DR are highly correlated, so S has a small s.d. (est. ~0.2). s.e. of ΔS ≈ 0.04, so the MDE ≈ 0.11 against an expected ~0.3 if each book carries +0.15 of its own |
| If yes → | the gamma-specific part is confirmed by a control the leverage confound cannot reach. That is the route to restoring `gex-range` and keeping the G2 range gate gamma-based |
| If no → | the G2 "range" effect is the leverage effect wearing a gamma label. Rewrite G2 and the OI page as "recent falls widen ranges" and stop the gamma range studies on the CME book |
| Falsifier | ΔS inside the placebo band, or the sign follows the trailing-return gap rather than the book |

Scores: value 2 · answerable 3 · mechanism 3 · novelty 3 · cost 3.

### Q2. Incremental value: does the controlled gamma part survive inside the shipped range lines? — score 12/15

> Take the residual of the session's range against the chosen line (log HL ÷ chosen p50). Condition it on gamma sign,
> and on where net gamma sits in its own trailing 6-12 months. After the lines, which already carry persistence and IV,
> is anything left above the shifted-label noise, on ES/SPX500 as well as NQ? Read pinball against the shipped lines.

| | |
|---|---|
| Construct | r = log(HL ÷ chosen p50) per London session; gamma sign and net-GEX percentile in a trailing window (window swept), OI ≤ D−2 as in `one-range-forecast` |
| Condition | sign; percentile buckets inside each sign; long gamma with the market near its highs (the clean "quiet" cell) |
| Horizons | the daily line; weekly rung as a secondary |
| Noise threshold | all-shift label placebo on r; pinball ratio interval |
| Outcome distribution | r distribution by state; HL p75 exceedance by state (calibration), then the pinball ratio |
| Benchmark / control / mirror | benchmark = SI chosen lines (pinball 1.000); control = the same arm with trailing return and drawdown flags instead of gamma (does gamma beat the confound it rides on?) |
| Mechanism | as Q1; the question is whether IV already prices dealer positioning (it did for FX) |
| Builds on | `one-range-forecast` Q2 (NQ 1.0019 [0.9972, 1.0075]), `gex-range-es` next-question line, `gamma-real-iv` |
| Data & power | laptop (Step 0 table, `scripts/forecast_history/one_forecast.py`). About 1,000 rows per instrument; the NQ interval was ±0.5%, so only a gain of ~1% or more is visible |
| If yes → | gamma becomes a multiplier on SPX500/NQ lines (a live line), behind a forward check |
| If no → | the gamma chip in Global Read is labelled "already in the lines", and the range-forecast use of CME gamma closes. Any further G2 work is research only |
| Falsifier | interval spans 1 on both instruments, or the return/drawdown arm does as well as gamma |

Scores: value 3 · answerable 2 · mechanism 3 · novelty 2 · cost 2.

### Q3. Horizon family: push out, then give back? — score 11/15

> Starting from the gamma state on a given day, measure diffusion over a family of horizons from one session to two
> weeks: cumulative range against a same-vol random walk, and net displacement as a share of that range. Where does the
> short-minus-long gap live, and where does it fall back into the shifted-label noise? Does short gamma give back its
> push-out while long gamma drifts more cleanly?

| | |
|---|---|
| Construct | for k sessions after D+2: DR_k = realised k-session high-low ÷ Brownian expectation for k sessions; efficiency E_k = abs(net move) ÷ range; VR(k) |
| Condition | gamma sign at D (and whether the state held through the window, reported separately) |
| Horizons | k = 1, 2, 3, 5, 10 sessions |
| Noise threshold | per-horizon all-shift placebo; non-overlapping windows or block bootstrap for the overlap |
| Outcome distribution | ΔDR_k and ΔE_k curves across k with bands; distribution of E_k by state |
| Benchmark / control / mirror | random walk at the same σ; control = trailing return/drawdown; mirror = long gamma (should be flat or damped at every k) |
| Mechanism | short-gamma hedging amplifies intraday and reverses as hedges unwind; long gamma damps the path, which then trends more cleanly |
| Builds on | `gex-range` VR table (short VR(5) 0.68 vs long 0.89, descriptive, UTC-era pipeline), RESEARCH_BOOK Part 6 crossings null |
| Data & power | in repo now, NQ + ES 770 sessions. Power falls with k (about 77 independent 10-session windows), so it is powered for a large effect at k ≥ 5 only |
| If yes → | decides whether gamma belongs on weekly rungs or only the daily line, and whether "range, not direction" holds over a week |
| If no → | remove the "pushes out then gives back" sentence from the OI pages; the effect is a one-session fact |
| Falsifier | the gap dies at k = 2 and E_k does not differ by state |

Scores: value 2 · answerable 2 · mechanism 2 · novelty 2 · cost 3.

### Q4. Dose, not switch: does the gap scale with how big the book is against its own history? — score 11/15

> Build net dealer gamma per 1% move, taken where it sits in its own trailing year rather than as a sign. Within each
> sign, sweep the percentile. Does next-session diffusion scale with the size of the book, and from which percentile
> does it rise above shifted-label noise? Use total open interest, carrying no gamma, as the control that should not
> scale.

| | |
|---|---|
| Construct | G = net GEX ($ per 1%) on the near and all books; P = percentile of G in a trailing 6-12 month window (window swept); knowable D+2 |
| Condition | P buckets within long and within short; P extremes |
| Horizons | session D+2; D+2…D+6 |
| Noise threshold | all-shift placebo per bucket; the bucket where the curve leaves the placebo band is the threshold |
| Outcome distribution | DR by bucket (dose-response curve with bands), vol-matched and return-controlled |
| Benchmark / control / mirror | control = total-OI percentile (book size without the gamma sign); mirror = short-side percentiles should rise as long-side ones fall |
| Mechanism | the forced hedge scales with the book; a binary sign throws that away |
| Builds on | `hedge-flow` NQ all-book size × sign +0.083 [+0.033, +0.131] (strike-shift equal: size, not strikes), `gamma-real-iv` (continuous GEX in HAR+IV, 0 of 7 DM-significant) |
| Data & power | in repo now. Splitting 770 into buckets per sign leaves ~40-100 per cell, so it is powered for a monotone trend test, not per-cell claims |
| If yes → | G2 moves from a switch to a graded input for Q2's arm; a sizing scale instead of half or full |
| If no → | the sign is all there is; stop building size-based OI cards (05e stays context) |
| Falsifier | flat curve, or total OI scales just as well |

Scores: value 2 · answerable 2 · mechanism 2 · novelty 2 · cost 3.

### Q5. Fresh flips: is new short gamma different from short gamma that has lasted? — score 10/15

> Build the age of the gamma state (sessions since the book last changed sign) and the speed of the change in net
> gamma against its own distribution. When the book has just flipped short, or is moving fastest, what happens to
> diffusion over the next few sessions, compared with short gamma that has lasted long enough for σ and IV to catch up?
> Find the age beyond which the two look the same.

| | |
|---|---|
| Construct | age A = sessions since the sign of `net_gex_sum` last changed; dG/dt = k-session change in G as a percentile of its own history; knowable D+2 |
| Condition | A buckets (fresh vs established) by sign; dG/dt at its extremes |
| Horizons | D+2 … D+6 |
| Noise threshold | all-shift placebo on the age labels; also the same construct on randomly placed pseudo-flips |
| Outcome distribution | DR by age (a decay curve), with bands |
| Benchmark / control / mirror | established states of the same sign; mirror = fresh flips into long gamma (should be quiet at once); control = trailing return (a fresh flip often is a fall) |
| Mechanism | trailing σ and IV lag a new hedging regime; once they catch up, the vol-matched gap should shrink |
| Builds on | RESEARCH_BOOK Part 6 (spot crossing the flip level, null; a different construct), `gex-range` |
| Data & power | in repo now. The number of flips is unknown (count first). Probably a few dozen spells, so it is powered for a large effect only |
| If yes → | a "fresh short gamma" flag as the next study on the forward captures |
| If no → | nothing changes beyond the page wording |
| Falsifier | no decay with age, or pseudo-flips score as well |

Scores: value 1 · answerable 2 · mechanism 2 · novelty 2 · cost 3.

## Result of Q1 and what it changes (2026-11-03)

`gex-split-book` came back **NULL**: β +0.027 [−0.024, +0.078], t 1.0, placebo 85th percentile, and the NQ-side mirror
had the wrong sign (`oi_research_book/GEX_SPLIT_BOOK_RESULTS.md`). Post-hoc: disagreement days are **weak-book days**
(both books near zero), and on them both markets widen together. So the per-instrument effect reads as a common move
that the gamma sign correlates with. Per the prereg, **Q2–Q5 on the CME book are closed.** The live question becomes
whether a *strongly* short book does anything, which the CME book can't answer.

**Follow-up questions this raises (not yet scored):**

> **Q1b (forward, Cboe book).** On the full index + ETF book, take days the two books are strong and opposite: each
> beyond its own median strength, opposite signs. Build the same NQ−ES range spread. Does it lean toward the short book
> by more than the shifted-label noise? Compare it with weak-disagreement days as the control. Unpark at ~100
> strong-opposite days of the Cboe capture (count them monthly).

> **Q1c — RUN 2026-11-03: UNDERPOWERED, implied vol absorbs 64% (ES) / 73% (NQ)** (`gex-range-iv`). Remainder
> ES +0.054, NQ +0.044, inside the noise. Short-gamma days already carry ~17-18% higher implied-over-realised vol within
> every trailing-vol bucket. Original statement:
>
> **Q1c (what the common driver is).** On the days both books flip short together, decompose the range widening into
> what trailing σ, VIX/VXN level and recent drawdown already price, and what is left. Is any of the "short gamma"
> widening left once implied vol is in the baseline? Uses data in the repo; it is the IV leg the earlier controls never
> had.

## Parked

- **Restore `gex-range` on unseen data** (all-shift placebo gate, return-controlled headline). Unpark after the lockbox
  evaluation (`forge/LOCKBOX_PROTOCOL.md`, ~late Nov 2026) has run and a Databento OI pull past 2026-08-20 has been
  quoted. Honest power: to show +0.15 at t ≥ 3 needs ~1,500 unseen sessions, so fresh data can confirm the sign but not
  the size for years. Q1 is the faster route.
- **What is different about index futures vs FX:** dealer gamma against normal traded volume, using the full index +
  ETF book. Unpark at ~400 Cboe sessions (~mid-2028). `hedging-state-forward` (judge ~2027-10) is the first look.
- **Near the switch point** (long gamma within 0.5σ of zero gamma ranges like Brownian, n = 21). Unpark with
  ~400 days of the QuikStrike per-expiry capture (~autumn 2027), as a new prereg.
- **Which side the range extends** (`hedge-flow-side`). Unpark with per-expiry books, the ES and gold surfaces built,
  and more NQ one-sided days.
- **Expiring gamma** (share of near-book gamma expiring within the week, then the post-expiry release). Coordinate
  with `expiry-tracker` (in flight on branch `ccr-b1afba0f-vtpty4`) and `opex-cycle-range` before carding.
- **CME-inverted FX pairs** (USD_CAD significant in both sign conventions). This is not a question until the call/put
  convention is settled; it is a data fix.
- **Closed, not parked:** FX gamma range, gamma trade rules, walls/flips as magnets, any direction from G2.

## Owner calls

