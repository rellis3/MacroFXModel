# delta-at-line — as price reaches a forecast line, does delta say fade or continue?

**Pre-registered 2026-11-07, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `delta-at-line` |
| Branch | main |
| Register row | `plans/RESEARCH_REGISTER.md` → `delta-at-line` |
| Data | Touches and outcomes: the frozen `analysis/output/line_reaction/events_chosen/` table (chosen forecast lines, first touch per level per session). Flow: Databento aggressor-flagged trades, 6E for EURUSD 2023-04-03 to 2026-08-21, 6J for USDJPY 2023-08-01 to 2026-08-21 (6J moves opposite to USDJPY, so its sign is flipped). NQ tick history, tick rule, 2025-11-06 to 2026-08-21, cash hours only, is descriptive. Sessions after 2026-08-21 stay sealed |
| Seed | `20261107` |
| Uncertainty | session-date block bootstrap, 20-session blocks, B = 2000 |
| Scripts / outputs | `scripts/delta-at-line/` → `analysis/output/delta-at-line/` |
| Harness | own script, reusing `line_reaction.py` outcomes and the `vol-layer-reaction` cost method |

## 1. The claim

From the owner, 2026-11-07: use order flow alongside the vol forecaster's levels. As price approaches a level, see whether delta expects a fade or a continuation, and build the history of divergences the way the VuManChu research did: "hidden divergence in delta and charts with price going up as delta says it should go down". The two videos the owner shared make the same claim in words: delta against the move means the move is being absorbed, and delta with the move means initiative.

Mechanism: at a level many traders watch, aggressive flow that does not carry price signals a resting order or exhausted buyers, so price should reject. Aggressive flow that does carry it signals initiative, so price should break.

## 2. Why it is not already settled

- `plans/LEVEL_ENGINE_ROADMAP.md` stopped level-reaction work and named one thing that could reopen it: "real order flow or exchange volume". This is that test.
- `LINE-REACTION` found P(reject | resolved) about 0.485 at every rung, no different at nearby prices, and 31 lead-up features added nothing. They included tick volume but no signed flow.
- `vol-layer-reaction` (CONTEXT): realised-vol state adds very little at these touches, and one spread costs about 0.17 K, where K is the fixed reject-or-break move of 0.25 sigma.
- `orderflow-lead-aggressor` (NULL) and `footprint-absorption` (NULL) tested flow without the level. `footprint-absorption` left one candidate: delta against the candle at 60 minutes.
- `vmc-nq-cipher-direction` (NULL) tested price-built divergences, on a series that cannot disagree with price the way true flow can.

## 3. Definitions, fixed in advance

- **Touches:** rows of the frozen table for EURUSD, USDJPY and NQ in the windows above. Scored at offset 0 (the line). Offsets of 0.2 and 0.3 sigma away are the neighbours, descriptive.
- **Outcome:** as frozen. K = 0.25 sigma, 120 minutes. P(reject | resolved) uses `reject` and `break`.
- **No lookahead:** every flow measure uses 1-minute bars strictly before the touch minute. `minute` is London time on the session's London date.
- **Orientation:** o = +1 if the touch is above the open on a directly quoted market, -1 if below; flipped for USDJPY through 6J. Oriented delta is o x (buy - sell), so positive means aggressors pushing into the line. Side N is left out.
- **Windows:** a slice is unusable if it holds more than one contract, or under 20 of the 30 minutes or 100 of the 120 minutes. NQ flow exists only in cash hours.
- **D30:** (buy - sell) / (buy + sell) over the 30 minutes before the touch. **Own-history thresholds:** 20th and 80th percentiles of rolling D30 over up to the previous 60 sessions, needing 20, strictly before the session.
- **F1, delta against:** price moved into the line over those 30 minutes, and oriented D30 is at the unfavourable threshold (at or under the 20th percentile for o = +1, at or above the 80th for o = -1). Prediction: reject.
- **F2, regular divergence:** using 5-minute blocks counted back from the touch over 120 minutes, a swing high is a block higher than 2 blocks each side, so it is confirmed only with 2 later blocks. Price in the last 2 blocks is above the latest swing high, while cumulative oriented delta at the last block is below its value at that swing. Prediction: reject.
- **F3, hidden divergence:** the latest two swing lows in the same blocks: the later is higher, while cumulative oriented delta at the later is lower. Price holding up on worse delta. Prediction: break, because the move continues.
- **F4, delta with:** price moved into the line and oriented D30 is at the favourable threshold. Prediction: break.
- **Comparison group:** touches where that feature could be measured but did not fire.
- **Contrast:** P(reject) with the signal minus without, each reject flag first demeaned within instrument, rung and side.
- **Trade, in K, net:** as `vol-layer-reaction`, using `LR._pnl`, spread by instrument (`cost_sigma`), and an ambiguous bar a loss on the follow side. F1 and F2 fade; F3 and F4 follow.

