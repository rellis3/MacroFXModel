# overnight-vol-regime — RESULTS

Scored once, 2026-11-02:
- run: `python -I scripts/overnight-vol-regime/run.py --mode score`, seed 20261102;
- prereg: `forge/OVERNIGHT_VOL_REGIME_PREREG.md` (registered fd1a6144);
- controls: `CONTROLS.md`;
- numbers: `results.json`, `run.log`.

The night sample and the baseline are unchanged:
- NQ: 3,503 nights, the banked 2016-10 → 2026-08 trades plus 1,554 futures-file nights 2009-01 → 2016-10;
- gold: 1,962 banked nights.

## Headline

| | b (z, quietest → busiest) | 95% CI | Placebo p (raw / Holm) | Q1 evidence of an effect? | Q2 large effect ruled out? | Q3 useful smaller effect excluded? | Verdict |
|---|---|---|---|---|---|---|---|
| **NQ** | **+0.015** | [−0.052, +0.080] | 0.63 / 1.0 | **no** | **yes** | cannot be determined | **UNDERPOWERED (large effect ruled out)** |
| **Gold** | **+0.001** | [−0.101, +0.097] | 0.96 / 1.0 | **no** | **yes** | cannot be determined | **UNDERPOWERED (large effect ruled out)** |

- **NQ:** no evidence of an effect (p 0.63). A large effect is ruled out (CI −0.05 to +0.08). A useful smaller effect cannot be determined.
- **Gold:** no evidence of an effect (p 0.96). A large effect is ruled out (CI −0.10 to +0.10). A useful smaller effect cannot be determined. The controls gave this outcome about a 45% chance for gold.

**In plain terms:** risk-adjusted overnight return is about the same whatever the volatility regime. Busier nights make and lose more in %, in proportion to their risk, and no more than that. This is the "constant risk premium" account the prereg expected. Neither the Moreira–Muir "falls" account nor the inventory-premium "rises" account shows up at the size this design can see.

## Described: buckets (gross %, per night)

**NQ** (base hit rate 55.0%)

| x bucket | Nights | Mean gross | Mean z | Hit − base | SD | Worst | Share of gross P&L | CFD net (2016+) | Futures net |
|---|---|---|---|---|---|---|---|---|---|
| Q1 quietest | 1,038 | 0.030% | 0.030 | −1.4pp | 0.60% | −3.4% | 20% | 0.031% | 0.014% |
| Q2 | 733 | 0.028% | 0.023 | +0.6pp | 0.64% | −2.9% | 13% | 0.022% | 0.012% |
| Q3 | 882 | 0.042% | 0.045 | +0.7pp | 0.80% | −3.2% | 24% | 0.014% | 0.026% |
| Q4 busiest | 850 | 0.077% | 0.036 | +0.4pp | 1.17% | −5.4% | 43% | 0.061% | 0.065% |
| x ≥ 0.90 | 403 | 0.090% | 0.037 | +0.3pp | 1.37% | −5.4% | 24% | 0.114% | 0.079% |

**Gold** (base hit rate 55.9%)

| x bucket | Nights | Mean gross | Mean z | Hit − base | SD | Worst | Share of gross P&L | CFD net | Futures net |
|---|---|---|---|---|---|---|---|---|---|
| Q1 quietest | 514 | 0.027% | 0.044 | −2.0pp | 0.57% | −2.8% | 11% | −0.008% | 0.011% |
| Q2 | 475 | 0.089% | 0.116 | +1.6pp | 0.64% | −3.0% | 36% | 0.053% | 0.075% |
| Q3 | 464 | 0.029% | 0.048 | −1.8pp | 0.84% | −5.4% | 11% | −0.008% | 0.016% |
| Q4 busiest | 509 | 0.098% | 0.073 | +2.1pp | 0.94% | −4.3% | 42% | 0.051% | 0.085% |
| x ≥ 0.90 | 266 | 0.085% | 0.057 | −0.2pp | 0.99% | −3.8% | 19% | 0.034% | 0.072% |

**Raw-% slope (scale effect).** Gross % on x:
- NQ +0.061% a night [−0.029, +0.146];
- gold +0.051% [−0.038, +0.146].

