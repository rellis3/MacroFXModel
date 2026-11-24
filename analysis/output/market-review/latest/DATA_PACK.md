# Market Review Data Pack: 2026-11-24

Fetched 2026-11-24T06:21:20+00:00. Descriptive numbers for the weekly review (read with `education/market_reviews/PLAYBOOK.md`). Correlations are of daily moves: last 20 sessions vs the 60 before. They are noisy; a flip is a question, not a signal.

**Data notes:** fred DGS2: The read operation timed out · fred DFII10: The read operation timed out · fred T10YIE: The read operation timed out · fred BAMLH0A0HYM2: The read operation timed out · fred BAMLC0A0CM: The read operation timed out · calendar 2026-11-25: only 0 calendar rows after retries · FRED DGS2 missing: US 2y = US 5y stand-in for this run · No local OAT/Bund futures: French spread proxy unavailable

## 1. Regime gauges: which story is the market trading?

| Pair | Recent | Before | Textbook sign | Status | What it means |
|---|---|---|---|---|---|
| CL=F vs US10Y | +0.15 | -0.01 | + | weak | Oil vs yields: + = oil is an inflation story; - = oil is a growth tax (2008-style) |
| ^NDX vs US10Y | +0.46 | +0.06 | − | INVERTED | Stocks vs yields: - = rates drive stocks; + = growth scare, bonds hedge stocks |
| HYG_TLT vs ^NDX | +0.48 | +0.24 | + | textbook | Credit vs tech: high + = credit and equities are one trade (credit stress leading) |
| DX-Y.NYB vs ^GSPC | +0.11 | +0.07 | − | weak | Dollar vs stocks: - = safe-haven dollar; ~0/+ = "sell America" or liquidity dash |
| AUDUSD=X vs ^NDX | +0.28 | +0.30 | + | weak | Aussie vs tech: near 0 = AUD trading commodities not risk |
| BTC-USD vs ^NDX | +0.59 | +0.43 | + | textbook | Bitcoin vs tech: high = one liquidity complex |
| XLE vs CL=F | +0.64 | +0.20 | + | textbook | Energy stocks vs oil: falling = equity investors fade the oil move |
| USDJPY=X vs US10Y | +0.43 | +0.34 | + | textbook | Yen vs yields: high = yen is a pure rates trade |

Equity vol vs bond vol: VIX 26.6 (1y pct 96) · MOVE 101 (1y pct 90). When bond vol leads equity vol, the stress is in rates/credit first.

## 2. G10 FX

### EURUSD  `EURUSD=X`  1.091 (2026-11-24)
**Move:** 1w -0.7% · 4w -2.0% (73rd pct of 2y 4w moves) · 13w -6.5% · 52w range position 0% (lo 1.091 / hi 1.202)
**Drivers (recent corr):** US_EA2 -0.24 [weak] · US_DE10 -0.23 [weak] · FR_DE (missing) · ^STOXX50E -0.17 [weak] · BZ=F -0.18 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.03, n=60):** actual -2.0% = BZ=F +0.3% · US_EA2 +0.1% · US_DE10 -0.0% · ^STOXX50E -0.0% · unexplained -2.3%
**Positioning (CFTC EURO FX, 2026-11-17, + = long EURUSD):** lev funds -76,587 (-9% OI, 4w -7,747, 1st pct of 3y) · asset mgrs +147,234 (+17% OI, 4w -43,187, 1st pct of 3y)
**This week:** 11-27 02:45 ET France: French GDP (cons -0.1%, prev -0.1%) · 11-27 03:00 ET Spain: Core CPI · 11-27 03:00 ET Spain: Spanish Retail Sales · 11-27 03:55 ET Germany: German Unemployment Change (cons 5K, prev 4K) · 11-27 03:55 ET Germany: German Unemployment Rate · 11-30 02:00 ET Germany: German Retail Sales

### USDJPY  `USDJPY=X`  159.2 (2026-11-24)
**Move:** 1w -0.2% · 4w +0.8% (29th pct of 2y 4w moves) · 13w +0.0% · 52w range position 60% (lo 152.5 / hi 163.9)
**Drivers (recent corr):** US10Y +0.43 [textbook] · US_JP10 +0.15 [weak] · ^NDX +0.30 [weak] · ^VIX -0.30 [textbook] → **in charge: US10Y** (US yields: the carry engine)
**Last 20 sessions decomposed (R² 0.12, n=60):** actual +0.8% = ^NDX -0.5% · US10Y -0.3% · ^VIX +0.3% · US_JP10 +0.1% · unexplained +1.2%
**Positioning (CFTC JAPANESE YEN, 2026-11-17, + = long USDJPY):** lev funds +23,790 (+6% OI, 4w +900, 30th pct of 3y) · asset mgrs -84,681 (-22% OI, 4w -5,578, 12th pct of 3y)
**This week:** 11-26 18:30 ET Japan: Tokyo Core CPI (cons 2.9%, prev 2.6%) · 11-29 18:50 ET Japan: Large Scale Retail Sales YoY · 11-29 18:50 ET Japan: Retail Sales · 11-30 18:30 ET Japan: Unemployment Rate · 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index

