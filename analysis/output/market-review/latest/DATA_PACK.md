# Market Review Data Pack: 2026-11-13

Fetched 2026-11-13T02:53:06+00:00. Descriptive numbers for the weekly review (read with `education/market_reviews/PLAYBOOK.md`). Correlations are of daily moves: last 20 sessions vs the 60 before. They are noisy; a flip is a question, not a signal.

**Data notes:** fred DGS2: The read operation timed out · fred DFII10: The read operation timed out · fred T10YIE: The read operation timed out · fred BAMLH0A0HYM2: The read operation timed out · fred BAMLC0A0CM: The read operation timed out · calendar 2026-11-14: HTTP Error 403: Forbidden · calendar 2026-11-15: HTTP Error 403: Forbidden · calendar 2026-11-16: HTTP Error 403: Forbidden · calendar 2026-11-17: HTTP Error 403: Forbidden · calendar 2026-11-18: HTTP Error 403: Forbidden · calendar 2026-11-19: HTTP Error 403: Forbidden · calendar 2026-11-20: HTTP Error 403: Forbidden · FRED DGS2 missing: US 2y = US 5y stand-in for this run · No local OAT/Bund futures: French spread proxy unavailable

## 1. Regime gauges: which story is the market trading?

| Pair | Recent | Before | Textbook sign | Status | What it means |
|---|---|---|---|---|---|
| CL=F vs US10Y | +0.01 | +0.16 | + | weak | Oil vs yields: + = oil is an inflation story; - = oil is a growth tax (2008-style) |
| ^NDX vs US10Y | +0.48 | -0.19 | − | INVERTED | Stocks vs yields: - = rates drive stocks; + = growth scare, bonds hedge stocks |
| HYG_TLT vs ^NDX | +0.52 | -0.03 | + | textbook | Credit vs tech: high + = credit and equities are one trade (credit stress leading) |
| DX-Y.NYB vs ^GSPC | -0.15 | +0.11 | − | weak | Dollar vs stocks: - = safe-haven dollar; ~0/+ = "sell America" or liquidity dash |
| AUDUSD=X vs ^NDX | +0.49 | +0.39 | + | textbook | Aussie vs tech: near 0 = AUD trading commodities not risk |
| BTC-USD vs ^NDX | +0.59 | +0.35 | + | textbook | Bitcoin vs tech: high = one liquidity complex |
| XLE vs CL=F | +0.41 | +0.32 | + | textbook | Energy stocks vs oil: falling = equity investors fade the oil move |
| USDJPY=X vs US10Y | +0.68 | +0.20 | + | textbook | Yen vs yields: high = yen is a pure rates trade |

Equity vol vs bond vol: VIX 18.7 (1y pct 71) · MOVE 98 (1y pct 89). When bond vol leads equity vol, the stress is in rates/credit first.

## 2. G10 FX

### EURUSD  `EURUSD=X`  1.106 (2026-11-13)
**Move:** 1w -1.5% · 4w -1.3% (56th pct of 2y 4w moves) · 13w -4.1% · 52w range position 0% (lo 1.106 / hi 1.202)
**Drivers (recent corr):** US_EA2 -0.16 [weak] · US_DE10 -0.10 [weak] · FR_DE (missing) · ^STOXX50E -0.12 [weak] · BZ=F -0.23 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.07, n=60):** actual -1.4% = BZ=F +0.1% · ^STOXX50E +0.1% · US_DE10 +0.1% · US_EA2 -0.0% · unexplained -1.6%
**Positioning (CFTC EURO FX, 2026-11-03, + = long EURUSD):** lev funds -78,559 (-9% OI, 4w -34,298, 1st pct of 3y) · asset mgrs +144,925 (+17% OI, 4w -44,956, 1st pct of 3y)

