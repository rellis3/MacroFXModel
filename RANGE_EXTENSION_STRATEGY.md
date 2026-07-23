# Asia Range-Extension Strategy — Design & Build Spec

> **Status:** built + tested in-sandbox on 10y of M1 (26 FX pairs + gold).
> This document is the complete, build-ready spec for the strategy **and** the
> honest record of what the test showed. It is written so another engineer/AI
> can rebuild or extend it without re-deriving anything. Read the **Verdict
> (§9)** before trading anything here.

---

## 0. One-paragraph summary

The "Range Extension Levels" method (Colez Trades) projects the **Asia session
range (00:00–06:00 London, on candle closes)** as multiples — 1×, 2×, 3× … out
to 10.5× — above and below the range, and treats far extensions as **exhaustion
zones** to fade (short above, long below), with the highest-probability levels
being **alignment zones** where today's and yesterday's extensions overlap
within ~2 pips. A single session prints **~30–45 levels**; trading all of them
is noise. This project builds the levels from the shared bricks, then adds the
one thing the raw method lacks: a **confidence brain** that scores each day's
levels on market **state** (vol regime, day-type, Asia-range wideness,
two-session alignment, extension distance) and trades only the **top-N** — and
that **chooses fade vs follow from state** instead of always fading. It is
validated as a strict A/B against the trade-everything baseline, on out-of-sample
per-trade expectancy, costs on.

**Why the skepticism is baked in:** the in-house POI backtest already faded
confluent levels across 26 pairs / 46,677 trades and returned **−0.016 R/trade,
Sharpe −3.43 (OOS −3.12)** — a coin-flip eaten by spread. "More levels / more
confluence" was *already* the loser. So this strategy is not "confluence
stacking"; it is **state-conditioning + selection**, and the bar it must clear
is OOS per-trade expectancy above the baseline **and** above breakeven-after-cost
— never a frequency-flattered Sharpe.

---

## 1. Data & session construction

| Item | Choice | Source brick |
|---|---|---|
| Price data | OANDA **M1**, per pair, packed arrays | `volBacktestM1Engine.loadM1ForPair` |
| Asia window | **00:00–06:00** (`sessionTz` = `utc` default, `london` DST-aware available) | `sessionRanges.buildAsiaSessions` |
| Range measure | **body** high/low (max/min of open&close) on **5m** candles — "closes = acceptance, not wicks" | `barUtils.bodyRange` |
| Extension ladder | `price = low + range × level`, level ∈ `FIB_LEVELS` (±0.25 … ±10.5) | `fibProjection.calcFibs` |
| Prior-session confluence | previous Asia session's ladder, nearest-level distance | `sessionRanges.prevSession` |
| Daily context | daily bars resampled from M1 (UTC days) for ATR & day-type | `rangeExtEngine.buildDailyBars` |

**Tradeable-ladder cap.** Only levels with `0.25 ≤ |mult| ≤ 4.0` are traded. A
4× Asia extension already ≈ a full expected daily range (Asia→day expansion is
~2–3.5× per the volatility notes), so beyond 4× the level is essentially
un-hittable intraday — projecting it is fine for charting, trading it is noise.
This is the **first** cut of the "14 levels is too many" problem, before any
scoring.

