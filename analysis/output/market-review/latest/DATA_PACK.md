# Market Review Data Pack: 2026-10-30

Fetched 2026-10-30T02:08:17+00:00. Descriptive numbers for the weekly review (read with `education/market_reviews/PLAYBOOK.md`). Correlations are of daily moves: last 20 sessions vs the 60 before. They are noisy; a flip is a question, not a signal.

**Data notes:** fred DGS2: The read operation timed out · fred DFII10: The read operation timed out · fred T10YIE: The read operation timed out · fred BAMLH0A0HYM2: The read operation timed out · fred BAMLC0A0CM: The read operation timed out · FRED DGS2 missing: US 2y = US 5y stand-in for this run

## 1. Regime gauges: which story is the market trading?

| Pair | Recent | Before | Textbook sign | Status | What it means |
|---|---|---|---|---|---|
| CL=F vs US10Y | -0.26 | +0.40 | + | weak | Oil vs yields: + = oil is an inflation story; - = oil is a growth tax (2008-style) |
| ^NDX vs US10Y | +0.62 | -0.28 | − | INVERTED | Stocks vs yields: - = rates drive stocks; + = growth scare, bonds hedge stocks |
| HYG_TLT vs ^NDX | +0.76 | -0.17 | + | textbook | Credit vs tech: high + = credit and equities are one trade (credit stress leading) |
| DX-Y.NYB vs ^GSPC | +0.02 | -0.31 | − | weak | Dollar vs stocks: - = safe-haven dollar; ~0/+ = "sell America" or liquidity dash |
| AUDUSD=X vs ^NDX | +0.29 | +0.44 | + | weak | Aussie vs tech: near 0 = AUD trading commodities not risk |
| BTC-USD vs ^NDX | +0.43 | +0.39 | + | textbook | Bitcoin vs tech: high = one liquidity complex |
| XLE vs CL=F | +0.35 | +0.67 | + | textbook | Energy stocks vs oil: falling = equity investors fade the oil move |
| USDJPY=X vs US10Y | +0.66 | +0.25 | + | textbook | Yen vs yields: high = yen is a pure rates trade |
| FR_DE vs IT_DE | +0.76 | +0.95 | + | textbook | France vs Italy spreads: high = euro-periphery contagion, low = France-specific |

Equity vol vs bond vol: VIX 17.2 (1y pct 53) · MOVE 94 (1y pct 87). When bond vol leads equity vol, the stress is in rates/credit first.

**Fed funds futures (implied average rate by contract month; vs ~1 week earlier):** V6 3.885% (+0.000) · X6 3.925% (+0.010) · Z6 4.085% (+0.015) · F7 4.165% (+0.020) · G7 4.265% (+0.035) · H7 4.345% (+0.040) · J7 4.450% (+0.050) · K7 4.530% (+0.055) · M7 4.595% (+0.055) · N7 4.625% (+0.055) · Q7 4.645% (+0.055) · U7 4.660% (+0.030) (as of 2026-10-19)

## 2. G10 FX

### EURUSD  `EURUSD=X`  1.12 (2026-10-30)
**Move:** 1w -0.2% · 4w -0.4% (15th pct of 2y 4w moves) · 13w -2.8% · 52w range position 8% (lo 1.113 / hi 1.202)
**Drivers (recent corr):** US_EA2 -0.21 [weak] · US_DE10 -0.14 [weak] · FR_DE -0.38 [textbook] · ^STOXX50E +0.06 [weak] · BZ=F -0.06 [weak] → **in charge: FR_DE** (French spread (fiscal stress): wider = EUR-negative)
**Last 20 sessions decomposed (R² 0.38, n=28):** actual -0.8% = FR_DE -0.3% · US_EA2 +0.1% · BZ=F -0.0% · US_DE10 +0.0% · ^STOXX50E +0.0% · unexplained -0.6%
**Positioning (CFTC EURO FX, 2026-10-20, + = long EURUSD):** lev funds -68,840 (-8% OI, 4w -42,146, 1st pct of 3y) · asset mgrs +190,421 (+22% OI, 4w -26,062, 10th pct of 3y)
**This week:** 11-02 03:00 ET Germany: German Retail Sales · 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 03:45 ET France: French Government Budget Balance

### USDJPY  `USDJPY=X`  157.5 (2026-10-30)
**Move:** 1w +0.6% · 4w -0.3% (9th pct of 2y 4w moves) · 13w -1.7% · 52w range position 44% (lo 152.5 / hi 163.9)
**Drivers (recent corr):** US10Y +0.66 [textbook] · US_JP10 +0.59 [textbook] · ^NDX +0.65 [textbook] · ^VIX -0.54 [textbook, was INVERTED] → **in charge: US10Y** (US yields: the carry engine)
**Last 20 sessions decomposed (R² 0.16, n=60):** actual -0.3% = US10Y -1.3% · ^NDX -0.6% · ^VIX +0.2% · US_JP10 +0.1% · unexplained +1.3%
**Positioning (CFTC JAPANESE YEN, 2026-10-20, + = long USDJPY):** lev funds +22,890 (+6% OI, 4w +30,313, 26th pct of 3y) · asset mgrs -79,103 (-21% OI, 4w -37,474, 14th pct of 3y)
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 11:00 ET United States: IBD/TIPP Economic Optimism · 11-04 09:15 ET United States: ADP Nonfarm Employment Change

