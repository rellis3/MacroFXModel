# Forecasting Tool · Walkthroughs — Study Notes

> **Lesson:** Reading and applying the daily vol & range forecaster — the
> High-to-Low and Open-to-Close chart walkthroughs, benchmarked against
> standard volatility-forecasting models such as GARCH.
> **Source material:** Colez Trades "Volatility & Range Forecast" video
> walkthrough series (EUR/USD, Gold, NQ examples). Distilled mechanics live in
> `MD files/FORECAST_MARKUP_TRADING_GUIDE.md`; these are my *study* notes on
> top of that — written for future me: revision, exam-style self-testing, and
> a map of where every concept already lives in this codebase.
>
> **How to use this file.** Skim the exam-cram card at the bottom before a
> live session. Read the critique section before building anything on top of
> the lesson. The research-ideas section is pre-registered per house rules —
> each idea states what "worked" and "didn't work" look like *before* any test
> is run.
>
> **House-rules lens** (per `CLAUDE.md`): every claim is tagged
> **[REPLICATED]** (documented in the literature), **[FOLKLORE]**
> (practitioner heuristic, weak after-cost evidence), **[INFRA]**
> (measurement/plumbing, not an edge claim), or **[UNVERIFIED]** (a claim made
> in the course that we have not independently confirmed).
>
> Companion file: `education/VOLATILITY_INTELLIGENCE_NOTES.md` covers the
> theory lessons (why vol is forecastable, regimes, sizing). This file covers
> the *applied* walkthroughs — how to actually read and use the two published
> numbers on a chart.

---

## The lesson in one paragraph

The forecaster publishes two numbers before the session: an expected
**High-to-Low range** (full candle amplitude, % of open) and an expected
**Open-to-Close move** (net drift, % of open), each with a median and a 75th
percentile. The walkthroughs teach the mechanical discipline of turning those
two numbers into chart levels: anchor to the 00:00 session open, wait for the
first extreme, project the H-L % to the *opposite* side, re-anchor every time
a new extreme prints, and overlay a symmetric ±O-C envelope around the open.
The trade is never directional prediction — it is **fading exhaustion at the
projected extreme**, filtered by how much of the day's "range budget" is
already spent. The course claims the underlying forecast beats GARCH,
realised vol, Parkinson and Harvey benchmarks **[UNVERIFIED — see critique]**.

---

## Walkthrough 1 — High-to-Low (the range projection)

### Lecture summary

The H-L number is a *distance*, not a level. It only becomes a level once the
day gives you an anchor:

1. **Bound the session** with verticals at 00:00 → next 00:00. The forecast
   is calibrated on the full calendar-day candle; anchoring from any other
   open (e.g. NY 14:30) makes every level drift. Non-negotiable.
2. **Mark the 00:00 open** — the denominator for all % maths.
3. **Wait** for the first significant (unbroken) high or low to print. Do not
   pre-place levels.
4. **Project the opposite extreme**: first extreme is a high → drag the H-L %
   *down* from it = Expected Low. First extreme is a low → project *up* =
   Expected High.
5. **Re-anchor dynamically** — the core discipline. Every new session extreme
   invalidates the old anchor: new low prints → re-project the Expected High
   from the *new* low. You never know which low is *the* low of the day; by
   always projecting from the most recent extreme, the projected level stays
   valid no matter what comes next.
6. **Maintain both sides simultaneously** (two-sided distribution rule):
   Expected Low from the current high AND Expected High from the current low.
   No directional bias before the market shows its hand.

### The trade at the level

Touching the level is a *watch zone*, not a signal. Confirmation requires:
touch → rejection (wick/stall) → close back on the correct side with no
recovery. Stop goes beyond the level; the 75th-percentile band is the hard
"the-forecast-is-wrong-today" override. Target is back toward the session
anchor/open — the range is already priced in, so the residual expectation is
mean reversion. **[FOLKLORE]** on the entry trigger itself (rejection wicks,
close confirmation are practitioner heuristics); **[REPLICATED]** on the
underlying premise that range is forecastable.

### The range-budget filter (the actual lesson gold)

```
budget consumed  = (session high − session low) / open
budget remaining = forecast H-L %  −  budget consumed
```

