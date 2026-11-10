# Market Review Data Pack: 2026-11-10

Fetched 2026-11-10T04:18:39+00:00. Descriptive numbers for the weekly review (read with `education/market_reviews/PLAYBOOK.md`). Correlations are of daily moves: last 20 sessions vs the 60 before. They are noisy; a flip is a question, not a signal.

**Data notes:** fred DGS2: The read operation timed out · fred DFII10: The read operation timed out · fred T10YIE: The read operation timed out · fred BAMLH0A0HYM2: The read operation timed out · fred BAMLC0A0CM: The read operation timed out · FRED DGS2 missing: US 2y = US 5y stand-in for this run · No local OAT/Bund futures: French spread proxy unavailable

## 1. Regime gauges: which story is the market trading?

| Pair | Recent | Before | Textbook sign | Status | What it means |
|---|---|---|---|---|---|
| CL=F vs US10Y | -0.17 | +0.22 | + | weak | Oil vs yields: + = oil is an inflation story; - = oil is a growth tax (2008-style) |
| ^NDX vs US10Y | +0.52 | -0.26 | − | INVERTED | Stocks vs yields: - = rates drive stocks; + = growth scare, bonds hedge stocks |
| HYG_TLT vs ^NDX | +0.59 | -0.13 | + | textbook | Credit vs tech: high + = credit and equities are one trade (credit stress leading) |
| DX-Y.NYB vs ^GSPC | -0.18 | +0.05 | − | weak | Dollar vs stocks: - = safe-haven dollar; ~0/+ = "sell America" or liquidity dash |
| AUDUSD=X vs ^NDX | +0.50 | +0.44 | + | textbook | Aussie vs tech: near 0 = AUD trading commodities not risk |
| BTC-USD vs ^NDX | +0.70 | +0.35 | + | textbook | Bitcoin vs tech: high = one liquidity complex |
| XLE vs CL=F | +0.32 | +0.36 | + | textbook | Energy stocks vs oil: falling = equity investors fade the oil move |
| USDJPY=X vs US10Y | +0.64 | +0.23 | + | textbook | Yen vs yields: high = yen is a pure rates trade |

Equity vol vs bond vol: VIX 19.9 (1y pct 80) · MOVE 86 (1y pct 83). When bond vol leads equity vol, the stress is in rates/credit first.

**Fed funds futures (implied average rate by contract month; vs ~1 week earlier):** V6 3.882% (-0.002) · X6 3.877% (+0.000) · Z6 4.015% (+0.010) · F7 4.080% (+0.015) · G7 4.120% (+0.010) · H7 4.165% (+0.000) · J7 4.225% (-0.015) · K7 4.260% (-0.025) · M7 4.305% (-0.035) · N7 4.320% (-0.045) · Q7 4.335% (-0.040) · U7 4.345% (-0.035) · V7 4.345% (-0.045) (as of 2026-10-26)

## 2. G10 FX

### EURUSD  `EURUSD=X`  1.123 (2026-11-10)
**Move:** 1w +0.2% · 4w +0.2% (7th pct of 2y 4w moves) · 13w -2.8% · 52w range position 11% (lo 1.113 / hi 1.202)
**Drivers (recent corr):** US_EA2 +0.08 [weak] · US_DE10 +0.13 [weak] · FR_DE (missing) · ^STOXX50E +0.04 [weak] · BZ=F -0.13 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.05, n=60):** actual +0.2% = US_EA2 +0.2% · ^STOXX50E +0.1% · BZ=F +0.0% · US_DE10 -0.0% · unexplained -0.1%
**Positioning (CFTC EURO FX, 2026-11-03, + = long EURUSD):** lev funds -78,559 (-9% OI, 4w -34,298, 1st pct of 3y) · asset mgrs +144,925 (+17% OI, 4w -44,956, 1st pct of 3y)
**This week:** 11-12 14:00 ET United States: Federal Budget Balance · 11-13 03:00 ET Spain: Core CPI (cons 3.1%, prev 3.1%) · 11-13 05:00 ET Euro Zone: Employment Change (cons 0.2%, prev 0.1%) · 11-13 05:00 ET Euro Zone: GDP (cons 0.4%, prev 0.4%) · 11-17 08:30 ET United States: Core Retail Sales · 11-17 08:30 ET United States: Retail Sales

### USDJPY  `USDJPY=X`  158 (2026-11-10)
**Move:** 1w -0.3% · 4w -0.2% (8th pct of 2y 4w moves) · 13w -0.8% · 52w range position 48% (lo 152.5 / hi 163.9)
**Drivers (recent corr):** US10Y +0.64 [textbook] · US_JP10 +0.52 [textbook] · ^NDX +0.64 [textbook] · ^VIX -0.51 [textbook, was INVERTED] → **in charge: US10Y** (US yields: the carry engine)
**Last 20 sessions decomposed (R² 0.14, n=60):** actual -0.2% = US10Y -1.4% · ^NDX -0.6% · ^VIX +0.1% · US_JP10 +0.1% · unexplained +1.6%
**Positioning (CFTC JAPANESE YEN, 2026-11-03, + = long USDJPY):** lev funds +14,817 (+4% OI, 4w -10,226, 24th pct of 3y) · asset mgrs -79,387 (-21% OI, 4w -11,592, 15th pct of 3y)
**This week:** 11-12 14:00 ET United States: Federal Budget Balance · 11-15 18:50 ET Japan: GDP (cons 0.1%, prev 0.4%) · 11-15 18:50 ET Japan: GDP Capital Expenditure (cons 1.5%, prev -0.9%) · 11-15 18:50 ET Japan: GDP External Demand (cons -0.4%, prev 0.5%) · 11-15 18:50 ET Japan: GDP Price Index · 11-15 18:50 ET Japan: GDP Private Consumption (cons -0.2%, prev 0.0%)

