# Systematic Trading Strategy Library
## Rich's Macro-Driven Strategy Suite — Session Notes

> Written June 2026. All ideas grounded in the quantitative finance coursework,
> cross-asset macro framework, and dashboard architecture developed to date.
> These are research notes and hypotheses — not financial advice.
> Every strategy must pass the validation funnel before live capital is risked.

---

## The Validation Funnel (Non-Negotiable)

```
Hypothesis
    |
In-Sample Backtest (2005-2019)
    |
Out-of-Sample Test (2020-2022)
    |
Walk-Forward Analysis (rolling 2yr train / 3mo test)
    |
Paper Trade (3+ months minimum)
    |
Live - Small Size (25% of intended position)
    |
Scale Up
```

**Target metrics before any live deployment:**
- OOS Sharpe > 0.5
- Walk-Forward Efficiency > 0.5
- Max Drawdown < -20%
- At least 100 trades in backtest sample

---

## Portfolio-Level Strategies (Weekly / Monthly Signals)

These are the core systematic models. Lower frequency, higher SNR, less screen time.
Combined they form a regime-rotation portfolio targeting 20-28% CAGR on a $100k account.

| # | Strategy | File | Est. Trades/Year | Target CAGR | Status |
|---|----------|------|-----------------|-------------|--------|
| 1 | Macro Regime Equity (NQ/SPX) | [P1_MACRO_EQUITY.md](P1_MACRO_EQUITY.md) | 8-15 | 12-18% | Claude Code building |
| 2 | Credit-Equity Divergence | [P2_CREDIT_EQUITY.md](P2_CREDIT_EQUITY.md) | 6-10 | 10-15% | Brief ready |
| 3 | Yield Curve Regime Rotation | [P3_REGIME_ROTATION.md](P3_REGIME_ROTATION.md) | 4-8 | 10-14% | Brief ready |
| 4 | FX Carry (Regime-Filtered) | [P4_FX_CARRY.md](P4_FX_CARRY.md) | 20-30 | 8-12% | Brief ready |
| 5 | FX Cross-Sectional Momentum | [P5_FX_MOMENTUM.md](P5_FX_MOMENTUM.md) | 12-18 | 8-13% | Brief ready |
| 6 | Gold Macro Divergence | [P6_GOLD_DIVERGENCE.md](P6_GOLD_DIVERGENCE.md) | 4-8 | 7-11% | Brief ready |
| 7 | JPY Carry Unwind Circuit Breaker | [P7_JPY_CIRCUIT_BREAKER.md](P7_JPY_CIRCUIT_BREAKER.md) | Always on | Capital protection | Brief ready |
| 8 | VIX Vol-Carry (direct VIX exposure) | [P8_VIX_VOL_CARRY.md](P8_VIX_VOL_CARRY.md) | Variable (regime-driven) | 8-14% | Claude Code built — backtest ready, standalone dashboard viewer added |

### Portfolio Combined Estimate ($100k account)

| Scenario | Annual Return | Max Drawdown | Sharpe | Annual P&L |
|----------|--------------|-------------|--------|-----------|
| Conservative | 14-18% | -12% | 0.8-1.0 | $14k-$18k |
| Base Case | 20-28% | -16% | 1.0-1.4 | $20k-$28k |
| Optimistic | 32-40% | -22% | 1.4-1.8 | $32k-$40k |

---

## Intraday Strategies (Daily Signals, Active Execution)

Higher activity, lower SNR. Use 20-30% of capital maximum.
Designed to complement the portfolio models, not replace them.

| # | Strategy | File | Est. Trades/Week | Win Rate | Status |
|---|----------|------|-----------------|---------|--------|
| 1 | Opening Range Breakout (NQ/ES) | [I1_ORB.md](I1_ORB.md) | 3-6 | 52-58% | Brief ready |
| 2 | Asia Range Fibonacci | [I2_ASIA_FIB.md](I2_ASIA_FIB.md) | 5-10 | 68-73% | Dashboard built, needs WF test |
| 3 | VWAP Reversion (NQ/ES) | [I3_VWAP_REVERSION.md](I3_VWAP_REVERSION.md) | 8-15 | 58-64% | Brief ready |
| 4 | News Event Fade | [I4_NEWS_FADE.md](I4_NEWS_FADE.md) | 4-8/month | 55-62% | Brief ready |
| 5 | London Open Momentum (FX) | [I5_LONDON_OPEN.md](I5_LONDON_OPEN.md) | 5-10 | 54-60% | Brief ready |

---

## The Honest SNR Reality Check

```
Intraday SNR  < 0.3  — noise dominates, edge fragile
Daily SNR     0.3-0.6 — hard, needs macro filter
Weekly SNR    0.6-1.0 — viable with discipline
Monthly SNR   1.0-2.0 — strong signal
```

**Recommended capital split:**
- 70-80% → Portfolio-level models (P1-P7)
- 20-30% → Intraday models (I1-I5), prioritising I2 (Asia Fib) first

---

## Build Sequence

```
Phase 1 (Now)       P1 Macro Equity backtest        <- Claude Code running
Phase 2 (Week 2)    P2 Credit-Equity divergence     <- Same script, new signal
Phase 3 (Week 3)    P6 Gold Divergence              <- FRED data already pulling
Phase 4 (Month 2)   P4 FX Carry + P5 FX Momentum   <- yfinance FX pairs
Phase 5 (Month 2)   I2 Asia Fib walk-forward        <- 5m bar backtest
Phase 6 (Month 3)   P3 Regime Rotation portfolio    <- Combine validated models
Phase 7 (Month 3)   I1 ORB + I3 VWAP               <- NQ/ES intraday layer
Phase 8 (Month 4)   P7 JPY Circuit Breaker          <- Portfolio-level risk gate
Phase 9 (Month 4)   P8 VIX Vol-Carry                <- First strategy trading VIX directly, not as a filter
Phase 10 (Live)     MT5 execution bot               <- Already built, point at signals
```

**Note on P8:** every other strategy in this suite (and `bot/modules/vol_gate.py`) uses VIX only as a
regime gate/size multiplier for some other asset. P8 is the first to trade VIX exposure itself (short
VXX to harvest term-structure roll decay). Treat it with extra skepticism through the validation
funnel — short-vol-carry is the textbook "picks up nickels in front of a steamroller" strategy archetype,
and its failure mode (Volmageddon, Feb 2018) is the canonical tail-risk case study for this entire genre.

---

## Key Principles (From Training Material)

- **Economic rationale first** — if you cannot explain WHY it should work, it will not persist
- **Never deploy before walk-forward** — in-sample Sharpe is meaningless
- **Transaction costs kill intraday** — model 0.1-0.2% round trip minimum
- **Regime awareness** — no strategy works in all four macro regimes
- **Correlation spikes in crises** — diversification fails when you need it most
- **Patience is the retail edge** — no redemption risk, no career risk, use it
