# coherence-conviction — When rates, FX, equities and vol agree, does the 4h-trend lean hit more often or earn more R?

**Pre-registered 2026-11-15, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `coherence-conviction` (one register row; one ledger id; 6 scored cells) |
| Branch | `claude/signal-bot-bias-analysis-bwr1qv` |
| Register row | `plans/RESEARCH_REGISTER.md` → `coherence-conviction` (CLAIMED; maintained by the parent session) |
| Source of the question | `plans/DAILY_BIAS_REVIEW.md` §5 test 4; `plans/BIAS_RESEARCH_SYNTHESIS.md` merged order 6–8 |
| Data | **Coherence inputs (US-close dates):** SPX500 NY-close mid bars `features/px_d1_spx500.parquet`; USD basket from the 7 USD-major NY-close bars `features/px_d1_{eurusd,gbpusd,audusd,nzdusd,usdjpy,usdcad,usdchf}.parquet`; VIX close `features/vix.parquet` (FRED VIXCLS, the Cboe 16:15 ET close); US 2-year Treasury yield DGS2 `analysis/output/cot-crowding-programme/macro_DGS2.csv` (FRED latest vintage, 1976 →), cross-checked equal to the first prints in `data/iep_macro/DGS2_vintages.csv` on 2015–2024 (DGS2 has 0 revised dates in that file; the run asserts equality on the overlap). **Lean and outcomes:** local bid/ask M1 `data/m1_bidask/<key>_m1.parquet` (2016-10 →) for the 13 instruments of `scripts/slow-bias-clock/run.py` (GOLD, EURUSD, GBPUSD, USDJPY, USDCAD, AUDUSD, NZDUSD, USDCHF, EURJPY, GBPJPY, NAS100, SPX500, US30) and their NY-close daily bars (σ20 for the stop) exactly as that runner builds them. Everything ends **2026-08-21** (lockbox): daily labels ≤ 2026-08-21, M1 cut before 2026-08-21 21:00 UTC, asserted. |
| Seed | `20261115` (one for every script in this study) |
| Uncertainty | date-block bootstrap, block 21 sessions, B = 2000 (clusters = dates; the 13 instruments on one date move together); evidence-pack placebo = coherence labels shuffled across dates within instrument |
| Scripts / outputs | `scripts/coherence-conviction/run.py` → `analysis/output/coherence-conviction/` (+ `evidence/<cell>/` from `scripts/evidence_pack/pack.py`) |
| Harness | own script; it imports the R machinery of `scripts/slow-bias-clock/run.py` (`r_entries`, `M1Inst`, `trade_R`, the NY-close builders) unchanged, so the lean and its R are bit-for-bit those of `exit-on-fixed-entries` E0 / `slow-bias-clock`'s H4 benchmark. `python -X utf8 -I`, R2 env unset, local files only, ≤ 2 threads, one process |

## 1. The claim (required)

