"""Synthetic, offline tests for barrier_race.race_grid — no network, no files."""
import numpy as np
import pandas as pd

from barrier_race import Entry, race_grid, race_trailing, race_trades


def _bars(opens, highs, lows, closes):
    return pd.DataFrame({'open': opens, 'high': highs, 'low': lows, 'close': closes})


def test_long_hits_tp_before_sl():
    # Entry at 100, drifts straight up to 110 then back down — TP=5 (dist 5)
    # should trigger at bar 2 (high=105) before SL=5 (low never reaches 95).
    bars = _bars(
        opens=[100, 101, 104, 108, 106],
        highs=[100, 102, 105, 110, 107],
        lows=[100, 100, 103, 106, 104],
        closes=[100, 101, 104, 108, 106],
    )
    entries = [Entry(idx=0, direction=1)]
    res = race_grid(bars, entries, sl_grid=[5.0], tp_r_grid=[1.0], max_bars_ahead=10, min_bars_ahead=1)
    assert len(res) == 1
    r = res[0]
    assert r.n == 1
    assert r.win_rate == 1.0
    assert r.sl_rate == 0.0
    assert r.avg_r == 1.0


def test_short_hits_sl_before_tp():
    # Short entry at 100; price runs UP through 105 (SL=5) before ever
    # dropping to a TP at 95 — should be recorded as a loss (-1R).
    bars = _bars(
        opens=[100, 102, 106, 90],
        highs=[100, 103, 107, 91],
        lows=[100, 101, 105, 88],
        closes=[100, 102, 106, 90],
    )
    entries = [Entry(idx=0, direction=-1)]
    res = race_grid(bars, entries, sl_grid=[5.0], tp_r_grid=[1.0], max_bars_ahead=10, min_bars_ahead=1)
    r = res[0]
    assert r.sl_rate == 1.0
    assert r.avg_r == -1.0


def test_timeout_marks_to_close_in_r():
    # Neither barrier touched within the horizon — should mark-to-close as a
    # fractional R, not force a win/loss.
    bars = _bars(
        opens=[100, 100.5, 101, 101.5],
        highs=[100, 100.6, 101.1, 101.6],
        lows=[100, 100.4, 100.9, 101.4],
        closes=[100, 100.5, 101, 101.5],
    )
    entries = [Entry(idx=0, direction=1)]
    # SL=10 (never touched, low never < 90), TP=10 (never touched, high never
    # > 110) -> forced timeout at max_bars_ahead.
    res = race_grid(bars, entries, sl_grid=[10.0], tp_r_grid=[2.0], max_bars_ahead=4, min_bars_ahead=1)
    r = res[0]
    assert r.timeout_rate == 1.0
    # last_close=101.5, entry=100 -> (101.5-100)/10 = 0.15R
    assert abs(r.avg_r - 0.15) < 1e-9


def test_shared_bar_index_reused_for_both_directions():
    # Two entries at the SAME idx (Layer 1's mechanical long+short from one
    # bar) must each be evaluated independently against the shared path.
    # Path: high [100,107,107(cummax)], low [100,99,93(cummin)].
    bars = _bars(
        opens=[100, 106, 94],
        highs=[100, 107, 100],
        lows=[100, 99, 93],
        closes=[100, 106, 94],
    )
    entries = [Entry(idx=0, direction=1), Entry(idx=0, direction=-1)]
    res = race_grid(bars, entries, sl_grid=[5.0], tp_r_grid=[1.0], max_bars_ahead=10, min_bars_ahead=1)
    r = res[0]
    assert r.n == 2
    # long: TP=105 touched at bar1 (high 107) before SL=95 touched at bar2 (low 93) -> win.
    # short: SL=105 touched at bar1 (high 107) before TP=95 touched at bar2 (low 93) -> loss.
    # One win, one loss from the same shared path -> exercises that direction is applied
    # independently even though the forward path itself is computed once.
    assert r.win_rate == 0.5
    assert r.sl_rate == 0.5
    assert r.avg_r == 0.0


