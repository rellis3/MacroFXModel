# Range Extension Backtester — Technical Handoff v4.0

## What this is
A single-file HTML backtester (`index_with_r2_FIXED_v2.html`) for the Asia Range Extension / Standard Deviation level strategy. No build step. Deploy directly to Cloudflare Pages or open locally. All logic is vanilla JS + Chart.js.

**NEW IN v4.0:** Position Sizing Modes (Fixed/% Risk) + Transaction Cost Modeling (Spread/Slippage/Commission) + Corrected Equity Calculations

**NEW IN v3.0:** Advanced Confluence Filters (5 multi-factor filters), Quality Filter Presets, enhanced filtering framework for systematic quality improvement.

**NEW IN v2.0:** Cloudflare R2 integration for 5 years of historical data (2020-2025), year/month profitability breakdown, enhanced metrics.

---

## ⚠️ CRITICAL: Position Sizing & Equity Calculation (v4.0)

### The Problem (Identified 2025-04-28)
**Original code had two critical bugs:**

1. **Fixed £10/pip assumption** - Every trade used £10/pip regardless of account size
   - No compounding
   - Kill switches broken (tracked pips × risk, not % equity)
   - Unrealistic for live trading simulation

2. **Look-ahead bias** - Using 5-minute bars for entry/exit
   - When both SL and TP within same 5m bar, order is unknown
   - Code assumes SL hit first (conservative but arbitrary)
   - **PENDING FIX:** Requires 1-minute data integration

### The Fix (v4.0)

#### Position Sizing Modes
**Location:** Sidebar → "💰 Position Sizing & Costs" section

**Two modes available:**

##### 1. Fixed (£/pip) - DEFAULT ✅
```javascript
// Every trade uses same £ per pip
positionSize = p.fixedSize;  // e.g., £10/pip
profitLoss = netPips * positionSize;
```

**Use for:**
- Strategy backtesting and validation
- Clean pip-based results
- Comparing different strategies
- Industry standard for backtests

**Characteristics:**
- Position size never changes
- Equity grows linearly with pips
- Easy to interpret (7000 pips @ £10 = £70,000)
- No compounding

**Example:**
```
Trade 1: +100 pips × £10 = +£1,000
Trade 2: +100 pips × £10 = +£1,000 (same)
```

##### 2. % Risk (compound) - OPTIONAL
```javascript
// Position size scales with equity
riskAmount = equity * p.risk;  // e.g., £100k × 0.25% = £250
positionSize = riskAmount / stopLossPips;  // £250 / 7 pips = £35.71/pip
profitLoss = netPips * positionSize;
```

**Use for:**
- Live trading projection
- Long-term compounding simulation
- Capital planning
- Professional money management

**Characteristics:**
- Position size grows with equity
- Exponential growth if strategy profitable
- Can show very high returns (realistic if strategy works)
- More volatile equity curve

**Example:**
```
Account: £100,000
Risk: 0.25% = £250
SL: 7 pips
Position: £250 / 7 = £35.71/pip

Trade 1: +14 pips × £35.71 = +£500
Account: £100,500
Next risk: 0.25% × £100,500 = £251.25
Position grows automatically
```

⚠️ **IMPORTANT:** The crazy returns you saw (98 billion %) were from using % Risk mode with 7000+ pips. This is mathematically correct but shows the power of compounding. Use Fixed mode for strategy validation!

#### Transaction Costs (Both Modes)

**Location:** Same section, below position sizing

**Three cost types:**

##### 1. Spread (pips)
- Bid/ask spread cost on every trade
- Typical values:
  - EUR/USD: 0.5-1.0 pips
  - GBP/USD: 0.8-1.2 pips
  - USD/JPY: 0.8-1.5 pips
  - XAU/USD: 2.0-5.0 pips
- Deducted from gross pips BEFORE profit calculation

##### 2. Slippage (pips)
- Execution slippage (expected vs actual fill)
- Typical values:
  - Market orders: 0.2-0.5 pips
  - High volatility: 1.0-2.0 pips
  - News events: 2.0-5.0 pips
- Added to spread cost

