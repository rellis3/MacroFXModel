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

## Part 2 — take the trade and hold it (added 2026-11-14)

Owner: "what would improve the bias so we can take the trade and hold?" Today's exploratory runs set the floor:
- **`max-bias-reverse`**: Max's daily side = the 4h EMA20 slope on 84% of instrument-days.
- **`h4-trend-hold`**: the 4h rule from 07:00 loses (day −0.04R, holding overnight −0.11R a trade, before the lockbox
  date). Max beats it on his own days with the same side, so his edge is selection, timing and exits, not direction.
  His profit came from a few multi-day swings and post-data days.
- **`macro-h4-blend`**: macro and the 4h trend agree only 48% of the time; every blend about flat over 22 days.

What the book says about holding:
- **Continuation inside a day is validated, as range:**
  - `band-reach-from-here`: reaching the median band early raises the odds of the 75th.
  - `fast-start-rest-of-day`, `line-touch-reach`, `extreme-in-probability`.
  - `rule-a-portfolio-second-book` (rich-day break) is a separate return source.
- **Multi-day drift is validated in one place:** `post-fomc-usd-drift` (dollar, 5 sessions, FRAGILE), plus
  `cot-crowding-p5` (4 weeks, futures).
- **Monthly FX momentum, carry and surprise:** UNDERPOWERED (`fx-factor-*`).
- **Lesson #27:** a management rule (hold, trail, partials) cannot create edge on an entry with none; test it on
  random entries first.

So "hold" needs a reason that arrives after entry: the day confirming the view, an event that keeps paying, or a
regime where trends last.

### Q6. What does day one look like for trades that go on to run for days? — score 13/15

> Take every day an instrument closed ≥ k·σ in one direction. Map the next one to five days against how that day
> closed (at its extreme or not), how fast it got there, how much of its band it used, and whether a tier-1 release or
> a macro view was behind it. Read where continuation lives, against same-size days that closed mid-range.

| | |
|---|---|
| Construct | day-1 features at 21:00 London: open→close / σ, close location in the day's range, time to reach the p50 band, band used, event tier, desk/Global Read side if any |
| Knowable when | 21:00 London on day 1 (the review time); outcome from 21:00 to day +1…+5 21:00 |
| Condition | close in the outer 10% vs the middle of the range; fast vs slow start; event vs no event; σ regime |
| Horizons | +1, +2, +3, +5 days |
| Noise threshold | same-size days with a mid-range close; shifted-date placebo |
| Outcome distribution | signed move / σ, MAE/MFE paths, share of holds reaching +1R before −1R |
| Benchmark / control / mirror | B0 drift; the opposite close location (a big day that faded into the close) |
| Mechanism | slow-moving money and repositioning after information; close-location value is the classic "who won the day" read |
| Builds on | `band-reach-from-here`, `fast-start-rest-of-day`, `extreme-in-probability` (validated, intraday range); `h4-trend-hold` (the plain hold loses) |
| Data & power | M1 2016→2026-08-21, ~2,500 days × 13 instruments; thousands of ≥1σ days; powered for ~0.05σ at +1 day. Laptop run |
| If yes → | the 21:00 review gets a rule: hold only when day one confirmed (closed strong in the bias direction) |
| If no → | holding overnight is not supported; trade the day and re-enter |
| Falsifier | outer-close days continue no more than mid-close days at any horizon |

### Q7. Which exit turns the same entries into the most R? — score 12/15

