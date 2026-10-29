# Market Review Data Pack: 2026-10-28

Fetched 2026-10-28T01:39:32+00:00. Descriptive numbers for the weekly review (read with `education/market_reviews/PLAYBOOK.md`). Correlations are of daily moves: last 20 sessions vs the 60 before. They are noisy; a flip is a question, not a signal.

**Data notes:** fred DGS2: The read operation timed out · fred DFII10: The read operation timed out · fred T10YIE: The read operation timed out · fred BAMLH0A0HYM2: The read operation timed out · fred BAMLC0A0CM: The read operation timed out · FRED DGS2 missing: US 2y = US 5y stand-in for this run

## 1. Regime gauges: which story is the market trading?

| Pair | Recent | Before | Textbook sign | Status | What it means |
|---|---|---|---|---|---|
| CL=F vs US10Y | -0.39 | +0.45 | + | INVERTED (FLIPPED) | Oil vs yields: + = oil is an inflation story; - = oil is a growth tax (2008-style) |
| ^NDX vs US10Y | +0.59 | -0.30 | − | INVERTED (FLIPPED) | Stocks vs yields: - = rates drive stocks; + = growth scare, bonds hedge stocks |
| HYG_TLT vs ^NDX | +0.76 | -0.18 | + | textbook | Credit vs tech: high + = credit and equities are one trade (credit stress leading) |
| DX-Y.NYB vs ^GSPC | -0.01 | -0.33 | − | weak | Dollar vs stocks: - = safe-haven dollar; ~0/+ = "sell America" or liquidity dash |
| AUDUSD=X vs ^NDX | +0.32 | +0.44 | + | textbook | Aussie vs tech: near 0 = AUD trading commodities not risk |
| BTC-USD vs ^NDX | +0.59 | +0.40 | + | textbook | Bitcoin vs tech: high = one liquidity complex |
| XLE vs CL=F | +0.36 | +0.67 | + | textbook | Energy stocks vs oil: falling = equity investors fade the oil move |
| USDJPY=X vs US10Y | +0.59 | +0.27 | + | textbook | Yen vs yields: high = yen is a pure rates trade |
| FR_DE vs IT_DE | +0.84 | n/a | + | textbook (FLIPPED) | France vs Italy spreads: high = euro-periphery contagion, low = France-specific |

Equity vol vs bond vol: VIX 17.5 (1y pct 58) · MOVE 98 (1y pct 90). When bond vol leads equity vol, the stress is in rates/credit first.

**Fed funds futures (implied average rate by contract month; vs ~1 week earlier):** V6 3.885% (+0.000) · X6 3.925% (+0.010) · Z6 4.085% (+0.015) · F7 4.165% (+0.020) · G7 4.265% (+0.035) · H7 4.345% (+0.040) · J7 4.450% (+0.050) · K7 4.530% (+0.055) · M7 4.595% (+0.055) · N7 4.625% (+0.055) · Q7 4.645% (+0.055) · U7 4.660% (+0.030) (as of 2026-10-19)

## 2. G10 FX

### EURUSD  `EURUSD=X`  1.113 (2026-10-28)
**Move:** 1w -0.9% · 4w -1.8% (66th pct of 2y 4w moves) · 13w -3.0% · 52w range position 0% (lo 1.113 / hi 1.202)
**Drivers (recent corr):** US_EA2 -0.07 [weak] · US_DE10 +0.09 [weak] · FR_DE -0.55 [textbook] · ^STOXX50E +0.21 [weak] · BZ=F +0.23 [weak] → **in charge: FR_DE** (French spread (fiscal stress): wider = EUR-negative)
**Last 20 sessions decomposed (R² 0.37, n=27):** actual -1.8% = FR_DE -0.7% · BZ=F +0.1% · US_EA2 +0.1% · ^STOXX50E -0.0% · US_DE10 +0.0% · unexplained -1.2%
**Positioning (CFTC EURO FX, 2026-10-20, + = long EURUSD):** lev funds -68,840 (-8% OI, 4w -42,146, 1st pct of 3y) · asset mgrs +190,421 (+22% OI, 4w -26,062, 10th pct of 3y)
**This week:** 10-29 04:00 ET Spain: Spanish Retail Sales · 10-29 05:00 ET Italy: Italian Monthly Unemployment Rate (cons 6.2%, prev 6.2%) · 10-29 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.2%) · 10-29 08:30 ET United States: Core PCE Prices · 10-29 08:30 ET United States: GDP (cons 3.2%, prev 2.2%) · 10-29 08:30 ET United States: GDP Price Index (cons 3.5%, prev 6.1%)

### USDJPY  `USDJPY=X`  157.9 (2026-10-28)
**Move:** 1w -0.1% · 4w +0.2% (7th pct of 2y 4w moves) · 13w -3.3% · 52w range position 51% (lo 151.7 / hi 163.9)
**Drivers (recent corr):** US10Y +0.59 [textbook] · US_JP10 +0.49 [textbook] · ^NDX +0.64 [textbook] · ^VIX -0.51 [textbook, was INVERTED] → **in charge: ^NDX** (Risk appetite: carry trades fund in yen)
**Last 20 sessions decomposed (R² 0.15, n=60):** actual +0.2% = US10Y -1.3% · ^NDX -0.3% · US_JP10 +0.1% · ^VIX +0.1% · unexplained +1.6%
**Positioning (CFTC JAPANESE YEN, 2026-10-20, + = long USDJPY):** lev funds +22,890 (+6% OI, 4w +30,313, 26th pct of 3y) · asset mgrs -79,103 (-21% OI, 4w -37,474, 14th pct of 3y)
**This week:** 10-29 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.2%) · 10-29 08:30 ET United States: Core PCE Prices · 10-29 08:30 ET United States: GDP (cons 3.2%, prev 2.2%) · 10-29 08:30 ET United States: GDP Price Index (cons 3.5%, prev 6.1%) · 10-29 08:30 ET United States: GDP Sales · 10-29 08:30 ET United States: PCE price index (cons 0.5%, prev 0.3%)