When most of the forecast range has printed, breakout/continuation
probability collapses and fading extensions becomes the statistically
favoured trade. Worked example: median 0.53%, price has covered 0.50% by
14:00 → remaining 0.03% is noise → any "breakout" is dubious. This reasoning
is **unavailable without a range forecast** — it is the genuine edge over
vanilla TA. **[INFRA + REPLICATED premise]** — the filter is measurement; its
after-cost tradability is what our conditional-fade research is testing.

### Key points to remember

- H-L % is a *distance budget*, not a support/resistance level.
- Anchor from **extremes**, not the open. The ±H-L around the open is the
  wrong picture; the range hangs off the day's high/low.
- Re-anchoring is not optional — a stale anchor gives a false Expected level.
- Median = working number (exceeded ~1 day in 2 by design); 75th = stretch
  reference (exceeded ~1 day in 4). Calibration targets, not magic.
- One day proves nothing. Grade forecast accuracy over ≥20 sessions.

---

## Walkthrough 2 — Open-to-Close (the close envelope)

### Lecture summary

Separately from the H-L projection, draw a symmetric envelope around the open:

```
upper = open × (1 + O-C%)      lower = open × (1 − O-C%)
```

The close is expected to land **inside** this band on a median day.

| Close lands… | Read |
|---|---|
| Inside envelope | normal session, no strong directional signal |
| At the edge | median trend day — directional bias confirmed |
| Outside envelope | 75th-pct stretch day — rare; do not chase it |

### The H-L × O-C interaction (the clever bit)

Once the H-L budget has been consumed **in one direction**, the O-C envelope
stops being symmetric in practice. Example: the full range printed high→low
(the low is in). A close back above the open would require *exceeding* the
range budget — so the model now points to a bearish close. The two forecasts
combine into a **close-location probability filter** without ever predicting
direction ex ante. Gold worked example: H-L 2.56%, O-C 1.22%, high printed
early → bearish close bias → session closed almost exactly on the projected
O-C level. **[INFRA]** — elegant conditional reasoning; a probability tilt,
not a guarantee, and its standalone after-cost edge is unproven.

### Key points to remember

- O-C is about **where the day settles**, H-L about **how far it travels**.
  Drift vs diffusion — the same split `dayTypeScore` T = drift÷diffusion
  measures in our engine.
- The envelope is drawn **both sides at once** and only becomes directional
  *after* the range budget resolves one way.
- O-C edge-touch = trend-day confirmation is the walkthrough's day-type
  classifier — a chart-reading version of what `dayTypeCore.js` computes.

---

## The GARCH benchmark framing

### What the course claims

The forecaster "outperforms GARCH, realised vol, Parkinson, and Harvey
benchmarks." Repeated across the videos; workflow checklist even says to
compare the annualised vol figure to GARCH output daily. **[UNVERIFIED]** —
we do not have the presenter's test, loss function, sample or costs, so per
house rules ("name the benchmark before claiming improvement") this stays an
unverified marketing claim until reproduced.

### What I actually need to know about the benchmark models (exam material)

