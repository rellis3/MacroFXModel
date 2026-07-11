# Quant & Macro Insights — Lesson Notes (Lessons 1–6)

**Source:** "Colez Trades — Quantitative & Macro Insights" (C.OG), Lessons 1–6.
**What this file is:** raw education notes on the lesson material — the key facts,
frameworks, numbers, mechanisms, case studies and checklists as taught — kept as a
study document to learn from and to investigate further off later.

**Data note (from the course itself):** specific correlations, percentages and
figures in the lessons are *exemplar data* representing typical historical ranges.
Actual values vary by time period, market regime and measurement methodology. The
relationships and concepts are well-established; exact numbers should be verified
with current data before trading.

---

# Lesson 1 — Repositioning Your Approach to Financial Markets

## 1.1 Market microstructure & noise

- Markets aggregate information from a huge range of heterogeneous participants:
  central banks, pension funds, sovereign wealth funds, hedge funds, prop desks,
  algorithmic traders. Their differing time horizons, mandates and information
  sets create **market noise** — price movements that are fundamentally random and
  carry no predictive signal.
- **Signal-to-noise ratio:** `SNR = Signal Power / Noise Power`
  - **SNR < 1 (low):** noise dominates; random fluctuations overwhelm signal.
  - **SNR ≈ 1 (neutral):** signal and noise roughly equal; edge uncertain.
  - **SNR > 1 (high):** signal dominates; exploitable patterns emerge.
- SNR varies with **holding period**: short horizons are noise-dominated; longer
  horizons move through a transition zone into signal-extractable territory.
  Extending the holding period improves signal-extraction potential.

## 1.2 Transaction cost friction

- Institutions access markets through prime brokerage with materially different
  cost structures than retail execution.
- At shorter horizons, costs compound geometrically: spread, slippage, market
  impact, opportunity cost.
- **Alpha-erosion example:** a strategy with 5bps expected alpha per trade becomes
  negative EV when transaction costs exceed that threshold — common at high
  frequencies.
- **The double penalty:** short horizons suffer BOTH low SNR (noise dominates) AND
  high transaction-cost impact — a compounding disadvantage that makes alpha
  extraction at short horizons exceptionally difficult.
- The crossover point where expected alpha exceeds friction determines the
  **minimum viable holding period** for any strategy.

## 1.3 Two approaches to strategy development

**Systematic practitioner (data-driven):**
- Hypothesis generation from empirical observation
- In-sample parameter estimation with regularisation
- Out-of-sample validation on held-out data
- Walk-forward analysis simulating live deployment
- Monte Carlo simulation for tail-risk assessment
- Paper trading before capital allocation

**Retail trader (intuition-based, no validation):**
- Hypothesis from intuition or narrative
- No systematic parameter optimisation
- Live market is the only test environment
- Strategy invalidation requires months of live trading
- Drawdown limits discovered through experience
- Real capital at risk from day one

## 1.4 Time & capital comparison

| Metric | Systematic | Intuition-based |
|---|---|---|
| Time to invalidation | ~2 weeks | ~6 months |
| Capital risked to test | $0 | 100% |
| Strategies tested per year | 50+ | 2–3 |
| Cost of a failed strategy | Time only | Time + money |

## 1.5 Strategy lifecycle timelines (side-by-side)

**Systematic:**
- Week 1 — hypothesis & data preparation: clean data, define universe, establish
  hypothesis with clear falsifiability criteria.
- Week 2 — in-sample development: parameter optimisation with cross-validation;
  guard against overfitting.
- Week 3 — out-of-sample validation: test on held-out data; strategy shows
  degradation → rejected. **No capital lost.**
- Week 4 — new hypothesis iteration: pivot to a refined hypothesis; begin a new
  validation cycle; capital preserved.

**Intuition-based:**
- Week 1 — live trading begins: capital deployed immediately on conviction;
  "testing" via P&L.
- Month 1 — early results mixed: −8% drawdown; unclear if noise or failure;
  continues trading.
- Month 3 — drawdown deepens to −15%; conviction wavers but insufficient data to
  conclude failure.
- Month 6 — strategy abandoned: −22% drawdown; 6 months lost. **Double negative:
  lost time AND lost capital.**

## 1.6 The validation funnel

Systematic practitioner (example numbers):
- 52 hypotheses generated → 34 pass in-sample → 13 pass out-of-sample → 6 pass
  walk-forward → **4 deployed live**.
- $0 lost to failed strategies; 48 strategies rejected safely.

Intuition-based:
- 3 hypotheses generated → all validation stages skipped → 3 deployed live
  untested; 100% of capital exposed during "testing"; 0 validated before
  deployment.

## 1.7 The information asymmetry — metrics known before deployment

The systematic practitioner enters live trading with a complete statistical
profile (11/11 metrics known from backtest); the intuition-based trader knows
0/11 and discovers them through live P&L — "paying tuition to the market."

| Metric | Definition / why it matters |
|---|---|
| **CAGR** | Expected annualised return; is the strategy worth the operational overhead and opportunity cost of capital? |
| **Sharpe ratio** | Return per unit of volatility; enables comparison across strategies and asset classes. Below 0.5 generally unacceptable. |
| **Sortino ratio** | Return per unit of downside deviation; more relevant than Sharpe when losses matter more than volatility (i.e. always). |
| **Maximum drawdown** | Largest peak-to-trough decline; critical for survival — determines position sizing and whether you can psychologically and financially endure the strategy. |
| **Drawdown duration** | Time to recovery; a 20% drawdown lasting 18 months will break most investors — know it before deployment. |
| **Win rate** | % of winning trades; psychological sustainability — a 30% win-rate strategy can be highly profitable but emotionally brutal without preparation. |
| **Profit factor** | Gross profit ÷ gross loss; below 1.0 = losing strategy; below 1.5 leaves little margin for execution slippage. |
| **Max consecutive losses** | Longest losing streak; even profitable strategies have 10+ consecutive losses — without this knowledge, streaks feel like strategy failure. |
| **Expectancy** | Average profit per trade after costs; negative expectancy = guaranteed long-term loss. |
| **Calmar ratio** | CAGR ÷ max drawdown; "is the expected return worth the worst historical pain?" |
| **Tail ratio** | Right tail ÷ left tail (95th percentile); are your big days wins or losses? Critical for the true risk profile. |

## 1.8 The blindfold problem — interpreting a drawdown

Same −15% drawdown, completely different decision quality:

- **With backtest data:** historical max DD −22%; avg DD duration 47 days; current
  DD 31 days; 8 similar historical drawdowns, 8/8 recovered → *within expected
  parameters; continue executing; this is normal variance.*
- **Without backtest data:** historical max ???, expected duration ???, is this
  normal ???, will it recover ??? → *no framework for the decision; likely
  abandons the strategy at the worst possible time, locking in losses.*
- Monte Carlo simulation (e.g. 1,000 simulated equity paths) shows the range of
  expected outcomes before deployment.
- The intuition trader with no statistical framework "often abandons at precisely
  the wrong moment."

## 1.9 Lesson 1 key takeaways (as given)

- **Signal vs noise:** at short horizons noise dominates; extend holding periods
  to improve signal extraction.
- **Transaction cost drag:** costs compound at high frequencies; the crossover
  point of alpha vs friction sets the minimum viable holding period.
- **Systematic validation:** walk-forward testing costs compute, not capital;
  most hypotheses fail — the advantage is discovering failure *before* deployment.
- **The double negative:** ad-hoc validation risks destroying time AND capital
  simultaneously; systematic approaches decouple these — failed strategies
  consume only time.

---

# Lesson 2 — Understanding What Moves Markets

## 2.1 The capital flow hierarchy

- Policy decisions cascade through asset classes in predictable sequences, like
  dominoes. Most traders watch the last domino (stocks) without seeing what
  pushed the first (central bank policy).
- **Weather-system analogy:** central banks are the pressure systems; watching
  only stocks is looking out the window instead of at the weather map.
- **The information cascade:** a Fed policy shift → bond markets react within
  hours → currencies adjust over days–weeks → equity valuations reprice over
  weeks–months → credit spreads adjust over months. Each level down adds noise,
  lag and interpretation error. By the time policy affects the stock you watch,
  smart money positioned months ago.
- **The retail disadvantage:** most retail participants trade at Levels 4–5
  (equities, single stocks) without understanding Levels 1–3 — trading effects
  while institutions trade causes.

**The hierarchy:**

| Level | Asset class | Primary drivers | Typical lag | Signal quality | Dominant participants |
|---|---|---|---|---|---|
| 1 | Central banks | Inflation mandates, employment, financial stability | Source | Highest | Policy committees, primary dealers |
| 2 | Government bonds | Rate expectations, term premia, flight-to-quality | Hours–days | High | Central banks, sovereign wealth, pension funds |
| 3 | G10 currencies | Rate differentials, current account, risk sentiment | Days–weeks | Medium-high | Real money, macro funds, corporates |
| 4 | Equity indices | Earnings expectations, discount rates, risk appetite | Weeks–months | Medium | Asset managers, pension funds, retail |
| 5 | Corporate credit | Default risk, spread compression, liquidity | Months–quarters | Lower | Insurance, credit funds, banks |

**Quantitative implications:**
- Lead-lag: bond yields tend to lead equity returns by 3–6 months in rate-driven
  regimes (exemplar: 2022 hiking cycle); rate differentials lead FX moves by
  2–8 weeks on average.
- During regime changes macro factors can explain the majority of cross-asset
  variance; in normal conditions idiosyncratic factors dominate more.
- SNR at the bond/rates level is materially higher than at the equity level for
  medium-term moves.
- Crowding: the lower the hierarchy level, the more participants, the more
  crowded the information, the smaller the edge.

**Worked example — rate hike transmission:**
1. Fed announces +0.25%. (The original signal.)
2. Bond markets reprice within hours; 2Y yields jump, bond prices fall.
3. Currency markets adjust over days–weeks; money flows into USD; dollar
   strengthens.
4. Stocks reprice over weeks–months; higher borrowing costs; future profits worth
   less today; growth stocks hit hardest.
5. Credit follows over months; refinancing costs rise; riskier bonds fall;
   defaults may increase.

**Definitions:**
- *Primary dealers:* the ~24 major banks (Goldman, JPM, …) that trade directly
  with the Fed — they see and react to policy first.
