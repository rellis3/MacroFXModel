# Daily bias review: a stronger morning direction process for the desk

Owner, 2026-11-15: "review a better, stronger way, from all the points of theory and analysis we have, to understand
direction bias each morning for the desk."

Sources read for this review. Full notes are in the session scratchpad; they hold paid verbatim and are not
committed.
- **A.** C.OG's Education Bank, snippets and inbox; cog/ course notes; Jordan transcripts; the Max, Jay and Craig notes;
  cog-knowledge verdicts.
- **B.** Theory Lab (378 lessons), the podcast reasoning decode (`education/podcast_transcripts/HOW_THEY_THINK.md`),
  the desk design (`plans/DESK_ANALYST_PIPELINE.md`, `js/deskRun.js`, `js/globalReadCore.js`,
  `js/analystScorecard.js`), `education/RESEARCH_METHOD_LESSONS.md`.
- **C.** Every direction entry in `js/deskEvidence.js`, graded with the repo's own `js/evidenceGrade.js`; the forward
  direction ledger; the paper library (shelf).
- **D.** Web: bank FX strategy methods, macro and systematic practice, the academic literature on 1-day to 2-week
  predictability, HMM regime evidence, and forecast combination.
- **E.** This thread's studies and exploratory runs:
  - `max-bias-reverse`, `h4-trend-hold`, `macro-h4-blend` (exploratory);
  - `day-type-expansion`, `post-release-drift-pooled`, `hold-day-one-confirm`, `exit-on-fixed-entries`,
    `bias-learner` (pre-registered, banked 2026-11-15).

## Results of the review tests (2026-11-15)

Every test from §5 and the synthesis plan (merged order 0–8) was pre-registered, run with an evidence pack, and banked
the same day. The full evidence (charts, planted controls, placebos, sample rows) is on
[bias-evidence.html](../bias-evidence.html). Grades are from `js/evidenceGrade.js` (after fix 0). Effects are against
each market's own base rate unless stated.

