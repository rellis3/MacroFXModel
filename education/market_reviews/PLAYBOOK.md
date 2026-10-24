# Weekly Cross-Market Review: Playbook

The method Brent Donnelly and Alfonso Peccarelli use on *The Macro Trading Floor*, made generic so it can be
run on any market, every week. It's a reasoning routine, not a signal: it organises what's happening and
why, and says what would change the picture. The source episodes are decoded in
`education/podcast_transcripts/HOW_THEY_THINK.md`.

---

## 1. The weekly routine (about an hour)

```
python -I scripts/market-review/fetch.py --asof YYYY-MM-DD   # ~3 min; writes analysis/output/market-review/<date>/raw.json
python -I scripts/market-review/build.py --asof YYYY-MM-DD   # writes DATA_PACK.md + pack.json in the same folder
```
1. **Read the data notes** at the top of the pack: missing feeds, stale series, roll jumps, calendar gaps.
2. **Score last week** (section 5 of the template) before looking at anything new.
3. **Regime gauges** (pack §1): which big story is the market trading this week?
4. **Write the main chain(s)**: usually one or two stories drive most markets.
5. **Go market by market** using the cards in §3 below. Spend time where the pack flags something:
   a flipped driver, a large "unexplained" move, extreme positioning, an unusual-sized move.
6. **Calendar and scenarios:** three scenarios, including "nothing happens", each with early signals.
7. Save as `education/market_reviews/<date>_cross_market_review.md`.

---

## 2. The method: two prep steps, eight questions

**Prep:**
- **Horizon:** does this story move markets on the reader's timeframe (days to weeks)? True-but-slow
  stories (deficits, demographics) are context. Say so and move on.
- **Scenarios:** at least three, including "nothing happens / steady state".

| # | Question | Checks (from the podcast) | Where it is in the pack |
|---|---|---|---|
| 1 | **What's the story?** As a cause → effect chain, with loops marked | Which driver is each asset tied to *now*? A flipped correlation = the market changed stories | Regime gauges; each market's "in charge" |
| 2 | **Where does it break?** | The weak link; the variable that would make it blow up, and is it *accelerating*; credibility; can people still borrow at all (not just what it costs); where pressure exits (currency or long bonds) | Credit (HYG/TLT), MOVE vs VIX, spreads |
| 3 | **Is the data agreeing?** | Hard data over headlines; fade headlines the data can't see; if two views fit, state both and how unsure you are | Calendar actuals vs consensus; decomposition R² |
| 4 | **What's priced and positioned?** | Crowded needs news to fail; washed-out flies on small news; size news in the units that matter | Positioning (3y percentile, 4w change); Fed path |
| 5 | **How is price reacting?** | Good news + bad price is the strongest signal; a non-reaction to expected news is information; if the drivers cancel, "agnostic" is a valid answer | 1w move vs the news; "no clear driver" |
| 6 | **What's on the calendar?** | Catalysts that force the issue | Per-market "This week" |
| 7 | **Expression and horizon** | Isolate the idea (relative pairs); prefer bets unrelated to everything else; carry cost of waiting | Crosses section; positioning |
| 8 | **What proves it wrong; what's the risk?** | An exact invalidation number; bet shape over hit rate; ordinary moves are ordinary; survive first | Move percentile; 52w range position |

---

## 3. How to read the pack

**Move line.** `4w −1.5% (58th pct of 2y 4w moves)`: the percentile is the base-rate check (Pattern P).
Below ~75th is an ordinary move; above ~90th is unusual and needs a story; 99th is rare. The 52-week range
position shows whether the market is pressing an extreme.

**Drivers line.** Correlation of daily moves over the last 20 sessions with each textbook driver, labelled:
- `textbook`: moving as the textbook says (|corr| ≥ 0.3, expected sign)
- `INVERTED`: strongly the *opposite* way. Ask which story makes that sign make sense
- `weak`: no clear link
- `was …`: the label was different over the prior 60 sessions, so **the market has changed stories**
- `in charge`: the driver with the strongest link now. `no clear driver` means everything is under 0.3:
  the drivers cancel (Brent's EURUSD-between-two-lines case) or something off-list is moving it.

**Decomposition line.** A regression of daily moves on the drivers (last ≤60 sessions), then how much of
the last 20 sessions' move each driver accounts for. **The "unexplained" part is the most useful number in
the pack**: a big unexplained move means a story that isn't on the textbook list (local politics,
intervention, a flow). That's where to go and read the news. R² says how much to trust the split (below
~0.2, barely at all). `n` is the sample: under ~30 sessions, treat it as a rough sketch.