- *Sovereign wealth funds:* government-owned funds (Norway's oil fund,
  Singapore's GIC) managing hundreds of billions.
- *Signal-to-noise here:* signal = information that predicts future prices;
  noise = meaningless fluctuation. Top of hierarchy = mostly signal; bottom =
  wading through noise.

**Practical application (as taught):** before any position, check the levels
above you. Trading equities → check bond yields, curve slope, credit spreads
first. Trading FX → check rate expectations via Fed Funds futures, 2Y
differentials, forward guidance. Trading anything → "What's the Fed/ECB/BoJ
doing and how is it flowing through to my asset class?"

## 2.2 Interest rate mechanics & capital flows

- Interest rates are **the price of money**; money flows to the highest
  risk-adjusted return. This drives trillions in daily flows and explains the
  majority of medium-term FX and cross-border allocation moves.
- Core intuition: $1M at 5% (country A) vs 1% (country B) → money flows to A;
  multiplied across thousands of investors this flow is what moves currencies.

**Key figures:**
- **$7.5T daily FX volume** — largest market globally (~30× US stock market
  daily volume); highly liquid, dominated by large institutions.
- **0.7–0.9 correlation** USD/JPY ↔ US–Japan rate differential (exemplar range;
  regime-dependent — >0.85 during 2021–24 hiking cycle; long-term average nearer
  0.6–0.75; weakens in risk-off when JPY rallies as safe haven regardless).
- **2Y is the key maturity** — roughly how far ahead markets predict CB policy;
  the 2Y yield is the market's best guess at future rates.
- **6–18 months** — historical average lag from rate cycles to full equity
  impact; bond traders often see equity moves coming far in advance.

**Carry trade mechanics:**
- Borrow low-yield currency, invest in high-yield currency, pocket the
  differential (e.g. borrow JPY at 0.1%, deposit USD at 5% → ~4.9% carry).
- Return decomposition: carry component ~80% of total returns in calm periods;
  spot component ~20%; volatility drag negative during unwinds — can exceed
  carry.
- **Unwind risk:** "picking up pennies in front of a steamroller." Returns steady
  until a risk event triggers mass deleveraging; JPY can rally 10% in days.
- **Carry-unwind chain reaction:** (1) something scares markets → (2) carry
  traders rush to exit, selling high-yield investments and buying back
  yen/francs → (3) safe-haven currencies spike → (4) risk assets fall together
  as liquidity is withdrawn.
- Key insight: sudden JPY strength on a "risk-off" day is the mechanical
  unwinding of trillions in carry trades — anticipate it rather than react.

**Rate-cycle playbooks:**

*When rates rise (tightening):*
| Asset | Direction | Mechanism |
|---|---|---|
| Domestic currency | Strengthens | Capital inflows seeking yield |
| Bond prices | Fall | Inverse price-yield relationship |
| Growth stocks | Underperform | Higher discount rate on future cash flows |
| Value / banks | Outperform | Net interest margin expansion |
| Gold | Pressured | Higher real rates raise opportunity cost |
| EM assets | Outflows | Relative carry diminishes |

*When rates fall (easing):* the mirror image — currency weakens, bonds rally
(duration gains), growth outperforms, value/banks underperform (margin
compression), gold supported, EM inflows.

- *Growth vs value:* growth stocks are valued on far-future profits — rate rises
  discount those harder; value/banks often benefit from higher rates via loan
  pricing.
- *Gold nuance:* gold responds primarily to **real** rates (nominal − inflation).
  If inflation rises faster than nominal rates, gold can rally even as the Fed
  hikes — watch TIPS yields, not just nominal rates.

**Critical rate spreads watchlist:**
| Spread | Role | Read |
|---|---|---|
| 2Y–10Y | Yield-curve slope | Inversion → recession signal |
| US–DE 2Y | EUR/USD driver | Widening → USD strength |
| HY–IG | Credit risk appetite | Widening → risk-off |
| OIS–SOFR | Funding stress | Widening → liquidity strain / bank nervousness |

**Case study — the 2022 rate shock:** Fed pivoted hawkish late 2021, fastest
hiking cycle in 40 years; the hierarchy transmitted predictably:
- Weeks 1–4: 2Y yields 0.25% → 1.5%; bonds repriced immediately.
- Months 1–3: DXY +15% as differentials widened; EUR/USD 1.15 → parity.
- Months 3–9: Nasdaq −35%; growth crushed by duration sensitivity.
- Months 9–18: HY spreads +250bps; credit finally repriced the regime.
- *Lesson:* those watching Level 2 (bonds) exited growth stocks 3–6 months before
  the bottom fell out; those watching headlines bought the dip all the way down.

## 2.3 Risk regime dynamics

- Markets oscillate between **risk-on** and **risk-off**; in these regimes
  cross-asset correlations become highly predictable as capital mechanically
  flows between "safe" and "risky" assets. *Knowing which regime you're in
  matters more than your specific trade thesis.*
- **The correlation regime problem:** Modern Portfolio Theory assumes stable
  correlations; in stress, correlations converge toward 1 — everything falls
  together, exactly when diversification is needed.
  - 0.2–0.4 = normal markets, diversification works.
  - 0.5–0.7 = elevated stress, correlations rising, reduce exposure.
  - 0.8–1.0 = crisis mode, everything moves together, cash is king.

**Regime identification indicators:**
- VIX level: <15 calm; 15–25 normal; 25–35 elevated; 35+ panic.
- VIX term structure: contango = normal/complacency; backwardation = fear and
  hedging demand.
- Credit spreads: HY OAS < 350bps risk-on; > 500bps risk-off.
- JPY & CHF strengthening = risk-off flows in progress.
- Gold and USTs both rising = classic flight-to-quality.

**Risk-on characteristics:** VIX below ~18, credit spreads tightening, EM
outperforming DM, carry trades profitable, positive equity-bond correlation
(both can fall as rates normalise higher). Rallies: S&P/Nasdaq, AUD/JPY (best
risk-on proxy). Falls: VIX, Treasury prices (safety sold).

**Risk-off:** capital exits risk assets (equities, EM, credit, oil, AUD) into
safe havens (USTs, JPY, CHF, gold, USD cash).

**Cross-asset correlation matrix (exemplar, "normal" conditions):**

|  | SPX | UST10Y | Gold | DXY | Crude | HY | VIX |
|---|---|---|---|---|---|---|---|
| SPX | 1.00 | −0.30 | 0.15 | −0.25 | 0.45 | 0.85 | −0.82 |
| UST10Y | −0.30 | 1.00 | 0.40 | 0.20 | −0.35 | −0.25 | 0.28 |
| Gold | 0.15 | 0.40 | 1.00 | −0.55 | 0.25 | 0.18 | 0.20 |
| DXY | −0.25 | 0.20 | −0.55 | 1.00 | −0.42 | −0.20 | 0.22 |
| Crude | 0.45 | −0.35 | 0.25 | −0.42 | 1.00 | 0.50 | −0.38 |
| HY | 0.85 | −0.25 | 0.18 | −0.20 | 0.50 | 1.00 | −0.78 |
| VIX | −0.82 | 0.28 | 0.20 | 0.22 | −0.38 | −0.78 | 1.00 |

- **Critical warning (from the lesson):** correlations are NOT stable. March
  2020: correlations spiked to 0.9+ across risk assets within 48 hours. 2022:
  the −0.30 SPX/UST correlation flipped to +0.40 for much of the year — stocks
  and bonds fell together. A "diversified" portfolio can become a single
  concentrated bet. Verify current regime correlations before relying on
  historical averages.

**Practical application — daily risk dashboard checklist:**
1. VIX level & structure — VIX1/VIX2 ratio below 0.9 = stress.
2. Credit canary — CDX HY widening >20bps in a day = early warning.
3. FX tells — JPY strength vs high-beta currencies (AUD, MXN) = risk-off flows.
4. Correlation check — stocks and bonds moving together = normal relationships
   broken.
- **Rule:** if 3+ indicators flash warning, reduce gross exposure *before*
  analysing individual positions.

## 2.4 Central bank liquidity regimes

- **Liquidity is the dominant variable in modern markets.** "Don't fight the Fed"
  isn't wisdom — it's mathematics.
- Liquidity = amount of money in the financial system. More money = higher asset
  prices; less = lower. **Bathtub analogy:** central banks control the faucet;
  QE raises the water level and everything floats higher; QT drains it.
- Crucial 2020 example: earnings collapsed, unemployment spiked, worst GDP
  quarter ever — stocks rallied ~70% off the lows because the Fed injected
  ~$3T. **Liquidity beat fundamentals. It almost always does.**
- Combined Fed+ECB+BoJ+BoE balance sheets and the S&P 500 move together across
  QE zones (up) and QT zones (struggle).

**Definitions:**
- **QE (quantitative easing):** CB creates new money and buys bonds from banks —
  cash into the banking system, eventually into other assets.
- **QT (quantitative tightening):** CB lets bonds mature without replacement or
  sells; money removed from the system.

**QE transmission mechanism (steps):**
1. Central bank creates reserves (digital money creation).
2. Buys government bonds from primary dealers.
3. Dealers receive cash and must deploy it somewhere.
4. Cash flows into next-best alternatives (credit, equities).
5. Asset prices rise, yields compress, risk-taking increases.
6. Wealth effect → economic activity (in theory).

**QE market impact table:**
| Asset class | Direction | Magnitude (typical/exemplar) |
|---|---|---|
| Equity indices | ↑ strong rally | historically +15–25% per $1T (varies widely) |
| Bond yields | ↓ compressed | −50–100bps typical |
| Credit spreads | ↓ tighter | −100–200bps HY |
| Domestic FX | ↓ weaker | −5–10% on major pairs |
| Volatility | ↓ crushed | VIX to sub-15 |
| Commodities | ↑ supported | dollar-weakness effect |

- *Why QE weakens the currency:* more dollars in circulation → supply/demand →
  dollar falls vs other currencies.

**Case study — the 2020 liquidity firehose:**
- Mar 23: Fed announces unlimited QE → S&P bottoms within hours.
- Apr–Jun: $2.9T injected; SPX +45% from lows despite worst GDP print ever.
- Jul–Dec: $120B/month continued; Nasdaq new highs monthly.
- Key tell: the bottom came from the liquidity announcement, not vaccine news or
  economic data. *Fundamentals said sell; liquidity said buy; liquidity won.*

## 2.5 Institutional flow calendar

- Institutional money moves on predictable schedules — pension rebalancing, index
  reconstitution, options expiration, month-end flows — creating mechanical
  buying/selling pressure unrelated to fundamentals. Know the calendar so you
  aren't the liquidity for someone else's forced trade.
- Why they exist: mandates. A 60/40 fund whose equities rally to 65% MUST sell
  at month-end to rebalance — not a choice.

**Month-end rebalancing mechanics:**
1. Stocks outperform during the month (e.g. +5% vs flat bonds).
2. Portfolio is now overweight equities (62/38 vs 60/40 target).
3. Fund must sell stocks / buy bonds — selling winners, buying losers (opposite
   of momentum).
4. Creates counter-trend pressure in the final 2–3 days after a strong month.
- *Trading implication:* don't chase breakouts on the 29th–31st after a strong
  rally; wait for rebalancing flows to complete.

**Options expiration (OpEx):**
- Monthly options expire the 3rd Friday.
- **Pin risk:** prices gravitate toward strikes with high open interest into
  expiry (hedging mechanics, not news).
- **Gamma squeeze:** dealer hedging near expiry can amplify moves in either
  direction — self-reinforcing loops.
- *Trading implication:* OpEx week (especially Friday) is dominated by hedging
  flows, not information; reduce directional bets into expiry; real moves often
  happen the week after.

**Seasonality (S&P 500 average monthly returns, exemplar 1950–2024):**
- **September** historically the weakest month (74-year pattern). Theories:
  tax-loss selling before October mutual-fund fiscal year-end, institutional
  portfolio reviews, pattern-following.
- **November–December** historically strong ("Santa rally" / year-end rally):
  tax-loss selling done, bonus-driven buying, holiday optimism. The "why"
  matters less than the "what".
- **Quarter-end window dressing:** managers buy winners to show in reports.
- Key rule: *know when forced flows happen so you're not their liquidity.*

## 2.6 Positioning data & flow analysis

- **News explains moves retroactively; positioning shows where crowded trades are
  before they unwind.** The same headline can be bullish or bearish depending on
  existing positioning. Positioning is potential energy.
- **Room analogy:** everyone leaning on one wall → any shout of "fire" causes a
  violent stampede to the other side; people spread evenly → orderly movement.

**The narrative trap (same news, opposite headlines):**
| If stocks rise | If stocks fall |
|---|---|
| "Stocks rally on strong jobs data" | "Stocks fall on hot jobs (Fed fears)" |
| "Market shrugs off hawkish Fed" | "Hawkish Fed sends stocks tumbling" |
| "Earnings beat expectations" | "Guidance disappoints despite beat" |

- The narrative is written AFTER the move to explain it; it has zero predictive
  value. Pros ask: *"How is the market positioned, and will this news force
  repositioning?"* — not "what does this news mean?"

**Key positioning data sources:**
- **CFTC COT report (Fridays):** futures positioning by trader type (commercial
  hedgers vs speculators); extreme spec long/short often precedes reversals.
- **Fund flow data:** ETF/mutual-fund flows; massive inflows often mark tops
  (everyone who wants to buy has bought); outflows can mark bottoms.
- **Short interest:** very high short interest = squeeze potential if price
  rises.
- **Options put/call ratio:** heavy puts = bearish sentiment (contrarian buy);
  heavy calls = bullish sentiment (contrarian sell).

**Positioning readings:**
- **Extreme long:** crowded long, vulnerable to negative catalysts — everyone who
  wants to buy already has; who's left to buy?
- **Neutral:** no extreme; fundamentals and news flow drive direction.
- **Extreme short:** crowded short, vulnerable to squeeze — forced covering
  accelerates rallies.

**Case study — GameStop (2021), a textbook positioning unwind:**
- Setup: 140% short interest (more shares short than existed) — extreme crowding.
- Catalyst: retail buying → price rise → shorts faced margin calls.
- Unwind: forced covering → more buying → more margin calls — reflexive loop.
- Result: +1,700% in weeks with nothing about the business changed.
- *Lesson:* extreme positioning is stored energy; catalysts release it; the
  magnitude of the move is proportional to the crowding, not the importance of
  the news.

**Pre-trade positioning checklist:**
1. Who's already in this trade? (COT, flows, options positioning)
2. What would force them out? (identify the unwind catalyst)
3. Am I early or late? (if everyone's talking about it, you're late — the move
   happens when positioning builds, not when it's recognised)
4. What's my edge over the crowd? (if you can't identify it, you ARE the crowd)

## 2.7 Lesson 2 key takeaways (as given)

- **The hierarchy is not optional:** CBs → bonds → FX → equities → credit;
  information degrades at each level; check the levels above before any position.
- **Rates drive everything:** differentials explain the majority of FX moves;
  rate cycles lead equity cycles 6–18 months; watch the 2Y.
- **Know your regime:** risk-on/off are distinct states; correlations spike in
  stress; check VIX structure and credit spreads daily.
- **Liquidity trumps fundamentals:** track Fed balance sheet, RRP, TGA weekly;
  don't fight the flow.
- **Flows are mechanical:** month-end, OpEx, reconstitution create predictable
  forced flows; don't provide liquidity to scheduled flows unless paid to.
- **Position before narrative:** extreme positioning + catalyst = violent move;
  check COT, flows, options OI before trading headlines.

---

# Lesson 3 — Central Bank Policy Deep Dive

*(Course note: structural knowledge that stays relevant across cycles; specific
stances, rates and committee compositions change — verify current data.)*

## 3.1 The Federal Reserve: structure & decision-making

- Markets react to **changes in expectations** about Fed decisions, not just the
  decisions. Anticipating where the Fed is heading before it's fully priced =
  edge. Requires: (1) what inputs the Fed watches, (2) how members think,
  (3) how their communication reveals intent.

**Structure numbers:** 12 regional Fed banks; 7 Board governors (permanent FOMC
voters); 12 FOMC voters per meeting; 8 scheduled meetings per year.

**The dual mandate:**
1. **Maximum employment** — lowest sustainable unemployment without triggering
   inflation; the "natural rate" (u*) is estimated, not fixed.
2. **Price stability** — since 2012 an explicit 2% inflation target measured by
   **PCE** (not CPI); 2020 shift to *average inflation targeting* (inflation may
   run above 2% temporarily to make up for shortfalls).
- *Trading implication:* low unemployment + high inflation = no tradeoff → Fed
  tightens aggressively. High unemployment + high inflation (stagflation) =
  painful choice → watch which mandate they prioritise.

**FOMC composition:**
- Permanent voters (7): Chair (most powerful voice), Vice Chair, 5 other
  governors (presidential appointees, Senate-confirmed).
- Rotating voters (5): NY Fed president (permanent voter — market operations
  role) + 4 regional presidents rotating annually.
- Non-voting participants (7): remaining regional presidents attend, discuss,
  submit projections; they influence the committee and signal future policy when
  they rotate in.

**Hawk–dove spectrum:**
- **Dovish:** prioritises employment; tolerates higher inflation; slower to hike.
- **Neutral:** balanced, data-dependent, flexible on timing.
- **Hawkish:** prioritises price stability; inflation-focused; quicker to hike.
- Hawk-heavy committee → faster tightening, higher terminal rates, hawkish
  surprises. Dove-heavy → patience, lower terminal rates, employment emphasis.
- The Chair's view usually dominates, but a strongly opposed committee can
  constrain the Chair — **watch dissents**; they map the range of views.

**The Fed's reaction function:**
| Input | What the Fed watches | Policy response | Market impact |
|---|---|---|---|
| Inflation (PCE) | Core PCE YoY, expectations surveys, breakevens | Above 2% → tighten; below → ease | Hot CPI = hawkish repricing, yields up |
| Employment | NFP, unemployment rate, JOLTS, wage growth | Tight labor → tighten; rising unemployment → ease | Strong jobs = hawkish; "bad news is good news" late-cycle |
| Financial conditions | Credit spreads, equity levels, lending surveys | Loose → can tighten more; tight → pause/ease | Market selloffs can slow Fed tightening |
| Global factors | Dollar strength, foreign CB policy, global growth | Strong USD = effective tightening already; global stress → cautious | Global risk-off can delay hikes |

**Fed-watcher scorecard (before each FOMC):**
1. Inflation check — core PCE vs 2%, trend direction.
2. Labor check — unemployment direction, wage growth.
3. Financial conditions — spreads tight/wide, big equity moves.
4. Committee composition — who votes this year, net hawk/dove tilt.
5. Recent Fedspeak — what members have signalled, tone shifts.

## 3.2 The FOMC communication cycle

**Communication hierarchy (most → least important):**
1. FOMC statement (official decision + forward guidance)
2. Press conference (Chair's interpretation; Q&A reveals nuance)
3. Minutes (detailed discussion, released 3 weeks later)
4. Individual speeches (personal views; can signal future consensus)
5. Interviews / Congressional testimony (often more candid)

**Meeting timeline:**
- T−14 to T−10 days: **blackout period** begins — officials stop public comment;
  speeches just before blackout are especially important (last chance to signal).
- T−1 (Tue): meeting day 1 — economic review, staff presentations.
- T-day (Wed) 2:00 PM ET: **statement released** — the most important moment;
  markets react immediately.
- T-day 2:30 PM ET: **press conference** — can reinforce or modify the market's
  interpretation.
- T+3 weeks (Wed) 2:00 PM ET: **minutes released** — range of views, specific
  concerns, dissent reasoning.

**Reading the statement — word changes are the signal:**
| Language shift | Signal |
|---|---|
| "some further" → "further" | Hawkish — more tightening coming |
| "monitoring" → "closely monitoring" | Dovish — increased concern |
| "gradual" → "patient" | Dovish — slower pace |
| "balanced" → "weighted to downside" | Dovish — growth worry |
| adding "elevated" before inflation | Hawkish — inflation concern rising |
| removing forward guidance | Neutral — flexibility, data-dependent |
- *Pro tip:* diff the statement against the previous one — changes are the
  signal, not the absolute language.

**The press conference edge:**
- Prepared remarks (first 10–15 min): tone (confident vs cautious), emphasis
  reveals priorities, new phrases not in the statement = important signal.
- Q&A: less scripted; hesitation/deflection; repetition of a theme = strong
  conviction; "we'll see"/"it depends" = genuine uncertainty.
- **Warning:** initial market reaction to the presser often reverses — the first
  move is algorithmic (keyword-based); real positioning comes in following
  hours/days as humans digest nuance.

**Reading the minutes efficiently:**
1. Skip to "Participants' Views" — the staff review is background.
2. Look for quantifiers: "a few" < "several" < "many" < "most" < "all" — they
   reveal committee consensus.
3. Find the "however" sentences — the "however" clause usually reveals the true
   concern.
4. Check the balance of risks — which scenarios were explicitly considered.

**FOMC meeting prep checklist:**
1. Review the previous statement (baseline language).
2. Check market pricing (CME FedWatch — probability of each outcome).
3. Read recent Fedspeak since the last meeting.
4. Note data releases since last meeting (CPI, NFP, PCE).
5. Identify key questions the market needs clarified.
6. Plan scenarios in advance: hawkish surprise → X; dovish surprise → Y; as
   expected → Z.

## 3.3 The dot plot & rate expectations

- **SEP (Summary of Economic Projections)** released 4×/year: March, June,
  September, December. Includes the dot plot.
- The dot plot shows where each FOMC participant (voters AND non-voters) thinks
  Fed Funds should be at each year-end plus the "longer run" (their neutral-rate
  estimate).
- **Critical:** dots are NOT forecasts — they are *conditional projections*
  (where rates SHOULD go IF the economy evolves as that member expects). When
  the economy surprises, the dots move.

**Reading the dot plot:**
- **Median dot:** media focus, but just one data point — the distribution matters
  more.
- **Range/dispersion:** wide = high uncertainty/disagreement; tight = consensus
  (more likely follow-through).
- **The shift vs the previous SEP is the signal**, not the absolute level.
- **Longer-run dots:** the neutral rate estimate (r*); rising longer-run dots =
  structurally higher rate environment.
- **The dot plot's dirty secret:** poor track record — 2021 dots showed zero
  rates through 2024; by 2022 rates were 4%+. Don't treat dots as commitments.

**Dots vs market pricing — where the edge is:**
| Scenario | Interpretation | Typical reaction |
|---|---|---|
| Dots > market | Fed more hawkish than priced | Yields ↑, stocks ↓, USD ↑ |
| Dots < market | Fed more dovish than priced | Yields ↓, stocks ↑, USD ↓ |
| Dots = market | Already priced | Focus shifts to statement/presser tone |
| Dispersion widens | Committee uncertain | Volatility ↑, path unclear |

**How to check market pricing:**
- **CME FedWatch tool** — free; market-implied probabilities per meeting.
- **Fed Funds futures** — implied rate = 100 − futures price; settles to the
  average effective FF rate for the month.
- **OIS (overnight index swaps)** — professional market; more liquid for
  longer-term pricing.

**The SEP beyond the dots:**
| Component | Shows | Watch for |
|---|---|---|
| GDP growth | Expected real growth by year | Marking down growth? Recession concern? |
| Unemployment rate | Expected jobless rate | Higher projection = acknowledging tightening pain |
| PCE inflation | Headline + core path | When do they expect 2%? How confident? |
| Longer-run estimates | Structural equilibrium | Rising r* = secular shift to higher rates |
- **Consistency check:** do the dots make sense given the projections? Low
  unemployment + low inflation projections don't compute with aggressive cuts —
  inconsistencies signal uncertainty or wishful thinking.

**SEP analysis framework:** (1) compare to previous SEP; (2) compare to market;
(3) check dispersion; (4) longer-run r* changing?; (5) cross-check dots against
GDP/unemployment/inflation forecasts; (6) count outliers and consider who they
might be.

## 3.4 Reading Fedspeak

- Fed officials speak a constructed language; phrases that sound vague carry
  precise meanings. **This isn't obfuscation — it's precision**: communicate
  intent (manage expectations) without committing (preserve flexibility). Learn
  the dictionary.

**Fedspeak decoder:**
| Phrase | Meaning |
|---|---|
| "Inflation remains elevated" | Hawkish — concerned, likely to act |
| "Inflation has eased" | Dovish — progress noted, may slow tightening |
| "Strongly committed to returning inflation to 2%" | Hawkish — no pivot coming |
| "We're seeing the effects of our policy actions" | Dovish — tightening is working |
| "The labor market remains tight" | Hawkish — wage-pressure concern |
| "Labor market coming into better balance" | Dovish — cooling appropriately |
| "Prepared to raise rates further if appropriate" | Hawkish — door open, don't price cuts |
| "We can proceed carefully" | Dovish — slowing pace, pause likely |

**"Data dependent" decoder:**
| Phrase | Actual meaning |
|---|---|
| "We are data dependent" | Standard disclaimer — signals nothing |
| "Particularly attentive to incoming data" | Next few prints heavily influence the decision |
| "The data will guide us" | Genuine uncertainty |
| "We need to see more evidence" | Current data isn't enough — inertia wins |
| "One/two prints don't change our view" | No reaction to next release — need a sustained trend |
- Key: when they say "data dependent," ask **which data** — inflation,
  employment, or financial conditions? The emphasis tells you the trigger.

**Language shifts precede policy shifts — example (2021–22 pivot):**
- Early 2021: "inflation is transitory" (no concern)
- Late 2021: "perhaps time to retire 'transitory'" (concern emerging)
- Dec 2021: "inflation is persistent" (major language shift)
- Jan 2022: "prepared to raise rates" (policy change coming)
- Mar 2022: first hike.
- *Lesson:* the "transitory" → "persistent" shift was the signal, months before
  the hike.

**Trial balloons:**
- A non-voting member or lesser voice floats an idea; or a "leak" to a connected
  journalist (often Nick Timiraos, WSJ); Fed watches the market reaction; if
  acceptable, adopted more broadly; if severe, walked back as "one person's
  view."
- Watch for: a lesser-known official suddenly getting attention, or WSJ stories
  citing unnamed "Fed officials."

**Fedspeak monitoring system:**
1. Follow the speech calendar (published on the Fed website).
2. Prioritise by influence: Chair > Vice Chair > NY Fed > governors > regional
   presidents.
3. Keep a log of key phrases; monitor for changes.
4. Note the context: a hawk turning dovish is more significant than a dove being
   dovish.
5. Watch for clustering: multiple officials using similar new language =
   coordinated → policy shift coming.

## 3.5 The Fed's balance sheet: QE/QT mechanics

- Balance sheet went from ~$900B pre-2008 to nearly **$9T at the 2022 peak**.
- Core mechanism: the Fed buys assets and pays with newly created reserves →
  reserves enter the banking system → more liquidity → generally higher asset
  prices. QT reverses this.

**Balance sheet anatomy:**
- **Assets (what the Fed owns):** Treasuries ~60–70%; MBS ~25–30%; loans & other
  ~5%. Growing assets = QE = liquidity injection = bullish risk assets.
- **Liabilities (what the Fed owes):** currency in circulation ~25%; bank
  reserves ~35–40%; reverse repo (RRP) ~20–25%; Treasury General Account (TGA)
  ~5–10%. Reserves + RRP + TGA = the "liquidity" that can flow to markets.

**QE transmission (as steps):** announce purchases (e.g. $120B/month) → buy from
primary dealers, crediting their reserve accounts → reserves enter banking
system → **portfolio-rebalancing effect** (sellers redeploy cash into credit,
equities) → asset prices rise across markets.

**QT mechanics:** let bonds mature without replacement (or sell), with monthly
runoff caps (e.g. $60B UST + $35B MBS) → Treasury must issue new bonds to
replace maturing debt → private sector absorbs the supply using cash from
markets → reserves drain → headwinds for risk assets.
- **QT risk:** QE effects are gradual; QT can cause **sudden stress when reserves
  get scarce** — Sept 2019 repo spike, March 2023 bank stress. The Fed often
  doesn't know where the pain point is until they hit it.

**The net liquidity equation:**

`Net Liquidity ≈ Fed Balance Sheet − TGA − RRP`

| Component | What it is | Liquidity effect |
|---|---|---|
| Fed balance sheet | Total assets (bonds held) | Growing = adding; shrinking = draining |
| TGA | Treasury's checking account at the Fed | Rising = hoarding cash (drains); falling = spending (adds) |
| RRP | Money parked overnight at the Fed by money-market funds | Rising = excess cash idle; falling = cash flowing back to markets |

- Even during QT, TGA drawdown or falling RRP can mean net liquidity is RISING —
  the headline balance sheet doesn't tell the full story. Track net liquidity
  weekly: rising = risk-asset tailwind; falling = headwind.

**Balance sheet monitoring:**
- **H.4.1 release** — every Thursday 4:30 PM ET, the Fed's weekly balance sheet;
  the primary source. Track the week-over-week trend, not the level.
- Watch reserves: below ~$3T has historically caused stress.
- Monitor TGA: quarterly refunding plans; big TGA buildups (debt ceiling, heavy
  issuance) drain liquidity.
- Check RRP: high = excess parked; draining = cash that can support markets.

## 3.6 Other major central banks & policy divergence

- **ECB:** single mandate (price stability); must manage fragmentation risk
  across 20 economies.
- **BoJ:** signature policy **Yield Curve Control (YCC)** — targets the 10Y yield
  in a band around 0%, unique among major CBs. Decades fighting deflation →
  structurally dovish (they WANT inflation). Owns ~50% of JGBs and is a major
  holder of Japanese equities via ETFs. 8 meetings/year but can adjust YCC at
  any time. Watch: YCC band adjustments (widening = de facto tightening), FX
  intervention (BoJ/MoF), governor commentary on inflation expectations. BoJ
  policy surprises cause extreme yen moves; YCC removal would be seismic
  globally. **BoJ is the wildcard / most likely to surprise.**
- **BoE:** faces stagflation risk — high inflation + weak growth limits options.
- **PBoC:** different toolkit — RRR (reserve requirements), administered rates,
  FX management; moves often outside scheduled meetings; China stimulus matters
  globally.

**Policy divergence drives FX:**
| Scenario | FX impact | Example |
|---|---|---|
| Fed hawkish, ECB dovish | EUR/USD falls | 2022: Fed hiked aggressively, ECB lagged → EUR to parity |
| Fed hawkish, BoJ dovish | USD/JPY rises | 2022–24: differential drove USD/JPY 115 → 150+ |
| Fed pauses, others catch up | USD weakens broadly | Late 2023: Fed pause while others hiked → DXY declined |
| Synchronized easing | FX stable, risk assets rally | 2020 coordinated easing |

**Global CB monitoring framework:** CB meeting calendar (dates cluster into
event-heavy weeks); per-CB note of current rate, direction of travel, relative
hawkishness; track which CBs converge/diverge (drives FX); expect surprises
mainly from BoJ and off-schedule PBoC moves.

## 3.7 Trading around Fed events

**The core question — trade or avoid?** Fed events are high volatility, not
necessarily high edge. Before trading FOMC ask: do I have a differentiated view
from market pricing? Can I size for the volatility? Is this a real edge or a
gamble on a binary? **Sitting out is valid** — some of the best traders reduce
exposure before meetings and re-engage after.

**Pre-FOMC dynamics:**
- Week before: volatility compresses ("calm before the storm").
- 1–2 days before: light positioning, market sits on hands.
- Morning of: low-conviction moves, everyone waits for 2 PM.
- **Pre-FOMC drift:** documented slight positive equity bias in the 24h before
  announcements; well-known, likely mostly arbitraged, persists weakly.
- Positioning: reduce gross if no edge; if positioning for a surprise, size
  smaller than normal; options strategies can benefit from vol expansion.

**The two-phase announcement reaction:**
- **Phase 1 — algorithmic (2:00–2:05 PM):** instant, keyword-based scanning of
  the statement; fast but often wrong; high volatility, low signal.
- **Phase 2 — human digestion (2:05–4:00 PM):** full statement + presser
  processed in context; can reverse Phase 1.
- **Warning:** don't chase the first spike; wait until the presser finishes
  before committing to directional trades.

**Post-FOMC — the real move takes days:**
| Timeframe | What happens | Implication |
|---|---|---|
| Day 1 | High vol, frequent reversals (algos + initial reactions) | Don't trust the close |
| Day 2 | Digestion; analyst takes; positioning adjustments | Direction clearer, still volatile |
| Days 3–5 | True repositioning by funds | Trend often establishes; safer entry |
| Weeks 2–3 | Minutes released | Can reinforce or modify; secondary move if new info |
- *Edge insight:* if you're not a speed trader, your edge on Fed events is
  **patience** — let algos and fast money establish positions, then decide to
  follow or fade.

**Fade vs follow framework:**
- **Follow when:** outcome genuinely surprised (dots moved vs pricing); language
  shifted materially; move consistent across assets (stocks, bonds, FX all
  confirming); move persists through the presser; macro backdrop supports the
  new path.
- **Fade when:** outcome roughly as expected but market overreacted; move
  reversed during the presser; cross-asset confirmation missing (e.g. stocks up
  but yields also up on a "dovish" read); positioning was already extreme going
  in; technicals suggest exhaustion.

**FOMC trading checklist:**
- Before: check market pricing (what would surprise?); decide trade-or-sit-out;
  define scenarios and sizes in advance; set alerts for 2:00 and 2:30 ET.
- During/after: don't react to the Phase-1 spike; compare outcome to
  pre-defined scenarios; check cross-asset confirmation; consider waiting to
  Day 2–3 for a cleaner entry; calendar the minutes release (3 weeks).

## 3.8 Lesson 3 key takeaways (as given)

- **Know the players:** committee composition, hawk/dove leanings, dissents; the
  Chair dominates but a unified committee is more predictable than a divided
  one.
- **Language precedes action:** pivots are telegraphed through word changes
  ("transitory" → "persistent"); diff the statements — the diff is the signal.
- **Dots ≠ destiny:** conditional projections, not commitments; the tradeable
  object is dots vs market pricing.
- **Balance sheet = liquidity:** track Net Liquidity (BS − TGA − RRP) weekly via
  H.4.1; rising = risk tailwind, falling = headwind.
- **Divergence drives FX:** monitor relative policy paths; BoJ is the wildcard.
- **Patience is edge:** first moves often reverse; wait for the presser, check
  cross-asset confirmation, consider waiting days.

---

# Lesson 4 — Fixed Income Fundamentals for Traders

*(Course note: bond math is mathematical fact; bond↔FX/equity relationships are
well-established but vary in strength by regime.)*

## 4.1 Bond math essentials

- **The fundamental law: PRICE ↑ ⟷ YIELD ↓.** Always. Mathematical, not opinion.
- Intuition: you hold a bond paying $50/yr (5% on $1,000); new bonds pay $60/yr;
  nobody pays full price for yours, so its price falls until its effective yield
  matches the market.
- `Yield ≈ Coupon / Price` (simplified) — fixed coupon + falling price = rising
  yield.
- **Terms:** *face value/par* (repaid at maturity, typically $1,000; "at par" =
  priced 100); *coupon* (annual % of face); *maturity*; *YTM* (total return if
  held to maturity, accounting for price, coupon, time — "the yield" people
  quote).
- **Price quotes:** 100 = par (yield = coupon); 95 = discount (yield > coupon —
  capital gain at maturity); 105 = premium (yield < coupon — capital loss at
  maturity).
- Headline translation: "10Y yield hits 4.5%" = investors demand 4.5% to hold
  10Y Treasuries; if yesterday was 4.3%, yields rose and prices fell — holders
  lost money, new buyers get better rates.

## 4.2 Duration & convexity

- **Duration ≈ % price change per 1% yield move.** Longer maturity = higher
  duration = more rate sensitivity.
- Approximate durations: 2Y Treasury ≈ 2; 10Y ≈ 8; 30Y ≈ 18; long-duration
  (growth) stocks ≈ 25+.
- **Rule of thumb:** `Price change ≈ −Duration × Yield change`
| Bond | Duration | Yields +0.5% | Yields −0.5% |
|---|---|---|---|
| 2Y | ~2 | ≈ −1% | ≈ +1% |
| 10Y | ~8 | ≈ −4% | ≈ +4% |
| 30Y | ~18 | ≈ −9% | ≈ +9% |
- **Why 2022 was historic:** 10Y yields rose ~2.5% (≈1.5% → ≈4%); duration ~8 →
  ~20% losses — worst bond market in decades.
- **Growth stocks have duration too:** their value is mostly earnings far in the
  future; higher rates discount those harder — they behave like long-dated
  bonds. High-duration equities: growth, tech, unprofitable companies. Low
  duration: value, banks (often benefit from higher rates). This is why Nasdaq
  and 30Y Treasuries (e.g. TLT) often trade together.
- **Convexity:** the price/yield relationship is curved, not linear. Positive
  convexity (most bonds): prices rise more when yields fall than they fall when
  yields rise — good for holders. Negative convexity (e.g. MBS): behaves worse
  than duration predicts both ways (prepayment risk). For most trading purposes
  duration suffices; convexity matters for large bond books, MBS, and big yield
  moves.

## 4.3 The yield curve deep dive

- The curve plots yields (y-axis) vs maturity (x-axis): 3M, 2Y, 5Y, 10Y, 30Y.
  Its shape encodes collective expectations for future rates, growth, inflation.
  "The bond market talking — and it's usually smarter than the stock market."

**Shapes:**
- **Normal (upward sloping):** healthy economy expected; growth + inflation
  anticipated.
- **Flat:** uncertainty; often a transition phase.
- **Inverted:** short rates above long; recession signal; market expects cuts.
- **Humped:** middle highest; rare; policy transition or unusual conditions.

**Why inversion predicts recession (mechanism):**
1. Fed tightening pushes short rates (2Y) up.
2. Market expects the hikes to eventually slow the economy and force cuts.
3. Long rates reflect the expected *average* of future rates — if cuts are
   coming they rise less.
4. 2Y > 10Y = the market pricing that the Fed will be forced to cut.
- An inverted curve has preceded **every US recession in the past 50+ years**;
  lead time is variable — historically **6 to 24 months**. A warning sign, not a
  precise timer.

**Key spreads:**
- **2s10s** — the most popular measure; negative = inverted; media/Fed watched.
- **3M–10Y** — some research says better recession-predictive power; the Fed's
  preferred measure.
- **2s30s** — the very long end; more volatile; can diverge from 2s10s.

**Curve moves and their meanings:**
| Move | What's happening | Signal |
|---|---|---|
| Bull steepener | Short rates fall faster than long | Fed cuts being priced; early recession or crisis response |
| Bear steepener | Long rates rise faster than short | Growth/inflation expectations rising; recovery or inflation fear |
| Bull flattener | Long rates fall faster than short | Flight to quality; growth fears; long bonds as haven |
| Bear flattener | Short rates rise faster than long | Fed tightening; hikes expected to slow the economy; inversion risk |

**Curve → equity positioning (as taught):**
- Steepening (bull or bear): generally favors cyclicals, value, banks.
- Flattening toward inversion: caution — reduce cyclicals, favor defensives.
- Deeply inverted: recession risk elevated, timing uncertain — reduce risk
  gradually, don't panic.
- **Rapid UN-inversion:** often happens right before the recession actually
  starts — the steepening after inversion can be the final warning.

## 4.4 Credit spreads & risk appetite

- **Credit spread** = extra yield demanded to hold corporate vs government debt.
  Treasury 4%, corporate 6% → spread 200bps = default-risk compensation.
- Spreads **widening** = fear rising; **tightening** = confidence rising.
- Terms: **IG** (investment grade, BBB− and above); **HY** ("junk", BB+ and
  below); **OAS** (option-adjusted spread); **CDX** (tradeable credit-default
  index).

**Why credit leads equities:**
- Bond investors are more institutional, downside-focused, less swayed by
  narrative; bonds have defined downside (paid back or not) → natural
  skepticism; credit liquidity can seize faster, giving early signals.
- **Classic pattern:** spreads start widening → equities ignore it for
  days/weeks → equities eventually sell off. Watching credit = advance warning.
- **2008 example:** HY spreads began widening significantly in summer 2007;
  equities made new highs in October 2007 — credit warned for months.

**HY spread interpretation bands (rough guideposts):**
| Level | Read |
|---|---|
| < 300bps | Very tight — strong risk appetite, potentially complacent |
| 300–400 | Normal — healthy risk appetite |
| 400–500 | Elevated — some stress, monitor |
| 500–700 | Stressed — risk-off, recession pricing |
| > 800 | Crisis — distress, defaults expected |
- **Direction and speed matter more than level:** +50bps in a week is more
  significant than a slow drift.

**CDX indices (tradeable credit):**
- **CDX IG:** 125 North American IG names.
- **CDX HY:** 100 HY names; more volatile, more equity-correlated.
- Liquid and tradeable; many institutional desks watch CDX more closely than
  equity indices for real-time risk sentiment.

**Credit monitoring routine:**
1. Daily: HY spread level + direction; widening trend = caution for equity
   longs.
2. Divergence alert: equities rally + spreads widen = be skeptical of the rally.
3. Speed: +20bps in a day often precedes equity volatility.
4. Confirmation: add equity risk preferably when credit is stable/tightening.

## 4.5 TIPS & real yields

- **Real yield = nominal yield − inflation expectations.** Nominal 4.5%,
  expected inflation 2.5% → real ≈ 2% (true after-inflation return).
- **Why real yields matter:** they're the opportunity cost of holding
  non-yielding assets. High real yields → bonds pay a real return → why hold
  gold (no yield), speculative growth, crypto? Low/negative real yields → bonds
  don't beat inflation → non-yielders attractive.
- **The gold relationship:** gold performs well when real yields are falling or
  negative; struggles when they rise — documented over decades.
- **TIPS:** principal adjusts with inflation; TIPS yield ≈ the real yield
  directly.
- **Breakeven inflation = nominal yield − TIPS yield** = the market's expected
  average inflation over that horizon. Example: 10Y at 4.5%, 10Y TIPS at 2.0% →
  10Y breakeven 2.5%.

**Real-yield environments:**
| Environment | Gold | Growth stocks |
|---|---|---|
| Negative/falling | Supportive | Supportive (lower discount rate) |
| Rising toward positive | Pressure | Pressure (higher discount rate) |
| High positive (2%+) | Headwind | Challenging (works only if growth strong enough) |

- **2022 in context:** real yields swung from roughly −1% to +1.5% — that ~2.5%
  swing crushed gold and growth stocks simultaneously. Not random; real yields.

**Monitoring:** track the 10Y TIPS yield (FRED, TradingView, Bloomberg); watch
direction more than level; cross-check gold/growth responses; decompose nominal
moves — if rising nominals are all breakevens (inflation expectations), real
yields may not be rising much.

## 4.6 Yields as the FX driver

- **Core mechanism:** money flows to the highest return; US 5% vs Europe 3% →
  capital flows to USD assets → EUR/USD lower. The fundamental FX driver over
  weeks–months — more important than GDP, trade balances, or politics in most
  regimes.
- **Why the 2Y tenor:** reflects the CB policy trajectory over the relevant
  horizon; less day-to-day noise than 3M; more policy-driven than 10Y (which
  embeds term premium and inflation uncertainty); FX desks at major banks watch
  2Y differentials closely.
- **Rule of thumb:** track the 2Y differential between two countries for the
  fundamental FX pressure; watch the spread, not absolute levels.

**Key differential pairs:**
| FX pair | Spread to watch | Relationship |
|---|---|---|
| EUR/USD | US 2Y − Germany 2Y | Spread widens → EUR/USD falls |
| USD/JPY | US 2Y − Japan 2Y | Spread widens → USD/JPY rises |
| GBP/USD | UK 2Y − US 2Y | UK spread widens → GBP/USD rises |
| AUD/USD | Australia 2Y − US 2Y | Aussie spread widens → AUD/USD rises |

- Correlation is not constant: differentials typically explain a significant
  portion of FX variance, but strength varies; in risk-off, safe-haven flows
  can override differentials.

**When rates DON'T drive FX:**
| Scenario | What happens | Why |
|---|---|---|
| Risk-off panic | JPY & CHF rally regardless of rates | Haven flows overwhelm carry logic |
| CB intervention | FX moves against rate logic | BoJ/PBoC can overpower markets short-term |
| Balance-of-payments crisis | EM currency collapses despite high rates | Capital flight dominates |
| Extreme positioning | FX reverses despite rates | Unwind mechanics dominate |

**Case study — USD/JPY 2021–2024 (textbook rate-differential story):**
- Start: US and Japan both near zero; small differential.
- 2022–23: Fed hiked aggressively; BoJ stayed at zero (YCC).
- Differential blew out: US 2Y ~0.25% → ~5%; Japan near zero.
- USD/JPY tracked the differential from ~110 to ~150+, correlation at the high
  end of the historical range.
- Japan intervened multiple times but couldn't sustainably reverse the
  rate-driven trend; the pair only turned when US rate expectations shifted.

**Using rates for FX views:** build a rate-differential watchlist (US 2Y vs
Germany, Japan, UK, Australia minimum); watch for divergence (differentials
move but FX doesn't — it may catch up, or something else is driving); rate
expectations shift around FOMC/ECB/BoJ meetings; combine differentials
(fundamental bias) with technicals (entry timing).

## 4.7 Bonds leading equities — the institutional view

- **Why bonds often lead:** institution-dominated (CBs, pensions, insurers,
  banks) who move on macro faster; obsessed with downside risk (paid back or
  not) → naturally skeptical, quicker to react; Treasury markets among the most
  liquid in the world → information priced quickly.
- **Information cascade:** policy signals emerge → bond markets react (hours to
  days) → FX adjusts (days to weeks) → equities reprice (weeks to months). If
  you only watch equities, you see the last domino.
- **Yields and equity valuations:** higher rates = lower P/E multiples
  (mathematical, via the discount rate). **Rate of change matters most:** a
  rapid 3% → 5% is more disruptive than sitting at 5% for a year. Don't use
  simplistic rules like "10Y above X% = sell stocks" — impact depends on *why*
  rates are moving (growth optimism vs inflation fear) and what's priced.

**The MOVE index (bond-market VIX):**
| Level | Read |
|---|---|
| < 80 | Low vol — calm bond market, stable rate expectations |
| 80–120 | Normal uncertainty range |
| 120–150 | Elevated — rising rate uncertainty; watch for equity spillover |
| > 150 | High stress — bond turmoil; equities typically follow |
- MOVE spikes often precede VIX spikes; March 2023 (SVB) saw MOVE at extremes
  before equities fully reacted.

**Bond-first framework (before any equity position):**
1. What are yields doing? (rising = headwind for growth/long-duration)
2. What's the curve saying? (flattening/inverting = caution)
3. What are credit spreads doing? (widening = risk-off warning)
4. What's MOVE doing? (elevated = expect equity vol)
5. Any divergence? (bonds warning + stocks rallying = be skeptical)

**Daily 5-minute fixed-income scan:**
1. 10Y yield — vs yesterday, vs last week
2. 2s10s — steepening or flattening? still inverted?
3. 2Y — policy expectations shifting?
4. HY spreads (CDX HY) — tightening or widening?
5. MOVE — elevated or calm?
6. Real yields (10Y TIPS) — rising or falling?
7. Rate differentials — US vs major partners shifting?
- *Time: 5 minutes. This context shapes the entire trading day.*

**Case study — putting it together, the 2022 bear market:**
- 10Y surged ~1.5% → ~4.2% (historic move).
- Real yields flipped deeply negative → positive (crushed gold and growth).
- 2s10s inverted (recession warning).
- HY spreads roughly doubled (risk-off).
- MOVE at multi-year highs.
- USD surged on massive differentials vs Europe/Japan.
- Equities followed: S&P ~−25%, Nasdaq ~−35% (duration assets hit hardest).
- *Lesson:* every signal was visible in fixed income first; watched from bonds,
  none of the equity carnage was surprising.

## 4.8 Lesson 4 key takeaways (as given)

- **Price & yield are opposites** — master this or nothing else makes sense.
- **Duration = rate sensitivity** — growth stocks are long-duration assets; this
  explains 2022.
- **The curve predicts recessions** — inversion preceded every US recession in
  50+ years; 6–24-month variable lead.
- **Credit spreads = fear gauge** — widening often leads equity selloffs.
- **Rate differentials drive FX** — 2Y spreads are the key metric.
- **Real yields drive gold & growth** — watch TIPS.
- **Bonds lead, equities follow** — the cascade gives advance warning.
- **Check bonds before every trade** — the 5-minute daily scan.

---

# Lesson 5 — Currency Markets & Global Flows

*(Course note: FX relationships are well-established but regime-varying;
dynamics can shift rapidly during intervention, crisis, or regime change.)*

## 5.1 FX market structure

**Key figures:**
- **~$7.5T daily volume** (BIS Triennial Survey) — largest market by turnover.
- **24/5 trading:** Sydney → Tokyo → London → New York.
- **~88% of trades have USD on one side.**
- **OTC structure** — decentralised, over-the-counter.
- Size ⇒ highly liquid and efficient — harder to manipulate, faster to price
  information; FX moves = large sophisticated players repositioning on macro.
- For equity traders: FX is the **transmission mechanism** between CB policy and
  global asset prices; policy divergence shows up in currencies before stocks.

**Quoting conventions:**
- Always pairs: EUR/USD = 1.0850 → 1 euro buys 1.0850 dollars; first currency =
  base, second = quote; number rises = base strengthening.
- USD/JPY = 150.00 → 1 dollar buys 150 yen; rises = USD strengthening / yen
  weakening.
- Convention: most pairs quote USD first, but EUR, GBP, AUD, NZD quote USD
  second — historical convention, not logic.

**Participants:** central banks (reserves, intervention, policy); commercial
banks (client facilitation, prop); corporates (hedging trade/investment flows);
asset managers (portfolio hedging, currency overlay); hedge funds (speculation,
macro); retail (small fraction, mostly noise).

**Instruments:**
| Instrument | What | Who uses |
|---|---|---|
| Spot | Immediate exchange (T+2) | Everyone — the quoted "price" |
| Forwards | Exchange at a future date at an agreed rate | Corporates hedging future flows |
| Swaps | Simultaneous spot + forward (rolling positions) | Banks/institutions managing funding |
| Options | Right (not obligation) at a strike | Hedgers wanting protection with flexibility |
- **Swaps are the largest segment by volume** — "dollar funding stress" shows up
  in the swap market first.

## 5.2 G10 currency characteristics ("personalities")

| Currency | Character |
|---|---|
| **USD** | Reserve currency, always in demand; safe haven in risk-off; highly rate-sensitive; "anti-risk" in most regimes |
| **EUR** | ECB policy-driven; current-account surplus; fragmentation risk; USD's main counterweight |
| **JPY** | **Ultimate safe haven**; funding currency (low rates); BoJ intervention risk; rallies on risk-off |
| **GBP** | High beta / volatile; BoE-sensitive; current-account deficit; stagflation-prone economy |
| **CHF** | Safe haven; current-account surplus; SNB intervention history; negative-rate history |
| **AUD** | Commodity currency; **China proxy**; risk-on currency; historically high carry |

**Safe havens vs risk currencies:**
- Safe havens (USD, JPY, CHF): strengthen in stress. JPY is the purest — rallies
  in risk-off even when Japan's fundamentals are weak.
- Risk currencies (AUD, NZD, CAD, NOK, SEK, EM): strengthen with risk appetite,
  weaken in stress; often commodity- or carry-linked.
- *Implication:* in risk-off expect JPY/CHF up, AUD/EM down. If AUD rallies
  during a supposed "risk-off," question the narrative.

**Commodity currencies:** AUD — iron ore, coal (China demand proxy); CAD — oil
(tracks crude); NZD — dairy/agriculture (China demand); NOK — oil (tracks
Brent). Use the linkages to cross-check narratives (oil rally → CAD, NOK
strength; China stimulus → AUD).

## 5.3 What drives currencies (by timeframe)

| Timeframe | Primary drivers | Signal quality |
|---|---|---|
| Intraday | Order flow, liquidity, data releases, headlines | Noise-dominated; hard to predict |
| Days–weeks | Rate expectations, risk sentiment, positioning | Mix of signal and noise |
| **Weeks–months** | **Rate differentials, policy divergence, relative growth** | **Highest signal — the sweet spot** |
| Months–years | Current account, valuation (PPP), structural flows | Slow anchors; mean reversion |

- **Rate differentials — the dominant medium-term driver:** the 2Y differential
  reflects the policy trajectory over the horizon most relevant for carry and
  macro positioning. Over weeks–months differentials typically explain a
  substantial portion of major-pair moves — often cited 50–80% depending on
  period and pair.
- **When it breaks:** safe-haven flows (JPY rallies in risk-off despite rate
  disadvantage); intervention; extreme positioning reversals.
- **Risk sentiment as the overrider — risk-off FX pattern:** fear rises (VIX
  spikes, spreads widen) → haven bid (USD, JPY, CHF strengthen regardless of
  differentials) → risk currencies sell (AUD, NZD, EM; carry unwinds) → once
  panic subsides, fundamentals reassert.
- **Long-term anchors:** *PPP* — exchange rates should equalise the price of
  identical goods; deviations can persist for years but extremes tend to
  mean-revert eventually. *Current account* — persistent deficits need foreign
  capital (weaker currency or higher rates); surpluses give structural support.
  Long-term valuation doesn't time anything but frames the context: extreme
  undervaluation can limit downside, extreme overvaluation can limit upside —
  eventually.

## 5.4 The dollar cycle & Dollar Smile

**Why the dollar is special:**
- Reserve currency: ~58–60% of global CB reserves (gradually declining, still
  dominant) — structural demand.
- Invoicing currency for most global trade, even between non-US countries.
- Funding currency: most global debt is USD-denominated — dollar strength makes
  that debt harder to service.
- Safe haven: in crisis the world wants dollars — even when the crisis is US-
  originated.

**The Dollar Smile theory — USD is strong at both extremes, weak in the middle:**
| Regime | Characteristics | USD |
|---|---|---|
| Left side — US exceptionalism | US growth > RoW, Fed hawkish, differentials favor USD | **Strong** |
| Middle — synchronized global growth | Global growth strong, risk appetite high, carry works | **Weak** |
| Right side — global risk-off | Panic, VIX spiking, flight to safety | **Strong** |
- *Key insight:* strong USD doesn't always mean the same thing — 2022 was
  left-side strength (Fed hawkish, differentials); March 2020 was right-side
  strength (panic). Implications for other assets differ.

**Dollar cycles:** multi-year, historically roughly 7–10 years peak-to-peak.
1980s: strong early (Volcker), weak late. 1990s: weak early, strong late (tech
boom). 2000s: weak (EM boom, commodity supercycle). 2010s: bottomed ~2011,
strengthened through 2022. *Caution:* cycle timing is imprecise — don't call
major turns; understand the current regime and what would change it.

**Dollar strength — good or bad for risk assets? Depends on the driver:**
| Driver | Risk-asset impact | Why |
|---|---|---|
| US growth outperformance | Mixed-to-positive (for US) | Strong economy supports US equities; pressures EM/exporters |
| Fed hawkishness | Negative | Higher rates → lower valuations; hits growth stocks |
| Global risk-off | Negative | USD rallying because everything else is selling |
- Ask "**why** is the dollar strong?" — not just "is it strong?"

## 5.5 Carry trades — mechanics and risks

- Borrow low-yield (funding) currency, invest in high-yield: e.g. borrow JPY at
  0.1%, invest MXN at 10% → ~9.9% carry. Exposure: spot moves — a 10% peso drop
  exceeds a year's carry. "Pennies in front of a steamroller."
- `Carry Return = Interest Rate Differential − Hedging Cost`; components in
  practice: interest differential + spot return + roll yield (forward points).
  Calm markets → differential dominates (steady yield); volatile markets → spot
  dominates and can overwhelm years of carry in days.

**Classic roles:**
| Role | Currencies | Why |
|---|---|---|
| Funding (borrow) | JPY, CHF, EUR (historically) | Low/negative rates; stable economies |
| Investment (buy) | AUD, NZD, EM | High rates; commodity exposure |
- **The JPY carry trade:** decades of near-zero rates made JPY the world's
  favorite funding currency; trillions of carry positions built on borrowed yen
  — why JPY moves violently in risk-off.

**Why carry works (usually):** in theory high-yielders should depreciate to
offset the rate advantage (Uncovered Interest Parity); in practice they often
don't, at least not immediately — risk premium (carry compensates real risk),
momentum (flows toward yield strengthen the high-yielder further), slow
adjustment. Historical studies: positive long-run returns with significant
crisis drawdowns.

**Anatomy of a carry unwind:**
1. Trigger event — risk-off shock, vol spike, unexpected policy shift.
2. Initial selling — some carry traders close, selling high-yield currencies.
3. Spot moves against carry — high-yielders weaken; funding currencies (JPY)
   strengthen.
4. Stop-losses trigger — more forced exits; selling begets selling.
5. Cascade — JPY can rally 5–10% in days; years of carry wiped out.
- **Reflexivity:** JPY strength → more stops hit → more forced JPY buying →
  more strength. This is why JPY moves are explosive in risk-off.

**Monitoring carry:**
- JPY in risk-off: sharp JPY rally = carry unwinding = caution on ALL risk.
- COT positioning: extreme short JPY = crowded carry.
- Volatility: carry works in low vol; rising FX vol = carry headwind.
- Differential narrowing (e.g. Fed cuts) = carry less attractive.

## 5.6 Cross-currency basis — dollar funding stress (advanced)

- **Covered Interest Parity (CIP):** in theory, no risk-free arbitrage from
  borrowing one currency and lending another FX-hedged — the forward
  premium/discount should equal the rate differential
  (`Forward Premium ≈ Interest Rate Differential`).
- **The basis = the deviation from CIP** (quoted in bps).
  - **Negative basis:** obtaining dollars via FX swaps costs MORE than CIP
    predicts — non-US entities paying a premium for dollar funding = **dollar
    scarcity / stress**. (EUR/USD basis −30bps = European entities pay 30bps/yr
    extra to swap euros into dollars.)
  - **Positive basis:** rare, usually minor.
- **Why it exists:** global dollar demand (trade, debt service, reserves);
  post-2008 bank balance-sheet regulation limits arbitrage; quarter-end
  balance-sheet reduction (seasonal widening — don't overreact); risk aversion
  blocking arbitrage in stress.

**Reading the basis (EUR/USD, rough guideposts):**
| Level | Read |
|---|---|
| 0 to −20bps | Normal |
| −20 to −50 | Elevated — dollar demand pressure |
| −50 to −100 | Stressed — significant funding pressure |
| < −100 | Crisis — severe dollar shortage (2008 / 2020 style) |
- Direction and speed matter more than levels; the structure has evolved with
  regulation.

**Case study — March 2020 dollar squeeze:**
- Basis blew out ~−20 → beyond −100bps in days.
- DXY surged despite the US being the pandemic epicenter — everyone needed
  dollars.
- Fed opened swap lines with foreign CBs → basis normalised quickly — the Fed
  effectively backstopped global dollar funding.
- *Lesson:* the basis warned of dollar stress before other indicators, and its
  normalisation showed the intervention was working.

**Monitoring:** track EUR/USD and JPY/USD basis (most liquid/watched); 20–30bps
moves in a day = funding stress emerging; USD rallying + basis blowing out = a
funding squeeze (more concerning than rate-driven strength); Fed swap-line
activation → expect normalisation; ignore predictable quarter-end widenings.

## 5.7 Central bank FX intervention

- CBs intervene when currency moves are "disorderly" or economically harmful.
- **Escalation pattern:** verbal warnings → rate checks → actual intervention.
- Intervention **can work short-term** — especially against one-sided
  positioning — but **struggles against fundamentals long-term**.
- Most active interveners: **BoJ/MoF, SNB, PBoC**; the Fed rarely intervenes.

**Case study — Japan 2022–2024:**
- Pattern: verbal warnings → rate checks → actual intervention.
- Scale: tens of billions of dollars spent buying yen.
- Effect: sharp short-term reversals (USD/JPY dropped several yen in hours).
- Limitation: could not sustainably reverse the trend while rate differentials
  stayed wide.
- Resolution: USD/JPY only sustainably reversed when US rate expectations
  shifted.
- *Lesson:* intervention slows moves and hurts speculators; it buys time but
  doesn't change fundamentals.

**Trading around intervention:** know the "lines in the sand" (levels where CBs
intervened before); watch the verbal-escalation ladder; respect the firepower
short-term (don't fight it); don't overestimate it long-term; intervention-
driven moves can provide entries if fundamentals still favor the original
direction.

## 5.8 FX for the non-FX trader

- FX is Level 3 in the hierarchy — often moves before equities fully price
  information; reveals risk sentiment (JPY strength, EM weakness, basis
  blowouts precede VIX spikes); affects earnings (dollar strength hurts US
  multinationals' foreign earnings, helps importers).

**FX signal table:**
| Signal | Watch | Implication |
|---|---|---|
| Risk-off warning | JPY strengthening sharply, esp. vs AUD | Carry unwinding; risk assets likely to follow |
| Dollar funding stress | Cross-currency basis widening rapidly | Global liquidity tightening; credit stress possible |
| EM contagion | Broad EM FX weakness, esp. "fragile" currencies | Risk-off spreading; may hit DM |
| China sentiment | AUD weakness, CNY fixing surprises | Growth concerns; commodities and EM exposed |
| Rate expectations | Differential moves vs FX moves | FX not following rates = something else driving |
| Dollar regime | DXY direction + Dollar-Smile position | Strong USD = headwind for US multinational earnings, EM, commodities |

**Daily FX scan (5 minutes):**
1. DXY direction — strengthening or weakening, and why?
2. USD/JPY — JPY strength = risk-off signal.
3. EUR/USD — dollar strength vs developed markets.
4. AUD/USD — risk sentiment + China proxy.
5. EM FX — broad weakness or specific stress?
6. Cross-currency basis — any blowout (if accessible)?

## 5.9 Lesson 5 key takeaways (as given)

- **FX is the transmission mechanism** — policy divergence flows through
  currencies to global assets.
- **Rate differentials dominate medium-term**, but risk sentiment overrides in
  stress.
- **The Dollar Smile** — strong at both extremes, weak in synchronized growth;
  know the regime.
- **Carry works until it doesn't** — unwinds are violent; JPY strength = unwind
  signal.
- **Cross-currency basis = funding stress** — blowouts precede other indicators.
- **EM FX is the canary** — often leads broader risk moves.
- **Intervention has limits** — can't fight fundamentals forever.
- **Use FX to confirm equity views** — divergences between FX and equities are
  warnings.

---

# Lesson 6 — Cross-Asset Synthesis

*(Course framing: this is the structural framework for institutional cross-asset
analysis — how global macro funds and multi-asset allocators actually think.
Understanding the framework is the first step; systematic implementation through
data infrastructure and quantitative testing is where edge is built.)*

## 6.1 The institutional cross-asset framework

**How a global macro fund thinks** — forming a view (e.g. "the Fed pivots dovish
earlier than expected"), they ask:
1. What's the highest-conviction expression? (maybe 2Y rates, not equities)
2. What's the best risk-adjusted expression? (maybe rate options for convexity)
3. What should confirm if we're right? (credit tightening, USD weakening)
4. What invalidates the thesis? (inflation reaccelerating)
5. What's the time horizon? (weeks, months, quarters)
- The same view can be expressed across the whole capital structure with very
  different risk/reward; choosing the expression and monitoring confirming
  signals separates institutional from retail thinking.

**Capital structure information flow (top-down):**
1. Rates / sovereign bonds — first to price macro shifts
2. Credit (IG → HY) — corporate health, risk appetite
3. FX — policy divergence, global flows
4. Equity indices → sectors → single stocks — broadest participation, most noise
5. Volatility surface — insurance pricing, tail risk, fear

**Why single-asset analysis fails:** analysing equities alone is watching one
character of a movie. Equities: noisy, retail flows, narrative-driven, last to
price macro. Bonds: cleaner, institution-dominated, mathematically constrained.
Credit: bridges corporate fundamentals + macro. FX: policy divergence made
tradeable. If you only watch equities, the preceding moves in rates/credit/FX
told the story hours-to-weeks earlier.

**Coherence vs incoherence:**
- **High coherence:** all asset classes pricing the same scenario → trends tend
  to persist; trend-following works.
- **Low coherence:** conflicting stories → someone is wrong (opportunity), or
  markets are transitioning (wait), or genuine uncertainty (reduce risk).
- Coherence informs conviction and position size, not just direction.
- *Quant note (from the lesson):* coherence is measurable — rolling cross-asset
  correlations vs regime norms; a coherence score can track stock-bond corr vs
  expected, credit-equity corr vs expected, FX-rate-differential alignment;
  aggregate deviations signal regime uncertainty. High- vs low-coherence
  periods differ for trend vs mean-reversion strategies — testable.
- **Reality check (from the lesson):** understanding the framework ≠ edge.
  Markets are efficient at short horizons; institutional edge = superior data
  infrastructure + systematic implementation + longer horizons + capacity to
  hold through volatility.

## 6.2 Macro regime framework — the four quadrants

Growth and inflation are the two axes that matter most; everything else (Fed
policy, earnings, credit conditions) flows from them. Growth: accelerating or
decelerating (ISM, employment, GDP). Inflation: rising or falling (CPI, PCE,
breakevens).

**Goldilocks (growth ↑, inflation ↓)** — the best of all worlds; CBs stay
accommodative; risk assets thrive.
- Duration neutral; credit overweight; equities overweight (growth style);
  commodities selective; volatility: sell.
- Historical examples: 2017, mid-2019, late 2023.

**Reflation (growth ↑, inflation ↑)** — economy running hot; CB tightening bias;
value and real assets outperform.
- Duration underweight; credit neutral; equities overweight (value style);
  commodities overweight; TIPS overweight.
- Examples: 2021 reopening, 2004–2006.

**Stagflation (growth ↓, inflation ↑)** — the worst outcome; CBs trapped;
nowhere to hide except real assets and cash.
- Duration complex; credit underweight; equities underweight; defensives
  overweight; gold/energy overweight; cash overweight.
- Examples: 2022 (partial), the 1970s.

**Deflation (growth ↓, inflation ↓)** — risk-off; CBs ease aggressively; flight
to quality dominates.
- Duration max overweight; credit IG-only (no HY); equities underweight;
  quality factor overweight; safe-haven FX (JPY, CHF, USD); volatility: long.
- Examples: 2008, March 2020, 2015–16.

**Regime transition signals (transitions are where the money is made):**
| Transition | Leading indicators | Confirmation |
|---|---|---|
| → Goldilocks | Bull steepening, credit tightening, stable breakevens | Equity breadth, vol declining, EM FX strengthening |
| → Reflation | Breakevens rising, commodities breaking out, bear steepening | Value > growth, banks rallying, TIPS > nominals |
| → Stagflation | Growth data weakening with breakevens elevated, curve flattening from the short end | Credit widening, equities falling, gold/commodities holding |
| → Deflation | Bull flattening, credit blowing out, vol spiking | JPY surging, gold bid on real-yield collapse, quality dominating |

**Quant approaches to regime ID (from the lesson):** rule-based thresholds
(e.g. ISM > 50 = growth up; core CPI YoY > 3% = inflation up) — interpretable
but arbitrary; Hidden Markov Models — elegant but can overfit; ML clustering on
macro indicators; robustness requires testing across methods. **Critical:**
regime identification is inherently backward-looking — by the time you're
confident, much of the move has happened; the edge is early transition
detection via forward-looking indicators and systematic monitoring.

## 6.3 The macro dashboard — data architecture

*(Designed for medium-term positioning — weeks to months — NOT daily trading.
Trading these signals daily is a common retail mistake; markets are efficient at
short horizons; edge exists at longer horizons against behavioral biases and
structural flows.)*

**Tiers:** 1 Policy & liquidity → 2 Rates → 3 Credit → 4 FX → 5 Vol →
6 Commodities.

**Tier 1 — policy & liquidity (monitor weekly-to-monthly):**
| Series | Source / code | What it shows |
|---|---|---|
| Fed balance sheet | FRED `WALCL` (weekly) | QE expands (injection), QT shrinks (withdrawal) |
| Reverse repo | FRED `RRPONTSYD` (daily) | High = excess liquidity idle; declining = being deployed |
| Treasury General Account | FRED `WTREGEN` (weekly) | Rising drains liquidity; falling injects |
| Financial conditions | FRED `NFCI` (Chicago Fed, weekly) | Positive = tight, negative = loose (also Goldman FCI) |
| Bank lending standards | FRED `DRTSCILM` (SLOOS, quarterly) | % of banks tightening — leading indicator for credit/activity |
| Global M2 (USD-adjusted) | custom composite (monthly) | Global liquidity proxy |

- **Net liquidity proxy:** `Net Liquidity ≈ Fed Balance Sheet − TGA − RRP`.
  Rising → risk assets tend to benefit; falling → headwinds. *"Not mechanical —
  a condition, not a signal."*

**Building a data pipeline (steps from the lesson):**
1. Data ingestion — automated pulls (FRED, Bloomberg, alternatives; Python/R/
   APIs).
2. Normalization — z-scores, percentile ranks, regime-adjusted levels.
3. Aggregation — composite indicators summarising multiple variables.
4. Visualization — dashboards that surface signal from noise.
5. Alerting — threshold-based alerts for significant moves/divergences.

## 6.4 Lead-lag & divergences

**Cross-asset playbook by scenario (as given):**
- **Growth scare:** bull flattener, credit widening, copper weak, defensives
  leading — vs recovery: bear steepener, credit tight, cyclicals leading.
- **Inflation scare:** bear steepener, breakevens rising, gold bid, TIPS
  outperform — vs disinflation: bull flattener, breakevens falling, growth
  stocks outperforming.
- **Fed pivot (dovish):** front-end rallying, USD weak, gold bid, duration
  outperforming — vs hawkish: front-end selling, USD strong, real yields
  rising.

**Reading divergences (when asset classes disagree, someone is wrong — or
you're missing information):**
- Equities rallying + credit widening → credit sees risks equities ignore;
  historically credit is often right at turning points.
- Yields falling + equities flat → bonds pricing growth fear equities haven't
  acknowledged; either bonds overreact or equities catch down.
- JPY strengthening + equities rallying → haven flows against the risk
  narrative; possible intervention, positioning unwind, or early risk-off
  warning.
- Divergences don't tell you what to do — **they tell you to investigate**: why
  the disagreement, and what would resolve it?

**Quant testing of lead-lag (from the lesson):** cross-correlation ρ(X_t,
Y_{t+lag}) across lags; Granger causality; VAR models; rolling-window stability
tests. **Critical finding:** lead-lag relationships are often strongest at
regime turning points and weakest during stable trends — the signal is most
valuable precisely when it's hardest to trust, which is where systematic
testing beats discretion.

## 6.5 Correlation regimes

- **The 2022 lesson:** decades of negative stock-bond correlation (bonds hedge
  stocks) ended when inflation forced the Fed to hike into weakness — both fell
  together; 60/40 had its worst year since the 1970s. Correlation assumptions
  built on 40 years of falling inflation broke when the regime changed.

**Stock-bond correlation — the big one:**
| Regime | Correlation | Why |
|---|---|---|
| Growth-driven | Negative | Growth fears → stocks down, bonds up (flight to safety) |
| Inflation-driven | Positive | Inflation → rates up → both down |
| Liquidity crisis | Variable → 1 | Everything sells as cash is raised |
- The key question: *what's driving markets right now — growth fears or
  inflation fears?* That determines whether bonds hedge or hurt.

**The "correlation 1" crisis (four phases):**
1. **Idiosyncratic** — early stress; some assets fall, others hold;
   diversification "works."
2. **Contagion** — selling spreads; correlations rise; "uncorrelated" assets
   start moving together.
3. **Liquidation** — forced selling, margin calls; everything sold regardless of
   fundamentals; correlation → 1.
4. **Stabilization** — selling exhausted; policy response; correlations
   normalise.
- March 2020: stocks, credit, even Treasuries briefly sold off together in the
  scramble for cash.

**Correlation monitoring table:**
| Relationship | Normal range | Warning signal |
|---|---|---|
| SPX vs 10Y Treasury | −0.3 to +0.1 | Sustained > +0.3 (inflation regime) |
| SPX vs HY credit | +0.6 to +0.8 | Breakdown (credit-led divergence) |
| Gold vs real yields | −0.5 to −0.8 | Breakdown of inverse relationship (haven bid dominating) |
| DXY vs risk assets | −0.3 to −0.5 | Strong positive correlation (dollar funding crisis) |

**Methodology (from the lesson):** rolling windows 20–60d tactical / 120–252d
strategic (shorter = noisier but more responsive); EWMA correlations with decay
λ ≈ 0.94; regime-conditional estimates (e.g. VIX > 25 vs < 20); stress-test
with historical crisis correlations.
- EWMA correlation:
  `ρ_t = Σ(λ^i · r₁,t−i · r₂,t−i) / √[Σ(λ^i · r₁²) · Σ(λ^i · r₂²)]`

## 6.6 Case study — the 2022 cross-asset bear market

**Setup (late 2021):** 5Y breakeven hit 3.2% (multi-decade high); 10Y TIPS at
−1.0% (unsustainably stimulative); Fed rhetoric shifting off "transitory";
bear flattening as the front end priced hikes. Regime: Goldilocks →
Reflation, with rising stagflation risk.

**The cascade:**
- **Nov 2021** — Powell retires "transitory"; 2Y begins rising 0.5% → 1.0%;
  equities initially ignore it. *(First domino.)*
- **Jan 2022** — 2Y through 1%; 10Y real yields −1.0% → ~0; Nasdaq enters
  correction; growth (long-duration) leads the decline, as duration math
  predicts.
- **Mar 2022** — first hike (+25bps); Ukraine adds a commodity/inflation shock;
  oil to $130; 2s10s inverts in April; full stagflation scare.
- **May–Jun 2022** — 50bps then 75bps hikes; 2Y hits 3%; real yields flip
  positive (first since 2019); HY 300 → 500+; stock-bond correlation firmly
  positive.
- **Sep–Oct 2022** — 2Y peaks ~4.5%; 10Y real yield 1.7%; DXY > 114; UK gilt
  crisis; MOVE spikes; S&P −27% from peak at the lows.

**Signal table:**
| Signal | Late 2021 | Mid 2022 | Oct 2022 lows |
|---|---|---|---|
| 2Y yield | 0.5% → 1.0% | 1.5% → 3.5% | ~4.5% peak |
| Real yields | −1.0% | flipping positive | +1.7% peak |
| 2s10s | flattening | inverted (−0.5%) | deeply inverted |
| HY spreads | ~300bps | ~500bps | ~550bps |
| DXY | strengthening | surging | 114 peak |
| Stock-bond corr | turning positive | firmly positive (+0.5) | positive |

**What worked:** short duration; long commodities early (energy through June);
long USD; long volatility (VIX and MOVE); value over growth (energy/financials
vs tech); cash (rising short rates made it competitive).
**What failed:** 60/40 (worst in decades); risk parity (leveraged bond exposure
amplified losses); growth stocks (crushed by rising real yields); "TINA" (cash
became an alternative); EM assets (devastated by USD strength).

**Key lesson:** every signal was visible in cross-asset data. Rates led, FX
confirmed, credit warned, equities followed. **The stock-bond correlation flip
was THE signal that diversification assumptions had broken.** Equity-only
watchers were blindsided; full-capital-structure watchers had months of
warning.

**Systematic lessons:** regime-conditional allocation outperformed;
trend-following (CTAs short bonds and equities) performed well; simple
real-yield rules would have flagged the growth→value rotation; carry-adjusted
positioning justified defensiveness as cash yields rose. *The edge wasn't
prediction — it was systematic response to observable signals.*

## 6.7 Case study — the Q4 2023 "everything rally" (peak coherence)

**Setup (summer–fall 2023):** CPI falling 9% → ~3% (core sticky); labor market
resilient; Fed paused after July 2023 (higher-for-longer messaging); curve
deeply inverted but no recession materialising. Debate: soft landing
(Goldilocks) vs delayed hard landing (Deflation) — **coherence low**.

**October trough:** 10Y spiked to 5% (term premium + supply + resilient data);
S&P −10% from July highs; credit spreads only modestly wider; VIX ~20 (elevated,
not panicked). Crucially a **rates-driven selloff, not credit-driven** — HY
didn't blow out; credit was NOT confirming a hard landing. That divergence was
informative.

**The pivot:**
- Oct 27 — core PCE prints soft; inflation narrative shifts toward "mission
  accomplished."
- Nov 1 — FOMC holds; Powell less hawkish than feared ("proceed carefully");
  market reads peak rates.
- Nov 3 — weak payrolls; 10Y drops 4.9% → ~4.5% in days; front end rallies;
  duration trade ON.
- Nov–Dec — **everything rally**: bonds rally, credit tightens, equities surge,
  USD weakens, vol collapses. Maximum coherence.

**Confirmation table:**
| Asset | Oct lows | Year-end | Signal |
|---|---|---|---|
| 10Y | ~5.0% | ~3.9% | confirming (falling) |
| 2Y | ~5.2% | ~4.2% | confirming (falling) |
| HY spreads | ~450bps | ~330bps | confirming (tightening) |
| S&P 500 | ~4,100 | ~4,770 | confirming (rallying) |
| DXY | ~107 | ~101 | confirming (weakening) |
| VIX | ~21 | ~12 | confirming (falling) |
| Gold | ~$1,820 | ~$2,060 | confirming (real yields falling) |

**What worked:** long duration (yields −100+bps); long credit (tightening +
carry); long equities (growth and small caps led); short vol (VIX 20 → 12);
short USD; long gold (real-yield collapse).

**Key lesson:** **coherence is a signal** — when all asset classes tell the same
story, the risk of being wrong is lower. Sequencing was textbook: rates first
(FOMC + data), credit confirmed (no stress), FX confirmed (USD weak), equities
followed. Waiting for "certainty" missed the move; tracking coherence gave
early confirmation.

## 6.8 Case study — March 2023 banking stress (SVB)

**Setup:** Fed still hiking (25–50bps expected in March); 2Y near 5%, 10Y near
4%; bank held-to-maturity bond portfolios carrying massive unrealized losses
from the 2022 rate surge; regional banks vulnerable (concentrated deposits,
duration mismatch).

**The 5-day cascade:**
- **Mar 8 (Wed):** Silvergate liquidation — treated as idiosyncratic.
- **Mar 9 (Thu):** SVB discloses $1.8B loss on bond sales + capital raise; stock
  −60%. **Regional-bank CDS spikes — credit reacted first; this was the early
  warning.**
- **Mar 10 (Fri):** FDIC seizes SVB after a $42B one-day deposit outflow —
  largest failure since 2008. 2Y yields collapse ~50bps in a day;
  flight-to-safety; regional bank stocks crater.
- **Mar 12 (Sun):** Signature Bank closed; Fed announces **BTFP** (borrow
  against underwater bonds at par) + full deposit guarantee — the policy
  firewall.
- **Mar 13–15:** stabilization with aftershocks (First Republic concerns;
  Credit Suisse collapse — separate issue, sentiment overlap). Fed still hikes
  25bps on Mar 22 — threading the needle.

**Signal table:**
| Signal | Pre-crisis (Mar 8) | Peak stress (Mar 13) | Post-response (Mar 20) |
|---|---|---|---|
| 2Y yield | 5.05% | 3.98% (−107bps!) | 4.17% |
| 10Y yield | 3.97% | 3.55% | 3.60% |
| Fed funds expectations | +50bps priced | cuts priced for 2023 | +25bps priced |
| Regional bank ETF (KRE) | $58 | $40 (−30%) | $42 |
| HY spreads | ~450bps | ~520bps | ~480bps |
| MOVE | ~120 | ~180 (spiked before VIX) | ~140 |
| VIX | ~19 | ~26 | ~22 |

**Key observations:**
1. **Credit led** — bank CDS and subordinated debt moved before equity (Mar 9).
2. **MOVE led VIX** — rate vol spiked first; fundamentally a rates/duration
   crisis.
3. **The 2Y move was historic** — a 3-day drop among the largest ever, pricing
   emergency cuts.
4. **Flight-to-quality** followed the classic deflation-scare playbook.
5. **Policy response mattered** — BTFP arrested the panic; cross-asset
   normalisation within days.

**Key lesson:** credit leads at stress points; MOVE can lead VIX in rates-driven
crises; regime shifts can be violent and fast (hiking → emergency-cuts-priced in
48 hours); policy response matters. For systematic approaches: **crisis signals
must be monitored in real time — a weekly review would have missed this**;
automated alerts on credit stress, rate vol and inversion would have flagged it
immediately.

## 6.9 Expressing views across the capital structure

**Example view: "Fed will cut sooner than expected" — expressions:**
| Expression | Instrument | Risk profile | Carry | Convexity |
|---|---|---|---|---|
| Direct rates | Long 2Y Treasuries | Low vol, clean | Positive (coupon) | Low |
| Curve | 2s10s steepener | Lower vol than outright | Often negative | Low |
| Rate options | Receiver swaptions | Defined risk, asymmetric | Negative (premium) | High |
| FX | Short USD / long EUR | Higher vol, rate-diff sensitive | Variable | Low |
| Equity | Long growth (QQQ) | High vol, many other factors | Low/variable | Low |
| Equity options | Long QQQ calls | Defined risk, levered upside | Negative (premium) | High |
| Gold | Long GLD | Real-yield proxy | Zero | Low |
- Institutional choice: high conviction + short horizon → direct 2Y or
  front-end rate options (cleanest). Moderate conviction + longer horizon →
  steepener or gold may offer better risk-adjusted returns. **Equities are the
  noisiest expression.**

**Factors in choosing the expression:** conviction level (high → direct; low →
relative value or optionality); time horizon (short → liquid; long → can accept
illiquidity premium); risk budget (limited → options for defined risk); carry
profile (can you afford negative carry while waiting?); correlation to the
existing book; liquidity/exit needs.

**The "cleanest" expression = most directly tied to the thesis, fewest
confounders:**
- "Inflation surprises higher" → cleanest: long breakevens (TIPS vs nominals);
  noisier: short bonds, long commodities, long value.
- "Credit stress coming" → cleanest: long CDX HY protection; noisier: short
  equities, long VIX, long quality.
- "Dollar will weaken" → cleanest: short DXY / long EUR/USD; noisier: long EM
  equities, long gold, long commodities.

**Systematic implementation (from the lesson):** weight multiple expressions by
signal strength, risk contribution (vol-adjusted sizing), correlation between
expressions, and costs.
- `Position Size = Target Risk / (Instrument Volatility × Correlation to View)`

## 6.10 Implementation reality — where edge actually lives

**The hard truth (the lesson's own words):** reading cross-asset signals and
trading them profitably on a discretionary daily basis is extremely difficult;
markets are highly efficient at short horizons; most retail traders (and many
professionals) who try to "trade the macro" lose money. Institutional edge
comes from infrastructure, time horizon and systematic implementation.

**Why daily discretionary macro is hard:**
- Information is priced fast — by the time you see a signal, so has everyone.
- Noise dominates short horizons — daily moves are mostly noise; signal emerges
  over weeks and months.
- Behavioral biases compound — overtrading, confirmation bias, recency bias.
- Transaction costs erode returns with frequency.
- Narrative is seductive — a post-hoc "story" for any move isn't tradeable.

**Where edge can exist:**
- Longer time horizons (weeks–months) where behavioral biases and structural
  flows create opportunity.
- Systematic implementation — rules remove emotion and enforce discipline.
- Superior data/infrastructure — same signals, faster or higher resolution.
- Capacity to hold through drawdowns that force others out.
- Structural advantages — market access, leverage, information.
- **The retail edge:** no benchmark, no redemptions, no career risk — you can be
  patient and hold through volatility that would get a fund manager fired.
  Use it.

**Systematic strategy families the signals map to (testable):** regime
identification models (classify → allocate by historical regime performance);
cross-asset trend-following; carry strategies with systematic exits; relative
value / mean-reversion in relationships (stock-bond corr, credit-equity);
risk-parity with regime-conditional correlations. Each can be backtested,
validated OOS, and stress-tested — evidence beyond narrative.

**What the course's Data Modelling section promises to cover:** building data
pipelines (FRED, alternative data); signal construction and normalization;
rigorous backtesting (walk-forward, no lookahead, cost modeling); regime
detection (HMM, rules, ensembles); portfolio construction (signal combination,
correlation-aware sizing, risk budgeting); monitoring/execution (alerts,
rebalancing, slippage).

**The realistic path (as taught):**
1. Education — understand how institutions think about cross-asset dynamics.
2. Context — use the framework to interpret moves even when not trading them.
3. Longer-horizon positioning — inform medium-term allocation (months, not
   days).
4. Systematic testing — build and test before trading any of these signals.
5. Humility — recognise the limits of discretionary macro at retail scale.
- *"This isn't defeatism — it's realism… value comes from proper application,
  not from thinking you can out-trade Goldman Sachs on a daily basis."*

## 6.11 Lesson 6 key takeaways (as given)

- **Trade the capital structure, not single assets** — one view, many
  expressions, different risk/reward.
- **Information flows in sequence** — rates → credit → FX → equities; know where
  you are in the cascade.
- **Regimes determine allocation** — growth × inflation quadrants; detect
  transitions early.
- **Correlations are variables, not constants** — stock-bond correlation flips
  between regimes; diversification can fail when most needed.
- **Coherence builds conviction** — aligned markets = high conviction;
  divergences = investigate.
- **Credit leads at turning points** — skeptical, downside-focused investors
  move first.
- **Infrastructure enables edge** — pipelines, alerting, quantitative testing.
- **Time horizon is your edge** — daily discretionary macro is extremely hard;
  edge lives at longer horizons with systematic implementation and patience.

---

# Appendix A — Master reference: formulas from the course

| Formula | Context |
|---|---|
| `SNR = Signal Power / Noise Power` | L1 — noise vs signal by horizon |
| `Yield ≈ Coupon / Price` | L4 — simplified bond yield |
| `Price change ≈ −Duration × Yield change` | L4 — rate sensitivity |
| `Breakeven Inflation = Nominal Yield − TIPS Yield` | L4 — market inflation expectation |
| `Net Liquidity ≈ Fed Balance Sheet − TGA − RRP` | L3/L6 — liquidity available to markets |
| `Carry Return = Rate Differential − Hedging Cost` | L5 — carry mechanics |
| `Forward Premium ≈ Interest Rate Differential` | L5 — covered interest parity |
| `Implied FF rate = 100 − futures price` | L3 — Fed funds futures |
| EWMA correlation with λ ≈ 0.94 | L6 — correlation-regime monitoring |
| `Position Size = Target Risk / (Instrument Vol × Correlation to View)` | L6 — vol-adjusted sizing |

# Appendix B — Master reference: data sources & tools named in the course

| Source / tool | What for |
|---|---|
| FRED `WALCL` | Fed balance sheet (weekly) |
| FRED `RRPONTSYD` | Overnight reverse repo (daily) |
| FRED `WTREGEN` | Treasury General Account (weekly) |
| FRED `NFCI` | Chicago Fed financial conditions (weekly) |
| FRED `DRTSCILM` | SLOOS bank lending standards (quarterly) |
| H.4.1 release | Fed weekly balance sheet, Thursdays 4:30 PM ET |
| CME FedWatch | Market-implied meeting probabilities |
| Fed funds futures / OIS | Rate expectations pricing |
| CFTC COT report | Futures positioning by trader type (Fridays) |
| CDX IG / CDX HY | Tradeable credit indices; real-time risk sentiment |
| HY OAS | Credit-spread fear gauge |
| MOVE index | Treasury volatility ("bond VIX") |
| VIX + VIX term structure (VIX1/VIX2) | Equity vol; contango vs backwardation |
| 10Y TIPS yield (e.g. FRED DFII10) | Real yields |
| 2s10s / 3M-10Y spreads | Curve slope / recession signal |
| Cross-currency basis (EUR/USD, JPY/USD) | Dollar funding stress |
| Dot plot / SEP | FOMC projections (Mar/Jun/Sep/Dec) |
| Fed speech calendar; WSJ (Timiraos) | Fedspeak & trial balloons |
| Put/call ratio, short interest, fund flows | Positioning/sentiment |

# Appendix C — Master reference: the daily scans (as taught)

**Risk dashboard (L2):** VIX level & term structure → CDX HY day change → JPY vs
high-beta FX → stock-bond correlation check → if 3+ warn, cut gross first.

**Fixed income scan, 5 min (L4):** 10Y level/change → 2s10s → 2Y → HY spreads →
MOVE → 10Y TIPS → key rate differentials.

**FX scan, 5 min (L5):** DXY direction & why → USD/JPY (JPY strength =
risk-off) → EUR/USD → AUD/USD (risk + China) → EM FX breadth → cross-currency
basis if available.

**Pre-trade checks:** levels above you in the hierarchy (L2) → positioning
(who's in, what forces them out, am I early or late, what's my edge) (L2) →
bond-first framework (L4) → regime & coherence context (L6).

# Appendix D — Topics flagged for future investigation (from the lessons)

- Lead-lag measurement: cross-correlation by lag, Granger causality, VAR,
  rolling-window stability (L6 notes these are strongest at regime turns).
- Regime detection methods: rule-based thresholds vs HMM vs clustering;
  robustness across methods (L6).
- Coherence scoring: cross-asset correlation vs regime norms as a
  conviction/size input; behaviour of trend vs mean-reversion under high/low
  coherence (L6).
- Correlation methodology: rolling vs EWMA (λ=0.94), regime-conditional
  estimates, stress correlations (L6).
- Carry strategy literature: UIP failure, long-run carry returns and crash risk
  (L5).
- Pre-FOMC drift and the two-phase FOMC reaction; post-event drift over days
  1–5 (L3).
- Dot-plot vs market-pricing gaps as surprise-direction indicator (L3).
- Net-liquidity ↔ risk-asset relationship ("a condition, not a signal") (L3/L6).
- Calendar-flow effects: month-end rebalancing pressure, OpEx pinning/gamma,
  September/year-end seasonality (L2).
- Positioning extremes (COT percentile, short interest, put/call) as reversal
  conditioning (L2).
- Yield-curve inversion lead times and the un-inversion "final warning" (L4).
- Real-yield relationships with gold and growth equities; breakeven
  decomposition of nominal moves (L4).
- Cross-currency basis as a funding-stress indicator; quarter-end seasonality;
  Fed swap lines (L5).
- Intervention episodes and their limits (Japan 2022–24) (L5).
- Vol-adjusted sizing and expression selection across the capital structure
  (L6).

---

*Notes compiled 2026-07-11 from the six-lesson series. These are study notes on
the lesson material as taught; verify exemplar figures with current data before
use.*
