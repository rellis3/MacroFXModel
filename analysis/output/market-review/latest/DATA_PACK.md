# Market Review Data Pack: 2026-11-04

Fetched 2026-11-04T02:41:01+00:00. Descriptive numbers for the weekly review (read with `education/market_reviews/PLAYBOOK.md`). Correlations are of daily moves: last 20 sessions vs the 60 before. They are noisy; a flip is a question, not a signal.

**Data notes:** fred DGS2: The read operation timed out · fred DFII10: The read operation timed out · fred T10YIE: The read operation timed out · fred BAMLH0A0HYM2: The read operation timed out · fred BAMLC0A0CM: The read operation timed out · FRED DGS2 missing: US 2y = US 5y stand-in for this run · No local OAT/Bund futures: French spread proxy unavailable

## 1. Regime gauges: which story is the market trading?

| Pair | Recent | Before | Textbook sign | Status | What it means |
|---|---|---|---|---|---|
| CL=F vs US10Y | -0.29 | +0.25 | + | weak | Oil vs yields: + = oil is an inflation story; - = oil is a growth tax (2008-style) |
| ^NDX vs US10Y | +0.64 | -0.26 | − | INVERTED | Stocks vs yields: - = rates drive stocks; + = growth scare, bonds hedge stocks |
| HYG_TLT vs ^NDX | +0.71 | -0.15 | + | textbook | Credit vs tech: high + = credit and equities are one trade (credit stress leading) |
| DX-Y.NYB vs ^GSPC | +0.07 | +0.04 | − | weak | Dollar vs stocks: - = safe-haven dollar; ~0/+ = "sell America" or liquidity dash |
| AUDUSD=X vs ^NDX | +0.33 | +0.43 | + | textbook | Aussie vs tech: near 0 = AUD trading commodities not risk |
| BTC-USD vs ^NDX | +0.61 | +0.35 | + | textbook | Bitcoin vs tech: high = one liquidity complex |
| XLE vs CL=F | +0.25 | +0.38 | + | weak | Energy stocks vs oil: falling = equity investors fade the oil move |
| USDJPY=X vs US10Y | +0.52 | +0.24 | + | textbook | Yen vs yields: high = yen is a pure rates trade |

Equity vol vs bond vol: VIX 20.8 (1y pct 85) · MOVE 100 (1y pct 90). When bond vol leads equity vol, the stress is in rates/credit first.

**Fed funds futures (implied average rate by contract month; vs ~1 week earlier):** V6 3.882% (-0.002) · X6 3.882% (+0.002) · Z6 4.015% (+0.000) · F7 4.075% (-0.005) · G7 4.135% (-0.010) · H7 4.200% (-0.010) · J7 4.275% (-0.020) · K7 4.340% (-0.015) · M7 4.405% (-0.015) · N7 4.430% (-0.015) · Q7 4.450% (-0.015) · U7 4.465% (-0.015) · V7 4.470% (-0.020) (as of 2026-10-26)

## 2. G10 FX

### EURUSD  `EURUSD=X`  1.126 (2026-11-04)
**Move:** 1w +0.9% · 4w +0.5% (16th pct of 2y 4w moves) · 13w -2.6% · 52w range position 14% (lo 1.113 / hi 1.202)
**Drivers (recent corr):** US_EA2 +0.18 [weak] · US_DE10 +0.20 [weak] · FR_DE (missing) · ^STOXX50E -0.26 [weak] · BZ=F -0.04 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.02, n=60):** actual +0.5% = US_EA2 +0.2% · ^STOXX50E -0.0% · US_DE10 -0.0% · BZ=F +0.0% · unexplained +0.4%
**Positioning (CFTC EURO FX, 2026-10-27, + = long EURUSD):** lev funds -71,574 (-8% OI, 4w -32,309, 1st pct of 3y) · asset mgrs +173,249 (+20% OI, 4w -47,354, 8th pct of 3y)
**This week:** 11-05 04:00 ET Italy: Italian Retail Sales · 11-05 08:30 ET United States: Nonfarm Productivity (cons 2.8%, prev 1.4%) · 11-06 05:00 ET Euro Zone: Retail Sales (cons -0.1%, prev 0.1%) · 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate

### USDJPY  `USDJPY=X`  157.6 (2026-11-04)
**Move:** 1w -0.2% · 4w -0.3% (9th pct of 2y 4w moves) · 13w -0.0% · 52w range position 45% (lo 152.5 / hi 163.9)
**Drivers (recent corr):** US10Y +0.52 [textbook] · US_JP10 +0.55 [textbook] · ^NDX +0.49 [textbook] · ^VIX -0.43 [textbook, was INVERTED] → **in charge: US_JP10** (US-Japan 10y gap)
**Last 20 sessions decomposed (R² 0.12, n=60):** actual -0.3% = US10Y -1.1% · ^NDX -0.9% · ^VIX +0.5% · US_JP10 +0.0% · unexplained +1.2%
**Positioning (CFTC JAPANESE YEN, 2026-10-27, + = long USDJPY):** lev funds +14,630 (+4% OI, 4w +469, 23rd pct of 3y) · asset mgrs -91,191 (-24% OI, 4w -39,557, 9th pct of 3y)
**This week:** 11-05 08:30 ET United States: Nonfarm Productivity (cons 2.8%, prev 1.4%) · 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-10 06:00 ET United States: NFIB Small Business Optimism

