"""Offline tests for the Mt5Broker brick, driven by a fake MT5 module.

The real MetaTrader5 package isn't available off the broker host, but the brick
takes the module as an injected dependency, so we can exercise its logic — magic
filtering, spread/duplicate blocks, paper mode, order success, the serialiser
payload shape — against a stub. No network, no MT5.

Run:  python pylego/broker/mt5_test.py   (or pytest)
"""
import sys
import time
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from pylego.broker.mt5 import Mt5Broker  # noqa: E402

MAGIC = 20260002


class FakeMt5:
    """Minimal stand-in for the MetaTrader5 module."""
    # constants
    ORDER_TYPE_BUY = 0
    ORDER_TYPE_SELL = 1
    TRADE_ACTION_DEAL = 1
    ORDER_TIME_GTC = 0
    ORDER_FILLING_FOK = 0
    ORDER_FILLING_IOC = 1
    ORDER_FILLING_RETURN = 2
    TRADE_RETCODE_DONE = 10009
    TRADE_RETCODE_TRADE_DISABLED = 10017
    TRADE_RETCODE_MARKET_CLOSED = 10018
    SYMBOL_TRADE_MODE_DISABLED = 0
    SYMBOL_TRADE_MODE_LONGONLY = 1
    SYMBOL_TRADE_MODE_SHORTONLY = 2
    SYMBOL_TRADE_MODE_CLOSEONLY = 3
    SYMBOL_TRADE_MODE_FULL = 4
    TIMEFRAME_M5 = 5
    TIMEFRAME_M30 = 30

    def __init__(self, positions=None, tick=None, deals=None, account=None,
                 filling_mode=2, send_result="done", bars=None, trade_mode=None, symbols=None):
        self._positions = positions or []
        self._tick = tick or SimpleNamespace(bid=1.10000, ask=1.10010)
        self._deals = deals or []
        self._account = account
        self._filling = filling_mode
        self._send_result = send_result
        self._bars = bars
        self._trade_mode = trade_mode          # None ⇒ omit (legacy symbol_info shape)
        self._symbols = symbols                # verify_symbols' account symbol list
        self.sent_orders = []

    def last_error(self): return (0, "ok")
    def initialize(self, path=None): return True
    def login(self, *a, **k): return True
    def shutdown(self): pass
    def account_info(self): return self._account
    def symbol_info(self, sym):
        attrs = dict(filling_mode=self._filling)
        if self._trade_mode is not None:
            attrs['trade_mode'] = self._trade_mode
        return SimpleNamespace(**attrs)
    def symbol_info_tick(self, sym): return self._tick
    def copy_rates_from_pos(self, sym, tf, start, count): return self._bars
    def symbols_get(self): return [SimpleNamespace(name=s) for s in (self._symbols or [])]

    def positions_get(self, symbol=None):
        return list(self._positions)

    def history_deals_get(self, a, b):
        return list(self._deals)

    def order_send(self, req):
        self.sent_orders.append(req)
        if self._send_result == "none":
            return None
        if self._send_result == "reject":
            return SimpleNamespace(retcode=10004, order=0, comment="rejected")
        if self._send_result == "disabled":
            return SimpleNamespace(retcode=self.TRADE_RETCODE_TRADE_DISABLED, order=0, comment="Trade disabled")
        return SimpleNamespace(retcode=self.TRADE_RETCODE_DONE, order=555111, comment="done")


def _broker(fake, pip=None):
    """``pip`` overrides the FX-shaped default — an index fixture quotes in whole
    points, so a 0.0001 pip would read its half-point spread as 5000 pips."""
    return Mt5Broker(
        magic=MAGIC,
        symbol_resolver=lambda p: p.replace('/', ''),
        pip_resolver=(lambda p: pip) if pip else (lambda p: 0.01 if 'JPY' in p else 0.0001),
        mt5_module=fake,
    )


def _pos(ticket, magic, **kw):
    base = dict(ticket=ticket, magic=magic, symbol='EURUSD', type=0, volume=0.5,
                price_open=1.1, price_current=1.1005, profit=2.5, swap=-0.1,
                time=1700000000, comment='x')
    base.update(kw)
    return SimpleNamespace(**base)


