# NEWS-ASYMMETRY — Does a bad surprise move the market more than an equally large good one?

**Pre-registered 2026-09-28, before the harness was written or any slope computed.**
Written on `MD files/PREREG_TEMPLATE.md`. What was touched before registering is
listed in §5, exactly.

## 1. The claim

Andersen, Bollerslev, Diebold & Vega (2003), *Micro Effects of Macro Announcements*
(AER 93:1), measured 5-minute FX reactions to US releases 1992–98 and found two
things: the jump is linear in the standardised surprise, and **bad news moves the
dollar more than good news of the same size**. The desk version: "the market is
more afraid of a miss than it is pleased by a beat."

Only the asymmetry is new here. The size-per-surprise relationship is already
banked (`surprise-size`, validated).

## 2. Why it is not already settled

- **`event-impact-map` (validated)** measures each family's *unconditional* 30-minute
  size. It never splits by the sign of the surprise.
- **`surprise-size` (validated)** shows bigger surprises widen the release session,
  by terciles of |z|. It pools beats and misses, so it cannot see asymmetry.
- **`cb-tone-direction`, `priced-in-direction` (null)** concern *direction after* the
  event. This test is about the *size* of the first 30 minutes. It makes no directional
  claim and does not reopen them.

## 3. Definitions, fixed in advance

- **Events.** The six data-release families in `backfill/event_response_events.json`
  that carry a surprise z: US core CPI m/m, US payrolls, US unemployment rate, US annual
  wage growth, CA unemployment rate, AU employment change. 656 releases, 2016-01 →
  2026-07. The five central-bank decision families (no z) and FOMC (z is lexicon
  hawkishness, whose direction tests are banked nulls) are excluded.
- **Surprise.** `z` as stored: (actual − consensus) ÷ the series' own dispersion,
  **polarity-signed by `econSurprise.polarityFor`** (z > 0 = economically stronger
  than expected, whichever way the series is quoted). **Good news** = z > 0 and
  **bad news** = z < 0, for the releasing currency. z = 0 (an in-line print, 93
  releases) feeds the intercept only. **|z| is capped at 3** (the 2020 prints reach
  |z| > 20 and would otherwise set every slope).
- **Knowable when?** z is known at the release minute. The outcome is the reaction
  *to* it (R0: close t−1min → close t+30min), so this is a measurement of response
  size, not a forecast made before the event.
- **Outcome, per instrument.** |R0| in bp ÷ that instrument's median |R0| across all
  656 releases (a scale that ignores the sign of z, so it cannot favour either side).
- **Outcome, per release (the unit of analysis).** The mean of that ratio across the
  family's instruments, as stored: 8 USD instruments incl. gold for US families, 5
  CAD crosses, 7 AUD crosses. One row per release, so the 5–8 correlated pairs are
  never counted as independent tests.
- **Model.** `y = α_family + β_good·|z|·1[z>0] + β_bad·|z|·1[z<0] + ε`, OLS with
  heteroskedasticity-robust (HC1) standard errors.
- **The scored quantity.** `Δ = β_bad − β_good`, in units of a typical release
  half-hour per 1σ of surprise.
- **Sample split.** 2016-01 → 2020-12 (293 releases) and 2021-01 → 2026-07 (363).

## 4. Hypotheses, expectation first

| # | Question | Pre-registered expectation |
|---|---|---|
| a | Pooled Δ > 0: bad news moves more per σ than good news? | **Yes, modestly.** ABDV's finding for the dollar, but 20+ years later and on 30-minute rather than 5-minute windows, where some of the jump has already been absorbed. |
| b | **THE GATE.** Same sign of Δ in both halves, and in at least 4 of the 6 families? | **Uncertain.** The 2021–22 inflation era may have made *hot* CPI prints (economically "strong", z > 0) the market's bad news, which would flip the CPI family. This is written down now so that a CPI flip, if it appears, cannot be treated as a discovery afterwards. |
| c | Both slopes positive (the linear size-per-surprise relation, replicated)? | **Yes.** Already implied by `surprise-size`. Reported, not scored. |

## 5. Power — what this design can and cannot find

**What was touched before registering.** Counts of releases by family, half and sign
of z; the sign-blind per-instrument scale (median |R0|); and the pooled SD of the
per-release outcome (1.15, mean 1.39). **No slope, no split of the outcome by the sign
of z, and no Δ was computed.** The residual SD is taken as the full outcome SD, which
overstates the noise, so the MDEs below are conservative.

| Cell | n | MDE for Δ (80% power, two-sided α = 0.05) | Pass bar | Verdict |
|---|---|---|---|---|
| **Pooled, family fixed effects** | 656 | **0.19** | **Δ ≥ 0.25** | **POWERED** |
| 2016–20 half | 293 | 0.24 | sign only | (gate) |
| 2021–26 half | 363 | 0.29 | sign only | (gate) |
| Any single family | 101–124 | 0.33 – 0.85 | — | UNDERPOWERED → description only |

**Why 0.25.** A 1σ bad surprise would add a quarter of a typical release half-hour
over an equal good one. Smaller than that is too small to change how wide the desk
sits through a release.

## 6. Multiplicity

- **One scored cell:** pooled Δ. No correction needed.
- **The gate** (both halves, ≥ 4 of 6 families same sign) is conjunctive and only
  makes the pass harder.
- **Per-family Δs** are reported with Benjamini–Hochberg at q = 0.10 and the chance
  baseline for 6 cells. They are candidates, never results, and are underpowered by
  §5 anyway.
- **Not for live sizing** at |t| < 3, per the template's promotion bar.

**PASS** = pooled Δ ≥ 0.25 with |t| ≥ 2 (HC1), **and** the gate holds.
**NULL** = pooled Δ's 95% interval includes 0, or Δ < 0.25, or the gate fails.
**REVERSED** is recorded separately if Δ ≤ −0.25 with |t| ≥ 2: good news moving more.

## 7. What this does NOT test

- **Direction.** Which way the pair goes after the release is a banked null and stays
  one. This is only about how *far* it moves in the first 30 minutes.
- **Tradability.** A bigger reaction is not a trade. It feeds how wide the vol
  forecast sits on a release day (Tier 1 #2), after costs, separately.
- **Cause.** Asymmetry could come from positioning, liquidity withdrawal, or the
  state of the cycle. Nothing here separates them.
- **Central-bank decisions and FOMC** — excluded by construction (§3).

## 8. What each verdict changes

- **Pass** → ledger entry `news-asymmetry` (validated, range only). The event-aware
  vol forecast uses a sign-dependent jump size: wider after a miss than a beat.
- **Null** → ledger entry (null). The vol forecast uses one symmetric jump size per
  family (the `surprise-size` terciles), and no page says "the market fears a miss".
- **Reversed** → ledger entry (validated, reversed) naming the families that carry it.
  The CPI/inflation-era reading in §4(b) is the first explanation to check.

## 9. Harness

`analysis/news_asymmetry_study.py` reads `backfill/event_response_events.json`
only. It needs no network and no M1 parquets, because the per-event R0 rows are
already committed.

---

## RESULTS — run <YYYY-MM-DD>

*Appended below this line. Nothing above it changes after the run.*
