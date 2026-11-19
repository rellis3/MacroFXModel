# Market Review Data Pack: 2026-11-19

Fetched 2026-11-19T03:49:49+00:00. Descriptive numbers for the weekly review (read with `education/market_reviews/PLAYBOOK.md`). Correlations are of daily moves: last 20 sessions vs the 60 before. They are noisy; a flip is a question, not a signal.

**Data notes:** fred DGS2: The read operation timed out · fred DFII10: The read operation timed out · fred T10YIE: The read operation timed out · fred BAMLH0A0HYM2: The read operation timed out · fred BAMLC0A0CM: The read operation timed out · FRED DGS2 missing: US 2y = US 5y stand-in for this run · No local OAT/Bund futures: French spread proxy unavailable

## 1. Regime gauges: which story is the market trading?

| Pair | Recent | Before | Textbook sign | Status | What it means |
|---|---|---|---|---|---|
| CL=F vs US10Y | +0.31 | +0.07 | + | textbook | Oil vs yields: + = oil is an inflation story; - = oil is a growth tax (2008-style) |
| ^NDX vs US10Y | +0.36 | -0.02 | − | INVERTED | Stocks vs yields: - = rates drive stocks; + = growth scare, bonds hedge stocks |
| HYG_TLT vs ^NDX | +0.42 | +0.17 | + | textbook | Credit vs tech: high + = credit and equities are one trade (credit stress leading) |
| DX-Y.NYB vs ^GSPC | -0.10 | +0.01 | − | weak | Dollar vs stocks: - = safe-haven dollar; ~0/+ = "sell America" or liquidity dash |
| AUDUSD=X vs ^NDX | +0.47 | +0.32 | + | textbook | Aussie vs tech: near 0 = AUD trading commodities not risk |
| BTC-USD vs ^NDX | +0.63 | +0.40 | + | textbook | Bitcoin vs tech: high = one liquidity complex |
| XLE vs CL=F | +0.56 | +0.29 | + | textbook | Energy stocks vs oil: falling = equity investors fade the oil move |
| USDJPY=X vs US10Y | +0.42 | +0.37 | + | textbook | Yen vs yields: high = yen is a pure rates trade |

Equity vol vs bond vol: VIX 24.6 (1y pct 93) · MOVE 98 (1y pct 87). When bond vol leads equity vol, the stress is in rates/credit first.

## 2. G10 FX

### EURUSD  `EURUSD=X`  1.096 (2026-11-19)
**Move:** 1w -0.8% · 4w -2.3% (82nd pct of 2y 4w moves) · 13w -6.2% · 52w range position 0% (lo 1.096 / hi 1.202)
**Drivers (recent corr):** US_EA2 -0.12 [weak] · US_DE10 -0.07 [weak] · FR_DE (missing) · ^STOXX50E -0.05 [weak] · BZ=F -0.20 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.05, n=60):** actual -2.4% = BZ=F +0.2% · US_DE10 +0.0% · ^STOXX50E +0.0% · US_EA2 -0.0% · unexplained -2.6%
**Positioning (CFTC EURO FX, 2026-11-10, + = long EURUSD):** lev funds -71,676 (-8% OI, 4w -3,675, 1st pct of 3y) · asset mgrs +165,477 (+19% OI, 4w -34,441, 8th pct of 3y)
**This week:** 11-25 02:00 ET Germany: German GDP (cons 1.2%, prev 1.2%) · 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%)

### USDJPY  `USDJPY=X`  159.6 (2026-11-19)
**Move:** 1w -0.2% · 4w +2.0% (66th pct of 2y 4w moves) · 13w +0.4% · 52w range position 62% (lo 152.5 / hi 163.9)
**Drivers (recent corr):** US10Y +0.42 [textbook] · US_JP10 +0.10 [weak] · ^NDX +0.69 [textbook] · ^VIX -0.61 [textbook] → **in charge: ^NDX** (Risk appetite: carry trades fund in yen)
**Last 20 sessions decomposed (R² 0.17, n=60):** actual +1.9% = ^NDX -0.5% · US10Y +0.4% · US_JP10 -0.2% · ^VIX +0.1% · unexplained +2.1%
**Positioning (CFTC JAPANESE YEN, 2026-11-10, + = long USDJPY):** lev funds +16,855 (+4% OI, 4w -16,818, 25th pct of 3y) · asset mgrs -90,344 (-23% OI, 4w -24,525, 10th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%) · 11-25 08:30 ET United States: PCE price index

