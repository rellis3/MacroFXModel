# Market Review Data Pack: 2026-11-03

Fetched 2026-11-03T03:41:55+00:00. Descriptive numbers for the weekly review (read with `education/market_reviews/PLAYBOOK.md`). Correlations are of daily moves: last 20 sessions vs the 60 before. They are noisy; a flip is a question, not a signal.

**Data notes:** fred DGS2: The read operation timed out · fred DFII10: The read operation timed out · fred T10YIE: The read operation timed out · fred BAMLH0A0HYM2: The read operation timed out · fred BAMLC0A0CM: The read operation timed out · FRED DGS2 missing: US 2y = US 5y stand-in for this run

## 1. Regime gauges: which story is the market trading?

| Pair | Recent | Before | Textbook sign | Status | What it means |
|---|---|---|---|---|---|
| CL=F vs US10Y | -0.23 | +0.26 | + | weak | Oil vs yields: + = oil is an inflation story; - = oil is a growth tax (2008-style) |
| ^NDX vs US10Y | +0.62 | -0.25 | − | INVERTED | Stocks vs yields: - = rates drive stocks; + = growth scare, bonds hedge stocks |
| HYG_TLT vs ^NDX | +0.70 | -0.15 | + | textbook | Credit vs tech: high + = credit and equities are one trade (credit stress leading) |
| DX-Y.NYB vs ^GSPC | +0.14 | +0.05 | − | weak | Dollar vs stocks: - = safe-haven dollar; ~0/+ = "sell America" or liquidity dash |
| AUDUSD=X vs ^NDX | +0.38 | +0.42 | + | textbook | Aussie vs tech: near 0 = AUD trading commodities not risk |
| BTC-USD vs ^NDX | +0.54 | +0.35 | + | textbook | Bitcoin vs tech: high = one liquidity complex |
| XLE vs CL=F | +0.19 | +0.39 | + | weak | Energy stocks vs oil: falling = equity investors fade the oil move |
| USDJPY=X vs US10Y | +0.59 | +0.24 | + | textbook | Yen vs yields: high = yen is a pure rates trade |
| FR_DE vs IT_DE | +0.84 | +0.93 | + | textbook | France vs Italy spreads: high = euro-periphery contagion, low = France-specific |

Equity vol vs bond vol: VIX 21.1 (1y pct 87) · MOVE 100 (1y pct 91). When bond vol leads equity vol, the stress is in rates/credit first.

**Fed funds futures (implied average rate by contract month; vs ~1 week earlier):** V6 3.882% (-0.002) · X6 3.905% (-0.020) · Z6 4.050% (-0.035) · F7 4.120% (-0.035) · G7 4.200% (-0.050) · H7 4.270% (-0.055) · J7 4.370% (-0.055) · K7 4.450% (-0.065) · M7 4.515% (-0.050) · N7 4.550% (-0.060) · Q7 4.575% (-0.050) · U7 4.590% (-0.040) (as of 2026-10-26)

## 2. G10 FX

### EURUSD  `EURUSD=X`  1.119 (2026-11-03)
**Move:** 1w +0.6% · 4w -0.5% (18th pct of 2y 4w moves) · 13w -3.0% · 52w range position 7% (lo 1.113 / hi 1.202)
**Drivers (recent corr):** US_EA2 -0.08 [weak] · US_DE10 +0.11 [weak] · FR_DE -0.12 [weak] · ^STOXX50E -0.03 [weak] · BZ=F -0.09 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.22, n=31):** actual -0.5% = FR_DE -0.5% · US_EA2 +0.4% · US_DE10 -0.1% · ^STOXX50E -0.0% · BZ=F +0.0% · unexplained -0.3%
**Positioning (CFTC EURO FX, 2026-10-27, + = long EURUSD):** lev funds -71,574 (-8% OI, 4w -32,309, 1st pct of 3y) · asset mgrs +173,249 (+20% OI, 4w -47,354, 8th pct of 3y)
**This week:** 11-04 05:00 ET Euro Zone: Core CPI (cons 2.5%, prev 2.5%) · 11-04 05:00 ET Euro Zone: CPI · 11-04 08:15 ET United States: ADP Nonfarm Employment Change (cons 68K, prev 90K) · 11-04 10:00 ET United States: ISM Non-Manufacturing Business Activity · 11-04 10:00 ET United States: ISM Non-Manufacturing Employment · 11-04 10:00 ET United States: ISM Non-Manufacturing New Orders

### USDJPY  `USDJPY=X`  157.9 (2026-11-03)
**Move:** 1w -0.1% · 4w -0.3% (8th pct of 2y 4w moves) · 13w +0.1% · 52w range position 47% (lo 152.5 / hi 163.9)
**Drivers (recent corr):** US10Y +0.59 [textbook] · US_JP10 +0.61 [textbook] · ^NDX +0.52 [textbook] · ^VIX -0.46 [textbook, was INVERTED] → **in charge: US_JP10** (US-Japan 10y gap)
**Last 20 sessions decomposed (R² 0.12, n=60):** actual -0.3% = US10Y -1.3% · ^NDX -1.0% · ^VIX +0.6% · US_JP10 +0.1% · unexplained +1.4%
**Positioning (CFTC JAPANESE YEN, 2026-10-27, + = long USDJPY):** lev funds +14,630 (+4% OI, 4w +469, 23rd pct of 3y) · asset mgrs -91,191 (-24% OI, 4w -39,557, 9th pct of 3y)
**This week:** 11-04 08:15 ET United States: ADP Nonfarm Employment Change (cons 68K, prev 90K) · 11-04 10:00 ET United States: ISM Non-Manufacturing Business Activity · 11-04 10:00 ET United States: ISM Non-Manufacturing Employment · 11-04 10:00 ET United States: ISM Non-Manufacturing New Orders · 11-04 10:00 ET United States: ISM Non-Manufacturing PMI (cons 54.8, prev 54.9) · 11-04 10:00 ET United States: ISM Non-Manufacturing Prices

