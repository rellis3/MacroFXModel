"""Offline tests for the PaperBroker (the bot's paper-mode execution)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pylego.broker.paper import PaperBroker  # noqa: E402


def test_open_and_serialize_position():
    b = PaperBroker(balance=10_000)
    b.set_price("eurusd", 1.1000)
    t = b.open({"pair": "eurusd", "side": "sell", "lots": 0.5, "entry": 1.1100, "tp": 1.1050, "sl": 1.1150})
    pos = b.positions()
    assert len(pos) == 1 and pos[0]["ticket"] == t
    assert pos[0]["direction"] == "SHORT" and pos[0]["lots"] == 0.5
    assert {"symbol", "open_price", "price_current", "profit", "swap"} <= set(pos[0])


def test_check_barriers_closes_on_tp():
    b = PaperBroker()
    b.set_price("eurusd", 1.1100)
    b.open({"pair": "eurusd", "side": "sell", "lots": 0.5, "entry": 1.1100, "tp": 1.1050, "sl": 1.1150})
    b.set_price("eurusd", 1.1049)                 # price reached the TP (a SELL wins as price falls)
    hit = b.check_barriers()
    assert hit and hit[0]["reason"] == "tp"
    assert b.positions() == [] and b.closed[-1]["reason"] == "tp"


def test_check_barriers_closes_on_sl():
    b = PaperBroker()
    b.set_price("eurusd", 1.1100)
    b.open({"pair": "eurusd", "side": "buy", "lots": 0.5, "entry": 1.1100, "tp": 1.1150, "sl": 1.1050})
    b.set_price("eurusd", 1.1049)                 # below SL for a BUY
    hit = b.check_barriers()
    assert hit and hit[0]["reason"] == "sl"
    assert not b.positions()


def test_no_barrier_when_inside():
    b = PaperBroker()
    b.set_price("eurusd", 1.1100)
    b.open({"pair": "eurusd", "side": "buy", "lots": 0.5, "entry": 1.1100, "tp": 1.1150, "sl": 1.1050})
    b.set_price("eurusd", 1.1120)                 # between SL and TP
    assert b.check_barriers() == [] and len(b.positions()) == 1


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for t in tests:
        t(); print(f"  ok  {t.__name__}")
    print(f"\n{len(tests)} tests passed.")
