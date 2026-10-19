# Results — zero-gamma distance vs NQ next-day range (prereg: ZERO_GAMMA_DISTANCE_PREREG.md, 2026-10-18)

Run 2026-10-18 after the pre-registration and its clarification were committed (cd8c2ff, then the F_front note).
Script `scripts/26_zero_gamma_distance.py`; raw numbers `data/results/zero_gamma_distance.json`.
Window 2020-09-08 → 2026-08-21 (lockbox respected), 779 days on the ≤45-DTE surface; Z found on 95% of days.

## Verdict: NULL by the registered rule — and the harness says the test is underpowered

| | n near / n | ΔDR (near − far, sign-demeaned) | p |
|---|---|---|---|
| **primary** (d ≤ 1σ) | 127 / 779 | **+0.023** | 0.69 |
| first half / second half | 76 / 389, 51 / 390 | +0.089 / −0.070 | 0.32 / 0.28 |
| robustness d ≤ 0.5σ | 55 | +0.111 | 0.21 |
| robustness d ≤ 2σ | 253 | −0.027 | 0.60 |
| robustness T = 30d, IV30 | 117 | −0.004 | 0.96 |
| robustness all expiries | 239 / 1,498 | −0.044 | 0.30 |

|ΔDR| < 0.03 and the robustness cells disagree in sign → **NULL**.

**Harness gates both failed**, which changes how to read the null:
- placebo (near flag shifted 125 days): ΔDR −0.061 (p 0.26) — the threshold was |Δ| < 0.03, but the bootstrap
  s.e. here is ~0.06, so noise alone produces placebo values of that size;
- positive control (trailing |return|): +0.057, p 0.20 — on these rows it did not reach its bar.

So the harness cannot reliably see effects of ~0.05–0.1 on this sample. **The honest reading is "no evidence, low
power": effects up to roughly ±0.15 DR (≈ 2.5 s.e.) cannot be ruled out.** Nothing gets built on it.

Engine check passed: the re-pricing finds Z between a put block and a call block with long gamma at spot, matching
`js/hedgingScenario.js`; and the re-priced sign at the front future agrees with G2's net-GEX sign on 93.9% of days
(they are different calculations of the same thing, so near-agreement is expected).

## Descriptive (not part of the verdict)

Mean raw DR (1.0 = Brownian) by distance to zero gamma (daily σ) and G2 sign:

| distance | long gamma | n | short gamma | n |
|---|---|---|---|---|
| ≤ 0.5σ | 1.035 | 21 | 1.075 | 34 |
| 0.5–1σ | 0.765 | 39 | 1.022 | 33 |
| 1–2σ | 0.777 | 89 | 0.997 | 37 |
| 2–4σ | 0.789 | 182 | 1.054 | 74 |
| > 4σ | 0.918 | 207 | 1.063 | 63 |

- The G2 effect (short gamma ranges more than long gamma) shows in every distance band.
- The one cell that fits the "conditional feedback" story — long gamma but within 0.5σ of the switch point ranging
  like Brownian (1.04) instead of damped (~0.78) — has **21 days**. A hypothesis for more data, not a finding.

## What would make this judgeable

- More days: the nightly capture (QuikStrike, with weeklies and dailies, since ~2026-08) and the Cboe archive
  (from 2026-10-19) — about 400 days each before a rerun.
- Per-expiry re-pricing (from `OI Data/NAS100_USD.csv` or our own capture) rather than one T for the summed book.
- A rerun must be its own pre-registration; this window has now been seen.
