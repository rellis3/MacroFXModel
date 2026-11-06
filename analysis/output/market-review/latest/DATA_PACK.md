# Market Review Data Pack: 2026-11-06

Fetched 2026-11-06T02:47:34+00:00. Descriptive numbers for the weekly review (read with `education/market_reviews/PLAYBOOK.md`). Correlations are of daily moves: last 20 sessions vs the 60 before. They are noisy; a flip is a question, not a signal.

**Data notes:** fred DGS2: The read operation timed out · fred DFII10: The read operation timed out · fred T10YIE: The read operation timed out · fred BAMLH0A0HYM2: The read operation timed out · fred BAMLC0A0CM: The read operation timed out · FRED DGS2 missing: US 2y = US 5y stand-in for this run · No local OAT/Bund futures: French spread proxy unavailable

## 1. Regime gauges: which story is the market trading?

| Pair | Recent | Before | Textbook sign | Status | What it means |
|---|---|---|---|---|---|
| CL=F vs US10Y | -0.16 | +0.24 | + | weak | Oil vs yields: + = oil is an inflation story; - = oil is a growth tax (2008-style) |
| ^NDX vs US10Y | +0.51 | -0.25 | − | INVERTED | Stocks vs yields: - = rates drive stocks; + = growth scare, bonds hedge stocks |
| HYG_TLT vs ^NDX | +0.57 | -0.13 | + | textbook | Credit vs tech: high + = credit and equities are one trade (credit stress leading) |
| DX-Y.NYB vs ^GSPC | -0.16 | +0.04 | − | weak | Dollar vs stocks: - = safe-haven dollar; ~0/+ = "sell America" or liquidity dash |
| AUDUSD=X vs ^NDX | +0.60 | +0.44 | + | textbook | Aussie vs tech: near 0 = AUD trading commodities not risk |
| BTC-USD vs ^NDX | +0.31 | +0.36 | + | textbook | Bitcoin vs tech: high = one liquidity complex |
| XLE vs CL=F | +0.38 | +0.36 | + | textbook | Energy stocks vs oil: falling = equity investors fade the oil move |
| USDJPY=X vs US10Y | +0.65 | +0.24 | + | textbook | Yen vs yields: high = yen is a pure rates trade |

Equity vol vs bond vol: VIX 28.2 (1y pct 99) · MOVE 98 (1y pct 88). When bond vol leads equity vol, the stress is in rates/credit first.

**Fed funds futures (implied average rate by contract month; vs ~1 week earlier):** V6 3.882% (-0.002) · X6 3.880% (+0.000) · Z6 4.020% (+0.005) · F7 4.090% (+0.005) · G7 4.150% (+0.000) · H7 4.215% (+0.000) · J7 4.305% (+0.015) · K7 4.370% (+0.020) · M7 4.430% (+0.020) · N7 4.465% (+0.030) · Q7 4.485% (+0.035) · U7 4.500% (+0.045) · V7 4.510% (+0.045) (as of 2026-10-26)

## 2. G10 FX

### EURUSD  `EURUSD=X`  1.121 (2026-11-06)
**Move:** 1w +0.2% · 4w -0.0% (1st pct of 2y 4w moves) · 13w -2.7% · 52w range position 9% (lo 1.113 / hi 1.202)
**Drivers (recent corr):** US_EA2 +0.11 [weak] · US_DE10 +0.11 [weak] · FR_DE (missing) · ^STOXX50E -0.03 [weak] · BZ=F -0.19 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.05, n=60):** actual -0.0% = US_EA2 +0.2% · ^STOXX50E +0.1% · US_DE10 +0.0% · BZ=F +0.0% · unexplained -0.3%
**Positioning (CFTC EURO FX, 2026-10-27, + = long EURUSD):** lev funds -71,574 (-8% OI, 4w -32,309, 1st pct of 3y) · asset mgrs +173,249 (+20% OI, 4w -47,354, 8th pct of 3y)
**This week:** 11-10 01:30 ET France: French Unemployment Rate · 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 14:00 ET United States: Federal Budget Balance

### USDJPY  `USDJPY=X`  157.9 (2026-11-06)
**Move:** 1w +0.0% · 4w -0.1% (6th pct of 2y 4w moves) · 13w -0.3% · 52w range position 47% (lo 152.5 / hi 163.9)
**Drivers (recent corr):** US10Y +0.65 [textbook] · US_JP10 +0.63 [textbook] · ^NDX +0.53 [textbook] · ^VIX -0.36 [textbook, was INVERTED] → **in charge: US10Y** (US yields: the carry engine)
**Last 20 sessions decomposed (R² 0.13, n=60):** actual -0.1% = US10Y -1.6% · ^NDX -1.0% · ^VIX +0.5% · US_JP10 +0.3% · unexplained +1.6%
**Positioning (CFTC JAPANESE YEN, 2026-10-27, + = long USDJPY):** lev funds +14,630 (+4% OI, 4w +469, 23rd pct of 3y) · asset mgrs -91,191 (-24% OI, 4w -39,557, 9th pct of 3y)
**This week:** 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 14:00 ET United States: Federal Budget Balance

