# Direction research programme

*2026-10-26. Written in answer to the owner's question: "what would you do, from nothing, to use institutional and
financial knowledge to predict directional moves better than a coin flip, across all our pairs?" It builds on a ChatGPT
proposal (momentum, order flow, cross-asset, regimes, barrier targets, probability models) and checks each part against
what this repo has already tested. Companion study: `analysis/output/direction-baseline-audit/RESULTS.md`.*

## The short answer

Yes, but only in narrow, mechanical windows, and only by a few percentage points. Never as a daily call on every pair.

The repo's own record of 256 banked tests says this already, and today's audit confirms it on fresh ground:

- **Size is predictable almost everywhere.** 24 volatility findings are validated, and in today's audit trailing σ
  ranks the size of the next move in all 40 instrument × horizon cells.
- **Direction from indicators is not.** Momentum, trend filters, VWAP, RSI, WaveTrend, yields, macro confluence,
  meta-labelling and barrier targets all came back null. Today's 1,200-cell momentum/reversal grid is no better than a
  shuffled-returns placebo.
- **The direction findings that did survive share one feature.** Each sits where an identifiable group of participants
  is *forced* or *predictable*: a calendar flow, a crowded book unwinding, vol sellers re-hedging. None is an indicator.

So the "institutional knowledge" angle is the right one, but the knowledge that pays isn't "what does a macro desk
think". It's **who has to trade, when, and why they can't wait**. Every new study below starts from a named flow
mechanism.

## What ChatGPT proposed against what this repo already knows

| ChatGPT idea | Repo evidence | Verdict |
|---|---|---|
| A. Time-series momentum | `trend-following-fx` null (independent rebuild); `fx-factor-book-v2` trend −0.16 Sharpe OOS; `cot-trend-filter`: the trend system ran Sharpe 0.10 after 2016 against 0.49 before; today's audit: momentum cells below placebo | **closed on FX at 1–60 sessions.** Multi-asset trend is modest (~0.3) |
| A. "momentum in strong trends" | today's audit: strong-trend days are *worse* for momentum (−5.8pp hit excess at 60 sessions), and the placebo says even that is noise | **closed** |
| B. Order flow / OFI / CVD | `failed-auction-volume` registered, NT8 tick data on the laptop; nothing scored yet | **open: the strongest untested short-horizon lead, but it needs the laptop data** |
| C. Cross-asset (yields → NQ / FX) | `yields-to-fx-direction` null ("real only in the same bar"); `stir-composite-nq`, `rates-residual-catchup`, `yield-ladder-*` null or underpowered; `credit-leads-equities` null | **closed for yields as a lead.** The one survivor is vol-of-vol: `vix-beta-change`, `vix-second-derivative` (NQ, research only) |
| D. FX direction × magnitude decomposition | the magnitude half is solved (the vol stack); the direction half is everything in this table | effectively done: magnitude yes, direction no |
| "Predict conditions, not direction" | this is what the repo already does: range ladders, tape speed, reversal hour, extreme-in probability | **agreed; already the house edge** |
| Priority 1: structural levels, sweeps, acceptance | the Range / Fade-Continue Book family (33 studies), `live-range-confluence-book`, `directional-rescore`, `cog-setups-direction`: mostly null on direction; the geometry (distance from the running extreme × clock) predicts exhaustion | **closed for direction at levels**; geometry is the useful part |
| Priority 4: regime-switching models | `direction-vote-at-lines` context only; today's audit: vol-high / vol-low splits move nothing | closed for price-only regimes |
| Priority 5: options / OI / GEX | `gex-range-es` validated for **range**; `oi-max-pain`, `wall-placebo` null; `opex-cycle-range` underpowered; the Cboe full-chain archive only began 2026-10-19 | open as a forward record only |
| Test C: barrier targets | today's audit: NQ up-first 53.5% (±1σ / 5 sessions) = the drift, unchanged by trend; `meta-label-proper` (AFML triple barrier) null | **closed** |
| Probability model / calibration | right discipline. The vol ladders are already calibrated (`ladder-calibration` validated) | adopt for any new direction cell |

ChatGPT's closing question, which kind of test keeps coming back a coin flip, has an answer in this repo: **all four**
(next candle, fixed horizon, barrier outcome, macro → direction). That doesn't point to one broken method. It is the
finding.

## What did survive, and the mechanism behind each