**No-lookahead guarantees.** Every state feature for trading day *D* uses data
**strictly before** *D*'s trade window: the ATR percentile and day-type score use
daily closes through *D−1*; the Asia-range-ratio uses the trailing 20 sessions
before *D*; the levels themselves are fixed at Asia close (06:00) and trades
resolve only on the post-06:00 path. The fill walker
(`forecastCore.walkBars`) is the causality-guarded one (SL-checked-first; a limit
fade's TP is not resolvable on its own fill bar).

---

## 2. The confidence brain (`js/rangeExtConfidence.js`)

A pure `score → choice` selector (the Lego "brain", not tunable legs). It takes
pre-computed numeric features and returns, per level, a **confidence ∈ [0,1]** and
a **direction (fade|follow)**; and per day, a **top-N selection**. Every constant
is a *prior* drawn from the education, exposed for ablation — none is fit to trade
outcomes.

### 2.1 Day context → trendiness → direction

```
trendiness = wDayType·|T|̂ + wVolRegime·volPct + wAsiaWide·asiaWide     (∈[0,1])
direction  = trendiness > followThresh ? 'follow' : 'fade'
```

| Feature | Meaning | Why (education) |
|---|---|---|
| `volRegimePct` | ATR percentile vs own trailing 252-day history (0=calm) | LOW vol → mean-reversion works (fade); HIGH vol → momentum (follow/skip) — *Volatility Intelligence* |
| `dayTypeT` | `dayTypeScore` = drift÷diffusion, trend-day-ness | trend day → don't fade the far side; range day → fade — *Forecaster / dayTypeCore* |
| `asiaRangeRatio` | today's Asia range ÷ trailing-median Asia range | wide Asia → directional day (follow); narrow → small day — *Volatility Intelligence L4* |

### 2.2 Level confidence

```
qGeom      = wMult·multScore(mult,dir) + wAlign·alignScore(align) + keyBonus
qFit       = (dir=='follow') ? trendiness : 1 − trendiness      // regime supports the action
confidence = wGeom·qGeom + wFit·qFit
```

- **`multScore` (fade):** soft bump peaking just beyond the range (~1.5×), with an
  added far-out penalty beyond 5× — reactions are expected to cluster near the
  range and thin out far away. **(follow):** rises with distance then saturates —
  reaching a far level is momentum, not exhaustion.
- **`alignScore`:** tight two-session confluence = 1.0, standard = 0.7, none =
  0.35 — the framework's "alignment zones are the highest-probability levels."
- **`keyBonus`:** small nudge for key multiples (0, ¼, ½, ¾, 1 …).

### 2.3 Selection (the anti-noise gate)

```
selectLevels(scored, {topN, minConfidence}):
   keep confidence ≥ minConfidence, sort desc, take topN
```

Default `topN = 3`, `minConfidence = 0.5`: **~14 candidates → ≤3 trades/day.**

---

## 3. Trade construction (fade & follow)

Both arms share identical geometry so the A/B isolates *selection + direction*.

| | **Fade** (reversion) | **Follow** (continuation) |
|---|---|---|
| Trigger | **limit** at the level | **stop** through the level |
| Side (above range) | **SELL** back toward range | **BUY** the up-break |
| Side (below range) | **BUY** back toward range | **SELL** the down-break |
| Stop-loss | `max(AsiaRange × slMult, minSlPips)` beyond the level | same distance, back inside the range |
| Target | **structural** (next ladder level toward profit − buffer) or **fixed R** | next extension level out, or fixed R |
| Fill/exit | `forecastCore.walkBars` on 5m bars, SL-first, mark-to-window-close if unresolved | same |

**Costs (on by default).** Round-trip friction as **% of price** — FX 0.012%,
commodity 0.020% (matches `forecastCore` / the POI baseline's cost basis for a
fair comparison) — plus **stop-entry slippage** (FX 0.006%) for follow trades.
Applied per trade in R units (`costR = costPrice / slDist`).

**R accounting.** `R = (signed price move to exit) / slDist − costR`. A stop-out is
≈ −1R; MAE/MFE are read from the **realised intra-trade path** (not close-only),
per the house MAE rule.

---

## 4. Risk management & sizing (spec for live; not what the backtest sizes)

The backtest measures per-trade **R**; a live deployment must add:

- **Vol-based sizing:** `size = risk$ / (slDist × pipValue)`, risk 0.5–1% equity,
  with a hard max-size cap (low-vol days must not lever up). ATR doubles → size
  halves.
- **Regime-scaled stops:** the education's 0.75× / 1.0× / 1.5–2.0× ATR for
  LOW/NORMAL/HIGH vol; the engine's `slMult` is the knob.
- **Hard invalidation:** the 75th-percentile daily range forecast is a principled
  "the day's move is done / wrong" stop — a vol-anchored max adverse excursion.
- **Portfolio:** cap concurrent correlated trades (26 FX pairs are not 26
  independent bets — the majors co-move); size by cluster, not by symbol.

---

## 5. Features NOT testable in this sandbox (design-complete, data-gated)

The education's strongest *directional* conditioners need external data the
sandbox lacks (OANDA mids only). They are specified here for a live build and
explicitly **excluded from the backtest claims** (no lookalike substitutes —
"data limits beat fake productivity"):

- **Options / gamma walls & max-pain** (CME OI → spot via basis; 3× wall-strength
  rule): a mechanistic confluence that explains *why* price stalls (dealer hedging
  fuel exhausts at the strike). The single highest-value *quality* add.
- **Rate-differential compass** (US–DE 2Y etc., spread momentum): fade *with* the
  spread, not against it. Needs FRED.
- **Risk-on/off state** (VIX, JPY/CHF, HY OAS) and the **catalyst calendar**
  (NFP/CPI/FOMC/OpEx/month-end): downgrade or skip fades into a Tier-1 print.
- **COT positioning extremes** (net non-commercial, OI-normalised, 3-yr
  percentile): crowded-in-the-direction-of-the-stretch = fade fuel.

A live system should add these as additional gates/weights in
`rangeExtConfidence`; the module's weight structure is built to accept them.

---

## 6. Code map (what was built, all bricks imported not copied)

| File | Role | Key exports |
|---|---|---|
| `js/sessionRanges.js` | **new brick** — London-DST + Asia/Monday session ranges (canonical home for the copies in `rangeFibEngine`/`asiaRangeEngine`) | `buildAsiaSessions`, `prevSession`, `dayStartEpoch`, `londonOffsetHours` |
| `js/rangeExtConfidence.js` | **new brain** — the selector | `dayContext`, `scoreLevel`, `selectLevels`, `DEFAULT_WEIGHTS` |
| `js/rangeExtEngine.js` | **new engine** — wiring + A/B + IS/OOS | `runPairRangeExt`, `runRangeExtBacktest`, `summarizeRangeExt` |
| `js/rangeExt.test.mjs` | unit tests (pure, synthetic) | — |

Imported baseplate: `barUtils` (M1 hot path), `fibProjection` (ladder),
`forecastCore.walkBars` (fill walker), `dayTypeCore.dayTypeScore`,
`indicatorCore.atrWilder`, `statsCore.rollingPercentile`,
`metricsCore.summarizeTrades`, `instrumentRegistry` (pip/class).

Route: `POST /api/range-ext/run` + `GET /api/range-ext/status/:jobId` (async-job
pattern). Page: `range-ext-backtest.html` (dark, 3 CSV exports, IS/OOS + A/B card).

---

## 7. Validation protocol (how the claim is judged)

1. **A/B, identical geometry.** Baseline = every tradeable level, framework-fade,
   no selection. Treatment = brain (top-N + fade/follow). Only selection+direction
   differ.
2. **Metric = per-trade expectancy (R) and win-rate**, not annualised Sharpe (a
   low-frequency version of a negative rule flatters Sharpe — the exact trap the
   VuManChu gate fell into).
3. **Chronological IS/OOS** (60/40). Treatment must beat baseline on **OOS**
   expectancy **and** clear breakeven-after-cost, with **≥30 OOS trades**.
4. **Disaggregate** by multiple / alignment / regime / day-type / zone before
   declaring any null — pooled nulls hide subset edges. But **count the cells and
   report t-stats** (multiple testing: a few "winners" among dozens of slices is
   what noise does; the bar is |t|>3, not >2).
5. **Pre-registered outcomes:**
   - *Worked* = OOS expectancy > 0, above baseline, ≥30 OOS trades, IS-consistent.
   - *Didn't* = OOS expectancy ≤ 0 or ≤ baseline, or only frequency reduced.

---

## 8. Results (2016–2025, 26 FX + gold, M1, costs on)

Universe: **294,091** ALL-fade trades (every tradeable extension level). All
numbers per-trade **R**, chronological 60/40 IS/OOS. `t` = expectancy / SE.

### 8.1 The base method is a strong loser everywhere

| Slice | OOS n | OOS exp | OOS t |
|---|---:|---:|---:|
| **All levels (baseline)** | 112,156 | **−0.115 R** | −34.5 |
| best multiple bucket (0.25–0.75×) | 28,526 | −0.091 R | −13.7 |
| worst multiple bucket (3–4×) | 15,312 | −0.160 R | −17.5 |

**0 of 26 pairs** have positive baseline expectancy. Every feature bucket
(multiple, alignment, regime, day-type, zone) is negative. This *extends* the
in-house POI null (−0.016 R) rather than overturning it.

### 8.2 Three findings that refute the framework's own claims

- **Two-session "alignment zones" do NOT help — they hurt.** Among the top picks,
  `alignment=none` levels return **+0.31 R** while `tight`/`strong` aligned levels
  are **negative**. The framework's headline "highest-probability = alignment
  zones" claim is contradicted on 10y of data. (Confluence-stacking was already
  the POI loser — consistent.)
