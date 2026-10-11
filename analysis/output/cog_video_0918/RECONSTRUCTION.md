# C.OG's blue "SOFR–€STR" line: reconstruction from first principles (2026-10-11)

Evidence: the line digitised from his video frames (17 Sep 00:00 → 22 Sep 13:15 UTC, 258 15-min bars; calibration
checked against the chart clock and the crosshair tooltips, ≈ ±1 bar; the Tuesday segment spliced from a wider frame,
RMSE 0.11 on 120 overlapping bars). Candidates: every affine map a + b·x of 60 constructions from our IBKR 1-min data
(SOFR / €STR / Euribor outright rates and prices, all 45 month pairings, strip means and sums, slopes, ratios, US and
German 2-year futures, Nasdaq), scored on RMSE in his units and on 15-min **change** correlation, which is what
identifies a series. Files: `cog_line_identify.csv`, `cog_line_search.csv`, `ours_vs_his.png`, `cog_line_overlay.png`.

## 1. What is known

| property | finding |
|---|---|
| Level | 7.73 – 8.73 over the six days; 7.85 – 8.35 on a normal day |
| Step size | 15-min changes 0.01 – 0.07 typical, 33 % of bars flat; plateaus not on any grid → not a ticked price |
| Shape, Thu–Mon | matches an **inverted European front short rate** (−€STR Dec26, −Euribor Dec26, −German 2y: level corr 0.73–0.80) or SOFR U6 − €STR Z6 (0.80); the Friday 18 Sep V-low lands on the €STR spike at 15:15 UTC |
| Scale implied by that match | ≈ 0.10 – 0.12 of his units per bp of the euro rate (≈ 11 units per 1 %) |
| Bar-by-bar agreement | ≤ 0.30 for every candidate; ≤ 0.38 for the best linear mix of all 17 series; ±1-bar tolerance and 1-h smoothing do not close it |
| **Tuesday 22 Sep test** | 08:30–10:00 UTC the whole curve fell 5–8 bp (SOFR Sep27 −8.5, €STR Sep27 −9.7, German 2y −6): an inverted-rate line at 0.1/bp should rise +0.5 to +0.9 — **his line moved 8.29 → 8.25**. At 11:45–12:00 UTC his line jumped **+0.40** (8.21 → 8.61) while every rate leg was flat within ±0.5 bp and Nasdaq −0.1 % |

So: no affine function of these contracts, the 2-year futures or Nasdaq at 15-minute resolution produces his
series. The Thu–Mon resemblance is a few trending days plus one shared feature (the Friday €STR spike); the first
day with an independent test contradicts it on both counts.

## 2. Ranked candidate reconstructions (none validated bar-by-bar)

| rank | candidate | fitted map | units per bp | RMSE (his units) | change corr | why not confirmed |
|---|---|---|---|---|---|---|
| 1 | SOFR U6 − €STR Z6 | 11.85·x − 5.48 | 0.118 | 0.119 | 0.20 | constants unnatural; fails Tuesday both ways |
| 2 | −€STR Z6 (euro front, inverted) | −10.6·x + c | 0.106 | 0.12 | 0.26 | fails Tuesday both ways |
| 3 | SOFR U6 − €STR U6 (his stated pair) | 31.4·x − 38.7 | 0.314 | 0.115 | 0.10 | 3× the scale of #1 for the same level; fails Tuesday |
| 4 | SOFR U6 / €STR U6 ratio | 50.5·x − 72.2 | — | 0.110 | 0.11 | unnatural; fails Tuesday |
| 5 | strip mean / PCA level / 2-year spread | — | 0.02–0.06 | 0.12–0.14 | ≤ 0.07 | wrong shape Thu–Mon |

A natural-constant map (b = ±1, ±10, ±100; a = 0 or 100) was found for **none** of the 60 constructions.

## 3. What a move from 7.5 to 8.0 would mean

- Under candidate 1: the SOFR U6 − €STR Z6 gap widening by **4.2 bp**.
- Under candidate 2: €STR Dec26 falling **4.7 bp** (price up 0.047).
- Under his line's own behaviour on 22 Sep: **undefined** — 0.4 units occurred with 0 bp, and 8 bp produced 0.04 units.

## 4. What is unknown, and what would resolve it (ask C.OG)

1. **Instruments and months:** exact tickers (CME SR3? ICE ER3 or CME ESR? Euribor?) and which contract months,
   or whether it is a continuous/rolled series. (Our data: five quarterlies each, 1-min, Apr–Oct 2026.)
2. **Formula and units:** rate difference in %? a ratio? a z-score or min-max rescale (window)? Why 7.5–8.5?
3. **Source and sampling:** vendor, bar interval, and whether values are forward-filled between updates — the long
   flats and abrupt 0.3–0.5 jumps on no rate move look like a series refreshed a few times a day, not a 15-min feed.
4. **Timestamps:** time zone of his Python output when imported to TradingView (a shift of hours would move the
   Tuesday jump onto the 08:45 move — our calibration allows about ±1 bar, not ±3 h).

## 5. Reproduction vs prediction

- **Reproduction:** not achieved. The closest shape proxy (inverted €STR Dec26 or SOFR U6 − €STR Z6, ×≈11) is already in
  `pine/rate_overlay.pine` and the rates page as a context line; it should be labelled a proxy, not his indicator.
- **Prediction:** the out-of-sample research already covers every construction the proxy could be (direction 1 min to
  a month, hours-scale catch-up and confirmed turns, curve shape, magnitude → vol): nothing replicates beyond same-bar
  co-movement. Because the formula is **not identified**, the reconstruction creates **no new testable hypothesis**;
  a new test is warranted only if his disclosed formula differs materially from the 60 constructions above.

