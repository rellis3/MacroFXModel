# Market Review Data Pack: 2026-11-14

Fetched 2026-11-14T02:40:33+00:00. Descriptive numbers for the weekly review (read with `education/market_reviews/PLAYBOOK.md`). Correlations are of daily moves: last 20 sessions vs the 60 before. They are noisy; a flip is a question, not a signal.

**Data notes:** fred DGS2: The read operation timed out · fred DFII10: The read operation timed out · fred T10YIE: The read operation timed out · fred BAMLH0A0HYM2: The read operation timed out · fred BAMLC0A0CM: The read operation timed out · FRED DGS2 missing: US 2y = US 5y stand-in for this run · No local OAT/Bund futures: French spread proxy unavailable

## 1. Regime gauges: which story is the market trading?

| Pair | Recent | Before | Textbook sign | Status | What it means |
|---|---|---|---|---|---|
| CL=F vs US10Y | +0.02 | +0.16 | + | weak | Oil vs yields: + = oil is an inflation story; - = oil is a growth tax (2008-style) |
| ^NDX vs US10Y | +0.45 | -0.19 | − | INVERTED | Stocks vs yields: - = rates drive stocks; + = growth scare, bonds hedge stocks |
| HYG_TLT vs ^NDX | +0.50 | -0.03 | + | textbook | Credit vs tech: high + = credit and equities are one trade (credit stress leading) |
| DX-Y.NYB vs ^GSPC | -0.15 | +0.11 | − | weak | Dollar vs stocks: - = safe-haven dollar; ~0/+ = "sell America" or liquidity dash |
| AUDUSD=X vs ^NDX | +0.48 | +0.39 | + | textbook | Aussie vs tech: near 0 = AUD trading commodities not risk |
| BTC-USD vs ^NDX | +0.64 | +0.35 | + | textbook | Bitcoin vs tech: high = one liquidity complex |
| XLE vs CL=F | +0.42 | +0.32 | + | textbook | Energy stocks vs oil: falling = equity investors fade the oil move |
| USDJPY=X vs US10Y | +0.66 | +0.20 | + | textbook | Yen vs yields: high = yen is a pure rates trade |

Equity vol vs bond vol: VIX 19.3 (1y pct 75) · MOVE 99 (1y pct 90). When bond vol leads equity vol, the stress is in rates/credit first.

## 2. G10 FX

### EURUSD  `EURUSD=X`  1.105 (2026-11-13)
**Move:** 1w -1.6% · 4w -1.5% (60th pct of 2y 4w moves) · 13w -4.2% · 52w range position 0% (lo 1.105 / hi 1.202)
**Drivers (recent corr):** US_EA2 -0.16 [weak] · US_DE10 -0.14 [weak] · FR_DE (missing) · ^STOXX50E -0.11 [weak] · BZ=F -0.25 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.06, n=60):** actual -1.5% = BZ=F +0.2% · ^STOXX50E +0.1% · US_EA2 -0.0% · US_DE10 +0.0% · unexplained -1.7%
**Positioning (CFTC EURO FX, 2026-11-03, + = long EURUSD):** lev funds -78,559 (-9% OI, 4w -34,298, 1st pct of 3y) · asset mgrs +144,925 (+17% OI, 4w -44,956, 1st pct of 3y)
**This week:** 11-17 08:30 ET United States: Core Retail Sales (cons 0.4%, prev 0.9%) · 11-17 08:30 ET United States: Retail Sales (cons 0.0%, prev 0.8%) · 11-17 08:30 ET United States: Retail Sales Ex Gas/Autos · 11-18 05:00 ET Euro Zone: Core CPI (cons 2.5%, prev 2.5%) · 11-18 05:00 ET Euro Zone: CPI (cons 4.0%, prev 3.8%) · 11-18 14:00 ET United States: FOMC Meeting Minutes

### USDJPY  `USDJPY=X`  159.9 (2026-11-13)
**Move:** 1w +1.5% · 4w +1.1% (39th pct of 2y 4w moves) · 13w +0.3% · 52w range position 65% (lo 152.5 / hi 163.9)
**Drivers (recent corr):** US10Y +0.66 [textbook] · US_JP10 +0.40 [textbook] · ^NDX +0.64 [textbook] · ^VIX -0.51 [textbook] → **in charge: US10Y** (US yields: the carry engine)
**Last 20 sessions decomposed (R² 0.16, n=60):** actual +1.1% = US_JP10 -0.3% · ^NDX -0.3% · US10Y +0.2% · ^VIX -0.0% · unexplained +1.5%
**Positioning (CFTC JAPANESE YEN, 2026-11-03, + = long USDJPY):** lev funds +14,817 (+4% OI, 4w -10,226, 24th pct of 3y) · asset mgrs -79,387 (-21% OI, 4w -11,592, 15th pct of 3y)
**This week:** 11-15 18:50 ET Japan: GDP (cons 0.1%, prev 0.4%) · 11-15 18:50 ET Japan: GDP Capital Expenditure (cons 1.5%, prev -0.9%) · 11-15 18:50 ET Japan: GDP External Demand (cons -0.4%, prev 0.5%) · 11-15 18:50 ET Japan: GDP Price Index · 11-15 18:50 ET Japan: GDP Private Consumption (cons -0.2%, prev 0.0%) · 11-17 08:30 ET United States: Core Retail Sales (cons 0.4%, prev 0.9%)