### GBPUSD  `GBPUSD=X`  1.339 (2026-10-30)
**Move:** 1w -0.1% · 4w +1.5% (54th pct of 2y 4w moves) · 13w -0.5% · 52w range position 46% (lo 1.302 / hi 1.383)
**Drivers (recent corr):** US_GB10 -0.07 [weak] · GB10Y -0.23 [weak] · ^GSPC +0.17 [weak] · EURUSD=X +0.82 [textbook] → **in charge: EURUSD=X** (European block move)
**Last 20 sessions decomposed (R² 0.67, n=60):** actual +1.5% = EURUSD=X -0.4% · US_GB10 +0.2% · GB10Y +0.0% · ^GSPC -0.0% · unexplained +1.6%
**Positioning (CFTC BRITISH POUND, 2026-10-20, + = long GBPUSD):** lev funds +24,104 (+9% OI, 4w +10,865, 29th pct of 3y) · asset mgrs -134,621 (-53% OI, 4w -18,816, 4th pct of 3y)
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 11:00 ET United States: IBD/TIPP Economic Optimism · 11-04 09:15 ET United States: ADP Nonfarm Employment Change

### USDCAD  `USDCAD=X`  1.396 (2026-10-30)
**Move:** 1w -0.3% · 4w -1.8% (75th pct of 2y 4w moves) · 13w -0.3% · 52w range position 60% (lo 1.349 / hi 1.428)
**Drivers (recent corr):** CL=F -0.10 [weak] · US_CA2 +0.38 [textbook] · ^GSPC +0.05 [weak] → **in charge: US_CA2** (US-Canada 2y rate gap)
**Last 20 sessions decomposed (R² 0.30, n=60):** actual -1.8% = US_CA2 -1.3% · CL=F -0.3% · ^GSPC +0.0% · unexplained -0.3%
**Positioning (CFTC CANADIAN DOLLAR, 2026-10-20, + = long USDCAD):** lev funds +91,113 (+24% OI, 4w +44,252, 94th pct of 3y) · asset mgrs +5,399 (+1% OI, 4w -18,722, 16th pct of 3y)
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 11:00 ET United States: IBD/TIPP Economic Optimism · 11-04 09:15 ET United States: ADP Nonfarm Employment Change

### AUDUSD  `AUDUSD=X`  0.7036 (2026-10-30)
**Move:** 1w +0.2% · 4w +1.5% (58th pct of 2y 4w moves) · 13w +0.2% · 52w range position 73% (lo 0.6449 / hi 0.7255)
**Drivers (recent corr):** HG=F +0.24 [weak] · ^NDX +0.29 [weak] · GC=F -0.19 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.15, n=60):** actual +1.5% = ^NDX -0.1% · HG=F +0.1% · GC=F -0.1% · unexplained +1.6%
**Positioning (CFTC AUSTRALIAN DOLLAR, 2026-10-20, + = long AUDUSD):** lev funds +52,497 (+16% OI, 4w -6,229, 90th pct of 3y) · asset mgrs -128,739 (-39% OI, 4w -73,386, 1st pct of 3y)
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-02 23:30 ET Australia: RBA Interest Rate Decision · 11-03 00:30 ET Australia: RBA Monetary Policy Statement

### NZDUSD  `NZDUSD=X`  0.5643 (2026-10-30)
**Move:** 1w -0.7% · 4w +0.7% (23rd pct of 2y 4w moves) · 13w -4.0% · 52w range position 11% (lo 0.5587 / hi 0.6076)
**Drivers (recent corr):** AUDUSD=X +0.29 [weak] · ^GSPC +0.40 [textbook] · US2Y +0.35 [INVERTED, was textbook] → **in charge: ^GSPC** (Global risk proxy)
**Last 20 sessions decomposed (R² 0.38, n=60):** actual +0.7% = AUDUSD=X +1.0% · US2Y -0.1% · ^GSPC -0.0% · unexplained -0.2%
**Positioning (CFTC NZ DOLLAR, 2026-10-20, + = long NZDUSD):** lev funds -19,280 (-15% OI, 4w -14,493, 11th pct of 3y) · asset mgrs -49,313 (-38% OI, 4w -37,828, 9th pct of 3y)
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 11:00 ET United States: IBD/TIPP Economic Optimism · 11-03 17:45 ET New Zealand: Employment Change

### USDCHF  `USDCHF=X`  0.8211 (2026-10-30)
**Move:** 1w +0.2% · 4w -1.1% (44th pct of 2y 4w moves) · 13w +1.9% · 52w range position 80% (lo 0.7632 / hi 0.8357)
**Drivers (recent corr):** US10Y +0.45 [textbook] · ^VIX -0.23 [weak] · GC=F +0.18 [weak] → **in charge: US10Y** (US yields)
**Last 20 sessions decomposed (R² 0.30, n=60):** actual -1.1% = US10Y -1.0% · GC=F +0.3% · ^VIX +0.0% · unexplained -0.6%
**Positioning (CFTC SWISS FRANC, 2026-10-20, + = long USDCHF):** lev funds +13,607 (+10% OI, 4w -2,850, 83rd pct of 3y) · asset mgrs +25,535 (+19% OI, 4w -9,988, 36th pct of 3y)
**This week:** 11-02 03:30 ET Switzerland: Retail Sales · 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 03:30 ET Switzerland: CPI


