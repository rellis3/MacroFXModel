# COT positioning factor — pre-registration

> **Status: PRE-REGISTERED 2026-08-21. Design frozen BEFORE any COT history was
> fetched** (CFTC is unreachable from the build sandbox, so no series existed to
> tune against — the same structural freeze guarantee that
> `CB_SENTIMENT_PRICE_TEST.md`'s lexicon had). **RUN 2026-08-22 — the registered
> cell FAILED (p=0.094 vs a p<0.05 bar); banked as `BACKTEST_INDEX.md` Q17. See
> §Result.**
>
> This is proposal **P-C** of `education/151_STRATEGIES_PROPOSALS.md`, which
> derives from book strategy **9.2 (hedging pressure)** and the six-step method
> in `education/data-foundations-notes.md` (DF-01).

## The question, and the tension inside it

Does speculative positioning, measured as a **share of open interest** and ranked
against its own history, carry information about forward returns?

Two established theories predict **opposite signs**, and this project's two source
documents disagree accordingly:

| View | Source | Prediction |
|---|---|---|
| **Hedging pressure** — speculators are paid a risk premium for absorbing commercial hedgers' inventory risk | Kakushadze & Serur 9.2; the academic literature | **Follow**: high spec net → *positive* forward return |
| **Crowding** — extreme one-sided positioning marks a crowded trade that unwinds | `education/data-foundations-notes.md` DF-01; `QUANT_MACRO_LESSONS_1-6.md` L2 §2.6 ("positioning is potential energy") | **Fade**: high spec net → *negative* forward return |

**Therefore the confirmatory test is two-sided.** Registering a direction now
would be picking a theory before the evidence; interpreting the sign after a
one-sided pass would be worse. The sign is read off the result and mapped back
to whichever theory it supports — or to neither, if the interval spans zero.

Honest prior: this is a weekly, lagged, widely-published dataset — every retail
platform ships a COT indicator, so the public-decay pipeline
(`companion-insights-01-03-notes.md` Insight 03) applies with full force. The
platform's own prior record on positioning is "one input, not a standalone edge."
**No odds are attached** — the test decides.

## Data (frozen)

**Source:** CFTC Socrata, pulled directly — **not** `/api/cot-extremes`, whose
156-week cap and 7-day cache are display-grade. Datasets pinned:
- **TFF `gpe5-46if`** for the six currency futures (2006→). Futures-only.
- **Disaggregated `72hh-3qpy`** for gold (2006→). Futures-only.

Pinning matters: the legacy manual-URL pipeline in this repo parses
**Options-and-Futures-Combined** files and writes the *same field names*, so
mixing provenance would silently compare different position universes and
different OI denominators. This test reads only the two datasets above.

**Participant definition — stated, not assumed.** The code uses **Leveraged
Funds** (TFF) for FX and **Managed Money** (Disaggregated) for gold. Neither is
the legacy report's "Non-commercial" that DF-01's lesson text describes
(Non-commercial ⊋ Managed Money; Leveraged Funds is narrower again). This test
uses the TFF/Disagg definitions throughout and does **not** pool the FX and gold
`commNet` series as one variable, because "the other side" means different things
in each (`commNet` on the TFF path is Asset Manager + Dealer summed, not
commercial hedgers).

**Universe (8):** EUR, GBP, JPY, AUD, NZD, CAD, CHF currency futures + gold —
every CFTC contract that maps to an instrument with local M1 price history.
Index futures are excluded (no local index price data). Crosses are excluded:
`today.html` *derives* cross positioning from two legs, which is a construction,
not observed data.

**Sign convention:** JPY, CAD and CHF futures quote the foreign currency, so
their net is flipped into pair terms (long JPY futures = short USD/JPY). This is
applied to net, share, z and percentile **together** — flipping some and not
others is the documented `grossRatio` bug and must not be repeated.

**History guard:** contract renames truncate Socrata history silently (the
fetcher returns the first name that yields rows and never merges). The backfill
records the real row count per instrument; any instrument with **< 260 weeks
(5y)** after the lag is reported and **excluded from the confirmatory cell**,
not silently carried.

**Known irreducible limitation, recorded now:** Socrata serves the *current*
value of historical rows, so revisions/restatements are baked in — this is a
revised-vintage backtest, not a first-print one. No vintage capture exists and
building one would take years of forward capture. Stated, not hidden.

## Publication lag (frozen — the main lookahead trap)

COT is a **Tuesday** snapshot released **Friday 15:30 ET**. No code anywhere in
this repo currently shifts report date to release date; every existing surface
only displays staleness. Naively joining report dates to price bars would hand
the test three days of returns it could not have traded.

**Frozen rule: a report dated Tuesday T becomes tradable at the OPEN OF THE
FOLLOWING MONDAY** (T + 6 calendar days). This is deliberately one step more
conservative than the earliest legal moment (Friday 15:30 ET): it avoids the
thin Friday-late-session fill and the ET/London boundary entirely, and costs
only two days of a multi-week signal. Zero free parameters — no "optimal lag"
is searched, now or ever, under this registration.

## Signal (frozen, zero tunable parameters)

Per instrument, per weekly report, following DF-01 steps 1–4 in that order:

1. `specNet = specLong − specShort` (sign-flipped for JPY/CAD/CHF)
2. **`share = specNet / openInterest`** — the OI-normalisation step; this is the
   quantity that gets ranked, never the raw contract count
3. `z = rollingZScore(share, 156)` — 3-year window, via `js/statsCore.js`
4. `pct = rollingPercentile(share, 156)` — same window, same brick

The rolling window is 156 weeks because that is what DF-01 specifies ("3-year
percentile") — inherited, not chosen here.

> **Recorded amendment (2026-08-21, before any run, no results seen).** The
> original wording said the current week is *excluded* from its own reference
> window — that is `_worker.js`'s convention (`h = a => a.slice(1)`). The shared
> bricks `statsCore.rollingZScore` / `rollingPercentile` **include** it
> (`arr.slice(i-period+1, i+1)`). This test uses the shared bricks unmodified,
> so the current week is included. Neither convention is lookahead — both read
> only data available at that week — and importing the brick beats hand-rolling
> a third copy of a z-score (the repo already has two: `_worker.js` and a
> verbatim copy in `cot-extremes.html`). Amendment recorded rather than made
> silently; no pass bar moved.

**Primary signal = `z`** (continuous, uses the whole distribution).
`pct` and the ≥90th/≤10th extreme buckets are reported descriptively only.

## Target and the confirmatory cell (frozen)

**Target:** forward **4-week** log return of the tradable instrument, measured
open-to-open from the tradable Monday. Four weeks because positioning is a
slow, weeks-to-months quantity in every source that treats it seriously
(`QUANT_MACRO_LESSONS_1-6.md` L5 §5.3); 1-week and 8-week are reported
descriptively but carry **no pass/fail weight**.

**Confirmatory cell — exactly one:** pooled **Spearman rank-IC** of `z` against
the forward 4-week return, across all qualifying instruments, **out-of-sample
only**, via `statsCore.rankIC`.

**Significance:** `statsCore.blockBootstrapIC` with `meanBlock = 4` (matching the
forward-window overlap) — a plain t-test is invalid here because overlapping
weekly windows are autocorrelated. Precedent: `js/volReversionCore.js:113-136`.

> **Recorded amendment (2026-08-22, before the run, no results seen).** Two
> points where the frozen wording meets the actual brick:
> 1. It says "95% CI excludes zero". `blockBootstrapIC` returns no CI — it
>    block-resamples to build the NULL distribution and reports a two-sided
>    **p-value**. At the 95% level these are the same decision rule
>    ("CI excludes 0" ⟺ "p < 0.05"), so the cell uses **p < 0.05**.
> 2. The brick floors `meanBlock` at 5, above the requested 4. A larger block
>    retains MORE autocorrelation in the null, widening it and making the test
>    **harder** to pass — accepted as conservative rather than overridden.
>
> No pass bar moved in either case.

**Split:** IS 2006 → 2017, **OOS 2018 →**. Chronological, fixed now.

> **Price-coverage note (recorded 2026-08-22, before the run, no results seen).**
> Local M1 price history begins **2016-01-04**, so the joined panel cannot start
> at the COT series' 2006 origin. This does **not** touch the confirmatory cell,
> which is **OOS-only (2018 →)** and fully covered — and the signal has zero
> fitted parameters, so the IS window is used for nothing but description. The
> practical effect is that the "IS" period is 2016–2017 rather than 2006–2017.
> No pass bar moved. Extending price history earlier would require an OANDA
> pull on the deployed server and is not needed for the registered cell.

> **Execution note (2026-08-22).** The cell runs SERVER-SIDE via
> `GET /api/cot-factor-test/run` — the only place both halves of the join exist
> (COT history in KV, prices via OANDA `fetchD1`); handing the ~7,200-row series
> to a sandbox session for the Python harness proved impractical. It re-uses
> `statsCore`'s `rankIC` and `blockBootstrapIC`, so no statistic is
> re-implemented, and the Python harness in `analysis/cot_factor/` remains the
> METHOD validation (synthetic self-test: detects a planted effect, returns null
> on noise). Prices are OANDA **D1 opens, first bar on or after** the tradable
> Monday — holidays resolve FORWARD, never backward, so a trade can never be
> priced before its signal existed. Using D1 rather than the local M1 also lifts
> the price-coverage limit noted above, since OANDA D1 reaches back further.

**PASS** iff the OOS pooled rank-IC's **95% block-bootstrap CI excludes zero**,
AND the point estimate has the **same sign in both OOS halves** (2018–2021 /
2022–2026), AND ≥6 of the 8 instruments qualify on the history guard.
**FAIL** on any miss. A pass at |IC| ≈ 0.02–0.05 is a real-but-weak signal in
this harness's own words (`js/rankICEngine.js` header) — it would be a
*conditioner*, never a standalone entry.

## Decision table (written before running)

- **PASS, negative IC (crowding/fade):** the DF-01 reading is supported. Next
  step is an overlay test — does conditioning the existing trend basket on COT
  extremes improve its OOS Sharpe? — as its own pre-registration. Not a
  standalone strategy.
- **PASS, positive IC (hedging pressure):** book 9.2 is supported on this
  universe. Same next step, opposite sign.
- **FAIL:** banked as a null in `BACKTEST_INDEX.md`. COT stays exactly what
  the platform already labels it — positioning *context*, weekly and lagged,
  not a timing signal — and the live `cot_filter` module stays off by default
  with no further work owed. P-C closes.

In all outcomes the OI-normalisation fix (PR #1303) stands on its own: it
corrects a defect the review documented regardless of what this factor does.

---

## Result (run 2026-08-22 via `GET /api/cot-factor-test/run`)

**CONFIRMATORY CELL: FAIL — banked.** COT data generated 2026-08-22T17:13Z;
8/8 instruments qualified (899 scored weeks each, NZD 896); 3,576 OOS rows
2018→2026.

| Check | Result | Bar | |
|---|---|---|---|
| Block-bootstrap significance | **p = 0.0936** | p < 0.05 | ❌ |
| Both OOS halves share the sign | −0.0252 / −0.0412 | same sign | ✅ |
| Qualifying instruments | 8 / 8 | ≥ 6 | ✅ |

**Pooled OOS rank-IC = −0.0317** (null mean 0.0001, null sd 0.019 → ≈1.7σ).
Two of three checks pass; significance does not. Per the frozen bar that is a
**FAIL**, and it is recorded as one. The sign is consistently negative — the
*crowding / fade* direction — in both halves and in 5 of 8 instruments, but a
consistent sign that cannot clear its own significance bar is not a result.
**Neither theory is supported**: `readsAs: "no supported direction"`.

### Method flaw found while reading the result — and why the null survives it

The panel is stacked across instruments and then **sorted by date**, so rows
sharing a date sit adjacent. `blockBootstrapIC` therefore resampled blocks of 5
*neighbouring rows*, which at that sort order are ~5 different instruments on
the same week — **not** 5 consecutive weeks of one instrument. The block was
meant to preserve the autocorrelation created by overlapping 4-week forward
windows, and it did not.

Direction of the error matters: failing to preserve that time-overlap makes the
null distribution **too narrow**, which makes the p-value **too small** and the
test **easier** to pass. It failed anyway. A correctly blocked test would give
p > 0.0936, i.e. fail harder — so the verdict is robust to the flaw and is not
being re-run to chase it. (Re-running a design after seeing its result is the
hazard this whole registration exists to prevent.)

A second inflation runs the same way: the 7 FX legs are largely one USD trade,
so the effective sample is far below 3,576. Both errors flatter the signal;
neither rescues it.

### Per-instrument (descriptive — the registered cell was pooled)

| | EUR | GBP | JPY | AUD | CAD | CHF | NZD | GOLD |
|---|---|---|---|---|---|---|---|---|
| OOS rank-IC | −0.043 | **−0.228** | +0.013 | +0.004 | −0.099 | −0.015 | −0.079 | **+0.117** |

Disaggregation is required before declaring a pooled null, so: the spread is
wide, and **GBP and GOLD point in opposite directions**. GBP's −0.228 on 447
rows is a naive t ≈ −4.9, but that collapses to ≈ −2.5 once the 4-week window
overlap is taken into account, and it is **1 of 8 cells** examined — the
chance-baseline for a standout that size among 8 correlated cells is not small.
There is also no pre-registered mechanism for GBP specifically. It is therefore
**an observation, not a claim**; pursuing it would need its own registration
with a stated mechanism and its own multiple-testing accounting. Gold pointing
the other way is a reminder that "positioning" means different participants in
the two reports (Managed Money vs Leveraged Funds), as this document flagged
before the run.

### Decision table, executed

**FAIL → banked in `BACKTEST_INDEX.md` (Q17).** COT remains exactly what the
platform already labels it: positioning **context**, weekly and lagged, not a
timing signal. `bot/modules/cot_filter.py` stays **off by default** and no
further work is owed on it. **Proposal P-C closes.**

What stands independently of this verdict:
- The **OI-normalisation fix** (PR #1303) — it corrected a documented defect in
  the live path, and also restored the morning brief's COT blocks, which had
  been silently null since ~19 Aug.
- The **history + lag infrastructure** — 20 years of publication-lagged,
  OI-normalised weekly positioning now exists and is reusable if COT is ever
  wanted as a conditioner on an edge that already exists (never as the edge).
