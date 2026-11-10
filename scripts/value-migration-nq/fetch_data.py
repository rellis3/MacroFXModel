#!/usr/bin/env python3
"""Download the free NQ 1-minute OHLCV set (tier P) into data/value-migration-nq/ (gitignored) and check it
against the sha256 values in data_manifest.json (written on first fetch, 2026-11-10, then committed).

    python scripts/value-migration-nq/fetch_data.py
"""
import json
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from vmig.data import DATA_DIR, HF_REPO, HF_YEARS, sha256, write_manifest  # noqa: E402

MANIFEST = Path(__file__).parent / "data_manifest.json"


def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    for y in HF_YEARS:
        dst = DATA_DIR / f"NQ_1min_{y}.parquet"
        if dst.exists():
            continue
        url = f"https://huggingface.co/datasets/{HF_REPO}/resolve/main/NQ_1min_{y}.parquet"
        print("fetch", url)
        urllib.request.urlretrieve(url, dst)
    if MANIFEST.exists():
        want = json.loads(MANIFEST.read_text())["files"]
        bad = [f for f, m in want.items() if sha256(DATA_DIR / f) != m["sha256"]]
        if bad:
            sys.exit(f"sha256 mismatch (the upstream files changed): {bad}")
        print("sha256 ok for", len(want), "files")
    else:
        MANIFEST.write_text(json.dumps(write_manifest(), indent=1))
        print("wrote", MANIFEST)


if __name__ == "__main__":
    main()
