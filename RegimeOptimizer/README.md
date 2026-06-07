# RegimeOptimizer — V4 Parameter Search

Bayesian parameter optimizer for the V4 Regime Bot. Finds the best combination of 23 config parameters by running thousands of backtests using Optuna's TPE (Tree-structured Parzen Estimator) sampler — far more efficient than brute-force grid search.

---

## How to run

```bash
cd RegimeOptimizer
pip install -r requirements.txt

# Basic run (target known-good data range)
python optimizer.py --pair EURUSD --from 2023-01-01 --to 2024-12-01 --trials 1000

# With HTML report auto-generated at the end
python optimizer.py --pair EURUSD --from 2023-01-01 --to 2024-12-01 --trials 1000 --jobs 4 --report

# Generate report from a previous results file
python reporter.py results/EURUSD_20260607T120000.json
```

**Note on data:** M1 candles are served from the Railway server (`macrofxmodel-production.up.railway.app`) which loads them from a static R2 parquet file. The data currently covers roughly 2022–late 2024. Use `--from` and `--to` to target this window. Fetched data is cached locally in `.cache/` for 24h so repeat runs are fast.

---

## What it does (step by step)

### 1. Fetch M1 candles
Downloads M1 bars for the pair from Railway in 14-day chunks. Cached as a pickle file so you don't re-download on repeat runs.

### 2. Pre-compute HMM signals (once)
Runs the full 4-state HMM (BULL/BEAR/RANGE/CHOP) + BOCPD + V4 score second-pass over the entire dataset. This is the slow part (~30–60s). Signals are computed **once** and sliced for each split — not recomputed per trial.

### 3. Walk-forward split
```
|──────── 60% TRAIN ────────|── 20% VAL ──|── 20% TEST ──|
```
- **Train**: The optimizer learns on this
- **Validate**: The objective score is primarily based on this (prevents in-sample overfit)
- **Test**: Completely blind — only evaluated for the final top-20 report, never seen during search

### 4. Optuna TPE search (1000 trials)
Each trial picks a config, runs `simulate_v4()` on train + validate, and scores it:
```
objective = 0.7 × val_sharpe + 0.3 × train_sharpe
```

Trials are pruned (scored -1000) if:
- Fewer than 20 trades on train or validate
- Validate max drawdown > 30%
- val_sharpe < 40% of train_sharpe (overfit guard)

TPE learns which parameter regions produce good scores and concentrates search there. 1000 trials explores the space well; 2000+ gives marginal improvement.

### 5. Top-20 evaluation on blind test
The 20 best trials by objective are re-run on the blind test split. This is the honest, forward-looking performance estimate.

---

## What to look for in the results

### Green flags (good config)
- **Val Sharpe ≥ 0.8** and **Test Sharpe ≥ 0.6** — performance holds out of sample
- Val Sharpe and Test Sharpe within ~30% of each other — not overfit
- **Win rate 50–65%** — directional edge without needing heroic RR
- **Max DD < 15%** on val and test
- **Profit factor > 1.4**
- Test results *better* than val → regime bot benefiting from data it never saw

### Red flags (overfit or broken config)
- Train Sharpe >> Val Sharpe (e.g. 2.0 vs 0.3) — severely overfit
- Val Sharpe positive but Test Sharpe negative — regime changed and config doesn't generalise
- Fewer than 30 trades on test — not enough signal, Sharpe is noise
- Max DD > 25% — position sizing will be painful live

### What the parameters actually control
| Parameter | What it does |
|---|---|
| `entry_conf` | Minimum HMM regime confidence to enter |
| `entry_score_min` | Minimum V4 composite score (0–100) to enter |
| `candle_hold` | Bars the entry signal must persist before taking the trade |
| `sl_atr_mult` | Stop loss = ATR × this multiplier |
| `max_range_hold_bars` | How long to hold through RANGE/CHOP before giving up |
| `mfe_trail_r` | Move SL to breakeven once price hits this R multiple |
| `mfe_suppress_r` | Suppress slope/conf-drop exits once this R is in the bag |
| `bocpd_thresh` / `bocpd_exit_bars` | Exit when BOCPD change-point probability stays high for N bars |
| `conf_floor` | Emergency exit if confidence drops below this |
| `drop_thresh` | Exit on sudden confidence drop of this many % points |
| `slope_thresh` / `slope_bars` | Exit if price slope goes negative for N bars |
| `mfe_retrace_pct` | Exit if price retraces this % of the max favourable excursion |
| `decay_exit` | Exit when regime decay score exceeds this threshold |
| `window_start/end` | Only trade within this UTC hour window |

### Param importance tab
The HTML report shows which parameters had the most impact on the objective score across all trials (Fanova analysis from Optuna). High-importance params are worth tuning carefully; low-importance ones can be left at default.

---

## Output files

All results land in `results/`:

| File | Contents |
|---|---|
| `EURUSD_<ts>.json` | Top-20 configs with train/val/test analytics for each |
| `EURUSD_<ts>.db` | Full Optuna SQLite study (all 1000 trials + param importances) |
| `EURUSD_<ts>.html` | Standalone dark-themed HTML report (open in browser) |

---

## Applying the best config

1. Open the HTML report → **Best Config** tab
2. The diff vs defaults panel shows which params changed and by how much
3. Copy the values into the **V4 config panel** in `regime-backtest.html` and verify the backtest matches
4. If the HTML backtest confirms the result, apply to `RegimeV4/regime_bot_v4.py` → redeploy to Railway

---

## Running multiple pairs

Run separately, one at a time. Each pair gets its own results files:

```bash
python optimizer.py --pair EURUSD --from 2023-01-01 --to 2024-12-01 --trials 1000 --report
python optimizer.py --pair XAUUSD --from 2023-01-01 --to 2024-12-01 --trials 1000 --report
python optimizer.py --pair GBPUSD --from 2023-01-01 --to 2024-12-01 --trials 1000 --report
```

Each pair may need different optimal params — the regime dynamics of Gold vs EUR/USD are very different.

---

## Tips

- **Start with 500 trials** to sanity-check the setup, then run 1000–2000 for a proper search
- **`--jobs 4`** uses 4 parallel Optuna workers — safe on most machines, faster but uses more RAM
- If the test Sharpe is much worse than val, try reducing `--to` by a month (the test period may contain a regime the model hasn't seen)
- The `.cache/` folder holds your downloaded data — delete it to force a fresh fetch
- The `.db` file can be opened with any SQLite browser to inspect all 1000 trials
