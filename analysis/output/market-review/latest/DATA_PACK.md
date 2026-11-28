# Market Review Data Pack: 2026-11-28

Fetched 2026-11-28T04:12:32+00:00. Descriptive numbers for the weekly review (read with `education/market_reviews/PLAYBOOK.md`). Correlations are of daily moves: last 20 sessions vs the 60 before. They are noisy; a flip is a question, not a signal.

**Data notes:** fred DGS2: The read operation timed out · fred DFII10: The read operation timed out · fred T10YIE: The read operation timed out · fred BAMLH0A0HYM2: The read operation timed out · fred BAMLC0A0CM: The read operation timed out · FRED DGS2 missing: US 2y = US 5y stand-in for this run · No local OAT/Bund futures: French spread proxy unavailable

## 1. Regime gauges: which story is the market trading?

| Pair | Recent | Before | Textbook sign | Status | What it means |
|---|---|---|---|---|---|
| CL=F vs US10Y | +0.16 | -0.02 | + | weak | Oil vs yields: + = oil is an inflation story; - = oil is a growth tax (2008-style) |
| ^NDX vs US10Y | +0.45 | +0.17 | − | INVERTED | Stocks vs yields: - = rates drive stocks; + = growth scare, bonds hedge stocks |
| HYG_TLT vs ^NDX | +0.47 | +0.30 | + | textbook | Credit vs tech: high + = credit and equities are one trade (credit stress leading) |
| DX-Y.NYB vs ^GSPC | +0.14 | +0.08 | − | weak | Dollar vs stocks: - = safe-haven dollar; ~0/+ = "sell America" or liquidity dash |
| AUDUSD=X vs ^NDX | +0.30 | +0.31 | + | weak | Aussie vs tech: near 0 = AUD trading commodities not risk |
| BTC-USD vs ^NDX | +0.76 | +0.44 | + | textbook | Bitcoin vs tech: high = one liquidity complex |
| XLE vs CL=F | +0.66 | +0.22 | + | textbook | Energy stocks vs oil: falling = equity investors fade the oil move |
| USDJPY=X vs US10Y | +0.41 | +0.32 | + | textbook | Yen vs yields: high = yen is a pure rates trade |

Equity vol vs bond vol: VIX 23.8 (1y pct 88) · MOVE 95 (1y pct 82). When bond vol leads equity vol, the stress is in rates/credit first.

## 2. G10 FX

### EURUSD  `EURUSD=X`  1.097 (2026-11-27)
**Move:** 1w +0.0% · 4w -1.9% (72nd pct of 2y 4w moves) · 13w -5.9% · 52w range position 6% (lo 1.091 / hi 1.202)
**Drivers (recent corr):** US_EA2 -0.17 [weak] · US_DE10 -0.16 [weak] · FR_DE (missing) · ^STOXX50E -0.25 [weak] · BZ=F -0.10 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.03, n=60):** actual -1.9% = BZ=F +0.2% · US_DE10 +0.0% · ^STOXX50E +0.0% · US_EA2 +0.0% · unexplained -2.1%
**Positioning (CFTC EURO FX, 2026-11-17, + = long EURUSD):** lev funds -76,587 (-9% OI, 4w -7,747, 1st pct of 3y) · asset mgrs +147,234 (+17% OI, 4w -43,187, 1st pct of 3y)
**This week:** 11-30 02:00 ET Germany: German Retail Sales · 12-01 04:00 ET Italy: Italian GDP (cons 0.0%, prev 0.0%) · 12-01 05:00 ET Euro Zone: Core CPI · 12-01 05:00 ET Euro Zone: CPI (cons 3.9%, prev 4.0%) · 12-01 10:00 ET United States: IBD/TIPP Economic Optimism · 12-01 10:00 ET United States: ISM Manufacturing Employment

### USDJPY  `USDJPY=X`  159.3 (2026-11-27)
**Move:** 1w -0.3% · 4w +0.9% (35th pct of 2y 4w moves) · 13w -0.0% · 52w range position 60% (lo 152.5 / hi 163.9)
**Drivers (recent corr):** US10Y +0.41 [textbook] · US_JP10 +0.13 [weak] · ^NDX +0.20 [weak] · ^VIX -0.23 [weak] → **in charge: US10Y** (US yields: the carry engine)
**Last 20 sessions decomposed (R² 0.14, n=60):** actual +0.9% = ^NDX -0.4% · ^VIX +0.1% · US_JP10 -0.1% · US10Y +0.0% · unexplained +1.2%
**Positioning (CFTC JAPANESE YEN, 2026-11-17, + = long USDJPY):** lev funds +23,790 (+6% OI, 4w +900, 30th pct of 3y) · asset mgrs -84,681 (-22% OI, 4w -5,578, 12th pct of 3y)
**This week:** 11-29 18:50 ET Japan: Large Scale Retail Sales YoY · 11-29 18:50 ET Japan: Retail Sales · 11-30 18:30 ET Japan: Unemployment Rate · 12-01 10:00 ET United States: IBD/TIPP Economic Optimism · 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index

