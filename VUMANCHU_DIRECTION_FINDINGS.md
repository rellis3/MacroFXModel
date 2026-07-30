# VuManChu → direction: what was tested, and what it showed

**Date:** 2026-07-30 · **Data:** OANDA M15, 2025-07-01 → 2026-07-29 (13 months,
~26,900 bars/instrument, 100% volume coverage) on EUR/USD, GBP/USD, USD/JPY,
XAU/USD, plus 330k M1 EUR/USD bars for the multi-timeframe work.
**Params:** the operator's own VuManChu — WaveTrend 9/12/3, bands ±53, divergence
gates +45/−65 — verified against his Pine source.
**Cost benchmark:** 0.69bp ≈ 0.8 pip EUR/USD round trip (normal hours).
**Method:** Spearman rank IC vs forward return, `statsCore.blockBootstrapIC` for
the autocorrelation-aware null, 70/30 IS/OOS split by date, outcomes
pre-registered before each run.

> **One-line summary.** The VuManChu family describes structure well and does not
> predict direction at intraday horizons. Every representation tested lands at
> |IC| ≈ 0.02–0.05, uncalibrated, below the spread. The apparent "cycle" that would
> make it a timing model is a property of the indicator's smoothing filter, not of
> the market — a random walk produces the identical cycle length.

---

## 1. The headline: the WaveTrend "cycle" is the filter, not the market

The most attractive idea in the research plan was cycle timing — *"average cycle is
N candles, we're N−1 in, so a reversal is due."* That is only meaningful if the
**hazard rate** rises with age (a tight-looking average is compatible with a
memoryless process where age tells you nothing).

Measured properly, the wt1×wt2 cross cycle *does* look regular: mean 5.7–5.9 bars,
**CV 0.62–0.65 on all four instruments**, IS and OOS, with a visibly rising hazard
(rank corr 0.67–0.99). That passes the pre-registered structural bar.

Then the control test: run the same measurement on a **pure random walk**.

**Mean cross-cycle length (bars) / CV, by smoothing parameters:**

| params | EUR/USD | GBP/USD | USD/JPY | XAU/USD | **RANDOM WALK** |
|---|---|---|---|---|---|
| 9/12/3 (operator) | 5.1/0.74 | 5.1/0.74 | 5.1/0.75 | 5.1/0.74 | **5.1/0.72** |
| 10/21/4 (stock) | 6.7/0.76 | 6.6/0.76 | 6.6/0.77 | 6.5/0.76 | **6.7/0.75** |
| 9/12/8 | 8.1/0.64 | 8.0/0.65 | 8.2/0.65 | 8.1/0.65 | **8.2/0.65** |
| 9/12/16 | 10.9/0.67 | 11.0/0.66 | 10.7/0.67 | 11.0/0.67 | **11.1/0.67** |
| 9/30/3 | 5.9/0.83 | 5.8/0.83 | 5.9/0.82 | 5.9/0.81 | **6.0/0.82** |

Every column matches, **including random noise**, and the cycle length moves with
the signal-line period exactly as filter theory predicts (sp 3→8→16 gives
5.1→8.1→10.9 bars). WT1 is an EMA and WT2 an SMA of that EMA; two smoothed series
of the same data cross at a frequency set by their periods.

**So "we are 17 candles into an 18-candle cycle" is measuring the smoothing
constants. You would get the same statistic from coin flips.** Identical behaviour
across four unrelated instruments *and* synthetic noise is the signature.

### The other two phase types

| phase | mean | CV | hazard | reading |
|---|---|---|---|---|
| `wt_cross` (wt1×wt2) | ~5.8 | 0.62–0.65 | rising | filter artifact (above) |
| `wt_zero` (wt1 vs 0) | ~16 | 0.86–0.93 | **flat** (corr −0.11 to 0.21) | memoryless — age tells you nothing |
| `mf_run` (MFI sign) | 22–26, median 7 | **1.51–1.66** | **falling** (corr −0.63 to −0.70) | over-dispersed |