### GBPUSD  `GBPUSD=X`  1.33 (2026-10-28)
**Move:** 1w -0.7% · 4w +0.3% (13th pct of 2y 4w moves) · 13w -0.5% · 52w range position 35% (lo 1.302 / hi 1.383)
**Drivers (recent corr):** US_GB10 +0.13 [weak] · GB10Y -0.29 [weak] · ^GSPC +0.17 [weak] · EURUSD=X +0.83 [textbook] → **in charge: EURUSD=X** (European block move)
**Last 20 sessions decomposed (R² 0.65, n=60):** actual +0.3% = EURUSD=X -1.4% · US_GB10 +0.2% · ^GSPC +0.0% · GB10Y +0.0% · unexplained +1.5%
**Positioning (CFTC BRITISH POUND, 2026-10-20, + = long GBPUSD):** lev funds +24,104 (+9% OI, 4w +10,865, 29th pct of 3y) · asset mgrs -134,621 (-53% OI, 4w -18,816, 4th pct of 3y)
**This week:** 10-29 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.2%) · 10-29 08:30 ET United States: Core PCE Prices · 10-29 08:30 ET United States: GDP (cons 3.2%, prev 2.2%) · 10-29 08:30 ET United States: GDP Price Index (cons 3.5%, prev 6.1%) · 10-29 08:30 ET United States: GDP Sales · 10-29 08:30 ET United States: PCE price index (cons 0.5%, prev 0.3%)

### USDCAD  `USDCAD=X`  1.406 (2026-10-28)
**Move:** 1w +0.1% · 4w -1.2% (59th pct of 2y 4w moves) · 13w +0.2% · 52w range position 72% (lo 1.349 / hi 1.428)
**Drivers (recent corr):** CL=F -0.18 [weak] · US_CA2 +0.34 [textbook] · ^GSPC +0.00 [weak] → **in charge: US_CA2** (US-Canada 2y rate gap)
**Last 20 sessions decomposed (R² 0.28, n=60):** actual -1.2% = US_CA2 -0.7% · CL=F -0.3% · ^GSPC -0.1% · unexplained -0.2%
**Positioning (CFTC CANADIAN DOLLAR, 2026-10-20, + = long USDCAD):** lev funds +91,113 (+24% OI, 4w +44,252, 94th pct of 3y) · asset mgrs +5,399 (+1% OI, 4w -18,722, 16th pct of 3y)
**This week:** 10-29 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.2%) · 10-29 08:30 ET United States: Core PCE Prices · 10-29 08:30 ET United States: GDP (cons 3.2%, prev 2.2%) · 10-29 08:30 ET United States: GDP Price Index (cons 3.5%, prev 6.1%) · 10-29 08:30 ET United States: GDP Sales · 10-29 08:30 ET United States: PCE price index (cons 0.5%, prev 0.3%)

### AUDUSD  `AUDUSD=X`  0.7046 (2026-10-28)
**Move:** 1w +0.2% · 4w +1.4% (55th pct of 2y 4w moves) · 13w +1.2% · 52w range position 74% (lo 0.6449 / hi 0.7255)
**Drivers (recent corr):** HG=F +0.30 [textbook] · ^NDX +0.32 [textbook] · GC=F -0.15 [weak] → **in charge: ^NDX** (Global risk proxy)
**Last 20 sessions decomposed (R² 0.17, n=60):** actual +1.4% = HG=F +0.1% · ^NDX -0.1% · GC=F -0.1% · unexplained +1.5%
**Positioning (CFTC AUSTRALIAN DOLLAR, 2026-10-20, + = long AUDUSD):** lev funds +52,497 (+16% OI, 4w -6,229, 90th pct of 3y) · asset mgrs -128,739 (-39% OI, 4w -73,386, 1st pct of 3y)
**This week:** 10-29 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.2%) · 10-29 08:30 ET United States: Core PCE Prices · 10-29 08:30 ET United States: GDP (cons 3.2%, prev 2.2%) · 10-29 08:30 ET United States: GDP Price Index (cons 3.5%, prev 6.1%) · 10-29 08:30 ET United States: GDP Sales · 10-29 08:30 ET United States: PCE price index (cons 0.5%, prev 0.3%)

### NZDUSD  `NZDUSD=X`  0.5608 (2026-10-28)
**Move:** 1w -1.7% · 4w -0.5% (16th pct of 2y 4w moves) · 13w -3.4% · 52w range position 4% (lo 0.5587 / hi 0.6076)
**Drivers (recent corr):** AUDUSD=X +0.28 [weak] · ^GSPC +0.26 [weak] · US2Y +0.23 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.33, n=60):** actual -0.5% = AUDUSD=X +0.9% · ^GSPC +0.0% · US2Y +0.0% · unexplained -1.5%
**Positioning (CFTC NZ DOLLAR, 2026-10-20, + = long NZDUSD):** lev funds -19,280 (-15% OI, 4w -14,493, 11th pct of 3y) · asset mgrs -49,313 (-38% OI, 4w -37,828, 9th pct of 3y)
**This week:** 10-29 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.2%) · 10-29 08:30 ET United States: Core PCE Prices · 10-29 08:30 ET United States: GDP (cons 3.2%, prev 2.2%) · 10-29 08:30 ET United States: GDP Price Index (cons 3.5%, prev 6.1%) · 10-29 08:30 ET United States: GDP Sales · 10-29 08:30 ET United States: PCE price index (cons 0.5%, prev 0.3%)

### USDCHF  `USDCHF=X`  0.8298 (2026-10-28)
**Move:** 1w +0.7% · 4w -0.7% (29th pct of 2y 4w moves) · 13w +2.0% · 52w range position 92% (lo 0.7632 / hi 0.8357)
**Drivers (recent corr):** US10Y +0.57 [textbook] · ^VIX -0.24 [weak] · GC=F +0.16 [weak] → **in charge: US10Y** (US yields)
**Last 20 sessions decomposed (R² 0.31, n=60):** actual -0.7% = US10Y -1.0% · GC=F +0.2% · ^VIX +0.0% · unexplained +0.1%
**Positioning (CFTC SWISS FRANC, 2026-10-20, + = long USDCHF):** lev funds +13,607 (+10% OI, 4w -2,850, 83rd pct of 3y) · asset mgrs +25,535 (+19% OI, 4w -9,988, 36th pct of 3y)
**This week:** 10-29 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.2%) · 10-29 08:30 ET United States: Core PCE Prices · 10-29 08:30 ET United States: GDP (cons 3.2%, prev 2.2%) · 10-29 08:30 ET United States: GDP Price Index (cons 3.5%, prev 6.1%) · 10-29 08:30 ET United States: GDP Sales · 10-29 08:30 ET United States: PCE price index (cons 0.5%, prev 0.3%)


