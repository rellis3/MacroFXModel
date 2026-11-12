# Market Review Data Pack: 2026-11-12

Fetched 2026-11-12T03:19:21+00:00. Descriptive numbers for the weekly review (read with `education/market_reviews/PLAYBOOK.md`). Correlations are of daily moves: last 20 sessions vs the 60 before. They are noisy; a flip is a question, not a signal.

**Data notes:** fred DGS2: The read operation timed out · fred DFII10: The read operation timed out · fred T10YIE: The read operation timed out · fred BAMLH0A0HYM2: The read operation timed out · fred BAMLC0A0CM: The read operation timed out · calendar 2026-11-13: HTTP Error 403: Forbidden · calendar 2026-11-14: HTTP Error 403: Forbidden · calendar 2026-11-15: HTTP Error 403: Forbidden · calendar 2026-11-16: HTTP Error 403: Forbidden · calendar 2026-11-17: HTTP Error 403: Forbidden · calendar 2026-11-18: HTTP Error 403: Forbidden · calendar 2026-11-19: HTTP Error 403: Forbidden · FRED DGS2 missing: US 2y = US 5y stand-in for this run · No local OAT/Bund futures: French spread proxy unavailable

## 1. Regime gauges: which story is the market trading?

| Pair | Recent | Before | Textbook sign | Status | What it means |
|---|---|---|---|---|---|
| CL=F vs US10Y | -0.07 | +0.16 | + | weak | Oil vs yields: + = oil is an inflation story; - = oil is a growth tax (2008-style) |
| ^NDX vs US10Y | +0.49 | -0.19 | − | INVERTED | Stocks vs yields: - = rates drive stocks; + = growth scare, bonds hedge stocks |
| HYG_TLT vs ^NDX | +0.57 | -0.06 | + | textbook | Credit vs tech: high + = credit and equities are one trade (credit stress leading) |
| DX-Y.NYB vs ^GSPC | -0.11 | +0.11 | − | weak | Dollar vs stocks: - = safe-haven dollar; ~0/+ = "sell America" or liquidity dash |
| AUDUSD=X vs ^NDX | +0.48 | +0.40 | + | textbook | Aussie vs tech: near 0 = AUD trading commodities not risk |
| BTC-USD vs ^NDX | +0.66 | +0.35 | + | textbook | Bitcoin vs tech: high = one liquidity complex |
| XLE vs CL=F | +0.37 | +0.33 | + | textbook | Energy stocks vs oil: falling = equity investors fade the oil move |
| USDJPY=X vs US10Y | +0.71 | +0.19 | + | textbook | Yen vs yields: high = yen is a pure rates trade |

Equity vol vs bond vol: VIX 17.5 (1y pct 57) · MOVE 92 (1y pct 84). When bond vol leads equity vol, the stress is in rates/credit first.

## 2. G10 FX

### EURUSD  `EURUSD=X`  1.107 (2026-11-12)
**Move:** 1w -1.4% · 4w -1.3% (53rd pct of 2y 4w moves) · 13w -4.0% · 52w range position 0% (lo 1.107 / hi 1.202)
**Drivers (recent corr):** US_EA2 -0.14 [weak] · US_DE10 -0.00 [weak] · FR_DE (missing) · ^STOXX50E -0.14 [weak] · BZ=F -0.16 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.06, n=60):** actual -1.3% = BZ=F +0.2% · US_EA2 +0.1% · ^STOXX50E +0.1% · US_DE10 -0.0% · unexplained -1.7%
**Positioning (CFTC EURO FX, 2026-11-03, + = long EURUSD):** lev funds -78,559 (-9% OI, 4w -34,298, 1st pct of 3y) · asset mgrs +144,925 (+17% OI, 4w -44,956, 1st pct of 3y)