### GBPUSD  `GBPUSD=X`  1.341 (2026-11-03)
**Move:** 1w +0.8% · 4w +1.1% (44th pct of 2y 4w moves) · 13w -0.3% · 52w range position 48% (lo 1.302 / hi 1.383)
**Drivers (recent corr):** US_GB10 -0.01 [weak] · GB10Y -0.26 [weak] · ^GSPC +0.05 [weak] · EURUSD=X +0.86 [textbook] → **in charge: EURUSD=X** (European block move)
**Last 20 sessions decomposed (R² 0.68, n=60):** actual +1.0% = EURUSD=X -0.4% · US_GB10 +0.2% · ^GSPC -0.1% · GB10Y +0.0% · unexplained +1.3%
**Positioning (CFTC BRITISH POUND, 2026-10-27, + = long GBPUSD):** lev funds +17,195 (+7% OI, 4w +12,589, 18th pct of 3y) · asset mgrs -128,893 (-51% OI, 4w -349, 6th pct of 3y)
**This week:** 11-04 08:15 ET United States: ADP Nonfarm Employment Change (cons 68K, prev 90K) · 11-04 10:00 ET United States: ISM Non-Manufacturing Business Activity · 11-04 10:00 ET United States: ISM Non-Manufacturing Employment · 11-04 10:00 ET United States: ISM Non-Manufacturing New Orders · 11-04 10:00 ET United States: ISM Non-Manufacturing PMI (cons 54.8, prev 54.9) · 11-04 10:00 ET United States: ISM Non-Manufacturing Prices

### USDCAD  `USDCAD=X`  1.398 (2026-11-03)
**Move:** 1w -0.5% · 4w -1.6% (70th pct of 2y 4w moves) · 13w -0.6% · 52w range position 62% (lo 1.349 / hi 1.428)
**Drivers (recent corr):** CL=F +0.16 [weak] · US_CA2 +0.39 [textbook] · ^GSPC -0.08 [weak] → **in charge: US_CA2** (US-Canada 2y rate gap)
**Last 20 sessions decomposed (R² 0.28, n=60):** actual -1.6% = US_CA2 -1.3% · ^GSPC +0.3% · CL=F -0.0% · unexplained -0.6%
**Positioning (CFTC CANADIAN DOLLAR, 2026-10-27, + = long USDCAD):** lev funds +96,747 (+27% OI, 4w +27,103, 96th pct of 3y) · asset mgrs +1,325 (+0% OI, 4w -26,256, 15th pct of 3y)
**This week:** 11-04 08:15 ET United States: ADP Nonfarm Employment Change (cons 68K, prev 90K) · 11-04 10:00 ET United States: ISM Non-Manufacturing Business Activity · 11-04 10:00 ET United States: ISM Non-Manufacturing Employment · 11-04 10:00 ET United States: ISM Non-Manufacturing New Orders · 11-04 10:00 ET United States: ISM Non-Manufacturing PMI (cons 54.8, prev 54.9) · 11-04 10:00 ET United States: ISM Non-Manufacturing Prices

### AUDUSD  `AUDUSD=X`  0.6979 (2026-11-03)
**Move:** 1w -0.7% · 4w -0.0% (2nd pct of 2y 4w moves) · 13w -1.0% · 52w range position 66% (lo 0.6449 / hi 0.7255)
**Drivers (recent corr):** HG=F -0.07 [weak] · ^NDX +0.38 [textbook] · GC=F -0.23 [weak] → **in charge: ^NDX** (Global risk proxy)
**Last 20 sessions decomposed (R² 0.12, n=60):** actual -0.0% = ^NDX -1.2% · GC=F +0.1% · HG=F +0.0% · unexplained +1.1%
**Positioning (CFTC AUSTRALIAN DOLLAR, 2026-10-27, + = long AUDUSD):** lev funds +48,414 (+15% OI, 4w -12,178, 85th pct of 3y) · asset mgrs -125,237 (-39% OI, 4w -52,038, 1st pct of 3y)
**This week:** 11-04 08:15 ET United States: ADP Nonfarm Employment Change (cons 68K, prev 90K) · 11-04 10:00 ET United States: ISM Non-Manufacturing Business Activity · 11-04 10:00 ET United States: ISM Non-Manufacturing Employment · 11-04 10:00 ET United States: ISM Non-Manufacturing New Orders · 11-04 10:00 ET United States: ISM Non-Manufacturing PMI (cons 54.8, prev 54.9) · 11-04 10:00 ET United States: ISM Non-Manufacturing Prices

### NZDUSD  `NZDUSD=X`  0.5617 (2026-11-03)
**Move:** 1w -1.1% · 4w -0.1% (5th pct of 2y 4w moves) · 13w -4.4% · 52w range position 6% (lo 0.5587 / hi 0.6076)
**Drivers (recent corr):** AUDUSD=X +0.35 [textbook] · ^GSPC +0.23 [weak] · US2Y +0.16 [weak] → **in charge: AUDUSD=X** (Antipodean block)
**Last 20 sessions decomposed (R² 0.37, n=60):** actual -0.1% = US2Y +0.2% · AUDUSD=X -0.0% · ^GSPC -0.0% · unexplained -0.3%
**Positioning (CFTC NZ DOLLAR, 2026-10-27, + = long NZDUSD):** lev funds -22,554 (-17% OI, 4w -21,488, 8th pct of 3y) · asset mgrs -46,841 (-36% OI, 4w -25,613, 11th pct of 3y)
**This week:** 11-04 08:15 ET United States: ADP Nonfarm Employment Change (cons 68K, prev 90K) · 11-04 10:00 ET United States: ISM Non-Manufacturing Business Activity · 11-04 10:00 ET United States: ISM Non-Manufacturing Employment · 11-04 10:00 ET United States: ISM Non-Manufacturing New Orders · 11-04 10:00 ET United States: ISM Non-Manufacturing PMI (cons 54.8, prev 54.9) · 11-04 10:00 ET United States: ISM Non-Manufacturing Prices

### USDCHF  `USDCHF=X`  0.8187 (2026-11-03)
**Move:** 1w -1.2% · 4w -1.6% (61st pct of 2y 4w moves) · 13w +1.2% · 52w range position 77% (lo 0.7632 / hi 0.8357)
**Drivers (recent corr):** US10Y +0.47 [textbook] · ^VIX -0.28 [weak] · GC=F +0.35 [INVERTED] → **in charge: US10Y** (US yields)
**Last 20 sessions decomposed (R² 0.26, n=60):** actual -1.6% = US10Y -1.5% · ^VIX +0.4% · GC=F -0.1% · unexplained -0.4%
**Positioning (CFTC SWISS FRANC, 2026-10-27, + = long USDCHF):** lev funds +17,502 (+13% OI, 4w +3,507, 96th pct of 3y) · asset mgrs +25,067 (+19% OI, 4w -11,344, 34th pct of 3y)
**This week:** 11-04 08:15 ET United States: ADP Nonfarm Employment Change (cons 68K, prev 90K) · 11-04 10:00 ET United States: ISM Non-Manufacturing Business Activity · 11-04 10:00 ET United States: ISM Non-Manufacturing Employment · 11-04 10:00 ET United States: ISM Non-Manufacturing New Orders · 11-04 10:00 ET United States: ISM Non-Manufacturing PMI (cons 54.8, prev 54.9) · 11-04 10:00 ET United States: ISM Non-Manufacturing Prices


