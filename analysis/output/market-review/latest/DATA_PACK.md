# Market Review Data Pack: 2026-11-17

Fetched 2026-11-17T04:45:12+00:00. Descriptive numbers for the weekly review (read with `education/market_reviews/PLAYBOOK.md`). Correlations are of daily moves: last 20 sessions vs the 60 before. They are noisy; a flip is a question, not a signal.

**Data notes:** fred DGS2: The read operation timed out · fred DFII10: The read operation timed out · fred T10YIE: The read operation timed out · fred BAMLH0A0HYM2: The read operation timed out · fred BAMLC0A0CM: The read operation timed out · FRED DGS2 missing: US 2y = US 5y stand-in for this run · No local OAT/Bund futures: French spread proxy unavailable

## 1. Regime gauges: which story is the market trading?

| Pair | Recent | Before | Textbook sign | Status | What it means |
|---|---|---|---|---|---|
| CL=F vs US10Y | +0.02 | +0.17 | + | weak | Oil vs yields: + = oil is an inflation story; - = oil is a growth tax (2008-style) |
| ^NDX vs US10Y | +0.45 | -0.21 | − | INVERTED | Stocks vs yields: - = rates drive stocks; + = growth scare, bonds hedge stocks |
| HYG_TLT vs ^NDX | +0.52 | -0.02 | + | textbook | Credit vs tech: high + = credit and equities are one trade (credit stress leading) |
| DX-Y.NYB vs ^GSPC | -0.14 | +0.11 | − | weak | Dollar vs stocks: - = safe-haven dollar; ~0/+ = "sell America" or liquidity dash |
| AUDUSD=X vs ^NDX | +0.53 | +0.40 | + | textbook | Aussie vs tech: near 0 = AUD trading commodities not risk |
| BTC-USD vs ^NDX | +0.55 | +0.34 | + | textbook | Bitcoin vs tech: high = one liquidity complex |
| XLE vs CL=F | +0.48 | +0.30 | + | textbook | Energy stocks vs oil: falling = equity investors fade the oil move |
| USDJPY=X vs US10Y | +0.66 | +0.21 | + | textbook | Yen vs yields: high = yen is a pure rates trade |

Equity vol vs bond vol: VIX 22.9 (1y pct 89) · MOVE 101 (1y pct 92). When bond vol leads equity vol, the stress is in rates/credit first.

## 2. G10 FX

### EURUSD  `EURUSD=X`  1.101 (2026-11-17)
**Move:** 1w -1.4% · 4w -2.0% (74th pct of 2y 4w moves) · 13w -4.9% · 52w range position 0% (lo 1.101 / hi 1.202)
**Drivers (recent corr):** US_EA2 -0.13 [weak] · US_DE10 -0.09 [weak] · FR_DE (missing) · ^STOXX50E -0.03 [weak] · BZ=F -0.19 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.06, n=60):** actual -2.0% = BZ=F +0.2% · ^STOXX50E +0.1% · US_EA2 +0.0% · US_DE10 +0.0% · unexplained -2.3%
**Positioning (CFTC EURO FX, 2026-11-10, + = long EURUSD):** lev funds -71,676 (-8% OI, 4w -3,675, 1st pct of 3y) · asset mgrs +165,477 (+19% OI, 4w -34,441, 8th pct of 3y)
**This week:** 11-18 05:00 ET Euro Zone: Core CPI (cons 2.5%, prev 2.5%) · 11-18 05:00 ET Euro Zone: CPI (cons 4.0%, prev 4.0%) · 11-18 14:00 ET United States: FOMC Meeting Minutes

### USDJPY  `USDJPY=X`  159.3 (2026-11-17)
**Move:** 1w +0.4% · 4w +0.6% (24th pct of 2y 4w moves) · 13w -0.2% · 52w range position 60% (lo 152.5 / hi 163.9)
**Drivers (recent corr):** US10Y +0.66 [textbook] · US_JP10 +0.43 [textbook] · ^NDX +0.66 [textbook] · ^VIX -0.55 [textbook] → **in charge: ^NDX** (Risk appetite: carry trades fund in yen)
**Last 20 sessions decomposed (R² 0.17, n=60):** actual +0.6% = ^NDX -0.6% · ^VIX +0.1% · US10Y +0.0% · US_JP10 -0.0% · unexplained +1.1%
**Positioning (CFTC JAPANESE YEN, 2026-11-10, + = long USDJPY):** lev funds +16,855 (+4% OI, 4w -16,818, 25th pct of 3y) · asset mgrs -90,344 (-23% OI, 4w -24,525, 10th pct of 3y)
**This week:** 11-18 14:00 ET United States: FOMC Meeting Minutes · 11-19 18:30 ET Japan: National Core CPI (cons 2.3%, prev 2.1%)