### USDJPY  `USDJPY=X`  159.9 (2026-11-13)
**Move:** 1w +1.5% · 4w +1.1% (40th pct of 2y 4w moves) · 13w +0.3% · 52w range position 65% (lo 152.5 / hi 163.9)
**Drivers (recent corr):** US10Y +0.68 [textbook] · US_JP10 +0.41 [textbook] · ^NDX +0.64 [textbook] · ^VIX -0.51 [textbook] → **in charge: US10Y** (US yields: the carry engine)
**Last 20 sessions decomposed (R² 0.16, n=60):** actual +1.1% = US_JP10 -0.2% · ^NDX -0.2% · US10Y +0.0% · ^VIX -0.0% · unexplained +1.5%
**Positioning (CFTC JAPANESE YEN, 2026-11-03, + = long USDJPY):** lev funds +14,817 (+4% OI, 4w -10,226, 24th pct of 3y) · asset mgrs -79,387 (-21% OI, 4w -11,592, 15th pct of 3y)

### GBPUSD  `GBPUSD=X`  1.324 (2026-11-13)
**Move:** 1w -1.6% · 4w -0.3% (12th pct of 2y 4w moves) · 13w -1.9% · 52w range position 23% (lo 1.306 / hi 1.383)
**Drivers (recent corr):** US_GB10 -0.20 [weak] · GB10Y -0.34 [INVERTED] · ^GSPC +0.03 [weak] · EURUSD=X +0.91 [textbook] → **in charge: EURUSD=X** (European block move)
**Last 20 sessions decomposed (R² 0.73, n=60):** actual -0.3% = EURUSD=X -1.2% · US_GB10 -0.2% · GB10Y +0.1% · ^GSPC -0.0% · unexplained +1.0%
**Positioning (CFTC BRITISH POUND, 2026-11-03, + = long GBPUSD):** lev funds +26,663 (+11% OI, 4w +14,231, 33rd pct of 3y) · asset mgrs -121,163 (-49% OI, 4w +24,279, 9th pct of 3y)

### USDCAD  `USDCAD=X`  1.426 (2026-11-13)
**Move:** 1w +1.7% · 4w +0.5% (23rd pct of 2y 4w moves) · 13w +2.4% · 52w range position 97% (lo 1.349 / hi 1.428)
**Drivers (recent corr):** CL=F +0.03 [weak] · US_CA2 +0.37 [textbook] · ^GSPC +0.04 [weak] → **in charge: US_CA2** (US-Canada 2y rate gap)
**Last 20 sessions decomposed (R² 0.18, n=60):** actual +0.5% = ^GSPC +0.0% · US_CA2 +0.0% · CL=F +0.0% · unexplained +0.4%
**Positioning (CFTC CANADIAN DOLLAR, 2026-11-03, + = long USDCAD):** lev funds +86,302 (+25% OI, 4w +6,677, 87th pct of 3y) · asset mgrs -16,453 (-5% OI, 4w -52,259, 8th pct of 3y)

### AUDUSD  `AUDUSD=X`  0.6811 (2026-11-13)
**Move:** 1w -1.7% · 4w -1.6% (59th pct of 2y 4w moves) · 13w -3.6% · 52w range position 45% (lo 0.6449 / hi 0.7255)
**Drivers (recent corr):** HG=F +0.30 [weak] · ^NDX +0.49 [textbook] · GC=F +0.17 [weak] → **in charge: ^NDX** (Global risk proxy)
**Last 20 sessions decomposed (R² 0.16, n=60):** actual -1.6% = ^NDX -0.3% · HG=F -0.1% · GC=F -0.0% · unexplained -1.1%
**Positioning (CFTC AUSTRALIAN DOLLAR, 2026-11-03, + = long AUDUSD):** lev funds +50,106 (+15% OI, 4w -4,027, 88th pct of 3y) · asset mgrs -130,780 (-40% OI, 4w -29,352, 1st pct of 3y)

### NZDUSD  `NZDUSD=X`  0.5546 (2026-11-13)
**Move:** 1w -0.9% · 4w -1.3% (46th pct of 2y 4w moves) · 13w -5.3% · 52w range position 0% (lo 0.5546 / hi 0.6076)
**Drivers (recent corr):** AUDUSD=X +0.58 [textbook] · ^GSPC +0.39 [textbook] · US2Y -0.06 [weak] → **in charge: AUDUSD=X** (Antipodean block)
**Last 20 sessions decomposed (R² 0.37, n=60):** actual -1.4% = AUDUSD=X -0.7% · ^GSPC -0.1% · US2Y -0.1% · unexplained -0.5%
**Positioning (CFTC NZ DOLLAR, 2026-11-03, + = long NZDUSD):** lev funds -23,154 (-17% OI, 4w -22,367, 7th pct of 3y) · asset mgrs -46,700 (-35% OI, 4w -14,166, 11th pct of 3y)

