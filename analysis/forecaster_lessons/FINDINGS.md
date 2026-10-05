# Our volatility forecast / exhaustion system vs the Forecaster Portfolio

*Written 2026-10-04. Sources: `education/forecaster-portfolio-case-study/` Lessons 01–03,
the Level-Atlas vote portfolio v2 record (`vp2.json`, 2022-04-14 → 2026-09-18, 1,132
days, 23,619 trades), the forecast research (`vfr.json`, `MD files/VOL_LADDER_NOTES.md`),
and the fade / continuation / surface research docs. Every number below comes from
the scripts in this folder. None of them needs the R2 price data, and they re-run in
seconds (`overfitting_and_selection.py` takes about a minute).*

```
python3 analysis/forecaster_lessons/validate_book.py            vp2.json --json validate_book.out.json
python3 analysis/forecaster_lessons/layer_experiments.py        vp2.json --json layer_experiments.out.json
python3 analysis/forecaster_lessons/event_days.py               vp2.json calendar_events.csv --json event_days.out.json
python3 analysis/forecaster_lessons/overfitting_and_selection.py --json overfitting_and_selection.out.json
python3 analysis/forecaster_lessons/monitoring_and_tails.py     vp2.json --json monitoring_and_tails.out.json
python3 analysis/forecaster_lessons/research_programme.py
python3 analysis/forecaster_lessons/live_parity.py              vp2.json v2_decision_log.json --from 2026-09-03 --to 2026-09-18 --split 2026-09-15
```

The one check that does need R2 M1 bars is fill realism: whether a touch becomes a fill,
and the real spread and slippage per pair (§2.1). It is listed as step 1 of §4.



> **⚠ RETRACTION, 2026-10-05.** `vp2.json`, the Vote Atlas record behind §2–§3, was saved
> on 2026-09-18, **before** PR #1497 (merged 2026-09-30). That PR fixed a look-ahead in
> `prevOutcomeSameDay`, one of the vote's core dimensions.
> - After the fix the honest vote is losing: m≥3 PF 1.06 → 0.95.
> - PR #1498's pre-registered Vote Atlas v4 tests found the export lines
>   indistinguishable from random levels (0/28; gross 0.000R).
>
> **Invalid:** every Vote-Atlas-specific number in §2–§3. That includes the 3.95 Sharpe,
> the cost headroom, PBO/DSR, the meta-label/sizing/throttle experiments, the event-day
> split and the live parity reading. They describe a leaked backtest. The *methods* and
> scripts are fine and can be re-run on a post-fix trade list.
>
> **Still valid:**
> - §0's design comparison. #1498 makes its main point stronger: our lines carry no
>   direction edge, as Lesson 03 predicts.
> - The `volForecast.js` null-tag bug fix.
> - The code audit (§3.8).
> - §3.7, now re-tallied: 1 of 38 directions accepted, 0 live-confirmed.
>
> The v4 plan is withdrawn (`VOTE_ATLAS_V4_PLAN.md`).

## 0. The question: how far is what we built from what the course describes?

*What we built:*
- the volatility forecaster v3 (the ladder behind the export button);
- the exhaustion surface and the Surface Lab;
- the fade/continuation research;
- the Vote Atlas book that trades the ladder's rungs.

*What the course describes:* the Forecaster Portfolio, a seven-layer system. Lessons
01–03 reveal only two layers:
- **Layer 3, volatility forecasting**;
- **meta-labelling**.

The other five are proprietary. So the comparison covers those two layers, Lesson 03's
design principles, and the research and validation process of Lessons 01–02. Their
contents beyond that can't be compared.