### GBPUSD  `GBPUSD=X`  1.319 (2026-11-17)
**Move:** 1w -1.2% · 4w -1.3% (53rd pct of 2y 4w moves) · 13w -2.5% · 52w range position 17% (lo 1.306 / hi 1.383)
**Drivers (recent corr):** US_GB10 -0.06 [weak] · GB10Y -0.57 [INVERTED] · ^GSPC +0.04 [weak] · EURUSD=X +0.94 [textbook] → **in charge: EURUSD=X** (European block move)
**Last 20 sessions decomposed (R² 0.73, n=60):** actual -1.4% = EURUSD=X -1.7% · US_GB10 -0.1% · ^GSPC -0.1% · GB10Y +0.1% · unexplained +0.6%
**Positioning (CFTC BRITISH POUND, 2026-11-10, + = long GBPUSD):** lev funds +34,495 (+16% OI, 4w +24,182, 57th pct of 3y) · asset mgrs -105,960 (-48% OI, 4w +39,775, 20th pct of 3y)
**This week:** 11-18 02:00 ET United Kingdom: Core CPI (cons 2.8%, prev 2.8%) · 11-18 02:00 ET United Kingdom: CPI · 11-18 14:00 ET United States: FOMC Meeting Minutes · 11-20 02:00 ET United Kingdom: Core Retail Sales · 11-20 02:00 ET United Kingdom: Retail Sales (cons 0.0%, prev -0.4%)

### USDCAD  `USDCAD=X`  1.43 (2026-11-17)
**Move:** 1w +0.8% · 4w +1.7% (73rd pct of 2y 4w moves) · 13w +2.9% · 52w range position 100% (lo 1.349 / hi 1.43)
**Drivers (recent corr):** CL=F -0.05 [weak] · US_CA2 +0.24 [weak] · ^GSPC +0.05 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.18, n=60):** actual +1.7% = ^GSPC +0.2% · US_CA2 -0.1% · CL=F +0.0% · unexplained +1.6%
**Positioning (CFTC CANADIAN DOLLAR, 2026-11-10, + = long USDCAD):** lev funds +68,205 (+20% OI, 4w -19,907, 68th pct of 3y) · asset mgrs -14,480 (-4% OI, 4w -45,284, 9th pct of 3y)
**This week:** 11-18 14:00 ET United States: FOMC Meeting Minutes · 11-20 08:30 ET Canada: Core Retail Sales (cons 0.7%, prev 1.2%) · 11-20 08:30 ET Canada: Retail Sales (cons 0.7%, prev 1.2%)

### AUDUSD  `AUDUSD=X`  0.6744 (2026-11-17)
**Move:** 1w -1.8% · 4w -3.8% (93rd pct of 2y 4w moves) · 13w -4.8% · 52w range position 37% (lo 0.6449 / hi 0.7255)
**Drivers (recent corr):** HG=F +0.33 [textbook] · ^NDX +0.53 [textbook] · GC=F +0.25 [weak] → **in charge: ^NDX** (Global risk proxy)
**Last 20 sessions decomposed (R² 0.20, n=60):** actual -3.8% = ^NDX -0.9% · HG=F -0.1% · GC=F -0.1% · unexplained -2.7%
**Positioning (CFTC AUSTRALIAN DOLLAR, 2026-11-10, + = long AUDUSD):** lev funds +50,819 (+14% OI, 4w +228, 89th pct of 3y) · asset mgrs -157,207 (-45% OI, 4w -41,287, 1st pct of 3y)
**This week:** 11-18 14:00 ET United States: FOMC Meeting Minutes · 11-18 19:30 ET Australia: Employment Change (cons 25.2K, prev -39.3K) · 11-18 19:30 ET Australia: Full Employment Change · 11-18 19:30 ET Australia: Unemployment Rate (cons 4.7%, prev 4.7%)

### NZDUSD  `NZDUSD=X`  0.5495 (2026-11-17)
**Move:** 1w -2.0% · 4w -3.2% (81st pct of 2y 4w moves) · 13w -6.4% · 52w range position 0% (lo 0.5495 / hi 0.6076)
**Drivers (recent corr):** AUDUSD=X +0.53 [textbook] · ^GSPC +0.45 [textbook] · US2Y -0.04 [weak] → **in charge: AUDUSD=X** (Antipodean block)
**Last 20 sessions decomposed (R² 0.39, n=60):** actual -3.3% = AUDUSD=X -1.8% · ^GSPC -0.3% · US2Y -0.0% · unexplained -1.2%
**Positioning (CFTC NZ DOLLAR, 2026-11-10, + = long NZDUSD):** lev funds -24,832 (-19% OI, 4w -13,213, 7th pct of 3y) · asset mgrs -41,028 (-31% OI, 4w +3,111, 21st pct of 3y)
**This week:** 11-18 14:00 ET United States: FOMC Meeting Minutes · 11-22 16:45 ET New Zealand: Retail Sales · 11-22 16:45 ET New Zealand: Retail Sales Quarterly Vs. Year Ago

