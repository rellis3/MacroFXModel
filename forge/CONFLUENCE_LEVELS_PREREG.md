# Confluence levels at the Vol Forecast lines — pre-registration

Committed 2026-10-01 before any number below was computed. New columns for the Fade/Continue Book
(forge/FADE_CONTINUE_BOOK_SPEC.md). Owner's question: do the levels retail traders watch (session
opens, previous-day opens and highs/lows, value area, naked POCs, golden pockets, fib extensions,
fair value gaps, round numbers) add certainty to whether price fades or continues at a vol line?

## The trap this design guards against
In 2026-09 the OI walls looked like they rejected price 68% of the time, but shifted copies of the
walls rejected just as often (project memory: OI wall-touch is an artefact). Any level near a vol
line also says something about the day's context (how far price has come from yesterday, for
example). So a level only counts as REAL if it beats a **placebo copy of itself shifted by a random
0.15–0.5σ** (random sign, seeded per date × level type), scored on the same passes the same way.

## Rows
Every non-same-bar pass of the Fade/Continue Book, 16 instruments pooled in σ units, 2016 → 2026-08,
same race outcomes (continue / fade / stall) and same net R.

## Level types (all from bars strictly before the pass bar)
"Previous day" = the previous NY-close (17:00 ET) daily bar, as on retail charts.
1. **sessionOpens** — Frankfurt 07:00 London, London 08:00 London, NY midnight 00:00 ET, NY 08:00 ET
   (the open of the first M1 bar at or after that time, only once that bar is before the pass bar).
2. **prevDayOpen** — previous day's open.
3. **weekOpen** — the week's first NY-close-day open (Sunday 17:00 ET).
4. **pdhl** — previous day high and low.
5. **pwhl** — previous week high and low (NY-close days of the previous calendar week).
6. **prevClose** — previous day close (17:00 ET).
7. **roundNum** — round numbers: every 50 pips on FX (0.0050; 0.50 on JPY pairs), every $10 on gold.
8. **fibGP** — golden pockets: the 0.618–0.65 retracement zones of the previous day's range, measured
   from each end (two zones per day).
9. **fibExt** — fib extensions 1.272 and 1.618 of the previous day's range beyond its high and low.
10. **poc** — previous day point of control (M1 tick volume, spread evenly over each bar's range,
    bins 0.02σ).
11. **valueArea** — previous day value area high and low (70% of volume around the POC).
12. **nakedPOC** — POCs of the previous 20 days that price has not traded through between the end of
    their day and the bar before the pass.
13. **fvgM15**, 14. **fvgH1** — fair value gaps (3-candle imbalance, candle i's low above candle
    i−2's high, or the mirror), formed in the last 5 days on a fully closed candle and not fully
    filled by the bar before the pass. A gap counts as a zone.

## Measures per pass and type
- **At the line:** a level (or zone) within **0.05σ** of the vol line (≈ 2.3 pips EURUSD).
  Robustness only: 0.10σ.
- **In the way:** a level between 0.05σ beyond the line and the continue target (secondary).
- **Stacked:** number of the 14 types at the line (0, 1, 2+) (secondary).

## Trend alignment (the owner's downtrend down-line bounce)
5-day trend = (previous day close − close 5 days earlier) ÷ (σ_day × open × √5). Touch is **with**
trend when the trend is > +0.5 and an up line is touched, or < −0.5 and a down line is touched;
**against** in the mirror case; otherwise flat. The owner's idea = in a downtrend, a down line
touched → bounce = FADE of with-trend touches. Tested both ways round.

## Tests (fixed)
**T1 — Is the level real?** For each type: the continue-rate difference (at the line vs not), taken
within each line-family × session × range-used cell and averaged with weight n_at·n_not/(n_at+n_not),
minus the same statistic computed with the placebo levels. 95% CI from a 1,000-draw bootstrap over
instrument-days. REAL = CI excludes 0 AND the same sign in 2016–22 and 2023–26.
For trend alignment the control is the same within-cell difference of with vs against (no placebo
exists for a trend; it is read as descriptive unless it also passes T2).

**T2 — Does it add certainty you can trade?** For each type's at-line passes, and for trend-aligned /
counter-trend passes: follow R and fade R (net of spread, the book's definitions). PASS = net R > 0
in BOTH halves, the pooled t-test survives Benjamini–Hochberg 10% across every type × direction
in this study, AND (for level types) T1 says REAL. A trading row that beats the book while its
placebo does too is geometry, not the level.

## What a result would look like
- REAL but T2 FAIL: the level changes what happens at the line, but not past what the line spacing
  pays — it goes into the book as a column (a better weather report), not a signal.
- REAL and T2 PASS: the first tradeable situation in this research line; it then needs a walk-forward
  check on 2026-09 onward before anyone builds on it.
- Not REAL: the level's apparent effect is the day's context, which the book already carries.

## Also planned (separate step)
OI walls need the NQ book (NQ is not in the 16); they were placebo-tested at random prices on
2026-09-23 (artefact). Run last, with the same placebo, only at the vol lines.

## Amendment (2026-10-01, before the OI step ran; levels T1/T2 numbers not yet seen)
OI walls run on the six book FX pairs that have a dated CME option archive (`OI Data/*.csv`:
EURUSD, GBPUSD, AUDUSD, USDCAD, USDCHF, USDJPY; 2020-09 →), not on NQ, which is not in the book.
- **oiWall** = the 5 strikes with the most open interest (calls + puts, expiries within 35 days of
  the OI date), converted to spot (1/strike for JPY, CAD, CHF, whose futures are quoted USD per unit).
- Publication lag: a London day uses the OI dated two business days earlier (Monday uses Thursday),
  so the file was certainly published before the day opened.
- Same measures, same placebo (0.15–0.5σ shift), same T1/T2 rules; scored on these six pairs, 2020-09
  onward only, and reported separately (its own BH family of 2 tests).
