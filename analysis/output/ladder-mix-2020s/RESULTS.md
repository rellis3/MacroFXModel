# ladder-mix-2020s — results

Prereg: `forge/LADDER_MIX_2020S_PREREG.md` (2026-11-19). Seed 20261119, B = 2000, 63-session blocks.
Script: `scripts/ladder-mix-2020s/run.py`. Numbers: `results.json`. Log: `report.txt`.
Ledger: `ladder-mix-2020s` (UNDERPOWERED; the per-percentile mix is NULL).

## Verdict: mixing sigmas doesn't beat one chosen sigma

- **Data:** 2020s only. Widths and regressions were fitted from 2020-01-01. Every strategy chose its arm(s) for test
  year Y from the out-of-sample years 2021 … Y−1.
- **Test:** 2022 → 2026-08-21, about 1,200 sessions per instrument.
- **Score:** the 30-cell regime miss, in pp, averaged over NQ, GOLD and EURUSD.

| Strategy | Pooled miss | Minus one σ (90% CI) | Verdict |
|---|---|---|---|
| S0 live yz_10 | 3.10 | +1.18 [+0.30, +1.43] | — (one σ beats live) |
| **S1 one σ, chosen yearly** | **1.93** | — | — |
| S2 σ per percentile (p75 / p90) | 1.95 | +0.02 [−0.14, +0.23] | **NULL** |
| S3 σ per regime fifth | 2.08 | +0.15 [−0.29, +0.64] | UNDERPOWERED |
| S4 σ per cell (fifth × qty × rung) | 1.80 | −0.13 [−0.36, +0.37] | UNDERPOWERED |

Per instrument, with pinball relative to S1 in brackets:

| Strategy | NQ | GOLD | EURUSD |
|---|---|---|---|
| S0 live | 2.72 | 3.53 | 3.06 |
| S1 one σ | 1.74 | 2.02 | 2.02 |
| S2 per percentile | 1.50 (1.004) | 2.15 (0.977) | 2.18 (1.002) |
| S3 per regime | 2.35 (1.016) | 1.95 (0.996) | 1.95 (1.006) |
| S4 per cell | 1.65 (1.008) | 1.80 (0.989) | 1.94 (1.004) |

## Reading

- **Mixing doesn't help on unseen years.** Per percentile gives exactly no improvement. Per regime and per cell move
  within noise in both directions. That's the 2020s-only, out-of-sample version of the hindsight bound, whose
  0.34–1.24pp scores below the luck floor were fitting noise.
- **The picks jump around.**
  - GOLD's single best σ went GVZ → GVZ → yz_30 → GARCH → yz_30 across the years.
  - The per-regime and per-cell picks change every year (8–15 distinct arms per cell map).
  - That instability is what fitting noise looks like.
- **Choosing one σ still beats the live σ by about 1.2pp, even inside the 2020s.** The regime fix holds with the
  older years removed. The per-instrument floor here is about 1.9pp (fewer sessions), so S1 sits at the floor.
- **Keep one σ per instrument.** Gold's 2020s-only pick isn't stable, so the full-window race winner (HAR-CJ) stays
  the shadow σ. The 2020s pick should be revisited only if the forward record disagrees.