### USDCHF  `USDCHF=X`  0.8354 (2026-11-13)
**Move:** 1w +2.5% · 4w +0.9% (37th pct of 2y 4w moves) · 13w +2.6% · 52w range position 100% (lo 0.7632 / hi 0.8357)
**Drivers (recent corr):** US10Y +0.54 [textbook] · ^VIX -0.27 [weak] · GC=F -0.01 [weak] → **in charge: US10Y** (US yields)
**Last 20 sessions decomposed (R² 0.32, n=60):** actual +0.9% = GC=F -0.1% · US10Y +0.0% · ^VIX +0.0% · unexplained +1.0%
**Positioning (CFTC SWISS FRANC, 2026-11-03, + = long USDCHF):** lev funds +16,845 (+13% OI, 4w +5,495, 95th pct of 3y) · asset mgrs +20,853 (+16% OI, 4w -16,526, 18th pct of 3y)


## 3. G10 crosses

### AUDNZD  `AUDNZD=X`  1.228 (2026-11-13)
**Move:** 1w -0.9% · 4w -0.2% (10th pct of 2y 4w moves) · 13w +1.8% · 52w range position 77% (lo 1.141 / hi 1.254)
**Drivers (recent corr):** HG=F +0.09 [weak] · ^AXJO -0.29 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.09, n=60):** actual -0.2% = ^AXJO -0.4% · HG=F -0.1% · unexplained +0.4%

### EURGBP  `EURGBP=X`  0.8355 (2026-11-13)
**Move:** 1w +0.1% · 4w -1.1% (68th pct of 2y 4w moves) · 13w -2.3% · 52w range position 4% (lo 0.8336 / hi 0.8842)
**Drivers (recent corr):** GB10Y +0.25 [weak] · FR_DE (missing) → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual -1.1% = GB10Y -0.0% · unexplained -1.1%

### EURCHF  `EURCHF=X`  0.9238 (2026-11-13)
**Move:** 1w +0.9% · 4w -0.5% (33rd pct of 2y 4w moves) · 13w -1.6% · 52w range position 49% (lo 0.9023 / hi 0.9466)
**Drivers (recent corr):** ^STOXX50E +0.33 [textbook] · FR_DE (missing) · ^VIX -0.40 [textbook] → **in charge: ^VIX** (Haven flows)
**Last 20 sessions decomposed (R² 0.05, n=60):** actual -0.5% = ^STOXX50E +0.2% · ^VIX +0.0% · unexplained -0.6%


## 4. EM FX

### USDMXN  `USDMXN=X`  18.59 (2026-11-13)
**Move:** 1w -1.0% · 4w +0.8% (27th pct of 2y 4w moves) · 13w +9.2% · 52w range position 87% (lo 16.89 / hi 18.85)
**Drivers (recent corr):** ^VIX +0.38 [textbook] · ^GSPC -0.36 [textbook] · CL=F +0.76 [INVERTED] · USDBRL=X -0.17 [weak] → **in charge: CL=F** (Oil)
**Last 20 sessions decomposed (R² 0.21, n=60):** actual +0.8% = CL=F -0.7% · USDBRL=X +0.7% · ^GSPC +0.1% · ^VIX -0.0% · unexplained +0.8%
**Positioning (CFTC MEXICAN PESO, 2026-11-03, + = long USDMXN):** lev funds -71,381 (-25% OI, 4w +3,546, 6th pct of 3y) · asset mgrs +36,349 (+13% OI, 4w +15,750, 100th pct of 3y)