### GBPUSD  `GBPUSD=X`  1.344 (2026-11-10)
**Move:** 1w +0.1% · 4w +1.4% (56th pct of 2y 4w moves) · 13w -0.5% · 52w range position 50% (lo 1.306 / hi 1.383)
**Drivers (recent corr):** US_GB10 +0.09 [weak] · GB10Y -0.25 [weak] · ^GSPC +0.20 [weak] · EURUSD=X +0.85 [textbook] → **in charge: EURUSD=X** (European block move)
**Last 20 sessions decomposed (R² 0.67, n=60):** actual +1.4% = GB10Y +0.2% · EURUSD=X +0.2% · ^GSPC -0.1% · US_GB10 +0.0% · unexplained +1.1%
**Positioning (CFTC BRITISH POUND, 2026-11-03, + = long GBPUSD):** lev funds +26,663 (+11% OI, 4w +14,231, 33rd pct of 3y) · asset mgrs -121,163 (-49% OI, 4w +24,279, 9th pct of 3y)
**This week:** 11-12 02:00 ET United Kingdom: GDP (cons 0.7%, prev 0.5%) · 11-12 02:00 ET United Kingdom: Monthly GDP 3M/3M Change · 11-12 07:00 ET United Kingdom: NIESR Monthly GDP Tracker · 11-12 14:00 ET United States: Federal Budget Balance · 11-17 02:00 ET United Kingdom: Employment Change 3M/3M · 11-17 02:00 ET United Kingdom: Unemployment Rate

### USDCAD  `USDCAD=X`  1.412 (2026-11-10)
**Move:** 1w +0.8% · 4w -0.7% (31st pct of 2y 4w moves) · 13w +1.4% · 52w range position 80% (lo 1.349 / hi 1.428)
**Drivers (recent corr):** CL=F -0.07 [weak] · US_CA2 +0.38 [textbook] · ^GSPC -0.02 [weak] → **in charge: US_CA2** (US-Canada 2y rate gap)
**Last 20 sessions decomposed (R² 0.23, n=60):** actual -0.7% = US_CA2 -0.9% · ^GSPC +0.2% · CL=F +0.0% · unexplained -0.0%
**Positioning (CFTC CANADIAN DOLLAR, 2026-11-03, + = long USDCAD):** lev funds +86,302 (+25% OI, 4w +6,677, 87th pct of 3y) · asset mgrs -16,453 (-5% OI, 4w -52,259, 8th pct of 3y)
**This week:** 11-12 14:00 ET United States: Federal Budget Balance · 11-16 08:30 ET Canada: Core CPI · 11-16 08:30 ET Canada: CPI · 11-17 08:30 ET United States: Core Retail Sales · 11-17 08:30 ET United States: Retail Sales · 11-17 08:30 ET United States: Retail Sales Ex Gas/Autos

### AUDUSD  `AUDUSD=X`  0.6919 (2026-11-10)
**Move:** 1w -0.7% · 4w -0.9% (37th pct of 2y 4w moves) · 13w -2.0% · 52w range position 58% (lo 0.6449 / hi 0.7255)
**Drivers (recent corr):** HG=F +0.20 [weak] · ^NDX +0.50 [textbook] · GC=F -0.03 [weak] → **in charge: ^NDX** (Global risk proxy)
**Last 20 sessions decomposed (R² 0.17, n=60):** actual -0.9% = ^NDX -1.0% · HG=F -0.1% · GC=F -0.0% · unexplained +0.1%
**Positioning (CFTC AUSTRALIAN DOLLAR, 2026-11-03, + = long AUDUSD):** lev funds +50,106 (+15% OI, 4w -4,027, 88th pct of 3y) · asset mgrs -130,780 (-40% OI, 4w -29,352, 1st pct of 3y)
**This week:** 11-12 14:00 ET United States: Federal Budget Balance · 11-17 08:30 ET United States: Core Retail Sales · 11-17 08:30 ET United States: Retail Sales · 11-17 08:30 ET United States: Retail Sales Ex Gas/Autos

### NZDUSD  `NZDUSD=X`  0.5634 (2026-11-10)
**Move:** 1w +0.7% · 4w +0.4% (15th pct of 2y 4w moves) · 13w -4.2% · 52w range position 10% (lo 0.5587 / hi 0.6076)
**Drivers (recent corr):** AUDUSD=X +0.41 [textbook] · ^GSPC +0.52 [textbook] · US2Y +0.15 [weak] → **in charge: ^GSPC** (Global risk proxy)
**Last 20 sessions decomposed (R² 0.37, n=60):** actual +0.4% = AUDUSD=X -0.5% · US2Y +0.4% · ^GSPC -0.2% · unexplained +0.7%
**Positioning (CFTC NZ DOLLAR, 2026-11-03, + = long NZDUSD):** lev funds -23,154 (-17% OI, 4w -22,367, 7th pct of 3y) · asset mgrs -46,700 (-35% OI, 4w -14,166, 11th pct of 3y)
**This week:** 11-11 16:45 ET New Zealand: Electronic Card Retail Sales · 11-12 14:00 ET United States: Federal Budget Balance · 11-17 08:30 ET United States: Core Retail Sales · 11-17 08:30 ET United States: Retail Sales · 11-17 08:30 ET United States: Retail Sales Ex Gas/Autos