### USDCHF  `USDCHF=X`  0.8397 (2026-11-17)
**Move:** 1w +1.8% · 4w +1.7% (62nd pct of 2y 4w moves) · 13w +3.4% · 52w range position 100% (lo 0.7632 / hi 0.8397)
**Drivers (recent corr):** US10Y +0.51 [textbook] · ^VIX -0.23 [weak] · GC=F -0.04 [weak] → **in charge: US10Y** (US yields)
**Last 20 sessions decomposed (R² 0.31, n=60):** actual +1.7% = GC=F -0.1% · ^VIX +0.0% · US10Y +0.0% · unexplained +1.8%
**Positioning (CFTC SWISS FRANC, 2026-11-10, + = long USDCHF):** lev funds +16,070 (+13% OI, 4w +1,129, 92nd pct of 3y) · asset mgrs +13,169 (+10% OI, 4w -18,287, 11th pct of 3y)
**This week:** 11-18 14:00 ET United States: FOMC Meeting Minutes


## 3. G10 crosses

### AUDNZD  `AUDNZD=X`  1.227 (2026-11-17)
**Move:** 1w +0.2% · 4w -0.5% (34th pct of 2y 4w moves) · 13w +1.8% · 52w range position 77% (lo 1.141 / hi 1.254)
**Drivers (recent corr):** HG=F +0.08 [weak] · ^AXJO -0.26 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.09, n=60):** actual -0.5% = HG=F -0.2% · ^AXJO -0.1% · unexplained -0.2%
**This week:** 11-18 19:30 ET Australia: Employment Change (cons 25.2K, prev -39.3K) · 11-18 19:30 ET Australia: Full Employment Change · 11-18 19:30 ET Australia: Unemployment Rate (cons 4.7%, prev 4.7%) · 11-22 16:45 ET New Zealand: Retail Sales · 11-22 16:45 ET New Zealand: Retail Sales Quarterly Vs. Year Ago

### EURGBP  `EURGBP=X`  0.8341 (2026-11-17)
**Move:** 1w -0.3% · 4w -0.6% (45th pct of 2y 4w moves) · 13w -2.5% · 52w range position 1% (lo 0.8336 / hi 0.8834)
**Drivers (recent corr):** GB10Y +0.47 [INVERTED] · FR_DE (missing) → **in charge: GB10Y** (Gilt yields (BoE / UK fiscal))
**Last 20 sessions decomposed (R² 0.00, n=60):** actual -0.6% = GB10Y -0.0% · unexplained -0.6%
**This week:** 11-18 02:00 ET United Kingdom: Core CPI (cons 2.8%, prev 2.8%) · 11-18 02:00 ET United Kingdom: CPI · 11-18 05:00 ET Euro Zone: Core CPI (cons 2.5%, prev 2.5%) · 11-18 05:00 ET Euro Zone: CPI (cons 4.0%, prev 4.0%) · 11-20 02:00 ET United Kingdom: Core Retail Sales · 11-20 02:00 ET United Kingdom: Retail Sales (cons 0.0%, prev -0.4%)

### EURCHF  `EURCHF=X`  0.924 (2026-11-17)
**Move:** 1w +0.3% · 4w -0.3% (21st pct of 2y 4w moves) · 13w -1.7% · 52w range position 49% (lo 0.9023 / hi 0.9466)
**Drivers (recent corr):** ^STOXX50E +0.31 [textbook] · FR_DE (missing) · ^VIX -0.39 [textbook] → **in charge: ^VIX** (Haven flows)
**Last 20 sessions decomposed (R² 0.04, n=60):** actual -0.3% = ^STOXX50E +0.2% · ^VIX -0.1% · unexplained -0.4%
**This week:** 11-18 05:00 ET Euro Zone: Core CPI (cons 2.5%, prev 2.5%) · 11-18 05:00 ET Euro Zone: CPI (cons 4.0%, prev 4.0%)


## 4. EM FX

### USDMXN  `USDMXN=X`  18.5 (2026-11-17)
**Move:** 1w -0.5% · 4w +0.4% (16th pct of 2y 4w moves) · 13w +8.5% · 52w range position 82% (lo 16.89 / hi 18.85)
**Drivers (recent corr):** ^VIX +0.34 [textbook] · ^GSPC -0.30 [weak] · CL=F +0.80 [INVERTED] · USDBRL=X -0.22 [weak] → **in charge: CL=F** (Oil)
**Last 20 sessions decomposed (R² 0.20, n=60):** actual +0.4% = CL=F -0.9% · USDBRL=X +0.7% · ^GSPC +0.3% · ^VIX +0.2% · unexplained +0.1%
**Positioning (CFTC MEXICAN PESO, 2026-11-10, + = long USDMXN):** lev funds -68,019 (-24% OI, 4w -4,455, 8th pct of 3y) · asset mgrs +41,109 (+15% OI, 4w +18,738, 100th pct of 3y)
**This week:** 11-18 14:00 ET United States: FOMC Meeting Minutes

