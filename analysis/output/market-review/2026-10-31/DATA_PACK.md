# Market Review Data Pack: 2026-10-31

Fetched 2026-10-31T13:52:12+00:00. Descriptive numbers for the weekly review (read with `education/market_reviews/PLAYBOOK.md`). Correlations are of daily moves: last 20 sessions vs the 60 before. They are noisy; a flip is a question, not a signal.

**Data notes:** fred DGS2: The read operation timed out · fred DFII10: The read operation timed out · fred T10YIE: The read operation timed out · fred BAMLH0A0HYM2: The read operation timed out · fred BAMLC0A0CM: The read operation timed out · FRED DGS2 missing: US 2y = US 5y stand-in for this run

## 1. Regime gauges: which story is the market trading?

| Pair | Recent | Before | Textbook sign | Status | What it means |
|---|---|---|---|---|---|
| CL=F vs US10Y | -0.24 | +0.40 | + | weak | Oil vs yields: + = oil is an inflation story; - = oil is a growth tax (2008-style) |
| ^NDX vs US10Y | +0.61 | -0.28 | − | INVERTED | Stocks vs yields: - = rates drive stocks; + = growth scare, bonds hedge stocks |
| HYG_TLT vs ^NDX | +0.72 | -0.17 | + | textbook | Credit vs tech: high + = credit and equities are one trade (credit stress leading) |
| DX-Y.NYB vs ^GSPC | +0.07 | -0.31 | − | weak | Dollar vs stocks: - = safe-haven dollar; ~0/+ = "sell America" or liquidity dash |
| AUDUSD=X vs ^NDX | +0.41 | +0.44 | + | textbook | Aussie vs tech: near 0 = AUD trading commodities not risk |
| BTC-USD vs ^NDX | +0.58 | +0.39 | + | textbook | Bitcoin vs tech: high = one liquidity complex |
| XLE vs CL=F | +0.37 | +0.67 | + | textbook | Energy stocks vs oil: falling = equity investors fade the oil move |
| USDJPY=X vs US10Y | +0.67 | +0.25 | + | textbook | Yen vs yields: high = yen is a pure rates trade |
| FR_DE vs IT_DE | +0.82 | +0.95 | + | textbook | France vs Italy spreads: high = euro-periphery contagion, low = France-specific |

Equity vol vs bond vol: VIX 19.4 (1y pct 77) · MOVE 100 (1y pct 91). When bond vol leads equity vol, the stress is in rates/credit first.

**Fed funds futures (implied average rate by contract month; vs ~1 week earlier):** V6 3.882% (-0.002) · X6 3.905% (-0.020) · Z6 4.050% (-0.035) · F7 4.120% (-0.035) · G7 4.200% (-0.050) · H7 4.270% (-0.055) · J7 4.370% (-0.055) · K7 4.450% (-0.065) · M7 4.515% (-0.050) · N7 4.550% (-0.060) · Q7 4.575% (-0.050) · U7 4.590% (-0.040) (as of 2026-10-26)

## 2. G10 FX

### EURUSD  `EURUSD=X`  1.118 (2026-10-30)
**Move:** 1w -0.3% · 4w -0.6% (21st pct of 2y 4w moves) · 13w -3.0% · 52w range position 6% (lo 1.113 / hi 1.202)
**Drivers (recent corr):** US_EA2 -0.26 [weak] · US_DE10 -0.20 [weak] · FR_DE -0.24 [weak] · ^STOXX50E -0.02 [weak] · BZ=F +0.06 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.27, n=29):** actual -0.6% = FR_DE -0.4% · US_EA2 +0.2% · US_DE10 +0.1% · BZ=F +0.1% · ^STOXX50E -0.0% · unexplained -0.6%
**Positioning (CFTC EURO FX, 2026-10-27, + = long EURUSD):** lev funds -71,574 (-8% OI, 4w -32,309, 1st pct of 3y) · asset mgrs +173,249 (+20% OI, 4w -47,354, 8th pct of 3y)
**This week:** 11-02 03:00 ET Germany: German Retail Sales · 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 03:45 ET France: French Government Budget Balance

### USDJPY  `USDJPY=X`  157.8 (2026-10-30)
**Move:** 1w +0.8% · 4w -0.1% (3rd pct of 2y 4w moves) · 13w -1.5% · 52w range position 47% (lo 152.5 / hi 163.9)
**Drivers (recent corr):** US10Y +0.67 [textbook] · US_JP10 +0.59 [textbook] · ^NDX +0.58 [textbook] · ^VIX -0.51 [textbook, was INVERTED] → **in charge: US10Y** (US yields: the carry engine)
**Last 20 sessions decomposed (R² 0.15, n=60):** actual -0.1% = US10Y -1.6% · ^NDX -0.8% · ^VIX +0.4% · US_JP10 +0.3% · unexplained +1.7%
**Positioning (CFTC JAPANESE YEN, 2026-10-27, + = long USDJPY):** lev funds +14,630 (+4% OI, 4w +469, 23rd pct of 3y) · asset mgrs -91,191 (-24% OI, 4w -39,557, 9th pct of 3y)
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 11:00 ET United States: IBD/TIPP Economic Optimism · 11-04 09:15 ET United States: ADP Nonfarm Employment Change