def test_serialize_open_filters_by_magic():
    fake = FakeMt5(positions=[_pos(1, MAGIC), _pos(2, 999), _pos(3, MAGIC, type=1)])
    rows = _broker(fake).serialize_open_positions()
    assert [r['ticket'] for r in rows] == [1, 3], rows
    assert rows[0]['direction'] == 'BUY' and rows[1]['direction'] == 'SELL'
    # contract field set (dashboard reads these by name — PYTHON_LEGO.md §7)
    for f in ('ticket', 'symbol', 'direction', 'lots', 'open_price', 'price',
              'profit', 'swap', 'time_open', 'comment'):
        assert f in rows[0], f


def test_serialize_closed_groups_deals():
    # Stamps must be relative to now: the serialiser asks MT5 for a deliberately
    # wide window and then keeps only closes landing on TODAY's real-UTC date,
    # so a frozen 2023 epoch would (correctly) be filtered straight back out.
    now = int(time.time())
    d_in = SimpleNamespace(magic=MAGIC, position_id=7, entry=0, type=0, price=1.1000,
                           time=now - 900, symbol='EURUSD', volume=0.5, profit=0,
                           swap=0, commission=0, comment='open')
    d_out = SimpleNamespace(magic=MAGIC, position_id=7, entry=1, type=1, price=1.1050,
                            time=now, symbol='EURUSD', volume=0.5, profit=25.0,
                            swap=-0.2, commission=-1.0, comment='close')
    d_other = SimpleNamespace(magic=999, position_id=8, entry=0, type=0, price=1.0,
                              time=1, symbol='X', volume=1, profit=0, swap=0,
                              commission=0, comment='')
    rows = _broker(FakeMt5(deals=[d_in, d_out, d_other])).serialize_closed_trades()
    assert len(rows) == 1, rows
    r = rows[0]
    assert r['position_id'] == 7 and r['direction'] == 'BUY'
    assert r['open_price'] == 1.1 and r['close_price'] == 1.105 and r['profit'] == 25.0
    for f in ('position_id', 'symbol', 'direction', 'lots', 'open_price', 'close_price',
              'profit', 'swap', 'commission', 'time_open', 'time_close', 'comment'):
        assert f in r, f


def test_serialized_rows_publish_the_broker_clock_offset():
    # MT5 stamps time_open/time_close on the BROKER's clock. Both serialisers must
    # ship the offset so a reader never has to assume the stamps are UTC.
    now = 1700000000
    tick = SimpleNamespace(bid=1.10000, ext=None, ask=1.10010, time=now + 3 * 3600)
    fake = FakeMt5(positions=[_pos(1, MAGIC)], tick=tick)
    b = _broker(fake)
    b.clock._clock = lambda: now
    assert b.server_offset_sec() == 3 * 3600
    assert b.serialize_open_positions()[0]['tz_offset_sec'] == 3 * 3600


def test_unmeasurable_offset_is_none_not_zero():
    # Closed market / no tick time: publishing 0 would assert "these stamps are
    # UTC", which is exactly the wrong claim. None means "unknown".
    fake = FakeMt5(positions=[_pos(1, MAGIC)])          # default tick has no .time
    assert fake and _broker(fake).serialize_open_positions()[0]['tz_offset_sec'] is None


def test_enter_paper_mode_sends_nothing():
    fake = FakeMt5()
    assert _broker(fake).enter('EUR/USD', 'LONG', 1.09, 1.11, 0.5, 2.0, paper_mode=True) == -1
    assert fake.sent_orders == []


def test_enter_spread_block():
    fake = FakeMt5(tick=SimpleNamespace(bid=1.10000, ask=1.10050))  # 5 pip spread
    assert _broker(fake).enter('EUR/USD', 'LONG', 1.09, 1.11, 0.5, 2.0, paper_mode=False) is None
    assert fake.sent_orders == []


def test_enter_duplicate_block():
    fake = FakeMt5(positions=[_pos(1, MAGIC)])
    assert _broker(fake).enter('EUR/USD', 'LONG', 1.09, 1.11, 0.5, 5.0, paper_mode=False) is None
    assert fake.sent_orders == []


