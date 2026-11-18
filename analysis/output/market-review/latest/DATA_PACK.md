# Market Review Data Pack: 2026-11-18

Fetched 2026-11-18T03:50:20+00:00. Descriptive numbers for the weekly review (read with `education/market_reviews/PLAYBOOK.md`). Correlations are of daily moves: last 20 sessions vs the 60 before. They are noisy; a flip is a question, not a signal.

**Data notes:** fred DGS2: The read operation timed out · fred DFII10: The read operation timed out · fred T10YIE: The read operation timed out · fred BAMLH0A0HYM2: The read operation timed out · fred BAMLC0A0CM: The read operation timed out · FRED DGS2 missing: US 2y = US 5y stand-in for this run · No local OAT/Bund futures: French spread proxy unavailable

## 1. Regime gauges: which story is the market trading?

| Pair | Recent | Before | Textbook sign | Status | What it means |
|---|---|---|---|---|---|
| CL=F vs US10Y | -0.01 | +0.18 | + | weak | Oil vs yields: + = oil is an inflation story; - = oil is a growth tax (2008-style) |
| ^NDX vs US10Y | +0.45 | -0.20 | − | INVERTED | Stocks vs yields: - = rates drive stocks; + = growth scare, bonds hedge stocks |
| HYG_TLT vs ^NDX | +0.52 | +0.07 | + | textbook | Credit vs tech: high + = credit and equities are one trade (credit stress leading) |
| DX-Y.NYB vs ^GSPC | -0.12 | -0.00 | − | weak | Dollar vs stocks: - = safe-haven dollar; ~0/+ = "sell America" or liquidity dash |
| AUDUSD=X vs ^NDX | +0.51 | +0.40 | + | textbook | Aussie vs tech: near 0 = AUD trading commodities not risk |
| BTC-USD vs ^NDX | +0.66 | +0.35 | + | textbook | Bitcoin vs tech: high = one liquidity complex |
| XLE vs CL=F | +0.47 | +0.31 | + | textbook | Energy stocks vs oil: falling = equity investors fade the oil move |
| USDJPY=X vs US10Y | +0.67 | +0.21 | + | textbook | Yen vs yields: high = yen is a pure rates trade |

Equity vol vs bond vol: VIX 25.5 (1y pct 95) · MOVE 102 (1y pct 93). When bond vol leads equity vol, the stress is in rates/credit first.

## 2. G10 FX

### EURUSD  `EURUSD=X`  1.099 (2026-11-18)
**Move:** 1w -0.9% · 4w -2.1% (77th pct of 2y 4w moves) · 13w -5.8% · 52w range position 0% (lo 1.099 / hi 1.202)
**Drivers (recent corr):** US_EA2 -0.10 [weak] · US_DE10 -0.09 [weak] · FR_DE (missing) · ^STOXX50E -0.08 [weak] · BZ=F -0.23 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.05, n=60):** actual -2.2% = BZ=F +0.2% · US_EA2 +0.1% · US_DE10 +0.0% · ^STOXX50E +0.0% · unexplained -2.5%
**Positioning (CFTC EURO FX, 2026-11-10, + = long EURUSD):** lev funds -71,676 (-8% OI, 4w -3,675, 1st pct of 3y) · asset mgrs +165,477 (+19% OI, 4w -34,441, 8th pct of 3y)
**This week:** 11-25 02:00 ET Germany: German GDP · 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices · 11-25 08:30 ET United States: GDP · 11-25 08:30 ET United States: GDP Price Index · 11-25 08:30 ET United States: GDP Sales

### USDJPY  `USDJPY=X`  159.4 (2026-11-18)
**Move:** 1w -0.2% · 4w +0.8% (29th pct of 2y 4w moves) · 13w +0.7% · 52w range position 61% (lo 152.5 / hi 163.9)
**Drivers (recent corr):** US10Y +0.67 [textbook] · US_JP10 +0.43 [textbook] · ^NDX +0.67 [textbook] · ^VIX -0.55 [textbook, was INVERTED] → **in charge: ^NDX** (Risk appetite: carry trades fund in yen)
**Last 20 sessions decomposed (R² 0.17, n=60):** actual +0.8% = ^NDX -0.7% · US10Y -0.2% · ^VIX +0.1% · US_JP10 +0.1% · unexplained +1.4%
**Positioning (CFTC JAPANESE YEN, 2026-11-10, + = long USDJPY):** lev funds +16,855 (+4% OI, 4w -16,818, 25th pct of 3y) · asset mgrs -90,344 (-23% OI, 4w -24,525, 10th pct of 3y)
**This week:** 11-19 18:30 ET Japan: National Core CPI (cons 2.3%, prev 2.1%) · 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices · 11-25 08:30 ET United States: GDP · 11-25 08:30 ET United States: GDP Price Index · 11-25 08:30 ET United States: GDP Sales

