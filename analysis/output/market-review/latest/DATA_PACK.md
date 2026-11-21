# Market Review Data Pack: 2026-11-21

Fetched 2026-11-21T03:26:23+00:00. Descriptive numbers for the weekly review (read with `education/market_reviews/PLAYBOOK.md`). Correlations are of daily moves: last 20 sessions vs the 60 before. They are noisy; a flip is a question, not a signal.

**Data notes:** fred DGS2: The read operation timed out · fred DFII10: The read operation timed out · fred T10YIE: The read operation timed out · fred BAMLH0A0HYM2: The read operation timed out · fred BAMLC0A0CM: The read operation timed out · FRED DGS2 missing: US 2y = US 5y stand-in for this run · No local OAT/Bund futures: French spread proxy unavailable

## 1. Regime gauges: which story is the market trading?

| Pair | Recent | Before | Textbook sign | Status | What it means |
|---|---|---|---|---|---|
| CL=F vs US10Y | +0.18 | +0.08 | + | weak | Oil vs yields: + = oil is an inflation story; - = oil is a growth tax (2008-style) |
| ^NDX vs US10Y | +0.52 | -0.04 | − | INVERTED | Stocks vs yields: - = rates drive stocks; + = growth scare, bonds hedge stocks |
| HYG_TLT vs ^NDX | +0.58 | +0.16 | + | textbook | Credit vs tech: high + = credit and equities are one trade (credit stress leading) |
| DX-Y.NYB vs ^GSPC | -0.03 | +0.02 | − | weak | Dollar vs stocks: - = safe-haven dollar; ~0/+ = "sell America" or liquidity dash |
| AUDUSD=X vs ^NDX | +0.41 | +0.32 | + | textbook | Aussie vs tech: near 0 = AUD trading commodities not risk |
| BTC-USD vs ^NDX | +0.47 | +0.42 | + | textbook | Bitcoin vs tech: high = one liquidity complex |
| XLE vs CL=F | +0.53 | +0.28 | + | textbook | Energy stocks vs oil: falling = equity investors fade the oil move |
| USDJPY=X vs US10Y | +0.42 | +0.38 | + | textbook | Yen vs yields: high = yen is a pure rates trade |

Equity vol vs bond vol: VIX 35.9 (1y pct 100) · MOVE 106 (1y pct 96). When bond vol leads equity vol, the stress is in rates/credit first.

## 2. G10 FX

### EURUSD  `EURUSD=X`  1.097 (2026-11-20)
**Move:** 1w -0.7% · 4w -2.2% (79th pct of 2y 4w moves) · 13w -6.1% · 52w range position 0% (lo 1.097 / hi 1.202)
**Drivers (recent corr):** US_EA2 -0.21 [weak] · US_DE10 -0.17 [weak] · FR_DE (missing) · ^STOXX50E -0.12 [weak] · BZ=F -0.25 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.05, n=60):** actual -2.3% = BZ=F +0.3% · US_EA2 +0.2% · ^STOXX50E -0.1% · US_DE10 -0.0% · unexplained -2.7%
**Positioning (CFTC EURO FX, 2026-11-17, + = long EURUSD):** lev funds -76,587 (-9% OI, 4w -7,747, 1st pct of 3y) · asset mgrs +147,234 (+17% OI, 4w -43,187, 1st pct of 3y)
**This week:** 11-25 02:00 ET Germany: German GDP (cons 0.2%, prev 0.2%) · 11-25 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.3%) · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 2.50%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 3.4%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 2.2%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 1.7%)

### USDJPY  `USDJPY=X`  159.7 (2026-11-20)
**Move:** 1w -0.1% · 4w +2.1% (68th pct of 2y 4w moves) · 13w +0.5% · 52w range position 64% (lo 152.5 / hi 163.9)
**Drivers (recent corr):** US10Y +0.42 [textbook] · US_JP10 +0.18 [weak] · ^NDX +0.62 [textbook] · ^VIX -0.55 [textbook] → **in charge: ^NDX** (Risk appetite: carry trades fund in yen)
**Last 20 sessions decomposed (R² 0.14, n=60):** actual +2.0% = ^NDX -1.1% · ^VIX +0.6% · US10Y -0.3% · US_JP10 +0.2% · unexplained +2.6%
**Positioning (CFTC JAPANESE YEN, 2026-11-17, + = long USDJPY):** lev funds +23,790 (+6% OI, 4w +900, 30th pct of 3y) · asset mgrs -84,681 (-22% OI, 4w -5,578, 12th pct of 3y)
**This week:** 11-25 24H ET Japan: BoJ Core CPI · 11-25 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.3%) · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 2.50%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 3.4%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 2.2%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 1.7%)

