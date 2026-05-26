"""
Trade State Machine — WAITING → ARMED → TRIGGERED → MANAGING → EXITED → COOLDOWN
One paper trade at a time. Cooldown prevents back-to-back entries.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Optional


class State(str, Enum):
    WAITING   = 'WAITING'
    ARMED     = 'ARMED'
    TRIGGERED = 'TRIGGERED'
    MANAGING  = 'MANAGING'
    EXITED    = 'EXITED'
    COOLDOWN  = 'COOLDOWN'


@dataclass
class ActiveTrade:
    zone_id: str
    direction: str        # LONG | SHORT
    entry_price: float
    sl: float
    tp1: float
    tp2: float
    lot_size: float
    entry_time: datetime
    tp1_hit: bool = False
    result: Optional[str] = None
    close_price: Optional[float] = None
    pnl_pips: float = 0.0

    def check_outcome(self, price: float) -> Optional[str]:
        if self.direction == 'LONG':
            if not self.tp1_hit and price >= self.tp1:
                self.tp1_hit = True
                return 'TP1_HIT'
            if price >= self.tp2:
                return 'TP2_HIT'
            if price <= self.sl:
                return 'SL_HIT'
        else:
            if not self.tp1_hit and price <= self.tp1:
                self.tp1_hit = True
                return 'TP1_HIT'
            if price <= self.tp2:
                return 'TP2_HIT'
            if price >= self.sl:
                return 'SL_HIT'
        return None


@dataclass
class BotState:
    state: State = State.WAITING
    armed_zone_id: Optional[str] = None
    active_trade: Optional[ActiveTrade] = None
    cooldown_until: Optional[datetime] = None
    last_change: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    # Unix timestamp (float) of when price first entered the GP window of the armed zone.
    # Reset to None whenever the zone is disarmed. Passed to VuManChu so divergence is
    # evaluated only from the entry bar onwards rather than the whole lookback window.
    zone_gp_entry_time: Optional[float] = None

    def transition(self, new_state: State) -> None:
        self.state = new_state
        self.last_change = datetime.now(timezone.utc)

    def is_in_cooldown(self) -> bool:
        if self.state != State.COOLDOWN:
            return False
        if self.cooldown_until and datetime.now(timezone.utc) >= self.cooldown_until:
            self.state = State.WAITING
            self.cooldown_until = None
            return False
        return True

    def to_dict(self) -> dict:
        trade = None
        if self.active_trade:
            t = self.active_trade
            trade = {
                'zone_id': t.zone_id, 'direction': t.direction,
                'entry_price': t.entry_price, 'sl': t.sl,
                'tp1': t.tp1, 'tp2': t.tp2,
                'entry_time': t.entry_time.isoformat(),
                'tp1_hit': t.tp1_hit, 'result': t.result,
                'pnl_pips': t.pnl_pips,
            }
        return {
            'state': self.state.value,
            'armed_zone_id': self.armed_zone_id,
            'active_trade': trade,
            'cooldown_until': self.cooldown_until.isoformat() if self.cooldown_until else None,
            'last_change': self.last_change.isoformat(),
            'zone_gp_entry_time': self.zone_gp_entry_time,
        }