| What the course describes | What we built | Distance |
|---|---|---|
| **A dedicated volatility-forecasting layer**: GARCH, clustering, shock half-life (L03 §02) | Forecaster v3: Yang-Zhang σ (FX, gold), GARCH (indices), HAR shadow, an implied-vol ladder that beat realised vol OOS, quantile widths fitted per pair and pinned to p50/75/90 exceedance targets OOS | **Level or ahead.** The lesson stops at textbook GARCH. Gaps: index GARCH α/β are hand-set ("interim" β 0.87), not estimated. **Vote Atlas does not trade the export button's ladder:** same widths, different σ input (London-day M1 vs 17:00-NY D1), no event scaling, no IV (plan item 1.1: re-base Vote Atlas on the export calc; the export itself is unchanged) |
| **Jumps separate from diffusion** (L03 §03) | Event multipliers (FOMC/NFP/CPI/holiday); jump-diffusion research page | **Close.** The multipliers are a crude jump term, used in band width only, not in risk or sizing |
| (not covered in L01–03) | **Exhaustion**: IV/σ predicts p75 breaches OOS (13 / 22 / 35% vs 25%); Surface Lab | **Beyond what the course has shown** |
| **Volatility decides *how much*, not *which way*** (L03 §02: "structure … bears on how much to hold rather than on which way to bet") | The forecast places **levels**; the vote then bets **direction** at them (fade/follow); size is a flat 0.5% risk | **The biggest design difference, and now confirmed as the reason it fails:** after the #1497 look-ahead fix the vote loses, and #1498 found the lines no better than random levels for direction. Pure fades failed 11 times too (§3.7) |
| **Meta-labelling**: a second model decides whether and how much to act (L03 §01) | Tried before: `Trade_Decision_Engine` (logistic on 110,883 zone-touch events) was weakly discriminating and PARKED. Not on Vote Atlas today | **Tried, failed on a primary with no edge.** On top of Vote Atlas the new prototype is also weak (IC 0.031): a small gain from dropping the bottom 30% (E1/E5). Treat as optional |
| **Separate layers, each tested against its own standard** (L03 §01) | Forecast layer: its own tests (exceedance, pinball), done properly. Decision layer (vote) is only tested together with the overlays. Management layer (risk guard, ccy gate) runs uncalibrated inherited defaults | **Medium.** The bottom layer is clean; the upper layers are tested together |
| **Fundamental law IR ≈ TC·IC·√BR** (L03 §01) | Huge breadth (about 5,000 trades/yr, 17 instruments), small IC per trade: the shape the law favours. TC leaks: live took only 48% of the backtest's trades (§3.9) | **Right shape, leaky implementation** |
| **Research as a managed search** (L02): log every attempt, stopping rules, tests fixed in advance | Many directions; nulls banked and dead ideas killed. No configuration ledger; no pre-set stopping rules | **Medium** |
| **Validation stack** (L01 §05: 12 checks) | Bricks exist in code but are not applied to this system's headline (§3.8) | **Furthest away**, but it's process, not research |

**In one paragraph.** The forecasting layer, the only one the course actually shows, is
already as good as theirs and better in places (calibrated quantiles, implied vol,
exhaustion). The real gap is **what the forecast is used for**: theirs drives exposure,
ours drives directional bets at levels. Around that we are missing the meta-label
layer, the decision and management layers aren't separated and tested on their own,
and the validation discipline is only partly applied. After the #1497 fix and #1498's tests, the directional use is dead. The forecast's value
is as a range/risk forecast (`VOTE_ATLAS_V4_PLAN.md`, withdrawn plan + what still stands).

The rest of this file is the **supporting evidence**: the lessons' checks run on the
Vote Atlas record, layer experiments, live parity, and the code audit.

---

## 1. What the lessons say, in one paragraph each

- **L01 · One path among many.** A track record is one draw from a process.
  - Report every statistic with its sampling distribution: Sharpe SE (with skew and
    kurtosis), Lo's serial-correlation adjustment, and shrinkage toward a prior.
  - Use a stationary block bootstrap for the distribution of paths and drawdowns.
  - Size by Kelly on a *shrunk* edge, because over-estimating the edge 2× means
    betting 2× Kelly, which gives zero growth.
- **L02 · Research has no timetable.** Search is heavy-tailed, so manage it with
  stopping rules and breadth.
  - Log every trial. The best of N trials is inflated by about √(2 ln N) standard
    errors, so deflate for it.
  - With a 4% base rate, a single test at 5% size is wrong about 60% of the time. A
    second, *independent* test is what makes a result trustworthy.
  - Edges decay, so monitor for it.
- **L03 · A system built in layers.** IR ≈ TC·IC·√BR.
  - Separate forecasting from decision from management, and test each layer on its
    own.
  - Volatility is forecastable and direction is not. Jumps can't be managed as they
    arrive.
  - Meta-labelling is a secondary model that learns *when* the primary model is
    right.

## 2. Supporting evidence: the Vote Atlas record through the lessons' checks

