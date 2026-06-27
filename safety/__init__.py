"""
safety — Trading Safety Layer (Layer A)

A self-contained, additive package implementing the central account-aware risk
gate and global kill switch described in TRADING_SAFETY_LAYER.md.

IMPORTANT — this package is INERT by default. Importing it changes nothing.
It does not touch MT5, the dashboard, the existing bots, or any running system
until you explicitly construct a RiskGate / KillSwitch and call it from a bot.
See safety/README.md for the (opt-in, ~10 line) wiring instructions.

Public API:
    KillSwitch, KillState            — global stop button (file-backed by default)
    RiskGate, Decision, RiskLimits   — the one place that can say "no" to an order
    OrderIntent, Position, AccountSnapshot
    FakeAccountProvider              — for tests / paper / demo
"""

from .kill_switch import KillSwitch, KillState
from .risk_gate import (
    RiskGate,
    Decision,
    RiskLimits,
    OrderIntent,
    Position,
    AccountSnapshot,
)
from .providers import AccountProvider, FakeAccountProvider

__all__ = [
    "KillSwitch",
    "KillState",
    "RiskGate",
    "Decision",
    "RiskLimits",
    "OrderIntent",
    "Position",
    "AccountSnapshot",
    "AccountProvider",
    "FakeAccountProvider",
]

__version__ = "0.1.0"
