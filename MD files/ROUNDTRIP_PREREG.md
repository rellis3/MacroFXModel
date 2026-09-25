# R1 — When the driver round-trips, does the linked market follow it back?

**Pre-registered 2026-09-25, before the harness was written or run.**

## The claim

Nicholas Crown, on a headline that moved crude and was then found to be false:

> "The news story hits, crude moves three percent... The news is quickly determined as
> fake. **Crude moves back, stocks recover, but bonds never forget.**"

The claim is that when a driver spikes and fully retraces inside a session, some linked
markets retrace with it and others keep the move. If that is true it is directly useful
for reading a day: a linked move that does NOT come back was never about the driver.

## Why this one is worth testing

Unlike most of the transcript it is falsifiable, it needs no positioning data, and the
answer changes how a day is read rather than what is traded. It is also the first claim
tested here that is about the SHAPE of an intraday path rather than a daily change.

## Definitions, fixed in advance

- **Round trip** in the driver, on an M15 session: an excursion of at least `SPIKE_ATR`
  ATRs from the session open that later returns within `BACK_FRAC` of where the
  excursion began, both inside the same session.
- **Follow-back** in the linked market: of the move it made over the driver's excursion
  window, how much had been given back by the driver's return. Reported as a fraction:
  1.0 = it fully round-tripped too, 0 = it held every bit of the move.
- The pairs tested are this desk's own chain links, not new ones: oil→breakevens is not
  intraday-observable, so the FX and index legs are used —
  **oil → USDCAD**, **oil → SPX500**, **oil → NQ**, and the dollar leg **DXY proxy
  (EURUSD inverted) → GOLD**.

## Hypotheses, with the expectation stated first

| # | Question | Pre-registered expectation |
|---|---|---|
| H1 | Does the linked market give back **less** than the driver? | **Yes, mechanically** — the linked market moves less than 1:1 in the first place, so some asymmetry is arithmetic, not a finding. The test is whether it is bigger than the asymmetry a random window shows. |
| H2 | Do **bonds/rates legs** give back less than **equity legs** — "bonds never forget"? | **Unknown.** This is the actual claim and it is stated as unknown rather than guessed. |
| H3 | Is the follow-back different from a **matched control** — the same instruments over windows of the same length and size where the driver did NOT round-trip? | **This is the one that decides it.** Without the control, "the linked market kept 60% of its move" is a number with nothing to compare it to. |

## Method, fixed in advance

- **Data**: `/api/ohlc-range` M15, the same OANDA bars the rest of the desk uses.
- **Control**: for every round-trip window, a window of the same length and comparable
  driver excursion where the driver did NOT return. Paired, not pooled.
- **De-clustering**: one event per session per pair; two excursions in the same session
  are not independent observations of anything.
- **Uncertainty**: block bootstrap, blocks of 5, 1,000 resamples, 95% interval on the
  difference from control.
- **MIN_EVENTS = 20** round trips per pair. Below that the pair is **UNTESTABLE** and no
  verdict is issued for it. A near-empty sample produced a false "null" on this desk
  before and the floor exists because of it.
- **Both directions.** An up-spike that retraces and a down-spike that retraces are
  tested separately. If the effect appears on only one side it is an artefact of the
  period, not a mechanism.

## What each outcome means

- **H3 real and stable in both directions** → it earns an Evidence Book entry and a line
  in the chain read: when the driver round-trips and the link does not, say so.
- **Null** → the story is a story. "Bonds never forget" becomes a banked null and the
  chain read must not imply it.
- **Untestable** → say so, and do not loosen the gate to manufacture events.

The failure mode this guards against: watching one vivid day, believing the narration
that came with it, and building a reading habit on a single anecdote.

---

## RESULTS — run 2026-09-25

**First run was UNTESTABLE and said so.** 180 days gave 7-9 round trips per leg against
a floor of 20. The period was extended to 400 days at the SAME gate — more data, not a
looser definition, which is the distinction the method section draws.

400 days, M15, London-midnight sessions:

| Driver | Sessions | Excursions ≥1 ATR | Round-tripped |
|---|---|---|---|
| Crude | 283 | 116 | **35** |
| EUR/USD | 284 | 84 | **6** |

| Leg | Gave back after a round trip | After the driver HELD | Difference | Verdict |
|---|---|---|---|---|
| USD/CAD | 0.06 | −0.26 | +0.33 [−0.22, +0.88] | **NULL** |
| The S&P | 0.41 | −0.06 | +0.47 [−0.07, +1.01] | **NULL** |
| The Nasdaq | 0.06 | 0.19 | −0.13 [−0.90, +0.50] | **NULL** |
| Gold (euro leg) | — | — | — | **UNTESTABLE** (5 events) |
| Sterling (euro leg) | — | — | — | **UNTESTABLE** (6 events) |

**Verdict: NULL on every testable leg.** A linked market gives back no more, and no
less, of its move when the driver round-trips than when the driver holds.

### Three things that matter more than the headline

**The direction split is incoherent, which is what confirms the null.** The S&P gave
back 0.19 of an up-spike and 1.00 of a down-spike; USD/CAD −0.03 up and +0.33 down. The
pre-registration said an effect on one side only is a period artefact rather than a
mechanism — that is exactly the shape here, and it argues against the two positive point
estimates meaning anything.

**IT DOES NOT TEST BONDS, which is the actual claim** — and the stated reason was
WRONG. This section originally said "this repo has no intraday rates data". It does:
OANDA serves `USB02Y_USD`, `USB05Y_USD`, `USB10Y_USD`, `USB30Y_USD`, `DE10YB_EUR` and
`UK10YB_GBP` as CFDs, at M15, through `/api/ohlc-range` — the same route this study
already uses. Verified 2026-09-25: 266 M15 bars on the 10-year over four days. Nothing
in the repo was using them, and I concluded they were absent instead of checking.

So the bond leg is **not answered and IS answerable**. What was tested is the analogous
claim on the dollar and equity legs, which came back null. Calling that a refutation of
the bond claim would be the overreach the study was written to avoid; calling it
impossible was simply incorrect.

Note for whoever runs it: those series are bond PRICES, so they move INVERSELY to yield
— a falling CFD is a rising yield, and the sign has to be flipped before the result
means what it appears to.

**It is underpowered, and that is not the same as a confident null.** 26-30 events per
leg, just over the floor. The intervals span about ±0.55 of a move, so an effect smaller
than roughly half a move could not have been detected. The honest statement is: nothing
of a size worth trading showed up, on a sample that could only have found a large one.

### What follows

- No Evidence Book claim that linked markets DO follow a driver back, and none that they
  do not — the entry records a null at this power, with the bond leg untested.
- The chain read must not imply "it will come back" when a driver round-trips.
- Round trips are rarer than the anecdote suggests: **35 in 283 crude sessions**, about
  one session in eight, and only 6 in 284 for EUR/USD. A vivid example is not a
  frequent one.

Harness: `analysis/roundtrip_study.mjs [days]`. Output: `analysis/output/roundtrip.json`.