### GBPUSD  `GBPUSD=X`  1.338 (2026-10-30)
**Move:** 1w -0.2% · 4w +1.4% (51st pct of 2y 4w moves) · 13w -0.6% · 52w range position 44% (lo 1.302 / hi 1.383)
**Drivers (recent corr):** US_GB10 -0.15 [weak] · GB10Y -0.25 [weak] · ^GSPC -0.01 [weak] · EURUSD=X +0.80 [textbook] → **in charge: EURUSD=X** (European block move)
**Last 20 sessions decomposed (R² 0.66, n=60):** actual +1.3% = EURUSD=X -0.5% · US_GB10 +0.2% · ^GSPC -0.0% · GB10Y +0.0% · unexplained +1.6%
**Positioning (CFTC BRITISH POUND, 2026-10-27, + = long GBPUSD):** lev funds +17,195 (+7% OI, 4w +12,589, 18th pct of 3y) · asset mgrs -128,893 (-51% OI, 4w -349, 6th pct of 3y)
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 11:00 ET United States: IBD/TIPP Economic Optimism · 11-04 09:15 ET United States: ADP Nonfarm Employment Change

### USDCAD  `USDCAD=X`  1.399 (2026-10-30)
**Move:** 1w -0.1% · 4w -1.6% (71st pct of 2y 4w moves) · 13w -0.2% · 52w range position 63% (lo 1.349 / hi 1.428)
**Drivers (recent corr):** CL=F -0.02 [weak] · US_CA2 +0.29 [weak] · ^GSPC +0.01 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.27, n=60):** actual -1.7% = US_CA2 -1.4% · ^GSPC +0.2% · CL=F -0.2% · unexplained -0.3%
**Positioning (CFTC CANADIAN DOLLAR, 2026-10-27, + = long USDCAD):** lev funds +96,747 (+27% OI, 4w +27,103, 96th pct of 3y) · asset mgrs +1,325 (+0% OI, 4w -26,256, 15th pct of 3y)
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 11:00 ET United States: IBD/TIPP Economic Optimism · 11-04 09:15 ET United States: ADP Nonfarm Employment Change

### AUDUSD  `AUDUSD=X`  0.7027 (2026-10-30)
**Move:** 1w +0.1% · 4w +1.4% (54th pct of 2y 4w moves) · 13w +0.0% · 52w range position 72% (lo 0.6449 / hi 0.7255)
**Drivers (recent corr):** HG=F +0.33 [textbook] · ^NDX +0.41 [textbook] · GC=F +0.05 [weak] → **in charge: ^NDX** (Global risk proxy)
**Last 20 sessions decomposed (R² 0.17, n=60):** actual +1.4% = ^NDX -0.3% · GC=F -0.2% · HG=F -0.0% · unexplained +1.9%
**Positioning (CFTC AUSTRALIAN DOLLAR, 2026-10-27, + = long AUDUSD):** lev funds +48,414 (+15% OI, 4w -12,178, 85th pct of 3y) · asset mgrs -125,237 (-39% OI, 4w -52,038, 1st pct of 3y)
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-02 23:30 ET Australia: RBA Interest Rate Decision (cons 4.85%, prev 4.60%) · 11-03 00:30 ET Australia: RBA Monetary Policy Statement

### NZDUSD  `NZDUSD=X`  0.5632 (2026-10-30)
**Move:** 1w -0.9% · 4w +0.5% (17th pct of 2y 4w moves) · 13w -4.1% · 52w range position 9% (lo 0.5587 / hi 0.6076)
**Drivers (recent corr):** AUDUSD=X +0.31 [textbook] · ^GSPC +0.33 [textbook] · US2Y +0.33 [INVERTED, was textbook] → **in charge: US2Y** (US front end)
**Last 20 sessions decomposed (R² 0.37, n=60):** actual +0.5% = AUDUSD=X +0.9% · US2Y -0.1% · ^GSPC -0.0% · unexplained -0.3%
**Positioning (CFTC NZ DOLLAR, 2026-10-27, + = long NZDUSD):** lev funds -22,554 (-17% OI, 4w -21,488, 8th pct of 3y) · asset mgrs -46,841 (-36% OI, 4w -25,613, 11th pct of 3y)
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 11:00 ET United States: IBD/TIPP Economic Optimism · 11-03 17:45 ET New Zealand: Employment Change

### USDCHF  `USDCHF=X`  0.8236 (2026-10-30)
**Move:** 1w +0.5% · 4w -0.8% (35th pct of 2y 4w moves) · 13w +2.2% · 52w range position 83% (lo 0.7632 / hi 0.8357)
**Drivers (recent corr):** US10Y +0.61 [textbook] · ^VIX -0.40 [textbook, was INVERTED] · GC=F +0.42 [INVERTED, was textbook] → **in charge: US10Y** (US yields)
**Last 20 sessions decomposed (R² 0.30, n=60):** actual -0.8% = US10Y -1.3% · GC=F +0.5% · ^VIX +0.1% · unexplained -0.1%
**Positioning (CFTC SWISS FRANC, 2026-10-27, + = long USDCHF):** lev funds +17,502 (+13% OI, 4w +3,507, 96th pct of 3y) · asset mgrs +25,067 (+19% OI, 4w -11,344, 34th pct of 3y)
**This week:** 11-02 03:30 ET Switzerland: Retail Sales · 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 03:30 ET Switzerland: CPI


