# B1 — Does market narrowing predict anything?

**Pre-registered 2026-09-23, before the harness was written or run.**

## The claim

Nicholas Crown, on RSP (equal-weight S&P) divided by SPY (cap-weight S&P):

> "When this ratio compresses, that means the market is getting narrower and narrower.
> That means the Metas, the Amazons, the Teslas, those are the guys driving returns. It
> means the small caps have nothing to do with the rally... This is a textbook rotation.
> The index looks boring, and underneath there's complete chaos."

The *description* is not in dispute and is arithmetically true: both legs are the same
500 companies and only the weighting differs, so the spread between them IS the
concentration of the return. The board already shows it (`eqwt`), and on 2026-09-23 it
sat at **−5.09 points over 20 sessions, z −2.25, the 1.2nd percentile of its own 677
readings**, with the S&P itself flat at +0.26%.

What is in dispute is whether it is worth **acting** on. "Textbook rotation" implies a
consequence. This asks what the consequence actually is.

## What is being tested

Signal at session *i*: the 20-session equal-weight-minus-cap-weight spread scored
against its own trailing history (`scoreSeries` in `js/marketScan.js`, which uses only
data up to *i*).

- **NARROW**: z ≤ −1.8
- **BROAD**: z ≥ +1.8 (the mirror, so a result cannot come from a one-sided artefact)

Forward windows start at *i+1* — no overlap between the window that builds the signal
and the window that scores it.

## Hypotheses, each with the direction stated in advance

| # | Question | Pre-registered expectation |
|---|---|---|
| H1 | Does narrowing precede a **fall** in the S&P over 5 / 20 sessions? | **Null.** This is the popular version of the claim and the neighbouring one (crowding → direction, via Dispersion) is already a banked null here. |
| H2 | Does narrowing precede a **wider** S&P over 5 / 20 sessions? | **Possible.** The Dispersion study found a real 20-day range effect (+0.52 [+0.37, +0.64]) by two independent paths. If concentration matters at all, range is where it shows. |
| H3 | Does an extreme narrowing **revert** — does the spread broaden back? | **Unknown, genuinely.** This is the one a trader would want. Stated as unknown rather than guessed. |
| H4 | Does the **rotation continue** — do small caps keep lagging big tech? | **Unknown.** Momentum and reversion both have priors here. |

## Method, fixed in advance

- **Sample**: `/api/drill-series`, RSP and SPY, ~1,505 sessions.
- **De-clustering**: events kept only if ≥ 20 sessions apart. Overlapping 20-session
  windows are not independent observations and counting them inflates every n.
- **Control**: every de-clustered session NOT in the signal set, over the same period —
  the unconditional base rate, so "stocks usually go up" cannot be mistaken for an edge.
- **Uncertainty**: block bootstrap, blocks of 10, 1,000 resamples, 95% interval on the
  difference from control.
- **Stability**: first half vs second half reported separately. A result that appears in
  one half only is not a result.
- **MIN_EVENTS = 15** de-clustered events. Below that the test is declared
  **UNTESTABLE** and no verdict is issued — an empty or near-empty control set has
  produced a false "null" on this desk before.

## What each outcome would mean

- **Any H real and stable** → it earns a Desk Watch trigger and an Evidence Book entry,
  and the board's `notMeans` text is rewritten to say what it does predict.
- **All null** → the finding stays **descriptive**, the `notMeans` keeps saying so, and
  it does NOT get an alert. A descriptive finding is still worth showing: it tells you
  what your index exposure actually is (long eight companies, not "the market") and
  that an index hedge is hedging the wrong risk. That is a positioning fact, not a
  timing one.

Writing the null down in advance is the point. The failure mode this guards against is
finding a 1.2nd-percentile reading, deciding it must mean something, and building an
alert on a story.

---

## RESULTS — run 2026-09-23

**First run was UNTESTABLE and said so.** The drill-series bundle only carries six
years, which produced **7** de-clustered events against a floor of 15. The harness
refused to issue a verdict. (Its summary line initially printed "NULL on every
hypothesis" off that run, which is exactly the failure the floor exists to prevent —
fixed: UNTESTABLE, NULL and REAL are now three distinct outcomes.)

Re-run on the full history from Yahoo (keyless): **RSP from 2003-05-01**, 5,886 shared
sessions, **35 NARROW / 33 BROAD / 267 control** after de-clustering 20 apart.

| Hypothesis | 5d | 20d | Verdict |
|---|---|---|---|
| H1 S&P direction | −0.15 [−1.04, +0.72] | −0.48 [−2.70, +1.57] | **NULL** (as pre-registered) |
| H2 S&P range | +0.27 [−0.08, +0.63] | +0.37 [−0.10, +0.85] | **NULL** |
| H3 spread reverts | −0.16 [−0.52, +0.14] | −0.06 [−0.40, +0.29] | **NULL** |
| H4 rotation runs on | −0.37 [−1.12, +0.38] | −0.07 [−0.94, +0.71] | **NULL** |

**Verdict: NULL on all four.** Narrowing is real, measurable and describable. It does
not predict direction, range, its own reversion, or the continuation of the rotation.

### Two details that matter more than the headline

**H2 is the near-miss, and the mirror kills it.** Range after narrowing is positive at
both horizons (+0.27, +0.37) with intervals that only just cross zero — tempting. But
the **mirror** — extreme *broadening* — is positive too (+0.17, +0.28). If both ends of
the same spread raise forward range, the effect is not about breadth: extreme breadth
readings of either sign happen inside volatile periods, and the range is the period,
not the signal. Testing the mirror is what separated those.

**The stability check could not be completed.** The first half holds only 14
de-clustered events, below the floor, so only the second half is reportable. The nulls
are therefore full-sample nulls without a half-split to back them. Nothing here should
be re-tested at a looser gate to manufacture events.

### What follows from this

- **No Desk Watch trigger, no alert.** The pre-registration said an alert requires a
  real and stable result. It got neither.
- The board finding **stays**, with its `notMeans` rewritten to cite this study instead
  of an assumption carried over from the Dispersion work.
- What it is still good for is **positioning, not timing**: at the 1.2nd percentile
  reading of 2026-09-23, being long the S&P is being long a handful of its largest
  companies rather than "the market", and an index hedge is hedging the index's
  direction when the actual exposure is concentration. That is worth knowing every day
  and worth acting on never — which is precisely the distinction this desk keeps
  getting value from.

Harness: `analysis/breadth_narrowing_study.mjs` (`--long` for the full history).
Output: `analysis/output/breadth_narrowing.json`.