### USDJPY  `USDJPY=X`  159.8 (2026-11-12)
**Move:** 1w +1.5% · 4w +1.0% (38th pct of 2y 4w moves) · 13w +0.2% · 52w range position 64% (lo 152.5 / hi 163.9)
**Drivers (recent corr):** US10Y +0.71 [textbook] · US_JP10 +0.42 [textbook] · ^NDX +0.63 [textbook] · ^VIX -0.50 [textbook, was INVERTED] → **in charge: US10Y** (US yields: the carry engine)
**Last 20 sessions decomposed (R² 0.16, n=60):** actual +1.0% = US10Y -0.4% · ^NDX -0.4% · US_JP10 -0.0% · ^VIX +0.0% · unexplained +1.8%
**Positioning (CFTC JAPANESE YEN, 2026-11-03, + = long USDJPY):** lev funds +14,817 (+4% OI, 4w -10,226, 24th pct of 3y) · asset mgrs -79,387 (-21% OI, 4w -11,592, 15th pct of 3y)

### GBPUSD  `GBPUSD=X`  1.325 (2026-11-12)
**Move:** 1w -1.5% · 4w -0.2% (7th pct of 2y 4w moves) · 13w -1.8% · 52w range position 25% (lo 1.306 / hi 1.383)
**Drivers (recent corr):** US_GB10 -0.24 [weak] · GB10Y -0.18 [weak] · ^GSPC -0.01 [weak] · EURUSD=X +0.92 [textbook] → **in charge: EURUSD=X** (European block move)
**Last 20 sessions decomposed (R² 0.74, n=60):** actual -0.2% = EURUSD=X -1.1% · US_GB10 -0.2% · GB10Y +0.1% · ^GSPC -0.0% · unexplained +1.0%
**Positioning (CFTC BRITISH POUND, 2026-11-03, + = long GBPUSD):** lev funds +26,663 (+11% OI, 4w +14,231, 33rd pct of 3y) · asset mgrs -121,163 (-49% OI, 4w +24,279, 9th pct of 3y)

### USDCAD  `USDCAD=X`  1.426 (2026-11-12)
**Move:** 1w +1.8% · 4w +0.5% (23rd pct of 2y 4w moves) · 13w +2.4% · 52w range position 98% (lo 1.349 / hi 1.428)
**Drivers (recent corr):** CL=F +0.00 [weak] · US_CA2 +0.48 [textbook] · ^GSPC +0.06 [weak] → **in charge: US_CA2** (US-Canada 2y rate gap)
**Last 20 sessions decomposed (R² 0.23, n=60):** actual +0.5% = ^GSPC +0.1% · CL=F -0.0% · US_CA2 -0.0% · unexplained +0.5%
**Positioning (CFTC CANADIAN DOLLAR, 2026-11-03, + = long USDCAD):** lev funds +86,302 (+25% OI, 4w +6,677, 87th pct of 3y) · asset mgrs -16,453 (-5% OI, 4w -52,259, 8th pct of 3y)

### AUDUSD  `AUDUSD=X`  0.6846 (2026-11-12)
**Move:** 1w -1.2% · 4w -1.0% (41st pct of 2y 4w moves) · 13w -3.1% · 52w range position 49% (lo 0.6449 / hi 0.7255)
**Drivers (recent corr):** HG=F +0.30 [textbook] · ^NDX +0.48 [textbook] · GC=F +0.13 [weak] → **in charge: ^NDX** (Global risk proxy)
**Last 20 sessions decomposed (R² 0.16, n=60):** actual -1.1% = ^NDX -0.5% · HG=F -0.1% · GC=F +0.0% · unexplained -0.4%
**Positioning (CFTC AUSTRALIAN DOLLAR, 2026-11-03, + = long AUDUSD):** lev funds +50,106 (+15% OI, 4w -4,027, 88th pct of 3y) · asset mgrs -130,780 (-40% OI, 4w -29,352, 1st pct of 3y)

### NZDUSD  `NZDUSD=X`  0.5561 (2026-11-12)
**Move:** 1w -0.6% · 4w -1.1% (38th pct of 2y 4w moves) · 13w -5.0% · 52w range position 0% (lo 0.5561 / hi 0.6076)
**Drivers (recent corr):** AUDUSD=X +0.56 [textbook] · ^GSPC +0.37 [textbook] · US2Y -0.02 [weak] → **in charge: AUDUSD=X** (Antipodean block)
**Last 20 sessions decomposed (R² 0.36, n=60):** actual -1.1% = AUDUSD=X -0.5% · ^GSPC -0.1% · US2Y +0.1% · unexplained -0.6%
**Positioning (CFTC NZ DOLLAR, 2026-11-03, + = long NZDUSD):** lev funds -23,154 (-17% OI, 4w -22,367, 7th pct of 3y) · asset mgrs -46,700 (-35% OI, 4w -14,166, 11th pct of 3y)

