# Macro Deep Dives — Study Notes

> **Course:** Colez Trades — Quantitative & Macro Insights
> **Module:** Macro Deep Dives — standalone frameworks and live applications:
> regime detection, the rates–FX lead-lag, business-sentiment signals, reading the options complex.
> **Lessons covered so far:** 1 (Macro Drivers, Regime Detection & Validation),
> 2 (The Transatlantic Yield Spread), 3 (Live Case Study: The Spread Moved First).
> **Purpose of this file:** my own learning notes — summaries, key points to memorise,
> exam-style self-test questions, research ideas, and how each concept maps onto this
> repo (MacroFXModel) for real-time implementation.
> **Note-taking discipline:** every claim from the lessons is tagged where possible as
> **[replicated]** (documented in academic/practitioner literature), **[plausible mechanism]**
> (sound economic logic, needs my own validation), or **[folklore/anecdote]** (one example
> or practitioner heuristic — treat as hypothesis only). This mirrors the house rules in
> `CLAUDE.md` — a lesson slide is not evidence.

---

## Lesson 1 — Macro Drivers, Regime Detection & Validation

### 1.1 The six macro driver families

Macroeconomic variables are the "currents" that move all asset prices. The lesson's taxonomy:

| Driver | What it captures | Key series |
|---|---|---|
| **Growth expectations** | Risk appetite, earnings expectations | GDP, employment, industrial production, leading indicators |
| **Inflation dynamics** | Real returns, CB policy, nominal-vs-real asset preference | CPI, PCE, wage growth, breakevens |
| **Monetary policy** | Liquidity conditions, discount rates | Fed funds, QE/QT, forward guidance, global CB coordination |
| **Liquidity conditions** | Availability of capital | M2 growth, bank reserves, credit spreads, funding markets |
| **Risk sentiment** | Aggregate risk appetite / mean-reversion potential | VIX, credit spreads, safe-haven flows, positioning |
| **Global flows** | Cross-border dynamics, relative valuations | Capital flows, FX, trade balances, reserve accumulation |

**Memorise:** Growth, Inflation, Policy, Liquidity, Sentiment, Flows — *"GIPLSF"*.
Growth and inflation are the two that define the regime quadrant (§1.3); the other four
modulate how the regime expresses itself.

### 1.2 The yield curve as economic barometer

- **Term spread** = `Yield(10Y) − Yield(2Y)`.
- Curve shape encodes market expectations of growth, inflation and policy:

| Shape | Implication | Lead time | Favoured assets |
|---|---|---|---|
| Steep (normal) | Expansion, positive carry | — | Cyclicals, banks, duration |
| Flat | Transition/uncertainty | 6–12 months pre-slowdown | Quality, cash |
| **Inverted** | Recession signal, cuts expected | **12–24 months pre-recession** | Duration, defensives; avoid cyclicals |
| Bear steepening | Rising long rates, inflation fear | — | Commodities, TIPS; avoid growth |
| Bull steepening | Cuts arriving, early recovery | — | Risk assets, small cap |

- **[replicated]** Curve inversion as a recession lead is one of the better-documented macro
  signals (Estrella & Mishkin etc.), though the lead time is long and variable — it's a
  *regime* input, not a trade timer.
- **Exam trap:** distinguish bear steepening (long end rises — inflation fear) from bull
  steepening (short end falls — cuts). Same shape change, opposite cause and asset map.

### 1.3 The growth–inflation quadrant (the core regime model)

Two dimensions — growth **trajectory** and inflation **trajectory** (rate of change, NOT
levels) — give four regimes:

```
                 Inflation ↓            Inflation ↑
 Growth ↑ │   GOLDILOCKS            REFLATION
          │   long equities/credit/  long commodities/value/
          │   growth/EM;             TIPS/energy;
          │   short cmdty/gold/cash  short duration/growth
 ─────────┼───────────────────────────────────────────────
 Growth ↓ │   DEFLATION (risk-off)  STAGFLATION
          │   long duration/quality/ long gold/energy/cash/
          │   USD/defensives;        TIPS;
          │   short cyclicals/EM/HY  short equities/bonds/credit
```

