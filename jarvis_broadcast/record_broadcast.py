"""Record Jarvis's MORNING BROADCAST as a vertical 1080x1920 MP4 (picture AND sound) and upload it to YouTube as UNLISTED.

Runs on the laptop from Windows Task Scheduler at 07:15 UK (after the 06:30 OI pull has finished), see run_daily.bat and README.md.

How it records, and why this way:
  * The browser is the same kind as the CME pull (oi_recon/recon.py): real Chrome with a saved, logged-in profile, its window parked off-screen.
    A real window uses the laptop's GPU, so the 3D views render at full speed.
  * PICTURE: Chrome's own screencast feed (DevTools Page.startScreencast), every frame saved with its wall-clock time. Nothing to click, no
    "share this tab" prompt.
  * SOUND: Jarvis routes his voice and sound effects through one audio bus inside the page and records it there (window.__jarvisBroadcastAuto in
    js/terminal/jarvisModBroadcast.js). No sound card, no Stereo Mix, no "share tab audio" tick. The page hands back the audio and its start time.
  * ffmpeg lines the two up (broadcast_core.concat_list) and writes H.264 + AAC. A recording whose loudest moment is near silence is NOT uploaded.

Usage:
  python record_broadcast.py --login            one-off: opens a visible window; log into the desk site, then close it
  python record_broadcast.py --youtube-auth     one-off: sign in to YouTube (opens a browser), saves token.json
  python record_broadcast.py                    the daily run (record + upload unlisted)
  python record_broadcast.py --no-upload --show record only, with the window on screen (to watch a test run)
Options: --len short|quick|full  --voice server|kokoro  --base URL  --out DIR
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from broadcast_core import concat_list, max_volume, is_silent, title_for, description_for, short_warning, part_of_day  # noqa: E402

BASE = 'https://macrofxmodel-production.up.railway.app'
PROFILE = Path(os.environ.get('JARVIS_PROFILE', HERE / '.profile'))                     # the saved, logged-in browser profile (git-ignored)
OUT = HERE / 'out'                              # recordings and logs (git-ignored)
W, H, DPR = 540, 960, 2                         # a phone-shaped page (Jarvis's portrait layout) at 2x = 1080 x 1920


def log(msg: str) -> None:
    line = f"{datetime.now().strftime('%H:%M:%S')}  {msg}"
    print(line, flush=True)
    try:
        OUT.mkdir(parents=True, exist_ok=True)
        with open(OUT / 'run.log', 'a', encoding='utf-8') as f:
            f.write(line + '\n')
    except OSError:
        pass


def ffmpeg_exe() -> str:
    try:
        import imageio_ffmpeg  # bundled ffmpeg: pip install imageio-ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        exe = shutil.which('ffmpeg')
        if not exe:
            sys.exit('ffmpeg not found: pip install imageio-ffmpeg (or install ffmpeg and put it on PATH)')
        return exe


def launch(pw, visible: bool):
    """Real Chrome, saved profile, window off-screen unless visible. Falls back to Playwright's Chromium when Chrome is not installed."""
    PROFILE.mkdir(parents=True, exist_ok=True)
    args = ['--autoplay-policy=no-user-gesture-required', f'--window-size={W + 40},{H + 140}']
    if not visible:
        args.append('--window-position=-32000,-32000')
    args += [x for x in os.environ.get('JARVIS_CHROME_ARGS', '').split() if x]      # extra Chrome flags, e.g. for a machine without a GPU
    kw = dict(user_data_dir=str(PROFILE), headless=False, viewport={'width': W, 'height': H}, device_scale_factor=DPR, args=args)
    if os.environ.get('JARVIS_CHROME'):                       # an explicit browser executable (e.g. a portable Chrome); otherwise installed Chrome
        return pw.chromium.launch_persistent_context(executable_path=os.environ['JARVIS_CHROME'], **kw)
    try:
        return pw.chromium.launch_persistent_context(channel='chrome', **kw)
    except Exception:
        return pw.chromium.launch_persistent_context(**kw)


