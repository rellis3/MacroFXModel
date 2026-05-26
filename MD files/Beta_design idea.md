# Beta-Focused Stochastic Control — Design Notes

## What Is a Beta-Focused Stochastic Control System?

**Stochastic control systems** are control theory frameworks where system dynamics include randomness. Rather than a deterministic model of how a system evolves, you have probabilistic transitions. The goal is to find an optimal *policy* (a decision rule) that maximises some objective despite that noise. Classic examples: Merton's portfolio problem, Kalman filtering, LQG (Linear-Quadratic-Gaussian) control.

**Beta focused** in a trading/finance context refers to market beta — systematic exposure to a risk factor (market, sector, macro regime). A "beta focused" control system makes beta the central *state variable* being controlled or targeted, rather than treating it as a side-effect of position sizing.

**Put together:** a beta-focused stochastic control system:
1. Models beta exposure as a stochastic process (it drifts, jumps, mean-reverts — it is not constant)
2. Defines an objective: e.g. minimise tracking error to a target beta, or maximise Sharpe subject to beta bounds
3. Derives an optimal *dynamic* policy — how to adjust positions at each step given current observed beta and uncertainty — via something like a Hamilton-Jacobi-Bellman equation or dynamic programming

---

## How Would a Model Be Built?

### 1. State Space — What Are You Tracking?

Define what variables describe the "state" of your system at any point in time. For a macro FX model this includes:

- **Current beta** to each risk factor (risk-on/off, USD strength, rates differential, etc.)
- **Regime indicator** — which macro environment you are in
- **Position vector** — your current exposure
- **Volatility estimate** — how noisy beta currently is

The key insight: beta itself must be treated as a *stochastic state variable*, not a static input. It drifts over time, especially across regime changes.

### 2. Dynamics Model — How Does Beta Evolve?

You need a model for how beta changes between periods. Common choices:

- **Ornstein-Uhlenbeck** — beta mean-reverts to some long-run value with noise. Simple, tractable
- **Regime-switching diffusion** — beta follows different dynamics in different regimes (regime detection is directly relevant here)
- **Jump-diffusion** — allows for sudden beta shifts at macro events (FOMC, NFP, etc.)

Regime transitions drive the jump component — this links directly to existing BOCPD and decay detection work.

### 3. Observation Model — What Do You Actually See?

True beta is never directly observable. You estimate it from returns, which introduces noise. This requires:

- A **filter** (Kalman filter is standard; particle filter if dynamics are nonlinear) giving a posterior estimate of true beta from noisy observations
- **Uncertainty quantification** — the control policy should be more conservative when beta estimate uncertainty is high

### 4. Objective Function — What Are You Optimising?

The most important design decision. Candidates:

- **Minimise variance of beta deviation** from a target — purely risk-focused
- **Maximise risk-adjusted return subject to beta bounds** — practical trading objective
- **Minimise tracking error to a target factor exposure profile** — if expressing a specific macro view

The objective must be formulated as something solvable — typically quadratic in the state/control variables, or approximated as such.

### 5. Control Variable — What Can You Actually Move?

Levers available in FX:

- Position size per instrument
- Which pairs to hold (selection)
- Hedge ratio (e.g. USDX futures against a basket)

The control variable needs a mechanical link to beta — a mapping from "if I hold X of EURUSD, what is my beta to risk-on?"

### 6. Constraints — What Limits the Control?

Where theory meets reality:

- **Transaction costs** — rebalancing has a cost, so the optimal policy does not trade at every step. The control problem becomes: *when is it worth paying the cost to rebalance?*
- **Position limits** — hard bounds on exposure
- **Liquidity** — you cannot always execute the theoretically optimal position
- **Execution lag** — you observe beta at time *t*, trade at *t+δ*, introducing tracking error

Transaction costs alone significantly change the shape of the optimal policy — instead of continuous control you typically get an **inaction band** (only rebalance when beta drifts far enough from target).

### 7. Solving the Control Problem

The mathematical machinery:

- **Hamilton-Jacobi-Bellman (HJB) equation** — the continuous-time PDE that describes the value function. Analytically solvable only in simple cases
- **Dynamic programming / backward induction** — discrete-time approximation, more tractable
- **Approximate dynamic programming / reinforcement learning** — when the state space is too large for exact DP

For a practical first build, discrete-time DP over a discretised state space (beta level × regime × position) is the most tractable starting point.

### 8. Practical Build Order

If building this incrementally:

1. Build a reliable **beta estimator** with uncertainty bounds (rolling regression → Kalman)
2. Build a **regime-conditional beta dynamics model** — how does beta behave in each regime?
3. Define a **target beta profile** per regime — what exposure is wanted in each state of the world?
4. Build a **rebalancing rule** that accounts for transaction costs — the inaction band
5. Later: formalise as a proper control problem with an HJB or DP solver

---

## Gap Analysis — What the Current Dashboard Has vs What Is Needed

### What You Already Have (That Is Relevant)

The system implicitly tracks many beta-adjacent things, just not framed that way:

| Existing Component | Beta-Control Relevance |
|---|---|
| DXY alignment | Binary USD beta (on/off, not quantified) |
| Yield spread T1/T2 | Proxy for rates-differential beta |
| Cross-pair consensus % | Proxy for how systematic vs idiosyncratic a move is |
| VIX bucketing | Proxy for risk-on/off beta environment |
| BOCPD + decay score | Partial detection of beta regime shifts |
| GARCH clustering | Dynamics model input — vol regime |
| BOCPD (regime_bot_v2) | Useful for detecting beta regime shifts |

The raw ingredients exist. What is missing is the explicit quantification layer on top of them.

---

### What Is Missing

#### 1. Explicit Beta Estimation Per Pair Per Factor

No rolling regression of each pair's returns against actual risk factors (DXY, 10Y-2Y yield spread, VIX). DXY alignment is currently binary — it says "agrees" or "doesn't agree." Needed:

```
EURUSD_return(t) = α + β_dxy·DXY_return(t) + β_rates·spread_change(t) + β_vix·VIX_change(t) + ε(t)
```

With a rolling window or Kalman filter updating β over time, giving a live β coefficient and its uncertainty for each pair against each factor.

#### 2. Beta Uncertainty / Confidence Interval

The Kalman filter exists but is used for 5m price mean-reversion, not parameter uncertainty. There are no posterior confidence intervals on beta estimates — meaning it is impossible to distinguish "beta is 0.6 with tight bounds" from "beta is 0.6 but could be anywhere from 0.1 to 1.1." That uncertainty is critical for the stochastic control framework — it drives conservative sizing when beta is poorly identified.

#### 3. Portfolio-Level Beta Aggregation

If holding EURUSD long + GBPUSD long simultaneously, what is the total DXY beta? Currently there is no aggregation of factor exposure across open positions. Each position is tracked individually, not the combined book's beta profile.

#### 4. Beta Conditioned on Regime

Does EURUSD's DXY beta change between BULL and BEAR regimes? Almost certainly yes — but this is not tracked. Regime-conditional beta estimates are needed:

- "In BULL regime: EURUSD β_dxy = −0.72 ± 0.08"
- "In RANGE regime: EURUSD β_dxy = −0.31 ± 0.19"

This is the direct link between existing regime detection and the control framework.

#### 5. Target Beta Profile Per Regime

There is no concept of what beta is *wanted* in each regime. Sizing multipliers (vol_mult × regime_confidence) adjust size but not toward a defined factor exposure target. Without a target, beta deviation cannot be computed, which means rebalancing cannot be triggered on beta grounds.

#### 6. Beta Drift Detection

The decay score tracks regime confidence collapsing. But there is no explicit tracking of whether beta to the primary factor is *drifting* over time — which is often a leading indicator of an upcoming regime transition, before confidence starts falling.

---

## Priority Build Order