## 3. G10 crosses

### AUDNZD  `AUDNZD=X`  1.257 (2026-10-28)
**Move:** 1w +2.0% · 4w +1.9% (86th pct of 2y 4w moves) · 13w +4.8% · 52w range position 100% (lo 1.139 / hi 1.257)
**Drivers (recent corr):** HG=F +0.19 [weak] · ^AXJO +0.05 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.04, n=60):** actual +1.9% = ^AXJO -0.1% · HG=F +0.1% · unexplained +2.0%
**This week:** 11-02 23:30 ET Australia: RBA Interest Rate Decision · 11-03 17:45 ET New Zealand: Employment Change · 11-03 17:45 ET New Zealand: Unemployment Rate

### EURGBP  `EURGBP=X`  0.8363 (2026-10-28)
**Move:** 1w -0.3% · 4w -2.1% (93rd pct of 2y 4w moves) · 13w -2.5% · 52w range position 0% (lo 0.8363 / hi 0.8842)
**Drivers (recent corr):** GB10Y -0.19 [weak] · FR_DE -0.40 [textbook] → **in charge: FR_DE** (Euro fiscal stress)
**Last 20 sessions decomposed (R² 0.13, n=27):** actual -2.1% = FR_DE -0.3% · GB10Y -0.0% · unexplained -1.8%
**This week:** 10-29 04:00 ET Spain: Spanish Retail Sales · 10-29 05:00 ET Italy: Italian Monthly Unemployment Rate (cons 6.2%, prev 6.2%) · 10-29 09:15 ET Euro Zone: Deposit Facility Rate (cons 2.50%, prev 2.50%) · 10-29 09:15 ET Euro Zone: ECB Monetary Policy Statement · 10-29 09:15 ET Euro Zone: ECB Interest Rate Decision (cons 2.65%, prev 2.65%) · 10-29 09:45 ET Euro Zone: ECB Press Conference

### EURCHF  `EURCHF=X`  0.923 (2026-10-28)
**Move:** 1w -0.3% · 4w -2.5% (98th pct of 2y 4w moves) · 13w -1.0% · 52w range position 49% (lo 0.9001 / hi 0.9466)
**Drivers (recent corr):** ^STOXX50E +0.62 [textbook] · FR_DE -0.80 [textbook] · ^VIX -0.25 [weak] → **in charge: FR_DE** (Euro fiscal stress)
**Last 20 sessions decomposed (R² 0.50, n=27):** actual -2.5% = FR_DE -0.9% · ^STOXX50E -0.2% · ^VIX +0.0% · unexplained -1.4%
**This week:** 10-29 04:00 ET Spain: Spanish Retail Sales · 10-29 05:00 ET Italy: Italian Monthly Unemployment Rate (cons 6.2%, prev 6.2%) · 10-29 09:15 ET Euro Zone: Deposit Facility Rate (cons 2.50%, prev 2.50%) · 10-29 09:15 ET Euro Zone: ECB Monetary Policy Statement · 10-29 09:15 ET Euro Zone: ECB Interest Rate Decision (cons 2.65%, prev 2.65%) · 10-29 09:45 ET Euro Zone: ECB Press Conference


## 4. EM FX

### USDMXN  `USDMXN=X`  18.67 (2026-10-28)
**Move:** 1w -0.1% · 4w +3.3% (88th pct of 2y 4w moves) · 13w +7.0% · 52w range position 97% (lo 16.89 / hi 18.72)
**Drivers (recent corr):** ^VIX +0.12 [weak] · ^GSPC -0.29 [weak] · CL=F +0.13 [weak] · USDBRL=X -0.00 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.16, n=60):** actual +3.2% = CL=F -0.6% · ^GSPC -0.3% · USDBRL=X +0.1% · ^VIX +0.1% · unexplained +3.9%
**Positioning (CFTC MEXICAN PESO, 2026-10-20, + = long USDMXN):** lev funds -63,814 (-23% OI, 4w +15,374, 10th pct of 3y) · asset mgrs +24,064 (+9% OI, 4w +69,570, 100th pct of 3y)
**This week:** 10-29 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.2%) · 10-29 08:30 ET United States: Core PCE Prices · 10-29 08:30 ET United States: GDP (cons 3.2%, prev 2.2%) · 10-29 08:30 ET United States: GDP Price Index (cons 3.5%, prev 6.1%) · 10-29 08:30 ET United States: GDP Sales · 10-29 08:30 ET United States: PCE price index (cons 0.5%, prev 0.3%)

### USDBRL  `USDBRL=X`  5.351 (2026-10-28)
**Move:** 1w +6.6% · 4w +3.3% (79th pct of 2y 4w moves) · 13w +4.4% · 52w range position 65% (lo 4.906 / hi 5.59)
**Drivers (recent corr):** ^VIX -0.05 [weak] · HG=F +0.07 [weak] · EWZ -0.06 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.02, n=60):** actual +3.3% = EWZ +0.4% · ^VIX +0.1% · HG=F +0.0% · unexplained +2.7%
**Positioning (CFTC BRAZILIAN REAL, 2026-10-20, + = long USDBRL):** lev funds -18,677 (-14% OI, 4w -3,760, 4th pct of 3y) · asset mgrs -51,268 (-38% OI, 4w +8,213, 46th pct of 3y)
**This week:** 10-29 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.2%) · 10-29 08:30 ET United States: Core PCE Prices · 10-29 08:30 ET United States: GDP (cons 3.2%, prev 2.2%) · 10-29 08:30 ET United States: GDP Price Index (cons 3.5%, prev 6.1%) · 10-29 08:30 ET United States: GDP Sales · 10-29 08:30 ET United States: PCE price index (cons 0.5%, prev 0.3%)

