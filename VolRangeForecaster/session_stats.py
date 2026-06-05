#!/usr/bin/env python3
"""
Session Consumption Statistics

Fetches 5 years of H1 bars from Oanda and computes what fraction of the daily
H-L range each session (Asia, London) historically consumes.

Output: VolRangeForecaster/data/session_stats.json

Usage:
    python3 VolRangeForecaster/session_stats.py
    python3 VolRangeForecaster/session_stats.py --years 3
    python3 VolRangeForecaster/session_stats.py GOLD EURUSD   # specific instruments only

Session definitions (Europe/London local time):
    Asia    : 00:00 – 06:00
    London  : 08:00 – 13:00
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import requests

# ── Oanda config (mirrors fetch_m1_oanda.py) ──────────────────────────────────
OANDA_ENV  = os.environ.get("OANDA_ENV", "practice")
OANDA_BASE = (
    "https://api-fxpractice.oanda.com" if OANDA_ENV == "practice"
    else "https://api-fxtrade.oanda.com"
)
OANDA_KEY = os.environ.get(
    "OANDA_KEY",
    "12ede1dbab4361aa039831ec942603d2-b1691eab23c45cd97d0c1e7e63e9d5cc",
)

BARS_PER_REQUEST = 5000
OUTFILE = Path(__file__).parent / "data" / "session_stats.json"
LONDON_TZ = ZoneInfo("Europe/London")

# ── Instruments (same as vol_range_forecast.py) ───────────────────────────────
INSTRUMENTS = {
    "GOLD":   "XAU_USD",
    "NQ":     "NAS100_USD",
    "EURUSD": "EUR_USD",
    "GBPUSD": "GBP_USD",
    "USDJPY": "USD_JPY",
    "AUDUSD": "AUD_USD",
    "NZDUSD": "NZD_USD",
    "USDCAD": "USD_CAD",
    "USDCHF": "USD_CHF",
    "GBPJPY": "GBP_JPY",
}

# ── Session windows (London local hour, inclusive start, exclusive end) ────────
SESSIONS = {
    "asia":   (0,  6),   # 00:00–06:00 London
    "london": (8,  13),  # 08:00–13:00 London
    "ny":     (13, 21),  # 13:00–21:00 London  (US open → NY close)
}

# Minimum H1 bars required for a session to be included in stats
MIN_SESSION_BARS = 3
# Minimum H1 bars for a full trading day (skip gaps / holidays)
MIN_DAY_BARS = 12


# ── Oanda H1 fetch ─────────────────────────────────────────────────────────────

def _headers():
    if not OANDA_KEY:
        raise RuntimeError("OANDA_KEY env var not set")
    return {"Authorization": f"Bearer {OANDA_KEY}"}


def _fetch_chunk(instrument: str, from_dt: datetime, count: int = BARS_PER_REQUEST) -> list:
    url    = f"{OANDA_BASE}/v3/instruments/{instrument}/candles"
    params = {
        "granularity": "H1",
        "count":       count,
        "price":       "M",
        "from":        from_dt.strftime("%Y-%m-%dT%H:%M:%S.000000000Z"),
    }
    for attempt in range(4):
        try:
            r = requests.get(url, headers=_headers(), params=params, timeout=30)
            if r.status_code in (404, 422):
                return []
            r.raise_for_status()
            return [
                {
                    "open":  float(c["mid"]["o"]),
                    "high":  float(c["mid"]["h"]),
                    "low":   float(c["mid"]["l"]),
                    "close": float(c["mid"]["c"]),
                    "time":  datetime.fromisoformat(
                        c["time"].replace("Z", "+00:00").replace(".000000000", "")
                    ),
                }
                for c in r.json().get("candles", [])
                if c.get("complete", True) and c.get("mid")
            ]
        except requests.RequestException as exc:
            wait = 2 ** attempt
            print(f"  attempt {attempt + 1} failed: {exc} — retrying in {wait}s")
            time.sleep(wait)
    return []


def _fetch_all_h1(instrument: str, years: int) -> list:
    all_bars = []
    cursor   = datetime.now(timezone.utc) - timedelta(days=365 * years)
    now      = datetime.now(timezone.utc)

    while cursor < now:
        chunk = _fetch_chunk(instrument, cursor)
        if not chunk:
            cursor += timedelta(days=7)  # skip gaps (holidays / weekends)
            continue
        all_bars.extend(chunk)
        cursor = chunk[-1]["time"] + timedelta(hours=1)
        print(f"  {chunk[-1]['time'].strftime('%Y-%m-%d')}  {len(all_bars):,} bars", end="\r")
        if len(chunk) < BARS_PER_REQUEST:
            break  # caught up to now
        time.sleep(0.05)

    print()
    return all_bars


# ── Session consumption calculation ───────────────────────────────────────────

def _compute_stats(bars: list) -> dict:
    """
    Group H1 bars by London date.  For each date compute daily H-L and per-session
    H-L and abs(O-C), then return percentile stats of each as % of daily H-L.
    """
    by_date: dict[str, dict] = {}
    for bar in bars:
        london_dt = bar["time"].astimezone(LONDON_TZ)
        dk        = london_dt.date().isoformat()
        h         = london_dt.hour
        if dk not in by_date:
            by_date[dk] = {"all": [], "asia": [], "london": [], "ny": []}
        by_date[dk]["all"].append(bar)
        for sess, (h0, h1) in SESSIONS.items():
            if h0 <= h < h1:
                by_date[dk][sess].append(bar)

    buckets: dict[str, list] = {
        "asia_hl": [], "asia_oc": [],
        "london_hl": [], "london_oc": [],
        "ny_hl": [], "ny_oc": [],
    }

    for dk, grp in by_date.items():
        all_b = grp["all"]
        if len(all_b) < MIN_DAY_BARS:
            continue
        daily_hl = max(b["high"] for b in all_b) - min(b["low"] for b in all_b)
        if daily_hl < 1e-9:
            continue

        for sess_name in ("asia", "london", "ny"):
            sess_b = sorted(grp[sess_name], key=lambda b: b["time"])
            if len(sess_b) < MIN_SESSION_BARS:
                continue
            sess_hl = max(b["high"] for b in sess_b) - min(b["low"] for b in sess_b)
            sess_oc = abs(sess_b[-1]["close"] - sess_b[0]["open"])
            buckets[f"{sess_name}_hl"].append(sess_hl / daily_hl * 100)
            buckets[f"{sess_name}_oc"].append(sess_oc / daily_hl * 100)

    def _pct_stats(arr: list) -> dict | None:
        if not arr:
            return None
        a = np.array(arr)
        return {
            "p50":  round(float(np.percentile(a, 50)), 1),
            "p75":  round(float(np.percentile(a, 75)), 1),
            "mean": round(float(np.mean(a)), 1),
            "n":    len(arr),
        }

    return {
        "asia":      _pct_stats(buckets["asia_hl"]),
        "asia_oc":   _pct_stats(buckets["asia_oc"]),
        "london":    _pct_stats(buckets["london_hl"]),
        "london_oc": _pct_stats(buckets["london_oc"]),
        "ny":        _pct_stats(buckets["ny_hl"]),
        "ny_oc":     _pct_stats(buckets["ny_oc"]),
    }


# ── Text-format export (mirrors vol_range_forecast.py format_report) ──────────

_LW = 34

def _divider(name: str) -> str:
    prefix = f"──── {name} "
    return prefix + "─" * max(0, _LW - len(prefix))


def format_session_stats_block(instruments_stats: dict) -> str:
    """Returns the SESSION STATS text block for pasting into the Pine Script."""
    lines = [_divider("SESSION STATS"), ""]
    for name, stats in instruments_stats.items():
        if not stats or not stats.get("asia") or not stats.get("london"):
            continue
        a    = stats["asia"]
        a_oc = stats.get("asia_oc")
        l    = stats["london"]
        l_oc = stats.get("london_oc")
        ny   = stats.get("ny")
        ny_oc = stats.get("ny_oc")
        lines.append(name)
        lines.append(f"Asia range      : {a['p50']}% median · {a['p75']}% 75th")
        if a_oc:
            lines.append(f"Asia O-C        : {a_oc['p50']}% median · {a_oc['p75']}% 75th")
        lines.append(f"London range    : {l['p50']}% median · {l['p75']}% 75th")
        if l_oc:
            lines.append(f"London O-C      : {l_oc['p50']}% median · {l_oc['p75']}% 75th")
        if ny:
            lines.append(f"NY range        : {ny['p50']}% median · {ny['p75']}% 75th")
        if ny_oc:
            lines.append(f"NY O-C          : {ny_oc['p50']}% median · {ny_oc['p75']}% 75th")
        lines.append("")
    return "\n".join(lines)


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Compute session consumption stats from Oanda H1 data")
    parser.add_argument("pairs",   nargs="*", help="Instrument names (default: all)")
    parser.add_argument("--years", type=int, default=5, help="Years of H1 history to fetch (default 5)")
    args = parser.parse_args()

    selected = [p.upper() for p in args.pairs] if args.pairs else list(INSTRUMENTS.keys())
    unknown  = [p for p in selected if p not in INSTRUMENTS]
    if unknown:
        print(f"Unknown instruments: {unknown}  (available: {list(INSTRUMENTS.keys())})")
        sys.exit(1)

    if not OANDA_KEY:
        print("Error: OANDA_KEY env var not set")
        sys.exit(1)

    results = {}

    for name in selected:
        oanda_sym = INSTRUMENTS[name]
        print(f"\n{'=' * 55}")
        print(f"  {name} ({oanda_sym})  —  {args.years}yr H1")
        print(f"{'=' * 55}")
        bars = _fetch_all_h1(oanda_sym, args.years)
        if not bars:
            print("  SKIPPED — no bars returned")
            continue
        stats = _compute_stats(bars)
        results[name] = stats
        for label, key in [("Asia H-L",   "asia"),   ("Asia O-C",   "asia_oc"),
                            ("London H-L", "london"), ("London O-C", "london_oc"),
                            ("NY H-L",     "ny"),     ("NY O-C",     "ny_oc")]:
            s = stats.get(key)
            if s:
                print(f"  {label:<12} P50={s['p50']}%  P75={s['p75']}%  (n={s['n']})")

    if not results:
        print("\nNo data computed — exiting without writing output.")
        sys.exit(1)

    output = {
        "ok":          True,
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "years":       args.years,
        "instruments": results,
        "export_block": format_session_stats_block(results),
    }

    OUTFILE.parent.mkdir(parents=True, exist_ok=True)
    OUTFILE.write_text(json.dumps(output, indent=2))
    print(f"\n{'=' * 55}")
    print(f"Written  →  {OUTFILE}")
    print()
    print(output["export_block"])


if __name__ == "__main__":
    main()