### GBPUSD  `GBPUSD=X`  1.309 (2026-11-20)
**Move:** 1w -1.1% · 4w -2.4% (85th pct of 2y 4w moves) · 13w -4.1% · 52w range position 0% (lo 1.308 / hi 1.383)
**Drivers (recent corr):** US_GB10 -0.14 [weak] · GB10Y -0.30 [INVERTED] · ^GSPC +0.04 [weak] · EURUSD=X +0.87 [textbook] → **in charge: EURUSD=X** (European block move)
**Last 20 sessions decomposed (R² 0.70, n=60):** actual -2.4% = EURUSD=X -2.0% · ^GSPC -0.5% · US_GB10 +0.0% · GB10Y +0.0% · unexplained +0.0%
**Positioning (CFTC BRITISH POUND, 2026-11-17, + = long GBPUSD):** lev funds +28,790 (+12% OI, 4w +4,686, 40th pct of 3y) · asset mgrs -104,615 (-45% OI, 4w +30,006, 22nd pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.3%) · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 2.50%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 3.4%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 2.2%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 1.7%) · 11-25 08:30 ET United States: PCE price index (cons 0.3%, prev 0.5%)

### USDCAD  `USDCAD=X`  1.434 (2026-11-20)
**Move:** 1w +0.6% · 4w +2.4% (90th pct of 2y 4w moves) · 13w +4.1% · 52w range position 100% (lo 1.349 / hi 1.434)
**Drivers (recent corr):** CL=F +0.11 [weak] · US_CA2 +0.21 [weak] · ^GSPC +0.10 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.19, n=60):** actual +2.4% = ^GSPC +0.5% · US_CA2 -0.2% · CL=F +0.0% · unexplained +2.1%
**Positioning (CFTC CANADIAN DOLLAR, 2026-11-17, + = long USDCAD):** lev funds +72,118 (+20% OI, 4w -18,995, 73rd pct of 3y) · asset mgrs -5,365 (-1% OI, 4w -10,764, 13th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.3%) · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 2.50%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 3.4%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 2.2%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 1.7%) · 11-25 08:30 ET United States: PCE price index (cons 0.3%, prev 0.5%)

### AUDUSD  `AUDUSD=X`  0.6656 (2026-11-20)
**Move:** 1w -2.2% · 4w -5.2% (98th pct of 2y 4w moves) · 13w -6.5% · 52w range position 26% (lo 0.6449 / hi 0.7255)
**Drivers (recent corr):** HG=F +0.33 [textbook] · ^NDX +0.41 [textbook] · GC=F +0.31 [textbook] → **in charge: ^NDX** (Global risk proxy)
**Last 20 sessions decomposed (R² 0.16, n=60):** actual -5.3% = ^NDX -1.3% · HG=F -0.3% · GC=F -0.0% · unexplained -3.7%
**Positioning (CFTC AUSTRALIAN DOLLAR, 2026-11-17, + = long AUDUSD):** lev funds +37,980 (+10% OI, 4w -14,517, 75th pct of 3y) · asset mgrs -182,725 (-49% OI, 4w -53,986, 1st pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.3%) · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 2.50%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 3.4%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 2.2%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 1.7%) · 11-25 08:30 ET United States: PCE price index (cons 0.3%, prev 0.5%)

### NZDUSD  `NZDUSD=X`  0.5481 (2026-11-20)
**Move:** 1w -1.1% · 4w -3.6% (86th pct of 2y 4w moves) · 13w -7.9% · 52w range position 0% (lo 0.5481 / hi 0.6076)
**Drivers (recent corr):** AUDUSD=X +0.44 [textbook] · ^GSPC +0.30 [weak] · US2Y -0.25 [weak] → **in charge: AUDUSD=X** (Antipodean block)
**Last 20 sessions decomposed (R² 0.38, n=60):** actual -3.6% = AUDUSD=X -2.4% · ^GSPC -0.5% · US2Y +0.1% · unexplained -0.8%
**Positioning (CFTC NZ DOLLAR, 2026-11-17, + = long NZDUSD):** lev funds -23,595 (-17% OI, 4w -4,315, 8th pct of 3y) · asset mgrs -47,524 (-35% OI, 4w +1,789, 11th pct of 3y)
**This week:** 11-22 16:45 ET New Zealand: Retail Sales · 11-22 16:45 ET New Zealand: Retail Sales Quarterly Vs. Year Ago · 11-25 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.3%) · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 2.50%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 3.4%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 2.2%)

### USDCHF  `USDCHF=X`  0.8441 (2026-11-20)
**Move:** 1w +1.0% · 4w +3.0% (87th pct of 2y 4w moves) · 13w +5.6% · 52w range position 100% (lo 0.7632 / hi 0.8441)
**Drivers (recent corr):** US10Y +0.41 [textbook] · ^VIX -0.23 [weak] · GC=F -0.10 [weak] → **in charge: US10Y** (US yields)
**Last 20 sessions decomposed (R² 0.28, n=60):** actual +2.9% = US10Y -0.3% · ^VIX +0.2% · GC=F +0.1% · unexplained +2.9%
**Positioning (CFTC SWISS FRANC, 2026-11-17, + = long USDCHF):** lev funds +19,763 (+16% OI, 4w +6,156, 97th pct of 3y) · asset mgrs +11,204 (+9% OI, 4w -14,331, 10th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.3%) · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 2.50%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 3.4%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 2.2%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 1.7%) · 11-25 08:30 ET United States: PCE price index (cons 0.3%, prev 0.5%)