### USDCHF  `USDCHF=X`  0.8335 (2026-11-12)
**Move:** 1w +2.2% · 4w +0.7% (28th pct of 2y 4w moves) · 13w +2.4% · 52w range position 97% (lo 0.7632 / hi 0.8357)
**Drivers (recent corr):** US10Y +0.50 [textbook] · ^VIX -0.29 [weak] · GC=F +0.01 [weak] → **in charge: US10Y** (US yields)
**Last 20 sessions decomposed (R² 0.30, n=60):** actual +0.7% = US10Y -0.3% · GC=F -0.1% · ^VIX -0.0% · unexplained +1.1%
**Positioning (CFTC SWISS FRANC, 2026-11-03, + = long USDCHF):** lev funds +16,845 (+13% OI, 4w +5,495, 95th pct of 3y) · asset mgrs +20,853 (+16% OI, 4w -16,526, 18th pct of 3y)


## 3. G10 crosses

### AUDNZD  `AUDNZD=X`  1.231 (2026-11-12)
**Move:** 1w -0.6% · 4w +0.1% (5th pct of 2y 4w moves) · 13w +2.0% · 52w range position 80% (lo 1.141 / hi 1.254)
**Drivers (recent corr):** HG=F +0.07 [weak] · ^AXJO -0.30 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.09, n=60):** actual +0.1% = ^AXJO -0.7% · HG=F -0.1% · unexplained +0.8%

### EURGBP  `EURGBP=X`  0.8353 (2026-11-12)
**Move:** 1w +0.1% · 4w -1.1% (70th pct of 2y 4w moves) · 13w -2.3% · 52w range position 3% (lo 0.8336 / hi 0.8842)
**Drivers (recent corr):** GB10Y +0.10 [weak] · FR_DE (missing) → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual -1.1% = GB10Y -0.0% · unexplained -1.1%

### EURCHF  `EURCHF=X`  0.9226 (2026-11-12)
**Move:** 1w +0.8% · 4w -0.6% (47th pct of 2y 4w moves) · 13w -1.7% · 52w range position 46% (lo 0.9023 / hi 0.9466)
**Drivers (recent corr):** ^STOXX50E +0.32 [textbook] · FR_DE (missing) · ^VIX -0.39 [textbook] → **in charge: ^VIX** (Haven flows)
**Last 20 sessions decomposed (R² 0.04, n=60):** actual -0.6% = ^STOXX50E +0.2% · ^VIX -0.0% · unexplained -0.8%


## 4. EM FX

### USDMXN  `USDMXN=X`  18.61 (2026-11-12)
**Move:** 1w -0.9% · 4w +0.9% (32nd pct of 2y 4w moves) · 13w +9.3% · 52w range position 88% (lo 16.89 / hi 18.85)
**Drivers (recent corr):** ^VIX +0.38 [textbook] · ^GSPC -0.36 [textbook] · CL=F +0.78 [INVERTED] · USDBRL=X -0.16 [weak] → **in charge: CL=F** (Oil)
**Last 20 sessions decomposed (R² 0.22, n=60):** actual +0.9% = CL=F -1.0% · USDBRL=X +0.7% · ^GSPC +0.2% · ^VIX +0.0% · unexplained +1.0%
**Positioning (CFTC MEXICAN PESO, 2026-11-03, + = long USDMXN):** lev funds -71,381 (-25% OI, 4w +3,546, 6th pct of 3y) · asset mgrs +36,349 (+13% OI, 4w +15,750, 100th pct of 3y)