### GBPUSD  `GBPUSD=X`  1.323 (2026-11-13)
**Move:** 1w -1.7% · 4w -0.3% (13th pct of 2y 4w moves) · 13w -1.9% · 52w range position 22% (lo 1.306 / hi 1.383)
**Drivers (recent corr):** US_GB10 -0.17 [weak] · GB10Y -0.38 [INVERTED] · ^GSPC +0.03 [weak] · EURUSD=X +0.91 [textbook] → **in charge: EURUSD=X** (European block move)
**Last 20 sessions decomposed (R² 0.72, n=60):** actual -0.3% = EURUSD=X -1.3% · US_GB10 -0.2% · GB10Y +0.1% · ^GSPC -0.0% · unexplained +1.1%
**Positioning (CFTC BRITISH POUND, 2026-11-03, + = long GBPUSD):** lev funds +26,663 (+11% OI, 4w +14,231, 33rd pct of 3y) · asset mgrs -121,163 (-49% OI, 4w +24,279, 9th pct of 3y)
**This week:** 11-17 02:00 ET United Kingdom: Employment Change 3M/3M · 11-17 02:00 ET United Kingdom: Unemployment Rate · 11-17 08:30 ET United States: Core Retail Sales (cons 0.4%, prev 0.9%) · 11-17 08:30 ET United States: Retail Sales (cons 0.0%, prev 0.8%) · 11-17 08:30 ET United States: Retail Sales Ex Gas/Autos · 11-18 02:00 ET United Kingdom: Core CPI

### USDCAD  `USDCAD=X`  1.426 (2026-11-13)
**Move:** 1w +1.7% · 4w +0.5% (23rd pct of 2y 4w moves) · 13w +2.4% · 52w range position 98% (lo 1.349 / hi 1.428)
**Drivers (recent corr):** CL=F +0.03 [weak] · US_CA2 +0.40 [textbook] · ^GSPC +0.04 [weak] → **in charge: US_CA2** (US-Canada 2y rate gap)
**Last 20 sessions decomposed (R² 0.20, n=60):** actual +0.5% = US_CA2 -0.1% · ^GSPC +0.1% · CL=F -0.0% · unexplained +0.5%
**Positioning (CFTC CANADIAN DOLLAR, 2026-11-03, + = long USDCAD):** lev funds +86,302 (+25% OI, 4w +6,677, 87th pct of 3y) · asset mgrs -16,453 (-5% OI, 4w -52,259, 8th pct of 3y)
**This week:** 11-16 08:30 ET Canada: Core CPI · 11-16 08:30 ET Canada: CPI · 11-17 08:30 ET United States: Core Retail Sales (cons 0.4%, prev 0.9%) · 11-17 08:30 ET United States: Retail Sales (cons 0.0%, prev 0.8%) · 11-17 08:30 ET United States: Retail Sales Ex Gas/Autos · 11-18 14:00 ET United States: FOMC Meeting Minutes

### AUDUSD  `AUDUSD=X`  0.6807 (2026-11-13)
**Move:** 1w -1.8% · 4w -1.6% (62nd pct of 2y 4w moves) · 13w -3.6% · 52w range position 44% (lo 0.6449 / hi 0.7255)
**Drivers (recent corr):** HG=F +0.30 [weak] · ^NDX +0.48 [textbook] · GC=F +0.20 [weak] → **in charge: ^NDX** (Global risk proxy)
**Last 20 sessions decomposed (R² 0.15, n=60):** actual -1.6% = ^NDX -0.4% · HG=F -0.1% · GC=F -0.1% · unexplained -1.0%
**Positioning (CFTC AUSTRALIAN DOLLAR, 2026-11-03, + = long AUDUSD):** lev funds +50,106 (+15% OI, 4w -4,027, 88th pct of 3y) · asset mgrs -130,780 (-40% OI, 4w -29,352, 1st pct of 3y)
**This week:** 11-16 19:30 ET Australia: RBA Meeting Minutes · 11-17 08:30 ET United States: Core Retail Sales (cons 0.4%, prev 0.9%) · 11-17 08:30 ET United States: Retail Sales (cons 0.0%, prev 0.8%) · 11-17 08:30 ET United States: Retail Sales Ex Gas/Autos · 11-18 14:00 ET United States: FOMC Meeting Minutes · 11-18 19:30 ET Australia: Employment Change

### NZDUSD  `NZDUSD=X`  0.5545 (2026-11-13)
**Move:** 1w -0.9% · 4w -1.4% (47th pct of 2y 4w moves) · 13w -5.3% · 52w range position 0% (lo 0.5545 / hi 0.6076)
**Drivers (recent corr):** AUDUSD=X +0.58 [textbook] · ^GSPC +0.39 [textbook] · US2Y -0.06 [weak] → **in charge: AUDUSD=X** (Antipodean block)
**Last 20 sessions decomposed (R² 0.37, n=60):** actual -1.4% = AUDUSD=X -0.7% · US2Y -0.1% · ^GSPC -0.1% · unexplained -0.5%
**Positioning (CFTC NZ DOLLAR, 2026-11-03, + = long NZDUSD):** lev funds -23,154 (-17% OI, 4w -22,367, 7th pct of 3y) · asset mgrs -46,700 (-35% OI, 4w -14,166, 11th pct of 3y)
**This week:** 11-17 08:30 ET United States: Core Retail Sales (cons 0.4%, prev 0.9%) · 11-17 08:30 ET United States: Retail Sales (cons 0.0%, prev 0.8%) · 11-17 08:30 ET United States: Retail Sales Ex Gas/Autos · 11-18 14:00 ET United States: FOMC Meeting Minutes

### USDCHF  `USDCHF=X`  0.8359 (2026-11-13)
**Move:** 1w +2.5% · 4w +1.0% (38th pct of 2y 4w moves) · 13w +2.7% · 52w range position 100% (lo 0.7632 / hi 0.8359)
**Drivers (recent corr):** US10Y +0.53 [textbook] · ^VIX -0.27 [weak] · GC=F -0.04 [weak] → **in charge: US10Y** (US yields)
**Last 20 sessions decomposed (R² 0.32, n=60):** actual +1.0% = US10Y +0.2% · GC=F -0.1% · ^VIX +0.0% · unexplained +0.9%
**Positioning (CFTC SWISS FRANC, 2026-11-03, + = long USDCHF):** lev funds +16,845 (+13% OI, 4w +5,495, 95th pct of 3y) · asset mgrs +20,853 (+16% OI, 4w -16,526, 18th pct of 3y)
**This week:** 11-17 08:30 ET United States: Core Retail Sales (cons 0.4%, prev 0.9%) · 11-17 08:30 ET United States: Retail Sales (cons 0.0%, prev 0.8%) · 11-17 08:30 ET United States: Retail Sales Ex Gas/Autos · 11-18 14:00 ET United States: FOMC Meeting Minutes