### USDCHF  `USDCHF=X`  0.8194 (2026-11-10)
**Move:** 1w +0.0% · 4w -1.6% (60th pct of 2y 4w moves) · 13w +1.0% · 52w range position 78% (lo 0.7632 / hi 0.8357)
**Drivers (recent corr):** US10Y +0.49 [textbook] · ^VIX -0.24 [weak] · GC=F +0.21 [weak] → **in charge: US10Y** (US yields)
**Last 20 sessions decomposed (R² 0.28, n=60):** actual -1.6% = US10Y -1.5% · ^VIX +0.1% · GC=F +0.0% · unexplained -0.2%
**Positioning (CFTC SWISS FRANC, 2026-11-03, + = long USDCHF):** lev funds +16,845 (+13% OI, 4w +5,495, 95th pct of 3y) · asset mgrs +20,853 (+16% OI, 4w -16,526, 18th pct of 3y)
**This week:** 11-12 14:00 ET United States: Federal Budget Balance · 11-17 08:30 ET United States: Core Retail Sales · 11-17 08:30 ET United States: Retail Sales · 11-17 08:30 ET United States: Retail Sales Ex Gas/Autos


## 3. G10 crosses

### AUDNZD  `AUDNZD=X`  1.228 (2026-11-10)
**Move:** 1w -1.4% · 4w -1.3% (66th pct of 2y 4w moves) · 13w +2.2% · 52w range position 77% (lo 1.141 / hi 1.254)
**Drivers (recent corr):** HG=F -0.05 [weak] · ^AXJO -0.17 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.08, n=60):** actual -1.3% = ^AXJO -0.6% · HG=F -0.1% · unexplained -0.6%
**This week:** 11-11 16:45 ET New Zealand: Electronic Card Retail Sales

### EURGBP  `EURGBP=X`  0.8347 (2026-11-10)
**Move:** 1w +0.1% · 4w -1.2% (74th pct of 2y 4w moves) · 13w -2.3% · 52w range position 2% (lo 0.8336 / hi 0.8842)
**Drivers (recent corr):** GB10Y +0.16 [weak] · FR_DE (missing) → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual -1.2% = GB10Y +0.0% · unexplained -1.2%
**This week:** 11-12 02:00 ET United Kingdom: GDP (cons 0.7%, prev 0.5%) · 11-12 02:00 ET United Kingdom: Monthly GDP 3M/3M Change · 11-12 07:00 ET United Kingdom: NIESR Monthly GDP Tracker · 11-13 03:00 ET Spain: Core CPI (cons 3.1%, prev 3.1%) · 11-13 05:00 ET Euro Zone: Employment Change (cons 0.2%, prev 0.1%) · 11-13 05:00 ET Euro Zone: GDP (cons 0.4%, prev 0.4%)

### EURCHF  `EURCHF=X`  0.9196 (2026-11-10)
**Move:** 1w +0.1% · 4w -1.4% (83rd pct of 2y 4w moves) · 13w -1.8% · 52w range position 39% (lo 0.9023 / hi 0.9466)
**Drivers (recent corr):** ^STOXX50E +0.30 [weak] · FR_DE (missing) · ^VIX -0.37 [textbook] → **in charge: ^VIX** (Haven flows)
**Last 20 sessions decomposed (R² 0.03, n=60):** actual -1.4% = ^STOXX50E +0.1% · ^VIX -0.0% · unexplained -1.5%
**This week:** 11-13 03:00 ET Spain: Core CPI (cons 3.1%, prev 3.1%) · 11-13 05:00 ET Euro Zone: Employment Change (cons 0.2%, prev 0.1%) · 11-13 05:00 ET Euro Zone: GDP (cons 0.4%, prev 0.4%)


## 4. EM FX

### USDMXN  `USDMXN=X`  18.52 (2026-11-10)
**Move:** 1w -1.6% · 4w +0.8% (27th pct of 2y 4w moves) · 13w +8.5% · 52w range position 83% (lo 16.89 / hi 18.85)
**Drivers (recent corr):** ^VIX +0.40 [textbook] · ^GSPC -0.39 [textbook] · CL=F +0.76 [INVERTED] · USDBRL=X -0.18 [weak] → **in charge: CL=F** (Oil)
**Last 20 sessions decomposed (R² 0.22, n=60):** actual +0.8% = USDBRL=X +0.7% · CL=F -0.6% · ^GSPC +0.3% · ^VIX +0.2% · unexplained +0.1%
**Positioning (CFTC MEXICAN PESO, 2026-11-03, + = long USDMXN):** lev funds -71,381 (-25% OI, 4w +3,546, 6th pct of 3y) · asset mgrs +36,349 (+13% OI, 4w +15,750, 100th pct of 3y)
**This week:** 11-12 14:00 ET United States: Federal Budget Balance · 11-17 08:30 ET United States: Core Retail Sales · 11-17 08:30 ET United States: Retail Sales · 11-17 08:30 ET United States: Retail Sales Ex Gas/Autos

### USDBRL  `USDBRL=X`  5.509 (2026-11-10)
**Move:** 1w +0.4% · 4w +9.6% (99th pct of 2y 4w moves) · 13w +6.5% · 52w range position 88% (lo 4.906 / hi 5.59)
**Drivers (recent corr):** ^VIX +0.08 [weak] · HG=F +0.29 [weak] · EWZ -0.95 [textbook] → **in charge: EWZ** (Brazil equities (local flows))
**Last 20 sessions decomposed (R² 0.86, n=60):** actual +9.2% = EWZ +7.9% · HG=F +0.1% · ^VIX +0.1% · unexplained +1.1%
**Positioning (CFTC BRAZILIAN REAL, 2026-11-03, + = long USDBRL):** lev funds -38,613 (-22% OI, 4w -11,217, 1st pct of 3y) · asset mgrs -49,879 (-29% OI, 4w +6,731, 48th pct of 3y)
**This week:** 11-12 07:00 ET Brazil: CPI · 11-12 14:00 ET United States: Federal Budget Balance · 11-13 07:00 ET Brazil: Retail Sales · 11-17 08:30 ET United States: Core Retail Sales · 11-17 08:30 ET United States: Retail Sales · 11-17 08:30 ET United States: Retail Sales Ex Gas/Autos

