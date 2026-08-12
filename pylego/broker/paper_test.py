"""Offline tests for the PaperBroker (the bot's paper-mode execution).

Mirrors the canonical Mt5Broker surface (enter/stop/serialize_open_positions/
serialize_closed_trades/account_balance/price) + the paper-only set_price /
check_barriers (triple-barrier execution), plus the measurement contract:
money-unit P&L, a moving balance, and spread-crossing fills.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pylego.broker.paper import PaperBroker  # noqa: E402
from pylego.costs import default_spread, spread_class  # noqa: E402

BIG = 1e9  # max_spread_pips — never block in paper


def test_open_and_serialize_position():
    b = PaperBroker(balance=10_000)
    b.set_price("eurusd", 1.1100)
    t = b.enter("eurusd", "SHORT", 1.1150, 1.1050, 0.5, BIG, True)
    pos = b.serialize_open_positions()
    assert len(pos) == 1 and pos[0]["ticket"] == t
    assert pos[0]["direction"] == "SELL" and pos[0]["lots"] == 0.5
    assert {"symbol", "open_price", "price", "profit", "swap"} <= set(pos[0])


def test_open_position_carries_comment():
    # The dashboard maps an open position to the line it fades by parsing the
    # comment ("Vol {line} {decision}"). Mt5Broker emits it; paper must too, or the
    # vol-bot config card can't show WHICH level a paper position is trading.
    b = PaperBroker(balance=10_000)
    b.set_price("eurusd", 1.1100)
    b.enter("eurusd", "SHORT", 1.1150, 1.1050, 0.5, BIG, True, comment="Vol HL50_dn fade")
    pos = b.serialize_open_positions()
    assert pos[0]["comment"] == "Vol HL50_dn fade"


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


def test_closed_trade_carries_history_fields():
    # The server's mergeTradeHistory dedups on position_id and the Trade History tab
    # renders profit/time_close — a closed paper trade MUST carry all of them or it
    # never reaches the history (the volatility-bot "no trades logged" bug).
    b = PaperBroker()
    b.set_price("eurusd", 1.1100)
    t = b.enter("eurusd", "SHORT", 1.1150, 1.1050, 0.5, BIG, True)
    b.set_price("eurusd", 1.1049)                 # SHORT wins to TP
    b.check_barriers()
    c = b.serialize_closed_trades()[-1]
    assert c["position_id"] == t                  # dedup key present
    assert {"symbol", "direction", "lots", "open_price", "close_price",
            "profit", "time_open", "time_close", "reason"} <= set(c)
    assert c["profit"] > 0                          # SHORT from 1.1100 → 1.1049 = profit
    assert c["time_close"] is not None


def test_paper_rows_declare_a_utc_time_base():
    # Paper and MT5 rows land in the SAME Trade History table, but paper stamps
    # time.time() (true UTC) while Mt5Broker stamps the broker clock (+2/+3h).
    # Declaring 0 is what lets the dashboard render both correctly.
    b = PaperBroker()
    b.set_price("eurusd", 1.1100)
    b.enter("eurusd", "LONG", 1.1050, 1.1150, 0.5, BIG, True)
    assert b.serialize_open_positions()[0]["tz_offset_sec"] == 0
    b.set_price("eurusd", 1.1151)
    b.check_barriers()
    assert b.serialize_closed_trades()[-1]["tz_offset_sec"] == 0


def test_money_pnl_known_value():
    # profit = Δprice/pip × pip_value × lots in ACCOUNT CURRENCY — not a price
    # delta. Spread zeroed so the number is exact: EUR/USD SHORT 0.5 lots,
    # 1.1100 → 1.1050 = 50 pips × $10/pip/lot × 0.5 = $250.
    b = PaperBroker(balance=10_000)
    b.set_spread("eurusd", 0.0)
    b.set_price("eurusd", 1.1100)
    b.enter("eurusd", "SHORT", 1.1150, 1.1050, 0.5, BIG, True)
    b.set_price("eurusd", 1.1050)
    b.check_barriers()
    c = b.serialize_closed_trades()[-1]
    assert abs(c["profit"] - 250.0) < 1e-6, c
    assert abs(b.account_balance() - 10_250.0) < 1e-6   # realized P&L moved the balance


def test_gold_points_and_fx_pips_land_in_same_money_units():
    # Gold: pip = $1 point, $100/point/lot — +5 points LONG 0.1 lots = $50,
    # not "5" (the old Δprice×lots apples-to-oranges).
    b = PaperBroker(balance=10_000)
    b.set_spread("gold", 0.0)
    b.set_price("gold", 4000.0)
    t = b.enter("gold", "LONG", 3990.0, 0, 0.1, BIG, True)
    b.set_price("gold", 4005.0)
    b.stop(t, "gold", True, reason="eod")
    assert abs(b.serialize_closed_trades()[-1]["profit"] - 50.0) < 1e-6
    assert abs(b.account_balance() - 10_050.0) < 1e-6


def test_balance_moves_down_on_a_loss():
    b = PaperBroker(balance=10_000)
    b.set_spread("eurusd", 0.0)
    b.set_price("eurusd", 1.1000)
    t = b.enter("eurusd", "LONG", 1.0950, 0, 1.0, BIG, True)
    b.set_price("eurusd", 1.0980)                 # −20 pips × $10 × 1.0
    b.stop(t, "eurusd", True, reason="cut")
    assert abs(b.account_balance() - 9_800.0) < 1e-6


def test_spread_round_trip_costs_one_full_spread():
    # Entries fill at mid ± spread/2 and exits cross the other half, so a flat
    # round trip at the SAME mid loses exactly one full spread.
    b = PaperBroker(balance=10_000)
    b.set_spread("eurusd", 0.0002)                # 2 pips
    b.set_price("eurusd", 1.1000)
    t = b.enter("eurusd", "LONG", 1.0900, 0, 0.5, BIG, True)
    assert abs(b.serialize_open_positions()[0]["open_price"] - 1.1001) < 1e-9  # mid + s/2
    b.stop(t, "eurusd", True, reason="flat")
    c = b.serialize_closed_trades()[-1]
    assert abs(c["close_price"] - 1.0999) < 1e-9  # mid − s/2
    assert abs(c["profit"] - (-10.0)) < 1e-6      # 2 pips × $10 × 0.5 lots
    assert abs(b.account_balance() - 9_990.0) < 1e-6


def test_default_spread_table_and_overrides():
    # The per-asset-class defaults (pylego.costs — single source, both bots):
    # majors 0.8 pips, JPY crosses 1.0 pip, gold $0.30, indices 2 points.
    assert spread_class("eurusd") == "fx" and spread_class("usdjpy") == "fx_jpy"
    assert abs(default_spread("eurusd") - 0.00008) < 1e-12
    assert abs(default_spread("usdjpy") - 0.01) < 1e-12
    assert abs(default_spread("gold") - 0.30) < 1e-12
    assert abs(default_spread("nq") - 2.0) < 1e-12
    assert default_spread("not_a_symbol") == 0.0  # unknown → free fill, never a crash
    b = PaperBroker()
    assert abs(b.spread("eurusd") - 0.00008) < 1e-12   # default applies
    b.set_spread("eurusd", 0.0001)
    assert abs(b.spread("eurusd") - 0.0001) < 1e-12    # override wins
    b2 = PaperBroker(spreads={"gold": 0.5})            # ctor dict = config path
    assert abs(b2.spread("gold") - 0.5) < 1e-12


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for t in tests:
        t(); print(f"  ok  {t.__name__}")
    print(f"\n{len(tests)} tests passed.")