##### 3. Commission (£/lot)
- Broker round-turn commission
- Typical values:
  - ECN brokers: £3-7 per lot
  - Market makers: £0 (wider spreads)
- Calculated based on position size
  - £10/pip = 1 standard lot
  - £35/pip = 3.5 lots
- Deducted from £ profit

**Implementation:**
```javascript
// Apply costs
const totalCosts = (p.spread || 0) + (p.slippage || 0);  // pips
const netPips = t.pipResult - totalCosts;

// Calculate £ P&L
const profitLoss = netPips * positionSize;

// Deduct commission
if (p.commission > 0) {
  const lots = positionSize / 10;  // £10/pip = 1 lot
  profitLoss -= p.commission * lots;
}
```

### Critical Impact: Transaction Costs

**Your strategy with realistic costs:**
```
Without costs:
- Trades: 4,506
- Net pips: +7,077
- @ £10/pip: £70,770 profit
- Return: ~71%

With costs (0.8 spread + 0.5 slip + £5 comm):
- Spread/slip: 1.3 pips × 4,506 = -5,858 pips
- Net pips: 7,077 - 5,858 = +1,219 pips
- Gross £: +£12,190
- Commission: £5 × 4,506 = -£22,530
- NET £: -£10,340 LOSS!
```

⚠️ **Transaction costs can turn winning pip strategy into losing £ strategy!**

**Implications:**
- High-frequency strategies need very low costs
- OR higher average win per trade
- OR much better win rate
- Consider trade frequency optimization

---

## Position Sizing UI Controls

### New Sidebar Section (After Min SL Floor)
```html
💰 Position Sizing & Costs

Position sizing mode: [Fixed ▼]
  ├─ Fixed (£/pip)     - Default
  └─ % Risk (compound) - For projections

[When Fixed selected:]
Fixed £ per pip: [10]
  
[When % Risk selected:]  
Risk per trade (%): [0.25]

Spread cost (pips): [0]
Slippage (pips): [0]
Commission (£/lot): [0]
```

### Parameters
```javascript
// Position sizing
p.posMode     = 'fixed' | 'percent'
p.fixedSize   = 10      // £ per pip (Fixed mode)
p.risk        = 0.0025  // 0.25% (% Risk mode)

// Transaction costs
p.spread      = 0       // pips
p.slippage    = 0       // pips
p.commission  = 0       // £ per lot
```

### Toggle Function
```javascript
function togglePosMode() {
  const mode = g('p_posmode').value;
  g('field_fixedsize').style.display = mode === 'fixed' ? 'block' : 'none';
  g('field_pctrisk').style.display = mode === 'percent' ? 'block' : 'none';
}
```

---

## Equity Calculation (applyTrade Function)

### Location: Line ~2369-2420

### Full Implementation:
```javascript
function applyTrade(t, dk) {
  const mo=dk.slice(0,7), wk=weekKey(new Date(dk).getTime()/1000);
  if (mo !== lastMonth)  { kills.month=0; lastMonth=mo; }
  if (wk !== lastWeekK)  { kills.week=0;  lastWeekK=wk; }
  
  // Apply transaction costs (spread + slippage)
  const totalCosts = (p.spread || 0) + (p.slippage || 0);
  const netPips = t.pipResult - totalCosts;
  
  // Calculate position size and P&L based on mode
  let positionSize, profitLoss, pctChange;
  
  if (p.posMode === 'percent') {
    // Percentage-based (compounding)
    const riskAmount = equity * p.risk;
    const safeStopLoss = Math.max(t.sl || 1, 0.1);
    positionSize = riskAmount / safeStopLoss;
    profitLoss = netPips * positionSize;
    
    // Deduct commission
    if (p.commission > 0) {
      const lots = positionSize / 10;
      profitLoss -= p.commission * lots;
    }
    
    pctChange = profitLoss / equity;
  } else {
    // Fixed £/pip
    positionSize = p.fixedSize;
    profitLoss = netPips * positionSize;
    
    // Deduct commission
    if (p.commission > 0) {
      const lots = positionSize / 10;
      profitLoss -= p.commission * lots;
    }
    
    pctChange = profitLoss / equity;
  }
  
  // Update kill switches (% of equity)
  kills.day   += pctChange;
  kills.week  += pctChange;
  kills.month += pctChange;
  
  // Update equity
  equity += profitLoss;
  peak = Math.max(peak, equity);
  eqA.push(rnd(equity));
  ddA.push(rnd(-(peak-equity)/peak*100, 2));
  
  // ... rest of fibStats tracking ...
  
  trades.push({...t, date:dk, killed, poundsResult: rnd(profitLoss, 2)});
}
```