def do_login(base: str) -> None:
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        ctx = launch(pw, visible=True)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.set_viewport_size({'width': 1200, 'height': 900})
        page.goto(base + '/desk-terminal.html')
        print('Log in to the desk site in this window (as the owner). Close the window when the Desk Terminal has loaded.')
        try:
            page.wait_for_event('close', timeout=0)
        except Exception:
            pass
        ctx.close()
    print('Saved. The daily run will reuse this login.')


def record(base: str, length: str, engine: str, visible: bool, out_dir: Path, rate: float = 1.1) -> dict:
    from playwright.sync_api import sync_playwright
    stamp = datetime.now().strftime('%Y-%m-%d_%H%M')
    work = out_dir / stamp
    frames_dir = work / 'frames'
    frames_dir.mkdir(parents=True, exist_ok=True)
    frames: list[tuple[str, float]] = []
    with sync_playwright() as pw:
        ctx = launch(pw, visible)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.set_default_timeout(120_000)
        log(f'opening {base}/desk-terminal.html')
        page.goto(base + '/desk-terminal.html', wait_until='domcontentloaded')
        if '/login' in page.url:
            raise RuntimeError('the saved browser profile is logged out: run  python record_broadcast.py --login  once')
        try:
            page.wait_for_load_state('networkidle', timeout=45_000)
        except Exception:
            pass                                        # the terminal polls live feeds, so the network may never go quiet; carry on
        # open Jarvis straight into the broadcast panel (no boot animation)
        page.evaluate("""async () => { window.__jarvisNoBoot = true; const m = await import('/js/terminal/jarvisView.js'); m.openJarvis(window); }""")
        page.wait_for_function('() => !!window.__jarvisApi', timeout=60_000)
        page.wait_for_function("() => { try { window.__jarvisApi.setMod('broadcast'); return typeof window.__jarvisBroadcastAuto === 'function'; } catch (e) { return false; } }", timeout=60_000, polling=1000)
        time.sleep(8)                                   # let the HUD load its chain, candles and module data
        cdp = ctx.new_cdp_session(page)
        n = {'i': 0}

        def on_frame(ev):
            try:
                n['i'] += 1
                name = f"f{n['i']:06d}.jpg"
                (frames_dir / name).write_bytes(base64.b64decode(ev['data']))
                frames.append((name, ev.get('metadata', {}).get('timestamp')))
            finally:
                try:
                    cdp.send('Page.screencastFrameAck', {'sessionId': ev['sessionId']})
                except Exception:
                    pass

        cdp.on('Page.screencastFrame', on_frame)
        cdp.send('Page.startScreencast', {'format': 'jpeg', 'quality': 88, 'maxWidth': W * DPR, 'maxHeight': H * DPR, 'everyNthFrame': 1})
        log(f'recording the {length} broadcast (voice: {engine}, speed {rate}x)')
        res = page.evaluate('o => window.__jarvisBroadcastAuto(o)', {'len': length, 'engine': engine, 'rate': rate})
        time.sleep(0.5)
        cdp.send('Page.stopScreencast')
        ctx.close()
    if not res or not res.get('ok'):
        raise RuntimeError(f'the broadcast did not run: {res}')
    ext = 'ogg' if 'ogg' in res['mime'] else 'webm'
    audio = work / f'audio.{ext}'
    audio.write_bytes(base64.b64decode(res['audio']))
    t0, t1 = res['t0'] / 1000.0, res['t1'] / 1000.0
    log(f"captured {len(frames)} frames and {audio.stat().st_size // 1024} KB of sound over {t1 - t0:.1f} s; voice: {res.get('voice')}")
    return {'work': work, 'frames': frames, 'audio': audio, 't0': t0, 't1': t1, 'voice': res.get('voice')}


