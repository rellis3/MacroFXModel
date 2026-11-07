# Market Review Data Pack: 2026-11-07

Fetched 2026-11-07T02:20:43+00:00. Descriptive numbers for the weekly review (read with `education/market_reviews/PLAYBOOK.md`). Correlations are of daily moves: last 20 sessions vs the 60 before. They are noisy; a flip is a question, not a signal.

**Data notes:** fred DGS2: The read operation timed out · fred DFII10: The read operation timed out · fred T10YIE: The read operation timed out · fred BAMLH0A0HYM2: The read operation timed out · fred BAMLC0A0CM: The read operation timed out · FRED DGS2 missing: US 2y = US 5y stand-in for this run · No local OAT/Bund futures: French spread proxy unavailable

## 1. Regime gauges: which story is the market trading?

| Pair | Recent | Before | Textbook sign | Status | What it means |
|---|---|---|---|---|---|
| CL=F vs US10Y | -0.15 | +0.24 | + | weak | Oil vs yields: + = oil is an inflation story; - = oil is a growth tax (2008-style) |
| ^NDX vs US10Y | +0.52 | -0.25 | − | INVERTED | Stocks vs yields: - = rates drive stocks; + = growth scare, bonds hedge stocks |
| HYG_TLT vs ^NDX | +0.56 | -0.13 | + | textbook | Credit vs tech: high + = credit and equities are one trade (credit stress leading) |
| DX-Y.NYB vs ^GSPC | +0.01 | +0.04 | − | weak | Dollar vs stocks: - = safe-haven dollar; ~0/+ = "sell America" or liquidity dash |
| AUDUSD=X vs ^NDX | +0.57 | +0.44 | + | textbook | Aussie vs tech: near 0 = AUD trading commodities not risk |
| BTC-USD vs ^NDX | +0.75 | +0.36 | + | textbook | Bitcoin vs tech: high = one liquidity complex |
| XLE vs CL=F | +0.41 | +0.36 | + | textbook | Energy stocks vs oil: falling = equity investors fade the oil move |
| USDJPY=X vs US10Y | +0.64 | +0.24 | + | textbook | Yen vs yields: high = yen is a pure rates trade |

Equity vol vs bond vol: VIX 25.6 (1y pct 95) · MOVE 93 (1y pct 84). When bond vol leads equity vol, the stress is in rates/credit first.

**Fed funds futures (implied average rate by contract month; vs ~1 week earlier):** V6 3.882% (-0.002) · X6 3.880% (+0.000) · Z6 4.020% (+0.005) · F7 4.090% (+0.005) · G7 4.150% (+0.000) · H7 4.215% (+0.000) · J7 4.305% (+0.015) · K7 4.370% (+0.020) · M7 4.430% (+0.020) · N7 4.465% (+0.030) · Q7 4.485% (+0.035) · U7 4.500% (+0.045) · V7 4.510% (+0.045) (as of 2026-10-26)

## 2. G10 FX

### EURUSD  `EURUSD=X`  1.123 (2026-11-06)
**Move:** 1w +0.4% · 4w +0.1% (5th pct of 2y 4w moves) · 13w -2.6% · 52w range position 11% (lo 1.113 / hi 1.202)
**Drivers (recent corr):** US_EA2 +0.06 [weak] · US_DE10 +0.10 [weak] · FR_DE (missing) · ^STOXX50E -0.06 [weak] · BZ=F -0.14 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.05, n=60):** actual +0.1% = US_EA2 +0.2% · BZ=F +0.0% · US_DE10 -0.0% · ^STOXX50E -0.0% · unexplained -0.1%
**Positioning (CFTC EURO FX, 2026-11-03, + = long EURUSD):** lev funds -78,559 (-9% OI, 4w -34,298, 1st pct of 3y) · asset mgrs +144,925 (+17% OI, 4w -44,956, 1st pct of 3y)
**This week:** 11-10 01:30 ET France: French Unemployment Rate · 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI (cons 0.2%, prev 0.3%) · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 14:00 ET United States: Federal Budget Balance

### USDJPY  `USDJPY=X`  157.5 (2026-11-06)
**Move:** 1w -0.2% · 4w -0.4% (12th pct of 2y 4w moves) · 13w -0.6% · 52w range position 44% (lo 152.5 / hi 163.9)
**Drivers (recent corr):** US10Y +0.64 [textbook] · US_JP10 +0.60 [textbook] · ^NDX +0.60 [textbook] · ^VIX -0.46 [textbook, was INVERTED] → **in charge: US10Y** (US yields: the carry engine)
**Last 20 sessions decomposed (R² 0.13, n=60):** actual -0.4% = US10Y -1.5% · ^NDX -0.8% · ^VIX +0.3% · US_JP10 +0.2% · unexplained +1.5%
**Positioning (CFTC JAPANESE YEN, 2026-11-03, + = long USDJPY):** lev funds +14,817 (+4% OI, 4w -10,226, 23rd pct of 3y) · asset mgrs -79,387 (-21% OI, 4w -11,592, 15th pct of 3y)
**This week:** 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI (cons 0.2%, prev 0.3%) · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 14:00 ET United States: Federal Budget Balance

