"""The RELEASE-DAY SPECIAL launcher. Task Scheduler runs it every 10 minutes on weekdays from 07:00 ("Helix Release Special", run_special_check.bat; set up by setup_tasks.ps1).

Each run asks the server (GET /api/helix/special-due) whether a rank-3 release (payrolls, CPI, the Fed's or another central bank's rate decision, from the same ForexFactory
week the evening briefing reads) printed 30-80 minutes ago and has no special yet. Almost always the answer is no and it exits at once.
When one is due it records ONE short wide special (record_broadcast.py --part special ...): the evening-style look-back at what printed and the half hour after, then the
upload, the Telegram note (sent by the server) and the podcast episode, like every other programme.

Idempotent per release: the server drops a release once its special is published (its key is in the published list), and out/specials_done.json here stops a second
start while one is recording or after two failed tries. A running recorder (the morning or evening briefing) is never interrupted: the check simply tries again in 10 minutes.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import helix_notify  # noqa: E402

BASE = os.environ.get('JARVIS_SITE', 'https://macrofxmodel-production.up.railway.app')
OUT = HERE / 'out'
DONE = OUT / 'specials_done.json'
MAX_TRIES = 2


def log(msg: str) -> None:
    line = f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}  {msg}"
    print(line, flush=True)
    try:
        OUT.mkdir(parents=True, exist_ok=True)
        with open(OUT / 'special_check.log', 'a', encoding='utf-8') as f:
            f.write(line + '\n')
    except OSError:
        pass


def pick_special(due: list, done: dict) -> dict | None:
    """The first due release not already recorded here and with tries left."""
    for d in due or []:
        st = done.get(d.get('key')) or {}
        if not st.get('ok') and int(st.get('tries', 0)) < MAX_TRIES:
            return d
    return None


def release_args(d: dict) -> list[str]:
    hm = datetime.fromtimestamp(d['ms'] / 1000).strftime('%H:%M') if d.get('ms') else ''      # the laptop's clock is London
    return ['--part', 'special', '--release-key', d['key'], '--release-name', str(d.get('name') or 'the release')[:80], '--release-ccy', str(d.get('ccy') or ''), '--release-hm', hm, '--wait-busy']


def main() -> int:
    due = helix_notify.special_due(BASE, log=lambda m: None)
    if not due:
        return 0
    try:
        done = json.loads(DONE.read_text(encoding='utf-8')) if DONE.exists() else {}
    except Exception:
        done = {}
    d = pick_special(due, done)
    if not d:
        return 0
    import record_broadcast as rb
    pid = rb.recorder_alive(OUT)
    if pid:
        log(f"special due for {d['key']} ({d.get('name')}), but a recorder (process {pid}) is running: trying again at the next check")
        return 0
    st = done.setdefault(d['key'], {'tries': 0})
    st['tries'] = int(st.get('tries', 0)) + 1
    st['at'] = datetime.now().isoformat(timespec='seconds')
    DONE.parent.mkdir(parents=True, exist_ok=True)
    DONE.write_text(json.dumps(done, indent=2), encoding='utf-8')
    log(f"recording the release special for {d['key']} ({d.get('name')}), try {st['tries']} of {MAX_TRIES}")
    code = subprocess.run([sys.executable, str(HERE / 'record_broadcast.py'), *release_args(d)], cwd=str(HERE)).returncode
    st['ok'] = code == 0
    DONE.write_text(json.dumps(done, indent=2), encoding='utf-8')
    log(f"special for {d['key']}: {'done' if code == 0 else f'FAILED (exit {code})'}")
    return code


if __name__ == '__main__':
    sys.exit(main())
