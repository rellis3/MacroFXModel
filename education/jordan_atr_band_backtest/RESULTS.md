# ATR-Band Mean-Reversion Entry Backtest — Gold & NQ, 2016–2026

A mechanised, honestly-pinned formalisation of a genuinely **dynamic**
band-touch entry — basis EMA ± k×ATR, recalculated every bar, regime-gated
by ADX — built as a *distinct idea from*, not a re-run of, this repo's
existing `education/jordan_impulse_range_backtest/` null result.
Engine: [`js/atrBandEntryV1Engine.js`](../../js/atrBandEntryV1Engine.js).

---

## What this is and isn't, and why it exists alongside a sibling null

**Isn't:** a reconstruction of Jordan's screenshotted "test" posts (dated
13-14 Aug 2026, tagged `@C.OG`). `education/jordan_impulse_range_backtest/
RESULTS.md` already re-read those same screenshots and found a better-
supported explanation than a custom band tool: the colored rectangle is
almost certainly TradingView's built-in Long/Short Position drawing tool — a
manual per-trade entry/stop/target annotation, not a computed indicator. See
`education/jordan_video_transcripts/JORDAN_VIDEO_INSIGHTS.md`'s Priority
Watch section for the full reasoning. That file's mechanised version of the
visible pattern (impulse leg + EMA cross + range-exhaustion gate + pullback,
continuation-direction) was run honestly on 10.4 years of M1 data on both
instruments and found **null on every variant tried** (best case NQ Sharpe
−0.10 at the most extreme gate setting).

**Is:** a separately-motivated, mechanically distinct idea — floated
independently of the screenshots, from the group's own stated framework
across several video transcripts (`JORDAN_VIDEO_INSIGHTS.md`): a genuine
rolling ATR-band, regime-gated by ADX (the group states ADX(4H) ~30 as the
mean-reversion/trend threshold), used to define an intraday mean-reversion
entry zone. This is worth testing **on its own merits**, not as a rescue
attempt for the impulse-range null — it uses a moving-average basis instead
of a fixed prior range, a continuously-recalculated ATR band instead of
fixed Fib/extension ratios, and an ADX regime gate instead of a range-
exhaustion percentile gate. Different enough that the existing null does not
settle it either way.

---

## The rule, exactly as pinned (every judgment call named)

