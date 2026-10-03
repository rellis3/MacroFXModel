# Exhaust or continue at the daily lines: a framework

Written 2026-10-03. It builds on the Fade/Continue Book (`fade-continue-book` branch), `volatilityExhaustion/`, the Theory Lab, `education/`, and a literature search. Section 3 holds one new descriptive check that was **not pre-registered**: `residual_mechanism_check.py` → `RESIDUAL_MECHANISM_CHECK.md`.

---

## 1. The one idea that organises everything

The Vol Forecast v3 lines (OH/OL p50/75/90, Close p50/75, Proj H/L) are quantiles of the day's range, computed from **σ built from past price** (yz_10 / ewma_094 × event multiplier).

**If σ is right, a touched line is a coin flip, priced in by the spacing.** For a driftless random walk, the reflection principle says that once a level is touched, the odds of finishing beyond it are exactly 50%, whatever the level. The book found exactly this:
- Every price feature moves the continue rate.
- The distance to the next line moves with it, so every row lands on "fair odds minus spread".
- Even the 30-feature model (AUC 0.578) adds nothing over line/distance/time.

So **a fade-or-continue edge can only come from σ being wrong on that day**:

```
residual_t = realised range_t / forecast range_t
```

| Residual | What the lines are | What happens at a touch |
|---|---|---|
| > 1 | Too tight | Breaks run to the next line more often than the spacing assumes → **continue** |
| < 1 | Too wide | Price stops short of the outer lines → **exhaust** (the stall, not a reversal) |

Price features are already in σ, so only information **outside the price path** can predict the residual. That explains both results we have:
- Every price-based feature failed.
- The one non-price feature, IV/RV, passed.

**Working definition.** A day's lines are *exhaustion lines* when the predicted residual is below 1, and *continuation lines* when it is above 1. "Will this touch fade or continue?" becomes **"is today's σ too small or too big?"**, and that is answered **before the open**.

## 2. What "exhaustion" means here: stop, not reverse

The data is consistent on this:
- At the p90 line late in the day, 12% continue and 12% come back.
- `MARKET_STATE_FINDINGS.md`: reversal odds by budget used are flat at 0.50–0.52. High range by noon means *more* afternoon range.
- Fade MFE ≈ MAE at every horizon (EURUSD 17.0 vs 17.2 pips by day end).

So **exhaustion is a stall: the range stops growing.** It is not a magnet back to the open.

How to use it in practice:
- Do not chase.
- Take profit on existing positions at the line.
- Size down.

A fade trade still needs price to reach the line *behind*, and the spacing prices that too. The literature agrees (Savor 2012): moves without information reverse, moves with information drift. That only matters when you can tell which kind of move you are looking at (H6 below).

## 3. Evidence for the mechanism (new, descriptive)

**Data:** `oi_research_book` daily bars plus settlement IV, 6 FX majors + NAS100, 2020-09 → 2026-08, 10,493 days.

**Method:**
- σ = Yang-Zhang 10-day vol from bars through t−1, the same idea as the production yz_10. It has **no** event multiplier, and the bars are not London-midnight bars, so treat this as an approximation.
- residual = ln(H/L) ÷ σ.
- Terciles and the "p75 line" are fitted on 2020–22 only, then applied unchanged to 2023–26.

### Share of days whose range exceeds the p75 line (design: 25%)

