# EUR/USD Options Positioning — Research Book (v1.7)

**Data:** CME EUR/USD FX options, R2 `OI Data/EUR_USD.csv` (Databento-style
per-strike daily export), 2020‑09‑04 → 2026‑09‑04, joined to
`m1/eurusd_d1.parquet` (daily OHLC) and, for the intraday validation in Part
9b, `m1/eurusd_m1.parquet` (minute OHLC, 2016–2026, 3.84M bars). All numbers
in this document come from the scripts in `oi_research_book/scripts/`, run
against that data — nothing here is estimated or asserted from memory.
Re-run `scripts/00_audit.py` → `01_build_daily_dataset.py` →
`02_walls_and_gamma.py` → `03_pinning_and_walls_reaction.py` →
`04_predictive_ic.py` → `05_intraday_validation.py` →
`06_intraday_cluster_significance.py` → `07_export_bot_chain.py` →
`08_bot_backtest_zones.mjs` → `09_bot_backtest_execute.py` →
`10_real_maxpain_test.py` → `11_feature_discovery.py` →
`12_break_reject_classifier.py` in order to reproduce every table (see
`README.md`). `13_pool_multi_pair.py` (Part 16) needs at least one
additional pair run through `01`→`05`→`06` with its own pair code first —
not run as part of this default chain since only EUR/USD data has actually
been pulled so far.

**v1.1 change:** added Part 9b, an intraday validation pass using real R2
minute candles instead of daily OHLC. It fixes a same-day lookahead wrinkle
in the original Part 8 (lags every wall/gamma level to the prior trading
day's known value) and replaces a 35–80-event daily-close sample with
~400–425 real per-minute touch events per wall side — enough to actually
test significance, which changes the verdict on two of Part 10's answers
(A, B) from "not shown" to "yes, short-horizon, with real p-values," while
confirming two others stay null even with far more power (D: wall strength;
gamma-flip regime). See Part 9b for the honest caveats before reading those
p-values as final.

**v1.2 change:** closed the v1.1 caveat above. `06_intraday_cluster_significance.py`
re-tests the wall-rejection finding with an episode-level cluster bootstrap
(grouping touches by contiguous same-wall-level run instead of treating each
touch as independent) — the 15–60 minute effect survives on 27–43 genuinely
independent wall-episodes; the 4-hour version mostly doesn't (call
borderline, put clearly null). See Part 9b's "clustering correction"
subsection.

**v1.3 change:** adds Part 12 — a backtest of the live `oi_bot`'s *actual*
trading logic (not just the underlying OI concepts) against 6 years of real
history, using its real production code (`buildOIEntry`/`buildOIZones`) via
Node, with execution simulated against real M1 candles. Result: no robust
edge on EUR/USD (OOS mean −0.031R) — the first time that question has been
testable with real data instead of an untested assumption. Also documents a
real fill-direction bug this pass found and fixed in its own execution
simulator before trusting the result (see Part 12 for what it was and how
extreme the wrong number looked before the fix).

**v1.4 change:** a full audit of the pipeline and data, requested before
trusting it enough to build further (Part 13). Found and closed one real
gap — max pain was never actually tested, only a "biggest OI strike" proxy
(Part 7b: real max pain checked, comes back an even cleaner null) — and
found and directly tested one real timing risk (OI's true publish lag is
later than this book's "T-1" convention assumed; the headline 15–60min
finding survives a stricter T-2 lag essentially unchanged). Verified
correct with no changes needed: DTE, the gamma formula, the GEX sign
convention against the real production code, and strike-to-spot alignment
(checked empirically for a basis error, found none — a first, cruder check
attempt gave a nonsensical result and was itself the reason to check with a
better method rather than report it). Also states plainly what `settlement`
and `volume` currently do in this pipeline: loaded, audited — and used in
zero calculations.

**v1.5 change:** adds Part 14, a scoped feature-discovery pass ahead of
building the break-vs-reject classifier (the queued next step). Volume/OI
quadrant and prior momentum came back clean nulls. A session effect that
looked real (p=0.005) turned out to be a volatility confound — Asia's high
reject rate was because Asia touches are disproportionately low-volatility,
not because Asia behaves differently — caught the same way Part 7's pinning
confound was caught, by controlling for the thing that could explain it away
before trusting the headline number. That confound-hunt surfaced a real
feature that wasn't even a candidate before: pre-touch (causal) volatility
itself predicts the outcome (r=−0.093, p=0.007 at 15min). A separate ΔOI
extremity feature passed one confound check and is flagged for the
classifier; its tail bucket didn't and is flagged as not yet trustworthy.

**v1.6 change:** built the break-vs-reject classifier (Part 15) queued off
Part 14's vetted features — and it doesn't beat the plain side-specific base
rate out of sample, in either a 3-feature or a 1-feature version. The
feature that passed Part 14's confound check (OI-change p75–p90 tier) still
fails outright when actually asked to generalize forward (OOS AUC below
0.5) — the same in-sample/OOS reversal pattern Part 9 already flagged,
caught a second time in a feature that had already survived one round of
scrutiny. Traced to a real structural cause (only 13–18 independent
wall-episodes in validation/test, not a modelling flaw) rather than left
unexplained. Conclusion: don't ship this classifier; the unconditioned
finding already live on the dashboard remains the state of the art until
multi-pair pooling (roadmap item 3, now promoted) supplies enough
independent episodes to validate a conditional model honestly.