### GBPUSD  `GBPUSD=X`  1.346 (2026-11-06)
**Move:** 1w +0.6% · 4w +1.7% (65th pct of 2y 4w moves) · 13w +0.0% · 52w range position 52% (lo 1.306 / hi 1.383)
**Drivers (recent corr):** US_GB10 +0.07 [weak] · GB10Y -0.22 [weak] · ^GSPC +0.28 [weak] · EURUSD=X +0.84 [textbook] → **in charge: EURUSD=X** (European block move)
**Last 20 sessions decomposed (R² 0.69, n=60):** actual +1.7% = ^GSPC -0.2% · GB10Y +0.1% · EURUSD=X +0.1% · US_GB10 +0.1% · unexplained +1.5%
**Positioning (CFTC BRITISH POUND, 2026-11-03, + = long GBPUSD):** lev funds +26,663 (+11% OI, 4w +14,231, 34th pct of 3y) · asset mgrs -121,163 (-49% OI, 4w +24,279, 9th pct of 3y)
**This week:** 11-09 19:01 ET United Kingdom: BRC Retail Sales Monitor · 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI (cons 0.2%, prev 0.3%) · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 02:00 ET United Kingdom: GDP (cons 0.7%, prev 0.5%)

### USDCAD  `USDCAD=X`  1.402 (2026-11-06)
**Move:** 1w +0.2% · 4w -1.5% (66th pct of 2y 4w moves) · 13w +0.0% · 52w range position 67% (lo 1.349 / hi 1.428)
**Drivers (recent corr):** CL=F +0.19 [weak] · US_CA2 +0.39 [textbook] · ^GSPC -0.35 [textbook] → **in charge: US_CA2** (US-Canada 2y rate gap)
**Last 20 sessions decomposed (R² 0.30, n=60):** actual -1.5% = US_CA2 -1.2% · ^GSPC +0.5% · CL=F -0.0% · unexplained -0.8%
**Positioning (CFTC CANADIAN DOLLAR, 2026-11-03, + = long USDCAD):** lev funds +86,302 (+25% OI, 4w +6,677, 87th pct of 3y) · asset mgrs -16,453 (-5% OI, 4w -52,259, 8th pct of 3y)
**This week:** 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI (cons 0.2%, prev 0.3%) · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 14:00 ET United States: Federal Budget Balance

### AUDUSD  `AUDUSD=X`  0.6931 (2026-11-06)
**Move:** 1w -1.4% · 4w -0.4% (17th pct of 2y 4w moves) · 13w -1.5% · 52w range position 60% (lo 0.6449 / hi 0.7255)
**Drivers (recent corr):** HG=F +0.20 [weak] · ^NDX +0.57 [textbook] · GC=F -0.07 [weak] → **in charge: ^NDX** (Global risk proxy)
**Last 20 sessions decomposed (R² 0.19, n=60):** actual -0.4% = ^NDX -1.7% · HG=F -0.0% · GC=F +0.0% · unexplained +1.3%
**Positioning (CFTC AUSTRALIAN DOLLAR, 2026-11-03, + = long AUDUSD):** lev funds +50,106 (+15% OI, 4w -4,027, 88th pct of 3y) · asset mgrs -130,780 (-40% OI, 4w -29,352, 1st pct of 3y)
**This week:** 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI (cons 0.2%, prev 0.3%) · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 14:00 ET United States: Federal Budget Balance

### NZDUSD  `NZDUSD=X`  0.5596 (2026-11-06)
**Move:** 1w -0.6% · 4w -0.2% (6th pct of 2y 4w moves) · 13w -4.6% · 52w range position 2% (lo 0.5587 / hi 0.6076)
**Drivers (recent corr):** AUDUSD=X +0.50 [textbook] · ^GSPC +0.41 [textbook] · US2Y +0.10 [weak] → **in charge: AUDUSD=X** (Antipodean block)
**Last 20 sessions decomposed (R² 0.41, n=60):** actual -0.2% = US2Y +0.3% · AUDUSD=X -0.3% · ^GSPC -0.0% · unexplained -0.2%
**Positioning (CFTC NZ DOLLAR, 2026-11-03, + = long NZDUSD):** lev funds -23,154 (-17% OI, 4w -22,367, 7th pct of 3y) · asset mgrs -46,700 (-35% OI, 4w -14,166, 11th pct of 3y)
**This week:** 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI (cons 0.2%, prev 0.3%) · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-10 19:00 ET New Zealand: RBNZ Press Conference · 11-11 16:45 ET New Zealand: Electronic Card Retail Sales