**Positioning line** (CFTC, as of the Tuesday before; sign-adjusted so + = long the market *as quoted*,
e.g. + on USDJPY = short yen). Leveraged funds = fast money; asset managers = real money; managed money =
commodity funds. Read the **3-year percentile** (>90th or <10th = crowded) and the **4-week change**
(who is moving). Fast and real money on opposite sides is normal; both at an extreme on the same side
is the setup for a squeeze (Patterns A/F).

**Regime gauges** (pack §1): ten cross-market correlations that say which big story is live (oil as
inflation vs growth tax, bonds hedging stocks or not, credit leading equities, safe-haven dollar or not,
gold as a rates trade or a liquidity trade, France-only or euro contagion). A `FLIPPED` gauge is the
headline of the week.

**Limits (always say them in the review):**
- 20-session correlations are noisy; one big day moves them.
- Daily closes are asynchronous: Asian markets are compared with the *previous* US session; European
  closes come before the US close, so US afternoon news lands in Europe the next day.
- Continuous futures (oil, gas, metals) can jump on roll days (the pack flags >4σ days).
- The French and Italian spreads are *changes* rebuilt from futures prices (approximate duration 8.5),
  with only as much history as the local futures capture holds.
- Descriptive only: nothing here is a tested signal. Direction calls in this repo are mostly coin flips;
  use this to understand the market, size risk and know what to watch, not to predict.

---

## 4. Market cards: the textbook chains and what flips them

Each card gives the **textbook chain**, the **tell that the chain has changed**, and **what to check**.

### G10 FX
| Market | Textbook chain | Tell that it's changed | Check |
|---|---|---|---|
| **EURUSD** | US-euro rate gap ↑ → USD ↑. Euro growth ↑ → EUR ↑. Energy ↑ → EUR ↓ (importer) | Rate gap stops working and **fiscal spreads take over** (France, Italy) | US_EA2 vs FR_DE "in charge"; IT_DE moving with FR_DE = contagion |
| **USDJPY** | US yields ↑ → carry → USDJPY ↑. Risk-off → repatriation → yen ↑ | Yen stops reacting to yields (BoJ/MoF intervention, GPIF flows) | US10Y/US_JP10 label; real-money yen positioning; MoF intervention levels |
| **GBPUSD** | Gilt yields ↑ on BoE/growth → GBP ↑ | **Release valve:** gilt yields ↑ *and* GBP ↓ = fiscal stress (2022-style) | GB10Y sign vs GBP; UK fiscal events |
| **USDCAD** | Oil ↑ → CAD ↑. US-Canada 2y gap ↑ → USDCAD ↑. Risk-off → CAD ↓ | Oil stops helping CAD (supply-shock oil hurts US demand, and Canada exports to the US) | CL=F label; BoC vs Fed pricing; CAD positioning |
| **AUDUSD / NZDUSD** | China/metals ↑ and global risk ↑ → AUD ↑. NZD follows AUD | AUD decouples from equities (commodity support) or from China | HG=F, USDCNH, ^NDX labels; RBA/RBNZ pricing |
| **USDCHF / EURCHF** | Stress → CHF ↑ (haven). US yields ↑ → USDCHF ↑ | CHF doesn't rally in stress (SNB intervention) | ^VIX label; EURCHF vs FR_DE |