| Check (L01 §05 card) | Result | Verdict |
|---|---|---|
| Sharpe ± SE (non-normal, Opdyke) | **3.95 ± 0.43**, 95% CI 3.11–4.79, PSR ≈ 1 | strong *as a backtest* |
| Lo η(q), 1 / 5 / 10 / 20 lags | 3.61 / 3.17 / 2.99 / 2.86 | the √252 rule overstates it. ACF1 = +0.098, so n_eff ≈ 930 of 1,132 |
| Bayesian shrinkage (prior 1.0, τ 1.0 / 0.5) | 3.50 / **2.71** | plan on about 2.7, not 4 |
| Deflated Sharpe | ≥ 0.95 even at N = 1,000 trials at an *assumed* trial-Sharpe SD of 1.0. Measured on the real trial family (§3.5): SD 1.83, effective N 5.6 → DSR 1.00 | survives search breadth *if* the costs hold |
| Bootstrap, 2,000 paths, mean block 10 d | max DD realised −14.1% vs median −16.0%, 5th pct −23.7%, 1st pct −28.5%; P(DD < −20%) = 16% (resampled from the throttled record, so the throttle isn't re-applied along each path) | the realised DD was a *lucky* path. Budget for about −24% |
| Loss frequency vs Φ(−S√h) | record loses **more** often than the normal model at every horizon (day 43.1 vs 40.2%, month 15.4 vs 12.7%, quarter 6.2 vs 2.4%) | regime variation (2022H2 Sharpe 1.57), not skew |
| Decay (L02 §06) | edge *rising*: 1st half Sharpe 2.72 vs 2nd half 4.97, trend p = 0.009 | **a warning, not good news** (§3.4) |
| Fundamental law | per-trade IR 0.088 × √5,258 trades/yr = 6.4 if independent; realised 3.95 → about 2,000 effective bets/yr | edge = **tiny IC × huge breadth** |
| Costs | mean net R **+0.071**. Pooled break-even is **≈ 1.7 pips of extra round-trip slippage** on top of the modelled flat cost | **this is the binding constraint** |

### 2.1 The one number that matters: cost headroom

Extra round-trip slippage s costs s/stopPips R on every trade. Results on the
walk-forward test period (2023Q2–2026Q3):

| extra slippage | base Sharpe | mean R | with meta-label filter (E1) | mean R |
|---|---|---|---|---|
| 0.0 pip | 3.92 | +0.072 | **4.07** | +0.085 |
| 0.5 pip | 2.81 | +0.050 | **3.13** | +0.064 |
| 1.0 pip | 1.65 | +0.029 | **2.14** | +0.044 |
| 1.5 pip | 0.46 | +0.008 | **1.13** | +0.023 |
| 2.0 pip | −0.77 | −0.013 | **0.09** | +0.002 |

Per instrument, the extra cost each one can absorb before mean R reaches zero:

| instrument | headroom |
|---|---|
| EURAUD | −0.4 pips (already negative) |
| EURCHF | 0.3 pips |
| GOLD | 1.0 pip |
| EURUSD | 1.6 pips |
| USDJPY | 6.1 pips |

*Scope note:* the Fib Atlas (Asia-range fib ladder) is a **different system**. Its live
paper loss (`MD files/FIB_ATLAS_BACKTEST_VS_LIVE.md`) shows what spread, touch ≠ fill and
same-bar ambiguity *can* do, but it is not evidence about this book. The Vote Atlas has
its own live evidence: see §3.9. In fundamental-law terms, **our IC and breadth look
fine; our TC (does live do what the backtest does, at what cost?) is the open question.**
L03 says that is where a layered system loses its information ratio.

## 3. Experiments: one layer at a time, walk-forward

Setup for every experiment:
- Trained only on trades *resolved* before each test quarter opens.
- Test period 2023Q2–2026Q3.
- Thresholds fixed in advance.
- Compared at equal 10% volatility, so differences are risk-adjusted rather than
  leverage.

| | Sharpe @10% vol | max DD @10% vol | Verdict |
|---|---|---|---|
| Base (unthrottled) | 3.92 | −7.7% | — |
| **E1 meta-label: skip predicted R ≤ 0** | **4.07** | **−6.4%** | **adopt (shadow first)**: small gain at zero slippage, large gain under slippage (table above) |
| E1 meta-label: size ∝ prediction | 3.75 | −7.2% | reject: the prediction's top deciles flatten (realised R ≈ 0.10 for deciles 7–10) |
| **E2 size by vote margin (shrunk, walk-forward)** | **4.09** | −7.0% | adopt candidate. Monotone: margin 3 → +0.044R … margin 8+ → +0.182R |
| E4 prune pairs with trailing t < 0 | 3.84 | −5.2% | reject for Sharpe (L02: selection on noise) |
| E3 vol-target EWMA(0.94) | 4.12 vs 4.17 | −7.3% vs −7.3% | reject: the book's |r| ACF1 is only 0.12, and per-trade stops already scale with σ |
| E3 current graded DD throttle | 3.74 vs 4.17 | **−4.2%** vs −7.3% | **keep**. On 1,000 bootstrap paths it cut DD on **100%** of paths (median −5.4 → −3.7%, 5th pct −8.4 → −4.9%) for a median Sharpe cost of 0.49, so it is structural, not path-fitted |

Meta-label model (E1):
- Gradient-boosted trees on entry-time features only: instrument, follow/fade, rung,
  session, side, margin, target/stop ratio, stop ÷ the pair's median stop (a vol
  state), hour, day of week, and the trailing mean R of the pair and of the book.
