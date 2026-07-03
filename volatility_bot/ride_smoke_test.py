"""Ride A/B smoke test — the no-TP trailing exit end-to-end on the PaperBroker.

Exercises _manage_ride + PaperBroker.enter(tp=0)/modify/check_barriers/stop: a fade
rides with no take-profit, the chandelier stop ratchets toward the favourable extreme,
and the trade exits on that trailed stop (a profit after the reversion) — NOT a fixed
inner-line TP. Plus the 22:00 force-close. Offline, no MT5, no network.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pylego.broker.paper import PaperBroker                                   # noqa: E402
from volatility_bot.volatility_bot import _manage_ride, SESSION_LEN_SEC       # noqa: E402
from volatility_bot.engine import session_open_epoch                          # noqa: E402

BIG = 1e9
BASE = 1_700_000_000                     # fixed epoch → deterministic session anchor
MID  = session_open_epoch(BASE)          # London midnight for that day
IN_SESSION = MID + 3600                  # 1h into the session (well before 22:00)
POST_CLOSE = MID + SESSION_LEN_SEC + 60  # just after the 22:00 close


def _enter_short_ride(b):
    """Fade an up-line: SELL @1.10, disaster stop (outer) 1.12, NO take-profit."""
    b.set_price("eurusd", 1.10)
    tid = b.enter("eurusd", "SHORT", 1.12, 0, 0.5, BIG, True, comment="Vol HL75_up f")
    st = {tid: {"pair": "eurusd", "entry": 1.10, "sl0": 1.12, "is_long": False,
                "peak": 1.10, "cur_sl": 1.12}}
    return tid, st


def test_ride_trails_and_exits_on_trailed_stop_with_profit():
    b = PaperBroker()
    tid, ride_state = _enter_short_ride(b)
    # 1) price falls to 1.08 (favourable) — trail ratchets the stop down; no exit yet.
    b.set_price("eurusd", 1.08)
    _manage_ride(b, ride_state, "eurusd", 1.08, IN_SESSION, 0.5, True)
    b.check_barriers()
    assert b.serialize_open_positions(), "still riding — trailed stop not hit at the low"
    # 2) price bounces to 1.095 → crosses the trailed stop → exit on the SL (a profit).
    b.set_price("eurusd", 1.095)
    _manage_ride(b, ride_state, "eurusd", 1.095, IN_SESSION, 0.5, True)
    b.check_barriers()
    assert not b.serialize_open_positions(), "should have exited on the trailed stop"
    c = b.serialize_closed_trades()[-1]
    assert c["reason"] == "sl" and c["profit"] > 0, c        # sold 1.10, bought ~1.095
    # next tick's manage prunes the now-closed ticket (loop order: manage → barriers).
    _manage_ride(b, ride_state, "eurusd", 1.095, IN_SESSION, 0.5, True)
    assert tid not in ride_state


def test_ride_eod_force_close():
    b = PaperBroker()
    tid, ride_state = _enter_short_ride(b)
    b.set_price("eurusd", 1.101)                              # slightly against, still open
    _manage_ride(b, ride_state, "eurusd", 1.101, POST_CLOSE, 0.5, True)  # past 22:00
    assert not b.serialize_open_positions(), "position force-closed at session end"
    assert b.serialize_closed_trades()[-1]["reason"] == "eod"
    assert tid not in ride_state


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for t in tests:
        t(); print(f"  ok  {t.__name__}")
    print(f"\n{len(tests)} tests passed.")