### GBPUSD  `GBPUSD=X`  1.347 (2026-11-04)
**Move:** 1w +1.1% · 4w +1.9% (73rd pct of 2y 4w moves) · 13w +0.0% · 52w range position 54% (lo 1.305 / hi 1.383)
**Drivers (recent corr):** US_GB10 -0.00 [weak] · GB10Y -0.06 [weak] · ^GSPC +0.10 [weak] · EURUSD=X +0.85 [textbook] → **in charge: EURUSD=X** (European block move)
**Last 20 sessions decomposed (R² 0.69, n=60):** actual +1.9% = EURUSD=X +0.4% · US_GB10 +0.1% · GB10Y +0.1% · ^GSPC -0.0% · unexplained +1.4%
**Positioning (CFTC BRITISH POUND, 2026-10-27, + = long GBPUSD):** lev funds +17,195 (+7% OI, 4w +12,589, 18th pct of 3y) · asset mgrs -128,893 (-51% OI, 4w -349, 6th pct of 3y)
**This week:** 11-05 07:00 ET United Kingdom: BoE Interest Rate Decision (cons 4.00%, prev 3.75%) · 11-05 07:00 ET United Kingdom: BoE MPC Meeting Minutes · 11-05 08:30 ET United States: Nonfarm Productivity (cons 2.8%, prev 1.4%) · 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate

### USDCAD  `USDCAD=X`  1.396 (2026-11-04)
**Move:** 1w -0.2% · 4w -2.1% (84th pct of 2y 4w moves) · 13w -0.3% · 52w range position 60% (lo 1.349 / hi 1.428)
**Drivers (recent corr):** CL=F +0.09 [weak] · US_CA2 +0.37 [textbook] · ^GSPC -0.08 [weak] → **in charge: US_CA2** (US-Canada 2y rate gap)
**Last 20 sessions decomposed (R² 0.26, n=60):** actual -2.1% = US_CA2 -1.0% · ^GSPC +0.3% · CL=F +0.0% · unexplained -1.4%
**Positioning (CFTC CANADIAN DOLLAR, 2026-10-27, + = long USDCAD):** lev funds +96,747 (+27% OI, 4w +27,103, 96th pct of 3y) · asset mgrs +1,325 (+0% OI, 4w -26,256, 15th pct of 3y)
**This week:** 11-05 08:30 ET United States: Nonfarm Productivity (cons 2.8%, prev 1.4%) · 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-06 08:30 ET Canada: Employment Change (cons 14.5K, prev -68.3K)

### AUDUSD  `AUDUSD=X`  0.6973 (2026-11-04)
**Move:** 1w -1.2% · 4w +0.1% (6th pct of 2y 4w moves) · 13w -1.2% · 52w range position 65% (lo 0.6449 / hi 0.7255)
**Drivers (recent corr):** HG=F -0.01 [weak] · ^NDX +0.33 [textbook] · GC=F -0.19 [weak] → **in charge: ^NDX** (Global risk proxy)
**Last 20 sessions decomposed (R² 0.10, n=60):** actual +0.1% = ^NDX -1.0% · GC=F +0.1% · HG=F -0.0% · unexplained +1.0%
**Positioning (CFTC AUSTRALIAN DOLLAR, 2026-10-27, + = long AUDUSD):** lev funds +48,414 (+15% OI, 4w -12,178, 85th pct of 3y) · asset mgrs -125,237 (-39% OI, 4w -52,038, 1st pct of 3y)
**This week:** 11-05 08:30 ET United States: Nonfarm Productivity (cons 2.8%, prev 1.4%) · 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-10 06:00 ET United States: NFIB Small Business Optimism

### NZDUSD  `NZDUSD=X`  0.5608 (2026-11-04)
**Move:** 1w -0.4% · 4w +0.1% (5th pct of 2y 4w moves) · 13w -4.8% · 52w range position 4% (lo 0.5587 / hi 0.6076)
**Drivers (recent corr):** AUDUSD=X +0.33 [textbook] · ^GSPC +0.20 [weak] · US2Y +0.14 [weak] → **in charge: AUDUSD=X** (Antipodean block)
**Last 20 sessions decomposed (R² 0.37, n=60):** actual +0.1% = US2Y +0.2% · AUDUSD=X +0.1% · ^GSPC -0.0% · unexplained -0.1%
**Positioning (CFTC NZ DOLLAR, 2026-10-27, + = long NZDUSD):** lev funds -22,554 (-17% OI, 4w -21,488, 8th pct of 3y) · asset mgrs -46,841 (-36% OI, 4w -25,613, 11th pct of 3y)
**This week:** 11-05 08:30 ET United States: Nonfarm Productivity (cons 2.8%, prev 1.4%) · 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-10 06:00 ET United States: NFIB Small Business Optimism