| Evidence id | Result | The forced or predictable flow |
|---|---|---|
| `post-fomc-usd-drift` | dollar +26bp over 5 sessions after an FOMC, 65% vs 49%, both halves, placebo 99.8th pct | post-meeting repositioning by reserve managers and real-money accounts; recognised in the literature |
| `positioning-into-release-direction` | +0.064 ATR against a crowded leveraged book on release days, 6 of 6 pairs | crowded spec books forced to cut when news hits |
| `cot-crowding-p5` (state D) | crowded-trend pullback while the crowd is leaving → trend resumes, +0.27σ over 4 weeks, holdout markets | a positioning reset: weak hands out, trend holders stay |
| `vix-beta-change`, `vix-second-derivative` | VIX reacting much harder than usual against Nasdaq → NQ +0.76% over 5 sessions vs +0.33% | vol sellers and dealers re-hedging after a vol shock, then the mean reversion of vol |
| `reversal-hour` | 20:00–22:00 UTC moves revert; session-open moves persist | liquidity providers flattening into the NY close |
| carry (`rate-diff-xsmom` control) | rank by rate level: +5.0%/yr, Sharpe 0.54, 1976–2014 | compensation for crash risk: carry is paid to whoever holds the risk |

Two things to notice. First, the edges are small: 0.06 of a day's range, or 65% against 49%. Second, none of them is
an every-day call. They switch on for a few days a month at most.

## The programme

Each study is a separate register row and prereg (`research-protocol` skill), scored on all pairs where the mechanism
applies, with a placebo through the same pipeline and the base rate stated first. They're ranked by
(expected size × power) ÷ data effort.

### P1. Central-bank post-meeting drift: the FOMC result generalised (untested, data on disk)

- **Mechanism.** The same post-meeting repositioning as the validated FOMC drift should follow ECB, BoE, BoJ, RBA,
  RBNZ, BoC and SNB decisions, in that currency.
- **Test.** Own currency against USD, sessions D+1..D+5 after each decision. One pooled event family (≈ 8 meetings ×
  7 banks × 10 years ≈ 550 events) plus per-bank cells. Sign registered in advance: does the post-meeting drift follow
  the D0 move (continuation) or carry a fixed sign like the FOMC dollar drift? Pick one before looking. The placebo is
  non-meeting 5-session windows.