## 3. G10 crosses

### AUDNZD  `AUDNZD=X`  1.243 (2026-11-03)
**Move:** 1w +0.4% · 4w +0.1% (8th pct of 2y 4w moves) · 13w +3.6% · 52w range position 90% (lo 1.141 / hi 1.254)
**Drivers (recent corr):** HG=F +0.01 [weak] · ^AXJO +0.11 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.06, n=60):** actual +0.1% = ^AXJO -0.1% · HG=F -0.1% · unexplained +0.3%

### EURGBP  `EURGBP=X`  0.8345 (2026-11-03)
**Move:** 1w -0.2% · 4w -1.6% (86th pct of 2y 4w moves) · 13w -2.7% · 52w range position 0% (lo 0.8345 / hi 0.8842)
**Drivers (recent corr):** GB10Y +0.11 [weak] · FR_DE -0.43 [textbook] → **in charge: FR_DE** (Euro fiscal stress)
**Last 20 sessions decomposed (R² 0.11, n=31):** actual -1.6% = FR_DE -0.3% · GB10Y -0.0% · unexplained -1.3%
**This week:** 11-04 05:00 ET Euro Zone: Core CPI (cons 2.5%, prev 2.5%) · 11-04 05:00 ET Euro Zone: CPI · 11-05 04:00 ET Italy: Italian Retail Sales · 11-05 07:00 ET United Kingdom: BoE Interest Rate Decision (cons 4.00%, prev 3.75%) · 11-05 07:00 ET United Kingdom: BoE MPC Meeting Minutes · 11-06 05:00 ET Euro Zone: Retail Sales (cons -0.1%, prev 0.1%)

### EURCHF  `EURCHF=X`  0.9159 (2026-11-03)
**Move:** 1w -0.7% · 4w -2.2% (97th pct of 2y 4w moves) · 13w -1.8% · 52w range position 31% (lo 0.9023 / hi 0.9466)
**Drivers (recent corr):** ^STOXX50E +0.26 [weak] · FR_DE -0.63 [textbook] · ^VIX -0.34 [textbook] → **in charge: FR_DE** (Euro fiscal stress)
**Last 20 sessions decomposed (R² 0.41, n=31):** actual -2.2% = FR_DE -1.0% · ^STOXX50E -0.1% · ^VIX +0.0% · unexplained -1.2%
**This week:** 11-04 05:00 ET Euro Zone: Core CPI (cons 2.5%, prev 2.5%) · 11-04 05:00 ET Euro Zone: CPI · 11-05 03:30 ET Switzerland: Unemployment Rate n.s.a. · 11-05 03:30 ET Switzerland: Unemployment Rate s.a. (cons 3.1%, prev 3.1%) · 11-05 04:00 ET Italy: Italian Retail Sales · 11-06 05:00 ET Euro Zone: Retail Sales (cons -0.1%, prev 0.1%)


## 4. EM FX

### USDMXN  `USDMXN=X`  18.57 (2026-11-03)
**Move:** 1w -0.6% · 4w +3.3% (90th pct of 2y 4w moves) · 13w +7.6% · 52w range position 86% (lo 16.89 / hi 18.85)
**Drivers (recent corr):** ^VIX -0.09 [weak] · ^GSPC +0.00 [weak] · CL=F +0.66 [INVERTED] · USDBRL=X -0.40 [INVERTED, was textbook] → **in charge: CL=F** (Oil)
**Last 20 sessions decomposed (R² 0.10, n=60):** actual +3.3% = ^GSPC +0.7% · USDBRL=X +0.6% · CL=F +0.3% · ^VIX -0.1% · unexplained +1.8%
**Positioning (CFTC MEXICAN PESO, 2026-10-27, + = long USDMXN):** lev funds -68,335 (-24% OI, 4w +12,252, 7th pct of 3y) · asset mgrs +25,201 (+9% OI, 4w +41,452, 100th pct of 3y)
**This week:** 11-04 08:15 ET United States: ADP Nonfarm Employment Change (cons 68K, prev 90K) · 11-04 10:00 ET United States: ISM Non-Manufacturing Business Activity · 11-04 10:00 ET United States: ISM Non-Manufacturing Employment · 11-04 10:00 ET United States: ISM Non-Manufacturing New Orders · 11-04 10:00 ET United States: ISM Non-Manufacturing PMI (cons 54.8, prev 54.9) · 11-04 10:00 ET United States: ISM Non-Manufacturing Prices

### USDBRL  `USDBRL=X`  5.437 (2026-11-03)
**Move:** 1w +1.6% · 4w +9.1% (100th pct of 2y 4w moves) · 13w +5.7% · 52w range position 78% (lo 4.906 / hi 5.59)
**Drivers (recent corr):** ^VIX -0.10 [weak] · HG=F +0.34 [INVERTED] · EWZ -0.94 [textbook] → **in charge: EWZ** (Brazil equities (local flows))
**Last 20 sessions decomposed (R² 0.86, n=60):** actual +8.7% = EWZ +8.5% · ^VIX +0.4% · HG=F +0.1% · unexplained -0.2%
**Positioning (CFTC BRAZILIAN REAL, 2026-10-27, + = long USDBRL):** lev funds -7,600 (-5% OI, 4w +1,953, 27th pct of 3y) · asset mgrs -52,010 (-31% OI, 4w +15,005, 43rd pct of 3y)
**This week:** 11-04 08:15 ET United States: ADP Nonfarm Employment Change (cons 68K, prev 90K) · 11-04 10:00 ET United States: ISM Non-Manufacturing Business Activity · 11-04 10:00 ET United States: ISM Non-Manufacturing Employment · 11-04 10:00 ET United States: ISM Non-Manufacturing New Orders · 11-04 10:00 ET United States: ISM Non-Manufacturing PMI (cons 54.8, prev 54.9) · 11-04 10:00 ET United States: ISM Non-Manufacturing Prices