### USDBRL  `USDBRL=X`  5.642 (2026-11-13)
**Move:** 1w +2.5% · 4w +10.7% (100th pct of 2y 4w moves) · 13w +8.5% · 52w range position 100% (lo 4.906 / hi 5.642)
**Drivers (recent corr):** ^VIX +0.12 [weak] · HG=F +0.22 [weak] · EWZ -0.94 [textbook] → **in charge: EWZ** (Brazil equities (local flows))
**Last 20 sessions decomposed (R² 0.86, n=60):** actual +10.2% = EWZ +8.1% · HG=F +0.2% · ^VIX -0.0% · unexplained +1.9%
**Positioning (CFTC BRAZILIAN REAL, 2026-11-03, + = long USDBRL):** lev funds -38,613 (-22% OI, 4w -11,217, 1st pct of 3y) · asset mgrs -49,879 (-29% OI, 4w +6,731, 48th pct of 3y)

### USDZAR  `USDZAR=X`  16.75 (2026-11-13)
**Move:** 1w +1.6% · 4w +1.5% (47th pct of 2y 4w moves) · 13w +3.5% · 52w range position 66% (lo 15.71 / hi 17.29)
**Drivers (recent corr):** GC=F -0.39 [textbook] · ^VIX +0.46 [textbook] · HG=F -0.03 [weak] → **in charge: ^VIX** (Carry / risk)
**Last 20 sessions decomposed (R² 0.17, n=60):** actual +1.5% = GC=F +0.5% · HG=F -0.2% · ^VIX -0.1% · unexplained +1.2%
**Positioning (CFTC SO AFRICAN RAND, 2026-11-03, + = long USDZAR):** lev funds -6,317 (-17% OI, 4w -1,908, 17th pct of 3y) · asset mgrs -14,523 (-40% OI, 4w +3,361, 33rd pct of 3y)

### USDKRW  `USDKRW=X`  1,332 (2026-11-13)
**Move:** 1w -1.8% · 4w -0.7% (25th pct of 2y 4w moves) · 13w -6.0% · 52w range position 3% (lo 1,324 / hi 1,552)
**Drivers (recent corr):** ^KS11 +0.06 [weak] · SOXX -0.53 [textbook] · DX-Y.NYB +0.03 [weak] → **in charge: SOXX** (Global semis cycle)
**Last 20 sessions decomposed (R² 0.12, n=60):** actual -0.7% = DX-Y.NYB +0.4% · SOXX +0.4% · ^KS11 -0.2% · unexplained -1.2%


## 5. CE3 FX

### EURCZK  `EURCZK=X`  24.38 (2026-11-13)
**Move:** 1w +0.3% · 4w +0.2% (38th pct of 2y 4w moves) · 13w +0.7% · 52w range position 66% (lo 24.07 / hi 24.53)
**Drivers (recent corr):** ^STOXX50E -0.28 [weak] · EURPLN=X +0.61 [textbook] → **in charge: EURPLN=X** (CE3 block)
**Last 20 sessions decomposed (R² 0.28, n=60):** actual +0.2% = EURPLN=X +0.2% · ^STOXX50E -0.1% · unexplained +0.1%

### EURPLN  `EURPLN=X`  4.403 (2026-11-13)
**Move:** 1w +0.1% · 4w +0.9% (72nd pct of 2y 4w moves) · 13w +2.2% · 52w range position 96% (lo 4.197 / hi 4.412)
**Drivers (recent corr):** ^STOXX50E -0.37 [textbook] · ^VIX +0.49 [textbook] → **in charge: ^VIX** (Risk)
**Last 20 sessions decomposed (R² 0.17, n=60):** actual +0.9% = ^STOXX50E -0.2% · ^VIX -0.0% · unexplained +1.1%


## 6. Equities

### S&P 500  `^GSPC`  7,592 (2026-11-13)
**Move:** 1w +2.9% · 4w -0.9% (21st pct of 2y 4w moves) · 13w -2.5% · 52w range position 85% (lo 6,344 / hi 7,819)
**Drivers (recent corr):** US10Y +0.30 [INVERTED, was textbook] · HYG_TLT +0.36 [textbook] · DX-Y.NYB -0.15 [weak] · CL=F -0.42 [textbook] · ^VIX -0.96 [textbook] → **in charge: ^VIX** (Vol)
**Last 20 sessions decomposed (R² 0.86, n=60):** actual -0.9% = ^VIX +0.5% · CL=F +0.4% · HYG_TLT +0.2% · DX-Y.NYB +0.1% · US10Y -0.0% · unexplained -2.0%
**Positioning (CFTC E-MINI S&P 500, 2026-11-03, + = long S&P 500):** lev funds -372,318 (-19% OI, 4w +42,769, 36th pct of 3y) · asset mgrs +928,584 (+47% OI, 4w +21,969, 48th pct of 3y)