### USDZAR  `USDZAR=X`  16.36 (2026-11-10)
**Move:** 1w -1.4% · 4w -0.8% (24th pct of 2y 4w moves) · 13w +1.1% · 52w range position 41% (lo 15.71 / hi 17.29)
**Drivers (recent corr):** GC=F -0.14 [weak] · ^VIX +0.57 [textbook] · HG=F -0.05 [weak] → **in charge: ^VIX** (Carry / risk)
**Last 20 sessions decomposed (R² 0.19, n=60):** actual -0.8% = ^VIX +0.5% · HG=F -0.2% · GC=F -0.0% · unexplained -1.1%
**Positioning (CFTC SO AFRICAN RAND, 2026-11-03, + = long USDZAR):** lev funds -6,317 (-17% OI, 4w -1,908, 17th pct of 3y) · asset mgrs -14,523 (-40% OI, 4w +3,361, 33rd pct of 3y)
**This week:** 11-12 14:00 ET United States: Federal Budget Balance · 11-17 08:30 ET United States: Core Retail Sales · 11-17 08:30 ET United States: Retail Sales · 11-17 08:30 ET United States: Retail Sales Ex Gas/Autos

### USDKRW  `USDKRW=X`  1,344 (2026-11-10)
**Move:** 1w +0.1% · 4w +0.3% (12th pct of 2y 4w moves) · 13w -4.8% · 52w range position 9% (lo 1,324 / hi 1,552)
**Drivers (recent corr):** ^KS11 +0.08 [weak] · SOXX -0.48 [textbook] · DX-Y.NYB +0.17 [weak] → **in charge: SOXX** (Global semis cycle)
**Last 20 sessions decomposed (R² 0.14, n=60):** actual +0.3% = SOXX +1.3% · ^KS11 -1.0% · DX-Y.NYB -0.4% · unexplained +0.3%
**This week:** 11-12 14:00 ET United States: Federal Budget Balance · 11-17 08:30 ET United States: Core Retail Sales · 11-17 08:30 ET United States: Retail Sales · 11-17 08:30 ET United States: Retail Sales Ex Gas/Autos


## 5. CE3 FX

### EURCZK  `EURCZK=X`  24.29 (2026-11-10)
**Move:** 1w -0.2% · 4w -0.2% (34th pct of 2y 4w moves) · 13w +0.2% · 52w range position 47% (lo 24.07 / hi 24.53)
**Drivers (recent corr):** ^STOXX50E -0.39 [textbook] · EURPLN=X +0.68 [textbook] → **in charge: EURPLN=X** (CE3 block)
**Last 20 sessions decomposed (R² 0.32, n=60):** actual -0.2% = EURPLN=X +0.1% · ^STOXX50E -0.0% · unexplained -0.3%
**This week:** 11-13 03:00 ET Spain: Core CPI (cons 3.1%, prev 3.1%) · 11-13 05:00 ET Euro Zone: Employment Change (cons 0.2%, prev 0.1%) · 11-13 05:00 ET Euro Zone: GDP (cons 0.4%, prev 0.4%)

### EURPLN  `EURPLN=X`  4.385 (2026-11-10)
**Move:** 1w -0.5% · 4w +0.4% (40th pct of 2y 4w moves) · 13w +2.0% · 52w range position 87% (lo 4.197 / hi 4.412)
**Drivers (recent corr):** ^STOXX50E -0.45 [textbook] · ^VIX +0.54 [textbook] → **in charge: ^VIX** (Risk)
**Last 20 sessions decomposed (R² 0.21, n=60):** actual +0.4% = ^VIX +0.2% · ^STOXX50E -0.1% · unexplained +0.3%
**This week:** 11-13 03:00 ET Spain: Core CPI (cons 3.1%, prev 3.1%) · 11-13 05:00 ET Euro Zone: Employment Change (cons 0.2%, prev 0.1%) · 11-13 05:00 ET Euro Zone: GDP (cons 0.4%, prev 0.4%)


## 6. Equities

### S&P 500  `^GSPC`  7,550 (2026-11-10)
**Move:** 1w -0.3% · 4w -3.3% (68th pct of 2y 4w moves) · 13w -2.3% · 52w range position 82% (lo 6,344 / hi 7,819)
**Drivers (recent corr):** US10Y +0.34 [INVERTED, was textbook] · HYG_TLT +0.43 [textbook] · DX-Y.NYB -0.18 [weak] · CL=F -0.46 [textbook] · ^VIX -0.97 [textbook] → **in charge: ^VIX** (Vol)
**Last 20 sessions decomposed (R² 0.86, n=60):** actual -3.3% = ^VIX -1.8% · US10Y +1.2% · HYG_TLT -1.1% · CL=F +0.3% · DX-Y.NYB -0.0% · unexplained -1.8%
**Positioning (CFTC E-MINI S&P 500, 2026-11-03, + = long S&P 500):** lev funds -372,318 (-19% OI, 4w +42,769, 36th pct of 3y) · asset mgrs +928,584 (+47% OI, 4w +21,969, 48th pct of 3y)
**This week:** 11-12 14:00 ET United States: Federal Budget Balance · 11-17 08:30 ET United States: Core Retail Sales · 11-17 08:30 ET United States: Retail Sales · 11-17 08:30 ET United States: Retail Sales Ex Gas/Autos

