# VWAP Fixed-Sigma bands — the trend question: does price actually get back to VWAP? (2026-08-26)

> **⚠️ Prior art discovered after this was written — read this box first.**
> This exact question — "does price hit kσ and return to VWAP, and does
> session/vol/momentum change it" — was already asked and answered, more
> rigorously, by `js/vwapFixedSigmaEngine.js`'s **return-to-VWAP book**
> (`MD files/GOLD_VWAP_FIXED_SIGMA_FINDINGS.md` §7), which I did not check
> for before building this second engine — a Lego Principle process miss.
> Two concrete reasons that work is more trustworthy than this file:
> 1. **Random-walk control.** §7 runs the identical engine on a seeded
>    driftless random walk and reads gold's numbers against it. At ±1σ,
>    "returns to VWAP" is *mostly the coordinate artifact* (VWAP mechanically
>    converges toward a stationary price) — 61% gold vs 53.5% control. This
>    file has no such control, so its base rates (52.7% at 2σ, etc.) can't be
>    told apart from that artifact at all.
> 2. **Clock-truncation confound.** §7's own build log says its first draft
>    used "returns before session end" as the outcome and got a spurious
>    `sessionPos=late` finding — an artifact of late-session touches simply
>    having less time left before the UTC day resets, not real behaviour.
>    It was fixed by switching to a **fixed 240-minute horizon**, only
>    counting touches with ≥240min of session left. **This file's
>    `resolutionMode:'returnToVwap'` still caps at session end** (see
>    engine header) — the exact same confound, unfixed. Since NY sits later
>    in the UTC day than Asia, the session-ordering finding below
>    (**NY reverts least**) is at least partly reproducing that same clock
>    effect, not independent confirmation of it.
>
> The good news: §7 independently found the **same direction** — Asia/London
> revert more, NY (and the London/NY overlap) persists more — validated
> against both the random-walk control and the fixed-horizon fix, replicated
> on EURUSD/GBPUSD/USDJPY. So the conclusion below is very likely still
> correct, but *because §7 already proved it properly*, not because this
> file's own run adds independent evidence. Treat everything under
> "What holds out-of-sample" as **corroborating but unvalidated on its own**,
> not a second confirmation.
>
> The one thing genuinely not in §7: `divAgree` (multi-timeframe WaveTrend
> **divergence agreement**, not just WT state). It held on 1 of 6 cells,
> barely over the gate — consistent with, not contradicting, §7b's own
> conclusion that momentum/WaveTrend conditioning is thin and gold-only.

Follow-up to `RESULTS.md`, which measured MFE/MAE for a *hypothetical trade*
(fixed 20-bar window) — that's a trade question. This is the pure trend
question instead, per the owner's explicit request: when a fixed-sigma band
is touched, does price actually return to VWAP, when, and does it extend
further first? Same reference-book discipline (no after-cost gate, every
dimension reported honestly, OOS-held gate before anything counts).