**Key points to remember:**

1. **Rate of change, not level.** A 55 ISM falling from 60 is a *deteriorating* growth
   signal even though the level is expansionary. This is the single most repeated idea
   in the lesson.
2. **Goldilocks** = ideal (growth without inflation → CBs stay easy → risk assets thrive).
3. **Stagflation** = worst (CBs trapped; only gold/energy/cash/TIPS work).
4. **USD** tends to strengthen in deflation/risk-off (safe haven) and stagflation (mildly),
   weaken in goldilocks — directly relevant to FX work in this repo.

### 1.4 Regime detection implementation

- **Growth score:** composite of ISM Manufacturing + ISM Services (0.4/0.4) + claims z-score
  (0.2); signal = 3-month momentum vs 12-month trend.
- **Inflation score:** composite of core CPI + core PCE (0.4/0.4) + 5Y breakevens (0.2);
  signal = 3-month change (momentum), YoY basis.
- **Classification:** simple sign thresholds at zero (or percentiles) on the two scores →
  one of the four quadrants.
- Data source: **FRED** (free; `fredapi` in Python). We already have `FRED_KEY` in Railway.

```python
def classify_regime(growth_score, inflation_score):
    if growth_score > 0 and inflation_score <= 0: return "GOLDILOCKS"
    if growth_score > 0 and inflation_score > 0:  return "REFLATION"
    if growth_score <= 0 and inflation_score > 0: return "STAGFLATION"
    return "DEFLATION"
```

**My critique (important for implementation):** the lesson's pseudo-code mixes units
(raw ISM levels + z-scores) — a real implementation must z-score *every* input first,
respect **publication lags** (ISM ~1st business day for prior month; CPI mid-month;
point-in-time discipline or the backtest lies), and pick thresholds without peeking.

### 1.5 Regime *transitions* (higher value than the regime itself)

| Transition | Early warnings | Typical duration | Positioning shift |
|---|---|---|---|
| Goldilocks → Reflation | Wages accelerating, commodities rising, breakevens widening | 3–6 mo | Growth→Value, add commodities, cut duration |
| Reflation → Stagflation | PMIs roll over while inflation sticky; curve flattens | 2–4 mo | Cut equity beta, add gold, raise cash |
| Stagflation → Deflation | Credit spreads widen, breakevens fall, PMIs contract | **1–3 mo, often rapid** | Add duration aggressively, quality over junk |
| Deflation → Goldilocks | PMIs trough, spreads narrow, CB easing | 3–6 mo | Add risk, cut duration, cyclicals |

**Memorise:** the stagflation→deflation transition is the *fastest* (credit-driven), so it
is the one a monthly-frequency classifier is most likely to miss. Argues for including a
higher-frequency input (credit spreads, breakevens) in the transition detector.

### 1.6 Historical asset performance by regime (1970–2024, annualised)

| Asset | Goldilocks | Reflation | Stagflation | Deflation |
|---|---|---|---|---|
| US equities | **+15.2%** | +8.4% | −4.2% | −12.1% |
| US 10Y Treasuries | +4.1% | −2.3% | −1.8% | **+11.4%** |
| Commodities (GSCI) | +1.2% | **+18.7%** | +12.3% | −15.8% |
| Gold | −2.1% | +8.9% | **+21.4%** | +6.2% |
| **USD index** | −3.2% | +0.8% | +2.4% | **+7.1%** |

- **[plausible mechanism / needs verification]** These are the lesson's numbers, classified
  with ISM+CPI momentum; I have not reproduced them. In-sample regime labels + in-sample
  returns = the classic look-ahead trap; reproduce before trusting.
- **FX takeaway to keep:** USD's best regime is deflation/risk-off (+7.1%) — consistent
  with the safe-haven override in Lesson 2 §2.5. USD is a *risk-off asset* first and a
  *carry asset* second.

### 1.7 The four entry-model families

