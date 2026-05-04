from pathlib import Path

BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR.parent / 'MD files' / 'Data'

PAIRS = {
    'EURUSD': {
        'symbol':      'EUR/USD',
        'pip_size':    0.0001,
        'spread_pips': 1.0,
        'm1_file':     DATA_DIR / 'EURUSD_eurusd-m1-bid.csv',
        'm5_file':     DATA_DIR / 'EURUSD_eurusd-m5-bid.csv',
        'm30_file':    DATA_DIR / 'EURUSD_eurusd-m30-bid.csv',
    },
    'GBPUSD': {
        'symbol':      'GBP/USD',
        'pip_size':    0.0001,
        'spread_pips': 1.5,
        'm1_file':     DATA_DIR / 'GBPUSD_gbpusd-m1-bid.csv',
        'm5_file':     DATA_DIR / 'GBPUSD_gbpusd-m5-bid.csv',
        'm30_file':    DATA_DIR / 'GBPUSD_gbpusd-m30-bid.csv',
    },
    'USDJPY': {
        'symbol':      'USD/JPY',
        'pip_size':    0.01,
        'spread_pips': 1.0,
        'm1_file':     DATA_DIR / 'USDJPY_usdjpy-m1-bid.csv',
        'm5_file':     DATA_DIR / 'USDJPY_usdjpy-m5-bid.csv',
        'm30_file':    DATA_DIR / 'USDJPY_usdjpy-m30-bid.csv',
    },
    'XAUUSD': {
        'symbol':      'XAU/USD',
        'pip_size':    0.1,
        'spread_pips': 3.0,
        'm1_file':     DATA_DIR / 'XAUUSD_xauusd-m1-bid.csv',
        'm5_file':     DATA_DIR / 'XAUUSD_xauusd-m5-bid.csv',
        'm30_file':    DATA_DIR / 'XAUUSD_xauusd-m30-bid.csv',
    },
}

# Mirrors js/config.js FIB_LEVELS exactly — price = range_low + level * range_size
FIB_LEVELS = [
    -10.5, -10, -9.5, -9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5,
    -4.5, -4, -3.5, -3, -2.5, -2, -1.5, -1,
    -0.75, -0.5, -0.25,
    0, 0.25, 0.5, 0.75,
    1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5
]

# Session boundaries in London hour (start inclusive, end exclusive)
SESSIONS = {
    'asia':       (0,  6),
    'pre_london': (6,  8),
    'london':     (8,  13),
    'overlap':    (13, 17),
    'ny_close':   (17, 21),
    'closed':     (21, 24),
}

STRATEGY = {
    # Entry window in London hours
    'entry_start_hour': 8,
    'entry_end_hour':   17,

    # Asia range validity (pips). Ranges outside these bounds are skipped.
    'min_range_pips': 5,
    'max_range_pips': 50,

    # Stop placement: 'range_mid' = midpoint of Asia range, 'range_edge' = far side of range
    'stop_type': 'range_mid',

    # Target as a multiple of initial risk (R:R)
    'target_rr': 2.0,

    # Volume filters
    'rvol_min':     1.3,    # minimum RVOL on breakout bar
    'rvol_lookback': 20,    # trading days used for time-of-day volume average

    # VWAP filter: True = only enter when price is on the correct side of London VWAP.
    # If False, VWAP is still computed and logged but does not block entries.
    'vwap_filter': True,

    # Confluence: if True, only enter when breakout is within threshold of a fib cluster
    'confluence_filter':          False,
    'confluence_threshold_pips':  5,
    'confluence_min_levels':      2,    # minimum fib levels in a cluster to count

    # Pivot levels: if True, daily classic pivots are added as an extra confluence source.
    # Pivots come from the prior day H/L/C — no lookahead.
    'use_pivot_confluence': False,

    # EMA trend filter: if True, only take entries aligned with the slow EMA trend.
    # EMA is computed on 5m bars and sampled at the London open each day.
    'ema_filter':      False,
    'ema_fast_period': 50,     # fast EMA period (5m bars)
    'ema_slow_period': 200,    # slow EMA period (5m bars) — primary trend reference
    'ema_require_both': False, # if True, both EMAs must agree (stricter)

    # Maximum one trade per day per direction
    'max_trades_per_day': 1,
}