### GBPUSD  `GBPUSD=X`  1.345 (2026-11-06)
**Move:** 1w +0.5% · 4w +1.6% (64th pct of 2y 4w moves) · 13w -0.1% · 52w range position 50% (lo 1.306 / hi 1.383)
**Drivers (recent corr):** US_GB10 -0.00 [weak] · GB10Y -0.13 [weak] · ^GSPC +0.33 [textbook] · EURUSD=X +0.85 [textbook] → **in charge: EURUSD=X** (European block move)
**Last 20 sessions decomposed (R² 0.69, n=60):** actual +1.6% = US_GB10 +0.2% · ^GSPC -0.1% · GB10Y +0.1% · EURUSD=X -0.0% · unexplained +1.5%
**Positioning (CFTC BRITISH POUND, 2026-10-27, + = long GBPUSD):** lev funds +17,195 (+7% OI, 4w +12,589, 18th pct of 3y) · asset mgrs -128,893 (-51% OI, 4w -349, 6th pct of 3y)
**This week:** 11-09 19:01 ET United Kingdom: BRC Retail Sales Monitor · 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 02:00 ET United Kingdom: GDP

### USDCAD  `USDCAD=X`  1.402 (2026-11-06)
**Move:** 1w +0.3% · 4w -1.4% (65th pct of 2y 4w moves) · 13w +0.1% · 52w range position 67% (lo 1.349 / hi 1.428)
**Drivers (recent corr):** CL=F +0.22 [weak] · US_CA2 +0.27 [weak] · ^GSPC -0.37 [textbook] → **in charge: ^GSPC** (Risk appetite (CAD is pro-cyclical))
**Last 20 sessions decomposed (R² 0.30, n=60):** actual -1.4% = US_CA2 -1.5% · ^GSPC +0.7% · CL=F -0.0% · unexplained -0.6%
**Positioning (CFTC CANADIAN DOLLAR, 2026-10-27, + = long USDCAD):** lev funds +96,747 (+27% OI, 4w +27,103, 96th pct of 3y) · asset mgrs +1,325 (+0% OI, 4w -26,256, 15th pct of 3y)
**This week:** 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 14:00 ET United States: Federal Budget Balance

### AUDUSD  `AUDUSD=X`  0.6925 (2026-11-06)
**Move:** 1w -1.5% · 4w -0.5% (20th pct of 2y 4w moves) · 13w -1.5% · 52w range position 59% (lo 0.6449 / hi 0.7255)
**Drivers (recent corr):** HG=F +0.17 [weak] · ^NDX +0.60 [textbook] · GC=F +0.00 [weak] → **in charge: ^NDX** (Global risk proxy)
**Last 20 sessions decomposed (R² 0.21, n=60):** actual -0.5% = ^NDX -2.0% · HG=F -0.0% · GC=F -0.0% · unexplained +1.5%
**Positioning (CFTC AUSTRALIAN DOLLAR, 2026-10-27, + = long AUDUSD):** lev funds +48,414 (+15% OI, 4w -12,178, 85th pct of 3y) · asset mgrs -125,237 (-39% OI, 4w -52,038, 1st pct of 3y)
**This week:** 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 14:00 ET United States: Federal Budget Balance

### NZDUSD  `NZDUSD=X`  0.5587 (2026-11-06)
**Move:** 1w -0.8% · 4w -0.3% (12th pct of 2y 4w moves) · 13w -4.8% · 52w range position 0% (lo 0.5587 / hi 0.6076)
**Drivers (recent corr):** AUDUSD=X +0.53 [textbook] · ^GSPC +0.46 [textbook] · US2Y +0.12 [weak] → **in charge: AUDUSD=X** (Antipodean block)
**Last 20 sessions decomposed (R² 0.42, n=60):** actual -0.3% = US2Y +0.4% · AUDUSD=X -0.3% · ^GSPC -0.1% · unexplained -0.3%
**Positioning (CFTC NZ DOLLAR, 2026-10-27, + = long NZDUSD):** lev funds -22,554 (-17% OI, 4w -21,488, 8th pct of 3y) · asset mgrs -46,841 (-36% OI, 4w -25,613, 11th pct of 3y)
**This week:** 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-10 19:00 ET New Zealand: RBNZ Press Conference · 11-11 16:45 ET New Zealand: Electronic Card Retail Sales

