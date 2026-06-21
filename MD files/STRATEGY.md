# Range Extension Mean-Reversion Strategy
## Quantitative Trading System Development

**Status:** Phase 1 - Proof of Concept  
**Last Updated:** 2025-04-26  
**Current Sample:** 217 trades (8 weeks EUR/USD)  
**Current Performance:** +117 pips, 38.7% win rate, 1.45 profit factor

---

## 🎯 END GOAL

Transform this backtested concept into a **production-ready quantitative trading system** with:

- **Multi-year validation** (2+ years historical data)
- **Out-of-sample testing** (walk-forward analysis)
- **Monte Carlo simulation** (1000+ permutations)
- **Cross-instrument validation** (EUR/USD, GBP/USD, USD/JPY minimum)
- **Regime analysis** (trending vs ranging, high vs low volatility)
- **Live forward testing** (3-6 months demo → live transition)

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
  
- **Take Profit:** Fixed 2R
  - Simple, achievable target (if SL=7 pips, TP=14 pips)
  - Previous structural TP (next confluence level) was too far and rarely hit
  
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

## 🧪 TESTING ROADMAP

### Phase 1: Proof of Concept ✅ CURRENT
**Objective:** Validate core mechanics work on small sample

**Completed:**
- [x] Fixed SL/TP mechanics (range-based + 2R vs original ATR-based + structural)
- [x] Achieved profitability (1.05 PF → 1.45 PF)
- [x] Validated on 8-24 week samples
- [x] Confirmed tighter structural stops improve win rate (28.5% → 38.7%)

**Key Learning:**
- Range-based SL (0.35 multiplier, no floor) is optimal vs ATR-based
- Fixed 2R TP captures wins vs structural TP (too far, rarely hit)
- 30m ATR stops don't help mean-reversion (filters out 80% of trades, still loses money)

**Current Baseline:**
```
Trades: 217
Win Rate: 38.7%
Net Pips: +117
Avg R: 0.24R per trade
Profit Factor: 1.45
Max DD: -0.19%
Sharpe: 10.68
```

**Next Step:** → Phase 2

---

### Phase 2: Robustness Testing 🔄 NEXT
**Objective:** Prove system isn't curve-fit to 8 weeks of EUR/USD 2026

**Requirements:**
- [ ] Expand to **52-104 weeks** (1-2 years) on EUR/USD
- [ ] Validate PF stays >1.3 across full period
- [ ] Test on **GBP/USD** and **USD/JPY** (does concept generalize?)
- [ ] **Walk-forward analysis:**
  - Train on first 6 months (optimize if needed)
  - Test on next 3 months (out-of-sample)
  - Roll window forward, repeat 4+ times
  - Confirm out-of-sample PF >1.2
- [ ] **Monte Carlo simulation:**
  - Randomize trade order 1000 times
  - Check: Does equity curve shape hold?
  - Validate: 95% confidence interval still profitable

**Success Criteria:**
- PF >1.3 on 52+ week EUR/USD backtest
- At least 1 other pair (GBP/USD or USD/JPY) shows PF >1.2
- Walk-forward out-of-sample tests maintain PF >1.2
- Monte Carlo 95% CI remains profitable

**If Failed:** Strategy is overfit → return to Phase 1, simplify further

---

### Phase 3: Regime Analysis
**Objective:** Understand when the strategy works and when it doesn't

**Requirements:**
- [ ] Backtest 2020-2025 (5 years, multiple market regimes)
- [ ] Separate results by:
  - **Trend regime:** Trending months vs ranging months
  - **Volatility regime:** High vol vs low vol periods
  - **Year/quarter:** Performance consistency over time
- [ ] SD level analysis across regimes:
  - Do "bad levels" stay bad? (e.g., SD+2.50 consistently underperforms?)
  - Do "good levels" stay good? (e.g., SD+0.50 consistently profits?)
  - Sample size: Need 50+ trades per level before filtering

**Deliverables:**
- Performance matrix by regime
- Level-by-level breakdown (1000+ trade minimum per level)
- Kill-switch rules (if needed): "Don't trade in X regime"

**Success Criteria:**
- Strategy profitable in ≥70% of years tested
- Understand which regimes cause losses
- Identify any consistently bad SD levels (only if 50+ trades support it)

---

### Phase 4: Optimization (Only After Phase 3)
**Objective:** Fine-tune parameters WITHOUT overfitting

**Allowed Optimizations:**
- [ ] **Range multiplier:** Test 0.25, 0.30, 0.35, 0.40, 0.45, 0.50
  - Optimize on in-sample (first 60% of data)
  - Validate on out-of-sample (last 40%)
  - Accept if out-of-sample PF within 10% of in-sample
  
