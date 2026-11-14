# relationship-map — results

Prereg: `forge/RELATIONSHIP_MAP_PREREG.md` (committed in `cfeab155`, 2026-11-13; amendment A1, PRE-RESULTS, in `e2dc2854`). Run 2026-11-13, seed 20261113, B = 2000, placebo 200 draws.
Branch `main`. Ledger id: `relationship-map`. Daily closes 2006-01-01 → 2026-08-21 (lockbox end; nothing after read).

## Verdict: UNDERPOWERED (graded: 0 Leaning · 9 Faint · 11 Untested properly · 0 Against)

The registered gate (after-a-big-move effect at 5 days clear of zero the believed way, BH q = 0.10 over 20 pairs, both halves,
above the placebo 95th percentile) was met by **no pair**. With 137-199 de-clustered big moves per pair, the smallest effect
each cell could see was **0.226-0.359 σ**, against the 0.10 σ that matters: so most pairs grade **Untested properly**
(unknown, not dead), and **no pair grades Against** (no interval was narrow enough to rule a small effect out). 9 pairs
grade **Faint** (point the believed way). The strongest is **VIX → gold**: after a big VIX move, gold moves with it over the next
5 days (+0.218 σ [+0.048, +0.393], both halves +0.23 / +0.21, placebo 99th percentile), missing only the 20-pair correction.

The **same-day** picture is the solid part: 12 of 20 pairs move together **reliably** (|r| ≥ 0.20, believed sign in ≥ 80% of years).
The **linear lead** is absent everywhere (largest |z| 1.52 at 5 days), matching the existing lead-lag grid (`js/leadLag.js`).

## Scored cells (M3, after a big move, 5 days, believed-way effect in σ)

| Pair | Believed | n | Effect | 95% CI | MDE | BH | Halves 06-15 / 16-26 | Placebo pct | Grade | 1 day / 20 days |
|---|---|---|---|---|---|---|---|---|---|---|
| P1 DXY → Gold | − | 193 | -0.043 | [-0.200, +0.106] | 0.257 | no | -0.111 / +0.024 | 24.5 | **Untested properly** | Untested properly / Untested properly |
| P2 DXY → S&P 500 | − | 194 | -0.014 | [-0.216, +0.165] | 0.255 | no | +0.080 / -0.126 | 43.5 | **Untested properly** | Faint / Untested properly |
| P3 DXY → Copper | − | 199 | -0.087 | [-0.258, +0.072] | 0.226 | no | -0.055 / -0.129 | 12 | **Untested properly** | Untested properly / Faint |
| P4 US 10y yield → Gold | − | 180 | +0.133 | [-0.043, +0.313] | 0.256 | no | +0.055 / +0.201 | 95.5 | **Faint** | Untested properly / Faint |
| P5 US real 10y → Gold | − | 195 | +0.026 | [-0.140, +0.193] | 0.255 | no | +0.093 / -0.046 | 64 | **Untested properly** | Faint / Faint |
| P6 US 10y yield → Nasdaq 100 | − | 180 | -0.018 | [-0.216, +0.172] | 0.271 | no | -0.179 / +0.123 | 46.5 | **Untested properly** | Untested properly / Faint |
| P7 US 2y yield → USDJPY | + | 171 | +0.052 | [-0.125, +0.239] | 0.264 | no | -0.095 / +0.152 | 68.5 | **Faint** | Untested properly / Faint |
| P8 US 10y yield → USDJPY | + | 159 | +0.009 | [-0.158, +0.205] | 0.261 | no | -0.018 / +0.032 | 49 | **Untested properly** | Untested properly / Untested properly |
| P9 US 2y yield → EURUSD | − | 171 | -0.100 | [-0.300, +0.092] | 0.259 | no | -0.276 / +0.018 | 9.5 | **Untested properly** | Untested properly / Untested properly |
| P10 10y-2y slope → EURUSD | ± | 156 | -0.125 | [-0.310, +0.056] | 0.28 | no | -0.198 / -0.062 | 6.5 | **Untested properly** | Untested properly / Untested properly |
| P11 VIX → S&P 500 | − | 156 | +0.070 | [-0.110, +0.255] | 0.297 | no | -0.012 / +0.134 | 79.5 | **Faint** | Faint / Untested properly |
| P12 VIX → USDJPY | − | 137 | -0.005 | [-0.290, +0.225] | 0.299 | no | +0.128 / -0.122 | 51.5 | **Untested properly** | Untested properly / Untested properly |
| P13 VIX → AUDUSD | − | 137 | +0.072 | [-0.150, +0.325] | 0.343 | no | +0.059 / +0.082 | 78 | **Faint** | Faint / Faint |
| P14 VIX → Gold | + | 155 | +0.218 | [+0.048, +0.393] | 0.277 | no | +0.226 / +0.212 | 99 | **Faint** | Faint / Faint |
| P15 S&P 500 → AUDUSD | + | 152 | +0.132 | [-0.108, +0.400] | 0.359 | no | +0.093 / +0.167 | 94.5 | **Faint** | Faint / Faint |
| P16 Brent → USDCAD | − | 159 | +0.101 | [-0.089, +0.305] | 0.276 | no | +0.264 / -0.032 | 88 | **Faint** | Untested properly / Faint |
| P17 Brent → 10y breakeven | + | 178 | +0.035 | [-0.123, +0.193] | 0.292 | no | +0.180 / -0.075 | 66 | **Faint** | Untested properly / Faint |
| P18 Copper → AUDUSD | + | 152 | +0.088 | [-0.099, +0.276] | 0.281 | no | +0.230 / -0.012 | 82.5 | **Faint** | Faint / Untested properly |
| P19 Copper → US 10y yield | + | 181 | -0.057 | [-0.260, +0.134] | 0.249 | no | -0.038 / -0.072 | 24 | **Untested properly** | Untested properly / Untested properly |
| P20 Gold → AUDUSD | + | 184 | -0.027 | [-0.201, +0.162] | 0.274 | no | -0.070 / +0.013 | 34.5 | **Untested properly** | Untested properly / Untested properly |

