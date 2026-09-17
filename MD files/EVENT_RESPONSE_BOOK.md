# Event Response Book — design + pre-registration

> **Status: DESIGN FROZEN 2026-09-17. Steps 1–2 (the brick and the descriptive
> book) BUILT AND RUN the same day — build log appended at the end, design
> untouched. §6's confirmatory cell is NOT run.** The design was written before
> any of the conditional cells below were computed, per the discipline in
> `CB_SENTIMENT_PRICE_TEST.md` / `POST_FOMC_DRIFT_TEST.md`. The data-inventory
> numbers in §3 were measured first (row counts and date spans — feasibility,
> not outcomes). No return, correlation or hit-rate in the design space below
> has been looked at.

## 1. The question, as asked

> "We have calendar data for each news event, we have the semantic analysis on
> FOMC, CPI, PPI, Beige Book, unemployment. Do analysis around what happened in
> each meeting from the output vs what happened with bond yields leading up to
> the meeting and afterwards — the impact on price up to the meeting
> (correlation in yield vs price) and then after the meeting the unwind or
> impact of that actual knowledge, again the correlation in yield moves (2/10/30
> and price), to give a historic answer for each pair of the impact of good
> news / bad news. Then on the webpage, trend analysis: if before a meeting
> yields moved up and the meeting confirms it, gold sells, EURUSD follows due to
> dollar strength. Not a trading system — analysis trying to analyse historical
> trends."

Reduced to its testable core, that is **three** distinct things, and they must
not be conflated:

| # | Claim | Class |
|---|---|---|
| A | Each release moves each pair by a characteristic amount (size) | Measurement — largely already built |
| B | The *outcome* (beat/miss, hawkish/dovish) explains the direction | Measurement — already built, already mostly null |
| C | **What yields did INTO the event** changes what the outcome does to price | **New. Untested here.** |

C is the actual new idea and it is the one worth building for. It is the
"was it already priced in?" question — the same thing a desk means by *buy the
rumour, sell the fact*. Everything else in this doc exists to make C measurable
honestly.

## 2. What already exists — do not rebuild it

| Thing | Where | Status |
|---|---|---|
| Per-pair event-day size + direction study | `js/macroRegimeFx.js` → `buildEventStudy`, surfaced in `today.html` ("What moves this pair, measured", `s.eventDayBehaviour`) | **Built.** 7 USD pairs only, FRED noon-ET daily snapshots, 8-year window, no gold, no crosses, no conditioning |
| Surprise index + release archive | `js/econSurprise.js`, `backfill/surprise_backfill.json`, KV `econ_surprise_v1` | Built |
| FOMC/ECB/BoE/BoJ/Beige Book semantic scores | `js/cbLexicon.js`, `js/fomcFetch.js` + engines, `analysis/fomc_event_study/fomc_lexicon_scores.json` (84 meetings, lexicon + LLM) | Built |
| Price↔yield coupling / gap / lead-lag | `js/yieldCouplingCore.js` | Built, **classed context-only** |
| Today's news playbook (beat/match/miss scenarios) | `today.html` `renderNewsPlay` | Built — the scenarios are *textbook*, not measured |

**Three banked nulls this design must not re-run** (`CB_SENTIMENT_PRICE_TEST.md`,
`FOMC_SURPRISE_MAGNITUDE_TEST.md`):

1. The initial 30-minute FOMC reaction does **not** predict the next-day dollar
   move (N=82, sign agreement 46.3%, t=0.32).
2. Δhawkishness (lexicon) does **not** predict the next-day move (t=−0.75) —
   although it *is* visibly priced inside 30 minutes (t=2.04), so the scorer
   measures something real.
3. |Δhawkishness| does not predict move **size** either (t=0.54). The FOMC day
   is the vol event; the text delta adds nothing to magnitude.

**One banked pass:** the unconditional post-FOMC USD drift — +26.3bp over the 5
trading days after each meeting, 99.8th placebo percentile, near-identical in
both halves (`POST_FOMC_DRIFT_TEST.md`). Calendar-only: it needs no text input.

