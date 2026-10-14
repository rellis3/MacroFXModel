# C.OG's blue "SOFR–€STR" line: reconstruction from first principles (2026-10-11)

> **CORRECTION (2026-10-13) — read this first.** §1's "Tuesday 22 Sep falsifies every rate-based candidate" and the
> conclusions built on it (§2 "fails Tuesday", §5, §6 and the "not a function of these contracts" statements) were
> **wrong**. The Tuesday segment of his line came from a wide video frame whose time axis I had fitted (15.3 px/h)
> instead of anchoring to the crosshair label "Mon 21 Sep 14:15" visible in that frame. With the anchored axis, his line
> and his legs (SOFR Sep26 − Euribor I2!) move together on Tuesday as on every other day (§9). The earlier ±8 h shift
> scans could not reveal this, because the error sat in only one segment.


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


## 9. Correction and result with the anchored time axis (2026-10-13)

- **What was wrong:** Tuesday's timing (see the correction box). Re-digitised with the label anchor (`cog_line_redigitise.py`):
  two independent digitisations of the same stretch agree at level 1.00 and 15-min change 0.96, so digitising is not the
  limit; the time axis was.
- **His exact legs, inverted (his `invert` option: SOFR Sep26 − Euribor I2! = IX6), corrected line, 255 chart bars:**

| horizon of changes | his legs (midpoint) | SOFR − Euribor Dec26 | SOFR − €STR Dec26 |
|---|---|---|---|
| level | +0.84 | +0.88 | +0.87 |
| 15 min | +0.26 (EMA 13: +0.45) | +0.34 | +0.38 |
| 1 h | +0.52 | +0.61 | +0.62 |
| 2 h | +0.56 | +0.62 | +0.60 |
| 4 h | +0.60 | +0.69 | +0.76 |

  Trade-based bars (TradingView's price type) fit slightly better than midpoint: level +0.87, 15-min +0.33. Fitted
  scale ≈ 0.14–0.16 units per bp, offset ≈ −5 to −10 (default 0.2 / 1.445 do not apply).
- **Tuesday:** his line rises 8.23 → 8.73 between 08:00 and 10:00 UTC while SOFR − I2! widens 112.0 → 113.3 bp: the
  same morning move our data shows, not a jump on nothing.
- **Conclusion:** the blue line is very probably SOFR − EUR (Euribor-family) short-rate spread, inverted, rescaled by an
  unknown scale/offset, probably smoothed. Direction and shape are reproduced; **bar-by-bar is not** (15-min 0.26–0.38,
  0.5–0.76 at 1–4 h), the contract months are not pinned (Dec26 Euribor/€STR fit slightly better than I2!'s Nov26), and
  the scale/offset/smoothing are unknown. Not an exact reconstruction.

## 10. The formula, identified (2026-10-13) — zero fitted parameters

Sweeping every input of his pasted indicator (EUR leg × USD leg × data timeframe × price source × EMA × lead; 508,032
configurations, selected on Thu–Fri and tested on Mon–Tue, with a placebo of his line rolled a day out of alignment:
placebo holdout median −0.03, real +0.39) and then applying **round constants with nothing fitted**:

> **plot = (SOFR rate − Euribor rate), in basis points, × 0.1 + 1.445** — Pine inputs: `inBps` ON, `invert` ON, scale **0.1**,
> offset **1.445 (the script's default)**; EUR leg **ICE Euribor Mar27 (IH7)**; USD leg **CME SOFR Sep26 (SR3U6)**.

| | RMSE (his units) | bias | level corr | 15-min change corr |
|---|---|---|---|---|
| **SR3U6 − IH7 (Mar27)**, 1h data, hl2, EMA 1 | **0.060** | −0.006 | 0.955 | 0.47 (15-min data, hl2, EMA 5: 0.51) |
| next best pair (SR3V6 − IM7) | 0.103 | +0.045 | 0.915 | 0.49 |
| SR3U6 − IX6 (Nov26, what `I2!` is if serial months are listed) | 4.33 | −4.33 | 0.59 | 0.00 |
| SR3U6 − IZ6 (Dec26) / IG7 (Feb27) / IM7 (Jun27) | ≥ 0.5 (absolute level off) | | 0.8–0.9 | |

- **The absolute level is what pins the months.** The spread runs 64–71 bp, so × 0.1 + 1.445 gives 7.8–8.5, which is the
  7.5–8.5 range in the video. Only SR3U6 − IH7 lands there; Nov26 is 43 bp off. So TradingView's `I2!` was **Mar27**
  that week (Euribor continuous running through quarterly months: `I1!` = Dec26, `I2!` = Mar27), not a serial month.
- **What 7.5 → 8.0 means:** the SOFR Sep26 − Euribor Mar27 spread widening by **5 bp** (1 unit = 10 bp; the line is the
  spread plus a constant, so it is a rate spread, not a z-score or a price).
- **Not pinned:** data timeframe / price source / EMA (1h hl2 EMA 1–3, 1h ohlc4 EMA 1–3, 15m hl2 EMA 5 all fit within
  0.003 RMSE); bar-by-bar at 15 min is 0.47–0.52, limited by timing slack in the digitised axis (±1 bar) and unseen
  smoothing. Trade prices fit slightly worse than midpoint on the extra legs.
- **Retracts** the earlier "formula not identified" and "unknown scale/offset" statements; supersedes §9's candidate list.

## 11. The indicator's lead offset (his `t + N days` input, default 1 day) — tested (2026-10-14)

The sweep in §10 only covered lead shifts of ±4 chart bars. The script's default is `leadDays = 1` (plot offset 96 chart
bars on a 15-min chart), so the 24-hour offset was tested separately, shifting the identified formula forward by N chart bars
and comparing with his line:

| lead | RMSE (units) | level corr | 15-min change corr |
|---|---|---|---|
| **0 (none)** | **0.060** | **+0.95** | **+0.47** |
| 0.25 d (24 bars) | 0.190 | +0.54 | +0.09 |
| 0.5 d | 0.244 | +0.26 | −0.06 |
| 1 d (the default) | 0.334 | −0.14 | +0.03 |
| 1.5 d / 2 d / 3 d | 0.36 / 0.42 / 0.49 | +0.10 / +0.40 / +0.40 | −0.09 / +0.06 / +0.01 |

**His displayed line has no lead offset: it sits on the formula at the same timestamps (lead 0).** The video was recorded
with `Projection (t + days)` set to 0, or with a version of the indicator without the shift. Consequence for the claim: what he
shows as "the macro line moving first" is not produced by a plot shift; it is the formula's own timing (hourly data and
smoothing make it lag, not lead, the underlying quotes).

## 12. Final match (2026-10-14): all four open items closed

Steps taken: (1) trade prices (what TradingView plots) pulled for Euribor Mar27 and used for both legs; (2) his line re-traced from
**every** video frame with its **own axis calibrated by OCR of the chart's tick labels** (time ticks residual 1–5 min per frame; value
axis from the 8.x labels or regressed to the consensus); (3) bar-time labelling and Pine higher-timeframe semantics tested.

