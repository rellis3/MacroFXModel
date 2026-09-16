#!/usr/bin/env python3
"""motif_alert_backtest.py — backtest of THE TELEGRAM ALERTS THEMSELVES, not
of the underlying signal.

`motif_backtest_export.py` already races every motif `pylego.motif_touch`
detects. That is the SIGNAL's record. It is NOT the same population as the
messages that actually reach a phone, because the alert path applies its own
gating on top of detection:

  * only ONE touch-run per pair is ever "live" at a time -- `compute_motif_state`
    picks `max(in_progress, key=last touch)`, so a second, older run forming
    simultaneously is silently never alerted;
  * a run is not alerted while `provisional` (fewer than `pivot_n` bars since
    its last touch -- a pivot that the next bar could still invalidate);
  * the 👀 nearing alert fires at most ONCE per touch-run (`log['nearing_alerted']`
    dedup), on the first poll that finds price within `nearing_atr_mult x ATR`
    of the level -- and a run that is never that close is never alerted at all;
  * the 🟢/🔴 confirmed alert needs an entry bar to exist after `confirm_idx`.

This script replays that exact emission path bar by bar and exports, in the
house backtest-card format (`motif_backtest_export.py`'s `{pair, date,
direction, outcome, r, mae_r, return_pct, mae_pct, pnl_dollars, risk_dollars,
is_oos}` trade shape), the trades that each alert actually led to -- plus the
nearing->confirmed FUNNEL, which is the question a 👀 message actually raises:
"I got told this was coming; how often does it arrive, and what happens when
it does?"

TRADES ARE RESOLVED ON THE M1 PATH, not on the H1 bars the motifs are
detected on. At the frozen grid a 20-pip stop and a 30-pip target frequently
sit inside ONE H1 bar's range, and OHLC cannot say which was touched first.
`race_trades` settles that with a flag, but neither setting is the answer: on
six pairs the same entries score 458.2R with ties given to the target (its
default, what this export used to ship) and 333.2R given to the stop, while
the real minutes say 395.7R. The old default therefore overstated total R by
~14%, PF by 1.120 vs 1.103, and understated max drawdown by ~6%.
`race_trades_on_finer_path` removes the guess.

TWO STATED DIVERGENCES FROM LIVE, both unavoidable and both measured rather
than hidden:

1. **Tick vs bar.** `motif_nearing_watch.py` polls a live quote every 60s, so
   it sees intrabar prices. A backtest has H1 bars. `--nearing-price hl`
   (default) tests the bar's whole high/low range against the level -- the
   closest honest proxy for "a tick came within X", since a poller running 60
   times an hour would have seen any price the bar traded through.
   `--nearing-price close` tests the close only; the export reports BOTH
   counts (`funnel.nearing_alerts_hl` / `_close`) so the size of the
   approximation is visible, not assumed away.

2. **Confidence-panel PF.** The `📊 64% played out · PF 0.79 · n=61` panel is
   recomputed live from the pair's own history each scan. Replaying it
   causally means only counting motifs confirmed strictly BEFORE the alert
   bar. `_category_confidence` needs no cutoff live (its bar array ends at
   "now"), so this replay adds one -- without it every panel in this export
   would be lookahead-contaminated. One residual difference: a motif confirmed
   before the alert but still OPEN at alert time is excluded from the replayed
   PF, where live would have raced it to a partial timeout. Those are at most
   `max_bars_ahead` bars' worth against years of history, and excluding them
   is the conservative direction (no result is manufactured from a trade that
   had not finished).

The panel is exported per alert (`shown_*` fields) precisely so the obvious
question can be asked of the data: do alerts that DISPLAY a good PF actually
go on to do better than ones that display a bad one? Nothing in the live alert
path filters on it -- it is shown to a human and nothing more.

Usage:
  python AnalogML/motif_alert_backtest.py --all-pairs
  python AnalogML/motif_alert_backtest.py --pairs gbpusd,gbpcad
  python AnalogML/motif_alert_backtest.py --all-pairs --nearing-price close
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pattern_scan import load_m1_and_bars  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from motif_features import bucket_trade, compute_features  # noqa: E402
from pylego.barrier_race import (  # noqa: E402
    Entry,
    mae_from_path,
    race_trades_on_finer_path,
)
from pylego.costs import default_spread  # noqa: E402
from pylego.instruments import pip_size  # noqa: E402
from pylego.json_safe import json_safe  # noqa: E402
from pylego import motif_policy  # noqa: E402
from pylego.motif_touch import detect_touch_motifs  # noqa: E402
from pylego.risk_guard import simulate_blocks  # noqa: E402
from pylego.portfolio_sim import (  # noqa: E402
    matched_utilization_benchmark,
    pairwise_correlation_summary,
    sharpe_and_dd,
    simulate_portfolio,
)
from pylego.swing_structure import atr as compute_atr  # noqa: E402
from pylego.trade_stats import summarize_r  # noqa: E402

IS_OOS_CUTOFF = "2023-01-01"
DATA_DIR = Path(__file__).resolve().parent / "data"

# Mirrors motif_track.FROZEN / motif_nearing_watch's --nearing-atr-mult default.
# Imported as literals rather than from motif_track because importing that
# module pulls in the R2/Telegram/OANDA side of the live bot, none of which a
# backtest should touch. Kept in one dict so a drift check is a single diff.
FROZEN = dict(atr_period=14, pivot_n=5, tol_atr_mult=1.2, min_retrace_atr_mult=2.5,
              min_bars_between_touches=10, breakout_max_bars=40,
              sl_pips=20.0, tp_r=1.5, max_bars_ahead=200, min_bars_ahead=10)
# Per-pair RETAIL spread estimates -- now the SINGLE copy in pylego.motif_policy
# (used by the live plan producer / execution bot too as of the motif-bot build;
# see that module's own docstring for why it moved rather than growing a second
# hand-typed copy the moment a second consumer needed it).
RETAIL_SPREAD_PIPS = motif_policy.RETAIL_SPREAD_PIPS

NEARING_ATR_MULT = 0.5
MIN_CONFIDENCE_SAMPLES = 10  # _category_confidence's own floor

ALL_PAIRS = [
    "audcad", "audchf", "audjpy", "audnzd", "audusd", "cadjpy", "chfjpy",
    "euraud", "eurcad", "eurchf", "eurgbp", "eurjpy", "eurnzd", "eurusd",
    "gbpaud", "gbpcad", "gbpchf", "gbpjpy", "gbpnzd", "gbpusd", "gold",
    "nzdjpy", "nzdusd", "usdcad", "usdchf", "usdjpy",
]


def _motif_key(pair: str, m) -> str:
    """Byte-identical to motif_track._motif_key -- the alert dedup key, so a
    replayed alert can be matched against the live log by eye."""
    return f"{pair}:{'top' if m.is_top else 'bottom'}:{'-'.join(str(i) for i in m.touch_idxs)}"


def live_motif_per_bar(motifs: list, n: int, breakout_max_bars: int) -> list:
    """`compute_motif_state`'s pick, resolved for every bar at once: the
    in-progress touch-run with the LATEST last touch, or None.

    Live recomputes this from scratch each scan over a bars array ending at
    "now", so a motif counts as in-progress at bar i exactly when its real
    `confirm_idx` is None or still ahead of i, and i is inside its breakout
    horizon. Walking motifs in ASCENDING last-touch order and letting each
    overwrite the bars it covers reproduces `max(..., key=last touch)` without
    an inner scan per bar -- a later run always wins the bars it shares with an
    earlier one, which is the whole point of the live `max`."""
    live: list = [None] * n
    for m in sorted(motifs, key=lambda m: m.touch_idxs[-1]):
        start = m.touch_idxs[-1]
        horizon_end = start + breakout_max_bars
        # Confirmed at c => in-progress only strictly before c (at c the live
        # detector would already report confirm_idx, so it leaves the panel).
        last = min(horizon_end, (m.confirm_idx - 1) if m.confirm_idx is not None else n - 1, n - 1)
        for i in range(start, last + 1):
            live[i] = m
    return live


class CausalConfidence:
    """The `📊 played out · PF · n` panel, as it would have read AT a given bar.

    Same category slicing as `_category_confidence` (same `n_touches`, same
    side, same pair) and the same `< MIN_CONFIDENCE_SAMPLES -> None` floor, but
    counting only motifs confirmed strictly before the query bar. Backed by
    per-category numpy arrays so each query is a handful of vector ops rather
    than a re-race."""

    def __init__(self, motifs: list, raced_by_confirm: dict):
        self.cats: dict = {}
        for m in motifs:
            if m.confirm_idx is None:
                continue
            key = (m.n_touches, m.is_top)
            c = self.cats.setdefault(key, {"confirm": [], "played": [], "r": [], "exit": []})
            raced = raced_by_confirm.get(m.confirm_idx)
            c["confirm"].append(m.confirm_idx)
            c["played"].append(bool(m.played_out))
            # nan r / exit -1 marks "detected but never raced" (no forward
            # runway at the frozen min_bars_ahead) -- counted in n_samples and
            # played_out_rate exactly as live does, excluded from PF.
            c["r"].append(raced["r"] if raced else np.nan)
            c["exit"].append(raced["exit_idx"] if raced else -1)
        for c in self.cats.values():
            order = np.argsort(np.asarray(c["confirm"]))
            c["confirm"] = np.asarray(c["confirm"])[order]
            c["played"] = np.asarray(c["played"])[order]
            c["r"] = np.asarray(c["r"], dtype=np.float64)[order]
            c["exit"] = np.asarray(c["exit"])[order]

    def at(self, bar: int, n_touches: int, is_top: bool) -> dict | None:
        c = self.cats.get((n_touches, is_top))
        if c is None:
            return None
        known = c["confirm"] < bar
        n_samples = int(known.sum())
        if n_samples < MIN_CONFIDENCE_SAMPLES:
            return None
        played_out_rate = float(c["played"][known].mean())
        # Resolved BY the query bar -- see the module docstring's divergence 2.
        resolved = known & (c["exit"] >= 0) & (c["exit"] <= bar)
        r = c["r"][resolved]
        r = r[~np.isnan(r)]
        if len(r) < MIN_CONFIDENCE_SAMPLES:
            return {"n_samples": n_samples, "played_out_rate": round(played_out_rate, 3),
                    "profit_factor": None, "avg_r": None, "n_raced": int(len(r))}
        s = summarize_r(r)
        pf = s["profit_factor"]
        return {"n_samples": n_samples, "played_out_rate": round(played_out_rate, 3),
                "profit_factor": None if not np.isfinite(pf) else round(pf, 2),
                "avg_r": round(s["avg_r"], 3), "n_raced": int(len(r)),
                "win_rate": round(s["win_rate"], 3)}


def build_pair(pair: str, args: argparse.Namespace) -> dict:
    """Replay one pair's full alert stream and attach each alert's trade."""
    # Signals are detected on the resampled frame; trades are RESOLVED on
    # the M1 path. An H1 bar whose range covers both the 20-pip stop and
    # the 30-pip target cannot say which came first, and resolving that
    # tie in the target's favour (race_trades' default) overstated total R
    # by ~14% against the real minutes -- measured, not assumed.
    m1, bars = load_m1_and_bars(pair, args.timeframe)
    n = len(bars)
    atr_arr = compute_atr(bars, period=args.atr_period)
    motifs = detect_touch_motifs(
        bars, atr_arr, pivot_n=args.pivot_n, tol_atr_mult=args.tol_atr_mult,
        min_retrace_atr_mult=args.min_retrace_atr_mult,
        min_bars_between_touches=args.min_bars_between_touches,
        breakout_max_bars=args.breakout_max_bars,
    )

    pip = pip_size(pair)
    sl_price = args.sl_pips * pip
    cost_price = default_spread(pair)
    account_risk_dollars = args.account_size * args.risk_pct
    cutoff = pd.Timestamp(IS_OOS_CUTOFF, tz=bars.index.tz)

    highs, lows, closes, opens = (bars[c].to_numpy() for c in ("high", "low", "close", "open"))
    # Context features at entry. The confluence study found several of these
    # genuinely separate outcomes -- the H1 swing regime most of all -- so the
    # backtest carries them per trade rather than leaving them study-only.
    # Shared with that study via motif_features, one computation.
    feats = compute_features(pair, bars, args)

    # ---- every confirmed motif's trade, raced once on the real bar path ----
    # scan_pair_motif's contract: entry is the OPEN of the bar after confirmation.
    confirmed = [m for m in motifs if m.confirm_idx is not None and m.confirm_idx + 1 < n]
    entries = [Entry(idx=m.confirm_idx + 1, direction=m.direction) for m in confirmed]
    by_entry_idx = {m.confirm_idx + 1: m for m in confirmed}
    raced = race_trades_on_finer_path(bars, m1, entries, sl=sl_price, tp_r=args.tp_r,
                                      max_bars_ahead=args.max_bars_ahead,
                                      cost_price=cost_price,
                                      min_bars_ahead=args.min_bars_ahead)
    raced_nocost = race_trades_on_finer_path(bars, m1, entries, sl=sl_price, tp_r=args.tp_r,
                                             max_bars_ahead=args.max_bars_ahead,
                                             cost_price=0.0,
                                             min_bars_ahead=args.min_bars_ahead)
    nocost_r_by_idx = {t["idx"]: t["r"] for t in raced_nocost}
    raced_by_entry = {t["idx"]: t for t in raced}
    # Keyed by confirm_idx for the confidence panel (which thinks in motifs).
    raced_by_confirm = {idx - 1: t for idx, t in raced_by_entry.items()}
    confidence = CausalConfidence(motifs, raced_by_confirm)

    # ---- 👀 nearing alerts: replay the poller ----
    live = live_motif_per_bar(motifs, n, args.breakout_max_bars)
    nearing_by_key: dict = {}
    nearing_alerted_close = 0
    for i in range(n):
        m = live[i]
        if m is None:
            continue
        key = _motif_key(pair, m)
        if key in nearing_by_key:
            continue  # log['nearing_alerted'] dedup -- one per touch-run, ever
        if (i - m.touch_idxs[-1]) < args.pivot_n:
            continue  # `provisional` -- compute_motif_state refuses to alert
        a = atr_arr[i]
        if not np.isfinite(a) or a <= 0:
            continue
        threshold = args.nearing_atr_mult * a
        # Distance from the level to the bar's traded range: 0 while the bar
        # straddles the level. `close` mode collapses that range to one point.
        dist_hl = max(0.0, max(lows[i] - m.level, m.level - highs[i]))
        dist_close = abs(closes[i] - m.level)
        near_hl, near_close = dist_hl <= threshold, dist_close <= threshold
        if near_close:
            nearing_alerted_close += 1
        if not (near_close if args.nearing_price == "close" else near_hl):
            continue
        shown = confidence.at(i, m.n_touches, m.is_top)
        nearing_by_key[key] = {
            "pair": pair, "kind": "nearing", "motif_key": key,
            "alert_idx": int(i), "alert_date": bars.index[i].isoformat(),
            "n_touches": m.n_touches, "is_top": bool(m.is_top),
            "level": round(float(m.level), 5),
            "price_at_alert": round(float(closes[i]), 5),
            "dist_to_level_pips": round((dist_close if args.nearing_price == "close" else dist_hl) / pip, 1),
            # What the 🧭 line says -- the pattern's textbook expectation, which
            # is NOT the direction the eventual trade necessarily takes.
            "textbook_direction": "SELL" if m.is_top else "BUY",
            "shown_played_out_rate": shown["played_out_rate"] if shown else None,
            "shown_pf": shown["profit_factor"] if shown else None,
            "shown_n": shown["n_samples"] if shown else None,
        }

    # ---- 🟢/🔴 confirmed alerts + the trade each one led to ----
    trades, alerts = [], []
    nocost_r: list[float] = []
    for m in confirmed:
        entry_idx = m.confirm_idx + 1
        key = _motif_key(pair, m)
        near = nearing_by_key.get(key)
        t = raced_by_entry.get(entry_idx)
        entry_date = bars.index[entry_idx]
        shown = confidence.at(m.confirm_idx, m.n_touches, m.is_top)
        alert = {
            "pair": pair, "kind": "confirmed", "motif_key": key,
            "alert_idx": int(m.confirm_idx), "alert_date": bars.index[m.confirm_idx].isoformat(),
            "n_touches": m.n_touches, "is_top": bool(m.is_top),
            "level": round(float(m.level), 5),
            "direction": "BUY" if m.direction == 1 else "SELL",
            "played_out": bool(m.played_out),
            "entry_date": entry_date.isoformat(),
            "entry_price": round(float(opens[entry_idx]), 5),
            "had_nearing_alert": near is not None,
            "bars_from_nearing": int(m.confirm_idx - near["alert_idx"]) if near else None,
            "shown_played_out_rate": shown["played_out_rate"] if shown else None,
            "shown_pf": shown["profit_factor"] if shown else None,
            "shown_n": shown["n_samples"] if shown else None,
            "resolved": t is not None,
        }
        if t is not None:
            # MAE on the M1 path too: the H1 exit bar's full range extends
            # past the actual exit minute, which inflates it.
            mae_r, mae_pct = mae_from_path(m1, t["fine_entry_idx"], t["fine_exit_idx"],
                                           t["direction"], t["entry_price"], sl_price)
            price_return_pct = t["direction"] * (t["exit_price"] - t["entry_price"]) / t["entry_price"] * 100.0
            trade = {
                "pair": pair,
                "date": entry_date.strftime("%Y-%m-%d"),
                "entry_date": entry_date.isoformat(),
                "exit_date": bars.index[t["exit_idx"]].isoformat(),
                "direction": "BUY" if t["direction"] == 1 else "SELL",
                "outcome": t["outcome"],
                # The three levels the trade actually ran against, so a viewer
                # can draw entry/stop/target on the real candles without
                # re-deriving them (and risking a viewer that disagrees with
                # the race that produced `r`). Taken from the raced entry
                # price, not re-read from the bar, for exactly that reason.
                "entry_price": round(t["entry_price"], 5),
                "stop_price": round(t["entry_price"] - t["direction"] * sl_price, 5),
                "target_price": round(t["entry_price"] + t["direction"] * sl_price * args.tp_r, 5),
                "exit_price": round(t["exit_price"], 5),
                "n_touches": m.n_touches,
                "is_top": bool(m.is_top),
                "r": round(t["r"], 4),
                "mae_r": round(mae_r, 4),
                "return_pct": round(price_return_pct, 4),
                "mae_pct": round(mae_pct, 4),
                "pnl_dollars": round(t["r"] * account_risk_dollars, 2),
                "risk_dollars": round(account_risk_dollars, 2),
                "is_oos": "OOS" if entry_date >= cutoff else "IS",
                # Read at the CONFIRM bar; entry is the next bar's open, so
                # nothing here sees its own trade.
                "features": bucket_trade(feats, m.confirm_idx, m.direction,
                                         float(m.level), pip),
                # The alert-path tags this export exists for.
                "motif_key": key,
                "had_nearing_alert": near is not None,
                "shown_pf": alert["shown_pf"],
                "shown_played_out_rate": alert["shown_played_out_rate"],
            }
            trades.append(trade)
            alert.update({"outcome": t["outcome"], "r": round(t["r"], 4),
                          "exit_date": bars.index[t["exit_idx"]].isoformat()})
            if entry_idx in nocost_r_by_idx:
                nocost_r.append(nocost_r_by_idx[entry_idx])
        alerts.append(alert)

    # ---- link each 👀 to what it went on to do ----
    confirmed_keys = {_motif_key(pair, m) for m in confirmed}
    resolved_keys = {a["motif_key"] for a in alerts if a["resolved"]}
    for key, na in nearing_by_key.items():
        na["converted"] = key in confirmed_keys
        na["resolved"] = key in resolved_keys
    alerts.extend(nearing_by_key.values())
    alerts.sort(key=lambda a: a["alert_idx"])

    n_near = len(nearing_by_key)
    converted = sum(1 for a in nearing_by_key.values() if a["converted"])
    return {
        "pair": pair, "alerts": alerts, "trades": trades, "nocost_r": nocost_r,
        "funnel": {
            "bars": n,
            "first_bar": bars.index[0].isoformat(), "last_bar": bars.index[-1].isoformat(),
            "motifs_detected": len(motifs),
            "motifs_confirmed": len(confirmed),
            "nearing_alerts": n_near,
            "nearing_alerts_close": nearing_alerted_close,
            "nearing_converted": converted,
            "nearing_conversion_rate": round(converted / n_near, 3) if n_near else None,
            "confirmed_alerts": len(alerts) - n_near,
            "confirmed_with_prior_nearing": sum(1 for a in alerts
                                                if a["kind"] == "confirmed" and a["had_nearing_alert"]),
            "trades_resolved": len(trades),
        },
    }


def encode_features(trades: list[dict]) -> dict:
    """Replace each trade's `features` dict with a compact integer array plus
    one shared legend.

    Verbatim string buckets on every trade cost ~950 bytes each -- on 30k
    trades that is ~29MB, roughly doubling the export for data that is 17 short
    labels drawn from a handful of values. The legend holds the vocabulary once
    (`{dim: [bucket, ...]}`, dims sorted so the array order is stable) and each
    trade keeps `f`: one index per dim, -1 for a bucket that was absent. Same
    information, ~40 bytes a trade."""
    dims: dict[str, list] = {}
    for t in trades:
        for dim, bucket in (t.get("features") or {}).items():
            dims.setdefault(dim, set()).add(bucket)
    legend = {d: sorted(v) for d, v in sorted(dims.items())}
    order = list(legend)
    pos = {d: {b: i for i, b in enumerate(legend[d])} for d in order}
    for t in trades:
        f = t.pop("features", None) or {}
        t["f"] = [pos[d].get(f.get(d), -1) for d in order]
    return {"dims": order, "buckets": legend}


def _strip_curve(bench: dict) -> dict:
    """Drop the nested equity curve from a matched-utilization benchmark. Its
    points are (Timestamp, float) pairs, which `json_safe` passes through
    untouched (it only sanitizes NaN/inf) and `json.dump` then refuses -- and
    only the benchmark's Sharpe/DD stats are ever read, never its curve."""
    if bench.get("result"):
        bench["result"] = {k: v for k, v in bench["result"].items() if k != "equity_curve"}
    return bench


