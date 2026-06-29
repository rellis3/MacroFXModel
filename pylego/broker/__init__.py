"""pylego.broker — MT5 execution bricks for the bots.

`Mt5Broker` is the shared "connect to MT5 / enter trade / stop trade" brick,
plus the position serialisers that feed the dashboard positions tab (see
PYTHON_LEGO.md §7). Magic number, symbol resolver, pip resolver, logger and the
MetaTrader5 module itself are all injected, so the brick is reusable across bots
and testable offline against a fake MT5.
"""
from pylego.broker.mt5 import Mt5Broker

__all__ = ["Mt5Broker"]