### USDZAR  `USDZAR=X`  16.65 (2026-10-28)
**Move:** 1w +1.7% · 4w +1.4% (44th pct of 2y 4w moves) · 13w -0.1% · 52w range position 53% (lo 15.71 / hi 17.49)
**Drivers (recent corr):** GC=F -0.22 [weak] · ^VIX +0.22 [weak] · HG=F -0.29 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.22, n=60):** actual +1.4% = GC=F +0.2% · ^VIX +0.1% · HG=F -0.1% · unexplained +1.2%
**Positioning (CFTC SO AFRICAN RAND, 2026-10-20, + = long USDZAR):** lev funds -4,888 (-13% OI, 4w -1,143, 24th pct of 3y) · asset mgrs -17,962 (-47% OI, 4w +4,871, 25th pct of 3y)
**This week:** 10-29 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.2%) · 10-29 08:30 ET United States: Core PCE Prices · 10-29 08:30 ET United States: GDP (cons 3.2%, prev 2.2%) · 10-29 08:30 ET United States: GDP Price Index (cons 3.5%, prev 6.1%) · 10-29 08:30 ET United States: GDP Sales · 10-29 08:30 ET United States: PCE price index (cons 0.5%, prev 0.3%)

### USDKRW  `USDKRW=X`  1,336 (2026-10-28)
**Move:** 1w +0.8% · 4w -1.5% (47th pct of 2y 4w moves) · 13w -7.4% · 52w range position 6% (lo 1,322 / hi 1,552)
**Drivers (recent corr):** ^KS11 +0.14 [weak] · SOXX -0.04 [weak] · DX-Y.NYB -0.17 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.11, n=60):** actual -1.5% = ^KS11 -0.6% · DX-Y.NYB +0.4% · SOXX +0.2% · unexplained -1.6%
**This week:** 10-29 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.2%) · 10-29 08:30 ET United States: Core PCE Prices · 10-29 08:30 ET United States: GDP (cons 3.2%, prev 2.2%) · 10-29 08:30 ET United States: GDP Price Index (cons 3.5%, prev 6.1%) · 10-29 08:30 ET United States: GDP Sales · 10-29 08:30 ET United States: PCE price index (cons 0.5%, prev 0.3%)


## 5. CE3 FX

### EURCZK  `EURCZK=X`  24.33 (2026-10-28)
**Move:** 1w +0.3% · 4w -0.4% (50th pct of 2y 4w moves) · 13w +0.7% · 52w range position 55% (lo 24.07 / hi 24.53)
**Drivers (recent corr):** ^STOXX50E -0.14 [weak] · EURPLN=X +0.55 [textbook] → **in charge: EURPLN=X** (CE3 block)
**Last 20 sessions decomposed (R² 0.15, n=60):** actual -0.4% = EURPLN=X +0.2% · ^STOXX50E +0.0% · unexplained -0.5%
**This week:** 10-29 04:00 ET Spain: Spanish Retail Sales · 10-29 05:00 ET Italy: Italian Monthly Unemployment Rate (cons 6.2%, prev 6.2%) · 10-29 09:15 ET Euro Zone: Deposit Facility Rate (cons 2.50%, prev 2.50%) · 10-29 09:15 ET Euro Zone: ECB Monetary Policy Statement · 10-29 09:15 ET Euro Zone: ECB Interest Rate Decision (cons 2.65%, prev 2.65%) · 10-29 09:45 ET Euro Zone: ECB Press Conference

### EURPLN  `EURPLN=X`  4.399 (2026-10-28)
**Move:** 1w +1.0% · 4w +0.9% (70th pct of 2y 4w moves) · 13w +1.8% · 52w range position 99% (lo 4.197 / hi 4.401)
**Drivers (recent corr):** ^STOXX50E -0.32 [textbook] · ^VIX +0.15 [weak] → **in charge: ^STOXX50E** (European risk)
**Last 20 sessions decomposed (R² 0.10, n=60):** actual +0.9% = ^STOXX50E +0.1% · ^VIX +0.0% · unexplained +0.7%
**This week:** 10-29 04:00 ET Spain: Spanish Retail Sales · 10-29 05:00 ET Italy: Italian Monthly Unemployment Rate (cons 6.2%, prev 6.2%) · 10-29 09:15 ET Euro Zone: Deposit Facility Rate (cons 2.50%, prev 2.50%) · 10-29 09:15 ET Euro Zone: ECB Monetary Policy Statement · 10-29 09:15 ET Euro Zone: ECB Interest Rate Decision (cons 2.65%, prev 2.65%) · 10-29 09:45 ET Euro Zone: ECB Press Conference


## 6. Equities

### S&P 500  `^GSPC`  7,723 (2026-10-28)
**Move:** 1w -0.4% · 4w +0.9% (21st pct of 2y 4w moves) · 13w +5.6% · 52w range position 93% (lo 6,344 / hi 7,819)
**Drivers (recent corr):** US10Y +0.44 [INVERTED, was textbook] · HYG_TLT +0.61 [textbook, was INVERTED] · DX-Y.NYB -0.01 [weak] · CL=F -0.59 [textbook] · ^VIX -0.87 [textbook] → **in charge: ^VIX** (Vol)
**Last 20 sessions decomposed (R² 0.72, n=60):** actual +0.9% = HYG_TLT -1.6% · US10Y +1.3% · CL=F -0.7% · ^VIX -0.5% · DX-Y.NYB -0.2% · unexplained +2.5%
**Positioning (CFTC E-MINI S&P 500, 2026-10-20, + = long S&P 500):** lev funds -371,245 (-19% OI, 4w +4,329, 36th pct of 3y) · asset mgrs +901,377 (+47% OI, 4w -33,078, 31st pct of 3y)
**This week:** 10-29 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.2%) · 10-29 08:30 ET United States: Core PCE Prices · 10-29 08:30 ET United States: GDP (cons 3.2%, prev 2.2%) · 10-29 08:30 ET United States: GDP Price Index (cons 3.5%, prev 6.1%) · 10-29 08:30 ET United States: GDP Sales · 10-29 08:30 ET United States: PCE price index (cons 0.5%, prev 0.3%)

