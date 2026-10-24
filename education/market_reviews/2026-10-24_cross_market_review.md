# Cross-Market Review: Sat 2026-10-24
*Method: `education/market_reviews/PLAYBOOK.md`. Numbers: `analysis/output/market-review/2026-10-24/DATA_PACK.md`
(Friday 10-23 closes; CFTC positions as of Tue 10-20; calendar times US Eastern).
Descriptive, not a signal: 20-session correlations are noisy, and direction calls here are mostly coin flips.
Use it to understand the market, size risk and know what to watch.*

**Data notes:** no missing feeds. The French/Italian spread proxies only go back to 21 Sep (n=24 in the
decompositions). Asian markets are read against the previous US session.

---

## 0. Since last time
First cross-market issue: this is the baseline. The podcast calls are scored in
`2026-10-24_weekly_review.md` §9. From next week, score §8's scenarios here first.

## 1. The week in one paragraph
One story drives most of the board: **the AI-capex chain is unwinding through credit**, and markets
are treating it as a **growth scare, not an inflation scare**. Two regime gauges flipped: oil now pushes
yields *down* (−0.37, was +0.47) and stocks move *with* yields (+0.52, was −0.31). Bonds hedge equities
again. The second story is **France**, which now explains most of the euro's moves. **But the unusual
moves aren't in US indices** (S&P 4-week move at the 33rd percentile, Nasdaq 75th, both ordinary). They're in
the edges: EURGBP (99th), EURCHF (98th), USDMXN (96th), KOSPI (94th), plus a 4-week collapse in silver and
nat gas. Bond volatility (MOVE 103, 95th percentile of the year) is well ahead of equity vol (VIX 19.5, 78th):
**the stress is in rates and credit first.**

## 2. The main chains (question 1)
**Chain A: AI capex → credit → growth scare**
```
AI funding doubts ─► credit lags Treasuries (HYG/TLT; credit vs Nasdaq corr +0.70, was −0.20)
                 ─► semis lead Nasdaq down (SOXX explains −6.4% of Nasdaq's −5.5% over 20 sessions, R² 0.80)
                 ─► Asian AI hardware hit hardest (KOSPI −21.6% in 4 weeks, Nikkei −5.5%)
                 ─► liquidity complex sells together (BTC vs Nasdaq +0.68; silver −16%, gold −7%)
                 ─► bonds rally (US 2y −16bp, 10y −20bp, Bund −24bp, JGB −16bp, Canada −16bp)
                 ─► Fed path eases slightly (June-27 fed funds −2.5bp on the week)
```
**Chain B: oil as a growth tax**
```
Oil +11.8% (4w) ─► yields DOWN (oil-yields corr −0.37) and stocks DOWN (oil vs S&P −0.47)
                ─► a supply shock, not a demand boom: copper −3.3%, nat gas −17%, energy stocks lag
                ─► funds aren't chasing it: managed money in WTI at the 13th pct of 3y, cut 66k in 4 weeks
```
**Chain C: France → the euro complex**
```
French spread wider ─► EURUSD: France accounts for −1.4% of −1.5% (R² 0.45)
                    ─► EURCHF: −1.6% of −2.4% · Euro Stoxx: −2.8% of −3.8% · Bund yields fall (flight to quality)
                    ─► Italy moves with it (corr +0.85) but by less (+10bp vs +25bp since 10-09): France-led, spreading
```

## 3. Where it breaks (question 2)
- **Credit is the weak link and the leading indicator.** If HYG/TLT stabilises after Microsoft and
  Alphabet (Wed after the close) and Amazon (Thu), chain A loses its engine. If it keeps falling, the
  "ordinary correction" label on US indices is wrong.