### USDCHF  `USDCHF=X`  0.8171 (2026-11-06)
**Move:** 1w -0.8% · 4w -1.7% (62nd pct of 2y 4w moves) · 13w +0.6% · 52w range position 74% (lo 0.7632 / hi 0.8357)
**Drivers (recent corr):** US10Y +0.46 [textbook] · ^VIX +0.03 [weak] · GC=F +0.15 [weak] → **in charge: US10Y** (US yields)
**Last 20 sessions decomposed (R² 0.28, n=60):** actual -1.7% = US10Y -1.7% · ^VIX +0.5% · GC=F -0.1% · unexplained -0.5%
**Positioning (CFTC SWISS FRANC, 2026-10-27, + = long USDCHF):** lev funds +17,502 (+13% OI, 4w +3,507, 96th pct of 3y) · asset mgrs +25,067 (+19% OI, 4w -11,344, 34th pct of 3y)
**This week:** 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 14:00 ET United States: Federal Budget Balance


## 3. G10 crosses

### AUDNZD  `AUDNZD=X`  1.239 (2026-11-06)
**Move:** 1w -0.7% · 4w -0.2% (14th pct of 2y 4w moves) · 13w +3.4% · 52w range position 87% (lo 1.141 / hi 1.254)
**Drivers (recent corr):** HG=F +0.09 [weak] · ^AXJO -0.16 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.09, n=60):** actual -0.2% = ^AXJO -0.4% · HG=F -0.2% · unexplained +0.4%
**This week:** 11-10 19:00 ET New Zealand: RBNZ Press Conference · 11-11 16:45 ET New Zealand: Electronic Card Retail Sales

### EURGBP  `EURGBP=X`  0.8335 (2026-11-06)
**Move:** 1w -0.3% · 4w -1.6% (87th pct of 2y 4w moves) · 13w -2.7% · 52w range position 0% (lo 0.8335 / hi 0.8842)
**Drivers (recent corr):** GB10Y +0.18 [weak] · FR_DE (missing) → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual -1.7% = GB10Y +0.0% · unexplained -1.7%
**This week:** 11-09 19:01 ET United Kingdom: BRC Retail Sales Monitor · 11-10 01:30 ET France: French Unemployment Rate · 11-12 02:00 ET United Kingdom: GDP · 11-12 02:00 ET United Kingdom: Monthly GDP 3M/3M Change · 11-12 07:00 ET United Kingdom: NIESR Monthly GDP Tracker · 11-13 03:00 ET Spain: Core CPI (cons 3.1%, prev 3.1%)

### EURCHF  `EURCHF=X`  0.9157 (2026-11-06)
**Move:** 1w -0.6% · 4w -1.8% (93rd pct of 2y 4w moves) · 13w -2.2% · 52w range position 30% (lo 0.9023 / hi 0.9466)
**Drivers (recent corr):** ^STOXX50E +0.12 [weak] · FR_DE (missing) · ^VIX -0.21 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.01, n=60):** actual -1.8% = ^STOXX50E +0.0% · ^VIX +0.0% · unexplained -1.9%
**This week:** 11-10 01:30 ET France: French Unemployment Rate · 11-13 03:00 ET Spain: Core CPI (cons 3.1%, prev 3.1%) · 11-13 05:00 ET Euro Zone: Employment Change · 11-13 05:00 ET Euro Zone: GDP (cons 0.4%, prev 0.4%)


## 4. EM FX

### USDMXN  `USDMXN=X`  18.71 (2026-11-06)
**Move:** 1w -0.8% · 4w +2.9% (86th pct of 2y 4w moves) · 13w +8.7% · 52w range position 93% (lo 16.89 / hi 18.85)
**Drivers (recent corr):** ^VIX +0.18 [weak] · ^GSPC -0.16 [weak] · CL=F +0.72 [INVERTED] · USDBRL=X -0.24 [weak] → **in charge: CL=F** (Oil)
**Last 20 sessions decomposed (R² 0.14, n=60):** actual +2.8% = USDBRL=X +0.8% · ^GSPC +0.7% · ^VIX -0.1% · CL=F -0.0% · unexplained +1.4%
**Positioning (CFTC MEXICAN PESO, 2026-10-27, + = long USDMXN):** lev funds -68,335 (-24% OI, 4w +12,252, 7th pct of 3y) · asset mgrs +25,201 (+9% OI, 4w +41,452, 100th pct of 3y)
**This week:** 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 14:00 ET United States: Federal Budget Balance

### USDBRL  `USDBRL=X`  5.504 (2026-11-06)
**Move:** 1w +2.2% · 4w +9.7% (100th pct of 2y 4w moves) · 13w +7.5% · 52w range position 87% (lo 4.906 / hi 5.59)
**Drivers (recent corr):** ^VIX +0.05 [weak] · HG=F +0.30 [INVERTED] · EWZ -0.95 [textbook] → **in charge: EWZ** (Brazil equities (local flows))
**Last 20 sessions decomposed (R² 0.86, n=60):** actual +9.2% = EWZ +9.2% · ^VIX +0.4% · HG=F +0.2% · unexplained -0.6%
**Positioning (CFTC BRAZILIAN REAL, 2026-10-27, + = long USDBRL):** lev funds -7,600 (-5% OI, 4w +1,953, 27th pct of 3y) · asset mgrs -52,010 (-31% OI, 4w +15,005, 43rd pct of 3y)
**This week:** 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 06:00 ET Brazil: BCB Copom Meeting Minutes · 11-10 08:30 ET United States: Core CPI · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 07:00 ET Brazil: CPI