- OOS IC is 0.031, which is small, as L03 predicts for anything directional.
- Its bottom decile realises only +0.012R. Those trades are the ones that turn
  negative first when live fills are worse.

### 3.1 Event days (Lesson 03 §03, jumps)

`js/levelAtlasEngine.js:303` and the live `local_decision_engine/lib/zonePricer.mjs:146`
build the rungs with `eventTag:'none'` on **every** day. So on FOMC/NFP/CPI days the
book trades quiet-day rungs, while the forecaster's ladder is about 15–20% wider.
Live and backtest agree, so the book's record is not biased by this. Is it a weak spot?

| | n | mean R | t |
|---|---|---|---|
| quiet days | 9,075 | +0.070 | 8.4 |
| any Major release day | 11,770 | +0.071 | 9.5 |
| fade on a tier-1 (FOMC/NFP/CPI) day | 852 | +0.020 | 0.8 |
| fade on a quiet day | 3,885 | +0.059 | 5.8 |

The gap is −0.039R with t = −1.49. **Not significant**, so per L02 it is a hypothesis
to pre-register, not a filter to switch on.

### 3.2 The forecasting layer (L03 Layer 3)

The ladder already fixed the calibration problem the old COG bands had:
- Under the old bands, realised H-L exceeded the "median" on only 34.9% of days, with
  skill vs climatology of −0.07 (`vfr.json`).
- The pooled OOS ladder rungs are within 0.9pp of target (`VOL_LADDER_NOTES.md`).

Two forecasting-layer issues remain:

1. **Bug, fixed in this change.**
   - `computeForecast` coerced `eventTag: null` to `'none'`
     (`js/volForecast.js:722`), so an unknown calendar was priced as a quiet day.
   - That hit two cases. The live scheduler, when the calendar feed is down (it
     returns null on purpose), got the quiet-day discount of ×0.92–0.98 (median
     ×0.946, i.e. bands 2–8% too narrow) on every instrument.
   - The other case was every walk-forward replay that passes `eventTag:null` on
     purpose (`/api/vol-forecast/backtest-range`, server.js:11936; the weekly/monthly
     ladder route, server.js:21858). The comment at server.js:11930 warns this would
     be "a fake edge for a fade study, since narrower bands are touched more often".
     It was happening anyway.
   - Research callers that omit the tag (`hitRateBackfill`,
     `volForecastResearchEngine`, `intradayForecastResearch`, `forecastDriftCompare`)
     are also now ×1.0.
   - **Any fade or touch-rate study run on those replays should be re-run.**
   - Regression test: `js/forecastLadder.test.mjs`. It fails on the old line and
     passes now.
2. **σ-series mismatch** (agent survey, `forecastSigma.js` header).
   - The live ladder σ comes from 17:00-NY OANDA D1 bars.
   - The widths were fitted on 00:00–22:00 London sessions.
   - Calibration can drift with no visible symptom. The 65-session live check is the
     only guard, so keep it running.

### 3.3 Fade / continuation / surface: what the record says

- **Fade research:**
  - Every pre-registered fade test with a recorded run is null: band-fade Stage 1
    t = 0.85 vs a null p95 of 2.00; cog-fade is null on FX; a 48-cell fade stop/target
    grid has none positive net in both halves.
  - pooled-fade has no banked verdict.
  - This matches L03 §02: *direction* at a line is close to unforecastable.
- **Continuation:**
  - ContinuationBot nets +0.026R/trade, with only 2 of 32 instruments at t ≥ 2.
  - The zone-duel ticker's confidence is labelled uncalibrated.
- **Surfaces:** the one pre-registered surface result that passed (H5) is about
  *range size*. Days past p75 run 18–19% when IV/σ is cheap and 32–33% when it is
  dear, against 25% by design. The exhaustion surface shows the same monotone IV/σ
  effect out of sample (13.0 / 22.3 / 34.8% p75 exceedance). That is exactly L03's
  thesis: *volatility* is the forecastable object.
- **Implication:**
  - Stop searching for fade *direction* at the lines. L02 says a long run of nulls is
    evidence the rate in that region is low, and the posterior expected value of the
    next attempt is below its cost.
  - Spend the effort on (a) the size of the day, via IV/σ into the ladder width, and
    (b) the decision and implementation layers above.

### 3.4 Why a *rising* edge is a red flag here

- McLean–Pontiff (L02 §06) says real edges decay.
- Our backtest's edge doubles from the first half (2.72) to the second (4.97).
- The overlays (throttle tiers, early-exit 0.4, ccy gate 1%, minMargin 3,
  maxConcurrent 3), the pair list and the atlas dimensions were all chosen recently,
  with the whole history in view. That is the L01 "garden of forking paths".
