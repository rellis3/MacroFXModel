# Reversion vs Continuation at Forecast Levels — Concept Note

> A design-basis note for the hardest problem in the forecast-level system: when
> price reaches a projected band (median or 75th-percentile high/low), do we
> **fade** it (mean-revert toward the expected close) or **follow** it
> (continuation/breakout)? This note frames the problem, reconciles the
> median-vs-75p question, surveys the relevant theory, and proposes a concrete,
> testable design before any building.
>
> Companion to `TRADABILITY_REVIEW.md` and the honest forecast harness
> (`js/honestForecastEngine.js`, `honest-forecast-harness.html`).

---

## 1. The Problem, Precisely

The forecast indicator draws, off the daily open and a vol forecast σ:

| Level | Engine term | Meaning | Role in the trade |
|---|---|---|---|
| Proj H/L **med** | `HL_50` = 1.572·σ | median daily high/low | exhaustion **zone** (high traffic) |
| Proj H/L **75p** | `HL_75` = 2.049·σ | 75th-pct daily high/low | exhaustion **extreme** (tail) |
| Close **med** | `OC_50` = 0.6745·σ | typical close displacement | fade **target** |
| Close **75p** | `OC_75` = 1.150·σ | 75th-pct close displacement | extended close |

The textbook trade is: price tags **Proj H/L 75p → fade → cover at Close med**.
It works on range/exhaustion days and **fails on trend days**, where price walks
*through* the median to the 75p and beyond (e.g. NAS100 −1.56% on 27 Jun vs clean
fades on EURUSD/EURJPY the same day). Always-fade therefore fails out-of-sample:
it fades the wrong days. The task is a **confidence / day-type classifier** that
decides fade vs follow per setup.

---

## 2. Median vs 75p — Reconciled

These are two points on a **frequency-vs-quality curve**, not better/worse:

- **Conditionally** (price is at the level now): the 75p has a base-rate
  tailwind — ~75% of days don't close beyond it vs ~50% at the median. Higher
  win rate.
- **Unconditionally** (where do all reversals cluster?): the **median is the
  centre of mass** of the daily-extreme distribution, so more reversals happen
  near it. Higher frequency — but a ~50/50 base rate and a *smaller* reversion
  target (worse R:R).

**Conclusion:** both bands are fadeable. The median is the high-traffic node
where the classifier carries the edge; the 75p is the lower-frequency, higher-
quality node with a built-in base rate. We should **not** pre-commit to one band
— the day-type score should *select* the band and the action (see §5).

---

## 3. The Unifying Frame: Drift vs Diffusion

The bands come from the **range distribution of driftless Brownian motion**
(Feller 1951 — the source of the `1.572` / `2.049` constants). That gives the
clean theoretical statement of the whole problem:

- **Driftless** path (range day) → the bands are genuine statistical extremes →
  **fade**.
- **Drift-dominated** path (trend day) → the range distribution shifts right, the
  band is just a waypoint → **follow**.

So reversion-vs-continuation reduces to one estimable quantity: **today's
intraday signal-to-noise ratio — drift ÷ diffusion** (an intraday drift t-stat).
Every classifier below is just a different estimator of that quantity. Build the
estimator and the band/action fall out of it.

---

## 4. Toolkit & Literature (grouped by what they estimate)

### A. Econometric regime tests (cheap, computable, no extra data)
- **Variance Ratio test** — Lo & MacKinlay (1988). VR<1 mean-reverting, ≈1
  random walk, >1 trending. A direct intraday regime readout.
- **Hurst exponent / R-S analysis** — H<0.5 revert, >0.5 persist. *Already a
  feature in `backtestSystem` ("Hurst regime") — repurpose it here.*
- **Ornstein–Uhlenbeck + half-life of mean reversion** — fit OU to the intraday
  path; short half-life = strong pull back to the level (fade), no reversion
  speed = drift (follow). Ref: Ernie Chan, *Algorithmic Trading*. Half-life is a
  single tradable number.
- **ADF / unit-root** on the intraday series — stationary ⇒ mean-reverting regime.

### B. Practitioner day-typing (most directly "at a level")
- **Toby Crabel — opening-range / volatility-contraction** (*Day Trading with
  Short-Term Price Patterns & Opening Range Breakout*). Core law: contracted
  early range → expansion/continuation day; over-extended early move → reversal
  day. NR7, "the stretch," vol contraction/expansion.
- **Market Profile / TPO (Steidlmayer) — Initial Balance & day types** (Normal,
  Normal-Variation, **Trend**, Double-Distribution, Neutral). The taxonomy *is*
  a reversion/continuation classification. Rule: extends beyond the first-hour
  initial balance **and holds** → trend day (follow); pokes out and returns →
  fade. The most useful practitioner lens here.
- **Mark Fisher — ACD method** (*The Logical Trader*) — opening range + A/C
  points to decide fade vs follow at a level.

### C. Microstructure (true exhaustion — needs intraday/volume)
- **Order-Flow Imbalance & absorption** — Cont, Kukanov & Stoikov. Exhaustion =
  price reaches the band but aggressive flow dries up / flips (absorption);
  continuation = flow keeps lifting. The momentum oscillator on the charts
  (VuManChu/WaveTrend) is a low-resolution proxy.
- **Cumulative Volume Delta (CVD) divergence** at the level — price new high,
  delta lower high ⇒ exhaustion.