## 6. Addendum (2026-10-11, later): transformed futures PRICE, bond futures, and a time-zone shift — all tested

**Affine price maps.** A short-rate future's price is 100 − rate, so every "inverted / offset / rescaled price" of the
14 STIR contracts is already one of the 60 affine candidates in §2. None fits.

**Bond futures prices** (new pull, 1-min, 14–25 Sep: Bund, Bobl, Buxl, Schatz, ZT, ZN, ZF, ZB, UB; `cog_line_bonds.csv`).
Duration gives a ~0.05–0.1 price move per bp with no scaling, so a bond price minus a constant was the natural
candidate for his 0.1-units-per-bp scale. Result: Bobl matches the **level** (0.86; Bobl − 104.13 has RMSE 0.10) but
bar-to-bar only 0.07; best bar-to-bar of any bond or bond spread is 0.14 (Bund − Buxl). On Tue 22 Sep 08:30–10:00 UTC
every bond price rose 0.10–0.40 (Bobl +0.28, ZN +0.38); his line −0.05. All offsets unnatural (−104.1, −124.1, −97.9…).

**Time-zone / import shift.** Cross-correlation of his 15-min changes with each candidate's at shifts of −8 h … +8 h
(−€STR Z6, SOFR U6 − €STR Z6, his stated pair, −German 2y, US−DE 2y, Bobl, Bund, ZN, Nasdaq): the largest |corr| at any
shift is **0.27** (ZN at −3 h); level correlations peak at 0 to −1 h (our calibration slack) and fall away smoothly.
No shift turns any candidate into his series.

**Conclusion of §6:** his line is not an affine transform — with any offset, scale, inversion or fixed time shift — of
any of 23 rate and bond futures or of Nasdaq at 15-minute resolution. What remains possible: a different data source
with sparse updates (the flats and 0.3–0.5 jumps on no market move), a nonlinear or windowed normalisation that
decouples bar-to-bar changes from the input, or an input that is not a market price. Only his formula resolves it.

## 7. Addendum (2026-10-11, later still): scheduled inputs, trade-based bars, non-rate inputs

- **Jump clock.** His largest 15-min moves cluster at 11:45–13:15 UTC (Tue +0.16 / +0.25 / +0.20, Mon +0.19, Thu +0.16);
  mean |move| by hour peaks at 13:00 UTC. That window holds the SOFR publication (08:00 ET) and US releases.
- **Daily fixings as a leg (FRED SOFR, ECB €STR, `fixings/`).** Both fixings stepped once mid-month (€STR +25 bp on
  16 Sep, SOFR +23 bp on 17 Sep) and were flat for the rest of the week — so the Mon/Tue 12:00 jumps are **not**
  fixing updates (published change 0 bp on both days).
- **Trade-based bars** (15-min TRADES for SR3U6 / ER3U6): change corr 0.10 (pair) / 0.18 (−€STR); our trade bars are
  flat 61–76 % of the time vs his 31 %, so his line is *more* active than a trade-only series, not less.
- **Non-rate inputs** (OANDA 15-min): EURUSD change corr 0.09, German 10y bond CFD 0.22, US 2y CFD 0.21, SPX 0.11,
  NAS100 0.12; best at any lag within ±2 h: 0.24. On Tue 11:45–12:00 none moved more than 0.05 %.

**Net:** scheduled fixings, trade sampling and the obvious FX / bond / equity inputs are all excluded as the source of
his bar-to-bar moves. Everything tested from our side is now in §2, §6 and §7; the formula remains unidentified.

## 8. Addendum (2026-10-11): "the right series, sampled at his pull times"

Hypothesis (owner): his Python pulls on its own schedule and TradingView holds the value between pulls, so bar-to-bar
tests fail by construction. Test: at each bar where his line steps (|Δ| ≥ 0.03: 75 steps; ≥ 0.06: 30 steps), compare
his step with each candidate's cumulative change since his previous step — his own steps reveal his schedule.

| candidate (change since previous step) | corr, 75 steps | corr, 30 steps | scale b (units/bp) |
|---|---|---|---|
| −€STR Sep26 (his stated euro leg) | 0.30 | 0.44 | 0.12 / 0.21 |
| −€STR Dec26 | 0.31 | 0.42 | 0.05 / 0.07 |
| SOFR Sep26 − €STR Sep26 (his stated pair) | 0.33 | 0.40 | 0.12 / 0.19 |
| SOFR Sep26 − €STR Dec26 | 0.37 | 0.47 | 0.06 / 0.09 |
| −German 2y | 0.22 | 0.26 | 0.02 |
| OLS on all 16 legs, same intervals (in-sample ceiling) | **0.49** | 0.74 (16 params on 30 points) | — |

- 91–97 % of his steps have *some* rate movement ≥ 0.5 bp behind them (7 of 75 have none), so the inputs are not
  disconnected from rates — but no single leg or pair accounts for more than ~0.4–0.5 of his step sizes, the fitted
  scale drifts by 2× between step thresholds, and the Tuesday 12:00 step (+0.25) has 0 bp behind it on every leg.
- The sampling hypothesis raises agreement from 0.10–0.26 (bar-to-bar) to 0.3–0.5 (step-aligned). It is the best
  explanation found, and still not a reconstruction: at most a quarter to a half of the variance of his steps.

**Conclusion of §8.** Consistent with his line being built from these legs, pulled irregularly, with a transform or
weighting we cannot see; not consistent with any single pair at a fixed scale. The question to him narrows to: *what
is the exact formula, and how often does the script pull?*