## 3. G10 crosses

### AUDNZD  `AUDNZD=X`  1.248 (2026-10-30)
**Move:** 1w +1.1% · 4w +0.9% (50th pct of 2y 4w moves) · 13w +4.4% · 52w range position 95% (lo 1.141 / hi 1.254)
**Drivers (recent corr):** HG=F +0.24 [weak] · ^AXJO +0.18 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.05, n=60):** actual +0.9% = ^AXJO -0.3% · HG=F -0.0% · unexplained +1.2%
**This week:** 11-02 23:30 ET Australia: RBA Interest Rate Decision (cons 4.85%, prev 4.60%) · 11-03 00:30 ET Australia: RBA Monetary Policy Statement · 11-03 17:45 ET New Zealand: Employment Change · 11-03 17:45 ET New Zealand: Unemployment Rate

### EURGBP  `EURGBP=X`  0.8358 (2026-10-30)
**Move:** 1w -0.2% · 4w -1.9% (91st pct of 2y 4w moves) · 13w -2.4% · 52w range position 0% (lo 0.8358 / hi 0.8842)
**Drivers (recent corr):** GB10Y -0.17 [weak] · FR_DE -0.38 [textbook] → **in charge: FR_DE** (Euro fiscal stress)
**Last 20 sessions decomposed (R² 0.14, n=29):** actual -1.9% = FR_DE -0.2% · GB10Y -0.0% · unexplained -1.7%
**This week:** 11-02 03:00 ET Germany: German Retail Sales · 11-03 03:45 ET France: French Government Budget Balance · 11-04 06:00 ET Euro Zone: Core CPI · 11-04 06:00 ET Euro Zone: CPI · 11-05 05:00 ET Italy: Italian Retail Sales · 11-05 08:00 ET United Kingdom: BoE Interest Rate Decision (cons 4.00%, prev 3.75%)

### EURCHF  `EURCHF=X`  0.9209 (2026-10-30)
**Move:** 1w +0.1% · 4w -1.4% (85th pct of 2y 4w moves) · 13w -0.8% · 52w range position 45% (lo 0.9001 / hi 0.9466)
**Drivers (recent corr):** ^STOXX50E +0.60 [textbook] · FR_DE -0.72 [textbook] · ^VIX -0.38 [textbook] → **in charge: FR_DE** (Euro fiscal stress)
**Last 20 sessions decomposed (R² 0.51, n=29):** actual -1.4% = FR_DE -0.6% · ^STOXX50E -0.2% · ^VIX +0.1% · unexplained -0.7%
**This week:** 11-02 03:00 ET Germany: German Retail Sales · 11-02 03:30 ET Switzerland: Retail Sales · 11-03 03:30 ET Switzerland: CPI · 11-03 03:45 ET France: French Government Budget Balance · 11-04 06:00 ET Euro Zone: Core CPI · 11-04 06:00 ET Euro Zone: CPI


## 4. EM FX

### USDMXN  `USDMXN=X`  18.85 (2026-10-30)
**Move:** 1w +0.7% · 4w +2.9% (85th pct of 2y 4w moves) · 13w +8.7% · 52w range position 100% (lo 16.89 / hi 18.85)
**Drivers (recent corr):** ^VIX +0.21 [weak] · ^GSPC -0.42 [textbook] · CL=F +0.20 [weak] · USDBRL=X -0.01 [weak] → **in charge: ^GSPC** (US growth / risk)
**Last 20 sessions decomposed (R² 0.16, n=60):** actual +2.9% = ^GSPC +0.6% · CL=F -0.5% · ^VIX +0.2% · USDBRL=X +0.1% · unexplained +2.5%
**Positioning (CFTC MEXICAN PESO, 2026-10-27, + = long USDMXN):** lev funds -68,335 (-24% OI, 4w +12,252, 7th pct of 3y) · asset mgrs +25,201 (+9% OI, 4w +41,452, 100th pct of 3y)
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 11:00 ET United States: IBD/TIPP Economic Optimism · 11-04 09:15 ET United States: ADP Nonfarm Employment Change

### USDBRL  `USDBRL=X`  5.385 (2026-10-30)
**Move:** 1w +6.6% · 4w +3.1% (75th pct of 2y 4w moves) · 13w +6.0% · 52w range position 70% (lo 4.906 / hi 5.59)
**Drivers (recent corr):** ^VIX -0.02 [weak] · HG=F +0.01 [weak] · EWZ -0.06 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.02, n=60):** actual +3.1% = EWZ +0.8% · ^VIX +0.2% · HG=F +0.0% · unexplained +2.0%
**Positioning (CFTC BRAZILIAN REAL, 2026-10-27, + = long USDBRL):** lev funds -7,600 (-5% OI, 4w +1,953, 27th pct of 3y) · asset mgrs -52,010 (-31% OI, 4w +15,005, 42nd pct of 3y)
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 11:00 ET United States: IBD/TIPP Economic Optimism · 11-04 09:15 ET United States: ADP Nonfarm Employment Change