Two things worth keeping:

- The ~16-bar `wt_zero` cycle is the one closest to the "≈18 candles" figure people
  quote — and it is the **memoryless** one. Age carries no information there.
- **Money Flow runs behave the opposite way to intuition.** The hazard *falls* with
  age, so a long-running green MFI is **less** likely to flip than a fresh one.
  "It's been green a while, it's due to turn" is backwards.

Economics failed regardless: the old-phase fade (top age quintile, hold 4 bars)
came in under cost on EUR/USD both halves, and flipped sign on XAU/USD
(IS +0.881bp → OOS −2.102bp).

---

## 2. Multi-timeframe agreement adds nothing

Anchored on M15, comparing M5/M3/M1 back to it, the honest test is
**conditional vs unconditional** — a subsample of a positive signal is positive for
free, so "the conditional is positive" proves nothing.

Best incremental t-stat across all 40 cells: **−1.13 IS / +0.48 OOS** (`hist`),
**−1.89 IS / +1.32 OOS** (`slope`). None reaches ±2, and **signs flip between IS and
OOS**. Adding agreeing timeframes also shrinks the sample 15.5k → 3.9k bars for
nothing.

**"Check when 1m/3m/5m/15m VWAP go in the same direction" is degenerate as usually
meant.** A session/cumulative VWAP is near timeframe-invariant: M1- vs M15-computed
VWAP differ by max **115 ppm**, slope-direction agreement is **100.0%** at every
timeframe, and its slope sign flips only **twice in a whole session**. You will
essentially never see 3/4. Only a **rolling-window** VWAP varies meaningfully
(all-agree 59% vs a 40% baseline), because the window scales with the timeframe.

Cipher B's yellow line is **`wt1 − wt2`**, confirmed from the Pine (`wtVwap = wt1 -
wt2`; the input is even labelled *"Show Fast WT"*). It is not a volume-weighted
average price. Multi-timeframe agreement on it: **18.0% vs an 18.9% baseline —
delta −0.9pp**, i.e. chance.

---

## 3. Every component measures the same thing

13 months, EUR/USD M15. Correlation against the WaveTrend level:

| component | corr vs `-wt1` | IC h=16 IS | IC h=16 OOS |
|---|---|---|---|
| RSI(14) | 0.90 | 0.050 | 0.009 |
| rolling-VWAP distance | 0.87 | 0.042 | −0.005 |
| rolling-VWAP slope | −0.80 | −0.036 | 0.020 |
| session-VWAP distance | 0.73 | 0.041 | 0.012 |
| **MFI (faithful Pine)** | **0.46** (0.01 vs `wt1−wt2`) | −0.039 | −0.061 |
| WaveTrend hist | −0.18 | −0.005 | −0.003 |

A VWAP is a volume-weighted moving average; WaveTrend is price-versus-an-EMA. Both
are *"price relative to its recent average"*, hence the collinearity. An
equal-weight composite (zero fitted parameters) **lost to the best single component
in all 6 cells**.

**There is no confidence score to output.** Calibration at h=16 was non-monotonic in
both halves; OOS the *strongest* quintile paid **0.03bp against 0.69bp cost**; hit
rates sat at 48–52% throughout.

---

## 4. Money Flow: the formula matters, and ours was wrong

VuManChu's Pine:

```pine
f_rsimfi(_period, _multiplier, _tf) =>
    sma(((close - open) / (high - low)) * _multiplier, _period) - rsiMFIPosY
