# Range Extension Levels — Study Notes

> **Source:** Colez Trades, "Technical Execution Framework — Range Extension
> Levels" (single lesson).
> **Purpose of this file:** my own study notebook — learn the material, keep the
> definitions and mental models at hand, list the questions I'd be examined on,
> and record research/implementation ideas for this codebase. Written for
> future-me: re-read before touching anything range-extension-related.
>
> **House rule applies (CLAUDE.md):** notes on a *method* are not evidence of
> *edge*. §7 below is the honest-prior assessment. Unusually for these course
> notes, **this repo has already built and stress-tested this exact concept** —
> see `RANGE_EXTENSION_GUIDE.md` for what actually survived. Read §6 before
> getting excited, and read §6 again before rebuilding anything that already
> exists.

---

## 0. One-paragraph summary of the whole lesson

Take the Asia session range (00:00–06:00 London time), measured **close-to-close**
(bodies, not wicks) on the 5-minute chart. Project that range's size as multiples
into price space — 1x, 2x, 3x… above and below — by repurposing TradingView's
Fibonacci retracement tool with a custom level list (0, 0.25, 0.5, 0.75, 1, then
half-steps up to 10.5). Each level marks how far price has *expanded* relative to
the session's consolidation range; the further the extension, the more "stretched"
the move and the more likely exhaustion. The lesson's core conceptual point is
that these are **range extensions, not standard deviations** — a forward-projected
structural multiple of a defined range, not a backward-looking statistical
dispersion measure. The highest-conviction levels are **alignment zones**: places
where extensions from *today's* and *yesterday's* Asia ranges land within ~2 pips
of each other. Levels are zones where price *may* react, not guarantees — the
lesson explicitly defers to risk management.

---

## 1. Core concept — range extensions vs standard deviations

This is the lesson's one real idea, and the likely exam question.

| | Mathematical standard deviation | Range extension |
|---|---|---|
| **What it measures** | Statistical dispersion around a mean, from historical data | How far price has traveled as multiples of a *defined session range* |
| **Direction of inference** | Backward-looking (variance over a dataset) | Forward-projecting (structural levels ahead of price) |
| **Distributional assumption** | Typically assumes ~normality | None claimed — purely structural |
| **Anchor** | A mean + a lookback window | Today's (or yesterday's) Asia range |
| **What a "2" means** | Price is 2 SDs from the mean → a probability statement | Price has moved 2× the Asia range distance → an expansion observation, **not** a probability statement |

**Key sentence to remember:** *"A 2x extension means price has moved twice the
distance of the Asia range — this is a structural observation about market
expansion, not a statistical probability statement."*

**My gloss (important, not in the lesson):** the two are less different than the
lesson implies. The Asia range *is* a realized-volatility estimate in disguise —
for a driftless diffusion the expected high–low range is proportional to σ√t
(Feller; this is literally the math in `js/volBacktestEngine.js`:
`HL = BM_const × corr × σ`). So "2× the Asia range" is a crude, non-parametric,
single-sample cousin of "k·σ from the open." The honest distinction is:

- Range extensions use **one noisy sample** (today's session range) instead of an
  estimated σ — so they auto-adapt to today's regime but are much noisier.
- They anchor to the **range edges**, not a mean.
- They make **no probability claim** — which is intellectually honest but also
  means the lesson gives you nothing falsifiable.

The lesson's "critical distinction" is real for interpretation, but it should not
be read as "extensions are better than statistics." It means extensions are
*weaker claims* than statistics.

---

## 2. Mechanics — the setup, step by step

### 2.1 The Asia range (the foundational reference)

- **Window:** 00:00–06:00 **London time**.
- **Timeframe:** all analysis on the **5-minute** chart.
- **Measurement: closes, not wicks.** Draw from the highest candle *close* to the
  lowest candle *close* inside the window. Rationale given: *closes represent
  where price was accepted; wicks represent rejection.* (This matches our
  engines' "body range" convention — see §5.)
- **Data feed:** the lesson recommends OANDA for consistent timestamps (also our
  feed — convenient).
- **Chart timezone must be set correctly** — the range must be consistently
  defined across all analysis. (See §5 for the London-vs-UTC subtlety.)

### 2.2 Tool configuration

Repurpose the TradingView Fib retracement tool with these levels:

```
0, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5,
5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5
```

Notes on the grid: quarter-steps (0.25/0.5/0.75) exist only *inside* the range
(between 0 and 1); beyond 1 it's half-steps out to 10.5. Enable "use one color,"
save as a template.

### 2.3 Projecting extensions

- **Above price (potential short/sell exhaustion zones):** draw the tool from the
  **highest close → lowest close** of the Asia range. The multiples then ladder
  upward above the range.
- **Below price (potential long/buy exhaustion zones):** draw the **opposite
  direction — lowest close → highest close**. The same multiples ladder downward.
- Interpretation: each level = "price has traveled N× the Asia range." Far
  extensions = stretched move = candidate exhaustion, i.e. these are **fade
  levels** by construction (shorts above, longs below).

### 2.4 Alignment zones (the confluence layer)

- Repeat the whole projection on **yesterday's** Asia range.
- Where a level from today's set and a level from yesterday's set fall within a
  tolerance — **2 pips on EUR/USD** — mark a **confluence zone**. These are the
  highest-probability levels in the framework.

### 2.5 Daily checklist (verbatim, as the routine)

1. Current Asia range (00:00–06:00 London) identified and marked.
2. Extensions above projected (highest close → lowest close).
3. Extensions below projected (lowest close → highest close).
4. Previous session's extensions overlaid.
5. Alignment zones (levels within 2 pips) marked as confluence.

---

## 3. Key takeaways (the lesson's own, memorize for the exam)

1. **Range extensions ≠ standard deviations** — projecting multiples of a defined
   range forward, not calculating statistical variance.
2. **Extensions measure market expansion** — a 3x extension means price traveled
   three times the Asia range distance.
3. **Confluence amplifies probability** — multi-session alignment zones are the
   higher-probability areas.
4. **These are zones, not guarantees** — levels are where price *may* react;
   always combine with risk management.

Knowledge-check answer: range extensions **project multiples of a defined range
forward**; standard deviations **measure statistical dispersion from historical
data**. (The other options are distractors: they are *not* the same calculation,
and it is SDs that look backward, not extensions.)

---

## 4. What the lesson does NOT specify (gaps I must not paper over)

Writing these down because each one is a decision someone (me) has to make before
this is testable, and unstated degrees of freedom are where overfitting hides:

- **No entry trigger.** "Potential levels to short from" — but limit at the level?
  Wait for rejection? Which timeframe confirms?
- **No stop or target.** Not one word on exits. The lesson is a *level-generation*
  framework only.
- **No statistics.** Zero hit rates, zero expectancy, zero sample sizes. "May
  find exhaustion" is unfalsifiable as stated.
- **No cost model.** 2-pip confluence tolerance on EUR/USD is ~2× the typical
  spread — costs matter at this scale and are never mentioned.
- **Which extension levels are tradeable?** 1x? Only ≥2x? The grid goes to 10.5x
  but nothing says where the fade odds actually live.
- **When is a level valid?** Implicitly after the Asia session closes (you can't
  know the range before 06:00), but the lesson never says it. **This exact
  ambiguity was our Lie #2 (lookahead) in `RANGE_EXTENSION_GUIDE.md`** — the
  backtest that "traded" Asia levels during the window that defined them.
- **Session count for confluence.** Two sessions (today + yesterday) — why not
  three? Is more alignment better or just rarer?

---

## 5. How this maps to our codebase (read before building ANYTHING)

This is the rare course lesson where the repo is *ahead of* the material. The
concept is already a brick, an engine family, and a 412-line honesty log.

| Lesson concept | Already built as | Notes |
|---|---|---|
| The extension grid + `low + range × level` projection | `js/fibProjection.js` — `FIB_LEVELS`, `KEY_LEVELS`, `calcFibs()` | One brick, imported by `asiaRangeEngine`, `rangeFibEngine`, `confluenceModules`. Header literally says: *"These are RANGE-EXTENSION MULTIPLES, not statistical SDs"* — the lesson's Section 01 distinction, verbatim, already in the code. |
| Asia range from 5m bodies (closes, not wicks) | `js/asiaRangeEngine.js` → `bodyRange(m1, 5)` via `js/barUtils.js` | Matches the lesson's closes-not-wicks rule. |
| Project both directions | `FIB_LEVELS` spans **−9.5 … +10.5** | Our grid encodes "below" as negative levels off one anchor instead of redrawing the tool flipped — same levels, one draw. |
| Multi-session alignment (2-pip tolerance) | `asiaRangeEngine` `confluenceThresh` + `levelFilter: 'tight' / 'confluence' / 'asia_monday'` | We generalize: Asia×prev-Asia AND Asia×Monday-weekly cross-alignment. |
| Trading the levels | `js/rangeLineAnalyser.js` + `js/perLineStrategy.js` (`range-line-strategy.html`, `POST /api/range-line/run`) | The per-line fade/follow/skip policy learner — far beyond the lesson. |
| The honest results | **`RANGE_EXTENSION_GUIDE.md`** | The four-lies arc: Sharpe ~56 → ~24 → ~12 → ~7 → realistic ~2.5–5 single-pair after cost stress. Mandatory reading. |

**Differences between the lesson and our implementation — flag, don't silently
"fix":**

1. **Timezone.** Lesson: 00:00–06:00 **London**. Our engine: 00:00–06:00 **UTC**.
   Identical in winter; **one hour apart during British Summer Time** (~7 months
   of the year). Unknown whether it matters — testable (§8, idea R3).
2. **Level grid.** Lesson has quarter-levels only inside the range and half-steps
   to 10.5 outside; our `FIB_LEVELS` adds 1.25 and negative mirrors. Near-superset;
   trivial to replicate the lesson's exact subset via `calcFibs(low, range, subset)`.
3. **Confluence definition.** Lesson: fixed 2-pip tolerance, today-vs-yesterday
   Asia only. Ours: configurable threshold + Monday/weekly cross-session. The
   lesson's version is a strict special case of what's built.

**Lego consequence:** there is **nothing to build** to "have" this framework.
Anything new here must be a *test* (a spec run through the existing engines), not
an engine. Do not create `asiaRangeV2Engine.js` to chase this lesson.

---

## 6. What we already KNOW about this idea (evidence, not prior)

Because we tested it — this section outranks the lesson:

- **The naive version of this lesson's promise is a mirage.** Our first backtests
  of exactly this level set showed Sharpe ~56, then ~24 — all artifacts:
  independence inflation, **lookahead** (trading Asia levels during the Asia
  window), trend over-counting, and cross-pair pseudo-diversification
  (`RANGE_EXTENSION_GUIDE.md` §1).
- **What survives honest treatment is real but modest:** single pair (eurusd),
  one held position at a time, chandelier trail, 2–3× cost stress → **Sharpe
  ≈ 2.5–5**, drawdowns ~−2%, positive every walk-forward fold. That is the
  ceiling for this idea in our hands — not the lesson's implied effortless
  exhaustion-fading.
- **Fade is not universally right.** The per-line policy learner found some
  (line × condition) cells want **follow** (continuation), not fade. The lesson
  frames every extension as an exhaustion/fade level; our evidence says
  direction should be *learned per cell*, and that's the whole basis of
  `REVERSION_CONTINUATION_CONCEPT.md` / `dayTypeCore.js`.
- **Classification: folklore** (Asia-range levels, fib grids) per the CLAUDE.md
  map — but folklore we have unusually good in-house evidence on. The honest
  statement: *the level set is a useful scaffold on which a learned fade/follow
  policy shows a modest, cost-robust, single-pair edge; the levels themselves,
  traded naively as "exhaustion zones," are unproven and probably null.*

---

## 7. Honest-prior assessment of the lesson itself

- **What the lesson gets right:** the extensions-vs-SD distinction (interpretive
  honesty); closes-not-wicks (a defensible acceptance/rejection argument, and it
  reduces wick-noise sensitivity); "zones not guarantees"; anchoring level
  spacing to today's session range so levels auto-scale with volatility.
- **What it oversells:** "high-probability" appears throughout with zero
  probabilities attached. "Confluence amplifies probability" is asserted, never
  measured. The whole framework is level *generation*; the hard 90% (entry,
  exit, sizing, costs, validation) is absent.
- **Blunt odds, stated as a number:** as a *standalone* trading method exactly as
  taught (fade extensions at confluence, no learned policy) I'd put **~10–15%**
  on it surviving costs and a true OOS split — slightly above the generic
  folklore base rate only because our own harness found a related survivor. As a
  *level scaffold feeding the existing per-line policy engine*, it's already
  proven to the tune of Sharpe ~2.5–5 single-pair — but that credit belongs to
  the harness and the policy learner, not to this lesson.
- **The lesson's real value to me:** it documents the discretionary-practitioner
  workflow (tool setup, checklist, tolerances) that our engines automated — a
  useful cross-check that we implemented what traders actually do, and a source
  of small spec deltas to test (§8).

---

## 8. Research ideas / future tests (specs, not engines)

Pre-registering outcome criteria per CLAUDE.md — each is a run through existing
engines, judged on **OOS Sharpe with ≥30 OOS trades**, costs on:

- **R1 — Lesson-exact subset test.** Run `rangeLineAnalyser` with the lesson's
  exact grid (no negatives beyond mirroring, no 1.25) vs our full `FIB_LEVELS`.
  *Worked:* lesson subset OOS ≥ full grid (fewer, cleaner lines). *Didn't:*
  materially worse → grid choice is a real degree of freedom, keep ours.
- **R2 — Confluence-only filter.** Trade only levels with a within-2-pip
  yesterday-alignment vs all levels. *Worked:* per-trade expectancy up enough to
  offset the trade-count drop. *Didn't:* confluence is a rarity filter, not an
  edge amplifier — would directly falsify the lesson's central "alignment"
  claim. My prior: ~30% it helps after costs.
- **R3 — London vs UTC session window.** Re-run the incumbent spec with a
  DST-aware 00:00–06:00 London window. *Worked:* OOS improvement in
  summer-months subset. *Didn't:* noise → keep UTC (simpler, no DST plumbing).
  My prior: coin-flip at best; likely doesn't matter.
- **R4 — Closes-vs-wicks A/B.** `bodyRange` (current) vs wick high/low for the
  Asia range. Cheap, quantifies a convention we adopted without evidence.
- **R5 — Extension depth as a dayType feature.** "Max extension multiple reached
  by 10:00 London" as an input to `dayTypeScore` — a stretched early move is
  exactly the drift÷diffusion signal `dayTypeCore.js` formalizes. Test as a
  *selector input*, never a new tunable knob.

**Not worth doing:** rebuilding the projection logic (exists: `calcFibs`),
adding more grid levels (overfitting surface), or any multi-pair pooled headline
(Lie #4).

---

## 9. Areas of interest / open questions for future study

- **Why would extension multiples mark exhaustion at all?** Candidate mechanisms:
  (a) range ∝ σ so k× range ≈ kσ moves are simply rare (the SD view the lesson
  disavows but implicitly relies on); (b) self-fulfilling — enough traders
  watch session-range multiples; (c) intraday mean-reversion after fast expansion
  (documented microstructure effect, the most respectable cousin). The lesson
  offers none. Worth a literature pass on intraday overextension reversal.
- **Is the Asia range special,** or would any 6-hour pre-London window (or an
  ATR-scaled band) generate equally good levels? If a random window matches,
  the "Asia" story is decoration. Cheap placebo test on existing data.
- **Confluence tolerance scaling.** 2 pips is EUR/USD-specific. Should scale by
  pip size / ATR per instrument — `instrumentRegistry` + ATR gives this for free.
  What's the right normalization: pips, %ATR, or fraction of Asia range?
- **Relation to our σ-bands.** The vol forecaster projects `k·σ` bands from the
  Feller range math; range extensions project `k·AsiaRange`. Same family,
  different vol estimator (GARCH/HV20 vs one session's realized range). A
  head-to-head — which anchor better predicts reversal at touch? — would unify
  two strands of this codebase.

---

## 10. Glossary (quick exam recall)

- **Asia range** — high-to-low of 00:00–06:00 London, measured on 5m closes.
- **Range extension** — a level at `range edge ± k × range size`; forward
  structural projection, not a statistical measure.
- **Extension multiple (1x/2x/3x)** — how many Asia-range-widths price has
  traveled beyond the range.
- **Exhaustion zone** — a far extension where a stretched move *may* stall;
  fade-candidate by construction (shorts above, longs below).
- **Alignment / confluence zone** — extensions from two different Asia sessions
  within tolerance (2 pips EUR/USD); the framework's highest-conviction levels.
- **Closes-not-wicks** — ranges drawn on candle closes (acceptance), not wicks
  (rejection).
- **validFrom (ours, not the lesson's)** — a level is only tradeable once its
  defining range is complete; violating this is lookahead (Lie #2).
