#!/usr/bin/env python3
"""MT5 vs OANDA session-window diagnostic — run this ON THE VPS.

The volatility bot's catch-up walks MT5 bars from the London-midnight session
open (`Mt5Broker.session_bars` via `session_open_epoch`). If the broker's
SERVER clock offset is mishandled, that window silently includes bars from the
WRONG session and the bot's running extremes (run_high/run_low → the dynamic HL
lines) are contaminated — the gold 3997/4013 failure class.

This tool compares, for every pair in the vol bot's frozen plan
(`volatility_bot_plan`):

  * MT5 side  — today's session high/low from the bot's OWN code path:
    ``Mt5Broker.session_bars(pair, session_open_epoch(now))`` (M1 bars, the
    exact window catch_up replays), resolved through the bot's own broker
    symbol map; and
  * OANDA side — the dashboard's `/api/oanda_ohlc5m` M5 candles (OANDA mid,
    the same source the plan/book are built from), high/low over bars at or
    after the same session-open epoch.

and prints the per-pair high/low differences in pips, flagging any pair where
either extreme differs by more than --tol-pips (default 2). A flag means the
MT5 window does not correspond to the OANDA London session — check the
broker-server-time handling before trusting the bot's HL lines that day.

Notes on interpretation:
  * OANDA candles are MID; MT5 bars are BID — expect a structural ~half-spread
    difference. The 2-pip default tolerance absorbs that on FX; wide-spread
    indices may need --tol-pips raised.
  * M1 (MT5) vs M5 (OANDA) extremes can differ by intra-bar noise a touch;
    again inside the tolerance in practice.
  * If the dashboard endpoint has no OANDA key or the pair isn't served, the
    row shows n/a — eyeball the dashboard chart for that pair instead.

Degrades gracefully off-VPS: no MetaTrader5 module / no MT5 terminal / no
dashboard → a clear message and a non-zero exit, never a traceback.

Usage:
    python3 scripts/check_mt5_session_window.py --url https://dashboard.example
    python3 scripts/check_mt5_session_window.py --url ... --pairs eurusd,gold --tol-pips 3

Read-only: never writes KV, never places orders.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pylego import instruments as I                       # noqa: E402
from pylego.ohlc_feed import parse_dashboard_values       # noqa: E402
from volatility_bot.engine import session_open_epoch      # noqa: E402


def _get_json(url: str, timeout: int = 20):
    with urllib.request.urlopen(url, timeout=timeout) as resp:
        return json.loads(resp.read())


def fetch_plan(base: str) -> dict:
    """The vol bot's frozen plan (universe + per-pair open) via the dashboard."""
    body = _get_json(f"{base.rstrip('/')}/api/volatility-bot/plan")
    plan = body.get('plan') if isinstance(body, dict) else None
    if not plan or not plan.get('universe'):
        raise SystemExit('no volatility_bot_plan on the dashboard — refresh the plan first '
                         '(POST /api/volatility-bot/refresh-plan)')
    return plan


def oanda_session_extremes(base: str, pair: str, since: int):
    """(high, low, n_bars) from the dashboard's OANDA M5 candles at/after the
    session open, or None when the endpoint/pair has no data."""
    try:
        display = I.instrument(pair)['display']
    except Exception:
        display = pair.upper()
    url = f"{base.rstrip('/')}/api/oanda_ohlc5m?symbol={urllib.parse.quote(display)}"
    try:
        body = _get_json(url)
    except Exception as e:
        print(f"  [warn] {pair}: dashboard OHLC fetch failed ({e}) — eyeball the dashboard chart")
        return None
    bars = [b for b in parse_dashboard_values((body or {}).get('values')) if b['time'] >= since]
    if not bars:
        return None
    return max(b['high'] for b in bars), min(b['low'] for b in bars), len(bars)