### GBPUSD  `GBPUSD=X`  1.311 (2026-11-27)
**Move:** 1w +0.2% · 4w -2.0% (75th pct of 2y 4w moves) · 13w -3.6% · 52w range position 9% (lo 1.303 / hi 1.383)
**Drivers (recent corr):** US_GB10 -0.12 [weak] · GB10Y -0.27 [weak] · ^GSPC -0.03 [weak] · EURUSD=X +0.87 [textbook] → **in charge: EURUSD=X** (European block move)
**Last 20 sessions decomposed (R² 0.72, n=60):** actual -2.0% = EURUSD=X -1.7% · US_GB10 -0.2% · ^GSPC -0.2% · GB10Y +0.0% · unexplained +0.0%
**Positioning (CFTC BRITISH POUND, 2026-11-17, + = long GBPUSD):** lev funds +28,790 (+12% OI, 4w +4,686, 39th pct of 3y) · asset mgrs -104,615 (-45% OI, 4w +30,006, 22nd pct of 3y)
**This week:** 12-01 10:00 ET United States: IBD/TIPP Economic Optimism · 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index · 12-01 10:00 ET United States: ISM Manufacturing PMI (cons 55.2, prev 55.5) · 12-01 10:00 ET United States: ISM Manufacturing Prices · 12-02 08:15 ET United States: ADP Nonfarm Employment Change

### USDCAD  `USDCAD=X`  1.425 (2026-11-27)
**Move:** 1w -0.7% · 4w +1.9% (79th pct of 2y 4w moves) · 13w +2.9% · 52w range position 87% (lo 1.349 / hi 1.437)
**Drivers (recent corr):** CL=F -0.14 [weak] · US_CA2 +0.33 [textbook] · ^GSPC +0.09 [weak] → **in charge: US_CA2** (US-Canada 2y rate gap)
**Last 20 sessions decomposed (R² 0.17, n=60):** actual +1.9% = US_CA2 +0.2% · ^GSPC +0.1% · CL=F +0.0% · unexplained +1.5%
**Positioning (CFTC CANADIAN DOLLAR, 2026-11-17, + = long USDCAD):** lev funds +72,118 (+20% OI, 4w -18,995, 73rd pct of 3y) · asset mgrs -5,365 (-1% OI, 4w -10,764, 13th pct of 3y)
**This week:** 11-30 08:30 ET Canada: GDP Implicit Price · 11-30 08:30 ET Canada: GDP (cons -0.1%, prev 0.0%) · 11-30 08:30 ET Canada: GDP Annualized · 12-01 10:00 ET United States: IBD/TIPP Economic Optimism · 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index

### AUDUSD  `AUDUSD=X`  0.6636 (2026-11-27)
**Move:** 1w -0.3% · 4w -5.6% (98th pct of 2y 4w moves) · 13w -7.8% · 52w range position 14% (lo 0.6536 / hi 0.7255)
**Drivers (recent corr):** HG=F +0.19 [weak] · ^NDX +0.30 [weak] · GC=F +0.20 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.09, n=60):** actual -5.7% = ^NDX -0.4% · HG=F -0.2% · GC=F +0.2% · unexplained -5.3%
**Positioning (CFTC AUSTRALIAN DOLLAR, 2026-11-17, + = long AUDUSD):** lev funds +37,980 (+10% OI, 4w -14,517, 75th pct of 3y) · asset mgrs -182,725 (-49% OI, 4w -53,986, 1st pct of 3y)
**This week:** 12-01 10:00 ET United States: IBD/TIPP Economic Optimism · 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index · 12-01 10:00 ET United States: ISM Manufacturing PMI (cons 55.2, prev 55.5) · 12-01 10:00 ET United States: ISM Manufacturing Prices · 12-01 19:30 ET Australia: GDP

### NZDUSD  `NZDUSD=X`  0.5471 (2026-11-27)
**Move:** 1w -0.2% · 4w -2.9% (75th pct of 2y 4w moves) · 13w -8.1% · 52w range position 3% (lo 0.5451 / hi 0.6076)
**Drivers (recent corr):** AUDUSD=X +0.70 [textbook] · ^GSPC +0.16 [weak] · US2Y -0.20 [weak] → **in charge: AUDUSD=X** (Antipodean block)
**Last 20 sessions decomposed (R² 0.38, n=60):** actual -2.9% = AUDUSD=X -3.0% · ^GSPC -0.0% · US2Y -0.0% · unexplained +0.2%
**Positioning (CFTC NZ DOLLAR, 2026-11-17, + = long NZDUSD):** lev funds -23,595 (-17% OI, 4w -4,315, 8th pct of 3y) · asset mgrs -47,524 (-35% OI, 4w +1,789, 11th pct of 3y)
**This week:** 12-01 10:00 ET United States: IBD/TIPP Economic Optimism · 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index · 12-01 10:00 ET United States: ISM Manufacturing PMI (cons 55.2, prev 55.5) · 12-01 10:00 ET United States: ISM Manufacturing Prices · 12-02 08:15 ET United States: ADP Nonfarm Employment Change

### USDCHF  `USDCHF=X`  0.8345 (2026-11-27)
**Move:** 1w -1.1% · 4w +1.3% (49th pct of 2y 4w moves) · 13w +3.8% · 52w range position 88% (lo 0.7632 / hi 0.8441)
**Drivers (recent corr):** US10Y +0.41 [textbook] · ^VIX -0.06 [weak] · GC=F -0.29 [weak] → **in charge: US10Y** (US yields)
**Last 20 sessions decomposed (R² 0.26, n=60):** actual +1.3% = GC=F +0.1% · ^VIX +0.1% · US10Y +0.0% · unexplained +1.1%
**Positioning (CFTC SWISS FRANC, 2026-11-17, + = long USDCHF):** lev funds +19,763 (+16% OI, 4w +6,156, 97th pct of 3y) · asset mgrs +11,204 (+9% OI, 4w -14,331, 10th pct of 3y)
**This week:** 11-30 03:00 ET Switzerland: GDP · 12-01 02:30 ET Switzerland: Retail Sales · 12-01 10:00 ET United States: IBD/TIPP Economic Optimism · 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index · 12-01 10:00 ET United States: ISM Manufacturing PMI (cons 55.2, prev 55.5)


## 3. G10 crosses