## 4. Hypotheses, expectation first

| # | Question | Pre-registered expectation |
|---|---|---|
| F1, F2 | Contrast at or above +10 pp | **Small or null.** Flow without the level was null and the line has not been special |
| F3, F4 | Contrast at or below -10 pp | **Small or null** |
| N1 to N4 | Mean net K of the trade at or above +0.10 K | **Negative**, since one spread is about 0.17 K |
| **THE GATE** | Holm at alpha 0.05 over the 8 cells; bar met; interval on the predicted side of 0; same sign in both halves and on EURUSD and USDJPY; beyond the 95th percentile of a shuffle of the signal within instrument, rung and side. `VALIDATED` needs the contrast and the net cell of the same signal. A contrast alone is `CONTEXT` | — |
| **THE MIRROR** | A contrast passing the same gate with the opposite sign is recorded, as `CONTEXT` at most | — |

**Why 10 pp:** a fade or follow earns about 2 x (p - 0.5) K before costs and pays about 0.17 K, so it needs p near 0.585 or 0.415 against a base near 0.485. A smaller effect could be real, but it would not pay at this geometry.

Descriptive, no pass weight:
- Neighbours at 0.2 and 0.3 sigma, which say whether any effect is about the line or about flow anywhere.
- Each rung; each instrument; each side; London and US hours.
- D over 15 and 60 minutes; thresholds at the 10th and 90th percentile. These are variants for best-of-N.
- Gross K; the mean move at 60 minutes.
- NQ alone, with the tick rule (+0.91 against the true flag on NQ).
- The full history of touches and flags, written to `events.csv` for a results page, as the VuManChu work did.

## 5. Power

About 2,550 line touches in the FX window, with F1 and F4 firing on perhaps 10 to 20% of those where price moved into the line. alpha 0.05/8 two-sided, 80% power, z sum 3.57, SD of the flag 0.5. At 300 signals against 2,000 others the MDE is about 11 pp, against a 10 pp bar, so this is close.

**Count first.** The first run reports only the number of signals and comparison touches per feature and instrument, and the pooled SD of net K with no split by signal. It goes into `## Amendments` as PRE-RESULTS with recomputed MDEs. A cell whose MDE is above its bar is `UNDERPOWERED`, never `NULL`, and thresholds are not loosened to raise the count.

## 6. Multiplicity

- Scored cells: 8. Holm at alpha 0.05.
- Disaggregation: BH at q = 0.10 with `chanceBaseline`. A survivor is a candidate for its own prereg.
- These touches and this window have been used by earlier studies, though never with signed flow. A pass needs a forward record before any use.

## 7. What this does NOT test

- A trader's discretion, multi-timeframe reading or other context.
- Other levels, such as volume profile, value areas or round numbers.
- Order-book depth at the level. Trades only.
- Live use: the Lucid feed is about 10 minutes late, and a touch decision needs real-time data.
- Markets other than EURUSD and USDJPY; NQ only descriptively.

## 8. What each verdict changes

- **Validated** → research-only ledger entry; delta state beside the lines on `footprint.html` for those markets; a forward paper record through the decision engine in shadow; real-time data priced. Nothing trades on it before |t| >= 3 and that record.
- **Context** → recorded. The page may describe reaction odds by delta state, with no trade claim.
- **Null** → ledger entry; level work with flow closes for these signals.
- **Underpowered** → ledger entry with measured n and MDE; the recorder and more history are what would fix it.

## Amendments

*(none yet)*