| Before the open | 2020–22 low / mid / high tercile | 2023–26 low / mid / high tercile |
|---|---|---|
| **IV ÷ σ-forecast** | 14.8% / 23.0% / **37.4%** | 13.0% / 22.3% / **34.8%** |
| IV ÷ RV20 (the live rule's ratio) | 19.3% / 26.5% / 29.3% | 18.4% / 23.7% / 29.5% |
| Term slope iv30/iv90 | 26.7 / 22.5 / 25.9 | 22.8 / 24.6 / 25.6 (null) |
| Tier-1 USD event day (no / yes) | 23.1% / 37.6% | 22.7% / 33.6% |

**Per instrument, 2023–26, IV÷σ terciles:** all 7 are monotonic.

| Instrument | Low → High |
|---|---|
| AUDUSD | 12.5 → 32.1 |
| EURUSD | 12.8 → 34.5 |
| GBPUSD | 13.2 → 38.4 |
| NAS100 | 9.1 → 35.8 |
| USDCAD | 12.3 → 34.6 |
| USDCHF | 14.6 → 40.3 |
| USDJPY | 15.1 → 30.2 |

**Regression:** log range on log σ alone gives test R² 0.474. Adding log IV gives 0.520, with IV's weight (0.61) **larger than σ's** (0.37). Adding the event dummy gives 0.527.

**What this means:**
1. **The rich-IV break edge is a range-forecast error, not a pattern at the line.** On rich-IV days the RV lines are too tight. Price goes through them more often than designed, so breaks continue.
2. **The live rule measures it with a blunt ratio.** IV ÷ *the forecast's own σ* separates days about twice as well as IV ÷ RV20: a 22pp spread vs 10pp. RV20 is not what built the lines; σ is.
3. **The cheap-IV third is the real exhaustion regime.** There, p75 is exceeded about 13% of the time against a design of 25%. On those days the outer lines behave as caps. This is where "don't chase, take profit at the line" pays off.
4. **Term structure (iv30/iv90) is null.** Event days matter, but production σ already carries an event multiplier. The question is whether a residual is *left over* after that multiplier (H3).

**Caveats:** this check is not pre-registered. It is daily only, and the residual is about range size, not touch outcomes. It explains the IV result; it does not make a new trade. Any tradeable version goes through the house pre-registration process (section 6).

## 4. The daily read: what to compute at 22:00 UTC alongside the lines

Compute one number each evening, the **predicted residual R̂**, plus three flags.

```
R̂_t = exp( a + b·ln σ_t + c·ln IV_{t-1,daily} + d·event_t ) / σ_t
```

- The coefficients (a, b, c, d) are fitted per asset class on the training window only, walk-forward.
- IV_daily is CVOL or settlement iv30 ÷ √252. For indices it is VXN/VIX ÷ √252, or VIX1D when it is available.
- Equivalent and simpler: use the IV÷σ tercile.

| Regime | Condition | What the lines mean today | Play |
|---|---|---|---|
| **Continuation day** | R̂ in its top third (IV ÷ σ rich), or an event day the multiplier under-covers | Lines too tight. p50 and p75 are likely to break. | Follow breaks 00:00–10:00 London (the passing rule, re-gated on IV÷σ). Do not fade p50 or p75. |
| **Neutral day** | Middle third | Lines fair | No line trade. Market odds equal line odds. |
| **Exhaustion day** | R̂ in its bottom third | Lines too wide. p75 and p90 act as caps. | No breakout entries. Take profit at the line. A late p75/p90 touch is a stand-aside, not a fade. |

The three intraday flags are tests, not rules yet:
- **News present:** a break within ±15 minutes of a scheduled release (H6).
- **Fix window:** the break is inside the Tokyo fix (00:55 London BST) or the ECB fix (13:15) run-up (H4).
- **Straddle breakeven crossed:** price is beyond open ± the same-day ATM straddle (H2).

## 5. Ranked hypotheses to test next

Each one predicts **the residual or the flow**, never price at the line.

| # | Hypothesis | Measured before or at the touch | Data | Literature | Status |
|---|---|---|---|---|---|
| **H1** | Re-gate the rich-vol break rule on **IV ÷ forecast σ** instead of IV ÷ RV20. Then build a **blended σ** (HAR + IV) and check that the edge *vanishes* against blended lines. That would prove the mechanism and give better lines. | CVOL / iv30 at t−1; σ_t | In repo (`cmeCvolEod.json`, `oi_research_book`) | Busch, Christensen & Nielsen 2011 (IV adds to HAR-RV for FX, stocks and bonds); Christensen & Prabhala 1998 | **Run first.** Section 3 suggests it doubles the separation. |
| **H2** | **Index horizon-matched IV.** VIX1D (2023+) or VIX9D, divided by the NQ/SPX σ line, replacing VXN 30-day. | Cboe VIX1D/VIX9D EOD; sample at a fixed time | Free Cboe CSVs (`cdn.cboe.com/api/global/us_indices/daily_prices/VIX9D_History.csv`) | Albers et al. 2025, J. Futures Markets (HAR + VIX1D beats HAR + VIX). VIX1D rises ~28% overnight mechanically (FRL 2024), so compare like with like. | New |
| **H3** | **Event residual.** Within the rich-IV third, split event days from non-event days. Then test whether the production event multiplier leaves a residual above 1 (FOMC 1.244 may be too small for NQ, for example). | `calendar_events.csv`, `ff.json` | In repo | Andersen, Bollerslev, Diebold & Vega 2003, AER | New. News *surprise* is null; event *presence* versus the multiplier is untested. |
| **H4** | **Fix flow direction inside 00–10 London.** USD-buying breaks into the Tokyo fix continue; after the fix they don't. At month-end, sign the flow by month-to-date relative equity return. | Clock plus index returns | Free | Krohn, Mueller & Whelan 2024, J. Finance (USD rises into Tokyo/ECB/London fixes, then reverses, ~2bp per leg); Melvin & Prins 2015 | Builds on "month-end fix pushes through". The effect is small, so use it as a filter only. |
| **H5** | **Cross-session residual predictors.** Overnight gap ÷ σ; Asia range ÷ σ; same-day OVX/GVZ/VXN change; a jump already printed in ZN or DXY. | FRED (OVXCLS, GVZCLS, VXNCLS); own bars | Free | Hawkes cross-excitation (Aït-Sahalia, Cacho-Diaz & Laeven 2015); `MARKET_STATE_FINDINGS` (Asia compression → bigger London, 21 of 25) | Partly price-derived but cross-session. Check it is not already in σ. |
| **H6** | **Information vs no-information breaks.** A break within ±15 minutes of a release continues; a break with no news reverts. This is the only fade hypothesis with a mechanism. | Calendar timestamps | Free (headline feeds are paid) | Savor 2012, JFE; Grant, Wolf & Yu 2005 | New. "Catalyst within 60 min" was +3.4pp; test it as the fade-side condition. |
| **H7** | **Straddle breakeven as a line.** Open ± the same-day ATM straddle. Beyond it, dealer gamma hedging turns inelastic and momentum builds. Do RV lines that sit outside versus inside it behave differently? | 0DTE SPX/NDX straddle; FX overnight implied | Cboe DataShop / Databento OPRA (paid) | AFA 2024 working paper on the gamma-theta breakeven; Baltussen, Da, Lammers & Martens 2021, JFE | The GEX null used retail OI-based gamma, which assumes dealer sides. This tests a price-level trigger instead. |
| **H8** | **Signed order flow and depth at the touch (CME futures).** OFI over 1–5 min aligned with the break and depth depleted → continue. High volume with opposite OFI and stalled price (real absorption) → fade. | Trades + MBP-1 | Databento GLBX.MDP3, ~$0.50/GB, $125 free credit | Cont, Kukanov & Stoikov 2014 (OFI is contemporaneous, R² ~65%); Kavajecz & Odders-White 2004 (S/R levels sit at book-depth peaks) | The last untested family. Do **not** use OHLCV-based BVC/VPIN (Andersen & Bondarenko 2014: adds nothing once volume and vol are controlled for). |

**Deprioritised:**
- Osler round-number stop and take-profit clustering (2000/03/05): real in 1990s order books, but our round-number test is already null.
- Retail GEX/OI walls: null; the measurement is suspect.
- CTA trigger levels: paid and unvalidated, and fast trend has decayed since 2009 (arXiv 2607.01550).
- Market Profile: no peer-reviewed tests.
- COT: too slow; already null.

## 6. How to run them (house rules)

- Pre-register as `forge/<NAME>_PREREG.md` before any number is computed. Results go in `analysis/output/rangebook/<NAME>_RESULTS.md` in a separate commit.
- Pass criteria:
  - both halves (2016–22 / 2023–26);
  - BH-FDR 10%;
  - beats a shuffled benchmark;
  - placebo lines;
  - day-bootstrap CI;
  - indices must hold on shorts;
  - R net of spread, plus a one-extra-spread stress.
- For H1–H3 and H5, run the **daily residual test first** (cheap, like section 3). Only promote to the M1 touch book what moves exceedance in both halves. The M1 bars (R2 `m1/`) are not in this container.
- Add every new test to the multiple-testing ledger. This framework adds 8 hypotheses.

## 7. Short version

- **Lines are fair odds whenever σ is right.** Price at the touch cannot tell you more, because the spacing already prices it in.
- **Whether a day's lines fade or continue is set before the open** by how options price the day against the RV forecast.
  - IV ÷ σ rich → lines too tight → breaks continue.
  - IV ÷ σ cheap → lines too wide → outer lines act as exhaustion caps (stall, not reversal).
- **Next step:** re-gate the live rule on IV ÷ σ and build an IV-blended σ (H1). After that come horizon-matched index IV (H2), the event residual (H3), and fix-flow timing (H4). Order flow (H8) is the only remaining intraday family, and it needs paid CME data.

## References

- Andersen, Bollerslev, Diebold & Vega (2003). *Micro Effects of Macro Announcements.* AER.
- Andersen & Bondarenko (2014). *VPIN and the Flash Crash.* J. Financial Markets.
- Aït-Sahalia, Cacho-Diaz & Laeven (2015). *Modeling financial contagion using mutually exciting jump processes.* JFE.
- Albers et al. (2025). *A New Star Is Born: Does the VIX1D Render Common Volatility Forecasting Models … Obsolete?* J. Futures Markets.
- Baltussen, Da, Lammers & Martens (2021). *Hedging demand and market intraday momentum.* JFE.
- Bollerslev, Tauchen & Zhou (2009). *Expected stock returns and variance risk premia.* RFS.
- Busch, Christensen & Nielsen (2011). *The role of implied volatility in forecasting future realized volatility and jumps…* J. Econometrics 160:48–57.
- Christensen & Prabhala (1998). *The relation between implied and realized volatility.* JFE.
- Cont, Kukanov & Stoikov (2014). *The price impact of order book events.* J. Financial Econometrics.
- Dim, Eraker & Vilkov (2024). *0DTEs: Trading, Gamma Risk and Volatility Propagation.* SSRN 4692190.
- Evans & Lyons (2002). *Order flow and exchange rate dynamics.* JPE.
- Gao, Han, Li & Zhou (2018). *Market intraday momentum.* JFE.
- Grant, Wolf & Yu (2005). *Intraday price reversals in the US stock index futures market.* J. Banking & Finance.
- Kavajecz & Odders-White (2004). *Technical analysis and liquidity provision.* RFS.
- Krohn, Mueller & Whelan (2024). *Foreign Exchange Fixings and Returns around the Clock.* J. Finance.
- Lucca & Moench (2015). *The Pre-FOMC Announcement Drift.* J. Finance.
- Melvin & Prins (2015). *Equity hedging and exchange rates at the London 4pm fix.* J. Financial Markets.
- Osler (2000). *Support for Resistance.* FRBNY EPR.
- Osler (2003). *Currency Orders and Exchange-Rate Dynamics.* J. Finance.
- Osler (2005). *Stop-loss orders and price cascades.* JIMF.
- Savor (2012). *Stock returns after major price shocks: the impact of information.* JFE.
- Sullivan, Timmermann & White (1999). *Data-snooping, technical trading rule performance, and the bootstrap.* J. Finance.
