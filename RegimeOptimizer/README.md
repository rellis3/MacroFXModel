# RegimeOptimizer — V1/V2/V4/V5/V6 Parameter Search

Bayesian parameter optimizer for the regime bots in `regime-backtest.html`. Finds the best combination of config parameters by running thousands of backtests using Optuna's TPE (Tree-structured Parzen Estimator) sampler — far more efficient than brute-force grid search.

Select which bot version to optimize with `--bot`:

| `--bot` | HMM | Regime timeframe | Notes |
|---|---|---|---|
| `v1` | 3-state (BULL/BEAR/RANGE), unit-variance Gaussian | M1 only | Simplest/oldest version. No RANGE_HOLD state machine. |
| `v2` | 4-state (BULL/BEAR/RANGE/CHOP) | M1 only | Adds BOCPD-proxy, slope and ADX terms to the score. More exit logic than V1. |
| `v4` (default) | 4-state | M1 (`--mtf 1`) or MTF (`--mtf 15/30/60/240`, this *is* "V5 mode") | Adds the RANGE_HOLD/TREND_HOLD state machine and MFE trailing/suppression. |
| `v5` | 4-state | MTF only — same code path as `v4` with `--mtf` > 1 | Alias for `v4` when you want the timeframe in the label/output explicit. |
| `v6` | 4-state | MTF only (defaults to 30m if `--mtf` not given) | Simplified exits vs V4/V5: just SL/breakeven, opposite-regime-flip, conf-floor, MFE-retrace, max-hold timeout. No RANGE_HOLD. |

See the "How V1/V2/V6 actually work" section near the bottom for a plain-English walkthrough of each bot's mechanics.

---

## How to run

```bash
cd RegimeOptimizer
pip install -r requirements.txt

# V4 mode — HMM on M1 bars (original)
python optimizer.py --pair EURUSD --from 2023-01-01 --to 2024-12-01 --trials 1000 --report

# V5 mode — HMM on 30m bars, entries on M1 (recommended starting point)
python optimizer.py --pair EURUSD --from 2023-01-01 --to 2024-12-01 --trials 1000 --jobs 4 --mtf 30 --spread 1.0 --report

# V5 mode — compare at different timeframes
python optimizer.py --pair EURUSD --from 2023-01-01 --to 2024-12-01 --trials 1000 --jobs 4 --mtf 15 --report
python optimizer.py --pair EURUSD --from 2023-01-01 --to 2024-12-01 --trials 1000 --jobs 4 --mtf 60 --report
python optimizer.py --pair EURUSD --from 2023-01-01 --to 2024-12-01 --trials 1000 --jobs 4 --mtf 240 --report

# V1 — simplest 3-state bot, M1 only
python optimizer.py --pair EURUSD --from 2023-01-01 --to 2024-12-01 --trials 1000 --bot v1 --report

# V2 — 4-state bot with richer exit logic, M1 only
python optimizer.py --pair EURUSD --from 2023-01-01 --to 2024-12-01 --trials 1000 --bot v2 --report

# V6 — simplified MTF bot (defaults to 30m regime if --mtf omitted)
python optimizer.py --pair EURUSD --from 2023-01-01 --to 2024-12-01 --trials 1000 --bot v6 --mtf 30 --report

# Generate report from a previous results file
python reporter.py results/EURUSD_20260607T120000.json
```

**`--bot` choices:** `v1`, `v2`, `v4` (default), `v5`, `v6` — see the table above  
**`--mtf` choices:** `1` (M1 mode), `15`, `30`, `60`, `240` (MTF modes in minutes) — ignored for `v1`/`v2` (M1 only), forced to ≥30 for `v6`  
**`--spread`:** Round-trip spread in pips — `1.0` for EUR/USD, `2.0` for Gold  
**`--jobs`:** Parallel Optuna workers — `4` is safe on most machines

**Note on data:** M1 candles are served from the Railway server (`macrofxmodel-production.up.railway.app`) which loads them from a static R2 parquet file. The data currently covers roughly 2022–late 2024. Use `--from` and `--to` to target this window. Fetched data is cached locally in `.cache/` for 24h so repeat runs are fast.

---

## What it does (step by step)

### 1. Fetch M1 candles
Downloads M1 bars for the pair from Railway in 14-day chunks. Cached as a pickle file so you don't re-download on repeat runs.

### 2. Pre-compute HMM signals (once)
Runs the bot's HMM (3-state for V1, 4-state BULL/BEAR/RANGE/CHOP for V2/V4/V5/V6) + BOCPD-proxy + composite-score second pass over the entire dataset. This is the slow part (~30–60s). Signals are computed **once** and sliced for each split — not recomputed per trial.