### Nasdaq 100  `^NDX`  28,289 (2026-11-13)
**Move:** 1w +4.8% · 4w -3.1% (47th pct of 2y 4w moves) · 13w -5.8% · 52w range position 65% (lo 22,953 / hi 31,224)
**Drivers (recent corr):** US10Y +0.48 [INVERTED] · SOXX +0.96 [textbook] · HYG_TLT +0.52 [textbook] · BTC-USD +0.59 [textbook] → **in charge: SOXX** (Semis / AI capex)
**Last 20 sessions decomposed (R² 0.90, n=60):** actual -3.1% = SOXX -2.2% · BTC-USD -2.1% · HYG_TLT +0.2% · US10Y -0.0% · unexplained +1.0%
**Positioning (CFTC NASDAQ MINI, 2026-11-03, + = long Nasdaq 100):** lev funds +10,073 (+3% OI, 4w +29,285, 97th pct of 3y) · asset mgrs +73,137 (+25% OI, 4w -661, 45th pct of 3y)

### Russell 2000  `^RUT`  2,799 (2026-11-13)
**Move:** 1w +1.6% · 4w +2.9% (39th pct of 2y 4w moves) · 13w -8.8% · 52w range position 65% (lo 2,305 / hi 3,068)
**Drivers (recent corr):** US2Y +0.08 [weak] · HYG_TLT +0.05 [weak] · ^GSPC +0.90 [textbook] → **in charge: ^GSPC** (Beta)
**Last 20 sessions decomposed (R² 0.76, n=60):** actual +2.8% = ^GSPC -0.9% · US2Y -0.2% · HYG_TLT -0.1% · unexplained +4.0%

### Euro Stoxx 50  `^STOXX50E`  6,399 (2026-11-13)
**Move:** 1w +3.7% · 4w +3.1% (59th pct of 2y 4w moves) · 13w -2.2% · 52w range position 86% (lo 5,501 / hi 6,551)
**Drivers (recent corr):** FR_DE (missing) · ^GSPC +0.59 [textbook] · BZ=F -0.44 [textbook] · EURUSD=X -0.12 [weak] → **in charge: ^GSPC** (US lead)
**Last 20 sessions decomposed (R² 0.31, n=60):** actual +3.1% = BZ=F +1.0% · ^GSPC -0.3% · EURUSD=X -0.1% · unexplained +2.5%

### CAC 40  `^FCHI`  8,361 (2026-11-13)
**Move:** 1w +2.7% · 4w +5.1% (83rd pct of 2y 4w moves) · 13w -3.2% · 52w range position 66% (lo 7,666 / hi 8,726)
**Drivers (recent corr):** FR_DE (missing) · ^STOXX50E +0.91 [textbook] → **in charge: ^STOXX50E** (European block)
**Last 20 sessions decomposed (R² 0.78, n=60):** actual +5.0% = ^STOXX50E +2.6% · unexplained +2.4%

### DAX  `^GDAXI`  26,772 (2026-11-13)
**Move:** 1w +3.7% · 4w +4.5% (75th pct of 2y 4w moves) · 13w +1.3% · 52w range position 100% (lo 22,301 / hi 26,772)
**Drivers (recent corr):** DE10Y +0.47 [INVERTED] · ^GSPC +0.49 [textbook] → **in charge: ^GSPC** (Global risk)
**Last 20 sessions decomposed (R² 0.23, n=60):** actual +4.4% = ^GSPC -0.4% · DE10Y +0.3% · unexplained +4.5%

### FTSE 100  `^FTSE`  10,863 (2026-11-13)
**Move:** 1w +1.8% · 4w -0.2% (5th pct of 2y 4w moves) · 13w +1.1% · 52w range position 97% (lo 9,507 / hi 10,911)
**Drivers (recent corr):** BZ=F -0.44 [INVERTED] · GBPUSD=X -0.07 [weak] · GB10Y -0.61 [textbook] → **in charge: GB10Y** (Gilts)
**Last 20 sessions decomposed (R² 0.40, n=60):** actual -0.2% = GB10Y +1.2% · BZ=F +0.4% · GBPUSD=X +0.0% · unexplained -1.8%