### Nasdaq 100  `^NDX`  27,908 (2026-11-10)
**Move:** 1w -1.0% · 4w -8.7% (86th pct of 2y 4w moves) · 13w -5.5% · 52w range position 60% (lo 22,953 / hi 31,224)
**Drivers (recent corr):** US10Y +0.52 [INVERTED] · SOXX +0.96 [textbook] · HYG_TLT +0.59 [textbook] · BTC-USD +0.70 [textbook] → **in charge: SOXX** (Semis / AI capex)
**Last 20 sessions decomposed (R² 0.88, n=60):** actual -9.1% = SOXX -8.1% · US10Y +1.7% · HYG_TLT -1.3% · BTC-USD -1.2% · unexplained -0.2%
**Positioning (CFTC NASDAQ MINI, 2026-11-03, + = long Nasdaq 100):** lev funds +10,073 (+3% OI, 4w +29,285, 97th pct of 3y) · asset mgrs +73,137 (+25% OI, 4w -661, 45th pct of 3y)
**This week:** 11-12 14:00 ET United States: Federal Budget Balance · 11-17 08:30 ET United States: Core Retail Sales · 11-17 08:30 ET United States: Retail Sales · 11-17 08:30 ET United States: Retail Sales Ex Gas/Autos

### Russell 2000  `^RUT`  2,841 (2026-11-10)
**Move:** 1w +1.0% · 4w +2.1% (28th pct of 2y 4w moves) · 13w -6.2% · 52w range position 70% (lo 2,305 / hi 3,068)
**Drivers (recent corr):** US2Y +0.21 [weak] · HYG_TLT +0.24 [weak] · ^GSPC +0.92 [textbook] → **in charge: ^GSPC** (Beta)
**Last 20 sessions decomposed (R² 0.76, n=60):** actual +2.0% = ^GSPC -3.5% · US2Y +1.2% · HYG_TLT +0.5% · unexplained +3.9%
**This week:** 11-12 14:00 ET United States: Federal Budget Balance · 11-17 08:30 ET United States: Core Retail Sales · 11-17 08:30 ET United States: Retail Sales · 11-17 08:30 ET United States: Retail Sales Ex Gas/Autos

### Euro Stoxx 50  `^STOXX50E`  6,290 (2026-11-10)
**Move:** 1w +2.4% · 4w +2.0% (39th pct of 2y 4w moves) · 13w -4.0% · 52w range position 75% (lo 5,501 / hi 6,551)
**Drivers (recent corr):** FR_DE (missing) · ^GSPC +0.52 [textbook] · BZ=F -0.50 [textbook] · EURUSD=X +0.04 [weak] → **in charge: ^GSPC** (US lead)
**Last 20 sessions decomposed (R² 0.32, n=60):** actual +2.0% = BZ=F +1.2% · ^GSPC -1.1% · EURUSD=X +0.0% · unexplained +1.9%
**This week:** 11-13 03:00 ET Spain: Core CPI (cons 3.1%, prev 3.1%) · 11-13 05:00 ET Euro Zone: Employment Change (cons 0.2%, prev 0.1%) · 11-13 05:00 ET Euro Zone: GDP (cons 0.4%, prev 0.4%)

### CAC 40  `^FCHI`  8,233 (2026-11-10)
**Move:** 1w +2.7% · 4w +5.2% (83rd pct of 2y 4w moves) · 13w -5.5% · 52w range position 54% (lo 7,666 / hi 8,726)
**Drivers (recent corr):** FR_DE (missing) · ^STOXX50E +0.88 [textbook] → **in charge: ^STOXX50E** (European block)
**Last 20 sessions decomposed (R² 0.78, n=60):** actual +5.1% = ^STOXX50E +1.6% · unexplained +3.4%
**This week:** 11-13 03:00 ET Spain: Core CPI (cons 3.1%, prev 3.1%) · 11-13 05:00 ET Euro Zone: Employment Change (cons 0.2%, prev 0.1%) · 11-13 05:00 ET Euro Zone: GDP (cons 0.4%, prev 0.4%)

### DAX  `^GDAXI`  26,267 (2026-11-10)
**Move:** 1w +1.6% · 4w +4.0% (69th pct of 2y 4w moves) · 13w -0.5% · 52w range position 93% (lo 22,301 / hi 26,570)
**Drivers (recent corr):** DE10Y +0.40 [INVERTED, was textbook] · ^GSPC +0.43 [textbook] → **in charge: ^GSPC** (Global risk)
**Last 20 sessions decomposed (R² 0.23, n=60):** actual +3.9% = ^GSPC -1.4% · DE10Y +0.5% · unexplained +4.9%
**This week:** 11-13 03:00 ET Spain: Core CPI (cons 3.1%, prev 3.1%) · 11-13 05:00 ET Euro Zone: Employment Change (cons 0.2%, prev 0.1%) · 11-13 05:00 ET Euro Zone: GDP (cons 0.4%, prev 0.4%)

### FTSE 100  `^FTSE`  10,783 (2026-11-10)
**Move:** 1w +1.4% · 4w +1.2% (32nd pct of 2y 4w moves) · 13w -0.6% · 52w range position 91% (lo 9,507 / hi 10,911)
**Drivers (recent corr):** BZ=F -0.39 [INVERTED] · GBPUSD=X +0.04 [weak] · GB10Y -0.64 [textbook] → **in charge: GB10Y** (Gilts)
**Last 20 sessions decomposed (R² 0.39, n=60):** actual +1.2% = GB10Y +2.2% · BZ=F +0.5% · GBPUSD=X -0.0% · unexplained -1.5%
**This week:** 11-12 02:00 ET United Kingdom: GDP (cons 0.7%, prev 0.5%) · 11-12 02:00 ET United Kingdom: Monthly GDP 3M/3M Change · 11-12 07:00 ET United Kingdom: NIESR Monthly GDP Tracker · 11-17 02:00 ET United Kingdom: Employment Change 3M/3M · 11-17 02:00 ET United Kingdom: Unemployment Rate

