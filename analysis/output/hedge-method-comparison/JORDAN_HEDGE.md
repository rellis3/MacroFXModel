# jordan-usdchf-hedge (EXPLORATORY, not pre-registered)

Jordan's hedge from the C.OG thread (2026-11-20): short USD/CHF (main), short EUR/USD, GBP/USD and NZD/USD. Panel 2016-01-04 -> 2026-08-20, 2451 walk-forward days from 2016-12-23, daily NY-close returns, no costs. Same method as hedge-method-comparison. Exploratory: one hedge, no gate, no interval.

| Hedge sizing | Variance removed | first half | second half | 5% tail cut | worst-decile capture | daily sd of the hedged position |
|---|---|---|---|---|---|---|
| no hedge | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.471% |
| Jordan, equal 1:1:1 (each leg the same size as the main) | -480.3% | -572.7% | -421.5% | -129.8% | 208.3% | 1.135% |
| equal total size (1/3 each) | 39.0% | 28.3% | 45.8% | 23.7% | 69.4% | 0.368% |
| regression sizes, 60-day | 59.4% | 60.4% | 58.8% | 36.7% | 59.6% | 0.300% |
| regression sizes, EWMA | 60.6% | 61.1% | 60.3% | 37.8% | 60.3% | 0.296% |
| regression sizes, 250-day | 59.9% | 61.4% | 58.9% | 37.3% | 58.1% | 0.299% |

Average 60-day regression weights over the last 250 days (units of hedge return per unit of USD/CHF return, hedge direction negative = short alongside a short main): EUR/USD -0.95, GBP/USD -0.09, NZD/USD -0.05. Equal sizing is -1, -1, -1.
