"""
Beta Estimator — Parts 1 & 2 of the beta-focused stochastic control system.

Part 1: Rolling window OLS regression of each pair's returns against factor returns.
  Factor proxies (avoids external data dependency — all sourced from MT5 bars):
    beta_dxy   — DXY exposure: pair vs inverted EUR/USD returns × 1.2
    beta_rates — Rates differential: pair vs USD/JPY returns
    beta_vix   — Risk-off proxy: pair vs inverted USD/CHF returns

Part 2: Kalman filter wrapping rolling OLS to produce smooth posterior beta
  estimates with uncertainty bounds (variance per factor).

The Kalman filter treats beta as a hidden state that drifts over time (process
noise Q). At each update it observes pair_return = beta × factor_return + noise.
This produces a posterior mean + variance for each (pair, factor) combination.
Runs every 120s alongside the state refresh cycle in main.py.
"""

import json
import logging
import time
import urllib.request

import numpy as np

log = logging.getLogger(__name__)

# ── Tuning parameters ─────────────────────────────────────────────────────────
WINDOW     = 60       # rolling OLS window (bars)
MIN_WINDOW = 20       # minimum bars for a valid regression
BAR_COUNT  = 80       # bars to fetch per symbol (H4 default)

Q_PROCESS     = 1e-4  # Kalman process noise — how fast beta can drift
R_OBS_DEFAULT = 0.1   # Kalman observation noise fallback

# Uncertainty label thresholds (posterior variance)
VAR_LOW    = 0.01
VAR_MEDIUM = 0.05

# Factor proxy definitions — (MT5 symbol without slash, multiplier)
# EUR/USD inverted and scaled gives a DXY proxy (EUR is ~57% of DXY weight)
# USD/JPY tracks US-Japan rates differential
# USD/CHF inverted: CHF strengthens on risk-off (VIX-like signal)
FACTOR_PROXIES = {
    'beta_dxy':   ('EURUSD', -1.2),
    'beta_rates': ('USDJPY',  1.0),
    'beta_vix':   ('USDCHF', -1.0),
}

# Factor proxy symbols (must always be fetched even if not enabled pairs)
FACTOR_SYMBOLS = {v[0] for v in FACTOR_PROXIES.values()}


# ── Return calculation ────────────────────────────────────────────────────────

def _log_returns(bars) -> np.ndarray:
    """Extract close-to-close log returns from an MT5 structured bar array."""
    try:
        closes = np.asarray(bars['close'], dtype=float)
    except (ValueError, TypeError, KeyError):
        # Fallback: plain 2d array, close is column 4
        closes = np.asarray([float(b[4]) for b in bars], dtype=float)
    if len(closes) < 2:
        return np.array([])
    return np.diff(np.log(np.maximum(closes, 1e-10)))


# ── OLS regression ────────────────────────────────────────────────────────────

def _ols_beta(pair_rets: np.ndarray, factor_rets: np.ndarray) -> tuple[float, float]:
    """
    OLS regression y = alpha + beta * x over the last WINDOW bars.
    Returns (beta, r_squared). Returns (0.0, 0.0) on insufficient data.
    """
    n = min(WINDOW, len(pair_rets), len(factor_rets))
    if n < MIN_WINDOW:
        return 0.0, 0.0

    y = pair_rets[-n:]
    x = factor_rets[-n:]

    mask = np.isfinite(y) & np.isfinite(x)
    y, x = y[mask], x[mask]
    if len(y) < MIN_WINDOW:
        return 0.0, 0.0

    X = np.column_stack([np.ones_like(x), x])
    try:
        coeffs, _, _, _ = np.linalg.lstsq(X, y, rcond=None)
    except np.linalg.LinAlgError:
        return 0.0, 0.0

    alpha, beta = float(coeffs[0]), float(coeffs[1])
    y_pred = alpha + beta * x
    ss_res = float(np.sum((y - y_pred) ** 2))
    ss_tot = float(np.sum((y - float(np.mean(y))) ** 2))
    r_sq = max(0.0, min(1.0, 1.0 - ss_res / ss_tot)) if ss_tot > 1e-12 else 0.0
    return beta, r_sq


# ── Kalman filter ─────────────────────────────────────────────────────────────

class KalmanBeta:
    """
    Scalar Kalman filter for a time-varying beta coefficient.

    State equation:    beta_t = beta_{t-1} + w,   w ~ N(0, Q)
    Observation eq:    ret_t  = beta_t * factor_t + v,  v ~ N(0, R)

    The observation matrix H_t = factor_return_t is time-varying,
    making this a standard time-varying KF solvable with the 4-equation update.
    """

    def __init__(self, q: float = Q_PROCESS, r: float = R_OBS_DEFAULT):
        self.q = q
        self.r = r
        self.x = 0.0    # posterior mean (beta)
        self.p = 1.0    # posterior variance
        self._initialized = False

    def initialize(self, beta_ols: float, init_variance: float = 0.05,
                   obs_variance: float = R_OBS_DEFAULT):
        self.x = float(beta_ols)
        self.p = max(float(init_variance), 1e-6)
        self.r = max(float(obs_variance), 1e-6)
        self._initialized = True

    def step(self, pair_ret: float, factor_ret: float) -> tuple[float, float]:
        """One Kalman predict+update step. Returns (posterior_mean, posterior_variance)."""
        # Predict
        p_pred = self.p + self.q

        if abs(factor_ret) < 1e-10:
            # Factor return is zero — can't update, just propagate uncertainty
            self.p = p_pred
            return self.x, self.p

        h = float(factor_ret)
        # Innovation
        innov = float(pair_ret) - h * self.x
        s = h * h * p_pred + self.r   # innovation variance
        k = p_pred * h / s            # Kalman gain

        # Update
        self.x = self.x + k * innov
        self.p = max((1.0 - k * h) * p_pred, 1e-8)
        return self.x, self.p

    def batch(self, pair_rets: np.ndarray, factor_rets: np.ndarray) -> tuple[float, float]:
        """Process a batch of observations and return final (mean, variance)."""
        for pr, fr in zip(pair_rets, factor_rets):
            if np.isfinite(pr) and np.isfinite(fr):
                self.step(float(pr), float(fr))
        return self.x, self.p


