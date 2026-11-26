# gold-calc-upgrades: results

**Setup**
- Prereg: `forge/GOLD_CALC_UPGRADES_PREREG.md` (005ccfba). Script: `scripts/gold-calc-upgrades/score.py`. Seed 20261126.
- Gold futures (GC, NT8) is the primary sample; OANDA XAU_USD is the replication.
- Test period: 2020 → 2026-08-21. Each test year is fitted only on the years before it.
- Common sample (every arm finite): 1,659 futures sessions and 1,699 CFD sessions.
- Scoring: per-line QLIKE (lower is better), scaled exactly as in the export race.
- Baseline: the calc each line uses in the live QLIKE export (HARCJ; on the CFD, R15 for OH and Close+).
- **Nothing live changed.**

**Controls**
- My re-implementation of HARCJ reproduces the export's HARCJ (max relative difference 2e-15, both tracks).
- A HARCJ-plus-noise arm scores +0.02% (futures) and +0.04% (CFD), so a random extra regressor doesn't help.

## Verdicts

% change in QLIKE on Jordan's lines (HL + Close+ + Close−) against the export's calc. Negative means better. Each arm
was run on gold futures, with the CFD as the replication.

| Arm | What it adds | Futures [90% CI] | Halves 2020–22 / 2023–26 | BH | CFD | Verdict |
|---|---|---|---|---|---|---|
| **N7 ALL** | everything below, fitted by QLIKE | **−8.84%** [−11.34, −6.36] | −8.54 / −9.09 | yes | −7.13% | **VALIDATED** |
| **N4 FRESH** | volatility in the hour before London opens (22:00–24:00 London) | **−6.92%** [−8.69, −5.30] | −6.67 / −7.13 | yes | −6.11% | **VALIDATED** |
| **N6 HARCJ+IV** | GVZ (gold implied vol) as a regressor | **−2.81%** [−4.38, −1.33] | −1.70 / −3.77 | yes | −2.13% | **VALIDATED** |
| **V3** | existing scaled-GVZ arm | −1.76% [−3.46, −0.14] | −1.02 / −2.41 | yes | −0.62% | **VALIDATED** (weak) |
| **N1 HARQ** | trust yesterday less when it was noisy | −0.42% [−0.73, −0.08] | −0.17 / −0.64 | yes | −0.53% | **VALIDATED** (tiny) |
| N3 SESS | yesterday split into Asia / London / NY | −0.78% [−2.13, +0.20] | +0.15 / −1.60 | no | +0.17% | UNDERPOWERED |
| N5 RR | realized range instead of realised variance | −0.21% [−0.58, +0.16] | −0.34 / −0.10 | no | −0.55% | UNDERPOWERED |
| V4 | raw GVZ | −1.62% [−3.49, +0.21] | −0.88 / −2.26 | no | −0.32% | UNDERPOWERED |
| B_har_iv | 50/50 HAR + GVZ | −0.32% [−1.74, +1.19] | +0.28 / −0.85 | no | +0.14% | UNDERPOWERED |
| N2 QL-HARCJ | same features, fitted by QLIKE | +0.29% [−0.00, +0.59] | +0.29 / +0.29 | no | −0.09% | **NULL** |

## What did the work

**1. The pre-open hour (N4 FRESH, about −7%)**
- The export's calc only sees completed NY days, which end at 22:00 London. FRESH adds the realised volatility of the
  last hour or so before the London session starts (gold reopens at 23:00 London).
- Its coefficient is +0.27 (futures) and +0.25 (CFD), in the last fit year.
- The gain is there in every year (−4.9% to −10.4%) and on every weekday, on both feeds.
- Changing the target alone (a control with HARCJ's features and FRESH's target) is +0.15%, so the gain comes from
  the information in that hour, not from the target change.
- Alignment audit: the window is always 22:00–24:00 London on the evening before the session; one edge row has
  nothing to read. Typically it holds about 1% of the day's variance.
- **The gain is concentrated:** 56% comes from the top 1% of days and 88% from the top 5%. These are days when the
  Asian open was wild and the export's line was far too narrow, for example:
  - 2023-12-04, gold's Asian-hours record spike: the hour before London ran 4.3× normal and HL was 4.7%;
  - 2021-08-09, the Asian-open flash crash;
  - 2026-01-29/30.
- In plain terms: **on most days it changes little, but on the days that matter it widens the lines before London
  opens.**

**2. Gold implied vol as a regressor (N6, about −3%)**
- It beats every older GVZ arm (V3 −1.8%, V4 −1.6%, the 50/50 blend −0.3%). GVZ's coefficient is about 0.70, and
  the 22-day term turns slightly negative.
- The old IV arms were never beaten on the merits; they were left out of the export picks as not site-computable.

**3. Combined (N7, about −9%)**
- Together they add up but overlap: FRESH −6.9% and IV −2.8% combine to −8.8%. The control with FRESH + IV
  (OLS, not QLIKE-fitted) is −7.9%.

**4. Didn't help:** fitting HARCJ by QLIKE (NULL); splitting yesterday by session or using realized range (too small
to tell); HARQ helps, but only by −0.4%.

## By line (futures, N4 FRESH vs export calc)

HL −17.7% (most), then OL −6.7% and Close− −6.4%; OC −4.4%, Close+ −2.2%, OH −1.8%.
On the CFD: HL −15.7%, Close− −5.3%, Close+ −2.3%.

## Descriptive: does it change the lines you trade?

| | Export calc (HARCJ) | N7 ALL |
|---|---|---|
| Futures hit rate HL P50 / P75 / P90 | 53.3 / 26.1 / 9.8% | 49.1 / 24.2 / 9.0% |
| Futures Close+ | 53.6 / 28.5 / 10.9% | 51.0 / 26.7 / 10.3% |
| Futures Close− | 51.1 / 27.5 / 10.6% | 48.6 / 25.3 / 11.0% |
| Close− median → P75 gap ($), all years / 2025–26 | 8.82 / 23.60 | 8.74 / 23.57 |

- Calibration moves closer to 50 / 25 / 10 (the export's lines were hit slightly too often).
- The typical gap in dollars doesn't change. The better calc moves the lines **day to day** (wider on wild
  mornings, tighter on calm ones); it doesn't make them narrower on average.
- QLIKE gain by regime, futures: quiet days −11.8%, middle −8.6%, busy −6.2%. On the CFD: −11.0 / −6.1 / −4.3%.

## Answer

Two of the ideas make the gold calc clearly better on Jordan's lines, on both price feeds and in both halves:
1. reading the hour of trading before London opens;
2. adding gold's implied volatility (GVZ).

Together they give about −9% QLIKE. HARQ helps a little. QLIKE fitting, the session split and realized range don't.

**Graded weight:** strong for FRESH and FRESH+IV (pre-registered, every year, both feeds), with the caveat that the
gain is concentrated on the few wild Asian-open days. Moderate for HARCJ+IV.

**Next (per the prereg):**
- Shadow gold export with N7, beside the live one (no live change), plus a forward score.
- **Build note:** FRESH needs the forecast computed after 00:00 London (from the 23:00–24:00 hour), not at the NY
  close; GVZ must be read live (`_ivGvzLatest`, already on the server).
- The QLIKE export stays as it is until the forward score agrees and the owner says so.