## 3. G10 crosses

### AUDNZD  `AUDNZD=X`  1.228 (2026-11-13)
**Move:** 1w -0.9% · 4w -0.2% (12th pct of 2y 4w moves) · 13w +1.7% · 52w range position 77% (lo 1.141 / hi 1.254)
**Drivers (recent corr):** HG=F +0.09 [weak] · ^AXJO -0.29 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.09, n=60):** actual -0.2% = ^AXJO -0.4% · HG=F -0.2% · unexplained +0.5%
**This week:** 11-16 19:30 ET Australia: RBA Meeting Minutes · 11-18 19:30 ET Australia: Employment Change · 11-18 19:30 ET Australia: Full Employment Change · 11-18 19:30 ET Australia: Unemployment Rate

### EURGBP  `EURGBP=X`  0.835 (2026-11-13)
**Move:** 1w +0.1% · 4w -1.2% (72nd pct of 2y 4w moves) · 13w -2.3% · 52w range position 3% (lo 0.8336 / hi 0.8842)
**Drivers (recent corr):** GB10Y +0.24 [weak] · FR_DE (missing) → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual -1.2% = GB10Y -0.0% · unexplained -1.2%
**This week:** 11-17 02:00 ET United Kingdom: Employment Change 3M/3M · 11-17 02:00 ET United Kingdom: Unemployment Rate · 11-18 02:00 ET United Kingdom: Core CPI · 11-18 02:00 ET United Kingdom: CPI · 11-18 05:00 ET Euro Zone: Core CPI (cons 2.5%, prev 2.5%) · 11-18 05:00 ET Euro Zone: CPI (cons 4.0%, prev 3.8%)

### EURCHF  `EURCHF=X`  0.9237 (2026-11-13)
**Move:** 1w +0.9% · 4w -0.5% (33rd pct of 2y 4w moves) · 13w -1.6% · 52w range position 48% (lo 0.9023 / hi 0.9466)
**Drivers (recent corr):** ^STOXX50E +0.33 [textbook] · FR_DE (missing) · ^VIX -0.40 [textbook] → **in charge: ^VIX** (Haven flows)
**Last 20 sessions decomposed (R² 0.05, n=60):** actual -0.5% = ^STOXX50E +0.1% · ^VIX +0.0% · unexplained -0.6%
**This week:** 11-18 05:00 ET Euro Zone: Core CPI (cons 2.5%, prev 2.5%) · 11-18 05:00 ET Euro Zone: CPI (cons 4.0%, prev 3.8%)


## 4. EM FX

### USDMXN  `USDMXN=X`  18.59 (2026-11-13)
**Move:** 1w -1.0% · 4w +0.8% (28th pct of 2y 4w moves) · 13w +9.2% · 52w range position 87% (lo 16.89 / hi 18.85)
**Drivers (recent corr):** ^VIX +0.38 [textbook] · ^GSPC -0.36 [textbook] · CL=F +0.75 [INVERTED] · USDBRL=X -0.17 [weak] → **in charge: CL=F** (Oil)
**Last 20 sessions decomposed (R² 0.21, n=60):** actual +0.8% = CL=F -0.7% · USDBRL=X +0.7% · ^GSPC +0.2% · ^VIX -0.0% · unexplained +0.7%
**Positioning (CFTC MEXICAN PESO, 2026-11-03, + = long USDMXN):** lev funds -71,381 (-25% OI, 4w +3,546, 6th pct of 3y) · asset mgrs +36,349 (+13% OI, 4w +15,750, 100th pct of 3y)
**This week:** 11-17 08:30 ET United States: Core Retail Sales (cons 0.4%, prev 0.9%) · 11-17 08:30 ET United States: Retail Sales (cons 0.0%, prev 0.8%) · 11-17 08:30 ET United States: Retail Sales Ex Gas/Autos · 11-18 14:00 ET United States: FOMC Meeting Minutes

### USDBRL  `USDBRL=X`  5.641 (2026-11-13)
**Move:** 1w +2.5% · 4w +10.7% (100th pct of 2y 4w moves) · 13w +8.5% · 52w range position 100% (lo 4.906 / hi 5.641)
**Drivers (recent corr):** ^VIX +0.12 [weak] · HG=F +0.23 [weak] · EWZ -0.94 [textbook] → **in charge: EWZ** (Brazil equities (local flows))
**Last 20 sessions decomposed (R² 0.86, n=60):** actual +10.1% = EWZ +7.7% · HG=F +0.4% · ^VIX -0.0% · unexplained +2.1%
**Positioning (CFTC BRAZILIAN REAL, 2026-11-03, + = long USDBRL):** lev funds -38,613 (-22% OI, 4w -11,217, 1st pct of 3y) · asset mgrs -49,879 (-29% OI, 4w +6,731, 48th pct of 3y)
**This week:** 11-17 08:30 ET United States: Core Retail Sales (cons 0.4%, prev 0.9%) · 11-17 08:30 ET United States: Retail Sales (cons 0.0%, prev 0.8%) · 11-17 08:30 ET United States: Retail Sales Ex Gas/Autos · 11-18 14:00 ET United States: FOMC Meeting Minutes