def encode(cap: dict) -> Path:
    ff = ffmpeg_exe()
    work = cap['work']
    text, secs = concat_list(cap['frames'], cap['t0'], cap['t1'])
    (work / 'frames' / 'list.ffconcat').write_text(text, encoding='utf-8')
    mp4 = work / f"jarvis-morning-{work.name[:10]}.mp4"
    vf = f'scale={W * DPR}:{H * DPR}:force_original_aspect_ratio=decrease,pad={W * DPR}:{H * DPR}:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p'
    cmd = [ff, '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', str(work / 'frames' / 'list.ffconcat'),
           '-i', str(cap['audio']), '-map', '0:v:0', '-map', '1:a:0', '-vf', vf, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
           '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-t', f'{secs:.3f}', '-movflags', '+faststart', str(mp4)]
    subprocess.run(cmd, check=True)
    # the voice must be on it: refuse a silent recording
    r = subprocess.run([ff, '-hide_banner', '-i', str(mp4), '-map', '0:a:0', '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True)
    db = max_volume(r.stderr)
    log(f'encoded {mp4.name}: {secs:.1f} s, loudest moment {db} dB')
    if is_silent(db):
        raise RuntimeError(f'the recording has no sound on it (loudest {db} dB): not uploading. Check the voice (H.E.L.I.X. OPTIONS / /api/jarvis/voice/info).')
    w = short_warning(secs)
    if w:
        log('note: ' + w)
    cap['seconds'] = secs
    return mp4


def keep_last(out_dir: Path, n: int = 7) -> None:
    """Keep the last n days' folders (frames are big)."""
    runs = sorted([p for p in out_dir.iterdir() if p.is_dir()], key=lambda p: p.name)
    for p in runs[:-n]:
        shutil.rmtree(p, ignore_errors=True)
    for p in runs[-n:]:
        shutil.rmtree(p / 'frames', ignore_errors=True)   # the MP4 is kept; the frames are not needed once encoded


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--login', action='store_true', help='one-off: log into the desk site in a visible window')
    ap.add_argument('--youtube-auth', action='store_true', help='one-off: sign in to YouTube and save token.json')
    ap.add_argument('--no-upload', action='store_true', help='record and encode only')
    ap.add_argument('--show', action='store_true', help='keep the browser window on screen')
    ap.add_argument('--len', choices=['short', 'quick', 'full'], default='short', help='short (default: kept under 3 min so YouTube files it as a Short), quick or full')
    ap.add_argument('--voice', choices=['server', 'kokoro'], default='server', help='server (steady) or kokoro (open-source, needs a fast machine)')
    ap.add_argument('--rate', type=float, choices=[0.9, 1.0, 1.1, 1.15, 1.3], default=1.1, help='voice speed: 0.9 calm, 1 normal, 1.1 steady (default), 1.15 brisk, 1.3 fast')
    ap.add_argument('--base', default=os.environ.get('JARVIS_SITE', BASE))
    ap.add_argument('--out', default=str(OUT))
    a = ap.parse_args()
    if a.login:
        return do_login(a.base)
    if a.youtube_auth:
        from youtube_upload import authorise
        authorise(interactive=True)
        print('YouTube sign-in saved.')
        return
    out_dir = Path(a.out)
    try:
        cap = record(a.base, a.len, a.voice, a.show, out_dir, a.rate)
        mp4 = encode(cap)
        result = {'ok': True, 'file': str(mp4), 'seconds': round(cap['seconds'], 1), 'voice': cap['voice'], 'at': datetime.now().isoformat(timespec='seconds')}
        if not a.no_upload:
            from youtube_upload import upload
            today = datetime.now().date()
            part = part_of_day(datetime.now().hour)          # 07:15 -> the morning briefing, 21:00 -> the evening one (the page picks its programme by the same London clock)
            vid = upload(mp4, title_for(today, part), description_for(today, cap['voice'], cap['seconds'], part), privacy='unlisted')
            result.update({'videoId': vid, 'url': f'https://youtube.com/shorts/{vid}', 'privacy': 'unlisted'})
            log(f"uploaded (unlisted): {result['url']}")
        (out_dir / 'last_run.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
        keep_last(out_dir)
    except Exception as e:
        log(f'FAILED: {e}')
        (out_dir / 'last_run.json').write_text(json.dumps({'ok': False, 'error': str(e), 'at': datetime.now().isoformat(timespec='seconds')}, indent=2), encoding='utf-8')
        sys.exit(1)


if __name__ == '__main__':
    main()
