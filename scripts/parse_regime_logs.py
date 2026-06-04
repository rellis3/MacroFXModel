"""
parse_regime_logs.py

Parses V1 and V2 regime bot log files into per-pair state records and events,
writes JSON files under data/regime_history/{v1,v2}/, and optionally POSTs
each pair's data to a backfill API endpoint.

Usage:
    python scripts/parse_regime_logs.py
    python scripts/parse_regime_logs.py --upload
    python scripts/parse_regime_logs.py --upload --dashboard-url https://my-dashboard.example.com
"""

import argparse
import json
import os
import re
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# File paths
# ---------------------------------------------------------------------------
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

V1_LOG = os.path.join(REPO_ROOT, "bot", "regime_bot.log")
V2_LOG = os.path.join(REPO_ROOT, "logs", "regime_bot_v2.log")

OUTPUT_BASE = os.path.join(REPO_ROOT, "data", "regime_history")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def parse_ts(ts_str: str) -> int:
    """Parse a 'YYYY-MM-DD HH:MM:SS' string to a UTC integer unix timestamp."""
    dt = datetime.strptime(ts_str, "%Y-%m-%d %H:%M:%S")
    return int(dt.replace(tzinfo=timezone.utc).timestamp())


def pair_safe(pair: str) -> str:
    """Convert 'EUR/USD' → 'eurusd', 'NAS100_USD' → 'nas100usd' for filenames."""
    return pair.replace("/", "").replace("_", "").lower()


def _float(value: str, default: float = 0.0) -> float:
    """Parse a float, stripping any leading + sign; return default on error."""
    try:
        return float(str(value).lstrip("+"))
    except (ValueError, TypeError):
        return default


def _int(value: str, default: int = 0) -> int:
    try:
        return int(value)
    except (ValueError, TypeError):
        return default


# ---------------------------------------------------------------------------
# V1 patterns
# ---------------------------------------------------------------------------

# V1 state line:
# [2026-05-24 20:54:48] [INFO] [EUR/USD] regime=BEAR  conf=100%  vol_z=+0.00  rl=1  decay=0.000
_V1_STATE = re.compile(
    r"^\[(?P<ts>[^\]]+)\] \[INFO\] \[(?P<pair>[^\]]+)\]"
    r" regime=(?P<regime>\w+)"
    r"\s+conf=(?P<conf>\d+)%"
    r"\s+vol_z=(?P<vz>[+-]?\d+\.?\d*)"
    r"\s+rl=(?P<rl>\d+)"
    r"\s+decay=(?P<decay>[+-]?\d+\.?\d*)"
)

# V1 ENTRY line:
# [2026-05-25 08:15:23] [INFO] [XAU/USD] ENTRY LONG  conf=100%  vol_z=+0.00  rl=2  decay=0.000  lots=3.35  SL=...  exit=...
_V1_ENTRY = re.compile(
    r"^\[(?P<ts>[^\]]+)\] \[INFO\] \[(?P<pair>[^\]]+)\]"
    r" ENTRY (?P<direction>LONG|SHORT)"
    r".*?lots=(?P<lots>[\d.]+)"
)

# V1 TRADE line (no bracket pair — standalone trade execution record):
# [2026-05-25 08:15:23] [INFO] TRADE XAU/USD LONG  SL=4557.57589  TP=0.00000  lot=3.35
_V1_TRADE = re.compile(
    r"^\[(?P<ts>[^\]]+)\] \[INFO\] TRADE (?P<pair>\S+) (?P<direction>LONG|SHORT)"
    r"\s+SL=(?P<sl>[\d.]+)"
    r".*?lot=(?P<lots>[\d.]+)"
)

# V1 CLOSE line:
# [2026-05-25 09:13:03] [INFO] CLOSE XAU/USD  ticket=8773796451  reason=decay_exit score=0.900
_V1_CLOSE = re.compile(
    r"^\[(?P<ts>[^\]]+)\] \[INFO\] CLOSE (?P<pair>\S+)"
    r"\s+ticket=\S+"
    r"\s+reason=(?P<reason>.+?)(?:\s+score=[\d.]+)?$"
)

# V1 DECAY EXIT warning:
# [2026-05-25 09:13:03] [WARNING] [XAU/USD] DECAY EXIT  {'mixed_regimes': [...]}
_V1_DECAY = re.compile(
    r"^\[(?P<ts>[^\]]+)\] \[WARNING\] \[(?P<pair>[^\]]+)\] DECAY EXIT\s+(?P<detail>.+)$"
)