UK100_TICK = SimpleNamespace(bid=10350.0, ask=10350.5)   # index-scale quote for the index fixtures


def test_enter_trade_disabled_skips_before_send():
    # Index outside its cash session: quotes still tick but trade_mode=DISABLED.
    # The guard must skip cleanly WITHOUT sending a doomed order (the uk100 10017 bug).
    fake = FakeMt5(trade_mode=FakeMt5.SYMBOL_TRADE_MODE_DISABLED, tick=UK100_TICK)
    assert _broker(fake, pip=1.0).enter('UK100', 'LONG', 10300, 10400, 2.0, 6.0, paper_mode=False) is None
    assert fake.sent_orders == []


def test_enter_longonly_blocks_short_allows_long():
    short = FakeMt5(trade_mode=FakeMt5.SYMBOL_TRADE_MODE_LONGONLY, tick=UK100_TICK)
    assert _broker(short, pip=1.0).enter('UK100', 'SHORT', 10500, 10200, 2.0, 6.0, paper_mode=False) is None
    assert short.sent_orders == []
    long_ = FakeMt5(trade_mode=FakeMt5.SYMBOL_TRADE_MODE_LONGONLY, tick=UK100_TICK)
    assert _broker(long_, pip=1.0).enter('UK100', 'LONG', 10300, 10400, 2.0, 6.0, paper_mode=False) == 555111
    assert len(long_.sent_orders) == 1


def test_enter_full_trade_mode_allows():
    fake = FakeMt5(trade_mode=FakeMt5.SYMBOL_TRADE_MODE_FULL)
    assert _broker(fake).enter('EUR/USD', 'LONG', 1.09, 1.11, 0.5, 5.0, paper_mode=False) == 555111


def test_enter_benign_rejection_returns_none():
    # trade_mode may stay FULL while the broker rejects at order time (10017/10018);
    # the failure path must still return None (and not raise) for these market-state codes.
    fake = FakeMt5(trade_mode=FakeMt5.SYMBOL_TRADE_MODE_FULL, send_result="disabled", tick=UK100_TICK)
    assert _broker(fake, pip=1.0).enter('UK100', 'LONG', 10300, 10400, 2.0, 6.0, paper_mode=False) is None
    assert len(fake.sent_orders) == 1


def test_enter_wrong_side_stops_skip_before_send():
    # A stop on the wrong side of the market is retcode 10016 "Invalid stops" — and a
    # caller whose trigger stays armed re-sends it every cooldown, forever (the OI bot's
    # max-pain buy against a stop stamped from a stale spot). Refuse it here instead.
    for direction, sl, tp, why in [('LONG', 10400, 10500, 'SL above the ask'),
                                   ('LONG', 10300, 10200, 'TP below the ask'),
                                   ('SHORT', 10300, 10200, 'SL below the bid'),
                                   ('SHORT', 10400, 10500, 'TP above the bid')]:
        fake = FakeMt5(trade_mode=FakeMt5.SYMBOL_TRADE_MODE_FULL, tick=UK100_TICK)
        b = _broker(fake, pip=1.0)
        assert b.enter('UK100', direction, sl, tp, 2.0, 6.0, paper_mode=False) is None, why
        assert fake.sent_orders == [], why
        assert b.last_reject_reason.startswith('invalid_stops_side'), why


def test_enter_sl_only_and_correct_sides_still_send():
    # The guard must not catch an SL-only order (tp=0) or a correctly-bracketed one.
    fake = FakeMt5(trade_mode=FakeMt5.SYMBOL_TRADE_MODE_FULL, tick=UK100_TICK)
    assert _broker(fake, pip=1.0).enter('UK100', 'LONG', 10300, 0, 2.0, 6.0, paper_mode=False) == 555111
    assert 'tp' not in fake.sent_orders[0]
    short = FakeMt5(trade_mode=FakeMt5.SYMBOL_TRADE_MODE_FULL, tick=UK100_TICK)
    assert _broker(short, pip=1.0).enter('UK100', 'SHORT', 10400, 10200, 2.0, 6.0, paper_mode=False) == 555111