Effect = mean believed-way move of B (from the close of day t+1 to t+1+h, in B's prior-250-day σ, scaled by √h) after A's big move,
minus the same on all days. P10 (slope → EURUSD) is two-sided: its sign is the direction found.

## Together and lead (M1, M2: description)

| Pair | Same-day r | Label | Years with believed sign | Lead r (5 days) | z | Next day r (may be close-time catch-up) |
|---|---|---|---|---|---|---|
| P1 DXY → Gold | -0.404 | reliable | 100% | +0.023 | 1.299 | -0.054 |
| P2 DXY → S&P 500 | -0.169 | variable | 75% | -0.013 | -0.645 | +0.019 |
| P3 DXY → Copper | -0.298 | reliable | 95% | -0.016 | -0.916 | -0.005 |
| P4 US 10y yield → Gold | -0.187 | variable | 90% | -0.027 | -1.519 | -0.054 |
| P5 US real 10y → Gold | -0.239 | reliable | 100% | -0.016 | -0.824 | -0.080 |
| P6 US 10y yield → Nasdaq 100 | +0.204 | opposite | 25% | -0.007 | -0.375 | -0.035 |
| P7 US 2y yield → USDJPY | +0.267 | reliable | 100% | +0.020 | 0.926 | +0.129 |
| P8 US 10y yield → USDJPY | +0.285 | reliable | 100% | +0.006 | 0.327 | +0.137 |
| P9 US 2y yield → EURUSD | -0.091 | weak/none | 75% | -0.014 | -0.719 | -0.055 |
| P10 10y-2y slope → EURUSD | +0.036 | weak/none | 60% | -0.007 | -0.385 | +0.010 |
| P11 VIX → S&P 500 | -0.784 | reliable | 100% | +0.013 | 0.712 | +0.057 |
| P12 VIX → USDJPY | -0.114 | variable | 80% | -0.005 | -0.289 | -0.046 |
| P13 VIX → AUDUSD | -0.221 | reliable | 100% | -0.006 | -0.323 | -0.093 |
| P14 VIX → Gold | -0.014 | weak/none | 40% | +0.020 | 1.257 | -0.050 |
| P15 S&P 500 → AUDUSD | +0.277 | reliable | 100% | +0.006 | 0.182 | +0.081 |
| P16 Brent → USDCAD | -0.218 | reliable | 95% | -0.021 | -0.965 | -0.069 |
| P17 Brent → 10y breakeven | +0.347 | reliable | 100% | +0.029 | 1.095 | +0.076 |
| P18 Copper → AUDUSD | +0.277 | reliable | 100% | +0.001 | 0.059 | +0.098 |
| P19 Copper → US 10y yield | +0.148 | variable | 86% | +0.001 | 0.05 | -0.009 |
| P20 Gold → AUDUSD | +0.218 | reliable | 100% | +0.005 | 0.253 | +0.129 |

## Controls

- **Positive control (A1, 50 replications):** planted +0.335 σ recovered as 0.322 (CI clear of zero in 100% of runs); with nothing planted 0.011 (false clear 0%).
- **Data join:** VIX vs S&P 500 same-day r = -0.784 (known strongly negative).
- **Placebo:** each pair against 200 random sets of its own days (percentile in the table).

## Deviations from the prereg

A1 (PRE-RESULTS): the positive control is judged on the mean of 50 replications, not one run (one run's sampling error ~0.08 σ exceeded the 0.05 tolerance). No real outcome had been computed.

## Descriptive (not part of the verdict)

- **Rates up, tech down (P6) is a recent regime, not a law:** same-day r is +0.204 over 2006-2026 (yields and the Nasdaq mostly rose together), with the believed negative sign in only 25% of years.
- **The owner's example (P10, steepening → EURUSD):** same-day r 0.036 (weak/none); after a big slope move EURUSD -0.125 [-0.310, +0.056]: unknown at this power.
- Daily FRED/Cboe/Yahoo closes are not synchronous; the next-day column can carry catch-up and is context only (prereg §3).

## What this changes

- **Monitor rulebook (owner's live-alert idea):** the 12 *reliable* same-day pairs become the "out of line" baseline (a day one of them breaks is worth an alert); the 9 Faint after-big-move rules enter at low weight, shown but never alerted alone; VIX → gold is the first candidate for a forward record.
- **Nothing is a signal.** A forward record from the day a rule is wired is what can raise a grade; re-cutting this history cannot.
- **To see small effects (0.10 σ), daily data is too coarse:** the next design is intraday (M15) or a pooled family (e.g. all risk-off pairs together), registered separately.
