# Range Extension Mean-Reversion Strategy
## Quantitative Trading System Development

**Status:** Phase 1 Complete → Ready for Phase 2  
**Last Updated:** 2025-04-28  
**Previous Sample:** 217 trades (8 weeks EUR/USD)  
**NEW: R2 Data Available:** 5 years (2020-2025) × 5 pairs  
**Next Action:** Run Phase 2 validation (52+ weeks)

---

## 🚀 MAJOR UPDATE: Cloudflare R2 Integration

### What Changed (2025-04-28)
**BREAKTHROUGH:** We now have 5 years of historical data (2020-01-01 to 2025-04-27) for all pairs via Cloudflare R2.

**This Unlocks:**
- ✅ Phase 2: Robustness testing (52-104 weeks) - **NOW POSSIBLE**
- ✅ Phase 3: Regime analysis (2020-2025) - **NOW POSSIBLE**
- ✅ Walk-forward validation - **NOW POSSIBLE**
- ✅ Monte Carlo simulation - **NOW POSSIBLE**
- ✅ Monday method proper validation - **NOW FIXED** (was limited to 3 weeks before)

**Data Details:**
- Source: Dukascopy historical bid prices
- Format: 5m + 30m bars, comma-separated CSV
- Storage: Public Cloudflare R2 bucket (no API key needed)
- Pairs: EUR/USD, GBP/USD, USD/JPY, GBP/JPY, XAU/USD
- Access: Browser-based (CORS enabled), instant caching

**Tool Updates:**
- File: `index_with_r2.html` (v2.0)
- New features: Year/month breakdown, daily £ P&L, exit type totals
- Data source toggle: R2 (default) vs Twelve Data API (fallback)

---

## 🎯 END GOAL

Transform this backtested concept into a **production-ready quantitative trading system** with:

- ✅ **Multi-year validation** (2+ years historical data) - **DATA NOW AVAILABLE**
- ✅ **Out-of-sample testing** (walk-forward analysis) - **DATA NOW AVAILABLE**
- ✅ **Monte Carlo simulation** (1000+ permutations) - **DATA NOW AVAILABLE**
- ⏳ **Cross-instrument validation** (EUR/USD, GBP/USD, USD/JPY minimum) - **READY TO TEST**
- ⏳ **Regime analysis** (trending vs ranging, high vs low volatility) - **READY TO TEST**
- ⏳ **Live forward testing** (3-6 months demo → live transition) - **AFTER PHASE 2-3**

**NOT** a curve-fit indicator that works on one 8-week EUR/USD sample.

---

## 📐 CORE STRATEGY LOGIC

### Concept
Mean-reversion trading system that fades Fibonacci extensions of intraday session ranges when confluence occurs between multiple timeframes.

### Entry Signal
**Confluence Detection:**
- Asia session (00:00-06:00 GMT+1) body range projected as Fibonacci multiples
- Previous Asia session range projected similarly
- Monday 30m candle body range + previous Monday range
- Entry when today's projection aligns with previous session's projection (within tolerance)

**Direction:**
- Extension levels (SD ≥1.0 or SD ≤-1.0): Structural (fade upward extensions SHORT, downward extensions LONG)
- Inside-range levels (SD between -1.0 and +1.0): Context-based (bar approach determines direction)

### Exit Management
**Current Optimized Settings (Phase 1):**
- **Stop Loss:** Range-based (35% of session range) - NO FLOOR
  - Structural anchor tied to the range that created the level
  - Adapts naturally to volatility (big range = bigger stop, small range = tighter stop)
  - Typical: 6-8 pips on EUR/USD
  
- **Take Profit:** Fixed 2.2R (updated from 2.0R in latest testing)
  - Simple, achievable target (if SL=7 pips, TP=15.4 pips)
  - Optimized through sweep 2.0-2.5R on 3.5 week sample
  - **Validation needed:** Test on 5-year data
  