**v1.7 change:** built and verified the multi-pair infrastructure roadmap
item 3 needs (Part 16) — every script generalized to take a pair code, per-
pair contract multiplier/CME-inversion/pip-size pulled from the real
production registries (not guessed), and a new pooling script that reports
per-pair results alongside the pooled one so averaging can't hide a pair
where the effect doesn't replicate. Verified three ways: byte-identical
regression on EUR/USD's existing results, correct strike inversion on a
synthetic CME-inverted pair, and correct cross-pair pooling mechanics.
**No real multi-pair result yet** — R2 credentials aren't available on this
machine (checked thoroughly), so this is infrastructure ready to run, not a
finding. Honest on purpose: better to ship verified infrastructure and say
so than a result built on data that was never actually pulled.

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

**Naming correction (2026-09-10 audit):** everything below tests whether
price gravitates toward the single strike with the most OI (a "magnet") —
**not** toward calculated max pain, a genuinely different number (the strike
minimizing option sellers' total payout, summed across every strike's ITM
value, not just the biggest single strike). The two coincide only 11% of the
time (`maxpain_vs_magnet.csv`) — when they differ, the median gap is 1.4% of
spot, real money on EUR/USD. This section was never mislabeled as "max pain"
in the closing questions table, but nothing here loudly said the two weren't
the same thing either, and colloquially they get used interchangeably. See
the new real-max-pain test immediately after this section, added when an
audit caught the gap.

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

### Part 7b — Testing actual max pain (the gap the naming correction above flags)

`10_real_maxpain_test.py`, added by a 2026-09-10 audit that specifically
asked "did you calculate max pain, or something else?" — the honest answer
was "something else," so this closes it. Max pain is computed with the exact
formula `js/oi.js`'s production `oiCalcMaxPain` uses (cross-checked against
the real function on 3 synthetic chains before trusting the Python version —
identical strike picked every time), applied to the near-dated aggregate
surface (an approximation of a single expiry — a true per-expiry version
needs the raw contract-level chain, gitignored, requiring R2 access; flagged
as a follow-up, not done here).

**Distance and predictive test** (`maxpain_vs_magnet.csv`,
`maxpain_predictive_ic.csv`): max pain sits a median 0.99% of spot away
(IQR 0.50–1.72%) — a plausible, nearby level. Testing whether distance to it
predicts next-day reversion, with the same chronological 60/20/20 split and
Spearman rank-IC used everywhere else in this book:

| Segment | n | Spearman IC | p |
|---|---|---|---|
| Full sample | 1,507 | −0.0003 | 0.99 |
| Train | 904 | +0.0032 | 0.92 |
| Validation | 301 | −0.0053 | 0.93 |
| **OOS** | 302 | **−0.0168** | 0.77 |

**Zero signal, at every stage, full stop — an even cleaner null than the
magnet test's.** This actually strengthens Part 7's conclusion rather than
undermining it: it isn't that the wrong level was tested and the right one
would have shown a real effect — the *real* calculated max pain shows
no reversion pull either, at 1-day-ahead resolution on this proxy chain.

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
1. **Touch events are not independent draws — corrected below.** A wall
   level persists 8–18 trading days on average (Part 4), so many touches in
   this table are repeated visits to the *same* underlying level across
   consecutive days, not 400 unrelated experiments. See the clustered
   re-test immediately below.