### Nasdaq 100  `^NDX`  29,651 (2026-10-28)
**Move:** 1w -0.6% · 4w -2.5% (40th pct of 2y 4w moves) · 13w +9.0% · 52w range position 81% (lo 22,953 / hi 31,224)
**Drivers (recent corr):** US10Y +0.59 [INVERTED, was textbook] · SOXX +0.95 [textbook] · HYG_TLT +0.76 [textbook] · BTC-USD +0.59 [textbook] → **in charge: SOXX** (Semis / AI capex)
**Last 20 sessions decomposed (R² 0.79, n=60):** actual -2.5% = SOXX -3.6% · US10Y +1.3% · HYG_TLT -1.3% · BTC-USD -0.3% · unexplained +1.3%
**Positioning (CFTC NASDAQ MINI, 2026-10-20, + = long Nasdaq 100):** lev funds +950 (+0% OI, 4w +31,633, 94th pct of 3y) · asset mgrs +77,790 (+29% OI, 4w +5,570, 60th pct of 3y)
**This week:** 10-29 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.2%) · 10-29 08:30 ET United States: Core PCE Prices · 10-29 08:30 ET United States: GDP (cons 3.2%, prev 2.2%) · 10-29 08:30 ET United States: GDP Price Index (cons 3.5%, prev 6.1%) · 10-29 08:30 ET United States: GDP Sales · 10-29 08:30 ET United States: PCE price index (cons 0.5%, prev 0.3%)

### Russell 2000  `^RUT`  2,819 (2026-10-28)
**Move:** 1w +1.4% · 4w +0.8% (11th pct of 2y 4w moves) · 13w -3.0% · 52w range position 67% (lo 2,305 / hi 3,068)
**Drivers (recent corr):** US2Y +0.00 [weak] · HYG_TLT +0.11 [weak] · ^GSPC +0.66 [textbook] → **in charge: ^GSPC** (Beta)
**Last 20 sessions decomposed (R² 0.57, n=60):** actual +0.8% = US2Y +0.9% · ^GSPC +0.9% · HYG_TLT +0.1% · unexplained -1.2%
**This week:** 10-29 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.2%) · 10-29 08:30 ET United States: Core PCE Prices · 10-29 08:30 ET United States: GDP (cons 3.2%, prev 2.2%) · 10-29 08:30 ET United States: GDP Price Index (cons 3.5%, prev 6.1%) · 10-29 08:30 ET United States: GDP Sales · 10-29 08:30 ET United States: PCE price index (cons 0.5%, prev 0.3%)

### Euro Stoxx 50  `^STOXX50E`  6,165 (2026-10-28)
**Move:** 1w -0.7% · 4w -1.7% (32nd pct of 2y 4w moves) · 13w -1.3% · 52w range position 63% (lo 5,501 / hi 6,551)
**Drivers (recent corr):** FR_DE -0.51 [textbook] · ^GSPC +0.42 [textbook] · BZ=F -0.24 [weak] · EURUSD=X +0.21 [weak] → **in charge: FR_DE** (Euro fiscal stress / banks)
**Last 20 sessions decomposed (R² 0.32, n=27):** actual -1.7% = FR_DE -1.8% · BZ=F -0.5% · EURUSD=X +0.2% · ^GSPC +0.2% · unexplained +0.2%
**This week:** 10-29 04:00 ET Spain: Spanish Retail Sales · 10-29 05:00 ET Italy: Italian Monthly Unemployment Rate (cons 6.2%, prev 6.2%) · 10-29 09:15 ET Euro Zone: Deposit Facility Rate (cons 2.50%, prev 2.50%) · 10-29 09:15 ET Euro Zone: ECB Monetary Policy Statement · 10-29 09:15 ET Euro Zone: ECB Interest Rate Decision (cons 2.65%, prev 2.65%) · 10-29 09:45 ET Euro Zone: ECB Press Conference

### CAC 40  `^FCHI`  7,887 (2026-10-28)
**Move:** 1w -0.4% · 4w -1.0% (23rd pct of 2y 4w moves) · 13w -6.2% · 52w range position 21% (lo 7,666 / hi 8,726)
**Drivers (recent corr):** FR_DE -0.57 [textbook] · ^STOXX50E +0.90 [textbook] → **in charge: ^STOXX50E** (European block)
**Last 20 sessions decomposed (R² 0.78, n=27):** actual -1.0% = ^STOXX50E -1.2% · FR_DE -0.6% · unexplained +0.9%
**This week:** 10-29 04:00 ET Spain: Spanish Retail Sales · 10-29 05:00 ET Italy: Italian Monthly Unemployment Rate (cons 6.2%, prev 6.2%) · 10-29 09:15 ET Euro Zone: Deposit Facility Rate (cons 2.50%, prev 2.50%) · 10-29 09:15 ET Euro Zone: ECB Monetary Policy Statement · 10-29 09:15 ET Euro Zone: ECB Interest Rate Decision (cons 2.65%, prev 2.65%) · 10-29 09:45 ET Euro Zone: ECB Press Conference

### DAX  `^GDAXI`  25,591 (2026-10-28)
**Move:** 1w -0.2% · 4w +1.6% (30th pct of 2y 4w moves) · 13w +0.5% · 52w range position 77% (lo 22,301 / hi 26,570)
**Drivers (recent corr):** DE10Y -0.27 [weak] · ^GSPC +0.41 [textbook] → **in charge: ^GSPC** (Global risk)
**Last 20 sessions decomposed (R² 0.27, n=60):** actual +1.5% = ^GSPC +0.6% · DE10Y +0.4% · unexplained +0.6%
**This week:** 10-29 04:00 ET Spain: Spanish Retail Sales · 10-29 05:00 ET Italy: Italian Monthly Unemployment Rate (cons 6.2%, prev 6.2%) · 10-29 09:15 ET Euro Zone: Deposit Facility Rate (cons 2.50%, prev 2.50%) · 10-29 09:15 ET Euro Zone: ECB Monetary Policy Statement · 10-29 09:15 ET Euro Zone: ECB Interest Rate Decision (cons 2.65%, prev 2.65%) · 10-29 09:45 ET Euro Zone: ECB Press Conference

