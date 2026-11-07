# Layer 2: Jumps. Literature spec

Published sources and the trader's words only; no repository file or result read. **No winner declared on our data.**

Tags: [V] verified by search this session, abstract or snippet level unless marked "read". [V-sec] seen only via another source. [M] from memory.

Question: at a vol-scaled level, does price reject or break, and can that be known beforehand? C.OG: "research a lot into jump intensity and jump diffusion", "Merton... a jump added on top".

## Candidates

r_i = 1-min log return, n = bars in window, μ1 = √(2/π).

**Detection (daily)**
- **BNS** [M]: BV = μ1⁻² Σ|r_i||r_{i-1}|. Ratio statistic Z = [(RV−BV)/RV] / √[(π²/4+π−5)·max(1, TQ/BV²)/n], N(0,1) under no jumps. Says a day had a jump, not when.
- **MedRV** (Andersen, Dobrev, Schaumburg 2012) [V]: (π/(6−4√3+π))·(n/(n−2))·Σ med(|r_{i-1}|,|r_i|,|r_{i+1}|)². Robust alternative to multipower measures. Formula [M].
- **Threshold bipower** (Corsi, Pirino, Renò 2010) [V]: BV with each term kept only if r² ≤ θ_i = c²V̂_i (c≈3 [M]). Less biased, and its test has more power than multipower tests.

**Detection (bar level)**
- **Lee-Mykland 2008** [V]: L_i = r_i/σ̂_i, with σ̂_i² = Σ|r_j||r_{j-1}|/(K−2) over a trailing window. Flag when (|L_i|−C_n)/S_n exceeds a Gumbel critical value. Past data only, so it can be run live. Authors report better size and power than BNS or Jiang-Oomen.

**Intensity**
- **Hawkes**: λ(t) = μ(t) + Σ_{t_k<t} αe^{−β(t−t_k)}, branching ratio α/β < 1. Let μ(t) carry the seasonal shape and add an exogenous kernel for scheduled news (Rambaldi et al.) [V].

**Forecast use**
- **HAR-CJ** (Andersen, Bollerslev, Diebold 2007) [V]: RV_{t+h} on daily, weekly and monthly C plus J, where J = max(RV−BV,0) when the test is significant. Semivariance variant by sign: Patton & Sheppard 2015 [V].

**Merton 1976** [M]
- r|Δ ~ Σ_k Pois(k;λΔ)·N(aΔ+km, σ²Δ+kδ²), mixture parameters (λ, m, δ, σ).
- Constant parameters conflict with clustering and seasonality, so fit on r/σ̂_forecast. The "jump on top" is then the excess over the forecast.
- The likelihood is unbounded: bound the parameters or profile it (Honoré 1998) [V-sec].

## Evidence on what happens AFTER a jump

| Asset | Finding | Direction |
|---|---|---|
| US equity ETFs, 2002-16, 212k jumps | Xiao, Yin, Zhao 2020 [V, summary read]. No-news jumps reverse for at least 60 min; scheduled-news jumps reverse; unscheduled-news jumps continue; positive-news jumps continue; negative jumps reverse hardest. No magnitudes in the summary | **Depends on news type and sign** |
| US stocks | Jiang & Zhu 2017 [V]: drift over 1-3 months, cross-sectional | Continuation |
| US stocks | Rotterdam 2023 working paper [V, snippet]: overnight jumps reverse up to 5 days | Reversal |
| S&P futures | Miao, Ramchander, Zumwalt 2014 [V]: most 08:30 jumps tie to news. Reversal claim seen only in a truncated snippet, so treat as unconfirmed | Unclear |
| FX, FOMC | Lee & Wang 2025 [V]: post-FOMC returns cancel about 65% of pre-FOMC drift, mostly 12-24h later; tied to negative jump volatility, which is high when illiquid | Slow reversal |
| CME FX futures | Rentzler et al. 2006 [V-sec]: intraday reversal after large one-day returns and gaps, 1988-2003 | Reversal |
| FX | Sign-switch study [V]: response to news flipped sign in 2008-09 on EURUSD, GBPUSD, USDJPY | Regime dependent |
| Gold | Sobti 2025 [V]: jumps 0.43% of intervals; US macro predicts 34%, FOMC dominant; futures jump more than ETFs; negative jumps larger. **I found no post-jump reversal study for gold** | Gap |
| 60+ futures | Baltussen et al. 2021 [V]: rest-of-day return predicts last 30 min, then reverts over following days; hedging link strongest on negative-gamma days | Continuation, then reversal |

**Mixed points**
- Sign and horizon differ by news type, sign of jump and asset. A single "jump → reversal" statement is not supported.
- Most post-jump evidence is equity. FX is thin and event-specific; gold is absent. Transfer to FX is a hypothesis.
- News splits look informative, but most jumps have no public news (Aït-Sahalia et al. 2024, stocks [V]; Joulin et al. 2008 [V]).
- Marcaccioli, Bouchaud, Benzaquen 2021 [V]: exogenous jumps show abrupt volatility and faster decay; endogenous jumps show accelerating volatility beforehand and slower decay. This is the one candidate **ex-ante** feature, but it is single-stock, and the abstract says nothing about price direction.

