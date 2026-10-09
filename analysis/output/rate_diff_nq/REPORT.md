# Does the US–EU short-rate differential lead, coincide with, or follow Nasdaq? (2026-10-09)

Plan: `plans/RATE_DIFF_NQ_LEADLAG_PLAN.md` (finalists fixed before confirmation). Detail: `explore/`, `explore_mid/`,
`confirm/`, `confirm_mid/` (15-min family), `one_minute/` (1-min), `FINALISTS.md`.

## Data and what had to be fixed first

| | |
|---|---|
| Rate legs | SOFR SR3U6/Z6/H7/M7 (CME), Euribor IZ6 (ICE), €STR ER3U6 (ICE). IBKR, Oct 2025 → Oct 2026: 15-min TRADES and MIDPOINT; 1-min MIDPOINT Apr → Oct 2026 |
| Differentials | US − EU at matched expiry (SR3Z6 − IZ6), C.OG's pair (SR3U6 − ER3U6), a rolling 6–12-month-to-expiry pair, and each leg alone |
| Nasdaq | OANDA NAS100 15-min mid; NQ futures 1-min MIDPOINT (M6 → U6 → Z6) |
| **Fixed** | The first euro pulls were IBKR's continuous series saved under one contract's name and later merged with the named contract (mixed series). Re-pulled by named contract; old files kept in `stir/_superseded/`. |
| **Corrected** | ICE €STR is NOT illiquid: median 117 lots / 15 min (the earlier "~2" was the mixed series). C.OG's exact pair is usable. |
| **Ruled out** | Stale last-trade closes: MIDPOINT bars give the same results as TRADES (e.g. same-bar 15m +0.177 vs +0.185). |
| Not fixable | Euribor/€STR trade 00:00–20:45 UTC only (differential undefined overnight); rate futures move in 0.25–0.5 bp ticks (39–61% of 15-min bars unchanged); the economic calendar ends 2026-07-02. |

Holdout: 15-min family explored Oct 2025 – Mar 2026, confirmed Apr – Oct 2026; 1-min explored Apr – Jun, confirmed Jul – Oct.

## What the data supports

**1. They move together, strongly, at every timeframe — that is the relationship.**
- Each leg alone: higher rates priced ↔ Nasdaq lower in the same interval. 1-min −0.11 to −0.29, 5-min −0.15 to −0.29,
  15-min −0.10 to −0.27, 1h −0.27 to −0.35 (Apr–Oct). Beyond the scrambled-day band everywhere.
- Volatility clusters both ways symmetrically (big rate moves and big Nasdaq moves arrive together, at every lag):
  common news, not a lead.

**2. The DIFFERENTIAL's link to Nasdaq is unstable; the rate LEVEL's is not.**
- Oct 2025 – Mar 2026: differential same-bar +0.18 (15m) to +0.49 (daily), driven by the euro leg (US leg mixed:
  −0.50 in London hours, +0.10 in US hours, cancelling to −0.10 overall).
- Apr – Oct 2026: both legs move with Nasdaq about equally (US −0.22, EU −0.27), so US − EU cancels: +0.06 (15m),
  rolling 20-day 1h correlation from +0.4/+0.5 (Mar–May) to about 0 or negative (Jun–Oct).
- For Nasdaq, the level of short rates (either leg) is the stable co-mover; the US-vs-EU gap is not. (The gap is the
  natural variable for EURUSD, which was not the question here.)

**3. Rates do NOT lead Nasdaq at any timeframe tested (1m, 5m, 15m, 30m, 1h, 4h, daily).**
- Every rates-first candidate from the exploration failed confirmation, several reversing sign: SR3Z6/H7 one bar ahead
  at 15m +0.028/+0.030 → −0.018/−0.025; rates up today → Nasdaq down tomorrow −0.32 → +0.13; C.OG pair Granger
  rate→Nasdaq p 0.028 → 0.92. At 1 min, rate→Nasdaq Granger p 0.12–0.87 for every leg in both halves.
- Power was adequate: smallest detectable correlation ≈ 0.03 at 15 min and ≈ 0.006 at 1 min (80% power); observed
  lead correlations at 1 min are within ±0.015 and change sign between halves.

**4. Nasdaq leads the rate futures by a few minutes — statistically clear, economically nil.**
- Granger Nasdaq → rate at 1 and 5 min: p ≈ 0.000 for SR3Z6, SR3H7, IZ6 and ER3U6, in BOTH halves.
- Size: about 0.4–0.7 bp of rate move per 1% Nasdaq move, spread over the next minutes (~0.015 bp after a typical
  1-min Nasdaq move, a fraction of one tick); gone by 15 min (15-min Granger on the legs p 0.4–0.9).
- Most consistent with large-tick quote adjustment (a futures mid only moves once its value crosses a tick, so it trails
  a continuously-priced index), not with Nasdaq carrying rate information.

**5. At data releases both react within the release minute.**
- 18 US/EU releases (Apr – Jul; calendar ends 2 Jul): the rate legs reached half their 30-min move first in 8–11, Nasdaq
  in 2; median half-move time 0 min for rates vs 1.5 min for Nasdaq. But many rate moves were 1–2 ticks (a single tick
  completes "half the move" at minute 0); on the large ones (FOMC 17 Jun 11 bp, GDP 25 Jun, NFP 2 Jul) both moved in the
  same minute. No minute-scale lead a retail trader could act on.

## What it cannot rule out

- A lead measured in seconds (needs tick data).
- A lead that exists only on large surprises (18 release windows is too few; the calendar file needs updating past 2 Jul).
- Effects outside this 12-month window (one rate regime transition is in it; more history needs more contract pulls).

## Bottom line

The US–EU short-rate differential and Nasdaq **coincide**; they do not lead each other in any tradeable way. The
differential's coincident link itself switches on and off with which rate leg is moving markets; for Nasdaq the rate
level is the steadier co-mover. Overlaid on a chart, the line will track price closely at times (as on C.OG's charts)
because they move in the same minutes, not because one turns first.