### Nikkei 225  `^N225`  60,113 (2026-11-10)
**Move:** 1w -4.7% · 4w -11.3% (92nd pct of 2y 4w moves) · 13w -10.2% · 52w range position 49% (lo 48,538 / hi 72,366)
**Drivers (recent corr):** USDJPY=X +0.43 [textbook] · ^NDX +0.62 [textbook] · SOXX +0.63 [textbook] → **in charge: SOXX** (Chips (prior US day))
**Last 20 sessions decomposed (R² 0.33, n=60):** actual -12.0% = SOXX -3.8% · ^NDX -2.7% · USDJPY=X +0.1% · unexplained -5.6%
**This week:** 11-15 18:50 ET Japan: GDP (cons 0.1%, prev 0.4%) · 11-15 18:50 ET Japan: GDP Capital Expenditure (cons 1.5%, prev -0.9%) · 11-15 18:50 ET Japan: GDP External Demand (cons -0.4%, prev 0.5%) · 11-15 18:50 ET Japan: GDP Price Index · 11-15 18:50 ET Japan: GDP Private Consumption (cons -0.2%, prev 0.0%)

### KOSPI  `^KS11`  5,210 (2026-11-10)
**Move:** 1w -7.8% · 4w -13.7% (76th pct of 2y 4w moves) · 13w -17.9% · 52w range position 26% (lo 3,846 / hi 9,115)
**Drivers (recent corr):** SOXX +0.43 [textbook] · ^NDX +0.35 [textbook] → **in charge: SOXX** (Memory / AI hardware (prior US day))
**Last 20 sessions decomposed (R² 0.20, n=60):** actual -14.7% = SOXX -14.5% · ^NDX +7.5% · unexplained -7.8%

### Hang Seng  `^HSI`  24,519 (2026-11-10)
**Move:** 1w +4.2% · 4w +0.7% (12th pct of 2y 4w moves) · 13w -4.4% · 52w range position 35% (lo 22,672 / hi 27,968)
**Drivers (recent corr):** ^NDX +0.07 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual +0.7% = ^NDX -0.4% · unexplained +1.1%
**This week:** 11-13 03:30 ET Hong Kong: GDP (cons 1.9%, prev 1.9%) · 11-15 21:00 ET China: Retail Sales · 11-15 21:00 ET China: Chinese Retail Sales YTD  · 11-15 21:00 ET China: Chinese Unemployment Rate · 11-17 03:30 ET Hong Kong: Unemployment Rate

### ASX 200  `^AXJO`  9,149 (2026-11-10)
**Move:** 1w +3.0% · 4w +4.2% (85th pct of 2y 4w moves) · 13w -1.1% · 52w range position 86% (lo 8,366 / hi 9,272)
**Drivers (recent corr):** HG=F +0.47 [textbook] · ^GSPC +0.52 [textbook] → **in charge: ^GSPC** (US lead (prior US day))
**Last 20 sessions decomposed (R² 0.24, n=60):** actual +4.1% = ^GSPC -0.8% · HG=F -0.8% · unexplained +5.6%


## 7. Rates

### US 2y  `US2Y`  4.66% (2026-11-10)
**Move:** 1w -8bp · 4w -35bp (91st pct of 2y 4w moves) · 13w +27bp · 52w range position 73% (lo 3.512 / hi 5.089)
**Drivers (recent corr):** CL=F -0.23 [weak] · ^GSPC +0.44 [textbook, was INVERTED] → **in charge: ^GSPC** (Risk-on = fewer cuts / more hikes)
**Last 20 sessions decomposed (R² 0.01, n=60):** actual -35bp = ^GSPC -3bp · CL=F -1bp · unexplained -32bp
**Positioning (CFTC UST 2Y NOTE, 2026-11-03, + = long US 2y):** lev funds +1,450,892 (+33% OI, 4w +193,408, 15th pct of 3y) · asset mgrs -1,876,612 (-42% OI, 4w -197,525, 59th pct of 3y)
**This week:** 11-12 14:00 ET United States: Federal Budget Balance · 11-17 08:30 ET United States: Core Retail Sales · 11-17 08:30 ET United States: Retail Sales · 11-17 08:30 ET United States: Retail Sales Ex Gas/Autos

### US 10y  `US10Y`  4.86% (2026-11-10)
**Move:** 1w -9bp · 4w -35bp (93rd pct of 2y 4w moves) · 13w +18bp · 52w range position 67% (lo 3.962 / hi 5.311)
**Drivers (recent corr):** CL=F -0.17 [weak] · ^NDX +0.52 [INVERTED] · T10YIE (missing) · DE10Y +0.31 [textbook] → **in charge: ^NDX** (Textbook: yields up hurt stocks; + means bonds hedge stocks)
**Last 20 sessions decomposed (R² 0.10, n=60):** actual -35bp = ^NDX -8bp · DE10Y -4bp · CL=F -1bp · unexplained -22bp
**Positioning (CFTC UST 10Y NOTE, 2026-11-03, + = long US 10y):** lev funds +2,262,310 (+38% OI, 4w +122,525, 86th pct of 3y) · asset mgrs -3,030,236 (-51% OI, 4w -202,097, 1st pct of 3y)
**This week:** 11-12 14:00 ET United States: Federal Budget Balance · 11-17 08:30 ET United States: Core Retail Sales · 11-17 08:30 ET United States: Retail Sales · 11-17 08:30 ET United States: Retail Sales Ex Gas/Autos

