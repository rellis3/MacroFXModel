"""Lockbox guard (forge/LOCKBOX_PROTOCOL.md).

    python -m forge.lockbox_check              verify every frozen file still matches its recorded hash
    python -m forge.lockbox_check --evaluate   the one sanctioned evaluation (refuses if already run or if hashes moved)

The evaluation itself is wired in when the holdout data exists (H-A needs the M1 refresh); until then --evaluate only
checks readiness and records nothing.
"""
import hashlib
import json
import sys
from datetime import date
from pathlib import Path

MANIFEST = Path("forge/lockbox_manifest.json")
LOG = Path("forge/lockbox_log.json")
HOLDOUT_AFTER = "2026-08-21"
MIN_SESSIONS = 60


def sha(p: str) -> str:
    return hashlib.sha256(Path(p).read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def verify() -> bool:
    m = json.loads(MANIFEST.read_text())
    ok = True
    for key, f in m["files"].items():
        now = sha(f["path"]) if Path(f["path"]).exists() else "missing"
        same = now == f["sha256"]
        ok &= same
        print(f"  {'ok  ' if same else 'MOVED'} {key:28} {f['path']}")
    print(f"\nfrozen {m['frozen']} at {m['commit'][:10]}: {'all files unchanged' if ok else 'FROZEN FILES CHANGED — lockbox void for those layers'}")
    return ok


def holdout_sessions() -> int:
    import pandas as pd
    p = Path("VolRangeForecaster/data/m1/eurusd_m1.parquet")
    idx = pd.read_parquet(p, columns=["close"]).index
    idx = pd.DatetimeIndex(idx).tz_convert("Europe/London") if pd.DatetimeIndex(idx).tz is not None else pd.DatetimeIndex(idx)
    days = pd.Index(idx.normalize().strftime("%Y-%m-%d")).unique()
    return int(((days > HOLDOUT_AFTER) & (pd.to_datetime(days).dayofweek < 5)).sum())


if __name__ == "__main__":
    good = verify()
    if "--evaluate" in sys.argv:
        log = json.loads(LOG.read_text()) if LOG.exists() else []
        if any(e.get("evaluated") for e in log):
            sys.exit("lockbox already evaluated — the holdout is spent; see forge/lockbox_log.json")
        if not good:
            sys.exit("frozen files changed — cannot evaluate")
        n = holdout_sessions()
        print(f"holdout (H-A) sessions available locally: {n} (need {MIN_SESSIONS})")
        if n < MIN_SESSIONS:
            sys.exit("not ready: refresh M1 (AnalogML/refresh_m1.py, OANDA_KEY) and/or wait for forward sessions")
        sys.exit("ready — wire the per-layer scorers here before the one evaluation (see protocol)")
