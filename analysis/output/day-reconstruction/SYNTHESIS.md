# Forecast levels: what the evidence says, what is missing, and why colleagues may see an edge

**Date:** 2026-10-30. **Scope:** the existing production volatility forecast ladder (Fixed Open High/Low, Projected
High/Low; p50/p75/p90) on GOLD, NQ and EURUSD, plus the repo's earlier work on other line constructions.
**Sources:** day-reconstruction M1–M7 (`analysis/output/day-reconstruction/`), the Evidence Book (`js/deskEvidence.js`),
the research register, and the prior-art files cited inline. Every number below is quoted from the file named.
The lockbox (sessions after 2026-08-21) was not accessed.

## 1. Bottom line

1. **Descriptive evidence: yes, plenty, and it is solid.**
   - The ladder is a well-calibrated **distance ruler**. p90 is exceeded on about 10% of days (M6, 9 of 9 events within
     7–13%). Next-rung reach is about 45–50% from p50 and 37–43% from p75, with a predictable clock profile (M3, M6).
   - After a touch, price follows a stable path mix: about 45% next rung first, about 33% previous reference first, and
     20–25% neither by 22:00 (M7).
   - Whichever way it resolves, the first 0.15σ after a touch is noise (M7).
2. **Forecast-specific predictive information: none found, with tight bounds.** On fixed levels, forecast lines behave
   like lines the same distance away:
   - reach: differences beyond ±1.3–2.2pp excluded (M6);
   - path mix: beyond ±3.2pp excluded at p50 (M7);
   - reference-race EV: forecast-minus-placebo above +0.04R at p50 excluded (M7);
   - approach and timing: none (M5, M6).

   Projected-level cells are less certain: up to about 3–10pp, depending on rung, is not excluded.
3. **A trading system with positive net expectancy: none found.** Every costed execution test of fade, continuation,
   break, retest, exhaustion and asymmetric-target entries at these or closely related lines lost after spread (§3,
   row 12).
4. **The pre-registered direction programme on the production ladder has closed** under its own hard stop (R7, after M7).
   That is not proof that no effect can exist (§5).

**Decision (§7): No supported progression.** No finding meets the existing criteria for validation, and no defined effect
currently justifies building towards a system backtest. One cheap audit (§6) and one information request to the
colleagues (§6.3) are worth doing before anything else is designed.

## 2. What M1–M7 established

| Milestone | Question | Verdict | Key result |
|---|---|---|---|
| M1 | Can history be rebuilt exactly? | validated | GOLD/EURUSD match production; NQ production σ is Yahoo-based, about 2% wider |
| M2 | Archive of days and first touches | built | about 11.5k first touches per instrument; point-in-time parameters |
| M3 | What happens after a touch, vs phantom lines? | no edge | 1 of 378 cells survives BH, and it flips sign in 2016–20; race to ±0.5σ about 40/40 |
| M4 | NQ continuation, costed | null | net −0.050R [−0.091, −0.011], equal to phantom (−0.052) and random (−0.046) |
| M5 | Does the approach path matter at forecast lines? | underpowered | 0 of 12 forecast-specific; the market-wide effect is how much, not which way |
| M6 | Reach calibration, p90 boundary, timing | null / underpowered / context | 0 of 6 forecast-specific; p90 9 of 9 at 10%; reach bias within ±1.5pp |
| M7 | Path mix and reference-race EV, vs placebo | null; **hard stop** | T1 0 of 78, T2 0 of 220 triggered (0 BH-significant); all-touches EV within ±0.07R of zero |

## 3. Gap matrix

**Construction key:**
- **PROD:** the production ladder with point-in-time parameters (M1–M7).
- **V3X:** v3 export lines through `voteAtlasV4Lines.js`. Same families and formula (M1 reproduces production exactly for
  GOLD/EURUSD), but not always point-in-time parameters.
- **Other:** COG constant × σ, Level Atlas, CHOSEN IV lines, HAR, Live Range, Asia range.