### AUDNZD  `AUDNZD=X`  1.213 (2026-11-27)
**Move:** 1w -0.1% · 4w -2.8% (98th pct of 2y 4w moves) · 13w +0.4% · 52w range position 64% (lo 1.141 / hi 1.254)
**Drivers (recent corr):** HG=F +0.22 [weak] · ^AXJO -0.19 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.06, n=60):** actual -2.8% = HG=F -0.5% · ^AXJO +0.1% · unexplained -2.4%
**This week:** 12-01 19:30 ET Australia: GDP · 12-01 19:30 ET Australia: GDP Capital Expenditure · 12-01 19:30 ET Australia: GDP Chain Price Index · 12-01 19:30 ET Australia: GDP Final Consumption

### EURGBP  `EURGBP=X`  0.8369 (2026-11-27)
**Move:** 1w -0.1% · 4w +0.1% (10th pct of 2y 4w moves) · 13w -2.4% · 52w range position 9% (lo 0.8324 / hi 0.8796)
**Drivers (recent corr):** GB10Y +0.01 [weak] · FR_DE (missing) → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual +0.1% = GB10Y +0.0% · unexplained +0.1%
**This week:** 11-30 02:00 ET Germany: German Retail Sales · 12-01 04:00 ET Italy: Italian GDP (cons 0.0%, prev 0.0%) · 12-01 05:00 ET Euro Zone: Core CPI · 12-01 05:00 ET Euro Zone: CPI (cons 3.9%, prev 4.0%) · 12-02 02:45 ET France: French Government Budget Balance · 12-02 04:00 ET Italy: Italian Monthly Unemployment Rate

### EURCHF  `EURCHF=X`  0.9155 (2026-11-27)
**Move:** 1w -1.1% · 4w -0.6% (46th pct of 2y 4w moves) · 13w -2.3% · 52w range position 30% (lo 0.9023 / hi 0.9466)
**Drivers (recent corr):** ^STOXX50E +0.02 [weak] · FR_DE (missing) · ^VIX +0.06 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.03, n=60):** actual -0.6% = ^VIX +0.1% · ^STOXX50E -0.0% · unexplained -0.6%
**This week:** 11-30 02:00 ET Germany: German Retail Sales · 11-30 03:00 ET Switzerland: GDP · 12-01 02:30 ET Switzerland: Retail Sales · 12-01 04:00 ET Italy: Italian GDP (cons 0.0%, prev 0.0%) · 12-01 05:00 ET Euro Zone: Core CPI · 12-01 05:00 ET Euro Zone: CPI (cons 3.9%, prev 4.0%)


## 4. EM FX

### USDMXN  `USDMXN=X`  19.7 (2026-11-27)
**Move:** 1w +3.2% · 4w +4.5% (94th pct of 2y 4w moves) · 13w +16.1% · 52w range position 100% (lo 16.89 / hi 19.7)
**Drivers (recent corr):** ^VIX +0.18 [weak] · ^GSPC -0.20 [weak] · CL=F +0.50 [INVERTED] · USDBRL=X +0.06 [weak] → **in charge: CL=F** (Oil)
**Last 20 sessions decomposed (R² 0.13, n=60):** actual +4.4% = CL=F -1.6% · ^GSPC +0.7% · USDBRL=X +0.3% · ^VIX -0.3% · unexplained +5.2%
**Positioning (CFTC MEXICAN PESO, 2026-11-17, + = long USDMXN):** lev funds -62,245 (-22% OI, 4w +1,569, 15th pct of 3y) · asset mgrs +39,550 (+14% OI, 4w +15,486, 99th pct of 3y)
**This week:** 12-01 10:00 ET United States: IBD/TIPP Economic Optimism · 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index · 12-01 10:00 ET United States: ISM Manufacturing PMI (cons 55.2, prev 55.5) · 12-01 10:00 ET United States: ISM Manufacturing Prices · 12-02 08:15 ET United States: ADP Nonfarm Employment Change

### USDBRL  `USDBRL=X`  5.65 (2026-11-27)
**Move:** 1w -4.8% · 4w +4.9% (92nd pct of 2y 4w moves) · 13w +9.5% · 52w range position 72% (lo 4.906 / hi 5.933)
**Drivers (recent corr):** ^VIX +0.25 [weak] · HG=F -0.28 [weak] · EWZ -0.47 [textbook] → **in charge: EWZ** (Brazil equities (local flows))
**Last 20 sessions decomposed (R² 0.68, n=60):** actual +4.8% = EWZ -0.6% · HG=F -0.6% · ^VIX -0.0% · unexplained +5.9%
**Positioning (CFTC BRAZILIAN REAL, 2026-11-17, + = long USDBRL):** lev funds -27,429 (-25% OI, 4w -8,752, 3rd pct of 3y) · asset mgrs -31,278 (-28% OI, 4w +19,990, 66th pct of 3y)
**This week:** 11-30 06:30 ET Brazil: Net Debt-to-GDP ratio · 11-30 06:30 ET Brazil: Budget Balance · 11-30 06:30 ET Brazil: Budget Surplus · 11-30 06:30 ET Brazil: Gross Debt-to-GDP ratio · 12-01 10:00 ET United States: IBD/TIPP Economic Optimism · 12-01 10:00 ET United States: ISM Manufacturing Employment