### USDZAR  `USDZAR=X`  16.5 (2026-11-06)
**Move:** 1w -0.7% · 4w -0.6% (18th pct of 2y 4w moves) · 13w +0.9% · 52w range position 48% (lo 15.71 / hi 17.35)
**Drivers (recent corr):** GC=F -0.06 [weak] · ^VIX +0.54 [textbook] · HG=F +0.09 [weak] → **in charge: ^VIX** (Carry / risk)
**Last 20 sessions decomposed (R² 0.17, n=60):** actual -0.6% = ^VIX +1.4% · HG=F -0.2% · GC=F +0.2% · unexplained -2.0%
**Positioning (CFTC SO AFRICAN RAND, 2026-10-27, + = long USDZAR):** lev funds -5,262 (-14% OI, 4w -608, 22nd pct of 3y) · asset mgrs -16,859 (-45% OI, 4w +3,861, 27th pct of 3y)
**This week:** 11-10 04:30 ET South Africa: Unemployment Rate · 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 14:00 ET United States: Federal Budget Balance

### USDKRW  `USDKRW=X`  1,357 (2026-11-06)
**Move:** 1w +1.4% · 4w +1.1% (36th pct of 2y 4w moves) · 13w -4.6% · 52w range position 15% (lo 1,324 / hi 1,552)
**Drivers (recent corr):** ^KS11 +0.08 [weak] · SOXX -0.32 [textbook] · DX-Y.NYB +0.14 [weak] → **in charge: SOXX** (Global semis cycle)
**Last 20 sessions decomposed (R² 0.13, n=60):** actual +1.1% = SOXX +2.3% · ^KS11 -1.8% · DX-Y.NYB -0.2% · unexplained +0.7%
**This week:** 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-10 18:00 ET South Korea: Unemployment Rate · 11-12 14:00 ET United States: Federal Budget Balance


## 5. CE3 FX

### EURCZK  `EURCZK=X`  24.33 (2026-11-06)
**Move:** 1w -0.0% · 4w -0.1% (22nd pct of 2y 4w moves) · 13w +0.4% · 52w range position 57% (lo 24.07 / hi 24.53)
**Drivers (recent corr):** ^STOXX50E -0.37 [textbook] · EURPLN=X +0.67 [textbook] → **in charge: EURPLN=X** (CE3 block)
**Last 20 sessions decomposed (R² 0.30, n=60):** actual -0.1% = EURPLN=X +0.2% · ^STOXX50E -0.0% · unexplained -0.3%
**This week:** 11-10 01:30 ET France: French Unemployment Rate · 11-13 03:00 ET Spain: Core CPI (cons 3.1%, prev 3.1%) · 11-13 05:00 ET Euro Zone: Employment Change · 11-13 05:00 ET Euro Zone: GDP (cons 0.4%, prev 0.4%)

### EURPLN  `EURPLN=X`  4.402 (2026-11-06)
**Move:** 1w +0.3% · 4w +0.6% (59th pct of 2y 4w moves) · 13w +2.5% · 52w range position 95% (lo 4.197 / hi 4.412)
**Drivers (recent corr):** ^STOXX50E -0.32 [textbook] · ^VIX +0.49 [textbook] → **in charge: ^VIX** (Risk)
**Last 20 sessions decomposed (R² 0.19, n=60):** actual +0.6% = ^VIX +0.5% · ^STOXX50E -0.1% · unexplained +0.2%
**This week:** 11-10 01:30 ET France: French Unemployment Rate · 11-13 03:00 ET Spain: Core CPI (cons 3.1%, prev 3.1%) · 11-13 05:00 ET Euro Zone: Employment Change · 11-13 05:00 ET Euro Zone: GDP (cons 0.4%, prev 0.4%)


## 6. Equities

### S&P 500  `^GSPC`  7,354 (2026-11-06)
**Move:** 1w -3.0% · 4w -5.9% (88th pct of 2y 4w moves) · 13w -5.2% · 52w range position 68% (lo 6,344 / hi 7,819)
**Drivers (recent corr):** US10Y +0.32 [INVERTED, was textbook] · HYG_TLT +0.39 [textbook] · DX-Y.NYB -0.16 [weak] · CL=F -0.42 [textbook] · ^VIX -0.97 [textbook] → **in charge: ^VIX** (Vol)
**Last 20 sessions decomposed (R² 0.85, n=60):** actual -6.0% = ^VIX -5.4% · HYG_TLT -1.3% · US10Y +1.3% · DX-Y.NYB -0.1% · CL=F +0.0% · unexplained -0.5%
**Positioning (CFTC E-MINI S&P 500, 2026-10-27, + = long S&P 500):** lev funds -400,604 (-20% OI, 4w -28,115, 27th pct of 3y) · asset mgrs +923,449 (+47% OI, 4w +19,446, 45th pct of 3y)
**This week:** 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 14:00 ET United States: Federal Budget Balance

