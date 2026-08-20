#!/usr/bin/env python3
"""motif_track.py — forward paper-tracking + live confidence state for the
FROZEN N-touches-of-a-level structural motif signal (pivot_n=5, tol=1.2xATR,
min_retrace=2.5xATR, min_gap=10 bars, breakout_max_bars=40, sl=20p, tp_r=1.5
-- the setting validated in this same session: full 26-pair sweep 20/26
pairs PF>1.0 (77%), 25/26 beat the mechanical baseline (96%); calendar
IS/OOS split IS PF=1.18 -> OOS PF=1.16 (barely any decay), OOS cost-off
PF=1.24. See `MD files/LEGO_MODULES.md`'s AnalogML entry for the full
validation record, including the k-NN method (pattern_scan.py/paper_track.py)
this REPLACES as the live-tracked signal -- that method banked null on
2026-08-12; this is a structurally different idea (motif/structural-event
matching, not fixed-window Euclidean shape distance), tracked separately.

Two outputs, same disk+R2 persistence pattern as paper_track.py (a SEPARATE
log/state pair -- this does not touch paper_trades.json/shape_state.json,
which stay as the retired k-NN method's historical record):
  - `AnalogML/data/motif_trades.json` -- append-only forward-tracking log.
    Every run: (1) re-races still-`open` logged trades against newly-visible
    bars via the SAME shared barrier walker (pylego.barrier_race), (2) scans
    for motifs that just confirmed and logs any not already recorded (keyed
    by (pair, is_top, touch_idxs) -- stable across runs even if a cadence
    gap means a confirm_idx isn't exactly "the latest bar" this time).
  - `AnalogML/data/motif_state.json` -- the LIVE "what's forming right now"
    diagnostic: for each pair, whichever touch-run is currently IN PROGRESS
    (2-3 touches found, no breakout confirmed yet, still inside its
    breakout_max_bars horizon) -- level, distance-to-level, and a
    `provisional` flag when the last touch is still within `pivot_n` bars of
    "now" (not yet actually confirmable as a genuine pivot -- see
    pylego.motif_touch's docstring on why this matters; a live system that
    ignored this would show phantom setups that get invalidated the moment
    price makes one more new high/low). "Confidence" is the historical
    win-rate/PF/avg-R for THAT category (n_touches, is_top) -- a real,
    already-measured aggregate, never a fabricated per-instance probability.

**Data-access blocker (same as paper_track.py):** this sandbox cannot reach
OANDA (403 policy denial from the outbound proxy, confirmed not assumed).
`--refresh-data` (real forward use, run where OANDA IS reachable) tops up
local parquet via `refresh_m1.py` first, reused not re-implemented. Without
it, this reads the same static local snapshot as everything else.

**Telegram alerts (`--telegram`, 2026-08-13, simplified 2026-08-14, fixed
2026-08-19):** one alert per newly-confirmed motif, via `pylego.telegram`
(a shared brick, not yet another copy of the send_telegram pattern
duplicated across 7+ other bots) sent through the dashboard's `/api/telegram`
proxy (`dashboard_telegram_configured`/`send_via_dashboard`), which uses
the same shared bot/chat every other bot's alerts already use. NOT read
directly via KV -- that key is deliberately outside the generic
`/api/kv/get` whitelist (it's a raw bot token, and that endpoint is
unauthenticated), which is why this used `pylego.kv.KvClient` + the raw
token/chat_id until 2026-08-19: it silently never worked, since day one --
see `pylego/telegram.py`'s own docstring for the full story. The alert shows the
TRACKED frozen-grid entry/SL/TP (unchanged -- everything in
README.md/LEGO_MODULES.md is judged against this, and it stays that way)
alongside ONE "Combined" line -- the adaptive per-category ATR-scaled SL/TP
(`AnalogML/motif_adaptive.py`'s validated sl_pctile=35/tp_pctile=35
constants) with the 1D HTF-conflict size_mult already applied
(`AnalogML/motif_multi_tf.py`'s causal, end-of-bar-safe lookup;
`motif_combined_portfolio_sim.py` validated this exact stack beats either
mechanism alone at 26-pair portfolio scale). NOT applied to the tracked
trade itself -- deliberately, so the record this signal is judged by never
silently drifts; informational only, for a human sizing a manual trade.
Disabled under `--as-of` even if passed (replay/testing only, never live).

**Nearing-level alerts moved to `motif_nearing_watch.py` (2026-08-14,
split out 2026-08-15):** originally lived inline here, gated on this
hourly scan -- moved to a separate, fast-polling script because bundling
"is price now close to an already-known level" into the same expensive
hourly full-rescan meant it could ONLY ever notice as often as the whole
detection pipeline reran, up to an hour late for the one alert where
timeliness matters most. The level itself doesn't need re-detection to
notice proximity to -- it's fixed once a touch-run forms -- so the fast
script polls a cheap live quote (`pylego.quotes.QuoteFeed`) against levels
THIS scan already computed (`compute_motif_state`'s `atr` field, carried
into `motif_state.json`) every `MOTIF_NEARING_POLL_SECONDS` (default 60),
sharing the SAME `log['nearing_alerted']` dedup so the two processes never
double-alert. Confirmation (`format_alert`, above) is untouched and still
only ever fires on an actual H1 close -- this narrows the gap between
"price got close" and "you found out," it can never trade earlier than the
validated rule allows. See `motif_nearing_watch.py`'s own docstring for why
a resting limit/stop order AT the level would silently trade a different,
unvalidated rule (the detector only ever checks bar CLOSES, never intrabar
touches).

**Heartbeat (`--heartbeat-alert TEXT`, 2026-08-14):** sends TEXT via the
shared Telegram config and exits -- no scanning. A scan crashing inside its
own run can't alert about its own crash, so `motif_track_loop.sh` calls
this mode from OUTSIDE the scan after `MOTIF_TRACK_FAIL_THRESHOLD`
(default 3) consecutive scan failures, and once more on recovery -- one
alert per STATE CHANGE (down / back up), never one per failure, so a
single transient blip doesn't page anyone.

Usage:
  python AnalogML/motif_track.py                      # real use (once wired to live data)
  python AnalogML/motif_track.py --telegram            # + alert on each new confirmation
  python AnalogML/motif_track.py --as-of 2026-03-01    # mechanism test, step 1
  python AnalogML/motif_track.py                       # mechanism test, step 2
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pattern_scan import load_bars  # noqa: E402
from motif_multi_tf import DETECT_KW, htf_lean_at  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from pylego.barrier_race import Entry, race_trades  # noqa: E402
from pylego.costs import default_spread  # noqa: E402
from pylego.instruments import pip_size  # noqa: E402
from pylego.motif_touch import detect_touch_motifs  # noqa: E402
from pylego.r2 import r2_client as _r2_client, R2_BUCKET  # noqa: E402
from pylego.swing_structure import atr as compute_atr  # noqa: E402
from pylego.telegram import dashboard_telegram_configured, send_via_dashboard  # noqa: E402
from pylego.trade_stats import summarize_r  # noqa: E402

# Frozen adaptive-sizing multipliers -- from the VALIDATED (sl_pctile=35,
# tp_pctile=35) percentile ablation (AnalogML/motif_adaptive.py, full
# 26-pair confirmation, 2026-08-13): median ATR multiples per category.
# Frozen constants, NOT recomputed live -- this build's own "stop tuning,
# let it run" rule applies to the alert's sizing too, not just the tracked
# frozen-grid record below. Only used to LABEL the alert with a better-
# calibrated level for manual execution; the tracked/logged trade (and
# every backtest number this signal is judged by) stays on the frozen
# sl=20p/tp_r=1.5 grid, untouched.
ADAPTIVE_SIZE_ATR_MULT = {
    (2, False): (1.53, 2.17),  # 2-touch bottom: (sl_mult, tp_mult)
    (2, True): (1.51, 2.15),   # 2-touch top
    (3, False): (1.86, 1.71),  # 3-touch bottom
    (3, True): (1.76, 1.85),   # 3-touch top
}
# Validated in AnalogML/motif_htf_sized.py (full 26-pair confirmation,
# 2026-08-13): sizing down (not skipping -- CONFLICT trades stay net
# positive) on a 1D HTF conflict improved both Sharpe and max DD.
HTF_CONFLICT_SIZE_MULT = 0.5
HTF_TIMEFRAME = "1D"
HTF_LOOKBACK_BARS = 20

ALL_PAIRS = [
    "audcad", "audchf", "audjpy", "audnzd", "audusd", "cadjpy", "chfjpy",
    "euraud", "eurcad", "eurchf", "eurgbp", "eurjpy", "eurnzd", "eurusd",
    "gbpaud", "gbpcad", "gbpchf", "gbpjpy", "gbpnzd", "gbpusd", "gold",
    "nzdjpy", "nzdusd", "usdcad", "usdchf", "usdjpy",
]

FROZEN = dict(atr_period=14, pivot_n=5, tol_atr_mult=1.2, min_retrace_atr_mult=2.5,
             min_bars_between_touches=10, breakout_max_bars=40,
             sl_pips=20.0, tp_r=1.5, max_bars_ahead=200, min_bars_ahead=10)

LOG_PATH = Path(__file__).resolve().parent / "data" / "motif_trades.json"
STATE_PATH = Path(__file__).resolve().parent / "data" / "motif_state.json"

R2_LOG_KEY = "analogml/motif_trades.json"
R2_STATE_KEY = "analogml/motif_state.json"


def load_log() -> dict:
    s3 = _r2_client()
    if s3 is not None:
        try:
            obj = s3.get_object(Bucket=R2_BUCKET, Key=R2_LOG_KEY)
            return json.loads(obj["Body"].read())
        except Exception:
            pass
    if LOG_PATH.exists():
        return json.loads(LOG_PATH.read_text())
    return {"trades": []}


def save_log(log: dict) -> None:
    body = json.dumps(log, indent=2, default=str)
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    LOG_PATH.write_text(body)
    s3 = _r2_client()
    if s3 is not None:
        try:
            s3.put_object(Bucket=R2_BUCKET, Key=R2_LOG_KEY, Body=body.encode("utf-8"),
                          ContentType="application/json")
        except Exception as e:
            print(f"[warn] R2 write failed ({e}) -- local copy at {LOG_PATH} is current, "
                  f"R2 copy may be stale until the next successful run")


def _motif_key(pair: str, m) -> str:
    """Stable identity for a motif instance, independent of which run first
    sees it -- (pair, side, touch bars) never changes once a run has been
    detected, unlike confirm_idx which only exists once it resolves."""
    return f"{pair}:{'top' if m.is_top else 'bottom'}:{'-'.join(str(i) for i in m.touch_idxs)}"


def scan_pair_motif(pair: str, bars: pd.DataFrame, log: dict, motifs: list,
                    params: dict) -> list[tuple[dict, object]]:
    """Logs any motif that confirmed SINCE THE LAST RUN and isn't already
    recorded -- keyed by touch identity (survives a missed run), gated by a
    per-pair watermark (survives a re-run against the same data). The
    watermark is essential: `detect_touch_motifs` re-scans the FULL
    available history every call (cheap, no per-query causal re-scan needed
    -- see its docstring), so without a watermark the FIRST run would log
    every motif ever found across the pair's entire history as "new" (this
    happened during development: 28,524 "new signals" on one run). A fresh
    pair's watermark is seeded at the current latest bar with nothing
    logged -- same "only what's new since last run, never backfill"
    contract as paper_track.py's scan_pair()."""
    n = len(bars)
    watermarks = log.setdefault("watermarks", {})
    last_scanned = watermarks.get(pair)
    if last_scanned is None:
        watermarks[pair] = n - 1
        return []

    already = {t["motif_key"] for t in log["trades"] if t["pair"] == pair}
    pip = pip_size(pair)
    sl_price = params["sl_pips"] * pip
    new = []
    for m in motifs:
        if m.confirm_idx is None or m.confirm_idx <= last_scanned:
            continue
        key = _motif_key(pair, m)
        if key in already:
            continue
        entry_idx = m.confirm_idx + 1
        if entry_idx >= n:
            continue  # confirmed on the very last bar -- no entry bar exists yet
        entry_price = float(bars["open"].to_numpy()[entry_idx])
        tp_price = entry_price + m.direction * sl_price * params["tp_r"]
        sl_level = entry_price - m.direction * sl_price
        new.append(({
            "motif_key": key, "pair": pair,
            "n_touches": m.n_touches, "is_top": m.is_top,
            "level": m.level, "touch_level": m.touch_level,
            "played_out": m.played_out,
            "entry_idx": int(entry_idx), "entry_date": bars.index[entry_idx].isoformat(),
            "direction": "BUY" if m.direction == 1 else "SELL",
            "entry_price": entry_price, "sl_price": sl_level, "tp_price": tp_price,
            "sl_dist": sl_price, "tp_r": params["tp_r"], "status": "open",
            "logged_at": datetime.now(timezone.utc).isoformat(),
        }, m))
    watermarks[pair] = n - 1
    return new