| Model | Core idea | Signal examples | Best conditions |
|---|---|---|---|
| **Mean reversion** | Extremes revert to central tendency | Z-score \|Z\|>2 from MA; RSI <30/>70; Bollinger + volume; pairs spread | Range-bound, low vol, no strong catalyst |
| **Momentum / trend** | Winners keep winning (behavioural bias + slow info diffusion) | 12-1 momentum (skip last month); 50/200 MA cross; Donchian/ATR breakouts; cross-sectional rank | Trending markets, regime change, high dispersion |
| **Stat arb** | Related securities keep stable relationships | Pairs; ETF vs components; factor residuals; cross-asset (credit vs equity) | Requires **cointegration** (not just correlation) + economic linkage + liquidity |
| **Lead–lag** | Information propagates with delay | Copper→equities; credit→equity; large→small cap; futures→cash | Requires Granger causality, OOS stability, economic rationale |

- **[replicated]** Time-series momentum (12-1) is one of the genuinely replicated anomalies
  (see `CLAUDE.md` folklore-vs-replicated map). RSI/Bollinger-style mean reversion is
  **[folklore]** — infrastructure only, never sold as edge.
- **Lead–lag is the family Lessons 2–3 build on** — and the lesson itself states the
  validation bar: Granger causality, OOS stability, economic rationale. Hold it to that.

### 1.8 The validation gauntlet (maps 1:1 onto this repo's harness discipline)

Pipeline: **In-sample dev → Walk-forward → OOS holdout (never touched) → Monte Carlo →
Sensitivity → Paper trade.**