Both are positive, as predicted from scale alone, and both are inside noise.
- The busiest quarter carries 42–43% of gross P&L on 24–26% of nights, because those nights are bigger, not better.
- The gold quartile means zig-zag (Q2 and Q4 high, Q1 and Q3 low). That is not a pattern in vol.

## Described: costs across regimes (owner's request)

| | NQ CFD (2016+) | Gold CFD | Futures (1 tick a side + $5) |
|---|---|---|---|
| Spread, quietest → busiest | 0.006% → 0.008% (slope +0.002%, CI [0.000, +0.004]) | 0.020% → 0.029% (slope +0.011%, [−0.000, +0.027]) | — |
| Financing | 0.015% → 0.013% (slope −0.002%; tracks the rate era, not vol) | 0.015% → 0.018% (+0.004%) | none (in the price) |
| Total cost slope on x | **−0.000%** [−0.003, +0.003]: flat | **+0.015%** [+0.004, +0.029]: rises with vol | NQ −0.003%, gold −0.004% (higher prices in busy years make a tick a smaller %) |
| Cost as share of mean gross, Q1 → Q4 | 40% → 25% | 130% → 48% | — |
| Net (CFD) z slope | −0.013 [−0.096, +0.065] | +0.021 [−0.076, +0.119] | — |

**Reading:**
- On NQ, CFD costs don't depend on the regime.
- On gold, CFD costs do rise with volatility (spread widening). Gross rises too, so cost takes a **smaller** share of gross on busy nights.
- In gold's quiet buckets (Q1, Q3), CFD cost is larger than the gross edge, and the net is about zero or negative. Q2 is quiet too, yet strongly positive. So this is description, not a rule.
- Net conclusions match gross: no regime slope.

## Credibility checks (described only: §4.2 judges them only when Q1 is "yes")

| | NQ | Gold |
|---|---|---|
| A1 eras | 2009–16: +0.069 [−0.037, +0.187]; 2016–26: −0.028 [−0.110, +0.053]. Opposite signs, both within noise. | 2016–21: −0.010; 2021–26: +0.003, both ±0.14 |
| A2 top-10 \|z\| removed | +0.014 (4 nights flip the sign) | −0.019 (1 night flips it) |
| A3 without 2020 and 2022 | +0.028; leave-one-year-out range −0.007 to +0.031 | +0.014; leave-one-year-out range −0.027 to +0.023 |
| B1 quartile shape | 0.030 / 0.023 / 0.045 / 0.036: flat | 0.044 / 0.116 / 0.048 / 0.073: zig-zag |
| B2 with controls (prior 5-day return in σ, weekday) | +0.013; prior-5-day coefficient −0.002 | +0.001; prior-5-day coefficient +0.004 |
| B3 other vol definitions | EWMA +0.017, RV60 +0.041, intraday +0.041, all CIs include 0 | EWMA +0.008, RV60 −0.015, intraday +0.052, all CIs include 0 |

With a slope this close to zero, a handful of nights flips its sign (A2). That is what "no effect" looks like, not a fault.
- Year-by-year NQ slopes swing between −0.22 and +0.46 on about 200 nights each.
- Gold's swing between −0.65 and +0.47.
- The single-year view is noise. Only the pooled 17-year (NQ) and 10-year (gold) estimates mean anything.

Unconditional (now allowed): the NQ mean z is 0.024 in 2009–16 vs 0.042 in 2016–26. Gold is 0.061 vs 0.079. 243 NQ nights and 150 gold nights fall in the weeks when UK and US clocks are out of step; they were kept, as registered.

## What this establishes and what it doesn't

**Established:**
- Volatility regime (RV20 relative to its own past year, known at entry) does not move the overnight hold's risk-adjusted return by a large amount on either instrument.
- A regime **filter** (on/off by vol) has no basis. A useful quartile filter needs about 0.11–0.13 on NQ and about 0.20 on gold, and the CIs exclude those.

**Not established:**
- Whether a smaller effect of 0.05–0.08 exists. It can't be ruled out, and it would be worth only a few % of Sharpe even if known exactly (§5.2).
- Anything about absolute crisis volatility: 2008 is not in the sample, and x is relative to the past year.
- Anything about implied vol (VIX/GVZ), vol direction, or the cause of the edge.

**Pre-2016 NQ net** uses the futures cost model only, which is optimistic. Gross was primary.