def resolve_open_trades(pair: str, bars: pd.DataFrame, log: dict, params: dict) -> int:
    """Identical mechanism to paper_track.py's resolve_open_trades -- same
    shared barrier walker, same genuine-timeout-only convention.

    Re-derives each trade's position in `bars` fresh, from its recorded
    `entry_date`, rather than trusting the `entry_idx` stored at logging
    time. That stored value is a raw position into whatever bars array
    existed on the run that logged it -- fine as long as the data window's
    start never changes, but caught live 2026-08-19: moving M1_DIR to a
    fresh backfill with a shorter history (5yr vs the previous ~10yr)
    shifted every bar's position, silently stranding 275+ older trades
    forever past `resolve_open_trades`'s old bounds check (entry_idx now
    exceeding the new, shorter array's length) -- they'd never resolve
    again under any data window shorter than the one that logged them.
    `entry_date` is the actual stable identity; re-look-up is cheap and
    immune to the data window ever changing shape again."""
    n = len(bars)
    pip = pip_size(pair)
    sl_price = params["sl_pips"] * pip
    cost_price = default_spread(pair)
    resolved = 0
    for t in log["trades"]:
        if t["pair"] != pair or t["status"] != "open":
            continue
        try:
            entry_ts = pd.Timestamp(t["entry_date"])
            if entry_ts.tzinfo is None:
                entry_ts = entry_ts.tz_localize(bars.index.tz)
            else:
                entry_ts = entry_ts.tz_convert(bars.index.tz)
            entry_idx = bars.index.get_loc(entry_ts)
        except KeyError:
            continue  # entry bar predates the current window or fell in a gap -- try again once more history is cached
        if isinstance(entry_idx, slice):
            entry_idx = entry_idx.start  # duplicate-index edge case; shouldn't happen for real H1 bars
        if entry_idx >= n:
            continue
        direction = 1 if t["direction"] == "BUY" else -1
        entry = Entry(idx=entry_idx, direction=direction, entry_price=t["entry_price"])
        result = race_trades(bars, [entry], sl=sl_price, tp_r=t["tp_r"],
                             max_bars_ahead=params["max_bars_ahead"], cost_price=cost_price,
                             min_bars_ahead=0)
        if not result:
            continue
        r = result[0]
        genuinely_timed_out = (n - 1) >= entry_idx + params["max_bars_ahead"]
        if r["outcome"] in ("tp", "sl") or genuinely_timed_out:
            t["status"] = r["outcome"]
            t["exit_date"] = bars.index[r["exit_idx"]].isoformat()
            t["exit_price"] = r["exit_price"]
            t["r"] = r["r"]
            t["resolved_at"] = datetime.now(timezone.utc).isoformat()
            resolved += 1
    return resolved