### USDCHF  `USDCHF=X`  0.8154 (2026-11-06)
**Move:** 1w -1.0% · 4w -1.9% (68th pct of 2y 4w moves) · 13w +0.4% · 52w range position 72% (lo 0.7632 / hi 0.8357)
**Drivers (recent corr):** US10Y +0.48 [textbook] · ^VIX -0.10 [weak] · GC=F +0.13 [weak] → **in charge: US10Y** (US yields)
**Last 20 sessions decomposed (R² 0.27, n=60):** actual -1.9% = US10Y -1.6% · ^VIX +0.3% · GC=F -0.1% · unexplained -0.6%
**Positioning (CFTC SWISS FRANC, 2026-11-03, + = long USDCHF):** lev funds +16,845 (+13% OI, 4w +5,495, 95th pct of 3y) · asset mgrs +20,853 (+16% OI, 4w -16,526, 18th pct of 3y)
**This week:** 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI (cons 0.2%, prev 0.3%) · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 14:00 ET United States: Federal Budget Balance


## 3. G10 crosses

### AUDNZD  `AUDNZD=X`  1.239 (2026-11-06)
**Move:** 1w -0.7% · 4w -0.2% (17th pct of 2y 4w moves) · 13w +3.3% · 52w range position 87% (lo 1.141 / hi 1.254)
**Drivers (recent corr):** HG=F +0.12 [weak] · ^AXJO -0.18 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.09, n=60):** actual -0.2% = ^AXJO -0.5% · HG=F -0.2% · unexplained +0.4%
**This week:** 11-10 19:00 ET New Zealand: RBNZ Press Conference · 11-11 16:45 ET New Zealand: Electronic Card Retail Sales

### EURGBP  `EURGBP=X`  0.8344 (2026-11-06)
**Move:** 1w -0.2% · 4w -1.5% (85th pct of 2y 4w moves) · 13w -2.6% · 52w range position 2% (lo 0.8336 / hi 0.8842)
**Drivers (recent corr):** GB10Y +0.16 [weak] · FR_DE (missing) → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual -1.6% = GB10Y +0.0% · unexplained -1.6%
**This week:** 11-09 19:01 ET United Kingdom: BRC Retail Sales Monitor · 11-10 01:30 ET France: French Unemployment Rate · 11-12 02:00 ET United Kingdom: GDP (cons 0.7%, prev 0.5%) · 11-12 02:00 ET United Kingdom: Monthly GDP 3M/3M Change · 11-12 07:00 ET United Kingdom: NIESR Monthly GDP Tracker · 11-13 03:00 ET Spain: Core CPI (cons 3.1%, prev 3.1%)

### EURCHF  `EURCHF=X`  0.9156 (2026-11-06)
**Move:** 1w -0.6% · 4w -1.8% (93rd pct of 2y 4w moves) · 13w -2.2% · 52w range position 30% (lo 0.9023 / hi 0.9466)
**Drivers (recent corr):** ^STOXX50E +0.10 [weak] · FR_DE (missing) · ^VIX -0.23 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.01, n=60):** actual -1.8% = ^STOXX50E -0.0% · ^VIX -0.0% · unexplained -1.8%
**This week:** 11-10 01:30 ET France: French Unemployment Rate · 11-13 03:00 ET Spain: Core CPI (cons 3.1%, prev 3.1%) · 11-13 05:00 ET Euro Zone: Employment Change · 11-13 05:00 ET Euro Zone: GDP (cons 0.4%, prev 0.4%)


## 4. EM FX

### USDMXN  `USDMXN=X`  18.78 (2026-11-06)
**Move:** 1w -0.4% · 4w +3.3% (89th pct of 2y 4w moves) · 13w +9.2% · 52w range position 96% (lo 16.89 / hi 18.85)
**Drivers (recent corr):** ^VIX +0.27 [weak] · ^GSPC -0.24 [weak] · CL=F +0.73 [INVERTED] · USDBRL=X -0.23 [weak] → **in charge: CL=F** (Oil)
**Last 20 sessions decomposed (R² 0.16, n=60):** actual +3.2% = USDBRL=X +0.8% · ^GSPC +0.5% · ^VIX +0.3% · CL=F -0.1% · unexplained +1.7%
**Positioning (CFTC MEXICAN PESO, 2026-11-03, + = long USDMXN):** lev funds -71,381 (-25% OI, 4w +3,546, 6th pct of 3y) · asset mgrs +36,349 (+13% OI, 4w +15,750, 100th pct of 3y)
**This week:** 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI (cons 0.2%, prev 0.3%) · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 14:00 ET United States: Federal Budget Balance

### USDBRL  `USDBRL=X`  5.503 (2026-11-06)
**Move:** 1w +2.2% · 4w +9.7% (100th pct of 2y 4w moves) · 13w +7.5% · 52w range position 87% (lo 4.906 / hi 5.59)
**Drivers (recent corr):** ^VIX +0.06 [weak] · HG=F +0.29 [weak] · EWZ -0.95 [textbook] → **in charge: EWZ** (Brazil equities (local flows))
**Last 20 sessions decomposed (R² 0.86, n=60):** actual +9.2% = EWZ +9.0% · ^VIX +0.3% · HG=F +0.2% · unexplained -0.3%
**Positioning (CFTC BRAZILIAN REAL, 2026-11-03, + = long USDBRL):** lev funds -38,613 (-22% OI, 4w -11,217, 1st pct of 3y) · asset mgrs -49,879 (-29% OI, 4w +6,731, 48th pct of 3y)
**This week:** 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 06:00 ET Brazil: BCB Copom Meeting Minutes · 11-10 08:30 ET United States: Core CPI (cons 0.2%, prev 0.3%) · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 07:00 ET Brazil: CPI