### USDBRL  `USDBRL=X`  5.583 (2026-11-12)
**Move:** 1w +1.4% · 4w +9.5% (99th pct of 2y 4w moves) · 13w +7.4% · 52w range position 99% (lo 4.906 / hi 5.59)
**Drivers (recent corr):** ^VIX +0.09 [weak] · HG=F +0.23 [weak] · EWZ -0.94 [textbook] → **in charge: EWZ** (Brazil equities (local flows))
**Last 20 sessions decomposed (R² 0.85, n=60):** actual +9.1% = EWZ +7.2% · HG=F +0.2% · ^VIX +0.0% · unexplained +1.7%
**Positioning (CFTC BRAZILIAN REAL, 2026-11-03, + = long USDBRL):** lev funds -38,613 (-22% OI, 4w -11,217, 1st pct of 3y) · asset mgrs -49,879 (-29% OI, 4w +6,731, 48th pct of 3y)

### USDZAR  `USDZAR=X`  16.61 (2026-11-12)
**Move:** 1w +0.8% · 4w +0.6% (20th pct of 2y 4w moves) · 13w +2.6% · 52w range position 57% (lo 15.71 / hi 17.29)
**Drivers (recent corr):** GC=F -0.33 [textbook] · ^VIX +0.44 [textbook] · HG=F -0.01 [weak] → **in charge: ^VIX** (Carry / risk)
**Last 20 sessions decomposed (R² 0.16, n=60):** actual +0.6% = GC=F +0.3% · HG=F -0.1% · ^VIX +0.1% · unexplained +0.3%
**Positioning (CFTC SO AFRICAN RAND, 2026-11-03, + = long USDZAR):** lev funds -6,317 (-17% OI, 4w -1,908, 17th pct of 3y) · asset mgrs -14,523 (-40% OI, 4w +3,361, 33rd pct of 3y)

### USDKRW  `USDKRW=X`  1,332 (2026-11-12)
**Move:** 1w -1.8% · 4w -0.6% (24th pct of 2y 4w moves) · 13w -6.0% · 52w range position 4% (lo 1,324 / hi 1,552)
**Drivers (recent corr):** ^KS11 +0.03 [weak] · SOXX -0.55 [textbook] · DX-Y.NYB -0.03 [weak] → **in charge: SOXX** (Global semis cycle)
**Last 20 sessions decomposed (R² 0.12, n=60):** actual -0.6% = SOXX +0.6% · DX-Y.NYB +0.3% · ^KS11 -0.1% · unexplained -1.5%


## 5. CE3 FX

### EURCZK  `EURCZK=X`  24.38 (2026-11-12)
**Move:** 1w +0.3% · 4w +0.3% (40th pct of 2y 4w moves) · 13w +0.7% · 52w range position 67% (lo 24.07 / hi 24.53)
**Drivers (recent corr):** ^STOXX50E -0.25 [weak] · EURPLN=X +0.65 [textbook] → **in charge: EURPLN=X** (CE3 block)
**Last 20 sessions decomposed (R² 0.30, n=60):** actual +0.3% = EURPLN=X +0.2% · ^STOXX50E -0.1% · unexplained +0.1%

### EURPLN  `EURPLN=X`  4.41 (2026-11-12)
**Move:** 1w +0.2% · 4w +1.0% (77th pct of 2y 4w moves) · 13w +2.4% · 52w range position 99% (lo 4.197 / hi 4.412)
**Drivers (recent corr):** ^STOXX50E -0.37 [textbook] · ^VIX +0.48 [textbook] → **in charge: ^VIX** (Risk)
**Last 20 sessions decomposed (R² 0.17, n=60):** actual +1.0% = ^STOXX50E -0.2% · ^VIX +0.0% · unexplained +1.2%


## 6. Equities

### S&P 500  `^GSPC`  7,619 (2026-11-12)
**Move:** 1w +3.6% · 4w -1.6% (35th pct of 2y 4w moves) · 13w -2.3% · 52w range position 86% (lo 6,344 / hi 7,819)
**Drivers (recent corr):** US10Y +0.33 [INVERTED, was textbook] · HYG_TLT +0.41 [textbook] · DX-Y.NYB -0.11 [weak] · CL=F -0.44 [textbook] · ^VIX -0.96 [textbook] → **in charge: ^VIX** (Vol)
**Last 20 sessions decomposed (R² 0.86, n=60):** actual -1.6% = CL=F +0.5% · ^VIX -0.4% · US10Y +0.4% · HYG_TLT -0.3% · DX-Y.NYB +0.1% · unexplained -1.8%
**Positioning (CFTC E-MINI S&P 500, 2026-11-03, + = long S&P 500):** lev funds -372,318 (-19% OI, 4w +42,769, 36th pct of 3y) · asset mgrs +928,584 (+47% OI, 4w +21,969, 48th pct of 3y)

