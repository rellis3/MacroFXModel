# NQ forecast lines on CME futures vs the CFD (exploratory)

Register row `nq-futures-line-race`. Owner question 2026-10-30: does the owner's NQ futures 1-minute file show anything the
CFD doesn't at the production forecast lines? Not frozen M7 and not M8: an exploratory re-run of the M7 reference race on a
second price source. Script `scripts/day-reconstruction/futures_check.py`; numbers in `results.json` (per-touch file
`touches.parquet` is regenerable and not committed).

**Setup.** NQ, London 00:00-22:00 windows from the archive, 2,487 dates both sources priced (2016-03-29 to 2026-04-21;
futures file ends there, so the lockbox is untouched). Each source rebuilds the lines from its own open and the archive's
rung widths; placebo = B2-weighted x0.70/0.85/1.15/1.30 ladders. Race and payoffs as M7 (N next rung / P previous
reference, frozen at the touch bar; unresolved valued at the last close; ties excluded, there were none). Costs round trip:
futures 0.725 pt (1 tick a side + $4.50), CFD 0.0068% of price. Paired date Poisson bootstrap, B = 1000, seed 20261030.
Sanity: the CFD fixed p50 fade (-0.022R) matches M7's frozen result (-0.022R) to three decimals.

## Result: the futures data says the same thing as the CFD

Point-in-time era (2020-08-21 on), forecast lines, net R per touch [95%]; delta = forecast minus placebo.

| cell | source | n | next / prev / neither first | fade net | cont net | fade delta |
|---|---|---|---|---|---|---|
| Fixed p50 | futures | 1,461 | 44.7 / 35.0 / 20.3% | -0.033 [-0.085, +0.019] | +0.003 [-0.040, +0.047] | -0.023 [-0.054, +0.008] |
| Fixed p50 | CFD | 1,462 | 44.9 / 34.9 / 20.2% | -0.036 [-0.089, +0.017] | -0.002 [-0.045, +0.042] | -0.016 [-0.050, +0.020] |
| Fixed p75 | futures | 746 | 34.0 / 39.9 / 26.0% | -0.059 [-0.118, -0.001] | +0.039 [-0.033, +0.112] | +0.038 [-0.001, +0.074] |
| Fixed p75 | CFD | 752 | 34.2 / 39.8 / 26.1% | -0.061 [-0.118, -0.006] | +0.028 [-0.036, +0.099] | +0.045 [+0.007, +0.082] |
| Projected p50 | futures | 828 | 38.0 / 22.7 / 39.3% | -0.011 [-0.091, +0.066] | -0.021 [-0.071, +0.039] | +0.034 [-0.013, +0.080] |
| Projected p50 | CFD | 828 | 37.8 / 22.6 / 39.6% | -0.015 [-0.094, +0.054] | -0.045 [-0.094, +0.009] | +0.028 [-0.019, +0.076] |
| Projected p75 | futures | 394 | 30.2 / 32.5 / 37.3% | -0.090 [-0.162, -0.021] | +0.138 [+0.031, +0.252] | -0.021 [-0.095, +0.057] |
| Projected p75 | CFD | 389 | 29.8 / 32.1 / 38.0% | -0.089 [-0.162, -0.014] | +0.118 [+0.016, +0.238] | -0.040 [-0.103, +0.016] |

- Path shares agree within 0.7pp in every cell, and every EV within 0.03R. Futures cost is lower, but at these risk
  distances cost is about 0.01R either way, so it changes nothing.
- No fade cell is positive, at forecast or placebo lines.
- Projected p75 continuation is positive on both sources (+0.12 to +0.14R) but not forecast-specific (continuation delta
  +0.10 [-0.00, +0.21] futures). This is the same cell frozen M7 classed Underpowered (+0.09R [-0.00, +0.18]); M7's R7 hard
  stop forbids chasing it, and this exploratory look does not change that.

## Descriptive: session-VWAP extension at the touch (real futures volume)

Fade net R split by how far the touch-bar close sits beyond session VWAP (fixed sigma buckets, no sample quantiles; buckets
shown only with >= 50 forecast touches). "Turn" = the touch bar ended within 0.1 sigma of the session's final extreme on
that side.

- No bucket lifts the fade: fixed p50 at 0.5-1.0 sigma beyond VWAP is -0.001R futures, -0.006R CFD; fixed p75 beyond
  1.0 sigma is -0.19R futures, -0.17R CFD (n 75 / 107).
- "Turn" shares are 12-21% and equal to placebo in every bucket (deltas -0.07 to +0.01).
- Real futures volume and CFD tick volume put touches in different buckets (counts differ by up to ~100), but the
  conclusions don't change.

So the VWAP-extension tilt found at confirmed swing pivots (vmcResearch, Aug 2026) does not show up at the moment of a line
touch. That study conditioned on a confirmed pivot (known only after the swing), this one on the touch itself.

**Verdict: context.** The futures file does not reveal anything the CFD hides. Price at these lines behaves the same on
both.