| # | Question | PROD | Other constructions | Status |
|---|---|---|---|---|
| 1 | Does the touch itself carry directional information? | M3, M7: no, equal to placebo | level-touch audit null (396,538 touches, the Sharpe 5.36 came from survivorship); LINE-REACTION P(reject) 0.484, line − neighbours −0.001; Path Map 0 of 314; Live Range ±1pp | **Answered: no** |
| 2 | Does a post-touch **reaction** (rejection / back inside / reclaim / acceptance / retest) add information? | **Not tested.** M7 conditions only on the touch bar; the H1-close-beyond rule is descriptive only (VALIDATION V7) | V3X: THREE_FADE (back inside > 0.1σ after 15 min; 0 of 6 survive BH); REACTION_TRADES A fails; SEQUENCE retests no edge. CHOSEN: TRENDDAY_RETEST acceptance-retest +0.024R vs +0.119R at the break; LINE-REACTION Q2 candle shape adds nothing (log-loss ratio 1.000). Asia sweep-and-reclaim: net −0.17 to −0.21R | **Partial: never on PROD with a placebo; mostly negative on near-identical V3X lines** |
| 3 | Approach speed / path into the level | M5 underpowered (0 of 12); M6 approach skill inconclusive (5 of 6) | APPROACH book fail; approach-speed effect equal at random prices; wide scan gross +0.19R, net fail | **Answered for forecast-specificity; market-wide only** |
| 4 | Continuation vs fade vs recovery | M7: all equal to placebo; EV fair | Fade/Continue Book 9 of 1,446 BH rows (drift); Touch book no edge; cog-setups fade −0.066R | **Answered: no** |
| 5 | Session timing / time remaining | M6 Part C equal to placebo; M7 time-window cells 0 BH | exhaustion-schedule "a clock effect"; live-range-clock null | **Answered: timing changes how much, not which way** |
| 6 | Volatility regime / range consumed | M6: range used < 1% skill (fixed); M7 range-used terciles 0 BH | BREAK_IVRV pass (+0.118R) then failed out of sample (rule-a-pre2020 −0.040R); IV-regime fades null | **Answered on PROD; one IV idea failed out of sample** |
| 7 | VWAP and travel between levels | Rung-to-rung travel measured (M3, M6, M7). **VWAP at a PROD touch never tested** | VWAP reversion null (0 of 26); vwap-extension 3–8× under cost; Level P2: VWAP identity adds no reach | **Partial: VWAP × PROD untested; VWAP alone null** |
| 8 | Fixed vs projected levels | kept separate throughout; projected touched later, more unresolved; same placebo verdict | — | **Answered; projected cells underpowered** |
| 9 | Different constructions | — | Level P2: identity adds no reach across 13 families; shifted-line controls about 0; CONFLUENCE 0 of 32 | **Answered: construction doesn't create an edge** |
| 10 | MAE / MFE | M7: winners' median adverse excursion 0.12–0.15σ, losers' favourable 0.13–0.15σ; M6 p90 overshoot | LINE_CLUSTER_MFE symmetric; EURUSD Touch pullback 0.15σ vs overshoot 0.14σ | **Answered: symmetric noise band of about 0.15σ** |
| 11 | Conditional distributions | M6, M7 (≈ 150 condition cells, 0 BH) | Range Book reach skill real (Brier skill +0.188) but no direction | **Answered: conditions change size, not direction** |
| 12 | Execution and costs | M4 (NQ stop entries) | line-touch-limit-unseen (market −0.377R, limit −0.461R; "the passive side pays"); futures rescore 12 of 12 fail; ASYMMETRIC 0 of 36 ("right about 1 time in 20" at 13–20:1, a fair bet before spread) | **Answered for every entry type tried** |
| 13 | The colleagues' actual rules | — | C.OG's published guidance (below) and recorded trades; cog-setups replication: nothing passes (median fade −0.066R; retest −0.201R); Jordan mechanisations all null; his 8 known trades never replicated | **Unanswered: their full rules and trade list are unknown** |
| 14 | Unreconciled internal contradiction | — | `MD files/CONDITIONAL_FADE_DESIGN.md`: "G1 PASSED — the forecast median beats a same-distance jittered placebo by +15.4pp reversal" (older recalibrated bands). Every later placebo design (M3, M7, level-touch, LINE-REACTION, Path Map) finds about 0 | **Open: the only positive forecast-specific claim in the repo** |

## 4. Why might colleagues see an edge? (hypotheses A–E against the evidence)

**What C.OG says the levels are for** (`education/bank-verbatim/Reading-The-Daily-Vol-Range-Forecast/PAGE_TEXT.md`,
verbatim):
- "Neither is a trade signal on its own; both are *information* about how the day is unfolding relative to its
  expectation."
- "When price reaches the projected low (or high) and rotates, the message is mechanical: the day has used its
  budget… This is most useful as a **caution flag for chasing**."
- "Anchor stops and targets to the **forecasted range**."