### Nasdaq 100  `^NDX`  26,630 (2026-11-06)
**Move:** 1w -6.2% · 4w -13.8% (96th pct of 2y 4w moves) · 13w -10.4% · 52w range position 44% (lo 22,953 / hi 31,224)
**Drivers (recent corr):** US10Y +0.51 [INVERTED] · SOXX +0.94 [textbook] · HYG_TLT +0.57 [textbook] · BTC-USD +0.31 [textbook] → **in charge: SOXX** (Semis / AI capex)
**Last 20 sessions decomposed (R² 0.84, n=60):** actual -14.8% = SOXX -13.6% · US10Y +1.6% · HYG_TLT -1.0% · BTC-USD -0.7% · unexplained -1.2%
**Positioning (CFTC NASDAQ MINI, 2026-10-27, + = long Nasdaq 100):** lev funds +2,301 (+1% OI, 4w +27,024, 95th pct of 3y) · asset mgrs +65,381 (+24% OI, 4w -4,363, 25th pct of 3y)
**This week:** 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 14:00 ET United States: Federal Budget Balance

### Russell 2000  `^RUT`  2,730 (2026-11-06)
**Move:** 1w -2.9% · 4w -2.7% (38th pct of 2y 4w moves) · 13w -10.0% · 52w range position 56% (lo 2,305 / hi 3,068)
**Drivers (recent corr):** US2Y +0.15 [weak] · HYG_TLT +0.18 [weak] · ^GSPC +0.90 [textbook] → **in charge: ^GSPC** (Beta)
**Last 20 sessions decomposed (R² 0.74, n=60):** actual -2.8% = ^GSPC -6.1% · US2Y +1.6% · HYG_TLT +0.4% · unexplained +1.4%
**This week:** 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 14:00 ET United States: Federal Budget Balance

### Euro Stoxx 50  `^STOXX50E`  6,232 (2026-11-06)
**Move:** 1w +1.6% · 4w +0.9% (19th pct of 2y 4w moves) · 13w -4.5% · 52w range position 70% (lo 5,501 / hi 6,551)
**Drivers (recent corr):** FR_DE (missing) · ^GSPC +0.45 [textbook] · BZ=F -0.41 [textbook] · EURUSD=X -0.03 [weak] → **in charge: ^GSPC** (US lead)
**Last 20 sessions decomposed (R² 0.27, n=60):** actual +0.9% = ^GSPC -1.9% · BZ=F +0.3% · EURUSD=X -0.0% · unexplained +2.5%
**This week:** 11-10 01:30 ET France: French Unemployment Rate · 11-13 03:00 ET Spain: Core CPI (cons 3.1%, prev 3.1%) · 11-13 05:00 ET Euro Zone: Employment Change · 11-13 05:00 ET Euro Zone: GDP (cons 0.4%, prev 0.4%)

### CAC 40  `^FCHI`  8,205 (2026-11-06)
**Move:** 1w +3.0% · 4w +5.2% (83rd pct of 2y 4w moves) · 13w -5.8% · 52w range position 51% (lo 7,666 / hi 8,726)
**Drivers (recent corr):** FR_DE (missing) · ^STOXX50E +0.87 [textbook] → **in charge: ^STOXX50E** (European block)
**Last 20 sessions decomposed (R² 0.77, n=60):** actual +5.0% = ^STOXX50E +0.8% · unexplained +4.2%
**This week:** 11-10 01:30 ET France: French Unemployment Rate · 11-13 03:00 ET Spain: Core CPI (cons 3.1%, prev 3.1%) · 11-13 05:00 ET Euro Zone: Employment Change · 11-13 05:00 ET Euro Zone: GDP (cons 0.4%, prev 0.4%)

### DAX  `^GDAXI`  26,325 (2026-11-06)
**Move:** 1w +2.0% · 4w +4.9% (77th pct of 2y 4w moves) · 13w +0.0% · 52w range position 94% (lo 22,301 / hi 26,570)
**Drivers (recent corr):** DE10Y +0.24 [weak] · ^GSPC +0.45 [textbook] → **in charge: ^GSPC** (Global risk)
**Last 20 sessions decomposed (R² 0.25, n=60):** actual +4.8% = ^GSPC -2.5% · DE10Y +0.8% · unexplained +6.5%
**This week:** 11-10 01:30 ET France: French Unemployment Rate · 11-13 03:00 ET Spain: Core CPI (cons 3.1%, prev 3.1%) · 11-13 05:00 ET Euro Zone: Employment Change · 11-13 05:00 ET Euro Zone: GDP (cons 0.4%, prev 0.4%)