## 3. G10 crosses

### AUDNZD  `AUDNZD=X`  1.247 (2026-10-30)
**Move:** 1w +1.0% · 4w +0.8% (46th pct of 2y 4w moves) · 13w +4.3% · 52w range position 94% (lo 1.141 / hi 1.254)
**Drivers (recent corr):** HG=F +0.14 [weak] · ^AXJO +0.12 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.05, n=60):** actual +0.8% = ^AXJO -0.4% · HG=F +0.0% · unexplained +1.1%
**This week:** 11-02 23:30 ET Australia: RBA Interest Rate Decision · 11-03 00:30 ET Australia: RBA Monetary Policy Statement · 11-03 17:45 ET New Zealand: Employment Change · 11-03 17:45 ET New Zealand: Unemployment Rate

### EURGBP  `EURGBP=X`  0.8359 (2026-10-30)
**Move:** 1w -0.1% · 4w -1.9% (91st pct of 2y 4w moves) · 13w -2.3% · 52w range position 0% (lo 0.8359 / hi 0.8842)
**Drivers (recent corr):** GB10Y -0.17 [weak] · FR_DE -0.36 [textbook] → **in charge: FR_DE** (Euro fiscal stress)
**Last 20 sessions decomposed (R² 0.13, n=28):** actual -1.8% = FR_DE -0.2% · GB10Y -0.0% · unexplained -1.6%
**This week:** 11-02 03:00 ET Germany: German Retail Sales · 11-03 03:45 ET France: French Government Budget Balance · 11-04 06:00 ET Euro Zone: Core CPI · 11-04 06:00 ET Euro Zone: CPI · 11-05 05:00 ET Italy: Italian Retail Sales · 11-05 08:00 ET United Kingdom: BoE Interest Rate Decision

### EURCHF  `EURCHF=X`  0.9193 (2026-10-30)
**Move:** 1w -0.1% · 4w -1.6% (89th pct of 2y 4w moves) · 13w -1.0% · 52w range position 41% (lo 0.9001 / hi 0.9466)
**Drivers (recent corr):** ^STOXX50E +0.54 [textbook] · FR_DE -0.71 [textbook] · ^VIX -0.31 [textbook] → **in charge: FR_DE** (Euro fiscal stress)
**Last 20 sessions decomposed (R² 0.50, n=28):** actual -1.1% = FR_DE -0.4% · ^STOXX50E +0.1% · ^VIX +0.0% · unexplained -0.8%
**This week:** 11-02 03:00 ET Germany: German Retail Sales · 11-02 03:30 ET Switzerland: Retail Sales · 11-03 03:30 ET Switzerland: CPI · 11-03 03:45 ET France: French Government Budget Balance · 11-04 06:00 ET Euro Zone: Core CPI · 11-04 06:00 ET Euro Zone: CPI


## 4. EM FX

### USDMXN  `USDMXN=X`  18.87 (2026-10-30)
**Move:** 1w +0.8% · 4w +3.1% (87th pct of 2y 4w moves) · 13w +8.8% · 52w range position 100% (lo 16.89 / hi 18.87)
**Drivers (recent corr):** ^VIX +0.08 [weak] · ^GSPC -0.27 [weak] · CL=F +0.09 [weak] · USDBRL=X -0.01 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.12, n=60):** actual +3.0% = CL=F -0.5% · USDBRL=X +0.1% · ^VIX +0.1% · ^GSPC +0.0% · unexplained +3.3%
**Positioning (CFTC MEXICAN PESO, 2026-10-20, + = long USDMXN):** lev funds -63,814 (-23% OI, 4w +15,374, 10th pct of 3y) · asset mgrs +24,064 (+9% OI, 4w +69,570, 100th pct of 3y)
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 11:00 ET United States: IBD/TIPP Economic Optimism · 11-04 09:15 ET United States: ADP Nonfarm Employment Change

### USDBRL  `USDBRL=X`  5.385 (2026-10-30)
**Move:** 1w +6.6% · 4w +3.1% (75th pct of 2y 4w moves) · 13w +6.0% · 52w range position 70% (lo 4.906 / hi 5.59)
**Drivers (recent corr):** ^VIX -0.05 [weak] · HG=F +0.04 [weak] · EWZ -0.05 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.02, n=60):** actual +3.1% = EWZ +0.7% · ^VIX +0.1% · HG=F -0.0% · unexplained +2.3%
**Positioning (CFTC BRAZILIAN REAL, 2026-10-20, + = long USDBRL):** lev funds -18,677 (-14% OI, 4w -3,760, 4th pct of 3y) · asset mgrs -51,268 (-38% OI, 4w +8,213, 46th pct of 3y)
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 11:00 ET United States: IBD/TIPP Economic Optimism · 11-04 09:15 ET United States: ADP Nonfarm Employment Change