def split_summary(trades: list[dict]) -> dict:
    return {
        "is": summarize_r(t["r"] for t in trades if t["is_oos"] == "IS"),
        "oos": summarize_r(t["r"] for t in trades if t["is_oos"] == "OOS"),
        "full": summarize_r(t["r"] for t in trades),
    }


def yearly_folds(trades: list[dict]) -> list[dict]:
    """Calendar-year walk-forward folds, the same read motif_walkforward.py
    grades the raw signal by -- repeated here on the ALERT population so the
    two can be compared fold for fold rather than only in aggregate."""
    by_year: dict = {}
    for t in trades:
        by_year.setdefault(t["entry_date"][:4], []).append(t["r"])
    return [{"year": y, **summarize_r(rs)} for y, rs in sorted(by_year.items())]


def confidence_buckets(trades: list[dict]) -> list[dict]:
    """Did the PF the alert DISPLAYED predict anything? Buckets every trade by
    the `📊 PF` its own message showed at the time and grades each bucket by
    what actually happened next. Nothing in the live path filters on this
    number -- this is the check of whether it deserves to be read as guidance."""
    edges = [(None, 0.9, "< 0.90"), (0.9, 1.0, "0.90–1.00"), (1.0, 1.1, "1.00–1.10"),
             (1.1, 1.25, "1.10–1.25"), (1.25, None, "≥ 1.25")]
    out = []
    shown_none = [t["r"] for t in trades if t.get("shown_pf") is None]
    for lo, hi, label in edges:
        rs = [t["r"] for t in trades if t.get("shown_pf") is not None
              and (lo is None or t["shown_pf"] >= lo) and (hi is None or t["shown_pf"] < hi)]
        out.append({"bucket": label, **summarize_r(rs)})
    out.append({"bucket": "no panel shown (n<10)", **summarize_r(shown_none)})
    return out


