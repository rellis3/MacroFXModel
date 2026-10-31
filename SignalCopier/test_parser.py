"""Parser + book tests on the real 2026-10-30 messages (copied from screenshots).

Run: python3 SignalCopier/test_parser.py   (pytest also picks it up)
"""
from datetime import datetime, timezone

from book import Book
from parser import parse_message

DAILY = """Trades, Friday 30 October
Risk 1R on each.

Still holding: nothing carried from yesterday

Swings, hold until I post the close

🔴 SELL USDJPY now at 157.69
Stop loss (SL) 157.96
0.01 lots = $1.73 risk

🔴 SELL EURJPY now at 176.31
Stop loss (SL) 176.67
0.01 lots = $2.29 risk

🔴 SELL BTCUSD now at 78,607
Stop loss (SL) 79,312
0.01 lots = $7.05 risk

🔴 SELL GBPJPY now at 211.20
Stop loss (SL) 211.61
0.01 lots = $2.56 risk

🔴 SELL SP500 now at 7,661.6
Stop loss (SL) 7,683.5
0.01 lots = $0.22 risk

🔴 SELL NAS100 now at 28,860
Stop loss (SL) 29,018
0.01 lots = $1.57 risk

🔴 SELL US30 now at 52,385
Stop loss (SL) 52,563
0.01 lots = $1.78 risk

Day trades, limit orders, closed at 21:00

🔴 Limit SELL NAS100 at 28,965
SL 29,096, TP 28,703
Cancel at 13:00 UK if not filled
0.01 lots = $1.31 risk

🔴 Limit SELL US30 at 52,445
SL 52,534, TP 51,851
Cancel at 16:00 UK if not filled
0.01 lots = $0.89 risk

Not financial advice, for educational purposes only. I am live trading these on https://www.youtube.com/@ColezTrades"""

CANCEL = "Cancel the NAS100 limit SELL at 28,965, not filled"

SINGLE = """🔴 SELL SP500(normal, NOT futures) now at 7,640.6
SL 7,651.5, TP 7,567.7
Closed at 21:00 UK if still open
0.01 lots = $0.11 risk

Not financial advice, for educational purposes only."""

CLOSES = """CLOSE the USDJPY SELL from 157.69, flat for the weekend
CLOSE the EURJPY SELL from 176.31, flat for the weekend
CLOSE the BTCUSD SELL from 78,607, flat for the weekend
CLOSE the GBPJPY SELL from 211.20, flat for the weekend
CLOSE the SP500 SELL from 7,661.6, flat for the weekend
CLOSE the NAS100 SELL from 28,860, flat for the weekend
CLOSE the US30 SELL from 52,385, flat for the weekend"""

CHATTER = [
    "US30 is DJ30 or DJI30 and its normal not futures🙌",
    "Trades are all cooking really already 📈\n\nYou can modify your trade management and "
    "close/add/edit in a way you see fit, that's the real way you learn, keep in mind it's "
    "Friday and month end so just be careful🙏",
    "Currently running 3.2R on all of these from where I entered on stream🙏\n\n"
    "Please make sure you manage risk and are only rising what you are comfortable with",
    "Group and team has never been stronger, have a great weekend team",
]


def kinds(evs, k):
    return [e for e in evs if e['kind'] == k]


