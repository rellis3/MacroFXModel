"""
Pullback Continuation Engine — HTF-bias-gated shallow-retracement entries.

Built to answer a question this repo's existing engines don't: how do you
buy a DIP that continues the higher-timeframe trend, rather than fade an
exhaustion/reversal level? It combines three pieces that already exist in
this repo, reused rather than reinvented:

  1. HTF bias direction — the SAME rules as
     ConfluenceBot/modules/htf_bias.py / GoldV2/modules/htf_bias.py (Daily
     price+EMA21/50 trend, H4 market structure HH/HL vs LH/LL, BOS override,
     agreement/confidence table — see the untouched duplicate of that file
     sitting next to this one). Ported here as a vectorised, causal
     computation over the WHOLE price history instead of one dict-list call
     per bar, so a multi-year, multi-pair backtest finishes in seconds
     instead of hours. Same rules, different execution shape — spot-check
     against htf_bias.compute_htf_bias if the two ever need to be compared
     bar-for-bar.

  2. Shallow-retracement pullback zone — the ".382 = shallow trend
     continuation" idea already present in Gold/modules/fib_engine.py, but
     promoted here from a minor confluence-scoring weight into a standalone
     entry trigger. Only a pullback that STAYS shallow (23.6%-50% of the
     preceding impulse leg) counts. A deep .618-.886 retrace is what
     fib_engine treats as a REVERSAL setup — the opposite job.

  3. Re-acceleration confirmation — price must close back above (long) /
     below (short) the pullback's own local high/low before an entry fires.
     The system never buys mid-pullback on the hope it holds; it waits for
     proof the pullback is over and the trend has resumed.

Exit is deliberately NOT this module's job — the hold/trail logic is
pylego.barrier_race.race_trailing (chandelier trail, no fixed TP), the same
shared brick Gold/mfe_mae_analysis.py used to show a fixed TP1/TP2 gives
back real R on trend days. This module only ever proposes an entry + an
initial structural stop; something else (see backtest.py) decides how to
ride it.

Causality: every function here only ever reads bars up to and including the
"current" bar. Swing pivots need `pivot_n` bars of LOOK-AHEAD to confirm —
handled by only trusting a pivot once bar (pivot_idx + pivot_n) has actually
occurred, never earlier. HTF bias for a given H1 bar only uses Daily/H4 bars
that had already closed by that H1 bar's timestamp (merge_asof, backward).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import numpy as np
import pandas as pd


# ── ATR ──────────────────────────────────────────────────────────────────────

def atr(bars: pd.DataFrame, period: int = 14) -> pd.Series:
    high, low, close = bars['high'], bars['low'], bars['close']
    prev_close = close.shift(1)
    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs(),
    ], axis=1).max(axis=1)
    return tr.ewm(alpha=1.0 / period, adjust=False, min_periods=period).mean()


# ── Pivots + zigzag ────────────────────────────────────────────────────────────

def find_pivots(bars: pd.DataFrame, n: int) -> tuple[np.ndarray, np.ndarray]:
    """Confirmed swing highs/lows, n bars each side. A pivot at index i is
    only knowable once bar i+n exists — callers must not use it before then."""
    win = 2 * n + 1
    roll_max = bars['high'].rolling(win, center=True).max()
    roll_min = bars['low'].rolling(win, center=True).min()
    is_ph = (bars['high'] == roll_max) & roll_max.notna()
    is_pl = (bars['low'] == roll_min) & roll_min.notna()
    return np.flatnonzero(is_ph.values), np.flatnonzero(is_pl.values)


@dataclass
class SwingPoint:
    idx: int
    price: float
    kind: str   # 'high' | 'low'


def build_zigzag_events(bars: pd.DataFrame, n: int) -> list[tuple]:
    """(confirm_idx, pivot_idx, kind, price) sorted by confirm time — the
    order a causal backtest loop is allowed to learn about each swing."""
    ph_idx, pl_idx = find_pivots(bars, n)
    high = bars['high'].values
    low = bars['low'].values
    events = [(i + n, i, 'high', float(high[i])) for i in ph_idx] + \
             [(i + n, i, 'low', float(low[i])) for i in pl_idx]
    events.sort(key=lambda e: (e[0], e[1]))
    return events


def zigzag_step(zz: list, pivot_idx: int, price: float, kind: str) -> None:
    """Greedy alternating zigzag: a same-kind pivot replaces the last point
    if more extreme (the leg is still extending); an opposite-kind pivot
    starts a new leg."""
    if not zz or zz[-1].kind != kind:
        zz.append(SwingPoint(pivot_idx, price, kind))
        return
    if kind == 'high' and price > zz[-1].price:
        zz[-1] = SwingPoint(pivot_idx, price, kind)
    elif kind == 'low' and price < zz[-1].price:
        zz[-1] = SwingPoint(pivot_idx, price, kind)


# ── HTF bias (vectorised port of ConfluenceBot/modules/htf_bias.py) ──────────

def daily_trend_series(d1: pd.DataFrame, fast: int = 21, slow: int = 50) -> pd.Series:
    """UP / DOWN / FLAT per bar — same rule as htf_bias._daily_trend: close
    > ema_fast > ema_slow with ema_fast sloping up (mirror for DOWN)."""
    close = d1['close']
    ef = close.ewm(span=fast, adjust=False).mean()
    es = close.ewm(span=slow, adjust=False).mean()
    slope_up = ef > ef.shift(4)      # ema[-1] vs ema[-5] in the original list-index rule
    slope_down = ef < ef.shift(4)
    up = (close > ef) & (ef > es) & slope_up
    down = (close < ef) & (ef < es) & slope_down
    trend = pd.Series('FLAT', index=d1.index, dtype=object)
    trend[up.fillna(False)] = 'UP'
    trend[down.fillna(False)] = 'DOWN'
    n_guard = min(len(trend), slow + 5)
    trend.iloc[:n_guard] = 'FLAT'   # insufficient history yet, matches the len()<slow+5 guard
    return trend


def h4_structure_series(h4: pd.DataFrame, pivot_n: int = 3) -> pd.Series:
    """UP / DOWN / FLAT per H4 bar, from the SAME zigzag machinery as the
    pullback engine: last two confirmed swing highs rising AND last two
    confirmed swing lows rising -> UP (mirror DOWN); a fresh close beyond the
    most recent confirmed swing extreme (BOS) overrides a FLAT/opposing read.
    Falls back to the daily-trend EMA rule when too few pivots exist yet —
    the same fallback htf_bias.py uses for a relentless one-way move that
    forms too few confirmed pivots to read a sequence at all."""
    n = len(h4)
    events = build_zigzag_events(h4, pivot_n)
    close = h4['close'].values
    ema_fallback = daily_trend_series(h4).values

    struct = np.full(n, 'FLAT', dtype=object)
    zz: list = []
    ei = 0
    for t in range(n):
        while ei < len(events) and events[ei][0] == t:
            _, pidx, kind, price = events[ei]
            zigzag_step(zz, pidx, price, kind)
            ei += 1

        highs = [p for p in zz if p.kind == 'high']
        lows = [p for p in zz if p.kind == 'low']
        if len(highs) < 2 or len(lows) < 2:
            struct[t] = ema_fallback[t]
            continue

        h1p, h2p = highs[-2].price, highs[-1].price
        l1p, l2p = lows[-2].price, lows[-1].price
        if h2p > h1p and l2p > l1p:
            s = 'UP'
        elif h2p < h1p and l2p < l1p:
            s = 'DOWN'
        else:
            s = 'FLAT'

        c = close[t]
        bos = None
        if c > h2p * 1.0005:
            bos = 'UP'
        elif c < l2p * 0.9995:
            bos = 'DOWN'
        if bos == 'UP' and s != 'UP':
            s = 'UP'
        elif bos == 'DOWN' and s != 'DOWN':
            s = 'DOWN'
        struct[t] = s

    return pd.Series(struct, index=h4.index)


def combine_bias(daily_trend: str, h4_trend: str) -> tuple[str, float]:
    """Same agreement/confidence table as htf_bias.compute_htf_bias."""
    if daily_trend == h4_trend == 'UP':
        return 'BULL', 0.90
    if daily_trend == h4_trend == 'DOWN':
        return 'BEAR', 0.90
    if daily_trend == 'UP' and h4_trend == 'FLAT':
        return 'BULL', 0.55
    if daily_trend == 'DOWN' and h4_trend == 'FLAT':
        return 'BEAR', 0.55
    if daily_trend == 'FLAT' and h4_trend == 'UP':
        return 'BULL', 0.45
    if daily_trend == 'FLAT' and h4_trend == 'DOWN':
        return 'BEAR', 0.45
    return 'NEUTRAL', 0.30


def htf_bias_series(d1: pd.DataFrame, h4: pd.DataFrame) -> pd.DataFrame:
    """H4-indexed DataFrame with columns bias/confidence/daily_trend/h4_trend.
    The Daily trend is asof-joined (backward) onto each H4 bar so both trends
    are read as of the same instant — no lookahead in either direction."""
    d_trend = daily_trend_series(d1).rename('daily_trend')
    h_trend = h4_structure_series(h4).rename('h4_trend')

    d_df = d_trend.reset_index()
    d_df.columns = ['time', 'daily_trend']
    h_df = h_trend.reset_index()
    h_df.columns = ['time', 'h4_trend']

    merged = pd.merge_asof(h_df.sort_values('time'), d_df.sort_values('time'),
                            on='time', direction='backward')
    pairs = [combine_bias(dt, ht) for dt, ht in zip(merged['daily_trend'], merged['h4_trend'])]
    merged['bias'] = [p[0] for p in pairs]
    merged['confidence'] = [p[1] for p in pairs]
    return merged.set_index('time')[['bias', 'confidence', 'daily_trend', 'h4_trend']]


# ── Pullback-continuation signal generation ──────────────────────────────────

@dataclass
class Signal:
    idx: int              # H1 bar index of the entry (fires on that bar's close)
    direction: int         # +1 long, -1 short
    entry_price: float
    stop_price: float
    leg_low: float
    leg_high: float
    bias_confidence: float


def generate_signals(
    h1: pd.DataFrame,
    bias: pd.DataFrame,             # H4-indexed, from htf_bias_series()
    pivot_n: int = 4,
    min_atr_mult: float = 1.0,
    shallow_lo: float = 0.236,       # nearer to the impulse high — shallowest allowed dip
    shallow_hi: float = 0.5,         # deepest allowed dip before it's a reversal setup, not this
    min_confidence: float = 0.5,
    sl_buffer_atr: float = 0.25,
) -> list:
    n = len(h1)
    if n < pivot_n * 4 + 10:
        return []

    atr_h1 = atr(h1, 14).values
    high, low, close = h1['high'].values, h1['low'].values, h1['close'].values

    bias_df = bias.reset_index()
    h1_time = h1.index.to_series().rename('time').reset_index(drop=True).to_frame()
    merged = pd.merge_asof(h1_time, bias_df.sort_values('time'), on='time', direction='backward')
    bias_arr = merged['bias'].fillna('NEUTRAL').values
    conf_arr = merged['confidence'].fillna(0.0).values

    events = build_zigzag_events(h1, pivot_n)
    zz: list = []
    ei = 0

    signals: list = []

    cur_long_key = None
    long_pb_low = None
    long_armed = False
    long_arm_high = None
    long_last_entry_high = -np.inf

    cur_short_key = None
    short_pb_high = None
    short_armed = False
    short_arm_low = None
    short_last_entry_low = np.inf

    for t in range(n):
        while ei < len(events) and events[ei][0] == t:
            _, pidx, kind, price = events[ei]
            zigzag_step(zz, pidx, price, kind)
            ei += 1

        if len(zz) < 2:
            continue
        last, prev = zz[-1], zz[-2]
        a = atr_h1[t] if not np.isnan(atr_h1[t]) else 0.0

        # ── LONG: prev=low, last=high (up-leg, buy the pullback) ──────────
        if prev.kind == 'low' and last.kind == 'high':
            if last.idx != cur_long_key:
                cur_long_key = last.idx
                long_pb_low = None
                long_armed = False
                long_arm_high = None

            leg_r = last.price - prev.price
            eligible = (bias_arr[t] == 'BULL' and conf_arr[t] >= min_confidence
                        and leg_r >= min_atr_mult * a and last.price > long_last_entry_high)

            if eligible:
                long_pb_low = low[t] if long_pb_low is None else min(long_pb_low, low[t])
                shallow_top = last.price - shallow_lo * leg_r    # nearer the high
                shallow_bot = last.price - shallow_hi * leg_r    # deeper limit

                if not long_armed and low[t] <= shallow_top and long_pb_low >= shallow_bot:
                    long_armed = True
                    long_arm_high = high[t]
                elif long_armed:
                    if close[t] > long_arm_high:
                        stop = long_pb_low - sl_buffer_atr * a
                        if stop < close[t]:
                            signals.append(Signal(
                                idx=t, direction=1, entry_price=close[t], stop_price=stop,
                                leg_low=prev.price, leg_high=last.price,
                                bias_confidence=conf_arr[t],
                            ))
                            long_last_entry_high = last.price
                        long_armed = False
                    else:
                        long_arm_high = max(long_arm_high, high[t])
            else:
                long_pb_low = None
                long_armed = False

        # ── SHORT: prev=high, last=low (down-leg, sell the bounce) ────────
        if prev.kind == 'high' and last.kind == 'low':
            if last.idx != cur_short_key:
                cur_short_key = last.idx
                short_pb_high = None
                short_armed = False
                short_arm_low = None

            leg_r = prev.price - last.price
            eligible = (bias_arr[t] == 'BEAR' and conf_arr[t] >= min_confidence
                        and leg_r >= min_atr_mult * a and last.price < short_last_entry_low)

            if eligible:
                short_pb_high = high[t] if short_pb_high is None else max(short_pb_high, high[t])
                shallow_bot = last.price + shallow_lo * leg_r    # nearer the low
                shallow_top = last.price + shallow_hi * leg_r    # deeper limit

                if not short_armed and high[t] >= shallow_bot and short_pb_high <= shallow_top:
                    short_armed = True
                    short_arm_low = low[t]
                elif short_armed:
                    if close[t] < short_arm_low:
                        stop = short_pb_high + sl_buffer_atr * a
                        if stop > close[t]:
                            signals.append(Signal(
                                idx=t, direction=-1, entry_price=close[t], stop_price=stop,
                                leg_low=last.price, leg_high=prev.price,
                                bias_confidence=conf_arr[t],
                            ))
                            short_last_entry_low = last.price
                        short_armed = False
                    else:
                        short_arm_low = min(short_arm_low, low[t])
            else:
                short_pb_high = None
                short_armed = False

    return signals