**Engine**: `js/vwapFixedSigmaAtlasEngine.js`'s new `resolutionMode:
'returnToVwap'` (added alongside the original `'fixedWindow'` mode as a
parameter, not a new bespoke leg — default unchanged, regression-tested
byte-identical). Outcome tracked forward, session-capped, **censored not
discarded** if the session ends first (matches `vwapExtensionAtlasEngine.js`'s
own discipline): `touchedVwapAfter`, `barsToVwapTouch`, `peakExtSigma`
(causal running max), `didExtendFurtherFirst`, `wentToOppositeSide`.
Script: [`scripts/run_trend.mjs`](scripts/run_trend.mjs).

---

## Data

Gold, real OANDA M1 2016–2026 (~10.4 years), same fixed-sigma band
construction as `RESULTS.md` (trailing-20-session mean RMS-from-VWAP,
locked per session). 6,979 touch events across 6 cells (short/long ×
2/2.5/3σ). 60/40 IS/OOS split, holds gate n≥30 both halves, same sign, |Δ|≥3pp
both halves.

## Base rates — reversion is a real minority-to-coin-flip outcome, falling with level extremity

| Cell | n | Touched VWAP | Extended further first | Went to opposite side | Unresolved at day-end | Avg bars to touch |
|---|--:|--:|--:|--:|--:|--:|
| short 2σ | 1,672 | **52.7%** | 95.6% | 37.1% | 47.3% | 186 |
| short 2.5σ | 1,100 | **43.8%** | 95.2% | 28.6% | 56.2% | 196 |
| short 3σ | 710 | **37.0%** | 95.1% | 26.2% | 63.0% | 190 |
| long 2σ | 1,651 | **56.1%** | 92.9% | 34.3% | 43.9% | 173 |
| long 2.5σ | 1,112 | **47.3%** | 92.4% | 27.2% | 52.7% | 181 |
| long 3σ | 734 | **36.9%** | 91.8% | 21.0% | 63.1% | 194 |

Reading it straight: touching a 2σ band gets back to VWAP the same session
a bit better than half the time; by 3σ it's down to ~37%. In **over 90% of
touches on every cell**, price makes a *new further extreme* beyond the
touched level before it ever gets back to VWAP (if it gets back at all) —
the band is not a wall. When it does revert, ~3 hours (173–196 bars) is the
typical time.

---

## What holds out-of-sample — session dominates, cleanly, on every single cell

`session` at the touch bar holds the OOS gate on **all 6 of 6 cells** —
same three-way ordering, same direction, every time:

| Cell | NY (Δ vs base) | London (Δ vs base) | Asia (Δ vs base) |
|---|--:|--:|--:|
| short 2σ | 515n/359n, **−17.7 / −17.3pp** | 327n/206n, **+17.9 / +19.1pp** | 149n/116n, **+21.8 / +19.7pp** |
| short 2.5σ | 391n/261n, **−15.5 / −14.4pp** | 195n/107n, **+21.0 / +19.1pp** | 77n/69n, **+26.2 / +25.1pp** |
| short 3σ | 264n/180n, **−16.7 / −12.3pp** | 113n/68n, **+23.8 / +23.4pp** | 51n/34n, **+33.5 / +18.9pp** |
| long 2σ | 525n/328n, **−16.0 / −18.4pp** | 338n/206n, **+16.7 / +13.3pp** | 128n/126n, **+21.9 / +26.3pp** |
| long 2.5σ | 360n/258n, **−18.4 / −14.7pp** | 221n/134n, **+19.8 / +13.5pp** | 73n/66n, **+30.5 / +30.4pp** |
| long 3σ | 272n/188n, **−14.8 / −13.5pp** | 126n/73n, **+20.2 / +17.9pp** | 38n/37n, **+39.4 / +33.4pp** |

**NY-session touches revert least, Asia-session touches revert most,
London sits in between — a monotonic Asia > London > NY ordering that
never once breaks, across 6 independent cells, both halves of the split,
on real 10-year data.** This is the strongest, cleanest finding in this
whole project to date, for a concrete reason: it's not a single
construction's quirk. `js/vwapExtensionAtlasEngine.js` (a mechanically
different band — ATR-normalised distance from a *plain, continuously-
resetting* VWAP, no fixed-sigma, no per-session lock) found the **same
NY-persists / Asia-and-London-revert-more ordering** independently, on
gold and three other instruments (`education/vwap_extension_atlas/
RESULTS.md`). Two genuinely different mechanisms measuring "does price get
back to VWAP" land on the same answer — that's real corroboration, not a
restated coincidence.

### Secondary, weaker patterns — reported, not promoted alongside the session finding

- **`dayType = TREND`** holds on 5 of 6 cells, always the same direction:
  **trend days revert to VWAP MORE, not less** (+4 to +20pp) — real and
  repeated, but the effect is smaller and less universal than session, and
  is somewhat counter to a naive "trend days shouldn't mean-revert"
  intuition. Reported as a genuine, held pattern — not explained away, not
  inflated.
- **`htfTrend`/`momAdx`** hold on the **short** side only (2.5σ and 3σ, not
  2σ): momentum agreeing with the fade direction (`htfTrend=3·with`,
  `momAdx=3·trend`) correlates with a HIGHER touch-back rate. Real where it
  holds, but single-sided — not cross-validated on longs.
- **Multi-timeframe divergence agreement (`divAgree`)** holds on exactly
  **one** cell out of six (short 2.5σ, divAgree=1: IS +10.5pp, OOS only
  +3.5pp — barely clears the gate) — consistent with `RESULTS.md`'s own
  finding that this specific confluence idea carries little to no signal.
  One cell out of six, at the threshold, is what chance produces at this
  sample size — not treated as a real finding here either.

---

## What this does and doesn't mean

This is a description of history, not a trading rule — same discipline as
every reference-book engine in this repo. What it adds, honestly: **the
session effect first found on a completely different VWAP construction now
replicates on the owner's own indicator** — two independent mechanisms
agreeing is meaningfully stronger evidence than either alone, though still
not a validated after-cost edge (that's a separate, harness-gated exercise,
not attempted here). The `dayType`/`htfTrend` secondary patterns are real
enough to note but not strong or universal enough to lean on.

## Reproduce

```bash
node js/vwapFixedSigmaAtlasEngine.test.mjs
node education/vwap_fixed_sigma_atlas/scripts/run_trend.mjs gold education/vwap_fixed_sigma_atlas/data commodity
```

Raw rows: `data/<pair>.trend.rows.json`. Full book: `data/<pair>.trend.book.json`.