def _category_confidence(motifs: list, n_touches: int, is_top: bool) -> dict | None:
    """Historical win-rate/PF/avg-R for confirmed motifs of THIS category
    (same n_touches, same side) on THIS pair -- what actually backs the
    "confidence" shown for a live in-progress setup. Real, already-measured
    aggregate; never a fabricated per-instance probability. None if too few
    samples to mean anything (< 10)."""
    same = [m for m in motifs if m.confirm_idx is not None
           and m.n_touches == n_touches and m.is_top == is_top]
    if len(same) < 10:
        return None
    r_values = [1.5 if m.played_out else -1.0 for m in same]  # tp_r outcome proxy at the frozen grid
    s = summarize_r(r_values)
    played_out_rate = sum(1 for m in same if m.played_out) / len(same)
    return {"n_samples": len(same), "played_out_rate": round(played_out_rate, 3),
            "profit_factor": round(s["profit_factor"], 2), "avg_r": round(s["avg_r"], 3)}


def _htf_lean_for_entry(pair: str, entry_time) -> int | None:
    """Causal 1D lean as of entry_time -- most recently CONFIRMED 1D motif
    known by entry_time (within HTF_LOOKBACK_BARS), same method (and the
    same lookahead-safe end-of-bar cutoff) as motif_multi_tf.py's
    htf_lean_at, reused here rather than reimplemented. None if the pair
    has too little 1D history or nothing confirmed recently enough --
    a real, common state, not an error."""
    htf_bars = load_bars(pair, HTF_TIMEFRAME)
    if len(htf_bars) < 50:
        return None
    bar_duration = htf_bars.index[1] - htf_bars.index[0]
    htf_end = htf_bars.index + bar_duration
    htf_atr = compute_atr(htf_bars, period=FROZEN["atr_period"])
    htf_motifs = detect_touch_motifs(htf_bars, htf_atr, **DETECT_KW)
    confirmed = sorted(
        [(hm.confirm_idx, hm.direction) for hm in htf_motifs if hm.confirm_idx is not None],
        key=lambda c: c[0])
    cutoff_idx_htf = int(htf_end.searchsorted(entry_time, side='right')) - 1
    return htf_lean_at(confirmed, cutoff_idx_htf, HTF_LOOKBACK_BARS)


