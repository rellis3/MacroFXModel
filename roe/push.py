"""ROE P2 push client: send one finished run directory (roe_out/<runId>/) to the server. Idempotent: the server keys it by runId, so pushing the same
run twice changes nothing. The token comes from the environment (ROE_PUSH_TOKEN), never from a file in the repo or the command line."""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_BASE = "https://macrofxmodel-production.up.railway.app"


class PushError(Exception):
    pass


def build_payload(run_dir) -> dict:
    d = Path(run_dir)
    try:
        snapshot = json.loads((d / "snapshot.json").read_text(encoding="utf-8"))
        status = json.loads((d / "status.json").read_text(encoding="utf-8"))
        episodes = json.loads((d / "episodes.json").read_text(encoding="utf-8"))
        obs_path = d / "observations.jsonl"
        observations = [json.loads(line) for line in obs_path.read_text(encoding="utf-8").splitlines() if line.strip()] if obs_path.exists() else []
    except (OSError, ValueError) as e:
        raise PushError(f"{d} is not a finished run directory: {e}") from e
    q_path = d / "questions.json"
    questions = json.loads(q_path.read_text(encoding="utf-8")) if q_path.exists() else None
    run_id = snapshot.get("runId")
    if not run_id or run_id != d.name:
        raise PushError(f"snapshot.runId {run_id!r} does not match the folder name {d.name!r}")
    return {"runId": run_id, "snapshot": snapshot, "status": status, "episodes": episodes, "observations": observations, **({"questions": questions} if questions else {})}


def push_run(run_dir, base_url: str = DEFAULT_BASE, token: str | None = None, opener=None, timeout: int = 120) -> dict:
    """Returns the server's JSON answer ({'status': 'recorded' | 'already_recorded', ...}); raises PushError on any refusal."""
    token = token if token is not None else os.environ.get("ROE_PUSH_TOKEN", "")
    if not token:
        raise PushError("ROE_PUSH_TOKEN is not set (the same value as the ROE_PUSH_TOKEN variable on the server)")
    body = json.dumps(build_payload(run_dir)).encode("utf-8")
    req = urllib.request.Request(base_url.rstrip("/") + "/api/roe/push", data=body, method="POST",
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    try:
        with (opener or urllib.request.urlopen)(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            detail = json.loads(e.read().decode("utf-8")).get("error")
        except Exception:  # noqa: BLE001
            detail = None
        raise PushError(f"server refused the push: HTTP {e.code}" + (f": {detail}" if detail else "")) from e
    except (urllib.error.URLError, OSError) as e:
        raise PushError(f"could not reach the server: {e}") from e
