# Daily-open research: cross-instrument summary

Anchor = broker daily candle (17:00 New York boundary; first bar 23:00 UK on gold/NQ). ADR = trailing 20-day median daily range. R = net of assumed cost unless 'gross'.

## Volatility around the open
| | Gold (XAUUSD) | Nasdaq (NAS100) | EURUSD |
|---|---|---|---|
| days | 2744 | 2744 | 2757 |
| median ADR20 | 20.85 | 209.9 | 0.00701 |
| first 60m share of day range (median) | 0.123 | 0.116 | 0.090 |
| last 60m share (control) | 0.102 | 0.129 | 0.099 |
| day high/low set in first 60m | 19.8% | 18.2% | 12.4% |
|   shuffled-returns null | 25.9% | 27.4% | 22.0% |
|   last 60m (control) | 10.1% | 21.8% | 10.3% |
| P(day low in first 60m | up close) | 19.9% | 19.6% | 13.8% |
|   shuffled null | 23.9% | 26.3% | 21.5% |
| first-60m direction = rest of day | 48.4% | 49.9% | 48.8% |
| first-120m direction = rest of day | 49.6% | 50.5% | 49.7% |
| open gap fill rate (all) | 95.1% | 92.6% | 96.6% |
| open gap fill rate, gap > 0.30 ADR | 45.9% | 54.3% | 53.3% |
| Monday gap fill rate | 86.0% | 81.2% | 88.0% |
| never returns to open after 0.3 ADR away | 41.3% | 41.2% | 42.3% |

## Opening-range breakout (23:00 UK open)
| | Gold (XAUUSD) | Nasdaq (NAS100) | EURUSD |
|---|---|---|---|
| or_5m: OR size (ADR) | 0.056 | 0.052 | 0.031 |
| or_5m: day closes on breakout side | 48.9% | 50.2% | 50.8% |
| or_5m: both sides taken | 88.4% | 88.6% | 94.6% |
| or_5m: race +1 OR (obs / RW null) | 57.3% / 58.0% | 59.1% / 58.7% | 57.3% / 66.6% |
| or_5m: 1R sim net / gross avg R | -0.317 / -0.026 (t -1.37) | -0.196 / +0.017 (t 0.88) | -0.912 / -0.192 (t -10.09) |
| or_15m: OR size (ADR) | 0.076 | 0.073 | 0.055 |
| or_15m: day closes on breakout side | 48.7% | 51.0% | 50.9% |
| or_15m: both sides taken | 85.2% | 85.5% | 91.1% |
| or_15m: race +1 OR (obs / RW null) | 53.8% / 55.1% | 56.0% / 55.7% | 50.7% / 58.9% |
| or_15m: 1R sim net / gross avg R | -0.247 / -0.035 (t -1.84) | -0.156 / +0.005 (t 0.28) | -0.567 / -0.158 (t -8.04) |
| or_30m: OR size (ADR) | 0.095 | 0.089 | 0.070 |
| or_30m: day closes on breakout side | 49.7% | 50.1% | 49.5% |
| or_30m: both sides taken | 81.9% | 82.9% | 89.3% |
| or_30m: race +1 OR (obs / RW null) | 52.5% / 54.2% | 55.7% / 54.9% | 50.6% / 56.7% |
| or_30m: 1R sim net / gross avg R | -0.195 / -0.023 (t -1.2) | -0.129 / +0.005 (t 0.25) | -0.441 / -0.127 (t -6.26) |
| or_60m: OR size (ADR) | 0.121 | 0.111 | 0.092 |
| or_60m: day closes on breakout side | 49.1% | 50.8% | 49.4% |
| or_60m: both sides taken | 77.7% | 79.8% | 85.7% |
| or_60m: race +1 OR (obs / RW null) | 54.4% / 53.9% | 54.4% / 54.4% | 50.3% / 54.6% |
| or_60m: 1R sim net / gross avg R | -0.127 / +0.005 (t 0.25) | -0.108 / +0.003 (t 0.14) | -0.308 / -0.074 (t -3.67) |

