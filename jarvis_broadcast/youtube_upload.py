"""Upload a video to the owner's YouTube channel (YouTube Data API v3, videos.insert, resumable). Used by record_broadcast.py.

Files (both git-ignored, next to this script):
  client_secret.json  the OAuth client you download from Google Cloud (Desktop app type), see README.md
  token.json          written by `python record_broadcast.py --youtube-auth`; refreshed automatically after that

Scope: youtube.upload only (it cannot read, change or delete anything else on the channel).
NOTE: while the Google Cloud app is in "Testing", Google expires the sign-in after 7 days; switch it to "In production" (README) to keep it.
"""
from __future__ import annotations

import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
CLIENT = HERE / 'client_secret.json'
TOKEN = HERE / 'token.json'
SCOPES = ['https://www.googleapis.com/auth/youtube.upload']


def authorise(interactive: bool = False):
    try:
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
    except ImportError as e:
        raise RuntimeError('Google client libraries missing: pip install -r requirements.txt') from e
    creds = Credentials.from_authorized_user_file(str(TOKEN), SCOPES) if TOKEN.exists() else None
    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
        except Exception:
            creds = None
    if not creds or not creds.valid:
        if not interactive:
            raise RuntimeError('YouTube sign-in missing or expired: run  python record_broadcast.py --youtube-auth  (see README: "In production" stops the 7-day expiry)')
        if not CLIENT.exists():
            raise RuntimeError(f'{CLIENT.name} not found next to this script: download the OAuth client from Google Cloud (README step 2)')
        creds = InstalledAppFlow.from_client_secrets_file(str(CLIENT), SCOPES).run_local_server(port=0)
    TOKEN.write_text(creds.to_json(), encoding='utf-8')
    return creds


def upload(path: Path, title: str, description: str, privacy: str = 'unlisted', category: str = '25') -> str:
    """Uploads and returns the video id. privacy is 'unlisted' by default (anyone with the link; not searchable). category 25 = News & Politics."""
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload
    from googleapiclient.errors import HttpError
    yt = build('youtube', 'v3', credentials=authorise(), cache_discovery=False)
    body = {
        'snippet': {'title': title, 'description': description, 'categoryId': category, 'tags': ['MACH', 'Macro Analytics', 'morning briefing', 'markets', 'Shorts']},
        'status': {'privacyStatus': privacy, 'selfDeclaredMadeForKids': False},
    }
    req = yt.videos().insert(part='snippet,status', body=body, media_body=MediaFileUpload(str(path), mimetype='video/mp4', chunksize=8 * 1024 * 1024, resumable=True))
    resp, tries = None, 0
    while resp is None:
        try:
            _, resp = req.next_chunk()
        except HttpError as e:
            if e.resp.status in (500, 502, 503, 504) and tries < 5:
                tries += 1
                time.sleep(2 ** tries)
                continue
            raise
    return resp['id']