### USDZAR  `USDZAR=X`  16.61 (2026-10-30)
**Move:** 1w +0.8% · 4w -0.5% (17th pct of 2y 4w moves) · 13w +0.7% · 52w range position 51% (lo 15.71 / hi 17.49)
**Drivers (recent corr):** GC=F -0.39 [textbook] · ^VIX +0.30 [textbook] · HG=F -0.16 [weak] → **in charge: GC=F** (Gold / precious metals exporter)
**Last 20 sessions decomposed (R² 0.21, n=60):** actual -0.5% = GC=F +0.2% · ^VIX +0.2% · HG=F -0.1% · unexplained -0.9%
**Positioning (CFTC SO AFRICAN RAND, 2026-10-20, + = long USDZAR):** lev funds -4,888 (-13% OI, 4w -1,143, 24th pct of 3y) · asset mgrs -17,962 (-47% OI, 4w +4,871, 25th pct of 3y)
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 11:00 ET United States: IBD/TIPP Economic Optimism · 11-04 09:15 ET United States: ADP Nonfarm Employment Change

### USDKRW  `USDKRW=X`  1,337 (2026-10-30)
**Move:** 1w +0.8% · 4w -1.7% (53rd pct of 2y 4w moves) · 13w -5.9% · 52w range position 7% (lo 1,322 / hi 1,552)
**Drivers (recent corr):** ^KS11 -0.01 [weak] · SOXX -0.12 [weak] · DX-Y.NYB -0.46 [INVERTED, was textbook] → **in charge: DX-Y.NYB** (Broad dollar)
**Last 20 sessions decomposed (R² 0.08, n=60):** actual -1.8% = ^KS11 -0.9% · SOXX +0.4% · DX-Y.NYB -0.1% · unexplained -1.2%
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-02 19:00 ET South Korea: CPI · 11-03 11:00 ET United States: IBD/TIPP Economic Optimism


## 5. CE3 FX

### EURCZK  `EURCZK=X`  24.33 (2026-10-30)
**Move:** 1w +0.3% · 4w -0.5% (62nd pct of 2y 4w moves) · 13w +0.6% · 52w range position 56% (lo 24.07 / hi 24.53)
**Drivers (recent corr):** ^STOXX50E +0.02 [weak] · EURPLN=X +0.51 [textbook] → **in charge: EURPLN=X** (CE3 block)
**Last 20 sessions decomposed (R² 0.17, n=60):** actual -0.5% = EURPLN=X +0.1% · ^STOXX50E +0.0% · unexplained -0.6%
**This week:** 11-02 03:00 ET Germany: German Retail Sales · 11-03 03:45 ET France: French Government Budget Balance · 11-04 06:00 ET Euro Zone: Core CPI · 11-04 06:00 ET Euro Zone: CPI · 11-05 05:00 ET Italy: Italian Retail Sales · 11-06 06:00 ET Euro Zone: Retail Sales

### EURPLN  `EURPLN=X`  4.387 (2026-10-30)
**Move:** 1w +0.3% · 4w +0.3% (36th pct of 2y 4w moves) · 13w +1.9% · 52w range position 93% (lo 4.197 / hi 4.401)
**Drivers (recent corr):** ^STOXX50E -0.23 [weak] · ^VIX +0.17 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.09, n=60):** actual +0.3% = ^VIX +0.0% · ^STOXX50E +0.0% · unexplained +0.2%
**This week:** 11-02 03:00 ET Germany: German Retail Sales · 11-03 03:45 ET France: French Government Budget Balance · 11-04 06:00 ET Euro Zone: Core CPI · 11-04 06:00 ET Euro Zone: CPI · 11-05 05:00 ET Italy: Italian Retail Sales · 11-06 06:00 ET Euro Zone: Retail Sales


## 6. Equities

### S&P 500  `^GSPC`  7,720 (2026-10-30)
**Move:** 1w +1.3% · 4w -0.0% (1st pct of 2y 4w moves) · 13w +3.1% · 52w range position 93% (lo 6,344 / hi 7,819)
**Drivers (recent corr):** US10Y +0.44 [INVERTED, was textbook] · HYG_TLT +0.60 [textbook, was INVERTED] · DX-Y.NYB +0.02 [weak] · CL=F -0.57 [textbook] · ^VIX -0.87 [textbook] → **in charge: ^VIX** (Vol)
**Last 20 sessions decomposed (R² 0.73, n=60):** actual -0.0% = HYG_TLT -1.5% · US10Y +1.2% · CL=F -0.8% · ^VIX -0.8% · DX-Y.NYB +0.0% · unexplained +1.7%
**Positioning (CFTC E-MINI S&P 500, 2026-10-20, + = long S&P 500):** lev funds -371,245 (-19% OI, 4w +4,329, 36th pct of 3y) · asset mgrs +901,377 (+47% OI, 4w -33,078, 31st pct of 3y)
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 11:00 ET United States: IBD/TIPP Economic Optimism · 11-04 09:15 ET United States: ADP Nonfarm Employment Change

