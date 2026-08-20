#!/usr/bin/env python3
"""One-shot corrective script -- removes exactly the 559 fabricated eurusd
trades that a `--as-of` test run in this sandbox accidentally wrote to
production R2 at 2026-08-17T23:29:46 (discovered: --as-of does NOT gate
save_log()/save_state(), only Telegram sending and the bar cutoff -- the
same gap that caused the original 2026-08-15 corruption incident).

Identified precisely by (pair == 'eurusd' AND logged_at in a ~50ms window
unique to this one run) -- verified to match exactly 559 entries before
writing anything.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from motif_track import _r2_client, R2_BUCKET, R2_LOG_KEY, load_log, save_log  # noqa: E402

BAD_PAIR = "eurusd"
BAD_LOGGED_AT_PREFIX = "2026-08-17T23:29:46"  # to-the-second is already unique here
EXPECTED_REMOVED = 559


def main() -> None:
    s3 = _r2_client()
    if s3 is None:
        print("[fix] no R2 client available -- aborting")
        sys.exit(1)

    obj = s3.get_object(Bucket=R2_BUCKET, Key=R2_LOG_KEY)
    print(f"[fix] pre-write R2 object: size={obj['ContentLength']} last_modified={obj['LastModified']}")

    log = load_log()
    trades = log["trades"]
    print(f"[fix] loaded {len(trades)} trades")

    kept, removed = [], []
    for t in trades:
        la = t.get("logged_at", "")
        if t.get("pair") == BAD_PAIR and la.startswith(BAD_LOGGED_AT_PREFIX):
            removed.append(t)
        else:
            kept.append(t)

    print(f"[fix] matched {len(removed)} fabricated trades for removal")
    if len(removed) != EXPECTED_REMOVED:
        print(f"[fix] ABORT: expected exactly {EXPECTED_REMOVED}, got {len(removed)}")
        sys.exit(1)

    log["trades"] = kept
    save_log(log)
    print("[fix] save_log() complete")

    obj2 = s3.get_object(Bucket=R2_BUCKET, Key=R2_LOG_KEY)
    import json
    log2 = json.loads(obj2["Body"].read())
    post_trades = log2["trades"]
    print(f"[fix] post-write trade count: {len(post_trades)}")
    leftover = [t for t in post_trades if t.get("pair") == BAD_PAIR and t.get("logged_at", "").startswith(BAD_LOGGED_AT_PREFIX)]
    print(f"[fix] remaining fabricated entries: {len(leftover)}")
    if leftover:
        print("[fix] WARNING: fabricated entries still present after write")
        sys.exit(1)
    print("[fix] verified clean")


if __name__ == "__main__":
    main()