### GBPUSD  `GBPUSD=X`  1.304 (2026-11-24)
**Move:** 1w -1.2% · 4w -2.0% (73rd pct of 2y 4w moves) · 13w -4.4% · 52w range position 0% (lo 1.304 / hi 1.383)
**Drivers (recent corr):** US_GB10 -0.10 [weak] · GB10Y -0.35 [INVERTED] · ^GSPC -0.01 [weak] · EURUSD=X +0.85 [textbook] → **in charge: EURUSD=X** (European block move)
**Last 20 sessions decomposed (R² 0.70, n=60):** actual -2.0% = EURUSD=X -1.8% · ^GSPC -0.3% · US_GB10 +0.1% · GB10Y +0.0% · unexplained -0.0%
**Positioning (CFTC BRITISH POUND, 2026-11-17, + = long GBPUSD):** lev funds +28,790 (+12% OI, 4w +4,686, 39th pct of 3y) · asset mgrs -104,615 (-45% OI, 4w +30,006, 22nd pct of 3y)
**This week:** 11-26 05:30 ET United Kingdom: BoE FPC Meeting Minutes · 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index · 12-01 10:00 ET United States: ISM Manufacturing PMI · 12-01 10:00 ET United States: ISM Manufacturing Prices

### USDCAD  `USDCAD=X`  1.436 (2026-11-24)
**Move:** 1w +0.4% · 4w +2.2% (87th pct of 2y 4w moves) · 13w +3.8% · 52w range position 100% (lo 1.349 / hi 1.436)
**Drivers (recent corr):** CL=F +0.06 [weak] · US_CA2 +0.20 [weak] · ^GSPC +0.06 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.19, n=60):** actual +2.2% = ^GSPC +0.2% · US_CA2 +0.2% · CL=F -0.1% · unexplained +1.9%
**Positioning (CFTC CANADIAN DOLLAR, 2026-11-17, + = long USDCAD):** lev funds +72,118 (+20% OI, 4w -18,995, 73rd pct of 3y) · asset mgrs -5,365 (-1% OI, 4w -10,764, 13th pct of 3y)
**This week:** 11-27 11:00 ET Canada: Budget Balance · 11-30 08:30 ET Canada: GDP Implicit Price · 11-30 08:30 ET Canada: GDP · 11-30 08:30 ET Canada: GDP Annualized · 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index

### AUDUSD  `AUDUSD=X`  0.6632 (2026-11-24)
**Move:** 1w -1.6% · 4w -5.7% (99th pct of 2y 4w moves) · 13w -7.4% · 52w range position 21% (lo 0.647 / hi 0.7255)
**Drivers (recent corr):** HG=F +0.20 [weak] · ^NDX +0.28 [weak] · GC=F +0.21 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.10, n=60):** actual -5.8% = ^NDX -0.7% · HG=F -0.5% · GC=F +0.3% · unexplained -5.0%
**Positioning (CFTC AUSTRALIAN DOLLAR, 2026-11-17, + = long AUDUSD):** lev funds +37,980 (+10% OI, 4w -14,517, 75th pct of 3y) · asset mgrs -182,725 (-49% OI, 4w -53,986, 1st pct of 3y)
**This week:** 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index · 12-01 10:00 ET United States: ISM Manufacturing PMI · 12-01 10:00 ET United States: ISM Manufacturing Prices · 12-01 19:30 ET Australia: GDP · 12-01 19:30 ET Australia: GDP Capital Expenditure

### NZDUSD  `NZDUSD=X`  0.5451 (2026-11-24)
**Move:** 1w -0.9% · 4w -4.0% (91st pct of 2y 4w moves) · 13w -8.8% · 52w range position 0% (lo 0.5451 / hi 0.6076)
**Drivers (recent corr):** AUDUSD=X +0.45 [textbook] · ^GSPC +0.11 [weak] · US2Y -0.28 [weak] → **in charge: AUDUSD=X** (Antipodean block)
**Last 20 sessions decomposed (R² 0.36, n=60):** actual -4.1% = AUDUSD=X -3.0% · US2Y +0.1% · ^GSPC -0.1% · unexplained -1.2%
**Positioning (CFTC NZ DOLLAR, 2026-11-17, + = long NZDUSD):** lev funds -23,595 (-17% OI, 4w -4,315, 8th pct of 3y) · asset mgrs -47,524 (-35% OI, 4w +1,789, 11th pct of 3y)
**This week:** 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index · 12-01 10:00 ET United States: ISM Manufacturing PMI · 12-01 10:00 ET United States: ISM Manufacturing Prices

### USDCHF  `USDCHF=X`  0.8414 (2026-11-24)
**Move:** 1w +0.0% · 4w +1.5% (57th pct of 2y 4w moves) · 13w +5.0% · 52w range position 97% (lo 0.7632 / hi 0.8441)
**Drivers (recent corr):** US10Y +0.44 [textbook] · ^VIX -0.04 [weak] · GC=F -0.33 [textbook] → **in charge: US10Y** (US yields)
**Last 20 sessions decomposed (R² 0.28, n=60):** actual +1.5% = US10Y -0.3% · GC=F +0.1% · ^VIX +0.1% · unexplained +1.5%
**Positioning (CFTC SWISS FRANC, 2026-11-17, + = long USDCHF):** lev funds +19,763 (+16% OI, 4w +6,156, 97th pct of 3y) · asset mgrs +11,204 (+9% OI, 4w -14,331, 10th pct of 3y)
**This week:** 11-30 03:00 ET Switzerland: GDP · 12-01 02:30 ET Switzerland: Retail Sales · 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index · 12-01 10:00 ET United States: ISM Manufacturing PMI · 12-01 10:00 ET United States: ISM Manufacturing Prices