## 3. G10 crosses

### AUDNZD  `AUDNZD=X`  1.214 (2026-11-20)
**Move:** 1w -1.1% · 4w -1.6% (77th pct of 2y 4w moves) · 13w +1.6% · 52w range position 65% (lo 1.141 / hi 1.254)
**Drivers (recent corr):** HG=F +0.07 [weak] · ^AXJO -0.13 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.07, n=60):** actual -1.6% = HG=F -0.7% · ^AXJO +0.2% · unexplained -1.1%
**This week:** 11-22 16:45 ET New Zealand: Retail Sales · 11-22 16:45 ET New Zealand: Retail Sales Quarterly Vs. Year Ago

### EURGBP  `EURGBP=X`  0.838 (2026-11-20)
**Move:** 1w +0.4% · 4w +0.1% (8th pct of 2y 4w moves) · 13w -2.2% · 52w range position 11% (lo 0.8324 / hi 0.8815)
**Drivers (recent corr):** GB10Y -0.01 [weak] · FR_DE (missing) → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual +0.1% = GB10Y +0.0% · unexplained +0.1%
**This week:** 11-25 02:00 ET Germany: German GDP (cons 0.2%, prev 0.2%) · 11-26 05:30 ET United Kingdom: BoE FPC Meeting Minutes · 11-27 02:45 ET France: French GDP (cons -0.1%, prev 0.5%) · 11-27 03:00 ET Spain: Core CPI · 11-27 03:00 ET Spain: Spanish Retail Sales · 11-27 03:55 ET Germany: German Unemployment Change

### EURCHF  `EURCHF=X`  0.9259 (2026-11-20)
**Move:** 1w +0.2% · 4w +0.6% (50th pct of 2y 4w moves) · 13w -0.9% · 52w range position 53% (lo 0.9023 / hi 0.9466)
**Drivers (recent corr):** ^STOXX50E +0.06 [weak] · FR_DE (missing) · ^VIX -0.35 [textbook] → **in charge: ^VIX** (Haven flows)
**Last 20 sessions decomposed (R² 0.02, n=60):** actual +0.6% = ^VIX -0.2% · ^STOXX50E -0.1% · unexplained +0.9%
**This week:** 11-25 02:00 ET Germany: German GDP (cons 0.2%, prev 0.2%) · 11-27 02:45 ET France: French GDP (cons -0.1%, prev 0.5%) · 11-27 03:00 ET Spain: Core CPI · 11-27 03:00 ET Spain: Spanish Retail Sales · 11-27 03:55 ET Germany: German Unemployment Change · 11-27 03:55 ET Germany: German Unemployment Rate


## 4. EM FX

### USDMXN  `USDMXN=X`  19.09 (2026-11-20)
**Move:** 1w +2.7% · 4w +2.0% (66th pct of 2y 4w moves) · 13w +12.7% · 52w range position 100% (lo 16.89 / hi 19.09)
**Drivers (recent corr):** ^VIX +0.26 [weak] · ^GSPC -0.29 [weak] · CL=F +0.54 [INVERTED] · USDBRL=X -0.03 [weak] → **in charge: CL=F** (Oil)
**Last 20 sessions decomposed (R² 0.15, n=60):** actual +2.0% = ^GSPC +2.4% · USDBRL=X +1.6% · CL=F -1.1% · ^VIX -1.0% · unexplained +0.1%
**Positioning (CFTC MEXICAN PESO, 2026-11-17, + = long USDMXN):** lev funds -62,245 (-22% OI, 4w +1,569, 15th pct of 3y) · asset mgrs +39,550 (+14% OI, 4w +15,486, 99th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.3%) · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 2.50%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 3.4%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 2.2%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 1.7%) · 11-25 08:30 ET United States: PCE price index (cons 0.3%, prev 0.5%)

### USDBRL  `USDBRL=X`  5.933 (2026-11-20)
**Move:** 1w +5.2% · 4w +17.5% (100th pct of 2y 4w moves) · 13w +14.3% · 52w range position 100% (lo 4.906 / hi 5.933)
**Drivers (recent corr):** ^VIX +0.04 [weak] · HG=F +0.11 [weak] · EWZ -0.93 [textbook] → **in charge: EWZ** (Brazil equities (local flows))
**Last 20 sessions decomposed (R² 0.84, n=60):** actual +16.1% = EWZ +11.9% · HG=F +0.9% · ^VIX -0.2% · unexplained +3.5%
**Positioning (CFTC BRAZILIAN REAL, 2026-11-17, + = long USDBRL):** lev funds -27,429 (-25% OI, 4w -8,752, 3rd pct of 3y) · asset mgrs -31,278 (-28% OI, 4w +19,990, 66th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.3%) · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 2.50%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 3.4%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 2.2%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 1.7%) · 11-25 08:30 ET United States: PCE price index (cons 0.3%, prev 0.5%)