def test_cost_price_drags_every_outcome():
    bars = _bars(
        opens=[100, 101, 105],
        highs=[100, 102, 106],
        lows=[100, 100, 104],
        closes=[100, 101, 105],
    )
    entries = [Entry(idx=0, direction=1)]
    no_cost = race_grid(bars, entries, sl_grid=[5.0], tp_r_grid=[1.0], max_bars_ahead=10, min_bars_ahead=1)[0]
    with_cost = race_grid(bars, entries, sl_grid=[5.0], tp_r_grid=[1.0], max_bars_ahead=10,
                          min_bars_ahead=1, cost_price=1.0)[0]
    # cost_price=1.0 over sl=5.0 -> 0.2R drag
    assert abs((no_cost.avg_r - with_cost.avg_r) - 0.2) < 1e-9


def test_explicit_entry_price_overrides_bar_open():
    # Bar opens are 95/96 but the entry is overridden to 100 (e.g. a limit/zone
    # fill price) — neither barrier (dist 10) triggers, so the timeout mark-to-
    # close is a direct function of entry_price: (96-100)/10 = -0.4R. Using the
    # bar's own open (95) instead would give (96-95)/10 = +0.1R — a different
    # sign, so this distinguishes "used the override" from "ignored it".
    bars = _bars(opens=[95, 96], highs=[96, 97], lows=[94, 95], closes=[95, 96])
    entries = [Entry(idx=0, direction=1, entry_price=100.0)]
    res = race_grid(bars, entries, sl_grid=[10.0], tp_r_grid=[1.0], max_bars_ahead=10, min_bars_ahead=1)
    r = res[0]
    assert r.timeout_rate == 1.0
    assert abs(r.avg_r - (-0.4)) < 1e-9


def test_empty_entries_returns_empty():
    bars = _bars(opens=[100], highs=[100], lows=[100], closes=[100])
    assert race_grid(bars, [], sl_grid=[5.0], tp_r_grid=[1.0], max_bars_ahead=10, min_bars_ahead=1) == []


# ── race_trailing ──────────────────────────────────────────────────────────

def test_trail_hard_sl_before_any_favourable_move():
    # Price drops straight through the initial stop before ever running in
    # profit — never arms, exits at the hard stop: -1.0R exactly.
    bars = _bars(opens=[100, 90], highs=[100, 91], lows=[100, 89], closes=[100, 90])
    entries = [Entry(idx=0, direction=1, entry_price=100.0)]
    res = race_trailing(bars, entries, initial_sl_grid=[5.0], activate_r_grid=[1.0],
                        trail_r_grid=[0.5], max_bars_ahead=10)
    assert len(res) == 1
    assert res[0].n == 1
    assert res[0].avg_r == -1.0
    assert res[0].win_rate == 0.0


def test_trail_locks_profit_long():
    # Runs to 106 (1.2R, arms at activate_r=1.0), trails to 107 (stop ratchets
    # to 104.5), then pulls back and the trail (not the hard stop) exits at
    # 104.5 -> (104.5-100)/5 = +0.9R. Hand-verified bar by bar in the docstring
    # math above.
    bars = _bars(opens=[100, 106, 104], highs=[106, 107, 104], lows=[100, 104, 103],
                closes=[100, 106, 104])
    entries = [Entry(idx=0, direction=1, entry_price=100.0)]
    res = race_trailing(bars, entries, initial_sl_grid=[5.0], activate_r_grid=[1.0],
                        trail_r_grid=[0.5], max_bars_ahead=10)
    r = res[0]
    assert abs(r.avg_r - 0.9) < 1e-9
    assert r.win_rate == 1.0


def test_trail_locks_profit_short():
    # Mirror of the long case: runs down to 94 (arms), trails to 96.5, pulls
    # back up and the trail exits at 96.5 -> (100-96.5)/5 = +0.7R.
    bars = _bars(opens=[100, 97], highs=[95, 97], lows=[94, 93], closes=[95, 95])
    entries = [Entry(idx=0, direction=-1, entry_price=100.0)]
    res = race_trailing(bars, entries, initial_sl_grid=[5.0], activate_r_grid=[1.0],
                        trail_r_grid=[0.5], max_bars_ahead=10)
    r = res[0]
    assert abs(r.avg_r - 0.7) < 1e-9


