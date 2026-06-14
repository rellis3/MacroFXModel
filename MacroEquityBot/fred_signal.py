"""
FRED data fetching and macro signal computation for the Macro Equity Bot.

Ports the core logic from js/macroEquityEngine.js:
  - 5-factor composite macro score (net liquidity, yield curve, HY credit,
    real yield, ISM/PMI)
  - 252-day rolling z-scores with publication lags
  - Band-based allocation (25 / 50 / 75 / 100 %)
  - Trend filter  (200-day MA + 12-month momentum)
  - VIX volatility sizer
"""

import logging
import math
import statistics
from datetime import date
from typing import Optional

import requests

log = logging.getLogger(__name__)

FRED_BASE         = 'https://api.stlouisfed.org/fred/series/observations'
YAHOO_BASE        = 'https://query1.finance.yahoo.com/v8/finance/chart'
PUB_LAG_WEEKLY    = 5    # trading-day lag applied to weekly FRED series
PUB_LAG_MONTHLY   = 21   # trading-day lag applied to monthly FRED series
Z_WINDOW          = 252  # rolling z-score window (trading days)
MIN_Z_WINDOW      = 30   # minimum observations before z-score is valid

_FRED_IDS = {
    'walcl':     'WALCL',
    'wtregen':   'WTREGEN',
    'rrpon':     'RRPONTSYD',
    'curve':     'T10Y2Y',
    'credit':    'BAMLH0A0HYM2',
    'realyield': 'DFII10',
    'ism':       'NAPM',
    'indpro':    'INDPRO',
    'eupmi':     'MPMIEZMA156N',
}


# ── FRED helpers ───────────────────────────────────────────────────────────────

def _fetch_fred(series_id: str, api_key: str, start: str = '2003-01-01') -> dict[str, float]:
    """Return {date_str: value} for a FRED series, oldest first."""
    url = (f'{FRED_BASE}?series_id={series_id}&api_key={api_key}'
           f'&file_type=json&observation_start={start}&sort_order=asc')
    r = requests.get(url, timeout=20)
    r.raise_for_status()
    out: dict[str, float] = {}
    for obs in r.json().get('observations', []):
        try:
            out[obs['date']] = float(obs['value'])
        except (ValueError, KeyError):
            pass
    return out


def _fetch_vix_prices(n: int = 300) -> list[float]:
    """Fetch recent VIX closing prices from Yahoo Finance."""
    url = (f'{YAHOO_BASE}/%5EVIX?interval=1d'
           f'&range=2y')
    headers = {'User-Agent': 'Mozilla/5.0 (compatible; MacroEquityBot/1.0)'}
    try:
        r = requests.get(url, headers=headers, timeout=15)
        r.raise_for_status()
        result = r.json()['chart']['result'][0]
        closes = result['indicators']['quote'][0].get('close', [])
        return [v for v in closes if v is not None][-n:]
    except Exception as e:
        log.warning(f'VIX fetch failed: {e}')
        return []


# ── Array helpers ──────────────────────────────────────────────────────────────

def _forward_fill(sparse: dict[str, float], dates: list[str]) -> list[float]:
    """Align sparse series to dates list using forward-fill."""
    result: list[float] = []
    last = float('nan')
    for d in dates:
        if d in sparse:
            last = sparse[d]
        result.append(last)
    return result


def _apply_lag(values: list[float], lag: int) -> list[float]:
    """Shift values right by lag positions (simulates publication delay)."""
    if lag <= 0:
        return values
    n = len(values)
    if lag >= n:
        return [float('nan')] * n
    return [float('nan')] * lag + values[:n - lag]


def _pct_change(values: list[float]) -> list[float]:
    """Percentage change from previous finite value."""
    result: list[float] = [float('nan')]
    for i in range(1, len(values)):
        p, c = values[i - 1], values[i]
        if math.isfinite(p) and math.isfinite(c) and p != 0:
            result.append((c - p) / abs(p))
        else:
            result.append(float('nan'))
    return result