### 3. Walk-forward split
```
|──────── 60% TRAIN ────────|── 20% VAL ──|── 20% TEST ──|
```
- **Train**: The optimizer learns on this
- **Validate**: The objective score is primarily based on this (prevents in-sample overfit)
- **Test**: Completely blind — only evaluated for the final top-20 report, never seen during search

### 4. Optuna TPE search (1000 trials)
Each trial picks a config, runs the selected bot's `simulate_v1`/`simulate_v2`/`simulate_v4`/`simulate_v5`/`simulate_v6` on train + validate, and scores it:
```
objective = 0.7 × val_quality_score + 0.3 × train_quality_score
```

Trials are pruned (scored -1000) if:
- Fewer than 20 trades on train or validate
- Validate max drawdown > 30%
- val_sortino < 40% of train_sortino (overfit guard)

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

### What the parameters actually control (V4/V5)
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

### What the parameters actually control (V1)
| Parameter | What it does |
|---|---|
| `min_confidence` | Minimum HMM regime confidence to enter |
| `candle_hold` | Bars the entry signal must persist before taking the trade |
| `vol_z_max` | Block entries when volatility z-score is above this (too choppy) |
| `entry_decay_max` | Block entries when the regime "decay" score is already this high |
| `decay_exit` | Exit when regime decay score exceeds this threshold |
| `sl_atr_mult` | Stop loss = ATR × this multiplier |
| `range_exit_hold` | Debounce bars before a RANGE-state exit fires |
| `exit_on_range` | If true, exit whenever regime flips to RANGE (not just opposite BULL/BEAR) |
| `window_start/end` | Only trade within this UTC hour window — also forces a flat exit if a held trade drifts outside it |
| `post_exit_cooldown` | Bars to wait after an exit before a new entry is allowed |

### What the parameters actually control (V2)
Same idea as V4/V5 above (V2 shares most exit-parameter names), plus:
| Parameter | What it does |
|---|---|
| `require_rising_conf` | If true, only enter when HMM confidence is rising bar-over-bar |
| `exit_on_range` | If true, exit on a flip to RANGE/CHOP, not just an opposite BULL/BEAR flip |
| `range_exit_hold` | Debounce bars before a RANGE-state exit fires |
| `mfe_min_r` | MFE-retrace exit only arms once this R multiple has been reached |

Note: V2's entry also hard-gates on `bocpd < 55` — that's not tunable, it's fixed in the bot's code.

### What the parameters actually control (V6)
| Parameter | What it does |
|---|---|
| `entry_conf` | Minimum HMM regime confidence to enter |
| `entry_score_min` | Minimum composite score (0–100) to enter |
| `candle_hold` | MTF bars the entry signal must persist before taking the trade |
| `sl_atr_mult` | Stop loss = ATR × this multiplier |
| `conf_floor` | Emergency exit if confidence drops below this |
| `mfe_retrace_pct` | Exit if price retraces this % of the max favourable excursion (peak-price based) |
| `mfe_min_r` | MFE-retrace exit only arms once this R multiple has been reached |
| `max_hold_bars` | Force-exit after this many MTF bars regardless of regime |
| `window_start/end` | Only trade within this UTC hour window |
| `post_exit_cooldown` | MTF bars to wait after an exit before a new entry is allowed |

Note: V6 always moves the stop to breakeven once `mfe_r >= 1.0` — that's hardcoded, not tunable. V6 only exits on a strict opposite BULL/BEAR flip; RANGE/CHOP alone never exits a position (no RANGE_HOLD state machine).

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
3. Copy the values into the matching bot's config panel in `regime-backtest.html` and verify the backtest matches
4. If the HTML backtest confirms the result:
   - **V2** → apply to `RegimeV2/regime_bot_v2.py` → redeploy
   - **V4** → apply to `RegimeV4/regime_bot_v4.py` → redeploy
   - **V1 / V6** → there's currently no standalone deployed bot file for these — they only exist as in-browser simulators inside `regime-backtest.html`. Use the optimizer to compare them against V2/V4 before deciding whether either is worth deploying as a real bot.

---

## Running multiple pairs

Run separately, one at a time. Each pair gets its own results files:

```bash
python optimizer.py --pair EURUSD --from 2023-01-01 --to 2024-12-01 --trials 1000 --mtf 30 --report
python optimizer.py --pair XAUUSD --from 2023-01-01 --to 2024-12-01 --trials 1000 --mtf 30 --spread 2.0 --report
python optimizer.py --pair GBPUSD --from 2023-01-01 --to 2024-12-01 --trials 1000 --mtf 30 --report
```

Each pair may need different optimal params — the regime dynamics of Gold vs EUR/USD are very different.

---

## Tips