### USDZAR  `USDZAR=X`  16.76 (2026-11-13)
**Move:** 1w +1.7% · 4w +1.5% (49th pct of 2y 4w moves) · 13w +3.6% · 52w range position 66% (lo 15.71 / hi 17.29)
**Drivers (recent corr):** GC=F -0.42 [textbook] · ^VIX +0.46 [textbook] · HG=F -0.06 [weak] → **in charge: ^VIX** (Carry / risk)
**Last 20 sessions decomposed (R² 0.18, n=60):** actual +1.5% = GC=F +0.6% · HG=F -0.2% · ^VIX -0.1% · unexplained +1.2%
**Positioning (CFTC SO AFRICAN RAND, 2026-11-03, + = long USDZAR):** lev funds -6,317 (-17% OI, 4w -1,908, 17th pct of 3y) · asset mgrs -14,523 (-40% OI, 4w +3,361, 33rd pct of 3y)
**This week:** 11-17 08:30 ET United States: Core Retail Sales (cons 0.4%, prev 0.9%) · 11-17 08:30 ET United States: Retail Sales (cons 0.0%, prev 0.8%) · 11-17 08:30 ET United States: Retail Sales Ex Gas/Autos · 11-18 03:00 ET South Africa: Core CPI · 11-18 03:00 ET South Africa: CPI · 11-18 06:00 ET South Africa: Retail Sales

### USDKRW  `USDKRW=X`  1,334 (2026-11-13)
**Move:** 1w -1.7% · 4w -0.5% (21st pct of 2y 4w moves) · 13w -5.9% · 52w range position 4% (lo 1,324 / hi 1,552)
**Drivers (recent corr):** ^KS11 +0.06 [weak] · SOXX -0.53 [textbook] · DX-Y.NYB +0.04 [weak] → **in charge: SOXX** (Global semis cycle)
**Last 20 sessions decomposed (R² 0.12, n=60):** actual -0.5% = SOXX +0.6% · DX-Y.NYB +0.4% · ^KS11 -0.3% · unexplained -1.3%
**This week:** 11-17 08:30 ET United States: Core Retail Sales (cons 0.4%, prev 0.9%) · 11-17 08:30 ET United States: Retail Sales (cons 0.0%, prev 0.8%) · 11-17 08:30 ET United States: Retail Sales Ex Gas/Autos · 11-18 14:00 ET United States: FOMC Meeting Minutes


## 5. CE3 FX

### EURCZK  `EURCZK=X`  24.38 (2026-11-13)
**Move:** 1w +0.3% · 4w +0.2% (38th pct of 2y 4w moves) · 13w +0.7% · 52w range position 66% (lo 24.07 / hi 24.53)
**Drivers (recent corr):** ^STOXX50E -0.28 [weak] · EURPLN=X +0.60 [textbook] → **in charge: EURPLN=X** (CE3 block)
**Last 20 sessions decomposed (R² 0.28, n=60):** actual +0.2% = EURPLN=X +0.2% · ^STOXX50E -0.1% · unexplained +0.1%
**This week:** 11-18 05:00 ET Euro Zone: Core CPI (cons 2.5%, prev 2.5%) · 11-18 05:00 ET Euro Zone: CPI (cons 4.0%, prev 3.8%)

### EURPLN  `EURPLN=X`  4.401 (2026-11-13)
**Move:** 1w +0.0% · 4w +0.8% (69th pct of 2y 4w moves) · 13w +2.1% · 52w range position 95% (lo 4.197 / hi 4.412)
**Drivers (recent corr):** ^STOXX50E -0.37 [textbook] · ^VIX +0.48 [textbook] → **in charge: ^VIX** (Risk)
**Last 20 sessions decomposed (R² 0.16, n=60):** actual +0.8% = ^STOXX50E -0.2% · ^VIX -0.0% · unexplained +1.0%
**This week:** 11-18 05:00 ET Euro Zone: Core CPI (cons 2.5%, prev 2.5%) · 11-18 05:00 ET Euro Zone: CPI (cons 4.0%, prev 3.8%)


## 6. Equities

### S&P 500  `^GSPC`  7,562 (2026-11-13)
**Move:** 1w +2.5% · 4w -1.3% (27th pct of 2y 4w moves) · 13w -2.9% · 52w range position 83% (lo 6,344 / hi 7,819)
**Drivers (recent corr):** US10Y +0.29 [weak] · HYG_TLT +0.35 [textbook] · DX-Y.NYB -0.15 [weak] · CL=F -0.42 [textbook] · ^VIX -0.96 [textbook] → **in charge: ^VIX** (Vol)
**Last 20 sessions decomposed (R² 0.86, n=60):** actual -1.3% = HYG_TLT +0.4% · CL=F +0.4% · ^VIX +0.3% · US10Y -0.2% · DX-Y.NYB +0.1% · unexplained -2.1%
**Positioning (CFTC E-MINI S&P 500, 2026-11-03, + = long S&P 500):** lev funds -372,318 (-19% OI, 4w +42,769, 36th pct of 3y) · asset mgrs +928,584 (+47% OI, 4w +21,969, 48th pct of 3y)
**This week:** 11-17 08:30 ET United States: Core Retail Sales (cons 0.4%, prev 0.9%) · 11-17 08:30 ET United States: Retail Sales (cons 0.0%, prev 0.8%) · 11-17 08:30 ET United States: Retail Sales Ex Gas/Autos · 11-18 14:00 ET United States: FOMC Meeting Minutes