### Nikkei 225  `^N225`  61,817 (2026-11-13)
**Move:** 1w +7.6% · 4w -5.4% (57th pct of 2y 4w moves) · 13w -10.0% · 52w range position 56% (lo 48,538 / hi 72,366)
**Drivers (recent corr):** USDJPY=X +0.40 [textbook] · ^NDX +0.58 [textbook] · SOXX +0.60 [textbook] → **in charge: SOXX** (Chips (prior US day))
**Last 20 sessions decomposed (R² 0.29, n=60):** actual -5.5% = SOXX -1.7% · ^NDX -1.3% · USDJPY=X -0.1% · unexplained -2.4%

### KOSPI  `^KS11`  5,431 (2026-11-13)
**Move:** 1w +7.3% · 4w -4.2% (36th pct of 2y 4w moves) · 13w -22.2% · 52w range position 30% (lo 3,846 / hi 9,115)
**Drivers (recent corr):** SOXX +0.39 [textbook] · ^NDX +0.30 [weak] → **in charge: SOXX** (Memory / AI hardware (prior US day))
**Last 20 sessions decomposed (R² 0.22, n=60):** actual -4.3% = SOXX -7.7% · ^NDX +5.8% · unexplained -2.4%

### Hang Seng  `^HSI`  23,866 (2026-11-13)
**Move:** 1w -2.5% · 4w -1.3% (22nd pct of 2y 4w moves) · 13w -5.0% · 52w range position 23% (lo 22,672 / hi 27,968)
**Drivers (recent corr):** ^NDX -0.01 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual -1.3% = ^NDX -0.2% · unexplained -1.1%

### ASX 200  `^AXJO`  9,082 (2026-11-13)
**Move:** 1w +0.7% · 4w +3.1% (67th pct of 2y 4w moves) · 13w -0.4% · 52w range position 79% (lo 8,366 / hi 9,272)
**Drivers (recent corr):** HG=F +0.39 [textbook] · ^GSPC +0.48 [textbook] → **in charge: ^GSPC** (US lead (prior US day))
**Last 20 sessions decomposed (R² 0.22, n=60):** actual +3.1% = HG=F -0.7% · ^GSPC -0.4% · unexplained +4.2%


## 7. Rates

### US 2y  `US2Y`  4.95% (2026-11-13)
**Move:** 1w +30bp · 4w +5bp (24th pct of 2y 4w moves) · 13w +58bp · 52w range position 91% (lo 3.512 / hi 5.089)
**Drivers (recent corr):** CL=F -0.06 [weak] · ^GSPC +0.37 [textbook, was INVERTED] → **in charge: ^GSPC** (Risk-on = fewer cuts / more hikes)
**Last 20 sessions decomposed (R² 0.01, n=60):** actual +5bp = CL=F -1bp · ^GSPC -1bp · unexplained +6bp
**Positioning (CFTC UST 2Y NOTE, 2026-11-03, + = long US 2y):** lev funds +1,450,892 (+33% OI, 4w +193,408, 15th pct of 3y) · asset mgrs -1,876,612 (-42% OI, 4w -197,525, 59th pct of 3y)

### US 10y  `US10Y`  5.10% (2026-11-13)
**Move:** 1w +24bp · 4w +0bp (2nd pct of 2y 4w moves) · 13w +41bp · 52w range position 85% (lo 3.962 / hi 5.311)
**Drivers (recent corr):** CL=F +0.01 [weak] · ^NDX +0.48 [INVERTED] · T10YIE (missing) · DE10Y +0.12 [weak] → **in charge: ^NDX** (Textbook: yields up hurt stocks; + means bonds hedge stocks)
**Last 20 sessions decomposed (R² 0.08, n=60):** actual +0bp = ^NDX -3bp · CL=F -3bp · DE10Y -2bp · unexplained +8bp
**Positioning (CFTC UST 10Y NOTE, 2026-11-03, + = long US 10y):** lev funds +2,262,310 (+38% OI, 4w +122,525, 86th pct of 3y) · asset mgrs -3,030,236 (-51% OI, 4w -202,097, 1st pct of 3y)