### USDZAR  `USDZAR=X`  17.49 (2026-11-20)
**Move:** 1w +4.4% · 4w +6.2% (96th pct of 2y 4w moves) · 13w +8.6% · 52w range position 100% (lo 15.71 / hi 17.49)
**Drivers (recent corr):** GC=F -0.50 [textbook] · ^VIX +0.27 [weak] · HG=F -0.45 [textbook] → **in charge: GC=F** (Gold / precious metals exporter)
**Last 20 sessions decomposed (R² 0.17, n=60):** actual +6.0% = ^VIX +1.1% · GC=F +1.1% · HG=F +0.6% · unexplained +3.3%
**Positioning (CFTC SO AFRICAN RAND, 2026-11-17, + = long USDZAR):** lev funds -3,934 (-10% OI, 4w +954, 34th pct of 3y) · asset mgrs -13,570 (-36% OI, 4w +4,392, 35th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.3%) · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 2.50%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 3.4%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 2.2%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 1.7%) · 11-25 08:30 ET United States: PCE price index (cons 0.3%, prev 0.5%)

### USDKRW  `USDKRW=X`  1,335 (2026-11-20)
**Move:** 1w +0.1% · 4w +0.7% (26th pct of 2y 4w moves) · 13w -4.0% · 52w range position 5% (lo 1,324 / hi 1,552)
**Drivers (recent corr):** ^KS11 +0.06 [weak] · SOXX -0.52 [textbook] · DX-Y.NYB -0.02 [weak] → **in charge: SOXX** (Global semis cycle)
**Last 20 sessions decomposed (R² 0.13, n=60):** actual +0.7% = SOXX +1.5% · DX-Y.NYB +0.6% · ^KS11 -0.5% · unexplained -0.9%
**This week:** 11-25 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.3%) · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 2.50%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 3.4%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 2.2%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 1.7%) · 11-25 08:30 ET United States: PCE price index (cons 0.3%, prev 0.5%)


## 5. CE3 FX

### EURCZK  `EURCZK=X`  24.41 (2026-11-20)
**Move:** 1w +0.1% · 4w +0.6% (73rd pct of 2y 4w moves) · 13w +1.2% · 52w range position 74% (lo 24.07 / hi 24.53)
**Drivers (recent corr):** ^STOXX50E -0.08 [weak] · EURPLN=X +0.60 [textbook] → **in charge: EURPLN=X** (CE3 block)
**Last 20 sessions decomposed (R² 0.27, n=60):** actual +0.6% = EURPLN=X +0.3% · ^STOXX50E +0.0% · unexplained +0.2%
**This week:** 11-25 02:00 ET Germany: German GDP (cons 0.2%, prev 0.2%) · 11-27 02:45 ET France: French GDP (cons -0.1%, prev 0.5%) · 11-27 03:00 ET Spain: Core CPI · 11-27 03:00 ET Spain: Spanish Retail Sales · 11-27 03:55 ET Germany: German Unemployment Change · 11-27 03:55 ET Germany: German Unemployment Rate

### EURPLN  `EURPLN=X`  4.436 (2026-11-20)
**Move:** 1w +0.8% · 4w +1.4% (89th pct of 2y 4w moves) · 13w +2.8% · 52w range position 100% (lo 4.197 / hi 4.436)
**Drivers (recent corr):** ^STOXX50E -0.18 [weak] · ^VIX +0.39 [textbook] → **in charge: ^VIX** (Risk)
**Last 20 sessions decomposed (R² 0.15, n=60):** actual +1.4% = ^VIX +0.5% · ^STOXX50E +0.1% · unexplained +0.8%
**This week:** 11-25 02:00 ET Germany: German GDP (cons 0.2%, prev 0.2%) · 11-27 02:45 ET France: French GDP (cons -0.1%, prev 0.5%) · 11-27 03:00 ET Spain: Core CPI · 11-27 03:00 ET Spain: Spanish Retail Sales · 11-27 03:55 ET Germany: German Unemployment Change · 11-27 03:55 ET Germany: German Unemployment Rate


## 6. Equities

### S&P 500  `^GSPC`  6,910 (2026-11-20)
**Move:** 1w -8.6% · 4w -9.4% (96th pct of 2y 4w moves) · 13w -10.0% · 52w range position 38% (lo 6,344 / hi 7,819)
**Drivers (recent corr):** US10Y +0.46 [INVERTED] · HYG_TLT +0.55 [textbook] · DX-Y.NYB -0.03 [weak] · CL=F -0.38 [textbook] · ^VIX -0.97 [textbook] → **in charge: ^VIX** (Vol)
**Last 20 sessions decomposed (R² 0.89, n=60):** actual -9.8% = ^VIX -6.8% · HYG_TLT -0.4% · CL=F +0.3% · US10Y +0.3% · DX-Y.NYB -0.0% · unexplained -3.1%
**Positioning (CFTC E-MINI S&P 500, 2026-11-17, + = long S&P 500):** lev funds -234,978 (-11% OI, 4w +136,267, 94th pct of 3y) · asset mgrs +895,049 (+43% OI, 4w -6,328, 27th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.3%) · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 2.50%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 3.4%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 2.2%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 1.7%) · 11-25 08:30 ET United States: PCE price index (cons 0.3%, prev 0.5%)