### FTSE 100  `^FTSE`  10,783 (2026-11-06)
**Move:** 1w +0.5% · 4w +2.2% (52nd pct of 2y 4w moves) · 13w -1.1% · 52w range position 91% (lo 9,507 / hi 10,911)
**Drivers (recent corr):** BZ=F -0.30 [INVERTED] · GBPUSD=X -0.00 [weak] · GB10Y -0.49 [textbook] → **in charge: GB10Y** (Gilts)
**Last 20 sessions decomposed (R² 0.35, n=60):** actual +2.2% = GB10Y +1.5% · BZ=F +0.2% · GBPUSD=X +0.1% · unexplained +0.4%
**This week:** 11-09 19:01 ET United Kingdom: BRC Retail Sales Monitor · 11-12 02:00 ET United Kingdom: GDP · 11-12 02:00 ET United Kingdom: Monthly GDP 3M/3M Change · 11-12 07:00 ET United Kingdom: NIESR Monthly GDP Tracker

### Nikkei 225  `^N225`  57,859 (2026-11-06)
**Move:** 1w -8.6% · 4w -16.2% (99th pct of 2y 4w moves) · 13w -11.8% · 52w range position 39% (lo 48,538 / hi 72,366)
**Drivers (recent corr):** USDJPY=X +0.29 [weak] · ^NDX +0.52 [textbook] · SOXX +0.53 [textbook] → **in charge: SOXX** (Chips (prior US day))
**Last 20 sessions decomposed (R² 0.25, n=60):** actual -17.7% = ^NDX -4.8% · SOXX -4.2% · USDJPY=X +0.0% · unexplained -8.7%

### KOSPI  `^KS11`  5,156 (2026-11-06)
**Move:** 1w -10.0% · 4w -22.2% (94th pct of 2y 4w moves) · 13w -17.6% · 52w range position 25% (lo 3,846 / hi 9,115)
**Drivers (recent corr):** SOXX +0.30 [weak] · ^NDX +0.17 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.15, n=60):** actual -25.1% = SOXX -22.9% · ^NDX +12.4% · unexplained -14.6%
**This week:** 11-10 18:00 ET South Korea: Unemployment Rate

### Hang Seng  `^HSI`  24,673 (2026-11-06)
**Move:** 1w +5.9% · 4w +1.9% (28th pct of 2y 4w moves) · 13w -3.9% · 52w range position 38% (lo 22,672 / hi 27,968)
**Drivers (recent corr):** ^NDX -0.02 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual +1.9% = ^NDX -0.0% · unexplained +1.9%
**This week:** 11-08 20:30 ET China: CPI · 11-13 03:30 ET Hong Kong: GDP (cons 1.9%, prev 1.9%)

### ASX 200  `^AXJO`  8,977 (2026-11-06)
**Move:** 1w +0.8% · 4w +3.0% (66th pct of 2y 4w moves) · 13w -3.1% · 52w range position 68% (lo 8,366 / hi 9,272)
**Drivers (recent corr):** HG=F +0.40 [textbook] · ^GSPC +0.55 [textbook] → **in charge: ^GSPC** (US lead (prior US day))
**Last 20 sessions decomposed (R² 0.24, n=60):** actual +2.9% = ^GSPC -1.4% · HG=F -0.8% · unexplained +5.2%


## 7. Rates

### US 2y  `US2Y`  4.61% (2026-11-06)
**Move:** 1w -11bp · 4w -41bp (95th pct of 2y 4w moves) · 13w +25bp · 52w range position 69% (lo 3.512 / hi 5.089)
**Drivers (recent corr):** CL=F -0.22 [weak] · ^GSPC +0.43 [textbook, was INVERTED] → **in charge: ^GSPC** (Risk-on = fewer cuts / more hikes)
**Last 20 sessions decomposed (R² 0.01, n=60):** actual -41bp = ^GSPC -5bp · CL=F -0bp · unexplained -37bp
**Positioning (CFTC UST 2Y NOTE, 2026-10-27, + = long US 2y):** lev funds +1,357,658 (+30% OI, 4w +191,678, 10th pct of 3y) · asset mgrs -1,837,491 (-41% OI, 4w -199,013, 65th pct of 3y)
**This week:** 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 14:00 ET United States: Federal Budget Balance