### Key Changes from Original:
1. **Transaction costs** applied before P&L calculation
2. **Two position sizing modes** instead of hardcoded £10/pip
3. **Commission** properly deducted based on lot size
4. **Kill switches** track % equity change, not pips × risk
5. **Stores £ P&L** with each trade for accurate display

---

## Display Updates (v4.0)

### Daily P&L (Day-by-Day Inspector)
**Location:** Line ~3679-3681

**Old:**
```javascript
const dailyPounds = dailyPips * 10; // £10 per pip (WRONG)
```

**New:**
```javascript
const dailyPounds = dayTrades.reduce((sum, t) => sum + (t.poundsResult || 0), 0);
```

Now shows **actual £ profit/loss** including all costs and position sizing.

### Year/Month Breakdown
**Location:** Lines ~3554-3555, ~3568-3569

**Old:**
```javascript
const netPounds = netPips * 10; // £10 per pip (WRONG)
```

**New:**
```javascript
const netPounds = rnd(yearTrades.reduce((sum, t) => sum + (t.poundsResult || 0), 0), 0);
```

### Metrics Display
All £-based metrics now use actual position sizing:
- Daily P&L pills
- Monthly totals
- Yearly summaries
- Equity curve

**Pip-based metrics unchanged:**
- Profit Factor (still pip-based)
- Win Rate
- Net Pips
- Avg R

---

## Known Issues & Pending Fixes

### ⏳ PENDING: 1-Minute Data Integration

**Problem:** Intra-bar order bias with 5-minute bars
```
5-min bar: O=1.1000, H=1.1050, L=1.0950, C=1.1020
Entry: SHORT @ 1.1000
SL: 1.1010 (in range ✓)
TP: 1.0980 (in range ✓)

❓ Which hit first? Unknown!
Current: Assumes SL first (conservative)
Reality: Could be either - need 1-min data to know
```

**Solution:** Download and integrate 1-minute OHLC data
- Files needed: All 5 pairs, 2020-2025, M1 timeframe
- Upload to R2: `/EURUSD/eurusd-m1-bid.csv` etc.
- Modify entry walking logic to use 1-min bars
- See: `/mnt/project/1MIN_DATA_INTEGRATION_GUIDE.md`

**Expected impact:**
- Win rate: ±2-5% (could go either way)
- More accurate exit timestamps
- True order of SL/TP hits
- Industry best practice

---

## Data sources

### PRIMARY: Cloudflare R2 (v2.0+)
**5 years of historical data** — 2020-01-01 to 2025-04-27
- Data stored in public R2 bucket: `https://pub-1d8354116ae54e158e7010f0deb8f6e6.r2.dev`
- Bucket structure:
  ```
  /EURUSD/eurusd-m5-bid.csv, eurusd-m30-bid.csv
  /GBPUSD/gbpusd-m5-bid.csv, gbpusd-m30-bid.csv
  /USDJPY/usdjpy-m5-bid.csv, usdjpy-m30-bid.csv
  /GBPJPY/gbpjpy-m5-bid.csv, gbpjpy-m30-bid.csv
  /XAUUSD/xauusd-m5-bid.csv, xauusd-m30-bid.csv
  ```
- CSV format: `timestamp_ms,open,high,low,close` (comma-separated, unix milliseconds)
- Source: Dukascopy historical data
- CORS enabled for browser fetch
- No API key required
- Browser caching via sessionStorage (instant re-runs)
- Custom date range selection (default 2020-2025, user adjustable)