### USDZAR  `USDZAR=X`  17.37 (2026-11-27)
**Move:** 1w -0.7% · 4w +4.6% (91st pct of 2y 4w moves) · 13w +8.6% · 52w range position 90% (lo 15.71 / hi 17.54)
**Drivers (recent corr):** GC=F -0.71 [textbook] · ^VIX +0.39 [textbook] · HG=F -0.69 [textbook] → **in charge: GC=F** (Gold / precious metals exporter)
**Last 20 sessions decomposed (R² 0.20, n=60):** actual +4.5% = HG=F +0.8% · GC=F +0.4% · ^VIX +0.2% · unexplained +3.1%
**Positioning (CFTC SO AFRICAN RAND, 2026-11-17, + = long USDZAR):** lev funds -3,934 (-10% OI, 4w +954, 34th pct of 3y) · asset mgrs -13,570 (-36% OI, 4w +4,392, 36th pct of 3y)
**This week:** 11-30 07:00 ET South Africa: Budget Balance · 12-01 04:00 ET South Africa: GDP · 12-01 04:00 ET South Africa: GDP Annualized · 12-01 10:00 ET United States: IBD/TIPP Economic Optimism · 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index

### USDKRW  `USDKRW=X`  1,344 (2026-11-27)
**Move:** 1w +0.7% · 4w +0.4% (18th pct of 2y 4w moves) · 13w -2.7% · 52w range position 9% (lo 1,324 / hi 1,552)
**Drivers (recent corr):** ^KS11 -0.22 [weak] · SOXX -0.47 [textbook] · DX-Y.NYB +0.11 [weak] → **in charge: SOXX** (Global semis cycle)
**Last 20 sessions decomposed (R² 0.06, n=60):** actual +0.4% = SOXX +0.5% · DX-Y.NYB +0.4% · ^KS11 -0.2% · unexplained -0.4%
**This week:** 11-29 18:00 ET South Korea: Retail Sales · 12-01 10:00 ET United States: IBD/TIPP Economic Optimism · 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index · 12-01 10:00 ET United States: ISM Manufacturing PMI (cons 55.2, prev 55.5) · 12-01 10:00 ET United States: ISM Manufacturing Prices


## 5. CE3 FX

### EURCZK  `EURCZK=X`  24.4 (2026-11-27)
**Move:** 1w -0.0% · 4w +0.3% (44th pct of 2y 4w moves) · 13w +1.2% · 52w range position 72% (lo 24.07 / hi 24.53)
**Drivers (recent corr):** ^STOXX50E -0.16 [weak] · EURPLN=X +0.44 [textbook] → **in charge: EURPLN=X** (CE3 block)
**Last 20 sessions decomposed (R² 0.25, n=60):** actual +0.3% = EURPLN=X +0.4% · ^STOXX50E +0.0% · unexplained -0.1%
**This week:** 11-30 02:00 ET Germany: German Retail Sales · 12-01 04:00 ET Italy: Italian GDP (cons 0.0%, prev 0.0%) · 12-01 05:00 ET Euro Zone: Core CPI · 12-01 05:00 ET Euro Zone: CPI (cons 3.9%, prev 4.0%) · 12-02 02:45 ET France: French Government Budget Balance · 12-02 04:00 ET Italy: Italian Monthly Unemployment Rate

### EURPLN  `EURPLN=X`  4.475 (2026-11-27)
**Move:** 1w +0.9% · 4w +2.0% (96th pct of 2y 4w moves) · 13w +3.3% · 52w range position 100% (lo 4.197 / hi 4.475)
**Drivers (recent corr):** ^STOXX50E -0.24 [weak] · ^VIX +0.39 [textbook] → **in charge: ^VIX** (Risk)
**Last 20 sessions decomposed (R² 0.10, n=60):** actual +2.0% = ^VIX +0.1% · ^STOXX50E +0.0% · unexplained +1.8%
**This week:** 11-30 02:00 ET Germany: German Retail Sales · 12-01 04:00 ET Italy: Italian GDP (cons 0.0%, prev 0.0%) · 12-01 05:00 ET Euro Zone: Core CPI · 12-01 05:00 ET Euro Zone: CPI (cons 3.9%, prev 4.0%) · 12-02 02:45 ET France: French Government Budget Balance · 12-02 04:00 ET Italy: Italian Monthly Unemployment Rate


## 6. Equities

### S&P 500  `^GSPC`  7,297 (2026-11-27)
**Move:** 1w +5.6% · 4w -3.7% (71st pct of 2y 4w moves) · 13w -5.4% · 52w range position 65% (lo 6,344 / hi 7,819)
**Drivers (recent corr):** US10Y +0.41 [INVERTED] · HYG_TLT +0.47 [textbook] · DX-Y.NYB +0.14 [weak] · CL=F -0.46 [textbook] · ^VIX -0.97 [textbook] → **in charge: ^VIX** (Vol)
**Last 20 sessions decomposed (R² 0.90, n=60):** actual -3.8% = ^VIX -1.9% · CL=F +0.5% · DX-Y.NYB +0.1% · HYG_TLT -0.1% · US10Y -0.0% · unexplained -2.4%
**Positioning (CFTC E-MINI S&P 500, 2026-11-17, + = long S&P 500):** lev funds -234,978 (-11% OI, 4w +136,267, 94th pct of 3y) · asset mgrs +895,049 (+43% OI, 4w -6,328, 26th pct of 3y)
**This week:** 12-01 10:00 ET United States: IBD/TIPP Economic Optimism · 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index · 12-01 10:00 ET United States: ISM Manufacturing PMI (cons 55.2, prev 55.5) · 12-01 10:00 ET United States: ISM Manufacturing Prices · 12-02 08:15 ET United States: ADP Nonfarm Employment Change

