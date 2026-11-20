# Market Review Data Pack: 2026-11-20

Fetched 2026-11-20T03:42:34+00:00. Descriptive numbers for the weekly review (read with `education/market_reviews/PLAYBOOK.md`). Correlations are of daily moves: last 20 sessions vs the 60 before. They are noisy; a flip is a question, not a signal.

**Data notes:** fred DGS2: The read operation timed out · fred DFII10: The read operation timed out · fred T10YIE: The read operation timed out · fred BAMLH0A0HYM2: The read operation timed out · fred BAMLC0A0CM: The read operation timed out · FRED DGS2 missing: US 2y = US 5y stand-in for this run · No local OAT/Bund futures: French spread proxy unavailable

## 1. Regime gauges: which story is the market trading?

| Pair | Recent | Before | Textbook sign | Status | What it means |
|---|---|---|---|---|---|
| CL=F vs US10Y | +0.29 | +0.08 | + | weak | Oil vs yields: + = oil is an inflation story; - = oil is a growth tax (2008-style) |
| ^NDX vs US10Y | +0.36 | -0.04 | − | INVERTED | Stocks vs yields: - = rates drive stocks; + = growth scare, bonds hedge stocks |
| HYG_TLT vs ^NDX | +0.43 | +0.16 | + | textbook | Credit vs tech: high + = credit and equities are one trade (credit stress leading) |
| DX-Y.NYB vs ^GSPC | -0.08 | +0.02 | − | weak | Dollar vs stocks: - = safe-haven dollar; ~0/+ = "sell America" or liquidity dash |
| AUDUSD=X vs ^NDX | +0.54 | +0.32 | + | textbook | Aussie vs tech: near 0 = AUD trading commodities not risk |
| BTC-USD vs ^NDX | +0.57 | +0.42 | + | textbook | Bitcoin vs tech: high = one liquidity complex |
| XLE vs CL=F | +0.54 | +0.28 | + | textbook | Energy stocks vs oil: falling = equity investors fade the oil move |
| USDJPY=X vs US10Y | +0.45 | +0.38 | + | textbook | Yen vs yields: high = yen is a pure rates trade |

Equity vol vs bond vol: VIX 28.4 (1y pct 99) · MOVE 96 (1y pct 85). When bond vol leads equity vol, the stress is in rates/credit first.

## 2. G10 FX

### EURUSD  `EURUSD=X`  1.098 (2026-11-20)
**Move:** 1w -0.7% · 4w -2.2% (78th pct of 2y 4w moves) · 13w -6.1% · 52w range position 0% (lo 1.097 / hi 1.202)
**Drivers (recent corr):** US_EA2 -0.18 [weak] · US_DE10 -0.15 [weak] · FR_DE (missing) · ^STOXX50E -0.09 [weak] · BZ=F -0.25 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.05, n=60):** actual -2.2% = BZ=F +0.3% · US_EA2 +0.0% · ^STOXX50E +0.0% · US_DE10 +0.0% · unexplained -2.5%
**Positioning (CFTC EURO FX, 2026-11-10, + = long EURUSD):** lev funds -71,676 (-8% OI, 4w -3,675, 1st pct of 3y) · asset mgrs +165,477 (+19% OI, 4w -34,441, 8th pct of 3y)
**This week:** 11-25 02:00 ET Germany: German GDP (cons 1.2%, prev 1.2%) · 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%)

### USDJPY  `USDJPY=X`  159.2 (2026-11-20)
**Move:** 1w -0.4% · 4w +1.7% (60th pct of 2y 4w moves) · 13w +0.2% · 52w range position 59% (lo 152.5 / hi 163.9)
**Drivers (recent corr):** US10Y +0.45 [textbook] · US_JP10 +0.13 [weak] · ^NDX +0.69 [textbook] · ^VIX -0.61 [textbook] → **in charge: ^NDX** (Risk appetite: carry trades fund in yen)
**Last 20 sessions decomposed (R² 0.17, n=60):** actual +1.7% = ^NDX -0.6% · US10Y +0.3% · ^VIX +0.1% · US_JP10 -0.0% · unexplained +2.0%
**Positioning (CFTC JAPANESE YEN, 2026-11-10, + = long USDJPY):** lev funds +16,855 (+4% OI, 4w -16,818, 25th pct of 3y) · asset mgrs -90,344 (-23% OI, 4w -24,525, 10th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%) · 11-25 08:30 ET United States: PCE price index

