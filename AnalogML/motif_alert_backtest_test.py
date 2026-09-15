#!/usr/bin/env python3
"""Regression guards for the two pieces of genuinely NEW logic in
`motif_alert_backtest.py`. Everything else it does is delegated to already-
tested bricks (`pylego.motif_touch`, `pylego.barrier_race`,
`pylego.portfolio_sim`), but these two reimplement, for replay, behaviour that
lives in the LIVE bot -- and a silent bug in either would corrupt every number
the export produces without ever raising.

Run from this directory (same convention as pylego's own tests):
    cd AnalogML && python3 -m pytest motif_alert_backtest_test.py -q
"""
from __future__ import annotations

from dataclasses import dataclass

from motif_alert_backtest import CausalConfidence, live_motif_per_bar


@dataclass
class FakeMotif:
    """Only the fields the two functions under test actually read."""
    touch_idxs: list
    confirm_idx: int | None = None
    n_touches: int = 2
    is_top: bool = True
    played_out: bool | None = True


def test_live_pick_prefers_the_latest_touch_run():
    """compute_motif_state picks max(in_progress, key=last touch) -- an older
    run forming at the same time is silently never the one alerted."""
    old = FakeMotif(touch_idxs=[0, 10])
    new = FakeMotif(touch_idxs=[0, 15])
    live = live_motif_per_bar([old, new], n=40, breakout_max_bars=40)
    assert live[12] is old        # only `old` has started yet
    assert live[15] is new        # both live -> the later last-touch wins
    assert live[30] is new


def test_live_pick_drops_a_run_once_it_confirms():
    """A confirmed run leaves the live panel AT its confirm bar, not after --
    the live detector already reports confirm_idx on that scan."""
    m = FakeMotif(touch_idxs=[0, 10], confirm_idx=20)
    live = live_motif_per_bar([m], n=40, breakout_max_bars=40)
    assert live[19] is m
    assert live[20] is None
    assert live[25] is None


def test_live_pick_respects_the_breakout_horizon():
    """Past last_touch + breakout_max_bars a run is out of its horizon and is
    no longer in progress, confirmed or not."""
    m = FakeMotif(touch_idxs=[0, 10])
    live = live_motif_per_bar([m], n=100, breakout_max_bars=40)
    assert live[50] is m          # 10 + 40, the last bar still inside
    assert live[51] is None


def test_live_pick_hands_bars_back_to_an_older_run():
    """A later run that confirms early must not keep bars it no longer owns --
    an older run still inside its own horizon becomes live again."""
    old = FakeMotif(touch_idxs=[0, 10])                     # horizon to bar 50
    new = FakeMotif(touch_idxs=[0, 15], confirm_idx=20)     # live 15..19 only
    live = live_motif_per_bar([old, new], n=60, breakout_max_bars=40)
    assert live[18] is new
    assert live[25] is old


def _confidence_over(confirm_idxs: list, r: float = 1.0) -> CausalConfidence:
    motifs = [FakeMotif(touch_idxs=[0, c - 5], confirm_idx=c) for c in confirm_idxs]
    raced = {c: {"r": r, "exit_idx": c + 1} for c in confirm_idxs}
    return CausalConfidence(motifs, raced)


def test_confidence_never_sees_the_future():
    """THE lookahead guard. _category_confidence needs no cutoff live (its bar
    array ends at "now"); a replay does, and without one every panel in the
    export would be contaminated. A query at bar i must count only motifs
    confirmed STRICTLY before i."""
    conf = _confidence_over(list(range(100, 140)))   # 40 motifs, bars 100..139
    at_120 = conf.at(120, n_touches=2, is_top=True)
    assert at_120 is not None
    assert at_120["n_samples"] == 20                 # bars 100..119, not 120 itself
    # Every later motif is invisible no matter how many there are.
    assert conf.at(110, 2, True)["n_samples"] == 10
    assert conf.at(139, 2, True)["n_samples"] == 39


def test_confidence_floor_matches_live():
    """Below _category_confidence's own 10-sample floor the panel is omitted
    entirely rather than shown on a handful of trades."""
    conf = _confidence_over(list(range(100, 140)))
    assert conf.at(105, 2, True) is None             # only 5 known -> no panel
    assert conf.at(111, 2, True) is not None         # 11 known -> panel


def test_confidence_excludes_trades_still_open_at_alert_time():
    """A motif confirmed before the alert but not yet RESOLVED contributes to
    n_samples (live counts it too) but never to the PF -- the stated
    conservative divergence in the module docstring."""
    motifs = [FakeMotif(touch_idxs=[0, c - 5], confirm_idx=c) for c in range(100, 120)]
    # Every race resolves long after bar 130.
    raced = {c: {"r": 1.0, "exit_idx": 500} for c in range(100, 120)}
    conf = CausalConfidence(motifs, raced)
    at_130 = conf.at(130, 2, True)
    assert at_130["n_samples"] == 20                 # all counted as samples
    assert at_130["n_raced"] == 0                    # none counted in the PF
    assert at_130["profit_factor"] is None


def test_confidence_separates_categories():
    """Panels are per (n_touches, side) on that pair -- a 3-touch bottom must
    never borrow a 2-touch top's history."""
    tops = [FakeMotif(touch_idxs=[0, c - 5], confirm_idx=c, n_touches=2, is_top=True)
            for c in range(100, 120)]
    bottoms = [FakeMotif(touch_idxs=[0, c - 5], confirm_idx=c, n_touches=3, is_top=False)
               for c in range(100, 105)]
    raced = {c: {"r": 1.0, "exit_idx": c + 1} for c in range(100, 120)}
    conf = CausalConfidence(tops + bottoms, raced)
    assert conf.at(119, 2, True)["n_samples"] == 19
    assert conf.at(119, 3, False) is None            # only 5 -> under the floor


def test_confidence_played_out_rate_is_causal_too():
    """The `% played out` figure is sliced by the same cutoff as the PF."""
    motifs = ([FakeMotif(touch_idxs=[0, c - 5], confirm_idx=c, played_out=True)
               for c in range(100, 120)]
              + [FakeMotif(touch_idxs=[0, c - 5], confirm_idx=c, played_out=False)
                 for c in range(120, 140)])
    raced = {c: {"r": 1.0, "exit_idx": c + 1} for c in range(100, 140)}
    conf = CausalConfidence(motifs, raced)
    # At bar 120 only the all-played-out half exists yet.
    assert conf.at(120, 2, True)["played_out_rate"] == 1.0
    # By the end, half and half -- the later failures are visible only later.
    assert conf.at(140, 2, True)["played_out_rate"] == 0.5
