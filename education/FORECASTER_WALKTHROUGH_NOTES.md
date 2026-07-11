# Forecasting Tool · Walkthroughs — Lesson Notes

> **Lesson:** Reading and applying the daily vol & range forecaster — the
> High-to-Low and Open-to-Close chart walkthroughs, benchmarked against
> standard volatility-forecasting models such as GARCH.
> **Source:** Colez Trades "Volatility & Range Forecast" video walkthrough
> series. Instruments demonstrated: EUR/USD, Gold (plus an NQ-vol example).
> Full mechanical write-up: `MD files/FORECAST_MARKUP_TRADING_GUIDE.md`.
>
> **Purpose of this file:** my study notes on the lesson — what it teaches,
> the key facts to remember, the mechanics to be able to reproduce cold on a
> chart, and the open threads to investigate in future study. Revision
> before a live session; self-testing before "exams" (real implementation).

---

## The lesson in one paragraph

Direction is extremely noisy and professional models struggle to beat a coin
flip day-to-day; volatility is persistent and mean-reverting, so today's
*range* is meaningfully predicted by recent history. The forecaster
therefore publishes, before the session, how far price is likely to travel
(High-to-Low %) and how far it is likely to settle from the open
(Open-to-Close %), each with a median and 75th percentile. The walkthroughs
teach how to turn those numbers into chart levels — anchor at 00:00, project
from extremes, re-anchor as new extremes print, overlay the close envelope —
and how to trade **price exhaustion at the forecasted range extremes**. It is
a range-exhaustion model, not a directional model.

---

## Part 1 — The core idea

- Short-term direction ≈ unforecastable; range/volatility ≈ forecastable.
  The strategy **bypasses the hardest problem (direction)** and asks the
  answerable question: *"How far is price likely to travel today?"*
- Once the expected journey distance is known, watch **both ends** of the
  journey. When price arrives at one end and shows exhaustion — that is the
  trade.
- Framing to memorise: **not a directional model, a range-exhaustion model.**

---

## Part 2 — The three numbers needed before the session

| Number | What it is | Example from the videos |
|---|---|---|
| **High–Low range %** | expected full candle amplitude (high→low), % of open | 2.65% (NQ), 0.53% (EUR/USD) |
| **Open–Close move %** | expected net drift from open to close | 1.22% (gold) |
| **Percentile context** | where today's forecast sits vs the historical distribution | 75th = stretch day |

- The **median** is the working number. The **75th percentile** is the
  stretch reference — exceeded only ~1 day in 4.
- The forecast comes from the volatility model, which in the series is
  benchmarked as outperforming **GARCH, realised vol, Parkinson, and
  Harvey** (thread to verify later — see investigation list).
- **Rule:** get the numbers the evening before or early morning. Do not
  enter the session without them.

---

## Part 3 — Chart markup, step by step (the H-L walkthrough)

Tools: TradingView (or equivalent), Price Range tool, horizontal ray,
vertical line.

1. **Bound the session.** Verticals at `00:00` → next `00:00`. Everything
   lives inside these lines.
   - *Why 00:00?* The forecast anchors to the full 24-hour calendar-day
     candle. Reading the open from any other candle (e.g. NY open 14:30 UTC)
     makes **all** levels drift. Non-negotiable.
2. **Mark the session open.** Horizontal ray at the 00:00 candle's open,
   labelled `Open`. This is the denominator for every % calculation.
3. **Wait for the first extreme to print.** Do NOT project levels
   immediately. Let price establish the first *significant* high or low —
   "significant" = not yet broken when you check.
4. **Project the opposite extreme** with the Price Range tool:
   - First extreme is a HIGH → drag the H-L % **down** from it → bottom of
     the range = **Expected Low**.
   - First extreme is a LOW → drag the H-L % **up** from it → top of the
     range = **Expected High**.
   - Extend a horizontal ray at the projected level, labelled.
5. **Apply the O-C envelope** (see Part 7) symmetrically around the open.
6. **Re-anchor dynamically all session** — "the most important mechanical
   discipline in the whole strategy":
   - New low below the anchor low → move anchor to the new low, re-project
     Expected High from there.
   - New high above the anchor high → move anchor, re-project Expected Low.
   - *Why?* You don't know which low will be THE low of the day. Projecting
     from the most recent extreme keeps the Expected level valid regardless
     of what comes next.

Worked re-anchoring sequence from the videos (EUR/USD downtrend day, 0.53%):