### Nasdaq 100  `^NDX`  25,029 (2026-11-20)
**Move:** 1w -10.4% · 4w -13.6% (96th pct of 2y 4w moves) · 13w -14.6% · 52w range position 25% (lo 22,953 / hi 31,224)
**Drivers (recent corr):** US10Y +0.52 [INVERTED] · SOXX +0.96 [textbook] · HYG_TLT +0.58 [textbook] · BTC-USD +0.47 [textbook] → **in charge: SOXX** (Semis / AI capex)
**Last 20 sessions decomposed (R² 0.91, n=60):** actual -14.6% = SOXX -10.1% · BTC-USD -3.3% · HYG_TLT -0.5% · US10Y +0.4% · unexplained -1.0%
**Positioning (CFTC NASDAQ MINI, 2026-11-17, + = long Nasdaq 100):** lev funds -10,928 (-4% OI, 4w -11,878, 84th pct of 3y) · asset mgrs +82,900 (+28% OI, 4w +5,110, 76th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.3%) · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 2.50%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 3.4%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 2.2%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 1.7%) · 11-25 08:30 ET United States: PCE price index (cons 0.3%, prev 0.5%)

### Russell 2000  `^RUT`  2,582 (2026-11-20)
**Move:** 1w -7.5% · 4w -7.0% (84th pct of 2y 4w moves) · 13w -14.4% · 52w range position 30% (lo 2,370 / hi 3,068)
**Drivers (recent corr):** US2Y +0.32 [INVERTED, was textbook] · HYG_TLT +0.35 [textbook] · ^GSPC +0.94 [textbook] → **in charge: ^GSPC** (Beta)
**Last 20 sessions decomposed (R² 0.80, n=60):** actual -7.2% = ^GSPC -10.1% · US2Y +0.3% · HYG_TLT +0.3% · unexplained +2.3%
**This week:** 11-25 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.3%) · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 2.50%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 3.4%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 2.2%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 1.7%) · 11-25 08:30 ET United States: PCE price index (cons 0.3%, prev 0.5%)

### Euro Stoxx 50  `^STOXX50E`  5,942 (2026-11-20)
**Move:** 1w -7.0% · 4w -2.1% (42nd pct of 2y 4w moves) · 13w -8.1% · 52w range position 42% (lo 5,501 / hi 6,551)
**Drivers (recent corr):** FR_DE (missing) · ^GSPC +0.72 [textbook] · BZ=F -0.36 [textbook] · EURUSD=X -0.12 [weak] → **in charge: ^GSPC** (US lead)
**Last 20 sessions decomposed (R² 0.41, n=60):** actual -2.1% = ^GSPC -4.8% · BZ=F +1.8% · EURUSD=X -0.0% · unexplained +0.9%
**This week:** 11-25 02:00 ET Germany: German GDP (cons 0.2%, prev 0.2%) · 11-27 02:45 ET France: French GDP (cons -0.1%, prev 0.5%) · 11-27 03:00 ET Spain: Core CPI · 11-27 03:00 ET Spain: Spanish Retail Sales · 11-27 03:55 ET Germany: German Unemployment Change · 11-27 03:55 ET Germany: German Unemployment Rate

### CAC 40  `^FCHI`  7,928 (2026-11-20)
**Move:** 1w -5.3% · 4w +1.9% (42nd pct of 2y 4w moves) · 13w -6.6% · 52w range position 25% (lo 7,666 / hi 8,726)
**Drivers (recent corr):** FR_DE (missing) · ^STOXX50E +0.94 [textbook] → **in charge: ^STOXX50E** (European block)
**Last 20 sessions decomposed (R² 0.82, n=60):** actual +1.8% = ^STOXX50E -1.6% · unexplained +3.5%
**This week:** 11-25 02:00 ET Germany: German GDP (cons 0.2%, prev 0.2%) · 11-27 02:45 ET France: French GDP (cons -0.1%, prev 0.5%) · 11-27 03:00 ET Spain: Core CPI · 11-27 03:00 ET Spain: Spanish Retail Sales · 11-27 03:55 ET Germany: German Unemployment Change · 11-27 03:55 ET Germany: German Unemployment Rate

### DAX  `^GDAXI`  24,803 (2026-11-20)
**Move:** 1w -7.3% · 4w -1.5% (29th pct of 2y 4w moves) · 13w -5.1% · 52w range position 56% (lo 22,301 / hi 26,772)
**Drivers (recent corr):** DE10Y +0.43 [INVERTED] · ^GSPC +0.65 [textbook] → **in charge: ^GSPC** (Global risk)
**Last 20 sessions decomposed (R² 0.32, n=60):** actual -1.5% = ^GSPC -5.0% · DE10Y -0.0% · unexplained +3.5%
**This week:** 11-25 02:00 ET Germany: German GDP (cons 0.2%, prev 0.2%) · 11-27 02:45 ET France: French GDP (cons -0.1%, prev 0.5%) · 11-27 03:00 ET Spain: Core CPI · 11-27 03:00 ET Spain: Spanish Retail Sales · 11-27 03:55 ET Germany: German Unemployment Change · 11-27 03:55 ET Germany: German Unemployment Rate

