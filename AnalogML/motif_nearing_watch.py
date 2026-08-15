#!/usr/bin/env python3
"""motif_nearing_watch.py — the FAST half of the nearing-level alert, split
out of `motif_track.py`'s hourly full-detection loop specifically so "price
is now close to an already-known level" doesn't wait for the next hourly
rescan to be noticed. Confirmation itself (`motif_track.py`'s `format_alert`)
can only ever happen at an H1 close and is untouched by this script -- this
narrows the gap between "price got close" and "you found out", never trades
earlier than the validated rule allows.

**Why not a resting limit/stop order at the level instead?** Because
`pylego.motif_touch.detect_touch_motifs` only ever checks a bar's CLOSE
against the level, never its high/low -- the validated Sharpe 2.45 result is
specifically a "wait for a confirmed close" rule, deliberately built to
reject the wick-through-and-reverse fakeouts a resting order at the level
would happily fill on. This alert is early WARNING, not an earlier, silently
different entry rule -- the tracked, validated entry only ever fires from
motif_track.py's own hourly confirmation.

Reads levels ALREADY computed by the hourly job (`motif_state.json`, written
by `motif_track.py`'s `run()` -- specifically each forming touch-run's
`level`, `motif_key`, and `atr` snapshot) -- does NOT re-run detection, does
NOT refresh M1 bars. Polls a cheap live quote per pair via
`pylego.quotes.QuoteFeed` (the same per-pair-cached feed other paper-mode
bots already use for tick loops -- `GET {dashboard}/api/quote`) every
`--poll-seconds` (default 60, env `MOTIF_NEARING_POLL_SECONDS`).

Shares `log['nearing_alerted']` (`motif_trades.json`, via `motif_track.py`'s
own `load_log`/`save_log`) with the hourly job's dedup scheme -- one alert
per touch-run, whichever loop notices first (in practice, always this one,
since it polls far more often), never double-sent.

Usage:
  python AnalogML/motif_nearing_watch.py                    # real use, polls forever
  python AnalogML/motif_nearing_watch.py --poll-seconds 30
  python AnalogML/motif_nearing_watch.py --once              # single check, for testing
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from motif_track import (  # noqa: E402
    R2_BUCKET,
    R2_STATE_KEY,
    STATE_PATH,
    _r2_client,
    format_nearing_alert,
    load_log,
    save_log,
)

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from pylego.instruments import pip_size  # noqa: E402
from pylego.kv import KvClient  # noqa: E402
from pylego.quotes import QuoteFeed  # noqa: E402
from pylego.telegram import load_tg_config, send_telegram  # noqa: E402


def load_state() -> list[dict]:
    """Same R2-then-local-disk fallback as motif_track.py's load_log --
    reads whatever motif_state.json the hourly job last wrote."""
    s3 = _r2_client()
    if s3 is not None:
        try:
            obj = s3.get_object(Bucket=R2_BUCKET, Key=R2_STATE_KEY)
            return json.loads(obj["Body"].read()).get("pairs", [])
        except Exception:
            pass
    if STATE_PATH.exists():
        try:
            return json.loads(STATE_PATH.read_text()).get("pairs", [])
        except Exception:
            return []
    return []


def check_once(feed: QuoteFeed, tg_token: str, tg_chat_id: str, nearing_atr_mult: float) -> int:
    """One poll: for every currently-forming, non-provisional, not-yet-
    alerted touch-run, fetch a live quote and check it against the level.
    Returns the number of alerts sent."""
    states = load_state()
    if not states:
        return 0
    log = load_log()
    nearing_alerted = set(log.setdefault("nearing_alerted", []))
    sent = 0
    for state in states:
        if state.get("provisional"):
            continue
        key = state.get("motif_key")
        if not key or key in nearing_alerted:
            continue
        atr = state.get("atr")
        if not atr or atr <= 0:
            continue
        pair = state.get("pair")
        if not pair:
            continue
        px = feed.price(pair)
        if px is None:
            continue  # stale/missing quote this tick -- skip, not an error, retried next poll
        pip = pip_size(pair)
        dist_pips = abs(px - state["level"]) / pip
        nearing_pips = (nearing_atr_mult * atr) / pip
        if dist_pips > nearing_pips:
            continue
        live_state = {**state, "current_price": px, "dist_to_level_pips": round(dist_pips, 1)}
        if send_telegram(tg_token, tg_chat_id, format_nearing_alert(pair, live_state)):
            sent += 1
            print(f"  [nearing] {pair} {dist_pips:.1f}p from level -- alert sent")
        else:
            print(f"  [warn] nearing-alert failed to send for {pair}")
        nearing_alerted.add(key)
    if sent:
        log["nearing_alerted"] = sorted(nearing_alerted)
        save_log(log)
    return sent


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--poll-seconds", type=float,
                   default=float(os.environ.get("MOTIF_NEARING_POLL_SECONDS", "60")))
    p.add_argument("--nearing-atr-mult", type=float,
                   default=float(os.environ.get("MOTIF_TRACK_NEARING_ATR_MULT", "0.5")),
                   help="alert when a live quote is within this many ATR of a forming level.")
    p.add_argument("--dashboard-url", default=os.environ.get("DASHBOARD_URL", "http://localhost:3000"))
    p.add_argument("--once", action="store_true", help="single check-and-exit, for testing")
    args = p.parse_args()

    kv = KvClient(args.dashboard_url)
    tg_token, tg_chat_id = load_tg_config(kv)
    if not (tg_token and tg_chat_id):
        print("[motif_nearing_watch] no token/chat_id resolved -- alerts will be skipped")

    # QuoteFeed's own min_interval caps how often any ONE pair is actually
    # re-fetched over HTTP; half the poll period keeps quotes fresh without
    # a redundant fetch every single tick when poll_seconds is short.
    feed = QuoteFeed(args.dashboard_url, min_interval=max(5.0, args.poll_seconds / 2))

    if args.once:
        sent = check_once(feed, tg_token, tg_chat_id, args.nearing_atr_mult)
        print(f"[motif_nearing_watch] one-shot check: {sent} alert(s) sent")
        return

    print(f"[motif_nearing_watch] polling every {args.poll_seconds}s "
          f"(nearing_atr_mult={args.nearing_atr_mult})")
    while True:
        try:
            check_once(feed, tg_token, tg_chat_id, args.nearing_atr_mult)
        except Exception as e:
            print(f"[motif_nearing_watch] check failed ({e}) -- will retry next poll")
        time.sleep(args.poll_seconds)


if __name__ == "__main__":
    main()