### USDCHF  `USDCHF=X`  0.8139 (2026-11-04)
**Move:** 1w -1.7% · 4w -2.3% (75th pct of 2y 4w moves) · 13w +0.9% · 52w range position 70% (lo 0.7632 / hi 0.8357)
**Drivers (recent corr):** US10Y +0.33 [textbook] · ^VIX -0.24 [weak] · GC=F +0.28 [weak] → **in charge: US10Y** (US yields)
**Last 20 sessions decomposed (R² 0.23, n=60):** actual -2.3% = US10Y -1.2% · ^VIX +0.4% · GC=F -0.1% · unexplained -1.4%
**Positioning (CFTC SWISS FRANC, 2026-10-27, + = long USDCHF):** lev funds +17,502 (+13% OI, 4w +3,507, 96th pct of 3y) · asset mgrs +25,067 (+19% OI, 4w -11,344, 34th pct of 3y)
**This week:** 11-05 03:30 ET Switzerland: Unemployment Rate n.s.a. · 11-05 03:30 ET Switzerland: Unemployment Rate s.a. (cons 3.1%, prev 3.1%) · 11-05 08:30 ET United States: Nonfarm Productivity (cons 2.8%, prev 1.4%) · 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate


## 3. G10 crosses

### AUDNZD  `AUDNZD=X`  1.243 (2026-11-04)
**Move:** 1w -0.8% · 4w +0.0% (2nd pct of 2y 4w moves) · 13w +3.7% · 52w range position 91% (lo 1.141 / hi 1.254)
**Drivers (recent corr):** HG=F +0.06 [weak] · ^AXJO +0.06 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.06, n=60):** actual +0.0% = ^AXJO -0.1% · HG=F -0.1% · unexplained +0.3%
**This week:** 11-10 19:00 ET New Zealand: RBNZ Press Conference · 11-11 16:45 ET New Zealand: Electronic Card Retail Sales

### EURGBP  `EURGBP=X`  0.8352 (2026-11-04)
**Move:** 1w -0.2% · 4w -1.5% (83rd pct of 2y 4w moves) · 13w -2.7% · 52w range position 1% (lo 0.8346 / hi 0.8842)
**Drivers (recent corr):** GB10Y +0.13 [weak] · FR_DE (missing) → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual -1.5% = GB10Y +0.0% · unexplained -1.5%
**This week:** 11-05 04:00 ET Italy: Italian Retail Sales · 11-05 07:00 ET United Kingdom: BoE Interest Rate Decision (cons 4.00%, prev 3.75%) · 11-05 07:00 ET United Kingdom: BoE MPC Meeting Minutes · 11-06 05:00 ET Euro Zone: Retail Sales (cons -0.1%, prev 0.1%) · 11-09 19:01 ET United Kingdom: BRC Retail Sales Monitor · 11-10 01:30 ET France: French Unemployment Rate

### EURCHF  `EURCHF=X`  0.9158 (2026-11-04)
**Move:** 1w -0.8% · 4w -1.8% (94th pct of 2y 4w moves) · 13w -1.8% · 52w range position 30% (lo 0.9023 / hi 0.9466)
**Drivers (recent corr):** ^STOXX50E +0.18 [weak] · FR_DE (missing) · ^VIX -0.37 [textbook] → **in charge: ^VIX** (Haven flows)
**Last 20 sessions decomposed (R² 0.02, n=60):** actual -1.9% = ^VIX +0.1% · ^STOXX50E -0.0% · unexplained -1.9%
**This week:** 11-05 03:30 ET Switzerland: Unemployment Rate n.s.a. · 11-05 03:30 ET Switzerland: Unemployment Rate s.a. (cons 3.1%, prev 3.1%) · 11-05 04:00 ET Italy: Italian Retail Sales · 11-06 05:00 ET Euro Zone: Retail Sales (cons -0.1%, prev 0.1%) · 11-10 01:30 ET France: French Unemployment Rate


## 4. EM FX

### USDMXN  `USDMXN=X`  18.83 (2026-11-04)
**Move:** 1w +1.1% · 4w +4.8% (95th pct of 2y 4w moves) · 13w +9.3% · 52w range position 99% (lo 16.89 / hi 18.85)
**Drivers (recent corr):** ^VIX -0.12 [weak] · ^GSPC +0.06 [weak] · CL=F +0.60 [INVERTED] · USDBRL=X -0.34 [INVERTED, was textbook] → **in charge: CL=F** (Oil)
**Last 20 sessions decomposed (R² 0.09, n=60):** actual +4.6% = USDBRL=X +0.7% · ^GSPC +0.5% · CL=F +0.1% · ^VIX -0.0% · unexplained +3.4%
**Positioning (CFTC MEXICAN PESO, 2026-10-27, + = long USDMXN):** lev funds -68,335 (-24% OI, 4w +12,252, 7th pct of 3y) · asset mgrs +25,201 (+9% OI, 4w +41,452, 100th pct of 3y)
**This week:** 11-05 08:30 ET United States: Nonfarm Productivity (cons 2.8%, prev 1.4%) · 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-10 06:00 ET United States: NFIB Small Business Optimism