# V1 debounce gate:
# [2026-05-24 20:54:48] [INFO] [EUR/USD] debounce 1/3  confirmed=None
_V1_DEBOUNCE = re.compile(
    r"^\[(?P<ts>[^\]]+)\] \[INFO\] \[(?P<pair>[^\]]+)\] (?P<reason>debounce \S+)\s+confirmed=\S+"
)

# V1 regime neutral:
# [2026-05-25 09:17:53] [INFO] [XAU/USD] Regime neutral BULL→RANGE  flip_count=1/2
_V1_NEUTRAL = re.compile(
    r"^\[(?P<ts>[^\]]+)\] \[INFO\] \[(?P<pair>[^\]]+)\]"
    r" Regime neutral (?P<transition>\S+→\S+)\s+flip_count=(?P<flips>\S+)"
)


def parse_v1(log_path: str):
    """
    Parse the V1 regime bot log.

    Returns:
        records : dict[pair -> dict[ts -> record_dict]]   last-wins per (pair, ts)
        events  : list of event dicts (all pairs, chronological)
    """
    records: dict = {}
    events: list = []

    if not os.path.exists(log_path):
        print(f"[WARN] V1 log not found: {log_path}", file=sys.stderr)
        return records, events

    with open(log_path, "r", encoding="utf-8", errors="replace") as fh:
        for raw_line in fh:
            line = raw_line.rstrip("\n")

            # State record
            m = _V1_STATE.match(line)
            if m:
                pair = m.group("pair")
                ts = parse_ts(m.group("ts"))
                rec = {
                    "ts": ts,
                    "regime": m.group("regime"),
                    "conf": _int(m.group("conf")),
                    "vz": _float(m.group("vz")),
                    "rl": _int(m.group("rl")),
                    "decay": _float(m.group("decay")),
                }
                records.setdefault(pair, {})[ts] = rec
                continue

            # ENTRY event (from bracketed pair line, e.g. [XAU/USD] ENTRY LONG ...)
            m = _V1_ENTRY.match(line)
            if m:
                events.append({
                    "ts": parse_ts(m.group("ts")),
                    "type": "entry",
                    "pair": m.group("pair"),
                    "direction": m.group("direction"),
                    "lots": _float(m.group("lots")),
                })
                continue

            # TRADE event (bare, no bracket pair)
            m = _V1_TRADE.match(line)
            if m:
                events.append({
                    "ts": parse_ts(m.group("ts")),
                    "type": "trade",
                    "pair": m.group("pair"),
                    "direction": m.group("direction"),
                    "sl": _float(m.group("sl")),
                    "lots": _float(m.group("lots")),
                })
                continue

            # CLOSE event
            m = _V1_CLOSE.match(line)
            if m:
                events.append({
                    "ts": parse_ts(m.group("ts")),
                    "type": "close",
                    "pair": m.group("pair"),
                    "reason": m.group("reason").strip(),
                })
                continue

            # DECAY EXIT warning
            m = _V1_DECAY.match(line)
            if m:
                events.append({
                    "ts": parse_ts(m.group("ts")),
                    "type": "decay_exit",
                    "pair": m.group("pair"),
                    "detail": m.group("detail").strip(),
                })
                continue

            # Debounce gate
            m = _V1_DEBOUNCE.match(line)
            if m:
                events.append({
                    "ts": parse_ts(m.group("ts")),
                    "type": "gate",
                    "pair": m.group("pair"),
                    "reason": m.group("reason"),
                })
                continue

            # Regime neutral
            m = _V1_NEUTRAL.match(line)
            if m:
                events.append({
                    "ts": parse_ts(m.group("ts")),
                    "type": "neutral",
                    "pair": m.group("pair"),
                    "reason": f"{m.group('transition')} flip_count={m.group('flips')}",
                })
                continue

            # All other lines (startup banners, VIX errors, cycle lines, …) are ignored.

    return records, events


# ---------------------------------------------------------------------------
# V2 patterns
# ---------------------------------------------------------------------------

# V2 state line:
# [2026-05-26 08:27:42] [RGV2] [INFO] [EUR/USD] reg=BEAR  conf=97%  slope=+0.0  vz=+1.59  rl=1  bocpd=0.0%  exh=0.00  decay=0.000  score=78  1h=BULL
_V2_STATE = re.compile(
    r"^\[(?P<ts>[^\]]+)\] \[RGV2\] \[INFO\] \[(?P<pair>[^\]]+)\]"
    r" reg=(?P<regime>\w+)"
    r"\s+conf=(?P<conf>\d+)%"
    r"\s+slope=(?P<slope>[+-]?\d+\.?\d*)"
    r"\s+vz=(?P<vz>[+-]?\d+\.?\d*)"
    r"\s+rl=(?P<rl>\d+)"
    r"\s+bocpd=(?P<bocpd>[+-]?\d+\.?\d*)%"
    r"\s+exh=(?P<exh>[+-]?\d+\.?\d*)"
    r"\s+decay=(?P<decay>[+-]?\d+\.?\d*)"
    r"\s+score=(?P<score>\d+)"
    r"\s+1h=(?P<h1>\w+)"
)