- **Walk-forward efficiency:** `WFE = OOS performance / IS performance`.
  Target **WFE > 0.5**; below **0.3** = severe overfitting. New metric to me — worth
  adding to `summarizeSplit` reporting (it's just OOS/IS Sharpe as a ratio).
- **Metric reference table** (thresholds per lesson):

| Metric | Formula | Good | Excellent |
|---|---|---|---|
| Sharpe | (R−Rf)/σ | >1.0 | >2.0 |
| Sortino | (R−Rf)/σ_down | >1.5 | >2.5 |
| Calmar | CAGR/MaxDD | >0.5 | >1.0 |
| Information ratio | α/TE | >0.5 | >1.0 |
| Profit factor | GrossProfit/GrossLoss | >1.5 | >2.0 |

  All five already exist in `js/metricsCore.js` — one definition each; never re-implement.
- **Checklists** (before backtest / before live): economic rationale documented,
  point-in-time data, survivorship bias, cost model, reserved OOS, walk-forward passed,
  statistical significance, Monte Carlo, 3+ months paper, risk limits + kill switches.
  This is essentially `CLAUDE.md`'s "Validate the same way every time" rule expanded.

---

## Lesson 2 — The Transatlantic Yield Spread (US 10Y − German Bund)

### 2.1 The headline facts (data through 02 Sep 2025)

- US 10Y **4.27%**, German 10Y **2.79%** → spread **+149 bps** (21st percentile of 5Y history).
- 5-year range: **min 101 bps (2023-04-24)**, **max 227 bps (2024-12-24)**, mean **169 bps**.
- 2025 regime: *narrowing* — off 78 bps from the Dec-2024 peak (markets pricing slower ECB
  cuts while the Fed holds).

### 2.2 The core principle (why the spread LEADS EUR/USD)

> Capital flows to the highest risk-adjusted return. When US yields rise relative to German,
> holding USD beats holding EUR, and global institutions reallocate. **Because those flows
> take weeks-to-months to execute, the FX adjustment lags the yield move.**

The lead exists because **institutions are slow**: they announce, committee-approve, and
execute over weeks/months. The yield reprices in minutes; the flow arrives later.

### 2.3 The five transmission channels — MEMORISE with timescales

| # | Channel | Speed | Actor |
|---|---|---|---|
| 1 | **Carry trade** | Hours–days | Hedge funds/prop: borrow EUR, buy USD assets |
| 2 | **Fixed-income reallocation** | 1–4 weeks | Bond fund managers chasing relative value |
| 3 | **Pension & insurance (LDI)** | 2–6 months | Liability matching; investment-committee speed |
| 4 | **Reserve managers** | Quarters | Central banks (~60% of reserves in USD); huge notional |
| 5 | **Corporate treasury** | Variable (months) | Repatriation, funding-currency choice |

Mnemonic: **C-F-P-R-C** — *"Carry, Funds, Pensions, Reserves, Corporates"* — ordered
fast→slow. Exam question I'd set myself: *which channel explains why a spread move keeps
pushing EUR/USD for weeks after the news is old?* → channels 3–4.

### 2.4 The trading edge, distilled

1. **Spread MOMENTUM matters as much as level.** A widening spread that keeps widening
   predicts more USD strength as slow capital catches up.
2. **Observable in real time** — unlike GDP/CA balances, the spread ticks continuously.
3. **Lead time varies by condition:**

| Market condition | Typical lead |
|---|---|
| High vol / news-driven | Hours – 1-2 days |
| Trending | 1–2 weeks |
| Range-bound / low vol | 2–4 weeks |
| Regime change | 1–3 months |

   Pattern: **more volatility ⇒ shorter lead** (fast money dominates and closes the gap).
4. **Validation/rejection of FX moves:** EUR/USD moves *without* spread confirmation →
   likely positioning/noise → mean-reversion candidate. Move *with* confirmation → has legs.
5. **Non-confirmation warns of regime change:** spread widening for months while EUR/USD
   stops falling ⇒ fully priced / offsetting factors / reversal risk. "The easy money in
   the trend is over."
6. **Symmetric** — works identically in both directions.

### 2.5 When the relationship BREAKS (as important as when it works)

| Breakdown | Mechanism | Example |
|---|---|---|
| **Risk-off events** | USD rallies as safe haven regardless of yields; spread can narrow (Treasuries rally) while USD strengthens. Liquidity preference > yield preference. | Lehman, COVID |
| **CB intervention** | Policy flows overwhelm fundamental flows | JPY interventions 2022–24 |
| **Extreme positioning** | Everyone already short EUR ⇒ no one left to sell; positioning overhang absorbs the signal. Watch CFTC data. | — |
| **Geopolitical shocks** | FX moves for non-yield reasons (energy, trade, growth); **causality can temporarily reverse** (FX leads spread) | Ukraine 2022 |

> **Critical rule (verbatim spirit):** the spread–FX relationship is a **tendency, not a
> law**. When correlation breaks, ask *why* — the answer reveals the regime.

### 2.6 What moves the spread itself (the upstream drivers)

Monetary policy divergence (Fed vs ECB paths — the primary medium-term driver) · growth
differential (relative PMIs) · inflation gap (relative breakevens) · safe-haven flows
(risk-off → Bund outperformance → spread narrows) · supply dynamics (Treasury issuance vs
Bund scarcity) · **hedging costs** (wide differentials make FX-hedged foreign bonds
unattractive, which *dampens* the flow — a self-limiting feedback worth remembering).

### 2.7 Why the 10-year tenor?

- Duration sweet spot: reflects policy expectations, still liquid.
- It's the **real-money benchmark** (pensions/insurers) — where the big flows live.
- Globally comparable — every major sovereign has a liquid 10Y.
- **Refinement:** the **2Y spread** is more sensitive to near-term policy and often leads
  the 10Y. Practitioner heuristic: **2Y for direction, 10Y for magnitude.** → research idea R3.

### 2.8 Mechanics walkthrough (the T+0 → T+1month cascade)

Fed hawkish surprise → US 2Y +15bps in minutes → 10Y +8–10bps within the hour (Bunds
unchanged, spread widens) → fast money shorts EUR/USD within a day (−50–80 pips) →
asset managers rotate Bunds→Treasuries over 1–4 weeks (each purchase = buy USD/sell EUR)
→ real money executes over weeks–months → new equilibrium; trade "done" until next catalyst.

**The behavioural point:** the FX grind continues through the "boring" period after the
news — holding through that period is where the lead-lag edge actually pays.

---

## Lesson 3 — Live Case Study: "The Spread Moved First" (17–18 Feb 2026)

### 3.1 What happened

- **Tue 17 Feb:** DE–US spread declines all session (US yield advantage widening —
  bearish EUR/USD input). EUR/USD ignores it: ranges, mean-reverts, no signal. Divergence
  builds through the day and overnight (~12–18h).
- **Wed 18 Feb:** EUR/USD capitulates — hard selloff, accelerating into the close.
  Spread keeps falling (confirming Tuesday was structural, not noise). Full alignment.
- **Lead time: ~24 hours** — one full session to position before spot repriced.

### 3.2 The state table (good exam material)

| Time | Spread | EUR/USD | Read |
|---|---|---|---|
| Tue AM | ↘ | flat/choppy | Divergence forming |
| Tue PM | ↘ | mean-reverting up | Divergence widening |
| Tue close | ↘ | recovered | **Max divergence** |
| Wed AM | ↘ | starting to fall | Convergence begins |
| Wed PM | ↘ accelerating | hard selloff | Full alignment |

**The lesson in one line:** spot showed nothing actionable on Tuesday; the spread showed a
clean directional move not yet priced. *The gap between what rates say and what FX does is
the edge.* When rates move and spot doesn't, the question is "when", not "if".

### 3.3 The application rules (my checklist for live use)

1. **Watch for divergence** — bigger divergence ⇒ more likely snapback.
2. **Don't fight the spread** — long EUR/USD into a falling spread = fighting institutional
   flow; you can be right short-term and still be run over.
3. **Use for confirmation** — check the spread before any EUR/USD entry; aligned = backed,
   diverging = caution.
4. **Estimate lead time from regime** — orderly market ≈ hours–2 days; high-vol/risk-off
   compresses toward coincident **or inverts**.

### 3.4 Honest-assessment margin note

**[folklore/anecdote]** — this is *one* case study, selected after the fact because it
worked. It illustrates the mechanism beautifully but proves nothing statistically
(survivorship of examples). The lesson itself concedes this by ending with "next steps:
quantitative lag modelling." Before treating divergence as a signal in this repo, it must
survive the Lesson-1 gauntlet: rolling-lag estimation, Granger tests, OOS split, costs.
Also note the case study quotes the **DE–US** spread (falling = US advantage widening)
while Lesson 2 uses **US–DE** (rising = same thing) — sign conventions are the #1 way to
silently break this implementation. **Pick one convention (US−DE) and enforce it.**

### 3.5 The prescribed quant roadmap (from the lesson's "Next Steps")

1. **Rolling lag correlation** — optimal lag between Δspread and ΔEURUSD over a rolling
   (~60-day) window. The lag is *not static*: expands in quiet markets, compresses in
   volatile ones. Track the rolling optimal lag to know current expected lead time.
2. **Granger causality on rolling windows** — does the spread improve EUR/USD forecasts
   beyond EUR/USD's own history? Detect **causality reversals** (risk-off: FX can lead).
3. **Dynamic lag models** — state-space / regime-switching lag structure conditioned on
   volatility, liquidity, macro regime. A static lag assumption underperforms.
4. **Regime conditioning is mandatory** — carry-dominant regime: clean long lead;
   risk-off: coincident or FX-leads; policy-divergence: relationship strengthens;
   liquidity crisis: breaks entirely.

---

## Cross-lesson synthesis (the part I'd be examined on)

1. **The three lessons are one pipeline:** Lesson 1 gives the *regime context* and the
   *validation gauntlet*; Lesson 2 gives a specific *lead-lag mechanism with economic
   rationale* (the hardest of Lesson 1's lead-lag requirements to satisfy); Lesson 3 shows
   a single live instance and prescribes the quantification. Nothing is validated yet —
   the OOS work is the actual next step, not more reading.
2. **Regime conditions everything.** The spread→FX lead is regime-dependent (§2.4, §3.5);
   USD itself flips character by regime (carry asset in reflation, safe haven in
   deflation). A spread signal without a regime filter will blow up precisely in risk-off,
   when it inverts.
3. **Rate-of-change beats level, everywhere.** Regime scores use momentum, not levels;
   spread *momentum* predicts continued FX adjustment, not spread level. Same principle,
   two contexts.
4. **Divergence/non-confirmation is a signal class of its own:** spread-vs-FX divergence
   (trade entry), months-long non-confirmation (trend exhaustion), PMI-vs-inflation
   divergence (regime transition). "Two related series disagree" is the recurring template.
5. **Every claimed edge inherits the same bar:** economic rationale → point-in-time data →
   costs → walk-forward → true OOS (≥30 trades per house rules) → paper. WFE > 0.5.

---

## Honest priors before building anything (per the CLAUDE.md contract)

- **Regime classification (L1):** the quadrant framework is standard practitioner macro
  (All-Weather / Investment-Clock lineage). As *context/filter* for existing strategies:
  reasonable and cheap to build off FRED. As a *standalone timing edge* for FX at daily
  horizon: low odds (~10–15%) it survives costs OOS. Default expectation: null as a
  primary signal, potentially useful as a conditioning variable.
- **Rates–FX lead-lag (L2/L3):** the *mechanism* (flow inertia) is real economics, and
  rate differentials driving FX is standard. But a *daily-horizon exploitable lag* in
  EUR/USD — the most liquid FX pair on earth — is exactly what fast money arbitrages.
  Published evidence on exploitable daily lead-lag here is thin; the honest prior is
  **most of the lag is inside the first hours**, with the multi-day tail small after
  costs. Odds it becomes a tradeable after-cost standalone entry signal: ~10%. Odds it
  works as a **confirmation/veto filter** on existing EUR/USD strategies (its weaker,
  more defensible use): meaningfully better — that's the version to test first.
- The base-rate outcome for both is **null, found cheaply — which is a win.**

---

## Future research ideas (ranked queue)

- **R1 — Spread confirmation filter (highest value/cost ratio).** Build US−DE 10Y spread
  series (FRED: `DGS10`, `IRLTLT01DEM156N` monthly / better: daily Bund yield source),
  compute Δspread over 1–5 days, and use *sign agreement with position direction* as a
  veto/confidence input on existing EUR/USD strategies (e.g. the per-line fade/follow
  book). Pre-register: "works" = OOS Sharpe improvement with ≥30 OOS trades on the
  filtered subset; "fails" = no improvement or trade count collapse.
- **R2 — Rolling lag correlation study (measurement, not strategy).** Cross-correlation
  `ρ(lag)` of Δspread vs ΔEURUSD, rolling 60d, lags −5…+5 days. Deliverable: is the
  optimal lag ≥1 day often enough to matter, and does it vary with vol as claimed
  (high vol ⇒ shorter lag)? This directly tests Lesson 3's central claim.
- **R3 — 2Y vs 10Y spread ("2Y for direction, 10Y for magnitude").** Repeat R2 with the
  2Y differential; test whether 2Y-spread changes lead 10Y-spread changes and EUR/USD.
- **R4 — Granger causality with regime conditioning.** Rolling Granger tests both
  directions; flag causality-reversal periods; overlay VIX/risk-off marker to test the
  "inverts in risk-off" claim.
- **R5 — Growth/inflation regime classifier as a conditioning brick.** FRED-based
  (ISM is no longer on FRED — need ISM report or a proxy like regional Fed surveys /
  S&P Global PMI; core CPI/PCE/breakevens are on FRED). Output: regime label per month,
  point-in-time. Use as a *filter* on existing engines (does fade vs follow behave
  differently by macro regime?), not as a standalone signal.
- **R6 — Reproduce the L1 regime/asset-returns table** before trusting it (USD rows
  especially). If USD +7.1% in deflation regimes replicates point-in-time, that alone is
  a useful risk overlay for the whole FX book.
- **R7 — Non-confirmation / divergence exhaustion detector.** Months-scale: spread trend
  vs EUR/USD trend disagreement as a trend-exhaustion warning (Lesson 2 §2.4 point 5).
  Harder to test (few events); park behind R1–R4.
- **R8 — Positioning overhang.** CFTC COT EUR net speculative positioning as the
  "no one left to sell" override on the spread signal. Data is free (CFTC), weekly,
  lagged 3 days — point-in-time discipline required.
- **Deferred (data-honesty per CLAUDE.md):** anything needing intraday Bund yields —
  the sandbox has OANDA FX M1 but no intraday rates feed. The *daily* versions of R1–R4
  are feasible with FRED/ECB data; the *intraday* lag structure (hours) is not testable
  here yet. Say so; don't fake it with a lookalike.

## Areas of interest (things that hooked me, to read more on)

- Walk-forward efficiency (WFE) as a single overfitting number — trivially computable
  from `summarizeSplit` output; consider surfacing it on every OOS card.
- The **hedging-cost feedback** (§2.6): wide differentials make FX-hedged Treasuries
  unattractive to European real money, throttling the very flow that drives the lead.
  Self-limiting dynamics like this are why "tendency, not law."
- Causality *reversal* detection (FX leading rates in risk-off) — a regime indicator in
  its own right, possibly more valuable than the base signal.
- The taxonomy of divergence signals (synthesis point 4) — one abstract template
  ("related series disagree → information") across regime, spread, and exhaustion
  detection. Feels brick-shaped.
- Module topics still to come in this course: business-sentiment signals and reading the
  options complex — leave space in this file.

## Real-time implementation notes (mapping to this repo)

- **Where a spread brick would live:** a Tier-2 style source, e.g. `js/rateSpreadCore.js`
  — pure function over passed-in yield series → `{spread, dSpread, zScore, percentile,
  rollingLagCorr}`. FRED fetch stays in the server layer (like `fetchD1`), math stays
  pure and unit-testable on synthetic data. Register in `LEGO_MODULES.md` if/when built.
- **Consumption point:** the per-line entry-confidence engine (`ENTRY_ZONE_CONFIDENCE.md`)
  is the natural consumer — spread agreement/disagreement as one more confidence input on
  EUR/USD lines, exactly like the existing range-bias features. NOT a new bespoke engine
  (Lego rule: selector/feature, not new legs).
- **Validation path:** the existing honest harness (`summarizeSplit`, IS/OOS, costs on,
  ≥30 OOS trades) is exactly Lesson 1's gauntlet — no new framework needed. Add WFE to
  the report.
- **Regime classifier (R5):** monthly cadence, so a tiny server cron + KV-cached label is
  enough; if any user-entered config is stored, remember the `_CF_EXACT` KV rule.
- **Sign convention (repeating because it will bite):** define spread as **US 10Y − DE
  10Y**. Spread ↑ = USD-supportive = EUR/USD ↓. Lesson 3 quotes DE−US; flip on ingest.
- **Data availability:** US 10Y (`DGS10`) daily on FRED ✓; German 10Y daily needs
  Bundesbank/ECB SDW (FRED's is monthly) — resolve before R1; EUR/USD daily via existing
  OANDA `fetchD1` ✓ (Railway only, 403 in sandbox is environment, not a bug).

## Self-test questions (closed-book, before next lesson)

1. Name the six macro driver families and the two that define the regime quadrant.
2. Draw the growth–inflation quadrant with overweights/underweights per regime. Which
   regime is best for USD? Which for gold?
3. Why rate-of-change instead of levels for regime scores?
4. Which regime transition is fastest and what drives it? What does that imply for
   classifier input frequency?
5. List the five spread→FX transmission channels in speed order, with timescales and actors.
6. Why does the spread *lead* EUR/USD rather than just correlate? (One sentence:
   institutional flow inertia.)
7. Give the four breakdown conditions of the spread–FX relationship and what dominates in each.
8. What does spread/FX *non-confirmation* after a long trend tell you?
9. Why the 10Y tenor — and what's the 2Y refinement?
10. Define walk-forward efficiency, its target, and the severe-overfitting threshold.
11. In the Feb 2026 case study: what was the maximum-divergence moment, what was the lead
    time, and what would the risk have been if a risk-off shock hit Tuesday night?
12. What are the four items in the lesson's quantitative lag-modelling roadmap, and why
    does a static lag assumption fail?
13. (House) What tags apply to: the quadrant framework, the lead-lag mechanism, the Feb
    case study? What's the pre-registered success criterion for R1?

---

*Notes by/for the assistant working on MacroFXModel. Lessons are educational content from
Colez Trades; all performance figures are the lesson's, unverified. Next lessons in this
module (business-sentiment signals, options complex) get appended here or as sibling files
in `education/`.*