### USDZAR  `USDZAR=X`  16.61 (2026-11-03)
**Move:** 1w -0.2% · 4w +0.5% (17th pct of 2y 4w moves) · 13w +1.4% · 52w range position 51% (lo 15.71 / hi 17.49)
**Drivers (recent corr):** GC=F +0.34 [INVERTED] · ^VIX +0.27 [weak] · HG=F +0.17 [weak] → **in charge: GC=F** (Gold / precious metals exporter)
**Last 20 sessions decomposed (R² 0.15, n=60):** actual +0.5% = ^VIX +1.1% · GC=F +0.0% · HG=F -0.0% · unexplained -0.6%
**Positioning (CFTC SO AFRICAN RAND, 2026-10-27, + = long USDZAR):** lev funds -5,262 (-14% OI, 4w -608, 22nd pct of 3y) · asset mgrs -16,859 (-45% OI, 4w +3,861, 27th pct of 3y)
**This week:** 11-04 08:15 ET United States: ADP Nonfarm Employment Change (cons 68K, prev 90K) · 11-04 10:00 ET United States: ISM Non-Manufacturing Business Activity · 11-04 10:00 ET United States: ISM Non-Manufacturing Employment · 11-04 10:00 ET United States: ISM Non-Manufacturing New Orders · 11-04 10:00 ET United States: ISM Non-Manufacturing PMI (cons 54.8, prev 54.9) · 11-04 10:00 ET United States: ISM Non-Manufacturing Prices

### USDKRW  `USDKRW=X`  1,339 (2026-11-03)
**Move:** 1w +1.0% · 4w -0.0% (1st pct of 2y 4w moves) · 13w -6.2% · 52w range position 7% (lo 1,324 / hi 1,552)
**Drivers (recent corr):** ^KS11 +0.26 [weak] · SOXX +0.09 [weak] · DX-Y.NYB +0.06 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.10, n=60):** actual -0.0% = ^KS11 -1.5% · SOXX +1.0% · DX-Y.NYB -0.1% · unexplained +0.5%
**This week:** 11-04 08:15 ET United States: ADP Nonfarm Employment Change (cons 68K, prev 90K) · 11-04 10:00 ET United States: ISM Non-Manufacturing Business Activity · 11-04 10:00 ET United States: ISM Non-Manufacturing Employment · 11-04 10:00 ET United States: ISM Non-Manufacturing New Orders · 11-04 10:00 ET United States: ISM Non-Manufacturing PMI (cons 54.8, prev 54.9) · 11-04 10:00 ET United States: ISM Non-Manufacturing Prices


## 5. CE3 FX

### EURCZK  `EURCZK=X`  24.27 (2026-11-03)
**Move:** 1w -0.2% · 4w -0.5% (60th pct of 2y 4w moves) · 13w +0.4% · 52w range position 44% (lo 24.07 / hi 24.53)
**Drivers (recent corr):** ^STOXX50E -0.12 [weak] · EURPLN=X +0.29 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.14, n=60):** actual -0.5% = EURPLN=X +0.2% · ^STOXX50E +0.0% · unexplained -0.7%
**This week:** 11-04 05:00 ET Euro Zone: Core CPI (cons 2.5%, prev 2.5%) · 11-04 05:00 ET Euro Zone: CPI · 11-05 04:00 ET Italy: Italian Retail Sales · 11-06 05:00 ET Euro Zone: Retail Sales (cons -0.1%, prev 0.1%) · 11-10 01:30 ET France: French Unemployment Rate

### EURPLN  `EURPLN=X`  4.417 (2026-11-03)
**Move:** 1w +0.5% · 4w +1.1% (79th pct of 2y 4w moves) · 13w +2.9% · 52w range position 100% (lo 4.197 / hi 4.417)
**Drivers (recent corr):** ^STOXX50E -0.10 [weak] · ^VIX +0.21 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.08, n=60):** actual +1.1% = ^VIX +0.2% · ^STOXX50E +0.1% · unexplained +0.8%
**This week:** 11-04 05:00 ET Euro Zone: Core CPI (cons 2.5%, prev 2.5%) · 11-04 05:00 ET Euro Zone: CPI · 11-05 04:00 ET Italy: Italian Retail Sales · 11-06 05:00 ET Euro Zone: Retail Sales (cons -0.1%, prev 0.1%) · 11-10 01:30 ET France: French Unemployment Rate


## 6. Equities

### S&P 500  `^GSPC`  7,541 (2026-11-03)
**Move:** 1w -2.3% · 4w -3.5% (71st pct of 2y 4w moves) · 13w -2.5% · 52w range position 81% (lo 6,344 / hi 7,819)
**Drivers (recent corr):** US10Y +0.47 [INVERTED, was textbook] · HYG_TLT +0.53 [textbook] · DX-Y.NYB +0.14 [weak] · CL=F -0.09 [weak] · ^VIX -0.90 [textbook] → **in charge: ^VIX** (Vol)
**Last 20 sessions decomposed (R² 0.73, n=60):** actual -3.6% = ^VIX -2.9% · HYG_TLT -1.6% · US10Y +1.4% · CL=F -0.3% · DX-Y.NYB -0.0% · unexplained -0.1%
**Positioning (CFTC E-MINI S&P 500, 2026-10-27, + = long S&P 500):** lev funds -400,604 (-20% OI, 4w -28,115, 27th pct of 3y) · asset mgrs +923,449 (+47% OI, 4w +19,446, 45th pct of 3y)
**This week:** 11-04 08:15 ET United States: ADP Nonfarm Employment Change (cons 68K, prev 90K) · 11-04 10:00 ET United States: ISM Non-Manufacturing Business Activity · 11-04 10:00 ET United States: ISM Non-Manufacturing Employment · 11-04 10:00 ET United States: ISM Non-Manufacturing New Orders · 11-04 10:00 ET United States: ISM Non-Manufacturing PMI (cons 54.8, prev 54.9) · 11-04 10:00 ET United States: ISM Non-Manufacturing Prices