### USDZAR  `USDZAR=X`  16.61 (2026-10-30)
**Move:** 1w +0.8% · 4w -0.6% (18th pct of 2y 4w moves) · 13w +0.6% · 52w range position 50% (lo 15.71 / hi 17.49)
**Drivers (recent corr):** GC=F -0.33 [textbook] · ^VIX +0.28 [weak] · HG=F -0.15 [weak] → **in charge: GC=F** (Gold / precious metals exporter)
**Last 20 sessions decomposed (R² 0.19, n=60):** actual -0.6% = ^VIX +0.4% · GC=F +0.3% · HG=F +0.0% · unexplained -1.3%
**Positioning (CFTC SO AFRICAN RAND, 2026-10-27, + = long USDZAR):** lev funds -5,262 (-14% OI, 4w -608, 22nd pct of 3y) · asset mgrs -16,859 (-45% OI, 4w +3,861, 27th pct of 3y)
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 11:00 ET United States: IBD/TIPP Economic Optimism · 11-04 09:15 ET United States: ADP Nonfarm Employment Change

### USDKRW  `USDKRW=X`  1,338 (2026-10-30)
**Move:** 1w +0.9% · 4w -1.7% (50th pct of 2y 4w moves) · 13w -5.8% · 52w range position 7% (lo 1,322 / hi 1,552)
**Drivers (recent corr):** ^KS11 -0.03 [weak] · SOXX -0.07 [weak] · DX-Y.NYB -0.34 [INVERTED, was textbook] → **in charge: DX-Y.NYB** (Broad dollar)
**Last 20 sessions decomposed (R² 0.09, n=60):** actual -1.7% = ^KS11 -0.7% · SOXX +0.5% · DX-Y.NYB -0.0% · unexplained -1.4%
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-02 19:00 ET South Korea: CPI (cons 2.9%, prev 2.9%) · 11-03 11:00 ET United States: IBD/TIPP Economic Optimism


## 5. CE3 FX

### EURCZK  `EURCZK=X`  24.33 (2026-10-30)
**Move:** 1w +0.3% · 4w -0.5% (61st pct of 2y 4w moves) · 13w +0.6% · 52w range position 57% (lo 24.07 / hi 24.53)
**Drivers (recent corr):** ^STOXX50E +0.01 [weak] · EURPLN=X +0.50 [textbook] → **in charge: EURPLN=X** (CE3 block)
**Last 20 sessions decomposed (R² 0.17, n=60):** actual -0.5% = EURPLN=X +0.1% · ^STOXX50E +0.0% · unexplained -0.6%
**This week:** 11-02 03:00 ET Germany: German Retail Sales · 11-03 03:45 ET France: French Government Budget Balance · 11-04 06:00 ET Euro Zone: Core CPI · 11-04 06:00 ET Euro Zone: CPI · 11-05 05:00 ET Italy: Italian Retail Sales · 11-06 06:00 ET Euro Zone: Retail Sales

### EURPLN  `EURPLN=X`  4.388 (2026-10-30)
**Move:** 1w +0.3% · 4w +0.3% (38th pct of 2y 4w moves) · 13w +1.9% · 52w range position 94% (lo 4.197 / hi 4.401)
**Drivers (recent corr):** ^STOXX50E -0.12 [weak] · ^VIX +0.04 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.06, n=60):** actual +0.3% = ^STOXX50E +0.1% · ^VIX +0.1% · unexplained +0.2%
**This week:** 11-02 03:00 ET Germany: German Retail Sales · 11-03 03:45 ET France: French Government Budget Balance · 11-04 06:00 ET Euro Zone: Core CPI · 11-04 06:00 ET Euro Zone: CPI · 11-05 05:00 ET Italy: Italian Retail Sales · 11-06 06:00 ET Euro Zone: Retail Sales


## 6. Equities

### S&P 500  `^GSPC`  7,580 (2026-10-30)
**Move:** 1w -0.6% · 4w -1.8% (40th pct of 2y 4w moves) · 13w +1.2% · 52w range position 84% (lo 6,344 / hi 7,819)
**Drivers (recent corr):** US10Y +0.46 [INVERTED, was textbook] · HYG_TLT +0.57 [textbook, was INVERTED] · DX-Y.NYB +0.07 [weak] · CL=F -0.52 [textbook] · ^VIX -0.87 [textbook] → **in charge: ^VIX** (Vol)
**Last 20 sessions decomposed (R² 0.73, n=60):** actual -1.9% = ^VIX -1.8% · HYG_TLT -1.6% · US10Y +1.3% · CL=F -0.7% · DX-Y.NYB +0.0% · unexplained +0.9%
**Positioning (CFTC E-MINI S&P 500, 2026-10-27, + = long S&P 500):** lev funds -400,604 (-20% OI, 4w -28,115, 27th pct of 3y) · asset mgrs +923,449 (+47% OI, 4w +19,446, 45th pct of 3y)
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 11:00 ET United States: IBD/TIPP Economic Optimism · 11-04 09:15 ET United States: ADP Nonfarm Employment Change