That evidence sets the honest frame for this build. The market prices the
*statement itself* within half an hour. So the only place left where history can
inform the next event is **the state the market was in before the event** —
which is exactly what §1's claim C proposes and what
`CB_SENTIMENT_PRICE_TEST.md` itself named as the surviving branch ("Stage 3's
design must shift to pre-positioning or die").

## 3. Data inventory (measured 2026-09-17, offline, no network)

| Source | Path | Coverage |
|---|---|---|
| M1 OHLC, 26 instruments incl. **gold** | `VolRangeForecaster/data/m1/*_m1.parquet` | 2016-01-04 → 2026-09-08 (usdjpy → 2026-08-20); ~3.8M bars/pair; carries `spread_open` on most |
| Daily US yields 2y / 10y / 30y + real10 + breakeven | `analysis/output/yield_coupling/yields.csv` | 2005-01-03 → 2026-08-21, 5,646 rows — **already in the repo, no FRED key needed** |
| Release archive (ForexFactory titles — joins to the LIVE feed) | `backfill/surprise_backfill.json` | 26,403 rows 2007-01 → 2025-04; **9,813 rows inside the M1 window**, of which high-impact by country: US 2,248 · GB 746 · CA 676 · AU 575 · EU 384 · NZ 225 · CH 56 · JP 27 |
| Second calendar (different vendor) | `calendar_events.csv` | 2014 → 2026-07, 102,760 rows; "Major" tier is **USD/EUR/GBP only** (2,722/355/481 with both actual and consensus) |
| FOMC decision days, market-validated | `js/fomcHistory.js` | 82 scheduled meetings 2016→2026, every one passing the 14:00 ET spike check |
| FOMC hawkishness per meeting | `analysis/fomc_event_study/fomc_lexicon_scores.json` | 84 statements, lexicon + LLM |

Sample sizes for the biggest series **inside the M1 window** (the binding
constraint on every conditional cell below):

```
US Unemployment Claims 217 · US Unemployment Rate 112 · US NFP 112
US CPI y/y 111 · US Retail Sales 110 · US ISM Manufacturing 108
US CPI m/m 105 · US Core CPI m/m 104 · US ISM Services 99 · US PPI m/m 88
GB CPI y/y 96 · CA CPI m/m 89 · AU Employment Change 110
US Federal Funds Rate 60(high)+13 · GB Bank Rate 66 · EU Refi 65 · BoJ 22 · SNB 13
```

**Two joins that must not be fudged.** (a) The two calendars use different event
vocabularies — only ~16 of ~380 titles overlap, which is why
`scripts/build_surprise_backfill.mjs` deliberately uses the FF archive alone.
Same rule here: **FF titles only**, because the live feed the news panel renders
is also FF, so history joins to today's event by title. (b) The FF archive stops
2025-04; releases since then live in the server's KV store
(`econ_surprise_v1`, `maxAgeDays: 4000`). The offline book therefore covers
2016-01 → 2025-04 and the server-side refresh extends it to today. Every cell
carries its own `from`/`to` and `n` — no silent stitching.

## 4. What gets measured (frozen)

### 4.1 Windows — all M1, all UTC, all anchored on the release timestamp `t`

| Name | Definition | Answers |
|---|---|---|
| `PRE5` | close(t −5 trading days, same clock) → close(t −5min) | what the pair did INTO the event |
| `R0` | close(t −1min) → close(t +30min) | the instant repricing |
| `R1` | close(t +30min) → same clock next trading day | the day-after digestion |
| `R5` | close(t +30min) → same clock 5 trading days later | the unwind / drift |

Shapes deliberately identical to the Stage-1 FOMC study so the numbers are
comparable to the banked nulls rather than a new incompatible set.

### 4.2 The lead-up state (the new conditioning variable)

Computed **strictly before `t`**, from daily yields only — no intraday yields
exist offline and none are invented:

- `d2y5` = 2y yield, close(t−1 session) − close(t−6 sessions), in bp.
- `d10y5`, `d30y5` the same; `dSlope5` = Δ(10y−2y).
- `leadState` ∈ {`priced-hawkish`, `flat`, `priced-dovish`} by the sign of
  `d2y5` with a dead-zone of ±(0.5 × the series' own 5-day |Δ| median over the
  sample). The dead-zone is defined from the yield series alone, never from
  returns, so it cannot be tuned against the outcome.
- `preCoupling` = correlation of the pair's PRE5 daily returns with `d2y` daily
  changes over the trailing 20 sessions, via `yieldCouplingCore.rollingCorr` —
  imported, never re-implemented (Lego rule 1).

### 4.3 The outcome

- **Data releases:** `surprise_z` = (actual − consensus) ÷ that series' own
  historical surprise dispersion, using `econSurprise`'s parser and sigma —
  imported. (`parseFloat` on calendar strings is silently wrong: `'1,250'` → 1.)
  Sign convention from `econSurprise.INVERTED_HINTS`; anything unmatched is
  marked `polarity: 'assumed'` and reported as such.
- **Central-bank meetings:** `dScore` from `cbLexicon` (FOMC has 84 scored
  statements; ECB/BoE/BoJ have engines and thinner history). The banked nulls
  say this predicts nothing on its own at daily horizon — it enters here **only**
  as the interaction partner for `leadState`, which is a question nobody has run.
- **Bucket:** `beat` / `in-line` / `miss` for the event's own currency, in-line
  being |surprise_z| ≤ 0.25.

### 4.4 The cell grid, and the instrument list

Per **event series** × **instrument** (26 pairs + gold):
`leadState` (3) × outcome (3) = 9 cells, each reporting `n`, median and mean
`R0`/`R1`/`R5` in bp, up-rate %, and the same figures for the earlier and later
half of the sample.

Hard display rules, enforced in the brick, not left to the renderer:

- `n < 12` → the cell is **omitted entirely** (matches `buildEventStudy`'s
  `minObs`). Not greyed, not shown small — omitted.
- Any cell whose sign flips between halves is flagged `unstable: true` and every
  surface must render it as noise however large the mean, exactly as
  `regimePrecedent` already does.
- No p-values on the descriptive grid. `R5` windows overlap for weekly series;
  the honest statistic is `n`, the split, and the effect size.

## 5. Multiple testing — the thing that would make this dishonest

27 instruments × ~15 event families × 9 cells × 3 horizons ≈ **11,000 cells**.
At a 5% threshold that is ~550 "significant" findings from pure noise, and a UI
that surfaces the top few by effect size is a machine for displaying exactly
those. This is the single biggest risk in the whole idea and the design answers
it three ways:

1. **One confirmatory test** is registered (§6). Everything else in the book is
   **descriptive** and must be worded as history, never as prediction.
2. The grid is built **pooled-first**: the headline number for an event family
   is the dollar-basket (or the pair's own) pooled cell; per-pair disaggregation
   is shown underneath with its n, per the "pooled nulls hide subset edges — but
   count the cells" rule in `CLAUDE.md`.
3. The page states the cell count and the chance baseline in its own footer:
   "N cells shown; at 5% you would expect ~M to look significant by chance."

## 6. Confirmatory cell (ONE, frozen)

**Hypothesis.** The post-event move depends on the *interaction* of the surprise
with what was priced in beforehand — a hawkish surprise into a market that has
already sold bonds for a week is not the same event as the identical surprise
into a flat market.

**Test.** On the dollar basket (the same equal-weight USD basket validated in
`CB_SENTIMENT_PRICE_TEST.md` Stage 1 — 7 pairs, one series, one test), pooling
the US high-impact families {FOMC, CPI y/y, Core CPI m/m, NFP, ISM Manufacturing,
PPI m/m}:

```
R1  ~  β0 + β1·surprise_z + β2·d2y5_z + β3·(surprise_z × d2y5_z)
```

**PASS** iff `β3` has |t| ≥ 2, N ≥ 150 events, **and** `β3` keeps its sign across
the 2016–2020 / 2021–2026 halves. **FAIL** otherwise. `β1` alone re-tests known
territory and carries no pass/fail weight.

**What each outcome buys:**

- **Pass** → the "priced-in" conditioning is a real conditioner, and a spec
  ("fade the event when the lead-up already moved N bp in the surprise's
  direction") earns its own pre-registration with costs and an IS/OOS split. It
  does **not** go live off this test.
- **Fail** → banked, and the book ships anyway as **descriptive context only**:
  the news panel says what happened before, with n, and never claims it
  predicts. A null here closes the pre-positioning branch that
  `CB_SENTIMENT_PRICE_TEST.md` left open, which is worth having either way.

**Prior knowledge, stated as context and not as a verdict** (`CLAUDE.md` —
don't prejudge, no odds before the run): the published pre-FOMC drift result
(Lucca–Moench) is about the *pre*-announcement window, which is not what β3
tests; "priced in" is desk folklore with, as far as this repo knows, no
replicated FX evidence attached; and this platform's own event work has produced
three nulls and one calendar-only pass. The test decides.

## 7. Output — how this reaches the screen

Three surfaces, in build order. The wording matters as much as the maths: every
line carries `n`, and nothing says "will".

### 7.1 `today.html` news panel (the main ask)

Each high-impact event in `renderNewsPlay` gains two things above the existing
beat/match/miss scenarios:

**A "priced in" chip** — live state, no history needed:

> 🇺🇸 **CPI y/y** · 13:30 · expected 2.9% · was 3.1%
> **Into this print:** US 2y **+14bp** over 5 sessions, 10y +9bp, curve
> flatter — *the market has already moved toward the hawkish outcome.*

**A measured history line** — the book's cell for (this event × this pair ×
current `leadState`), replacing nothing, sitting under the scenarios:

> **What happened before, on this pair:** across **18** CPI prints that came in
> *hot* with the 2y **already rising** into them, EURUSD's next-day move was
> **−0.11% median, 12 of 18 lower**. On the **9** hot prints where the 2y had
> *fallen* into them: **+0.04% median, 5 of 9 higher** — a coin flip. Both
> halves of history agree on the first row. *History, not a forecast.*

And the honest empty state, which must be as visible as the full one:

> **No measured history for this combination yet** (n=7, below the 12 needed).

Gold gets the same treatment and is the one instrument where the user's example
("gold snaps sell") is directly checkable, since gold is in the M1 set.

### 7.2 `event-response.html` — the research page

The full grid, the repo's standard research-page shape: pick an event family →
matrix of instruments × cells, every cell showing median/mean/up-rate/n and the
half-split, `unstable` rows flagged, `n<12` omitted, and the multiple-testing
footer from §5. This is where "trend analysis" lives properly — with the sample
sizes visible, which a one-line summary in the news panel cannot carry.

### 7.3 The AI snapshot

`assembleSnapshot` already ships `eventDayBehaviour`; it gains
`eventResponseConditional` in the same shape (rows + a `note` that states the
descriptive-only status in the same words as the UI), so the model reasons from
the measured cells rather than restating the textbook scenarios.

## 8. Build plan (bricks, per `CLAUDE.md` §Lego)

| Step | Artefact | Notes |
|---|---|---|
| 1 | `js/eventResponseCore.js` — **Tier 1, pure** | `(bars, events, yields, opts) → book`. No network, no DOM, no asset knowledge. Imports `econSurprise` (parse + sigma), `yieldCouplingCore` (rollingCorr), `statsCore`, `newsCalendar.pairCurrencies`. Unit-tested on synthetic events (`js/eventResponseCore.test.mjs`) incl. an off-by-one fixture like the one that caught `buildEventStudy` |
| 2 | `scripts/build_event_response_book.mjs` | Runs offline against the M1 parquets + `yields.csv` + `surprise_backfill.json`; writes `backfill/event_response_book.json` (committed — same build-here/run-there split as the surprise backfill; the 1.6GB M1 set is untracked) |
| 3 | `analysis/event_response/confirm_cell.py` | §6's single registered regression. Results appended to **this** file, design untouched |
| 4 | `GET /api/event-response` | Serves the committed book, merged with KV releases after 2025-04 |
| 5 | `today.html` panel + `event-response.html` | §7.1 and §7.2 |
| 6 | `LEGO_MODULES.md` + `BACKTEST_INDEX.md` rows | Registration is part of "done" |

Steps 1–2 are pure measurement and can run entirely in a sandbox. Step 3 is the
only thing with a pass/fail attached.

## 9. What could make this worthless — stated before running

- **Cell thinness.** 9 cells on a 110-print series is ~12 per cell before any
  half-split. Most per-pair conditional cells will fail the `n ≥ 12` bar and
  correctly disappear. The book may be mostly empty, and if it is, that is the
  finding.
- **One policy era.** 2016–2026 contains ZIRP, a hiking cycle and a cutting
  cycle, but only one of each. "Yields rose into the event" in 2019 and in 2022
  are not the same regime, and the half-split is a weak control for that.
- **Event-title drift.** FF renames series ("Unemployment Claims"); a rename
  silently splits a sample. The builder must report every title whose gap
  exceeds twice its own cadence.
- **Gold's dollar beta** may swamp any event-specific effect; it is reported
  next to the dollar-basket cell so the two can be compared rather than confused.
- **The banked nulls are the base rate.** Three registered tests on this exact
  event family have already come back empty. Nothing here is entitled to a
  different outcome.

---

## Build log — steps 1–2, narrow slice (2026-09-17, design above untouched)

Built: `js/eventResponseCore.js` (+ 15 synthetic-data subtests) and
`scripts/build_event_response_book.mjs` → `backfill/event_response_book.json`.
Scope as agreed: **FOMC / US CPI y/y / US NFP × the 7 USD pairs + gold**.
Registered in `LEGO_MODULES.md` §1bf. §6's confirmatory cell is **not** run.

### Two data bugs the join proof caught (both pre-existing, both real)

**1. `js/localM1Loader.js` returned an all-zero time axis for most pairs.** It
hardcoded `r[5]` as the datetime column; the local M1 cache is mixed — `usdjpy`
has 6 columns, `eurusd` / `gbpusd` / `gold` and others have 8 — so on the 8-column
files it read a spread column as a timestamp and produced exactly the silent
failure its own header was written to warn about. Fixed: the column is now located
per file, and a file whose timestamps do not resolve throws instead of returning
zeros. Other consumer: `scripts/run_session_window_comparison.mjs`.

**2. `backfill/surprise_backfill.json` timestamps are 17 hours early.** US 08:30 ET
releases are stored at 19:30/20:30 UTC **on the previous day** (December-2023 CPI,
released 2024-01-11, is stored as 2024-01-10 20:30Z). Verified independently against
the tape: a whole-hour scan of the release clock peaks uniquely at **+17h** (CPI
2.40×, NFP 2.54×) with every other hour at ≈1.0×. The builder therefore *calibrates*
each family's clock against the market and publishes the proof rather than trusting
the archive or hardcoding a constant.

That second bug is **not confined to this work**: `macroRegimeFx.buildEventStudy`
keys releases on `new Date(r.ms)`'s calendar date, so every backfilled US morning
release in today.html's "What moves this pair, measured" panel — and in the AI
snapshot's `eventDayBehaviour` — has been attributed to **the day before it
happened**. Live-collected releases (post 2025-04) are unaffected, so the panel
currently mixes correctly- and incorrectly-dated history. Fixing the archive needs
the untracked 68MB source CSV; **open**, and tracked in `LEGO_MODULES.md` §1bf.

### Join proof (median |R0| ÷ the same clock on ordinary days)

| family | eurusd | gbpusd | audusd | nzdusd | usdjpy | usdcad | usdchf | gold |
|---|---|---|---|---|---|---|---|---|
| FOMC | 5.48 | 4.59 | 6.46 | 5.74 | 5.61 | 4.47 | 6.09 | 4.93 |
| CPI  | 2.40 | 2.09 | 2.69 | 2.84 | 2.37 | 1.98 ✗ | 2.45 | 1.71 ✗ |
| NFP  | 2.54 | 2.23 | 2.22 | 2.42 | 2.77 | 2.16 | 2.53 | 2.96 |

22 of 24 rows clear the 2× bar. The two that do not are published with
`joinProof.pass:false` attached. FOMC needs no calibration at all — its clock comes
from `fomcHistory.js` at 14:00 ET, and the market confirms it at ~5×.

### Coverage and the unconditional rows

N per instrument inside the M1 window: **CPI 111 · NFP 112 · FOMC 78**
(the archive ends 2025-04; FOMC runs to 2025-12 from `fomcHistory`).
Front-end dead-zone, computed from the yield series alone: **±2.5bp**.

Event-day size, median |R1| ÷ an ordinary day — the one thing here that is not
marginal, and it agrees with what the banked FOMC work already said:

| family | range across the 8 instruments | next-day direction |
|---|---|---|
| FOMC | **1.50× – 2.05×** | 37–58% up (coin flip) |
| CPI  | 1.04× – 1.41× | 46–55% up (coin flip) |
| NFP  | 0.93× – 1.14× | 45–56% up (coin flip) |

NFP spikes hard at the release (R0 2.2–3.0×) and leaves the **next** day looking
like an ordinary day — the 30-minute-pricing result, visible from a second angle.

### The conditional grid — descriptive, and so far indistinguishable from noise

72 of 216 cells cleared `n ≥ 12`; 144 were omitted. Of the 72, **33 held their sign
across their own halves — 46%, which is what a coin flip does.** Nothing in the grid
is presented as an effect, and nothing from it should reach a page that implies one.
The largest cells (e.g. FOMC / usdjpy / priced-hawkish + in-line, n=16, R1 −34.5bp)
are exactly the kind of number §5's arithmetic predicts will appear from noise alone
at this cell count.

That is the honest state after step 2: the machinery is built and proven to be
looking at the right minutes, the size effects replicate, and the conditional
direction claim has **no support yet** — which is what §6's single registered test
exists to settle.

## Results (§6 confirmatory cell)

*(not run — appended here when §6 executes, design above untouched)*
