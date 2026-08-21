# COT positioning factor — pre-registration

> **Status: PRE-REGISTERED 2026-08-21. Design frozen BEFORE any COT history was
> fetched** (CFTC is unreachable from the build sandbox, so no series existed to
> tune against — the same structural freeze guarantee that
> `CB_SENTIMENT_PRICE_TEST.md`'s lexicon had). NOT YET RUN: needs the Socrata
> backfill to run on the deployed server first.
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

**Split:** IS 2006 → 2017, **OOS 2018 →**. Chronological, fixed now.

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

## Result

*Not yet run — awaiting the Socrata backfill on the deployed server.*