### USDBRL  `USDBRL=X`  5.784 (2026-11-17)
**Move:** 1w +3.6% · 4w +15.2% (100th pct of 2y 4w moves) · 13w +10.9% · 52w range position 100% (lo 4.906 / hi 5.784)
**Drivers (recent corr):** ^VIX +0.14 [weak] · HG=F +0.20 [weak] · EWZ -0.94 [textbook] → **in charge: EWZ** (Brazil equities (local flows))
**Last 20 sessions decomposed (R² 0.86, n=60):** actual +14.1% = EWZ +9.8% · HG=F +0.4% · ^VIX +0.1% · unexplained +3.8%
**Positioning (CFTC BRAZILIAN REAL, 2026-11-10, + = long USDBRL):** lev funds -30,780 (-28% OI, 4w -3,166, 1st pct of 3y) · asset mgrs -39,980 (-36% OI, 4w +15,234, 59th pct of 3y)
**This week:** 11-18 14:00 ET United States: FOMC Meeting Minutes

### USDZAR  `USDZAR=X`  16.96 (2026-11-17)
**Move:** 1w +2.6% · 4w +3.5% (85th pct of 2y 4w moves) · 13w +4.4% · 52w range position 79% (lo 15.71 / hi 17.29)
**Drivers (recent corr):** GC=F -0.42 [textbook] · ^VIX +0.48 [textbook] · HG=F -0.11 [weak] → **in charge: ^VIX** (Carry / risk)
**Last 20 sessions decomposed (R² 0.21, n=60):** actual +3.4% = GC=F +0.6% · ^VIX +0.6% · HG=F -0.3% · unexplained +2.5%
**Positioning (CFTC SO AFRICAN RAND, 2026-11-10, + = long USDZAR):** lev funds -5,638 (-15% OI, 4w -1,090, 22nd pct of 3y) · asset mgrs -14,155 (-37% OI, 4w +3,422, 34th pct of 3y)
**This week:** 11-18 03:00 ET South Africa: Core CPI · 11-18 03:00 ET South Africa: CPI · 11-18 06:00 ET South Africa: Retail Sales · 11-18 14:00 ET United States: FOMC Meeting Minutes · 11-19 08:00 ET South Africa: Interest Rate Decision

### USDKRW  `USDKRW=X`  1,337 (2026-11-17)
**Move:** 1w -0.3% · 4w +1.0% (35th pct of 2y 4w moves) · 13w -5.4% · 52w range position 6% (lo 1,324 / hi 1,552)
**Drivers (recent corr):** ^KS11 +0.04 [weak] · SOXX -0.55 [textbook] · DX-Y.NYB -0.01 [weak] → **in charge: SOXX** (Global semis cycle)
**Last 20 sessions decomposed (R² 0.13, n=60):** actual +1.0% = SOXX +1.0% · DX-Y.NYB +0.5% · ^KS11 -0.4% · unexplained -0.1%
**This week:** 11-18 14:00 ET United States: FOMC Meeting Minutes


## 5. CE3 FX

### EURCZK  `EURCZK=X`  24.41 (2026-11-17)
**Move:** 1w +0.3% · 4w +0.5% (61st pct of 2y 4w moves) · 13w +1.0% · 52w range position 72% (lo 24.07 / hi 24.53)
**Drivers (recent corr):** ^STOXX50E -0.35 [textbook] · EURPLN=X +0.61 [textbook] → **in charge: EURPLN=X** (CE3 block)
**Last 20 sessions decomposed (R² 0.27, n=60):** actual +0.5% = EURPLN=X +0.2% · ^STOXX50E -0.1% · unexplained +0.4%
**This week:** 11-18 05:00 ET Euro Zone: Core CPI (cons 2.5%, prev 2.5%) · 11-18 05:00 ET Euro Zone: CPI (cons 4.0%, prev 4.0%)

### EURPLN  `EURPLN=X`  4.401 (2026-11-17)
**Move:** 1w +0.2% · 4w +0.8% (71st pct of 2y 4w moves) · 13w +1.9% · 52w range position 95% (lo 4.197 / hi 4.412)
**Drivers (recent corr):** ^STOXX50E -0.38 [textbook] · ^VIX +0.46 [textbook] → **in charge: ^VIX** (Risk)
**Last 20 sessions decomposed (R² 0.16, n=60):** actual +0.8% = ^STOXX50E -0.2% · ^VIX +0.2% · unexplained +0.9%
**This week:** 11-18 05:00 ET Euro Zone: Core CPI (cons 2.5%, prev 2.5%) · 11-18 05:00 ET Euro Zone: CPI (cons 4.0%, prev 4.0%)


## 6. Equities

