"""ServerClock — the one place that knows MT5 timestamps are NOT UTC.

MetaTrader5's `.time` fields (positions, deals, bars, ticks) are seconds since
the epoch measured on the **broker's wall clock**, not UTC. On the live account
that clock runs UTC+3 in summer, so `int(position.time)` is `realUTC + 10800`.
Everything that stamps a trade with `int(p.time)` and calls it UTC is therefore
3h fast, and everything that hands a real-UTC datetime to `copy_rates_range` /
`history_deals_get` is reading a 3h-shifted window (MT5 compares those against
the same server-clock epochs).

This brick measures the offset instead of assuming it, because it is NOT a
constant: brokers switch EET/EEST on their own schedule (a different hour to the
UK), and different MT5 accounts can sit on different servers. A hardcoded
constant is how `analysis/trade_analyzer.py` ended up an hour wrong all summer.

Usage:
    clock = ServerClock(mt5_module, log=log)
    clock.offset_sec()            # 10800, or None if it can't be measured yet
    clock.to_utc(pos.time)        # broker epoch -> true UTC epoch  (STORE this)
    clock.to_server(utc_epoch)    # true UTC epoch -> broker epoch  (QUERY with this)

`to_utc` / `to_server` return the input unchanged when the offset is unknown —
they never guess. Callers that persist a timestamp should publish
`offset_sec()` alongside it (`tz_offset_sec`) so a reader can tell a corrected
stamp from an uncorrected one rather than inferring.

Run tests:  python pylego/broker/clock_test.py
"""
from __future__ import annotations

import logging
import time

# Majors first: the freshest tick across several symbols is the closest read of
# the broker clock we can get without a dedicated server-time API.
DEFAULT_REF_SYMBOLS = ("EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "XAUUSD")

# Broker offsets are whole hours in practice; a few sit on :30. Rounding to the
# quarter-hour absorbs tick latency without ever inventing a fake half-hour.
ROUND_TO_SECS = 900

# Plausibility band for a broker clock. Anything outside it is a STALE quote
# (weekend/holiday: the last tick can be days old), not a real offset.
MIN_OFFSET_SECS = -12 * 3600
MAX_OFFSET_SECS = 14 * 3600

REMEASURE_SECS = 3600      # re-check hourly so a broker DST switch is picked up


def measure_offset_sec(mt5, symbols=DEFAULT_REF_SYMBOLS, now=None) -> int | None:
    """Broker clock minus real UTC, in seconds, rounded to the quarter-hour.

    Returns None when the offset can't be trusted — no MT5 module, no symbol
    yielding a tick, or every tick so stale that the market is plainly closed.
    None means "don't know", never "zero".
    """
    if mt5 is None:
        return None
    now = time.time() if now is None else float(now)
    stamps = []
    for sym in symbols:
        try:
            tick = mt5.symbol_info_tick(sym)
        except Exception:
            continue
        t = int(getattr(tick, "time", 0) or 0) if tick is not None else 0
        if t:
            stamps.append(t)
    if not stamps:
        return None
    raw = max(stamps) - now
    if not (MIN_OFFSET_SECS <= raw <= MAX_OFFSET_SECS):
        return None                      # stale quotes — market closed
    return int(round(raw / ROUND_TO_SECS) * ROUND_TO_SECS)


class ServerClock:
    """Cached, self-refreshing broker-clock offset.

    Injected `mt5` module and `clock` callable so it is offline-testable. Logs
    only on a CHANGE of offset (startup, broker DST switch) — never per tick.
    """

    def __init__(self, mt5=None, symbols=DEFAULT_REF_SYMBOLS, log=None,
                 clock=time.time, remeasure_secs: int = REMEASURE_SECS):
        self.mt5 = mt5
        self.symbols = tuple(symbols)
        self.log = log or logging.getLogger("pylego.broker.clock")
        self._clock = clock
        self._remeasure = int(remeasure_secs)
        self._offset: int | None = None
        self._measured_at: float = 0.0

    def offset_sec(self, force: bool = False) -> int | None:
        """Seconds to ADD to a real-UTC epoch to get a broker epoch.

        Keeps the last good value when a fresh measurement isn't available (the
        weekend case) — a known-stale offset beats silently reverting to 0.
        """
        now = self._clock()
        if not force and self._offset is not None and (now - self._measured_at) < self._remeasure:
            return self._offset
        measured = measure_offset_sec(self.mt5, self.symbols, now)
        if measured is None:
            self._measured_at = now      # don't re-probe a closed market every tick
            return self._offset
        if measured != self._offset:
            self.log.info(
                "broker server clock offset %s%dh%02dm vs UTC (was %s)",
                "+" if measured >= 0 else "-", abs(measured) // 3600,
                (abs(measured) % 3600) // 60,
                "unknown" if self._offset is None else f"{self._offset}s")
        self._offset, self._measured_at = measured, now
        return self._offset

    def to_utc(self, mt5_epoch):
        """Broker-clock epoch -> true UTC epoch. Unchanged when unknown/None."""
        off = self.offset_sec()
        if mt5_epoch is None or off is None:
            return mt5_epoch
        return int(mt5_epoch) - off

    def to_server(self, utc_epoch):
        """True UTC epoch -> broker-clock epoch, for MT5 range queries
        (`copy_rates_range`, `history_deals_get`), which compare against the
        broker's own epochs. Unchanged when unknown/None."""
        off = self.offset_sec()
        if utc_epoch is None or off is None:
            return utc_epoch
        return int(utc_epoch) + off
