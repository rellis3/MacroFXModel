# VWAP Fixed-Sigma Atlas — owner's own indicator, ported and tested (2026-08-26)

A faithful port of the owner's own Pine Script indicator ("VWAP Fixed Sigma
+ MFE MAE" — owner-authored, not reverse-engineered from a screenshot) as a
reference-book engine per `MD files/REFERENCE_ENGINE_PLAYBOOK.md`, crossed
against a confluence dimension the Pine doesn't compute: **multi-timeframe
VuManChu divergence agreement** at the touch, the owner's own stated
hypothesis ("if sessions are X volatility and price extends to Y VWAP sigma
band, and VuManChu on multiple timeframes are indicating divergences
forming... we enter as historically we've seen that setup be successful").

This is **not** a signal search — no after-cost gate, no P&L, no
entry/exit decision. It reports MFE/MAE-in-σ distributions honestly,
exactly as the source indicator itself measures them.

**Engine**: [`js/vwapFixedSigmaAtlasEngine.js`](../../js/vwapFixedSigmaAtlasEngine.js)
(full mechanism + ported-vs-added split documented in the file header),
tested in [`js/vwapFixedSigmaAtlasEngine.test.mjs`](../../js/vwapFixedSigmaAtlasEngine.test.mjs)
(4 asserts: end-to-end shape, perturb-the-future causality, fixedSigma
genuinely fixed within a session, hand-verified MFE/MAE arithmetic).

## The mechanism (ported 1:1 from the owner's Pine, not reinvented)

- Session VWAP resets at UTC midnight (`computeSessionVwap`, reused).
- Each session's own RMS distance from its VWAP (`sqrt(mean((price−vwap)²))`)
  becomes one historical data point. `fixedSigma` for the NEXT session =
  the **mean** of the trailing 20 sessions (median is off in the owner's
  own config — ported that way, not defaulted).
- `fixedSigma` is **locked for the whole session** — today's own developing
  volatility never widens today's bands. This is the key mechanism
  difference from `js/vwapReversionEngine.js`'s already-tested-null ±2σ
  band, whose σ grows continuously *within* the same day.
- Bands = session VWAP ± fixedSigma × {2, 2.5, 3}σ (the only levels the
  Pine actually tracks MFE/MAE on). A "fresh touch" needs the level to have
  contained price one bar ago and be breached by the current bar's wick —
  ported exactly, including the off-by-one repaint-avoidance the Pine uses.
- Direction is fixed by which band: upper touch = hypothetical SHORT,
  lower = hypothetical LONG — always a fade, never the other way.
- MFE/MAE run for a fixed 20-bar window after the touch (the owner's own
  default), in price and normalised by `fixedSigma` at the time of touch.
  One active event per (side, level) slot — **can re-arm multiple times
  per day**, unlike the sibling engine's first-crossing-only design.

## Added here (the owner's actual ask, not in the Pine)

Context dimensions crossed against the same MFE/MAE outcome: session, day
of week, HTF trend/ADX, day type, `fixedSigma`'s own percentile vs its
trailing history, and **`divAgree`** — how many of {1m, 15m, 1h, 4h}
WaveTrends show a real regular divergence supporting a reversal at the
touch bar, via `js/divergenceCore.js`'s `reversalDecision` (already-built
brick, reused verbatim — its own `side` convention maps directly onto the
Pine's upper=short/lower=long fade direction).

## Data

Gold only so far (real OANDA M1, 2016–2026, ~10.4 years) — a first pass
before committing to the full instrument set, given this construction
produces far more events per instrument than the sibling engines (re-arm
is allowed within a day). 60/40 IS/OOS split, same convention throughout
this repo. Holding gate: n≥30 both halves, same sign both halves,
|Δnet-σ|≥0.10 both halves.

## Result — a real null, on the actual hypothesis tested

**22,897 fade events** across the 6 (side × level) cells. Every cell's
MFE-in-σ and MAE-in-σ sit close to balanced (~0.47–0.6σ each), net-σ
consistently slightly **negative** (−0.03 to −0.07), and "MFE reached
before MAE" (a rough proxy for "would a 1:1 target beat a 1σ stop") sits at
**48–52%** — a coin flip, tilted marginally against the fade. This is the
same shape as `MD files/VWAP_REVERSION_FINDINGS.md`'s already-tested-null
σ-band fade (`band_fade`, 0/26 pairs OOS-positive) — a genuinely different
band construction (fixed vs. growing σ) landing in the same place.

**The divergence-confluence hypothesis specifically shows nothing.**
`divAgree≥2` cells have n=2–18 (too rare — requiring 2+ of 4 timeframes to
show a fresh divergence in the same ~5-bar window at the same instant is a
strict conjunction) — not usable. `divAgree=0` vs `divAgree=1` (enough
data in most cells) doesn't move net-σ in a consistent direction across
cells; where it moves it's often against the intuition (more agreement,
worse net-σ, e.g. `long|3` divAgree=1: IS net-σ −0.276 vs base).

**None of the 138 dimension buckets tested held the OOS gate.** The
closest four (session=Asia on two cells, dayType=TREND, divAgree=1 on
`long|3`) all showed a real-looking IS delta (−0.15 to −0.21) that
collapsed to near-zero or flipped sign OOS — this repo's own recurring
signature of an illusory effect (`education/jordan_impulse_4h_range_levels_backtest/
FADE_EXTENSION_TRADE.md` already documented the identical pattern on a
different rule), not a real finding.

## What this does and doesn't mean

The band construction itself is sound and genuinely different from what's
already been tested (fixed vs. growing σ) — that mechanism question is now
answered, not left open. What's null is the specific hypothesis tested:
fading a fixed-sigma VWAP band, with or without multi-timeframe VuManChu
divergence agreement, doesn't show a historically repeatable edge on gold.
This doesn't rule out the idea entirely (one instrument, one divergence
definition/window, one fixed measurement horizon) — see Limitations — but
it is a real, honest null on the exact confluence hypothesis as stated,
not a coin-flip dressed up as inconclusive.

## Limitations

- **Gold only.** Extending to more instruments is the natural next step —
  the walk itself is fast (~10s on top of a ~18s M1 load).
- **One divergence definition.** `reversalDecision`'s defaults (5-bar-fresh
  window, 2-bar pivot reach, no OB/OS gate) are the standard VuManChu
  convention already used elsewhere in this repo, not tuned for this
  question specifically.
- **One measurement horizon (20 bars) and one band set ({2,2.5,3}σ).**
  Both are the owner's own indicator defaults, not swept.
- **MFE/MAE, not a real trade.** No spread/slippage/commission, no actual
  stop or target — "reached favourable before adverse" is a rough proxy,
  not a costed backtest. Converting this into one is a separate, later,
  explicitly harness-gated step if a real pattern ever shows up here first.

## Reproduce

```bash
node js/vwapFixedSigmaAtlasEngine.test.mjs
node education/vwap_fixed_sigma_atlas/scripts/run_one.mjs gold education/vwap_fixed_sigma_atlas/data commodity
```

Raw events: `data/<pair>.rows.json`. Full dimension book (cell × dimension
× bucket, IS/OOS, `holds`): `data/<pair>.book.json`.