| Priority | What | Why |
|---|---|---|
| 1 | Rolling factor regression (β per pair per factor) | Foundation — nothing else works without this |
| 2 | Kalman filter on β (not price) | Gives uncertainty bounds + smooth β estimate |
| 3 | Regime-conditional β table | Links existing regime detection to beta |
| 4 | Portfolio β aggregation | Lets you see combined book exposure |
| 5 | Target β profile + deviation tracking | Enables the control logic |
| 6 | Inaction band / rebalancing trigger | The actual stochastic control output |

Items 1 and 2 are pure analytics additions — no trading logic changes required. Items 3 and 4 are dashboard additions. Items 5 and 6 are where it becomes a control system.

The BOCPD, GARCH, and decay detector all slot naturally into the dynamics model once explicit beta estimates are available to run them on.

---

## What You Would Need to Build Each Missing Part

---

### Part 1 — Rolling Factor Regression (β per pair per factor)

**What it does:** Runs a multivariate OLS regression of each pair's returns against factor returns on a rolling window, producing live β coefficients.

**Data required:**
- OHLC returns for each traded pair at a consistent frequency (30m or daily recommended as starting point)
- Factor return series at the same frequency:
  - DXY: already available via MT5 or price feed
  - 10Y−2Y yield spread changes: already pulled from FRED
  - VIX changes: already pulled from FRED
- Minimum history: ~60 bars for a meaningful regression (more → lower variance, higher lag)

**Implementation:**
- New Python module: `bot/modules/beta_estimator.py`
- Rolling window OLS using `numpy` or `statsmodels` (both already likely available)
- Runs on the state refresh cycle (every 120s) alongside existing regime computation
- Output stored in KV: `beta:{pair}:{factor}` → coefficient value

**Output shape:**
```python
{
  "EURUSD": {
    "beta_dxy":   {"value": -0.71, "window": 60},
    "beta_rates": {"value":  0.34, "window": 60},
    "beta_vix":   {"value": -0.18, "window": 60},
    "r_squared":  0.61
  },
  ...
}
```

**Dependencies:** None beyond what already exists. This is the standalone foundation.

---

### Part 2 — Kalman Filter on β (uncertainty-aware beta)

**What it does:** Replaces or wraps the rolling OLS with a Kalman filter that treats β as a hidden state, producing a smooth posterior estimate and a variance (uncertainty) for each coefficient.

**Data required:** Same as Part 1 — pair returns and factor returns at matching frequency.

**Implementation:**
- Extend `beta_estimator.py` or create `bot/modules/beta_kalman.py`
- State vector: `[β_dxy, β_rates, β_vix]` per pair
- Observation: pair return at each bar
- Two tuning parameters:
  - **Q** (process noise): how fast beta is allowed to drift. Higher Q → more responsive, more noisy
  - **R** (observation noise): return variance not explained by factors (use rolling residual σ² from OLS as initialiser)
- Use `filterpy` library (lightweight, pip installable) or implement the 4-equation Kalman update directly with `numpy`
- Output: posterior mean β + posterior variance P (diagonal of covariance matrix) per factor

**Output shape:**
```python
{
  "EURUSD": {
    "beta_dxy":   {"mean": -0.71, "variance": 0.004, "uncertainty": "LOW"},
    "beta_rates": {"mean":  0.34, "variance": 0.031, "uncertainty": "HIGH"},
    "beta_vix":   {"mean": -0.18, "variance": 0.009, "uncertainty": "MEDIUM"}
  }
}
```

**Uncertainty label thresholds** (tunable):
- LOW: variance < 0.01
- MEDIUM: 0.01–0.05
- HIGH: > 0.05

**Dependencies:** Part 1 initialises Q and R. Can run standalone but is better calibrated after OLS pass.

---

### Part 3 — Regime-Conditional Beta Table

**What it does:** Segments historical β estimates by regime label, building a lookup table of expected β range per (pair, factor, regime). Answers: "what does EURUSD's DXY beta look like in BULL vs BEAR?"

**Data required:**
- Historical β time series from Part 1 or 2 (at least 3–6 months for meaningful regime segments)
- Historical regime labels at matching timestamps — already stored in logs or can be reconstructed from HMM V2 outputs
- Sufficient samples per regime: need at least ~30 observations per regime class to get reliable stats