### Nasdaq 100  `^NDX`  29,403 (2026-10-30)
**Move:** 1w +1.5% · 4w -4.6% (68th pct of 2y 4w moves) · 13w +4.0% · 52w range position 78% (lo 22,953 / hi 31,224)
**Drivers (recent corr):** US10Y +0.62 [INVERTED] · SOXX +0.94 [textbook] · HYG_TLT +0.76 [textbook] · BTC-USD +0.43 [textbook] → **in charge: SOXX** (Semis / AI capex)
**Last 20 sessions decomposed (R² 0.78, n=60):** actual -4.7% = SOXX -4.6% · HYG_TLT -1.2% · US10Y +1.1% · BTC-USD -0.7% · unexplained +0.7%
**Positioning (CFTC NASDAQ MINI, 2026-10-20, + = long Nasdaq 100):** lev funds +950 (+0% OI, 4w +31,633, 94th pct of 3y) · asset mgrs +77,790 (+29% OI, 4w +5,570, 60th pct of 3y)
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 11:00 ET United States: IBD/TIPP Economic Optimism · 11-04 09:15 ET United States: ADP Nonfarm Employment Change

### Russell 2000  `^RUT`  2,859 (2026-10-30)
**Move:** 1w +3.0% · 4w +0.9% (13th pct of 2y 4w moves) · 13w -2.5% · 52w range position 73% (lo 2,305 / hi 3,068)
**Drivers (recent corr):** US2Y -0.07 [weak] · HYG_TLT +0.06 [weak] · ^GSPC +0.59 [textbook] → **in charge: ^GSPC** (Beta)
**Last 20 sessions decomposed (R² 0.55, n=60):** actual +0.9% = US2Y +1.1% · HYG_TLT +0.1% · ^GSPC -0.0% · unexplained -0.2%
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 11:00 ET United States: IBD/TIPP Economic Optimism · 11-04 09:15 ET United States: ADP Nonfarm Employment Change

### Euro Stoxx 50  `^STOXX50E`  6,207 (2026-10-30)
**Move:** 1w +2.3% · 4w -0.5% (9th pct of 2y 4w moves) · 13w -2.4% · 52w range position 67% (lo 5,501 / hi 6,551)
**Drivers (recent corr):** FR_DE -0.37 [textbook] · ^GSPC +0.40 [textbook] · BZ=F -0.33 [textbook] · EURUSD=X +0.06 [weak] → **in charge: ^GSPC** (US lead)
**Last 20 sessions decomposed (R² 0.32, n=28):** actual +0.5% = BZ=F -0.9% · FR_DE -0.8% · ^GSPC +0.1% · EURUSD=X +0.1% · unexplained +2.1%
**This week:** 11-02 03:00 ET Germany: German Retail Sales · 11-03 03:45 ET France: French Government Budget Balance · 11-04 06:00 ET Euro Zone: Core CPI · 11-04 06:00 ET Euro Zone: CPI · 11-05 05:00 ET Italy: Italian Retail Sales · 11-06 06:00 ET Euro Zone: Retail Sales

### CAC 40  `^FCHI`  7,970 (2026-10-30)
**Move:** 1w +2.4% · 4w +0.9% (22nd pct of 2y 4w moves) · 13w -6.3% · 52w range position 29% (lo 7,666 / hi 8,726)
**Drivers (recent corr):** FR_DE -0.40 [textbook] · ^STOXX50E +0.87 [textbook] → **in charge: ^STOXX50E** (European block)
**Last 20 sessions decomposed (R² 0.78, n=28):** actual +1.7% = ^STOXX50E +0.4% · FR_DE -0.3% · unexplained +1.6%
**This week:** 11-02 03:00 ET Germany: German Retail Sales · 11-03 03:45 ET France: French Government Budget Balance · 11-04 06:00 ET Euro Zone: Core CPI · 11-04 06:00 ET Euro Zone: CPI · 11-05 05:00 ET Italy: Italian Retail Sales · 11-06 06:00 ET Euro Zone: Retail Sales

### DAX  `^GDAXI`  26,040 (2026-10-30)
**Move:** 1w +3.4% · 4w +3.2% (60th pct of 2y 4w moves) · 13w +1.6% · 52w range position 88% (lo 22,301 / hi 26,570)
**Drivers (recent corr):** DE10Y -0.03 [weak] · ^GSPC +0.36 [textbook] → **in charge: ^GSPC** (Global risk)
**Last 20 sessions decomposed (R² 0.24, n=60):** actual +3.2% = DE10Y +0.2% · ^GSPC -0.0% · unexplained +3.0%
**This week:** 11-02 03:00 ET Germany: German Retail Sales · 11-03 03:45 ET France: French Government Budget Balance · 11-04 06:00 ET Euro Zone: Core CPI · 11-04 06:00 ET Euro Zone: CPI · 11-05 05:00 ET Italy: Italian Retail Sales · 11-06 06:00 ET Euro Zone: Retail Sales

