"""Tell the desk server about a finished broadcast, so the SERVER sends the owner's Telegram note (Telegram is never sent from the laptop).

  notify_published(...)  POST /api/helix/broadcast-published  {videoId, title, part, seconds, format, releaseKey}
  notify_failed(...)     POST /api/helix/broadcast-failed     {part, error}
  upload_podcast(...)    POST /api/helix/podcast/episode       (the MP3)
  special_due(...)       GET  /api/helix/special-due           (the release special launcher)

Auth: the laptop-push convention of the site (/api/kv/set, the footprint pushes): header X-Auth-Token = KV_WRITE_SECRET, read from the environment, else from
jarvis_broadcast/push_secret.txt (git-ignored). The server enforces it when it has the variable set.
Every call retries a few times and NEVER raises: a notify that fails is logged and the run carries on (the video is already up). Standard library only.
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import ssl
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
UA = 'helix-broadcast/1.0'


def push_secret() -> str:
    s = os.environ.get('KV_WRITE_SECRET', '').strip()
    if s:
        return s
    f = HERE / 'push_secret.txt'
    try:
        return f.read_text(encoding='utf-8').strip() if f.exists() else ''
    except OSError:
        return ''


def ssl_context():
    """certifi's CA bundle when it is installed. On 2026-11-28 the recorder's own venv (JarvisBroadcast/.venv-local) rejected
    the server's certificate as expired with its default store while certifi's bundle verified it, so the first Telegram note never left."""
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return None


_CTX = ssl_context()
_ssl_context = ssl_context            # the old private name


def urlopen(req, timeout: float = 30):
    """THE one way the broadcast scripts open a URL: urllib with certifi's CA bundle when it is installed (see ssl_context). Every other urllib call in jarvis_broadcast/ goes
    through here (test_helix_extras checks that no other file calls urllib.request.urlopen itself)."""
    return urllib.request.urlopen(req, timeout=timeout, context=_CTX) if _CTX else urllib.request.urlopen(req, timeout=timeout)


_open = urlopen


def call(base: str, path: str, *, body=None, data: bytes | None = None, ctype: str = 'application/json', method: str | None = None, retries: int = 4,
         timeout: float = 30, opener=_open, sleep=time.sleep, log=print) -> dict | None:
    """One request with retries on network errors and 5xx (2, 4, 8 s ...). Returns the parsed JSON (also for 4xx, which are not retried), or None."""
    url = base.rstrip('/') + path
    payload = data if data is not None else (json.dumps(body).encode('utf-8') if body is not None else None)
    headers = {'User-Agent': UA, 'Accept': 'application/json'}
    if payload is not None:
        headers['Content-Type'] = ctype
    sec = push_secret()
    if sec:
        headers['X-Auth-Token'] = sec
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, data=payload, headers=headers, method=method or ('POST' if payload is not None else 'GET'))
            with opener(req, timeout) as r:
                txt = r.read().decode('utf-8', 'replace')
                return json.loads(txt) if txt else {}
        except urllib.error.HTTPError as e:
            try:
                j = json.loads(e.read().decode('utf-8', 'replace') or '{}')
            except Exception:
                j = {}
            if e.code < 500:
                log(f'{path}: HTTP {e.code} {j.get("error", "")}'.strip())
                return {'ok': False, 'status': e.code, **j}
            log(f'{path}: HTTP {e.code} (attempt {attempt + 1} of {retries})')
        except Exception as e:                      # network, timeout, bad JSON
            log(f'{path}: {e} (attempt {attempt + 1} of {retries})')
        if attempt + 1 < retries:
            sleep(2 ** (attempt + 1))
    return None


def notify_published(base: str, video_id: str, title: str, part: str, seconds=None, fmt: str = 'wide', release_key: str | None = None, **kw) -> bool:
    j = call(base, '/api/helix/broadcast-published', body={'videoId': video_id, 'title': title, 'part': part, 'seconds': seconds, 'format': fmt, 'releaseKey': release_key}, **kw)
    return bool(j and j.get('ok'))


def notify_failed(base: str, part: str, error: str, **kw) -> bool:
    j = call(base, '/api/helix/broadcast-failed', body={'part': part, 'error': str(error)[:300]}, **kw)
    return bool(j and j.get('ok'))


def upload_podcast(base: str, mp3: Path, ep_id: str, title: str, part: str, seconds=None, **kw) -> dict | None:
    from urllib.parse import urlencode
    q = urlencode({'id': ep_id, 'title': title, 'part': part, **({'seconds': int(seconds)} if seconds else {})})
    return call(base, f'/api/helix/podcast/episode?{q}', data=Path(mp3).read_bytes(), ctype='audio/mpeg', timeout=180, **kw)


def special_due(base: str, **kw) -> list:
    j = call(base, '/api/helix/special-due', retries=2, **kw)
    return list(j.get('due') or []) if j and j.get('ok') else []