### FTSE 100  `^FTSE`  10,346 (2026-11-20)
**Move:** 1w -5.1% · 4w -3.2% (73rd pct of 2y 4w moves) · 13w -4.3% · 52w range position 59% (lo 9,535 / hi 10,911)
**Drivers (recent corr):** BZ=F -0.41 [INVERTED] · GBPUSD=X +0.10 [weak] · GB10Y -0.28 [weak] → **in charge: BZ=F** (Energy-heavy index)
**Last 20 sessions decomposed (R² 0.25, n=60):** actual -3.3% = BZ=F +0.5% · GB10Y +0.4% · GBPUSD=X -0.2% · unexplained -4.0%
**This week:** 11-26 05:30 ET United Kingdom: BoE FPC Meeting Minutes

### Nikkei 225  `^N225`  56,437 (2026-11-20)
**Move:** 1w -7.7% · 4w -10.0% (88th pct of 2y 4w moves) · 13w -14.5% · 52w range position 33% (lo 48,626 / hi 72,366)
**Drivers (recent corr):** USDJPY=X +0.45 [textbook] · ^NDX +0.72 [textbook] · SOXX +0.70 [textbook] → **in charge: ^NDX** (US tech lead (prior US day))
**Last 20 sessions decomposed (R² 0.32, n=60):** actual -10.5% = ^NDX -3.6% · SOXX -1.8% · USDJPY=X -0.4% · unexplained -4.8%
**This week:** 11-25 24H ET Japan: BoJ Core CPI · 11-26 18:30 ET Japan: Tokyo Core CPI

### KOSPI  `^KS11`  4,870 (2026-11-20)
**Move:** 1w -7.9% · 4w -12.3% (72nd pct of 2y 4w moves) · 13w -29.6% · 52w range position 19% (lo 3,846 / hi 9,115)
**Drivers (recent corr):** SOXX +0.60 [textbook] · ^NDX +0.53 [textbook] → **in charge: SOXX** (Memory / AI hardware (prior US day))
**Last 20 sessions decomposed (R² 0.23, n=60):** actual -13.1% = SOXX -9.2% · ^NDX +6.2% · unexplained -10.0%
**This week:** 11-25 20:00 ET South Korea: Interest Rate Decision (cons 3.25%, prev 3.00%)

### Hang Seng  `^HSI`  22,411 (2026-11-20)
**Move:** 1w -5.2% · 4w -3.0% (46th pct of 2y 4w moves) · 13w -13.8% · 52w range position 0% (lo 22,411 / hi 27,968)
**Drivers (recent corr):** ^NDX +0.21 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.01, n=60):** actual -3.0% = ^NDX -0.6% · unexplained -2.4%

### ASX 200  `^AXJO`  8,593 (2026-11-20)
**Move:** 1w -5.4% · 4w -2.3% (51st pct of 2y 4w moves) · 13w -5.1% · 52w range position 25% (lo 8,366 / hi 9,272)
**Drivers (recent corr):** HG=F +0.48 [textbook] · ^GSPC +0.63 [textbook] → **in charge: ^GSPC** (US lead (prior US day))
**Last 20 sessions decomposed (R² 0.31, n=60):** actual -2.3% = HG=F -2.1% · ^GSPC -1.8% · unexplained +1.6%


## 7. Rates

### US 2y  `US2Y`  4.70% (2026-11-20)
**Move:** 1w -28bp · 4w -10bp (43rd pct of 2y 4w moves) · 13w +28bp · 52w range position 75% (lo 3.512 / hi 5.089)
**Drivers (recent corr):** CL=F +0.09 [weak] · ^GSPC +0.53 [textbook] → **in charge: ^GSPC** (Risk-on = fewer cuts / more hikes)
**Last 20 sessions decomposed (R² 0.08, n=60):** actual -10bp = ^GSPC -17bp · CL=F -4bp · unexplained +11bp
**Positioning (CFTC UST 2Y NOTE, 2026-11-17, + = long US 2y):** lev funds +1,288,895 (+29% OI, 4w +3,347, 5th pct of 3y) · asset mgrs -1,655,991 (-37% OI, 4w +67,589, 80th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.3%) · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 2.50%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 3.4%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 2.2%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 1.7%) · 11-25 08:30 ET United States: PCE price index (cons 0.3%, prev 0.5%)

### US 10y  `US10Y`  4.91% (2026-11-20)
**Move:** 1w -24bp · 4w -8bp (34th pct of 2y 4w moves) · 13w +17bp · 52w range position 70% (lo 3.962 / hi 5.311)
**Drivers (recent corr):** CL=F +0.18 [weak] · ^NDX +0.52 [INVERTED] · T10YIE (missing) · DE10Y +0.31 [textbook] → **in charge: ^NDX** (Textbook: yields up hurt stocks; + means bonds hedge stocks)
**Last 20 sessions decomposed (R² 0.17, n=60):** actual -8bp = ^NDX -17bp · CL=F -5bp · DE10Y +0bp · unexplained +13bp
**Positioning (CFTC UST 10Y NOTE, 2026-11-17, + = long US 10y):** lev funds +2,482,443 (+40% OI, 4w +375,219, 99th pct of 3y) · asset mgrs -3,270,834 (-52% OI, 4w -345,418, 1st pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.3%) · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 2.50%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 3.4%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 2.2%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 1.7%) · 11-25 08:30 ET United States: PCE price index (cons 0.3%, prev 0.5%)