```
09:00  low 1.0850 → project Expected High from 1.0850
10:30  new low 1.0832 → re-anchor, re-project
11:45  new low 1.0818 → re-anchor, re-project
13:00  price hits 1.0818 + 0.53% → WATCH FOR REJECTION
```

---

## Part 4 — Reading price exhaustion (the trade signal)

At the Expected High / Expected Low, watch for evidence the day has **used
its range budget**:

- touch → immediate reversal (strong rejection wick);
- approach → stall, multiple small candles failing to close through;
- volume drops into the level (if available);
- the move *into* the level is climactic — accelerating into the touch.

**Confirmation (all three):** price reaches the level → reverses → **closes**
back on the correct side (below the Expected High / above the Expected Low)
and does not recover. Until confirmed, the level is a **watch zone, not a
signal.**

The setup (both directions symmetric):

```
SHORT the Expected High:  low established early → Expected High projected →
                          price climbs to it → entry on touch + rejection
                          (e.g. rejection wick on 3m/5m at the level)
Stop:    above the Expected High (75th-percentile breach ⇒ forecast wrong today — exit)
Target:  back toward session low / open (range priced in ⇒ expect mean reversion)

LONG the Expected Low:    mirror image.
```

---

## Part 5 — The range budget (called "the most powerful intraday filter")

```
budget consumed  = (current high − current low) / daily open
budget remaining = forecast H-L %  −  budget consumed
```

As the budget is consumed:

- **breakout / continuation probability collapses;**
- **mean-reversion probability rises.**

Lesson example: median 0.53%; by 14:00 price has covered 0.50%; remaining
0.03% = noise; any "breakout" from here is statistically dubious — the
correct trade is fading extensions, not following them.

Key line from the lesson: this reasoning is **unavailable without a range
forecast** — it is the edge this approach has over vanilla technical
analysis. Rule of thumb from the checklist: **>80% consumed → fade-extension
bias kicks in.**

---

## Part 6 — The two-sided distribution rule

Always maintain both sides simultaneously:

```
HIGH side:  Expected Low projected from the current day's high
LOW side:   Expected High projected from the current day's low
```

- You never need to know which side is hit first.
- Covered regardless of the morning's direction; avoids the directional-bias
  trap.
- When one side is hit and confirmed, the other side tells you the remaining
  range.
- If the low→high distance already ≥ the forecast H-L, the probability of a
  *new* low is now very low — a natural stop to adding shorts.

---

## Part 7 — The Open-to-Close overlay

Project **±O-C%** symmetrically around the open (two rays or a box). The
close is expected to land inside on a median day.

| Close location | Meaning |
|---|---|
| inside the envelope | normal session, no strong directional bias |
| at the edge | median **trend day** — directional bias confirmed |
| outside the envelope | 75th-percentile stretch day — rare, do not chase |

**Combining H-L with O-C** — the key conditional read: if the forecast H-L
move has already been met **to the downside** (the low is in), the upside
close scenario becomes very unlikely, because a bullish close above the open
would require *exceeding* the range budget. The model then points to a
**bearish close**. A probability filter, not a guarantee — but it removes
the need to predict direction: **the range tells you which close scenario is
more likely.**

---

## Part 8 — Common mistakes (memorise this table)

| Mistake | Why it hurts | Correction |
|---|---|---|
| anchoring from the wrong candle | every level drifts | always the 00:00 open |
| not re-anchoring on a new extreme | stale level, wrong target | every new extreme → re-project |
| entering at the level without rejection | catching a knife | wait for rejection + close confirmation |
| trading against a level when budget = 0 | fighting exhausted momentum | check remaining budget first |
| ignoring the 75th percentile | stopped too tight on stretch days | 75th = override level if the median breaks |
| predicting which side gets hit first | directional bias before the market shows its hand | maintain both sides, let price decide |

---

## Part 9 — Worked examples (the four video case studies)

1. **EUR/USD, 0.53%.** Forecast posted the evening of the 28th for the 29th.
   High printed early → Expected Low projected 0.53% below. The high held
   most of the session; once price had priced in the low→high distance and
   closed below the forecast high with no recovery → **high of day
   confirmed**.
2. **EUR/USD, 0.52%.** Low broke → re-anchor; broke again → re-anchor again.
   Price then drove up to the Expected High projected from the *final*
   anchor low → **immediate rejection**, no candle closed above it again.
   Entry at the rejection, target back to the session lows.
3. **EUR/USD-style example at 2.65% (NQ-type vol).** 1:00 AM first
   significant high → Expected Low projected. 14:30 (NY open) price hit the
   Expected Low → strong rejection + close back above it → **low of day
   confirmed** since 1 AM. Entry at the NY-open rejection, target back
   toward the session high.
