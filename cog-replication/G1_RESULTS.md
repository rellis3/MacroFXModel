# G1 — does the net-liquidity tide predict NQ direction? Results (2026-09-25)

Pre-registration: [`G1_PREREG.md`](G1_PREREG.md), committed in `ecf4519` **before** the
run. Script: `test_g1_direction.py`. Raw output: `g1_results.json`.

## Verdict: **NULL**

3,285 trading days, 2016-01 → 2026-08. IS 2016-01 → 2022-05, OOS 2022-06 → 2026-08.
**448 independent bias episodes** — the power worry in the prereg did not materialise,
because daily TGA/RRP movement flips the 20-day sign roughly weekly.

| Horizon | IS hit | OOS hit | OOS p | IS IC | **OOS IC** |
|---|---|---|---|---|---|
| 1d | 51.7% | **51.9%** | 0.085 | +0.059 | +0.007 |
| 5d | 52.8% | **49.5%** | 0.843 | +0.123 | **−0.021** |
| 20d | 53.6% | **51.5%** | 0.593 | +0.194 | **−0.026** |

All three OOS hit rates sit inside the pre-registered null band (48–52%). The
information coefficient **collapses from +0.194 in sample to −0.026 out of sample** at
the 20-day horizon — it does not merely weaken, it changes sign.

## The signal never justifies a short

Mean forward return by bias, out of sample:

| Horizon | after LONG bias | after SHORT bias | spread |
|---|---|---|---|
| 1d | +0.133% | +0.019% | +0.114pp |
| 5d | +0.373% | +0.341% | +0.032pp |
| 20d | +1.582% | **+1.434%** | +0.148pp |

**Both buckets are positive at every horizon.** NQ rose over this decade, so a SHORT
bias still preceded +1.43% over 20 days. Acting on G1's short signal would have meant
shorting a rising market on a coin flip. The long-minus-short spread — the only
quantity that carries information — is 0.03 to 0.15pp and not monotone in horizon.

## Why in-sample looked better, and why that is the whole story

IS spans **2016 → May 2022**, which contains the 2020 QE expansion: net liquidity and
the Nasdaq both went near-vertically up together. That is a co-movement in *levels*
during one episode, not a predictive relationship — Garin's "correlation as mechanism"
and "levels over changes" failure modes in one period. OOS spans **June 2022 → 2026**,
the QT era, and the relationship is gone.

The IS 20d IC of +0.194 is what a chart of net liquidity against the Nasdaq looks like
if you only ever look at 2020. It is the most seductive number in this file and it is
worth nothing.

## Secondary readouts

**The credit veto does not help.** With it applied, OOS hit rates are 51.4 / 50.2 /
52.5% — inside the null band, no better than without. The gate's one "risk-off"
mechanism adds nothing.

**FLOW is an in-sample trap.** The reading the live engine computes and emits but
never uses in the call: IS 20d hit **54.2%, p = 0.001** — the only significant number
anywhere in this test — collapsing to **50.5%, p = 0.640** out of sample, with OOS IC
−0.071. Anyone who had looked only at the in-sample figure would have promoted it.

## Method notes

- **Publication lags applied throughout**, which is what makes this a valid backtest:
  WALCL 8 days, TGA 2, RRP 1, HY OAS 1. The live engine reads FRED "now" and is
  therefore fine; a backtest aligned on observation dates would have used numbers
  nobody had.
- The two documented data traps were handled: `RRPONTSYD` in **billions** against
  WALCL/TGA in millions, and the DTS putting its closing figure in `open_today_bal`
  on rows labelled "Closing Balance" (account renamed from "Federal Reserve Account"
  around 2022).
- Significance by stationary block bootstrap, mean block 60 days, so a whole bias
  episode resamples together.
- 40 rows of 3,325 dropped (warm-up), counted not discarded.

## What this settles

**All three gates of the COG shadow are now tested.**

| Gate | Verdict |
|---|---|
| G1 — net-liquidity tide | **NULL** (this file) |
| G2 — GEX → range | Real on NQ, **no directional content**, does not generalise to FX |
| G3 — wall magnet | **NULL** (48.8% OOS, 615 days) |

The shadow's rule is `G1.bias === G3.direction`. Both inputs are now measured nulls,
and G2 — the one layer carrying real information — cannot move the decision and says
nothing about direction anyway.

**The shadow has no validated directional layer.** It should stop being described as
a replication and, if it is kept at all, kept only as an instrument that logs what COG
does beside what the gates said — which is a record-keeping task, not a signal.

That decision is the owner's. What this file removes is the excuse that it was
untested.

## Prior check

NULL or INCONCLUSIVE was pre-registered as expected, with "positive at 20d, null at
1d" named as the most interesting possible outcome. It did not happen: 20d is the
horizon where the relationship most clearly *reverses* out of sample. The prior held.
