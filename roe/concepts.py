"""Concept cards client (plans/KNOWLEDGE_AND_MONITORS.md section 4): `python -m roe.concepts dry-run|run`.
dry-run asks the server what a run WOULD send (counts only, no model call, no token). run starts a capped run (at most 12 model calls a press; the server also
keeps a hard cap of 400 calls ever) and waits for it. The token comes from the environment (ROE_PUSH_TOKEN) or is typed when asked (hidden); never from a file in the repo or the command line.
urllib only."""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_BASE = "https://macrofxmodel-production.up.railway.app"
DEFAULT_SLICE = "candles-sessions"
PRESS_MAX = 12


class ConceptsError(Exception):
    pass


def _call(req, opener=None, timeout=120):
    try:
        with (opener or urllib.request.urlopen)(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            detail = json.loads(e.read().decode("utf-8")).get("error")
        except Exception:  # noqa: BLE001
            detail = None
        raise ConceptsError(f"server refused: HTTP {e.code}" + (f": {detail}" if detail else "")) from e
    except (urllib.error.URLError, OSError, ValueError) as e:
        raise ConceptsError(f"could not reach the server: {e}") from e


def dry_run(base_url: str = DEFAULT_BASE, slice_: str = DEFAULT_SLICE, opener=None) -> dict:
    """GET the counts (items, by source, estimated tokens, calls, calls used of the cap, cards so far). No token, no model call."""
    url = base_url.rstrip("/") + "/api/research-pod/concepts?" + urllib.parse.urlencode({"slice": slice_})
    return _call(urllib.request.Request(url, method="GET"), opener)


def run(base_url: str = DEFAULT_BASE, slice_: str = DEFAULT_SLICE, calls: int = 6, token: str | None = None, opener=None) -> dict:
    """POST one press (calls is limited to 1..12 here as well as on the server). Returns the server's answer ({'ok': True, 'job': {...}})."""
    token = token if token is not None else os.environ.get("ROE_PUSH_TOKEN", "")
    if not token:
        raise ConceptsError("no push token in this window. Easiest: run   run_roe.bat -Concepts 12   (it uses the token the launcher stored), or paste it when asked")
    n = max(1, min(PRESS_MAX, int(calls)))
    body = json.dumps({"slice": slice_, "calls": n}).encode("utf-8")
    req = urllib.request.Request(base_url.rstrip("/") + "/api/research-pod/concepts", data=body, method="POST",
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    return _call(req, opener)


def wait(base_url: str, slice_: str, opener=None, sleep=time.sleep, polls: int = 120, every: float = 5.0) -> dict:
    """Poll the open counts until the job is no longer running; returns the last status."""
    st: dict = {}
    for _ in range(polls):
        st = dry_run(base_url, slice_, opener)
        job = st.get("job")
        if not job or job.get("status") != "running":
            return st
        sleep(every)
    return st


def _fmt(d: dict) -> str:
    bs = d.get("bySource", {})
    return (f"slice {d.get('slice')}: {d.get('items')} items to send ({bs.get('paper', 0)} papers, {bs.get('cog', 0)} C.OG/education, {bs.get('theory-lab', 0)} Theory Lab), "
            f"{d.get('skipped', 0)} already sent; about {d.get('estimatedTokens')} tokens in {d.get('calls')} calls; "
            f"calls used {d.get('callsUsed')} of {d.get('callsCap')}; cards so far {d.get('cards')}")


def main(argv=None, opener=None, out=print) -> int:
    p = argparse.ArgumentParser(prog="python -m roe.concepts", description="Concept cards: dry-run (counts only) or run (capped model calls on the server).")
    p.add_argument("command", choices=["dry-run", "run"])
    p.add_argument("--calls", type=int, default=6, help="model calls this press (1-12)")
    p.add_argument("--slice", default=DEFAULT_SLICE, dest="slice_")
    p.add_argument("--base-url", default=DEFAULT_BASE)
    a = p.parse_args(argv)
    try:
        if a.command == "dry-run":
            out(_fmt(dry_run(a.base_url, a.slice_, opener)))
            return 0
        token = os.environ.get("ROE_PUSH_TOKEN", "").strip()
        if not token and sys.stdin.isatty():   # nothing set in this window: ask once (hidden), nothing is saved here. run_roe.bat -Concepts N uses the stored token instead.
            import getpass
            token = getpass.getpass("Paste the push token (it will not show as you type): ").strip()
        r = run(a.base_url, a.slice_, a.calls, token=token or None, opener=opener)
        out(f"started: up to {r['job'].get('max')} calls")
        st = wait(a.base_url, a.slice_, opener)
        job = st.get("job") or {}
        out(f"{job.get('status', 'finished')}: {job.get('calls', 0)} calls, {job.get('cards', 0)} cards added or changed, {job.get('rejected', 0)} rejected")
        for e in job.get("errors", []):
            out(f"  note: {e}")
        out(_fmt(st))
        return 0 if job.get("status") in (None, "done") else 4
    except ConceptsError as e:
        print(str(e), file=sys.stderr)
        return 4


if __name__ == "__main__":
    sys.exit(main())