### GBPUSD  `GBPUSD=X`  1.31 (2026-11-20)
**Move:** 1w -1.0% · 4w -2.3% (82nd pct of 2y 4w moves) · 13w -4.0% · 52w range position 2% (lo 1.308 / hi 1.383)
**Drivers (recent corr):** US_GB10 +0.00 [weak] · GB10Y -0.45 [INVERTED] · ^GSPC +0.08 [weak] · EURUSD=X +0.87 [textbook] → **in charge: EURUSD=X** (European block move)
**Last 20 sessions decomposed (R² 0.69, n=60):** actual -2.3% = EURUSD=X -1.9% · ^GSPC -0.3% · US_GB10 -0.0% · GB10Y -0.0% · unexplained -0.1%
**Positioning (CFTC BRITISH POUND, 2026-11-10, + = long GBPUSD):** lev funds +34,495 (+16% OI, 4w +24,182, 57th pct of 3y) · asset mgrs -105,960 (-48% OI, 4w +39,775, 20th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%) · 11-25 08:30 ET United States: PCE price index

### USDCAD  `USDCAD=X`  1.433 (2026-11-20)
**Move:** 1w +0.5% · 4w +2.4% (89th pct of 2y 4w moves) · 13w +4.0% · 52w range position 100% (lo 1.349 / hi 1.433)
**Drivers (recent corr):** CL=F +0.11 [weak] · US_CA2 +0.22 [weak] · ^GSPC +0.07 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.20, n=60):** actual +2.3% = US_CA2 +0.3% · ^GSPC +0.2% · CL=F -0.0% · unexplained +1.9%
**Positioning (CFTC CANADIAN DOLLAR, 2026-11-10, + = long USDCAD):** lev funds +68,205 (+20% OI, 4w -19,907, 68th pct of 3y) · asset mgrs -14,480 (-4% OI, 4w -45,284, 9th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%) · 11-25 08:30 ET United States: PCE price index

### AUDUSD  `AUDUSD=X`  0.666 (2026-11-20)
**Move:** 1w -2.2% · 4w -5.1% (98th pct of 2y 4w moves) · 13w -6.5% · 52w range position 26% (lo 0.6449 / hi 0.7255)
**Drivers (recent corr):** HG=F +0.46 [textbook] · ^NDX +0.54 [textbook] · GC=F +0.48 [textbook] → **in charge: ^NDX** (Global risk proxy)
**Last 20 sessions decomposed (R² 0.22, n=60):** actual -5.3% = ^NDX -1.0% · GC=F -0.4% · HG=F -0.2% · unexplained -3.6%
**Positioning (CFTC AUSTRALIAN DOLLAR, 2026-11-10, + = long AUDUSD):** lev funds +50,819 (+14% OI, 4w +228, 89th pct of 3y) · asset mgrs -157,207 (-45% OI, 4w -41,287, 1st pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%) · 11-25 08:30 ET United States: PCE price index

### NZDUSD  `NZDUSD=X`  0.5491 (2026-11-20)
**Move:** 1w -1.0% · 4w -3.4% (85th pct of 2y 4w moves) · 13w -7.8% · 52w range position 0% (lo 0.5489 / hi 0.6076)
**Drivers (recent corr):** AUDUSD=X +0.42 [textbook] · ^GSPC +0.37 [textbook] · US2Y -0.23 [weak] → **in charge: AUDUSD=X** (Antipodean block)
**Last 20 sessions decomposed (R² 0.36, n=60):** actual -3.5% = AUDUSD=X -2.4% · ^GSPC -0.3% · US2Y -0.1% · unexplained -0.7%
**Positioning (CFTC NZ DOLLAR, 2026-11-10, + = long NZDUSD):** lev funds -24,832 (-19% OI, 4w -13,213, 7th pct of 3y) · asset mgrs -41,028 (-31% OI, 4w +3,111, 21st pct of 3y)
**This week:** 11-22 16:45 ET New Zealand: Retail Sales · 11-22 16:45 ET New Zealand: Retail Sales Quarterly Vs. Year Ago · 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%)

### USDCHF  `USDCHF=X`  0.8428 (2026-11-20)
**Move:** 1w +0.8% · 4w +2.8% (86th pct of 2y 4w moves) · 13w +5.4% · 52w range position 99% (lo 0.7632 / hi 0.8435)
**Drivers (recent corr):** US10Y +0.44 [textbook] · ^VIX -0.23 [weak] · GC=F -0.06 [weak] → **in charge: US10Y** (US yields)
**Last 20 sessions decomposed (R² 0.30, n=60):** actual +2.8% = US10Y +0.2% · GC=F -0.0% · ^VIX +0.0% · unexplained +2.5%
**Positioning (CFTC SWISS FRANC, 2026-11-10, + = long USDCHF):** lev funds +16,070 (+13% OI, 4w +1,129, 92nd pct of 3y) · asset mgrs +13,169 (+10% OI, 4w -18,287, 11th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%) · 11-25 08:30 ET United States: PCE price index


## 3. G10 crosses