## 3. G10 crosses

### AUDNZD  `AUDNZD=X`  1.216 (2026-11-24)
**Move:** 1w -0.8% · 4w -1.7% (81st pct of 2y 4w moves) · 13w +1.5% · 52w range position 67% (lo 1.141 / hi 1.254)
**Drivers (recent corr):** HG=F +0.08 [weak] · ^AXJO -0.13 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.06, n=60):** actual -1.7% = HG=F -0.7% · ^AXJO +0.1% · unexplained -1.1%
**This week:** 12-01 19:30 ET Australia: GDP · 12-01 19:30 ET Australia: GDP Capital Expenditure · 12-01 19:30 ET Australia: GDP Chain Price Index · 12-01 19:30 ET Australia: GDP Final Consumption

### EURGBP  `EURGBP=X`  0.8365 (2026-11-24)
**Move:** 1w +0.5% · 4w +0.0% (4th pct of 2y 4w moves) · 13w -2.2% · 52w range position 9% (lo 0.8324 / hi 0.8796)
**Drivers (recent corr):** GB10Y +0.03 [weak] · FR_DE (missing) → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual +0.0% = GB10Y +0.0% · unexplained +0.0%
**This week:** 11-26 05:30 ET United Kingdom: BoE FPC Meeting Minutes · 11-27 02:45 ET France: French GDP (cons -0.1%, prev -0.1%) · 11-27 03:00 ET Spain: Core CPI · 11-27 03:00 ET Spain: Spanish Retail Sales · 11-27 03:55 ET Germany: German Unemployment Change (cons 5K, prev 4K) · 11-27 03:55 ET Germany: German Unemployment Rate

### EURCHF  `EURCHF=X`  0.9179 (2026-11-24)
**Move:** 1w -0.7% · 4w -0.5% (32nd pct of 2y 4w moves) · 13w -1.9% · 52w range position 35% (lo 0.9023 / hi 0.9466)
**Drivers (recent corr):** ^STOXX50E -0.27 [weak] · FR_DE (missing) · ^VIX +0.12 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.01, n=60):** actual -0.5% = ^VIX +0.1% · ^STOXX50E -0.0% · unexplained -0.5%
**This week:** 11-27 02:45 ET France: French GDP (cons -0.1%, prev -0.1%) · 11-27 03:00 ET Spain: Core CPI · 11-27 03:00 ET Spain: Spanish Retail Sales · 11-27 03:55 ET Germany: German Unemployment Change (cons 5K, prev 4K) · 11-27 03:55 ET Germany: German Unemployment Rate · 11-30 02:00 ET Germany: German Retail Sales


## 4. EM FX

### USDMXN  `USDMXN=X`  19.16 (2026-11-24)
**Move:** 1w +4.0% · 4w +2.5% (78th pct of 2y 4w moves) · 13w +13.1% · 52w range position 100% (lo 16.89 / hi 19.16)
**Drivers (recent corr):** ^VIX +0.19 [weak] · ^GSPC -0.21 [weak] · CL=F +0.47 [INVERTED] · USDBRL=X +0.39 [textbook] → **in charge: CL=F** (Oil)
**Last 20 sessions decomposed (R² 0.13, n=60):** actual +2.5% = CL=F -1.6% · USDBRL=X +1.1% · ^GSPC +1.1% · ^VIX -0.5% · unexplained +2.3%
**Positioning (CFTC MEXICAN PESO, 2026-11-17, + = long USDMXN):** lev funds -62,245 (-22% OI, 4w +1,569, 15th pct of 3y) · asset mgrs +39,550 (+14% OI, 4w +15,486, 99th pct of 3y)
**This week:** 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index · 12-01 10:00 ET United States: ISM Manufacturing PMI · 12-01 10:00 ET United States: ISM Manufacturing Prices

### USDBRL  `USDBRL=X`  5.929 (2026-11-24)
**Move:** 1w +2.6% · 4w +10.8% (99th pct of 2y 4w moves) · 13w +15.2% · 52w range position 100% (lo 4.906 / hi 5.933)
**Drivers (recent corr):** ^VIX +0.31 [textbook] · HG=F -0.47 [textbook] · EWZ -0.68 [textbook] → **in charge: EWZ** (Brazil equities (local flows))
**Last 20 sessions decomposed (R² 0.84, n=60):** actual +10.3% = EWZ +4.8% · HG=F +0.8% · ^VIX -0.2% · unexplained +4.9%
**Positioning (CFTC BRAZILIAN REAL, 2026-11-17, + = long USDBRL):** lev funds -27,429 (-25% OI, 4w -8,752, 3rd pct of 3y) · asset mgrs -31,278 (-28% OI, 4w +19,990, 66th pct of 3y)
**This week:** 11-27 07:00 ET Brazil: Unemployment Rate · 11-30 06:30 ET Brazil: Net Debt-to-GDP ratio · 11-30 06:30 ET Brazil: Budget Balance · 11-30 06:30 ET Brazil: Budget Surplus · 11-30 06:30 ET Brazil: Gross Debt-to-GDP ratio · 12-01 10:00 ET United States: ISM Manufacturing Employment