### USDBRL  `USDBRL=X`  5.488 (2026-11-04)
**Move:** 1w +2.7% · 4w +9.3% (100th pct of 2y 4w moves) · 13w +6.8% · 52w range position 85% (lo 4.906 / hi 5.59)
**Drivers (recent corr):** ^VIX -0.10 [weak] · HG=F +0.27 [weak] · EWZ -0.94 [textbook] → **in charge: EWZ** (Brazil equities (local flows))
**Last 20 sessions decomposed (R² 0.86, n=60):** actual +8.9% = EWZ +8.4% · ^VIX +0.3% · HG=F +0.1% · unexplained +0.0%
**Positioning (CFTC BRAZILIAN REAL, 2026-10-27, + = long USDBRL):** lev funds -7,600 (-5% OI, 4w +1,953, 27th pct of 3y) · asset mgrs -52,010 (-31% OI, 4w +15,005, 43rd pct of 3y)
**This week:** 11-05 08:30 ET United States: Nonfarm Productivity (cons 2.8%, prev 1.4%) · 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-10 06:00 ET United States: NFIB Small Business Optimism

### USDZAR  `USDZAR=X`  16.59 (2026-11-04)
**Move:** 1w -0.1% · 4w -0.3% (10th pct of 2y 4w moves) · 13w +1.7% · 52w range position 52% (lo 15.71 / hi 17.4)
**Drivers (recent corr):** GC=F +0.29 [weak] · ^VIX +0.30 [weak] · HG=F +0.24 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.14, n=60):** actual -0.3% = ^VIX +1.0% · GC=F +0.1% · HG=F -0.0% · unexplained -1.3%
**Positioning (CFTC SO AFRICAN RAND, 2026-10-27, + = long USDZAR):** lev funds -5,262 (-14% OI, 4w -608, 22nd pct of 3y) · asset mgrs -16,859 (-45% OI, 4w +3,861, 27th pct of 3y)
**This week:** 11-05 08:30 ET United States: Nonfarm Productivity (cons 2.8%, prev 1.4%) · 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-10 04:30 ET South Africa: Unemployment Rate

### USDKRW  `USDKRW=X`  1,337 (2026-11-04)
**Move:** 1w -0.3% · 4w -0.2% (8th pct of 2y 4w moves) · 13w -5.9% · 52w range position 6% (lo 1,324 / hi 1,552)
**Drivers (recent corr):** ^KS11 +0.34 [INVERTED] · SOXX -0.05 [weak] · DX-Y.NYB +0.14 [weak] → **in charge: ^KS11** (KOSPI (chip exporters))
**Last 20 sessions decomposed (R² 0.12, n=60):** actual -0.2% = ^KS11 -1.6% · SOXX +1.1% · DX-Y.NYB -0.2% · unexplained +0.6%
**This week:** 11-05 08:30 ET United States: Nonfarm Productivity (cons 2.8%, prev 1.4%) · 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-10 06:00 ET United States: NFIB Small Business Optimism


## 5. CE3 FX

### EURCZK  `EURCZK=X`  24.35 (2026-11-04)
**Move:** 1w +0.0% · 4w -0.3% (42nd pct of 2y 4w moves) · 13w +0.7% · 52w range position 60% (lo 24.07 / hi 24.53)
**Drivers (recent corr):** ^STOXX50E -0.01 [weak] · EURPLN=X +0.51 [textbook] → **in charge: EURPLN=X** (CE3 block)
**Last 20 sessions decomposed (R² 0.21, n=60):** actual -0.3% = EURPLN=X +0.2% · ^STOXX50E +0.0% · unexplained -0.5%
**This week:** 11-05 04:00 ET Italy: Italian Retail Sales · 11-06 05:00 ET Euro Zone: Retail Sales (cons -0.1%, prev 0.1%) · 11-10 01:30 ET France: French Unemployment Rate

### EURPLN  `EURPLN=X`  4.417 (2026-11-04)
**Move:** 1w +0.4% · 4w +0.9% (73rd pct of 2y 4w moves) · 13w +2.8% · 52w range position 100% (lo 4.197 / hi 4.417)
**Drivers (recent corr):** ^STOXX50E -0.09 [weak] · ^VIX +0.20 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.08, n=60):** actual +0.9% = ^VIX +0.2% · ^STOXX50E +0.0% · unexplained +0.7%
**This week:** 11-05 04:00 ET Italy: Italian Retail Sales · 11-06 05:00 ET Euro Zone: Retail Sales (cons -0.1%, prev 0.1%) · 11-10 01:30 ET France: French Unemployment Rate


## 6. Equities

### S&P 500  `^GSPC`  7,569 (2026-11-04)
**Move:** 1w -2.3% · 4w -3.0% (63rd pct of 2y 4w moves) · 13w -2.0% · 52w range position 83% (lo 6,344 / hi 7,819)
**Drivers (recent corr):** US10Y +0.50 [INVERTED, was textbook] · HYG_TLT +0.55 [textbook] · DX-Y.NYB +0.07 [weak] · CL=F -0.11 [weak] · ^VIX -0.90 [textbook] → **in charge: ^VIX** (Vol)
**Last 20 sessions decomposed (R² 0.73, n=60):** actual -3.0% = ^VIX -2.8% · HYG_TLT -1.5% · US10Y +1.3% · CL=F -0.1% · DX-Y.NYB -0.0% · unexplained +0.2%
**Positioning (CFTC E-MINI S&P 500, 2026-10-27, + = long S&P 500):** lev funds -400,604 (-20% OI, 4w -28,115, 27th pct of 3y) · asset mgrs +923,449 (+47% OI, 4w +19,446, 45th pct of 3y)
**This week:** 11-05 08:30 ET United States: Nonfarm Productivity (cons 2.8%, prev 1.4%) · 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-10 06:00 ET United States: NFIB Small Business Optimism