His own framing is use as **context and trade geometry**, not as a standalone directional signal. Our evidence agrees
with that framing.

| Hypothesis | Existing evidence | Assessment |
|---|---|---|
| **A. A reaction after the touch carries the information** | Never tested on PROD with a placebo (gap 2). On V3X lines, built by the same formula, rejection fades, back-inside cuts, retests and acceptance-retests all failed; LINE-REACTION found candle shape adds nothing | Plausible as the gap colleagues "see", since "reaches and **rotates**" is a post-touch event. Prior odds are low given the V3X results, but it is the **only mechanism-level question not yet asked on PROD against placebo** |
| **B. Conditional behaviour** (approach, regime, time, range used, distance) | Tested extensively on PROD (M5–M7: ≈ 160 condition cells, 0 BH-significant) and elsewhere | **Answered.** Conditions move magnitudes and reach, not direction, and not more at forecast lines than at placebo lines |
| **C. Levels as trade location** (stops, targets, invalidation, not direction) | M7 gives the geometry: after a touch the next rung is ~0.45σ ahead and the previous reference ~0.5–1.1σ behind; noise band 0.15σ; races fairly priced | **Real and useful, but it is not an edge.** It improves risk placement (stops outside 0.15σ, targets within reach). Positive expectancy still needs a directional or timing advantage, which no test found |
| **D. A different level construction** | Colleagues may use C.OG's constant × σ lines, the TradingView export, or the chart's Projected H/L (which uses the current bar's extreme, a lookahead the research version removes; VALIDATION). NQ production σ differs from research by ~2%. Level P2: identity adds no reach information across 13 families | **Unlikely to explain an edge**: no construction tested shows forecast-specific behaviour, and differences of ~2% move lines by hundredths of σ. A chart's Projected H/L drawn with the live bar's extreme can, however, *look* better in hindsight than it trades |
| **E. Selection and testing effects** | ASYMMETRIC: posted 13–20:1 winners are "what a fair bet looks like"; the level-touch Sharpe 5.36 came from survivorship; Jordan's mechanised methods null; tight-stop races: winners and losers alike in the first 0.15σ (M7); one extra spread erases BREAK_IVRV | **The most strongly supported explanation**: discretionary selection of good-looking setups, small samples, high reward-to-risk payoffs that are fair bets, and hindsight on moving projected lines. Not an accusation; a known property of evaluating a fair game by its winners |

## 5. What the evidence does not establish

- That no forecast-specific effect exists. Projected-level cells remain underpowered (bounds up to about ±10pp at p75),
  and fixed p75 condition cells have EV intervals up to about +0.12R.
- Anything about **post-touch events** on the production ladder (gap 2), or VWAP at a production-level touch (gap 7).
- Anything about the colleagues' actual rules (gap 13): we have not seen their trade list.
- Untouched validation: every milestone used years that earlier milestones had seen descriptively.
- Execution on futures with real fills, beyond the NQ stop-entry test (M4) and the futures rescore.

## 6. The missing hypotheses, prioritised

Only three questions are genuinely unanswered and could plausibly explain the gap. Everything else in §3 is answered and
must not be re-run under a new name. The production-ladder direction programme is closed by R7, so each item below would
be a **separate, newly registered question needing owner approval**, not M8 or a variant of M7.

### 6.1 FIRST: reconcile G1 (+15.4pp) with the later placebo nulls (audit, not a new edge hunt)

| Field | Content |
|---|---|
| 1 Hypothesis | The +15.4pp "reversal vs jittered placebo" in CONDITIONAL_FADE_DESIGN is a measurement artefact, not forecast-specific information |
| 2 Mechanism | Three known biases could produce it: (i) a jittered placebo at random distances has a different, curved reach probability (M3 showed averaging nearby lines biases by 1–3pp; random jitter can bias more); (ii) reversal measured from the line, not from the touch-bar close, lets touch-bar overshoot inflate it (the Path Map lesson); (iii) recalibrated bands not point-in-time |
| 3 What is known | It is the **only** positive forecast-specific result in the repo. Every later design with distance-matched placebos and touch-bar-close measurement finds about 0 |
| 4 Missing | Which of (i)–(iii), if any, explains it |
| 5 Data | The original study's code and data (git history) plus the M2 archive; no new data |
| 6 Baseline | Rerun the original definition, then swap one element at a time to the M3/M7 convention (B2 placebo; touch-bar-close reference; point-in-time bands) |
| 7 Lookahead / selection | The original definition is reproduced exactly first; the swaps are fixed in advance and applied one at a time |
| 8 Statistics | Paired date bootstrap; descriptive decomposition, no new hypothesis family |
| 9 Supports | G1 reproduces and **survives** all three corrections: then there is a forecast-specific reversal effect our M-series missed, and a confirmatory prereg follows |
| 10 Rules out / inconclusive | G1 vanishes under one correction: the contradiction is closed and the reason is documented. It doesn't reproduce at all: recorded as irreproducible |

**Why first:** it costs days, not weeks; it uses existing code and data; it resolves the single piece of internal
evidence that points the other way; and it directly tests hypothesis E (how a convincing-looking edge can arise from a
reasonable-looking comparison). If G1 survives, it becomes the lead; if not, every positive signal in the repo is
accounted for.

### 6.2 SECOND (only if 6.1 or 6.3 points there): a post-touch reaction event on the production ladder vs placebo

| Field | Content |
|---|---|
| 1 Hypothesis | Conditioning on a defined post-touch **rotation** (the first H1 close back inside the level after the touch, the chart's own rule) changes the race to the previous reference vs the next rung at forecast lines by more than at phantom lines |
| 2 Mechanism | C.OG's "reaches and **rotates**": the information, if any, would be in the reaction, not the touch |
| 3 Known | On V3X lines (same formula) 15-minute rejection fades and back-inside rules failed; LINE-REACTION found candle shape adds nothing; no PROD test with a placebo |
| 4 Missing | Forecast-vs-placebo difference after the event on PROD, and its distance-adjusted EV |
| 5 Data / size | The M2 archive (the `h1_close_min` and `return_min` fields already exist); about 1,500 fixed p50 touches per instrument, of which the rotation subset is a fraction (to be counted from features before outcomes) |
| 6 Baseline | The same event at B2 phantom ladders; distance-adjusted break-even |
| 7 Lookahead / selection | Event time = the confirming H1 bar; entry reference = that bar's close; projected levels frozen at the touch; one event definition, fixed in advance |
| 8 Statistics | A small family (3 instruments × 2 families × 2 rungs = 12 cells per race), BH q < 0.10, the M7 materiality thresholds (5pp; ΔEV ≥ 0.05R; hurdle) |
| 9 Supports | BH-significant forecast-specific ΔEV ≥ 0.05R, period-stable |
| 10 Rules out / inconclusive | Intervals inside the thresholds rule it out; otherwise underpowered |

### 6.3 IN PARALLEL: obtain the colleagues' actual rules and trade list

We cannot reconstruct an unknown strategy, and we won't pretend to. The minimum information needed:
1. **Line source:** which lines exactly (C.OG's export, TradingView indicator, our chart), and which rungs.
2. **Instruments, timeframe and session window** traded.
3. **The entry trigger**, stated mechanically (touch, close beyond or back inside on which timeframe, retest, other
   confirmation).
4. **Stop and target rules**, and any management (moves to break-even, partials).
5. **A complete, unselected trade list:** every trade taken over a period, with timestamps, entry, stop, exit and size;
   ideally 50 or more trades.

With items 1–4, the rule can be replicated on the M2 archive with the M7 placebo machinery. With item 5, their realised
results can be checked against what the rule produces on the same days, which separates rule from selection.

**Not recommended:** re-testing approach, regime, time, range used, VWAP alone, confluence or construction swaps (all
answered, §3); chasing the M7 NQ fixed p75 failed-reversal pattern (+3.2pp, not BH-significant; R7 forbids result-led
variants); designing a system backtest.

## 7. Decision

**No supported progression.** The tested hypotheses have not met the evidence standard, and the programme closes as
specified.

- **Evidence:**
  - M3–M7 found no forecast-specific behaviour across reach, timing, approach, path mix or reference-race EV, with
    0 BH-significant cells in M5, M6 and M7 and tight bounds on fixed levels;
  - every costed execution test at these or closely related lines lost after spread;
  - M8 was not triggered, so no validation is warranted under the frozen rules.
- **What it does support:** the ladder as a calibrated description of how far the day travels and how long that takes,
  which is useful for sizing, stop placement outside the ~0.15σ post-touch noise band, and target realism. That matches
  C.OG's own description of the lines as information, not signals.
- **What could change the position:** G1 surviving the §6.1 audit, or the colleagues' trade list revealing a mechanical
  rule that differs from everything in §3. Either would justify a properly registered confirmatory test (§6.2 shape),
  still several steps short of a system backtest.
