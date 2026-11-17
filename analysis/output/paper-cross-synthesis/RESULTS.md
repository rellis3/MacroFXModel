# paper-cross-synthesis: results (exploratory, not pre-registered)

Date 2026-11-17. Page: `paper-synthesis.html`. Method: `scripts/paper-cross-synthesis/README.md`. No market data was
scored, so there is no verdict. Every blueprint is a lead for a future prereg, never evidence.

## What was done

- **Library.** 884 papers with desk notes, 361 of them with full text held. Most notes come from the abstract. By
  strength: A 16, B 207, C 373, D 288.
- **Pairs.** All 390,286 pairs checked; 31,327 fit, meaning one paper gives the direction or forecast and the other
  adds a missing regime filter, timing, sizing, exit, forecast or cost model, on the same market and horizon.
- **Groups and contradictions.** 62 groups of 3 or more papers on the same effect; 229 contradictions flagged by the
  readers.
- **Blueprints.** Five theme readers wrote 44 blueprints. These reduce to **36 distinct systems**, and 6 were reached
  independently by 2–3 themes.

## Strongest cases (grade 4/5, all built on data we hold)

| System | Status vs Evidence Book | Themes |
|---|---|---|
| Gamma-gated noise-band momentum (SPY/NQ) | partly tested: base rule validated on SPY; the gamma-sign gate was never run | 3 |
| Pre-FOMC drift sleeve, flat before the press conference | new: no pre-FOMC equity test; post-fomc-usd-drift validated | 2 |
| Index beta switched by a jump-model regime, vol-managed | null with a new angle: must beat vol-target (stress-filter-hold-beyond-vt null) | 2 |
| Vol-gated, vol-scaled G10 carry | partly tested: the earlier risk-off gate ran monthly, not daily (fx-factor-book-v2) | 1 |
| FOMC two-leg book (pre-FOMC equity + post-FOMC USD) | partly tested | 1 |
| Basis-timed short VIX futures with a term hedge | partly tested: short-vx-rule underpowered, mostly roll | 1 |
| Leverage-aware vol forecast for index sizing and stops | partly tested: forecast-miss-shock-idx validated | 1 |
| Multi-asset trend with regime-dependent weights | partly tested | 1 |
| COT flow (not level) orthogonal commodity momentum | null with a new angle: cot-positioning-factor ranked levels | 1 |
| Gold + duration trend with HAR/GVZ sizing | partly tested | 1 |

## Where the literature agrees, and where our own tests already agree with it

- Simple HAR-type vol models are hard to beat (3 themes).
- Implied vol adds to realised-vol forecasts (our iv-forecast is validated).
- Order flow explains the same-time move but doesn't predict the next one (our orderflow nulls agree).
- Time-series momentum is broad and slow; intraday breakout rules die after costs.
- Vol-scaling cuts risk more than it raises Sharpe (our stress-filter results agree).
- Carry is paid for crash risk tied to global FX vol.

## Caveats

- Tags and blueprints are AI judgements made from the notes, and most papers were read from the abstract only.
- The Evidence Book screen was done by keyword; unknown ids were dropped by the build script.
- The grades are the readers' views of the case, not measured effects.