### US 30y  `US30Y`  5.26% (2026-11-10)
**Move:** 1w -7bp · 4w -31bp (93rd pct of 2y 4w moves) · 13w +2bp · 52w range position 60% (lo 4.633 / hi 5.665)
**Drivers (recent corr):** US2Y +0.88 [textbook] · T10YIE (missing) → **in charge: US2Y** (Front end)
**Last 20 sessions decomposed (R² 0.67, n=60):** actual -31bp = US2Y -23bp · unexplained -8bp
**Positioning (CFTC UST BOND, 2026-11-03, + = long US 30y):** lev funds +166,257 (+9% OI, 4w -23,421, 3rd pct of 3y) · asset mgrs -415,379 (-22% OI, 4w -9,751, 90th pct of 3y)
**This week:** 11-12 14:00 ET United States: Federal Budget Balance · 11-17 08:30 ET United States: Core Retail Sales · 11-17 08:30 ET United States: Retail Sales · 11-17 08:30 ET United States: Retail Sales Ex Gas/Autos

### Bund 10y  `DE10Y`  3.30% (2026-11-10)
**Move:** 1w -5bp · 4w -16bp (68th pct of 2y 4w moves) · 13w +8bp · 52w range position 63% (lo 2.68 / hi 3.66)
**Drivers (recent corr):** US10Y +0.31 [textbook] · BZ=F -0.22 [weak] · FR_DE (missing) → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.04, n=60):** actual -16bp = US10Y -6bp · BZ=F -0bp · unexplained -10bp
**This week:** 11-13 03:00 ET Spain: Core CPI (cons 3.1%, prev 3.1%) · 11-13 05:00 ET Euro Zone: Employment Change (cons 0.2%, prev 0.1%) · 11-13 05:00 ET Euro Zone: GDP (cons 0.4%, prev 0.4%)

### Gilt 10y  `GB10Y`  5.13% (2026-11-10)
**Move:** 1w -10bp · 4w -30bp (89th pct of 2y 4w moves) · 13w +10bp · 52w range position 69% (lo 4.352 / hi 5.478)
**Drivers (recent corr):** US10Y +0.68 [textbook] · GBPUSD=X -0.25 [weak] → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.39, n=60):** actual -30bp = US10Y -20bp · GBPUSD=X -2bp · unexplained -7bp
**This week:** 11-12 02:00 ET United Kingdom: GDP (cons 0.7%, prev 0.5%) · 11-12 02:00 ET United Kingdom: Monthly GDP 3M/3M Change · 11-12 07:00 ET United Kingdom: NIESR Monthly GDP Tracker · 11-17 02:00 ET United Kingdom: Employment Change 3M/3M · 11-17 02:00 ET United Kingdom: Unemployment Rate

### JGB 10y  `JP10Y`  2.72% (2026-11-10)
**Move:** 1w -9bp · 4w -29bp (98th pct of 2y 4w moves) · 13w -9bp · 52w range position 73% (lo 1.7 / hi 3.111)
**Drivers (recent corr):** US10Y +0.57 [textbook] · USDJPY=X +0.71 [textbook] → **in charge: USDJPY=X** (Weak yen -> BoJ pressure)
**Last 20 sessions decomposed (R² 0.51, n=60):** actual -29bp = US10Y -13bp · USDJPY=X -1bp · unexplained -16bp
**This week:** 11-15 18:50 ET Japan: GDP (cons 0.1%, prev 0.4%) · 11-15 18:50 ET Japan: GDP Capital Expenditure (cons 1.5%, prev -0.9%) · 11-15 18:50 ET Japan: GDP External Demand (cons -0.4%, prev 0.5%) · 11-15 18:50 ET Japan: GDP Price Index · 11-15 18:50 ET Japan: GDP Private Consumption (cons -0.2%, prev 0.0%)

### Canada 10y  `CA10Y`  3.65% (2026-11-10)
**Move:** 1w -12bp · 4w -22bp (84th pct of 2y 4w moves) · 13w -5bp · 52w range position 61% (lo 3.12 / hi 3.99)
**Drivers (recent corr):** US10Y +0.84 [textbook] · CL=F +0.05 [weak] → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.66, n=60):** actual -22bp = US10Y -24bp · CL=F -2bp · unexplained +5bp
**This week:** 11-16 08:30 ET Canada: Core CPI · 11-16 08:30 ET Canada: CPI

### French spread (proxy)
_no data_


## 8. Commodities

### WTI crude  `CL=F`  85.97 (2026-11-10)
**Move:** 1w -10.5% · 4w -9.6% (72nd pct of 2y 4w moves) · 13w +3.2% · 52w range position 53% (lo 55.27 / hi 112.9)
**Drivers (recent corr):** XLE +0.32 [textbook] · ^GSPC -0.46 [INVERTED] · HG=F -0.43 [INVERTED] · DX-Y.NYB +0.14 [weak] → **in charge: ^GSPC** (Demand (- = supply shock))
**Last 20 sessions decomposed (R² 0.33, n=60):** actual -10.1% = XLE -4.6% · HG=F +3.3% · ^GSPC +2.8% · DX-Y.NYB +0.5% · unexplained -12.1%
**Positioning (CFTC WTI-PHYSICAL, 2026-11-03, + = long WTI crude):** managed money +21,728 (+1% OI, 4w -31,870, 10th pct of 3y) · producers +369,347 (+19% OI, 4w +34,337, 96th pct of 3y)
**This week:** 11-12 14:00 ET United States: Federal Budget Balance · 11-17 08:30 ET United States: Core Retail Sales · 11-17 08:30 ET United States: Retail Sales · 11-17 08:30 ET United States: Retail Sales Ex Gas/Autos

