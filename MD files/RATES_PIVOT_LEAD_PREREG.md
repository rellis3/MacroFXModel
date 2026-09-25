# P1 — Does a confirmed turn in short-term rates lead the Nasdaq?

**Pre-registered 2026-09-25, before the harness was written or run.**

## The claim

From a teaching video (COG, "Macro Variable Context Relevance"), walking through
2026-09-18 on a 15-minute Nasdaq chart against a macro series built from short-term
rates:

> "At four we could then see there was a key low price there... at quarter to five...
> at this point the low is yet to still be priced in. So this means that you could have
> been in a position to potentially have valuable information going into this."
>
> "At 2:15 that is already all priced in. Then we see a big move up on the NASDAQ that
> we could potentially **pre-position** for."

It is a forward-lag directional claim: the rates series turns, you wait long enough to
confirm the turn, and you are positioned in the Nasdaq before the Nasdaq moves.

**He does not assert it is true.** He calls it "only step one", a "potential
hypothesis", and says it needs characterising, in-sample/out-of-sample and a hold-out
"before a single pound is at risk". This is that step.

## Why the obvious test already run does NOT settle it

A full-sample return cross-correlation of the 2-year CFD against the Nasdaq over 7,533
aligned 15-minute bars gives **+0.233 in the same bar and nothing above 0.04 at any
lead or lag out to an hour either side**. That looks decisive and is not.

Pivots at reach 3 are **11% of bars**. A full-sample correlation averages over all of
them, so an effect that lives ONLY at turning points and is worth r ≈ 0.30 there would
appear as roughly 0.03 across the sample — inside the noise already measured. The
existing result therefore cannot distinguish "nothing" from "a substantial
pivot-conditional lead", and this study is the one that can.

## What is being tested

- **Driver**: `USB02Y_USD`, the US 2-year note CFD — short-term rates, confirmed as the
  family the video uses. It is a bond PRICE, so it moves inversely to yield, and it is
  POSITIVELY correlated with the Nasdaq (+0.233 same-bar): price up = yield down =
  supportive for long-duration equity.
- **A pivot** at bar *i* needs `REACH` bars either side. It is therefore **only knowable
  at bar i+REACH**, and every measurement starts there. This is the whole discipline of
  the video and the trap this desk has been bitten by twice (`swing_regime`, Vote Atlas).
- **The trade window**: the Nasdaq's return over H bars starting at the CONFIRMATION
  bar, never the pivot bar.
- **Signed**: a confirmed pivot LOW in the 2-year (yields peaking) expects the Nasdaq
  UP; a confirmed pivot HIGH expects it DOWN. Both are tested separately as well as
  pooled.

## Hypotheses, expectation first

| # | Question | Pre-registered expectation |
|---|---|---|
| P1a | Does the signed Nasdaq return after a confirmed rates pivot beat a matched control? | **Null.** This desk has already banked yield→asset forward coupling as real but SAME-BAR ONLY, at daily frequency, and reproduced it at 15 minutes. |
| P1b | Is the hit rate above the base rate of an up-move? | **Null**, same reason. |
| P1c | Does it hold in BOTH directions and BOTH halves of the sample? | **This is the gate.** A result on one side or in one half is a period artefact, and is written down as such in advance. |

Stating the expectation as null in advance is the point: if it comes back real, that is
a result found against a prior, not a story fitted to a chart.

## Method, fixed in advance

- **Data**: `/api/ohlc-range` M15 — the same OANDA bars the rest of the desk uses.
- **REACH = 3** (45 minutes), matching the video's 16:00 low confirmed at 16:45.
- **Horizons**: H = 4, 8 and 16 bars (1h, 2h, 4h) from the confirmation bar.
- **Control**: every bar that is NOT within H bars of a confirmation, over the same
  period, same instrument. Pooled base rate, so "the Nasdaq usually drifts up" cannot be
  read as an edge.
- **De-clustering**: confirmations closer together than H bars are not independent
  observations; the first of each cluster is kept.
- **Uncertainty**: block bootstrap, blocks of 5, 1,000 resamples, 95% interval on the
  difference from control.
- **Split**: first half vs second half reported separately, both directions separately.
- **MIN_EVENTS = 30** per cell. Below that the cell is **UNTESTABLE** and gets no
  verdict.
- **Size reported in ATR**, so the result can be judged against cost rather than
  admired as a correlation. This desk's own gate is that spread/ATR above 0.15 is dead.

## What it does NOT test

The video's series may be a *composite* — a spread, a residual, a principal component —
not the raw 2-year. This tests the raw short-rate instrument, which is the closest
honest proxy available here. A null on the raw series does not rule out a constructed
one, and the write-up must say so rather than claiming more than was measured.

---

## RESULTS — run 2026-09-25

360 days of M15. 22,012 aligned bars, **2,430 confirmed pivots** in the 2-year (1,179
lows, 1,251 highs), de-clustered to 2,010 / 1,440 / 943 events at the three horizons.

**Verdict: NULL. 0 of 15 cells came back real.**

| Horizon | Signed Nasdaq return | Control | Difference | Hit | Base |
|---|---|---|---|---|---|
| 60m | +0.003% | +0.008% | −0.005 [−0.021, +0.012] | 50.1% | 54.1% |
| 120m | −0.002% | +0.016% | −0.018 [−0.049, +0.010] | 50.2% | 54.1% |
| 240m | +0.008% | −0.021% | +0.029 [−0.034, +0.093] | 49.7% | 51.0% |

Every direction split, every half split, every horizon: interval across zero.

### The single most instructive number in the table

At 60 minutes, a confirmed rates LOW is followed by an up-move **54.1%** of the time.
The base rate is **54.1%**. Identical to the decimal.

Quoted alone, "this setup is right 54% of the time" reads like an edge. It is precisely
nothing — the Nasdaq simply drifts up, and the control is the only thing that reveals
it. Every version of this claim that does not carry a base rate is making that mistake,
whether or not anyone notices.

### This is a WELL-POWERED null, unlike R1

The confidence interval at 60 minutes is about ±0.016% on the Nasdaq, which is roughly
**±0.12 ATR**. This desk's own execution gate declares spread/ATR above 0.15 dead. So
the test could have detected anything large enough to survive its own costs — and did
not. That is a different and much stronger statement than R1's "underpowered, nothing
big showed up".

### Where the claim now stands

Three independent angles, same answer:

1. **Daily** — yield/asset forward coupling, banked null (2026-08-23): real but same-bar.
2. **15-minute returns** — +0.233 same-bar, ≤0.04 at every lead/lag to an hour.
3. **15-minute pivots** — this study, 2,430 confirmed turns, null on every cell.

The pivot-conditional escape hatch was a real one: pivots are 11% of bars, so angle 2
genuinely could not see an effect that lived only at turning points. It has now been
looked at directly and there is nothing there either.

### What this does NOT close

The video's series may be a **composite** — a spread, a residual, a principal component
— not the raw 2-year. This tested the raw short-rate instrument, which is the closest
honest proxy available here. A constructed variable could still carry something the raw
one does not, and nothing here rules that out. What is closed is the plain-language
version: *a confirmed turn in short-term rates does not tell you where the Nasdaq goes
next.*

Worth saying plainly: the author of the claim never asserted otherwise. He called it
"only step one" and said it needed exactly this before a pound was risked. This is the
step, and the answer is no.

Harness: `analysis/rates_pivot_lead_study.mjs [days]`.
Output: `analysis/output/rates_pivot_lead.json`.
