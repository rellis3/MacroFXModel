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

## RESULTS — run 2026-09-28

Harness `analysis/news_asymmetry_study.py`, output `analysis/output/news_asymmetry.json`.
656 releases: 293 good, 270 bad, 93 in line.

**Verdict: NULL. The ABDV asymmetry does not appear here, and a meaningful one is
ruled out.**

| | n | β_good (per σ) | β_bad (per σ) | **Δ = bad − good** | 95% CI | t |
|---|---|---|---|---|---|---|
| **Pooled, family FE** | 656 | +0.157 (0.071) | +0.062 (0.058) | **−0.095** | [−0.232, +0.041] | −1.37 |
| 2016–2020 | 293 | +0.059 | +0.078 | +0.020 | [−0.156, +0.195] | +0.22 |
| 2021–2026 | 363 | +0.255 | +0.103 | −0.152 | [−0.340, +0.037] | −1.58 |

Gate: halves disagree in sign (fails); 4 of 6 families share the pooled sign.

**This is a real null, not an underpowered one.** The pooled interval's upper end is
+0.04, well below the +0.25 pass bar. §5 said the design could find 0.19. So a bad-news
premium of the size that would change how wide the desk sits through a release is ruled
out. The point estimate even leans the other way (good news moving slightly more), but
not significantly, and it is not stable across halves. `REVERSED` needed Δ ≤ −0.25.

Per family (description only, underpowered by §5, none survives BH at q = 0.10):

| Family | n | Δ | 95% CI | p |
|---|---|---|---|---|
| US core CPI m/m | 124 | −0.02 | [−0.83, +0.79] | 0.96 |
| US payrolls | 101 | −0.27 | [−0.64, +0.10] | 0.15 |
| US unemployment rate | 102 | +0.03 | [−0.29, +0.35] | 0.85 |
| US annual wage growth | 106 | −0.33 | [−0.65, +0.00] | 0.05 |
| CA unemployment rate | 112 | −0.08 | [−0.32, +0.17] | 0.55 |
| AU employment change | 111 | +0.16 | [−0.05, +0.38] | 0.14 |

**My expectation was wrong on (a), and (b)'s guess was wrong about where.** I expected
a modest bad-news premium. None appeared. I guessed that the inflation era might flip
CPI. CPI shows nothing either way (Δ −0.02). The only lean towards "good news moves
more" sits in the 2021–26 half and the US labour families (payrolls, wages), where a
strong print meant a hawkish Fed. That is an observation from a failed gate, not a
finding. If it is ever tested, it gets its own pre-registration with the regime
defined in advance.

**Also noted (not scored).** Within single families, several slopes are near zero or
negative (US unemployment, AU employment). Once |z| is capped at 3, the 30-minute
size of those releases barely scales with the surprise. That fits `surprise-size`,
which found the effect concentrated in the *biggest* surprises: a linear per-σ slope
is the wrong shape for them. That matters for Tier 1 #2. The vol forecast should use
the `surprise-size` terciles, not a linear β per σ.

**What changes.** Ledger entry `news-asymmetry` (null). The event-aware vol forecast
uses one symmetric jump size per family. No page says "the market fears a miss more
than it cheers a beat".