### S&P 500  `^GSPC`  7,417 (2026-11-17)
**Move:** 1w -1.4% · 4w -3.8% (75th pct of 2y 4w moves) · 13w -3.6% · 52w range position 73% (lo 6,344 / hi 7,819)
**Drivers (recent corr):** US10Y +0.31 [INVERTED, was textbook] · HYG_TLT +0.39 [textbook] · DX-Y.NYB -0.14 [weak] · CL=F -0.34 [textbook] · ^VIX -0.97 [textbook] → **in charge: ^VIX** (Vol)
**Last 20 sessions decomposed (R² 0.86, n=60):** actual -3.9% = ^VIX -2.2% · HYG_TLT +0.3% · CL=F +0.3% · DX-Y.NYB +0.1% · US10Y -0.0% · unexplained -2.3%
**Positioning (CFTC E-MINI S&P 500, 2026-11-10, + = long S&P 500):** lev funds -303,060 (-15% OI, 4w +105,666, 71st pct of 3y) · asset mgrs +914,130 (+45% OI, 4w -1,705, 38th pct of 3y)
**This week:** 11-18 14:00 ET United States: FOMC Meeting Minutes

### Nasdaq 100  `^NDX`  27,197 (2026-11-17)
**Move:** 1w -2.0% · 4w -7.8% (84th pct of 2y 4w moves) · 13w -7.8% · 52w range position 51% (lo 22,953 / hi 31,224)
**Drivers (recent corr):** US10Y +0.45 [INVERTED] · SOXX +0.96 [textbook] · HYG_TLT +0.52 [textbook] · BTC-USD +0.55 [textbook] → **in charge: SOXX** (Semis / AI capex)
**Last 20 sessions decomposed (R² 0.90, n=60):** actual -8.1% = SOXX -6.2% · BTC-USD -3.1% · HYG_TLT +0.4% · US10Y -0.0% · unexplained +0.9%
**Positioning (CFTC NASDAQ MINI, 2026-11-10, + = long Nasdaq 100):** lev funds +13,967 (+5% OI, 4w +25,560, 99th pct of 3y) · asset mgrs +72,785 (+25% OI, 4w -2,538, 43rd pct of 3y)
**This week:** 11-18 14:00 ET United States: FOMC Meeting Minutes

### Russell 2000  `^RUT`  2,743 (2026-11-17)
**Move:** 1w -2.8% · 4w -1.1% (14th pct of 2y 4w moves) · 13w -9.1% · 52w range position 57% (lo 2,305 / hi 3,068)
**Drivers (recent corr):** US2Y +0.10 [weak] · HYG_TLT +0.14 [weak] · ^GSPC +0.92 [textbook] → **in charge: ^GSPC** (Beta)
**Last 20 sessions decomposed (R² 0.77, n=60):** actual -1.1% = ^GSPC -4.0% · HYG_TLT -0.1% · US2Y -0.0% · unexplained +3.0%
**This week:** 11-18 14:00 ET United States: FOMC Meeting Minutes

### Euro Stoxx 50  `^STOXX50E`  6,348 (2026-11-17)
**Move:** 1w +0.3% · 4w +3.7% (69th pct of 2y 4w moves) · 13w -1.9% · 52w range position 81% (lo 5,501 / hi 6,551)
**Drivers (recent corr):** FR_DE (missing) · ^GSPC +0.66 [textbook] · BZ=F -0.41 [textbook] · EURUSD=X -0.03 [weak] → **in charge: ^GSPC** (US lead)
**Last 20 sessions decomposed (R² 0.32, n=60):** actual +3.6% = ^GSPC -1.4% · BZ=F +1.4% · EURUSD=X -0.2% · unexplained +3.8%
**This week:** 11-18 05:00 ET Euro Zone: Core CPI (cons 2.5%, prev 2.5%) · 11-18 05:00 ET Euro Zone: CPI (cons 4.0%, prev 4.0%)

### CAC 40  `^FCHI`  8,352 (2026-11-17)
**Move:** 1w +0.9% · 4w +6.6% (89th pct of 2y 4w moves) · 13w -1.8% · 52w range position 65% (lo 7,666 / hi 8,726)
**Drivers (recent corr):** FR_DE (missing) · ^STOXX50E +0.92 [textbook] → **in charge: ^STOXX50E** (European block)
**Last 20 sessions decomposed (R² 0.78, n=60):** actual +6.3% = ^STOXX50E +3.0% · unexplained +3.4%
**This week:** 11-18 05:00 ET Euro Zone: Core CPI (cons 2.5%, prev 2.5%) · 11-18 05:00 ET Euro Zone: CPI (cons 4.0%, prev 4.0%)

### DAX  `^GDAXI`  26,599 (2026-11-17)
**Move:** 1w +1.0% · 4w +5.1% (80th pct of 2y 4w moves) · 13w +1.8% · 52w range position 96% (lo 22,301 / hi 26,772)
**Drivers (recent corr):** DE10Y +0.36 [INVERTED] · ^GSPC +0.58 [textbook] → **in charge: ^GSPC** (Global risk)
**Last 20 sessions decomposed (R² 0.23, n=60):** actual +5.0% = ^GSPC -1.7% · DE10Y +0.0% · unexplained +6.6%
**This week:** 11-18 05:00 ET Euro Zone: Core CPI (cons 2.5%, prev 2.5%) · 11-18 05:00 ET Euro Zone: CPI (cons 4.0%, prev 4.0%)