### GBPUSD  `GBPUSD=X`  1.32 (2026-11-18)
**Move:** 1w -0.6% · 4w -1.5% (57th pct of 2y 4w moves) · 13w -2.9% · 52w range position 18% (lo 1.306 / hi 1.383)
**Drivers (recent corr):** US_GB10 -0.12 [weak] · GB10Y -0.51 [INVERTED] · ^GSPC +0.01 [weak] · EURUSD=X +0.94 [textbook] → **in charge: EURUSD=X** (European block move)
**Last 20 sessions decomposed (R² 0.74, n=60):** actual -1.5% = EURUSD=X -1.9% · ^GSPC -0.1% · GB10Y +0.0% · US_GB10 -0.0% · unexplained +0.6%
**Positioning (CFTC BRITISH POUND, 2026-11-10, + = long GBPUSD):** lev funds +34,495 (+16% OI, 4w +24,182, 57th pct of 3y) · asset mgrs -105,960 (-48% OI, 4w +39,775, 20th pct of 3y)
**This week:** 11-20 02:00 ET United Kingdom: Core Retail Sales · 11-20 02:00 ET United Kingdom: Retail Sales (cons 0.0%, prev -0.4%) · 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices · 11-25 08:30 ET United States: GDP · 11-25 08:30 ET United States: GDP Price Index

### USDCAD  `USDCAD=X`  1.431 (2026-11-18)
**Move:** 1w +0.4% · 4w +1.9% (79th pct of 2y 4w moves) · 13w +3.6% · 52w range position 100% (lo 1.349 / hi 1.431)
**Drivers (recent corr):** CL=F +0.01 [weak] · US_CA2 +0.37 [textbook] · ^GSPC +0.09 [weak] → **in charge: US_CA2** (US-Canada 2y rate gap)
**Last 20 sessions decomposed (R² 0.20, n=60):** actual +1.9% = ^GSPC +0.2% · US_CA2 -0.1% · CL=F -0.0% · unexplained +1.8%
**Positioning (CFTC CANADIAN DOLLAR, 2026-11-10, + = long USDCAD):** lev funds +68,205 (+20% OI, 4w -19,907, 68th pct of 3y) · asset mgrs -14,480 (-4% OI, 4w -45,284, 9th pct of 3y)
**This week:** 11-20 08:30 ET Canada: Core Retail Sales (cons 0.7%, prev 1.2%) · 11-20 08:30 ET Canada: Retail Sales (cons 0.7%, prev 1.2%) · 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices · 11-25 08:30 ET United States: GDP · 11-25 08:30 ET United States: GDP Price Index