### USDZAR  `USDZAR=X`  16.48 (2026-11-06)
**Move:** 1w -0.8% · 4w -0.6% (21st pct of 2y 4w moves) · 13w +0.8% · 52w range position 47% (lo 15.71 / hi 17.35)
**Drivers (recent corr):** GC=F -0.03 [weak] · ^VIX +0.50 [textbook] · HG=F +0.08 [weak] → **in charge: ^VIX** (Carry / risk)
**Last 20 sessions decomposed (R² 0.16, n=60):** actual -0.6% = ^VIX +1.1% · HG=F -0.2% · GC=F +0.2% · unexplained -1.7%
**Positioning (CFTC SO AFRICAN RAND, 2026-11-03, + = long USDZAR):** lev funds -6,317 (-17% OI, 4w -1,908, 16th pct of 3y) · asset mgrs -14,523 (-40% OI, 4w +3,361, 33rd pct of 3y)
**This week:** 11-10 04:30 ET South Africa: Unemployment Rate · 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI (cons 0.2%, prev 0.3%) · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 14:00 ET United States: Federal Budget Balance

### USDKRW  `USDKRW=X`  1,356 (2026-11-06)
**Move:** 1w +1.4% · 4w +1.0% (33rd pct of 2y 4w moves) · 13w -4.6% · 52w range position 14% (lo 1,324 / hi 1,552)
**Drivers (recent corr):** ^KS11 +0.09 [weak] · SOXX -0.31 [textbook] · DX-Y.NYB +0.04 [weak] → **in charge: SOXX** (Global semis cycle)
**Last 20 sessions decomposed (R² 0.12, n=60):** actual +1.0% = SOXX +1.9% · ^KS11 -1.8% · DX-Y.NYB +0.0% · unexplained +0.9%
**This week:** 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI (cons 0.2%, prev 0.3%) · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-10 18:00 ET South Korea: Unemployment Rate · 11-12 14:00 ET United States: Federal Budget Balance


## 5. CE3 FX

### EURCZK  `EURCZK=X`  24.31 (2026-11-06)
**Move:** 1w -0.1% · 4w -0.2% (36th pct of 2y 4w moves) · 13w +0.3% · 52w range position 52% (lo 24.07 / hi 24.53)
**Drivers (recent corr):** ^STOXX50E -0.37 [textbook] · EURPLN=X +0.66 [textbook] → **in charge: EURPLN=X** (CE3 block)
**Last 20 sessions decomposed (R² 0.29, n=60):** actual -0.2% = EURPLN=X +0.1% · ^STOXX50E +0.0% · unexplained -0.4%
**This week:** 11-10 01:30 ET France: French Unemployment Rate · 11-13 03:00 ET Spain: Core CPI (cons 3.1%, prev 3.1%) · 11-13 05:00 ET Euro Zone: Employment Change · 11-13 05:00 ET Euro Zone: GDP (cons 0.4%, prev 0.4%)

### EURPLN  `EURPLN=X`  4.4 (2026-11-06)
**Move:** 1w +0.3% · 4w +0.6% (57th pct of 2y 4w moves) · 13w +2.4% · 52w range position 94% (lo 4.197 / hi 4.412)
**Drivers (recent corr):** ^STOXX50E -0.31 [textbook] · ^VIX +0.46 [textbook] → **in charge: ^VIX** (Risk)
**Last 20 sessions decomposed (R² 0.18, n=60):** actual +0.6% = ^VIX +0.4% · ^STOXX50E +0.0% · unexplained +0.2%
**This week:** 11-10 01:30 ET France: French Unemployment Rate · 11-13 03:00 ET Spain: Core CPI (cons 3.1%, prev 3.1%) · 11-13 05:00 ET Euro Zone: Employment Change · 11-13 05:00 ET Euro Zone: GDP (cons 0.4%, prev 0.4%)


## 6. Equities

### S&P 500  `^GSPC`  7,377 (2026-11-06)
**Move:** 1w -2.7% · 4w -5.6% (87th pct of 2y 4w moves) · 13w -4.9% · 52w range position 70% (lo 6,344 / hi 7,819)
**Drivers (recent corr):** US10Y +0.33 [INVERTED, was textbook] · HYG_TLT +0.39 [textbook] · DX-Y.NYB +0.01 [weak] · CL=F -0.36 [textbook] · ^VIX -0.96 [textbook] → **in charge: ^VIX** (Vol)
**Last 20 sessions decomposed (R² 0.84, n=60):** actual -5.7% = ^VIX -4.3% · HYG_TLT -1.4% · US10Y +1.3% · CL=F +0.0% · DX-Y.NYB +0.0% · unexplained -1.4%
**Positioning (CFTC E-MINI S&P 500, 2026-11-03, + = long S&P 500):** lev funds -372,318 (-19% OI, 4w +42,769, 35th pct of 3y) · asset mgrs +928,584 (+47% OI, 4w +21,969, 48th pct of 3y)
**This week:** 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI (cons 0.2%, prev 0.3%) · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 14:00 ET United States: Federal Budget Balance