### GBPUSD  `GBPUSD=X`  1.313 (2026-11-19)
**Move:** 1w -0.8% · 4w -2.1% (77th pct of 2y 4w moves) · 13w -3.8% · 52w range position 6% (lo 1.308 / hi 1.383)
**Drivers (recent corr):** US_GB10 +0.06 [weak] · GB10Y -0.47 [INVERTED] · ^GSPC +0.03 [weak] · EURUSD=X +0.92 [textbook] → **in charge: EURUSD=X** (European block move)
**Last 20 sessions decomposed (R² 0.72, n=60):** actual -2.1% = EURUSD=X -2.1% · ^GSPC -0.1% · US_GB10 -0.1% · GB10Y -0.0% · unexplained +0.3%
**Positioning (CFTC BRITISH POUND, 2026-11-10, + = long GBPUSD):** lev funds +34,495 (+16% OI, 4w +24,182, 57th pct of 3y) · asset mgrs -105,960 (-48% OI, 4w +39,775, 20th pct of 3y)
**This week:** 11-20 02:00 ET United Kingdom: Core Retail Sales · 11-20 02:00 ET United Kingdom: Retail Sales (cons 0.0%, prev -0.4%) · 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%)

### USDCAD  `USDCAD=X`  1.435 (2026-11-19)
**Move:** 1w +0.7% · 4w +2.5% (90th pct of 2y 4w moves) · 13w +4.2% · 52w range position 100% (lo 1.349 / hi 1.435)
**Drivers (recent corr):** CL=F +0.05 [weak] · US_CA2 +0.21 [weak] · ^GSPC +0.05 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.18, n=60):** actual +2.5% = ^GSPC +0.2% · US_CA2 +0.1% · CL=F +0.0% · unexplained +2.1%
**Positioning (CFTC CANADIAN DOLLAR, 2026-11-10, + = long USDCAD):** lev funds +68,205 (+20% OI, 4w -19,907, 68th pct of 3y) · asset mgrs -14,480 (-4% OI, 4w -45,284, 9th pct of 3y)
**This week:** 11-20 08:30 ET Canada: Core Retail Sales (cons 0.7%, prev 1.2%) · 11-20 08:30 ET Canada: Retail Sales (cons 0.7%, prev 1.2%) · 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%)

### AUDUSD  `AUDUSD=X`  0.6677 (2026-11-19)
**Move:** 1w -1.9% · 4w -4.9% (97th pct of 2y 4w moves) · 13w -6.2% · 52w range position 28% (lo 0.6449 / hi 0.7255)
**Drivers (recent corr):** HG=F +0.57 [textbook] · ^NDX +0.47 [textbook] · GC=F +0.50 [textbook] → **in charge: HG=F** (Copper: China / metals demand)
**Last 20 sessions decomposed (R² 0.20, n=60):** actual -5.0% = ^NDX -0.7% · HG=F -0.5% · GC=F -0.2% · unexplained -3.6%
**Positioning (CFTC AUSTRALIAN DOLLAR, 2026-11-10, + = long AUDUSD):** lev funds +50,819 (+14% OI, 4w +228, 89th pct of 3y) · asset mgrs -157,207 (-45% OI, 4w -41,287, 1st pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%) · 11-25 08:30 ET United States: PCE price index

### NZDUSD  `NZDUSD=X`  0.5494 (2026-11-19)
**Move:** 1w -0.9% · 4w -3.4% (85th pct of 2y 4w moves) · 13w -7.7% · 52w range position 0% (lo 0.5494 / hi 0.6076)
**Drivers (recent corr):** AUDUSD=X +0.43 [textbook] · ^GSPC +0.41 [textbook] · US2Y -0.21 [weak] → **in charge: AUDUSD=X** (Antipodean block)
**Last 20 sessions decomposed (R² 0.38, n=60):** actual -3.4% = AUDUSD=X -2.2% · ^GSPC -0.3% · US2Y -0.1% · unexplained -0.8%
**Positioning (CFTC NZ DOLLAR, 2026-11-10, + = long NZDUSD):** lev funds -24,832 (-19% OI, 4w -13,213, 7th pct of 3y) · asset mgrs -41,028 (-31% OI, 4w +3,111, 21st pct of 3y)
**This week:** 11-22 16:45 ET New Zealand: Retail Sales · 11-22 16:45 ET New Zealand: Retail Sales Quarterly Vs. Year Ago · 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%)

