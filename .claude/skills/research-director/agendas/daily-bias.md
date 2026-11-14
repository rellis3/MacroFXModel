# Agenda: the daily bias (up, down or range) per instrument

Set 2026-11-13 by research-director. Owner's question: "from all the theory, research and what Max does, how do we build a
better bias than FundaBias / Max's private dashboard / our desk score?" Inputs:
- Max Cole's 40 lives: `education/intake/informational/colez-trades/2026-11-13-max-cole-daily-lives-bias.md`
- the Evidence Book; direction-bar Phase 0; the desk-score record

Theme keywords for `evidence_map.mjs`: `direction surprise bias regime range carry momentum positioning`. The paper shelf
was not read (no `RESEARCH_READ_TOKEN` in this session). Hand chosen cards to `research-protocol`.

## The map (what the floor is)

- **Direction is the hard half.** The book: macro direction 0 of 82 validated, price direction 13 of 76.
- **What direction needs to show** (direction-bar Phase 0, CONTEXT): to be detectable at 1 day, a direction cell must
  beat its own base rate by about 0.13σ (about 6pp of hit rate); at 20 days by about 0.6σ.
- **Monthly FX factors are all UNDERPOWERED, not NULL.** `fx-factor-carry` IC +0.079 [−0.03, +0.19]; `fx-factor-surprise`
  +0.075 [−0.04, +0.19]; `fx-factor-momentum` −0.045; the `fx-factor-stack` blend Sharpe +0.05. Carry and surprise sit in
  the published range but the intervals hold zero. Both are on the forward direction ledger.
- **Event direction, mostly null or underpowered:**
  - `rate-surprise-eurusd` / `-nq`: UNDERPOWERED (post-release direction after FOMC/CPI/NFP).
  - `priced-in-direction` and `news-asymmetry`: NULL.
  - `fomc-leadup-surprise-table` and `fed-two-moves`: CONTEXT (first move then partial unwind).
- **The only validated FX direction effect:** `positioning-into-release-direction`, +0.064 ATR against a crowded
  leveraged-fund position on release days [+0.019, +0.111]; 6/6 pairs; survives a trend control; tiny, about 3–4 EURUSD
  pips before cost. Also `cot-crowding-p5` (state D, 4-week) VALIDATED on futures outside the G10 FX core.
- **Rates spreads as daily direction:** NULL (`cog-spread-direction`, `rate-diff-nq-leadlag`).
- **Range is the easy half:** 41 validated regime/range entries. Among them:
  - IV forecasts realised (`iv-forecast`); `vol-curve-front`, `vix-inversion`, `iv-over-rv-wider`
  - gamma sign widens/narrows the index day (`gex-range-es`, after IV mostly absorbed: `gex-range-iv`)
  - event size (`event-impact-map`, `surprise-size`); `fast-start-rest-of-day`, `tape-speed-persistence`
  - month-end and stress misses (`forecast-miss-*`)
  - `extreme-in-probability`