### AUDUSD  `AUDUSD=X`  0.6728 (2026-11-18)
**Move:** 1w -1.7% · 4w -4.3% (96th pct of 2y 4w moves) · 13w -5.6% · 52w range position 35% (lo 0.6449 / hi 0.7255)
**Drivers (recent corr):** HG=F +0.44 [textbook] · ^NDX +0.51 [textbook] · GC=F +0.36 [textbook] → **in charge: ^NDX** (Global risk proxy)
**Last 20 sessions decomposed (R² 0.20, n=60):** actual -4.4% = ^NDX -1.1% · GC=F -0.1% · HG=F -0.1% · unexplained -3.1%
**Positioning (CFTC AUSTRALIAN DOLLAR, 2026-11-10, + = long AUDUSD):** lev funds +50,819 (+14% OI, 4w +228, 89th pct of 3y) · asset mgrs -157,207 (-45% OI, 4w -41,287, 1st pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices · 11-25 08:30 ET United States: GDP · 11-25 08:30 ET United States: GDP Price Index · 11-25 08:30 ET United States: GDP Sales · 11-25 08:30 ET United States: PCE price index

### NZDUSD  `NZDUSD=X`  0.5497 (2026-11-18)
**Move:** 1w -1.2% · 4w -3.6% (87th pct of 2y 4w moves) · 13w -7.4% · 52w range position 0% (lo 0.5497 / hi 0.6076)
**Drivers (recent corr):** AUDUSD=X +0.48 [textbook] · ^GSPC +0.42 [textbook] · US2Y -0.11 [weak] → **in charge: AUDUSD=X** (Antipodean block)
**Last 20 sessions decomposed (R² 0.40, n=60):** actual -3.7% = AUDUSD=X -2.1% · ^GSPC -0.3% · US2Y +0.1% · unexplained -1.3%
**Positioning (CFTC NZ DOLLAR, 2026-11-10, + = long NZDUSD):** lev funds -24,832 (-19% OI, 4w -13,213, 7th pct of 3y) · asset mgrs -41,028 (-31% OI, 4w +3,111, 21st pct of 3y)
**This week:** 11-22 16:45 ET New Zealand: Retail Sales · 11-22 16:45 ET New Zealand: Retail Sales Quarterly Vs. Year Ago · 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices · 11-25 08:30 ET United States: GDP · 11-25 08:30 ET United States: GDP Price Index

### USDCHF  `USDCHF=X`  0.8406 (2026-11-18)
**Move:** 1w +1.0% · 4w +2.0% (70th pct of 2y 4w moves) · 13w +5.4% · 52w range position 100% (lo 0.7632 / hi 0.8406)
**Drivers (recent corr):** US10Y +0.53 [textbook] · ^VIX -0.24 [weak] · GC=F -0.09 [weak] → **in charge: US10Y** (US yields)
**Last 20 sessions decomposed (R² 0.31, n=60):** actual +2.0% = US10Y -0.2% · GC=F -0.1% · ^VIX +0.1% · unexplained +2.2%
**Positioning (CFTC SWISS FRANC, 2026-11-10, + = long USDCHF):** lev funds +16,070 (+13% OI, 4w +1,129, 92nd pct of 3y) · asset mgrs +13,169 (+10% OI, 4w -18,287, 11th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices · 11-25 08:30 ET United States: GDP · 11-25 08:30 ET United States: GDP Price Index · 11-25 08:30 ET United States: GDP Sales · 11-25 08:30 ET United States: PCE price index


## 3. G10 crosses

### AUDNZD  `AUDNZD=X`  1.224 (2026-11-18)
**Move:** 1w -0.5% · 4w -0.7% (40th pct of 2y 4w moves) · 13w +2.0% · 52w range position 74% (lo 1.141 / hi 1.254)
**Drivers (recent corr):** HG=F +0.08 [weak] · ^AXJO -0.22 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.08, n=60):** actual -0.7% = HG=F -0.3% · ^AXJO -0.0% · unexplained -0.4%
**This week:** 11-22 16:45 ET New Zealand: Retail Sales · 11-22 16:45 ET New Zealand: Retail Sales Quarterly Vs. Year Ago

### EURGBP  `EURGBP=X`  0.8326 (2026-11-18)
**Move:** 1w -0.4% · 4w -0.7% (49th pct of 2y 4w moves) · 13w -3.0% · 52w range position 0% (lo 0.8326 / hi 0.8834)
**Drivers (recent corr):** GB10Y +0.43 [INVERTED] · FR_DE (missing) → **in charge: GB10Y** (Gilt yields (BoE / UK fiscal))
**Last 20 sessions decomposed (R² 0.00, n=60):** actual -0.7% = GB10Y -0.0% · unexplained -0.7%
**This week:** 11-20 02:00 ET United Kingdom: Core Retail Sales · 11-20 02:00 ET United Kingdom: Retail Sales (cons 0.0%, prev -0.4%) · 11-25 02:00 ET Germany: German GDP

### EURCHF  `EURCHF=X`  0.9239 (2026-11-18)
**Move:** 1w +0.1% · 4w -0.2% (14th pct of 2y 4w moves) · 13w -0.8% · 52w range position 49% (lo 0.9023 / hi 0.9466)
**Drivers (recent corr):** ^STOXX50E +0.31 [textbook] · FR_DE (missing) · ^VIX -0.40 [textbook] → **in charge: ^VIX** (Haven flows)
**Last 20 sessions decomposed (R² 0.04, n=60):** actual -0.2% = ^VIX -0.1% · ^STOXX50E +0.0% · unexplained -0.1%
**This week:** 11-25 02:00 ET Germany: German GDP


## 4. EM FX

### USDMXN  `USDMXN=X`  18.44 (2026-11-18)
**Move:** 1w -0.9% · 4w -1.3% (45th pct of 2y 4w moves) · 13w +8.8% · 52w range position 79% (lo 16.89 / hi 18.85)
**Drivers (recent corr):** ^VIX +0.37 [textbook] · ^GSPC -0.37 [textbook] · CL=F +0.79 [INVERTED] · USDBRL=X -0.17 [weak] → **in charge: CL=F** (Oil)
**Last 20 sessions decomposed (R² 0.19, n=60):** actual -1.3% = CL=F -1.1% · USDBRL=X +0.8% · ^GSPC +0.4% · ^VIX +0.2% · unexplained -1.6%
**Positioning (CFTC MEXICAN PESO, 2026-11-10, + = long USDMXN):** lev funds -68,019 (-24% OI, 4w -4,455, 8th pct of 3y) · asset mgrs +41,109 (+15% OI, 4w +18,738, 100th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices · 11-25 08:30 ET United States: GDP · 11-25 08:30 ET United States: GDP Price Index · 11-25 08:30 ET United States: GDP Sales · 11-25 08:30 ET United States: PCE price index

### USDBRL  `USDBRL=X`  5.778 (2026-11-18)
**Move:** 1w +3.5% · 4w +15.1% (100th pct of 2y 4w moves) · 13w +11.6% · 52w range position 99% (lo 4.906 / hi 5.783)
**Drivers (recent corr):** ^VIX +0.11 [weak] · HG=F +0.21 [weak] · EWZ -0.95 [textbook] → **in charge: EWZ** (Brazil equities (local flows))
**Last 20 sessions decomposed (R² 0.86, n=60):** actual +14.1% = EWZ +9.4% · HG=F +0.3% · ^VIX +0.2% · unexplained +4.1%
**Positioning (CFTC BRAZILIAN REAL, 2026-11-10, + = long USDBRL):** lev funds -30,780 (-28% OI, 4w -3,166, 1st pct of 3y) · asset mgrs -39,980 (-36% OI, 4w +15,234, 59th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices · 11-25 08:30 ET United States: GDP · 11-25 08:30 ET United States: GDP Price Index · 11-25 08:30 ET United States: GDP Sales · 11-25 08:30 ET United States: PCE price index

### USDZAR  `USDZAR=X`  16.95 (2026-11-18)
**Move:** 1w +2.1% · 4w +3.5% (85th pct of 2y 4w moves) · 13w +5.3% · 52w range position 78% (lo 15.71 / hi 17.29)
**Drivers (recent corr):** GC=F -0.47 [textbook] · ^VIX +0.46 [textbook] · HG=F -0.12 [weak] → **in charge: GC=F** (Gold / precious metals exporter)
**Last 20 sessions decomposed (R² 0.21, n=60):** actual +3.5% = ^VIX +0.9% · GC=F +0.6% · HG=F -0.3% · unexplained +2.3%
**Positioning (CFTC SO AFRICAN RAND, 2026-11-10, + = long USDZAR):** lev funds -5,638 (-15% OI, 4w -1,090, 22nd pct of 3y) · asset mgrs -14,155 (-37% OI, 4w +3,422, 34th pct of 3y)
**This week:** 11-19 08:00 ET South Africa: Interest Rate Decision · 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices · 11-25 08:30 ET United States: GDP · 11-25 08:30 ET United States: GDP Price Index · 11-25 08:30 ET United States: GDP Sales

### USDKRW  `USDKRW=X`  1,330 (2026-11-18)
**Move:** 1w -0.5% · 4w +0.3% (14th pct of 2y 4w moves) · 13w -4.3% · 52w range position 3% (lo 1,324 / hi 1,552)
**Drivers (recent corr):** ^KS11 +0.08 [weak] · SOXX -0.55 [textbook] · DX-Y.NYB +0.00 [weak] → **in charge: SOXX** (Global semis cycle)
**Last 20 sessions decomposed (R² 0.13, n=60):** actual +0.3% = SOXX +1.2% · DX-Y.NYB +0.6% · ^KS11 -0.5% · unexplained -0.9%
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices · 11-25 08:30 ET United States: GDP · 11-25 08:30 ET United States: GDP Price Index · 11-25 08:30 ET United States: GDP Sales · 11-25 08:30 ET United States: PCE price index


## 5. CE3 FX

### EURCZK  `EURCZK=X`  24.35 (2026-11-18)
**Move:** 1w -0.0% · 4w +0.4% (54th pct of 2y 4w moves) · 13w +0.8% · 52w range position 61% (lo 24.07 / hi 24.53)
**Drivers (recent corr):** ^STOXX50E -0.07 [weak] · EURPLN=X +0.53 [textbook] → **in charge: EURPLN=X** (CE3 block)
**Last 20 sessions decomposed (R² 0.23, n=60):** actual +0.4% = EURPLN=X +0.2% · ^STOXX50E -0.0% · unexplained +0.2%
**This week:** 11-25 02:00 ET Germany: German GDP

### EURPLN  `EURPLN=X`  4.404 (2026-11-18)
**Move:** 1w -0.1% · 4w +1.1% (81st pct of 2y 4w moves) · 13w +2.1% · 52w range position 96% (lo 4.197 / hi 4.412)
**Drivers (recent corr):** ^STOXX50E -0.32 [textbook] · ^VIX +0.45 [textbook] → **in charge: ^VIX** (Risk)
**Last 20 sessions decomposed (R² 0.16, n=60):** actual +1.1% = ^VIX +0.3% · ^STOXX50E -0.0% · unexplained +0.9%
**This week:** 11-25 02:00 ET Germany: German GDP


## 6. Equities

### S&P 500  `^GSPC`  7,341 (2026-11-18)
**Move:** 1w -3.7% · 4w -5.4% (85th pct of 2y 4w moves) · 13w -4.8% · 52w range position 68% (lo 6,344 / hi 7,819)
**Drivers (recent corr):** US10Y +0.30 [INVERTED, was textbook] · HYG_TLT +0.40 [textbook] · DX-Y.NYB -0.12 [weak] · CL=F -0.39 [textbook] · ^VIX -0.97 [textbook] → **in charge: ^VIX** (Vol)
**Last 20 sessions decomposed (R² 0.86, n=60):** actual -5.5% = ^VIX -3.5% · CL=F +0.3% · US10Y +0.2% · HYG_TLT +0.1% · DX-Y.NYB +0.1% · unexplained -2.7%
**Positioning (CFTC E-MINI S&P 500, 2026-11-10, + = long S&P 500):** lev funds -303,060 (-15% OI, 4w +105,666, 71st pct of 3y) · asset mgrs +914,130 (+45% OI, 4w -1,705, 38th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices · 11-25 08:30 ET United States: GDP · 11-25 08:30 ET United States: GDP Price Index · 11-25 08:30 ET United States: GDP Sales · 11-25 08:30 ET United States: PCE price index

### Nasdaq 100  `^NDX`  27,002 (2026-11-18)
**Move:** 1w -4.8% · 4w -9.5% (89th pct of 2y 4w moves) · 13w -8.2% · 52w range position 49% (lo 22,953 / hi 31,224)
**Drivers (recent corr):** US10Y +0.45 [INVERTED] · SOXX +0.95 [textbook] · HYG_TLT +0.52 [textbook] · BTC-USD +0.66 [textbook] → **in charge: SOXX** (Semis / AI capex)
**Last 20 sessions decomposed (R² 0.90, n=60):** actual -9.9% = SOXX -6.7% · BTC-USD -3.9% · US10Y +0.2% · HYG_TLT +0.2% · unexplained +0.2%
**Positioning (CFTC NASDAQ MINI, 2026-11-10, + = long Nasdaq 100):** lev funds +13,967 (+5% OI, 4w +25,560, 99th pct of 3y) · asset mgrs +72,785 (+25% OI, 4w -2,538, 43rd pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices · 11-25 08:30 ET United States: GDP · 11-25 08:30 ET United States: GDP Price Index · 11-25 08:30 ET United States: GDP Sales · 11-25 08:30 ET United States: PCE price index

### Russell 2000  `^RUT`  2,702 (2026-11-18)
**Move:** 1w -5.1% · 4w -2.8% (38th pct of 2y 4w moves) · 13w -10.9% · 52w range position 52% (lo 2,305 / hi 3,068)
**Drivers (recent corr):** US2Y +0.12 [weak] · HYG_TLT +0.16 [weak] · ^GSPC +0.92 [textbook] → **in charge: ^GSPC** (Beta)
**Last 20 sessions decomposed (R² 0.77, n=60):** actual -2.9% = ^GSPC -5.7% · US2Y +0.2% · HYG_TLT -0.1% · unexplained +2.7%
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices · 11-25 08:30 ET United States: GDP · 11-25 08:30 ET United States: GDP Price Index · 11-25 08:30 ET United States: GDP Sales · 11-25 08:30 ET United States: PCE price index

### Euro Stoxx 50  `^STOXX50E`  6,212 (2026-11-18)
**Move:** 1w -2.8% · 4w +0.1% (1st pct of 2y 4w moves) · 13w -3.6% · 52w range position 68% (lo 5,501 / hi 6,551)
**Drivers (recent corr):** FR_DE (missing) · ^GSPC +0.64 [textbook] · BZ=F -0.50 [textbook] · EURUSD=X -0.08 [weak] → **in charge: ^GSPC** (US lead)
**Last 20 sessions decomposed (R² 0.32, n=60):** actual +0.1% = ^GSPC -2.2% · BZ=F +1.7% · EURUSD=X -0.1% · unexplained +0.7%
**This week:** 11-25 02:00 ET Germany: German GDP

### CAC 40  `^FCHI`  8,217 (2026-11-18)
**Move:** 1w -1.4% · 4w +3.7% (69th pct of 2y 4w moves) · 13w -3.4% · 52w range position 52% (lo 7,666 / hi 8,726)
**Drivers (recent corr):** FR_DE (missing) · ^STOXX50E +0.93 [textbook] → **in charge: ^STOXX50E** (European block)
**Last 20 sessions decomposed (R² 0.79, n=60):** actual +3.7% = ^STOXX50E +0.1% · unexplained +3.6%
**This week:** 11-25 02:00 ET Germany: German GDP

### DAX  `^GDAXI`  26,045 (2026-11-18)
**Move:** 1w -2.3% · 4w +1.6% (29th pct of 2y 4w moves) · 13w -0.2% · 52w range position 84% (lo 22,301 / hi 26,772)
**Drivers (recent corr):** DE10Y +0.45 [INVERTED] · ^GSPC +0.56 [textbook] → **in charge: ^GSPC** (Global risk)
**Last 20 sessions decomposed (R² 0.23, n=60):** actual +1.5% = ^GSPC -2.5% · DE10Y +0.1% · unexplained +4.0%
**This week:** 11-25 02:00 ET Germany: German GDP

### FTSE 100  `^FTSE`  10,690 (2026-11-18)
**Move:** 1w -1.3% · 4w -0.6% (16th pct of 2y 4w moves) · 13w -0.5% · 52w range position 84% (lo 9,507 / hi 10,911)
**Drivers (recent corr):** BZ=F -0.45 [INVERTED] · GBPUSD=X -0.02 [weak] · GB10Y -0.37 [textbook] → **in charge: BZ=F** (Energy-heavy index)
**Last 20 sessions decomposed (R² 0.31, n=60):** actual -0.6% = BZ=F +0.5% · GB10Y +0.3% · GBPUSD=X +0.3% · unexplained -1.7%
**This week:** 11-20 02:00 ET United Kingdom: Core Retail Sales · 11-20 02:00 ET United Kingdom: Retail Sales (cons 0.0%, prev -0.4%)

### Nikkei 225  `^N225`  58,851 (2026-11-18)
**Move:** 1w -3.9% · 4w -8.9% (83rd pct of 2y 4w moves) · 13w -9.9% · 52w range position 43% (lo 48,538 / hi 72,366)
**Drivers (recent corr):** USDJPY=X +0.44 [textbook] · ^NDX +0.64 [textbook] · SOXX +0.65 [textbook] → **in charge: SOXX** (Chips (prior US day))
**Last 20 sessions decomposed (R² 0.32, n=60):** actual -9.4% = SOXX -3.1% · ^NDX -1.9% · USDJPY=X -0.1% · unexplained -4.3%
**This week:** 11-19 18:30 ET Japan: National Core CPI (cons 2.3%, prev 2.1%)

### KOSPI  `^KS11`  4,991 (2026-11-18)
**Move:** 1w -7.1% · 4w -13.0% (73rd pct of 2y 4w moves) · 13w -22.9% · 52w range position 22% (lo 3,846 / hi 9,115)
**Drivers (recent corr):** SOXX +0.51 [textbook] · ^NDX +0.43 [textbook] → **in charge: SOXX** (Memory / AI hardware (prior US day))
**Last 20 sessions decomposed (R² 0.24, n=60):** actual -13.9% = SOXX -12.3% · ^NDX +8.5% · unexplained -10.2%
**This week:** 11-25 20:00 ET South Korea: Interest Rate Decision

### Hang Seng  `^HSI`  23,276 (2026-11-18)
**Move:** 1w -4.3% · 4w -1.6% (25th pct of 2y 4w moves) · 13w -8.7% · 52w range position 11% (lo 22,672 / hi 27,968)
**Drivers (recent corr):** ^NDX +0.06 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.01, n=60):** actual -1.6% = ^NDX -0.5% · unexplained -1.1%
**This week:** 11-20 03:30 ET Hong Kong: CPI

### ASX 200  `^AXJO`  8,838 (2026-11-18)
**Move:** 1w -3.4% · 4w +0.1% (2nd pct of 2y 4w moves) · 13w -2.4% · 52w range position 52% (lo 8,366 / hi 9,272)
**Drivers (recent corr):** HG=F +0.48 [textbook] · ^GSPC +0.58 [textbook] → **in charge: ^GSPC** (US lead (prior US day))
**Last 20 sessions decomposed (R² 0.26, n=60):** actual +0.1% = HG=F -1.5% · ^GSPC -1.2% · unexplained +2.8%


## 7. Rates

### US 2y  `US2Y`  4.90% (2026-11-18)
**Move:** 1w +7bp · 4w -7bp (33rd pct of 2y 4w moves) · 13w +55bp · 52w range position 88% (lo 3.512 / hi 5.089)
**Drivers (recent corr):** CL=F -0.05 [weak] · ^GSPC +0.38 [textbook, was INVERTED] → **in charge: ^GSPC** (Risk-on = fewer cuts / more hikes)
**Last 20 sessions decomposed (R² 0.02, n=60):** actual -7bp = ^GSPC -5bp · CL=F -2bp · unexplained -0bp
**Positioning (CFTC UST 2Y NOTE, 2026-11-10, + = long US 2y):** lev funds +1,505,204 (+34% OI, 4w +137,796, 19th pct of 3y) · asset mgrs -1,817,201 (-40% OI, 4w -21,335, 68th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices · 11-25 08:30 ET United States: GDP · 11-25 08:30 ET United States: GDP Price Index · 11-25 08:30 ET United States: GDP Sales · 11-25 08:30 ET United States: PCE price index

### US 10y  `US10Y`  5.10% (2026-11-18)
**Move:** 1w +10bp · 4w -4bp (20th pct of 2y 4w moves) · 13w +45bp · 52w range position 85% (lo 3.962 / hi 5.311)
**Drivers (recent corr):** CL=F -0.01 [weak] · ^NDX +0.45 [INVERTED] · T10YIE (missing) · DE10Y +0.18 [weak] → **in charge: ^NDX** (Textbook: yields up hurt stocks; + means bonds hedge stocks)
**Last 20 sessions decomposed (R² 0.10, n=60):** actual -4bp = ^NDX -8bp · CL=F -3bp · DE10Y -1bp · unexplained +8bp
**Positioning (CFTC UST 10Y NOTE, 2026-11-10, + = long US 10y):** lev funds +2,301,327 (+38% OI, 4w +95,390, 90th pct of 3y) · asset mgrs -3,153,761 (-52% OI, 4w -255,199, 1st pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices · 11-25 08:30 ET United States: GDP · 11-25 08:30 ET United States: GDP Price Index · 11-25 08:30 ET United States: GDP Sales · 11-25 08:30 ET United States: PCE price index

### US 30y  `US30Y`  5.46% (2026-11-18)
**Move:** 1w +10bp · 4w +2bp (11th pct of 2y 4w moves) · 13w +26bp · 52w range position 80% (lo 4.633 / hi 5.665)
**Drivers (recent corr):** US2Y +0.94 [textbook] · T10YIE (missing) → **in charge: US2Y** (Front end)
**Last 20 sessions decomposed (R² 0.73, n=60):** actual +2bp = US2Y -5bp · unexplained +6bp
**Positioning (CFTC UST BOND, 2026-11-10, + = long US 30y):** lev funds +149,858 (+8% OI, 4w -4,162, 1st pct of 3y) · asset mgrs -394,990 (-20% OI, 4w -3,456, 94th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices · 11-25 08:30 ET United States: GDP · 11-25 08:30 ET United States: GDP Price Index · 11-25 08:30 ET United States: GDP Sales · 11-25 08:30 ET United States: PCE price index

### Bund 10y  `DE10Y`  3.39% (2026-11-18)
**Move:** 1w +5bp · 4w -5bp (24th pct of 2y 4w moves) · 13w +10bp · 52w range position 72% (lo 2.69 / hi 3.66)
**Drivers (recent corr):** US10Y +0.18 [weak] · BZ=F -0.05 [weak] · FR_DE (missing) → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.04, n=60):** actual -5bp = US10Y -1bp · BZ=F -1bp · unexplained -4bp
**This week:** 11-25 02:00 ET Germany: German GDP

### Gilt 10y  `GB10Y`  5.32% (2026-11-18)
**Move:** 1w +11bp · 4w -5bp (22nd pct of 2y 4w moves) · 13w +20bp · 52w range position 86% (lo 4.352 / hi 5.478)
**Drivers (recent corr):** US10Y +0.75 [textbook] · GBPUSD=X -0.51 [textbook] → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.40, n=60):** actual -5bp = US10Y -2bp · GBPUSD=X +2bp · unexplained -4bp
**This week:** 11-20 02:00 ET United Kingdom: Core Retail Sales · 11-20 02:00 ET United Kingdom: Retail Sales (cons 0.0%, prev -0.4%)

### JGB 10y  `JP10Y`  2.92% (2026-11-18)
**Move:** 1w +8bp · 4w +0bp (1st pct of 2y 4w moves) · 13w +3bp · 52w range position 86% (lo 1.779 / hi 3.111)
**Drivers (recent corr):** US10Y +0.80 [textbook] · USDJPY=X +0.67 [textbook] → **in charge: US10Y** (Global duration)
**Last 20 sessions decomposed (R² 0.55, n=60):** actual +0bp = USDJPY=X +2bp · US10Y -1bp · unexplained -1bp
**This week:** 11-19 18:30 ET Japan: National Core CPI (cons 2.3%, prev 2.1%)

### Canada 10y  `CA10Y`  3.81% (2026-11-18)
**Move:** 1w +9bp · 4w -9bp (37th pct of 2y 4w moves) · 13w +12bp · 52w range position 79% (lo 3.12 / hi 3.99)
**Drivers (recent corr):** US10Y +0.93 [textbook] · CL=F +0.13 [weak] → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.69, n=60):** actual -9bp = CL=F -3bp · US10Y -3bp · unexplained -3bp
**This week:** 11-20 08:30 ET Canada: Core Retail Sales (cons 0.7%, prev 1.2%) · 11-20 08:30 ET Canada: Retail Sales (cons 0.7%, prev 1.2%)

### French spread (proxy)
_no data_


## 8. Commodities

### WTI crude  `CL=F`  84.98 (2026-11-18)
**Move:** 1w -1.8% · 4w -14.6% (82nd pct of 2y 4w moves) · 13w -3.2% · 52w range position 52% (lo 55.27 / hi 112.9)
**Drivers (recent corr):** XLE +0.47 [textbook] · ^GSPC -0.39 [INVERTED] · HG=F -0.34 [INVERTED] · DX-Y.NYB +0.34 [INVERTED] → **in charge: XLE** (Energy equities (do they believe the move?))
**Last 20 sessions decomposed (R² 0.27, n=60):** actual -15.7% = XLE -4.6% · HG=F +4.5% · ^GSPC +3.8% · DX-Y.NYB -1.1% · unexplained -18.2%
**Positioning (CFTC WTI-PHYSICAL, 2026-11-10, + = long WTI crude):** managed money +25,714 (+1% OI, 4w -14,860, 12th pct of 3y) · producers +368,588 (+19% OI, 4w +15,445, 95th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices · 11-25 08:30 ET United States: GDP · 11-25 08:30 ET United States: GDP Price Index · 11-25 08:30 ET United States: GDP Sales · 11-25 08:30 ET United States: PCE price index

### Gold  `GC=F`  3,795 (2026-11-18)
**Move:** 1w -5.1% · 4w -6.5% (68th pct of 2y 4w moves) · 13w -17.0% · 52w range position 0% (lo 3,795 / hi 5,318)
**Drivers (recent corr):** DFII10 (missing) · DX-Y.NYB -0.34 [textbook] · SI=F +0.88 [textbook] · BTC-USD +0.42 [textbook] → **in charge: SI=F** (Precious block)
**Last 20 sessions decomposed (R² 0.76, n=60):** actual -6.8% = SI=F -8.2% · BTC-USD +1.9% · DX-Y.NYB -1.0% · unexplained +0.5%
**Positioning (CFTC GOLD, 2026-11-10, + = long Gold):** managed money +112,341 (+28% OI, 4w +5,252, 34th pct of 3y) · producers -10,881 (-3% OI, 4w +7,556, 98th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices · 11-25 08:30 ET United States: GDP · 11-25 08:30 ET United States: GDP Price Index · 11-25 08:30 ET United States: GDP Sales · 11-25 08:30 ET United States: PCE price index

### Silver  `SI=F`  45.97 (2026-11-18)
**Move:** 1w -11.4% · 4w -16.0% (81st pct of 2y 4w moves) · 13w -32.4% · 52w range position 0% (lo 45.97 / hi 115.1)
**Drivers (recent corr):** GC=F +0.88 [textbook] · HG=F +0.60 [textbook] → **in charge: GC=F** (Gold)
**Last 20 sessions decomposed (R² 0.82, n=60):** actual -17.5% = GC=F -8.7% · HG=F -4.3% · unexplained -4.6%
**Positioning (CFTC SILVER, 2026-11-10, + = long Silver):** managed money +3,615 (+3% OI, 4w -2,004, 4th pct of 3y) · producers -12,061 (-10% OI, 4w +3,740, 100th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices · 11-25 08:30 ET United States: GDP · 11-25 08:30 ET United States: GDP Price Index · 11-25 08:30 ET United States: GDP Sales · 11-25 08:30 ET United States: PCE price index

### Copper  `HG=F`  5.89 (2026-11-18)
**Move:** 1w -6.1% · 4w -7.4% (75th pct of 2y 4w moves) · 13w -8.8% · 52w range position 50% (lo 4.959 / hi 6.804)
**Drivers (recent corr):** ^GSPC +0.47 [textbook] → **in charge: ^GSPC** (Global growth)
**Last 20 sessions decomposed (R² 0.12, n=60):** actual -7.7% = ^GSPC -2.8% · unexplained -4.9%
**Positioning (CFTC COPPER- #1, 2026-11-10, + = long Copper):** managed money +35,064 (+11% OI, 4w -25,994, 48th pct of 3y) · producers -48,209 (-15% OI, 4w +42,257, 59th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices · 11-25 08:30 ET United States: GDP · 11-25 08:30 ET United States: GDP Price Index · 11-25 08:30 ET United States: GDP Sales · 11-25 08:30 ET United States: PCE price index

### Nat gas (US)  `NG=F`  3.17 (2026-11-18)
**Move:** 1w -1.4% · 4w +13.4% (67th pct of 2y 4w moves) · 13w +16.0% · 52w range position 13% (lo 2.523 / hi 7.46)
**Drivers (recent corr):** CL=F -0.19 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual +12.6% = CL=F +0.0% · unexplained +12.5%
**Positioning (CFTC NAT GAS NYME, 2026-11-10, + = long Nat gas (US)):** managed money -224,463 (-14% OI, 4w -97,982, 1st pct of 3y) · producers +14,748 (+1% OI, 4w +25,629, 96th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices · 11-25 08:30 ET United States: GDP · 11-25 08:30 ET United States: GDP Price Index · 11-25 08:30 ET United States: GDP Sales · 11-25 08:30 ET United States: PCE price index


## 9. Crypto

### Bitcoin  `BTC-USD`  64,445 (2026-11-18)
**Move:** 1w -12.9% · 4w -23.3% (94th pct of 2y 4w moves) · 13w -7.0% · 52w range position 15% (lo 58,559 / hi 96,929)
**Drivers (recent corr):** ^NDX +0.66 [textbook] · DX-Y.NYB -0.19 [weak] · GC=F +0.42 [textbook] → **in charge: ^NDX** (Tech / speculation)
**Last 20 sessions decomposed (R² 0.40, n=60):** actual -26.5% = ^NDX -9.4% · DX-Y.NYB -0.8% · GC=F +0.1% · unexplained -16.4%
**Positioning (CFTC BITCOIN, 2026-11-10, + = long Bitcoin):** lev funds -1,243 (-6% OI, 4w +4,601, 100th pct of 3y) · asset mgrs +1,956 (+10% OI, 4w -1,686, 1st pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices · 11-25 08:30 ET United States: GDP · 11-25 08:30 ET United States: GDP Price Index · 11-25 08:30 ET United States: GDP Sales · 11-25 08:30 ET United States: PCE price index