### Nasdaq 100  `^NDX`  26,726 (2026-11-27)
**Move:** 1w +6.8% · 4w -5.8% (77th pct of 2y 4w moves) · 13w -9.2% · 52w range position 46% (lo 22,953 / hi 31,224)
**Drivers (recent corr):** US10Y +0.45 [INVERTED] · SOXX +0.96 [textbook] · HYG_TLT +0.47 [textbook] · BTC-USD +0.76 [textbook] → **in charge: SOXX** (Semis / AI capex)
**Last 20 sessions decomposed (R² 0.92, n=60):** actual -6.0% = SOXX -6.2% · BTC-USD -3.3% · HYG_TLT -0.2% · US10Y -0.0% · unexplained +3.7%
**Positioning (CFTC NASDAQ MINI, 2026-11-17, + = long Nasdaq 100):** lev funds -10,928 (-4% OI, 4w -11,878, 85th pct of 3y) · asset mgrs +82,900 (+28% OI, 4w +5,110, 76th pct of 3y)
**This week:** 12-01 10:00 ET United States: IBD/TIPP Economic Optimism · 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index · 12-01 10:00 ET United States: ISM Manufacturing PMI (cons 55.2, prev 55.5) · 12-01 10:00 ET United States: ISM Manufacturing Prices · 12-02 08:15 ET United States: ADP Nonfarm Employment Change

### Russell 2000  `^RUT`  2,750 (2026-11-27)
**Move:** 1w +6.5% · 4w -2.2% (30th pct of 2y 4w moves) · 13w -7.5% · 52w range position 51% (lo 2,414 / hi 3,068)
**Drivers (recent corr):** US2Y +0.35 [INVERTED] · HYG_TLT +0.33 [textbook] · ^GSPC +0.94 [textbook] → **in charge: ^GSPC** (Beta)
**Last 20 sessions decomposed (R² 0.81, n=60):** actual -2.2% = ^GSPC -3.7% · US2Y -0.1% · HYG_TLT +0.0% · unexplained +1.5%
**This week:** 12-01 10:00 ET United States: IBD/TIPP Economic Optimism · 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index · 12-01 10:00 ET United States: ISM Manufacturing PMI (cons 55.2, prev 55.5) · 12-01 10:00 ET United States: ISM Manufacturing Prices · 12-02 08:15 ET United States: ADP Nonfarm Employment Change

### Euro Stoxx 50  `^STOXX50E`  6,089 (2026-11-27)
**Move:** 1w +2.5% · 4w -0.7% (14th pct of 2y 4w moves) · 13w -6.1% · 52w range position 56% (lo 5,501 / hi 6,551)
**Drivers (recent corr):** FR_DE (missing) · ^GSPC +0.70 [textbook] · BZ=F -0.54 [textbook] · EURUSD=X -0.25 [weak] → **in charge: ^GSPC** (US lead)
**Last 20 sessions decomposed (R² 0.44, n=60):** actual -0.7% = BZ=F +2.2% · ^GSPC -1.8% · EURUSD=X +0.2% · unexplained -1.3%
**This week:** 11-30 02:00 ET Germany: German Retail Sales · 12-01 04:00 ET Italy: Italian GDP (cons 0.0%, prev 0.0%) · 12-01 05:00 ET Euro Zone: Core CPI · 12-01 05:00 ET Euro Zone: CPI (cons 3.9%, prev 4.0%) · 12-02 02:45 ET France: French Government Budget Balance · 12-02 04:00 ET Italy: Italian Monthly Unemployment Rate

### CAC 40  `^FCHI`  8,156 (2026-11-27)
**Move:** 1w +2.9% · 4w +2.3% (50th pct of 2y 4w moves) · 13w -2.9% · 52w range position 46% (lo 7,666 / hi 8,726)
**Drivers (recent corr):** FR_DE (missing) · ^STOXX50E +0.95 [textbook] → **in charge: ^STOXX50E** (European block)
**Last 20 sessions decomposed (R² 0.82, n=60):** actual +2.3% = ^STOXX50E -0.5% · unexplained +2.8%
**This week:** 11-30 02:00 ET Germany: German Retail Sales · 12-01 04:00 ET Italy: Italian GDP (cons 0.0%, prev 0.0%) · 12-01 05:00 ET Euro Zone: Core CPI · 12-01 05:00 ET Euro Zone: CPI (cons 3.9%, prev 4.0%) · 12-02 02:45 ET France: French Government Budget Balance · 12-02 04:00 ET Italy: Italian Monthly Unemployment Rate

### DAX  `^GDAXI`  25,441 (2026-11-27)
**Move:** 1w +2.6% · 4w -1.5% (28th pct of 2y 4w moves) · 13w -4.2% · 52w range position 70% (lo 22,301 / hi 26,772)
**Drivers (recent corr):** DE10Y +0.46 [INVERTED] · ^GSPC +0.66 [textbook] → **in charge: ^GSPC** (Global risk)
**Last 20 sessions decomposed (R² 0.35, n=60):** actual -1.5% = ^GSPC -1.9% · DE10Y -0.1% · unexplained +0.5%
**This week:** 11-30 02:00 ET Germany: German Retail Sales · 12-01 04:00 ET Italy: Italian GDP (cons 0.0%, prev 0.0%) · 12-01 05:00 ET Euro Zone: Core CPI · 12-01 05:00 ET Euro Zone: CPI (cons 3.9%, prev 4.0%) · 12-02 02:45 ET France: French Government Budget Balance · 12-02 04:00 ET Italy: Italian Monthly Unemployment Rate

### FTSE 100  `^FTSE`  10,699 (2026-11-27)
**Move:** 1w +3.4% · 4w -0.3% (9th pct of 2y 4w moves) · 13w -1.2% · 52w range position 83% (lo 9,642 / hi 10,911)
**Drivers (recent corr):** BZ=F -0.42 [INVERTED] · GBPUSD=X +0.03 [weak] · GB10Y -0.17 [weak] → **in charge: BZ=F** (Energy-heavy index)
**Last 20 sessions decomposed (R² 0.21, n=60):** actual -0.3% = BZ=F +1.3% · GB10Y +0.8% · GBPUSD=X +0.0% · unexplained -2.4%

