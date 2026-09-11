"""stops — the entry-time stop of a closed position, and the result in R.

The two facts that make a live trade comparable to a backtest at all
(MD files/LIVE_BACKTEST_ALIGNMENT.md §2.2). Before 2026-09-11 no live row
carried either, so no live trade could be expressed in R.

Shared by `Mt5Broker.serialize_closed_trades` AND the four bots that still run
their own module-level serialiser (Gold, GoldV2, ConfluenceBot,
backtestSystem) — one implementation, so the five cannot drift on what
"entry stop" means. Pure functions over the injected mt5 module; never raise.

WHY ORDER HISTORY. MT5 deals carry no sl/tp. Orders do, and every bot here
places its entry order WITH the stop (Mt5Broker.open, and the legacy bots'
own order_send calls). Trailing goes through TRADE_ACTION_SLTP, which creates
no order, so the position's EARLIEST order is the entry-time stop, unpolluted
by anything that happened afterwards.
"""
from __future__ import annotations


def entry_stop_from_orders(mt5_module, pid: int):
    """``(sl, tp)`` from the position's earliest order, or ``(None, None)``.
    A stop of 0 on the order means "placed naked" and is reported as None —
    0.0 is not a price and must not become an R denominator."""
    try:
        orders = mt5_module.history_orders_get(position=int(pid)) or []
        if not orders:
            return None, None
        entry = min(orders, key=lambda o: getattr(o, 'time_setup', 0))
        sl = float(getattr(entry, 'sl', 0) or 0)
        tp = float(getattr(entry, 'tp', 0) or 0)
        return (sl if sl > 0 else None), (tp if tp > 0 else None)
    except Exception:
        return None, None


def r_multiple(open_price, close_price, sl, is_long: bool):
    """Result in R — (exit − entry) ÷ (entry − stop), signed by direction.

    A pure PRICE ratio: no pip size, no contract size, no point value, so it
    cannot inherit this repo's pip-size drift (js/utils.js says Gold is 0.1,
    the registry says 1.0) and needs no per-instrument table. None whenever an
    input is missing or the stop sits on the entry."""
    try:
        if open_price is None or close_price is None or sl is None:
            return None
        risk = abs(float(open_price) - float(sl))
        if risk <= 0:
            return None
        move = (float(close_price) - float(open_price)) * (1 if is_long else -1)
        return round(move / risk, 3)
    except Exception:
        return None


def stop_fields(mt5_module, pid: int, open_price, close_price, is_long: bool,
                fallback_sltp=None) -> dict:
    """The four fields a closed-trade row gains, ready to splat into the dict.
    ``fallback_sltp`` is an optional ``(sl, tp)`` witnessed on the open position
    (a bot that opens naked and sets the stop by modify) — used only when the
    order carried no stop, and flagged as such in ``sl_source``."""
    sl, tp = entry_stop_from_orders(mt5_module, pid)
    source = 'order' if sl is not None else None
    if sl is None and fallback_sltp and fallback_sltp[0]:
        sl, tp, source = fallback_sltp[0], (fallback_sltp[1] or None), 'first_seen'
    return {
        'sl_at_entry': sl,
        'tp_at_entry': tp,
        'sl_source':   source,             # 'order' | 'first_seen' | None
        'r':           r_multiple(open_price, close_price, sl, is_long),
    }
