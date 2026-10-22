# VIX vs Nasdaq/SPX divergence at the vol lines (hourly) — results

Pre-registration: forge/VIX_DIVERGENCE_PREREG.md (da392e9). Against = VIX did not confirm the move into the line (s ≥ +1σ); with = VIX over-confirmed it (s ≤ −1σ). Effect = within-cell continue difference, against − with (negative = against fades more, as predicted). Halves: 2023-12–2024 vs 2025–26.

| set | against − with [95% CI] | first half | second half | n (against / with) |
|---|---|---|---|---|
| NQ + SPX | -2.6pp [-7.1pp, +2.7pp] | +0.6pp | -3.2pp | 2,173 / 2,036 |
| NQ | +1.7pp [-5.6pp, +9.3pp] | +8.0pp | -1.3pp | 1,081 / 1,047 |
| SPX | -5.4pp [-12.6pp, +2.8pp] | -2.5pp | -5.4pp | 1,092 / 989 |

T1: not real.

| group | passes | continue | follow R (halves) | fade R (halves) |
|---|---|---|---|---|
| against (VIX not confirming) | 2,173 | 38% | +0.019 (+0.084 / -0.018) | -0.061 (-0.116 / -0.030) |
| neutral | 8,377 | 38% | +0.023 (+0.041 / +0.012) | -0.066 (-0.091 / -0.051) |
| with (VIX over-confirming) | 2,036 | 40% | +0.069 (+0.068 / +0.070) | -0.117 (-0.106 / -0.124) |

T2: fade when against — fail; follow when with — **PASS**.

## Post-hoc audit (2026-10-02)
- **The T2 "follow when with" pass is long-side drift, not divergence.** Split by side: with = longs +0.172R (n=915), shorts
  −0.014R (n=1,121; +0.026 / −0.039 by half). The same long skew shows in the neutral group (longs +0.051, shorts −0.000).
  NQ/SPX rose strongly over 2023-12 → 2026; the earlier index tests required shorts alone to pass for exactly this reason,
  and this pre-registration omitted that guard. Read as: no tradeable divergence effect.
- The descriptive line on rich-IV break trades has been REMOVED: it matched breaks to the wrong VIX readings (it reported
  −0.9R per trade when all NQ/SPX break trades since 2023-12 average +0.03 / −0.02R). Not interpreted.

## Reading
At hourly resolution, VIX not confirming the index's move into a line does not make the line fade more (T1 not real; NQ and
SPX point opposite ways). COG's version is minute-level; hourly may simply be too coarse. The live 1-minute VIX/VXN capture
started 2026-10-02 is what can test it properly in a few months.