### Nikkei 225  `^N225`  58,711 (2026-11-27)
**Move:** 1w +4.0% · 4w -7.2% (71st pct of 2y 4w moves) · 13w -11.6% · 52w range position 42% (lo 49,002 / hi 72,366)
**Drivers (recent corr):** USDJPY=X +0.11 [weak] · ^NDX +0.66 [textbook] · SOXX +0.68 [textbook] → **in charge: SOXX** (Chips (prior US day))
**Last 20 sessions decomposed (R² 0.33, n=60):** actual -7.5% = SOXX -6.2% · ^NDX -1.2% · USDJPY=X +0.1% · unexplained -0.2%
**This week:** 11-29 18:50 ET Japan: Large Scale Retail Sales YoY · 11-29 18:50 ET Japan: Retail Sales · 11-30 18:30 ET Japan: Unemployment Rate

### KOSPI  `^KS11`  4,916 (2026-11-27)
**Move:** 1w +0.9% · 4w -14.2% (77th pct of 2y 4w moves) · 13w -27.6% · 52w range position 19% (lo 3,920 / hi 9,115)
**Drivers (recent corr):** SOXX +0.70 [textbook] · ^NDX +0.62 [textbook] → **in charge: SOXX** (Memory / AI hardware (prior US day))
**Last 20 sessions decomposed (R² 0.35, n=60):** actual -15.3% = SOXX -23.8% · ^NDX +11.5% · unexplained -3.1%
**This week:** 11-29 18:00 ET South Korea: Retail Sales · 12-01 18:00 ET South Korea: CPI

### Hang Seng  `^HSI`  22,695 (2026-11-27)
**Move:** 1w +1.3% · 4w -2.6% (40th pct of 2y 4w moves) · 13w -11.3% · 52w range position 12% (lo 21,966 / hi 27,968)
**Drivers (recent corr):** ^NDX +0.15 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual -2.6% = ^NDX -0.3% · unexplained -2.3%
**This week:** 12-01 03:30 ET Hong Kong: Retail Sales

### ASX 200  `^AXJO`  8,834 (2026-11-27)
**Move:** 1w +2.8% · 4w -0.8% (17th pct of 2y 4w moves) · 13w -2.8% · 52w range position 52% (lo 8,366 / hi 9,272)
**Drivers (recent corr):** HG=F +0.55 [textbook] · ^GSPC +0.65 [textbook] → **in charge: ^GSPC** (US lead (prior US day))
**Last 20 sessions decomposed (R² 0.33, n=60):** actual -0.8% = HG=F -2.6% · ^GSPC -1.8% · unexplained +3.5%
**This week:** 12-01 19:30 ET Australia: GDP · 12-01 19:30 ET Australia: GDP Capital Expenditure · 12-01 19:30 ET Australia: GDP Chain Price Index · 12-01 19:30 ET Australia: GDP Final Consumption


## 7. Rates

### US 2y  `US2Y`  4.75% (2026-11-27)
**Move:** 1w +4bp · 4w +2bp (14th pct of 2y 4w moves) · 13w +26bp · 52w range position 78% (lo 3.512 / hi 5.089)
**Drivers (recent corr):** CL=F +0.07 [weak] · ^GSPC +0.50 [textbook] → **in charge: ^GSPC** (Risk-on = fewer cuts / more hikes)
**Last 20 sessions decomposed (R² 0.10, n=60):** actual +2bp = ^GSPC -6bp · CL=F -4bp · unexplained +13bp
**Positioning (CFTC UST 2Y NOTE, 2026-11-17, + = long US 2y):** lev funds +1,288,895 (+29% OI, 4w +3,347, 5th pct of 3y) · asset mgrs -1,655,991 (-37% OI, 4w +67,589, 81st pct of 3y)
**This week:** 12-01 10:00 ET United States: IBD/TIPP Economic Optimism · 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index · 12-01 10:00 ET United States: ISM Manufacturing PMI (cons 55.2, prev 55.5) · 12-01 10:00 ET United States: ISM Manufacturing Prices · 12-02 08:15 ET United States: ADP Nonfarm Employment Change

### US 10y  `US10Y`  4.94% (2026-11-27)
**Move:** 1w +2bp · 4w +1bp (3rd pct of 2y 4w moves) · 13w +22bp · 52w range position 72% (lo 3.962 / hi 5.311)
**Drivers (recent corr):** CL=F +0.16 [weak] · ^NDX +0.45 [INVERTED] · T10YIE (missing) · DE10Y +0.38 [textbook] → **in charge: ^NDX** (Textbook: yields up hurt stocks; + means bonds hedge stocks)
**Last 20 sessions decomposed (R² 0.20, n=60):** actual +1bp = ^NDX -7bp · CL=F -6bp · DE10Y -2bp · unexplained +16bp
**Positioning (CFTC UST 10Y NOTE, 2026-11-17, + = long US 10y):** lev funds +2,482,443 (+40% OI, 4w +375,219, 99th pct of 3y) · asset mgrs -3,270,834 (-52% OI, 4w -345,418, 1st pct of 3y)
**This week:** 12-01 10:00 ET United States: IBD/TIPP Economic Optimism · 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index · 12-01 10:00 ET United States: ISM Manufacturing PMI (cons 55.2, prev 55.5) · 12-01 10:00 ET United States: ISM Manufacturing Prices · 12-02 08:15 ET United States: ADP Nonfarm Employment Change