4. **Gold, the O-C overlay.** H-L 2.56%, O-C 1.22%. High printed early →
   Expected Low projected; no trade above the marked high all day; the
   session close tracked almost exactly to the forecast O-C level. H-L + O-C
   together gave a **bearish close bias** once the high was in.

Take-away pattern across all four: *anchor → project → re-anchor → wait for
the touch → demand rejection + close confirmation → target the other end.*

---

## Part 10 — Daily workflow checklist (condensed)

```
PRE-SESSION   read H-L% and O-C% (median + 75th) · note annualised vol,
              compare to GARCH output and recent history · verticals
              00:00→00:00 · ray at the 00:00 open · ±O-C% envelope
EARLY (1-3h)  wait for first significant extreme · project H-L% opposite ·
              label Expected High/Low · maintain BOTH sides
MID SESSION   re-anchor on every new extreme · track budget consumed ·
              >80% consumed → fade-extension bias · watch approaches
AT THE LEVEL  is this the Expected High/Low? · exhaustion on approach? ·
              rejection wick / stall? · wait for close confirmation ·
              stop beyond level (75th = hard stop) · target anchor/open
END OF DAY    was H-L met? was the close in the envelope? ·
              log: date | forecast % | actual % | level hit? | result ·
              grade accuracy over the SAMPLE, not this single day
```

---

## Part 11 — Key principles to internalise (the lesson's own six)

1. **Volatility is easier to forecast than direction.** Trade the thing
   that's forecastable.
2. **The forecast is a distribution, not a point prediction.** Median =
   working hypothesis; single days miss; calibration is over 20+ sessions.
3. **Range budget is the most powerful intraday filter.** Budget spent →
   stop trading breakouts; the edge has flipped to mean reversion.
4. **You never need to predict direction.** Two-sided distribution covers
   both scenarios; be ready at both ends.
5. **Confirmation before entry.** Touch ≠ signal. Touch + rejection + close
   on the correct side = signal. Be patient.
6. **Grade over the sample.** Days hit, miss, and overshoot; the edge is
   statistical and only visible over many sessions. Don't abandon the
   approach on one odd day.

---

## Background — the benchmark models named in the lesson

The series states the forecaster outperforms these four. Facts worth knowing
about each (study material, and the basis for future verification):

| Model | Key facts |
|---|---|
| **GARCH(1,1)** | σ²ₜ = ω + α·r²ₜ₋₁ + β·σ²ₜ₋₁. Captures vol clustering + mean reversion to ω/(1−α−β). Uses closes only. The lesson's daily checklist says to compare the forecast's annualised vol to GARCH output each morning. |
| **Realised / rolling HV** | stdev of the last N close-to-close log returns. Simple, laggy, equal-weights old days. |
| **Parkinson (1980)** | range-based σ from high-low; substantially more efficient per bar than close-to-close; assumes no drift, ignores gaps. |
| **Harvey** | named as the fourth benchmark; the videos don't specify the exact formulation — identify which Harvey model is meant (investigation thread). |

Related estimators to know for context: **Garman-Klass** (OHLC), **Yang-
Zhang** (adds overnight + open-close terms, drift-independent), **HAR-RV**
(heterogeneous multi-horizon realised vol). Standard forecast-comparison
loss: **QLIKE** (Patton 2011), robust to noisy realised-vol proxies.

---

## Where the tool lives in this codebase (pointers for applying the lesson)

