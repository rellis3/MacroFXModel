"""Record Jarvis's MORNING BROADCAST as a vertical 1080x1920 MP4 (picture AND sound) and upload it to YouTube as UNLISTED.

Runs on the laptop from Windows Task Scheduler at 07:00 UK (after the 06:30 OI pull has finished), see run_daily.bat and README.md.

How it records, and why this way:
  * The browser is the same kind as the CME pull (oi_recon/recon.py): real Chrome with a saved, logged-in profile, its window parked off-screen.
    A real window uses the laptop's GPU, so the 3D views render at full speed.
  * PICTURE: Chrome's own screencast feed (DevTools Page.startScreencast), every frame saved with its wall-clock time. Nothing to click, no
    "share this tab" prompt.
  * SOUND: Jarvis routes his voice and sound effects through one audio bus inside the page and records it there (window.__jarvisBroadcastAuto in
    js/terminal/jarvisModBroadcast.js). No sound card, no Stereo Mix, no "share tab audio" tick. The page hands back the audio and its start time.
  * ffmpeg lines the two up (broadcast_core.concat_list) and writes H.264 + AAC. A recording whose loudest moment is near silence is NOT uploaded.

FRAME-BY-FRAME (the default for both runs: morning from 24 Nov 2026, evening from 24 Nov 2026 after the morning one was judged; Task Scheduler stop-after limit 1 h 30 min): the live way above drops frames whenever the laptop is busy (short freezes at the heavy 3D changes).
  vclock.js is injected before the page's scripts; just before the broadcast starts the page's clock is FROZEN, and the job moves it on 1/30 s at a time, taking a
  screenshot after each step. Timers, animation frames, CSS animations and the audio clock all follow that virtual clock, so every frame is complete however slow the
  machine is (a slow machine just takes longer). The sound (voice, ambient, whooshes) is scheduled on an offline audio context on the same clock and rendered to a WAV
  at the end. The server voice is asked for at the broadcast's speed, so its pitch is unchanged. --live records the old way.

Usage:
  python record_broadcast.py --login            one-off: opens a visible window; log into the desk site, then close it
  python record_broadcast.py --youtube-auth     one-off: sign in to YouTube (opens a browser), saves token.json
  python record_broadcast.py                    the daily run (record + upload unlisted)
  python record_broadcast.py --no-upload --show record only, with the window on screen (to watch a test run)
Options: --len short|quick|full  --voice server|kokoro  --rate 1.1  --live (real-time capture)  --fps 30  --base URL  --out DIR
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
W, H, DPR = 1920, 1080, 1                       # WIDE (the default from 25 Nov 2026, owner: "the full brief wider in a professional setting"): the desk layout at 1920 x 1080
SHORT_PAGE = (540, 960, 2)                      # --format short: the phone-shaped page at 2x = 1080 x 1920 for a YouTube Short
FRAMES_SHORT_SEC = 125                          # frame by frame has no waits between lines, but a real run still lands ~1.2x the estimate at speed 1.1: 145 gave 3 min 14 s on 24 Nov (over the 3-min Shorts limit); 125 aims for ~2 min 45 s
VCLOCK = HERE / 'vclock.js'                     # the virtual clock for frame-by-frame recording


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


def open_broadcast(ctx, base: str):
    """The desk terminal with Jarvis open on the broadcast panel. Returns the page."""
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
    log('page loaded; opening the HUD')
    page.evaluate("""async () => { window.__jarvisNoBoot = true; const m = await import('/js/terminal/jarvisView.js'); m.openJarvis(window); }""")
    page.wait_for_function('() => !!window.__jarvisApi', timeout=60_000)
    page.wait_for_function("() => { try { window.__jarvisApi.setMod('broadcast'); return typeof window.__jarvisBroadcastAuto === 'function'; } catch (e) { return false; } }", timeout=60_000, polling=1000)
    log('HUD open on the broadcast panel')
    time.sleep(8)                                   # let the HUD load its chain, candles and module data
    return page


def voice_plain(page):
    """The voice as it is, no robot finish (owner, 25 Nov 2026: "just Daniel, without the robotic twang")."""
    page.evaluate("() => { try { const k = 'jarvisVoice:v1'; localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) || '{}'), fx: 'off' })); } catch (e) {} }")


def record_frames(base: str, length: str, engine: str, visible: bool, out_dir: Path, rate: float = 1.1, fps: int = 30) -> dict:
    """FRAME-BY-FRAME: freeze the page clock, then step it 1/fps s at a time with a screenshot after each step (see the module notes)."""
    from playwright.sync_api import sync_playwright
    stamp = datetime.now().strftime('%Y-%m-%d_%H%M')
    work = out_dir / stamp
    frames_dir = work / 'frames'
    frames_dir.mkdir(parents=True, exist_ok=True)
    frames: list[tuple[str, float]] = []
    dt = 1000.0 / fps
    with sync_playwright() as pw:
        ctx = launch(pw, visible)
        ctx.add_init_script(path=str(VCLOCK))
        page = open_broadcast(ctx, base)
        if not page.evaluate('() => !!window.__vclock'):
            raise RuntimeError('the virtual clock did not load (vclock.js)')
        cdp = ctx.new_cdp_session(page)
        voice_plain(page)
        page.evaluate('() => window.__vclock.freeze()')
        page.evaluate("""o => { window.__vcRes = null; window.__vcOnAir = 0;
            window.__jarvisBroadcastAuto(o).then(r => { window.__vcRes = r; }, e => { window.__vcRes = { ok: false, error: String(e && e.message || e) }; }); }""",
                      {'len': length, 'engine': engine, 'rate': rate, 'budgetSec': FRAMES_SHORT_SEC})
        log(f'recording the {length} broadcast frame by frame at {fps} fps (voice: {engine}, speed {rate}x)')
        started, last_note, n = time.time(), time.time(), 0
        while True:
            st = page.evaluate('async ms => { const v = await window.__vclock.step(ms); return { v, air: window.__vcOnAir || 0, done: !!window.__vcRes }; }', dt)
            if st['done']:
                break
            if st['air'] and st['v'] >= st['air'] - dt:
                n += 1
                shot = cdp.send('Page.captureScreenshot', {'format': 'jpeg', 'quality': 90})
                name = f'f{n:06d}.jpg'
                (frames_dir / name).write_bytes(base64.b64decode(shot['data']))
                frames.append((name, st['v'] / 1000.0))
            if time.time() - last_note > 60:
                last_note = time.time()
                on_air = (st['v'] - st['air']) / 1000 if st['air'] else 0
                log(f'  {n} frames so far, {on_air:.0f} s of broadcast, {time.time() - started:.0f} s elapsed')
            if time.time() - started > 75 * 60:
                raise RuntimeError('the frame-by-frame recording ran past 75 minutes: stopped')
        res = page.evaluate('() => window.__vcRes')
        if res and res.get('ok'):
            total, chunk, parts = res['wavChars'], 4_000_000, []
            for i in range(0, total, chunk):
                parts.append(page.evaluate('([i, n]) => window.__vclock.wav.slice(i, i + n)', [i, chunk]))
            audio = work / 'audio.wav'
            audio.write_bytes(base64.b64decode(''.join(parts)))
        ctx.close()
    if not res or not res.get('ok'):
        raise RuntimeError(f'the broadcast did not run: {res}')
    t0, t1 = res['t0'] / 1000.0, res['t1'] / 1000.0
    log(f"captured {len(frames)} frames and {audio.stat().st_size // 1024} KB of sound over {t1 - t0:.1f} s in {time.time() - started:.0f} s; voice: {res.get('voice')} ({((res.get('voiceInfo') or {}).get('server') or {}).get('provider') or '?'}, no robot finish)")
    return {'work': work, 'frames': frames, 'audio': audio, 't0': t0, 't1': t1, 'voice': res.get('voice')}


def record(base: str, length: str, engine: str, visible: bool, out_dir: Path, rate: float = 1.1) -> dict:
    """LIVE (--live): Chrome's screencast in real time; the sound recorded from the page's audio bus."""
    from playwright.sync_api import sync_playwright
    stamp = datetime.now().strftime('%Y-%m-%d_%H%M')
    work = out_dir / stamp
    frames_dir = work / 'frames'
    frames_dir.mkdir(parents=True, exist_ok=True)
    frames: list[tuple[str, float]] = []
    with sync_playwright() as pw:
        ctx = launch(pw, visible)
        page = open_broadcast(ctx, base)
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
    ext = 'ogg' if 'ogg' in res['mime'] else 'wav' if 'wav' in res['mime'] else 'webm'
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
    mp4 = work / f"jarvis-{part_of_day(datetime.now().hour)}-{work.name[:10]}.mp4"
    vf = f'scale={W * DPR}:{H * DPR}:force_original_aspect_ratio=decrease,pad={W * DPR}:{H * DPR}:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p'
    cmd = [ff, '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', str(work / 'frames' / 'list.ffconcat'),
           '-i', str(cap['audio']), '-map', '0:v:0', '-map', '1:a:0', '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',   # veryfast: 2 min not 15 on the laptop (24 Nov 2026), same crf; YouTube re-encodes anyway
           '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-t', f'{secs:.3f}', '-movflags', '+faststart', str(mp4)]
    subprocess.run(cmd, check=True)
    # the voice must be on it: refuse a silent recording
    r = subprocess.run([ff, '-hide_banner', '-i', str(mp4), '-map', '0:a:0', '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True)
    db = max_volume(r.stderr)
    log(f'encoded {mp4.name}: {secs:.1f} s, loudest moment {db} dB')
    if is_silent(db):
        raise RuntimeError(f'the recording has no sound on it (loudest {db} dB): not uploading. Check the voice (H.E.L.I.X. OPTIONS / /api/jarvis/voice/info).')
    w = short_warning(secs) if H > W else None          # the 3-minute limit is for Shorts only
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
    ap.add_argument('--format', choices=['wide', 'short'], default='wide', help='wide (default): 1920x1080, the full programme, a normal video; short: 1080x1920 under 3 min, a YouTube Short')
    ap.add_argument('--len', choices=['short', 'quick', 'full'], default=None, help='the programme cut (default: quick for wide, short for a Short)')
    ap.add_argument('--voice', choices=['server', 'kokoro'], default='server', help='server (steady) or kokoro (open-source, needs a fast machine)')
    ap.add_argument('--rate', type=float, choices=[0.9, 1.0, 1.1, 1.15, 1.3], default=1.1, help='voice speed: 0.9 calm, 1 normal, 1.1 steady (default), 1.15 brisk, 1.3 fast')
    ap.add_argument('--live', action='store_true', help='record in real time (the old way; drops frames on a busy machine)')
    ap.add_argument('--frames', action='store_true', help='record frame by frame (the morning default)')
    ap.add_argument('--fps', type=int, choices=[24, 25, 30], default=30, help='frame-by-frame: frames per second (default 30)')
    ap.add_argument('--base', default=os.environ.get('JARVIS_SITE', BASE))
    ap.add_argument('--out', default=str(OUT))
    a = ap.parse_args()
    global W, H, DPR
    if a.format == 'short':
        W, H, DPR = SHORT_PAGE
    if a.len is None:
        a.len = 'short' if a.format == 'short' else 'quick'
    if a.login:
        return do_login(a.base)
    if a.youtube_auth:
        from youtube_upload import authorise
        authorise(interactive=True)
        print('YouTube sign-in saved.')
        return
    out_dir = Path(a.out)
    try:
        if a.live:
            cap = record(a.base, a.len, a.voice, a.show, out_dir, a.rate)
            mp4 = encode(cap)
        else:
            try:
                cap = record_frames(a.base, a.len, a.voice, a.show, out_dir, a.rate, a.fps)
                mp4 = encode(cap)
            except Exception as e:                  # a video beats none: fall back to the live recording
                log(f'frame-by-frame failed ({e}); recording live instead')
                a.live = True
                cap = record(a.base, a.len, a.voice, a.show, out_dir, a.rate)
                mp4 = encode(cap)
        result = {'ok': True, 'mode': 'live' if a.live else 'frames', 'file': str(mp4), 'seconds': round(cap['seconds'], 1), 'voice': cap['voice'], 'at': datetime.now().isoformat(timespec='seconds')}
        if not a.no_upload:
            from youtube_upload import upload
            today = datetime.now().date()
            part = part_of_day(datetime.now().hour)          # 07:00 -> the morning briefing, 21:00 -> the evening one (the page picks its programme by the same London clock)
            title = title_for(today, part) if a.format == 'short' else title_for(today, part).replace(' #Shorts', '')
            vid = upload(mp4, title, description_for(today, cap['voice'], cap['seconds'], part), privacy='unlisted')
            result.update({'videoId': vid, 'url': f'https://youtube.com/shorts/{vid}' if a.format == 'short' else f'https://youtu.be/{vid}', 'privacy': 'unlisted', 'format': a.format})
            log(f"uploaded (unlisted): {result['url']}")
        (out_dir / 'last_run.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
        keep_last(out_dir)
    except Exception as e:
        log(f'FAILED: {e}')
        (out_dir / 'last_run.json').write_text(json.dumps({'ok': False, 'error': str(e), 'at': datetime.now().isoformat(timespec='seconds')}, indent=2), encoding='utf-8')
        sys.exit(1)


if __name__ == '__main__':
    main()
