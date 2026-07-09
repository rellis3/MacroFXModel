# COG-gap findings (2026-07-09)

Why our daily vol forecast differs from the COG reference the forecaster is
hand-calibrated against. Recorded so we don't re-litigate it. The diagnostic
that produced this was a **build-and-kill POC** (`/api/cog-gap-poc`,
`js/cogGapPoc.js`, `cog-gap-poc.html`, `js/cogGapPoc.test.mjs`) — since deleted.
To reproduce, re-create a route that runs `computeForecast` on OANDA spot vs a
Yahoo futures daily feed, plus `latestSigmaForecast` per estimator over the last
N sessions.

## Context

- The "Ref" column in the vol-forecaster compare table is **COG's forecast**,
  pasted in by hand (vol-forecast-v2.html → Ref Data panel → KV). It is
  **forecast-vs-forecast**, not forecast-vs-realized.
- The entire `volForecast.js` correction-factor history is COG-calibration:
  `corrections = ref_value / our_uncorrected_value`, re-fit repeatedly.
- Independently, the cross-pair research measures **our forecast vs OANDA
  realized H-L** and finds our bands **too wide** (exceed-median ~34% vs 50%
  target — realized rarely reaches our median). So COG (which sits *above* us,
  esp. on gold) is **wider than realized still**. Chasing COG widens the
  already-too-wide bands.

## What the POC ran

Our **exact** `computeForecast` on two feeds (OANDA spot vs Yahoo futures,
same math), plus HL-median-raw (`BM_P50 × σ × 100`, no per-class fudge) under a
spread of estimators over the last 8 sessions. Data date: 2026-07-09,
last complete bar 07-08.

## Finding 1 — feed (CFD vs futures): NULL

| Pair | Spot HL med % | Fut HL med % | Fut vs Spot |
|---|---|---|---|
| GOLD | 2.64 | 2.62 | **−0.8%** (futures *narrower*) |
| NQ | 2.11 | 2.14 | +1.4% |
| EURUSD | 0.58 | 0.58 | +0.0% |

Spot and front-month futures forecast the same daily median to within ~1%; gold
futures is actually *lower*. COG gold ≈ 2.82 — **neither feed reaches it.**
**The CFD-vs-futures hypothesis is dead.** The gold/NQ gap to COG is not the feed.

## Finding 2 — responsiveness (half-life): CONFIRMED

Mean |day-over-day % change| per estimator (higher = faster half-life):

| Estimator | GOLD | NQ | EURUSD |
|---|---|---|---|
| EWMA λ0.90 | 3.83 | 2.56 | 4.26 |
| EWMA λ0.94 | 2.28 | 1.38 | 2.79 |
| HV20 | 3.54 | 4.04 | 2.80 |
| HV30 | 1.33 | 0.84 | 2.06 |
| **Yang-Zhang(30)** | **0.78** | **0.71** | **0.26** |

**YZ30 is the single stickiest estimator in the family — lowest Move%/day on all
three assets — and it is the production primary for both FX and commodity.** That
is why the forecast freezes day-to-day (EURUSD 0.58 three sessions straight)
while COG moves. COG behaves like a shorter half-life. The user's "day-weighting"
intuition was correct.

## Finding 3 — gold is a LEVEL bias, not feed or half-life

COG gold (2.73–2.82) sits **above our entire estimator family** (2.34–2.77 across
EWMA/HV/YZ). No change of half-life or feed reaches COG's gold level — COG simply
runs gold ~6% wider than any σ we compute. A base/bias difference (a gold floor
or seasonality uplift COG applies). This is where the original "seasonality
weighting" guess bites, and it is gold-specific.

## Finding 4 — the NQ (index) primary is separately mis-set

Our index GARCH-interim primary gives **2.11** — the lowest of everything — while
HV20/YZ say 2.5–2.9 and COG says 2.2–2.5. The index estimator runs *too low and
too sticky*, sitting below even our own other estimators. Worth revisiting the
index estimator choice on its own (independent of the COG question).

## Conclusion / the right target

- **Do not re-tune toward COG.** It is not a feed artifact, and it is wider than
  realized (the research floor). Matching its level — especially gold — just
  re-widens bands price already overshoots.
- The two properties we actually want are **separable**:
  1. **Responsiveness** — replace/blend the frozen YZ30 primary with a shorter
     half-life σ (shorter-window YZ, or EWMA λ0.94).
  2. **Correct width** — feed that faster σ into **`ratio_yz`**
     (`σ × trailing_quantile(realized ÷ σ)`), calibrated to **OANDA realized**,
     not to COG.
  Together: COG-like responsiveness *with* realized-correct width — the honest
  version of what COG stumbled into, without inheriting its over-width.

## Next step (deferred, not yet run)

A/B a shorter-half-life σ inside `ratio_yz` against the research harness
(OANDA-realized, IS/OOS split, ≥30 OOS windows) — per the Lego validation rule.
Ship the OOS comparison vs the incumbent YZ30, not just a new curve.