## Impulse leg -> fib pullback (legs >= 0.12 ADR, drawable within 4h of open)
| | Gold (XAUUSD) | Nasdaq (NAS100) | EURUSD |
|---|---|---|---|
| legs | 25670 | 14274 | 12374 |
| continuation (new extreme before origin taken) | 69.2% | 69.8% | 69.6% |
| P(cont | pullback reached 0.236) obs / RW null at bar close | 69.2% / 67.4% | 69.8% / 69.5% | 69.6% / 68.9% |
| P(cont | pullback reached 0.382) obs / RW null at bar close | 56.3% / 53.9% | 56.5% / 55.4% | 56.7% / 54.9% |
| P(cont | pullback reached 0.5) obs / RW null at bar close | 45.6% / 42.8% | 45.6% / 43.9% | 46.2% / 43.7% |
| P(cont | pullback reached 0.618) obs / RW null at bar close | 35.3% / 31.9% | 34.9% / 33.0% | 35.6% / 32.7% |
| P(cont | pullback reached 0.786) obs / RW null at bar close | 19.9% / 16.6% | 19.4% / 17.1% | 20.8% / 17.1% |
| extension >= 1.1 after continuation | 82.5% | 85.7% | 82.6% |
| extension >= 1.2 after continuation | 71.3% | 74.5% | 70.3% |
| extension >= 1.272 after continuation | 64.9% | 67.7% | 63.8% |
| extension >= 1.618 after continuation | 45.8% | 48.2% | 43.4% |
| sim entry_0.382|stop_origin+10%|target_1.272: net / gross avg R | -0.187 / -0.062 (t -8.78) | -0.160 / -0.056 (t -5.86) | -0.259 / -0.067 (t -6.53) |
| sim entry_0.5|stop_origin|target_1.272: net / gross avg R | -0.212 / -0.033 (t -3.26) | -0.177 / -0.027 (t -1.96) | -0.354 / -0.076 (t -5.18) |
| sim entry_0.618|stop_origin|target_1.618: net / gross avg R | -0.207 / +0.026 (t 1.6) | -0.197 / +0.001 (t 0.04) | -0.441 / -0.074 (t -3.25) |
| sim entry_0.786|stop_origin|target_1.618: net / gross avg R | -0.305 / +0.110 (t 4.08) | -0.327 / +0.029 (t 0.83) | -0.664 / -0.009 (t -0.25) |
| impulsive legs: P(cont | reached 0.5) obs / null | 47.4% / 42.8% | 48.4% / 43.5% | 47.0% / 43.2% |
| grind legs: P(cont | reached 0.5) obs / null | 44.1% / 42.7% | 43.3% / 44.3% | 45.4% / 44.1% |

## Session VWAP
| | Gold (XAUUSD) | Nasdaq (NAS100) | EURUSD |
|---|---|---|---|
| back to VWAP within 60m after 2-sigma touch / random bar | 42.6% / 34.3% | 25.0% / 36.1% | 34.2% / 36.3% |
| |z|>=1.5 at minute 120: closes further / back through VWAP | 42.4% / 48.4% | 45.6% / 45.7% | 42.3% / 49.6% |
| VWAP bounce race obs / RW null | 50.1% / 49.7% | 46.9% / 48.9% | 50.7% / 48.4% |
| fade 2 sigma sim net / gross avg R | -0.595 / +0.083 (t 1.48) | -0.764 / -0.062 (t -1.87) | -1.446 / +0.108 (t 1.77) |
| side of VWAP at 07:00 UK = rest of day | 51.2% | 52.6% | 49.7% |

## Asia range (23:00-07:00 UK) into London/NY
| | Gold (XAUUSD) | Nasdaq (NAS100) | EURUSD |
|---|---|---|---|
| Asia range (ADR, median) | 0.419 | 0.305 | 0.341 |
| both sides taken / neither | 34.8% / 2.9% | 53.9% / 0.8% | 46.8% / 0.8% |
| minutes from 07:00 to first break (median) | 68 | 72 | 44 |
| day closes beyond first-broken side | 52.4% | 51.1% | 51.6% |
| opposite side also taken after first break | 35.8% | 54.4% | 47.2% |
| breakout sim net / gross | -0.045 / +0.028 (t 1.14) | -0.064 / +0.015 (t 0.59) | -0.157 / -0.034 (t -1.39) |
| sweep-fade sim net / gross | -0.173 / +0.034 (t 0.75) | -0.196 / +0.021 (t 0.47) | -0.208 / +0.104 (t 2.33) |
| Asia range > 0.60 ADR: breakout sim net | +0.047 | -0.051 | -0.006 |
| Asia range < 0.25 ADR: opposite also taken | 59.3% | 66.6% | 62.9% |

## Prior levels and first candles
| | Gold (XAUUSD) | Nasdaq (NAS100) | EURUSD |
|---|---|---|---|
| PDH touched / reject-first at touch | 50.2% / 43.9% | 56.0% / 43.9% | 48.1% / 46.0% |
| PDL touched / reject-first at touch | 44.3% / 47.5% | 42.2% / 45.1% | 48.5% / 47.9% |
| PDC touched / reject-first at touch | 92.2% / 51.9% | 89.2% / 44.8% | 94.5% / 51.4% |
| PWH touched / reject-first at touch | 23.9% / 48.5% | 28.3% / 45.4% | 21.8% / 45.7% |
| PWL touched / reject-first at touch | 18.7% / 45.4% | 17.7% / 47.2% | 22.1% / 48.7% |
| first 15m candle: rest-of-day same direction | 48.8% | 50.0% | 49.4% |
| first 15m candle: opposite extreme holds all day | 8.6% | 9.0% | 3.8% |
| first 60m candle: rest-of-day same direction | 48.4% | 49.9% | 48.9% |
| first 60m candle: opposite extreme holds all day | 13.3% | 12.1% | 8.3% |
| first 240m candle: rest-of-day same direction | 49.4% | 49.9% | 49.5% |
| first 240m candle: opposite extreme holds all day | 33.7% | 25.6% | 21.6% |