2. **Does wall OI strength (Part 4's un-resolved question D) predict the
   break rate now that there's a real sample?** Sorting the same events into
   OI terciles (`intraday_wall_strength_vs_outcome.csv`) still shows **no
   clean monotonic pattern** — put walls show the expected direction
   (strongest tercile breaks least, 32.9% vs 44.7%/47.9% at 60 min) but call
   walls show the opposite (weakest tercile breaks least, 35.3% vs
   40.4–42.2%). Bigger sample, same inconclusive answer: **wall strength by
   this OI measure still doesn't cleanly predict outcome.**

### The clustering correction (roadmap item 0, now closed)

`06_intraday_cluster_significance.py` groups every touch into "episodes" —
maximal runs of consecutive trading days where the T-1 wall level is
unchanged — then bootstraps over **episodes**, not events: each replicate
resamples whole episodes with replacement and pools their events, so a
20-day-old sticky level contributes as one correlated cluster, not 20
independent draws. This shrinks the effective sample size a lot (412 call
touches → **27 independent episodes**; 425 put touches → **43**) — and the
short-horizon effect survives it anyway:

| Side | Horizon | Events | Episodes | Break rate | Bootstrap 95% CI | Naive p | **Clustered p** |
|---|---|---|---|---|---|---|---|
| Call | 15 min | 412 | 27 | 31.6% | 26.6–36.6% | 5×10⁻¹⁴ | **<0.0001** |
| Call | 60 min | 407 | 27 | 39.3% | 31.9–46.7% | 1.9×10⁻⁵ | **0.0064** |
| Call | 240 min | 389 | 27 | 40.6% | 30.3–**50.0%** | 2.5×10⁻⁴ | 0.054 (borderline) |
| Put | 15 min | 425 | 43 | 37.4% | 31.4–43.5% | 2.4×10⁻⁷ | **<0.0001** |
| Put | 60 min | 421 | 43 | 41.8% | 35.6–48.1% | 9.0×10⁻⁴ | **0.0132** |
| Put | 240 min | 392 | 41 | 52.0% | 43.4–60.8% | 0.45 | 0.664 |

Full output: `intraday_cluster_bootstrap.csv`.

**The 15–60 minute rejection effect is real** — it survives treating 27–43
correlated wall-episodes as the true sample size rather than 400+ touch
events, at both wall types. **The 4-hour effect does not**: call-wall
rejection, which looked significant on the naive count (p=2.5×10⁻⁴), lands
right at the edge of conventional significance once clustered (p=0.054, CI
touching exactly 50.0%) — a textbook example of a naive test overstating
confidence once the real independent sample size is accounted for. This
narrows Part 9b's finding to something more precise and more defensible:
**a short-horizon (≤60 minute) wall-rejection tendency, not a multi-hour
one** — which also means any execution/costs test on this (roadmap item 0's
follow-on) needs to work at that horizon, not a daily one.

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
| A | Do call walls act as resistance? | **Yes, at 15–60 minutes, and it survives a proper clustering correction.** Intraday validation (Part 9b, T-1 known level, 412 touches / 27 independent wall-episodes): 60–69% reject rate at 15–60 min, clustered p<0.01 both horizons. The 4-hour version (looked significant naively, p=2.5×10⁻⁴) lands right at the edge once clustered (p=0.054) — real, but a short-horizon effect, not a multi-hour one. |
| B | Do put walls act as support? | **Yes at 15–60 minutes, clustering-verified (p<0.02, 43 independent episodes)** — but it decays faster than the call side: already a coin flip by 4 hours even before clustering (naive p=0.45, clustered p=0.66). |
| C | When do walls fail? | Still not modeled as a real classifier, but now know *when* in time: mostly a function of horizon (the reject edge just fades, faster for puts) rather than OI strength (which shows no clean pattern — see D). A real break/reject classifier is now feasible with ~400 events/side; roadmap item. |
| D | Does wall strength matter? | **No, still.** Even with ~140 events per OI tercile (Part 9b), there's no clean monotonic relationship between wall OI size and break rate — puts show the expected direction, calls show the opposite. Confirms the daily-resolution null (Part 4) rather than overturning it. |
| E | Does wall migration lead price? | No — nor does price lead wall migration (Part 4, 8 tests, all p>0.08). |
| F | Does OI change beat OI level? | No — OI-change z-scores were no better than OI-level features in the predictive test; neither type survived OOS (Part 9). |
| G | Does volume+OI separate opening/closing flow? | Not tested in this v1 — needs contract-level (not daily-aggregate) granularity; roadmap item. |
| H | Does the gamma proxy explain price behavior? | No detectable regime or crossing effect (Parts 5–6) — but see Part 0: this is a realized-vol proxy, not real dealer gamma. |
| I | Does the gamma flip separate real regimes? | No, by the |return| test. One untested autocorrelation diagnostic disagreed in sign between the two surfaces — unresolved, not confirmed. |
| J | Does crossing the flip predict vol expansion? | No — the one nominal p<0.05 result pointed the wrong direction (Part 6). |
| K | Does price pin near large strikes into expiry? | No, once the initial-distance confound is controlled for (Part 7) — the naive result was an artifact. **Nor does real calculated max pain** (Part 7b, added by audit) — Spearman IC ≈ 0 in-sample and OOS, an even cleaner null than the magnet test. |
| L | Do large-OI strikes act as magnets generally? | Not shown; see K. |
| M | What predicts rejection vs. breakout? | Not modeled as a real classifier yet — but Part 9b shows horizon is the dominant driver (rejection strong at 15-60min, gone by 4h for puts) while OI strength is not; a real classifier is now buildable on ~400 real events/side. |
| N | Does distance to a wall matter? | Only weakly and inconsistently in the raw daily tercile scan (Part 4); nothing survived the daily-horizon OOS test (Part 9). Not re-tested intraday. |
| O | Does gamma + walls combined beat either alone? | Not tested. Given neither carries daily-ahead OOS signal alone (Part 9), a combination is unlikely to rescue it without a genuinely new ingredient (real IV, more pairs, a different horizon) — though Part 9b's short-horizon wall effect suggests the *walls* half might combine productively with an intraday-horizon target specifically, unlike the daily one. |
| P | Can any of this become a defensible signal? | Not at 1-day-ahead (Part 9). **The short-horizon (15–60min) wall-rejection effect is the one finding in this book that survives its own hardest test** — real effect size, real p-values, and still holds up once re-tested against only 27–43 truly independent wall-episodes (not the raw 400+ touch count). It is still not a signal: no costs/spread/slippage model has been run against a 15–60 minute hold, and single-pair/single-instrument is still a real limitation (see roadmap). |
| Q | What doesn't work? | Pinning (once corrected), gamma-flip regime/crossing effects (null at both daily *and* intraday resolution), wall-migration lead/lag, wall-strength-tercile monotonicity (null at both resolutions), all 40 tested 1-day-ahead predictive combinations. |
| R | What additional data would help most? | See roadmap below — real per-strike IV top of the list. |

---

## Part 11 — Roadmap: what a v2 should add

In priority order, each buildable on the infrastructure already in this
directory:

0. ~~Re-test Part 9b's wall-rejection effect with a clustering/independence
   correction~~ **Done** (`06_intraday_cluster_significance.py`) — the
   15–60 minute effect survives an episode-level cluster bootstrap (27–43
   independent wall-episodes, not 400+ raw touches); the 4-hour version
   mostly doesn't (call borderline p=0.054, put clearly null p=0.66). This
   is now the highest-value next build:
   0a. **Build the real break/reject classifier (question M)** on the
       ~400-touch, now-validated 15–60 min effect — what conditions the
       touch on (approach speed, time of day, session, distance from spot)
       predicts break vs. reject better than the unconditional 60–69% base
       rate.
   0b. **Add a costs/execution model** (spread, slippage) sized to a
       15–60 minute hold specifically, before this is a signal rather than
       a finding — the daily-horizon cost assumptions elsewhere in this book
       don't transfer to a sub-hour holding period.
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

## Part 12 — Backtesting the live OI bot's actual logic

Everything above tests the *concepts* behind the OI system in the abstract.
This part tests something more direct and higher-stakes: **the live
`oi_bot`'s own trading logic**, using its actual production code, against
6 years of real history it has never had before. The Aug 2026 quant review
(`OI System Quant Review Aug 2026.md`, H2/H6) flagged this as a critical gap
— the bot has never been backtested, specifically because no historical OI
existed to test it against. That gap is now closed for EUR/USD.

**Method, chosen specifically to avoid a worse problem than not testing at
all.** A Python re-implementation of `js/oiZones.js`'s ~800-line planner (11
sizing multipliers, wall tiers, GEX regime, reachability, minRR gating) risks
silently drifting from what the bot actually runs — the exact "bit-identical
port" failure this repo's own `TRADABILITY_REVIEW.md` documents. So this
backtest calls the **unmodified production functions** instead: `buildOIEntry`
(`js/oi.js`) and `buildOIZones` (`js/oiZones.js`) are already pure, DOM-free,
and explicitly built for this ("ONE implementation → the page renders it AND
the Python executor trades it — no drift"). A Python script
(`07_export_bot_chain.py`) exports each historical day's near-dated chain in
the exact paste format the real parser expects; a Node script
(`08_bot_backtest_zones.mjs`) feeds it through the real `buildOIEntry` →
`buildOIZones`, using the bot's actual shipped default config
(`OI_BOT_CFG_DEFAULTS` from `server.js`) — not a tuned or guessed one; a
Python script (`09_bot_backtest_execute.py`) simulates execution against real
M1 candles, mirroring `oi_bot.py`'s real mechanics (limit/stop touch entry, a
shared stop, TP1/TP2 scale-out with the runner moved to breakeven, and the
mode-specific time exit — `max_hold_hours: {fade:48, break:24, maxpain:24}`,
read directly from `oi_bot.py`).