# V2 Gate line:
# [2026-05-26 08:27:42] [RGV2] [INFO] [EUR/USD] Gate: 1h opposed (BULL) (E7)
_V2_GATE = re.compile(
    r"^\[(?P<ts>[^\]]+)\] \[RGV2\] \[INFO\] \[(?P<pair>[^\]]+)\] Gate: (?P<reason>.+)$"
)

# V2 TRADE line (optional [PAPER] suffix):
# [2026-05-26 11:52:11] [RGV2] [INFO] TRADE GBP/USD SHORT  SL=1.35054  lot=0.31  [PAPER]
_V2_TRADE = re.compile(
    r"^\[(?P<ts>[^\]]+)\] \[RGV2\] \[INFO\] TRADE (?P<pair>\S+) (?P<direction>LONG|SHORT)"
    r"\s+SL=(?P<sl>[\d.]+)"
    r"\s+lot=(?P<lots>[\d.]+)"
)

# V2 CLOSE line (optional [PAPER] suffix):
# [2026-05-26 11:52:41] [RGV2] [INFO] CLOSE GBP/USD  ticket=-1  reason=BOCPD 98% × 4 bars (X6)  [PAPER]
_V2_CLOSE = re.compile(
    r"^\[(?P<ts>[^\]]+)\] \[RGV2\] \[INFO\] CLOSE (?P<pair>\S+)"
    r"\s+ticket=\S+"
    r"\s+reason=(?P<reason>.+?)(?:\s+\[PAPER\])?$"
)


def parse_v2(log_path: str):
    """
    Parse the V2 regime bot log.

    Returns:
        records : dict[pair -> dict[ts -> record_dict]]   last-wins per (pair, ts)
        events  : list of event dicts (all pairs, chronological)
    """
    records: dict = {}
    events: list = []

    if not os.path.exists(log_path):
        print(f"[WARN] V2 log not found: {log_path}", file=sys.stderr)
        return records, events

    with open(log_path, "r", encoding="utf-8", errors="replace") as fh:
        for raw_line in fh:
            line = raw_line.rstrip("\n")

            # State record
            m = _V2_STATE.match(line)
            if m:
                pair = m.group("pair")
                ts = parse_ts(m.group("ts"))
                rec = {
                    "ts": ts,
                    "regime": m.group("regime"),
                    "conf": _int(m.group("conf")),
                    "slope": _float(m.group("slope")),
                    "vz": _float(m.group("vz")),
                    "rl": _int(m.group("rl")),
                    "bocpd": _float(m.group("bocpd")),
                    "exh": _float(m.group("exh")),
                    "decay": _float(m.group("decay")),
                    "score": _int(m.group("score")),
                    "h1": m.group("h1"),
                }
                records.setdefault(pair, {})[ts] = rec
                continue

            # Gate event
            m = _V2_GATE.match(line)
            if m:
                events.append({
                    "ts": parse_ts(m.group("ts")),
                    "type": "gate",
                    "pair": m.group("pair"),
                    "reason": m.group("reason").strip(),
                })
                continue

            # TRADE event
            m = _V2_TRADE.match(line)
            if m:
                events.append({
                    "ts": parse_ts(m.group("ts")),
                    "type": "trade",
                    "pair": m.group("pair"),
                    "direction": m.group("direction"),
                    "sl": _float(m.group("sl")),
                    "lots": _float(m.group("lots")),
                })
                continue

            # CLOSE event
            m = _V2_CLOSE.match(line)
            if m:
                events.append({
                    "ts": parse_ts(m.group("ts")),
                    "type": "close",
                    "pair": m.group("pair"),
                    "reason": m.group("reason").strip(),
                })
                continue

    return records, events


# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------

