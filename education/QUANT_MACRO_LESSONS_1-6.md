# Quant & Macro Insights — Study Notes (Lessons 1–6)

**Source:** "Colez Trades — Quantitative & Macro Insights", Lessons 1–6
("Repositioning Your Approach to Financial Markets" through "Cross-Asset Synthesis").
**Purpose of this file:** a durable study note I (Claude) and the owner can re-read,
train against, and mine for build ideas. It distills the lessons, extracts the
*usable* insights, applies this repo's honest-teammate discipline to each claim
(replicated vs folklore vs untested), and turns the material into concrete
candidate projects for MacroFXModel.

> **How to read this note.** Three layers per topic:
> **[CORE]** = the lesson's idea, compressed. **[ANALYSIS]** = my honest take —
> what's well-supported, what's exemplar/oversold, what's regime-dependent.
> **[BUILD]** = what we could construct in this repo, with a blunt prior on
> whether it's edge, infrastructure, or a filter.

---

## 0. The one-paragraph summary of the whole course

Markets are a cascade: **central bank policy → sovereign bonds → FX → equities →
credit**, with liquidity (QE/QT, net-liquidity) as the master variable and
positioning as stored potential energy. Information degrades and lags at each
level down; retail trades the last domino (single stocks, intraday FX) where
signal-to-noise is worst and costs bite hardest. The institutional approach is:
(1) validate systematically before risking capital, (2) watch the levels *above*
your instrument, (3) know the current regime (growth × inflation, risk-on/off),
(4) know the calendar of forced flows, (5) read positioning before narrative,
and (6) accept that edge lives at **weeks-to-months horizons with systematic
implementation**, not daily discretionary macro. The course's own closing
admission is the most important sentence in it: *understanding the framework is
not edge — infrastructure, time horizon, and systematic testing are.*

That closing admission is exactly this repo's founding premise
(`CLAUDE.md` §"How we talk about results", `SYSTEM_ASSESSMENT.md`). The lessons
are a good conceptual map; nothing in them is a tested strategy yet.

---

## Lesson 1 — Repositioning: noise, costs, and validation

### [CORE]
- **SNR by horizon.** Price = signal + noise. At short horizons noise dominates
  (SNR < 1); extending the holding period is the cheapest way to raise SNR.
- **The double penalty.** Short horizons suffer low SNR *and* proportionally
  higher transaction costs (spread, slippage, impact). A 5bp-alpha idea is dead
  the moment round-trip cost exceeds 5bp — common intraday.
- **Systematic vs intuition-based development.** The systematic practitioner
  tests hypotheses on data (IS → OOS → walk-forward → paper → live) and pays for
  failures in *compute and time*. The intuition trader tests in the live market
  and pays in *time AND capital* — the "double negative trap". Invalidation
  takes ~2 weeks vs ~6 months.
- **The validation funnel.** ~52 hypotheses → 34 pass IS → 13 pass OOS → 6 pass
  walk-forward → 4 deployed. Most ideas die; the point is to kill them cheaply.
- **Know your metrics before deployment.** CAGR, Sharpe, Sortino, max DD, DD
  duration, win rate, profit factor, max consecutive losses, expectancy, Calmar,
  tail ratio. Knowing these turns a −15% drawdown from "panic" into "within the
  8 historical precedents, all recovered" — the **blindfold problem**.

### [ANALYSIS]
- This is the strongest, least controversial lesson: it's methodology, not
  signal claims. It is essentially a restatement of what this repo already
  enforces (honest fills, real costs, true IS/OOS split, OOS trade count ≥ 30).
- The funnel numbers (52 → 4) are illustrative, but the *shape* matches
  experience here: most ideas are null; a ~90%+ rejection rate is the base rate,
  not a failure (see `TRADABILITY_REVIEW.md`).
- One caution the lesson underplays: **the funnel itself can overfit.** Running
  52 hypotheses and keeping the 4 OOS survivors is multiple testing — a few
  "winners" among dozens of slices is what noise does (CLAUDE.md: pooled nulls /
  disaggregation rule). Survivors must beat the chance baseline and be
  IS-consistent, not merely OOS-positive.