**Two honest simplifications, stated once:** no multi-day `oi_store` archive
exists to replicate `oiWallStability`/`classifyOIChange` from (the live
server derives these from whatever days happened to be pasted, which for
EUR/USD has historically meant sparse data anyway — `null` here is not a
worse assumption than what production usually has); and `holdWeights` is
`null` (no forward-test calibration exists for this run, so the wall
hold-score uses its documented theory-prior defaults — the same state a
freshly deployed bot starts in). Also worth stating plainly: **EUR/USD is not
in the bot's default trading universe** — FX is opt-in, and the planner's own
code comment calls it "the weak asset (CME OI partial); gold + indices are
where the mechanism is real." This backtest answers "would enabling EUR/USD
have worked," not "is the live bot (on gold/indices) working."

**A real bug, found and fixed before trusting any result — reported because
catching it is what makes the rest of this trustworthy, not despite it.** The
first version of the execution simulator kept the fill-direction rule from
the earlier wall-touch work: buys fill on a dip to entry, sells fill on a
rally to entry. That's correct for a *fade* (limit) order but exactly
backwards for a *breakout* (stop) order, and it went undetected long enough
to nearly ship a headline number: **93% loss rate, mean −0.82R**, because
every breakout stop-buy was being "filled" on a dip toward it instead of a
rally through it. Per this repo's own rule ("Assume Code Failure First"),
that result was implausible enough to distrust before it was believed —
checking where zones actually place entries relative to spot confirmed it:
386 of 421 sampled breakout buys sit *above* spot (needing a rally to fill,
`high >= entry`), not below. Fixed to key fill direction off entry-vs-spot
geometry rather than the buy/sell label. The corrected numbers below are
**not** the number that was almost reported.

### Results

`bot_backtest_trades.csv` (1,114 filled trades of 5,948 zones proposed — most
zones never got touched within their fill window) / `bot_backtest_summary.csv`:

| Segment | Trades | Win rate | Mean R | Median R | Sum R | Std R |
|---|---|---|---|---|---|---|
| **All** | 1,114 | 42.7% | **−0.043** | −0.15 | −47.5 | 1.04 |
| Mode = break (BREAKOUT) | 831 | 46.0% | −0.018 | −0.09 | −14.6 | 0.84 |
| Mode = fade (PIN) | 251 | 29.5% | −0.125 | −1.02 | −31.4 | 1.53 |
| Mode = maxpain | 32 | 62.5% | −0.049 | +0.03 | −1.6 | 0.60 |
| IS (first 60%) | 668 | 42.5% | +0.013 | −0.19 | +8.9 | 1.12 |
| Validation (20%) | 223 | 43.9% | −0.222 | −0.12 | −49.4 | 0.82 |
| **OOS (last 20%)** | 223 | 42.2% | **−0.031** | −0.11 | −7.0 | 0.93 |

**Gross (no-cost) vs. net:** mean R is −0.023 gross, −0.043 net (costs) — so
this isn't "a good strategy killed by spread," it's close to flat-to-slightly-negative
both before and after costs.

**Reading this honestly:** on EUR/USD, using the bot's real shipped logic and
real default config, this does not show a robust edge. In-sample mean R is
barely positive (+0.013); out-of-sample it's slightly negative (−0.031),
consistent with in-sample noise rather than a real signal — the same
"beautiful in-sample, disappears out-of-sample" pattern flagged elsewhere in
this book (Part 9), now found in the bot's own logic rather than a
univariate feature. PIN (fade) mode is the weakest slice (29.5% win rate,
mean −0.125R) despite a fat right tail (best trade +6.96R) — a real
mean-reversion signature, just not currently a profitable one on this pair.
Mode C (max-pain reversion) is the closest to breakeven but n=32 is far too
small to read anything into.