**Implementation:**
- New script: `RegimeV2/beta_regime_table.py` — runs offline/periodically, not in the hot path
- For each (pair, factor): group β observations by regime → compute mean, std, percentiles
- Store result in KV: `beta_regime_table` → JSON blob
- Refresh: run weekly or after any major regime model retrain

**Output shape:**
```python
{
  "EURUSD": {
    "beta_dxy": {
      "BULL":  {"mean": -0.72, "std": 0.08, "n": 94},
      "BEAR":  {"mean": -0.65, "std": 0.12, "n": 61},
      "RANGE": {"mean": -0.31, "std": 0.19, "n": 78},
      "CHOP":  {"mean": -0.10, "std": 0.24, "n": 43}
    }
  }
}
```

**Dependencies:** Requires Part 1 or 2 to have run long enough to accumulate historical β series. Historical regime labels from existing HMM outputs.

---

### Part 4 — Portfolio-Level Beta Aggregation

**What it does:** At any moment, sums factor beta across all open positions weighted by position size, giving total book exposure to each factor.

**Data required:**
- Current open positions: pair, direction (long/short), lot size — already available via MT5 connector in `bot/main.py`
- Current β estimates per pair from Part 1 or 2 — from KV
- Pip value per lot per pair — already computed for sizing

**Implementation:**
- New function in `bot/position_manager.py` or a new `bot/modules/portfolio_beta.py`
- Runs every price tick (3s cycle) alongside existing position management
- Formula:

```python
portfolio_beta[factor] = sum(
    position_direction * lot_size * beta[pair][factor]
    for each open position
)
# direction: +1 for long, -1 for short
```

- Output pushed to KV: `portfolio_beta` → dict of factor exposures

**Output shape:**
```python
{
  "beta_dxy":   -1.34,   # net short USD beta (e.g. 2 long EUR positions)
  "beta_rates":  0.67,
  "beta_vix":   -0.29,
  "position_count": 2,
  "timestamp": 1234567890
}
```

**Dashboard addition:** New panel showing total book beta per factor as a bar chart, updated each tick.

**Dependencies:** Requires Part 1 or 2 for β estimates. MT5 position data already available.

---

### Part 5 — Target Beta Profile + Deviation Tracking

**What it does:** Defines what factor exposure is *wanted* in each regime, then computes how far the current portfolio is from that target.

**Data required:**
- Regime-conditional β table from Part 3 (what beta looks like historically per regime)
- Current portfolio β from Part 4
- Current active regime (already available from HMM V2)
- Target β config — set manually based on the regime-conditional table and macro view

**Implementation:**
- New config section in `bot-config.html` or a JSON config file: `beta_targets.json`
- Target profile is a design decision — example starting point based on Part 3 table means:

```json
{
  "BULL":  {"beta_dxy": -0.65, "beta_rates":  0.40, "beta_vix": -0.20},
  "BEAR":  {"beta_dxy":  0.55, "beta_rates": -0.35, "beta_vix":  0.30},
  "RANGE": {"beta_dxy":  0.00, "beta_rates":  0.00, "beta_vix":  0.00},
  "CHOP":  {"beta_dxy":  0.00, "beta_rates":  0.00, "beta_vix":  0.00}
}
```

- Deviation computed each tick:

```python
deviation[factor] = portfolio_beta[factor] - target_beta[current_regime][factor]
```

- Output pushed to KV: `beta_deviation` → dict of deviations per factor + overall alignment score

**Output shape:**
```python
{
  "regime": "BULL",
  "deviations": {
    "beta_dxy":   {"current": -1.34, "target": -0.65, "deviation": -0.69, "status": "OVEREXPOSED"},
    "beta_rates": {"current":  0.67, "target":  0.40, "deviation":  0.27, "status": "SLIGHT_OVER"},
    "beta_vix":   {"current": -0.29, "target": -0.20, "deviation": -0.09, "status": "ON_TARGET"}
  },
  "overall_alignment": 0.61
}
```

