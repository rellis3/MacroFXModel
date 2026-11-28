"""backup_laptop_r2.py -- copy the laptop-only capture stores to R2 so they survive the laptop.

Sources (all under %LOCALAPPDATA%/MacroFXModel, never in git, never on Railway before this):

  orderflow/      Databento GLBX 6E/6J trades + mbp-1 (.dbn.zst), 1-minute bars
                  (bars_1m/<root>/<year>.parquet), MANIFEST.json, logs   -> R2 orderflow/<same path>
                  (layout as plans/DATA_AND_INTEGRATION_TRACKER.md row "CME FX futures order flow")
  orderflow_5m/, absorption_5m/, delta_line_1m/  derived research tables -> R2 orderflow/derived/<dir>/<file>
  nt8_live/       NT8 raw ticks / book / depth per contract per day       -> R2 nt8_live/<contract>/<file>

Rules:
  * every key is asserted to start with orderflow/ or nt8_live/ -- nothing else in the bucket is touched;
  * *.part files (interrupted downloads) are skipped;
  * nt8_live day files dated today (local) are skipped: the capture is still writing them;
  * a finished nt8 day file still in plain .csv is gzipped on the way up and stored as .csv.gz,
    unless a .csv.gz of the same file already exists locally (then only the .gz goes);
  * an object already in R2 with the same size is skipped (--force re-uploads), so the script is
    safe to re-run nightly and only sends new days;
  * <prefix>MANIFEST_R2.json is written last: key, bytes, sha256 (of the uploaded bytes), source.

    railway run .venv/Scripts/python.exe scripts/data/backup_laptop_r2.py --dry-run
    railway run .venv/Scripts/python.exe scripts/data/backup_laptop_r2.py
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
from datetime import date, datetime, timezone
from pathlib import Path

import boto3
from boto3.s3.transfer import TransferConfig

R2_ENDPOINT = "https://3e867110ae519cd24afc877c72e5026e.r2.cloudflarestorage.com"
BASE = Path(os.environ.get("LOCALAPPDATA", "")) / "MacroFXModel"
ALLOWED = ("orderflow/", "nt8_live/")
DAY_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})_")
XFER = TransferConfig(multipart_threshold=64 * 1024 * 1024, multipart_chunksize=64 * 1024 * 1024, max_concurrency=4)


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def plan() -> list[tuple[Path, str, bool]]:
    """(local file, R2 key, gzip_on_the_way) for every file to back up."""
    out: list[tuple[Path, str, bool]] = []
    of = BASE / "orderflow"
    for p in sorted(of.rglob("*")):
        if p.is_file() and not p.name.endswith(".part"):
            out.append((p, "orderflow/" + p.relative_to(of).as_posix(), False))
    for d in ("orderflow_5m", "absorption_5m", "delta_line_1m"):
        for p in sorted((BASE / d).rglob("*")):
            if p.is_file():
                out.append((p, f"orderflow/derived/{d}/" + p.relative_to(BASE / d).as_posix(), False))
    nt = BASE / "nt8_live"
    today = date.today().isoformat()
    for p in sorted(nt.rglob("*")):
        if not p.is_file() or p.name.endswith(".part"):
            continue
        rel = p.relative_to(nt).as_posix()
        m = DAY_RE.match(p.name)
        if m and m.group(1) >= today:
            continue  # still being written
        if p.suffix == ".csv" and m:
            if p.with_name(p.name + ".gz").exists():
                continue  # the capture already compressed it; send the .gz only
            out.append((p, "nt8_live/" + rel + ".gz", True))
        else:
            out.append((p, "nt8_live/" + rel, False))
    for _, key, _ in out:
        assert key.startswith(ALLOWED), key
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--only", choices=["orderflow", "nt8_live"], help="limit to one store")
    a = ap.parse_args()

    items = plan()
    if a.only:
        items = [i for i in items if i[1].startswith(a.only + "/")]
    total = sum(p.stat().st_size for p, _, _ in items)
    print(f"{len(items)} files, {total / 1e9:.2f} GB local (before gzip of plain nt8 csv)")
    if a.dry_run:
        for p, k, gz in items[:15]:
            print(("  gz " if gz else "     ") + k)
        print("  ...")
        return 0

    s3 = boto3.client("s3", endpoint_url=R2_ENDPOINT, aws_access_key_id=os.environ["R2_ACCESS_KEY"],
                      aws_secret_access_key=os.environ["R2_SECRET_KEY"], region_name="auto")
    bucket = os.environ.get("R2_BUCKET", "r2-storage")

    existing: dict[str, int] = {}
    for pre in ALLOWED:
        for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=pre):
            for o in page.get("Contents", []):
                existing[o["Key"]] = o["Size"]

    manifests: dict[str, list[dict]] = {pre: [] for pre in ALLOWED}
    sent = skipped = 0
    sent_bytes = 0
    tmpdir = Path(tempfile.mkdtemp(prefix="r2bk_"))
    try:
        for i, (p, key, gz) in enumerate(items, 1):
            src = p
            if gz:
                src = tmpdir / (p.name + ".gz")
                with open(p, "rb") as fi, gzip.open(src, "wb", compresslevel=6) as fo:
                    shutil.copyfileobj(fi, fo, 1 << 20)
            size = src.stat().st_size
            entry = {"key": key, "bytes": size, "sha256": sha256(src), "source": str(p.relative_to(BASE)).replace("\\", "/"),
                     "gzipped_in_transit": gz}
            manifests[key.split("/", 1)[0] + "/"].append(entry)
            if not a.force and existing.get(key) == size:
                skipped += 1
            else:
                s3.upload_file(str(src), bucket, key, Config=XFER)
                sent += 1
                sent_bytes += size
            if gz:
                src.unlink(missing_ok=True)
            if i % 50 == 0 or i == len(items):
                print(f"  {i}/{len(items)}  sent {sent} ({sent_bytes / 1e9:.2f} GB)  skipped {skipped}", flush=True)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)

    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    for pre, rows in manifests.items():
        if not rows:
            continue
        body = json.dumps({"written": now, "files": len(rows), "bytes": sum(r["bytes"] for r in rows),
                           "note": "Laptop-only capture backed up by scripts/data/backup_laptop_r2.py. "
                                   "sha256 is of the stored object (gzipped where gzipped_in_transit).",
                           "rows": rows}, indent=1).encode()
        s3.put_object(Bucket=bucket, Key=pre + "MANIFEST_R2.json", Body=body, ContentType="application/json")
        print(f"wrote {pre}MANIFEST_R2.json ({len(rows)} files)")
    print(f"done: sent {sent} files {sent_bytes / 1e9:.2f} GB, skipped {skipped} already present")
    return 0


if __name__ == "__main__":
    sys.exit(main())