def _rolling_z(values: list[float], window: int = Z_WINDOW) -> list[float]:
    """Rolling z-score of values over trailing window."""
    result: list[float] = []
    for i, v in enumerate(values):
        if not math.isfinite(v):
            result.append(float('nan'))
            continue
        window_vals = [x for x in values[max(0, i - window):i] if math.isfinite(x)]
        if len(window_vals) < MIN_Z_WINDOW:
            result.append(float('nan'))
            continue
        mu = sum(window_vals) / len(window_vals)
        sd = statistics.pstdev(window_vals)
        result.append((v - mu) / sd if sd > 0 else 0.0)
    return result


def _last_valid(arr: list[float]) -> float:
    for v in reversed(arr):
        if math.isfinite(v):
            return v
    return float('nan')


# ── Signal computation ─────────────────────────────────────────────────────────

def fetch_all_fred(api_key: str, eu_mode: bool = False, start: str = '2003-01-01') -> dict:
    """Fetch all required FRED series. Returns raw {name: {date: value}}."""
    keys_needed = ['walcl', 'wtregen', 'rrpon', 'curve', 'credit', 'realyield', 'ism', 'indpro']
    if eu_mode:
        keys_needed.append('eupmi')

    raw: dict[str, dict[str, float]] = {}
    for key in keys_needed:
        sid = _FRED_IDS[key]
        try:
            raw[key] = _fetch_fred(sid, api_key, start)
            log.info(f'  FRED {sid}: {len(raw[key])} observations')
        except Exception as e:
            log.warning(f'  FRED {sid} fetch failed: {e}')
            raw[key] = {}
    return raw


def compute_macro_score(
    fred_raw: dict,
    weights: dict,
    eu_mode: bool = False,
) -> dict:
    """
    Compute the current composite macro score from raw FRED data.

    Returns:
        score          - composite macro score (float, typically -3 to +3)
        factor_scores  - individual z-scores per factor
        as_of          - most recent date in dataset
        regime         - 'BULL' | 'NEUTRAL_BULL' | 'NEUTRAL_BEAR' | 'BEAR'
    """
    # Build master date list (union of all series dates)
    all_dates_set: set[str] = set()
    for v in fred_raw.values():
        all_dates_set.update(v.keys())
    all_dates = sorted(all_dates_set)

    if not all_dates:
        return {'score': float('nan'), 'factor_scores': {}, 'as_of': None, 'regime': 'UNKNOWN'}

    # Forward-fill each series
    walcl     = _forward_fill(fred_raw.get('walcl', {}),     all_dates)
    wtregen   = _forward_fill(fred_raw.get('wtregen', {}),   all_dates)
    rrpon     = _forward_fill(fred_raw.get('rrpon', {}),     all_dates)
    curve     = _forward_fill(fred_raw.get('curve', {}),     all_dates)
    credit    = _forward_fill(fred_raw.get('credit', {}),    all_dates)
    realyield = _forward_fill(fred_raw.get('realyield', {}), all_dates)

    ism_raw = fred_raw.get('ism', {})
    if not ism_raw:
        ism_raw = fred_raw.get('indpro', {})
    ism = _forward_fill(ism_raw, all_dates)

    pmi_series = _forward_fill(fred_raw.get('eupmi', {}), all_dates) if eu_mode else ism

    # Net liquidity = WALCL - WTREGEN - RRPON (pct change)
    netliq_raw = [
        w - t - r if (math.isfinite(w) and math.isfinite(t) and math.isfinite(r)) else float('nan')
        for w, t, r in zip(walcl, wtregen, rrpon)
    ]
    netliq_pct = _pct_change(netliq_raw)

    # Apply publication lags
    netliq_lag = _apply_lag(netliq_pct, PUB_LAG_WEEKLY)
    curve_lag  = _apply_lag(curve,      0)
    credit_lag = _apply_lag(credit,     0)
    ry_lag     = _apply_lag(realyield,  0)
    ism_lag    = _apply_lag(pmi_series, PUB_LAG_MONTHLY)

    # Z-score each factor
    netliq_z  = _rolling_z(netliq_lag)
    curve_z   = _rolling_z(curve_lag)
    credit_z  = _rolling_z(credit_lag)
    ry_z      = _rolling_z(ry_lag)
    ism_z     = _rolling_z(ism_lag)

    # Latest valid z-scores
    nz = _last_valid(netliq_z)
    cv = _last_valid(curve_z)
    cr = _last_valid(credit_z)
    ry = _last_valid(ry_z)
    iz = _last_valid(ism_z)

    w = weights
    composite = (
        w.get('netliq', 0.40)    * nz +
        w.get('curve', 0.20)     * cv +
        w.get('credit', 0.20)    * (-cr) +   # inverted: low spread = bullish
        w.get('realyield', 0.15) * (-ry) +   # inverted: low real yield = bullish
        w.get('ism', 0.05)       * iz
    )

    if composite > 1.0:       regime = 'BULL'
    elif composite > 0.0:     regime = 'NEUTRAL_BULL'
    elif composite > -1.0:    regime = 'NEUTRAL_BEAR'
    else:                     regime = 'BEAR'

    return {
        'score':  composite,
        'factor_scores': {
            'netliq_z':    round(nz, 3),
            'curve_z':     round(cv, 3),
            'credit_z':    round(cr, 3),
            'realyield_z': round(ry, 3),
            'ism_z':       round(iz, 3),
        },
        'as_of':  all_dates[-1],
        'regime': regime,
    }