**⏳ COMING SOON:** 1-minute data for accurate entry/exit simulation
```
/EURUSD/eurusd-m1-bid.csv (2020-2025)
/GBPUSD/gbpusd-m1-bid.csv (2020-2025)
... etc
```

**Functions:**
- `fetchFromR2(pair, interval, startDate, endDate)` - fetches CSV from R2
- `parseR2CSV(csvText)` - parses comma-separated format with unix ms timestamps
- Converts to internal format: `{ts, dt, o, h, l, c}` with ts in seconds

### FALLBACK: Twelve Data API (Original)
**Limited to ~3.5 weeks** — free tier, 800 calls/day
- API key stored in `localStorage('td_api_key')` with remember/forget UI
- Fetches using `start_date` / `end_date` params (NOT `outputsize`) to bypass the 5000-bar cap
- 5m bars for Asia session method
- 30m bars for Monday method
- Both fetched from `(lookback + 2)` weeks ago to today
- Weekend bars filtered out in `fetchBars()` via `isWeekend()`

**Data Source Toggle:**
- UI selector at top of sidebar: "Cloudflare R2 (5 years)" vs "Twelve Data API (limited)"
- `toggleDataSource()` function shows/hides appropriate UI sections
- Separate caching for each source
- R2 is default (no API key needed)

---

## Quality Filter System (v3.0)

### Filter Preset Dropdown
**Location:** Sidebar, immediately after Method selection
**Purpose:** One-click switching between tested filter configurations

**6 Preset Options:**
1. **No Filter (Baseline)** - All SD levels, all confluence types (5,223 trades baseline)
2. **First Extensions Only** - SD ±1.0, ±1.5, ±2.0 only (~600-800 trades expected)
3. **Quality: Tight + Triple** - All SD levels, Tight+Triple confluence only
4. **Sweet Spot ⭐** - First extensions + Tight+Triple + 1.5 pip tolerance (~400-600 trades)
5. **Aggressive Quality** - SD ±1.0, ±1.5 only + Tight + 1.0 pip tolerance (~200-300 trades)
6. **Custom** - Manual control via checkboxes

**Implementation:**
```javascript
applyFilterPreset()
  ├── Reads selected preset from dropdown
  ├── Configures SD level checkboxes automatically
  ├── Sets signal filter (tight/conf/all)
  ├── Adjusts confluence tolerance
  └── Shows info box explaining active filter
```

**UI Features:**
- Blue highlighted box with 🎯 icon
- Info box shows active filter settings and expected results
- Preserves manual settings when switching to "Custom"
- One-click restoration to baseline with "No Filter"

### Advanced Confluence Filters (v3.0)
**Location:** Green highlighted section in sidebar (after momentum scoring)
**Purpose:** Multi-factor confluence for quality signal selection

**Master Toggle:**
- `adv_conf_on` checkbox enables/disables entire system
- When disabled, all filters are bypassed
- Individual filters can be toggled independently when system is enabled

#### Filter 1: Daily Bias (Trend Alignment)
**Concept:** Only fade moves AGAINST the daily trend

**Logic:**
- Calculates 20-period EMA on daily bars (constructed from 5m data)
- Determines bias: price > EMA = bullish, price < EMA = bearish
- LONG trades only when bullish (buying dips in uptrend)
- SHORT trades only when bearish (selling rallies in downtrend)

**Code location:** Line ~1619-1630 (utility), Line ~2730 (filter check)

#### Filter 2: RSI Divergence (Exhaustion Detection)
**Concept:** Only enter when RSI shows exhaustion/divergence

**Logic:**
- Calculates 14-period RSI on 5m bars
- For LONG: RSI < 30 (oversold) OR bullish divergence (price lower low, RSI higher low)
- For SHORT: RSI > 70 (overbought) OR bearish divergence (price higher high, RSI lower high)
- Looks back 20 bars for divergence patterns

**Code location:** Line ~1632-1682 (utility), Line ~2740 (filter check)

#### Filter 3: Bollinger Bands (Statistical Extreme)
**Concept:** Only enter at statistical price extremes

**Logic:**
- Calculates 20-period BB with 2.0 standard deviations
- For LONG: Price touched or broke below lower band
- For SHORT: Price touched or broke above upper band
- Ensures mean-reversion setup is at genuine extreme

