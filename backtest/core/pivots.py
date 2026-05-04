"""
Classic daily pivot point calculation.

Pivots are computed from the PRIOR day's high, low, and close — no lookahead.
The full set (P, R1/R2/R3, S1/S2/S3, midpoints) is exposed so the confluence
detector can treat pivot levels exactly like fib levels from any other source.

Classic formula:
    P   = (prev_H + prev_L + prev_C) / 3
    R1  = 2P - prev_L
    R2  = P + (prev_H - prev_L)
    R3  = prev_H + 2(P - prev_L)
    S1  = 2P - prev_H
    S2  = P - (prev_H - prev_L)
    S3  = prev_L - 2(prev_H - P)
    Mid-points between each major level are also included.
"""

from __future__ import annotations
import pandas as pd


PIVOT_LEVEL_NAMES = ['S3', 'S2', 'M_S2', 'S1', 'M_S1', 'P', 'M_R1', 'R1', 'M_R2', 'R2', 'R3']


def compute_daily_pivots(m1: pd.DataFrame) -> pd.DataFrame:
    """
    Compute classic pivot points for each London calendar date.

    Uses 1m bars to get prior day H/L/C (last close of day, daily H and L).
    Returns a DataFrame indexed by london_date.
    All values are NaN for the first available date (no prior day).
    """
    daily = m1.groupby('london_date').agg(
        high=('high',  'max'),
        low=('low',   'min'),
        close=('close', 'last'),
    )

    # Shift by 1 trading day — pivot for today uses yesterday's OHLC
    prev = daily.shift(1)

    piv = pd.DataFrame(index=daily.index)
    piv['P']    = (prev['high'] + prev['low'] + prev['close']) / 3
    piv['R1']   = 2 * piv['P'] - prev['low']
    piv['R2']   = piv['P'] + (prev['high'] - prev['low'])
    piv['R3']   = prev['high'] + 2 * (piv['P'] - prev['low'])
    piv['S1']   = 2 * piv['P'] - prev['high']
    piv['S2']   = piv['P'] - (prev['high'] - prev['low'])
    piv['S3']   = prev['low'] - 2 * (prev['high'] - piv['P'])
    piv['M_R1'] = (piv['P']  + piv['R1']) / 2
    piv['M_R2'] = (piv['R1'] + piv['R2']) / 2
    piv['M_S1'] = (piv['P']  + piv['S1']) / 2
    piv['M_S2'] = (piv['S1'] + piv['S2']) / 2

    return piv.round(5)


def pivot_as_fib_set(pivot_row: pd.Series) -> list[tuple[float, float]]:
    """
    Convert one row of the pivot DataFrame into a (level, price) list
    compatible with core/fibs.py find_confluences().

    Level numbers are arbitrary integers — the confluence detector only
    cares about price proximity, not level values.
    """
    result = []
    for i, name in enumerate(PIVOT_LEVEL_NAMES):
        if name in pivot_row.index:
            val = pivot_row[name]
            if pd.notna(val):
                result.append((float(i), float(val)))
    return result