### FTSE 100  `^FTSE`  10,686 (2026-10-28)
**Move:** 1w -0.6% · 4w +0.8% (20th pct of 2y 4w moves) · 13w -2.0% · 52w range position 84% (lo 9,507 / hi 10,911)
**Drivers (recent corr):** BZ=F +0.20 [weak] · GBPUSD=X +0.26 [weak] · GB10Y -0.54 [textbook] → **in charge: GB10Y** (Gilts)
**Last 20 sessions decomposed (R² 0.35, n=60):** actual +0.8% = GB10Y +0.4% · BZ=F +0.2% · GBPUSD=X +0.0% · unexplained +0.1%

### Nikkei 225  `^N225`  64,142 (2026-10-28)
**Move:** 1w -0.7% · 4w -3.9% (46th pct of 2y 4w moves) · 13w +4.4% · 52w range position 65% (lo 48,538 / hi 72,366)
**Drivers (recent corr):** USDJPY=X +0.19 [weak] · ^NDX +0.37 [textbook] · SOXX +0.39 [textbook] → **in charge: SOXX** (Chips (prior US day))
**Last 20 sessions decomposed (R² 0.18, n=60):** actual -4.0% = SOXX -1.3% · ^NDX -0.8% · USDJPY=X -0.0% · unexplained -1.9%
**This week:** 10-29 19:30 ET Japan: Tokyo Core CPI (cons 3.4%, prev 2.7%) · 10-29 19:30 ET Japan: Unemployment Rate (cons 2.5%, prev 2.5%) · 10-29 19:50 ET Japan: Large Scale Retail Sales YoY · 10-29 19:50 ET Japan: Retail Sales (cons 3.4%, prev 2.9%) · 10-29 22:30 ET Japan: BoJ Monetary Policy Statement · 10-29 23:00 ET Japan: BoJ Interest Rate Decision (cons 1.25%, prev 1.25%)

### KOSPI  `^KS11`  5,931 (2026-10-28)
**Move:** 1w +3.4% · 4w -13.3% (76th pct of 2y 4w moves) · 13w +4.7% · 52w range position 40% (lo 3,846 / hi 9,115)
**Drivers (recent corr):** SOXX +0.31 [textbook] · ^NDX +0.15 [weak] → **in charge: SOXX** (Memory / AI hardware (prior US day))
**Last 20 sessions decomposed (R² 0.14, n=60):** actual -14.2% = SOXX -6.5% · ^NDX +1.5% · unexplained -9.2%
**This week:** 10-29 19:00 ET South Korea: Retail Sales · 11-02 19:00 ET South Korea: CPI

### Hang Seng  `^HSI`  23,041 (2026-10-28)
**Move:** 1w -2.6% · 4w -6.4% (80th pct of 2y 4w moves) · 13w -10.7% · 52w range position 7% (lo 22,672 / hi 27,968)
**Drivers (recent corr):** ^NDX -0.31 [INVERTED] → **in charge: ^NDX** (US tech (prior US day))
**Last 20 sessions decomposed (R² 0.00, n=60):** actual -6.6% = ^NDX +0.1% · unexplained -6.7%
**This week:** 11-03 04:30 ET Hong Kong: GDP · 11-03 04:30 ET Hong Kong: Retail Sales

### ASX 200  `^AXJO`  8,893 (2026-10-28)
**Move:** 1w +0.7% · 4w +1.2% (24th pct of 2y 4w moves) · 13w -1.6% · 52w range position 58% (lo 8,366 / hi 9,272)
**Drivers (recent corr):** HG=F +0.03 [weak] · ^GSPC +0.17 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.08, n=60):** actual +1.2% = HG=F +0.1% · ^GSPC +0.1% · unexplained +0.9%
**This week:** 11-02 23:30 ET Australia: RBA Interest Rate Decision


## 7. Rates

### US 2y  `US2Y`  4.84% (2026-10-28)
**Move:** 1w -13bp · 4w -25bp (83rd pct of 2y 4w moves) · 13w +49bp · 52w range position 84% (lo 3.512 / hi 5.089)
**Drivers (recent corr):** CL=F -0.43 [INVERTED, was textbook] · ^GSPC +0.46 [textbook, was INVERTED] → **in charge: ^GSPC** (Risk-on = fewer cuts / more hikes)
**Last 20 sessions decomposed (R² 0.02, n=60):** actual -25bp = ^GSPC -1bp · CL=F -1bp · unexplained -23bp
**Positioning (CFTC UST 2Y NOTE, 2026-10-20, + = long US 2y):** lev funds +1,285,548 (+28% OI, 4w -65,192, 4th pct of 3y) · asset mgrs -1,723,580 (-38% OI, 4w +46,505, 73rd pct of 3y)
**This week:** 10-29 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.2%) · 10-29 08:30 ET United States: Core PCE Prices · 10-29 08:30 ET United States: GDP (cons 3.2%, prev 2.2%) · 10-29 08:30 ET United States: GDP Price Index (cons 3.5%, prev 6.1%) · 10-29 08:30 ET United States: GDP Sales · 10-29 08:30 ET United States: PCE price index (cons 0.5%, prev 0.3%)

### US 10y  `US10Y`  4.99% (2026-10-28)
**Move:** 1w -15bp · 4w -30bp (90th pct of 2y 4w moves) · 13w +37bp · 52w range position 76% (lo 3.962 / hi 5.311)
**Drivers (recent corr):** CL=F -0.39 [INVERTED, was textbook] · ^NDX +0.59 [INVERTED, was textbook] · T10YIE (missing) · DE10Y -0.08 [weak] → **in charge: ^NDX** (Textbook: yields up hurt stocks; + means bonds hedge stocks)
**Last 20 sessions decomposed (R² 0.04, n=60):** actual -30bp = DE10Y -4bp · CL=F +3bp · ^NDX -2bp · unexplained -27bp
**Positioning (CFTC UST 10Y NOTE, 2026-10-20, + = long US 10y):** lev funds +2,107,224 (+36% OI, 4w +180,277, 78th pct of 3y) · asset mgrs -2,925,416 (-50% OI, 4w -394,032, 1st pct of 3y)
**This week:** 10-29 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.2%) · 10-29 08:30 ET United States: Core PCE Prices · 10-29 08:30 ET United States: GDP (cons 3.2%, prev 2.2%) · 10-29 08:30 ET United States: GDP Price Index (cons 3.5%, prev 6.1%) · 10-29 08:30 ET United States: GDP Sales · 10-29 08:30 ET United States: PCE price index (cons 0.5%, prev 0.3%)