- **Break-Even:** Regime-dependent trigger
  - High vol (>95 pip daily range): Move to BE+1 at 2R
  - Medium vol (52-95 pips): Move to BE+1 at 1.5R
  - Low vol (<52 pips): Move to BE+1 at 1R
  
- **EOD Exit:** 22:00 London (mark-to-market if still open)

### Trade Management Rules
- **One trade at a time** (no simultaneous positions)
- **Re-entry:** Allowed twice per level per day after 0.5× ATR clearance
- **Re-enter at TP:** When TP fires near confluence, immediately available for opposite/same direction entry

---

## 🧪 TESTING ROADMAP (UPDATED)

### Phase 1: Proof of Concept ✅ COMPLETE
**Objective:** Validate core mechanics work on small sample

**Completed:**
- [x] Fixed SL/TP mechanics (range-based + 2.2R vs original ATR-based + structural)
- [x] Achieved profitability (1.05 PF → 2.21 PF on 3.5 weeks)
- [x] Validated on 8-24 week samples (API limited)
- [x] Confirmed range-based stops outperform ATR
- [x] Optimized TP to 2.2R (sweep tested 2.0-2.5R)

**3.5 Week Baseline Results (EUR/USD):**
```
Trades: 164
Win Rate: 45.7%
Net Pips: +203.7
Avg R: 0.52R per trade
Profit Factor: 2.21 ⭐⭐⭐⭐⭐
Max DD: -0.12%
Sharpe: 19.4
```

**Cross-Pair Results (3.5 weeks):**
- EUR/USD: 2.21 PF ⭐⭐⭐⭐⭐ (best)
- USD/JPY: 1.65 PF ⭐⭐⭐⭐ (good)
- GBP/USD: 1.29 PF ⭐⭐⭐ (marginal)
- GBP/JPY: 1.07 PF ⭐⭐ (barely profitable)
- XAU/USD: 0.78 PF ❌ (losing)

**Key Learning:**
- Range-based SL (0.35 multiplier, no floor) is optimal vs ATR-based
- Fixed 2.2R TP captures wins vs structural TP (too far, rarely hit)
- Strategy works best on USD pairs
- 30m ATR stops filter out 80% of trades and still lose money

**Status:** ✅ COMPLETE - Ready for Phase 2

---

### Phase 2: Robustness Testing 🎯 READY TO START
**Objective:** Prove system isn't curve-fit to 3.5 weeks of EUR/USD 2025

**NEW: Data Availability** ✅
We now have 5 years (2020-2025) of data for all pairs via Cloudflare R2.

**Requirements:**
- [ ] **Expand to 52-104 weeks (1-2 years) on EUR/USD**
  - Run 2024-2025 backtest (most recent 18 months)
  - Target: 800-1000 trades minimum
  - Compare: PF vs 3.5 week baseline (2.21)
  - Success: PF stays >1.8 (within 20% of baseline)
  
- [ ] **Validate PF across full 5-year period**
  - Run 2020-2025 backtest (full history)
  - Target: 1200-1500 trades
  - Success: PF >1.5 (allowing for regime diversity)
  
- [ ] **Test on GBP/USD and USD/JPY (cross-pair validation)**
  - Run same 5-year period on each pair
  - Compare to EUR/USD baseline
  - Success: At least one pair shows PF >1.3
  
- [ ] **Walk-forward analysis:**
  - **Split 1:** Train 2020-2023 (4 years) → Test 2024-2025 (18 months)
  - **Split 2:** Train 2020-2022 (3 years) → Test 2023-2025 (30 months)
  - **Split 3:** Rolling 6-month train → 3-month test windows
  - Success: Out-of-sample PF >1.5 (within 30% of in-sample)
  
- [ ] **Monte Carlo simulation:**
  - Randomize trade order 1000 times
  - Calculate: Mean PF, 95% confidence interval
  - Validate: Equity curve shape consistency
  - Success: 95% CI includes profitable territory (PF >1.2)