### Nasdaq 100  `^NDX`  28,385 (2026-10-30)
**Move:** 1w -2.0% · 4w -7.9% (86th pct of 2y 4w moves) · 13w +0.4% · 52w range position 66% (lo 22,953 / hi 31,224)
**Drivers (recent corr):** US10Y +0.61 [INVERTED] · SOXX +0.95 [textbook] · HYG_TLT +0.72 [textbook] · BTC-USD +0.58 [textbook] → **in charge: SOXX** (Semis / AI capex)
**Last 20 sessions decomposed (R² 0.82, n=60):** actual -8.2% = SOXX -7.7% · US10Y +1.2% · HYG_TLT -1.2% · BTC-USD -0.8% · unexplained +0.2%
**Positioning (CFTC NASDAQ MINI, 2026-10-27, + = long Nasdaq 100):** lev funds +2,301 (+1% OI, 4w +27,024, 95th pct of 3y) · asset mgrs +65,381 (+24% OI, 4w -4,363, 25th pct of 3y)
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 11:00 ET United States: IBD/TIPP Economic Optimism · 11-04 09:15 ET United States: ADP Nonfarm Employment Change

### Russell 2000  `^RUT`  2,812 (2026-10-30)
**Move:** 1w +1.3% · 4w -0.7% (11th pct of 2y 4w moves) · 13w -4.1% · 52w range position 66% (lo 2,305 / hi 3,068)
**Drivers (recent corr):** US2Y +0.04 [weak] · HYG_TLT +0.11 [weak] · ^GSPC +0.66 [textbook] → **in charge: ^GSPC** (Beta)
**Last 20 sessions decomposed (R² 0.57, n=60):** actual -0.7% = ^GSPC -1.7% · US2Y +1.4% · HYG_TLT +0.1% · unexplained -0.5%
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 11:00 ET United States: IBD/TIPP Economic Optimism · 11-04 09:15 ET United States: ADP Nonfarm Employment Change

### Euro Stoxx 50  `^STOXX50E`  6,131 (2026-10-30)
**Move:** 1w +1.0% · 4w -1.7% (34th pct of 2y 4w moves) · 13w -3.6% · 52w range position 60% (lo 5,501 / hi 6,551)
**Drivers (recent corr):** FR_DE -0.39 [textbook] · ^GSPC +0.49 [textbook] · BZ=F -0.35 [textbook] · EURUSD=X -0.02 [weak] → **in charge: ^GSPC** (US lead)
**Last 20 sessions decomposed (R² 0.33, n=29):** actual -1.7% = FR_DE -1.1% · BZ=F -1.0% · ^GSPC -0.5% · EURUSD=X -0.0% · unexplained +0.8%
**This week:** 11-02 03:00 ET Germany: German Retail Sales · 11-03 03:45 ET France: French Government Budget Balance · 11-04 06:00 ET Euro Zone: Core CPI · 11-04 06:00 ET Euro Zone: CPI · 11-05 05:00 ET Italy: Italian Retail Sales · 11-06 06:00 ET Euro Zone: Retail Sales

### CAC 40  `^FCHI`  7,969 (2026-10-30)
**Move:** 1w +2.4% · 4w +0.9% (22nd pct of 2y 4w moves) · 13w -6.3% · 52w range position 29% (lo 7,666 / hi 8,726)
**Drivers (recent corr):** FR_DE -0.36 [textbook] · ^STOXX50E +0.84 [textbook] → **in charge: ^STOXX50E** (European block)
**Last 20 sessions decomposed (R² 0.71, n=29):** actual +0.9% = ^STOXX50E -1.2% · FR_DE -0.3% · unexplained +2.5%
**This week:** 11-02 03:00 ET Germany: German Retail Sales · 11-03 03:45 ET France: French Government Budget Balance · 11-04 06:00 ET Euro Zone: Core CPI · 11-04 06:00 ET Euro Zone: CPI · 11-05 05:00 ET Italy: Italian Retail Sales · 11-06 06:00 ET Euro Zone: Retail Sales

### DAX  `^GDAXI`  25,818 (2026-10-30)
**Move:** 1w +2.5% · 4w +2.3% (45th pct of 2y 4w moves) · 13w +0.7% · 52w range position 82% (lo 22,301 / hi 26,570)
**Drivers (recent corr):** DE10Y -0.01 [weak] · ^GSPC +0.43 [textbook] → **in charge: ^GSPC** (Global risk)
**Last 20 sessions decomposed (R² 0.25, n=60):** actual +2.3% = ^GSPC -1.0% · DE10Y +0.2% · unexplained +3.1%
**This week:** 11-02 03:00 ET Germany: German Retail Sales · 11-03 03:45 ET France: French Government Budget Balance · 11-04 06:00 ET Euro Zone: Core CPI · 11-04 06:00 ET Euro Zone: CPI · 11-05 05:00 ET Italy: Italian Retail Sales · 11-06 06:00 ET Euro Zone: Retail Sales

### FTSE 100  `^FTSE`  10,730 (2026-10-30)
**Move:** 1w +0.4% · 4w +2.6% (61st pct of 2y 4w moves) · 13w -1.3% · 52w range position 87% (lo 9,507 / hi 10,911)
**Drivers (recent corr):** BZ=F +0.02 [weak] · GBPUSD=X +0.01 [weak] · GB10Y -0.59 [textbook] → **in charge: GB10Y** (Gilts)
**Last 20 sessions decomposed (R² 0.35, n=60):** actual +2.5% = BZ=F +0.4% · GB10Y +0.2% · GBPUSD=X +0.1% · unexplained +1.9%
**This week:** 11-05 08:00 ET United Kingdom: BoE Interest Rate Decision (cons 4.00%, prev 3.75%) · 11-05 08:00 ET United Kingdom: BoE MPC Meeting Minutes