### USDZAR  `USDZAR=X`  17.41 (2026-11-24)
**Move:** 1w +3.0% · 4w +4.7% (92nd pct of 2y 4w moves) · 13w +9.3% · 52w range position 95% (lo 15.71 / hi 17.49)
**Drivers (recent corr):** GC=F -0.59 [textbook] · ^VIX +0.36 [textbook] · HG=F -0.60 [textbook] → **in charge: HG=F** (Metals)
**Last 20 sessions decomposed (R² 0.16, n=60):** actual +4.5% = HG=F +0.8% · GC=F +0.7% · ^VIX +0.5% · unexplained +2.6%
**Positioning (CFTC SO AFRICAN RAND, 2026-11-17, + = long USDZAR):** lev funds -3,934 (-10% OI, 4w +954, 34th pct of 3y) · asset mgrs -13,570 (-36% OI, 4w +4,392, 36th pct of 3y)
**This week:** 11-30 07:00 ET South Africa: Budget Balance · 12-01 04:00 ET South Africa: GDP · 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index · 12-01 10:00 ET United States: ISM Manufacturing PMI · 12-01 10:00 ET United States: ISM Manufacturing Prices

### USDKRW  `USDKRW=X`  1,342 (2026-11-24)
**Move:** 1w +0.7% · 4w +1.1% (40th pct of 2y 4w moves) · 13w -2.9% · 52w range position 8% (lo 1,324 / hi 1,552)
**Drivers (recent corr):** ^KS11 -0.01 [weak] · SOXX -0.32 [textbook] · DX-Y.NYB +0.07 [weak] → **in charge: SOXX** (Global semis cycle)
**Last 20 sessions decomposed (R² 0.07, n=60):** actual +1.1% = DX-Y.NYB +0.7% · SOXX +0.7% · ^KS11 -0.2% · unexplained +0.0%
**This week:** 11-29 18:00 ET South Korea: Retail Sales · 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index · 12-01 10:00 ET United States: ISM Manufacturing PMI · 12-01 10:00 ET United States: ISM Manufacturing Prices · 12-01 18:00 ET South Korea: CPI


## 5. CE3 FX

### EURCZK  `EURCZK=X`  24.42 (2026-11-24)
**Move:** 1w +0.2% · 4w +0.4% (57th pct of 2y 4w moves) · 13w +1.4% · 52w range position 75% (lo 24.07 / hi 24.53)
**Drivers (recent corr):** ^STOXX50E -0.13 [weak] · EURPLN=X +0.48 [textbook] → **in charge: EURPLN=X** (CE3 block)
**Last 20 sessions decomposed (R² 0.28, n=60):** actual +0.4% = EURPLN=X +0.3% · ^STOXX50E +0.0% · unexplained +0.1%
**This week:** 11-27 02:45 ET France: French GDP (cons -0.1%, prev -0.1%) · 11-27 03:00 ET Spain: Core CPI · 11-27 03:00 ET Spain: Spanish Retail Sales · 11-27 03:55 ET Germany: German Unemployment Change (cons 5K, prev 4K) · 11-27 03:55 ET Germany: German Unemployment Rate · 11-30 02:00 ET Germany: German Retail Sales

### EURPLN  `EURPLN=X`  4.446 (2026-11-24)
**Move:** 1w +1.1% · 4w +1.1% (82nd pct of 2y 4w moves) · 13w +3.4% · 52w range position 100% (lo 4.197 / hi 4.446)
**Drivers (recent corr):** ^STOXX50E -0.18 [weak] · ^VIX +0.33 [textbook] → **in charge: ^VIX** (Risk)
**Last 20 sessions decomposed (R² 0.09, n=60):** actual +1.1% = ^VIX +0.2% · ^STOXX50E +0.0% · unexplained +0.9%
**This week:** 11-27 02:45 ET France: French GDP (cons -0.1%, prev -0.1%) · 11-27 03:00 ET Spain: Core CPI · 11-27 03:00 ET Spain: Spanish Retail Sales · 11-27 03:55 ET Germany: German Unemployment Change (cons 5K, prev 4K) · 11-27 03:55 ET Germany: German Unemployment Rate · 11-30 02:00 ET Germany: German Retail Sales


## 6. Equities

### S&P 500  `^GSPC`  7,237 (2026-11-24)
**Move:** 1w -1.4% · 4w -6.3% (89th pct of 2y 4w moves) · 13w -5.7% · 52w range position 61% (lo 6,344 / hi 7,819)
**Drivers (recent corr):** US10Y +0.40 [INVERTED] · HYG_TLT +0.46 [textbook] · DX-Y.NYB +0.11 [weak] · CL=F -0.50 [textbook] · ^VIX -0.98 [textbook] → **in charge: ^VIX** (Vol)
**Last 20 sessions decomposed (R² 0.91, n=60):** actual -6.5% = ^VIX -3.9% · HYG_TLT -0.6% · CL=F +0.4% · US10Y +0.3% · DX-Y.NYB +0.1% · unexplained -2.8%
**Positioning (CFTC E-MINI S&P 500, 2026-11-17, + = long S&P 500):** lev funds -234,978 (-11% OI, 4w +136,267, 94th pct of 3y) · asset mgrs +895,049 (+43% OI, 4w -6,328, 26th pct of 3y)
**This week:** 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index · 12-01 10:00 ET United States: ISM Manufacturing PMI · 12-01 10:00 ET United States: ISM Manufacturing Prices