### Nasdaq 100  `^NDX`  26,990 (2026-11-06)
**Move:** 1w -4.9% · 4w -12.6% (95th pct of 2y 4w moves) · 13w -9.2% · 52w range position 49% (lo 22,953 / hi 31,224)
**Drivers (recent corr):** US10Y +0.52 [INVERTED] · SOXX +0.95 [textbook] · HYG_TLT +0.56 [textbook] · BTC-USD +0.75 [textbook] → **in charge: SOXX** (Semis / AI capex)
**Last 20 sessions decomposed (R² 0.86, n=60):** actual -13.5% = SOXX -11.6% · US10Y +1.4% · HYG_TLT -1.0% · BTC-USD -1.0% · unexplained -1.3%
**Positioning (CFTC NASDAQ MINI, 2026-11-03, + = long Nasdaq 100):** lev funds +10,073 (+3% OI, 4w +29,285, 97th pct of 3y) · asset mgrs +73,137 (+25% OI, 4w -661, 45th pct of 3y)
**This week:** 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI (cons 0.2%, prev 0.3%) · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 14:00 ET United States: Federal Budget Balance

### Russell 2000  `^RUT`  2,754 (2026-11-06)
**Move:** 1w -2.1% · 4w -1.9% (24th pct of 2y 4w moves) · 13w -9.2% · 52w range position 59% (lo 2,305 / hi 3,068)
**Drivers (recent corr):** US2Y +0.17 [weak] · HYG_TLT +0.19 [weak] · ^GSPC +0.90 [textbook] → **in charge: ^GSPC** (Beta)
**Last 20 sessions decomposed (R² 0.73, n=60):** actual -1.9% = ^GSPC -5.8% · US2Y +1.3% · HYG_TLT +0.5% · unexplained +2.1%
**This week:** 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI (cons 0.2%, prev 0.3%) · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 14:00 ET United States: Federal Budget Balance

### Euro Stoxx 50  `^STOXX50E`  6,170 (2026-11-06)
**Move:** 1w +0.6% · 4w -0.0% (1st pct of 2y 4w moves) · 13w -5.4% · 52w range position 64% (lo 5,501 / hi 6,551)
**Drivers (recent corr):** FR_DE (missing) · ^GSPC +0.41 [textbook] · BZ=F -0.39 [textbook] · EURUSD=X -0.06 [weak] → **in charge: ^GSPC** (US lead)
**Last 20 sessions decomposed (R² 0.27, n=60):** actual -0.0% = ^GSPC -1.8% · BZ=F +0.5% · EURUSD=X +0.0% · unexplained +1.2%
**This week:** 11-10 01:30 ET France: French Unemployment Rate · 11-13 03:00 ET Spain: Core CPI (cons 3.1%, prev 3.1%) · 11-13 05:00 ET Euro Zone: Employment Change · 11-13 05:00 ET Euro Zone: GDP (cons 0.4%, prev 0.4%)

### CAC 40  `^FCHI`  8,139 (2026-11-06)
**Move:** 1w +2.1% · 4w +4.3% (75th pct of 2y 4w moves) · 13w -6.6% · 52w range position 45% (lo 7,666 / hi 8,726)
**Drivers (recent corr):** FR_DE (missing) · ^STOXX50E +0.88 [textbook] → **in charge: ^STOXX50E** (European block)
**Last 20 sessions decomposed (R² 0.77, n=60):** actual +4.2% = ^STOXX50E -0.0% · unexplained +4.3%
**This week:** 11-10 01:30 ET France: French Unemployment Rate · 11-13 03:00 ET Spain: Core CPI (cons 3.1%, prev 3.1%) · 11-13 05:00 ET Euro Zone: Employment Change · 11-13 05:00 ET Euro Zone: GDP (cons 0.4%, prev 0.4%)

### DAX  `^GDAXI`  25,820 (2026-11-06)
**Move:** 1w +0.0% · 4w +2.9% (55th pct of 2y 4w moves) · 13w -1.9% · 52w range position 82% (lo 22,301 / hi 26,570)
**Drivers (recent corr):** DE10Y +0.33 [INVERTED] · ^GSPC +0.34 [textbook] → **in charge: ^GSPC** (Global risk)
**Last 20 sessions decomposed (R² 0.20, n=60):** actual +2.9% = ^GSPC -2.2% · DE10Y +0.8% · unexplained +4.4%
**This week:** 11-10 01:30 ET France: French Unemployment Rate · 11-13 03:00 ET Spain: Core CPI (cons 3.1%, prev 3.1%) · 11-13 05:00 ET Euro Zone: Employment Change · 11-13 05:00 ET Euro Zone: GDP (cons 0.4%, prev 0.4%)