### AUDNZD  `AUDNZD=X`  1.213 (2026-11-20)
**Move:** 1w -1.2% · 4w -1.7% (83rd pct of 2y 4w moves) · 13w +1.4% · 52w range position 64% (lo 1.141 / hi 1.254)
**Drivers (recent corr):** HG=F +0.18 [weak] · ^AXJO -0.11 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.08, n=60):** actual -1.7% = HG=F -0.8% · ^AXJO +0.2% · unexplained -1.1%
**This week:** 11-22 16:45 ET New Zealand: Retail Sales · 11-22 16:45 ET New Zealand: Retail Sales Quarterly Vs. Year Ago

### EURGBP  `EURGBP=X`  0.8377 (2026-11-20)
**Move:** 1w +0.3% · 4w +0.1% (7th pct of 2y 4w moves) · 13w -2.2% · 52w range position 11% (lo 0.8324 / hi 0.8815)
**Drivers (recent corr):** GB10Y +0.16 [weak] · FR_DE (missing) → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual +0.1% = GB10Y +0.0% · unexplained +0.1%
**This week:** 11-25 02:00 ET Germany: German GDP (cons 1.2%, prev 1.2%) · 11-26 05:30 ET United Kingdom: BoE FPC Meeting Minutes · 11-27 02:45 ET France: French GDP (cons -0.1%, prev -0.1%) · 11-27 03:00 ET Spain: Core CPI · 11-27 03:00 ET Spain: Spanish Retail Sales · 11-27 03:55 ET Germany: German Unemployment Change

### EURCHF  `EURCHF=X`  0.9248 (2026-11-20)
**Move:** 1w +0.1% · 4w +0.5% (39th pct of 2y 4w moves) · 13w -1.0% · 52w range position 51% (lo 0.9023 / hi 0.9466)
**Drivers (recent corr):** ^STOXX50E +0.06 [weak] · FR_DE (missing) · ^VIX -0.39 [textbook] → **in charge: ^VIX** (Haven flows)
**Last 20 sessions decomposed (R² 0.03, n=60):** actual +0.5% = ^VIX -0.1% · ^STOXX50E +0.0% · unexplained +0.6%
**This week:** 11-25 02:00 ET Germany: German GDP (cons 1.2%, prev 1.2%) · 11-27 02:30 ET Switzerland: Retail Sales · 11-27 02:45 ET France: French GDP (cons -0.1%, prev -0.1%) · 11-27 03:00 ET Spain: Core CPI · 11-27 03:00 ET Spain: Spanish Retail Sales · 11-27 03:55 ET Germany: German Unemployment Change


## 4. EM FX

### USDMXN  `USDMXN=X`  19.12 (2026-11-20)
**Move:** 1w +2.8% · 4w +2.1% (69th pct of 2y 4w moves) · 13w +12.8% · 52w range position 100% (lo 16.89 / hi 19.12)
**Drivers (recent corr):** ^VIX +0.30 [weak] · ^GSPC -0.35 [textbook] · CL=F +0.53 [INVERTED] · USDBRL=X -0.03 [weak] → **in charge: CL=F** (Oil)
**Last 20 sessions decomposed (R² 0.17, n=60):** actual +2.1% = ^GSPC +1.8% · USDBRL=X +1.5% · CL=F -1.1% · ^VIX -0.5% · unexplained +0.4%
**Positioning (CFTC MEXICAN PESO, 2026-11-10, + = long USDMXN):** lev funds -68,019 (-24% OI, 4w -4,455, 8th pct of 3y) · asset mgrs +41,109 (+15% OI, 4w +18,738, 100th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%) · 11-25 08:30 ET United States: PCE price index

### USDBRL  `USDBRL=X`  5.935 (2026-11-20)
**Move:** 1w +5.2% · 4w +17.5% (100th pct of 2y 4w moves) · 13w +14.3% · 52w range position 100% (lo 4.906 / hi 5.935)
**Drivers (recent corr):** ^VIX +0.11 [weak] · HG=F +0.06 [weak] · EWZ -0.94 [textbook] → **in charge: EWZ** (Brazil equities (local flows))
**Last 20 sessions decomposed (R² 0.86, n=60):** actual +16.1% = EWZ +11.0% · HG=F +1.0% · ^VIX +0.1% · unexplained +4.0%
**Positioning (CFTC BRAZILIAN REAL, 2026-11-10, + = long USDBRL):** lev funds -30,780 (-28% OI, 4w -3,166, 1st pct of 3y) · asset mgrs -39,980 (-36% OI, 4w +15,234, 59th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%) · 11-25 08:30 ET United States: PCE price index

