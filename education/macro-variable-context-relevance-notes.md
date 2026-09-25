# Macro Variable Context Relevance: notes

*Source: a short video walkthrough ("Macro variable context relevance"), taken from the
auto-generated transcript. That transcript garbles some words, such as "quarter 5" for
"quarter to 5", "bore" for "at four", and "quart 5". The readings below are the ones that
fit the chart timings described; where a reading is a guess, it says so.*

---

## The one-paragraph version

After a big up-move in the Nasdaq and growth stocks (about 16–23 Sept), the presenter shows
a **macro-derived series** next to the ordinary NQ CFD chart. The series is built by his own
Python script, uses inputs "such as short-term rates", and is imported into TradingView.

On two occasions the macro series moved first:
- **Friday 18 Sept:** the macro series made its low around 04:00 London; NQ made its low
  later.
- **Monday 21 Sept:** the macro series trended up for hours while NQ sat flat and
  mean-reverting, and NQ only broke higher at 14:15.

His point is **not** "trade this". It's that looking at the raw data is still how you find a
*hypothesis*. The hypothesis then has to go through the full pipeline:
1. characterise it, with an honest confirmation lag and no look-ahead;
2. source and clean the data;
3. split in-sample / out-of-sample / hold-out;
4. test direction and volatility with t-stats, p-values and later IC;
5. only then risk money.

The next videos promise PCA, residual analysis and splitting correlation from variance.

---

## Walkthrough by timestamp

| Time | What's shown | The point |
|---|---|---|
| 00:04 | NQ CFD chart, 16 → 23 Sept: a large move up in NQ and growth stocks | Sets up the example |
| 00:40 | Zooms into **Friday 18 Sept**; the key NQ low sits around "quarter to 5" London | The event being explained |
| 01:25 | "Looking at the OHLC data alone … there's probably some overfitting in hindsight you could use to say why this move happened … the chances of being able to repeat that are quite low" | A reason found on the chart after the fact is overfitting. He wants **outside context**: a variable from beyond the single asset. |
| 01:57 | Visualising a raw series "is towards the bottom of the list" once you're quantitative, but it still has value | Charts are for generating hypotheses, not for evidence |
| 02:36 | Switches to the **macro series**: Python-built, imported into TradingView, time-linked to the NQ chart | The macro series is his own construction; its full recipe isn't given (short-term rates are mentioned as one input) |
| 03:21 | At the same timestamp the macro series had already changed: its **low came at about 04:00**, "plenty of time to react" | The macro series led |
| 03:53 | **Confirmation lag:** at 04:00 you can't know it's a low. By **04:45** you can say "confidently" that the turn is priced in. At 04:45 NQ's own low had *still not* printed. | The only usable information is what's known **at 04:45**, not at 04:00 |
| 04:29 | "You could have been in a position to potentially have valuable information going into this" | Stated as a *potential* edge, not a demonstrated one |
| 05:10 | The research protocol: pull, source and clean data, then set windows and splits (**in-sample / out-of-sample / hold-out**). Calibrate in-sample, walk forward, test out-of-sample, then the hold-out last. | The same discipline as this repo's CLAUDE.md |
| 06:19 | **Monday 21 Sept:** NQ consolidating and mean-reverting through the morning; the big up-move and volatility arrive at **14:15** | Second example |
| 07:05 | The macro series "priced in higher prices ahead" through that whole window, then **stopped** rising at about 14:15, exactly when NQ took off | Second instance of the macro series leading |
| 07:54 | "That's only step one." Characterise it: the **look-back**, the confirmation time, direction, and whether the **volatility component** matters | From hypothesis to a test spec |
| 08:39 | "We don't want to characterise that was a low at 4 when we couldn't actually characterise that until 4:45 … no look-ahead, no future leakage" | The key coding lesson |
| 09:13 | Start with basic stats: **R², t-stats, p-values**; later **IC** (information coefficient) | Order of statistical tools |
| 09:50 | "Does this have predictive power? Positive expectancy? A large enough data set to validate it?" | The three questions before money |
| 10:29 | Measuring the lead: z-scores, but "keep it really basic" for now | |
| 11:05 | Coming next: **component splitting, PCA, residual analysis, splitting correlation from variance** | The follow-up series |

---

## The concepts, explained

### 1. Outside context vs. hindsight on one chart
Any single chart has countless patterns that "explain" a move after the fact: a sweep, a
level, a candle. With enough of them, one always fits. That's overfitting.

His alternative is to ask whether a **different, economically linked variable** knew
something first. For growth stocks the natural link is **short-term rates**. Growth-stock
valuations are long-duration cash flows, so they're sensitive to the discount rate, and a
fall in expected rates can show up in rates markets before equities react.

This is a **lead–lag hypothesis**: variable X moves at time t, and asset Y follows at
t + k.

### 2. The confirmation lag (the most important idea in the video)
A low is only a low once price has moved away from it. In his example:
- **04:00:** the macro series prints its low. Nobody can know yet that it's *the* low.
- **04:45:** enough time has passed to confirm the turn. **This is the earliest a system
  could act.**
- **NQ's low comes after 04:45.** The lead only counts if the NQ turn happens *after the
  confirmation time*, not merely after the macro low.

In code, any "turning point" feature must be stamped with the time it became
**knowable**, not the time the extreme printed. Stamping it at the extreme's timestamp is
look-ahead bias. Swing-point and zig-zag indicators are the classic source of this: they
repaint the pivot back to the extreme's bar.

This repo has hit the same trap: `deskEvidence: level-touch`, where a Sharpe of 5.36 came
from counting only touches that later "held".

### 3. Consolidation in the asset while the driver trends (Monday example)
The second pattern is different. It isn't about turning points. It's a **gap between a
trending driver and a flat asset**. The macro series climbs for hours while NQ
mean-reverts, and then NQ "catches up" once the driver stops.

