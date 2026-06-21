# Quick Reference: Pip Calculation Fix

## ✅ FIXED TODAY (2025-04-28)

### The Bug
```javascript
// OLD (WRONG):
equity += t.pipResult * 10;  // Every pip = £10 forever

// NEW (CORRECT):
const riskAmount = equity * p.risk;
const positionSize = riskAmount / t.sl;
const profitLoss = t.pipResult * positionSize;
equity += profitLoss;  // Pip value grows with account
```

### What Changed
- **Position sizing:** Now percentage-based (0.25% risk per trade)
- **Equity:** Now compounds properly (£10/pip → £10.10/pip → £10.20/pip...)
- **Kill switches:** Now track actual % of equity (was broken before)
- **Display:** Daily/monthly £ P&L now shows actual values

### Files Modified
- `index_with_r2_FIXED.html` - Main backtester with corrected calculations

### Expected Impact
- **Profit Factor:** Should stay similar (~2.2 PF)
- **Win Rate:** Should stay similar (~45%)
- **Net Pips:** Should stay similar (~200 pips)
- **£ Returns:** Will be HIGHER due to compounding (was under-reported)
- **Equity Curve:** Will be more realistic and smooth

---

## ⏳ TOMORROW: 1-Minute Data Fix

### The Remaining Bug
**Intra-bar order bias:** When both SL and TP are within same 5-minute bar, we don't know which hit first.

**Current behavior:** Assumes SL hit first (conservative)  
**Reality:** Need 1-minute bars to know true order

### What You Need to Do
1. Download 1-minute OHLC data for all 5 pairs (2020-2025)
2. Upload to Cloudflare R2: `/EURUSD/eurusd-m1-bid.csv` etc.
3. Let me know when it's ready

### What I'll Do
1. Add `fetchBars1m()` function
2. Replace entry walking logic to use 1-min bars
3. Test on single day → week → full 2 years
4. Compare results to current baseline

### Expected Changes
- **Win rate:** ±2-5% (could go either way)
- **More realistic:** True order of events
- **Professional standard:** Industry best practice

---

## 📊 Test Results After Fix

### Run This Test:
1. Open `index_with_r2_FIXED.html` in browser
2. Select EUR/USD, 2023-01-01 to 2025-04-27
3. Compare to your previous 3.5 week baseline:

**Previous (3.5 weeks):**
- Trades: 164
- Win Rate: 45.7%
- Net Pips: +203.7
- Profit Factor: 2.21

**Expected After Fix (2 years):**
- Trades: ~800-1000
- Win Rate: ~40-50%
- Net Pips: ~1500-2500
- Profit Factor: ~1.7-2.3 (should stay profitable)

### If PF Drops Below 1.5:
- Strategy may not generalize well
- Consider simplifying parameters
- But wait for 1-min data fix first!

---

## 🎯 Your Colleagues' Comments Explained

> "Either there may be a look ahead bias or error somewhere or you're going to be on the Forbes list"

**Translation:** Your results are TOO good. Either:
1. The pip calculation is wrong (YES - now fixed ✅)
2. Or look-ahead bias (YES - needs 1-min data ⏳)

> "Looks like per pip it's counted as a percentage. So if you have a 100pip trade, your account is growing 100% too."

**Translation:** The bug made 100 pips = 100% return (wrong!)
- Reality: 100 pips with 0.25% risk = ~0.5% return
- **NOW FIXED** ✅

> "Does it execute on 5min? As it could be hitting SL and TP in one candle etc."

**Translation:** Both SL and TP in same 5-min bar = ambiguous order
- **PENDING FIX** - need 1-min data ⏳

> "This should hopefully be simple to identify and then even after the correct it is likely you'll still have good metrics"

**Translation:** 
- These are common bugs (don't worry)
- Strategy logic is still sound
- After fixes, still expect profitable results
- Just won't be "Forbes list" levels 😊

---

## 📁 Files You Have

1. **index_with_r2_FIXED.html**  
   → Use this for all future backtests (pip calculation fixed)

2. **PIP_CALCULATION_FIX.md**  
   → Detailed explanation of what was wrong and how it's fixed

3. **1MIN_DATA_INTEGRATION_GUIDE.md**  
   → Step-by-step guide for tomorrow's 1-min data integration

---

## ✅ Checklist

**Today:**
- [x] Fixed pip-to-equity calculation
- [x] Fixed kill switch tracking
- [x] Fixed daily/monthly £ P&L display
- [x] Stored actual £ P&L with each trade
- [x] Created comprehensive documentation

**Tomorrow:**
- [ ] Download 1-minute data (all 5 pairs, 2020-2025)
- [ ] Upload to Cloudflare R2
- [ ] Notify me when ready
- [ ] I'll integrate 1-min walking logic
- [ ] Test and compare results

**After That:**
- [ ] Run full 5-year backtest with both fixes
- [ ] Compare to 3.5 week baseline
- [ ] If PF >1.5 → Strategy is solid
- [ ] If PF <1.5 → Return to simplification

---

**Status:** Pip calculation bug FIXED ✅  
**Next:** 1-minute data integration ⏳  
**Goal:** Accurate, professional-grade backtest results