### Nasdaq 100  `^NDX`  27,944 (2026-11-13)
**Move:** 1w +3.5% · 4w -4.3% (63rd pct of 2y 4w moves) · 13w -7.0% · 52w range position 60% (lo 22,953 / hi 31,224)
**Drivers (recent corr):** US10Y +0.45 [INVERTED] · SOXX +0.96 [textbook] · HYG_TLT +0.50 [textbook] · BTC-USD +0.64 [textbook] → **in charge: SOXX** (Semis / AI capex)
**Last 20 sessions decomposed (R² 0.91, n=60):** actual -4.4% = SOXX -3.5% · BTC-USD -2.1% · HYG_TLT +0.4% · US10Y -0.3% · unexplained +1.1%
**Positioning (CFTC NASDAQ MINI, 2026-11-03, + = long Nasdaq 100):** lev funds +10,073 (+3% OI, 4w +29,285, 97th pct of 3y) · asset mgrs +73,137 (+25% OI, 4w -661, 45th pct of 3y)
**This week:** 11-17 08:30 ET United States: Core Retail Sales (cons 0.4%, prev 0.9%) · 11-17 08:30 ET United States: Retail Sales (cons 0.0%, prev 0.8%) · 11-17 08:30 ET United States: Retail Sales Ex Gas/Autos · 11-18 14:00 ET United States: FOMC Meeting Minutes

### Russell 2000  `^RUT`  2,790 (2026-11-13)
**Move:** 1w +1.3% · 4w +2.5% (35th pct of 2y 4w moves) · 13w -9.1% · 52w range position 64% (lo 2,305 / hi 3,068)
**Drivers (recent corr):** US2Y +0.07 [weak] · HYG_TLT +0.04 [weak] · ^GSPC +0.91 [textbook] → **in charge: ^GSPC** (Beta)
**Last 20 sessions decomposed (R² 0.76, n=60):** actual +2.5% = ^GSPC -1.3% · US2Y -0.3% · HYG_TLT -0.1% · unexplained +4.2%
**This week:** 11-17 08:30 ET United States: Core Retail Sales (cons 0.4%, prev 0.9%) · 11-17 08:30 ET United States: Retail Sales (cons 0.0%, prev 0.8%) · 11-17 08:30 ET United States: Retail Sales Ex Gas/Autos · 11-18 14:00 ET United States: FOMC Meeting Minutes

### Euro Stoxx 50  `^STOXX50E`  6,387 (2026-11-13)
**Move:** 1w +3.5% · 4w +2.9% (57th pct of 2y 4w moves) · 13w -2.3% · 52w range position 84% (lo 5,501 / hi 6,551)
**Drivers (recent corr):** FR_DE (missing) · ^GSPC +0.59 [textbook] · BZ=F -0.44 [textbook] · EURUSD=X -0.11 [weak] → **in charge: ^GSPC** (US lead)
**Last 20 sessions decomposed (R² 0.31, n=60):** actual +2.9% = BZ=F +1.0% · ^GSPC -0.5% · EURUSD=X -0.1% · unexplained +2.5%
**This week:** 11-18 05:00 ET Euro Zone: Core CPI (cons 2.5%, prev 2.5%) · 11-18 05:00 ET Euro Zone: CPI (cons 4.0%, prev 3.8%)

### CAC 40  `^FCHI`  8,369 (2026-11-13)
**Move:** 1w +2.8% · 4w +5.2% (83rd pct of 2y 4w moves) · 13w -3.1% · 52w range position 66% (lo 7,666 / hi 8,726)
**Drivers (recent corr):** FR_DE (missing) · ^STOXX50E +0.91 [textbook] → **in charge: ^STOXX50E** (European block)
**Last 20 sessions decomposed (R² 0.78, n=60):** actual +5.1% = ^STOXX50E +2.4% · unexplained +2.7%
**This week:** 11-18 05:00 ET Euro Zone: Core CPI (cons 2.5%, prev 2.5%) · 11-18 05:00 ET Euro Zone: CPI (cons 4.0%, prev 3.8%)

### DAX  `^GDAXI`  26,750 (2026-11-13)
**Move:** 1w +3.6% · 4w +4.4% (74th pct of 2y 4w moves) · 13w +1.2% · 52w range position 100% (lo 22,301 / hi 26,772)
**Drivers (recent corr):** DE10Y +0.36 [INVERTED] · ^GSPC +0.50 [textbook] → **in charge: ^GSPC** (Global risk)
**Last 20 sessions decomposed (R² 0.23, n=60):** actual +4.3% = ^GSPC -0.6% · DE10Y +0.1% · unexplained +4.8%
**This week:** 11-18 05:00 ET Euro Zone: Core CPI (cons 2.5%, prev 2.5%) · 11-18 05:00 ET Euro Zone: CPI (cons 4.0%, prev 3.8%)

### FTSE 100  `^FTSE`  10,903 (2026-11-13)
**Move:** 1w +2.1% · 4w +0.2% (5th pct of 2y 4w moves) · 13w +1.4% · 52w range position 99% (lo 9,507 / hi 10,911)
**Drivers (recent corr):** BZ=F -0.43 [INVERTED] · GBPUSD=X -0.07 [weak] · GB10Y -0.57 [textbook] → **in charge: GB10Y** (Gilts)
**Last 20 sessions decomposed (R² 0.38, n=60):** actual +0.2% = GB10Y +1.0% · BZ=F +0.4% · GBPUSD=X +0.1% · unexplained -1.2%
**This week:** 11-17 02:00 ET United Kingdom: Employment Change 3M/3M · 11-17 02:00 ET United Kingdom: Unemployment Rate · 11-18 02:00 ET United Kingdom: Core CPI · 11-18 02:00 ET United Kingdom: CPI · 11-20 02:00 ET United Kingdom: Core Retail Sales · 11-20 02:00 ET United Kingdom: Retail Sales