- The metrics table maps ~1:1 onto `js/metricsCore.js` (`sharpeRatio`,
  `sortinoRatio`, `calmar`, `maxDrawdown*`, `profitFactor`, `winRate`,
  `summarizeTrades`). We already compute most of it.

### [BUILD]
1. **Drawdown-context card ("blindfold fixer").** For any live/paper strategy,
   render current DD against the backtest's DD distribution: historical max,
   count of comparable DDs, average duration, recovery rate. Pure reporting on
   top of `metricsCore` + stored equity curves. *Prior: infrastructure, not
   edge — but high value for the owner's decision quality. Cheap.*
2. **Add missing metrics to `metricsCore`:** max consecutive losses, DD
   duration, tail ratio (95th-percentile right/left). Small, unit-testable
   brick extensions; register in `LEGO_MODULES.md`. *Cheap, clearly useful.*
3. **Hypothesis ledger.** A simple md/JSON log: hypothesis, pre-registered
   pass/fail criteria (both outcomes written *before* the run), result, date.
   Directly implements the "pre-register both outcomes" house rule and makes
   the multiple-testing count explicit. *Infrastructure; near-zero cost.*

---

## Lesson 2 — What moves markets: hierarchy, rates, regimes, liquidity, flows, positioning

### [CORE]
- **Capital-flow hierarchy.** CB policy (source) → govt bonds (hours–days) →
  G10 FX (days–weeks) → equity indices (weeks–months) → credit
  (months–quarters). Signal quality falls and lag grows down the chain.
  Check the levels above you before any position.
- **Rates drive FX.** Money flows to the highest risk-adjusted yield. The 2Y
  yield differential is the key FX driver at medium horizons (lesson cites
  0.7–0.9 correlation for USD/JPY in the 2021–24 regime; long-run average more
  like 0.6–0.75). Rate cycles lead equity cycles by ~6–18 months.
- **Carry trades:** borrow low-yield (JPY, CHF), invest high-yield. Steady
  carry income in calm regimes; violent self-reinforcing unwinds in risk-off
  (stops → JPY buying → more stops). JPY suddenly strengthening = carry unwind
  in progress = warning for ALL risk assets.
- **Risk regimes.** Risk-on/risk-off are distinct states; correlations are
  regime-dependent and converge toward 1 in crises (diversification fails when
  needed). Regime dashboard: VIX level + term structure (contango vs
  backwardation), HY OAS, JPY/CHF strength, gold/UST co-movement.
- **Liquidity trumps fundamentals.** Net Liquidity ≈ Fed balance sheet − TGA −
  RRP. March 2020: worst GDP ever + $3T QE = +45% rally. "Don't fight the Fed."
- **Institutional flow calendar.** Month-end rebalancing (counter-trend
  pressure after strong months), OpEx (3rd Friday; pin risk, gamma effects),
  quarter-end window dressing, September weakness / year-end strength.
- **Positioning before narrative.** News explains moves after the fact
  (same jobs print gets opposite headlines depending on the tape). Positioning
  (COT, fund flows, short interest, put/call) is stored energy; extreme
  crowding + any catalyst = violent reversal (GME = positioning mechanics,
  not fundamentals).

