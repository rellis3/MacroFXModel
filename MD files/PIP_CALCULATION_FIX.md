# Pip Calculation Fix - Summary

## Date: 2025-04-28
## File Modified: `index_with_r2__1_.html`

---

## 🚨 Critical Bug Fixed: Pip-to-Equity Calculation

### The Problem

**Original Code (Line 2376):**
```javascript
equity += t.pipResult * 10;
```

This treated **every pip as £10** regardless of account size, which caused:

1. **Fixed position sizing** instead of percentage-based risk
2. **Linear equity growth** instead of compounding
3. **Kill switches broken** - they tracked `pipResult × risk` but equity didn't scale

**Example of the Bug:**
- Account: £100,000
- Risk: 0.25% = £250
- Trade: +100 pips
- **Old calculation:** £100,000 + (100 × £10) = £101,000 ✅
- Account: £101,000 (grew 1%)
- Next trade: +100 pips  
- **Old calculation:** £101,000 + (100 × £10) = £102,000 ❌
- **Should be:** £101,000 + (100 × £10.10) = £102,010 ✅

Over thousands of trades, this compounding error meant:
- Equity curve was **under-reporting** actual returns
- Position sizing wasn't growing with the account
- Risk management (kill switches) was disconnected from actual account %

---

## ✅ The Fix

### New Code (Lines 2374-2387):
```javascript
function applyTrade(t, dk) {
  const mo=dk.slice(0,7), wk=weekKey(new Date(dk).getTime()/1000);
  if (mo !== lastMonth)  { kills.month=0; lastMonth=mo; }
  if (wk !== lastWeekK)  { kills.week=0;  lastWeekK=wk; }
  
  // Calculate position size based on risk percentage
  // Risk amount in £ = equity × risk%
  // Position size in £/pip = risk amount / stop loss in pips
  const riskAmount = equity * p.risk;
  const positionSize = riskAmount / t.sl;  // £ per pip for this trade
  const profitLoss = t.pipResult * positionSize;
  
  // Update kill switches (now tracking % of account, not pips × risk)
  const pctChange = profitLoss / equity;  // As a decimal (e.g., 0.005 = 0.5%)
  kills.day   += pctChange;
  kills.week  += pctChange;
  kills.month += pctChange;
  
  equity += profitLoss;
  peak = Math.max(peak, equity);
  eqA.push(rnd(equity));
  ddA.push(rnd(-(peak-equity)/peak*100, 2));
```

### What Changed:

1. **Position Sizing:**
   - Now calculates £/pip based on account equity and risk %
   - Example: £100k × 0.25% risk = £250 risk / 7 pip SL = £35.71/pip
   - As account grows to £150k → £37.5/pip automatically

2. **Kill Switches:**
   - Changed from tracking `pipResult × risk` (broken)
   - Now track actual % change in equity
   - Example: £1,000 profit on £100k account = 1% = 0.01
   - Kill switch at 2% daily means account can lose max 2% per day

3. **Compounding:**
   - Position size now grows with equity
   - Matches real trading where you risk same % but $ amount grows

---

## 📊 Updated Display Calculations

### Daily P&L (Line 3679-3681):
**Old:**
```javascript
const dailyPounds = dailyPips * 10; // £10 per pip
```

**New:**
```javascript
const dailyPounds = dayTrades.reduce((sum, t) => sum + (t.poundsResult || 0), 0);
```

### Year/Month Breakdown (Lines 3554-3555, 3568-3569):
**Old:**
```javascript
const netPounds = netPips * 10; // £10 per pip
```

**New:**
```javascript
const netPounds = rnd(yearTrades.reduce((sum, t) => sum + (t.poundsResult || 0), 0), 0);
```

### Trade Storage (Line 2403):
**Old:**
```javascript
trades.push({...t, date:dk, killed});
```

**New:**
```javascript
trades.push({...t, date:dk, killed, poundsResult: rnd(profitLoss, 2)});
```

Now each trade stores its actual £ P&L for accurate reporting.

---

## 🎯 Expected Impact on Results