### USDCHF  `USDCHF=X`  0.8441 (2026-11-19)
**Move:** 1w +1.0% · 4w +3.0% (87th pct of 2y 4w moves) · 13w +5.6% · 52w range position 100% (lo 0.7632 / hi 0.8441)
**Drivers (recent corr):** US10Y +0.41 [textbook] · ^VIX -0.21 [weak] · GC=F -0.19 [weak] → **in charge: US10Y** (US yields)
**Last 20 sessions decomposed (R² 0.29, n=60):** actual +2.9% = US10Y +0.4% · GC=F +0.0% · ^VIX +0.0% · unexplained +2.5%
**Positioning (CFTC SWISS FRANC, 2026-11-10, + = long USDCHF):** lev funds +16,070 (+13% OI, 4w +1,129, 92nd pct of 3y) · asset mgrs +13,169 (+10% OI, 4w -18,287, 11th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%) · 11-25 08:30 ET United States: PCE price index


## 3. G10 crosses

### AUDNZD  `AUDNZD=X`  1.215 (2026-11-19)
**Move:** 1w -1.0% · 4w -1.5% (75th pct of 2y 4w moves) · 13w +1.6% · 52w range position 66% (lo 1.141 / hi 1.254)
**Drivers (recent corr):** HG=F +0.30 [textbook] · ^AXJO -0.16 [weak] → **in charge: HG=F** (Metals (AUD) vs dairy (NZD))
**Last 20 sessions decomposed (R² 0.11, n=60):** actual -1.5% = HG=F -0.8% · ^AXJO +0.1% · unexplained -0.8%
**This week:** 11-22 16:45 ET New Zealand: Retail Sales · 11-22 16:45 ET New Zealand: Retail Sales Quarterly Vs. Year Ago

### EURGBP  `EURGBP=X`  0.8347 (2026-11-19)
**Move:** 1w -0.0% · 4w -0.3% (18th pct of 2y 4w moves) · 13w -2.6% · 52w range position 5% (lo 0.8324 / hi 0.8815)
**Drivers (recent corr):** GB10Y +0.29 [weak] · FR_DE (missing) → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual -0.3% = GB10Y +0.0% · unexplained -0.3%
**This week:** 11-20 02:00 ET United Kingdom: Core Retail Sales · 11-20 02:00 ET United Kingdom: Retail Sales (cons 0.0%, prev -0.4%) · 11-25 02:00 ET Germany: German GDP (cons 1.2%, prev 1.2%)

### EURCHF  `EURCHF=X`  0.9249 (2026-11-19)
**Move:** 1w +0.1% · 4w +0.5% (40th pct of 2y 4w moves) · 13w -1.0% · 52w range position 51% (lo 0.9023 / hi 0.9466)
**Drivers (recent corr):** ^STOXX50E +0.06 [weak] · FR_DE (missing) · ^VIX -0.37 [textbook] → **in charge: ^VIX** (Haven flows)
**Last 20 sessions decomposed (R² 0.03, n=60):** actual +0.5% = ^VIX -0.1% · ^STOXX50E +0.0% · unexplained +0.6%
**This week:** 11-25 02:00 ET Germany: German GDP (cons 1.2%, prev 1.2%)


## 4. EM FX

### USDMXN  `USDMXN=X`  18.91 (2026-11-19)
**Move:** 1w +1.7% · 4w +1.0% (35th pct of 2y 4w moves) · 13w +11.6% · 52w range position 100% (lo 16.89 / hi 18.91)
**Drivers (recent corr):** ^VIX +0.23 [weak] · ^GSPC -0.28 [weak] · CL=F +0.42 [INVERTED] · USDBRL=X -0.08 [weak] → **in charge: CL=F** (Oil)
**Last 20 sessions decomposed (R² 0.12, n=60):** actual +1.0% = ^GSPC +1.3% · USDBRL=X +1.1% · CL=F -0.9% · ^VIX -0.4% · unexplained -0.1%
**Positioning (CFTC MEXICAN PESO, 2026-11-10, + = long USDMXN):** lev funds -68,019 (-24% OI, 4w -4,455, 8th pct of 3y) · asset mgrs +41,109 (+15% OI, 4w +18,738, 100th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%) · 11-25 08:30 ET United States: PCE price index

### USDBRL  `USDBRL=X`  5.845 (2026-11-19)
**Move:** 1w +3.6% · 4w +15.8% (100th pct of 2y 4w moves) · 13w +12.6% · 52w range position 100% (lo 4.906 / hi 5.845)
**Drivers (recent corr):** ^VIX +0.11 [weak] · HG=F +0.11 [weak] · EWZ -0.95 [textbook] → **in charge: EWZ** (Brazil equities (local flows))
**Last 20 sessions decomposed (R² 0.86, n=60):** actual +14.6% = EWZ +9.9% · HG=F +0.5% · ^VIX +0.1% · unexplained +4.1%
**Positioning (CFTC BRAZILIAN REAL, 2026-11-10, + = long USDBRL):** lev funds -30,780 (-28% OI, 4w -3,166, 1st pct of 3y) · asset mgrs -39,980 (-36% OI, 4w +15,234, 59th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%) · 11-25 08:30 ET United States: PCE price index