### Nikkei 225  `^N225`  63,290 (2026-10-30)
**Move:** 1w +1.0% · 4w -7.3% (75th pct of 2y 4w moves) · 13w -1.7% · 52w range position 62% (lo 48,538 / hi 72,366)
**Drivers (recent corr):** USDJPY=X +0.23 [weak] · ^NDX +0.43 [textbook] · SOXX +0.44 [textbook] → **in charge: SOXX** (Chips (prior US day))
**Last 20 sessions decomposed (R² 0.19, n=60):** actual -7.6% = ^NDX -1.5% · SOXX -1.2% · USDJPY=X +0.0% · unexplained -4.9%
**This week:** 11-04 19:50 ET Japan: Monetary Policy Meeting Minutes

### KOSPI  `^KS11`  5,731 (2026-10-30)
**Move:** 1w +3.3% · 4w -18.2% (86th pct of 2y 4w moves) · 13w -13.1% · 52w range position 36% (lo 3,846 / hi 9,115)
**Drivers (recent corr):** SOXX +0.31 [textbook] · ^NDX +0.18 [weak] → **in charge: SOXX** (Memory / AI hardware (prior US day))
**Last 20 sessions decomposed (R² 0.13, n=60):** actual -20.1% = SOXX -6.5% · ^NDX +1.8% · unexplained -15.4%
**This week:** 11-02 19:00 ET South Korea: CPI (cons 2.9%, prev 2.9%)

### Hang Seng  `^HSI`  23,294 (2026-10-30)
**Move:** 1w +0.9% · 4w -2.8% (43rd pct of 2y 4w moves) · 13w -10.0% · 52w range position 12% (lo 22,672 / hi 27,968)
**Drivers (recent corr):** ^NDX -0.35 [INVERTED] → **in charge: ^NDX** (US tech (prior US day))
**Last 20 sessions decomposed (R² 0.01, n=60):** actual -2.9% = ^NDX +0.3% · unexplained -3.1%
**This week:** 11-03 04:30 ET Hong Kong: GDP · 11-03 04:30 ET Hong Kong: Retail Sales

### ASX 200  `^AXJO`  8,908 (2026-10-30)
**Move:** 1w +1.3% · 4w +2.6% (59th pct of 2y 4w moves) · 13w -0.8% · 52w range position 60% (lo 8,366 / hi 9,272)
**Drivers (recent corr):** HG=F +0.07 [weak] · ^GSPC +0.08 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.06, n=60):** actual +2.6% = HG=F +0.1% · ^GSPC +0.1% · unexplained +2.4%
**This week:** 11-02 23:30 ET Australia: RBA Interest Rate Decision (cons 4.85%, prev 4.60%) · 11-03 00:30 ET Australia: RBA Monetary Policy Statement


## 7. Rates

### US 2y  `US2Y`  4.72% (2026-10-30)
**Move:** 1w -8bp · 4w -33bp (91st pct of 2y 4w moves) · 13w +26bp · 52w range position 77% (lo 3.512 / hi 5.089)
**Drivers (recent corr):** CL=F -0.28 [weak] · ^GSPC +0.53 [textbook, was INVERTED] → **in charge: ^GSPC** (Risk-on = fewer cuts / more hikes)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual -33bp = CL=F +1bp · ^GSPC +0bp · unexplained -34bp
**Positioning (CFTC UST 2Y NOTE, 2026-10-27, + = long US 2y):** lev funds +1,357,658 (+30% OI, 4w +191,678, 9th pct of 3y) · asset mgrs -1,837,491 (-41% OI, 4w -199,013, 65th pct of 3y)
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 11:00 ET United States: IBD/TIPP Economic Optimism · 11-04 09:15 ET United States: ADP Nonfarm Employment Change

### US 10y  `US10Y`  4.93% (2026-10-30)
**Move:** 1w -6bp · 4w -35bp (93rd pct of 2y 4w moves) · 13w +18bp · 52w range position 72% (lo 3.962 / hi 5.311)
**Drivers (recent corr):** CL=F -0.24 [weak] · ^NDX +0.61 [INVERTED] · T10YIE (missing) · DE10Y +0.23 [weak] → **in charge: ^NDX** (Textbook: yields up hurt stocks; + means bonds hedge stocks)
**Last 20 sessions decomposed (R² 0.09, n=60):** actual -35bp = ^NDX -10bp · CL=F +4bp · DE10Y -2bp · unexplained -27bp
**Positioning (CFTC UST 10Y NOTE, 2026-10-27, + = long US 10y):** lev funds +2,227,275 (+38% OI, 4w +190,843, 84th pct of 3y) · asset mgrs -3,000,164 (-51% OI, 4w -223,633, 1st pct of 3y)
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 11:00 ET United States: IBD/TIPP Economic Optimism · 11-04 09:15 ET United States: ADP Nonfarm Employment Change