### US 30y  `US30Y`  5.32% (2026-11-27)
**Move:** 1w +2bp · 4w +2bp (10th pct of 2y 4w moves) · 13w +12bp · 52w range position 67% (lo 4.633 / hi 5.665)
**Drivers (recent corr):** US2Y +0.93 [textbook] · T10YIE (missing) → **in charge: US2Y** (Front end)
**Last 20 sessions decomposed (R² 0.76, n=60):** actual +2bp = US2Y +2bp · unexplained -0bp
**Positioning (CFTC UST BOND, 2026-11-17, + = long US 30y):** lev funds +145,229 (+7% OI, 4w -17,528, 1st pct of 3y) · asset mgrs -371,794 (-19% OI, 4w +16,213, 99th pct of 3y)
**This week:** 12-01 10:00 ET United States: IBD/TIPP Economic Optimism · 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index · 12-01 10:00 ET United States: ISM Manufacturing PMI (cons 55.2, prev 55.5) · 12-01 10:00 ET United States: ISM Manufacturing Prices · 12-02 08:15 ET United States: ADP Nonfarm Employment Change

### Bund 10y  `DE10Y`  3.33% (2026-11-27)
**Move:** 1w -4bp · 4w -5bp (25th pct of 2y 4w moves) · 13w +13bp · 52w range position 66% (lo 2.69 / hi 3.66)
**Drivers (recent corr):** US10Y +0.38 [textbook] · BZ=F -0.11 [weak] · FR_DE (missing) → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.08, n=60):** actual -5bp = BZ=F +3bp · US10Y +0bp · unexplained -9bp
**This week:** 11-30 02:00 ET Germany: German Retail Sales · 12-01 04:00 ET Italy: Italian GDP (cons 0.0%, prev 0.0%) · 12-01 05:00 ET Euro Zone: Core CPI · 12-01 05:00 ET Euro Zone: CPI (cons 3.9%, prev 4.0%) · 12-02 02:45 ET France: French Government Budget Balance · 12-02 04:00 ET Italy: Italian Monthly Unemployment Rate

### Gilt 10y  `GB10Y`  5.13% (2026-11-27)
**Move:** 1w -10bp · 4w -15bp (60th pct of 2y 4w moves) · 13w -1bp · 52w range position 69% (lo 4.352 / hi 5.478)
**Drivers (recent corr):** US10Y +0.72 [textbook] · GBPUSD=X -0.27 [weak] → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.39, n=60):** actual -15bp = US10Y +0bp · GBPUSD=X +0bp · unexplained -15bp

### JGB 10y  `JP10Y`  2.70% (2026-11-27)
**Move:** 1w -13bp · 4w -11bp (50th pct of 2y 4w moves) · 13w -23bp · 52w range position 69% (lo 1.812 / hi 3.111)
**Drivers (recent corr):** US10Y +0.63 [textbook] · USDJPY=X +0.62 [textbook] → **in charge: US10Y** (Global duration)
**Last 20 sessions decomposed (R² 0.47, n=60):** actual -11bp = US10Y -5bp · USDJPY=X +3bp · unexplained -10bp
**This week:** 11-29 18:50 ET Japan: Large Scale Retail Sales YoY · 11-29 18:50 ET Japan: Retail Sales · 11-30 18:30 ET Japan: Unemployment Rate

### Canada 10y  `CA10Y`  3.64% (2026-11-27)
**Move:** 1w -5bp · 4w -14bp (58th pct of 2y 4w moves) · 13w -9bp · 52w range position 59% (lo 3.13 / hi 3.99)
**Drivers (recent corr):** US10Y +0.88 [textbook] · CL=F +0.29 [weak] → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.73, n=60):** actual -14bp = CL=F -6bp · US10Y +0bp · unexplained -9bp
**This week:** 11-30 08:30 ET Canada: GDP Implicit Price · 11-30 08:30 ET Canada: GDP (cons -0.1%, prev 0.0%) · 11-30 08:30 ET Canada: GDP Annualized · 12-04 08:30 ET Canada: Employment Change · 12-04 08:30 ET Canada: Full Employment Change · 12-04 08:30 ET Canada: Part Time Employment Change

### French spread (proxy)
_no data_


## 8. Commodities

### WTI crude  `CL=F`  83.08 (2026-11-27)
**Move:** 1w -1.1% · 4w -20.2% (89th pct of 2y 4w moves) · 13w -0.4% · 52w range position 48% (lo 55.27 / hi 112.9)
**Drivers (recent corr):** XLE +0.66 [textbook] · ^GSPC -0.46 [INVERTED] · HG=F -0.36 [INVERTED] · DX-Y.NYB +0.20 [weak] → **in charge: XLE** (Energy equities (do they believe the move?))
**Last 20 sessions decomposed (R² 0.28, n=60):** actual -22.6% = XLE -8.3% · HG=F +4.9% · ^GSPC +2.4% · DX-Y.NYB -0.6% · unexplained -21.0%
**Positioning (CFTC WTI-PHYSICAL, 2026-11-17, + = long WTI crude):** managed money +15,814 (+1% OI, 4w -20,373, 10th pct of 3y) · producers +385,227 (+21% OI, 4w +25,659, 99th pct of 3y)
**This week:** 12-01 10:00 ET United States: IBD/TIPP Economic Optimism · 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index · 12-01 10:00 ET United States: ISM Manufacturing PMI (cons 55.2, prev 55.5) · 12-01 10:00 ET United States: ISM Manufacturing Prices · 12-02 08:15 ET United States: ADP Nonfarm Employment Change