### USDZAR  `USDZAR=X`  17.35 (2026-11-19)
**Move:** 1w +3.5% · 4w +5.3% (94th pct of 2y 4w moves) · 13w +7.7% · 52w range position 100% (lo 15.71 / hi 17.35)
**Drivers (recent corr):** GC=F -0.64 [textbook] · ^VIX +0.25 [weak] · HG=F -0.58 [textbook] → **in charge: GC=F** (Gold / precious metals exporter)
**Last 20 sessions decomposed (R² 0.22, n=60):** actual +5.1% = GC=F +1.0% · HG=F +0.6% · ^VIX +0.4% · unexplained +3.1%
**Positioning (CFTC SO AFRICAN RAND, 2026-11-10, + = long USDZAR):** lev funds -5,638 (-15% OI, 4w -1,090, 22nd pct of 3y) · asset mgrs -14,155 (-37% OI, 4w +3,422, 34th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%) · 11-25 08:30 ET United States: PCE price index

### USDKRW  `USDKRW=X`  1,330 (2026-11-19)
**Move:** 1w -0.3% · 4w +0.3% (13th pct of 2y 4w moves) · 13w -4.4% · 52w range position 3% (lo 1,324 / hi 1,552)
**Drivers (recent corr):** ^KS11 +0.04 [weak] · SOXX -0.58 [textbook] · DX-Y.NYB -0.02 [weak] → **in charge: SOXX** (Global semis cycle)
**Last 20 sessions decomposed (R² 0.13, n=60):** actual +0.3% = SOXX +0.7% · DX-Y.NYB +0.6% · ^KS11 -0.3% · unexplained -0.6%
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%) · 11-25 08:30 ET United States: PCE price index


## 5. CE3 FX

### EURCZK  `EURCZK=X`  24.4 (2026-11-19)
**Move:** 1w +0.1% · 4w +0.5% (66th pct of 2y 4w moves) · 13w +1.2% · 52w range position 71% (lo 24.07 / hi 24.53)
**Drivers (recent corr):** ^STOXX50E -0.13 [weak] · EURPLN=X +0.60 [textbook] → **in charge: EURPLN=X** (CE3 block)
**Last 20 sessions decomposed (R² 0.27, n=60):** actual +0.5% = EURPLN=X +0.2% · ^STOXX50E -0.0% · unexplained +0.3%
**This week:** 11-25 02:00 ET Germany: German GDP (cons 1.2%, prev 1.2%)

### EURPLN  `EURPLN=X`  4.413 (2026-11-19)
**Move:** 1w +0.3% · 4w +0.9% (73rd pct of 2y 4w moves) · 13w +2.3% · 52w range position 100% (lo 4.197 / hi 4.413)
**Drivers (recent corr):** ^STOXX50E -0.21 [weak] · ^VIX +0.40 [textbook] → **in charge: ^VIX** (Risk)
**Last 20 sessions decomposed (R² 0.15, n=60):** actual +0.9% = ^VIX +0.2% · ^STOXX50E -0.1% · unexplained +0.7%
**This week:** 11-25 02:00 ET Germany: German GDP (cons 1.2%, prev 1.2%)


## 6. Equities

### S&P 500  `^GSPC`  7,324 (2026-11-19)
**Move:** 1w -3.5% · 4w -4.4% (81st pct of 2y 4w moves) · 13w -4.2% · 52w range position 66% (lo 6,344 / hi 7,819)
**Drivers (recent corr):** US10Y +0.27 [weak] · HYG_TLT +0.37 [textbook] · DX-Y.NYB -0.10 [weak] · CL=F -0.36 [textbook] · ^VIX -0.96 [textbook] → **in charge: ^VIX** (Vol)
**Last 20 sessions decomposed (R² 0.86, n=60):** actual -4.5% = ^VIX -2.2% · HYG_TLT +0.5% · US10Y -0.4% · CL=F +0.4% · DX-Y.NYB -0.1% · unexplained -2.7%
**Positioning (CFTC E-MINI S&P 500, 2026-11-10, + = long S&P 500):** lev funds -303,060 (-15% OI, 4w +105,666, 71st pct of 3y) · asset mgrs +914,130 (+45% OI, 4w -1,705, 38th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%) · 11-25 08:30 ET United States: PCE price index

