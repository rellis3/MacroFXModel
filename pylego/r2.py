"""r2 — thin boto3 S3 client for Cloudflare R2, shared by every AnalogML
script that persists live state across Railway's ephemeral disk
(`motif_track.py`'s trade log/state, `refresh_m1.py`'s M1 parquet cache).
Extracted out of `motif_track.py` when `refresh_m1.py` needed the exact
same client construction -- CLAUDE.md's own threshold for "extract it"
("if two copies already exist, that alone qualifies").

  from pylego.r2 import r2_client, R2_BUCKET

  s3 = r2_client()          # None if R2_ACCESS_KEY/R2_SECRET_KEY unset
  if s3 is not None:
      s3.get_object(Bucket=R2_BUCKET, Key="analogml/whatever.json")
"""
from __future__ import annotations

import os

R2_ENDPOINT = os.environ.get(
    "R2_ENDPOINT", "https://3e867110ae519cd24afc877c72e5026e.r2.cloudflarestorage.com")
R2_BUCKET = os.environ.get("R2_BUCKET", "r2-storage")


def r2_client():
    """None if R2 credentials aren't configured -- callers fall back to
    local disk. Same convention as paper_track.py / r2_download.py."""
    access_key = os.environ.get("R2_ACCESS_KEY")
    secret_key = os.environ.get("R2_SECRET_KEY")
    if not access_key or not secret_key:
        return None
    import boto3
    return boto3.client("s3", endpoint_url=R2_ENDPOINT, aws_access_key_id=access_key,
                        aws_secret_access_key=secret_key, region_name="auto")