- [ ] **TP R-multiple:** Test 1.5R, 2.0R, 2.5R, 3.0R
  - Same in-sample / out-of-sample split
  - Track: Win rate vs Avg R trade-off
  
- [ ] **SD level filtering:** Only if Phase 3 shows clear patterns
  - Remove level ONLY if:
    - 50+ trades across all regimes
    - Consistently negative across multiple years
    - Economic logic supports removal
  
- [ ] **Confluence threshold:** Test 1.5, 2.0, 2.5 pips
  - Tighter = fewer but higher quality signals?
  - Wider = more signals but noisier?

**Forbidden Optimizations:**
- ❌ Don't optimize based on <500 total trades
- ❌ Don't add complexity (no ML, no additional indicators)
- ❌ Don't optimize on visual inspection of equity curve
- ❌ Don't remove losing trades manually

**Success Criteria:**
- Optimized parameters improve out-of-sample PF by ≥10%
- Performance robust across parameter ranges (no sharp cliffs)
- Total parameter count stays ≤10

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

1. **Sample Size Minimum**
   - No parameter changes based on <500 trades total
   - No level filtering based on <50 trades per level
   - No regime rules based on <100 trades per regime

2. **Walk-Forward Required**
   - Any optimization MUST be validated out-of-sample
   - In-sample period: First 60% of data
   - Out-of-sample: Last 40% (never touched during optimization)
   - Accept change ONLY if out-of-sample PF within 90% of in-sample

3. **Economic Logic Required**
   - Every parameter must have a **structural reason**
   - Example ✅: "Range-based SL because range created the level"
   - Example ❌: "Use 0.37 multiplier because it optimized best"

4. **Complexity Budget**
   - Maximum 10 adjustable parameters
   - Prefer simple rules over complex optimization
   - If you need to explain it in >3 sentences, it's too complex

5. **Cross-Validation**
   - Test on multiple instruments (EUR/USD, GBP/USD, USD/JPY)
   - Test on multiple timeframes (if concept allows)
   - Change accepted ONLY if it generalizes

6. **Regime Testing**
   - Validate across trending AND ranging periods
   - Validate across high AND low volatility
   - Understand where system fails (and why)

---

## 📊 CURRENT PARAMETER SET

### Core Parameters (Fixed)
```
Method: Asia 5m
Pair: EUR/USD
Confluence Tolerance: 2 pips
Tight Threshold: 50% of main tolerance (1 pip)
Signal Filter: All confluence (tight + normal)
Entry Window: 06:00-20:00 London
EOD Exit: 22:00 London
```

### Risk Management (Optimized in Phase 1)
```
SL Mode: Range-based
SL Multiplier: 0.35 (× session range)
SL Floor: NONE (range is the structural anchor)
TP Mode: Fixed R-multiple
TP Target: 2.0R
Min ATR Distance: 0.5× (filter levels too close to price)
Re-entry Cap: Twice per level per day
```

### Kill Switches (Conservative)
```
Daily: 2% account
Weekly: 5% account
Monthly: 10% account
Risk Per Trade: 0.25% account
```

### Level Filter (Current: ALL ENABLED)
```
SD Levels Traded: -6.00 to +6.00 (all Fibonacci extensions)
Inside-Range: ENABLED (SD ±0.25, ±0.50, ±0.75, ±1.00)
Extensions: ENABLED (SD ≥1.5, SD ≤-1.0)
```

**Note:** Level filtering deferred to Phase 3 after regime analysis

---

## 📈 PERFORMANCE BENCHMARKS

### Phase 1 (Proof of Concept) - 8-24 weeks
- **Minimum Acceptable:** PF >1.2, positive pips
- **Target:** PF >1.4, Sharpe >5
- **Current:** ✅ PF 1.45, Sharpe 10.68

### Phase 2 (Robustness) - 52+ weeks
- **Minimum:** PF >1.3 in-sample, >1.2 out-of-sample
- **Target:** PF >1.4 both, <20% variance
- **Status:** Not yet tested

### Phase 3 (Regime Analysis) - Multi-year
- **Minimum:** Profitable in ≥60% of years
- **Target:** Profitable in ≥75% of years, understand failure modes
- **Status:** Not yet tested

### Phase 4 (Optimized) - Post-tuning
- **Minimum:** Out-of-sample PF within 90% of in-sample
- **Target:** Out-of-sample PF within 95% of in-sample
- **Status:** Not applicable yet

### Phase 5 (Live Forward Test) - Demo
- **Minimum:** Live PF ≥80% of backtest PF
- **Target:** Live PF ≥90% of backtest PF
- **Status:** Not applicable yet

---

## 🔬 OPEN RESEARCH QUESTIONS

### High Priority (Test in Phase 2-3)