def test_trail_never_activates_marks_to_close():
    # Price wanders but never reaches activate_r's favourable move, and never
    # hits the hard stop — times out and marks to the last close.
    bars = _bars(opens=[100, 101, 100], highs=[102, 103, 101], lows=[99, 100, 100],
                closes=[100, 101, 102])
    entries = [Entry(idx=0, direction=1, entry_price=100.0)]
    res = race_trailing(bars, entries, initial_sl_grid=[10.0], activate_r_grid=[2.0],
                        trail_r_grid=[0.5], max_bars_ahead=3)
    r = res[0]
    assert abs(r.avg_r - 0.2) < 1e-9   # (102-100)/10


def test_trail_cost_price_drags_outcome():
    bars = _bars(opens=[100, 90], highs=[100, 91], lows=[100, 89], closes=[100, 90])
    entries = [Entry(idx=0, direction=1, entry_price=100.0)]
    no_cost = race_trailing(bars, entries, initial_sl_grid=[5.0], activate_r_grid=[1.0],
                            trail_r_grid=[0.5], max_bars_ahead=10)[0]
    with_cost = race_trailing(bars, entries, initial_sl_grid=[5.0], activate_r_grid=[1.0],
                              trail_r_grid=[0.5], max_bars_ahead=10, cost_price=1.0)[0]
    assert abs((no_cost.avg_r - with_cost.avg_r) - 0.2) < 1e-9   # 1.0/5.0


# ── race_trades ────────────────────────────────────────────────────────────

def test_race_trades_matches_grid_and_keeps_exit():
    # A win, a loss and a timeout — race_trades must return per-trade exits whose
    # outcomes + mean R exactly match what race_grid aggregates over the same set.
    bars = _bars(
        opens=[100, 101, 104, 108, 106],
        highs=[100, 102, 105, 110, 107],
        lows=[100, 100, 103, 106, 104],
        closes=[100, 101, 104, 108, 106],
    )
    win = Entry(idx=0, direction=1)              # TP=5 at bar2 (high 105)
    loss = Entry(idx=0, direction=-1)            # short, SL=5 at bar2 (high 105)
    trades = race_trades(bars, [win, loss], sl=5.0, tp_r=1.0, max_bars_ahead=10, min_bars_ahead=1)
    assert len(trades) == 2
    assert trades[0]['outcome'] == 'tp' and trades[0]['exit_idx'] == 2 and abs(trades[0]['r'] - 1.0) < 1e-9
    assert trades[0]['exit_price'] == 105.0    # entry 100 + tp_dist 5
    assert trades[1]['outcome'] == 'sl' and trades[1]['r'] == -1.0
    # Aggregate parity: mean R of race_trades == race_grid.avg_r on the same cell.
    grid = race_grid(bars, [win, loss], sl_grid=[5.0], tp_r_grid=[1.0], max_bars_ahead=10, min_bars_ahead=1)[0]
    assert abs(np.mean([t['r'] for t in trades]) - grid.avg_r) < 1e-12


def test_race_trades_timeout_exit_is_last_bar():
    bars = _bars(
        opens=[100, 100.5, 101, 101.5],
        highs=[100, 100.6, 101.1, 101.6],
        lows=[100, 100.4, 100.9, 101.4],
        closes=[100, 100.5, 101, 101.5],
    )
    t = race_trades(bars, [Entry(idx=0, direction=1)], sl=10.0, tp_r=2.0,
                    max_bars_ahead=4, min_bars_ahead=1)[0]
    assert t['outcome'] == 'timeout'
    assert t['exit_idx'] == 3 and t['exit_price'] == 101.5   # marks to last close
    assert abs(t['r'] - 0.15) < 1e-9


if __name__ == '__main__':
    import sys
    fns = [v for k, v in list(globals().items()) if k.startswith('test_')]
    failed = 0
    for fn in fns:
        try:
            fn()
            print(f'ok   {fn.__name__}')
        except Exception as e:
            failed += 1
            print(f'FAIL {fn.__name__}: {type(e).__name__}: {e}')
    print(f'\n{len(fns) - failed}/{len(fns)} passed')
    sys.exit(1 if failed else 0)