- A record that gets *better* toward the period where its rules were designed is
  what L02 §05's selection effect predicts.
- The cure is L01 card 03: a holdout or lockbox **after** the freeze date, examined
  once.

### 3.5 Search breadth and selection (L01 cards 05/07, L02 §05): `overfitting_and_selection.py`

Universe: 32 instruments from `analysis/output/level-atlas-vote-trades/*-votetrades.json`,
over the common window 2022-10-13 → 2026-06-04 (944 days). Every trial is a daily
equal-risk book with no overlays, so this isolates the **signal layer**.

| Check | Result | Reading |
|---|---|---|
| Trial family | 180 configs (4 universes × minMargin 1–5 × rung × decision); Sharpe median 3.63, sd 1.83, best 7.68 | edge is present almost everywhere in the family |
| Effective trials (eigen participation) | **5.6** of 180 | configurations are highly correlated, as L02 §05 predicts |
| DSR of the best trial | 1.00 at N = 180 (benchmark 4.99) and at N_eff = 5.6 (benchmark 2.31) | the search does not explain the edge |
| CSCV, S = 16 (12,870 splits) | **PBO 0.000**; IS-best 7.75 → OOS 7.46 | choosing among these configs is not overfitting |
| minMargin plateau (book-17) | m1 4.0 · m2 5.3 · **m3 6.8 · m4 7.7 · m5 7.6 · m6 7.4** · m7 5.2 | a plateau, not a spike: structure (L01 card 07) |
| Pair selection, 2023 → 2026-06 | all 32: **5.32** · book-17 picked with hindsight: **6.87** · the 15 excluded: 2.05 · picked walk-forward (trailing t > 0): **5.69** | about **1.2 Sharpe of the book's headline is hindsight pair choice**; an honest selection rule earns +0.4 |

What this cannot see:
- The vote dimensions themselves were chosen by `annotateHolds`, using the same
  out-of-sample labels these trades are scored on (`LEGO_MODULES.md` ≈ line 2730).
- Every trial here inherits that.
- CSCV measures overfitting *within* the family, not the contamination of the family.
- Only a lockbox after the freeze date answers that (§4 step 2).

### 3.6 Forward monitoring and tails (L01 cards 06/10, §02, §04; L03 §02–§03): `monitoring_and_tails.py`

**How long must the live record run?** Minimum track record length at 95%, on the
unthrottled book:

| edge assumed | to confirm Sharpe > 0 | to confirm Sharpe > 1 |
|---|---|---|
| backtest, 4.17 | 34 days | 58 days |
| shrunk, 2.71 | 82 days | 203 days |
| +0.5 pip slippage, 2.81 | 77 days | 185 days |
| +1 pip slippage, 1.65 | 233 days | **1,495 days** |

**Detecting decay.** Mean R is 0.071 with sd 0.804, at 20.9 trades a day. Trades on
the same day are correlated, with a design effect of 2.35, so an effective trade is
worth less than a raw one.
- To detect a 50% fall in mean R at 5% size and 80% power takes **about 7,500 trades,
  or about 360 trading days**.
- A Wald SPRT on per-trade R gets there faster: H0 = the frozen 0.071, H1 = 0, α 5%,
  β 20%, kill at a log-likelihood ratio of 2.77.
  - If the edge is gone, it kills after about **1,680 trades, about 80 days**.
  - If the edge is intact, it clears after about 940 trades.
- **This is the monitoring rule** for the live book (formula in the script output JSON).

**Tails** (unthrottled, % of equity per day):

| | normal | Cornish-Fisher | empirical | CVaR |
|---|---|---|---|---|
| VaR 95% | −3.89 | −3.13 | −3.29 | −4.26 |
| VaR 99% | −5.80 | −4.37 | −4.88 | −5.65 |

- GPD on losses beyond the 95th percentile gives ξ = −0.20, a bounded tail.
  - That puts the 1-in-1000-day loss at 6.5%, against a worst day of 6.8%.
  - The positive skew (0.80) makes normal VaR **over**state the risk.
  - Daily excess kurtosis matches the i.i.d. 1/h law at 5 days (0.31 vs 0.28).
  - It does **not** match at 21 days (0.61 vs 0.07). Month-scale returns are
    fatter-tailed than independent days allow, which points to slow regime shifts.
    It also matches the excess monthly and quarterly loss frequency in §2.
- GARCH(1,1) on the book: α 0.044, β 0.952, **persistence 0.997, half-life about 206 days**.
  - The book's volatility moves slowly, at regime scale, and clusters little day to day.
  - That is why vol targeting did nothing (E3). A slow target (λ 0.97 / 0.99 / 0.995)
    adds at most +0.04 Sharpe (E3b), which is noise, so it is rejected.
  - The risk to size for is **regime-level**: what the DD throttle and the L01 card 09
    regime split address, not daily vol.