- **"Follow" (breakout continuation) is actively harmful.** Auto fade+follow OOS
  = −0.31 R vs fade-only −0.15 R. Following far Asia-extension breaks loses.
- **Near-range + BUY-side asymmetry:** the least-bad fades are `mult<1` (+0.29 R
  on top picks) and the **below-range/BUY** side (+0.13 R vs above/SELL −0.02 R).

### 8.3 The brain works as a RANKER — but there's no edge to concentrate

The confidence ranking is genuinely discriminative and **geometry-robust**:

| Selection | OOS exp (RR 1.5) | OOS exp (RR 1.0) |
|---|---:|---:|
| all levels | −0.115 R | −0.118 R |
| **top-1 / pair-day (flat 0.012% cost)** | **+0.050 R (t 7.3)** | **+0.041 R (t 6.9)** |
| top-3 / pair-day | −0.058 R | — |

top-1 ≫ top-3 ≫ all, at both RR — the selector orders levels correctly and
concentrates whatever signal exists into the single best pick.

**But it dies under honest costs.** Re-costed with realistic per-pair retail
spreads (majors ~0.8–1.6 pip, crosses ~2.5–5 pip, gold ~$0.50):

| Selection | OOS exp | OOS t | verdict |
|---|---:|---:|---|
| **top-1 / pair-day** | **+0.017 R** | **+2.38** | below the \|t\|>3 bar; full-sample t = 1.13 |
| top-3 / pair-day | −0.093 R | −21.4 | negative |

