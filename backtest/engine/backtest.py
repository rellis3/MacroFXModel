"""
Main backtest engine — Asia Range Breakout with optional filter stack.

Filter stack (each independently togglable via STRATEGY flags):
    1. RVOL >= rvol_min on the breakout bar
    2. Price on correct side of London VWAP
    3. Fib confluence zone (Asia fibs + optional pivot levels)
    4. EMA trend alignment (5m EMA sampled at London open)
"""

from __future__ import annotations

import pandas as pd
import numpy as np
from datetime import date, timedelta
from typing import Optional

from core.sessions import get_asia_ranges, get_monday_ranges, get_prev_monday_range
from core.fibs import project_fibs, find_confluences, confluence_distance_pips
from core.pivots import compute_daily_pivots, pivot_as_fib_set
from core.indicators import build_ema_trend_lookup, ema_allows_entry
from engine.trade import Trade


class BacktestEngine:

    def __init__(self, pair: str, pair_cfg: dict, data: dict, strategy: dict):
        self.pair      = pair
        self.pair_cfg  = pair_cfg
        self.pip_size  = pair_cfg['pip_size']
        self.spread    = pair_cfg['spread_pips'] * pair_cfg['pip_size']
        self.strategy  = strategy
        self.m1        = data['m1']
        self.m5        = data['m5']
        self.m30       = data['m30']

        print('  Building Asia ranges...')
        self.asia_ranges   = get_asia_ranges(
            self.m5, self.pip_size,
            strategy['min_range_pips'],
            strategy['max_range_pips'],
        )

        print('  Building Monday ranges...')
        self.monday_ranges = get_monday_ranges(self.m30, self.pip_size)

        print('  Computing pivot levels...')
        self.daily_pivots  = compute_daily_pivots(self.m1)

        if strategy.get('ema_filter'):
            print(f'  Computing EMA({strategy["ema_fast_period"]}/{strategy["ema_slow_period"]}) on 5m...')
            self.ema_trend = build_ema_trend_lookup(
                self.m5,
                fast_period=strategy['ema_fast_period'],
                slow_period=strategy['ema_slow_period'],
            )
        else:
            self.ema_trend = None

    # ── Public ────────────────────────────────────────────────────────────────

    def run(self) -> list[Trade]:
        trades: list[Trade] = []
        valid_days = sorted(self.asia_ranges[self.asia_ranges['valid']].index)
        total      = len(valid_days)

        for i, trade_date in enumerate(valid_days):
            if i % 100 == 0:
                print(f'  Day {i:>4}/{total}  ({trade_date})')
            trades.extend(self._simulate_day(trade_date))

        print(f'  Done — {len(trades)} trades.')
        return trades

    # ── Day simulation ────────────────────────────────────────────────────────

    def _simulate_day(self, trade_date: date) -> list[Trade]:
        asia = self.asia_ranges.loc[trade_date]

        # ── Build confluence fib sets ─────────────────────────────────────────
        fib_sets = [project_fibs(asia['range_high'], asia['range_low'])]

        prev_date = self._prev_trading_date(trade_date)
        if prev_date in self.asia_ranges.index and self.asia_ranges.loc[prev_date, 'valid']:
            prev = self.asia_ranges.loc[prev_date]
            fib_sets.append(project_fibs(prev['range_high'], prev['range_low']))

        monday_range = get_prev_monday_range(self.monday_ranges, trade_date)
        if monday_range is not None:
            fib_sets.append(project_fibs(monday_range['range_high'], monday_range['range_low']))

        # Pivot levels as an additional confluence source
        if self.strategy.get('use_pivot_confluence') and trade_date in self.daily_pivots.index:
            pivot_row = self.daily_pivots.loc[trade_date]
            piv_set   = pivot_as_fib_set(pivot_row)
            if piv_set:
                fib_sets.append(piv_set)

        confluences = find_confluences(
            fib_sets,
            pip_size=self.pip_size,
            threshold_pips=self.strategy['confluence_threshold_pips'],
            min_sources=self.strategy['confluence_min_levels'],
        )

        # ── EMA trend for today ───────────────────────────────────────────────
        ema_row = None
        if self.ema_trend is not None and trade_date in self.ema_trend.index:
            ema_row = self.ema_trend.loc[trade_date]

        # ── Get 1m bars for the entry window ─────────────────────────────────
        day_mask = (
            (self.m1['london_date'] == trade_date) &
            (self.m1['london_hour'] >= self.strategy['entry_start_hour']) &
            (self.m1['london_hour'] <  self.strategy['entry_end_hour'])
        )
        day_bars = self.m1[day_mask]
        if day_bars.empty:
            return []

        trades:     list[Trade] = []
        open_trade: Optional[Trade] = None
        long_taken  = False
        short_taken = False

        for ts, bar in day_bars.iterrows():
            # Manage open trade first
            if open_trade is not None:
                closed = self._check_exit(open_trade, bar, ts)
                if closed is not None:
                    trades.append(closed)
                    open_trade = None
                continue

            # No new entries in final hour (EOD buffer)
            if bar['london_hour'] >= self.strategy['entry_end_hour'] - 1:
                continue

            # Long breakout
            if not long_taken and bar['close'] > asia['range_high']:
                trade = self._attempt_entry(
                    direction='LONG', bar=bar, ts=ts,
                    trade_date=trade_date, asia=asia,
                    confluences=confluences, ema_row=ema_row,
                )
                if trade is not None:
                    open_trade = trade
                    long_taken = True

            # Short breakout
            elif not short_taken and bar['close'] < asia['range_low']:
                trade = self._attempt_entry(
                    direction='SHORT', bar=bar, ts=ts,
                    trade_date=trade_date, asia=asia,
                    confluences=confluences, ema_row=ema_row,
                )
                if trade is not None:
                    open_trade = trade
                    short_taken = True

        # Force-close at session end
        if open_trade is not None:
            last_bar = day_bars.iloc[-1]
            open_trade.exit_price  = last_bar['close']
            open_trade.exit_time   = day_bars.index[-1]
            open_trade.exit_reason = 'eod'
            open_trade.set_pip_size(self.pip_size)
            trades.append(open_trade)

        return trades

    # ── Entry logic ───────────────────────────────────────────────────────────

    def _attempt_entry(
        self, direction: str, bar: pd.Series, ts,
        trade_date: date, asia: pd.Series,
        confluences: list, ema_row,
    ) -> Optional[Trade]:

        # 1. RVOL
        rvol = float(bar.get('rvol', 1.0))
        if rvol < self.strategy['rvol_min']:
            return None

        # 2. VWAP
        vwap       = bar.get('london_vwap', None)
        above_vwap = (vwap is not None) and not pd.isna(vwap) and (bar['close'] > float(vwap))
        if self.strategy.get('vwap_filter') and vwap is not None and not pd.isna(vwap):
            if direction == 'LONG'  and not above_vwap:
                return None
            if direction == 'SHORT' and above_vwap:
                return None

        # 3. EMA trend
        if self.strategy.get('ema_filter'):
            if not ema_allows_entry(ema_row, direction,
                                    require_both=self.strategy.get('ema_require_both', False)):
                return None

        # 4. Entry price
        entry_price = (bar['close'] + self.spread) if direction == 'LONG' else bar['close']

        # 5. Stop and target
        stop_price = self._calc_stop(direction, entry_price, asia)
        if stop_price is None:
            return None
        risk = abs(entry_price - stop_price)
        if risk == 0:
            return None
        target_price = (
            entry_price + risk * self.strategy['target_rr'] if direction == 'LONG'
            else entry_price - risk * self.strategy['target_rr']
        )

        # 6. Confluence
        cdist          = confluence_distance_pips(entry_price, confluences, self.pip_size)
        has_confluence = cdist <= self.strategy['confluence_threshold_pips']
        if self.strategy.get('confluence_filter') and not has_confluence:
            return None

        # Record which filters were active at entry (for analysis)
        pivot_in_confluence = (
            self.strategy.get('use_pivot_confluence') and
            any(len(c['levels']) >= self.strategy['confluence_min_levels']
                and any(src == len(fib_sets_order) - 1
                        for src, _, _ in c['levels'])
                for c in confluences)
        ) if confluences else False

        trade = Trade(
            pair=self.pair,
            trade_date=trade_date,
            direction=direction,
            entry_time=ts,
            entry_price=round(entry_price, 5),
            stop_price=round(stop_price, 5),
            target_price=round(target_price, 5),
            range_high=float(asia['range_high']),
            range_low=float(asia['range_low']),
            range_pips=float(asia['range_pips']),
            rvol_at_entry=round(rvol, 2),
            vwap_at_entry=round(float(vwap), 5) if (vwap is not None and not pd.isna(vwap)) else None,
            above_vwap=bool(above_vwap),
            has_confluence=has_confluence,
            confluence_distance=round(cdist, 1),
        )
        trade.set_pip_size(self.pip_size)
        return trade

    def _calc_stop(self, direction: str, entry_price: float, asia: pd.Series) -> Optional[float]:
        stop_type = self.strategy['stop_type']
        if stop_type == 'range_mid':
            stop = float(asia['range_mid'])
        elif stop_type == 'range_edge':
            stop = float(asia['range_low']) if direction == 'LONG' else float(asia['range_high'])
        else:
            return None

        if direction == 'LONG'  and stop >= entry_price:
            return None
        if direction == 'SHORT' and stop <= entry_price:
            return None
        return round(stop, 5)

    # ── Exit logic ────────────────────────────────────────────────────────────

    def _check_exit(self, trade: Trade, bar: pd.Series, ts) -> Optional[Trade]:
        if trade.direction == 'LONG':
            if bar['low'] <= trade.stop_price:
                trade.exit_price  = trade.stop_price
                trade.exit_time   = ts
                trade.exit_reason = 'stop'
                trade.set_pip_size(self.pip_size)
                return trade
            if bar['high'] >= trade.target_price:
                trade.exit_price  = trade.target_price
                trade.exit_time   = ts
                trade.exit_reason = 'target'
                trade.set_pip_size(self.pip_size)
                return trade
        else:
            if bar['high'] >= trade.stop_price:
                trade.exit_price  = trade.stop_price
                trade.exit_time   = ts
                trade.exit_reason = 'stop'
                trade.set_pip_size(self.pip_size)
                return trade
            if bar['low'] <= trade.target_price:
                trade.exit_price  = trade.target_price
                trade.exit_time   = ts
                trade.exit_reason = 'target'
                trade.set_pip_size(self.pip_size)
                return trade

        if bar['london_hour'] >= self.strategy['entry_end_hour']:
            trade.exit_price  = bar['close']
            trade.exit_time   = ts
            trade.exit_reason = 'eod'
            trade.set_pip_size(self.pip_size)
            return trade

        return None

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _prev_trading_date(self, d: date) -> date:
        prev = d - timedelta(days=1)
        while prev.weekday() >= 5:
            prev -= timedelta(days=1)
        return prev
