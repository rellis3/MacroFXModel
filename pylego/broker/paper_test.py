"""Offline tests for the PaperBroker (the bot's paper-mode execution).

Mirrors the canonical Mt5Broker surface (enter/stop/serialize_open_positions/
serialize_closed_trades/account_balance/price) + the paper-only set_price /
check_barriers (triple-barrier execution).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pylego.broker.paper import PaperBroker  # noqa: E402

BIG = 1e9  # max_spread_pips — never block in paper


def test_open_and_serialize_position():
    b = PaperBroker(balance=10_000)
    b.set_price("eurusd", 1.1100)
    t = b.enter("eurusd", "SHORT", 1.1150, 1.1050, 0.5, BIG, True)
    pos = b.serialize_open_positions()
    assert len(pos) == 1 and pos[0]["ticket"] == t
    assert pos[0]["direction"] == "SELL" and pos[0]["lots"] == 0.5
    assert {"symbol", "open_price", "price", "profit", "swap"} <= set(pos[0])


def test_enter_needs_a_price():
    b = PaperBroker()
    assert b.enter("eurusd", "LONG", 1.10, 1.12, 0.5, BIG, True) is None  # no price set


def test_check_barriers_closes_on_tp():
    b = PaperBroker()
    b.set_price("eurusd", 1.1100)
    b.enter("eurusd", "SHORT", 1.1150, 1.1050, 0.5, BIG, True)
    b.set_price("eurusd", 1.1049)                 # SHORT wins as price falls to TP
    hit = b.check_barriers()
    assert hit and hit[0]["reason"] == "tp"
    assert b.serialize_open_positions() == []
    assert b.serialize_closed_trades()[-1]["reason"] == "tp"


def test_check_barriers_closes_on_sl():
    b = PaperBroker()
    b.set_price("eurusd", 1.1100)
    b.enter("eurusd", "LONG", 1.1050, 1.1150, 0.5, BIG, True)
    b.set_price("eurusd", 1.1049)                 # below SL for a LONG
    hit = b.check_barriers()
    assert hit and hit[0]["reason"] == "sl"
    assert not b.serialize_open_positions()


def test_no_barrier_when_inside():
    b = PaperBroker()
    b.set_price("eurusd", 1.1100)
    b.enter("eurusd", "LONG", 1.1050, 1.1150, 0.5, BIG, True)
    b.set_price("eurusd", 1.1120)                 # between SL and TP
    assert b.check_barriers() == [] and len(b.serialize_open_positions()) == 1


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for t in tests:
        t(); print(f"  ok  {t.__name__}")
    print(f"\n{len(tests)} tests passed.")
