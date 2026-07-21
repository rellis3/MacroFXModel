"""
budget_research_lib — shared baseplate for the Tier 1-4 "market-state" research
(state-conditioned sizing/gating, time-adjusted consumption, remaining-budget
exits, vov continuity, cone conditioning).

Generate-don't-port (PYTHON_LEGO.md): the σ math is `vol_exhaustion_lib` (already
bit-checked vs the JS forecaster); the momentum + inverse-vol sizing here reproduce
`js/trendFollowEngine.js` (Moskowitz-Ooi-Pedersen TSMOM) exactly:
  signal = mean(sign(close[i]-close[i-L])) for L in {21,63,126,252}
  position = signal * volTargetMarket / annualized_vol(63d), capped at maxLeverage
No lookahead anywhere: the position held INTO day i is decided from data <= i-1.
"""
import os
import numpy as np
from vol_exhaustion_lib import load_m1, build_london_daily, causal_sigma

HERE = os.path.dirname(os.path.abspath(__file__))
DAY = 252

INSTRUMENTS = {
    'EURUSD': 'portfolioBacktest/cache/eurusd_m1.parquet',
    'GBPUSD': 'portfolioBacktest/cache/gbpusd_m1.parquet',
    'AUDUSD': 'portfolioBacktest/cache/audusd_m1.parquet',
    'NZDUSD': 'portfolioBacktest/cache/nzdusd_m1.parquet',
    'USDCAD': 'portfolioBacktest/cache/usdcad_m1.parquet',
    'USDCHF': 'portfolioBacktest/cache/usdchf_m1.parquet',
    'NQ':     'portfolioBacktest/cache/nq_m1.parquet',
}
FX_MAJORS = ['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF']

# forecast band constants — match js/volBacktestEngine.js
BM_P75 = 2.049
HL75_CORR = {'fx': 0.817, 'index': 0.967}
ASSET_OF = {p: 'fx' for p in FX_MAJORS}; ASSET_OF['NQ'] = 'index'

LOOKBACKS = (21, 63, 126, 252)
VOL_WINDOW = 63
VOL_TARGET = 0.15
MAX_LEV = 2.0
COST_BP = 2.0


def momentum_signal(closes, lookbacks=LOOKBACKS):
    """mean(sign(close[i]-close[i-L])) over lookbacks; 0 until enough history. Causal."""
    n = closes.size
    sig = np.zeros(n)
    for i in range(n):
        s = k = 0
        for L in lookbacks:
            if i - L >= 0 and closes[i - L] > 0:
                s += np.sign(closes[i] - closes[i - L]); k += 1
        sig[i] = s / k if k else 0.0
    return sig


def rolling_vol(rets, window=VOL_WINDOW):
    """Annualized rolling std of daily simple returns; vol[i] uses rets<=i."""
    n = rets.size
    out = np.full(n, np.nan)
    for i in range(n):
        s = max(0, i - window + 1)
        w = rets[s:i + 1]
        if w.size >= 10:
            out[i] = w.std(ddof=1) * np.sqrt(DAY)
    return out


def sharpe(daily_ret):
    r = daily_ret[np.isfinite(daily_ret)]
    if r.size < 20 or r.std() == 0:
        return float('nan')
    return r.mean() / r.std() * np.sqrt(DAY)


def efficiency(o, h, l, c):
    """Kaufman efficiency ratio per day: |close-open|/(high-low) in [0,1]. 'entropy' of
    how the day's range was spent — a clean trend ≈1, a chaotic whip ≈0."""
    rng = h - l
    er = np.full(o.size, np.nan)
    m = rng > 0
    er[m] = np.abs(c - o)[m] / rng[m]
    return er


def build_daily(pair):
    """London-daily OHLC + causal σ + simple returns from the M1 cache. All causal."""
    m1 = load_m1(os.path.join(HERE, '..', INSTRUMENTS[pair]))
    d = build_london_daily(m1)
    sig = causal_sigma(d)                       # σ_pred[i]=yz[i-1]
    o, h, l, c = d['open'], d['high'], d['low'], d['close']
    rets = np.zeros(c.size)
    rets[1:] = np.where(c[:-1] > 0, (c[1:] - c[:-1]) / c[:-1], 0)
    return dict(pair=pair, m1=m1, daily=d, open=o, high=h, low=l, close=c,
                sigma=sig, rets=rets, day_idx=d['day_idx'])


def state_features(dd):
    """Per-day causal state, ALL usable at entry for the position held INTO day i
    (i.e. read data <= i-1). Returns dict of arrays aligned to daily bars.
      eff_prev   efficiency ratio of day i-1        (trend vs chaos yesterday)
      exc_prev   realized H-L(i-1) exceeded its 75th line (budget blew through)
      vov        std(log σ) over the trailing 20 (<= i-1)
      sig_accel  σ_pred(i-1) / mean(σ_pred i-6..i-2)   (vol accelerating)
      sig_pct    percentile of σ_pred(i-1) in its trailing 252
    """
    o, h, l, c, sig = dd['open'], dd['high'], dd['low'], dd['close'], dd['sigma']
    n = c.size
    hl75 = BM_P75 * HL75_CORR[ASSET_OF[dd['pair']]]
    er = efficiency(o, h, l, c)
    realized_hl_sig = np.full(n, np.nan)
    ok = (sig > 0) & (o > 0)
    realized_hl_sig[ok] = (h[ok] - l[ok]) / o[ok] / sig[ok]
    exc = (realized_hl_sig > hl75).astype(float)

    logsig = np.log(np.where(sig > 0, sig, np.nan))
    vov = np.full(n, np.nan); accel = np.full(n, np.nan); pct = np.full(n, np.nan)
    for i in range(n):
        if i >= 21:
            w = logsig[i - 20:i]; w = w[np.isfinite(w)]
            if w.size >= 5:
                vov[i] = w.std(ddof=1)
        if i >= 6:
            base = sig[i - 5:i]; base = base[base > 0]
            if base.size and sig[i] > 0:
                accel[i] = sig[i] / base.mean()
        if i >= 252:
            w = sig[i - 252:i]; w = w[w > 0]
            if w.size >= 30:
                pct[i] = (w < sig[i]).mean()

    def lag(x):
        out = np.full(n, np.nan); out[1:] = x[:-1]; return out
    # everything lagged by one so it is known at the entry into day i
    return dict(eff_prev=lag(er), exc_prev=lag(exc),
                vov=lag(vov), sig_accel=lag(accel), sig_pct=lag(pct))


def strat_returns(dd, position):
    """Daily strategy returns from a position series (position[i] held into day i+1,
    earns rets[i+1]); cost charged on |Δposition|. Returns aligned array."""
    rets = dd['rets']; n = rets.size
    pos = np.nan_to_num(position)
    dr = np.zeros(n)
    for i in range(1, n):
        dr[i] = pos[i - 1] * rets[i] - (COST_BP / 1e4) * abs(pos[i - 1] - (pos[i - 2] if i >= 2 else 0))
    return dr


def base_position(dd, use_vol=True):
    """TSMOM position. use_vol=True → inverse-vol sized (the real engine); False →
    sign-only fixed notional (the ablation for 'does vol-sizing help')."""
    c = dd['close']
    sig_m = momentum_signal(c)
    if not use_vol:
        return np.clip(sig_m, -1, 1)
    vol = rolling_vol(dd['rets'])
    pos = np.zeros(c.size)
    for i in range(c.size):
        v = vol[i]
        if v and np.isfinite(v) and v > 0:
            pos[i] = np.clip(sig_m[i] * (VOL_TARGET / v), -MAX_LEV, MAX_LEV)
    return pos