// period 60, multiplier 150, offset 2.5
```

**It uses no volume.** `vumanchuCore.computeMoneyFlow` multiplies by volume, uses
EMA(14) not SMA(60), and peak-normalises — Spearman **0.39** between the two. The
old one was also near-degenerate in practice: **90% of its values sat inside ±2**.
An earlier "Money Flow is null" result here measured that near-constant series and
should be disregarded.

Corrected as `computeMoneyFlowVMC` (the original is retained unchanged because
`js/vumanchu.js → assessEntry` feeds the live level-bot alerts). Retested, the
faithful MFI is **the best single feature found**:

- h=4 (1h): **IC −0.034 IS (bootstrap p=0.013), −0.050 OOS (p=0.017)** — the only
  cell in the whole study significant in both halves with a consistent sign.
- Near-**independent** of the WaveTrend histogram (0.01).

**And it still fails.** Per-quarter decile spread over five sub-periods:
**−0.30, +1.73, −0.68, +0.04, +1.67 bp** against 0.69bp cost — the sign flips and two
of five periods carry the whole effect. IS spread (0.25bp) is *under* cost while
only OOS clears.

The plan's Stage 3 question — *does price reverse after MF weakens, or after it
changes colour?* — **neither**. Every discrete-event framing (zero crosses, colour
flips, green-but-weakening) flips sign IS→OOS. The continuous level holds what
little signal exists.

---

## 5. Two artifacts caught before they became "findings"

**`computeVWAP().osc` looked like the exception** — IC −0.141/−0.154 at h=96, nearly
uncorrelated with WaveTrend. It measures price against a VWAP **cumulative from bar
0 of whatever window you pass**, so it is window-dependent (same final bar: −47.62
on 13 months vs −48.97 on 6) and its peak normalisation uses whole-series data.
Rank-invariant, so it did not fabricate the IC — but it is not reproducible live,
and an IC growing with horizon is the signature of a slow level tracking the
sample's own drift. The session-anchored version sits at 0.004–0.068 like
everything else. **`vumanchuFadeEngine` consumes this series.**

**The session split produced a "significant" cell that is almost certainly cost
model error.** At h=16, Late (21–24 UTC) gave IS 6.49bp / OOS 9.53bp, p=0.003. But
the edge appeared *only* in the two thinnest-liquidity sessions (Late, Asia) and
vanished in all three liquid ones (London, Overlap, NY). The 0.69bp cost is a
normal-hours spread; at rollover EUR/USD routinely goes several pips. Untested
until re-run with a time-of-day spread.

---

## 6. One mechanism worth remembering

Why oscillators feel far more predictive than they test. Taking every deeply
oversold episode (wt1 < −53) and waiting for the oscillator to return to the middle:

- **353 episodes, price went up as expected 67.1% of the time** — looks excellent.
- Mean price move: **+1.32bp**, barely over the 0.69bp spread.
- Mean move of the moving average over the same episodes: **−9.70bp**.

**The oscillator reset because its reference line came down to price, not because
price went up to the line.** A 67% hit rate that pays nothing. Overbought is the
same in mirror (price −0.18bp, average +10.45bp).

---

## 7. What this does not rule out

- **Longer horizons**, where drift and carry accumulate against a fixed spread. The
  repo's own evidence fits: the trend basket is modest-but-real and the yield-spread
  bot is the best factor here — both slow, both keeping price scale.
- **Magnitude rather than direction** — far more tractable, and what the vol
  forecaster already does well.
- **Event timing.** COG demonstrably works around scheduled data (his Stage 2
  clusters at 13:30–14:00 UK = 08:30–09:00 ET, stop set *after* the 08:30 print). A
  named time like "around 12:30" is more likely calendar-driven than cycle-counted,
  and `calendar_events.csv` (2014–2026) is already local to test it.
- **The oscillator as a timing tool for a direction sourced elsewhere** — which is
  what discretionary use of it actually is.

## 8. Reproduce

Scripts live in the session scratchpad (not committed): `agreement_test.mjs`,
`followup.mjs`, `osc_vs_momentum.mjs`, `composite.mjs`, `full_vuman.mjs`,
`mfi_retest.mjs`, `mfi_econ.mjs`, `hazard.mjs`, `filter_test.mjs`. Data was pulled
from `/api/ohlc-range` (M15 + volume) and `/api/vol-backtest/candles/:pair` (M1).
All measurement primitives are existing bricks — `statsCore.rankIC`,
`statsCore.blockBootstrapIC`, `entropyCore.mutualInformation` — nothing bespoke.
