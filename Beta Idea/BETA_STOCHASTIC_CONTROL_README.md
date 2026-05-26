# Beta Stochastic Control System — Operator README

## What This Is

The beta stochastic control system treats each currency pair's factor sensitivity (its "beta") as a stochastic state variable that drifts over time. Rather than assuming a fixed relationship between your positions and macro factors like DXY, rates, or risk-off, the system continuously estimates how much beta your portfolio is actually carrying, compares it to a regime-conditional target, and alerts you when you are significantly overexposed.

The theoretical foundation is Hamilton-Jacobi-Bellman (HJB) optimal control: the system does **not** trade for you. It defines an inaction band — a range where deviation is tolerable — and only triggers when you have drifted far enough outside that band to warrant attention. Within the band, transaction costs outweigh the benefit of tighter control; outside it, rebalancing has positive expected value.

---

## The Six Parts

| Part | Module | Role |
|---|---|---|
| 1 | `bot/modules/beta_estimator.py` | Rolling OLS beta estimation (60-bar H4 window) |
| 2 | `bot/modules/beta_estimator.py` | Kalman filter uncertainty quantification |
| 3 | `RegimeV2/beta_regime_table.py` | Offline regime-conditional beta table |
| 4 | `bot/modules/portfolio_beta.py` | Portfolio-level beta aggregation |
| 5 | `bot/modules/beta_deviation.py` | Target beta deviation tracking |
| 6 | `bot/modules/beta_rebalancer.py` | Inaction-band rebalancing trigger |

---

## Factor Proxies

The system derives macro factor returns entirely from MT5 bar data — no external APIs, FRED keys, or yfinance feeds are required.

| Factor | Proxy Pair | Multiplier | Rationale |
|---|---|---|---|
| DXY (dollar index) | EUR/USD | −1.2 | EUR is ~57% of the DXY basket; inverse relationship |
| Rates (rate differential) | USD/JPY | +1.0 | USD/JPY tracks US-Japan rate spread directly |
| VIX (risk-off) | USD/CHF | −1.0 | CHF is a safe-haven currency; USD/CHF inverse risk-off |

These are approximations, not exact factor returns. Expect R² in the 0.3–0.6 range for most pairs; higher is better but not required for the control logic to function.

---

## Default Target Betas

These are the regime-conditional targets the system works toward. They represent the desired portfolio sensitivity to each factor in each market regime.

| Regime | β(DXY) | β(Rates) | β(VIX) |
|---|---|---|---|
| BULL | −0.65 | +0.40 | −0.20 |
| BEAR | +0.55 | −0.35 | +0.30 |
| RANGE | 0.00 | 0.00 | 0.00 |
| CHOP | 0.00 | 0.00 | 0.00 |

**Interpretation:**
- In a BULL regime, the system expects you to be short DXY exposure (risk-on, weaker dollar), moderately long rates exposure, and slightly short risk-off. This reflects the typical macro configuration when trend-following long setups dominate.
- In a BEAR regime, targets flip — you want positive DXY beta (flight to safety), negative rates beta (rates fall in risk-off), and positive VIX beta.
- RANGE and CHOP have zero targets, reflecting that factor exposures should be minimal when there is no directional regime.

These defaults can be overridden via the **β Beta Targets** tab in `bot-config.html`, which saves custom values to KV. The offline regime table script (`RegimeV2/beta_regime_table.py`) can also derive and push data-driven targets once you have 30+ days of history.

---

## Inaction Band

The rebalancing trigger uses a dynamic inaction band:

```
band = BASE_BAND + UNCERTAINTY_SCALE × avg_Kalman_variance
```

With defaults:
- `BASE_BAND = 0.20` — minimum deviation needed to trigger a rebalance signal
- `UNCERTAINTY_SCALE = 2.0` — how much the band widens per unit of Kalman variance