**Code location:** Line ~1684-1702 (utility), Line ~2750 (filter check)

#### Filter 4: Time Window (Session Quality)
**Concept:** Only trade during high-probability hours

**Logic:**
- London session: 08:00-12:00 London time (peak liquidity)
- New York overlap: 13:00-17:00 London time (highest volume)
- Filters out low-liquidity Asian/late-NY hours
- Reduces noise from thin markets

**Code location:** Line ~1704-1710 (utility), Line ~2760 (filter check)

#### Filter 5: Volatility Regime (High Vol Only)
**Concept:** Only trade when volatility is elevated

**Logic:**
- Calculates 14-period ATR (Average True Range)
- Compares current ATR to 50-period moving average of ATR
- Only trades when ATR > 1.2× its MA (20% above average)
- Ensures sufficient price movement for TP targets

**Code location:** Line ~1712-1722 (utility), Line ~2770 (filter check)

### Filter Implementation Pattern
```javascript
// In processBars(), after confluence check (line ~2723):
if (p.mom.advConf) {
  // Daily Bias
  if (p.mom.dailyBias && !checkDailyBias(...)) continue;
  
  // RSI Divergence  
  if (p.mom.rsiDiv && !checkRSIDivergence(...)) continue;
  
  // Bollinger Bands
  if (p.mom.bbExtreme && !checkBBExtreme(...)) continue;
  
  // Time Window
  if (p.mom.timeWindow && !checkTimeWindow(...)) continue;
  
  // Volatility Regime
  if (p.mom.volRegime && !checkVolatilityRegime(...)) continue;
}
```

---

## Strategy Logic (Core)

### Entry Conditions
1. **Range Formation**
   - Asia session (00:00-08:00 London) for 5m method
   - Monday 00:00-08:00 for 30m method
   - Range = high - low in pips

2. **SD Level Calculation**
   - `price = asiaLow + (range × fibRatio)`
   - Levels: ±0.25 to ±10.5 (49 total)
   - Both above (sells) and below (buys) range

3. **Confluence Check**
   - Today's SD level vs Yesterday's SD level
   - Within tolerance (default 2 pips)
   - Triple = Asia + Monday aligned
   - Tight = within 50% of tolerance

4. **Signal Filter**
   - Tight only (green lines)
   - All confluence (orange + green)
   - All levels (no filter)

5. **Momentum Filter** (optional)
   - Deceleration (3-bar slowdown)
   - Wick rejection (30%+ wick)
   - ROC confirmation (0.3× ATR)
   - Min score threshold (1-3)

6. **Advanced Filters** (optional, v3.0)
   - Daily Bias (trend alignment)
   - RSI Divergence (exhaustion)
   - Bollinger Bands (extreme)
   - Time Window (session)
   - Volatility Regime (ATR)

### Exit Logic
**Stop Loss:**
- 5m ATR-based: `SL = slMult × ATR(14)` with floor
- 30m ATR-based: `SL = slMult × ATR30m(14)` with floor
- Range-based: `SL = rangePip × slRangeMult`
- Min SL floor (default 5 pips)

**Take Profit:**
- Structural: Next SD level in profit direction
- Fixed R: `TP = SL × tpFixedR` (e.g., 2R = 2× stop)
- Volume-Scaled R: Regime-based (2R/3R/5R for hi/med/lo vol)

**Break-Even:**
- Regime-based trigger: 2R/1.5R/1R for hi/med/lo vol
- Moves SL to entry +1 pip when triggered

**End of Day:**
- 22:00 London time (session close)
- Closes any open positions at market

### Position Sizing (v4.0)
**Fixed Mode (Default):**
- Constant £/pip (e.g., £10)
- Simulates fixed lot size
- Linear equity growth

**% Risk Mode:**
- Risk % of equity per trade (e.g., 0.25%)
- Position = (equity × risk%) / SL_pips
- Exponential compounding

### Transaction Costs (v4.0)
**Applied to every trade:**
- Spread (bid/ask): deducted from gross pips
- Slippage: added to spread cost
- Commission: deducted from £ profit

