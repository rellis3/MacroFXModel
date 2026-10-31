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
    # the older tests trade BTCUSD, so they run with crypto on; test_ignore_crypto covers the default
    kv = kv or FakeKV({"signal_copier_config": {"ignore_crypto": False, **(cfg or {})}})
    cp = sc.Copier(kv, sc._deep_merge(sc.DEFAULT_CFG, kv.get_json("signal_copier_config") or {}), False)
    assert cp.connect() and cp.paper and cp.data is None
    cp.quotes = None
    cp.prices = dict(PRICES)
    cp.price = lambda p: cp.prices.get(p.upper())
    cp.alerts = []
    cp.alert = lambda text, reply_to=None: cp.alerts.append((text, reply_to)) or len(cp.alerts)
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


def test_risk_guard_daily_lockout_blocks_new_entries():
    cp, _ = make({"ddlimit": 2.0})
    cp.guard.update_balance(10_000)
    cp.broker._bal = 9_700                       # -3% on the day
    cp.on_message(101, DAILY, datetime.now(timezone.utc))
    d = [e for e in cp.decisions if e["id"] == "101:0"][0]
    assert d["status"] == "pair_blocked" and d["reason"].startswith("risk_guard: Daily DD")
    assert cp.status()["risk_guard"]["locked"] is True


def test_reject_is_retried_then_succeeds():
    cp, _ = make()
    real = cp.broker.enter
    calls = {"n": 0}

    def flaky(*a, **k):
        calls["n"] += 1
        if calls["n"] == 1:
            cp.broker.last_reject_reason = "market_not_tradable (retcode=10018)"
            return None
        return real(*a, **k)
    cp.broker.enter = flaky
    cp.on_message(103, SINGLE.replace("SP500(normal, NOT futures) now at 7,640.6", "USDJPY now at 157.69")
                  .replace("SL 7,651.5, TP 7,567.7", "SL 157.96, TP 157.0"), datetime.now(timezone.utc))
    assert statuses(cp)["103:0"] == "rejected" and cp.retries["103:0"]["n"] == 1
    cp.retries["103:0"]["at"] = 0
    cp.tick()
    assert statuses(cp)["103:0"] == "open" and "103:0" not in cp.retries
    assert sum("REJECTED" in a for a, _ in cp.alerts) == 1


def test_non_retryable_reject_is_final():
    cp, _ = make()
    def bad(*a, **k):
        cp.broker.last_reject_reason = "invalid_stops_side (x)"
        return None
    cp.broker.enter = bad
    cp.on_message(101, DAILY, datetime.now(timezone.utc))
    assert statuses(cp)["101:0"] == "rejected" and "101:0" not in cp.retries


def test_close_alert_once_and_threaded_onto_entry():
    cp, _ = make()
    cp.on_message(101, DAILY, datetime.now(timezone.utc))
    ticket = cp.execs["101:0"]["ticket"]
    entry_mid = cp.tg_entry_msgid[str(ticket)]
    cp.prices["USDJPY"] = 158.10                # through the 157.96 stop
    cp.tick(); cp.tick()
    closes = [(a, r) for a, r in cp.alerts if "SL HIT" in a]
    assert len(closes) == 1 and closes[0][1] == entry_mid
    assert statuses(cp)["101:0"] == "closed"


def test_master_switch_and_decision_shape():
    cp, _ = make()
    cp.on_message(101, DAILY, datetime.now(timezone.utc))
    ev = cp.decisions[0]
    assert ev["pair"] == "usdjpy" and ev["symbol"] == "USDJPY" and isinstance(ev["t"], int)
    cp.refresh_life()
    s = cp.status()
    assert s["life"]["decisions_today"]["entered"] == 7 and s["open_used"] == 9 and s["max_open"] == 12
    assert s["tg_master_on"] is True and "risk_guard" in s


def test_replay_history_parse_report():
    cp, _ = make()
    t0 = datetime(2026, 10, 30, 7, 1, tzinfo=timezone.utc)
    msgs = [(101, DAILY, t0), (102, CANCEL, t0 + timedelta(hours=6)), (103, SINGLE, t0 + timedelta(hours=6.5)),
            (104, "Move the NAS100 SL to breakeven", t0 + timedelta(hours=7)),
            (105, "CLOSE the EURUSD BUY from 1.0850, done", t0 + timedelta(hours=8)),
            (106, "Group and team has never been stronger", t0 + timedelta(hours=9)),
            (107, CLOSES, t0 + timedelta(hours=13))]
    rep = sc.replay_history(cp, msgs, record=False)
    assert (rep["messages"], rep["opens"], rep["cancels"], rep["closes"]) == (7, 10, 1, 8)
    assert rep["with_instructions"] == 6
    assert rep["by_symbol"]["NAS100"] == 2 and rep["by_style"] == {"swing": 7, "day": 2, "single": 1}
    assert [u["msg_id"] for u in rep["unparsed"]] == [104]
    assert [u["msg_id"] for u in rep["unmatched"]] == [105]
    assert not cp.signals and not cp.execs and not cp.broker.serialize_open_positions()   # parse-only: nothing recorded or traded
    rep = sc.replay_history(cp, msgs, record=True)
    assert len(cp.signals) == 10 and not cp.execs                                   # recorded, still no orders
    assert cp.signals["101:0"]["close_reason"] == "flat for the weekend"


def test_ignore_crypto_live_record_and_replay():
    assert sc.is_crypto("BTCUSD") and sc.is_crypto("ETHUSDT") and sc.is_crypto("btc/usd")
    assert not sc.is_crypto("NAS100") and not sc.is_crypto("USDJPY") and not sc.is_crypto("XAUUSD")
    assert sc.DEFAULT_CFG["ignore_crypto"] is True
    cp, kv = make({"ignore_crypto": True})
    cp.on_message(101, DAILY, datetime.now(timezone.utc))
    st = statuses(cp)
    assert st["101:2"] == "skipped" and st["101:0"] == "open"
    d = [e for e in cp.decisions if e["id"] == "101:2"][0]
    assert d["reason"].startswith("crypto ignored")
    assert not any("BTCUSD" in a for a, _ in cp.alerts)                      # no alert noise
    assert "101:2" not in cp.signals and "101:0" in cp.signals                # not in the outcome record
    assert not [p for p in cp.broker.serialize_open_positions() if p["symbol"] == "BTCUSD"]
    # a crypto record stored before the flag: hidden, not deleted, and not re-scored
    cp.signals["999:0"] = {**cp.signals["101:0"], "id": "999:0", "symbol": "BTCUSD", "final": False}
    cp.resolve_open()
    assert cp.signals["999:0"]["ignored"] == "crypto" and cp.signals["999:0"]["out"] is None
    assert cp.signals["101:0"].get("ignored") is None
    # replay: BTCUSD parsed, counted as ignored, its close not counted or unmatched
    cp2, _ = make({"ignore_crypto": True})
    t0 = datetime(2026, 10, 30, 7, 1, tzinfo=timezone.utc)
    rep = sc.replay_history(cp2, [(101, DAILY, t0), (107, CLOSES, t0 + timedelta(hours=13))], record=True)
    assert (rep["opens"], rep["ignored_crypto"], rep["closes"]) == (8, 1, 6)
    assert "BTCUSD" not in rep["by_symbol"] and not rep["unmatched"]
    assert not [r for r in cp2.signals.values() if r["symbol"] == "BTCUSD"]


def test_no_price_market_entry_and_crypto_names():
    assert sc.is_crypto("ETHEREUM") and sc.is_crypto("Bitcoin") and not sc.is_crypto("GOLD")
    cp, _ = make()
    cp.prices["XAUUSD"] = 3995.0
    cp.on_message(201, "XAUUSD buy\n\n⛔ SL: 3980\n✅ Targets:\n1) 4018\n2) 4038", datetime.now(timezone.utc))
    assert statuses(cp)["201:0"] == "open"
    pos = [p for p in cp.broker.serialize_open_positions() if p["symbol"] == "XAUUSD"][0]
    assert pos["direction"] == "BUY"
    r = cp.signals["201:0"]
    assert r["entry"] is None and r["recv_px"] == 3995.0 and r["tp"] == 4018
    # his result message closes it
    cp.on_message(202, "✅ Target hit on the XAUUSD BUY from 3,995", datetime.now(timezone.utc))
    assert statuses(cp)["201:0"] == "closed"


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for f in fns:
        f()
        print("ok ", f.__name__)
    print(f"{len(fns)} passed")