### Gold  `GC=F`  4,117 (2026-11-10)
**Move:** 1w +4.5% · 4w +0.2% (4th pct of 2y 4w moves) · 13w -7.8% · 52w range position 15% (lo 3,899 / hi 5,318)
**Drivers (recent corr):** DFII10 (missing) · DX-Y.NYB -0.22 [weak] · SI=F +0.92 [textbook] · BTC-USD +0.26 [weak] → **in charge: SI=F** (Precious block)
**Last 20 sessions decomposed (R² 0.76, n=60):** actual +0.2% = SI=F -2.2% · BTC-USD +0.4% · DX-Y.NYB +0.2% · unexplained +1.8%
**Positioning (CFTC GOLD, 2026-11-03, + = long Gold):** managed money +103,614 (+26% OI, 4w -7,373, 22nd pct of 3y) · producers -8,912 (-2% OI, 4w +10,589, 100th pct of 3y)
**This week:** 11-12 14:00 ET United States: Federal Budget Balance · 11-17 08:30 ET United States: Core Retail Sales · 11-17 08:30 ET United States: Retail Sales · 11-17 08:30 ET United States: Retail Sales Ex Gas/Autos

### Silver  `SI=F`  52.97 (2026-11-10)
**Move:** 1w +6.8% · 4w -4.6% (35th pct of 2y 4w moves) · 13w -19.2% · 52w range position 6% (lo 49.1 / hi 115.1)
**Drivers (recent corr):** GC=F +0.92 [textbook] · HG=F +0.53 [textbook] → **in charge: GC=F** (Gold)
**Last 20 sessions decomposed (R² 0.80, n=60):** actual -4.7% = HG=F -1.7% · GC=F +0.3% · unexplained -3.4%
**Positioning (CFTC SILVER, 2026-11-03, + = long Silver):** managed money +4,035 (+3% OI, 4w -3,493, 5th pct of 3y) · producers -13,145 (-11% OI, 4w +3,108, 97th pct of 3y)
**This week:** 11-12 14:00 ET United States: Federal Budget Balance · 11-17 08:30 ET United States: Core Retail Sales · 11-17 08:30 ET United States: Retail Sales · 11-17 08:30 ET United States: Retail Sales Ex Gas/Autos

### Copper  `HG=F`  6.339 (2026-11-10)
**Move:** 1w -0.6% · 4w -4.1% (45th pct of 2y 4w moves) · 13w -3.9% · 52w range position 75% (lo 4.959 / hi 6.804)
**Drivers (recent corr):** ^GSPC +0.35 [textbook] → **in charge: ^GSPC** (Global growth)
**Last 20 sessions decomposed (R² 0.06, n=60):** actual -4.2% = ^GSPC -1.3% · unexplained -2.9%
**Positioning (CFTC COPPER- #1, 2026-11-03, + = long Copper):** managed money +34,890 (+11% OI, 4w -26,244, 48th pct of 3y) · producers -55,218 (-17% OI, 4w +37,502, 53rd pct of 3y)
**This week:** 11-12 14:00 ET United States: Federal Budget Balance · 11-15 21:00 ET China: Retail Sales · 11-15 21:00 ET China: Chinese Retail Sales YTD  · 11-15 21:00 ET China: Chinese Unemployment Rate · 11-17 08:30 ET United States: Core Retail Sales · 11-17 08:30 ET United States: Retail Sales

### Nat gas (US)  `NG=F`  3.203 (2026-11-10)
**Move:** 1w +10.6% · 4w +0.2% (1st pct of 2y 4w moves) · 13w +14.2% · 52w range position 14% (lo 2.523 / hi 7.46)
**Drivers (recent corr):** CL=F -0.22 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual +0.2% = CL=F +0.5% · unexplained -0.3%
**Positioning (CFTC NAT GAS NYME, 2026-11-03, + = long Nat gas (US)):** managed money -225,359 (-13% OI, 4w -80,822, 1st pct of 3y) · producers -418 (-0% OI, 4w +7,811, 92nd pct of 3y)
**This week:** 11-12 14:00 ET United States: Federal Budget Balance · 11-17 08:30 ET United States: Core Retail Sales · 11-17 08:30 ET United States: Retail Sales · 11-17 08:30 ET United States: Retail Sales Ex Gas/Autos


## 9. Crypto

### Bitcoin  `BTC-USD`  74,530 (2026-11-10)
**Move:** 1w -3.6% · 4w -10.3% (69th pct of 2y 4w moves) · 13w +17.3% · 52w range position 36% (lo 58,559 / hi 102,997)
**Drivers (recent corr):** ^NDX +0.70 [textbook] · DX-Y.NYB -0.18 [weak] · GC=F +0.26 [weak] → **in charge: ^NDX** (Tech / speculation)
**Last 20 sessions decomposed (R² 0.26, n=60):** actual -10.9% = ^NDX -8.1% · DX-Y.NYB -0.1% · GC=F +0.0% · unexplained -2.8%
**Positioning (CFTC BITCOIN, 2026-11-03, + = long Bitcoin):** lev funds -2,591 (-15% OI, 4w +4,261, 100th pct of 3y) · asset mgrs +2,403 (+14% OI, 4w -1,129, 3rd pct of 3y)
**This week:** 11-12 14:00 ET United States: Federal Budget Balance · 11-17 08:30 ET United States: Core Retail Sales · 11-17 08:30 ET United States: Retail Sales · 11-17 08:30 ET United States: Retail Sales Ex Gas/Autos