# ── Main estimator ────────────────────────────────────────────────────────────

class BetaEstimator:
    """
    Runs rolling OLS + Kalman filter beta estimation for each pair against each
    factor proxy. Kalman state persists across 120s cycles — only the last 5 new
    bars are fed each cycle to incrementally update the posterior.
    """

    def __init__(self):
        # kalmans[symbol][factor] = KalmanBeta
        self._kalmans: dict[str, dict[str, KalmanBeta]] = {}
        self._last: dict = {}

    def _kf(self, sym: str, factor: str) -> KalmanBeta:
        self._kalmans.setdefault(sym, {})
        if factor not in self._kalmans[sym]:
            self._kalmans[sym][factor] = KalmanBeta()
        return self._kalmans[sym][factor]

    @staticmethod
    def _label(variance: float) -> str:
        if variance < VAR_LOW:
            return 'LOW'
        if variance < VAR_MEDIUM:
            return 'MEDIUM'
        return 'HIGH'

    def estimate(self, bars_by_symbol: dict) -> dict:
        """
        Compute beta estimates for all symbols that have bar data.

        Args:
            bars_by_symbol: {MT5_symbol_no_slash: structured_bar_array}

        Returns:
            {symbol: {beta_dxy: {mean, variance, ols, uncertainty}, ..., r_squared, window}}
        """
        # Build factor return series from proxy pairs
        factor_rets: dict[str, np.ndarray] = {}
        for factor, (proxy_sym, sign) in FACTOR_PROXIES.items():
            bars = bars_by_symbol.get(proxy_sym)
            if bars is not None and len(bars) >= MIN_WINDOW + 1:
                factor_rets[factor] = _log_returns(bars) * sign
            else:
                log.debug(f'BetaEstimator: missing proxy {proxy_sym} for {factor}')

        if not factor_rets:
            log.warning('BetaEstimator: no factor proxy bars available — skipping')
            return self._last

        results: dict = {}
        ts = int(time.time() * 1000)

        for sym, bars in bars_by_symbol.items():
            if bars is None or len(bars) < MIN_WINDOW + 1:
                continue

            pair_rets = _log_returns(bars)
            pair_factors: dict = {}
            r_sq_vals: list[float] = []

            for factor, fr in factor_rets.items():
                n = min(len(pair_rets), len(fr))
                if n < MIN_WINDOW:
                    continue

                pr = pair_rets[-n:]
                fr_n = fr[-n:]

                # Rolling OLS
                ols_b, r_sq = _ols_beta(pr, fr_n)
                r_sq_vals.append(r_sq)

                # Kalman filter (incremental — update on last 5 new bars)
                kf = self._kf(sym, factor)
                if not kf._initialized:
                    # Estimate observation noise from OLS residuals
                    n_win = min(WINDOW, n)
                    y_pred = ols_b * fr_n[-n_win:]
                    residuals = pr[-n_win:] - y_pred
                    obs_var = float(np.var(residuals)) if len(residuals) > 2 else R_OBS_DEFAULT
                    kf.initialize(ols_b, init_variance=0.05, obs_variance=obs_var)

                inc = min(5, n)
                kf_mean, kf_var = kf.batch(pr[-inc:], fr_n[-inc:])

                pair_factors[factor] = {
                    'mean':        round(float(kf_mean), 4),
                    'variance':    round(float(kf_var), 6),
                    'ols':         round(float(ols_b), 4),
                    'uncertainty': self._label(kf_var),
                }

            if pair_factors:
                avg_r_sq = sum(r_sq_vals) / len(r_sq_vals) if r_sq_vals else 0.0
                results[sym] = {
                    **pair_factors,
                    'r_squared': round(avg_r_sq, 4),
                    'window':    WINDOW,
                    'timestamp': ts,
                }

        self._last = results
        return results


# ── KV I/O ────────────────────────────────────────────────────────────────────

def push_beta_to_kv(estimates: dict, base_url: str, timeout: int = 5) -> bool:
    """Write beta estimates to KV via /api/kv/set."""
    try:
        payload = json.dumps({
            'key':       'beta_estimates',
            'data':      estimates,
            'timestamp': int(time.time() * 1000),
        }).encode()
        req = urllib.request.Request(
            f'{base_url.rstrip("/")}/api/kv/set',
            data=payload,
            headers={'Content-Type': 'application/json'},
            method='POST',
        )
        with urllib.request.urlopen(req, timeout=timeout):
            pass
        return True
    except Exception as exc:
        log.debug(f'BetaEstimator: KV push failed: {exc}')
        return False