### Nasdaq 100  `^NDX`  27,116 (2026-11-19)
**Move:** 1w -4.1% · 4w -6.4% (80th pct of 2y 4w moves) · 13w -7.2% · 52w range position 50% (lo 22,953 / hi 31,224)
**Drivers (recent corr):** US10Y +0.36 [INVERTED] · SOXX +0.95 [textbook] · HYG_TLT +0.42 [textbook] · BTC-USD +0.63 [textbook] → **in charge: SOXX** (Semis / AI capex)
**Last 20 sessions decomposed (R² 0.90, n=60):** actual -6.6% = SOXX -4.1% · BTC-USD -3.6% · HYG_TLT +0.5% · US10Y -0.5% · unexplained +1.0%
**Positioning (CFTC NASDAQ MINI, 2026-11-10, + = long Nasdaq 100):** lev funds +13,967 (+5% OI, 4w +25,560, 99th pct of 3y) · asset mgrs +72,785 (+25% OI, 4w -2,538, 43rd pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%) · 11-25 08:30 ET United States: PCE price index

### Russell 2000  `^RUT`  2,714 (2026-11-19)
**Move:** 1w -3.0% · 4w -2.5% (35th pct of 2y 4w moves) · 13w -9.3% · 52w range position 54% (lo 2,305 / hi 3,068)
**Drivers (recent corr):** US2Y +0.17 [weak] · HYG_TLT +0.18 [weak] · ^GSPC +0.94 [textbook] → **in charge: ^GSPC** (Beta)
**Last 20 sessions decomposed (R² 0.77, n=60):** actual -2.5% = ^GSPC -4.7% · US2Y -0.4% · HYG_TLT -0.3% · unexplained +2.8%
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%) · 11-25 08:30 ET United States: PCE price index

### Euro Stoxx 50  `^STOXX50E`  6,154 (2026-11-19)
**Move:** 1w -3.8% · 4w +1.1% (22nd pct of 2y 4w moves) · 13w -4.2% · 52w range position 62% (lo 5,501 / hi 6,551)
**Drivers (recent corr):** FR_DE (missing) · ^GSPC +0.62 [textbook] · BZ=F -0.41 [textbook] · EURUSD=X -0.05 [weak] → **in charge: ^GSPC** (US lead)
**Last 20 sessions decomposed (R² 0.33, n=60):** actual +1.1% = BZ=F +2.0% · ^GSPC -1.9% · EURUSD=X -0.3% · unexplained +1.3%
**This week:** 11-25 02:00 ET Germany: German GDP (cons 1.2%, prev 1.2%)

### CAC 40  `^FCHI`  8,147 (2026-11-19)
**Move:** 1w -2.6% · 4w +4.3% (74th pct of 2y 4w moves) · 13w -3.6% · 52w range position 45% (lo 7,666 / hi 8,726)
**Drivers (recent corr):** FR_DE (missing) · ^STOXX50E +0.92 [textbook] → **in charge: ^STOXX50E** (European block)
**Last 20 sessions decomposed (R² 0.82, n=60):** actual +4.2% = ^STOXX50E +0.9% · unexplained +3.3%
**This week:** 11-25 02:00 ET Germany: German GDP (cons 1.2%, prev 1.2%)

### DAX  `^GDAXI`  25,736 (2026-11-19)
**Move:** 1w -3.9% · 4w +1.4% (27th pct of 2y 4w moves) · 13w -0.9% · 52w range position 77% (lo 22,301 / hi 26,772)
**Drivers (recent corr):** DE10Y +0.38 [INVERTED] · ^GSPC +0.52 [textbook] → **in charge: ^GSPC** (Global risk)
**Last 20 sessions decomposed (R² 0.23, n=60):** actual +1.4% = ^GSPC -2.1% · DE10Y +0.0% · unexplained +3.5%
**This week:** 11-25 02:00 ET Germany: German GDP (cons 1.2%, prev 1.2%)

### FTSE 100  `^FTSE`  10,551 (2026-11-19)
**Move:** 1w -2.9% · 4w -1.6% (43rd pct of 2y 4w moves) · 13w -1.8% · 52w range position 74% (lo 9,528 / hi 10,911)
**Drivers (recent corr):** BZ=F -0.36 [INVERTED] · GBPUSD=X +0.10 [weak] · GB10Y -0.38 [textbook] → **in charge: GB10Y** (Gilts)
**Last 20 sessions decomposed (R² 0.28, n=60):** actual -1.6% = BZ=F +0.4% · GB10Y -0.2% · GBPUSD=X +0.0% · unexplained -2.0%
**This week:** 11-20 02:00 ET United Kingdom: Core Retail Sales · 11-20 02:00 ET United Kingdom: Retail Sales (cons 0.0%, prev -0.4%)

