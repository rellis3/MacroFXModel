# VuManChu Cipher B divergence at the vol lines (NQ first) — pre-registration

Committed 2026-10-01 before any number below was computed. Follows forge/DIVERGENCE_REACTION_PREREG.md,
whose divergence used WaveTrend at PRICE swings on FX/gold. The owner's example (NQ 5m, 2026-10-01: price
higher high at Close p75 / OH p75 / Proj H median around 07:15 UK while WaveTrend made a lower peak than
~05:15, followed by a large fade) uses Cipher B's own rule on an index. This tests that rule exactly.

## Rule (Pine `f_findDivs`, Cipher B defaults)
- WaveTrend on M5 bars: hlc3, channel 9, average 12, MA 3 (wt2 = SMA3 of wt1). Completed bars only.
- Fractal top on wt2 at bar i: wt2[i] above the two bars before and the two after. Known when bar i+2 completes.
- Qualifying top: wt2[i] ≥ 45 (`wtDivOBLevel`). Secondary (repo's js/divergence.js): ≥ 25.
- **Bearish divergence:** at a qualifying top, the bar's high is above the high at the previous qualifying top
  AND wt2 is below the previous top's wt2. Previous top = the most recent earlier qualifying top within 24 hours
  (Pine has no cap; the cap only drops stale pairs). Mirror for bullish (bottoms ≤ −65 primary, ≤ −25 secondary).

## Event
For each pass of an up line (mirror for down lines): the first qualifying wt2 fractal top whose fractal bar's high
is at or above the line, confirmed within 60 minutes of the touch. Decision bar = the first M1 bar after the
confirmation. Groups: **divergence** vs **no divergence** (qualifying top at the line, price higher high but wt2
also higher, or price not higher). Passes resolved before the decision are dropped. The race restarts at the
decision bar with the touch's targets (continue = next line out first, fade = line behind first); R from the
decision bar's open, net of spread.

## Instruments
1. **NQ** (the owner's case) — primary.
2. **Confirmation, independent:** SPX, DOW, US2000, DE30, UK100 pooled.
3. **Also:** the book's 16 FX/gold instruments pooled, same rule.
All 2016 → 2026-08 (M1 history). NQ and indices need their own touch/sequence files (same builders).

## Tests (fixed)
- **T1:** within-cell (line family × London hour × range used) continue-rate difference, divergence vs no
  divergence; day-bootstrap 95% CI; REAL = CI excludes 0 and same sign 2016–22 / 2023–26. Primary = NQ.
- **T2:** the divergence group's FADE R (and follow R) > 0 in both halves; Benjamini–Hochberg 10% over
  {3 instrument sets × 2 OB levels × 2 directions}. A PASS on NQ only counts if the confirmation set's fade R
  is also > 0 in both halves.
- Self-check: future-scramble from the decision bar; group and decision time must not change.
