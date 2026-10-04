# Analysis 2.0: where we are and where we're going

Written 2026-10-04 at the end of the session that built the Daily Read and the Surface Lab. It is the hand-over for two
pieces of work:

- **Session A** (the current one) **finishes the exhaustion schedule** (section 4).
- **Session B, "Analysis 2.0"**, runs the programme in section 5. Claude leads it, because it goes beyond what the
  owner already knows.

Read section 1 first. It is the standing brief.

**What Analysis 2.0 is (the owner's framing).** It takes the foundations already built and lifts each one to the next
level, as the Surface Lab did for the descriptive reads. Then it re-analyses everything we have together, so the site
gives **one better read with a stated, higher confidence**. It is not a hunt for unrelated new ideas. New data sources
(section 5, Track 2) come in only where they add information the foundations cannot.

---

## 1. The standing brief (from the owner)

1. **Teach new analysis.** Bring methods the owner has never heard of, explain them plainly, and apply them to this
   site's data. Do not bring more variants of what the site already does.
2. **COG's 3D chart is inspiration for principles, not a design to copy:**
   - put a whole system on one picture;
   - make time an axis;
   - smooth the noise so the regime shows;
   - link slices: a date gives the cross-section, a member gives its history.
3. **Everything refreshes itself.** A nightly server job feeds the page; never a fixed picture.
4. **Always show how a new analysis improves the existing systems** (bots, paper record, Daily Read, Vol Forecast,
   today.html), by name and concretely, on the page and in the reply.
5. **The target levels are the daily calculation behind vol-forecast-v3.html's "Export forecast" button**, recomputed
   every day. Every fade/continue test is measured against those levels (see section 6). Never use an approximation,
   and never treat one day's pasted numbers as fixed.
6. **The end goal:** an automatic system for continuation vs mean reversion at those levels.
7. **Be honest about uncertainty.** State overlap with existing pages. Never imply an edge before a pre-registered test
   says so. The owner explicitly called out over-confident framing.

---

## 2. What is built and live

| Thing | Where | What it does |
|---|---|---|
| **Daily Read** | `daily-read.html`, job `dailyRead`, KV `daily_read_v1` | Each night: tags each instrument CONTINUE / FAIR / EXHAUST from implied vol ÷ the lines' own σ. Scores each finished day against its ladder, keeps a running tally per tag, and picks a lesson from what happened. |
| **Surface Lab** | `surface-lab.html`, job `surfaceLab`, KV `surface_lab_v1` (permanent), `/api/surface-lab?field=` | Live 3D surfaces rebuilt every 12 h. See the field list below. |
| **today-reads** | `/api/today-reads` (~5 KB) | Compact pair / currency / global reads that today.html uses. |
| **today.html, pair drawer** | section "Today's lines: tag, moves & clock" | Tag; extending / giving back from 5m to 8h; live market clock; dollar share. Index drawers add the vol-curve front read. |
| **today.html, currency drawer** | "Dollar or own story? (60 days)" | Dollar share of the currency's USD pair, its crosses' persistence, and line tags. |
| **today.html, overview** | sidebar | "What is hedging what" card; curve regime line; Lines C·F·E and FX One-Trade cells; vol-curve line in Volatility Outlook; shortcuts in "The books". |
| **today.html, σ rich/cheap chip** | pair cards | Re-meant to the evidence: rich = lines too tight → breaks continue, a threat to fades. It used to say "fade spikes". |
| **Paper record context** | `paper-record.html` "context" column | Every live break stores `ctx` (tag, persistence by horizon, dollar share, concentration, clock) for a free forward test. |
| **Exhaustion Surface** | `exhaustion-surface.html` + Claude artifact | A static research picture of line calibration by IV ÷ σ. |

**The Surface Lab fields.** In every 3D chart, the white line is the picked member through time and the amber line is
the picked date's cross-section.

- **absorption:** PCA across 27 FX pairs (Kritzman 2011). PC1 is how much of FX is one dollar trade.
  The cross-asset mode covers FX, gold, silver, WTI, US/EU indices, the Nikkei and UST10Y, signed so equities load
  positive. It shows what is hedging what.
- **persistence:** the variance ratio (Lo–MacKinlay) at 30m–8h from 15-minute bars, plus 5m and 15m from the server's
  in-memory 1-minute bars, over 20 London days. Labelled extending / giving back. The word "trending" belongs to the
  HMM and is not used here.
- **vol time:** the share of each day's movement in each 15-minute London slot, as a 4-week mean.
- **rates:** the UST curve, weekly as a 5-week mean, with level / slope / curvature, a steepener/flattener label, and
  what the dollar, Nasdaq and gold did next.
- **vol term structure:** S&P VIX1D / 9D / 30D / 3M / 6M from CBOE, with the front (VIX9D ÷ VIX) and back (VIX ÷ VIX3M)
  ratios.
- **currencies** (inside absorption): equal-weight currency indices; the dollar share of each currency's USD pair.

---

## 3. What the evidence says (this session; the ledger is `js/deskEvidence.js`)

| Ledger id | Verdict | One line |
|---|---|---|
| `tag-x-persistence` | null | Tag × persistence at p75: both trades fail. The tag moves continuation odds; persistence adds little. |
| `skew-fade` | null | Options skew does not choose fades. The settlement risk-reversal read did not replicate on CVOL and is dropped. |
| `vol-curve-front` | **validated (range only)** | VIX9D ÷ VIX vs the **production** NQ/SPX lines: days past p75 are calm 18–19%, normal 24–27%, dear 32–33% (design 25%). It is not the event calendar. The trades fail. |
| `directional-rescore` | null | On the exact export levels (84k touches): drift has no direction at the touch. The tag gives a tiny continuation nudge. EXHAUST days stall rather than revert. Every line leans slightly toward continuation, and costs decide. |
| (diagnostic, not in the ledger) | — | Fade stop/target grid (48 combos): win rates 19–80%, **none positive net in either half**. The stop/target choice trades win rate against payoff on the same fair line. |

Descriptive first looks (`analysis/surfaces/*.md`, not pre-registered):
- **Absorption** describes risk but predicts nothing.
- **Persistence:** intraday moves partly give back (VR 0.97 / 0.93 / 0.91 at 15m / 1h / 4h).
- **The OANDA order book** at p75 is null (stop-heavy lines do not continue more).
- **The butterfly** does not change continuation.
- **The IV ÷ σ residual mechanism:** p75 range exceeded 13% / 22% / 35% by IV ÷ σ third.

### The principles these add up to (teach these)

1. **A well-calibrated distance-from-open line is a fair bet at the touch by construction.** It is the reflection
   principle. No price feature and no stop/target can beat it, because the spacing already prices what price knows.
2. **Edges only come from information the lines do not contain:**
   - options (as a WIDTH read: the tag for FX/gold, the curve front for indices);
   - real flow (orders, hedging, fixes, expiries);
   - time windows;
   - cheaper execution.
3. **Context sets how far the day goes, not which way a touch resolves profitably.** Use it to choose "continue or
   stand aside", to place exits, and to size.
4. **At these levels exhaustion means price stops, not that it reverses.** No fade at the lines pays; mean reversion is
   the losing side.
5. **The options market's level against the lines matters; its shape (skew, tails) adds nothing at the touch.**
6. **A high win rate is easy to buy and means nothing.** Judge everything on expected R net of costs.

---

## 4. Session A: finish the exhaustion schedule (in progress)

**Idea.** Replace "fade at a fixed distance" with **"is the day already done?"**. This is a probability surface:

- **across:** how far price has gone (share of the expected range used, in σ from the open);
- **depth:** vol time elapsed (the Surface Lab vol-time field and the live clock);
- **height:** the probability that the current running extreme is the day's final one;
- **one surface per state:** tag for FX/gold, curve front for indices.

It is built on the one exhaustion result that held out of sample: "is the high/low already in" is predictable.

**The exhaustion schedule.** Planned the night before and anchored to the open, so it is in prices at 00:00 London.
For each time of day, it is the distance at which "if this is the running high, it is ≥80% likely the day's high". It
steps closer through the day. Only the "has price reached it" check is live.

**Steps:**

1. Build the surface from 10 years of the exact export levels for **every forecast instrument**: 28 FX pairs, gold and
   the indices. State inputs:
   - the tag for the 6 CVOL FX majors and gold;
   - the front for NQ/SPX;
   - no state split, or the USD legs, for crosses. Let the test say whether it matters.
2. Pre-register two uses, both net of costs:
   - **(a)** stand-aside / take-profit for continuation trades at the schedule. Expected to work.
   - **(b)** a planned fade: short at the level with a stop just beyond the running extreme. Unproven. It pays only if
     price travels back meaningfully, not just stalls.
3. A new Surface Lab field. The nightly schedule goes into the Export forecast text and today.html (a live flag when
   price reaches it).
4. Pine: extend `pine/cog_volatility_v3_sessions.pine`. The same single paste draws the forecast lines plus a stepped
   exhaustion line and a live marker. Indices can compute the curve front natively in Pine with CBOE:VIX9D / CBOE:VIX.

**The system it implies:** continuation phase, then take profit and stop chasing at the exhaustion line, then a fade
only if (b) passes; otherwise stand aside.

---

## 5. Session B: Analysis 2.0, from foundations to one high-confidence read (Claude leads)

**The goal in one line.** Each night, for every forecast instrument, publish one read: how far today is likely to go,
which way a touch at each export line tends to resolve, and when the day is probably done. Each part carries a
**confidence grade earned from evidence**, not from how the chart looks. The automatic system (brief item 6) uses this
read directly.

**Why this route.** Section 3 shows that no single read is an edge on its own. What we have is several honest,
partly-tested reads: the tag, the curve front, persistence, vol time, absorption, rates and the exhaustion schedule.
Confidence goes up when we:

- measure how well each read is calibrated;
- strip out what it double-counts with the others;
- combine what is left;
- keep scoring the result in the open.

Each step below teaches a method the owner has not used yet, applied to data the site already has.

### Track 1: upgrade the foundations (do these in order)

Each step is pre-registered, follows the section 6 rules, and ends as a live Surface Lab field or Daily Read element
that refreshes itself.

1. **Score the ladder like a weather forecaster.** This is the base of every confidence claim.
   - **Today:** the lines' calibration is checked in one-off studies.
   - **Next level:** score every finished day nightly with PIT histograms, a reliability diagram per line (p25…p90) and
     CRPS. Do it per instrument, per tag / front state, and over a rolling window.
   - **Teach:** proper scoring rules; why a forecast can be sharp but uncalibrated.
   - **Improves:** Daily Read (a "how trustworthy are today's lines" badge), Vol Forecast (a calibration tab), and the
     evidence that decides every later step.
2. **Recalibrate the lines with what they leave out.**
   - **Today:** the tag and the front are read beside the lines. They show the lines are too tight or too wide by state.
   - **Next level:**
     - indices: a front multiplier in the NQ/SPX σ;
     - FX/gold: an IV-blended σ (HAR + IV, Busch–Christensen–Nielsen 2011).
   - **Test:** step 1's scores improve out of sample (fit 2016–20, check 2021–26). The rich-vol edge should fade
     against the blended lines, which proves the mechanism.
   - **Improves:** every bot, page and Export forecast at once. This is the biggest single lift in confidence.
3. **Turn the tag from three buckets into a calibrated probability.**
   - **Today:** CONTINUE / FAIR / EXHAUST from IV ÷ σ cut-offs. Gold and indices are provisional.
   - **Next level:** a continuous curve, IV ÷ σ → P(day passes p75 / p90), fitted per instrument with **partial
     pooling**. Thin instruments borrow strength from the group, and a credible interval comes with it.
   - **Teach:** empirical Bayes and hierarchical shrinkage; isotonic calibration.
   - **Improves:** Daily Read (a probability with an interval instead of a word), today.html chips, and the refit
     from section 7.
4. **The exhaustion schedule as a probability surface** (Session A's output, made part of the read).
   - **Next level:** P(the running extreme is final | distance used, vol time elapsed, state), with intervals. It is
     scored by step 1's method on the live tally.
   - **Improves:** take-profit and stand-aside timing for every continuation trade.
5. **Test the descriptive reads for incremental information.**
   - **Today:** persistence, vol time, absorption and rates are first looks. They are descriptive and not pre-registered.
   - **Next level:** for each one, ask whether it adds anything to steps 2–4, given those, out of sample. Keep only what
     does. Expect most to set **how far** (range and timing), not **which way** (principle 3).
   - **Teach:** incremental R² and log-score gain; why correlated signals must not be counted twice.
   - **Improves:** fewer, stronger elements on today.html. Fields that add nothing stay descriptive and are labelled so.
6. **Combine into one read with a confidence grade.**
   - **Method:** stack the surviving reads (logistic stacking or Bayesian model averaging). Wrap each output in a
     **conformal prediction interval**, which has guaranteed coverage with no distribution assumption.
   - **Grade:** derived from interval width, the agreement between reads, sample size, and evidence status (validated /
     candidate / descriptive in `js/deskEvidence.js`). The rule is written down before it is used.
   - **Teach:** stacking; conformal prediction; how evidence status should change trust.
   - **Improves:** this becomes **Daily Read 2.0** and the input the automatic system trades from.
7. **Forward-test it in the open.**
   - The paper-record `ctx` already logs each read at every break. Score the combined read on it each night.
   - Use **sequential testing** (an e-value / SPRT style rule) so we know when the live sample is enough to promote or
     drop a rule, without peeking bias.
   - **Teach:** anytime-valid inference.
   - **Improves:** the paper record becomes the promotion gate for the automatic system.
8. **Cost gate.** Compute the break-even cost per instrument for every rule that reaches step 7, and compare it with
   retail, ECN and futures costs. It is cheap; run it alongside step 2. A read can be right and still not be tradeable.

**What the owner sees at the end:** one Surface Lab field showing calibration through time (step 1), and a Daily Read
2.0 card per instrument with:

- the expected range with its interval;
- P(continue) at each line;
- the exhaustion time;
- a confidence grade, with a click-through to the evidence behind it.

### Track 2: new information (only after Track 1, and only where step 5 shows a gap)

These bring in data the foundations do not contain (principle 2). Each one must show it adds to the Track 1 read, not
merely that it works alone.

1. **Real order flow at the levels.** OFI (Cont–Kukanov–Stoikov 2014), aggressor delta, depth depletion. Databento CME
   trades + MBP-1 for 6E/6B/6J/GC/NQ; price it first. This is the only direct measurement of a level being defended.
2. **Selling the range with options** (the variance risk premium; Bollerslev–Tauchen–Zhou 2009). Short strangle / condor
   at the export p90. It needs an options account.
3. **Event and flow windows:**
   - news-surprise fade (+0.049 R near-miss; Savor 2012);
   - fix-window timing (Krohn–Mueller–Whelan 2024);
   - same-day 10:00 NY expiries (`oi_store`).
4. **Index break-shape rule.** 0.2σ stop, 5R target, gated by the front. It must hold on shorts.
5. **Lead–lag and transfer entropy.** Which market leads now. It goes in step 5 as a candidate if cheap enough.

### Already answered or parked

- **Breeden–Litzenberger "options' lines":** their width equals the tag, and skew / tails tested null at the touch.
- **Persistence-based fades:** weak once the tag is known.
- **The retail OANDA order book:** null at p75.
- **USD-factor sizing** (absorption PC1, which counts same-direction USD breaks as one position): a risk tool. Add it to
  the paper record when convenient.

---

## 6. How every study is run (non-negotiable)

- **Levels:** the exact daily export calculation.
  - `scripts/rangebook/common.mjs` `buildContext` / `targets` / `race` / `passesOf`, plus `js/voteAtlasV4Lines.js`
    `v4Days`. These are byte-identical to the live engine.
  - Event tags come from `scripts/v4/calendarProxy.mjs` (calendar to 2026-07-02).
  - The touch-table builder is `scripts/rangebook/directional_build.mjs`; outputs are gitignored and regenerable.
- **Known mismatches:**
  - The live page builds NQ σ from Yahoo NQ=F, while research uses OANDA NAS100.
  - The page's "SPX500" uses class-default params because the fitted ones are keyed "SPX". Build S&P as the page does.
  - Fix or state both.
- **Pre-register first:** `forge/<NAME>_PREREG.md`, committed before any number exists. Results go in a separate
  commit citing it, then a ledger entry in `js/deskEvidence.js` (domains: macro / events / positioning / price /
  volatility / execution).
- **Pass checks:**
  - both halves;
  - CI **clustered by date** (overlapping same-day touches are not independent);
  - ≥70% of instruments;
  - beats a shuffle within instrument × year;
  - positive at 2× costs;
  - longs and shorts both positive (indices especially).
- **Metrics:**
  - the directional share among resolved touches vs break-even (not "continue %", which mixes in stalls);
  - signed σ return at 15 / 60 / 240 min;
  - **gross and net R** side by side.
- **Data on the laptop** (no R2 keys needed):
  - M1 bars in `VolRangeForecaster/data/m1/` (2016 → 2026-08);
  - OANDA order/position books in `data/books/`;
  - CVOL in `cme_cvol_eod_available_history.parquet`;
  - settlement IV / RR / BF in `oi_research_book/data/`;
  - CBOE vol curves in `analysis/surfaces/cboe/`.

---

## 7. Open fixes noticed along the way

- NQ σ source (Yahoo vs OANDA) and the SPX500 params mis-key: see section 6.
- `js/serviceFlags.test.mjs` fails on Windows checkouts when `server.js` is CRLF, because it slices on `\n}\n`. This is
  harmless on Railway.
- The Daily Read tag cut-offs are research fits (gold and indices provisional). Refit once the live tally has about 20
  days per tag.
- The vol-curve front cut-offs (0.8858 / 0.9669) are frozen from 2016–20. Revisit after the front multiplier work.
- The rich-vol break rule is a **fragile candidate**: post-hoc, 2020+ only, tail-driven, one spread wide, and
  under-clustered. Keep it paper-only, and re-score its CI by date.