### Nasdaq 100  `^NDX`  26,746 (2026-11-24)
**Move:** 1w -0.9% · 4w -9.8% (89th pct of 2y 4w moves) · 13w -8.4% · 52w range position 46% (lo 22,953 / hi 31,224)
**Drivers (recent corr):** US10Y +0.46 [INVERTED] · SOXX +0.97 [textbook] · HYG_TLT +0.48 [textbook] · BTC-USD +0.59 [textbook] → **in charge: SOXX** (Semis / AI capex)
**Last 20 sessions decomposed (R² 0.92, n=60):** actual -10.3% = SOXX -8.1% · BTC-USD -3.5% · HYG_TLT -0.6% · US10Y +0.4% · unexplained +1.5%
**Positioning (CFTC NASDAQ MINI, 2026-11-17, + = long Nasdaq 100):** lev funds -10,928 (-4% OI, 4w -11,878, 85th pct of 3y) · asset mgrs +82,900 (+28% OI, 4w +5,110, 76th pct of 3y)
**This week:** 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index · 12-01 10:00 ET United States: ISM Manufacturing PMI · 12-01 10:00 ET United States: ISM Manufacturing Prices

### Russell 2000  `^RUT`  2,670 (2026-11-24)
**Move:** 1w -1.2% · 4w -5.3% (69th pct of 2y 4w moves) · 13w -11.3% · 52w range position 39% (lo 2,414 / hi 3,068)
**Drivers (recent corr):** US2Y +0.33 [INVERTED, was textbook] · HYG_TLT +0.30 [weak] · ^GSPC +0.95 [textbook] → **in charge: ^GSPC** (Beta)
**Last 20 sessions decomposed (R² 0.81, n=60):** actual -5.4% = ^GSPC -6.2% · HYG_TLT +0.3% · US2Y +0.3% · unexplained +0.2%
**This week:** 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index · 12-01 10:00 ET United States: ISM Manufacturing PMI · 12-01 10:00 ET United States: ISM Manufacturing Prices

### Euro Stoxx 50  `^STOXX50E`  6,074 (2026-11-24)
**Move:** 1w -2.2% · 4w -1.5% (29th pct of 2y 4w moves) · 13w -5.9% · 52w range position 55% (lo 5,501 / hi 6,551)
**Drivers (recent corr):** FR_DE (missing) · ^GSPC +0.76 [textbook] · BZ=F -0.49 [textbook] · EURUSD=X -0.17 [weak] → **in charge: ^GSPC** (US lead)
**Last 20 sessions decomposed (R² 0.46, n=60):** actual -1.5% = ^GSPC -3.0% · BZ=F +2.1% · EURUSD=X -0.0% · unexplained -0.5%
**This week:** 11-27 02:45 ET France: French GDP (cons -0.1%, prev -0.1%) · 11-27 03:00 ET Spain: Core CPI · 11-27 03:00 ET Spain: Spanish Retail Sales · 11-27 03:55 ET Germany: German Unemployment Change (cons 5K, prev 4K) · 11-27 03:55 ET Germany: German Unemployment Rate · 11-30 02:00 ET Germany: German Retail Sales

### CAC 40  `^FCHI`  8,045 (2026-11-24)
**Move:** 1w -2.1% · 4w +2.0% (45th pct of 2y 4w moves) · 13w -4.7% · 52w range position 36% (lo 7,666 / hi 8,726)
**Drivers (recent corr):** FR_DE (missing) · ^STOXX50E +0.94 [textbook] → **in charge: ^STOXX50E** (European block)
**Last 20 sessions decomposed (R² 0.83, n=60):** actual +2.0% = ^STOXX50E -1.1% · unexplained +3.1%
**This week:** 11-27 02:45 ET France: French GDP (cons -0.1%, prev -0.1%) · 11-27 03:00 ET Spain: Core CPI · 11-27 03:00 ET Spain: Spanish Retail Sales · 11-27 03:55 ET Germany: German Unemployment Change (cons 5K, prev 4K) · 11-27 03:55 ET Germany: German Unemployment Rate · 11-30 02:00 ET Germany: German Retail Sales

### DAX  `^GDAXI`  25,337 (2026-11-24)
**Move:** 1w -2.7% · 4w -1.0% (20th pct of 2y 4w moves) · 13w -3.5% · 52w range position 68% (lo 22,301 / hi 26,772)
**Drivers (recent corr):** DE10Y +0.34 [INVERTED] · ^GSPC +0.69 [textbook] → **in charge: ^GSPC** (Global risk)
**Last 20 sessions decomposed (R² 0.37, n=60):** actual -1.0% = ^GSPC -3.2% · DE10Y +0.1% · unexplained +2.1%
**This week:** 11-27 02:45 ET France: French GDP (cons -0.1%, prev -0.1%) · 11-27 03:00 ET Spain: Core CPI · 11-27 03:00 ET Spain: Spanish Retail Sales · 11-27 03:55 ET Germany: German Unemployment Change (cons 5K, prev 4K) · 11-27 03:55 ET Germany: German Unemployment Rate · 11-30 02:00 ET Germany: German Retail Sales