### FTSE 100  `^FTSE`  10,722 (2026-10-30)
**Move:** 1w +0.3% · 4w +2.5% (60th pct of 2y 4w moves) · 13w -1.3% · 52w range position 87% (lo 9,507 / hi 10,911)
**Drivers (recent corr):** BZ=F +0.02 [weak] · GBPUSD=X +0.00 [weak] · GB10Y -0.59 [textbook] → **in charge: GB10Y** (Gilts)
**Last 20 sessions decomposed (R² 0.35, n=60):** actual +2.5% = BZ=F +0.2% · GB10Y +0.2% · GBPUSD=X +0.1% · unexplained +1.9%
**This week:** 11-05 08:00 ET United Kingdom: BoE Interest Rate Decision · 11-05 08:00 ET United Kingdom: BoE MPC Meeting Minutes

### Nikkei 225  `^N225`  62,713 (2026-10-30)
**Move:** 1w +0.0% · 4w -8.2% (80th pct of 2y 4w moves) · 13w -2.6% · 52w range position 59% (lo 48,538 / hi 72,366)
**Drivers (recent corr):** USDJPY=X +0.23 [weak] · ^NDX +0.44 [textbook] · SOXX +0.44 [textbook] → **in charge: ^NDX** (US tech lead (prior US day))
**Last 20 sessions decomposed (R² 0.19, n=60):** actual -8.5% = ^NDX -1.7% · SOXX -1.0% · USDJPY=X +0.0% · unexplained -5.8%
**This week:** 11-04 19:50 ET Japan: Monetary Policy Meeting Minutes

### KOSPI  `^KS11`  5,614 (2026-10-30)
**Move:** 1w +1.1% · 4w -19.8% (89th pct of 2y 4w moves) · 13w -14.9% · 52w range position 34% (lo 3,846 / hi 9,115)
**Drivers (recent corr):** SOXX +0.31 [textbook] · ^NDX +0.21 [weak] → **in charge: SOXX** (Memory / AI hardware (prior US day))
**Last 20 sessions decomposed (R² 0.13, n=60):** actual -22.1% = SOXX -6.1% · ^NDX +1.4% · unexplained -17.4%
**This week:** 11-02 19:00 ET South Korea: CPI

### Hang Seng  `^HSI`  23,141 (2026-10-30)
**Move:** 1w +0.2% · 4w -3.5% (51st pct of 2y 4w moves) · 13w -10.6% · 52w range position 9% (lo 22,672 / hi 27,968)
**Drivers (recent corr):** ^NDX -0.34 [INVERTED] → **in charge: ^NDX** (US tech (prior US day))
**Last 20 sessions decomposed (R² 0.00, n=60):** actual -3.5% = ^NDX +0.2% · unexplained -3.7%
**This week:** 11-03 04:30 ET Hong Kong: GDP · 11-03 04:30 ET Hong Kong: Retail Sales

### ASX 200  `^AXJO`  8,936 (2026-10-30)
**Move:** 1w +1.6% · 4w +2.9% (64th pct of 2y 4w moves) · 13w -0.5% · 52w range position 63% (lo 8,366 / hi 9,272)
**Drivers (recent corr):** HG=F +0.04 [weak] · ^GSPC +0.06 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.06, n=60):** actual +2.9% = ^GSPC +0.1% · HG=F +0.1% · unexplained +2.7%
**This week:** 11-02 23:30 ET Australia: RBA Interest Rate Decision · 11-03 00:30 ET Australia: RBA Monetary Policy Statement


## 7. Rates

### US 2y  `US2Y`  4.80% (2026-10-30)
**Move:** 1w -0bp · 4w -25bp (84th pct of 2y 4w moves) · 13w +34bp · 52w range position 82% (lo 3.512 / hi 5.089)
**Drivers (recent corr):** CL=F -0.31 [INVERTED, was textbook] · ^GSPC +0.48 [textbook, was INVERTED] → **in charge: ^GSPC** (Risk-on = fewer cuts / more hikes)
**Last 20 sessions decomposed (R² 0.01, n=60):** actual -25bp = CL=F -1bp · ^GSPC +0bp · unexplained -24bp
**Positioning (CFTC UST 2Y NOTE, 2026-10-20, + = long US 2y):** lev funds +1,285,548 (+28% OI, 4w -65,192, 4th pct of 3y) · asset mgrs -1,723,580 (-38% OI, 4w +46,505, 73rd pct of 3y)
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 11:00 ET United States: IBD/TIPP Economic Optimism · 11-04 09:15 ET United States: ADP Nonfarm Employment Change

### US 10y  `US10Y`  4.99% (2026-10-30)
**Move:** 1w +0bp · 4w -29bp (89th pct of 2y 4w moves) · 13w +24bp · 52w range position 76% (lo 3.962 / hi 5.311)
**Drivers (recent corr):** CL=F -0.26 [weak] · ^NDX +0.62 [INVERTED] · T10YIE (missing) · DE10Y +0.22 [weak] → **in charge: ^NDX** (Textbook: yields up hurt stocks; + means bonds hedge stocks)
**Last 20 sessions decomposed (R² 0.06, n=60):** actual -29bp = ^NDX -5bp · CL=F +4bp · DE10Y -1bp · unexplained -26bp
**Positioning (CFTC UST 10Y NOTE, 2026-10-20, + = long US 10y):** lev funds +2,107,224 (+36% OI, 4w +180,277, 78th pct of 3y) · asset mgrs -2,925,416 (-50% OI, 4w -394,032, 1st pct of 3y)
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 11:00 ET United States: IBD/TIPP Economic Optimism · 11-04 09:15 ET United States: ADP Nonfarm Employment Change