- **Start with 500 trials** to sanity-check the setup, then run 1000–2000 for a proper search
- **`--jobs 4`** uses 4 parallel Optuna workers — safe on most machines, faster but uses more RAM
- If the test Sharpe is much worse than val, try reducing `--to` by a month (the test period may contain a regime the model hasn't seen)
- The `.cache/` folder holds your downloaded data — delete it to force a fresh fetch
- The `.db` file can be opened with any SQLite browser to inspect all 1000 trials

---

## How V1/V2/V6 actually work

All four bots in `regime-backtest.html` (V1, V2, V4/V5, V6) start from the same idea: fit a Hidden Markov Model over a few rolling features (trend slope, volatility, ADX) to classify the market into a small number of regimes, then only trade in the direction of a confident regime and get out when that regime looks like it's ending. The versions differ in how sophisticated the regime model and exit logic are — they read like successive iterations as more failure modes were discovered.

### V1 — the original, simplest version
- **HMM:** 3 states only — BULL, BEAR, RANGE (no separate CHOP state). Emissions are unit-variance Gaussians (no learned/per-state variance), which makes it numerically simple but less adaptive to a pair's actual volatility profile.
- **Score:** `hmm_confidence × 0.55 + vol_confidence × 0.25 + session_mult × 100 × 0.20` — weighted almost entirely toward "how sure is the HMM" plus a session-liquidity adjustment.
- **Entry:** confident BULL/BEAR regime held for `candle_hold` bars, volatility not too extreme, regime "decay" not already too high.
- **Exit:** stop-loss, then a forced flat if the trade has drifted outside the `window_start/end` trading-hours window, then exit on regime flip (to RANGE if `exit_on_range`, or only on the opposite BULL/BEAR if not), then exit if the decay score crosses `decay_exit`.
- **What's missing vs later versions:** no BOCPD changepoint signal, no MFE trailing/breakeven, no slope-based exit, no composite "entry_score" gate (it's always 0 — entries are confidence-only).

### V2 — added a real composite score and more exit signals
- **HMM:** upgraded to the full 4-state model (BULL/BEAR/RANGE/CHOP) shared with V4/V5/V6, with per-state learned/default variances — more adaptive than V1's unit-variance assumption.
- **Score:** `hmm_conf×0.40 + vol_conf×0.15 + session×0.15 + bocpd_stability×0.15 + slope_conf×0.10 + adx_conf×0.05` — a much richer blend that also factors in changepoint stability (BOCPD), price slope direction, and raw ADX trend strength.
- **Entry:** everything V1 checks, plus `entry_score_min`, a hardcoded `bocpd < 55` gate (not tunable), and (optionally) a requirement that confidence be rising bar-over-bar (`require_rising_conf`).
- **Exit:** an ordered cascade — stop-loss, regime-flip/range-exit, confidence-floor or sudden confidence-drop, negative price slope held for N bars, BOCPD instability held for N bars, score dropping too low or too fast, MFE-retrace (giving back too much of the best favourable move), then decay. No window-based forced exit (the trading-hour window only gates new entries in V2, unlike V1).
- **This is the only one of the three with a real, currently deployed bot** — see `RegimeV2/regime_bot_v2.py`.

### V6 — same signal pipeline as V4/V5, deliberately simpler trade management
- **HMM/score:** identical to V4/V5 — it reuses the exact same MTF (multi-timeframe) signal pipeline (`compute_signals_v5`), so the regime detection itself is unchanged.
- **What's different:** V4/V5 added a whole RANGE_HOLD/TREND_HOLD state machine to ride out choppy RANGE/CHOP regimes without bailing immediately. V6 strips that back out — it looks like an experiment to see whether the added complexity of RANGE_HOLD was actually earning its keep, or whether a simpler exit set performs just as well (or better, with less overfitting risk).
- **Entry:** confidence + score gates, like V2/V4.
- **Exit:** stop-loss with a hardcoded breakeven move once `mfe_r >= 1.0`, exit only on a *strict opposite* BULL/BEAR flip (a RANGE/CHOP reading alone never closes the trade — there's no RANGE_HOLD logic to manage that case), confidence-floor, MFE-retrace, and a hard `max_hold_bars` timeout. Far fewer moving parts than V4/V5's exit cascade.

### Putting it together
The natural read of the version history: **V1** proved the basic regime-following idea works. **V2** made the regime model and exit logic much richer to fix V1's bluntness (no BOCPD awareness, no slope confirmation, fixed unit-variance HMM) — and it's the one that made it to production. **V4/V5** then tackled holding through choppy regimes properly (RANGE_HOLD) and added MTF aggregation for steadier signals. **V6** is a simplification experiment on top of V4/V5's MTF signal pipeline, testing whether you actually need the RANGE_HOLD machinery or whether simpler trade management is just as good once the regime signal itself is already smoothed by MTF. Run the optimizer across all of them on the same pair/date range and compare val/test Sharpe + drawdown to see which philosophy actually wins on real data.