- **The desk's own morning ratings** (desk-score record, interim, not judged): 5 eligible days, S −0.25, vs drift −0.49.
- **Max** (a seller's self-report plus our five-week copy):
  - FundaBias sign, dampened; USD-first; flat before tier-1 US data, trade the surprise after; carry forward; neutral on
    30–50% of days.
  - Our scored copy: +8.3R over 122 fills, all of it from a few swings and post-data days.

**Reading.** Nobody here, and probably not FundaBias either, has a validated day-by-day direction call. The edge
available to us is in three places, in this order:
1. knowing which days will **range vs expand** (validated)
2. **conditioning direction on events and positioning**, where the mechanism is real (one small validated cell, several
   underpowered)
3. **abstaining** when neither speaks

Max's routine already has that shape (neutral before news, trade after, stand aside 30–50% of days); his secret sauce
is probably mostly abstention plus the post-data days.

## Design principle (not a question; the frame the cards fill)

The bias becomes three outputs per instrument per morning, each a probability, each scored separately in the forward
ledger against its base rate. The LLM desk becomes the explainer of these numbers, not their source.

| Output | Question it answers | Built from |
|---|---|---|
| **Day type** | range day or expansion day? | validated vol inputs (Q1) |
| **Direction** | P(up) − B0, or "no view" | USD factor + event state + positioning + slow priors (Q2, Q3) |
| **Stand aside** | is either output strong enough to act on? | thresholds fixed in the prereg (Q5) |

## Cards, in rank order

### Q1. Can we call range days vs expansion days before London opens? — score 13/15

> Build a morning "expansion probability" from what already forecasts range (IV vs RV, the VIX curve, gamma sign,
> the day's event size, month-end, stress, yesterday's speed). Label each day by what it did: did it close near an
> extreme and travel ≥ k·σ open→close, or rotate inside its lines? Sweep k and read the hit rate and calibration by
> decile, against the σ-only forecast and the base rate.

| | |
|---|---|
| Construct | P(expansion) from the shipped σ inputs, adding only validated range variables. Label = \|open→21:00 close\|/σ_day ≥ k AND close in the outer 20% of the day's range; "range day" = neither |
| Knowable when | all inputs public before 07:00 UK; outcome scored 07:00→21:00 UK |
| Condition | instrument family (FX majors, gold, indices); event day vs not |
| Horizons | London session, full day, next day |
| Noise threshold | shifted-date placebo of the same score; label-permutation spread |
| Outcome distribution | hit rate and Brier by decile of P(expansion); share of the day's open→close move earned on expansion-called days |
| Benchmark / control / mirror | B0 = unconditional expansion share; σ-only forecast (does the classifier add to "big σ means big move"?) |
| Mechanism | dealer gamma, implied-vol information and scheduled flow decide whether price is absorbed or released (validated for range) |
| Builds on | `iv-forecast`, `vol-curve-front`, `gex-range-es` / `gex-range-iv`, `event-impact-map`, `surprise-size`, `fast-start-rest-of-day`, `forecast-miss-month-end-fx`, `extreme-in-probability` |
| Data & power | M1 2006→2026-08-21 (lockbox), ~5,000 days per instrument; powered for a few pp of hit rate |
| If yes → | the morning card gets a range/expansion line; range days route to the validated range-edge tools, expansion days to direction |
| If no → | "range day" stays a σ statement; no third bias state |
| Falsifier | no decile of P(expansion) beats the σ-only forecast on Brier out of sample |

### Q2. After a tier-1 US release, which way and for how long? (Max's best days) — score 12/15

> At each CPI, NFP, PPI and FOMC, take the sign of the data surprise and of the first 15-minute move in the 2y and the
> dollar. Hold in that direction on gold, EURUSD, GBPUSD, USDJPY and NQ from +15 min to +1h, to 21:00, to the next
> morning and to +3 days. Pool the family so the power is there, and read where the drift lives and where it unwinds.

| | |
|---|---|
| Construct | surprise sign (actual − consensus, standardised) and the market surprise (2y move in the release window); USD basket sign |
| Knowable when | release + 15 min (enter after the jump, as Max does) |
| Condition | surprise size tercile; agreement of data and market surprise; crowded positioning into the release (`positioning-into-release-direction`) |
| Horizons | +1h, 21:00 UK, next 07:00, +3 days |
| Noise threshold | same-time placebo on non-release days; random-sign within event |
| Outcome distribution | R per event at a fixed σ stop, MAE/MFE paths, share of events positive |
| Benchmark / control / mirror | B0 drift; the opposite sign; non-US releases as mirror |
| Mechanism | slow-moving real money rebalancing after information that the fast first move only partly prices; literature finds the jump mostly immediate (Andersen, Bollerslev, Diebold & Vega 2003), so a drift needs to be shown, not assumed |
| Builds on | `rate-surprise-eurusd` / `-nq` UNDERPOWERED (single-asset); `fed-two-moves` CONTEXT (first move unwinds); `news-asymmetry` NULL |
| Data & power | calendar store with US actuals 2015-11→; ~400 tier-1 events × 5 instruments pooled; powered for about 0.1R |
| If yes → | the "trade the surprise" rule enters the direction output with a decay; Signal Copier swings-only test gets a mechanism |
| If no → | Max's post-data days are luck or his entry; we stop saying "trade the surprise" |
| Falsifier | pooled post +15 min drift CI includes 0 at every horizon |

### Q3. Is the bias one dollar call or many pair calls? — score 11/15

> Split each morning's desk ratings into one US-dollar call plus each pair's own residual. Score the dollar call on
> the dollar basket and the residuals on pair-minus-basket, over 21:00 and the next day. Read whether the desk's
> direction lives in the dollar part, the residual part, or neither, and how often its pair calls contradict its own
> dollar view.

| | |
|---|---|
| Construct | the first principal component of the desk's FX ratings (≈ USD), pair residuals; incoherence count (e.g. strong-USD view expressed as USDJPY short) |
| Knowable when | desk run time (morning) |
| Condition | event day vs not; desk conviction |
| Horizons | 21:00 UK, next 07:00, +5 days |
| Noise threshold | shuffled-day placebo of the same ratings |
| Outcome distribution | hit rate and σ-move of each part vs B0 |
| Benchmark / control / mirror | B0; random coherent dollar calls |
| Mechanism | the dollar factor carries most of the common variation in USD crosses (Lustig, Roussanov & Verdelhan 2011; Verdelhan 2018); Max: "90% of fundamentals is the US dollar" |
| Builds on | desk-score record (interim); `fx-factor-stack` beta to the dollar basket |
| Data & power | desk runs from 2026-11-03 only: forward record; descriptive now, judge at about 60 days |
| If yes → | the desk makes one USD call first and derives the pairs from it (fewer, coherent bets) |
| If no → | pair-level ratings stay; incoherence becomes a desk-quality check |
| Falsifier | neither part beats shuffled days at 60 days |

### Q4. A forward scoreboard of bias makers — score 11/15 (a build, not a study)

> Every morning, record each forecaster's side and conviction per instrument, then score them all 07:00→21:00 and to
> the next morning against B0, with "no view" allowed. Forecasters:
> - the desk ratings
> - Max's posted sides (Signal Copier)
> - the surprise rule (Q2)
> - carry and TSMOM priors (already on the direction ledger)
> - FundaBias, if its readings can be recorded within its terms

| | |
|---|---|
| Construct | ledger rows: date, instrument, forecaster, P(up) or side, conviction, stood-aside flag |
| Knowable when | each forecaster's own publication time |
| Condition | conviction bucket; stood-aside vs spoke |
| Horizons | 21:00, next 07:00, +5 days |
| Noise threshold | B0 and a coin with the same activity rate |
| Outcome distribution | Brier, hit rate when speaking, coverage, R at fixed σ risk |
| Benchmark / control / mirror | B0; each forecaster vs the others on shared days |
| Mechanism | none needed: measurement |
| Builds on | `direction-bar` forward ledger (A2), desk-score, Signal Copier outcomes |
| Data & power | starts now; judge at 60 shared days (about February 2027) |
| If yes → | a weighted blend of what scores (stacking) becomes the direction output |
| If no → | we know nobody's daily call is worth copying, Max included |
| Falsifier | n/a (instrument) |

### Q5. Does standing aside make the bias better? — score 10/15

> For each forecaster, rank its days by conviction and drop the weakest 30%, 50% and 70%. Read whether the hit rate
> and R on the days kept rise above B0 by more than shuffled drops would give.

| | |
|---|---|
| Construct | conviction-ranked abstention curves |
| Knowable when | morning |
| Condition | event-day state (Max's "neutral before data") |
| Horizons | as Q4 |
| Noise threshold | random abstention at the same rates |
| Outcome distribution | accuracy-coverage curve |
| Benchmark / control / mirror | random abstention; B0 |
| Mechanism | conviction reflects information; Max's claim that 30–50% of days are "no bias" |
| Builds on | Q4 data; historically on the Q1/Q2 scores |
| Data & power | historical for Q1/Q2 now; forward for the desk and Max |
| If yes → | the morning card says "no bias today" on the weak days instead of forcing a call |
| If no → | conviction is decoration; drop it from sizing |
| Falsifier | accuracy-coverage curve inside the random-abstention band |

## Parked

- **Slow priors as daily direction** (carry, time-series momentum, 1–12 months: Moskowitz, Ooi & Pedersen 2012;
  Lustig et al. 2011). Already UNDERPOWERED at a monthly step; they only enter as a weak tilt via the ledger. Re-open
  when the ledger has its forward counts.
- **Intraday momentum direction** (the first half hour predicts the last: Gao, Han, Li & Zhou 2018, equity index). We
  hold the range version (`fast-start-rest-of-day`); the direction version is a family of seen-data cuts. Run only as a
  split-sample mirror (FX vs index).
- **Pre-FOMC drift** (Lucca & Moench 2015) on NQ/ES: cheap, but known to have faded after publication. Carded only if
  Q2 is run (same event table).
- **FundaBias history**: we can't backtest a vendor score we do not hold. Forward only (Q4), and only within its terms of use.

## Owner calls

(none yet)