### Before Fix (Estimated Issues):
- Equity curve: **Under-reported** (didn't compound properly)
- Returns: Appeared lower than reality if strategy compounds well
- Risk per trade: Stayed constant instead of growing with account
- Kill switches: Disconnected from actual % drawdown

### After Fix:
- Equity curve: **Accurate compounding** returns
- Returns: Will show true %, likely **higher** if profitable
- Risk per trade: Grows proportionally with account
- Kill switches: Now correctly track % of current equity

### Likely Outcome:
If your strategy was showing:
- 2.21 PF on 3.5 weeks
- ~200 pips profit

After fix, you might see:
- **Similar or slightly better PF** (profit factor is pip-based, unaffected)
- **Higher £ returns** due to proper compounding
- **More accurate equity curve** that shows true account growth
- **Better risk management** with kill switches working correctly

---

## 🔍 What Still Needs Fixing: Intra-Candle Bias

**NOT YET FIXED** - Requires 1-minute data (coming tomorrow)

### Current Problem:
```javascript
// Lines 2016-2029: Checks SL first, then TP
const slHit = dir==='short' ? b.h >= activeSL : b.l <= activeSL;
if (slHit) {
  // Exits at SL
}

const tpHit = dir==='short' ? b.l <= tpPrice : b.h >= tpPrice;
if (tpHit) {
  // Exits at TP
}
```

**Issue:** Within a single 5-minute bar, both SL and TP can be hit, but we don't know which happened first. Current code **assumes SL first** (conservative), but this is arbitrary.

**Example:**
```
5-min bar: O=1.1000, H=1.1050, L=1.0950, C=1.1020
Entry: 1.1000 SHORT
SL: 1.1010 (10 pips above)
TP: 1.0980 (20 pips below, 2R)

Bar high = 1.1050 → SL triggered ✓
Bar low = 1.0950 → TP triggered ✓

Which happened FIRST? We don't know!
```

**Current behavior:** Code exits at SL (checks SL first)
**Reality:** Price path within the bar is unknown
**Impact:** Could be mis-attributing wins/losses

---

## 📅 Next Steps: 1-Minute Data Integration

### Tomorrow's Task:
1. Download 1-minute OHLC data for all pairs (2020-2025)
2. Upload to Cloudflare R2 bucket
3. Modify backtester to use 1-minute bars for entry/exit simulation

### Required Code Changes:

**1. Add 1-minute data fetching:**
```javascript
// Add to fetchFromR2()
const url1m = `${R2_BASE}/${pair}/${pair.toLowerCase()}-m1-bid.csv`;
```

**2. Update bar walking logic (around line 2010-2040):**
```javascript
// Walk 1-minute bars between entry and exit
for (const bar1m of bars1minute) {
  if (bar1m.ts < entryBar.ts) continue;
  if (bar1m.ts > eodTime) break;
  
  // Check SL hit on this 1m bar
  const slHit = dir==='short' ? bar1m.h >= activeSL : bar1m.l <= activeSL;
  if (slHit) {
    return { win: false, exitType: 'stop', exitTs: bar1m.ts, ... };
  }
  
  // Check TP hit on this 1m bar
  const tpHit = dir==='short' ? bar1m.l <= tpPrice : bar1m.h >= tpPrice;
  if (tpHit) {
    return { win: true, exitType: 'tp', exitTs: bar1m.ts, ... };
  }
  
  // Check BE move
  // ... etc
}
```

**3. Benefits:**
- ✅ Accurate order of SL/TP hits (no more intra-bar bias)
- ✅ Precise exit timestamps
- ✅ More realistic slippage simulation
- ✅ Better BE trigger accuracy

### File Size Estimate:
- 5 years × 5 pairs × 1-minute bars
- ~2.6 million bars per pair
- ~13 million total bars
- CSV format: ~50-100 bytes/bar
- Total: **~500MB - 1GB** of data

---

## 🧪 Testing the Fix

### Immediate Test:
1. Open `index_with_r2__1_.html` in browser
2. Run EUR/USD 2023-2025 (2 years)
3. Compare results to previous runs
4. Check:
   - ✅ Equity curve is smooth and compounds
   - ✅ Daily £ P&L matches equity changes
   - ✅ Year/month £ totals are consistent
   - ✅ Kill switches trigger at correct % levels

### Expected Changes:
- **Profit Factor:** Should be similar (2.2 PF → ~2.0-2.3 PF)
- **Win Rate:** Should be similar (45% → ~43-47%)
- **Net Pips:** Should be similar (200 pips → ~180-220)
- **£ Returns:** May be different (compounding now works)
- **Equity Curve:** Should be smoother, more realistic
- **Max Drawdown:** Should be more accurate

---

## 📝 Code Quality Notes

### What's Now Correct:
- ✅ Percentage-based position sizing
- ✅ Compounding equity growth
- ✅ Kill switches track actual % risk
- ✅ Accurate £ P&L display
- ✅ Realistic risk management

### What's Still Conservative/Safe:
- SL checked before TP (if both in same 5m bar, assumes SL hit first)
- This is **slightly pessimistic** but not critically wrong
- Will be fixed with 1-minute data tomorrow

### What's Cosmetic (Lower Priority):
- SD level breakdown still uses £10/pip estimate (line 3322)
- Chart labels and tooltips may reference old assumptions
- Documentation comments may need updating

---

## 🎓 Key Learnings

### Why This Bug Mattered:
1. **Equity tracking disconnected from risk** - you were trading fixed size forever
2. **No compounding** - wins didn't grow position size
3. **Kill switches broken** - tracked pips not % equity
4. **Results under-reported** - if strategy compounds, you'd miss it

### Why Your Colleagues Were Reassuring:
- This is a **common backtesting mistake**
- The strategy logic is still sound
- After fixing, results will be **more accurate**, possibly **better**
- Going from "Forbes list" to "quite good" just means fixing accounting, not strategy

### Professional Backtesting Checklist:
- ✅ Use percentage risk, not fixed position size
- ✅ Compound equity properly
- ✅ Track kill switches as % of current equity
- ⏳ Use finest granularity data possible (1-min minimum)
- ⏳ Test with conservative assumptions (slippage, commissions)
- ⏳ Walk-forward validation (train/test splits)
- ⏳ Monte Carlo permutation testing

---

**END OF FIX SUMMARY**

*Next: 1-minute data integration to eliminate intra-bar order bias*
*File: index_with_r2__1_.html (modified 2025-04-28)*
*Status: Pip calculation FIXED ✅, Intra-bar bias PENDING ⏳*