1. **SD Level Filtering**
   - **Question:** Should we remove SD±0.25 and SD+2.50 based on Phase 1 data?
   - **Current Data:** SD+0.50 (+44 pips best), SD+2.50 (-10.9 pips worst) on 217 trades
   - **Concern:** Sample size too small, might be regime-dependent
   - **Action:** Defer until Phase 3 (1000+ trades per level)

2. **TP Target Optimization**
   - **Question:** Is 2R optimal, or should we test 1.5R / 2.5R / 3R?
   - **Trade-off:** Lower R = higher win rate but less profit per win
   - **Action:** Phase 4 optimization (in-sample vs out-of-sample)

3. **Range Multiplier Fine-Tuning**
   - **Question:** Is 0.35 optimal, or test 0.30 / 0.40 / 0.45?
   - **Current:** 0.35 works well (6-8 pip stops on EUR/USD)
   - **Action:** Phase 4 optimization

4. **Directional Bias**
   - **Question:** Should first trade of day lock direction (no oscillation)?
   - **Logic:** After first short, only shorts allowed rest of day
   - **Pro:** Prevents getting chopped in ranges then killed on breakout
   - **Con:** Misses valid counter-direction setups
   - **Action:** Test in Phase 2 (large sample needed)

5. **Momentum Scoring**
   - **Question:** Is current ROC logic backwards for mean-reversion?
   - **Current:** High ROC (fast move into level) = +1 score
   - **Issue:** Fast move = strong trend = bad for fading
   - **Fix:** LOW ROC (slow grind) = +1 score?
   - **Action:** Test in Phase 2

### Medium Priority (Consider Phase 3+)

6. **Yield Spread Filter**
   - **Question:** Use US-DE 10Y spread as macro directional filter?
   - **Logic:** Widening spread = USD strength → favor shorts
   - **Issue:** Timescale mismatch (spread = weeks, trades = hours)
   - **Action:** Test in Phase 3, likely not helpful for intraday

7. **Session-Specific Performance**
   - **Question:** Does strategy work better at certain times of day?
   - **Test:** Break down by entry hour (06:00, 07:00, ... 20:00)
   - **Action:** Phase 3 regime analysis

8. **Volatility Regime Filtering**
   - **Question:** Should we skip trading on extreme vol days?
   - **Test:** Performance on VIX >25 days vs VIX <15 days
   - **Action:** Phase 3 regime analysis

### Low Priority (Phase 4+ or Never)

9. **Multiple Pairs Portfolio**
   - **Question:** Run on EUR/USD + GBP/USD + USD/JPY simultaneously?
   - **Benefit:** Diversification, more trade opportunities
   - **Risk:** Correlation (all USD pairs), over-trading
   - **Action:** Phase 5 (after live validation on single pair)

10. **Machine Learning Enhancement**
    - **Question:** Use ML to predict which confluence levels will work?
    - **Answer:** NO - adds complexity, overfitting risk, black box
    - **Action:** Never (keep system transparent and rule-based)

---

## 🧰 TECHNICAL IMPLEMENTATION NOTES

### Code Architecture
- **Engine:** JavaScript (client-side backtester)
- **Data Source:** Twelve Data API (5min + 30min bars)
- **Cache:** LocalStorage (avoid repeated API calls)
- **UI:** Single-page HTML with real-time rendering

### Current Limitations
1. **Bar-level simulation** (not tick-level)
   - Assumes limit fills at level price
   - Ambiguity when bar high/low both beyond SL and TP
   - Currently assumes TP hit first (optimistic)
   - **Fix in Phase 5:** Compare to live execution

2. **No slippage modeling**
   - Backtest assumes perfect fills
   - **Fix in Phase 5:** Track live slippage, adjust expectations

3. **Limited lookback** (API free tier = 800 calls/day)
   - Can fetch ~2 years in single request (5000 bar limit)
   - **Fix:** Upgrade API tier if needed for Phase 3

4. **Single instrument** (currently EUR/USD only)
   - **Fix in Phase 2:** Add GBP/USD and USD/JPY

### Data Quality Checks
- [ ] Verify no gaps in bar data (weekends excluded correctly)
- [ ] Confirm DST transitions handled (London time stable)
- [ ] Validate Asia session detection (00:00-06:00 GMT+1)
- [ ] Check Monday range calculation (previous week logic correct)

---

## 📝 DECISION LOG

