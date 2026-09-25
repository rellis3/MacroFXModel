# Pre-registration — does G1's net-liquidity tide predict NQ direction?

**Written 2026-09-25, before any outcome was computed.** Committed before the run.

## Why

G1 is the **last untested gate** of the COG shadow, and the only one COG actually
*stated* he uses ("repo, reverse repo, central-bank balance sheets… nothing to do with
NAS price"). G2 and G3's options mapping was our inference; G3 is now falsified
(48.8% OOS, 615 days) and G2 is a range layer with no directional content and no
generalisation beyond NQ.

The shadow's rule is `G1.bias === G3.direction`. With G3 dead, **G1 is the whole
direction**. If it is also null, the shadow has no validated directional layer at all
and that decision can finally be made on evidence.

This also touches two questions the backtest index has left open: **Q6** (the macro
equity composite, never re-run after the WALCL millions/billions fix) and **Q8** (the
NASDAQ liquidity family, no committed OOS verdict). It does not answer them — it tests
one specific signal — but a null here lowers the prior on both.

## The signal, reconstructed exactly as `computeG1` computes it

```
net_liquidity = WALCL − TGA − RRP                (as-of aligned, daily)
TIDE          = % change in net_liquidity over 20 business days (rocWeeks 4 × 5)
bias          = LONG if TIDE > 0, SHORT if TIDE < 0
credit veto   = HY OAS widened > 25bp over 4 weeks → state INVALID, bias cleared
```

`FLOW` (the change between the last two points vs a 10bn × span threshold) is computed
and emitted by the live engine but **never used in the call**. It is tested separately
as a secondary, clearly labelled.

## Publication lags — the thing that would otherwise void this

The live engine reads whatever FRED returns *now*, which is by definition available.
A backtest aligning on observation dates would use numbers nobody had yet. Lags
applied, as "usable at t only if released ≤ t":

| Series | Source | Lag applied |
|---|---|---|
| `WALCL` | FRED (H.4.1, Wed reference, Thu release) | **8 calendar days** |
| TGA | Treasury DTS daily (`close_today_bal`, falling back to `open_today_bal`) | **2 calendar days** |
| `RRPONTSYD` | FRED, daily | **1 day** |
| `BAMLH0A0HYM2` | FRED, daily | **1 day** |

Two known data traps, both already documented in `server.js` and handled here:
`RRPONTSYD` ships in **billions** while WALCL/TGA ship in millions (the bug that once
reported $5,917bn with RRP contributing nothing), and the DTS puts the closing figure
in `open_today_bal` on rows labelled "Closing Balance", with the account renamed from
"Federal Reserve Account" to "Treasury General Account (TGA) Closing Balance" around
2022.

## Targets

NQ (`nas100_usd_d1`, 2016-01 → 2026-09) forward returns at **1, 5 and 20 trading days**.

- **1d is the operationally relevant horizon** — the shadow emits a call the same day.
- 5d and 20d are the mechanism-relevant horizons; the liquidity claim in the
  literature is a medium-term drift, not a daily signal.

## The power problem, stated before running

A 20-business-day change in a slow series has a sign that persists for **months**.
2,500 trading days is therefore nowhere near 2,500 observations. The honest sample
size is the number of **independent bias episodes** (runs of constant sign), and it is
reported as the headline n.

- Significance by **stationary block bootstrap, mean block 60 days** — long enough to
  carry a whole regime episode.
- Overlapping 5d/20d returns are handled by the same block scheme.

## Verdict rule

- **SUPPORTED** — OOS hit rate ≥ **55%** at any horizon with block-bootstrap p < 0.05,
  **and** ≥ 20 independent bias episodes.
- **NULL** — hit rates within **48–52%** at all three horizons, with ≥ 20 episodes.
- **INCONCLUSIVE** — fewer than 20 episodes at every horizon (underpowered — and this
  is the likeliest failure mode, not a licence to re-cut), or anything else.

Chronological **60/40 IS/OOS split**, opened once.

## Secondary readouts, reported but not part of the verdict

1. **FLOW** bias — emitted live, unused in the call.
2. **Does the credit veto help?** Hit rate with and without it.
3. **Continuous IC** of the TIDE percentage against forward returns, not just the sign.

## Prior, stated before running

**I expect NULL or INCONCLUSIVE.** Reasons already in this book: entry-lens macro
direction is null and mildly anti-predictive; yields→assets forward coupling is null
(real same-bar only); the FX trend basket is null; and the pattern across ~60 evidence
entries is that range claims survive here and direction claims do not.

Against that: net liquidity → risk assets is a *medium-term drift* claim with a real
mechanism, and the 20d horizon is where it would live if anywhere. A positive result
at 20d and null at 1d would be the most interesting outcome, and would say the shadow
is reading a real signal **at the wrong frequency** — it emits a daily call from a
signal that only works monthly.

## What each outcome changes

| Outcome | Consequence |
|---|---|
| NULL at all horizons | The shadow has **no validated directional layer**. Retire it from "replication" to a logging instrument, or close it. |
| Positive at 20d only | The signal is real but the **daily emission is wrong**. Re-spec G1 as a slow regime, not a daily bias. |
| Positive at 1d | Genuinely surprising. Re-test before believing, then cost it. |
| INCONCLUSIVE | Say so. Do not build on an underpowered gate either way. |
