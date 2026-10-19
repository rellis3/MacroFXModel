# VOL CRUSH DRIFT: after a Fed or CPI day on which implied vol collapses, do US indices keep rising?

*Pre-registered 2026-10-19, before any number in this file was computed. A direction claim from a dealer-hedging
mechanism (vanna); our reasoning, prompted by the 2026-10-18 hedging-map work.*

## Prior work (checked first)

- `post-fomc-usd-drift` (validated, USD only, 5 sessions): different asset, no vol condition.
- Event Response Book / surprise-size: range, not direction. `positioning-into-release`: who must act, never direction.
- Every mechanical direction rule at C.OG's lines: null. This test is not at a level and has its own mechanism.
- No test conditions an index's post-event path on the implied-vol change (`grep` of `js/deskEvidence.js`, `forge/`,
  `MD files/` for vanna / vol crush / post-event equity drift: none).

## Mechanism

Customers hold index puts; dealers are short them and carry short futures as the hedge. When implied vol collapses
(a release that removes uncertainty), the delta of those out-of-the-money puts shrinks, so dealers **buy back**
futures: a mechanical bid ("vanna"). Much of it happens the same afternoon, but hedges are rebalanced with a lag
and the vol decline itself tends to continue for a day or two, so the claim tested is the part known at the close:
**after an event-day vol crush, the next sessions drift up.** The control asks whether the event matters, or any
large vol drop does the same.

## Data

- **Events:** US `Fed Interest Rate Decision` and `Inflation Rate Month-over-Month` (CPI) from
  `calendar_events.csv` (de-duplicated, faults-log #11), 2016-03 → 2026-07-02 (end of that file). Event day E = the
  release date (both release inside the New York cash session).
- **Implied vol:** VIX daily close (`analysis/surfaces/cboe/VIX.csv`).
- **Prices:** New York-close daily bars `analysis/output/ladder_candidates/d1/{SPX500,NQ}.json` (`d` = the New York
  session's end date, 17:00 ET; VIX closes 16:15 ET on the same date, so the flag is known before the bar closes).
- **Crush:** log(VIX_E / VIX_{E−1}) ≤ −0.05 (a 5% fall on the day).
- **Outcome:** log(close_{d+1} / close_d) with d = E (next New York session), and log(close_{d+3}/close_d) secondary.
  Entry at the event day's close: no lookahead.

## Groups

- **EC** event-day crush; **EN** event day without crush; **NC** non-event days with the same ≥ 5% VIX fall
  (excluding the day after an event, to keep groups disjoint); **ALL** every session (baseline drift).

## Primary statistic and verdict

D = mean next-day return(EC) − mean(NC), equal-weight average of SPX500 and NQ. 95% interval by bootstrap over
days within groups, 5,000 reps.

- **SUPPORTED:** D ≥ +0.15% with the interval above 0; D > 0 for SPX500 and NQ separately; D > 0 in both halves
  (≤ 2020-12-31, ≥ 2021-01-01); EC − ALL > 0.
- **NULL:** |D| < 0.075%, or the halves disagree in sign.
- **WRONG WAY:** D ≤ −0.15% with the interval below 0.
- **INCONCLUSIVE:** anything else (expected if n(EC) is small; reported as such).

Reported, not in the verdict: 3-session D; EC − EN; FOMC and CPI separately; n per group.

## Decision

- SUPPORTED → a candidate event-day context line ("vol crushed on the release: dealer buy-back flow, next session
  leans up") for the hedging map and Global Read, entering the evidence book as a direction input only after a
  forward record; nothing traded automatically.
- Otherwise → recorded in the ledger; the map keeps vanna as untested mechanics.

Script `scripts/forecast_history/vol_crush_drift.py`; output `analysis/output/vol_crush_drift/RESULTS.md`,
`results.json`.