### USDZAR  `USDZAR=X`  17.54 (2026-11-20)
**Move:** 1w +4.7% · 4w +6.4% (96th pct of 2y 4w moves) · 13w +8.9% · 52w range position 100% (lo 15.71 / hi 17.54)
**Drivers (recent corr):** GC=F -0.67 [textbook] · ^VIX +0.34 [textbook] · HG=F -0.57 [textbook] → **in charge: GC=F** (Gold / precious metals exporter)
**Last 20 sessions decomposed (R² 0.27, n=60):** actual +6.2% = GC=F +1.6% · ^VIX +0.8% · HG=F +0.5% · unexplained +3.4%
**Positioning (CFTC SO AFRICAN RAND, 2026-11-10, + = long USDZAR):** lev funds -5,638 (-15% OI, 4w -1,090, 22nd pct of 3y) · asset mgrs -14,155 (-37% OI, 4w +3,422, 34th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%) · 11-25 08:30 ET United States: PCE price index

### USDKRW  `USDKRW=X`  1,338 (2026-11-20)
**Move:** 1w +0.3% · 4w +0.9% (31st pct of 2y 4w moves) · 13w -3.8% · 52w range position 6% (lo 1,324 / hi 1,552)
**Drivers (recent corr):** ^KS11 +0.08 [weak] · SOXX -0.58 [textbook] · DX-Y.NYB -0.03 [weak] → **in charge: SOXX** (Global semis cycle)
**Last 20 sessions decomposed (R² 0.13, n=60):** actual +0.9% = SOXX +0.9% · DX-Y.NYB +0.5% · ^KS11 -0.4% · unexplained -0.1%
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%) · 11-25 08:30 ET United States: PCE price index


## 5. CE3 FX

### EURCZK  `EURCZK=X`  24.43 (2026-11-20)
**Move:** 1w +0.2% · 4w +0.7% (82nd pct of 2y 4w moves) · 13w +1.3% · 52w range position 78% (lo 24.07 / hi 24.53)
**Drivers (recent corr):** ^STOXX50E -0.14 [weak] · EURPLN=X +0.63 [textbook] → **in charge: EURPLN=X** (CE3 block)
**Last 20 sessions decomposed (R² 0.29, n=60):** actual +0.7% = EURPLN=X +0.3% · ^STOXX50E -0.0% · unexplained +0.3%
**This week:** 11-25 02:00 ET Germany: German GDP (cons 1.2%, prev 1.2%) · 11-27 02:45 ET France: French GDP (cons -0.1%, prev -0.1%) · 11-27 03:00 ET Spain: Core CPI · 11-27 03:00 ET Spain: Spanish Retail Sales · 11-27 03:55 ET Germany: German Unemployment Change · 11-27 03:55 ET Germany: German Unemployment Rate

### EURPLN  `EURPLN=X`  4.438 (2026-11-20)
**Move:** 1w +0.9% · 4w +1.4% (90th pct of 2y 4w moves) · 13w +2.9% · 52w range position 100% (lo 4.197 / hi 4.438)
**Drivers (recent corr):** ^STOXX50E -0.25 [weak] · ^VIX +0.45 [textbook] → **in charge: ^VIX** (Risk)
**Last 20 sessions decomposed (R² 0.18, n=60):** actual +1.4% = ^VIX +0.3% · ^STOXX50E -0.0% · unexplained +1.1%
**This week:** 11-25 02:00 ET Germany: German GDP (cons 1.2%, prev 1.2%) · 11-27 02:45 ET France: French GDP (cons -0.1%, prev -0.1%) · 11-27 03:00 ET Spain: Core CPI · 11-27 03:00 ET Spain: Spanish Retail Sales · 11-27 03:55 ET Germany: German Unemployment Change · 11-27 03:55 ET Germany: German Unemployment Rate


## 6. Equities

### S&P 500  `^GSPC`  7,176 (2026-11-20)
**Move:** 1w -5.1% · 4w -5.9% (87th pct of 2y 4w moves) · 13w -6.5% · 52w range position 56% (lo 6,344 / hi 7,819)
**Drivers (recent corr):** US10Y +0.28 [weak] · HYG_TLT +0.40 [textbook] · DX-Y.NYB -0.08 [weak] · CL=F -0.36 [textbook] · ^VIX -0.97 [textbook] → **in charge: ^VIX** (Vol)
**Last 20 sessions decomposed (R² 0.87, n=60):** actual -6.1% = ^VIX -3.6% · CL=F +0.4% · US10Y -0.2% · HYG_TLT +0.2% · DX-Y.NYB -0.1% · unexplained -2.7%
**Positioning (CFTC E-MINI S&P 500, 2026-11-10, + = long S&P 500):** lev funds -303,060 (-15% OI, 4w +105,666, 71st pct of 3y) · asset mgrs +914,130 (+45% OI, 4w -1,705, 38th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%) · 11-25 08:30 ET United States: PCE price index

