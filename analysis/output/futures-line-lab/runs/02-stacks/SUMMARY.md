# 02-stacks

EXPLORATORY (not pre-registered). Ran 2026-11-18T16:28:27+00:00. Config hash acf7012e79.

Step 2: lines close together. A touch is stacked if another line sits within 5 ticks; lone vs stacked medians in sigma and back-wins. Try --set select.stack.unit=sigma --set select.stack.width=0.05.

Config: `config.json`. Lockbox (>= 2026-08-21) excluded.

## Excursions (ticks; sigma medians; back-wins %)

| instrument   |     n |   back_60m_p50_t |   through_60m_p50_t |   back_240m_p50_t |   through_240m_p50_t |   back_eod_p50_t |   through_eod_p50_t |   back_60m_p50_sig |   back_240m_p50_sig |   back_eod_p50_sig |   back_wins_60m |   back_wins_240m |   back_wins_eod |
|:-------------|------:|-----------------:|--------------------:|------------------:|---------------------:|-----------------:|--------------------:|-------------------:|--------------------:|-------------------:|----------------:|-----------------:|----------------:|
| NQ           | 36977 |             93.6 |               103.3 |             156.6 |                168.2 |            189.5 |               206.2 |              0.198 |               0.332 |              0.413 |            49   |             49.4 |            49.6 |
| EURUSD       | 31341 |             16.9 |                17.6 |              28.1 |                 30.2 |             34.1 |                36.7 |              0.178 |               0.299 |              0.363 |            49.9 |             49.2 |            49.6 |
| GOLD         | 29641 |             26.6 |                27.8 |              45.6 |                 47   |             57.7 |                60.6 |              0.181 |               0.303 |              0.381 |            50   |             50   |            49.9 |

## Stacks (sigma medians)

| instrument   |     n |   stacked_pct |   better_pct |   sigma_med_lone |   sigma_med_stacked |   lone_n |   lone_back_60m_sig |   lone_through_60m_sig |   lone_back_wins_60m |   lone_back_eod_sig |   lone_through_eod_sig |   lone_back_wins_eod |   stacked_n |   stacked_back_60m_sig |   stacked_through_60m_sig |   stacked_back_wins_60m |   stacked_back_eod_sig |   stacked_through_eod_sig |   stacked_back_wins_eod |
|:-------------|------:|--------------:|-------------:|-----------------:|--------------------:|---------:|--------------------:|-----------------------:|---------------------:|--------------------:|-----------------------:|---------------------:|------------:|-----------------------:|--------------------------:|------------------------:|-----------------------:|--------------------------:|------------------------:|
| NQ           | 36977 |          17   |         97   |      151.864     |         76.4838     |    30681 |               0.204 |                  0.218 |                 49.1 |               0.424 |                  0.427 |                 49.9 |        6296 |                  0.167 |                     0.183 |                    48.6 |                  0.363 |                     0.407 |                    48.1 |
| EURUSD       | 31341 |          80.9 |         71.8 |        0.0049472 |          0.00468421 |     5987 |               0.197 |                  0.194 |                 50   |               0.36  |                  0.362 |                 50.1 |       25354 |                  0.174 |                     0.185 |                    49.8 |                  0.364 |                     0.394 |                    49.5 |
| GOLD         | 29641 |          66.5 |         71.4 |       20.6703    |         13.0921     |     9923 |               0.189 |                  0.193 |                 50.2 |               0.355 |                  0.411 |                 47.8 |       19718 |                  0.177 |                     0.184 |                    49.8 |                  0.393 |                     0.415 |                    51   |