_DIVIDER = "━" * 16  # "━" heavy horizontal line -- a visual section break Telegram renders consistently


def _confidence_bar(rate: float, width: int = 5) -> str:
    """A tiny text-only bar chart (filled/empty block chars) for a 0-1 rate
    -- the closest thing to a real graphic a plain-text Telegram message can
    show without attaching an image (pylego.telegram only sends text -- see
    its own docstring; a chart/photo attachment would need a NEW sendPhoto
    brick, a separate follow-up, not a formatting change)."""
    filled = round(max(0.0, min(1.0, rate)) * width)
    return "▓" * filled + "░" * (width - filled)  # "▓" filled / "░" empty


def format_alert(pair: str, t: dict, m, atr_arr, htf_lean: int | None, confidence: dict | None,
                 current_price: float | None = None) -> str:
    """Telegram HTML for one new confirmed motif. Two sizing lines, not
    three: "Tracked (frozen grid)" stays -- it is the actual record
    motif_trades.json logs and the ONLY thing every validated Sharpe/PF
    number in README.md/LEGO_MODULES.md is judged against, so it's kept as
    a compact anchor a human can eyeball against the recommendation, never
    silently dropped. The former separate "Adaptive" line is gone -- it was
    pure duplication, the exact same SL/TP now appear inside "Combined"
    below with the HTF-driven size multiplier folded in as well (no more
    separate "1D HTF: ..." line to mentally combine yourself). "Combined"
    is the STACKED adaptive-SL/TP + HTF-conflict-sizing result
    `motif_combined_portfolio_sim.py` validated at 26-pair portfolio scale
    (beats either mechanism alone on both Sharpe and max DD -- see
    AnalogML/README.md). Still NOT applied to the tracked trade itself --
    informational only, for a human sizing a manual trade.

    `current_price` (the freshest close available at scan time -- NOT a
    live tick) drives a "price now" line with explicit drift vs the
    confirmation-bar price. Without it, "Entry: X" read like an instruction
    to go get filled at X right now -- but X is where the market was AT
    CONFIRMATION, up to an hour stale by the time this alert is read, and a
    bare historical number doesn't say that. Relabelled "Confirmed @" and
    the drift line makes the staleness and its direction (better/worse than
    the tracked price) explicit instead of implied."""
    pip = pip_size(pair)
    direction = m.direction
    entry = t["entry_price"]
    entry_atr = atr_arr[m.confirm_idx] if m.confirm_idx < len(atr_arr) else None

    combined_line = ""
    mults = ADAPTIVE_SIZE_ATR_MULT.get((m.n_touches, m.is_top))
    if mults and entry_atr and entry_atr > 0:
        sl_mult, tp_mult = mults
        adaptive_sl_dist, adaptive_tp_dist = sl_mult * entry_atr, tp_mult * entry_atr
        adaptive_sl = entry - direction * adaptive_sl_dist
        adaptive_tp = entry + direction * adaptive_tp_dist
        if htf_lean is None:
            size_mult, htf_reason = 1.0, "no 1D read"
        elif htf_lean == direction:
            size_mult, htf_reason = 1.0, "1D AGREE"
        else:
            size_mult, htf_reason = HTF_CONFLICT_SIZE_MULT, "1D CONFLICT"
        combined_line = (f"\U0001f3c6 <b>Combined (validated best)</b>\n"
                         f"    SL <code>{adaptive_sl:.5f}</code> ({adaptive_sl_dist / pip:.1f}p) "
                         f"· TP <code>{adaptive_tp:.5f}</code> ({adaptive_tp_dist / pip:.1f}p) "
                         f"· <b>{size_mult:.1f}x</b> ({htf_reason})\n")

    conf_line = ""
    if confidence:
        bar = _confidence_bar(confidence["played_out_rate"])
        conf_line = (f"\U0001f4ca {bar} {confidence['played_out_rate'] * 100:.0f}% played out "
                     f"· PF {confidence['profit_factor']:.2f} · n={confidence['n_samples']}\n")

    kind = "top" if m.is_top else "bottom"
    # Direction icon matches the ACTUAL confirmed trade direction, not the
    # pattern's textbook expectation -- a "top" that FAILED (broke UP
    # instead of reversing down, m.played_out=False) is a BUY, and the old
    # is_top-only icon showed a down-triangle for that case regardless,
    # silently wrong exactly when it mattered most (the failure case).
    direction_icon = "\U0001f7e2⬆️" if direction == 1 else "\U0001f534⬇️"  # 🟢⬆️ / 🔴⬇️
    tp_dist_pips = abs(t["tp_price"] - entry) / pip

    price_now_line = ""
    if current_price is not None:
        drift_pips = abs(current_price - entry) / pip
        # For a BUY, a HIGHER current price than the tracked entry is worse
        # (you'd fill higher than the record); for a SELL, a LOWER current
        # price is worse. Same comparison, direction-aware.
        worse = (direction == 1 and current_price > entry) or (direction == -1 and current_price < entry)
        verdict = "worse than tracked" if worse else "better than tracked"
        price_now_line = (f"\U0001f4b9 Price now  <code>{current_price:.5f}</code>  "
                          f"({drift_pips:.1f}p {verdict})\n")

    return (f"{direction_icon} <b>{pair.upper()}</b> · {t['direction']} · {m.n_touches}-touch {kind}\n"
           f"{_DIVIDER}\n"
           f"\U0001f3af <b>Confirmed @</b>  <code>{entry:.5f}</code>  (tracked reference — may be up to 1hr old)\n"
           f"{price_now_line}"
           f"\U0001f4cd <b>Tracked (frozen grid)</b>\n"
           f"    SL <code>{t['sl_price']:.5f}</code> ({t['sl_dist'] / pip:.0f}p) "
           f"· TP <code>{t['tp_price']:.5f}</code> ({tp_dist_pips:.0f}p, {t['tp_r']}R)\n"
           f"{combined_line}{conf_line}"
           f"{_DIVIDER}\n"
           f"<i>Research signal — not a validated live edge. See AnalogML/README.md.</i>")