A testable way to state it:

> *When the macro series' cumulative move over the last N hours is large (z-score) and
> NQ's is small, NQ's move over the next K hours is in the macro series' direction more
> often than chance.*

### 4. Direction vs. volatility
He separates two questions:
- **Direction:** does the lead predict *which way* NQ goes?
- **Volatility:** does it predict *how much* NQ moves (the 14:15 "big volatility")?

On this desk that separation matters. Several drivers have predicted **range** without
predicting **direction**:
- `iv-over-rv-wider`, `mv-vixterm-range`, `mv-dispersion-range` are validated for range;
- direction versions such as `yields-to-fx-direction` and `mv-dislocation-forward` are
  null.

So test them separately, and don't let a range result be read as a direction result.

### 5. The testing pipeline (as he lays it out)
1. **Visualise:** spot the idea. This is step one only.
2. **Characterise:** look-back window, confirmation time, what counts as a "move", which
   direction, which horizon.
3. **Data:** source it, clean it, align timestamps (time zones, and bar open vs bar close).
4. **Splits:** in-sample for calibration, out-of-sample walk-forward, then a hold-out
   touched once.
5. **Statistics:** R², t-stat and p-value first; IC later.
6. **Questions:** is it predictive, is the expectancy positive after costs, and is the
   sample big enough?
7. Only then any money.

### 6. What's coming (next videos)
- **PCA / component splitting:** break the cross-asset moves into shared components (e.g.
  a "rates" factor, a "risk" factor) and see which component leads.
- **Residual analysis:** what's left of NQ's move after the common factors. See
  `education/mean-reversion-of-residuals-notes.md` for the same toolkit applied to
  currencies.
- **Splitting correlation from variance:** a relationship can come from the two series
  moving together (correlation) or from one being more volatile (variance). They need
  separating before a beta or a lead is trusted.

---

## Reading it honestly

The presenter is careful, and the notes should be too:
- **Two examples from one week are anecdotes, not evidence.** He picked them *after* the
  big move, which is the same hindsight selection he warns about at 01:25, one level up.
  Did the macro series also "lead" on days when NQ then did nothing, or went the other way?
  Only a full-sample test can say.
- **The macro series is his own construction and isn't fully specified.** If any of its
  inputs are published or revised late, or it's smoothed with a centred or repainting
  filter, the lead can be manufactured. The confirmation-lag point applies to how the
  *series itself* is built, not only to how its turns are labelled.
- **What this desk has already found on lead–lag:**
  - `spread-leads-fx-hours` (null): the EUR/USD rate spread and the currency move together
    in the **same hour** (ρ −0.30), with no lead at +1h to +48h. That's a different
    instrument and driver, but it's the typical result: rates and risk assets are coupled
    *contemporaneously*, and a genuine hours-long lead is rare.
  - `yields-to-fx-direction` (null): "the relationship is real only in the same bar."
  - `price-vs-spread-divergence` and `mv-dislocation-forward` (both null): gaps between a
    linked driver and an asset did not reliably close toward the driver.
  - None of these tested **NQ against short-term rates intraday**, which is his exact
    claim. It remains untested here, not refuted.

---

## How we'd test it on this desk (sketch, not yet run)

To do this, the video's claim has to become a pre-registered test, as
`CLAUDE.md` requires:

| Item | Proposal |
|---|---|
| Driver | A **named, reproducible** short-rate series (for example the 2Y Treasury yield or SOFR/Fed-funds futures implied rate, intraday), not an unspecified composite |
| Asset | NQ / NAS100 M1 → 15-min bars (the bars he reads) |
| Feature A (turns) | The driver makes a swing low/high, **stamped at confirmation** (e.g. after a fixed retrace of k·σ, or N bars without a new extreme) |
| Outcome A | NQ's move over the next 1–4 hours from the **confirmation** bar, in the implied direction (rates down → NQ up) |
| Feature B (catch-up) | Driver's N-hour move z-score is large while NQ's is small (the Monday pattern) |
| Outcome B | NQ's direction and range over the next K hours |
| Controls | Same-hour matched days without a driver signal; shuffled driver timestamps (does the "lead" survive when timing is broken?) |
| Checks | Cross-correlation at leads −8h…+8h first (the `LEAD_LAG_TESTS.md` L1 method). If the lag-0 bar holds all the correlation, the idea is contemporaneous and stops there. |
| Splits | IS / OOS / hold-out, as he describes; ≥30 OOS events |
| Direction and range reported separately | Per concept 4 above |

**What each outcome would mean:**
- **A lead at +1h to +4h that beats the shuffled-timing control** in both IS and OOS: a
  real lead worth building on.
- **Correlation only at lag 0:** the same result as `spread-leads-fx-hours`. The macro
  chart gives context in the moment, not an early warning.

**Data limit:** intraday rate futures and yields aren't in this repo's feeds; FRED is
daily. A proper version needs an intraday rates source. Without one, this can't be tested
honestly here and shouldn't be run as a daily lookalike.

---

## Key takeaways

1. **Visualise to find ideas; test to believe them.** A chart is where a hypothesis
   starts, not where it's proven.
2. **Stamp every feature at the time it becomes knowable.** A low is known at confirmation
   (04:45), not at the print (04:00). This is the most common hidden look-ahead in
   price-pattern code.
3. **Look outside the single asset** for context with an economic reason to lead, such as
   short rates for growth stocks, rather than mining one chart for patterns.
4. **Separate direction from volatility.** On this desk, drivers have often predicted
   range but not direction.
5. **Two examples are a hypothesis.** The pipeline is: characterise → data → splits →
   stats → expectancy → sample size → money.