### Kill Switches
**Daily:** Max % loss per day (default 2%)
**Weekly:** Max % loss per week (default 5%)
**Monthly:** Max % loss per month (default 10%)

When triggered, no more trades taken that period.

---

## Key Functions

### Core Processing
```javascript
processBars(bars5, bars30, p, ps)
  ├── Pre-build Asia ranges (byDay structure)
  ├── Pre-build Monday ranges (if enabled)
  ├── Calculate ATR arrays (5m and 30m)
  ├── Build daily bars (from 5m data)
  ├── Main loop: iterate days
  │   ├── Filter by enabled fibs
  │   ├── Detect confluence (today vs yesterday)
  │   ├── Classify tier (triple/tight/normal)
  │   ├── Apply signal filter
  │   ├── Apply momentum filter (if enabled)
  │   ├── Apply advanced filters (if enabled, v3.0)
  │   ├── Calculate SL (ATR/range-based)
  │   ├── Calculate TP (structural/fixedR/volScaledR)
  │   ├── Walk entry bars → simulate trade
  │   ├── Apply transaction costs (v4.0)
  │   ├── Update equity with position sizing (v4.0)
  │   └── Check kill switches
  └── Return {trades, fibStats, dailyMaps, eqA, ddA}
```

### Position Sizing (v4.0)
```javascript
applyTrade(t, dk)
  ├── Reset monthly/weekly counters
  ├── Apply transaction costs (spread + slippage)
  ├── Calculate position size:
  │   ├── Fixed mode: use p.fixedSize
  │   └── % Risk mode: (equity × p.risk) / t.sl
  ├── Calculate £ P&L: netPips × positionSize
  ├── Deduct commission (based on lot size)
  ├── Update kill switches (% equity)
  ├── Update equity curve
  └── Store trade with poundsResult
```

### Filter Utilities (v3.0)
```javascript
// Daily EMA calculation
buildDailyBars(bars5) → [{ts, dt, o, h, l, c}]
calcEMA(data, period) → [ema values]

// RSI and divergence
calcRSI(prices, period) → [rsi values]
detectRSIDivergence(prices, rsi, lookback) → {bullish, bearish}

// Bollinger Bands
calcBollingerBands(prices, period, stdDev) → {upper, middle, lower}

// Time window
checkTimeWindow(timestamp, londonHourFunc) → boolean

// Volatility regime
calcATR(bars, period) → [atr values]
calcMA(values, period) → [ma values]
```

### Entry Walking
```javascript
// Simulates trade from entry to exit
// Checks SL, TP, BE trigger, EOD
// Returns: {win, R, pipResult, exitType, exitTs}

⚠️ KNOWN ISSUE: 5-minute bars used
   If both SL and TP in same bar → assumes SL first
   FIX: Use 1-minute data (pending)
```

---

## UI Structure

### Sidebar (Left)
1. **Data Source** - R2 vs API toggle
2. **Date Range** - Start/End dates (R2 only)
3. **Pair Selection** - 5 pairs
4. **Method** - Asia/Monday/Both
5. **🎯 Filter Presets** - 6 quick configs (v3.0)
6. **Signal Filter** - Tight/Conf/All
7. **Confluence Tolerance** - Pip threshold
8. **Touch %** - Min overlap required
9. **Min ATR** - Volatility floor
10. **Re-entry** - Count limit
11. **TP Buffer** - Safety margin
12. **TP Mode** - Structural/FixedR/VolScaledR
13. **Flip on SL** - Breakout chain
14. **Re-enter at TP** - Sequential entries
15. **SL Mode** - ATR/ATR30m/Range
16. **Min SL Floor** - Pip minimum
17. **💰 Position Sizing & Costs** (v4.0)
    - Mode: Fixed/% Risk
    - Fixed £/pip OR Risk %
    - Spread (pips)
    - Slippage (pips)
    - Commission (£/lot)
18. **ATR Period** - Bars for ATR calc
19. **Early Window** - Session start minutes
20. **🎯 Momentum Scoring** (optional)
21. **🟢 Advanced Confluence** (optional, v3.0)
22. **Kill Switches** - Daily/Weekly/Monthly %
23. **SD Level Checkboxes** - 49 fib levels
24. **Run Button** - Execute backtest