### Nasdaq 100  `^NDX`  28,374 (2026-11-12)
**Move:** 1w +6.6% · 4w -5.2% (73rd pct of 2y 4w moves) · 13w -5.7% · 52w range position 66% (lo 22,953 / hi 31,224)
**Drivers (recent corr):** US10Y +0.49 [INVERTED] · SOXX +0.96 [textbook] · HYG_TLT +0.57 [textbook] · BTC-USD +0.66 [textbook] → **in charge: SOXX** (Semis / AI capex)
**Last 20 sessions decomposed (R² 0.91, n=60):** actual -5.4% = SOXX -3.7% · BTC-USD -1.5% · US10Y +0.5% · HYG_TLT -0.4% · unexplained -0.2%
**Positioning (CFTC NASDAQ MINI, 2026-11-03, + = long Nasdaq 100):** lev funds +10,073 (+3% OI, 4w +29,285, 97th pct of 3y) · asset mgrs +73,137 (+25% OI, 4w -661, 45th pct of 3y)

### Russell 2000  `^RUT`  2,846 (2026-11-12)
**Move:** 1w +4.3% · 4w +2.9% (39th pct of 2y 4w moves) · 13w -6.8% · 52w range position 71% (lo 2,305 / hi 3,068)
**Drivers (recent corr):** US2Y +0.19 [weak] · HYG_TLT +0.19 [weak] · ^GSPC +0.92 [textbook] → **in charge: ^GSPC** (Beta)
**Last 20 sessions decomposed (R² 0.76, n=60):** actual +2.8% = ^GSPC -1.7% · US2Y +0.2% · HYG_TLT +0.1% · unexplained +4.2%

### Euro Stoxx 50  `^STOXX50E`  6,393 (2026-11-12)
**Move:** 1w +2.6% · 4w +3.6% (69th pct of 2y 4w moves) · 13w -2.3% · 52w range position 85% (lo 5,501 / hi 6,551)
**Drivers (recent corr):** FR_DE (missing) · ^GSPC +0.56 [textbook] · BZ=F -0.45 [textbook] · EURUSD=X -0.14 [weak] → **in charge: ^GSPC** (US lead)
**Last 20 sessions decomposed (R² 0.32, n=60):** actual +3.6% = BZ=F +1.4% · ^GSPC -0.6% · EURUSD=X -0.1% · unexplained +2.9%

### CAC 40  `^FCHI`  8,333 (2026-11-12)
**Move:** 1w +1.6% · 4w +5.0% (83rd pct of 2y 4w moves) · 13w -3.7% · 52w range position 63% (lo 7,666 / hi 8,726)
**Drivers (recent corr):** FR_DE (missing) · ^STOXX50E +0.91 [textbook] → **in charge: ^STOXX50E** (European block)
**Last 20 sessions decomposed (R² 0.78, n=60):** actual +4.9% = ^STOXX50E +3.0% · unexplained +1.9%

### DAX  `^GDAXI`  26,663 (2026-11-12)
**Move:** 1w +1.3% · 4w +5.0% (79th pct of 2y 4w moves) · 13w +1.4% · 52w range position 100% (lo 22,301 / hi 26,663)
**Drivers (recent corr):** DE10Y +0.49 [INVERTED, was textbook] · ^GSPC +0.46 [textbook] → **in charge: DE10Y** (Bund yields)
**Last 20 sessions decomposed (R² 0.23, n=60):** actual +4.9% = ^GSPC -0.7% · DE10Y +0.2% · unexplained +5.4%