## Jump risk and level or stop-through behaviour

- **I found no published test of jump intensity predicting a break at a vol-scaled level.** This part of the question looks open.
- Closest mechanism: Osler 2002 [V, abstract]. FX trends run unusually fast where stop orders cluster, just beyond round numbers; the response is larger and lasts longer than for take-profit orders; significant for hours, not days. Her levels are round numbers, not vol-scaled, and she does not claim stops are the primary cause.
- Closest vol-scaled analogue: Zarattini, Aziz, Barbon 2024 [V] trade breakouts of a 14-day "noise area" around the open on SPY. Sharpe 1.33 comes from a third-party summary of a working paper, one instrument, and is a backtest. It is not a jump study.
- Intensity forecasting: Fičura 2017 on 15-min EURUSD [V] found most accuracy came from intraday seasonality. Self-excitation was strong but short-lived and added little. Hawkes did not beat logistic regression. So calendar and clock are the benchmark to beat.
- News share: only about 20% of FX bursts matched a scheduled release; USD releases are the most likely source [V, 1610.05383 snippet].

## Isolation tests

Lines stay frozen throughout.

**T1 Detector audit.** Flag rate by instrument and minute of day; share at scheduled times; agreement across LM, TBV and MedRV. Benchmark: flag rate on simulated seasonal-vol paths with no jumps.

**T2 Intensity.** P(flag in next 15/60 min), scored by log score and Brier. Benchmark: logistic on minute-of-day plus calendar. Hawkes must beat this, by Diebold-Mariano.

**T3 HAR-CJ.** QLIKE (robust to proxy noise, Patton 2011 [V]) against HAR. Report J forecast weight by asset class.

**T4 Post-jump path.** Signed return (jump sign × forward return) in σ units at 5/15/30/60/240 min, from the next bar's open.
- Splits: scheduled or not, up or down, asset class.
- Benchmark: same instrument and hour, same absolute size of move, unflagged.
- Report the full distribution, gross and net of real spread at that minute.

**T5 Level outcome, the owner's question.**
- Event: first touch of a p50/p75/p90 line.
- Outcome: symmetric race, ±xσ_local from the line, for several x. Symmetric barriers give 50% under a martingale whatever the vol, so 50% is the benchmark.
- Features: jump flag or intensity known strictly before the touch.
- Metrics: break-rate skill above base rate; R net of spread.
- Controls: mirror test (price inverted) and touches moved to random prices at the same distance.
- A touch on the jump bar itself is separate: it cannot be known beforehand.

Pre-register the grid. Control FDR over the full grid, cluster by date, and hold out a final block.

## Pitfalls

- **1-min bars do not resolve jumps.** Christensen, Oomen, Podolskij 2014 [V]: at tick level, jump variation is an order of magnitude smaller, and lower-frequency measures assign volatility bursts to jumps. Call 1-min flags "bursts", not discontinuities.
- **Seasonality fakes jumps.** LM over-detects in high-seasonality periods; modified test on EURUSD [V]. Deseasonalise using past data only. Hold US releases to event time, as the London clock moves with DST.
- **Spurious detections** multiply over bars: Bajgrowicz, Scaillet, Treccani 2016 [M]. Use a Gumbel or FDR threshold, never a fixed sigma.
- **Hawkes over-reads self-excitation** when the baseline is constant or bursts are non-stationary [V: 1610.05383; Wehrli et al. 2021].
- **Cojumps**: macro news moves many instruments together (Lahaye, Laurent, Neely 2011 [V]). USD legs make crosses synthetic, so 34 instruments are far fewer independent events.
- **Spreads** widen exactly at jumps. Mid-price reversal may not be tradeable, and that is a likely failure point.
- **Bad ticks** and thin rollover bars look like jumps. Filter first.
- **Lookahead**: the trailing σ̂ must exclude the current bar, and daily C/J is unknown intraday. Align calendar timestamps to the release minute.
- **Rarity**: compute minimum detectable effect before splitting by sign, news and asset.

## Sources

Xiao et al. law-journals-books.vlex.com/vid/jumps-news-and-subsequent-855590156 · Lee-Wang ideas.repec.org/a/oup/rasset/v15y2025i3-4p247-287..html · Lee-Mykland econpapers.repec.org/RePEc:oup:rfinst:v:21:y:2008:i:6:p:2535-2563 · Osler newyorkfed.org/research/staff_reports/sr150.html · Christensen et al. econpapers.repec.org/RePEc:eee:jfinec:v:114:y:2014:i:3:p:576-599 · Corsi et al. econpapers.repec.org/RePEc:eee:econom:v:159:y:2010:i:2:p:276-288 · Marcaccioli et al. arxiv.org/abs/2106.07040