**What this does and doesn't tell you about the live bot's current profit:**
it doesn't resolve that question directly — the live bot trades gold and
indices, not EUR/USD, and the code's own comment already flags FX as the
weaker asset for this mechanism. What it does tell you: if the live profit
had been used as a reason to *enable* EUR/USD in the bot's universe, this
backtest gives no support for that expectation on this pair, using this
strategy's actual logic, over 6 years of genuine history. It's the first time
that question has been answerable with real data at all instead of an
untested assumption either way.

### Roadmap for this piece specifically

- **Run the same pipeline on gold and the indices** — R2's `OI Data/` folder
  doesn't have those in the schema this book used, but if/when it does, this
  is the test that actually speaks to the live bot's current universe and
  its live profit.
- **Reconstruct `stability`/`change` from this book's own historical OI**
  rather than passing `null` — this book already computes day-over-day OI
  change (Part 0's audit); wiring it into `classifyOIChange`'s expected shape
  would let `avoidLiquidating` actually gate zones in this backtest, closer
  to what a well-supplied live server would do.
- **A walk-forward re-run**, not one chronological split — per this repo's
  own Lego Principle 5, a single IS/OOS split is a weaker bar than
  walk-forward before treating any of this as settled.

---

## Part 13 — 2026-09-10 pipeline audit: verifying the analysis, not just trusting it

Before building further on this book, its own methodology was audited
line-by-line and against real data — the user's framing was exactly right:
"don't assume from past experience that the data analysis was right." Two
real findings came out of it (one gap closed, one risk tested and cleared);
everything else checked out. Recorded here so the verification is as
inspectable as the findings themselves.

**1. Max pain was never actually tested — closed, see Part 7b.** Part 7's
"pinning" test used the biggest-OI strike ("magnet"), not calculated max
pain. They coincide only 11% of the time. Real max pain, tested with the
same rigor, comes back an even cleaner null (Spearman IC ≈ 0, in-sample
*and* OOS) — this strengthens Part 7's conclusion, it doesn't undercut it.

**2. OI publish timing is later than this book's "T-1" convention assumed —
tested, and the headline finding survives unchanged.** Every intraday test
(Parts 9b, 12) lags wall levels by one trading day ("known before the day
starts"). Independent research (Databento's own worked example querying
this exact statistics schema, corroborated by CME's public Daily Bulletin
schedule) shows CME options OI for trading day D is not actually finalized
until the **Final Daily Bulletin, ~15:00–16:00 UTC on D+1** — not the start
of D+1 as assumed. That's a real, previously-uncosted lag: for roughly the
first two-thirds of a UTC trading day, the "T-1" level used here technically
wasn't yet fully public.

Tested directly rather than left as a caveat: re-running the wall-touch
detection with a stricter **T-2** lag (verified using this book's own
already-computed wall-persistence stats: the T-1 vs. T-2 convention actually
picks a *different* strike on 5.6% of days for calls, 10.0% for puts — real,
but a minority) barely moves the numbers:

| Side | Horizon | T-1 (original) | T-2 (conservative) |
|---|---|---|---|
| Call | 15 min | 68.4% reject, p=5×10⁻¹⁴ | 66.8% reject, p=6×10⁻¹² |
| Call | 60 min | 60.7% reject, p=1.9×10⁻⁵ | 59.2% reject, p=2.1×10⁻⁴ |
| Put | 15 min | 62.6% reject, p=2.4×10⁻⁷ | 62.6% reject, p=2.2×10⁻⁷ |
| Put | 60 min | 58.2% reject, p=9.0×10⁻⁴ | 57.5% reject, p=2.4×10⁻³ |

**The finding is robust to this specific timing risk.** Expected, given
Part 4's own wall-persistence numbers (88–95% unchanged day-to-day) — a
level "known" one day later is very likely still the same level — but
expected is not the same as verified, and now it's verified. (Not
re-committed as a script here since it reuses `05_intraday_validation.py`'s
own functions with the lag parameter changed; reproducible in a few lines
by anyone who wants to re-check it.)

**3. Checked and confirmed correct, no changes needed:**

- **DTE.** `(expiry − date).dt.days`, both sides normalized to UTC-naive
  before subtracting (the raw file's `date` is a bare calendar date, `expiry`
  carries a real settlement time, e.g. 14:00/15:00 UTC). Uses calendar days
  — the same day-count convention `js/oi.js`'s own `OI_GREEK_T` uses — not a
  bug, a shared simplification. Truncates a few hours of the true
  time-to-expiry (integer days from a fractional day gap); immaterial.
- **Gamma formula.** Standard Black-Scholes gamma, verified against the
  textbook formula by hand — correctly identical for calls and puts (gamma
  has no directional sign in real option math; only delta differs by side).
  The `+1 for calls / −1 for puts` in this book's code is applied to the
  **GEX contribution**, not to gamma itself — a dealer-positioning sign
  convention, not a math error.
- **GEX sign convention vs. the real system.** Directly re-checked against
  the actual `js/oi.js` production source (not re-trusted from an earlier
  claim): production computes `callGex`/`putGex` both positive and nets them
  as `callGex − putGex`. This book stores `put_gex` pre-negated and nets by
  addition — algebraically identical, just a different storage convention.
  Confirmed by tracing both, not assumed.