And the per-pair survivors after realistic cost are **exactly the wide-spread
crosses** (EURAUD/AUDJPY/GBPNZD ≈ +0.15 R) where the spread assumption is least
reliable; the **tight majors are flat-to-negative** (EURUSD −0.01, GBPUSD −0.01).
That is the signature of a **cost-model artifact**, not alpha.

---

## 9. Verdict

**Null for tradeable edge — with real, reusable findings.** Pre-registered bar
(OOS expectancy > 0, > baseline, \|t\| > 3, ≥30 OOS trades, IS-consistent): the
selection **does not clear it**. Pooled top-1-after-realistic-cost is +0.017 R at
t = 2.4 (full-sample t = 1.1), and its per-pair positives sit precisely where the
cost model is least trustworthy.

What is **honestly true and kept**:
1. The **confidence brain ranks correctly** — top-1 ≫ top-3 ≫ all-levels,
   geometry-robust, no-lookahead. It answers the user's question ("14 levels is
   too many"): selection *does* order the levels and concentrate the signal into
   the best 1–2. It flips pooled expectancy from −0.15 R to ≈ breakeven.
2. The raw range-extension method has **no edge for the ranker to concentrate** —
   even the single best level per day is only ~breakeven after honest costs.
3. **Alignment zones are refuted; follow is refuted; the base is a loser
   everywhere** — these are durable negative results, not noise.

**Do not trade this as-is.** The only honest path to a *positive* version is to
add the conditioners the sandbox can't test (§5) — a **mechanistic** confluence
(gamma/OI walls, which explain *why* a level holds), the rate-spread directional
compass, and the catalyst calendar — and re-run this exact A/B harness. Those are
different claims that must be proven on their own data; nothing here says they
will work. What this build delivers is the **honest harness + the brain** ready
to test them, and the clear evidence that geometry + confluence alone is a coin
flip the spread eats.

*(Reproduce: `POST /api/range-ext/run` or `node` the engine directly; the
disaggregation scripts are in the PR description.)*