def test_enter_success_returns_ticket():
    fake = FakeMt5()
    ticket = _broker(fake).enter('EUR/USD', 'LONG', 1.09, 1.11, 0.5, 5.0,
                                 paper_mode=False, comment='RegimeBot L')
    assert ticket == 555111
    assert len(fake.sent_orders) == 1
    o = fake.sent_orders[0]
    assert o['symbol'] == 'EURUSD' and o['magic'] == MAGIC
    assert o['type'] == FakeMt5.ORDER_TYPE_BUY and o['comment'] == 'RegimeBot L'
    assert o['tp'] == 1.11 and o['sl'] == 1.09


def test_stop_paper_and_missing():
    fake = FakeMt5(positions=[])
    b = _broker(fake)
    assert b.stop(-1, 'EUR/USD', paper_mode=True) is True          # paper
    assert b.stop(123, 'EUR/USD', paper_mode=False) is True        # already gone
    assert fake.sent_orders == []


def test_stop_success():
    fake = FakeMt5(positions=[_pos(42, MAGIC, type=0, volume=0.3)])
    ok = _broker(fake).stop(42, 'EUR/USD', paper_mode=False, reason='regime_shift', comment_prefix='RgCls')
    assert ok is True and len(fake.sent_orders) == 1
    o = fake.sent_orders[0]
    assert o['position'] == 42 and o['type'] == FakeMt5.ORDER_TYPE_SELL  # opposite of BUY
    # comment is sanitized to alnum+space (underscore stripped), matching regime_bot
    assert o['comment'] == 'RgCls regimeshift'


def test_filling_mode_selection():
    assert _broker(FakeMt5(filling_mode=1)).filling_mode('EURUSD') == FakeMt5.ORDER_FILLING_FOK
    assert _broker(FakeMt5(filling_mode=2)).filling_mode('EURUSD') == FakeMt5.ORDER_FILLING_IOC
    assert _broker(FakeMt5(filling_mode=4)).filling_mode('EURUSD') == FakeMt5.ORDER_FILLING_RETURN


def test_price_and_balance():
    fake = FakeMt5(tick=SimpleNamespace(bid=1.10000, ask=1.10020),
                   account=SimpleNamespace(balance=12345.67))
    b = _broker(fake)
    assert b.price('EUR/USD') == round((1.10000 + 1.10020) / 2, 6)
    assert b.account_balance() == 12345.67


def test_atr_ema():
    bars = [{'high': 1.1, 'low': 1.09, 'close': 1.095}] * 5
    val = _broker(FakeMt5(bars=bars)).atr('EUR/USD')
    assert val is not None and val > 0


def test_verify_symbols_all_clean():
    resolver = {'eurusd': 'EURUSD', 'gold': 'XAUUSD'}.get
    fake = FakeMt5(symbols=['EURUSD', 'XAUUSD', 'GBPUSD'])
    b = Mt5Broker(magic=MAGIC, symbol_resolver=resolver, pip_resolver=lambda p: 0.0001, mt5_module=fake)
    problems = b.verify_symbols(['eurusd', 'gold'])
    assert problems == []


def test_verify_symbols_finds_a_mismatch_and_suggests_the_real_name():
    # The exact real-world case that motivated this: a broker_symbols
    # override with wrong case and no underscore, when the account's real
    # symbol is upper-case with an underscore.
    resolver = {'eurusd': 'EURUSD', 'uk100': 'Uk100gbp'}.get
    fake = FakeMt5(symbols=['EURUSD', 'UK100_GBP', 'US30_USD'])
    b = Mt5Broker(magic=MAGIC, symbol_resolver=resolver, pip_resolver=lambda p: 0.0001, mt5_module=fake)
    problems = b.verify_symbols(['eurusd', 'uk100'])
    assert len(problems) == 1, problems
    p = problems[0]
    assert p['pair'] == 'uk100' and p['configured'] == 'Uk100gbp'
    assert 'UK100_GBP' in p['suggestions'], p['suggestions']


