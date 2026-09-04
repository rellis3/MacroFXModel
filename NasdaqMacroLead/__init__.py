"""Nasdaq Macro Lead — research tool, NOT a trading bot.

Tests (honestly, out-of-sample) whether a composite line built from
continuously-quoted macro proxies tracks NAS100 ahead of price, the way a
UST 2s10s-derived line is sometimes shown "leading" price on FX charts.
See README.md for the full writeup and analysis/yield_asset_coupling.py for
the daily-horizon sibling study this reuses the same statistical discipline
from (lagged signal, walk-forward OOS only, circular-shift null, split-half
stability).
"""