def write_pair_files(records_by_pair: dict, events: list, version: str):
    """
    Write one JSON file per pair under data/regime_history/{version}/.

    Returns a list of (pair, payload) tuples for optional upload.
    File writing is best-effort — failures are warned but do not abort so
    --upload still works on read-only filesystems (e.g. Railway ephemeral FS).
    """
    out_dir = os.path.join(OUTPUT_BASE, version)
    _can_write = False
    try:
        os.makedirs(out_dir, exist_ok=True)
        _can_write = True
    except OSError as exc:
        print(f"[WARN] Cannot create output dir {out_dir}: {exc}", file=sys.stderr)

    # Group events by pair
    events_by_pair: dict = {}
    for ev in events:
        p = ev.get("pair")
        if p:
            events_by_pair.setdefault(p, []).append(ev)

    all_pairs = sorted(
        set(list(records_by_pair.keys()) + list(events_by_pair.keys()))
    )
    payloads = []

    for pair in all_pairs:
        # Deduplicated records sorted by ts
        recs = sorted(records_by_pair.get(pair, {}).values(), key=lambda r: r["ts"])
        evs  = sorted(events_by_pair.get(pair, []), key=lambda e: e["ts"])

        payload = {
            "pair": pair,
            "bot": version,
            "records": recs,
            "events": evs,
        }

        if _can_write:
            fname = os.path.join(out_dir, f"{pair_safe(pair)}.json")
            try:
                with open(fname, "w", encoding="utf-8") as fh:
                    json.dump(payload, fh, separators=(",", ":"))
            except OSError as exc:
                print(f"[WARN] Cannot write {fname}: {exc}", file=sys.stderr)

        payloads.append((pair, payload))

    return payloads


def print_summary(version: str, records_by_pair: dict, events: list):
    """Print a per-pair summary table to stdout."""
    events_by_pair: dict = {}
    for ev in events:
        p = ev.get("pair")
        if p:
            events_by_pair.setdefault(p, []).append(ev)

    all_pairs = sorted(
        set(list(records_by_pair.keys()) + list(events_by_pair.keys()))
    )

    print(f"\n=== {version.upper()} summary ===")
    print(f"{'Pair':<16} {'Records':>8} {'Events':>8}")
    print("-" * 34)
    total_r = total_e = 0
    for pair in all_pairs:
        n_recs = len(records_by_pair.get(pair, {}))
        n_evs  = len(events_by_pair.get(pair, []))
        total_r += n_recs
        total_e += n_evs
        print(f"{pair:<16} {n_recs:>8} {n_evs:>8}")
    print("-" * 34)
    print(f"{'TOTAL':<16} {total_r:>8} {total_e:>8}")


# ---------------------------------------------------------------------------
# Upload helper
# ---------------------------------------------------------------------------

def upload_pair(dashboard_url: str, pair: str, payload: dict):
    """
    POST payload to {dashboard_url}/api/regime-backfill as JSON.
    Returns (ok: bool, status: int | str).
    """
    endpoint = dashboard_url.rstrip("/") + "/api/regime-backfill"
    body = json.dumps({
        "bot":     payload["bot"],
        "pair":    pair,
        "records": payload["records"],
        "events":  payload["events"],
    }).encode("utf-8")

    req = urllib.request.Request(
        endpoint,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return True, resp.status
    except urllib.error.HTTPError as exc:
        return False, exc.code
    except Exception as exc:
        return False, str(exc)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Parse V1/V2 regime bot logs and emit per-pair JSON history files."
    )
    parser.add_argument(
        "--dashboard-url",
        default="http://localhost:3000",
        help="Base URL of the dashboard API (default: http://localhost:3000)",
    )
    parser.add_argument(
        "--upload",
        action="store_true",
        help="POST each pair's data to {dashboard-url}/api/regime-backfill",
    )
    args = parser.parse_args()

    # --- Parse both logs ---
    print(f"Parsing V1 log: {V1_LOG}")
    v1_records, v1_events = parse_v1(V1_LOG)

    print(f"Parsing V2 log: {V2_LOG}")
    v2_records, v2_events = parse_v2(V2_LOG)

    # --- Write output files ---
    v1_payloads = write_pair_files(v1_records, v1_events, "v1")
    v2_payloads = write_pair_files(v2_records, v2_events, "v2")

    # --- Print summaries ---
    print_summary("v1", v1_records, v1_events)
    print_summary("v2", v2_records, v2_events)

    print(f"\nOutput written to: {OUTPUT_BASE}/")

    # --- Optional upload ---
    if args.upload:
        all_payloads = [("v1", p) for p in v1_payloads] + [("v2", p) for p in v2_payloads]
        print(
            f"\nUploading {len(all_payloads)} pair payloads "
            f"to {args.dashboard_url} ..."
        )
        ok_count = fail_count = 0
        for _ver, (pair, payload) in all_payloads:
            ok, status = upload_pair(args.dashboard_url, pair, payload)
            tag = "OK  " if ok else "FAIL"
            print(f"  [{tag}] {payload['bot']:2s}  {pair:<16}  status={status}")
            if ok:
                ok_count += 1
            else:
                fail_count += 1
        print(f"\nUpload complete: {ok_count} succeeded, {fail_count} failed.")


if __name__ == "__main__":
    main()
