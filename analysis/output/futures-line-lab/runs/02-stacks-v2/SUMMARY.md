# 02-stacks-v2

EXPLORATORY (not pre-registered). Ran 2026-11-20T16:49:24+00:00. Config hash 3b07b8f85f.

Step 2: lines close together. A touch is stacked if another line sits within 5 ticks; lone vs stacked medians in sigma and back-wins. Try --set select.stack.unit=sigma --set select.stack.width=0.05.

Config: `config.json`. Lockbox (>= 2026-08-21) excluded.

## Excursions (ticks; sigma medians; back-wins %)

| instrument   |     n |   back_60m_p50_t |   through_60m_p50_t |   back_240m_p50_t |   through_240m_p50_t |   back_eod_p50_t |   through_eod_p50_t |   back_60m_p50_sig |   back_240m_p50_sig |   back_eod_p50_sig |   back_wins_60m |   back_wins_240m |   back_wins_eod |
|:-------------|------:|-----------------:|--------------------:|------------------:|---------------------:|-----------------:|--------------------:|-------------------:|--------------------:|-------------------:|----------------:|-----------------:|----------------:|
| NQ           | 30253 |            115.8 |               123.5 |             189.3 |                200.5 |            231.7 |               243.6 |              0.185 |               0.308 |              0.371 |            49.3 |             49.5 |            49.2 |
| EURUSD       | 28517 |             17.2 |                17.1 |              28.6 |                 29.7 |             34.9 |                36.3 |              0.175 |               0.29  |              0.355 |            50.4 |             50.4 |            50.5 |
| GOLD         | 32395 |             31.6 |                33.1 |              53.1 |                 56.2 |             65.8 |                70.1 |              0.176 |               0.294 |              0.364 |            50.2 |             49.2 |            48.5 |

## Stacks (sigma medians)

| instrument   |     n |   stacked_pct |   better_pct |   sigma_med_lone |   sigma_med_stacked |   lone_n |   lone_back_60m_sig |   lone_through_60m_sig |   lone_back_wins_60m |   lone_back_eod_sig |   lone_through_eod_sig |   lone_back_wins_eod |   stacked_n |   stacked_back_60m_sig |   stacked_through_60m_sig |   stacked_back_wins_60m |   stacked_back_eod_sig |   stacked_through_eod_sig |   stacked_back_wins_eod |
|:-------------|------:|--------------:|-------------:|-----------------:|--------------------:|---------:|--------------------:|-----------------------:|---------------------:|--------------------:|-----------------------:|---------------------:|------------:|-----------------------:|--------------------------:|------------------------:|-----------------------:|--------------------------:|------------------------:|
| NQ           | 30253 |          10.4 |         94.7 |     174.385      |         160.353     |    27099 |               0.186 |                  0.196 |                 49.1 |               0.371 |                  0.398 |                 49.3 |        3154 |                  0.176 |                     0.18  |                    50.3 |                  0.379 |                     0.427 |                    48.9 |
| EURUSD       | 28517 |          80   |         57.4 |       0.00530571 |           0.0048389 |     5695 |               0.188 |                  0.181 |                 50.9 |               0.351 |                  0.329 |                 51.9 |       22822 |                  0.173 |                     0.171 |                    50.2 |                  0.356 |                     0.378 |                    50.2 |
| GOLD         | 32395 |          39.3 |         79.4 |      19.965      |          15.165     |    19667 |               0.177 |                  0.185 |                 50.2 |               0.367 |                  0.419 |                 47.2 |       12728 |                  0.175 |                     0.182 |                    50.2 |                  0.358 |                     0.371 |                    50.5 |