### US 30y  `US30Y`  5.33% (2026-10-30)
**Move:** 1w +1bp · 4w -30bp (94th pct of 2y 4w moves) · 13w +5bp · 52w range position 67% (lo 4.633 / hi 5.665)
**Drivers (recent corr):** US2Y +0.88 [textbook] · T10YIE (missing) → **in charge: US2Y** (Front end)
**Last 20 sessions decomposed (R² 0.67, n=60):** actual -30bp = US2Y -18bp · unexplained -13bp
**Positioning (CFTC UST BOND, 2026-10-20, + = long US 30y):** lev funds +162,757 (+9% OI, 4w +705, 2nd pct of 3y) · asset mgrs -388,007 (-22% OI, 4w +25,609, 96th pct of 3y)
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 11:00 ET United States: IBD/TIPP Economic Optimism · 11-04 09:15 ET United States: ADP Nonfarm Employment Change

### Bund 10y  `DE10Y`  3.39% (2026-10-30)
**Move:** 1w +3bp · 4w -7bp (35th pct of 2y 4w moves) · 13w +21bp · 52w range position 73% (lo 2.67 / hi 3.66)
**Drivers (recent corr):** US10Y +0.22 [weak] · BZ=F -0.04 [weak] · FR_DE +0.15 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.07, n=28):** actual -23bp = BZ=F +4bp · US10Y -3bp · FR_DE +2bp · unexplained -26bp
**This week:** 11-02 03:00 ET Germany: German Retail Sales · 11-03 03:45 ET France: French Government Budget Balance · 11-04 06:00 ET Euro Zone: Core CPI · 11-04 06:00 ET Euro Zone: CPI · 11-05 05:00 ET Italy: Italian Retail Sales · 11-06 06:00 ET Euro Zone: Retail Sales

### Gilt 10y  `GB10Y`  5.32% (2026-10-30)
**Move:** 1w -3bp · 4w -3bp (14th pct of 2y 4w moves) · 13w +22bp · 52w range position 86% (lo 4.352 / hi 5.478)
**Drivers (recent corr):** US10Y +0.58 [textbook] · GBPUSD=X -0.23 [weak] → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.36, n=60):** actual -3bp = US10Y -17bp · GBPUSD=X +0bp · unexplained +13bp
**This week:** 11-05 08:00 ET United Kingdom: BoE Interest Rate Decision · 11-05 08:00 ET United Kingdom: BoE MPC Meeting Minutes

### JGB 10y  `JP10Y`  2.88% (2026-10-30)
**Move:** 1w +4bp · 4w -22bp (91st pct of 2y 4w moves) · 13w +7bp · 52w range position 84% (lo 1.67 / hi 3.111)
**Drivers (recent corr):** US10Y +0.49 [textbook] · USDJPY=X +0.73 [textbook] → **in charge: USDJPY=X** (Weak yen -> BoJ pressure)
**Last 20 sessions decomposed (R² 0.46, n=60):** actual -22bp = US10Y -7bp · USDJPY=X -0bp · unexplained -15bp
**This week:** 11-04 19:50 ET Japan: Monetary Policy Meeting Minutes

### Canada 10y  `CA10Y`  3.87% (2026-10-30)
**Move:** 1w +4bp · 4w -6bp (29th pct of 2y 4w moves) · 13w +22bp · 52w range position 87% (lo 3.1 / hi 3.99)
**Drivers (recent corr):** US10Y +0.75 [textbook] · CL=F +0.07 [weak] → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.67, n=60):** actual -6bp = US10Y -20bp · CL=F +6bp · unexplained +8bp
**This week:** 11-06 09:30 ET Canada: Employment Change · 11-06 09:30 ET Canada: Full Employment Change · 11-06 09:30 ET Canada: Part Time Employment Change · 11-06 09:30 ET Canada: Unemployment Rate


## 8. Commodities

### WTI crude  `CL=F`  104.4 (2026-10-30)
**Move:** 1w +1.1% · 4w +14.6% (83rd pct of 2y 4w moves) · 13w +23.3% · 52w range position 85% (lo 55.27 / hi 112.9)
**Drivers (recent corr):** XLE +0.35 [textbook] · ^GSPC -0.57 [INVERTED] · HG=F -0.26 [weak] · DX-Y.NYB -0.27 [weak] → **in charge: ^GSPC** (Demand (- = supply shock))
**Last 20 sessions decomposed (R² 0.47, n=60):** actual +13.6% = XLE +7.4% · HG=F -0.5% · DX-Y.NYB +0.2% · ^GSPC +0.0% · unexplained +6.4%
**Positioning (CFTC WTI-PHYSICAL, 2026-10-20, + = long WTI crude):** managed money +36,187 (+2% OI, 4w -65,641, 13th pct of 3y) · producers +359,568 (+20% OI, 4w +56,668, 94th pct of 3y)
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 11:00 ET United States: IBD/TIPP Economic Optimism · 11-04 09:15 ET United States: ADP Nonfarm Employment Change

