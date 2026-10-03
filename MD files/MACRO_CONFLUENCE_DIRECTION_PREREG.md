# MACRO-CONFLUENCE-DIRECTION — Does agreement across independent macro domains (liquidity momentum, yield-curve regime, credit stress) predict forward FX/index direction better than any single domain alone?

**Pre-registered 2026-10-03, before the harness was written or run.**

> Commit this file BEFORE writing the harness. `study.mjs bank` checks git and refuses a
> result whose pre-registration was committed afterwards.

## The claim

The desk's own re-ask of a question this repo has tested many times in single-domain
form, in the one form it has NOT tried: *when several independent macro domains agree on
direction AT THE SAME TIME, does that agreement — confluence — carry forward directional
information that none of the domains carries alone?* This is the mechanism COG's
"Surface Explorer" tool (multi-field: curve / liquidity / credit / positioning / rates,
one consistent regime-reading lens per field, shown 2026-10-02 to his VIP channel) and
the owner's own stated belief ("macro education and analysis will help us understand
direction better than anything") both point at: not any one macro series, but several
pointing the same way at once.

## Why it is not already settled

Every related test in this repo so far tested ONE domain's lead in isolation:

- [[project_yield_asset_coupling]] (2026-08-23): UST yield level, 1-day lag, forward
  FX/index returns — null (real same-bar, median |IC| 0.17 → 0.015 forward).
- `curve-inversion` (2026-10-01, NULL): T10Y2Y inversion episodes → forward Nasdaq —
  killed by the steepening mirror (steepening did worse, not better).
- `funding-stress` (2026-10-02, NULL): SOFR-over-floor / SRF draws → forward
  direction — null on all three instruments tested.
- `rates-pivot-lead` (2026-09-25, NULL): COG's own claim that a confirmed short-rate
  turn leads the Nasdaq, pivot-conditional — null even controlling for the
  full-sample-correlation blind spot that motivated re-testing it.
- `spread-divergence-range` (2026-09-27, gate nominally REAL but overridden): DE-US
  10y spread divergence → wider EUR/USD range — the mirror (a big move in EITHER leg)
  is at least as large, so the claim as framed is not supported.
- [[project_growth_vs_yields_verdict]] (2026-09-17): yields real but a *passenger*,
  not the driver, of the NQ-down-week → wider-range effect.

None of these asked whether domains agreeing WITH EACH OTHER adds anything beyond what
each shows alone. It is a real possibility that confluence is just several passengers
riding the same cyclical wave — which is exactly what this design is built to catch via
the mirror gate below, not to wave through.

## Definitions, fixed in advance

- **Domains** (three, chosen because each is already built in this codebase with a
  defined, pre-existing scoring convention — no new scoring logic invented for this
  study):
  1. **Liquidity** — Fed net liquidity (WALCL−TGA−RRP), `js/liquidityGateEngine.js`'s
     own `fedNetLiquidityLeg` z-score of the latest weekly change vs its trailing
     24-period baseline. Direction = sign(z); |z| < 0.3 counts as flat/no-direction.
  2. **Curve regime** — T10Y2Y, 20-trading-day change. Direction = sign of the change
     (steepening = +1, flattening/inverting further = −1); below 2bp counts as flat.
  3. **Credit stress** — BAMLH0A0HYM2 (HY OAS), 20-trading-day change, sign-inverted
     (OAS falling = risk-on = +1, widening = risk-off = −1); below 5bp counts as flat.
- **The setup — confluence**: a trading day where all three domains are non-flat AND
  all agree in sign (+1,+1,+1 or −1,−1,−1). Scored separately by sign so the mirror
  check in the gate is a real, independent test, not a relabeling of one result.
- **Knowable when?**: FRED weekly/daily series carry their normal publication lag
  (WALCL/TGA/RRP ~1-3 days after the reference date, HY OAS/T10Y2Y ~1 day) — every
  input dated to what was ACTUALLY published by the close of the setup day, same
  discipline as `funding-stress`'s D+1 rule. No same-day values used.
- **The outcome**: forward close-to-close return on EUR/USD, SPX500 and GOLD, at
  H = 5 and 20 trading days from the setup (the harness template's own horizons).
- **The control**: every day NOT within max(H) of a confluence day, same instruments,
  same span — the harness's built-in exclusion, not hand-rolled.
- **De-clustering**: confluence days cluster (the underlying series move slowly) — only
  the FIRST day of a confluence episode counts, with a 10-trading-day gap before a new
  episode can start (matches `funding-stress`'s de-clustering).
- **MIN_EVENTS**: 30 per cell. Below it the cell is UNTESTABLE, which is NOT a null —
  three domains agreeing simultaneously may simply be rare.

## Hypotheses, expectation first

| # | Question | Pre-registered expectation |
|---|---|---|
| a | Does +1,+1,+1 confluence predict a positive forward return (H=5, H=20) on EUR/USD, SPX500, GOLD, beyond the control? | **Null.** Given how dense the single-domain null record already is in exactly this space, my prior is that combining already-null legs does not manufacture an edge — confluence most likely just marks "a volatile macro regime," not a directional one. |
| b | Does −1,−1,−1 confluence predict the mirrored (negative) forward return? | **Null, for the same reason** — and if (a) is non-null while this is flat or same-signed, that is the volatility-mirror trap, not a real result. |
| c | **THE GATE.** What must hold for this to count as real. | **All three.** (1) Both halves — split the sample at its midpoint, the sign of the effect must agree in both. (2) **The mirror**: (a) and (b) must point in OPPOSITE directions with comparable magnitude — if +1,+1,+1 and −1,−1,−1 both show the same-signed (or similarly-sized same-direction) forward effect, confluence is tracking volatility/big-macro-moves generically, not direction, and the claim is not supported regardless of what the raw interval says. (3) The bootstrap 95% CI (block bootstrap, block=5, 1000 reps, already wired in the harness) must exclude zero. |

**My overall prior:** null on both signs, and if anything comes back nominally "real" I
expect the mirror check in (c)(2) to be the thing that kills it — same pattern as
`curve-inversion` and `spread-divergence-range`.

## What this does NOT test

- **Positioning/COT** as a fourth domain — left out of this pass because it needs a
  different data source (CFTC, not FRED) than the other three; a documented extension,
  not run here. A result from three domains cannot be read as "full confluence."
- **ECB/BoJ legs** of liquidity, or any non-US curve/credit — Fed/US-only, matching
  `liquidityGateEngine.js`'s existing US-netting convention.
- **Causation** — confluence and the forward move could share a common unobserved cause
  (e.g. a Fed pivot driving all three domains AND the forward return simultaneously).
- **Intraday timing or entry mechanics** — daily resolution, 5/20-day horizons only;
  this is a research gate on whether the mechanism exists at all, not a tradeable rule.
- **Any claim about WHY three domains agreeing would matter mechanically** — this tests
  whether the pattern is there, not a causal story for it.
