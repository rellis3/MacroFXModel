# vmc-nq-cipher: VuManChu Cipher B on NQ futures, results

Pre-registration: `forge/VMC_NQ_CIPHER_PREREG.md` (committed `cd802b4f` before any outcome). Spec and dataset:
`SPEC.md`. Seed 20261030.
- Discovery: trade dates 2016-01-04 → 2022-12-31.
- Validation: 2023-01-01 → 2026-08-20, opened once, after the survivors were frozen (`dce6ff36`).
- Lockbox (≥ 2026-08-21): not read.

**What was tested.** 24 event families × 8 timeframes (1m to daily) = 186 cells with events:
- WaveTrend crosses (all / after an extreme / mid-range);
- waves as objects (weakening, strengthening, weakening into a new extreme);
- Pine-faithful regular and hidden divergences on WT2, WT spread (the Cipher B "VWAP"), Money Flow and price-VWAP
  distance;
- WT2-vs-Money-Flow divergence;
- Money Flow zero crosses and weakening;
- full, partial and failed alignment of four components;
- lower-timeframe crosses with the higher timeframe agreeing or opposing;
- crosses that Money Flow led or opposed.

Each cell was scored on three outcomes over the next 12 bars of its own timeframe: signed return, a ±1σ√12 threshold
race, and the size of the range (volatility). Each was compared with a matched baseline (New York hour × volatility
tercile × the prior 12-bar move), so the effect is what VuManChu adds **beyond time of day, volatility level and the
recent move**. 20 shuffled NQ histories (bars permuted within each day, days permuted in 20-day blocks) priced both the
indicator's mechanics and the search itself.

## Verdicts

| Ledger id | Verdict | One line |
|---|---|---|
| `vmc-nq-cipher-direction` | **NULL** (1-5m powered; 15m and slower UNDERPOWERED) | Nothing in Cipher B shifts the direction of the next 12 bars beyond the baseline. 0 of 186 cells survived discovery on signed return; the 2 race survivors failed validation |
| `vmc-nq-cipher-volatility` | **VALIDATED** (small) | After a WaveTrend cross mid-range (\|wt1\| < 20), the next 12 bars' range is about 5-8% larger than the baseline, on 1, 3, 5 and 30m (validation t 3.7-5.6) |
| `vmc-nq-cipher-sequencing` | **VALIDATED** (property, no price consequence) | Money Flow turns shortly before the WaveTrend cross a little more often than the formulas alone produce (about 16.4% vs 15.7% of crosses), but crosses it led or opposed don't behave differently afterwards |
| `vmc-nq-cipher-interaction` | **NULL** | No combination survived validation (higher-timeframe agreement, MF-led crosses) |

## Discovery screen

| Outcome | Cells | BH q < 0.10 | + material | + same sign both halves | + beats every shuffle (95th pct) |
|---|---|---|---|---|---|
| Signed return R_12 | 186 | 5 | 0 | 0 | **0** |
| Threshold race | 186 | 17 | 2 | 2 | **2** |
| Range V_12 | 186 | 45 | 10 | 10 | **8** |

- **Screen-level gate:** 10 real survivors vs 0-5 in the shuffled histories (95th percentile 3.1): passed. The search
  found more than chance and mechanics produce.
- **Mirror check:** all 10 had bull and bear halves of the same sign.

What the hypotheses showed in discovery (12-bar signed return, 1m / 5m / 15m, matched effect in σ√12 units):

| Hypothesis | Family | Effect (t) | Read |
|---|---|---|---|
| H1 weakening waves reverse | F3w | −0.008 (−1.9) / −0.003 (−0.4) / +0.035 (2.3) | no; the 15m value is not BH-significant |
| H1 weakening into a new extreme | F3wL | −0.001 / +0.010 / +0.001 | no |
| H2 strengthening waves continue | F3s | +0.007 (1.9) / −0.000 / +0.008 | no |
| H3 cross after extreme vs mid-range | F1b vs F1c | 1m −0.009 vs +0.006; 5m +0.001 vs −0.010 | no direction difference; F1c changes **volatility** (below) |
| H4 reversal speed vs level at crosses | F1a partial rank corr. | speed −0.001 to +0.024; level −0.008 to +0.021 across timeframes | both ≈ 0; neither matters |
| H5 divergences (Pine, 4 series) | F4 | all \|effect\| ≤ 0.027, none material | null, as on the CFD |
| H6 WT2 vs Money Flow divergence | F5 | +0.000 / −0.006 / +0.010 | null |
| H7 Money Flow cross / weakening | F6z / F6w | ≤ 0.015 | null |
| H8 full alignment / failed alignment | F7f / F7x | +0.004 / +0.018 (2.3) / −0.008; F7x −0.007 / −0.002 / +0.004 | null |
| H9 HTF agreeing vs opposing | F8a / F8o | race 5m: F8o −2.0pp (t −3.5) in discovery, **−0.5pp (t −0.7) in validation** | failed validation |
| H10 MF-led vs MF-opposed crosses | F9 / F9n | race 5m: F9n −2.3pp (t −5.2) in discovery, **−0.7pp (t −1.2) in validation** | failed validation |

Volatility hints in discovery that weren't material (\|Δ\| < 5%) included the following. Read them as context only:
- regular and hidden divergences on WT2, MF and price-VWAP: +1.5% to +4.3% larger range;
- crosses after an extreme on 1m and 5m: −2.0% to −2.4%.

