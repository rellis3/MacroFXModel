"""
Main backtest engine.

Strategy: Asia Range Breakout
-------------------------------
1. Build Asia range from 5m bars (00:00-06:00 London).
2. From London open (08:00), monitor 1m bars for a breakout above/below range.
3. Entry filters:
     a. RVOL >= rvol_min on the breakout bar
     b. Price on correct side of London VWAP (if vwap_filter=True)
     c. Near a fib confluence (if confluence_filter=True)
4. Stop: midpoint of Asia range (default) or far edge of range.
5. Target: entry +/- (entry - stop) * target_rr
6. Exit: stop hit, target hit, or 17:00 London EOD close.

No lookahead: Asia range is fully closed before London opens. All volume
indicators are computed from prior bars only.
"""

from __future__ import annotations

import pandas as pd
import numpy as np
from datetime import date, timedelta
from typing import Optional

from core.sessions import get_asia_ranges, get_monday_ranges, get_prev_monday_range
from core.fibs import project_fibs, find_confluences, confluence_distance_pips
from engine.trade import Trade


class BacktestEngine:

    def __init__(self, pair: str, pair_cfg: dict, data: dict, strategy: dict):
        self.pair       = pair
        self.pair_cfg   = pair_cfg
        self.pip_size   = pair_cfg['pip_size']
        self.spread     = pair_cfg['spread_pips'] * pair_cfg['pip_size']
        self.strategy   = strategy
        self.m1         = data['m1']   # 1m bars with volume indicators already computed
        self.m5         = data['m5']
        self.m30        = data['m30']

        self.asia_ranges   = get_asia_ranges(self.m5, self.pip_size,
                                              strategy['min_range_pips'],
                                              strategy['max_range_pips'])
        self.monday_ranges = get_monday_ranges(self.m30, self.pip_size)

    # ── Public entry point ────────────────────────────────────────────────────

    def run(self) -> list[Trade]:
        trades: list[Trade] = []

        trading_dates = sorted(self.asia_ranges[self.asia_ranges['valid']].index)
        total = len(trading_dates)

        for i, trade_date in enumerate(trading_dates):
            if i % 100 == 0:
                print(f'  Day {i}/{total}  ({trade_date})')

            day_trades = self._simulate_day(trade_date)
            trades.extend(day_trades)

        print(f'  Complete — {len(trades)} trades generated.')
        return trades

    # ── Day simulation ────────────────────────────────────────────────────────

    def _simulate_day(self, trade_date: date) -> list[Trade]:
        asia = self.asia_ranges.loc[trade_date]

        # Build fib confluence sets from today + yesterday + nearest Monday
        today_fibs = project_fibs(asia['range_high'], asia['range_low'])
        fib_sets   = [today_fibs]

        prev_date = self._prev_trading_date(trade_date)
        if prev_date in self.asia_ranges.index and self.asia_ranges.loc[prev_date, 'valid']:
            prev_asia = self.asia_ranges.loc[prev_date]
            fib_sets.append(project_fibs(prev_asia['range_high'], prev_asia['range_low']))

        monday_range = get_prev_monday_range(self.monday_ranges, trade_date)
        if monday_range is not None:
            fib_sets.append(project_fibs(monday_range['range_high'], monday_range['range_low']))

        confluences = find_confluences(
            fib_sets,
            pip_size=self.pip_size,
            threshold_pips=self.strategy['confluence_threshold_pips'],
            min_sources=self.strategy['confluence_min_levels'],
        )

        # Get 1m bars for this London date, during the entry window
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
            # ── Manage open trade ─────────────────────────────────────────────
            if open_trade is not None:
                result = self._check_exit(open_trade, bar, ts)
                if result is not None:
                    open_trade = result
                    trades.append(open_trade)
                    open_trade = None
                continue   # no new entries while a trade is open

            # ── Check for EOD — close any lingering open trade ─────────────
            if bar['london_hour'] >= self.strategy['entry_end_hour'] - 1:
                # Last hour — no new entries
                continue

            # ── Long breakout: close above range_high ─────────────────────
            if not long_taken and bar['close'] > asia['range_high']:
                trade = self._attempt_entry(
                    direction='LONG', bar=bar, ts=ts,
                    trade_date=trade_date, asia=asia,
                    confluences=confluences,
                )
                if trade is not None:
                    open_trade = trade
                    long_taken = True

            # ── Short breakout: close below range_low ─────────────────────
            elif not short_taken and bar['close'] < asia['range_low']:
                trade = self._attempt_entry(
                    direction='SHORT', bar=bar, ts=ts,
                    trade_date=trade_date, asia=asia,
                    confluences=confluences,
                )
                if trade is not None:
                    open_trade = trade
                    short_taken = True

        # Force-close any trade still open at end of session
        if open_trade is not None:
            eod_bar = day_bars.iloc[-1]
            open_trade.exit_price  = eod_bar['close']
            open_trade.exit_time   = day_bars.index[-1]
            open_trade.exit_reason = 'eod'
            open_trade.set_pip_size(self.pip_size)
            trades.append(open_trade)

        return trades

    # ── Entry logic ───────────────────────────────────────────────────────────

    def _attempt_entry(self, direction: str, bar: pd.Series, ts,
                       trade_date: date, asia: pd.Series,
                       confluences: list) -> Optional[Trade]:

        # ── RVOL filter ───────────────────────────────────────────────────────
        rvol = bar.get('rvol', 1.0)
        if rvol < self.strategy['rvol_min']:
            return None

        # ── VWAP filter ───────────────────────────────────────────────────────
        vwap = bar.get('london_vwap', None)
        above_vwap = (vwap is not None) and (bar['close'] > vwap)
        if self.strategy['vwap_filter'] and vwap is not None:
            if direction == 'LONG'  and not above_vwap:
                return None
            if direction == 'SHORT' and above_vwap:
                return None

        # ── Entry price (add spread for longs, no spread for shorts on bid) ──
        entry_price = (bar['close'] + self.spread) if direction == 'LONG' else bar['close']

        # ── Stop and target ───────────────────────────────────────────────────
        stop_price = self._calc_stop(direction, entry_price, asia)
        if stop_price is None:
            return None

        risk      = abs(entry_price - stop_price)
        if risk == 0:
            return None

        target_price = (entry_price + risk * self.strategy['target_rr']) if direction == 'LONG' \
                  else (entry_price - risk * self.strategy['target_rr'])

        # ── Confluence filter ─────────────────────────────────────────────────
        cdist = confluence_distance_pips(entry_price, confluences, self.pip_size)
        has_confluence = cdist <= self.strategy['confluence_threshold_pips']

        if self.strategy['confluence_filter'] and not has_confluence:
            return None

        trade = Trade(
            pair=self.pair,
            trade_date=trade_date,
            direction=direction,
            entry_time=ts,
            entry_price=round(entry_price, 5),
            stop_price=round(stop_price, 5),
            target_price=round(target_price, 5),
            range_high=asia['range_high'],
            range_low=asia['range_low'],
            range_pips=asia['range_pips'],
            rvol_at_entry=round(float(rvol), 2),
            vwap_at_entry=round(float(vwap), 5) if vwap is not None else None,
            above_vwap=bool(above_vwap),
            has_confluence=has_confluence,
            confluence_distance=round(cdist, 1),
        )
        trade.set_pip_size(self.pip_size)
        return trade

    def _calc_stop(self, direction: str, entry_price: float,
                   asia: pd.Series) -> Optional[float]:
        stop_type = self.strategy['stop_type']

        if stop_type == 'range_mid':
            stop = asia['range_mid']
        elif stop_type == 'range_edge':
            stop = asia['range_low'] if direction == 'LONG' else asia['range_high']
        else:
            return None

        # Sanity: stop must be on the correct side of entry
        if direction == 'LONG'  and stop >= entry_price:
            return None
        if direction == 'SHORT' and stop <= entry_price:
            return None

        return round(stop, 5)

    # ── Exit logic ────────────────────────────────────────────────────────────

    def _check_exit(self, trade: Trade, bar: pd.Series, ts) -> Optional[Trade]:
        """
        Check if the bar closes out the trade.
        Uses bar.low for stop checks (long) and bar.high for target checks (long).
        Conservative: if both stop and target are touched in the same bar, stop wins.
        """
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

        else:  # SHORT
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

        # EOD forced close
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
        while prev.weekday() >= 5:   # skip Saturday (5) and Sunday (6)
            prev -= timedelta(days=1)
        return prev