### 3.7 The research programme itself (L02): `research_programme.py`

From the verdict register in `august analysis.md`: **38 directions decided, 4 accepted**,
a 10.5% pass rate (Range-Line/Fib Atlas, yield-spread z-reversion, touch motifs, this
book). None is live-confirmed in R.
- The implied base rate is about 7–12%.
- At a conventional 5% test size, about **44% of accepted edges would be false
  discoveries** (L02 §05).
- One independent confirmation, a lockbox or a live record, lifts P(real) to about 95%.
- (The Fib Atlas's live paper loss is consistent with that FDR. It is one of the four accepted edges.)

The **fade-at-the-lines family is at its L02 kill threshold**:
- 11 recorded failures and no success.
- Under the lesson's own prior, Beta(1.2, 10.8), the posterior success rate is 5.2%,
  and about 110 more attempts would be expected before a success.
- The family should stop unless a success is worth more than about 50× the cost of an
  attempt.
- Each failure *raises* the expected remaining search (the Lindy effect, L02 §03).

### 3.9 Live ↔ backtest parity of the Vote Atlas (L03 transfer coefficient): `live_parity.py`

The live bot's decision log (`v2_decision_log.json`, 2–22 Sep) can be matched trade by
trade against the backtest (`vp2.json`). A match means same pair, side, rung and
follow/fade, entered within 60 minutes.

| Period | Backtest trades | Live entries | Live took (recall) | Live entries not in backtest |
|---|---|---|---|---|
| 3–18 Sep | 316 | 236 | **48%** | **36%** |
| 3–14 Sep | 212 | 134 | 43% | 32% |
| 15–18 Sep | 104 | 102 | 59% | 40% |

- **The misses are not random.** The backtest trades live missed averaged **+0.221R**;
  the ones it took averaged **+0.051R** (t = 1.74). The live bot traded the weaker half.
- **Why missed:** for 116 of the 164 misses, the live bot logged *no event at all*.
  The signal never fired live, so this is not blocking.
  - 27 were the same pair taken with a different side, rung or follow/fade.
  - Fewer than 20 were blocks: spread, stack guard, currency gate, cooldown, broker
    rejects.
  - Where live and backtest both saw the same touch, 11% had the opposite follow/fade.
- **This matches the team's own 17–18 Sep finding** (`local_decision_engine/parity_test.mjs`
  header): a fresh OANDA re-fetch of the same window does *not* reproduce the archive's
  vote/margin, so live levels and votes differ from the backtest's.
  - The local decision engine and its corrected sync path went in on 18 Sep.
  - The v3 log overlaps the backtest on only one day (18 Sep), so it is too short to show
    whether the fix worked.
- Also on 18 Sep (v3): USDCHF was rejected with `spread 1.4p > max 0.0p`. A per-pair
  spread cap of 0.0 silently blocks the pair. **Check the live bot-config entry for
  USDCHF.** `pylego/costs.max_spread` uses a per-pair value as-is, so a blank field saved
  as 0 would do this. Left unchanged because it is a live setting.

**Why this matters more than P&L.** Until live takes the backtest's trades, no live P&L
says anything about the backtest's edge. Parity is not a statistical test: a correct
engine reproduces the trade list, so it needs **days of logs, not months**, and no
manual effort.
- Pass bar: **recall and precision ≥ 90%**.
- Then, and only then, compare cost per trade.

### 3.8 Lessons vs what is built: the code audit

Which of the lessons' methods exist in code, and whether they are applied to the books
we actually trade.