| # | Test | Ledger id(s) | Verdict · grade | Headline effect [95% CI] | Evidence diagnosis | What it changes for the card |
|---|---|---|---|---|---|---|
| 0 | Evidence grader fix | — (code fix, `analysis/output/evidence-grader-fix/CHANGES.md`) | fixed | 20 of 395 grades changed; strong 23 → 25, against 62 → 70 | It read placebo / side-arm intervals, treated "positive" as the claimed way, and could not parse "% per trade [..]". Now reads the headline interval in the claimed direction. `positioning-into-release-direction` is now Strong | Grades in §2 and below can be weighted |
| 1 | Multi-timeframe structure + HMM, conflict = "no view" | `mtf-structure-ema`, `-swing`, `-hmm`, `-pullback`, `-conflict-ema`, `-conflict-hmm` | all UNDERPOWERED by the family rule · ema / hmm / both conflict Against, swing Untested, pullback Faint | EMA 24h −0.34pp [−1.76, +1.00]; HMM 24h −0.38pp [−1.53, +0.63]; pullback 24h +0.75pp [−1.15, +2.54]; HMM conflict −0.26pp [−1.25, +0.54] (hit rate vs base rate) | 0/18 cells pass Holm, 16/18 negative; every powered cell NULL with the 3pp bar ruled out. Aligned days hit at or below the base rate. Conflict-as-no-view **lowers** kept-day accuracy (5d worse than 99.7% of random abstentions). The HMM's direction is the drift sign; no better than a named σ-chain. Swing alignment too rare (2% of days). Open: gold pullback 3d +9.4pp [+3.1, +15.9], n = 352 | No direction call from "timeframes aligned" or HMM state; never say aligned days are better days |
| 2 | Slow bias clock (1/3/12-month trend + carry) | `slow-bias-clock-dir`, `-r`, `-book` | dir UNDERPOWERED · Against; R NULL · Untested; book UNDERPOWERED · Faint | FX +1 day Brier skill −0.050% [−0.089, −0.012]; vs 4h rule −0.0025R [−0.022, +0.018]; book Sharpe +0.24 [−0.15, +0.63] | FX daily call a powered NULL (0.4% bar ruled out); gold / indices could not be seen. Slow and 4h sides both lose ~0.03R a trade net. The book is uncorrelated with long (0.14) and held up in stress, but 4 of 9 FX pairs lose | Describe the slow trend state; never a daily call. Drop "fast vs slow disagree → half size". At most a small diversifying hold, forward record only |
| 3 | Regime picks the rule (fade / follow / break) | `regime-picks-rule-atr`, `-hmm`, `-chain` | atr NULL, hmm UNDERPOWERED, chain NULL · all Untested | Every refit picked FLAT: 0.000R; always-fade −0.048R [−0.062, −0.034] | Every rule loses net of spread in every regime, so there was nothing for a regime to pick. Planted edges were found (100%) | Regime = how big the day is, not which rule to trade |
| 4 | Positioning and flow inputs | `positioning-flow-book`, `-rr`, `-vrp`, `-monthend` | all UNDERPOWERED (per-input rule) · Untested | FX next day (BSS vs base): book −0.023% [−0.055, +0.004]; RR −0.037% [−0.282, +0.167]; VRP −0.012% [−0.104, +0.077]; month-end −0.190% [−0.960, +0.417] | Every powered FX next-day cell NULL (1.3pp hit gain ruled out); no Holm pass in 28 cells. VRP's out-of-sample tilt flipped sign. Month-end +5 day +1.9% [−1.3, +4.8] is large but unstable (halves +5.3 / −1.5). RR 5-day tilt +0.10% is small but consistent | Retail book, RR, VRP, month-end stay context, never a lean |
| 5 | Pre-release ranging | `pre-release-ranging` (B), `-share` (A), `-asia` (C), `-coil` (D) | B VALIDATED · Leaning; A VALIDATED but mechanical; C NULL; D UNDERPOWERED | B: pre-release morning +0.104σ [0.074, 0.134] narrower (~12%), 6/6 instruments, every year 2017–2026 | B is real: big-US-release mornings are quieter. A (half the range comes after the print) mostly restates that the print adds range. C: Asia high/low still breaks before the print on 93% of days (vs 95%). D: no "coiling" | The one new validated morning fact (below). "Narrower", not "ranging" or "coiled" |
| 6 | Growth × inflation quadrant | `growth-inflation-quadrant-usd`, `-gold`, `-idx` | all UNDERPOWERED · USD / idx Untested, gold Leaning | 4w: USD −0.067σ [−0.202, +0.070]; gold +0.132σ [+0.005, +0.256]; indices +0.018σ [−0.079, +0.114] | 0/21 Holm. A large USD / index tilt is ruled out; USD leans the wrong way. The old REGIME.md index table was revision plus drift. Gold right sign at every horizon, but fails Holm, second-half only, cross-fit negative | Quadrant = backdrop description. No USD / index tilt line. Gold: forward record only |
| 7 | Cross-asset coherence as conviction / size | `coherence-conviction` | UNDERPOWERED · Untested | R coherent minus incoherent +0.0014R [−0.037, +0.040]; hit coherent vs all −0.21pp [−1.5, +1.1] | A 5pp hit lift and a 0.05R lift (coherent vs all days) are ruled out; packs FLAT ×6 | No conviction or size upgrade when rates, FX, equities and vol agree |
| 8 | Meta-labelling the bias-learner call | `meta-labelling` | UNDERPOWERED · Against | R acted minus all +0.0029R [−0.0105, +0.0162]; vs act-when-strong −0.018R [−0.031, −0.003] | The filter picks days no better than a random stand-aside (20th pct) and worse than a plain strength rule; it learned "trade indices". The primary has no skill to filter | No fitted act / stand-aside tag |
| — | Evidence-pack retrofit (diagnostics only) | `day-type-expansion`, `post-release-drift-pooled`, `hold-day-one-confirm`, `exit-on-fixed-entries`, `bias-learner`, `h4-trend-hold` | no banked verdict changed | e.g. bias-learner FX 21:00 BSS +0.045% [−0.020, +0.113] FLAT; exit E1 +0.012R [−0.000, +0.024] FLAT; h4 DAY −0.015R [−0.032, +0.003] FLAT | Planted controls are found, so most nulls are FLAT (a useful effect ruled out), not blind; drift h2 and hold-day-one run are genuinely UNDERPOWERED. h4-trend-hold's "holding overnight is worse" did **not** survive ten years (HOLD +0.010R [−0.028, +0.047], FLAT): it was a short-window result | None beyond what §4 already says; drop "hold is worse" as a reason |