> Fix the entries (desk side, the blend, Max's sides, and random entries as the control). Map each one's MFE/MAE path
> over five days first, then compare exits: 21:00 close, hold while the bias holds, trail behind the prior day's low or
> high, a fixed N-day time stop, half off at 1R with the rest trailed.

| | |
|---|---|
| Construct | per-entry paths in R; exit rules applied to the same paths |
| Knowable when | each rule uses only bars closed by its decision time |
| Condition | entry source; event vs no event; σ regime |
| Horizons | up to 5 days |
| Noise threshold | random entries with the same instrument, day and side mix (lesson #27: zero edge → every exit ≈ 0R) |
| Outcome distribution | R per trade, win rate, payoff ratio, tail share (how much P&L the top 10% of trades make) |
| Benchmark / control / mirror | the random-entry control; Max's own exits on his trades |
| Mechanism | exits reshape the distribution; they only add mean when the entry already has drift (trend) |
| Builds on | `h4-trend-hold` (the hold rule loses), `noise-area-momentum-stop` (UNDERPOWERED, trailing stop), Max management claims (intake note claim 8) |
| Data & power | history for the rule-based entries (laptop); Max and desk entries forward only |
| If yes → | the copier and the desk card get a named exit rule |
| If no → | keep a 21:00 close: holding adds risk, not return |
| Falsifier | the best exit beats the 21:00 close by no more than it does on random entries |

### Q8. Does the event carry the hold? (extends Q2 to the next release) — score 11/15

> After a tier-1 US surprise, hold in the surprise direction until the next tier-1 release instead of to 21:00. Sweep
> the hold from one to five days. Read whether the post-FOMC dollar drift generalises to CPI, NFP and PPI, and where it
> stops paying.

| | |
|---|---|
| Construct | the Q2 event table (`post-release-drift-pooled`) with longer exits |
| Knowable when | release + 15 min |
| Condition | surprise size tercile; data and market surprise agree; family |
| Horizons | +1, +2, +3, +5 days, and "to the next tier-1 release" |
| Noise threshold | Q2's placebo and random sign |
| Outcome distribution | R per event at a fixed σ stop; MAE/MFE |
| Benchmark / control / mirror | Q2's 21:00 result; `post-fomc-usd-drift` |
| Mechanism | information absorbed over days (the FOMC drift is the validated case) |
| Builds on | `post-fomc-usd-drift` (VALIDATED, FRAGILE), `rate-surprise-*` (UNDERPOWERED), `fed-two-moves` (CONTEXT: the first move unwinds) |
| Data & power | the same as Q2; +5 days underpowered by design |
| If yes → | post-data days become the desk's hold days |
| If no → | event days are day trades only |
| Falsifier | no family holds a drift past next morning |

### Q9. Do trends last longer in some regimes? — score 10/15

> Name the regimes first: σ rising vs falling against its own year, the VIX curve inverted, the dollar's 20-day trend
> strong, COT state D. Then read whether a multi-day hold in the bias direction pays in one regime and dies in the rest.

| | |
|---|---|
| Construct | regime flags known at entry; the Q6/Q7 hold outcomes split by regime |
| Knowable when | morning or 21:00 review |
| Condition | the four regimes, fixed before looking |
| Horizons | +1 to +5 days |
| Noise threshold | shifted regime labels |
| Outcome distribution | hold R by regime |
| Benchmark / control / mirror | all days |
| Mechanism | trends persist when vol is expanding and positioning is one-sided |
| Builds on | `vix-inversion`, `forecast-miss-shock-*`, `cot-crowding-p5`, `stress-filter-hold` (stress adds nothing beyond vol sizing) |
| Data & power | as Q6; each regime cuts n by 3 to 5 times; the family is multiplicity-heavy |
| If yes → | a "hold allowed" flag on the card |
| If no → | no regime gate |
| Falsifier | hold R inside the shifted-label band in every regime |

### Q10. When the macro view and the slow trend agree, is that the swing? — score 9/15

> Macro and the 4h trend disagree half the time. Test agreement on a slower clock: the macro view against the
> 20-day trend. Read whether agreeing days, held three to ten days, carry more than either alone. Max's big swings
> look like this, but there are only two of them.

| | |
|---|---|
| Construct | desk / Global Read side × sign of the 20-day return |
| Knowable when | morning |
| Condition | agree vs disagree vs no view |
| Horizons | 3, 5, 10 days |
| Noise threshold | coin with the same activity |
| Outcome distribution | R per hold |
| Benchmark / control / mirror | 20-day trend alone; macro alone |
| Mechanism | macro supplies the reason, the slow trend says the market agrees |
| Builds on | `macro-h4-blend` (48% agreement on the 4h clock), `fx-factor-momentum` (UNDERPOWERED) |
| Data & power | macro history from 2026-10-14 (Global Read) and 2026-11-03 (desk) only: **forward record** (a bias-scoreboard d5 cell) |
| If yes → | the swing tag on the card |
| If no → | swings are Max's discretion, not a rule |
| Falsifier | agreeing days no better than either input alone at 120 forward days |

### Ranking note
Q6 and Q7 come first: answerable on history, and each "no" also changes the desk (no overnight holds; 21:00 close).
Q8 rides on Q2's run. Q9 waits on Q6. Q10 is forward only.

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
