# Install dependencies (first time only)

pip install numpy pandas boto3 statsmodels pyarrow

# Basic run — 2024-01-01 to 2026-06-01, default universe, default params

python portfolioBacktest/portfolio_backtest.py

# Custom date range

python portfolioBacktest/portfolio_backtest.py --from 2023-01-01 --to 2026-01-01

# Loosen cointegration filter (use if zero pairs pass at 0.05)

python portfolioBacktest/portfolio_backtest.py --coint-pval 0.10

# Stricter entry signal, longer time stop

python portfolioBacktest/portfolio_backtest.py --entry-z 2.5 --max-hold-bars 72

# Custom pair universe

python portfolioBacktest/portfolio_backtest.py --pairs eurusd gbpusd usdjpy usdchf eurgbp gold

# Re-download M1 data from R2 (refreshes local cache)

python portfolioBacktest/portfolio_backtest.py --force-dl

# Full parameter override example

python portfolioBacktest/portfolio_backtest.py \
 --from 2024-01-01 \
 --to 2026-06-01 \
 --entry-z 2.5 \
 --exit-z 0.5 \
 --stop-z 3.5 \
 --min-score 0.15 \
 --coint-pval 0.05 \
 --max-hold-bars 48 \
 --max-pos 5 \
 --corr-win 200 \
 --output portfolioBacktest/results.json

# All available flags

python portfolioBacktest/portfolio_backtest.py --help
Output files (written to portfolioBacktest/ by default):

results.html — opens automatically in browser
results.json — full trade log + analytics
Parameter reference:

Flag Default Description
--from 2024-01-01 Backtest start date
--to 2026-06-01 Backtest end date
--pairs 18-pair universe Space-separated list of pairs
--entry-z 2.0 Z-score threshold to enter
--exit-z 0.5 Z-score target to exit (profit)
--stop-z 3.5 Z-score level to stop (loss)
--min-score 0.1 Minimum hedge score to enter
--coint-pval 0.05 Engle-Granger p-value cutoff
--max-hold-bars 48 H1 bars before time stop (~2 days)
--max-pos 5 Max concurrent positions
--corr-win 200 Rolling correlation window (H1 bars)
--warmup 300 Bars before trading starts
--force-dl off Re-download M1 data from R2
--output results.json Output file path