### EM and CE3 FX
| Market | Textbook chain | Tell | Check |
|---|---|---|---|
| **USDMXN, USDBRL, USDZAR** | Carry trade: low vol → buy high yielders; vol ↑ → unwind | Moves the vol can't explain = local politics, elections, trade policy | Unexplained share; real-money positioning flipping |
| **USDKRW** | Chip cycle (KOSPI/SOXX) → KRW | KRW strong while KOSPI falls = flows/policy (pension hedging, intervention) | Decomposition residual |
| **USDCNH** | Broad dollar and China growth | Fixing / policy-managed moves | Unexplained share |
| **EURCZK, EURPLN** | European risk on → CE3 ↑; local central banks vs ECB | Divergent local policy (CNB hawkish vs Polish fiscal limit) | Express as CZK vs PLN to isolate it |

### Equities
| Market | Textbook chain | Tell | Check |
|---|---|---|---|
| **S&P / Nasdaq** | Yields ↑ → valuations ↓ (stocks and yields move opposite) | **Stocks and yields fall together = growth scare; bonds hedge again** | NDX vs US10Y gauge; credit (HYG/TLT) leading; SOXX for AI capex |
| **Russell 2000** | Front-end rates and credit (floating-rate borrowers) | Small caps ignore rates = pure beta | US2Y label |
| **Euro Stoxx / CAC / DAX** | US lead + euro growth; energy as a cost | Fiscal spreads drive banks and the index | FR_DE share in the decomposition |
| **FTSE** | Energy- and dollar-earner heavy | Gilt stress dominates | GB10Y label |
| **Nikkei / KOSPI / Hang Seng / ASX** | Previous US session + yen/chips/China/metals | Large unexplained moves = local policy or flows | Asia uses the prior US day |

### Rates
| Market | Textbook chain | Tell | Check |
|---|---|---|---|
| **US 2y** | Fed path ← inflation and data | Oil ↑ but 2y ↓ = market pricing a growth scare over inflation | CL=F label; fed funds strip changes |
| **US 10y / 30y** | Inflation expectations + term premium + global duration | Stocks-yields sign flip; long end ↑ on fiscal/credibility ("release valve") | NDX/CL=F labels; MOVE; T10YIE share |
| **Bund / Gilt / JGB / Canada** | US spillover + local central bank | Flight-to-quality (Bund ↓ as France widens); fiscal stress (gilts ↑ with GBP ↓); BoJ pressure | FR_DE label on Bund; GBP on gilts |
| **French spread** | Fiscal path, politics, ratings | Moving with Italy = contagion; alone = France-specific | IT_DE gauge |

### Commodities and crypto
| Market | Textbook chain | Tell | Check |
|---|---|---|---|
| **Crude** | Demand (stocks, copper ↑) or supply (stocks ↓ while oil ↑) | **Supply shock:** oil ↑ with stocks/copper ↓ and energy equities lagging | ^GSPC sign; XLE/oil; oil-vs-yields gauge |
| **Gold / silver** | Real yields ↓ → gold ↑; dollar ↓ → gold ↑ | Gold ignores real yields = liquidity (selling to raise cash) or debasement story | DFII10 label; BTC link; managed-money positioning |
| **Copper** | China and global growth | Copper ↓ while oil ↑ = growth tax | USDCNH, ^GSPC labels |
| **Nat gas** | Weather and storage (mostly idiosyncratic) | Roll jumps | Data notes |
| **Bitcoin** | Liquidity / tech beta | Trades with gold (debasement) vs with Nasdaq (liquidity) | ^NDX and GC=F labels |

---

## 5. Review template

```markdown
# Cross-Market Review: <date>
Data: pack <date> · notes: <data notes> · Descriptive, not a signal.

## 0. Since last time (score first)
| Last week's scenario / call | What happened | Which question got it right or wrong |

## 1. The week in one paragraph

## 2. The main chain(s)        ← question 1, with the regime gauges as evidence
## 3. Where it breaks           ← question 2
## 4. What's priced             ← question 4: the crowded and washed-out list
## 5. The unexplained list      ← big residuals: the questions to research
## 6. Market by market          ← one block each, grouped; 3-5 lines:
   **In charge / chain · Unusual? · Priced · Next catalyst · What would change it (exact level)**
## 7. Calendar
## 8. Three scenarios (incl. nothing happens) + early signals
## 9. Your turn: five questions to answer before next week
```
