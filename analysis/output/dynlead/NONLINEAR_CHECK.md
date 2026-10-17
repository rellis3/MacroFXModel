# COG-DYNAMIC-LEAD nonlinear check

Boosted trees, walk-forward by calendar year from 2019 (purge 10 days), target = next 5-day log return. M0 = own trailing returns and volatility; M1 = M0 + spread moves (k 1/5/20), rolling relationship state and divergence z for US-DE 2Y, US-DE 10Y, US-JP 10Y, US slope 10-2. Monthly rank IC; gain with 2 000-draw month bootstrap; placebo = spreads shifted (30 draws). Net Sharpe: sign of the prediction, 5-day staggered hold, class costs.

| asset   |   IC_M0 |   IC_M1 |   IC_gain |   ci_lo |   ci_hi |   p_boot |   placebo_mean |   placebo_p95 | beats_placebo   |   net_sharpe_M0 |   net_sharpe_M1 |   months |
|:--------|--------:|--------:|----------:|--------:|--------:|---------:|---------------:|--------------:|:----------------|----------------:|----------------:|---------:|
| EURUSD  |  0.1126 |  0.1817 |    0.0692 | -0.0119 |  0.1508 |   0.0475 |         0.0570 |        0.1037 | False           |         -0.2510 |         -0.1754 |       78 |
| USDJPY  |  0.0628 |  0.1591 |    0.0963 |  0.0173 |  0.1750 |   0.0080 |         0.0744 |        0.1369 | False           |         -0.0596 |         -0.2260 |       78 |
| GBPUSD  | -0.0479 |  0.0475 |    0.0954 |  0.0099 |  0.1794 |   0.0145 |         0.1143 |        0.1680 | False           |         -0.1354 |         -0.4386 |       78 |
| GOLD    |  0.1743 |  0.2050 |    0.0307 | -0.0331 |  0.0972 |   0.1875 |        -0.0063 |        0.0537 | False           |          0.0875 |          0.1950 |       71 |
| SPX500  |  0.0076 |  0.0783 |    0.0707 | -0.0341 |  0.1784 |   0.0990 |         0.0795 |        0.1420 | False           |          0.2956 |          0.3610 |       74 |

Assets where the IC gain beats the placebo 95th percentile: 0 of 5. Assets with net Sharpe above 0.5 for M1: 0.