### [ANALYSIS] — claim-by-claim honesty check
| Claim | Status |
|---|---|
| Hierarchy / bonds lead equities at macro turning points | **Broadly supported** as structure; lead-lag is real but unstable and strongest at regime turns, weakest in calm trends (the lesson itself concedes this in L6). Not a mechanical timer. |
| 2Y rate differentials drive FX medium-term | **Among the better-replicated macro relationships** (UIP failure / carry literature). But the quoted correlations are exemplar and regime-dependent; risk-off and intervention break it. |
| Carry earns positive long-run return with crash risk | **Replicated** (classic FX carry literature). Matches CLAUDE.md's own list of replicated edges. Crash-risk caveat is genuine, not decoration. |
| "Liquidity trumps fundamentals" / net-liquidity tracks SPX | **Directionally real, quantitatively oversold.** Balance-sheet regimes matter, but net-liquidity ↔ SPX fit is partly in-sample curve-matching from 2020–22 twitter-macro. Treat as a *condition/gate*, never a signal. The lesson even says "condition, not a signal" — keep that phrasing. |
| Calendar effects (month-end, OpEx, September) | **Folklore-to-weak.** Documented historically, heavily arbitraged, small after costs. Usable as *trade-avoidance filters* (don't fight known flows), probably not as standalone edges. |
| Positioning extremes → reversals | **Mixed evidence.** COT extremes have weak standalone predictive power in most studies; better as a conditioning variable (fade signals only when positioning is stretched). GME is a real mechanism but an extreme outlier. |
| Pre-FOMC drift (L3 mentions) | Real academic finding (Lucca–Moench), publicly known since 2013, likely mostly gone. |

- **Meta-point worth keeping:** the lesson's own framing — *the same headline is
  bullish or bearish depending on positioning* — is a genuinely useful mental
  inversion. "How is the market positioned, and does this force repositioning?"
  is a better question than "what does the news mean?"

### [BUILD]
1. **Rate-differential feature brick (highest-prior idea in the whole course
   for this repo).** We trade FX; the course's best-supported claim is that 2Y
   differentials drive FX at weeks-to-months horizons. Build a
   `rateDiffCore.js` Tier-2 brick: fetch 2Y govvie yields (FRED has DGS2 + key
   foreign series; `FRED_KEY` exists), compute per-pair differentials and their
   z-score/slope (`statsCore`), emit a per-pair macro bias. Feed it as one
   input to the entry-grade/confidence stack (`entryGradeCore`,
   `rangeBiasCore`) rather than as a standalone system. Validate through the
   honest harness at the weekly/20-day horizons (never daily — wrong horizon
   for this signal). *Prior: as a standalone signal ~15–25% it survives OOS at
   our horizons; as a directional filter on existing strategies, better odds
   of a measurable improvement. This is the one to do first.*
2. **Risk-regime dashboard + gate.** Daily composite: JPY strength z (esp. vs
   AUD — carry-unwind tell), AUD/JPY level/trend, gold–yield co-movement,
   realized cross-pair correlation level (`statsCore` rolling correlations on
   data we already have). Output a 3-state regime (risk-on / neutral /
   risk-off). Use as a *gate* on strategies (e.g. suppress fade entries in
   risk-off). VIX/HY-OAS could be added via FRED (VIXCLS, BAMLH0A0HYM2).
   *Prior: regime gating is the most plausible way macro helps us — it's risk
   management, not entry edge. Test as A/B: incumbent vs regime-gated
   incumbent, OOS.*
3. **Net-liquidity tracker.** Weekly WALCL − WTREGEN − RRPONTSYD from FRED,
   rendered on the dashboard with trend direction. *Infrastructure/context
   only. Do NOT wire to trading without an OOS test; expected result of a
   test at FX-pair level: null-to-weak.*
4. **Calendar-flow flags.** Month-end (last 2–3 trading days after a strong
   month), OpEx week, quarter-end flags as boolean features. Test whether
   *excluding* those windows improves OOS Sharpe of existing engines. *Prior:
   small effect if any; cheap to test because it's a filter on trades we
   already simulate.*
5. **COT positioning gate.** Weekly CFTC COT (free CSV) → spec-net-position
   percentile per FX future (`statsCore.rollingPercentile`). Condition: only
   allow fade-direction trades against extremes / block trades into extremes.
   *Prior: coin-flip. Pre-register both outcomes before running.*

---

## Lesson 3 — Central bank policy deep dive (Fed mechanics)

### [CORE]
- **Structure:** dual mandate (employment + 2% PCE inflation); 12 FOMC voters
  (7 governors + NY Fed + 4 rotating regional presidents); Chair dominates but
  dissents map the committee's range; hawk–dove spectrum.
- **Reaction function:** inflation (core PCE, breakevens), labor (NFP, wages,
  JOLTS), financial conditions, global factors → policy response. Learn the
  function to anticipate policy rather than react to it.
- **Communication cycle:** statement (2:00pm ET) > presser (2:30) > minutes
  (+3 weeks) > speeches > testimony. Blackout period makes *pre-blackout
  speeches* the last true signal. **Diff the statement** — word changes are the
  signal ("some further" → "further"; adding "elevated"). Minutes: read
  quantifiers ("a few" vs "most") and the "however" clauses.
- **Dot plot:** conditional projections, not commitments; poor forecast track
  record (2021 dots said zero-through-2024; reality was 4%+ by 2022). The
  tradeable object is **dots vs market pricing** (CME FedWatch / fed funds
  futures): dots more hawkish than market → yields up, USD up.
- **Fedspeak decoding:** "inflation remains elevated" = hawkish; "proceed
  carefully" = dovish pause; "data dependent" alone means nothing — ask *which
  data*. Pivots are telegraphed by language shifts months ahead
  ("transitory" → "persistent" preceded the 2022 hikes). Trial balloons float
  via minor officials and WSJ (Timiraos) before becoming policy.
- **Balance sheet:** QE = reserves created → portfolio-rebalancing into risk
  assets; QT = supply returns to private sector, reserves drain; QT stress is
  nonlinear (Sept 2019 repo, March 2023). Track H.4.1 (Thursdays).
- **Trading FOMC events:** two-phase reaction — algorithmic keyword spike
  (2:00–2:05, often wrong) then human digestion (presser onward, often
  *reverses* phase 1). True direction frequently takes 2–5 days. Fade the move
  if outcome ≈ expected but the market overreacted / presser reversed it /
  cross-asset confirmation is missing; follow if genuinely surprising, language
  shifted, cross-asset confirmed, move persisted through presser. Sitting out
  is a valid position.

### [ANALYSIS]
- The mechanics (who votes, calendar, statement→presser→minutes cadence,
  blackout) are **facts**, not claims — safe to memorize. Committee names/stances
  rot; the framework doesn't.
- Statement-diffing and quantifier-reading are genuinely how desks process the
  Fed; that's craft knowledge worth keeping. Whether *we* can monetize it is a
  different question — everyone diffs the statement within seconds now.
- The two-phase FOMC reaction (initial move often reversed) has some academic
  and practitioner support but is not a reliable standalone fade signal.
  Best read: **FOMC days are high-variance, low-edge for us; the honest use is
  exposure control, not event trading.**
- The dots-vs-market-pricing gap as a surprise-direction indicator is coherent
  and observable in advance — one of the few pre-event quantifiable objects.

### [BUILD]
1. **Event-risk calendar gate.** We already run vol-aware FX strategies. Add an
   FOMC/CPI/NFP calendar flag; test OOS whether suppressing new entries in the
   N hours around events (or widening stops) improves the per-line book's
   realized outcomes. *Prior: plausibly improves risk-adjusted results by
   avoiding known variance spikes; this is risk management with a decent
   chance of surviving a test.*
2. **Statement-diff utility (context tool, not signal).** Fetch consecutive
   FOMC statements, render a word-level diff on a dashboard page. `ANT_KEY`
   exists if we ever want a summarization layer. *Infrastructure; zero edge
   claimed; cheap and genuinely educational for the owner.*
3. **Not worth building:** an FOMC-day fade/follow strategy. Post-event drift
   at our data granularity + costs is a coin-flip and the sample size
   (8 meetings/yr) means an honest OOS verdict would take years.

---

## Lesson 4 — Fixed income for traders

### [CORE]
- **Bond math:** price ↔ yield inverse (mathematical identity). Yield ≈
  coupon/price. Quotes as % of par.
- **Duration:** ≈ % price change per 1% yield move (2Y ≈ 2, 10Y ≈ 8, 30Y ≈ 18).
  2022's historic bond loss = ~2.5% yield rise × duration ~8 ≈ −20%.
  **Growth stocks are long-duration assets** — distant cash flows discounted
  harder when rates rise; Nasdaq trades with long bonds. Convexity = the curve
  in the relationship (usually favorable to holders).
- **Yield curve:** shape encodes expectations. Inversion (2s10s, or the Fed's
  preferred 3m10y) has preceded every US recession in 50+ years with 6–24-month
  variable lead. Four moves: bull/bear steepener, bull/bear flattener — each
  has a macro meaning (bull steepener = cuts being priced; bear flattener =
  hikes expected to bite). Rapid *un-inversion* often immediately precedes the
  recession itself.
- **Credit spreads = fear gauge that leads equities.** HY OAS rough bands:
  <300bp tight/complacent, 400–500 elevated, >500 stressed, >800 crisis.
  Direction and *speed* matter more than level. Divergence rule: equities
  rallying while credit widens → distrust the rally (2007 pattern).
- **Real yields (TIPS):** real = nominal − breakeven. Real yields drive gold
  and growth stocks (opportunity cost of non-yielding assets). 2022's damage
  to both = real yields swinging ~−1% → +1.5%.
- **Yields → FX:** the L2 material formalized — 2Y differentials per pair
  (US−DE for EUR/USD, US−JP for USD/JPY…). Breaks in risk-off, intervention,
  BoP crises, extreme positioning. USD/JPY 2021–24 = textbook: differential
  blew out, pair went 110→150+, MoF intervention couldn't fight it until US
  rate expectations turned.
- **MOVE index = bond VIX;** MOVE spikes often precede VIX spikes (Mar 2023).
- **Daily 5-minute bond scan:** 10Y level/change, 2s10s, 2Y, HY spreads, MOVE,
  10Y TIPS, key differentials — *before* trading anything.

### [ANALYSIS]
- Bond math and duration are identities — the most trustworthy content in the
  course. The "growth stocks have duration" framing is standard and useful.
- Curve inversion → recession: strong historical record **in the US**, small
  sample (~8 events), variable lag, and famous 2022–24 stretch where the
  economy stayed resilient long after inversion. A warning flag, not a timer —
  the lesson says this correctly.
- Credit-leads-equities: true *at major stress points*; in calm tape credit and
  equity are just correlated. The divergence rule (stocks up + spreads
  widening = skepticism) is a decent low-cost heuristic.
- Real-yields↔gold is one of the better-documented macro relationships; it
  weakened post-2022 (gold rallied with positive real yields on CB buying) —
  a live example of regime-dependence. Verify current correlation before using.
- For **this repo**, the FX-relevant content is the same as L2: 2Y
  differentials. The bond dashboard items are context inputs, not FX signals
  per se.

### [BUILD]
1. **Morning macro scan card (dashboard).** One `index.html`-linked card
   pulling FRED daily series: DGS2, DGS10, T10Y2Y, BAMLH0A0HYM2 (HY OAS),
   DFII10 (10Y TIPS), plus our own realized-vol state. Traffic-light deltas
   (day/week). This is the lesson's "5-minute scan" made automatic.
   *Infrastructure/context; no edge claim; high owner value per unit effort.*
2. **Curve/credit regime features for the regime gate** (merge with L2 build
   #2): 2s10s slope + direction, HY OAS level + 5-day change as additional
   inputs to the risk-regime state. *Same A/B validation path.*
3. **Gold-specific note:** we trade gold. Real-yield (DFII10) direction as a
   gold-bias feature is the most directly transferable bond fact here — test
   as a filter on gold entries at weekly horizon. *Prior: relationship is
   real historically but currently degraded; pre-register both outcomes.*

---

## Lesson 5 — Currency markets & global flows

### [CORE]
- **Structure:** ~$7.5T/day (BIS), OTC, 24/5, USD on ~88% of trades; swaps are
  the largest segment — dollar funding stress shows up there first.
- **Currency personalities:** safe havens = USD, JPY (purest), CHF; risk /
  commodity = AUD (China proxy via iron ore), NZD, CAD (oil), NOK (oil);
  GBP = high-beta, stagflation-prone; EUR = USD's counterweight,
  fragmentation risk.
- **Driver hierarchy by horizon:** intraday = flows/noise (hard);
  days–weeks = rate expectations + sentiment + positioning (mixed);
  **weeks–months = rate differentials + policy divergence (the sweet spot)**;
  years = PPP + current account (anchors, useless for timing).
- **Dollar Smile:** USD strong at both extremes — US exceptionalism (left) or
  global panic (right); weak in synchronized global growth (middle). *Why* the
  dollar is strong determines what it means for everything else.
  Dollar cycles run ~7–10 years; don't try to time the turns.
- **Carry mechanics revisited:** funding currencies JPY/CHF; carry return =
  differential ± spot ± roll; unwind anatomy (trigger → selling → stops →
  cascade; JPY +5–10% in days). Monitoring: JPY in risk-off, COT extreme-short
  JPY = crowded carry, rising FX vol = carry headwind.
- **Cross-currency basis** (advanced): deviation from covered interest parity;
  negative basis = premium to obtain USD funding = dollar scarcity. EUR/USD
  basis: 0/−20 normal, −50/−100 stressed, <−100 crisis (Mar 2020). Fed swap
  lines are the release valve. Quarter-end widenings are seasonal noise.
- **Intervention:** works short-term against one-sided positioning, loses to
  fundamentals long-term (Japan 2022–24). Escalation ladder: verbal → rate
  checks → actual intervention. Known "lines in the sand" matter.
- **FX for the non-FX trader:** JPY strength = risk-off tell; AUD = China/risk
  proxy; broad EM FX weakness = contagion canary; FX-vs-rates divergence =
  investigate.

### [ANALYSIS]
- This is our home market; most of it is directly relevant.
- The horizon table is the single most actionable paragraph in the course for
  us: **it says plainly that the horizons we backtest (daily/weekly/20-day)
  straddle the noise→signal boundary, and that macro inputs belong at the
  weekly+ end.** Daily-horizon fade/follow decisions should not lean on rate
  differentials; 20-day ones legitimately could.
- Currency personalities are real but soft — AUD-as-China-proxy and
  JPY-as-haven are regime-average truths with plenty of counterexamples.
  Encode them as *features with measured weights*, not assumptions.
- Cross-currency basis: real and informative, but data access is the blocker
  (not on FRED in usable form; Bloomberg territory). Park it — note it as a
  "data limits beat fake productivity" case per house rules.
- Intervention levels: for USD/JPY specifically, MoF intervention zones are
  publicly telegraphed; as a *stop-placement consideration* near known zones
  this is free risk-awareness.

### [BUILD]
1. **Pair-personality metadata in `instrumentRegistry`.** Tag each instrument:
   haven/risk/commodity axis, funding-vs-investment carry role, China-proxy
   flag, intervention-risk flag (JPY, CHF). Pure data enrichment other bricks
   can consume (e.g., regime gate weights JPY strength differently than AUD
   strength). *Cheap; infrastructure.*
2. **Carry-unwind detector.** Rolling z of JPY strength vs AUD/NZD basket
   (`statsCore`) + FX realized-vol regime (we already compute σ). Emits a
   risk-off override flag consumed by the regime gate. *Prior: as an early
   warning it's plausible; as a tradeable signal alone, unproven. Test as a
   gate.*
3. **AUD/JPY as internal risk barometer.** We already have the pair's data;
   surface its trend/z on the dashboard as the course's "best risk-on proxy".
   *Context only.*
4. **Parked (data-blocked):** cross-currency basis monitor; institutional flow
   data. State this honestly rather than building lookalikes.

---

## Lesson 6 — Cross-asset synthesis (the institutional frame)

### [CORE]
- **Think in expressions, not instruments.** A macro view ("Fed cuts sooner
  than priced") can be expressed in 2Y rates, steepeners, swaptions, FX, gold,
  QQQ, or options — different vol, carry, convexity, and noise. The *cleanest*
  expression has the fewest confounders (inflation view → breakevens, not
  commodities; credit-stress view → CDX protection, not short equities).
  Equities are almost always the noisiest expression.
- **Four macro regimes (growth × inflation):** Goldilocks (↑g ↓i: risk-on,
  growth stocks), Reflation (↑g ↑i: value, commodities, short duration),
  Stagflation (↓g ↑i: nowhere to hide; real assets, cash), Deflation (↓g ↓i:
  max duration, quality, havens). Regime *transitions* are where the money is;
  cross-asset signals (curve shape changes, breakevens, credit) lead them.
- **Coherence.** When rates, credit, FX, equities, and vol all tell one story,
  conviction and trend-persistence are high (Q4 2023 "everything rally");
  when they diverge, someone is wrong — investigate, reduce size. Coherence is
  measurable: rolling cross-asset correlations vs regime norms.
- **Correlations are variables.** Stock–bond correlation is negative in
  growth-driven regimes, positive in inflation-driven regimes (2022 killed
  60/40), and → 1 in liquidation phases. Monitor with rolling/EWMA windows
  (λ ≈ 0.94); estimate stress correlations separately.
- **Case studies:** 2022 (rates led, real yields did the damage, credit
  confirmed, every signal visible in FI first); Q4 2023 (maximum coherence
  rally); March 2023 SVB (credit/CDS led equity, MOVE led VIX, regime flipped
  in 48h — crisis monitoring must be real-time, weekly reviews miss it).
- **Implementation reality (the course's own confession):** daily discretionary
  macro is near-hopeless at retail; edge lives in longer horizons, systematic
  implementation, infrastructure, and the retail trader's one structural
  advantage — **no benchmark, no redemptions, no career risk: the capacity to
  be patient and hold through drawdowns that force funds out.**

### [ANALYSIS]
- The regime quadrant is the tidiest mental model in the course, and also the
  most overfit-prone if turned into a trading rule naively: regime labels are
  assigned confidently only in hindsight, and the lesson admits identification
  is backward-looking. Any regime classifier we build must be judged on
  *transition detection latency* OOS, not on how well it colors past charts.
- "Coherence" is the course's most original testable idea: a scalar
  cross-asset agreement score conditioning trend-vs-reversion behavior. It
  rhymes with what `dayTypeScore` already does intraday (drift ÷ diffusion →
  fade vs follow) — coherence is the same fade/follow question asked at the
  cross-asset, multi-week scale.
- The "retail edge = patience + no career risk" point is the honest kernel of
  the entire course, and it matches CLAUDE.md §4: the durable retail edge is
  risk management, diversification, sizing — not entries.
- Expression-selection is mostly not actionable for us (we trade spot FX +
  gold only), but its *lesson* transfers: our version is "if a macro view says
  USD weakness, its cleanest expression here is a directional bias across all
  USD pairs at the 20-day horizon — not a single-pair daily fade."

### [BUILD]
1. **Regime classifier as a selector (the lego way).** A growth×inflation or
   HMM-based regime state (`indicatorCore`/`statsCore` have the parts; the
   repo already has HMM engines) whose ONLY job is `regime → strategy
   weights/gate` — a selector on top of the existing primitive, per Lego
   Principle 4, never new tunables. Judge OOS on whether gating beats
   ungated incumbent. *Prior: regime gating is the single most promising
   macro-integration path for this repo; still ≤ 50/50 it beats the incumbent
   OOS, because our incumbent already has a vol-regime input.*
2. **Cross-asset coherence score (research project).** Rolling correlation
   agreement across the pairs+gold we already hold data for (and FRED yields),
   scored vs regime-typical values. Hypothesis to pre-register: *high
   coherence → follow-type entries outperform; low coherence → fades
   outperform / stand down.* This composes directly with the fade/follow
   engine (`ENTRY_ZONE_CONFIDENCE.md`). *Prior: novel-ish, genuinely testable
   with existing harness; coin-flip, but cheap in compute and it's OUR kind of
   question.*
3. **Correlation-regime monitor.** EWMA (λ=0.94) correlation matrix of our
   traded pairs + gold, flagged when it deviates from trailing norms
   (correlation-spike = de-risk). Doubles as a portfolio-risk view for the
   book. *Risk infrastructure; strong prior it's useful for sizing even if it
   never touches entries.*

---

## Cross-cutting insights worth internalizing (the actual "training set")

1. **Trade causes, not effects — or at least know which one you're trading.**
   Every instrument sits at a level in the cascade; know what's upstream of it
   and check upstream before entering.
2. **Horizon is a design parameter, not an afterthought.** SNR and cost drag
   both improve with holding period; macro features only work weeks-out. Our
   daily/weekly/20-day horizon family is the right skeleton — macro inputs
   should attach at 20-day first, daily last or never.
3. **Regime > signal.** The same setup means different things in different
   regimes; correlations, carry, even the rate-diff↔FX link are all
   regime-conditional. Every claim in this note carries an implicit "in the
   current regime."
4. **Everything macro we can use is a gate/filter/selector, not an entry.**
   This is both the course's honest conclusion and this repo's architecture
   (score → choice selectors on one primitive). The build list above is
   deliberately all gates, features, and dashboards — zero new bespoke legs.
5. **Positioning inverts news.** Ask "who is trapped?" before "what does it
   mean?" Crowding is potential energy; catalysts just release it.
6. **Liquidity and calendar flows are the tide.** They won't give us entries,
   but fighting them (fading month-end flows, holding through FOMC variance)
   is a measurable, avoidable cost.
7. **The blindfold problem is solvable and it's free.** Knowing a strategy's
   full statistical profile before deployment converts drawdowns from
   emotional events into statistical ones. We have the harness; we should
   surface the DD-context everywhere.
8. **Patience is the retail edge.** No benchmark, no redemptions. Systems +
   longer horizons + the ability to sit through variance that fires fund
   managers. Build for weeks-to-months; leave intraday to the noise.
9. **The course grades itself honestly at the end — mirror that.** Framework
   knowledge ≠ edge. Everything above is hypothesis until it survives the
   honest harness OOS with ≥30 trades and full costs.

---

## Prioritized build queue (with blunt priors, per the honest-teammate contract)

| # | Idea | Type | Blunt prior | Cost |
|---|---|---|---|---|
| 1 | Rate-differential brick (2Y spreads → per-pair bias, 20-day horizon) | Feature + OOS test | Best-supported macro claim in the course; as a filter on existing strategies, maybe ~30–40% it shows a real OOS improvement; standalone, lower | Medium |
| 2 | Risk-regime gate (JPY/AUDJPY/corr-spike + curve/credit from FRED) | Selector/gate + A/B OOS | Risk management with a real shot at improving OOS risk-adjusted results; ~coin-flip to beat incumbent which already has vol-regime | Medium |
| 3 | Event calendar gate (FOMC/CPI/NFP suppression windows) | Filter + OOS test | Plausible variance reduction; cheap to test on existing trade logs | Low |
| 4 | Morning macro scan card (FRED: 2Y, 10Y, 2s10s, HY OAS, TIPS) + net-liquidity | Dashboard/context | No edge claimed; high owner value | Low |
| 5 | metricsCore additions (max consec losses, DD duration, tail ratio) + DD-context card | Brick + reporting | Not edge; directly fixes the blindfold problem | Low |
| 6 | Coherence score → fade/follow conditioning | Research + OOS test | Coin-flip, novel, composes with our engine; pre-register outcomes | Medium |
| 7 | Correlation-regime monitor (EWMA matrix, spike alarm) | Risk infra | Useful for sizing regardless of entry edge | Low |
| 8 | COT positioning gate | Filter + OOS test | Coin-flip at best; weekly data, slow verdict | Low-Med |
| 9 | Calendar-flow flags (month-end/OpEx exclusion test) | Filter test | Weak prior; cheap falsification | Low |
| — | Cross-currency basis, institutional flow data | Parked | Data-blocked in this environment; don't build lookalikes | — |

**Default expected outcome for every row above: null.** That is the base rate
and finding it cheaply is a win. Each test gets pre-registered pass/fail
criteria (OOS Sharpe vs incumbent, ≥30 OOS trades, full costs) before any code
runs.

---

## Study questions (self-test on re-read)

1. Reproduce the cascade order and the typical lag at each level. Why does
   signal quality degrade downstream?
2. Why is the 2Y the FX-relevant tenor rather than the 3M or the 10Y?
3. A "risk-off" headline day, but AUD is rallying and JPY is flat. What does
   the framework say to do with the narrative?
4. Stocks +1.5%, HY spreads +25bp on the day. Interpret.
5. Dots print above market pricing at the SEP. Expected first-order moves in
   yields, USD, equities — and which phase of the FOMC reaction do you trust?
6. Why did 60/40 fail in 2022? State it in one sentence using the
   stock–bond-correlation regime language.
7. USD is making highs. List the three Dollar-Smile diagnoses and one
   confirming indicator for each.
8. What is the ONLY way any idea in this note gets called "edge" in this repo?
   (Answer: survives the honest harness OOS, ≥30 trades, full costs, beats the
   incumbent — everything else is "built", at most "works".)

---

*Filed 2026-07-10. Companion docs: `CLAUDE.md` (working agreement),
`SYSTEM_ASSESSMENT.md`, `TRADABILITY_REVIEW.md`, `ENTRY_ZONE_CONFIDENCE.md`,
`LEGO_MODULES.md`. Nothing in this note is a tested result; it is a study
artifact and idea backlog.*