### Nasdaq 100  `^NDX`  26,517 (2026-11-20)
**Move:** 1w -5.1% · 4w -8.4% (85th pct of 2y 4w moves) · 13w -9.5% · 52w range position 43% (lo 22,953 / hi 31,224)
**Drivers (recent corr):** US10Y +0.36 [INVERTED] · SOXX +0.95 [textbook] · HYG_TLT +0.43 [textbook] · BTC-USD +0.57 [textbook] → **in charge: SOXX** (Semis / AI capex)
**Last 20 sessions decomposed (R² 0.90, n=60):** actual -8.8% = SOXX -5.5% · BTC-USD -3.5% · US10Y -0.3% · HYG_TLT +0.2% · unexplained +0.3%
**Positioning (CFTC NASDAQ MINI, 2026-11-10, + = long Nasdaq 100):** lev funds +13,967 (+5% OI, 4w +25,560, 99th pct of 3y) · asset mgrs +72,785 (+25% OI, 4w -2,538, 43rd pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%) · 11-25 08:30 ET United States: PCE price index

### Russell 2000  `^RUT`  2,655 (2026-11-20)
**Move:** 1w -4.9% · 4w -4.4% (57th pct of 2y 4w moves) · 13w -12.0% · 52w range position 41% (lo 2,370 / hi 3,068)
**Drivers (recent corr):** US2Y +0.19 [weak] · HYG_TLT +0.22 [weak] · ^GSPC +0.94 [textbook] → **in charge: ^GSPC** (Beta)
**Last 20 sessions decomposed (R² 0.79, n=60):** actual -4.4% = ^GSPC -6.3% · US2Y -0.1% · HYG_TLT -0.1% · unexplained +2.2%
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%) · 11-25 08:30 ET United States: PCE price index

### Euro Stoxx 50  `^STOXX50E`  6,114 (2026-11-20)
**Move:** 1w -4.3% · 4w +0.8% (15th pct of 2y 4w moves) · 13w -5.4% · 52w range position 58% (lo 5,501 / hi 6,551)
**Drivers (recent corr):** FR_DE (missing) · ^GSPC +0.63 [textbook] · BZ=F -0.44 [textbook] · EURUSD=X -0.09 [weak] → **in charge: ^GSPC** (US lead)
**Last 20 sessions decomposed (R² 0.35, n=60):** actual +0.7% = ^GSPC -2.5% · BZ=F +2.1% · EURUSD=X -0.1% · unexplained +1.2%
**This week:** 11-25 02:00 ET Germany: German GDP (cons 1.2%, prev 1.2%) · 11-27 02:45 ET France: French GDP (cons -0.1%, prev -0.1%) · 11-27 03:00 ET Spain: Core CPI · 11-27 03:00 ET Spain: Spanish Retail Sales · 11-27 03:55 ET Germany: German Unemployment Change · 11-27 03:55 ET Germany: German Unemployment Rate

### CAC 40  `^FCHI`  8,081 (2026-11-20)
**Move:** 1w -3.4% · 4w +3.8% (70th pct of 2y 4w moves) · 13w -4.8% · 52w range position 39% (lo 7,666 / hi 8,726)
**Drivers (recent corr):** FR_DE (missing) · ^STOXX50E +0.92 [textbook] → **in charge: ^STOXX50E** (European block)
**Last 20 sessions decomposed (R² 0.81, n=60):** actual +3.8% = ^STOXX50E +0.6% · unexplained +3.2%
**This week:** 11-25 02:00 ET Germany: German GDP (cons 1.2%, prev 1.2%) · 11-27 02:45 ET France: French GDP (cons -0.1%, prev -0.1%) · 11-27 03:00 ET Spain: Core CPI · 11-27 03:00 ET Spain: Spanish Retail Sales · 11-27 03:55 ET Germany: German Unemployment Change · 11-27 03:55 ET Germany: German Unemployment Rate

### DAX  `^GDAXI`  25,464 (2026-11-20)
**Move:** 1w -4.8% · 4w +1.1% (22nd pct of 2y 4w moves) · 13w -2.6% · 52w range position 71% (lo 22,301 / hi 26,772)
**Drivers (recent corr):** DE10Y +0.33 [INVERTED] · ^GSPC +0.55 [textbook] → **in charge: ^GSPC** (Global risk)
**Last 20 sessions decomposed (R² 0.25, n=60):** actual +1.1% = ^GSPC -2.8% · DE10Y -0.1% · unexplained +4.1%
**This week:** 11-25 02:00 ET Germany: German GDP (cons 1.2%, prev 1.2%) · 11-27 02:45 ET France: French GDP (cons -0.1%, prev -0.1%) · 11-27 03:00 ET Spain: Core CPI · 11-27 03:00 ET Spain: Spanish Retail Sales · 11-27 03:55 ET Germany: German Unemployment Change · 11-27 03:55 ET Germany: German Unemployment Rate

