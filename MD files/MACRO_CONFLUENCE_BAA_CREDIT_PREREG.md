# MACRO-CONFLUENCE-BAA-CREDIT — Does agreement across independent macro domains (liquidity momentum, yield-curve regime, credit stress) predict forward FX/index direction better than any single domain alone?

**Pre-registered 2026-10-03, before the harness was written or run.**

> Commit this file BEFORE writing the harness. `study.mjs bank` checks git and refuses a
> result whose pre-registration was committed afterwards.

## The claim

**Identical claim to `macro-confluence-direction`** (banked `context`/UNTESTABLE,
2026-10-03) — the owner's own framing, unchanged: does macro confluence across
liquidity, curve and credit help read forward direction, the thing COG's "Surface
Explorer" and the owner's own belief ("macro education and analysis will help us
understand direction better than anything") both point at. This is **not** a new
question and the definitions below are unchanged except for one thing.

## Why it is not already settled

`macro-confluence-direction` ran this exact design end to end and came back
UNTESTABLE — not null, not real, UNANSWERED — because `BAMLH0A0HYM2` (HY OAS), the
credit leg, only has FRED history from 2023-10-03 (confirmed directly against
`fredgraph.csv`, independent of the `cosd` param; matches the pre-existing "credit
stack has only ~3yr FRED history" trap in `js/dataCatalogue.js`). That bounded all
three domains to a 757-day window and only 17 confluence episodes total, against a
30-per-cell floor. The question was never reached.

**The one change**: the credit leg becomes `BAA10Y` minus `AAA10Y` (Moody's seasoned
corporate bond yields, both FRED series from 1986) instead of `BAMLH0A0HYM2`. This is
investment-grade credit-curve SHAPE rather than junk-bond spread LEVEL — a different
instrument already used elsewhere on this desk (`js/creditStressCore.js`'s `buildCsi`,
referenced in `today.html`'s credit-quality panel) for exactly this reason: it has the
history HY OAS does not. Everything else — domains, instruments, horizons, the gate —
is carried over unchanged from `macro-confluence-direction`'s own prereg.

## Definitions, fixed in advance

- **Domains**:
  1. **Liquidity** — unchanged: Fed net liquidity (WALCL−TGA−RRP), rolling causal
     z-score of the latest weekly change vs its trailing 24-period baseline. Direction
     = sign(z); |z| < 0.3 = flat.
  2. **Curve regime** — unchanged: T10Y2Y, 20-trading-day change, sign; < 2bp = flat.
  3. **Credit stress** — **changed**: `BAA10Y − AAA10Y` (the investment-grade credit
     curve), 20-trading-day change, sign-inverted (spread narrowing = risk-on = +1,
     widening = risk-off = −1); < 5bp = flat — same floor as the original study, kept
     unchanged rather than tuned, since both are 20-day changes in a percentage-point
     spread and there is no principled reason to pick a different number now that the
     result is unknown.
- **The setup — confluence**: unchanged — a day where all three domains are non-flat
  and agree in sign (all +1 or all −1).
- **Knowable when?**: unchanged — 1-day FRED publication lag applied to every series
  before the as-of join, no same-day values used.
- **The outcome**: unchanged — forward close-to-close return on EUR/USD, SPX500, GOLD
  at H = 5 and 20 trading days.
- **The control**: unchanged — every day not within max(H) of a confluence day, same
  instruments, restricted to the span where all three domains are computable.
- **De-clustering**: unchanged — first day of an episode, 10-trading-day gap.
- **MIN_EVENTS**: unchanged — 30 per cell. If BAA10Y−AAA10Y still does not clear the
  floor (unlikely given ~40 years of history vs HY OAS's 3), that is UNTESTABLE again,
  honestly, not forced into a verdict.

## Hypotheses, expectation first

| # | Question | Pre-registered expectation |
|---|---|---|
| a | Does +1,+1,+1 confluence predict a positive forward return (H=5, H=20) on EUR/USD, SPX500, GOLD, beyond the control? | **Null — same prior as the original study, unchanged.** Swapping the credit proxy fixes a power problem, not the reason to expect an effect; the dense prior record of single-domain nulls in this exact space still applies in full. |
| b | Does −1,−1,−1 confluence predict the mirrored (negative) forward return? | **Null, for the same reason.** |
| c | **THE GATE.** What must hold for this to count as real. | **All three, unchanged from the original.** (1) Both halves agree in sign (positive confluence and negative confluence scored separately). (2) **The mirror**: positive- and negative-confluence effects must point in OPPOSITE directions — same-signed or similarly-sized same-direction effects mean confluence is tracking generic macro volatility, not direction, regardless of what the raw interval says. (3) The block-bootstrap 95% CI (block=5, 1000 reps) excludes zero. |

**My overall prior, unchanged:** null on both signs, mirror most likely the thing that
kills any nominal "real" cell if one appears.

## What this does NOT test

Unchanged from `macro-confluence-direction`: no positioning/COT domain, no ECB/BoJ
liquidity legs, no causal claim, no intraday timing, no tradeable-rule claim. One
addition: this does **not** retroactively validate or invalidate the HY-OAS version —
that study's UNTESTABLE verdict stands on its own record; this is a separate, declared
amendment, not a replacement of it.