def compute_motif_state(pair: str, bars: pd.DataFrame, motifs: list, params: dict,
                        atr_arr=None) -> dict | None:
    """The live diagnostic: whichever touch-run is currently IN PROGRESS
    (unconfirmed, still inside its breakout horizon) and most recent. None
    if nothing is currently forming for this pair -- a real, common state,
    not an error. `atr_arr`'s last value is carried into the returned dict
    (as `atr`, price units) so a SEPARATE, fast poller (motif_nearing_watch.py)
    can compute the same ATR-scaled nearing threshold against a fresh live
    quote without re-running detection or re-fetching M1 bars at all -- it
    only needs the level (fixed once the touch-run forms) and this ATR
    snapshot (a volatility scale that doesn't shift meaningfully within an
    hour), both already computed here."""
    n = len(bars)
    in_progress = [m for m in motifs if m.confirm_idx is None
                  and m.touch_idxs[-1] + params["breakout_max_bars"] >= n - 1]
    if not in_progress:
        return None
    live = max(in_progress, key=lambda m: m.touch_idxs[-1])

    last_touch_idx = live.touch_idxs[-1]
    bars_since_last_touch = (n - 1) - last_touch_idx
    provisional = bars_since_last_touch < params["pivot_n"]
    bars_left_in_horizon = params["breakout_max_bars"] - bars_since_last_touch

    pip = pip_size(pair)
    current_price = float(bars["close"].to_numpy()[-1])
    dist_to_level_pips = abs(current_price - live.level) / pip
    dist_to_touch_level_pips = abs(current_price - live.touch_level) / pip

    confidence = _category_confidence(motifs, live.n_touches, live.is_top)
    current_atr = float(atr_arr[-1]) if atr_arr is not None and len(atr_arr) else None

    return {
        "pair": pair, "as_of": bars.index[-1].isoformat(),
        "motif_key": _motif_key(pair, live),
        "kind": "top" if live.is_top else "bottom",
        "n_touches": live.n_touches,
        "touch_dates": [bars.index[i].isoformat() for i in live.touch_idxs],
        "level": round(live.level, 5), "touch_level": round(live.touch_level, 5),
        "current_price": current_price,
        "dist_to_level_pips": round(dist_to_level_pips, 1),
        "dist_to_touch_level_pips": round(dist_to_touch_level_pips, 1),
        "provisional": provisional,
        "bars_since_last_touch": bars_since_last_touch,
        "bars_left_in_horizon": max(0, bars_left_in_horizon),
        "confidence": confidence,
        "atr": round(current_atr, 6) if current_atr and current_atr > 0 else None,
    }