### What the morning card should now say

- **The only validated morning fact:** on a big US release day (NFP, CPI; FOMC up to 19:00) the session before the
  print usually runs about 10–12% narrower than a normal morning, and about half the day's range comes after the
  print. Say "narrower", never "ranging": the Asia high or low still breaks before the release on ~93% of those days.
  Size and timing only.
- **No direction call** from multi-timeframe or HMM structure, the growth × inflation quadrant (USD, indices),
  cross-asset coherence, positioning inputs (retail book, RR, VRP, month-end), a regime-picked rule, or a meta filter.
- **The slow clock** is at most a small diversifying hold beside long exposure, judged on a forward record. It is
  never a daily call.
- **Forward record / candidate only, never a card line:** gold quadrant tilt, gold pullback-in-trend at 3 days,
  the month-end USD flow at +5 days, the risk-reversal tilt at +5 days.
- **"No view" stays rule-based** and is scored on the bias scoreboard. Do not claim that agreed or aligned days are
  more accurate; both tests say they are not.

### Where the nulls point

- **Meta-label a primary with proven skill.** Filtering only helps a call that is already right more often than the
  base rate. First get 300+ called days on the bias scoreboard; then test a filter on that call.
- **Score within group.** Several "edges" were the index drift (indices go up). Score FX, gold and indices separately
  so drift cannot pass for skill.
- **Gold-only preregs on independent data.** Gold leaned the right way three times (quadrant, pullback 3d, HMM
  slices). Test each as one pre-registered cell on data not used here (pre-2009 or forward).
- **Forward records** for everything marked candidate above; no money until a forward record passes.

## 1. Where every source agrees

1. **A 24-hour direction call from public data sits near the base rate.**
   - C.OG teaches it: daily direction is close to a coin flip; predict range, and keep macro for weeks to months.
   - The literature: no macro model reliably beats a random walk at short horizons (Rossi 2013; Cheung, Chinn et al.
     2019). Published effects shrink about 58% after publication (McLean & Pontiff 2016).
   - Our record: the bias-learner over 15 multi-timeframe readings is FX NULL, BSS +0.05% to +0.15% with every
     interval straddling 0.
   - Honest ceiling: 51 to 54% across all days. Maybe 55 to 58% on the days you call, if you call only 20 to 40% of
     days.
2. **What looks like a bias input often explains the same day, not the next one.**
   - Order flow explains 50 to 60% of the same day's FX move (Evans & Lyons 2002).
   - COT positioning matches the same week's direction about 75% of the time and the following week's not at all
     (NY Fed).
   - Rates and yields: our `yield-asset-coupling` and `rate-diff` work found same-bar coupling only.
   - So they feel convincing on the chart and fail forward.
3. **Professionals call rarely, and only on agreement.**
   - MUFG's scorecard runs 5 signal families over 3 to 9 weeks, calls only beyond ±0.35, and says neutral when the
     families disagree.
   - Morgan Stanley makes few conviction calls, and treats positioning as risk skew, not direction.
   - C.OG's own system traded about 24% of days.
