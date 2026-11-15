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
- This is where the desk's validated edge is.

**Step 2. The slow thesis (weeks, not today).**
- One US-dollar call, then each pair derived from it: one coherent view, not 20 opinions.
- Inputs: carry, data-surprise momentum, the Fed path, and C.OG's growth × inflation quadrant (to be tested, §5).
- Horizon is 1 to 8 weeks. Today inherits it as a lean; it is not re-forecast each morning.

**Step 3. Validators that fire sparsely.**
- COT state D, post-FOMC drift days 3–5, and the release-day positioning tilt.
- Each moves P(up) by its measured, shrunk effect when it fires, and by nothing when it doesn't.

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
- MUFG-style rule: a call needs the families to agree beyond a pre-set score.
- Expect no view on 60 to 80% of instrument-days. Remove the desk rule that judges must commit.

**Step 6. Timing and expression, never side.**
- Technicals and the 4h trend time an entry in the direction already chosen. Max uses them this way, and the 4h trend
  failed as a side picker.
- Don't chase: after a strong day or a big surprise, the 1–3 day lean is slightly against continuation, so enter on
  pullbacks or stand aside.
- Event days mean a bigger range, not a direction.

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
- **Each call carries** its families' agreement score, the validators that fired, and its invalidation.

## 5. Tests still worth running (ranked by what an answer changes)

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
