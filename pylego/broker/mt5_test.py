"""Offline tests for the Mt5Broker brick, driven by a fake MT5 module.

The real MetaTrader5 package isn't available off the broker host, but the brick
takes the module as an injected dependency, so we can exercise its logic — magic
filtering, spread/duplicate blocks, paper mode, order success, the serialiser
payload shape — against a stub. No network, no MT5.

Run:  python pylego/broker/mt5_test.py   (or pytest)
"""
import sys
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
                 filling_mode=2, send_result="done", bars=None, trade_mode=None):
        self._positions = positions or []
        self._tick = tick or SimpleNamespace(bid=1.10000, ask=1.10010)
        self._deals = deals or []
        self._account = account
        self._filling = filling_mode
        self._send_result = send_result
        self._bars = bars
        self._trade_mode = trade_mode          # None ⇒ omit (legacy symbol_info shape)
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


def _broker(fake):
    return Mt5Broker(
        magic=MAGIC,
        symbol_resolver=lambda p: p.replace('/', ''),
        pip_resolver=lambda p: 0.01 if 'JPY' in p else 0.0001,
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
    d_in = SimpleNamespace(magic=MAGIC, position_id=7, entry=0, type=0, price=1.1000,
                           time=1700000000, symbol='EURUSD', volume=0.5, profit=0,
                           swap=0, commission=0, comment='open')
    d_out = SimpleNamespace(magic=MAGIC, position_id=7, entry=1, type=1, price=1.1050,
                            time=1700000900, symbol='EURUSD', volume=0.5, profit=25.0,
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


def test_enter_trade_disabled_skips_before_send():
    # Index outside its cash session: quotes still tick but trade_mode=DISABLED.
    # The guard must skip cleanly WITHOUT sending a doomed order (the uk100 10017 bug).
    fake = FakeMt5(trade_mode=FakeMt5.SYMBOL_TRADE_MODE_DISABLED)
    assert _broker(fake).enter('UK100', 'LONG', 10300, 10400, 2.0, 6.0, paper_mode=False) is None
    assert fake.sent_orders == []


def test_enter_longonly_blocks_short_allows_long():
    short = FakeMt5(trade_mode=FakeMt5.SYMBOL_TRADE_MODE_LONGONLY)
    assert _broker(short).enter('UK100', 'SHORT', 10500, 10400, 2.0, 6.0, paper_mode=False) is None
    assert short.sent_orders == []
    long_ = FakeMt5(trade_mode=FakeMt5.SYMBOL_TRADE_MODE_LONGONLY)
    assert _broker(long_).enter('UK100', 'LONG', 10300, 10400, 2.0, 6.0, paper_mode=False) == 555111
    assert len(long_.sent_orders) == 1


def test_enter_full_trade_mode_allows():
    fake = FakeMt5(trade_mode=FakeMt5.SYMBOL_TRADE_MODE_FULL)
    assert _broker(fake).enter('EUR/USD', 'LONG', 1.09, 1.11, 0.5, 5.0, paper_mode=False) == 555111


def test_enter_benign_rejection_returns_none():
    # trade_mode may stay FULL while the broker rejects at order time (10017/10018);
    # the failure path must still return None (and not raise) for these market-state codes.
    fake = FakeMt5(trade_mode=FakeMt5.SYMBOL_TRADE_MODE_FULL, send_result="disabled")
    assert _broker(fake).enter('UK100', 'LONG', 10300, 10400, 2.0, 6.0, paper_mode=False) is None
    assert len(fake.sent_orders) == 1


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


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for t in tests:
        t(); print(f"  ok  {t.__name__}")
    print(f"\n{len(tests)} tests passed.")