4. **The order is thesis, then validation, then timing.**
   - C.OG: policy and data set the thesis; positioning, flows and vol validate it; technicals only time the entry.
   - The podcasts' 8-question chain: the story, its weakest link, whether today's data agrees, what is priced, the
     reaction to news, the calendar, the expression, the exact invalidation. "Agnostic" is a valid answer.
   - Max's practice says the same in words. In his record, his side matches the 4h trend 84% of the time.
5. **The edge that exists is sparse, multi-day and event-driven.** See the graded table below.
6. **The way you combine and score matters as much as the inputs.**
   - Theory Lab: combine by regression weights shrunk by record length (`action-combining-signals`); start from the
     base rate (`action-base-rates`); never size from an unscored confidence (`action-calibration-scoring`).
   - Equal weights beat "optimal" weights out of sample (Smith & Wallis 2009).
   - Calibrated forecasters beat the base rate by abstaining and by being honest about probability (Tetlock).

## 2. What we actually have, graded (direction only)

Grades come from `js/evidenceGrade.js`, adjusted where it misreads an entry (§6). Effects are against each market's own
base rate.

| Evidence | Horizon | Effect [95% interval] | Grade | How it should enter the bias |
|---|---|---|---|---|
| `cot-crowding-p5` (state D: crowded trend pulls back while the crowd reduces) | 4 weeks | +0.269 [+0.086, +0.392]; held-out markets | Strong | slow prior; fires rarely |
| `positioning-into-release-direction` | release day | +0.064 ATR [+0.019, +0.111], 6/6 pairs | Strong but small (~3–4 pips) | release-day tilt only |
| `post-fomc-usd-drift` | 5 sessions | +41bp [+22, +62]; since 2022 +24bp [−12, +59] | Leaning, FRAGILE | event prior for days 3–5 after FOMC |
| `vix-beta-change`, `vix-second-derivative` | 5 days | +47bp, +124bp; fail their families | Leaning, proposed demotion | forward ledger only |
| `fx-factor-carry` | 1–3 months | IC +0.079 [−0.03, +0.19] | Faint | slow tilt |
| `fx-factor-surprise` | 1 month | IC +0.075 [−0.04, +0.19] | Faint | slow tilt |
| `bias-learner-fx` | same day to +5 | BSS +0.05% to +0.15%, above shuffled 95th pct | Faint | a whisper; not a call |
| relationship map: VIX → gold | days | +0.218σ [+0.048, +0.393] | Faint | context |
| Reversal after a strong day / after a tier-1 surprise | 1–3 days | −0.094 [−0.177, −0.003]; −0.049σ [−0.111, +0.012] | Leaning (reversal) | "don't chase" timing rule |
| 4h trend, day close, post-news continuation, every exit (`h4-trend-hold`, `hold-day-one-confirm-run`, `post-release-momentum-pooled`, `exit-on-fixed-entries`) | 1–5 days | ≈ 0 and powered | Against | not a direction input |

Nothing survives correction across the whole ledger, and forward events are few. This is a set of weak priors to
weigh, not a signal to trade.

## 3. The recommended morning process

It replaces "11 analysts debate, a head of desk must commit to a rating on every instrument". The desk's analysts keep
writing the story; they stop originating the number.

**Step 0. Base rate.** Each market starts at its own same-day up-rate (`js/biasScoreboardBaselines.json`, e.g. NQ 0.554,
EURUSD 0.485). Every call is a move away from that.