- **Strike-to-spot alignment (no CME-futures basis error).** The raw file
  has no spot/underlying column — spot is joined from `eurusd_d1.parquet`
  (OANDA) by calendar date, entirely separate from the option data's own
  vendor. Checked empirically for a systematic offset (an OI-weighted
  centroid of near-spot strikes vs. that day's spot, all 1,508 days): median
  offset **+2.5 pips**, IQR −11.8 to +15.6 pips, no multi-year drift — normal
  OI-clustering noise, not a meaningful basis error. (A cruder first attempt
  at this check produced a nonsensical ±100s-of-pips result — a proxy-method
  artifact, not a real finding; re-verifying with a better method is what
  caught that it was noise, not signal, which is itself the point of
  checking rather than assuming.)
- **What `settlement` and `volume` actually do.** `settlement` (the
  option's own premium, confirmed via Databento's schema docs — it is not
  the underlying) is loaded and audited for completeness (Part 1) and
  **never used in any calculation** — no wall, gamma, or max-pain number in
  this book is touched by it. `volume` is aggregated into
  `daily_master_*.parquet`'s `call_vol`/`put_vol` columns and then also
  **never used in any test** in Parts 2–9. Neither is a bug — real max pain
  and real gamma are OI-only formulas by definition — but if "using the
  data" implicitly meant "using every column," these two are the columns
  still sitting on the shelf. (Already flagged as a roadmap item: real IV
  from `settlement`, volume-vs-OI open/close classification — this audit
  just makes explicit that today they are exactly zero-weighted, not
  partially used.)

---

## Part 14 — Feature discovery for the break-vs-reject classifier

Before building an actual classifier on the ~800 validated touch events
(the next queued step after this book), a scoped set of candidate features
was tested — not the full 165-question conditional-analysis programme this
could theoretically expand into, but the handful directly load-bearing for
picking real features over guessed ones. Two are null, one looked real and
wasn't, and one real feature came out of debunking it.

**`11_feature_discovery.py`, run on the 843 touch events from Part 9b/12,
enriched with `surface_near.parquet` (volume/OI-change at the touched
strike) and real M1 data (session, momentum, and a genuinely causal
pre-touch volatility measure — strictly the 60 minutes *before* each touch,
never its own outcome window).**

**Null, dropped:**
- **Volume/OI quadrant** (high/low volume × rising/falling OI at the touched
  strike) — p=0.97 at 15min, p=0.89 at 60min. All four quadrants reject
  ~59–67% regardless. Closes the audit's flagged gap (`volume` had never
  been used anywhere in this book) with an honest answer: no signal from
  this framing.
- **Prior momentum** (60/240min return before the touch) — clean null as a
  standalone predictor (r=0.001–0.044, all p>0.2, both horizons). Confirms
  the wall-touch effect isn't secretly a repackaged momentum signal.

**Looked real, wasn't — a debunked confound, same shape as Part 7's pinning
trap:** Session split at 15min looked genuine (Asia 77.2% reject vs. NY
60.6%, p=0.0046). But stratifying by a **causal pre-touch volatility
tercile** (computed strictly from the 60 minutes before each touch, never
looking into the outcome) shows why: 84% of Asia touches (77 of 92) fall in
the lowest-volatility tercile, and *within* each vol tercile Asia's reject
rate is not consistently higher than London/NY at all (33–82%, no
pattern). **Asia doesn't have special wall behaviour — Asia is just quiet,
and quiet markets mechanically "stay on the same side" more often,
regardless of walls.** Session is dropped as a feature.

**The real feature this confound-hunt surfaced:** pre-touch volatility
itself predicts the outcome — lower vol before a touch → higher reject rate
(r=−0.093, p=0.007 at 15min; low/mid/high vol terciles: 71.6% / 66.2% /
58.7% reject). Null at 60min (p=0.38), consistent with everything else in
this book decaying by that horizon. **This wasn't on the original candidate
list — it's what was actually driving the session result.** Goes into the
classifier.

**Promising, flagged as thin, not yet trusted:** ΔOI percentile at the
touched strike shows a real-looking non-monotonic pattern (below-p75:
64.5%/57.1% reject at 15/60min; p75–p90: jumps to 75.4%/71.1%; above-p90:
drops back to 58.3%/59.5%), significant at both horizons (p=0.024, p=0.017).
The p75–p90 "moderate elevation" bump **survives stratification by vol
tercile** (elevated in all three: 77.8% vs. 72.4% low-vol, 83.0% vs. 63.2%
mid-vol, 64.1% vs. 56.9% high-vol) — a real first confound check passed.
But the above-p90 bucket is thin (n=84 total, split unevenly 10 call/74 put)
and its "drops back down" reading doesn't replicate consistently once
vol-stratified (42.9% low-vol, 60.0% mid-vol, 62.5% high-vol — no clean
pattern). **Verdict: the p75–p90 elevation is a legitimate candidate
feature; the above-p90 reversal is not yet reliable enough to act on** —
needs a bigger sample (multi-pair pooling, queued roadmap item 3) before
trusting the tail.

**Explicitly not done, not skipped silently:** DTE-conditional touch
behaviour (does the effect vary by proximity to expiry?) needs the DTE of
the specific touched wall's own expiry, which isn't in any committed/local
file — only the near-dated *aggregate* surface (mixing up to 2 expiries) is
available without re-running `01_build_daily_dataset.py` against the raw R2
CSV. Queued for whenever R2 access is available again. Also explicitly
**not** run: a calendar/day-of-week/week-of-month/month sweep — a real
multiple-testing trap (many buckets, low prior, easy to find noise) that
isn't needed to build the classifier.