### FTSE 100  `^FTSE`  10,453 (2026-11-20)
**Move:** 1w -4.1% · 4w -2.2% (54th pct of 2y 4w moves) · 13w -3.4% · 52w range position 67% (lo 9,535 / hi 10,911)
**Drivers (recent corr):** BZ=F -0.40 [INVERTED] · GBPUSD=X +0.11 [weak] · GB10Y -0.45 [textbook] → **in charge: GB10Y** (Gilts)
**Last 20 sessions decomposed (R² 0.31, n=60):** actual -2.2% = BZ=F +0.5% · GB10Y -0.2% · GBPUSD=X +0.1% · unexplained -2.6%
**This week:** 11-26 05:30 ET United Kingdom: BoE FPC Meeting Minutes

### Nikkei 225  `^N225`  56,775 (2026-11-20)
**Move:** 1w -7.1% · 4w -9.4% (86th pct of 2y 4w moves) · 13w -14.0% · 52w range position 34% (lo 48,626 / hi 72,366)
**Drivers (recent corr):** USDJPY=X +0.57 [textbook] · ^NDX +0.73 [textbook] · SOXX +0.71 [textbook] → **in charge: ^NDX** (US tech lead (prior US day))
**Last 20 sessions decomposed (R² 0.33, n=60):** actual -9.9% = ^NDX -3.4% · SOXX -1.8% · USDJPY=X -0.1% · unexplained -4.6%
**This week:** 11-26 18:30 ET Japan: Tokyo Core CPI

### KOSPI  `^KS11`  4,895 (2026-11-20)
**Move:** 1w -7.5% · 4w -11.8% (71st pct of 2y 4w moves) · 13w -29.2% · 52w range position 20% (lo 3,846 / hi 9,115)
**Drivers (recent corr):** SOXX +0.60 [textbook] · ^NDX +0.53 [textbook] → **in charge: SOXX** (Memory / AI hardware (prior US day))
**Last 20 sessions decomposed (R² 0.23, n=60):** actual -12.6% = SOXX -9.3% · ^NDX +6.4% · unexplained -9.6%
**This week:** 11-25 20:00 ET South Korea: Interest Rate Decision

### Hang Seng  `^HSI`  22,443 (2026-11-20)
**Move:** 1w -5.1% · 4w -2.8% (44th pct of 2y 4w moves) · 13w -13.7% · 52w range position 0% (lo 22,443 / hi 27,968)
**Drivers (recent corr):** ^NDX +0.21 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.01, n=60):** actual -2.9% = ^NDX -0.6% · unexplained -2.2%

### ASX 200  `^AXJO`  8,601 (2026-11-20)
**Move:** 1w -5.3% · 4w -2.2% (50th pct of 2y 4w moves) · 13w -5.1% · 52w range position 26% (lo 8,366 / hi 9,272)
**Drivers (recent corr):** HG=F +0.56 [textbook] · ^GSPC +0.63 [textbook] → **in charge: ^GSPC** (US lead (prior US day))
**Last 20 sessions decomposed (R² 0.32, n=60):** actual -2.2% = HG=F -2.5% · ^GSPC -1.7% · unexplained +2.0%


## 7. Rates

### US 2y  `US2Y`  4.87% (2026-11-20)
**Move:** 1w -11bp · 4w +6bp (29th pct of 2y 4w moves) · 13w +44bp · 52w range position 86% (lo 3.512 / hi 5.089)
**Drivers (recent corr):** CL=F +0.18 [weak] · ^GSPC +0.38 [textbook] → **in charge: ^GSPC** (Risk-on = fewer cuts / more hikes)
**Last 20 sessions decomposed (R² 0.03, n=60):** actual +6bp = ^GSPC -6bp · CL=F -3bp · unexplained +15bp
**Positioning (CFTC UST 2Y NOTE, 2026-11-10, + = long US 2y):** lev funds +1,505,204 (+34% OI, 4w +137,796, 19th pct of 3y) · asset mgrs -1,817,201 (-40% OI, 4w -21,335, 68th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%) · 11-25 08:30 ET United States: PCE price index