- **VPIN** — Easley, López de Prado & O'Hara — order-flow toxicity spikes precede
  directional (continuation) moves.
- **Kaufman Efficiency Ratio** — net move ÷ Σ|moves|; ≈1 clean trend (follow),
  ≈0 chop (fade). *`backtestSystem`'s QMR chop-fade already uses trend
  efficiency — same idea, ideal as a day-type gate.*

### D. Modern ML — the most direct fit
- **Meta-labeling** — López de Prado, *Advances in Financial Machine Learning*.
  Built for exactly this: keep the forecast-level fade as the **primary** signal;
  train a **secondary** model to predict "will this fade work?" → that
  probability **is** the confidence score, and it sets size. **Triple-barrier
  labelling** gives clean labels (did it hit the reversion target before the
  stop?). If we do one quant technique on this, it's this.
- **Fractional differentiation** (same book) — stationary, memory-preserving
  features for the classifier.

### E. Horizon caveat (academic)
- **Lehmann (1990)** short-term contrarian profits; **Jegadeesh (1990)** 1-month
  reversal ⇒ short horizons mean-revert. **Jegadeesh–Titman (1993)** ⇒ trends
  persist at longer horizons. Lesson: reversion and continuation live at
  *different timescales*, so the classifier must be horizon-aware — a 5-min
  stretch into the band can revert even on a daily trend day.

---

## 5. Proposed Design (the testable hypothesis)

A two-layer model, reusing components already in the repo.

### Layer 1 — Day-type score `T` ("trend-day-ness" = drift/diffusion estimate)
A single continuous score in [−1, +1] blending estimators of the same quantity:
- **Kaufman Efficiency Ratio** (intraday, e.g. last N 5-min bars)
- **ADX / DMI** (trend strength + direction)
- **Hurst** (persistence) — reuse the backtestSystem feature
- **Range-budget consumed at the tag** = realized H-L ÷ forecast H-L when the
  band is touched (low budget used + at band ⇒ something is driving it ⇒ trend)
- **Opening-range / gap** signal (Crabel): contracted open ⇒ expansion bias;
  extended early move ⇒ reversal bias
- **Intraday drift t-stat** (the direct estimator)

### Layer 2 — Band/action selection driven by `T`
| `T` (trend-day-ness) | Action |
|---|---|
| Low (range day) | **Fade the median** (high traffic; classifier carries it) — target Close med |
| Mid | **Fade the 75p only** with an exhaustion trigger (CVD/WaveTrend divergence) — target Close med |
| High (trend day) | **Do not fade.** Optionally **follow** the 75p break in the trend direction |

The **exhaustion trigger** (microstructure/oscillator divergence) is the entry
*timing* at the chosen band; `T` is the *gate* that picks band + action. This
dissolves the median-vs-75p debate — the score selects, we don't pre-decide.

### Layer 3 (optional, later) — Meta-label
Once Layers 1–2 define a setup, train a secondary classifier on history
(triple-barrier labels) to output a calibrated success probability → confidence
→ position size.

---

## 6. How We Validate (non-negotiable)

Everything goes through the **honest forecast harness**, under its existing
discipline — realistic fills (breach-and-reclaim + slippage), full costs, and a
true in-sample / out-of-sample split. Specific gates:

1. The **day-type-gated** fade must beat **always-fade** on **OOS Sharpe**, not
   just in-sample.
2. It must do so on a **non-trivial OOS trade count** (≥30/segment) — filtering
   inflates win rate while shrinking sample; the harness must show enough trades
   survive to trust the edge.
3. The microstructure/oscillator trigger needs **intraday (5-min) data** — this
   is the one piece that forces a 5-min feed into the harness (currently D1).

If the gated fade doesn't clear (1) and (2), the honest conclusion is that the
edge isn't there at daily resolution and we either move to intraday or drop it.

---

## 7. Immediate Next Steps (in order)

1. **Build the day-type score `T`** from components already in the repo
   (efficiency ratio + ADX + Hurst + range-budget) — daily-resolution first.
2. **Add a `gated` entry mode** to the honest harness that uses `T` to pick
   band/action per §5, and compare it head-to-head against `fade` / `follow` /
   `regime` on OOS Sharpe + trade count.
3. If daily-resolution `T` shows separation, **add the 5-min feed** and the
   exhaustion trigger; otherwise stop and re-think.
4. Only after a daily edge is demonstrated, **layer meta-labeling** for
   confidence/sizing.

---

## 8. Reading List (priority order)

1. **López de Prado — *Advances in Financial Machine Learning*** (meta-labeling,
   triple-barrier, fractional diff) — most directly applicable.
2. **Toby Crabel — *Day Trading with Short-Term Price Patterns and ORB*** —
   day-type / expansion-vs-reversal from early session.
3. **Steidlmayer / Dalton — Market Profile (Initial Balance, day types)** —
   practitioner reversion/continuation taxonomy.
4. **Lo & MacKinlay (1988), "Stock Market Prices Do Not Follow Random Walks"** —
   variance-ratio regime test.
5. **Ernie Chan — *Algorithmic Trading*** — OU process, half-life of mean
   reversion, practical mean-reversion vs momentum.
6. **Cont, Kukanov & Stoikov — order-flow imbalance & price impact** —
   microstructure exhaustion.

---

*This is a design-basis note, not a spec. The aim is to agree the framing and the
validation bar before building Layer 1.*