### Nikkei 225  `^N225`  61,142 (2026-11-13)
**Move:** 1w +6.5% · 4w -6.4% (68th pct of 2y 4w moves) · 13w -11.0% · 52w range position 53% (lo 48,538 / hi 72,366)
**Drivers (recent corr):** USDJPY=X +0.40 [textbook] · ^NDX +0.59 [textbook] · SOXX +0.61 [textbook] → **in charge: SOXX** (Chips (prior US day))
**Last 20 sessions decomposed (R² 0.29, n=60):** actual -6.6% = SOXX -1.7% · ^NDX -1.4% · USDJPY=X -0.1% · unexplained -3.5%
**This week:** 11-15 18:50 ET Japan: GDP (cons 0.1%, prev 0.4%) · 11-15 18:50 ET Japan: GDP Capital Expenditure (cons 1.5%, prev -0.9%) · 11-15 18:50 ET Japan: GDP External Demand (cons -0.4%, prev 0.5%) · 11-15 18:50 ET Japan: GDP Price Index · 11-15 18:50 ET Japan: GDP Private Consumption (cons -0.2%, prev 0.0%) · 11-19 18:30 ET Japan: National Core CPI

### KOSPI  `^KS11`  5,291 (2026-11-13)
**Move:** 1w +4.6% · 4w -6.7% (51st pct of 2y 4w moves) · 13w -24.2% · 52w range position 27% (lo 3,846 / hi 9,115)
**Drivers (recent corr):** SOXX +0.39 [textbook] · ^NDX +0.30 [weak] → **in charge: SOXX** (Memory / AI hardware (prior US day))
**Last 20 sessions decomposed (R² 0.22, n=60):** actual -6.9% = SOXX -7.5% · ^NDX +5.6% · unexplained -5.0%

### Hang Seng  `^HSI`  23,638 (2026-11-13)
**Move:** 1w -3.4% · 4w -2.3% (34th pct of 2y 4w moves) · 13w -5.9% · 52w range position 18% (lo 22,672 / hi 27,968)
**Drivers (recent corr):** ^NDX -0.01 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual -2.3% = ^NDX -0.3% · unexplained -2.0%
**This week:** 11-15 21:00 ET China: Retail Sales (cons 0.8%, prev 1.1%) · 11-15 21:00 ET China: Chinese Retail Sales YTD  · 11-15 21:00 ET China: Chinese Unemployment Rate (cons 5.2%, prev 5.2%) · 11-15 21:00 ET China: NBS Press Conference · 11-17 03:30 ET Hong Kong: Unemployment Rate · 11-20 03:30 ET Hong Kong: CPI

### ASX 200  `^AXJO`  9,082 (2026-11-13)
**Move:** 1w +0.7% · 4w +3.1% (67th pct of 2y 4w moves) · 13w -0.4% · 52w range position 79% (lo 8,366 / hi 9,272)
**Drivers (recent corr):** HG=F +0.41 [textbook] · ^GSPC +0.48 [textbook] → **in charge: ^GSPC** (US lead (prior US day))
**Last 20 sessions decomposed (R² 0.22, n=60):** actual +3.1% = HG=F -0.8% · ^GSPC -0.4% · unexplained +4.3%
**This week:** 11-16 19:30 ET Australia: RBA Meeting Minutes · 11-18 19:30 ET Australia: Employment Change · 11-18 19:30 ET Australia: Full Employment Change · 11-18 19:30 ET Australia: Unemployment Rate


## 7. Rates

### US 2y  `US2Y`  4.98% (2026-11-13)
**Move:** 1w +33bp · 4w +8bp (36th pct of 2y 4w moves) · 13w +62bp · 52w range position 93% (lo 3.512 / hi 5.089)
**Drivers (recent corr):** CL=F -0.05 [weak] · ^GSPC +0.36 [textbook, was INVERTED] → **in charge: ^GSPC** (Risk-on = fewer cuts / more hikes)
**Last 20 sessions decomposed (R² 0.01, n=60):** actual +8bp = CL=F -1bp · ^GSPC -1bp · unexplained +10bp
**Positioning (CFTC UST 2Y NOTE, 2026-11-03, + = long US 2y):** lev funds +1,450,892 (+33% OI, 4w +193,408, 15th pct of 3y) · asset mgrs -1,876,612 (-42% OI, 4w -197,525, 59th pct of 3y)
**This week:** 11-17 08:30 ET United States: Core Retail Sales (cons 0.4%, prev 0.9%) · 11-17 08:30 ET United States: Retail Sales (cons 0.0%, prev 0.8%) · 11-17 08:30 ET United States: Retail Sales Ex Gas/Autos · 11-18 14:00 ET United States: FOMC Meeting Minutes

### US 10y  `US10Y`  5.15% (2026-11-13)
**Move:** 1w +30bp · 4w +6bp (25th pct of 2y 4w moves) · 13w +46bp · 52w range position 88% (lo 3.962 / hi 5.311)
**Drivers (recent corr):** CL=F +0.02 [weak] · ^NDX +0.45 [INVERTED] · T10YIE (missing) · DE10Y +0.19 [weak] → **in charge: ^NDX** (Textbook: yields up hurt stocks; + means bonds hedge stocks)
**Last 20 sessions decomposed (R² 0.08, n=60):** actual +6bp = ^NDX -3bp · CL=F -2bp · DE10Y -1bp · unexplained +12bp
**Positioning (CFTC UST 10Y NOTE, 2026-11-03, + = long US 10y):** lev funds +2,262,310 (+38% OI, 4w +122,525, 86th pct of 3y) · asset mgrs -3,030,236 (-51% OI, 4w -202,097, 1st pct of 3y)
**This week:** 11-17 08:30 ET United States: Core Retail Sales (cons 0.4%, prev 0.9%) · 11-17 08:30 ET United States: Retail Sales (cons 0.0%, prev 0.8%) · 11-17 08:30 ET United States: Retail Sales Ex Gas/Autos · 11-18 14:00 ET United States: FOMC Meeting Minutes