### US 30y  `US30Y`  5.30% (2026-10-28)
**Move:** 1w -13bp · 4w -33bp (95th pct of 2y 4w moves) · 13w +16bp · 52w range position 66% (lo 4.6 / hi 5.665)
**Drivers (recent corr):** US2Y +0.89 [textbook] · T10YIE (missing) → **in charge: US2Y** (Front end)
**Last 20 sessions decomposed (R² 0.67, n=60):** actual -33bp = US2Y -17bp · unexplained -16bp
**Positioning (CFTC UST BOND, 2026-10-20, + = long US 30y):** lev funds +162,757 (+9% OI, 4w +705, 2nd pct of 3y) · asset mgrs -388,007 (-22% OI, 4w +25,609, 96th pct of 3y)
**This week:** 10-29 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.2%) · 10-29 08:30 ET United States: Core PCE Prices · 10-29 08:30 ET United States: GDP (cons 3.2%, prev 2.2%) · 10-29 08:30 ET United States: GDP Price Index (cons 3.5%, prev 6.1%) · 10-29 08:30 ET United States: GDP Sales · 10-29 08:30 ET United States: PCE price index (cons 0.5%, prev 0.3%)

### Bund 10y  `DE10Y`  3.39% (2026-10-28)
**Move:** 1w -5bp · 4w -21bp (79th pct of 2y 4w moves) · 13w +24bp · 52w range position 73% (lo 2.65 / hi 3.66)
**Drivers (recent corr):** US10Y -0.08 [weak] · BZ=F -0.01 [weak] · FR_DE +0.29 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.07, n=27):** actual -21bp = FR_DE +4bp · US10Y -3bp · BZ=F +2bp · unexplained -24bp
**This week:** 10-29 04:00 ET Spain: Spanish Retail Sales · 10-29 05:00 ET Italy: Italian Monthly Unemployment Rate (cons 6.2%, prev 6.2%) · 10-29 09:15 ET Euro Zone: Deposit Facility Rate (cons 2.50%, prev 2.50%) · 10-29 09:15 ET Euro Zone: ECB Monetary Policy Statement · 10-29 09:15 ET Euro Zone: ECB Interest Rate Decision (cons 2.65%, prev 2.65%) · 10-29 09:45 ET Euro Zone: ECB Press Conference

### Gilt 10y  `GB10Y`  5.35% (2026-10-28)
**Move:** 1w -2bp · 4w -6bp (27th pct of 2y 4w moves) · 13w +27bp · 52w range position 88% (lo 4.352 / hi 5.478)
**Drivers (recent corr):** US10Y +0.45 [textbook] · GBPUSD=X -0.29 [weak] → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.38, n=60):** actual -6bp = US10Y -18bp · GBPUSD=X -0bp · unexplained +12bp

### JGB 10y  `JP10Y`  2.83% (2026-10-28)
**Move:** 1w -9bp · 4w -23bp (92nd pct of 2y 4w moves) · 13w +7bp · 52w range position 81% (lo 1.66 / hi 3.111)
**Drivers (recent corr):** US10Y +0.50 [textbook] · USDJPY=X +0.66 [textbook] → **in charge: USDJPY=X** (Weak yen -> BoJ pressure)
**Last 20 sessions decomposed (R² 0.46, n=60):** actual -23bp = US10Y -7bp · USDJPY=X +0bp · unexplained -16bp
**This week:** 10-29 19:30 ET Japan: Tokyo Core CPI (cons 3.4%, prev 2.7%) · 10-29 19:30 ET Japan: Unemployment Rate (cons 2.5%, prev 2.5%) · 10-29 19:50 ET Japan: Large Scale Retail Sales YoY · 10-29 19:50 ET Japan: Retail Sales (cons 3.4%, prev 2.9%) · 10-29 22:30 ET Japan: BoJ Monetary Policy Statement · 10-29 23:00 ET Japan: BoJ Interest Rate Decision (cons 1.25%, prev 1.25%)

### Canada 10y  `CA10Y`  3.84% (2026-10-28)
**Move:** 1w -6bp · 4w -15bp (64th pct of 2y 4w moves) · 13w +26bp · 52w range position 83% (lo 3.1 / hi 3.99)
**Drivers (recent corr):** US10Y +0.74 [textbook] · CL=F -0.04 [weak] → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.68, n=60):** actual -15bp = US10Y -21bp · CL=F +5bp · unexplained +1bp
**This week:** 10-30 08:30 ET Canada: GDP (cons 0.0%, prev 0.0%) · 10-30 11:00 ET Canada: Budget Balance


## 8. Commodities

### WTI crude  `CL=F`  101.1 (2026-10-28)
**Move:** 1w +4.0% · 4w +11.8% (79th pct of 2y 4w moves) · 13w +19.7% · 52w range position 79% (lo 55.27 / hi 112.9)
**Drivers (recent corr):** XLE +0.36 [textbook] · ^GSPC -0.59 [INVERTED] · HG=F -0.27 [weak] · DX-Y.NYB -0.05 [weak] → **in charge: ^GSPC** (Demand (- = supply shock))
**Last 20 sessions decomposed (R² 0.45, n=60):** actual +11.1% = XLE +8.3% · ^GSPC -1.1% · DX-Y.NYB -1.1% · HG=F -0.5% · unexplained +5.6%
**Positioning (CFTC WTI-PHYSICAL, 2026-10-20, + = long WTI crude):** managed money +36,187 (+2% OI, 4w -65,641, 13th pct of 3y) · producers +359,568 (+20% OI, 4w +56,668, 94th pct of 3y)
**This week:** 10-29 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.2%) · 10-29 08:30 ET United States: Core PCE Prices · 10-29 08:30 ET United States: GDP (cons 3.2%, prev 2.2%) · 10-29 08:30 ET United States: GDP Price Index (cons 3.5%, prev 6.1%) · 10-29 08:30 ET United States: GDP Sales · 10-29 08:30 ET United States: PCE price index (cons 0.5%, prev 0.3%)

