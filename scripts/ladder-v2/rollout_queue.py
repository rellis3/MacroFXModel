"""ladder-v2-rollout driver (forge/LADDER_V2_ROLLOUT_PREREG.md): for each instrument, in order,
data screens -> sigma race build -> sigma race score -> exhaustion touches -> exhaustion score.

    python scripts/ladder-v2/rollout_queue.py [--workers 4] SYM [SYM ...]

Resumable: a step whose output already exists is skipped. One log per instrument in
analysis/output/ladder-v2-rollout/logs/<SYM>.log; status.json is rewritten after every step. An instrument with no
track data (commodity CFD not yet downloaded and no futures) is reported and skipped. A failed step stops that
instrument only; nothing is retried automatically.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PY = sys.executable
OUT = ROOT / "analysis/output/ladder-v2-rollout"
sys.path.insert(0, str(ROOT / "scripts/ladder-v2"))
import ladder as L  # noqa: E402

LOCK = threading.Lock()
STATUS: dict = {}


def save():
    with LOCK:
        (OUT / "status.json").write_text(json.dumps(STATUS, indent=1))


def steps(sym):
    s = sym.lower()
    return [
        ("screens", [PY, "-m", "forge.data_screens", sym], ROOT / f"analysis/output/data_screens/{sym}/flags.csv"),
        ("build", [PY, "scripts/ladder-v2/ladder.py", "build", sym], ROOT / f"analysis/output/ladder-v2-{s}/build.json"),
        ("score", [PY, "scripts/ladder-v2/ladder.py", "score", sym], ROOT / f"analysis/output/ladder-v2-{s}/results.json"),
        ("touches", [PY, "scripts/exhaustion-v2/touches.py", sym], ROOT / f"analysis/output/exhaustion-v2-{s}/check.txt"),
        ("exhaustion", [PY, "scripts/exhaustion-v2/score.py", sym], ROOT / f"analysis/output/exhaustion-v2-{s}/results.json"),
    ]


def run(sym):
    tr = L.tracks_for(sym)
    if not tr:
        STATUS[sym] = {"state": "no data", "tracks": []}
        save()
        return
    STATUS[sym] = {"state": "running", "tracks": tr, "steps": {}}
    save()
    log = OUT / "logs" / f"{sym}.log"
    for name, cmd, done in steps(sym):
        if done.exists():
            STATUS[sym]["steps"][name] = "exists"
            continue
        t0 = time.time()
        STATUS[sym]["steps"][name] = "running"
        save()
        with open(log, "a", encoding="utf-8") as f:
            f.write(f"\n=== {name}: {' '.join(cmd[1:])} ({time.strftime('%H:%M:%S')})\n")
            f.flush()
            rc = subprocess.run(cmd, cwd=ROOT, stdout=f, stderr=subprocess.STDOUT,
                                env={**__import__("os").environ, "PYTHONIOENCODING": "utf-8"}).returncode
        STATUS[sym]["steps"][name] = f"ok {time.time() - t0:.0f}s" if rc == 0 else f"FAILED rc={rc}"
        save()
        if rc != 0:
            STATUS[sym]["state"] = f"failed at {name}"
            save()
            return
    STATUS[sym]["state"] = "done"
    save()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("syms", nargs="+")
    a = ap.parse_args()
    (OUT / "logs").mkdir(parents=True, exist_ok=True)
    if (OUT / "status.json").exists():
        STATUS.update(json.loads((OUT / "status.json").read_text()))
    with ThreadPoolExecutor(a.workers) as ex:
        list(ex.map(run, [s.upper() for s in a.syms]))
    print(json.dumps({k: v["state"] for k, v in STATUS.items()}, indent=1))


if __name__ == "__main__":
    main()