### US 30y  `US30Y`  5.43% (2026-11-13)
**Move:** 1w +17bp · 4w -0bp (2nd pct of 2y 4w moves) · 13w +17bp · 52w range position 78% (lo 4.633 / hi 5.665)
**Drivers (recent corr):** US2Y +0.92 [textbook] · T10YIE (missing) → **in charge: US2Y** (Front end)
**Last 20 sessions decomposed (R² 0.73, n=60):** actual -0bp = US2Y +3bp · unexplained -3bp
**Positioning (CFTC UST BOND, 2026-11-03, + = long US 30y):** lev funds +166,257 (+9% OI, 4w -23,421, 3rd pct of 3y) · asset mgrs -415,379 (-22% OI, 4w -9,751, 90th pct of 3y)

### Bund 10y  `DE10Y`  3.33% (2026-11-13)
**Move:** 1w +6bp · 4w -12bp (56th pct of 2y 4w moves) · 13w +15bp · 52w range position 66% (lo 2.69 / hi 3.66)
**Drivers (recent corr):** US10Y +0.12 [weak] · BZ=F -0.06 [weak] · FR_DE (missing) → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.03, n=60):** actual -12bp = BZ=F -0bp · US10Y +0bp · unexplained -12bp

### Gilt 10y  `GB10Y`  5.19% (2026-11-13)
**Move:** 1w +5bp · 4w -15bp (59th pct of 2y 4w moves) · 13w +10bp · 52w range position 74% (lo 4.352 / hi 5.478)
**Drivers (recent corr):** US10Y +0.67 [textbook] · GBPUSD=X -0.34 [textbook] → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.38, n=60):** actual -15bp = GBPUSD=X +0bp · US10Y +0bp · unexplained -15bp

### JGB 10y  `JP10Y`  2.84% (2026-11-13)
**Move:** 1w +15bp · 4w -12bp (52nd pct of 2y 4w moves) · 13w -4bp · 52w range position 81% (lo 1.714 / hi 3.111)
**Drivers (recent corr):** US10Y +0.72 [textbook] · USDJPY=X +0.71 [textbook] → **in charge: US10Y** (Global duration)
**Last 20 sessions decomposed (R² 0.51, n=60):** actual -12bp = USDJPY=X +3bp · US10Y +0bp · unexplained -15bp

### Canada 10y  `CA10Y`  3.72% (2026-11-13)
**Move:** 1w +7bp · 4w -12bp (49th pct of 2y 4w moves) · 13w +4bp · 52w range position 69% (lo 3.12 / hi 3.99)
**Drivers (recent corr):** US10Y +0.85 [textbook] · CL=F +0.09 [weak] → **in charge: US10Y** (US spillover)
**Last 20 sessions decomposed (R² 0.65, n=60):** actual -12bp = CL=F -3bp · US10Y +0bp · unexplained -9bp

### French spread (proxy)
_no data_


## 8. Commodities

### WTI crude  `CL=F`  88.53 (2026-11-13)
**Move:** 1w -2.5% · 4w -12.7% (80th pct of 2y 4w moves) · 13w +7.4% · 52w range position 58% (lo 55.27 / hi 112.9)
**Drivers (recent corr):** XLE +0.41 [textbook] · ^GSPC -0.42 [INVERTED] · HG=F -0.39 [INVERTED] · DX-Y.NYB +0.28 [weak] → **in charge: ^GSPC** (Demand (- = supply shock))
**Last 20 sessions decomposed (R² 0.32, n=60):** actual -13.6% = XLE -3.6% · HG=F +3.5% · DX-Y.NYB -0.8% · ^GSPC +0.7% · unexplained -13.4%
**Positioning (CFTC WTI-PHYSICAL, 2026-11-03, + = long WTI crude):** managed money +21,728 (+1% OI, 4w -31,870, 10th pct of 3y) · producers +369,347 (+19% OI, 4w +34,337, 96th pct of 3y)

