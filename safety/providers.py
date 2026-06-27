"""
Account providers — how the RiskGate learns the current account state.

The gate is deliberately decoupled from MT5: it asks an AccountProvider for an
AccountSnapshot and never imports MetaTrader5 itself. This keeps the gate
testable (FakeAccountProvider) and lets the real MT5 adapter live in the bot
process that already owns the MT5 connection.

For A1 we ship only FakeAccountProvider. A real MT5AccountProvider is a thin
adapter the bot supplies later — its expected shape is documented at the bottom
of this file so wiring it in is mechanical.
"""

from __future__ import annotations

from typing import Protocol

from .risk_gate import AccountSnapshot


class AccountProvider(Protocol):
    """Anything that can report the current account state to the gate."""
    def snapshot(self) -> AccountSnapshot: ...


class FakeAccountProvider:
    """
    Deterministic provider for tests / paper / demo. Hand it a snapshot (or a
    list of snapshots to play back in sequence) and it returns them on demand.
    """

    def __init__(self, snapshot: AccountSnapshot | list[AccountSnapshot]):
        if isinstance(snapshot, list):
            self._queue = list(snapshot)
            self._last = self._queue[0] if self._queue else None
        else:
            self._queue = []
            self._last = snapshot

    def snapshot(self) -> AccountSnapshot:
        if self._queue:
            self._last = self._queue.pop(0)
        return self._last


# ──────────────────────────────────────────────────────────────────────────────
# Reference shape for the real adapter (NOT imported here — keeps this file free
# of any MetaTrader5 dependency). The bot that owns the MT5 connection provides
# something like this when it's ready to wire the gate in:
#
#   import MetaTrader5 as mt5
#   from safety import AccountSnapshot, Position
#
#   class MT5AccountProvider:
#       def snapshot(self) -> AccountSnapshot:
#           acct = mt5.account_info()
#           positions = []
#           for p in (mt5.positions_get() or []):
#               positions.append(Position(
#                   magic=p.magic,
#                   symbol=p.symbol,
#                   side='BUY' if p.type == mt5.ORDER_TYPE_BUY else 'SELL',
#                   volume=float(p.volume),
#                   notional=abs(float(p.volume) * float(p.price_open)),
#                   risk_bucket=None,            # optional: map symbol -> bucket
#               ))
#           return AccountSnapshot(
#               equity=float(acct.equity),
#               balance=float(acct.balance),
#               positions=positions,
#           )
# ──────────────────────────────────────────────────────────────────────────────