# ── Allocation pipeline ────────────────────────────────────────────────────────

def score_to_base_alloc(score: float, bands: dict) -> float:
    """Map composite score to base allocation using band thresholds."""
    if not math.isfinite(score):
        return 0.50
    if score > bands.get('high', 1.0):  return 1.00
    if score > bands.get('mid',  0.0):  return 0.75
    if score > bands.get('low', -1.0):  return 0.50
    return 0.25


def apply_trend_filter(closes: list[float], base_alloc: float) -> float:
    """Scale allocation by 200-day MA and 12-month momentum check."""
    if len(closes) < 252:
        return base_alloc
    ma200   = sum(closes[-200:]) / 200
    current = closes[-1]
    prev12m = closes[-252]
    above_ma = current > ma200
    pos_mom  = prev12m > 0 and current > prev12m
    if above_ma and pos_mom:   mult = 1.00
    elif above_ma or pos_mom:  mult = 0.80
    else:                      mult = 0.55
    return base_alloc * mult


def apply_vix_filter(vix_closes: list[float], base_alloc: float) -> float:
    """Scale allocation by VIX z-score (high VIX → reduce exposure)."""
    finite = [v for v in vix_closes if v is not None and math.isfinite(v)]
    if len(finite) < MIN_Z_WINDOW:
        return base_alloc
    recent = finite[-Z_WINDOW:]
    mu = sum(recent) / len(recent)
    sd = statistics.pstdev(recent)
    vix_z = (finite[-1] - mu) / sd if sd > 0 else 0.0
    if vix_z > 1.5:      mult = 0.30
    elif vix_z > 0.75:   mult = 0.60
    elif vix_z > -0.5:   mult = 0.85
    else:                mult = 1.00
    return base_alloc * mult


def compute_target_alloc(
    macro_score: float,
    closes: list[float],
    vix_closes: list[float],
    bands: dict,
    floor: float,
    is_inverted: bool = False,
) -> float:
    """
    Full allocation pipeline for one instrument.
    is_inverted=True for bond hedge (TLT): score is negated before banding.
    """
    score = -macro_score if is_inverted else macro_score
    alloc = score_to_base_alloc(score, bands)
    alloc = apply_trend_filter(closes, alloc)
    alloc = apply_vix_filter(vix_closes, alloc)
    alloc = max(alloc, floor)
    return round(alloc, 4)