`plans/DAILY_BIAS_REVIEW.md` §5 test 4: *"Cross-asset coherence score as a conviction and size multiplier. When rates,
FX, equities and vol agree, is the called-day hit rate higher?"* The idea runs through the review: professionals call
"only on agreement" (MUFG's family scorecard says neutral when families disagree), the desk process's step 5 abstains
"unless the families agree", and `js/globalReadCore.js` already shows an agreement index on its state axes (risk, USD,
rates, vol, credit) — description only, never scored.

**The claim tested here:** on mornings after a US session in which equities, vol, the 2-year yield and the dollar all
moved the way a single risk factor would move them (coherent), a given direction lean is right more often and earns more
R than on mornings after a session in which they pulled against each other (incoherent). If true, coherence is a
conviction / size multiplier that sits on top of whatever picks the side.

**Edge source (method lesson #4):** none is claimed for coherence as a direction signal. The mechanism proposed is
*information clarity*: a coherent tape means one macro driver dominates, so a trend lean is less likely to be noise;
an incoherent tape means competing drivers and choppier intraday paths. Who is on the other side: nobody in particular —
this is a filter on a lean, not a premium. That is why the primary arm cannot let coherence pick the side.

## 2. Prior art and why it is not already settled (required)

| Ledger entry / note | Verdict | What it answered | What differs here |
|---|---|---|---|
| `macro-confluence-direction` (2026-10-24) | UNDERPOWERED | Fed net-liquidity + T10Y2Y regime + HY-OAS all ±1 the same day → forward 5/20-day direction on EURUSD/SPX/GOLD: 12+5 episodes, untestable | That was **slow macro state levels** picking a **side** at 5–20 days. Here: **yesterday's market moves** (daily changes, not states) in 4 markets, used as a **filter on a separate lean**, scored on the same day, 13 instruments, ~2,450 dates |
| `macro-confluence-baa-credit` (2026-10-24) | NULL | same, with BAA-AAA credit, 2009-2026: no cell clears; the one nominal hit (EURUSD H=20) vanished after the date-join fix | as above; and confluence there set the side |
| `macro-confluence-range` (2026-10-24) | NULL (wider range failed); unregistered opposite: confluence **narrows** SPX range −0.81 ATR at 20d | if coherence days are quieter days, a fixed 1σ-stop trade's R distribution changes with no direction content. This is why R is scored **with** a hit-rate cell and why the size cells report R per unit risk, not per day |
| `conviction-vote` (2026-07-25) | NULL (anti-predictive) | the backtestSystem bot's conviction vote, never scored, was anti-predictive; bot −£38k | That vote was an unscored internal score. Here coherence is a fixed, hand-specified, point-in-time definition scored against the lean's own base rate before anyone sizes on it — exactly the step that note says was missing |
| `zone-engine` / ConfluenceBot zones (2026-09-01) | NULL | price-level confluence (fib + S/R + pivots + vol) has no edge on 83k trades | price-level confluence, not cross-asset agreement |
| VuManChu combos (NQ) | NULL | "confluence adds nothing measurable on NQ: agreement across components or timeframes is not better than one component" | indicator agreement on one market, not cross-asset |
| `mv-dislocation-forward` (2026-09-23) | NULL | when two co-moving markets come apart, nothing follows (17 firings) | the mirror state (dislocation) on 2 indices; here the full agreement score on 4 asset classes, as a filter |
| `crack-disagreement-direction` | NULL | crude/crack disagreement → 20-day crude direction | one commodity pair |
| `yield-asset-coupling`, rate-diff family | NULL (same-bar only) | yields and assets move together the same bar; no lead | the components here are *yesterday's* moves, used only to qualify *today's* lean; no lead of any component is assumed |
| `bias-learner-fx/gold/idx` (2026-11-15) | NULL / UNDERPOWERED | a learner over 15 morning readings does not beat B0 at 0–5 days | the learner picks a side; here the side is fixed (4h rule) and only the conditioning is new |
| `h4-trend-hold` (exploratory), `exit-on-fixed-entries` (NULL), `slow-bias-clock-r` (NULL) | — | the 4h-slope 07:00 → 21:00 trade loses ≈ −0.027R/entry net; no exit or slower side improves it | the lean conditioned here; its unconditional R is the "all days" benchmark |
| `js/globalReadCore.js` agreement index | live, unscored | shows within-axis agreement; nulls are shown but carry no weight | this study scores whether cross-axis agreement deserves weight |
| `positioning-flow-inputs` (in flight, same branch) | — | positioning/flow as inputs to the bias-learner | different inputs; no overlap in the scored cells |

Not a re-run of a banked null: no ledger entry conditions an existing lean on a point-in-time cross-asset agreement
score and scores the lift in hit rate and R.

**Method lessons applied** (`education/RESEARCH_METHOD_LESSONS.md`): #1 positive control before the real run
(selftest + planted power stage + pack plants); #4 edge source named (§1); #5 linear baseline beside the bucketed
design (§6, a pooled regression of R on the continuous score); #9 date-clustered SEs; #10 two proxy specs for the
z-scores (60-day primary, 20-day sensitivity); #14 causal labels (expanding thresholds, rolling orientation, never a
full-sample cut); #25 quantile ladder (quintiles of the score) reported beside top-minus-bottom; #27 management fixed
(the E0 trade, no stop/exit variants).

## 3. Definitions, fixed in advance (required)

### 3.1 The primary lean (picks the side) — the 4h trend rule

**Side** = sign of the 4h EMA20 slope at 07:00 London (`exit-on-fixed-entries` `Inst.slope`, reproduced in
`slow-bias-clock` `M1Inst.slope`): +1 long, −1 short, 0 = no entry.

Why this lean and not another banked one:
1. It has a side on every instrument-day 2016-11 → 2026-08 with an R outcome already computed on bid/ask M1
   (~32,000 entries). The bias-learner's daily call exists only as test-window OOS probabilities for its own cells, and
   the bias-scoreboard forecasters (desk, Max, macro blend) have a forward record from 2026-11 only — neither has the
   sample to split into coherent / incoherent days.
2. It is the desk's de facto lean: the review notes Max's side matches the 4h trend 84% of the time, and the review's
   step 6 says technicals/4h trend time an entry in a direction already chosen. Coherence is the candidate "validator"
   that would turn that lean into a call.
3. Its unconditional result is known and near zero (−0.027R/entry, 46% win), so a lift is measured against a clean,
   banked baseline, and it involves no fitted model whose estimation noise would blur the split.

### 3.2 The trade and its outcome (identical to `exit-on-fixed-entries` E0)

Every weekday London date D in [2016-11-21, 2026-08-21] per instrument: entry at the 07:00 London M1 bar (ask for long,
bid for short); stop 1σ_D away, σ_D = SD of the last 20 NY-close log returns completed before 07:00 London on D; stop
checked on the bid/ask M1 path (a gap through fills at that bar's open); exit at the open of the 21:00 London bar (bid
for long, ask for short). Spread is inside every R.
- **R** = the lean side's R (R_L if side > 0, R_S if side < 0).
- **hit** = 1{R > 0}.

### 3.3 The coherence score (point in time at 07:00 London on D)

Let t1 = the last NY-close date completed before 07:00 London on D (the prior weekday's US session; Monday uses
Friday), t0 = each series' previous observation. All four series are dated by US calendar date.

| Component c | Move x_c(t1) | Knowable at 07:00 London D because |
|---|---|---|
| EQ | ln(SPX500 close t1 / close t0), NY-close mid | the 17:00 NY close of t1 is 22:00 London on t1 |
| VOL | ln(VIX t1 / VIX t0) | Cboe close 16:15 ET on t1 |
| RATES | DGS2(t1) − DGS2(t0), in percentage points | DGS2 is the ~15:30 ET bid-side market yield on t1, never revised (checked). FRED posts it with a ~1-day vendor lag; the yield itself was a traded price on t1. Strict-publication sensitivity in §6 |
| USD | mean of the 7 USD-leg log returns t0 → t1 (−EURUSD, −GBPUSD, −AUDUSD, −NZDUSD, +USDJPY, +USDCAD, +USDCHF; + = USD up), NY-close mid | as EQ |

1. **Standardise:** z_c(t1) = x_c(t1) / SD of x_c over its last 60 observations ending at t1 (min 60).
2. **Orient to one risk factor, point in time:** s_c(t1) = sign of the Pearson correlation of z_c with z_EQ over the
   last 252 common dates ending at t1 (min 120). s_EQ ≡ +1. (VIX is expected −1, the 2-year yield +1 before 2022 and
   unsettled after, the USD mostly −1; the rolling sign is what keeps a 2022-style stock-bond flip from being called
   "incoherent" by a fixed sign.) o_c = s_c · z_c.
3. **Coherence score** K(D) = |Σ_c o_c| / Σ_c |o_c| ∈ [0, 1]: 1 when all four oriented moves point the same way,
   near 0 when they cancel. Missing if any component is missing on t1 (US holidays) — those days are counted and
   excluded, never imputed.
4. **Coherence label**, causal thresholds: q1(D), q2(D) = the 1/3 and 2/3 quantiles of K over all prior dates
   < D from 2005-01-03 (expanding, min 500 dates). **COH** = K ≥ q2; **INC** = K ≤ q1; MID otherwise.
5. **Tape direction** (for the secondary arms only): m(D) = mean_c o_c (+ = risk-on). Each instrument's risk sign
   β_i(t1) = sign of the correlation of its NY-close log return with m over the last 252 common dates ending at t1
   (min 120). **Tape side** for instrument i on D = sign(m) · β_i. On COH days the lean **agrees** with the tape when
   side = tape side.

Nothing in 3.3 reads anything dated after t1; nothing in the label reads any outcome. The selftest (§3.6) checks this.

### 3.4 Scored cells (pooled over the 13 instruments; unit of averaging = entry)

| Cell | Arm | Statistic | Bar |
|---|---|---|---|
| **C1** `dR_coh_inc` | primary | R̄(COH) − R̄(INC), lean = 4h side | 0.05R |
| **C2** `dR_coh_all` | primary | R̄(COH) − R̄(all days) | 0.05R |
| **C3** `dhit_coh_inc` | primary | hit(COH) − hit(INC) | 0.05 (5 pp) |
| **C4** `dhit_coh_all` | primary | hit(COH) − hit(all days) — the lean's own base rate is "B0" for a hit | 0.05 (5 pp) |
| **C5** `dR_agree_all` | secondary: coherence + its direction as a **validator** (lean still picks the side) | R̄(COH ∧ lean agrees with tape) − R̄(all days) | 0.05R |
| **C6** `dR_tape_h4` | secondary: coherence **picks the side** (separate arm, as the brief requires) | on COH days, R̄(tape side) − R̄(4h side) | 0.05R |

- **Halves:** the entry window split at its middle date (≈ 2021-09).
- **Mirror:** for C1–C4 the mirror is "incoherent days are better" (estimate significantly < 0, reported as WRONG SIGN,
  never a pass). For C5 the mirror is R̄(COH ∧ lean **opposes** tape) − R̄(all), reported; for C6, the reversed tape side.
- **The 0.05R / 5 pp bars:** 0.05R is the desk's bar for a daily trade rule (`exit-on-fixed-entries`), above a round
  trip of spread (~0.03R). 5 pp is the step from the lean's ~46–50% to the 55% the desk card would need for a "called"
  day (`DAILY_BIAS_REVIEW.md` §7).

### 3.5 Controls

- **Placebo (evidence pack):** coherence labels shuffled across dates within instrument, 500 draws (fewer if the laptop
  is saturated; logged as an amendment); the real estimate must sit above the 97.5th percentile.
- **Lookahead canary (evidence pack):** the label replaced by the sign of the scored outcome; the estimate must jump.
- **Positive control (evidence pack, on the real rows):** a bar-sized lift planted on COH (or AGREE) rows must be found
  in ≥ 80% of plants at 1× bar. **Rule fixed now (lesson from `slow-bias-clock` A2):** a cell whose pack finds the 1×
  plant in < 80% of plants cannot be NULL; it is UNDERPOWERED.
- **Concentration:** by instrument, by group (FX/gold/indices), by year, without the top 1% of rows.

### 3.6 Positive control before the run (method lesson #1) — `run.py --selftest`

On synthetic data, through the same functions as the real run; the real run aborts if any fails:
(a) synthetic 13-instrument × 2,500-date panel with R ~ real-shaped noise (−1 floor, date-common component) and a
planted +0.10R / +8 pp lift on COH dates (known from the generator): C1 and C3 CI lower bounds > 0;
(b) the same with no lift: C1 and C3 CIs include 0 and no cell is VALIDATED;
(c) look-ahead canary: the coherence function run on synthetic series, then every series value dated after t1 replaced
by noise — K(D), the label, the orientation and the tape side for D are unchanged;
(d) the R function on a hand-built path returns the known R (stop hit, gap fill, 21:00 exit) — `slow-bias-clock`'s
own check, re-run.

### 3.7 Power stage on the real rows (before any scored estimate is computed)

Control-sample use of outcomes, allowed by the protocol for power: the real R/hit rows are kept, the real coherence
labels are **permuted as whole dates** (so any real effect is destroyed, the cross-instrument structure is kept), a lift
of 0.5×, 1× and 2× the bar is planted on the permuted COH (or AGREE) rows, and the scored estimator + bootstrap
(B = 300) is run 40 times per multiple. **Simulated MDE** = the smallest multiple (interpolated) detected in ≥ 80% of
runs at the Holm first-step level. The runner writes `power_sim.json` before it computes any real C1–C6 estimate.

## 4. Hypotheses, expectation first (required)

| Cell | Pre-registered expectation |
|---|---|
| C1 ΔR COH − INC | **≈ 0 (|Δ| < 0.02R).** The lean is ≈ 0 everywhere; coherence describes yesterday, and every "agreement" study so far (macro confluence, VMC combos, dislocation) was null forward. A small positive is possible on the clarity mechanism |
| C2 ΔR COH − all | ≈ 0, half of C1 |
| C3 Δhit COH − INC | ≈ 0 (|Δ| < 2 pp) |
| C4 Δhit COH − all | ≈ 0 |
| C5 ΔR AGREE − all | ≈ 0; if anything **negative**: agreeing with yesterday's tape is a continuation bet, and the review's "don't chase" evidence leans slightly to reversal after strong days |
| C6 ΔR tape − 4h | ≈ 0 to slightly negative (same reason) |
| **THE GATE** per cell | estimate's 95% CI lower > 0 **and** Holm-adjusted p < 0.05 over the 6 cells **and** same sign in both halves **and** above the pack placebo 97.5th percentile **and** the mirror not significantly > 0 |

**Verdict per cell:**

| Condition | Word |
|---|---|
| gate holds and estimate ≥ bar | `VALIDATED` |
| CI lower > 0 and Holm p < 0.05, but estimate < bar, or halves / placebo / mirror fails | `CONTEXT` |
| gate fails, cell POWERED (binding MDE ≤ bar, pack 1× plant found ≥ 80%), CI upper < bar | `NULL` |
| otherwise | `UNDERPOWERED` |

Binding MDE = max(design MDE §5, 3.48 × the run's SE_used, the simulated MDE §3.7). SE_used = max(bootstrap SE, pack
placebo SD); p = two-sided normal from est / SE_used. **Ledger-id word:** VALIDATED if any primary cell (C1–C4) is
VALIDATED; else CONTEXT if any cell is CONTEXT or a secondary cell is VALIDATED; else NULL if every cell is NULL; else
UNDERPOWERED. Each cell's word is reported separately.

## 5. Power — what this design can and cannot find (required)

Holm first-step α = 0.05/6 two-sided → z = 2.64; MDE = (2.64 + 0.84) × SE = 3.48 × SE.

Design SEs (before any outcome is read; assumptions stated): per-entry R SD ≈ 0.75R (1σ stop, 14-hour window; E0 win
46%, payoff 1.08); per-entry hit SD 0.50; ~12.7 instruments per date with an average same-date correlation of
lean-side R of about 0.10 → date-level SD ≈ 0.31R (hit 0.21); ~2,450 dates, a third COH and a third INC (~815 each);
AGREE ≈ half of COH (~410 dates); C6 differs from the 4h side on about half the COH entries.

| Cell | Design SE | **Design MDE** | Bar | Verdict by design |
|---|---|---|---|---|
| C1 ΔR COH − INC | 0.015R | 0.053R | 0.05R | **marginal** (UNDERPOWERED if the real SE is ≥ 0.0144R) |
| C2 ΔR COH − all | 0.0089R | 0.031R | 0.05R | POWERED |
| C3 Δhit COH − INC | 0.0104 | 0.036 | 0.05 | POWERED |
| C4 Δhit COH − all | 0.0060 | 0.021 | 0.05 | POWERED |
| C5 ΔR AGREE − all | 0.0141R | 0.049R | 0.05R | marginal |
| C6 ΔR tape − 4h (COH) | ~0.014R (paired; half the entries differ) | ~0.049R | 0.05R | marginal |

These are rough; the simulated MDE on the real rows (§3.7) and the run's SE are binding. A useful conviction filter
would have to lift the lean by ~0.05R or 5 pp on a third of days; smaller lifts (~0.02R) — the size a literature-style
"clarity" effect would plausibly have — are below every MDE here and would show as NULL only if the interval also
excludes the bar.

## 6. Multiplicity — how many cells, and the corrected bar (required)

- **Scored cells: 6** (C1–C6), Holm at α = 0.05.
- **Decomposition / description (BH q = 0.10 over the listed tests, `chanceBaseline`; candidates only, registered now
  so none can be chosen later):**
  - each component's own agreement with the lean (lean side = sign(o_c · β_i)) vs not: ΔR, 4 tests;
  - each pair of components agreeing vs disagreeing (K computed on that pair), C1-style ΔR: 6 tests;
  - C1 and C2 by group (FX, gold, indices): 6 tests;
  - strict unanimity (all four o_c same sign) vs 2–2 split, C1-style ΔR and Δhit: 2 tests;
  - composite magnitude |m| top vs bottom tercile (causal thresholds), ΔR: 1 test (separates "agreement" from "a big
    day", cf. `macro-confluence-range`'s narrowing);
  - sensitivity specs (not tested, reported): 20-day z window; RATES lagged one more US date (strict FRED publication);
    VIX replaced by its oriented sign only;
  - quintile ladder of K: R̄ and hit per quintile (lesson #25);
  - linear baseline (lesson #5): pooled OLS of lean-side R on K (and on K × sign agreement with tape), date-clustered SE;
  - size-multiplier book: weight 1.5 on COH, 1.0 on MID, 0.5 on INC; risk-weighted R̄ minus flat R̄;
  - the 4h lean's directional hit (sign of the 07:00 → 21:00 mid move) vs the market's own same-day up-rate base B0
    (expanding Beta(10,10) as `direction-bar`), by label.
- **Promotion bar:** anything that sizes a live position needs |t| ≥ 3 on its scored cell and a forward pass.

## 7. What this does NOT test (required)

- Not whether coherence predicts **direction** by itself beyond C6 (one secondary cell); not at multi-day horizons.
- Not intraday or overnight coherence (moves from t1's NY close to 07:00 London): no overnight 2-year yield or VIX
  history exists locally; 2 of 4 components would be left.
- Not credit, oil, gold or non-US rates as components; not a fitted weighting of the four.
- Not other leans (bias-learner, slow clock, desk, Max): their samples are too short or their side is a fitted model;
  a pass here would be re-tested on the forward bias-scoreboard leans.
- Not trade management (fixed E0; lesson #27). Not broker execution beyond the OANDA bid/ask spread.

## 8. What each verdict changes (required)

- **A primary cell VALIDATED** → ledger entry; the morning card shows the coherence label beside the lean as a research-
  only conviction tag, forward-scored in `bias-scoreboard`; sizing waits for |t| ≥ 3 or a forward pass.
- **CONTEXT** → described on the card as "coherent days have run slightly better for the 4h lean", never as a multiplier.
- **NULL** → the card does not upgrade a call because rates, FX, equities and vol agreed yesterday; `globalReadCore`'s
  agreement index stays description only; the "abstain unless families agree" rule in the review's step 5 must rest on
  something other than cross-asset agreement of yesterday's moves.
- **UNDERPOWERED** → coherence goes to the forward scoreboard as a logged tag, judged when the forward record reaches
  the MDE; it is not claimed either way.

## Amendments

*(none yet)*

---

## RESULTS — run <YYYY-MM-DD>

*Written to `analysis/output/coherence-conviction/RESULTS.md`. Nothing above this line changes after the run.*