### FTSE 100  `^FTSE`  10,481 (2026-11-24)
**Move:** 1w -2.0% · 4w -1.9% (49th pct of 2y 4w moves) · 13w -3.7% · 52w range position 67% (lo 9,610 / hi 10,911)
**Drivers (recent corr):** BZ=F -0.44 [INVERTED] · GBPUSD=X +0.07 [weak] · GB10Y -0.26 [weak] → **in charge: BZ=F** (Energy-heavy index)
**Last 20 sessions decomposed (R² 0.25, n=60):** actual -1.9% = BZ=F +1.1% · GB10Y +0.1% · GBPUSD=X +0.0% · unexplained -3.2%
**This week:** 11-26 05:30 ET United Kingdom: BoE FPC Meeting Minutes

### Nikkei 225  `^N225`  58,504 (2026-11-24)
**Move:** 1w -0.6% · 4w -7.5% (74th pct of 2y 4w moves) · 13w -11.2% · 52w range position 42% (lo 48,660 / hi 72,366)
**Drivers (recent corr):** USDJPY=X +0.23 [weak] · ^NDX +0.68 [textbook] · SOXX +0.67 [textbook] → **in charge: ^NDX** (US tech lead (prior US day))
**Last 20 sessions decomposed (R² 0.32, n=60):** actual -7.8% = SOXX -2.4% · ^NDX -2.1% · USDJPY=X -0.1% · unexplained -3.2%
**This week:** 11-26 18:30 ET Japan: Tokyo Core CPI (cons 2.9%, prev 2.6%) · 11-29 18:50 ET Japan: Large Scale Retail Sales YoY · 11-29 18:50 ET Japan: Retail Sales · 11-30 18:30 ET Japan: Unemployment Rate

### KOSPI  `^KS11`  5,030 (2026-11-24)
**Move:** 1w +1.2% · 4w -10.8% (68th pct of 2y 4w moves) · 13w -25.4% · 52w range position 22% (lo 3,858 / hi 9,115)
**Drivers (recent corr):** SOXX +0.68 [textbook] · ^NDX +0.64 [textbook] → **in charge: SOXX** (Memory / AI hardware (prior US day))
**Last 20 sessions decomposed (R² 0.31, n=60):** actual -11.4% = SOXX -10.8% · ^NDX +6.0% · unexplained -6.6%
**This week:** 11-29 18:00 ET South Korea: Retail Sales · 12-01 18:00 ET South Korea: CPI

### Hang Seng  `^HSI`  22,197 (2026-11-24)
**Move:** 1w -5.6% · 4w -3.7% (55th pct of 2y 4w moves) · 13w -13.0% · 52w range position 0% (lo 22,197 / hi 27,968)
**Drivers (recent corr):** ^NDX +0.10 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual -3.7% = ^NDX -0.2% · unexplained -3.5%
**This week:** 12-01 03:30 ET Hong Kong: Retail Sales

### ASX 200  `^AXJO`  8,726 (2026-11-24)
**Move:** 1w -1.8% · 4w -1.4% (29th pct of 2y 4w moves) · 13w -4.8% · 52w range position 40% (lo 8,366 / hi 9,272)
**Drivers (recent corr):** HG=F +0.56 [textbook] · ^GSPC +0.66 [textbook] → **in charge: ^GSPC** (US lead (prior US day))
**Last 20 sessions decomposed (R² 0.34, n=60):** actual -1.4% = HG=F -2.3% · ^GSPC -1.4% · unexplained +2.4%
**This week:** 12-01 19:30 ET Australia: GDP · 12-01 19:30 ET Australia: GDP Capital Expenditure · 12-01 19:30 ET Australia: GDP Chain Price Index · 12-01 19:30 ET Australia: GDP Final Consumption


## 7. Rates

### US 2y  `US2Y`  4.73% (2026-11-24)
**Move:** 1w -17bp · 4w -11bp (45th pct of 2y 4w moves) · 13w +38bp · 52w range position 77% (lo 3.512 / hi 5.089)
**Drivers (recent corr):** CL=F +0.04 [weak] · ^GSPC +0.49 [textbook] → **in charge: ^GSPC** (Risk-on = fewer cuts / more hikes)
**Last 20 sessions decomposed (R² 0.08, n=60):** actual -11bp = ^GSPC -10bp · CL=F -4bp · unexplained +3bp
**Positioning (CFTC UST 2Y NOTE, 2026-11-17, + = long US 2y):** lev funds +1,288,895 (+29% OI, 4w +3,347, 5th pct of 3y) · asset mgrs -1,655,991 (-37% OI, 4w +67,589, 81st pct of 3y)
**This week:** 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index · 12-01 10:00 ET United States: ISM Manufacturing PMI · 12-01 10:00 ET United States: ISM Manufacturing Prices

### US 10y  `US10Y`  4.92% (2026-11-24)
**Move:** 1w -18bp · 4w -7bp (34th pct of 2y 4w moves) · 13w +28bp · 52w range position 71% (lo 3.962 / hi 5.311)
**Drivers (recent corr):** CL=F +0.15 [weak] · ^NDX +0.46 [INVERTED] · T10YIE (missing) · DE10Y +0.32 [textbook] → **in charge: ^NDX** (Textbook: yields up hurt stocks; + means bonds hedge stocks)
**Last 20 sessions decomposed (R² 0.16, n=60):** actual -7bp = ^NDX -10bp · CL=F -7bp · DE10Y -1bp · unexplained +11bp
**Positioning (CFTC UST 10Y NOTE, 2026-11-17, + = long US 10y):** lev funds +2,482,443 (+40% OI, 4w +375,219, 99th pct of 3y) · asset mgrs -3,270,834 (-52% OI, 4w -345,418, 1st pct of 3y)
**This week:** 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index · 12-01 10:00 ET United States: ISM Manufacturing PMI · 12-01 10:00 ET United States: ISM Manufacturing Prices

