# EUR/USD Options Positioning — Research Book (v1.1)

**Data:** CME EUR/USD FX options, R2 `OI Data/EUR_USD.csv` (Databento-style
per-strike daily export), 2020‑09‑04 → 2026‑09‑04, joined to
`m1/eurusd_d1.parquet` (daily OHLC) and, for the intraday validation in Part
9b, `m1/eurusd_m1.parquet` (minute OHLC, 2016–2026, 3.84M bars). All numbers
in this document come from the scripts in `oi_research_book/scripts/`, run
against that data — nothing here is estimated or asserted from memory.
Re-run `scripts/00_audit.py` → `01_build_daily_dataset.py` →
`02_walls_and_gamma.py` → `03_pinning_and_walls_reaction.py` →
`04_predictive_ic.py` → `05_intraday_validation.py` in order to reproduce
every table (see `README.md`).

**v1.1 change:** added Part 9b, an intraday validation pass using real R2
minute candles instead of daily OHLC. It fixes a same-day lookahead wrinkle
in the original Part 8 (lags every wall/gamma level to the prior trading
day's known value) and replaces a 35–80-event daily-close sample with
~400–425 real per-minute touch events per wall side — enough to actually
test significance, which changes the verdict on two of Part 10's answers
(A, B) from "not shown" to "yes, short-horizon, with real p-values," while
confirming two others stay null even with far more power (D: wall strength;
gamma-flip regime). See Part 9b for the honest caveats (event
non-independence, chief among them) before reading those p-values as final.

**Scope of this v1.** The brief that motivated this book listed 36 research
sections and 18 closing questions. Doing all 36 with genuine statistical care
in one pass would mean doing most of them badly — running a test and not
checking it is worse than not running it, because it invites exactly the
"visually compelling, not statistically real" trap the brief itself warns
against. This v1 instead does a smaller set of the highest-value tests
properly — audited data, real chronological out-of-sample splits, confound
checks, honest null-reporting — and lists everything not yet covered as a
concrete, buildable roadmap in Part 9. That trade is deliberate and matches
this repo's own working agreement (`MD files/CLAUDE.md`): "a beautiful
relationship that exists for one year and disappears afterwards is not a
robust market phenomenon," and infrastructure being sound is not the same
claim as a strategy having edge.

**Relationship to the existing OI system.** `oi-dashboard.html` / `js/oi.js`
already compute max pain, walls, and GEX — but from a hand-pasted, single-day
CME table, with Greeks at a *fixed 14-DTE, flat-vol* assumption (documented in
`MD files/OI_ANALYSER_HANDOVER.md` and independently flagged as a live risk to
the OI bot in `OI System Quant Review Aug 2026.md`, H3/P1-3/P2-2). This book's
one genuine methodological upgrade over that system is using each row's **real**
expiry timestamp for time-to-expiry, instead of a fixed 14 days — see Part 2.
It does **not** fix the flat-vol problem (no real IV exists in this dataset
either — see Part 0) and is not a replacement for the live dashboard; it is a
historical research pass answering "does any of this matter empirically,"
which the live system has never had the data to ask.

---

## Part 0 — What this dataset can and can't tell us

This section exists because the brief explicitly asked for it, and because
skipping it is how a desk quietly manufactures a "dealer positioning" story
data can't support.

**Directly measurable from `OI Data/EUR_USD.csv`:**
- Date, real expiry timestamp, strike, right (C/P), open interest, volume,
  settlement (option premium), a `raw_symbol`/`instrument_id`.
- Real days-to-expiry per row (`expiry − date`), which is an improvement over
  the live dashboard's fixed-14-day assumption.
- Option premium (`settlement`) is populated on 99.75% of rows — in principle
  enough to *invert* an implied vol via Black‑76, strike by strike. **Not done
  in this v1** (flagged in Part 9) — the analysis below uses a realized-vol
  proxy instead (see next point), which is a different and cruder thing.

**Requires an assumption this dataset cannot verify, or more data:**
- **No implied volatility field exists.** Every Greek/gamma number in this
  book is BSM gamma computed with **20-day trailing realized volatility** of
  the underlying as a stand-in for market-implied vol, using the real
  per-row time-to-expiry. This is a genuine improvement over the live
  system's fixed-vol/fixed-DTE pair on the *time* axis, but **not** on the
  *vol* axis — realized vol is not what option prices were actually struck
  against, and the resulting "GEX"/"gamma flip" numbers are a structural
  proxy, not the market's own priced dealer exposure. Treat every gamma
  number in Parts 4–7 as **illustrative of a methodology**, not a measured
  fact about dealer books.
- **No buyer/seller (customer vs. dealer) side is recorded.** "Dealer gamma"
  requires assuming who is short and who is long each strike. This book
  mirrors the sign convention already used in `js/oi.js` (call OI → positive
  GEX contribution, put OI → negative) purely for continuity with the
  existing system, not because it was independently verified from this data
  — it can't be, from OI alone.
- **CME EUR/USD options are American-style options on FX futures.** Every
  Greek here uses a European BSM formula, the same simplification the live
  system already makes. Early-exercise value is ignored.
- **Which strikes are "front month" vs "back month"** is inferred purely
  from days-to-expiry (≤45 calendar days = "near-dated" throughout this
  book), not from any explicit CME product-tier field.
- **Pre-sample positioning is invisible.** 65.3% of contracts are first
  observed in the data already carrying nonzero OI (Part 1) — however that
  OI built up, it happened before 2020‑09‑04 and this dataset has no view
  of it.

If a claim below can't be traced to one of the two lists above, it's a bug —
flag it.

---

## Part 1 — Data audit

Full machine-readable output: `oi_research_book/data/audit_report.json`
(reproduce with `00_audit.py`).

| Check | Result |
|---|---|
| Rows | 3,021,390 |
| Date range | 2020‑09‑04 → 2026‑09‑04 (1,520 distinct trading dates, ~6 years) |
| Expiries | 88 distinct, DTE 0–1,067 days at time of observation (never negative — no post-expiry rows) |
| Strikes | 175 distinct |
| `instrument_id` | 14,232 distinct; 14,277 distinct `raw_symbol` |
| Settlement (premium) missing | 0.25% null, 0.49% exactly zero — essentially always populated |
| **Open interest missing** | **64.6% null overall** |
| Open-interest-change (raw field) missing | 65.0% null — **not used**, see below |
| Volume missing | 64.6% null (same rows as OI-null), 27.8% exactly zero among reported rows |
| Negative OI / negative volume | 0 rows either way |
| Duplicate `(date, instrument_id)` rows | 0 |
| `(expiry, strike, right)` → single `instrument_id`? | **Yes, always** (0 contracts split across multiple ids) |
| `instrument_id` → single `(expiry, strike, right)`? | **No** — 45 of 14,232 ids (~0.3%) were reused for a *different* contract later in the sample |
| Missing business days | ~47 across 6 years (holidays — CME closes, not a data gap) |
| Rows per day | median 2,010, range 1–2,594 (chain width grows as new strikes/expiries list over time) |

**Two audit findings that shaped every script downstream:**

1. **`instrument_id` is not a safe long-run contract key.** A handful of ids
   were reused for a different `(expiry, strike, right)` later in the sample
   (e.g. id `44002` is both a P1105 expiring 2021‑07‑09 *and* a P1085 expiring
   2023‑03‑03). Every script here keys contracts by `(expiry, strike, right)`
   instead, which the audit confirms is 1:1 with `instrument_id` in the other
   direction (every real contract only ever got one id).

2. **Open interest is null, not zero, whenever a contract isn't in that day's
   settlement/statistics report — and this is overwhelmingly a real-sparsity
   effect, not a random hole.** Null OI coincides with `volume == 0` in
   **100%** of null rows (never the reverse — plenty of `volume==0, OI known`
   rows also exist, i.e. "quiet but on the record" is different from "off the
   record"). Null rate rises monotonically with time-to-expiry: 42.8% within
   a week of expiry, 73% between 6 months and a year out, 94.7% beyond a
   year. CME open interest is a **persistent stock**, not a daily flow that
   resets to zero when unreported — so this book forward-fills OI per
   `(expiry, strike, right)` contract across gaps of up to 5 consecutive
   trading dates, and treats OI as unknown (excluded from that day's surface)
   beyond that. The raw `open_interest_change` column has the same ~65% null
   rate and is **not used**; every "OI change" number in this book is our own
   day-over-day diff of the forward-filled series, computed only between two
   real, present trading dates for that exact contract.

---

## Part 2 — Underlying price & the surfaces

Daily spot = `eurusd_d1.parquet` close. Two aggregated surfaces are built for
every test below, both saved as small parquet files
(`oi_research_book/data/daily_master_{near,all}.parquet`, ~1,508 rows each —
small enough to commit and read directly):

- **`near`** — only strikes/expiries with DTE ≤ 45 calendar days at
  observation time (the two front monthly expiries, matching where the live
  oi-dashboard/oi_bot already concentrate).
- **`all`** — every listed expiry, aggregated by strike across the whole
  chain (the CME EUR/USD chain runs multiple years out — see Part 0's
  invisible-pre-sample-OI caveat, which applies most to far-dated strikes).

Per strike/day, gamma is BSM gamma at the **real** `(expiry − date)` in years
and 20-day trailing realized vol (Part 0 caveat applies); GEX = `±OI × gamma ×
125,000 × spot` (call → `+`, put → `−`, same convention and same $125,000 CME
EUR/USD contract multiplier as `js/oi.js`).

---

## Part 3 — Wall definitions: they disagree, a lot

The brief's instinct not to trust a single "call wall = max OI" definition
was right. Five definitions were built for every trading day and compared
against Definition A (raw max OI) — full table:
`oi_research_book/data/results/wall_definition_agreement.csv`.

| Definition pair | Call agreement | Put agreement | Typical distance when they disagree |
|---|---|---|---|
| A (raw max OI) vs B (max OI within ±2% of spot) | 46–53% | 52–62% | ~0.85% of spot |
| A vs C (neighbour-relative concentration, ±6-strike band median) | 30–35% | 31–33% | ~1.7–1.9% of spot |
| A vs D (largest day-over-day OI *increase*) | **10–13%** | **13%** | ~1.5–1.8% of spot |
| A vs E (largest gamma-weighted OI, i.e. contribution to GEX) | 28–51% | 30–42% | ~0.9–1.7% of spot |

The "flow wall" (D) is the outlier: it agrees with the plain level-wall barely
10–13% of the time. **The strike building the most new interest today is
almost always a different strike from the one with the most interest,
period.** Anyone reading "the call wall" off one number is implicitly picking
one of at least five different, materially different strikes — this matches
`OI System Quant Review Aug 2026.md`'s P2-1 finding (the old
neighbour-only concentration rule is brittle) with actual historical numbers
behind it now, not just a code-review judgment call.

---

## Part 4 — Wall persistence & migration

Full table: `oi_research_book/data/results/wall_persistence_migration.csv`.

| | near-dated | all-expiry |
|---|---|---|
| Call wall unchanged day-to-day | 88.5% of days | 94.4% of days |
| Put wall unchanged day-to-day | 87.2% of days | 90.1% of days |
| Call wall mean run length | 8.7 trading days | 18.0 trading days |
| Put wall mean run length | 7.8 trading days | 10.1 trading days |

**Walls are genuinely sticky** — a single paste into the live dashboard being
"still roughly right" days later (an assumption the current system leans on
informally) is supported by this. That is a *descriptive* fact, not a
predictive one.

**Does the wall move toward price, or price toward the wall?** Spearman
rank-IC, both directions, both wall sides, both surfaces (8 tests total):
every single one has p > 0.08 (most p > 0.14, several p > 0.9). **No lead or
lag relationship survives.** Neither "the wall migrates and price follows"
nor "price moves and the wall catches up afterward" is supported here.

**Does wall strength (OI percentile) predict the size of next-day moves?**
Sorting days into weak/mid/strong call-wall-OI terciles
(`wall_strength_vs_reaction_{near,all}.csv`), mean |next-day return| is flat
across terciles: 0.289% / 0.290% / 0.311% (near) and 0.278% / 0.295% / 0.317%
(all). Any apparent increase tracks the strong tercile also sitting farther
from spot on average (a distance confound, same shape as Part 6's pinning
result) — **no monotonic wall-strength effect survives** once that's kept in
mind.

---

## Part 5 — Gamma flip: an operational definition, and what it doesn't do

Two ways to define "the gamma flip" were considered. A textbook zero-gamma
level *re-evaluates* every strike's gamma at a range of *hypothetical* spot
prices and finds where the total flips sign as a function of that
hypothetical spot — genuinely the right definition, and **not** what's
computed here (that requires re-running BSM at many spot levels per day,
deferred to Part 9). `js/oi.js`'s live definition is simpler still: the first
strike, walking low→high, where consecutive per-strike net GEX changes sign —
workable on a narrow, already-near-money manual paste, but on a full
historical chain with long, sparse OTM tails it mostly finds spurious flips
in those tails. This book's operational definition is a middle ground:
**cumulative** net GEX from the lowest strike upward, and the sign-crossing
**nearest to spot** (`01_build_daily_dataset.py`). Treat every gamma-flip
number below as this specific proxy, not the textbook quantity.

| | near-dated | all-expiry |
|---|---|---|
| Days with a valid flip found | 68.2% (1,029/1,508) | 57.8% (872/1,508) |
| Median distance, flip to spot | −3.86% | **+0.065%** |
| IQR of that distance | −11.8% to −0.0% | −3.3% to +1.4% |

The all-expiry version lands almost exactly on spot at the median and is used
as the primary series below; the near-dated-only version is more often well
below spot and less reliable (fewer valid days) — restricting to two front
expiries apparently loses too much of the strike tail needed for a stable
cumulative crossing.

**Does the flip separate real regimes?** Splitting days into above-flip /
below-flip and comparing next-day |return| (`gamma_regime_{near,all}.csv`):

| Surface | Below-flip mean \|ret\| | Above-flip mean \|ret\| | Mann-Whitney p |
|---|---|---|---|
| near | 0.296% | 0.289% | 0.927 |
| all | 0.298% | 0.286% | 0.690 |

**No detectable difference either way.** The textbook "negative gamma → more
volatile, positive gamma → calmer" pattern does not show up in next-day
realized-return magnitude on this proxy. (A secondary, un-tested
lag-1-autocorrelation diagnostic flipped sign between surfaces — negative in
both regimes on the near-dated surface, but negative-below/positive-above on
the all-expiry surface, weakly directionally consistent with the textbook
story on one surface only. One un-significance-tested diagnostic that
disagrees across two versions of the same variable is not evidence — noted,
not claimed.)

---

## Part 6 — Gamma-flip crossing event study

179–183 crossing events per surface (`gamma_crossing_event_study_{near,all}.csv`),
comparing |forward return| after a crossing day to all non-crossing days:

| Surface | Horizon | After crossing | Baseline | p |
|---|---|---|---|---|
| near | 1d | 0.384% | 0.363% | 0.34 |
| near | 3d | 0.592% | 0.644% | 0.12 |
| near | 5d | 0.717% | 0.833% | **0.049** |
| all | 1d | 0.356% | 0.382% | 0.49 |
| all | 3d | 0.636% | 0.671% | 0.90 |
| all | 5d | 0.873% | 0.890% | 0.75 |

Five of six horizon/surface pairs show no difference at all. The one nominal
p<0.05 result (near, 5-day) points the **wrong direction** — baseline days
moved *more* than crossing days, the opposite of "crossing the flip triggers
a volatility expansion." Testing six combinations and finding one marginal
hit, in the wrong direction, is exactly what chance produces at that count —
**this is a null, not a reversed discovery.**

---

## Part 7 — Strike pinning: a result that evaporates under a confound check

For 84 near-dated expiry cycles with ≥200 combined OI five trading days out,
the strike with the most OI that day ("magnet") was compared to a **matched
control strike** — the strike below the day's median OI closest in starting
distance to the magnet — tracking both to the last trading day before expiry
(`pinning_pairs.csv`, `pinning_summary.csv`).

**Naive comparison (raw final distance) — looks like a real effect:**

| | Magnet | Control | Wilcoxon p |
|---|---|---|---|
| Mean starting distance from spot | 2.60% | 3.14% | |
| Mean final distance from spot | 2.63% | 3.34% | **0.0002** |
| % of cycles the strike got crossed | 31.0% | 13.1% | |

**But the magnet also started 0.5pp closer to spot** — OI mechanically
concentrates near ATM, so the control match wasn't clean. Comparing the
*change* in distance instead (final − initial), which nets that starting gap
out (`pinning_summary_confound_controlled.csv`):

| | Magnet | Control | Wilcoxon p |
|---|---|---|---|
| Mean distance change (percentage points) | +0.03 | +0.20 | 0.168 |
| Mean relative shrink | +0.81 | +0.16 | 0.414 |

**Neither is significant.** And the magnet strike is crossed **more** often
than the control (31.0% vs 13.1%) — the opposite of a "price avoids/gets
stuck at the big wall" story; it's most likely explained by simply starting
closer, so more paths happen to cross it. **The naive pinning result was a
distance-matching artifact. Once controlled for, there is no evidence in this
sample that the largest-OI strike behaves differently from a matched
lower-OI strike as expiry approaches.** This is precisely the kind of finding
the brief asked for — a chart-level-compelling story that a proper matched
comparison removes — and a useful teaching example of the trap itself for
anyone extending this book.

---

## Part 8 — Wall touch outcomes, and the day after expiry

**Wall rejection vs. break** (`wall_reaction_events.csv` /
`wall_reaction_summary.csv`): every day price first touches the (all-expiry,
Definition A) call or put wall from the near side, classified by whether the
close finished beyond it (break) or back on the starting side (reject):

| Wall | Break events | Reject events | Reject share |
|---|---|---|---|
| Call | 35 | 60 | 63% |
| Put | 39 | 80 | 67% |

Rejection is the more common outcome at both wall types by raw count — a wall
"holds" more often than it doesn't, in frequency terms. Forward returns after
either outcome are small and continuation rates sit close to 50% in all four
buckets (35.9%–55.0%); **no significance test was run given only 35–80 events
per bucket, so this is a descriptive count, not a proven edge or a proven
null** — flagged in Part 9 as needing a larger sample (more pairs, more
years, or intraday precision) before it can be tested properly.

**Expiry-day volatility** (`expiry_day_vol.csv`, n=71 matched expiry cycles):
mean |daily return| in the T-5..T-1 window is 0.365%, on expiry day itself
0.390% (not different, p=0.837 — no "calm before" or "loud into" expiry
effect detected), and on T+1 it drops to 0.273%, **significantly lower than
expiry day** (Wilcoxon p=0.0077). **This is the one moderate-confidence
positive finding in this book**: realized volatility falls on the trading day
immediately after a front-month options expiry. Plausible mechanism (expiry
removes a large block of hedging-linked OI from the board), one real test,
real p-value — but a single-pair, single-test result, not yet cross-validated
across other pairs or time splits, so it's labeled "moderate," not "strong."

---

## Part 9 — Predictive test: 1-day-ahead, with a real IS/OOS split

Ten features (wall distances, gamma-flip distance, P/C OI ratio z-score, net
GEX z-score, call/put OI-change z-scores, wall-OI percentiles, and a plain
yesterday's-return momentum baseline) against two targets (next-day return,
next-day |return|), on both surfaces = 40 combinations. Chronological split —
**no shuffling** — 60% train / 20% validation / 20% out-of-sample test, so
every number below reflects a genuinely unseen period
(`predictive_ic_{near,all}.csv`, `04_predictive_ic.py`).

**Result: zero of 40 combinations were both sign-stable and jointly
significant (p<0.10) in train and test.** Full survivor query returns an
empty table (`predictive_ic_survivors.csv`) — this book does not have a
1-day-ahead OI/gamma signal to report, and says so rather than reframing a
marginal in-sample number as a finding.

Two specific results are worth naming because they show *why* the bar
matters, not just that nothing cleared it:

- **`dist_put_wall_pct → next-day |return|` (all-expiry surface): train
  IC=+0.158, p=0.000002** — a strikingly clean in-sample relationship — **but
  test IC=−0.119, p=0.039: the sign flips out-of-sample.** This is the exact
  "beautiful in-sample, disappears/reverses OOS" pattern this repo's own
  house rules (`MD files/CLAUDE.md`) warn to flag, caught directly in this
  dataset rather than as a hypothetical.
- **`yesterday's return → next-day |return|`** (plain volatility clustering,
  not an OI variable at all, included as a sanity-check baseline): train
  IC=0.108, p=0.001, one of the strongest and best-established stylized
  facts in daily FX returns — and it **still fails the OOS test** (test
  p=0.608). This calibrates how hard the bar is: even a well-known real
  effect doesn't clear it on this specific 1,508-day, 60/20/20 split, so the
  OI variables' failure to clear it either is not, by itself, a damning
  verdict on the underlying economics — a single-pair, single-split test is
  a real result and also a genuinely small one.

**What this means for "the smallest variable set that captures the surface"**
(the brief's closing challenge): honestly, at a 1-day-ahead horizon, **no
variable set can be recommended as predictive**, because none of the
ingredients cleared OOS individually — building a "reduced model" out of
components that all failed alone would just be re-hiding the same null
behind a combination, which is the opposite of what was asked for. What *can*
be said: for **descriptive** (dashboard) purposes, the wall level (Definition
A) + its distance from spot, the P/C OI ratio, and net-GEX/gamma-flip
distance summarize most of what the five wall definitions and both surfaces
independently capture (Part 3's definitions are largely functions of these
plus a filtering/weighting choice) — a legitimate compression for *display*,
not a demonstrated compression for *prediction*.

---

## Part 9b — Intraday validation: does more resolution change the answers?

Part 8's wall reject/break test ran on daily OHLC and flagged its own two
weaknesses: only 35–80 touch events per bucket (too thin to test for
significance), and a subtle lookahead wrinkle — the wall level used to grade
a day's high/low was that **same day's** own OI-derived level, which isn't
actually known until that day's CME report lands. Since R2 also holds EUR/USD
M1 candles (`m1/eurusd_m1.parquet`, 3.84M bars, 2016–2026), both problems can
be fixed directly: use the **prior trading day's** wall/gamma level (genuinely
known before the day starts) and scan every minute bar for real touch events
instead of reading one day-close (`05_intraday_validation.py`).

**This changes the verdict on questions A, B and D from Part 10 below — not
because the daily-resolution test was run wrong, but because it didn't have
the statistical power to see what was there.**

| Side | Horizon | Events | % Break | % Reject | p vs. 50/50 |
|---|---|---|---|---|---|
| Call wall | 15 min | 412 | 31.6% | **68.4%** | 5×10⁻¹⁴ |
| Call wall | 60 min | 407 | 39.3% | 60.7% | 1.9×10⁻⁵ |
| Call wall | 240 min | 389 | 40.6% | 59.4% | 2.5×10⁻⁴ |
| Put wall | 15 min | 425 | 37.4% | **62.6%** | 2.4×10⁻⁷ |
| Put wall | 60 min | 421 | 41.8% | 58.2% | 9.0×10⁻⁴ |
| Put wall | 240 min | 392 | 52.0% | 47.9% | 0.45 (not significant) |

Full events: `oi_research_book/data/results/intraday_touch_events.csv`;
summary: `intraday_touch_summary.csv`.

**A real, sizeable, short-horizon rejection effect exists at both wall
types** — roughly 400 touch events per side (vs. 35–80 daily-close "break"
counts before), rejecting a level nearly 2-to-1 in the 15 minutes after a
touch, with p-values far past any reasonable significance bar. Forward
returns move the direction you'd expect (break events continue through the
level, reject events retreat from it, growing in magnitude with horizon).
**The effect fades with time and fades faster for puts**: by 4 hours out,
call walls still show a real (if smaller) rejection edge, but put walls have
decayed to a coin flip (p=0.45). This is a **short-horizon microstructure
effect, not a multi-hour edge**, and the two wall types don't decay at the
same rate.

**Two honesty caveats on this result, stated plainly:**
1. **Touch events are not independent draws.** A wall level persists 8–18
   trading days on average (Part 4), so many touches in this table are
   repeated visits to the *same* underlying level across consecutive days,
   not 400 unrelated experiments. The p-values above almost certainly
   overstate independence. The effect sizes are large enough (2-to-1 at 15
   minutes, p orders of magnitude past 0.05) that they likely survive a
   properly clustered or block-bootstrapped test, but that test wasn't run
   here — flagged as the immediate next step before trading on this.
2. **Does wall OI strength (Part 4's un-resolved question D) predict the
   break rate now that there's a real sample?** Sorting the same events into
   OI terciles (`intraday_wall_strength_vs_outcome.csv`) still shows **no
   clean monotonic pattern** — put walls show the expected direction
   (strongest tercile breaks least, 32.9% vs 44.7%/47.9% at 60 min) but call
   walls show the opposite (weakest tercile breaks least, 35.3% vs
   40.4–42.2%). Bigger sample, same inconclusive answer: **wall strength by
   this OI measure still doesn't cleanly predict outcome.**

**Gamma-flip regime, re-tested intraday:** replacing Part 5's daily
above/below split with the actual intraday realized range and volatility
while spot sits on each side of the (T-1, lagged) flip
(`intraday_gamma_regime_daily.csv` / `_summary.csv`) reproduces the same
null — 0.68% vs. 0.67% mean intraday range, p=0.66. **More resolution didn't
rescue this one; the gamma-flip regime effect still isn't there.**

---

## Part 10 — Answers to the brief's closing questions

| # | Question | Answer |
|---|---|---|
| A | Do call walls act as resistance? | **Yes, short-horizon.** Intraday validation (Part 9b, 407–412 real touch events, T-1 known level): 60–69% reject rate at 15–60 minutes, p<10⁻⁴, decaying but still significant at 4 hours (p=2.5×10⁻⁴). Daily-resolution test alone (63% reject, n=95, untested) had missed this only for lack of power. |
| B | Do put walls act as support? | **Yes, but shorter-lived than calls.** Same pattern at 15–60 min (58–63% reject, p<10⁻³), but decays to a coin flip by 4 hours (p=0.45) — the support effect doesn't last as long as the call-wall resistance effect. |
| C | When do walls fail? | Still not modeled as a real classifier, but now know *when* in time: mostly a function of horizon (the reject edge just fades, faster for puts) rather than OI strength (which shows no clean pattern — see D). A real break/reject classifier is now feasible with ~400 events/side; roadmap item. |
| D | Does wall strength matter? | **No, still.** Even with ~140 events per OI tercile (Part 9b), there's no clean monotonic relationship between wall OI size and break rate — puts show the expected direction, calls show the opposite. Confirms the daily-resolution null (Part 4) rather than overturning it. |
| E | Does wall migration lead price? | No — nor does price lead wall migration (Part 4, 8 tests, all p>0.08). |
| F | Does OI change beat OI level? | No — OI-change z-scores were no better than OI-level features in the predictive test; neither type survived OOS (Part 9). |
| G | Does volume+OI separate opening/closing flow? | Not tested in this v1 — needs contract-level (not daily-aggregate) granularity; roadmap item. |
| H | Does the gamma proxy explain price behavior? | No detectable regime or crossing effect (Parts 5–6) — but see Part 0: this is a realized-vol proxy, not real dealer gamma. |
| I | Does the gamma flip separate real regimes? | No, by the |return| test. One untested autocorrelation diagnostic disagreed in sign between the two surfaces — unresolved, not confirmed. |
| J | Does crossing the flip predict vol expansion? | No — the one nominal p<0.05 result pointed the wrong direction (Part 6). |
| K | Does price pin near large strikes into expiry? | No, once the initial-distance confound is controlled for (Part 7) — the naive result was an artifact. |
| L | Do large-OI strikes act as magnets generally? | Not shown; see K. |
| M | What predicts rejection vs. breakout? | Not modeled as a real classifier yet — but Part 9b shows horizon is the dominant driver (rejection strong at 15-60min, gone by 4h for puts) while OI strength is not; a real classifier is now buildable on ~400 real events/side. |
| N | Does distance to a wall matter? | Only weakly and inconsistently in the raw daily tercile scan (Part 4); nothing survived the daily-horizon OOS test (Part 9). Not re-tested intraday. |
| O | Does gamma + walls combined beat either alone? | Not tested. Given neither carries daily-ahead OOS signal alone (Part 9), a combination is unlikely to rescue it without a genuinely new ingredient (real IV, more pairs, a different horizon) — though Part 9b's short-horizon wall effect suggests the *walls* half might combine productively with an intraday-horizon target specifically, unlike the daily one. |
| P | Can any of this become a defensible signal? | Not at 1-day-ahead (Part 9). **The short-horizon (15–60min) wall-rejection effect in Part 9b is the one candidate in this book with real, large-sample, low-p-value support** — but it still needs the clustering/independence caveat resolved (events aren't independent draws) and a costs/execution model before it's a signal, not just a finding. |
| Q | What doesn't work? | Pinning (once corrected), gamma-flip regime/crossing effects (null at both daily *and* intraday resolution), wall-migration lead/lag, wall-strength-tercile monotonicity (null at both resolutions), all 40 tested 1-day-ahead predictive combinations. |
| R | What additional data would help most? | See roadmap below — real per-strike IV top of the list. |

---

## Part 11 — Roadmap: what a v2 should add

In priority order, each buildable on the infrastructure already in this
directory:

0. **Re-test Part 9b's wall-rejection effect with a clustering/independence
   correction** (e.g. block bootstrap by wall-episode, or one observation per
   contiguous same-level run rather than per day) before treating its
   p-values at face value — this is now the single most promising lead in
   the book precisely because it's the first result with real sample size,
   which also makes it the one most worth stress-testing properly. If it
   survives, build the real break/reject classifier (question M) on top of
   it and add a costs/execution model (spread, slippage on a 15-60min hold)
   before calling it a signal.
1. **Invert `settlement` (Black‑76) into a real per-strike implied vol.** The
   premium is populated on 99.75% of rows — this is the single highest-value
   upgrade, replacing the realized-vol proxy everywhere in Parts 5–7 with
   the market's own priced vol and making the GEX/gamma-flip numbers a
   genuine (if still model-dependent) dealer-exposure estimate rather than
   an explicitly-flagged proxy.
2. **Pool across pairs.** R2 already holds AUD_USD, GBP_USD, NAS100_USD,
   USD_CAD, USD_CHF, USD_JPY in the same schema. A single pair at 1,508 days
   is sample-starved for a p<0.05 bar across many slices (this book's own
   Part 9 result shows even a known real effect can miss on one pair/split);
   pooling adds real statistical power and turns "does this replicate" into
   a testable question instead of a one-shot guess. NAS100 needs its own
   contract multiplier/asset-class treatment, not the $125k FX one used here.
3. **Longer/other horizons.** Everything in Part 9 is 1-day-ahead. The brief
   itself expected the interesting horizon might be 3–5 days or "into
   expiry" rather than next-day — worth its own IS/OOS pass with the same
   discipline, not a spot-check.
4. **Contract-level (not daily-aggregate) volume-vs-OI classification** (the
   brief's Part 17 concept, question G) — needs the `contract_level_ffilled`
   cache kept at contract granularity through the join, which today's
   `03_pinning_and_walls_reaction.py` already demonstrates is workable.
5. **A genuine wall break/reject classifier** (question M) — needs more
   touch events than one pair currently provides (35–80 per bucket here);
   natural to build once step 2 (multi-pair pooling) exists.
6. **A true hypothetical-spot-revaluation gamma flip** (Part 5's textbook
   definition) instead of this book's cumulative-nearest-spot proxy, once
   step 1 supplies real per-strike IV to revalue with.
7. **Walk-forward re-validation**, not just one 60/20/20 split, before any
   surviving signal (should step 1–3 produce one) is treated as robust — per
   this repo's own Lego Principle 5 (`MD files/CLAUDE.md`): a change only
   "wins" on out-of-sample performance with a non-trivial trade count, and a
   single split is a weaker bar than walk-forward.

---

## Appendix — reproduction

```
python3 oi_research_book/scripts/00_audit.py       /path/to/EUR_USD.csv
python3 oi_research_book/scripts/01_build_daily_dataset.py /path/to/EUR_USD.csv /path/to/eurusd_d1.parquet
python3 oi_research_book/scripts/02_walls_and_gamma.py
python3 oi_research_book/scripts/03_pinning_and_walls_reaction.py
python3 oi_research_book/scripts/04_predictive_ic.py
python3 oi_research_book/scripts/05_intraday_validation.py   # needs m1/eurusd_m1.parquet (R2, ~63MB)
```

Raw R2 inputs (`OI Data/EUR_USD.csv`, ~227MB; `m1/eurusd_d1.parquet`, ~175KB;
`m1/eurusd_m1.parquet`, ~63MB) and the contract-level forward-filled cache are
intentionally **not** committed (gitignored) — they're a few seconds'
download from R2 and under a minute to rebuild everything. Everything under
`oi_research_book/data/*.parquet` and `oi_research_book/data/results/*.csv`
**is** committed — small, derived, and exactly what every number in this
document was read from.