### US 30y  `US30Y`  5.30% (2026-11-20)
**Move:** 1w -18bp · 4w -1bp (8th pct of 2y 4w moves) · 13w +3bp · 52w range position 65% (lo 4.633 / hi 5.665)
**Drivers (recent corr):** US2Y +0.91 [textbook] · T10YIE (missing) → **in charge: US2Y** (Front end)
**Last 20 sessions decomposed (R² 0.76, n=60):** actual -1bp = US2Y -7bp · unexplained +6bp
**Positioning (CFTC UST BOND, 2026-11-17, + = long US 30y):** lev funds +145,229 (+7% OI, 4w -17,528, 1st pct of 3y) · asset mgrs -371,794 (-19% OI, 4w +16,213, 99th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.3%) · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 2.50%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 3.4%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 2.2%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 1.7%) · 11-25 08:30 ET United States: PCE price index (cons 0.3%, prev 0.5%)

### Bund 10y  `DE10Y`  3.37% (2026-11-20)
**Move:** 1w -4bp · 4w +1bp (8th pct of 2y 4w moves) · 13w +10bp · 52w range position 70% (lo 2.69 / hi 3.66)
**Drivers (recent corr):** US10Y +0.31 [textbook] · BZ=F +0.02 [weak] · FR_DE (missing) → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.05, n=60):** actual +1bp = US10Y -1bp · BZ=F -1bp · unexplained +3bp
**This week:** 11-25 02:00 ET Germany: German GDP (cons 0.2%, prev 0.2%) · 11-27 02:45 ET France: French GDP (cons -0.1%, prev 0.5%) · 11-27 03:00 ET Spain: Core CPI · 11-27 03:00 ET Spain: Spanish Retail Sales · 11-27 03:55 ET Germany: German Unemployment Change · 11-27 03:55 ET Germany: German Unemployment Rate

### Gilt 10y  `GB10Y`  5.29% (2026-11-20)
**Move:** 1w -3bp · 4w -6bp (28th pct of 2y 4w moves) · 13w +16bp · 52w range position 83% (lo 4.352 / hi 5.478)
**Drivers (recent corr):** US10Y +0.60 [textbook] · GBPUSD=X -0.30 [textbook] → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.35, n=60):** actual -6bp = US10Y -4bp · GBPUSD=X +2bp · unexplained -4bp
**This week:** 11-26 05:30 ET United Kingdom: BoE FPC Meeting Minutes

### JGB 10y  `JP10Y`  2.87% (2026-11-20)
**Move:** 1w -3bp · 4w +3bp (14th pct of 2y 4w moves) · 13w -1bp · 52w range position 82% (lo 1.792 / hi 3.111)
**Drivers (recent corr):** US10Y +0.81 [textbook] · USDJPY=X +0.61 [textbook] → **in charge: US10Y** (Global duration)
**Last 20 sessions decomposed (R² 0.57, n=60):** actual +3bp = USDJPY=X +5bp · US10Y +4bp · unexplained -6bp
**This week:** 11-25 24H ET Japan: BoJ Core CPI · 11-26 18:30 ET Japan: Tokyo Core CPI

### Canada 10y  `CA10Y`  3.81% (2026-11-20)
**Move:** 1w -4bp · 4w -2bp (13th pct of 2y 4w moves) · 13w +5bp · 52w range position 79% (lo 3.12 / hi 3.99)
**Drivers (recent corr):** US10Y +0.77 [textbook] · CL=F +0.37 [textbook] → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.62, n=60):** actual -2bp = US10Y -5bp · CL=F -4bp · unexplained +7bp
**This week:** 11-27 11:00 ET Canada: Budget Balance

### French spread (proxy)
_no data_


## 8. Commodities

### WTI crude  `CL=F`  83.62 (2026-11-20)
**Move:** 1w -5.6% · 4w -19.0% (87th pct of 2y 4w moves) · 13w -4.0% · 52w range position 49% (lo 55.27 / hi 112.9)
**Drivers (recent corr):** XLE +0.53 [textbook] · ^GSPC -0.38 [INVERTED] · HG=F -0.32 [INVERTED] · DX-Y.NYB +0.28 [weak] → **in charge: XLE** (Energy equities (do they believe the move?))
**Last 20 sessions decomposed (R² 0.25, n=60):** actual -21.1% = XLE -9.9% · HG=F +7.3% · ^GSPC +5.9% · DX-Y.NYB -1.3% · unexplained -23.1%
**Positioning (CFTC WTI-PHYSICAL, 2026-11-17, + = long WTI crude):** managed money +15,814 (+1% OI, 4w -20,373, 10th pct of 3y) · producers +385,227 (+21% OI, 4w +25,659, 99th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.3%) · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 2.50%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 3.4%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 2.2%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 1.7%) · 11-25 08:30 ET United States: PCE price index (cons 0.3%, prev 0.5%)