### Nikkei 225  `^N225`  59,172 (2026-11-19)
**Move:** 1w -2.7% · 4w -5.9% (63rd pct of 2y 4w moves) · 13w -10.6% · 52w range position 44% (lo 48,626 / hi 72,366)
**Drivers (recent corr):** USDJPY=X +0.44 [textbook] · ^NDX +0.71 [textbook] · SOXX +0.72 [textbook] → **in charge: SOXX** (Chips (prior US day))
**Last 20 sessions decomposed (R² 0.32, n=60):** actual -6.1% = SOXX -3.5% · ^NDX -1.9% · USDJPY=X -0.1% · unexplained -0.6%
**This week:** 11-26 18:30 ET Japan: Tokyo Core CPI

### KOSPI  `^KS11`  5,010 (2026-11-19)
**Move:** 1w -6.2% · 4w -9.5% (63rd pct of 2y 4w moves) · 13w -26.9% · 52w range position 22% (lo 3,846 / hi 9,115)
**Drivers (recent corr):** SOXX +0.55 [textbook] · ^NDX +0.46 [textbook] → **in charge: SOXX** (Memory / AI hardware (prior US day))
**Last 20 sessions decomposed (R² 0.24, n=60):** actual -9.9% = SOXX -14.0% · ^NDX +9.8% · unexplained -5.7%
**This week:** 11-25 20:00 ET South Korea: Interest Rate Decision

### Hang Seng  `^HSI`  22,853 (2026-11-19)
**Move:** 1w -4.8% · 4w -0.4% (6th pct of 2y 4w moves) · 13w -11.1% · 52w range position 3% (lo 22,672 / hi 27,968)
**Drivers (recent corr):** ^NDX +0.13 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.01, n=60):** actual -0.4% = ^NDX -0.5% · unexplained +0.1%
**This week:** 11-20 03:30 ET Hong Kong: CPI

### ASX 200  `^AXJO`  8,725 (2026-11-19)
**Move:** 1w -4.6% · 4w -0.8% (16th pct of 2y 4w moves) · 13w -4.0% · 52w range position 40% (lo 8,366 / hi 9,272)
**Drivers (recent corr):** HG=F +0.51 [textbook] · ^GSPC +0.58 [textbook] → **in charge: ^GSPC** (US lead (prior US day))
**Last 20 sessions decomposed (R² 0.29, n=60):** actual -0.8% = HG=F -1.8% · ^GSPC -1.4% · unexplained +2.5%


## 7. Rates

### US 2y  `US2Y`  4.88% (2026-11-19)
**Move:** 1w -6bp · 4w +12bp (47th pct of 2y 4w moves) · 13w +50bp · 52w range position 87% (lo 3.512 / hi 5.089)
**Drivers (recent corr):** CL=F +0.20 [weak] · ^GSPC +0.36 [textbook] → **in charge: ^GSPC** (Risk-on = fewer cuts / more hikes)
**Last 20 sessions decomposed (R² 0.02, n=60):** actual +12bp = ^GSPC -4bp · CL=F -3bp · unexplained +19bp
**Positioning (CFTC UST 2Y NOTE, 2026-11-10, + = long US 2y):** lev funds +1,505,204 (+34% OI, 4w +137,796, 19th pct of 3y) · asset mgrs -1,817,201 (-40% OI, 4w -21,335, 68th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%) · 11-25 08:30 ET United States: PCE price index

### US 10y  `US10Y`  5.07% (2026-11-19)
**Move:** 1w -4bp · 4w +11bp (49th pct of 2y 4w moves) · 13w +37bp · 52w range position 82% (lo 3.962 / hi 5.311)
**Drivers (recent corr):** CL=F +0.31 [textbook] · ^NDX +0.36 [INVERTED] · T10YIE (missing) · DE10Y +0.11 [weak] → **in charge: ^NDX** (Textbook: yields up hurt stocks; + means bonds hedge stocks)
**Last 20 sessions decomposed (R² 0.10, n=60):** actual +11bp = ^NDX -6bp · CL=F -5bp · DE10Y -0bp · unexplained +22bp
**Positioning (CFTC UST 10Y NOTE, 2026-11-10, + = long US 10y):** lev funds +2,301,327 (+38% OI, 4w +95,390, 90th pct of 3y) · asset mgrs -3,153,761 (-52% OI, 4w -255,199, 1st pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%) · 11-25 08:30 ET United States: PCE price index