### FTSE 100  `^FTSE`  10,882 (2026-11-17)
**Move:** 1w +1.2% · 4w +1.4% (35th pct of 2y 4w moves) · 13w +1.4% · 52w range position 98% (lo 9,507 / hi 10,911)
**Drivers (recent corr):** BZ=F -0.44 [INVERTED] · GBPUSD=X +0.07 [weak] · GB10Y -0.48 [textbook] → **in charge: GB10Y** (Gilts)
**Last 20 sessions decomposed (R² 0.36, n=60):** actual +1.4% = GB10Y +0.9% · BZ=F +0.4% · GBPUSD=X +0.2% · unexplained -0.2%
**This week:** 11-18 02:00 ET United Kingdom: Core CPI (cons 2.8%, prev 2.8%) · 11-18 02:00 ET United Kingdom: CPI · 11-20 02:00 ET United Kingdom: Core Retail Sales · 11-20 02:00 ET United Kingdom: Retail Sales (cons 0.0%, prev -0.4%)

### Nikkei 225  `^N225`  58,919 (2026-11-17)
**Move:** 1w -2.5% · 4w -8.0% (77th pct of 2y 4w moves) · 13w -12.7% · 52w range position 44% (lo 48,538 / hi 72,366)
**Drivers (recent corr):** USDJPY=X +0.42 [textbook] · ^NDX +0.63 [textbook] · SOXX +0.65 [textbook] → **in charge: SOXX** (Chips (prior US day))
**Last 20 sessions decomposed (R² 0.32, n=60):** actual -8.4% = SOXX -3.2% · ^NDX -1.8% · USDJPY=X -0.1% · unexplained -3.4%
**This week:** 11-19 18:30 ET Japan: National Core CPI (cons 2.3%, prev 2.1%)

### KOSPI  `^KS11`  5,008 (2026-11-17)
**Move:** 1w -4.4% · 4w -9.8% (65th pct of 2y 4w moves) · 13w -27.1% · 52w range position 22% (lo 3,846 / hi 9,115)
**Drivers (recent corr):** SOXX +0.49 [textbook] · ^NDX +0.41 [textbook] → **in charge: SOXX** (Memory / AI hardware (prior US day))
**Last 20 sessions decomposed (R² 0.24, n=60):** actual -10.3% = SOXX -12.7% · ^NDX +8.1% · unexplained -5.7%

### Hang Seng  `^HSI`  23,572 (2026-11-17)
**Move:** 1w -4.0% · 4w -1.2% (20th pct of 2y 4w moves) · 13w -7.5% · 52w range position 17% (lo 22,672 / hi 27,968)
**Drivers (recent corr):** ^NDX +0.05 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.01, n=60):** actual -1.2% = ^NDX -0.4% · unexplained -0.8%
**This week:** 11-20 03:30 ET Hong Kong: CPI

### ASX 200  `^AXJO`  8,893 (2026-11-17)
**Move:** 1w -2.6% · 4w +0.9% (17th pct of 2y 4w moves) · 13w -2.0% · 52w range position 58% (lo 8,366 / hi 9,272)
**Drivers (recent corr):** HG=F +0.49 [textbook] · ^GSPC +0.57 [textbook] → **in charge: ^GSPC** (US lead (prior US day))
**Last 20 sessions decomposed (R² 0.25, n=60):** actual +0.9% = HG=F -1.4% · ^GSPC -0.9% · unexplained +3.1%
**This week:** 11-18 19:30 ET Australia: Employment Change (cons 25.2K, prev -39.3K) · 11-18 19:30 ET Australia: Full Employment Change · 11-18 19:30 ET Australia: Unemployment Rate (cons 4.7%, prev 4.7%)


## 7. Rates

### US 2y  `US2Y`  4.93% (2026-11-17)
**Move:** 1w +13bp · 4w +0bp (0th pct of 2y 4w moves) · 13w +57bp · 52w range position 90% (lo 3.512 / hi 5.089)
**Drivers (recent corr):** CL=F -0.02 [weak] · ^GSPC +0.38 [textbook, was INVERTED] → **in charge: ^GSPC** (Risk-on = fewer cuts / more hikes)
**Last 20 sessions decomposed (R² 0.02, n=60):** actual +0bp = ^GSPC -3bp · CL=F -2bp · unexplained +5bp
**Positioning (CFTC UST 2Y NOTE, 2026-11-10, + = long US 2y):** lev funds +1,505,204 (+34% OI, 4w +137,796, 19th pct of 3y) · asset mgrs -1,817,201 (-40% OI, 4w -21,335, 68th pct of 3y)
**This week:** 11-18 14:00 ET United States: FOMC Meeting Minutes