### Nasdaq 100  `^NDX`  28,180 (2026-11-04)
**Move:** 1w -5.5% · 4w -9.6% (89th pct of 2y 4w moves) · 13w -4.4% · 52w range position 63% (lo 22,953 / hi 31,224)
**Drivers (recent corr):** US10Y +0.64 [INVERTED] · SOXX +0.96 [textbook] · HYG_TLT +0.71 [textbook] · BTC-USD +0.61 [textbook] → **in charge: SOXX** (Semis / AI capex)
**Last 20 sessions decomposed (R² 0.83, n=60):** actual -10.1% = SOXX -8.0% · US10Y +1.1% · HYG_TLT -1.0% · BTC-USD -0.7% · unexplained -1.4%
**Positioning (CFTC NASDAQ MINI, 2026-10-27, + = long Nasdaq 100):** lev funds +2,301 (+1% OI, 4w +27,024, 95th pct of 3y) · asset mgrs +65,381 (+24% OI, 4w -4,363, 25th pct of 3y)
**This week:** 11-05 08:30 ET United States: Nonfarm Productivity (cons 2.8%, prev 1.4%) · 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-10 06:00 ET United States: NFIB Small Business Optimism

### Russell 2000  `^RUT`  2,812 (2026-11-04)
**Move:** 1w -0.6% · 4w +0.7% (11th pct of 2y 4w moves) · 13w -6.8% · 52w range position 66% (lo 2,305 / hi 3,068)
**Drivers (recent corr):** US2Y +0.04 [weak] · HYG_TLT +0.16 [weak] · ^GSPC +0.74 [textbook] → **in charge: ^GSPC** (Beta)
**Last 20 sessions decomposed (R² 0.57, n=60):** actual +0.7% = ^GSPC -2.8% · US2Y +1.1% · HYG_TLT +0.1% · unexplained +2.3%
**This week:** 11-05 08:30 ET United States: Nonfarm Productivity (cons 2.8%, prev 1.4%) · 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-10 06:00 ET United States: NFIB Small Business Optimism

### Euro Stoxx 50  `^STOXX50E`  6,145 (2026-11-04)
**Move:** 1w -0.4% · 4w -0.6% (11th pct of 2y 4w moves) · 13w -5.1% · 52w range position 61% (lo 5,501 / hi 6,551)
**Drivers (recent corr):** FR_DE (missing) · ^GSPC +0.43 [textbook] · BZ=F -0.16 [weak] · EURUSD=X -0.26 [weak] → **in charge: ^GSPC** (US lead)
**Last 20 sessions decomposed (R² 0.27, n=60):** actual -0.6% = ^GSPC -1.6% · BZ=F +0.1% · EURUSD=X +0.0% · unexplained +0.9%
**This week:** 11-05 04:00 ET Italy: Italian Retail Sales · 11-06 05:00 ET Euro Zone: Retail Sales (cons -0.1%, prev 0.1%) · 11-10 01:30 ET France: French Unemployment Rate

### CAC 40  `^FCHI`  8,020 (2026-11-04)
**Move:** 1w +1.7% · 4w +3.2% (64th pct of 2y 4w moves) · 13w -7.5% · 52w range position 33% (lo 7,666 / hi 8,726)
**Drivers (recent corr):** FR_DE (missing) · ^STOXX50E +0.86 [textbook] → **in charge: ^STOXX50E** (European block)
**Last 20 sessions decomposed (R² 0.76, n=60):** actual +3.2% = ^STOXX50E -0.5% · unexplained +3.7%
**This week:** 11-05 04:00 ET Italy: Italian Retail Sales · 11-06 05:00 ET Euro Zone: Retail Sales (cons -0.1%, prev 0.1%) · 11-10 01:30 ET France: French Unemployment Rate

### DAX  `^GDAXI`  25,865 (2026-11-04)
**Move:** 1w +0.6% · 4w +3.0% (57th pct of 2y 4w moves) · 13w -1.0% · 52w range position 83% (lo 22,301 / hi 26,570)
**Drivers (recent corr):** DE10Y +0.01 [weak] · ^GSPC +0.38 [textbook] → **in charge: ^GSPC** (Global risk)
**Last 20 sessions decomposed (R² 0.25, n=60):** actual +3.0% = ^GSPC -1.6% · DE10Y +0.5% · unexplained +4.0%
**This week:** 11-05 04:00 ET Italy: Italian Retail Sales · 11-06 05:00 ET Euro Zone: Retail Sales (cons -0.1%, prev 0.1%) · 11-10 01:30 ET France: French Unemployment Rate