| Element | Mechanised as | Pinned choice |
|---|---|---|
| Basis (band centerline) | `indicatorCore.ema` of M1 close | EMA(20) — a moving average, not a fixed session range, is what makes this band genuinely dynamic |
| Band width | `indicatorCore.atrWilder` | ATR(14), Wilder-smoothed — the same ATR variant already used for stop sizing elsewhere in this repo's transcript-derived material, reused for consistency rather than introducing classic stdev with no transcript support |
| Entry zone | price closes beyond basis ± `zoneMult`×ATR, but inside ± `extremeMult`×ATR | `zoneMult = 2.5`, `extremeMult = 4.0` (beyond that: "in discovery", no fade — mirrors the group's stated behaviour of not fading many multiples beyond a reference range) |
| Regime gate | `indicatorCore.adxWilder` on 4H-resampled bars, **built once over the full history** (not per-day — Wilder ADX(14) needs ≥30 completed 4H bars of warmup; a per-day context window never warms up, an early build of this engine got exactly this wrong and silently returned zero trades — see Known limitations) | ADX(14) on 4H, read causally from the most recently *completed* 4H bar; fade only when ADX < `adxMax = 30` (the group's stated threshold) |
| Confirmation | the bar that first exits the zone is not tradeable itself; the very next bar must close back toward basis (reversal) before an entry is placed | "don't enter on a level touch, enter on a confirmation of the level holding" (`MD files/ZONE_TRADE_DECISION_FRAMEWORK.md` Layer 7) |
| Fill | guaranteed fill at the bar-after-confirmation's OPEN, via `forecastCore.walkBars` with `entryType:'stop'` | no lookahead, no same-bar limit-fill ambiguity — identical pattern to the sibling engine |
| Stop | beyond the confirmation bar's own extreme (the side away from basis) + `slBufferAtrMult`×ATR | `slBufferAtrMult = 0.25` — same buffer convention as the sibling engine, "beyond recent market structure" |
| Target | the basis (EMA) itself | a genuine mean-reversion target, not a fixed RR — kept as the baseline per the minimal-DOF-first rule; a fixed-RR variant was not built (natural next follow-up) |
| Trade cadence | one trade/day, first qualifying setup | matches this engine family's existing convention |

No lookahead: EMA/ATR are causal running series over each day's own 1-3 day
context window (only need a few hours of M1 warmup); ADX is a single
full-history series built once, read only from the most recently *completed*
higher-timeframe bar as of the evaluation bar, never the still-forming one.
Costs on: 0.020% round-trip for gold, 0.010% for the NQ/NAS100 proxy — same
figures the sibling engine and the wider POI engine family use.

---

## Data

Identical sourcing to the sibling engine, for direct comparability:
- **Gold (XAU/USD):** `VolRangeForecaster/data/m1/gold_m1.parquet` via R2, 2016-01-04 → 2026-06-05.
- **Nasdaq:** OANDA's `NAS100_USD` CFD proxy, `portfolioBacktest/cache/nq_m1.parquet` via R2, same window. No real CME NQ/MNQ futures data exists anywhere in this repo (`js/instrumentRegistry.js`).

---

## Headline result — null on both instruments at baseline settings

Baseline (zoneMult=2.5, adxMax=30), costs on, true 60/40 IS/OOS split:

| Instrument | Trades | Win% | PF | Expectancy (%/trade) | Sharpe (full) | Sharpe (IS) | Sharpe (OOS) | Max DD (%) | Buy&Hold Sharpe |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| Gold | 2,203 | 33.6% | 0.416 | −0.0200 | **−4.842** | −4.900 | **−4.859** (n=882) | −44.4 | +0.82 |
| NQ (NAS100) | 2,289 | 37.4% | 0.611 | −0.0112 | **−2.667** | −2.955 | **−2.272** (n=916) | −25.9 | +0.81 |

Both trade ~215-220/year. IS and OOS Sharpe sit close together and both
negative on both instruments — this is not an overfit-then-broke pattern
(there was never an edge to break); it's a rule with no edge, consistently,
across the whole 10-year window. Low win rate (33-37%) with the target set
at the basis (EMA) rather than a tighter fixed distance is the mechanical
driver: price frequently hits the ATR-buffered structural stop before
completing the reversion back to the mean.

### Sensitivity — the ADX gate is doing real work here (unlike the sibling's range gate)

```
GOLD                                    n     win%    PF     Sharpe(full)  Sharpe(OOS)
  baseline (zone=2.5, adxMax=30)      2203   33.6%  0.416      -4.842        -4.859
  zone=1.5, adxMax=30 (tighter zone)  2199   29.3%  ~0.38      -5.626        -4.745
  zone=3.5, adxMax=30 (wider zone)    1926   33.2%  ~0.44      -3.393        -3.346
  zone=2.5, adxMax=20 (tighter regime)1084   32.3%  ~0.40      -3.642        -4.608
  zone=2.5, adxMax=100 (gate OFF)     3055   33.5%  ~0.40      -5.490        -5.826
  zone=3.5, adxMax=20 (combined)       924   33.1%  ~0.41      -2.377        -3.511
  zone=3.5, adxMax=15 (combined)       320   31.3%  ~0.39      -1.551        -1.537
  zone=3.5, adxMax=10 (sample too thin — n=8 OOS, excluded from claims)

NQ                                      n     win%    PF     Sharpe(full)  Sharpe(OOS)
  baseline (zone=2.5, adxMax=30)      2289   37.4%  0.611      -2.667        -2.272
  zone=1.5, adxMax=30 (tighter zone)  2222   39.4%  ~0.58      -2.936        -2.967
  zone=3.5, adxMax=30 (wider zone)    2120   36.0%  ~0.66      -1.550        -1.041
  zone=2.5, adxMax=20 (tighter regime)1095   37.4%  ~0.62      -1.668        -0.927
  zone=2.5, adxMax=100 (gate OFF)     3159   37.4%  ~0.61      -2.755        -2.727
  zone=3.5, adxMax=20 (combined)       982   35.9%  ~0.63      -0.894        -0.365
  zone=3.5, adxMax=15 (combined)       328   38.4%  ~0.60      -0.372        -0.115
  zone=3.5, adxMax=10 (sample too thin — n=12 OOS, excluded from claims)
```

**Turning the ADX gate fully off makes both instruments worse** (gold OOS
−4.86→−5.83, NQ OOS −2.27→−2.73) — unlike the sibling engine's range-
exhaustion gate, which "almost never actually binds" as coded. This one
does real, direction-consistent work: as the regime gate is tightened
(lower `adxMax`, more strictly ranging-only) and the entry zone is widened
(higher `zoneMult`, fewer/cleaner touches), **both instruments improve
monotonically and consistently** — the same "closest-to-breakeven-but-never-
crosses-it" shape the sibling engine's own `RANGE_GATE_FLIP.md` follow-up
found. The best setting with a still-trustworthy sample
(`zone=3.5, adxMax=15`, n=128/132 OOS, comfortably above the ≥30-trade OOS
floor this repo requires) reaches **gold Sharpe −1.55 (OOS −1.54), NQ Sharpe
−0.37 (OOS −0.12)** — still losers, NQ close to breakeven, neither crossing
into positive Sharpe. Pushing further (`adxMax=10`) collapses the sample to
8-12 OOS trades — well under the reliability floor — and is excluded from
any claim rather than reported as an improvement.

---

## Reading this against the rest of the repo

A second, independently-mechanised formalisation of "wait for a level/band,
confirm with a regime filter, trade the reaction" — this time with a
genuinely dynamic ATR band and a moving-average basis instead of a fixed
prior range — lands in the same place as `jordan_impulse_range_backtest`
and `poiReactionV1Engine` (`education/coleztrades_poi_backtest/`): **null,
IS-consistent-with-OOS, improved but never rescued by tightening the gate.**
Three independently-built, honestly-run mechanisations of "wait for a
level/band/impulse, confirm with a filter, trade the reaction" now land in
the same shape of result on this repo's data. That's a real pattern worth
noting, not proof the underlying discretionary skill has no edge (a human
executing this kind of setup brings judgment none of these three capture —
choosing which touch is high-quality, reading order flow, skipping bad-
context days, adjusting size) — but it does mean naive mechanisations of
"structural level + confirmation filter" keep coming back empty on this
repo's FX/gold/NQ-proxy M1 data.

**One genuine, worth-noting difference from the sibling**: this engine's
regime gate (ADX) is doing real, monotonic, direction-consistent work —
the sibling's range-exhaustion gate "almost never actually binds." That's
evidence the *type* of gate matters even when neither rescues the rule.

---

## Known limitations

- **A real bug was caught and fixed before this result was trustworthy.**
  The first build computed ADX(4H) from each day's own 1-3 day context
  window — far too short for Wilder ADX(14)'s ≥30-completed-bar warmup, so
  `adxWilder` silently returned an all-zero series, the gate read `null`
  forever, and the engine produced **zero trades** on real data. Per this
  repo's "assume code failure first, not that the alpha is invalid" rule:
  this was audited before any null was reported. Fix: build the ADX(4H)
  series once over the full instrument history (not per-day), then do a
  causal, no-lookahead lookup against that one series inside the day loop.
  Left as an explicit note here in case the same shape of bug (a regime
  filter that needs more warmup than the per-day context window provides)
  recurs in a future engine.
- **rMult can be numerically extreme** on individual trades (worst observed:
  gold −180R) when the structural stop (confirmation-bar extreme + small ATR
  buffer) happens to sit very close to entry — a near-zero risk denominator.
  Checked against the sibling engine, which exhibits the same pattern more
  severely (worst observed there: −544R) using the identical stop-
  construction convention — this is a known, already-accepted property of
  ATR-buffered *structural* stops in this backtest family, not a defect
  unique to this engine. Confirmed it does **not** contaminate the reported
  Sharpe/PF/win-rate figures, which are computed from `netPct` (price-
  percentage return), never from `rMult`.
- **Cannot verify the specific screenshotted trades** — same sandbox
  limitation as the sibling (OANDA fetch 403 locally, R2 cache ends
  2026-06-05, ~10 weeks before the screenshots) — moot here regardless,
  since this engine was never meant to reconstruct those specific trades.
- **Target = basis only** — no fixed-RR variant was tested; a natural
  follow-up given the low win rate observed here.
- **One trade/day, first qualifying setup** — not relaxed/tested here
  (the sibling's own multi-trade-per-day follow-up found relaxing this
  just realises more of the same negative-edge trades faster).
- **VWAP-as-basis variant not tested** — the Synthesis section of
  `JORDAN_VIDEO_INSIGHTS.md` flagged VWAP as a second basis candidate
  (Husky treats VWAP the same directional-bias way the EMA basis is used
  here); only the EMA basis was built and run.
- **Continuation-in-trend variant not tested** — transcript 6 shows the
  group switching from fading a far level to buying a near-level pullback
  when ADX is elevated, rather than skipping the day entirely (this
  engine's v1 baseline). That switch was deliberately deferred as a
  follow-up per the minimal-DOF-first rule, not built into the baseline.

---

## Reproduce (fade mode)

```bash
npm install   # hyparquet etc. aren't vendored; needed once per environment
node education/jordan_atr_band_backtest/scripts/run_one.mjs gold education/jordan_atr_band_backtest/data
node education/jordan_atr_band_backtest/scripts/run_one.mjs nq   education/jordan_atr_band_backtest/data ./portfolioBacktest/cache
# sensitivity: run_one.mjs <pair> <outDir> <m1DirOrEmpty> <zoneMult> <adxMax>
node education/jordan_atr_band_backtest/scripts/run_one.mjs gold education/jordan_atr_band_backtest/data "" 3.5 15
```

Per-trade logs: `data/{label}.trades.json`. Summary cards (full/IS/OOS +
buy-and-hold benchmark): `data/{label}.summary.json`.

---

## Part 2 — the continuation variant (the "other half"), also null

The Known Limitations above flagged one deliberate gap in the v1 baseline:
"the continuation-in-trend variant... transcript 6 describes the group
actually using" (buy a near-level pullback when ADX is elevated, instead
of skipping the day) was never built. Built and tested now:
`runAtrBandContinuation` in the same `js/atrBandEntryV1Engine.js` file
(reuses `buildDaily`, `atrWilder`, `ema`, `buildCausalAdxLookup`,
`walkBars`, `maeFromPath` — no new brick, one shared core).

### The rule, exactly as pinned

| Element | Mechanised as | Pinned choice |
|---|---|---|
| Trend bias | the same FAR touch trigger as the fade mode (price closes beyond basis ± `zoneMult`×ATR) | its direction sets the bias — stretched above basis = uptrend, below = downtrend, instead of being faded |
| Regime gate | `adxAt` (the same causal ADX(4H) lookup) | **opposite** of the fade mode: proceed only when ADX ≥ `adxMinTrend` (30 default) — trending, not ranging |
| Pullback level | basis ± `nearMult`×ATR, `nearMult` (1.5 default) < `zoneMult` | Husky's own description: "a near/low-multiple extension as a pullback-buy" (video 6) |
| Confirmation | the wick-then-engulf two-candle pattern (video 14): one bar wicks into/through the near level without closing beyond it, the next bar fully engulfs that bar's range and closes beyond its extreme, in the trend direction | the literal, separately-logged confirmation technique — more precise than the fade mode's single-bar reversal check |
| Fill | guaranteed fill at the bar-after-confirmation's OPEN (`walkBars`, `entryType:'stop'`) | identical no-lookahead pattern to the fade mode |
| Stop | beyond the two confirmation bars' own extreme + `slBufferAtrMult`×ATR | same buffer convention as the fade mode |
| Target | basis ± `extremeMult`×ATR — the SAME "in discovery" outer band already defined in cfg | reuses an existing constant instead of inventing a fresh fixed-RR number, per the minimal-DOF-first rule |
| Trade cadence | one trade/day, first qualifying setup | matches the fade mode |

**Sanity-checked on synthetic data before touching real data**: an
engineered day (sharp stretch → wick-dip → engulfing reclaim → rally)
correctly produced a BUY with TP above entry and SL below — direction and
ordering verified before trusting real-data output.

### Data

Same sourcing as Part 1: gold (`VolRangeForecaster/data/m1/gold_m1.parquet`),
NQ/NAS100 proxy (`portfolioBacktest/cache/nq_m1.parquet`), plus 8 major FX
pairs (`eurusd gbpusd usdjpy audusd usdcad eurjpy gbpjpy nzdusd`) for
broader coverage than Part 1 tested — 10 instruments total.

### Headline result — null, and unlike Part 1, a genuine negative gross edge

Baseline (`nearMult=1.5`, `adxMinTrend=30`), costs on, true 60/40 IS/OOS split:

| Instrument | Trades | Win% | Sharpe (full) | Sharpe (OOS) |
|---|--:|--:|--:|--:|
| Gold | 593 | 36.4% | −2.468 | −2.168 (n=238) |
| NQ (NAS100) | 648 | 40.1% | −0.974 | −1.656 (n=260) |
| EURUSD | 726 | 25.8% | −4.699 | −4.461 (n=291) |
| GBPUSD | 644 | 38.0% | −2.833 | −2.940 (n=258) |
| USDJPY | 628 | 34.6% | −3.211 | −2.461 (n=252) |
| AUDUSD | 559 | 35.8% | −3.033 | −3.075 (n=224) |
| USDCAD | 729 | 24.1% | −5.678 | −5.962 (n=292) |
| EURJPY | 604 | 38.4% | −2.878 | −2.883 (n=242) |
| GBPJPY | 641 | 39.8% | −2.783 | −2.889 (n=257) |
| NZDUSD | 584 | 37.8% | −3.389 | −3.203 (n=234) |

**Pooled**: full n=6,356, mean/trade −0.0137%, t=−25.2; OOS n=2,548,
mean/trade −0.0141%, t=−16.1. **0/10 instruments OOS-Sharpe-positive.**

Unlike Part 1's fade baseline and both VWAP nulls in this repo (all of
which show pooled **gross** ≈ 0, i.e. "no edge either way, cost alone
tips it negative"), this continuation variant's **pooled gross mean is
−0.00118%/trade — genuinely negative before costs**, not indistinguishable
from zero. The wick-then-engulf continuation entry isn't a coin-flip that
loses to friction; on this data it's mildly anti-predictive on its own.

### Sensitivity — every variant tried stays solidly negative

```
                          n(OOS)   Sharpe(full)   Sharpe(OOS)
gold   baseline (n=1.5,a=30)  238      -2.468        -2.168
gold   n=2.5, a=40 (tighter)   38      -1.715        -1.927
gold   n=1.0, a=30 (wider)    326      -2.894        -1.922
eurusd baseline (n=1.5,a=30)  291      -4.699        -4.461
eurusd n=2.5, a=40 (tighter)   50      -2.573        -2.853
eurusd n=1.0, a=30 (wider)    331      -3.455        -2.475
```

No parameter direction rescues it, and none approaches breakeven the way
Part 1's ADX-tightening sensitivity did — this isn't a "getting warmer"
shape, it's flat-out negative across the tested range.

### Reading this against the rest of the file

The "other half" Husky describes — trade continuation instead of skipping
the day when ADX is elevated — closes as a **second, independently null**
result, and a more decisively negative one than the fade half: the fade
mode's gate at least did real monotonic work even though it never crossed
into edge; this continuation mode shows no such improvement path across
the variants tried, and unlike this repo's other VWAP/ATR-band nulls, it
has a genuine (small) negative gross edge rather than a coin-flip erased
by cost. The wick-then-engulf confirmation — the most literal, separately-
logged "how do you time the click" technique in this transcript material —
does not produce a tradeable entry trigger on its own in this construction.

### Known limitations (Part 2)

- **Confirmation logic is the specific pinned reading of "wick rejection
  then engulfing candle"** — a stricter or looser definition (e.g.
  allowing partial-range engulfs, or requiring a close beyond a further
  distance) was not swept.
- **Target = extremeMult×ATR is one specific choice** among several
  reasonable options (a fixed-RR target, or the prior far-touch level
  itself) — not swept here.
- **Trend bias is read from a single far-touch event**, not a
  higher-timeframe trend filter (e.g. price vs. a longer EMA, or ADX
  direction) — a different trend-detection method was not tried.

### Reproduce (continuation mode)

```bash
node education/jordan_atr_band_backtest/scripts/run_continuation.mjs gold   education/jordan_atr_band_backtest/data
node education/jordan_atr_band_backtest/scripts/run_continuation.mjs nq     education/jordan_atr_band_backtest/data ./portfolioBacktest/cache
# sensitivity: run_continuation.mjs <pair> <outDir> <m1DirOrEmpty> <nearMult> <adxMinTrend>
node education/jordan_atr_band_backtest/scripts/run_continuation.mjs gold   education/jordan_atr_band_backtest/data "" 2.5 40
```