### Nasdaq 100  `^NDX`  27,990 (2026-11-03)
**Move:** 1w -5.6% · 4w -10.4% (92nd pct of 2y 4w moves) · 13w -5.9% · 52w range position 61% (lo 22,953 / hi 31,224)
**Drivers (recent corr):** US10Y +0.62 [INVERTED] · SOXX +0.96 [textbook] · HYG_TLT +0.70 [textbook] · BTC-USD +0.54 [textbook] → **in charge: SOXX** (Semis / AI capex)
**Last 20 sessions decomposed (R² 0.83, n=60):** actual -10.9% = SOXX -9.3% · US10Y +1.3% · HYG_TLT -1.2% · BTC-USD -0.9% · unexplained -0.8%
**Positioning (CFTC NASDAQ MINI, 2026-10-27, + = long Nasdaq 100):** lev funds +2,301 (+1% OI, 4w +27,024, 95th pct of 3y) · asset mgrs +65,381 (+24% OI, 4w -4,363, 25th pct of 3y)
**This week:** 11-04 08:15 ET United States: ADP Nonfarm Employment Change (cons 68K, prev 90K) · 11-04 10:00 ET United States: ISM Non-Manufacturing Business Activity · 11-04 10:00 ET United States: ISM Non-Manufacturing Employment · 11-04 10:00 ET United States: ISM Non-Manufacturing New Orders · 11-04 10:00 ET United States: ISM Non-Manufacturing PMI (cons 54.8, prev 54.9) · 11-04 10:00 ET United States: ISM Non-Manufacturing Prices

### Russell 2000  `^RUT`  2,806 (2026-11-03)
**Move:** 1w -0.5% · 4w -0.9% (12th pct of 2y 4w moves) · 13w -7.6% · 52w range position 66% (lo 2,305 / hi 3,068)
**Drivers (recent corr):** US2Y +0.02 [weak] · HYG_TLT +0.10 [weak] · ^GSPC +0.71 [textbook] → **in charge: ^GSPC** (Beta)
**Last 20 sessions decomposed (R² 0.58, n=60):** actual -0.9% = ^GSPC -3.3% · US2Y +1.3% · HYG_TLT +0.1% · unexplained +1.0%
**This week:** 11-04 08:15 ET United States: ADP Nonfarm Employment Change (cons 68K, prev 90K) · 11-04 10:00 ET United States: ISM Non-Manufacturing Business Activity · 11-04 10:00 ET United States: ISM Non-Manufacturing Employment · 11-04 10:00 ET United States: ISM Non-Manufacturing New Orders · 11-04 10:00 ET United States: ISM Non-Manufacturing PMI (cons 54.8, prev 54.9) · 11-04 10:00 ET United States: ISM Non-Manufacturing Prices

### Euro Stoxx 50  `^STOXX50E`  6,176 (2026-11-03)
**Move:** 1w +0.2% · 4w -1.5% (29th pct of 2y 4w moves) · 13w -4.8% · 52w range position 64% (lo 5,501 / hi 6,551)
**Drivers (recent corr):** FR_DE -0.38 [textbook] · ^GSPC +0.44 [textbook] · BZ=F -0.26 [weak] · EURUSD=X -0.03 [weak] → **in charge: ^GSPC** (US lead)
**Last 20 sessions decomposed (R² 0.32, n=31):** actual -1.5% = ^GSPC -1.4% · FR_DE -1.3% · BZ=F -0.1% · EURUSD=X -0.1% · unexplained +1.3%
**This week:** 11-04 05:00 ET Euro Zone: Core CPI (cons 2.5%, prev 2.5%) · 11-04 05:00 ET Euro Zone: CPI · 11-05 04:00 ET Italy: Italian Retail Sales · 11-06 05:00 ET Euro Zone: Retail Sales (cons -0.1%, prev 0.1%) · 11-10 01:30 ET France: French Unemployment Rate

### CAC 40  `^FCHI`  8,048 (2026-11-03)
**Move:** 1w +2.0% · 4w +2.3% (51st pct of 2y 4w moves) · 13w -7.1% · 52w range position 36% (lo 7,666 / hi 8,726)
**Drivers (recent corr):** FR_DE -0.41 [textbook] · ^STOXX50E +0.88 [textbook] → **in charge: ^STOXX50E** (European block)
**Last 20 sessions decomposed (R² 0.72, n=31):** actual +2.3% = ^STOXX50E -1.1% · FR_DE -0.5% · unexplained +3.9%
**This week:** 11-04 05:00 ET Euro Zone: Core CPI (cons 2.5%, prev 2.5%) · 11-04 05:00 ET Euro Zone: CPI · 11-05 04:00 ET Italy: Italian Retail Sales · 11-06 05:00 ET Euro Zone: Retail Sales (cons -0.1%, prev 0.1%) · 11-10 01:30 ET France: French Unemployment Rate

### DAX  `^GDAXI`  25,981 (2026-11-03)
**Move:** 1w +1.5% · 4w +2.1% (39th pct of 2y 4w moves) · 13w -0.8% · 52w range position 86% (lo 22,301 / hi 26,570)
**Drivers (recent corr):** DE10Y -0.09 [weak] · ^GSPC +0.40 [textbook] → **in charge: ^GSPC** (Global risk)
**Last 20 sessions decomposed (R² 0.25, n=60):** actual +2.1% = ^GSPC -1.9% · DE10Y +0.4% · unexplained +3.5%
**This week:** 11-04 05:00 ET Euro Zone: Core CPI (cons 2.5%, prev 2.5%) · 11-04 05:00 ET Euro Zone: CPI · 11-05 04:00 ET Italy: Italian Retail Sales · 11-06 05:00 ET Euro Zone: Retail Sales (cons -0.1%, prev 0.1%) · 11-10 01:30 ET France: French Unemployment Rate

### FTSE 100  `^FTSE`  10,761 (2026-11-03)
**Move:** 1w +0.7% · 4w +2.1% (51st pct of 2y 4w moves) · 13w -1.1% · 52w range position 89% (lo 9,507 / hi 10,911)
**Drivers (recent corr):** BZ=F -0.09 [weak] · GBPUSD=X -0.04 [weak] · GB10Y -0.67 [textbook] → **in charge: GB10Y** (Gilts)
**Last 20 sessions decomposed (R² 0.36, n=60):** actual +2.1% = GB10Y +0.6% · BZ=F -0.1% · GBPUSD=X +0.0% · unexplained +1.5%
**This week:** 11-05 07:00 ET United Kingdom: BoE Interest Rate Decision (cons 4.00%, prev 3.75%) · 11-05 07:00 ET United Kingdom: BoE MPC Meeting Minutes · 11-09 19:01 ET United Kingdom: BRC Retail Sales Monitor