### Gold  `GC=F`  3,916 (2026-11-13)
**Move:** 1w -3.9% · 4w -6.3% (66th pct of 2y 4w moves) · 13w -11.7% · 52w range position 1% (lo 3,899 / hi 5,318)
**Drivers (recent corr):** DFII10 (missing) · DX-Y.NYB -0.28 [weak] · SI=F +0.89 [textbook] · BTC-USD +0.23 [weak] → **in charge: SI=F** (Precious block)
**Last 20 sessions decomposed (R² 0.77, n=60):** actual -6.5% = SI=F -5.6% · BTC-USD +0.7% · DX-Y.NYB -0.7% · unexplained -1.0%
**Positioning (CFTC GOLD, 2026-11-03, + = long Gold):** managed money +103,614 (+26% OI, 4w -7,373, 22nd pct of 3y) · producers -8,912 (-2% OI, 4w +10,589, 100th pct of 3y)

### Silver  `SI=F`  50.54 (2026-11-13)
**Move:** 1w -2.4% · 4w -11.3% (69th pct of 2y 4w moves) · 13w -22.2% · 52w range position 2% (lo 49.1 / hi 115.1)
**Drivers (recent corr):** GC=F +0.89 [textbook] · HG=F +0.63 [textbook] → **in charge: GC=F** (Gold)
**Last 20 sessions decomposed (R² 0.81, n=60):** actual -12.0% = GC=F -8.7% · HG=F -2.2% · unexplained -1.1%
**Positioning (CFTC SILVER, 2026-11-03, + = long Silver):** managed money +4,035 (+3% OI, 4w -3,493, 5th pct of 3y) · producers -13,145 (-11% OI, 4w +3,108, 97th pct of 3y)

### Copper  `HG=F`  6.225 (2026-11-13)
**Move:** 1w +0.1% · 4w -4.7% (49th pct of 2y 4w moves) · 13w -5.7% · 52w range position 69% (lo 4.959 / hi 6.804)
**Drivers (recent corr):** ^GSPC +0.36 [textbook] → **in charge: ^GSPC** (Global growth)
**Last 20 sessions decomposed (R² 0.09, n=60):** actual -4.8% = ^GSPC -0.4% · unexplained -4.4%
**Positioning (CFTC COPPER- #1, 2026-11-03, + = long Copper):** managed money +34,890 (+11% OI, 4w -26,244, 48th pct of 3y) · producers -55,218 (-17% OI, 4w +37,502, 53rd pct of 3y)

### Nat gas (US)  `NG=F`  3.348 (2026-11-13)
**Move:** 1w +11.7% · 4w +7.4% (40th pct of 2y 4w moves) · 13w +22.5% · 52w range position 17% (lo 2.523 / hi 7.46)
**Drivers (recent corr):** CL=F -0.12 [weak] → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)
**Last 20 sessions decomposed (R² 0.00, n=60):** actual +7.2% = CL=F +0.2% · unexplained +7.0%
**Positioning (CFTC NAT GAS NYME, 2026-11-03, + = long Nat gas (US)):** managed money -225,359 (-13% OI, 4w -80,822, 1st pct of 3y) · producers -418 (-0% OI, 4w +7,811, 92nd pct of 3y)


## 9. Crypto

### Bitcoin  `BTC-USD`  69,954 (2026-11-13)
**Move:** 1w -7.6% · 4w -14.2% (78th pct of 2y 4w moves) · 13w +11.1% · 52w range position 30% (lo 58,559 / hi 96,929)
**Drivers (recent corr):** ^NDX +0.59 [textbook] · DX-Y.NYB -0.13 [weak] · GC=F +0.23 [weak] → **in charge: ^NDX** (Tech / speculation)
**Last 20 sessions decomposed (R² 0.33, n=60):** actual -15.3% = ^NDX -2.6% · GC=F +0.5% · DX-Y.NYB -0.3% · unexplained -12.9%
**Positioning (CFTC BITCOIN, 2026-11-03, + = long Bitcoin):** lev funds -2,591 (-15% OI, 4w +4,261, 100th pct of 3y) · asset mgrs +2,403 (+14% OI, 4w -1,129, 3rd pct of 3y)