**Expected Results:**
Based on 3.5 week performance (2.21 PF), we expect:
- **Best case:** 5-year PF ~2.0 (slight degradation is normal)
- **Realistic:** 5-year PF ~1.7-1.9 (accounting for regime diversity)
- **Acceptable:** 5-year PF ~1.5-1.7 (still highly profitable)
- **Failure:** 5-year PF <1.3 (strategy doesn't generalize)

**Success Criteria:**
- EUR/USD 5-year PF >1.5
- At least 1 other pair (GBP/USD or USD/JPY) shows 5-year PF >1.3
- Walk-forward out-of-sample maintains PF >1.5
- Monte Carlo 95% CI remains profitable
- Year/month breakdown shows consistency (no single year dominating)

**If Failed:** Strategy is overfit → return to Phase 1, simplify further

**Next Actions (Immediate):**
1. Run EUR/USD 2020-2025 backtest (full 5 years)
2. Document: trades count, PF, win rate, Sharpe
3. Use year/month breakdown to identify regime patterns
4. Compare vs 3.5 week baseline
5. If PF >1.5 → proceed to walk-forward
6. If PF <1.5 → diagnose why (which years/months failed)

---

### Phase 3: Regime Analysis 🔜 AFTER PHASE 2
**Objective:** Understand when the strategy works and when it doesn't

**NEW: Year/Month Breakdown Available** ✅
The backtester now includes year/month profitability breakdown, making regime analysis much easier.

**Requirements:**
- [ ] **Backtest 2020-2025 complete** (will be done in Phase 2)
- [ ] **Year-by-year analysis:**
  - 2020: COVID crash → recovery (extreme volatility)
  - 2021: Low volatility, ranging markets
  - 2022: Fed rate hikes, trending USD
  - 2023: Consolidation year
  - 2024-2025: Recent conditions
  - Success: Profitable in ≥4 out of 5 years
  
- [ ] **Quarter-by-quarter breakdown:**
  - Identify seasonal patterns (if any)
  - Q1 2020 (COVID) vs Q1 2021-2025 (normal)
  - Success: No quarter consistently catastrophic
  
- [ ] **Month-by-month drill-down:**
  - Use new year/month breakdown feature
  - Identify worst performing months
  - Check: Is it regime-specific or random?
  
- [ ] **Volatility regime separation:**
  - High vol: Daily range >95 pips
  - Med vol: Daily range 52-95 pips
  - Low vol: Daily range <52 pips
  - Compare PF across regimes
  
- [ ] **Trending vs Ranging markets:**
  - Use 20-day SMA as proxy (price > SMA = uptrend)
  - Separate trades by regime
  - Compare PF: uptrend vs downtrend vs range
  
- [ ] **SD level analysis across regimes:**
  - Run full 5 years with ALL levels enabled
  - Breakdown by individual SD level (e.g., +1.5, +2.0, -1.0)
  - Minimum 50 trades per level before filtering
  - Identify: Consistently bad levels (if any)

**Deliverables:**
- Performance matrix by year (2020-2025)
- Performance matrix by quarter
- Month-by-month heatmap (year/month breakdown feature)
- Volatility regime table (high/med/low vol PF)
- Trending/ranging regime table
- SD level leaderboard (5-year cumulative)
- Kill-switch rules (if needed): "Don't trade in X regime"

**Success Criteria:**
- Strategy profitable in ≥4 out of 5 years
- Understand which regimes cause losses
- Identify any consistently bad SD levels (only if 50+ trades)
- No single month/quarter accounting for >50% of profits

**Year/Month Breakdown Feature Usage:**
The backtester now displays:
```
▼ 2024  │ 543 trades │ 46.2% │ +£4,230 │ +423 pips
  ├─ Jan 2024: 48 trades, 47.9% win, +£450
  ├─ Feb 2024: 52 trades, 44.2% win, +£280
  ├─ Mar 2024: 45 trades, 48.9% win, +£520
  └─ ... (all 12 months)
```
Use this to quickly spot regime patterns.

---

### Phase 4: Optimization (Only After Phase 3)
**Objective:** Fine-tune parameters WITHOUT overfitting

**Allowed Optimizations:**
- [ ] **Range multiplier:** Test 0.25, 0.30, 0.35, 0.40, 0.45, 0.50
  - Current: 0.35 (tested on 3.5 weeks)
  - Optimize on: 2020-2023 in-sample
  - Validate on: 2024-2025 out-of-sample
  - Accept if: Out-of-sample PF within 10% of in-sample
  
- [ ] **TP R-multiple:** Test 1.8R, 2.0R, 2.2R, 2.5R, 3.0R
  - Current: 2.2R (optimized on 3.5 weeks via sweep)
  - Re-validate on: 5-year data
  - Same in-sample / out-of-sample split
  - Track: Win rate vs Avg R trade-off
  
- [ ] **SD level filtering:** Only if Phase 3 shows clear patterns
  - Remove level ONLY if:
    - 50+ trades across all regimes
    - Consistently negative across 3+ years
    - Economic logic supports removal
  - Example: If SD+2.5 loses in 2020, 2021, 2022, 2023, 2024 → maybe filter it
  
- [ ] **Confluence threshold:** Test 1.5, 2.0, 2.5, 3.0 pips
  - Current: 2.0 pips
  - Tighter = fewer but higher quality signals?
  - Wider = more signals but noisier?
  - Validate on out-of-sample

**Forbidden Optimizations:**
- ❌ Don't optimize based on <1000 total trades (we have enough data now)
- ❌ Don't add complexity (no ML, no additional indicators)
- ❌ Don't optimize on visual inspection of equity curve
- ❌ Don't remove losing trades manually
- ❌ Don't optimize TP separately for each year (overfitting)

**Success Criteria:**
- Optimized parameters improve out-of-sample PF by ≥10%
- Performance robust across parameter ranges (no sharp cliffs)
- Total parameter count stays ≤10
- Changes make economic sense (not just statistical fit)

**Note on 2.2R TP:**
This was optimized on 3.5 weeks (sweep 2.0-2.5R). Phase 4 should:
1. Validate 2.2R works on 5-year data
2. If not, re-sweep on 2020-2023 in-sample
3. Test optimal on 2024-2025 out-of-sample
4. Accept only if improvement >10% and out-of-sample validates

---

### Phase 5: Forward Testing
**Objective:** Validate real-world performance (slippage, execution, live market)

**Requirements:**
- [ ] Demo account: 3 months minimum
- [ ] Track:
  - Slippage (backtest assumed limit fills at level price)
  - Execution latency (missed entries?)
  - Spread impact (EUR/USD spread ~0.1-0.3 pips, negligible?)
  - Server downtime / missed signals
- [ ] Compare: Live results vs backtest expectation
- [ ] Adjust: If live PF <80% of backtest PF, diagnose why

**Success Criteria:**
- Live demo PF ≥80% of backtest PF
- Slippage <1 pip per trade average
- No systematic execution issues

**If Successful:** → Live trading with small size

---

## 🛡️ ANTI-OVERFITTING RULES

### Golden Rules (NEVER Break These)

1. **Sample Size First**
   - ❌ Don't optimize parameters on <1000 trades
   - ✅ We now have 5 years → ~1200-1500 trades expected
   - ✅ This is SUFFICIENT for optimization (Phase 4)

2. **Walk-Forward Mandatory**
   - ❌ Don't optimize on full dataset and declare victory
   - ✅ Always split: Train (60-70%) → Test (30-40%)
   - ✅ R2 data enables proper walk-forward (2020-2023 train, 2024-2025 test)

3. **Out-of-Sample Degradation**
   - ✅ Accept ≤30% degradation (in-sample PF 2.0 → out-of-sample 1.4+ is fine)
   - ❌ Reject >50% degradation (likely overfit)

4. **Economic Logic Required**
   - Every parameter must have a reason beyond "it tested well"
   - Range multiplier 0.35 = "structural stop inside the range that created the level"
   - TP 2.2R = "realistic intraday profit, twice the risk"

5. **Simplicity Over Complexity**
   - Current: 8 parameters (method, SL mult, TP R, conf tol, signal filter, BE triggers, re-entry, entry window)
   - Maximum: 10 parameters total
   - Each new parameter must justify its existence

6. **Cross-Validation Required**
   - ✅ Test on EUR/USD, GBP/USD, USD/JPY
   - ❌ Don't declare success based on EUR/USD alone
   - If it only works on one pair → it's curve-fit

7. **Regime Diversity Required**
   - ✅ Must work in 2020 (COVID crash), 2022 (Fed hikes), 2024 (consolidation)
   - ❌ If it only works in one year → it's curve-fit
   - NEW: Year/month breakdown makes this easy to verify

8. **No Retroactive Filtering**
   - ❌ Don't look at results, find bad month, exclude that month
   - ✅ Only exclude based on FORWARD-LOOKING rules
   - Example: "Skip first Friday of month" = retroactive ❌
   - Example: "Skip when VIX >30" = forward-looking ✅

9. **Parameter Stability**
   - Test range multiplier [0.25, 0.50] in 0.05 steps
   - If optimal = 0.35, AND 0.30/0.40 also work → STABLE ✅
   - If optimal = 0.35, AND 0.30/0.40 fail → CLIFF EDGE ❌

10. **Monte Carlo Validation**
    - Randomize trade order 1000 times
    - If 95% of permutations profitable → ROBUST ✅
    - If only 60% profitable → LUCKY ❌

---

## 📊 CURRENT STATUS (2025-04-28)

### What We Have
✅ **Backtester v2.0** with Cloudflare R2 integration  
✅ **5 years of data** (2020-2025) for 5 pairs  
✅ **Optimized parameters** (range SL 0.35, TP 2.2R)  
✅ **Phase 1 baseline** (2.21 PF on 3.5 weeks EUR/USD)  
✅ **Year/month breakdown** feature for regime analysis  
✅ **Exit type tracking** (TP/SL/BE totals)  
✅ **Daily £ P&L** display (assumes £10/pip)  

### What We Need to Do (Immediate)
🎯 **Run Phase 2 validation:**
1. EUR/USD 2020-2025 full backtest
2. GBP/USD 2020-2025 full backtest
3. USD/JPY 2020-2025 full backtest
4. Walk-forward analysis (2020-2023 train → 2024-2025 test)
5. Monte Carlo simulation (1000 permutations)

### What We'll Know After Phase 2
- Does 2.21 PF hold over 5 years? (Expected: 1.5-2.0 PF)
- Does it work on other pairs? (GBP/USD, USD/JPY)
- Does it survive out-of-sample testing?
- Is the strategy robust or overfit?

### Decision Point After Phase 2
- **If PF >1.5 on 5-year EUR/USD:**
  - ✅ Proceed to Phase 3 (regime analysis)
  - Use year/month breakdown to find patterns
  
- **If PF 1.2-1.5 on 5-year EUR/USD:**
  - ⚠️ Marginal but acceptable
  - Proceed to Phase 3 cautiously
  - Consider minor parameter adjustment in Phase 4
  
- **If PF <1.2 on 5-year EUR/USD:**
  - ❌ Strategy is overfit
  - Return to Phase 1
  - Simplify further or pivot concept

---

## 🎓 STRATEGY PHILOSOPHY

### What This System IS
- **Mean-reversion** based on structural exhaustion zones
- **Multi-timeframe confluence** (today vs yesterday, Asia vs Monday)
- **Range-based risk management** (stops anchored to session structure)
- **Simple, transparent rules** (can explain to non-quants)
- **Robust by design** (fewer parameters, structural logic)

### What This System IS NOT
- **Trend-following** (we fade extensions, not breakouts)
- **High-frequency** (intraday but not scalping)
- **Optimized to perfection** (deliberately simple to avoid overfitting)
- **Black box ML** (all rules have economic logic)
- **Set-and-forget** (requires regime awareness, monitoring)

### Core Beliefs
1. **Structure > Statistics:** Range creates level → range-based SL makes sense
2. **Simple > Complex:** 8 parameters that make sense > 50 optimized parameters
3. **Robust > Perfect:** 1.7 PF across all regimes > 2.5 PF curve-fit to one regime
4. **Generalizable > Specialized:** Works on EUR/USD AND GBP/USD > perfect on EUR/USD only
5. **Transparent > Opaque:** Know why it works > just know that it works

---

## 📝 DECISION LOG

### 2025-04-28: Cloudflare R2 Data Integration (APPROVED)
**Change:** Added 5 years of historical data via Cloudflare R2 bucket  
**Pairs:** EUR/USD, GBP/USD, USD/JPY, GBP/JPY, XAU/USD  
**Period:** 2020-01-01 to 2025-04-27  
**Rationale:**
- Twelve Data API free tier limited to ~3.5 weeks (5000 bar cap)
- Monday method needs 30m + 5m alignment across longer periods
- Phase 2-3 validation requires multi-year data
- Monte Carlo needs 1000+ trades  
**Results:** PENDING (Phase 2 about to start)  
**Status:** ✅ Infrastructure ready, validation pending

### 2025-04-28: Year/Month Breakdown Feature (APPROVED)
**Change:** Added expandable year/month profitability display  
**Features:**
- Year-level stats (trades, win%, £ P&L, pips, TP/SL/BE)
- Month-level drill-down (grid of 12 monthly cards per year)
- Color-coded P&L (green profit, red loss)
- Exit type breakdown per period  
**Rationale:** Makes regime analysis in Phase 3 much easier  
**Status:** ✅ Implemented and working

### 2025-04-28: Daily £ P&L Display (APPROVED)
**Change:** Added daily profit/loss in £ to day-by-day inspector  
**Assumption:** £10 per pip position sizing  
**Display:** Green/red pill showing "+£520" or "-£180" per day  
**Rationale:** More intuitive than pips for P&L tracking  
**Status:** ✅ Implemented (adjustable via line ~2958)

### 2025-04-26: Range-Based SL + Fixed 2.2R TP (APPROVED FOR PHASE 1)
**Change:** Switched from ATR-based SL to Range-based SL (0.35× session range, no floor)  
**Change:** Switched from Structural TP to Fixed 2.2R TP  
**Rationale:**
- ATR is volatility proxy, Range is structural anchor
- Structural TP too far (30-50 pips), rarely hit
- Fixed 2.2R = realistic (14-15 pips), achievable intraday  
**Results on 3.5 weeks:**
- Win rate: 28.5% → 45.7% (+17.2%)
- Net pips: +15.4 → +203.7 (+1224%)
- Profit factor: 1.05 → 2.21 (+110%)  
**Validation:** ⏳ PENDING Phase 2 (5-year test)  
**Status:** ✅ Approved for Phase 1, requires Phase 2 confirmation

### 2025-04-26: 30m ATR Stop Loss (REJECTED)
**Proposed:** Use 30m ATR instead of Range-based for "wider stops"  
**Test Results:**
- 30m ATR + Fixed 2R: 37 trades (82% filtered!), -123 pips, 0.56 PF
- 30m ATR + Structural: 81 trades, 59.3% win, -64.5 pips, 0.82 PF  
**Rationale for Rejection:**
- Wider stops filtered out 80% of trades
- Even with high win rate, lost money (losers too big)
- Mean-reversion needs quick snapback  
**Decision:** ❌ Rejected permanently  
**Status:** CLOSED

### 2025-04-26: SD Level Filtering (DEFERRED TO PHASE 3)
**Proposed:** Remove SD±0.25 and SD+2.50 based on poor performance  
**Data:** SD+2.50 worst performer (19 trades, 21% win, -10.9 pips) on 3.5 weeks  
**Concern:** Sample too small (217 trades total)  
**Decision:** ⏸️ DEFERRED to Phase 3  
**Action:** Re-evaluate on 5-year data (expect 50+ trades per level)  
**Status:** OPEN (will revisit after Phase 2)

---

## 📞 NEXT ACTIONS

### Immediate (This Week)
1. ✅ Integrate Cloudflare R2 data (DONE)
2. ✅ Add year/month breakdown (DONE)
3. ✅ Add daily £ P&L display (DONE)
4. 🎯 **Run EUR/USD 2020-2025 backtest** (NEXT)
5. 🎯 **Document Phase 2 results**
6. 🎯 **Compare to 3.5 week baseline (2.21 PF)**

### Short-Term (Next 2 Weeks)
1. [ ] Run GBP/USD 2020-2025 backtest
2. [ ] Run USD/JPY 2020-2025 backtest
3. [ ] Walk-forward analysis (2020-2023 train → 2024-2025 test)
4. [ ] Monte Carlo simulation (1000 permutations)
5. [ ] Year/month breakdown analysis
6. [ ] Decision: Proceed to Phase 3 or return to Phase 1

### Medium-Term (Next Month)
1. [ ] If Phase 2 successful → Phase 3 (regime analysis)
2. [ ] If Phase 2 fails → Return to Phase 1 (simplify)
3. [ ] Use year/month breakdown to identify regime patterns
4. [ ] Determine if any SD levels should be filtered

### Long-Term (3-6 Months)
1. [ ] Phase 4 optimization (only if Phase 2-3 successful)
2. [ ] Phase 5 demo forward testing
3. [ ] Live trading preparation

---

## 🔒 VERSION CONTROL

**Strategy Version:** 2.0 (R2-enabled)  
**Code Version:** `index_with_r2.html` (2025-04-28)  
**Previous Version:** `index.html` (API-only, 2025-04-26)  
**Last Major Change:** Cloudflare R2 integration + enhanced metrics  
**Next Review:** After Phase 2 completion (5-year backtest)  
**Data Source:** Cloudflare R2 (2020-2025) + Twelve Data API fallback

---

## 📚 REFERENCES & RESOURCES

### Data Sources
- **Primary:** Cloudflare R2 bucket (Dukascopy data, 2020-2025)
- **Fallback:** Twelve Data API (real-time, limited historical)
- **Format:** 5m + 30m OHLC bars, London timezone

### Key Lessons Learned
1. **Lesson 1 (SL):** ATR-based stops too wide for mean-reversion → Range-based optimal
2. **Lesson 2 (TP):** Structural TP too far → Fixed 2.2R achievable and profitable
3. **Lesson 3 (Sample Size):** 3.5 weeks insufficient → Now have 5 years
4. **Lesson 4 (Data Limitation):** API limits prevented proper validation → R2 solves this
5. **Lesson 5 (Monday Method):** Needs longer lookback → Now has proper 5-year span

### External Reading
- *Evidence-Based Technical Analysis* by David Aronson (avoiding data mining)
- *Quantitative Trading* by Ernest Chan (walk-forward, Monte Carlo)
- *Building Winning Algorithmic Trading Systems* by Kevin Davey (robustness testing)

### Tool Documentation
- File: `HANDOFF_v2.md` - Technical implementation details
- File: `index_with_r2.html` - Backtester v2.0 (R2 + enhanced metrics)
- File: `index.html` - Backtester v1.0 (API-only, archived)

---

**END OF STRATEGY DOCUMENT v2.0**

*This document is a living guide. Update after each major decision or phase completion.*

**Next Update:** After Phase 2 completion (5-year EUR/USD backtest results)