### Nikkei 225  `^N225`  63,082 (2026-11-03)
**Move:** 1w -0.3% · 4w -10.8% (92nd pct of 2y 4w moves) · 13w -1.4% · 52w range position 61% (lo 48,538 / hi 72,366)
**Drivers (recent corr):** USDJPY=X +0.24 [weak] · ^NDX +0.26 [weak] · SOXX +0.28 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.15, n=60):** actual -11.4% = ^NDX -3.4% · SOXX -2.1% · USDJPY=X +0.0% · unexplained -5.9%
**This week:** 11-04 18:50 ET Japan: Monetary Policy Meeting Minutes

### KOSPI  `^KS11`  5,666 (2026-11-03)
**Move:** 1w +0.5% · 4w -18.4% (86th pct of 2y 4w moves) · 13w -10.9% · 52w range position 35% (lo 3,846 / hi 9,115)
**Drivers (recent corr):** SOXX +0.15 [weak] · ^NDX +0.06 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.10, n=60):** actual -20.3% = SOXX -14.6% · ^NDX +7.2% · unexplained -12.9%
**This week:** 11-10 18:00 ET South Korea: Unemployment Rate

### Hang Seng  `^HSI`  23,493 (2026-11-03)
**Move:** 1w +2.0% · 4w -3.2% (50th pct of 2y 4w moves) · 13w -9.1% · 52w range position 16% (lo 22,672 / hi 27,968)
**Drivers (recent corr):** ^NDX -0.47 [INVERTED] → **in charge: ^NDX** (US tech (prior US day))
**Last 20 sessions decomposed (R² 0.02, n=60):** actual -3.3% = ^NDX +1.2% · unexplained -4.5%
**This week:** 11-08 20:30 ET China: CPI

### ASX 200  `^AXJO`  8,847 (2026-11-03)
**Move:** 1w -0.0% · 4w +1.3% (26th pct of 2y 4w moves) · 13w -3.3% · 52w range position 53% (lo 8,366 / hi 9,272)
**Drivers (recent corr):** HG=F +0.41 [textbook] · ^GSPC +0.22 [weak] → **in charge: HG=F** (Miners)
**Last 20 sessions decomposed (R² 0.16, n=60):** actual +1.3% = ^GSPC -0.6% · HG=F -0.3% · unexplained +2.1%


## 7. Rates

### US 2y  `US2Y`  4.69% (2026-11-03)
**Move:** 1w -15bp · 4w -34bp (91st pct of 2y 4w moves) · 13w +36bp · 52w range position 75% (lo 3.512 / hi 5.089)
**Drivers (recent corr):** CL=F -0.29 [weak] · ^GSPC +0.56 [textbook, was INVERTED] → **in charge: ^GSPC** (Risk-on = fewer cuts / more hikes)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual -34bp = ^GSPC +1bp · CL=F -1bp · unexplained -34bp
**Positioning (CFTC UST 2Y NOTE, 2026-10-27, + = long US 2y):** lev funds +1,357,658 (+30% OI, 4w +191,678, 10th pct of 3y) · asset mgrs -1,837,491 (-41% OI, 4w -199,013, 65th pct of 3y)
**This week:** 11-04 08:15 ET United States: ADP Nonfarm Employment Change (cons 68K, prev 90K) · 11-04 10:00 ET United States: ISM Non-Manufacturing Business Activity · 11-04 10:00 ET United States: ISM Non-Manufacturing Employment · 11-04 10:00 ET United States: ISM Non-Manufacturing New Orders · 11-04 10:00 ET United States: ISM Non-Manufacturing PMI (cons 54.8, prev 54.9) · 11-04 10:00 ET United States: ISM Non-Manufacturing Prices

### US 10y  `US10Y`  4.89% (2026-11-03)
**Move:** 1w -10bp · 4w -38bp (95th pct of 2y 4w moves) · 13w +27bp · 52w range position 69% (lo 3.962 / hi 5.311)
**Drivers (recent corr):** CL=F -0.23 [weak] · ^NDX +0.62 [INVERTED] · T10YIE (missing) · DE10Y +0.25 [weak] → **in charge: ^NDX** (Textbook: yields up hurt stocks; + means bonds hedge stocks)
**Last 20 sessions decomposed (R² 0.08, n=60):** actual -38bp = ^NDX -11bp · DE10Y -4bp · CL=F -0bp · unexplained -23bp
**Positioning (CFTC UST 10Y NOTE, 2026-10-27, + = long US 10y):** lev funds +2,227,275 (+38% OI, 4w +190,843, 83rd pct of 3y) · asset mgrs -3,000,164 (-51% OI, 4w -223,633, 1st pct of 3y)
**This week:** 11-04 08:15 ET United States: ADP Nonfarm Employment Change (cons 68K, prev 90K) · 11-04 10:00 ET United States: ISM Non-Manufacturing Business Activity · 11-04 10:00 ET United States: ISM Non-Manufacturing Employment · 11-04 10:00 ET United States: ISM Non-Manufacturing New Orders · 11-04 10:00 ET United States: ISM Non-Manufacturing PMI (cons 54.8, prev 54.9) · 11-04 10:00 ET United States: ISM Non-Manufacturing Prices

### US 30y  `US30Y`  5.27% (2026-11-03)
**Move:** 1w -4bp · 4w -37bp (96th pct of 2y 4w moves) · 13w +8bp · 52w range position 62% (lo 4.633 / hi 5.665)
**Drivers (recent corr):** US2Y +0.86 [textbook] · T10YIE (missing) → **in charge: US2Y** (Front end)
**Last 20 sessions decomposed (R² 0.66, n=60):** actual -37bp = US2Y -23bp · unexplained -15bp
**Positioning (CFTC UST BOND, 2026-10-27, + = long US 30y):** lev funds +150,393 (+8% OI, 4w -101,002, 1st pct of 3y) · asset mgrs -383,981 (-20% OI, 4w +52,975, 97th pct of 3y)
**This week:** 11-04 08:15 ET United States: ADP Nonfarm Employment Change (cons 68K, prev 90K) · 11-04 10:00 ET United States: ISM Non-Manufacturing Business Activity · 11-04 10:00 ET United States: ISM Non-Manufacturing Employment · 11-04 10:00 ET United States: ISM Non-Manufacturing New Orders · 11-04 10:00 ET United States: ISM Non-Manufacturing PMI (cons 54.8, prev 54.9) · 11-04 10:00 ET United States: ISM Non-Manufacturing Prices

