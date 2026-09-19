"""motif_policy — the ONE validated live/best-config filter for the touch-motif
strategy, shared by the backtest viewer's ⭐ Best Config button
(AnalogML/motif_alert_backtest.py), the live tracker (AnalogML/motif_track.py)
and the execution bot (motif_bot/motif_bot.py).

Extracted here specifically to AVOID the copy that almost happened: this
session validated "skip swing_regime=with, drop pairs above 2.0p realistic
spread" as the config that actually clears honest costs (motif-alert-backtest
PR #1460's ⭐ Best Config button), and the live plan producer (motif_track.py)
needs the EXACT same rule to build motif_bot_plan — if that rule were
hand-copied into motif_track.py, the two would agree today and silently
diverge the next time either is edited (the "bit-identical port" failure
mode CLAUDE.md's Lego Principle exists to kill). One function, two callers,
zero chance of drift.

RETAIL_SPREAD_PIPS are per-pair ESTIMATES for a raw-spread account with
commission folded in (~0.7 pip round trip) — NOT measured fills. Replace them
with your broker's own averages before trusting a number derived from them.
They exist because pylego.costs.DEFAULT_SPREAD_PIPS prices every FX pair at a
flat 0.8 pips (1.0 JPY), which is fair for EURUSD and badly wrong for the
crosses (GBPNZD trades nearer 4 pips) — see motif_alert_backtest.py's own
caveat text for the measured effect (~2.1x modelled, PF 1.15 -> 1.07 on the
ungated book).
"""
from __future__ import annotations

RETAIL_SPREAD_PIPS = {
    "eurusd": 0.8, "usdjpy": 0.9, "gbpusd": 1.0, "audusd": 1.0, "eurgbp": 1.1,
    "usdcad": 1.2, "usdchf": 1.2, "eurjpy": 1.2, "nzdusd": 1.3, "eurchf": 1.4,
    "audjpy": 1.5, "gbpjpy": 1.6, "cadjpy": 1.7, "euraud": 1.7, "audcad": 1.9,
    "audchf": 1.9, "nzdjpy": 1.9, "eurcad": 2.0, "chfjpy": 2.0, "audnzd": 2.2,
    "gbpaud": 2.5, "gbpchf": 2.5, "eurnzd": 2.9, "gbpcad": 2.9, "gbpnzd": 4.2,
    # gold has no meaningful "pip" spread comparison at this scale; callers
    # fall back to pylego.costs.default_spread for it (see passes_best_config).
}

# The two adjustments selected IN-SAMPLE (pre-2023) and held OUT-OF-SAMPLE
# (2023+) on the M1-resolved backtest (PR #1462): skip with-trend swing
# regime, drop pairs whose realistic spread exceeds this many pips. Verified
# (Historical note: the original selection quoted OOS PF 1.268 on 13,480 trades --
# a figure since shown to carry regime lookahead; see the 2026-09-19 note below.)
# No exit-rule adjustment is in this policy -- a tighter stop, a breakeven
# stop and a Chandelier trail were each tested on the M1 path and none beat
# simply trading smaller once verified OOS, so none belongs in "best".
# 2026-09-19: "skip with-trend" replaced by "skip 3-touch motifs". The
# with-trend filter was selected on a swing_regime label that carried 5-bar
# pivot lookahead (MD files/MOTIF_REGIME_LOOKAHEAD_PREREG.md); on causal
# labels it fell to PF 1.145 (spread<=2p, retail cost, 2021-26). Skipping
# 3-touch motifs never depended on the regime: PF 1.175 on the same trades,
# unchanged by the fix, and 1.193 on 2016-2021 -- two independent periods,
# both ahead of unfiltered (1.103), and n_touches is known at confirmation
# by construction. It beats "skip with" on PF, win rate, avg R, total R and
# trade count. Owner's call, taken 2026-09-19.
BEST_CONFIG = {
    "skip_n_touches": 3,        # 3-touch motifs are skipped; 2-touch trade
    "skip_swing_regime": None,  # regime no longer gates (kept as a key so a future re-selection is one line)
    "max_spread_pips": 2.0,
}


# motif_bot's shipped RiskGuard defaults (daily/monthly DD lockout + cooldown),
# centralised here for the same reason BEST_CONFIG is: motif_bot/motif_bot.py's
# DEFAULT_CFG and AnalogML/motif_alert_backtest.py's optional --replay-risk-guard
# both need the SAME numbers, or a backtest replay run against the wrong
# defaults would silently answer a different question than "what would live
# have done" -- exactly the drift this file exists to prevent. A live instance
# with dashboard-configured overrides (KV `motif_bot_config`) is running
# DIFFERENT numbers than these; a replay is only exact when passed those.
RISK_GUARD_DEFAULTS = {
    "ddlimit": 3.0,
    "monthlydd": 5.0,
    "lockout": 3,
    "cooldown": 60,
}


def passes_best_config(pair: str, swing_regime: str | None,
                       spread_pips: float | None = None,
                       n_touches: int | None = None) -> bool:
    """True if a confirmed motif on `pair` is part of the validated best
    config -- i.e. should be paper-tracked as "actionable" and offered to
    the live execution bot. Two gates: the pair's spread (static estimate or
    the live override below) must be <= max_spread_pips, and the motif's
    `n_touches` must not equal skip_n_touches (3-touch motifs are skipped
    since 2026-09-19; see BEST_CONFIG). `swing_regime` is still accepted --
    "with"/"against"/"range"/"unknown"/None, the causal structural read at
    the confirm bar -- and is gated only if BEST_CONFIG names a regime to
    skip (currently None). None/"unknown" on either feature passes: fail
    OPEN on a missing read rather than silently dropping a trade the
    strategy would otherwise take; the spread half is unaffected either way.

    `spread_pips` (2026-09-18), when given, OVERRIDES the static
    RETAIL_SPREAD_PIPS estimate for this call -- pass a live-measured average
    (see `pylego.spread_stats` / motif_bot.py's own sampling loop) so the
    gate judges THIS account's real, currently-observed cost instead of a
    generic modelled guess, which real spread can sit either side of
    depending on session/volatility and on the broker actually used.
    None (the default) keeps the static table -- unchanged behaviour for
    every caller that hasn't been given a live reading."""
    spread = spread_pips if spread_pips is not None else RETAIL_SPREAD_PIPS.get(pair.lower())
    if spread is not None and spread > BEST_CONFIG["max_spread_pips"]:
        return False
    if BEST_CONFIG.get("skip_swing_regime") is not None and swing_regime == BEST_CONFIG["skip_swing_regime"]:
        return False
    if BEST_CONFIG.get("skip_n_touches") is not None and n_touches == BEST_CONFIG["skip_n_touches"]:
        return False
    return True