| Model | One-liner | Uses | Weakness |
|---|---|---|---|
| **GARCH(1,1)** | σ²ₜ = ω + α·r²ₜ₋₁ + β·σ²ₜ₋₁ — vol clusters and mean-reverts | closes only | slow after shocks; needs fitting; close-to-close ignores intrabar info |
| **Realised / rolling HV** | stdev of last N close-to-close log returns | closes only | equal-weights old days; laggy |
| **Parkinson** | range-based σ from high-low: more efficient than close-close | H, L | assumes no drift, no gaps |
| **Harvey** (course's 4th) | likely Harvey-family realised-vol / stochastic-vol estimator | — | course never specifies — flag as vague **[UNVERIFIED]** |
| **Yang-Zhang** | combines overnight + open-close + Rogers-Satchell terms; drift-independent, handles gaps | O, H, L, C | window choice; still a lag-based estimator |

The honest ranking question is never "which model is fanciest" but **which σ
minimises out-of-sample forecast loss (QLIKE) against a realised-vol proxy**.
Range-based estimators (Parkinson/GK/YZ) extract more information per bar
than close-close; GARCH adds persistence structure; HAR-RV adds multi-horizon
memory. **[REPLICATED]**: range estimators are ~5-8× more efficient than
close-close in theory (Parkinson 1980); QLIKE is the robust loss for variance
forecasts (Patton 2011).

### How OUR stack already answers this — no need to trust the video

This is the part future-me must not forget: **we built the falsification
harness for exactly this claim.**

- `vol-forecast-bench.html` + `/api/vol-forecast-bench/*` scores every
  incumbent σ estimator per instrument on **OOS QLIKE** (and MSE) against a
  choice of realised proxies (Garman-Klass / squared return / Parkinson),
  with a true IS/OOS split, plus HAR-RV as challenger.
- Current incumbents (from that measurement, encoded in
  `js/volBacktestEngine.js`): **fx → Yang-Zhang(30)**, **commodity → HV20**,
  **index → GARCH(1,1) α=0.06, β=0.91**. So GARCH is not "the thing we
  beat" — it *is* our estimator where it wins (indices), and it lost OOS
  where something else was better. That is the correct relationship to a
  benchmark: horse-race it, keep the winner per class.
- The lesson's daily "compare to GARCH" ritual is, in our stack, just reading
  the bench scorecard occasionally to confirm the incumbent still wins.

---

## Where this all lives in MacroFXModel (the mapping table)

| Walkthrough concept | Our implementation | File |
|---|---|---|
| Published H-L / O-C numbers | `HL = BM_const × corr × σ`, `OC = HN_const × corr × σ` — Feller driftless-Brownian range constants `BM_P50=1.572`, `BM_P75=2.049`, `HN_P50=0.6745`, `HN_P75=1.1503` | `js/volBacktestEngine.js`, `js/forecastCore.js` (`computeBands`) |
| σ input per asset class | fx YZ(30) / commodity HV20 / index GARCH(1,1) | `js/volBacktestEngine.js` (`yzVolSeries`, `hvVarSeries`, `garchSigmas`) |
| Median/75th calibration | per-class correction factors, recalibrated 2026-07-07 to hit 50%/25% OOS exceedance (fx median 34%→50.2%; index recal overshot and was HELD) | `ASSET_PARAMS` + comment block in `volBacktestEngine.js` |
| 00:00 session anchor | London-midnight M1 open (`fetchSessionOpenLondon`, `londonMidnightSec`) — the OANDA 22:00-UTC D1 open drift is a *known solved bug* | `js/volBacktestEngine.js` |
| The forecast page | vol-forecast dashboard + Pine export of the levels | `vol-forecast.html`, `vol-forecast-v2.html` |
| GARCH-et-al. benchmarking | OOS QLIKE scorecard, HAR-RV challenger | `vol-forecast-bench.html`, `server.js` job |
| Range budget / exhaustion fade | fade-vs-follow engine: `dayTypeScore` (T = drift÷diffusion) → `selectStrategy`; per-line entry zone/confidence | `js/dayTypeCore.js`, `js/forecastCore.js`, `ENTRY_ZONE_CONFIDENCE.md` |
| Re-anchoring & level trading rules | markup mechanics, worked examples, mistakes table | `MD files/FORECAST_MARKUP_TRADING_GUIDE.md` |
| Forecast accuracy logging | calibration tracker + research book | `MD files/VOL_CALIBRATION_TRACKER.md`, `vol-research-book.html`, `forecast-book-report.html` |
| Known estimator drift | flagged divergence between live forecast constants and backtest | `VOL_ESTIMATOR_DRIFT.md`, `FUTURE_FIX_VOL_ESTIMATOR.md` |

**Lego reminder to self:** anything I build from this lesson *imports*
`computeBands` / `volSigmaSeries` / `simulateEntry` — never re-derives the
band maths. The plan producer deliberately does NOT read `/api/vol-forecast`
(its correction constants are flagged drift); it recomputes σ via
`volSigmaSeries`. Don't "simplify" that.

---

## Critique / honest read (before building anything)

- **"Built" ≠ "works" ≠ "has edge."** The walkthroughs teach *reading* an
  existing forecast — infrastructure and discipline. They do not demonstrate
  after-cost edge. The worked examples are hand-picked winning days; that is
  pedagogy, not evidence (survivorship in example selection).
- **The forecast itself is the replicated part.** Vol persistence and
  range forecastability: **[REPLICATED]**. Our own recalibration shows the
  median band can be made to hit its 50% exceedance target OOS — that's
  *calibration*, which is a property of a good forecast, still not a P&L.
- **The entry trigger is the folklore part.** Rejection wicks, stall candles,
  "climactic approach", close-confirmation — none of these have durable
  documented after-cost evidence. Blunt prior on "fade the touched band with
  wick confirmation" becoming a standalone tradeable edge: **~15-20%**. The
  fuller falsification already ran here: v1's fade legs and the day-type
  conditional work (`REVERSION_CONTINUATION_EVIDENCE.md`) show the effect is
  regime-conditional at best, not unconditional.
- **"Beats GARCH" needs a loss function to mean anything.** Beating GARCH on
  what — QLIKE? MSE? Band exceedance? Over what sample? Our bench answers
  this properly per instrument; the video asserts it. Also note the base-rate
  trap: a range-based estimator beating close-close GARCH on daily FX ranges
  is *expected* (more information per bar), not a discovery.
- **The 75th-percentile "hard stop" is a calibration statement, not a wall.**
  1 day in 4 exceeds it *by construction*. Using it as an invalidation level
  is sensible risk discipline; expecting price to respect it is a category
  error.
- **Anchor pedantry matters more than it looks.** The 22:00-UTC vs
  London-midnight open discrepancy produced real level drift here (gold
  3997.53 vs ~4013). The lesson's "non-negotiable 00:00 rule" is one of its
  most transferable points — and we learned it independently, the hard way.
- **Daily-bar walkthroughs quietly assume intrabar path knowledge.** "Price
  hit the Expected Low then rejected" is only verifiable on intraday data.
  Our anti-pattern list already bans assuming intrabar TP on D1 bars — M1
  fills or mark-to-close only.

---

## Self-test (exam questions)

1. The forecast H-L is 0.53%. Price opened at 1.0850, fell to a first low of
   1.0832, then made a new low at 1.0818. Where is the Expected High now, and
   why did it move? *(1.0818 × 1.0053 ≈ 1.0875; re-anchor to the most recent
   extreme — the old projection from 1.0832 is stale.)*
2. Why project the range from the extreme rather than draw ±H-L around the
   open? *(H-L is high-to-low amplitude, not open-centred; the open is rarely
   the extreme, so an open-centred band mislocates both ends.)*
3. Range budget: median 2.56% (gold), day has covered 2.4% by NY lunch. What
   does the model say about a fresh breakout, and what trade class is now
   favoured? *(Continuation probability collapsed; fade extensions.)*
4. The low is in and the full H-L has printed. What does the O-C envelope now
   imply and why? *(Bearish-close bias: closing above open would need the day
   to exceed its range budget.)*
5. Close lands outside the ±O-C envelope. What kind of day was it and what
   should you NOT do? *(≈75th-pct stretch day; don't chase, don't tighten
   stops to the median next day on the strength of one day.)*
6. Which loss function does our bench rank estimators by and why that one?
   *(OOS QLIKE — robust to noise in the realised-vol proxy, minimised by the
   true variance; IS fit is not evidence.)*
7. Which σ estimator does our stack use for FX, and where does GARCH actually
   win? *(Yang-Zhang(30) for fx; GARCH(1,1) is the incumbent for indices.)*
8. Why does the bot plan producer recompute σ instead of reading
   `/api/vol-forecast`? *(The live forecast's correction constants are
   flagged drift; plan lines must be bit-identical to the per-line book, so
   both source `volSigmaSeries`.)*
9. What are the two Feller constants for the median and 75th-pct H-L band,
   and what distribution do they come from? *(1.572 and 2.049 — driftless
   Brownian range distribution.)*
10. A touched band + rejection wick: replicated edge or folklore? What would
    upgrade it? *(Folklore entry on a replicated forecast; upgrade = OOS
    Sharpe > incumbent with ≥30 OOS trades, costs on, through the honest
    harness.)*

---

## Future research ideas (pre-registered, per house rules)

Each idea states the success and failure criteria up front so a null cannot
be re-narrated. Default expected outcome for all of these: **null** — that is
the base rate, and finding it cheaply is a win.

1. **Range-budget gate as a pure filter on the existing per-line fades.**
   Condition existing fade entries on budget-consumed ≥ X% (X pre-set at 60/80,
   two cells only). *Worked:* OOS Sharpe of gated set > ungated incumbent with
   ≥30 OOS trades. *Didn't:* no improvement or trade count collapses. Odds:
   ~25% — it's a restatement of information the bands already carry, but the
   conditioning is principled (a selector, not a knob).
2. **Reproduce the course's benchmark claim in-house, properly.** Add
   Parkinson and close-close GARCH-variant rows for *all* classes to the
   bench (mostly already there) and publish one scorecard: our per-class
   incumbent vs GARCH vs Parkinson on OOS QLIKE. *Worked:* incumbents hold or
   we switch and re-run band calibration. *Didn't:* n/a — this is
   measurement, it cannot fail, only surprise. **[INFRA]** — cheap, do first.
3. **Close-location bias as a day-type label.** Test whether "range consumed
   one-sided by hour H" predicts close-vs-open sign better than base rate.
   *Worked:* hit-rate beats the unconditional close-direction base rate with
   flat-across-years consistency, both IS halves agree. *Didn't:* ≤ base
   rate + noise. Odds: ~30% for statistical signal, far lower for after-cost
   tradability — say both numbers out loud if pitched.
4. **Re-anchoring frequency as a trend-day detector.** Count of intraday
   re-anchors ≈ number of new extremes ≈ trendiness; compare to
   `dayTypeScore` T. If they're near-duplicates (likely), fold it in as
   nothing new. *Worked:* adds OOS classification accuracy over T alone.
   *Didn't:* correlated ≥0.8 with T → discard, note in the book. Odds of
   incremental value: ~10-15%.
5. **75th-pct breach follow-through (the stretch-day tail).** On days that
   close outside the O-C 75th envelope, is there next-day continuation
   (vol-clustering says maybe) or reversion? Disaggregate by class; count the
   cells; state the multiple-testing baseline before looking. *Worked:*
   effect survives cells × chance-baseline and both IS halves. *Didn't:*
   scattered "winners" consistent with noise. Odds: ~15%.

**The bar stays forward-validation, not more building** — idea 2 (measurement)
and grading the live calibration tracker over more sessions rank above any
new engine.

---

## Areas of interest / reading list

- **Patton (2011)** — "Volatility forecast comparison using imperfect
  volatility proxies": why QLIKE/MSE are the only robust losses. The
  theoretical spine of our bench page.
- **Parkinson (1980), Garman-Klass (1980), Rogers-Satchell (1991),
  Yang-Zhang (2000)** — the range-estimator lineage; know why YZ handles
  overnight gaps and drift (it's our FX incumbent for a reason).
- **Feller (1951)** — range distribution of driftless Brownian motion; where
  1.572 / 2.049 / 0.6745 / 1.1503 come from. Worth deriving once by hand.
- **Corsi (2009)** — HAR-RV: the simple heterogeneous-horizon realised-vol
  model that is the bench's challenger entrant.
- **Engle (1982) / Bollerslev (1986)** — ARCH/GARCH originals; understand
  ω/(1−α−β) as unconditional variance (our GARCH seeds there).
- **Andersen & Bollerslev (1998)** — why realised vol from intraday data is
  the right "truth" proxy; connects to our GK-proxy choice.
- Open personal question: does the O-C/H-L ratio (drift share of total
  travel) have documented forecastability of its own? That underpins both the
  close-bias overlay and `dayTypeScore` — worth a proper literature pass
  before testing idea 3.

---

## Exam-cram card (one screen, pre-session)

```
NUMBERS   H-L% = travel budget (median ~1-in-2, 75th ~1-in-4 exceeded)
          O-C% = settle distance; envelope = open ± O-C%
MARKUP    00:00→00:00 verticals · ray at 00:00 open (London midnight!)
          wait for first unbroken extreme → project H-L% to OPPOSITE side
          new extreme → RE-ANCHOR, always · keep BOTH sides projected
BUDGET    consumed = (hi−lo)/open · spent budget ⇒ fade > follow
CLOSE     one-sided range consumed ⇒ close-bias to that side
          close outside O-C envelope = stretch day, don't chase
TRADE     touch ≠ signal · touch + rejection + close on right side = signal
          stop past level · 75th band = forecast-wrong override
          target = back to anchor/open · grade over ≥20 sessions, never 1
STACK     σ: fx=YZ30 · gold=HV20 · index=GARCH(1,1) — winners by OOS QLIKE
          bands = Feller const × class corr × σ  (import, never copy)
HONESTY   forecast = replicated · exhaustion entry = folklore (~15-20%)
          "beats GARCH" = unverified until it's a QLIKE row on our bench
```