### Gold  `GC=F`  4,073 (2026-10-28)
**Move:** 1w -1.8% · 4w -2.7% (33rd pct of 2y 4w moves) · 13w +0.9% · 52w range position 8% (lo 3,960 / hi 5,318)
**Drivers (recent corr):** DFII10 (missing) · DX-Y.NYB -0.19 [weak] · SI=F +0.84 [textbook] · BTC-USD +0.50 [textbook] → **in charge: SI=F** (Precious block)
**Last 20 sessions decomposed (R² 0.72, n=60):** actual -2.7% = SI=F -3.9% · DX-Y.NYB -0.5% · BTC-USD -0.2% · unexplained +1.9%
**Positioning (CFTC GOLD, 2026-10-20, + = long Gold):** managed money +104,206 (+26% OI, 4w -23,183, 25th pct of 3y) · producers -14,783 (-4% OI, 4w +11,994, 99th pct of 3y)
**This week:** 10-29 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.2%) · 10-29 08:30 ET United States: Core PCE Prices · 10-29 08:30 ET United States: GDP (cons 3.2%, prev 2.2%) · 10-29 08:30 ET United States: GDP Price Index (cons 3.5%, prev 6.1%) · 10-29 08:30 ET United States: GDP Sales · 10-29 08:30 ET United States: PCE price index (cons 0.5%, prev 0.3%)

### Silver  `SI=F`  54.49 (2026-10-28)
**Move:** 1w -5.1% · 4w -9.3% (62nd pct of 2y 4w moves) · 13w -5.8% · 52w range position 11% (lo 47.13 / hi 115.1)
**Drivers (recent corr):** GC=F +0.84 [textbook] · HG=F +0.45 [textbook] → **in charge: GC=F** (Gold)
**Last 20 sessions decomposed (R² 0.75, n=60):** actual -9.8% = GC=F -3.6% · HG=F +0.6% · unexplained -6.8%
**Positioning (CFTC SILVER, 2026-10-20, + = long Silver):** managed money +3,505 (+3% OI, 4w -9,804, 4th pct of 3y) · producers -15,029 (-13% OI, 4w +3,483, 94th pct of 3y)
**This week:** 10-29 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.2%) · 10-29 08:30 ET United States: Core PCE Prices · 10-29 08:30 ET United States: GDP (cons 3.2%, prev 2.2%) · 10-29 08:30 ET United States: GDP Price Index (cons 3.5%, prev 6.1%) · 10-29 08:30 ET United States: GDP Sales · 10-29 08:30 ET United States: PCE price index (cons 0.5%, prev 0.3%)

### Copper  `HG=F`  6.647 (2026-10-28)
**Move:** 1w +1.6% · 4w +1.3% (14th pct of 2y 4w moves) · 13w +6.0% · 52w range position 92% (lo 4.926 / hi 6.804)
**Drivers (recent corr):** ^GSPC +0.46 [textbook] → **in charge: ^GSPC** (Global growth)
**Last 20 sessions decomposed (R² 0.17, n=60):** actual +1.3% = ^GSPC +0.8% · unexplained +0.5%
**Positioning (CFTC COPPER- #1, 2026-10-20, + = long Copper):** managed money +47,690 (+15% OI, 4w -34,832, 63rd pct of 3y) · producers -77,406 (-24% OI, 4w +35,169, 39th pct of 3y)
**This week:** 10-29 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.2%) · 10-29 08:30 ET United States: Core PCE Prices · 10-29 08:30 ET United States: GDP (cons 3.2%, prev 2.2%) · 10-29 08:30 ET United States: GDP Price Index (cons 3.5%, prev 6.1%) · 10-29 08:30 ET United States: GDP Sales · 10-29 08:30 ET United States: PCE price index (cons 0.5%, prev 0.3%)

### Nat gas (US)  `NG=F`  3.062 (2026-10-28)
**Move:** 1w +9.7% · 4w +1.2% (7th pct of 2y 4w moves) · 13w +12.4% · 52w range position 11% (lo 2.523 / hi 7.46)
**Drivers (recent corr):** CL=F -0.16 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual +1.2% = CL=F +0.3% · unexplained +0.9%
**Positioning (CFTC NAT GAS NYME, 2026-10-20, + = long Nat gas (US)):** managed money -157,409 (-9% OI, 4w -91,862, 1st pct of 3y) · producers -13,154 (-1% OI, 4w +10,566, 78th pct of 3y)
**This week:** 10-29 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.2%) · 10-29 08:30 ET United States: Core PCE Prices · 10-29 08:30 ET United States: GDP (cons 3.2%, prev 2.2%) · 10-29 08:30 ET United States: GDP Price Index (cons 3.5%, prev 6.1%) · 10-29 08:30 ET United States: GDP Sales · 10-29 08:30 ET United States: PCE price index (cons 0.5%, prev 0.3%)


## 9. Crypto

### Bitcoin  `BTC-USD`  80,818 (2026-10-28)
**Move:** 1w -3.8% · 4w -3.3% (29th pct of 2y 4w moves) · 13w +26.5% · 52w range position 43% (lo 58,559 / hi 110,055)
**Drivers (recent corr):** ^NDX +0.59 [textbook] · DX-Y.NYB -0.11 [weak] · GC=F +0.50 [textbook] → **in charge: ^NDX** (Tech / speculation)
**Last 20 sessions decomposed (R² 0.37, n=60):** actual -3.3% = GC=F -2.0% · ^NDX -1.5% · DX-Y.NYB -1.0% · unexplained +1.2%
**Positioning (CFTC BITCOIN, 2026-10-20, + = long Bitcoin):** lev funds -4,942 (-23% OI, 4w +3,011, 100th pct of 3y) · asset mgrs +2,999 (+14% OI, 4w -172, 9th pct of 3y)
**This week:** 10-29 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.2%) · 10-29 08:30 ET United States: Core PCE Prices · 10-29 08:30 ET United States: GDP (cons 3.2%, prev 2.2%) · 10-29 08:30 ET United States: GDP Price Index (cons 3.5%, prev 6.1%) · 10-29 08:30 ET United States: GDP Sales · 10-29 08:30 ET United States: PCE price index (cons 0.5%, prev 0.3%)

