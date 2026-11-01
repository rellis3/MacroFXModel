"""Resolver + template-row tests on synthetic M1 bars.

Run: python3 SignalCopier/test_outcome.py
"""
from outcome import TEMPLATE_HEADER, resolve, template_row, to_csv

T0 = 1793343600            # 2026-10-30 07:00 UTC (= 07:00 UK, GMT)


def bar(m, o, h, l, c):
    return {'time': T0 + 60 * m, 'open': o, 'high': h, 'low': l, 'close': c}


SELL_LIMIT = {'id': '101:7', 'symbol': 'NAS100', 'side': 'SELL', 'order': 'limit', 'entry': 28965,
              'sl': 29096, 'tp': 28703, 'posted_ts': T0 + 30, 'cancel_ts': T0 + 6 * 3600, 'style': 'day'}


def test_limit_never_reached_is_unfilled_at_cancel():
    bars = [bar(i, 28860, 28900, 28850, 28870) for i in range(1, 400)]
    assert resolve(SELL_LIMIT, bars)['state'] == 'unfilled'


def test_limit_waits_while_cancel_time_ahead():
    bars = [bar(i, 28860, 28900, 28850, 28870) for i in range(1, 10)]
    assert resolve(SELL_LIMIT, bars)['state'] == 'waiting'


def test_limit_past_cancel_with_no_later_bars_is_unfilled_given_now():
    bars = [bar(i, 28860, 28900, 28850, 28870) for i in range(1, 10)]
    assert resolve(SELL_LIMIT, bars, now=T0 + 7 * 3600)['state'] == 'unfilled'


def test_limit_fill_then_tp():
    bars = [bar(1, 28900, 28970, 28890, 28960),      # trades through 28,965 -> filled
            bar(2, 28960, 29000, 28940, 28990),      # worst 29,000 (35 pts against)
            bar(3, 28990, 28995, 28700, 28710)]      # TP 28,703
    o = resolve(SELL_LIMIT, bars, spread=2.0)
    assert (o['state'], o['fill_px'], o['exit_px'], o['exit_reason']) == ('done', 28965, 28703, 'tp')
    risk = 131
    assert o['r'] == round((28965 - 28703) / risk - 2 / risk, 4)          # ~1.98R after spread
    assert o['mae_r'] == round(35 / risk + 2 / risk, 4)
    assert o['mfe_r'] == round(262 / risk - 2 / risk, 4)


def test_open_trade_carries_latest_price():
    bars = [bar(1, 28900, 28970, 28890, 28960), bar(2, 28960, 28980, 28900, 28910)]
    o = resolve(SELL_LIMIT, bars)
    assert o['state'] == 'open' and o['mark_px'] == 28910 and o['mark_ts'] == T0 + 120


def test_tp_not_taken_on_limit_fill_bar_but_sl_is():
    # fill bar spans both TP and entry: TP ignored on the fill bar
    o = resolve(SELL_LIMIT, [bar(1, 28900, 28970, 28700, 28800)])
    assert o['state'] == 'open'
    o = resolve(SELL_LIMIT, [bar(1, 28900, 29100, 28890, 29050)])
    assert (o['exit_reason'], o['r']) == ('sl', -1.0)


def test_same_bar_sl_and_tp_counts_as_sl():
    bars = [bar(1, 28900, 28970, 28890, 28960), bar(2, 28960, 29100, 28700, 28800)]
    assert resolve(SELL_LIMIT, bars)['exit_reason'] == 'sl'


def test_market_swing_closed_by_channel():
    sig = {'id': '101:0', 'symbol': 'USDJPY', 'side': 'SELL', 'order': 'market', 'entry': 157.69, 'sl': 157.96,
           'tp': None, 'posted_ts': T0 + 30, 'recv_px': 157.70, 'close_ts': T0 + 600, 'close_reason': 'channel close',
           'style': 'swing'}
    bars = [bar(i, 157.7 - 0.01 * i, 157.71 - 0.01 * i, 157.68 - 0.01 * i, 157.69 - 0.01 * i) for i in range(1, 15)]
    o = resolve(sig, bars, spread=0.01)
    assert (o['state'], o['fill_px'], o['exit_reason']) == ('done', 157.70, 'channel close')
    assert abs(o['exit_px'] - 157.60) < 1e-9 and o['r'] > 0
    row = template_row(sig, o, risk_pct=1.0)
    assert list(row) == TEMPLATE_HEADER
    assert (row['Date'], row['Time'], row['Exit Time'], row['Direction'], row['Model']) == \
        ('2026-10-30', '07:00', '07:10', 'Short', 'ColezTrades Swing')
    assert row['Return %'] == round(o['r'], 4) and row['Risk %'] == 1.0
    csv = to_csv([row])
    assert csv.splitlines()[0] == ','.join(TEMPLATE_HEADER) and csv.count('\n') == 2


def test_unfilled_has_no_row():
    assert template_row(SELL_LIMIT, {'fill_ts': None}) is None


if __name__ == '__main__':
    fns = [v for k, v in sorted(globals().items()) if k.startswith('test_')]
    for f in fns:
        f()
        print('ok ', f.__name__)
    print(f'{len(fns)} passed')