## Validation (frozen survivors, once; Holm α 0.05 one-sided)

| Cell | Discovery | Validation Δ [95%] | t | Verdict |
|---|---|---|---|---|
| V_12, 1m, mid-range cross (F1c) | +0.058 | **+0.048 [+0.032, +0.065]** | 5.6 | VALIDATED |
| V_12, 3m, F1c | +0.059 | **+0.060 [+0.039, +0.080]** | 5.6 | VALIDATED |
| V_12, 5m, F1c | +0.054 | **+0.054 [+0.030, +0.077]** | 4.5 | VALIDATED |
| V_12, 30m, F1c | +0.064 | **+0.078 [+0.038, +0.120]** | 3.7 | VALIDATED |
| Race, 5m, cross with HTF opposed (F8o) | −2.0pp | −0.5pp [−2.0, +0.9] | −0.7 | UNDERPOWERED (validation MDE 2.05pp) |
| Race, 5m, cross with MF opposed (F9n) | −2.3pp | −0.7pp [−1.9, +0.5] | −1.2 | NULL |
| V_12, 60m, regular WT2 divergence | −0.061 | −0.052 [−0.13, +0.02] | −1.3 | UNDERPOWERED |
| V_12, 60m, HTF agreeing (F8a) | −0.095 | −0.050 [−0.11, +0.01] | −1.7 | NULL |
| V_12, 60m, HTF opposed (F8o) | −0.082 | −0.040 [−0.09, +0.02] | −1.4 | NULL |
| V_12, 240m, MF-led cross (F9) | +0.134 | +0.025 [−0.06, +0.10] | 0.6 | NULL |

V_12 is in log units, so +0.05 ≈ a 5% larger range.

- **Interaction gate:** moot, because no combination passed validation. As descriptive context, the 60m F8 cells were
  below the best single component and below the plain cross, but they failed on their own.
- **Sequencing:** the share of WT crosses preceded within 10 bars by a same-direction MF zero cross is shown below,
  with the shuffle range alongside.

| | 1m | 5m | 15m | 60m |
|---|---|---|---|---|
| discovery, real (shuffle max) | 16.9% (15.9) | 17.5% (16.2) | 17.9% (16.3) | 16.0% (16.0) |
| validation, real (shuffle 97.5th) | 16.4% (15.9) | 16.4% (16.0) | 16.3% (16.3) | 15.0% (16.8) |

The gate passed: 4/4 timeframes in discovery, 3/4 in validation.

## Post-hoc checks on the volatility result (amendment A1; demote or describe only)

`posthoc_F1c.json`, validation period (Δ, t):

| Check | 1m | 3m | 5m | 30m |
|---|---|---|---|---|
| As registered | +0.048 (5.6) | +0.060 (5.6) | +0.054 (4.5) | +0.078 (3.7) |
| Major US releases removed (60 min before to 120 min after) | +0.040 (4.3) | +0.046 (3.9) | +0.036 (2.7) | +0.054 (2.3) |
| Recent 12-bar range added to the baseline | +0.034 (5.4) | +0.043 (5.9) | +0.036 (3.8) | +0.050 (3.2) |
| Mid-range bars **without** a cross | +0.041 (5.3) | +0.047 (4.3) | +0.043 (3.1) | +0.065 (2.3) |
| ... with the recent range added | +0.020 (3.5) | +0.028 (3.3) | +0.018 (1.8) | +0.025 (1.2) |

The effect is positive in every validation year, and in discovery every year except 2017 (−0.01 to −0.02) and the two weeks of 2015 at 30m. Removing the
top 1% of outcomes leaves +0.03 to +0.06. 4-12% of events sat near major releases.

**What that means.** The larger range is mostly about **WaveTrend sitting near zero**, i.e. price close to its short
average after the last swing has unwound. The cross itself adds about half on top. It survives the news and
recent-range controls, so it isn't just releases or volatility clustering. But it is a **small volatility tilt**,
about 3-5% more range than an otherwise similar bar, and it says nothing about which way.

## What this does and does not change

- **Direction:** on NQ futures, at the timeframes where the data has power (1-5m at a 0.03σ bar), none of these predict
  the direction of the next 12 bars beyond the baseline:
  - waves weakening or strengthening;
  - divergences (Pine-faithful, on every component);
  - Money Flow;
  - the Cipher B "VWAP" (WT spread);
  - full alignment;
  - higher-timeframe agreement;
  - Money Flow turning first.

  This matches the CFD work and closes these ideas for NQ. 15m and slower can't detect a 0.03σ effect with this
  history (UNDERPOWERED, not NULL).
- **Volatility:** a mid-range WaveTrend cross is followed by a slightly wider next hour or so (about +5%, about +3-4%
  after controls). At most it's a **stop-width / sizing nudge**, not an entry signal. It would need its own follow-up
  (cost and stop model, ES/GC replication, lockbox confirmation at ≥ 60 sessions with approval) before being used
  anywhere.
- **Sequencing:** Money Flow does tend to turn just before the WaveTrend cross, a little more often than formulas alone
  explain. But that ordering doesn't change what price does next, so "MF moved first" isn't a usable lead.
- **Limitations:**
  - one instrument;
  - the shuffle null keeps each day's net move, so daily and 4-hour cells have a weaker null;
  - 282 trade dates come from the owner's file rather than NinjaTrader (flagged per row);
  - the race and V_12 outcomes use the event timeframe's own bars (no intrabar ordering).