**Step 1. Size and conditions first (proven; C.OG's order).**
- Range lines, event size and the stress dashboard set how much risk today deserves.
- If three or more warnings flash, cut exposure whatever the direction view.
- On a big US release day (NFP, CPI; FOMC to 19:00), expect a pre-release session ~10–12% narrower and about half the
  range after the print (`pre-release-ranging`, VALIDATED). Narrower, not ranging: Asia still breaks first on ~93%.
- This is where the desk's validated edge is.

**Step 2. The slow thesis (weeks, not today).**
- One US-dollar call, then each pair derived from it: one coherent view, not 20 opinions.
- Inputs: carry, data-surprise momentum, the Fed path. The growth × inflation quadrant is a backdrop description only:
  tested, it carries no USD or index tilt (gold is a forward-record candidate).
- The slow trend clock (1/3/12-month) is described, never called: no daily skill, at most a small diversifying hold.
- Horizon is 1 to 8 weeks. Today inherits it as a lean; it is not re-forecast each morning.

**Step 3. Validators that fire sparsely.**
- COT state D, post-FOMC drift days 3–5, and the release-day positioning tilt.
- Each moves P(up) by its measured, shrunk effect when it fires, and by nothing when it doesn't.
- Tested and not added: retail book, risk reversals, VRP, month-end flow, multi-timeframe or HMM alignment. They stay
  context.

**Step 4. Combine by the recipe, not by debate.**
- `js/globalReadCore.js` already does evidence-weighted combination. Make it the anchor P(up) and let the debate
  explain it.
- Weights:
  - Theory Lab's shrunk regression weights where a record exists;
  - equal weights within a family where it doesn't;
  - estimated correlations, not assumed ones.

**Step 5. Abstain unless the families agree.**
- "No view" is a written output with fixed thresholds: |z| < 1, expected move below 2× cost, or no tested record
  behind the signals.
- MUFG-style rule: a call needs the families to agree beyond a pre-set score. This is a risk rule, not an accuracy
  claim: cross-asset coherence and timeframe alignment did not raise the hit rate on kept days (conflict-as-no-view
  lowered it). Score the rule on the bias scoreboard; no fitted meta filter.
- Expect no view on 60 to 80% of instrument-days. Remove the desk rule that judges must commit.

**Step 6. Timing and expression, never side.**
- Technicals and the 4h trend time an entry in the direction already chosen. Max uses them this way, and the 4h trend
  failed as a side picker.
- Don't chase: after a strong day or a big surprise, the 1–3 day lean is slightly against continuation, so enter on
  pullbacks or stand aside.
- Event days mean a bigger range, not a direction.
- The regime (ATR, HMM or trend × vol state) does not pick fade, follow or break: every rule lost net in every regime.

**Step 7. Score everything.**
- Every call is stored as a probability and scored with Brier and calibration against the base rate, abstentions
  included. The bias-scoreboard does this from the merge of #1739.
- Conviction drives size only after it is calibrated. The analyst scorecard's hard-coded 0.55/0.60/0.70 must be
  replaced by measured hit rates.
- Proving 55% needs about 300 called days, so judge at 60 days for gross errors only.

## 4. What changes on the desk card (`plans/DESK_MORNING_BIAS_CARD.md`)

- **Order on the card:** size and conditions → slow USD thesis → sparse validators → P(up) vs base → "no view" by
  default.
- **Day type is not a separate call.** `day-type-expansion` FX/gold NULL; the σ lines are the day-type read. Indices
  stay on a forward record.
- **No overnight hold or exit rule from direction.** `hold-day-one-confirm` and `exit-on-fixed-entries` are NULL;
  21:00 close is the default.
- **Each call carries** its families' agreement score, the validators that fired, and its invalidation. The agreement
  score is shown as state, not as conviction or size (`coherence-conviction`).
- **Release-day line:** "pre-release session usually ~10–12% narrower; about half the range comes after the print".
  Never "ranging", "fenced" or "coiled into the number".
- **Not on the card as a lean:** timeframe alignment or HMM state, quadrant tilt for USD / indices, retail book, RR,
  VRP, month-end flow, slow clock as tomorrow's call, a regime-picked rule.
- **Overnight hold:** the old "holding is worse" reason is gone (10-year pack: HOLD flat); the 21:00 close stays the
  default because no hold rule shows an edge.

## 5. Tests still worth running (ranked by what an answer changes)

Tests 1–5 below and the synthesis P1–P5 were run on 2026-11-15; see "Results of the review tests" at the top. Still
open: 6–10, plus the follow-ups under "Where the nulls point".

1. **Fix the evidence grader** (`js/evidenceGrade.js`) before weighting anything on it. Today it:
   - reads the first interval in the text, sometimes a placebo or a side arm;
   - treats positive as the claimed direction, which hides the reversal results;
   - fails to parse "% per trade [..]".
2. **Multi-timeframe HMM structure, done properly.**
   - Weekly, daily, 4h and 1h states; filtered probabilities only, never smoothed; state count chosen on held-out data.
   - Test whether the alignment patterns (all agree; HTF up with LTF pullback) beat the base rate, a plain σ-chain
     baseline and the bias-learner.
   - Expectation, from the literature and `gr-hmm-trend-direction`: useful for variance, unlikely for direction. It
     deserves a clean answer.
3. **C.OG's growth × inflation quadrant** and its transitions as the slow thesis (weeks).
4. **Cross-asset coherence score as a conviction and size multiplier.** When rates, FX, equities and vol agree, is the
   called-day hit rate higher?
5. **Meta-labelling:** a second model deciding whether to act on a call, not which side.
6. **Risk reversals and skew** as a slow direction prior and a carry-crash warning (papers ssrn.1343987).
7. **Dollar carry from the average forward discount** (jfineco 2013.12.005).
8. **Macro announcement premium** on indices (ssrn.2827445).
9. **Untested hypotheses already specified:** Taylor-rule gap (arxiv:1403.0627), shock-type decomposition, slow trend
   as the higher-timeframe bias (`plans/MACRO_DIRECTION_RESEARCH_PROPOSAL.md` H4, H7, H9, H3).
10. **"Don't chase" as a rule:** pre-register the reversal after strong days and after surprises on fresh data.

### Relation to `plans/BIAS_RESEARCH_SYNTHESIS.md` (a parallel session's review, same day)

That review reached the same conclusions: a slow, weeks-scale bias; range and size as the 24-hour job; "no view" as a
normal answer. Its ranked plan maps onto the list above:

| Synthesis | This review | Merged order |
|---|---|---|
| P1 multi-timeframe structure + HMM, conflict = "no view" | test 2 | **1** (after the grader fix) |
| P2 slow bias clock (1/3/12-month trend + carry) | step 2 + tests 7 and 9 | **2** |
| P3 regime picks the rule (fade / follow / break) | — (theirs) | **3** |
| P4 positioning and flow inputs (VRP, OANDA book, risk reversals, month-end) | tests 6 and 7 | **4** |
| P5 pre-release ranging | — (theirs) | **5** |
| — | tests 3, 4, 5 (growth × inflation quadrant, coherence multiplier, meta-labelling) | **6–8** |
| — | test 1, fix the evidence grader | **0** (a fix, not a study) |

Use the synthesis for the study plan and this file for the morning process (§3) and the graded evidence (§2).

## 6. Housekeeping found during the review

- **Paid content in a public repo.** `education/bank-verbatim/` (73 files), `education/cog_inbox/` (3) and
  `education/cog-snippets.md` hold C.OG's paid material verbatim, and the repo is public. Owner decision: make it
  private, or remove and rewrite history. `analysis/output/bias-research/B_educators.md`, committed 2026-11-15 by the
  parallel review, also quotes those pages.
- **Evidence grader misreads** (§5.1).
- **No Theory Lab lesson on multiple timeframes.** One should follow test 2.

## 7. What to expect

A well-built desk bias will:
- call about 20 to 40% of instrument-days;
- be right perhaps 55 to 58% of those, and say "no view" on the rest;
- get its money from size (range), abstention and payoff shape rather than from the side.

Anyone, Max and FundaBias included, claiming much more on daily direction from public data is either selecting days and
timing well, or hasn't been scored. The scoreboard will show which.