### US 30y  `US30Y`  5.29% (2026-11-24)
**Move:** 1w -16bp · 4w -1bp (7th pct of 2y 4w moves) · 13w +12bp · 52w range position 64% (lo 4.633 / hi 5.665)
**Drivers (recent corr):** US2Y +0.91 [textbook] · T10YIE (missing) → **in charge: US2Y** (Front end)
**Last 20 sessions decomposed (R² 0.75, n=60):** actual -1bp = US2Y -7bp · unexplained +6bp
**Positioning (CFTC UST BOND, 2026-11-17, + = long US 30y):** lev funds +145,229 (+7% OI, 4w -17,528, 1st pct of 3y) · asset mgrs -371,794 (-19% OI, 4w +16,213, 99th pct of 3y)
**This week:** 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index · 12-01 10:00 ET United States: ISM Manufacturing PMI · 12-01 10:00 ET United States: ISM Manufacturing Prices

### Bund 10y  `DE10Y`  3.35% (2026-11-24)
**Move:** 1w -4bp · 4w -4bp (23rd pct of 2y 4w moves) · 13w +8bp · 52w range position 68% (lo 2.69 / hi 3.66)
**Drivers (recent corr):** US10Y +0.32 [textbook] · BZ=F +0.01 [weak] · FR_DE (missing) → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.06, n=60):** actual -4bp = BZ=F +3bp · US10Y -1bp · unexplained -5bp
**This week:** 11-27 02:45 ET France: French GDP (cons -0.1%, prev -0.1%) · 11-27 03:00 ET Spain: Core CPI · 11-27 03:00 ET Spain: Spanish Retail Sales · 11-27 03:55 ET Germany: German Unemployment Change (cons 5K, prev 4K) · 11-27 03:55 ET Germany: German Unemployment Rate · 11-30 02:00 ET Germany: German Retail Sales

### Gilt 10y  `GB10Y`  5.30% (2026-11-24)
**Move:** 1w -7bp · 4w -2bp (10th pct of 2y 4w moves) · 13w +23bp · 52w range position 84% (lo 4.352 / hi 5.478)
**Drivers (recent corr):** US10Y +0.60 [textbook] · GBPUSD=X -0.35 [textbook] → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.35, n=60):** actual -2bp = US10Y -4bp · GBPUSD=X +2bp · unexplained -0bp
**This week:** 11-26 05:30 ET United Kingdom: BoE FPC Meeting Minutes

### JGB 10y  `JP10Y`  2.84% (2026-11-24)
**Move:** 1w -9bp · 4w +1bp (6th pct of 2y 4w moves) · 13w -6bp · 52w range position 79% (lo 1.807 / hi 3.111)
**Drivers (recent corr):** US10Y +0.71 [textbook] · USDJPY=X +0.61 [textbook] → **in charge: US10Y** (Global duration)
**Last 20 sessions decomposed (R² 0.52, n=60):** actual +1bp = USDJPY=X +3bp · US10Y -2bp · unexplained +0bp
**This week:** 11-26 18:30 ET Japan: Tokyo Core CPI (cons 2.9%, prev 2.6%) · 11-29 18:50 ET Japan: Large Scale Retail Sales YoY · 11-29 18:50 ET Japan: Retail Sales · 11-30 18:30 ET Japan: Unemployment Rate

### Canada 10y  `CA10Y`  3.69% (2026-11-24)
**Move:** 1w -12bp · 4w -14bp (60th pct of 2y 4w moves) · 13w +7bp · 52w range position 66% (lo 3.12 / hi 3.99)
**Drivers (recent corr):** US10Y +0.93 [textbook] · CL=F +0.25 [weak] → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.73, n=60):** actual -14bp = CL=F -6bp · US10Y -5bp · unexplained -3bp
**This week:** 11-27 11:00 ET Canada: Budget Balance · 11-30 08:30 ET Canada: GDP Implicit Price · 11-30 08:30 ET Canada: GDP · 11-30 08:30 ET Canada: GDP Annualized

### French spread (proxy)
_no data_


## 8. Commodities

### WTI crude  `CL=F`  79.69 (2026-11-24)
**Move:** 1w -7.3% · 4w -22.5% (92nd pct of 2y 4w moves) · 13w -3.1% · 52w range position 42% (lo 55.27 / hi 112.9)
**Drivers (recent corr):** XLE +0.64 [textbook] · ^GSPC -0.50 [INVERTED] · HG=F -0.43 [INVERTED] · DX-Y.NYB +0.30 [weak] → **in charge: XLE** (Energy equities (do they believe the move?))
**Last 20 sessions decomposed (R² 0.27, n=60):** actual -25.4% = XLE -8.2% · HG=F +7.0% · ^GSPC +4.0% · DX-Y.NYB -0.8% · unexplained -27.5%
**Positioning (CFTC WTI-PHYSICAL, 2026-11-17, + = long WTI crude):** managed money +15,814 (+1% OI, 4w -20,373, 10th pct of 3y) · producers +385,227 (+21% OI, 4w +25,659, 99th pct of 3y)
**This week:** 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index · 12-01 10:00 ET United States: ISM Manufacturing PMI · 12-01 10:00 ET United States: ISM Manufacturing Prices