**Feature set going into the classifier:** pre-touch volatility (validated)
+ ΔOI percentile, p75–p90 tier only (passed one confound check, flagged as
needing more data) + the wall side (call/put, already known to differ) +
horizon (≤60min only — the effect is gone by 240min throughout this book).
Session and volume/OI quadrant are excluded, not omitted by oversight.

---

## Part 15 — Building the break-vs-reject classifier: a negative result, honestly reached

The queued next step after Part 14's feature discovery. The honest headline:
**the classifier does not beat the simplest possible baseline out of sample,
in any parameterization tried** — and the likely reason is identified, not
just shrugged at.

**Method (`12_break_reject_classifier.py`).** A deliberately small logistic
regression (3 terms: wall side, standardized pre-touch volatility, the
validated OI-change p75–p90 indicator) predicting reject-vs-break at 15 and
60 minutes, chronologically split 60/20/20 (never randomly — a random split
would leak touches from the same wall-episode across train and test).
Every OOS number is checked two ways: touch-level metrics, and an
episode-level cluster bootstrap on the test period (resampling whole
wall-episodes, not touches — the same discipline `06_intraday_cluster_
significance.py` already applied to the underlying finding). The comparison
that matters throughout: does conditioning on these features beat just using
the side's own historical reject rate, with nothing else?

**The sample-size problem, stated up front because it explains everything
after it:** the chronological split leaves only **42 independent
wall-episodes in training, 13 in validation, 18 in test.** That is thin for
even a 3-parameter model — a genuine structural constraint, not a modelling
choice.

**3-feature model — in-sample looks fine, OOS does not:**

