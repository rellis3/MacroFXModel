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

## Reference Reading

- Merton (1969) — canonical starting point for stochastic portfolio control
- Hamilton-Jacobi-Bellman equation — continuous-time PDE for the value function
- Ornstein-Uhlenbeck process — mean-reverting stochastic process for beta dynamics
- Kalman filter — optimal linear estimator under Gaussian noise (parameter estimation variant)
- Bayesian Online Changepoint Detection (BOCPD) — already implemented, relevant to jump detection