### FTSE 100  `^FTSE`  10,836 (2026-11-12)
**Move:** 1w +0.5% · 4w -0.0% (1st pct of 2y 4w moves) · 13w +0.6% · 52w range position 95% (lo 9,507 / hi 10,911)
**Drivers (recent corr):** BZ=F -0.48 [INVERTED] · GBPUSD=X -0.08 [weak] · GB10Y -0.63 [textbook] → **in charge: GB10Y** (Gilts)
**Last 20 sessions decomposed (R² 0.39, n=60):** actual -0.0% = GB10Y +1.7% · BZ=F +0.5% · GBPUSD=X +0.0% · unexplained -2.3%

### Nikkei 225  `^N225`  61,714 (2026-11-12)
**Move:** 1w +1.0% · 4w -4.2% (46th pct of 2y 4w moves) · 13w -9.7% · 52w range position 55% (lo 48,538 / hi 72,366)
**Drivers (recent corr):** USDJPY=X +0.45 [textbook] · ^NDX +0.63 [textbook] · SOXX +0.64 [textbook] → **in charge: SOXX** (Chips (prior US day))
**Last 20 sessions decomposed (R² 0.32, n=60):** actual -4.3% = SOXX -1.9% · ^NDX -1.3% · USDJPY=X -0.0% · unexplained -1.0%

### KOSPI  `^KS11`  5,424 (2026-11-12)
**Move:** 1w +0.7% · 4w -2.3% (22nd pct of 2y 4w moves) · 13w -20.4% · 52w range position 30% (lo 3,846 / hi 9,115)
**Drivers (recent corr):** SOXX +0.42 [textbook] · ^NDX +0.32 [textbook] → **in charge: SOXX** (Memory / AI hardware (prior US day))
**Last 20 sessions decomposed (R² 0.23, n=60):** actual -2.4% = SOXX -8.3% · ^NDX +5.5% · unexplained +0.4%

### Hang Seng  `^HSI`  24,093 (2026-11-12)
**Move:** 1w -2.8% · 4w +0.1% (3rd pct of 2y 4w moves) · 13w -5.1% · 52w range position 27% (lo 22,672 / hi 27,968)
**Drivers (recent corr):** ^NDX +0.01 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual +0.1% = ^NDX -0.2% · unexplained +0.3%

### ASX 200  `^AXJO`  9,123 (2026-11-12)
**Move:** 1w +0.6% · 4w +4.6% (88th pct of 2y 4w moves) · 13w -0.7% · 52w range position 84% (lo 8,366 / hi 9,272)
**Drivers (recent corr):** HG=F +0.38 [textbook] · ^GSPC +0.46 [textbook] → **in charge: ^GSPC** (US lead (prior US day))
**Last 20 sessions decomposed (R² 0.20, n=60):** actual +4.5% = HG=F -0.6% · ^GSPC -0.3% · unexplained +5.3%


## 7. Rates

### US 2y  `US2Y`  4.83% (2026-11-12)
**Move:** 1w +22bp · 4w -7bp (33rd pct of 2y 4w moves) · 13w +51bp · 52w range position 83% (lo 3.512 / hi 5.089)
**Drivers (recent corr):** CL=F -0.15 [weak] · ^GSPC +0.41 [textbook, was INVERTED] → **in charge: ^GSPC** (Risk-on = fewer cuts / more hikes)
**Last 20 sessions decomposed (R² 0.01, n=60):** actual -7bp = ^GSPC -1bp · CL=F -1bp · unexplained -5bp
**Positioning (CFTC UST 2Y NOTE, 2026-11-03, + = long US 2y):** lev funds +1,450,892 (+33% OI, 4w +193,408, 15th pct of 3y) · asset mgrs -1,876,612 (-42% OI, 4w -197,525, 59th pct of 3y)

### US 10y  `US10Y`  5.00% (2026-11-12)
**Move:** 1w +16bp · 4w -9bp (41st pct of 2y 4w moves) · 13w +36bp · 52w range position 77% (lo 3.962 / hi 5.311)
**Drivers (recent corr):** CL=F -0.07 [weak] · ^NDX +0.49 [INVERTED] · T10YIE (missing) · DE10Y +0.15 [weak] → **in charge: ^NDX** (Textbook: yields up hurt stocks; + means bonds hedge stocks)
**Last 20 sessions decomposed (R² 0.09, n=60):** actual -9bp = ^NDX -4bp · CL=F -3bp · DE10Y -2bp · unexplained -1bp
**Positioning (CFTC UST 10Y NOTE, 2026-11-03, + = long US 10y):** lev funds +2,262,310 (+38% OI, 4w +122,525, 86th pct of 3y) · asset mgrs -3,030,236 (-51% OI, 4w -202,097, 1st pct of 3y)

