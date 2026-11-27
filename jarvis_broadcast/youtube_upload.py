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
# CAPTIONS (4.4) need youtube.force-ssl, which upload-only cannot give. They use a SEPARATE sign-in (token_captions.json, `--youtube-auth-captions`), so the daily
# upload token is never touched: without it the captions are skipped and the upload goes ahead exactly as before.
TOKEN_CAPTIONS = HERE / 'token_captions.json'
SCOPES_CAPTIONS = ['https://www.googleapis.com/auth/youtube.force-ssl']


def authorise(interactive: bool = False, token: Path = TOKEN, scopes: list | None = None):
    scopes = scopes or SCOPES
    try:
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
    except ImportError as e:
        raise RuntimeError('Google client libraries missing: pip install -r requirements.txt') from e
    creds = Credentials.from_authorized_user_file(str(token), scopes) if token.exists() else None
    if creds and creds.expired and creds.refresh_token:
        # a passing network fault (24 Nov 2026, 09:02) used to read as "expired": retry, and only a refused refresh token means sign in again
        import time
        from google.auth.exceptions import RefreshError
        for attempt in range(4):
            try:
                creds.refresh(Request())
                break
            except RefreshError as e:
                if 'invalid_grant' in str(e) or attempt == 3:
                    if 'invalid_grant' not in str(e):
                        raise RuntimeError(f'YouTube sign-in could not refresh (not expired, likely the network): {e}') from e
                    creds = None
                    break
            except Exception as e:
                if attempt == 3:
                    raise RuntimeError(f'YouTube sign-in could not refresh (network?): {e}') from e
            time.sleep(15 * (attempt + 1))
    if not creds or not creds.valid:
        if not interactive:
            raise RuntimeError('YouTube sign-in missing or expired: run  python record_broadcast.py --youtube-auth  (see README: "In production" stops the 7-day expiry)')
        if not CLIENT.exists():
            raise RuntimeError(f'{CLIENT.name} not found next to this script: download the OAuth client from Google Cloud (README step 2)')
        creds = InstalledAppFlow.from_client_secrets_file(str(CLIENT), scopes).run_local_server(port=0)
    token.write_text(creds.to_json(), encoding='utf-8')
    return creds


def upload(path: Path, title: str, description: str, privacy: str = 'unlisted', category: str = '25', tags: list | None = None) -> str:
    """Uploads and returns the video id. privacy is 'unlisted' by default (anyone with the link; not searchable). category 25 = News & Politics."""
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload
    from googleapiclient.errors import HttpError
    yt = build('youtube', 'v3', credentials=authorise(), cache_discovery=False)
    body = {
        'snippet': {'title': title, 'description': description, 'categoryId': category, 'tags': tags or ['HELIX', 'macro', 'morning briefing', 'markets', 'Shorts']},
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


def set_thumbnail(video_id: str, jpg: Path) -> None:
    """4.6: the headline card as the thumbnail (thumbnails.set works with the upload scope; YouTube needs the channel phone-verified for custom thumbnails)."""
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload
    yt = build('youtube', 'v3', credentials=authorise(), cache_discovery=False)
    yt.thumbnails().set(videoId=video_id, media_body=MediaFileUpload(str(jpg), mimetype='image/jpeg')).execute()


def captions_ready() -> bool:
    return TOKEN_CAPTIONS.exists()


def upload_captions(video_id: str, srt: Path, name: str = 'English') -> str:
    """4.4: captions.insert from the script timings (.srt). Needs token_captions.json (python record_broadcast.py --youtube-auth-captions)."""
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload
    yt = build('youtube', 'v3', credentials=authorise(token=TOKEN_CAPTIONS, scopes=SCOPES_CAPTIONS), cache_discovery=False)
    body = {'snippet': {'videoId': video_id, 'language': 'en-GB', 'name': name, 'isDraft': False}}
    r = yt.captions().insert(part='snippet', body=body, media_body=MediaFileUpload(str(srt), mimetype='application/octet-stream')).execute()
    return r.get('id', '')