### Gold  `GC=F`  3,629 (2026-11-24)
**Move:** 1w -6.1% · 4w -10.4% (92nd pct of 2y 4w moves) · 13w -22.0% · 52w range position 6% (lo 3,515 / hi 5,318)
**Drivers (recent corr):** DFII10 (missing) · DX-Y.NYB -0.18 [weak] · SI=F +0.93 [textbook] · BTC-USD +0.52 [textbook] → **in charge: SI=F** (Precious block)
**Last 20 sessions decomposed (R² 0.79, n=60):** actual -11.0% = SI=F -12.0% · BTC-USD +0.8% · DX-Y.NYB -0.5% · unexplained +0.6%
**Positioning (CFTC GOLD, 2026-11-17, + = long Gold):** managed money +102,942 (+25% OI, 4w -1,264, 21st pct of 3y) · producers -4,591 (-1% OI, 4w +10,192, 100th pct of 3y)
**This week:** 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index · 12-01 10:00 ET United States: ISM Manufacturing PMI · 12-01 10:00 ET United States: ISM Manufacturing Prices

### Silver  `SI=F`  42.12 (2026-11-24)
**Move:** 1w -10.9% · 4w -21.2% (90th pct of 2y 4w moves) · 13w -38.0% · 52w range position 1% (lo 41.03 / hi 115.1)
**Drivers (recent corr):** GC=F +0.93 [textbook] · HG=F +0.78 [textbook] → **in charge: GC=F** (Gold)
**Last 20 sessions decomposed (R² 0.85, n=60):** actual -23.8% = GC=F -14.1% · HG=F -8.9% · unexplained -0.8%
**Positioning (CFTC SILVER, 2026-11-17, + = long Silver):** managed money +1,280 (+1% OI, 4w -2,225, 3rd pct of 3y) · producers -12,877 (-10% OI, 4w +2,152, 98th pct of 3y)
**This week:** 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index · 12-01 10:00 ET United States: ISM Manufacturing PMI · 12-01 10:00 ET United States: ISM Manufacturing Prices

### Copper  `HG=F`  5.503 (2026-11-24)
**Move:** 1w -7.9% · 4w -17.1% (96th pct of 2y 4w moves) · 13w -16.5% · 52w range position 28% (lo 4.999 / hi 6.804)
**Drivers (recent corr):** ^GSPC +0.56 [textbook] → **in charge: ^GSPC** (Global growth)
**Last 20 sessions decomposed (R² 0.17, n=60):** actual -18.8% = ^GSPC -3.5% · unexplained -15.3%
**Positioning (CFTC COPPER- #1, 2026-11-17, + = long Copper):** managed money +28,692 (+9% OI, 4w -18,998, 42nd pct of 3y) · producers -33,014 (-10% OI, 4w +44,392, 87th pct of 3y)
**This week:** 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index · 12-01 10:00 ET United States: ISM Manufacturing PMI · 12-01 10:00 ET United States: ISM Manufacturing Prices

### Nat gas (US)  `NG=F`  3.539 (2026-11-24)
**Move:** 1w +10.3% · 4w +25.6% (92nd pct of 2y 4w moves) · 13w +24.5% · 52w range position 21% (lo 2.523 / hi 7.46)
**Drivers (recent corr):** CL=F +0.05 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual +22.8% = CL=F -0.7% · unexplained +23.5%
**Positioning (CFTC NAT GAS NYME, 2026-11-17, + = long Nat gas (US)):** managed money -211,545 (-13% OI, 4w -54,136, 2nd pct of 3y) · producers +17,473 (+1% OI, 4w +30,627, 96th pct of 3y)
**This week:** 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index · 12-01 10:00 ET United States: ISM Manufacturing PMI · 12-01 10:00 ET United States: ISM Manufacturing Prices


## 9. Crypto

### Bitcoin  `BTC-USD`  60,471 (2026-11-24)
**Move:** 1w -6.8% · 4w -25.2% (97th pct of 2y 4w moves) · 13w -23.0% · 52w range position 5% (lo 58,559 / hi 96,929)
**Drivers (recent corr):** ^NDX +0.59 [textbook] · DX-Y.NYB -0.11 [weak] · GC=F +0.52 [textbook] → **in charge: ^NDX** (Tech / speculation)
**Last 20 sessions decomposed (R² 0.35, n=60):** actual -29.0% = ^NDX -7.8% · DX-Y.NYB -2.2% · GC=F +0.7% · unexplained -19.7%
**Positioning (CFTC BITCOIN, 2026-11-17, + = long Bitcoin):** lev funds -1,211 (-6% OI, 4w +3,731, 100th pct of 3y) · asset mgrs +2,285 (+12% OI, 4w -714, 3rd pct of 3y)
**This week:** 12-01 10:00 ET United States: ISM Manufacturing Employment · 12-01 10:00 ET United States: ISM Manufacturing New Orders Index · 12-01 10:00 ET United States: ISM Manufacturing PMI · 12-01 10:00 ET United States: ISM Manufacturing Prices