### US 30y  `US30Y`  5.36% (2026-11-12)
**Move:** 1w +11bp · 4w -7bp (33rd pct of 2y 4w moves) · 13w +14bp · 52w range position 70% (lo 4.633 / hi 5.665)
**Drivers (recent corr):** US2Y +0.91 [textbook] · T10YIE (missing) → **in charge: US2Y** (Front end)
**Last 20 sessions decomposed (R² 0.72, n=60):** actual -7bp = US2Y -5bp · unexplained -3bp
**Positioning (CFTC UST BOND, 2026-11-03, + = long US 30y):** lev funds +166,257 (+9% OI, 4w -23,421, 3rd pct of 3y) · asset mgrs -415,379 (-22% OI, 4w -9,751, 90th pct of 3y)

### Bund 10y  `DE10Y`  3.34% (2026-11-12)
**Move:** 1w +3bp · 4w -8bp (40th pct of 2y 4w moves) · 13w +17bp · 52w range position 67% (lo 2.68 / hi 3.66)
**Drivers (recent corr):** US10Y +0.15 [weak] · BZ=F -0.07 [weak] · FR_DE (missing) → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.03, n=60):** actual -8bp = US10Y -1bp · BZ=F -0bp · unexplained -6bp

### Gilt 10y  `GB10Y`  5.13% (2026-11-12)
**Move:** 1w -0bp · 4w -22bp (79th pct of 2y 4w moves) · 13w +10bp · 52w range position 69% (lo 4.352 / hi 5.478)
**Drivers (recent corr):** US10Y +0.60 [textbook] · GBPUSD=X -0.18 [weak] → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.35, n=60):** actual -22bp = US10Y -5bp · GBPUSD=X +0bp · unexplained -17bp

### JGB 10y  `JP10Y`  2.84% (2026-11-12)
**Move:** 1w +3bp · 4w -11bp (46th pct of 2y 4w moves) · 13w -3bp · 52w range position 81% (lo 1.705 / hi 3.111)
**Drivers (recent corr):** US10Y +0.69 [textbook] · USDJPY=X +0.70 [textbook] → **in charge: USDJPY=X** (Weak yen -> BoJ pressure)
**Last 20 sessions decomposed (R² 0.54, n=60):** actual -11bp = US10Y -7bp · USDJPY=X +3bp · unexplained -7bp

### Canada 10y  `CA10Y`  3.63% (2026-11-12)
**Move:** 1w -4bp · 4w -20bp (79th pct of 2y 4w moves) · 13w +1bp · 52w range position 59% (lo 3.12 / hi 3.99)
**Drivers (recent corr):** US10Y +0.80 [textbook] · CL=F +0.10 [weak] → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.63, n=60):** actual -20bp = US10Y -6bp · CL=F -5bp · unexplained -10bp

### French spread (proxy)
_no data_


## 8. Commodities

### WTI crude  `CL=F`  85.68 (2026-11-12)
**Move:** 1w -5.3% · 4w -15.5% (84th pct of 2y 4w moves) · 13w +4.0% · 52w range position 53% (lo 55.27 / hi 112.9)
**Drivers (recent corr):** XLE +0.37 [textbook] · ^GSPC -0.44 [INVERTED] · HG=F -0.40 [INVERTED] · DX-Y.NYB +0.23 [weak] → **in charge: ^GSPC** (Demand (- = supply shock))
**Last 20 sessions decomposed (R² 0.32, n=60):** actual -16.9% = HG=F +3.2% · XLE -2.9% · ^GSPC +1.3% · DX-Y.NYB -0.9% · unexplained -17.6%
**Positioning (CFTC WTI-PHYSICAL, 2026-11-03, + = long WTI crude):** managed money +21,728 (+1% OI, 4w -31,870, 10th pct of 3y) · producers +369,347 (+19% OI, 4w +34,337, 96th pct of 3y)