### US 10y  `US10Y`  5.05% (2026-11-20)
**Move:** 1w -10bp · 4w +6bp (29th pct of 2y 4w moves) · 13w +31bp · 52w range position 81% (lo 3.962 / hi 5.311)
**Drivers (recent corr):** CL=F +0.29 [weak] · ^NDX +0.36 [INVERTED] · T10YIE (missing) · DE10Y +0.17 [weak] → **in charge: ^NDX** (Textbook: yields up hurt stocks; + means bonds hedge stocks)
**Last 20 sessions decomposed (R² 0.10, n=60):** actual +6bp = ^NDX -8bp · CL=F -4bp · DE10Y +1bp · unexplained +17bp
**Positioning (CFTC UST 10Y NOTE, 2026-11-10, + = long US 10y):** lev funds +2,301,327 (+38% OI, 4w +95,390, 90th pct of 3y) · asset mgrs -3,153,761 (-52% OI, 4w -255,199, 1st pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%) · 11-25 08:30 ET United States: PCE price index

### US 30y  `US30Y`  5.40% (2026-11-20)
**Move:** 1w -8bp · 4w +9bp (39th pct of 2y 4w moves) · 13w +12bp · 52w range position 74% (lo 4.633 / hi 5.665)
**Drivers (recent corr):** US2Y +0.88 [textbook] · T10YIE (missing) → **in charge: US2Y** (Front end)
**Last 20 sessions decomposed (R² 0.74, n=60):** actual +9bp = US2Y +4bp · unexplained +5bp
**Positioning (CFTC UST BOND, 2026-11-10, + = long US 30y):** lev funds +149,858 (+8% OI, 4w -4,162, 1st pct of 3y) · asset mgrs -394,990 (-20% OI, 4w -3,456, 94th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%) · 11-25 08:30 ET United States: PCE price index

### Bund 10y  `DE10Y`  3.42% (2026-11-20)
**Move:** 1w +1bp · 4w +6bp (33rd pct of 2y 4w moves) · 13w +15bp · 52w range position 75% (lo 2.69 / hi 3.66)
**Drivers (recent corr):** US10Y +0.17 [weak] · BZ=F -0.01 [weak] · FR_DE (missing) → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.04, n=60):** actual +6bp = US10Y +1bp · BZ=F -0bp · unexplained +5bp
**This week:** 11-25 02:00 ET Germany: German GDP (cons 1.2%, prev 1.2%) · 11-27 02:45 ET France: French GDP (cons -0.1%, prev -0.1%) · 11-27 03:00 ET Spain: Core CPI · 11-27 03:00 ET Spain: Spanish Retail Sales · 11-27 03:55 ET Germany: German Unemployment Change · 11-27 03:55 ET Germany: German Unemployment Rate

### Gilt 10y  `GB10Y`  5.37% (2026-11-20)
**Move:** 1w +5bp · 4w +3bp (13th pct of 2y 4w moves) · 13w +24bp · 52w range position 91% (lo 4.352 / hi 5.478)
**Drivers (recent corr):** US10Y +0.71 [textbook] · GBPUSD=X -0.45 [textbook] → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.38, n=60):** actual +3bp = GBPUSD=X +4bp · US10Y +4bp · unexplained -4bp
**This week:** 11-26 05:30 ET United Kingdom: BoE FPC Meeting Minutes

### JGB 10y  `JP10Y`  2.87% (2026-11-20)
**Move:** 1w -3bp · 4w +3bp (14th pct of 2y 4w moves) · 13w -1bp · 52w range position 82% (lo 1.792 / hi 3.111)
**Drivers (recent corr):** US10Y +0.81 [textbook] · USDJPY=X +0.60 [textbook] → **in charge: US10Y** (Global duration)
**Last 20 sessions decomposed (R² 0.56, n=60):** actual +3bp = USDJPY=X +4bp · US10Y +4bp · unexplained -5bp
**This week:** 11-26 18:30 ET Japan: Tokyo Core CPI

### Canada 10y  `CA10Y`  3.80% (2026-11-20)
**Move:** 1w -5bp · 4w -3bp (18th pct of 2y 4w moves) · 13w +4bp · 52w range position 78% (lo 3.12 / hi 3.99)
**Drivers (recent corr):** US10Y +0.91 [textbook] · CL=F +0.37 [textbook] → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.69, n=60):** actual -3bp = US10Y +4bp · CL=F -4bp · unexplained -3bp
**This week:** 11-27 11:00 ET Canada: Budget Balance

### French spread (proxy)
_no data_


## 8. Commodities

### WTI crude  `CL=F`  82.73 (2026-11-20)
**Move:** 1w -6.6% · 4w -19.9% (89th pct of 2y 4w moves) · 13w -5.0% · 52w range position 48% (lo 55.27 / hi 112.9)
**Drivers (recent corr):** XLE +0.54 [textbook] · ^GSPC -0.36 [INVERTED] · HG=F -0.30 [weak] · DX-Y.NYB +0.29 [weak] → **in charge: XLE** (Energy equities (do they believe the move?))
**Last 20 sessions decomposed (R² 0.26, n=60):** actual -22.2% = XLE -9.4% · HG=F +6.6% · ^GSPC +4.3% · DX-Y.NYB -1.3% · unexplained -22.4%
**Positioning (CFTC WTI-PHYSICAL, 2026-11-10, + = long WTI crude):** managed money +25,714 (+1% OI, 4w -14,860, 12th pct of 3y) · producers +368,588 (+19% OI, 4w +15,445, 95th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%) · 11-25 08:30 ET United States: PCE price index