### Bund 10y  `DE10Y`  3.34% (2026-11-03)
**Move:** 1w -5bp · 4w -15bp (65th pct of 2y 4w moves) · 13w +15bp · 52w range position 68% (lo 2.67 / hi 3.66)
**Drivers (recent corr):** US10Y +0.25 [weak] · BZ=F +0.08 [weak] · FR_DE +0.13 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.04, n=31):** actual -15bp = US10Y -5bp · FR_DE +3bp · BZ=F -1bp · unexplained -13bp
**This week:** 11-04 05:00 ET Euro Zone: Core CPI (cons 2.5%, prev 2.5%) · 11-04 05:00 ET Euro Zone: CPI · 11-05 04:00 ET Italy: Italian Retail Sales · 11-06 05:00 ET Euro Zone: Retail Sales (cons -0.1%, prev 0.1%) · 11-10 01:30 ET France: French Unemployment Rate

### Gilt 10y  `GB10Y`  5.28% (2026-11-03)
**Move:** 1w -5bp · 4w -9bp (40th pct of 2y 4w moves) · 13w +29bp · 52w range position 82% (lo 4.352 / hi 5.478)
**Drivers (recent corr):** US10Y +0.56 [textbook] · GBPUSD=X -0.26 [weak] → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.36, n=60):** actual -9bp = US10Y -21bp · GBPUSD=X -1bp · unexplained +12bp
**This week:** 11-05 07:00 ET United Kingdom: BoE Interest Rate Decision (cons 4.00%, prev 3.75%) · 11-05 07:00 ET United Kingdom: BoE MPC Meeting Minutes · 11-09 19:01 ET United Kingdom: BRC Retail Sales Monitor

### JGB 10y  `JP10Y`  2.82% (2026-11-03)
**Move:** 1w -1bp · 4w -29bp (98th pct of 2y 4w moves) · 13w -3bp · 52w range position 80% (lo 1.676 / hi 3.111)
**Drivers (recent corr):** US10Y +0.48 [textbook] · USDJPY=X +0.63 [textbook] → **in charge: USDJPY=X** (Weak yen -> BoJ pressure)
**Last 20 sessions decomposed (R² 0.47, n=60):** actual -29bp = US10Y -12bp · USDJPY=X -0bp · unexplained -16bp
**This week:** 11-04 18:50 ET Japan: Monetary Policy Meeting Minutes

### Canada 10y  `CA10Y`  3.78% (2026-11-03)
**Move:** 1w -5bp · 4w -14bp (60th pct of 2y 4w moves) · 13w +23bp · 52w range position 76% (lo 3.1 / hi 3.99)
**Drivers (recent corr):** US10Y +0.76 [textbook] · CL=F -0.17 [weak] → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.64, n=60):** actual -14bp = US10Y -27bp · CL=F +2bp · unexplained +11bp
**This week:** 11-06 08:30 ET Canada: Employment Change (cons 14.5K, prev -68.3K) · 11-06 08:30 ET Canada: Full Employment Change · 11-06 08:30 ET Canada: Part Time Employment Change · 11-06 08:30 ET Canada: Unemployment Rate (cons 6.5%, prev 6.5%)

### French spread (proxy)  `FR_DE`  +88bp vs start of capture (2026-11-03)
**Move:** 1w +780bp · 4w +3019bp () · 13w n/a · 52w range position 84% (lo 31.02 / hi 98.46)
**Drivers (recent corr):** IT_DE +0.84 [textbook] · ^STOXX50E -0.38 [textbook] → **in charge: IT_DE** (Contagion: Italy moving with France?)
**Last 20 sessions decomposed (R² 0.77, n=31):** actual +3019bp = IT_DE +568bp · ^STOXX50E +155bp · unexplained +2296bp
**This week:** 11-04 05:00 ET Euro Zone: Core CPI (cons 2.5%, prev 2.5%) · 11-04 05:00 ET Euro Zone: CPI · 11-05 04:00 ET Italy: Italian Retail Sales · 11-06 05:00 ET Euro Zone: Retail Sales (cons -0.1%, prev 0.1%) · 11-10 01:30 ET France: French Unemployment Rate


## 8. Commodities

### WTI crude  `CL=F`  96.56 (2026-11-03)
**Move:** 1w -6.1% · 4w +9.4% (71st pct of 2y 4w moves) · 13w +28.4% · 52w range position 72% (lo 55.27 / hi 112.9)
**Drivers (recent corr):** XLE +0.19 [weak] · ^GSPC -0.09 [weak] · HG=F -0.19 [weak] · DX-Y.NYB -0.32 [textbook] → **in charge: DX-Y.NYB** (Dollar)
**Last 20 sessions decomposed (R² 0.24, n=60):** actual +9.0% = ^GSPC +2.0% · XLE +1.9% · HG=F +1.7% · DX-Y.NYB +0.6% · unexplained +2.7%
**Positioning (CFTC WTI-PHYSICAL, 2026-10-27, + = long WTI crude):** managed money +31,128 (+2% OI, 4w -48,464, 13th pct of 3y) · producers +366,392 (+19% OI, 4w +46,853, 96th pct of 3y)
**This week:** 11-04 08:15 ET United States: ADP Nonfarm Employment Change (cons 68K, prev 90K) · 11-04 10:00 ET United States: ISM Non-Manufacturing Business Activity · 11-04 10:00 ET United States: ISM Non-Manufacturing Employment · 11-04 10:00 ET United States: ISM Non-Manufacturing New Orders · 11-04 10:00 ET United States: ISM Non-Manufacturing PMI (cons 54.8, prev 54.9) · 11-04 10:00 ET United States: ISM Non-Manufacturing Prices