### Main Panel (Right)
1. **Summary Cards** - Key metrics
   - Trades, Win%, Exit types
   - Net pips, Avg R, Profit Factor
   - Max DD, Sharpe, Calmar
   - Triple/Tight win%
2. **Equity Chart** - Balance over time
3. **Drawdown Chart** - Peak-to-trough %
4. **SD Level Performance** - Top 10 + All
5. **Year/Month Breakdown** - Annual/monthly P&L
6. **Day-by-Day Inspector** - Trade-level detail
7. **Config Manager** - Save/load settings

---

## Recommended Workflow

### 1. Strategy Validation (NEW - v4.0)
```
Position sizing: Fixed (£/pip)
Fixed £/pip: 10
Spread: 0.8 pips (EUR/USD typical)
Slippage: 0.5 pips
Commission: 5 £/lot
Filter preset: Sweet Spot
Date range: 2020-2025 (full 5 years)
```

**Analyze:**
- Is profit factor >1.5 AFTER costs?
- Is Sharpe >1.0?
- Is max DD <20%?
- Are results consistent across years?

**If YES → Strategy is viable**
**If NO → Needs optimization or abandonment**

### 2. Capital Planning (After validation)
```
Position sizing: % Risk (compound)
Risk per trade: 0.25%
[Same costs as above]
[Same filters as above]
```

**Analyze:**
- What's realistic long-term return?
- Can I handle the drawdowns?
- How does position size grow?
- What capital do I need?

### 3. Filter Optimization
Start with "No Filter" baseline:
```
Filter preset: No Filter (Baseline)
Run → Note: 5,223 trades, X% win, Y PF
```

Apply progressive filters:
```
Preset: First Extensions Only
Run → Compare to baseline

Preset: Sweet Spot
Run → Compare again

Preset: Aggressive Quality  
Run → Final comparison
```

Choose filter that maximizes:
- PF × (1 - DD/100)
- While keeping trade count reasonable (>200)

### 4. Advanced Filter Testing (v3.0)
```
Start with: Sweet Spot preset
Enable: Advanced Confluence ON
Test individual filters:
  ✓ Daily Bias only → Run
  ✓ RSI Div only → Run
  ✓ BB Extreme only → Run
  ... etc

Find best 2-3 filter combination
```

### 5. Transaction Cost Sensitivity
Test cost scenarios:
```
Scenario A: ECN (tight spreads, commission)
- Spread: 0.5, Slippage: 0.3, Commission: 5

Scenario B: Market Maker (wide spreads, no comm)
- Spread: 1.2, Slippage: 0.5, Commission: 0

Scenario C: Retail (medium spreads, medium comm)
- Spread: 0.8, Slippage: 0.5, Commission: 3
```

**Question:** Which broker type suits this strategy best?

---

## Common Modifications

### Add new filter
1. Create utility function (around line 1600-1750)
2. Add UI toggle in advanced section
3. Integrate check in `processBars()` (around line 2730)
4. Test impact on metrics

### Modify filter preset
1. Edit `applyFilterPreset()` function
2. Update preset configuration object
3. Test with full backtest

### Change position sizing
1. Use UI toggle (no code needed)
2. Or modify defaults in `readParams()` (line ~2111)

### Change transaction costs
1. Use UI inputs (no code needed)
2. Or modify defaults in `readParams()` (line ~2113-2115)

### Test filter impact
- Enable/disable individual filters
- Compare metrics (PF, Sharpe, DD, trades)
- Save configs with different filter combos

### Add new metric
- Modify `render()` to add card
- Update `cards` array (line ~3196)

### Change SL/TP logic
- Modify `processBars()` entry walk section (line ~2000-2090)

### Change data source
- User can toggle in UI, no code change needed

---

## Version History

### v4.0 (2025-04-28) - Position Sizing & Transaction Costs
- ✅ Added Position Sizing Mode selector (Fixed/% Risk)
- ✅ Fixed equity calculation (was using hardcoded £10/pip)
- ✅ Added transaction cost modeling:
  - Spread cost (pips)
  - Slippage (pips)
  - Commission (£/lot)