### US 30y  `US30Y`  5.31% (2026-10-30)
**Move:** 1w -1bp · 4w -32bp (95th pct of 2y 4w moves) · 13w +3bp · 52w range position 66% (lo 4.633 / hi 5.665)
**Drivers (recent corr):** US2Y +0.85 [textbook] · T10YIE (missing) → **in charge: US2Y** (Front end)
**Last 20 sessions decomposed (R² 0.66, n=60):** actual -32bp = US2Y -22bp · unexplained -10bp
**Positioning (CFTC UST BOND, 2026-10-27, + = long US 30y):** lev funds +150,393 (+8% OI, 4w -101,002, 1st pct of 3y) · asset mgrs -383,981 (-20% OI, 4w +52,975, 97th pct of 3y)
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 11:00 ET United States: IBD/TIPP Economic Optimism · 11-04 09:15 ET United States: ADP Nonfarm Employment Change

### Bund 10y  `DE10Y`  3.38% (2026-10-30)
**Move:** 1w +2bp · 4w -8bp (41st pct of 2y 4w moves) · 13w +20bp · 52w range position 72% (lo 2.67 / hi 3.66)
**Drivers (recent corr):** US10Y +0.23 [weak] · BZ=F -0.06 [weak] · FR_DE +0.02 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.06, n=29):** actual -8bp = BZ=F +6bp · US10Y -4bp · FR_DE +2bp · unexplained -11bp
**This week:** 11-02 03:00 ET Germany: German Retail Sales · 11-03 03:45 ET France: French Government Budget Balance · 11-04 06:00 ET Euro Zone: Core CPI · 11-04 06:00 ET Euro Zone: CPI · 11-05 05:00 ET Italy: Italian Retail Sales · 11-06 06:00 ET Euro Zone: Retail Sales

### Gilt 10y  `GB10Y`  5.33% (2026-10-30)
**Move:** 1w -2bp · 4w -3bp (13th pct of 2y 4w moves) · 13w +22bp · 52w range position 86% (lo 4.352 / hi 5.478)
**Drivers (recent corr):** US10Y +0.57 [textbook] · GBPUSD=X -0.25 [weak] → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.35, n=60):** actual -3bp = US10Y -20bp · GBPUSD=X +0bp · unexplained +16bp
**This week:** 11-05 08:00 ET United Kingdom: BoE Interest Rate Decision (cons 4.00%, prev 3.75%) · 11-05 08:00 ET United Kingdom: BoE MPC Meeting Minutes

### JGB 10y  `JP10Y`  2.88% (2026-10-30)
**Move:** 1w +4bp · 4w -22bp (91st pct of 2y 4w moves) · 13w +7bp · 52w range position 84% (lo 1.67 / hi 3.111)
**Drivers (recent corr):** US10Y +0.49 [textbook] · USDJPY=X +0.73 [textbook] → **in charge: USDJPY=X** (Weak yen -> BoJ pressure)
**Last 20 sessions decomposed (R² 0.46, n=60):** actual -22bp = US10Y -7bp · USDJPY=X -0bp · unexplained -15bp
**This week:** 11-04 19:50 ET Japan: Monetary Policy Meeting Minutes

### Canada 10y  `CA10Y`  3.84% (2026-10-30)
**Move:** 1w +1bp · 4w -9bp (39th pct of 2y 4w moves) · 13w +19bp · 52w range position 83% (lo 3.1 / hi 3.99)
**Drivers (recent corr):** US10Y +0.75 [textbook] · CL=F +0.09 [weak] → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.67, n=60):** actual -9bp = US10Y -24bp · CL=F +6bp · unexplained +9bp
**This week:** 11-06 09:30 ET Canada: Employment Change · 11-06 09:30 ET Canada: Full Employment Change · 11-06 09:30 ET Canada: Part Time Employment Change · 11-06 09:30 ET Canada: Unemployment Rate

### French spread (proxy)  `FR_DE`  +89bp vs start of capture (2026-10-30)
**Move:** 1w -158bp · 4w +2163bp () · 13w n/a · 52w range position 86% (lo 31.02 / hi 98.46)
**Drivers (recent corr):** IT_DE +0.82 [textbook] · ^STOXX50E -0.39 [textbook] → **in charge: IT_DE** (Contagion: Italy moving with France?)
**Last 20 sessions decomposed (R² 0.77, n=29):** actual +2163bp = ^STOXX50E +180bp · IT_DE +171bp · unexplained +1812bp
**This week:** 11-02 03:00 ET Germany: German Retail Sales · 11-03 03:45 ET France: French Government Budget Balance · 11-04 06:00 ET Euro Zone: Core CPI · 11-04 06:00 ET Euro Zone: CPI · 11-05 05:00 ET Italy: Italian Retail Sales · 11-06 06:00 ET Euro Zone: Retail Sales


## 8. Commodities

### WTI crude  `CL=F`  104.1 (2026-10-30)
**Move:** 1w +0.8% · 4w +14.3% (83rd pct of 2y 4w moves) · 13w +23.0% · 52w range position 85% (lo 55.27 / hi 112.9)
**Drivers (recent corr):** XLE +0.37 [textbook] · ^GSPC -0.52 [INVERTED] · HG=F -0.25 [weak] · DX-Y.NYB -0.25 [weak] → **in charge: ^GSPC** (Demand (- = supply shock))
**Last 20 sessions decomposed (R² 0.44, n=60):** actual +13.3% = XLE +9.0% · ^GSPC +1.8% · HG=F +0.2% · DX-Y.NYB +0.1% · unexplained +2.3%
**Positioning (CFTC WTI-PHYSICAL, 2026-10-27, + = long WTI crude):** managed money +31,128 (+2% OI, 4w -48,464, 13th pct of 3y) · producers +366,392 (+19% OI, 4w +46,853, 96th pct of 3y)
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 11:00 ET United States: IBD/TIPP Economic Optimism · 11-04 09:15 ET United States: ADP Nonfarm Employment Change