### US 30y  `US30Y`  5.48% (2026-11-13)
**Move:** 1w +22bp · 4w +5bp (23rd pct of 2y 4w moves) · 13w +22bp · 52w range position 82% (lo 4.633 / hi 5.665)
**Drivers (recent corr):** US2Y +0.92 [textbook] · T10YIE (missing) → **in charge: US2Y** (Front end)
**Last 20 sessions decomposed (R² 0.73, n=60):** actual +5bp = US2Y +5bp · unexplained -1bp
**Positioning (CFTC UST BOND, 2026-11-03, + = long US 30y):** lev funds +166,257 (+9% OI, 4w -23,421, 3rd pct of 3y) · asset mgrs -415,379 (-22% OI, 4w -9,751, 90th pct of 3y)
**This week:** 11-17 08:30 ET United States: Core Retail Sales (cons 0.4%, prev 0.9%) · 11-17 08:30 ET United States: Retail Sales (cons 0.0%, prev 0.8%) · 11-17 08:30 ET United States: Retail Sales Ex Gas/Autos · 11-18 14:00 ET United States: FOMC Meeting Minutes

### Bund 10y  `DE10Y`  3.41% (2026-11-13)
**Move:** 1w +14bp · 4w -4bp (22nd pct of 2y 4w moves) · 13w +23bp · 52w range position 74% (lo 2.69 / hi 3.66)
**Drivers (recent corr):** US10Y +0.19 [weak] · BZ=F -0.02 [weak] · FR_DE (missing) → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.04, n=60):** actual -4bp = US10Y +1bp · BZ=F -0bp · unexplained -5bp
**This week:** 11-18 05:00 ET Euro Zone: Core CPI (cons 2.5%, prev 2.5%) · 11-18 05:00 ET Euro Zone: CPI (cons 4.0%, prev 3.8%)

### Gilt 10y  `GB10Y`  5.21% (2026-11-13)
**Move:** 1w +7bp · 4w -13bp (51st pct of 2y 4w moves) · 13w +12bp · 52w range position 76% (lo 4.352 / hi 5.478)
**Drivers (recent corr):** US10Y +0.66 [textbook] · GBPUSD=X -0.38 [textbook] → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.37, n=60):** actual -13bp = US10Y +3bp · GBPUSD=X +0bp · unexplained -16bp
**This week:** 11-17 02:00 ET United Kingdom: Employment Change 3M/3M · 11-17 02:00 ET United Kingdom: Unemployment Rate · 11-18 02:00 ET United Kingdom: Core CPI · 11-18 02:00 ET United Kingdom: CPI · 11-20 02:00 ET United Kingdom: Core Retail Sales · 11-20 02:00 ET United Kingdom: Retail Sales

### JGB 10y  `JP10Y`  2.84% (2026-11-13)
**Move:** 1w +15bp · 4w -12bp (52nd pct of 2y 4w moves) · 13w -4bp · 52w range position 81% (lo 1.714 / hi 3.111)
**Drivers (recent corr):** US10Y +0.72 [textbook] · USDJPY=X +0.71 [textbook] → **in charge: US10Y** (Global duration)
**Last 20 sessions decomposed (R² 0.51, n=60):** actual -12bp = USDJPY=X +3bp · US10Y +0bp · unexplained -15bp
**This week:** 11-15 18:50 ET Japan: GDP (cons 0.1%, prev 0.4%) · 11-15 18:50 ET Japan: GDP Capital Expenditure (cons 1.5%, prev -0.9%) · 11-15 18:50 ET Japan: GDP External Demand (cons -0.4%, prev 0.5%) · 11-15 18:50 ET Japan: GDP Price Index · 11-15 18:50 ET Japan: GDP Private Consumption (cons -0.2%, prev 0.0%) · 11-19 18:30 ET Japan: National Core CPI

### Canada 10y  `CA10Y`  3.78% (2026-11-13)
**Move:** 1w +13bp · 4w -6bp (28th pct of 2y 4w moves) · 13w +10bp · 52w range position 76% (lo 3.12 / hi 3.99)
**Drivers (recent corr):** US10Y +0.89 [textbook] · CL=F +0.14 [weak] → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.69, n=60):** actual -6bp = US10Y +4bp · CL=F -3bp · unexplained -7bp
**This week:** 11-16 08:30 ET Canada: Core CPI · 11-16 08:30 ET Canada: CPI · 11-20 08:30 ET Canada: Core Retail Sales · 11-20 08:30 ET Canada: Retail Sales (cons 0.7%, prev 1.2%)

### French spread (proxy)
_no data_


## 8. Commodities

### WTI crude  `CL=F`  88.92 (2026-11-13)
**Move:** 1w -2.1% · 4w -12.3% (79th pct of 2y 4w moves) · 13w +7.9% · 52w range position 58% (lo 55.27 / hi 112.9)
**Drivers (recent corr):** XLE +0.42 [textbook] · ^GSPC -0.42 [INVERTED] · HG=F -0.41 [INVERTED] · DX-Y.NYB +0.29 [weak] → **in charge: ^GSPC** (Demand (- = supply shock))
**Last 20 sessions decomposed (R² 0.31, n=60):** actual -13.1% = HG=F +5.2% · XLE -2.9% · DX-Y.NYB -1.0% · ^GSPC +1.0% · unexplained -15.5%
**Positioning (CFTC WTI-PHYSICAL, 2026-11-03, + = long WTI crude):** managed money +21,728 (+1% OI, 4w -31,870, 10th pct of 3y) · producers +369,347 (+19% OI, 4w +34,337, 96th pct of 3y)
**This week:** 11-17 08:30 ET United States: Core Retail Sales (cons 0.4%, prev 0.9%) · 11-17 08:30 ET United States: Retail Sales (cons 0.0%, prev 0.8%) · 11-17 08:30 ET United States: Retail Sales Ex Gas/Autos · 11-18 14:00 ET United States: FOMC Meeting Minutes