### Gold  `GC=F`  3,944 (2026-11-03)
**Move:** 1w -2.7% · 4w -4.7% (53rd pct of 2y 4w moves) · 13w -8.4% · 52w range position 3% (lo 3,899 / hi 5,318)
**Drivers (recent corr):** DFII10 (missing) · DX-Y.NYB +0.03 [weak] · SI=F +0.88 [textbook] · BTC-USD +0.05 [weak] → **in charge: SI=F** (Precious block)
**Last 20 sessions decomposed (R² 0.74, n=60):** actual -4.9% = SI=F -8.5% · BTC-USD +0.4% · DX-Y.NYB +0.2% · unexplained +3.0%
**Positioning (CFTC GOLD, 2026-10-27, + = long Gold):** managed money +105,562 (+27% OI, 4w -14,756, 25th pct of 3y) · producers -9,574 (-2% OI, 4w +11,689, 99th pct of 3y)
**This week:** 11-04 08:15 ET United States: ADP Nonfarm Employment Change (cons 68K, prev 90K) · 11-04 10:00 ET United States: ISM Non-Manufacturing Business Activity · 11-04 10:00 ET United States: ISM Non-Manufacturing Employment · 11-04 10:00 ET United States: ISM Non-Manufacturing New Orders · 11-04 10:00 ET United States: ISM Non-Manufacturing PMI (cons 54.8, prev 54.9) · 11-04 10:00 ET United States: ISM Non-Manufacturing Prices

### Silver  `SI=F`  49.9 (2026-11-03)
**Move:** 1w -6.7% · 4w -16.7% (83rd pct of 2y 4w moves) · 13w -19.6% · 52w range position 4% (lo 47.13 / hi 115.1)
**Drivers (recent corr):** GC=F +0.88 [textbook] · HG=F +0.55 [textbook] → **in charge: GC=F** (Gold)
**Last 20 sessions decomposed (R² 0.77, n=60):** actual -18.3% = GC=F -6.4% · HG=F -0.9% · unexplained -10.9%
**Positioning (CFTC SILVER, 2026-10-27, + = long Silver):** managed money +3,321 (+3% OI, 4w -4,293, 4th pct of 3y) · producers -15,231 (-13% OI, 4w +1,281, 94th pct of 3y)
**This week:** 11-04 08:15 ET United States: ADP Nonfarm Employment Change (cons 68K, prev 90K) · 11-04 10:00 ET United States: ISM Non-Manufacturing Business Activity · 11-04 10:00 ET United States: ISM Non-Manufacturing Employment · 11-04 10:00 ET United States: ISM Non-Manufacturing New Orders · 11-04 10:00 ET United States: ISM Non-Manufacturing PMI (cons 54.8, prev 54.9) · 11-04 10:00 ET United States: ISM Non-Manufacturing Prices

### Copper  `HG=F`  6.455 (2026-11-03)
**Move:** 1w -2.8% · 4w -2.2% (25th pct of 2y 4w moves) · 13w -3.7% · 52w range position 81% (lo 4.926 / hi 6.804)
**Drivers (recent corr):** ^GSPC -0.05 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.02, n=60):** actual -2.2% = ^GSPC -0.9% · unexplained -1.3%
**Positioning (CFTC COPPER- #1, 2026-10-27, + = long Copper):** managed money +40,575 (+12% OI, 4w -37,483, 57th pct of 3y) · producers -65,243 (-19% OI, 4w +39,097, 48th pct of 3y)
**This week:** 11-04 08:15 ET United States: ADP Nonfarm Employment Change (cons 68K, prev 90K) · 11-04 10:00 ET United States: ISM Non-Manufacturing Business Activity · 11-04 10:00 ET United States: ISM Non-Manufacturing Employment · 11-04 10:00 ET United States: ISM Non-Manufacturing New Orders · 11-04 10:00 ET United States: ISM Non-Manufacturing PMI (cons 54.8, prev 54.9) · 11-04 10:00 ET United States: ISM Non-Manufacturing Prices

### Nat gas (US)  `NG=F`  2.887 (2026-11-03)
**Move:** 1w +2.5% · 4w -9.9% (52nd pct of 2y 4w moves) · 13w +7.4% · 52w range position 7% (lo 2.523 / hi 7.46)
**Drivers (recent corr):** CL=F -0.00 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.01, n=60):** actual -10.4% = CL=F +0.7% · unexplained -11.1%
**Positioning (CFTC NAT GAS NYME, 2026-10-27, + = long Nat gas (US)):** managed money -206,317 (-12% OI, 4w -73,518, 1st pct of 3y) · producers -3,516 (-0% OI, 4w +10,568, 89th pct of 3y)
**This week:** 11-04 08:15 ET United States: ADP Nonfarm Employment Change (cons 68K, prev 90K) · 11-04 10:00 ET United States: ISM Non-Manufacturing Business Activity · 11-04 10:00 ET United States: ISM Non-Manufacturing Employment · 11-04 10:00 ET United States: ISM Non-Manufacturing New Orders · 11-04 10:00 ET United States: ISM Non-Manufacturing PMI (cons 54.8, prev 54.9) · 11-04 10:00 ET United States: ISM Non-Manufacturing Prices


## 9. Crypto

### Bitcoin  `BTC-USD`  76,589 (2026-11-03)
**Move:** 1w -5.2% · 4w -10.5% (68th pct of 2y 4w moves) · 13w +19.6% · 52w range position 38% (lo 58,559 / hi 105,997)
**Drivers (recent corr):** ^NDX +0.54 [textbook] · DX-Y.NYB +0.06 [weak] · GC=F +0.05 [weak] → **in charge: ^NDX** (Tech / speculation)
**Last 20 sessions decomposed (R² 0.19, n=60):** actual -11.1% = ^NDX -10.3% · GC=F -0.6% · DX-Y.NYB +0.0% · unexplained -0.2%
**Positioning (CFTC BITCOIN, 2026-10-27, + = long Bitcoin):** lev funds -3,979 (-19% OI, 4w +2,877, 100th pct of 3y) · asset mgrs +2,754 (+13% OI, 4w -832, 6th pct of 3y)
**This week:** 11-04 08:15 ET United States: ADP Nonfarm Employment Change (cons 68K, prev 90K) · 11-04 10:00 ET United States: ISM Non-Manufacturing Business Activity · 11-04 10:00 ET United States: ISM Non-Manufacturing Employment · 11-04 10:00 ET United States: ISM Non-Manufacturing New Orders · 11-04 10:00 ET United States: ISM Non-Manufacturing PMI (cons 54.8, prev 54.9) · 11-04 10:00 ET United States: ISM Non-Manufacturing Prices