| Lesson element | Implementation |
|---|---|
| the published H-L / O-C bands | `js/forecastCore.js` (`computeBands`); constants `BM_P50=1.572`, `BM_P75=2.049`, `HN_P50=0.6745`, `HN_P75=1.1503` in `js/volBacktestEngine.js` (Feller driftless-Brownian range distribution) |
| σ estimator per asset class | fx → Yang-Zhang(30), commodity → HV20, index → GARCH(1,1) α=0.06 β=0.91 (`volBacktestEngine.js`) |
| median / 75th calibration factors | `ASSET_PARAMS` per-class corrections (recalibrated 2026-07-07 toward 50% / 25% exceedance targets) |
| the 00:00 anchor | London-midnight M1 open — `fetchSessionOpenLondon` / `londonMidnightSec` |
| the forecast page | `vol-forecast.html` / `vol-forecast-v2.html` (+ Pine export of the levels) |
| estimator benchmarking (GARCH et al.) | `vol-forecast-bench.html` — OOS QLIKE scorecard per instrument |
| accuracy logging (Part 10's log line) | `MD files/VOL_CALIBRATION_TRACKER.md`, `vol-research-book.html` |
| markup mechanics source doc | `MD files/FORECAST_MARKUP_TRADING_GUIDE.md` |

(House rule when building from these notes: import the band math from the
core modules — never re-derive or copy it.)

---

## Self-test (exam questions)

1. What three numbers do you need before the session, and what do median vs
   75th percentile each mean in frequency terms?
2. Why must the session be anchored at the 00:00 candle, and what goes wrong
   otherwise?
3. Price opens 1.0850, first low 1.0832, new low 1.0818, forecast 0.53%.
   Where is the Expected High now and why did it move?
4. Why project the range from the day's extremes rather than drawing ±H-L
   around the open?
5. State the range-budget formula. Budget 2.56%, consumed 2.4% — what does
   the lesson say about a fresh breakout, and which trade class is favoured?
6. The full H-L has printed to the downside. What does the O-C envelope now
   imply for the close, and what is the mechanical reason?
7. List the three components of entry confirmation. What is a touched level
   before confirmation?
8. Where does the stop go, and what does a 75th-percentile breach mean?
9. What are the six common mistakes and their corrections?
10. Name the four benchmark models the forecaster is compared against, and
    one defining fact about each.
11. Reproduce the two-sided distribution rule and the reason you never
    predict which side gets hit first.
12. Over what sample size does the lesson say to grade the approach, and why
    not per-day?

---

## Future investigation threads (things to research off these notes)

Open questions to chase down later — not conclusions:

1. **Verify the benchmark claim in-house.** Which loss function / sample did
   the series use for "outperforms GARCH, realised vol, Parkinson, Harvey"?
   Reproduce the comparison on our data via `vol-forecast-bench.html` (OOS
   QLIKE) and record the result either way.
2. **Which "Harvey" model?** Identify the exact formulation (Harvey
   realised-vol? Harvey-Shephard stochastic vol?) and how it differs from
   GARCH-family models.
3. **Range budget as a measurable filter.** How does hit-rate on fades vary
   with budget-consumed at entry (e.g. <60% / 60-80% / >80%)? Does the
   lesson's >80% rule show up in our per-line book data?
4. **Close-bias overlay accuracy.** On days where the H-L printed one-sided,
   how often did the close actually land on that side vs the base rate?
5. **Re-anchoring frequency.** Does the number of intraday re-anchors relate
   to trend-day-ness (compare with `dayTypeScore` T = drift÷diffusion)?
6. **75th-percentile stretch days.** What happens the day after a stretch
   day — continuation (vol clustering) or reversion? Per asset class?
7. **Exhaustion signatures.** Which of the lesson's rejection signals
   (wick, stall, climactic approach) is definable precisely enough to test
   on M1 data, and what's the literature on each?
8. **Anchor sensitivity.** How much do the levels actually drift if anchored
   at 22:00 UTC vs London midnight vs NY open? Quantify on a sample.
9. **Feller constants.** Derive 1.572 / 2.049 / 0.6745 / 1.1503 from the
   driftless-Brownian range distribution by hand once, so the band formula
   isn't a black box.
10. **Reading list:** Parkinson (1980), Garman-Klass (1980), Rogers-Satchell
    (1991), Yang-Zhang (2000), Engle (1982) / Bollerslev (1986), Corsi
    (2009, HAR-RV), Patton (2011, QLIKE), Andersen & Bollerslev (1998,
    realised vol as the truth proxy), Feller (1951).

---

## Exam-cram card (one screen, pre-session)

```
NUMBERS   H-L% = travel budget · O-C% = settle distance
          median ≈ exceeded 1-in-2 · 75th ≈ exceeded 1-in-4 (stretch)
MARKUP    verticals 00:00→00:00 · ray at 00:00 open (never another candle)
          wait for first unbroken extreme → project H-L% to OPPOSITE side
          every new extreme → RE-ANCHOR · keep BOTH sides projected
ENVELOPE  open ± O-C% · close inside = normal · edge = trend day ·
          outside = stretch day, don't chase
BUDGET    consumed = (hi−lo)/open · >80% spent ⇒ fade extensions,
          breakout probability has collapsed
COMBINE   H-L met one-sided ⇒ close-bias to that side (needs budget excess
          to close the other way)
TRADE     touch ≠ signal · touch + rejection + close right side = signal
          stop beyond level · 75th breach = forecast wrong today, exit
          target = back toward anchor/open
DISCIPLINE grade over ≥20 sessions · log forecast vs actual daily ·
          never predict which side is hit first
```
