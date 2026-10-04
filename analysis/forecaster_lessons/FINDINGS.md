# The Forecaster Portfolio lessons, applied to our own book

*Written 2026-10-04. Sources: `education/forecaster-portfolio-case-study/` Lessons 01–03,
the Level-Atlas vote portfolio v2 record (`vp2.json`, 2022-04-14 → 2026-09-18, 1,132
days, 23,619 trades), the forecast research (`vfr.json`, `MD files/VOL_LADDER_NOTES.md`),
and the fade / continuation / surface research docs. Every number below comes from
the three scripts in this folder, and each one re-runs in a few seconds.*

```
python3 analysis/forecaster_lessons/validate_book.py     vp2.json --json validate_book.out.json
python3 analysis/forecaster_lessons/layer_experiments.py vp2.json --json layer_experiments.out.json
python3 analysis/forecaster_lessons/event_days.py        vp2.json calendar_events.csv --json event_days.out.json
```

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

## 2. Our book through that lens

| Check (L01 §05 card) | Result | Verdict |
|---|---|---|
| Sharpe ± SE (non-normal, Opdyke) | **3.95 ± 0.42**, 95% CI 3.13–4.77, PSR ≈ 1 | strong *as a backtest* |
| Lo η(q), 1 / 5 / 10 / 20 lags | 3.61 / 3.17 / 2.99 / 2.86 | the √252 rule overstates it. ACF1 = +0.098, so n_eff ≈ 930 of 1,132 |
| Bayesian shrinkage (prior 1.0, τ 1.0 / 0.5) | 3.51 / **2.73** | plan on about 2.7, not 4 |
| Deflated Sharpe | ≥ 0.95 even at N = 1,000 trials (trial-Sharpe SD 1.0) | survives search breadth *if* the costs hold |
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

The sibling Fib Atlas went from backtest Sharpe 18 to **−$13.7k on 101 live paper
trades** (`MD files/FIB_ATLAS_BACKTEST_VS_LIVE.md`): win rate 85.7% → 39.6%, median
win 8.2 → 3.5 pips. Its causes are spread, touch ≠ fill, and same-bar barrier
ambiguity. All three apply to this book. In fundamental-law terms, **our IC and
breadth are fine and our TC is unmeasured.** L03 says that is where a layered
system loses its information ratio.

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

## 4. The system: a Forecaster-style layered book

Each layer has one job, one test, and a pass bar written down *before* the test is run.

| Layer | Job | Our component | Test it must pass | Status |
|---|---|---|---|---|
| **L1 Data** | point-in-time inputs | M1 parquet, D1 bars, calendar | +1-day input lag doesn't change the result (L01 card 01); σ series = fit series | partial: σ-series mismatch open |
| **L2 Range forecast** | size of the day, p50/p75/p90 | forecast ladder (`forecastLadder.js`, `forge/vol.py`) | exceedance within ±2pp of 50/25/10 OOS and live; beat climatology on pinball loss | ✅ OOS. Add IV/σ (surface H5) as a width input next |
| **L3 Event / jump** | scheduled-jump adjustment | ladder event multipliers | null tag = ×1.0 (fixed); event-day split of book R pre-registered | ✅ bug fixed. Tier-1 fade dip (t −1.5) pre-registered |
| **L4 Primary signal** | follow / fade at a rung | level-atlas vote (`levelAtlasVoteReview.js`) | DSR with the *full* trial count from the ledger; OOS not contaminated by the hold-gate | ⚠ trial count never logged; holdsOOS uses the scored labels |
| **L5 Meta-label** | *whether* to take the trade | `layer_experiments.py` E1 → port to JS | walk-forward OOS: Sharpe@10% ≥ base and better at +1 pip slippage | candidate: 4.07 vs 3.92; 2.14 vs 1.65 at +1 pip |
| **L6 Sizing** | how much | fixed 0.5% risk; margin sizing (E2) | Kelly on the **shrunk, cost-stressed** edge; never above ½-Kelly | E2 candidate. Don't raise risk until L7 has data |
| **L7 Implementation (TC)** | fills, costs | bots + MT5 | live trades stored **in R** with their stop (`LIVE_BACKTEST_ALIGNMENT.md` §2.2); live slippage per pair measured; live R inside the frozen bootstrap band | ❌ **the gap**: no live trade can be expressed in R today |
| **Risk management** | path / drawdown | graded DD throttle | bootstrap path-robustness (E6) | ✅ keep: cuts DD on 100% of paths |

### Order of work (each step ends with a written pass/fail before the next starts)

1. **Close the TC gap (L7).**
   - Store `sl`/`tp` at entry in `pylego/broker/mt5.py` so every live trade becomes an R record.
   - Then measure realised slippage per pair against the backtest's touch price.
   - This single number decides whether the book is a 4-Sharpe system or a 0-Sharpe one (§2.1).
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
6. **Re-run the fade/touch studies built on `/api/vol-forecast/backtest-range`.** Their bands were 2–8% too narrow before this fix.
7. **Forecasting-layer upgrade.**
   - Add IV/σ as a ladder-width input.
   - Fit on the same σ series the live path uses.
   - Pass bar: pinball loss and exceedance, OOS.
8. **Sizing, last.**
   - Full Kelly on the raw record is about 11.6× today's 0.5% risk (8× shrunk), and that headroom is real *only if* step 1 confirms costs.
   - At +1 pip slippage, Sharpe roughly halves. Kelly leverage (μ/σ² = S/σ) halves with it, and growth at a given leverage falls further.
   - Size at ≤ ½ Kelly on the slippage-adjusted, shrunk edge.

*Research and education only. Nothing here changes a live trading parameter.*