### Gold  `GC=F`  3,988 (2026-11-12)
**Move:** 1w -3.0% · 4w -4.6% (52nd pct of 2y 4w moves) · 13w -10.1% · 52w range position 6% (lo 3,899 / hi 5,318)
**Drivers (recent corr):** DFII10 (missing) · DX-Y.NYB -0.27 [weak] · SI=F +0.89 [textbook] · BTC-USD +0.32 [textbook] → **in charge: SI=F** (Precious block)
**Last 20 sessions decomposed (R² 0.77, n=60):** actual -4.7% = SI=F -4.6% · DX-Y.NYB -0.6% · BTC-USD +0.5% · unexplained +0.0%
**Positioning (CFTC GOLD, 2026-11-03, + = long Gold):** managed money +103,614 (+26% OI, 4w -7,373, 22nd pct of 3y) · producers -8,912 (-2% OI, 4w +10,589, 100th pct of 3y)

### Silver  `SI=F`  51.58 (2026-11-12)
**Move:** 1w -1.3% · 4w -9.5% (61st pct of 2y 4w moves) · 13w -20.6% · 52w range position 4% (lo 49.1 / hi 115.1)
**Drivers (recent corr):** GC=F +0.89 [textbook] · HG=F +0.62 [textbook] → **in charge: GC=F** (Gold)
**Last 20 sessions decomposed (R² 0.81, n=60):** actual -10.0% = GC=F -6.3% · HG=F -1.9% · unexplained -1.7%
**Positioning (CFTC SILVER, 2026-11-03, + = long Silver):** managed money +4,035 (+3% OI, 4w -3,493, 5th pct of 3y) · producers -13,145 (-11% OI, 4w +3,108, 97th pct of 3y)

### Copper  `HG=F`  6.255 (2026-11-12)
**Move:** 1w +0.1% · 4w -4.2% (46th pct of 2y 4w moves) · 13w -5.2% · 52w range position 70% (lo 4.959 / hi 6.804)
**Drivers (recent corr):** ^GSPC +0.34 [textbook] → **in charge: ^GSPC** (Global growth)
**Last 20 sessions decomposed (R² 0.08, n=60):** actual -4.3% = ^GSPC -0.7% · unexplained -3.6%
**Positioning (CFTC COPPER- #1, 2026-11-03, + = long Copper):** managed money +34,890 (+11% OI, 4w -26,244, 48th pct of 3y) · producers -55,218 (-17% OI, 4w +37,502, 53rd pct of 3y)

### Nat gas (US)  `NG=F`  3.283 (2026-11-12)
**Move:** 1w +11.4% · 4w +5.4% (27th pct of 2y 4w moves) · 13w +20.1% · 52w range position 15% (lo 2.523 / hi 7.46)
**Drivers (recent corr):** CL=F -0.17 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual +5.2% = CL=F +0.4% · unexplained +4.8%
**Positioning (CFTC NAT GAS NYME, 2026-11-03, + = long Nat gas (US)):** managed money -225,359 (-13% OI, 4w -80,822, 1st pct of 3y) · producers -418 (-0% OI, 4w +7,811, 92nd pct of 3y)


## 9. Crypto

### Bitcoin  `BTC-USD`  73,737 (2026-11-12)
**Move:** 1w -2.9% · 4w -10.2% (68th pct of 2y 4w moves) · 13w +16.3% · 52w range position 37% (lo 58,559 / hi 99,697)
**Drivers (recent corr):** ^NDX +0.66 [textbook] · DX-Y.NYB -0.19 [weak] · GC=F +0.32 [textbook] → **in charge: ^NDX** (Tech / speculation)
**Last 20 sessions decomposed (R² 0.32, n=60):** actual -10.8% = ^NDX -4.6% · DX-Y.NYB -0.5% · GC=F +0.3% · unexplained -5.9%
**Positioning (CFTC BITCOIN, 2026-11-03, + = long Bitcoin):** lev funds -2,591 (-15% OI, 4w +4,261, 100th pct of 3y) · asset mgrs +2,403 (+14% OI, 4w -1,129, 3rd pct of 3y)