def main() -> int:
    ap = argparse.ArgumentParser(
        description='Compare MT5 vs OANDA session high/low per vol-bot plan pair '
                    '(broker-server-time window contamination check). VPS tool; read-only.')
    ap.add_argument('--url', default=os.environ.get('DASHBOARD_URL', 'http://localhost:3000'),
                    help='dashboard base URL (default: $DASHBOARD_URL or http://localhost:3000)')
    ap.add_argument('--tol-pips', type=float, default=2.0,
                    help='flag threshold in pips for either extreme (default 2.0)')
    ap.add_argument('--pairs', default='',
                    help='comma list to check a subset (default: the whole plan universe)')
    ap.add_argument('--mt5-path', default=None, help='optional MT5 terminal path for initialize()')
    args = ap.parse_args()

    # ── environment gates: degrade with a message, never a traceback ─────────
    try:
        import MetaTrader5  # noqa: F401
    except ImportError:
        print('MetaTrader5 module not installed — this diagnostic must run ON the VPS '
              'next to the MT5 terminal. Nothing checked.')
        return 2

    try:
        plan = fetch_plan(args.url)
    except SystemExit:
        raise
    except Exception as e:
        print(f'dashboard unreachable at {args.url} ({e}) — nothing checked.')
        return 2

    # The bot's own MT5 path: same broker brick, same symbol routing.
    from pylego.broker.mt5 import Mt5Broker
    from volatility_bot.volatility_bot import _broker_sym
    broker = Mt5Broker(0, _broker_sym, I.pip_size)   # magic unused for bar reads
    # Attach to the running/logged-in terminal (no creds: initialize() only —
    # the account-mismatch guard is skipped exactly like the bot with blank creds).
    if not broker.connect('', '', '', args.mt5_path):
        print('MT5 initialize() failed — is the terminal running on this machine? Nothing checked.')
        return 2

    now = time.time()
    since = session_open_epoch(now)
    pairs = [p.strip().lower() for p in args.pairs.split(',') if p.strip()] or plan.get('universe', [])

    print(f"session open (London midnight): epoch {since} "
          f"({time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime(since))})")
    print(f"tolerance: {args.tol_pips} pips  ·  MT5 = bid M1 via Mt5Broker.session_bars, "
          f"OANDA = mid M5 via /api/oanda_ohlc5m\n")
    hdr = (f"{'pair':<10} {'mt5_high':>12} {'oa_high':>12} {'Δhi(p)':>8} "
           f"{'mt5_low':>12} {'oa_low':>12} {'Δlo(p)':>8}  flag")
    print(hdr)

    flagged, checked = [], 0
    for pair in pairs:
        try:
            pip = I.pip_size(pair)
        except Exception:
            pip = 0.0001
        mbars = broker.session_bars(pair, since)
        oa = oanda_session_extremes(args.url, pair, since)
        if not mbars or oa is None:
            why = 'no MT5 bars' if not mbars else 'no OANDA bars'
            print(f"{pair:<10} {'n/a':>12} {'n/a':>12} {'n/a':>8} {'n/a':>12} {'n/a':>12} {'n/a':>8}  ({why})")
            continue
        mt5_hi = max(b['high'] for b in mbars)
        mt5_lo = min(b['low'] for b in mbars)
        oa_hi, oa_lo, _ = oa
        d_hi = (mt5_hi - oa_hi) / pip
        d_lo = (mt5_lo - oa_lo) / pip
        checked += 1
        bad = abs(d_hi) > args.tol_pips or abs(d_lo) > args.tol_pips
        if bad:
            flagged.append(pair)
        print(f"{pair:<10} {mt5_hi:>12.5f} {oa_hi:>12.5f} {d_hi:>+8.1f} "
              f"{mt5_lo:>12.5f} {oa_lo:>12.5f} {d_lo:>+8.1f}  {'⚠ FLAG' if bad else 'ok'}")

    print()
    if flagged:
        print(f"⚠ {len(flagged)}/{checked} pair(s) beyond ±{args.tol_pips}p: {', '.join(flagged)}")
        print('  Likely broker-server-time window contamination (the gold 3997/4013 class): '
              'the MT5 session window is picking up bars outside the OANDA London session. '
              "Check the broker's server-clock offset before trusting today's HL lines.")
        return 1
    print(f"all {checked} checked pair(s) within ±{args.tol_pips}p — MT5 session window matches OANDA.")
    return 0


if __name__ == '__main__':
    sys.exit(main())
