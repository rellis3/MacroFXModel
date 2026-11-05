# Market Review Data Pack: 2026-11-05

Fetched 2026-11-05T02:44:26+00:00. Descriptive numbers for the weekly review (read with `education/market_reviews/PLAYBOOK.md`). Correlations are of daily moves: last 20 sessions vs the 60 before. They are noisy; a flip is a question, not a signal.

**Data notes:** fred DGS2: The read operation timed out · fred DFII10: The read operation timed out · fred T10YIE: The read operation timed out · fred BAMLH0A0HYM2: The read operation timed out · fred BAMLC0A0CM: The read operation timed out · FRED DGS2 missing: US 2y = US 5y stand-in for this run · No local OAT/Bund futures: French spread proxy unavailable

## 1. Regime gauges: which story is the market trading?

| Pair | Recent | Before | Textbook sign | Status | What it means |
|---|---|---|---|---|---|
| CL=F vs US10Y | -0.11 | +0.24 | + | weak | Oil vs yields: + = oil is an inflation story; - = oil is a growth tax (2008-style) |
| ^NDX vs US10Y | +0.58 | -0.22 | − | INVERTED | Stocks vs yields: - = rates drive stocks; + = growth scare, bonds hedge stocks |
| HYG_TLT vs ^NDX | +0.69 | -0.10 | + | textbook | Credit vs tech: high + = credit and equities are one trade (credit stress leading) |
| DX-Y.NYB vs ^GSPC | -0.10 | +0.04 | − | weak | Dollar vs stocks: - = safe-haven dollar; ~0/+ = "sell America" or liquidity dash |
| AUDUSD=X vs ^NDX | +0.37 | +0.43 | + | textbook | Aussie vs tech: near 0 = AUD trading commodities not risk |
| BTC-USD vs ^NDX | +0.54 | +0.35 | + | textbook | Bitcoin vs tech: high = one liquidity complex |
| XLE vs CL=F | +0.51 | +0.36 | + | textbook | Energy stocks vs oil: falling = equity investors fade the oil move |
| USDJPY=X vs US10Y | +0.65 | +0.23 | + | textbook | Yen vs yields: high = yen is a pure rates trade |

Equity vol vs bond vol: VIX 16.6 (1y pct 43) · MOVE 94 (1y pct 85). When bond vol leads equity vol, the stress is in rates/credit first.

**Fed funds futures (implied average rate by contract month; vs ~1 week earlier):** V6 3.882% (-0.002) · X6 3.880% (+0.000) · Z6 4.020% (+0.005) · F7 4.090% (+0.005) · G7 4.150% (+0.000) · H7 4.215% (+0.000) · J7 4.305% (+0.015) · K7 4.370% (+0.020) · M7 4.430% (+0.020) · N7 4.465% (+0.030) · Q7 4.485% (+0.035) · U7 4.500% (+0.045) · V7 4.510% (+0.045) (as of 2026-10-26)

## 2. G10 FX

### EURUSD  `EURUSD=X`  1.126 (2026-11-05)
**Move:** 1w +0.7% · 4w +0.4% (14th pct of 2y 4w moves) · 13w -2.3% · 52w range position 14% (lo 1.113 / hi 1.202)
**Drivers (recent corr):** US_EA2 +0.03 [weak] · US_DE10 +0.05 [weak] · FR_DE (missing) · ^STOXX50E +0.02 [weak] · BZ=F -0.22 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.07, n=60):** actual +0.4% = US_EA2 +0.2% · ^STOXX50E +0.2% · BZ=F +0.0% · US_DE10 -0.0% · unexplained -0.0%
**Positioning (CFTC EURO FX, 2026-10-27, + = long EURUSD):** lev funds -71,574 (-8% OI, 4w -32,309, 1st pct of 3y) · asset mgrs +173,249 (+20% OI, 4w -47,354, 8th pct of 3y)
**This week:** 11-06 05:00 ET Euro Zone: Retail Sales (cons -0.1%, prev 0.1%) · 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-10 01:30 ET France: French Unemployment Rate

### USDJPY  `USDJPY=X`  157.9 (2026-11-05)
**Move:** 1w +0.1% · 4w -0.1% (5th pct of 2y 4w moves) · 13w -0.3% · 52w range position 48% (lo 152.5 / hi 163.9)
**Drivers (recent corr):** US10Y +0.65 [textbook] · US_JP10 +0.66 [textbook] · ^NDX +0.48 [textbook] · ^VIX -0.22 [weak] → **in charge: US_JP10** (US-Japan 10y gap)
**Last 20 sessions decomposed (R² 0.14, n=60):** actual -0.1% = US10Y -1.2% · ^NDX -0.7% · US_JP10 +0.1% · ^VIX +0.1% · unexplained +1.6%
**Positioning (CFTC JAPANESE YEN, 2026-10-27, + = long USDJPY):** lev funds +14,630 (+4% OI, 4w +469, 23rd pct of 3y) · asset mgrs -91,191 (-24% OI, 4w -39,557, 9th pct of 3y)
**This week:** 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI

### GBPUSD  `GBPUSD=X`  1.349 (2026-11-05)
**Move:** 1w +0.8% · 4w +2.0% (73rd pct of 2y 4w moves) · 13w +0.3% · 52w range position 56% (lo 1.306 / hi 1.383)
**Drivers (recent corr):** US_GB10 -0.10 [weak] · GB10Y -0.13 [weak] · ^GSPC +0.20 [weak] · EURUSD=X +0.85 [textbook] → **in charge: EURUSD=X** (European block move)
**Last 20 sessions decomposed (R² 0.69, n=60):** actual +1.9% = EURUSD=X +0.3% · GB10Y +0.2% · US_GB10 +0.0% · ^GSPC -0.0% · unexplained +1.5%
**Positioning (CFTC BRITISH POUND, 2026-10-27, + = long GBPUSD):** lev funds +17,195 (+7% OI, 4w +12,589, 18th pct of 3y) · asset mgrs -128,893 (-51% OI, 4w -349, 6th pct of 3y)
**This week:** 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-09 19:01 ET United Kingdom: BRC Retail Sales Monitor · 11-10 06:00 ET United States: NFIB Small Business Optimism

### USDCAD  `USDCAD=X`  1.395 (2026-11-05)
**Move:** 1w -0.3% · 4w -1.9% (81st pct of 2y 4w moves) · 13w -0.5% · 52w range position 58% (lo 1.349 / hi 1.428)
**Drivers (recent corr):** CL=F +0.22 [weak] · US_CA2 +0.46 [textbook] · ^GSPC -0.17 [weak] → **in charge: US_CA2** (US-Canada 2y rate gap)
**Last 20 sessions decomposed (R² 0.31, n=60):** actual -1.9% = US_CA2 -1.1% · ^GSPC +0.1% · CL=F -0.0% · unexplained -0.9%
**Positioning (CFTC CANADIAN DOLLAR, 2026-10-27, + = long USDCAD):** lev funds +96,747 (+27% OI, 4w +27,103, 96th pct of 3y) · asset mgrs +1,325 (+0% OI, 4w -26,256, 15th pct of 3y)
**This week:** 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-06 08:30 ET Canada: Employment Change (cons 14.5K, prev -68.3K) · 11-06 08:30 ET Canada: Full Employment Change

### AUDUSD  `AUDUSD=X`  0.7021 (2026-11-05)
**Move:** 1w -0.1% · 4w +0.9% (34th pct of 2y 4w moves) · 13w -0.2% · 52w range position 71% (lo 0.6449 / hi 0.7255)
**Drivers (recent corr):** HG=F +0.05 [weak] · ^NDX +0.37 [textbook] · GC=F +0.16 [weak] → **in charge: ^NDX** (Global risk proxy)
**Last 20 sessions decomposed (R² 0.11, n=60):** actual +0.9% = ^NDX -0.9% · GC=F -0.0% · HG=F +0.0% · unexplained +1.8%
**Positioning (CFTC AUSTRALIAN DOLLAR, 2026-10-27, + = long AUDUSD):** lev funds +48,414 (+15% OI, 4w -12,178, 85th pct of 3y) · asset mgrs -125,237 (-39% OI, 4w -52,038, 1st pct of 3y)
**This week:** 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI

### NZDUSD  `NZDUSD=X`  0.5647 (2026-11-05)
**Move:** 1w +0.3% · 4w +0.8% (25th pct of 2y 4w moves) · 13w -3.8% · 52w range position 12% (lo 0.5587 / hi 0.6076)
**Drivers (recent corr):** AUDUSD=X +0.49 [textbook] · ^GSPC +0.37 [textbook] · US2Y +0.00 [weak] → **in charge: AUDUSD=X** (Antipodean block)
**Last 20 sessions decomposed (R² 0.43, n=60):** actual +0.7% = AUDUSD=X +0.6% · US2Y +0.3% · ^GSPC -0.0% · unexplained -0.1%
**Positioning (CFTC NZ DOLLAR, 2026-10-27, + = long NZDUSD):** lev funds -22,554 (-17% OI, 4w -21,488, 8th pct of 3y) · asset mgrs -46,841 (-36% OI, 4w -25,613, 11th pct of 3y)
**This week:** 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI

### USDCHF  `USDCHF=X`  0.8145 (2026-11-05)
**Move:** 1w -1.1% · 4w -2.0% (70th pct of 2y 4w moves) · 13w +0.3% · 52w range position 71% (lo 0.7632 / hi 0.8357)
**Drivers (recent corr):** US10Y +0.49 [textbook] · ^VIX -0.03 [weak] · GC=F -0.01 [weak] → **in charge: US10Y** (US yields)
**Last 20 sessions decomposed (R² 0.30, n=60):** actual -2.1% = US10Y -1.4% · ^VIX +0.1% · GC=F -0.0% · unexplained -0.7%
**Positioning (CFTC SWISS FRANC, 2026-10-27, + = long USDCHF):** lev funds +17,502 (+13% OI, 4w +3,507, 96th pct of 3y) · asset mgrs +25,067 (+19% OI, 4w -11,344, 34th pct of 3y)
**This week:** 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI


## 3. G10 crosses

### AUDNZD  `AUDNZD=X`  1.243 (2026-11-05)
**Move:** 1w -0.4% · 4w +0.1% (8th pct of 2y 4w moves) · 13w +3.7% · 52w range position 90% (lo 1.141 / hi 1.254)
**Drivers (recent corr):** HG=F +0.00 [weak] · ^AXJO +0.07 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.04, n=60):** actual +0.1% = ^AXJO -0.4% · HG=F -0.1% · unexplained +0.6%
**This week:** 11-10 19:00 ET New Zealand: RBNZ Press Conference · 11-11 16:45 ET New Zealand: Electronic Card Retail Sales

### EURGBP  `EURGBP=X`  0.8343 (2026-11-05)
**Move:** 1w -0.2% · 4w -1.6% (85th pct of 2y 4w moves) · 13w -2.6% · 52w range position 0% (lo 0.8342 / hi 0.8842)
**Drivers (recent corr):** GB10Y +0.15 [weak] · FR_DE (missing) → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual -1.6% = GB10Y +0.0% · unexplained -1.6%
**This week:** 11-06 05:00 ET Euro Zone: Retail Sales (cons -0.1%, prev 0.1%) · 11-09 19:01 ET United Kingdom: BRC Retail Sales Monitor · 11-10 01:30 ET France: French Unemployment Rate · 11-12 02:00 ET United Kingdom: GDP · 11-12 02:00 ET United Kingdom: Monthly GDP 3M/3M Change · 11-12 07:00 ET United Kingdom: NIESR Monthly GDP Tracker

### EURCHF  `EURCHF=X`  0.9166 (2026-11-05)
**Move:** 1w -0.5% · 4w -1.7% (90th pct of 2y 4w moves) · 13w -2.1% · 52w range position 32% (lo 0.9023 / hi 0.9466)
**Drivers (recent corr):** ^STOXX50E +0.09 [weak] · FR_DE (missing) · ^VIX -0.25 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.02, n=60):** actual -1.7% = ^STOXX50E +0.1% · ^VIX +0.0% · unexplained -1.8%
**This week:** 11-06 05:00 ET Euro Zone: Retail Sales (cons -0.1%, prev 0.1%) · 11-10 01:30 ET France: French Unemployment Rate


## 4. EM FX

### USDMXN  `USDMXN=X`  18.55 (2026-11-05)
**Move:** 1w -1.6% · 4w +2.0% (66th pct of 2y 4w moves) · 13w +7.8% · 52w range position 84% (lo 16.89 / hi 18.85)
**Drivers (recent corr):** ^VIX +0.19 [weak] · ^GSPC -0.14 [weak] · CL=F +0.75 [INVERTED] · USDBRL=X -0.22 [weak] → **in charge: CL=F** (Oil)
**Last 20 sessions decomposed (R² 0.16, n=60):** actual +2.0% = USDBRL=X +0.7% · CL=F -0.3% · ^VIX +0.1% · ^GSPC +0.0% · unexplained +1.4%
**Positioning (CFTC MEXICAN PESO, 2026-10-27, + = long USDMXN):** lev funds -68,335 (-24% OI, 4w +12,252, 7th pct of 3y) · asset mgrs +25,201 (+9% OI, 4w +41,452, 100th pct of 3y)
**This week:** 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI

### USDBRL  `USDBRL=X`  5.46 (2026-11-05)
**Move:** 1w +1.4% · 4w +8.8% (100th pct of 2y 4w moves) · 13w +6.6% · 52w range position 81% (lo 4.906 / hi 5.59)
**Drivers (recent corr):** ^VIX +0.01 [weak] · HG=F +0.32 [INVERTED] · EWZ -0.94 [textbook] → **in charge: EWZ** (Brazil equities (local flows))
**Last 20 sessions decomposed (R² 0.86, n=60):** actual +8.4% = EWZ +8.1% · HG=F +0.1% · ^VIX +0.1% · unexplained +0.1%
**Positioning (CFTC BRAZILIAN REAL, 2026-10-27, + = long USDBRL):** lev funds -7,600 (-5% OI, 4w +1,953, 27th pct of 3y) · asset mgrs -52,010 (-31% OI, 4w +15,005, 43rd pct of 3y)
**This week:** 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 06:00 ET Brazil: BCB Copom Meeting Minutes

### USDZAR  `USDZAR=X`  16.33 (2026-11-05)
**Move:** 1w -1.7% · 4w -1.5% (48th pct of 2y 4w moves) · 13w -0.1% · 52w range position 38% (lo 15.71 / hi 17.35)
**Drivers (recent corr):** GC=F -0.29 [weak] · ^VIX +0.59 [textbook] · HG=F +0.11 [weak] → **in charge: ^VIX** (Carry / risk)
**Last 20 sessions decomposed (R² 0.26, n=60):** actual -1.6% = ^VIX +0.2% · GC=F +0.1% · HG=F -0.1% · unexplained -1.8%
**Positioning (CFTC SO AFRICAN RAND, 2026-10-27, + = long USDZAR):** lev funds -5,262 (-14% OI, 4w -608, 22nd pct of 3y) · asset mgrs -16,859 (-45% OI, 4w +3,861, 27th pct of 3y)
**This week:** 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-10 04:30 ET South Africa: Unemployment Rate · 11-10 06:00 ET United States: NFIB Small Business Optimism

### USDKRW  `USDKRW=X`  1,343 (2026-11-05)
**Move:** 1w +0.4% · 4w -0.0% (0th pct of 2y 4w moves) · 13w -5.6% · 52w range position 8% (lo 1,324 / hi 1,552)
**Drivers (recent corr):** ^KS11 +0.33 [INVERTED] · SOXX +0.04 [weak] · DX-Y.NYB -0.01 [weak] → **in charge: ^KS11** (KOSPI (chip exporters))
**Last 20 sessions decomposed (R² 0.10, n=60):** actual -0.0% = ^KS11 -1.3% · SOXX +1.0% · DX-Y.NYB -0.2% · unexplained +0.6%
**This week:** 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI


## 5. CE3 FX

### EURCZK  `EURCZK=X`  24.28 (2026-11-05)
**Move:** 1w -0.2% · 4w -0.4% (50th pct of 2y 4w moves) · 13w +0.2% · 52w range position 44% (lo 24.07 / hi 24.53)
**Drivers (recent corr):** ^STOXX50E -0.29 [weak] · EURPLN=X +0.59 [textbook] → **in charge: EURPLN=X** (CE3 block)
**Last 20 sessions decomposed (R² 0.25, n=60):** actual -0.4% = EURPLN=X +0.0% · ^STOXX50E -0.0% · unexplained -0.4%
**This week:** 11-06 05:00 ET Euro Zone: Retail Sales (cons -0.1%, prev 0.1%) · 11-10 01:30 ET France: French Unemployment Rate

### EURPLN  `EURPLN=X`  4.385 (2026-11-05)
**Move:** 1w -0.1% · 4w +0.2% (26th pct of 2y 4w moves) · 13w +2.1% · 52w range position 87% (lo 4.197 / hi 4.412)
**Drivers (recent corr):** ^STOXX50E -0.28 [weak] · ^VIX +0.43 [textbook] → **in charge: ^VIX** (Risk)
**Last 20 sessions decomposed (R² 0.15, n=60):** actual +0.2% = ^STOXX50E -0.1% · ^VIX +0.1% · unexplained +0.3%
**This week:** 11-06 05:00 ET Euro Zone: Retail Sales (cons -0.1%, prev 0.1%) · 11-10 01:30 ET France: French Unemployment Rate


## 6. Equities

