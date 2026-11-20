# 02-stacks-v3-2018

EXPLORATORY (not pre-registered). Ran 2026-11-20T16:49:45+00:00. Config hash 49ac03e8b7.

Step 2: lines close together. A touch is stacked if another line sits within 5 ticks; lone vs stacked medians in sigma and back-wins. Try --set select.stack.unit=sigma --set select.stack.width=0.05.

Config: `config.json`. Lockbox (>= 2026-08-21) excluded.

## Excursions (ticks; sigma medians; back-wins %)

| instrument   |     n |   back_60m_p50_t |   through_60m_p50_t |   back_240m_p50_t |   through_240m_p50_t |   back_eod_p50_t |   through_eod_p50_t |   back_60m_p50_sig |   back_240m_p50_sig |   back_eod_p50_sig |   back_wins_60m |   back_wins_240m |   back_wins_eod |
|:-------------|------:|-----------------:|--------------------:|------------------:|---------------------:|-----------------:|--------------------:|-------------------:|--------------------:|-------------------:|----------------:|-----------------:|----------------:|
| NQ           | 31939 |            116.2 |               124.8 |             192.6 |                205.6 |            236.3 |               249.5 |              0.198 |               0.331 |              0.413 |            49.2 |             49.3 |            49.3 |
| EURUSD       | 26059 |             16.7 |                17.5 |              27.9 |                 30   |             33.8 |                36.2 |              0.179 |               0.301 |              0.367 |            49.7 |             49.4 |            49.9 |
| GOLD         | 25686 |             29.6 |                30.7 |              51   |                 52.2 |             64.2 |                66.9 |              0.184 |               0.308 |              0.387 |            50.2 |             50   |            49.8 |

## Stacks (sigma medians)

| instrument   |     n |   stacked_pct |   better_pct |   sigma_med_lone |   sigma_med_stacked |   lone_n |   lone_back_60m_sig |   lone_through_60m_sig |   lone_back_wins_60m |   lone_back_eod_sig |   lone_through_eod_sig |   lone_back_wins_eod |   stacked_n |   stacked_back_60m_sig |   stacked_through_60m_sig |   stacked_back_wins_60m |   stacked_back_eod_sig |   stacked_through_eod_sig |   stacked_back_wins_eod |
|:-------------|------:|--------------:|-------------:|-----------------:|--------------------:|---------:|--------------------:|-----------------------:|---------------------:|--------------------:|-----------------------:|---------------------:|------------:|-----------------------:|--------------------------:|------------------------:|-----------------------:|--------------------------:|------------------------:|
| NQ           | 31939 |          13.9 |         98.1 |     159.058      |        122.197      |    27509 |               0.204 |                  0.218 |                 49.2 |               0.423 |                  0.431 |                 49.5 |        4430 |                  0.162 |                     0.18  |                    49.3 |                  0.36  |                     0.414 |                    48.1 |
| EURUSD       | 26059 |          80.7 |         72.1 |       0.00498459 |          0.00462248 |     5021 |               0.196 |                  0.194 |                 49.9 |               0.372 |                  0.357 |                 51.2 |       21038 |                  0.175 |                     0.187 |                    49.6 |                  0.367 |                     0.395 |                    49.6 |
| GOLD         | 25686 |          64   |         73.2 |      21.6392     |         14.0739     |     9252 |               0.187 |                  0.193 |                 50.1 |               0.356 |                  0.414 |                 47.8 |       16434 |                  0.181 |                     0.188 |                    50.2 |                  0.404 |                     0.42  |                    51   |