**What this means in practice:** If the Kalman filter is uncertain about the current beta (high variance, which happens early in the bot's life or after a volatility spike), the band widens and you get fewer alerts. When the filter has converged on a confident estimate, the band tightens and you see more precise signals. This prevents false alarms based on noisy estimates.

Urgency levels:
- `|deviation| / band ≥ 2.0` → **HIGH** — Telegram alert sent
- `|deviation| / band ≥ 1.4` → **MEDIUM** — dashboard alert only
- Below 1.4 → no signal

---

## Deviation Status Labels

| Label | Meaning |
|---|---|
| `ON_TARGET` | Deviation ≤ 0.15 — within target, no action needed |
| `SLIGHT_OVER` | Deviation 0.15–0.30 — monitor, approaching the band edge |
| `OVEREXPOSED` | Deviation > 0.30 — band may be breached, check the rebalancer |

---

## Timing: What Runs When

The beta system runs on two clocks inside `bot/main.py`:

### Slow path (every 120 seconds, alongside state refresh)
1. Fetches 80 H4 bars per enabled pair from MT5
2. Runs rolling OLS regression for each (pair, factor) combination
3. Advances the Kalman filter by ~5 incremental bars
4. Pushes updated `beta_estimates` blob to KV
5. Appends a JSON line to `bot/data/beta_history.jsonl`
6. Every 5 minutes: re-fetches custom beta targets from KV (`beta_targets` key)
7. Once per week: auto-spawns `RegimeV2/beta_regime_table.py` to rebuild the regime-conditional table from accumulated history

### Fast path (every 30 seconds, alongside position management)
1. Reads cached beta estimates (computed in slow path, no new MT5 bar fetch)
2. Queries open positions via `mt5.positions_get()` filtered by `magic=20260001`
3. Aggregates `Σ direction × lots × beta` per factor → portfolio beta
4. Computes deviation from regime targets
5. Evaluates rebalancing trigger
6. Pushes `portfolio_beta`, `beta_deviation`, `beta_rebalance` to KV
7. Sends Telegram alert if urgency is HIGH

---

## Cold Start Behaviour

The system does not produce useful estimates immediately:

- **Minimum viable**: 20 H4 bars = ~80 hours (just over 3 days) before any OLS estimate is returned
- **Full OLS window**: 60 H4 bars = ~240 hours (~10 days) for stable regression
- **Kalman convergence**: typically 20–40 incremental updates; filter uncertainty (variance) will be high and the inaction band will be wide for the first 1–2 weeks
- **Regime table**: meaningful statistics require ≥30 samples per regime. At one record per 120s cycle this takes weeks of runtime in a given regime. Run the offline script only after you have substantial history.

During the cold start period, `cached_beta_estimates` will be empty and the portfolio tracking fast path will silently skip. No errors are logged for this; it is expected behaviour.

---

## What You Will See

### Dashboard (index.html — β Beta button in topbar)

The β Beta panel loads four KV keys on open: `beta_estimates`, `portfolio_beta`, `beta_deviation`, `beta_rebalance`.

- **Per-pair estimates table**: OLS beta, Kalman posterior mean, Kalman variance, uncertainty label (LOW / MEDIUM / HIGH), and R²
- **Portfolio beta gauges**: bar charts showing current portfolio β(DXY), β(Rates), β(VIX) relative to the regime target
- **Deviation traffic lights**: ON_TARGET / SLIGHT_OVER / OVEREXPOSED per factor with the current deviation value
- **Rebalance alert box**: appears when a signal is present, shows which factor is breached, urgency level, and which pairs to consider reducing. Has a **Dismiss** button that suppresses the alert in localStorage until the next distinct signal.

### Telegram Alerts

HIGH urgency signals are posted to the same Telegram bot and chat used by the Level alert system (shared `tg_config` KV key). Message format is HTML and includes: factor name, deviation amount, urgency, suggested pairs to reduce, and a timestamp. Alerts fire at most once per rebalancing trigger cycle (30 seconds minimum interval).

### Logs

The bot logs to stdout. Beta-related log lines are prefixed:

```
[beta] estimated X pairs
[beta] portfolio beta pushed
[beta] rebalance signal: HIGH on beta_dxy (dev=0.38, band=0.21)
[beta] targets refreshed from KV
[beta] spawning weekly regime table rebuild
```

If MT5 is not connected or the bot is in paper mode, beta estimation is silently skipped and none of the above lines appear.

---

## Impact on the Bot

### What changed in `bot/main.py`

The beta system is **additive only**. No existing logic was modified:

- Four new module imports at the top
- One new helper: `_dominant_regime()` — derives a single portfolio-level regime label from the mode of per-pair HMM regimes
- One new helper: `_run_beta_estimation()` — called once per slow-path tick
- One new helper: `_run_beta_portfolio_tracking()` — called once per fast-path tick (throttled to 30s)
- One new helper: `_send_beta_rebalance_telegram()` — called inside the tracking helper on HIGH signals
- One new helper: `_append_beta_history()` — writes to `bot/data/beta_history.jsonl`
- New loop state variables: `beta_estimator`, `cached_beta_estimates`, `cached_beta_targets`, `last_beta_push`, `last_beta_targets_fetch`, `last_regime_table_build`

### What was NOT changed

- Entry logic, exit logic, position sizing, risk controls — untouched
- HMM regime pipeline — untouched
- All existing KV keys and dashboard panels — untouched
- RegimeV2 bot — not modified at all; beta system only hooks into the V1 bot (`bot/main.py`)

### Order of execution per tick

Slow path order (unchanged structure, new items in bold):
1. Fetch state from KV
2. Run HMM regime classification
3. **Run beta estimation → push `beta_estimates`**
4. **Append to beta_history.jsonl**
5. **Conditionally refresh targets / rebuild regime table**
6. Existing pair-level analysis continues as before

Fast path order (unchanged structure, new item in bold):
1. Manage positions (existing)
2. **Portfolio beta tracking → push portfolio_beta, beta_deviation, beta_rebalance**
3. Existing fast-path items continue as before

---

## Config Changes Required?

**None are required.** The system runs entirely on hardcoded defaults from day one:

| Setting | Default | Where |
|---|---|---|
| OLS window | 60 H4 bars | `beta_estimator.py` |
| Minimum window | 20 H4 bars | `beta_estimator.py` |
| Kalman process noise Q | 1e-4 | `beta_estimator.py` |
| Base inaction band | 0.20 | `beta_rebalancer.py` |
| Uncertainty scale | 2.0 | `beta_rebalancer.py` |
| Bull target β(DXY) | −0.65 | `beta_deviation.py` |
| Bull target β(Rates) | +0.40 | `beta_deviation.py` |
| Bull target β(VIX) | −0.20 | `beta_deviation.py` |
| Bear target β(DXY) | +0.55 | `beta_deviation.py` |
| Bear target β(Rates) | −0.35 | `beta_deviation.py` |
| Bear target β(VIX) | +0.30 | `beta_deviation.py` |
| Portfolio beta push interval | 30s | `main.py` |
| Targets re-fetch interval | 5 min | `main.py` |
| Regime table rebuild interval | 7 days | `main.py` |

**Optional tuning** (no restart required, takes effect within 5 minutes):
- Open `bot-config.html` → **β Beta Targets** tab
- Edit any regime/factor target value and click Save
- The bot re-fetches from KV every 5 minutes and picks up the new values

---

## Prerequisites

```bash
# On the MT5 machine running bot/main.py
pip install -r bot/requirements.txt
# numpy>=1.24.0 was added — this is the only new dependency
```

The system requires:
- MT5 terminal connected in **live mode** (not paper) for bar data and position queries
- Cloudflare Worker deployed with the updated `_worker.js` (already includes `beta_` prefix in KV allowlist)
- No additional API keys, no external data sources

---

## Offline Regime Table Script

Once you have several weeks of `bot/data/beta_history.jsonl` data:

```bash
# Inspect what the table looks like without writing anything
python RegimeV2/beta_regime_table.py --dry-run --url https://your-worker.workers.dev

# Rebuild and push table only (not targets)
python RegimeV2/beta_regime_table.py --url https://your-worker.workers.dev

# Rebuild table AND update beta_targets in KV from data-derived means
python RegimeV2/beta_regime_table.py --update-targets --url https://your-worker.workers.dev

# Require at least 50 samples per regime before including in table
python RegimeV2/beta_regime_table.py --min-samples 50 --url https://your-worker.workers.dev
```

The bot also runs this automatically once per week in the background. The manual CLI is for when you want to force a rebuild or inspect results before committing them to KV.

---

## What This System Does NOT Do

- Does **not** place, modify, or close trades automatically
- Does **not** change stop-loss or take-profit levels
- Does **not** affect position sizing or risk parameters
- Does **not** veto entry signals
- Does **not** touch the RegimeV2 bot

It is a **monitoring and alerting** layer. All rebalancing decisions remain with the operator. The system tells you what to consider reducing and why; acting on that recommendation is entirely manual.