### Gold  `GC=F`  3,668 (2026-11-27)
**Move:** 1w +4.4% · 4w -5.9% (60th pct of 2y 4w moves) · 13w -19.0% · 52w range position 8% (lo 3,515 / hi 5,318)
**Drivers (recent corr):** DFII10 (missing) · DX-Y.NYB -0.07 [weak] · SI=F +0.93 [textbook] · BTC-USD +0.61 [textbook] → **in charge: SI=F** (Precious block)
**Last 20 sessions decomposed (R² 0.82, n=60):** actual -6.1% = SI=F -5.6% · DX-Y.NYB -0.3% · BTC-USD +0.0% · unexplained -0.2%
**Positioning (CFTC GOLD, 2026-11-17, + = long Gold):** managed money +102,942 (+25% OI, 4w -1,264, 21st pct of 3y) · producers -4,591 (-1% OI, 4w +10,192, 100th pct of 3y)
**This week:** 12-01 10:00 ET United States: IBD/TIPP Economic Optimism · 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index · 12-01 10:00 ET United States: ISM Manufacturing PMI (cons 55.2, prev 55.5) · 12-01 10:00 ET United States: ISM Manufacturing Prices · 12-02 08:15 ET United States: ADP Nonfarm Employment Change

### Silver  `SI=F`  43.7 (2026-11-27)
**Move:** 1w +6.5% · 4w -11.0% (66th pct of 2y 4w moves) · 13w -34.8% · 52w range position 5% (lo 40.05 / hi 115.1)
**Drivers (recent corr):** GC=F +0.93 [textbook] · HG=F +0.87 [textbook] → **in charge: GC=F** (Gold)
**Last 20 sessions decomposed (R² 0.87, n=60):** actual -11.6% = GC=F -8.1% · HG=F -7.0% · unexplained +3.5%
**Positioning (CFTC SILVER, 2026-11-17, + = long Silver):** managed money +1,280 (+1% OI, 4w -2,225, 3rd pct of 3y) · producers -12,877 (-10% OI, 4w +2,152, 98th pct of 3y)
**This week:** 12-01 10:00 ET United States: IBD/TIPP Economic Optimism · 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index · 12-01 10:00 ET United States: ISM Manufacturing PMI (cons 55.2, prev 55.5) · 12-01 10:00 ET United States: ISM Manufacturing Prices · 12-02 08:15 ET United States: ADP Nonfarm Employment Change

### Copper  `HG=F`  5.601 (2026-11-27)
**Move:** 1w +2.3% · 4w -13.3% (91st pct of 2y 4w moves) · 13w -14.7% · 52w range position 27% (lo 5.161 / hi 6.804)
**Drivers (recent corr):** ^GSPC +0.57 [textbook] → **in charge: ^GSPC** (Global growth)
**Last 20 sessions decomposed (R² 0.19, n=60):** actual -14.3% = ^GSPC -2.4% · unexplained -11.8%
**Positioning (CFTC COPPER- #1, 2026-11-17, + = long Copper):** managed money +28,692 (+9% OI, 4w -18,998, 42nd pct of 3y) · producers -33,014 (-10% OI, 4w +44,392, 87th pct of 3y)
**This week:** 12-01 10:00 ET United States: IBD/TIPP Economic Optimism · 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index · 12-01 10:00 ET United States: ISM Manufacturing PMI (cons 55.2, prev 55.5) · 12-01 10:00 ET United States: ISM Manufacturing Prices · 12-02 08:15 ET United States: ADP Nonfarm Employment Change

### Nat gas (US)  `NG=F`  3.491 (2026-11-27)
**Move:** 1w +2.3% · 4w +20.5% (86th pct of 2y 4w moves) · 13w +20.9% · 52w range position 20% (lo 2.523 / hi 7.46)
**Drivers (recent corr):** CL=F +0.09 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual +18.6% = CL=F -0.9% · unexplained +19.5%
**Positioning (CFTC NAT GAS NYME, 2026-11-17, + = long Nat gas (US)):** managed money -211,545 (-13% OI, 4w -54,136, 2nd pct of 3y) · producers +17,473 (+1% OI, 4w +30,627, 96th pct of 3y)
**This week:** 12-01 10:00 ET United States: IBD/TIPP Economic Optimism · 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index · 12-01 10:00 ET United States: ISM Manufacturing PMI (cons 55.2, prev 55.5) · 12-01 10:00 ET United States: ISM Manufacturing Prices · 12-02 08:15 ET United States: ADP Nonfarm Employment Change


## 9. Crypto

### Bitcoin  `BTC-USD`  60,495 (2026-11-27)
**Move:** 1w +2.9% · 4w -21.6% (90th pct of 2y 4w moves) · 13w -22.3% · 52w range position 5% (lo 58,559 / hi 96,929)
**Drivers (recent corr):** ^NDX +0.76 [textbook] · DX-Y.NYB +0.01 [weak] · GC=F +0.61 [textbook] → **in charge: ^NDX** (Tech / speculation)
**Last 20 sessions decomposed (R² 0.46, n=60):** actual -24.4% = ^NDX -4.8% · DX-Y.NYB -1.8% · GC=F -0.4% · unexplained -17.4%
**Positioning (CFTC BITCOIN, 2026-11-17, + = long Bitcoin):** lev funds -1,211 (-6% OI, 4w +3,731, 100th pct of 3y) · asset mgrs +2,285 (+12% OI, 4w -714, 3rd pct of 3y)
**This week:** 12-01 10:00 ET United States: IBD/TIPP Economic Optimism · 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index · 12-01 10:00 ET United States: ISM Manufacturing PMI (cons 55.2, prev 55.5) · 12-01 10:00 ET United States: ISM Manufacturing Prices · 12-02 08:15 ET United States: ADP Nonfarm Employment Change