### FTSE 100  `^FTSE`  10,638 (2026-11-04)
**Move:** 1w -0.5% · 4w +1.7% (44th pct of 2y 4w moves) · 13w -2.3% · 52w range position 81% (lo 9,507 / hi 10,911)
**Drivers (recent corr):** BZ=F +0.06 [weak] · GBPUSD=X -0.33 [textbook] · GB10Y -0.57 [textbook] → **in charge: GB10Y** (Gilts)
**Last 20 sessions decomposed (R² 0.33, n=60):** actual +1.7% = GB10Y +1.2% · GBPUSD=X -0.2% · BZ=F +0.0% · unexplained +0.7%
**This week:** 11-05 07:00 ET United Kingdom: BoE Interest Rate Decision (cons 4.00%, prev 3.75%) · 11-05 07:00 ET United Kingdom: BoE MPC Meeting Minutes · 11-09 19:01 ET United Kingdom: BRC Retail Sales Monitor

### Nikkei 225  `^N225`  60,821 (2026-11-04)
**Move:** 1w -4.9% · 4w -13.2% (97th pct of 2y 4w moves) · 13w -8.3% · 52w range position 52% (lo 48,538 / hi 72,366)
**Drivers (recent corr):** USDJPY=X +0.28 [weak] · ^NDX +0.17 [weak] · SOXX +0.15 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.11, n=60):** actual -14.1% = ^NDX -4.6% · SOXX -0.1% · USDJPY=X +0.0% · unexplained -9.5%

### KOSPI  `^KS11`  5,555 (2026-11-04)
**Move:** 1w -7.6% · 4w -18.4% (86th pct of 2y 4w moves) · 13w -15.8% · 52w range position 32% (lo 3,846 / hi 9,115)
**Drivers (recent corr):** SOXX +0.15 [weak] · ^NDX +0.07 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.09, n=60):** actual -20.3% = SOXX -11.2% · ^NDX +5.3% · unexplained -14.4%
**This week:** 11-10 18:00 ET South Korea: Unemployment Rate

### Hang Seng  `^HSI`  23,413 (2026-11-04)
**Move:** 1w +1.4% · 4w -3.0% (45th pct of 2y 4w moves) · 13w -9.7% · 52w range position 14% (lo 22,672 / hi 27,968)
**Drivers (recent corr):** ^NDX -0.47 [INVERTED] → **in charge: ^NDX** (US tech (prior US day))
**Last 20 sessions decomposed (R² 0.02, n=60):** actual -3.0% = ^NDX +1.3% · unexplained -4.3%
**This week:** 11-08 20:30 ET China: CPI

### ASX 200  `^AXJO`  8,842 (2026-11-04)
**Move:** 1w -0.1% · 4w +1.3% (27th pct of 2y 4w moves) · 13w -4.2% · 52w range position 53% (lo 8,366 / hi 9,272)
**Drivers (recent corr):** HG=F +0.49 [textbook] · ^GSPC +0.17 [weak] → **in charge: HG=F** (Miners)
**Last 20 sessions decomposed (R² 0.16, n=60):** actual +1.3% = HG=F -0.6% · ^GSPC -0.6% · unexplained +2.5%


## 7. Rates

### US 2y  `US2Y`  4.74% (2026-11-04)
**Move:** 1w -13bp · 4w -28bp (86th pct of 2y 4w moves) · 13w +42bp · 52w range position 78% (lo 3.512 / hi 5.089)
**Drivers (recent corr):** CL=F -0.33 [INVERTED] · ^GSPC +0.58 [textbook, was INVERTED] → **in charge: ^GSPC** (Risk-on = fewer cuts / more hikes)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual -28bp = ^GSPC +1bp · CL=F -0bp · unexplained -28bp
**Positioning (CFTC UST 2Y NOTE, 2026-10-27, + = long US 2y):** lev funds +1,357,658 (+30% OI, 4w +191,678, 10th pct of 3y) · asset mgrs -1,837,491 (-41% OI, 4w -199,013, 65th pct of 3y)
**This week:** 11-05 08:30 ET United States: Nonfarm Productivity (cons 2.8%, prev 1.4%) · 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-10 06:00 ET United States: NFIB Small Business Optimism

### US 10y  `US10Y`  4.95% (2026-11-04)
**Move:** 1w -9bp · 4w -32bp (92nd pct of 2y 4w moves) · 13w +34bp · 52w range position 73% (lo 3.962 / hi 5.311)
**Drivers (recent corr):** CL=F -0.29 [weak] · ^NDX +0.64 [INVERTED] · T10YIE (missing) · DE10Y +0.26 [weak] → **in charge: ^NDX** (Textbook: yields up hurt stocks; + means bonds hedge stocks)
**Last 20 sessions decomposed (R² 0.09, n=60):** actual -32bp = ^NDX -10bp · DE10Y -4bp · CL=F -0bp · unexplained -18bp
**Positioning (CFTC UST 10Y NOTE, 2026-10-27, + = long US 10y):** lev funds +2,227,275 (+38% OI, 4w +190,843, 83rd pct of 3y) · asset mgrs -3,000,164 (-51% OI, 4w -223,633, 1st pct of 3y)
**This week:** 11-05 08:30 ET United States: Nonfarm Productivity (cons 2.8%, prev 1.4%) · 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-10 06:00 ET United States: NFIB Small Business Optimism