- **The tell for something bigger:** equity vol catching up with bond vol (VIX moving towards MOVE's percentile).
- **France breaks into a euro problem** if Italy starts widening bp-for-bp with France.

## 4. What's priced: crowded and washed out (question 4; CFTC 3-year percentiles)
| Crowded / extreme | Who | Read |
|---|---|---|
| **EUR short** | Fast money at the **1st pct** (most short in 3y), real money 10th | Both on the same side → squeeze risk if France calms or the ECB reassures (Thu) |
| **GBP short** | Real money at the **4th pct** | …while GBP *rallies* (+1.2% 4w, +2.4% unexplained) → a squeeze in progress? |
| **CAD short** | Fast money long USDCAD at the 94th pct, added 44k | CAD rallied anyway → squeeze; BoC Wed is the test |
| **AUD short** | Real money at the **1st pct**; fast money long (90th) | Opposite sides; RBA-sensitive CPI Tue night |
| **NZD short** | Both near the 10th pct | RBNZ expected to **hike** Tue night: if it does, shorts are exposed |
| **Peso: real money exited** | Asset managers' USDMXN long at the **100th pct** (flipped from long peso); fast money still long peso (10th pct) | Fast money hasn't capitulated → more selling possible |
| **BRL long** | Fast money long BRL at the 4th pct of USDBRL (= very long BRL) | Crowded into Sunday's runoff |
| **Nasdaq** | Fast money least short in 3y (94th) | They covered: no short-covering fuel left |
| **Bitcoin** | Fast money least short in 3y (100th) | Same |
| **Silver / nat gas** | Managed money silver 4th pct, nat gas 1st pct (most short) | Washed out: small good news could bounce them (Pattern F) |
| **WTI** | Managed money 13th pct | The oil rally isn't speculative length, so no crowded long to unwind |
| **10y Treasury futures** | Asset managers' long at a 3-year extreme (1st pct on the yield-sign scale) | The cash-futures basis trade is big: a funding-stress vulnerability, not a signal |

**Rates pricing:** Fed funds strip Oct 3.88% → Dec 4.04% → Jun-27 4.47%. October hold; December hike
mostly priced (my earlier estimate ≈ 76%); about two more hikes by mid-2027. All down 0.5-2.5bp on the week.

## 5. The unexplained list (moves the textbook drivers don't cover: go read the news)
| Market | 20-session move | Unexplained | Question to research |
|---|---|---|---|
| **USDMXN** | +5.0% | **+5.8%** | What's Mexico-specific (politics, trade/tariffs, Banxico)? Real money has left |
| **KOSPI** | −24% | **−17%** | Beyond the chips: local leverage? Foreign selling? |
| **USDKRW** | −3.1% | **−3.3%** | KRW *stronger* while KOSPI collapses: intervention / pension hedging? |
| **Hang Seng** | −6.0% | **−6.0%** | China-specific: policy, property, tariffs? |
| **GBPUSD** | +1.2% | **+2.4%** | GBP rallying hard vs EUR (EURGBP −2.8%, 99th pct): squeeze of real-money shorts? BoE pricing? Gilts *underperformed* US (+3bp vs −11bp on the week). Per the card: gilts up with GBP up = BoE/growth, not fiscal stress. Autumn Forecast Wed |
| **Bund 10y** | −24bp | **−37bp** | Flight to quality from France + ECB pricing easing (the drivers list misses the ECB) |
| **US 2y** | −16bp | **−18bp** | The Fed-path repricing itself (growth scare). Expected: the list has no "Fed" driver |
| **Nat gas** | −19% | **−20%** | Weather / storage / roll (idiosyncratic) |

## 6. Market by market
*Format: in charge · unusual? · priced · next catalyst · what would change it.*

### G10 FX
- **EURUSD 1.1204** (52w range position 5%: pressing the lows). *In charge:* French spread (−0.59). Rate gaps
  are weak (+0.01/+0.05). *Unusual?* No (58th pct). *Priced:* fast money most short in 3y.
  *Next:* ECB Thu 09:15, French GDP Fri. *Changes it:* Italy widening with France (worse), or a France
  relief bounce into crowded shorts (squeeze). The 52w low at 1.116 is the level that matters.
- **USDJPY 156.8.** *In charge:* Nasdaq (+0.57); US yields textbook (+0.34). The yen is trading as the risk
  hedge again. *Priced:* real money long yen (14th pct of USDJPY). *Next:* FOMC Wed, PCE Thu, BoJ Thu
  23:00. *Changes it:* yields stop falling with stocks (back to a pure rates trade).
- **GBPUSD 1.3375.** *In charge:* EURUSD (+0.80), but **+2.4% unexplained**: GBP is outperforming Europe.
  *Priced:* real money 4th pct short. *Next:* **UK Autumn Forecast Wed 08:30.** *Changes it:* gilts
  selling off *with* GBP falling = the fiscal "release valve" (Pattern I). That would flip this.
- **USDCAD 1.4003.** *In charge:* US-Canada 2y gap (+0.38); oil weak (−0.16). *Priced:* fast money short CAD (94th).
  *Next:* **BoC Wed 09:45 (cons hike to 2.50%).** *Changes it:* a pause with shorts still crowded.
- **AUDUSD 0.702.** *No clear driver*: copper +0.30, Nasdaq +0.25. AUD has stopped trading as a risk
  proxy. *Priced:* real money 1st pct short vs fast money long. *Next:* **Australia Q3 CPI Tue 20:30 (cons
  1.3% q/q vs 0.6%).**
- **NZDUSD 0.5685** (20% of range). *In charge:* AUD (+0.60). *Priced:* both groups short (~10th pct).
  *Next:* **RBNZ Tue 21:00 (cons hike 2.75 → 3.00%).** A hike into crowded shorts is a squeeze setup.
- **USDCHF 0.8198.** *In charge:* US 10y (+0.69): the franc is trading rates, not haven flows (VIX +0.01).
- **Crosses:** **EURGBP −2.8% (99th pct, at its 52w low)** and **EURCHF −2.4% (98th)**: the euro is the weak
  leg everywhere, and France is in charge of EURCHF (−0.64).

### EM and CE3
- **USDMXN 18.65 (96th-pct 4w move, top of its range).** Only USDBRL explains anything (+0.61) and 5.8%
  is unexplained. Real money has turned net short peso; fast money hasn't. **The biggest open
  question on the board.**
- **USDBRL 5.05.** *In charge:* Brazilian equities (EWZ −0.90): local flows. Crowded long BRL into the
  **runoff Sun 10-25**. *Watch Monday:* vol collapse either way; whether BRL breaks through levels where
  barrier options sit.
- **USDZAR 16.48.** *In charge:* VIX (+0.31). Ordinary (11th pct).
- **USDKRW 1,326 (52w low for the dollar).** No clear driver, −3.3% unexplained (see §5).
- **EURCZK 24.29 / EURPLN 4.405 (top of range).** CZK tracks the CE3 block (+0.54). PLN is weak with European
  risk (−0.42). The relative CZK-vs-PLN trade has worked (+1.4% since 09-04) while EURCZK hasn't.

### Equities
- **S&P 500 7,624** (87% of range; 4w move 33rd pct, *ordinary*). *In charge:* VIX (−0.86). Credit
  (HYG/TLT) now textbook (+0.46, was inverted) and is the largest contributor (−1.9%). Oil −0.47.
- **Nasdaq 100 28,958** (75th pct). *In charge:* semis (+0.95). The stocks-yields link is inverted
  (+0.52): growth-scare regime. *Next:* MSFT/GOOGL Wed after the close, AMZN Thu. *Changes it:* credit
  stabilising after earnings (chain A loses its engine) vs breaking 28,800 with credit still falling.
- **Russell 2000** +2.0% on the week, a bounce; trades as beta (S&P +0.65), not as a rates play.
- **Euro Stoxx 50 / CAC −3.7% (69th).** France explains −2.8% of the Euro Stoxx move. CAC at 11% of its range.
  **DAX** held up better (−0.9%), trading on the US lead.
- **FTSE** flat (1st pct: the quietest index); gilts in charge (−0.57).
- **Nikkei −5.5%:** chips in charge (+0.32 vs prior-day SOXX). **KOSPI −21.6% (94th):** mostly unexplained.
  **Hang Seng −5.8%:** unexplained. **ASX +1.5%:** no clear driver; resilient.

### Rates
- **US 2y 4.65% / 10y 4.99% / 30y 5.32%** (−16/−20/−19bp in 4 weeks). 10y *in charge:* breakevens (+0.72).
  Oil and Nasdaq links are both inverted: the growth-scare channel. *Next:* **FOMC Wed, core PCE + GDP
  Thu 08:30 (cons 0.3% m/m and 3.0%).** *Changes it:* a hot PCE flipping oil-yields back to positive
  (the inflation scare).
- **Bund 3.36%** (−24bp, 85th pct: unusual), flight to quality from France. **Gilt 5.37%** (−2bp, 8th pct)
  barely rallied: UK-specific into Wednesday's statement. **JGB 2.91%** (−16bp), no clear driver.
  **Canada 3.78%** follows the US (+0.72).

### Commodities and crypto
- **WTI 103.3 (+11.8%).** Energy stocks explain most of it; S&P link inverted (−0.47) = **supply shock**.
  Funds are light (13th pct). Brent at a new high on Friday.
- **Gold 4,008** (3% of its 52w range: near the low). Silver in charge (+0.84); real yields weak (−0.15).
  **Gold is trading as part of the liquidity complex, not as a rates hedge.** Funds 25th pct.
- **Silver 53.7 (−16.4%, 82nd pct)**, funds at the 4th pct: washed out.
- **Copper −3.3%** with the S&P (+0.46): growth, not China.
- **Nat gas −17%**, funds most short in 3y: idiosyncratic (weather/storage/roll).
- **Bitcoin 81k:** Nasdaq (+0.68) and gold (+0.49): one liquidity complex.

## 7. Calendar (US Eastern)
| Day | Time | Event | Markets it hits |
|---|---|---|---|
| **Sun 10-25** | | Brazil runoff | BRL, EWZ |
| Mon 10-26 | 19:00 | Korea Q3 GDP (cons 0.7%) | KRW, KOSPI |
| **Tue 10-27** | 20:30 | **Australia Q3 CPI** (cons 1.3% q/q, prev 0.6) | AUD, ASX, AUDNZD |
| **Tue 10-27** | 21:00 | **RBNZ** (cons hike 2.75 → 3.00%) | NZD, AUDNZD |
| **Wed 10-28** | 08:30 | **UK Autumn Forecast Statement** | GBP, gilts, FTSE |
| **Wed 10-28** | 09:45 | **Bank of Canada** (cons hike 2.25 → 2.50%) | CAD |
| **Wed 10-28** | 14:00 | **FOMC** (cons hold 4.00%) | everything |
| Wed 10-28 | after close | **Microsoft, Alphabet** | Nasdaq, semis, credit, KOSPI |
| **Thu 10-29** | 08:30 | **US core PCE (cons 0.3% m/m), Q3 GDP (cons 3.0%)** | rates, USD, equities |
| **Thu 10-29** | 09:15 | **ECB** (cons hold, depo 2.50%) | EUR, Bunds, French spread |
| Thu 10-29 | after close | **Amazon** | Nasdaq, credit |
| **Thu 10-29** | 23:00 | **BoJ** (cons hold 1.25%) | JPY, JGBs, Nikkei |
| Fri 10-30 | 02:30-06:00 | France, Germany, euro-area Q3 GDP | EUR, French spread |
| Fri 10-30 | 08:30 | Canada GDP | CAD |

## 8. Three scenarios, with early signals
| | Scenario | Early signals | Markets that move most |
|---|---|---|---|
| **1** | **Steady state / ordinary correction**: earnings hold capex, credit stabilises, Fed holds and keeps December alive | HYG/TLT stops falling by Thu; MOVE under ~95; VIX drifts down | Nasdaq/KOSPI bounce; crowded EUR/GBP/NZD shorts squeeze; silver bounces from washed out |
| **2** | **Credit wobble spreads**: a hyperscaler blinks on capex/funding, credit widens | HYG/TLT new low; Nasdaq < 28,800; VIX catches up with MOVE; Italy widens with France; peso and silver keep sliding | Bonds rally hard (Bund, UST); yen up; EM carry (MXN, BRL after the runoff) hit; December hike priced out |
| **3** | **Inflation scare returns**: core PCE ≥ 0.3% with strong GDP and oil > $105 | Oil-yields gauge flips back positive; 10y back above ~5.10%; USDJPY up with yields | Front end sells off; USD up; equities down *with* bonds (the 2022 pattern) |

**Collision risk:** scenarios 2 and 3 can both show up on Thursday (a credit wobble Wednesday night,
then a hot PCE Thursday morning). That's when the Fed's reaction function decides which wins.

## 9. Your turn: before next Saturday
1. Which scenario did the week pick, and which early signal showed it first?
2. Did the crowded shorts (EUR, GBP, CAD, NZD) squeeze, and which catalyst triggered it?
3. What turned out to be behind the peso's unexplained 5.8%?
4. Did any regime gauge flip back?
5. Write your own invalidation for one market as an exact number.