### US 10y  `US10Y`  4.84% (2026-11-06)
**Move:** 1w -9bp · 4w -41bp (96th pct of 2y 4w moves) · 13w +18bp · 52w range position 65% (lo 3.962 / hi 5.311)
**Drivers (recent corr):** CL=F -0.16 [weak] · ^NDX +0.51 [INVERTED] · T10YIE (missing) · DE10Y +0.35 [textbook] → **in charge: ^NDX** (Textbook: yields up hurt stocks; + means bonds hedge stocks)
**Last 20 sessions decomposed (R² 0.11, n=60):** actual -41bp = ^NDX -15bp · DE10Y -4bp · CL=F -0bp · unexplained -21bp
**Positioning (CFTC UST 10Y NOTE, 2026-10-27, + = long US 10y):** lev funds +2,227,275 (+38% OI, 4w +190,843, 83rd pct of 3y) · asset mgrs -3,000,164 (-51% OI, 4w -223,633, 1st pct of 3y)
**This week:** 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 14:00 ET United States: Federal Budget Balance

### US 30y  `US30Y`  5.25% (2026-11-06)
**Move:** 1w -6bp · 4w -35bp (95th pct of 2y 4w moves) · 13w +4bp · 52w range position 60% (lo 4.633 / hi 5.665)
**Drivers (recent corr):** US2Y +0.88 [textbook] · T10YIE (missing) → **in charge: US2Y** (Front end)
**Last 20 sessions decomposed (R² 0.66, n=60):** actual -35bp = US2Y -28bp · unexplained -7bp
**Positioning (CFTC UST BOND, 2026-10-27, + = long US 30y):** lev funds +150,393 (+8% OI, 4w -101,002, 1st pct of 3y) · asset mgrs -383,981 (-20% OI, 4w +52,975, 97th pct of 3y)
**This week:** 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 14:00 ET United States: Federal Budget Balance

### Bund 10y  `DE10Y`  3.31% (2026-11-06)
**Move:** 1w -7bp · 4w -19bp (74th pct of 2y 4w moves) · 13w +14bp · 52w range position 64% (lo 2.68 / hi 3.66)
**Drivers (recent corr):** US10Y +0.35 [textbook] · BZ=F -0.15 [weak] · FR_DE (missing) → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.04, n=60):** actual -19bp = US10Y -7bp · BZ=F -0bp · unexplained -11bp
**This week:** 11-10 01:30 ET France: French Unemployment Rate · 11-13 03:00 ET Spain: Core CPI (cons 3.1%, prev 3.1%) · 11-13 05:00 ET Euro Zone: Employment Change · 11-13 05:00 ET Euro Zone: GDP (cons 0.4%, prev 0.4%)

### Gilt 10y  `GB10Y`  5.23% (2026-11-06)
**Move:** 1w -5bp · 4w -21bp (79th pct of 2y 4w moves) · 13w +24bp · 52w range position 78% (lo 4.352 / hi 5.478)
**Drivers (recent corr):** US10Y +0.63 [textbook] · GBPUSD=X -0.13 [weak] → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.35, n=60):** actual -21bp = US10Y -22bp · GBPUSD=X -2bp · unexplained +3bp
**This week:** 11-09 19:01 ET United Kingdom: BRC Retail Sales Monitor · 11-12 02:00 ET United Kingdom: GDP · 11-12 02:00 ET United Kingdom: Monthly GDP 3M/3M Change · 11-12 07:00 ET United Kingdom: NIESR Monthly GDP Tracker

### JGB 10y  `JP10Y`  2.81% (2026-11-06)
**Move:** 1w -1bp · 4w -22bp (90th pct of 2y 4w moves) · 13w +0bp · 52w range position 79% (lo 1.688 / hi 3.111)
**Drivers (recent corr):** US10Y +0.56 [textbook] · USDJPY=X +0.64 [textbook] → **in charge: USDJPY=X** (Weak yen -> BoJ pressure)
**Last 20 sessions decomposed (R² 0.50, n=60):** actual -22bp = US10Y -12bp · USDJPY=X -0bp · unexplained -10bp

### Canada 10y  `CA10Y`  3.70% (2026-11-06)
**Move:** 1w -8bp · 4w -16bp (65th pct of 2y 4w moves) · 13w +6bp · 52w range position 67% (lo 3.12 / hi 3.99)
**Drivers (recent corr):** US10Y +0.84 [textbook] · CL=F +0.11 [weak] → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.67, n=60):** actual -16bp = US10Y -28bp · CL=F -0bp · unexplained +12bp

### French spread (proxy)
_no data_


## 8. Commodities

### WTI crude  `CL=F`  91.67 (2026-11-06)
**Move:** 1w -12.0% · 4w -0.2% (3rd pct of 2y 4w moves) · 13w +17.3% · 52w range position 63% (lo 55.27 / hi 112.9)
**Drivers (recent corr):** XLE +0.38 [textbook] · ^GSPC -0.42 [INVERTED] · HG=F -0.34 [INVERTED] · DX-Y.NYB +0.04 [weak] → **in charge: ^GSPC** (Demand (- = supply shock))
**Last 20 sessions decomposed (R² 0.33, n=60):** actual -0.2% = ^GSPC +5.3% · HG=F +4.4% · XLE -2.9% · DX-Y.NYB +0.4% · unexplained -7.6%
**Positioning (CFTC WTI-PHYSICAL, 2026-10-27, + = long WTI crude):** managed money +31,128 (+2% OI, 4w -48,464, 13th pct of 3y) · producers +366,392 (+19% OI, 4w +46,853, 96th pct of 3y)
**This week:** 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 14:00 ET United States: Federal Budget Balance