def test_verify_symbols_no_suggestion_when_nothing_is_close():
    resolver = {'nzdcad': 'NZDCAD_WRONG'}.get
    fake = FakeMt5(symbols=['EURUSD', 'GBPUSD'])   # nothing resembling NZDCAD at all
    b = Mt5Broker(magic=MAGIC, symbol_resolver=resolver, pip_resolver=lambda p: 0.0001, mt5_module=fake)
    problems = b.verify_symbols(['nzdcad'])
    assert len(problems) == 1 and problems[0]['suggestions'] == []


def test_verify_symbols_empty_account_symbol_list_skips_check_not_crashes():
    resolver = {'eurusd': 'EURUSD'}.get
    fake = FakeMt5(symbols=[])   # symbols_get() returned nothing (e.g. not fully connected yet)
    b = Mt5Broker(magic=MAGIC, symbol_resolver=resolver, pip_resolver=lambda p: 0.0001, mt5_module=fake)
    assert b.verify_symbols(['eurusd']) == []


def test_unavailable_broker_is_safe():
    # No mt5 module injected and import fails on this host → available False,
    # everything degrades gracefully (no crash).
    b = Mt5Broker(magic=MAGIC, symbol_resolver=lambda p: p, pip_resolver=lambda p: 0.0001)
    if not b.available:
        assert b.price('EUR/USD') is None
        assert b.account_balance() is None
        assert b.serialize_open_positions() == []
        assert b.serialize_closed_trades() == []
        assert b.connect('1', 'pw', 'srv') is False


# ── sl_at_entry / r (2026-09-11) ─────────────────────────────────────────────

class FakeMt5WithOrders(FakeMt5):
    """FakeMt5 plus order history, keyed by position id."""
    def __init__(self, *a, orders=None, **kw):
        super().__init__(*a, **kw)
        self._orders = orders or {}
    def history_orders_get(self, position=None, **kw):
        return list(self._orders.get(position, []))


def _deals_for(pid, direction, open_px, close_px, now):
    d_in = SimpleNamespace(magic=MAGIC, position_id=pid, entry=0, type=0 if direction == 'BUY' else 1,
                           price=open_px, time=now - 900, symbol='EURUSD', volume=0.5, profit=0,
                           swap=0, commission=0, comment='open')
    d_out = SimpleNamespace(magic=MAGIC, position_id=pid, entry=1, type=1 if direction == 'BUY' else 0,
                            price=close_px, time=now, symbol='EURUSD', volume=0.5, profit=25.0,
                            swap=-0.2, commission=-1.0, comment='close')
    return [d_in, d_out]


def test_closed_row_carries_entry_stop_from_order_history():
    now = int(time.time())
    entry_order = SimpleNamespace(sl=1.0950, tp=1.1100, time_setup=now - 900, type=0)
    fake = FakeMt5WithOrders(deals=_deals_for(7, 'BUY', 1.1000, 1.1050, now), orders={7: [entry_order]})
    r = _broker(fake).serialize_closed_trades()[0]
    assert r['sl_at_entry'] == 1.095 and r['tp_at_entry'] == 1.11, r
    assert r['sl_source'] == 'order'
    # BUY: entry 1.1000, stop 1.0950 (risk 0.0050), exit 1.1050 (move +0.0050) -> +1.0R
    assert r['r'] == 1.0, r['r']


def test_r_is_signed_by_direction():
    now = int(time.time())
    # SELL: entry 1.1000, stop 1.1020 (risk 0.0020), exit 1.1010 -> move against by 0.0010 -> -0.5R
    entry_order = SimpleNamespace(sl=1.1020, tp=0, time_setup=now - 900, type=1)
    fake = FakeMt5WithOrders(deals=_deals_for(8, 'SELL', 1.1000, 1.1010, now), orders={8: [entry_order]})
    r = _broker(fake).serialize_closed_trades()[0]
    assert r['r'] == -0.5, r['r']
    assert r['tp_at_entry'] is None          # tp=0 on the order means "no target", not 0.0