### Gold  `GC=F`  3,535 (2026-11-20)
**Move:** 1w -9.0% · 4w -11.8% (95th pct of 2y 4w moves) · 13w -24.5% · 52w range position 0% (lo 3,535 / hi 5,318)
**Drivers (recent corr):** DFII10 (missing) · DX-Y.NYB -0.27 [weak] · SI=F +0.92 [textbook] · BTC-USD +0.30 [weak] → **in charge: SI=F** (Precious block)
**Last 20 sessions decomposed (R² 0.79, n=60):** actual -12.5% = SI=F -13.1% · BTC-USD +1.8% · DX-Y.NYB -0.7% · unexplained -0.6%
**Positioning (CFTC GOLD, 2026-11-10, + = long Gold):** managed money +112,341 (+28% OI, 4w +5,252, 34th pct of 3y) · producers -10,881 (-3% OI, 4w +7,556, 98th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%) · 11-25 08:30 ET United States: PCE price index

### Silver  `SI=F`  41.52 (2026-11-20)
**Move:** 1w -15.3% · 4w -22.7% (92nd pct of 2y 4w moves) · 13w -40.2% · 52w range position 0% (lo 41.52 / hi 115.1)
**Drivers (recent corr):** GC=F +0.92 [textbook] · HG=F +0.71 [textbook] → **in charge: GC=F** (Gold)
**Last 20 sessions decomposed (R² 0.84, n=60):** actual -25.7% = GC=F -15.9% · HG=F -7.7% · unexplained -2.1%
**Positioning (CFTC SILVER, 2026-11-10, + = long Silver):** managed money +3,615 (+3% OI, 4w -2,004, 4th pct of 3y) · producers -12,061 (-10% OI, 4w +3,740, 100th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%) · 11-25 08:30 ET United States: PCE price index

### Copper  `HG=F`  5.513 (2026-11-20)
**Move:** 1w -9.3% · 4w -14.9% (94th pct of 2y 4w moves) · 13w -16.2% · 52w range position 30% (lo 4.962 / hi 6.804)
**Drivers (recent corr):** ^GSPC +0.46 [textbook] → **in charge: ^GSPC** (Global growth)
**Last 20 sessions decomposed (R² 0.12, n=60):** actual -16.1% = ^GSPC -3.3% · unexplained -12.8%
**Positioning (CFTC COPPER- #1, 2026-11-10, + = long Copper):** managed money +35,064 (+11% OI, 4w -25,994, 48th pct of 3y) · producers -48,209 (-15% OI, 4w +42,257, 59th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%) · 11-25 08:30 ET United States: PCE price index

### Nat gas (US)  `NG=F`  3.255 (2026-11-20)
**Move:** 1w +0.8% · 4w +23.3% (91st pct of 2y 4w moves) · 13w +17.4% · 52w range position 15% (lo 2.523 / hi 7.46)
**Drivers (recent corr):** CL=F -0.08 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual +20.9% = CL=F +0.5% · unexplained +20.5%
**Positioning (CFTC NAT GAS NYME, 2026-11-10, + = long Nat gas (US)):** managed money -224,463 (-14% OI, 4w -97,982, 1st pct of 3y) · producers +14,748 (+1% OI, 4w +25,629, 96th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%) · 11-25 08:30 ET United States: PCE price index


## 9. Crypto

### Bitcoin  `BTC-USD`  61,979 (2026-11-20)
**Move:** 1w -9.2% · 4w -23.6% (95th pct of 2y 4w moves) · 13w -20.9% · 52w range position 9% (lo 58,559 / hi 96,929)
**Drivers (recent corr):** ^NDX +0.57 [textbook] · DX-Y.NYB -0.21 [weak] · GC=F +0.30 [weak] → **in charge: ^NDX** (Tech / speculation)
**Last 20 sessions decomposed (R² 0.36, n=60):** actual -26.9% = ^NDX -7.8% · DX-Y.NYB -1.4% · GC=F +0.4% · unexplained -18.0%
**Positioning (CFTC BITCOIN, 2026-11-10, + = long Bitcoin):** lev funds -1,243 (-6% OI, 4w +4,601, 100th pct of 3y) · asset mgrs +1,956 (+10% OI, 4w -1,686, 1st pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%) · 11-25 08:30 ET United States: PCE price index