### US 30y  `US30Y`  5.41% (2026-11-19)
**Move:** 1w -2bp · 4w +12bp (52nd pct of 2y 4w moves) · 13w +17bp · 52w range position 75% (lo 4.633 / hi 5.665)
**Drivers (recent corr):** US2Y +0.88 [textbook] · T10YIE (missing) → **in charge: US2Y** (Front end)
**Last 20 sessions decomposed (R² 0.72, n=60):** actual +12bp = US2Y +7bp · unexplained +5bp
**Positioning (CFTC UST BOND, 2026-11-10, + = long US 30y):** lev funds +149,858 (+8% OI, 4w -4,162, 1st pct of 3y) · asset mgrs -394,990 (-20% OI, 4w -3,456, 94th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%) · 11-25 08:30 ET United States: PCE price index

### Bund 10y  `DE10Y`  3.41% (2026-11-19)
**Move:** 1w +8bp · 4w -1bp (6th pct of 2y 4w moves) · 13w +13bp · 52w range position 74% (lo 2.69 / hi 3.66)
**Drivers (recent corr):** US10Y +0.11 [weak] · BZ=F -0.06 [weak] · FR_DE (missing) → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.04, n=60):** actual -1bp = US10Y +2bp · BZ=F -0bp · unexplained -3bp
**This week:** 11-25 02:00 ET Germany: German GDP (cons 1.2%, prev 1.2%)

### Gilt 10y  `GB10Y`  5.33% (2026-11-19)
**Move:** 1w +7bp · 4w +2bp (11th pct of 2y 4w moves) · 13w +21bp · 52w range position 87% (lo 4.352 / hi 5.478)
**Drivers (recent corr):** US10Y +0.75 [textbook] · GBPUSD=X -0.47 [textbook] → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.40, n=60):** actual +2bp = US10Y +6bp · GBPUSD=X +4bp · unexplained -8bp
**This week:** 11-20 02:00 ET United Kingdom: Core Retail Sales · 11-20 02:00 ET United Kingdom: Retail Sales (cons 0.0%, prev -0.4%)

### JGB 10y  `JP10Y`  2.92% (2026-11-19)
**Move:** 1w +7bp · 4w +0bp (1st pct of 2y 4w moves) · 13w +6bp · 52w range position 85% (lo 1.792 / hi 3.111)
**Drivers (recent corr):** US10Y +0.81 [textbook] · USDJPY=X +0.67 [textbook] → **in charge: US10Y** (Global duration)
**Last 20 sessions decomposed (R² 0.55, n=60):** actual +0bp = US10Y -3bp · USDJPY=X +2bp · unexplained +1bp
**This week:** 11-26 18:30 ET Japan: Tokyo Core CPI

### Canada 10y  `CA10Y`  3.81% (2026-11-19)
**Move:** 1w +3bp · 4w +3bp (18th pct of 2y 4w moves) · 13w +6bp · 52w range position 79% (lo 3.12 / hi 3.99)
**Drivers (recent corr):** US10Y +0.90 [textbook] · CL=F +0.36 [textbook] → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.69, n=60):** actual +3bp = US10Y +8bp · CL=F -4bp · unexplained -1bp
**This week:** 11-20 08:30 ET Canada: Core Retail Sales (cons 0.7%, prev 1.2%) · 11-20 08:30 ET Canada: Retail Sales (cons 0.7%, prev 1.2%)

### French spread (proxy)
_no data_


## 8. Commodities

### WTI crude  `CL=F`  81.9 (2026-11-19)
**Move:** 1w -7.7% · 4w -20.7% (89th pct of 2y 4w moves) · 13w -5.9% · 52w range position 46% (lo 55.27 / hi 112.9)
**Drivers (recent corr):** XLE +0.56 [textbook] · ^GSPC -0.36 [INVERTED] · HG=F -0.20 [weak] · DX-Y.NYB +0.24 [weak] → **in charge: XLE** (Energy equities (do they believe the move?))
**Last 20 sessions decomposed (R² 0.27, n=60):** actual -23.2% = XLE -7.3% · HG=F +5.2% · ^GSPC +3.7% · DX-Y.NYB -1.8% · unexplained -23.0%
**Positioning (CFTC WTI-PHYSICAL, 2026-11-10, + = long WTI crude):** managed money +25,714 (+1% OI, 4w -14,860, 12th pct of 3y) · producers +368,588 (+19% OI, 4w +15,445, 95th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%) · 11-25 08:30 ET United States: PCE price index

