# footprint-absorption — when aggressors put in heavy volume and price does not follow, does the bar's direction carry on, compared with the same candle on normal flow?

**Pre-registered 2026-11-07, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `footprint-absorption` |
| Branch | main |
| Register row | `plans/RESEARCH_REGISTER.md` → `footprint-absorption` |
| Data | Databento GLBX.MDP3 raw trades with the exchange aggressor flag, `6E.v.0` and `6J.v.0`, in `%LOCALAPPDATA%/MacroFXModel/orderflow/raw/GLBX/trades/`. Fixed window: 6E 2023-04-03 to 2026-08-21, 6J 2023-08-01 to 2026-08-21. NQ cash hours (`trades_rth/NQ/`, about 55 sessions ending 2026-08-21) are descriptive only. Sessions after 2026-08-21 stay sealed |
| Seed | `20261107` |
| Uncertainty | session-date block bootstrap, 20-session blocks, B = 2000, clustered by date across instruments |
| Scripts / outputs | `scripts/footprint-absorption/` → `analysis/output/footprint-absorption/` |
| Harness | own script (data is local, and in raw per-day files) |

## 1. The claim

Two videos the owner shared on 2026-11-07. Video 1 (delta divergence, on Bitcoin): "Divergence equals absorption... you want to be on their side", meaning more market selling than buying in a green candle means limit buyers absorbed it, so follow the candle. Video 2 (a charting vendor's order-flow course): heavy effort at one side of a candle with no result is "the perfect case of absorption", and sellers stuck at the bottom of a candle are "trapped" and fuel the move.

The claim tested: after such a bar, price carries on in the bar's direction more than it does after the same candle on normal flow, and a trade taken on it earns positive net R.

Mechanism: a large resting order absorbs aggressors. Once they are exhausted, those trapped positions unwind in the absorber's direction.

## 2. Why it is not already settled

- `orderflow-lead-aggressor` (NULL) fits one straight line through all bars. Absorption is a claim about rare extremes conditional on the candle, which a linear slope could miss. The result leaves it open and says so.
- `failed-auction-volume` (UNDERPOWERED) used bar volume at a range edge, with no sign and no price-level detail. Its bracket resolved like a random walk.
- No Evidence Book entry tests a footprint pattern. Nearby level-touch work earned gross edge and lost it to costs, so costs are scored here.
- These bars were already read for `orderflow-lead-aggressor`, so this is the same window re-cut. Outcomes were read only as a slope on D, not for any condition here. All are one family, and the older months that would have been a clean holdout were not bought, so a pass here needs a forward record before any use.

## 3. Definitions, fixed in advance

- **Bars and session:** 5-minute bars, 03:00 to 16:00 New York (DST-aware), as in `orderflow-lead-aggressor`, with its session drops. Signed volume: side B = buyer aggressor, side A = seller aggressor, side N left out.
- **Bar fields:** open, high, low and close from trades in the bar. D = (buy - sell) / (buy + sell). Up bar: close > open. Down bar: close < open.
- **At the extreme:** rows in the lowest third of the bar's range (low to low + range/3) and the highest third. `sell_low` = sell volume in the lowest third / all signed volume in the bar. `buy_high` = buy volume in the highest third / all signed volume in the bar.
- **Own-history thresholds:** each measured over up to the previous 60 sessions, strictly before the session, per instrument, needing at least 20. No setup before that. Quantiles of D, `sell_low`, `buy_high`, bar range. Median volume by bar of day.
- **Normal candle conditions, every event and control:** range at or above the trailing median, and volume at or above the trailing median for that bar of the day (the effort).
- **Event A, delta divergence (video 1):** up bar with D at or under the trailing 10th percentile, side +1. Mirror: down bar with D at or above the 90th percentile, side -1.
- **Event B, absorbed at the extreme (video 2):** up bar closing in the top half of its range with `sell_low` at or above the trailing 90th percentile, side +1. Mirror: down bar closing in the bottom half with `buy_high` at or above its 90th percentile, side -1.
- **Control, per event:** same side, candle direction and normal-candle conditions, and (for B) the same close-in-half condition, but with the flow measure between the trailing 40th and 60th percentiles.
- **De-clustering:** for each instrument and side, an event within 12 bars of the previous kept event is dropped. Controls are not de-clustered.
- **Entry:** the open of the next bar, known only after the event bar has closed.
- **Outcome O(h):** side x log(close h minutes after entry / entry), over the trailing realised 5-minute sigma (60 bars, known at the event close) x sqrt(h/5). h in {15, 60} are scored. A window passing 16:00 is dropped.
- **Contrast:** event O(h) minus the mean control O(h) in the same instrument, side and hour of day. A cell with no control is dropped and counted.
- **Trade:** enter at the next bar's open. Stop = event bar's extreme beyond the entry (low for a long, high for a short) less or plus 2 ticks. Target = 2R. Exit at the session's last bar if neither is hit. Both touched in one bar counts as a stop. Stop distance under 4 ticks is skipped. A bar's high or low through the stop on entry stops at once.
- **Costs:** 1 tick on entry, 1 tick on stop and session-close exits, 0 on target (limit), and $4 a round trip. Tick values: 6E 0.00005 x 125,000, 6J 0.0000005 x 12,500,000.

## 4. Hypotheses, expectation first

| # | Question | Pre-registered expectation |
|---|---|---|
| A15, A60 | Event A contrast at h = 15 and 60, pooled | **Null.** `orderflow-lead-aggressor` found nothing, and if anything a faint reversal |
| B15, B60 | Event B contrast at h = 15 and 60, pooled | **Null or small.** B is the nearer to what a footprint alone can show |
| AR, BR | Mean net R of the trade, pooled | **Negative.** Stops just past the bar pay heavily in costs (`failed-auction-volume` paid about 0.21R) |
| **THE GATE** | Holm at alpha 0.05 over the 6 cells. Contrast at or above +0.15 with the interval above 0; net R at or above +0.15 with the interval above 0; same sign in both halves and in both instruments; contrast above the 95th percentile of a shuffle of event and control labels inside instrument, side and hour. `VALIDATED` needs a contrast cell and the net R cell of the same event. A contrast alone is `CONTEXT`. | — |
| **THE MIRROR** | The same statistics with the sign flipped: a contrast at or below -0.15 that passes the same gate means the bar reverses. Recorded either way, and a `CONTEXT` result at most | — |

Components, descriptive, under the owner's rule that a null gets decomposed: gross R before costs; target reached minus the random-walk rate stop / (stop + target); the control's trade net R; both sides separately; London and US hours; each instrument. A part that beats both nulls in both halves after BH q = 0.10 is listed as a candidate, never a result.

Descriptive on NQ: the same events and contrast on the 55 cash-hours sessions, with thresholds from up to 60 prior sessions needing 20, so about 35 usable. Also the bar-level correlation between the tick-rule and the true D on NQ, which says how far `orderflow-lead` could see. Variants beyond the primary for best-of-N: h = 5 and h = 30 (descriptive); 2 events.

## 5. Power

Rough plan, checked by count-first. About 250,000 bars. About 1.3% meet an event's conditions, so about 2,500 events after de-clustering per event type, with several controls for each. Assumed outcome SD 1.2, net R SD 2. alpha 0.05/6 two-sided, 80% power, z sum 3.48.

| Cell | Planned n | SD | MDE | Pass bar | Verdict |
|---|---|---|---|---|---|
| A15, A60, B15, B60 | 2,500 events, 10,000 controls | 1.2 | 0.094 | 0.15 | POWERED if n reached |
| AR, BR | 2,500 | 2 (assumed) | 0.14 | 0.15 | POWERED (thin) |

**Count first.** The first run reports only the number of events and controls per instrument and event, and the pooled SD of O(h) and of R with no split by event or control. It is written into `## Amendments` as PRE-RESULTS with the recomputed MDEs. A cell whose MDE passes its bar is `UNDERPOWERED`, never `NULL`, and thresholds are not loosened.

## 6. Multiplicity

- Scored cells: 6, Holm at alpha 0.05, p from the bootstrap.
- Disaggregation: BH at q = 0.10 with `chanceBaseline`.
- Promotion to any live use needs |t| >= 3 on the scored cells and a forward record on the recorder, which needs real-time CME data for any intraday entry.

## 7. What this does NOT test

- A trader reading a chart by eye, or the videos' context filters (higher-timeframe levels, value areas, their discretion). These are mechanical stand-ins.
- Resting orders. A footprint shows trades, so absorption is inferred from them and cannot be told apart from sellers pulling their offers. The order book is not used.
- Stacked imbalances, low-volume nodes, big-trade filters or exhaustion, which are other questions.
- Bitcoin, where video 1's example was. NQ only descriptively; other CME markets not at all.

## 8. What each verdict changes

- **Validated** → research-only ledger entry. Amber markers on `footprint.html` may be named as a tested description for 6E and 6J. A forward record starts. Buying NQ history becomes worth pricing under its own prereg. No bot reads it.
- **Null** → ledger entry. The page says these two mechanical absorption readings showed no edge on 6E and 6J, and no spend on NQ history follows from them.
- **Underpowered** → ledger entry with measured n and MDE, and what more data would fix it.
- **Context** → recorded, with no trade claim.

## Amendments

*(none yet)*