### US 10y  `US10Y`  5.12% (2026-11-17)
**Move:** 1w +14bp · 4w +0bp (1st pct of 2y 4w moves) · 13w +41bp · 52w range position 86% (lo 3.962 / hi 5.311)
**Drivers (recent corr):** CL=F +0.02 [weak] · ^NDX +0.45 [INVERTED] · T10YIE (missing) · DE10Y +0.16 [weak] → **in charge: ^NDX** (Textbook: yields up hurt stocks; + means bonds hedge stocks)
**Last 20 sessions decomposed (R² 0.09, n=60):** actual +0bp = ^NDX -7bp · CL=F -2bp · DE10Y -0bp · unexplained +10bp
**Positioning (CFTC UST 10Y NOTE, 2026-11-10, + = long US 10y):** lev funds +2,301,327 (+38% OI, 4w +95,390, 90th pct of 3y) · asset mgrs -3,153,761 (-52% OI, 4w -255,199, 1st pct of 3y)
**This week:** 11-18 14:00 ET United States: FOMC Meeting Minutes

### US 30y  `US30Y`  5.47% (2026-11-17)
**Move:** 1w +12bp · 4w +4bp (21st pct of 2y 4w moves) · 13w +18bp · 52w range position 81% (lo 4.633 / hi 5.665)
**Drivers (recent corr):** US2Y +0.94 [textbook] · T10YIE (missing) → **in charge: US2Y** (Front end)
**Last 20 sessions decomposed (R² 0.73, n=60):** actual +4bp = US2Y +0bp · unexplained +4bp
**Positioning (CFTC UST BOND, 2026-11-10, + = long US 30y):** lev funds +149,858 (+8% OI, 4w -4,162, 1st pct of 3y) · asset mgrs -394,990 (-20% OI, 4w -3,456, 94th pct of 3y)
**This week:** 11-18 14:00 ET United States: FOMC Meeting Minutes

### Bund 10y  `DE10Y`  3.43% (2026-11-17)
**Move:** 1w +15bp · 4w -2bp (11th pct of 2y 4w moves) · 13w +15bp · 52w range position 76% (lo 2.69 / hi 3.66)
**Drivers (recent corr):** US10Y +0.16 [weak] · BZ=F -0.06 [weak] · FR_DE (missing) → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.04, n=60):** actual -2bp = BZ=F -0bp · US10Y +0bp · unexplained -2bp
**This week:** 11-18 05:00 ET Euro Zone: Core CPI (cons 2.5%, prev 2.5%) · 11-18 05:00 ET Euro Zone: CPI (cons 4.0%, prev 4.0%)

### Gilt 10y  `GB10Y`  5.26% (2026-11-17)
**Move:** 1w +7bp · 4w -12bp (50th pct of 2y 4w moves) · 13w +11bp · 52w range position 81% (lo 4.352 / hi 5.478)
**Drivers (recent corr):** US10Y +0.73 [textbook] · GBPUSD=X -0.57 [textbook] → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.40, n=60):** actual -12bp = GBPUSD=X +2bp · US10Y +0bp · unexplained -15bp
**This week:** 11-18 02:00 ET United Kingdom: Core CPI (cons 2.8%, prev 2.8%) · 11-18 02:00 ET United Kingdom: CPI · 11-20 02:00 ET United Kingdom: Core Retail Sales · 11-20 02:00 ET United Kingdom: Retail Sales (cons 0.0%, prev -0.4%)

### JGB 10y  `JP10Y`  2.93% (2026-11-17)
**Move:** 1w +18bp · 4w +0bp (0th pct of 2y 4w moves) · 13w -1bp · 52w range position 86% (lo 1.759 / hi 3.111)
**Drivers (recent corr):** US10Y +0.80 [textbook] · USDJPY=X +0.66 [textbook] → **in charge: US10Y** (Global duration)
**Last 20 sessions decomposed (R² 0.55, n=60):** actual +0bp = USDJPY=X +1bp · US10Y -1bp · unexplained -1bp
**This week:** 11-19 18:30 ET Japan: National Core CPI (cons 2.3%, prev 2.1%)

### Canada 10y  `CA10Y`  3.85% (2026-11-17)
**Move:** 1w +13bp · 4w -5bp (23rd pct of 2y 4w moves) · 13w +15bp · 52w range position 84% (lo 3.12 / hi 3.99)
**Drivers (recent corr):** US10Y +0.92 [textbook] · CL=F +0.10 [weak] → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.68, n=60):** actual -5bp = CL=F -2bp · US10Y +0bp · unexplained -3bp
**This week:** 11-20 08:30 ET Canada: Core Retail Sales (cons 0.7%, prev 1.2%) · 11-20 08:30 ET Canada: Retail Sales (cons 0.7%, prev 1.2%)

### French spread (proxy)
_no data_


## 8. Commodities

### WTI crude  `CL=F`  85.13 (2026-11-17)
**Move:** 1w -1.1% · 4w -12.4% (79th pct of 2y 4w moves) · 13w -0.8% · 52w range position 52% (lo 55.27 / hi 112.9)
**Drivers (recent corr):** XLE +0.48 [textbook] · ^GSPC -0.34 [INVERTED] · HG=F -0.37 [INVERTED] · DX-Y.NYB +0.29 [weak] → **in charge: XLE** (Energy equities (do they believe the move?))
**Last 20 sessions decomposed (R² 0.27, n=60):** actual -13.2% = HG=F +5.3% · XLE -4.2% · ^GSPC +2.7% · DX-Y.NYB -1.0% · unexplained -16.0%
**Positioning (CFTC WTI-PHYSICAL, 2026-11-10, + = long WTI crude):** managed money +25,714 (+1% OI, 4w -14,860, 12th pct of 3y) · producers +368,588 (+19% OI, 4w +15,445, 95th pct of 3y)
**This week:** 11-18 14:00 ET United States: FOMC Meeting Minutes