def format_nearing_alert(pair: str, state: dict) -> str:
    """Telegram HTML for a touch-run APPROACHING its breakout level, before
    confirmation -- the early-warning counterpart to format_alert (which
    only fires once a pattern has already confirmed, up to
    MOTIF_TRACK_INTERVAL_SECONDS late). Fires ONCE per touch-run (dedup via
    motif_key in log['nearing_alerted'] -- same identity scheme confirmed
    motifs use), never repeated every scan it stays close, and only once
    the touch-run is no longer `provisional` (still-forming pivots that
    could be invalidated by the next bar shouldn't trigger an alert)."""
    conf_line = ""
    c = state.get("confidence")
    if c:
        bar = _confidence_bar(c["played_out_rate"])
        conf_line = (f"\U0001f4ca {bar} {c['played_out_rate'] * 100:.0f}% played out "
                     f"· PF {c['profit_factor']:.2f} · n={c['n_samples']}\n")
    # Textbook expectation, purely informational -- a top expects a reversal
    # DOWN (SELL), a bottom expects a reversal UP (BUY). Not a claim this
    # WILL happen (the "failure" case breaks the other way, same as
    # format_alert's direction icon fix above) -- just what the pattern's
    # own name implies, worth knowing while it's still forming.
    textbook = "SELL (reversal down)" if state["kind"] == "top" else "BUY (reversal up)"
    return (f"\U0001f440 <b>{pair.upper()}</b> · {state['n_touches']}-touch {state['kind']} · "
           f"nearing breakout\n"
           f"{_DIVIDER}\n"
           f"\U0001f4b9 Price  <code>{state['current_price']:.5f}</code>\n"
           f"\U0001f3af Level  <code>{state['level']:.5f}</code>  "
           f"(<b>{state['dist_to_level_pips']:.1f}p</b> away)\n"
           f"\U0001f9ed If textbook plays out: <b>{textbook}</b>\n"
           f"{conf_line}"
           f"{_DIVIDER}\n"
           f"<i>Not yet confirmed — watch for an H1 close through the level. Research signal, "
           f"not a validated live edge.</i>")