### US 30y  `US30Y`  5.32% (2026-11-04)
**Move:** 1w -4bp · 4w -34bp (95th pct of 2y 4w moves) · 13w +15bp · 52w range position 67% (lo 4.633 / hi 5.665)
**Drivers (recent corr):** US2Y +0.88 [textbook] · T10YIE (missing) → **in charge: US2Y** (Front end)
**Last 20 sessions decomposed (R² 0.66, n=60):** actual -34bp = US2Y -19bp · unexplained -15bp
**Positioning (CFTC UST BOND, 2026-10-27, + = long US 30y):** lev funds +150,393 (+8% OI, 4w -101,002, 1st pct of 3y) · asset mgrs -383,981 (-20% OI, 4w +52,975, 97th pct of 3y)
**This week:** 11-05 08:30 ET United States: Nonfarm Productivity (cons 2.8%, prev 1.4%) · 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-10 06:00 ET United States: NFIB Small Business Optimism

### Bund 10y  `DE10Y`  3.35% (2026-11-04)
**Move:** 1w -5bp · 4w -17bp (70th pct of 2y 4w moves) · 13w +23bp · 52w range position 68% (lo 2.68 / hi 3.66)
**Drivers (recent corr):** US10Y +0.26 [weak] · BZ=F -0.03 [weak] · FR_DE (missing) → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.04, n=60):** actual -17bp = US10Y -6bp · BZ=F -0bp · unexplained -11bp
**This week:** 11-05 04:00 ET Italy: Italian Retail Sales · 11-06 05:00 ET Euro Zone: Retail Sales (cons -0.1%, prev 0.1%) · 11-10 01:30 ET France: French Unemployment Rate

### Gilt 10y  `GB10Y`  5.28% (2026-11-04)
**Move:** 1w -5bp · 4w -16bp (67th pct of 2y 4w moves) · 13w +32bp · 52w range position 82% (lo 4.352 / hi 5.478)
**Drivers (recent corr):** US10Y +0.57 [textbook] · GBPUSD=X -0.06 [weak] → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.35, n=60):** actual -16bp = US10Y -18bp · GBPUSD=X -2bp · unexplained +3bp
**This week:** 11-05 07:00 ET United Kingdom: BoE Interest Rate Decision (cons 4.00%, prev 3.75%) · 11-05 07:00 ET United Kingdom: BoE MPC Meeting Minutes · 11-09 19:01 ET United Kingdom: BRC Retail Sales Monitor

### JGB 10y  `JP10Y`  2.82% (2026-11-04)
**Move:** 1w -5bp · 4w -29bp (99th pct of 2y 4w moves) · 13w +0bp · 52w range position 80% (lo 1.676 / hi 3.111)
**Drivers (recent corr):** US10Y +0.51 [textbook] · USDJPY=X +0.59 [textbook] → **in charge: USDJPY=X** (Weak yen -> BoJ pressure)
**Last 20 sessions decomposed (R² 0.48, n=60):** actual -29bp = US10Y -9bp · USDJPY=X -1bp · unexplained -19bp

### Canada 10y  `CA10Y`  3.74% (2026-11-04)
**Move:** 1w -13bp · 4w -20bp (78th pct of 2y 4w moves) · 13w +19bp · 52w range position 72% (lo 3.1 / hi 3.99)
**Drivers (recent corr):** US10Y +0.74 [textbook] · CL=F -0.09 [weak] → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.65, n=60):** actual -20bp = US10Y -23bp · CL=F +1bp · unexplained +2bp
**This week:** 11-06 08:30 ET Canada: Employment Change (cons 14.5K, prev -68.3K) · 11-06 08:30 ET Canada: Full Employment Change · 11-06 08:30 ET Canada: Part Time Employment Change · 11-06 08:30 ET Canada: Unemployment Rate (cons 6.5%, prev 6.5%)

### French spread (proxy)
_no data_


## 8. Commodities

### WTI crude  `CL=F`  95.32 (2026-11-04)
**Move:** 1w -6.5% · 4w +4.2% (38th pct of 2y 4w moves) · 13w +23.3% · 52w range position 69% (lo 55.27 / hi 112.9)
**Drivers (recent corr):** XLE +0.25 [weak] · ^GSPC -0.11 [weak] · HG=F -0.20 [weak] · DX-Y.NYB -0.20 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.24, n=60):** actual +4.1% = HG=F +2.2% · ^GSPC +1.9% · XLE +1.8% · DX-Y.NYB +0.8% · unexplained -2.6%
**Positioning (CFTC WTI-PHYSICAL, 2026-10-27, + = long WTI crude):** managed money +31,128 (+2% OI, 4w -48,464, 13th pct of 3y) · producers +366,392 (+19% OI, 4w +46,853, 96th pct of 3y)
**This week:** 11-05 08:30 ET United States: Nonfarm Productivity (cons 2.8%, prev 1.4%) · 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-10 06:00 ET United States: NFIB Small Business Optimism

