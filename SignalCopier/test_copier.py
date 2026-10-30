"""End-to-end Copier test: real messages → book → PaperBroker → KV, no network.

Run: python3 SignalCopier/test_copier.py
"""
from datetime import datetime, timedelta, timezone

import signal_copier as sc
from test_parser import CANCEL, CLOSES, DAILY, SINGLE


class FakeKV:
    base = "http://fake"

    def __init__(self, data=None):
        self.data = dict(data or {})

    def get_json(self, k):
        return self.data.get(k)

    def put_json(self, k, v, **_):
        self.data[k] = v

    put_status = put_json


PRICES = {"USDJPY": 157.70, "EURJPY": 176.30, "BTCUSD": 78600, "GBPJPY": 211.21, "SP500": 7661.0,
          "NAS100": 28862, "US30": 52380}


def make(cfg=None, kv=None):
    kv = kv or FakeKV({"signal_copier_config": cfg or {}})
    cp = sc.Copier(kv, sc._deep_merge(sc.DEFAULT_CFG, kv.get_json("signal_copier_config") or {}), False)
    assert cp.connect() and cp.paper and cp.data is None
    cp.quotes = None
    cp.prices = dict(PRICES)
    cp.price = lambda p: cp.prices.get(p.upper())
    cp.alert = lambda text: cp.__dict__.setdefault("alerts", []).append(text)
    return cp, kv


def statuses(cp):
    return {e["id"]: e["status"] for e in cp.execs.values()}


def test_day_flow_on_paper():
    cp, kv = make()
    now = datetime.now(timezone.utc)
    cp.on_message(101, DAILY, now)
    st = statuses(cp)
    # BTCUSD has no registry spread/pip so sizing still works; every swing enters at market
    assert [st[f"101:{i}"] for i in range(7)] == ["open"] * 7, (st, cp.decisions)
    assert st["101:7"] == "pending" and st["101:8"] == "pending"
    assert len(cp.broker.pending_orders()) == 2 and len(cp.broker.serialize_open_positions()) == 7
    assert all("SC[101-" in p["comment"] for p in cp.broker.serialize_open_positions())

    # channel cancels the NAS100 limit (never filled)
    cp.on_message(102, CANCEL, now + timedelta(minutes=1))
    assert statuses(cp)["101:7"] == "cancelled" and len(cp.broker.pending_orders()) == 1

    # US30 limit fills when price trades up to 52,445
    cp.prices["US30"] = 52446
    cp.tick()
    assert statuses(cp)["101:8"] == "open"

    # a duplicate delivery of the same message does nothing
    cp.on_message(101, DAILY, now)
    assert len(cp.broker.serialize_open_positions()) == 8

    # SP500 single: market, closes at 21:00 UK via the book
    cp.prices["SP500"] = 7641.0
    cp.on_message(103, SINGLE, now + timedelta(minutes=2))
    assert statuses(cp)["103:0"] == "open"

    # channel closes the swings
    cp.on_message(104, CLOSES, now + timedelta(minutes=3))
    st = statuses(cp)
    assert [st[f"101:{i}"] for i in range(7)] == ["closed"] * 7
    assert st["103:0"] == "open" and st["101:8"] == "open"
    assert len(cp.broker.serialize_closed_trades()) == 7

    # state + records reach KV, and a restart picks the book back up
    cp.flush(force=True)
    assert kv.data["signal_copier_state"]["execs"]["101:0"]["status"] == "closed"
    recs = {r["id"]: r for r in kv.data["signal_copier_signals"]["records"]}
    assert recs["101:0"]["close_reason"] == "channel close" or recs["101:0"]["close_reason"].startswith("flat")
    assert recs["101:7"]["cancel_ts"] is not None
    cp2, _ = make(kv=kv)
    assert statuses(cp2) == statuses(cp) and "101" in cp2.book.seen


def test_skips():
    cp, _ = make({"copy_day": False, "skip_symbols": ["BTCUSD"], "max_open": 3})
    now = datetime.now(timezone.utc)
    cp.on_message(101, DAILY, now)
    reasons = {d["id"]: d["reason"] for d in cp.decisions if d["status"] == "skipped"}
    assert "symbol on skip list" in reasons["101:2"]
    assert "day signals switched off" in reasons["101:7"]
    assert any("max_open" in r for r in reasons.values())


def test_stale_market_and_drift_are_skipped():
    cp, _ = make()
    cp.on_message(101, DAILY, datetime.now(timezone.utc) - timedelta(hours=1))
    st = statuses(cp)
    assert st["101:0"] == "skipped" and st["101:7"] == "pending"      # limits stay valid until their cancel time
    cp, _ = make()
    cp.prices["USDJPY"] = 157.60       # selling 0.33R LOWER than his short entry — worse, skipped
    cp.prices["EURJPY"] = 176.45       # selling higher than his 176.31 — better, taken
    cp.on_message(101, DAILY, datetime.now(timezone.utc))
    st = statuses(cp)
    assert st["101:0"] == "skipped" and st["101:1"] == "open"


def test_limit_through_takes_market_or_skips():
    cp, _ = make()
    cp.prices["NAS100"] = 28970        # already above his 28,965 sell limit
    cp.on_message(101, DAILY, datetime.now(timezone.utc))
    assert statuses(cp)["101:7"] == "open"
    cp, _ = make({"limit_through": "skip"})
    cp.prices["NAS100"] = 28970
    cp.on_message(101, DAILY, datetime.now(timezone.utc))
    assert statuses(cp)["101:7"] == "skipped"


def test_kill_switch():
    cp, _ = make({"kill_switch": True})
    cp.on_message(101, DAILY, datetime.now(timezone.utc))
    assert set(statuses(cp).values()) == {"skipped"} and not cp.broker.serialize_open_positions()


def test_status_shape():
    cp, _ = make()
    cp.on_message(101, DAILY, datetime.now(timezone.utc))
    s = cp.status()
    for k in ("mt5_positions", "today_closed_trades", "pending_orders", "pushed_at", "mode", "balance", "telegram", "book"):
        assert k in s, k
    assert s["mode"] == "paper" and len(s["mt5_positions"]) == 7 and len(s["pending_orders"]) == 2


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for f in fns:
        f()
        print("ok ", f.__name__)
    print(f"{len(fns)} passed")