def replay_risk_guard(trades: list[dict], cfg: dict, starting_balance: float,
                       risk_pct: float) -> dict:
    """Opt-in (`--replay-risk-guard`): reduce the alert stream to the SAME
    population motif_bot actually acts on -- `motif_policy.passes_best_config`
    on each trade's own `features.swing_regime`, exactly what motif_track.py
    applies when it builds `motif_bot_plan` -- then replay it through
    `pylego.risk_guard.simulate_blocks`, the live bot's own RiskGuard state
    machine driven by a fake clock instead of the real one.

    This is the direct answer to "does live's daily/monthly DD lockout and
    cooldown exist in the backtest": before this, it did not -- the backtest
    took every filtered trade unconditionally. `cfg` should be the live bot's
    actual ddlimit/monthlydd/lockout/cooldown (its DEFAULT_CFG values unless
    the dashboard config overrides them) so a replay run today answers "what
    would live have taken", not a guess at different numbers.
    """
    gated = [t for t in trades
             if motif_policy.passes_best_config(t["pair"], t.get("features", {}).get("swing_regime"))]
    keyed = [(pd.Timestamp(t["entry_date"]).timestamp(), t["pair"], t["r"], t["motif_key"]) for t in gated]
    keyed.sort(key=lambda k: k[0])
    sim_trades = [(epoch, pair, r) for epoch, pair, r, _ in keyed]
    results = simulate_blocks(sim_trades, cfg, starting_balance=starting_balance, risk_pct=risk_pct)

    by_key = {}
    equity_curve = []
    n_taken = n_blocked = 0
    blocked_by_kind: dict[str, int] = {}
    for (epoch, pair, r, motif_key), res in zip(keyed, results):
        by_key[motif_key] = {"taken": res["taken"], "reason": res["reason"]}
        if res["taken"]:
            n_taken += 1
            equity_curve.append([datetime.fromtimestamp(epoch, timezone.utc).isoformat(), round(res["balance_after"], 2)])
        else:
            n_blocked += 1
            kind = "cooldown" if "Cooldown" in (res["reason"] or "") else \
                   "locked_out" if "Locked out" in (res["reason"] or "") else \
                   "monthly_dd" if "Monthly DD" in (res["reason"] or "") else \
                   "daily_dd" if "Daily DD" in (res["reason"] or "") else "other"
            blocked_by_kind[kind] = blocked_by_kind.get(kind, 0) + 1

    final_balance = equity_curve[-1][1] if equity_curve else starting_balance
    peak = starting_balance
    max_dd_pct = 0.0
    for _, bal in equity_curve:
        peak = max(peak, bal)
        max_dd_pct = max(max_dd_pct, (peak - bal) / peak * 100 if peak else 0.0)

    return {
        "cfg": cfg,
        "starting_balance": starting_balance,
        "risk_pct": risk_pct,
        "best_config_trades": len(gated),
        "taken": n_taken,
        "blocked": n_blocked,
        "blocked_by_kind": blocked_by_kind,
        "final_balance": round(final_balance, 2),
        "max_drawdown_pct": round(max_dd_pct, 2),
        "equity_curve": equity_curve,
        # Keyed by motif_key so a viewer can cross-reference against `trades`
        # without re-deriving the best-config filter or the guard's decisions.
        "by_motif_key": by_key,
    }


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--pairs", default=None, help="comma-separated; default is --all-pairs")
    p.add_argument("--all-pairs", action="store_true")
    p.add_argument("--timeframe", default="1h")
    p.add_argument("--atr-period", type=int, default=FROZEN["atr_period"])
    p.add_argument("--pivot-n", type=int, default=FROZEN["pivot_n"])
    p.add_argument("--tol-atr-mult", type=float, default=FROZEN["tol_atr_mult"])
    p.add_argument("--min-retrace-atr-mult", type=float, default=FROZEN["min_retrace_atr_mult"])
    p.add_argument("--min-bars-between-touches", type=int, default=FROZEN["min_bars_between_touches"])
    p.add_argument("--breakout-max-bars", type=int, default=FROZEN["breakout_max_bars"])
    p.add_argument("--sl-pips", type=float, default=FROZEN["sl_pips"])
    p.add_argument("--tp-r", type=float, default=FROZEN["tp_r"])
    p.add_argument("--max-bars-ahead", type=int, default=FROZEN["max_bars_ahead"])
    p.add_argument("--min-bars-ahead", type=int, default=FROZEN["min_bars_ahead"])
    p.add_argument("--nearing-atr-mult", type=float, default=NEARING_ATR_MULT)
    p.add_argument("--nearing-price", choices=("hl", "close"), default="hl",
                   help="hl (default): the bar's whole range, the honest proxy for a 60s "
                        "tick poller. close: the bar close only -- strictly fewer alerts.")
    p.add_argument("--include-alerts", action="store_true",
                   help="also embed the raw per-alert stream. Off by default: it roughly "
                        "TRIPLES the export (41k alerts vs 30k trades on the full book) and the "
                        "viewer needs none of it -- every confirmed alert is already a trade row "
                        "tagged `had_nearing_alert`, and the nearing runs that never converted "
                        "are summarised in each pair's `funnel`.")
    p.add_argument("--account-size", type=float, default=10000.0)
    p.add_argument("--risk-pct", type=float, default=0.01)
    p.add_argument("--max-concurrent-risk-pct", type=float, default=0.05)
    p.add_argument("--replay-risk-guard", action="store_true",
                   help="also replay motif_bot's live RiskGuard (daily/monthly DD lockout + "
                        "cooldown) over the best-config trade population, so this backtest can "
                        "answer 'which of these would the live bot actually have taken' -- see "
                        "replay_risk_guard()'s own doc. Off by default: it re-sorts and re-walks "
                        "the whole trade population an extra time for a question most callers "
                        "(the ⭐ Best Config viewer, capacity/cost-sensitivity re-pricing) don't ask.")
    p.add_argument("--replay-risk-pct", type=float, default=0.25,
                   help="percent-of-balance risk per trade for the RiskGuard replay's OWN "
                        "compounding balance (NOT the same convention as --risk-pct above, which "
                        "is a fraction of --account-size for the dollar PnL columns). Defaults to "
                        "motif_bot's own shipped 0.25%% (DEFAULT_CFG['risk_pct'] -- not in "
                        "motif_policy.RISK_GUARD_DEFAULTS since pylego.risk_guard.RiskGuard.sync_cfg "
                        "never reads it, only pylego.sizing does) so a replay with no live-bot "
                        "dashboard overrides matches production exactly.")
    p.add_argument("--replay-ddlimit", type=float, default=motif_policy.RISK_GUARD_DEFAULTS["ddlimit"])
    p.add_argument("--replay-monthlydd", type=float, default=motif_policy.RISK_GUARD_DEFAULTS["monthlydd"])
    p.add_argument("--replay-lockout", type=float, default=motif_policy.RISK_GUARD_DEFAULTS["lockout"])
    p.add_argument("--replay-cooldown", type=float, default=motif_policy.RISK_GUARD_DEFAULTS["cooldown"])
    p.add_argument("--out", default=str(DATA_DIR / "motif_alert_backtest.json"))
    args = p.parse_args()

    pairs = args.pairs.split(",") if args.pairs else ALL_PAIRS
    all_trades: list[dict] = []
    all_alerts: list[dict] = []
    all_nocost_r: list[float] = []
    per_pair = []
    for pair in pairs:
        res = build_pair(pair, args)
        all_trades.extend(res["trades"])
        all_alerts.extend(res["alerts"])
        all_nocost_r.extend(res["nocost_r"])
        summary = split_summary(res["trades"])
        per_pair.append({"pair": pair, "funnel": res["funnel"], **summary})
        f = res["funnel"]
        print(f"  {pair:<8} 👀 {f['nearing_alerts']:>4} nearing "
              f"({f['nearing_conversion_rate'] if f['nearing_conversion_rate'] is not None else 0:.0%} converted)"
              f"  ✅ {f['confirmed_alerts']:>4} confirmed"
              f"  {len(res['trades']):>4} trades  full PF={summary['full']['profit_factor']:.2f}")

    overall = split_summary(all_trades)
    # simulate_portfolio sorts and subtracts entry/exit dates, so it needs real
    # Timestamps; the exported trades keep ISO strings for the JSON viewer.
    sim_trades = [{**t, "entry_date": pd.Timestamp(t["entry_date"]),
                   "exit_date": pd.Timestamp(t["exit_date"])} for t in all_trades]
    port = simulate_portfolio(sim_trades, args.risk_pct, args.max_concurrent_risk_pct)
    port_stats = sharpe_and_dd(port["equity_curve"])
    near_all = [a for a in all_alerts if a["kind"] == "nearing"]
    converted = sum(1 for a in near_all if a["converted"])

    risk_guard_replay = None
    if args.replay_risk_guard:
        replay_cfg = {"ddlimit": args.replay_ddlimit, "monthlydd": args.replay_monthlydd,
                      "lockout": args.replay_lockout, "cooldown": args.replay_cooldown}
        risk_guard_replay = replay_risk_guard(all_trades, replay_cfg, args.account_size,
                                              args.replay_risk_pct)
        print(f"\n[risk-guard replay] {risk_guard_replay['best_config_trades']} best-config trades -> "
              f"{risk_guard_replay['taken']} taken, {risk_guard_replay['blocked']} blocked "
              f"{risk_guard_replay['blocked_by_kind']}  "
              f"final=${risk_guard_replay['final_balance']:,.2f}  "
              f"maxDD={risk_guard_replay['max_drawdown_pct']:.1f}%")

    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "params": {**{k: getattr(args, k) for k in (
            "timeframe", "atr_period", "pivot_n", "tol_atr_mult", "min_retrace_atr_mult",
            "min_bars_between_touches", "breakout_max_bars", "sl_pips", "tp_r",
            "max_bars_ahead", "min_bars_ahead", "nearing_atr_mult", "nearing_price",
            "account_size", "risk_pct", "max_concurrent_risk_pct")},
            "is_oos_cutoff": IS_OOS_CUTOFF},
        "caveat": (
            "Backtest of the TELEGRAM ALERT STREAM, not of the raw signal -- replays "
            "motif_track.py/motif_nearing_watch.py's own emission gating (one live touch-run "
            "per pair, the `provisional` refusal, one-nearing-alert-per-run dedup, entry on the "
            "bar after confirmation) and races only what would actually have been sent. "
            "Trades are scored by the shared pylego.barrier_race walker at the frozen grid, RESOLVED "
            "ON THE M1 PATH: at a 20-pip stop and a 30-pip target one H1 bar often covers both "
            "barriers and cannot say which came first, and awarding those ties to the target "
            "(the previous behaviour, still the walker's default) overstated total R by ~14% "
            "against the real minutes on a six-pair check. Signal detection stays on H1. "
            "TWO STATED DIVERGENCES FROM LIVE, both measured rather than assumed away: (1) the "
            "nearing poller sees live ticks, a backtest sees H1 bars -- `nearing_price=hl` tests "
            "the bar's whole traded range as the closest proxy, and funnel.nearing_alerts_close "
            "reports the strictly-tighter close-only count beside it; (2) the confidence panel is "
            "replayed with a causal cutoff (motifs confirmed strictly before the alert bar), which "
            "live does not need, and a motif confirmed-but-still-open at alert time is excluded "
            "from the replayed PF where live would have raced it to a partial timeout. "
            "This is a VIEWER of an already-validated signal, not a new validation: it re-tunes "
            "nothing. Sharpe/DD are mark-to-close with no spread variation, the same caveat every "
            "pylego.portfolio_sim caller carries."
        ),
        "pairs": pairs,
        "summary": {
            **overall,
            "cost_sensitivity": {
                "with_cost": summarize_r(t["r"] for t in all_trades),
                "without_cost": summarize_r(all_nocost_r),
            },
            "portfolio": {
                **port_stats,
                "taken": port["taken"], "skipped": port["skipped"],
                "final_equity": port["final_equity"],
                "avg_utilization": port["avg_utilization"],
                "avg_pairwise_correlation": pairwise_correlation_summary(sim_trades),
                "matched_utilization": _strip_curve(matched_utilization_benchmark(
                    sim_trades, args.risk_pct, args.max_concurrent_risk_pct)),
            },
            "funnel": {
                "nearing_alerts": len(near_all),
                "nearing_converted": converted,
                "nearing_conversion_rate": round(converted / len(near_all), 3) if near_all else None,
                "confirmed_alerts": sum(1 for a in all_alerts if a["kind"] == "confirmed"),
                "trades_resolved": len(all_trades),
            },
        },
        "yearly": yearly_folds(all_trades),
        "confidence_buckets": confidence_buckets(all_trades),
        "with_vs_without_nearing": {
            "with_nearing": summarize_r(t["r"] for t in all_trades if t["had_nearing_alert"]),
            "without_nearing": summarize_r(t["r"] for t in all_trades if not t["had_nearing_alert"]),
        },
        "equity_curve": [[d.isoformat() if hasattr(d, "isoformat") else str(d), round(e, 6)]
                         for d, e in port["equity_curve"]],
        # Each pair's round-trip cost expressed in R (spread / stop distance).
        # Constant per pair because the stop is a fixed 20 pips, which is what
        # lets a viewer re-price every trade at a MULTIPLE of today's cost
        # (the capacity test) without re-racing: R(k) = R(1) - (k-1) * cost_r.
        "pair_cost_r": {p_: round(default_spread(p_) / (args.sl_pips * pip_size(p_)), 5)
                        for p_ in pairs},
        # The same figure at RETAIL spreads (see RETAIL_SPREAD_PIPS). Pairs
        # absent from that table (gold) keep the modelled cost. Same exact
        # re-pricing identity as above, so the viewer can switch cost basis
        # without re-racing: R_retail = R + pair_cost_r - retail_cost_r.
        "retail_cost_r": {
            p_: round((RETAIL_SPREAD_PIPS[p_] * pip_size(p_)) / (args.sl_pips * pip_size(p_)), 5)
            if p_ in RETAIL_SPREAD_PIPS
            else round(default_spread(p_) / (args.sl_pips * pip_size(p_)), 5)
            for p_ in pairs},
        "retail_spread_pips": {p_: RETAIL_SPREAD_PIPS.get(p_) for p_ in pairs},
        "per_pair": per_pair,
        # Written AFTER every other section so `encode_features` has seen every
        # trade's vocabulary before the legend is frozen.
        "feature_legend": encode_features(all_trades),
        "trades": all_trades,
    }
    if args.include_alerts:
        out["alerts"] = all_alerts
    if risk_guard_replay is not None:
        out["risk_guard_replay"] = risk_guard_replay

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w") as f:
        json.dump(json_safe(out), f)
    print(f"\n[export] {len(all_alerts)} alerts, {len(all_trades)} trades, "
          f"{len(pairs)} pairs -> {out_path}")
    print(f"[funnel]  👀 {len(near_all)} nearing -> {converted} converted "
          f"({converted / len(near_all):.1%})" if near_all else "[funnel] no nearing alerts")
    print(f"[overall] IS n={overall['is']['n']} PF={overall['is']['profit_factor']:.2f}  "
          f"OOS n={overall['oos']['n']} PF={overall['oos']['profit_factor']:.2f}")
    print(f"[portfolio] Sharpe {port_stats['sharpe']:.2f}  max DD {port_stats['max_dd']:.1%}  "
          f"util {port['avg_utilization']:.1%}")


if __name__ == "__main__":
    main()