### Gold  `GC=F`  3,713 (2026-11-19)
**Move:** 1w -4.4% · 4w -7.4% (75th pct of 2y 4w moves) · 13w -20.7% · 52w range position 0% (lo 3,713 / hi 5,318)
**Drivers (recent corr):** DFII10 (missing) · DX-Y.NYB -0.41 [textbook] · SI=F +0.89 [textbook] · BTC-USD +0.32 [textbook] → **in charge: SI=F** (Precious block)
**Last 20 sessions decomposed (R² 0.77, n=60):** actual -7.6% = SI=F -8.6% · BTC-USD +1.6% · DX-Y.NYB -1.0% · unexplained +0.3%
**Positioning (CFTC GOLD, 2026-11-10, + = long Gold):** managed money +112,341 (+28% OI, 4w +5,252, 34th pct of 3y) · producers -10,881 (-3% OI, 4w +7,556, 98th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%) · 11-25 08:30 ET United States: PCE price index

### Silver  `SI=F`  44.8 (2026-11-19)
**Move:** 1w -10.3% · 4w -16.6% (82nd pct of 2y 4w moves) · 13w -35.5% · 52w range position 0% (lo 44.8 / hi 115.1)
**Drivers (recent corr):** GC=F +0.89 [textbook] · HG=F +0.72 [textbook] → **in charge: GC=F** (Gold)
**Last 20 sessions decomposed (R² 0.81, n=60):** actual -18.1% = GC=F -9.7% · HG=F -6.3% · unexplained -2.1%
**Positioning (CFTC SILVER, 2026-11-10, + = long Silver):** managed money +3,615 (+3% OI, 4w -2,004, 4th pct of 3y) · producers -12,061 (-10% OI, 4w +3,740, 100th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%) · 11-25 08:30 ET United States: PCE price index

### Copper  `HG=F`  5.648 (2026-11-19)
**Move:** 1w -8.6% · 4w -12.8% (91st pct of 2y 4w moves) · 13w -14.2% · 52w range position 37% (lo 4.959 / hi 6.804)
**Drivers (recent corr):** ^GSPC +0.41 [textbook] → **in charge: ^GSPC** (Global growth)
**Last 20 sessions decomposed (R² 0.10, n=60):** actual -13.7% = ^GSPC -2.3% · unexplained -11.4%
**Positioning (CFTC COPPER- #1, 2026-11-10, + = long Copper):** managed money +35,064 (+11% OI, 4w -25,994, 48th pct of 3y) · producers -48,209 (-15% OI, 4w +42,257, 59th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%) · 11-25 08:30 ET United States: PCE price index

### Nat gas (US)  `NG=F`  3.377 (2026-11-19)
**Move:** 1w +1.1% · 4w +27.9% (94th pct of 2y 4w moves) · 13w +21.8% · 52w range position 17% (lo 2.523 / hi 7.46)
**Drivers (recent corr):** CL=F -0.11 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual +24.6% = CL=F +0.9% · unexplained +23.7%
**Positioning (CFTC NAT GAS NYME, 2026-11-10, + = long Nat gas (US)):** managed money -224,463 (-14% OI, 4w -97,982, 1st pct of 3y) · producers +14,748 (+1% OI, 4w +25,629, 96th pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%) · 11-25 08:30 ET United States: PCE price index


## 9. Crypto

### Bitcoin  `BTC-USD`  63,117 (2026-11-19)
**Move:** 1w -11.5% · 4w -22.4% (92nd pct of 2y 4w moves) · 13w -13.6% · 52w range position 12% (lo 58,559 / hi 96,929)
**Drivers (recent corr):** ^NDX +0.63 [textbook] · DX-Y.NYB -0.14 [weak] · GC=F +0.32 [textbook] → **in charge: ^NDX** (Tech / speculation)
**Last 20 sessions decomposed (R² 0.38, n=60):** actual -25.3% = ^NDX -6.1% · DX-Y.NYB -0.9% · GC=F -0.0% · unexplained -18.3%
**Positioning (CFTC BITCOIN, 2026-11-10, + = long Bitcoin):** lev funds -1,243 (-6% OI, 4w +4,601, 100th pct of 3y) · asset mgrs +1,956 (+10% OI, 4w -1,686, 1st pct of 3y)
**This week:** 11-25 08:30 ET United States: Core PCE Price Index · 11-25 08:30 ET United States: Core PCE Prices (cons 2.50%, prev 3.30%) · 11-25 08:30 ET United States: GDP (cons 3.4%, prev 2.2%) · 11-25 08:30 ET United States: GDP Price Index (cons 2.2%, prev 6.1%) · 11-25 08:30 ET United States: GDP Sales (cons 1.7%, prev 2.8%) · 11-25 08:30 ET United States: PCE price index

