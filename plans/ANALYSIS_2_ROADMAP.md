# Analysis 2.0: where we are and where we're going

Written 2026-10-04 at the end of the session that built the Daily Read and the Surface Lab. It is the hand-over for two
pieces of work:

- **Session A** (the current one) **finishes the exhaustion schedule** (section 4).
- **Session B, "Analysis 2.0"**, picks up the idea bank (section 5). Claude leads it, because it goes beyond what the
  owner already knows.

Read section 1 first. It is the standing brief.

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

## 5. Session B: the Analysis 2.0 idea bank (Claude leads)

Each idea lists: the concept to teach, the data, the test, and which existing system it improves. They are ranked by
expected value for the end goal.

### Tier 1: most likely to add real information

1. **Real order flow at the levels.**
   - **Concept:** order-flow imbalance (Cont–Kukanov–Stoikov 2014), aggressor delta, absorption, and book depth at
     levels (Kavajecz & Odders-White 2004).
   - **Why it matters:** it is the only direct measurement of "a level is being defended". Everything so far used
     broker tick counts.
   - **Data:** Databento CME GLBX.MDP3 trades + MBP-1 (6E, 6B, 6J, GC, NQ), about $0.50/GB with $125 free credit.
     Price it first.
   - **Test:** at export-level touches, does aligned OFI or depth depletion mean continue, and does absorption (high
     volume, opposite OFI, stalled price) mean fade? Net of futures costs.
   - **Improves:** the fade/continue decision itself, and every bot entry at the lines.
2. **Lower-cost execution / venue.**
   - **Concept:** the edges at the lines are 0.02–0.05 R gross, and retail cost is about 0.05 R.
   - **Test:** compute the break-even cost per instrument for CONTINUE-day follows, p90 follows and the rich-vol break,
     then compare with futures / ECN costs.
   - **Improves:** whether any continuation rule is tradeable at all. It is cheap to do; do it early.
3. **Selling the range with options (the variance risk premium).**
   - **Concept:** calibrated ranges are monetised by selling options beyond p90. On rich-option days the range was about
     0.82 of what options implied (Bollerslev–Tauchen–Zhou 2009).
   - **Test:** historical short-strangle or iron-condor at the export p90 vs the options' premium, with tail sizing.
   - **Improves:** it is the most direct use of what the forecast does well. It needs an options account.
4. **Recalibrate the lines with information they lack.**
   - **Indices:** fit a "front multiplier" in the production NQ/SPX σ beside the event multiplier (fit 2016–20, check the
     2021–26 calibration hits 25%).
   - **FX/gold:** an IV-blended σ (HAR + IV, Busch–Christensen–Nielsen 2011).
   - **Test:** calibration, plus showing that the rich-vol edge disappears against the blended lines (which proves the
     mechanism).
   - **Improves:** every bot and page that uses the lines, at once.

### Tier 2: new analysis worth teaching, with honest priors

5. **News-surprise fade.**
   - The best near-miss in the old book: +0.049 R, halves −0.031 / +0.093.
   - Pre-register it with release-time-safe timing (Savor 2012: moves with information drift, moves without it revert).
6. **Fix-flow timing.**
   - Krohn–Mueller–Whelan 2024: the USD rises into the Tokyo / ECB / London fixes, then reverses. Month-end continued
     +6.6pp in the book.
   - Re-score it on directional share, then test fix windows as time-defined fade or continue points.
7. **Same-day option expiries at the 10:00 NY cut.**
   - Pin vs repel at big-OI strikes expiring today. Only 54 touches were ever tested.
   - The data is in the nightly options capture (`oi_store`).
8. **Index break-shape rule.**
   - A 0.2σ stop with a 5R target was positive in most front states in VOL-CURVE-FRONT (an index-wide lead).
   - Pre-register it alone, with the tag/front as its on/off gate. It must hold on shorts.
9. **Lead–lag and transfer entropy (information flow).**
   - A surface of which market leads which right now (rates → dollar → gold → NQ), and how that changes.
   - Teaches Granger causality vs transfer entropy.
   - **Improves:** which chart to watch first; whether a break was "led" or isolated.
10. **Conditional outcome surfaces.**
    - The full distribution of what happened next for the current state (quantiles, tails), not an average.
    - Teaches distributional forecasting.
11. **Forecast scoring like a meteorologist.**
    - PIT histograms, reliability diagrams, CRPS for the daily ladder, scored nightly.
    - The calibration loop is the owner's north star.

### Tier 3: lower priority or already answered

- **Breeden–Litzenberger "options' lines":** skipped. Their width equals the tag, and skew / tails tested null at the
  touch.
- **USD-factor sizing:** use the absorption PC1 to count same-direction USD breaks as one position. A risk tool; simple
  to add to the paper record.
- **Persistence-based fades:** weak once the tag is known.
- **Retail OANDA order / position book:** null for continuation at p75.

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