| Lesson method | In the repo | Applied to the live/headline books? | Gap |
|---|---|---|---|
| Sharpe SE, non-normal (L01 §03) | `js/metricsCore.js:108`, i.i.d.-normal only | pages show i.i.d. SE | no skew/kurtosis/autocorrelation on any page |
| PSR / MinTRL (L01 card 06) | `js/backtestStats.js:85`, `js/metricsCore.js:220` (correct) | yes | n = days with no autocorrelation adjustment; most callers use Gaussian defaults |
| Lo η(q) / HAC (L01 §03) | Newey-West Sharpe `metricsCore.js:146`; Lo η only offline (here) | side field only | HAC not fed into PSR/DSR/MinTRL |
| Deflated Sharpe (L01 card 05, L02 §05) | `js/backtestStats.js:110` (correct formula) | Fib Atlas: **N = 6 one-lever flips, per-trade series** (`fibAtlasVotePortfolio.js:660`); Range-line "DSR 100%": about 13 OAT neighbours | **N is never the real search size**; the day-pooled 124-trial audit exists but isn't wired in |
| Trial ledger (L02 §05 practice 02) | **absent**; only PREREG markdown | — | the reason DSR's N is always guessed |
| White RC / SPA / Romano-Wolf / BH (L01 card 05) | BH/Holm exist (`js/preregStats.js`, forge); RC/SPA/R-W **absent** | not on any config search | — |
| Purged CV / CSCV-PBO (L01 card 04) | embargo-only walk-forward in `js/mve/validation.js` (parked model); PBO **absent** until `overfitting_and_selection.py` here | — | — |
| Block bootstrap (L01 §04) | `js/statsCore.js:192` (stationary) | Fib Atlas calls `portfolioStats` with **`mc:false`** | no Politis-White block length anywhere |
| Holdout / lockbox / frozen expectation (L01 card 03) | `scripts/freeze_expectation.mjs`, holdout scripts | **no bot has an `expect_<bot>` artifact** (`js/botAuditEngine.js:390`); freeze refuses Fib Atlas (Sharpe 18 trips its plausibility guard) | no clean lockbox for any live book |
| Forward monitoring, power (L01 card 10) | live-in-cone percentile `botAuditEngine.js:428` | bot-audit page | **CUSUM / SPRT / power absent** until §3.6 here |
| Costs, capacity, fills (L01 card 11) | cost multiples, `js/fillRealismEngine.js:93`, Fib Atlas cost-torture scripts | partly | **market impact absent**; "capacity" chart is cost × multiple |
| Kelly / vol target / throttle (L01 §06) | throttle `fibAtlasVotePortfolio.js:514`, `pylego/drawdown_throttle.py`; `portfolioStats` volTarget | throttle **defaults off** on the headline page; volTarget scales by **full-sample** vol (look-ahead, display only) | — |
| GARCH / half-life (L03 §02) | `js/volForecast.js:49-50` **fixed, hand-set** α/β; grid MLE in `nasdaqTransforms.js:317` | forecaster | production GARCH not estimated |
| Jumps / EVT / Cornish-Fisher (L01 §04, L03 §03) | bipower jumps (`volatilityExhaustion/`), GPD `js/evtTail.js` (correct) | EVT tile on the atlas pages | Cornish-Fisher absent from code; EVT fitted on in-sample inflated books |
| Fundamental law (L03 §01) | offline only (here) | — | IC never measured on a book; `statsCore.js:157` rank-IC used only for macro |
| Meta-labelling (L03 §01) | offline E1 here; `bot/modules/ml_confidence.py` (gold, advisory) | not on any atlas/range-line book | — |
| Stress, correlation in stress (L01 card 09) | `js/bookStress.js:106` | runs on **market sleeves**, not strategy returns | — |

**The pattern.** The repo *has* most of the lessons' machinery as bricks, and most of
the formulas are right. They are applied loosely to the books that matter:
- trial counts are guessed;
- autocorrelation is ignored on the pages;
- the headline book's bootstrap is switched off;
- no live bot has a frozen expectation to be ranked against;
- nothing monitors for decay.

The rigorous versions exist only as offline scripts (this folder included). L03's own
point applies to the research platform too: **the layer that's missing is the
implementation layer (TC), not the forecasting skill (IC).**

*Correction logged:* the first version of `validate_book.py` dropped the ½SR² term from the
non-normal Sharpe variance (and the matching (γ₄−1)/4 term in the MinTRL/DSR
denominators). The audit caught it, it is fixed, and the numbers above are recomputed:
SE 0.419 → 0.427, MinTRL up 1–9 days. No conclusion changes.

## 4. The system: a Forecaster-style layered book (superseded by `VOTE_ATLAS_V4_PLAN.md`)

Each layer has one job, one test, and a pass bar written down *before* the test is run.