def test_daily_message():
    evs = parse_message(DAILY)
    hdr = kinds(evs, 'header')[0]
    assert (hdr['weekday'], hdr['day'], hdr['month'], hdr['risk_r']) == ('Friday', 30, 'October', 1.0)
    assert kinds(evs, 'holding')[0]['text'].startswith('nothing carried')
    opens = kinds(evs, 'open')
    assert len(opens) == 9
    assert not kinds(evs, 'review')

    swings, days = opens[:7], opens[7:]
    assert [o['symbol'] for o in swings] == ['USDJPY', 'EURJPY', 'BTCUSD', 'GBPJPY', 'SP500', 'NAS100', 'US30']
    for o in swings:
        assert o['side'] == 'SELL' and o['order'] == 'market' and o['style'] == 'swing'
        assert o['close_at'] is None and o['close_rule'] == 'manual'
        assert o['tp'] is None and o['risk_lots'] == 0.01
    assert swings[2]['entry'] == 78607 and swings[2]['sl'] == 79312 and swings[2]['risk_usd'] == 7.05
    assert swings[4]['entry'] == 7661.6 and swings[4]['sl'] == 7683.5

    nas, us30 = days
    assert nas == {**nas, 'symbol': 'NAS100', 'order': 'limit', 'entry': 28965, 'sl': 29096,
                   'tp': 28703, 'cancel_at': '13:00', 'close_at': '21:00', 'style': 'day',
                   'risk_usd': 1.31}
    assert us30['entry'] == 52445 and us30['tp'] == 51851 and us30['cancel_at'] == '16:00'


def test_cancel():
    evs = parse_message(CANCEL)
    assert evs == [{'kind': 'cancel', 'symbol': 'NAS100', 'side': 'SELL', 'order': 'limit', 'entry': 28965}]


def test_single_with_note():
    (o,) = parse_message(SINGLE)
    assert o['kind'] == 'open' and o['symbol'] == 'SP500' and o['order'] == 'market'
    assert (o['entry'], o['sl'], o['tp'], o['close_at']) == (7640.6, 7651.5, 7567.7, '21:00')
    assert o['note'] == 'normal, NOT futures'


def test_closes():
    evs = parse_message(CLOSES)
    assert len(evs) == 7 and all(e['kind'] == 'close' for e in evs)
    assert evs[2]['symbol'] == 'BTCUSD' and evs[2]['entry'] == 78607
    assert evs[0]['reason'] == 'flat for the weekend'


def test_chatter_is_silent():
    for t in CHATTER:
        assert parse_message(t) == [], t


def test_review_net():
    evs = parse_message("Move the NAS100 SL to breakeven")
    assert [e['kind'] for e in evs] == ['review']


def utc(h, m):
    return datetime(2026, 10, 30, h, m, tzinfo=timezone.utc)   # 30 Oct = GMT, UK == UTC


def test_book_day_replay():
    b = Book()
    t = b.apply(parse_message(DAILY), 101, utc(7, 1))
    assert sum(a == 'place' for a, *_ in t) == 9
    assert len(b.live()) == 9

    # 13:00 UK: channel cancels the NAS100 limit (same minute the timer would)
    t = b.apply(parse_message(CANCEL), 102, utc(13, 0))
    assert [(a, o['symbol']) for a, o, _ in t] == [('cancel', 'NAS100')]
    assert b.orders['101:7']['status'] == 'cancelled'

    b.apply(parse_message(SINGLE), 103, utc(13, 30))
    # 16:00 UK: US30 limit expires on its own
    t = b.tick(utc(16, 0))
    assert [(a, o['symbol'], o['status']) for a, o, _ in t] == [('cancel', 'US30', 'expired')]
    # 21:00 UK: the SP500 day trade closes; swings stay open
    t = b.tick(utc(21, 0))
    assert [(a, o['symbol']) for a, o, _ in t] == [('close', 'SP500')]
    assert len(b.live()) == 7

    t = b.apply(parse_message(CLOSES), 104, utc(20, 6))
    assert sum(a == 'close' for a, *_ in t) == 7 and not b.live()


def test_book_unmatched_close_warns():
    b = Book()
    t = b.apply(parse_message("CLOSE the EURUSD BUY from 1.0850, done"), 1, utc(9, 0))
    assert t[0][0] == 'warn'


if __name__ == '__main__':
    fns = [v for k, v in sorted(globals().items()) if k.startswith('test_')]
    for f in fns:
        f()
        print('ok ', f.__name__)
    print(f'{len(fns)} passed')