### S&P 500  `^GSPC`  7,689 (2026-11-05)
**Move:** 1w -0.4% · 4w -1.0% (23rd pct of 2y 4w moves) · 13w -0.3% · 52w range position 91% (lo 6,344 / hi 7,819)
**Drivers (recent corr):** US10Y +0.35 [INVERTED, was textbook] · HYG_TLT +0.50 [textbook] · DX-Y.NYB -0.10 [weak] · CL=F -0.36 [textbook] · ^VIX -0.92 [textbook] → **in charge: ^VIX** (Vol)
**Last 20 sessions decomposed (R² 0.75, n=60):** actual -1.0% = HYG_TLT -1.0% · US10Y +0.9% · ^VIX -0.5% · DX-Y.NYB -0.2% · CL=F +0.1% · unexplained -0.3%
**Positioning (CFTC E-MINI S&P 500, 2026-10-27, + = long S&P 500):** lev funds -400,604 (-20% OI, 4w -28,115, 27th pct of 3y) · asset mgrs +923,449 (+47% OI, 4w +19,446, 45th pct of 3y)
**This week:** 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI

### Nasdaq 100  `^NDX`  28,437 (2026-11-05)
**Move:** 1w -3.3% · 4w -7.4% (83rd pct of 2y 4w moves) · 13w -3.2% · 52w range position 66% (lo 22,953 / hi 31,224)
**Drivers (recent corr):** US10Y +0.58 [INVERTED] · SOXX +0.90 [textbook] · HYG_TLT +0.69 [textbook] · BTC-USD +0.54 [textbook] → **in charge: SOXX** (Semis / AI capex)
**Last 20 sessions decomposed (R² 0.80, n=60):** actual -7.7% = SOXX -7.5% · US10Y +1.8% · HYG_TLT -1.6% · BTC-USD -0.1% · unexplained -0.3%
**Positioning (CFTC NASDAQ MINI, 2026-10-27, + = long Nasdaq 100):** lev funds +2,301 (+1% OI, 4w +27,024, 95th pct of 3y) · asset mgrs +65,381 (+24% OI, 4w -4,363, 25th pct of 3y)
**This week:** 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI

### Russell 2000  `^RUT`  2,857 (2026-11-05)
**Move:** 1w -0.1% · 4w +2.2% (31st pct of 2y 4w moves) · 13w -4.8% · 52w range position 72% (lo 2,305 / hi 3,068)
**Drivers (recent corr):** US2Y -0.01 [weak] · HYG_TLT +0.17 [weak] · ^GSPC +0.77 [textbook] → **in charge: ^GSPC** (Beta)
**Last 20 sessions decomposed (R² 0.61, n=60):** actual +2.2% = US2Y +1.2% · ^GSPC -0.9% · HYG_TLT +0.1% · unexplained +1.8%
**This week:** 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI

### Euro Stoxx 50  `^STOXX50E`  6,266 (2026-11-05)
**Move:** 1w +0.9% · 4w +2.3% (44th pct of 2y 4w moves) · 13w -3.6% · 52w range position 73% (lo 5,501 / hi 6,551)
**Drivers (recent corr):** FR_DE (missing) · ^GSPC +0.55 [textbook] · BZ=F -0.38 [textbook] · EURUSD=X +0.02 [weak] → **in charge: ^GSPC** (US lead)
**Last 20 sessions decomposed (R² 0.35, n=60):** actual +2.2% = BZ=F +0.8% · ^GSPC -0.5% · EURUSD=X +0.1% · unexplained +1.9%
**This week:** 11-06 05:00 ET Euro Zone: Retail Sales (cons -0.1%, prev 0.1%) · 11-10 01:30 ET France: French Unemployment Rate

### CAC 40  `^FCHI`  8,178 (2026-11-05)
**Move:** 1w +2.6% · 4w +5.8% (87th pct of 2y 4w moves) · 13w -6.0% · 52w range position 48% (lo 7,666 / hi 8,726)
**Drivers (recent corr):** FR_DE (missing) · ^STOXX50E +0.89 [textbook] → **in charge: ^STOXX50E** (European block)
**Last 20 sessions decomposed (R² 0.79, n=60):** actual +5.6% = ^STOXX50E +1.9% · unexplained +3.7%
**This week:** 11-06 05:00 ET Euro Zone: Retail Sales (cons -0.1%, prev 0.1%) · 11-10 01:30 ET France: French Unemployment Rate

### DAX  `^GDAXI`  26,438 (2026-11-05)
**Move:** 1w +1.5% · 4w +6.6% (86th pct of 2y 4w moves) · 13w +1.1% · 52w range position 97% (lo 22,301 / hi 26,570)
**Drivers (recent corr):** DE10Y +0.14 [weak] · ^GSPC +0.52 [textbook] → **in charge: ^GSPC** (Global risk)
**Last 20 sessions decomposed (R² 0.31, n=60):** actual +6.4% = ^GSPC -0.6% · DE10Y +0.6% · unexplained +6.4%
**This week:** 11-06 05:00 ET Euro Zone: Retail Sales (cons -0.1%, prev 0.1%) · 11-10 01:30 ET France: French Unemployment Rate