- **Data.** `calendar_events.csv` covers only USD, EUR and GBP: 104 ECB and 113 BoE decisions, 2014–2026-07, which
  is enough for a first ECB + BoE cell. BoJ, RBA, RBNZ, BoC and SNB dates need the ForexFactory history
  (`forge/ff_calendar.py` reads `data/calendar/ff_calendar_2007_2025.csv`, which isn't in this checkout) or a
  hand-built list from each bank's published meeting calendar. Held-out confirmation on 2008–2013 (FF) or the lockbox
  tail.
- **Why first.** It is the only direction family in the repo with a validated member, and pooling gives it power
  where single banks never will.

### P2. Pre-FOMC equity drift (untested)

- **Mechanism.** Lucca & Moench (2015): US equities earned a large share of their excess return in the 24 hours before
  scheduled FOMC announcements. A known flow and a known window.
- **Test.** NQ and SPX, from the close two sessions before the announcement to 14:00 ET on the day, against matched
  non-FOMC windows. Report the base rate (NQ up 56% on any day) first. Literature says the effect weakened after 2015;
  register both "still there" and "gone" as live outcomes.
- **Data.** Index M1 (local cache) or NY-close daily for a first pass; FOMC dates are already in the FOMC drift test.

### P3. FX month-end hedge rebalancing at the London 4pm fix (untested in FX)

- **Mechanism.** Melvin & Prins (2015): foreign holders of US equities rebalance their currency hedges at month-end.
  When US stocks outperformed in the month, they sell USD into the WM/R 4pm fix on the last business day. The banked
  `month-end-rebalance` null was about *equities*, not this FX flow.
- **Test.** Signal = US equity return minus a rest-of-world index over the month to date, known by day T−3. Outcome =
  USD over 15:00–16:00 London on the last business day, plus the reversal after the fix. Pooled across the USD majors,
  date-clustered.
- **Data.** FX M1 (laptop or R2 cache). Not possible on daily closes.

### P4. Carry with a crash filter built from the vol stack (joins the repo's two strengths)

- **Mechanism.** Carry pays as a crash-risk premium. The repo forecasts vol well. Question: does a validated vol
  forecast (IV/RV, VIX term, `drawdown-forecast-error`) predict *when* carry crashes?
- **Test.** G10 cross-sectional carry, monthly, 1976+ on FRED rates (the `rate-diff-xsmom` code already builds it),
  with and without a vol-state gate fixed in advance. Power is the reason `fx-factor-book-v2` was unjudgeable: 7 crosses
  over 5.7 years gives a Sharpe SE of 0.41. A 50-year, 9-currency panel is the only way to judge a +0.2 Sharpe overlay.
- **Honest prior.** The overlay may be underpowered even then. Write the MDE first, and expect `UNDERPOWERED` as a live
  outcome.

### P5. Finish the leads already in flight (don't duplicate them)

- `positioning-into-release`: the registered confirmation on 2008–2017.
- `cot-crowding-p5` state D: the forward record.
- `vix-beta-change` / `vix-second-derivative`: a costed NQ rule plus a forward record.
- `hedging-state-forward`, `vix-signals-forward`: forward records already logging; judge on their dates.

These are the best direction evidence the repo has. Converting one of them into a forward-proven rule is worth more
than any new idea below.

### P6. NQ order flow (ChatGPT's section B), on real tick data only

- `failed-auction-volume` is registered on the laptop (NT8). Run its count-first pass. Then, as its own prereg: does
  aggressive-volume imbalance in the 5 minutes before a structural level is reached change the 15–30-minute outcome
  beyond the geometry the Range Book already found (distance from the running extreme × clock)?
- The comparison must be **incremental to the geometry model**, because `live-range-features` showed the geometry
  already explains the exhaustion signal that indicators seemed to carry.
- Not possible from OHLCV. Don't simulate delta from candles.

### P7. Dealer gamma from Cboe chains: forward record, no backtest

- The archive began 2026-10-19 (ETF options ≈ 3× NDX gamma). There's no history to backtest. Log a daily
  net-gamma-sign estimate now and pre-register a judge date (≥ 250 sessions, ~2027-10). Validated so far for *range*
  (`gex-range-es`), never for direction.

### P8. Use direction where size says it matters (design, once one of P1–P5 passes)

- Today's audit and the vol stack say size is forecastable and sign mostly isn't. The economic win from a small
  directional tilt is largest when the expected move is large and costs are fixed. The trade design that follows:
  take a validated tilt only on sessions the validated vol forecast marks as wide, size it by that forecast, and skip
  the rest.
- This isn't a new signal, so it must not be scored as one. It is how a P1–P5 pass gets traded.

### Don't re-open (banked nulls; re-running these in new clothes breaks the prereg rules)

FX time-series momentum, any look-back; trend in strong trends; yields or short-rate spreads → next-hour/next-day
direction; VWAP / RSI / WaveTrend / ROC at lines; macro-confluence votes; central-bank statement tone → next day;
SPX month-end rebalance; AFML meta-labelling; barrier-race reframing on price alone; C.OG direction claims
(`cog-knowledge` verdicts).

## Rules of evidence for every study in this programme

1. **State the base rate first**, per instrument and horizon. NQ up over 60 sessions = 75%; any accuracy number is
   read against that, never against 50%.
2. **Placebo through the identical pipeline.** Today's audit shows why: pure noise produced up to 168 "significant"
   cells out of 1,200.
3. **Power before running.** Write the MDE; a cell that can't reach its bar is `UNDERPOWERED`, not `NULL`.
4. **Cluster by date across pairs.** 28 pairs a day are about 2 independent observations.
5. **Lockbox stays shut** (sessions after 2026-08-21). Confirmation goes on held-out years or a forward record.
6. **What counts as success.** A tilt of a few percentage points, or a few hundredths of a day's range, in a window
   that recurs, that survives costs and goes live only after a forward record. That is the realistic "better than a
   coin flip".

## Order of work

1. P1 prereg: the strongest prior and the most power. The ECB + BoE cell can start in a cloud session on the
   calendar already on disk; the other five banks need their meeting dates assembled first.
2. P2 prereg: small, fast, and the literature fixes the window in advance.
3. P5 confirmations: run whichever is due.
4. P3 and P6 once the M1/tick data is available (laptop or R2).
5. P4 as a longer piece; P7 starts logging now and waits.
