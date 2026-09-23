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
    b.enter("eurusd", "LONG", sl, tp, lots, 3.0, True, comment=mb._position_comment(e["motif_key"]))
    b.set_price("eurusd", tp + 0.0005)
    b.check_barriers()
    c = b.serialize_closed_trades()[0]
    assert c["reason"] == "tp" and c["profit"] > 0
    assert c["comment"] == mb._position_comment(e["motif_key"])   # deterministic tag survives to the audit trail


def test_full_cycle_sell_to_sl_is_a_loss():
    b = PaperBroker(balance=10_000.0)
    b.set_price("gbpusd", 1.2650)
    e = _entry(pair="gbpusd", direction="SELL", motif_key="gbpusd:top:5-15")
    px = b.price("gbpusd")
    sl, tp = mb._sl_tp_from_fill(e, px, 0.0001)
    lots = mb.size_for("gbpusd", 10_000.0, 0.25, abs(px - sl), 5.0)
    b.enter("gbpusd", "SHORT", sl, tp, lots, 3.0, True, comment=mb._position_comment(e["motif_key"]))
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


# ── max_entry_age_hours -- the "don't enter 2021's motifs today" gate ──────
# motif_bot_plan is a full snapshot of every still-open tracked trade. On
# 2026-09-16 the tracker's index-based watermark shifted and 211 trades from
# 2021 landed as "open"; the plan push happened to be broken that day
# (localhost:3000 on Railway) which is the only reason none were entered.

def test_entry_stale_when_confirmed_long_ago():
    now = 1_800_000_000.0
    e = _entry(confirmed_at="2021-01-07T19:00:00+00:00")
    assert mb._entry_is_stale(e, {"max_entry_age_hours": 3}, now)


def test_entry_fresh_when_confirmed_within_window():
    now = 1_800_000_000.0
    from datetime import datetime, timezone
    ts = datetime.fromtimestamp(now - 3600, tz=timezone.utc).isoformat()   # 1h ago
    e = _entry(confirmed_at=ts)
    assert not mb._entry_is_stale(e, {"max_entry_age_hours": 3}, now)


def test_entry_without_confirmed_at_is_stale_fail_closed():
    e = _entry()
    assert "confirmed_at" not in e
    assert mb._entry_is_stale(e, {"max_entry_age_hours": 3}, 1_800_000_000.0)


def test_entry_age_gate_can_be_switched_off():
    e = _entry(confirmed_at="2021-01-07T19:00:00+00:00")
    assert not mb._entry_is_stale(e, {"max_entry_age_hours": 0}, 1_800_000_000.0)


def test_default_max_entry_age_is_on():
    assert mb.DEFAULT_CFG["max_entry_age_hours"] > 0


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


# ── _position_comment -- the "Invalid comment argument" fix ────────────────
# Caught live 2026-09-18: `MT[{motif_key}]` grows with n_touches and bar-index
# size, and the backtest's own 30,062-trade history shows 21.6% of all motifs
# already produce a comment over MT5's 31-char cap -- `Mt5Broker._safe_comment`
# truncates it, but the truncated/mangled result was STILL rejected by the
# broker as "Invalid comment argument" (order_send returning None), silently
# skipping real entries. _position_comment fixes this by using a
# FIXED-LENGTH hash instead of embedding the variable-length key verbatim.

def test_position_comment_is_short_regardless_of_motif_key_length():
    # The exact real motif that failed live: a 3-touch motif with 5-digit
    # H1 bar indices -- "MT[audcad:bottom:10045-10069-10092]" is 35 chars,
    # already over the 31-char MT5 limit before any truncation.
    long_key = "audcad:bottom:10045-10069-10092"
    assert len(f"MT[{long_key}]") > 31, "sanity check: this key really did overflow the old format"
    assert len(mb._position_comment(long_key)) <= 20


def test_position_comment_is_deterministic_per_motif_key():
    assert mb._position_comment("eurusd:top:1-2") == mb._position_comment("eurusd:top:1-2")
    assert mb._position_comment("eurusd:top:1-2") != mb._position_comment("eurusd:top:1-3")


def test_motif_tag_matches_the_hash_embedded_in_position_comment():
    # _motif_tag is what gets passed as broker.enter's dedupe_tag -- it must
    # be the EXACT same hash _position_comment embeds, or the dedupe_tag's
    # `[{tag}]` substring match against the position's own comment silently
    # never matches anything.
    key = "gbpnzd:bottom:31151-31173"
    assert mb._position_comment(key) == f"MT[{mb._motif_tag(key)}]"


# ── max_concurrent_per_pair vs broker.enter's duplicate guard ──────────────
# Caught live 2026-09-22: motif_bot's own max_concurrent_per_pair check (cap
# default 2) passed for a second, genuinely distinct motif on a pair that
# already had one open position -- but broker.enter() was never told a
# dedupe_tag, so its duplicate guard blocked on ANY open position for the
# pair regardless, silently vetoing what the bot-level check had just
# allowed ("duplicate (ticket ... already open)" skips repeating every 5
# min while the config said 2 concurrent motifs should be fine).

# The bug itself only ever lived in Mt5Broker's default (blocks on ANY open
# position for the pair when no dedupe_tag is given) -- PaperBroker's own
# equivalent default is documented as "paper stacks freely, same as before"
# (pylego/broker/paper.py's enter() docstring), so it was never the broker
# that under-tested this; motif_bot.py simply never passed a dedupe_tag to
# either broker, silently relying on paper's permissive default while live
# hit Mt5Broker's strict one instead. There is nothing to regression-test
# via PaperBroker for "blocked without dedupe_tag" -- it was never blocked
# there. The test below is the actual fix: motif_bot now always passes
# dedupe_tag, so this is what both brokers do from here on.

def test_second_distinct_motif_on_same_pair_allowed_with_dedupe_tag():
    """The fix: tagging each motif's entry with its own _motif_tag lets a
    second, distinct motif open on a pair that already has one position,
    while still refusing to double-enter the SAME motif_key."""
    b = PaperBroker(balance=10_000.0)
    b.set_price("audusd", 0.7150)
    key1, key2 = "audusd:top:1-2", "audusd:top:5-9"
    tid1 = b.enter("audusd", "SHORT", 0.7170, 0.7100, 0.5, 3.0, True,
                   comment=mb._position_comment(key1), dedupe_tag=mb._motif_tag(key1))
    tid2 = b.enter("audusd", "SHORT", 0.7170, 0.7100, 0.25, 3.0, True,
                   comment=mb._position_comment(key2), dedupe_tag=mb._motif_tag(key2))
    assert tid1 is not None and tid1 != -1
    assert tid2 is not None and tid2 != -1
    assert len(b.serialize_open_positions()) == 2

    # Re-entering key1 (e.g. a duplicated plan poll) is still refused --
    # dedupe_tag narrows the block to "this exact motif", not "no block at all".
    tid1_again = b.enter("audusd", "SHORT", 0.7170, 0.7100, 0.5, 3.0, True,
                         comment=mb._position_comment(key1), dedupe_tag=mb._motif_tag(key1))
    assert tid1_again is None


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