- **Noise floor of the target:** across 21 frame pairs, level corr 0.995, 15-min change corr median **0.84**; between-frame sd of the
  line 0.003 units (95th pct 0.021). 333 consensus bars (seen in ≥ 2 frames), 16 Sep 20:15 → 22 Sep 19:30 UTC.
- **Best configuration (zero fitted constants):** plot = (SOFR Sep26 − Euribor Mar27, bp, **trade prices**, 15-min data, close) → EMA 2
  → × 0.1 + 1.445, with each value **plotted at its bar-OPEN time** (TradingView's labelling; our bars are labelled by close, so
  the formula series shifts one 15-min bar earlier).

| | RMSE | bias | level corr | 15-min change corr |
|---|---|---|---|---|
| bar-close labels | 0.071 | +0.007 | 0.943 | 0.203 |
| **bar-open labels (TradingView)** | **0.060** | +0.005 | **0.959** | **0.608** |
| Thu–Fri only | | | 0.983 | 0.697 |
| **Mon–Tue only** | | | **0.992** | **0.839 = the noise floor** |
| changes over 2 h | | | | 0.98 |

- **What mattered:** the one-bar labelling convention (0.20 → 0.61) and trade prices over midpoint (0.57 → 0.61). Higher-timeframe
  semantics (last closed bar vs developing bar) and the 15/30/60-min data timeframe are **indistinguishable** (identical scores), as are
  EMA 1–3 and source close/ohlc4/hl2 to within 0.05: those settings remain unpinned and do not need to be.
- **Verdict:** the line is reproduced to the limit the video allows. Remaining differences are inside the digitising noise floor.