- ✅ Corrected kill switches to track % equity
- ✅ Added poundsResult to trade objects
- ✅ Updated display calculations (daily/monthly £ P&L)
- ✅ Fixed annualized return calculation
- ⚠️ IDENTIFIED: Intra-bar order bias (pending 1-min data)
- 🎯 File: `index_with_r2_FIXED_v2.html`

### v3.0 (2025-04-28)
- ✅ Added Quality Filter Preset system (6 presets)
- ✅ Added Advanced Confluence Filters (5 filters)
  - Daily Bias / Trend Filter (EMA)
  - RSI Divergence (exhaustion)
  - Bollinger Bands (statistical extreme)
  - Time Window (session quality)
  - Volatility Regime (high vol only)
- ✅ Added filter utility functions (EMA, RSI, BB, divergence)
- ✅ Integrated filters into entry logic (line ~2723)
- ✅ Green highlighted UI section for advanced filters
- ✅ Blue highlighted UI section for filter presets
- ✅ Info boxes showing active filter settings
- 🎯 File: `index_with_r2.html`

### v2.0 (2025-04-28)
- ✅ Added Cloudflare R2 integration (5 years, 5 pairs)
- ✅ Added data source toggle (R2 vs API)
- ✅ Added year/month profitability breakdown
- ✅ Added daily £ P&L to day-by-day inspector
- ✅ Added exit type totals (TP/SL/BE) to summary
- ✅ Enhanced day pills with P&L and exit counts
- ✅ Browser caching for both sources
- ✅ Custom date range selection for R2
- 🎯 File: `index_with_r2.html`

### v1.0 (2025-04-26)
- Initial release with Twelve Data API only
- 8-24 week lookback limitation
- Range-based SL + Fixed 2R TP optimized
- Monday method working (within API limits)
- 🎯 File: `index.html`

---

## Critical Files

```
/mnt/project/
├── index.html                    # v1.0 - Original (API only)
├── index_with_r2.html            # v3.0 - R2 + filters
├── index_with_r2_FIXED_v2.html   # v4.0 - Position sizing + costs ⭐
├── HANDOFF.md                    # v1.0 - Original handoff doc
├── HANDOFF_v2.md                 # v2.0 - R2 integration handoff
├── HANDOFF_v3.md                 # v3.0 - Filters handoff
├── HANDOFF_v4.md                 # v4.0 - This document ⭐
├── STRATEGY.md                   # Strategy validation framework
├── STRATEGY_v2.md                # Updated for v2.0 (R2 data)
├── PIP_CALCULATION_FIX.md        # v4.0 - Bug fix details
├── POSITION_SIZING_UPDATE_v2.md  # v4.0 - Feature explanation
├── 1MIN_DATA_INTEGRATION_GUIDE.md # Pending 1-min data integration
└── QUICK_REFERENCE.md            # v4.0 - TL;DR summary
```

---

## Next Steps & Roadmap

### Immediate (This Week)
1. ✅ Fix position sizing calculation
2. ✅ Add transaction cost modeling
3. ⏳ Download 1-minute OHLC data (all pairs, 2020-2025)
4. ⏳ Integrate 1-min data for accurate entry/exit
5. ⏳ Re-run full backtest with all fixes

### Short-term (Next Month)
- Walk-forward analysis (train/test splits)
- Monte Carlo permutation testing
- Multiple pair correlation analysis
- Regime classification validation

### Medium-term (Quarter)
- Paper trading integration
- Real-time data feed
- Alert system for signal generation
- Position sizing calculator for live trading

---

**END OF TECHNICAL HANDOFF v4.0**

*Last updated: 2025-04-28*
*Current file: `index_with_r2_FIXED_v2.html`*
*Features: Cloudflare R2 (2020-2025) + Quality Filters + Position Sizing Modes + Transaction Costs*
*Critical Fix: Equity calculation now uses proper position sizing (Fixed/% Risk) + realistic costs*
*Pending: 1-minute data integration for intra-bar accuracy*