| Layer | Job | Our component | Test it must pass | Status |
|---|---|---|---|---|
| **L1 Data** | point-in-time inputs | M1 parquet, D1 bars, calendar | +1-day input lag doesn't change the result (L01 card 01); σ series = fit series | partial: σ-series mismatch open |
| **L2 Range forecast** | size of the day, p50/p75/p90 | forecast ladder (`forecastLadder.js`, `forge/vol.py`) | exceedance within ±2pp of 50/25/10 OOS and live; beat climatology on pinball loss | ✅ OOS. Add IV/σ (surface H5) as a width input next |
| **L3 Event / jump** | scheduled-jump adjustment | ladder event multipliers | null tag = ×1.0 (fixed); event-day split of book R pre-registered | ✅ bug fixed. Tier-1 fade dip (t −1.5) pre-registered |
| **L4 Primary signal** | follow / fade at a rung | level-atlas vote (`levelAtlasVoteReview.js`) | DSR with the *full* trial count from the ledger; OOS not contaminated by the hold-gate | ⚠ PBO 0.000 and a margin plateau within the 180-config family (§3.5), but: trial count never logged; holdsOOS uses the scored labels; ≈1.2 Sharpe of the headline is hindsight pair choice |
| **L5 Meta-label** | *whether* to take the trade | `layer_experiments.py` E1 → port to JS | walk-forward OOS: Sharpe@10% ≥ base and better at +1 pip slippage | candidate: 4.07 vs 3.92; 2.14 vs 1.65 at +1 pip |
| **L6 Sizing** | how much | fixed 0.5% risk; margin sizing (E2) | Kelly on the **shrunk, cost-stressed** edge; never above ½-Kelly | E2 candidate. Don't raise risk until L7 has data |
| **L7 Implementation (TC)** | fills, costs | bots + MT5 | live trades stored **in R** with their stop (`LIVE_BACKTEST_ALIGNMENT.md` §2.2); live slippage per pair measured; live R inside the frozen bootstrap band | ❌ **the gap**: live took only 48% of the backtest's trades, 3–18 Sep (§3.9); no live trade can be expressed in R today |
| **Risk management** | path / drawdown | graded DD throttle | bootstrap path-robustness (E6) | ✅ keep: cuts DD on 100% of paths. Book vol half-life about 206 days, so the risk is regime-level, not daily (§3.6) |
| **Monitoring** | is the edge still there? | none today (§3.8) | SPRT on per-trade R vs the frozen mean 0.071 (§3.6): kill at LLR ≥ 2.77, about 80 days if the edge is gone | ❌ build it on the frozen expectation of step 2 |

### Order of work (each step ends with a written pass/fail before the next starts)

1. **Close the TC gap (L7). Weeks, automated, no paper-trading marathon.**
   - **(a) Parity**, days: run `live_parity.py` on the v3 decision log after the 18 Sep
     engine fix. Pass at ≥ 90% recall and precision. If it fails, fix the live data/σ path
     (§3.2 item 2, the 18 Sep sync finding) before anything else.
   - **(b) Fill realism**, days, laptop with R2 M1: replay the book with spread at the
     time, a trade-through rule (not touch) and worst-case same-bar handling. If the edge
     dies here, stop.
   - **(c) Real cost**, 2–4 weeks of the bot running unattended at minimum size: store
     `sl`/`tp` at entry (`pylego/broker/mt5.py`) so every trade is in R, and measure
     slippage per pair. Costs vary far less than P&L, so a few hundred trades pin them
     down. Drop pairs whose cost is above their headroom (§2.1).
   - Then trade small and scale in steps, with the SPRT kill rule (§3.6) on automatically.
     The forward record builds itself; nobody watches it daily.
2. **Freeze and lock.**
   - Write today's config, trade list and bootstrap band to a frozen expectation file (`scripts/freeze_expectation.mjs` exists).
   - Treat everything after the freeze as the L01 card 03 lockbox. Look at it at fixed checkpoints only (L01 card 10, L02 §06).
3. **Start a trial ledger (L02 §05).**
   - Append every config compared on this history: overlays, thresholds, pairs, atlas dimensions.
   - The DSR uses the ledger's count, not a guessed N.
4. **Shadow the meta-label filter and margin sizing (L5/L6).**
   - Log what they *would* have done next to live.
   - Promote only if the shadow record beats base at the measured slippage.
5. **Pre-register the tier-1 fade hypothesis.** Fades on FOMC/NFP/CPI days earn less. Test it once on the lockbox.
6. **Pair selection by rule, not by eye.**
   - Replace the hand-curated 17 with the walk-forward rule from §3.5: keep a pair while its trailing t > 0.
   - Quote the book's Sharpe on that rule (5.69 on the uncapped family), not the hindsight 6.87.
7. **Stop the fade-at-the-lines family** (§3.7): 11 failures, posterior success rate 5.2%. Spend that effort on steps 1–3.
8. **Wire the SPRT monitor** (§3.6) into `bot-audit` against the frozen expectation.
9. **Re-run the fade/touch studies built on `/api/vol-forecast/backtest-range`.** Their bands were 2–8% too narrow before this fix.
10. **Forecasting-layer upgrade.**
   - Add IV/σ as a ladder-width input.
   - Fit on the same σ series the live path uses.
   - Pass bar: pinball loss and exceedance, OOS.
11. **Sizing, last.**
   - Full Kelly on the raw record is about 11.6× today's 0.5% risk (8× shrunk), and that headroom is real *only if* step 1 confirms costs.
   - At +1 pip slippage, Sharpe roughly halves. Kelly leverage (μ/σ² = S/σ) halves with it, and growth at a given leverage falls further.
   - Size at ≤ ½ Kelly on the slippage-adjusted, shrunk edge.

*Research and education only. Nothing here changes a live trading parameter.*
