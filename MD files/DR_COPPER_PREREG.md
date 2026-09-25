# C1 — Does Dr Copper actually have a PhD?

**Pre-registered 2026-09-25, before the harness was written or run.**

## The claim

> "Copper falls before GDP turns negative... **Every single time**, three months before
> GDP, you'll see copper fall. Copper is even better than the Fed... Dr Copper doesn't
> miss."

## The half of the question the claim does not ask

"Every single time" is a statement about **sensitivity**: of the quarters where GDP went
negative, how many had copper falling first. Taken alone it is almost worthless, because
a signal that fires before every recession *and* before thirty things that were not
recessions has no information in it. A thermometer that reads "fever" every day is right
about every fever.

The number that decides whether Dr Copper is a doctor is the **false alarm rate**: of
all the times copper fell hard, how often did a negative quarter actually follow. That
is what this tests, and it is pre-registered as the primary outcome precisely because it
is the one the claim omits.

## Definitions, fixed in advance

- **Copper**: FRED `PCOPPUSDM`, global price in USD/tonne, monthly, from 1990. Chosen
  over the OANDA CFD because it goes back far enough to contain more than one recession.
- **GDP**: FRED `A191RL1Q225SBEA`, US real GDP, percent change from preceding period,
  seasonally adjusted annual rate. "Turns negative" means this print is below zero.
- **The signal**: copper's 3-month percentage change through the END of the quarter
  BEFORE the one being predicted. That is a genuine lead — copper's price is known
  immediately, the GDP figure for that quarter prints about a month after it ends.
- **Primary threshold**: a 3-month fall of **15%**, the nearest round number to the
  17% quoted. 10% and 20% are reported as descriptive sensitivity checks and are NOT
  the pre-registered test — scanning thresholds until one works is how this kind of
  study manufactures a result.

## Outcomes, with the expectation stated first

| # | Question | Pre-registered expectation |
|---|---|---|
| C1a | **Sensitivity** — of negative-GDP quarters, how many were preceded by a 15% copper fall? | **Probably low.** "Every single time" is a strong claim and single-indicator recession calls usually are not. |
| C1b | **False alarm rate** — of 15% copper falls, how many were NOT followed by a negative quarter? | **Probably high, and this is the point.** If it is high the claim collapses whatever the sensitivity is. |
| C1c | **Lift over the base rate** — does P(negative quarter \| copper fell) beat P(negative quarter)? | **This is the only thing that would make it useful.** Stated as unknown. |

## What each outcome means

- **Lift large and the false alarm rate low** → a genuine lead indicator, an Evidence
  Book entry, and worth a line on the board.
- **Lift near zero, or the false alarm rate high** → "Dr Copper" is folklore. Copper
  stays on the board as a growth *description*, exactly as it is now, and the page must
  never imply it forecasts a recession.
- **Too few negative quarters to test** → UNTESTABLE. US recessions are rare and the
  sample is small by nature; if it cannot carry the test, say so rather than quoting a
  percentage of four events.

The failure mode this guards against: an indicator that is genuinely correlated with the
cycle being sold as one that *calls* the cycle, on the strength of two famous examples.

---

## RESULTS — run 2026-09-25

FRED copper 1992-2026 (415 months) against US real GDP 1990-2026. **136 usable quarters,
14 of them negative — a base rate of 10.3%.**

At the pre-registered 15% three-month fall:

| | |
|---|---|
| Times it fired | **5** in 136 quarters |
| Negative quarters caught | **2 of 14** — sensitivity **14%** |
| Warnings with no contraction | **3 of 5** — false alarm rate **60%** |
| P(negative \| copper fell) | 40% vs a 10% base rate — lift 3.89x |
| Contractions with **no warning at all** | **12 of 14** |

**Two different verdicts, and keeping them apart is the point.**

### "Every single time" is FALSIFIED

This needs no rate and no power calculation. A universal claim dies on one
counterexample and there are twelve: **12 of the 14 negative quarters since 1990 had no
15% copper fall in front of them.** The record on the two cycles the claim leans on:

| Quarter | GDP | Copper's prior 3 months | |
|---|---|---|---|
| 2008 Q1 | −1.7% | −13.6% | no warning at 15% |
| 2008 Q3 | −2.1% | −1.7% | no warning |
| 2008 Q4 | −8.5% | −15.9% | **warned** |
| 2020 Q1 | −5.2% | **+5.5%** | copper was RISING into it |
| 2020 Q2 | −28.0% | −14.7% | no warning at 15% |

One warning out of five. And the specific story told — *"copper peaked at 408 in July
2008... Lehman collapsed in September"* — has the order wrong: **US GDP was already
negative in Q1 2008**, two quarters before that peak. Copper topped after the
contraction had started, not three months before it.

### Whether copper has ANY useful lift is UNTESTABLE

5 signals against a pre-registered floor of 6. That is not a null — the question was not
answered, and the 3.89x lift on 5 events is not a number to carry anywhere.

The descriptive scan (NOT the pre-registered test) points the same way as the
falsification: at a 10% fall it fires 22 times with an **82% false alarm rate** and a
lift of 1.77x. Loosen it enough to get a sample and it stops discriminating; tighten it
to 20% and it fires once in thirty-four years.

### What follows

- Copper **stays on the board as a growth description**, which is what it already is.
  Nothing changes.
- The page must never imply copper forecasts a contraction, and the Evidence Book entry
  says the strong claim is falsified while the weak one is untestable.
- The general lesson is the one the pre-registration was written around: **"every single
  time" is a sensitivity claim, and sensitivity alone is nearly worthless.** The number
  that decides a lead indicator is how often it cries wolf, and that is the number these
  stories never quote.

### Separately — the current setup described is not the current market

The clip says copper "has fallen 17% from its January peak" and "dropped 6.7% last
week". Two independent sources disagree:

- OANDA XCU_USD: **+7.1% ABOVE** the January peak, and it made a fresh 2026 high on
  2026-09-22, two days before the check.
- FRED PCOPPUSDM: **+4.3%** on January and at **100% of its 12-month range**.

Copper is near a one-year high in a year-long uptrend (monthly average 5.87 in January
to 6.54 in September). Whatever market that description belongs to, it is not this one.

Harness: `analysis/dr_copper_study.mjs`. Output: `analysis/output/dr_copper.json`.