### Gold  `GC=F`  3,539 (2026-11-20)
**Move:** 1w -8.9% · 4w -11.7% (95th pct of 2y 4w moves) · 13w -24.4% · 52w range position 0% (lo 3,539 / hi 5,318)
**Drivers (recent corr):** DFII10 (missing) · DX-Y.NYB -0.29 [weak] · SI=F +0.91 [textbook] · BTC-USD +0.36 [textbook] → **in charge: SI=F** (Precious block)
**Last 20 sessions decomposed (R² 0.79, n=60):** actual -12.4% = SI=F -12.9% · BTC-USD +1.5% · DX-Y.NYB -0.8% · unexplained -0.3%
**Positioning (CFTC GOLD, 2026-11-17, + = long Gold):** managed money +102,942 (+25% OI, 4w -1,264, 22nd pct of 3y) · producers -4,591 (-1% OI, 4w +10,192, 100th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.3%) · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 2.50%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 3.4%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 2.2%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 1.7%) · 11-25 08:30 ET United States: PCE price index (cons 0.3%, prev 0.5%)

### Silver  `SI=F`  41.08 (2026-11-20)
**Move:** 1w -16.2% · 4w -23.5% (93rd pct of 2y 4w moves) · 13w -40.9% · 52w range position 0% (lo 41.08 / hi 115.1)
**Drivers (recent corr):** GC=F +0.91 [textbook] · HG=F +0.72 [textbook] → **in charge: GC=F** (Gold)
**Last 20 sessions decomposed (R² 0.83, n=60):** actual -26.8% = GC=F -16.3% · HG=F -8.2% · unexplained -2.4%
**Positioning (CFTC SILVER, 2026-11-17, + = long Silver):** managed money +1,280 (+1% OI, 4w -2,225, 3rd pct of 3y) · producers -12,877 (-10% OI, 4w +2,152, 98th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.3%) · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 2.50%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 3.4%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 2.2%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 1.7%) · 11-25 08:30 ET United States: PCE price index (cons 0.3%, prev 0.5%)

### Copper  `HG=F`  5.465 (2026-11-20)
**Move:** 1w -10.1% · 4w -15.6% (95th pct of 2y 4w moves) · 13w -16.9% · 52w range position 27% (lo 4.962 / hi 6.804)
**Drivers (recent corr):** ^GSPC +0.47 [textbook] → **in charge: ^GSPC** (Global growth)
**Last 20 sessions decomposed (R² 0.13, n=60):** actual -17.0% = ^GSPC -5.2% · unexplained -11.8%
**Positioning (CFTC COPPER- #1, 2026-11-17, + = long Copper):** managed money +28,692 (+9% OI, 4w -18,998, 42nd pct of 3y) · producers -33,014 (-10% OI, 4w +44,392, 86th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.3%) · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 2.50%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 3.4%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 2.2%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 1.7%) · 11-25 08:30 ET United States: PCE price index (cons 0.3%, prev 0.5%)

### Nat gas (US)  `NG=F`  3.791 (2026-11-20)
**Move:** 1w +17.4% · 4w +43.6% (98th pct of 2y 4w moves) · 13w +36.7% · 52w range position 26% (lo 2.523 / hi 7.46)
**Drivers (recent corr):** CL=F +0.02 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual +36.2% = CL=F +0.3% · unexplained +35.9%
**Positioning (CFTC NAT GAS NYME, 2026-11-17, + = long Nat gas (US)):** managed money -211,545 (-13% OI, 4w -54,136, 2nd pct of 3y) · producers +17,473 (+1% OI, 4w +30,627, 96th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.3%) · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 2.50%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 3.4%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 2.2%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 1.7%) · 11-25 08:30 ET United States: PCE price index (cons 0.3%, prev 0.5%)


## 9. Crypto

### Bitcoin  `BTC-USD`  61,902 (2026-11-20)
**Move:** 1w -9.3% · 4w -23.6% (95th pct of 2y 4w moves) · 13w -21.0% · 52w range position 9% (lo 58,559 / hi 96,929)
**Drivers (recent corr):** ^NDX +0.47 [textbook] · DX-Y.NYB -0.21 [weak] · GC=F +0.36 [textbook] → **in charge: ^NDX** (Tech / speculation)
**Last 20 sessions decomposed (R² 0.31, n=60):** actual -27.0% = ^NDX -10.9% · DX-Y.NYB -1.8% · GC=F +1.1% · unexplained -15.4%
**Positioning (CFTC BITCOIN, 2026-11-17, + = long Bitcoin):** lev funds -1,211 (-6% OI, 4w +3,731, 100th pct of 3y) · asset mgrs +2,285 (+12% OI, 4w -714, 3rd pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index (cons 0.3%, prev 0.3%) · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 2.50%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 3.4%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 2.2%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 1.7%) · 11-25 08:30 ET United States: PCE price index (cons 0.3%, prev 0.5%)