def save_state(states: list[dict]) -> None:
    body = json.dumps({"generated_at": datetime.now(timezone.utc).isoformat(), "pairs": states},
                      default=str)
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(body)
    s3 = _r2_client()
    if s3 is not None:
        try:
            s3.put_object(Bucket=R2_BUCKET, Key=R2_STATE_KEY, Body=body.encode("utf-8"),
                          ContentType="application/json")
        except Exception as e:
            print(f"[warn] R2 motif-state write failed ({e}) -- local copy at "
                  f"{STATE_PATH} is current")


def run(args: argparse.Namespace) -> None:
    pairs = args.pairs.split(",") if args.pairs else ALL_PAIRS

    if args.refresh_data:
        if args.as_of:
            raise SystemExit("--refresh-data and --as-of are mutually exclusive")
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from refresh_m1 import refresh_pair  # noqa: E402
        print("[refresh_m1] topping up local M1 parquet from OANDA before scanning...")
        for pair in pairs:
            try:
                n = refresh_pair(pair)
                if n:
                    print(f"  {pair:<8} +{n} bars")
            except Exception as e:
                print(f"  {pair:<8} refresh failed ({e}) -- scanning against whatever data "
                      f"is already local for this pair")

    tg_ready = False
    if args.telegram:
        if args.as_of:
            print("[telegram] --as-of is a replay/testing run -- not sending live alerts even "
                  "though --telegram was passed")
        else:
            tg_ready = dashboard_telegram_configured(args.dashboard_url)
            if not tg_ready:
                print("[telegram] --telegram passed but the dashboard's shared Telegram config "
                      "isn't set (Alerts modal) -- alerts will be skipped this run")

    log = load_log()
    new_signals, resolved_total, alerts_sent = 0, 0, 0
    states: list[dict] = []
    forming = 0

    for pair in pairs:
        # A single pair's bad data (corrupt cache, a detection-logic edge
        # case, anything) must never take down the whole run -- caught live
        # 2026-08-18, where one pair's truncated M1 cache crashed this loop
        # every hour, before save_log()/save_state() ever ran for ANY pair,
        # silently undoing every other pair's successful refresh. Same
        # per-pair isolation the refresh loop above already has.
        try:
            bars = load_bars(pair, args.timeframe)
            if args.as_of:
                cutoff = pd.Timestamp(args.as_of, tz=bars.index.tz)
                bars = bars[bars.index <= cutoff]
            if len(bars) < 200:
                continue

            atr_arr = compute_atr(bars, period=FROZEN["atr_period"])
            motifs = detect_touch_motifs(
                bars, atr_arr, pivot_n=FROZEN["pivot_n"], tol_atr_mult=FROZEN["tol_atr_mult"],
                min_retrace_atr_mult=FROZEN["min_retrace_atr_mult"],
                min_bars_between_touches=FROZEN["min_bars_between_touches"],
                breakout_max_bars=FROZEN["breakout_max_bars"],
            )

            resolved_total += resolve_open_trades(pair, bars, log, FROZEN)
            new = scan_pair_motif(pair, bars, log, motifs, FROZEN)
            for t, m in new:
                log["trades"].append(t)
                new_signals += 1
                print(f"  [new] {pair:<8} {t['n_touches']}-touch {'top' if t['is_top'] else 'bottom'} "
                      f"{t['direction']} @ {t['entry_price']:.5f}  sl={t['sl_price']:.5f} "
                      f"tp={t['tp_price']:.5f}  {t['entry_date']}")
                if tg_ready:
                    htf_lean = _htf_lean_for_entry(pair, bars.index[m.confirm_idx])
                    confidence = _category_confidence(motifs, m.n_touches, m.is_top)
                    current_price = float(bars["close"].to_numpy()[-1])
                    text = format_alert(pair, t, m, atr_arr, htf_lean, confidence, current_price)
                    if send_via_dashboard(args.dashboard_url, text):
                        alerts_sent += 1
                    else:
                        print(f"  [warn] Telegram alert failed to send for {pair}")

            # "Nearing" alerts are NOT sent from here -- motif_nearing_watch.py
            # owns that job now, polling a live quote every MOTIF_NEARING_POLL_
            # SECONDS (default 60) against the level this scan computes below,
            # instead of waiting for the next full hourly rescan to notice price
            # got close. Two separate mechanisms racing each other to alert on
            # the same thing was exactly the "conflicted messaging" problem --
            # one clear owner per alert type now.
            state = compute_motif_state(pair, bars, motifs, FROZEN, atr_arr)
            if state:
                states.append(state)
                forming += 1
        except Exception as e:
            print(f"  [warn] {pair}: detection failed ({e}) -- skipping this pair, "
                  f"continuing with the rest")

    save_log(log)
    save_state(states)
    open_n = sum(1 for t in log["trades"] if t["status"] == "open")
    closed = [t for t in log["trades"] if t["status"] != "open"]
    wins = sum(1 for t in closed if t.get("r", 0) > 0)
    total_r = sum(t.get("r", 0) for t in closed)
    print(f"\n[motif_track] as_of={args.as_of or 'latest available (static local snapshot)'}  "
          f"new_signals={new_signals}  resolved_this_run={resolved_total}  "
          f"currently_open={open_n}  closed={len(closed)} (wins={wins}, total_R={total_r:.2f})  "
          f"currently_forming={forming}/{len(pairs)} pairs  total_logged={len(log['trades'])}"
          + (f"  telegram_alerts_sent={alerts_sent}" if args.telegram else ""))
    if not args.as_of:
        print("[note] no --as-of given: this ran against the static local snapshot, NOT live data. "
              "See this file's module docstring for the data-access blocker and how to wire in a "
              "real feed.")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--pairs", default=None, help="comma-separated; default is all 26")
    p.add_argument("--timeframe", default="1h")
    p.add_argument("--as-of", default=None,
                   help="ISO date -- truncate data as if this were 'now'. TESTING/REPLAY ONLY.")
    p.add_argument("--refresh-data", action="store_true",
                   help="pull fresh OANDA bars (refresh_m1.py) before scanning.")
    p.add_argument("--telegram", action="store_true",
                   help="send a Telegram alert for each newly-confirmed motif this run (entry, "
                        "tracked frozen-grid SL/TP, adaptive ATR-scaled SL/TP, 1D HTF read). Uses "
                        "the shared dashboard tg_config (same bot token/chat as every other bot's "
                        "alerts) unless this pair's own config sets tg_token/tg_chat_id. Disabled "
                        "automatically under --as-of (replay/testing, never live).")
    p.add_argument("--dashboard-url", default=os.environ.get("DASHBOARD_URL", "http://localhost:3000"),
                   help="base URL for reading the shared Telegram config via the KV API.")
    p.add_argument("--heartbeat-alert", default=None,
                   help="send this raw text via the shared Telegram config and exit -- no scanning. "
                        "A scan crashing inside its own run can't alert about its own crash; "
                        "motif_track_loop.sh calls this mode from OUTSIDE the scan to report the "
                        "loop itself going down after repeated failures, and recovering after.")
    args = p.parse_args()
    if args.heartbeat_alert is not None:
        if dashboard_telegram_configured(args.dashboard_url):
            ok = send_via_dashboard(args.dashboard_url, args.heartbeat_alert)
            print(f"[heartbeat] alert {'sent' if ok else 'FAILED to send'}")
        else:
            print("[heartbeat] dashboard's shared Telegram config isn't set -- alert skipped")
        return
    run(args)


if __name__ == "__main__":
    main()
