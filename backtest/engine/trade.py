"""Trade record — one instance per executed trade."""

from __future__ import annotations
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Optional


@dataclass
class Trade:
    # Identity
    pair:        str
    trade_date:  date          # London calendar date of entry
    direction:   str           # 'LONG' or 'SHORT'

    # Entry
    entry_time:  datetime      # UTC bar open time
    entry_price: float         # actual fill price (bid + spread for longs)

    # Levels
    stop_price:   float
    target_price: float

    # Asia range context
    range_high:  float
    range_low:   float
    range_pips:  float

    # Volume filters at entry
    rvol_at_entry: float
    vwap_at_entry: Optional[float]
    above_vwap:    bool

    # Confluence context
    has_confluence:      bool  = False
    confluence_distance: float = float('inf')  # pips to nearest confluence

    # Exit (filled after simulation)
    exit_time:   Optional[datetime] = None
    exit_price:  Optional[float]    = None
    exit_reason: Optional[str]      = None  # 'target' | 'stop' | 'eod' | 'reversal'

    # ── Derived metrics (computed on demand) ─────────────────────────────────

    @property
    def risk_pips(self) -> float:
        return abs(self.entry_price - self.stop_price) / self._pip_size

    @property
    def reward_pips(self) -> float:
        return abs(self.target_price - self.entry_price) / self._pip_size

    @property
    def pnl_pips(self) -> Optional[float]:
        if self.exit_price is None:
            return None
        raw = (self.exit_price - self.entry_price) if self.direction == 'LONG' \
              else (self.entry_price - self.exit_price)
        return raw / self._pip_size

    @property
    def r_multiple(self) -> Optional[float]:
        if self.pnl_pips is None or self.risk_pips == 0:
            return None
        return self.pnl_pips / self.risk_pips

    @property
    def won(self) -> Optional[bool]:
        if self.pnl_pips is None:
            return None
        return self.pnl_pips > 0

    # Internal — set by BacktestEngine after construction
    _pip_size: float = field(default=0.0001, repr=False)

    def set_pip_size(self, pip_size: float) -> None:
        object.__setattr__(self, '_pip_size', pip_size)

    def __repr__(self) -> str:
        status = f'{self.pnl_pips:+.1f}p ({self.exit_reason})' if self.exit_price else 'OPEN'
        return (f'Trade({self.pair} {self.direction} {self.trade_date} '
                f'entry={self.entry_price:.5f} stop={self.stop_price:.5f} '
                f'target={self.target_price:.5f} | {status})')