### Gold  `GC=F`  4,016 (2026-10-30)
**Move:** 1w +0.2% · 4w -3.5% (41st pct of 2y 4w moves) · 13w -2.2% · 52w range position 4% (lo 3,960 / hi 5,318)
**Drivers (recent corr):** DFII10 (missing) · DX-Y.NYB -0.22 [weak] · SI=F +0.84 [textbook] · BTC-USD +0.33 [textbook] → **in charge: SI=F** (Precious block)
**Last 20 sessions decomposed (R² 0.71, n=60):** actual -3.6% = SI=F -5.8% · BTC-USD -0.6% · DX-Y.NYB +0.1% · unexplained +2.7%
**Positioning (CFTC GOLD, 2026-10-20, + = long Gold):** managed money +104,206 (+26% OI, 4w -23,183, 25th pct of 3y) · producers -14,783 (-4% OI, 4w +11,994, 99th pct of 3y)
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 11:00 ET United States: IBD/TIPP Economic Optimism · 11-04 09:15 ET United States: ADP Nonfarm Employment Change

### Silver  `SI=F`  51.59 (2026-10-30)
**Move:** 1w -3.9% · 4w -14.0% (78th pct of 2y 4w moves) · 13w -10.4% · 52w range position 7% (lo 47.13 / hi 115.1)
**Drivers (recent corr):** GC=F +0.84 [textbook] · HG=F +0.53 [textbook] → **in charge: GC=F** (Gold)
**Last 20 sessions decomposed (R² 0.73, n=60):** actual -15.1% = GC=F -4.6% · HG=F +0.6% · unexplained -11.1%
**Positioning (CFTC SILVER, 2026-10-20, + = long Silver):** managed money +3,505 (+3% OI, 4w -9,804, 4th pct of 3y) · producers -15,029 (-13% OI, 4w +3,483, 94th pct of 3y)
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 11:00 ET United States: IBD/TIPP Economic Optimism · 11-04 09:15 ET United States: ADP Nonfarm Employment Change

### Copper  `HG=F`  6.572 (2026-10-30)
**Move:** 1w +1.5% · 4w +1.2% (13th pct of 2y 4w moves) · 13w +2.1% · 52w range position 88% (lo 4.926 / hi 6.804)
**Drivers (recent corr):** ^GSPC +0.51 [textbook] → **in charge: ^GSPC** (Global growth)
**Last 20 sessions decomposed (R² 0.20, n=60):** actual +1.2% = ^GSPC -0.0% · unexplained +1.3%
**Positioning (CFTC COPPER- #1, 2026-10-20, + = long Copper):** managed money +47,690 (+15% OI, 4w -34,832, 63rd pct of 3y) · producers -77,406 (-24% OI, 4w +35,169, 39th pct of 3y)
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 11:00 ET United States: IBD/TIPP Economic Optimism · 11-04 09:15 ET United States: ADP Nonfarm Employment Change

### Nat gas (US)  `NG=F`  2.901 (2026-10-30)
**Move:** 1w +9.9% · 4w -4.4% (22nd pct of 2y 4w moves) · 13w +5.6% · 52w range position 8% (lo 2.523 / hi 7.46)
**Drivers (recent corr):** CL=F +0.01 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.01, n=60):** actual -4.5% = CL=F +1.4% · unexplained -5.9%
**Positioning (CFTC NAT GAS NYME, 2026-10-20, + = long Nat gas (US)):** managed money -157,409 (-9% OI, 4w -91,862, 1st pct of 3y) · producers -13,154 (-1% OI, 4w +10,566, 78th pct of 3y)
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 11:00 ET United States: IBD/TIPP Economic Optimism · 11-04 09:15 ET United States: ADP Nonfarm Employment Change


## 9. Crypto

### Bitcoin  `BTC-USD`  76,450 (2026-10-30)
**Move:** 1w -5.7% · 4w -9.5% (63rd pct of 2y 4w moves) · 13w +21.7% · 52w range position 35% (lo 58,559 / hi 109,556)
**Drivers (recent corr):** ^NDX +0.43 [textbook] · DX-Y.NYB -0.19 [weak] · GC=F +0.33 [textbook] → **in charge: ^NDX** (Tech / speculation)
**Last 20 sessions decomposed (R² 0.34, n=60):** actual -10.0% = ^NDX -3.0% · GC=F -2.8% · DX-Y.NYB +0.2% · unexplained -4.5%
**Positioning (CFTC BITCOIN, 2026-10-20, + = long Bitcoin):** lev funds -4,942 (-23% OI, 4w +3,011, 100th pct of 3y) · asset mgrs +2,999 (+14% OI, 4w -172, 9th pct of 3y)
**This week:** 11-02 11:00 ET United States: ISM Manufacturing Employment · 11-02 11:00 ET United States: ISM Manufacturing New Orders Index · 11-02 11:00 ET United States: ISM Manufacturing PMI · 11-02 11:00 ET United States: ISM Manufacturing Prices · 11-03 11:00 ET United States: IBD/TIPP Economic Optimism · 11-04 09:15 ET United States: ADP Nonfarm Employment Change