### Gold  `GC=F`  3,870 (2026-11-17)
**Move:** 1w -4.0% · 4w -6.7% (69th pct of 2y 4w moves) · 13w -14.9% · 52w range position 0% (lo 3,870 / hi 5,318)
**Drivers (recent corr):** DFII10 (missing) · DX-Y.NYB -0.29 [weak] · SI=F +0.89 [textbook] · BTC-USD +0.31 [textbook] → **in charge: SI=F** (Precious block)
**Last 20 sessions decomposed (R² 0.76, n=60):** actual -7.0% = SI=F -8.8% · BTC-USD +1.2% · DX-Y.NYB -0.9% · unexplained +1.6%
**Positioning (CFTC GOLD, 2026-11-10, + = long Gold):** managed money +112,341 (+28% OI, 4w +5,252, 34th pct of 3y) · producers -10,881 (-3% OI, 4w +7,556, 98th pct of 3y)
**This week:** 11-18 14:00 ET United States: FOMC Meeting Minutes

### Silver  `SI=F`  47.33 (2026-11-17)
**Move:** 1w -7.4% · 4w -17.6% (84th pct of 2y 4w moves) · 13w -28.0% · 52w range position 0% (lo 47.33 / hi 115.1)
**Drivers (recent corr):** GC=F +0.89 [textbook] · HG=F +0.66 [textbook] → **in charge: GC=F** (Gold)
**Last 20 sessions decomposed (R² 0.82, n=60):** actual -19.3% = GC=F -9.0% · HG=F -5.1% · unexplained -5.2%
**Positioning (CFTC SILVER, 2026-11-10, + = long Silver):** managed money +3,615 (+3% OI, 4w -2,004, 4th pct of 3y) · producers -12,061 (-10% OI, 4w +3,740, 100th pct of 3y)
**This week:** 11-18 14:00 ET United States: FOMC Meeting Minutes

### Copper  `HG=F`  5.978 (2026-11-17)
**Move:** 1w -3.9% · 4w -8.6% (81st pct of 2y 4w moves) · 13w -7.9% · 52w range position 55% (lo 4.959 / hi 6.804)
**Drivers (recent corr):** ^GSPC +0.39 [textbook] → **in charge: ^GSPC** (Global growth)
**Last 20 sessions decomposed (R² 0.12, n=60):** actual -9.0% = ^GSPC -2.0% · unexplained -7.1%
**Positioning (CFTC COPPER- #1, 2026-11-10, + = long Copper):** managed money +35,064 (+11% OI, 4w -25,994, 48th pct of 3y) · producers -48,209 (-15% OI, 4w +42,257, 59th pct of 3y)
**This week:** 11-18 14:00 ET United States: FOMC Meeting Minutes

### Nat gas (US)  `NG=F`  3.089 (2026-11-17)
**Move:** 1w -6.3% · 4w +10.7% (58th pct of 2y 4w moves) · 13w +9.8% · 52w range position 11% (lo 2.523 / hi 7.46)
**Drivers (recent corr):** CL=F -0.16 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual +10.2% = CL=F -0.3% · unexplained +10.4%
**Positioning (CFTC NAT GAS NYME, 2026-11-10, + = long Nat gas (US)):** managed money -224,463 (-14% OI, 4w -97,982, 1st pct of 3y) · producers +14,748 (+1% OI, 4w +25,629, 96th pct of 3y)
**This week:** 11-18 14:00 ET United States: FOMC Meeting Minutes


## 9. Crypto

### Bitcoin  `BTC-USD`  64,961 (2026-11-17)
**Move:** 1w -11.9% · 4w -21.7% (91st pct of 2y 4w moves) · 13w +0.4% · 52w range position 17% (lo 58,559 / hi 96,929)
**Drivers (recent corr):** ^NDX +0.55 [textbook] · DX-Y.NYB -0.19 [weak] · GC=F +0.31 [textbook] → **in charge: ^NDX** (Tech / speculation)
**Last 20 sessions decomposed (R² 0.32, n=60):** actual -24.4% = ^NDX -6.9% · DX-Y.NYB -0.6% · GC=F +0.2% · unexplained -17.2%
**Positioning (CFTC BITCOIN, 2026-11-10, + = long Bitcoin):** lev funds -1,243 (-6% OI, 4w +4,601, 100th pct of 3y) · asset mgrs +1,956 (+10% OI, 4w -1,686, 1st pct of 3y)
**This week:** 11-18 14:00 ET United States: FOMC Meeting Minutes