### Gold  `GC=F`  3,947 (2026-11-04)
**Move:** 1w -2.1% · 4w -5.1% (55th pct of 2y 4w moves) · 13w -8.2% · 52w range position 3% (lo 3,899 / hi 5,318)
**Drivers (recent corr):** DFII10 (missing) · DX-Y.NYB +0.03 [weak] · SI=F +0.89 [textbook] · BTC-USD +0.06 [weak] → **in charge: SI=F** (Precious block)
**Last 20 sessions decomposed (R² 0.75, n=60):** actual -5.2% = SI=F -8.3% · DX-Y.NYB +0.4% · BTC-USD +0.3% · unexplained +2.4%
**Positioning (CFTC GOLD, 2026-10-27, + = long Gold):** managed money +105,562 (+27% OI, 4w -14,756, 25th pct of 3y) · producers -9,574 (-2% OI, 4w +11,689, 99th pct of 3y)
**This week:** 11-05 08:30 ET United States: Nonfarm Productivity (cons 2.8%, prev 1.4%) · 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-10 06:00 ET United States: NFIB Small Business Optimism

### Silver  `SI=F`  49.26 (2026-11-04)
**Move:** 1w -5.6% · 4w -16.6% (83rd pct of 2y 4w moves) · 13w -19.8% · 52w range position 2% (lo 47.79 / hi 115.1)
**Drivers (recent corr):** GC=F +0.89 [textbook] · HG=F +0.60 [textbook] → **in charge: GC=F** (Gold)
**Last 20 sessions decomposed (R² 0.79, n=60):** actual -18.2% = GC=F -6.8% · HG=F -1.3% · unexplained -10.0%
**Positioning (CFTC SILVER, 2026-10-27, + = long Silver):** managed money +3,321 (+3% OI, 4w -4,293, 4th pct of 3y) · producers -15,231 (-13% OI, 4w +1,281, 94th pct of 3y)
**This week:** 11-05 08:30 ET United States: Nonfarm Productivity (cons 2.8%, prev 1.4%) · 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-10 06:00 ET United States: NFIB Small Business Optimism

### Copper  `HG=F`  6.331 (2026-11-04)
**Move:** 1w -3.8% · 4w -2.9% (35th pct of 2y 4w moves) · 13w -5.3% · 52w range position 75% (lo 4.938 / hi 6.804)
**Drivers (recent corr):** ^GSPC -0.15 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.01, n=60):** actual -2.9% = ^GSPC -0.5% · unexplained -2.4%
**Positioning (CFTC COPPER- #1, 2026-10-27, + = long Copper):** managed money +40,575 (+12% OI, 4w -37,483, 57th pct of 3y) · producers -65,243 (-19% OI, 4w +39,097, 48th pct of 3y)
**This week:** 11-05 08:30 ET United States: Nonfarm Productivity (cons 2.8%, prev 1.4%) · 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-08 20:30 ET China: CPI

### Nat gas (US)  `NG=F`  2.853 (2026-11-04)
**Move:** 1w -3.4% · 4w -9.9% (52nd pct of 2y 4w moves) · 13w +8.1% · 52w range position 7% (lo 2.523 / hi 7.46)
**Drivers (recent corr):** CL=F +0.06 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.01, n=60):** actual -10.5% = CL=F +0.3% · unexplained -10.8%
**Positioning (CFTC NAT GAS NYME, 2026-10-27, + = long Nat gas (US)):** managed money -206,317 (-12% OI, 4w -73,518, 1st pct of 3y) · producers -3,516 (-0% OI, 4w +10,568, 89th pct of 3y)
**This week:** 11-05 08:30 ET United States: Nonfarm Productivity (cons 2.8%, prev 1.4%) · 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-10 06:00 ET United States: NFIB Small Business Optimism


## 9. Crypto

### Bitcoin  `BTC-USD`  76,573 (2026-11-04)
**Move:** 1w -5.8% · 4w -8.0% (56th pct of 2y 4w moves) · 13w +18.5% · 52w range position 38% (lo 58,559 / hi 105,997)
**Drivers (recent corr):** ^NDX +0.61 [textbook] · DX-Y.NYB +0.02 [weak] · GC=F +0.06 [weak] → **in charge: ^NDX** (Tech / speculation)
**Last 20 sessions decomposed (R² 0.20, n=60):** actual -8.4% = ^NDX -9.6% · GC=F -0.6% · DX-Y.NYB +0.0% · unexplained +1.8%
**Positioning (CFTC BITCOIN, 2026-10-27, + = long Bitcoin):** lev funds -3,979 (-19% OI, 4w +2,877, 100th pct of 3y) · asset mgrs +2,754 (+13% OI, 4w -832, 6th pct of 3y)
**This week:** 11-05 08:30 ET United States: Nonfarm Productivity (cons 2.8%, prev 1.4%) · 11-06 08:30 ET United States: Nonfarm Payrolls (cons 63K, prev 29K) · 11-06 08:30 ET United States: Private Nonfarm Payrolls (cons 60K, prev 46K) · 11-06 08:30 ET United States: U6 Unemployment Rate · 11-06 08:30 ET United States: Unemployment Rate (cons 4.2%, prev 4.2%) · 11-10 06:00 ET United States: NFIB Small Business Optimism