**Dashboard addition:** Traffic-light panel — green (on target), amber (slight deviation), red (overexposed). Per factor, per regime.

**Dependencies:** Parts 3 and 4 required. Target values are manually set initially, can be optimised later.

---

### Part 6 — Inaction Band / Rebalancing Trigger

**What it does:** Given current beta deviation, decides whether the deviation is large enough to warrant rebalancing — factoring in transaction costs and beta uncertainty. This is the actual control output.

**Data required:**
- Beta deviation per factor from Part 5
- Beta uncertainty from Part 2 (Kalman variance) — wide uncertainty → wider inaction band
- Transaction cost estimate per pair: spread + slippage in pips (already tracked, used for entry sizing)
- Expected return impact of rebalancing: position size × pip value × estimated mean reversion of β

**Implementation:**
- New function in `bot/modules/beta_rebalancer.py`
- Inaction band width per factor:

```python
band_width = base_band + uncertainty_scale * beta_variance[factor]
# base_band: e.g. 0.20 (tunable)
# uncertainty_scale: e.g. 2.0 (widen band when beta is poorly identified)
```

- Trigger logic:

```python
if abs(deviation[factor]) > band_width[factor]:
    # emit rebalancing signal
    signal = "REDUCE" if deviation > 0 else "INCREASE"
    # translate to: which pair to size down/up, by how much
```

- Rebalancing is a *sizing suggestion*, not a forced close — feeds into existing position manager as a size override recommendation

**Output shape:**
```python
{
  "rebalance_needed": True,
  "factor": "beta_dxy",
  "deviation": -0.69,
  "band": 0.30,
  "action": "REDUCE_LONG_USD_EXPOSURE",
  "suggested_pairs": ["EURUSD: reduce by 30%", "GBPUSD: reduce by 20%"],
  "urgency": "MEDIUM"
}
```

**Dashboard addition:** Alert panel — "Beta rebalancing suggested: reduce DXY exposure. Current: −1.34 vs target: −0.65." With override button to dismiss.

**Telegram alert:** Rebalancing signals above HIGH urgency threshold sent via existing alert system.

**Dependencies:** All previous parts. This is the final integration layer.

---

## Infrastructure Summary

| Component | New Files | Libraries Needed | Data Sources |
|---|---|---|---|
| Part 1 — Rolling OLS | `bot/modules/beta_estimator.py` | `numpy`, `statsmodels` | MT5 OHLC, FRED (already connected) |
| Part 2 — Kalman on β | extend above or `beta_kalman.py` | `filterpy` or `numpy` only | Same as Part 1 |
| Part 3 — Regime table | `RegimeV2/beta_regime_table.py` | `pandas`, `numpy` | Historical logs + HMM outputs |
| Part 4 — Portfolio β | extend `position_manager.py` | None new | MT5 positions + KV beta |
| Part 5 — Deviation tracking | `bot/modules/beta_deviation.py` | None new | KV (Parts 3 + 4 outputs) |
| Part 6 — Rebalancing trigger | `bot/modules/beta_rebalancer.py` | None new | KV (Part 5 output) |
| Dashboard panels | additions to `index.html` / new JS | None new | KV reads |

**New KV keys required:**
- `beta:{pair}` — rolling β estimates per pair (Part 1/2)
- `beta_regime_table` — regime-conditional β lookup (Part 3)
- `portfolio_beta` — aggregated book exposure (Part 4)
- `beta_deviation` — current vs target per factor (Part 5)
- `beta_rebalance` — latest rebalancing signal (Part 6)

**No changes required to:** MT5 connector, trade execution logic, existing module pipeline, existing KV structure (new keys only), Railway deployment config.

---

## Reference Reading

- Merton (1969) — canonical starting point for stochastic portfolio control
- Hamilton-Jacobi-Bellman equation — continuous-time PDE for the value function
- Ornstein-Uhlenbeck process — mean-reverting stochastic process for beta dynamics
- Kalman filter — optimal linear estimator under Gaussian noise (parameter estimation variant)
- Bayesian Online Changepoint Detection (BOCPD) — already implemented, relevant to jump detection