### Gold  `GC=F`  3,888 (2026-11-13)
**Move:** 1w -4.6% · 4w -7.0% (72nd pct of 2y 4w moves) · 13w -12.4% · 52w range position 0% (lo 3,885 / hi 5,318)
**Drivers (recent corr):** DFII10 (missing) · DX-Y.NYB -0.27 [weak] · SI=F +0.87 [textbook] · BTC-USD +0.40 [textbook] → **in charge: SI=F** (Precious block)
**Last 20 sessions decomposed (R² 0.75, n=60):** actual -7.3% = SI=F -7.3% · DX-Y.NYB -0.8% · BTC-USD +0.5% · unexplained +0.3%
**Positioning (CFTC GOLD, 2026-11-03, + = long Gold):** managed money +103,614 (+26% OI, 4w -7,373, 22nd pct of 3y) · producers -8,912 (-2% OI, 4w +10,589, 100th pct of 3y)
**This week:** 11-17 08:30 ET United States: Core Retail Sales (cons 0.4%, prev 0.9%) · 11-17 08:30 ET United States: Retail Sales (cons 0.0%, prev 0.8%) · 11-17 08:30 ET United States: Retail Sales Ex Gas/Autos · 11-18 14:00 ET United States: FOMC Meeting Minutes

### Silver  `SI=F`  48.65 (2026-11-13)
**Move:** 1w -6.1% · 4w -14.6% (78th pct of 2y 4w moves) · 13w -25.1% · 52w range position 0% (lo 48.65 / hi 115.1)
**Drivers (recent corr):** GC=F +0.87 [textbook] · HG=F +0.66 [textbook] → **in charge: GC=F** (Gold)
**Last 20 sessions decomposed (R² 0.80, n=60):** actual -15.8% = GC=F -9.4% · HG=F -3.6% · unexplained -2.8%
**Positioning (CFTC SILVER, 2026-11-03, + = long Silver):** managed money +4,035 (+3% OI, 4w -3,493, 5th pct of 3y) · producers -13,145 (-11% OI, 4w +3,108, 97th pct of 3y)
**This week:** 11-17 08:30 ET United States: Core Retail Sales (cons 0.4%, prev 0.9%) · 11-17 08:30 ET United States: Retail Sales (cons 0.0%, prev 0.8%) · 11-17 08:30 ET United States: Retail Sales Ex Gas/Autos · 11-18 14:00 ET United States: FOMC Meeting Minutes

### Copper  `HG=F`  6.063 (2026-11-13)
**Move:** 1w -2.5% · 4w -7.2% (72nd pct of 2y 4w moves) · 13w -8.1% · 52w range position 60% (lo 4.959 / hi 6.804)
**Drivers (recent corr):** ^GSPC +0.36 [textbook] → **in charge: ^GSPC** (Global growth)
**Last 20 sessions decomposed (R² 0.09, n=60):** actual -7.4% = ^GSPC -0.6% · unexplained -6.8%
**Positioning (CFTC COPPER- #1, 2026-11-03, + = long Copper):** managed money +34,890 (+11% OI, 4w -26,244, 48th pct of 3y) · producers -55,218 (-17% OI, 4w +37,502, 53rd pct of 3y)
**This week:** 11-15 21:00 ET China: Retail Sales (cons 0.8%, prev 1.1%) · 11-15 21:00 ET China: Chinese Retail Sales YTD  · 11-15 21:00 ET China: Chinese Unemployment Rate (cons 5.2%, prev 5.2%) · 11-15 21:00 ET China: NBS Press Conference · 11-17 08:30 ET United States: Core Retail Sales (cons 0.4%, prev 0.9%) · 11-17 08:30 ET United States: Retail Sales (cons 0.0%, prev 0.8%)

### Nat gas (US)  `NG=F`  3.242 (2026-11-13)
**Move:** 1w +8.1% · 4w +4.0% (19th pct of 2y 4w moves) · 13w +18.6% · 52w range position 15% (lo 2.523 / hi 7.46)
**Drivers (recent corr):** CL=F -0.13 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual +4.0% = CL=F +0.2% · unexplained +3.8%
**Positioning (CFTC NAT GAS NYME, 2026-11-03, + = long Nat gas (US)):** managed money -225,359 (-13% OI, 4w -80,822, 1st pct of 3y) · producers -418 (-0% OI, 4w +7,811, 92nd pct of 3y)
**This week:** 11-17 08:30 ET United States: Core Retail Sales (cons 0.4%, prev 0.9%) · 11-17 08:30 ET United States: Retail Sales (cons 0.0%, prev 0.8%) · 11-17 08:30 ET United States: Retail Sales Ex Gas/Autos · 11-18 14:00 ET United States: FOMC Meeting Minutes


## 9. Crypto

### Bitcoin  `BTC-USD`  71,343 (2026-11-13)
**Move:** 1w -5.8% · 4w -12.5% (74th pct of 2y 4w moves) · 13w +13.3% · 52w range position 33% (lo 58,559 / hi 96,929)
**Drivers (recent corr):** ^NDX +0.64 [textbook] · DX-Y.NYB -0.20 [weak] · GC=F +0.40 [textbook] → **in charge: ^NDX** (Tech / speculation)
**Last 20 sessions decomposed (R² 0.35, n=60):** actual -13.3% = ^NDX -3.7% · DX-Y.NYB -0.3% · GC=F -0.2% · unexplained -9.1%
**Positioning (CFTC BITCOIN, 2026-11-03, + = long Bitcoin):** lev funds -2,591 (-15% OI, 4w +4,261, 100th pct of 3y) · asset mgrs +2,403 (+14% OI, 4w -1,129, 3rd pct of 3y)
**This week:** 11-17 08:30 ET United States: Core Retail Sales (cons 0.4%, prev 0.9%) · 11-17 08:30 ET United States: Retail Sales (cons 0.0%, prev 0.8%) · 11-17 08:30 ET United States: Retail Sales Ex Gas/Autos · 11-18 14:00 ET United States: FOMC Meeting Minutes