### FTSE 100  `^FTSE`  10,674 (2026-11-06)
**Move:** 1w -0.5% · 4w +1.2% (29th pct of 2y 4w moves) · 13w -2.1% · 52w range position 83% (lo 9,507 / hi 10,911)
**Drivers (recent corr):** BZ=F -0.27 [weak] · GBPUSD=X +0.01 [weak] · GB10Y -0.68 [textbook] → **in charge: GB10Y** (Gilts)
**Last 20 sessions decomposed (R² 0.39, n=60):** actual +1.1% = GB10Y +2.3% · BZ=F +0.1% · GBPUSD=X +0.0% · unexplained -1.3%
**This week:** 11-09 19:01 ET United Kingdom: BRC Retail Sales Monitor · 11-12 02:00 ET United Kingdom: GDP (cons 0.7%, prev 0.5%) · 11-12 02:00 ET United Kingdom: Monthly GDP 3M/3M Change · 11-12 07:00 ET United Kingdom: NIESR Monthly GDP Tracker

### Nikkei 225  `^N225`  57,435 (2026-11-06)
**Move:** 1w -9.3% · 4w -16.8% (99th pct of 2y 4w moves) · 13w -12.5% · 52w range position 37% (lo 48,538 / hi 72,366)
**Drivers (recent corr):** USDJPY=X +0.37 [textbook] · ^NDX +0.55 [textbook] · SOXX +0.55 [textbook] → **in charge: SOXX** (Chips (prior US day))
**Last 20 sessions decomposed (R² 0.27, n=60):** actual -18.4% = ^NDX -5.6% · SOXX -3.9% · USDJPY=X +0.1% · unexplained -9.0%

### KOSPI  `^KS11`  5,060 (2026-11-06)
**Move:** 1w -11.7% · 4w -23.6% (95th pct of 2y 4w moves) · 13w -19.2% · 52w range position 23% (lo 3,846 / hi 9,115)
**Drivers (recent corr):** SOXX +0.36 [textbook] · ^NDX +0.24 [weak] → **in charge: SOXX** (Memory / AI hardware (prior US day))
**Last 20 sessions decomposed (R² 0.17, n=60):** actual -27.0% = SOXX -22.5% · ^NDX +10.7% · unexplained -15.1%
**This week:** 11-10 18:00 ET South Korea: Unemployment Rate

### Hang Seng  `^HSI`  24,482 (2026-11-06)
**Move:** 1w +5.1% · 4w +1.1% (17th pct of 2y 4w moves) · 13w -4.6% · 52w range position 34% (lo 22,672 / hi 27,968)
**Drivers (recent corr):** ^NDX +0.07 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual +1.1% = ^NDX -0.6% · unexplained +1.7%
**This week:** 11-08 20:30 ET China: CPI (cons 0.8%, prev 0.9%) · 11-13 03:30 ET Hong Kong: GDP (cons 1.9%, prev 1.9%)

### ASX 200  `^AXJO`  9,021 (2026-11-06)
**Move:** 1w +1.3% · 4w +3.5% (74th pct of 2y 4w moves) · 13w -2.6% · 52w range position 72% (lo 8,366 / hi 9,272)
**Drivers (recent corr):** HG=F +0.39 [textbook] · ^GSPC +0.46 [textbook] → **in charge: ^GSPC** (US lead (prior US day))
**Last 20 sessions decomposed (R² 0.19, n=60):** actual +3.4% = ^GSPC -1.1% · HG=F -0.8% · unexplained +5.4%


## 7. Rates

### US 2y  `US2Y`  4.65% (2026-11-06)
**Move:** 1w -7bp · 4w -37bp (94th pct of 2y 4w moves) · 13w +29bp · 52w range position 72% (lo 3.512 / hi 5.089)
**Drivers (recent corr):** CL=F -0.20 [weak] · ^GSPC +0.44 [textbook, was INVERTED] → **in charge: ^GSPC** (Risk-on = fewer cuts / more hikes)
**Last 20 sessions decomposed (R² 0.02, n=60):** actual -37bp = ^GSPC -5bp · CL=F -0bp · unexplained -33bp
**Positioning (CFTC UST 2Y NOTE, 2026-11-03, + = long US 2y):** lev funds +1,450,892 (+33% OI, 4w +193,408, 15th pct of 3y) · asset mgrs -1,876,612 (-42% OI, 4w -197,525, 58th pct of 3y)
**This week:** 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI (cons 0.2%, prev 0.3%) · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 14:00 ET United States: Federal Budget Balance

### US 10y  `US10Y`  4.86% (2026-11-06)
**Move:** 1w -7bp · 4w -38bp (95th pct of 2y 4w moves) · 13w +20bp · 52w range position 66% (lo 3.962 / hi 5.311)
**Drivers (recent corr):** CL=F -0.15 [weak] · ^NDX +0.52 [INVERTED] · T10YIE (missing) · DE10Y +0.29 [weak] → **in charge: ^NDX** (Textbook: yields up hurt stocks; + means bonds hedge stocks)
**Last 20 sessions decomposed (R² 0.11, n=60):** actual -38bp = ^NDX -14bp · DE10Y -5bp · CL=F -0bp · unexplained -19bp
**Positioning (CFTC UST 10Y NOTE, 2026-11-03, + = long US 10y):** lev funds +2,262,310 (+38% OI, 4w +122,525, 86th pct of 3y) · asset mgrs -3,030,236 (-51% OI, 4w -202,097, 1st pct of 3y)
**This week:** 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI (cons 0.2%, prev 0.3%) · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 14:00 ET United States: Federal Budget Balance