### 2025-04-26: Range-Based SL + Fixed 2R TP (APPROVED)
**Change:** Switched from ATR-based SL (1.5× 5m ATR) to Range-based SL (0.35× session range, no floor)  
**Change:** Switched from Structural TP (next confluence) to Fixed 2R TP  
**Rationale:**
- ATR is volatility proxy, Range is structural anchor (aligns with strategy concept)
- Structural TP too far (30-50 pips), rarely hit → exit at EOD for scratches
- Fixed 2R = realistic (12-14 pips), achievable intraday  
**Results:**
- Win rate: 28.5% → 38.7% (+10.2%)
- Net pips: +15.4 → +117 (+661%)
- Profit factor: 1.05 → 1.45 (+38%)  
**Validation:** PENDING (Phase 2 - test on 52+ weeks)  
**Status:** ✅ Approved for Phase 1, requires Phase 2 confirmation

### 2025-04-26: 30m ATR Stop Loss (REJECTED)
**Proposed:** Use 30m ATR instead of Range-based for "wider stops, more breathing room"  
**Test Results:**
- 30m ATR + Fixed 2R: 37 trades (82% filtered!), -123 pips, 0.56 PF
- 30m ATR + Structural: 81 trades, 59.3% win (!), -64.5 pips, 0.82 PF  
**Rationale for Rejection:**
- Wider stops filtered out 80% of trades (min ATR distance check)
- Even with 59% win rate, lost money (losers bigger than winners)
- Mean-reversion needs quick snapback; if no reversal in 6-8 pips, you're wrong
- Giving 12-15 pips just means bigger losses  
**Decision:** ❌ Rejected - Range-based SL is superior  
**Status:** CLOSED

### 2025-04-26: SD Level Filtering (DEFERRED)
**Proposed:** Remove SD±0.25 and SD+2.50 based on poor performance  
**Data:** SD+2.50 worst performer (19 trades, 21% win, -10.9 pips)  
**Concern:** Only 217 total trades, too small for level-specific optimization  
**Decision:** ⏸️ DEFERRED to Phase 3  
**Action:** Document observation, test on 1000+ trades across regimes  
**Status:** OPEN (will revisit in Phase 3)

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
2. **Simple > Complex:** 5 parameters that make sense > 50 optimized parameters
3. **Robust > Perfect:** 1.4 PF across all regimes > 2.0 PF curve-fit to one regime
4. **Generalizable > Specialized:** Works on EUR/USD AND GBP/USD > perfect on EUR/USD only
5. **Transparent > Opaque:** Know why it works > just know that it works

---

## 📞 NEXT ACTIONS

### Immediate (This Week)
1. ✅ Document strategy in STRATEGY.md (this file)
2. [ ] Run 52-week backtest on EUR/USD (Phase 2 start)
3. [ ] Document results, compare to 8-week baseline
4. [ ] If PF >1.3, proceed to GBP/USD test
5. [ ] If PF <1.3, return to Phase 1 (simplify further)

### Short-Term (This Month)
1. [ ] Complete Phase 2 robustness testing
2. [ ] Walk-forward analysis (6-month train, 3-month test, rolling)
3. [ ] Monte Carlo simulation (1000 permutations)
4. [ ] Document Phase 2 results, decision on Phase 3

### Medium-Term (Next Quarter)
1. [ ] If Phase 2 successful → Phase 3 (multi-year, regime analysis)
2. [ ] If Phase 2 fails → Return to Phase 1, rethink core mechanics
3. [ ] Decision point: Continue to Phase 4 or pivot strategy

### Long-Term (6-12 Months)
1. [ ] Phase 4 optimization (only if Phase 3 successful)
2. [ ] Phase 5 demo forward testing
3. [ ] Live trading preparation (broker selection, infrastructure)

---

## 🔒 VERSION CONTROL

**Strategy Version:** 1.0  
**Code Version:** index_full_options.html (2025-04-26)  
**Last Major Change:** Range-based SL + Fixed 2R TP implementation  
**Next Review:** After Phase 2 completion (52+ week backtest)

---

## 📚 REFERENCES & RESOURCES

### Original Indicator
- TradingView: "Range Extension Confluence" indicator
- Logic: Fibonacci multiples of session body ranges (Asia 5m, Monday 30m)
- Confluence: Today's level ≈ Yesterday's level within tolerance

### Key Lessons Learned
1. **Lesson 1 (SL):** ATR-based stops too wide for mean-reversion → Range-based optimal
2. **Lesson 2 (TP):** Structural TP too far → Fixed 2R achievable and profitable
3. **Lesson 3 (Sample Size):** 217 trades insufficient for optimization → Need 1000+ for filtering decisions
4. **Lesson 4 (Breathing Room):** Wider stops don't help mean-reversion → Tight structural stops are the edge

### External Reading
- *Evidence-Based Technical Analysis* by David Aronson (avoiding data mining)
- *Quantitative Trading* by Ernest Chan (walk-forward, Monte Carlo)
- *Building Winning Algorithmic Trading Systems* by Kevin Davey (robustness testing)

---

**END OF STRATEGY DOCUMENT**

*This document is a living guide. Update after each major decision or phase completion.*
