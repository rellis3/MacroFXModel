# Agenda: volume footprints in a trade strategy

Written 2026-11-07. Nothing here is claimed or run. The owner picks; the picks become `CLAIMED` rows through `research-protocol`.

## The map

- **Null, powered:** `orderflow-lead`. NQ 5-minute imbalance did not predict the next 5 or 15 minutes (189 sessions, slopes -0.002 and +0.003). The sign came from the tick rule, which is built from price, so it could hardly lead price. Real aggressor flow is untested.
- **Registered, never run:** `failed-auction-volume`. The closest thing to a footprint-style trade in the book, and its S1/S2 need only NT8 1-minute data already on the laptop.
- **Nearby and discouraging:** level-touch work earns gross edge and loses it net of costs (`line-touch` scan, `live-range-confluence-book`). Forecast rungs are reached no more often than comparable lines (`day-recon-reach-forecast-specific`). Any footprint trade placed at a level has to beat this.
- **Where the book has found things:** range, not direction (the skill's count: volatility/range 27 of 86 validated, price 13 of 76).
- **Data:**
  - 6E and 6J trades with the exchange's own aggressor flag: being pulled newest first, reached 2023-10 at $72 of the $120 cap on 2026-11-07. Side checked in the pilot (B prints at the ask 99.7%, A at the bid 99.9%). The raw files hold price and size, so per-price cells can be built at no cost; `orderflow_bars.py` keeps only 1-minute totals today.
  - NQ tick history, about a year, tick rule only: fine for tests of volume at price, weak for anything that depends on the sign.
  - NT8 recorder: bid/ask matched from 2026-11-09, six markets, forward only.
- **Lockbox:** sessions after 2026-08-21 are sealed. Every recorder day falls inside it, and so does the newest part of the Databento pull. Studies score to 2026-08-21.

All cards below re-use one window per instrument, so they count as one family for multiplicity.

## Questions, ranked

### Q1. Does real aggressor flow lead where tick-rule flow did not? — score 11/15

> Take the exchange's aggressor flag on 6E and 6J and build signed imbalance per bar. Control for the move already in the bar, sweep a family of short horizons,
> and read the slope against the same flow taken from other sessions. Is there anything above that noise, in both halves?

| | |
|---|---|
| Construct | (buy - sell) / (buy + sell) per 5-minute bar, from Databento side A/B; side N left out |
| Knowable when | bar close; outcome starts at the bar close |
| Condition | none first; session (London, US) described, not scored |
| Horizons | 5, 15, 30 minutes, 1 hour |
| Noise threshold | other-session placebo as in `orderflow-lead`, session-block bootstrap |
| Outcome distribution | standardised return slope, plus the mirror (reversal) with the same gate |
| Benchmark / control / mirror | tick-rule imbalance on the same bars, which also measures what the true sign adds |
| Mechanism | Large parents split over time and push price slowly, so aggression should carry information the tick rule mixes up with price |
| Builds on | `orderflow-lead` (null, tick rule). This is the follow-up it named |
| Data & power | Raw on disk back to 2023-10 and growing. Much more than the 189 sessions that gave MDE near 0.04 |
| If yes → | Delta becomes a real input and NQ/ES history becomes worth buying |
| If no → | Stop saying delta leads, on any sign method, on FX futures. Q3 and Q4 stay open because they ask about structure, not a bar total |
| Falsifier | Slope inside the placebo range, or opposite signs in the halves |

Note: the tracker already lists a "first delta test" after this pull. Check it is not claimed elsewhere before registering.

### Q2. Does footprint activity say how much, rather than which way? — score 11/15

> Build a flow state from the footprint: how one-sided, how concentrated at price. Where does it sit in its own last few months? Condition on its extremes,
> sweep the rest of the session, and read the range distribution against what the shipped range forecast already expected.

| | |
|---|---|
| Construct | Imbalance magnitude, POC concentration, and volume outside value area, each ranked against its own trailing months |
| Knowable when | Bar close; only volatility known at that time may be used as the baseline |
| Condition | Extremes of the percentile, named before looking |
| Horizons | Next 1 hour, 4 hours, rest of session |
| Noise threshold | Shifted labels, plus the increment over a plain realised-vol baseline |
| Outcome distribution | Realised range over expected range, whole distribution, not just the mean |
| Benchmark / control / mirror | The shipped range line, and plain volume at the same percentile. If plain volume does as well, the footprint adds nothing |
| Mechanism | One-sided forced flow clusters and consumes liquidity, so it should precede more range whichever way it goes |
| Builds on | Range is where the book has validated results. Check the `vol-layer` studies in flight first, as they may cover the baseline |
| Data & power | 6E and 6J cells need the new builder; NQ can test the volume-at-price parts on tick history |
| If yes → | A size or stand-aside input, the one route that does not need a direction call |
| If no → | Footprints are description for vol as well, and only Q3 and Q4 remain |
| Falsifier | No increment over plain volume and realised vol |

### Q3. Heavy volume that fails to move price — score 10/15

> Find bars where aggressors put in far more volume than usual at the extreme and price did not extend. Map what happens next, MAE and MFE, across a family of horizons,
> against bars with the same price shape and normal volume. Is the distribution different, and does anything survive costs?

| | |
|---|---|
| Construct | Aggressor volume at the bar's top or bottom rows, ranked against its own history, with the close back inside the bar |
| Knowable when | Bar close; entry no earlier than the next bar's open |
| Condition | Volume extreme, with price shape fixed |
| Horizons | 5 minutes to the session end |
| Noise threshold | The matched same-shape control. This contrast is the test |
| Outcome distribution | MAE and MFE paths first; R net of real costs only after that |
| Benchmark / control / mirror | Same shape on normal volume, and the opposite side as the mirror |
| Mechanism | A large resting order absorbs aggressors; when they run out, trapped positions unwind |
| Builds on | `failed-auction-volume` tests a coarser version. Level-touch nulls warn about costs |
| Data & power | 6E and 6J with the builder. Count first; the extremes may be thin |
| If yes → | The first footprint rule worth trading on paper |
| If no → | "Absorption" stops being a reason to take a trade |
| Falsifier | No gap against the control, or a gap smaller than costs |

### Q4. Stacked imbalances as support or resistance — score 9/15

> When three or more rows in a bar are one-sided, does price respect that zone when it comes back? Read the revisit outcomes against comparable zones in the same bars with no stack.

| | |
|---|---|
| Construct | Runs of diagonal imbalance rows, as on `footprint.html`, sweeping the ratio |
| Knowable when | Bar close; only later revisits count |
| Condition | First revisit within the session |
| Horizons | Within 30 minutes and within the session after the revisit |
| Noise threshold | Same-distance zones in the same bars without a stack |
| Outcome distribution | Hold or break rates, then MFE and MAE |
| Benchmark / control / mirror | The control zones, and the opposite-side stack |
| Mechanism | Weak: a popular retail reading. Possibly resting orders left behind by a sweep |
| Builds on | `day-recon-reach-forecast-specific` found levels no more special than comparable lines, so expect a null |
| Data & power | 6E and 6J with the builder |
| If yes → | The page's marker earns its place |
| If no → | Keep the marker as description and say so on the page |
| Falsifier | Same hold rate as the control zones |

### Q5. Run the registered failed-auction test — score 9/15

> Already written. Does a failed probe of a balance edge earn net R, and do thin-volume probes beat heavy ones on the same price pattern?

| | |
|---|---|
| Construct | As fixed in `forge/FAILED_AUCTION_VOLUME_PREREG.md` |
| Data & power | NT8 1-minute, 2019 to 2026-08-21, on the laptop. Count-first pass still to do |
| If yes → | A volume-confirmed setup to trade on paper, and the case for finer footprint work |
| If no → | Closes the volume half of the Discord method on these definitions |
| Falsifier | As in the prereg |

Scored low only because the mechanism is a story so far, but it costs almost nothing and needs no new build. **It could reasonably run first.**

## Parked

- **Buying NQ or ES aggressor history** (about $126 and $155 a year). Decide after Q1 and Q3. If they fail on FX, the case needs an index-specific mechanism first.
- **Scoring recorder footprints.** All inside the lockbox, and months short of power. Wait for the lockbox evaluation (about late Nov 2026) and a sample worth testing.
- **Order-book questions** (depth, spoofing, book imbalance). Needs mbp-10 (about $74 a year for 6E, not approved), and NT8 depth only after a restart and on a late feed.
- **Live trading on footprints.** A profit question and a practicality question. The Lucid feed is about 10 minutes late, so an intraday entry needs a real-time CME feed. Only worth pricing if a rule passes.

## Checks to do before any of this

1. Compare NT8's bid/ask signing with Databento's aggressor flag on one 6E day recorded by the capture. Buying that day costs well under $1 and needs the owner's say-so. It tells us whether recorder footprints can be trusted beside the history.
2. Build per-price cells from the Databento raw files, same format as the site's day files. Q2, Q3 and Q4 all need it.

## Owner calls

- 2026-11-07: owner said "would like to investigate volume footprints in a trade strategy maybe". No picks yet.