### US 30y  `US30Y`  5.26% (2026-11-06)
**Move:** 1w -5bp · 4w -34bp (95th pct of 2y 4w moves) · 13w +5bp · 52w range position 61% (lo 4.633 / hi 5.665)
**Drivers (recent corr):** US2Y +0.88 [textbook] · T10YIE (missing) → **in charge: US2Y** (Front end)
**Last 20 sessions decomposed (R² 0.66, n=60):** actual -34bp = US2Y -25bp · unexplained -9bp
**Positioning (CFTC UST BOND, 2026-11-03, + = long US 30y):** lev funds +166,257 (+9% OI, 4w -23,421, 3rd pct of 3y) · asset mgrs -415,379 (-22% OI, 4w -9,751, 90th pct of 3y)
**This week:** 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI (cons 0.2%, prev 0.3%) · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 14:00 ET United States: Federal Budget Balance

### Bund 10y  `DE10Y`  3.27% (2026-11-06)
**Move:** 1w -11bp · 4w -23bp (83rd pct of 2y 4w moves) · 13w +10bp · 52w range position 60% (lo 2.68 / hi 3.66)
**Drivers (recent corr):** US10Y +0.29 [weak] · BZ=F -0.12 [weak] · FR_DE (missing) → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.04, n=60):** actual -23bp = US10Y -7bp · BZ=F -1bp · unexplained -16bp
**This week:** 11-10 01:30 ET France: French Unemployment Rate · 11-13 03:00 ET Spain: Core CPI (cons 3.1%, prev 3.1%) · 11-13 05:00 ET Euro Zone: Employment Change · 11-13 05:00 ET Euro Zone: GDP (cons 0.4%, prev 0.4%)

### Gilt 10y  `GB10Y`  5.15% (2026-11-06)
**Move:** 1w -13bp · 4w -30bp (90th pct of 2y 4w moves) · 13w +15bp · 52w range position 71% (lo 4.352 / hi 5.478)
**Drivers (recent corr):** US10Y +0.65 [textbook] · GBPUSD=X -0.22 [weak] → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.37, n=60):** actual -30bp = US10Y -22bp · GBPUSD=X -3bp · unexplained -5bp
**This week:** 11-09 19:01 ET United Kingdom: BRC Retail Sales Monitor · 11-12 02:00 ET United Kingdom: GDP (cons 0.7%, prev 0.5%) · 11-12 02:00 ET United Kingdom: Monthly GDP 3M/3M Change · 11-12 07:00 ET United Kingdom: NIESR Monthly GDP Tracker

### JGB 10y  `JP10Y`  2.81% (2026-11-06)
**Move:** 1w -1bp · 4w -22bp (90th pct of 2y 4w moves) · 13w +0bp · 52w range position 79% (lo 1.688 / hi 3.111)
**Drivers (recent corr):** US10Y +0.56 [textbook] · USDJPY=X +0.60 [textbook] → **in charge: USDJPY=X** (Weak yen -> BoJ pressure)
**Last 20 sessions decomposed (R² 0.49, n=60):** actual -22bp = US10Y -12bp · USDJPY=X -1bp · unexplained -9bp

### Canada 10y  `CA10Y`  3.67% (2026-11-06)
**Move:** 1w -11bp · 4w -19bp (76th pct of 2y 4w moves) · 13w +3bp · 52w range position 63% (lo 3.12 / hi 3.99)
**Drivers (recent corr):** US10Y +0.85 [textbook] · CL=F +0.08 [weak] → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.68, n=60):** actual -19bp = US10Y -27bp · CL=F -0bp · unexplained +8bp

### French spread (proxy)
_no data_


## 8. Commodities

### WTI crude  `CL=F`  90.34 (2026-11-06)
**Move:** 1w -13.2% · 4w -1.6% (17th pct of 2y 4w moves) · 13w +15.6% · 52w range position 61% (lo 55.27 / hi 112.9)
**Drivers (recent corr):** XLE +0.41 [textbook] · ^GSPC -0.36 [INVERTED] · HG=F -0.33 [INVERTED] · DX-Y.NYB -0.00 [weak] → **in charge: XLE** (Energy equities (do they believe the move?))
**Last 20 sessions decomposed (R² 0.32, n=60):** actual -1.7% = HG=F +4.6% · ^GSPC +4.0% · XLE -3.2% · DX-Y.NYB -0.1% · unexplained -7.1%
**Positioning (CFTC WTI-PHYSICAL, 2026-11-03, + = long WTI crude):** managed money +21,728 (+1% OI, 4w -31,870, 10th pct of 3y) · producers +369,347 (+19% OI, 4w +34,337, 96th pct of 3y)
**This week:** 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI (cons 0.2%, prev 0.3%) · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 14:00 ET United States: Federal Budget Balance

