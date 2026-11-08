"""Small shared helpers: hashing, canonical JSON, session arithmetic, London time without tzdata."""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import math
import subprocess
from pathlib import Path

import numpy as np


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def clean(obj):
    """Make an object JSON-safe and deterministic: NaN/inf -> None, numpy scalars -> python."""
    if isinstance(obj, dict):
        return {str(k): clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [clean(v) for v in obj]
    if isinstance(obj, (np.floating, float)):
        f = float(obj)
        return None if (math.isnan(f) or math.isinf(f)) else f
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.bool_):
        return bool(obj)
    return obj


def canon(obj) -> str:
    return json.dumps(clean(obj), sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_obj(obj) -> str:
    return sha256_bytes(canon(obj).encode("utf-8"))


def iso(d) -> str:
    return str(np.datetime64(d, "D"))


def sessions_between(a: str, b: str) -> int:
    """Weekdays in (a, b]. Weekends only; exchange holidays are not modelled (documented in the README)."""
    return int(np.busday_count(np.datetime64(a) + np.timedelta64(1, "D"), np.datetime64(b) + np.timedelta64(1, "D")))


def add_sessions(d: str, n: int) -> str:
    return str(np.busday_offset(np.datetime64(d), n, roll="forward"))


def is_weekend(d: str) -> bool:
    return np.datetime64(d, "D").astype(dt.date).weekday() >= 5


def days_between(a: str, b: str) -> int:
    return int((np.datetime64(b) - np.datetime64(a)) / np.timedelta64(1, "D"))


def _last_sunday(year: int, month: int) -> dt.date:
    d = dt.date(year, month + 1, 1) - dt.timedelta(days=1)
    return d - dt.timedelta(days=(d.weekday() + 1) % 7)


def london_time(utc: dt.datetime) -> dt.datetime:
    """Europe/London wall time from a UTC datetime. BST runs 01:00 UTC last Sunday of March to 01:00 UTC last Sunday of
    October (no tzdata dependency: Windows laptops often lack it)."""
    y = utc.year
    start = dt.datetime.combine(_last_sunday(y, 3), dt.time(1, 0))
    end = dt.datetime.combine(_last_sunday(y, 10), dt.time(1, 0))
    naive = utc.replace(tzinfo=None)
    return naive + dt.timedelta(hours=1) if start <= naive < end else naive


def git_commit(repo_root: Path):
    """(HEAD commit, roe/ dirty flag) via git, or (None, None) when git or a repository is not available."""
    try:
        h = subprocess.run(["git", "-C", str(repo_root), "rev-parse", "HEAD"], capture_output=True, text=True, timeout=10)
        if h.returncode != 0:
            return None, None
        s = subprocess.run(["git", "-C", str(repo_root), "status", "--porcelain", "--", "roe"], capture_output=True,
                           text=True, timeout=10)
        return h.stdout.strip(), bool(s.stdout.strip())
    except Exception:  # noqa: BLE001 - git is optional
        return None, None
