#!/usr/bin/env python3
"""One-shot corrective script -- reverts the 41 motif_trades.json records in
the production R2 store that were accidentally corrupted by a local test run
(2026-08-15) that skipped --as-of and hit live R2 credentials. Restores each
of the 41 known motif_keys to status="open" and strips the fabricated
r/exit_price/exit_date/resolved_at fields. Touches nothing else in the log.

This script is meant to be run exactly once. Re-run is safe (idempotent --
trades already status="open" with no exit fields are left untouched) but
there should be nothing left for it to do after the first successful run.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from motif_track import _r2_client, R2_BUCKET, R2_LOG_KEY, load_log, save_log  # noqa: E402

TARGET_KEYS = [
    # verified via audit_r2_corruption_20260816.py -- 41 trades whose
    # resolved_at fell in the 2026-08-15T22:33-22:34 burst produced by the
    # erroneous local test run (stale-data resolution written to prod R2).
    "audusd:top:63932-63949",
    "audusd:bottom:63939-63952",
    "audusd:bottom:63967-63983",
    "audusd:top:64037-64052-64067",
    "audusd:top:64086-64100",
    "audusd:bottom:64113-64123",
    "audusd:bottom:64140-64170",
    "audusd:top:64158-64176",
    "audusd:top:64312-64334",
    "audusd:top:64362-64388",
    "audusd:bottom:64371-64405-64423",
    "audusd:bottom:64414-64462",
    "audusd:top:64437-64452",
    "audusd:bottom:64532-64543",
    "eurcad:bottom:63931-63966",
    "eurcad:bottom:64018-64039",
    "eurcad:bottom:64126-64138",
    "eurcad:top:64128-64145",
    "eurcad:top:64183-64202",
    "eurcad:top:64224-64251",
    "eurcad:bottom:64243-64257",
    "eurcad:top:64258-64274",
    "eurcad:top:64274-64300",
    "eurcad:bottom:64339-64350",
    "eurcad:bottom:64393-64412",
    "eurcad:top:64401-64414",
    "eurcad:top:64482-64514",
    "usdjpy:bottom:63965-63981",
    "usdjpy:top:63967-63977",
    "usdjpy:top:63983-64002",
    "usdjpy:bottom:64074-64090",
    "usdjpy:bottom:64098-64110",
    "usdjpy:top:64119-64136",
    "usdjpy:bottom:64124-64150",
    "usdjpy:top:64154-64174",
    "usdjpy:bottom:64166-64185",
    "usdjpy:bottom:64240-64259-64280",
    "usdjpy:top:64255-64271-64293",
    "usdjpy:top:64373-64400",
    "usdjpy:bottom:64440-64466",
    "usdjpy:top:64521-64536",
]

assert len(TARGET_KEYS) == 41, f"expected 41 target keys, got {len(TARGET_KEYS)}"
assert len(set(TARGET_KEYS)) == 41, "duplicate keys in TARGET_KEYS"


def main() -> None:
    s3 = _r2_client()
    if s3 is None:
        print("[fix] no R2 client available (missing credentials) -- aborting")
        sys.exit(1)

    # Fresh fetch immediately before writing, per the verified plan.
    obj = s3.get_object(Bucket=R2_BUCKET, Key=R2_LOG_KEY)
    meta_before = {"count_hint": obj["ContentLength"], "last_modified": str(obj["LastModified"])}
    print(f"[fix] pre-write R2 object: {meta_before}")

    log = load_log()
    trades = log.get("trades", [])
    print(f"[fix] loaded {len(trades)} trades")

    if not TARGET_KEYS:
        print("[fix] TARGET_KEYS is empty -- refusing to run. Populate it first.")
        sys.exit(1)

    target_set = set(TARGET_KEYS)
    fixed = []
    for t in trades:
        key = t.get("motif_key")
        if key in target_set:
            before = dict(t)
            t["status"] = "open"
            for field in ("r", "exit_price", "exit_date", "resolved_at"):
                t.pop(field, None)
            fixed.append((key, before))

    print(f"[fix] matched and reverted {len(fixed)} / {len(target_set)} target trades")
    if len(fixed) != len(target_set):
        matched = {k for k, _ in fixed}
        missing = target_set - matched
        print(f"[fix] WARNING missing keys: {sorted(missing)}")
        sys.exit(1)

    save_log(log)
    print("[fix] save_log() complete")

    # Immediate post-write verification straight from R2.
    obj2 = s3.get_object(Bucket=R2_BUCKET, Key=R2_LOG_KEY)
    print(f"[fix] post-write R2 object: count_hint={obj2['ContentLength']} last_modified={obj2['LastModified']}")

    import json
    post_log = json.loads(obj2["Body"].read())
    post_trades = {t.get("motif_key"): t for t in post_log.get("trades", [])}
    ok = 0
    for key in target_set:
        t = post_trades.get(key)
        if t and t.get("status") == "open" and "r" not in t and "exit_price" not in t and "exit_date" not in t and "resolved_at" not in t:
            ok += 1
        else:
            print(f"[fix] VERIFY FAIL for {key}: {t}")
    print(f"[fix] post-write verification: {ok} / {len(target_set)} correctly reverted")
    print(f"[fix] total trades in log after write: {len(post_log.get('trades', []))}")


if __name__ == "__main__":
    main()