### Gold  `GC=F`  4,080 (2026-11-06)
**Move:** 1w +4.6% · 4w -3.2% (39th pct of 2y 4w moves) · 13w -7.3% · 52w range position 13% (lo 3,899 / hi 5,318)
**Drivers (recent corr):** DFII10 (missing) · DX-Y.NYB -0.22 [weak] · SI=F +0.91 [textbook] · BTC-USD +0.20 [weak] → **in charge: SI=F** (Precious block)
**Last 20 sessions decomposed (R² 0.77, n=60):** actual -3.3% = SI=F -7.3% · BTC-USD +0.3% · DX-Y.NYB -0.0% · unexplained +3.7%
**Positioning (CFTC GOLD, 2026-11-03, + = long Gold):** managed money +103,614 (+26% OI, 4w -7,373, 23rd pct of 3y) · producers -8,912 (-2% OI, 4w +10,589, 100th pct of 3y)
**This week:** 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI (cons 0.2%, prev 0.3%) · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 14:00 ET United States: Federal Budget Balance

### Silver  `SI=F`  51.97 (2026-11-06)
**Move:** 1w +5.8% · 4w -14.3% (78th pct of 2y 4w moves) · 13w -17.9% · 52w range position 6% (lo 48.02 / hi 115.1)
**Drivers (recent corr):** GC=F +0.91 [textbook] · HG=F +0.46 [textbook] → **in charge: GC=F** (Gold)
**Last 20 sessions decomposed (R² 0.80, n=60):** actual -15.5% = GC=F -4.4% · HG=F -2.5% · unexplained -8.6%
**Positioning (CFTC SILVER, 2026-11-03, + = long Silver):** managed money +4,035 (+3% OI, 4w -3,493, 5th pct of 3y) · producers -13,145 (-11% OI, 4w +3,108, 97th pct of 3y)
**This week:** 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI (cons 0.2%, prev 0.3%) · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 14:00 ET United States: Federal Budget Balance

### Copper  `HG=F`  6.26 (2026-11-06)
**Move:** 1w -3.1% · 4w -5.8% (60th pct of 2y 4w moves) · 13w -4.7% · 52w range position 71% (lo 4.938 / hi 6.804)
**Drivers (recent corr):** ^GSPC +0.25 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.05, n=60):** actual -5.9% = ^GSPC -2.0% · unexplained -4.0%
**Positioning (CFTC COPPER- #1, 2026-11-03, + = long Copper):** managed money +34,890 (+11% OI, 4w -26,244, 48th pct of 3y) · producers -55,218 (-17% OI, 4w +37,502, 53rd pct of 3y)
**This week:** 11-08 20:30 ET China: CPI (cons 0.8%, prev 0.9%) · 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI (cons 0.2%, prev 0.3%) · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 14:00 ET United States: Federal Budget Balance

### Nat gas (US)  `NG=F`  3.003 (2026-11-06)
**Move:** 1w +3.6% · 4w -6.7% (34th pct of 2y 4w moves) · 13w +12.8% · 52w range position 10% (lo 2.523 / hi 7.46)
**Drivers (recent corr):** CL=F -0.07 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual -7.0% = CL=F -0.0% · unexplained -6.9%
**Positioning (CFTC NAT GAS NYME, 2026-11-03, + = long Nat gas (US)):** managed money -225,359 (-13% OI, 4w -80,822, 1st pct of 3y) · producers -418 (-0% OI, 4w +7,811, 92nd pct of 3y)
**This week:** 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI (cons 0.2%, prev 0.3%) · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 14:00 ET United States: Federal Budget Balance


## 9. Crypto

### Bitcoin  `BTC-USD`  75,942 (2026-11-06)
**Move:** 1w -1.6% · 4w -8.0% (57th pct of 2y 4w moves) · 13w +17.0% · 52w range position 37% (lo 58,559 / hi 105,997)
**Drivers (recent corr):** ^NDX +0.75 [textbook] · DX-Y.NYB -0.08 [weak] · GC=F +0.20 [weak] → **in charge: ^NDX** (Tech / speculation)
**Last 20 sessions decomposed (R² 0.30, n=60):** actual -8.3% = ^NDX -13.6% · GC=F -0.5% · DX-Y.NYB -0.0% · unexplained +5.8%
**Positioning (CFTC BITCOIN, 2026-11-03, + = long Bitcoin):** lev funds -2,591 (-15% OI, 4w +4,261, 100th pct of 3y) · asset mgrs +2,403 (+14% OI, 4w -1,129, 3rd pct of 3y)
**This week:** 11-10 06:00 ET United States: NFIB Small Business Optimism · 11-10 08:30 ET United States: Core CPI (cons 0.2%, prev 0.3%) · 11-10 08:30 ET United States: Core CPI Index · 11-10 08:30 ET United States: CPI · 11-12 14:00 ET United States: Federal Budget Balance