def test_entry_order_is_the_EARLIEST_order_not_the_last():
    # Trailing does not create orders, but a partial close or a re-entry can.
    # The entry stop is the FIRST order's, whatever came after.
    now = int(time.time())
    first = SimpleNamespace(sl=1.0900, tp=0, time_setup=now - 900, type=0)
    later = SimpleNamespace(sl=1.1040, tp=0, time_setup=now - 100, type=1)   # a close order
    fake = FakeMt5WithOrders(deals=_deals_for(9, 'BUY', 1.1000, 1.1050, now), orders={9: [later, first]})
    r = _broker(fake).serialize_closed_trades()[0]
    assert r['sl_at_entry'] == 1.09, r


def test_naked_entry_falls_back_to_first_seen_stop():
    # Entry order had sl=0 (bot sets the stop by modify). The broker saw the
    # position open earlier with sl=1.0980 — that is the best available entry stop.
    now = int(time.time())
    naked = SimpleNamespace(sl=0, tp=0, time_setup=now - 900, type=0)
    fake = FakeMt5WithOrders(deals=_deals_for(10, 'BUY', 1.1000, 1.1050, now), orders={10: [naked]},
                             positions=[SimpleNamespace(ticket=10, symbol='EURUSD', type=0, volume=0.5,
                                                        price_open=1.1, price_current=1.1, profit=0, swap=0,
                                                        time=now - 900, comment='', magic=MAGIC, sl=1.0980, tp=1.1200)])
    b = _broker(fake)
    b.serialize_open_positions()             # first sight -> cache
    r = b.serialize_closed_trades()[0]
    assert r['sl_at_entry'] == 1.098 and r['sl_source'] == 'first_seen', r
    assert r['r'] == 2.5                      # move 0.0050 / risk 0.0020


def test_no_stop_anywhere_is_null_never_a_guess():
    now = int(time.time())
    fake = FakeMt5WithOrders(deals=_deals_for(11, 'BUY', 1.1000, 1.1050, now), orders={})
    r = _broker(fake).serialize_closed_trades()[0]
    assert r['sl_at_entry'] is None and r['tp_at_entry'] is None and r['sl_source'] is None and r['r'] is None, r


def test_fake_without_order_history_at_all_still_serialises():
    # The plain FakeMt5 has no history_orders_get. That must degrade to nulls,
    # not blank the whole status payload.
    now = int(time.time())
    r = _broker(FakeMt5(deals=_deals_for(12, 'BUY', 1.1000, 1.1050, now))).serialize_closed_trades()[0]
    assert r['position_id'] == 12 and r['r'] is None


def test_open_positions_carry_current_stop():
    now = 1700000000
    pos = SimpleNamespace(ticket=1, symbol='EURUSD', type=0, volume=0.5, price_open=1.1, price_current=1.1,
                          profit=0, swap=0, time=now, comment='', magic=MAGIC, sl=1.0950, tp=1.1100)
    fake = FakeMt5(positions=[pos], tick=SimpleNamespace(bid=1.1, ask=1.1001, time=now))
    row = _broker(fake).serialize_open_positions()[0]
    assert row['sl'] == 1.095 and row['tp'] == 1.11, row


def test_open_position_with_no_stop_reports_none_not_zero():
    now = 1700000000
    pos = SimpleNamespace(ticket=2, symbol='EURUSD', type=0, volume=0.5, price_open=1.1, price_current=1.1,
                          profit=0, swap=0, time=now, comment='', magic=MAGIC, sl=0.0, tp=0.0)
    fake = FakeMt5(positions=[pos], tick=SimpleNamespace(bid=1.1, ask=1.1001, time=now))
    row = _broker(fake).serialize_open_positions()[0]
    assert row['sl'] is None and row['tp'] is None, row


def test_r_multiple_edge_cases():
    f = Mt5Broker._r_multiple
    assert f(1.1, 1.105, 1.095, True) == 1.0
    assert f(1.1, 1.095, 1.105, False) == 1.0       # short that reached +1R
    assert f(1.1, 1.105, 1.1, True) is None         # stop on entry -> undefined
    assert f(None, 1.1, 1.09, True) is None
    assert f(1.1, 1.1, 1.09, True) == 0.0


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for t in tests:
        t(); print(f"  ok  {t.__name__}")
    print(f"\n{len(tests)} tests passed.")
