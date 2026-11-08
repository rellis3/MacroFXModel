"""Immutable daily INPUT SNAPSHOT: roe_out/<runId>/ . Never overwritten. Same run id + same identity = no-op; same run id +
different identity = SnapshotConflict. Run id is deterministic: <asof>-<hash(asof, config sha, manifest sha, code commit)>.
(ROE section 10 items 1, 4, 5.)"""
from __future__ import annotations

import json
import os
import shutil
import tempfile
from pathlib import Path

from .util import clean, sha256_obj


class SnapshotConflict(Exception):
    pass


def manifest_hash(blobs: list) -> str:
    return sha256_obj(sorted([[b["name"], b["sha256"]] for b in blobs]))


def make_run_id(asof: str, config_sha: str, manifest_sha: str, commit: str | None) -> str:
    return f"{asof}-{sha256_obj([asof, config_sha, manifest_sha, commit or 'no-git'])[:10]}"


def identity(asof: str, config_sha: str, manifest_sha: str, commit: str | None) -> dict:
    return {"asof": asof, "configSha256": config_sha, "manifestSha256": manifest_sha, "codeCommit": commit}


def check_existing(out_dir: Path, run_id: str, ident: dict) -> str:
    """'new' | 'noop'; raises SnapshotConflict if the run id exists with different inputs."""
    d = Path(out_dir) / run_id
    if not d.exists():
        return "new"
    f = d / "snapshot.json"
    if not f.exists():
        raise SnapshotConflict(f"{d} exists but has no snapshot.json (incomplete run): refusing to overwrite")
    old = json.loads(f.read_text(encoding="utf-8")).get("identity")
    if old == ident:
        return "noop"
    raise SnapshotConflict(f"run id {run_id} already recorded with different inputs/config/commit: {old} != {ident}")


def write_run(out_dir: Path, run_id: str, files: dict, raw_inputs: dict | None = None):
    """Write all files into a temp dir, then rename into place (atomic; never overwrites). files: name -> str|bytes|obj."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    final = out_dir / run_id
    if final.exists():
        raise SnapshotConflict(f"{final} already exists")
    tmp = Path(tempfile.mkdtemp(prefix=f".tmp-{run_id}-", dir=out_dir))
    try:
        for name, content in files.items():
            p = tmp / name
            if isinstance(content, bytes):
                p.write_bytes(content)
            elif isinstance(content, str):
                p.write_text(content, encoding="utf-8")
            else:
                p.write_text(json.dumps(clean(content), indent=2, sort_keys=True), encoding="utf-8")
        if raw_inputs:
            (tmp / "inputs").mkdir()
            for name, b in raw_inputs.items():
                (tmp / "inputs" / name).write_bytes(b)
        os.rename(tmp, final)
    except Exception:
        shutil.rmtree(tmp, ignore_errors=True)
        raise
    return final


def find_prior_run(out_dir, asof: str, exclude: str | None = None):
    """Latest earlier run (by snapshot asof, then createdAt) with asof <= this asof: (snapshot dict, state dict) or (None, None)."""
    base = Path(out_dir)
    best = None
    if not base.exists():
        return None, None
    for d in base.iterdir():
        f = d / "snapshot.json"
        if d.name == exclude or not f.exists():
            continue
        try:
            s = json.loads(f.read_text(encoding="utf-8"))
        except ValueError:
            continue
        if s.get("asof", "") > asof:
            continue
        key = (s.get("asof", ""), s.get("createdAt", ""))
        if best is None or key > best[0]:
            best = (key, d, s)
    if not best:
        return None, None
    st = best[1] / "state.json"
    return best[2], (json.loads(st.read_text(encoding="utf-8")) if st.exists() else None)