| Horizon | `is_p75_90` coef (in-sample) | OOS episode-bootstrap: P(model doesn't beat baseline) |
|---|---|---|
| 15min | +0.72, p=0.010 | **87.1%** |
| 60min | +0.72, p=0.007 | **100.0%** — mean Brier gap 95% CI entirely negative (model is worse) |

`pre_vol_60m`, significant as a *standalone* univariate predictor in Part 14
(p=0.007), is no longer independently significant once jointly fit with the
other two terms (p=0.11–0.43) — some of its signal is being absorbed
elsewhere in the small model, itself a sign of a model working near its
statistical limits on this sample.

**Simplicity check: does dropping to the ONE feature that looked
strongest do any better?** No — and this is the more important result,
because it rules out "too many parameters" as the explanation:

| Horizon | 1-feature in-sample p | OOS Brier (model vs. baseline) | OOS AUC |
|---|---|---|---|
| 15min | 0.0099 | 0.217 vs. **0.212** (worse) | **0.483** (below 0.5) |
| 60min | 0.0079 | 0.235 vs. **0.230** (worse) | **0.490** (below 0.5) |

Even the single feature with the cleanest in-sample p-value and a confound
check already passed (Part 14) **fails outright when actually asked to
generalize forward** — an OOS AUC below 0.5 means its ranking is slightly
worse than a coin flip. This is the same "beautiful in-sample, gone
out-of-sample" pattern Part 9 flagged as the clearest lesson in this entire
book, now caught a second time, in a feature that had already survived one
round of scrutiny.

**Verdict: don't ship this classifier.** Conditioning wall-touch predictions
on volatility or OI-change tier, with the sample currently available, adds
no demonstrated value over the plain side-specific base rate — which is
exactly what's already live on `oi-dashboard.html`'s wall-touch read (Part
9b/12's original finding, unconditioned). Building more model on top of it
right now would be adding false precision, not real information. The
honest, well-earned conclusion is that this was correctly identified as
sample-size-limited *before* being deployed, not after — the entire reason
to build it carefully with episode-aware OOS validation in the first place.

**What actually unblocks this: roadmap item 3 (multi-pair pooling), now
promoted.** 42/13/18 independent episodes on one pair is the wall this
result ran into, not a flaw in the modelling approach. R2 already holds the
same schema for 6 more pairs — pooling them is the direct way to get enough
independent wall-episodes to validate a conditional classifier honestly,
rather than the only options being "ship an untested model" or "stop here."

---

## Part 16 — Multi-pair infrastructure (roadmap item 3, in progress)

Every script through Part 15 hardcoded EUR/USD's paths, filenames, contract
multiplier, and pip size. Pooling the other 6 pairs already sitting in R2
needed that generalized first — done here, and verified carefully, because
getting a currency pair's own quoting convention wrong is exactly the kind
of silent, hard-to-notice bug this book has tried to catch everywhere else.

**What changed.** `01_build_daily_dataset.py`, `05_intraday_validation.py`,
and `06_intraday_cluster_significance.py` now take a pair code (`GBP_USD`,
`USD_JPY`, ...) and read/write pair-suffixed filenames — **except**
`EUR_USD`, which keeps its original, already-committed filenames exactly as
they were, so nothing already published moves. A new
`13_pool_multi_pair.py` pools wall-touch episodes across every pair that's
been through the pipeline and re-runs Part 9b/12's exact episode-cluster
bootstrap on the combined set — reporting both the pooled result (the
actual payoff: more independent episodes than one pair can supply) and a
**per-pair breakdown**, so pooling can never quietly average away a pair
where the effect doesn't hold. A new `pair_config.py` centralizes the
per-pair facts, pulled from the real production registries rather than
guessed:

- **Contract multiplier** — `js/oi.js`'s `oiContractSize()` treats every FX
  pair as 125,000 (only indices/gold differ; `NAS100_USD` → 20 via its
  `isNQ()` check). Matched exactly rather than using the textbook
  per-currency CME contract sizes (GBP futures are actually 62,500, JPY
  12,500,000, etc.) — the point is testing what the live system actually
  assumes, per Part 0, not a more "correct" number nobody's trading off.
- **CME strike inversion** — `js/oi.js`'s `futuresIsInverted()` is the
  authoritative list: CME quotes `USD/JPY`, `USD/CAD`, and `USD/CHF`
  options in foreign-per-USD terms, the reciprocal of the OANDA convention
  every D1/M1 price file and this book's pip-distance logic assumes. Get
  this wrong and every wall/gamma/pin number for those 3 pairs would be
  silently comparing incompatible units. A sanity check (same convention
  `server.js` already uses live to catch stale/mis-scaled OI) now fails
  loudly if strikes don't bracket spot even loosely, rather than building a
  surface on nonsense levels.
- **Pip size** — `oi-dashboard.html`'s own `pip()` function: JPY pairs use
  0.01, not EUR/USD's 0.0001. The touch-detection buffer (2 pips) and
  rearm margin (5 pips) were hardcoded in EUR/USD's units; a JPY touch
  would previously have used a buffer 100x too tight.

**Verification, not just a refactor and a hope.** Every change was checked
two ways before being trusted:
1. **Backward-compatible for EUR/USD.** Re-ran `05` and `06` with their
   default (no-argument) invocation against the real, already-committed
   EUR/USD data — `intraday_touch_events.csv` came back **byte-identical**;
   `intraday_touch_summary.csv` and `intraday_gamma_regime_daily.csv`
   differed only at the 16th–17th significant digit (floating-point noise
   from a different BLAS backend on this machine, not a logic change).
2. **Correct for a CME-inverted pair.** Built a synthetic USD/JPY chain
   with known OANDA-convention strikes (148–152, spot 150), fed it through
   the real CME-inverted raw format, and confirmed the pipeline's inverted
   walls landed back at 148–152 — not at the raw reciprocal scale
   (~0.0067). The sanity check passed silently, as it should when the
   pair config is right.
3. **Cross-pair pooling mechanics.** Ran `13_pool_multi_pair.py` on
   EUR/USD alone first (a "pool of one" reproduces Part 9b/12's numbers
   exactly, confirming the pooling logic reduces correctly to the
   single-pair case), then added the synthetic USD/JPY pair — episode
   counts and event counts increased by exactly the synthetic contribution,
   with no ID collisions between pairs' episodes.

**What's still blocked, and why this stopped here rather than faking a
result:** actually pulling `AUD_USD.csv`, `GBP_USD.csv`, `USD_CAD.csv`,
`USD_CHF.csv`, `USD_JPY.csv`, `NAS100_USD.csv` from R2 needs credentials
this local machine doesn't have (checked thoroughly — no env vars, no
`.env` file, no AWS-style credentials file). The infrastructure above is
built, verified with synthetic data standing in for the real thing, and
ready to run the moment R2 access is available (the cloud sandbox session
that originally built this book had it provisioned automatically) — but no
real multi-pair result is claimed here, because there isn't one yet.

**To finish this once R2 access is available**, per pair:
```
python3 oi_research_book/scripts/01_build_daily_dataset.py <PAIR>.csv <pair>_d1.parquet <PAIR>
python3 oi_research_book/scripts/05_intraday_validation.py <pair>_m1.parquet <PAIR>
python3 oi_research_book/scripts/06_intraday_cluster_significance.py <PAIR>
```
then `python3 oi_research_book/scripts/13_pool_multi_pair.py` (no
arguments pools every pair with completed files). `NAS100_USD` will also
need its D1/M1 price files confirmed present in R2's `m1/` folder — not
verified from here, since that pair wasn't in the original FX-focused scope
this book was built around.

---

## Appendix — reproduction

```
python3 oi_research_book/scripts/00_audit.py       /path/to/EUR_USD.csv
python3 oi_research_book/scripts/01_build_daily_dataset.py /path/to/EUR_USD.csv /path/to/eurusd_d1.parquet
python3 oi_research_book/scripts/02_walls_and_gamma.py
python3 oi_research_book/scripts/03_pinning_and_walls_reaction.py
python3 oi_research_book/scripts/04_predictive_ic.py
python3 oi_research_book/scripts/05_intraday_validation.py   # needs m1/eurusd_m1.parquet (R2, ~63MB)
python3 oi_research_book/scripts/06_intraday_cluster_significance.py   # depends on 05's output
python3 oi_research_book/scripts/07_export_bot_chain.py      # depends on 01's contract-level cache
node    oi_research_book/scripts/08_bot_backtest_zones.mjs   # calls the REAL js/oi.js + js/oiZones.js
python3 oi_research_book/scripts/09_bot_backtest_execute.py  # needs m1/eurusd_m1.parquet again
python3 oi_research_book/scripts/10_real_maxpain_test.py     # depends on 01's surface_near.parquet
python3 oi_research_book/scripts/11_feature_discovery.py     # depends on 05's touch events + surface_near.parquet + m1/eurusd_m1.parquet
python3 oi_research_book/scripts/12_break_reject_classifier.py  # depends on 11's enriched touches
```

Raw R2 inputs (`OI Data/EUR_USD.csv`, ~227MB; `m1/eurusd_d1.parquet`, ~175KB;
`m1/eurusd_m1.parquet`, ~63MB) and the contract-level forward-filled cache are
intentionally **not** committed (gitignored) — they're a few seconds'
download from R2 and under a minute to rebuild everything. Everything under
`oi_research_book/data/*.parquet` and `oi_research_book/data/results/*.csv`
**is** committed — small, derived, and exactly what every number in this
document was read from.
