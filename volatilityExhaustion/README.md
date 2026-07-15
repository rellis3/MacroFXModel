# Volatility-Exhaustion — a measurement-first study

**Goal.** Learn, honestly and from our own data, whether *expected volatility*
tells us the point at which price **exhausts and reverts** intraday — combining
the vol forecast (how far price travels) with exhaustion dynamics (where it turns).

We build the **lens before the trade**: measure the phenomenon directly and look
at real charts, and only build a strategy if the data shows a real, stable effect.
This folder is self-contained and runs offline on the local M1 parquet cache
(`portfolioBacktest/cache/`, ~10.4y M1, 2016→2026) + `calendar_events.csv`.

## The σ contract (no drift from the live forecaster)
`vol_exhaustion_lib.py` reproduces the project's Yang-Zhang σ, the Europe/London
day boundary, and the causal `σ_pred[i]=yz[i-1]` rule **exactly** (generate-don't-port,
per `PYTHON_LEGO.md`). `compare_sigma.py` runs the real `js/volBacktestEngine.js`
`yzVolSeries` on the same synthetic bars and asserts agreement to 1e-10 — this is the
contract, and it **passes** (max |JS−Py| = 1.7e-18). The exhaustion lens is on the
same σ as the forecaster by construction.

## The measurement (descriptive, not a strategy)
- Anchor = London-midnight open `O`; scale = causal YZ σ. Distance `d = (price−O)/O/σ`.
- **Two-barrier race:** at a state, place barriers ±`θσ` (θ=0.25) in price — reversal
  (toward open) vs continuation (away). Whichever is hit first within `H`=60min labels it.
- For a driftless walk the **null is P(reversal)=0.50 at every distance** (optional
  stopping). So the pre-registered read is unambiguous:
  - P(reversal) **rises with distance** → real, vol-scaled exhaustion.
  - P(reversal) **flat ~0.50** → null; exhaustion is folklore here.
- A result only counts if it **holds on both halves** (in-sample & out-of-sample).

Two framings:
- `measure.py` — distance from the **fixed open** (+ splits by time-of-day, arrival
  speed, Major-news day).
- `measure_extremes.py` — the **fairer** test: condition on a **fresh session extreme**
  ≥0.4σ from open and ask "does this extreme *hold*?" (the real "is this THE high?" setup).

## Results (Phase 0)

**1. Distance-from-open: NULL, on both instruments.**
EUR/USD reversal probability hugs 0.50 at every distance; the far-distance wiggles
(>2.5σ) are noise and **disagree** across the IS/OOS split (the pre-registered kill
condition). Time-of-day, arrival-speed, and news splits are all flat too. NQ tilts
*below* 0.50 at distance (weak momentum), IS/OOS agreeing — the opposite of exhaustion.
Harness validated: daily max travel-from-open has median 1.01σ / 75th 1.49σ, right
against the Feller HL median 1.572σ — the σ scaling is correct, the null is real.

**2. Fresh-extreme (impulse) test: a weak but IS/OOS-stable, economically-signed split.**
Conditioning on a fresh extreme (not a fixed distance) is the first thing that isn't
flat — and, importantly, the sign **replicates across the time split** on ~44k events each:

| Instrument | mean hold-rate | far (≥1.5σ) IS | far (≥1.5σ) OOS | reading |
|---|---|---|---|---|
| EUR/USD | 0.519 | 0.536 | 0.539 | weak **mean-reversion** (extremes hold) |
| NQ      | 0.464 | 0.476 | 0.483 | weak **momentum** (extremes extend) |

EUR/USD shows a replicating ~0.59 bump at 2–2.5σ (both halves agree). The sign
difference — **FX exhausts weakly, the index trends weakly** — is economically
sensible and matches the replicated literature (short-horizon FX mean reversion;
index momentum). It is *small*, non-monotonic, and its after-cost tradeability is
**not** established.

## Honest verdict
- The naïve "vol-distance predicts the reversal point" idea is **null** off the open.
- The **fresh-extreme** framing yields a genuine, out-of-sample-stable, correctly-signed
  effect — the best lead this study has produced — but it is weak (≈54/46) and untested
  against costs and the overshoot tail.
- Blunt odds this becomes a tradeable, after-cost edge: **~15–20%.** Worth one careful,
  costed follow-up; not worth excitement.

## Next (Phase 1, if pursued)
1. Convert the fresh-extreme reversion into a **costed** IS/OOS trade (fade a fresh ≥2σ
   FX extreme; target partial-revert/open; stop beyond; real spread + slippage; handle the
   overshoot). Pre-register: must beat the naïve benchmark OOS after costs, ≥30 trades.
2. Test the **sign-flip**: momentum-follow fresh NQ extremes.
3. Extend the fresh-extreme measurement to the other FX majors — is the reversion sign an
   FX property or a EUR/USD fluke? (guards against multiple-testing on one series).

## Files
- `vol_exhaustion_lib.py` — σ/day/anchor baseplate (matches the JS forecaster).
- `compare_sigma.py` / `crosscheck_sigma.mjs` — the σ-drift guard (JS vs Python).
- `measure.py` — distance-from-open lens + conditioners → `charts/*_1.._6.png`.
- `measure_extremes.py` — fresh-extreme exhaustion test → `charts/*_7.png`.
- `summary.json` — headline stats.
