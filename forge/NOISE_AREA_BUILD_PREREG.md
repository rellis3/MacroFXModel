# noise-area-build: build our own strategy from the "Beat the Market" theory, choose it walk-forward, and test it against the paper's fixed rule

**Pre-registered 2026-11-16, before any scan outcome was computed.** The paper's fixed rule is already known on all
five instruments (`noise-area-momentum`, `noise-area-momentum-spy`, banked 2026-11-13/15): SPY 1.17 net in 2007–2024
and 0.20 after publication, NQ 1.23, ES 0.45, YM ≈ 0, RTY −0.79, and the decomposition says hold-to-close carries most of
the edge and the VWAP stop adds little. This prereg is written knowing those numbers. That is why the scored cells are
**walk-forward** (every traded year is chosen from earlier years only), not a best-in-sample pick.

| | |
|---|---|
| ID / ledger ids | `noise-area-build` (B1: tuned build beats the paper's fixed rule out of sample), `noise-area-build-wf` (B2: the tuned build is profitable out of sample) |
| Parent | `forge/NOISE_AREA_MOMENTUM_PREREG.md`, `forge/NOISE_AREA_MOMENTUM_SPY_PREREG.md` (data, bands, VWAP, costs, sizing reused) |
| Branch | `main` |
| Data | the parents' day matrices: SPY IBKR 1-min 2007-01 →; ES/NQ/YM/RTY NT8 1-min 2016-01 → (repaired, CFD fill only on the 36–43 days NT8 lacks). Daily VIX close: `analysis/output/rangebook/cboe/VIX.csv`. Last session **2026-08-21** (lockbox). |
| Seed | `20261116` |
| Uncertainty | ISO-week-clustered bootstrap, B = 2,000; BH q = 0.10 within each of B1 and B2 (5 instruments each) |
| Scripts / outputs | `scripts/noise-area-build/` → `analysis/output/noise-area-build/`; page `noise-area-momentum.html` gains a **Build** section |

## 1. The theory, as a design space

The paper's mechanism: each minute of the day has a normal distance from the open (the noise area). Price outside it
means someone is moving the market, and the move tends to carry on into the close. Everything below is a choice the paper
fixed and we are free to vary.

| Knob | Values | Paper |
|---|---|---|
| Band width (× mean abs move) | 0.75, 1.0, 1.25, 1.5 | 1.0 |
| Days that set the band | 7, 14, 28 | 14 |
| Check every | 15, 30, 60 minutes (first check 10:00 ET) | 30 |
| Exit | `vwap` (paper: out when back through VWAP or inside the band) · `band` (out only when back inside the band) · `trail` (once in, hold while on the right side of VWAP) · `hold` (first signal held to the close, no stop) · `flip` (always in once triggered, reverse at the other band) | vwap |
| Day filter (known before the open) | `none` · `vix_hi` (prior VIX close above its trailing 252-day median) · `vix_lo` (below it) · `nr4` (prior cash-session high–low the narrowest of the last 4) | none |
| Sizing | `1x` · `vt` (2% daily vol target, cap 4×, as the paper) | both |

4 × 3 × 3 × 5 × 4 × 2 = **1,440 designs per instrument**, 7,200 in all. All exits flat at the close. Entry needs price
beyond the band at a check and (for vwap/trail/hold) on the same side of VWAP, as the paper. Fills at the check bar's
close.

**Costs (realistic, not the paper's):** SPY $0.019/share round trip (the paper's $0.009 + half a cent of spread each
side); futures 1 tick each side + $4.50 round trip (ES 0.59, NQ 0.725, YM 2.9, RTY 0.29 points), as the parent.

**Paper's fixed rule (the benchmark):** 1.0 / 14 / 30 / vwap / none / 1x, at the same costs.

## 2. Choosing a design (no peeking)

**Plateau score:** a design's score is the median net Sharpe of itself and its neighbours one step away in band width,
days and check interval (same exit, filter and sizing; up to 27 designs). This picks the middle of a good region, not a
lucky spike. Ties go to the design nearest the paper's.

**Walk-forward:** at the start of each calendar year Y, score every design on all of the instrument's days before Y
(at least 3 years of history) and trade the best plateau design through Y. SPY: Y = 2010 … 2026 (to 08-21). Futures:
Y = 2019 … 2026. The chained years are the out-of-sample record.

## 3. Scored cells (per instrument; 5 each, BH q = 0.10)

**B1 `noise-area-build`**, does tuning beat the fixed rule: difference in annualised net Sharpe, walk-forward build
minus the paper's fixed rule over the same out-of-sample days, week-cluster bootstrap.
VALIDATED if the 95% CI is above 0 after BH and both halves of the walk-forward years are positive.
NULL if the CI top is below **+0.30** (tuning adds less than 0.3 Sharpe). Otherwise UNDERPOWERED.

**B2 `noise-area-build-wf`**, is the build profitable: walk-forward net Sharpe.
VALIDATED if the mean-return CI is above 0 after BH and both halves positive. NULL if the Sharpe CI top is below
**0.50**. Otherwise UNDERPOWERED.

Power (rough, SE of an annual Sharpe ≈ 1/√years): SPY 16.6 years → SE ≈ 0.25, MDE ≈ 0.70; futures 7.6 years → SE ≈ 0.36,
MDE ≈ 1.0. Futures B1/B2 are likely UNDERPOWERED unless the effect is large. The Sharpe-difference SE is smaller when the
two return streams correlate.

## 4. Described only (not scored)

- The full design map per instrument over the paper's window (2007-05/2016-01 → 2024-04): Sharpe by knob, the plateau,
  the best single design and its **deflated Sharpe** (Bailey & López de Prado, N = 1,440 trials).
- The design chosen on the whole paper window, then traded 2024-05 → 2026-08-21 (post-publication holdout, ~2.3 years,
  underpowered by construction).
- Which knobs the walk-forward keeps choosing (stability), and an equal-risk book of the five walk-forward streams.
- Each knob's marginal effect (median Sharpe with the knob at each value, others free).

## 5. What it does NOT test

- Any design outside the grid above (no further knobs added after results).
- The paper's RSI conditioner (not a pre-open filter as we read it).
- Anything after 2026-08-21.

## Amendments

## RESULTS

Run 2026-11-16 (`analysis/output/noise-area-build/RESULTS.md`). B1 `noise-area-build`: SPY UNDERPOWERED (+0.02 [-0.37, 0.39]), ES NULL (-0.48), NQ NULL (-0.64), YM UNDERPOWERED (+0.26), RTY VALIDATED (+1.11, but build -0.15 vs paper -1.27): headline NULL, tuning does not beat the paper's rule. B2 `noise-area-build-wf`: SPY VALIDATED (0.69 [0.20, 1.12], halves 0.82/0.57), ES/NQ/YM/RTY UNDERPOWERED. No amendments.