### Gold  `GC=F`  3,899 (2026-10-30)
**Move:** 1w -2.7% · 4w -6.3% (66th pct of 2y 4w moves) · 13w -5.1% · 52w range position 0% (lo 3,899 / hi 5,318)
**Drivers (recent corr):** DFII10 (missing) · DX-Y.NYB -0.16 [weak] · SI=F +0.88 [textbook] · BTC-USD +0.40 [textbook] → **in charge: SI=F** (Precious block)
**Last 20 sessions decomposed (R² 0.72, n=60):** actual -6.5% = SI=F -8.2% · BTC-USD -0.5% · DX-Y.NYB +0.0% · unexplained +2.2%
**Positioning (CFTC GOLD, 2026-10-27, + = long Gold):** managed money +105,562 (+27% OI, 4w -14,756, 25th pct of 3y) · producers -9,574 (-2% OI, 4w +11,689, 99th pct of 3y)
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 11:00 ET United States: IBD/TIPP Economic Optimism · 11-04 09:15 ET United States: ADP Nonfarm Employment Change

### Silver  `SI=F`  49.1 (2026-10-30)
**Move:** 1w -8.6% · 4w -18.1% (85th pct of 2y 4w moves) · 13w -14.7% · 52w range position 3% (lo 47.13 / hi 115.1)
**Drivers (recent corr):** GC=F +0.88 [textbook] · HG=F +0.60 [textbook] → **in charge: GC=F** (Gold)
**Last 20 sessions decomposed (R² 0.76, n=60):** actual -20.0% = GC=F -8.4% · HG=F -0.3% · unexplained -11.3%
**Positioning (CFTC SILVER, 2026-10-27, + = long Silver):** managed money +3,321 (+3% OI, 4w -4,293, 4th pct of 3y) · producers -15,231 (-13% OI, 4w +1,281, 94th pct of 3y)
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 11:00 ET United States: IBD/TIPP Economic Optimism · 11-04 09:15 ET United States: ADP Nonfarm Employment Change

### Copper  `HG=F`  6.458 (2026-10-30)
**Move:** 1w -0.3% · 4w -0.5% (6th pct of 2y 4w moves) · 13w +0.3% · 52w range position 82% (lo 4.926 / hi 6.804)
**Drivers (recent corr):** ^GSPC +0.59 [textbook] → **in charge: ^GSPC** (Global growth)
**Last 20 sessions decomposed (R² 0.23, n=60):** actual -0.5% = ^GSPC -1.8% · unexplained +1.3%
**Positioning (CFTC COPPER- #1, 2026-10-27, + = long Copper):** managed money +40,575 (+12% OI, 4w -37,483, 57th pct of 3y) · producers -65,243 (-19% OI, 4w +39,097, 47th pct of 3y)
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 11:00 ET United States: IBD/TIPP Economic Optimism · 11-04 09:15 ET United States: ADP Nonfarm Employment Change

### Nat gas (US)  `NG=F`  2.898 (2026-10-30)
**Move:** 1w +9.8% · 4w -4.5% (23rd pct of 2y 4w moves) · 13w +5.5% · 52w range position 8% (lo 2.523 / hi 7.46)
**Drivers (recent corr):** CL=F -0.07 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual -4.6% = CL=F +1.0% · unexplained -5.6%
**Positioning (CFTC NAT GAS NYME, 2026-10-27, + = long Nat gas (US)):** managed money -206,317 (-12% OI, 4w -73,518, 1st pct of 3y) · producers -3,516 (-0% OI, 4w +10,568, 89th pct of 3y)
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 11:00 ET United States: IBD/TIPP Economic Optimism · 11-04 09:15 ET United States: ADP Nonfarm Employment Change


## 9. Crypto

### Bitcoin  `BTC-USD`  77,198 (2026-10-30)
**Move:** 1w -4.8% · 4w -8.6% (60th pct of 2y 4w moves) · 13w +22.9% · 52w range position 37% (lo 58,559 / hi 109,556)
**Drivers (recent corr):** ^NDX +0.58 [textbook] · DX-Y.NYB -0.13 [weak] · GC=F +0.40 [textbook] → **in charge: ^NDX** (Tech / speculation)
**Last 20 sessions decomposed (R² 0.36, n=60):** actual -9.0% = ^NDX -4.9% · GC=F -4.5% · DX-Y.NYB +0.1% · unexplained +0.3%
**Positioning (CFTC BITCOIN, 2026-10-27, + = long Bitcoin):** lev funds -3,979 (-19% OI, 4w +2,877, 100th pct of 3y) · asset mgrs +2,754 (+13% OI, 4w -832, 6th pct of 3y)
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 11:00 ET United States: IBD/TIPP Economic Optimism · 11-04 09:15 ET United States: ADP Nonfarm Employment Change