### FTSE 100  `^FTSE`  10,829 (2026-11-05)
**Move:** 1w +1.0% · 4w +3.7% (80th pct of 2y 4w moves) · 13w -0.4% · 52w range position 94% (lo 9,507 / hi 10,911)
**Drivers (recent corr):** BZ=F -0.25 [weak] · GBPUSD=X -0.04 [weak] · GB10Y -0.41 [textbook] → **in charge: GB10Y** (Gilts)
**Last 20 sessions decomposed (R² 0.32, n=60):** actual +3.6% = GB10Y +1.9% · BZ=F +0.4% · GBPUSD=X +0.2% · unexplained +1.2%
**This week:** 11-09 19:01 ET United Kingdom: BRC Retail Sales Monitor · 11-12 02:00 ET United Kingdom: GDP · 11-12 02:00 ET United Kingdom: Monthly GDP 3M/3M Change · 11-12 07:00 ET United Kingdom: NIESR Monthly GDP Tracker

### Nikkei 225  `^N225`  61,940 (2026-11-05)
**Move:** 1w -4.2% · 4w -10.3% (90th pct of 2y 4w moves) · 13w -5.7% · 52w range position 56% (lo 48,538 / hi 72,366)
**Drivers (recent corr):** USDJPY=X +0.19 [weak] · ^NDX +0.25 [weak] · SOXX +0.24 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.13, n=60):** actual -10.9% = ^NDX -3.1% · SOXX -1.6% · USDJPY=X +0.0% · unexplained -6.2%

### KOSPI  `^KS11`  5,522 (2026-11-05)
**Move:** 1w -7.0% · 4w -16.7% (83rd pct of 2y 4w moves) · 13w -12.3% · 52w range position 32% (lo 3,846 / hi 9,115)
**Drivers (recent corr):** SOXX +0.20 [weak] · ^NDX +0.07 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.10, n=60):** actual -18.2% = SOXX -13.0% · ^NDX +5.5% · unexplained -10.7%
**This week:** 11-10 18:00 ET South Korea: Unemployment Rate

### Hang Seng  `^HSI`  24,646 (2026-11-05)
**Move:** 1w +7.3% · 4w +3.6% (54th pct of 2y 4w moves) · 13w -3.5% · 52w range position 37% (lo 22,672 / hi 27,968)
**Drivers (recent corr):** ^NDX -0.19 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual +3.6% = ^NDX +0.6% · unexplained +3.0%
**This week:** 11-08 20:30 ET China: CPI

### ASX 200  `^AXJO`  9,004 (2026-11-05)
**Move:** 1w +1.3% · 4w +4.0% (83rd pct of 2y 4w moves) · 13w -2.9% · 52w range position 70% (lo 8,366 / hi 9,272)
**Drivers (recent corr):** HG=F +0.44 [textbook] · ^GSPC +0.42 [textbook] → **in charge: HG=F** (Miners)
**Last 20 sessions decomposed (R² 0.21, n=60):** actual +3.9% = ^GSPC -0.4% · HG=F -0.2% · unexplained +4.5%


## 7. Rates

### US 2y  `US2Y`  4.69% (2026-11-05)
**Move:** 1w -11bp · 4w -30bp (88th pct of 2y 4w moves) · 13w +30bp · 52w range position 75% (lo 3.512 / hi 5.089)
**Drivers (recent corr):** CL=F -0.16 [weak] · ^GSPC +0.43 [textbook, was INVERTED] → **in charge: ^GSPC** (Risk-on = fewer cuts / more hikes)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual -30bp = ^GSPC +0bp · CL=F -0bp · unexplained -30bp
**Positioning (CFTC UST 2Y NOTE, 2026-10-27, + = long US 2y):** lev funds +1,357,658 (+30% OI, 4w +191,678, 10th pct of 3y) · asset mgrs -1,837,491 (-41% OI, 4w -199,013, 65th pct of 3y)
**This week:** 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI

### US 10y  `US10Y`  4.89% (2026-11-05)
**Move:** 1w -9bp · 4w -34bp (92nd pct of 2y 4w moves) · 13w +22bp · 52w range position 69% (lo 3.962 / hi 5.311)
**Drivers (recent corr):** CL=F -0.11 [weak] · ^NDX +0.58 [INVERTED] · T10YIE (missing) · DE10Y +0.28 [weak] → **in charge: ^NDX** (Textbook: yields up hurt stocks; + means bonds hedge stocks)
**Last 20 sessions decomposed (R² 0.09, n=60):** actual -34bp = ^NDX -8bp · DE10Y -5bp · CL=F -1bp · unexplained -20bp
**Positioning (CFTC UST 10Y NOTE, 2026-10-27, + = long US 10y):** lev funds +2,227,275 (+38% OI, 4w +190,843, 83rd pct of 3y) · asset mgrs -3,000,164 (-51% OI, 4w -223,633, 1st pct of 3y)
**This week:** 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI

### US 30y  `US30Y`  5.28% (2026-11-05)
**Move:** 1w -5bp · 4w -32bp (94th pct of 2y 4w moves) · 13w +7bp · 52w range position 63% (lo 4.633 / hi 5.665)
**Drivers (recent corr):** US2Y +0.88 [textbook] · T10YIE (missing) → **in charge: US2Y** (Front end)
**Last 20 sessions decomposed (R² 0.67, n=60):** actual -32bp = US2Y -21bp · unexplained -12bp
**Positioning (CFTC UST BOND, 2026-10-27, + = long US 30y):** lev funds +150,393 (+8% OI, 4w -101,002, 1st pct of 3y) · asset mgrs -383,981 (-20% OI, 4w +52,975, 97th pct of 3y)
**This week:** 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI

### Bund 10y  `DE10Y`  3.35% (2026-11-05)
**Move:** 1w -4bp · 4w -19bp (74th pct of 2y 4w moves) · 13w +21bp · 52w range position 68% (lo 2.68 / hi 3.66)
**Drivers (recent corr):** US10Y +0.28 [weak] · BZ=F -0.07 [weak] · FR_DE (missing) → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.04, n=60):** actual -19bp = US10Y -5bp · BZ=F -1bp · unexplained -12bp
**This week:** 11-06 05:00 ET Euro Zone: Retail Sales (cons -0.1%, prev 0.1%) · 11-10 01:30 ET France: French Unemployment Rate

### Gilt 10y  `GB10Y`  5.18% (2026-11-05)
**Move:** 1w -9bp · 4w -30bp (90th pct of 2y 4w moves) · 13w +19bp · 52w range position 74% (lo 4.352 / hi 5.478)
**Drivers (recent corr):** US10Y +0.58 [textbook] · GBPUSD=X -0.13 [weak] → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.35, n=60):** actual -30bp = US10Y -19bp · GBPUSD=X -2bp · unexplained -9bp
**This week:** 11-09 19:01 ET United Kingdom: BRC Retail Sales Monitor · 11-12 02:00 ET United Kingdom: GDP · 11-12 02:00 ET United Kingdom: Monthly GDP 3M/3M Change · 11-12 07:00 ET United Kingdom: NIESR Monthly GDP Tracker

### JGB 10y  `JP10Y`  2.85% (2026-11-05)
**Move:** 1w -2bp · 4w -23bp (92nd pct of 2y 4w moves) · 13w +8bp · 52w range position 82% (lo 1.688 / hi 3.111)
**Drivers (recent corr):** US10Y +0.55 [textbook] · USDJPY=X +0.61 [textbook] → **in charge: USDJPY=X** (Weak yen -> BoJ pressure)
**Last 20 sessions decomposed (R² 0.49, n=60):** actual -23bp = US10Y -11bp · USDJPY=X -0bp · unexplained -12bp

### Canada 10y  `CA10Y`  3.77% (2026-11-05)
**Move:** 1w -7bp · 4w -16bp (68th pct of 2y 4w moves) · 13w +16bp · 52w range position 75% (lo 3.1 / hi 3.99)
**Drivers (recent corr):** US10Y +0.76 [textbook] · CL=F -0.10 [weak] → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.64, n=60):** actual -16bp = US10Y -23bp · CL=F -1bp · unexplained +8bp
**This week:** 11-06 08:30 ET Canada: Employment Change (cons 14.5K, prev -68.3K) · 11-06 08:30 ET Canada: Full Employment Change · 11-06 08:30 ET Canada: Part Time Employment Change · 11-06 08:30 ET Canada: Unemployment Rate (cons 6.5%, prev 6.5%)

### French spread (proxy)
_no data_


## 8. Commodities

### WTI crude  `CL=F`  87.47 (2026-11-05)
**Move:** 1w -16.0% · 4w -4.8% (43rd pct of 2y 4w moves) · 13w +11.9% · 52w range position 56% (lo 55.27 / hi 112.9)
**Drivers (recent corr):** XLE +0.51 [textbook] · ^GSPC -0.36 [INVERTED] · HG=F -0.32 [INVERTED] · DX-Y.NYB +0.13 [weak] → **in charge: XLE** (Energy equities (do they believe the move?))
**Last 20 sessions decomposed (R² 0.32, n=60):** actual -4.9% = HG=F +2.7% · XLE -1.5% · ^GSPC +0.9% · DX-Y.NYB +0.5% · unexplained -7.5%
**Positioning (CFTC WTI-PHYSICAL, 2026-10-27, + = long WTI crude):** managed money +31,128 (+2% OI, 4w -48,464, 13th pct of 3y) · producers +366,392 (+19% OI, 4w +46,853, 96th pct of 3y)
**This week:** 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI

### Gold  `GC=F`  4,135 (2026-11-05)
**Move:** 1w +6.1% · 4w -1.9% (25th pct of 2y 4w moves) · 13w -6.0% · 52w range position 17% (lo 3,899 / hi 5,318)
**Drivers (recent corr):** DFII10 (missing) · DX-Y.NYB -0.36 [textbook] · SI=F +0.93 [textbook] · BTC-USD +0.11 [weak] → **in charge: SI=F** (Precious block)
**Last 20 sessions decomposed (R² 0.79, n=60):** actual -1.9% = SI=F -6.4% · DX-Y.NYB +0.5% · BTC-USD +0.1% · unexplained +3.9%
**Positioning (CFTC GOLD, 2026-10-27, + = long Gold):** managed money +105,562 (+27% OI, 4w -14,756, 25th pct of 3y) · producers -9,574 (-2% OI, 4w +11,689, 99th pct of 3y)
**This week:** 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI

### Silver  `SI=F`  53.17 (2026-11-05)
**Move:** 1w +8.3% · 4w -12.4% (73rd pct of 2y 4w moves) · 13w -16.1% · 52w range position 8% (lo 47.79 / hi 115.1)
**Drivers (recent corr):** GC=F +0.93 [textbook] · HG=F +0.53 [textbook] → **in charge: GC=F** (Gold)
**Last 20 sessions decomposed (R² 0.82, n=60):** actual -13.2% = GC=F -2.6% · HG=F -1.4% · unexplained -9.2%
**Positioning (CFTC SILVER, 2026-10-27, + = long Silver):** managed money +3,321 (+3% OI, 4w -4,293, 4th pct of 3y) · producers -15,231 (-13% OI, 4w +1,281, 94th pct of 3y)
**This week:** 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI

### Copper  `HG=F`  6.427 (2026-11-05)
**Move:** 1w -0.5% · 4w -3.2% (38th pct of 2y 4w moves) · 13w -2.2% · 52w range position 80% (lo 4.938 / hi 6.804)
**Drivers (recent corr):** ^GSPC -0.02 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.01, n=60):** actual -3.3% = ^GSPC -0.2% · unexplained -3.1%
**Positioning (CFTC COPPER- #1, 2026-10-27, + = long Copper):** managed money +40,575 (+12% OI, 4w -37,483, 57th pct of 3y) · producers -65,243 (-19% OI, 4w +39,097, 48th pct of 3y)
**This week:** 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-08 20:30 ET China: CPI · 11-10 06:00 ET United States: NFIB Small Business Optimism

### Nat gas (US)  `NG=F`  2.953 (2026-11-05)
**Move:** 1w +1.9% · 4w -8.3% (44th pct of 2y 4w moves) · 13w +10.9% · 52w range position 9% (lo 2.523 / hi 7.46)
**Drivers (recent corr):** CL=F -0.07 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual -8.7% = CL=F -0.2% · unexplained -8.5%
**Positioning (CFTC NAT GAS NYME, 2026-10-27, + = long Nat gas (US)):** managed money -206,317 (-12% OI, 4w -73,518, 1st pct of 3y) · producers -3,516 (-0% OI, 4w +10,568, 89th pct of 3y)
**This week:** 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI


## 9. Crypto

### Bitcoin  `BTC-USD`  80,539 (2026-11-05)
**Move:** 1w +3.6% · 4w -1.4% (16th pct of 2y 4w moves) · 13w +25.3% · 52w range position 46% (lo 58,559 / hi 105,997)
**Drivers (recent corr):** ^NDX +0.54 [textbook] · DX-Y.NYB +0.07 [weak] · GC=F +0.11 [weak] → **in charge: ^NDX** (Tech / speculation)
**Last 20 sessions decomposed (R² 0.20, n=60):** actual -1.4% = ^NDX -7.5% · DX-Y.NYB +0.2% · GC=F -0.1% · unexplained +5.9%
**Positioning (CFTC BITCOIN, 2026-10-27, + = long Bitcoin):** lev funds -3,979 (-19% OI, 4w +2,877, 100th pct of 3y) · asset mgrs +2,754 (+13% OI, 4w -832, 6th pct of 3y)
**This week:** 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI

