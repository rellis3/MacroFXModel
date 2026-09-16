#!/usr/bin/env python3
"""Regression guards for motif_bot.py's genuinely NEW logic -- the pieces a
silent bug in would either corrupt every trade this bot places or corrupt
the audit trail the whole point of this build is to have. Everything else
(broker fills, risk lockout, sizing math) is delegated to already-tested
pylego bricks.

Run from the repo root:
    python3 -m pytest motif_bot/motif_bot_test.py -q
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pylego.broker.paper import PaperBroker  # noqa: E402
from motif_bot import motif_bot as mb        # noqa: E402


def _entry(**over):
    base = {"pair": "eurusd", "direction": "BUY", "is_top": False, "n_touches": 2,
            "swing_regime": "range", "motif_key": "eurusd:bottom:1-2",
            "sl_pips": 20.0, "tp_r": 1.5}
    base.update(over)
    return base


# ── _sl_tp_from_fill -- the honest-vs-stale-price fix this bot exists for ──

def test_sl_tp_from_fill_buy_direction():
    """A BUY's stop sits BELOW the fill, target ABOVE -- computed from the
    fill this bot actually got, never the plan's stale tracked reference."""
    sl, tp = mb._sl_tp_from_fill(_entry(direction="BUY"), fill_price=1.1000, pip=0.0001)
    assert sl == 1.0980 - 0  and abs(sl - 1.0980) < 1e-9
    assert abs(tp - 1.1030) < 1e-9          # 20p stop, 1.5R target = 30p


def test_sl_tp_from_fill_sell_direction():
    """A SELL mirrors: stop ABOVE the fill, target BELOW."""
    sl, tp = mb._sl_tp_from_fill(_entry(direction="SELL"), fill_price=1.1000, pip=0.0001)
    assert abs(sl - 1.1020) < 1e-9
    assert abs(tp - 1.0970) < 1e-9


def test_sl_tp_from_fill_respects_tp_r():
    """tp_r=2.0 -> a 40-pip target on the same 20-pip stop, not hardcoded 1.5."""
    sl, tp = mb._sl_tp_from_fill(_entry(direction="BUY", tp_r=2.0), fill_price=1.0000, pip=0.0001)
    assert abs(sl - 0.9980) < 1e-9
    assert abs(tp - 1.0040) < 1e-9


# ── the direction-vocabulary bug this suite exists to pin ──────────────────
# broker.enter() takes "LONG"/"SHORT"; the plan's own field is "BUY"/"SELL"
# (motif_track.py's trade-log convention). Passing "BUY"/"SELL" straight
# through SILENTLY reverses every fill (PaperBroker.enter checks
# `direction == "LONG"` and falls to the SHORT branch on anything else) --
# caught once already while building this bot; pinned here so it can't come
# back on a refactor.

def test_broker_enter_uses_long_short_not_buy_sell():
    b = PaperBroker(balance=10_000.0)
    b.set_price("eurusd", 1.0960)
    is_long = _entry(direction="BUY")["direction"] == "BUY"
    tid = b.enter("eurusd", "LONG" if is_long else "SHORT", sl=1.0940, tp=1.1000,
                 lots=0.1, max_spread_pips=3.0, paper_mode=True)
    assert tid is not None and tid != -1
    pos = b.serialize_open_positions()[0]
    assert pos["direction"] == "BUY"                       # round-trips through serialize_*
    assert pos["open_price"] > 1.0960                      # a BUY crosses the spread UPWARD


def test_broker_enter_with_raw_buy_sell_would_reverse_the_fill():
    """The bug itself, still triggerable if a future edit reverts the fix --
    documents WHY the translation in motif_bot.run() is not optional."""
    b = PaperBroker(balance=10_000.0)
    b.set_price("eurusd", 1.0960)
    tid = b.enter("eurusd", "BUY", sl=1.0940, tp=1.1000,             # the WRONG literal
                 lots=0.1, max_spread_pips=3.0, paper_mode=True)
    assert tid is not None and tid != -1
    pos = b.serialize_open_positions()[0]
    assert pos["direction"] == "SELL"                       # reversed -- this is the failure mode
    assert pos["open_price"] < 1.0960                       # filled on the wrong side of the spread too


# ── full round trip: BUY to TP, SELL to SL ──────────────────────────────────

def test_full_cycle_buy_to_tp_is_profitable():
    b = PaperBroker(balance=10_000.0)
    b.set_price("eurusd", 1.0960)
    e = _entry(direction="BUY")
    px = b.price("eurusd")
    sl, tp = mb._sl_tp_from_fill(e, px, 0.0001)
    lots = mb.size_for("eurusd", 10_000.0, 0.25, abs(px - sl), 5.0)
    b.enter("eurusd", "LONG", sl, tp, lots, 3.0, True, comment=f"MT[{e['motif_key']}]")
    b.set_price("eurusd", tp + 0.0005)
    b.check_barriers()
    c = b.serialize_closed_trades()[0]
    assert c["reason"] == "tp" and c["profit"] > 0
    assert c["comment"] == f"MT[{e['motif_key']}]"          # dedup identity survives to the audit trail


def test_full_cycle_sell_to_sl_is_a_loss():
    b = PaperBroker(balance=10_000.0)
    b.set_price("gbpusd", 1.2650)
    e = _entry(pair="gbpusd", direction="SELL", motif_key="gbpusd:top:5-15")
    px = b.price("gbpusd")
    sl, tp = mb._sl_tp_from_fill(e, px, 0.0001)
    lots = mb.size_for("gbpusd", 10_000.0, 0.25, abs(px - sl), 5.0)
    b.enter("gbpusd", "SHORT", sl, tp, lots, 3.0, True, comment=f"MT[{e['motif_key']}]")
    b.set_price("gbpusd", sl + 0.0005)
    b.check_barriers()
    c = b.serialize_closed_trades()[0]
    assert c["reason"] == "sl" and c["profit"] < 0


# ── plan filtering / dedup ──────────────────────────────────────────────────

def test_enabled_entries_empty_pairs_means_all():
    plan = {"entries": [_entry(pair="eurusd"), _entry(pair="gbpusd", motif_key="k2")]}
    out = mb._enabled_entries({"enabled_pairs": []}, plan)
    assert len(out) == 2


def test_enabled_entries_restricts_to_configured_pairs():
    plan = {"entries": [_entry(pair="eurusd"), _entry(pair="gbpusd", motif_key="k2")]}
    out = mb._enabled_entries({"enabled_pairs": ["gbpusd"]}, plan)
    assert [e["pair"] for e in out] == ["gbpusd"]


def test_plan_age_hours_none_when_missing():
    assert mb._plan_age_hours({}, now_epoch=1_800_000_000.0) is None


def test_plan_age_hours_measures_real_elapsed_time():
    import time
    now = time.time()
    stale = {"generatedAt": "2020-01-01T00:00:00+00:00"}
    age = mb._plan_age_hours(stale, now)
    assert age is not None and age > 1000  # years old, definitely stale


# ── formatters -- house style parity with fib_atlas_bot/volatility_bot_v2 ──

def test_entry_alert_shows_sl_tp_and_lots():
    text = mb._fmt_entry_alert(_entry(), sl=1.0940, tp=1.1000, fill=1.0960,
                               lots=0.5, mode_tag=" [PAPER]")
    assert "EURUSD" in text and "BUY entered [PAPER]" in text
    assert "1.09400" in text and "1.10000" in text and "Lots 0.5" in text


def test_close_alert_tags_tp_and_sl_correctly():
    # time_open=0 is deliberately avoided: _fmt_close_alert's `if to and tc`
    # (same convention fib_atlas_bot._fmt_close_alert uses) treats a falsy
    # epoch-0 as "no open time" and omits the duration line -- correct in
    # practice (a real position never opens at epoch 0), but a fixture using
    # 0 would silently test a code path this function doesn't really have.
    tp_row = {"reason": "tp", "profit": 12.3, "open_price": 1.0, "close_price": 1.01,
              "time_open": 1_000_000, "time_close": 1_000_000 + 3661}
    sl_row = {"reason": "sl", "profit": -8.0, "open_price": 1.0, "close_price": 0.99,
              "time_open": 1_000_000, "time_close": 1_000_000 + 60}
    tp_text = mb._fmt_close_alert("eurusd", tp_row, "")
    sl_text = mb._fmt_close_alert("eurusd", sl_row, "")
    assert "TP HIT" in tp_text and "+12.30" in tp_text and "1h 1m" in tp_text
    assert "SL HIT" in sl_text and "-8.00" in sl_text and "1m" in sl_text


# ── config merge ─────────────────────────────────────────────────────────

def test_deep_merge_overrides_only_provided_keys():
    merged = mb._deep_merge(mb.DEFAULT_CFG, {"risk_pct": 0.5, "paper_mode": False})
    assert merged["risk_pct"] == 0.5
    assert merged["paper_mode"] is False
    assert merged["max_open"] == mb.DEFAULT_CFG["max_open"]   # untouched default survives


def test_default_paper_mode_is_true():
    """Never start a fresh bot live -- same discipline as every other bot's
    DEFAULT_CFG in this repo."""
    assert mb.DEFAULT_CFG["paper_mode"] is True


def test_default_risk_guard_enabled_is_false():
    """OFF by default (2026-09-16): with the guard not enforced, the live bot
    trades the SAME population motif_alert_backtest.py's ungated export does
    -- the user's own ask, so a live account can match the backtest exactly
    until/unless it actually needs the daily/monthly DD lockout + cooldown."""
    assert mb.DEFAULT_CFG["risk_guard_enabled"] is False


def test_log_guard_transition_logs_would_block_when_not_enforced():
    import logging
    msgs = []
    h = logging.Handler(); h.emit = lambda r: msgs.append(r.getMessage())
    lg = logging.getLogger("mt_guard_transition_test"); lg.addHandler(h); lg.setLevel(logging.INFO)
    state = {}
    mb._log_guard_transition(lg, state, "eurusd", "Daily DD 4.0% >= 3.0% -- locked 3h", enforced=False)
    assert len(msgs) == 1
    assert "would block" in msgs[0] and "NOT enforced" in msgs[0]
    assert "NEW entries blocked" not in msgs[0], \
        "must never claim entries were blocked while risk_guard_enabled is false"


def test_log_guard_transition_logs_real_block_when_enforced():
    import logging
    msgs = []
    h = logging.Handler(); h.emit = lambda r: msgs.append(r.getMessage())
    lg = logging.getLogger("mt_guard_transition_test2"); lg.addHandler(h); lg.setLevel(logging.INFO)
    state = {}
    mb._log_guard_transition(lg, state, "eurusd", "Daily DD 4.0% >= 3.0% -- locked 3h", enforced=True)
    assert len(msgs) == 1 and "NEW entries blocked" in msgs[0]
    mb._log_guard_transition(lg, state, "eurusd", None, enforced=True)
    assert len(msgs) == 2 and "resumed" in msgs[1]


if __name__ == "__main__":
    import pytest
    raise SystemExit(pytest.main([__file__, "-v"]))
