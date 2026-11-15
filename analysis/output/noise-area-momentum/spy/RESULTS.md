# noise-area-momentum-spy — results

Prereg: `forge/NOISE_AREA_MOMENTUM_SPY_PREREG.md` (pushed 2026-11-15 in `5a752d8b` before any SPY outcome; amendment
A1 PRE-RESULTS in `b3f7b3b0`). Run 2026-11-15, seed 20261115, B = 2,000 (ISO-week clusters), permutation null 200 draws.
Data: IBKR SPY (ARCA) 1-minute TRADES bars, regular hours, unadjusted, 2007-01-03 → 2026-08-21 used (4,998 days pulled,
0 days under 200 bars, the 185 missing weekdays are exchange holidays). Ledger ids: `noise-area-momentum-spy` (S1),
`noise-area-momentum-spy-post` (S2). Page: `noise-area-momentum.html` (SPY is the default instrument).

## Verdict

- **S1 `noise-area-momentum-spy`: VALIDATED.** The paper's band + VWAP rule, 1x, on SPY over the paper's own window
  (May 2007 → Apr 2024), net of the paper's $0.009/share round trip: **net Sharpe 1.17 [0.76, 1.56]**, mean
  **3.6 bp/day [2.2, 4.9]**, above all 200 shuffled-minute histories (null mean 0.01, 97.5th pct 0.29), halves
  **1.34 / 0.98**. This is in-sample for the paper: it says the published result reproduces on independent bars and
  survives a null the paper did not run. It is not out-of-sample evidence.
- **S2 `noise-area-momentum-spy-post`: UNDERPOWERED** (as the prereg expected). Vol-targeted, May 2024 → 21 Aug 2026,
  573 days: **net Sharpe 0.20 [−1.27, 1.40]**, mean 1.1 bp/day [−6.1, +8.7], beats 92% of shuffled draws (bar 97.5%),
  halves **1.27 / −0.76**. Not NULL: the CI top 1.40 is above the 0.66 bar. The point estimate is far below the paper's
  1.33, and the second half (Jun 2025 → Aug 2026) is negative.

## Did we rebuild the paper? (mechanics, reported not scored)

| S1, net of the paper's cost | Ours | Paper | Gap |
|---|---|---|---|
| V2 band + VWAP, 1x: Sharpe | 1.17 | 1.24 | −0.07 |
| V2 total return | 334% | 380% | |
| V2 trades | 3,834 round trips | 7,668 | exactly 2×: the paper counts fills |
| V3 vol-targeted: Sharpe | 1.26 | 1.33 | −0.07 |
| V3 CAGR / MDD | 18.6% / 26.6% | 19.6% / 25% | |
| V1 opposite band, 1x: Sharpe | 0.59 | 0.61 | −0.02 |
| V3 monthly returns vs FAQ Q24 table | ρ = **0.97** over 116 months (2016-01 → 2025-08) | | |

**Reproduces** by the pre-registered test (|Sharpe gap| ≤ 0.25 on V2 and V3, monthly ρ ≥ 0.8). The trade count matching
to the trade says the entries and exits are the same; the small Sharpe gap is data (IB bars vs theirs) and rounding.

## Is S1 concentrated? (strong-result check)

- Leave one year out (V2 net, S1): Sharpe stays between **0.98** (without 2008) and **1.27** (without 2016 or 2020).
- Without 2008 **and** 2009: **0.94**. 2016-01 → 2024-04 alone: **0.95**.
- Year table (V3 net): positive in 16 of 18 calendar years 2007–2024 (2010 flat at +0.5%); losing years 2016 (−14%) and 2017 (−7%).
  2025 −3%, 2026 to Aug −5%.
- By σ tercile (V2): low 1.09, mid 1.05, high 1.20. It is not a high-vol-only effect; the bp per day is larger when vol
  is high (2.0 / 2.4 / 5.1 bp).

## Which part works (decomposition, S1 + S2, gross, first entry of each day)

| Part | bp/day | halves | Null pct |
|---|---|---|---|
| Entry: 30 min after the first entry | +0.87 | 0.53 / 1.21 | 97.0% |
| Hold: first entry held to 16:00, no stop | **+4.63** | 6.48 / 2.71 | **100%** |
| Stop: what the band + VWAP exits add | +1.19 | 0.70 / 1.69 | 79.5% |

As on ES/NQ: the money is in holding a band breach to the close; the stop is mainly a risk tool. Time of day: the last
two half-hours carry the most (+0.66 and +1.11 bp/day gross), the 12:30–13:30 slots are flat or negative (the paper's
lunch pause).

## Described (not scored)

| Variant, net of paper's cost | S1 Sharpe | S2 Sharpe | All | S1 gross | S1 + ½¢ spread each side |
|---|---|---|---|---|---|
| V1 opposite band, 1x | 0.59 | 0.36 | 0.56 | 0.66 | 0.50 |
| V2 band + VWAP, 1x | 1.17 | 0.03 | 1.06 | 1.32 | 1.01 |
| V3 vol-targeted | 1.26 | 0.20 | 1.13 | 1.44 | 1.06 |
| V4 | 1.11 | 0.11 | 0.99 | 1.26 | 0.96 |
| V5 | 1.15 | 0.01 | 1.04 | 1.29 | 0.99 |
| V6 | 1.41 | 0.52 | 1.29 | 1.57 | 1.23 |
| V7 | 1.44 | 0.48 | 1.32 | 1.58 | 1.28 |

Buy and hold SPY over the same days: Sharpe 0.53, MDD 56%. Cost averages 0.43 bp per trading day at the paper's rate in
S1 (more in 2008–09, when SPY was cheap per share). Adding half a cent of spread each side takes S1 V2 from 1.17 to 1.01:
the edge survives a realistic retail fill on SPY.

**SPY vs ES on the same days** (V2 1x, 2,654 common days 2015-12-28 → 2026-08-21; ES from the repaired NT8 data):

| | Gross Sharpe | Net Sharpe | Cost, bp/day |
|---|---|---|---|
| SPY at the paper's $0.009/share | 0.83 | **0.74** | 0.23 |
| ES at 1 tick each side + $4.50 | 0.98 | **0.41** | 1.51 |

Daily returns correlate **0.95**. ES is the same trade and slightly better gross; the whole gap is cost, about six times
more per day on ES at a market-order fill. Over these years SPY's net 0.74 is below its 2007–2024 1.17, because 2016–17
lost money and 2025–26 is flat.

## What this changes

- The paper's SPY result is real on independent bars and beats a shuffled-minute null by a wide margin over 2007–2024.
  That moves the family from "matches on NQ only" to "reproduces on the paper's own instrument".
- It does not make the rule a live candidate. After publication the SPY record is 0.20 with a negative second half, and
  the CI is too wide to say whether it has decayed. The next step stays a pre-registered forward paper record (SPY and
  NQ), judged on its own pre-set bar, not money.
- ES at futures costs (0.45 net) is the same strategy as SPY (ρ 0.95 daily); the difference is cost per trade, not the
  market. A cheaper fill (passive entries, or trading the ETF itself) is the lever, not a different signal.

## Limitations

- PrevClose not dividend-adjusted (about 4 ex-dividend days a year carry the dividend in the gap).
- Fills at the decision bar's close, fractional shares, no borrow cost, no latency, as the paper.
- IB bars, not the paper's vendor; IB's ETF session runs 15 minutes past the close (dropped, A1).
- S1 is the paper's own sample, so S1 VALIDATED is a reproduction, not out-of-sample evidence.