### Gold  `GC=F`  4,075 (2026-11-06)
**Move:** 1w +4.5% · 4w -3.4% (39th pct of 2y 4w moves) · 13w -7.4% · 52w range position 12% (lo 3,899 / hi 5,318)
**Drivers (recent corr):** DFII10 (missing) · DX-Y.NYB -0.20 [weak] · SI=F +0.91 [textbook] · BTC-USD +0.30 [weak] → **in charge: SI=F** (Precious block)
**Last 20 sessions decomposed (R² 0.77, n=60):** actual -3.4% = SI=F -7.2% · DX-Y.NYB +0.3% · BTC-USD +0.2% · unexplained +3.4%
**Positioning (CFTC GOLD, 2026-10-27, + = long Gold):** managed money +105,562 (+27% OI, 4w -14,756, 25th pct of 3y) · producers -9,574 (-2% OI, 4w +11,689, 99th pct of 3y)
**This week:** 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 14:00 ET United States: Federal Budget Balance

### Silver  `SI=F`  52.03 (2026-11-06)
**Move:** 1w +6.0% · 4w -14.2% (77th pct of 2y 4w moves) · 13w -17.8% · 52w range position 6% (lo 48.02 / hi 115.1)
**Drivers (recent corr):** GC=F +0.91 [textbook] · HG=F +0.49 [textbook] → **in charge: GC=F** (Gold)
**Last 20 sessions decomposed (R² 0.80, n=60):** actual -15.4% = GC=F -4.6% · HG=F -2.3% · unexplained -8.5%
**Positioning (CFTC SILVER, 2026-10-27, + = long Silver):** managed money +3,321 (+3% OI, 4w -4,293, 4th pct of 3y) · producers -15,231 (-13% OI, 4w +1,281, 94th pct of 3y)
**This week:** 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 14:00 ET United States: Federal Budget Balance

### Copper  `HG=F`  6.283 (2026-11-06)
**Move:** 1w -2.7% · 4w -5.4% (57th pct of 2y 4w moves) · 13w -4.4% · 52w range position 72% (lo 4.938 / hi 6.804)
**Drivers (recent corr):** ^GSPC +0.18 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.03, n=60):** actual -5.6% = ^GSPC -1.7% · unexplained -3.8%
**Positioning (CFTC COPPER- #1, 2026-10-27, + = long Copper):** managed money +40,575 (+12% OI, 4w -37,483, 57th pct of 3y) · producers -65,243 (-19% OI, 4w +39,097, 48th pct of 3y)
**This week:** 11-08 20:30 ET China: CPI · 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 14:00 ET United States: Federal Budget Balance

### Nat gas (US)  `NG=F`  3.004 (2026-11-06)
**Move:** 1w +3.7% · 4w -6.7% (34th pct of 2y 4w moves) · 13w +12.8% · 52w range position 10% (lo 2.523 / hi 7.46)
**Drivers (recent corr):** CL=F -0.03 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual -6.9% = CL=F -0.0% · unexplained -6.9%
**Positioning (CFTC NAT GAS NYME, 2026-10-27, + = long Nat gas (US)):** managed money -206,317 (-12% OI, 4w -73,518, 1st pct of 3y) · producers -3,516 (-0% OI, 4w +10,568, 89th pct of 3y)
**This week:** 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 14:00 ET United States: Federal Budget Balance


## 9. Crypto

### Bitcoin  `BTC-USD`  76,098 (2026-11-06)
**Move:** 1w -1.4% · 4w -7.8% (55th pct of 2y 4w moves) · 13w +17.3% · 52w range position 37% (lo 58,559 / hi 105,997)
**Drivers (recent corr):** ^NDX +0.31 [textbook] · DX-Y.NYB -0.10 [weak] · GC=F +0.30 [weak] → **in charge: ^NDX** (Tech / speculation)
**Last 20 sessions decomposed (R² 0.14, n=60):** actual -8.1% = ^NDX -10.0% · GC=F -0.6% · DX-Y.NYB -0.0% · unexplained +2.5%
**Positioning (CFTC BITCOIN, 2026-10-27, + = long Bitcoin):** lev funds -3,979 (-19% OI, 4w +2,877, 100th pct of 3y) · asset mgrs +2,754 (+13% OI, 4w -832, 6th pct of 3y)
**This week:** 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 14:00 ET United States: Federal Budget Balance

